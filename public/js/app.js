(async function () {
  const { loadBooks, escapeHTML: esc, progress, saved } = window.Shelf;
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const MIN_PER_PAGE = 2;

  // Theme, sound toggle, share and toasts live in site.js.
  const toast = window.Site.toast;

  let books = [];
  try {
    books = await loadBooks();
  } catch (err) {
    $("indexList").outerHTML = `<p class="empty">The essays could not be loaded. Check your connection and refresh the page.</p>`;
    console.error(err);
    return;
  }
  const byId = Object.fromEntries(books.map((b) => [b.id, b]));
  books.forEach((b, i) => (b.num = i + 1));
  const sfx = window.Sfx;
  // Play the "ding", then follow the link once the sound has had a moment to play.
  function goTo(url) {
    sfx.ding();
    setTimeout(() => (location.href = url), sfx.muted ? 0 : 230);
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a.podium-card, #dockBtn[href], a[data-read]");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    goTo(a.href);
  });

  const readerURL = (b, page) => `reader.html?id=${encodeURIComponent(b.id)}${page ? `&page=${page}` : ""}`;
  const isDone = (p) => p && p.page >= p.total;
  // Card picture: phone-sized copy + full size, blurred placeholder while it loads,
  // and (for carousel cards) a view-transition name so it morphs into the essay page.
  const photo = (b, eager, named = false) => {
    const small = b.image.replace(".jpg", "-640.jpg");
    const style = (b.placeholder ? `background-image:url(${b.placeholder})` : "") + (named ? `;view-transition-name:ph-${b.id}` : "");
    return `<span class="photo" style="${style}"><img src="${esc(small)}" srcset="${esc(small)} 640w, ${esc(b.image)} 1200w" sizes="(max-width: 650px) 80vw, 420px" alt="${esc(b.imageAlt || "")}" loading="${eager ? "eager" : "lazy"}" decoding="async" onload="this.classList.add('loaded')"></span>`;
  };
  /* ---------- Screens ---------- */
  const ORDER = ["essays", "room", "about"];
  let screen = "essays";
  function go(name, push = true) {
    if (!ORDER.includes(name)) name = "essays";
    if (name === screen && push) return window.scrollTo({ top: 0, behavior: "smooth" });
    const back = ORDER.indexOf(name) < ORDER.indexOf(screen);
    document.querySelectorAll(".screen").forEach((s) => {
      const on = s.dataset.screen === name;
      s.hidden = !on;
      s.classList.toggle("in", on);
      s.classList.toggle("from-left", on && back);
    });
    document.querySelectorAll(".main-nav [data-go]").forEach((b) => {
      const on = b.dataset.go === name;
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $("dock").classList.toggle("is-away", name !== "essays");
    screen = name;
    if (name === "room") renderRoom();
    window.scrollTo({ top: 0 });
    if (push) history.pushState({ screen: name }, "", name === "essays" ? location.pathname : `#${name}`);
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-go]");
    if (!el) return;
    // Menu items are real links: let ctrl/cmd-click open them in a new tab.
    if (el.tagName === "A" && (e.ctrlKey || e.metaKey || e.shiftKey)) return;
    e.preventDefault();
    sfx.tick();
    go(el.dataset.go);
    // e.g. "Image credits" jumps to that card on the About screen
    if (el.dataset.scroll) requestAnimationFrame(() => document.getElementById(el.dataset.scroll)?.scrollIntoView({ block: "start" }));
  });
  window.addEventListener("popstate", () => go(location.hash.slice(1) || "essays", false));

  /* ---------- Totals ---------- */
  const topics = new Set(books.map((b) => b.category)).size;
  const totalPages = books.reduce((n, b) => n + b.pages, 0);
  const hours = Math.round((totalPages * MIN_PER_PAGE) / 60);
  $("aboutStats").innerHTML = `
    <span><b>${books.length}</b>essays</span>
    <span><b>${topics}</b>subject areas</span>
    <span><b>${totalPages}</b>pages</span>
    <span><b>~${hours}h</b>reading time</span>`;
  const contentsTotals = `${books.length} essays · ${totalPages} pages · about ${hours} hours of reading`;
  function renderContentsSum() {
    const all = progress.all();
    const done = books.filter((b) => isDone(all[b.id])).length;
    $("contentsSum").textContent = done ? `${done} of ${books.length} read · ${contentsTotals}` : contentsTotals;
  }


  // Bookmark icon for the reading list; filled when the essay is saved.
  const BOOKMARK = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3.6L7 20z"/></svg>`;
  const status = (b, p) => (isDone(p) ? "Completed" : p ? `Page ${p.page} of ${p.total}` : "");

  // Notation for an essay's symbol: superscript/subscript characters become
  // <sup>/<sub> so the math font draws them instead of a system fallback.
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻", SUB = "₀₁₂₃₄₅₆₇₈₉";
  const PLAIN = "0123456789n+-";
  const notation = (g) =>
    esc(g)
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻]+/g, (m) => `<sup>${[...m].map((c) => PLAIN[SUP.indexOf(c)]).join("")}</sup>`)
      .replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, (m) => `<sub>${[...m].map((c) => PLAIN[SUB.indexOf(c)]).join("")}</sub>`);

  // Split a symbol into one span per character so each stroke can be
  // "written" in turn (see .ink in styles.css).
  function inkify(root) {
    let i = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) {
          const frag = document.createDocumentFragment();
          for (const ch of child.textContent) {
            if (/\s/.test(ch)) { frag.append(ch); continue; }
            const span = document.createElement("span");
            span.className = "ink";
            span.style.setProperty("--d", i++);
            span.textContent = ch;
            frag.append(span);
          }
          child.replaceWith(frag);
        } else walk(child);
      }
    };
    walk(root);
  }

  // Reveal elements once they scroll into view (adds .is-seen).
  const reveal = "IntersectionObserver" in window
    ? new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("is-seen");
          reveal.unobserve(e.target);
        }
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.15 })
    : { observe: (el) => el.classList.add("is-seen"), unobserve() {} };

  /* ---------- Featured essay ---------- */
  function renderFeature() {
    // A different essay each day (by the visitor's local date), the same all day.
    const featurable = books.filter((x) => x.excerpt);
    const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
    const b = featurable.length ? featurable[day % featurable.length] : books[0];
    const p = progress.get(b.id);
    const resume = p && !isDone(p);
    const quote = b.excerpt
      ? `<blockquote class="excerpt"><p>${esc(b.excerpt.text)}</p><footer>From page ${b.excerpt.page}</footer></blockquote>`
      : `<p class="excerpt-plain">${esc(b.description)}</p>`;
    $("feature").innerHTML = `
      <div class="feature-copy">
        <h2 class="feature-title" id="featureTitle"><a href="essays/${b.id}/">${esc(b.shortTitle)}</a></h2>
        <p class="feature-meta"><span class="feature-today">Today's essay</span><span>No. ${pad(b.num)}</span><span>${esc(b.category)}</span><span>${b.pages} pages · ~${b.pages * MIN_PER_PAGE} min</span></p>
        ${quote}
        <div class="feature-actions">
          <a class="btn primary" data-read href="${readerURL(b, resume ? p.page : null)}">${resume ? `Continue from page ${p.page}` : "Read the essay"}<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>
          <a class="btn ghost" href="essays/${b.id}/">About this essay</a>
        </div>
      </div>
      <figure class="feature-figure">
        <span class="feature-glyph" aria-hidden="true">${notation(b.glyph)}</span>
        ${photo(b, true, true)}
      </figure>`;
    inkify($("feature").querySelector(".feature-glyph"));
    reveal.observe($("feature"));
  }

  /* ---------- Start here: three suggested first essays ---------- */
  function renderStart() {
    // Returning readers who have started an essay don't need the newcomer picks.
    const section = $("startList").closest(".start");
    section.hidden = visits > 1 && Object.keys(progress.all()).length > 0;
    if (section.hidden) return;
    const picks = books.filter((b) => b.startHere).sort((a, b) => a.startHere.order - b.startHere.order);
    $("startList").innerHTML = picks
      .map((b) => `
        <li class="start-card">
          <h3 class="start-ask">${esc(b.startHere.ask)}</h3>
          <a class="start-link" href="essays/${b.id}/"><span class="start-glyph" aria-hidden="true">${notation(b.glyph)}</span><span class="start-title">${esc(b.shortTitle)}</span></a>
          <p class="start-meta">${b.pages} pages · ~${b.pages * MIN_PER_PAGE} min · ${esc(b.category)}</p>
        </li>`)
      .join("");
    $("startList").querySelectorAll(".start-card").forEach((el) => {
      inkify(el.querySelector(".start-glyph"));
      reveal.observe(el);
    });
  }
  $("startList").addEventListener("click", (e) => {
    if (e.target.closest("a")) sfx.tick();
  });

  /* ---------- Surprise me: shuffle through titles, then open one at random ---------- */
  let lastSurprise = null;
  $("surpriseBtn").addEventListener("click", () => {
    const btn = $("surpriseBtn");
    if (btn.classList.contains("is-rolling")) return;
    const pool = books.filter((b) => b.id !== lastSurprise);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    lastSurprise = pick.id;
    const label = btn.querySelector(".surprise-label");
    const url = `essays/${pick.id}/`;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return goTo(url);
    btn.classList.add("is-rolling");
    btn.style.width = `${btn.offsetWidth}px`;
    sfx.soft();
    let n = 0;
    const roll = setInterval(() => {
      label.textContent = books[Math.floor(Math.random() * books.length)].shortTitle;
      if (++n >= 9) {
        clearInterval(roll);
        label.textContent = pick.shortTitle;
        btn.classList.add("is-picked");
        setTimeout(() => goTo(url), 350);
      }
    }, 75);
  });
  // Coming back with the browser's back button restores the button.
  window.addEventListener("pageshow", () => {
    const btn = $("surpriseBtn");
    btn.classList.remove("is-rolling", "is-picked");
    btn.style.width = "";
    btn.querySelector(".surprise-label").textContent = "Surprise me";
  });

  /* ---------- Contents ---------- */
  function entryHTML(b, i) {
    const p = progress.get(b.id);
    const on = saved.has(b.id);
    const st = status(b, p);
    return `
      <li class="entry${p ? " is-started" : ""}${isDone(p) ? " is-done" : ""}" data-id="${b.id}" style="--i:${i}">
        <span class="entry-num">${isDone(p) ? `<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>` : pad(b.num)}</span>
        <span class="entry-glyph" aria-hidden="true">${notation(b.glyph)}</span>
        <div class="entry-body">
          <h3 class="entry-title"><a href="essays/${b.id}/">${esc(b.shortTitle)}</a><span class="entry-leader" aria-hidden="true"></span><span class="entry-pages" aria-hidden="true">${b.pages} pp.</span></h3>
          <p class="entry-desc">${esc(b.description)}</p>
          <p class="entry-meta"><span class="entry-pp">${b.pages} pages</span><span>${esc(b.category)}</span>${st ? `<span class="entry-status">${st}</span>` : ""}</p>
        </div>
        <button class="entry-save${on ? " on" : ""}" aria-pressed="${on}" aria-label="Add ${esc(b.shortTitle)} to reading list" title="${on ? "In your reading list" : "Add to reading list"}">${BOOKMARK}</button>
      </li>`;
  }
  function renderIndex() {
    $("indexList").innerHTML = books.map(entryHTML).join("");
    renderContentsSum();
    filterIndex();
    $("indexList").querySelectorAll(".entry").forEach((el) => {
      inkify(el.querySelector(".entry-glyph"));
      reveal.observe(el);
    });
  }
  $("indexList").addEventListener("click", (e) => {
    const btn = e.target.closest(".entry-save");
    if (!btn) {
      if (e.target.closest("a")) sfx.tick();
      return;
    }
    const now = saved.toggle(btn.closest(".entry").dataset.id);
    now ? sfx.pop() : sfx.unpop();
    btn.classList.toggle("on", now);
    btn.setAttribute("aria-pressed", String(now));
    btn.title = now ? "In your reading list" : "Add to reading list";
    btn.classList.remove("pop");
    void btn.offsetWidth;
    btn.classList.add("pop");
    toast(now ? "Added to your reading list" : "Removed from your reading list");
  });

  /* ---------- Search the contents ---------- */
  function filterIndex() {
    const q = $("indexSearch").value.trim().toLowerCase();
    let shown = 0;
    $("indexList").querySelectorAll(".entry").forEach((el) => {
      const b = byId[el.dataset.id];
      const hay = `${b.title} ${b.description} ${b.category} ${(b.topics || []).join(" ")}`.toLowerCase();
      const match = !q || q.split(/\s+/).every((t) => hay.includes(t));
      el.hidden = !match;
      if (match) {
        shown++;
        if (q) el.classList.add("is-seen"); // skip the scroll-in fade while searching
      }
    });
    $("indexEmpty").hidden = shown > 0;
    if (!shown) $("indexEmptyQuery").textContent = $("indexSearch").value.trim();
  }
  $("indexSearch").addEventListener("input", filterIndex);
  $("indexEmpty").querySelector("button").addEventListener("click", () => {
    $("indexSearch").value = "";
    filterIndex();
    $("indexSearch").focus();
  });
  // "/" jumps to the search box, as on many sites.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || screen !== "essays" || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
    e.preventDefault();
    $("indexSearch").focus();
  });

  /* ---------- Resume dock ---------- */
  function renderDock() {
    const last = progress.latest();
    const b = last && !isDone(last) && byId[last.id];
    $("dock").hidden = !b;
    if (!b) return;
    $("dockTitle").textContent = b.shortTitle;
    $("dockSub").textContent = `Page ${last.page} of ${last.total} · ~${(last.total - last.page + 1) * MIN_PER_PAGE} min left`;
    $("dockBtn").href = readerURL(b, last.page);
  }

  /* ---------- Visits (for the greeting and the Start here picks) ---------- */
  const visits = (() => {
    try {
      const v = (+localStorage.getItem("books.visits") || 0) + 1;
      localStorage.setItem("books.visits", String(v));
      return v;
    } catch {
      return 1;
    }
  })();

  /* ---------- Greeting from the author ---------- */
  function renderGreeting() {
    const store = {
      get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    };
    if (store.get("books.greetingHidden")) return;
    const el = $("greeting");
    if (visits > 1) {
      el.classList.add("is-compact");
      $("greetingTitle").textContent = "Welcome back! Thanks for coming again.";
    }
    el.hidden = false;
    el.querySelector("[data-start]").addEventListener("click", () => {
      sfx.tick();
      $("feature").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    el.querySelector(".greeting-close").addEventListener("click", () => {
      sfx.soft();
      store.set("books.greetingHidden", "1");
      el.classList.add("is-leaving");
      setTimeout(() => (el.hidden = true), 300);
    });
  }

  /* ---------- Reading room ---------- */
  let activeTopic = "All";
  function renderRoom() {
    const all = progress.all();
    const read = Object.entries(all).reduce((n, [id, p]) => n + (byId[id] ? p.page : 0), 0);
    $("pagesRead").textContent = read;
    $("pagesReadLabel").textContent = read === 1 ? "page read" : "pages read";

    const started = books.filter((b) => all[b.id]).sort((a, b) => all[b.id].at - all[a.id].at);
    const inProgress = started.filter((b) => !isDone(all[b.id]));
    const done = started.length - inProgress.length;
    // Unstarted essays, the Start here picks first.
    const unread = books
      .filter((b) => !all[b.id])
      .sort((a, b) => (a.startHere?.order ?? 99) - (b.startHere?.order ?? 99) || a.num - b.num);
    $("roomSub").textContent = started.length
      ? `${inProgress.length} in progress · ${done} finished · saved on this device`
      : "Nothing started yet. Your place in each essay is saved on this device.";

    // Notebook cards led by the essay's symbol; progress only for started essays.
    const card = (b, i, p) => {
      const pct = p ? Math.round((p.page / p.total) * 100) : 0;
      return `
          <a class="shelf-card" href="${readerURL(b, p ? p.page : null)}" style="--i:${i}">
            <span class="shelf-glyph" aria-hidden="true">${notation(b.glyph)}</span>
            <h3>${esc(b.shortTitle)}</h3>
            <p class="shelf-meta">No. ${pad(b.num)} · ${esc(b.category)} · ${b.pages} pages</p>
            ${p ? `<p class="shelf-pg">Page ${p.page} of ${p.total} <span>${pct}%</span></p><div class="bar"><i style="width:${pct}%"></i></div>` : ""}
          </a>`;
    };
    $("continueBlock").hidden = !inProgress.length;
    $("podium").innerHTML = inProgress.slice(0, 3).map((b, i) => card(b, i, all[b.id])).join("");
    $("upNextBlock").hidden = !unread.length;
    $("upNext").innerHTML = unread.slice(0, 3).map((b, i) => card(b, i, null)).join("");
    renderChips();
    renderList();
    renderHighlights();
  }

  /* ---------- Highlights saved in the reader (js/quote.js) ---------- */
  const readHL = () => {
    try { return JSON.parse(localStorage.getItem("books.highlights")) || []; } catch { return []; }
  };
  function renderHighlights() {
    const list = readHL().map((h, i) => ({ ...h, i })).sort((a, b) => b.at - a.at);
    $("hlEmpty").hidden = list.length > 0;
    $("hlList").innerHTML = list
      .map((h) => `
        <li>
          <blockquote>“${esc(h.text)}”</blockquote>
          <p class="hl-meta">
            <a href="reader.html?id=${encodeURIComponent(h.book)}&page=${h.page}">${esc(byId[h.book]?.shortTitle || h.title)} · p. ${h.page}</a>
            <button class="link hl-remove" type="button" data-i="${h.i}">Remove</button>
          </p>
        </li>`)
      .join("");
  }
  $("hlList").addEventListener("click", (e) => {
    const btn = e.target.closest(".hl-remove");
    if (!btn) return;
    const list = readHL();
    list.splice(+btn.dataset.i, 1);
    try { localStorage.setItem("books.highlights", JSON.stringify(list)); } catch {}
    sfx.unpop();
    toast("Highlight removed");
    renderHighlights();
  });

  function renderChips() {
    const cats = ["All", "Saved", ...new Set(books.map((b) => b.category))];
    $("chips").innerHTML = cats
      .map((c) => `<button class="chip${c === activeTopic ? " is-active" : ""}" data-topic="${esc(c)}" aria-pressed="${c === activeTopic}">${c === "Saved" ? "Reading list" : esc(c)}</button>`)
      .join("");
  }
  $("chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c) return;
    sfx.soft();
    activeTopic = c.dataset.topic;
    renderChips();
    renderList();
  });
  $("search").addEventListener("input", renderList);

  function renderList() {
    const q = $("search").value.trim().toLowerCase();
    const savedIds = saved.list();
    const list = books.filter((b) => {
      if (activeTopic === "Saved" && !savedIds.includes(b.id)) return false;
      if (activeTopic !== "All" && activeTopic !== "Saved" && b.category !== activeTopic) return false;
      if (!q) return true;
      const hay = `${b.title} ${b.author} ${b.category} ${b.description}`.toLowerCase();
      return q.split(/\s+/).every((t) => hay.includes(t));
    });
    $("shelfList").innerHTML = list
      .map((b, i) => {
        const p = progress.get(b.id);
        const pct = p ? Math.round((p.page / p.total) * 100) : 0;
        const on = savedIds.includes(b.id);
        const status = isDone(p) ? "Completed" : p ? `Page ${p.page} of ${p.total}` : `${b.pages} pages · Not started`;
        return `
          <div class="row" data-id="${b.id}" style="--i:${i}">
            <span class="n">${pad(b.num)}</span>
            <span class="row-glyph" aria-hidden="true">${notation(b.glyph)}</span>
            <div class="row-title"><a href="essays/${b.id}/" class="row-link"><strong>${esc(b.shortTitle)}</strong></a><span>${esc(b.category)} · ${esc(b.author)}</span></div>
            <div class="row-progress"><small>${status}</small><div class="bar"><i style="width:${pct}%"></i></div></div>
            <div class="row-acts">
              <button class="ib save-toggle${on ? " on" : ""}" aria-pressed="${on}" aria-label="Add ${esc(b.shortTitle)} to reading list" title="${on ? "In your reading list" : "Add to reading list"}">${BOOKMARK}</button>
              <button class="ib cite-btn" aria-label="Cite this essay" title="Cite this essay"><svg viewBox="0 0 24 24"><path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6"/></svg></button>
              <a class="ib" href="${esc(b.file)}" download data-title="${esc(b.title)}" aria-label="Request the PDF" title="Request the PDF"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg></a>
            </div>
          </div>`;
      })
      .join("");
    $("empty").hidden = list.length > 0;
    $("empty").textContent = activeTopic === "Saved" && !savedIds.length ? "Your reading list is empty. Select + on any essay to add it." : "No essays match your search.";
  }
  $("shelfList").addEventListener("click", (e) => {
    const row = e.target.closest(".row");
    if (!row) return;
    if (e.target.closest(".save-toggle")) {
      const now = saved.toggle(row.dataset.id);
      now ? sfx.pop() : sfx.unpop();
      toast(now ? "Added to your reading list" : "Removed from your reading list");
      renderList();
      renderIndex();
      return;
    }
    if (e.target.closest(".cite-btn")) {
      const b = byId[row.dataset.id];
      window.Site.cite(b, new URL(`essays/${b.id}/`, location.href.split("#")[0]).href);
      return;
    }
    if (e.target.closest("a")) sfx.tick(); // essay page or PDF request link
  });

  /* ---------- Start ---------- */
  renderGreeting();
  renderFeature();
  renderStart();
  renderIndex();
  renderDock();
  const startAt = location.hash.slice(1);
  if (ORDER.includes(startAt) && startAt !== "essays") go(startAt, false);

  // Refresh progress when coming back from the reader with the back button.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      renderFeature();
      renderIndex();
      renderDock();
      if (screen === "room") renderRoom();
    }
  });
})();
