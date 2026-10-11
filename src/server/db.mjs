import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "yaml";

const DATA_DIR = path.resolve("data");
const DB_PATH = path.join(DATA_DIR, "db.sqlite");

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
    dbInstance.exec("PRAGMA busy_timeout = 5000;");
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      order_index INTEGER DEFAULT 0,
      topic TEXT,
      title TEXT,
      icon TEXT,
      description TEXT,
      hidden INTEGER DEFAULT 0,
      content TEXT,
      meta TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tests (
      id TEXT PRIMARY KEY,
      order_index INTEGER DEFAULT 0,
      topic TEXT,
      title TEXT,
      description TEXT,
      hidden INTEGER DEFAULT 0,
      content TEXT,
      key_json TEXT,
      meta TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_notes_order ON notes(order_index);
    CREATE INDEX IF NOT EXISTS idx_tests_order ON tests(order_index);
  `);

  const noteCols = db.prepare("PRAGMA table_info(notes)").all().map((c) => c.name);
  if (!noteCols.includes("hidden")) {
    db.exec("ALTER TABLE notes ADD COLUMN hidden INTEGER DEFAULT 0;");
  }

  // Ensure attempts table exists and has the expected columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT,
      group_name TEXT,
      mode TEXT DEFAULT 'exam',
      answers TEXT,
      hints TEXT,
      score REAL DEFAULT 0,
      max_score REAL DEFAULT 0,
      feedback TEXT,
      duration_sec INTEGER DEFAULT 0,
      created_at TEXT
    );
  `);

  const attemptCols = db.prepare("PRAGMA table_info(attempts)").all().map((c) => c.name);
  if (!attemptCols.includes("quiz_id")) {
    db.exec(`
      DROP TABLE IF EXISTS attempts;
      CREATE TABLE attempts (
        id TEXT PRIMARY KEY,
        quiz_id TEXT,
        user_id TEXT,
        group_name TEXT,
        mode TEXT DEFAULT 'exam',
        answers TEXT,
        hints TEXT,
        score REAL DEFAULT 0,
        max_score REAL DEFAULT 0,
        feedback TEXT,
        duration_sec INTEGER DEFAULT 0,
        created_at TEXT
      );
    `);
  } else if (!attemptCols.includes("user_id")) {
    db.exec("ALTER TABLE attempts ADD COLUMN user_id TEXT;");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts(quiz_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts(created_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password_hash TEXT,
      name TEXT,
      group_name TEXT,
      role TEXT DEFAULT 'student',
      rating INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT,
      role TEXT,
      expires_at TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contests (
      id TEXT PRIMARY KEY,
      title TEXT,
      test_id TEXT,
      group_name TEXT,
      duration_minutes INTEGER DEFAULT 15,
      starts_at TEXT,
      ends_at TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS contest_submissions (
      id TEXT PRIMARY KEY,
      contest_id TEXT,
      user_id TEXT,
      user_name TEXT,
      group_name TEXT,
      score REAL DEFAULT 0,
      max_score REAL DEFAULT 0,
      percentage REAL DEFAULT 0,
      duration_sec INTEGER DEFAULT 0,
      answers TEXT,
      created_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_group ON users(group_name);
    CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_contests_status ON contests(status);
    CREATE INDEX IF NOT EXISTS idx_submissions_contest ON contest_submissions(contest_id);
    CREATE INDEX IF NOT EXISTS idx_submissions_user ON contest_submissions(user_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS colloquiums (
      id TEXT PRIMARY KEY,
      colloquium_id INTEGER DEFAULT 1,
      num INTEGER DEFAULT 1,
      term TEXT,
      definition TEXT,
      examples TEXT,
      hidden INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_colloquiums_col_num ON colloquiums(colloquium_id, num);
  `);

  const colCols = db.prepare("PRAGMA table_info(colloquiums)").all().map((c) => c.name);
  if (!colCols.includes("hidden")) {
    db.exec("ALTER TABLE colloquiums ADD COLUMN hidden INTEGER DEFAULT 0;");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS practices (
      id TEXT PRIMARY KEY,
      order_index INTEGER DEFAULT 0,
      topic TEXT,
      title TEXT,
      group_name TEXT DEFAULT 'all',
      is_published INTEGER DEFAULT 1,
      content TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_practices_order ON practices(order_index);
    CREATE INDEX IF NOT EXISTS idx_practices_group ON practices(group_name);
    CREATE INDEX IF NOT EXISTS idx_practices_published ON practices(is_published);

    CREATE TABLE IF NOT EXISTS homeworks (
      id TEXT PRIMARY KEY,
      order_index INTEGER DEFAULT 0,
      topic TEXT,
      title TEXT,
      group_name TEXT DEFAULT 'all',
      deadline TEXT,
      max_score REAL DEFAULT 10,
      is_published INTEGER DEFAULT 1,
      content TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_homeworks_order ON homeworks(order_index);
    CREATE INDEX IF NOT EXISTS idx_homeworks_group ON homeworks(group_name);
    CREATE INDEX IF NOT EXISTS idx_homeworks_published ON homeworks(is_published);

    CREATE TABLE IF NOT EXISTS homework_submissions (
      id TEXT PRIMARY KEY,
      homework_id TEXT,
      user_id TEXT,
      user_name TEXT,
      group_name TEXT,
      file_name TEXT,
      file_path TEXT,
      file_size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      score REAL DEFAULT 0,
      teacher_comment TEXT DEFAULT '',
      submitted_at TEXT,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hw_subs_hw ON homework_submissions(homework_id);
    CREATE INDEX IF NOT EXISTS idx_hw_subs_user ON homework_submissions(user_id);
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      user_email TEXT,
      type TEXT DEFAULT 'general',
      message TEXT,
      status TEXT DEFAULT 'new',
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

    CREATE TABLE IF NOT EXISTS consultation_requests (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      user_email TEXT,
      group_name TEXT,
      topic TEXT,
      type TEXT DEFAULT 'consultation',
      preferred_time TEXT,
      comment TEXT,
      status TEXT DEFAULT 'pending',
      teacher_comment TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_consult_status ON consultation_requests(status);
    CREATE INDEX IF NOT EXISTS idx_consult_user ON consultation_requests(user_id);
    CREATE INDEX IF NOT EXISTS idx_consult_created ON consultation_requests(created_at DESC);

    CREATE TABLE IF NOT EXISTS question_bank (
      id TEXT PRIMARY KEY,
      block_id TEXT,
      block_title TEXT,
      title TEXT,
      content TEXT,
      order_index INTEGER DEFAULT 0,
      max_score REAL DEFAULT 5,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_qbank_block ON question_bank(block_id);
    CREATE INDEX IF NOT EXISTS idx_qbank_order ON question_bank(order_index);

    CREATE TABLE IF NOT EXISTS typoviks (
      id TEXT PRIMARY KEY,
      title TEXT,
      topic TEXT,
      group_name TEXT DEFAULT 'all',
      deadline TEXT,
      max_score REAL DEFAULT 20,
      blocks_config TEXT,
      is_published INTEGER DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_typoviks_pub ON typoviks(is_published);

    CREATE TABLE IF NOT EXISTS typovik_variants (
      id TEXT PRIMARY KEY,
      typovik_id TEXT,
      user_id TEXT,
      user_name TEXT,
      group_name TEXT,
      variant_num INTEGER DEFAULT 1,
      questions TEXT,
      created_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_typ_var_unique ON typovik_variants(typovik_id, user_id);

    CREATE TABLE IF NOT EXISTS typovik_submissions (
      id TEXT PRIMARY KEY,
      typovik_id TEXT,
      user_id TEXT,
      user_name TEXT,
      group_name TEXT,
      file_name TEXT,
      file_path TEXT,
      file_size INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      score REAL DEFAULT 0,
      teacher_comment TEXT DEFAULT '',
      submitted_at TEXT,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_typ_subs_typ ON typovik_submissions(typovik_id);
    CREATE INDEX IF NOT EXISTS idx_typ_subs_user ON typovik_submissions(user_id);

    CREATE TABLE IF NOT EXISTS schedule_events (
      id TEXT PRIMARY KEY,
      title TEXT,
      type TEXT DEFAULT 'lecture',
      starts_at TEXT,
      ends_at TEXT,
      location TEXT,
      groups TEXT DEFAULT 'all',
      teacher_name TEXT,
      description TEXT,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sched_starts ON schedule_events(starts_at);

    CREATE TABLE IF NOT EXISTS student_grades (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      group_name TEXT,
      column_key TEXT,
      score REAL DEFAULT 0,
      max_score REAL DEFAULT 10,
      notes TEXT DEFAULT '',
      updated_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_grades_user_col ON student_grades(user_id, column_key);
    CREATE INDEX IF NOT EXISTS idx_grades_group ON student_grades(group_name);

    CREATE TABLE IF NOT EXISTS gradebook_columns (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE,
      title TEXT,
      max_score REAL DEFAULT 10,
      formula TEXT DEFAULT '',
      is_calculated INTEGER DEFAULT 0,
      order_index INTEGER DEFAULT 0,
      created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_grd_cols_order ON gradebook_columns(order_index);
  `);

  // Миграции новых колонок
  try {
    db.exec("ALTER TABLE question_bank ADD COLUMN typovik_id TEXT DEFAULT 'typ_1'");
  } catch {}
  try {
    db.exec("ALTER TABLE typovik_submissions ADD COLUMN file_type TEXT DEFAULT 'pdf'");
  } catch {}
  try {
    db.exec("ALTER TABLE typovik_submissions ADD COLUMN images TEXT DEFAULT '[]'");
  } catch {}

  // Нормализация групп: замена кириллической 'М' на латинскую 'M'
  try {
    db.exec(`
      UPDATE users SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE attempts SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE contests SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE contest_submissions SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE practices SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE homeworks SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE homework_submissions SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE typoviks SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE typovik_variants SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE typovik_submissions SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE consultation_requests SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
      UPDATE student_grades SET group_name = REPLACE(REPLACE(group_name, 'М', 'M'), 'м', 'M') WHERE group_name LIKE '%М%' OR group_name LIKE '%м%';
    `);
  } catch {}

  seedColloquiumsIfEmpty(db);
  seedPlatformDemoData(db);
  seedNewFeaturesDemoData(db);
}

export function normalizeGroupName(group) {
  if (!group) return "";
  return String(group)
    .trim()
    .replace(/(^|\s)[\u041c\u043c]([0-9]{3,})/g, "$1M$2");
}

// ==========================================
// NOTES REPOSITORY
// ==========================================

export function getAllNotes() {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM notes ORDER BY order_index ASC, id ASC");
  const rows = stmt.all();
  return rows.map((r) => {
    const meta = r.meta ? JSON.parse(r.meta) : {};
    const isHidden = Boolean(r.hidden || meta.hidden);
    return {
      id: r.id,
      order: r.order_index,
      topic: r.topic || "Общее",
      title: r.title || r.id,
      icon: r.icon || "📄",
      description: r.description || "",
      hidden: isHidden,
      content: r.content || "",
      meta: { ...meta, hidden: isHidden },
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export function getNoteById(id) {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM notes WHERE id = ?");
  const r = stmt.get(id);
  if (!r) return null;
  const meta = r.meta ? JSON.parse(r.meta) : {};
  const isHidden = Boolean(r.hidden || meta.hidden);
  return {
    id: r.id,
    order: r.order_index,
    topic: r.topic || "Общее",
    title: r.title || r.id,
    icon: r.icon || "📄",
    description: r.description || "",
    hidden: isHidden,
    content: r.content || "",
    meta: { ...meta, hidden: isHidden },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function saveNote(id, { content, meta = {}, diskSync = true, contentDir = "content" }) {
  const db = getDb();
  const now = new Date().toISOString();

  // Extract frontmatter meta if present in markdown content
  let bodyContent = content;
  let mergedMeta = { ...meta };
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    try {
      const parsedYaml = yaml.parse(fmMatch[1]) || {};
      mergedMeta = { ...parsedYaml, ...meta };
      bodyContent = fmMatch[2];
    } catch {}
  }

  const orderIndex = mergedMeta.order != null ? Number(mergedMeta.order) : 999;
  const topic = mergedMeta.topic || "Общее";
  const title = mergedMeta.title || id;
  const icon = mergedMeta.icon || "📄";
  const description = mergedMeta.description || "";
  const hidden = Boolean(mergedMeta.hidden) ? 1 : 0;
  mergedMeta.hidden = Boolean(hidden);

  const existing = getNoteById(id);
  const createdAt = existing ? existing.createdAt : now;

  const stmt = db.prepare(`
    INSERT INTO notes (id, order_index, topic, title, icon, description, hidden, content, meta, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      order_index = excluded.order_index,
      topic = excluded.topic,
      title = excluded.title,
      icon = excluded.icon,
      description = excluded.description,
      hidden = excluded.hidden,
      content = excluded.content,
      meta = excluded.meta,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    id,
    orderIndex,
    topic,
    title,
    icon,
    description,
    hidden,
    content, // save full raw content with frontmatter
    JSON.stringify(mergedMeta),
    createdAt,
    now
  );

  // Synchronize to disk for git version control and backup
  if (diskSync) {
    const targetDir = path.join(contentDir, "notes", id);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "note.md"), content, "utf8");
  }

  return getNoteById(id);
}

export function deleteNote(id, { diskSync = true, contentDir = "content" } = {}) {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM notes WHERE id = ?");
  stmt.run(id);

  if (diskSync) {
    const targetDir = path.join(contentDir, "notes", id);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  }
}

// ==========================================
// TESTS REPOSITORY
// ==========================================

export function getAllTests() {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM tests ORDER BY order_index ASC, id ASC");
  const rows = stmt.all();
  return rows.map((r) => ({
    id: r.id,
    order: r.order_index,
    topic: r.topic || "Общее",
    title: r.title || r.id,
    description: r.description || "",
    hidden: Boolean(r.hidden),
    content: r.content || "",
    keyJson: r.key_json ? JSON.parse(r.key_json) : null,
    meta: r.meta ? JSON.parse(r.meta) : {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getTestById(id) {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM tests WHERE id = ?");
  const r = stmt.get(id);
  if (!r) return null;
  return {
    id: r.id,
    order: r.order_index,
    topic: r.topic || "Общее",
    title: r.title || r.id,
    description: r.description || "",
    hidden: Boolean(r.hidden),
    content: r.content || "",
    keyJson: r.key_json ? JSON.parse(r.key_json) : null,
    meta: r.meta ? JSON.parse(r.meta) : {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function saveTest(id, { content, keyJson = null, meta = {}, diskSync = true, contentDir = "content" }) {
  const db = getDb();
  const now = new Date().toISOString();

  let mergedMeta = { ...meta };
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    try {
      const parsedYaml = yaml.parse(fmMatch[1]) || {};
      mergedMeta = { ...parsedYaml, ...meta };
    } catch {}
  }

  const orderIndex = mergedMeta.order != null ? Number(mergedMeta.order) : 999;
  const topic = mergedMeta.topic || "Общее";
  const title = mergedMeta.title || id;
  const description = mergedMeta.description || "";
  const hidden = mergedMeta.hidden ? 1 : 0;

  const existing = getTestById(id);
  const createdAt = existing ? existing.createdAt : now;

  const stmt = db.prepare(`
    INSERT INTO tests (id, order_index, topic, title, description, hidden, content, key_json, meta, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      order_index = excluded.order_index,
      topic = excluded.topic,
      title = excluded.title,
      description = excluded.description,
      hidden = excluded.hidden,
      content = excluded.content,
      key_json = excluded.key_json,
      meta = excluded.meta,
      updated_at = excluded.updated_at
  `);

  stmt.run(
    id,
    orderIndex,
    topic,
    title,
    description,
    hidden,
    content,
    keyJson ? JSON.stringify(keyJson) : null,
    JSON.stringify(mergedMeta),
    createdAt,
    now
  );

  if (diskSync) {
    const targetDir = path.join(contentDir, id);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "test.md"), content, "utf8");
    if (keyJson) {
      fs.writeFileSync(path.join(targetDir, "key.json"), JSON.stringify(keyJson, null, 2), "utf8");
    }
  }

  return getTestById(id);
}

export function deleteTest(id, { diskSync = true, contentDir = "content" } = {}) {
  const db = getDb();
  db.prepare("DELETE FROM tests WHERE id = ?").run(id);
  db.prepare("DELETE FROM attempts WHERE quiz_id = ?").run(id);

  if (diskSync) {
    const targetDir = path.join(contentDir, id);
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
  }
}

// ==========================================
// ATTEMPTS / STATISTICS REPOSITORY
// ==========================================

export function saveAttempt({
  id = null,
  quiz_id = null,
  testId = null,
  test_id = null,
  user_id = null,
  userId = null,
  group_name = null,
  userName = null,
  user_name = null,
  mode = "exam",
  answers = {},
  hints = {},
  score = 0,
  max_score = 0,
  maxScore = 0,
  feedback = null,
  duration_sec = 0,
  created_at = null,
}) {
  const db = getDb();
  const attemptId = id || `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const quizId = quiz_id || testId || test_id || "";
  const finalUserId = user_id || userId || null;
  const group = normalizeGroupName(group_name || userName || user_name || null);
  const finalScore = Number(score || 0);
  const finalMaxScore = Number(max_score || maxScore || 0);
  const now = created_at || new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO attempts (id, quiz_id, user_id, group_name, mode, answers, hints, score, max_score, feedback, duration_sec, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    attemptId,
    quizId,
    finalUserId,
    group,
    mode || "exam",
    typeof answers === "string" ? answers : JSON.stringify(answers || {}),
    typeof hints === "string" ? hints : JSON.stringify(hints || {}),
    finalScore,
    finalMaxScore,
    feedback ? String(feedback).trim() : null,
    Number(duration_sec || 0),
    now
  );

  if (feedback && String(feedback).trim() && mode !== "feedback") {
    try {
      const userObj = finalUserId ? getUserById(finalUserId) : null;
      const prefix = quizId ? `[Тренажёр: ${quizId}] ` : "";
      saveFeedback({
        user_id: finalUserId || null,
        user_name: userObj?.name || userName || user_name || "Студент",
        user_email: userObj?.email || "",
        type: "general",
        message: `${prefix}${String(feedback).trim()}`,
      });
    } catch {}
  }

  if (finalUserId) {
    try {
      updateUserRating(finalUserId);
    } catch (e) {
      console.warn("Failed to update user rating:", e);
    }
  }

  return {
    id: attemptId,
    quiz_id: quizId,
    user_id: finalUserId,
    group_name: group,
    mode: mode || "exam",
    answers: typeof answers === "string" ? JSON.parse(answers) : answers,
    hints: typeof hints === "string" ? JSON.parse(hints) : hints,
    score: finalScore,
    max_score: finalMaxScore,
    feedback,
    duration_sec: Number(duration_sec || 0),
    created_at: now,
  };
}

export function saveAttemptFeedback({ id = null, quiz_id = null, user_id = null, feedback = "" }) {
  const db = getDb();
  const text = String(feedback || "").trim();
  if (!text) return null;

  try {
    const userObj = user_id ? getUserById(user_id) : null;
    const prefix = quiz_id ? `[Тренажёр: ${quiz_id}] ` : "";
    saveFeedback({
      user_id: user_id || null,
      user_name: userObj?.name || "Студент",
      user_email: userObj?.email || "",
      type: "general",
      message: `${prefix}${text}`,
    });
  } catch {}

  if (id) {
    db.prepare(`UPDATE attempts SET feedback = ? WHERE id = ?`).run(text, id);
    return db.prepare(`SELECT * FROM attempts WHERE id = ?`).get(id);
  }

  let row = null;
  if (user_id && quiz_id) {
    row = db.prepare(`SELECT id FROM attempts WHERE user_id = ? AND quiz_id = ? ORDER BY created_at DESC LIMIT 1`).get(user_id, quiz_id);
  } else if (quiz_id) {
    row = db.prepare(`SELECT id FROM attempts WHERE quiz_id = ? ORDER BY created_at DESC LIMIT 1`).get(quiz_id);
  }

  if (row) {
    db.prepare(`UPDATE attempts SET feedback = ? WHERE id = ?`).run(text, row.id);
    return db.prepare(`SELECT * FROM attempts WHERE id = ?`).get(row.id);
  }

  return saveAttempt({
    quiz_id: quiz_id || "general",
    user_id,
    feedback: text,
    mode: "feedback",
    score: 0,
    max_score: 0,
  });
}

export function getAttempts({ quizId = null, testId = null, userId = null, since = null, mode = null } = {}) {
  const db = getDb();
  const targetId = quizId || testId;
  let query = "SELECT * FROM attempts WHERE 1=1";
  const params = [];

  if (targetId) {
    query += " AND quiz_id = ?";
    params.push(targetId);
  }
  if (userId) {
    query += " AND user_id = ?";
    params.push(userId);
  }
  if (since) {
    query += " AND created_at >= ?";
    params.push(since);
  }
  if (mode) {
    query += " AND mode = ?";
    params.push(mode);
  }
  query += " ORDER BY created_at ASC";

  const rows = db.prepare(query).all(...params);
  return rows.map((r) => ({
    id: r.id,
    quiz_id: r.quiz_id,
    test_id: r.quiz_id,
    user_id: r.user_id,
    group_name: r.group_name,
    user_name: r.group_name,
    mode: r.mode,
    answers: r.answers ? (typeof r.answers === "string" ? JSON.parse(r.answers) : r.answers) : {},
    hints: r.hints ? (typeof r.hints === "string" ? JSON.parse(r.hints) : r.hints) : {},
    score: r.score,
    max_score: r.max_score,
    feedback: r.feedback,
    duration_sec: r.duration_sec,
    created_at: r.created_at,
  }));
}

export function getStats(testId = null) {
  return getAttempts({ quizId: testId });
}

export function clearAttempts(quizId = null) {
  const db = getDb();
  if (quizId) {
    db.prepare("DELETE FROM attempts WHERE quiz_id = ?").run(quizId);
  } else {
    db.prepare("DELETE FROM attempts").run();
  }
}

export function clearStats(testId = null) {
  return clearAttempts(testId);
}

// ==========================================
// DISK <-> DB TWO-WAY SYNCHRONIZATION
// ==========================================

export function syncFromDisk(contentDir = "content") {
  const resolvedContent = path.resolve(contentDir);
  if (!fs.existsSync(resolvedContent)) return;

  // 1. Sync notes
  const diskNoteIds = new Set();
  const notesDir = path.join(resolvedContent, "notes");
  if (fs.existsSync(notesDir)) {
    const noteEntries = fs.readdirSync(notesDir, { withFileTypes: true });
    for (const entry of noteEntries) {
      if (!entry.isDirectory()) continue;
      const noteFile = path.join(notesDir, entry.name, "note.md");
      if (!fs.existsSync(noteFile)) continue;
      diskNoteIds.add(entry.name);
      const content = fs.readFileSync(noteFile, "utf8");
      saveNote(entry.name, { content, diskSync: false, contentDir });
    }
  }
  for (const n of getAllNotes()) {
    if (!diskNoteIds.has(n.id)) {
      deleteNote(n.id, { diskSync: false });
    }
  }

  // 2. Sync tests
  const diskTestIds = new Set();
  const testEntries = fs.readdirSync(resolvedContent, { withFileTypes: true });
  for (const entry of testEntries) {
    if (!entry.isDirectory() || entry.name === "notes" || entry.name === "colloquiums") continue;
    const testFile = path.join(resolvedContent, entry.name, "test.md");
    if (!fs.existsSync(testFile)) continue;
    diskTestIds.add(entry.name);
    const content = fs.readFileSync(testFile, "utf8");
    let keyJson = null;
    const keyFile = path.join(resolvedContent, entry.name, "key.json");
    if (fs.existsSync(keyFile)) {
      try {
        keyJson = JSON.parse(fs.readFileSync(keyFile, "utf8"));
      } catch {}
    }
    saveTest(entry.name, { content, keyJson, diskSync: false, contentDir });
  }
  for (const t of getAllTests()) {
    if (!diskTestIds.has(t.id)) {
      deleteTest(t.id, { diskSync: false });
    }
  }
}

// ==========================================
// COLLOQUIUMS REPOSITORY
// ==========================================

export function seedColloquiumsIfEmpty(db) {
  const countRow = db.prepare("SELECT COUNT(*) as cnt FROM colloquiums").get();
  if (countRow && countRow.cnt > 0) return;

  const contentColloquiumsDir = path.resolve("content", "colloquiums");
  if (!fs.existsSync(contentColloquiumsDir)) return;

  const file1 = path.join(contentColloquiumsDir, "colloquium-1.json");
  const file2 = path.join(contentColloquiumsDir, "colloquium-2.json");

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO colloquiums (id, colloquium_id, num, term, definition, examples, hidden, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  for (const f of [file1, file2]) {
    if (fs.existsSync(f)) {
      try {
        const items = JSON.parse(fs.readFileSync(f, "utf8"));
        for (const item of items) {
          insertStmt.run(
            item.id,
            item.colloquium || 1,
            item.num || 1,
            item.term || "",
            item.definition || "",
            item.examples || "",
            item.hidden ? 1 : 0,
            now,
            now
          );
        }
      } catch (e) {
        console.warn("Failed to seed colloquium file:", f, e);
      }
    }
  }
}

export function seedPlatformDemoData(db) {
  try {
    const studentCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'student'").get()?.cnt || 0;
    if (studentCount === 0) {
      const demoStudents = [
        { id: "usr_demo_1", email: "smirnov@itmo.ru", name: "Александр Смирнов", group_name: "M3101", rating: 480 },
        { id: "usr_demo_2", email: "volkova@itmo.ru", name: "Екатерина Волкова", group_name: "M3102", rating: 445 },
        { id: "usr_demo_3", email: "kuznetsov@itmo.ru", name: "Максим Кузнецов", group_name: "M3101", rating: 410 },
        { id: "usr_demo_4", email: "novikova@itmo.ru", name: "Анна Новикова", group_name: "M3103", rating: 385 },
        { id: "usr_demo_5", email: "morozov@itmo.ru", name: "Дмитрий Морозов", group_name: "M3102", rating: 350 },
        { id: "usr_demo_6", email: "vasilieva@itmo.ru", name: "София Васильева", group_name: "M3101", rating: 320 },
        { id: "usr_demo_7", email: "popov@itmo.ru", name: "Артем Попов", group_name: "M3103", rating: 295 },
        { id: "usr_demo_8", email: "lebedeva@itmo.ru", name: "Полина Лебедева", group_name: "M3102", rating: 260 },
      ];

      const passHash = hashPassword("student123");
      const now = new Date().toISOString();
      const userStmt = db.prepare(`
        INSERT OR REPLACE INTO users (id, email, password_hash, name, group_name, role, rating, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'student', ?, ?, ?)
      `);

      for (const s of demoStudents) {
        userStmt.run(s.id, s.email, passHash, s.name, s.group_name, s.rating, now, now);
      }

      const attemptStmt = db.prepare(`
        INSERT OR REPLACE INTO attempts (id, quiz_id, user_id, group_name, mode, answers, hints, score, max_score, feedback, duration_sec, created_at)
        VALUES (?, ?, ?, ?, 'exam', '{}', '{}', ?, ?, '', ?, ?)
      `);

      const tests = ["01-graphs", "02-trees", "03-connectivity", "04-planarity"];
      let attIdx = 1;
      for (const s of demoStudents) {
        const solvedCount = Math.min(tests.length, Math.floor(s.rating / 120) + 1);
        for (let t = 0; t < solvedCount; t++) {
          const testId = tests[t];
          const score = Math.max(10, Math.floor(15 * (s.rating / 520) + (t % 2)));
          const maxScore = 15;
          const duration = 400 + Math.floor(Math.random() * 300);
          attemptStmt.run(`att_demo_${attIdx++}`, testId, s.id, s.group_name, score, maxScore, duration, now);
        }
      }
    }

    const contestCount = db.prepare("SELECT COUNT(*) as cnt FROM contests").get()?.cnt || 0;
    if (contestCount === 0) {
      const now = Date.now();
      const endsIn1Hour = new Date(now + 60 * 60 * 1000).toISOString();
      const startsAt = new Date(now - 10 * 60 * 1000).toISOString();
      const pastStarts = new Date(now - 3 * 24 * 3600 * 1000).toISOString();
      const pastEnds = new Date(now - 3 * 24 * 3600 * 1000 + 20 * 60 * 1000).toISOString();

      const contestStmt = db.prepare(`
        INSERT OR REPLACE INTO contests (id, title, test_id, group_name, duration_minutes, starts_at, ends_at, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      contestStmt.run("cnt_active_1", "Летучка #1: Основы теории графов", "01-graphs", "all", 20, startsAt, endsIn1Hour, "active", startsAt);
      contestStmt.run("cnt_past_1", "Мини-контест: Деревья и остовы", "02-trees", "all", 25, pastStarts, pastEnds, "finished", pastStarts);

      const subStmt = db.prepare(`
        INSERT OR REPLACE INTO contest_submissions (id, contest_id, user_id, user_name, group_name, score, max_score, percentage, duration_sec, answers, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)
      `);

      subStmt.run("csub_demo_1", "cnt_past_1", "usr_demo_1", "Александр Смирнов", "M3101", 15, 15, 100, 520, pastEnds);
      subStmt.run("csub_demo_2", "cnt_past_1", "usr_demo_2", "Екатерина Волкова", "M3102", 14, 15, 93, 580, pastEnds);
      subStmt.run("csub_demo_3", "cnt_past_1", "usr_demo_3", "Максим Кузнецов", "M3101", 13, 15, 87, 640, pastEnds);
      subStmt.run("csub_demo_4", "cnt_past_1", "usr_demo_4", "Анна Новикова", "M3103", 12, 15, 80, 710, pastEnds);
      subStmt.run("csub_demo_5", "cnt_past_1", "usr_demo_5", "Дмитрий Морозов", "M3102", 11, 15, 73, 850, pastEnds);
    }

    const practiceCount = db.prepare("SELECT COUNT(*) as cnt FROM practices").get()?.cnt || 0;
    if (practiceCount === 0) {
      const now = new Date().toISOString();
      const pStmt = db.prepare(`
        INSERT OR REPLACE INTO practices (id, order_index, topic, title, group_name, is_published, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      pStmt.run(
        "practice-1-relations",
        1,
        "Отношения",
        "Практика 1: Бинарные отношения и фактор-множества",
        "all",
        1,
        `# Практика 1: Бинарные отношения и фактор-множества

## 🎯 Цели занятия
1. Закрепить понятия бинарного отношения: область определения $\\mathrm{dom}(R)$ и область значений $\\mathrm{im}(R)$.
2. Научиться проверять свойства отношений: рефлексивность, антирефлексивность, симметричность, антисимметричность, транзитивность.
3. Исследовать отношения эквивалентности и строить классы эквивалентности $[a]_\\sim$.

---

## 📌 Краткая теоретическая справка
Пусть $A$ — непустое множество. Бинарным отношением на $A$ называется любое подмножество $R \\subseteq A \\times A$.
- **Рефлексивность**: $\\forall x \\in A : (x, x) \\in R$.
- **Симметричность**: $\\forall x, y \\in A : (x, y) \\in R \\implies (y, x) \\in R$.
- **Антисимметричность**: $\\forall x, y \\in A : ((x, y) \\in R \\land (y, x) \\in R) \\implies x = y$.
- **Транзитивность**: $\\forall x, y, z \\in A : ((x, y) \\in R \\land (y, z) \\in R) \\implies (x, z) \\in R$.

Отношение называется **отношением эквивалентности**, если оно рефлексивно, симметрично и транзитивно.

---

## 📝 Задачи для решения на паре

### Задача 1. Исследование свойств отношений
На множестве целых чисел $\\mathbb{Z}$ задано отношение $R$:
$$(x, y) \\in R \\iff x - y \\text{ делится на } 5$$
1. Докажите, что $R$ является отношением эквивалентности.
2. Опишите все классы эквивалентности $[0], [1], [2], [3], [4]$.
3. Сколько элементов содержит фактор-множество $\\mathbb{Z} / R$?

### Задача 2. Композиция отношений
Пусть $R, S \\subseteq A \\times A$. 
Докажите или опровергните:
1. Если $R$ и $S$ симметричны, то $R \\circ S$ симметрично тогда и только тогда, когда $R \\circ S = S \\circ R$.
2. Если $R$ транзитивно, то $R^2 \\subseteq R$.

### Задача 3. Число отношений
Пусть $|A| = n$. Найдите:
- Общее количество бинарных отношений на $A$.
- Количество рефлексивных отношений на $A$.
- Количество симметричных отношений на $A$.
- Количество отношений, одновременно рефлексивных и симметричных.
`,
        now,
        now
      );

      pStmt.run(
        "practice-2-boolean",
        2,
        "Булевы функции",
        "Практика 2: Булевы функции, СДНФ, СКНФ и полнота",
        "all",
        1,
        `# Практика 2: Булевы функции, СДНФ, СКНФ и полнота

## 🎯 Цели занятия
1. Построение таблиц истинности и совершенных нормальных форм (СДНФ, СКНФ).
2. Минимизация булевых формул и полином Жегалкина.
3. Проверка функциональной полноты систем булевых функций по критерию Поста.

---

## 📌 Краткая теоретическая справка
Булева функция $f: \\{0, 1\\}^n \\to \\{0, 1\\}$.
Замкнутые классы Поста:
- $T_0$ — сохраняющие ноль: $f(0, \\dots, 0) = 0$.
- $T_1$ — сохраняющие единицу: $f(1, \\dots, 1) = 1$.
- $S$ — самодвойственные: $f(\\neg x_1, \\dots, \\neg x_n) = \\neg f(x_1, \\dots, x_n)$.
- $M$ — монотонные: $\\alpha \\le \\beta \\implies f(\\alpha) \\le f(\\beta)$.
- $L$ — линейные: $f(x_1, \\dots, x_n) = a_0 \\oplus a_1 x_1 \\oplus \\dots \\oplus a_n x_n$.

Система функций $K$ полна $\\iff K \\not\\subseteq T_0, K \\not\\subseteq T_1, K \\not\\subseteq S, K \\not\\subseteq M, K \\not\\subseteq L$.

---

## 📝 Задачи для решения на паре

### Задача 1. Построение СДНФ и полинома Жегалкина
Для функции большинства $Maj(x, y, z) = (x \\land y) \\lor (y \\land z) \\lor (x \\land z)$:
1. Постройте таблицу истинности.
2. Запишите совершенную дизъюнктивную нормальную форму (СДНФ).
3. Постройте полином Жегалкина.

### Задача 2. Критерий Поста
Исследуйте на полноту систему функций:
$$K = \\{ x \\oplus y \\oplus z, \\; x \\to y, \\; 1 \\}$$
`,
        now,
        now
      );

      pStmt.run(
        "practice-3-graphs",
        3,
        "Графы",
        "Практика 3: Деревья, циклы и алгоритмы остовов",
        "M3101",
        1,
        `# Практика 3: Деревья, циклы и алгоритмы остовов

## 🎯 Цели занятия
1. Свойства деревьев и эквивалентные определения дерева.
2. Алгоритмы поиска минимального остовного дерева (Краскал, Прим).

---

## 📝 Задачи для решения на паре

### Задача 1. Свойства деревьев
Докажите, что связный граф $G = (V, E)$ является деревом тогда и только тогда, когда $|E| = |V| - 1$.
`,
        now,
        now
      );
    }

    const homeworkCount = db.prepare("SELECT COUNT(*) as cnt FROM homeworks").get()?.cnt || 0;
    if (homeworkCount === 0) {
      const now = new Date().toISOString();
      const inTwoWeeks = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
      const inThreeWeeks = new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");

      const hwStmt = db.prepare(`
        INSERT OR REPLACE INTO homeworks (id, order_index, topic, title, group_name, deadline, max_score, is_published, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      hwStmt.run(
        "hw-1-relations",
        1,
        "Отношения",
        "ДЗ 1: Отношения эквивалентности и фактор-множества",
        "all",
        inTwoWeeks,
        10,
        1,
        `# Домашнее задание №1: Отношения эквивалентности

### 📋 Задачи
1. **Задача 1 (3 балла):** Доказать, что отношение $x \\sim y \\iff x - y \\in \\mathbb{Z}$ является отношением эквивалентности на $\\mathbb{R}$. Описать фактор-множество $\\mathbb{R} / \\sim$.
2. **Задача 2 (3 балла):** Найти количество различных отношений эквивалентности на 4-элементном множестве (число Белла $B_4$).
3. **Задача 3 (4 балла):** Пусть $P = (X, \\le)$ — конечное частично упорядоченное множество. Докажите существование минимального элемента.

---

### ⚠️ Требования к оформлению и сдаче:
- Решение оформляется в рукописном или электронном виде.
- Загрузка **строго в формате PDF** (размер до 25 МБ).
- На титульном листе обязательно укажите ФИО и группу.
`,
        now,
        now
      );

      hwStmt.run(
        "hw-2-boolean",
        2,
        "Булевы функции",
        "ДЗ 2: Замкнутые классы Поста",
        "all",
        inThreeWeeks,
        10,
        1,
        `# Домашнее задание №2: Замкнутые классы Поста

### 📋 Задачи
1. **Задача 1 (4 балла):** Разложить функцию $f(x, y, z) = (x \\leftrightarrow y) \\oplus z$ в полином Жегалкина. Определить её принадлежность классам $T_0, T_1, S, M, L$.
2. **Задача 2 (6 баллов):** Выяснить, является ли функционально полной система функций $\\{ x \\downarrow y, \\; 1 \\}$.
`,
        now,
        now
      );

      const subStmt = db.prepare(`
        INSERT OR REPLACE INTO homework_submissions (id, homework_id, user_id, user_name, group_name, file_name, file_path, file_size, status, score, teacher_comment, submitted_at, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      subStmt.run(
        "sub_demo_1",
        "hw-1-relations",
        "usr_demo_1",
        "Александр Смирнов",
        "M3101",
        "smirnov_m3101_hw1.pdf",
        "demo_smirnov_m3101_hw1.pdf",
        142850,
        "passed",
        10,
        "Отличное и строгое решение всех трёх задач! Фактор-множество описано корректно.",
        now,
        now
      );

      subStmt.run(
        "sub_demo_2",
        "hw-1-relations",
        "usr_demo_2",
        "Екатерина Волкова",
        "M3102",
        "volkova_m3102_hw1.pdf",
        "demo_volkova_m3102_hw1.pdf",
        185420,
        "pending",
        0,
        "",
        now,
        null
      );
    }
  } catch (err) {
    console.warn("Failed to seed platform demo data:", err);
  }
}

export function getAllColloquiumQuestions(colloquiumId = null) {
  const db = getDb();
  let rows;
  if (colloquiumId) {
    const stmt = db.prepare("SELECT * FROM colloquiums WHERE colloquium_id = ? ORDER BY num ASC");
    rows = stmt.all(Number(colloquiumId));
  } else {
    const stmt = db.prepare("SELECT * FROM colloquiums ORDER BY colloquium_id ASC, num ASC");
    rows = stmt.all();
  }
  return rows.map((r) => ({
    ...r,
    hidden: Boolean(r.hidden),
  }));
}

export function getColloquiumQuestionById(id) {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM colloquiums WHERE id = ?");
  const r = stmt.get(String(id));
  if (!r) return null;
  return {
    ...r,
    hidden: Boolean(r.hidden),
  };
}

export function saveColloquiumQuestion(q, { diskSync = true, contentDir = "content" } = {}) {
  const db = getDb();
  const existing = getColloquiumQuestionById(q.id);
  const now = new Date().toISOString();

  const id = q.id || `col${q.colloquium || q.colloquium_id || 1}-${String(q.num || 1).padStart(2, "0")}`;
  const colloquium_id = Number(q.colloquium || q.colloquium_id || 1);
  const num = Number(q.num || 1);
  const term = String(q.term || "").trim();
  const definition = String(q.definition || "").trim();
  const examples = String(q.examples || "").trim();
  const hidden = (q.hidden !== undefined ? Boolean(q.hidden) : Boolean(existing?.hidden)) ? 1 : 0;
  const created_at = existing?.created_at || now;
  const updated_at = now;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO colloquiums (id, colloquium_id, num, term, definition, examples, hidden, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, colloquium_id, num, term, definition, examples, hidden, created_at, updated_at);

  if (diskSync) {
    syncColloquiumsToDisk(colloquium_id, contentDir);
  }

  return getColloquiumQuestionById(id);
}

export function deleteColloquiumQuestion(id, { diskSync = true, contentDir = "content" } = {}) {
  const db = getDb();
  const existing = getColloquiumQuestionById(id);
  if (!existing) return false;

  const stmt = db.prepare("DELETE FROM colloquiums WHERE id = ?");
  stmt.run(String(id));

  if (diskSync) {
    syncColloquiumsToDisk(existing.colloquium_id, contentDir);
  }
  return true;
}

function syncColloquiumsToDisk(colloquiumId, contentDir = "content") {
  try {
    const list = getAllColloquiumQuestions(colloquiumId);
    const targetDir = path.resolve(contentDir, "colloquiums");
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const targetFile = path.join(targetDir, `colloquium-${colloquiumId}.json`);
    const cleanList = list.map((item) => ({
      id: item.id,
      colloquium: item.colloquium_id,
      num: item.num,
      term: item.term,
      definition: item.definition,
      examples: item.examples,
      hidden: Boolean(item.hidden),
    }));
    fs.writeFileSync(targetFile, JSON.stringify(cleanList, null, 2), "utf8");
  } catch (err) {
    console.warn("Failed to sync colloquiums to disk:", err);
  }
}

// ==========================================
// USER AUTH & REPOSITORY
// ==========================================

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, key] = stored.split(":");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(key, "hex"));
}

export function createUser({ email, password, name, group_name, role = "student" }) {
  const db = getDb();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const cleanName = String(name || "").trim();
  const cleanGroup = normalizeGroupName(group_name);

  if (!cleanEmail || !password || !cleanName) {
    throw new Error("Заполните все обязательные поля (email, пароль, имя)");
  }
  if (password.length < 6) {
    throw new Error("Пароль должен содержать не менее 6 символов");
  }

  const existing = getUserByEmail(cleanEmail);
  if (existing) {
    throw new Error("Пользователь с таким email уже зарегистрирован");
  }

  const id = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO users (id, email, password_hash, name, group_name, role, rating, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);
  stmt.run(id, cleanEmail, passwordHash, cleanName, cleanGroup, role, now, now);

  return getUserById(id);
}

export function getUserByEmail(email) {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)");
  return stmt.get(String(email).trim()) || null;
}

export function getUserById(id) {
  const db = getDb();
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  const u = stmt.get(String(id));
  if (!u) return null;
  const { password_hash, ...safeUser } = u;
  return safeUser;
}

export function verifyUserCredentials(email, password) {
  const user = getUserByEmail(email);
  if (!user || !user.password_hash) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  const { password_hash, ...safeUser } = user;
  return safeUser;
}

export function updateUserPassword(email, newPassword) {
  const db = getDb();
  const cleanEmail = String(email || "").trim().toLowerCase();
  const user = getUserByEmail(cleanEmail);
  if (!user) {
    throw new Error("Пользователь с таким email не найден");
  }
  if (!newPassword || newPassword.length < 6) {
    throw new Error("Новый пароль должен содержать не менее 6 символов");
  }

  const passwordHash = hashPassword(newPassword);
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    passwordHash,
    now,
    user.id
  );
  return getUserById(user.id);
}

export function updateUserRating(userId) {
  const db = getDb();
  const user = getUserById(userId);
  if (!user) return 0;

  // Best exam attempts per test
  const attempts = db.prepare(`
    SELECT quiz_id, MAX(score * 100.0 / CASE WHEN max_score > 0 THEN max_score ELSE 1.0 END) as best_pct
    FROM attempts
    WHERE user_id = ? AND mode = 'exam'
    GROUP BY quiz_id
  `).all(userId);

  let testRating = 0;
  for (const a of attempts) {
    testRating += Math.round(Number(a.best_pct || 0));
  }

  // Contest points: percentage * 1.5
  const contests = db.prepare(`
    SELECT SUM(percentage * 1.5) as contest_pts
    FROM contest_submissions
    WHERE user_id = ?
  `).get(userId);

  const contestPts = Math.round(Number(contests?.contest_pts || 0));

  // Graded homework points
  const hwSubs = db.prepare(`
    SELECT SUM(score) as hw_pts
    FROM homework_submissions
    WHERE user_id = ? AND (status = 'passed' OR reviewed_at IS NOT NULL)
  `).get(userId);
  const hwPts = Math.round(Number(hwSubs?.hw_pts || 0));

  // Graded typovik points
  const typSubs = db.prepare(`
    SELECT SUM(score) as typ_pts
    FROM typovik_submissions
    WHERE user_id = ? AND (status = 'passed' OR reviewed_at IS NOT NULL)
  `).get(userId);
  const typPts = Math.round(Number(typSubs?.typ_pts || 0));

  const totalRating = testRating + contestPts + hwPts + typPts;

  db.prepare("UPDATE users SET rating = ?, updated_at = ? WHERE id = ?").run(
    totalRating,
    new Date().toISOString(),
    userId
  );

  return totalRating;
}

// ==========================================
// LEADERBOARD & STUDENT PROFILE
// ==========================================

export function getLeaderboard({ group = null, limit = 100 } = {}) {
  const db = getDb();
  let query = `
    SELECT id, email, name, group_name, role, rating, created_at
    FROM users
    WHERE role = 'student'
  `;
  const params = [];
  if (group && group !== "all") {
    query += " AND group_name = ?";
    params.push(group);
  }
  query += " ORDER BY rating DESC, created_at ASC LIMIT ?";
  params.push(limit);

  const rows = db.prepare(query).all(...params);
  return rows.map((u, index) => {
    const statsRow = db.prepare(`
      SELECT 
        COUNT(DISTINCT quiz_id) as tests_solved,
        AVG(score * 100.0 / CASE WHEN max_score > 0 THEN max_score ELSE 1.0 END) as avg_score
      FROM attempts WHERE user_id = ? AND mode = 'exam'
    `).get(u.id);

    const contestRow = db.prepare(`
      SELECT COUNT(*) as count FROM contest_submissions WHERE user_id = ?
    `).get(u.id);

    return {
      rank: index + 1,
      id: u.id,
      name: u.name,
      group_name: u.group_name,
      rating: u.rating || 0,
      tests_solved: statsRow?.tests_solved || 0,
      avg_score: Math.round(statsRow?.avg_score || 0),
      contests_count: contestRow?.count || 0,
      badge: index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : null,
    };
  });
}

export function getStudentProfile(userId) {
  const db = getDb();
  const user = getUserById(userId);
  if (!user) return null;

  // Global rank
  const rankRow = db.prepare(`
    SELECT COUNT(*) + 1 as rank FROM users WHERE role = 'student' AND rating > ?
  `).get(user.rating || 0);

  // Group rank
  const groupRankRow = user.group_name ? db.prepare(`
    SELECT COUNT(*) + 1 as rank FROM users WHERE role = 'student' AND group_name = ? AND rating > ?
  `).get(user.group_name, user.rating || 0) : null;

  // Topics/tests progress
  const allTests = getAllTests();
  const topicProgress = allTests.map((t) => {
    const best = db.prepare(`
      SELECT score, max_score, duration_sec, created_at,
             (score * 100.0 / CASE WHEN max_score > 0 THEN max_score ELSE 1.0 END) as pct
      FROM attempts
      WHERE user_id = ? AND quiz_id = ? AND mode = 'exam'
      ORDER BY (score * 100.0 / CASE WHEN max_score > 0 THEN max_score ELSE 1.0 END) DESC, created_at DESC
      LIMIT 1
    `).get(userId, t.id);

    const attemptCount = db.prepare(`
      SELECT COUNT(*) as cnt FROM attempts WHERE user_id = ? AND quiz_id = ?
    `).get(userId, t.id)?.cnt || 0;

    return {
      test_id: t.id,
      title: t.title,
      topic: t.topic,
      order: t.order,
      best_score: best ? best.score : 0,
      max_score: best ? best.max_score : 0,
      percentage: best ? Math.round(best.pct) : 0,
      attempts_count: attemptCount,
      passed: best ? best.pct >= 60 : false,
      last_attempt_at: best?.created_at || null,
    };
  });

  // Recent attempts
  const recentAttempts = db.prepare(`
    SELECT * FROM attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 15
  `).all(userId).map((r) => ({
    id: r.id,
    quiz_id: r.quiz_id,
    mode: r.mode,
    score: r.score,
    max_score: r.max_score,
    percentage: Math.round(r.max_score > 0 ? (r.score / r.max_score) * 100 : 0),
    duration_sec: r.duration_sec,
    created_at: r.created_at,
  }));

  // Contest submissions
  const contests = db.prepare(`
    SELECT cs.*, c.title as contest_title
    FROM contest_submissions cs
    LEFT JOIN contests c ON cs.contest_id = c.id
    WHERE cs.user_id = ?
    ORDER BY cs.created_at DESC
  `).all(userId);

  return {
    user,
    rank: rankRow?.rank || 1,
    group_rank: groupRankRow?.rank || 1,
    topic_progress: topicProgress,
    recent_attempts: recentAttempts,
    contests,
  };
}

// ==========================================
// SESSIONS REPOSITORY
// ==========================================

export function createSession(userId, role = "student") {
  const db = getDb();
  const token = crypto.randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, role, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(token, userId, role, expiresAt, now);

  return { token, userId, role, expiresAt };
}

export function getSessionByToken(token) {
  if (!token) return null;
  const db = getDb();
  const sess = db.prepare("SELECT * FROM sessions WHERE token = ?").get(token);
  if (!sess) return null;

  if (new Date(sess.expires_at) < new Date()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return null;
  }

  let user = null;
  if (sess.role === "admin") {
    user = { id: "admin", name: "Преподаватель", role: "admin", email: "admin@itmo.ru" };
  } else {
    user = getUserById(sess.user_id);
  }

  return {
    token: sess.token,
    role: sess.role,
    user,
    expiresAt: sess.expires_at,
  };
}

export function deleteSessionByToken(token) {
  if (!token) return;
  const db = getDb();
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

// ==========================================
// CONTESTS REPOSITORY
// ==========================================

export function createContest({
  id = null,
  title,
  test_id,
  group_name = "all",
  groups = null,
  duration_minutes = 15,
  starts_at = null,
  ends_at = null,
  status = "active",
}) {
  const db = getDb();
  const contestId = id || `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const now = starts_at || new Date().toISOString();
  const dur = Number(duration_minutes || 15);
  const end = ends_at || new Date(new Date(now).getTime() + dur * 60 * 1000).toISOString();

  let finalGroupName = group_name;
  if (Array.isArray(groups)) {
    finalGroupName = groups.includes("all") ? "all" : groups.join(", ");
  }

  db.prepare(`
    INSERT INTO contests (id, title, test_id, group_name, duration_minutes, starts_at, ends_at, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    contestId,
    String(title || "Летучка").trim(),
    String(test_id || "").trim(),
    String(finalGroupName || "all").trim(),
    dur,
    now,
    end,
    status || "active",
    new Date().toISOString()
  );

  return getContestById(contestId);
}

export function getAllContests({ group_name = null } = {}) {
  const db = getDb();
  let query = "SELECT * FROM contests ORDER BY created_at DESC";
  const params = [];
  if (group_name && group_name !== "all") {
    query = "SELECT * FROM contests WHERE group_name = 'all' OR group_name = ? OR (',' || REPLACE(group_name, ' ', '') || ',') LIKE ? ORDER BY created_at DESC";
    params.push(group_name, `%,${group_name},%`);
  }

  const rows = db.prepare(query).all(...params);
  const now = new Date();

  return rows.map((r) => {
    let currentStatus = r.status;
    if (currentStatus === "active" && r.ends_at && new Date(r.ends_at) < now) {
      currentStatus = "finished";
    }

    const subsCount = db.prepare("SELECT COUNT(*) as cnt FROM contest_submissions WHERE contest_id = ?").get(r.id)?.cnt || 0;

    return {
      ...r,
      groups: parseGroupsList(r.group_name),
      status: currentStatus,
      submissions_count: subsCount,
    };
  });
}

export function getContestById(id) {
  const db = getDb();
  const r = db.prepare("SELECT * FROM contests WHERE id = ?").get(id);
  if (!r) return null;

  let currentStatus = r.status;
  if (currentStatus === "active" && r.ends_at && new Date(r.ends_at) < new Date()) {
    currentStatus = "finished";
  }

  return {
    ...r,
    groups: parseGroupsList(r.group_name),
    status: currentStatus,
  };
}

export function updateContestStatus(id, status) {
  const db = getDb();
  db.prepare("UPDATE contests SET status = ? WHERE id = ?").run(status, id);
  return getContestById(id);
}

export function deleteContest(id) {
  const db = getDb();
  db.prepare("DELETE FROM contest_submissions WHERE contest_id = ?").run(id);
  db.prepare("DELETE FROM contests WHERE id = ?").run(id);
  return true;
}

export function saveContestSubmission({
  contest_id,
  user_id,
  user_name,
  group_name,
  score = 0,
  max_score = 0,
  duration_sec = 0,
  answers = {},
}) {
  const db = getDb();
  const subId = `csub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const finalScore = Number(score || 0);
  const finalMaxScore = Number(max_score || 0);
  const pct = finalMaxScore > 0 ? (finalScore / finalMaxScore) * 100 : 0;
  const now = new Date().toISOString();

  db.prepare("DELETE FROM contest_submissions WHERE contest_id = ? AND user_id = ?").run(contest_id, user_id);

  db.prepare(`
    INSERT INTO contest_submissions (id, contest_id, user_id, user_name, group_name, score, max_score, percentage, duration_sec, answers, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    subId,
    contest_id,
    user_id,
    user_name || "Студент",
    normalizeGroupName(group_name) || "",
    finalScore,
    finalMaxScore,
    pct,
    Number(duration_sec || 0),
    typeof answers === "string" ? answers : JSON.stringify(answers || {}),
    now
  );

  if (user_id) {
    try {
      updateUserRating(user_id);
    } catch {}
  }

  return {
    id: subId,
    contest_id,
    user_id,
    user_name,
    group_name,
    score: finalScore,
    max_score: finalMaxScore,
    percentage: Math.round(pct),
    duration_sec,
    created_at: now,
  };
}

export function getContestSubmissions(contest_id) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM contest_submissions
    WHERE contest_id = ?
    ORDER BY score DESC, duration_sec ASC, created_at ASC
  `).all(contest_id);

  return rows.map((r, idx) => ({
    rank: idx + 1,
    id: r.id,
    contest_id: r.contest_id,
    user_id: r.user_id,
    user_name: r.user_name,
    group_name: r.group_name,
    score: r.score,
    max_score: r.max_score,
    percentage: Math.round(r.percentage),
    duration_sec: r.duration_sec,
    created_at: r.created_at,
    badge: idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null,
  }));
}

export function getUserContestSubmission(contest_id, user_id) {
  const db = getDb();
  const row = db.prepare("SELECT * FROM contest_submissions WHERE contest_id = ? AND user_id = ?").get(contest_id, user_id);
  if (!row) return null;
  return {
    ...row,
    percentage: Math.round(row.percentage),
    answers: row.answers ? (typeof row.answers === "string" ? JSON.parse(row.answers) : row.answers) : {},
  };
}

// ==========================================
// PRACTICES REPOSITORY
// ==========================================

function parseGroupsList(groupStr) {
  if (!groupStr || groupStr === "all") return ["all"];
  const list = String(groupStr).split(",").map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : ["all"];
}

export function getAllPractices({ group = null, includeUnpublished = false, onlyAll = false } = {}) {
  const db = getDb();
  let query = "SELECT * FROM practices";
  const conditions = [];
  const params = [];

  if (!includeUnpublished) {
    conditions.push("is_published = 1");
  }

  if (onlyAll || group === "__all_only__") {
    conditions.push("group_name = 'all'");
  } else if (group && group !== "all") {
    conditions.push("(group_name = 'all' OR group_name = ? OR (',' || REPLACE(group_name, ' ', '') || ',') LIKE ?)");
    params.push(group, `%,${group},%`);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY order_index ASC, id ASC";
  const rows = db.prepare(query).all(...params);

  return rows.map((r) => ({
    id: r.id,
    order: r.order_index,
    order_index: r.order_index,
    topic: r.topic || "Общее",
    title: r.title || r.id,
    group_name: r.group_name || "all",
    groups: parseGroupsList(r.group_name),
    is_published: Boolean(r.is_published),
    content: r.content || "",
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export function getPracticeById(id) {
  const db = getDb();
  const r = db.prepare("SELECT * FROM practices WHERE id = ?").get(id);
  if (!r) return null;
  return {
    id: r.id,
    order: r.order_index,
    order_index: r.order_index,
    topic: r.topic || "Общее",
    title: r.title || r.id,
    group_name: r.group_name || "all",
    groups: parseGroupsList(r.group_name),
    is_published: Boolean(r.is_published),
    content: r.content || "",
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function savePractice({
  id,
  title,
  topic = "Общее",
  order_index = 0,
  group_name = "all",
  groups = null,
  is_published = 1,
  content = "",
}) {
  const db = getDb();
  const safeId = id ? String(id).trim() : `practice-${Date.now()}`;
  const now = new Date().toISOString();
  const existing = getPracticeById(safeId);

  let finalGroupName = "all";
  if (Array.isArray(groups)) {
    if (groups.includes("all") || groups.length === 0) {
      finalGroupName = "all";
    } else {
      finalGroupName = groups.map((g) => String(g).trim()).filter(Boolean).join(", ");
    }
  } else if (group_name) {
    finalGroupName = String(group_name).trim();
  }

  const createdAt = existing?.created_at || now;
  const pubVal = is_published ? 1 : 0;

  db.prepare(`
    INSERT OR REPLACE INTO practices (id, order_index, topic, title, group_name, is_published, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    safeId,
    Number(order_index || 0),
    topic || "Общее",
    title || safeId,
    finalGroupName,
    pubVal,
    content || "",
    createdAt,
    now
  );

  return getPracticeById(safeId);
}

export function deletePractice(id) {
  const db = getDb();
  db.prepare("DELETE FROM practices WHERE id = ?").run(id);
  return true;
}

// ==========================================
// HOMEWORKS REPOSITORY
// ==========================================

export function getAllHomeworks({ group = null, includeUnpublished = false, userId = null, onlyAll = false } = {}) {
  const db = getDb();
  let query = "SELECT * FROM homeworks";
  const conditions = [];
  const params = [];

  if (!includeUnpublished) {
    conditions.push("is_published = 1");
  }

  if (onlyAll || group === "__all_only__") {
    conditions.push("group_name = 'all'");
  } else if (group && group !== "all") {
    conditions.push("(group_name = 'all' OR group_name = ? OR (',' || REPLACE(group_name, ' ', '') || ',') LIKE ?)");
    params.push(group, `%,${group},%`);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY order_index ASC, id ASC";
  const rows = db.prepare(query).all(...params);

  return rows.map((r) => {
    let submission = null;
    if (userId) {
      submission = getHomeworkSubmission(r.id, userId);
    }
    const subsCount = db.prepare("SELECT COUNT(*) as cnt FROM homework_submissions WHERE homework_id = ?").get(r.id)?.cnt || 0;

    return {
      id: r.id,
      order: r.order_index,
      order_index: r.order_index,
      topic: r.topic || "Общее",
      title: r.title || r.id,
      group_name: r.group_name || "all",
      groups: parseGroupsList(r.group_name),
      deadline: r.deadline || "",
      max_score: Number(r.max_score || 10),
      is_published: Boolean(r.is_published),
      content: r.content || "",
      created_at: r.created_at,
      updated_at: r.updated_at,
      submissions_count: subsCount,
      user_submission: submission,
    };
  });
}

export function getHomeworkById(id, userId = null) {
  const db = getDb();
  const r = db.prepare("SELECT * FROM homeworks WHERE id = ?").get(id);
  if (!r) return null;

  let submission = null;
  if (userId) {
    submission = getHomeworkSubmission(r.id, userId);
  }
  const subsCount = db.prepare("SELECT COUNT(*) as cnt FROM homework_submissions WHERE homework_id = ?").get(r.id)?.cnt || 0;

  return {
    id: r.id,
    order: r.order_index,
    order_index: r.order_index,
    topic: r.topic || "Общее",
    title: r.title || r.id,
    group_name: r.group_name || "all",
    groups: parseGroupsList(r.group_name),
    deadline: r.deadline || "",
    max_score: Number(r.max_score || 10),
    is_published: Boolean(r.is_published),
    content: r.content || "",
    created_at: r.created_at,
    updated_at: r.updated_at,
    submissions_count: subsCount,
    user_submission: submission,
  };
}

export function saveHomework({
  id,
  title,
  topic = "Общее",
  order_index = 0,
  group_name = "all",
  groups = null,
  deadline = "",
  max_score = 10,
  is_published = 1,
  content = "",
}) {
  const db = getDb();
  const safeId = id ? String(id).trim() : `hw-${Date.now()}`;
  const now = new Date().toISOString();
  const existing = getHomeworkById(safeId);

  let finalGroupName = "all";
  if (Array.isArray(groups)) {
    if (groups.includes("all") || groups.length === 0) {
      finalGroupName = "all";
    } else {
      finalGroupName = groups.map((g) => String(g).trim()).filter(Boolean).join(", ");
    }
  } else if (group_name) {
    finalGroupName = String(group_name).trim();
  }

  const createdAt = existing?.created_at || now;
  const pubVal = is_published ? 1 : 0;

  db.prepare(`
    INSERT OR REPLACE INTO homeworks (id, order_index, topic, title, group_name, deadline, max_score, is_published, content, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    safeId,
    Number(order_index || 0),
    topic || "Общее",
    title || safeId,
    finalGroupName,
    deadline || "",
    Number(max_score || 10),
    pubVal,
    content || "",
    createdAt,
    now
  );

  return getHomeworkById(safeId);
}

export function deleteHomework(id) {
  const db = getDb();
  db.prepare("DELETE FROM homework_submissions WHERE homework_id = ?").run(id);
  db.prepare("DELETE FROM homeworks WHERE id = ?").run(id);
  return true;
}

// ==========================================
// HOMEWORK SUBMISSIONS REPOSITORY
// ==========================================

export function saveHomeworkSubmission({
  homework_id,
  user_id,
  user_name,
  group_name,
  file_name,
  file_path,
  file_size = 0,
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = getHomeworkSubmission(homework_id, user_id);

  const subId = existing?.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const status = existing?.status === "passed" ? "passed" : "pending";
  const score = existing?.score || 0;
  const teacherComment = existing?.teacher_comment || "";

  db.prepare(`
    INSERT OR REPLACE INTO homework_submissions (id, homework_id, user_id, user_name, group_name, file_name, file_path, file_size, status, score, teacher_comment, submitted_at, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    subId,
    homework_id,
    user_id,
    user_name || "Студент",
    normalizeGroupName(group_name) || "",
    file_name || "solution.pdf",
    file_path,
    Number(file_size || 0),
    status,
    score,
    teacherComment,
    now,
    existing?.reviewed_at || null
  );

  return getHomeworkSubmissionById(subId);
}

export function getHomeworkSubmission(homework_id, user_id) {
  const db = getDb();
  const r = db.prepare("SELECT * FROM homework_submissions WHERE homework_id = ? AND user_id = ?").get(homework_id, user_id);
  return r || null;
}

export function getHomeworkSubmissionById(id) {
  const db = getDb();
  const r = db.prepare("SELECT * FROM homework_submissions WHERE id = ?").get(id);
  return r || null;
}

export function getHomeworkSubmissions(homework_id, { group_name = null } = {}) {
  const db = getDb();
  let query = "SELECT * FROM homework_submissions WHERE homework_id = ?";
  const params = [homework_id];

  if (group_name && group_name !== "all") {
    query += " AND group_name = ?";
    params.push(group_name);
  }

  query += " ORDER BY submitted_at DESC";
  return db.prepare(query).all(...params);
}

export function getAllHomeworkSubmissions() {
  const db = getDb();
  return db.prepare("SELECT * FROM homework_submissions ORDER BY submitted_at DESC").all();
}

export function resolveHomeworkColumnKey(hwId, hwObj = null) {
  const db = getDb();
  const raw = String(hwId || "").trim();
  const numMatch = raw.match(/^hw[-_](\d+)/i);
  let colKey;
  if (numMatch) {
    colKey = `hw_${numMatch[1]}`;
  } else if (hwObj && Number(hwObj.order_index) >= 1 && Number(hwObj.order_index) <= 20) {
    colKey = `hw_${Number(hwObj.order_index)}`;
  } else {
    colKey = `hw_${raw.toLowerCase().replace(/^hw[-_]/, "").replace(/[^a-z0-9_]/g, "_")}`;
  }

  try {
    getAllGradeColumns(); // Ensure default columns are seeded
    const existingCol = db.prepare("SELECT * FROM gradebook_columns WHERE key = ?").get(colKey);
    if (!existingCol) {
      const titleStr = hwObj?.title
        ? (hwObj.title.length > 24 ? hwObj.title.slice(0, 24) + "…" : hwObj.title)
        : (numMatch ? `ДЗ ${numMatch[1]}` : `ДЗ (${raw})`);
      saveGradeColumn({
        id: `col_${colKey}`,
        key: colKey,
        title: titleStr,
        max_score: hwObj?.max_score || 10,
        is_calculated: 0,
        order_index: 4,
      });
    }
  } catch {}

  return colKey;
}

export function reviewHomeworkSubmission(id, { status = "passed", score = 0, teacher_comment = "" } = {}) {
  const db = getDb();
  const now = new Date().toISOString();
  const numericScore = Number(score || 0);
  db.prepare(`
    UPDATE homework_submissions
    SET status = ?, score = ?, teacher_comment = ?, reviewed_at = ?
    WHERE id = ?
  `).run(status, numericScore, String(teacher_comment || "").trim(), now, id);

  const sub = getHomeworkSubmissionById(id);
  if (sub && sub.user_id && sub.homework_id) {
    try {
      const hw = getHomeworkById(sub.homework_id);
      const colKey = resolveHomeworkColumnKey(sub.homework_id, hw);
      saveStudentGrade({
        user_id: sub.user_id,
        group_name: sub.group_name,
        column_key: colKey,
        score: numericScore,
        max_score: hw?.max_score || 10,
        notes: teacher_comment || "",
      });
      updateUserRating(sub.user_id);
    } catch {}
  }

  return sub;
}

// ==========================================
// 1. FEEDBACK REPOSITORY
// ==========================================

export function saveFeedback({ id = null, user_id = null, user_name = null, user_email = null, type = "general", message = "" }) {
  const db = getDb();
  const fbId = id || `fb_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO feedback (id, user_id, user_name, user_email, type, message, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?)
  `).run(
    fbId,
    user_id || null,
    user_name || "Аноним",
    user_email || "",
    type || "general",
    String(message || "").trim(),
    now,
    now
  );

  return getFeedbackById(fbId);
}

export function getFeedbackById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM feedback WHERE id = ?").get(id) || null;
}

export function getAllFeedback({ status = null } = {}) {
  const db = getDb();
  let query = "SELECT * FROM feedback";
  const params = [];
  if (status && status !== "all") {
    query += " WHERE status = ?";
    params.push(status);
  }
  query += " ORDER BY created_at DESC";
  return db.prepare(query).all(...params);
}

export function updateFeedbackStatus(id, status) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?").run(status, now, id);
  return getFeedbackById(id);
}

// ==========================================
// 2. CONSULTATION REQUESTS REPOSITORY
// ==========================================

export function createConsultationRequest({
  id = null,
  user_id = null,
  user_name = null,
  user_email = null,
  group_name = null,
  topic = "",
  type = "consultation",
  preferred_time = "",
  comment = "",
}) {
  const db = getDb();
  const reqId = id || `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO consultation_requests (id, user_id, user_name, user_email, group_name, topic, type, preferred_time, comment, status, teacher_comment, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)
  `).run(
    reqId,
    user_id || null,
    user_name || "Студент",
    user_email || "",
    normalizeGroupName(group_name) || "",
    String(topic || "").trim(),
    type || "consultation",
    String(preferred_time || "").trim(),
    String(comment || "").trim(),
    now,
    now
  );

  return getConsultationRequestById(reqId);
}

export function getConsultationRequestById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM consultation_requests WHERE id = ?").get(id) || null;
}

export function getUserConsultationRequests(user_id) {
  const db = getDb();
  return db.prepare("SELECT * FROM consultation_requests WHERE user_id = ? ORDER BY created_at DESC").all(user_id);
}

export function getAllConsultationRequests({ status = null } = {}) {
  const db = getDb();
  let query = "SELECT * FROM consultation_requests";
  const params = [];
  if (status && status !== "all") {
    query += " WHERE status = ?";
    params.push(status);
  }
  query += " ORDER BY created_at DESC";
  return db.prepare(query).all(...params);
}

export function reviewConsultationRequest(id, { status = "approved", teacher_comment = "" } = {}) {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE consultation_requests
    SET status = ?, teacher_comment = ?, updated_at = ?
    WHERE id = ?
  `).run(status, String(teacher_comment || "").trim(), now, id);
  return getConsultationRequestById(id);
}

// ==========================================
// 3. QUESTION BANK & TYPOVIKI REPOSITORY
// ==========================================

export function saveQuestionBankItem({
  id = null,
  typovik_id = "typ_1",
  block_id = "general",
  block_title = "Общий блок",
  title = "",
  content = "",
  order_index = 0,
  max_score = 5,
}) {
  const db = getDb();
  const qId = id || `qb_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO question_bank (id, typovik_id, block_id, block_title, title, content, order_index, max_score, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM question_bank WHERE id = ?), ?), ?)
  `).run(
    qId,
    typovik_id || "typ_1",
    block_id || "general",
    block_title || "Общий блок",
    String(title || "").trim(),
    String(content || "").trim(),
    Number(order_index || 0),
    Number(max_score || 5),
    qId,
    now,
    now
  );

  return getQuestionBankItemById(qId);
}

export function getQuestionBankItemById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM question_bank WHERE id = ?").get(id) || null;
}

export function getAllQuestionBankItems({ typovik_id = null, block_id = null } = {}) {
  const db = getDb();
  let query = "SELECT * FROM question_bank WHERE 1=1";
  const params = [];
  if (typovik_id && typovik_id !== "all") {
    query += " AND (typovik_id = ? OR typovik_id IS NULL)";
    params.push(typovik_id);
  }
  if (block_id && block_id !== "all") {
    query += " AND block_id = ?";
    params.push(block_id);
  }
  query += " ORDER BY block_id ASC, order_index ASC, id ASC";
  return db.prepare(query).all(...params);
}

export function deleteQuestionBankItem(id) {
  const db = getDb();
  db.prepare("DELETE FROM question_bank WHERE id = ?").run(id);
}

// Typoviks
export function saveTypovik({
  id = null,
  title = "",
  topic = "Типовой расчет",
  group_name = "all",
  deadline = "",
  max_score = 20,
  blocks_config = null,
  is_published = undefined,
}) {
  const db = getDb();
  const typId = id || `typ_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();
  const existing = id ? db.prepare("SELECT * FROM typoviks WHERE id = ?").get(id) : null;

  const finalTitle = title !== undefined && title !== "" ? String(title).trim() : (existing?.title || "Новый типовой расчет");
  const finalTopic = topic !== undefined && topic !== "" ? String(topic).trim() : (existing?.topic || "Типовой расчет");
  const finalGroup = group_name !== undefined ? (normalizeGroupName(group_name) || "all") : (existing?.group_name || "all");
  const finalDeadline = deadline !== undefined ? String(deadline).trim() : (existing?.deadline || "");
  const finalScore = max_score !== undefined ? Number(max_score) : (existing?.max_score || 20);
  const finalPublished = is_published !== undefined ? (is_published ? 1 : 0) : (existing ? existing.is_published : 1);

  let cfgStr = existing?.blocks_config || "[]";
  if (blocks_config !== null && blocks_config !== undefined) {
    cfgStr = typeof blocks_config === "string" ? blocks_config : JSON.stringify(blocks_config || []);
  }

  db.prepare(`
    INSERT OR REPLACE INTO typoviks (id, title, topic, group_name, deadline, max_score, blocks_config, is_published, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM typoviks WHERE id = ?), ?), ?)
  `).run(
    typId,
    finalTitle,
    finalTopic,
    finalGroup,
    finalDeadline,
    finalScore,
    cfgStr,
    finalPublished,
    typId,
    now,
    now
  );

  return getTypovikById(typId);
}

export function getTypovikById(id) {
  const db = getDb();
  const r = db.prepare("SELECT * FROM typoviks WHERE id = ?").get(id);
  if (!r) return null;
  try {
    r.blocks_config = JSON.parse(r.blocks_config || "[]");
  } catch {
    r.blocks_config = [];
  }
  return r;
}

export function getAllTypoviks({ includeUnpublished = false } = {}) {
  const db = getDb();
  let query = "SELECT * FROM typoviks";
  if (!includeUnpublished) {
    query += " WHERE is_published = 1";
  }
  query += " ORDER BY created_at DESC";
  const list = db.prepare(query).all();
  return list.map((t) => {
    try {
      t.blocks_config = JSON.parse(t.blocks_config || "[]");
    } catch {
      t.blocks_config = [];
    }
    return t;
  });
}

export function deleteTypovik(id) {
  const db = getDb();
  db.prepare("DELETE FROM typoviks WHERE id = ?").run(id);
  db.prepare("DELETE FROM typovik_variants WHERE typovik_id = ?").run(id);
  db.prepare("DELETE FROM typovik_submissions WHERE typovik_id = ?").run(id);
}

/**
 * Генератор персональных вариантов для каждого студента.
 * Выбирает по N случайных вопросов из каждого заданного блока банка вопросов.
 */
export function generateTypovikVariants(typovik_id) {
  const db = getDb();
  const typ = getTypovikById(typovik_id);
  if (!typ) throw new Error("Типовик не найден");

  const blocksConfig = Array.isArray(typ.blocks_config) ? typ.blocks_config : [];
  if (blocksConfig.length === 0) {
    throw new Error("Не настроена конфигурация блоков для генерации вариантов");
  }

  // 1. Получить целевых студентов
  let usersQuery = "SELECT id, name, group_name FROM users WHERE role = 'student'";
  const params = [];
  if (typ.group_name && typ.group_name !== "all") {
    const groups = typ.group_name.split(",").map((s) => normalizeGroupName(s.trim())).filter(Boolean);
    if (groups.length > 0) {
      usersQuery += ` AND group_name IN (${groups.map(() => "?").join(",")})`;
      params.push(...groups);
    }
  }
  const students = db.prepare(usersQuery).all(...params);

  // 2. Загрузить вопросы по блокам
  const allBank = getAllQuestionBankItems();
  const bankByBlock = new Map();
  for (const item of allBank) {
    if (!bankByBlock.has(item.block_id)) bankByBlock.set(item.block_id, []);
    bankByBlock.get(item.block_id).push(item);
  }

  const now = new Date().toISOString();
  let generatedCount = 0;

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO typovik_variants (id, typovik_id, user_id, user_name, group_name, variant_num, questions, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  students.forEach((student, index) => {
    const selectedQuestions = [];

    for (const bCfg of blocksConfig) {
      const blockId = bCfg.block_id;
      const count = Math.max(1, Number(bCfg.questions_count || 1));
      const pool = bankByBlock.get(blockId) || [];

      if (pool.length === 0) continue;

      // Fisher-Yates shuffle копии пула для выбора случайных вопросов
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      selectedQuestions.push(...shuffled.slice(0, count));
    }

    const varId = `tvar_${typovik_id}_${student.id}`;
    const variantNum = index + 1;

    insertStmt.run(
      varId,
      typovik_id,
      student.id,
      student.name || "Студент",
      student.group_name || "",
      variantNum,
      JSON.stringify(selectedQuestions),
      now
    );
    generatedCount++;
  });

  db.prepare("UPDATE typoviks SET is_published = 1 WHERE id = ?").run(typovik_id);

  return { ok: true, generatedCount, totalStudents: students.length };
}

export function getTypovikVariant(typovik_id, user_id) {
  const db = getDb();
  const r = db.prepare("SELECT * FROM typovik_variants WHERE typovik_id = ? AND user_id = ?").get(typovik_id, user_id);
  if (!r) return null;
  try {
    r.questions = JSON.parse(r.questions || "[]");
  } catch {
    r.questions = [];
  }
  return r;
}

function formatTypovikSubmission(sub) {
  if (!sub) return null;
  try {
    sub.images = JSON.parse(sub.images || "[]");
  } catch {
    sub.images = [];
  }
  return sub;
}

export function saveTypovikSubmission({
  typovik_id,
  user_id,
  user_name = "Студент",
  group_name = "",
  file_name = "solution.pdf",
  file_path = "",
  file_size = 0,
  file_type = "pdf",
  images = [],
}) {
  const db = getDb();
  const existing = getTypovikSubmission(typovik_id, user_id);
  const subId = existing?.id || `tsub_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();
  const imagesStr = typeof images === "string" ? images : JSON.stringify(images || []);

  db.prepare(`
    INSERT OR REPLACE INTO typovik_submissions (id, typovik_id, user_id, user_name, group_name, file_name, file_path, file_size, file_type, images, status, score, teacher_comment, submitted_at, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    subId,
    typovik_id,
    user_id,
    user_name || "Студент",
    normalizeGroupName(group_name) || "",
    file_name || "solution.pdf",
    file_path,
    Number(file_size || 0),
    file_type || "pdf",
    imagesStr,
    "pending",
    existing?.score || 0,
    existing?.teacher_comment || "",
    now,
    existing?.reviewed_at || null
  );

  return getTypovikSubmissionById(subId);
}

export function getTypovikSubmission(typovik_id, user_id) {
  const db = getDb();
  const r = db.prepare("SELECT * FROM typovik_submissions WHERE typovik_id = ? AND user_id = ?").get(typovik_id, user_id) || null;
  return formatTypovikSubmission(r);
}

export function getTypovikSubmissionById(id) {
  const db = getDb();
  const r = db.prepare("SELECT * FROM typovik_submissions WHERE id = ?").get(id) || null;
  return formatTypovikSubmission(r);
}

export function getTypovikSubmissions(typovik_id, { group_name = null } = {}) {
  const db = getDb();
  let query = "SELECT * FROM typovik_submissions WHERE typovik_id = ?";
  const params = [typovik_id];
  if (group_name && group_name !== "all") {
    query += " AND group_name = ?";
    params.push(group_name);
  }
  query += " ORDER BY submitted_at DESC";
  return db.prepare(query).all(...params).map(formatTypovikSubmission);
}

export function resolveTypovikColumnKey(typId, typObj = null) {
  const db = getDb();
  const raw = String(typId || "").trim();
  const numMatch = raw.match(/^typ(?:ovik)?[-_](\d+)$/i);
  let colKey;
  if (numMatch) {
    colKey = `typovik_${numMatch[1]}`;
  } else {
    colKey = `typovik_${raw.toLowerCase().replace(/^typ(?:ovik)?[-_]/, "").replace(/[^a-z0-9_]/g, "_")}`;
  }

  try {
    getAllGradeColumns(); // Ensure default columns are seeded
    const existingCol = db.prepare("SELECT * FROM gradebook_columns WHERE key = ?").get(colKey);
    if (!existingCol) {
      const titleStr = numMatch
        ? `ТР №${numMatch[1]}`
        : (typObj?.title ? (typObj.title.length > 24 ? typObj.title.slice(0, 24) + "…" : typObj.title) : `ТР (${raw})`);
      saveGradeColumn({
        id: `col_${colKey}`,
        key: colKey,
        title: titleStr,
        max_score: typObj?.max_score || 20,
        is_calculated: 0,
        order_index: 6,
      });
    }
  } catch {}

  return colKey;
}

export function reviewTypovikSubmission(id, { status = "passed", score = 0, teacher_comment = "" } = {}) {
  const db = getDb();
  const now = new Date().toISOString();
  const numericScore = Number(score || 0);
  db.prepare(`
    UPDATE typovik_submissions
    SET status = ?, score = ?, teacher_comment = ?, reviewed_at = ?
    WHERE id = ?
  `).run(status, numericScore, String(teacher_comment || "").trim(), now, id);

  const sub = getTypovikSubmissionById(id);
  if (sub && sub.user_id && sub.typovik_id) {
    try {
      const typ = getTypovikById(sub.typovik_id);
      const colKey = resolveTypovikColumnKey(sub.typovik_id, typ);
      const maxScore = typ?.max_score || 20;
      saveStudentGrade({
        user_id: sub.user_id,
        group_name: sub.group_name,
        column_key: colKey,
        score: numericScore,
        max_score: maxScore,
        notes: teacher_comment || "",
      });
      if (colKey !== `typovik_${sub.typovik_id}`) {
        saveStudentGrade({
          user_id: sub.user_id,
          group_name: sub.group_name,
          column_key: `typovik_${sub.typovik_id}`,
          score: numericScore,
          max_score: maxScore,
          notes: teacher_comment || "",
        });
      }
      updateUserRating(sub.user_id);
    } catch {}
  }
  return sub;
}

// ==========================================
// 4. SCHEDULE REPOSITORY
// ==========================================

export function saveScheduleEvent({
  id = null,
  title = "",
  type = "lecture",
  starts_at = "",
  ends_at = "",
  location = "",
  groups = "all",
  teacher_name = "",
  description = "",
}) {
  const db = getDb();
  const evId = id || `sch_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();

  const groupsStr = typeof groups === "string" ? groups : JSON.stringify(groups || []);

  db.prepare(`
    INSERT OR REPLACE INTO schedule_events (id, title, type, starts_at, ends_at, location, groups, teacher_name, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM schedule_events WHERE id = ?), ?), ?)
  `).run(
    evId,
    String(title || "").trim(),
    type || "lecture",
    String(starts_at || "").trim(),
    String(ends_at || "").trim(),
    String(location || "").trim(),
    groupsStr,
    String(teacher_name || "").trim(),
    String(description || "").trim(),
    evId,
    now,
    now
  );

  return getScheduleEventById(evId);
}

export function getScheduleEventById(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM schedule_events WHERE id = ?").get(id) || null;
}

export function getAllScheduleEvents({ group = null, teacher = null, from = null, to = null } = {}) {
  const db = getDb();
  let query = "SELECT * FROM schedule_events WHERE 1=1";
  const params = [];

  if (from) {
    query += " AND starts_at >= ?";
    params.push(from);
  }
  if (to) {
    query += " AND starts_at <= ?";
    params.push(to);
  }
  query += " ORDER BY starts_at ASC";

  let list = db.prepare(query).all(...params);

  if (group && group !== "all") {
    const norm = normalizeGroupName(group);
    list = list.filter((ev) => {
      if (!ev.groups || ev.groups === "all") return true;
      try {
        const arr = JSON.parse(ev.groups);
        return Array.isArray(arr) ? arr.includes(norm) || arr.includes("all") : ev.groups.includes(norm);
      } catch {
        return ev.groups.includes(norm) || ev.groups.includes("all");
      }
    });
  }

  if (teacher && teacher.trim()) {
    const tLower = teacher.toLowerCase();
    list = list.filter((ev) => (ev.teacher_name || "").toLowerCase().includes(tLower));
  }

  return list;
}

export function deleteScheduleEvent(id) {
  const db = getDb();
  db.prepare("DELETE FROM schedule_events WHERE id = ?").run(id);
}

// ==========================================
// 5. STUDENT GRADES (ELECTRONIC SPREADSHEET)
// ==========================================

export function saveStudentGrade({
  user_id,
  group_name = "",
  column_key,
  score = 0,
  max_score = 10,
  notes = "",
}) {
  const db = getDb();
  const id = `grd_${user_id}_${column_key}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO student_grades (id, user_id, group_name, column_key, score, max_score, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    user_id,
    normalizeGroupName(group_name) || "",
    column_key,
    Number(score || 0),
    Number(max_score || 10),
    String(notes || ""),
    now
  );

  return db.prepare("SELECT * FROM student_grades WHERE id = ?").get(id);
}

export function getAllGradeColumns() {
  const db = getDb();
  let cols = db.prepare("SELECT * FROM gradebook_columns ORDER BY order_index ASC, id ASC").all();
  if (!cols || cols.length === 0) {
    seedDefaultGradeColumns(db);
    cols = db.prepare("SELECT * FROM gradebook_columns ORDER BY order_index ASC, id ASC").all();
  }
  return cols;
}

export function seedDefaultGradeColumns(db) {
  const defaultColumns = [
    { id: "col_test_1", key: "test_1", title: "Тест 1 (Графы)", max_score: 15, formula: "", is_calculated: 0, order_index: 1 },
    { id: "col_test_2", key: "test_2", title: "Тест 2 (Деревья)", max_score: 15, formula: "", is_calculated: 0, order_index: 2 },
    { id: "col_hw_1", key: "hw_1", title: "ДЗ 1 (Отношения)", max_score: 10, formula: "", is_calculated: 0, order_index: 3 },
    { id: "col_hw_2", key: "hw_2", title: "ДЗ 2 (Булевы)", max_score: 10, formula: "", is_calculated: 0, order_index: 4 },
    { id: "col_typ_1", key: "typovik_1", title: "ТР №1", max_score: 20, formula: "", is_calculated: 0, order_index: 5 },
    { id: "col_typ_2", key: "typovik_2", title: "ТР №2", max_score: 20, formula: "", is_calculated: 0, order_index: 6 },
    { id: "col_coll_1", key: "colloquium_1", title: "Коллоквиум 1", max_score: 20, formula: "", is_calculated: 0, order_index: 7 },
    { id: "col_total", key: "total_score", title: "Итоговый балл", max_score: 100, formula: "SUM", is_calculated: 1, order_index: 8 },
  ];
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO gradebook_columns (id, key, title, max_score, formula, is_calculated, order_index, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of defaultColumns) {
    stmt.run(c.id, c.key, c.title, c.max_score, c.formula, c.is_calculated, c.order_index, now);
  }
}

export function saveGradeColumn({
  id = null,
  key,
  title,
  max_score = 10,
  formula = "",
  is_calculated = 0,
  order_index = 0,
}) {
  const db = getDb();
  const colId = id || `col_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const colKey = (key || colId).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO gradebook_columns (id, key, title, max_score, formula, is_calculated, order_index, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM gradebook_columns WHERE id = ?), ?))
  `).run(
    colId,
    colKey,
    String(title || colKey).trim(),
    Number(max_score || 10),
    String(formula || "").trim(),
    Number(is_calculated ? 1 : 0),
    Number(order_index || 0),
    colId,
    now
  );
  return db.prepare("SELECT * FROM gradebook_columns WHERE id = ?").get(colId);
}

export function deleteGradeColumn(id) {
  const db = getDb();
  const col = db.prepare("SELECT * FROM gradebook_columns WHERE id = ?").get(id);
  if (col) {
    db.prepare("DELETE FROM gradebook_columns WHERE id = ?").run(id);
    db.prepare("DELETE FROM student_grades WHERE column_key = ?").run(col.key);
  }
}

export function getGradesSpreadsheet({ group = null } = {}) {
  const db = getDb();
  // 1. Студенты
  let usersQuery = "SELECT id, name, group_name, email FROM users WHERE role = 'student'";
  const userParams = [];
  if (group && group !== "all") {
    usersQuery += " AND group_name = ?";
    userParams.push(normalizeGroupName(group));
  }
  usersQuery += " ORDER BY group_name ASC, name ASC";
  const students = db.prepare(usersQuery).all(...userParams);

  // 2. Все оценки из student_grades + синхронизация проверенных ДЗ и Типовиков
  const grades = db.prepare("SELECT * FROM student_grades").all();
  const gradeMap = new Map();
  const gradeTimeMap = new Map();
  for (const g of grades) {
    const key = `${g.user_id}_${g.column_key}`;
    gradeMap.set(key, g.score);
    gradeTimeMap.set(key, g.updated_at || "");
    // Если сохранено под старым ключом typovik_typ_1 -> дублируем в typovik_1
    const legacyMatch = String(g.column_key || "").match(/^typovik_typ_(\d+)$/);
    if (legacyMatch) {
      const normKey = `${g.user_id}_typovik_${legacyMatch[1]}`;
      if (!gradeMap.has(normKey)) {
        gradeMap.set(normKey, g.score);
        gradeTimeMap.set(normKey, g.updated_at || "");
      }
    }
  }

  // Подтягиваем проверенные ДЗ
  try {
    const hws = db.prepare("SELECT id, title, order_index, max_score FROM homeworks").all();
    const hwById = new Map(hws.map((h) => [h.id, h]));
    const reviewedHwSubs = db.prepare(`
      SELECT * FROM homework_submissions
      WHERE reviewed_at IS NOT NULL OR status IN ('passed', 'failed', 'revise')
    `).all();
    for (const sub of reviewedHwSubs) {
      if (!sub.user_id || !sub.homework_id) continue;
      const hwObj = hwById.get(sub.homework_id) || null;
      const colKey = resolveHomeworkColumnKey(sub.homework_id, hwObj);
      const mapKey = `${sub.user_id}_${colKey}`;
      const existingTime = gradeTimeMap.get(mapKey) || "";
      const subTime = sub.reviewed_at || sub.submitted_at || "";
      if (!gradeMap.has(mapKey) || (subTime && subTime > existingTime)) {
        gradeMap.set(mapKey, Number(sub.score || 0));
        gradeTimeMap.set(mapKey, subTime);
      }
    }
  } catch {}

  // Подтягиваем проверенные Типовики
  try {
    const typs = db.prepare("SELECT id, title, max_score FROM typoviks").all();
    const typById = new Map(typs.map((t) => [t.id, t]));
    const reviewedTypSubs = db.prepare(`
      SELECT * FROM typovik_submissions
      WHERE reviewed_at IS NOT NULL OR status IN ('passed', 'failed', 'revise')
    `).all();
    for (const sub of reviewedTypSubs) {
      if (!sub.user_id || !sub.typovik_id) continue;
      const typObj = typById.get(sub.typovik_id) || null;
      const colKey = resolveTypovikColumnKey(sub.typovik_id, typObj);
      const mapKey = `${sub.user_id}_${colKey}`;
      const existingTime = gradeTimeMap.get(mapKey) || "";
      const subTime = sub.reviewed_at || sub.submitted_at || "";
      if (!gradeMap.has(mapKey) || (subTime && subTime > existingTime)) {
        gradeMap.set(mapKey, Number(sub.score || 0));
        gradeTimeMap.set(mapKey, subTime);
      }
    }
  } catch {}

  // 3. Динамические колонки заданий из таблицы
  const rawColumns = getAllGradeColumns();
  const columns = rawColumns.map((c) => ({
    id: c.id,
    key: c.key,
    title: c.title,
    max: c.max_score,
    formula: c.formula || "",
    is_calculated: Boolean(c.is_calculated),
    order: c.order_index,
  }));

  // Матрица строк
  const rows = students.map((s) => {
    const scores = {};
    let nonFormulaTotal = 0;

    // Первый проход: обычные числовые ячейки
    for (const col of columns) {
      if (!col.is_calculated) {
        const val = gradeMap.get(`${s.id}_${col.key}`);
        if (typeof val === "number") {
          scores[col.key] = val;
          nonFormulaTotal += val;
        } else {
          scores[col.key] = "";
        }
      }
    }

    // Второй проход: вычисляемые колонки с формулами
    for (const col of columns) {
      if (col.is_calculated) {
        const f = (col.formula || "").trim().toUpperCase();
        if (!f || f === "SUM") {
          scores[col.key] = Math.round(nonFormulaTotal * 100) / 100;
        } else if (f.startsWith("SUM(") && f.endsWith(")")) {
          const keys = f.slice(4, -1).split(",").map((k) => k.trim().toLowerCase());
          let sum = 0;
          for (const k of keys) {
            const v = scores[k];
            if (typeof v === "number") sum += v;
          }
          scores[col.key] = Math.round(sum * 100) / 100;
        } else if (f.startsWith("AVG(") && f.endsWith(")")) {
          const keys = f.slice(4, -1).split(",").map((k) => k.trim().toLowerCase());
          let sum = 0, count = 0;
          for (const k of keys) {
            const v = scores[k];
            if (typeof v === "number") { sum += v; count++; }
          }
          scores[col.key] = count > 0 ? Math.round((sum / count) * 100) / 100 : 0;
        } else {
          scores[col.key] = Math.round(nonFormulaTotal * 100) / 100;
        }
      }
    }

    return {
      userId: s.id,
      name: s.name || "Студент",
      group: s.group_name || "—",
      email: s.email,
      scores,
      total: Math.round(nonFormulaTotal * 100) / 100,
    };
  });

  return {
    columns,
    rows,
    groups: ["all", "M3101", "M3102", "M3103", "M3111", "M3112", "M3113", "M3114", "M3115"],
  };
}

// ==========================================
// SEEDING DEMO DATA FOR NEW FEATURES
// ==========================================

export function seedNewFeaturesDemoData(db) {
  try {
    const fbCount = db.prepare("SELECT COUNT(*) as cnt FROM feedback").get()?.cnt || 0;
    if (fbCount === 0) {
      const now = new Date().toISOString();
      const fbStmt = db.prepare(`
        INSERT OR REPLACE INTO feedback (id, user_id, user_name, user_email, type, message, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      fbStmt.run("fb_1", "usr_demo_1", "Александр Смирнов", "smirnov@itmo.ru", "feature", "Было бы круто добавить тёмную тему и экспорт расписания в iCal!", "new", now, now);
      fbStmt.run("fb_2", "usr_demo_2", "Екатерина Волкова", "volkova@itmo.ru", "bug", "В задании 3 по деревьям не загружалась картинка на мобильном сафари, но сейчас вроде ок.", "read", now, now);
      fbStmt.run("fb_3", null, "Анонимный студент", "", "review", "Отличная платформа, очень помогли тренажёры перед коллоквиумом!", "resolved", now, now);
    }

    const consultCount = db.prepare("SELECT COUNT(*) as cnt FROM consultation_requests").get()?.cnt || 0;
    if (consultCount === 0) {
      const now = new Date().toISOString();
      const cStmt = db.prepare(`
        INSERT OR REPLACE INTO consultation_requests (id, user_id, user_name, user_email, group_name, topic, type, preferred_time, comment, status, teacher_comment, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      cStmt.run("req_1", "usr_demo_1", "Александр Смирнов", "smirnov@itmo.ru", "M3101", "Критерий Поста и замкнутые классы", "consultation", "Вторник, 17:00", "Сложности с доказательством самодвойственности функций.", "pending", "", now, now);
      cStmt.run("req_2", "usr_demo_3", "Максим Кузнецов", "kuznetsov@itmo.ru", "M3101", "Алгоритмы остовов и разрезы графов", "extra_lecture", "Суббота, 15:30", "Хотели бы разобрать доказательство корректности алгоритма Краскала.", "approved", "Принято, проведём в ауд. 3314", now, now);
    }

    const qb2Count = db.prepare("SELECT COUNT(*) as cnt FROM question_bank WHERE typovik_id = 'typ_2'").get()?.cnt || 0;
    if (qb2Count === 0) {
      const now = new Date().toISOString();
      const qbStmt = db.prepare(`
        INSERT OR REPLACE INTO question_bank (id, typovik_id, block_id, block_title, title, content, order_index, max_score, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      // --- ТР-1: Отношения и булевы функции ---
      qbStmt.run("qb_1_1", "typ_1", "t1_rel", "Бинарные отношения", "Свойства отношений", "Исследуйте отношение $R = \\{(x, y) \\in \\mathbb{R}^2 \\mid x - y \\in \\mathbb{Z}\\}$ на рефлексивность, симметричность и транзитивность.", 1, 5, now, now);
      qbStmt.run("qb_1_2", "typ_1", "t1_rel", "Бинарные отношения", "Фактор-множество", "Задано отношение эквивалентности $(a, b) \\sim (c, d) \\iff ad = bc$ на $\\mathbb{Z} \\times (\\mathbb{Z} \\setminus \\{0\\})$. Опишите фактор-множество.", 2, 5, now, now);
      qbStmt.run("qb_1_3", "typ_1", "t1_bool", "Булевы функции", "Полином Жегалкина", "Постройте полином Жегалкина для функции $f(x, y, z) = (x \\lor y) \\to (y \\land z)$.", 1, 5, now, now);
      qbStmt.run("qb_1_4", "typ_1", "t1_bool", "Булевы функции", "Минимизация СДНФ", "Методом карт Карно найдите тупиковую и минимальную ДНФ для функции $f = \\Sigma(0, 1, 4, 5, 7)$.", 2, 5, now, now);
      qbStmt.run("qb_1_5", "typ_1", "t1_post", "Критерий Поста", "Функциональная полнота", "Проверьте принадлежность функции $x \\downarrow (y \\oplus z)$ пяти замкнутым классам Поста ($T_0, T_1, S, M, L$).", 1, 5, now, now);
      qbStmt.run("qb_1_6", "typ_1", "t1_post", "Критерий Поста", "Базис Шеффера", "Выразите операцию дизъюнкции $x \\lor y$ исключительно через штрих Шеффера $x \\mid y$.", 2, 5, now, now);

      // --- ТР-2: Теория графов и деревья ---
      qbStmt.run("qb_2_1", "typ_2", "t2_conn", "Связность и циклы", "Эйлеровы и гамильтоновы циклы", "Докажите или опровергните: любой двудольный 3-регулярный связный граф содержит гамильтонов цикл.", 1, 5, now, now);
      qbStmt.run("qb_2_2", "typ_2", "t2_conn", "Связность и циклы", "Точки сочленения и мосты", "Пусть $G$ — связный граф без мостов. Докажите, что любые два ребра лежат на общем простом цикле.", 2, 5, now, now);
      qbStmt.run("qb_2_3", "typ_2", "t2_trees", "Деревья и остовы", "Количество остовных деревьев", "Найдите число остовных деревьев полного двудольного графа $K_{2, 3}$ с помощью матричной теоремы Кирхгофа.", 1, 5, now, now);
      qbStmt.run("qb_2_4", "typ_2", "t2_trees", "Деревья и остовы", "Код Прюфера", "Постройте дерево по коду Прюфера $(2, 5, 5, 1)$ на множестве вершин $\\{1, 2, 3, 4, 5, 6\\}$.", 2, 5, now, now);
      qbStmt.run("qb_2_5", "typ_2", "t2_plan", "Планарность и раскраски", "Хроматическое число графа", "Для графа Петерсена найдите хроматическое число $\\chi(G)$ и приведите правильную раскраску вершин.", 1, 5, now, now);
      qbStmt.run("qb_2_6", "typ_2", "t2_plan", "Планарность и раскраски", "Формула Эйлера", "Граф имеет 12 вершин, каждая степени 4. Может ли он быть планарным? Докажите ответ.", 2, 5, now, now);

      // --- ТР-3: Алгебраические структуры ---
      qbStmt.run("qb_3_1", "typ_3", "t3_group", "Группы и полугруппы", "Проверка аксиом группы", "Является ли множество матриц $\\{\\begin{pmatrix} a & 0 \\\\ 0 & b \\end{pmatrix} \\mid a, b \\in \\mathbb{R}^*\\}$ абелевой группой относительно умножения?", 1, 5, now, now);
      qbStmt.run("qb_3_2", "typ_3", "t3_group", "Группы и полугруппы", "Порядок элемента группы", "Найдите порядок элемента $\\overline{5}$ в мультипликативной группе вычетов $\\mathbb{Z}_{17}^*$.", 2, 5, now, now);
      qbStmt.run("qb_3_3", "typ_3", "t3_sub", "Подгруппы и смежные классы", "Теорема Лагранжа", "Перечислите все смежные классы группы $S_3$ по подгруппе $H = \\{id, (1\\ 2)\\}$.", 1, 5, now, now);
      qbStmt.run("qb_3_4", "typ_3", "t3_ring", "Кольца и поля", "Делители нуля и обратимые элементы", "Найдите все делители нуля и обратимые элементы в кольце $\\mathbb{Z}_{24}$.", 1, 5, now, now);

      // --- ТР-4: Комбинаторика и производящие функции ---
      qbStmt.run("qb_4_1", "typ_4", "t4_comb", "Комбинаторный анализ", "Формула включений-исключений", "Сколько целых чисел от 1 до 1000 не делятся ни на 2, ни на 3, ни на 5?", 1, 5, now, now);
      qbStmt.run("qb_4_2", "typ_4", "t4_comb", "Комбинаторный анализ", "Беспорядки (субфакториал)", "Сколькими способами можно переставить буквы слова $ABCDEF$, чтобы ни одна буква не осталась на своем месте?", 2, 5, now, now);
      qbStmt.run("qb_4_3", "typ_4", "t4_rec", "Рекуррентные уравнения", "Однородное рекуррентное уравнение", "Решите рекуррентное соотношение $a_n = 5a_{n-1} - 6a_{n-2}$ при $a_0 = 1, a_1 = 4$.", 1, 5, now, now);
      qbStmt.run("qb_4_4", "typ_4", "t4_gen", "Производящие функции", "Метод производящих функций", "Найдите производящую функцию для последовательности чисел Фибоначчи $F_0 = 0, F_1 = 1, F_n = F_{n-1} + F_{n-2}$.", 1, 5, now, now);
    }

    const typ2Exists = db.prepare("SELECT COUNT(*) as cnt FROM typoviks WHERE id = 'typ_2'").get()?.cnt || 0;
    if (typ2Exists === 0) {
      const now = new Date().toISOString();
      const deadline = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ");
      const tStmt = db.prepare(`
        INSERT OR REPLACE INTO typoviks (id, title, topic, group_name, deadline, max_score, blocks_config, is_published, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);

      // ТР-1
      const cfg1 = JSON.stringify([
        { block_id: "t1_rel", block_title: "Бинарные отношения", questions_count: 2 },
        { block_id: "t1_bool", block_title: "Булевы функции", questions_count: 2 },
        { block_id: "t1_post", block_title: "Критерий Поста", questions_count: 1 },
      ]);
      tStmt.run("typ_1", "Типовой расчет №1: Отношения и булевы функции", "Отношения и Булева логика", "all", deadline, 25, cfg1, now, now);

      // ТР-2
      const cfg2 = JSON.stringify([
        { block_id: "t2_conn", block_title: "Связность и циклы", questions_count: 2 },
        { block_id: "t2_trees", block_title: "Деревья и остовы", questions_count: 2 },
        { block_id: "t2_plan", block_title: "Планарность и раскраски", questions_count: 1 },
      ]);
      tStmt.run("typ_2", "Типовой расчет №2: Теория графов и деревья", "Теория графов", "all", deadline, 25, cfg2, now, now);

      // ТР-3
      const cfg3 = JSON.stringify([
        { block_id: "t3_group", block_title: "Группы и полугруппы", questions_count: 2 },
        { block_id: "t3_sub", block_title: "Подгруппы и смежные классы", questions_count: 1 },
        { block_id: "t3_ring", block_title: "Кольца и поля", questions_count: 1 },
      ]);
      tStmt.run("typ_3", "Типовой расчет №3: Алгебраические структуры", "Алгебраические структуры", "all", deadline, 20, cfg3, now, now);

      // ТР-4
      const cfg4 = JSON.stringify([
        { block_id: "t4_comb", block_title: "Комбинаторный анализ", questions_count: 2 },
        { block_id: "t4_rec", block_title: "Рекуррентные уравнения", questions_count: 1 },
        { block_id: "t4_gen", block_title: "Производящие функции", questions_count: 1 },
      ]);
      tStmt.run("typ_4", "Типовой расчет №4: Комбинаторика и производящие функции", "Комбинаторика", "all", deadline, 20, cfg4, now, now);

      // Сгенерировать варианты для демо-студентов
      try {
        generateTypovikVariants("typ_1");
        generateTypovikVariants("typ_2");
        generateTypovikVariants("typ_3");
        generateTypovikVariants("typ_4");
      } catch (err) {
        console.warn("Auto-generate demo variants failed:", err.message);
      }
    }

    const schedCount = db.prepare("SELECT COUNT(*) as cnt FROM schedule_events").get()?.cnt || 0;
    if (schedCount === 0) {
      const now = Date.now();
      const sStmt = db.prepare(`
        INSERT OR REPLACE INTO schedule_events (id, title, type, starts_at, ends_at, location, groups, teacher_name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const createdNow = new Date().toISOString();

      const d1 = new Date(now + 1 * 24 * 3600 * 1000);
      d1.setHours(10, 0, 0, 0);
      const d1End = new Date(d1.getTime() + 90 * 60 * 1000);

      const d2 = new Date(now + 2 * 24 * 3600 * 1000);
      d2.setHours(13, 30, 0, 0);
      const d2End = new Date(d2.getTime() + 90 * 60 * 1000);

      const d3 = new Date(now + 4 * 24 * 3600 * 1000);
      d3.setHours(15, 20, 0, 0);
      const d3End = new Date(d3.getTime() + 90 * 60 * 1000);

      sStmt.run("sch_1", "Лекция: Теория графов и связность", "lecture", d1.toISOString(), d1End.toISOString(), "Ауд. 1404 (Кронверкский)", "all", "Поляков В.И.", "Понятия связности, мосты, точки сочленения", createdNow, createdNow);
      sStmt.run("sch_2", "Практика: Деревья и остовы", "practice", d2.toISOString(), d2End.toISOString(), "Ауд. 2311 (Ломоносова)", JSON.stringify(["M3101", "M3102"]), "Романов И.С.", "Алгоритмы Прима и Краскала на практике", createdNow, createdNow);
      sStmt.run("sch_3", "Консультация перед коллоквиумом", "consultation", d3.toISOString(), d3End.toISOString(), "Ауд. 3314 / Zoom", "all", "Романов И.С.", "Разбор вопросов к Коллоквиуму 1", createdNow, createdNow);
    }

    const gradeCount = db.prepare("SELECT COUNT(*) as cnt FROM student_grades").get()?.cnt || 0;
    if (gradeCount === 0) {
      const demoUsers = db.prepare("SELECT id, group_name FROM users WHERE role = 'student'").all();
      for (const u of demoUsers) {
        saveStudentGrade({ user_id: u.id, group_name: u.group_name, column_key: "test_1", score: 14, max_score: 15 });
        saveStudentGrade({ user_id: u.id, group_name: u.group_name, column_key: "test_2", score: 13, max_score: 15 });
        saveStudentGrade({ user_id: u.id, group_name: u.group_name, column_key: "hw_1", score: 10, max_score: 10 });
        saveStudentGrade({ user_id: u.id, group_name: u.group_name, column_key: "typovik_1", score: 15, max_score: 15 });
        saveStudentGrade({ user_id: u.id, group_name: u.group_name, column_key: "colloquium_1", score: 18, max_score: 20 });
      }
    }
  } catch (e) {
    console.warn("Seeding new features failed:", e);
  }
}



