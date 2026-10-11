import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import {
  getDb,
  saveFeedback,
  getAllFeedback,
  updateFeedbackStatus,
  createConsultationRequest,
  getUserConsultationRequests,
  reviewConsultationRequest,
  saveQuestionBankItem,
  getAllQuestionBankItems,
  saveTypovik,
  getAllTypoviks,
  generateTypovikVariants,
  getTypovikVariant,
  saveTypovikSubmission,
  getTypovikSubmission,
  reviewTypovikSubmission,
  saveScheduleEvent,
  getAllScheduleEvents,
  saveStudentGrade,
  getGradesSpreadsheet,
  getAllGradeColumns,
  saveGradeColumn,
  deleteGradeColumn,
  createSession,
  saveHomeworkSubmission,
  reviewHomeworkSubmission,
} from "../src/server/db.mjs";
import { handleApi } from "../src/server/api.mjs";
import { authModalHtml } from "../src/compiler/templates.mjs";

const ROOT = path.resolve(".");

// Гарантируем наличие тестового студента usr_demo_1 в группе M3101
const db = getDb();
db.prepare(`
  INSERT OR REPLACE INTO users (id, email, password_hash, name, group_name, role, rating, created_at, updated_at)
  VALUES ('usr_demo_1', 'smirnov@itmo.ru', 'hash_demo', 'Александр Смирнов', 'M3101', 'student', 480, datetime('now'), datetime('now'))
`).run();

const makeRequest = (method, urlPath, body = null, headers = {}) => {
  return new Promise((resolve) => {
    const req = new http.IncomingMessage(null);
    req.method = method;
    req.url = urlPath;
    req.headers = { ...headers };

    let finished = false;
    const res = {
      statusCode: 200,
      headers: {},
      writeHead(code, head) {
        this.statusCode = code;
        this.headers = { ...this.headers, ...head };
      },
      end(data) {
        if (finished) return;
        finished = true;
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({ status: this.statusCode, headers: this.headers, body: json || data });
      },
      destroy() {},
    };

    if (body) {
      req.push(JSON.stringify(body));
    }
    req.push(null);

    handleApi(req, res, urlPath);
  });
};

test("1. Feedback System: submit, retrieve, and status update", () => {
  const fb = saveFeedback({
    user_id: "usr_test_1",
    user_name: "Иван Иванов",
    user_email: "ivan@itmo.ru",
    type: "feature",
    message: "Предлагаю добавить генерацию расписания в iCal",
  });

  assert.ok(fb.id, "Feedback must have an ID");
  assert.equal(fb.status, "new");
  assert.equal(fb.type, "feature");

  const all = getAllFeedback({ status: "new" });
  assert.ok(all.some((item) => item.id === fb.id), "Feedback must be in the 'new' list");

  const updated = updateFeedbackStatus(fb.id, "resolved");
  assert.equal(updated.status, "resolved");
});

test("2. Consultation Requests: create, get by user, review", () => {
  const req = createConsultationRequest({
    user_id: "usr_test_student",
    user_name: "Анна Петрова",
    group_name: "M3101",
    topic: "Критерий Поста",
    type: "consultation",
    preferred_time: "Среда 18:00",
    comment: "Хочу разобрать самодвойственные функции",
  });

  assert.ok(req.id);
  assert.equal(req.status, "pending");

  const userReqs = getUserConsultationRequests("usr_test_student");
  assert.ok(userReqs.some((r) => r.id === req.id));

  const reviewed = reviewConsultationRequest(req.id, {
    status: "approved",
    teacher_comment: "Хорошо, в ауд. 1404",
  });
  assert.equal(reviewed.status, "approved");
  assert.equal(reviewed.teacher_comment, "Хорошо, в ауд. 1404");
});

test("3. Typoviki & Question Bank: individual variant generator logic", () => {
  // 1. Создаем задачи в банке по 2 разным блокам
  saveQuestionBankItem({
    id: "qb_test_g1",
    block_id: "test_graphs",
    block_title: "Графы Тест",
    title: "Хроматическое число",
    content: "Найти $\\chi(G)$",
    max_score: 5,
  });
  saveQuestionBankItem({
    id: "qb_test_g2",
    block_id: "test_graphs",
    block_title: "Графы Тест",
    title: "Клика графа",
    content: "Найти размер клики $\\omega(G)$",
    max_score: 5,
  });
  saveQuestionBankItem({
    id: "qb_test_b1",
    block_id: "test_bool",
    block_title: "Булева логика Тест",
    title: "Полином Жегалкина",
    content: "Построить полином",
    max_score: 5,
  });

  // 2. Создаем типовик с блоками
  const typ = saveTypovik({
    id: "typ_test_1",
    title: "Тестовый типовик",
    topic: "Дискретные структуры",
    group_name: "all",
    deadline: "2026-12-01",
    max_score: 10,
    blocks_config: [
      { block_id: "test_graphs", questions_count: 1 },
      { block_id: "test_bool", questions_count: 1 },
    ],
  });

  assert.ok(typ.id);

  // 3. Запускаем генератор вариантов
  const genResult = generateTypovikVariants(typ.id);
  assert.ok(genResult.ok);
  assert.ok(genResult.generatedCount > 0, "Should generate variants for existing students");

  // 4. Проверяем сгенерированный вариант для одного из демо-студентов
  const variant = getTypovikVariant(typ.id, "usr_demo_1");
  assert.ok(variant, "Variant should exist for usr_demo_1");
  assert.equal(variant.questions.length, 2, "Variant must contain 1 question from each of the 2 blocks");
  assert.ok(variant.questions.some((q) => q.block_id === "test_graphs"));
  assert.ok(variant.questions.some((q) => q.block_id === "test_bool"));

  // 5. Проверяем процесс сдачи решения (submission) и проверку
  const sub = saveTypovikSubmission({
    typovik_id: typ.id,
    user_id: "usr_demo_1",
    user_name: "Александр Смирнов",
    group_name: "M3101",
    file_name: "typovik_solution.pdf",
    file_path: "demo_typ_sol.pdf",
    file_size: 1024,
  });

  assert.ok(sub.id);
  assert.equal(sub.status, "pending");

  const reviewed = reviewTypovikSubmission(sub.id, {
    status: "passed",
    score: 10,
    teacher_comment: "Отличное доказательство!",
  });
  assert.equal(reviewed.status, "passed");
  assert.equal(reviewed.score, 10);
});

test("4. Schedule & Events: event management and group filtering", () => {
  const ev = saveScheduleEvent({
    title: "Лекция по булевой логике",
    type: "lecture",
    starts_at: "2026-10-25T10:00:00.000Z",
    ends_at: "2026-10-25T11:30:00.000Z",
    location: "Ауд. 1404",
    groups: JSON.stringify(["M3101"]),
    teacher_name: "Поляков В.И.",
  });

  assert.ok(ev.id);

  // Filter by group M3101 -> Should include
  const forM3101 = getAllScheduleEvents({ group: "M3101" });
  assert.ok(forM3101.some((e) => e.id === ev.id));

  // Filter by group M3199 -> Should not include
  const forOther = getAllScheduleEvents({ group: "M3199" });
  assert.ok(!forOther.some((e) => e.id === ev.id));

  // Filter by teacher
  const forTeacher = getAllScheduleEvents({ teacher: "Поляков" });
  assert.ok(forTeacher.some((e) => e.id === ev.id));
});

test("5. Gradebook (Electronic Spreadsheet): student score and inline update", () => {
  saveStudentGrade({
    user_id: "usr_demo_1",
    group_name: "M3101",
    column_key: "test_1",
    score: 15,
    max_score: 15,
  });

  const sheet = getGradesSpreadsheet({ group: "M3101" });
  assert.ok(sheet.columns.length > 0);
  assert.ok(sheet.rows.length > 0);

  const studentRow = sheet.rows.find((r) => r.userId === "usr_demo_1");
  assert.ok(studentRow);
  assert.equal(studentRow.scores["test_1"], 15);
});

test("6. API Security & Role Restrictions: Student cannot perform Admin actions", async () => {
  // 1. Unauthenticated or student request to admin endpoints must be rejected (401 or 403)
  const res1 = await makeRequest("GET", "/api/admin/feedback");
  assert.equal(res1.status, 403, "Unauthenticated user must be 403 for admin feedback");

  const res2 = await makeRequest("POST", "/api/admin/schedule", { title: "Hacked lecture", starts_at: "2026-10-10" });
  assert.equal(res2.status, 403, "Unauthenticated user cannot create schedule");

  const res3 = await makeRequest("PUT", "/api/admin/grades", { user_id: "usr_demo_1", column_key: "test_1", score: 100 });
  assert.equal(res3.status, 403, "Unauthenticated user cannot edit student grades");

  // 2. Feedback submit by student/anonymous must be 200 OK AND persist in feedback table for teacher
  const uniqueMsg = `Тестовый отзыв от студента ${Date.now()}`;
  const res4 = await makeRequest("POST", "/api/feedback", { message: uniqueMsg, type: "general", name: "Иван Студент" });
  assert.equal(res4.status, 200, "Feedback submit should succeed");
  assert.ok(res4.body?.ok);
  assert.ok(res4.body?.feedback?.id, "POST /api/feedback must return saved feedback object with id");
  assert.equal(res4.body.feedback.message, uniqueMsg);
  const allFb = getAllFeedback();
  assert.ok(allFb.some((f) => f.message === uniqueMsg), "Saved feedback must appear in teacher getAllFeedback() list");

  // 3. Schedule public get should be 200 OK
  const res5 = await makeRequest("GET", "/api/schedule");
  assert.equal(res5.status, 200);
  assert.ok(Array.isArray(res5.body?.events));
});

test("7. 4 Canonical Typoviks (ТР-1 .. ТР-4) and Question Banks", () => {
  const typoviks = getAllTypoviks();
  assert.ok(typoviks.length >= 4, "Must contain all 4 canonical typoviks");

  const requiredIds = ["typ_1", "typ_2", "typ_3", "typ_4"];
  for (const id of requiredIds) {
    const found = typoviks.find((t) => t.id === id);
    assert.ok(found, `Typovik ${id} must exist in the database`);
    assert.ok(found.blocks_config.length >= 2, `${id} must have topic blocks configured`);

    // Verify each typovik has its own question bank items
    const bankItems = getAllQuestionBankItems({ typovik_id: id });
    assert.ok(bankItems.length >= 3, `Typovik ${id} must have question bank items`);
  }
});

test("8. Typovik Photo Submissions: multiple images support and review", () => {
  const photoSub = saveTypovikSubmission({
    typovik_id: "typ_1",
    user_id: "usr_demo_1",
    user_name: "Александр Смирнов",
    group_name: "M3101",
    file_name: "Фотографии решения (2 шт.)",
    file_path: "/api/uploads/images/photo_p1.png",
    file_size: 2048,
    file_type: "images",
    images: ["/api/uploads/images/photo_p1.png", "/api/uploads/images/photo_p2.png"],
  });

  assert.ok(photoSub.id);
  assert.equal(photoSub.file_type, "images");
  assert.equal(photoSub.images.length, 2);

  const fetched = getTypovikSubmission("typ_1", "usr_demo_1");
  assert.ok(fetched);
  assert.equal(fetched.file_type, "images");
  assert.ok(Array.isArray(fetched.images));
  assert.equal(fetched.images.length, 2);
  assert.equal(fetched.images[0], "/api/uploads/images/photo_p1.png");

  // Teacher review with positive grade
  const reviewed = reviewTypovikSubmission(photoSub.id, {
    status: "passed",
    score: 15,
    teacher_comment: "Четкие фотографии решений, зачтено!",
  });
  assert.equal(reviewed.status, "passed");
  assert.equal(reviewed.score, 15);
  assert.equal(reviewed.teacher_comment, "Четкие фотографии решений, зачтено!");
});

test("9. Gradebook dynamic columns CRUD and Formula Calculations", () => {
  // 1. Create a calculated column with SUM formula
  const colSum = saveGradeColumn({
    key: "test_formula_sum",
    title: "Тест Итог",
    max_score: 50,
    is_calculated: 1,
    formula: "SUM",
    order_index: 99,
  });
  assert.ok(colSum.id);
  assert.equal(colSum.is_calculated, 1);
  assert.equal(colSum.formula, "SUM");

  // 2. Create another custom regular column
  const colReg = saveGradeColumn({
    key: "test_col_custom",
    title: "Спецзадание",
    max_score: 10,
    is_calculated: 0,
    formula: "",
    order_index: 80,
  });
  assert.ok(colReg.id);

  // Set score for demo student
  saveStudentGrade({
    user_id: "usr_demo_1",
    group_name: "M3101",
    column_key: "test_col_custom",
    score: 8,
    max_score: 10,
  });

  // Verify recalculation in spreadsheet
  const sheet = getGradesSpreadsheet({ group: "M3101" });
  const demoRow = sheet.rows.find((r) => r.userId === "usr_demo_1");
  assert.ok(demoRow);
  assert.equal(demoRow.scores["test_col_custom"], 8);
  assert.ok(typeof demoRow.scores["test_formula_sum"] === "number");
  assert.ok(demoRow.scores["test_formula_sum"] >= 8, "SUM formula must compute the total of non-formula scores");

  // 3. Test AVG formula
  const colAvg = saveGradeColumn({
    key: "test_formula_avg",
    title: "Средний балл",
    max_score: 10,
    is_calculated: 1,
    formula: "AVG(test_col_custom)",
    order_index: 100,
  });
  const sheet2 = getGradesSpreadsheet({ group: "M3101" });
  const demoRow2 = sheet2.rows.find((r) => r.userId === "usr_demo_1");
  assert.equal(demoRow2.scores["test_formula_avg"], 8, "AVG(test_col_custom) should evaluate to 8");

  // 4. Cleanup test columns
  deleteGradeColumn(colSum.id);
  deleteGradeColumn(colReg.id);
  deleteGradeColumn(colAvg.id);

  const remaining = getAllGradeColumns();
  assert.ok(!remaining.some((c) => c.id === colSum.id));
  assert.ok(!remaining.some((c) => c.id === colReg.id));
});

test("10. Typovik Publication, Variant Generation & Strict RBAC", async () => {
  // Ensure users in different groups
  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, password_hash, name, group_name, role, rating, created_at, updated_at)
    VALUES ('usr_demo_other', 'other@itmo.ru', 'hash_demo', 'Студент Другой', 'M3102', 'student', 400, datetime('now'), datetime('now'))
  `).run();

  db.prepare(`
    INSERT OR REPLACE INTO users (id, email, password_hash, name, group_name, role, rating, created_at, updated_at)
    VALUES ('usr_admin_rbac', 'teacher@itmo.ru', 'hash_demo', 'Преподаватель Тест', 'TEACHERS', 'admin', 1000, datetime('now'), datetime('now'))
  `).run();

  const sessM3101 = createSession("usr_demo_1", "student");
  const sessM3102 = createSession("usr_demo_other", "student");
  const sessAdmin = createSession("usr_admin_rbac", "admin");

  // 1. Create unpublished typovik for M3101
  const typo = saveTypovik({
    title: "ТР-Тест Доступа",
    topic: "Проверка RBAC и публикации",
    group_name: "M3101",
    is_published: 0,
    max_score: 30,
    blocks_config: [
      { block_id: "test_graphs", questions_count: 1 }
    ],
  });
  assert.equal(typo.is_published, 0, "Typovik starts as unpublished draft");

  // 2. Unauthenticated request to /variant -> 401
  const resGuest = await makeRequest("GET", `/api/typoviks/${typo.id}/variant`);
  assert.equal(resGuest.status, 401, "Guest must be 401 Unauthorized");

  // 3. Unpublished draft returns 404 for students (does not leak existence of draft)
  const resUnpubStudent = await makeRequest("GET", `/api/typoviks/${typo.id}/variant`, null, {
    cookie: `dm_session=${sessM3101.token}`
  });
  assert.equal(resUnpubStudent.status, 404, "Student cannot see unpublished draft typovik (404)");

  // 4. Admin requesting unpublished typovik -> 200 OK
  const resAdmin = await makeRequest("GET", `/api/typoviks/${typo.id}/variant`, null, {
    cookie: `dm_session=${sessAdmin.token}`
  });
  assert.equal(resAdmin.status, 200, "Admin can preview unpublished typovik");

  // 5. Generate variants -> auto publishes typovik
  const generated = generateTypovikVariants(typo.id, "M3101");
  assert.ok(generated.ok);
  assert.ok(generated.generatedCount > 0, "Should generate variants for M3101 students");
  
  const allTypoviks = getAllTypoviks({ group: "M3101" });
  const publishedTypo = allTypoviks.find(t => t.id === typo.id);
  assert.ok(publishedTypo);
  assert.equal(publishedTypo.is_published, 1, "Generating variants must automatically publish typovik");

  // 6. Once published: Student from other group (M3102) -> 403 Forbidden
  const resOtherGroup = await makeRequest("GET", `/api/typoviks/${typo.id}/variant`, null, {
    cookie: `dm_session=${sessM3102.token}`
  });
  assert.equal(resOtherGroup.status, 403, "Student from other group must receive 403 Forbidden");

  // 7. Now student M3101 can access variant -> 200 OK
  const resPubStudent = await makeRequest("GET", `/api/typoviks/${typo.id}/variant`, null, {
    cookie: `dm_session=${sessM3101.token}`
  });
  assert.equal(resPubStudent.status, 200, "Student from M3101 can now access their published variant");
  assert.ok(resPubStudent.body?.variant);

  // 8. Upload RBAC:
  // Guest cannot upload (401)
  const resUploadGuest = await makeRequest("POST", `/api/typoviks/${typo.id}/upload`, { answer_text: "test" });
  assert.equal(resUploadGuest.status, 401, "Guest cannot upload solution");

  // Student from other group cannot upload (403)
  const resUploadOther = await makeRequest("POST", `/api/typoviks/${typo.id}/upload`, { answer_text: "test" }, {
    cookie: `dm_session=${sessM3102.token}`
  });
  assert.equal(resUploadOther.status, 403, "Student from other group cannot upload solution");
});

test("11. Homework & Typovik Gradebook Auto-Sync and Feedback Modal HTML Integrity", () => {
  // 1. Homework submission graded by teacher must automatically sync into gradebook column hw_1
  const hwSub = saveHomeworkSubmission({
    homework_id: "hw-1-relations",
    user_id: "usr_demo_1",
    user_name: "Александр Смирнов",
    group_name: "M3101",
    file_name: "hw1_solution.pdf",
    file_path: "/api/uploads/pdf/hw1_solution.pdf",
    file_size: 4096,
  });
  assert.ok(hwSub.id);

  const reviewedHw = reviewHomeworkSubmission(hwSub.id, {
    status: "passed",
    score: 19,
    teacher_comment: "Отличная работа по бинарным отношениям!",
  });
  assert.equal(reviewedHw.score, 19);

  // 2. Typovik submission graded by teacher must automatically sync into gradebook column typovik_2
  const typSub = saveTypovikSubmission({
    typovik_id: "typ_2",
    user_id: "usr_demo_1",
    user_name: "Александр Смирнов",
    group_name: "M3101",
    file_name: "typ2_solution.pdf",
    file_path: "/api/uploads/pdf/typ2_solution.pdf",
    file_size: 4096,
  });
  reviewTypovikSubmission(typSub.id, {
    status: "passed",
    score: 22,
    teacher_comment: "Булевы функции решены верно",
  });

  // 3. Verify Gradebook spreadsheet immediately reflects both hw_1 (19) and typovik_2 (22) and typovik_1 (15 from test 8)
  const sheet = getGradesSpreadsheet({ group: "M3101" });
  const studentRow = sheet.rows.find((r) => r.userId === "usr_demo_1");
  assert.ok(studentRow, "Student row must exist in gradebook");
  assert.equal(studentRow.scores["hw_1"], 19, "Graded homework hw-1-relations must sync to hw_1 in gradebook");
  assert.equal(studentRow.scores["typovik_1"], 15, "Graded typovik typ_1 must sync to typovik_1 in gradebook");
  assert.equal(studentRow.scores["typovik_2"], 22, "Graded typovik typ_2 must sync to typovik_2 in gradebook");

  // 4. Verify authModalHtml closes #auth-modal BEFORE #btn-floating-feedback and #feedback-modal
  const modalMarkup = authModalHtml();
  const authDialogCloseIdx = modalMarkup.indexOf("</dialog>");
  const floatingBtnIdx = modalMarkup.indexOf('id="btn-floating-feedback"');
  const feedbackDialogIdx = modalMarkup.indexOf('id="feedback-modal"');
  assert.ok(authDialogCloseIdx > 0 && floatingBtnIdx > authDialogCloseIdx && feedbackDialogIdx > authDialogCloseIdx);

  // Also ensure div open/close count before first </dialog> is balanced so HTML5 parser closes <dialog>
  const firstDialogChunk = modalMarkup.slice(0, authDialogCloseIdx);
  const openDivs = (firstDialogChunk.match(/<div\b/g) || []).length;
  const closeDivs = (firstDialogChunk.match(/<\/div>/g) || []).length;
  assert.equal(openDivs, closeDivs, "All <div> tags inside #auth-modal must be closed before </dialog>");
});


