// Интерактивный модуль для работы с вопросами коллоквиума:
// 1) Режим электронного справочника (все определения открыты по умолчанию, поиск, фильтры)
// 2) Режим карточек с 3D-переворотом (Quizlet-style flashcards)

const rawData = Array.isArray(window.__COLLOQUIUMS_DATA__) ? window.__COLLOQUIUMS_DATA__ : [];

// LocalStorage ключи
const STORAGE_PROGRESS_KEY = "trainer:colloquiums_progress";
const STORAGE_MODE_KEY = "trainer:colloquiums_mode";
const STORAGE_COL_KEY = "trainer:colloquiums_filter";

// Чтение сохраненного прогресса { [id]: 'known' | 'repeat' }
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_PROGRESS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveProgress(prog) {
  try {
    localStorage.setItem(STORAGE_PROGRESS_KEY, JSON.stringify(prog));
  } catch {}
}

let progress = loadProgress();

// Разбор URL параметров
const urlParams = new URLSearchParams(window.location.search);

// По умолчанию открываем справочник со всеми определениями ("dict")
let currentMode = urlParams.get("mode") || localStorage.getItem(STORAGE_MODE_KEY) || "dict";
if (currentMode !== "cards" && currentMode !== "dict") currentMode = "dict";

let currentColFilter = urlParams.get("col") || localStorage.getItem(STORAGE_COL_KEY) || "all";
if (!["all", "1", "2"].includes(currentColFilter)) currentColFilter = "all";

let searchQuery = urlParams.get("q") || "";

// Список карточек текущей выборки
let activeItems = [];
let currentIndex = 0;
let isFlipped = false;

// DOM элементы
const modeButtons = document.querySelectorAll(".colloquiums-mode-btn");
const viewCards = document.getElementById("view-cards");
const viewDict = document.getElementById("view-dict");

const colPillButtons = document.querySelectorAll(".col-pill-btn");
const searchInput = document.getElementById("colloquiums-search");
const clearSearchBtn = document.getElementById("clear-search-btn");

// Элементы карточки
const quizletCard = document.getElementById("quizlet-card");
const cardFrontBadge = document.getElementById("card-front-badge");
const cardStatusBadge = document.getElementById("card-status-badge");
const cardFrontTerm = document.getElementById("card-front-term");

const cardBackBadge = document.getElementById("card-back-badge");
const cardBackTerm = document.getElementById("card-back-term");
const cardBackDef = document.getElementById("card-back-def");
const cardBackEx = document.getElementById("card-back-ex");

const cardCurrentIdx = document.getElementById("card-current-idx");
const cardTotalCount = document.getElementById("card-total-count");
const cardsProgressBar = document.getElementById("cards-progress-bar");
const statKnownVal = document.getElementById("stat-known-val");
const statRepeatVal = document.getElementById("stat-repeat-val");

const btnCardPrev = document.getElementById("btn-card-prev");
const btnCardNext = document.getElementById("btn-card-next");
const btnMarkKnown = document.getElementById("btn-mark-known");
const btnMarkRepeat = document.getElementById("btn-mark-repeat");
const btnShuffleCards = document.getElementById("btn-shuffle-cards");
const btnResetProgress = document.getElementById("btn-reset-cards-progress");

// Элементы справочника
const dictVisibleCount = document.getElementById("dict-visible-count");
const dictItemsList = document.getElementById("dict-items-list");
const btnExpandAll = document.getElementById("btn-expand-all");
const btnCollapseAll = document.getElementById("btn-collapse-all");

// ----------------------------------------------------
// ФИЛЬТРАЦИЯ И ПОДГОТОВКА ДАННЫХ
// ----------------------------------------------------

function filterItems() {
  const q = searchQuery.trim().toLowerCase();
  activeItems = rawData.filter((item) => {
    // Фильтр коллоквиума
    if (currentColFilter !== "all" && String(item.colloquium) !== currentColFilter) {
      return false;
    }
    // Поисковой запрос
    if (q) {
      const matchTerm = (item.term || "").toLowerCase().includes(q);
      const matchDef = (item.definition || "").toLowerCase().includes(q);
      const matchEx = (item.examples || "").toLowerCase().includes(q);
      const matchNum = String(item.num) === q || `№${item.num}` === q || `№ ${item.num}` === q || `вопрос ${item.num}` === q;
      return matchTerm || matchDef || matchEx || matchNum;
    }
    return true;
  });

  if (currentIndex >= activeItems.length) {
    currentIndex = Math.max(0, activeItems.length - 1);
  }
}

// ----------------------------------------------------
// РЕНДЕР КАРТОЧЕК (FLASHCARDS)
// ----------------------------------------------------

function updateStats() {
  let known = 0;
  let repeat = 0;
  for (const item of activeItems) {
    const s = progress[item.id];
    if (s === "known") known++;
    else if (s === "repeat") repeat++;
  }
  if (statKnownVal) statKnownVal.textContent = known;
  if (statRepeatVal) statRepeatVal.textContent = repeat;

  // Прогресс бар
  if (cardsProgressBar && activeItems.length > 0) {
    const progressPct = ((currentIndex + 1) / activeItems.length) * 100;
    cardsProgressBar.style.width = `${progressPct}%`;
  }
}

function getHtml(val) {
  if (!val) return "";
  if (typeof val === "object" && val.html) return val.html;
  return String(val);
}

function renderCurrentCard() {
  if (!activeItems.length) {
    if (quizletCard) {
      quizletCard.classList.remove("flipped");
      isFlipped = false;
    }
    if (cardFrontBadge) cardFrontBadge.textContent = "Вопросов не найдено";
    if (cardStatusBadge) cardStatusBadge.textContent = "";
    if (cardFrontTerm) cardFrontTerm.textContent = "По вашему запросу ничего не найдено";
    if (cardBackDef) cardBackDef.innerHTML = "<p class='muted'>Попробуйте изменить поисковой фильтр или сбросить поиск.</p>";
    if (cardBackEx) cardBackEx.innerHTML = "";
    if (cardCurrentIdx) cardCurrentIdx.textContent = "0";
    if (cardTotalCount) cardTotalCount.textContent = "0";
    if (cardsProgressBar) cardsProgressBar.style.width = "0%";
    if (btnCardPrev) btnCardPrev.disabled = true;
    if (btnCardNext) btnCardNext.disabled = true;
    if (btnMarkKnown) btnMarkKnown.disabled = true;
    if (btnMarkRepeat) btnMarkRepeat.disabled = true;
    return;
  }

  if (btnCardPrev) btnCardPrev.disabled = currentIndex <= 0;
  if (btnCardNext) btnCardNext.disabled = currentIndex >= activeItems.length - 1;
  if (btnMarkKnown) btnMarkKnown.disabled = false;
  if (btnMarkRepeat) btnMarkRepeat.disabled = false;

  const item = activeItems[currentIndex];
  const itemStatus = progress[item.id];

  // Сброс переворота при смене карточки
  if (quizletCard && quizletCard.classList.contains("flipped")) {
    quizletCard.classList.remove("flipped");
    isFlipped = false;
  }

  // Лицевая сторона
  if (cardFrontBadge) {
    cardFrontBadge.textContent = `Коллоквиум ${item.colloquium} · Вопрос № ${item.num}`;
  }
  if (cardStatusBadge) {
    if (itemStatus === "known") {
      cardStatusBadge.innerHTML = `<span class="badge-status-dot known" title="Выучено">✅ Выучено</span>`;
    } else if (itemStatus === "repeat") {
      cardStatusBadge.innerHTML = `<span class="badge-status-dot repeat" title="На повторении">🔄 На повторении</span>`;
    } else {
      cardStatusBadge.innerHTML = "";
    }
  }
  if (cardFrontTerm) {
    cardFrontTerm.textContent = item.term;
  }

  // Оборотная сторона
  if (cardBackBadge) {
    cardBackBadge.textContent = `Коллоквиум ${item.colloquium} · Вопрос № ${item.num}`;
  }
  if (cardBackTerm) {
    cardBackTerm.textContent = item.term;
  }
  if (cardBackDef) {
    const defHtml = getHtml(item.definitionHtml) || `<p>${item.definition || ""}</p>`;
    cardBackDef.innerHTML = defHtml;
  }
  if (cardBackEx) {
    const exHtml = getHtml(item.examplesHtml) || item.examples;
    if (exHtml) {
      cardBackEx.innerHTML = `
        <div class="card-examples-heading">Примеры, свойства и замечания:</div>
        <div class="card-examples-content">${exHtml}</div>
      `;
      cardBackEx.style.display = "block";
    } else {
      cardBackEx.innerHTML = "";
      cardBackEx.style.display = "none";
    }
  }

  // Счетчики
  if (cardCurrentIdx) cardCurrentIdx.textContent = currentIndex + 1;
  if (cardTotalCount) cardTotalCount.textContent = activeItems.length;

  updateStats();
}

function flipCard() {
  if (!activeItems.length || !quizletCard) return;
  isFlipped = !isFlipped;
  quizletCard.classList.toggle("flipped", isFlipped);
}

function nextCard() {
  if (currentIndex < activeItems.length - 1) {
    currentIndex++;
    renderCurrentCard();
  }
}

function prevCard() {
  if (currentIndex > 0) {
    currentIndex--;
    renderCurrentCard();
  }
}

function markCard(status) {
  if (!activeItems.length) return;
  const item = activeItems[currentIndex];
  progress[item.id] = status;
  saveProgress(progress);

  // Визуальный отклик на кнопке
  if (status === "known" && btnMarkKnown) {
    btnMarkKnown.classList.add("btn-pop");
    setTimeout(() => btnMarkKnown.classList.remove("btn-pop"), 300);
  } else if (status === "repeat" && btnMarkRepeat) {
    btnMarkRepeat.classList.add("btn-pop");
    setTimeout(() => btnMarkRepeat.classList.remove("btn-pop"), 300);
  }

  updateStats();

  // Обновляем статус на открытой карточке
  if (cardStatusBadge) {
    if (status === "known") {
      cardStatusBadge.innerHTML = `<span class="badge-status-dot known" title="Выучено">✅ Выучено</span>`;
    } else if (status === "repeat") {
      cardStatusBadge.innerHTML = `<span class="badge-status-dot repeat" title="На повторении">🔄 На повторении</span>`;
    }
  }

  // Обновляем иконку в справочнике
  updateDictStatusIcons();

  // Если не последняя карточка, переходим к следующей после небольшой задержки для комфорта
  if (currentIndex < activeItems.length - 1) {
    setTimeout(() => {
      nextCard();
    }, 280);
  }
}

function shuffleCards() {
  if (activeItems.length <= 1) return;
  // Fisher-Yates
  for (let i = activeItems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [activeItems[i], activeItems[j]] = [activeItems[j], activeItems[i]];
  }
  currentIndex = 0;
  renderCurrentCard();
}

function resetProgress() {
  if (confirm("Вы уверены, что хотите сбросить отметки «Выучено» и «Повторить»?")) {
    progress = {};
    saveProgress(progress);
    updateStats();
    renderCurrentCard();
    updateDictStatusIcons();
  }
}

// ----------------------------------------------------
// РЕНДЕР И ОБСЛУЖИВАНИЕ СПРАВОЧНИКА (DICTIONARY)
// ----------------------------------------------------

function updateDictStatusIcons() {
  if (!dictItemsList) return;
  dictItemsList.querySelectorAll("[data-status-for]").forEach((span) => {
    const id = span.dataset.statusFor;
    const st = progress[id];
    if (st === "known") {
      span.innerHTML = `<span class="dict-status-icon known" title="Выучено">✅</span>`;
    } else if (st === "repeat") {
      span.innerHTML = `<span class="dict-status-icon repeat" title="Нужно повторить">🔄</span>`;
    } else {
      span.innerHTML = "";
    }
  });
}

function renderDictionary() {
  if (!dictItemsList) return;

  if (dictVisibleCount) {
    dictVisibleCount.textContent = activeItems.length;
  }

  let items = dictItemsList.querySelectorAll(".dict-item");
  if (items.length === 0 && rawData.length > 0) {
    dictItemsList.innerHTML = rawData.map((c) => {
      const col = c.colloquium_id || c.colloquium || 1;
      const defHtml = getHtml(c.definitionHtml) || `<p>${c.definition || ""}</p>`;
      const exHtml = getHtml(c.examplesHtml) || (c.examples ? `<p>${c.examples}</p>` : "");
      return `
        <article class="dict-item open" data-id="${c.id}" data-col="${col}" data-num="${c.num}">
          <div class="dict-item-header">
            <div class="dict-item-meta">
              <span class="dict-col-pill">Коллоквиум ${col} · Вопрос № ${c.num}</span>
              <span class="dict-status-icon" data-status-for="${c.id}"></span>
            </div>
            <h3 class="dict-item-term">${c.term}</h3>
            <div class="dict-item-header-actions">
              <button type="button" class="btn quiet btn-sm btn-to-flashcard" data-jump-card="${c.id}" title="Перейти к этой карточке для запоминания">
                🗂️ Карточка
              </button>
              <span class="dict-chevron" aria-hidden="true">▾</span>
            </div>
          </div>
          <div class="dict-item-body">
            <div class="dict-def-wrap">${defHtml}</div>
            ${exHtml ? `
              <div class="dict-ex-wrap">
                <div class="dict-ex-heading">Примеры, свойства и пояснения:</div>
                ${exHtml}
              </div>
            ` : ""}
          </div>
        </article>
      `;
    }).join("\n");
    items = dictItemsList.querySelectorAll(".dict-item");
  }

  const activeIds = new Set(activeItems.map((i) => i.id));

  let visibleCount = 0;
  items.forEach((itemEl) => {
    const id = itemEl.dataset.id;
    const isVisible = activeIds.has(id);
    itemEl.style.display = isVisible ? "" : "none";
    if (isVisible) visibleCount++;
  });

  updateDictStatusIcons();
}

function jumpToCard(cardId) {
  // Найти индекс в activeItems
  let idx = activeItems.findIndex((i) => i.id === cardId);
  if (idx < 0) {
    // Если вопрос отфильтрован, сбросить фильтр
    currentColFilter = "all";
    searchQuery = "";
    if (searchInput) searchInput.value = "";
    if (clearSearchBtn) clearSearchBtn.hidden = true;
    filterItems();
    idx = activeItems.findIndex((i) => i.id === cardId);
  }

  if (idx >= 0) {
    currentIndex = idx;
  }
  setMode("cards");
  renderCurrentCard();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggleAllAccordion(open) {
  if (!dictItemsList) return;
  dictItemsList.querySelectorAll(".dict-item").forEach((art) => {
    const body = art.querySelector(".dict-item-body");
    if (body) {
      if (open) {
        body.removeAttribute("hidden");
        art.classList.add("open");
      } else {
        body.setAttribute("hidden", "");
        art.classList.remove("open");
      }
    }
  });
}

// ----------------------------------------------------
// ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ И ФИЛЬТРОВ
// ----------------------------------------------------

function setMode(mode) {
  currentMode = mode;
  try {
    localStorage.setItem(STORAGE_MODE_KEY, mode);
  } catch {}

  modeButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  if (mode === "cards") {
    if (viewCards) {
      viewCards.hidden = false;
      viewCards.classList.add("active");
    }
    if (viewDict) {
      viewDict.hidden = true;
      viewDict.classList.remove("active");
    }
    renderCurrentCard();
  } else {
    if (viewCards) {
      viewCards.hidden = true;
      viewCards.classList.remove("active");
    }
    if (viewDict) {
      viewDict.hidden = false;
      viewDict.classList.add("active");
    }
    renderDictionary();
  }
}

function setColFilter(col) {
  currentColFilter = col;
  try {
    localStorage.setItem(STORAGE_COL_KEY, col);
  } catch {}

  colPillButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.col === col);
  });

  filterItems();
  currentIndex = 0;

  if (currentMode === "cards") {
    renderCurrentCard();
  } else {
    renderDictionary();
  }
}

// ----------------------------------------------------
// ПРИВЯЗКА СОБЫТИЙ
// ----------------------------------------------------

// Смена режима (Справочник / Карточки)
modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setMode(btn.dataset.mode);
  });
});

// Фильтр коллоквиумов
colPillButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    setColFilter(btn.dataset.col);
  });
});

// Живой поиск
if (searchInput) {
  if (searchQuery) searchInput.value = searchQuery;

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value;
    if (clearSearchBtn) clearSearchBtn.hidden = !searchQuery;
    filterItems();
    currentIndex = 0;
    if (currentMode === "cards") {
      renderCurrentCard();
    } else {
      renderDictionary();
    }
  });

  if (clearSearchBtn) {
    clearSearchBtn.hidden = !searchQuery;
    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      searchQuery = "";
      clearSearchBtn.hidden = true;
      searchInput.focus();
      filterItems();
      currentIndex = 0;
      if (currentMode === "cards") {
        renderCurrentCard();
      } else {
        renderDictionary();
      }
    });
  }
}

// Карточки: клики
if (quizletCard) {
  quizletCard.addEventListener("click", (e) => {
    // Игнорируем клики по ссылкам внутри карточки если есть
    if (e.target.closest("a")) return;
    flipCard();
  });
}

if (btnCardPrev) btnCardPrev.addEventListener("click", prevCard);
if (btnCardNext) btnCardNext.addEventListener("click", nextCard);
if (btnMarkKnown) btnMarkKnown.addEventListener("click", () => markCard("known"));
if (btnMarkRepeat) btnMarkRepeat.addEventListener("click", () => markCard("repeat"));
if (btnShuffleCards) btnShuffleCards.addEventListener("click", shuffleCards);
if (btnResetProgress) btnResetProgress.addEventListener("click", resetProgress);

// Справочник: Развернуть/свернуть все
if (btnExpandAll) btnExpandAll.addEventListener("click", () => toggleAllAccordion(true));
if (btnCollapseAll) btnCollapseAll.addEventListener("click", () => toggleAllAccordion(false));

// Справочник: клики по карточкам и переходам
if (dictItemsList) {
  dictItemsList.addEventListener("click", (e) => {
    // Клик по кнопке "🗂️ Карточка"
    const jumpBtn = e.target.closest(".btn-to-flashcard");
    if (jumpBtn) {
      e.stopPropagation();
      const cardId = jumpBtn.dataset.jumpCard;
      if (cardId) jumpToCard(cardId);
      return;
    }

    // Клик по заголовку для сворачивания / разворачивания
    const header = e.target.closest(".dict-item-header");
    if (header) {
      const art = header.closest(".dict-item");
      if (art) {
        const body = art.querySelector(".dict-item-body");
        if (body) {
          const isHidden = body.hasAttribute("hidden");
          if (isHidden) {
            body.removeAttribute("hidden");
            art.classList.add("open");
          } else {
            body.setAttribute("hidden", "");
            art.classList.remove("open");
          }
        }
      }
    }
  });
}

// Горячие клавиши
window.addEventListener("keydown", (e) => {
  // Не перехватывать ввод если фокус в инпуте поиска или текста
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target.isContentEditable) return;

  if (currentMode === "cards") {
    if (e.code === "Space") {
      e.preventDefault();
      flipCard();
    } else if (e.code === "ArrowRight" || e.code === "PageDown") {
      e.preventDefault();
      nextCard();
    } else if (e.code === "ArrowLeft" || e.code === "PageUp") {
      e.preventDefault();
      prevCard();
    } else if (e.key === "1") {
      e.preventDefault();
      markCard("repeat");
    } else if (e.key === "2") {
      e.preventDefault();
      markCard("known");
    }
  }
});

// ----------------------------------------------------
// ИНИЦИАЛИЗАЦИЯ
// ----------------------------------------------------

filterItems();
setColFilter(currentColFilter);
setMode(currentMode);
