import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(".");

test("build.mjs completes successfully and produces expected files", () => {
  const stdout = execFileSync("node", ["build.mjs"], { cwd: ROOT, encoding: "utf8" });
  assert.match(stdout, /Собрано:\s*\d+\s*тест/);

  assert.ok(fs.existsSync(path.join(ROOT, "dist", "index.html")));
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "admin.html")));
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "tests.json")));
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "assets", "style.css")));
});

test("all test topics in content/ have valid key.json and questions", () => {
  const topics = ["relations-1", "relations-2", "sets"];
  for (const topic of topics) {
    const keyPath = path.join(ROOT, "dist", topic, "key.json");
    assert.ok(fs.existsSync(keyPath), `Missing key.json for ${topic}`);
    const key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    assert.ok(key.questions.length > 0, `No questions found for ${topic}`);

    for (const q of key.questions) {
      assert.ok(q.id, `Question in ${topic} has no id`);
      assert.ok(["single", "multiple", "text"].includes(q.type), `Invalid type ${q.type} in ${topic} Q${q.id}`);
      assert.ok(q.answer !== undefined && q.answer !== null, `No answer in ${topic} Q${q.id}`);
      assert.ok(q.explanation, `No explanation in ${topic} Q${q.id}`);
    }
  }
});

test("admin.html contains topbar and no robots index", () => {
  const adminHtml = fs.readFileSync(path.join(ROOT, "dist", "admin.html"), "utf8");
  assert.ok(adminHtml.includes('class="topbar'), "admin.html should have a topbar");
  assert.ok(adminHtml.includes("Кабинет преподавателя"), "admin.html should have teacher cabinet header");
  assert.ok(adminHtml.includes('<meta name="robots" content="noindex">'), "admin.html should have noindex");
});

test("index.html is strictly isolated for students without admin links", () => {
  const indexHtml = fs.readFileSync(path.join(ROOT, "dist", "index.html"), "utf8");
  assert.ok(!indexHtml.includes('admin.html'), "index.html should NOT have a link to admin.html");
});

test("serializeTest serializes structured test object to valid Markdown", async () => {
  const { serializeTest, parseTest } = await import("../build.mjs");
  const model = {
    meta: {
      title: "Тестовый тест",
      description: "Тестовое описание",
      order: 10,
      hidden: true,
      feedback: "Вопрос отзыва",
    },
    sections: [
      {
        title: "Блок А",
        questions: [
          {
            id: "1",
            text: "Вопрос 1",
            type: "single",
            options: [
              { md: "Да", correct: true, note: "" },
              { md: "Нет", correct: false, note: "Неверно" },
            ],
            hints: ["Подсказка 1"],
            explanation: "Разбор 1",
          },
          {
            id: "2",
            text: "Вопрос 2",
            type: "text",
            format: "число",
            answers: ["42"],
            hints: [],
            explanation: "Разбор 2",
          },
        ],
      },
    ],
  };

  const md = serializeTest(model);
  assert.ok(md.includes("title: Тестовый тест"));
  assert.ok(md.includes("## 1"));
  assert.ok(md.includes("- (x) Да"));
  assert.ok(md.includes("Формат: число"));
  assert.ok(md.includes("Ответ: 42"));
});

test("notes build produces dist/notes/index.html, dist/notes.json and tabs on index.html", async () => {
  const { serializeNote, parseNote } = await import("../build.mjs");
  const noteModel = {
    meta: {
      title: "Проверка сериализации",
      topic: "Тест",
      order: 7,
      icon: "🧪",
      description: "Краткое описание",
    },
    rawMd: "# Заголовок конспекта\n\nТеорема с формулой $x \\in A$.",
  };
  const noteMd = serializeNote(noteModel);
  assert.ok(noteMd.includes('title: "Проверка сериализации"'));
  assert.ok(noteMd.includes('topic: "Тест"'));
  assert.ok(noteMd.includes("# Заголовок конспекта"));

  // Проверка сгенерированных файлов
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "notes", "index.html")), "dist/notes/index.html should exist");
  assert.ok(fs.existsSync(path.join(ROOT, "dist", "notes.json")), "dist/notes.json should exist");

  const notesJson = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "notes.json"), "utf8"));
  assert.ok(Array.isArray(notesJson) && notesJson.length >= 5, "notes.json should contain at least 5 notes");

  const notesHtml = fs.readFileSync(path.join(ROOT, "dist", "notes", "index.html"), "utf8");
  assert.ok(notesHtml.includes('class="notes-layout"'), "dist/notes/index.html should contain notes-layout");

  const indexHtml = fs.readFileSync(path.join(ROOT, "dist", "index.html"), "utf8");
  assert.ok(indexHtml.includes('href="notes/"'), "index.html should link to notes");
  assert.ok(indexHtml.includes('href="tests/"'), "index.html should link to tests");
  assert.ok(!indexHtml.includes('class="home-tabs-bar"'), "index.html should be clean without duplicate home-tabs-bar");
});

test("SQLite attempts repository correctly saves, filters, and clears attempts", async () => {
  const { saveAttempt, getAttempts, clearAttempts } = await import("../src/server/db.mjs");
  const testQuizId = "test-quiz-db-verify";

  // Clean any previous test data
  clearAttempts(testQuizId);

  // 1. Save attempt
  const saved = saveAttempt({
    quiz_id: testQuizId,
    group_name: "ИТМО M3100",
    mode: "exam",
    answers: { "1": "Да", "2": "42" },
    hints: { "1": 0, "2": 1 },
    score: 10,
    max_score: 10,
    feedback: "Отличный тест!",
    duration_sec: 120,
  });

  assert.ok(saved.id, "Attempt should have an ID");
  assert.strictEqual(saved.quiz_id, testQuizId);
  assert.strictEqual(saved.score, 10);

  // 2. Fetch attempts
  const attempts = getAttempts({ quizId: testQuizId });
  assert.strictEqual(attempts.length, 1);
  assert.strictEqual(attempts[0].group_name, "ИТМО M3100");
  assert.strictEqual(attempts[0].mode, "exam");
  assert.strictEqual(attempts[0].feedback, "Отличный тест!");
  assert.deepStrictEqual(attempts[0].answers, { "1": "Да", "2": "42" });

  // 3. Clear attempts
  clearAttempts(testQuizId);
  const afterClear = getAttempts({ quizId: testQuizId });
  assert.strictEqual(afterClear.length, 0);
});

test("Server REST API handles /api/health and /api/attempts", async () => {
  const { EventEmitter } = await import("node:events");
  const { handleApi } = await import("../src/server/api.mjs");

  function mockReqRes(method, urlStr, body = null) {
    const req = new EventEmitter();
    req.method = method;
    req.url = urlStr;
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(status, headers) {
        this.statusCode = status;
        this.headers = headers;
        return this;
      },
      end(data) {
        this.data = data;
        this.json = data ? JSON.parse(data) : null;
      },
    };
    Promise.resolve().then(() => {
      if (body) req.emit("data", JSON.stringify(body));
      req.emit("end");
    });
    return { req, res };
  }

  // GET /api/health
  const { req: r1, res: s1 } = mockReqRes("GET", "http://localhost/api/health");
  await handleApi(r1, s1, "/api/health");
  assert.strictEqual(s1.statusCode, 200);
  assert.strictEqual(s1.json.status, "ok");
  assert.ok(s1.json.notesCount >= 10);

  // POST /api/attempts
  const testQuizId = "test-api-suite";
  const { req: r2, res: s2 } = mockReqRes("POST", "http://localhost/api/attempts", {
    quiz_id: testQuizId,
    group_name: "Группа А",
    mode: "practice",
    score: 5,
    max_score: 5,
  });
  await handleApi(r2, s2, "/api/attempts");
  assert.strictEqual(s2.statusCode, 200);
  assert.strictEqual(s2.json.ok, true);

  // GET /api/attempts?testId=...
  const { req: r3, res: s3 } = mockReqRes("GET", `http://localhost/api/attempts?testId=${testQuizId}`);
  await handleApi(r3, s3, "/api/attempts");
  assert.strictEqual(s3.statusCode, 200);
  assert.strictEqual(s3.json.length, 1);
  assert.strictEqual(s3.json[0].quiz_id, testQuizId);

  // DELETE /api/attempts?testId=...
  const { req: r4, res: s4 } = mockReqRes("DELETE", `http://localhost/api/attempts?testId=${testQuizId}`);
  await handleApi(r4, s4, "/api/attempts");
  assert.strictEqual(s4.statusCode, 200);
  assert.strictEqual(s4.json.ok, true);
});

test("colloquiums build produces dist/colloquiums/index.html, dist/colloquiums.json with 106 questions and index tab", () => {
  const colHtmlPath = path.join(ROOT, "dist", "colloquiums", "index.html");
  const colJsonPath = path.join(ROOT, "dist", "colloquiums.json");
  const indexHtmlPath = path.join(ROOT, "dist", "index.html");

  assert.ok(fs.existsSync(colHtmlPath), "dist/colloquiums/index.html must exist");
  assert.ok(fs.existsSync(colJsonPath), "dist/colloquiums.json must exist");

  const jsonList = JSON.parse(fs.readFileSync(colJsonPath, "utf8"));
  assert.strictEqual(jsonList.length, 106, "Must contain exactly 106 questions (53 per colloquium)");

  const col1 = jsonList.filter((q) => Number(q.colloquium_id || q.colloquium) === 1);
  const col2 = jsonList.filter((q) => Number(q.colloquium_id || q.colloquium) === 2);
  assert.strictEqual(col1.length, 53, "Colloquium 1 must have 53 questions");
  assert.strictEqual(col2.length, 53, "Colloquium 2 must have 53 questions");

  for (const q of jsonList) {
    assert.ok(q.id, `Question missing id`);
    assert.ok(q.term, `Question ${q.id} missing term`);
    assert.ok(q.definition, `Question ${q.id} missing definition`);
    assert.ok(q.definitionHtml, `Question ${q.id} missing rendered definitionHtml`);
  }

  const colHtml = fs.readFileSync(colHtmlPath, "utf8");
  assert.ok(colHtml.includes("quizlet-card"), "Colloquiums page must include 3D quizlet-card component");
  assert.ok(colHtml.includes("dict-items-list"), "Colloquiums page must include dictionary accordion");

  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
  assert.ok(indexHtml.includes('href="colloquiums/"'), "Home page must link to colloquiums");
  assert.ok(indexHtml.includes("Коллоквиумы"), "Home page must feature colloquiums capability");
});

test("Server REST API handles /api/colloquiums CRUD", async () => {
  const { handleApi } = await import("../src/server/api.mjs");
  const { EventEmitter } = await import("node:events");

  function mockReqRes(method, urlStr, body = null) {
    const req = new EventEmitter();
    req.method = method;
    req.url = urlStr;
    const res = {
      writeHead(status, headers) {
        this.statusCode = status;
        this.headers = headers;
      },
      end(data) {
        this.data = data;
        this.json = data ? JSON.parse(data) : null;
      },
    };
    Promise.resolve().then(() => {
      if (body) req.emit("data", JSON.stringify(body));
      req.emit("end");
    });
    return { req, res };
  }

  // GET /api/colloquiums
  const { req: r1, res: s1 } = mockReqRes("GET", "http://localhost/api/colloquiums");
  await handleApi(r1, s1, "/api/colloquiums");
  assert.strictEqual(s1.statusCode, 200);
  assert.ok(Array.isArray(s1.json));
  assert.ok(s1.json.length >= 106);

  // POST /api/colloquiums (create question)
  const testId = "col1-test-item";
  const { req: r2, res: s2 } = mockReqRes("POST", "http://localhost/api/colloquiums", {
    id: testId,
    colloquium: 1,
    num: 99,
    term: "Тестовый термин",
    definition: "Тестовое определение $x \\in A$",
  });
  await handleApi(r2, s2, "/api/colloquiums");
  assert.strictEqual(s2.statusCode, 200);
  assert.strictEqual(s2.json.ok, true);

  // GET /api/colloquiums/:id
  const { req: r3, res: s3 } = mockReqRes("GET", `http://localhost/api/colloquiums/${testId}`);
  await handleApi(r3, s3, `/api/colloquiums/${testId}`);
  assert.strictEqual(s3.statusCode, 200);
  assert.strictEqual(s3.json.term, "Тестовый термин");

  // PUT /api/colloquiums/:id
  const { req: r4, res: s4 } = mockReqRes("PUT", `http://localhost/api/colloquiums/${testId}`, {
    term: "Обновленный термин",
    definition: "Обновленное определение",
  });
  await handleApi(r4, s4, `/api/colloquiums/${testId}`);
  assert.strictEqual(s4.statusCode, 200);

  // DELETE /api/colloquiums/:id
  const { req: r5, res: s5 } = mockReqRes("DELETE", `http://localhost/api/colloquiums/${testId}`);
  await handleApi(r5, s5, `/api/colloquiums/${testId}`);
  assert.strictEqual(s5.statusCode, 200);
  assert.strictEqual(s5.json.ok, true);
});

test("Server REST API handles /api/tests questions parsing and saving", async () => {
  const { handleApi } = await import("../src/server/api.mjs");
  const { EventEmitter } = await import("node:events");

  function mockReqRes(method, urlStr, body = null) {
    const u = new URL(urlStr);
    const req = new EventEmitter();
    req.method = method;
    req.url = u.pathname + u.search;
    req.headers = { host: "localhost" };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, h) {
        this.statusCode = code;
        Object.assign(this.headers, h);
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(data) {
        this.data = data;
        this.json = data ? JSON.parse(data) : null;
      },
    };
    Promise.resolve().then(() => {
      if (body) req.emit("data", JSON.stringify(body));
      req.emit("end");
    });
    return { req, res };
  }

  // 1. GET /api/tests/sets should return parsed sections with questions
  const { req: r1, res: s1 } = mockReqRes("GET", "http://localhost/api/tests/sets");
  await handleApi(r1, s1, "/api/tests/sets");
  assert.strictEqual(s1.statusCode, 200);
  assert.ok(Array.isArray(s1.json.sections), "sets must have sections array");
  assert.ok(s1.json.sections.length > 0, "sets must have at least 1 section");
  const totalQuestions = s1.json.sections.reduce((acc, s) => acc + s.questions.length, 0);
  assert.ok(totalQuestions >= 40, `sets must have questions loaded in sections (got ${totalQuestions})`);

  // 2. POST /api/tests creates a new test
  const tempTestId = "temp-integration-test";
  const { req: r2, res: s2 } = mockReqRes("POST", "http://localhost/api/tests", {
    id: tempTestId,
    title: "Временный тест",
    topic: "Тестирование",
  });
  await handleApi(r2, s2, "/api/tests");
  assert.strictEqual(s2.statusCode, 200);
  assert.strictEqual(s2.json.ok, true);

  // 3. PUT /api/tests/:id updates test using data model
  const { req: r3, res: s3 } = mockReqRes("PUT", `http://localhost/api/tests/${tempTestId}`, {
    data: {
      id: tempTestId,
      meta: { title: "Обновленный тест", topic: "Тестирование" },
      sections: [
        {
          title: "Блок 1",
          questions: [
            {
              id: "1",
              type: "single",
              text: "Вопрос проверки?",
              options: [
                { md: "Верно", correct: true, note: "" },
                { md: "Неверно", correct: false, note: "" },
              ],
              explanation: "Пояснение",
            },
          ],
        },
      ],
    },
  });
  await handleApi(r3, s3, `/api/tests/${tempTestId}`);
  assert.strictEqual(s3.statusCode, 200);
  assert.strictEqual(s3.json.ok, true);

  // 4. DELETE /api/tests/:id cleans up
  const { req: r4, res: s4 } = mockReqRes("DELETE", `http://localhost/api/tests/${tempTestId}`);
  await handleApi(r4, s4, `/api/tests/${tempTestId}`);
  assert.strictEqual(s4.statusCode, 200);
  assert.strictEqual(s4.json.ok, true);
});

test("Server REST API trailing slashes, collection PUT/POST, and query params work properly", async () => {
  const { handleApi } = await import("../src/server/api.mjs");
  const { EventEmitter } = await import("node:events");

  function mockReqRes(method, urlStr, body = null) {
    const u = new URL(urlStr);
    const req = new EventEmitter();
    req.method = method;
    req.url = u.pathname + u.search;
    req.headers = { host: "localhost" };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, h) {
        this.statusCode = code;
        Object.assign(this.headers, h);
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(data) {
        this.data = data;
        this.json = data ? JSON.parse(data) : null;
      },
    };
    Promise.resolve().then(() => {
      if (body) req.emit("data", JSON.stringify(body));
      req.emit("end");
    });
    return { req, res };
  }

  const testId = "edge-case-test";

  // 1. Create via POST /api/tests/ (with trailing slash)
  const { req: r1, res: s1 } = mockReqRes("POST", "http://localhost/api/tests/", {
    id: testId,
    title: "Тест с завершающим слэшем",
    topic: "Граничные случаи",
  });
  await handleApi(r1, s1, "/api/tests/");
  assert.strictEqual(s1.statusCode, 200);
  assert.strictEqual(s1.json.ok, true);

  // 2. Save via PUT /api/tests/${testId}/ (with trailing slash and query param)
  const { req: r2, res: s2 } = mockReqRes("PUT", `http://localhost/api/tests/${testId}/?v=123`, {
    rawMd: `---\ntitle: Тест с завершающим слэшем\ntopic: Граничные случаи\norder: 1\n---\n\n## 1\nВопрос?\n\n- (x) Да\n- ( ) Нет\n\nПояснение: Тест.`,
  });
  await handleApi(r2, s2, `/api/tests/${testId}/?v=123`);
  assert.strictEqual(s2.statusCode, 200);
  assert.strictEqual(s2.json.ok, true);

  // 3. Save via collection PUT /api/tests with body.data
  const { req: r3, res: s3 } = mockReqRes("PUT", "http://localhost/api/tests", {
    id: testId,
    data: {
      id: testId,
      meta: { title: "Обновлено через коллекцию", topic: "Граничные случаи" },
      sections: [
        {
          title: "Секция 1",
          questions: [
            {
              id: "1",
              type: "single",
              text: "Валидация коллекции",
              options: [
                { md: "Да", correct: true },
                { md: "Нет", correct: false },
              ],
              explanation: "Пояснение",
            },
          ],
        },
      ],
    },
  });
  await handleApi(r3, s3, "/api/tests");
  assert.strictEqual(s3.statusCode, 200);
  assert.strictEqual(s3.json.ok, true);

  // 4. Test OPTIONS preflight
  const { req: rOpt, res: sOpt } = mockReqRes("OPTIONS", `http://localhost/api/tests/${testId}`);
  await handleApi(rOpt, sOpt, `/api/tests/${testId}`);
  assert.strictEqual(sOpt.statusCode, 204);

  // 5. Clean up DELETE /api/tests/${testId}
  const { req: rDel, res: sDel } = mockReqRes("DELETE", `http://localhost/api/tests/${testId}`);
  await handleApi(rDel, sDel, `/api/tests/${testId}`);
  assert.strictEqual(sDel.statusCode, 200);
});

test("Server REST API healthcheck and 404 handler", async () => {
  const { handleApi } = await import("../src/server/api.mjs");
  const { EventEmitter } = await import("node:events");

  function mockReqRes(method, urlStr) {
    const u = new URL(urlStr);
    const req = new EventEmitter();
    req.method = method;
    req.url = u.pathname + u.search;
    req.headers = { host: "localhost" };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, h) {
        this.statusCode = code;
        Object.assign(this.headers, h);
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(data) {
        this.data = data;
        this.json = data ? JSON.parse(data) : null;
      },
    };
    Promise.resolve().then(() => req.emit("end"));
    return { req, res };
  }

  // Healthcheck
  const { req: rHealth, res: sHealth } = mockReqRes("GET", "http://localhost/api/health");
  await handleApi(rHealth, sHealth, "/api/health");
  assert.strictEqual(sHealth.statusCode, 200);
  assert.strictEqual(sHealth.json.status, "ok");
  assert.ok(typeof sHealth.json.testsCount === "number");
  assert.ok(typeof sHealth.json.notesCount === "number");

  // Unknown route
  const { req: r404, res: s404 } = mockReqRes("GET", "http://localhost/api/non-existent-endpoint");
  await handleApi(r404, s404, "/api/non-existent-endpoint");
  assert.strictEqual(s404.statusCode, 404);
  assert.strictEqual(s404.json.error, "API endpoint не найден");
});

test("hiding and unhiding tests, notes, and colloquiums works end-to-end", async () => {
  const { handleApi } = await import("../src/server/api.mjs");
  const { EventEmitter } = await import("node:events");

  function mockReqRes(method, urlStr, body = null) {
    const u = new URL(urlStr);
    const req = new EventEmitter();
    req.method = method;
    req.url = u.pathname + u.search;
    req.headers = { host: "localhost" };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, h) {
        this.statusCode = code;
        Object.assign(this.headers, h);
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(data) {
        this.data = data;
        this.json = data ? JSON.parse(data) : null;
      },
    };
    Promise.resolve().then(() => {
      if (body) req.emit("data", JSON.stringify(body));
      req.emit("end");
    });
    return { req, res };
  }

  const tempTestId = "test-hide-verify";
  const tempNoteId = "note-hide-verify";
  const tempColId = "col-hide-verify";

  // 1. Create entities
  const { req: rT1, res: sT1 } = mockReqRes("POST", "http://localhost/api/tests", {
    id: tempTestId,
    title: "Тест для проверки скрытия",
    topic: "Тестирование",
  });
  await handleApi(rT1, sT1, "/api/tests");
  assert.strictEqual(sT1.statusCode, 200);

  const { req: rN1, res: sN1 } = mockReqRes("POST", "http://localhost/api/notes", {
    id: tempNoteId,
    title: "Конспект для проверки скрытия",
    topic: "Тестирование",
  });
  await handleApi(rN1, sN1, "/api/notes");
  assert.strictEqual(sN1.statusCode, 200);

  const { req: rC1, res: sC1 } = mockReqRes("POST", "http://localhost/api/colloquiums", {
    id: tempColId,
    colloquium: 1,
    num: 99,
    term: "Скрываемый термин",
    definition: "Скрываемое определение",
  });
  await handleApi(rC1, sC1, "/api/colloquiums");
  assert.strictEqual(sC1.statusCode, 200);

  // 2. Hide all three
  const { req: rT2, res: sT2 } = mockReqRes("PUT", `http://localhost/api/tests/${tempTestId}`, { hidden: true });
  await handleApi(rT2, sT2, `/api/tests/${tempTestId}`);
  assert.strictEqual(sT2.statusCode, 200);
  assert.strictEqual(sT2.json.hidden, true);

  const { req: rN2, res: sN2 } = mockReqRes("PUT", `http://localhost/api/notes/${tempNoteId}`, { hidden: true });
  await handleApi(rN2, sN2, `/api/notes/${tempNoteId}`);
  assert.strictEqual(sN2.statusCode, 200);
  assert.strictEqual(sN2.json.hidden, true);

  const { req: rC2, res: sC2 } = mockReqRes("PUT", `http://localhost/api/colloquiums/${tempColId}`, {
    term: "Скрываемый термин",
    definition: "Скрываемое определение",
    hidden: true,
  });
  await handleApi(rC2, sC2, `/api/colloquiums/${tempColId}`);
  assert.strictEqual(sC2.statusCode, 200);

  // 3. Verify in compiled files that they are hidden
  const testsJson = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "tests.json"), "utf8"));
  const foundTest = testsJson.find((t) => t.id === tempTestId);
  assert.ok(foundTest && foundTest.hidden === true, "Test should be marked hidden in tests.json");

  const notesJson = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "notes.json"), "utf8"));
  const foundNote = notesJson.find((n) => n.id === tempNoteId);
  assert.ok(foundNote && foundNote.hidden === true, "Note should be marked hidden in notes.json");

  const colJson = JSON.parse(fs.readFileSync(path.join(ROOT, "dist", "colloquiums.json"), "utf8"));
  const foundCol = colJson.find((c) => c.id === tempColId);
  assert.ok(foundCol && foundCol.hidden === true, "Colloquium question should be marked hidden in colloquiums.json");

  const testsCatalogHtml = fs.readFileSync(path.join(ROOT, "dist", "tests", "index.html"), "utf8");
  assert.ok(!testsCatalogHtml.includes(`../${tempTestId}/`), "Hidden test must NOT appear in tests catalog");

  const notesCatalogHtml = fs.readFileSync(path.join(ROOT, "dist", "notes", "index.html"), "utf8");
  assert.ok(!notesCatalogHtml.includes(`"${tempNoteId}"`), "Hidden note must NOT appear in notes catalog");

  const colHtml = fs.readFileSync(path.join(ROOT, "dist", "colloquiums", "index.html"), "utf8");
  assert.ok(!colHtml.includes(`data-id="${tempColId}"`), "Hidden colloquium question must NOT appear in student dictionary");

  // 4. Unhide them
  const { req: rT3, res: sT3 } = mockReqRes("PUT", `http://localhost/api/tests/${tempTestId}`, { hidden: false });
  await handleApi(rT3, sT3, `/api/tests/${tempTestId}`);
  assert.strictEqual(sT3.statusCode, 200);

  const { req: rN3, res: sN3 } = mockReqRes("PUT", `http://localhost/api/notes/${tempNoteId}`, { hidden: false });
  await handleApi(rN3, sN3, `/api/notes/${tempNoteId}`);
  assert.strictEqual(sN3.statusCode, 200);

  const testsCatalogHtmlUnhidden = fs.readFileSync(path.join(ROOT, "dist", "tests", "index.html"), "utf8");
  assert.ok(testsCatalogHtmlUnhidden.includes(`../${tempTestId}/`), "Unhidden test should appear in tests catalog");

  const notesCatalogHtmlUnhidden = fs.readFileSync(path.join(ROOT, "dist", "notes", "index.html"), "utf8");
  assert.ok(notesCatalogHtmlUnhidden.includes(`"${tempNoteId}"`), "Unhidden note should appear in notes catalog");

  // 5. Cleanup
  const { req: rDelT, res: sDelT } = mockReqRes("DELETE", `http://localhost/api/tests/${tempTestId}`);
  await handleApi(rDelT, sDelT, `/api/tests/${tempTestId}`);

  const { req: rDelN, res: sDelN } = mockReqRes("DELETE", `http://localhost/api/notes/${tempNoteId}`);
  await handleApi(rDelN, sDelN, `/api/notes/${tempNoteId}`);

  const { req: rDelC, res: sDelC } = mockReqRes("DELETE", `http://localhost/api/colloquiums/${tempColId}`);
  await handleApi(rDelC, sDelC, `/api/colloquiums/${tempColId}`);
});

test("Server REST API handles /api/auth login, session, and logout flow", async () => {
  const { handleApi } = await import("../src/server/api.mjs");
  const { EventEmitter } = await import("node:events");

  function mockReqRes(method, urlStr, body = null, headers = {}) {
    const u = new URL(urlStr);
    const req = new EventEmitter();
    req.method = method;
    req.url = u.pathname + u.search;
    req.headers = { host: "localhost", ...headers };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, h) {
        this.statusCode = code;
        Object.assign(this.headers, h);
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(data) {
        this.data = data;
        this.json = data ? JSON.parse(data) : null;
      },
    };
    Promise.resolve().then(() => {
      if (body) req.emit("data", JSON.stringify(body));
      req.emit("end");
    });
    return { req, res };
  }

  // 1. Initial session should be unauthenticated
  const { req: rS1, res: sS1 } = mockReqRes("GET", "http://localhost/api/auth/session");
  await handleApi(rS1, sS1, "/api/auth/session");
  assert.strictEqual(sS1.statusCode, 200);
  assert.strictEqual(sS1.json.authenticated, false);

  // 2. Invalid credentials
  const { req: rL1, res: sL1 } = mockReqRes("POST", "http://localhost/api/auth/login", {
    login: "admin@itmo.ru",
    password: "wrongpassword",
  });
  await handleApi(rL1, sL1, "/api/auth/login");
  assert.strictEqual(sL1.statusCode, 401);
  assert.ok(sL1.json.error);

  // 3. Valid credentials
  const { req: rL2, res: sL2 } = mockReqRes("POST", "http://localhost/api/auth/login", {
    login: "admin@itmo.ru",
    password: "admin",
  });
  await handleApi(rL2, sL2, "/api/auth/login");
  assert.strictEqual(sL2.statusCode, 200);
  assert.strictEqual(sL2.json.ok, true);
  assert.ok(sL2.json.token);
  assert.ok(sL2.headers["Set-Cookie"].includes("dm_admin_session="));

  const sessionToken = sL2.json.token;

  // 4. Session check with cookie
  const { req: rS2, res: sS2 } = mockReqRes("GET", "http://localhost/api/auth/session", null, {
    cookie: `dm_admin_session=${sessionToken}`,
  });
  await handleApi(rS2, sS2, "/api/auth/session");
  assert.strictEqual(sS2.statusCode, 200);
  assert.strictEqual(sS2.json.authenticated, true);
  assert.strictEqual(sS2.json.user.role, "admin");

  // 5. Session check with Bearer header
  const { req: rS3, res: sS3 } = mockReqRes("GET", "http://localhost/api/auth/session", null, {
    authorization: `Bearer ${sessionToken}`,
  });
  await handleApi(rS3, sS3, "/api/auth/session");
  assert.strictEqual(sS3.statusCode, 200);
  assert.strictEqual(sS3.json.authenticated, true);

  // 6. Logout
  const { req: rOut, res: sOut } = mockReqRes("POST", "http://localhost/api/auth/logout", null, {
    cookie: `dm_admin_session=${sessionToken}`,
  });
  await handleApi(rOut, sOut, "/api/auth/logout");
  assert.strictEqual(sOut.statusCode, 200);
  assert.strictEqual(sOut.json.ok, true);

  // 7. Session after logout is unauthenticated
  const { req: rS4, res: sS4 } = mockReqRes("GET", "http://localhost/api/auth/session", null, {
    cookie: `dm_admin_session=${sessionToken}`,
  });
  await handleApi(rS4, sS4, "/api/auth/session");
  assert.strictEqual(sS4.statusCode, 200);
  assert.strictEqual(sS4.json.authenticated, false);
});

test("Platform: student auth, profile, rating, leaderboard, and contest flow", async () => {
  const { handleApi } = await import("../src/server/api.mjs");
  const { EventEmitter } = await import("node:events");

  function mockReqRes(method, urlStr, body = null, headers = {}) {
    const u = new URL(urlStr);
    const req = new EventEmitter();
    req.method = method;
    req.url = u.pathname + u.search;
    req.headers = { host: "localhost", ...headers };
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, h) {
        this.statusCode = code;
        Object.assign(this.headers, h);
      },
      setHeader(k, v) {
        this.headers[k] = v;
      },
      end(data) {
        this.data = data;
        this.json = data ? JSON.parse(data) : null;
      },
    };
    Promise.resolve().then(() => {
      if (body) req.emit("data", JSON.stringify(body));
      req.emit("end");
    });
    return { req, res };
  }

  const randomSuffix = Math.random().toString(36).slice(2, 6);
  const studentEmail = `ivan_${randomSuffix}@itmo.ru`;
  const studentPassword = "secretpassword";
  const studentName = "Иван Иванов";
  const studentGroup = "M3115";

  // 1. Student Registration
  const { req: rReg, res: sReg } = mockReqRes("POST", "http://localhost/api/auth/register", {
    email: studentEmail,
    password: studentPassword,
    name: studentName,
    group: studentGroup,
  });
  await handleApi(rReg, sReg, "/api/auth/register");
  assert.strictEqual(sReg.statusCode, 200);
  assert.strictEqual(sReg.json.ok, true);
  assert.ok(sReg.json.token);
  assert.strictEqual(sReg.json.user.name, studentName);
  assert.strictEqual(sReg.json.user.group_name, studentGroup);

  const studentToken = sReg.json.token;
  const studentId = sReg.json.user.id;

  // 2. Student Profile Check
  const { req: rProf, res: sProf } = mockReqRes("GET", "http://localhost/api/student/profile", null, {
    cookie: `dm_session=${studentToken}`,
  });
  await handleApi(rProf, sProf, "/api/student/profile");
  assert.strictEqual(sProf.statusCode, 200);
  assert.strictEqual(sProf.json.user.id, studentId);
  assert.ok(Array.isArray(sProf.json.topic_progress));
  assert.strictEqual(sProf.json.user.rating, 0);

  // 3. Student solves test (saves attempt with session)
  const { req: rAtt, res: sAtt } = mockReqRes("POST", "http://localhost/api/attempts", {
    quiz_id: "01-sets",
    score: 10,
    max_score: 10,
    mode: "exam",
    duration_sec: 120,
  }, {
    cookie: `dm_session=${studentToken}`,
  });
  await handleApi(rAtt, sAtt, "/api/attempts");
  assert.strictEqual(sAtt.statusCode, 200);
  assert.strictEqual(sAtt.json.ok, true);
  assert.strictEqual(sAtt.json.attempt.user_id, studentId);

  // 4. Check that rating was updated in profile
  const { req: rProf2, res: sProf2 } = mockReqRes("GET", `http://localhost/api/student/profile?userId=${studentId}`);
  await handleApi(rProf2, sProf2, "/api/student/profile");
  assert.strictEqual(sProf2.statusCode, 200);
  assert.strictEqual(sProf2.json.user.rating, 100); // 100% on test = 100 pts

  // 5. Leaderboard contains student
  const { req: rLead, res: sLead } = mockReqRes("GET", "http://localhost/api/leaderboard?group=M3115");
  await handleApi(rLead, sLead, "/api/leaderboard");
  assert.strictEqual(sLead.statusCode, 200);
  assert.ok(Array.isArray(sLead.json));
  const foundInLeaderboard = sLead.json.find((u) => u.id === studentId);
  assert.ok(foundInLeaderboard);
  assert.strictEqual(foundInLeaderboard.rating, 100);

  // 6. Admin creates a contest
  const { req: rAdmLog, res: sAdmLog } = mockReqRes("POST", "http://localhost/api/auth/login", {
    login: "admin@itmo.ru",
    password: "admin",
  });
  await handleApi(rAdmLog, sAdmLog, "/api/auth/login");
  const adminToken = sAdmLog.json.token;

  const { req: rCntCreate, res: sCntCreate } = mockReqRes("POST", "http://localhost/api/admin/contests", {
    title: "Летучка на паре: Множества",
    test_id: "01-sets",
    group_name: "M3115",
    duration_minutes: 10,
  }, {
    cookie: `dm_admin_session=${adminToken}`,
  });
  await handleApi(rCntCreate, sCntCreate, "/api/admin/contests");
  assert.strictEqual(sCntCreate.statusCode, 200);
  assert.ok(sCntCreate.json.contest.id);
  const contestId = sCntCreate.json.contest.id;

  // 7. Student lists contests and retrieves contest details
  const { req: rCntList, res: sCntList } = mockReqRes("GET", "http://localhost/api/contests?group=M3115");
  await handleApi(rCntList, sCntList, "/api/contests");
  assert.strictEqual(sCntList.statusCode, 200);
  assert.ok(sCntList.json.some((c) => c.id === contestId));

  const { req: rCntGet, res: sCntGet } = mockReqRes("GET", `http://localhost/api/contests/${contestId}`);
  await handleApi(rCntGet, sCntGet, `/api/contests/${contestId}`);
  assert.strictEqual(sCntGet.statusCode, 200);
  assert.strictEqual(sCntGet.json.title, "Летучка на паре: Множества");

  // 8. Student submits contest answers
  const { req: rCntSub, res: sCntSub } = mockReqRes("POST", `http://localhost/api/contests/${contestId}/submit`, {
    answers: { "01": 0 },
    duration_sec: 180,
  }, {
    cookie: `dm_session=${studentToken}`,
  });
  await handleApi(rCntSub, sCntSub, `/api/contests/${contestId}/submit`);
  assert.strictEqual(sCntSub.statusCode, 200);
  assert.strictEqual(sCntSub.json.ok, true);

  // 9. Check standings for contest
  const { req: rStand, res: sStand } = mockReqRes("GET", `http://localhost/api/contests/${contestId}/standings`);
  await handleApi(rStand, sStand, `/api/contests/${contestId}/standings`);
  assert.strictEqual(sStand.statusCode, 200);
  assert.ok(sStand.json.standings.some((s) => s.user_id === studentId));

  // 10. Admin stops contest
  const { req: rStop, res: sStop } = mockReqRes("PUT", `http://localhost/api/admin/contests/${contestId}/stop`, null, {
    cookie: `dm_admin_session=${adminToken}`,
  });
  await handleApi(rStop, sStop, `/api/admin/contests/${contestId}/stop`);
  assert.strictEqual(sStop.statusCode, 200);
  assert.strictEqual(sStop.json.contest.status, "finished");
});

test("tests catalog, custom test runner, and question pool are correctly generated", async () => {
  const testsIndexFile = path.resolve("dist/tests/index.html");
  const customTestFile = path.resolve("dist/tests/custom.html");
  const poolFile = path.resolve("dist/pool.json");
  const poolTestsFile = path.resolve("dist/tests/pool.json");

  assert.ok(fs.existsSync(testsIndexFile), "dist/tests/index.html must exist");
  assert.ok(fs.existsSync(customTestFile), "dist/tests/custom.html must exist");
  assert.ok(fs.existsSync(poolFile), "dist/pool.json must exist");
  assert.ok(fs.existsSync(poolTestsFile), "dist/tests/pool.json must exist");

  const catalogHtml = fs.readFileSync(testsIndexFile, "utf8");
  assert.ok(catalogHtml.includes("tests-catalog-grid"), "Catalog page must contain tests catalog grid");
  assert.ok(catalogHtml.includes("test-generator-card"), "Catalog page must contain generator card");
  assert.ok(catalogHtml.includes("tests-catalog.js"), "Catalog page must include tests-catalog.js");

  const customHtml = fs.readFileSync(customTestFile, "utf8");
  assert.ok(customHtml.includes("custom-test-runner.js"), "Custom test page must include custom runner script");
  assert.ok(customHtml.includes("custom-questions-wrap"), "Custom test page must have question container");

  const pool = JSON.parse(fs.readFileSync(poolFile, "utf8"));
  assert.ok(Array.isArray(pool), "dist/pool.json must be an array");
  assert.ok(pool.length >= 350, `Pool must contain 350+ questions, got ${pool.length}`);
  assert.ok(pool[0].testId && pool[0].id && pool[0].type, "Question must have testId, id, type");

  // Verify uniform capability buttons and teacher tab in index.html
  const indexHtml = fs.readFileSync(path.resolve("dist/index.html"), "utf8");
  assert.ok(indexHtml.includes('<a href="tests/" class="btn quiet btn-sm">Открыть тренажёры →</a>'), "Card 1 button must be btn quiet btn-sm");
  assert.ok(indexHtml.includes('data-tab="teacher"'), "Auth modal must have teacher tab");
  assert.ok(indexHtml.includes('id="auth-teacher-form"'), "Auth modal must have teacher login form");
  assert.ok(!indexHtml.includes("admin.html"), "index.html must not contain static link to admin.html");
});










