import { Marked } from "marked";
import { escapeHtml as esc } from "./markdown.mjs";

const LETTERS = "АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ";

export function tasksWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return `${n} заданий`;
  if (mod10 === 1) return `${n} задание`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} задания`;
  return `${n} заданий`;
}

export function head(title, rel, extra = "", math = false) {
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

export function questionHtml(q) {
  const name = `q-${esc(q.id)}`;
  let answer;
  if (q.type === "text") {
    const mode = q.key?.compare === "number" ? ' inputmode="decimal"' : "";
    answer = `<div class="answer-field">
  <p class="format">${q.formatHtml || ""}</p>
  <input class="text-input" type="text" name="${name}" aria-label="Ответ к заданию ${q.n}"
         autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next"${mode}>
  <p class="format-warn" hidden></p>
</div>`;
  } else {
    const input = q.type === "single" ? "radio" : "checkbox";
    const opts = (q.optionsHtml || []).map((html, i) => `
  <label class="opt">
    <input type="${input}" name="${name}" value="${i}">
    <span class="badge" aria-hidden="true">${LETTERS[i] || i + 1}</span>
    <span class="opt-body">${html}</span>
  </label>`).join("");
    const note = q.type === "multiple" ? `<p class="note">Отметьте все верные варианты</p>` : "";
    answer = `${note}<div class="options ${q.type}${q.pictures ? " pictures" : ""}" role="${q.type === "single" ? "radiogroup" : "group"}" aria-label="Варианты к заданию ${q.n}">${opts}
</div>`;
  }
  const hints = (q.hintsHtml && q.hintsHtml.length) ? `<div class="hints">${q.hintsHtml.map((h, i) => `
  <div class="hint" hidden><p class="hint-label">Подсказка${q.hintsHtml.length > 1 ? ` ${i + 1}` : ""}</p>${h}</div>`).join("")}
</div>` : "";
  return `
<article class="q" id="q-${esc(q.id)}" data-id="${esc(q.id)}" data-type="${q.type}"${q.type === "text" && q.key ? ` data-compare="${q.key.compare}"` : ""}>
  <div class="q-num">${q.n}</div>
  <div class="q-body">
    <div class="q-text">${q.html}</div>
    ${answer}
    ${hints}
    <div class="q-tools">
      <button class="btn quiet q-prev-btn" type="button" title="Предыдущее задание">← Предыдущее</button>
      <button class="btn quiet q-next-btn" type="button" title="Следующее задание">Следующее →</button>
      ${q.hintsHtml && q.hintsHtml.length ? `<button class="btn quiet hint-btn" type="button">Подсказка</button>` : ""}
      <button class="btn quiet check-btn" type="button">Проверить</button>
      <button class="btn quiet flag-btn" type="button" aria-pressed="false">Вернуться позже</button>
      <button class="btn quiet clear-btn" type="button" hidden>Очистить ответ</button>
    </div>
    <div class="review" hidden></div>
  </div>
</article>`;
}

export function quizPage(test, site = {}) {
  const { meta = {}, sections = [], count = 0 } = test;
  const groups = (site.groups || []).map((g) => `<option value="${esc(g)}">`).join("");
  const blocks = sections.map((s) => `
<section class="block" data-title="${esc(s.title || "")}">
  ${s.title ? `<h2>${esc(s.title)}</h2>` : ""}
  ${(s.questions || []).map(questionHtml).join("\n")}
</section>`).join("\n");
  const map = sections.flatMap((s) => s.questions || []).map((q) =>
    `<button type="button" data-go="${esc(q.id)}">${q.n}</button>`).join("");

  const sectionNav = sections.filter((s) => s.title).map((s, idx) => `
    <button type="button" class="quiz-sidebar-section-link" data-goto-block="${idx}">
      <span class="sec-dot"></span>
      <span class="sec-text">${esc(s.title)}</span>
    </button>
  `).join("");

  return `${head(meta.title || test.id, "../", "", test.math)}
<body class="quiz" data-id="${esc(test.id)}" data-count="${count}" data-group-pattern="${esc(site.groupPattern || "")}">
<header class="topbar">
  <a class="topbar-back" href="../" aria-label="Все тесты">Все тесты</a>
  <span class="topbar-title">${esc(meta.title || test.id)}</span>
  <button class="topbar-count" id="map-open" type="button" aria-label="Карта заданий"><span id="count">0</span>&thinsp;/&thinsp;<span id="total">${count}</span></button>
  <div class="progress" aria-hidden="true"><div id="progress-bar"></div></div>
</header>
<div class="quiz-layout">
<main class="sheet">
  <section class="intro">
    <h1>${esc(meta.title || test.id)}</h1>
    ${test.description ? `<div class="lead">${test.description}</div>` : ""}
    <p class="meta">${tasksWord(count)}${meta.topic && meta.topic !== "Общее" ? ` · ${esc(meta.topic)}` : ""}</p>
  </section>

  <section class="start" id="start">
    ${site.groups && site.groups.length ? `
    <label class="group-field">
      <span class="field-label">Группа (необязательно)</span>
      <input id="group" type="text" list="groups" placeholder="M3101" autocomplete="off"
             autocapitalize="characters" spellcheck="false" maxlength="12">
      <datalist id="groups">${groups}</datalist>
      <span class="field-error" id="group-error" hidden></span>
    </label>` : ""}
    <fieldset class="modes">
      <legend class="field-label">Как проходить</legend>
      <label class="mode">
        <input type="radio" name="mode" value="exam" checked>
        <span class="mode-name">Проверка в конце</span>
        <span class="mode-desc">Отвечаете на все задания, потом смотрите результат и разбор</span>
      </label>
      <label class="mode">
        <input type="radio" name="mode" value="practice">
        <span class="mode-name">Тренировка</span>
        <span class="mode-desc">Можно проверить каждое задание сразу и взять подсказку</span>
      </label>
    </fieldset>
    <p class="mode-later">Режим можно поменять и во время прохождения.</p>
    <button class="btn primary" id="start-btn" type="button">Начать</button>
  </section>

  <div class="mode-bar" id="mode-bar">
    <span class="mode-bar-label" id="mode-bar-label">Режим</span>
    <div class="seg" role="radiogroup" aria-labelledby="mode-bar-label">
      <button type="button" role="radio" data-mode="exam">Проверка в конце</button>
      <button type="button" role="radio" data-mode="practice">Тренировка</button>
    </div>
  </div>

  <section class="result" id="result" hidden></section>

  <div class="questions">${blocks}
  </div>

  <section class="finish-section" id="finish-section">
    <div class="finish-card">
      <div class="finish-info">
        <h2 style="margin: 0 0 0.35rem; font-size: 1.25rem;">Завершение теста</h2>
        <p id="action-note" class="action-note" style="margin: 0; color: var(--muted); font-size: 0.9rem;">Все ответы сохраняются автоматически. Нажмите для отправки на проверку.</p>
      </div>
      <div id="actions" class="finish-actions">
        <button class="btn primary" id="submit" type="button">Отправить</button>
      </div>
    </div>
  </section>

  ${meta.feedback ? `<section class="feedback">
    <label><span class="field-label">${esc(meta.feedback)}</span>
    <textarea id="feedback" rows="3" maxlength="2000"></textarea></label>
  </section>` : ""}
  </main>

  <aside class="quiz-sidebar" id="quiz-sidebar" aria-label="Навигация по тесту">
    <div class="quiz-sidebar-card">
      <div class="quiz-sidebar-header">
        <a class="quiz-sidebar-back" href="../" id="quiz-back-link" aria-label="К списку тестов">
          <span>←</span> Все тесты
        </a>
        <span class="quiz-sidebar-badge" id="sidebar-counter">0 / ${count}</span>
      </div>

      <div class="quiz-sidebar-current-info" id="sidebar-current-box">
        <span class="current-label">Позиция:</span>
        <strong id="sidebar-current-q">Задание № 1</strong>
        <span class="current-total">из ${count}</span>
      </div>

      <div class="quiz-sidebar-progress-box">
        <div class="quiz-sidebar-progress-bar"><div id="sidebar-progress-fill"></div></div>
      </div>

      ${sectionNav ? `
      <div class="quiz-sidebar-sections">
        <div class="quiz-sidebar-sections-title">Разделы теста</div>
        <nav class="quiz-sidebar-sections-nav" id="sidebar-sections-nav">
          ${sectionNav}
        </nav>
      </div>` : ""}

      <div class="quiz-sidebar-map-section">
        <div class="quiz-sidebar-map-title">Карта заданий</div>
        <div class="quiz-sidebar-map-grid" id="sidebar-map-grid">
          ${map}
        </div>
      </div>

      <div class="quiz-sidebar-actions">
        <button class="btn quiet quiz-action-btn" type="button" id="side-to-top" title="Перейти к началу страницы">
          ⬆️ В начало
        </button>
        <button class="btn quiet quiz-action-btn" type="button" id="side-unanswered" title="Перейти к первому неотвеченному вопросу">
          🎯 К неотвеченному
        </button>
        <button class="btn quiet quiz-action-btn" type="button" id="side-to-finish" title="Перейти к завершению теста">
          ⬇️ К завершению
        </button>
      </div>
    </div>
  </aside>
</div>

<dialog id="sheet-map" class="sheet-map-dialog">
  <div class="sheet-map-box">
    <div class="sheet-map-header">
      <span class="sheet-map-title">Карта заданий (${count})</span>
      <button type="button" class="btn quiet btn-sm" data-close aria-label="Закрыть">✕</button>
    </div>
    <div class="sheet-map-grid">
      ${map}
    </div>
    <div class="sheet-map-footer">
      <button class="btn quiet btn-sm" type="button" id="modal-to-top">⬆️ В начало</button>
      <button class="btn primary btn-sm" type="button" id="modal-unanswered">🎯 К неотвеченному</button>
      <button class="btn quiet btn-sm" type="button" id="modal-to-finish">⬇️ К финишу</button>
    </div>
  </div>
</dialog>
<script type="module" src="../js/quiz.js"></script>
</body>
</html>
`;
}

export function notesPage(notes = [], site = {}) {
  const clientData = JSON.stringify(notes.map((n) => ({
    id: n.id,
    meta: n.meta,
    html: n.html,
    toc: n.toc,
  })));

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Конспекты и теория — Дискретная математика</title>
  <link rel="stylesheet" href="../assets/katex/katex.min.css">
  <link rel="stylesheet" href="../assets/style.css">
  <script>window.__NOTES_DATA__ = ${clientData};</script>
</head>
<body class="notes-body-app">
  <header class="notes-topbar">
    <div class="notes-topbar-left">
      <a class="notes-back-link" href="../">← Все материалы</a>
      <span class="notes-brand">📚 Конспекты по курсу ДМ</span>
    </div>
    <button type="button" class="btn quiet btn-sm notes-mobile-menu-btn" id="notes-menu-btn" aria-label="Открыть список тем конспектов">
      ☰ Темы
    </button>
  </header>
  <div class="notes-layout">
    <aside class="notes-sidebar" aria-label="Список тем и лекций">
      <div class="notes-sidebar-header">
        <input type="search" id="notes-search" class="notes-search-input" placeholder="🔍 Поиск по конспектам..." autocomplete="off">
      </div>
      <nav class="notes-tree" id="notes-tree"></nav>
    </aside>
    <main class="notes-content">
      <div class="notes-article-sheet" id="notes-article">
        <p class="muted">Загружаем конспект…</p>
      </div>
    </main>
    <aside class="notes-toc-sidebar" id="notes-toc-sidebar" aria-label="Содержание статьи">
      <div class="notes-toc-title">На этой странице</div>
      <nav class="notes-toc-links" id="notes-toc-links"></nav>
    </aside>
  </div>
  <script type="module" src="../js/notes.js"></script>
</body>
</html>
`;
}

export function colloquiumsPage(colloquiums = [], site = {}) {
  const visible = (colloquiums || []).filter((c) => !c.hidden);
  const clientData = JSON.stringify(visible.map((c) => ({
    id: c.id,
    colloquium: c.colloquium_id || c.colloquium || 1,
    num: c.num,
    term: c.term,
    definition: c.definition,
    examples: c.examples || "",
    definitionHtml: c.definitionHtml || "",
    examplesHtml: c.examplesHtml || "",
  })));

  const staticDictItems = visible.map((c) => {
    const col = c.colloquium_id || c.colloquium || 1;
    return `
      <article class="dict-item open" data-id="${esc(c.id)}" data-col="${col}" data-num="${c.num}">
        <div class="dict-item-header">
          <div class="dict-item-meta">
            <span class="dict-col-pill">Коллоквиум ${col} · Вопрос № ${c.num}</span>
            <span class="dict-status-icon" data-status-for="${esc(c.id)}"></span>
          </div>
          <h3 class="dict-item-term">${esc(c.term)}</h3>
          <div class="dict-item-header-actions">
            <button type="button" class="btn quiet btn-sm btn-to-flashcard" data-jump-card="${esc(c.id)}" title="Перейти к этой карточке для запоминания">
              🗂️ Карточка
            </button>
            <span class="dict-chevron" aria-hidden="true">▾</span>
          </div>
        </div>
        <div class="dict-item-body">
          <div class="dict-def-wrap">
            ${c.definitionHtml || `<p>${esc(c.definition)}</p>`}
          </div>
          ${c.examplesHtml || c.examples ? `
            <div class="dict-ex-wrap">
              <div class="dict-ex-heading">Примеры, свойства и пояснения:</div>
              ${c.examplesHtml || esc(c.examples)}
            </div>
          ` : ""}
        </div>
      </article>
    `;
  }).join("\n");

  const col1Count = visible.filter((c) => Number(c.colloquium_id || c.colloquium) === 1).length;
  const col2Count = visible.filter((c) => Number(c.colloquium_id || c.colloquium) === 2).length;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Коллоквиумы по Дискретной Математике — Полный сборник определений</title>
  <link rel="preload" href="../assets/fonts/onest-cyrillic-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="../assets/katex/katex.min.css">
  <link rel="stylesheet" href="../assets/style.css">
  <script>window.__COLLOQUIUMS_DATA__ = ${clientData};</script>
</head>
<body class="colloquiums-app">
  <header class="colloquiums-topbar">
    <div class="colloquiums-topbar-left">
      <a class="colloquiums-back-link" href="../">← Все материалы</a>
      <span class="colloquiums-brand">🎓 Коллоквиумы по курсу ДМ</span>
    </div>
    <div class="colloquiums-mode-tabs" role="tablist">
      <button type="button" class="colloquiums-mode-btn active" data-mode="dict" role="tab" title="Читать все определения подряд">
        📖 Сборник определений (${visible.length})
      </button>
      <button type="button" class="colloquiums-mode-btn" data-mode="cards" role="tab" title="Интерактивные карточки с переворотом">
        🗂️ Карточки (Quizlet)
      </button>
    </div>
  </header>

  <main class="colloquiums-container">
    <!-- Filters and Search Toolbar -->
    <div class="colloquiums-toolbar">
      <div class="colloquiums-col-pills" role="radiogroup" aria-label="Выбор коллоквиума">
        <button type="button" class="col-pill-btn active" data-col="all">Все вопросы (${visible.length})</button>
        <button type="button" class="col-pill-btn" data-col="1">Коллоквиум 1 (${col1Count})</button>
        <button type="button" class="col-pill-btn" data-col="2">Коллоквиум 2 (${col2Count})</button>
      </div>
      <div class="colloquiums-search-box">
        <input type="search" id="colloquiums-search" class="colloquiums-search-input" placeholder="🔍 Поиск по терминам, формулам и номерам..." autocomplete="off">
        <button type="button" id="clear-search-btn" class="clear-search-btn" hidden title="Очистить поиск">✕</button>
      </div>
    </div>

    <!-- DICTIONARY / REFERENCE VIEW (OPEN BY DEFAULT) -->
    <section class="colloquiums-view-section active" id="view-dict">
      <div class="dict-actions-bar">
        <div class="dict-count-info">
          Найдено определений: <strong id="dict-visible-count">${visible.length}</strong>
        </div>
        <div class="dict-toggle-all-wrap">
          <button type="button" class="btn quiet btn-sm" id="btn-collapse-all">Свернуть список</button>
          <button type="button" class="btn quiet btn-sm" id="btn-expand-all">Развернуть подробно</button>
        </div>
      </div>

      <div class="dict-list" id="dict-items-list">
        ${staticDictItems}
      </div>
    </section>

    <!-- FLASHCARDS VIEW -->
    <section class="colloquiums-view-section" id="view-cards" hidden>
      <div class="cards-status-bar">
        <div class="card-counter-wrap">
          <span class="card-counter-label">Карточка</span>
          <span class="card-counter-val" id="card-current-idx">1</span>
          <span class="card-counter-label">из</span>
          <span class="card-counter-val" id="card-total-count">${colloquiums.length}</span>
        </div>
        <div class="cards-counters-stats">
          <span class="counter-badge known" title="Выучено">✅ <span id="stat-known-val">0</span></span>
          <span class="counter-badge repeat" title="Нужно повторить">🔄 <span id="stat-repeat-val">0</span></span>
        </div>
        <button type="button" class="btn quiet btn-sm" id="btn-shuffle-cards" title="Перемешать карточки">
          🔀 Перемешать
        </button>
        <button type="button" class="btn quiet btn-sm" id="btn-reset-cards-progress" title="Сбросить прогресс">
          Очистить прогресс
        </button>
      </div>

      <div class="cards-progress-bar-track">
        <div class="cards-progress-bar-fill" id="cards-progress-bar"></div>
      </div>

      <div class="quizlet-card-stage">
        <div class="quizlet-card" id="quizlet-card" tabindex="0" role="button" aria-label="Интерактивная карточка. Нажмите для переворота">
          <div class="quizlet-card-inner">
            <div class="quizlet-card-face quizlet-card-front">
              <div class="card-face-header">
                <span class="card-col-badge" id="card-front-badge">Коллоквиум 1 · Вопрос № 1</span>
                <span class="card-status-indicator" id="card-status-badge"></span>
              </div>
              <div class="card-face-body">
                <h2 class="card-term-title" id="card-front-term">Определение Множества</h2>
              </div>
              <div class="card-face-footer">
                <span class="card-hint-text">Нажмите на карточку или нажмите <kbd>Пробел</kbd>, чтобы посмотреть определение</span>
              </div>
            </div>
            <div class="quizlet-card-face quizlet-card-back">
              <div class="card-face-header">
                <span class="card-col-badge" id="card-back-badge">Коллоквиум 1 · Вопрос № 1</span>
                <span class="card-term-sub" id="card-back-term">Определение Множества</span>
              </div>
              <div class="card-face-body back-content">
                <div class="card-def-wrap" id="card-back-def"></div>
                <div class="card-ex-wrap" id="card-back-ex"></div>
              </div>
              <div class="card-face-footer">
                <span class="card-hint-text">Нажмите или нажмите <kbd>Пробел</kbd>, чтобы перевернуть обратно</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="cards-action-toolbar">
        <button type="button" class="btn quiet card-nav-btn" id="btn-card-prev" title="Предыдущая (←)">
          ← Предыдущая
        </button>
        <div class="card-marking-actions">
          <button type="button" class="btn quiet mark-btn mark-repeat-btn" id="btn-mark-repeat" title="Нужно повторить (клавиша 1)">
            🔄 Повторить
          </button>
          <button type="button" class="btn quiet mark-btn mark-known-btn" id="btn-mark-known" title="Знаю (клавиша 2)">
            ✅ Знаю
          </button>
        </div>
        <button type="button" class="btn quiet card-nav-btn" id="btn-card-next" title="Следующая (→)">
          Следующая →
        </button>
      </div>

      <div class="cards-keyboard-hints">
        <span class="kb-hint-item"><kbd>Пробел</kbd> — перевернуть</span>
        <span class="kb-hint-item"><kbd>←</kbd> / <kbd>→</kbd> — листать</span>
        <span class="kb-hint-item"><kbd>1</kbd> — повторить</span>
        <span class="kb-hint-item"><kbd>2</kbd> — знаю</span>
      </div>
    </section>
  </main>

  <script type="module" src="../js/colloquiums.js"></script>
</body>
</html>
`;
}

export function indexPage(tests = [], notes = [], site = {}, colloquiumsCount = 106) {
  const md = new Marked({ breaks: true });
  const visible = tests.filter((t) => !t.meta?.hidden);
  const visibleNotes = (notes || []).filter((n) => !n.meta?.hidden);
  const testTopics = Array.from(new Set(visible.map((t) => t.meta?.topic).filter(Boolean)));

  const testItems = visible.map((t, i) => `
  <li data-num="${String(visible.length - i).padStart(2, "0")}" data-topic="${esc(t.meta?.topic || "")}"><a href="${esc(t.id)}/" data-id="${esc(t.id)}" data-count="${t.count}">
    <span class="t-title">${esc(t.meta?.title || t.id)}</span>
    <span class="t-meta">${tasksWord(t.count)}</span>
    <span class="t-status"></span>
  </a></li>`).join("");

  const notesCards = visibleNotes.map((n) => `
    <a href="notes/?id=${esc(n.id)}" class="note-card">
      <div class="note-card-icon">${esc(n.meta?.icon || "📄")}</div>
      <div class="note-card-content">
        <div class="note-card-topic">${esc(n.meta?.topic || "Общее")}</div>
        <h3 class="note-card-title">${esc(n.meta?.title || n.id)}</h3>
        <p class="note-card-desc">${esc(n.meta?.description || "")}</p>
        <div class="note-card-footer">
          <span class="note-card-action">Читать конспект →</span>
        </div>
      </div>
    </a>
  `).join("");

  return `${head(site.title || "Тренажёры и конспекты", "")}
<body class="home">
<main class="sheet">
  <section class="intro">
    <h1>${esc(site.title || "Дискретная математика")}</h1>
    ${site.description ? `<div class="lead">${md.parse(String(site.description))}</div>` : ""}
  </section>

  <div class="home-tabs-bar" role="tablist">
    <button class="home-tab-btn active" data-tab="tests" role="tab" type="button">
      📋 Тесты <span class="home-tab-count">${visible.length}</span>
    </button>
    <button class="home-tab-btn" data-tab="notes" role="tab" type="button">
      📚 Конспекты и теория <span class="home-tab-count">${visibleNotes.length}</span>
    </button>
    <button class="home-tab-btn" data-tab="colloquiums" role="tab" type="button">
      🎓 Коллоквиумы <span class="home-tab-count">${colloquiumsCount}</span>
    </button>
  </div>

  <div class="home-tab-panel active" data-panel="tests">
    ${testTopics.length > 1 ? `
    <div class="topic-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
      <button class="btn quiet btn-sm topic-filter-btn active" data-topic="all" type="button">Все темы</button>
      ${testTopics.map((tp) => `<button class="btn quiet btn-sm topic-filter-btn" data-topic="${esc(tp)}" type="button">${esc(tp)}</button>`).join("")}
    </div>` : ""}
    <ol class="tests">${testItems}
    </ol>
  </div>

  <div class="home-tab-panel" data-panel="notes">
    <div class="notes-grid">
      ${notesCards || '<p class="muted">Конспекты пока не добавлены.</p>'}
    </div>
  </div>

  <div class="home-tab-panel" data-panel="colloquiums">
    <div class="colloquiums-home-grid">
      <div class="colloquium-promo-card">
        <div class="colloquium-promo-icon">🎓</div>
        <div class="colloquium-promo-body">
          <h3>Коллоквиум 1: Множества, отношения, соответствия</h3>
          <p>53 строгих определения из лекций Пермякова и Страдиной: множества, булеан, прямое произведение, бинарные отношения, все свойства, замыкания, фактор-множества, отношения порядка, решётки, отображения, мощности.</p>
          <div class="colloquium-promo-footer">
            <a href="colloquiums/?col=1&mode=dict" class="btn primary btn-sm">📖 Читать все определения (53) →</a>
            <a href="colloquiums/?col=1&mode=cards" class="btn quiet btn-sm">🗂️ Карточки (Quizlet)</a>
          </div>
        </div>
      </div>
      <div class="colloquium-promo-card">
        <div class="colloquium-promo-icon">⚡</div>
        <div class="colloquium-promo-body">
          <h3>Коллоквиум 2: Булева алгебра и теория кодирования</h3>
          <p>53 строгих определения и формулы: высказывания, булевы функции, нормальные формы СДНФ/СКНФ, минимизация, полиномы Жегалкина, критерий Поста, энтропия Шеннона, коды Хаффмана и Хэмминга.</p>
          <div class="colloquium-promo-footer">
            <a href="colloquiums/?col=2&mode=dict" class="btn primary btn-sm">📖 Читать все определения (53) →</a>
            <a href="colloquiums/?col=2&mode=cards" class="btn quiet btn-sm">🗂️ Карточки (Quizlet)</a>
          </div>
        </div>
      </div>
      <div class="colloquium-promo-card full-width">
        <div class="colloquium-promo-icon">📖</div>
        <div class="colloquium-promo-body">
          <h3>Единый сборник всех определений курса (106 вопросов)</h3>
          <p>Полный справочник всех определений с формулами KaTeX из лекций обоих преподавателей, мгновенным полнотекстовым поиском по формулам и терминам, и режимом интервального повторения Quizlet.</p>
          <div class="colloquium-promo-footer">
            <a href="colloquiums/?col=all&mode=dict" class="btn primary btn-sm">📖 Открыть полный сборник (106 определений) →</a>
            <a href="colloquiums/?col=all&mode=cards" class="btn quiet btn-sm">🗂️ Все карточки (106)</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</main>
<script type="module" src="js/home.js"></script>
</body>
</html>
`;
}

export function adminPage(site = {}) {
  return `${head("Кабинет преподавателя", "", '<meta name="robots" content="noindex">\n<link rel="stylesheet" href="assets/katex/katex.min.css">\n')}
<body class="admin">
<header class="topbar admin-topbar" style="display: flex; align-items: center; justify-content: space-between;">
  <div class="admin-brand" style="font-weight: 700; font-size: 1.05rem; display: flex; align-items: center; gap: 0.5rem;">
    <span>🎓</span> <span>Кабинет преподавателя</span>
  </div>
  <div class="admin-status-badge" style="font-size: 0.78rem; font-weight: 600; padding: 0.25rem 0.65rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent-ink); border: 1px solid var(--accent);">
    Режим управления
  </div>
</header>
<main class="sheet" id="app"><p class="muted">Загружаем…</p></main>
<script src="assets/katex/katex.min.js"></script>
<script src="assets/marked.min.js"></script>
<script type="module" src="js/admin.js"></script>
</body>
</html>
`;
}
