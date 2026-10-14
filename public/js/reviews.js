// Reviews screen: readers' reviews (stored in Supabase) and how many people
// visited the site and each essay (from GoatCounter's public counters).
// Settings live in data/site.json: "supabase": {"url", "anonKey"} and "goatcounter".
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sfx = window.Sfx || { tick() {}, soft() {}, pop() {} };
  const toast = (m) => window.Site?.toast?.(m);
  const SITE_JSON = new URL("../data/site.json", document.currentScript.src).href;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3.2 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/></svg>';

  let ready = null; // loads settings + essays once
  let config = {}, books = [], byId = {}, reviews = [], views = {}, totalVisits = null;
  let filter = null; // essay id, or null for all
  let loadFailed = false;

  const db = () => config.supabase && config.supabase.url && config.supabase.anonKey ? config.supabase : null;
  const headers = () => ({ apikey: db().anonKey, Authorization: `Bearer ${db().anonKey}` });

  function stars(n, size = "") {
    const full = Math.floor(n + 0.25); // 4.5 shows 4 stars, 4.8 shows 5
    return `<span class="stars ${size}" role="img" aria-label="${n.toFixed ? n.toFixed(1).replace(/\.0$/, "") : n} out of 5 stars">${
      [1, 2, 3, 4, 5].map((i) => `<span class="star${i <= full ? " on" : ""}">${STAR}</span>`).join("")}</span>`;
  }
  const fmt = (n) => (n == null ? "–" : n.toLocaleString("en-GB"));
  const date = (iso) => {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  };

  /* ---------- Data ---------- */
  async function load() {
    const [site, list] = await Promise.all([
      fetch(SITE_JSON, { cache: "no-cache" }).then((r) => r.json()).catch(() => ({})),
      window.Shelf.loadBooks(),
    ]);
    config = site;
    books = list;
    books.forEach((b, i) => (b.num = i + 1));
    byId = Object.fromEntries(books.map((b) => [b.id, b]));
  }

  async function fetchReviews() {
    if (!db()) return [];
    const res = await fetch(`${db().url}/rest/v1/reviews?select=id,created_at,essay_id,name,rating,body&order=created_at.desc&limit=1000`, { headers: headers() });
    if (!res.ok) throw new Error(`Reviews: ${res.status}`);
    return (await res.json()).filter((r) => byId[r.essay_id]);
  }

  // GoatCounter public counters (Settings → "Allow adding visitor counts on your website")
  async function count(path) {
    const code = config.goatcounter;
    if (!code) return null;
    try {
      const res = await fetch(`https://${code}.goatcounter.com/counter/${encodeURIComponent(path)}.json`);
      if (!res.ok) return res.status === 404 ? 0 : null;
      const j = await res.json();
      return parseInt(String(j.count).replace(/\D/g, ""), 10) || 0;
    } catch {
      return null;
    }
  }
  let countsOff = false; // public counters not switched on: don't keep asking
  async function fetchViews() {
    if (countsOff) return;
    const total = await count("TOTAL");
    if (total === null) { countsOff = true; return; }
    const each = await Promise.all(books.map((b) => count(`/essays/${b.id}/`)));
    totalVisits = total;
    views = Object.fromEntries(books.map((b, i) => [b.id, each[i]]));
  }

  /* ---------- Rendering ---------- */
  function summary(id) {
    const list = reviews.filter((r) => r.essay_id === id);
    const avg = list.length ? list.reduce((s, r) => s + r.rating, 0) / list.length : 0;
    return { n: list.length, avg };
  }

  function renderStats() {
    const all = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
    const essayViews = Object.values(views).some((v) => v != null) ? Object.values(views).reduce((s, v) => s + (v || 0), 0) : null;
    const parts = [];
    if (totalVisits != null) parts.push(`<span><b>${fmt(totalVisits)}</b> visits to the site</span>`);
    if (essayViews != null) parts.push(`<span><b>${fmt(essayViews)}</b> essay views</span>`);
    parts.push(`<span><b>${fmt(reviews.length)}</b> ${reviews.length === 1 ? "review" : "reviews"}</span>`);
    if (reviews.length) parts.push(`<span class="avg">${stars(all, "sm")} <b>${all.toFixed(1)}</b> average</span>`);
    $("revStats").innerHTML = parts.join("");
    $("revCountsNote").hidden = totalVisits != null;
  }

  function renderEssays() {
    $("revEssays").innerHTML = books
      .map((b) => {
        const s = summary(b.id);
        const v = views[b.id];
        return `
          <li>
            <button class="rev-essay${filter === b.id ? " is-active" : ""}" type="button" data-essay="${b.id}" aria-pressed="${filter === b.id}">
              <span class="rev-essay-title">${esc(b.shortTitle)}</span>
              <span class="rev-essay-meta">
                ${v != null ? `<span>${fmt(v)} ${v === 1 ? "view" : "views"}</span>` : ""}
                <span>${s.n ? `${stars(s.avg, "sm")} ${s.avg.toFixed(1)} · ${s.n} ${s.n === 1 ? "review" : "reviews"}` : "No reviews yet"}</span>
              </span>
            </button>
          </li>`;
      })
      .join("");
  }

  function renderList() {
    const list = filter ? reviews.filter((r) => r.essay_id === filter) : reviews;
    $("revListTitle").textContent = filter ? `Reviews of ${byId[filter].shortTitle}` : "Latest reviews";
    $("revClear").hidden = !filter;
    $("revList").innerHTML = list
      .map((r, i) => `
        <li style="--i:${Math.min(i, 8)}">
          <button class="rev-card" type="button" data-review="${r.id}">
            ${stars(r.rating, "sm")}
            <span class="rev-body">“${esc(r.body)}”</span>
            <span class="rev-by"><b>${esc(r.name)}</b> on <i>${esc(byId[r.essay_id].shortTitle)}</i></span>
          </button>
        </li>`)
      .join("");
    $("revEmpty").hidden = list.length > 0;
    $("revEmpty").textContent = !db()
      ? "Reviews are coming soon."
      : loadFailed ? "Couldn't load reviews right now. Please try again later."
      : filter ? "No reviews of this essay yet. Be the first to write one!" : "No reviews yet. Be the first to write one!";
  }

  function renderAll() {
    renderStats();
    renderEssays();
    renderList();
    $("writeReview").hidden = !db();
  }

  /* ---------- Dialogs ---------- */
  function dialog(html, label) {
    const opener = document.activeElement;
    const scrim = document.createElement("div");
    scrim.className = "cite-scrim";
    scrim.innerHTML = `<div class="cite-dialog rev-dialog" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <button class="ib rev-close" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      ${html}</div>`;
    document.body.appendChild(scrim);
    document.body.classList.add("no-scroll");
    const close = () => {
      scrim.classList.add("out");
      document.body.classList.remove("no-scroll");
      setTimeout(() => scrim.remove(), 200);
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
    const onKey = (e) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab") return;
      const f = [...scrim.querySelectorAll("button, input, textarea, select, a[href]")].filter((el) => el.offsetParent);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim || e.target.closest("[data-close]")) close();
    });
    return { scrim, close };
  }

  // Tapping a review: who wrote it and everything they said.
  function showReview(id) {
    const r = reviews.find((x) => String(x.id) === String(id));
    if (!r) return;
    sfx.tick();
    const b = byId[r.essay_id];
    const { scrim } = dialog(`
      <p class="cite-label">Review of</p>
      <h2 class="rev-essay-name"><a href="essays/${b.id}/">${esc(b.title)}</a></h2>
      ${stars(r.rating)}
      <blockquote class="rev-full">“${esc(r.body)}”</blockquote>
      <p class="rev-sign">— ${esc(r.name)}<span>${date(r.created_at)}</span></p>
      <div class="rev-actions"><a class="btn ghost" href="essays/${b.id}/">Read this essay</a></div>`, `Review by ${r.name}`);
    scrim.querySelector("[data-close]").focus();
  }

  function writeReview() {
    sfx.tick();
    let mine = {};
    try { mine = JSON.parse(localStorage.getItem("books.reviewed") || "{}"); } catch {}
    const { scrim, close } = dialog(`
      <h2 class="rev-form-title">Write a review</h2>
      <form class="request-form rev-form" novalidate>
        <label class="field"><span>Your name</span><input name="name" type="text" autocomplete="name" maxlength="60" required></label>
        <label class="field"><span>Essay</span>
          <select name="essay" required>${books.map((b) => `<option value="${b.id}"${b.id === filter ? " selected" : ""}>${esc(b.shortTitle)}</option>`).join("")}</select>
        </label>
        <fieldset class="field rev-rate">
          <legend>Your rating</legend>
          <div class="rate-row">${[1, 2, 3, 4, 5].map((n) => `<label class="rate"><input type="radio" name="rating" value="${n}"${n === 5 ? " checked" : ""}><span class="sr-only">${n} ${n === 1 ? "star" : "stars"}</span>${STAR}</label>`).join("")}</div>
        </fieldset>
        <label class="field"><span>Your review</span><textarea name="body" rows="5" maxlength="1500" required placeholder="What did you think? What stuck with you?"></textarea><small class="rev-count">0 / 1500</small></label>
        <label class="rev-hp" aria-hidden="true">Leave this empty <input name="website" type="text" tabindex="-1" autocomplete="off"></label>
        <p class="field-error" role="alert" hidden></p>
        <div class="cite-foot"><span class="muted">Your name and review will be public.</span><button class="btn primary" type="submit">Post review</button></div>
      </form>`, "Write a review");
    const form = scrim.querySelector("form");
    const err = scrim.querySelector(".field-error");
    const body = form.elements.body;
    body.addEventListener("input", () => (scrim.querySelector(".rev-count").textContent = `${body.value.length} / 1500`));
    // stars: highlight up to the chosen one
    const paint = () => {
      const v = +form.elements.rating.value;
      scrim.querySelectorAll(".rate").forEach((l, i) => l.classList.toggle("on", i < v));
    };
    form.addEventListener("change", paint);
    paint();
    form.elements.name.focus();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = form.elements.name.value.trim().replace(/\s+/g, " ");
      const text = body.value.trim();
      const essay = form.elements.essay.value;
      const rating = +form.elements.rating.value;
      const fail = (m) => { err.textContent = m; err.hidden = false; };
      if (form.elements.website.value) return close(); // a bot filled the hidden field
      if (!name) return fail("Please add your name.");
      if (text.length < 10) return fail("Please write at least a sentence (10 characters or more).");
      if (mine[essay] && Date.now() - mine[essay] < 864e5) return fail("You've already reviewed this essay today. Thank you!");
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.textContent = "Posting…";
      try {
        const res = await fetch(`${db().url}/rest/v1/reviews`, {
          method: "POST",
          headers: { ...headers(), "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ essay_id: essay, name, rating, body: text }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const [saved] = await res.json();
        reviews.unshift(saved);
        mine[essay] = Date.now();
        try { localStorage.setItem("books.reviewed", JSON.stringify(mine)); } catch {}
        sfx.pop();
        close();
        toast("Thanks! Your review is up");
        renderAll();
      } catch {
        btn.disabled = false;
        btn.textContent = "Post review";
        fail("Couldn't post your review just now. Check your connection and try again.");
      }
    });
  }

  /* ---------- Wiring ---------- */
  document.addEventListener("click", (e) => {
    const card = e.target.closest("[data-review]");
    if (card) return showReview(card.dataset.review);
    const essay = e.target.closest("[data-essay]");
    if (essay) {
      sfx.soft();
      filter = filter === essay.dataset.essay ? null : essay.dataset.essay;
      renderEssays();
      renderList();
      $("revListTitle").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (e.target.closest("#revClear")) {
      filter = null;
      renderEssays();
      renderList();
      return;
    }
    if (e.target.closest("#writeReview")) writeReview();
  });

  async function open() {
    if (!ready) ready = load();
    await ready;
    renderAll(); // show what we have straight away
    const [r] = await Promise.allSettled([fetchReviews(), fetchViews()]);
    loadFailed = r.status !== "fulfilled";
    if (!loadFailed) reviews = r.value;
    renderAll();
  }

  window.Reviews = { open };
})();
