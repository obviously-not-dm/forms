// Статус теста на главной: из localStorage этого браузера.
for (const a of document.querySelectorAll(".tests a")) {
  const status = a.querySelector(".t-status");
  try {
    const history = JSON.parse(localStorage.getItem(`trainer:history:${a.dataset.id}`)) || [];
    const current = JSON.parse(localStorage.getItem(`trainer:${a.dataset.id}`));
    const last = history.at(-1);
    if (current?.startedAt && !current.finished) {
      const done = Object.values(current.answers || {})
        .filter((v) => (Array.isArray(v) ? v.length : v !== null && String(v).trim() !== "")).length;
      status.textContent = `в процессе, ${done} из ${a.dataset.count}`;
    } else if (last) {
      status.textContent = `последний раз ${last.score} из ${last.max}`;
      status.classList.add("done");
    }
  } catch {}
}

// Переключение основных вкладок на главной (Тесты / Конспекты)
const tabButtons = document.querySelectorAll(".home-tab-btn");
const tabPanels = document.querySelectorAll(".home-tab-panel");

function switchHomeTab(tabName) {
  tabButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tabName);
  });
  try {
    localStorage.setItem("trainer:home_tab", tabName);
  } catch {}
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchHomeTab(btn.dataset.tab));
});

try {
  const savedTab = localStorage.getItem("trainer:home_tab");
  if (savedTab && document.querySelector(`.home-tab-btn[data-tab="${savedTab}"]`)) {
    switchHomeTab(savedTab);
  }
} catch {}

// Фильтрация тестов по темам/папкам
const topicFilterBtns = document.querySelectorAll(".topic-filter-btn");
const testItems = document.querySelectorAll(".tests li");

topicFilterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const topic = btn.dataset.topic;
    topicFilterBtns.forEach((b) => b.classList.toggle("active", b === btn));
    testItems.forEach((li) => {
      const liTopic = li.dataset.topic || "";
      li.style.display = (!topic || topic === "all" || liTopic === topic) ? "" : "none";
    });
  });
});
