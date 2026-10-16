// Shared behaviour for every page: theme, sound-effects toggle, share,
// toasts and the "Cite this essay" dialog. Exposes window.Site.
(function () {
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const sfx = window.Sfx || { tick() {}, soft() {}, pop() {}, unpop() {}, ding() {}, muted: true, toggle() {} };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    let t = $("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.hidden = false;
    t.style.animation = "none";
    void t.offsetWidth;
    t.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2400);
  }

  /* ---------- Theme ---------- */
  function setTheme(t) {
    root.dataset.theme = t;
    try { localStorage.setItem("books.theme", t); } catch {}
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === "dark" ? "#28251f" : "#eee9e3";
  }
  setTheme(root.dataset.theme || "light");
  $("themeBtn")?.addEventListener("click", () => {
    sfx.soft();
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });

  /* ---------- Sound effects: on/off and a choice of sound sets ---------- */
  // The button opens a small panel (styled like the music one) with an
  // on/off switch and the sound sets; picking a set plays a sample of it.
  const sfxBtn = $("sfxBtn");
  const packs = sfx.packs || [];
  let sfxPop = null;
  const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M17 9.5a4 4 0 0 1 0 5"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="m17 10 4 4m0-4-4 4"/></svg>';
  function showSfx() {
    if (!sfxBtn) return;
    const name = packs.find((p) => p.id === sfx.pack)?.title;
    sfxBtn.classList.toggle("is-muted", sfx.muted);
    sfxBtn.title = sfx.muted ? "Sound effects off" : `Sound effects: ${name || "on"}`;
    sfxBtn.setAttribute("aria-pressed", String(!sfx.muted));
    if (sfxPop) {
      const focusKey = document.activeElement?.dataset?.sfx;
      sfxPop.innerHTML = `
        <div class="mp-now">
          <button type="button" class="mp-toggle sfx-toggle" data-sfx="toggle" aria-pressed="${!sfx.muted}" aria-label="${sfx.muted ? "Turn sound effects on" : "Turn sound effects off"}">${sfx.muted ? ICON_OFF : ICON_ON}</button>
          <div class="mp-meta"><span class="mp-label">Sound effects</span><span class="mp-title">${sfx.muted ? "Off" : esc(name || "On")}</span></div>
        </div>
        <ul class="mp-list" aria-label="Sound sets">${packs.map((p) => `
          <li><button type="button" data-sfx="${p.id}" aria-pressed="${!sfx.muted && p.id === sfx.pack}">
            <span class="mp-dot" aria-hidden="true"></span>
            <span class="mp-t">${esc(p.title)}</span>
            <span class="mp-n">${esc(p.note)}</span>
          </button></li>`).join("")}
        </ul>`;
      sfxPop.querySelector(`[data-sfx="${focusKey}"]`)?.focus({ preventScroll: true });
    }
  }
  function placeSfx() {
    if (!sfxPop) return;
    const r = sfxBtn.getBoundingClientRect();
    const w = Math.min(300, innerWidth - 24);
    sfxPop.style.width = `${w}px`;
    sfxPop.style.top = `${Math.round(r.bottom + 8)}px`;
    sfxPop.style.left = `${Math.round(Math.min(Math.max(12, r.right - w), innerWidth - w - 12))}px`;
  }
  function sfxOutside(e) {
    if (!sfxPop.contains(e.target) && !sfxBtn.contains(e.target)) closeSfx(false);
  }
  function sfxKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); closeSfx(); }
  }
  function openSfx() {
    sfxPop = document.createElement("div");
    sfxPop.className = "music-pop";
    sfxPop.setAttribute("role", "dialog");
    sfxPop.setAttribute("aria-label", "Sound effects");
    document.body.appendChild(sfxPop);
    showSfx();
    placeSfx();
    sfxBtn.setAttribute("aria-expanded", "true");
    sfxPop.querySelector("[data-sfx=toggle]").focus({ preventScroll: true });
    setTimeout(() => document.addEventListener("pointerdown", sfxOutside), 0);
    document.addEventListener("keydown", sfxKey);
    addEventListener("resize", placeSfx);
    addEventListener("scroll", placeSfx, { passive: true });
  }
  function closeSfx(refocus = true) {
    if (!sfxPop) return;
    sfxPop.remove();
    sfxPop = null;
    sfxBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", sfxOutside);
    document.removeEventListener("keydown", sfxKey);
    removeEventListener("resize", placeSfx);
    removeEventListener("scroll", placeSfx);
    if (refocus) sfxBtn.focus({ preventScroll: true });
  }
  sfxBtn?.setAttribute("aria-haspopup", "dialog");
  sfxBtn?.setAttribute("aria-expanded", "false");
  sfxBtn?.addEventListener("click", () => {
    if (!packs.length) { sfx.toggle(); return showSfx(); }
    sfxPop ? closeSfx() : openSfx();
  });
  document.addEventListener("click", (e) => {
    const b = sfxPop && e.target.closest("[data-sfx]");
    if (!b || !sfxPop.contains(b)) return;
    b.dataset.sfx === "toggle" ? sfx.toggle() : sfx.setPack(b.dataset.sfx);
    showSfx();
  });
  showSfx();

  /* ---------- Looks: the reader picks how the interface is drawn ---------- */
  // The original design is the default. Each other look has a touch sound
  // that suits it, and picking a look switches to that sound set.
  const LOOKS = [
    { id: "classic", title: "Original", note: "Squared paper, flat and quiet", sound: "click" },
    { id: "skeuo", title: "Skeuomorphic", note: "Bevelled keys, paper you can almost touch", sound: "switch" },
    { id: "neu", title: "Neumorphic", note: "Soft shapes pressed out of the page", sound: "press" },
    { id: "glass", title: "Glass", note: "Frosted panels floating over colour", sound: "chime" },
  ];
  const uiBtn = $("uiBtn");
  let uiPop = null;
  const look = () => root.dataset.ui || "classic";
  function setLook(id) {
    if (id === "classic") delete root.dataset.ui;
    else root.dataset.ui = id;
    try { localStorage.setItem("books.ui", id); } catch {}
  }
  function showUi() {
    if (!uiBtn) return;
    const cur = LOOKS.find((l) => l.id === look()) || LOOKS[0];
    uiBtn.title = `Look: ${cur.title}`;
    if (!uiPop) return;
    const focusKey = document.activeElement?.dataset?.look;
    uiPop.innerHTML = `
      <div class="mp-now">
        <div class="mp-meta"><span class="mp-label">Look</span><span class="mp-title">${esc(cur.title)}</span></div>
      </div>
      <ul class="mp-list ui-list" aria-label="Looks">${LOOKS.map((l) => `
        <li><button type="button" data-look="${l.id}" aria-pressed="${l.id === cur.id}">
          <span class="ui-swatch" data-swatch="${l.id}" aria-hidden="true"></span>
          <span class="mp-t">${esc(l.title)}</span>
          <span class="mp-n">${esc(l.note)}</span>
        </button></li>`).join("")}
      </ul>`;
    uiPop.querySelector(`[data-look="${focusKey}"]`)?.focus({ preventScroll: true });
  }
  function placeUi() {
    if (!uiPop) return;
    const r = uiBtn.getBoundingClientRect();
    const w = Math.min(300, innerWidth - 24);
    uiPop.style.width = `${w}px`;
    uiPop.style.top = `${Math.round(r.bottom + 8)}px`;
    uiPop.style.left = `${Math.round(Math.min(Math.max(12, r.right - w), innerWidth - w - 12))}px`;
  }
  function uiOutside(e) {
    if (!uiPop.contains(e.target) && !uiBtn.contains(e.target)) closeUi(false);
  }
  function uiKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); closeUi(); }
  }
  function openUi() {
    uiPop = document.createElement("div");
    uiPop.className = "music-pop";
    uiPop.setAttribute("role", "dialog");
    uiPop.setAttribute("aria-label", "Look");
    document.body.appendChild(uiPop);
    showUi();
    placeUi();
    uiBtn.setAttribute("aria-expanded", "true");
    uiPop.querySelector(`[data-look="${look()}"]`)?.focus({ preventScroll: true });
    setTimeout(() => document.addEventListener("pointerdown", uiOutside), 0);
    document.addEventListener("keydown", uiKey);
    addEventListener("resize", placeUi);
    addEventListener("scroll", placeUi, { passive: true });
  }
  function closeUi(refocus = true) {
    if (!uiPop) return;
    uiPop.remove();
    uiPop = null;
    uiBtn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", uiOutside);
    document.removeEventListener("keydown", uiKey);
    removeEventListener("resize", placeUi);
    removeEventListener("scroll", placeUi);
    if (refocus) uiBtn.focus({ preventScroll: true });
  }
  uiBtn?.setAttribute("aria-haspopup", "dialog");
  uiBtn?.setAttribute("aria-expanded", "false");
  uiBtn?.addEventListener("click", () => {
    sfx.soft();
    uiPop ? closeUi() : openUi();
  });
  document.addEventListener("click", (e) => {
    const b = uiPop && e.target.closest("[data-look]");
    if (!b || !uiPop.contains(b)) return;
    const l = LOOKS.find((x) => x.id === b.dataset.look);
    if (!l) return;
    setLook(l.id);
    sfx.usePack?.(l.sound);
    showUi();
    showSfx();
    placeUi();
  });
  showUi();

  /* ---------- Share ---------- */
  function canonical() {
    return document.querySelector('link[rel="canonical"]')?.href || location.href.split("#")[0];
  }
  async function share(data = {}) {
    const payload = {
      title: data.title || document.title,
      text: data.text || document.querySelector('meta[name="description"]')?.content || "",
      url: data.url || canonical(),
    };
    try {
      if (navigator.share) await navigator.share(payload);
      else {
        await navigator.clipboard.writeText(payload.url);
        toast("Link copied to clipboard");
      }
    } catch (err) {
      // Closing the share sheet is not an error.
      if (err?.name !== "AbortError") toast("Couldn't share this page. Copy the link from the address bar instead.");
    }
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#shareBtn, [data-share]")) {
      sfx.tick();
      share();
    }
  });

  /* ---------- Citations ---------- */
  const SITE_TITLE = "The Open Archive";
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function citations(book, url) {
    const parts = book.author.trim().split(/\s+/);
    const family = parts.pop();
    const given = parts.join(" ");
    const initials = parts.map((p) => p[0] + ".").join(" ");
    const year = book.year || new Date().getFullYear();
    const d = new Date();
    const accessed = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const iso = d.toISOString().slice(0, 10);
    const t = book.title;
    const key = `${family.toLowerCase()}${year}${book.id.split("-")[0]}`;
    return [
      { name: "APA", html: `${esc(family)}, ${esc(initials)} (${year}). <i>${esc(t)}</i>. ${esc(SITE_TITLE)}. ${esc(url)}`,
        text: `${family}, ${initials} (${year}). ${t}. ${SITE_TITLE}. ${url}` },
      { name: "MLA", html: `${esc(family)}, ${esc(given)}. “${esc(t)}.” <i>${esc(SITE_TITLE)}</i>, ${year}, ${esc(url.replace(/^https?:\/\//, ""))}.`,
        text: `${family}, ${given}. “${t}.” ${SITE_TITLE}, ${year}, ${url.replace(/^https?:\/\//, "")}.` },
      { name: "Chicago", html: `${esc(family)}, ${esc(given)}. “${esc(t)}.” <i>${esc(SITE_TITLE)}</i>, ${year}. ${esc(url)}.`,
        text: `${family}, ${given}. “${t}.” ${SITE_TITLE}, ${year}. ${url}.` },
      { name: "Harvard", html: `${esc(family)}, ${esc(initials)} (${year}) <i>${esc(t)}</i>. ${esc(SITE_TITLE)}. Available at: ${esc(url)} (Accessed: ${accessed}).`,
        text: `${family}, ${initials} (${year}) ${t}. ${SITE_TITLE}. Available at: ${url} (Accessed: ${accessed}).` },
      { name: "BibTeX", mono: true,
        text: `@misc{${key},\n  author       = {${family}, ${given}},\n  title        = {${t}},\n  year         = {${year}},\n  howpublished = {${SITE_TITLE}},\n  url          = {${url}},\n  note         = {Accessed: ${iso}}\n}` },
    ];
  }

  function cite(book, url = canonical()) {
    sfx.tick();
    const opener = document.activeElement;
    const list = citations(book, url);
    let active = 0;
    const scrim = document.createElement("div");
    scrim.className = "cite-scrim";
    scrim.innerHTML = `
      <div class="cite-dialog" role="dialog" aria-modal="true" aria-labelledby="citeTitle">
        <div class="cite-head">
          <div><h2 id="citeTitle"><span class="cite-label">Cite this essay</span>${esc(book.title)}</h2></div>
          <button class="ib" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
        <div class="cite-tabs" role="tablist" aria-label="Citation style">${list.map((c, i) => `<button role="tab" id="citeTab${i}" aria-controls="citeBox" data-i="${i}">${c.name}</button>`).join("")}</div>
        <div class="cite-box" id="citeBox" role="tabpanel" tabindex="0"></div>
        <div class="cite-foot">
          <span class="muted">Check the format against your institution's style guide.</span>
          <button class="btn primary" data-copy>Copy citation</button>
        </div>
      </div>`;
    document.body.appendChild(scrim);
    document.body.classList.add("no-scroll");
    const box = scrim.querySelector("#citeBox");
    const show = () => {
      const c = list[active];
      box.classList.toggle("mono", !!c.mono);
      box.innerHTML = c.mono ? `<pre>${esc(c.text)}</pre>` : `<p>${c.html}</p>`;
      scrim.querySelectorAll(".cite-tabs button").forEach((b, i) => {
        b.classList.toggle("active", i === active);
        b.setAttribute("aria-selected", String(i === active));
        b.tabIndex = i === active ? 0 : -1;
      });
      box.setAttribute("aria-labelledby", `citeTab${active}`);
    };
    show();
    const close = () => {
      scrim.classList.add("out");
      document.body.classList.remove("no-scroll");
      setTimeout(() => scrim.remove(), 200);
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") return close();
      // Arrow keys move between citation styles.
      const tab = e.target.closest?.(".cite-tabs button");
      if (tab && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        e.preventDefault();
        active = (active + (e.key === "ArrowRight" ? 1 : list.length - 1)) % list.length;
        show();
        scrim.querySelectorAll(".cite-tabs button")[active].focus();
        return;
      }
      // Keep keyboard focus inside the dialog.
      if (e.key === "Tab") {
        const f = [...scrim.querySelectorAll("button, [tabindex='0']")].filter((el) => el.tabIndex >= 0);
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    scrim.addEventListener("click", async (e) => {
      if (e.target === scrim || e.target.closest("[data-close]")) return close();
      const tab = e.target.closest(".cite-tabs button");
      if (tab) {
        sfx.soft();
        active = +tab.dataset.i;
        return show();
      }
      if (e.target.closest("[data-copy]")) {
        const c = list[active];
        try {
          if (!c.mono && window.ClipboardItem) {
            await navigator.clipboard.write([new ClipboardItem({
              "text/html": new Blob([c.html], { type: "text/html" }),
              "text/plain": new Blob([c.text], { type: "text/plain" }),
            })]);
          } else await navigator.clipboard.writeText(c.text);
          sfx.pop();
          toast(`${c.name} citation copied`);
        } catch {
          toast("Copy failed. Please select the text and copy it manually.");
        }
      }
    });
    scrim.querySelector(".cite-tabs button.active").focus();
  }

  /* ---------- "New" labels (essays added in the last 45 days) ---------- */
  document.querySelectorAll(".new-badge[data-added]").forEach((el) => {
    el.hidden = !(Date.now() - new Date(el.dataset.added).getTime() < 45 * 864e5);
  });

  /* ---------- Essay pages ---------- */
  const essayData = $("essayData");
  if (essayData) {
    const book = JSON.parse(essayData.textContent);
    document.querySelectorAll("[data-cite]").forEach((b) => b.addEventListener("click", () => cite(book)));
    // Show reading progress and turn "Read essay" into "Continue".
    const p = window.Shelf?.progress.get(book.id);
    const readBtn = document.querySelector("[data-read]");
    if (p && readBtn) {
      const done = p.page >= p.total;
      $("progressNote").hidden = false;
      $("progressNote").innerHTML = done
        ? `You have completed this essay.`
        : `You are on page ${p.page} of ${p.total}. <span class="bar"><i style="width:${Math.round((p.page / p.total) * 100)}%"></i></span>`;
      if (!done) {
        readBtn.href = readBtn.href.replace(/&page=\d+/, "") + `&page=${p.page}`;
        readBtn.firstChild.textContent = "Continue reading";
      }
    }
    readBtn?.addEventListener("click", (e) => {
      if (e.metaKey || e.ctrlKey) return;
      e.preventDefault();
      sfx.ding();
      setTimeout(() => (location.href = readBtn.href), sfx.muted ? 0 : 230);
    });
    document.querySelectorAll(".related-card").forEach((a) => a.addEventListener("click", () => sfx.tick()));
  }

  /* ---------- Back to top, after a long scroll (not in the reader) ---------- */
  const topBtn = document.createElement("button");
  topBtn.type = "button";
  topBtn.className = "to-top";
  topBtn.setAttribute("aria-label", "Back to top");
  topBtn.title = "Back to top";
  topBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>';
  document.body.appendChild(topBtn);
  let topQueued = false;
  function placeTopBtn() {
    topQueued = false;
    const show = scrollY > innerHeight * 1.5;
    topBtn.classList.toggle("is-on", show);
    topBtn.tabIndex = show ? 0 : -1;
    // sit above the "Continue reading" dock when it's showing
    const dock = $("dock");
    const dockUp = dock && !dock.hidden && !dock.classList.contains("is-away");
    topBtn.style.bottom = dockUp ? `${dock.offsetHeight + 28}px` : "";
  }
  addEventListener("scroll", () => {
    if (!topQueued) requestAnimationFrame(placeTopBtn);
    topQueued = true;
  }, { passive: true });
  topBtn.addEventListener("click", () => {
    sfx.soft();
    scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    $("content")?.focus({ preventScroll: true });
  });
  placeTopBtn();

  /* ---------- Essay page: the symbol writes itself on ---------- */
  const glyph = document.querySelector(".sheet-glyph");
  if (glyph) {
    let i = 0;
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType !== 3) { walk(child); continue; }
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
      }
    };
    walk(glyph);
    requestAnimationFrame(() => glyph.closest(".essay-sheet").classList.add("is-seen"));
  }

  window.Site = { toast, share, cite, setTheme };
})();
