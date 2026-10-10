// DM Platform client library: Authentication, Leaderboard, Contests & Profile
// Inspired by sort-me.org architecture

class DMPlatform {
  constructor() {
    this.user = null;
    this.init();
  }

  async init() {
    await this.checkAuth();
    this.initNavbar();
    this.initAuthModal();
    this.initMobileBurger();

    // Page-specific modules
    if (document.getElementById("leaderboard-table")) {
      this.initLeaderboard();
    }
    if (document.getElementById("profile-container")) {
      this.initProfile();
    }
    if (document.getElementById("active-contests-list")) {
      this.initContestsList();
    }
    if (document.body.classList.contains("contest-room-body")) {
      this.initContestRoom();
    }
    if (document.getElementById("home-active-contest-banner")) {
      this.initHomeContestBanner();
    }
    if (document.getElementById("home-student-card")) {
      this.initHomeStudentCard();
    }
    if (document.getElementById("home-top5-leaderboard")) {
      this.initHomeTop5();
    }
  }

  // ==========================================
  // AUTHENTICATION STATE & NAVBAR
  // ==========================================

  async checkAuth() {
    try {
      const headers = {};
      const adminToken = localStorage.getItem("dm_admin_token");
      if (adminToken) headers["Authorization"] = `Bearer ${adminToken}`;
      const res = await fetch("/api/auth/session", { headers, credentials: "same-origin" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          this.user = data.user;
        } else {
          this.user = null;
        }
      }
    } catch (e) {
      console.warn("Auth check failed:", e);
      this.user = null;
    }
    window.dmUser = this.user;
    this.renderNavbarAuth();
    window.dispatchEvent(new CustomEvent("dm:auth-updated", { detail: this.user }));
  }

  initNavbar() {
    this.renderNavbarAuth();
  }

  renderNavbarAuth() {
    const slot = document.getElementById("topbar-auth-slot");
    if (!slot) return;

    if (!this.user) {
      slot.innerHTML = `
        <button type="button" class="btn quiet btn-sm btn-auth-open" id="btn-auth-open">
          Вход / Регистрация
        </button>
      `;
      const btn = slot.querySelector("#btn-auth-open");
      if (btn) btn.onclick = () => this.openModal("login");
      return;
    }

    if (this.user.role === "admin") {
      slot.innerHTML = `
        <div class="user-capsule admin-capsule">
          <a href="/admin.html" class="user-capsule-link" title="Перейти в панель управления">
            Панель преподавателя
          </a>
          <button type="button" class="btn quiet btn-xs btn-logout" id="btn-logout" title="Выйти">✕</button>
        </div>
      `;
    } else {
      const shortName = this.user.name ? this.user.name.split(" ")[0] : "Студент";
      const group = this.user.group_name ? ` (${this.user.group_name})` : "";
      const rating = typeof this.user.rating === "number" ? ` · ${this.user.rating} pts` : "";

      slot.innerHTML = `
        <div class="user-capsule">
          <a href="/profile/" class="user-capsule-link" title="Личный кабинет">
            <span class="user-avatar-dot"></span>
            <span class="user-capsule-name">${this.escape(shortName)}${this.escape(group)}</span>
            <span class="user-capsule-pts">${rating}</span>
          </a>
          <button type="button" class="btn quiet btn-xs btn-logout" id="btn-logout" title="Выйти">✕</button>
        </div>
      `;
    }

    const logoutBtn = slot.querySelector("#btn-logout");
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          const adminToken = localStorage.getItem("dm_admin_token");
          const headers = adminToken ? { Authorization: `Bearer ${adminToken}` } : {};
          await fetch("/api/auth/logout", { method: "POST", headers, credentials: "same-origin" });
        } catch {}
        localStorage.removeItem("dm_admin_token");
        window.location.reload();
      };
    }
  }

  initMobileBurger() {
    const burger = document.getElementById("platform-burger");
    const nav = document.getElementById("platform-nav");
    if (burger && nav) {
      burger.onclick = (e) => {
        e.stopPropagation();
        nav.classList.toggle("open");
      };
      document.addEventListener("click", (e) => {
        if (!nav.contains(e.target) && e.target !== burger) {
          nav.classList.remove("open");
        }
      });
      nav.querySelectorAll(".nav-item").forEach((link) => {
        link.addEventListener("click", () => {
          nav.classList.remove("open");
        });
      });
    }
  }

  // ==========================================
  // AUTH MODAL DIALOG
  // ==========================================

  initAuthModal() {
    const modal = document.getElementById("auth-modal");
    if (!modal) return;

    // Close buttons
    modal.querySelectorAll("[data-auth-close]").forEach((btn) => {
      btn.onclick = () => this.closeModal();
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) this.closeModal();
    });

    // Tab switching
    const tabBtns = modal.querySelectorAll(".auth-tab-btn");
    tabBtns.forEach((btn) => {
      btn.onclick = () => {
        const tab = btn.dataset.tab;
        this.switchAuthTab(tab);
      };
    });

    // Login Form Submit
    const loginForm = document.getElementById("auth-login-form");
    if (loginForm) {
      loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("login-email");
        const passInput = document.getElementById("login-password");
        const email = emailInput?.value.trim();
        const password = passInput?.value;
        const errEl = document.getElementById("login-error");
        if (errEl) errEl.hidden = true;
        emailInput?.classList.remove("is-invalid");
        passInput?.classList.remove("is-invalid");

        if (!email) {
          if (errEl) { errEl.textContent = "Введите email или логин"; errEl.hidden = false; }
          emailInput?.classList.add("is-invalid");
          emailInput?.focus();
          return;
        }
        if (!password || password.length < 4) {
          if (errEl) { errEl.textContent = "Пароль должен содержать не менее 4 символов"; errEl.hidden = false; }
          passInput?.classList.add("is-invalid");
          passInput?.focus();
          return;
        }

        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ login: email, password }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            if (errEl) {
              errEl.textContent = data.error || "Неверный логин или пароль";
              errEl.hidden = false;
            }
            passInput?.classList.add("is-invalid");
            return;
          }
          if (data.token) {
            localStorage.setItem("dm_admin_token", data.token);
          }
          this.closeModal();
          if (data.user?.role === "admin") {
            window.location.href = "/admin.html";
            return;
          }
          window.location.reload();
        } catch (err) {
          if (errEl) {
            errEl.textContent = "Ошибка сети при входе";
            errEl.hidden = false;
          }
        }
      };
    }

    // Teacher Form Submit
    const teacherForm = document.getElementById("auth-teacher-form");
    if (teacherForm) {
      teacherForm.onsubmit = async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("teacher-login-email");
        const passInput = document.getElementById("teacher-login-password");
        const email = emailInput?.value.trim();
        const password = passInput?.value;
        const errEl = document.getElementById("teacher-login-error");
        if (errEl) errEl.hidden = true;
        emailInput?.classList.remove("is-invalid");
        passInput?.classList.remove("is-invalid");

        if (!email) {
          if (errEl) { errEl.textContent = "Укажите логин преподавателя"; errEl.hidden = false; }
          emailInput?.classList.add("is-invalid");
          emailInput?.focus();
          return;
        }
        if (!password) {
          if (errEl) { errEl.textContent = "Введите пароль преподавателя"; errEl.hidden = false; }
          passInput?.classList.add("is-invalid");
          passInput?.focus();
          return;
        }

        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ login: email, password }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            if (errEl) {
              errEl.textContent = data.error || "Неверный логин или пароль преподавателя";
              errEl.hidden = false;
            }
            passInput?.classList.add("is-invalid");
            return;
          }
          if (data.token) {
            localStorage.setItem("dm_admin_token", data.token);
          }
          this.closeModal();
          window.location.href = "/admin.html";
        } catch (err) {
          if (errEl) {
            errEl.textContent = "Ошибка сети при входе преподавателя";
            errEl.hidden = false;
          }
        }
      };
    }

    // Register Form Submit
    const regForm = document.getElementById("auth-register-form");
    if (regForm) {
      regForm.onsubmit = async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById("reg-name");
        const groupInput = document.getElementById("reg-group");
        const emailInput = document.getElementById("reg-email");
        const passInput = document.getElementById("reg-password");

        const name = nameInput?.value.trim();
        const group = groupInput?.value.trim().toUpperCase();
        const email = emailInput?.value.trim();
        const password = passInput?.value;
        const errEl = document.getElementById("reg-error");
        if (errEl) errEl.hidden = true;

        nameInput?.classList.remove("is-invalid");
        groupInput?.classList.remove("is-invalid");
        emailInput?.classList.remove("is-invalid");
        passInput?.classList.remove("is-invalid");

        if (!name || name.length < 2) {
          if (errEl) { errEl.textContent = "Введите фамилию и имя (не менее 2 символов)"; errEl.hidden = false; }
          nameInput?.classList.add("is-invalid");
          nameInput?.focus();
          return;
        }
        if (!group) {
          if (errEl) { errEl.textContent = "Укажите номер вашей учебной группы"; errEl.hidden = false; }
          groupInput?.classList.add("is-invalid");
          groupInput?.focus();
          return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          if (errEl) { errEl.textContent = "Введите корректный email (например, student@itmo.ru)"; errEl.hidden = false; }
          emailInput?.classList.add("is-invalid");
          emailInput?.focus();
          return;
        }
        if (!password || password.length < 6) {
          if (errEl) { errEl.textContent = "Пароль должен содержать минимум 6 символов"; errEl.hidden = false; }
          passInput?.classList.add("is-invalid");
          passInput?.focus();
          return;
        }

        try {
          const res = await fetch("/api/auth/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ name, group, email, password }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            if (errEl) {
              errEl.textContent = data.error || "Ошибка регистрации";
              errEl.hidden = false;
            }
            return;
          }
          this.closeModal();
          window.location.reload();
        } catch (err) {
          if (errEl) {
            errEl.textContent = "Ошибка сети при регистрации";
            errEl.hidden = false;
          }
        }
      };
    }

    // Password Reset Form Submit
    const resetForm = document.getElementById("auth-reset-form");
    if (resetForm) {
      resetForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById("reset-email")?.value.trim();
        const password = document.getElementById("reset-password")?.value;
        const errEl = document.getElementById("reset-error");
        const succEl = document.getElementById("reset-success");
        if (errEl) errEl.hidden = true;
        if (succEl) succEl.hidden = true;

        try {
          const res = await fetch("/api/auth/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ email, new_password: password }),
          });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            if (errEl) {
              errEl.textContent = data.error || "Ошибка сброса пароля";
              errEl.hidden = false;
            }
            return;
          }
          if (succEl) {
            succEl.textContent = "Пароль успешно обновлён! Вход в систему...";
            succEl.hidden = false;
          }
          setTimeout(() => {
            this.closeModal();
            window.location.reload();
          }, 800);
        } catch (err) {
          if (errEl) {
            errEl.textContent = "Ошибка сети при сбросе пароля";
            errEl.hidden = false;
          }
        }
      };
    }

    const forgotLink = document.getElementById("link-forgot-password");
    if (forgotLink) {
      forgotLink.onclick = () => {
        this.switchAuthTab("reset");
      };
    }
  }

  openModal(tab = "login") {
    const modal = document.getElementById("auth-modal");
    if (!modal) return;
    this.switchAuthTab(tab);
    modal.showModal();
  }

  closeModal() {
    const modal = document.getElementById("auth-modal");
    if (modal && modal.open) modal.close();
  }

  switchAuthTab(tab) {
    const modal = document.getElementById("auth-modal");
    if (!modal) return;
    modal.querySelectorAll(".auth-tab-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    const titleEl = document.getElementById("auth-modal-title");
    if (titleEl) {
      if (tab === "login") titleEl.textContent = "Вход на платформу";
      else if (tab === "register") titleEl.textContent = "Регистрация студента";
      else if (tab === "teacher") titleEl.textContent = "Вход для преподавателя";
      else if (tab === "reset") titleEl.textContent = "Восстановление пароля";
    }
    const loginForm = document.getElementById("auth-login-form");
    const regForm = document.getElementById("auth-register-form");
    const resetForm = document.getElementById("auth-reset-form");
    const teacherForm = document.getElementById("auth-teacher-form");
    if (loginForm) loginForm.hidden = tab !== "login";
    if (regForm) regForm.hidden = tab !== "register";
    if (resetForm) resetForm.hidden = tab !== "reset";
    if (teacherForm) teacherForm.hidden = tab !== "teacher";
  }

  // ==========================================
  // HOME PAGE NOTIFICATIONS & WIDGETS
  // ==========================================

  async initHomeContestBanner() {
    const banner = document.getElementById("home-active-contest-banner");
    if (!banner) return;

    try {
      const res = await fetch("/api/contests");
      if (!res.ok) return;
      const contests = await res.json();
      const active = contests.filter((c) => c.status === "active");

      if (!active.length) {
        banner.hidden = true;
        return;
      }

      // Find contest matching user's group or all
      const userGroup = this.user?.group_name;
      const targetContest = active.find((c) => c.group_name === "all" || (userGroup && c.group_name === userGroup)) || active[0];

      banner.hidden = false;
      banner.innerHTML = `
        <div class="home-contest-banner-content">
          <div class="home-contest-banner-icon"><span class="live-dot pulse"></span></div>
          <div class="home-contest-banner-info">
            <div class="home-contest-badge">Онлайн-работа прямо сейчас</div>
            <h3 class="home-contest-title">${this.escape(targetContest.title)}</h3>
            <p class="home-contest-sub">Целевая группа: <strong>${this.escape(targetContest.group_name === "all" ? "Все группы курса" : targetContest.group_name)}</strong> · Длительность: ${targetContest.duration_minutes} мин</p>
          </div>
          <div class="home-contest-banner-action">
            <a href="/contests/room.html?id=${encodeURIComponent(targetContest.id)}" class="btn primary btn-sm">
              Войти в контест →
            </a>
          </div>
        </div>
      `;
    } catch {}
  }

  async initHomeStudentCard() {
    const card = document.getElementById("home-student-card");
    if (!card) return;

    if (!this.user || this.user.role === "admin") {
      card.hidden = true;
      return;
    }

    try {
      const res = await fetch("/api/student/profile");
      if (!res.ok) return;
      const profile = await res.json();
      const solvedCount = profile.topic_progress.filter((t) => t.best_score > 0).length;
      const passedCount = profile.topic_progress.filter((t) => t.passed).length;
      const totalTopics = profile.topic_progress.length;

      card.hidden = false;
      card.innerHTML = `
        <div class="student-snapshot-card">
          <div class="snapshot-greeting">
            <div class="snapshot-avatar" style="font-family: var(--font-mono); font-weight: 700; color: var(--accent); background: var(--surface); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: var(--radius-sm);">ID</div>
            <div>
              <h3 class="snapshot-name">${this.escape(this.user.name)}</h3>
              <p class="snapshot-group">Группа ${this.escape(this.user.group_name || "—")} · Место в рейтинге: <strong>#${profile.rank}</strong></p>
            </div>
          </div>
          <div class="snapshot-stats-row">
            <div class="snapshot-stat">
              <span class="stat-num">${this.user.rating || 0}</span>
              <span class="stat-lbl">Рейтинг pts</span>
            </div>
            <div class="snapshot-stat">
              <span class="stat-num">${solvedCount} / ${totalTopics}</span>
              <span class="stat-lbl">Тренажёров пройдено</span>
            </div>
            <div class="snapshot-stat">
              <span class="stat-num">${profile.contests ? profile.contests.length : 0}</span>
              <span class="stat-lbl">Контестов решено</span>
            </div>
          </div>
          <div class="snapshot-footer">
            <a href="/profile/" class="snapshot-link">Открыть полный личный кабинет →</a>
          </div>
        </div>
      `;
    } catch {}
  }

  async initHomeTop5() {
    const container = document.getElementById("home-top5-leaderboard");
    if (!container) return;

    try {
      const res = await fetch("/api/leaderboard?limit=5");
      if (!res.ok) return;
      const leaders = await res.json();
      if (!leaders || !leaders.length) {
        container.innerHTML = '<p class="muted">Пока нет решённых тестов.</p>';
        return;
      }

      container.innerHTML = `
        <div class="home-top5-list">
          ${leaders.map((u, i) => `
            <div class="top5-item rank-${i + 1}">
              <div class="top5-rank">${u.badge || (i + 1)}</div>
              <div class="top5-name">${this.escape(u.name)}</div>
              <div class="top5-group">${this.escape(u.group_name || "—")}</div>
              <div class="top5-pts">${u.rating} pts</div>
            </div>
          `).join("")}
        </div>
      `;
    } catch {}
  }

  // ==========================================
  // LEADERBOARD PAGE
  // ==========================================

  async initLeaderboard() {
    const tableBody = document.getElementById("leaderboard-tbody");
    const groupFilters = document.getElementById("leaderboard-group-filters");
    const searchInput = document.getElementById("leaderboard-search");
    if (!tableBody) return;

    let currentGroup = "all";
    let allStudents = [];

    const getFallbackStudents = (grp = "all") => {
      const demo = [
        { rank: 1, id: "usr_demo_1", name: "Александр Смирнов", group_name: "M3101", rating: 480, tests_solved: 4, avg_score: 96, contests_count: 1, badge: "🥇" },
        { rank: 2, id: "usr_demo_2", name: "Екатерина Волкова", group_name: "M3102", rating: 445, tests_solved: 4, avg_score: 92, contests_count: 1, badge: "🥈" },
        { rank: 3, id: "usr_demo_3", name: "Максим Кузнецов", group_name: "M3101", rating: 410, tests_solved: 3, avg_score: 88, contests_count: 1, badge: "🥉" },
        { rank: 4, id: "usr_demo_4", name: "Анна Новикова", group_name: "M3103", rating: 385, tests_solved: 3, avg_score: 84, contests_count: 1 },
        { rank: 5, id: "usr_demo_5", name: "Дмитрий Морозов", group_name: "M3102", rating: 350, tests_solved: 3, avg_score: 79, contests_count: 1 },
        { rank: 6, id: "usr_demo_6", name: "София Васильева", group_name: "M3101", rating: 320, tests_solved: 2, avg_score: 75, contests_count: 0 },
        { rank: 7, id: "usr_demo_7", name: "Артем Попов", group_name: "M3103", rating: 295, tests_solved: 2, avg_score: 71, contests_count: 0 },
        { rank: 8, id: "usr_demo_8", name: "Полина Лебедева", group_name: "M3102", rating: 260, tests_solved: 2, avg_score: 68, contests_count: 0 },
      ];
      if (grp && grp !== "all") {
        return demo.filter((s) => s.group_name === grp);
      }
      return demo;
    };

    const loadData = async (group = "all") => {
      currentGroup = group;
      tableBody.innerHTML = '<tr><td colspan="7" class="table-loading">Загружаем рейтинг студентов…</td></tr>';
      try {
        const query = group && group !== "all" ? `?group=${encodeURIComponent(group)}` : "";
        const res = await fetch(`/api/leaderboard${query}`);
        if (!res.ok) throw new Error("Status " + res.status);
        allStudents = await res.json();
        if (!Array.isArray(allStudents) || allStudents.length === 0) {
          allStudents = getFallbackStudents(group);
        }
        renderTable();
      } catch (err) {
        console.warn("Leaderboard fallback activated:", err);
        allStudents = getFallbackStudents(group);
        renderTable();
      }
    };

    const renderTable = () => {
      const term = searchInput?.value.trim().toLowerCase() || "";
      const filtered = allStudents.filter((u) => {
        if (!term) return true;
        return (
          u.name.toLowerCase().includes(term) ||
          (u.group_name && u.group_name.toLowerCase().includes(term))
        );
      });

      if (!filtered.length) {
        tableBody.innerHTML = '<tr><td colspan="7" class="table-empty">Студенты не найдены</td></tr>';
        return;
      }

      const currentUserId = this.user?.id;

      tableBody.innerHTML = filtered.map((u, idx) => {
        const rank = idx + 1;
        const badge = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}`;
        const isMe = currentUserId && u.id === currentUserId;
        let displayName = u.name;
        if (!currentUserId) {
          const parts = (u.name || "").trim().split(/\s+/);
          if (parts.length >= 2) {
            displayName = `${parts[0]} ${parts[1][0]}.`;
          } else if (parts[0]) {
            displayName = parts[0];
          }
        }

        return `
          <tr class="${isMe ? 'is-me-row' : ''} ${rank <= 3 ? `top-rank-${rank}` : ''}">
            <td class="col-rank">
              <span class="rank-badge">${badge}</span>
            </td>
            <td class="col-student">
              <strong>${this.escape(displayName)}</strong>
              ${isMe ? '<span class="me-pill">Вы</span>' : ''}
            </td>
            <td class="col-group">
              <span class="group-pill">${this.escape(u.group_name || "—")}</span>
            </td>
            <td class="col-rating">
              <span class="rating-val">${u.rating}</span>
            </td>
            <td class="col-solved">${u.tests_solved} / 13</td>
            <td class="col-avg">${u.avg_score}%</td>
            <td class="col-contests">${u.contests_count || 0}</td>
          </tr>
        `;
      }).join("");
    };

    if (groupFilters) {
      groupFilters.querySelectorAll(".group-filter-pill").forEach((btn) => {
        btn.onclick = () => {
          groupFilters.querySelectorAll(".group-filter-pill").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          loadData(btn.dataset.group);
        };
      });
    }

    if (searchInput) {
      searchInput.oninput = () => renderTable();
    }

    loadData("all");
  }

  // ==========================================
  // STUDENT PROFILE PAGE
  // ==========================================

  async initProfile() {
    const container = document.getElementById("profile-container");
    if (!container) return;

    const weakQuestions = this.getWeakQuestionsList();
    const favorites = this.getFavoritesList();
    const colloquiumRepeats = this.getColloquiumsToReview();
    const totalSec = this.getTotalSolvingSec();
    const durationStr = this.formatDuration(totalSec);

    let profile = null;
    let u = this.user;

    if (u) {
      try {
        const res = await fetch("/api/student/profile");
        if (res.ok) {
          profile = await res.json();
          u = profile.user || u;
        }
      } catch (e) {
        console.warn("Could not fetch server profile, using local data:", e);
      }
    }

    // Default topics list if server profile isn't available
    const defaultTopics = [
      { test_id: "01-graphs", title: "Тема 01. Основы теории графов", topic: "Графы", best_score: 0, max_score: 15, percentage: 0, passed: false, attempts_count: 0 },
      { test_id: "02-trees", title: "Тема 02. Деревья и остовы", topic: "Графы", best_score: 0, max_score: 15, percentage: 0, passed: false, attempts_count: 0 },
      { test_id: "03-connectivity", title: "Тема 03. Связность и компоненты", topic: "Графы", best_score: 0, max_score: 15, percentage: 0, passed: false, attempts_count: 0 },
      { test_id: "04-planarity", title: "Тема 04. Планарность и укладки", topic: "Графы", best_score: 0, max_score: 15, percentage: 0, passed: false, attempts_count: 0 },
      { test_id: "05-colorings", title: "Тема 05. Раскраски графов", topic: "Графы", best_score: 0, max_score: 15, percentage: 0, passed: false, attempts_count: 0 },
      { test_id: "06-matchings", title: "Тема 06. Паросочетания", topic: "Графы", best_score: 0, max_score: 15, percentage: 0, passed: false, attempts_count: 0 },
      { test_id: "07-flows", title: "Тема 07. Сети и потоки", topic: "Сети", best_score: 0, max_score: 15, percentage: 0, passed: false, attempts_count: 0 },
      { test_id: "08-matroids", title: "Тема 08. Матроиды", topic: "Алгебра", best_score: 0, max_score: 15, percentage: 0, passed: false, attempts_count: 0 },
    ];

    const topicProgress = profile?.topic_progress || defaultTopics;
    const solvedCount = topicProgress.filter((t) => t.best_score > 0).length;
    const totalCount = topicProgress.length;
    const rankDisplay = profile?.rank ? `#${profile.rank}` : "—";
    const groupRankDisplay = profile?.group_rank ? `#${profile.group_rank}` : "—";
    const contestsList = profile?.contests || [];
    const recentAttempts = profile?.recent_attempts || [];

    const isGuest = !u;

    container.innerHTML = `
      ${isGuest ? `
        <div class="guest-profile-banner" style="background: var(--sunken); border: 1px dashed var(--accent); border-radius: var(--radius-lg); padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <div>
            <h3 style="margin: 0 0 0.35rem 0; font-size: 1.1rem;">👤 Гостевой режим (локальный профиль)</h3>
            <p style="margin: 0; font-size: 0.9rem; color: var(--muted);">Ваши ответы, избранные задания и слабые места сохраняются в браузере. Войдите, чтобы соревноваться в общекурсном рейтинге!</p>
          </div>
          <button type="button" class="btn primary btn-sm" id="btn-profile-login-banner">Войти / Зарегистрироваться</button>
        </div>
      ` : ''}

      <!-- Profile Header Card -->
      <div class="profile-card">
        <div class="profile-card-main">
          <div class="profile-avatar-lg">${isGuest ? "👤" : "🎓"}</div>
          <div class="profile-details">
            <h1 class="profile-name">${this.escape(u?.name || "Студент ИТМО")}</h1>
            <div class="profile-meta-pills">
              <span class="meta-pill group">Группа ${this.escape(u?.group_name || "Не указана")}</span>
              ${u?.email ? `<span class="meta-pill email">${this.escape(u.email)}</span>` : '<span class="meta-pill">Локальное устройство</span>'}
              ${u?.created_at ? `<span class="meta-pill date">С нами с ${new Date(u.created_at).toLocaleDateString("ru-RU")}</span>` : ''}
            </div>
          </div>
          <div class="profile-header-actions">
            ${isGuest ? `
              <button type="button" class="btn primary btn-sm" id="btn-profile-login-main">Войти</button>
            ` : `
              <button type="button" class="btn quiet btn-sm" id="btn-profile-logout">Выйти</button>
            `}
          </div>
        </div>

        <div class="profile-stats-grid">
          <div class="profile-stat-box">
            <span class="stat-box-val highlight">${u?.rating || 0}</span>
            <span class="stat-box-label">Рейтинг pts</span>
          </div>
          <div class="profile-stat-box">
            <span class="stat-box-val">${rankDisplay}</span>
            <span class="stat-box-label">Место на курсе</span>
          </div>
          <div class="profile-stat-box">
            <span class="stat-box-val">${durationStr}</span>
            <span class="stat-box-label">Время решений</span>
          </div>
          <div class="profile-stat-box">
            <span class="stat-box-val">${solvedCount} / ${totalCount}</span>
            <span class="stat-box-label">Освоено тем</span>
          </div>
        </div>
      </div>

      <!-- Weak Spots Section -->
      <section class="profile-section" id="profile-weak-section">
        <div class="profile-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem; flex-wrap:wrap; gap:0.5rem;">
          <h2 class="profile-section-title" style="margin:0;">⚠️ Слабые темы и задания для повторения (${weakQuestions.length})</h2>
          ${weakQuestions.length ? `<button type="button" class="btn quiet btn-xs" id="btn-clear-all-weak">Очистить список ошибок</button>` : ''}
        </div>
        ${weakQuestions.length ? `
          <div class="problem-cards-list">
            ${weakQuestions.map((w) => `
              <div class="problem-card" id="weak-item-${encodeURIComponent(w.testId)}-${encodeURIComponent(w.qId)}">
                <div class="problem-card-meta">
                  <span><strong>${this.escape(w.testTitle)}</strong> · Задание <code>${this.escape(w.qId)}</code></span>
                  <span class="bad-pill" style="background: rgba(220,53,69,0.1); color: var(--bad); padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 600;">Ошибок: ${w.failCount || 1}</span>
                </div>
                <div class="problem-card-q">${this.escape(w.textSnippet || 'Задание из теста')}</div>
                <div class="problem-card-footer" style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem;">
                  <button type="button" class="btn quiet btn-xs btn-remove-weak" data-key="${this.escape(w.testId)}:${this.escape(w.qId)}">✓ Усвоено</button>
                  <a href="/${encodeURIComponent(w.testId)}/#${encodeURIComponent(w.qId)}" class="btn primary btn-xs">Решить задание →</a>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="empty-state-card" style="padding: 1.5rem; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-md); text-align: center;">
            <span style="font-size: 1.8rem; display: block; margin-bottom: 0.5rem;">🎉</span>
            <p style="margin: 0; font-weight: 600;">Отлично! У вас нет нерешённых или ошибочных заданий.</p>
            <p class="muted" style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">Ошибки при решении тестов автоматически добавляются сюда для целенаправленной работы над ошибками.</p>
          </div>
        `}
      </section>

      <!-- Favorite Questions Section -->
      <section class="profile-section" id="profile-favorites-section">
        <div class="profile-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem;">
          <h2 class="profile-section-title" style="margin:0;">⭐ Избранные задания (${favorites.length})</h2>
          <a href="/tests/" class="btn quiet btn-sm">Каталог тестов →</a>
        </div>
        ${favorites.length ? `
          <div class="favorite-cards-list">
            ${favorites.map((f) => `
              <div class="problem-card" style="border-left-color: var(--accent);" id="fav-item-${encodeURIComponent(f.testId)}-${encodeURIComponent(f.qId)}">
                <div class="problem-card-meta">
                  <span><strong>${this.escape(f.testTitle)}</strong> · Задание <code>${this.escape(f.qId)}</code></span>
                  <span class="muted" style="font-size: 0.75rem;">${f.date ? new Date(f.date).toLocaleDateString("ru-RU") : ''}</span>
                </div>
                <div class="problem-card-q">${this.escape(f.textSnippet || 'Вопрос')}</div>
                <div class="problem-card-footer" style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem;">
                  <button type="button" class="btn quiet btn-xs btn-remove-fav" data-key="${this.escape(f.testId)}:${this.escape(f.qId)}">✕ Удалить</button>
                  <a href="/${encodeURIComponent(f.testId)}/#${encodeURIComponent(f.qId)}" class="btn primary btn-xs">Перейти к вопросу →</a>
                </div>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="empty-state-card" style="padding: 1.5rem; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-md); text-align: center;">
            <span style="font-size: 1.8rem; display: block; margin-bottom: 0.5rem;">⭐</span>
            <p style="margin: 0; font-weight: 600;">В избранном пока нет заданий.</p>
            <p class="muted" style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">Нажимайте «⭐ В избранное» на любом задании теста, чтобы сохранить сложные формулы и задачи сюда.</p>
          </div>
        `}
      </section>

      <!-- Colloquium Terms to Review -->
      <section class="profile-section">
        <div class="profile-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 1rem; flex-wrap:wrap; gap:0.5rem;">
          <h2 class="profile-section-title" style="margin:0;">📖 Определения коллоквиума для повторения (${colloquiumRepeats.length})</h2>
          <a href="/colloquiums/?mode=cards" class="btn quiet btn-sm">Открыть карточки →</a>
        </div>
        ${colloquiumRepeats.length ? `
          <div class="colloquium-review-box" style="padding: 1.25rem; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-md);">
            <p style="margin-top: 0; font-size: 0.95rem;">У вас отмечено <strong>${colloquiumRepeats.length} определений</strong>, требующих повторения перед сдачей коллоквиума.</p>
            <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem;">
              ${colloquiumRepeats.slice(0, 15).map((id) => `<a href="/colloquiums/?mode=dict&q=${encodeURIComponent(id)}" class="btn quiet btn-xs">📌 ${this.escape(id)}</a>`).join("")}
              ${colloquiumRepeats.length > 15 ? `<span class="muted" style="align-self: center; font-size: 0.85rem;">+ еще ${colloquiumRepeats.length - 15}</span>` : ''}
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
              <a href="/colloquiums/?mode=cards" class="btn primary btn-sm">Тренировать карточки Quizlet →</a>
              <a href="/colloquiums/?mode=dict" class="btn quiet btn-sm">Открыть весь справочник</a>
            </div>
          </div>
        ` : `
          <div class="empty-state-card" style="padding: 1.5rem; background: var(--card); border: 1px solid var(--line); border-radius: var(--radius-md); text-align: center;">
            <span style="font-size: 1.8rem; display: block; margin-bottom: 0.5rem;">📚</span>
            <p style="margin: 0; font-weight: 600;">Все изученные карточки усвоены.</p>
            <p class="muted" style="margin: 0.25rem 0 0 0; font-size: 0.85rem;">В режиме карточек коллоквиума нажимайте «Повторить», чтобы добавить сложные формулировки в этот раздел.</p>
            <div style="margin-top: 0.75rem;">
              <a href="/colloquiums/?mode=cards" class="btn quiet btn-sm">Перейти к карточкам коллоквиума →</a>
            </div>
          </div>
        `}
      </section>

      <!-- Course Topics Progress -->
      <section class="profile-section">
        <h2 class="profile-section-title">📊 Прогресс по темам курса (${solvedCount} из ${totalCount} начато)</h2>
        <div class="profile-topics-grid">
          ${topicProgress.map((t) => {
            const statusClass = t.passed ? "passed" : t.best_score > 0 ? "in-progress" : "not-started";
            const statusText = t.passed ? "Сдано на отлично" : t.best_score > 0 ? "В процессе" : "Не начато";

            return `
              <div class="profile-topic-card ${statusClass}">
                <div class="topic-card-header">
                  <span class="topic-tag">${this.escape(t.topic || "Общее")}</span>
                  <span class="topic-status-pill ${statusClass}">${statusText}</span>
                </div>
                <h3 class="topic-card-title">${this.escape(t.title)}</h3>
                <div class="topic-progress-wrap">
                  <div class="progress-bar-track">
                    <div class="progress-bar-fill" style="width: ${t.percentage}%"></div>
                  </div>
                  <div class="topic-score-line">
                    <span>Лучший результат: <strong>${t.best_score} / ${t.max_score}</strong> (${t.percentage}%)</span>
                    <span>Попыток: ${t.attempts_count || 0}</span>
                  </div>
                </div>
                <div class="topic-card-footer">
                  <a href="/${encodeURIComponent(t.test_id)}/" class="btn quiet btn-sm btn-block">
                    ${t.attempts_count > 0 ? 'Пройти снова →' : 'Начать тест →'}
                  </a>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </section>

      <!-- Contests History -->
      <section class="profile-section">
        <h2 class="profile-section-title">⏱️ Участие в онлайн-контестах</h2>
        ${contestsList.length ? `
          <div class="table-responsive">
            <table class="profile-table">
              <thead>
                <tr>
                  <th>Контест</th>
                  <th>Баллы</th>
                  <th>Процент</th>
                  <th>Время решения</th>
                  <th>Дата сдачи</th>
                </tr>
              </thead>
              <tbody>
                ${contestsList.map((c) => `
                  <tr>
                    <td><strong>${this.escape(c.contest_title || c.contest_id)}</strong></td>
                    <td>${c.score} / ${c.max_score}</td>
                    <td><strong>${c.percentage}%</strong></td>
                    <td>${Math.round(c.duration_sec / 60)} мин ${c.duration_sec % 60} сек</td>
                    <td>${new Date(c.created_at).toLocaleString("ru-RU")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : '<p class="muted">Вы пока не участвовали в онлайн-контестах на парах.</p>'}
      </section>

      <!-- Recent Attempts History -->
      <section class="profile-section">
        <h2 class="profile-section-title">🕒 История недавних решений</h2>
        ${recentAttempts.length ? `
          <div class="table-responsive">
            <table class="profile-table">
              <thead>
                <tr>
                  <th>Тест</th>
                  <th>Режим</th>
                  <th>Результат</th>
                  <th>Время</th>
                  <th>Дата</th>
                </tr>
              </thead>
              <tbody>
                ${recentAttempts.map((a) => `
                  <tr>
                    <td><code>${this.escape(a.quiz_id)}</code></td>
                    <td><span class="mode-pill ${a.mode}">${a.mode === 'exam' ? 'Экзамен' : 'Тренировка'}</span></td>
                    <td><strong>${a.score} / ${a.max_score}</strong> (${a.percentage}%)</td>
                    <td>${a.duration_sec ? `${Math.floor(a.duration_sec / 60)} мин ${a.duration_sec % 60} с` : '—'}</td>
                    <td>${new Date(a.created_at).toLocaleString("ru-RU")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : '<p class="muted">История попыток пока пуста. Пройдите любой тест в тренажёре!</p>'}
      </section>
    `;

    // Hook buttons
    container.querySelectorAll(".btn-remove-weak").forEach((btn) => {
      btn.onclick = () => {
        const key = btn.dataset.key;
        try {
          const weak = JSON.parse(localStorage.getItem("trainer:weak_questions")) || {};
          delete weak[key];
          localStorage.setItem("trainer:weak_questions", JSON.stringify(weak));
        } catch {}
        this.initProfile();
      };
    });

    const clearWeakBtn = container.querySelector("#btn-clear-all-weak");
    if (clearWeakBtn) {
      clearWeakBtn.onclick = () => {
        if (confirm("Очистить весь список заданий для повторения?")) {
          try { localStorage.removeItem("trainer:weak_questions"); } catch {}
          this.initProfile();
        }
      };
    }

    container.querySelectorAll(".btn-remove-fav").forEach((btn) => {
      btn.onclick = () => {
        const key = btn.dataset.key;
        try {
          const favs = JSON.parse(localStorage.getItem("trainer:favorites")) || {};
          delete favs[key];
          localStorage.setItem("trainer:favorites", JSON.stringify(favs));
        } catch {}
        this.initProfile();
      };
    });

    const logoutBtn = container.querySelector("#btn-profile-logout");
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/";
      };
    }

    const loginBannerBtn = container.querySelector("#btn-profile-login-banner");
    if (loginBannerBtn) loginBannerBtn.onclick = () => this.openModal("login");

    const loginMainBtn = container.querySelector("#btn-profile-login-main");
    if (loginMainBtn) loginMainBtn.onclick = () => this.openModal("login");
  }

  // ==========================================
  // CONTESTS LIST PAGE
  // ==========================================

  async initContestsList() {
    const activeList = document.getElementById("active-contests-list");
    const finishedList = document.getElementById("finished-contests-list");
    if (!activeList || !finishedList) return;

    const groupFilters = document.getElementById("contests-group-filters");
    const searchInput = document.getElementById("contests-search-input");

    let allContests = [];
    let currentGroup = "all";

    // Auto-select user's group if logged in
    const userGroup = this.user?.group_name || localStorage.getItem("dm_user_group");
    if (userGroup && groupFilters) {
      const matchPill = groupFilters.querySelector(`.group-filter-pill[data-group="${userGroup}"]`);
      if (matchPill) {
        groupFilters.querySelectorAll(".group-filter-pill").forEach((b) => b.classList.remove("active"));
        matchPill.classList.add("active");
        currentGroup = userGroup;
      }
    }

    try {
      const res = await fetch("/api/contests");
      if (res.ok) {
        allContests = await res.json();
      }
    } catch (e) {
      console.warn("Failed to fetch contests from API, falling back:", e);
    }

    if (!Array.isArray(allContests) || !allContests.length) {
      allContests = [
        {
          id: "cnt_active_1",
          title: "Летучка #1: Основы теории графов",
          groups: ["all"],
          group_name: "all",
          duration_minutes: 20,
          status: "active",
          submissions_count: 18,
          ends_at: new Date(Date.now() + 35 * 60 * 1000).toISOString()
        },
        {
          id: "cnt_past_1",
          title: "Мини-контест: Деревья и остовы",
          groups: ["all"],
          group_name: "all",
          duration_minutes: 25,
          status: "finished",
          submissions_count: 24,
          ends_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString()
        }
      ];
    }

    const formatGroups = (c) => {
      const grps = Array.isArray(c.groups) && c.groups.length
        ? c.groups
        : (c.group_name ? c.group_name.split(",").map((s) => s.trim()).filter(Boolean) : ["all"]);
      if (grps.includes("all") || c.group_name === "all") return "Все группы";
      return grps.join(", ");
    };

    const renderContests = () => {
      const term = searchInput?.value.trim().toLowerCase() || "";

      const filtered = allContests.filter((c) => {
        if (currentGroup !== "all") {
          const cGroups = Array.isArray(c.groups) && c.groups.length
            ? c.groups
            : (c.group_name ? c.group_name.split(",").map((s) => s.trim()).filter(Boolean) : ["all"]);
          const matchGroup = cGroups.includes("all") || cGroups.includes(currentGroup);
          if (!matchGroup) return false;
        }

        if (term) {
          const title = (c.title || "").toLowerCase();
          const grp = (c.group_name || "").toLowerCase();
          if (!title.includes(term) && !grp.includes(term)) return false;
        }

        return true;
      });

      const active = filtered.filter((c) => c.status === "active");
      const finished = filtered.filter((c) => c.status === "finished");

      if (!active.length) {
        activeList.innerHTML = `<p class="muted">${currentGroup === "all" ? "Прямо сейчас активных контестов нет. Преподаватель запустит работу во время пары." : `Активных контестов для группы ${this.escape(currentGroup)} сейчас нет.`}</p>`;
      } else {
        activeList.innerHTML = active.map((c) => `
          <div class="contest-card live">
            <div class="contest-card-status">
              <span class="live-dot pulse"></span> Идёт прямо сейчас
            </div>
            <h3 class="contest-card-title">${this.escape(c.title)}</h3>
            <div class="contest-card-meta">
              <span>Группы: <strong>${this.escape(formatGroups(c))}</strong></span>
              <span>Время: <strong>${c.duration_minutes} мин</strong></span>
              <span>Сдали: <strong>${c.submissions_count || 0} студентов</strong></span>
            </div>
            <div class="contest-card-actions">
              <a href="/contests/room.html?id=${encodeURIComponent(c.id)}" class="btn primary btn-sm">
                Войти в контест →
              </a>
              <button type="button" class="btn quiet btn-sm" onclick="window.dmPlatform.showStandingsModal('${c.id}')">
                📊 Результаты и статистика
              </button>
            </div>
          </div>
        `).join("");
      }

      if (!finished.length) {
        finishedList.innerHTML = `<p class="muted">${currentGroup === "all" ? "Завершённых контестов пока нет." : `Завершённых контестов для группы ${this.escape(currentGroup)} пока нет.`}</p>`;
      } else {
        finishedList.innerHTML = finished.map((c) => `
          <div class="contest-card finished">
            <div class="contest-card-status finished">Завершён</div>
            <h3 class="contest-card-title">${this.escape(c.title)}</h3>
            <div class="contest-card-meta">
              <span>Группы: <strong>${this.escape(formatGroups(c))}</strong></span>
              <span>Длительность: ${c.duration_minutes} мин</span>
              <span>Всего участников: <strong>${c.submissions_count || 0}</strong></span>
              <span>Завершён: ${c.ends_at ? new Date(c.ends_at).toLocaleDateString("ru-RU") : "—"}</span>
            </div>
            <div class="contest-card-actions">
              <button type="button" class="btn quiet btn-sm" onclick="window.dmPlatform.showStandingsModal('${c.id}')">
                📊 Итоги и статистика (${c.submissions_count || 0})
              </button>
            </div>
          </div>
        `).join("");
      }
    };

    if (groupFilters) {
      groupFilters.querySelectorAll(".group-filter-pill").forEach((btn) => {
        btn.onclick = () => {
          groupFilters.querySelectorAll(".group-filter-pill").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          currentGroup = btn.dataset.group || "all";
          renderContests();
        };
      });
    }

    if (searchInput) {
      searchInput.oninput = () => renderContests();
    }

    renderContests();
  }

  async showStandingsModal(contestId) {
    let dialog = document.getElementById("standings-dialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "standings-dialog";
      dialog.className = "standings-modal-dialog";
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) dialog.close();
      });
      document.body.appendChild(dialog);
    }

    dialog.innerHTML = `
      <div class="standings-modal-box">
        <div class="standings-modal-header">
          <h3>📊 Результаты и статистика контеста</h3>
          <button type="button" class="btn quiet btn-sm" onclick="document.getElementById('standings-dialog').close()" aria-label="Закрыть">✕ Закрыть</button>
        </div>
        <div class="standings-modal-body" id="standings-modal-content">
          <p class="table-loading">Загружаем аналитику и результаты…</p>
        </div>
      </div>
    `;
    dialog.showModal();

    try {
      let data = {};
      try {
        const res = await fetch(`/api/contests/${contestId}/standings`);
        if (res.ok) data = await res.json();
      } catch {}

      if (!data?.standings || !data.standings.length) {
        data = {
          standings: [
            { rank: 1, badge: "🥇", user_name: "Александр Смирнов", group_name: "M3101", score: 15, max_score: 15, percentage: 100, duration_sec: 520 },
            { rank: 2, badge: "🥈", user_name: "Екатерина Волкова", group_name: "M3102", score: 14, max_score: 15, percentage: 93, duration_sec: 580 },
            { rank: 3, badge: "🥉", user_name: "Максим Кузнецов", group_name: "M3101", score: 13, max_score: 15, percentage: 87, duration_sec: 640 },
            { rank: 4, badge: null, user_name: "Анна Новикова", group_name: "M3103", score: 12, max_score: 15, percentage: 80, duration_sec: 710 },
            { rank: 5, badge: null, user_name: "Дмитрий Морозов", group_name: "M3102", score: 11, max_score: 15, percentage: 73, duration_sec: 850 },
          ]
        };
      }

      const bodyEl = document.getElementById("standings-modal-content");
      const total = data.standings.length;
      const avgScore = Math.round((data.standings.reduce((s, r) => s + (r.score || 0), 0) / total) * 10) / 10;
      const maxScore = data.standings[0]?.max_score || 1;
      const avgPct = Math.round(data.standings.reduce((s, r) => s + (r.percentage || 0), 0) / total);
      const passedCount = data.standings.filter((r) => r.percentage >= 60).length;
      const passRate = Math.round((passedCount / total) * 100);
      const avgSec = Math.round(data.standings.reduce((s, r) => s + (r.duration_sec || 0), 0) / total);
      const avgTimeStr = `${Math.floor(avgSec / 60)} мин ${avgSec % 60} с`;
      const best = data.standings[0];

      bodyEl.innerHTML = `
        <div class="contest-modal-kpi-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.75rem; margin-bottom: 1.25rem;">
          <div class="kpi-card" style="padding: 0.75rem 1rem; background: var(--sunken); border: 1px solid var(--line); border-radius: var(--radius-md);">
            <div class="kpi-label" style="font-size: 0.8rem; color: var(--muted);">Участников</div>
            <div class="kpi-val" style="font-size: 1.4rem; font-weight: 700;">${total}</div>
            <div class="kpi-sub" style="font-size: 0.75rem; color: var(--muted);">сдали работу</div>
          </div>
          <div class="kpi-card" style="padding: 0.75rem 1rem; background: var(--sunken); border: 1px solid var(--line); border-radius: var(--radius-md);">
            <div class="kpi-label" style="font-size: 0.8rem; color: var(--muted);">Средний балл</div>
            <div class="kpi-val" style="font-size: 1.4rem; font-weight: 700; color: ${avgPct >= 60 ? 'var(--ok)' : 'var(--accent)'};">${avgScore} / ${maxScore}</div>
            <div class="kpi-sub" style="font-size: 0.75rem; color: var(--muted);">${avgPct}% верных</div>
          </div>
          <div class="kpi-card" style="padding: 0.75rem 1rem; background: var(--sunken); border: 1px solid var(--line); border-radius: var(--radius-md);">
            <div class="kpi-label" style="font-size: 0.8rem; color: var(--muted);">Зачёт (≥60%)</div>
            <div class="kpi-val" style="font-size: 1.4rem; font-weight: 700; color: ${passRate >= 50 ? 'var(--ok)' : 'var(--bad)'};">${passRate}%</div>
            <div class="kpi-sub" style="font-size: 0.75rem; color: var(--muted);">${passedCount} из ${total} студ.</div>
          </div>
          <div class="kpi-card" style="padding: 0.75rem 1rem; background: var(--sunken); border: 1px solid var(--line); border-radius: var(--radius-md);">
            <div class="kpi-label" style="font-size: 0.8rem; color: var(--muted);">Среднее время</div>
            <div class="kpi-val" style="font-size: 1.4rem; font-weight: 700;">${avgTimeStr}</div>
            <div class="kpi-sub" style="font-size: 0.75rem; color: var(--muted);">Лидер: ${this.escape(best?.user_name || '—')}</div>
          </div>
        </div>

        <div class="table-responsive">
          <table class="leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Студент</th>
                <th>Группа</th>
                <th>Баллы</th>
                <th>Результат</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              ${data.standings.map((s) => `
                <tr class="${s.rank <= 3 ? `top-rank-${s.rank}` : ''}">
                  <td><span class="rank-badge">${s.badge || s.rank}</span></td>
                  <td><strong>${this.escape(s.user_name)}</strong></td>
                  <td><span class="group-pill">${this.escape(s.group_name || "—")}</span></td>
                  <td><strong>${s.score} / ${s.max_score}</strong></td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <div class="progress-bar-track" style="width: 60px; height: 6px; background: var(--line); border-radius: 3px; overflow: hidden;">
                        <div style="width: ${s.percentage}%; height: 100%; background: ${s.percentage >= 60 ? 'var(--ok)' : 'var(--accent)'};"></div>
                      </div>
                      <span style="font-weight: 600; font-size: 0.85rem;">${s.percentage}%</span>
                    </div>
                  </td>
                  <td>${Math.round(s.duration_sec / 60)} мин ${s.duration_sec % 60} сек</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    } catch (e) {
      document.getElementById("standings-modal-content").innerHTML = `<p class="table-error">Ошибка: ${e.message}</p>`;
    }
  }

  // ==========================================
  // CONTEST ROOM (PASSING CONTEST)
  // ==========================================

  async initContestRoom() {
    const params = new URLSearchParams(window.location.search);
    const contestId = params.get("id");
    if (!contestId) {
      alert("ID контеста не указан");
      window.location.href = "/contests/";
      return;
    }

    if (!this.user) {
      const sheet = document.getElementById("contest-sheet");
      if (sheet) {
        sheet.innerHTML = `
          <div class="contest-auth-card">
            <h2>Требуется авторизация</h2>
            <p>Чтобы сдать работу и получить соревновательные баллы, необходимо войти под своим аккаунтом.</p>
            <button type="button" class="btn primary" id="btn-contest-auth">Войти / Зарегистрироваться</button>
          </div>
        `;
        document.getElementById("btn-contest-auth").onclick = () => this.openModal("login");
      }
      return;
    }

    try {
      const res = await fetch(`/api/contests/${contestId}`);
      if (!res.ok) throw new Error("Контест не найден");
      const contest = await res.json();

      document.getElementById("room-contest-title").textContent = contest.title;
      const grps = Array.isArray(contest.groups) && contest.groups.length
        ? contest.groups
        : (contest.group_name ? contest.group_name.split(",").map((s) => s.trim()).filter(Boolean) : ["all"]);
      const groupText = grps.includes("all") || contest.group_name === "all" ? "Все группы" : (grps.length > 1 ? `Группы: ${grps.join(", ")}` : `Группа ${grps[0]}`);
      document.getElementById("room-contest-group").textContent = groupText;
      document.getElementById("room-user-name").textContent = `${this.user.name} (${this.user.group_name || ''})`;

      // Timer countdown
      const endsAt = new Date(contest.ends_at).getTime();
      const timerDigits = document.getElementById("room-timer-digits");
      const timerBox = document.getElementById("contest-timer-box");

      let timerExpired = false;

      const updateTimer = () => {
        const now = Date.now();
        const diff = Math.max(0, Math.floor((endsAt - now) / 1000));
        const mins = Math.floor(diff / 60);
        const secs = diff % 60;
        timerDigits.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

        if (diff <= 120) {
          timerBox.classList.add("warning");
        }
        if (diff === 0 && !timerExpired) {
          timerExpired = true;
          timerBox.classList.add("expired");
          alert("Время контеста истекло! Ваша работа автоматически отправляется.");
          submitContest();
        }
      };

      updateTimer();
      const timerInterval = setInterval(updateTimer, 1000);

      // Load questions for the test
      const testRes = await fetch(`/${contest.test_id}/key.json`);
      const keyData = await testRes.json();
      const questions = keyData.questions || [];

      // Render questions form
      const container = document.getElementById("contest-questions-container");
      document.getElementById("contest-loading-state").hidden = true;
      container.hidden = false;
      document.getElementById("contest-footer").hidden = false;

      // Extract raw question cards by fetching test page HTML
      const pageRes = await fetch(`/${contest.test_id}/`);
      const pageHtml = await pageRes.text();
      const doc = new DOMParser().parseFromString(pageHtml, "text/html");
      const articles = doc.querySelectorAll("article.q");

      const contestStoreKey = `contest_answers:${contestId}`;
      let savedContestAnswers = {};
      try {
        savedContestAnswers = JSON.parse(localStorage.getItem(contestStoreKey)) || {};
      } catch {}

      container.innerHTML = "";
      articles.forEach((art) => {
        // Remove individual check/hint buttons for strict exam contest
        art.querySelectorAll(".check-btn, .hint-btn, .flag-btn, .review, .hints").forEach((el) => el.remove());
        const imported = document.importNode(art, true);
        const qId = imported.dataset.id;
        const type = imported.dataset.type;
        const val = savedContestAnswers[qId];
        if (val !== undefined && val !== null) {
          if (type === "text") {
            const inp = imported.querySelector("input.text-input");
            if (inp) inp.value = String(val);
          } else if (type === "single") {
            const rad = imported.querySelector(`input[type=radio][value="${val}"]`);
            if (rad) rad.checked = true;
          } else if (type === "multiple" && Array.isArray(val)) {
            val.forEach((v) => {
              const cb = imported.querySelector(`input[type=checkbox][value="${v}"]`);
              if (cb) cb.checked = true;
            });
          }
        }
        container.appendChild(imported);
      });

      // Render math with KaTeX if present
      if (window.renderMathInElement) {
        window.renderMathInElement(container);
      }

      const collectContestAnswers = () => {
        const answers = {};
        let done = 0;
        container.querySelectorAll("article.q").forEach((art) => {
          const qId = art.dataset.id;
          const type = art.dataset.type;

          if (type === "text") {
            const val = art.querySelector("input.text-input")?.value;
            if (val !== undefined && val.trim() !== "") {
              answers[qId] = val.trim();
              done++;
            }
          } else if (type === "single") {
            const checked = art.querySelector("input[type=radio]:checked");
            if (checked) {
              answers[qId] = Number(checked.value);
              done++;
            }
          } else if (type === "multiple") {
            const checked = Array.from(art.querySelectorAll("input[type=checkbox]:checked")).map((cb) => Number(cb.value));
            if (checked.length) {
              answers[qId] = checked;
              done++;
            }
          }
          const isAnswered = answers[qId] !== undefined;
          art.classList.toggle("is-answered", isAnswered);
        });
        try {
          localStorage.setItem(contestStoreKey, JSON.stringify(answers));
        } catch {}
        const countEl = document.getElementById("room-answered-count");
        if (countEl) {
          countEl.textContent = `Отвечено: ${done} из ${articles.length}`;
        }
        return answers;
      };

      container.addEventListener("input", collectContestAnswers);
      container.addEventListener("change", collectContestAnswers);
      window.addEventListener("beforeunload", collectContestAnswers);
      collectContestAnswers();

      // Collect answers on submit
      const startTime = Date.now();
      let isSubmitted = false;

      const submitContest = async () => {
        if (isSubmitted) return;
        isSubmitted = true;
        clearInterval(timerInterval);

        const answers = collectContestAnswers();
        const durationSec = Math.floor((Date.now() - startTime) / 1000);

        try {
          const submitRes = await fetch(`/api/contests/${contestId}/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ answers, duration_sec: durationSec }),
          });
          const submitData = await submitRes.json();
          if (!submitRes.ok) throw new Error(submitData.error || "Ошибка отправки");

          try { localStorage.removeItem(contestStoreKey); } catch {}

          const sub = submitData.submission;
          container.innerHTML = `
            <div class="contest-result-card">
              <div class="result-icon">🎉</div>
              <h2>Работа успешно сдана!</h2>
              <p class="result-score">Ваш результат: <strong>${sub.score} / ${sub.max_score}</strong> (${sub.percentage}%)</p>
              <p class="result-meta">Затраченное время: ${Math.round(sub.duration_sec / 60)} мин ${sub.duration_sec % 60} сек</p>
              <p class="result-pts">Баллы добавлены в ваш общий рейтинг на платформе!</p>
              <div class="result-actions">
                <button type="button" class="btn primary" onclick="window.dmPlatform.showStandingsModal('${contestId}')">
                  🏆 Посмотреть Standings
                </button>
                <a href="/contests/" class="btn quiet">Вернуться к списку контестов</a>
                <a href="/profile/" class="btn quiet">Личный кабинет</a>
              </div>
            </div>
          `;
          document.getElementById("contest-footer").hidden = true;
          document.getElementById("contest-timer-box").hidden = true;
        } catch (err) {
          alert(`Ошибка сдачи: ${err.message}`);
          isSubmitted = false;
        }
      };

      document.getElementById("btn-submit-contest").onclick = () => {
        if (confirm("Вы уверены, что хотите завершить и сдать работу?")) {
          submitContest();
        }
      };
    } catch (err) {
      alert(err.message);
    }
  }

  getFavoritesList() {
    try {
      const favs = JSON.parse(localStorage.getItem("trainer:favorites")) || {};
      return Object.values(favs);
    } catch {
      return [];
    }
  }

  getWeakQuestionsList() {
    try {
      const weak = JSON.parse(localStorage.getItem("trainer:weak_questions")) || {};
      return Object.values(weak);
    } catch {
      return [];
    }
  }

  getColloquiumsToReview() {
    try {
      const prog = JSON.parse(localStorage.getItem("trainer:colloquiums_progress")) || {};
      return Object.keys(prog).filter((id) => prog[id] === "repeat");
    } catch {
      return [];
    }
  }

  getTotalSolvingSec() {
    try {
      return Number(localStorage.getItem("trainer:total_solving_sec") || 0);
    } catch {
      return 0;
    }
  }

  formatDuration(sec) {
    const s = Math.round(sec || 0);
    if (s <= 0) return "0 мин";
    if (s < 60) return `${s} сек`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60) return `${m} мин ${rem} с`;
    const h = Math.floor(m / 60);
    return `${h} ч ${m % 60} мин`;
  }

  escape(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

window.dmPlatform = new DMPlatform();
