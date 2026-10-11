/**
 * Типовые расчетные работы — клиентский модуль
 * Индивидуальный вариант студента, формулы KaTeX и PDF Drop-box
 */

class TypoviksApp {
  constructor() {
    this.typoviks = [];
    this.selectedId = null;
    this.selectedGroup = "all";
    this.searchQuery = "";
    this.currentUser = null;
    this.variantData = null;
    this.variantCache = new Map();
    this.selectedFile = null;

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

    const savedGroup = localStorage.getItem("dm_user_group");
    if (savedGroup) this.selectedGroup = savedGroup;
    else if (this.currentUser?.group_name) this.selectedGroup = this.currentUser.group_name;

    const urlParams = new URLSearchParams(window.location.search);
    const paramId = urlParams.get("id") || window.location.hash.replace("#", "");
    if (paramId) this.selectedId = paramId;

    try {
      const cachedTyp = sessionStorage.getItem("dm_cached_typoviks");
      if (cachedTyp) {
        const parsed = JSON.parse(cachedTyp);
        if (Array.isArray(parsed) && parsed.length > 0) this.typoviks = parsed;
      }
    } catch {}

    this.bindEvents();
    if (this.typoviks.length > 0) {
      this.render();
    }

    await this.checkAuthAndFetch();
    this.render();
  }

  async checkAuthAndFetch() {
    const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const [sessRes, typRes] = await Promise.all([
        fetch("/api/auth/session", { headers, credentials: "same-origin" }).catch(() => null),
        fetch("/api/typoviks", { headers, credentials: "same-origin" }).catch(() => null),
      ]);

      if (sessRes && sessRes.ok) {
        const sessData = await sessRes.json();
        if (sessData.authenticated && sessData.user) {
          this.currentUser = sessData.user;
          if (this.currentUser.group_name && (!this.selectedGroup || this.selectedGroup === "all")) {
            this.selectedGroup = this.currentUser.group_name;
          }
        } else {
          this.currentUser = null;
        }
      }

      if (typRes && typRes.ok) {
        const typData = await typRes.json();
        if (Array.isArray(typData.typoviks)) {
          this.typoviks = typData.typoviks;
          try { sessionStorage.setItem("dm_cached_typoviks", JSON.stringify(this.typoviks)); } catch {}
        }
      }
    } catch {}
  }

  bindEvents() {
    window.addEventListener("dm:auth-updated", (e) => {
      this.currentUser = e.detail || null;
      this.variantCache.clear();
      this.render();
    });

    const groupSelect = document.getElementById("typovik-group-select");
    if (groupSelect) {
      if (Array.from(groupSelect.options).some((o) => o.value === this.selectedGroup)) {
        groupSelect.value = this.selectedGroup;
      }
      groupSelect.onchange = (e) => {
        this.selectedGroup = e.target.value;
        this.renderList();
      };
    }

    const searchInput = document.getElementById("typoviks-search");
    if (searchInput) {
      searchInput.oninput = (e) => {
        this.searchQuery = (e.target.value || "").trim().toLowerCase();
        this.renderList();
      };
    }

    const mobileBtn = document.getElementById("typoviks-menu-btn");
    const sidebar = document.getElementById("typoviks-sidebar");
    if (mobileBtn && sidebar) {
      mobileBtn.onclick = (e) => {
        e.stopPropagation();
        sidebar.classList.toggle("open");
      };
      document.addEventListener("click", (e) => {
        if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !mobileBtn.contains(e.target)) {
          sidebar.classList.remove("open");
        }
      });
    }
  }

  getFilteredTypoviks() {
    return this.typoviks.filter((t) => {
      const tGroup = t.group_name || "all";
      const isPublic = tGroup === "all";

      if (!this.currentUser) {
        if (!isPublic) return false;
      } else {
        const userGroup = this.currentUser.group_name;
        if (!isPublic && userGroup && !tGroup.includes(userGroup)) return false;
      }

      if (this.selectedGroup && this.selectedGroup !== "all") {
        if (!isPublic && !tGroup.includes(this.selectedGroup)) return false;
      }

      if (this.searchQuery) {
        const titleMatch = (t.title || "").toLowerCase().includes(this.searchQuery);
        const topicMatch = (t.topic || "").toLowerCase().includes(this.searchQuery);
        if (!titleMatch && !topicMatch) return false;
      }

      return true;
    });
  }

  render() {
    this.renderList();
    if (!this.selectedId && this.typoviks.length > 0) {
      const filtered = this.getFilteredTypoviks();
      if (filtered.length > 0) {
        this.selectTypovik(filtered[0].id);
      } else {
        this.selectTypovik(this.typoviks[0].id);
      }
    } else if (this.selectedId) {
      this.renderDetail();
    }
  }

  renderList() {
    const listEl = document.getElementById("typoviks-cards-list");
    if (!listEl) return;

    const filtered = this.getFilteredTypoviks();
    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--muted); font-size: 0.9rem;">
          Типовых работ для выбранных фильтров не найдено
        </div>`;
      return;
    }

    listEl.innerHTML = filtered.map((t) => {
      const isActive = t.id === this.selectedId;
      const sub = t.user_submission;
      let statusBadge = "";
      if (sub) {
        if (sub.status === "passed") statusBadge = `<span class="badge badge-success" style="font-family: var(--font-mono); font-size: 0.72rem;">Зачёт ${sub.score} б.</span>`;
        else if (sub.status === "pending") statusBadge = `<span class="badge badge-warning" style="font-family: var(--font-mono); font-size: 0.72rem;">На проверке</span>`;
        else if (sub.status === "revise") statusBadge = `<span class="badge badge-warning" style="font-family: var(--font-mono); font-size: 0.72rem;">Доработка</span>`;
        else if (sub.status === "failed") statusBadge = `<span class="badge badge-danger" style="font-family: var(--font-mono); font-size: 0.72rem;">Незачёт</span>`;
      } else if (t.has_variant) {
        statusBadge = `<span class="badge badge-normal" style="font-family: var(--font-mono); font-size: 0.72rem;">Вариант #${t.variant_num}</span>`;
      }

      return `
        <button type="button" class="homework-nav-card ${isActive ? "active" : ""}" data-id="${this.esc(t.id)}">
          <div class="hw-card-top-row">
            <span class="badge badge-topic">§ ${this.esc(t.topic || "Типовик")}</span>
            <span class="badge badge-score">${t.max_score} pts</span>
          </div>
          <div class="hw-card-title">${this.esc(t.title)}</div>
          <div class="hw-card-bottom-row">
            <span class="badge badge-group-info">${t.group_name === "all" ? "Все группы" : this.esc(t.group_name)}</span>
            ${statusBadge}
          </div>
        </button>
      `;
    }).join("");

    listEl.querySelectorAll(".homework-nav-card").forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id;
        this.selectTypovik(id);
        const sidebar = document.getElementById("typoviks-sidebar");
        if (sidebar && sidebar.classList.contains("open")) {
          sidebar.classList.remove("open");
        }
      };
    });
  }

  async selectTypovik(id) {
    this.selectedId = id;
    try {
      history.replaceState(null, "", `?id=${encodeURIComponent(id)}`);
    } catch {}

    this.renderList();
    if (this.variantCache.has(id)) {
      this.variantData = this.variantCache.get(id);
      this.renderDetail();
      return;
    }
    await this.fetchVariant(id);
    this.renderDetail();
  }

  async fetchVariant(typId) {
    this.variantData = null;
    if (!this.currentUser) return;

    const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    try {
      const res = await fetch(`/api/typoviks/${encodeURIComponent(typId)}/variant`, { headers, credentials: "same-origin" });
      this.variantData = await res.json();
      if (this.variantData && !this.variantData.error) {
        this.variantCache.set(typId, this.variantData);
      }
    } catch (e) {
      console.warn("Failed to fetch typovik variant:", e);
    }
  }

  renderDetail() {
    const sheetEl = document.getElementById("typovik-detail-sheet");
    if (!sheetEl) return;

    const typ = this.typoviks.find((t) => t.id === this.selectedId);
    if (!typ) {
      sheetEl.innerHTML = `<div style="padding: 2.5rem; text-align: center; color: var(--muted);">Выберите типовой расчет из списка</div>`;
      return;
    }

    if (!this.currentUser) {
      sheetEl.innerHTML = `
        <header class="hw-detail-header">
          <div class="hw-meta-row">
            <span class="badge badge-topic">§ ${this.esc(typ.topic || "Типовик")}</span>
            <span class="badge badge-score">макс: ${typ.max_score} pts</span>
          </div>
          <h1 class="hw-main-title">${this.esc(typ.title)}</h1>
        </header>
        <div class="hw-auth-callout">
          <div class="hw-auth-callout-icon" style="font-family: var(--font-mono); font-size: 1.2rem; color: var(--accent); font-weight: 700;">[!]</div>
          <div class="hw-auth-callout-text">
            <h3>Требуется авторизация</h3>
            <p>Персональный вариант типового расчета генерируется индивидуально для каждого студента. Пожалуйста, войдите в систему.</p>
            <button type="button" class="btn primary" onclick="document.getElementById('btn-auth-open')?.click()">
              Войти в систему
            </button>
          </div>
        </div>
      `;
      return;
    }

    if (this.variantData && this.variantData.error) {
      sheetEl.innerHTML = `
        <header class="hw-detail-header">
          <div class="hw-meta-row">
            <span class="badge badge-topic">§ ${this.esc(typ.topic || "Типовик")}</span>
            <span class="badge badge-score">макс: ${typ.max_score} pts</span>
          </div>
          <h1 class="hw-main-title">${this.esc(typ.title)}</h1>
        </header>
        <div class="hw-auth-callout" style="border-left-color: var(--bad, #f43f5e);">
          <div class="hw-auth-callout-icon" style="font-family: var(--font-mono); font-size: 1.2rem; color: var(--bad, #f43f5e); font-weight: 700;">[X]</div>
          <div class="hw-auth-callout-text">
            <h3>Доступ ограничен</h3>
            <p>${this.esc(this.variantData.error)}</p>
          </div>
        </div>
      `;
      return;
    }

    const variant = this.variantData?.variant;
    const sub = this.variantData?.submission || typ.user_submission;

    let variantHtml = "";
    if (!variant || !variant.questions || variant.questions.length === 0) {
      variantHtml = `
        <div style="background: var(--surface); border: 1px dashed var(--line); border-radius: var(--radius-md); padding: 2rem; text-align: center;">
          <h3 style="margin-bottom: 0.5rem;">Персональный вариант формируется</h3>
          <p class="muted">Преподаватель ещё не выложил сгенерированные варианты для вашей группы или работа находится в процессе подготовки.</p>
        </div>
      `;
    } else {
      variantHtml = `
        <div class="typovik-variant-card" style="margin-bottom: 2rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border);">
            <div>
              <span class="badge badge-normal" style="font-family: var(--font-mono); font-size: 0.85rem;">Вариант #${variant.variant_num}</span>
              <strong style="margin-left: 0.5rem; font-size: 0.95rem;">${this.esc(this.currentUser.name)} (${this.esc(this.currentUser.group_name || "—")})</strong>
            </div>
            <span class="muted" style="font-size: 0.82rem; font-family: var(--font-mono);">Заданий: ${variant.questions.length}</span>
          </div>
          <div class="typovik-tasks-list">
            ${variant.questions.map((q, idx) => `
              <div class="typovik-task-item" style="margin-bottom: 1.5rem; padding: 1.25rem; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm); border-left: 3px solid var(--accent);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
                  <span style="font-family: var(--font-mono); font-weight: 700; color: var(--accent); font-size: 0.88rem;">Задача ${idx + 1} [${this.esc(q.block_title || "Блок")}]</span>
                  <span class="badge badge-score" style="font-size: 0.78rem;">${q.max_score || 5} pts</span>
                </div>
                <h4 style="margin: 0 0 0.5rem; font-size: 1.05rem;">${this.esc(q.title)}</h4>
                <div class="typovik-task-content markdown-body" style="font-size: 0.95rem; line-height: 1.5;">
                  ${this.renderMd(q.content)}
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }

    // Submission box
    let submissionHtml = "";
    if (sub) {
      const dateStr = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString("ru-RU") : "";
      let verdictBadge = "";
      if (sub.status === "passed") {
        verdictBadge = `<span class="badge badge-success" style="font-size: 0.85rem; padding: 0.3rem 0.6rem; font-family: var(--font-mono);">Зачёт (${sub.score} / ${typ.max_score} баллов)</span>`;
      } else if (sub.status === "pending") {
        verdictBadge = `<span class="badge badge-warning" style="font-size: 0.85rem; padding: 0.3rem 0.6rem; font-family: var(--font-mono);">На проверке у преподавателя</span>`;
      } else if (sub.status === "revise") {
        verdictBadge = `<span class="badge badge-warning" style="font-size: 0.85rem; padding: 0.3rem 0.6rem; font-family: var(--font-mono);">Требуется доработка</span>`;
      } else if (sub.status === "failed") {
        verdictBadge = `<span class="badge badge-danger" style="font-size: 0.85rem; padding: 0.3rem 0.6rem; font-family: var(--font-mono);">Незачёт (${sub.score} / ${typ.max_score} баллов)</span>`;
      }

      let subContentHtml = "";
      if (sub.file_type === "image" || sub.file_type === "images" || (Array.isArray(sub.images) && sub.images.length > 0)) {
        const imgs = (Array.isArray(sub.images) && sub.images.length > 0) ? sub.images : [sub.file_path];
        subContentHtml = `
          <div style="margin-top: 0.75rem;">
            <div style="font-size: 0.85rem; color: var(--muted); margin-bottom: 0.4rem;">📷 Прикрепленные фотографии решения (${imgs.length} шт.):</div>
            <div class="submission-images-grid">
              ${imgs.map((src) => {
                const fullUrl = src.startsWith("/") ? src : `/api/uploads/images/${encodeURIComponent(src)}`;
                return `
                  <a href="${fullUrl}" target="_blank" rel="noopener" title="Открыть в полном размере">
                    <img src="${fullUrl}" class="sub-image-thumb" alt="Фото решения">
                  </a>
                `;
              }).join("")}
            </div>
          </div>
        `;
      } else {
        const fileDownloadUrl = sub.file_path.startsWith("/") ? sub.file_path : `/api/uploads/homeworks/${encodeURIComponent(sub.file_path)}`;
        subContentHtml = `
          <div><strong>Файл:</strong> <a href="${fileDownloadUrl}" target="_blank" rel="noopener" class="hw-file-link">${this.esc(sub.file_name)}</a></div>
        `;
      }

      submissionHtml += `
        <div class="hw-current-submission-card" style="margin-bottom: 1.5rem;">
          <div class="hw-sub-header">
            <span class="hw-sub-title">Отправленное решение варианта</span>
            ${verdictBadge}
          </div>
          <div class="hw-sub-details">
            ${subContentHtml}
            <div><strong>Дата отправки:</strong> ${dateStr}</div>
            ${sub.reviewed_at ? `<div><strong>Дата проверки:</strong> ${new Date(sub.reviewed_at).toLocaleString("ru-RU")}</div>` : ""}
          </div>
          ${sub.teacher_comment ? `
            <div class="hw-teacher-feedback">
              <div class="feedback-title">Комментарий преподавателя:</div>
              <div class="feedback-text">${this.esc(sub.teacher_comment)}</div>
            </div>
          ` : ""}
        </div>
      `;
    }

    const uploadCardHtml = `
      <div class="hw-upload-card">
        <h3 class="hw-upload-title">${sub ? "Загрузить новую версию решения (PDF или Фото)" : "Загрузка решения типового расчета (PDF или Фото)"}</h3>
        <p class="hw-upload-desc">Загрузите документ <strong>PDF</strong> или качественные <strong>фотографии</strong> страниц решения (PNG, JPG, WebP до 25 МБ). При повторной отправке решение обновляется.</p>

        <div class="pdf-dropzone" id="typ-dropzone">
          <input type="file" id="typ-file-input" accept=".pdf,image/png,image/jpeg,image/webp" multiple style="display: none;">
          <div class="dropzone-content" id="typ-dropzone-content">
            <span class="dropzone-icon" style="font-family: var(--font-mono); font-size: 1.1rem; color: var(--accent);">[PDF / 📷]</span>
            <span class="dropzone-text">Перетащите PDF или фото сюда или <strong style="color: var(--accent); cursor: pointer;">выберите файлы</strong></span>
            <span class="dropzone-limit">Поддерживаются PDF, PNG, JPG, WebP (до 25 МБ)</span>
          </div>
        </div>

        <div class="selected-files-container" id="typ-selected-files-container" style="display: none; margin-top: 1rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <strong style="font-size: 0.9rem;" id="typ-selected-summary">Выбранные файлы</strong>
            <button type="button" class="btn quiet btn-xs" id="btn-typ-clear-files">Очистить выбор</button>
          </div>
          <div class="selected-files-grid" id="typ-selected-files-grid" style="display: flex; flex-wrap: wrap; gap: 0.65rem;"></div>
        </div>

        <div class="upload-action-row" style="margin-top: 1rem;">
          <div id="typ-upload-feedback" class="upload-feedback" hidden></div>
          <button type="button" class="btn primary" id="btn-submit-typ" disabled>
            Отправить решение на проверку
          </button>
        </div>
      </div>
    `;

    sheetEl.innerHTML = `
      <header class="hw-detail-header">
        <div class="hw-meta-row">
          <span class="badge badge-topic">§ ${this.esc(typ.topic || "Типовик")}</span>
          <span class="badge badge-group-info">${typ.group_name === "all" ? "Все группы" : this.esc(typ.group_name)}</span>
          <span class="badge badge-score">макс: ${typ.max_score} pts</span>
          ${typ.deadline ? `<span class="badge badge-deadline badge-normal">до ${this.esc(typ.deadline)}</span>` : ""}
        </div>
        <h1 class="hw-main-title">${this.esc(typ.title)}</h1>
      </header>

      <section class="typovik-tasks-section">
        ${variantHtml}
      </section>

      <section class="hw-submission-section">
        ${submissionHtml}
        ${uploadCardHtml}
      </section>
    `;

    this.bindDropzone();

    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(sheetEl, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      } catch {}
    }
  }

  bindDropzone() {
    const dropzone = document.getElementById("typ-dropzone");
    const fileInput = document.getElementById("typ-file-input");
    const containerEl = document.getElementById("typ-selected-files-container");
    const gridEl = document.getElementById("typ-selected-files-grid");
    const summaryEl = document.getElementById("typ-selected-summary");
    const clearBtn = document.getElementById("btn-typ-clear-files");
    const submitBtn = document.getElementById("btn-submit-typ");
    const feedbackEl = document.getElementById("typ-upload-feedback");

    if (!dropzone || !fileInput) return;

    this.selectedFiles = [];

    const renderSelectedFiles = () => {
      if (!this.selectedFiles.length) {
        if (containerEl) containerEl.style.display = "none";
        if (dropzone) dropzone.style.display = "block";
        if (submitBtn) submitBtn.disabled = true;
        return;
      }

      if (containerEl) containerEl.style.display = "block";
      if (dropzone) dropzone.style.display = "block";
      if (submitBtn) submitBtn.disabled = false;

      const totalBytes = this.selectedFiles.reduce((s, f) => s + f.size, 0);
      const totalMb = (totalBytes / (1024 * 1024)).toFixed(2);
      if (summaryEl) summaryEl.textContent = `Выбрано файлов: ${this.selectedFiles.length} (${totalMb} МБ)`;

      if (gridEl) {
        gridEl.innerHTML = "";
        this.selectedFiles.forEach((file, idx) => {
          const item = document.createElement("div");
          item.style.cssText = "position: relative; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 0.5rem; background: var(--surface); display: flex; flex-direction: column; align-items: center; width: 110px;";

          const isImg = file.type.startsWith("image/");
          if (isImg) {
            const img = document.createElement("img");
            img.src = URL.createObjectURL(file);
            img.style.cssText = "width: 90px; height: 90px; object-fit: cover; border-radius: var(--radius-xs); margin-bottom: 0.3rem;";
            item.appendChild(img);
          } else {
            const icon = document.createElement("div");
            icon.style.cssText = "width: 90px; height: 90px; display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-weight: bold; color: var(--accent); background: rgba(56, 189, 248, 0.1); border-radius: var(--radius-xs); margin-bottom: 0.3rem;";
            icon.textContent = "PDF";
            item.appendChild(icon);
          }

          const nameSpan = document.createElement("span");
          nameSpan.style.cssText = "font-size: 0.72rem; max-width: 95px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
          nameSpan.textContent = file.name;
          nameSpan.title = file.name;
          item.appendChild(nameSpan);

          const removeBtn = document.createElement("button");
          removeBtn.type = "button";
          removeBtn.innerHTML = "✕";
          removeBtn.style.cssText = "position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.7); color: #fff; border: 0; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 0.7rem; line-height: 1;";
          removeBtn.onclick = (e) => {
            e.stopPropagation();
            this.selectedFiles.splice(idx, 1);
            renderSelectedFiles();
          };
          item.appendChild(removeBtn);

          gridEl.appendChild(item);
        });
      }
    };

    const handleFiles = (files) => {
      if (!files || !files.length) return;
      const validFiles = [];
      const allowedExts = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
        const isPdf = ext === ".pdf" || file.type === "application/pdf";
        const isImg = file.type.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp"].includes(ext);

        if (!isPdf && !isImg) {
          if (feedbackEl) {
            feedbackEl.className = "upload-feedback error";
            feedbackEl.textContent = `Файл ${file.name} не поддерживается. Разрешены только PDF, PNG, JPG, WebP.`;
            feedbackEl.hidden = false;
          }
          return;
        }

        if (file.size > 25 * 1024 * 1024) {
          if (feedbackEl) {
            feedbackEl.className = "upload-feedback error";
            feedbackEl.textContent = `Размер файла ${file.name} превышает 25 МБ.`;
            feedbackEl.hidden = false;
          }
          return;
        }

        validFiles.push(file);
      }

      if (feedbackEl) feedbackEl.hidden = true;
      this.selectedFiles = [...this.selectedFiles, ...validFiles];
      renderSelectedFiles();
    };

    dropzone.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      if (e.target.files) handleFiles(e.target.files);
    };

    dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add("dragover"); };
    dropzone.ondragleave = () => dropzone.classList.remove("dragover");
    dropzone.ondrop = (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
    };

    if (clearBtn) {
      clearBtn.onclick = () => {
        this.selectedFiles = [];
        fileInput.value = "";
        renderSelectedFiles();
        if (feedbackEl) feedbackEl.hidden = true;
      };
    }

    if (submitBtn) {
      submitBtn.onclick = async () => {
        if (!this.selectedFiles || !this.selectedFiles.length || !this.selectedId) return;

        submitBtn.disabled = true;
        submitBtn.textContent = "Отправка решения…";
        if (feedbackEl) feedbackEl.hidden = true;

        const formData = new FormData();
        this.selectedFiles.forEach((file) => {
          formData.append("files", file);
        });

        const token = localStorage.getItem("dm_session") || localStorage.getItem("dm_admin_token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        try {
          const res = await fetch(`/api/typoviks/${encodeURIComponent(this.selectedId)}/upload`, {
            method: "POST",
            headers,
            credentials: "same-origin",
            body: formData,
          });

          const data = await res.json();
          if (res.ok && data.ok) {
            if (feedbackEl) {
              feedbackEl.className = "upload-feedback success";
              feedbackEl.textContent = "Решение типового расчета успешно отправлено на проверку!";
              feedbackEl.hidden = false;
            }
            this.selectedFiles = [];
            await this.checkAuthAndFetch();
            await this.fetchVariant(this.selectedId);
            setTimeout(() => this.renderDetail(), 1000);
          } else {
            if (feedbackEl) {
              feedbackEl.className = "upload-feedback error";
              feedbackEl.textContent = data.error || "Ошибка при загрузке файлов.";
              feedbackEl.hidden = false;
            }
            submitBtn.disabled = false;
            submitBtn.textContent = "Отправить решение на проверку";
          }
        } catch {
          if (feedbackEl) {
            feedbackEl.className = "upload-feedback error";
            feedbackEl.textContent = "Сетевая ошибка при передаче файлов.";
            feedbackEl.hidden = false;
          }
          submitBtn.disabled = false;
          submitBtn.textContent = "Отправить решение на проверку";
        }
      };
    }
  }

  renderMd(text) {
    if (!text) return "";
    if (window.marked && typeof window.marked.parse === "function") {
      try {
        return window.marked.parse(text);
      } catch {}
    }
    return text.replace(/\n/g, "<br>");
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
  window.typoviksApp = new TypoviksApp();
});
