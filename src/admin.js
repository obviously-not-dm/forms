import { grade, describe, normalize } from "./grade.js";
import { db } from "./db.js";

const root = document.getElementById("app");
let client;

function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : String(c));
  }
  return n;
}

async function json(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

main();

async function main() {
  client = await db();
  if (!client) {
    root.replaceChildren(el("h1", {}, "Статистика"),
      el("p", {}, "Supabase не настроен: заполните supabase в content/site.yml и пересоберите сайт."));
    return;
  }
  const { data } = await client.auth.getSession();
  data.session ? dashboard() : login();
}

function login() {
  const email = el("input", { type: "text", autocomplete: "username", inputmode: "email" });
  const password = el("input", { type: "password", autocomplete: "current-password" });
  const status = el("p", { class: "field-error" });
  const form = el("form", {
    class: "login",
    onsubmit: async (e) => {
      e.preventDefault();
      status.textContent = "";
      const { error } = await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
      if (error) status.textContent = "Неверная почта или пароль.";
      else dashboard();
    },
  },
    el("label", {}, el("span", { class: "field-label" }, "Почта"), email),
    el("label", {}, el("span", { class: "field-label" }, "Пароль"), password),
    status,
    el("button", { class: "btn primary", type: "submit" }, "Войти"));
  root.replaceChildren(el("section", { class: "intro" }, el("h1", {}, "Статистика")), form);
}

async function dashboard() {
  const tests = await json("tests.json");
  const test = el("select", {}, tests.map((t) => el("option", { value: t.id }, t.title)));
  const since = el("input", { type: "date" });
  const mode = el("select", {},
    el("option", { value: "" }, "Все"),
    el("option", { value: "exam" }, "Проверка в конце"),
    el("option", { value: "practice" }, "Тренировка"));
  const out = el("div");
  const show = () => stats(test.value, since.value, mode.value, out);
  [test, since, mode].forEach((c) => c.addEventListener("change", show));

  root.replaceChildren(
    el("section", { class: "intro" }, el("h1", {}, "Статистика")),
    el("div", { class: "stats-row" },
      el("label", {}, el("span", { class: "field-label" }, "Тест"), test),
      el("label", {}, el("span", { class: "field-label" }, "С даты"), since),
      el("label", {}, el("span", { class: "field-label" }, "Режим"), mode),
      el("button", { class: "btn quiet", type: "button", onclick: async () => { await client.auth.signOut(); login(); } }, "Выйти")),
    out);
  if (tests.length) show();
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
const share = (rs) => rs.reduce((s, r) => s + r.g.score / r.g.max, 0) / rs.length;

async function stats(testId, since, mode, out) {
  out.replaceChildren(el("p", { class: "muted" }, "Загружаем…"));
  let key, rows;
  try {
    [key, rows] = await Promise.all([json(`${testId}/key.json`), fetchAttempts(testId, since, mode)]);
  } catch (e) {
    out.replaceChildren(el("p", { class: "field-error" }, `Не загрузилось: ${e.message}`));
    return;
  }
  if (!rows.length) {
    out.replaceChildren(el("p", { class: "muted" },
      "Попыток нет. Если тест уже проходили, проверьте, что ваш аккаунт есть в таблице admins."));
    return;
  }

  // Перепроверка по текущему ключу: исправленный ключ сразу меняет статистику.
  const qs = key.questions;
  const graded = rows.map((r) => ({ ...r, g: grade(qs, r.answers || {}) }));
  const groups = {};
  for (const r of graded) (groups[r.group_name || "без группы"] ||= []).push(r);

  out.replaceChildren(
    el("p", { class: "score" }, `${graded.length}`,
      el("small", {}, `${attemptsWord(graded.length)}, в среднем ${Math.round(share(graded) * 100)}%`)),
    el("p", {}, el("button", { class: "btn quiet", type: "button", onclick: () => csv(key, testId, graded) }, "Скачать CSV")),

    el("h2", {}, "По группам"),
    table(["Группа", "Попыток", "Средний результат"],
      Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, "ru"))
        .map(([g, rs]) => [g, rs.length, `${Math.round(share(rs) * 100)}%`])),

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

    feedbackList(graded));
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
  const items = graded.filter((r) => r.feedback).reverse();
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
