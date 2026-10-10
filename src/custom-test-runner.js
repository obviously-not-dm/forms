// Интерактивный запуск и прохождение сгенерированного случайного теста
import { isAnswered, isCorrect, LETTERS } from "./grade.js";

async function initCustomTestRunner() {
  document.body.classList.add("started");

  const params = new URLSearchParams(window.location.search);
  const count = Math.max(3, Math.min(50, Number(params.get("count")) || 10));
  const topic = params.get("topic") || "all";
  const mode = params.get("mode") || "exam";
  let seed = params.get("seed");
  if (!seed) {
    seed = Math.random().toString(36).slice(2, 9);
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set("seed", seed);
    window.history.replaceState({}, "", newUrl.href);
  }

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
  const sheetMap = document.getElementById("sheet-map");
  const mapOpenBtn = document.getElementById("map-open");
  const mapGrid = document.getElementById("custom-map-grid");

  if (metaEl) {
    metaEl.textContent = `${count} заданий · Тема: ${topic === "all" ? "Все темы (Микс)" : topic} · Режим: ${mode === "practice" ? "Тренировка с разборами" : "Экзамен"}`;
  }
  if (totalCountEl) totalCountEl.textContent = count;

  // 1. Загрузка общего пула заданий
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
      questionsWrap.innerHTML = `<p class="table-error">Ошибка загрузки заданий: не удалось загрузить банк вопросов курса. ${loadErr ? loadErr.message : ""}</p>`;
    }
    return;
  }

  // 2. Фильтрация пула по выбранной теме
  let candidateQuestions = topic === "all" ? pool : pool.filter((q) => q.topic === topic);
  if (!candidateQuestions.length) candidateQuestions = pool;

  const getQKey = (q) => q.uid || `${q.testId}_${q.id}`;
  const qMap = new Map(candidateQuestions.map((q) => [getQKey(q), q]));

  // 3. Выборка заданий с привязкой к seed в URL (сохраняется при перезагрузке)
  const sessionQuestionsKey = `trainer:custom_qids_${seed}_${topic}_${count}`;
  let selectedQuestions = [];
  try {
    const savedKeys = JSON.parse(localStorage.getItem(sessionQuestionsKey));
    if (Array.isArray(savedKeys) && savedKeys.length === count) {
      selectedQuestions = savedKeys.map((k) => qMap.get(k)).filter(Boolean);
    }
  } catch {}

  if (selectedQuestions.length !== count) {
    const shuffled = [...candidateQuestions].sort(() => Math.random() - 0.5);
    selectedQuestions = shuffled.slice(0, count);
    try {
      localStorage.setItem(sessionQuestionsKey, JSON.stringify(selectedQuestions.map(getQKey)));
    } catch {}
  }

  // 4. Загрузка сохранённых ответов
  const storeKey = `trainer:custom_answers_${seed}`;
  let userAnswers = {};
  try {
    userAnswers = JSON.parse(localStorage.getItem(storeKey)) || {};
  } catch {}

  // 5. Рендеринг заданий
  questionsWrap.innerHTML = selectedQuestions.map((q, idx) => {
    const num = idx + 1;
    const qKey = getQKey(q);
    let answerHtml = "";

    if (q.type === "text") {
      const savedVal = userAnswers[qKey] || "";
      answerHtml = `
        <div class="answer-field">
          <input class="text-input" type="text" name="custom-q-${qKey}" autocomplete="off" spellcheck="false"
                 placeholder="Введите ответ" value="${escapeHtml(savedVal)}">
        </div>
      `;
    } else {
      const isMultiple = q.type === "multiple";
      const inputType = isMultiple ? "checkbox" : "radio";
      const saved = userAnswers[qKey];

      const optsHtml = (q.options || []).map((opt, oIdx) => {
        const isChecked = isMultiple
          ? Array.isArray(saved) && saved.includes(oIdx)
          : saved === oIdx;
        const letter = LETTERS[oIdx] || String(oIdx + 1);

        return `
          <label class="opt">
            <input type="${inputType}" name="custom-q-${qKey}" value="${oIdx}" ${isChecked ? "checked" : ""}>
            <span class="badge">${letter}</span>
            <div class="opt-body">${opt.html || opt.md || ""}</div>
          </label>
        `;
      }).join("");

      answerHtml = `<div class="options ${isMultiple ? "multiple" : "single"}">${optsHtml}</div>`;
    }

    const practiceControls = mode === "practice" ? `
      <button class="btn quiet practice-check-btn" type="button" data-key="${qKey}">
        💡 Проверить
      </button>
    ` : "";

    return `
      <article class="q" id="q-${qKey}" data-key="${qKey}" data-type="${q.type}" data-idx="${idx}">
        <div class="q-num">${num}</div>
        <div class="q-body">
          <div class="q-source-tag" style="font-size: 0.78rem; color: var(--muted); margin-bottom: 0.35rem;">
            📌 Раздел: <strong>${escapeHtml(q.topic || q.testTitle)}</strong>
          </div>
          <div class="q-text">${q.html}</div>
          ${answerHtml}
          <div class="q-tools">
            ${practiceControls}
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

  // 6. Карта заданий
  if (mapGrid) {
    mapGrid.innerHTML = selectedQuestions.map((q, idx) => {
      const qKey = getQKey(q);
      return `<button type="button" class="btn quiet btn-sm map-item-btn" data-go="${qKey}">${idx + 1}</button>`;
    }).join("");

    mapGrid.querySelectorAll("[data-go]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.go;
        const target = document.getElementById(`q-${k}`);
        if (target) {
          if (sheetMap && sheetMap.open) sheetMap.close();
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    });
  }

  if (mapOpenBtn && sheetMap) {
    mapOpenBtn.addEventListener("click", () => sheetMap.showModal());
    sheetMap.addEventListener("click", (e) => {
      if (e.target === sheetMap || e.target.closest("[data-close]")) {
        sheetMap.close();
      }
    });
  }

  let isFinished = false;

  // 7. Обновление прогресса
  function updateProgress() {
    let answered = 0;
    const articles = questionsWrap.querySelectorAll("article.q");
    articles.forEach((art) => {
      const qKey = art.dataset.key;
      const type = art.dataset.type;
      const val = userAnswers[qKey];
      const isQDone = isAnswered(type, val);
      art.classList.toggle("is-answered", isQDone);
      if (isQDone) answered++;

      const mapBtn = mapGrid?.querySelector(`[data-go="${qKey}"]`);
      if (mapBtn) {
        mapBtn.classList.toggle("primary", isQDone);
      }
    });

    if (answeredCountEl) answeredCountEl.textContent = answered;
    if (progressBar) progressBar.style.width = `${(answered / count) * 100}%`;
  }

  // 8. Сбор ответов
  function collectAnswers() {
    if (isFinished) return;
    questionsWrap.querySelectorAll("article.q").forEach((art) => {
      const qKey = art.dataset.key;
      const type = art.dataset.type;
      if (type === "text") {
        const inp = art.querySelector(".text-input");
        if (inp && inp.value.trim() !== "") userAnswers[qKey] = inp.value.trim();
        else delete userAnswers[qKey];
      } else if (type === "single") {
        const checked = art.querySelector(`input[name="custom-q-${qKey}"]:checked`);
        if (checked) userAnswers[qKey] = Number(checked.value);
        else delete userAnswers[qKey];
      } else if (type === "multiple") {
        const checked = Array.from(art.querySelectorAll(`input[name="custom-q-${qKey}"]:checked`)).map((cb) => Number(cb.value));
        if (checked.length) userAnswers[qKey] = checked;
        else delete userAnswers[qKey];
      }
    });

    try {
      localStorage.setItem(storeKey, JSON.stringify(userAnswers));
    } catch {}
    updateProgress();
  }

  questionsWrap.addEventListener("input", collectAnswers);
  questionsWrap.addEventListener("change", collectAnswers);
  window.addEventListener("beforeunload", () => {
    if (!isFinished) collectAnswers();
  });

  // 9. Очистка ответа
  questionsWrap.querySelectorAll(".clear-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isFinished) return;
      const art = btn.closest("article.q");
      const qKey = art.dataset.key;
      delete userAnswers[qKey];
      art.querySelectorAll("input").forEach((inp) => {
        if (inp.type === "text") inp.value = "";
        else inp.checked = false;
      });
      const rev = art.querySelector(".review");
      if (rev) rev.hidden = true;
      art.classList.remove("is-right", "is-wrong");
      collectAnswers();
    });
  });

  // 10. Проверка в режиме тренировки
  function gradeQuestion(q, userVal) {
    if (q.key) return isCorrect(q.key, userVal);
    if (q.options) {
      const correctIdxs = q.options.map((o, i) => o.correct ? i : null).filter((x) => x !== null);
      if (q.type === "single") return correctIdxs[0] === userVal;
      if (q.type === "multiple" && Array.isArray(userVal)) {
        return [...correctIdxs].sort().join() === [...userVal].sort().join();
      }
    }
    return false;
  }

  function renderQuestionReview(art, q, userVal, isFinal = false) {
    const correct = gradeQuestion(q, userVal);
    art.classList.toggle("is-right", correct);
    art.classList.toggle("is-wrong", !correct);

    // Подсветка вариантов
    if (q.type !== "text" && Array.isArray(q.options)) {
      const correctIdxs = new Set(
        q.key && Array.isArray(q.key.answer)
          ? q.key.answer
          : q.options.map((o, i) => (o.correct ? i : null)).filter((x) => x !== null)
      );
      const chosen = new Set(q.type === "single" ? [userVal] : Array.isArray(userVal) ? userVal : []);

      art.querySelectorAll(".opt").forEach((optEl, i) => {
        const isKey = correctIdxs.has(i);
        optEl.classList.toggle("key", isKey);
        optEl.classList.toggle("miss", chosen.has(i) && !isKey);

        optEl.querySelector(".opt-note")?.remove();
        const note = q.optionNotesHtml?.[i] || q.options[i]?.note;
        if (note && (chosen.has(i) || isKey)) {
          const noteDiv = document.createElement("div");
          noteDiv.className = "opt-note";
          noteDiv.innerHTML = typeof note === "string" ? note : Array.isArray(note) ? note.join("<br>") : "";
          optEl.querySelector(".opt-body")?.append(noteDiv);
        }
      });
    } else if (q.type === "text") {
      const inp = art.querySelector(".text-input");
      if (inp) {
        inp.classList.remove("right", "wrong");
        inp.classList.add(correct ? "right" : "wrong");
      }
    }

    const rev = art.querySelector(".review");
    if (rev) {
      rev.hidden = false;
      let reviewContent = "";

      const answered = isAnswered(q.type, userVal);
      reviewContent += `<p class="feedback-msg ${correct ? 'ok' : 'bad'}" style="margin: 0.5rem 0 0.25rem; font-weight: 600;">
        ${correct ? '✅ Верно!' : answered ? '❌ Неверно.' : '⚠️ Нет ответа.'}
      </p>`;

      if (!correct && q.type !== "text" && Array.isArray(q.options)) {
        const correctLetters = q.options
          .map((o, i) => (o.correct || (q.key?.answer && q.key.answer.includes(i)) ? LETTERS[i] || String(i + 1) : null))
          .filter(Boolean);
        if (correctLetters.length) {
          reviewContent += `<p class="key-line" style="margin: 0.25rem 0; font-size: 0.92rem;"><strong>Правильный ответ:</strong> ${correctLetters.join(", ")}</p>`;
        }
      }

      if (q.explanationHtml) {
        reviewContent += `<div class="hints-box" style="margin-top: 0.5rem; font-size: 0.9rem; background: var(--surface-subtle); padding: 0.75rem; border-radius: 6px;">💡 <strong>Разбор:</strong> ${q.explanationHtml}</div>`;
      } else if (Array.isArray(q.hintsHtml) && q.hintsHtml.length > 0) {
        reviewContent += `<div class="hints-box" style="margin-top: 0.5rem; font-size: 0.9rem; background: var(--surface-subtle); padding: 0.75rem; border-radius: 6px;">💡 <strong>Пояснение:</strong> ${q.hintsHtml.join("<hr>")}</div>`;
      }

      rev.innerHTML = reviewContent;
    }

    return correct;
  }

  questionsWrap.querySelectorAll(".practice-check-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isFinished) return;
      const qKey = btn.dataset.key;
      const art = document.getElementById(`q-${qKey}`);
      if (!art) return;
      const q = selectedQuestions.find((item) => getQKey(item) === qKey);
      if (!q) return;

      collectAnswers();
      const userVal = userAnswers[qKey];
      if (userVal === undefined || userVal === null || userVal === "") {
        alert("Сначала укажите ответ к этому заданию.");
        return;
      }

      renderQuestionReview(art, q, userVal, false);
    });
  });

  // 11. Избранное
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

  // 12. Финальная проверка теста
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      if (isFinished) return;
      collectAnswers();

      let answeredCount = 0;
      selectedQuestions.forEach((q) => {
        const qKey = getQKey(q);
        if (isAnswered(q.type, userAnswers[qKey])) answeredCount++;
      });
      const unanswered = count - answeredCount;
      if (unanswered > 0) {
        const ok = confirm(`У вас осталось ${unanswered} неотвеченных заданий. Точно хотите завершить тест и посмотреть результаты?`);
        if (!ok) return;
      }

      isFinished = true;
      submitBtn.disabled = true;

      // Блокируем вопросы
      questionsWrap.querySelectorAll("article.q").forEach((art) => {
        art.classList.add("locked");
        art.querySelectorAll("input, button:not(.favorite-btn)").forEach((el) => {
          el.disabled = true;
        });
      });

      let score = 0;
      selectedQuestions.forEach((q) => {
        const qKey = getQKey(q);
        const art = document.getElementById(`q-${qKey}`);
        const userVal = userAnswers[qKey];
        const correct = renderQuestionReview(art, q, userVal, true);
        if (correct) score++;

        const mapBtn = mapGrid?.querySelector(`[data-go="${qKey}"]`);
        if (mapBtn) {
          mapBtn.style.background = correct ? '#22c55e' : '#ef4444';
          mapBtn.style.color = '#fff';
        }
      });

      const pct = Math.round((score / count) * 100);
      if (resultBox) {
        resultBox.hidden = false;
        resultBox.innerHTML = `
          <div class="result-score" style="font-size: 1.35rem; font-weight: 700; margin-bottom: 0.5rem;">
            Ваш результат: <strong>${score} из ${count}</strong> (${pct}%)
          </div>
          <p class="muted" style="margin: 0 0 1rem;">
            ${pct >= 80 ? '🎉 Отличный результат! Курс усвоен на высоком уровне.' : pct >= 60 ? '👍 Зачётный результат. Рекомендуем повторить ошибки.' : '💡 Рекомендуем повторить теорию в конспектах и попробовать снова.'}
          </p>
          <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
            <button class="btn primary" id="btn-regen-variant" type="button">🔄 Сгенерировать новый вариант</button>
            <a href="./" class="btn quiet">📋 Каталог всех тестов</a>
          </div>
        `;

        document.getElementById("btn-regen-variant")?.addEventListener("click", () => {
          const newSeed = Math.random().toString(36).slice(2, 9);
          const u = new URL(window.location.href);
          u.searchParams.set("seed", newSeed);
          window.location.href = u.href;
        });

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
