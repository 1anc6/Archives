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
    document.querySelectorAll(".main-nav [data-go]").forEach((b) => b.classList.toggle("active", b.dataset.go === name));
    $("dock").classList.toggle("is-away", name !== "essays");
    screen = name;
    if (name === "room") renderRoom();
    window.scrollTo({ top: 0 });
    if (push) history.pushState({ screen: name }, "", name === "essays" ? location.pathname : `#${name}`);
  }
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-go]");
    if (el) {
      sfx.tick();
      go(el.dataset.go);
    }
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
    <span><b>~${hours} h</b>reading time</span>`;
  $("contentsSum").textContent = `${books.length} essays · ${totalPages} pages · about ${hours} hours of reading`;

  $("contributors").innerHTML = "<li><strong>Lanchenba Mutum</strong></li>";

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

  /* ---------- Featured essay ---------- */
  function renderFeature() {
    const b = books.find((x) => x.excerpt) || books[0];
    const p = progress.get(b.id);
    const resume = p && !isDone(p);
    const quote = b.excerpt
      ? `<blockquote class="excerpt"><p>${esc(b.excerpt.text)}</p><footer>From the ${esc(b.excerpt.from.toLowerCase())}</footer></blockquote>`
      : `<p class="excerpt-plain">${esc(b.description)}</p>`;
    $("feature").innerHTML = `
      <div class="feature-copy">
        <h2 class="feature-title" id="featureTitle"><a href="essays/${b.id}/">${esc(b.shortTitle)}</a></h2>
        ${b.title !== b.shortTitle ? `<p class="feature-sub">${esc(b.title)}</p>` : ""}
        <p class="feature-meta"><span>No. ${pad(b.num)}</span><span>${esc(b.category)}</span><span>${b.pages} pages · ~${b.pages * MIN_PER_PAGE} min</span></p>
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
  }

  /* ---------- Contents ---------- */
  function entryHTML(b, i) {
    const p = progress.get(b.id);
    const on = saved.has(b.id);
    const st = status(b, p);
    return `
      <li class="entry${p ? " is-started" : ""}" data-id="${b.id}" style="--i:${i}">
        <span class="entry-num">${pad(b.num)}</span>
        <span class="entry-glyph" aria-hidden="true">${notation(b.glyph)}</span>
        <div class="entry-body">
          <h3 class="entry-title"><a href="essays/${b.id}/">${esc(b.shortTitle)}</a><span class="entry-leader" aria-hidden="true"></span><span class="entry-pages">${b.pages} pp.</span></h3>
          <p class="entry-desc">${esc(b.description)}</p>
          <p class="entry-meta"><span class="entry-pp">${b.pages} pages</span><span>${esc(b.category)}</span>${st ? `<span class="entry-status">${st}</span>` : ""}</p>
        </div>
        <button class="entry-save${on ? " on" : ""}" aria-pressed="${on}" aria-label="Add ${esc(b.shortTitle)} to reading list" title="${on ? "In your reading list" : "Add to reading list"}">${BOOKMARK}</button>
      </li>`;
  }
  function renderIndex() {
    $("indexList").innerHTML = books.map(entryHTML).join("");
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

  /* ---------- Greeting from the author ---------- */
  function renderGreeting() {
    const store = {
      get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
    };
    if (store.get("books.greetingHidden")) return;
    const visits = (+store.get("books.visits") || 0) + 1;
    store.set("books.visits", String(visits));
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
    const podium = [...inProgress, ...books.filter((b) => !all[b.id]), ...started.filter((b) => isDone(all[b.id]))].slice(0, 3);
    $("roomTitle").textContent = inProgress.length ? "Continue Reading" : "Your Library";
    $("roomSub").textContent = inProgress.length
      ? `${inProgress.length} in progress · ${started.length - inProgress.length} completed · progress is saved on this device`
      : "Recommended starting points. Your progress will be saved on this device.";

    $("podium").innerHTML = podium
      .map((b, i) => {
        const p = all[b.id];
        const pct = p ? Math.round((p.page / p.total) * 100) : 0;
        const badge = i === 0 ? (p && !isDone(p) ? "IN PROGRESS" : "RECOMMENDED") : "";
        return `
          <a class="podium-card" href="${readerURL(b, p && !isDone(p) ? p.page : null)}" style="--i:${i}">
            ${photo(b, true)}
            ${badge ? `<span class="badge">${badge}</span>` : ""}
            <div class="podium-copy">
              <span class="meta"><span>${esc(b.category)}</span><span class="num">${pad(b.num)}</span></span>
              <h2>${esc(b.shortTitle)}</h2>
              <p class="by">by ${esc(b.author)}</p>
              <div class="pg"><b>${p ? p.page : 0}</b><small>of ${p ? p.total : b.pages} pages</small><span>${pct}%</span></div>
              <div class="bar"><i style="width:${pct}%"></i></div>
            </div>
          </a>`;
      })
      .join("");
    renderChips();
    renderList();
  }

  function renderChips() {
    const cats = ["All", "Saved", ...new Set(books.map((b) => b.category))];
    $("chips").innerHTML = cats
      .map((c) => `<button class="chip${c === activeTopic ? " is-active" : ""}" data-topic="${esc(c)}">${c === "Saved" ? "Reading list" : esc(c)}</button>`)
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
            ${photo(b)}
            <div class="row-title"><a href="essays/${b.id}/" class="row-link"><strong>${esc(b.shortTitle)}</strong></a><span>${esc(b.category)} · ${esc(b.author)}</span></div>
            <div class="row-progress"><small>${status}</small><div class="bar"><i style="width:${pct}%"></i></div></div>
            <div class="row-acts">
              <button class="ib save-toggle${on ? " on" : ""}" aria-pressed="${on}" aria-label="Add ${esc(b.shortTitle)} to reading list" title="${on ? "In your reading list" : "Add to reading list"}">${BOOKMARK}</button>
              <button class="ib cite-btn" aria-label="Cite this essay" title="Cite this essay"><svg viewBox="0 0 24 24"><path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6"/></svg></button>
              <a class="ib" href="${esc(b.file)}" download data-title="${esc(b.title)}" aria-label="Download PDF" title="Download PDF"><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg></a>
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
    if (e.target.closest("a")) sfx.tick(); // essay page or download link
  });

  /* ---------- Start ---------- */
  renderGreeting();
  renderFeature();
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
