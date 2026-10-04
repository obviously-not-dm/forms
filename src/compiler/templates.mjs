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

export function navbarHtml(rel = "", activeTab = "", site = {}) {
  return `
<header class="topbar platform-topbar">
  <div class="topbar-inner">
    <div class="topbar-brand-wrap">
      <a class="platform-logo" href="${rel}">
        <span class="logo-icon">📐</span>
        <div class="logo-titles">
          <span class="logo-main">ДМ Платформа</span>
          <span class="logo-sub">Дискретная математика</span>
        </div>
      </a>
    </div>

    <nav class="topbar-nav" id="platform-nav">
      <a class="nav-item ${activeTab === 'home' ? 'active' : ''}" href="${rel}">🏠 Главная</a>
      <a class="nav-item ${activeTab === 'contests' ? 'active' : ''}" href="${rel}contests/">⏱️ Контесты</a>
      <a class="nav-item ${activeTab === 'tests' ? 'active' : ''}" href="${rel}#tests">📋 Тренажёры</a>
      <a class="nav-item ${activeTab === 'notes' ? 'active' : ''}" href="${rel}notes/">📚 Конспекты</a>
      <a class="nav-item ${activeTab === 'colloquiums' ? 'active' : ''}" href="${rel}colloquiums/">🎓 Коллоквиумы</a>
      <a class="nav-item ${activeTab === 'leaderboard' ? 'active' : ''}" href="${rel}leaderboard/">🏆 Рейтинг</a>
    </nav>

    <div class="topbar-auth" id="topbar-auth-slot">
      <button type="button" class="btn quiet btn-sm btn-auth-open" id="btn-auth-open">👤 Вход</button>
    </div>

    <button type="button" class="btn quiet btn-sm platform-burger" id="platform-burger" aria-label="Меню">
      ☰
    </button>
  </div>
</header>`;
}

export function authModalHtml(site = {}) {
  const groupsList = (site.groups || []).map((g) => `<option value="${esc(g)}">`).join("");
  return `
<dialog id="auth-modal" class="auth-modal-dialog">
  <div class="auth-modal-box">
    <div class="auth-modal-header">
      <div class="auth-tabs" role="tablist">
        <button type="button" class="auth-tab-btn active" data-tab="login" role="tab">Вход</button>
        <button type="button" class="auth-tab-btn" data-tab="register" role="tab">Регистрация</button>
      </div>
      <button type="button" class="btn quiet btn-sm auth-close-btn" data-auth-close aria-label="Закрыть">✕</button>
    </div>

    <div class="auth-modal-body">
      <!-- Login Form -->
      <form class="auth-form" id="auth-login-form" data-form="login">
        <div class="form-group">
          <label class="form-label" for="login-email">Email или логин</label>
          <input type="text" id="login-email" class="form-input" placeholder="student@itmo.ru" required autocomplete="username">
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">Пароль</label>
          <input type="password" id="login-password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <div class="form-error" id="login-error" hidden></div>
        <button type="submit" class="btn primary btn-block" id="btn-login-submit">Войти</button>
      </form>

      <!-- Register Form -->
      <form class="auth-form" id="auth-register-form" data-form="register" hidden>
        <div class="form-group">
          <label class="form-label" for="reg-name">Фамилия и Имя</label>
          <input type="text" id="reg-name" class="form-input" placeholder="Иван Иванов" required autocomplete="name">
        </div>
        <div class="form-group">
          <label class="form-label" for="reg-group">Учебная группа</label>
          <input type="text" id="reg-group" list="groups-list" class="form-input" placeholder="M3115" required maxlength="10">
          <datalist id="groups-list">
            ${groupsList}
          </datalist>
        </div>
        <div class="form-group">
          <label class="form-label" for="reg-email">Email</label>
          <input type="email" id="reg-email" class="form-input" placeholder="ivanov@itmo.ru" required autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label" for="reg-password">Пароль (не менее 4 символов)</label>
          <input type="password" id="reg-password" class="form-input" placeholder="••••••••" required minlength="4" autocomplete="new-password">
        </div>
        <div class="form-error" id="reg-error" hidden></div>
        <button type="submit" class="btn primary btn-block" id="btn-register-submit">Зарегистрироваться</button>
      </form>
    </div>
  </div>
</dialog>`;
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
<body class="quiz platform-body" data-id="${esc(test.id)}" data-count="${count}" data-group-pattern="${esc(site.groupPattern || "")}">
${navbarHtml("../", "tests", site)}
<header class="quiz-subtopbar">
  <div class="quiz-subtopbar-inner">
    <div class="quiz-subtopbar-left">
      <a class="topbar-back" href="../" aria-label="Все тренажёры">← Все тренажёры</a>
      <span class="topbar-title">${esc(meta.title || test.id)}</span>
    </div>
    <div class="quiz-subtopbar-right">
      <button class="topbar-count" id="map-open" type="button" aria-label="Карта заданий"><span id="count">0</span>&thinsp;/&thinsp;<span id="total">${count}</span></button>
    </div>
  </div>
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
${authModalHtml(site)}
<script type="module" src="../js/platform.js"></script>
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
<body class="notes-body-app platform-body">
  ${navbarHtml("../", "notes", site)}
  <div class="notes-subbar" style="background: var(--card); border-bottom: 1px solid var(--line); padding: 0.5rem 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
    <div style="font-weight: 600; font-size: 0.95rem; color: var(--ink); display: flex; align-items: center; gap: 0.5rem;">
      <span>📚 Конспекты и лекции курса</span>
    </div>
    <button type="button" class="btn quiet btn-sm notes-mobile-menu-btn" id="notes-menu-btn" aria-label="Открыть список тем конспектов">
      ☰ Темы
    </button>
  </div>
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
  ${authModalHtml(site)}
  <script type="module" src="../js/platform.js"></script>
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
<body class="colloquiums-app platform-body">
  ${navbarHtml("../", "colloquiums", site)}
  <div class="colloquiums-subtopbar" style="background: var(--card); border-bottom: 1px solid var(--line); padding: 0.6rem 1.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
    <span class="colloquiums-brand" style="font-weight: 600; font-size: 1rem;">🎓 Коллоквиумы по курсу ДМ</span>
    <div class="colloquiums-mode-tabs" role="tablist">
      <button type="button" class="colloquiums-mode-btn active" data-mode="dict" role="tab" title="Читать все определения подряд">
        📖 Сборник определений (${visible.length})
      </button>
      <button type="button" class="colloquiums-mode-btn" data-mode="cards" role="tab" title="Интерактивные карточки с переворотом">
        🗂️ Карточки (Quizlet)
      </button>
    </div>
  </div>

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

  ${authModalHtml(site)}
  <script type="module" src="../js/platform.js"></script>
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

  return `${head(site.title || "Дискретная математика — Образовательная платформа", "")}
<body class="home platform-body">
${navbarHtml("", "home", site)}

<main class="platform-container">
  <!-- Clean Portal Hero -->
  <section class="portal-hero">
    <div class="hero-badge">🎓 Университетский курс · Факультет ИТ</div>
    <h1 class="hero-title">${esc(site.title || "Дискретная математика")}</h1>
    <p class="hero-desc">
      Интерактивная платформа курса: онлайн-тренажёры, контрольные летучки на занятиях, конспекты лекций и подготовка к коллоквиумам.
    </p>
    <div class="hero-actions">
      <a href="#tests" class="btn primary">📋 К тренажёрам</a>
      <a href="contests/" class="btn quiet">⏱️ Летучки на парах</a>
      <a href="leaderboard/" class="btn quiet">🏆 Рейтинг курса</a>
    </div>
  </section>

  <!-- Quick Access Portal Grid (4 Key Course Sections) -->
  <div class="portal-modules-grid">
    <a href="#tests" class="portal-module-card" onclick="document.querySelector('.home-tab-btn[data-tab=tests]')?.click()">
      <div class="portal-module-icon">📋</div>
      <div class="portal-module-body">
        <div class="portal-module-title">Тренажёры курса</div>
        <div class="portal-module-sub">${visible.length} тестов · Самопроверка и экзамен</div>
      </div>
      <div class="portal-module-arrow">→</div>
    </a>
    <a href="contests/" class="portal-module-card highlight">
      <div class="portal-module-icon">⏱️</div>
      <div class="portal-module-body">
        <div class="portal-module-title">Онлайн-контесты</div>
        <div class="portal-module-sub">Экспресс-летучки на парах с таймером</div>
      </div>
      <div class="portal-module-arrow">→</div>
    </a>
    <a href="notes/" class="portal-module-card">
      <div class="portal-module-icon">📚</div>
      <div class="portal-module-body">
        <div class="portal-module-title">Конспекты и лекции</div>
        <div class="portal-module-sub">${visibleNotes.length} тем · Формулы KaTeX и поиск</div>
      </div>
      <div class="portal-module-arrow">→</div>
    </a>
    <a href="colloquiums/" class="portal-module-card">
      <div class="portal-module-icon">🎓</div>
      <div class="portal-module-body">
        <div class="portal-module-title">Коллоквиумы</div>
        <div class="portal-module-sub">${colloquiumsCount} определений · Карточки Quizlet</div>
      </div>
      <div class="portal-module-arrow">→</div>
    </a>
  </div>

  <!-- Dynamic Active Contest Alert Banner (populated by JS) -->
  <div id="home-active-contest-banner" class="home-contest-banner" hidden></div>

  <!-- Student Snapshot Card (if logged in, populated by JS) -->
  <div id="home-student-card" hidden></div>

  <!-- Two-Column Portal Layout -->
  <div class="portal-layout">
    <div class="portal-main-col">
      <div class="home-tabs-bar" role="tablist">
        <button class="home-tab-btn active" data-tab="tests" role="tab" type="button">
          📋 Тренажёры <span class="home-tab-count">${visible.length}</span>
        </button>
        <button class="home-tab-btn" data-tab="notes" role="tab" type="button">
          📚 Конспекты и теория <span class="home-tab-count">${visibleNotes.length}</span>
        </button>
        <button class="home-tab-btn" data-tab="colloquiums" role="tab" type="button">
          🎓 Коллоквиумы <span class="home-tab-count">${colloquiumsCount}</span>
        </button>
      </div>

      <div class="home-tab-panel active" data-panel="tests" id="tests">
        ${testTopics.length > 1 ? `
        <div class="topic-filters" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.25rem;">
          <button class="btn quiet btn-sm topic-filter-btn active" data-topic="all" type="button">Все темы</button>
          ${testTopics.map((tp) => `<button class="btn quiet btn-sm topic-filter-btn" data-topic="${esc(tp)}" type="button">${esc(tp)}</button>`).join("")}
        </div>` : ""}
        <ol class="tests">${testItems}
        </ol>
      </div>

      <div class="home-tab-panel" data-panel="notes">
        <div class="home-panel-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.5rem;">
          <span style="font-weight: 600; color: var(--muted); font-size: 0.9rem;">📚 Теория и лекции по темам курса</span>
          <a href="notes/" class="btn quiet btn-sm">Открыть полный раздел конспектов →</a>
        </div>
        <div class="notes-grid">
          ${notesCards || '<p class="muted">Конспекты пока не добавлены.</p>'}
        </div>
      </div>

      <div class="home-tab-panel" data-panel="colloquiums">
        <div class="home-panel-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.5rem;">
          <span style="font-weight: 600; color: var(--muted); font-size: 0.9rem;">🎓 Определения и формулы к коллоквиумам</span>
          <a href="colloquiums/" class="btn quiet btn-sm">Открыть справочник определений →</a>
        </div>
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
    </div>

    <!-- Portal Sidebar: Top-5 Leaders & Fast Links -->
    <aside class="portal-sidebar-col">
      <div class="portal-sidebar-box">
        <div class="sidebar-box-header">
          <h3>🏆 Топ-5 студентов курса</h3>
          <a href="leaderboard/" class="sidebar-more-link">Весь рейтинг →</a>
        </div>
        <div id="home-top5-leaderboard">
          <p class="muted">Загружаем лидеров…</p>
        </div>
      </div>

      <div class="portal-sidebar-box feature-box">
        <h3>⏱️ Летучки на парах</h3>
        <p>Преподаватель запускает 10-15 минутный онлайн-контест во время занятия. Таймер синхронизирован, результат сразу в турнирной таблице.</p>
        <a href="contests/" class="btn quiet btn-sm btn-block">Перейти к контестам →</a>
      </div>
    </aside>
  </div>
</main>

${authModalHtml(site)}
<script type="module" src="js/platform.js"></script>
<script type="module" src="js/home.js"></script>
</body>
</html>
`;
}

export function leaderboardPage(site = {}) {
  return `${head("Рейтинг студентов — Дискретная математика", "../")}
<body class="platform-body">
  ${navbarHtml("../", "leaderboard", site)}

  <main class="platform-container">
    <div class="page-header">
      <div class="page-title-wrap">
        <h1 class="page-title">🏆 Рейтинг студентов курса</h1>
        <p class="page-subtitle">Сводный рейтинг успеваемости по решению тестов в режиме экзамена и участию в онлайн-контестах на парах.</p>
      </div>
      <div class="page-header-actions">
        <span class="rating-rule-pill" title="100% за тест = 100 pts. Контесты дают дополнительные соревновательные очки">
          ℹ️ Рейтинговая система ДМ
        </span>
      </div>
    </div>

    <!-- Toolbar: Groups Filter & Search -->
    <div class="leaderboard-toolbar">
      <div class="groups-filter-scroll" id="leaderboard-group-filters">
        <button type="button" class="group-filter-pill active" data-group="all">Все группы</button>
        ${(site.groups || []).map((g) => `<button type="button" class="group-filter-pill" data-group="${esc(g)}">${esc(g)}</button>`).join("")}
      </div>
      <div class="leaderboard-search-box">
        <input type="search" id="leaderboard-search" class="leaderboard-search-input" placeholder="🔍 Поиск студента по имени...">
      </div>
    </div>

    <!-- Leaderboard Table -->
    <div class="leaderboard-card-wrapper">
      <div class="table-responsive">
        <table class="leaderboard-table" id="leaderboard-table">
          <thead>
            <tr>
              <th class="col-rank">#</th>
              <th class="col-student">Студент</th>
              <th class="col-group">Группа</th>
              <th class="col-rating">Рейтинг</th>
              <th class="col-solved">Решено тестов</th>
              <th class="col-avg">Ср. балл</th>
              <th class="col-contests">Контесты</th>
            </tr>
          </thead>
          <tbody id="leaderboard-tbody">
            <tr>
              <td colspan="7" class="table-loading">Загружаем рейтинг студентов…</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </main>

  ${authModalHtml(site)}
  <script type="module" src="../js/platform.js"></script>
</body>
</html>
`;
}

export function profilePage(site = {}) {
  return `${head("Личный кабинет — Дискретная математика", "../")}
<body class="platform-body">
  ${navbarHtml("../", "profile", site)}

  <main class="platform-container">
    <div id="profile-container">
      <p class="table-loading">Загружаем профиль студента…</p>
    </div>
  </main>

  ${authModalHtml(site)}
  <script type="module" src="../js/platform.js"></script>
</body>
</html>
`;
}

export function contestsPage(site = {}) {
  return `${head("Онлайн-контесты — Дискретная математика", "../")}
<body class="platform-body">
  ${navbarHtml("../", "contests", site)}

  <main class="platform-container">
    <div class="page-header">
      <div class="page-title-wrap">
        <h1 class="page-title">⏱️ Онлайн-контесты и летучки</h1>
        <p class="page-subtitle">Проверочные работы на парах с таймером обратного отсчёта и мгновенной турнирной таблицей результатов.</p>
      </div>
    </div>

    <div class="contests-sections-grid">
      <!-- Live Contests Section -->
      <section class="contests-section">
        <div class="section-title-wrap">
          <h2 class="section-title"><span class="live-dot pulse"></span> Активные контесты сейчас</h2>
        </div>
        <div class="contests-list" id="active-contests-list">
          <p class="muted">Загружаем активные контесты…</p>
        </div>
      </section>

      <!-- Finished Contests Section -->
      <section class="contests-section" style="margin-top: 2.5rem;">
        <div class="section-title-wrap">
          <h2 class="section-title">🏁 Завершённые контесты</h2>
        </div>
        <div class="contests-list" id="finished-contests-list">
          <p class="muted">Загружаем историю контестов…</p>
        </div>
      </section>
    </div>
  </main>

  ${authModalHtml(site)}
  <script type="module" src="../js/platform.js"></script>
</body>
</html>
`;
}

export function contestRoomPage(site = {}) {
  return `${head("Контест — Дискретная математика", "../", '<link rel="stylesheet" href="../assets/katex/katex.min.css">\n', true)}
<body class="platform-body contest-room-body">
  <header class="contest-room-topbar">
    <div class="contest-room-brand">
      <a class="contest-exit-link" href="../contests/">← Выйти</a>
      <span class="contest-title" id="room-contest-title">Загрузка контеста…</span>
      <span class="contest-group-badge" id="room-contest-group"></span>
    </div>

    <div class="contest-timer-badge" id="contest-timer-box" title="Оставшееся время до автоматической сдачи">
      <span class="timer-icon">⏳</span>
      <span class="timer-digits" id="room-timer-digits">--:--</span>
    </div>

    <div class="contest-user-info" id="room-user-badge">
      <span id="room-user-name">Студент</span>
    </div>
  </header>

  <main class="contest-room-layout">
    <div class="contest-sheet" id="contest-sheet">
      <div id="contest-loading-state" class="contest-state-card">
        <p>Подготавливаем задания контеста…</p>
      </div>
      <div id="contest-questions-container" hidden></div>
    </div>
  </main>

  <footer class="contest-room-footer" id="contest-footer" hidden>
    <div class="contest-footer-inner">
      <span class="contest-answered-count" id="room-answered-count"></span>
      <button type="button" class="btn primary btn-submit-contest" id="btn-submit-contest">
        Завершить и сдать работу
      </button>
    </div>
  </footer>

  ${authModalHtml(site)}
  <script src="../assets/katex/katex.min.js"></script>
  <script type="module" src="../js/platform.js"></script>
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
  <div style="display: flex; align-items: center; gap: 0.75rem;">
    <a href="/" class="btn quiet btn-sm" style="display: inline-flex; align-items: center; gap: 0.35rem; text-decoration: none; font-size: 0.82rem;">🏠 На платформу</a>
    <div class="admin-status-badge" style="font-size: 0.78rem; font-weight: 600; padding: 0.25rem 0.65rem; border-radius: 999px; background: var(--accent-soft); color: var(--accent-ink); border: 1px solid var(--accent);">
      Режим управления
    </div>
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
