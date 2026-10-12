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

  /* ---------- Sound effects on/off ---------- */
  const sfxBtn = $("sfxBtn");
  function showSfx() {
    if (!sfxBtn) return;
    sfxBtn.classList.toggle("is-muted", sfx.muted);
    sfxBtn.title = sfx.muted ? "Sound effects off" : "Sound effects on";
    sfxBtn.setAttribute("aria-pressed", String(!sfx.muted));
  }
  sfxBtn?.addEventListener("click", () => {
    sfx.toggle();
    showSfx();
  });
  showSfx();

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
    } catch {}
  }
  document.addEventListener("click", (e) => {
    if (e.target.closest("#shareBtn, [data-share]")) {
      sfx.tick();
      share();
    }
  });

  /* ---------- Citations ---------- */
  const SITE_TITLE = "Lance's Unorthodox Essay Papers";
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
    const list = citations(book, url);
    let active = 0;
    const scrim = document.createElement("div");
    scrim.className = "cite-scrim";
    scrim.innerHTML = `
      <div class="cite-dialog" role="dialog" aria-modal="true" aria-labelledby="citeTitle">
        <div class="cite-head">
          <div><div class="kicker plain">CITE THIS ESSAY</div><h2 id="citeTitle">${esc(book.title)}</h2></div>
          <button class="ib" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
        <div class="cite-tabs" role="tablist">${list.map((c, i) => `<button role="tab" data-i="${i}" class="${i === 0 ? "active" : ""}">${c.name}</button>`).join("")}</div>
        <div class="cite-box" id="citeBox"></div>
        <div class="cite-foot">
          <span class="muted">Check the format against your institution's style guide.</span>
          <button class="btn primary" data-copy>Copy citation<span aria-hidden="true">↗</span></button>
        </div>
      </div>`;
    document.body.appendChild(scrim);
    document.body.classList.add("no-scroll");
    const box = scrim.querySelector("#citeBox");
    const show = () => {
      const c = list[active];
      box.classList.toggle("mono", !!c.mono);
      box.innerHTML = c.mono ? `<pre>${esc(c.text)}</pre>` : `<p>${c.html}</p>`;
      scrim.querySelectorAll(".cite-tabs button").forEach((b, i) => b.classList.toggle("active", i === active));
    };
    show();
    const close = () => {
      scrim.classList.add("out");
      document.body.classList.remove("no-scroll");
      setTimeout(() => scrim.remove(), 200);
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => e.key === "Escape" && close();
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
    scrim.querySelector(".cite-tabs button").focus();
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

  window.Site = { toast, share, cite, setTheme };
})();
