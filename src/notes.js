// Клиентский скрипт ридера конспектов YouNote
document.addEventListener("DOMContentLoaded", () => {
  const treeContainer = document.getElementById("notes-tree");
  const articleContainer = document.getElementById("notes-article");
  const tocContainer = document.getElementById("notes-toc-links");
  const searchInput = document.getElementById("notes-search");
  const menuBtn = document.getElementById("notes-menu-btn");
  const sidebar = document.querySelector(".notes-sidebar");

  if (menuBtn && sidebar) {
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sidebar.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !menuBtn.contains(e.target)) {
        sidebar.classList.remove("open");
      }
    });
  }

  // Встроенные данные конспектов
  const notesData = window.__NOTES_DATA__ || [];
  if (!notesData.length) {
    if (articleContainer) articleContainer.innerHTML = "<p class='muted'>Конспекты не найдены.</p>";
    return;
  }

  // Вспомогательная функция очистки HTML для полнотекстового поиска
  function stripHtml(html) {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").toLowerCase();
  }

  // Предварительно готовим поисковый индекс для каждого конспекта
  for (const n of notesData) {
    n._searchText = `${n.meta.title || ""} ${n.meta.description || ""} ${n.meta.topic || ""} ${stripHtml(n.html)}`.toLowerCase();
  }

  // Определение активного конспекта по URL параметру
  const urlParams = new URLSearchParams(window.location.search);
  let activeId = urlParams.get("id") || notesData[0].id;
  if (!notesData.some((n) => n.id === activeId)) {
    activeId = notesData[0].id;
  }

  // Рендер дерева тем и заметок в сайдбаре
  function renderTree(filter = "") {
    if (!treeContainer) return;
    treeContainer.replaceChildren();

    const lower = filter.trim().toLowerCase();
    const grouped = new Map();
    const displayList = notesData.filter((n) => !n.meta?.hidden || n.id === activeId);
    for (const n of displayList) {
      const topic = n.meta.topic || "Общее";
      if (!grouped.has(topic)) grouped.set(topic, []);
      if (!lower || n._searchText.includes(lower)) {
        grouped.get(topic).push(n);
      }
    }

    let hasMatches = false;
    for (const [topic, items] of grouped.entries()) {
      if (items.length === 0) continue;
      hasMatches = true;

      const topicHeader = document.createElement("div");
      topicHeader.className = "notes-tree-topic";
      topicHeader.textContent = topic;
      treeContainer.appendChild(topicHeader);

      const itemsList = document.createElement("div");
      itemsList.className = "notes-tree-list";

      for (const item of items) {
        const link = document.createElement("a");
        link.className = `notes-tree-item ${item.id === activeId ? "active" : ""}`;
        link.href = `?id=${encodeURIComponent(item.id)}`;
        link.innerHTML = `
          <span class="notes-tree-icon">${item.meta.icon || "📄"}</span>
          <span class="notes-tree-text">${item.meta.title}</span>
        `;
        link.addEventListener("click", (e) => {
          e.preventDefault();
          selectNote(item.id);
        });
        itemsList.appendChild(link);
      }
      treeContainer.appendChild(itemsList);
    }

    if (!hasMatches) {
      const empty = document.createElement("div");
      empty.className = "notes-tree-empty";
      empty.textContent = "Ничего не найдено";
      treeContainer.appendChild(empty);
    }
  }

  // Выбор и отображение конспекта
  function selectNote(noteId, pushState = true) {
    const note = notesData.find((n) => n.id === noteId);
    if (!note) return;
    activeId = noteId;

    // Обновление URL без перезагрузки
    if (pushState) {
      const newUrl = `${window.location.pathname}?id=${encodeURIComponent(noteId)}`;
      window.history.pushState({ noteId }, "", newUrl);
    }

    // Подсветка в сайдбаре
    document.querySelectorAll(".notes-tree-item").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("href") === `?id=${encodeURIComponent(noteId)}`);
    });

    if (sidebar && sidebar.classList.contains("open")) {
      sidebar.classList.remove("open");
    }

    renderArticle(note);
  }

  // Отрисовка статьи конспекта
  function renderArticle(note) {
    if (!articleContainer) return;

    // Оглавление статьи (TOC)
    const toc = note.toc || [];
    let tocHtml = "";
    if (toc.length > 0) {
      tocHtml = `<div class="notes-inline-toc">
        <div class="notes-inline-toc-title">Содержание</div>
        <ul>
          ${toc.map((h) => `<li class="toc-level-${h.level}"><a href="#${h.id}">${h.title}</a></li>`).join("")}
        </ul>
      </div>`;
    }

    const idx = notesData.findIndex((n) => n.id === note.id);
    const prevNote = idx > 0 ? notesData[idx - 1] : null;
    const nextNote = idx < notesData.length - 1 ? notesData[idx + 1] : null;

    articleContainer.innerHTML = `
      <div class="notes-breadcrumb">
        <a href="../">Главная</a> <span class="sep">/</span>
        <a href="#" id="bc-topic">${note.meta.topic || "Конспекты"}</a> <span class="sep">/</span>
        <span>${note.meta.title}</span>
      </div>
      <header class="notes-header">
        <div class="notes-hero-icon">${note.meta.icon || "📚"}</div>
        <h1 class="notes-title">${note.meta.title}</h1>
        <div class="notes-meta-bar">
          <span class="tag tag-accent">${note.meta.topic || "Общее"}</span>
          ${note.meta.description ? `<p class="notes-desc">${note.meta.description}</p>` : ""}
        </div>
      </header>
      ${tocHtml}
      <div class="notes-body">
        ${note.html}
      </div>
      <footer class="notes-footer-nav">
        <div class="notes-nav-slot">
          ${prevNote ? `<button class="btn quiet notes-nav-btn" type="button" data-note-id="${prevNote.id}">← ${prevNote.meta.title}</button>` : ""}
        </div>
        <a href="../" class="btn quiet">← Все тесты и конспекты</a>
        <div class="notes-nav-slot">
          ${nextNote ? `<button class="btn primary notes-nav-btn" type="button" data-note-id="${nextNote.id}">${nextNote.meta.title} →</button>` : ""}
        </div>
      </footer>
    `;

    // Кнопки перехода к предыдущему/следующему конспекту
    articleContainer.querySelectorAll(".notes-nav-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectNote(btn.dataset.noteId);
      });
    });

    // Правая колонка TOC
    if (tocContainer) {
      tocContainer.replaceChildren();
      if (toc.length > 0) {
        document.getElementById("notes-toc-sidebar")?.style.removeProperty("display");
        for (const h of toc) {
          const a = document.createElement("a");
          a.className = `toc-link toc-link-${h.level}`;
          a.href = `#${h.id}`;
          a.textContent = h.title;
          a.onclick = (e) => {
            e.preventDefault();
            document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          };
          tocContainer.appendChild(a);
        }
      } else {
        document.getElementById("notes-toc-sidebar")?.setAttribute("style", "display: none;");
      }
    }

    // Прокрутка страницы вверх при переключении
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Обработка кнопки "Назад" в браузере
  window.addEventListener("popstate", (e) => {
    const id = e.state?.noteId || new URLSearchParams(window.location.search).get("id") || notesData[0]?.id;
    if (id && id !== activeId) {
      selectNote(id, false);
    }
  });

  // Поиск по сайдбару
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      renderTree(e.target.value);
    });
  }

  // Первоначальный рендер
  renderTree();
  const initialNote = notesData.find((n) => n.id === activeId) || notesData[0];
  if (initialNote) {
    renderArticle(initialNote);
  }
});
