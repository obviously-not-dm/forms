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
<link rel="preload" href="${rel}assets/fonts/onest-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
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
      <a class="nav-item ${activeTab === 'tests' ? 'active' : ''}" href="${rel}tests/">📋 Тренажёры</a>
      <a class="nav-item ${activeTab === 'practices' ? 'active' : ''}" href="${rel}practices/">📝 Практики</a>
      <a class="nav-item ${activeTab === 'homeworks' ? 'active' : ''}" href="${rel}homeworks/">📤 ДЗ</a>
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
        <button type="button" class="auth-tab-btn" data-tab="reset" role="tab">Сброс пароля</button>
        <button type="button" class="auth-tab-btn" data-tab="teacher" role="tab">Преподаватель</button>
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
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
            <label class="form-label" for="login-password" style="margin-bottom: 0;">Пароль</label>
            <button type="button" class="btn-link" id="link-forgot-password" style="background: none; border: none; padding: 0; color: var(--accent); font-size: 0.8rem; cursor: pointer;">Забыли пароль?</button>
          </div>
          <input type="password" id="login-password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <div class="form-error" id="login-error" hidden></div>
        <button type="submit" class="btn primary btn-block" id="btn-login-submit">Войти</button>
      </form>

      <!-- Password Reset Form -->
      <form class="auth-form" id="auth-reset-form" data-form="reset" hidden>
        <p style="font-size: 0.88rem; color: var(--muted); margin: 0 0 0.5rem;">Введите ваш email, указанный при регистрации, и задайте новый пароль:</p>
        <div class="form-group">
          <label class="form-label" for="reset-email">Email</label>
          <input type="email" id="reset-email" class="form-input" placeholder="student@itmo.ru" required autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label" for="reset-password">Новый пароль (не менее 4 символов)</label>
          <input type="password" id="reset-password" class="form-input" placeholder="••••••••" required minlength="4" autocomplete="new-password">
        </div>
        <div class="form-error" id="reset-error" hidden></div>
        <div class="form-success" id="reset-success" style="color: var(--ok); font-size: 0.88rem; margin: 0.35rem 0;" hidden></div>
        <button type="submit" class="btn primary btn-block" id="btn-reset-submit">Обновить пароль и войти</button>
      </form>

      <!-- Teacher Login Form -->
      <form class="auth-form" id="auth-teacher-form" data-form="teacher" hidden>
        <div class="form-group">
          <label class="form-label" for="teacher-login-email">Логин или Email преподавателя</label>
          <input type="text" id="teacher-login-email" class="form-input" placeholder="admin@itmo.ru" value="admin@itmo.ru" required autocomplete="username">
        </div>
        <div class="form-group">
          <label class="form-label" for="teacher-login-password">Пароль</label>
          <input type="password" id="teacher-login-password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <div class="form-error" id="teacher-login-error" hidden></div>
        <button type="submit" class="btn primary btn-block" id="btn-teacher-submit">Войти как преподаватель</button>
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
      <button class="btn quiet favorite-btn" type="button" aria-pressed="false" title="Сохранить в избранные задания">⭐ В избранное</button>
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
<script>
  (function(){
    try {
      var tid = document.body.dataset.id || location.pathname.replace(/^\\/|\\/$/g, '').split('/').pop();
      var s = JSON.parse(localStorage.getItem('trainer:' + tid) || sessionStorage.getItem('trainer:' + tid) || 'null');
      if (s && (s.startedAt || (s.answers && Object.keys(s.answers).length > 0))) {
        document.body.classList.add('started');
      }
    } catch(e){}
  })();
</script>
${navbarHtml("../", "tests", site)}
<header class="quiz-subtopbar">
  <div class="quiz-subtopbar-inner">
    <div class="quiz-subtopbar-left">
      <a class="topbar-back" href="../tests/" aria-label="Все тренажёры">← Все тренажёры</a>
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

  <section class="start pretest-modal-card" id="start">
    <div class="pretest-card-header">
      <div class="pretest-badge">Начало тестирования</div>
      <h2 style="font-size: 1.35rem; margin: 0.5rem 0 0.35rem;">Выберите режим прохождения</h2>
      <p class="muted" style="margin: 0 0 1.25rem; font-size: 0.92rem;">Вопросы теста откроются сразу после нажатия кнопки «Начать тестирование».</p>
    </div>
    ${site.groups && site.groups.length ? `
    <label class="group-field" style="margin-bottom: 1.25rem;">
      <span class="field-label">Учебная группа</span>
      <input id="group" type="text" list="groups" placeholder="M3101" autocomplete="off"
             autocapitalize="characters" spellcheck="false" maxlength="12">
      <datalist id="groups">${groups}</datalist>
      <span class="field-error" id="group-error" hidden></span>
    </label>` : ""}
    <fieldset class="modes">
      <legend class="field-label">Формат проверки:</legend>
      <label class="mode">
        <input type="radio" name="mode" value="exam" checked>
        <span class="mode-name">⏱️ Экзамен (проверка в конце)</span>
        <span class="mode-desc">Отвечаете на все задания теста, после чего завершаете работу и получаете итоговые баллы, процент и подробный разбор решений.</span>
      </label>
      <label class="mode">
        <input type="radio" name="mode" value="practice">
        <span class="mode-name">💡 Тренировка (с подсказками)</span>
        <span class="mode-desc">Можно проверять каждое задание сразу после ответа, открывать теоретические подсказки и разбирать ошибки шаг за шагом.</span>
      </label>
    </fieldset>
    <div class="pretest-action-wrap" style="margin-top: 1.5rem;">
      <button class="btn primary btn-lg" id="start-btn" type="button" style="width: 100%; padding: 0.85rem; font-size: 1.05rem; font-weight: 700;">
        🚀 Начать тестирование (${tasksWord(count)})
      </button>
    </div>
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
  const visible = (notes || []).filter((n) => !n.meta?.hidden);
  const clientData = JSON.stringify(visible.map((n) => ({
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
  const visible = tests.filter((t) => !t.meta?.hidden);
  const visibleNotes = (notes || []).filter((n) => !n.meta?.hidden);
  const totalTasks = tests.reduce((sum, t) => sum + (t.count || 0), 0);

  return `${head(site.title || "Дискретная математика — Образовательная платформа", "")}
<body class="home platform-body">
${navbarHtml("", "home", site)}

<main class="platform-container">
  <!-- Clean Portal Hero -->
  <section class="portal-hero">
    <div class="hero-badge">🎓 Университетский курс · Дискретная математика · ИТМО</div>
    <h1 class="hero-title">${esc(site.title || "Дискретная математика")}</h1>
    <p class="hero-desc">
      Интерактивная образовательная платформа: онлайн-тренажёры для самопроверки, синхронные летучки на занятиях, конспекты лекций с формулами KaTeX и подготовка к коллоквиумам.
    </p>
    <div class="hero-actions">
      <a href="tests/" class="btn primary">📋 Перейти к тренажёрам</a>
      <a href="practices/" class="btn quiet">📝 Практики</a>
      <a href="homeworks/" class="btn quiet">📤 ДЗ</a>
      <a href="contests/" class="btn quiet">⏱️ Летучки на парах</a>
      <a href="notes/" class="btn quiet">📚 Конспекты</a>
      <a href="colloquiums/" class="btn quiet">🎓 Коллоквиумы</a>
      <a href="leaderboard/" class="btn quiet">🏆 Рейтинг</a>
    </div>
  </section>

  <!-- Dynamic Active Contest Alert Banner (populated by JS) -->
  <div id="home-active-contest-banner" class="home-contest-banner" hidden></div>

  <!-- Student Snapshot Card (if logged in, populated by JS) -->
  <div id="home-student-card" hidden></div>

  <!-- Key Capabilities / Возможности платформы (clean feature cards) -->
  <section class="portal-features-section" style="margin-bottom: 2rem;">
    <div class="section-title-wrap" style="margin-bottom: 1.25rem;">
      <h2 class="section-title" style="margin: 0 0 0.35rem; font-size: 1.45rem;">✨ Ключевые возможности платформы</h2>
      <p class="section-subtitle" style="color: var(--muted); font-size: 0.95rem; margin: 0;">
        Все учебные инструменты распределены по отдельным вкладкам в верхнем меню. Выберите нужный раздел для подготовки:
      </p>
    </div>

    <div class="portal-capabilities-grid">
      <!-- 1. Тренажёры -->
      <article class="portal-capability-card">
        <div class="portal-capability-top">
          <span class="portal-capability-icon">📋</span>
          <span class="portal-capability-tag">Практика</span>
        </div>
        <h3 class="portal-capability-title">Онлайн-тренажёры и генератор тестов</h3>
        <div class="portal-capability-sub">${visible.length} тестов по темам · ${totalTasks} заданий</div>
        <p class="portal-capability-desc">
          Проверочные работы по всем разделам курса (множества, отношения, соответствия, графы, булева логика). Поддержка режимов экзамена и тренировки с подсказками, генератор случайных вариантов и сохранение ответов при перезагрузке страницы.
        </p>
        <div class="portal-capability-footer">
          <a href="tests/" class="btn quiet btn-sm">Открыть тренажёры →</a>
        </div>
      </article>

      <!-- 2. Онлайн-контесты -->
      <article class="portal-capability-card">
        <div class="portal-capability-top">
          <span class="portal-capability-icon">⏱️</span>
          <span class="portal-capability-tag">На занятиях</span>
        </div>
        <h3 class="portal-capability-title">Онлайн-контесты и экспресс-летучки</h3>
        <div class="portal-capability-sub">Синхронный таймер · Мгновенные баллы</div>
        <p class="portal-capability-desc">
          Контрольные проверочные работы прямо во время аудиторных пар. Преподаватель активирует контест с ограничением времени, ответы проверяются автоматически, а набранные баллы сразу идут в единый рейтинг курса.
        </p>
        <div class="portal-capability-footer">
          <a href="contests/" class="btn quiet btn-sm">Перейти к контестам →</a>
        </div>
      </article>

      <!-- 3. Конспекты -->
      <article class="portal-capability-card">
        <div class="portal-capability-top">
          <span class="portal-capability-icon">📚</span>
          <span class="portal-capability-tag">Теория</span>
        </div>
        <h3 class="portal-capability-title">Конспекты и лекции с формулами</h3>
        <div class="portal-capability-sub">${visibleNotes.length} тем лекций · Формулы KaTeX · Поиск</div>
        <p class="portal-capability-desc">
          Полный теоретический лекционный материал курса. Строгие математические определения, формулировки теорем с доказательствами, типовые примеры и мгновенная фильтрация и поиск по формулам и терминам.
        </p>
        <div class="portal-capability-footer">
          <a href="notes/" class="btn quiet btn-sm">Читать конспекты →</a>
        </div>
      </article>

      <!-- 4. Коллоквиумы -->
      <article class="portal-capability-card">
        <div class="portal-capability-top">
          <span class="portal-capability-icon">🎓</span>
          <span class="portal-capability-tag">Подготовка к опросам</span>
        </div>
        <h3 class="portal-capability-title">Коллоквиумы и термины (Quizlet)</h3>
        <div class="portal-capability-sub">${colloquiumsCount} определений · Карточки Quizlet 3D</div>
        <p class="portal-capability-desc">
          Единый банк всех 106 строгих математических определений из лекций Пермякова и Страдиной (Коллоквиум 1 и Коллоквиум 2). Интерактивные флип-карточки для запоминания и структурированный словарь терминов.
        </p>
        <div class="portal-capability-footer">
          <a href="colloquiums/" class="btn quiet btn-sm">Учить определения →</a>
        </div>
      </article>

      <!-- 5. Практические занятия -->
      <article class="portal-capability-card">
        <div class="portal-capability-top">
          <span class="portal-capability-icon">📝</span>
          <span class="portal-capability-tag">На семинарах</span>
        </div>
        <h3 class="portal-capability-title">Практические занятия и разборы</h3>
        <div class="portal-capability-sub">Материалы семинаров · Решение задач</div>
        <p class="portal-capability-desc">
          Тексты и условия практических работ для решения в аудитории. Преподаватели наполняют практику формулами и задачами с распределением по учебным группам, а студенты изучают материалы прямо на паре.
        </p>
        <div class="portal-capability-footer">
          <a href="practices/" class="btn quiet btn-sm">Открыть практики →</a>
        </div>
      </article>

      <!-- 6. Домашние задания -->
      <article class="portal-capability-card">
        <div class="portal-capability-top">
          <span class="portal-capability-icon">📤</span>
          <span class="portal-capability-tag">Самостоятельно</span>
        </div>
        <h3 class="portal-capability-title">Домашние задания и сдача решений</h3>
        <div class="portal-capability-sub">Загрузка PDF · Рецензии · Оценивание</div>
        <p class="portal-capability-desc">
          Задания для самостоятельной работы с дедлайнами и критериями. Загружайте решение в формате PDF, отслеживайте статус проверки («Зачёт» / «На доработке») и читайте развёрнутые комментарии преподавателя.
        </p>
        <div class="portal-capability-footer">
          <a href="homeworks/" class="btn quiet btn-sm">Сдать ДЗ (PDF) →</a>
        </div>
      </article>
    </div>
  </section>

  <!-- Bottom Section: Top-5 Leaderboard and Course Tips -->
  <div class="portal-bottom-grid">
    <div class="portal-sidebar-box" style="margin-bottom: 0;">
      <div class="sidebar-box-header">
        <h3>🏆 Лидеры курса (Топ-5)</h3>
        <a href="leaderboard/" class="sidebar-more-link">Весь рейтинг →</a>
      </div>
      <div id="home-top5-leaderboard">
        <p class="muted">Загружаем лидеров…</p>
      </div>
    </div>

    <div class="portal-sidebar-box feature-box" style="margin-bottom: 0;">
      <h3>🧭 Советы по подготовке к сдаче</h3>
      <p style="margin: 0 0 0.75rem; font-size: 0.88rem; color: var(--muted); line-height: 1.5;">
        Чтобы успешно закрыть дисциплину на максимальный балл:
      </p>
      <ul style="margin: 0 0 1rem 1.25rem; padding: 0; font-size: 0.86rem; line-height: 1.6; color: var(--ink);">
        <li><b>Регулярно решайте тренажёры</b> перед контрольными точками и экзаменом.</li>
        <li><b>Повторяйте термины</b> в режиме карточек Quizlet перед коллоквиумами.</li>
        <li><b>Отрабатывайте ошибки</b>: смотрите «Слабые места» в личном профиле.</li>
      </ul>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <a href="tests/" class="btn quiet btn-sm">Выбрать тест</a>
        <a href="leaderboard/" class="btn quiet btn-sm">Открыть рейтинг</a>
      </div>
    </div>
  </div>
</main>

${authModalHtml(site)}
<script type="module" src="js/platform.js"></script>
<script type="module" src="js/home.js"></script>
</body>
</html>
`;
}

export function testsPage(tests = [], site = {}) {
  const visible = tests.filter((t) => !t.meta?.hidden);
  const testTopics = Array.from(new Set(visible.map((t) => t.meta?.topic).filter(Boolean)));
  const totalTasks = tests.reduce((sum, t) => sum + t.count, 0);

  const testItems = visible.map((t) => `
    <article class="test-catalog-card" data-topic="${esc(t.meta?.topic || '')}" data-id="${esc(t.id)}">
      <div class="test-card-top">
        <span class="test-topic-badge">${esc(t.meta?.topic || 'Общее')}</span>
        <span class="t-status test-status-badge" data-test-status="${esc(t.id)}">Не начат</span>
      </div>
      <h3 class="test-catalog-title"><a href="../${esc(t.id)}/">${esc(t.meta?.title || t.id)}</a></h3>
      <p class="test-catalog-desc">${esc(t.meta?.description || `Проверочная работа по теме: ${t.meta?.topic || t.id}`)}</p>
      <div class="test-catalog-footer">
        <span class="test-tasks-count">📝 ${tasksWord(t.count)}</span>
        <a href="../${esc(t.id)}/" class="btn primary btn-sm">Начать тест →</a>
      </div>
    </article>
  `).join("");

  return `${head("Тренажёры и генератор тестов — Дискретная математика", "../")}
<body class="platform-body tests-catalog-body">
  ${navbarHtml("../", "tests", site)}

  <main class="platform-container">
    <div class="page-header">
      <div class="page-title-wrap">
        <h1 class="page-title">📋 Тренажёры и генератор тестов</h1>
        <p class="page-subtitle">Практические задания по всем темам курса дискретной математики с мгновенной проверкой, разборами и генерацией случайных вариантов.</p>
      </div>
    </div>

    <!-- Generator Banner Card -->
    <div class="test-generator-card">
      <div class="generator-header">
        <div class="generator-icon">🎲</div>
        <div>
          <h2 class="generator-title">Генератор случайного теста</h2>
          <p class="generator-desc">Сформируйте персональный проверочный вариант из общего пула (${totalTasks} заданий курса) для комплексной самопроверки перед коллоквиумом или экзаменом.</p>
        </div>
      </div>

      <div class="generator-form">
        <div class="generator-row">
          <label class="generator-label">Количество заданий:</label>
          <div class="generator-pills" id="gen-count-pills">
            <button type="button" class="gen-pill" data-count="5">5 заданий</button>
            <button type="button" class="gen-pill active" data-count="10">10 заданий</button>
            <button type="button" class="gen-pill" data-count="15">15 заданий</button>
            <button type="button" class="gen-pill" data-count="20">20 заданий</button>
            <button type="button" class="gen-pill" data-count="30">30 заданий</button>
          </div>
        </div>

        <div class="generator-row">
          <label class="generator-label">Выбор темы:</label>
          <select id="gen-topic-select" class="gen-select">
            <option value="all">Все темы курса (Комплексный микс)</option>
            ${testTopics.map((tp) => `<option value="${esc(tp)}">${esc(tp)}</option>`).join("")}
          </select>
        </div>

        <div class="generator-row">
          <label class="generator-label">Режим прохождения:</label>
          <div class="generator-pills" id="gen-mode-pills">
            <button type="button" class="gen-pill active" data-mode="exam">⏱️ Экзамен (проверка в конце)</button>
            <button type="button" class="gen-pill" data-mode="practice">💡 Тренировка (с подсказками)</button>
          </div>
        </div>

        <div class="generator-actions">
          <button type="button" class="btn primary" id="btn-start-generator">
            🚀 Сгенерировать и начать тест
          </button>
        </div>
      </div>
    </div>

    <!-- Topics Filter & Search -->
    <div class="tests-toolbar" style="margin-top: 2.25rem;">
      <div class="topic-filters" id="tests-topic-filters">
        <button class="btn quiet btn-sm topic-filter-btn active" data-topic="all" type="button">Все темы (${visible.length})</button>
        ${testTopics.map((tp) => `<button class="btn quiet btn-sm topic-filter-btn" data-topic="${esc(tp)}" type="button">${esc(tp)}</button>`).join("")}
      </div>
      <div class="tests-search-box">
        <input type="search" id="tests-search" class="tests-search-input" placeholder="🔍 Поиск теста по названию...">
      </div>
    </div>

    <!-- Tests Cards Grid -->
    <div class="tests-catalog-grid" id="tests-catalog-grid">
      ${testItems}
    </div>

    <!-- Bookmarks Section -->
    <div class="favorites-section" id="favorites-section" style="margin-top: 3rem;" hidden>
      <div class="section-title-wrap">
        <h2 class="section-title">⭐ Мои избранные задания</h2>
      </div>
      <div id="favorites-list" class="favorites-grid"></div>
    </div>
  </main>

  ${authModalHtml(site)}
  <script type="module" src="../js/platform.js"></script>
  <script type="module" src="../js/tests-catalog.js"></script>
</body>
</html>`;
}

export function customTestPage(site = {}) {
  return `${head("Сгенерированный тест — Дискретная математика", "../", '<script defer src="../assets/katex/katex.min.js"></script>', true)}
<body class="quiz platform-body custom-test-body started">
  ${navbarHtml("../", "tests", site)}
  <header class="quiz-subtopbar">
    <div class="quiz-subtopbar-inner">
      <div class="quiz-subtopbar-left">
        <a class="topbar-back" href="./" aria-label="К каталогу тестов">← Все тренажёры</a>
        <span class="topbar-title" id="custom-test-title">🎲 Случайный вариант</span>
      </div>
      <div class="quiz-subtopbar-right">
        <button class="topbar-count" id="map-open" type="button" aria-label="Карта заданий"><span id="count">0</span>&thinsp;/&thinsp;<span id="total">0</span></button>
      </div>
    </div>
    <div class="progress" aria-hidden="true"><div id="progress-bar"></div></div>
  </header>

  <div class="quiz-layout">
    <main class="sheet">
      <section class="intro">
        <h1 id="custom-heading">🎲 Случайный проверочный тест</h1>
        <div class="lead" id="custom-lead">Вариант сгенерирован из общего пула заданий курса дискретной математики.</div>
        <p class="meta" id="custom-meta">Загрузка вопросов…</p>
      </section>

      <section class="result" id="result" hidden></section>
      <div class="questions" id="custom-questions-wrap">
        <p class="muted" style="text-align: center; padding: 2rem;">Формируем вопросы варианта…</p>
      </div>

      <section class="finish-section" id="finish-section" hidden>
        <div class="finish-card">
          <div class="finish-info">
            <h2 style="margin: 0 0 0.35rem; font-size: 1.25rem;">Завершение работы</h2>
            <p id="action-note" class="action-note" style="margin: 0; color: var(--muted); font-size: 0.9rem;">Нажмите для отправки на проверку и подсчёта баллов.</p>
          </div>
          <div id="actions" class="finish-actions">
            <button class="btn primary" id="custom-submit-btn" type="button">Отправить на проверку</button>
          </div>
        </div>
      </section>
    </main>
  </div>

  <dialog id="sheet-map" class="map-dialog">
    <div class="map-box" style="padding: 1.25rem; max-width: 480px; width: 90vw; background: var(--surface); border-radius: var(--radius-md); border: 1px solid var(--line);">
      <div class="map-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
        <h3 style="margin: 0; font-size: 1.1rem;">🗺️ Карта заданий варианта</h3>
        <button type="button" class="btn quiet btn-sm" data-close aria-label="Закрыть">✕</button>
      </div>
      <div class="map-grid" id="custom-map-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 0.5rem; margin-top: 0.75rem;"></div>
    </div>
  </dialog>

  ${authModalHtml(site)}
  <script type="module" src="../js/platform.js"></script>
  <script type="module" src="../js/custom-test-runner.js"></script>
</body>
</html>`;
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

export function practicesPage(practices = [], site = {}) {
  const visible = (practices || []).filter((p) => p.is_published);
  const clientData = JSON.stringify(practices.map((p) => ({
    id: p.id,
    order: p.order_index ?? p.order ?? 0,
    topic: p.topic || "Общее",
    title: p.title || p.id,
    group_name: p.group_name || "all",
    is_published: Boolean(p.is_published),
    content: p.content || "",
    html: p.html || "",
    created_at: p.created_at,
    updated_at: p.updated_at,
  })));

  const groupOptions = ["all", ...(site.groups || ["M3111", "M3112", "M3113", "M3114", "M3115"])]
    .map((g) => `<option value="${esc(g)}">${g === "all" ? "Все группы" : esc(g)}</option>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Практические занятия — Дискретная математика</title>
  <link rel="stylesheet" href="../assets/katex/katex.min.css">
  <link rel="stylesheet" href="../assets/style.css">
  <script>window.__PRACTICES_DATA__ = ${clientData};</script>
</head>
<body class="practices-body-app platform-body">
  ${navbarHtml("../", "practices", site)}
  
  <div class="practices-subbar">
    <div class="practices-subbar-title">
      <span>📝 Практики и семинары курса</span>
    </div>
    <div class="practices-subbar-controls">
      <div class="group-filter-wrap">
        <label for="practice-group-select" class="group-filter-label">Группа:</label>
        <select id="practice-group-select" class="form-select form-select-sm">
          ${groupOptions}
        </select>
      </div>
      <button type="button" class="btn quiet btn-sm practices-mobile-menu-btn" id="practices-menu-btn" aria-label="Открыть список практик">
        ☰ Практики
      </button>
    </div>
  </div>

  <div class="practices-layout">
    <aside class="practices-sidebar" id="practices-sidebar" aria-label="Список практик">
      <div class="practices-sidebar-header">
        <input type="search" id="practices-search" class="notes-search-input" placeholder="🔍 Поиск по практикам..." autocomplete="off">
      </div>
      <nav class="practices-list" id="practices-list"></nav>
    </aside>

    <main class="practices-content">
      <div class="practices-article-sheet" id="practices-article">
        <p class="muted">Загружаем материалы практики…</p>
      </div>
    </main>
  </div>

  ${authModalHtml(site)}
  <script src="../assets/katex/katex.min.js"></script>
  <script type="module" src="../js/platform.js"></script>
  <script type="module" src="../js/practices.js"></script>
</body>
</html>
`;
}

export function homeworksPage(homeworks = [], site = {}) {
  const visible = (homeworks || []).filter((h) => h.is_published);
  const clientData = JSON.stringify(homeworks.map((h) => ({
    id: h.id,
    order: h.order_index ?? h.order ?? 0,
    topic: h.topic || "Общее",
    title: h.title || h.id,
    group_name: h.group_name || "all",
    deadline: h.deadline || "",
    max_score: h.max_score || 10,
    is_published: Boolean(h.is_published),
    content: h.content || "",
    html: h.html || "",
    created_at: h.created_at,
    updated_at: h.updated_at,
    submissions_count: h.submissions_count || 0,
    user_submission: h.user_submission || null,
  })));

  const groupOptions = ["all", ...(site.groups || ["M3111", "M3112", "M3113", "M3114", "M3115"])]
    .map((g) => `<option value="${esc(g)}">${g === "all" ? "Все группы" : esc(g)}</option>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Домашние задания — Дискретная математика</title>
  <link rel="stylesheet" href="../assets/katex/katex.min.css">
  <link rel="stylesheet" href="../assets/style.css">
  <script>window.__HOMEWORKS_DATA__ = ${clientData};</script>
</head>
<body class="homeworks-body-app platform-body">
  ${navbarHtml("../", "homeworks", site)}

  <div class="homeworks-subbar">
    <div class="homeworks-subbar-title">
      <span>📤 Домашние задания и сдача решений</span>
    </div>
    <div class="homeworks-subbar-controls">
      <div class="group-filter-wrap">
        <label for="homework-group-select" class="group-filter-label">Группа:</label>
        <select id="homework-group-select" class="form-select form-select-sm">
          ${groupOptions}
        </select>
      </div>
      <button type="button" class="btn quiet btn-sm homeworks-mobile-menu-btn" id="homeworks-menu-btn" aria-label="Открыть список ДЗ">
        ☰ Задания
      </button>
    </div>
  </div>

  <div class="homeworks-layout">
    <aside class="homeworks-sidebar" id="homeworks-sidebar" aria-label="Список домашних заданий">
      <div class="homeworks-sidebar-header">
        <input type="search" id="homeworks-search" class="notes-search-input" placeholder="🔍 Поиск по заданиям..." autocomplete="off">
      </div>
      <div class="homeworks-cards-list" id="homeworks-cards-list"></div>
    </aside>

    <main class="homeworks-content">
      <div class="homeworks-detail-sheet" id="homework-detail-sheet">
        <p class="muted">Загружаем задание…</p>
      </div>
    </main>
  </div>

  ${authModalHtml(site)}
  <script src="../assets/katex/katex.min.js"></script>
  <script type="module" src="../js/platform.js"></script>
  <script type="module" src="../js/homeworks.js"></script>
</body>
</html>
`;
}

