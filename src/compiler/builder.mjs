import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Marked } from "marked";
import katex from "katex";
import { isCorrect, guessCompare } from "../grade.js";
import { escapeHtml as esc, renderMarkdown } from "./markdown.mjs";
import {
  head,
  questionHtml,
  quizPage,
  notesPage,
  colloquiumsPage,
  indexPage,
  adminPage,
  tasksWord,
  leaderboardPage,
  profilePage,
  contestsPage,
  contestRoomPage,
  testsPage,
  customTestPage,
  practicesPage,
  homeworksPage,
} from "./templates.mjs";
import { syncFromDisk, getAllNotes, getAllTests, getAllColloquiumQuestions, getAllPractices, getAllHomeworks } from "../server/db.mjs";

const ROOT = path.resolve(".");
const CONTENT = path.join(ROOT, "content");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ";

// ---------- KaTeX Marked Extension for Tests ----------

function mathExtension(errors, where, used) {
  const render = (tex, display) => {
    used.math = true;
    try {
      return katex.renderToString(tex, { displayMode: display, throwOnError: true });
    } catch (e) {
      errors.push(`${where()}: KaTeX: ${e.message}`);
      return `<span class="katex-error">${esc(tex)}</span>`;
    }
  };
  return {
    extensions: [
      {
        name: "mathBlock",
        level: "block",
        start: (src) => src.match(/^\$\$/m)?.index,
        tokenizer(src) {
          const m = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src);
          if (m) return { type: "mathBlock", raw: m[0], tex: m[1].trim() };
        },
        renderer: (t) => `<div class="math-block">${render(t.tex, true)}</div>\n`,
      },
      {
        name: "mathInline",
        level: "inline",
        start: (src) => { const i = src.indexOf("$"); return i < 0 ? undefined : i; },
        tokenizer(src) {
          const m = /^\$\$([\s\S]+?)\$\$/.exec(src) || /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$/.exec(src);
          if (m) return { type: "mathInline", raw: m[0], tex: m[1].trim(), display: m[0].startsWith("$$") };
        },
        renderer: (t) => render(t.tex, t.display),
      },
    ],
  };
}

function imageHtml(href, text, title, cls) {
  const t = title && title !== "фото" ? ` title="${esc(title)}"` : "";
  return `<img class="${cls}" src="${esc(href)}" alt="${esc(text)}"${t} loading="lazy">`;
}

function markdownFor(dir, images, errors, where, used) {
  const md = new Marked({ gfm: true, breaks: true });
  md.use(mathExtension(errors, where, used));
  md.use({
    renderer: {
      image({ href, text, title }) {
        if (/^https?:/.test(href)) return imageHtml(href, text, title, "photo");
        const rel = decodeURI(href);
        if (rel.includes("..") || path.isAbsolute(rel)) {
          errors.push(`${where()}: картинка должна лежать в папке теста: ${rel}`);
        } else if (!fs.existsSync(path.join(dir, rel))) {
          errors.push(`${where()}: нет файла картинки ${rel}`);
        } else {
          images.add(rel);
        }
        const photo = title === "фото" || !/\.(png|svg)$/i.test(rel);
        const kind = photo ? "photo" : rel.toLowerCase().endsWith(".svg") ? "fig fig-svg" : "fig fig-png";
        return imageHtml(href, text, title, kind);
      },
    },
  });
  return md;
}

function plain(s) {
  return s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*`$]/g, "").trim();
}

// ---------- Разбор test.md ----------

const OPTION = /^- ([([])([xXхХ ])[)\]]\s+(.*)$/;
const KEYWORD = /^(Ответ|Формат|Подсказка|Пояснение)\s*:\s*(.*)$/;
const OPTION_NOTE = /^\s{2,}>\s?(.*)$/;
const ANSWER_NOTE = /^Если ответ\s+(.+?)\s*:\s+(.+)$/;

function parseQuestion(id, lines, where, errors) {
  const q = { id, text: [], options: [], answers: [], answerNotes: [], format: "", hints: [], explanation: [] };
  let mode = "text";
  for (const line of lines) {
    if (mode === "explanation") {
      q.explanation.push(line);
      continue;
    }
    const opt = line.match(OPTION);
    const kw = line.match(KEYWORD);
    const note = line.match(ANSWER_NOTE);
    if (opt) {
      q.options.push({ kind: opt[1] === "(" ? "single" : "multiple", correct: opt[2].trim() !== "", md: opt[3], note: [] });
      mode = "option";
    } else if (mode === "option" && OPTION_NOTE.test(line)) {
      q.options.at(-1).note.push(line.match(OPTION_NOTE)[1]);
    } else if (note) {
      q.answerNotes.push({ answer: note[1].trim(), md: note[2].trim() });
      mode = "field";
    } else if (kw) {
      const [, word, rest] = kw;
      if (word === "Ответ") q.answers.push(rest.trim());
      if (word === "Формат") q.format = rest.trim();
      if (word === "Подсказка") { q.hints.push([rest]); mode = "hint"; continue; }
      if (word === "Пояснение") { mode = "explanation"; if (rest.trim()) q.explanation.push(rest); continue; }
      mode = "field";
    } else if (mode === "text") {
      q.text.push(line);
    } else if (mode === "option" && /^\s{2,}\S/.test(line)) {
      q.options.at(-1).md += "\n" + line.trim();
    } else if (mode === "hint" && line.trim()) {
      q.hints.at(-1).push(line);
    } else if (line.trim()) {
      errors.push(`${where}: непонятная строка «${line.trim()}» — ожидается вариант, Ответ:, Формат:, Подсказка: или Пояснение:`);
    }
  }

  const kinds = new Set(q.options.map((o) => o.kind));
  if (q.options.length && q.answers.length) errors.push(`${where}: есть и варианты, и «Ответ:» — оставьте что-то одно`);
  if (kinds.size > 1) errors.push(`${where}: варианты и с ( ), и с [ ] — выберите одно`);
  q.type = q.options.length ? [...kinds][0] : "text";

  if (!q.text.join("").trim()) errors.push(`${where}: пустое условие`);
  if (!q.explanation.join("").trim()) errors.push(`${where}: нет пояснения`);
  if (q.type === "single") {
    const k = q.options.filter((o) => o.correct).length;
    if (k !== 1) errors.push(`${where}: одиночный выбор, а отмечено верных: ${k}`);
  }
  if (q.type === "multiple" && !q.options.some((o) => o.correct)) {
    errors.push(`${where}: не отмечено ни одного верного варианта`);
  }
  if (q.options.length === 1) errors.push(`${where}: один вариант ответа`);
  if (q.answerNotes.length && q.type !== "text") {
    errors.push(`${where}: «Если ответ …:» бывает только у краткого ответа, у вариантов — строка «  > …» под вариантом`);
  }
  if (q.type === "text") {
    if (!q.answers.length) errors.push(`${where}: нет ни вариантов, ни «Ответ:»`);
    if (!q.format) errors.push(`${where}: нет «Формат:» — студент не узнает, как вводить ответ`);
  }
  return q;
}

export function parseTest(id, rawContent = null) {
  const dir = path.join(CONTENT, id);
  let raw = "";
  if (rawContent !== null && typeof rawContent === "string") {
    raw = rawContent;
  } else {
    const testPath = path.join(dir, "test.md");
    if (!fs.existsSync(testPath)) return null;
    raw = fs.readFileSync(testPath, "utf8");
  }
  raw = raw.replace(/\r\n/g, "\n");
  const errors = [];
  const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
  const meta = fm ? YAML.parse(fm[1]) || {} : {};
  const body = fm ? raw.slice(fm[0].length) : raw;
  if (!meta.title) errors.push(`${id}: нет title во фронтматтере`);

  const sections = [];
  let section = null, current = null, auto = 0;
  const flush = () => {
    if (!current) return;
    if (!section) sections.push(section = { title: "", questions: [] });
    section.questions.push(current);
    current = null;
  };
  for (const line of body.split("\n")) {
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    if (h1) {
      flush();
      sections.push(section = { title: h1[1].trim(), questions: [] });
    } else if (h2) {
      flush();
      const qid = h2[1].trim().split(/[\s.]/)[0] || String(++auto);
      current = { id: qid, lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      errors.push(`${id}: текст до первого задания: «${line.trim()}»`);
    }
  }
  flush();

  const seen = new Set();
  const images = new Set();
  let n = 0;
  let where = "";
  const used = { math: false };
  const md = markdownFor(dir, images, errors, () => where, used);
  for (const s of sections) {
    s.questions = s.questions.map((c) => {
      n++;
      where = `${id}, задание ${c.id}`;
      if (seen.has(c.id)) errors.push(`${where}: номер повторяется`);
      seen.add(c.id);
      const q = parseQuestion(c.id, c.lines, where, errors);
      q.n = n;
      q.html = md.parse(q.text.join("\n").trim());
      q.optionsHtml = q.options.map((o) => md.parseInline(o.md));
      q.hintsHtml = q.hints.map((h) => md.parse(h.join("\n").trim()));
      q.explanationHtml = md.parse(q.explanation.join("\n").trim());
      q.optionNotesHtml = q.options.map((o) => (o.note.length ? md.parse(o.note.join("\n").trim()) : null));
      q.answerNotesHtml = q.answerNotes.map((n) => ({ answer: n.answer, note: md.parseInline(n.md) }));
      q.formatHtml = md.parseInline(q.format);
      q.pictures = q.options.length > 0 && q.options.every((o) => /^!\[/.test(o.md.trim()));
      q.key = keyOf(q);
      checkKey(q, where, errors);
      return q;
    });
  }
  where = id;
  const description = meta.description ? md.parse(String(meta.description)) : "";
  meta.topic = meta.topic || meta.category || meta.folder || "Общее";
  return { id, dir, meta, description, sections, count: n, images, errors, math: used.math };
}

function keyOf(q) {
  const key = { id: q.id, n: q.n, type: q.type };
  if (q.type === "text") {
    key.answer = q.answers;
    key.compare = guessCompare(q.answers);
  } else {
    key.answer = q.options.flatMap((o, i) => (o.correct ? [i] : []));
    key.labels = q.options.map((o, i) => {
      const t = plain(o.md);
      return t && t !== LETTERS[i] ? `${LETTERS[i]}) ${t}` : LETTERS[i];
    });
  }
  return key;
}

function checkKey(q, where, errors) {
  if (q.type !== "text") return;
  const k = q.key;
  for (const n of q.answerNotes) {
    if (isCorrect(k, n.answer)) errors.push(`${where}: «Если ответ ${n.answer}» — это верный ответ, примечание к нему не покажется`);
  }
  for (const a of k.answer) {
    if (!isCorrect(k, a)) errors.push(`${where}: строка ключа «${a}» не разбирается как ${k.compare}`);
  }
  if (q.answers.some((a) => /[∀∃∪∩⊆⊂∈∉×⇒⇔¬∧∨]/.test(a))) {
    errors.push(`${where}: в ключе спецсимвол, который не набрать с клавиатуры телефона`);
  }
}

export function serializeTest(test) {
  const meta = { ...test.meta };
  delete meta.feedback;
  const lines = ["---"];
  if (meta.title) lines.push(`title: ${meta.title}`);
  if (meta.topic) lines.push(`topic: ${meta.topic}`);
  if (meta.order !== undefined) lines.push(`order: ${meta.order}`);
  if (meta.hidden) lines.push("hidden: true");
  if (meta.description) {
    const desc = String(meta.description).trim();
    if (desc.includes("\n")) {
      lines.push("description: |");
      for (const l of desc.split("\n")) lines.push(`  ${l}`);
    } else {
      lines.push(`description: ${JSON.stringify(desc)}`);
    }
  }
  lines.push("---");
  lines.push("");

  for (const s of test.sections) {
    if (s.title) {
      lines.push(`# ${s.title}`);
      lines.push("");
    }
    for (const q of s.questions) {
      lines.push(`## ${q.id}`);
      lines.push("");
      lines.push((Array.isArray(q.text) ? q.text.join("\n") : String(q.text || "")).trim());
      lines.push("");

      if (q.options && q.options.length) {
        for (const opt of q.options) {
          const isSingle = opt.kind === "single" || (!opt.kind && q.type === "single");
          const bracketOpen = isSingle ? "(" : "[";
          const bracketClose = isSingle ? ")" : "]";
          const mark = opt.correct ? "x" : " ";
          lines.push(`- ${bracketOpen}${mark}${bracketClose} ${opt.md}`);
          if (opt.note) {
            const notes = Array.isArray(opt.note) ? opt.note : [opt.note];
            for (const n of notes) if (n) lines.push(`  > ${n}`);
          }
        }
        lines.push("");
      }

      if (q.answers && q.answers.length) {
        for (const ans of q.answers) lines.push(`Ответ: ${ans}`);
      }
      if (q.format) lines.push(`Формат: ${q.format}`);
      if (q.answerNotes && q.answerNotes.length) {
        for (const an of q.answerNotes) lines.push(`Если ответ ${an.answer}: ${an.md}`);
      }
      if (q.hints && q.hints.length) {
        for (const h of q.hints) lines.push(`Подсказка: ${(Array.isArray(h) ? h.join("\n") : h).trim()}`);
      }
      if (q.explanation && q.explanation.length) {
        lines.push(`Пояснение: ${(Array.isArray(q.explanation) ? q.explanation.join("\n") : q.explanation).trim()}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ---------- Разбор конспектов ----------

function extractToc(mdText) {
  const lines = mdText.split("\n");
  const toc = [];
  for (const line of lines) {
    const m = line.match(/^(#{2,3})\s+(.+)$/);
    if (m) {
      const level = m[1].length;
      const title = m[2].replace(/[*`$]/g, "").trim();
      const id = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
      toc.push({ level, title, id });
    }
  }
  return toc;
}

export function parseNote(id) {
  const noteDir = path.join(CONTENT, "notes", id);
  const noteFile = path.join(noteDir, "note.md");
  if (!fs.existsSync(noteFile)) return null;
  const raw = fs.readFileSync(noteFile, "utf8");

  let meta = { title: id, topic: "Общее", order: 1, icon: "📄", description: "", hidden: false };
  let bodyMd = raw;

  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      const yamlStr = raw.slice(3, end);
      try {
        const parsedMeta = YAML.parse(yamlStr);
        if (parsedMeta && typeof parsedMeta === "object") {
          meta = { ...meta, ...parsedMeta, hidden: Boolean(parsedMeta.hidden) };
        }
      } catch {}
      bodyMd = raw.slice(end + 4).trim();
    }
  }

  const images = new Set();
  const { html, usedMath } = renderMarkdown(bodyMd);
  const toc = extractToc(bodyMd);

  // Check for local images in noteDir
  if (fs.existsSync(noteDir)) {
    for (const f of fs.readdirSync(noteDir)) {
      if (/\.(png|jpe?g|svg|webp|gif)$/i.test(f) && bodyMd.includes(f)) {
        images.add(f);
      }
    }
  }

  return {
    id,
    dir: noteDir,
    meta,
    rawMd: bodyMd,
    fullRaw: raw,
    html,
    toc,
    images: Array.from(images),
    math: usedMath,
  };
}

export function serializeNote(data) {
  const meta = data.meta || {};
  const lines = ["---"];
  if (meta.title) lines.push(`title: ${JSON.stringify(meta.title)}`);
  if (meta.topic) lines.push(`topic: ${JSON.stringify(meta.topic)}`);
  if (meta.order !== undefined) lines.push(`order: ${Number(meta.order) || 1}`);
  if (meta.icon) lines.push(`icon: ${JSON.stringify(meta.icon)}`);
  if (meta.hidden) lines.push("hidden: true");
  if (meta.description) {
    const desc = String(meta.description).trim();
    if (desc.includes("\n")) {
      lines.push("description: |");
      for (const l of desc.split("\n")) lines.push(`  ${l}`);
    } else {
      lines.push(`description: ${JSON.stringify(desc)}`);
    }
  }
  lines.push("---");
  lines.push("");
  lines.push((data.rawMd || "").trim());
  lines.push("");
  return lines.join("\n");
}

// ---------- Сборка проекта в dist ----------

export function build() {
  const t0 = Date.now();
  syncFromDisk("content");

  const site = YAML.parse(fs.readFileSync(path.join(CONTENT, "site.yml"), "utf8")) || {};
  const ids = fs.readdirSync(CONTENT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(CONTENT, d.name, "test.md")))
    .map((d) => d.name);

  const errors = [];
  const tests = [];
  for (const id of ids) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      errors.push(`${id}: имя папки — только латиница, цифры, - и _ (оно попадёт в ссылку)`);
      continue;
    }
    const t = parseTest(id);
    errors.push(...t.errors);
    tests.push(t);
  }

  // Load and parse notes
  const notesDir = path.join(CONTENT, "notes");
  const notes = [];
  if (fs.existsSync(notesDir)) {
    const noteIds = fs.readdirSync(notesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(notesDir, d.name, "note.md")))
      .map((d) => d.name);

    for (const nid of noteIds) {
      try {
        const n = parseNote(nid);
        if (n) notes.push(n);
      } catch (err) {
        errors.push(`Конспект ${nid}: ${err.message}`);
      }
    }
  }

  notes.sort((a, b) => (a.meta.order ?? 1e9) - (b.meta.order ?? 1e9) || a.id.localeCompare(b.id));
  tests.sort((a, b) => (a.meta.order ?? 1e9) - (b.meta.order ?? 1e9) || a.id.localeCompare(b.id));

  if (errors.length) {
    console.error("Ошибки в материалах:\n  " + errors.join("\n  "));
    process.exitCode = 1;
    return;
  }

  // Prepare dist output directory
  fs.mkdirSync(DIST, { recursive: true });
  fs.mkdirSync(path.join(DIST, "assets", "fonts"), { recursive: true });
  fs.mkdirSync(path.join(DIST, "js"), { recursive: true });

  fs.copyFileSync(path.join(SRC, "style.css"), path.join(DIST, "assets", "style.css"));
  const fontDir = path.join(ROOT, "node_modules", "@fontsource");
  const fonts = [
    [path.join(fontDir, "onest", "files", "onest-cyrillic-400-normal.woff2"), "onest-cyrillic-400-normal.woff2"],
    [path.join(fontDir, "onest", "files", "onest-latin-400-normal.woff2"), "onest-latin-400-normal.woff2"],
    [path.join(fontDir, "onest", "files", "onest-cyrillic-500-normal.woff2"), "onest-cyrillic-500-normal.woff2"],
    [path.join(fontDir, "onest", "files", "onest-latin-500-normal.woff2"), "onest-latin-500-normal.woff2"],
    [path.join(fontDir, "onest", "files", "onest-cyrillic-600-normal.woff2"), "onest-cyrillic-600-normal.woff2"],
    [path.join(fontDir, "onest", "files", "onest-latin-600-normal.woff2"), "onest-latin-600-normal.woff2"],
    [path.join(fontDir, "unbounded", "files", "unbounded-cyrillic-600-normal.woff2"), "unbounded-cyrillic-600-normal.woff2"],
  ];
  for (const [src, dst] of fonts) {
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST, "assets", "fonts", dst));
  }
  fs.copyFileSync(path.join(SRC, "fonts", "dejavu-math.woff2"), path.join(DIST, "assets", "fonts", "dejavu-math.woff2"));
  
  const kx = path.join(ROOT, "node_modules", "katex", "dist");
  fs.mkdirSync(path.join(DIST, "assets", "katex", "fonts"), { recursive: true });
  fs.copyFileSync(path.join(kx, "katex.min.css"), path.join(DIST, "assets", "katex", "katex.min.css"));
  fs.copyFileSync(path.join(kx, "katex.min.js"), path.join(DIST, "assets", "katex", "katex.min.js"));
  const autoRenderSrc = path.join(kx, "contrib", "auto-render.min.js");
  if (fs.existsSync(autoRenderSrc)) {
    fs.copyFileSync(autoRenderSrc, path.join(DIST, "assets", "katex", "auto-render.min.js"));
  }
  for (const f of fs.readdirSync(path.join(kx, "fonts")).filter((f) => f.endsWith(".woff2"))) {
    fs.copyFileSync(path.join(kx, "fonts", f), path.join(DIST, "assets", "katex", "fonts", f));
  }
  const mk = path.join(ROOT, "node_modules", "marked", "lib", "marked.umd.js");
  if (fs.existsSync(mk)) {
    fs.copyFileSync(mk, path.join(DIST, "assets", "marked.min.js"));
  }
  for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith(".js"))) {
    fs.copyFileSync(path.join(SRC, f), path.join(DIST, "js", f));
  }

  const sb = site.supabase || {};
  fs.writeFileSync(path.join(DIST, "js", "config.js"),
    `export const SUPABASE_URL = ${JSON.stringify(sb.url || "")};\n`
    + `export const SUPABASE_KEY = ${JSON.stringify(sb.key || "")};\n`);

  // Build each test
  for (const t of tests) {
    const out = path.join(DIST, t.id);
    fs.mkdirSync(out, { recursive: true });
    for (const img of t.images) {
      fs.mkdirSync(path.dirname(path.join(out, img)), { recursive: true });
      fs.copyFileSync(path.join(t.dir, img), path.join(out, img));
    }
    fs.writeFileSync(path.join(out, "index.html"), quizPage(t, site));
    const questions = t.sections.flatMap((s) => s.questions);
    fs.writeFileSync(path.join(out, "key.json"), JSON.stringify({
      id: t.id,
      title: t.meta.title,
      questions: questions.map((q) => {
        const out = { ...q.key, explanation: q.explanationHtml };
        if (q.optionNotesHtml && q.optionNotesHtml.some(Boolean)) out.notes = q.optionNotesHtml;
        if (q.answerNotesHtml && q.answerNotesHtml.length) out.answerNotes = q.answerNotesHtml;
        return out;
      }),
    }));
  }

  // Build notes
  const notesOut = path.join(DIST, "notes");
  fs.mkdirSync(notesOut, { recursive: true });
  for (const n of notes) {
    for (const img of n.images) {
      fs.mkdirSync(path.dirname(path.join(notesOut, img)), { recursive: true });
      fs.copyFileSync(path.join(n.dir, img), path.join(notesOut, img));
    }
  }
  fs.writeFileSync(path.join(notesOut, "index.html"), notesPage(notes, site));
  fs.writeFileSync(path.join(DIST, "notes.json"), JSON.stringify(
    notes.map((n) => ({
      id: n.id,
      title: n.meta.title || n.id,
      description: n.meta.description || "",
      topic: n.meta.topic || "Общее",
      order: n.meta.order ?? 1,
      icon: n.meta.icon || "📄",
      hidden: Boolean(n.meta.hidden),
    }))
  ));

  // Build colloquiums
  let colloquiums = [];
  try {
    colloquiums = getAllColloquiumQuestions();
  } catch {}
  if (!colloquiums || !colloquiums.length) {
    const colDir = path.join(CONTENT, "colloquiums");
    for (const f of ["colloquium-1.json", "colloquium-2.json"]) {
      const p = path.join(colDir, f);
      if (fs.existsSync(p)) {
        try {
          const list = JSON.parse(fs.readFileSync(p, "utf8"));
          colloquiums.push(...list);
        } catch {}
      }
    }
  }

  const renderedColloquiums = (colloquiums || []).map((item) => {
    return {
      id: item.id,
      colloquium_id: item.colloquium_id || item.colloquium || 1,
      colloquium: item.colloquium_id || item.colloquium || 1,
      num: item.num,
      term: item.term,
      definition: item.definition,
      examples: item.examples || "",
      hidden: Boolean(item.hidden),
      definitionHtml: renderMarkdown(item.definition || "").html,
      examplesHtml: item.examples ? renderMarkdown(item.examples).html : "",
    };
  });

  const colOut = path.join(DIST, "colloquiums");
  fs.mkdirSync(colOut, { recursive: true });
  fs.writeFileSync(path.join(colOut, "index.html"), colloquiumsPage(renderedColloquiums, site));
  fs.writeFileSync(path.join(DIST, "colloquiums.json"), JSON.stringify(renderedColloquiums));

  // Build leaderboard, profile, contests
  const lbOut = path.join(DIST, "leaderboard");
  fs.mkdirSync(lbOut, { recursive: true });
  fs.writeFileSync(path.join(lbOut, "index.html"), leaderboardPage(site));

  const profOut = path.join(DIST, "profile");
  fs.mkdirSync(profOut, { recursive: true });
  fs.writeFileSync(path.join(profOut, "index.html"), profilePage(site));

  const cntOut = path.join(DIST, "contests");
  fs.mkdirSync(cntOut, { recursive: true });
  fs.writeFileSync(path.join(cntOut, "index.html"), contestsPage(site));
  fs.writeFileSync(path.join(cntOut, "room.html"), contestRoomPage(site));

  // Build tests catalog & custom test runner
  const testsOut = path.join(DIST, "tests");
  fs.mkdirSync(testsOut, { recursive: true });
  fs.writeFileSync(path.join(testsOut, "index.html"), testsPage(tests, site));
  fs.writeFileSync(path.join(testsOut, "custom.html"), customTestPage(site));

  // Build global questions pool for random generator
  const allQuestionsPool = tests.filter((t) => !t.meta.hidden).flatMap((t) =>
    (t.sections || []).flatMap((s) => (s.questions || []).map((q) => {
      let fixedHtml = q.html || "";
      fixedHtml = fixedHtml.replace(/<img([^>]+)src=["'](?!https?:\/\/|\/|\.\.\/)([^"']+)["']/gi, (match, prefix, src) => {
        return `<img${prefix}src="../${t.id}/${src}"`;
      });

      const options = (q.options || []).map((o, idx) => ({
        ...o,
        html: q.optionsHtml?.[idx] || o.html || o.md || "",
      }));

      return {
        uid: `${t.id}_${q.id}`,
        testId: t.id,
        testTitle: t.meta.title || t.id,
        topic: t.meta.topic || "Общее",
        section: s.title || "",
        id: q.id,
        n: q.n,
        type: q.type,
        html: fixedHtml,
        options,
        optionsHtml: q.optionsHtml || [],
        hintsHtml: q.hintsHtml || [],
        explanationHtml: q.explanationHtml || "",
        optionNotesHtml: q.optionNotesHtml || [],
        answerNotesHtml: q.answerNotesHtml || [],
        key: q.key || null,
      };
    }))
  );
  fs.writeFileSync(path.join(DIST, "pool.json"), JSON.stringify(allQuestionsPool));
  const distTestsDir = path.join(DIST, "tests");
  if (fs.existsSync(distTestsDir)) {
    fs.writeFileSync(path.join(distTestsDir, "pool.json"), JSON.stringify(allQuestionsPool));
  }

  // Build practices
  let practices = [];
  try {
    practices = getAllPractices({ includeUnpublished: true });
  } catch {}
  const renderedPractices = practices.map((p) => ({
    ...p,
    html: renderMarkdown(p.content || "").html,
  }));
  const practicesOut = path.join(DIST, "practices");
  fs.mkdirSync(practicesOut, { recursive: true });
  fs.writeFileSync(path.join(practicesOut, "index.html"), practicesPage(renderedPractices, site));
  fs.writeFileSync(path.join(DIST, "practices.json"), JSON.stringify(renderedPractices));

  // Build homeworks
  let homeworks = [];
  try {
    homeworks = getAllHomeworks({ includeUnpublished: true });
  } catch {}
  const renderedHomeworks = homeworks.map((h) => ({
    ...h,
    html: renderMarkdown(h.content || "").html,
  }));
  const homeworksOut = path.join(DIST, "homeworks");
  fs.mkdirSync(homeworksOut, { recursive: true });
  fs.writeFileSync(path.join(homeworksOut, "index.html"), homeworksPage(renderedHomeworks, site));
  fs.writeFileSync(path.join(DIST, "homeworks.json"), JSON.stringify(renderedHomeworks));

  // Build admin & home
  const visibleColloquiumsCount = renderedColloquiums.filter((c) => !c.hidden).length;
  fs.writeFileSync(path.join(DIST, "admin.html"), adminPage(site));
  fs.writeFileSync(path.join(DIST, "index.html"), indexPage(tests, notes, site, visibleColloquiumsCount));
  fs.writeFileSync(path.join(DIST, "tests.json"), JSON.stringify(
    tests.map((t) => ({ id: t.id, title: t.meta.title, count: t.count, topic: t.meta.topic || "", hidden: Boolean(t.meta.hidden) }))));

  const total = tests.reduce((sum, t) => sum + t.count, 0);
  console.log(`Собрано: ${tests.length} теста, `
    + `${tasksWord(total)}, ${notes.length} конспектов, ${renderedColloquiums.length} вопросов коллоквиума, ${renderedPractices.length} практик, ${renderedHomeworks.length} ДЗ, ${Date.now() - t0} мс`);
}
