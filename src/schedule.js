/**
 * Расписание — интерактивный календарь (неделя, месяц, список)
 * Фильтрация по группам и преподавателю, карточки событий
 */

class ScheduleApp {
  constructor() {
    this.events = [];
    this.currentView = (typeof window !== "undefined" && window.innerWidth <= 768) ? "list" : "week"; // "week" | "month" | "list"
    this.currentDate = new Date();
    this.selectedGroup = "all";
    this.teacherFilter = "";

    this.init();
  }

  async init() {
    const savedGroup = localStorage.getItem("dm_user_group");
    if (savedGroup) this.selectedGroup = savedGroup;

    // Sync active button state with initial view (e.g. list on mobile)
    document.querySelectorAll(".schedule-view-btn").forEach((btn) => {
      const isAct = btn.dataset.view === this.currentView;
      btn.classList.toggle("active", isAct);
      btn.classList.toggle("quiet", !isAct);
    });

    try {
      const cached = sessionStorage.getItem("dm_cached_schedule");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) this.events = parsed;
      }
    } catch {}

    this.bindEvents();
    if (this.events.length > 0) {
      this.render();
    }
    await this.fetchEvents();
    try {
      if (this.selectedGroup === "all" && !this.teacherFilter) {
        sessionStorage.setItem("dm_cached_schedule", JSON.stringify(this.events));
      }
    } catch {}
    this.render();
  }

  bindEvents() {
    // View switches
    document.querySelectorAll(".schedule-view-btn").forEach((btn) => {
      btn.onclick = () => {
        document.querySelectorAll(".schedule-view-btn").forEach((b) => b.classList.add("quiet"));
        btn.classList.remove("quiet");
        btn.classList.add("active");
        this.currentView = btn.dataset.view;
        this.render();
      };
    });

    // Navigation
    const prevBtn = document.getElementById("btn-sched-prev");
    const nextBtn = document.getElementById("btn-sched-next");
    const todayBtn = document.getElementById("btn-sched-today");

    if (prevBtn) {
      prevBtn.onclick = () => {
        if (this.currentView === "week") {
          this.currentDate.setDate(this.currentDate.getDate() - 7);
        } else {
          this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        }
        this.render();
      };
    }
    if (nextBtn) {
      nextBtn.onclick = () => {
        if (this.currentView === "week") {
          this.currentDate.setDate(this.currentDate.getDate() + 7);
        } else {
          this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        }
        this.render();
      };
    }
    if (todayBtn) {
      todayBtn.onclick = () => {
        this.currentDate = new Date();
        this.render();
      };
    }

    // Filter controls
    const groupSelect = document.getElementById("sched-filter-group");
    if (groupSelect) {
      if (Array.from(groupSelect.options).some((o) => o.value === this.selectedGroup)) {
        groupSelect.value = this.selectedGroup;
      }
      groupSelect.onchange = (e) => {
        this.selectedGroup = e.target.value;
        this.fetchEvents().then(() => this.render());
      };
    }

    const teacherInput = document.getElementById("sched-filter-teacher");
    if (teacherInput) {
      let timeout;
      teacherInput.oninput = (e) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          this.teacherFilter = e.target.value.trim();
          this.fetchEvents().then(() => this.render());
        }, 250);
      };
    }

    // Modal close
    const modal = document.getElementById("event-detail-modal");
    if (modal) {
      modal.querySelectorAll("[data-close]").forEach((btn) => {
        btn.onclick = () => modal.close();
      });
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.close();
      });
    }
  }

  async fetchEvents() {
    let url = "/api/schedule?";
    if (this.selectedGroup && this.selectedGroup !== "all") {
      url += `group=${encodeURIComponent(this.selectedGroup)}&`;
    }
    if (this.teacherFilter) {
      url += `teacher=${encodeURIComponent(this.teacherFilter)}&`;
    }

    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.events = Array.isArray(data.events) ? data.events : [];
      }
    } catch (e) {
      console.warn("Failed to fetch schedule events:", e);
    }
  }

  render() {
    this.updateHeaderPeriod();
    const viewport = document.getElementById("schedule-viewport");
    if (!viewport) return;

    if (this.currentView === "week") {
      this.renderWeek(viewport);
    } else if (this.currentView === "month") {
      this.renderMonth(viewport);
    } else {
      this.renderList(viewport);
    }
  }

  updateHeaderPeriod() {
    const periodEl = document.getElementById("sched-current-period");
    if (!periodEl) return;

    const months = [
      "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
      "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ];

    if (this.currentView === "month") {
      periodEl.textContent = `${months[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
    } else if (this.currentView === "week") {
      const start = this.getWeekStart(this.currentDate);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      periodEl.textContent = `${start.getDate()} ${months[start.getMonth()].slice(0, 3)} — ${end.getDate()} ${months[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
    } else {
      periodEl.textContent = `${months[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
    }
  }

  getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  renderWeek(container) {
    const start = this.getWeekStart(this.currentDate);
    const days = [];
    const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    let html = `
      <div class="schedule-week-grid">
        ${days.map((d, idx) => {
          const dStr = d.toISOString().slice(0, 10);
          const isToday = dStr === todayStr;
          const dayEvents = this.events.filter((ev) => ev.starts_at && ev.starts_at.slice(0, 10) === dStr);

          return `
            <div class="schedule-day-column ${isToday ? "today" : ""}">
              <div class="schedule-day-header">
                <span class="day-name">${dayNames[idx]}</span>
                <span class="day-num ${isToday ? "today-badge" : ""}">${d.getDate()}</span>
              </div>
              <div class="schedule-day-events">
                ${dayEvents.length === 0 ? `<div class="no-events">—</div>` : dayEvents.map((ev) => this.renderEventCard(ev)).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    container.innerHTML = html;
    this.bindCardClicks(container);
  }

  renderMonth(container) {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const start = this.getWeekStart(firstDay);
    const weeks = [];
    let cur = new Date(start);

    while (cur <= lastDay || cur.getDay() !== 1) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(week);
      if (cur > lastDay && cur.getDay() === 1) break;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

    let html = `
      <div class="schedule-month-table">
        <div class="schedule-month-head">
          ${dayNames.map((n) => `<div class="month-head-cell">${n}</div>`).join("")}
        </div>
        <div class="schedule-month-body">
          ${weeks.map((week) => `
            <div class="month-row">
              ${week.map((d) => {
                const dStr = d.toISOString().slice(0, 10);
                const isCurMonth = d.getMonth() === month;
                const isToday = dStr === todayStr;
                const dayEvents = this.events.filter((ev) => ev.starts_at && ev.starts_at.slice(0, 10) === dStr);

                return `
                  <div class="month-cell ${!isCurMonth ? "other-month" : ""} ${isToday ? "today" : ""}">
                    <div class="month-cell-header">
                      <span class="month-date-num">${d.getDate()}</span>
                    </div>
                    <div class="month-cell-events">
                      ${dayEvents.slice(0, 3).map((ev) => `
                        <div class="month-event-pill type-${ev.type || "lecture"}" data-id="${ev.id}">
                          <span class="ev-time-short">${this.formatTime(ev.starts_at)}</span>
                          <span class="ev-title-short">${this.esc(ev.title)}</span>
                        </div>
                      `).join("")}
                      ${dayEvents.length > 3 ? `<div class="month-more-badge">+${dayEvents.length - 3} ещё</div>` : ""}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `).join("")}
        </div>
      </div>
    `;

    container.innerHTML = html;
    this.bindCardClicks(container);
  }

  renderList(container) {
    if (this.events.length === 0) {
      container.innerHTML = `<div style="padding: 2.5rem; text-align: center; color: var(--muted);">Событий в расписании не найдено.</div>`;
      return;
    }

    // Group events by date
    const byDate = new Map();
    for (const ev of this.events) {
      const d = ev.starts_at ? ev.starts_at.slice(0, 10) : "Бессрочно";
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(ev);
    }

    let html = `<div class="schedule-list-container">`;
    for (const [dateStr, evList] of byDate.entries()) {
      let formattedDate = dateStr;
      try {
        formattedDate = new Date(dateStr).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
      } catch {}

      html += `
        <div class="sched-date-group">
          <div class="sched-date-heading">${formattedDate}</div>
          <div class="sched-date-items">
            ${evList.map((ev) => this.renderEventCard(ev, true)).join("")}
          </div>
        </div>
      `;
    }
    html += `</div>`;

    container.innerHTML = html;
    this.bindCardClicks(container);
  }

  renderEventCard(ev, expanded = false) {
    const typeLabels = {
      lecture: "Лекция",
      practice: "Практика",
      extra_lecture: "Доп. лекция",
      consultation: "Консультация",
    };
    const label = typeLabels[ev.type] || "Занятие";
    const timeRange = `${this.formatTime(ev.starts_at)}${ev.ends_at ? ` – ${this.formatTime(ev.ends_at)}` : ""}`;

    let groupsLabel = "Все группы";
    if (ev.groups && ev.groups !== "all") {
      try {
        const arr = JSON.parse(ev.groups);
        groupsLabel = Array.isArray(arr) ? arr.join(", ") : ev.groups;
      } catch {
        groupsLabel = ev.groups;
      }
    }

    return `
      <div class="schedule-event-card type-${ev.type || "lecture"}" data-id="${ev.id}">
        <div class="ev-card-top">
          <span class="ev-badge-type">${label}</span>
          <span class="ev-time">${timeRange}</span>
        </div>
        <div class="ev-card-title">${this.esc(ev.title)}</div>
        <div class="ev-card-meta">
          ${ev.location ? `<div class="ev-meta-row"><span class="ev-icon">📍</span> ${this.esc(ev.location)}</div>` : ""}
          ${ev.teacher_name ? `<div class="ev-meta-row"><span class="ev-icon">👤</span> ${this.esc(ev.teacher_name)}</div>` : ""}
          <div class="ev-meta-row"><span class="ev-icon">👥</span> ${this.esc(groupsLabel)}</div>
        </div>
        ${expanded && ev.description ? `<div class="ev-desc">${this.esc(ev.description)}</div>` : ""}
      </div>
    `;
  }

  bindCardClicks(container) {
    container.querySelectorAll(".schedule-event-card, .month-event-pill").forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.id;
        const ev = this.events.find((e) => e.id === id);
        if (ev) this.openDetailModal(ev);
      };
    });
  }

  openDetailModal(ev) {
    const modal = document.getElementById("event-detail-modal");
    const titleEl = document.getElementById("modal-ev-title");
    const typeEl = document.getElementById("modal-ev-type");
    const bodyEl = document.getElementById("modal-ev-body");
    if (!modal) return;

    const typeLabels = {
      lecture: "Лекция",
      practice: "Практика",
      extra_lecture: "Дополнительная лекция",
      consultation: "Консультация",
    };

    if (typeEl) {
      typeEl.textContent = typeLabels[ev.type] || "Занятие";
      typeEl.className = `badge badge-${ev.type || "normal"}`;
    }
    if (titleEl) titleEl.textContent = ev.title;

    let groupsLabel = "Все группы курса";
    if (ev.groups && ev.groups !== "all") {
      try {
        const arr = JSON.parse(ev.groups);
        groupsLabel = Array.isArray(arr) ? arr.join(", ") : ev.groups;
      } catch {
        groupsLabel = ev.groups;
      }
    }

    const timeRange = `${this.formatTime(ev.starts_at)}${ev.ends_at ? ` – ${this.formatTime(ev.ends_at)}` : ""}`;
    const dateStr = ev.starts_at ? new Date(ev.starts_at).toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.95rem;">
          <div><strong>Дата:</strong> ${dateStr}</div>
          <div><strong>Время:</strong> ${timeRange}</div>
          <div><strong>Место проведения:</strong> ${this.esc(ev.location || "Уточняется")}</div>
          <div><strong>Преподаватель:</strong> ${this.esc(ev.teacher_name || "Не указан")}</div>
          <div><strong>Учебные группы:</strong> ${this.esc(groupsLabel)}</div>
          ${ev.description ? `<div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border); color: var(--muted);">${this.esc(ev.description)}</div>` : ""}
        </div>
      `;
    }

    modal.showModal();
  }

  formatTime(isoString) {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    } catch {
      return "";
    }
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
  window.scheduleApp = new ScheduleApp();
});
