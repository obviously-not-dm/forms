import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "yaml";
import {
  getAllNotes,
  getNoteById,
  saveNote,
  deleteNote,
  getAllTests,
  getTestById,
  saveTest,
  deleteTest,
  getAttempts,
  saveAttempt,
  clearAttempts,
  getStats,
  clearStats,
  getAllColloquiumQuestions,
  getColloquiumQuestionById,
  saveColloquiumQuestion,
  deleteColloquiumQuestion,
} from "./db.mjs";
import { serializeTest, parseTest, serializeNote, parseNote, build } from "../compiler/builder.mjs";

const CONTENT = path.resolve("content");

const activeSessions = new Map();

export function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (!rc) return list;
  rc.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const key = parts.shift().trim();
    if (key) {
      try {
        list[key] = decodeURIComponent(parts.join("="));
      } catch {
        list[key] = parts.join("=");
      }
    }
  });
  return list;
}

export function getSession(req) {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization || "";
  const token = cookies.dm_admin_session || (authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null);
  if (!token) return null;
  const sess = activeSessions.get(token);
  if (!sess) return null;
  if (Date.now() - sess.createdAt > 30 * 24 * 3600 * 1000) {
    activeSessions.delete(token);
    return null;
  }
  return { token, ...sess };
}

export function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  });
  res.end(JSON.stringify(data));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function handleSaveTest(res, testId, body) {
  const existing = getTestById(testId);
  let rawMd = body.rawMd;
  let meta = body.meta || {};

  if (!rawMd && body.data) {
    try {
      rawMd = serializeTest(body.data);
      meta = body.data.meta || meta;
    } catch (err) {
      return sendJson(res, 400, { error: `Ошибка сериализации теста: ${err.message}` });
    }
  }

  if (typeof rawMd !== "string") {
    if (existing && existing.content) {
      rawMd = existing.content;
      meta = { ...(existing.meta || {}), ...meta };
    } else {
      return sendJson(res, 400, { error: "Поле rawMd или data обязательно" });
    }
  }

  if (body.hidden !== undefined) {
    meta.hidden = Boolean(body.hidden);
  }

  if (meta.hidden !== undefined && typeof rawMd === "string" && rawMd.startsWith("---")) {
    const end = rawMd.indexOf("\n---", 3);
    if (end !== -1) {
      try {
        const parsed = yaml.parse(rawMd.slice(3, end)) || {};
        parsed.hidden = meta.hidden;
        rawMd = `---\n${yaml.stringify(parsed).trim()}\n---` + rawMd.slice(end + 4);
      } catch {}
    }
  }

  const saved = saveTest(testId, {
    content: rawMd,
    keyJson: body.keyJson || null,
    meta: meta,
    diskSync: true,
    contentDir: CONTENT,
  });

  try {
    build();
  } catch (err) {
    return sendJson(res, 400, { error: `Ошибка валидации теста: ${err.message}` });
  }

  return sendJson(res, 200, { ok: true, id: saved.id, hidden: saved.hidden });
}

async function handleSaveNote(res, noteId, body) {
  const existing = getNoteById(noteId);
  let rawMd = body.rawMd;
  let meta = body.meta || {};

  if (typeof rawMd !== "string") {
    if (existing && existing.content) {
      rawMd = existing.content;
      meta = { ...(existing.meta || {}), ...meta };
    } else {
      return sendJson(res, 400, { error: "Поле rawMd обязательно" });
    }
  }

  if (body.hidden !== undefined) {
    meta.hidden = Boolean(body.hidden);
  }

  if (meta.hidden !== undefined && typeof rawMd === "string" && rawMd.startsWith("---")) {
    const end = rawMd.indexOf("\n---", 3);
    if (end !== -1) {
      try {
        const parsed = yaml.parse(rawMd.slice(3, end)) || {};
        parsed.hidden = meta.hidden;
        rawMd = `---\n${yaml.stringify(parsed).trim()}\n---` + rawMd.slice(end + 4);
      } catch {}
    }
  }

  const saved = saveNote(noteId, {
    content: rawMd,
    meta: meta,
    diskSync: true,
    contentDir: CONTENT,
  });

  try {
    build();
  } catch (err) {
    return sendJson(res, 400, { error: `Ошибка сборки конспекта: ${err.message}` });
  }

  return sendJson(res, 200, { ok: true, id: saved.id, hidden: saved.hidden });
}

export async function handleApi(req, res, pathname) {
  try {
    const normPath = String(pathname || "").split("?")[0].replace(/\/+$/, "") || "/";
    const method = String(req.method || "GET").toUpperCase();

    if (method === "OPTIONS") {
      return sendJson(res, 204, {});
    }

    // ----------------------------------------------------
    // AUTH API (LOGIN, SESSION, LOGOUT)
    // ----------------------------------------------------
    if (normPath === "/api/auth/login" && method === "POST") {
      const body = await readBody(req);
      const user = String(body.login || body.email || body.username || "").trim();
      const pass = String(body.password || "");

      const expectedUser = (process.env.ADMIN_USER || "admin@itmo.ru").trim();
      const expectedPass = String(process.env.ADMIN_PASSWORD || "admin");

      const isUserMatch =
        user.toLowerCase() === expectedUser.toLowerCase() ||
        (expectedUser.toLowerCase() === "admin@itmo.ru" && user.toLowerCase() === "admin");
      const isPassMatch = pass === expectedPass;

      if (!isUserMatch || !isPassMatch) {
        return sendJson(res, 401, { error: "Неверный логин или пароль администратора" });
      }

      const token = crypto.randomBytes(32).toString("hex");
      activeSessions.set(token, { user: expectedUser, role: "admin", createdAt: Date.now() });

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `dm_admin_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`,
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(JSON.stringify({ ok: true, token, user: { login: expectedUser, role: "admin" } }));
    }

    if (normPath === "/api/auth/session" && method === "GET") {
      const sess = getSession(req);
      if (!sess) {
        return sendJson(res, 200, { authenticated: false });
      }
      return sendJson(res, 200, { authenticated: true, user: { login: sess.user, role: sess.role } });
    }

    if (normPath === "/api/auth/logout" && (method === "POST" || method === "GET")) {
      const sess = getSession(req);
      if (sess) {
        activeSessions.delete(sess.token);
      }
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": "dm_admin_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0",
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(JSON.stringify({ ok: true }));
    }

    // ----------------------------------------------------
    // TESTS API
    // ----------------------------------------------------

    // GET /api/tests
    if (normPath === "/api/tests" && method === "GET") {
      const tests = getAllTests().map((t) => {
        let count = 0;
        try {
          const parsed = parseTest(t.id, t.content || null);
          count = parsed ? parsed.count : 0;
        } catch {}
        return {
          id: t.id,
          title: t.title,
          description: t.description,
          topic: t.topic,
          order: t.order,
          hidden: t.hidden,
          count,
        };
      });
      return sendJson(res, 200, tests);
    }

    // POST /api/tests or PUT /api/tests (create or save with id in body)
    if (normPath === "/api/tests" && (method === "POST" || method === "PUT")) {
      const body = await readBody(req);
      const targetId = (body.id || body.data?.id || "").trim();

      // If body has body.data or is updating an existing test:
      if (body.data || (targetId && method === "PUT")) {
        if (!targetId) {
          return sendJson(res, 400, { error: "ID теста обязателен в data.id или в теле запроса" });
        }
        return handleSaveTest(res, targetId, body);
      }

      // Otherwise create new test:
      const id = String(targetId || body.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      const title = String(body.title || "").trim();
      const topic = String(body.topic || "Общее").trim() || "Общее";

      if (!id || !title) {
        return sendJson(res, 400, { error: "ID и название теста обязательны" });
      }

      const defaultMd = `---
title: ${title}
topic: ${topic}
order: 10
---

# Блок 1. Основные вопросы

## 1
Укажите верное утверждение.

- (x) Вариант ответа А (верный)
- ( ) Вариант ответа Б
- ( ) Вариант ответа В

Пояснение: Разбор первого вопроса.
`;

      const saved = saveTest(id, {
        content: defaultMd,
        meta: { title, topic, order: 10 },
        diskSync: true,
        contentDir: CONTENT,
      });

      try {
        build();
      } catch (err) {
        console.error("Build error after test create:", err);
      }

      return sendJson(res, 200, { ok: true, id: saved.id });
    }

    const testMatch = normPath.match(/^\/api\/tests\/([^/?#]+)$/);
    if (testMatch) {
      const testId = decodeURIComponent(testMatch[1]).trim();

      // GET /api/tests/:id
      if (method === "GET") {
        const test = getTestById(testId);
        if (!test) return sendJson(res, 404, { error: `Тест «${testId}» не найден` });

        let sections = [];
        let meta = test.meta || {};
        try {
          const parsed = parseTest(testId, test.content || null);
          if (parsed) {
            meta = { ...parsed.meta, ...meta };
            sections = (parsed.sections || []).map((s) => ({
              title: s.title || "",
              questions: (s.questions || []).map((q) => {
                const textStr = Array.isArray(q.text) ? q.text.join("\n").trim() : String(q.text || "").trim();
                const explStr = Array.isArray(q.explanation) ? q.explanation.join("\n").trim() : String(q.explanation || "").trim();
                return {
                  id: q.id,
                  type: q.type || "single",
                  text: textStr,
                  options: (q.options || []).map((opt) => ({
                    md: opt.md || "",
                    correct: Boolean(opt.correct),
                    note: Array.isArray(opt.note) ? opt.note.join("\n").trim() : String(opt.note || "").trim(),
                  })),
                  answers: q.answers || [],
                  format: q.format || "",
                  hints: (q.hints || []).map((h) => (Array.isArray(h) ? h.join("\n").trim() : String(h || "").trim())),
                  explanation: explStr,
                };
              }),
            }));
          }
        } catch (e) {
          console.error(`Ошибка разбора теста ${testId}:`, e);
        }

        return sendJson(res, 200, {
          id: test.id,
          rawMd: test.content,
          meta,
          sections,
          keyJson: test.keyJson,
        });
      }

      // POST or PUT /api/tests/:id (save/update)
      if (method === "POST" || method === "PUT") {
        const body = await readBody(req);
        return handleSaveTest(res, testId, body);
      }

      // DELETE /api/tests/:id
      if (method === "DELETE") {
        deleteTest(testId, { diskSync: true, contentDir: CONTENT });
        try {
          build();
        } catch {}
        return sendJson(res, 200, { ok: true });
      }
    }

    // ----------------------------------------------------
    // NOTES API
    // ----------------------------------------------------

    // GET /api/notes
    if (normPath === "/api/notes" && method === "GET") {
      const notes = getAllNotes().map((n) => ({
        id: n.id,
        title: n.title,
        description: n.description,
        topic: n.topic,
        order: n.order,
        icon: n.icon,
        hidden: Boolean(n.hidden),
      }));
      return sendJson(res, 200, notes);
    }

    // POST /api/notes or PUT /api/notes (create or save)
    if (normPath === "/api/notes" && (method === "POST" || method === "PUT")) {
      const body = await readBody(req);
      const targetId = (body.id || "").trim();

      if (method === "PUT" && targetId && getNoteById(targetId)) {
        return handleSaveNote(res, targetId, body);
      }

      const id = String(targetId || "").toLowerCase().replace(/[^a-z0-9_-]/g, "-");
      const title = String(body.title || "").trim();
      const topic = String(body.topic || "Общее").trim() || "Общее";
      const icon = String(body.icon || "📄").trim();
      const order = Number(body.order) || 1;
      const description = String(body.description || "").trim();
      const hidden = Boolean(body.hidden);
      const rawMd = typeof body.rawMd === "string" ? body.rawMd : `---
title: ${title}
topic: ${topic}
order: ${order}
icon: "${icon}"
${hidden ? "hidden: true\n" : ""}description: "${description}"
---

# ${title}

Текст лекции и конспекта...
`;

      if (!id || !title) {
        return sendJson(res, 400, { error: "ID и название конспекта обязательны" });
      }

      const saved = saveNote(id, {
        content: rawMd,
        meta: { title, topic, order, icon, description, hidden },
        diskSync: true,
        contentDir: CONTENT,
      });

      try {
        build();
      } catch (err) {
        console.error("Build error after note create:", err);
      }

      return sendJson(res, 200, { ok: true, id: saved.id });
    }

    const noteUploadMatch = normPath.match(/^\/api\/notes\/([^/?#]+)\/upload$/);
    if (noteUploadMatch && method === "POST") {
      const noteId = decodeURIComponent(noteUploadMatch[1]).trim();
      const noteDir = path.join(CONTENT, "notes", noteId);
      if (!fs.existsSync(noteDir)) {
        fs.mkdirSync(noteDir, { recursive: true });
      }
      const body = await readBody(req);
      if (!body.filename || !body.data) {
        return sendJson(res, 400, { error: "Ожидаются filename и data (base64)" });
      }
      const safeName = path.basename(body.filename).replace(/[^a-zA-Z0-9._-]/g, "_");
      const base64Data = String(body.data).replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      fs.writeFileSync(path.join(noteDir, safeName), buffer);
      try {
        build();
      } catch {}
      return sendJson(res, 200, { ok: true, filename: safeName, url: safeName });
    }

    const noteMatch = normPath.match(/^\/api\/notes\/([^/?#]+)$/);
    if (noteMatch) {
      const noteId = decodeURIComponent(noteMatch[1]).trim();

      // GET /api/notes/:id
      if (method === "GET") {
        const note = getNoteById(noteId);
        if (!note) return sendJson(res, 404, { error: `Конспект «${noteId}» не найден` });
        return sendJson(res, 200, {
          id: note.id,
          rawMd: note.content,
          meta: note.meta,
          hidden: Boolean(note.hidden),
          updatedAt: note.updatedAt,
        });
      }

      // POST or PUT /api/notes/:id (save/update)
      if (method === "POST" || method === "PUT") {
        const body = await readBody(req);
        return handleSaveNote(res, noteId, body);
      }

      // DELETE /api/notes/:id
      if (method === "DELETE") {
        deleteNote(noteId, { diskSync: true, contentDir: CONTENT });
        try {
          build();
        } catch {}
        return sendJson(res, 200, { ok: true });
      }
    }

    // ----------------------------------------------------
    // COLLOQUIUMS API
    // ----------------------------------------------------

    // GET /api/colloquiums
    if (normPath === "/api/colloquiums" && method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const colId = url.searchParams.get("colloquium") || url.searchParams.get("colloquium_id");
      const questions = getAllColloquiumQuestions(colId);
      return sendJson(res, 200, questions);
    }

    // POST /api/colloquiums (create/save)
    if (normPath === "/api/colloquiums" && (method === "POST" || method === "PUT")) {
      const body = await readBody(req);
      if (!body.term || !body.definition) {
        return sendJson(res, 400, { error: "Поля term и definition обязательны" });
      }
      const saved = saveColloquiumQuestion(body, { diskSync: true, contentDir: CONTENT });
      try {
        build();
      } catch (err) {
        return sendJson(res, 400, { error: `Ошибка сборки: ${err.message}` });
      }
      return sendJson(res, 200, { ok: true, item: saved, id: saved.id });
    }

    const colMatch = normPath.match(/^\/api\/colloquiums\/([^/?#]+)$/);
    if (colMatch) {
      const questionId = decodeURIComponent(colMatch[1]).trim();

      // GET /api/colloquiums/:id
      if (method === "GET") {
        const item = getColloquiumQuestionById(questionId);
        if (!item) return sendJson(res, 404, { error: `Вопрос коллоквиума «${questionId}» не найден` });
        return sendJson(res, 200, item);
      }

      // PUT or POST /api/colloquiums/:id (update)
      if (method === "PUT" || method === "POST") {
        const body = await readBody(req);
        const itemData = { ...body, id: questionId };
        const saved = saveColloquiumQuestion(itemData, { diskSync: true, contentDir: CONTENT });
        try {
          build();
        } catch (err) {
          return sendJson(res, 400, { error: `Ошибка сборки: ${err.message}` });
        }
        return sendJson(res, 200, { ok: true, item: saved, id: saved.id });
      }

      // DELETE /api/colloquiums/:id
      if (method === "DELETE") {
        const deleted = deleteColloquiumQuestion(questionId, { diskSync: true, contentDir: CONTENT });
        if (!deleted) return sendJson(res, 404, { error: `Вопрос «${questionId}» не найден` });
        try {
          build();
        } catch {}
        return sendJson(res, 200, { ok: true });
      }
    }

    // ----------------------------------------------------
    // SYSTEM HEALTHCHECK API
    // ----------------------------------------------------
    if (normPath === "/api/health" && method === "GET") {
      const notes = getAllNotes();
      const tests = getAllTests();
      return sendJson(res, 200, {
        status: "ok",
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        notesCount: notes.length,
        testsCount: tests.length,
      });
    }

    // ----------------------------------------------------
    // STATS / ATTEMPTS API
    // ----------------------------------------------------

    // GET /api/attempts (and /api/stats)
    if ((normPath === "/api/attempts" || normPath === "/api/stats") && method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const quizId = url.searchParams.get("testId") || url.searchParams.get("quiz_id") || null;
      const since = url.searchParams.get("since") || null;
      const mode = url.searchParams.get("mode") || null;

      const attempts = getAttempts({ quizId, since, mode });
      return sendJson(res, 200, attempts);
    }

    // POST /api/attempts (and /api/stats/submit)
    if ((normPath === "/api/attempts" || normPath === "/api/stats/submit" || normPath === "/api/stats") && method === "POST") {
      const body = await readBody(req);
      const attempt = saveAttempt(body);
      return sendJson(res, 200, { ok: true, attempt, id: attempt.id });
    }

    // DELETE /api/attempts (and /api/stats)
    if ((normPath === "/api/attempts" || normPath === "/api/stats") && method === "DELETE") {
      const url = new URL(req.url, "http://localhost");
      let quizId = url.searchParams.get("testId") || url.searchParams.get("quiz_id");
      if (!quizId) {
        try {
          const body = await readBody(req);
          quizId = body.testId || body.quiz_id;
        } catch {}
      }
      clearAttempts(quizId);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { error: "API endpoint не найден" });
  } catch (err) {
    console.error("handleApi error:", err);
    return sendJson(res, 500, { error: `Внутренняя ошибка сервера: ${err.message}` });
  }
}
