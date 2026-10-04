// Интерактивный запуск и прохождение сгенерированного случайного теста
import { isAnswered, isCorrect, LETTERS } from "./grade.js";

async function initCustomTestRunner() {
  const params = new URLSearchParams(window.location.search);
  const count = Math.max(3, Math.min(50, Number(params.get("count")) || 10));
  const topic = params.get("topic") || "all";
  const mode = params.get("mode") || "exam";

  const headingEl = document.getElementById("custom-heading");
  const leadEl = document.getElementById("custom-lead");
  const metaEl = document.getElementById("custom-meta");
  const questionsWrap = document.getElementById("custom-questions-wrap");
  const finishSection = document.getElementById("finish-section");
  const totalCountEl = document.getElementById("total");
  const answeredCountEl = document.getElementById("count");
  const progressBar = document.getElementById("progress-bar");
  const submitBtn = document.getElementById("custom-submit-btn");
  const resultBox = document.getElementById("result");

  if (metaEl) {
    metaEl.textContent = `${count} заданий · Тема: ${topic === "all" ? "Все темы (Микс)" : topic} · Режим: ${mode === "practice" ? "Тренировка" : "Экзамен"}`;
  }
  if (totalCountEl) totalCountEl.textContent = count;

  let pool = [];
  const candidateUrls = ["../pool.json", "/pool.json", "./pool.json", "pool.json"];
  let loadErr = null;
  for (const url of candidateUrls) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          pool = data;
          break;
        }
      }
    } catch (err) {
      loadErr = err;
    }
  }

  if (!pool.length) {
    if (questionsWrap) {
      questionsWrap.innerHTML = `<p class="table-error">Ошибка загрузки заданий: не удалось загрузить пул заданий курса. ${loadErr ? loadErr.message : ""}</p>`;
    }
    return;
  }

  // Фильтрация по теме
  let candidateQuestions = topic === "all" ? pool : pool.filter((q) => q.topic === topic);
  if (!candidateQuestions.length) candidateQuestions = pool;

  // Сохранение и восстановление выборки вопросов при перезагрузке
  const sessionQuestionsKey = `trainer:custom_qids_${topic}_${count}`;
  let selectedQuestions = [];
  try {
    const savedIds = JSON.parse(localStorage.getItem(sessionQuestionsKey));
    if (Array.isArray(savedIds) && savedIds.length === count) {
      const idMap = new Map(candidateQuestions.map((q) => [q.id, q]));
      selectedQuestions = savedIds.map((id) => idMap.get(id)).filter(Boolean);
    }
  } catch {}

  if (selectedQuestions.length !== count) {
    const shuffled = [...candidateQuestions].sort(() => Math.random() - 0.5);
    selectedQuestions = shuffled.slice(0, count);
    try {
      localStorage.setItem(sessionQuestionsKey, JSON.stringify(selectedQuestions.map((q) => q.id)));
    } catch {}
  }

  // Хранилище ответов
  const storeKey = "trainer:custom_test_session";
  let userAnswers = {};
  try {
    userAnswers = JSON.parse(localStorage.getItem(storeKey)) || {};
  } catch {}

  // Рендер вопросов
  questionsWrap.innerHTML = selectedQuestions.map((q, idx) => {
    const num = idx + 1;
    let answerHtml = "";

    if (q.type === "text") {
      const savedVal = userAnswers[q.id] || "";
      answerHtml = `
        <div class="answer-field">
          <input class="text-input" type="text" autocomplete="off" spellcheck="false"
                 placeholder="Введите ответ" value="${escapeHtml(savedVal)}">
        </div>
      `;
    } else {
      const isMultiple = q.type === "multiple";
      const inputType = isMultiple ? "checkbox" : "radio";
      const saved = userAnswers[q.id];

      const optsHtml = (q.options || []).map((opt, oIdx) => {
        const isChecked = isMultiple
          ? Array.isArray(saved) && saved.includes(oIdx)
          : saved === oIdx;
        const letter = LETTERS[oIdx] || String(oIdx + 1);

        return `
          <label class="opt">
            <input type="${inputType}" name="q-${q.id}" value="${oIdx}" ${isChecked ? "checked" : ""}>
            <span class="badge">${letter}</span>
            <div class="opt-body">${opt.html || opt.md || ""}</div>
          </label>
        `;
      }).join("");

      answerHtml = `<div class="options ${isMultiple ? "multiple" : "single"}">${optsHtml}</div>`;
    }

    return `
      <article class="q" id="q-${q.id}" data-id="${q.id}" data-type="${q.type}" data-idx="${idx}">
        <div class="q-num">${num}</div>
        <div class="q-body">
          <div class="q-text">${q.html}</div>
          ${answerHtml}
          <div class="q-tools">
            <button class="btn quiet favorite-btn" type="button" data-q-id="${q.id}" data-test-id="${q.testId}">
              ⭐ В избранное
            </button>
            <button class="btn quiet clear-btn" type="button">Очистить ответ</button>
          </div>
          <div class="review" hidden></div>
        </div>
      </article>
    `;
  }).join("");

  if (finishSection) finishSection.hidden = false;

  // KaTeX рендер
  if (window.renderMathInElement) {
    window.renderMathInElement(questionsWrap);
  }

  // Прогресс
  function updateProgress() {
    let answered = 0;
    const articles = questionsWrap.querySelectorAll("article.q");
    articles.forEach((art) => {
      const qId = art.dataset.id;
      const type = art.dataset.type;
      const val = userAnswers[qId];
      const isQDone = isAnswered(type, val);
      art.classList.toggle("is-answered", isQDone);
      if (isQDone) answered++;
    });

    if (answeredCountEl) answeredCountEl.textContent = answered;
    if (progressBar) progressBar.style.width = `${(answered / count) * 100}%`;
  }

  // Сбор ответов
  function collectAnswers() {
    questionsWrap.querySelectorAll("article.q").forEach((art) => {
      const qId = art.dataset.id;
      const type = art.dataset.type;
      if (type === "text") {
        const inp = art.querySelector(".text-input");
        if (inp && inp.value.trim() !== "") userAnswers[qId] = inp.value.trim();
        else delete userAnswers[qId];
      } else if (type === "single") {
        const checked = art.querySelector("input[type=radio]:checked");
        if (checked) userAnswers[qId] = Number(checked.value);
        else delete userAnswers[qId];
      } else if (type === "multiple") {
        const checked = Array.from(art.querySelectorAll("input[type=checkbox]:checked")).map((cb) => Number(cb.value));
        if (checked.length) userAnswers[qId] = checked;
        else delete userAnswers[qId];
      }
    });

    try {
      localStorage.setItem(storeKey, JSON.stringify(userAnswers));
    } catch {}
    updateProgress();
  }

  questionsWrap.addEventListener("input", collectAnswers);
  questionsWrap.addEventListener("change", collectAnswers);
  window.addEventListener("beforeunload", collectAnswers);

  // Очистка ответа
  questionsWrap.querySelectorAll(".clear-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const art = btn.closest("article.q");
      const qId = art.dataset.id;
      delete userAnswers[qId];
      art.querySelectorAll("input").forEach((inp) => {
        if (inp.type === "text") inp.value = "";
        else inp.checked = false;
      });
      collectAnswers();
    });
  });

  // Избранное
  const favoritesKey = "trainer:favorites";
  function updateFavoriteButtons() {
    const favs = JSON.parse(localStorage.getItem(favoritesKey) || "{}");
    questionsWrap.querySelectorAll(".favorite-btn").forEach((btn) => {
      const qId = btn.dataset.qId;
      const testId = btn.dataset.testId;
      const isFav = Boolean(favs[`${testId}:${qId}`]);
      btn.textContent = isFav ? "★ В избранном" : "⭐ В избранное";
      btn.classList.toggle("active", isFav);
    });
  }

  questionsWrap.querySelectorAll(".favorite-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const qId = btn.dataset.qId;
      const testId = btn.dataset.testId;
      const art = btn.closest("article.q");
      const text = art.querySelector(".q-text")?.textContent?.trim().slice(0, 120) || "";
      const favs = JSON.parse(localStorage.getItem(favoritesKey) || "{}");
      const k = `${testId}:${qId}`;
      if (favs[k]) delete favs[k];
      else favs[k] = { testId, qId, textSnippet: text, date: Date.now() };
      localStorage.setItem(favoritesKey, JSON.stringify(favs));
      updateFavoriteButtons();
    });
  });

  updateFavoriteButtons();
  updateProgress();

  // Завершение и проверка
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      collectAnswers();
      submitBtn.disabled = true;

      // Проверка ключей
      let score = 0;
      selectedQuestions.forEach((q) => {
        const art = questionsWrap.querySelector(`article.q[data-id="${q.id}"]`);
        const userVal = userAnswers[q.id];
        let correct = false;

        if (q.key) {
          correct = isCorrect(q.key, userVal);
        } else if (q.options) {
          const correctIdxs = q.options.map((o, i) => o.correct ? i : null).filter((x) => x !== null);
          if (q.type === "single") correct = correctIdxs[0] === userVal;
          else if (q.type === "multiple" && Array.isArray(userVal)) {
            correct = [...correctIdxs].sort().join() === [...userVal].sort().join();
          }
        }

        if (correct) {
          score++;
          art.classList.add("is-right");
        } else {
          art.classList.add("is-wrong");
        }

        const rev = art.querySelector(".review");
        if (rev) {
          rev.hidden = false;
          rev.innerHTML = `<p class="feedback-msg ${correct ? 'ok' : 'bad'}">${correct ? '✅ Верно!' : '❌ Неверно.'}</p>`;
        }
      });

      const pct = Math.round((score / count) * 100);
      if (resultBox) {
        resultBox.hidden = false;
        resultBox.innerHTML = `
          <div class="result-score">Ваш результат: <strong>${score} из ${count}</strong> (${pct}%)</div>
          <p class="muted">${pct >= 80 ? '🎉 Отличный результат!' : pct >= 60 ? '👍 Зачётный результат.' : '💡 Рекомендуем повторить теорию и попробовать снова.'}</p>
          <div style="display: flex; gap: 0.5rem; justify-content: center; margin-top: 1rem;">
            <button class="btn primary" onclick="window.location.reload()">Сгенерировать новый вариант</button>
            <a href="./" class="btn quiet">Все тренажёры</a>
          </div>
        `;
        resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      try {
        localStorage.removeItem(storeKey);
      } catch {}
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCustomTestRunner);
} else {
  initCustomTestRunner();
}
