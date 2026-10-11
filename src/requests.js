/**
 * Заявки на консультации и доп. лекции — клиентский модуль
 * Подача заявки студентом и просмотр истории обращений со статусами
 */

class RequestsApp {
  constructor() {
    this.currentUser = null;
    this.requests = [];

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

    this.bindEvents();
    await this.checkAuth();
    if (this.currentUser) {
      await this.fetchMyRequests();
      this.renderHistory();
    }
  }

  updateAuthUi() {
    const authWarn = document.getElementById("request-auth-warn");
    const submitBtn = document.getElementById("btn-submit-request");
    if (!this.currentUser) {
      if (authWarn) authWarn.hidden = false;
      if (submitBtn) submitBtn.disabled = true;
    } else {
      if (authWarn) authWarn.hidden = true;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async checkAuth() {
    this.updateAuthUi();
    const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const res = await fetch("/api/auth/session", { headers, credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.currentUser = data.user;
        } else {
          this.currentUser = null;
        }
      }
    } catch {}

    this.updateAuthUi();
  }

  bindEvents() {
    window.addEventListener("dm:auth-updated", async (e) => {
      this.currentUser = e.detail || null;
      this.updateAuthUi();
      if (this.currentUser) {
        await this.fetchMyRequests();
        this.renderHistory();
      }
    });

    const form = document.getElementById("consult-request-form");
    if (form) {
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!this.currentUser) return;

        const type = document.getElementById("req-type")?.value || "consultation";
        const topic = document.getElementById("req-topic")?.value.trim();
        const preferred_time = document.getElementById("req-time")?.value.trim();
        const comment = document.getElementById("req-comment")?.value.trim();
        const errEl = document.getElementById("req-error");
        const succEl = document.getElementById("req-success");
        const submitBtn = document.getElementById("btn-submit-request");

        if (errEl) errEl.hidden = true;
        if (succEl) succEl.hidden = true;

        if (!topic || !preferred_time) {
          if (errEl) {
            errEl.textContent = "Пожалуйста, заполните тему и предпочтительное время.";
            errEl.hidden = false;
          }
          return;
        }

        submitBtn.disabled = true;
        const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        try {
          const res = await fetch("/api/consultations/requests", {
            method: "POST",
            headers,
            credentials: "same-origin",
            body: JSON.stringify({ type, topic, preferred_time, comment }),
          });

          const data = await res.json();
          if (res.ok && data.ok) {
            if (succEl) succEl.hidden = false;
            form.reset();
            await this.fetchMyRequests();
            this.renderHistory();
            setTimeout(() => { if (succEl) succEl.hidden = true; }, 3000);
          } else {
            if (errEl) {
              errEl.textContent = data.error || "Ошибка при создании заявки";
              errEl.hidden = false;
            }
          }
        } catch {
          if (errEl) {
            errEl.textContent = "Ошибка сети при отправке заявки";
            errEl.hidden = false;
          }
        } finally {
          submitBtn.disabled = false;
        }
      };
    }
  }

  async fetchMyRequests() {
    const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const res = await fetch("/api/consultations/my", { headers, credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        this.requests = Array.isArray(data.requests) ? data.requests : [];
      }
    } catch (e) {
      console.warn("Failed to fetch my requests:", e);
    }
  }

  renderHistory() {
    const container = document.getElementById("requests-history-list");
    if (!container) return;

    if (!this.currentUser) {
      container.innerHTML = `<p class="muted">Войдите в аккаунт, чтобы просмотреть свои заявки.</p>`;
      return;
    }

    if (this.requests.length === 0) {
      container.innerHTML = `<p class="muted">У вас пока нет отправленных заявок.</p>`;
      return;
    }

    const typeLabels = {
      consultation: "Консультация",
      extra_lecture: "Доп. лекция",
    };

    container.innerHTML = this.requests.map((r) => {
      let statusBadge = "";
      if (r.status === "approved") {
        statusBadge = `<span class="badge badge-success" style="font-family: var(--font-mono); font-size: 0.8rem;">Одобрено</span>`;
      } else if (r.status === "rejected") {
        statusBadge = `<span class="badge badge-danger" style="font-family: var(--font-mono); font-size: 0.8rem;">Отклонено</span>`;
      } else {
        statusBadge = `<span class="badge badge-warning" style="font-family: var(--font-mono); font-size: 0.8rem;">На рассмотрении</span>`;
      }

      const dateStr = r.created_at ? new Date(r.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";

      return `
        <div class="request-history-item" style="padding: 1.15rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); margin-bottom: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <div>
              <span class="badge" style="margin-right: 0.5rem; font-size: 0.75rem;">${typeLabels[r.type] || "Консультация"}</span>
              <strong style="font-size: 1rem;">${this.esc(r.topic)}</strong>
            </div>
            ${statusBadge}
          </div>
          <div style="font-size: 0.88rem; color: var(--muted); margin-bottom: 0.5rem;">
            <span>🗓️ Слот: ${this.esc(r.preferred_time)}</span> · <span>Отправлено: ${dateStr}</span>
          </div>
          ${r.comment ? `<p style="font-size: 0.9rem; margin: 0.25rem 0 0.5rem; color: var(--fg);">${this.esc(r.comment)}</p>` : ""}
          ${r.teacher_comment ? `
            <div style="margin-top: 0.6rem; padding: 0.6rem 0.8rem; background: var(--surface-light, rgba(255,255,255,0.03)); border-left: 3px solid var(--accent); border-radius: var(--radius-sm); font-size: 0.88rem;">
              <strong style="color: var(--accent);">Ответ преподавателя:</strong> ${this.esc(r.teacher_comment)}
            </div>
          ` : ""}
        </div>
      `;
    }).join("");
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
  window.requestsApp = new RequestsApp();
});
