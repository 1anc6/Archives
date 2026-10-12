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
    $("track").innerHTML = `<p class="empty">The essays could not be loaded. Please refresh the page.</p>`;
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
    const a = e.target.closest("a.podium-card, #dockBtn[href]");
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
  // "New" for essays added in the last 45 days.
  const isNew = (b) => b.added && Date.now() - new Date(b.added).getTime() < 45 * 864e5;

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

  /* ---------- Hero numbers ---------- */
  const topics = new Set(books.map((b) => b.category)).size;
  const totalPages = books.reduce((n, b) => n + b.pages, 0);
  const hours = Math.round((totalPages * MIN_PER_PAGE) / 60);
  $("heroNumbers").innerHTML = `
    <span><b>${pad(books.length)}</b><small>essays</small></span>
    <span><b>${pad(topics)}</b><small>subject areas</small></span>
    <span><b>${totalPages}</b><small>pages</small></span>`;
  $("aboutStats").innerHTML = `
    <span><b>${books.length}</b>essays</span>
    <span><b>${topics}</b>subject areas</span>
    <span><b>${totalPages}</b>pages</span>
    <span><b>~${hours} h</b>reading time</span>`;

  $("contributors").innerHTML = books
    .map((b) => `<li><a href="essays/${b.id}/"><strong>${esc(b.author)}</strong><span>${esc(b.shortTitle)}</span></a></li>`)
    .join("");

  /* ---------- Carousel ---------- */
  const track = $("track");
  let selected = null;
  let homeTopic = "All";
  let shown = books;

  function cardHTML(b, i) {
    const p = progress.get(b.id);
    const pct = p ? Math.round((p.page / p.total) * 100) : 0;
    const on = saved.has(b.id);
    return `
      <div class="card" role="button" tabindex="0" aria-pressed="false" data-id="${b.id}" style="--i:${i}" aria-label="${esc(b.title)}">
        ${photo(b, i < 3, true)}
        ${isNew(b) ? `<span class="new-badge">NEW</span>` : ""}
        <button class="save-mark${on ? " on" : ""}" aria-label="${on ? "Remove from" : "Add to"} reading list" title="${on ? "In your reading list" : "Add to reading list"}">${on ? "✓" : "+"}</button>
        <span class="copy">
          <span class="meta"><span>${esc(b.category)}</span><span class="num">${pad(b.num)}</span></span>
          <span class="name">${esc(b.shortTitle)}</span>
          <span class="by">by ${esc(b.author)}</span>
          <span class="desc">${esc(b.description)}</span>
          ${p ? `<span class="progress-line" title="${pct}% read"><i style="width:${pct}%"></i></span>` : ""}
          <a class="action" href="essays/${b.id}/">${isDone(p) ? "Completed · view essay" : p ? `Page ${p.page} of ${p.total} · view essay` : "View essay"}<span aria-hidden="true">↗</span></a>
        </span>
      </div>`;
  }
  function renderCarousel() {
    track.innerHTML = shown.map(cardHTML).join("");
    if (selected) track.querySelector(`[data-id="${selected}"]`)?.classList.add("is-selected");
    updatePosition();
  }

  function select(id) {
    sfx.tick();
    selected = selected === id ? null : id;
    track.querySelectorAll(".card").forEach((c) => {
      const on = c.dataset.id === selected;
      c.classList.toggle("is-selected", on);
      c.setAttribute("aria-pressed", String(on));
    });
    renderDock();
  }
  track.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    if (e.target.closest("a.action")) {
      sfx.tick();
      return;
    }
    if (e.target.closest(".save-mark")) {
      const now = saved.toggle(card.dataset.id);
      now ? sfx.pop() : sfx.unpop();
      const m = e.target.closest(".save-mark");
      m.classList.toggle("on", now);
      m.textContent = now ? "✓" : "+";
      m.classList.remove("pop");
      void m.offsetWidth;
      m.classList.add("pop");
      toast(now ? "Added to your reading list" : "Removed from your reading list");
      return;
    }
    select(card.dataset.id);
  });
  track.addEventListener("dblclick", (e) => {
    const card = e.target.closest(".card");
    if (card && !e.target.closest(".save-mark")) openReader(byId[card.dataset.id]);
  });
  track.addEventListener("keydown", (e) => {
    const card = e.target.closest(".card");
    if (card && e.target === card && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      select(card.dataset.id);
    }
  });

  function cardStep() {
    const c = track.querySelector(".card");
    return c ? c.getBoundingClientRect().width + (parseFloat(getComputedStyle(track).columnGap) || 24) : 300;
  }
  function updatePosition() {
    const step = cardStep();
    const n = shown.length;
    const first = Math.min(n, Math.round(track.scrollLeft / step) + 1);
    const visible = Math.max(1, Math.round(track.clientWidth / step));
    const last = Math.min(n, first + visible - 1);
    $("position").innerHTML = `${pad(first)}${last > first ? ` — ${pad(last)}` : ""} <i>/ ${pad(n)}</i>`;
    $("prevBtn").disabled = track.scrollLeft <= 2;
    $("nextBtn").disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
  }
  let posRaf;
  track.addEventListener("scroll", () => {
    cancelAnimationFrame(posRaf);
    posRaf = requestAnimationFrame(updatePosition);
  }, { passive: true });
  $("prevBtn").addEventListener("click", () => { sfx.soft(); track.scrollBy({ left: -cardStep() }); });
  $("nextBtn").addEventListener("click", () => { sfx.soft(); track.scrollBy({ left: cardStep() }); });
  // Re-measure whenever the carousel changes size (window resize, or the screen being shown again).
  if ("ResizeObserver" in window) new ResizeObserver(updatePosition).observe(track);
  else window.addEventListener("resize", updatePosition);

  /* ---------- Subject filter on the home page ---------- */
  function renderHomeChips() {
    const cats = ["All", ...new Set(books.map((b) => b.category))];
    $("homeChips").innerHTML = cats
      .map((c) => `<button class="chip${c === homeTopic ? " is-active" : ""}" data-topic="${esc(c)}" aria-pressed="${c === homeTopic}">${esc(c)}${c === "All" ? "" : ` <i>${books.filter((b) => b.category === c).length}</i>`}</button>`)
      .join("");
  }
  $("homeChips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (!c || c.dataset.topic === homeTopic) return;
    sfx.soft();
    homeTopic = c.dataset.topic;
    shown = homeTopic === "All" ? books : books.filter((b) => b.category === homeTopic);
    renderHomeChips();
    track.scrollTo({ left: 0, behavior: "auto" });
    renderCarousel();
  });
  renderHomeChips();

  /* ---------- Dock ---------- */
  function openReader(b) {
    const p = progress.get(b.id);
    goTo(readerURL(b, p && !isDone(p) ? p.page : null));
  }
  function renderDock() {
    const btn = $("dockBtn");
    let b = selected && byId[selected];
    let title, sub, label;
    if (b) {
      const p = progress.get(b.id);
      title = `Selected · ${b.shortTitle}`;
      sub = p && !isDone(p) ? `Page ${p.page} of ${p.total}` : `${b.pages} pages · approx. ${b.pages * MIN_PER_PAGE} min read`;
      label = p && !isDone(p) ? "Continue reading" : "Begin reading";
    } else {
      const last = progress.latest();
      b = last && !isDone(last) && byId[last.id];
      if (b) {
        title = `Resume reading · ${b.shortTitle}`;
        sub = `Page ${last.page} of ${last.total} · or select another essay above`;
        label = "Resume";
      }
    }
    const dock = $("dock");
    dock.classList.remove("changed", "is-active");
    void dock.offsetWidth;
    dock.classList.add("changed");
    if (selected) dock.classList.add("is-active");
    if (!b) {
      $("dockTitle").textContent = "Select an essay";
      $("dockSub").textContent = "Choose a title above to begin reading";
      btn.setAttribute("aria-disabled", "true");
      btn.removeAttribute("href");
      btn.innerHTML = `Select an essay<span aria-hidden="true">↗</span>`;
      return;
    }
    $("dockTitle").textContent = title;
    $("dockSub").textContent = sub;
    const p = progress.get(b.id);
    btn.href = readerURL(b, p && !isDone(p) ? p.page : null);
    btn.setAttribute("aria-disabled", "false");
    btn.innerHTML = `${label}<span aria-hidden="true">↗</span>`;
  }

  /* ---------- Reading room ---------- */
  let activeTopic = "All";
  function renderRoom() {
    const all = progress.all();
    const read = Object.entries(all).reduce((n, [id, p]) => n + (byId[id] ? p.page : 0), 0);
    $("pagesRead").textContent = read;

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
            <div class="rank">${pad(i + 1)}</div>
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
          <div class="row" data-id="${b.id}" style="--i:${i}" role="link" tabindex="0" aria-label="Read ${esc(b.title)}">
            <span class="n">${pad(b.num)}</span>
            ${photo(b)}
            <div class="row-title"><a href="essays/${b.id}/" class="row-link"><strong>${esc(b.shortTitle)}</strong></a><span>${esc(b.category)} · ${esc(b.author)}</span></div>
            <div class="row-progress"><small>${status}</small><div class="bar"><i style="width:${pct}%"></i></div></div>
            <div class="row-acts">
              <button class="ib save-toggle${on ? " on" : ""}" aria-label="${on ? "Remove from" : "Add to"} reading list" title="${on ? "In your reading list" : "Add to reading list"}">${on ? "✓" : "+"}</button>
              <button class="ib cite-btn" aria-label="Cite this essay" title="Cite this essay"><svg viewBox="0 0 24 24"><path d="M7 7h4v4c0 3-1.5 5-4 6M14 7h4v4c0 3-1.5 5-4 6"/></svg></button>
              <a class="ib" href="${esc(b.file)}" download aria-label="Download PDF" title="Download PDF"><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg></a>
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
      renderCarousel();
      return;
    }
    if (e.target.closest(".cite-btn")) {
      const b = byId[row.dataset.id];
      window.Site.cite(b, new URL(`essays/${b.id}/`, location.href.split("#")[0]).href);
      return;
    }
    if (e.target.closest("a")) {
      sfx.tick();
      return; // essay page or download link
    }
    openReader(byId[row.dataset.id]);
  });
  $("shelfList").addEventListener("keydown", (e) => {
    const row = e.target.closest(".row");
    if (row && e.target === row && e.key === "Enter") openReader(byId[row.dataset.id]);
  });

  /* ---------- Start ---------- */
  renderCarousel();
  renderDock();
  const startAt = location.hash.slice(1);
  if (ORDER.includes(startAt) && startAt !== "essays") go(startAt, false);

  // Refresh progress when coming back from the reader with the back button.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      renderCarousel();
      renderDock();
      if (screen === "room") renderRoom();
    }
  });
})();
