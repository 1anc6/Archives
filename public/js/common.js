// Shared helpers for the shelf (index.html) and the reader (reader.html).
(function () {
  const PROGRESS_KEY = "books.progress";
  const SAVED_KEY = "books.saved";
  // Resolve data/ relative to this script, so pages in sub-folders work too.
  const DATA_URL = new URL("../data/books.json", document.currentScript.src).href;

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable (private mode etc.) — features degrade quietly */
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function loadBooks() {
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error("Could not load data/books.json");
    const books = await res.json();
    // If an essay's page count has changed since it was last opened, keep the
    // saved position inside the new length.
    const all = readJSON(PROGRESS_KEY, {});
    let changed = false;
    for (const b of books) {
      const p = all[b.id];
      if (p && p.total !== b.pages) {
        all[b.id] = { ...p, total: b.pages, page: Math.min(p.page, b.pages) };
        changed = true;
      }
    }
    if (changed) writeJSON(PROGRESS_KEY, all);
    return books;
  }

  // Generated typographic cover. If a book has a "cover" image path in
  // books.json, that image is used instead.
  function coverHTML(book, size = "md") {
    if (book.cover) {
      return `<div class="cover cover-${size} cover-img"><img src="${escapeHTML(book.cover)}" alt="" loading="lazy"></div>`;
    }
    const [c1, c2] = book.colors || ["#2C1810", "#5a3a28"];
    return `
      <div class="cover cover-${size}" style="--c1:${c1};--c2:${c2}">
        <span class="cover-tag">${escapeHTML(book.category)}</span>
        <span class="cover-glyph">${escapeHTML(book.glyph || "∞")}</span>
        <span class="cover-title">${escapeHTML(book.shortTitle || book.title)}</span>
        <span class="cover-author">${escapeHTML(book.author)}</span>
      </div>`;
  }

  // progress: { [bookId]: { page, total, at } }
  const progress = {
    all: () => readJSON(PROGRESS_KEY, {}),
    get: (id) => readJSON(PROGRESS_KEY, {})[id],
    set(id, page, total) {
      const all = readJSON(PROGRESS_KEY, {});
      all[id] = { page, total, at: Date.now() };
      writeJSON(PROGRESS_KEY, all);
    },
    latest() {
      const all = readJSON(PROGRESS_KEY, {});
      let best = null;
      for (const [id, p] of Object.entries(all)) {
        if (!best || p.at > best.at) best = { id, ...p };
      }
      return best;
    },
  };

  const saved = {
    list: () => readJSON(SAVED_KEY, []),
    has: (id) => readJSON(SAVED_KEY, []).includes(id),
    toggle(id) {
      const list = readJSON(SAVED_KEY, []);
      const i = list.indexOf(id);
      if (i === -1) list.push(id);
      else list.splice(i, 1);
      writeJSON(SAVED_KEY, list);
      return i === -1;
    },
  };

  window.Shelf = { loadBooks, coverHTML, escapeHTML, progress, saved };
})();
