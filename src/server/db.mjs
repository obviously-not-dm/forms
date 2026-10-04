import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
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
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_attempts_quiz ON attempts(quiz_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_created ON attempts(created_at);
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

  seedColloquiumsIfEmpty(db);
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
  const group = group_name || userName || user_name || null;
  const finalScore = Number(score || 0);
  const finalMaxScore = Number(max_score || maxScore || 0);
  const now = created_at || new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO attempts (id, quiz_id, group_name, mode, answers, hints, score, max_score, feedback, duration_sec, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    attemptId,
    quizId,
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

  return {
    id: attemptId,
    quiz_id: quizId,
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

export function getAttempts({ quizId = null, testId = null, since = null, mode = null } = {}) {
  const db = getDb();
  const targetId = quizId || testId;
  let query = "SELECT * FROM attempts WHERE 1=1";
  const params = [];

  if (targetId) {
    query += " AND quiz_id = ?";
    params.push(targetId);
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
