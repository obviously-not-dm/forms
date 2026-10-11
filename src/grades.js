/**
 * Электронный журнал оценок (Google Таблицы)
 * Вкладки групп, фильтрация по ФИО, inline-редактирование преподавателя на onBlur
 */

class GradesApp {
  constructor() {
    this.sheetData = null;
    this.sheetCache = new Map();
    this.selectedGroup = "all";
    this.searchQuery = "";
    this.currentUser = null;

    this.init();
  }

  async init() {
    this.currentUser = window.dmUser || null;
    if (!this.currentUser) {
      try {
        const cached = sessionStorage.getItem("dm_cached_user");
        if (cached) this.currentUser = JSON.parse(cached);
      } catch {}
    }

    try {
      const cachedSheet = sessionStorage.getItem("dm_cached_grades_all");
      if (cachedSheet) {
        this.sheetData = JSON.parse(cachedSheet);
      }
    } catch {}

    this.bindEvents();
    if (this.sheetData) {
      this.render();
    }

    await Promise.all([this.checkAuth(), this.fetchGrades(true)]);
    this.render();
  }

  async checkAuth() {
    const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const res = await fetch("/api/auth/session", { headers, credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.currentUser = data.user;
          const notice = document.getElementById("teacher-edit-notice");
          if (notice && this.currentUser.role === "admin") {
            notice.hidden = false;
          }
        }
      }
    } catch {}
  }

  bindEvents() {
    window.addEventListener("dm:auth-updated", (e) => {
      this.currentUser = e.detail || null;
      const notice = document.getElementById("teacher-edit-notice");
      if (notice) notice.hidden = this.currentUser?.role !== "admin";
      this.render();
    });

    const tabsContainer = document.getElementById("grades-group-tabs");
    if (tabsContainer) {
      tabsContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".grades-group-tab");
        if (btn) {
          tabsContainer.querySelectorAll(".grades-group-tab").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          this.selectedGroup = btn.dataset.group;
          this.fetchGrades().then(() => this.render());
        }
      });
    }

    const searchInput = document.getElementById("grades-search-input");
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = (e.target.value || "").trim().toLowerCase();
        this.render();
      };
    }
  }

  async fetchGrades(forceRefresh = false) {
    const groupKey = this.selectedGroup || "all";
    if (!forceRefresh && this.sheetCache.has(groupKey)) {
      this.sheetData = this.sheetCache.get(groupKey);
      return;
    }

    let url = "/api/grades";
    if (groupKey !== "all") {
      url += `?group=${encodeURIComponent(groupKey)}`;
    }

    try {
      const res = await fetch(url);
      if (res.ok) {
        this.sheetData = await res.json();
        this.sheetCache.set(groupKey, this.sheetData);
        if (groupKey === "all") {
          try { sessionStorage.setItem("dm_cached_grades_all", JSON.stringify(this.sheetData)); } catch {}
        }
      }
    } catch (e) {
      console.warn("Failed to fetch grades sheet:", e);
    }
  }

  render() {
    const container = document.getElementById("grades-table-container");
    if (!container) return;

    if (!this.sheetData || !Array.isArray(this.sheetData.rows)) {
      container.innerHTML = `<p class="table-loading">Ошибка загрузки журнала оценок.</p>`;
      return;
    }

    const columns = this.sheetData.columns || [];
    let rows = this.sheetData.rows;

    if (this.searchQuery) {
      rows = rows.filter((r) => (r.name || "").toLowerCase().includes(this.searchQuery));
    }

    if (rows.length === 0) {
      container.innerHTML = `<div style="padding: 2.5rem; text-align: center; color: var(--muted);">Студентов не найдено.</div>`;
      return;
    }

    const isAdmin = this.currentUser?.role === "admin";

    let html = `
      <table class="grades-spreadsheet-table">
        <thead>
          <tr>
            <th class="col-fixed-num">#</th>
            <th class="col-fixed-name">Студент</th>
            <th class="col-fixed-group">Группа</th>
            ${columns.map((c) => `
              <th class="col-task ${c.is_calculated ? "col-calculated" : ""}" title="${c.is_calculated ? `Формула: ${this.esc(c.formula || "SUM")}` : `Макс. балл: ${c.max}`}">
                <div class="col-header-wrap">
                  <span class="col-title">${this.esc(c.title)}</span>
                </div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 0.35rem; margin-top: 0.2rem;">
                  <span class="col-max">${c.max} pts</span>
                  ${c.is_calculated ? `<span class="col-fx-badge" title="${this.esc(c.formula || "SUM")}">fx</span>` : ""}
                </div>
              </th>
            `).join("")}
            <th class="col-total">Итог</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, idx) => `
            <tr data-user-id="${this.esc(row.userId)}">
              <td class="cell-num">${idx + 1}</td>
              <td class="cell-name">
                <span class="student-name-text">${this.esc(row.name)}</span>
              </td>
              <td class="cell-group">${this.esc(row.group)}</td>
              ${columns.map((col) => {
                const val = row.scores[col.key] !== undefined ? row.scores[col.key] : "";
                if (col.is_calculated) {
                  return `
                    <td class="cell-score cell-calculated"
                        data-col="${this.esc(col.key)}"
                        data-user="${this.esc(row.userId)}"
                        title="Вычисляется по формуле: ${this.esc(col.formula || "SUM")}">
                      ${val !== "" ? val : "0"}
                    </td>
                  `;
                }
                const editableAttr = isAdmin ? `contenteditable="true" spellcheck="false"` : "";
                return `
                  <td class="cell-score ${isAdmin ? "editable" : ""}"
                      data-col="${this.esc(col.key)}"
                      data-user="${this.esc(row.userId)}"
                      ${editableAttr}>
                    ${val !== "" ? val : "—"}
                  </td>
                `;
              }).join("")}
              <td class="cell-total" id="total-${this.esc(row.userId)}">
                <strong>${row.total}</strong>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    container.innerHTML = html;

    if (isAdmin) {
      this.bindInlineEditing(container);
    }
  }

  bindInlineEditing(container) {
    const cells = container.querySelectorAll('.cell-score[contenteditable="true"]');
    cells.forEach((cell) => {
      let initialVal = "";

      cell.onfocus = () => {
        initialVal = cell.textContent.trim();
        if (initialVal === "—") cell.textContent = "";
        cell.classList.add("editing");
      };

      cell.onkeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          cell.blur();
        } else if (e.key === "Escape") {
          cell.textContent = initialVal;
          cell.blur();
        }
      };

      cell.onblur = async () => {
        cell.classList.remove("editing");
        let valStr = cell.textContent.trim();
        if (valStr === "" || valStr === "—") {
          valStr = "0";
          cell.textContent = "—";
        }

        const scoreNum = parseFloat(valStr);
        if (isNaN(scoreNum)) {
          cell.textContent = initialVal;
          return;
        }

        cell.textContent = scoreNum;
        if (String(scoreNum) === initialVal) return; // No change

        const userId = cell.dataset.user;
        const columnKey = cell.dataset.col;

        cell.classList.add("saving");

        const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        try {
          const res = await fetch("/api/admin/grades", {
            method: "PUT",
            headers,
            credentials: "same-origin",
            body: JSON.stringify({
              user_id: userId,
              column_key: columnKey,
              score: scoreNum,
            }),
          });

          if (res.ok) {
            cell.classList.remove("saving");
            cell.classList.add("saved");
            setTimeout(() => cell.classList.remove("saved"), 1000);
            this.recalculateRowTotal(userId);
          } else {
            cell.classList.remove("saving");
            cell.classList.add("error");
          }
        } catch {
          cell.classList.remove("saving");
          cell.classList.add("error");
        }
      };
    });
  }

  recalculateRowTotal(userId) {
    const row = document.querySelector(`tr[data-user-id="${userId}"]`);
    if (!row) return;

    let total = 0;
    row.querySelectorAll(".cell-score:not(.cell-calculated)").forEach((c) => {
      const val = parseFloat(c.textContent.trim());
      if (!isNaN(val)) total += val;
    });

    const totalEl = document.getElementById(`total-${userId}`);
    if (totalEl) totalEl.innerHTML = `<strong>${total}</strong>`;
  }

  esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.gradesApp = new GradesApp();
});
