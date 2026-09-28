import { grade, isAnswered, isCorrect, parseSet, parseNumber, LETTERS } from "./grade.js";
import { db } from "./db.js";

const body = document.body;
const testId = body.dataset.id;
const storeKey = `trainer:${testId}`;
const articles = [...document.querySelectorAll(".q")];
const byId = new Map(articles.map((a) => [a.dataset.id, a]));
const $ = (id) => document.getElementById(id);

let state = restore();
let keyPromise = null;
let confirming = false; // первое нажатие «Отправить» при пустых ответах
let resuming = false;   // подсказка «Продолжить с …» после возвращения к тесту

// ---------- состояние ----------

function fresh(mode = "exam") {
  return { answers: {}, hints: {}, checked: {}, mode, startedAt: null, finished: false, result: null, feedback: "" };
}

function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(storeKey));
    if (s && s.answers) return { ...fresh(), ...s };
  } catch {}
  return fresh();
}

function persist() {
  try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch {}
}

function loadKey() {
  keyPromise ||= fetch("key.json", { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`key.json: ${r.status}`);
    return r.json();
  }).then((k) => new Map(k.questions.map((q) => [q.id, q])));
  return keyPromise;
}

// ---------- ответы ----------

function valueOf(article) {
  const type = article.dataset.type;
  if (type === "text") return article.querySelector(".text-input").value;
  const checked = [...article.querySelectorAll("input:checked")].map((i) => Number(i.value));
  return type === "single" ? (checked.length ? checked[0] : null) : checked;
}

function applyValue(article, value) {
  const type = article.dataset.type;
  if (type === "text") {
    article.querySelector(".text-input").value = value ?? "";
    return;
  }
  const set = new Set(type === "single" ? [value] : value || []);
  for (const input of article.querySelectorAll("input")) input.checked = set.has(Number(input.value));
}

function answeredCount() {
  return articles.filter((a) => isAnswered(a.dataset.type, state.answers[a.dataset.id])).length;
}

function updateProgress() {
  const done = answeredCount();
  $("count").textContent = done;
  $("progress-bar").style.width = `${(100 * done) / articles.length}%`;
  for (const b of document.querySelectorAll("#map [data-go]")) {
    const id = b.dataset.go;
    const a = byId.get(id);
    b.classList.toggle("answered", isAnswered(a.dataset.type, state.answers[id]));
    b.classList.toggle("hinted", (state.hints[id] || 0) > 0);
    b.classList.toggle("right", a.classList.contains("is-right"));
    b.classList.toggle("wrong", a.classList.contains("is-wrong"));
  }
  for (const a of articles) {
    const btn = a.querySelector(".clear-btn");
    btn.hidden = a.classList.contains("locked") || !isAnswered(a.dataset.type, state.answers[a.dataset.id]);
  }
  if (!state.finished) resetConfirm();
}

function formatProblem(article) {
  const v = valueOf(article).trim();
  if (!v) return "";
  if (article.dataset.compare === "set" && parseSet(v) === null) {
    return "Ожидается множество в фигурных скобках, например {1, 2}. Пустое множество: {}";
  }
  if (article.dataset.compare === "number" && parseNumber(v) === null) return "Ожидается число";
  return "";
}

function next(article) {
  const n = articles[articles.indexOf(article) + 1];
  if (!n) return;
  n.scrollIntoView({ behavior: "smooth", block: "start" });
  n.querySelector("input:not(:disabled)")?.focus({ preventScroll: true });
}

for (const a of articles) {
  a.addEventListener("input", () => {
    state.answers[a.dataset.id] = valueOf(a);
    persist();
    updateProgress();
    const warn = a.querySelector(".format-warn");
    if (warn && !warn.hidden && !formatProblem(a)) warn.hidden = true;
  });
  a.querySelector(".clear-btn").addEventListener("click", () => {
    delete state.answers[a.dataset.id];
    applyValue(a, null);
    persist();
    updateProgress();
    const warn = a.querySelector(".format-warn");
    if (warn) warn.hidden = true;
  });
  const input = a.querySelector(".text-input");
  if (input) {
    input.addEventListener("blur", () => {
      const warn = a.querySelector(".format-warn");
      warn.textContent = formatProblem(a);
      warn.hidden = !warn.textContent;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        next(a);
      }
    });
  }
}

// ---------- начало ----------

for (const r of document.querySelectorAll('input[name="mode"]')) r.checked = r.value === state.mode;

$("start-btn").addEventListener("click", start);

function start() {
  state.mode = document.querySelector('input[name="mode"]:checked').value;
  state.startedAt = Date.now();
  persist();
  applyMode();
  articles[0]?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyMode() {
  body.classList.toggle("started", Boolean(state.startedAt));
  body.classList.toggle("mode-practice", state.mode === "practice");
  body.classList.toggle("finished", state.finished);
  $("submit").textContent = state.mode === "practice" ? "Завершить" : "Отправить";
  if ($("feedback")) $("feedback").disabled = state.finished;
}

// ---------- подсказки ----------

function showHints(article, count) {
  const hints = [...article.querySelectorAll(".hint")];
  hints.forEach((h, i) => { h.hidden = i >= count; });
  const btn = article.querySelector(".hint-btn");
  if (btn) {
    btn.hidden = count >= hints.length;
    btn.textContent = count ? "Ещё подсказка" : "Подсказка";
  }
}

for (const btn of document.querySelectorAll(".hint-btn")) {
  const a = btn.closest(".q");
  btn.addEventListener("click", () => {
    const id = a.dataset.id;
    state.hints[id] = (state.hints[id] || 0) + 1;
    persist();
    showHints(a, state.hints[id]);
    updateProgress();
  });
}

// ---------- разбор ----------

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function lock(article) {
  article.classList.add("locked");
  for (const i of article.querySelectorAll("input")) i.disabled = true;
}

function showReview(article, q, expand = false) {
  const value = state.answers[q.id];
  const ok = isCorrect(q, value);
  article.classList.toggle("is-right", ok);
  article.classList.toggle("is-wrong", !ok);
  lock(article);

  if (q.type === "text") {
    article.querySelector(".text-input").classList.add(ok ? "right" : "wrong");
  } else {
    const chosen = new Set(q.type === "single" ? [value] : value || []);
    article.querySelectorAll(".opt").forEach((opt, i) => {
      const key = q.answer.includes(i);
      opt.classList.toggle("key", key);
      opt.classList.toggle("miss", chosen.has(i) && !key);
    });
  }

  const review = article.querySelector(".review");
  review.replaceChildren();
  review.append(el("p", "verdict",
    ok ? "Верно" : isAnswered(q.type, value) ? "Неверно" : "Нет ответа"));
  if (!ok) {
    const line = el("p", "key-line");
    if (q.type === "text") {
      line.append("Правильный ответ: ", el("strong", "", q.answer[0]));
    } else {
      const letters = q.answer.map((i) => LETTERS[i]).join(", ");
      line.append(q.answer.length > 1 ? "Верные варианты: " : "Верный вариант: ", el("strong", "", letters));
    }
    review.append(line);
  }
  if (q.explanation) {
    // верные задания свёрнуты: длинный разбор нужен там, где ошибка
    const box = el("details", "explanation");
    box.open = expand || !ok;
    box.append(el("summary", "", "Разбор"));
    const content = el("div", "explanation-body");
    content.innerHTML = q.explanation; // собрано из нашего же markdown при сборке
    box.append(content);
    review.append(box);
  }
  review.hidden = false;
}

async function check(article) {
  const key = await loadKey();
  state.checked[article.dataset.id] = true;
  persist();
  showReview(article, key.get(article.dataset.id), true);
  updateProgress();
}

for (const btn of document.querySelectorAll(".check-btn")) {
  btn.addEventListener("click", () => check(btn.closest(".q")).catch(showLoadError));
}

function showLoadError() {
  $("action-note").textContent = "Не удалось загрузить ответы. Проверьте интернет и попробуйте ещё раз.";
}

// ---------- отправка ----------

function resetConfirm() {
  if (!confirming && !resuming) return;
  confirming = false;
  resuming = false;
  $("action-note").textContent = "";
  $("submit").textContent = state.mode === "practice" ? "Завершить" : "Отправить";
  $("to-skipped")?.remove();
}

function offerResume() {
  const done = answeredCount();
  const skipped = firstSkipped();
  if (!state.startedAt || state.finished || !done || !skipped) return;
  resuming = true;
  $("action-note").textContent = `Отвечено ${done} из ${articles.length}.`;
  const go = el("button", "btn quiet", `Продолжить с ${skipped.querySelector(".q-num").textContent}`);
  go.id = "to-skipped";
  go.type = "button";
  go.addEventListener("click", () => {
    firstSkipped()?.scrollIntoView({ behavior: "smooth", block: "start" });
    resetConfirm();
  });
  $("actions").prepend(go);
}

function firstSkipped() {
  return articles.find((a) => !isAnswered(a.dataset.type, state.answers[a.dataset.id]));
}

$("submit").addEventListener("click", () => {
  const left = articles.length - answeredCount();
  if (left > 0 && !confirming) {
    resetConfirm();
    confirming = true;
    $("action-note").textContent = `Без ответа: ${left} из ${articles.length}.`;
    $("submit").textContent = "Отправить так";
    const go = el("button", "btn quiet", "К пропущенному");
    go.id = "to-skipped";
    go.type = "button";
    go.addEventListener("click", () => {
      firstSkipped()?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    $("actions").prepend(go);
    return;
  }
  finish().catch(showLoadError);
});

async function finish() {
  $("submit").disabled = true;
  const key = await loadKey();
  const questions = articles.map((a) => key.get(a.dataset.id));
  state.result = grade(questions, state.answers);
  state.finished = true;
  state.finishedAt = Date.now();
  confirming = false;
  persist();
  for (const a of articles) showReview(a, key.get(a.dataset.id));
  applyMode();
  showResult();
  updateProgress();
  remember();
  window.scrollTo({ top: 0, behavior: "smooth" });
  $("submit").disabled = false;
  await save();
}

function remember() {
  const k = `trainer:history:${testId}`;
  try {
    const h = JSON.parse(localStorage.getItem(k)) || [];
    h.push({ score: state.result.score, max: state.result.max, at: Date.now() });
    localStorage.setItem(k, JSON.stringify(h.slice(-20)));
  } catch {}
}

async function save() {
  const client = await db().catch(() => null);
  if (!client) return;
  const { error } = await client.from("attempts").insert({
    quiz_id: testId,
    group_name: null,
    mode: state.mode,
    answers: state.answers,
    hints: state.hints,
    score: state.result.score,
    max_score: state.result.max,
    feedback: state.feedback.trim() || null,
    duration_sec: Math.round((state.finishedAt - state.startedAt) / 1000),
  });
  const status = document.querySelector(".save-status");
  if (status && error) status.textContent = "Результат не попал в общую статистику, но разбор ниже доступен.";
}

function showResult() {
  const { score, max } = state.result;
  const box = $("result");
  box.replaceChildren();

  const s = el("p", "score", `${score} из ${max}`);
  s.append(el("small", "", `${Math.round((100 * score) / max)}%`));

  const facts = [];
  if (state.finishedAt && state.startedAt) {
    const min = Math.max(1, Math.round((state.finishedAt - state.startedAt) / 60000));
    facts.push(`${min} мин`);
  }
  const hinted = Object.values(state.hints).filter((n) => n > 0).length;
  if (hinted) facts.push(`подсказки в ${hinted} ${hinted === 1 ? "задании" : "заданиях"}`);

  const blocks = el("div", "result-blocks");
  for (const sec of document.querySelectorAll(".block")) {
    const qs = [...sec.querySelectorAll(".q")];
    if (!sec.dataset.title || !qs.length) continue;
    const right = qs.filter((a) => a.classList.contains("is-right")).length;
    const row = el("p", "result-block");
    row.append(el("span", "", sec.dataset.title), el("span", "result-block-score", `${right} из ${qs.length}`));
    blocks.append(row);
  }

  const map = el("div", "result-map");
  for (const a of articles) {
    const b = el("button", a.classList.contains("is-right") ? "right" : "wrong", a.querySelector(".q-num").textContent);
    b.type = "button";
    b.addEventListener("click", () => a.scrollIntoView({ behavior: "smooth", block: "start" }));
    map.append(b);
  }

  const actions = el("div", "result-actions");
  const toggle = el("label", "toggle");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.addEventListener("change", () => body.classList.toggle("only-wrong", cb.checked));
  toggle.append(cb, "Только ошибки");
  const again = el("button", "btn quiet", "Пройти ещё раз");
  again.type = "button";
  again.addEventListener("click", restart);
  actions.append(toggle, again);

  box.append(s);
  if (facts.length) box.append(el("p", "result-facts", facts.join(", ")));
  if (blocks.children.length > 1) box.append(blocks);
  box.append(map, actions, el("p", "save-status"));
  box.hidden = false;
}

function restart() {
  state = { ...fresh(state.mode), startedAt: Date.now() };
  persist();
  for (const a of articles) {
    a.classList.remove("is-right", "is-wrong", "locked");
    for (const i of a.querySelectorAll("input")) i.disabled = false;
    for (const o of a.querySelectorAll(".opt")) o.classList.remove("key", "miss");
    a.querySelector(".text-input")?.classList.remove("right", "wrong");
    const warn = a.querySelector(".format-warn");
    if (warn) warn.hidden = true;
    const r = a.querySelector(".review");
    r.hidden = true;
    r.replaceChildren();
    applyValue(a, null);
    showHints(a, 0);
  }
  if ($("feedback")) $("feedback").value = "";
  $("result").hidden = true;
  body.classList.remove("only-wrong");
  applyMode();
  updateProgress();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- карта и картинки ----------

const mapDialog = $("map");
$("map-open").addEventListener("click", () => mapDialog.showModal());
mapDialog.addEventListener("click", (e) => {
  if (e.target === mapDialog || e.target.closest("[data-close]")) mapDialog.close();
  const go = e.target.closest("[data-go]");
  if (go) {
    mapDialog.close();
    byId.get(go.dataset.go).scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

const zoom = $("zoom");
document.addEventListener("click", (e) => {
  const img = e.target.closest(".q-text img, .explanation img, .hint img");
  if (!img) return;
  zoom.querySelector("img").src = img.currentSrc || img.src;
  zoom.querySelector("img").alt = img.alt;
  zoom.showModal();
});
zoom.addEventListener("click", () => zoom.close());

const feedback = $("feedback");
if (feedback) {
  feedback.value = state.feedback;
  feedback.addEventListener("input", () => { state.feedback = feedback.value; persist(); });
}

// ---------- восстановление ----------

for (const a of articles) {
  applyValue(a, state.answers[a.dataset.id]);
  showHints(a, state.hints[a.dataset.id] || 0);
}
applyMode();
updateProgress();
offerResume();

if (state.finished || Object.keys(state.checked).length) {
  loadKey().then((key) => {
    for (const a of articles) {
      if (state.finished || state.checked[a.dataset.id]) showReview(a, key.get(a.dataset.id));
    }
    if (state.finished) showResult();
    updateProgress();
  }).catch(showLoadError);
}
