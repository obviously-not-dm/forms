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
  createUser,
  getUserById,
  getUserByEmail,
  verifyUserCredentials,
  updateUserPassword,
  updateUserRating,
  getLeaderboard,
  getStudentProfile,
  createSession,
  getSessionByToken,
  deleteSessionByToken,
  createContest,
  getAllContests,
  getContestById,
  updateContestStatus,
  deleteContest,
  saveContestSubmission,
  getContestSubmissions,
  getUserContestSubmission,
  getAllPractices,
  getPracticeById,
  savePractice,
  deletePractice,
  getAllHomeworks,
  getHomeworkById,
  saveHomework,
  deleteHomework,
  saveHomeworkSubmission,
  getHomeworkSubmission,
  getHomeworkSubmissionById,
  getHomeworkSubmissions,
  getAllHomeworkSubmissions,
  reviewHomeworkSubmission,
} from "./db.mjs";
import { saveUploadedPdf, getPdfFilePath, isValidPdf } from "./storage.mjs";
import { serializeTest, parseTest, serializeNote, parseNote, build } from "../compiler/builder.mjs";
import { grade } from "../grade.js";

const CONTENT = path.resolve("content");

const activeSessions = new Map();

export function parseCookies(req) {
  const list = {};
  const rc = req?.headers?.cookie;
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
  if (!req) return null;
  const cookies = parseCookies(req);
  const authHeader = req?.headers?.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  // 1. If explicit Bearer token is provided, prioritize it
  if (bearer) {
    const mem = activeSessions.get(bearer);
    if (mem && Date.now() - mem.createdAt <= 30 * 24 * 3600 * 1000) {
      return {
        token: bearer,
        user: mem.user,
        role: mem.role,
        userId: "admin",
        userObj: { id: "admin", email: mem.user, name: "Преподаватель", role: "admin" },
      };
    }
    const dbSess = getSessionByToken(bearer);
    if (dbSess) {
      return {
        token: bearer,
        user: dbSess.user?.email || dbSess.user?.name || "Пользователь",
        role: dbSess.role || "student",
        userId: dbSess.user?.id,
        userObj: dbSess.user,
      };
    }
  }

  // 2. Check admin session cookie
  if (cookies.dm_admin_session) {
    const mem = activeSessions.get(cookies.dm_admin_session);
    if (mem && Date.now() - mem.createdAt <= 30 * 24 * 3600 * 1000) {
      return {
        token: cookies.dm_admin_session,
        user: mem.user,
        role: mem.role,
        userId: "admin",
        userObj: { id: "admin", email: mem.user, name: "Преподаватель", role: "admin" },
      };
    }
  }

  // 3. Check student session cookie
  if (cookies.dm_session) {
    const dbSess = getSessionByToken(cookies.dm_session);
    if (dbSess) {
      return {
        token: cookies.dm_session,
        user: dbSess.user?.email || dbSess.user?.name || "Пользователь",
        role: dbSess.role || "student",
        userId: dbSess.user?.id,
        userObj: dbSess.user,
      };
    }
    const mem = activeSessions.get(cookies.dm_session);
    if (mem && Date.now() - mem.createdAt <= 30 * 24 * 3600 * 1000) {
      return {
        token: cookies.dm_session,
        user: mem.user,
        role: mem.role,
        userId: "admin",
        userObj: { id: "admin", email: mem.user, name: "Преподаватель", role: "admin" },
      };
    }
  }

  return null;
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

export function readRawBuffer(req, maxBytes = 26 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Превышен максимальный размер файла (25 МБ)"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function parseMultipartPdf(buffer, boundary) {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let start = buffer.indexOf(boundaryBuffer);
  if (start === -1) return null;

  while (start !== -1) {
    const nextStart = buffer.indexOf(boundaryBuffer, start + boundaryBuffer.length);
    const part = nextStart === -1 ? buffer.subarray(start) : buffer.subarray(start, nextStart);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headerStr = part.subarray(0, headerEnd).toString("utf8");
      if (headerStr.includes('filename="') || headerStr.includes("filename*=")) {
        const match = headerStr.match(/filename=["']?([^"';\r\n]+)["']?/i);
        let filename = match ? match[1] : "solution.pdf";
        let fileContent = part.subarray(headerEnd + 4);
        if (fileContent.length >= 2 && fileContent.subarray(fileContent.length - 2).toString() === "\r\n") {
          fileContent = fileContent.subarray(0, fileContent.length - 2);
        }
        return { filename, buffer: fileContent };
      }
    }
    start = nextStart;
  }
  return null;
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
    // AUTH API (REGISTER, LOGIN, SESSION, LOGOUT)
    // ----------------------------------------------------
    if (normPath === "/api/auth/register" && method === "POST") {
      const body = await readBody(req);
      const email = String(body.email || "").trim();
      const password = String(body.password || "");
      const name = String(body.name || "").trim();
      const group = String(body.group || body.group_name || "").trim().toUpperCase();

      if (!email || !email.includes("@")) {
        return sendJson(res, 400, { error: "Введите корректный email адрес" });
      }
      if (!password || password.length < 4) {
        return sendJson(res, 400, { error: "Пароль должен содержать не менее 4 символов" });
      }
      if (!name || name.length < 2) {
        return sendJson(res, 400, { error: "Введите ваши имя и фамилию" });
      }

      try {
        const newUser = createUser({ email, password, name, group_name: group, role: "student" });
        const sess = createSession(newUser.id, "student");
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": `dm_session=${sess.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`,
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(JSON.stringify({ ok: true, token: sess.token, user: newUser }));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (normPath === "/api/auth/reset-password" && method === "POST") {
      const body = await readBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const newPassword = String(body.new_password || body.password || "");

      if (!email || !email.includes("@")) {
        return sendJson(res, 400, { error: "Введите корректный email адрес" });
      }
      if (!newPassword || newPassword.length < 4) {
        return sendJson(res, 400, { error: "Новый пароль должен содержать не менее 4 символов" });
      }

      try {
        const updatedUser = updateUserPassword(email, newPassword);
        const sess = createSession(updatedUser.id, "student");
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": `dm_session=${sess.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`,
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(JSON.stringify({ ok: true, message: "Пароль успешно изменён", token: sess.token, user: updatedUser }));
      } catch (err) {
        return sendJson(res, 400, { error: err.message });
      }
    }

    if (normPath === "/api/auth/login" && method === "POST") {
      const body = await readBody(req);
      const user = String(body.login || body.email || body.username || "").trim();
      const pass = String(body.password || "");

      // 1. Check admin login
      const expectedUser = (process.env.ADMIN_USER || "admin@itmo.ru").trim();
      const expectedPass = String(process.env.ADMIN_PASSWORD || "admin");

      const isUserMatch =
        user.toLowerCase() === expectedUser.toLowerCase() ||
        (expectedUser.toLowerCase() === "admin@itmo.ru" && user.toLowerCase() === "admin");
      const isPassMatch = pass === expectedPass;

      if (isUserMatch && isPassMatch) {
        const token = crypto.randomBytes(32).toString("hex");
        activeSessions.set(token, { user: expectedUser, role: "admin", createdAt: Date.now() });

        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": `dm_admin_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`,
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(JSON.stringify({
          ok: true,
          token,
          user: { login: expectedUser, role: "admin", name: "Преподаватель" },
        }));
      }

      // 2. Check student credentials in SQLite DB
      const dbUser = verifyUserCredentials(user, pass);
      if (dbUser) {
        const sess = createSession(dbUser.id, "student");
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": `dm_session=${sess.token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000`,
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(JSON.stringify({ ok: true, token: sess.token, user: dbUser }));
      }

      return sendJson(res, 401, { error: "Неверный логин или пароль" });
    }

    if ((normPath === "/api/auth/session" || normPath === "/api/auth/me") && method === "GET") {
      const sess = getSession(req);
      if (!sess) {
        return sendJson(res, 200, { authenticated: false });
      }
      return sendJson(res, 200, {
        authenticated: true,
        user: sess.userObj || { login: sess.user, role: sess.role },
      });
    }

    if (normPath === "/api/auth/logout" && (method === "POST" || method === "GET")) {
      const sess = getSession(req);
      if (sess) {
        activeSessions.delete(sess.token);
        deleteSessionByToken(sess.token);
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
      const sess = getSession(req);
      if (sess?.userId && !body.user_id) {
        body.user_id = sess.userId;
      }
      if (sess?.userObj?.group_name && !body.group_name) {
        body.group_name = sess.userObj.group_name;
      }
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

    // ----------------------------------------------------
    // STUDENT PROFILE & LEADERBOARD API
    // ----------------------------------------------------

    // GET /api/student/profile
    if (normPath === "/api/student/profile" && method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const sess = getSession(req);
      const targetUserId = url.searchParams.get("userId") || (sess?.userId !== "admin" ? sess?.userId : null);

      if (!targetUserId) {
        return sendJson(res, 401, { error: "Необходима авторизация студента" });
      }

      const profile = getStudentProfile(targetUserId);
      if (!profile) {
        return sendJson(res, 404, { error: "Студент не найден" });
      }
      return sendJson(res, 200, profile);
    }

    // GET /api/leaderboard
    if (normPath === "/api/leaderboard" && method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const group = url.searchParams.get("group") || null;
      const limit = Number(url.searchParams.get("limit") || 100);
      const rows = getLeaderboard({ group, limit });
      return sendJson(res, 200, rows);
    }

    // ----------------------------------------------------
    // CONTESTS API
    // ----------------------------------------------------

    // GET /api/contests
    if (normPath === "/api/contests" && method === "GET") {
      const url = new URL(req.url, "http://localhost");
      const group = url.searchParams.get("group") || null;
      const contests = getAllContests({ group_name: group });
      return sendJson(res, 200, contests);
    }

    // POST /api/admin/contests or POST /api/contests (admin create contest)
    if ((normPath === "/api/admin/contests" || normPath === "/api/contests") && method === "POST") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может создавать контесты" });
      }
      const body = await readBody(req);
      if (!body.title || !body.test_id) {
        return sendJson(res, 400, { error: "Укажите название и ID теста для контеста" });
      }
      const contest = createContest(body);
      return sendJson(res, 200, { ok: true, contest });
    }

    // Contests match by ID
    const contestStopMatch = normPath.match(/^\/api\/admin\/contests\/([^/?#]+)\/stop$/);
    if (contestStopMatch && (method === "PUT" || method === "POST")) {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может завершать контесты" });
      }
      const contestId = decodeURIComponent(contestStopMatch[1]).trim();
      const updated = updateContestStatus(contestId, "finished");
      return sendJson(res, 200, { ok: true, contest: updated });
    }

    const contestStandingsMatch = normPath.match(/^\/api\/contests\/([^/?#]+)\/standings$/);
    if (contestStandingsMatch && method === "GET") {
      const contestId = decodeURIComponent(contestStandingsMatch[1]).trim();
      const contest = getContestById(contestId);
      if (!contest) return sendJson(res, 404, { error: "Контест не найден" });
      const standings = getContestSubmissions(contestId);
      return sendJson(res, 200, { contest, standings });
    }

    const contestSubmitMatch = normPath.match(/^\/api\/contests\/([^/?#]+)\/submit$/);
    if (contestSubmitMatch && method === "POST") {
      const sess = getSession(req);
      const contestId = decodeURIComponent(contestSubmitMatch[1]).trim();
      const contest = getContestById(contestId);
      if (!contest) return sendJson(res, 404, { error: "Контест не найден" });

      if (contest.status === "finished") {
        return sendJson(res, 400, { error: "Время контеста истекло, приём работ завершён" });
      }

      const body = await readBody(req);
      const userId = sess?.userId || body.user_id || body.userId;
      const userName = sess?.userObj?.name || body.user_name || body.userName || "Студент";
      const groupName = sess?.userObj?.group_name || body.group_name || body.group || "";

      if (!userId) {
        return sendJson(res, 401, { error: "Для сдачи контеста необходимо войти в аккаунт" });
      }

      // Grade against key.json
      const keyPath = path.join(CONTENT, contest.test_id, "key.json");
      let score = 0;
      let maxScore = 0;
      let results = {};

      if (fs.existsSync(keyPath)) {
        try {
          const keyData = JSON.parse(fs.readFileSync(keyPath, "utf8"));
          const graded = grade(keyData.questions || [], body.answers || {});
          score = graded.score;
          maxScore = graded.max;
          results = graded.results;
        } catch (err) {
          console.warn("Grading error for contest submission:", err);
        }
      }

      const submission = saveContestSubmission({
        contest_id: contestId,
        user_id: userId,
        user_name: userName,
        group_name: groupName,
        score,
        max_score: maxScore,
        duration_sec: body.duration_sec || 0,
        answers: body.answers || {},
      });

      return sendJson(res, 200, { ok: true, submission, results });
    }

    const contestAdminMatch = normPath.match(/^\/api\/admin\/contests\/([^/?#]+)$/);
    if (contestAdminMatch && method === "DELETE") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может удалять контесты" });
      }
      const contestId = decodeURIComponent(contestAdminMatch[1]).trim();
      deleteContest(contestId);
      return sendJson(res, 200, { ok: true });
    }

    const contestMatch = normPath.match(/^\/api\/contests\/([^/?#]+)$/);
    if (contestMatch && method === "GET") {
      const contestId = decodeURIComponent(contestMatch[1]).trim();
      const contest = getContestById(contestId);
      if (!contest) return sendJson(res, 404, { error: "Контест не найден" });

      const test = getTestById(contest.test_id);
      let count = 0;
      try {
        const parsed = parseTest(contest.test_id);
        count = parsed ? parsed.count : 0;
      } catch {}

      return sendJson(res, 200, {
        ...contest,
        test_title: test?.title || contest.test_id,
        count,
      });
    }

    // ----------------------------------------------------
    // PRACTICES API
    // ----------------------------------------------------
    const parsedUrl = new URL(req.url, "http://localhost");
    const groupParam = parsedUrl.searchParams.get("group") || parsedUrl.searchParams.get("group_name");

    if (normPath === "/api/practices" && method === "GET") {
      const sess = getSession(req);
      const isTeacher = sess?.role === "admin" || sess?.role === "teacher";
      const studentGroup = sess?.userObj?.group_name;
      const targetGroup = groupParam || (!isTeacher ? studentGroup : null);
      const includeUnpublished = isTeacher && parsedUrl.searchParams.get("all") === "1";

      const practices = getAllPractices({ group: targetGroup, includeUnpublished: isTeacher });
      return sendJson(res, 200, { practices });
    }

    const practiceItemMatch = normPath.match(/^\/api\/practices\/([^/?#]+)$/);
    if (practiceItemMatch && method === "GET") {
      const practiceId = decodeURIComponent(practiceItemMatch[1]).trim();
      const practice = getPracticeById(practiceId);
      if (!practice) return sendJson(res, 404, { error: "Практика не найдена" });
      return sendJson(res, 200, { practice });
    }

    if (normPath === "/api/admin/practices" && method === "POST") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может создавать практики" });
      }
      const body = await readBody(req);
      const saved = savePractice(body);
      try { build(); } catch {}
      return sendJson(res, 200, { ok: true, practice: saved });
    }

    const practiceAdminItemMatch = normPath.match(/^\/api\/admin\/practices\/([^/?#]+)$/);
    if (practiceAdminItemMatch && method === "PUT") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может редактировать практики" });
      }
      const practiceId = decodeURIComponent(practiceAdminItemMatch[1]).trim();
      const body = await readBody(req);
      const saved = savePractice({ id: practiceId, ...body });
      try { build(); } catch {}
      return sendJson(res, 200, { ok: true, practice: saved });
    }

    if (practiceAdminItemMatch && method === "DELETE") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может удалять практики" });
      }
      const practiceId = decodeURIComponent(practiceAdminItemMatch[1]).trim();
      deletePractice(practiceId);
      try { build(); } catch {}
      return sendJson(res, 200, { ok: true });
    }

    // ----------------------------------------------------
    // HOMEWORKS API
    // ----------------------------------------------------
    if (normPath === "/api/homeworks" && method === "GET") {
      const sess = getSession(req);
      const isTeacher = sess?.role === "admin" || sess?.role === "teacher";
      const studentGroup = sess?.userObj?.group_name;
      const targetGroup = groupParam || (!isTeacher ? studentGroup : null);
      const userId = sess?.userId || sess?.userObj?.id || null;

      const homeworks = getAllHomeworks({ group: targetGroup, includeUnpublished: isTeacher, userId });
      return sendJson(res, 200, { homeworks });
    }

    const homeworkItemMatch = normPath.match(/^\/api\/homeworks\/([^/?#]+)$/);
    if (homeworkItemMatch && method === "GET") {
      const hwId = decodeURIComponent(homeworkItemMatch[1]).trim();
      const sess = getSession(req);
      const userId = sess?.userId || sess?.userObj?.id || null;
      const homework = getHomeworkById(hwId, userId);
      if (!homework) return sendJson(res, 404, { error: "Домашнее задание не найдено" });
      return sendJson(res, 200, { homework });
    }

    if (normPath === "/api/admin/homeworks" && method === "POST") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может создавать домашние задания" });
      }
      const body = await readBody(req);
      const saved = saveHomework(body);
      try { build(); } catch {}
      return sendJson(res, 200, { ok: true, homework: saved });
    }

    const homeworkAdminItemMatch = normPath.match(/^\/api\/admin\/homeworks\/([^/?#]+)$/);
    if (homeworkAdminItemMatch && method === "PUT") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может редактировать домашние задания" });
      }
      const hwId = decodeURIComponent(homeworkAdminItemMatch[1]).trim();
      const body = await readBody(req);
      const saved = saveHomework({ id: hwId, ...body });
      try { build(); } catch {}
      return sendJson(res, 200, { ok: true, homework: saved });
    }

    if (homeworkAdminItemMatch && method === "DELETE") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может удалять домашние задания" });
      }
      const hwId = decodeURIComponent(homeworkAdminItemMatch[1]).trim();
      deleteHomework(hwId);
      try { build(); } catch {}
      return sendJson(res, 200, { ok: true });
    }

    // ----------------------------------------------------
    // HOMEWORK SUBMISSIONS & PDF UPLOAD
    // ----------------------------------------------------
    const hwSubmitMatch = normPath.match(/^\/api\/homeworks\/([^/?#]+)\/submit$/);
    if (hwSubmitMatch && method === "POST") {
      const sess = getSession(req);
      if (!sess) {
        return sendJson(res, 401, { error: "Пожалуйста, войдите в систему для отправки домашнего задания" });
      }

      const hwId = decodeURIComponent(hwSubmitMatch[1]).trim();
      const hw = getHomeworkById(hwId);
      if (!hw) {
        return sendJson(res, 404, { error: "Домашнее задание не найдено" });
      }

      let pdfBuffer = null;
      let originalFilename = "solution.pdf";
      const ctype = String(req.headers["content-type"] || "");

      if (ctype.includes("multipart/form-data")) {
        const boundaryMatch = ctype.match(/boundary=([^;]+)/i);
        if (!boundaryMatch) {
          return sendJson(res, 400, { error: "Неверный multipart/form-data запрос: отсутствует boundary" });
        }
        const boundary = boundaryMatch[1].trim();
        const rawBuf = await readRawBuffer(req);
        const parsed = parseMultipartPdf(rawBuf, boundary);
        if (!parsed || !parsed.buffer) {
          return sendJson(res, 400, { error: "В запросе не найден файл PDF" });
        }
        pdfBuffer = parsed.buffer;
        originalFilename = parsed.filename;
      } else if (ctype.includes("application/pdf") || ctype.includes("application/octet-stream")) {
        pdfBuffer = await readRawBuffer(req);
        if (req.headers["x-filename"]) {
          try {
            originalFilename = decodeURIComponent(req.headers["x-filename"]);
          } catch {
            originalFilename = req.headers["x-filename"];
          }
        }
      } else {
        const body = await readBody(req);
        if (body.fileData) {
          const base64Data = String(body.fileData).replace(/^data:application\/pdf;base64,/, "");
          pdfBuffer = Buffer.from(base64Data, "base64");
          if (body.fileName) originalFilename = body.fileName;
        } else {
          return sendJson(res, 400, { error: "Ожидался PDF файл (multipart/form-data или application/pdf)" });
        }
      }

      if (!pdfBuffer || !isValidPdf(pdfBuffer)) {
        return sendJson(res, 400, { error: "Загруженный файл не является корректным PDF-документом" });
      }

      const uploadResult = await saveUploadedPdf(originalFilename, pdfBuffer);

      const userId = sess.userId || sess.userObj?.id || sess.user;
      const userName = sess.userObj?.name || sess.user || "Студент";
      const groupName = sess.userObj?.group_name || "";

      const submission = saveHomeworkSubmission({
        homework_id: hwId,
        user_id: userId,
        user_name: userName,
        group_name: groupName,
        file_name: uploadResult.originalName,
        file_path: uploadResult.filename,
        file_size: uploadResult.size,
      });

      return sendJson(res, 200, { ok: true, submission });
    }

    const hwOwnSubMatch = normPath.match(/^\/api\/homeworks\/([^/?#]+)\/submission$/);
    if (hwOwnSubMatch && method === "GET") {
      const sess = getSession(req);
      if (!sess) return sendJson(res, 401, { error: "Необходима авторизация" });
      const hwId = decodeURIComponent(hwOwnSubMatch[1]).trim();
      const userId = sess.userId || sess.userObj?.id;
      const submission = getHomeworkSubmission(hwId, userId);
      return sendJson(res, 200, { submission });
    }

    const hwAdminSubsMatch = normPath.match(/^\/api\/admin\/homeworks\/([^/?#]+)\/submissions$/);
    if (hwAdminSubsMatch && method === "GET") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может просматривать сданные работы" });
      }
      const hwId = decodeURIComponent(hwAdminSubsMatch[1]).trim();
      const submissions = getHomeworkSubmissions(hwId, { group_name: groupParam });
      return sendJson(res, 200, { submissions });
    }

    const hwReviewMatch = normPath.match(/^\/api\/admin\/homeworks\/submissions\/([^/?#]+)\/review$/);
    if (hwReviewMatch && method === "PUT") {
      const sess = getSession(req);
      if (sess?.role !== "admin") {
        return sendJson(res, 403, { error: "Только преподаватель может проверять работы" });
      }
      const subId = decodeURIComponent(hwReviewMatch[1]).trim();
      const body = await readBody(req);
      const reviewed = reviewHomeworkSubmission(subId, body);
      return sendJson(res, 200, { ok: true, submission: reviewed });
    }

    // ----------------------------------------------------
    // PDF UPLOADS SERVING
    // ----------------------------------------------------
    const uploadFileMatch = normPath.match(/^\/api\/uploads\/homeworks\/([^/?#]+)$/);
    if (uploadFileMatch && method === "GET") {
      const filename = decodeURIComponent(uploadFileMatch[1]).trim();
      const filePath = getPdfFilePath(filename);
      if (!filePath || !fs.existsSync(filePath)) {
        return sendJson(res, 404, { error: "PDF файл не найден" });
      }

      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": stat.size,
        "Content-Disposition": `inline; filename="${encodeURIComponent(path.basename(filePath))}"`,
        "Access-Control-Allow-Origin": "*",
      });
      if (typeof res.on === "function" && typeof res.emit === "function") {
        fs.createReadStream(filePath).pipe(res);
      } else {
        res.end(fs.readFileSync(filePath));
      }
      return;
    }

    return sendJson(res, 404, { error: "API endpoint не найден" });
  } catch (err) {
    console.error("handleApi error:", err);
    return sendJson(res, 500, { error: `Внутренняя ошибка сервера: ${err.message}` });
  }
}
