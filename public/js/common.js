// Shared helpers for the shelf (index.html) and the reader (reader.html).
(function () {
  const PROGRESS_KEY = "books.progress";
  const SAVED_KEY = "books.saved";
  // Resolve data/ relative to this script, so pages in sub-folders work too.
  const DATA_URL = new URL("../data/books.json", document.currentScript.src).href;

  // Fetch a page as soon as the reader shows intent to open it (hovering a
  // link, or pressing it on a phone), so it appears almost instantly. PDFs
  // are left alone: they're big and the reader loads them itself.
  (function prefetchOnIntent() {
    if (navigator.connection?.saveData) return;
    if (HTMLScriptElement.supports?.("speculationrules")) {
      const rules = document.createElement("script");
      rules.type = "speculationrules";
      rules.textContent = JSON.stringify({
        prefetch: [{
          where: { and: [{ href_matches: "/*" }, { not: { href_matches: "/books/*" } }, { not: { href_matches: "*.pdf" } }] },
          eagerness: "moderate",
        }],
      });
      document.head.appendChild(rules);
      return;
    }
    const done = new Set();
    const intent = (e) => {
      const a = e.target.closest?.("a[href]");
      if (!a || a.origin !== location.origin || a.target || /\.pdf$|^\/books\//.test(a.pathname)) return;
      const url = a.href.split("#")[0];
      if (url === location.href.split("#")[0] || done.has(url)) return;
      done.add(url);
      const link = document.createElement("link");
      link.rel = "prefetch";
      link.href = url;
      document.head.appendChild(link);
    };
    document.addEventListener("pointerover", (e) => {
      const a = e.target.closest?.("a[href]");
      if (!a) return;
      const t = setTimeout(() => intent(e), 80);
      a.addEventListener("pointerout", () => clearTimeout(t), { once: true });
    }, { passive: true });
    document.addEventListener("touchstart", intent, { passive: true });
  })();

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

// Dropdowns in the site's own style instead of the phone's system picker.
// The real <select> stays in the page (hidden) so forms and "change" listeners
// keep working; this just draws a button and a list on top of it.
window.PrettySelect = function (select) {
  if (!select || select.dataset.pretty) return;
  select.dataset.pretty = "1";
  const uid = `ps${Math.random().toString(36).slice(2, 8)}`;
  const label = select.getAttribute("aria-label") || select.closest("label")?.firstElementChild?.textContent?.trim() || "";
  const wrap = document.createElement("div");
  wrap.className = "pselect";
  wrap.innerHTML = `
    <button type="button" class="pselect-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="${uid}">
      <span class="pselect-val"></span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    <ul class="pselect-menu" id="${uid}" role="listbox" tabindex="-1" hidden></ul>`;
  select.after(wrap);
  select.classList.add("pselect-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");
  // A <label> around the select would send its clicks to the hidden select.
  select.closest("label")?.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) e.preventDefault();
  });
  const btn = wrap.querySelector("button");
  const menu = wrap.querySelector("ul");
  if (label) {
    btn.setAttribute("aria-label", `${label}: ${select.selectedOptions[0]?.text || ""}`);
    menu.setAttribute("aria-label", label);
  }
  let active = 0;
  const items = () => [...menu.children];

  function sync() {
    const opt = select.selectedOptions[0];
    wrap.querySelector(".pselect-val").textContent = opt ? opt.text : "";
    if (label) btn.setAttribute("aria-label", `${label}: ${opt ? opt.text : ""}`);
    btn.disabled = select.disabled;
    menu.innerHTML = [...select.options]
      .map((o, i) => `<li role="option" id="${uid}-${i}" data-i="${i}" aria-selected="${o.selected}">${o.text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))}<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg></li>`)
      .join("");
  }
  function mark(i) {
    active = Math.max(0, Math.min(i, select.options.length - 1));
    items().forEach((li, j) => li.classList.toggle("is-active", j === active));
    menu.setAttribute("aria-activedescendant", `${uid}-${active}`);
    items()[active]?.scrollIntoView({ block: "nearest" });
  }
  function open() {
    if (btn.disabled) return;
    sync();
    menu.hidden = false;
    wrap.classList.add("is-open");
    btn.setAttribute("aria-expanded", "true");
    // open upwards / align right when there isn't room
    const r = btn.getBoundingClientRect();
    wrap.classList.toggle("up", r.bottom + Math.min(menu.scrollHeight, 320) > innerHeight - 12 && r.top > innerHeight / 2);
    wrap.classList.toggle("right", r.left + menu.offsetWidth > innerWidth - 12);
    mark(select.selectedIndex);
    menu.focus({ preventScroll: true });
    // still cut off (e.g. mid-scroll)? bring the whole list into view
    requestAnimationFrame(() => {
      const m = menu.getBoundingClientRect();
      if (m.bottom > innerHeight || m.top < 0) menu.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    window.Sfx?.soft?.();
    setTimeout(() => document.addEventListener("pointerdown", outside), 0);
  }
  function close(refocus = true) {
    if (menu.hidden) return;
    menu.hidden = true;
    wrap.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside);
    if (refocus) btn.focus({ preventScroll: true });
  }
  function outside(e) {
    if (!wrap.contains(e.target)) close(false);
  }
  function choose(i) {
    const changed = select.selectedIndex !== i;
    select.selectedIndex = i;
    sync();
    close();
    if (changed) select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  btn.addEventListener("click", () => (menu.hidden ? open() : close()));
  btn.addEventListener("keydown", (e) => {
    if (["ArrowDown", "ArrowUp"].includes(e.key)) {
      e.preventDefault();
      open();
    }
  });
  menu.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (li) choose(+li.dataset.i);
  });
  menu.addEventListener("keydown", (e) => {
    const n = select.options.length;
    if (e.key === "ArrowDown") mark(active + 1);
    else if (e.key === "ArrowUp") mark(active - 1);
    else if (e.key === "Home") mark(0);
    else if (e.key === "End") mark(n - 1);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (e.key === "Tab") return close(false);
    else return;
    e.preventDefault();
  });
  // keep in step when code changes the select
  select.addEventListener("change", sync);
  new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ["disabled"] });
  sync();
  return wrap;
};
