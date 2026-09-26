// Сборка сайта: content/**/test.md → dist/.
//   node build.mjs           собрать
//   node build.mjs --serve   собрать, открыть на localhost:8000 и пересобирать при изменениях
//
// Формат test.md описан в README. Ошибки в заданиях (ключ, картинки, формат) собираются
// в один список, и сборка падает: на сайт не попадает тест с битым ключом.

import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import YAML from "yaml";
import katex from "katex";
import { guessCompare, isCorrect, LETTERS } from "./src/grade.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, "content");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const FONT_FILES = [
  ...["400", "500", "600"].flatMap((w) => ["cyrillic", "latin"].map((s) => `onest/files/onest-${s}-${w}-normal.woff2`)),
  ...["500", "700"].flatMap((w) => ["cyrillic", "latin"].map((s) => `unbounded/files/unbounded-${s}-${w}-normal.woff2`)),
];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
const tasksWord = (n) => `${n} ${plural(n, "задание", "задания", "заданий")}`;

// ---------- markdown ----------

// $…$ — формула в строке, $$…$$ — отдельной строкой. Рендерится при сборке:
// на сайте только HTML и стили KaTeX, без скриптов. Ошибка в формуле — ошибка сборки.
function mathExtension(errors, where, used) {
  const render = (tex, displayMode) => {
    used.math = true;
    try {
      return katex.renderToString(tex, { displayMode, throwOnError: true, strict: "ignore" });
    } catch (e) {
      errors.push(`${where()}: формула $${tex}$: ${e.message.replace(/^KaTeX parse error: /, "")}`);
      return `<code>${esc(tex)}</code>`;
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

// Локальные PNG и SVG считаются схемами: в тёмной теме SVG из dm_figures перекрашивается сам,
// PNG затемняется фильтром. Фото (jpg, webp или с подписью "фото") показываются как есть.
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

// Текст для CSV и статистики: без разметки, картинка — по подписи.
function plain(s) {
  return s.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*`$]/g, "").trim();
}

// ---------- разбор test.md ----------

const OPTION = /^- ([([])([xXхХ ])[)\]]\s+(.*)$/;
const KEYWORD = /^(Ответ|Формат|Подсказка|Пояснение)\s*:\s*(.*)$/;

function parseQuestion(id, lines, where, errors) {
  const q = { id, text: [], options: [], answers: [], format: "", hints: [], explanation: [] };
  let mode = "text";
  for (const line of lines) {
    if (mode === "explanation") {
      q.explanation.push(line);
      continue;
    }
    const opt = line.match(OPTION);
    const kw = line.match(KEYWORD);
    if (opt) {
      q.options.push({ kind: opt[1] === "(" ? "single" : "multiple", correct: opt[2].trim() !== "", md: opt[3] });
      mode = "option";
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
  if (q.type === "text") {
    if (!q.answers.length) errors.push(`${where}: нет ни вариантов, ни «Ответ:»`);
    if (!q.format) errors.push(`${where}: нет «Формат:» — студент не узнает, как вводить ответ`);
  }
  return q;
}

function parseTest(id) {
  const dir = path.join(CONTENT, id);
  const raw = fs.readFileSync(path.join(dir, "test.md"), "utf8").replace(/\r\n/g, "\n");
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
      q.formatHtml = md.parseInline(q.format);
      q.pictures = q.options.length > 0 && q.options.every((o) => /^!\[/.test(o.md.trim()));
      q.key = keyOf(q);
      checkKey(q, where, errors);
      return q;
    });
  }
  where = id;
  const description = meta.description ? md.parse(String(meta.description)) : "";
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
  // каждая строка ключа должна засчитываться как верный ответ
  for (const a of k.answer) {
    if (!isCorrect(k, a)) errors.push(`${where}: строка ключа «${a}» не разбирается как ${k.compare}`);
  }
  if (q.answers.some((a) => /[∀∃∪∩⊆⊂∈∉×⇒⇔¬∧∨]/.test(a))) {
    errors.push(`${where}: в ключе спецсимвол, который не набрать с клавиатуры телефона`);
  }
}

// ---------- страницы ----------

function head(title, rel, extra = "", math = false) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<link rel="preload" href="${rel}assets/fonts/onest-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
${math ? `<link rel="stylesheet" href="${rel}assets/katex/katex.min.css">\n` : ""}<link rel="stylesheet" href="${rel}assets/style.css">
${extra}</head>`;
}

function questionHtml(q) {
  const name = `q-${esc(q.id)}`;
  let answer;
  if (q.type === "text") {
    const mode = q.key.compare === "number" ? ' inputmode="decimal"' : "";
    answer = `<div class="answer-field">
  <p class="format">${q.formatHtml}</p>
  <input class="text-input" type="text" name="${name}" aria-label="Ответ к заданию ${q.n}"
         autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next"${mode}>
  <p class="format-warn" hidden></p>
</div>`;
  } else {
    const input = q.type === "single" ? "radio" : "checkbox";
    const opts = q.optionsHtml.map((html, i) => `
  <label class="opt">
    <input type="${input}" name="${name}" value="${i}">
    <span class="badge" aria-hidden="true">${LETTERS[i]}</span>
    <span class="opt-body">${html}</span>
  </label>`).join("");
    const note = q.type === "multiple" ? `<p class="note">Отметьте все верные варианты</p>` : "";
    answer = `${note}<div class="options ${q.type}${q.pictures ? " pictures" : ""}" role="${q.type === "single" ? "radiogroup" : "group"}" aria-label="Варианты к заданию ${q.n}">${opts}
</div>`;
  }
  const hints = q.hintsHtml.length ? `<div class="hints">${q.hintsHtml.map((h, i) => `
  <div class="hint" hidden><p class="hint-label">Подсказка${q.hintsHtml.length > 1 ? ` ${i + 1}` : ""}</p>${h}</div>`).join("")}
</div>` : "";
  return `
<article class="q" id="q-${esc(q.id)}" data-id="${esc(q.id)}" data-type="${q.type}"${q.type === "text" ? ` data-compare="${q.key.compare}"` : ""}>
  <div class="q-num">${q.n}</div>
  <div class="q-body">
    <div class="q-text">${q.html}</div>
    ${answer}
    ${hints}
    <div class="q-tools">
      ${q.hintsHtml.length ? `<button class="btn quiet hint-btn" type="button">Подсказка</button>` : ""}
      <button class="btn quiet check-btn" type="button">Проверить</button>
      <button class="btn quiet clear-btn" type="button" hidden>Очистить ответ</button>
    </div>
    <div class="review" hidden></div>
  </div>
</article>`;
}

function quizPage(test, site) {
  const { meta, sections, count } = test;
  const groups = (site.groups || []).map((g) => `<option value="${esc(g)}">`).join("");
  const blocks = sections.map((s) => `
<section class="block" data-title="${esc(s.title)}">
  ${s.title ? `<h2>${esc(s.title)}</h2>` : ""}
  ${s.questions.map(questionHtml).join("\n")}
</section>`).join("\n");
  const map = sections.flatMap((s) => s.questions).map((q) =>
    `<button type="button" data-go="${esc(q.id)}">${q.n}</button>`).join("");

  return `${head(meta.title, "../", "", test.math)}
<body class="quiz" data-id="${esc(test.id)}" data-count="${count}" data-group-pattern="${esc(site.groupPattern || "")}">
<header class="topbar">
  <a class="topbar-back" href="../" aria-label="Все тесты">Все тесты</a>
  <span class="topbar-title">${esc(meta.title)}</span>
  <button class="topbar-count" id="map-open" type="button" aria-label="Карта заданий"><span id="count">0</span>&thinsp;/&thinsp;${count}</button>
  <div class="progress" aria-hidden="true"><div id="progress-bar"></div></div>
</header>
<main class="sheet">
  <section class="intro">
    <h1>${esc(meta.title)}</h1>
    ${test.description ? `<div class="lead">${test.description}</div>` : ""}
    <p class="meta">${tasksWord(count)}</p>
  </section>

  <section class="start" id="start">
    <label class="group-field">
      <span class="field-label">Группа</span>
      <input id="group" type="text" list="groups" placeholder="M3101" autocomplete="off"
             autocapitalize="characters" spellcheck="false" maxlength="12">
      <datalist id="groups">${groups}</datalist>
      <span class="field-error" id="group-error" hidden></span>
    </label>
    <fieldset class="modes">
      <legend class="field-label">Как проходить</legend>
      <label class="mode">
        <input type="radio" name="mode" value="exam" checked>
        <span class="mode-name">Как контрольная</span>
        <span class="mode-desc">Ответы и разбор после отправки всего теста</span>
      </label>
      <label class="mode">
        <input type="radio" name="mode" value="practice">
        <span class="mode-name">Тренировка</span>
        <span class="mode-desc">Каждое задание можно проверить сразу</span>
      </label>
    </fieldset>
    <button class="btn primary" id="start-btn" type="button">Начать</button>
  </section>

  <section class="result" id="result" hidden></section>

  <div class="questions">${blocks}
  </div>

  ${meta.feedback ? `<section class="feedback">
    <label><span class="field-label">${esc(meta.feedback)}</span>
    <textarea id="feedback" rows="3" maxlength="2000"></textarea></label>
  </section>` : ""}
</main>

<div class="actionbar" id="actionbar">
  <p class="action-note" id="action-note"></p>
  <div class="actions" id="actions">
    <button class="btn primary" id="submit" type="button">Отправить</button>
  </div>
</div>

<dialog id="map" aria-label="Карта заданий">
  <div class="map-head"><span>Задания</span><button class="btn quiet" type="button" data-close>Закрыть</button></div>
  <div class="map-grid">${map}</div>
</dialog>
<dialog id="zoom"><img alt=""></dialog>
<script type="module" src="../js/quiz.js"></script>
</body>
</html>
`;
}

function indexPage(tests, site) {
  const md = new Marked({ breaks: true });
  const items = tests.filter((t) => !t.meta.hidden).map((t) => `
  <li><a href="${esc(t.id)}/" data-id="${esc(t.id)}" data-count="${t.count}">
    <span class="t-title">${esc(t.meta.title)}</span>
    <span class="t-meta">${tasksWord(t.count)}</span>
    <span class="t-status"></span>
  </a></li>`).join("");
  return `${head(site.title || "Тренажёры", "")}
<body class="home">
<main class="sheet">
  <section class="intro">
    <h1>${esc(site.title || "Тренажёры")}</h1>
    ${site.description ? `<div class="lead">${md.parse(String(site.description))}</div>` : ""}
  </section>
  <ol class="tests">${items}
  </ol>
</main>
<script type="module" src="js/home.js"></script>
</body>
</html>
`;
}

function adminPage() {
  return `${head("Статистика", "", '<meta name="robots" content="noindex">\n')}
<body class="admin">
<main class="sheet" id="app"><p class="muted">Загружаем…</p></main>
<script type="module" src="js/admin.js"></script>
</body>
</html>
`;
}

// ---------- сборка ----------

function build() {
  const t0 = Date.now();
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
  if (errors.length) {
    const err = new Error(`Сайт не собран, исправьте:\n  ${errors.join("\n  ")}`);
    err.list = errors;
    throw err;
  }
  tests.sort((a, b) => (a.meta.order ?? 1e9) - (b.meta.order ?? 1e9) || a.id.localeCompare(b.id));

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, "assets"), { recursive: true });
  fs.mkdirSync(path.join(DIST, "js"), { recursive: true });
  fs.writeFileSync(path.join(DIST, ".nojekyll"), "");
  fs.copyFileSync(path.join(SRC, "style.css"), path.join(DIST, "assets", "style.css"));
  fs.mkdirSync(path.join(DIST, "assets", "fonts"));
  for (const f of FONT_FILES) {
    fs.copyFileSync(path.join(ROOT, "node_modules", "@fontsource", f), path.join(DIST, "assets", "fonts", path.basename(f)));
  }
  fs.copyFileSync(path.join(SRC, "fonts", "dejavu-math.woff2"), path.join(DIST, "assets", "fonts", "dejavu-math.woff2"));
  if (tests.some((t) => t.math)) {
    const kx = path.join(ROOT, "node_modules", "katex", "dist");
    fs.mkdirSync(path.join(DIST, "assets", "katex", "fonts"), { recursive: true });
    fs.copyFileSync(path.join(kx, "katex.min.css"), path.join(DIST, "assets", "katex", "katex.min.css"));
    for (const f of fs.readdirSync(path.join(kx, "fonts")).filter((f) => f.endsWith(".woff2"))) {
      fs.copyFileSync(path.join(kx, "fonts", f), path.join(DIST, "assets", "katex", "fonts", f));
    }
  }
  for (const f of fs.readdirSync(SRC).filter((f) => f.endsWith(".js"))) {
    fs.copyFileSync(path.join(SRC, f), path.join(DIST, "js", f));
  }
  const sb = site.supabase || {};
  fs.writeFileSync(path.join(DIST, "js", "config.js"),
    `export const SUPABASE_URL = ${JSON.stringify(sb.url || "")};\n`
    + `export const SUPABASE_KEY = ${JSON.stringify(sb.key || "")};\n`);

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
      questions: questions.map((q) => ({ ...q.key, explanation: q.explanationHtml })),
    }));
  }
  fs.writeFileSync(path.join(DIST, "index.html"), indexPage(tests, site));
  fs.writeFileSync(path.join(DIST, "admin.html"), adminPage());
  fs.writeFileSync(path.join(DIST, "tests.json"), JSON.stringify(
    tests.map((t) => ({ id: t.id, title: t.meta.title, count: t.count, hidden: Boolean(t.meta.hidden) }))));

  const total = tests.reduce((s, t) => s + t.count, 0);
  console.log(`Собрано: ${tests.length} ${plural(tests.length, "тест", "теста", "тестов")}, `
    + `${tasksWord(total)}, ${Date.now() - t0} мс`);
}

// ---------- локальный сервер ----------

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".gif": "image/gif",
};

function serve() {
  const port = Number(process.env.PORT) || 8000;
  http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(DIST, p);
    if (!file.startsWith(DIST)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) return res.writeHead(404).end("Не найдено");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`http://localhost:${port}/`));

  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try { build(); } catch (e) { console.error(e.message); }
    }, 150);
  };
  fs.watch(CONTENT, { recursive: true }, rebuild);
  fs.watch(SRC, { recursive: true }, rebuild);
}

try {
  build();
} catch (e) {
  console.error(e.message);
  if (!process.argv.includes("--serve")) process.exit(1);
}
if (process.argv.includes("--serve")) serve();
