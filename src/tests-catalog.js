// Каталог тренажёров, фильтры, статус решения, генератор тестов и избранные задания
function initCatalog() {
  // 1. Статусы тестов из localStorage
  document.querySelectorAll(".test-catalog-card").forEach((card) => {
    const testId = card.dataset.id;
    const badge = card.querySelector(".test-status-badge");
    if (!badge || !testId) return;

    try {
      const history = JSON.parse(localStorage.getItem(`trainer:history:${testId}`)) || [];
      const current = JSON.parse(localStorage.getItem(`trainer:${testId}`));
      const last = history.at(-1);

      if (current?.startedAt && !current.finished) {
        const done = Object.values(current.answers || {})
          .filter((v) => (Array.isArray(v) ? v.length : v !== null && String(v).trim() !== "")).length;
        badge.textContent = `В процессе (${done})`;
        badge.className = "test-status-badge in-progress";
      } else if (last) {
        const pct = Math.round((last.score / (last.max || 1)) * 100);
        badge.textContent = `${last.score}/${last.max} (${pct}%)`;
        badge.className = `test-status-badge ${pct >= 60 ? "done" : "attempted"}`;
      }
    } catch {}
  });

  // 2. Генератор случайного теста
  let selectedCount = 10;
  let selectedMode = "exam";

  const countPills = document.querySelectorAll("#gen-count-pills .gen-pill");
  countPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      countPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      selectedCount = Number(pill.dataset.count) || 10;
    });
  });

  const modePills = document.querySelectorAll("#gen-mode-pills .gen-pill");
  modePills.forEach((pill) => {
    pill.addEventListener("click", () => {
      modePills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      selectedMode = pill.dataset.mode || "exam";
    });
  });

  const btnStartGen = document.getElementById("btn-start-generator");
  if (btnStartGen) {
    btnStartGen.addEventListener("click", () => {
      const topicSelect = document.getElementById("gen-topic-select");
      const topic = topicSelect?.value || "all";
      const targetBase = window.location.pathname.endsWith("/") ? window.location.pathname : `${window.location.pathname}/`;
      const url = `${targetBase}custom.html?count=${selectedCount}&topic=${encodeURIComponent(topic)}&mode=${selectedMode}`;
      window.location.href = url;
    });
  }

  // 3. Фильтрация тестов по темам
  const topicFilterBtns = document.querySelectorAll("#tests-topic-filters .topic-filter-btn");
  const testCards = document.querySelectorAll(".test-catalog-card");
  const searchInput = document.getElementById("tests-search");

  function filterCards() {
    const activeBtn = document.querySelector("#tests-topic-filters .topic-filter-btn.active");
    const topic = activeBtn ? activeBtn.dataset.topic : "all";
    const term = searchInput?.value.trim().toLowerCase() || "";

    testCards.forEach((card) => {
      const cardTopic = card.dataset.topic || "";
      const cardText = card.textContent.toLowerCase();
      const matchTopic = !topic || topic === "all" || cardTopic === topic;
      const matchSearch = !term || cardText.includes(term);
      card.style.display = (matchTopic && matchSearch) ? "" : "none";
    });
  }

  topicFilterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      topicFilterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      filterCards();
    });
  });

  if (searchInput) {
    searchInput.addEventListener("input", filterCards);
  }

  // 4. Отображение избранных заданий
  const favSection = document.getElementById("favorites-section");
  const favList = document.getElementById("favorites-list");
  if (favSection && favList) {
    try {
      const favs = JSON.parse(localStorage.getItem("trainer:favorites")) || {};
      const entries = Object.entries(favs);
      if (entries.length > 0) {
        favSection.hidden = false;
        favList.innerHTML = entries.map(([key, item]) => `
          <div class="favorite-item-card">
            <div class="favorite-item-meta">
              <span class="favorite-test-title">Тест: ${item.testTitle || item.testId}</span>
              <span class="favorite-q-badge">№ ${item.qId}</span>
            </div>
            <p class="favorite-snippet">${item.textSnippet ? item.textSnippet + "…" : "Задание курса"}</p>
            <div class="favorite-card-actions">
              <a href="../${encodeURIComponent(item.testId)}/#q-${encodeURIComponent(item.qId)}" class="btn quiet btn-sm">Перейти к заданию →</a>
            </div>
          </div>
        `).join("");
      }
    } catch {}
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCatalog);
} else {
  initCatalog();
}
