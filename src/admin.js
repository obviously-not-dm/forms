import { grade, describe, normalize } from "./grade.js";
import { db } from "./db.js";

const root = document.getElementById("app");
let client;
const initialParams = new URLSearchParams(window.location.search);
let currentTab = initialParams.get("tab") || "tests"; // "tests" | "notes" | "colloquiums" | "practices" | "homeworks" | "contests" | "stats"
let currentUser = null;

function switchTab(tab) {
  currentTab = tab;
  try {
    const url = new URL(window.location);
    url.searchParams.set("tab", tab);
    history.replaceState(null, "", url.toString());
  } catch {}
  renderAdmin();
}

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) {
      n.addEventListener(k.slice(2), v);
    } else if (k === "class") {
      n.className = v;
    } else if (k === "value") {
      const s = String(v).trim();
      const clean = (s === "null" || s === "undefined") ? "" : String(v);
      n.value = clean;
      n.setAttribute("value", clean);
    } else {
      const s = String(v).trim();
      const clean = (s === "null" || s === "undefined") ? "" : v;
      n.setAttribute(k, clean === true ? "" : clean);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    const str = (c instanceof Node) ? null : String(c);
    if (str !== null && (str.trim() === "null" || str.trim() === "undefined")) continue;
    n.append(c instanceof Node ? c : str);
  }
  return n;
}

const adminGetCache = new Map();
const ADMIN_CACHE_TTL_MS = 15000;

async function json(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  if (method !== "GET") {
    adminGetCache.clear();
  } else if (!options.skipCache && path !== "/api/auth/session") {
    const cached = adminGetCache.get(path);
    if (cached && Date.now() - cached.ts < ADMIN_CACHE_TTL_MS) {
      return structuredClone ? structuredClone(cached.data) : JSON.parse(JSON.stringify(cached.data));
    }
  }

  const opts = { cache: "no-cache", credentials: "same-origin", ...options };
  opts.headers = { ...(opts.headers || {}) };
  const token = localStorage.getItem("dm_admin_token");
  if (token) {
    opts.headers["Authorization"] = `Bearer ${token}`;
  }
  if (opts.body && typeof opts.body === "object" && !(opts.body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const r = await fetch(path, opts);
  if (!r.ok) {
    let msg = `${path}: ${r.status}`;
    try {
      const err = await r.json();
      if (err.error) msg = err.error;
    } catch {}
    throw new Error(msg);
  }
  const data = await r.json();
  if (method === "GET" && path !== "/api/auth/session") {
    adminGetCache.set(path, { ts: Date.now(), data });
  }
  return data;
}

function openPreviewModal(url, title = "Предпросмотр") {
  const normUrl = (url.startsWith("/") || url.startsWith("http")) ? url : `/${url}`;
  let dlg = document.getElementById("admin-preview-dialog");
  if (!dlg) {
    dlg = el("dialog", { class: "admin-preview-dialog", id: "admin-preview-dialog" });
    document.body.append(dlg);
  }

  dlg.replaceChildren(
    el("div", { class: "admin-preview-container" },
      el("div", { class: "admin-preview-header" },
        el("div", { class: "admin-preview-title" }, `👁️ Предпросмотр: ${title}`),
        el("div", { class: "admin-preview-actions" },
          el("button", {
            class: "btn quiet btn-sm",
            type: "button",
            onclick: () => dlg.close(),
          }, "✕ Закрыть"))),
      el("iframe", {
        class: "admin-preview-frame",
        src: normUrl,
        title: title,
      }))
  );

  dlg.showModal();
}

main();

async function checkAuthSession() {
  try {
    const res = await json("/api/auth/session");
    if (res && res.authenticated) {
      if (res.user?.role === "admin" || res.user?.role === "teacher" || res.user?.id === "admin") {
        currentUser = res.user || { login: "admin@itmo.ru", role: "admin" };
        return true;
      }
    }
  } catch (e) {
    console.warn("Session check failed:", e);
  }
  if (client) {
    try {
      const { data, error } = await client.auth.getSession();
      if (!error && data?.session) {
        currentUser = { login: data.session.user.email || "admin", provider: "supabase" };
        return true;
      }
    } catch {}
  }
  return false;
}

async function main() {
  try {
    client = await db();
  } catch (e) {
    console.warn("DB init error:", e);
    client = null;
  }

  const authed = await checkAuthSession();
  if (authed) {
    renderAdmin();
  } else {
    login();
  }
}

// ---------- центрированный экран входа ----------

function login() {
  const email = el("input", {
    type: "text",
    autocomplete: "username",
    inputmode: "email",
    placeholder: "admin@itmo.ru",
    value: "admin@itmo.ru",
  });
  const password = el("input", {
    type: "password",
    autocomplete: "current-password",
    placeholder: "••••••••",
  });
  const status = el("p", { class: "field-error", style: "margin: 0.5rem 0;" });

  const form = el("form", {
    class: "login-card",
    onsubmit: async (e) => {
      e.preventDefault();
      status.textContent = "";
      const userVal = email.value.trim();
      const passVal = password.value;
      if (!userVal || !passVal) {
        status.textContent = "Пожалуйста, введите логин и пароль администратора.";
        return;
      }

      try {
        const res = await json("/api/auth/login", {
          method: "POST",
          body: { login: userVal, password: passVal },
        });
        if (res.ok) {
          if (res.token) {
            localStorage.setItem("dm_admin_token", res.token);
          }
          currentUser = res.user || { login: userVal, role: "admin" };
          renderAdmin();
          return;
        }
      } catch (err) {
        if (client) {
          try {
            const { data, error } = await client.auth.signInWithPassword({ email: userVal, password: passVal });
            if (!error && data?.session) {
              currentUser = { login: data.session.user.email, provider: "supabase" };
              renderAdmin();
              return;
            }
          } catch {}
        }
        status.textContent = "Неверный логин или пароль администратора.";
      }
    },
  },
    el("label", {}, el("span", { class: "field-label" }, "Логин или почта администратора"), email),
    el("label", {}, el("span", { class: "field-label" }, "Пароль"), password),
    el("div", {
      class: "login-hint",
      style: "font-size: 0.82rem; color: var(--muted); margin: 0.6rem 0; background: var(--sunken); padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--line); line-height: 1.45;",
    },
      el("div", { style: "font-weight: 600; color: var(--ink); margin-bottom: 0.2rem;" }, "Данные для входа по умолчанию:"),
      el("div", {}, "Логин: ", el("code", {}, "admin@itmo.ru"), " (или ", el("code", {}, "admin"), ")"),
      el("div", {}, "Пароль: ", el("code", {}, "admin")),
      el("div", { style: "margin-top: 0.3rem; font-size: 0.75rem; opacity: 0.85;" }, "Для сервера настраивается в docker-compose.yml через ADMIN_USER и ADMIN_PASSWORD.")),
    status,
    el("div", { class: "login-actions", style: "margin-top: 0.8rem;" },
      el("button", { class: "btn primary", type: "submit", style: "width: 100%; justify-content: center;" }, "Войти в систему")));

  root.replaceChildren(
    el("div", { class: "login-screen" },
      el("div", { class: "login-header" },
        el("h1", {}, "Панель преподавателя"),
        el("p", {}, "Управление тестами, конспектами, коллоквиумами и статистикой курса")),
      form));
}

// ---------- навигация админ-панели ----------

const ADMIN_TABS = [
  { key: "tests", label: "Тесты" },
  { key: "notes", label: "Конспекты" },
  { key: "colloquiums", label: "Коллоквиумы" },
  { key: "practices", label: "Практики" },
  { key: "homeworks", label: "ДЗ и Проверка" },
  { key: "typoviks", label: "Типовые расчеты" },
  { key: "schedule", label: "Расписание" },
  { key: "grades", label: "Журнал" },
  { key: "requests", label: "Заявки" },
  { key: "feedback", label: "Отзывы" },
  { key: "contests", label: "Онлайн-контесты" },
  { key: "stats", label: "Статистика" },
];

function renderAdmin() {
  let header = document.getElementById("admin-header-bar");
  let container = document.getElementById("admin-content");

  if (!header || !container) {
    const userLabel = currentUser?.login || "Администратор";
    const badge = el("span", {
      class: "tag tag-accent",
      style: "margin-left: 0.5rem; font-size: 0.82rem; font-weight: 600; font-family: var(--font-mono);",
    }, userLabel);

    const nav = el("div", { class: "admin-segmented-nav", id: "admin-segmented-nav", role: "tablist" },
      ...ADMIN_TABS.map((t) =>
        el("button", {
          class: `admin-nav-item ${currentTab === t.key ? "active" : ""}`,
          type: "button",
          role: "tab",
          "data-admin-tab": t.key,
          "aria-selected": currentTab === t.key ? "true" : "false",
          onclick: () => switchTab(t.key),
        }, t.label)
      )
    );

    const allTabsDrawer = el("div", { class: "admin-all-tabs-drawer", id: "admin-all-tabs-drawer" },
      el("div", { class: "admin-all-tabs-grid" },
        ...ADMIN_TABS.map((t) =>
          el("button", {
            class: `admin-drawer-tab-btn ${currentTab === t.key ? "active" : ""}`,
            type: "button",
            "data-admin-drawer-tab": t.key,
            onclick: () => {
              allTabsDrawer.classList.remove("open");
              switchTab(t.key);
            },
          },
            el("span", {}, t.label),
            el("span", { style: "opacity: 0.5; font-size: 0.75rem;" }, "→"))
        )
      )
    );

    const menuToggleBtn = el("button", {
      class: "btn quiet btn-sm",
      type: "button",
      id: "admin-menu-toggle-btn",
      onclick: () => {
        allTabsDrawer.classList.toggle("open");
      },
    }, "☰ Все разделы");

    const exitBtn = el("button", {
      class: "btn quiet btn-sm",
      type: "button",
      onclick: async () => {
        try {
          await json("/api/auth/logout", { method: "POST" });
        } catch {}
        if (client) {
          try { await client.auth.signOut(); } catch {}
        }
        localStorage.removeItem("dm_admin_token");
        adminGetCache.clear();
        currentUser = null;
        login();
      },
    }, "🚪 Выйти");

    const topRow = el("div", { class: "admin-top-row" },
      el("div", { style: "display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;" },
        el("a", { class: "btn quiet btn-sm", href: "/", style: "font-size: 0.82rem;" }, "← На платформу"),
        el("h1", { style: "margin: 0; font-size: 1.35rem; font-weight: 700;" }, "Панель управления"),
        badge),
      el("div", { style: "display: flex; align-items: center; gap: 0.5rem;" },
        menuToggleBtn,
        exitBtn));

    const navRow = el("div", { class: "admin-nav-row" }, nav);

    header = el("div", { class: "admin-header-bar", id: "admin-header-bar" }, topRow, navRow, allTabsDrawer);
    container = el("div", { id: "admin-content" });

    root.replaceChildren(header, container);
  } else {
    // Update active state in place without destroying header DOM or resetting scrollLeft
    header.querySelectorAll("[data-admin-tab]").forEach((btn) => {
      const isAct = btn.getAttribute("data-admin-tab") === currentTab;
      btn.classList.toggle("active", isAct);
      btn.setAttribute("aria-selected", isAct ? "true" : "false");
      if (isAct && typeof btn.scrollIntoView === "function") {
        try {
          btn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        } catch {}
      }
    });
    header.querySelectorAll("[data-admin-drawer-tab]").forEach((btn) => {
      const isAct = btn.getAttribute("data-admin-drawer-tab") === currentTab;
      btn.classList.toggle("active", isAct);
    });
    container.replaceChildren();
  }

  if (currentTab === "stats") {
    statsTab(container);
  } else if (currentTab === "notes") {
    notesTab(container);
  } else if (currentTab === "colloquiums") {
    colloquiumsTab(container);
  } else if (currentTab === "practices") {
    practicesTab(container);
  } else if (currentTab === "homeworks") {
    homeworksTab(container);
  } else if (currentTab === "typoviks") {
    typoviksTab(container);
  } else if (currentTab === "schedule") {
    scheduleTab(container);
  } else if (currentTab === "grades") {
    gradesTab(container);
  } else if (currentTab === "requests") {
    requestsTab(container);
  } else if (currentTab === "feedback") {
    feedbackTab(container);
  } else if (currentTab === "contests") {
    contestsTab(container);
  } else {
    testsTab(container);
  }
}

// ==========================================
// 1. ВКЛАДКА: СТАТИСТИКА
// ==========================================

let statsSubTab = "tests"; // "tests" | "contests"

async function statsTab(container) {
  const subNav = el("div", { class: "admin-segmented-nav", style: "margin-bottom: 1.25rem;", role: "tablist" },
    el("button", {
      class: `admin-nav-item ${statsSubTab === "tests" ? "active" : ""}`,
      type: "button",
      role: "tab",
      "aria-selected": statsSubTab === "tests",
      onclick: () => { statsSubTab = "tests"; statsTab(container); },
    }, "📋 Тренажёры курса"),
    el("button", {
      class: `admin-nav-item ${statsSubTab === "contests" ? "active" : ""}`,
      type: "button",
      role: "tab",
      "aria-selected": statsSubTab === "contests",
      onclick: () => { statsSubTab = "contests"; statsTab(container); },
    }, "⏱️ Онлайн-контесты"));

  const contentArea = el("div");
  container.replaceChildren(subNav, contentArea);

  if (statsSubTab === "contests") {
    renderContestStats(contentArea);
    return;
  }

  let tests = [];
  try {
    const res = await json("/api/tests");
    tests = Array.isArray(res) ? res : (res.tests || []);
  } catch {
    try {
      tests = await json("tests.json");
    } catch {
      tests = [];
    }
  }

  const testSelect = el("select", {}, tests.map((t) => el("option", { value: t.id }, t.title || t.id)));
  const sinceInput = el("input", { type: "date" });
  const modeSelect = el("select", {},
    el("option", { value: "" }, "Все режимы"),
    el("option", { value: "exam" }, "Проверка в конце"),
    el("option", { value: "practice" }, "Тренировка"));

  const exportBtn = el("button", {
    class: "btn quiet",
    type: "button",
    onclick: () => {
      const testId = testSelect.value;
      if (!testId) return;
      json(`/${testId}/key.json`).then(async (key) => {
        const attempts = await loadAttempts(testId, sinceInput.value, modeSelect.value);
        const graded = attempts.map((r) => ({ ...r, g: grade(key.questions, r.answers || {}) }));
        csv(key, testId, graded);
      }).catch((e) => alert(e.message));
    },
  }, "📥 Экспорт CSV");

  const clearBtn = el("button", {
    class: "btn quiet",
    type: "button",
    style: "color: var(--bad); font-size: 0.85rem;",
    onclick: async () => {
      const testId = testSelect.value;
      if (confirm(`Очистить все попытки по тесту «${testId}»?`)) {
        try {
          await json(`/api/attempts?testId=${encodeURIComponent(testId)}`, { method: "DELETE" });
        } catch {}
        localStorage.removeItem(`trainer:local_attempts:${testId}`);
        show();
      }
    },
  }, "🗑️ Сбросить попытки");

  const out = el("div");
  const show = () => {
    if (testSelect.value) renderStats(testSelect.value, sinceInput.value, modeSelect.value, out);
    else out.replaceChildren(el("p", { class: "muted" }, "Выберите тест для просмотра статистики."));
  };
  [testSelect, sinceInput, modeSelect].forEach((c) => c.addEventListener("change", show));

  const toolbar = el("div", { class: "stats-toolbar" },
    el("div", { class: "stats-field-box" },
      el("label", {}, "Тест"),
      testSelect),
    el("div", { class: "stats-field-box" },
      el("label", {}, "С даты"),
      sinceInput),
    el("div", { class: "stats-field-box" },
      el("label", {}, "Режим"),
      modeSelect),
    el("div", { style: "display: flex; gap: 0.4rem; align-items: flex-end;" },
      exportBtn,
      clearBtn));

  contentArea.replaceChildren(toolbar, out);

  if (tests.length) show();
  else out.replaceChildren(el("p", { class: "muted" }, "Тесты не найдены."));
}

async function renderContestStats(out) {
  out.replaceChildren(el("p", { class: "muted" }, "Загружаем контесты…"));
  let contests = [];
  try {
    contests = await json("/api/contests");
  } catch (e) {
    out.replaceChildren(el("p", { class: "field-error" }, `Ошибка: ${e.message}`));
    return;
  }
  if (!contests.length) {
    out.replaceChildren(el("p", { class: "muted" }, "Контесты ещё не создавались. Перейдите во вкладку «Онлайн-контесты», чтобы запустить работу."));
    return;
  }

  const contestSelect = el("select", {}, contests.map((c) => el("option", { value: c.id }, `${c.title} (${c.group_name === "all" ? "Все группы" : c.group_name}) — ${c.status === "active" ? "🟢 Идёт" : "🏁 Завершён"}`)));
  const contentArea = el("div");

  const loadSingle = async () => {
    const id = contestSelect.value;
    if (!id) return;
    contentArea.replaceChildren(el("p", { class: "muted" }, "Загружаем результаты контеста…"));
    try {
      const res = await json(`/api/contests/${id}/standings`);
      const { contest, standings = [] } = res;
      if (!standings.length) {
        contentArea.replaceChildren(
          el("div", { style: "padding: 2.5rem 1.5rem; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-lg); margin-top: 1rem;" },
            el("div", { style: "font-size: 2.2rem; margin-bottom: 0.5rem;" }, "⏱️"),
            el("h3", { style: "margin: 0 0 0.5rem;" }, "По этому контесту пока нет сданных работ"),
            el("p", { class: "muted" }, "Студенты сдают решения во время пары. Результаты появятся здесь в реальном времени.")
          )
        );
        return;
      }

      const total = standings.length;
      const avgScore = Math.round(standings.reduce((s, r) => s + (r.score || 0), 0) / total * 10) / 10;
      const maxScore = standings[0]?.max_score || 1;
      const avgPct = Math.round(standings.reduce((s, r) => s + (r.percentage || 0), 0) / total);
      const passedCount = standings.filter((r) => r.percentage >= 60).length;
      const passRate = Math.round((passedCount / total) * 100);
      const avgSec = Math.round(standings.reduce((s, r) => s + (r.duration_sec || 0), 0) / total);
      const avgTimeStr = `${Math.floor(avgSec / 60)} мин ${avgSec % 60} с`;
      const best = standings[0];

      const kpis = el("div", { class: "kpi-grid" },
        el("div", { class: "kpi-card" },
          el("div", { class: "kpi-label" }, "Сдали работу"),
          el("div", { class: "kpi-val" }, `${total}`),
          el("div", { class: "kpi-sub" }, "студентов")),
        el("div", { class: "kpi-card" },
          el("div", { class: "kpi-label" }, "Средний балл"),
          el("div", { class: "kpi-val", style: avgPct >= 60 ? "color: var(--good);" : "color: var(--accent);" }, `${avgScore} / ${maxScore}`),
          el("div", { class: "kpi-sub" }, `${avgPct}% правильных`)),
        el("div", { class: "kpi-card" },
          el("div", { class: "kpi-label" }, "Сдали на зачёт (≥ 60%)"),
          el("div", { class: "kpi-val", style: passRate >= 50 ? "color: var(--good);" : "color: var(--bad);" }, `${passRate}%`),
          el("div", { class: "kpi-sub" }, `${passedCount} из ${total} студ.`)),
        el("div", { class: "kpi-card" },
          el("div", { class: "kpi-label" }, "Среднее время"),
          el("div", { class: "kpi-val" }, avgTimeStr),
          el("div", { class: "kpi-sub" }, `Лидер: ${best?.user_name || "—"} (${best?.score} б.)`))
      );

      // Groups breakdown
      const grpMap = {};
      for (const r of standings) {
        const g = r.group_name || "без группы";
        (grpMap[g] ||= []).push(r);
      }
      const grpRows = Object.entries(grpMap).sort(([a], [b]) => a.localeCompare(b, "ru")).map(([g, rs]) => {
        const gAvgPct = Math.round(rs.reduce((s, r) => s + (r.percentage || 0), 0) / rs.length);
        const gPassed = rs.filter((r) => r.percentage >= 60).length;
        return [
          g,
          rs.length,
          el("span", { class: "tag", style: gAvgPct >= 60 ? "background: var(--good-soft); color: var(--good);" : "" }, `${gAvgPct}%`),
          `${gPassed} из ${rs.length}`,
        ];
      });

      const grpTable = table(["Группа", "Участников", "Средний результат", "Сдали (≥ 60%)"], grpRows);

      // Standings table
      const standRows = standings.map((r, i) => [
        el("strong", {}, r.badge || String(r.rank || (i + 1))),
        el("strong", {}, r.user_name || "Студент"),
        r.group_name || "—",
        `${r.score} / ${r.max_score}`,
        el("span", { class: "tag", style: r.percentage >= 60 ? "background: var(--good-soft); color: var(--good);" : "" }, `${r.percentage}%`),
        `${Math.floor(r.duration_sec / 60)} мин ${r.duration_sec % 60} с`,
        new Date(r.created_at).toLocaleTimeString("ru-RU"),
      ]);
      const standTable = table(["#", "Студент", "Группа", "Баллы", "Процент", "Время", "Сдано в"], standRows);

      const csvBtn = el("button", {
        class: "btn quiet btn-sm",
        type: "button",
        onclick: () => contestCsv(contest, standings),
      }, "📥 Экспорт результатов в CSV");

      const refreshBtn = el("button", {
        class: "btn quiet btn-sm",
        type: "button",
        onclick: loadSingle,
      }, "🔄 Обновить");

      contentArea.replaceChildren(
        kpis,
        el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem;" },
          el("h3", { style: "margin: 0;" }, "Результаты по группам"),
          el("div", { style: "display: flex; gap: 0.5rem;" }, refreshBtn, csvBtn)),
        grpTable,
        el("h3", { style: "margin: 1.5rem 0 0.5rem;" }, `Итоговая таблица студентов (${standings.length})`),
        standTable
      );
    } catch (e) {
      contentArea.replaceChildren(el("p", { class: "field-error" }, `Ошибка: ${e.message}`));
    }
  };

  contestSelect.addEventListener("change", loadSingle);

  const toolbar = el("div", { class: "stats-toolbar" },
    el("div", { class: "stats-field-box", style: "flex: 1; min-width: 250px;" },
      el("label", {}, "Выберите контест курса"),
      contestSelect));

  out.replaceChildren(toolbar, contentArea);
  loadSingle();
}

function getDemoAttempts(testId) {
  const localKey = `trainer:local_attempts:${testId}`;
  try {
    return JSON.parse(localStorage.getItem(localKey) || "[]");
  } catch {
    return [];
  }
}

async function loadAttempts(testId, since, mode) {
  // 1. Попытка загрузить из SQLite БД нашего сервера
  try {
    const params = new URLSearchParams();
    if (testId) params.set("testId", testId);
    if (since) params.set("since", since);
    if (mode) params.set("mode", mode);
    const res = await json(`/api/attempts?${params.toString()}`);
    if (Array.isArray(res) && res.length > 0) return res;
    if (res && Array.isArray(res.attempts) && res.attempts.length > 0) return res.attempts;
  } catch {}

  // 2. Если есть подключение к Supabase — опрашиваем его
  if (client) {
    try {
      const supaRows = await fetchAttempts(testId, since, mode);
      if (supaRows && supaRows.length > 0) return supaRows;
    } catch {}
  }

  // 3. Fallback на локальное хранилище браузера
  let all = getDemoAttempts(testId);
  if (since) all = all.filter((r) => r.created_at >= since);
  if (mode) all = all.filter((r) => r.mode === mode);
  return all;
}

async function fetchAttempts(testId, since, mode) {
  const rows = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = client.from("attempts").select("*").eq("quiz_id", testId)
      .order("created_at", { ascending: true }).range(from, from + page - 1);
    if (since) q = q.gte("created_at", since);
    if (mode) q = q.eq("mode", mode);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...data);
    if (data.length < page) return rows;
  }
}

const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
const share = (rs) => (rs.length ? rs.reduce((s, r) => s + (r.g.max ? r.g.score / r.g.max : 0), 0) / rs.length : 0);

async function renderStats(testId, since, mode, out) {
  out.replaceChildren(el("p", { class: "muted" }, "Загружаем статистику…"));
  let key, rows;
  try {
    [key, rows] = await Promise.all([
      json(`/${testId}/key.json`),
      loadAttempts(testId, since, mode),
    ]);
  } catch (e) {
    out.replaceChildren(el("p", { class: "field-error" }, `Не загрузилось: ${e.message}`));
    return;
  }
  if (!rows || !rows.length) {
    out.replaceChildren(
      el("div", { style: "padding: 3rem 1.5rem; text-align: center; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-lg); margin-top: 1.5rem;" },
        el("div", { style: "font-size: 2.5rem; margin-bottom: 0.6rem;" }, "📊"),
        el("h3", { style: "margin: 0 0 0.5rem; font-size: 1.15rem;" }, "По этому тесту пока нет решений"),
        el("p", { class: "muted", style: "margin: 0 auto; max-width: 32rem; font-size: 0.92rem; line-height: 1.5;" },
          "Решения сохраняются в базу данных SQLite на сервере при завершении теста студентом. Откройте этот тест в интерфейсе студента, ответьте на задания и завершите тест — статистика появится здесь автоматически.")
      )
    );
    return;
  }

  const qs = key.questions;
  const graded = rows.map((r) => ({ ...r, g: grade(qs, r.answers || {}) }));
  const groups = {};
  for (const r of graded) (groups[r.group_name || "без группы"] ||= []).push(r);

  const totalCount = graded.length;
  const avgScorePct = Math.round(share(graded) * 100);
  const passedCount = graded.filter((r) => r.g.max && (r.g.score / r.g.max) >= 0.6).length;
  const passRatePct = pct(passedCount, totalCount);
  const avgSec = Math.round(graded.reduce((s, r) => s + (r.duration_sec || 0), 0) / totalCount);
  const avgTimeStr = avgSec > 0 ? `${Math.floor(avgSec / 60)} мин ${avgSec % 60} с` : "—";

  const kpiCards = el("div", { class: "kpi-grid" },
    el("div", { class: "kpi-card" },
      el("div", { class: "kpi-label" }, "Всего решений"),
      el("div", { class: "kpi-val" }, String(totalCount)),
      el("div", { class: "kpi-sub" }, attemptsWord(totalCount))),
    el("div", { class: "kpi-card" },
      el("div", { class: "kpi-label" }, "Средний балл"),
      el("div", { class: "kpi-val", style: avgScorePct >= 60 ? "color: var(--good);" : "color: var(--accent);" }, `${avgScorePct}%`),
      el("div", { class: "kpi-sub" }, "от максимума")),
    el("div", { class: "kpi-card" },
      el("div", { class: "kpi-label" }, "Сдали (≥ 60%)"),
      el("div", { class: "kpi-val", style: passRatePct >= 50 ? "color: var(--good);" : "color: var(--bad);" }, `${passRatePct}%`),
      el("div", { class: "kpi-sub" }, `${passedCount} из ${totalCount} студ.`)),
    el("div", { class: "kpi-card" },
      el("div", { class: "kpi-label" }, "Среднее время"),
      el("div", { class: "kpi-val" }, avgTimeStr),
      el("div", { class: "kpi-sub" }, "на одну попытку")));

  const children = [
    kpiCards,
    el("h2", {}, "По группам"),
    table(["Группа", "Попыток", "Средний результат"],
      Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, "ru"))
        .map(([g, rs]) => [
          g,
          rs.length,
          el("span", { class: "tag", style: share(rs) >= 0.6 ? "background: var(--good-soft); color: var(--good);" : "" },
            `${Math.round(share(rs) * 100)}%`)
        ])),

    el("h2", {}, "По заданиям"),
    el("p", { class: "muted" },
      "Если многие дают один и тот же «неверный» ответ, проверьте ключ: возможно, это тоже правильная запись."),
    table(["№", "Верно", "С подсказкой", "Частые неверные ответы"], qs.map((q) => {
      const right = graded.filter((r) => r.g.results[q.id]).length;
      const hinted = graded.filter((r) => (r.hints || {})[q.id] > 0).length;
      const p = pct(right, graded.length);
      return [
        q.n,
        el("span", { class: p < 40 ? "low" : "" }, el("span", { class: "bar", style: `width:${Math.max(p, 2) * 0.6}px` }), `${p}%`),
        hinted ? `${pct(hinted, graded.length)}%` : "",
        topWrong(q, graded),
      ];
    })),

    feedbackList(graded),
  ].filter(Boolean);

  out.replaceChildren(...children);
}

function attemptsWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "попытка";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "попытки";
  return "попыток";
}

function topWrong(q, graded) {
  const counts = new Map();
  for (const r of graded) {
    if (r.g.results[q.id]) continue;
    const shown = describe(q, r.answers?.[q.id]);
    const k = q.type === "text" ? normalize(shown) : shown;
    const cur = counts.get(k) || { shown, n: 0 };
    cur.n++;
    counts.set(k, cur);
  }
  const top = [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 4);
  return top.length ? el("ul", { class: "wrong-list" }, top.map((t) => el("li", {}, `${t.shown} (${t.n})`))) : "";
}

function table(head, rows) {
  return el("div", { class: "stats-scroll" },
    el("table", { class: "stats" },
      el("thead", {}, el("tr", {}, head.map((h) => el("th", {}, h)))),
      el("tbody", {}, rows.map((r) => el("tr", {}, r.map((c) => el("td", {}, c)))))));
}

function feedbackList(graded) {
  const items = graded.filter((r) => r.feedback && String(r.feedback).trim()).reverse();
  if (!items.length) return null;
  return el("div", {}, el("h2", {}, "Отзывы"),
    el("ul", { class: "wrong-list" }, items.map((r) => el("li", {},
      `${r.group_name || "без группы"}, ${new Date(r.created_at).toLocaleDateString("ru-RU")}: ${r.feedback}`))));
}

function csv(key, testId, graded) {
  const qs = key.questions;
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["дата", "группа", "режим", "верно", "из", "секунд", ...qs.map((q) => `з${q.n}`), "отзыв"];
  const lines = graded.map((r) => [
    new Date(r.created_at).toISOString(), r.group_name, r.mode, r.g.score, r.g.max, r.duration_sec,
    ...qs.map((q) => `${r.g.results[q.id] ? "+" : "-"} ${describe(q, r.answers?.[q.id])}`),
    r.feedback,
  ].map(esc).join(";"));
  const blob = new Blob(["\ufeff" + [head.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `${testId}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function contestCsv(contest, standings) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["место", "студент", "группа", "баллы", "максимум", "процент", "секунд", "время_сдачи"];
  const lines = (standings || []).map((r, i) => [
    r.badge || r.rank || (i + 1),
    r.user_name || "—",
    r.group_name || "—",
    r.score,
    r.max_score,
    `${r.percentage}%`,
    r.duration_sec,
    new Date(r.created_at).toISOString(),
  ].map(esc).join(";"));
  const blob = new Blob(["\ufeff" + [head.map(esc).join(";"), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `contest_${contest?.id || 'export'}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ==========================================
// 2. ВКЛАДКА: КОНСТРУКТОР ТЕСТОВ (GOOGLE FORMS-LIKE)
// ==========================================

async function testsTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем список тестов…"));
  let list = [];
  try {
    const res = await json("/api/tests");
    list = Array.isArray(res) ? res : (res.tests || []);
  } catch {
    try {
      list = await json("tests.json");
    } catch (e) {
      container.replaceChildren(el("p", { class: "field-error" }, `Не удалось загрузить тесты: ${e.message}`));
      return;
    }
  }

  const createBtn = el("button", {
    class: "btn primary",
    type: "button",
    onclick: () => createNewTestPrompt(container),
  }, "➕ Создать новый тест");

  const head = el("div", { class: "test-manager-head" },
    el("div", {},
      el("h2", { style: "margin: 0;" }, "Управление тестами"),
      el("p", { class: "muted", style: "margin: 0.2rem 0 0;" }, "Создавайте и редактируйте тесты визуально в браузере")),
    createBtn);

  // Сбор уникальных тем/папок
  const topicsSet = new Set();
  for (const t of list) {
    if (t.topic && t.topic.trim()) topicsSet.add(t.topic.trim());
  }
  const topics = ["Все", ...Array.from(topicsSet)];
  let activeTopic = "Все";

  const tabsContainer = el("div", { class: "topic-tabs", style: "margin-bottom: 1.25rem;" });
  const grid = el("div", { class: "test-cards-grid" });

  function renderCards() {
    const filtered = activeTopic === "Все"
      ? list
      : list.filter((t) => (t.topic || "Без темы") === activeTopic);

    grid.replaceChildren();

    if (!filtered.length) {
      grid.replaceChildren(el("p", { class: "muted", style: "grid-column: 1 / -1; padding: 2rem; text-align: center;" }, "В этой теме пока нет тестов."));
      return;
    }

    for (const t of filtered) {
      const card = el("div", { class: "test-card" },
        el("div", {},
          el("div", { class: "test-card-title" }, t.title || t.id),
          el("div", { class: "test-card-desc" }, t.description || "Без описания"),
          el("div", { class: "test-card-meta", style: "margin-top: 0.8rem; display: flex; flex-wrap: wrap; gap: 0.4rem;" },
            el("span", { class: "tag" }, `ID: ${t.id}`),
            el("span", { class: "tag" }, `${t.count || 0} заданий`),
            t.topic ? el("span", { class: "tag tag-accent" }, `📁 ${t.topic}`) : null,
            t.hidden ? el("span", { class: "tag", style: "background: var(--bad-soft); color: var(--bad);" }, "Скрыт") : null)),
        el("div", { class: "test-card-actions" },
          el("button", {
            class: "btn primary btn-sm",
            type: "button",
            onclick: () => openEditor(t.id, container),
          }, "✏️ Редактировать"),
          el("button", {
            class: "btn quiet btn-sm",
            type: "button",
            onclick: () => openPreviewModal(`${t.id}/`, t.title || t.id),
          }, "🔍 Просмотр"),
          el("button", {
            class: `btn btn-sm btn-visibility-toggle ${t.hidden ? "is-hidden" : "is-visible"}`,
            type: "button",
            title: t.hidden ? "Тест скрыт для студентов. Нажмите, чтобы открыть." : "Тест виден студентам. Нажмите, чтобы скрыть.",
            onclick: async () => {
              try {
                await json(`/api/tests/${encodeURIComponent(t.id)}`, {
                  method: "PUT",
                  body: { hidden: !t.hidden },
                });
                testsTab(container);
              } catch (e) {
                alert(`Ошибка изменения видимости теста: ${e.message}`);
              }
            },
          }, t.hidden ? "🙈 Скрыт" : "👁️ Виден"),
          el("button", {
            class: "btn quiet btn-sm btn-delete-action",
            type: "button",
            title: "Удалить тест",
            onclick: () => deleteTestConfirm(t.id, container),
          }, "🗑️")));
      grid.append(card);
    }
  }

  function renderTabs() {
    tabsContainer.replaceChildren(
      ...topics.map((tp) => el("button", {
        class: `topic-tab ${tp === activeTopic ? "active" : ""}`,
        type: "button",
        onclick: () => { activeTopic = tp; renderTabs(); renderCards(); },
      }, tp === "Все" ? "Все темы" : `📁 ${tp}`))
    );
  }

  renderTabs();
  renderCards();

  container.replaceChildren(head, topics.length > 1 ? tabsContainer : el("span"), grid);
}

async function createNewTestPrompt(container) {
  const idInput = el("input", { type: "text", placeholder: "relations-3", required: true });
  const titleInput = el("input", { type: "text", placeholder: "Бинарные отношения, часть 3", required: true });
  const topicInput = el("input", { type: "text", placeholder: "Бинарные отношения (необязательно)" });
  const status = el("p", { class: "field-error" });

  const modal = el("dialog", { style: "border: 0; border-radius: var(--radius-lg); padding: 1.5rem; max-width: 28rem; width: 90vw; background: var(--card); box-shadow: var(--shadow-lg);" },
    el("h2", { style: "margin-top: 0;" }, "Новый тест"),
    el("p", { class: "muted" }, "Задайте идентификатор для ссылки, название и тему теста:"),
    el("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        status.textContent = "";
        const id = idInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
        const title = titleInput.value.trim();
        const topic = topicInput.value.trim();
        if (!id || !title) return;
        try {
          await json("/api/tests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, title, topic }),
          });
          modal.close();
          modal.remove();
          openEditor(id, container);
        } catch (err) {
          status.textContent = err.message;
        }
      },
    },
      el("label", {}, el("span", { class: "field-label" }, "Идентификатор (латиница для URL)"), idInput),
      el("label", {}, el("span", { class: "field-label" }, "Название теста"), titleInput),
      el("label", {}, el("span", { class: "field-label" }, "Тема / папка"), topicInput),
      status,
      el("div", { style: "display: flex; gap: 0.6rem; justify-content: flex-end; margin-top: 1rem;" },
        el("button", { class: "btn quiet", type: "button", onclick: () => { modal.close(); modal.remove(); } }, "Отмена"),
        el("button", { class: "btn primary", type: "submit" }, "Создать и редактировать"))));

  document.body.append(modal);
  modal.showModal();
}

async function deleteTestConfirm(testId, container) {
  if (!confirm(`Вы действительно хотите удалить тест «${testId}»? Все файлы теста будут удалены.`)) return;
  try {
    await json(`/api/tests/${testId}`, { method: "DELETE" });
    testsTab(container);
  } catch (err) {
    alert(`Ошибка удаления: ${err.message}`);
  }
}

// ---------- ВИЗУАЛЬНЫЙ РЕДАКТОР (GOOGLE FORMS С БОКОВОЙ ПАНЕЛЬЮ) ----------

function cleanStr(val) {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  if (s === "null" || s === "undefined") return "";
  return s;
}

function sanitizeModel(model) {
  if (!model) return model;
  model.id = cleanStr(model.id);
  model.meta = model.meta || {};
  model.meta.title = cleanStr(model.meta.title) || "Без названия";
  model.meta.description = cleanStr(model.meta.description);
  model.meta.topic = cleanStr(model.meta.topic);
  model.meta.feedback = cleanStr(model.meta.feedback);
  model.meta.order = Math.max(0, Number(model.meta.order) || 0);
  model.meta.hidden = Boolean(model.meta.hidden);

  model.sections = Array.isArray(model.sections) ? model.sections : [];
  if (model.sections.length === 0) {
    model.sections.push({ title: "Блок 1", questions: [] });
  }

  for (const sec of model.sections) {
    sec.title = cleanStr(sec.title) || "Блок";
    sec.questions = Array.isArray(sec.questions) ? sec.questions : [];
    for (const q of sec.questions) {
      q.id = cleanStr(q.id);
      q.text = cleanStr(q.text);
      q.type = q.type || "single";
      q.explanation = cleanStr(q.explanation);
      q.hints = Array.isArray(q.hints)
        ? q.hints.map(cleanStr).filter((h) => h.length > 0)
        : [];
      if (q.type === "text") {
        q.format = cleanStr(q.format) || "число";
        q.answers = Array.isArray(q.answers)
          ? q.answers.map(cleanStr).filter((a) => a.length > 0)
          : ["0"];
        q.options = [];
      } else {
        q.answers = [];
        q.options = Array.isArray(q.options) ? q.options : [];
        for (const opt of q.options) {
          opt.md = cleanStr(opt.md);
          opt.note = cleanStr(opt.note);
          opt.correct = Boolean(opt.correct);
        }
      }
    }
  }
  model.images = Array.isArray(model.images) ? model.images : [];
  return model;
}

function parseRawMdToSections(raw) {
  if (!raw) return [{ title: "Блок 1", questions: [] }];
  const body = raw.replace(/^---[\s\S]*?---\s*/, "");
  const sections = [];
  let currentSec = null;
  let currentQ = null;
  let auto = 0;

  const flushQ = () => {
    if (!currentQ) return;
    if (!currentSec) {
      currentSec = { title: "Блок 1", questions: [] };
      sections.push(currentSec);
    }
    currentSec.questions.push(currentQ);
    currentQ = null;
  };

  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.*)$/);
    const h2 = line.match(/^##\s+(.*)$/);
    if (h1) {
      flushQ();
      currentSec = { title: h1[1].trim(), questions: [] };
      sections.push(currentSec);
    } else if (h2) {
      flushQ();
      const qid = h2[1].trim().split(/[\s.]/)[0] || String(++auto);
      currentQ = { id: qid, text: "", type: "single", options: [], answers: [], hints: [], explanation: "", format: "" };
    } else if (currentQ) {
      const opt = line.match(/^- ([([])([xXхХ ])[)\]]\s+(.*)$/);
      const kw = line.match(/^(Ответ|Формат|Подсказка|Пояснение)\s*:\s*(.*)$/);
      const note = line.match(/^\s{2,}>\s?(.*)$/);

      if (opt) {
        currentQ.type = opt[1] === "(" ? "single" : "multiple";
        currentQ.options.push({ md: opt[3], correct: opt[2].trim() !== "", note: "" });
      } else if (note && currentQ.options.length) {
        currentQ.options.at(-1).note = (currentQ.options.at(-1).note ? currentQ.options.at(-1).note + "\n" : "") + note[1];
      } else if (kw) {
        const [, word, rest] = kw;
        if (word === "Ответ") {
          currentQ.type = "text";
          currentQ.answers.push(rest.trim());
        } else if (word === "Формат") {
          currentQ.format = rest.trim();
        } else if (word === "Подсказка") {
          if (rest.trim()) currentQ.hints.push(rest.trim());
        } else if (word === "Пояснение") {
          currentQ.explanation = (currentQ.explanation ? currentQ.explanation + "\n" : "") + rest.trim();
        }
      } else {
        currentQ.text = (currentQ.text ? currentQ.text + "\n" : "") + line;
      }
    }
  }
  flushQ();

  if (!sections.length) {
    sections.push({ title: "Блок 1", questions: [] });
  }
  return sections;
}

async function openEditor(testId, container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем редактор теста…"));
  let testData;
  try {
    testData = await json(`/api/tests/${testId}`);
  } catch (err) {
    container.replaceChildren(el("p", { class: "field-error" }, `Не удалось загрузить тест: ${err.message}`));
    return;
  }

  let sections = (testData.sections && testData.sections.length) ? testData.sections : null;
  if ((!sections || !sections.some((s) => s.questions && s.questions.length)) && testData.rawMd) {
    sections = parseRawMdToSections(testData.rawMd);
  }
  if (!sections || !sections.length) {
    sections = [{ title: "Блок 1", questions: [] }];
  }

  // Создаём рабочую копию модели для редактирования с полной санитизацией от null
  const model = sanitizeModel({
    id: testData.id,
    meta: {
      title: testData.meta?.title || "Без названия",
      description: testData.meta?.description || "",
      topic: testData.meta?.topic || "",
      order: Math.max(0, Number(testData.meta?.order) || 0),
      hidden: Boolean(testData.meta?.hidden),
      feedback: testData.meta?.feedback || "",
    },
    sections,
    images: testData.images || [],
  });

  renderEditorForm(model, container);
}

function renderEditorForm(model, container) {
  const saveMsg = el("span", { class: "save-msg" });
  let isSaving = false;
  let isDirty = false;
  const markDirty = () => { isDirty = true; };

  const beforeUnloadHandler = (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);

  const cleanupAndLeave = () => {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    testsTab(container);
  };

  // Состояние свернутых карточек и ошибок валидации
  const collapsedSet = new Set();
  let validationErrors = new Map(); // Question -> string[]
  let globalErrors = [];

  // Валидация всей модели
  function validate() {
    const errors = new Map();
    const globals = [];

    if (model.meta.order < 0) {
      globals.push("Порядок (order) не может быть отрицательным.");
    }
    if (!model.meta.title?.trim()) {
      globals.push("Название теста не может быть пустым.");
    }

    const seenIds = new Map();
    let totalQuestions = 0;

    for (const sec of model.sections) {
      for (const q of sec.questions) {
        totalQuestions++;
        const qErrors = [];
        const qId = String(q.id || "").trim();

        if (!qId) {
          qErrors.push("ID задания не может быть пустым.");
        } else if (seenIds.has(qId)) {
          qErrors.push(`Дублирующийся ID задания: «${qId}». ID должны быть уникальными.`);
          const prev = seenIds.get(qId);
          if (!errors.has(prev)) errors.set(prev, []);
          if (!errors.get(prev).some((e) => e.includes("Дублирующийся ID"))) {
            errors.get(prev).push(`Дублирующийся ID задания: «${qId}». ID должны быть уникальными.`);
          }
        } else {
          seenIds.set(qId, q);
        }

        if (!q.text?.trim()) {
          qErrors.push("Условие задания не может быть пустым.");
        }

        if (q.type === "single" || q.type === "multiple") {
          if (!q.options || q.options.length < 2) {
            qErrors.push("Должно быть минимум 2 варианта ответа.");
          } else {
            for (let i = 0; i < q.options.length; i++) {
              if (!q.options[i].md?.trim()) {
                qErrors.push(`Вариант ${i + 1} не может быть пустым.`);
              }
            }
            const correctCount = q.options.filter((o) => o.correct).length;
            if (q.type === "single") {
              if (correctCount !== 1) {
                qErrors.push("Для типа «Один верный вариант» выберите ровно один правильный ответ.");
              }
            } else {
              if (correctCount < 1) {
                qErrors.push("Для типа «Несколько верных» выберите хотя бы один правильный ответ.");
              }
            }
          }
        } else if (q.type === "text") {
          if (!q.format?.trim()) {
            qErrors.push("Укажите формат ответа (например: число или {множество}).");
          }
          const validAnswers = (q.answers || []).filter((a) => a && a.trim());
          if (!validAnswers.length) {
            qErrors.push("Укажите хотя бы один правильный ответ.");
          }
        }

        if (qErrors.length) {
          errors.set(q, (errors.get(q) || []).concat(qErrors));
        }
      }
    }

    if (totalQuestions === 0) {
      globals.push("Тест должен содержать хотя бы одно задание.");
    }

    return { valid: errors.size === 0 && globals.length === 0, errors, globals };
  }

  const saveBtn = el("button", {
    class: "btn primary",
    type: "button",
    onclick: async () => {
      if (isSaving) return;
      sanitizeModel(model);

      const res = validate();
      validationErrors = res.errors;
      globalErrors = res.globals;

      if (!res.valid) {
        // Разворачиваем карточки с ошибками для наглядности
        for (const q of validationErrors.keys()) {
          collapsedSet.delete(q);
        }
        renderSections();

        const totalErrCount = globalErrors.length + Array.from(validationErrors.values()).reduce((sum, arr) => sum + arr.length, 0);
        saveMsg.className = "save-msg error";
        saveMsg.textContent = `Ошибок валидации: ${totalErrCount}. Пожалуйста, исправьте их.`;

        // Скроллим к первой ошибочной карточке
        const firstErrCard = sectionsBox.querySelector(".question-card.has-error");
        if (firstErrCard) {
          firstErrCard.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        return;
      }

      isSaving = true;
      saveMsg.className = "save-msg";
      saveMsg.textContent = "Сохраняем…";
      saveBtn.disabled = true;

      // Нормализуем ID вопросов перед сохранением
      let autoId = 0;
      for (const sec of model.sections) {
        for (const q of sec.questions) {
          if (!q.id) q.id = String(++autoId);
        }
      }

      const targetId = cleanStr(model.id) || cleanStr(testId);
      try {
        await json(`/api/tests/${encodeURIComponent(targetId)}`, {
          method: "PUT",
          body: { id: targetId, data: model },
        });
        validationErrors.clear();
        globalErrors = [];
        renderSections();
        isDirty = false;
        saveMsg.className = "save-msg success";
        saveMsg.textContent = "✓ Сохранено успешно!";
        setTimeout(() => { if (saveMsg.textContent.includes("✓")) saveMsg.textContent = ""; }, 3000);
      } catch (err) {
        saveMsg.className = "save-msg error";
        saveMsg.textContent = `Ошибка сохранения: ${err.message}`;
      } finally {
        isSaving = false;
        saveBtn.disabled = false;
      }
    },
  }, "💾 Сохранить тест");

  const backBtn = el("button", {
    class: "btn quiet",
    type: "button",
    onclick: () => {
      if (isDirty) {
        const ok = confirm("У вас есть несохранённые изменения в тесте.\n\nВы действительно хотите выйти без сохранения?");
        if (!ok) return;
      }
      cleanupAndLeave();
    },
  }, "← К списку тестов");

  const hiddenCheckbox = el("input", {
    type: "checkbox",
    checked: Boolean(model.meta.hidden),
    onchange: () => {
      model.meta.hidden = hiddenCheckbox.checked;
      isDirty = true;
      updateTestHideBtn();
    },
  });

  const hideTestBtn = el("button", {
    class: "btn quiet",
    type: "button",
    title: "Скрыть / показать тест на главной",
    onclick: () => {
      hiddenCheckbox.checked = !hiddenCheckbox.checked;
      model.meta.hidden = hiddenCheckbox.checked;
      isDirty = true;
      updateTestHideBtn();
    },
  });

  function updateTestHideBtn() {
    hideTestBtn.textContent = hiddenCheckbox.checked ? "🙈 Скрыт для студентов" : "👁️ Виден на главной";
    hideTestBtn.className = `btn btn-sm btn-visibility-toggle ${hiddenCheckbox.checked ? "is-hidden" : "is-visible"}`;
  }
  updateTestHideBtn();

  const previewLink = el("button", {
    class: "btn quiet btn-sm",
    type: "button",
    onclick: () => openPreviewModal(`${model.id}/`, model.meta.title || model.id),
  }, "🔍 Предпросмотр");

  const topNav = el("div", { class: "editor-top-nav" },
    backBtn,
    el("div", { style: "display: flex; gap: 0.6rem; align-items: center;" }, hideTestBtn, previewLink));

  // Карточка заголовка (Google Forms Header Card)
  const titleInput = el("input", {
    class: "editor-title-input",
    type: "text",
    value: cleanStr(model.meta.title),
    placeholder: "Название теста",
    oninput: () => { model.meta.title = titleInput.value; },
  });

  const descInput = el("textarea", {
    rows: 2,
    placeholder: "Описание теста для студентов (поддерживается Markdown и $формулы$)",
    oninput: () => { model.meta.description = descInput.value; },
  }, cleanStr(model.meta.description));

  const topicInput = el("input", {
    type: "text",
    value: cleanStr(model.meta.topic),
    placeholder: "например: Бинарные отношения",
    oninput: () => { model.meta.topic = topicInput.value.trim(); },
  });

  const orderInput = el("input", {
    type: "number",
    min: "0",
    value: String(model.meta.order ?? 0),
    oninput: () => {
      const val = parseInt(orderInput.value, 10);
      model.meta.order = isNaN(val) ? 0 : Math.max(0, val);
      if (orderInput.value !== "" && Number(orderInput.value) < 0) {
        orderInput.value = "0";
      }
    },
  });

  const feedbackInput = el("input", {
    type: "text",
    value: cleanStr(model.meta.feedback),
    placeholder: "Что было непонятно? Необязательно",
    oninput: () => { model.meta.feedback = feedbackInput.value; },
  });

  const headerCard = el("div", { class: "editor-card editor-header-card" },
    titleInput,
    descInput,
    el("div", { class: "editor-meta-grid" },
      el("label", {}, el("span", { class: "field-label" }, "Папка / Тема (topic)"), topicInput),
      el("label", {}, el("span", { class: "field-label" }, "Порядок на главной (order >= 0)"), orderInput),
      el("label", {}, el("span", { class: "field-label" }, "Вопрос для отзыва"), feedbackInput),
      el("label", { style: "display: flex; align-items: center; gap: 0.5rem; margin-top: 1.5rem; cursor: pointer;" },
        hiddenCheckbox,
        el("span", { class: "field-label", style: "margin: 0;" }, "Скрыть на главной"))));

  // Боковая панель десктоп-навигации (Side Panel)
  const sideMapGrid = el("div", { class: "side-map-grid" });
  const sideQCount = el("span", { class: "tag tag-accent", id: "side-q-count" }, "0 зад.");

  const toggleAllCollapseBtn = el("button", {
    class: "btn quiet editor-action-btn",
    type: "button",
    style: "justify-content: center; text-align: center; width: 100%;",
    onclick: () => {
      const allQ = model.sections.flatMap((s) => s.questions);
      if (collapsedSet.size >= allQ.length) {
        collapsedSet.clear();
      } else {
        for (const q of allQ) collapsedSet.add(q);
      }
      renderSections();
    },
  }, "↕️ Свернуть / Развернуть все");

  const sidePreviewLink = el("button", {
    class: "btn quiet editor-action-btn",
    type: "button",
    style: "justify-content: center; text-align: center; width: 100%;",
    onclick: () => openPreviewModal(`${model.id}/`, model.meta.title || model.id),
  }, "👁️ Открыть тест");

  const sidePanel = el("aside", { class: "editor-side-panel", "aria-label": "Панель быстрой навигации" },
    el("div", { class: "editor-side-card" },
      el("div", { class: "editor-side-header" },
        el("span", { class: "editor-side-title" }, "Навигатор теста"),
        sideQCount),
      el("div", { class: "editor-map-section" },
        el("div", { class: "editor-map-title" }, "Карта заданий"),
        sideMapGrid),
      el("div", { class: "editor-side-actions" },
        el("button", {
          class: "btn primary editor-action-btn",
          type: "button",
          style: "justify-content: center; text-align: center; width: 100%;",
          onclick: () => saveBtn.click(),
        }, "💾 Сохранить"),
        el("button", {
          class: "btn quiet editor-action-btn",
          type: "button",
          style: "justify-content: center; text-align: center; width: 100%;",
          onclick: () => {
            const lastSec = model.sections.at(-1);
            if (lastSec) {
              lastSec.questions.push({
                id: String(lastSec.questions.length + 1),
                text: "Новое задание",
                type: "single",
                options: [
                  { md: "Вариант 1", correct: true, note: "" },
                  { md: "Вариант 2", correct: false, note: "" },
                ],
                hints: [],
                explanation: "Пояснение.",
              });
              renderSections();
              const lastIdx = model.sections.flatMap((s) => s.questions).length;
              document.getElementById(`q-card-${lastIdx}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          },
        }, "➕ Добавить задание"),
        toggleAllCollapseBtn,
        sidePreviewLink,
        el("button", {
          class: "btn quiet editor-action-btn",
          type: "button",
          style: "justify-content: center; text-align: center; width: 100%;",
          onclick: () => window.scrollTo({ top: 0, behavior: "smooth" }),
        }, "⬆️ В начало"))));

  // Синхронизация навигации по заданиям в редакторе с автопрокруткой миникарты
  let isEditorManualNav = false;
  let editorManualNavTimer = null;
  let editorObserver = null;

  function highlightEditorQuestion(qNum, scrollInMap = true) {
    if (!qNum) return;
    let activeMapBtn = null;
    sideMapGrid.querySelectorAll(".side-map-btn").forEach((btn) => {
      const isCurrent = btn.dataset.qNum === String(qNum);
      btn.classList.toggle("current", isCurrent);
      if (isCurrent && !activeMapBtn) activeMapBtn = btn;
    });
    if (scrollInMap && activeMapBtn) {
      activeMapBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }

  // Контейнер секций и вопросов
  const sectionsBox = el("div", { style: "display: grid; gap: 1.5rem;" });

  const renderSections = () => {
    sectionsBox.replaceChildren();
    sideMapGrid.replaceChildren();
    let qTotal = 0;

    model.sections.forEach((sec, sIdx) => {
      const secTitleInput = el("input", {
        class: "section-title-input",
        type: "text",
        value: sec.title,
        placeholder: "Название блока (например: Блок 1. Отношения эквивалентности)",
        oninput: () => { sec.title = secTitleInput.value; },
      });

      const delSecBtn = el("button", {
        class: "btn quiet",
        type: "button",
        style: "color: var(--bad); font-size: 0.85rem;",
        onclick: () => {
          if (confirm(`Удалить блок «${sec.title || sIdx + 1}» со всеми заданиями?`)) {
            model.sections.splice(sIdx, 1);
            renderSections();
          }
        },
      }, "Удалить блок");

      const secHead = el("div", { class: "section-card-head" },
        el("div", { style: "flex: 1;" }, secTitleInput),
        model.sections.length > 1 ? delSecBtn : null);

      const questionsList = el("div", { style: "display: grid; gap: 1rem; margin-top: 1rem;" });

      sec.questions.forEach((q, qIdx) => {
        qTotal++;
        const currentQNum = qTotal;
        const qErrors = validationErrors.get(q) || [];
        const isCollapsed = collapsedSet.has(q);

        // Карточка вопроса
        const qCard = renderQuestionCard({
          q,
          displayNum: currentQNum,
          sec,
          sIdx,
          qIdx,
          isCollapsed,
          errors: qErrors,
          model,
          onChange: () => renderSections(),
          onToggleCollapse: () => {
            if (collapsedSet.has(q)) collapsedSet.delete(q);
            else collapsedSet.add(q);
            renderSections();
          },
          onMoveUp: () => {
            if (qIdx > 0) {
              const t = sec.questions[qIdx];
              sec.questions[qIdx] = sec.questions[qIdx - 1];
              sec.questions[qIdx - 1] = t;
              renderSections();
            }
          },
          onMoveDown: () => {
            if (qIdx < sec.questions.length - 1) {
              const t = sec.questions[qIdx];
              sec.questions[qIdx] = sec.questions[qIdx + 1];
              sec.questions[qIdx + 1] = t;
              renderSections();
            }
          },
        });
        questionsList.append(qCard);

        // Кнопка в боковой миникарте
        const mapBtn = el("button", {
          class: `side-map-btn ${qErrors.length ? "error" : ""}`,
          type: "button",
          "data-q-num": String(currentQNum),
          title: `Задание № ${currentQNum}${qErrors.length ? " (есть ошибки)" : ""}`,
          onclick: () => {
            highlightEditorQuestion(currentQNum, true);
            isEditorManualNav = true;
            clearTimeout(editorManualNavTimer);
            editorManualNavTimer = setTimeout(() => { isEditorManualNav = false; }, 900);
            if (collapsedSet.has(q)) {
              collapsedSet.delete(q);
              renderSections();
            }
            const targetCard = document.getElementById(`q-card-${currentQNum}`);
            if (targetCard) {
              targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
              targetCard.style.transition = "outline 0.25s, box-shadow 0.25s";
              targetCard.style.outline = "2px solid var(--accent)";
              targetCard.style.boxShadow = "0 0 0 4px var(--accent-soft)";
              setTimeout(() => {
                targetCard.style.outline = "";
                targetCard.style.boxShadow = "";
              }, 1200);
            }
          },
        }, String(currentQNum));
        sideMapGrid.append(mapBtn);
      });

      const addQuestionBtn = el("button", {
        class: "btn quiet",
        type: "button",
        style: "border: 1px dashed var(--line-strong); padding: 0.7rem; justify-content: center; margin-top: 0.5rem;",
        onclick: () => {
          sec.questions.push({
            id: String(sec.questions.length + 1),
            text: "Новое задание",
            type: "single",
            options: [
              { md: "Вариант 1", correct: true, note: "" },
              { md: "Вариант 2", correct: false, note: "" },
            ],
            hints: [],
            explanation: "Разбор задания.",
          });
          renderSections();
        },
      }, "➕ Добавить задание в этот блок");

      const secBlock = el("div", { class: "section-block" }, secHead, questionsList, addQuestionBtn);
      sectionsBox.append(secBlock);
    });

    sideQCount.textContent = `${qTotal} зад.`;

    const addSectionBtn = el("button", {
      class: "btn quiet",
      type: "button",
      style: "border: 2px dashed var(--accent); color: var(--accent-ink); padding: 0.85rem; justify-content: center;",
      onclick: () => {
        model.sections.push({
          title: `Блок ${model.sections.length + 1}`,
          questions: [
            {
              id: "1",
              text: "Условие задания",
              type: "single",
              options: [
                { md: "Вариант А", correct: true, note: "" },
                { md: "Вариант Б", correct: false, note: "" },
              ],
              hints: [],
              explanation: "Пояснение.",
            },
          ],
        });
        renderSections();
      },
    }, "➕ Добавить новый блок заданий");

    sectionsBox.append(addSectionBtn);

    // Подключение ScrollSpy для отслеживания текущего задания в редакторе
    if (editorObserver) editorObserver.disconnect();
    const visibleEditorCards = new Set();
    editorObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          visibleEditorCards.add(entry.target);
        } else {
          visibleEditorCards.delete(entry.target);
        }
      }
      if (isEditorManualNav) return;
      if (visibleEditorCards.size === 0) return;
      let bestEl = null;
      let minDistance = Infinity;
      for (const el of visibleEditorCards) {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top - 140);
        if (dist < minDistance) {
          minDistance = dist;
          bestEl = el;
        }
      }
      if (bestEl?.dataset?.editorQNum) {
        highlightEditorQuestion(bestEl.dataset.editorQNum, true);
      }
    }, { rootMargin: "0px 0px -40% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] });

    document.querySelectorAll("[data-editor-q-num]").forEach((c) => editorObserver.observe(c));
  };

  renderSections();

  // Закреплённая нижняя панель сохранения (для любых экранов)
  const stickyBar = el("div", { class: "editor-sticky-bar" },
    saveMsg,
    el("div", { class: "editor-sticky-actions" },
      previewLink,
      saveBtn));

  // Двухколоночный макет: основная форма слева, боковая панель справа
  const mainColumn = el("div", { style: "display: grid; gap: 1.5rem;" },
    topNav,
    headerCard,
    sectionsBox);

  const editorLayout = el("div", { class: "test-editor" },
    el("div", { class: "editor-wrapper-grid" },
      mainColumn,
      sidePanel),
    stickyBar);

  container.replaceChildren(editorLayout);
}

// ---------- КАРТОЧКА ЗАДАНИЯ (GOOGLE FORMS QUESTION CARD) ----------

function renderQuestionCard({
  q,
  displayNum,
  sec,
  sIdx,
  qIdx,
  isCollapsed,
  errors,
  model,
  onChange,
  onToggleCollapse,
  onMoveUp,
  onMoveDown,
}) {
  const card = el("div", {
    class: `editor-card question-card ${isCollapsed ? "collapsed" : ""} ${errors?.length ? "has-error" : ""}`,
    id: `q-card-${displayNum}`,
    "data-editor-q-num": String(displayNum),
  });

  // Перетаскивание карточки вопроса (Drag and Drop)
  card.setAttribute("draggable", "true");
  card.addEventListener("dragstart", (e) => {
    if (["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(e.target.tagName)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({ type: "question", sIdx, qIdx }));
    card.classList.add("is-dragging");
  });

  card.addEventListener("dragend", () => {
    card.classList.remove("is-dragging");
    document.querySelectorAll(".question-card").forEach((c) => {
      c.classList.remove("drag-over-top", "drag-over-bottom");
    });
  });

  card.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = card.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    if (relY < rect.height / 2) {
      card.classList.add("drag-over-top");
      card.classList.remove("drag-over-bottom");
    } else {
      card.classList.add("drag-over-bottom");
      card.classList.remove("drag-over-top");
    }
  });

  card.addEventListener("dragleave", () => {
    card.classList.remove("drag-over-top", "drag-over-bottom");
  });

  card.addEventListener("drop", (e) => {
    e.preventDefault();
    card.classList.remove("drag-over-top", "drag-over-bottom");
    let data;
    try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch {}
    if (!data || data.type !== "question") return;

    const srcSec = model.sections[data.sIdx];
    const targetSec = sec;
    if (!srcSec || !targetSec) return;

    const [movedQ] = srcSec.questions.splice(data.qIdx, 1);
    const rect = card.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    let targetIndex = targetSec.questions.indexOf(q);
    if (targetIndex === -1) targetIndex = targetSec.questions.length;
    else if (relY >= rect.height / 2) targetIndex += 1;

    targetSec.questions.splice(targetIndex, 0, movedQ);
    onChange();
  });

  // Ручка перетаскивания (⠿ Drag handle)
  const dragHandle = el("div", {
    class: "q-drag-handle",
    title: "Потяните карточку, чтобы изменить порядок заданий",
  }, "⠿");

  // Кнопка сворачивания
  const collapseBtn = el("button", {
    class: "collapse-toggle-btn",
    type: "button",
    title: isCollapsed ? "Развернуть задание" : "Свернуть задание",
    onclick: onToggleCollapse,
  }, isCollapsed ? "▶" : "▼");

  // Кнопки перемещения вверх / вниз (для быстрого сдвига)
  const moveUpBtn = el("button", {
    class: "q-move-btn",
    type: "button",
    title: "Переместить вопрос выше",
    disabled: qIdx === 0,
    onclick: onMoveUp,
  }, "▲");

  const moveDownBtn = el("button", {
    class: "q-move-btn",
    type: "button",
    title: "Переместить вопрос ниже",
    disabled: qIdx === sec.questions.length - 1,
    onclick: onMoveDown,
  }, "▼");

  // ID задания
  const idInput = el("input", {
    type: "text",
    value: cleanStr(q.id),
    style: "max-width: 5rem; padding: 0.35rem 0.5rem;",
    title: "ID задания в тесте",
    oninput: () => { q.id = idInput.value; },
  });

  // Селектор типа вопроса
  const typeSelect = el("select", {
    class: "type-selector",
    onchange: () => {
      q.type = typeSelect.value;
      if (q.type === "text") {
        q.options = [];
        q.format = cleanStr(q.format) || "число";
        q.answers = q.answers?.length ? q.answers : ["0"];
      } else {
        q.answers = [];
        q.options = q.options?.length ? q.options : [
          { md: "Вариант 1", correct: true, note: "" },
          { md: "Вариант 2", correct: false, note: "" },
        ];
      }
      onChange();
    },
  },
    el("option", { value: "single", selected: q.type === "single" }, "🔘 Один верный"),
    el("option", { value: "multiple", selected: q.type === "multiple" }, "☑️ Несколько верных"),
    el("option", { value: "text", selected: q.type === "text" }, "✍️ Краткий ответ"));

  // Сниппет в свернутом виде
  const snippet = isCollapsed ? el("div", {
    style: "color: var(--muted); font-size: 0.85rem; max-width: 20rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-left: 0.4rem;",
  }, (cleanStr(q.text) || "Без текста").replace(/\s+/g, " ")) : null;

  const head = el("div", { class: "question-head" },
    el("div", { style: "display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;" },
      dragHandle,
      collapseBtn,
      el("span", { class: "question-num-badge" }, `№ ${displayNum}`),
      el("span", { class: "field-label", style: "margin: 0; font-size: 0.8rem;" }, "ID:"),
      idInput,
      snippet),
    el("div", { style: "display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap;" },
      typeSelect,
      moveUpBtn,
      moveDownBtn));

  // Баннер ошибок валидации
  const errorBanner = errors?.length ? el("div", { class: "q-error-banner" },
    errors.map((e) => el("div", {}, `⚠️ ${e}`))) : null;

  // Сворачиваемое тело задания
  const bodyWrapper = el("div", { class: "question-body-collapsible" });

  // Поле условия задачи
  const textInput = el("textarea", {
    rows: 3,
    placeholder: "Условие задания. Формулы: $R \\subseteq A^2$ или $$\\sum_{i=1}^n$$",
    oninput: () => { q.text = textInput.value; },
  }, cleanStr(q.text));

  // Загрузка картинок
  const fileInput = el("input", { type: "file", accept: "image/*", style: "display: none;" });
  const uploadBtn = el("button", {
    class: "btn quiet",
    type: "button",
    style: "font-size: 0.82rem; padding: 0.35rem 0.65rem;",
    onclick: () => fileInput.click(),
  }, "🖼️ Прикрепить изображение");

  const imageStatus = el("span", { style: "font-size: 0.82rem; color: var(--muted);" });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    imageStatus.textContent = "Загрузка…";
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await json(`/api/tests/${model.id}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, data: reader.result }),
        });
        if (!model.images.includes(res.filename)) model.images.push(res.filename);
        imageStatus.textContent = `✓ Загружено: ${res.filename}`;
        const imgMarkdown = `\n\n![${file.name.replace(/\.[^.]+$/, "")}](${res.filename})\n`;
        textInput.value += imgMarkdown;
        q.text = textInput.value;
      } catch (err) {
        imageStatus.textContent = `Ошибка: ${err.message}`;
      }
    };
    reader.readAsDataURL(file);
  });

  const uploadBox = el("div", { style: "display: flex; align-items: center; gap: 0.6rem; margin-top: 0.4rem;" },
    fileInput,
    uploadBtn,
    imageStatus);

  const questionConditionBox = el("div", {},
    el("label", {},
      el("span", { class: "field-label" }, "Условие задания:"),
      textInput),
    uploadBox);

  // Контейнер вариантов ответа
  const optionsContainer = el("div", { class: "q-options-container" });

  if (q.type === "single" || q.type === "multiple") {
    const isSingle = q.type === "single";
    const optHeader = el("div", { class: "q-options-header" },
      isSingle ? "Варианты ответа (выберите 1 верный):" : "Варианты ответа (отметьте верные):");
    const optRows = el("div", { style: "display: flex; flex-direction: column; gap: 0.5rem;" });

    q.options.forEach((opt, oIdx) => {
      const optDrag = el("div", {
        class: "opt-drag-handle",
        draggable: "true",
        title: "Потяните, чтобы изменить порядок вариантов ответа",
      }, "⠿");

      const mark = el("input", {
        class: "opt-mark",
        type: isSingle ? "radio" : "checkbox",
        name: `correct_${displayNum}`,
        checked: Boolean(opt.correct),
        onchange: () => {
          if (isSingle) {
            q.options.forEach((o, i) => { o.correct = (i === oIdx); });
          } else {
            opt.correct = mark.checked;
          }
        },
      });

      const optText = el("input", {
        class: "opt-input",
        type: "text",
        value: cleanStr(opt.md),
        placeholder: `Вариант ${oIdx + 1}`,
        oninput: () => { opt.md = optText.value; },
      });

      const delOptBtn = el("button", {
        class: "opt-del-btn",
        type: "button",
        title: "Удалить вариант ответа",
        onclick: () => {
          if (q.options.length > 2) {
            q.options.splice(oIdx, 1);
            onChange();
          } else {
            alert("В задании должно быть не менее двух вариантов.");
          }
        },
      }, "✕");

      const row = el("div", { class: "opt-row", draggable: "true" }, optDrag, mark, optText, delOptBtn);

      // Drag and Drop для вариантов ответа
      row.addEventListener("dragstart", (e) => {
        if (["INPUT", "BUTTON"].includes(e.target.tagName)) {
          e.preventDefault();
          return;
        }
        e.stopPropagation();
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify({ type: "option", oIdx }));
        row.classList.add("is-dragging");
      });

      row.addEventListener("dragend", (e) => {
        e.stopPropagation();
        row.classList.remove("is-dragging");
        optRows.querySelectorAll(".opt-row").forEach((r) => {
          r.classList.remove("drag-over-top", "drag-over-bottom");
        });
      });

      row.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const rect = row.getBoundingClientRect();
        if (e.clientY - rect.top < rect.height / 2) {
          row.classList.add("drag-over-top");
          row.classList.remove("drag-over-bottom");
        } else {
          row.classList.add("drag-over-bottom");
          row.classList.remove("drag-over-top");
        }
      });

      row.addEventListener("dragleave", (e) => {
        e.stopPropagation();
        row.classList.remove("drag-over-top", "drag-over-bottom");
      });

      row.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove("drag-over-top", "drag-over-bottom");
        let data;
        try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch {}
        if (!data || data.type !== "option" || data.oIdx === undefined) return;
        const srcIdx = data.oIdx;
        const [movedOpt] = q.options.splice(srcIdx, 1);
        const rect = row.getBoundingClientRect();
        let targetIdx = q.options.indexOf(opt);
        if (targetIdx === -1) targetIdx = q.options.length;
        else if (e.clientY - rect.top >= rect.height / 2) targetIdx += 1;
        q.options.splice(targetIdx, 0, movedOpt);
        onChange();
      });

      optRows.append(row);
    });

    const addOptBtn = el("button", {
      class: "btn quiet",
      type: "button",
      style: "font-size: 0.85rem; padding: 0.4rem 0.8rem; align-self: flex-start;",
      onclick: () => {
        q.options.push({ md: `Вариант ${q.options.length + 1}`, correct: false, note: "" });
        onChange();
      },
    }, "+ Добавить вариант ответа");

    optionsContainer.append(optHeader, optRows, addOptBtn);
  } else {
    // Краткий ответ
    const formatInput = el("input", {
      type: "text",
      value: cleanStr(q.format) || "число",
      placeholder: "например: число или {множество через запятую}",
      oninput: () => { q.format = formatInput.value; },
    });

    const answersList = el("div", { style: "display: grid; gap: 0.4rem; margin-top: 0.4rem;" });
    (q.answers || []).forEach((ans, aIdx) => {
      const aInput = el("input", {
        type: "text",
        value: cleanStr(ans),
        placeholder: "Правильный ответ",
        oninput: () => { q.answers[aIdx] = aInput.value; },
      });
      const delAnsBtn = el("button", {
        class: "opt-del-btn",
        type: "button",
        onclick: () => {
          if (q.answers.length > 1) {
            q.answers.splice(aIdx, 1);
            onChange();
          }
        },
      }, "✕");
      answersList.append(el("div", { style: "display: flex; gap: 0.5rem; align-items: center;" }, aInput, delAnsBtn));
    });

    const addAnsBtn = el("button", {
      class: "btn quiet",
      type: "button",
      style: "font-size: 0.85rem; padding: 0.35rem 0.75rem; align-self: flex-start; margin-top: 0.3rem;",
      onclick: () => {
        q.answers = q.answers || [];
        q.answers.push("");
        onChange();
      },
    }, "+ Добавить вариант записи ответа");

    optionsContainer.append(
      el("label", {}, el("span", { class: "field-label" }, "Формат ответа (обязательно):"), formatInput),
      el("div", { style: "margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.4rem;" },
        el("span", { class: "field-label" }, "Правильные ответы:"),
        answersList,
        addAnsBtn));
  }

  // Секция «Дополнительно»: примечания к вариантам, подсказки и разбор решения
  const hasNotes = (q.options || []).some((o) => cleanStr(o.note));
  const hasHints = (q.hints || []).some((h) => cleanStr(h));
  const hasExpl = Boolean(cleanStr(q.explanation));
  const hasExtras = hasNotes || hasHints || hasExpl;

  const extrasDetails = el("details", { class: "q-extras", ...(hasExtras ? { open: "" } : {}) });
  const extrasSummary = el("summary", { class: "q-extras-summary" },
    el("span", {}, `⚙️ Пояснения к вариантам, подсказки и разбор ${hasExtras ? "✓" : ""}`));

  const extrasContent = el("div", { class: "q-extras-content" });

  // Примечания к вариантам (если выбор)
  if (q.type === "single" || q.type === "multiple") {
    const notesBox = el("div", { style: "display: flex; flex-direction: column; gap: 0.4rem;" },
      el("span", { class: "field-label" }, "Пояснения к вариантам при ошибке студента:"));
    q.options.forEach((opt, oIdx) => {
      const noteInput = el("input", {
        type: "text",
        value: cleanStr(opt.note),
        placeholder: `Пояснение, если выбран «${cleanStr(opt.md) || `Вариант ${oIdx + 1}`}» (необязательно)`,
        oninput: () => { opt.note = noteInput.value; },
      });
      notesBox.append(el("div", { style: "display: flex; align-items: center; gap: 0.5rem;" },
        el("span", { style: "font-size: 0.8rem; color: var(--muted); min-width: 5rem;" }, `Вариант ${oIdx + 1}:`),
        noteInput));
    });
    extrasContent.append(notesBox);
  }

  // Подсказки
  const hintsBox = el("div", { style: "display: flex; flex-direction: column; gap: 0.4rem;" });
  const hintsList = el("div", { style: "display: grid; gap: 0.4rem;" });
  (q.hints || []).forEach((h, hIdx) => {
    const hInput = el("input", {
      type: "text",
      value: cleanStr(h),
      placeholder: `Подсказка ${hIdx + 1}`,
      oninput: () => { q.hints[hIdx] = hInput.value; },
    });
    const delHintBtn = el("button", {
      class: "opt-del-btn",
      type: "button",
      onclick: () => { q.hints.splice(hIdx, 1); onChange(); },
    }, "✕");
    hintsList.append(el("div", { style: "display: flex; gap: 0.5rem; align-items: center;" }, hInput, delHintBtn));
  });

  const addHintBtn = el("button", {
    class: "btn quiet",
    type: "button",
    style: "font-size: 0.82rem; padding: 0.3rem 0.65rem; align-self: flex-start;",
    onclick: () => {
      q.hints = q.hints || [];
      q.hints.push("");
      onChange();
    },
  }, "+ Добавить подсказку");

  hintsBox.append(
    el("span", { class: "field-label" }, "Подсказки для режима «Тренировка»:"),
    hintsList,
    addHintBtn);

  // Разбор / Пояснение
  const explInput = el("textarea", {
    rows: 2,
    placeholder: "Подробный разбор решения (показывается после завершения теста)",
    oninput: () => { q.explanation = explInput.value; },
  }, cleanStr(q.explanation));

  const explBox = el("label", {},
    el("span", { class: "field-label" }, "Полный разбор задания (Пояснение):"),
    explInput);

  extrasContent.append(hintsBox, explBox);
  extrasDetails.append(extrasSummary, extrasContent);

  // Подвал карточки: понятные кнопки «Копировать задание» и «Удалить задание»
  const dupBtn = el("button", {
    class: "q-footer-btn",
    type: "button",
    title: "Создать точную копию этого задания со всеми вариантами",
    onclick: () => {
      const copy = JSON.parse(JSON.stringify(q));
      copy.id = `${q.id}-copy`;
      const currentSec = model.sections.find((s) => s.questions.includes(q));
      if (currentSec) {
        const idx = currentSec.questions.indexOf(q);
        currentSec.questions.splice(idx + 1, 0, copy);
        onChange();
      }
    },
  }, "📋 Копировать задание");

  const delBtn = el("button", {
    class: "q-footer-btn q-del-btn",
    type: "button",
    title: "Безвозвратно удалить это задание из теста",
    onclick: () => {
      if (confirm(`Удалить задание № ${displayNum}?`)) {
        const currentSec = model.sections.find((s) => s.questions.includes(q));
        if (currentSec) {
          currentSec.questions = currentSec.questions.filter((item) => item !== q);
          onChange();
        }
      }
    },
  }, "🗑️ Удалить задание");

  const cardFooter = el("div", { class: "q-card-footer" },
    el("div", { class: "muted", style: "font-size: 0.82rem;" }, `Задание № ${displayNum} • ID: ${cleanStr(q.id)}`),
    el("div", { class: "q-card-footer-actions" }, dupBtn, delBtn));

  bodyWrapper.append(questionConditionBox, optionsContainer, extrasDetails, cardFooter);
  card.append(head, errorBanner, bodyWrapper);
  return card;
}

// ==========================================
// 3. ВКЛАДКА: КОНСПЕКТЫ И ТЕОРИЯ (YouNote)
// ==========================================

function fallbackMarkdown(text) {
  // Горизонтальный разделитель
  text = text.replace(/^(?:---|___|\*\*\*)$/gm, "<hr>");

  // Заголовки
  text = text.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  text = text.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  text = text.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Полужирный, курсив, зачеркивание, код
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
  text = text.replace(/~~(.*?)~~/g, "<del>$1</del>");
  text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Изображения и ссылки
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; border-radius: 8px;">');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Таблицы Markdown
  text = text.replace(/((?:\|[^\n]+\|\r?\n?)+)/g, (tbl) => {
    const lines = tbl.trim().split(/\r?\n/);
    if (lines.length < 2) return tbl;
    const headerCells = lines[0].split("|").slice(1, -1).map((c) => `<th>${c.trim()}</th>`).join("");
    const isAlignLine = /^\|[\s\-:]+\|\s*$/.test(lines[1]);
    const bodyStart = isAlignLine ? 2 : 1;
    let rows = "";
    for (let i = bodyStart; i < lines.length; i++) {
      const cells = lines[i].split("|").slice(1, -1).map((c) => `<td>${c.trim()}</td>`).join("");
      rows += `<tr>${cells}</tr>`;
    }
    return `<table class="doc-table"><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  // Списки
  text = text.replace(/^\s*-\s+(.*$)/gim, "<li>$1</li>");
  text = text.replace(/^\s*\d+\.\s+(.*$)/gim, "<li>$1</li>");

  // Абзацы
  text = text.split(/\n\s*\n/).map((p) => {
    p = p.trim();
    if (!p) return "";
    if (p.startsWith("<h") || p.startsWith("<div") || p.startsWith("<pre") || p.startsWith("<li") || p.startsWith("<table") || p.startsWith("<hr")) return p;
    return `<p>${p.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  return text;
}

function renderMarkdownPreview(rawMd) {
  let text = String(rawMd || "");

  // 0. Нормализация автономных callout-блоков (без ведущей '>')
  text = text.replace(/(?:^|\n)([ \t]*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*(?:\n[^\n]+)*)/gi, (m, block) => {
    const lines = block.split("\n");
    const quoted = lines.map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith(">")) return line;
      return "> " + line;
    }).join("\n");
    return "\n" + quoted;
  });

  // 1. Сохранение формул KaTeX через плейсхолдеры, чтобы парсер разметки не ломал спецсимволы
  const mathMap = new Map();
  let mathCounter = 0;

  // Выключные формулы $$...$$
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, tex) => {
    const key = `%%MATH_BLOCK_${mathCounter++}%%`;
    let html = "";
    if (window.katex) {
      try {
        html = `<div class="katex-display">${window.katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false })}</div>`;
      } catch (e) {
        html = `<pre class="math-error">${tex}</pre>`;
      }
    } else {
      html = `<div class="katex-display">$$${tex}$$</div>`;
    }
    mathMap.set(key, html);
    return key;
  });

  // Строчные формулы $...$
  text = text.replace(/\$([^\$\n]+?)\$/g, (m, tex) => {
    const key = `%%MATH_INLINE_${mathCounter++}%%`;
    let html = "";
    if (window.katex) {
      try {
        html = window.katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
      } catch (e) {
        html = `<code>$${tex}$</code>`;
      }
    } else {
      html = `<code>$${tex}$</code>`;
    }
    mathMap.set(key, html);
    return key;
  });

  const parseMd = (str) => {
    if (window.marked) {
      const parseFn = typeof window.marked.parse === "function" ? window.marked.parse : window.marked;
      return parseFn(str, { gfm: true, breaks: true });
    }
    return fallbackMarkdown(str);
  };

  // 2. Callout-блоки: > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]
  const calloutMap = new Map();
  let calloutCounter = 0;
  const icons = { note: "ℹ️", tip: "💡", important: "📌", warning: "⚠️", caution: "🛑" };
  const titles = { note: "Заметка", tip: "Совет", important: "Важно", warning: "Внимание", caution: "Осторожно" };

  text = text.replace(/^>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*(?:\n(?:>[^\n]*(?:\n|$))*|$)/gim, (fullMatch) => {
    const lines = fullMatch.split("\n");
    const firstLine = lines[0] || "";
    const typeMatch = firstLine.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : "note";
    const headerExtra = firstLine.replace(/^>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, "").trim();

    const bodyLines = [];
    if (headerExtra) bodyLines.push(headerExtra);
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (/^>[ \t]?/.test(l)) {
        bodyLines.push(l.replace(/^>[ \t]?/, ""));
      } else if (l.trim()) {
        bodyLines.push(l);
      }
    }
    const cleanBody = bodyLines.join("\n").trim();
    const bodyHtml = parseMd(cleanBody);
    const calloutHtml = `<div class="note-callout callout-${type}">\n  <div class="callout-header"><span class="callout-icon">${icons[type] || "ℹ️"}</span> <span class="callout-title">${titles[type] || type}</span></div>\n  <div class="callout-body">\n${bodyHtml}\n  </div>\n</div>`;

    const key = `%%CALLOUT_BLOCK_${calloutCounter++}%%`;
    calloutMap.set(key, calloutHtml);
    return `\n\n${key}\n\n`;
  });

  // 3. Рендеринг основного Markdown
  let htmlResult = parseMd(text);

  // 4. Восстановление callout-блоков
  for (const [key, rendered] of calloutMap.entries()) {
    htmlResult = htmlResult.replace(new RegExp(`<p>\\s*${key}\\s*<\\/p>|${key}`, "g"), rendered);
  }

  // 5. Восстановление KaTeX формул из плейсхолдеров
  for (const [key, rendered] of mathMap.entries()) {
    htmlResult = htmlResult.split(key).join(rendered);
  }

  return htmlResult;
}

async function notesTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем список конспектов…"));
  let list = [];
  try {
    const res = await json("/api/notes");
    list = Array.isArray(res) ? res : (res.notes || []);
  } catch {
    try {
      list = await json("notes.json");
    } catch (err) {
      container.replaceChildren(el("div", { class: "notice error" }, `Ошибка загрузки конспектов: ${err.message}`));
      return;
    }
  }

  const createBtn = el("button", {
    class: "btn primary",
    type: "button",
    onclick: () => createNewNotePrompt(container),
  }, "➕ Создать новый конспект");

  const head = el("div", { class: "test-manager-head" },
    el("div", {},
      el("h2", { style: "margin: 0;" }, "Управление конспектами и теорией"),
      el("p", { class: "muted", style: "margin: 0.2rem 0 0;" }, "Создавайте и редактируйте лекции и конспекты курса дискретной математики")),
    createBtn);

  // Сбор тем/папок конспектов
  const topicsSet = new Set();
  for (const n of list) {
    if (n.topic && n.topic.trim()) topicsSet.add(n.topic.trim());
  }
  const topics = ["Все", ...Array.from(topicsSet)];
  let activeTopic = "Все";

  const tabsContainer = el("div", { class: "topic-tabs", style: "margin-bottom: 1.25rem;" });
  const grid = el("div", { class: "note-cards-admin-grid" });

  function renderCards() {
    const filtered = activeTopic === "Все"
      ? list
      : list.filter((n) => (n.topic || "Общее") === activeTopic);

    grid.replaceChildren();

    if (!filtered.length) {
      grid.replaceChildren(el("p", { class: "muted", style: "grid-column: 1 / -1; padding: 2rem; text-align: center;" }, "В этой теме пока нет конспектов."));
      return;
    }

    for (const n of filtered) {
      const card = el("div", { class: "note-admin-card" },
        el("div", { style: "display: flex; gap: 0.85rem; align-items: flex-start;" },
          el("span", { style: "font-size: 2.2rem; line-height: 1;" }, n.icon || "📄"),
          el("div", { style: "flex: 1; min-width: 0;" },
            el("div", { style: "font-size: 1.15rem; font-weight: 600; line-height: 1.35; margin-bottom: 0.35rem;" }, n.title || n.id),
            el("div", { style: "display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 0.5rem;" },
              el("span", { class: "tag tag-accent" }, `📁 ${n.topic || "Общее"}`),
              el("span", { class: "tag" }, `Порядок: №${n.order || 1}`),
              n.hidden ? el("span", { class: "tag", style: "background: var(--bad-soft); color: var(--bad); font-weight: 600;" }, "Скрыт") : null),
            el("p", { class: "muted", style: "margin: 0; font-size: 0.88rem; line-height: 1.45;" }, n.description || "Без описания"))),
        el("div", { class: "test-card-actions" },
          el("button", {
            class: "btn primary btn-sm",
            type: "button",
            onclick: () => openNoteEditor(n.id, container),
          }, "✏️ Редактировать"),
          el("button", {
            class: "btn quiet btn-sm",
            type: "button",
            onclick: () => openPreviewModal(`notes/?id=${encodeURIComponent(n.id)}`, n.title || n.id),
          }, "🔍 Просмотр"),
          el("button", {
            class: `btn btn-sm btn-visibility-toggle ${n.hidden ? "is-hidden" : "is-visible"}`,
            type: "button",
            title: n.hidden ? "Конспект скрыт для студентов. Нажмите, чтобы открыть." : "Конспект виден студентам. Нажмите, чтобы скрыть.",
            onclick: async () => {
              try {
                await json(`/api/notes/${encodeURIComponent(n.id)}`, {
                  method: "PUT",
                  body: { hidden: !n.hidden },
                });
                notesTab(container);
              } catch (e) {
                alert(`Ошибка изменения видимости конспекта: ${e.message}`);
              }
            },
          }, n.hidden ? "🙈 Скрыт" : "👁️ Виден"),
          el("button", {
            class: "btn quiet btn-sm btn-delete-action",
            type: "button",
            style: "color: var(--bad); margin-left: auto;",
            title: "Удалить конспект",
            onclick: () => deleteNoteConfirm(n.id, container),
          }, "🗑️")));
      grid.append(card);
    }
  }

  function renderTabs() {
    tabsContainer.replaceChildren(
      ...topics.map((tp) => el("button", {
        class: `topic-tab ${tp === activeTopic ? "active" : ""}`,
        type: "button",
        onclick: () => { activeTopic = tp; renderTabs(); renderCards(); },
      }, tp === "Все" ? "Все темы" : `📁 ${tp}`))
    );
  }

  renderTabs();
  renderCards();

  container.replaceChildren(head, topics.length > 1 ? tabsContainer : el("span"), grid);
}

async function createNewNotePrompt(container) {
  const idInput = el("input", { type: "text", placeholder: "logic-laws", required: true });
  const titleInput = el("input", { type: "text", placeholder: "Законы алгебры логики", required: true });
  const topicInput = el("input", { type: "text", placeholder: "Булева логика (необязательно)" });
  const iconInput = el("input", { type: "text", placeholder: "⚡", value: "📄", style: "width: 4rem; text-align: center;" });
  const status = el("p", { class: "field-error" });

  const modal = el("dialog", {
    style: "border: 0; border-radius: var(--radius-lg); padding: 1.5rem; max-width: 28rem; width: 90vw; background: var(--card); box-shadow: var(--shadow-lg);",
  },
    el("h2", { style: "margin-top: 0;" }, "Новый конспект"),
    el("p", { class: "muted" }, "Задайте идентификатор для ссылки, название и тему:"),
    el("form", {
      onsubmit: async (e) => {
        e.preventDefault();
        const id = idInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
        const title = titleInput.value.trim();
        const topic = topicInput.value.trim() || "Общее";
        const icon = iconInput.value.trim() || "📄";
        if (!id || !title) {
          status.textContent = "Заполните ID и название";
          return;
        }
        try {
          const res = await json("/api/notes", {
            method: "POST",
            body: {
              id,
              title,
              topic,
              icon,
              order: 1,
              description: "Краткое описание темы.",
              rawMd: `# ${title}\n\nТекст конспекта...\n\n## 1. Введение\n\nТеоретический материал с формулами $x \\in A$.\n`,
            },
          });
          modal.close();
          modal.remove();
          openNoteEditor(res.id, container);
        } catch (err) {
          status.textContent = err.message;
        }
      },
    },
      el("label", {}, el("span", { class: "field-label" }, "Идентификатор (латиница, цифры, дефис):"), idInput),
      el("label", {}, el("span", { class: "field-label" }, "Название конспекта:"), titleInput),
      el("div", { style: "display: flex; gap: 0.6rem;" },
        el("label", { style: "width: 5rem;" }, el("span", { class: "field-label" }, "Иконка:"), iconInput),
        el("label", { style: "flex: 1;" }, el("span", { class: "field-label" }, "Тема/раздел:"), topicInput)),
      status,
      el("div", { style: "display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;" },
        el("button", { class: "btn quiet", type: "button", onclick: () => { modal.close(); modal.remove(); } }, "Отмена"),
        el("button", { class: "btn primary", type: "submit" }, "Создать конспект"))));

  document.body.append(modal);
  modal.showModal();
}

async function openNoteEditor(noteId, container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем конспект…"));
  let noteData;
  try {
    noteData = await json(`/api/notes/${noteId}`);
  } catch (err) {
    container.replaceChildren(el("div", { class: "notice error" }, `Ошибка загрузки конспекта: ${err.message}`));
    return;
  }

  const meta = noteData.meta || {};
  let currentRawMd = noteData.rawMd || "";
  let viewMode = "split"; // "edit" | "split" | "preview"
  let isDirty = false;
  const draftKey = `note_draft_${noteId}`;

  const saveStatus = el("span", { class: "save-msg", style: "font-size: 0.88rem;" }, "");

  const markDirty = () => {
    if (!isDirty) {
      isDirty = true;
      saveStatus.textContent = "● Не сохранено";
      saveStatus.style.color = "var(--warn-ink, #b45309)";
    }
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        rawMd: currentRawMd,
        title: titleInput.value,
        topic: topicInput.value,
        order: orderInput.value,
        desc: descInput.value,
        icon: iconInput.value,
        time: Date.now(),
      }));
    } catch {}
  };

  const beforeUnloadHandler = (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);

  const cleanupAndLeave = () => {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    window.removeEventListener("keydown", keyHandler);
    notesTab(container);
  };

  // Верхняя навигация
  const backBtn = el("button", {
    class: "btn quiet",
    type: "button",
    onclick: () => {
      if (isDirty) {
        const ok = confirm("У вас есть несохранённые изменения в конспекте.\n\nВы действительно хотите выйти без сохранения?");
        if (!ok) return;
      }
      cleanupAndLeave();
    },
  }, "← Ко всем конспектам");

  const hiddenCheckbox = el("input", {
    type: "checkbox",
    checked: Boolean(meta.hidden),
    onchange: () => {
      markDirty();
      updateHideBtn();
    },
  });

  const hideBtn = el("button", {
    class: "btn btn-sm btn-visibility-toggle",
    type: "button",
    title: "Скрыть / показать конспект на главной",
    onclick: () => {
      hiddenCheckbox.checked = !hiddenCheckbox.checked;
      markDirty();
      updateHideBtn();
    },
  });

  function updateHideBtn() {
    hideBtn.textContent = hiddenCheckbox.checked ? "🙈 Скрыт для студентов" : "👁️ Виден на главной";
    hideBtn.className = `btn btn-sm btn-visibility-toggle ${hiddenCheckbox.checked ? "is-hidden" : "is-visible"}`;
  }
  updateHideBtn();

  const previewLink = el("button", {
    class: "btn quiet btn-sm",
    type: "button",
    onclick: () => openPreviewModal(`notes/?id=${encodeURIComponent(noteId)}`, meta.title || noteId),
  }, "🔍 Предпросмотр");

  const saveBtn = el("button", {
    class: "btn primary",
    type: "button",
    onclick: async () => {
      saveBtn.disabled = true;
      saveStatus.textContent = "Сохранение…";
      saveStatus.style.color = "var(--muted)";
      try {
        await json(`/api/notes/${noteId}`, {
          method: "PUT",
          body: {
            meta: {
              title: titleInput.value.trim() || noteId,
              topic: topicInput.value.trim() || "Общее",
              icon: iconInput.value.trim() || "📄",
              order: Number(orderInput.value) || 1,
              description: descInput.value.trim(),
              hidden: hiddenCheckbox.checked,
            },
            rawMd: currentRawMd,
          },
        });
        isDirty = false;
        try { localStorage.removeItem(draftKey); } catch {}
        saveStatus.textContent = "✅ Сохранено";
        saveStatus.style.color = "var(--ok)";
        setTimeout(() => {
          if (!isDirty) saveStatus.textContent = "";
        }, 3000);
      } catch (err) {
        saveStatus.textContent = `❌ Ошибка: ${err.message}`;
        saveStatus.style.color = "var(--bad)";
      } finally {
        saveBtn.disabled = false;
      }
    },
  }, "💾 Сохранить");

  // Переключатель режимов отображения (вынесен отдельно от панели Word)
  const segEdit = el("button", {
    class: "doc-seg-btn",
    type: "button",
    title: "Редактирование во всю ширину с панелью Word",
    onclick: () => switchViewMode("edit"),
  }, "✏️ Редактирование");

  const segSplit = el("button", {
    class: "doc-seg-btn active",
    type: "button",
    title: "Редактор слева + живой результат справа",
    onclick: () => switchViewMode("split"),
  }, "↔️ Сплит");

  const segPreview = el("button", {
    class: "doc-seg-btn",
    type: "button",
    title: "Вид готовой статьи без лишних элементов",
    onclick: () => switchViewMode("preview"),
  }, "👁️ Предпросмотр");

  const viewSegmented = el("div", { class: "doc-view-segmented" }, segEdit, segSplit, segPreview);

  const topbar = el("div", { class: "doc-editor-topbar" },
    el("div", { style: "display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;" },
      backBtn,
      el("span", { class: "muted" }, "•"),
      el("span", { style: "font-weight: 600; font-size: 0.95rem;" }, `Конспект: ${meta.title || noteId}`)),
    el("div", { style: "display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;" },
      viewSegmented,
      saveStatus,
      hideBtn,
      previewLink,
      saveBtn));

  // Заголовок документа
  const titleInput = el("input", {
    class: "doc-title-input",
    type: "text",
    value: meta.title || "",
    placeholder: "Название конспекта…",
    oninput: markDirty,
  });

  // Панель метаданных
  const iconInput = el("input", {
    class: "doc-meta-input",
    type: "text",
    value: meta.icon || "📄",
    title: "Иконка темы",
    style: "width: 3.5rem; text-align: center; font-size: 1.2rem;",
    oninput: markDirty,
  });

  const topicInput = el("input", {
    class: "doc-meta-input",
    type: "text",
    value: meta.topic || "Общее",
    placeholder: "Тема (например: Множества, Отношения)",
    style: "min-width: 14rem;",
    oninput: markDirty,
  });

  const orderInput = el("input", {
    class: "doc-meta-input",
    type: "number",
    value: String(meta.order || 1),
    placeholder: "№",
    style: "width: 5rem;",
    title: "Порядковый номер в курсе",
    oninput: markDirty,
  });

  const descInput = el("input", {
    class: "doc-meta-input",
    type: "text",
    value: meta.description || "",
    placeholder: "Краткое описание темы (для карточки на главной)…",
    style: "flex: 1; min-width: 18rem;",
    oninput: markDirty,
  });

  const metaBox = el("div", { class: "doc-meta-box" },
    el("div", { style: "display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;" },
      el("span", { class: "muted", style: "font-size: 0.82rem;" }, "Иконка:"),
      iconInput,
      el("span", { class: "muted", style: "font-size: 0.82rem;" }, "Раздел:"),
      topicInput,
      el("span", { class: "muted", style: "font-size: 0.82rem;" }, "Порядок:"),
      orderInput),
    el("div", { style: "display: flex; align-items: center; gap: 0.75rem; width: 100%; margin-top: 0.4rem; flex-wrap: wrap;" },
      descInput,
      el("label", { style: "display: flex; align-items: center; gap: 0.4rem; cursor: pointer; white-space: nowrap;" },
        hiddenCheckbox,
        el("span", { class: "field-label", style: "margin: 0; font-size: 0.88rem;" }, "Скрыть на главной"))));

  // Текстовая область Markdown
  const textarea = el("textarea", {
    class: "doc-main-textarea",
    rows: 24,
    placeholder: "Пишите текст конспекта. Поддерживаются формулы $...$ и $$...$$, цитаты > [!NOTE], таблицы и картинки.",
    value: currentRawMd,
    oninput: () => {
      currentRawMd = textarea.value;
      updateLivePreview();
      markDirty();
    },
  });

  const livePreview = el("div", { class: "doc-live-preview" });

  const updateLivePreview = () => {
    livePreview.innerHTML = renderMarkdownPreview(currentRawMd);
  };
  updateLivePreview();

  // Функция вставки для панели Word
  const insertDocText = (before, after = "") => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const sel = textarea.value.substring(start, end);
    const replacement = before + (sel || "") + after;
    textarea.setRangeText(replacement, start, end, "select");
    currentRawMd = textarea.value;
    updateLivePreview();
    markDirty();
    textarea.focus();
  };

  // Панель инструментов Word / Google Docs
  const headingSelect = el("select", {
    class: "doc-select",
    title: "Стиль текста",
    onchange: (e) => {
      const val = e.target.value;
      if (val === "h1") insertDocText("# ", "\n");
      else if (val === "h2") insertDocText("## ", "\n");
      else if (val === "h3") insertDocText("### ", "\n");
      e.target.value = "p";
    },
  },
    el("option", { value: "p" }, "Обычный текст"),
    el("option", { value: "h1" }, "Заголовок 1 (Раздел)"),
    el("option", { value: "h2" }, "Заголовок 2 (Подраздел)"),
    el("option", { value: "h3" }, "Заголовок 3 (Пункт)"));

  const fileInput = el("input", {
    type: "file",
    accept: "image/*",
    style: "display: none;",
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const uploadRes = await json(`/api/notes/${noteId}/upload`, {
            method: "POST",
            body: { filename: file.name, data: reader.result },
          });
          insertDocText(`\n![${file.name}](${uploadRes.url})\n`);
        } catch (err) {
          alert(`Ошибка загрузки картинки: ${err.message}`);
        }
      };
      reader.readAsDataURL(file);
    },
  });

  const toolbar = el("div", { class: "doc-word-toolbar" },
    el("div", { class: "doc-tool-group" }, headingSelect),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Полужирный (Ctrl+B)", onclick: () => insertDocText("**", "**") }, el("strong", {}, "Ж")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Курсив (Ctrl+I)", onclick: () => insertDocText("*", "*") }, el("em", {}, "К")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Подчёркнутый", onclick: () => insertDocText("<u>", "</u>") }, el("u", {}, "Ч")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Зачёркнутый", onclick: () => insertDocText("~~", "~~") }, el("s", {}, "З")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Встроенный код", onclick: () => insertDocText("`", "`") }, "< >")),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Маркированный список", onclick: () => insertDocText("- ") }, "• Список"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Нумерованный список", onclick: () => insertDocText("1. ") }, "1. Список"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Таблица", onclick: () => insertDocText("\n| Колонка 1 | Колонка 2 |\n| :--- | :--- |\n| Текст 1 | Текст 2 |\n") }, "▦ Таблица")),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Формула в строке: $...$", onclick: () => insertDocText("$", "$") }, "∑ Формула"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Блок формулы: $$...$$", onclick: () => insertDocText("$$\n", "\n$$") }, "∫ Блок формулы"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка примечания", onclick: () => insertDocText("> [!NOTE]\n> ") }, "ℹ️ Заметка"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка совета", onclick: () => insertDocText("> [!TIP]\n> ") }, "💡 Совет"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка важно / теорема", onclick: () => insertDocText("> [!IMPORTANT]\n> ") }, "📌 Важно"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка предупреждения", onclick: () => insertDocText("> [!WARNING]\n> ") }, "⚠️ Внимание")),
    el("div", { class: "doc-tool-group" },
      el("label", { class: "doc-tool-btn", style: "cursor: pointer;", title: "Загрузить иллюстрацию к конспекту" },
        "🖼️ Фото",
        fileInput),
      el("button", { class: "doc-tool-btn", type: "button", title: "Горизонтальный разделитель", onclick: () => insertDocText("\n---\n") }, "— Черта")));

  const editorBodyContainer = el("div", { class: `doc-body-container mode-${viewMode}` },
    textarea,
    livePreview);

  const switchViewMode = (mode) => {
    viewMode = mode;
    segEdit.classList.toggle("active", mode === "edit");
    segSplit.classList.toggle("active", mode === "split");
    segPreview.classList.toggle("active", mode === "preview");

    editorBodyContainer.className = `doc-body-container mode-${mode}`;
    toolbar.style.display = mode === "preview" ? "none" : "";
    metaBox.style.display = mode === "preview" ? "none" : "";
    titleInput.readOnly = mode === "preview";
  };

  // Горячая клавиша Ctrl+S / Cmd+S
  const keyHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveBtn.click();
    }
  };
  window.addEventListener("keydown", keyHandler);

  // Проверка сохранённого черновика в localStorage
  let draftBanner = null;
  try {
    const savedDraft = JSON.parse(localStorage.getItem(draftKey));
    if (savedDraft && savedDraft.rawMd && savedDraft.rawMd !== currentRawMd) {
      const timeStr = new Date(savedDraft.time || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      draftBanner = el("div", {
        style: "background: color-mix(in srgb, var(--accent) 15%, var(--card)); border: 1px solid var(--accent); padding: 0.75rem 1.1rem; border-radius: var(--radius); display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; font-size: 0.9rem;",
      },
        el("span", {}, `⚠️ Обнаружен локальный несохранённый черновик (от ${timeStr}). Восстановить?`),
        el("div", { style: "display: flex; gap: 0.5rem;" },
          el("button", {
            class: "btn primary btn-sm",
            type: "button",
            onclick: () => {
              currentRawMd = savedDraft.rawMd;
              textarea.value = currentRawMd;
              if (savedDraft.title) titleInput.value = savedDraft.title;
              if (savedDraft.topic) topicInput.value = savedDraft.topic;
              if (savedDraft.desc) descInput.value = savedDraft.desc;
              if (savedDraft.icon) iconInput.value = savedDraft.icon;
              updateLivePreview();
              markDirty();
              draftBanner.remove();
            },
          }, "Восстановить"),
          el("button", {
            class: "btn quiet btn-sm",
            type: "button",
            onclick: () => {
              localStorage.removeItem(draftKey);
              draftBanner.remove();
            },
          }, "Отклонить")));
    }
  } catch {}

  const deleteBtn = el("button", {
    class: "btn quiet",
    type: "button",
    style: "color: var(--bad); margin-left: auto;",
    onclick: () => deleteNoteConfirm(noteId, container),
  }, "🗑️ Удалить конспект");

  const bottomActions = el("div", { class: "doc-editor-bottom-bar" },
    saveBtn.cloneNode(true),
    previewLink.cloneNode(true),
    deleteBtn);
  bottomActions.querySelector(".btn.primary").onclick = () => saveBtn.click();

  // Лист документа (Sheet)
  const docSheet = el("div", { class: "doc-paper-sheet" },
    draftBanner || el("span", { style: "display: none;" }),
    titleInput,
    metaBox,
    toolbar,
    editorBodyContainer,
    bottomActions);

  container.replaceChildren(topbar, docSheet);
}

async function deleteNoteConfirm(noteId, container) {
  if (confirm(`Безвозвратно удалить конспект «${noteId}»?`)) {
    try {
      await json(`/api/notes/${noteId}`, { method: "DELETE" });
      try { localStorage.removeItem(`note_draft_${noteId}`); } catch {}
      notesTab(container);
    } catch (e) {
      alert(`Ошибка удаления: ${e.message}`);
    }
  }
}

// ==========================================
// 4. ВКЛАДКА: КОЛЛОКВИУМЫ
// ==========================================

async function colloquiumsTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем вопросы коллоквиумов…"));
  let list = [];
  try {
    const res = await json("/api/colloquiums");
    list = Array.isArray(res) ? res : (res.questions || []);
  } catch {
    try {
      list = await json("colloquiums.json");
    } catch (err) {
      container.replaceChildren(el("div", { class: "notice error" }, `Ошибка загрузки вопросов: ${err.message}`));
      return;
    }
  }

  let activeCol = "all"; // "all" | "1" | "2"
  let searchQuery = "";

  const createBtn = el("button", {
    class: "btn primary",
    type: "button",
    onclick: () => openColloquiumQuestionModal(null, () => colloquiumsTab(container)),
  }, "➕ Добавить вопрос");

  const previewBtn = el("button", {
    class: "btn quiet",
    type: "button",
    onclick: () => openPreviewModal("colloquiums/", "Коллоквиумы по дискретной математике"),
  }, "👁️ Открыть раздел");

  const head = el("div", { class: "test-manager-head" },
    el("div", {},
      el("h2", { style: "margin: 0;" }, "Управление коллоквиумами"),
      el("p", { class: "muted", style: "margin: 0.2rem 0 0;" }, "Точные формулировки и определения для двух коллоквиумов курса дискретной математики")),
    el("div", { style: "display: flex; gap: 0.5rem; align-items: center;" }, previewBtn, createBtn));

  // Панель фильтров: табы коллоквиумов + поиск
  const filterBar = el("div", {
    style: "display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.25rem;",
  });

  const colTabs = el("div", { class: "topic-tabs" });
  function renderColTabs() {
    const counts = {
      all: list.length,
      1: list.filter((q) => Number(q.colloquium_id || q.colloquium) === 1).length,
      2: list.filter((q) => Number(q.colloquium_id || q.colloquium) === 2).length,
    };
    colTabs.replaceChildren(
      el("button", {
        class: `topic-tab ${activeCol === "all" ? "active" : ""}`,
        type: "button",
        onclick: () => { activeCol = "all"; renderColTabs(); renderQuestions(); },
      }, `Все вопросы (${counts.all})`),
      el("button", {
        class: `topic-tab ${activeCol === "1" ? "active" : ""}`,
        type: "button",
        onclick: () => { activeCol = "1"; renderColTabs(); renderQuestions(); },
      }, `Коллоквиум 1 (${counts[1]})`),
      el("button", {
        class: `topic-tab ${activeCol === "2" ? "active" : ""}`,
        type: "button",
        onclick: () => { activeCol = "2"; renderColTabs(); renderQuestions(); },
      }, `Коллоквиум 2 (${counts[2]})`)
    );
  }

  const searchBox = el("input", {
    type: "search",
    placeholder: "🔍 Поиск по номеру, названию или формулам...",
    style: "padding: 0.45rem 0.85rem; border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: 0.88rem; width: 22rem; max-width: 100%;",
    oninput: (e) => {
      searchQuery = e.target.value;
      renderQuestions();
    },
  });

  filterBar.append(colTabs, searchBox);

  const listContainer = el("div", { style: "display: flex; flex-direction: column; gap: 0.75rem;" });

  function renderQuestions() {
    const qLower = searchQuery.trim().toLowerCase();
    const filtered = list.filter((item) => {
      const colId = String(item.colloquium_id || item.colloquium || 1);
      if (activeCol !== "all" && colId !== activeCol) return false;
      if (qLower) {
        const matchTerm = (item.term || "").toLowerCase().includes(qLower);
        const matchDef = (item.definition || "").toLowerCase().includes(qLower);
        const matchNum = String(item.num) === qLower || `№${item.num}` === qLower || `вопрос ${item.num}` === qLower;
        return matchTerm || matchDef || matchNum;
      }
      return true;
    });

    listContainer.replaceChildren();

    if (!filtered.length) {
      listContainer.append(el("p", { class: "muted", style: "padding: 2.5rem; text-align: center;" }, "Вопросов не найдено."));
      return;
    }

    for (const q of filtered) {
      const col = q.colloquium_id || q.colloquium || 1;
      const card = el("div", {
        class: "admin-col-card",
        style: "background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.6rem; transition: border-color 0.15s ease;",
      },
        el("div", { style: "display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap;" },
          el("div", { style: "display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;" },
            el("span", { class: "tag tag-accent", style: "font-weight: 700; font-size: 0.8rem;" }, `Коллоквиум ${col} · № ${q.num}`),
            el("h3", { style: "margin: 0; font-size: 1.08rem; font-family: var(--display); font-weight: 700;" }, q.term),
            q.hidden ? el("span", { class: "tag", style: "background: var(--bad-soft); color: var(--bad); font-weight: 700;" }, "Скрыт") : null),
          el("div", { style: "display: flex; gap: 0.5rem; align-items: center;" },
            el("button", {
              class: "btn primary btn-sm",
              type: "button",
              onclick: () => openColloquiumQuestionModal(q, () => colloquiumsTab(container)),
            }, "✏️ Изменить"),
            el("button", {
              class: `btn btn-sm btn-visibility-toggle ${q.hidden ? "is-hidden" : "is-visible"}`,
              type: "button",
              title: q.hidden ? "Вопрос скрыт от студентов. Нажмите, чтобы открыть." : "Вопрос виден студентам. Нажмите, чтобы скрыть.",
              onclick: async () => {
                try {
                  await json(`/api/colloquiums/${encodeURIComponent(q.id)}`, {
                    method: "PUT",
                    body: { ...q, hidden: !q.hidden },
                  });
                  colloquiumsTab(container);
                } catch (e) {
                  alert(`Ошибка изменения видимости вопроса: ${e.message}`);
                }
              },
            }, q.hidden ? "🙈 Скрыт" : "👁️ Виден"),
            el("button", {
              class: "btn quiet btn-sm btn-delete-action",
              type: "button",
              title: "Удалить вопрос",
              onclick: () => deleteColloquiumQuestionConfirm(q.id, () => colloquiumsTab(container)),
            }, "🗑️"))),
        el("div", {
          style: "font-size: 0.92rem; line-height: 1.55; color: var(--ink); background: var(--sunken); border-radius: var(--radius-sm); padding: 0.75rem 1rem; border: 1px solid var(--line-soft); max-height: 7rem; overflow-y: auto;",
        }, q.definition),
        q.examples ? el("div", {
          style: "font-size: 0.85rem; color: var(--muted); line-height: 1.45; padding-left: 0.5rem; border-left: 2px solid var(--line);",
        }, `Примеры: ${q.examples.slice(0, 180)}${q.examples.length > 180 ? "..." : ""}`) : null
      );
      listContainer.append(card);
    }
  }

  renderColTabs();
  renderQuestions();

  container.replaceChildren(head, filterBar, listContainer);
}

function openColloquiumQuestionModal(existing = null, onSaved = null) {
  const isEdit = Boolean(existing && existing.id);
  const colVal = existing ? (existing.colloquium_id || existing.colloquium || 1) : 1;
  const numVal = existing ? existing.num : 1;
  const termVal = existing ? existing.term : "";
  const defVal = existing ? existing.definition : "";
  const exVal = existing ? (existing.examples || "") : "";
  const hiddenVal = existing ? Boolean(existing.hidden) : false;

  const hiddenCheckbox = el("input", {
    type: "checkbox",
    checked: hiddenVal,
  });

  const colSelect = el("select", { style: "padding: 0.4rem; border: 1px solid var(--line); border-radius: var(--radius-sm);" },
    el("option", { value: "1", selected: String(colVal) === "1" }, "Коллоквиум 1"),
    el("option", { value: "2", selected: String(colVal) === "2" }, "Коллоквиум 2")
  );

  const numInput = el("input", {
    type: "number",
    min: "1",
    max: "100",
    value: numVal,
    style: "width: 5rem; padding: 0.4rem; border: 1px solid var(--line); border-radius: var(--radius-sm);",
  });

  const termInput = el("input", {
    type: "text",
    value: termVal,
    placeholder: "Например: Определение Множества",
    required: true,
    style: "width: 100%; padding: 0.5rem 0.75rem; border: 1px solid var(--line); border-radius: var(--radius-sm); font-size: 0.95rem; font-weight: 600;",
  });

  const defTextarea = el("textarea", {
    rows: "7",
    placeholder: "Точное математическое определение из лекций (поддерживаются формулы $...$ и $$...$$)",
    style: "width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--line); border-radius: var(--radius-sm); font-family: inherit; font-size: 0.92rem; line-height: 1.5; resize: vertical;",
  }, defVal);

  const exTextarea = el("textarea", {
    rows: "3",
    placeholder: "Примеры, замечания или свойства (необязательно)",
    style: "width: 100%; padding: 0.6rem 0.75rem; border: 1px solid var(--line); border-radius: var(--radius-sm); font-family: inherit; font-size: 0.92rem; line-height: 1.5; resize: vertical;",
  }, exVal);

  const previewBox = el("div", {
    class: "admin-col-preview-box",
    style: "background: var(--paper); border: 1px dashed var(--line); border-radius: var(--radius-sm); padding: 0.75rem 1rem; margin-bottom: 0.85rem; font-size: 0.92rem; min-height: 2.5rem;",
  });

  function updateLivePreview() {
    const raw = defTextarea.value.trim();
    if (!raw) {
      previewBox.innerHTML = "<span class=\"muted\">Здесь появится отрендеренное математическое определение с формулами...</span>";
      return;
    }
    try {
      let html = raw.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
        try {
          return `<div style="text-align: center; margin: 0.5rem 0;">${katex.renderToString(tex, { displayMode: true, throwOnError: false })}</div>`;
        } catch {
          return tex;
        }
      });
      html = html.replace(/(?<!\\)\$([^\n$]+?)(?<!\\)\$/g, (_, tex) => {
        try {
          return katex.renderToString(tex, { displayMode: false, throwOnError: false });
        } catch {
          return tex;
        }
      });
      if (window.marked && typeof window.marked.parse === "function") {
        previewBox.innerHTML = window.marked.parse(html);
      } else {
        previewBox.innerHTML = html.replace(/\n/g, "<br>");
      }
    } catch {
      previewBox.textContent = raw;
    }
  }

  defTextarea.addEventListener("input", updateLivePreview);
  setTimeout(updateLivePreview, 10);

  const errorBox = el("p", { class: "field-error", style: "margin: 0; color: var(--bad); font-size: 0.88rem;" });

  const modal = el("dialog", {
    style: "border: 0; border-radius: var(--radius-lg); padding: 1.5rem; max-width: 42rem; width: 92vw; background: var(--card); box-shadow: var(--shadow-lg); color: var(--ink);",
  });

  const form = el("form", {
    onsubmit: async (e) => {
      e.preventDefault();
      errorBox.textContent = "";
      const term = termInput.value.trim();
      const definition = defTextarea.value.trim();
      const examples = exTextarea.value.trim();
      const colloquium = Number(colSelect.value);
      const num = Number(numInput.value) || 1;

      if (!term || !definition) {
        errorBox.textContent = "Заполните формулировку вопроса и определение.";
        return;
      }

      const payload = {
        colloquium,
        colloquium_id: colloquium,
        num,
        term,
        definition,
        examples,
        hidden: hiddenCheckbox.checked,
      };

      try {
        if (isEdit) {
          await json(`/api/colloquiums/${encodeURIComponent(existing.id)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else {
          await json("/api/colloquiums", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        modal.close();
        modal.remove();
        if (onSaved) onSaved();
      } catch (err) {
        errorBox.textContent = `Ошибка сохранения: ${err.message}`;
      }
    },
  },
    el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;" },
      el("h2", { style: "margin: 0; font-size: 1.25rem;" }, isEdit ? "Редактирование вопроса" : "Новый вопрос коллоквиума"),
      el("button", {
        type: "button",
        class: "btn quiet btn-sm",
        onclick: () => { modal.close(); modal.remove(); },
      }, "✕")),
    el("div", { style: "display: flex; gap: 1rem; align-items: center; margin-bottom: 0.85rem;" },
      el("label", { style: "font-size: 0.85rem; font-weight: 500; display: flex; align-items: center; gap: 0.4rem;" },
        "Коллоквиум:", colSelect),
      el("label", { style: "font-size: 0.85rem; font-weight: 500; display: flex; align-items: center; gap: 0.4rem;" },
        "Номер вопроса:", numInput)),
    el("div", { style: "margin-bottom: 0.85rem;" },
      el("label", { style: "display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.3rem;" }, "Формулировка вопроса / название термина:"),
      termInput),
    el("div", { style: "margin-bottom: 0.85rem;" },
      el("label", { style: "display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.3rem;" }, "Точное определение (Markdown + KaTeX):"),
      defTextarea),
    el("div", { style: "margin-bottom: 0.85rem;" },
      el("label", { style: "display: block; font-size: 0.8rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: var(--muted); margin-bottom: 0.3rem;" }, "Предпросмотр формул и верстки:"),
      previewBox),
    el("div", { style: "margin-bottom: 0.85rem;" },
      el("label", { style: "display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.3rem;" }, "Примеры и пояснения (необязательно):"),
      exTextarea),
    el("label", { style: "display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.85rem; cursor: pointer;" },
      hiddenCheckbox,
      el("span", { style: "font-size: 0.88rem; font-weight: 600;" }, "Скрыть вопрос (не показывать ученикам в справочнике и карточках)")),
    errorBox,
    el("div", { style: "display: flex; justify-content: flex-end; gap: 0.65rem; margin-top: 1rem;" },
      el("button", {
        type: "button",
        class: "btn quiet",
        onclick: () => { modal.close(); modal.remove(); },
      }, "Отмена"),
      el("button", {
        type: "submit",
        class: "btn primary",
      }, isEdit ? "Сохранить изменения" : "Создать вопрос"))
  );

  modal.append(form);
  document.body.append(modal);
  modal.showModal();
}

async function deleteColloquiumQuestionConfirm(id, onDeleted = null) {
  if (!confirm(`Вы действительно хотите удалить вопрос ${id}?`)) return;
  try {
    await json(`/api/colloquiums/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (onDeleted) onDeleted();
  } catch (err) {
    alert(`Ошибка удаления: ${err.message}`);
  }
}

// ==========================================
// 4. ВКЛАДКА: ОНЛАЙН-КОНТЕСТЫ И ЛЕТУЧКИ
// ==========================================

async function contestsTab(container) {
  container.innerHTML = '<p class="muted">Загрузка контестов…</p>';

  let tests = [];
  try {
    tests = await json("/api/tests");
  } catch (e) {
    console.warn("Failed to load tests for contests:", e);
  }

  let selectedContestId = null;
  let liveInterval = null;

  async function render() {
    if (liveInterval) clearInterval(liveInterval);

    let contests = [];
    try {
      contests = await json("/api/contests");
    } catch (e) {
      container.innerHTML = `<p class="field-error">Ошибка загрузки контестов: ${e.message}</p>`;
      return;
    }

    // 1. Form to create a new contest
    const testOptions = tests.map((t) => el("option", { value: t.id }, `${t.title} (${t.count} зад.)`));

    const titleInput = el("input", {
      type: "text",
      placeholder: "Например: Летучка №1: Множества",
      required: true,
      style: "width: 100%;",
    });

    const testSelect = el("select", {
      style: "width: 100%;",
      onchange: () => {
        const sel = tests.find((t) => t.id === testSelect.value);
        if (sel && !titleInput.value) {
          titleInput.value = `Летучка: ${sel.title}`;
        }
      },
    },
      el("option", { value: "" }, "— Выберите тест курса —"),
      ...testOptions);

    const courseGroupsList = [
      "M3111", "M3112", "M3113", "M3114", "M3115",
      "M3116", "M3117", "M3118", "M3119", "M3120",
      "M3121", "M3122", "M3123", "M3124", "M3125",
      "M3101", "M3102", "M3103"
    ];
    let selectedGroups = ["all"];

    const groupStatusText = el("span", {
      class: "muted",
      style: "font-size: 0.85rem; margin-left: 0.5rem; font-weight: normal;",
    }, "Выбрано: Все группы курса");

    const chipsWrapper = el("div", {
      style: "display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.5rem;",
    });

    function renderGroupChips() {
      chipsWrapper.replaceChildren();

      const isAll = selectedGroups.includes("all") || selectedGroups.length === 0;

      // Кнопка 'Все группы курса (all)'
      const allBtn = el("button", {
        type: "button",
        class: `btn btn-sm ${isAll ? "primary" : "quiet"}`,
        style: isAll ? "font-weight: 600;" : "opacity: 0.85;",
        onclick: () => {
          selectedGroups = ["all"];
          renderGroupChips();
        },
      }, isAll ? "✓ Все группы курса (all)" : "Все группы курса (all)");
      chipsWrapper.append(allBtn);

      // Кнопки для каждой группы курса
      for (const g of courseGroupsList) {
        const isSelected = !isAll && selectedGroups.includes(g);
        const gBtn = el("button", {
          type: "button",
          class: `btn btn-sm ${isSelected ? "primary" : "quiet"}`,
          style: isSelected ? "font-weight: 600;" : "",
          onclick: () => {
            if (selectedGroups.includes("all")) {
              selectedGroups = [g];
            } else if (selectedGroups.includes(g)) {
              selectedGroups = selectedGroups.filter((x) => x !== g);
              if (selectedGroups.length === 0) selectedGroups = ["all"];
            } else {
              selectedGroups.push(g);
              if (selectedGroups.length === courseGroupsList.length) {
                selectedGroups = ["all"];
              }
            }
            renderGroupChips();
          },
        }, isSelected ? `✓ ${g}` : g);
        chipsWrapper.append(gBtn);
      }

      if (isAll) {
        groupStatusText.textContent = "Выбрано: Все группы курса";
      } else {
        groupStatusText.textContent = `Выбрано: ${selectedGroups.join(", ")} (${selectedGroups.length})`;
      }
    }

    renderGroupChips();

    const durationInput = el("input", {
      type: "number",
      value: "15",
      min: "5",
      max: "120",
      style: "width: 100%;",
    });

    const formError = el("p", { class: "field-error", hidden: true });

    const createForm = el("form", {
      class: "admin-box",
      style: "background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 1.25rem; margin-bottom: 2rem;",
      onsubmit: async (e) => {
        e.preventDefault();
        formError.hidden = true;
        const title = titleInput.value.trim();
        const testId = testSelect.value;
        const groupName = selectedGroups.includes("all") ? "all" : selectedGroups.join(", ");
        const dur = Number(durationInput.value) || 15;

        if (!title || !testId) {
          formError.textContent = "Заполните название и выберите тест.";
          formError.hidden = false;
          return;
        }

        try {
          await json("/api/admin/contests", {
            method: "POST",
            body: {
              title,
              test_id: testId,
              group_name: groupName,
              groups: selectedGroups,
              duration_minutes: dur,
            },
          });
          render();
        } catch (err) {
          formError.textContent = err.message;
          formError.hidden = false;
        }
      },
    },
      el("h3", { style: "margin-top: 0; margin-bottom: 1rem; font-size: 1.15rem;" }, "🚀 Запустить онлайн-контест на паре"),
      el("div", { class: "admin-form-grid", style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;" },
        el("label", {}, el("span", { class: "field-label" }, "Название работы"), titleInput),
        el("label", {}, el("span", { class: "field-label" }, "Тест курса"), testSelect),
        el("label", {}, el("span", { class: "field-label" }, "Таймер (минут)"), durationInput)),
      el("div", { style: "margin-bottom: 1.5rem; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 0.85rem 1rem;" },
        el("div", { style: "display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;" },
          el("span", { class: "field-label", style: "margin-bottom: 0; font-weight: 600;" },
            "Целевые группы (выберите одну, несколько или все):",
            groupStatusText),
          el("button", {
            type: "button",
            class: "btn quiet btn-sm",
            style: "font-size: 0.78rem; padding: 0.2rem 0.6rem;",
            onclick: () => {
              selectedGroups = ["all"];
              renderGroupChips();
            },
          }, "Сбросить на «Все группы»")),
        chipsWrapper),
      formError,
      el("button", { class: "btn primary", type: "submit" }, "⚡ Запустить контест для студентов"));

    // 2. Contests list
    const activeContests = contests.filter((c) => c.status === "active");
    const finishedContests = contests.filter((c) => c.status === "finished");

    const renderContestItem = (c) => {
      const isLive = c.status === "active";
      const isSelected = selectedContestId === c.id;

      return el("div", {
        class: `admin-contest-card ${isLive ? 'is-live' : ''} ${isSelected ? 'is-selected' : ''}`,
        style: `padding: 1rem; border: 1px solid ${isSelected ? 'var(--accent)' : 'var(--line)'}; border-radius: var(--radius-md); background: ${isSelected ? 'var(--accent-soft)' : 'var(--surface)'}; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;`,
      },
        el("div", { style: "flex: 1; min-width: 250px;" },
          el("div", { style: "display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.3rem;" },
            el("span", {
              class: `tag ${isLive ? 'tag-accent' : ''}`,
              style: isLive ? 'background: #22c55e; color: #fff; font-weight: 700;' : '',
            }, isLive ? "🟢 Идёт сейчас" : "⚪ Завершён"),
            el("span", { style: "font-size: 0.8rem; color: var(--muted);" }, `ID: ${c.id}`)),
          el("h4", { style: "margin: 0 0 0.25rem 0; font-size: 1.05rem;" }, c.title),
          el("div", { style: "font-size: 0.84rem; color: var(--muted); display: flex; gap: 1rem; flex-wrap: wrap;" },
            el("span", {}, "Группа: ", el("strong", {}, c.group_name === "all" ? "Все" : c.group_name)),
            el("span", {}, "Время: ", el("strong", {}, `${c.duration_minutes} мин`)),
            el("span", {}, "Сдали: ", el("strong", {}, `${c.submissions_count || 0} чел.`)))),
        el("div", { style: "display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;" },
          el("button", {
            class: `btn ${isSelected ? 'primary' : 'quiet'} btn-sm`,
            type: "button",
            onclick: () => {
              selectedContestId = c.id;
              render();
            },
          }, isSelected ? "📊 Таблица открыта" : "📊 Результаты и таблица"),
          isLive ? el("button", {
            class: "btn quiet btn-sm",
            type: "button",
            style: "color: #dc2626;",
            onclick: async () => {
              if (confirm(`Завершить приём ответов для «${c.title}»?`)) {
                await json(`/api/admin/contests/${c.id}/stop`, { method: "PUT" });
                render();
              }
            },
          }, "🛑 Остановить контест") : null,
          el("button", {
            class: "btn quiet btn-sm",
            type: "button",
            title: "Удалить контест",
            onclick: async () => {
              if (confirm(`Удалить контест «${c.title}» и все его результаты?`)) {
                await json(`/api/admin/contests/${c.id}`, { method: "DELETE" });
                if (selectedContestId === c.id) selectedContestId = null;
                render();
              }
            },
          }, "🗑️ Удалить")));
    };

    // 3. Standings viewer
    let standingsBox = el("div", { class: "admin-standings-box" });
    if (selectedContestId) {
      const selectedContest = contests.find((c) => c.id === selectedContestId);
      const isSelectedLive = selectedContest?.status === "active";

      const standingsHeader = el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;" },
        el("h3", { style: "margin: 0;" }, `🏆 Турнирная таблица: ${selectedContest?.title || selectedContestId}`),
        el("div", { style: "display: flex; gap: 0.5rem; align-items: center;" },
          isSelectedLive ? el("span", { style: "font-size: 0.78rem; color: #22c55e; font-weight: 600;" }, "🔄 Автообновление каждые 5 сек") : null,
          el("button", {
            class: "btn quiet btn-sm",
            type: "button",
            onclick: () => loadStandings(selectedContestId),
          }, "🔄 Обновить"),
          el("button", {
            class: "btn quiet btn-sm",
            type: "button",
            onclick: async () => {
              const res = await json(`/api/contests/${selectedContestId}/standings`);
              contestCsv(res.contest, res.standings || []);
            },
          }, "📥 Экспорт CSV")));

      const standingsTableContainer = el("div", { id: "standings-table-container" },
        el("p", { class: "muted" }, "Загружаем результаты студентов…"));

      standingsBox.replaceChildren(
        el("div", { style: "background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow); padding: 1.25rem; margin-top: 1.5rem;" },
          standingsHeader,
          standingsTableContainer));

      const loadStandings = async (id) => {
        try {
          const res = await json(`/api/contests/${id}/standings`);
          const rows = res.standings || [];
          if (!rows.length) {
            standingsTableContainer.innerHTML = '<p class="muted">Пока ни один студент не отправил решение.</p>';
            return;
          }

          standingsTableContainer.innerHTML = `
            <div class="table-responsive">
              <table class="leaderboard-table" style="width: 100%; border-collapse: collapse;">
                <thead>
                  <tr style="border-bottom: 2px solid var(--line); text-align: left;">
                    <th style="padding: 0.5rem;">#</th>
                    <th style="padding: 0.5rem;">Студент</th>
                    <th style="padding: 0.5rem;">Группа</th>
                    <th style="padding: 0.5rem;">Баллы</th>
                    <th style="padding: 0.5rem;">Процент</th>
                    <th style="padding: 0.5rem;">Время решения</th>
                    <th style="padding: 0.5rem;">Сдано</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map((r, i) => `
                    <tr style="border-bottom: 1px solid var(--line); background: ${i < 3 ? 'var(--sunken)' : 'transparent'};">
                      <td style="padding: 0.5rem;"><strong>${r.badge || r.rank}</strong></td>
                      <td style="padding: 0.5rem;"><strong>${r.user_name}</strong></td>
                      <td style="padding: 0.5rem;"><span class="group-pill">${r.group_name || '—'}</span></td>
                      <td style="padding: 0.5rem;"><strong>${r.score} / ${r.max_score}</strong></td>
                      <td style="padding: 0.5rem;">${r.percentage}%</td>
                      <td style="padding: 0.5rem;">${Math.round(r.duration_sec / 60)} мин ${r.duration_sec % 60} сек</td>
                      <td style="padding: 0.5rem; font-size: 0.8rem; color: var(--muted);">${new Date(r.created_at).toLocaleTimeString("ru-RU")}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `;
        } catch (e) {
          standingsTableContainer.innerHTML = `<p class="field-error">Ошибка: ${e.message}</p>`;
        }
      };

      loadStandings(selectedContestId);

      if (isSelectedLive) {
        liveInterval = setInterval(() => loadStandings(selectedContestId), 5000);
      }
    }

    container.replaceChildren(
      createForm,
      el("h3", { style: "margin: 1.5rem 0 0.75rem 0;" }, `Активные и недавние контесты (${contests.length})`),
      contests.length ? el("div", {}, contests.map(renderContestItem)) : el("p", { class: "muted" }, "Контесты ещё не создавались."),
      standingsBox);
  }

  render();
}

// ==========================================
// 6. ВКЛАДКА: ПРАКТИКИ
// ==========================================

async function practicesTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем список практик…"));
  let practices = [];
  try {
    const res = await json("/api/practices?all=1");
    practices = Array.isArray(res) ? res : (res.practices || []);
  } catch (err) {
    try {
      practices = await json("/practices.json");
    } catch {
      container.replaceChildren(el("div", { class: "notice error" }, `Ошибка загрузки практик: ${err.message}`));
      return;
    }
  }

  const createBtn = el("button", {
    class: "btn primary",
    type: "button",
    onclick: () => openPracticeEditor(null, container),
  }, "➕ Создать новую практику");

  const head = el("div", { class: "test-manager-head" },
    el("div", {},
      el("h2", { style: "margin: 0;" }, "Управление практическими занятиями"),
      el("p", { class: "muted", style: "margin: 0.2rem 0 0;" }, "Заполняйте практики материалами и задачами. Студенты открывают их на парах для решения.")),
    createBtn);

  const groupsSet = new Set(["Все группы"]);
  for (const p of practices) {
    if (p.group_name && p.group_name !== "all") groupsSet.add(p.group_name);
  }
  let activeGroup = "Все группы";

  const groupFilterContainer = el("div", { class: "topic-tabs", style: "margin-bottom: 1.25rem;" });
  const grid = el("div", { class: "note-cards-admin-grid" });

  function renderList() {
    groupFilterContainer.replaceChildren(
      ...Array.from(groupsSet).map((g) =>
        el("button", {
          class: `topic-tab-btn ${activeGroup === g ? "active" : ""}`,
          type: "button",
          onclick: () => { activeGroup = g; renderList(); },
        }, g)
      )
    );

    const filtered = activeGroup === "Все группы"
      ? practices
      : practices.filter((p) => p.group_name === activeGroup || p.group_name === "all");

    grid.replaceChildren();

    if (!filtered.length) {
      grid.replaceChildren(el("p", { class: "muted", style: "grid-column: 1 / -1; padding: 2rem; text-align: center;" }, "Практик пока нет. Нажмите «Создать новую практику»."));
      return;
    }

    for (const p of filtered) {
      const isPub = Boolean(p.is_published);
      const groupBadge = p.group_name && p.group_name !== "all" ? `Группа: ${p.group_name}` : "Все группы";

      const card = el("div", { class: "note-admin-card" },
        el("div", { style: "display: flex; gap: 0.85rem; align-items: flex-start;" },
          el("span", { style: "font-size: 2.2rem; line-height: 1;" }, "📝"),
          el("div", { style: "flex: 1; min-width: 0;" },
            el("div", { style: "font-size: 1.15rem; font-weight: 600; line-height: 1.35; margin-bottom: 0.35rem;" }, p.title || p.id),
            el("div", { style: "display: flex; gap: 0.45rem; flex-wrap: wrap; margin-bottom: 0.65rem;" },
              el("span", { class: "badge badge-accent" }, `📌 ${p.topic || "Общее"}`),
              el("span", { class: "badge badge-gray" }, `👥 ${groupBadge}`),
              el("span", { class: "badge badge-gray" }, `№${p.order_index ?? p.order ?? 1}`),
              el("span", {
                class: `badge ${isPub ? "badge-success" : "badge-gray"}`,
                style: isPub ? "font-weight: 600;" : "color: var(--muted);"
              }, isPub ? "Выдано ✅" : "Черновик (не выдано) 🔒")),
            el("p", { class: "muted", style: "margin: 0; font-size: 0.88rem; line-height: 1.45; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" },
              p.content ? p.content.slice(0, 150) + "..." : "Текст практики пуст"))),
        el("div", { class: "test-card-actions" },
          el("button", {
            class: "btn primary btn-sm",
            type: "button",
            onclick: () => openPracticeEditor(p.id, container),
          }, "✏️ Редактировать"),
          el("button", {
            class: "btn quiet btn-sm",
            type: "button",
            onclick: () => openPreviewModal(`practices/?id=${encodeURIComponent(p.id)}`, p.title || p.id),
          }, "🔍 Просмотр"),
          el("button", {
            class: `btn btn-sm btn-visibility-toggle ${isPub ? "is-visible" : "is-hidden"}`,
            type: "button",
            onclick: async () => {
              try {
                await json(`/api/admin/practices/${encodeURIComponent(p.id)}`, {
                  method: "PUT",
                  body: { is_published: isPub ? 0 : 1 },
                });
                practicesTab(container);
              } catch (e) {
                alert(`Ошибка: ${e.message}`);
              }
            },
          }, isPub ? "✅ Выдано" : "🔒 Не выдано"),
          el("button", {
            class: "btn quiet btn-sm btn-delete-action",
            type: "button",
            style: "color: var(--bad); margin-left: auto;",
            onclick: async () => {
              if (confirm(`Удалить практику «${p.title || p.id}»?`)) {
                try {
                  await json(`/api/admin/practices/${encodeURIComponent(p.id)}`, { method: "DELETE" });
                  practicesTab(container);
                } catch (e) {
                  alert(`Ошибка удаления: ${e.message}`);
                }
              }
            },
          }, "🗑️ Удалить"))
      );
      grid.append(card);
    }
  }

  renderList();
  container.replaceChildren(head, groupFilterContainer, grid);
}

async function openPracticeEditor(practiceId, container) {
  container.replaceChildren(el("p", { class: "muted", style: "padding: 2rem;" }, "Загружаем редактор практики…"));

  let p = {
    id: `practice-${Date.now()}`,
    title: "",
    topic: "Отношения",
    group_name: "all",
    order_index: 1,
    is_published: 1,
    content: "",
  };

  const isNew = !practiceId;
  if (!isNew) {
    try {
      const res = await json(`/api/practices/${encodeURIComponent(practiceId)}`);
      p = res.practice || p;
    } catch (err) {
      container.replaceChildren(el("div", { class: "notice error" }, `Ошибка загрузки практики: ${err.message}`));
      return;
    }
  }

  let currentRawMd = p.content || "";
  let viewMode = "split"; // "edit" | "split" | "preview"
  let isDirty = false;
  const draftKey = `practice_draft_${p.id}`;

  const saveStatus = el("span", { class: "save-msg", style: "font-size: 0.88rem;" }, "");

  const markDirty = () => {
    if (!isDirty) {
      isDirty = true;
      saveStatus.textContent = "● Не сохранено";
      saveStatus.style.color = "var(--warn-ink, #b45309)";
    }
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        content: currentRawMd,
        title: titleInput.value,
        topic: topicInput.value,
        group_name: groupSelect.value,
        order_index: orderInput.value,
        is_published: pubCheckbox.checked ? 1 : 0,
        time: Date.now(),
      }));
    } catch {}
  };

  const beforeUnloadHandler = (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);

  const cleanupAndLeave = () => {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    window.removeEventListener("keydown", keyHandler);
    practicesTab(container);
  };

  // Верхняя навигация
  const backBtn = el("button", {
    class: "btn quiet",
    type: "button",
    onclick: () => {
      if (isDirty) {
        const ok = confirm("У вас есть несохранённые изменения в практике.\n\nВы действительно хотите выйти без сохранения?");
        if (!ok) return;
      }
      cleanupAndLeave();
    },
  }, "← Ко всем практикам");

  const pubCheckbox = el("input", {
    type: "checkbox",
    checked: Boolean(p.is_published),
    onchange: () => {
      markDirty();
      updatePubBtn();
    },
  });

  const pubBtn = el("button", {
    class: "btn btn-sm btn-visibility-toggle",
    type: "button",
    title: "Опубликовать / скрыть практику для студентов",
    onclick: () => {
      pubCheckbox.checked = !pubCheckbox.checked;
      markDirty();
      updatePubBtn();
    },
  });

  function updatePubBtn() {
    pubBtn.textContent = pubCheckbox.checked ? "✅ Выдано студентам" : "🔒 Черновик (скрыто)";
    pubBtn.className = `btn btn-sm btn-visibility-toggle ${pubCheckbox.checked ? "is-visible" : "is-hidden"}`;
  }
  updatePubBtn();

  const previewLink = el("button", {
    class: "btn quiet btn-sm",
    type: "button",
    onclick: () => openPreviewModal(`practices/?id=${encodeURIComponent(p.id)}`, titleInput.value || p.id),
  }, "🔍 Предпросмотр");

  const saveBtn = el("button", {
    class: "btn primary",
    type: "button",
    onclick: async () => {
      saveBtn.disabled = true;
      saveStatus.textContent = "Сохранение…";
      saveStatus.style.color = "var(--muted)";
      try {
        const payload = {
          id: p.id,
          title: titleInput.value.trim() || p.id,
          topic: topicInput.value.trim() || "Общее",
          group_name: groupSelect.value,
          order_index: parseInt(orderInput.value) || 1,
          is_published: pubCheckbox.checked ? 1 : 0,
          content: currentRawMd,
        };

        if (isNew) {
          await json("/api/admin/practices", { method: "POST", body: payload });
        } else {
          await json(`/api/admin/practices/${encodeURIComponent(p.id)}`, { method: "PUT", body: payload });
        }

        isDirty = false;
        try { localStorage.removeItem(draftKey); } catch {}
        saveStatus.textContent = "✅ Сохранено";
        saveStatus.style.color = "var(--ok)";
        setTimeout(() => {
          if (!isDirty) saveStatus.textContent = "";
        }, 3000);
      } catch (err) {
        saveStatus.textContent = `❌ Ошибка: ${err.message}`;
        saveStatus.style.color = "var(--bad)";
      } finally {
        saveBtn.disabled = false;
      }
    },
  }, "💾 Сохранить");

  // Переключатель режимов
  const segEdit = el("button", {
    class: "doc-seg-btn",
    type: "button",
    title: "Редактирование во всю ширину",
    onclick: () => switchViewMode("edit"),
  }, "✏️ Редактирование");

  const segSplit = el("button", {
    class: "doc-seg-btn active",
    type: "button",
    title: "Редактор слева + живой результат справа",
    onclick: () => switchViewMode("split"),
  }, "↔️ Сплит");

  const segPreview = el("button", {
    class: "doc-seg-btn",
    type: "button",
    title: "Вид готовой статьи",
    onclick: () => switchViewMode("preview"),
  }, "👁️ Предпросмотр");

  const viewSegmented = el("div", { class: "doc-view-segmented" }, segEdit, segSplit, segPreview);

  const topbar = el("div", { class: "doc-editor-topbar" },
    el("div", { style: "display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;" },
      backBtn,
      el("span", { class: "muted" }, "•"),
      el("span", { style: "font-weight: 600; font-size: 0.95rem;" }, isNew ? "Новая практика" : `Практика: ${p.title || p.id}`)),
    el("div", { style: "display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;" },
      viewSegmented,
      saveStatus,
      pubBtn,
      previewLink,
      saveBtn));

  // Заголовок документа
  const titleInput = el("input", {
    class: "doc-title-input",
    type: "text",
    value: p.title || "",
    placeholder: "Название практического занятия…",
    oninput: markDirty,
  });

  // Метаданные
  const topicInput = el("input", {
    class: "doc-meta-input",
    type: "text",
    value: p.topic || "Отношения",
    placeholder: "Тема (например: Отношения, Логика)",
    style: "min-width: 14rem;",
    oninput: markDirty,
  });

  const groupSelect = el("select", {
    class: "doc-meta-input",
    style: "min-width: 11rem;",
    onchange: markDirty,
  });
  const groupsList = ["all", "M3111", "M3112", "M3113", "M3114", "M3115", "M3116", "M3117", "M3118", "M3119", "M3120", "M3121", "M3122", "M3123", "M3124", "M3125", "M3101", "M3102", "M3103"];
  for (const g of groupsList) {
    const opt = el("option", { value: g }, g === "all" ? "Все группы (all)" : g);
    if (p.group_name === g) opt.selected = true;
    groupSelect.append(opt);
  }

  const orderInput = el("input", {
    class: "doc-meta-input",
    type: "number",
    value: String(p.order_index ?? p.order ?? 1),
    placeholder: "№",
    style: "width: 5rem;",
    title: "Порядковый номер в курсе",
    oninput: markDirty,
  });

  const metaBox = el("div", { class: "doc-meta-box" },
    el("div", { style: "display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;" },
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, "Тема:"),
      topicInput,
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, "Для группы:"),
      groupSelect,
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, "Порядок:"),
      orderInput,
      el("label", { style: "display: flex; align-items: center; gap: 0.4rem; cursor: pointer; white-space: nowrap; margin-left: auto;" },
        pubCheckbox,
        el("span", { class: "field-label", style: "margin: 0; font-size: 0.88rem;" }, "Выдано студентам"))));

  // Текстовая область Markdown
  const textarea = el("textarea", {
    class: "doc-main-textarea",
    rows: 24,
    placeholder: "# Заголовок практики\n\n## 📝 Задачи к занятию\n\n### Задача 1\nУсловие задачи с формулой $x \\in A$.\n",
    value: currentRawMd,
    oninput: () => {
      currentRawMd = textarea.value;
      updateLivePreview();
      markDirty();
    },
  });

  const livePreview = el("div", { class: "doc-live-preview markdown-body" });

  const updateLivePreview = () => {
    livePreview.innerHTML = renderMarkdownPreview(currentRawMd);
  };
  updateLivePreview();

  // Функция вставки для панели Word
  const insertDocText = (before, after = "") => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const sel = textarea.value.substring(start, end);
    const replacement = before + (sel || "") + after;
    textarea.setRangeText(replacement, start, end, "select");
    currentRawMd = textarea.value;
    updateLivePreview();
    markDirty();
    textarea.focus();
  };

  // Панель инструментов
  const headingSelect = el("select", {
    class: "doc-select",
    title: "Стиль текста",
    onchange: (e) => {
      const val = e.target.value;
      if (val === "h1") insertDocText("# ", "\n");
      else if (val === "h2") insertDocText("## ", "\n");
      else if (val === "h3") insertDocText("### ", "\n");
      e.target.value = "p";
    },
  },
    el("option", { value: "p" }, "Обычный текст"),
    el("option", { value: "h1" }, "Заголовок 1 (Раздел)"),
    el("option", { value: "h2" }, "Заголовок 2 (Подраздел)"),
    el("option", { value: "h3" }, "Заголовок 3 (Задача / Пункт)"));

  const toolbar = el("div", { class: "doc-word-toolbar" },
    el("div", { class: "doc-tool-group" }, headingSelect),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Полужирный (Ctrl+B)", onclick: () => insertDocText("**", "**") }, el("strong", {}, "Ж")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Курсив (Ctrl+I)", onclick: () => insertDocText("*", "*") }, el("em", {}, "К")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Подчёркнутый", onclick: () => insertDocText("<u>", "</u>") }, el("u", {}, "Ч")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Встроенный код", onclick: () => insertDocText("`", "`") }, "< >")),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Маркированный список", onclick: () => insertDocText("- ") }, "• Список"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Нумерованный список", onclick: () => insertDocText("1. ") }, "1. Список"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Таблица", onclick: () => insertDocText("\n| Колонка 1 | Колонка 2 |\n| :--- | :--- |\n| Текст 1 | Текст 2 |\n") }, "▦ Таблица")),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Формула в строке: $...$", onclick: () => insertDocText("$", "$") }, "∑ Формула"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Блок формулы: $$...$$", onclick: () => insertDocText("$$\n", "\n$$") }, "∫ Блок формулы"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Шаблон задачи", onclick: () => insertDocText("\n### 📝 Задача 1\nУсловие задачи...\n\n**Указание / Решение:**\n") }, "📋 Задача")),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка примечания", onclick: () => insertDocText("> [!NOTE]\n> ") }, "ℹ️ Заметка"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка совета", onclick: () => insertDocText("> [!TIP]\n> ") }, "💡 Совет"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка важно", onclick: () => insertDocText("> [!IMPORTANT]\n> ") }, "📌 Важно"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Горизонтальный разделитель", onclick: () => insertDocText("\n---\n") }, "— Черта")));

  const editorBodyContainer = el("div", { class: `doc-body-container mode-${viewMode}` },
    textarea,
    livePreview);

  const switchViewMode = (mode) => {
    viewMode = mode;
    segEdit.classList.toggle("active", mode === "edit");
    segSplit.classList.toggle("active", mode === "split");
    segPreview.classList.toggle("active", mode === "preview");

    editorBodyContainer.className = `doc-body-container mode-${mode}`;
    toolbar.style.display = mode === "preview" ? "none" : "";
    metaBox.style.display = mode === "preview" ? "none" : "";
    titleInput.readOnly = mode === "preview";
  };

  // Горячая клавиша Ctrl+S / Cmd+S
  const keyHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveBtn.click();
    }
  };
  window.addEventListener("keydown", keyHandler);

  const deleteBtn = el("button", {
    class: "btn quiet",
    type: "button",
    style: "color: var(--bad); margin-left: auto;",
    onclick: async () => {
      if (confirm(`Безвозвратно удалить практику «${titleInput.value || p.id}»?`)) {
        try {
          await json(`/api/admin/practices/${encodeURIComponent(p.id)}`, { method: "DELETE" });
          cleanupAndLeave();
        } catch (e) {
          alert(`Ошибка удаления: ${e.message}`);
        }
      }
    },
  }, "🗑️ Удалить практику");

  const bottomActions = el("div", { class: "doc-editor-bottom-bar" },
    saveBtn.cloneNode(true),
    previewLink.cloneNode(true),
    deleteBtn);
  bottomActions.querySelector(".btn.primary").onclick = () => saveBtn.click();
  bottomActions.querySelector("button:nth-child(2)").onclick = () => previewLink.click();

  const docSheet = el("div", { class: "doc-paper-sheet" },
    titleInput,
    metaBox,
    toolbar,
    editorBodyContainer,
    bottomActions);

  container.replaceChildren(topbar, docSheet);
}

// ==========================================
// 7. ВКЛАДКА: ДОМАШНИЕ ЗАДАНИЯ И ПРОВЕРКА
// ==========================================

async function homeworksTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем список домашних заданий…"));
  let homeworks = [];
  try {
    const res = await json("/api/homeworks?all=1");
    homeworks = Array.isArray(res) ? res : (res.homeworks || []);
  } catch (err) {
    try {
      homeworks = await json("/homeworks.json");
    } catch {
      container.replaceChildren(el("div", { class: "notice error" }, `Ошибка загрузки ДЗ: ${err.message}`));
      return;
    }
  }

  const createBtn = el("button", {
    class: "btn primary",
    type: "button",
    onclick: () => openHomeworkEditor(null, container),
  }, "➕ Создать домашнее задание");

  const head = el("div", { class: "test-manager-head" },
    el("div", {},
      el("h2", { style: "margin: 0;" }, "Управление домашними заданиями и проверка работ"),
      el("p", { class: "muted", style: "margin: 0.2rem 0 0;" }, "Публикуйте ДЗ, задавайте дедлайны и группы, проверяйте загруженные студентами PDF-файлы и выставляйте оценки.")),
    createBtn);

  const grid = el("div", { class: "note-cards-admin-grid" });

  for (const h of homeworks) {
    const isPub = Boolean(h.is_published);
    const groupBadge = h.group_name && h.group_name !== "all" ? `Группа: ${h.group_name}` : "Все группы";
    const subsCount = h.submissions_count || 0;

    const card = el("div", { class: "note-admin-card" },
      el("div", { style: "display: flex; gap: 0.85rem; align-items: flex-start;" },
        el("span", { style: "font-size: 2.2rem; line-height: 1;" }, "📤"),
        el("div", { style: "flex: 1; min-width: 0;" },
          el("div", { style: "font-size: 1.15rem; font-weight: 600; line-height: 1.35; margin-bottom: 0.35rem;" }, h.title || h.id),
          el("div", { style: "display: flex; gap: 0.45rem; flex-wrap: wrap; margin-bottom: 0.65rem;" },
            el("span", { class: "badge badge-accent" }, `📌 ${h.topic || "Общее"}`),
            el("span", { class: "badge badge-gray" }, `👥 ${groupBadge}`),
            el("span", { class: "badge badge-warning" }, `⭐ Макс: ${h.max_score} б.`),
            h.deadline ? el("span", { class: "badge badge-gray" }, `🗓️ ${h.deadline}`) : null,
            el("span", {
              class: `badge ${isPub ? "badge-success" : "badge-gray"}`,
              style: isPub ? "font-weight: 600;" : "color: var(--muted);"
            }, isPub ? "Выдано ✅" : "Черновик 🔒")),
          el("div", { style: "display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;" },
            el("span", {
              class: `badge ${subsCount > 0 ? "badge-success" : "badge-gray"}`,
              style: subsCount > 0 ? "font-weight: 600;" : "",
            }, `📥 Сдано работ: ${subsCount}`)))),
      el("div", { class: "test-card-actions" },
        el("button", {
          class: "btn primary btn-sm",
          type: "button",
          style: "font-weight: 600;",
          onclick: () => openHomeworkSubmissionsReview(h, container),
        }, `👥 Работы студентов (${subsCount})`),
        el("button", {
          class: "btn quiet btn-sm",
          type: "button",
          onclick: () => openHomeworkEditor(h.id, container),
        }, "✏️ Редактировать"),
        el("button", {
          class: "btn quiet btn-sm",
          type: "button",
          onclick: () => openPreviewModal(`homeworks/?id=${encodeURIComponent(h.id)}`, h.title || h.id),
        }, "🔍 Просмотр"),
        el("button", {
          class: `btn btn-sm btn-visibility-toggle ${isPub ? "is-visible" : "is-hidden"}`,
          type: "button",
          onclick: async () => {
            try {
              await json(`/api/admin/homeworks/${encodeURIComponent(h.id)}`, {
                method: "PUT",
                body: { is_published: isPub ? 0 : 1 },
              });
              homeworksTab(container);
            } catch (e) {
              alert(`Ошибка: ${e.message}`);
            }
          },
        }, isPub ? "✅ Выдано" : "🔒 Не выдано"),
        el("button", {
          class: "btn quiet btn-sm btn-delete-action",
          type: "button",
          style: "color: var(--bad); margin-left: auto;",
          onclick: async () => {
            if (confirm(`Удалить ДЗ «${h.title || h.id}» и все прикреплённые решения?`)) {
              try {
                await json(`/api/admin/homeworks/${encodeURIComponent(h.id)}`, { method: "DELETE" });
                homeworksTab(container);
              } catch (e) {
                alert(`Ошибка удаления: ${e.message}`);
              }
            }
          },
        }, "🗑️ Удалить"))
    );
    grid.append(card);
  }

  container.replaceChildren(head, grid);
}

async function openHomeworkEditor(hwId, container) {
  container.replaceChildren(el("p", { class: "muted", style: "padding: 2rem;" }, "Загружаем редактор домашнего задания…"));

  let h = {
    id: `hw-${Date.now()}`,
    title: "",
    topic: "Отношения",
    group_name: "all",
    deadline: "",
    max_score: 10,
    order_index: 1,
    is_published: 1,
    content: "",
  };

  const isNew = !hwId;
  if (!isNew) {
    try {
      const res = await json(`/api/homeworks/${encodeURIComponent(hwId)}`);
      h = res.homework || h;
    } catch (err) {
      container.replaceChildren(el("div", { class: "notice error" }, `Ошибка загрузки ДЗ: ${err.message}`));
      return;
    }
  }

  let currentRawMd = h.content || "";
  let viewMode = "split"; // "edit" | "split" | "preview"
  let isDirty = false;
  const draftKey = `hw_draft_${h.id}`;

  const saveStatus = el("span", { class: "save-msg", style: "font-size: 0.88rem;" }, "");

  const markDirty = () => {
    if (!isDirty) {
      isDirty = true;
      saveStatus.textContent = "● Не сохранено";
      saveStatus.style.color = "var(--warn-ink, #b45309)";
    }
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        content: currentRawMd,
        title: titleInput.value,
        topic: topicInput.value,
        group_name: groupSelect.value,
        deadline: deadlineInput.value,
        max_score: maxScoreInput.value,
        order_index: orderInput.value,
        is_published: pubCheckbox.checked ? 1 : 0,
        time: Date.now(),
      }));
    } catch {}
  };

  const beforeUnloadHandler = (e) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);

  const cleanupAndLeave = () => {
    window.removeEventListener("beforeunload", beforeUnloadHandler);
    window.removeEventListener("keydown", keyHandler);
    homeworksTab(container);
  };

  // Верхняя навигация
  const backBtn = el("button", {
    class: "btn quiet",
    type: "button",
    onclick: () => {
      if (isDirty) {
        const ok = confirm("У вас есть несохранённые изменения в ДЗ.\n\nВы действительно хотите выйти без сохранения?");
        if (!ok) return;
      }
      cleanupAndLeave();
    },
  }, "← Ко всем заданиям");

  const pubCheckbox = el("input", {
    type: "checkbox",
    checked: Boolean(h.is_published),
    onchange: () => {
      markDirty();
      updatePubBtn();
    },
  });

  const pubBtn = el("button", {
    class: "btn btn-sm btn-visibility-toggle",
    type: "button",
    title: "Опубликовать / скрыть ДЗ для студентов",
    onclick: () => {
      pubCheckbox.checked = !pubCheckbox.checked;
      markDirty();
      updatePubBtn();
    },
  });

  function updatePubBtn() {
    pubBtn.textContent = pubCheckbox.checked ? "✅ Выдано студентам" : "🔒 Черновик (скрыто)";
    pubBtn.className = `btn btn-sm btn-visibility-toggle ${pubCheckbox.checked ? "is-visible" : "is-hidden"}`;
  }
  updatePubBtn();

  const previewLink = el("button", {
    class: "btn quiet btn-sm",
    type: "button",
    onclick: () => openPreviewModal(`homeworks/?id=${encodeURIComponent(h.id)}`, titleInput.value || h.id),
  }, "🔍 Предпросмотр");

  const subsCount = h.submissions_count || 0;
  const reviewBtn = el("button", {
    class: "btn quiet btn-sm",
    type: "button",
    onclick: () => openHomeworkSubmissionsReview(h, container),
  }, `👥 Работы (${subsCount})`);

  const saveBtn = el("button", {
    class: "btn primary",
    type: "button",
    onclick: async () => {
      saveBtn.disabled = true;
      saveStatus.textContent = "Сохранение…";
      saveStatus.style.color = "var(--muted)";
      try {
        const payload = {
          id: h.id,
          title: titleInput.value.trim() || h.id,
          topic: topicInput.value.trim() || "Общее",
          group_name: groupSelect.value,
          deadline: deadlineInput.value.trim(),
          max_score: parseFloat(maxScoreInput.value) || 10,
          order_index: parseInt(orderInput.value) || 1,
          is_published: pubCheckbox.checked ? 1 : 0,
          content: currentRawMd,
        };

        if (isNew) {
          await json("/api/admin/homeworks", { method: "POST", body: payload });
        } else {
          await json(`/api/admin/homeworks/${encodeURIComponent(h.id)}`, { method: "PUT", body: payload });
        }

        isDirty = false;
        try { localStorage.removeItem(draftKey); } catch {}
        saveStatus.textContent = "✅ Сохранено";
        saveStatus.style.color = "var(--ok)";
        setTimeout(() => {
          if (!isDirty) saveStatus.textContent = "";
        }, 3000);
      } catch (err) {
        saveStatus.textContent = `❌ Ошибка: ${err.message}`;
        saveStatus.style.color = "var(--bad)";
      } finally {
        saveBtn.disabled = false;
      }
    },
  }, "💾 Сохранить");

  // Переключатель режимов
  const segEdit = el("button", {
    class: "doc-seg-btn",
    type: "button",
    title: "Редактирование во всю ширину",
    onclick: () => switchViewMode("edit"),
  }, "✏️ Редактирование");

  const segSplit = el("button", {
    class: "doc-seg-btn active",
    type: "button",
    title: "Редактор слева + живой результат справа",
    onclick: () => switchViewMode("split"),
  }, "↔️ Сплит");

  const segPreview = el("button", {
    class: "doc-seg-btn",
    type: "button",
    title: "Вид готовой статьи",
    onclick: () => switchViewMode("preview"),
  }, "👁️ Предпросмотр");

  const viewSegmented = el("div", { class: "doc-view-segmented" }, segEdit, segSplit, segPreview);

  const topbar = el("div", { class: "doc-editor-topbar" },
    el("div", { style: "display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap;" },
      backBtn,
      el("span", { class: "muted" }, "•"),
      el("span", { style: "font-weight: 600; font-size: 0.95rem;" }, isNew ? "Новое ДЗ" : `ДЗ: ${h.title || h.id}`)),
    el("div", { style: "display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;" },
      viewSegmented,
      saveStatus,
      pubBtn,
      reviewBtn,
      previewLink,
      saveBtn));

  // Заголовок документа
  const titleInput = el("input", {
    class: "doc-title-input",
    type: "text",
    value: h.title || "",
    placeholder: "Название домашнего задания…",
    oninput: markDirty,
  });

  // Метаданные
  const topicInput = el("input", {
    class: "doc-meta-input",
    type: "text",
    value: h.topic || "Отношения",
    placeholder: "Тема (например: Отношения, Логика)",
    style: "min-width: 12rem;",
    oninput: markDirty,
  });

  const groupSelect = el("select", {
    class: "doc-meta-input",
    style: "min-width: 10rem;",
    onchange: markDirty,
  });
  const groupsList = ["all", "M3111", "M3112", "M3113", "M3114", "M3115", "M3116", "M3117", "M3118", "M3119", "M3120", "M3121", "M3122", "M3123", "M3124", "M3125", "M3101", "M3102", "M3103"];
  for (const g of groupsList) {
    const opt = el("option", { value: g }, g === "all" ? "Все группы (all)" : g);
    if (h.group_name === g) opt.selected = true;
    groupSelect.append(opt);
  }

  const deadlineInput = el("input", {
    class: "doc-meta-input",
    type: "text",
    value: h.deadline || "",
    placeholder: "2026-10-25 23:59",
    title: "Дедлайн сдачи (дата и время)",
    style: "width: 11rem;",
    oninput: markDirty,
  });

  const maxScoreInput = el("input", {
    class: "doc-meta-input",
    type: "number",
    step: "0.5",
    value: String(h.max_score ?? 10),
    title: "Максимальный балл",
    style: "width: 5.5rem;",
    oninput: markDirty,
  });

  const orderInput = el("input", {
    class: "doc-meta-input",
    type: "number",
    value: String(h.order_index ?? h.order ?? 1),
    placeholder: "№",
    style: "width: 4.5rem;",
    title: "Порядковый номер в курсе",
    oninput: markDirty,
  });

  const metaBox = el("div", { class: "doc-meta-box" },
    el("div", { style: "display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;" },
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, "Тема:"),
      topicInput,
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, "Группа:"),
      groupSelect,
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, "Дедлайн:"),
      deadlineInput,
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, "Макс. балл:"),
      maxScoreInput,
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, "Порядок:"),
      orderInput,
      el("label", { style: "display: flex; align-items: center; gap: 0.4rem; cursor: pointer; white-space: nowrap; margin-left: auto;" },
        pubCheckbox,
        el("span", { class: "field-label", style: "margin: 0; font-size: 0.88rem;" }, "Выдано студентам"))));

  // Текстовая область Markdown
  const textarea = el("textarea", {
    class: "doc-main-textarea",
    rows: 24,
    placeholder: "# Домашнее задание\n\n## 📝 Задачи\n\n### Задача 1 (4 балла)\nУсловие задачи с формулой $x \\in A$.\n",
    value: currentRawMd,
    oninput: () => {
      currentRawMd = textarea.value;
      updateLivePreview();
      markDirty();
    },
  });

  const livePreview = el("div", { class: "doc-live-preview markdown-body" });

  const updateLivePreview = () => {
    livePreview.innerHTML = renderMarkdownPreview(currentRawMd);
  };
  updateLivePreview();

  // Функция вставки для панели Word
  const insertDocText = (before, after = "") => {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const sel = textarea.value.substring(start, end);
    const replacement = before + (sel || "") + after;
    textarea.setRangeText(replacement, start, end, "select");
    currentRawMd = textarea.value;
    updateLivePreview();
    markDirty();
    textarea.focus();
  };

  // Панель инструментов
  const headingSelect = el("select", {
    class: "doc-select",
    title: "Стиль текста",
    onchange: (e) => {
      const val = e.target.value;
      if (val === "h1") insertDocText("# ", "\n");
      else if (val === "h2") insertDocText("## ", "\n");
      else if (val === "h3") insertDocText("### ", "\n");
      e.target.value = "p";
    },
  },
    el("option", { value: "p" }, "Обычный текст"),
    el("option", { value: "h1" }, "Заголовок 1 (Раздел)"),
    el("option", { value: "h2" }, "Заголовок 2 (Подраздел)"),
    el("option", { value: "h3" }, "Заголовок 3 (Задача / Пункт)"));

  const toolbar = el("div", { class: "doc-word-toolbar" },
    el("div", { class: "doc-tool-group" }, headingSelect),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Полужирный (Ctrl+B)", onclick: () => insertDocText("**", "**") }, el("strong", {}, "Ж")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Курсив (Ctrl+I)", onclick: () => insertDocText("*", "*") }, el("em", {}, "К")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Подчёркнутый", onclick: () => insertDocText("<u>", "</u>") }, el("u", {}, "Ч")),
      el("button", { class: "doc-tool-btn", type: "button", title: "Встроенный код", onclick: () => insertDocText("`", "`") }, "< >")),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Маркированный список", onclick: () => insertDocText("- ") }, "• Список"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Нумерованный список", onclick: () => insertDocText("1. ") }, "1. Список"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Таблица", onclick: () => insertDocText("\n| Колонка 1 | Колонка 2 |\n| :--- | :--- |\n| Текст 1 | Текст 2 |\n") }, "▦ Таблица")),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Формула в строке: $...$", onclick: () => insertDocText("$", "$") }, "∑ Формула"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Блок формулы: $$...$$", onclick: () => insertDocText("$$\n", "\n$$") }, "∫ Блок формулы"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Шаблон задачи", onclick: () => insertDocText("\n### 📝 Задача 1 (5 баллов)\nУсловие задачи...\n") }, "📋 Задача")),
    el("div", { class: "doc-tool-group" },
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка примечания", onclick: () => insertDocText("> [!NOTE]\n> ") }, "ℹ️ Заметка"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка совета", onclick: () => insertDocText("> [!TIP]\n> ") }, "💡 Совет"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Вставка важно", onclick: () => insertDocText("> [!IMPORTANT]\n> ") }, "📌 Важно"),
      el("button", { class: "doc-tool-btn", type: "button", title: "Горизонтальный разделитель", onclick: () => insertDocText("\n---\n") }, "— Черта")));

  const editorBodyContainer = el("div", { class: `doc-body-container mode-${viewMode}` },
    textarea,
    livePreview);

  const switchViewMode = (mode) => {
    viewMode = mode;
    segEdit.classList.toggle("active", mode === "edit");
    segSplit.classList.toggle("active", mode === "split");
    segPreview.classList.toggle("active", mode === "preview");

    editorBodyContainer.className = `doc-body-container mode-${mode}`;
    toolbar.style.display = mode === "preview" ? "none" : "";
    metaBox.style.display = mode === "preview" ? "none" : "";
    titleInput.readOnly = mode === "preview";
  };

  // Горячая клавиша Ctrl+S / Cmd+S
  const keyHandler = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      saveBtn.click();
    }
  };
  window.addEventListener("keydown", keyHandler);

  const deleteBtn = el("button", {
    class: "btn quiet",
    type: "button",
    style: "color: var(--bad); margin-left: auto;",
    onclick: async () => {
      if (confirm(`Безвозвратно удалить ДЗ «${titleInput.value || h.id}»?`)) {
        try {
          await json(`/api/admin/homeworks/${encodeURIComponent(h.id)}`, { method: "DELETE" });
          cleanupAndLeave();
        } catch (e) {
          alert(`Ошибка удаления: ${e.message}`);
        }
      }
    },
  }, "🗑️ Удалить задание");

  const bottomActions = el("div", { class: "doc-editor-bottom-bar" },
    saveBtn.cloneNode(true),
    reviewBtn.cloneNode(true),
    previewLink.cloneNode(true),
    deleteBtn);
  bottomActions.querySelector(".btn.primary").onclick = () => saveBtn.click();
  bottomActions.querySelector("button:nth-child(2)").onclick = () => reviewBtn.click();
  bottomActions.querySelector("button:nth-child(3)").onclick = () => previewLink.click();

  const docSheet = el("div", { class: "doc-paper-sheet" },
    titleInput,
    metaBox,
    toolbar,
    editorBodyContainer,
    bottomActions);

  container.replaceChildren(topbar, docSheet);
}

function openHomeworkSubmissionsReview(hw, parentContainer) {
  let dlg = document.getElementById("homework-review-dialog");
  if (!dlg) {
    dlg = el("dialog", { class: "admin-preview-dialog", id: "homework-review-dialog" });
    document.body.append(dlg);
  }

  dlg.replaceChildren(el("p", { class: "muted", style: "padding: 2rem;" }, "Загрузка сданных работ…"));
  dlg.showModal();

  async function loadSubmissions() {
    try {
      const res = await json(`/api/admin/homeworks/${encodeURIComponent(hw.id)}/submissions`);
      const subs = res.submissions || [];
      renderReviewUI(subs);
    } catch (err) {
      dlg.replaceChildren(
        el("div", { style: "padding: 2rem;" },
          el("p", { class: "field-error" }, `Ошибка загрузки: ${err.message}`),
          el("button", { class: "btn primary", onclick: () => dlg.close() }, "Закрыть"))
      );
    }
  }

  function renderReviewUI(subs) {
    const listBody = el("div", { style: "display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;" });

    if (!subs.length) {
      listBody.replaceChildren(
        el("div", { style: "padding: 3rem; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: var(--radius);" },
          el("div", { style: "font-size: 2rem; margin-bottom: 0.5rem;" }, "📂"),
          "По этому домашнему заданию студенты пока не присылали решений.")
      );
    } else {
      for (const s of subs) {
        const fileUrl = `/api/uploads/homeworks/${encodeURIComponent(s.file_path)}`;
        const dateStr = s.submitted_at ? new Date(s.submitted_at).toLocaleString("ru-RU") : "—";

        let statusClass = "badge-gray";
        let statusText = "На проверке ⏳";
        if (s.status === "passed") { statusClass = "badge-success"; statusText = `Зачёт (${s.score}/${hw.max_score})`; }
        else if (s.status === "revise") { statusClass = "badge-warning"; statusText = "На доработке ⚠️"; }
        else if (s.status === "failed") { statusClass = "badge-danger"; statusText = `Незачёт (${s.score}/${hw.max_score})`; }

        const rowCard = el("div", {
          style: "padding: 1.25rem; border: 1px solid var(--line); border-radius: var(--radius); background: var(--card); display: flex; flex-direction: column; gap: 0.75rem;",
        });

        const topRow = el("div", { style: "display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.65rem;" },
          el("div", { style: "display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;" },
            el("span", { style: "font-weight: 700; font-size: 1.05rem;" }, s.user_name || "Студент"),
            el("span", { class: "badge badge-accent" }, s.group_name || "Без группы"),
            el("span", { class: "badge badge-gray" }, `Отправлено: ${dateStr}`)),
          el("div", { style: "display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;" },
            el("span", { class: `badge ${statusClass}`, style: "font-weight: 600;" }, statusText),
            el("a", {
              href: fileUrl,
              target: "_blank",
              rel: "noopener",
              class: "btn primary btn-sm",
              style: "text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem;",
            }, "📄 Открыть PDF"))
        );

        // Grading inline block
        const verdictSelect = el("select", { class: "form-select form-select-sm", style: "width: 160px;" },
          el("option", { value: "passed" }, "✅ Зачёт"),
          el("option", { value: "revise" }, "⚠️ На доработке"),
          el("option", { value: "failed" }, "❌ Незачёт"),
          el("option", { value: "pending" }, "⏳ На проверке")
        );
        verdictSelect.value = s.status || "passed";

        const scoreInput = el("input", {
          class: "form-input form-input-sm",
          type: "number",
          step: "0.5",
          min: "0",
          max: String(hw.max_score || 10),
          value: s.score || 0,
          style: "width: 80px;",
        });

        const commentTextarea = el("textarea", {
          class: "form-input form-input-sm",
          rows: "2",
          placeholder: "Комментарий преподавателя к работе студента...",
          style: "flex: 1; resize: vertical;",
        }, s.teacher_comment || "");

        const saveScoreBtn = el("button", {
          class: "btn primary btn-sm",
          type: "button",
          onclick: async () => {
            saveScoreBtn.disabled = true;
            saveScoreBtn.textContent = "Сохранение…";
            try {
              await json(`/api/admin/homeworks/submissions/${encodeURIComponent(s.id)}/review`, {
                method: "PUT",
                body: {
                  status: verdictSelect.value,
                  score: parseFloat(scoreInput.value) || 0,
                  teacher_comment: commentTextarea.value.trim(),
                },
              });
              saveScoreBtn.textContent = "✅ Сохранено!";
              saveScoreBtn.style.background = "#22c55e";
              setTimeout(() => {
                loadSubmissions();
              }, 600);
            } catch (err) {
              alert("Ошибка: " + err.message);
              saveScoreBtn.disabled = false;
              saveScoreBtn.textContent = "💾 Сохранить";
            }
          },
        }, "💾 Сохранить");

        const gradingForm = el("div", {
          style: "display: flex; gap: 0.75rem; align-items: flex-start; padding-top: 0.75rem; border-top: 1px dashed var(--line); flex-wrap: wrap;",
        },
          el("label", { style: "display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; font-weight: 600;" },
            "Вердикт:", verdictSelect),
          el("label", { style: "display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; font-weight: 600;" },
            `Балл (из ${hw.max_score}):`, scoreInput),
          el("label", { style: "display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; font-weight: 600; flex: 1; min-width: 250px;" },
            "Рецензия / Замечания:", commentTextarea),
          el("div", { style: "display: flex; align-items: flex-end; padding-top: 1.25rem;" },
            saveScoreBtn)
        );

        rowCard.append(topRow, gradingForm);
        listBody.append(rowCard);
      }
    }

    dlg.replaceChildren(
      el("div", { style: "padding: 1.5rem; max-width: 1050px; width: 95vw; max-height: 90vh; overflow-y: auto;" },
        el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--line); padding-bottom: 0.75rem;" },
          el("div", {},
            el("h2", { style: "margin: 0; font-size: 1.35rem;" }, `Проверка решений: ${hw.title}`),
            el("p", { class: "muted", style: "margin: 0.25rem 0 0;" }, `Максимальный балл: ${hw.max_score} · Всего сдали: ${subs.length} чел.`)),
          el("button", { class: "btn quiet btn-sm", type: "button", onclick: () => { dlg.close(); homeworksTab(parentContainer); } }, "✕ Закрыть")),
        listBody
      )
    );
  }

  loadSubmissions();
}

// ==========================================
// 8. ВКЛАДКА: ОБРАТНАЯ СВЯЗЬ (FEEDBACK)
// ==========================================

async function feedbackTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем отзывы…"));

  let filterStatus = "all";

  async function render() {
    let data;
    try {
      data = await json(`/api/admin/feedback?status=${filterStatus}`, { skipCache: true });
    } catch (err) {
      container.replaceChildren(el("p", { class: "form-error" }, `Ошибка: ${err.message}`));
      return;
    }

    const items = data.feedback || [];

    const toolbar = el("div", { class: "admin-controls-row", style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;" },
      el("div", { style: "display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;" },
        el("span", { style: "font-size: 0.85rem; font-weight: 600;" }, "Фильтр по статусу:"),
        el("select", {
          class: "form-select form-select-sm",
          onchange: (e) => { filterStatus = e.target.value; render(); },
        },
          el("option", { value: "all", selected: filterStatus === "all" }, "Все отзывы"),
          el("option", { value: "new", selected: filterStatus === "new" }, "Только новые"),
          el("option", { value: "read", selected: filterStatus === "read" }, "Прочитанные"),
          el("option", { value: "resolved", selected: filterStatus === "resolved" }, "Решённые")
        ),
        el("button", {
          class: "btn quiet btn-sm",
          type: "button",
          onclick: () => render(),
        }, "🔄 Обновить")
      ),
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, `Всего обращений: ${items.length}`)
    );

    const table = el("table", { class: "admin-table", style: "width: 100%; border-collapse: collapse;" },
      el("thead", {},
        el("tr", {},
          el("th", { style: "width: 130px;" }, "Дата"),
          el("th", { style: "width: 160px;" }, "Автор"),
          el("th", { style: "width: 110px;" }, "Тип"),
          el("th", {}, "Текст сообщения"),
          el("th", { style: "width: 130px;" }, "Статус"),
          el("th", { style: "width: 140px;" }, "Действие")
        )
      ),
      el("tbody", {},
        items.length === 0
          ? el("tr", {}, el("td", { colspan: 6, style: "text-align: center; padding: 2rem; color: var(--muted);" }, "Отзывов не найдено."))
          : items.map((fb) => {
              const dateStr = fb.created_at ? new Date(fb.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
              const author = fb.user_name || "Аноним";
              const typeLabels = { general: "Отзыв", bug: "Баг ⚠️", feature: "Идея 💡" };

              const statusSelect = el("select", {
                class: "form-select form-select-xs",
                style: "font-size: 0.8rem; padding: 0.2rem 0.4rem;",
                onchange: async (e) => {
                  const newStatus = e.target.value;
                  try {
                    await json(`/api/admin/feedback/${encodeURIComponent(fb.id)}`, {
                      method: "PUT",
                      body: { status: newStatus },
                    });
                    render();
                  } catch (err) {
                    alert("Ошибка: " + err.message);
                  }
                },
              },
                el("option", { value: "new", selected: fb.status === "new" }, "Новое"),
                el("option", { value: "read", selected: fb.status === "read" }, "Прочитано"),
                el("option", { value: "resolved", selected: fb.status === "resolved" }, "Решено")
              );

              return el("tr", {},
                el("td", { style: "font-size: 0.8rem; color: var(--muted); font-family: var(--font-mono);" }, dateStr),
                el("td", {},
                  el("div", { style: "font-weight: 600; font-size: 0.88rem;" }, author),
                  fb.user_email ? el("div", { style: "font-size: 0.75rem; color: var(--muted);" }, fb.user_email) : ""),
                el("td", {}, el("span", { class: `badge badge-${fb.type === "bug" ? "danger" : "normal"}` }, typeLabels[fb.type] || fb.type)),
                el("td", { style: "font-size: 0.88rem; line-height: 1.4; word-break: break-word;" }, fb.message),
                el("td", {}, statusSelect),
                el("td", {},
                  el("button", {
                    class: "btn quiet btn-xs",
                    type: "button",
                    onclick: async () => {
                      if (!confirm("Пометить как решённое?")) return;
                      await json(`/api/admin/feedback/${encodeURIComponent(fb.id)}`, { method: "PUT", body: { status: "resolved" } });
                      render();
                    },
                  }, "✓ Решено")
                )
              );
            })
      )
    );

    const wrapper = el("div", { class: "admin-section" },
      el("h2", { style: "margin: 0 0 1rem; font-size: 1.25rem;" }, "💬 Система обратной связи от студентов"),
      toolbar,
      el("div", { class: "table-responsive" }, table)
    );

    container.replaceChildren(wrapper);
  }

  render();
}

// ==========================================
// 9. ВКЛАДКА: ЗАЯВКИ НА КОНСУЛЬТАЦИИ
// ==========================================

async function requestsTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем заявки…"));

  let filterStatus = "all";

  async function render() {
    let data;
    try {
      data = await json(`/api/admin/consultations/requests?status=${filterStatus}`);
    } catch (err) {
      container.replaceChildren(el("p", { class: "form-error" }, `Ошибка: ${err.message}`));
      return;
    }

    const items = data.requests || [];

    const toolbar = el("div", { class: "admin-controls-row", style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;" },
      el("div", { style: "display: flex; gap: 0.5rem; align-items: center;" },
        el("span", { style: "font-size: 0.85rem; font-weight: 600;" }, "Фильтр заявок:"),
        el("select", {
          class: "form-select form-select-sm",
          onchange: (e) => { filterStatus = e.target.value; render(); },
        },
          el("option", { value: "all", selected: filterStatus === "all" }, "Все заявки"),
          el("option", { value: "pending", selected: filterStatus === "pending" }, "Ожидают решения (pending)"),
          el("option", { value: "approved", selected: filterStatus === "approved" }, "Одобренные"),
          el("option", { value: "rejected", selected: filterStatus === "rejected" }, "Отклонённые")
        )
      ),
      el("span", { class: "muted", style: "font-size: 0.85rem;" }, `Всего заявок: ${items.length}`)
    );

    const cardsList = el("div", { style: "display: flex; flex-direction: column; gap: 1rem;" });

    if (items.length === 0) {
      cardsList.append(el("p", { class: "muted", style: "padding: 2rem; text-align: center;" }, "Заявок в этой категории нет."));
    } else {
      items.forEach((req) => {
        const dateStr = req.created_at ? new Date(req.created_at).toLocaleString("ru-RU") : "—";
        const typeLabels = { consultation: "Консультация", extra_lecture: "Дополнительная лекция" };

        const commentInput = el("input", {
          type: "text",
          class: "form-input form-input-sm",
          placeholder: "Комментарий преподавателя (время, аудитория или ссылка)",
          value: req.teacher_comment || "",
          style: "flex: 1;",
        });

        const approveBtn = el("button", {
          class: "btn primary btn-sm",
          type: "button",
          onclick: async () => {
            approveBtn.disabled = true;
            try {
              await json(`/api/admin/consultations/requests/${encodeURIComponent(req.id)}`, {
                method: "PUT",
                body: { status: "approved", teacher_comment: commentInput.value.trim() },
              });
              render();
            } catch (err) {
              alert("Ошибка: " + err.message);
              approveBtn.disabled = false;
            }
          },
        }, "✓ Одобрить");

        const rejectBtn = el("button", {
          class: "btn quiet btn-sm",
          type: "button",
          onclick: async () => {
            if (!confirm("Отклонить заявку?")) return;
            try {
              await json(`/api/admin/consultations/requests/${encodeURIComponent(req.id)}`, {
                method: "PUT",
                body: { status: "rejected", teacher_comment: commentInput.value.trim() },
              });
              render();
            } catch (err) {
              alert("Ошибка: " + err.message);
            }
          },
        }, "✕ Отклонить");

        let statusBadge = "";
        if (req.status === "approved") statusBadge = el("span", { class: "badge badge-success" }, "Одобрено");
        else if (req.status === "rejected") statusBadge = el("span", { class: "badge badge-danger" }, "Отклонено");
        else statusBadge = el("span", { class: "badge badge-warning" }, "Ожидает решения");

        const card = el("div", { class: "card", style: "padding: 1.25rem; border: 1px solid var(--border);" },
          el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;" },
            el("div", { style: "display: flex; gap: 0.5rem; align-items: center;" },
              el("span", { class: "badge badge-topic" }, typeLabels[req.type] || req.type),
              el("strong", { style: "font-size: 1.05rem;" }, req.topic),
              el("span", { class: "badge badge-group-info" }, req.group_name || "—")
            ),
            statusBadge
          ),
          el("div", { style: "font-size: 0.85rem; color: var(--muted); margin-bottom: 0.5rem;" },
            `Студент: ${req.user_name} (${req.user_email || "без email"}) · Предпочтительный слот: `,
            el("strong", { style: "color: var(--accent);" }, req.preferred_time),
            ` · Подано: ${dateStr}`
          ),
          req.comment ? el("p", { style: "font-size: 0.9rem; margin: 0.35rem 0 0.75rem; background: rgba(255,255,255,0.02); padding: 0.5rem; border-radius: var(--radius-sm);" }, req.comment) : "",
          el("div", { style: "display: flex; gap: 0.5rem; align-items: center; padding-top: 0.75rem; border-top: 1px dashed var(--line); flex-wrap: wrap;" },
            commentInput,
            approveBtn,
            rejectBtn
          )
        );

        cardsList.append(card);
      });
    }

    container.replaceChildren(
      el("div", { class: "admin-section" },
        el("h2", { style: "margin: 0 0 1rem; font-size: 1.25rem;" }, "🤝 Заявки на проведение консультаций и доп. лекций"),
        toolbar,
        cardsList
      )
    );
  }

  render();
}

// ==========================================
// 10. ВКЛАДКА: ТИПОВИКИ И БАНК ВОПРОСОВ
// ==========================================

let activeTypovikId = "typ_1";
let activeTypovikSection = "config"; // "config" | "bank" | "submissions"

async function typoviksTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем типовые расчеты…"));

  let typoviksData;
  try {
    typoviksData = await json("/api/admin/typoviks");
  } catch (err) {
    container.replaceChildren(el("p", { class: "form-error" }, `Ошибка: ${err.message}`));
    return;
  }

  const typoviks = typoviksData.typoviks || [];
  if (typoviks.length === 0) {
    container.replaceChildren(el("p", { class: "muted" }, "Типовые расчеты не найдены."));
    return;
  }

  if (!typoviks.some((t) => t.id === activeTypovikId)) {
    activeTypovikId = typoviks[0].id;
  }

  const currentTypovik = typoviks.find((t) => t.id === activeTypovikId) || typoviks[0];

  // 1. Селектор 4 типовиков
  const typovikPills = el("div", { class: "grades-tabs-scroll", style: "display: flex; gap: 0.4rem; margin-bottom: 1rem; overflow-x: auto;" },
    typoviks.map((t) => el("button", {
      class: `grades-group-tab ${t.id === activeTypovikId ? "active" : ""}`,
      type: "button",
      onclick: () => { activeTypovikId = t.id; typoviksTab(container); },
    }, t.title || t.id))
  );

  // 2. Внутренние разделы выбранного типовика
  const subNav = el("div", { class: "admin-segmented-nav", style: "margin-bottom: 1.25rem;", role: "tablist" },
    el("button", {
      class: `admin-nav-item ${activeTypovikSection === "config" ? "active" : ""}`,
      type: "button",
      onclick: () => { activeTypovikSection = "config"; typoviksTab(container); },
    }, "⚙️ Конфигурация варианта"),
    el("button", {
      class: `admin-nav-item ${activeTypovikSection === "bank" ? "active" : ""}`,
      type: "button",
      onclick: () => { activeTypovikSection = "bank"; typoviksTab(container); },
    }, "🗄️ Банк задач типовика"),
    el("button", {
      class: `admin-nav-item ${activeTypovikSection === "submissions" ? "active" : ""}`,
      type: "button",
      onclick: () => { activeTypovikSection = "submissions"; typoviksTab(container); },
    }, "📥 Сданные работы и проверка")
  );

  const contentArea = el("div", { id: "typovik-section-content" });

  const addTypovikBtn = el("button", {
    class: "btn quiet btn-sm",
    type: "button",
    onclick: () => openCreateTypovikModal(() => typoviksTab(container)),
  }, "+ Новый типовой расчет");

  container.replaceChildren(
    el("div", { style: "display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;" },
      el("div", { style: "flex: 1; min-width: 260px;" },
        el("div", { style: "font-size: 0.85rem; color: var(--muted); margin-bottom: 0.4rem;" }, "Выберите типовой расчет курса:"),
        typovikPills
      ),
      addTypovikBtn
    ),
    subNav,
    contentArea
  );

  if (activeTypovikSection === "bank") {
    renderTypovikBank(contentArea, currentTypovik);
  } else if (activeTypovikSection === "submissions") {
    renderTypovikSubmissions(contentArea, currentTypovik);
  } else {
    renderTypovikConfig(contentArea, currentTypovik, () => typoviksTab(container));
  }
}

async function renderTypovikConfig(container, typ, onRefresh) {
  // Загружаем задачи банка для этого типовика, чтобы увидеть доступные темы
  let bank;
  try {
    bank = await json(`/api/admin/question-bank?typovik_id=${encodeURIComponent(typ.id)}`);
  } catch (err) {
    container.replaceChildren(el("p", { class: "form-error" }, `Ошибка: ${err.message}`));
    return;
  }

  const items = bank.items || [];
  const topicsMap = new Map();
  for (const it of items) {
    const bId = it.block_id || "general";
    if (!topicsMap.has(bId)) {
      topicsMap.set(bId, { title: it.block_title || bId, count: 0 });
    }
    topicsMap.get(bId).count++;
  }

  const curConfig = Array.isArray(typ.blocks_config) ? [...typ.blocks_config] : [];
  // Убеждаемся, что все существующие в банке темы есть в конфигурации (или добавляем)
  for (const [bId, bInfo] of topicsMap.entries()) {
    if (!curConfig.some((c) => c.block_id === bId)) {
      curConfig.push({ block_id: bId, block_title: bInfo.title, questions_count: 1 });
    }
  }

  const deadlineInput = el("input", { type: "text", class: "form-input form-input-sm", value: typ.deadline || "", placeholder: "2026-12-15 23:59" });
  const maxScoreInput = el("input", { type: "number", class: "form-input form-input-sm", value: typ.max_score || 25, min: 1, style: "width: 100px;" });
  const groupInput = el("input", { type: "text", class: "form-input form-input-sm", value: typ.group_name || "all", placeholder: "all или M3101, M3102" });

  const rowsContainer = el("div", { style: "display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem;" });

  curConfig.forEach((cfgItem) => {
    const available = topicsMap.get(cfgItem.block_id)?.count || 0;
    const countInput = el("input", {
      type: "number",
      class: "form-input form-input-sm",
      value: cfgItem.questions_count || 1,
      min: 0,
      max: 20,
      style: "width: 80px;",
    });
    countInput.oninput = () => {
      cfgItem.questions_count = parseInt(countInput.value, 10) || 0;
    };

    const blockTitleInput = el("input", {
      type: "text",
      class: "form-input form-input-sm",
      value: cfgItem.block_title || cfgItem.block_id,
      style: "flex: 1;",
    });
    blockTitleInput.oninput = () => {
      cfgItem.block_title = blockTitleInput.value.trim();
    };

    const row = el("div", { class: "card", style: "padding: 0.85rem 1.15rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid var(--border);" },
      el("div", { style: "display: flex; align-items: center; gap: 0.75rem; flex: 1;" },
        el("span", { class: "badge badge-topic" }, cfgItem.block_id),
        blockTitleInput,
        el("span", { class: "muted", style: "font-size: 0.82rem; white-space: nowrap;" }, `(в банке: ${available} задач)`)
      ),
      el("div", { style: "display: flex; align-items: center; gap: 0.5rem;" },
        el("span", { style: "font-size: 0.85rem; color: var(--muted);" }, "Брать в вариант:"),
        countInput,
        el("span", { style: "font-size: 0.85rem;" }, "задач")
      )
    );

    rowsContainer.append(row);
  });

  const isPub = Boolean(typ.is_published);
  const publishBtn = el("button", {
    class: `btn btn-sm btn-visibility-toggle ${isPub ? "is-visible" : "is-hidden"}`,
    type: "button",
    onclick: async () => {
      publishBtn.disabled = true;
      try {
        await json(`/api/admin/typoviks/${encodeURIComponent(typ.id)}`, {
          method: "PUT",
          body: { is_published: isPub ? 0 : 1 },
        });
        onRefresh();
      } catch (e) {
        alert("Ошибка: " + e.message);
        publishBtn.disabled = false;
      }
    },
  }, isPub ? "✅ Выложено студентам" : "🔒 Черновик (не выложено)");

  const saveBtn = el("button", {
    class: "btn primary btn-sm",
    type: "button",
    onclick: async () => {
      saveBtn.disabled = true;
      try {
        const payload = {
          title: typ.title,
          topic: typ.topic,
          group_name: groupInput.value.trim() || "all",
          deadline: deadlineInput.value.trim(),
          max_score: parseFloat(maxScoreInput.value) || 25,
          blocks_config: curConfig.filter((c) => c.questions_count > 0),
          is_published: typ.is_published,
        };
        await json(`/api/admin/typoviks/${encodeURIComponent(typ.id)}`, { method: "PUT", body: payload });
        alert("Конфигурация типового расчета успешно сохранена!");
        onRefresh();
      } catch (err) {
        alert("Ошибка сохранения: " + err.message);
      } finally {
        saveBtn.disabled = false;
      }
    },
  }, "💾 Сохранить конфигурацию");

  const generateBtn = el("button", {
    class: "btn accent btn-sm",
    style: "background: var(--accent); color: var(--ink); font-weight: 600;",
    type: "button",
    onclick: async () => {
      if (!confirm(`Сгенерировать и выложить персональные варианты по типовику «${typ.title}» для всех целевых студентов? Работа автоматически станет доступна студентам.`)) return;
      generateBtn.disabled = true;
      generateBtn.textContent = "Генерация вариантов…";
      try {
        const res = await json(`/api/admin/typoviks/${encodeURIComponent(typ.id)}/generate`, { method: "POST" });
        alert(`Успешно сгенерировано ${res.generatedCount} уникальных вариантов! Работа открыта для студентов.`);
        onRefresh();
      } catch (err) {
        alert("Ошибка генерации вариантов: " + err.message);
      } finally {
        generateBtn.disabled = false;
        generateBtn.textContent = "🎲 Сгенерировать и выложить варианты студентам";
      }
    },
  }, "🎲 Сгенерировать и выложить варианты студентам");

  const settingsCard = el("div", { class: "card", style: "padding: 1.25rem; border: 1px solid var(--border); margin-bottom: 1.25rem;" },
    el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid var(--line); padding-bottom: 0.75rem; flex-wrap: wrap; gap: 0.75rem;" },
      el("div", { style: "display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;" },
        el("h3", { style: "margin: 0; font-size: 1.15rem;" }, typ.title),
        el("span", { class: `badge ${isPub ? "badge-success" : "badge-gray"}`, style: "font-weight: 600;" },
          isPub ? "Опубликовано ✅" : "Черновик 🔒")
      ),
      el("div", { style: "display: flex; gap: 0.5rem; flex-wrap: wrap;" }, publishBtn, saveBtn, generateBtn)
    ),
    el("div", { style: "display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem;" },
      el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Дедлайн"), deadlineInput),
      el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Максимальный балл"), maxScoreInput),
      el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Группы (all для всех)"), groupInput)
    ),
    el("div", { style: "margin-top: 1.25rem;" },
      el("h4", { style: "margin: 0 0 0.5rem 0; font-size: 0.95rem; color: var(--accent);" }, "Правила выборки задач в вариант по темам:"),
      rowsContainer
    )
  );

  container.replaceChildren(settingsCard);
}

function openCreateTypovikModal(onCreated) {
  const dlg = el("dialog", { class: "auth-modal-dialog" });
  document.body.append(dlg);

  const titleInput = el("input", { type: "text", class: "form-input", placeholder: "Типовой расчет №5: Теория автоматов", required: true });
  const topicInput = el("input", { type: "text", class: "form-input", placeholder: "Теория автоматов", required: true });
  const groupInput = el("input", { type: "text", class: "form-input", placeholder: "all или M3101", value: "all" });
  const deadlineInput = el("input", { type: "text", class: "form-input", placeholder: "2026-12-25 23:59", value: "" });
  const scoreInput = el("input", { type: "number", class: "form-input", value: 20, min: 1, max: 100 });

  const form = el("form", {},
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Название работы"), titleInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Тема / раздел"), topicInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Целевые группы (all для всех)"), groupInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Срок сдачи (дедлайн)"), deadlineInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Максимальный балл"), scoreInput),
    el("div", { style: "display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;" },
      el("button", { class: "btn quiet btn-sm", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Отмена"),
      el("button", { class: "btn primary btn-sm", type: "submit" }, "Создать работу")
    )
  );

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      title: titleInput.value.trim(),
      topic: topicInput.value.trim(),
      group_name: groupInput.value.trim() || "all",
      deadline: deadlineInput.value.trim(),
      max_score: parseFloat(scoreInput.value) || 20,
      is_published: 1,
      blocks_config: [],
    };
    try {
      const res = await json("/api/admin/typoviks", { method: "POST", body: payload });
      if (res.typovik?.id) activeTypovikId = res.typovik.id;
      dlg.close();
      dlg.remove();
      if (onCreated) onCreated();
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
  };

  const box = el("div", { class: "auth-modal-box", style: "max-width: 500px;" },
    el("h3", { class: "auth-modal-title", style: "margin-bottom: 1rem;" }, "➕ Новый типовой расчет"),
    form
  );
  dlg.replaceChildren(box);
  dlg.showModal();
}

async function renderTypovikBank(container, typ) {
  let bank;
  try {
    bank = await json(`/api/admin/question-bank?typovik_id=${encodeURIComponent(typ.id)}`);
  } catch (err) {
    container.replaceChildren(el("p", { class: "form-error" }, `Ошибка: ${err.message}`));
    return;
  }

  const items = bank.items || [];

  const addBtn = el("button", {
    class: "btn primary btn-sm",
    type: "button",
    onclick: () => openQuestionModal({ typovik_id: typ.id }, () => renderTypovikBank(container, typ)),
  }, `+ Добавить вопрос в банк (${typ.title})`);

  const headerRow = el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;" },
    el("h3", { style: "margin: 0; font-size: 1.15rem;" }, `Банк задач: ${typ.title} (${items.length} задач)`),
    addBtn
  );

  const listEl = el("div", { style: "display: flex; flex-direction: column; gap: 0.85rem;" });
  if (items.length === 0) {
    listEl.append(el("p", { class: "muted", style: "padding: 2rem; text-align: center;" }, "В банке этого типовика пока нет задач. Добавьте задачи."));
  } else {
    items.forEach((item) => {
      const card = el("div", { class: "card", style: "padding: 1rem 1.25rem; border: 1px solid var(--border);" },
        el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;" },
          el("div", { style: "display: flex; gap: 0.5rem; align-items: center;" },
            el("span", { class: "badge badge-topic" }, `[${item.block_id}] ${item.block_title}`),
            el("strong", { style: "font-size: 1rem;" }, item.title)
          ),
          el("div", { style: "display: flex; gap: 0.5rem; align-items: center;" },
            el("span", { class: "badge badge-score" }, `${item.max_score} pts`),
            el("button", { class: "btn quiet btn-xs", onclick: () => openQuestionModal(item, () => renderTypovikBank(container, typ)) }, "✏️"),
            el("button", {
              class: "btn quiet btn-xs",
              onclick: async () => {
                if (!confirm("Удалить задачу из банка?")) return;
                await json(`/api/admin/question-bank/${encodeURIComponent(item.id)}`, { method: "DELETE" });
                renderTypovikBank(container, typ);
              },
            }, "🗑️")
          )
        ),
        el("div", { class: "katex-content", style: "font-size: 0.88rem; color: var(--muted); line-height: 1.4;" }, item.content)
      );
      listEl.append(card);
    });
  }

  container.replaceChildren(headerRow, listEl);

  if (window.renderMathInElement) {
    try {
      window.renderMathInElement(container, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
        ],
        throwOnError: false,
      });
    } catch {}
  }
}

function openQuestionModal(item, onSave) {
  const dlg = el("dialog", { class: "auth-modal-dialog" });
  document.body.append(dlg);

  const typovikIdInput = el("input", { type: "text", class: "form-input", value: item?.typovik_id || activeTypovikId, readonly: true, style: "opacity: 0.7;" });
  const blockIdInput = el("input", { type: "text", class: "form-input", placeholder: "t1_rel / t2_conn", value: item?.block_id || "general", required: true });
  const blockTitleInput = el("input", { type: "text", class: "form-input", placeholder: "Бинарные отношения", value: item?.block_title || "Тема задач", required: true });
  const titleInput = el("input", { type: "text", class: "form-input", placeholder: "Название задачи", value: item?.title || "", required: true });
  const contentInput = el("textarea", { class: "form-input", rows: 5, placeholder: "Условие задачи с формулами KaTeX ($...$)", value: item?.content || "", required: true, style: "resize: vertical;" });
  const scoreInput = el("input", { type: "number", class: "form-input", value: item?.max_score || 5, min: 1, max: 50 });

  const form = el("form", {},
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Типовой расчет (ID)"), typovikIdInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Идентификатор темы/блока (ID)"), blockIdInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Название темы"), blockTitleInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Заголовок задачи"), titleInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Условие задачи"), contentInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Макс. балл за задачу"), scoreInput),
    el("div", { style: "display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;" },
      el("button", { class: "btn quiet btn-sm", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Отмена"),
      el("button", { class: "btn primary btn-sm", type: "submit" }, "Сохранить")
    )
  );

  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      typovik_id: typovikIdInput.value.trim(),
      block_id: blockIdInput.value.trim(),
      block_title: blockTitleInput.value.trim(),
      title: titleInput.value.trim(),
      content: contentInput.value.trim(),
      max_score: parseFloat(scoreInput.value) || 5,
    };
    try {
      if (item && item.id) {
        await json(`/api/admin/question-bank/${encodeURIComponent(item.id)}`, { method: "PUT", body: payload });
      } else {
        await json("/api/admin/question-bank", { method: "POST", body: payload });
      }
      dlg.close();
      dlg.remove();
      if (onSave) onSave();
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
  };

  const box = el("div", { class: "auth-modal-box", style: "max-width: 560px;" },
    el("h3", { class: "auth-modal-title", style: "margin-bottom: 1rem;" }, item?.id ? "Редактировать задачу банка" : "Новая задача в банк"),
    form
  );

  dlg.replaceChildren(box);
  dlg.showModal();
}

async function renderTypovikSubmissions(container, typ) {
  let data;
  try {
    data = await json(`/api/admin/typoviks/${encodeURIComponent(typ.id)}/submissions`);
  } catch (err) {
    container.replaceChildren(el("p", { class: "form-error" }, `Ошибка: ${err.message}`));
    return;
  }

  const subs = data.submissions || [];

  const headerRow = el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;" },
    el("h3", { style: "margin: 0; font-size: 1.15rem;" }, `Сданные работы студентов (${subs.length})`)
  );

  const listEl = el("div", { style: "display: flex; flex-direction: column; gap: 1rem;" });
  if (subs.length === 0) {
    listEl.append(el("p", { class: "muted", style: "padding: 2.5rem; text-align: center;" }, "Сданных работ по этому типовику пока нет."));
  } else {
    subs.forEach((s) => {
      const dateStr = s.submitted_at ? new Date(s.submitted_at).toLocaleString("ru-RU") : "—";

      let previewElement;
      if (s.file_type === "image" || s.file_type === "images" || (Array.isArray(s.images) && s.images.length > 0)) {
        const imgs = (Array.isArray(s.images) && s.images.length > 0) ? s.images : [s.file_path];
        previewElement = el("div", { style: "margin-top: 0.5rem;" },
          el("div", { style: "font-size: 0.8rem; color: var(--muted); margin-bottom: 0.35rem;" }, `📷 Прикрепленные фотографии (${imgs.length} шт.):`),
          el("div", { class: "submission-images-grid" },
            imgs.map((src) => {
              const fullUrl = src.startsWith("/") ? src : `/api/uploads/images/${encodeURIComponent(src)}`;
              return el("img", {
                src: fullUrl,
                class: "sub-image-thumb",
                alt: "Фото решения",
                title: "Нажмите для просмотра в полном размере",
                onclick: () => window.open(fullUrl, "_blank"),
              });
            })
          )
        );
      } else {
        const fileUrl = `/api/uploads/homeworks/${encodeURIComponent(s.file_path)}`;
        previewElement = el("div", { style: "margin-top: 0.5rem;" },
          el("a", { href: fileUrl, target: "_blank", rel: "noopener", class: "btn btn-sm" }, `📄 Открыть PDF (${s.file_name || "solution.pdf"})`)
        );
      }

      const verdictSelect = el("select", { class: "form-select form-select-sm" },
        el("option", { value: "passed", selected: s.status === "passed" }, "Зачёт (passed)"),
        el("option", { value: "pending", selected: s.status === "pending" }, "На проверке (pending)"),
        el("option", { value: "revise", selected: s.status === "revise" }, "Доработка (revise)"),
        el("option", { value: "failed", selected: s.status === "failed" }, "Незачёт (failed)")
      );

      const scoreInput = el("input", { type: "number", class: "form-input form-input-sm", value: s.score || 0, max: typ.max_score, min: 0, style: "width: 80px;" });
      const commentInput = el("input", { type: "text", class: "form-input form-input-sm", placeholder: "Комментарий преподавателя", value: s.teacher_comment || "", style: "flex: 1;" });

      const saveBtn = el("button", {
        class: "btn primary btn-sm",
        type: "button",
        onclick: async () => {
          saveBtn.disabled = true;
          try {
            await json(`/api/admin/typoviks/submissions/${encodeURIComponent(s.id)}/review`, {
              method: "PUT",
              body: {
                status: verdictSelect.value,
                score: parseFloat(scoreInput.value) || 0,
                teacher_comment: commentInput.value.trim(),
              },
            });
            saveBtn.textContent = "✅ Сохранено";
            setTimeout(() => {
              saveBtn.disabled = false;
              saveBtn.textContent = "💾 Сохранить оценку";
            }, 1000);
          } catch (err) {
            alert("Ошибка сохранения: " + err.message);
            saveBtn.disabled = false;
          }
        },
      }, "💾 Сохранить оценку");

      const card = el("div", { class: "card", style: "padding: 1.25rem; border: 1px solid var(--border);" },
        el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;" },
          el("div", { style: "display: flex; align-items: center; gap: 0.6rem;" },
            el("strong", { style: "font-size: 1.05rem;" }, s.user_name || "Студент"),
            el("span", { class: "badge badge-group-info" }, s.group_name || "—"),
            el("span", { class: `badge ${s.status === "passed" ? "badge-score" : "badge-deadline"}` }, s.status)
          ),
          el("span", { style: "font-size: 0.82rem; color: var(--muted);" }, `Сдано: ${dateStr}`)
        ),
        previewElement,
        el("div", { style: "display: flex; gap: 0.6rem; align-items: center; padding-top: 0.85rem; margin-top: 0.85rem; border-top: 1px dashed var(--line); flex-wrap: wrap;" },
          verdictSelect,
          el("span", { style: "font-size: 0.85rem;" }, `Балл / ${typ.max_score}:`),
          scoreInput,
          commentInput,
          saveBtn
        )
      );

      listEl.append(card);
    });
  }

  container.replaceChildren(headerRow, listEl);
}

// ==========================================
// 11. ВКЛАДКА: УПРАВЛЕНИЕ РАСПИСАНИЕМ
// ==========================================

async function scheduleTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем расписание…"));

  let eventsData;
  try {
    eventsData = await json("/api/schedule");
  } catch (err) {
    container.replaceChildren(el("p", { class: "form-error" }, `Ошибка: ${err.message}`));
    return;
  }

  const events = eventsData.events || [];

  const addBtn = el("button", {
    class: "btn primary btn-sm",
    type: "button",
    onclick: () => openScheduleEventModal(null, () => scheduleTab(container)),
  }, "+ Добавить событие в расписание");

  const headerRow = el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;" },
    el("h2", { style: "margin: 0; font-size: 1.25rem;" }, `📅 Управление расписанием (${events.length} событий)`),
    addBtn
  );

  const table = el("table", { class: "admin-table", style: "width: 100%; border-collapse: collapse;" },
    el("thead", {},
      el("tr", {},
        el("th", { style: "width: 140px;" }, "Время"),
        el("th", { style: "width: 100px;" }, "Тип"),
        el("th", {}, "Название"),
        el("th", { style: "width: 140px;" }, "Аудитория/URL"),
        el("th", { style: "width: 140px;" }, "Преподаватель"),
        el("th", { style: "width: 110px;" }, "Группы"),
        el("th", { style: "width: 100px;" }, "Действия")
      )
    ),
    el("tbody", {},
      events.length === 0
        ? el("tr", {}, el("td", { colspan: 7, style: "text-align: center; padding: 2rem; color: var(--muted);" }, "Событий в расписании пока нет."))
        : events.map((ev) => {
            const timeStr = `${ev.starts_at ? ev.starts_at.slice(0, 16).replace("T", " ") : "—"}`;
            let groupsLabel = "Все группы";
            if (ev.groups && ev.groups !== "all") {
              try {
                const arr = JSON.parse(ev.groups);
                groupsLabel = Array.isArray(arr) ? arr.join(", ") : ev.groups;
              } catch {
                groupsLabel = ev.groups;
              }
            }

            return el("tr", {},
              el("td", { style: "font-size: 0.8rem; font-family: var(--font-mono);" }, timeStr),
              el("td", {}, el("span", { class: "badge" }, ev.type || "lecture")),
              el("td", { style: "font-weight: 600;" }, ev.title),
              el("td", { style: "font-size: 0.85rem;" }, ev.location || "—"),
              el("td", { style: "font-size: 0.85rem;" }, ev.teacher_name || "—"),
              el("td", { style: "font-size: 0.85rem;" }, groupsLabel),
              el("td", {},
                el("button", { class: "btn quiet btn-xs", onclick: () => openScheduleEventModal(ev, () => scheduleTab(container)) }, "✏️"),
                el("button", {
                  class: "btn quiet btn-xs",
                  onclick: async () => {
                    if (!confirm(`Удалить событие «${ev.title}»?`)) return;
                    await json(`/api/admin/schedule/${encodeURIComponent(ev.id)}`, { method: "DELETE" });
                    scheduleTab(container);
                  },
                }, "🗑️")
              )
            );
          })
    )
  );

  container.replaceChildren(
    el("div", { class: "admin-section" },
      headerRow,
      el("div", { class: "table-responsive" }, table)
    )
  );
}

function openScheduleEventModal(ev, onSave) {
  const dlg = el("dialog", { class: "auth-modal-dialog" });
  document.body.append(dlg);

  const titleInput = el("input", { type: "text", class: "form-input", placeholder: "Лекция: Теория графов", value: ev?.title || "", required: true });
  const typeSelect = el("select", { class: "form-input" },
    el("option", { value: "lecture", selected: ev?.type === "lecture" }, "Лекция"),
    el("option", { value: "practice", selected: ev?.type === "practice" }, "Практика"),
    el("option", { value: "extra_lecture", selected: ev?.type === "extra_lecture" }, "Дополнительная лекция"),
    el("option", { value: "consultation", selected: ev?.type === "consultation" }, "Консультация")
  );
  const startsInput = el("input", { type: "text", class: "form-input", placeholder: "2026-10-15 10:00", value: ev?.starts_at ? ev.starts_at.slice(0, 16).replace("T", " ") : "", required: true });
  const endsInput = el("input", { type: "text", class: "form-input", placeholder: "2026-10-15 11:30", value: ev?.ends_at ? ev.ends_at.slice(0, 16).replace("T", " ") : "" });
  const locationInput = el("input", { type: "text", class: "form-input", placeholder: "Ауд. 1404 или Ссылка Zoom", value: ev?.location || "" });
  const teacherInput = el("input", { type: "text", class: "form-input", placeholder: "Поляков В.И.", value: ev?.teacher_name || "" });
  const groupsInput = el("input", { type: "text", class: "form-input", placeholder: "all или M3101, M3102", value: ev?.groups || "all" });
  const descInput = el("textarea", { class: "form-input", rows: 3, placeholder: "Описание, материалы к паре...", value: ev?.description || "" });

  const form = el("form", {},
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Название события"), titleInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Тип занятия"), typeSelect),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Время начала (ГГГГ-ММ-ДД ЧЧ:ММ)"), startsInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Время окончания"), endsInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Место проведения (аудитория или ссылка)"), locationInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "ФИО преподавателя"), teacherInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Группы (all для всех)"), groupsInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Описание"), descInput),
    el("div", { style: "display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;" },
      el("button", { class: "btn quiet btn-sm", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Отмена"),
      el("button", { class: "btn primary btn-sm", type: "submit" }, "Сохранить")
    )
  );

  form.onsubmit = async (e) => {
    e.preventDefault();
    let startsIso = startsInput.value.trim().replace(" ", "T");
    let endsIso = endsInput.value.trim().replace(" ", "T");

    const payload = {
      title: titleInput.value.trim(),
      type: typeSelect.value,
      starts_at: startsIso,
      ends_at: endsIso,
      location: locationInput.value.trim(),
      teacher_name: teacherInput.value.trim(),
      groups: groupsInput.value.trim() || "all",
      description: descInput.value.trim(),
    };

    try {
      if (ev && ev.id) {
        await json(`/api/admin/schedule/${encodeURIComponent(ev.id)}`, { method: "PUT", body: payload });
      } else {
        await json("/api/admin/schedule", { method: "POST", body: payload });
      }
      dlg.close();
      dlg.remove();
      if (onSave) onSave();
    } catch (err) {
      alert("Ошибка: " + err.message);
    }
  };

  const box = el("div", { class: "auth-modal-box", style: "max-width: 560px;" },
    el("h3", { class: "auth-modal-title", style: "margin-bottom: 1rem;" }, ev ? "Редактировать событие" : "Новое событие расписания"),
    form
  );

  dlg.replaceChildren(box);
  dlg.showModal();
}

// ==========================================
// 12. ВКЛАДКА: ЭЛЕКТРОННЫЙ ЖУРНАЛ ОЦЕНОК
// ==========================================

async function gradesTab(container) {
  container.replaceChildren(el("p", { class: "muted" }, "Загружаем электронный журнал оценок…"));

  let curGroup = "all";

  async function render() {
    let sheet;
    try {
      sheet = await json(`/api/grades?group=${curGroup}`);
    } catch (err) {
      container.replaceChildren(el("p", { class: "form-error" }, `Ошибка: ${err.message}`));
      return;
    }

    const groups = sheet.groups || ["all"];
    const columns = sheet.columns || [];
    const rows = sheet.rows || [];

    const groupTabs = el("div", { class: "grades-tabs-scroll", style: "display: flex; gap: 0.35rem; margin-bottom: 1rem; overflow-x: auto;" },
      groups.map((g) => el("button", {
        class: `grades-group-tab ${g === curGroup ? "active" : ""}`,
        type: "button",
        onclick: () => { curGroup = g; render(); },
      }, g === "all" ? "Весь поток" : g))
    );

    const addColBtn = el("button", {
      class: "btn primary btn-sm",
      type: "button",
      onclick: () => openAddColumnModal(render),
    }, "+ Добавить столбец");

    const table = el("table", { class: "grades-spreadsheet-table admin-grades-table" },
      el("thead", {},
        el("tr", {},
          el("th", { class: "col-fixed-num" }, "#"),
          el("th", { class: "col-fixed-name" }, "Студент"),
          el("th", { class: "col-fixed-group" }, "Группа"),
          columns.map((c) => el("th", {
            class: `col-task ${c.is_calculated ? "col-calculated" : ""}`,
            title: c.is_calculated ? `Формула: ${c.formula || "SUM"}` : `Макс: ${c.max}`,
          },
            el("div", { class: "col-header-wrap" },
              el("span", { class: "col-title" }, c.title),
              el("button", {
                class: "col-settings-btn",
                title: "Настроить столбец",
                type: "button",
                onclick: (e) => {
                  e.stopPropagation();
                  openEditColumnModal(c, render);
                },
              }, "⚙️")
            ),
            el("div", { style: "display: flex; align-items: center; justify-content: center; gap: 0.35rem; margin-top: 0.2rem;" },
              el("span", { class: "col-max" }, `${c.max} pts`),
              c.is_calculated ? el("span", { class: "col-fx-badge", title: c.formula || "SUM" }, "fx") : null
            )
          )),
          el("th", { class: "col-total" }, "Итог")
        )
      ),
      el("tbody", {},
        rows.map((row, idx) => {
          return el("tr", { "data-user-id": row.userId },
            el("td", { class: "cell-num" }, idx + 1),
            el("td", { class: "cell-name" }, el("span", { class: "student-name-text" }, row.name)),
            el("td", { class: "cell-group" }, row.group),
            columns.map((col) => {
              const val = row.scores[col.key] !== undefined ? row.scores[col.key] : "";

              if (col.is_calculated) {
                return el("td", {
                  class: "cell-score cell-calculated",
                  "data-col": col.key,
                  "data-user": row.userId,
                  title: `Вычисляется по формуле: ${col.formula || "SUM"}`,
                }, val !== "" ? String(val) : "0");
              }

              const cell = el("td", {
                class: "cell-score editable",
                contenteditable: "true",
                spellcheck: "false",
                "data-col": col.key,
                "data-user": row.userId,
              }, val !== "" ? String(val) : "—");

              let initVal = "";
              cell.onfocus = () => {
                initVal = cell.textContent.trim();
                if (initVal === "—") cell.textContent = "";
                cell.classList.add("editing");
              };
              cell.onkeydown = (e) => {
                if (e.key === "Enter") { e.preventDefault(); cell.blur(); }
                else if (e.key === "Escape") { cell.textContent = initVal; cell.blur(); }
              };
              cell.onblur = async () => {
                cell.classList.remove("editing");
                let text = cell.textContent.trim();
                if (text === "" || text === "—") { text = "0"; cell.textContent = "—"; }
                const scoreNum = parseFloat(text);
                if (isNaN(scoreNum)) { cell.textContent = initVal; return; }
                cell.textContent = scoreNum;
                if (String(scoreNum) === initVal) return;

                cell.classList.add("saving");
                try {
                  await json("/api/admin/grades", {
                    method: "PUT",
                    body: { user_id: row.userId, column_key: col.key, score: scoreNum },
                  });
                  cell.classList.remove("saving");
                  cell.classList.add("saved");
                  setTimeout(() => cell.classList.remove("saved"), 800);
                  // Recalculate row total in DOM
                  let total = 0;
                  const tr = cell.closest("tr");
                  tr.querySelectorAll(".cell-score:not(.cell-calculated)").forEach((c) => {
                    const v = parseFloat(c.textContent.trim());
                    if (!isNaN(v)) total += v;
                  });
                  const totEl = tr.querySelector(".cell-total");
                  if (totEl) totEl.innerHTML = `<strong>${total}</strong>`;
                } catch {
                  cell.classList.remove("saving");
                  cell.classList.add("error");
                }
              };

              return cell;
            }),
            el("td", { class: "cell-total" }, el("strong", {}, row.total))
          );
        })
      )
    );

    container.replaceChildren(
      el("div", { class: "admin-section" },
        el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;" },
          el("div", {},
            el("h2", { style: "margin: 0; font-size: 1.25rem;" }, "📊 Электронный журнал успеваемости потока"),
            el("p", { class: "muted", style: "font-size: 0.82rem; margin: 0.2rem 0 0;" }, "Поддержка вычисляемых формул (SUM, AVG), редактирования колонок и Google Sheets таблицы")
          ),
          el("div", { style: "display: flex; align-items: center; gap: 0.75rem;" },
            addColBtn,
            el("span", { class: "badge badge-warning", style: "font-size: 0.78rem;" }, "Клик по ячейке для ввода балла (автосохранение onBlur)")
          )
        ),
        groupTabs,
        el("div", { class: "grades-sheet-wrapper", style: "max-height: 75vh; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-sm);" }, table)
      )
    );
  }

  render();
}

function openAddColumnModal(onSave) {
  const dlg = el("dialog", { class: "auth-modal-dialog" });
  document.body.append(dlg);

  const titleInput = el("input", { type: "text", class: "form-input", placeholder: "Контрольная 2 или Лаб. 3", required: true });
  const keyInput = el("input", { type: "text", class: "form-input", placeholder: "kr_2 или lab_3", required: true });
  const maxScoreInput = el("input", { type: "number", class: "form-input", value: 10, min: 1, max: 100 });
  const isCalcSelect = el("select", { class: "form-input" },
    el("option", { value: "0" }, "Обычный числовой столбец"),
    el("option", { value: "1" }, "Вычисляемый столбец (формула)")
  );
  const formulaInput = el("input", { type: "text", class: "form-input", placeholder: "SUM или SUM(kr_1, kr_2) или AVG(hw_1, hw_2)", value: "SUM" });
  const formulaGroup = el("div", { class: "form-group", style: "display: none;" },
    el("label", { class: "form-label" }, "Формула расчета"),
    formulaInput,
    el("p", { class: "form-help", style: "font-size: 0.78rem; color: var(--muted); margin: 0.2rem 0 0;" }, "Доступно: SUM (все баллы), AVG (среднее), SUM(c1, c2), AVG(c1, c2)")
  );

  titleInput.oninput = () => {
    if (!keyInput.dataset.touched) {
      const translit = titleInput.value.toLowerCase().replace(/[^a-z0-9а-яё]+/g, "_").slice(0, 15);
      keyInput.value = translit;
    }
  };
  keyInput.onfocus = () => { keyInput.dataset.touched = "true"; };

  isCalcSelect.onchange = () => {
    formulaGroup.style.display = isCalcSelect.value === "1" ? "block" : "none";
  };

  const form = el("form", {},
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Название столбца"), titleInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Идентификатор (ключ, англ.)"), keyInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Максимальный балл"), maxScoreInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Тип столбца"), isCalcSelect),
    formulaGroup,
    el("div", { style: "display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;" },
      el("button", { class: "btn quiet btn-sm", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Отмена"),
      el("button", { class: "btn primary btn-sm", type: "submit" }, "Создать столбец")
    )
  );

  form.onsubmit = async (e) => {
    e.preventDefault();
    const isCalc = isCalcSelect.value === "1";
    const payload = {
      key: keyInput.value.trim(),
      title: titleInput.value.trim(),
      max_score: parseFloat(maxScoreInput.value) || 10,
      is_calculated: isCalc ? 1 : 0,
      formula: isCalc ? formulaInput.value.trim() : "",
    };

    try {
      await json("/api/admin/gradebook/columns", { method: "POST", body: payload });
      dlg.close();
      dlg.remove();
      if (onSave) onSave();
    } catch (err) {
      alert("Ошибка создания столбца: " + err.message);
    }
  };

  const box = el("div", { class: "auth-modal-box", style: "max-width: 500px;" },
    el("h3", { class: "auth-modal-title", style: "margin-bottom: 1rem;" }, "➕ Новый столбец журнала"),
    form
  );

  dlg.replaceChildren(box);
  dlg.showModal();
}

function openEditColumnModal(col, onSave) {
  const dlg = el("dialog", { class: "auth-modal-dialog" });
  document.body.append(dlg);

  const keyInput = el("input", { type: "text", class: "form-input", value: col.key, readonly: true, style: "opacity: 0.7;" });
  const titleInput = el("input", { type: "text", class: "form-input", value: col.title, required: true });
  const maxScoreInput = el("input", { type: "number", class: "form-input", value: col.max, min: 1, max: 100 });
  const isCalcSelect = el("select", { class: "form-input" },
    el("option", { value: "0", selected: !col.is_calculated }, "Обычный числовой столбец"),
    el("option", { value: "1", selected: col.is_calculated }, "Вычисляемый столбец (формула)")
  );
  const formulaInput = el("input", { type: "text", class: "form-input", placeholder: "SUM, AVG, SUM(c1, c2)", value: col.formula || "SUM" });
  const formulaGroup = el("div", { class: "form-group", style: col.is_calculated ? "display: block;" : "display: none;" },
    el("label", { class: "form-label" }, "Формула расчета"),
    formulaInput,
    el("p", { class: "form-help", style: "font-size: 0.78rem; color: var(--muted); margin: 0.2rem 0 0;" }, "Форматы: SUM (все баллы), AVG (среднее), SUM(kr_1, kr_2), AVG(hw_1, hw_2)")
  );

  isCalcSelect.onchange = () => {
    formulaGroup.style.display = isCalcSelect.value === "1" ? "block" : "none";
  };

  const deleteBtn = el("button", {
    class: "btn danger btn-sm",
    type: "button",
    onclick: async () => {
      if (!confirm(`Удалить столбец «${col.title}» (${col.key}) из журнала оценок? Все выставленные баллы по нему сохранятся в архиве.`)) return;
      try {
        await json(`/api/admin/gradebook/columns/${encodeURIComponent(col.id || col.key)}`, { method: "DELETE" });
        dlg.close();
        dlg.remove();
        if (onSave) onSave();
      } catch (err) {
        alert("Ошибка удаления столбца: " + err.message);
      }
    },
  }, "🗑️ Удалить столбец");

  const form = el("form", {},
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Ключ (ID столбца)"), keyInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Название столбца"), titleInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Максимальный балл"), maxScoreInput),
    el("div", { class: "form-group" }, el("label", { class: "form-label" }, "Тип столбца"), isCalcSelect),
    formulaGroup,
    el("div", { style: "display: flex; justify-content: space-between; align-items: center; margin-top: 1.25rem;" },
      deleteBtn,
      el("div", { style: "display: flex; gap: 0.5rem;" },
        el("button", { class: "btn quiet btn-sm", type: "button", onclick: () => { dlg.close(); dlg.remove(); } }, "Отмена"),
        el("button", { class: "btn primary btn-sm", type: "submit" }, "Сохранить")
      )
    )
  );

  form.onsubmit = async (e) => {
    e.preventDefault();
    const isCalc = isCalcSelect.value === "1";
    const payload = {
      title: titleInput.value.trim(),
      max_score: parseFloat(maxScoreInput.value) || 10,
      is_calculated: isCalc ? 1 : 0,
      formula: isCalc ? formulaInput.value.trim() : "",
    };

    try {
      await json(`/api/admin/gradebook/columns/${encodeURIComponent(col.id || col.key)}`, { method: "PUT", body: payload });
      dlg.close();
      dlg.remove();
      if (onSave) onSave();
    } catch (err) {
      alert("Ошибка сохранения столбца: " + err.message);
    }
  };

  const box = el("div", { class: "auth-modal-box", style: "max-width: 500px;" },
    el("h3", { class: "auth-modal-title", style: "margin-bottom: 1rem;" }, `⚙️ Настройки столбца «${col.title}»`),
    form
  );

  dlg.replaceChildren(box);
  dlg.showModal();
}





