/**
 * Практические занятия — клиентский модуль
 */

class PracticesApp {
  constructor() {
    this.practices = window.__PRACTICES_DATA__ || [];
    this.selectedId = null;
    this.selectedGroup = "all";
    this.searchQuery = "";

    this.init();
  }

  async init() {
    // 1. Check user group from storage or session
    const savedGroup = localStorage.getItem("dm_user_group");
    if (savedGroup) {
      this.selectedGroup = savedGroup;
    }

    // Check query param or hash for selected practice
    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get("id") || window.location.hash.replace("#", "");
    if (paramId) {
      this.selectedId = paramId;
    }

    // 2. Fetch fresh data from API if available
    try {
      const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch("/api/practices", { headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.practices) && data.practices.length > 0) {
          this.practices = data.practices;
        }
      }
    } catch {}

    this.bindEvents();
    this.render();
  }

  bindEvents() {
    const groupSelect = document.getElementById("practice-group-select");
    if (groupSelect) {
      // Set initial value
      if (Array.from(groupSelect.options).some((o) => o.value === this.selectedGroup)) {
        groupSelect.value = this.selectedGroup;
      }
      groupSelect.onchange = (e) => {
        this.selectedGroup = e.target.value;
        this.renderList();
      };
    }

    const searchInput = document.getElementById("practices-search");
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = (e.target.value || "").trim().toLowerCase();
        this.renderList();
      };
    }

    const mobileBtn = document.getElementById("practices-menu-btn");
    const sidebar = document.getElementById("practices-sidebar");
    if (mobileBtn && sidebar) {
      mobileBtn.onclick = () => {
        sidebar.classList.toggle("open");
      };
    }
  }

  getFilteredPractices() {
    return this.practices.filter((p) => {
      // Group filter
      if (this.selectedGroup && this.selectedGroup !== "all") {
        if (p.group_name && p.group_name !== "all" && p.group_name !== this.selectedGroup) {
          return false;
        }
      }
      // Search filter
      if (this.searchQuery) {
        const matchTitle = (p.title || "").toLowerCase().includes(this.searchQuery);
        const matchTopic = (p.topic || "").toLowerCase().includes(this.searchQuery);
        if (!matchTitle && !matchTopic) return false;
      }
      return true;
    });
  }

  render() {
    this.renderList();
    if (!this.selectedId && this.practices.length > 0) {
      const filtered = this.getFilteredPractices();
      if (filtered.length > 0) {
        this.selectPractice(filtered[0].id);
      } else {
        this.selectPractice(this.practices[0].id);
      }
    } else if (this.selectedId) {
      this.renderArticle();
    }
  }

  renderList() {
    const listEl = document.getElementById("practices-list");
    if (!listEl) return;

    const filtered = this.getFilteredPractices();
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--muted); font-size: 0.9rem;">
          Практик не найдено
        </div>`;
      return;
    }

    // Group by topic
    const topicsMap = new Map();
    for (const p of filtered) {
      const topic = p.topic || "Общее";
      if (!topicsMap.has(topic)) {
        topicsMap.set(topic, []);
      }
      topicsMap.get(topic).push(p);
    }

    let html = "";
    for (const [topic, items] of topicsMap.entries()) {
      html += `
        <div class="practices-topic-group">
          <div class="practices-topic-title">${this.esc(topic)}</div>
          <div class="practices-topic-items">
            ${items
              .map((p) => {
                const isActive = p.id === this.selectedId;
                const groupBadge = p.group_name && p.group_name !== "all"
                  ? `<span class="badge badge-group" style="font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px; background: var(--accent-soft); color: var(--accent-ink);">${this.esc(p.group_name)}</span>`
                  : "";
                return `
                  <button type="button" class="practice-nav-card ${isActive ? "active" : ""}" data-id="${this.esc(p.id)}">
                    <div class="practice-card-title-row">
                      <span class="practice-card-icon">📝</span>
                      <span class="practice-card-title">${this.esc(p.title)}</span>
                    </div>
                    <div class="practice-card-meta-row">
                      ${groupBadge}
                    </div>
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll(".practice-nav-card").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        this.selectPractice(id);
        const sidebar = document.getElementById("practices-sidebar");
        if (sidebar && sidebar.classList.contains("open")) {
          sidebar.classList.remove("open");
        }
      };
    });
  }

  selectPractice(id) {
    this.selectedId = id;
    try {
      history.replaceState(null, "", `?id=${encodeURIComponent(id)}`);
    } catch {}

    this.renderList();
    this.renderArticle();
  }

  renderArticle() {
    const articleEl = document.getElementById("practices-article");
    if (!articleEl) return;

    const practice = this.practices.find((p) => p.id === this.selectedId);
    if (!practice) {
      articleEl.innerHTML = `
        <div style="padding: 2.5rem; text-align: center; color: var(--muted);">
          Выберите практическое занятие из списка слева
        </div>`;
      return;
    }

    const groupLabel = practice.group_name && practice.group_name !== "all"
      ? `Группа: ${this.esc(practice.group_name)}`
      : "Для всех групп";

    const contentHtml = practice.html || (practice.content ? this.renderFallbackMd(practice.content) : "<p>Текст практики отсутствует.</p>");

    articleEl.innerHTML = `
      <header class="practice-header">
        <div class="practice-meta-row">
          <span class="badge badge-topic">📌 ${this.esc(practice.topic || "Общее")}</span>
          <span class="badge badge-group-info">👥 ${this.esc(groupLabel)}</span>
        </div>
        <h1 class="practice-main-title">${this.esc(practice.title)}</h1>
      </header>

      <div class="practice-body-content markdown-body">
        ${contentHtml}
      </div>
    `;

    // Render KaTeX math if needed
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(articleEl, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      } catch {}
    }
  }

  renderFallbackMd(md) {
    if (window.marked && window.marked.parse) {
      return window.marked.parse(md);
    }
    return `<pre style="white-space: pre-wrap;">${this.esc(md)}</pre>`;
  }

  esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new PracticesApp();
});
