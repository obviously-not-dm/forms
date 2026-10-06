/**
 * Домашние задания — клиентский модуль с загрузкой и проверкой PDF
 */

class HomeworksApp {
  constructor() {
    this.homeworks = window.__HOMEWORKS_DATA__ || [];
    this.selectedId = null;
    this.selectedGroup = "all";
    this.searchQuery = "";
    this.currentUser = null;
    this.selectedFile = null;

    this.init();
  }

  async init() {
    const savedGroup = localStorage.getItem("dm_user_group");
    if (savedGroup) {
      this.selectedGroup = savedGroup;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get("id") || window.location.hash.replace("#", "");
    if (paramId) {
      this.selectedId = paramId;
    }

    await this.checkAuthAndFetch();
    this.bindEvents();
    this.render();
  }

  async checkAuthAndFetch() {
    const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const sessRes = await fetch("/api/auth/session", { headers });
      if (sessRes.ok) {
        const sessData = await sessRes.json();
        if (sessData.authenticated && sessData.user) {
          this.currentUser = sessData.user;
          if (this.currentUser.group_name && !this.selectedGroup) {
            this.selectedGroup = this.currentUser.group_name;
          }
        }
      }
    } catch {}

    try {
      const hwRes = await fetch("/api/homeworks", { headers });
      if (hwRes.ok) {
        const hwData = await hwRes.json();
        if (Array.isArray(hwData.homeworks) && hwData.homeworks.length > 0) {
          this.homeworks = hwData.homeworks;
        }
      }
    } catch {}
  }

  bindEvents() {
    const groupSelect = document.getElementById("homework-group-select");
    if (groupSelect) {
      if (Array.from(groupSelect.options).some((o) => o.value === this.selectedGroup)) {
        groupSelect.value = this.selectedGroup;
      }
      groupSelect.onchange = (e) => {
        this.selectedGroup = e.target.value;
        this.renderList();
      };
    }

    const searchInput = document.getElementById("homeworks-search");
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = (e.target.value || "").trim().toLowerCase();
        this.renderList();
      };
    }

    const mobileBtn = document.getElementById("homeworks-menu-btn");
    const sidebar = document.getElementById("homeworks-sidebar");
    if (mobileBtn && sidebar) {
      mobileBtn.onclick = () => {
        sidebar.classList.toggle("open");
      };
    }
  }

  getFilteredHomeworks() {
    return this.homeworks.filter((h) => {
      if (this.selectedGroup && this.selectedGroup !== "all") {
        if (h.group_name && h.group_name !== "all" && h.group_name !== this.selectedGroup) {
          return false;
        }
      }
      if (this.searchQuery) {
        const matchTitle = (h.title || "").toLowerCase().includes(this.searchQuery);
        const matchTopic = (h.topic || "").toLowerCase().includes(this.searchQuery);
        if (!matchTitle && !matchTopic) return false;
      }
      return true;
    });
  }

  render() {
    this.renderList();
    if (!this.selectedId && this.homeworks.length > 0) {
      const filtered = this.getFilteredHomeworks();
      if (filtered.length > 0) {
        this.selectHomework(filtered[0].id);
      } else {
        this.selectHomework(this.homeworks[0].id);
      }
    } else if (this.selectedId) {
      this.renderDetail();
    }
  }

  renderList() {
    const listEl = document.getElementById("homeworks-cards-list");
    if (!listEl) return;

    const filtered = this.getFilteredHomeworks();
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--muted); font-size: 0.9rem;">
          Домашних заданий не найдено
        </div>`;
      return;
    }

    let html = "";
    for (const hw of filtered) {
      const isActive = hw.id === this.selectedId;
      const sub = hw.user_submission;

      // Status badge
      let statusBadge = `<span class="hw-status-badge status-none">Не сдано</span>`;
      if (sub) {
        if (sub.status === "passed") {
          statusBadge = `<span class="hw-status-badge status-passed">Зачёт · ${sub.score}/${hw.max_score}</span>`;
        } else if (sub.status === "pending") {
          statusBadge = `<span class="hw-status-badge status-pending">На проверке ⏳</span>`;
        } else if (sub.status === "revise") {
          statusBadge = `<span class="hw-status-badge status-revise">На доработке ⚠️</span>`;
        } else if (sub.status === "failed") {
          statusBadge = `<span class="hw-status-badge status-failed">Незачёт · ${sub.score}/${hw.max_score}</span>`;
        }
      }

      // Deadline info
      const deadlineInfo = this.formatDeadlineToBadge(hw.deadline);

      html += `
        <button type="button" class="hw-nav-card ${isActive ? "active" : ""}" data-id="${this.esc(hw.id)}">
          <div class="hw-card-top">
            <span class="hw-card-topic">📌 ${this.esc(hw.topic || "Общее")}</span>
            ${deadlineInfo}
          </div>
          <div class="hw-card-title">${this.esc(hw.title)}</div>
          <div class="hw-card-footer">
            <span class="hw-max-score">Макс: ${hw.max_score} б.</span>
            ${statusBadge}
          </div>
        </button>
      `;
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll(".hw-nav-card").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        this.selectHomework(id);
        const sidebar = document.getElementById("homeworks-sidebar");
        if (sidebar && sidebar.classList.contains("open")) {
          sidebar.classList.remove("open");
        }
      };
    });
  }

  selectHomework(id) {
    this.selectedId = id;
    this.selectedFile = null;
    try {
      history.replaceState(null, "", `?id=${encodeURIComponent(id)}`);
    } catch {}

    this.renderList();
    this.renderDetail();
  }

  renderDetail() {
    const detailEl = document.getElementById("homework-detail-sheet");
    if (!detailEl) return;

    const hw = this.homeworks.find((h) => h.id === this.selectedId);
    if (!hw) {
      detailEl.innerHTML = `
        <div style="padding: 2.5rem; text-align: center; color: var(--muted);">
          Выберите домашнее задание из списка слева
        </div>`;
      return;
    }

    const sub = hw.user_submission;
    const groupLabel = hw.group_name && hw.group_name !== "all"
      ? `Группа: ${this.esc(hw.group_name)}`
      : "Для всех групп";

    const contentHtml = hw.html || (hw.content ? this.renderFallbackMd(hw.content) : "<p>Условия задач отсутствуют.</p>");

    // Submission section HTML
    let submissionHtml = "";
    if (!this.currentUser) {
      submissionHtml = `
        <div class="hw-auth-callout">
          <div class="hw-auth-callout-icon">🔒</div>
          <div class="hw-auth-callout-text">
            <h3>Требуется авторизация</h3>
            <p>Чтобы отправить выполненное домашнее задание на проверку, пожалуйста, войдите под своим аккаунтом студента.</p>
            <button type="button" class="btn primary" onclick="document.getElementById('btn-auth-open')?.click()">
              👤 Войти в систему
            </button>
          </div>
        </div>
      `;
    } else {
      // User is logged in
      let subStatusBlock = "";
      if (sub) {
        const dateStr = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString("ru-RU") : "";
        let verdictBadge = "";
        if (sub.status === "passed") {
          verdictBadge = `<span class="badge badge-success" style="font-size: 0.95rem; padding: 0.35rem 0.75rem;">✅ Зачёт (${sub.score} / ${hw.max_score} баллов)</span>`;
        } else if (sub.status === "pending") {
          verdictBadge = `<span class="badge badge-warning" style="font-size: 0.95rem; padding: 0.35rem 0.75rem;">⏳ На проверке у преподавателя</span>`;
        } else if (sub.status === "revise") {
          verdictBadge = `<span class="badge badge-warning" style="font-size: 0.95rem; padding: 0.35rem 0.75rem;">⚠️ Требуется доработка</span>`;
        } else if (sub.status === "failed") {
          verdictBadge = `<span class="badge badge-danger" style="font-size: 0.95rem; padding: 0.35rem 0.75rem;">❌ Незачёт (${sub.score} / ${hw.max_score} баллов)</span>`;
        }

        const fileDownloadUrl = `/api/uploads/homeworks/${encodeURIComponent(sub.file_path)}`;

        subStatusBlock = `
          <div class="hw-current-submission-card">
            <div class="hw-sub-header">
              <span class="hw-sub-title">Ваша отправленная работа</span>
              ${verdictBadge}
            </div>
            <div class="hw-sub-details">
              <div><strong>Файл:</strong> <a href="${fileDownloadUrl}" target="_blank" rel="noopener" class="hw-file-link">📄 ${this.esc(sub.file_name)}</a></div>
              <div><strong>Дата отправки:</strong> ${dateStr}</div>
              ${sub.reviewed_at ? `<div><strong>Дата проверки:</strong> ${new Date(sub.reviewed_at).toLocaleString("ru-RU")}</div>` : ""}
            </div>
            ${sub.teacher_comment ? `
              <div class="hw-teacher-feedback">
                <div class="feedback-title">💬 Комментарий преподавателя:</div>
                <div class="feedback-text">${this.esc(sub.teacher_comment)}</div>
              </div>
            ` : ""}
          </div>
        `;
      }

      submissionHtml = `
        ${subStatusBlock}
        <div class="hw-upload-card">
          <h3 class="hw-upload-title">${sub ? "🔄 Загрузить новую версию работы (PDF)" : "📤 Загрузка решения (PDF)"}</h3>
          <p class="hw-upload-desc">Загрузите файл строго в формате <strong>PDF</strong> (до 25 МБ). При повторной загрузке файл будет перезаписан.</p>

          <div class="pdf-dropzone" id="pdf-dropzone">
            <input type="file" id="pdf-file-input" accept=".pdf,application/pdf" style="display: none;">
            <div class="dropzone-content" id="dropzone-content">
              <span class="dropzone-icon">📄</span>
              <span class="dropzone-text">Перетащите PDF сюда или <strong style="color: var(--accent); cursor: pointer;">выберите файл</strong></span>
              <span class="dropzone-limit">Максимальный размер: 25 МБ</span>
            </div>
          </div>

          <div class="selected-file-row" id="selected-file-row" hidden>
            <span class="file-icon">📎</span>
            <span class="file-name" id="selected-file-name"></span>
            <span class="file-size" id="selected-file-size"></span>
            <button type="button" class="btn quiet btn-sm file-remove-btn" id="btn-remove-file" title="Удалить">✕</button>
          </div>

          <div class="upload-action-row">
            <div id="upload-feedback" class="upload-feedback" hidden></div>
            <button type="button" class="btn primary" id="btn-submit-hw" disabled>
              🚀 Отправить на проверку
            </button>
          </div>
        </div>
      `;
    }

    detailEl.innerHTML = `
      <header class="hw-detail-header">
        <div class="hw-meta-row">
          <span class="badge badge-topic">📌 ${this.esc(hw.topic || "Общее")}</span>
          <span class="badge badge-group-info">👥 ${this.esc(groupLabel)}</span>
          <span class="badge badge-score">⭐ Макс. балл: ${hw.max_score}</span>
          ${this.formatDeadlineToBadge(hw.deadline, true)}
        </div>
        <h1 class="hw-main-title">${this.esc(hw.title)}</h1>
      </header>

      <section class="hw-tasks-container markdown-body">
        ${contentHtml}
      </section>

      <section class="hw-submission-section">
        ${submissionHtml}
      </section>
    `;

    // Render KaTeX in formulas
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(detailEl, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      } catch {}
    }

    this.bindUploadEvents();
  }

  bindUploadEvents() {
    const dropzone = document.getElementById("pdf-dropzone");
    const fileInput = document.getElementById("pdf-file-input");
    const submitBtn = document.getElementById("btn-submit-hw");
    const removeBtn = document.getElementById("btn-remove-file");

    if (!dropzone || !fileInput) return;

    dropzone.onclick = () => fileInput.click();

    fileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleFileSelected(e.target.files[0]);
      }
    };

    dropzone.ondragover = (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    };

    dropzone.ondragleave = () => {
      dropzone.classList.remove("dragover");
    };

    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer?.files && e.dataTransfer.files[0]) {
        this.handleFileSelected(e.dataTransfer.files[0]);
      }
    };

    if (removeBtn) {
      removeBtn.onclick = () => {
        this.selectedFile = null;
        fileInput.value = "";
        document.getElementById("selected-file-row")?.setAttribute("hidden", "true");
        if (submitBtn) submitBtn.disabled = true;
      };
    }

    if (submitBtn) {
      submitBtn.onclick = () => this.uploadSubmission();
    }
  }

  handleFileSelected(file) {
    const feedback = document.getElementById("upload-feedback");
    const submitBtn = document.getElementById("btn-submit-hw");

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      if (feedback) {
        feedback.textContent = "Ошибка: поддерживаются только файлы в формате PDF (.pdf)";
        feedback.className = "upload-feedback error";
        feedback.hidden = false;
      }
      return;
    }

    if (file.size > 26 * 1024 * 1024) {
      if (feedback) {
        feedback.textContent = "Ошибка: размер файла превышает лимит 25 МБ";
        feedback.className = "upload-feedback error";
        feedback.hidden = false;
      }
      return;
    }

    if (feedback) feedback.hidden = true;

    this.selectedFile = file;

    const row = document.getElementById("selected-file-row");
    const nameEl = document.getElementById("selected-file-name");
    const sizeEl = document.getElementById("selected-file-size");

    if (row && nameEl && sizeEl) {
      nameEl.textContent = file.name;
      sizeEl.textContent = `(${(file.size / (1024 * 1024)).toFixed(2)} МБ)`;
      row.removeAttribute("hidden");
    }

    if (submitBtn) submitBtn.disabled = false;
  }

  async uploadSubmission() {
    if (!this.selectedFile || !this.selectedId) return;

    const submitBtn = document.getElementById("btn-submit-hw");
    const feedback = document.getElementById("upload-feedback");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "⏳ Загрузка PDF...";
    }
    if (feedback) {
      feedback.textContent = "Отправка файла на сервер...";
      feedback.className = "upload-feedback info";
      feedback.hidden = false;
    }

    const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const formData = new FormData();
      formData.append("file", this.selectedFile, this.selectedFile.name);

      const res = await fetch(`/api/homeworks/${encodeURIComponent(this.selectedId)}/submit`, {
        method: "POST",
        headers,
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Не удалось отправить файл");
      }

      if (feedback) {
        feedback.textContent = "✅ Работа успешно отправлена на проверку!";
        feedback.className = "upload-feedback success";
        feedback.hidden = false;
      }

      // Refresh homeworks list to show updated submission
      await this.checkAuthAndFetch();
      setTimeout(() => {
        this.selectHomework(this.selectedId);
      }, 700);
    } catch (err) {
      if (feedback) {
        feedback.textContent = `Ошибка: ${err.message}`;
        feedback.className = "upload-feedback error";
        feedback.hidden = false;
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "🚀 Отправить на проверку";
      }
    }
  }

  formatDeadlineToBadge(deadline, detailed = false) {
    if (!deadline) return "";
    try {
      const d = new Date(deadline);
      if (isNaN(d.getTime())) return "";

      const now = new Date();
      const diffMs = d - now;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const dateStr = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) +
        " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");

      if (diffMs < 0) {
        return `<span class="badge badge-deadline badge-expired" title="Дедлайн: ${dateStr}">⌛ Дедлайн прошёл</span>`;
      }
      if (diffDays <= 3) {
        return `<span class="badge badge-deadline badge-urgent" title="Дедлайн: ${dateStr}">⏳ Осталось ${diffDays} дн.</span>`;
      }
      return `<span class="badge badge-deadline badge-normal" title="Дедлайн: ${dateStr}">🗓️ До ${dateStr}</span>`;
    } catch {
      return "";
    }
  }

  renderFallbackMd(md) {
    let text = String(md || "");
    const mathMap = new Map();
    let mathCounter = 0;

    // Preserve block formulas $$...$$
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
      const key = `%%MATH_BLOCK_${mathCounter++}%%`;
      let rendered = `<div class="katex-display">$$${tex}$$</div>`;
      if (window.katex) {
        try {
          rendered = `<div class="katex-display">${window.katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false })}</div>`;
        } catch {}
      }
      mathMap.set(key, rendered);
      return key;
    });

    // Preserve inline formulas $...$
    text = text.replace(/(?<!\\)\$([^\n$]+?)(?<!\\)\$/g, (_, tex) => {
      const key = `%%MATH_INLINE_${mathCounter++}%%`;
      let rendered = `<code>$${tex}$</code>`;
      if (window.katex) {
        try {
          rendered = window.katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
        } catch {}
      }
      mathMap.set(key, rendered);
      return key;
    });

    // Callout blocks
    const calloutMap = new Map();
    let calloutCounter = 0;
    const icons = { note: "ℹ️", tip: "💡", important: "📌", warning: "⚠️", caution: "🛑" };
    const titles = { note: "Заметка", tip: "Совет", important: "Важно", warning: "Внимание", caution: "Осторожно" };

    text = text.replace(/(?:^|\n)([ \t]*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*(?:\n[^\n]+)*)/gi, (m, block) => {
      const lines = block.split("\n");
      const quoted = lines.map((line) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith(">")) return line;
        return "> " + line;
      }).join("\n");
      return "\n" + quoted;
    });

    text = text.replace(/^>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][^\n]*(?:\n(?:>[^\n]*(?:\n|$))*|$)/gim, (fullMatch) => {
      const lines = fullMatch.split("\n");
      const firstLine = lines[0] || "";
      const typeMatch = firstLine.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
      const type = typeMatch ? typeMatch[1].toLowerCase() : "note";
      const headerExtra = firstLine.replace(/^>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, "").trim();

      const bodyLines = [];
      if (headerExtra) bodyLines.push(headerExtra);
      for (let i = 1; i < lines.length; i++) {
        const l = lines[i];
        if (/^>[ \t]?/.test(l)) {
          bodyLines.push(l.replace(/^>[ \t]?/, ""));
        } else if (l.trim()) {
          bodyLines.push(l);
        }
      }
      const cleanBody = bodyLines.join("\n").trim();
      const bodyHtml = window.marked && window.marked.parse
        ? (typeof window.marked.parse === "function" ? window.marked.parse(cleanBody) : window.marked(cleanBody))
        : `<p>${this.esc(cleanBody).replace(/\n/g, "<br>")}</p>`;
      const calloutHtml = `<div class="note-callout callout-${type}">\n  <div class="callout-header"><span class="callout-icon">${icons[type] || "ℹ️"}</span> <span class="callout-title">${titles[type] || type}</span></div>\n  <div class="callout-body">\n${bodyHtml}\n  </div>\n</div>`;

      const key = `%%CALLOUT_BLOCK_${calloutCounter++}%%`;
      calloutMap.set(key, calloutHtml);
      return `\n\n${key}\n\n`;
    });

    let html = "";
    if (window.marked) {
      const parseFn = typeof window.marked.parse === "function" ? window.marked.parse : window.marked;
      html = parseFn(text, { gfm: true, breaks: true });
    } else {
      html = text.split(/\n{2,}/).map(p => `<p>${this.esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("\n");
    }

    for (const [key, val] of calloutMap.entries()) {
      html = html.replace(new RegExp(`<p>\\s*${key}\\s*<\\/p>|${key}`, "g"), val);
    }

    for (const [key, val] of mathMap.entries()) {
      html = html.split(key).join(val);
    }
    return html;
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
  new HomeworksApp();
});
