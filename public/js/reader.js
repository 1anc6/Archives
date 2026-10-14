(async function () {
  const { loadBooks, progress, escapeHTML } = window.Shelf;
  const $ = (id) => document.getElementById(id);
  const pagesEl = $("pages");

  // Progress is saved only after the reader actually scrolls, taps or presses
  // a key. A re-layout (resizing, rotating the phone, the panel opening) also
  // moves the scroll position, and must not overwrite their place.
  let lastInput = 0;
  for (const type of ["wheel", "touchmove", "pointerdown", "keydown"]) {
    window.addEventListener(type, () => (lastInput = Date.now()), { passive: true, capture: true });
  }
  const userActive = () => Date.now() - lastInput < 2000;

  const store = {
    get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };

  /* ---------- Reading theme: light / sepia / dark ---------- */
  const THEMES = ["light", "sepia", "dark"];
  const THEME_COLORS = { light: "#faf4ec", sepia: "#efe2c8", dark: "#1d1612" };
  // Follows the site theme until the reader picks one of its own.
  let theme = store.get("books.readerTheme", store.get("books.theme", "light"));
  function applyTheme() {
    document.body.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]').content = THEME_COLORS[theme];
    $("themeBtn").title = `Reading theme: ${theme}`;
  }
  $("themeBtn").addEventListener("click", () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store.set("books.readerTheme", theme);
    applyTheme();
  });
  applyTheme();

  const params = new URLSearchParams(location.search);
  const id = params.get("id");

  function fail(msg) {
    pagesEl.innerHTML = `<div class="reader-error"><p>${escapeHTML(msg)}</p><p><a href="./">Back to the shelf</a></p></div>`;
    $("title").textContent = "Not found";
  }

  let book, allBooks;
  try {
    allBooks = await loadBooks();
    book = allBooks.find((b) => b.id === id);
  } catch {
    return fail("Couldn't load the book list.");
  }
  if (!book) return fail("That book isn't on the shelf.");

  document.title = `${book.shortTitle || book.title} · Lanchenba Mutum`;
  window.ReaderBook = book; // used by quote.js
  $("title").textContent = book.title;
  $("author").textContent = book.author;
  $("download").href = book.file;
  $("download").dataset.title = book.title;

  if (!window.pdfjsLib) return fail("The PDF viewer failed to load. Check your connection and try again.");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument(book.file).promise;
  } catch (err) {
    console.error(err);
    return fail("Couldn't open this PDF.");
  }

  const total = pdf.numPages;
  $("pageTotal").textContent = total;
  $("scrub").max = total;

  // Collect each page's natural size so placeholders have the right shape.
  const pages = [];
  for (let i = 1; i <= total; i++) {
    const page = await pdf.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ num: i, page, w: vp.width, h: vp.height, el: null, renderedAt: 0, task: null, thumb: null });
  }

  /* ---------- Layout & rendering ---------- */
  let zoom = Math.min(2.5, Math.max(0.5, parseFloat(store.get("books.readerZoom", "1")) || 1));
  const baseWidth = () => Math.min(pagesEl.clientWidth - 24, 860);

  function layout() {
    const width = baseWidth() * zoom;
    for (const p of pages) {
      p.el.style.width = `${width}px`;
      p.el.style.height = `${(width * p.h) / p.w}px`;
      p.el.style.maxWidth = zoom > 1 ? "none" : "100%";
    }
    $("zoomLabel").textContent = `${Math.round(zoom * 100)}%`;
  }

  async function render(p) {
    const cssWidth = p.el.clientWidth;
    if (!cssWidth || p.renderedAt === cssWidth) return;
    if (p.task) p.task.cancel();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const vp = p.page.getViewport({ scale: (cssWidth / p.w) * dpr });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    p.task = p.page.render({ canvasContext: canvas.getContext("2d"), viewport: vp });
    try {
      await p.task.promise;
      const text = await textLayer(p, cssWidth);
      p.el.replaceChildren(canvas, ...(text ? [text] : []));
      document.dispatchEvent(new CustomEvent("page-rendered", { detail: { num: p.num, el: p.el } }));
      p.el.classList.add("is-rendered");
      p.renderedAt = cssWidth;
    } catch (err) {
      if (err && err.name !== "RenderingCancelledException") console.error(err);
    } finally {
      p.task = null;
    }
  }

  // The page's words as invisible, selectable text over the canvas.
  async function textLayer(p, cssWidth) {
    if (!pdfjsLib.renderTextLayer) return null;
    const vp = p.page.getViewport({ scale: cssWidth / p.w });
    const layer = document.createElement("div");
    layer.className = "textLayer";
    layer.style.setProperty("--scale-factor", vp.scale);
    try {
      await pdfjsLib.renderTextLayer({ textContentSource: p.page.streamTextContent(), container: layer, viewport: vp, textDivs: [] }).promise;
      return layer;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  pagesEl.innerHTML = "";
  for (const p of pages) {
    p.el = document.createElement("div");
    p.el.className = "page";
    p.el.dataset.num = p.num;
    p.el.setAttribute("role", "region");
    p.el.setAttribute("aria-label", `Page ${p.num} of ${total}`);
    pagesEl.appendChild(p.el);
  }
  layout();
  pagesEl.removeAttribute("aria-busy");
  endCard();

  // Lazily render pages near the viewport.
  const visible = new Set();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const p = pages[+e.target.dataset.num - 1];
        if (e.isIntersecting) {
          visible.add(p);
          render(p);
        } else visible.delete(p);
      }
    },
    { rootMargin: "800px 0px" }
  );
  pages.forEach((p) => io.observe(p.el));

  /* ---------- "You made it!" card after the last page ---------- */
  function endCard() {
    const EMAIL = "lanchenba613500@gmail.com";
    const i = allBooks.findIndex((b) => b.id === book.id);
    const next = allBooks[(i + 1) % allBooks.length];
    const reactions = [["🤯", "Broke my brain"], ["🙂", "Loved it"], ["😴", "Bit much for me"]];
    const card = document.createElement("section");
    card.className = "end-card";
    card.setAttribute("aria-labelledby", "endTitle");
    card.innerHTML = `
      <p class="end-qed" aria-hidden="true">∎</p>
      <h2 id="endTitle">You made it to the end!</h2>
      <p class="end-lead">Thanks for reading <i>${escapeHTML(book.shortTitle || book.title)}</i>. So, how was it?</p>
      <div class="end-reactions">${reactions.map(([e, label]) => `<button type="button" data-reaction="${label}"><span aria-hidden="true">${e}</span>${label}</button>`).join("")}</div>
      <p class="end-sent" role="status" hidden>Your email app should be open with your reaction. Just press send, and thank you!</p>
      <p class="end-review" hidden>Got more to say? <button class="link" type="button" data-write-review="${book.id}">Write a review</button> for other readers.</p>
      <div class="end-next">
        <p class="end-next-label">Up next</p>
        <a class="end-next-title" href="essays/${next.id}/">${escapeHTML(next.shortTitle)}</a>
        <p class="end-next-meta">${next.pages} pages · ~${next.pages * 2} min · ${escapeHTML(next.category)}</p>
        <div class="end-actions">
          <a class="btn primary" href="reader.html?id=${encodeURIComponent(next.id)}">Read it next<svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg></a>
          <a class="btn ghost" href="./">All essays</a>
        </div>
      </div>`;
    pagesEl.appendChild(card);
    window.Reviews?.enabled().then((on) => (card.querySelector(".end-review").hidden = !on));
    card.querySelector(".end-reactions").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-reaction]");
      if (!btn) return;
      const body = `Hi Lance,\n\nI just finished "${book.title}".\n\nMy verdict: ${btn.querySelector("span").textContent} ${btn.dataset.reaction}\n\n`;
      location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(`Reaction: ${book.shortTitle || book.title}`)}&body=${encodeURIComponent(body)}`;
      card.querySelector(".end-sent").hidden = false;
    });
    // Reaching the card means the essay is finished, even if the last page is short.
    if ("IntersectionObserver" in window) {
      const seen = new IntersectionObserver((entries) => {
        if (entries.some((x) => x.isIntersecting) && userActive()) {
          progress.set(book.id, total, total);
          seen.disconnect();
        }
      }, { threshold: 0.3 });
      seen.observe(card);
    }
  }

  /* ---------- Current page, progress & time left ---------- */
  let current = 1;
  let saveTimer = null;
  const MIN_PER_PAGE = 2;

  function showPage(n) {
    $("pageNum").textContent = n;
    $("scrub").value = n;
    markSection(n);
    const left = (total - n) * MIN_PER_PAGE;
    $("timeLeft").textContent = left > 0 ? `· ~${left} min left` : "· last page";
    document.querySelectorAll(".thumb.is-current").forEach((t) => t.classList.remove("is-current"));
    const t = pages[n - 1].thumb;
    if (t) {
      t.classList.add("is-current");
      if (!$("thumbs").hidden) t.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function updateCurrent() {
    const mid = window.innerHeight / 2;
    let best = pages[0];
    for (const p of pages) {
      if (p.el.getBoundingClientRect().top <= mid) best = p;
      else break;
    }
    // Short last pages (e.g. landscape slides) never reach the middle of the
    // screen, so count reaching the bottom of the document as the last page.
    if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) best = pages[total - 1];
    if (best.num !== current) {
      current = best.num;
      showPage(current);
      clearTimeout(saveTimer);
      if (userActive()) saveTimer = setTimeout(() => progress.set(book.id, current, total), 400);
    }
  }
  window.addEventListener("scroll", () => {
    // momentum scrolling after a swipe still counts as the reader moving
    if (userActive()) lastInput = Date.now();
    updateCurrent();
  }, { passive: true });

  // Remember where a smooth scroll is heading so rapid taps keep advancing.
  let target = null;
  let targetTimer = null;
  const here = () => target ?? current;

  function goTo(n, smooth = true) {
    n = Math.max(1, Math.min(total, n));
    target = n;
    clearTimeout(targetTimer);
    targetTimer = setTimeout(() => (target = null), 700);
    const top = pages[n - 1].el.getBoundingClientRect().top + window.scrollY - 70;
    window.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    // If the page can't scroll far enough to put it at the top, show it as current anyway.
    if (n === total || top > document.documentElement.scrollHeight - window.innerHeight) {
      current = n;
      showPage(n);
      clearTimeout(saveTimer);
      if (userActive()) saveTimer = setTimeout(() => progress.set(book.id, current, total), 400);
    }
  }

  $("prev").addEventListener("click", () => goTo(here() - 1));
  $("next").addEventListener("click", () => goTo(here() + 1));
  $("scrub").addEventListener("input", (e) => goTo(+e.target.value, false));

  /* ---------- Zoom (remembered between visits) ---------- */
  function setZoom(z) {
    const keep = current;
    zoom = Math.max(0.5, Math.min(2.5, z));
    store.set("books.readerZoom", String(zoom));
    layout();
    visible.forEach(render);
    goTo(keep, false);
  }
  $("zoomIn").addEventListener("click", () => setZoom(zoom + 0.25));
  $("zoomOut").addEventListener("click", () => setZoom(zoom - 0.25));

  document.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); goTo(here() + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goTo(here() - 1); }
    if ((e.key === "+" || e.key === "=") && !e.ctrlKey && !e.metaKey) setZoom(zoom + 0.25);
    if (e.key === "-" && !e.ctrlKey && !e.metaKey) setZoom(zoom - 0.25);
    if (e.key === "Escape" && !$("thumbs").hidden) toggleThumbs(false);
    if (e.key === "Escape" && !$("toc").hidden) toggleToc(false);
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => setZoom(zoom), 150);
  });

  /* ---------- Swipe to turn pages (phones) ---------- */
  let touch = null;
  pagesEl.addEventListener("touchstart", (e) => {
    touch = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } : null;
  }, { passive: true });
  pagesEl.addEventListener("touchend", (e) => {
    if (!touch || zoom > 1 || window.visualViewport?.scale > 1.05) return;
    const dx = e.changedTouches[0].clientX - touch.x;
    const dy = e.changedTouches[0].clientY - touch.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - touch.t < 700) {
      const n = dx < 0 ? here() + 1 : here() - 1;
      const p = pages[Math.max(1, Math.min(total, n)) - 1];
      p.el.classList.remove("turn-next", "turn-prev");
      void p.el.offsetWidth;
      p.el.classList.add(dx < 0 ? "turn-next" : "turn-prev");
      goTo(n);
      store.set("books.swipeHintSeen", "1");
      $("swipeHint").hidden = true;
    }
    touch = null;
  });
  if (matchMedia("(pointer: coarse)").matches && !store.get("books.swipeHintSeen")) {
    $("swipeHint").hidden = false;
    setTimeout(() => ($("swipeHint").hidden = true), 4500);
  }

  /* ---------- Contents ---------- */
  const sections = (book.sections || []).filter((s) => s.page <= total);
  function markSection(n) {
    let idx = -1;
    sections.forEach((s, i) => { if (s.page <= n) idx = i; });
    document.querySelectorAll(".toc-item").forEach((el, i) => el.classList.toggle("is-current", i === idx));
  }
  if (sections.length) {
    $("tocBtn").hidden = false;
    $("tocList").innerHTML = sections
      .map((s, i) => `<li><button class="toc-item" data-page="${s.page}" style="--i:${i}"><span class="toc-n">${String(i + 1).padStart(2, "0")}</span><span class="toc-t">${escapeHTML(s.title)}</span><span class="toc-p">p. ${s.page}</span></button></li>`)
      .join("");
    $("tocList").addEventListener("click", (e) => {
      const b = e.target.closest(".toc-item");
      if (!b) return;
      goTo(+b.dataset.page);
      if (!matchMedia("(min-width: 900px)").matches) toggleToc(false);
    });
  }
  function toggleToc(open = $("toc").hidden) {
    if (open) toggleThumbs(false);
    $("toc").hidden = !open;
    $("tocBtn").setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("thumbs-open", open || !$("thumbs").hidden);
    if (open) markSection(current);
    setTimeout(() => setZoom(zoom), 0);
  }
  $("tocBtn").addEventListener("click", () => toggleToc());
  $("tocClose").addEventListener("click", () => toggleToc(false));

  /* ---------- Slides on a portrait phone ---------- */
  const isSlides = pages[0].w > pages[0].h;
  if (isSlides && matchMedia("(max-width: 720px) and (orientation: portrait)").matches && !store.get("books.rotateHintSeen")) {
    $("rotateHint").hidden = false;
    store.set("books.rotateHintSeen", "1");
    setTimeout(() => ($("rotateHint").hidden = true), 6000);
  }

  /* ---------- Page thumbnails ---------- */
  let thumbsBuilt = false;
  async function buildThumbs() {
    thumbsBuilt = true;
    const list = $("thumbsList");
    for (const p of pages) {
      const btn = document.createElement("button");
      btn.className = "thumb";
      btn.setAttribute("aria-label", `Go to page ${p.num}`);
      btn.innerHTML = `<span class="thumb-img" style="aspect-ratio:${p.w}/${p.h}"></span><span class="thumb-num">${p.num}</span>`;
      btn.addEventListener("click", () => {
        goTo(p.num);
        if (!matchMedia("(min-width: 900px)").matches) toggleThumbs(false);
      });
      p.thumb = btn;
      list.appendChild(btn);
    }
    showPage(current);
    // Draw the small previews one after another so the main pages stay smooth.
    for (const p of pages) {
      const scale = (120 / p.w) * Math.min(window.devicePixelRatio || 1, 2);
      const vp = p.page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      try {
        await p.page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
        p.thumb.querySelector(".thumb-img").appendChild(canvas);
      } catch (err) {
        console.error(err);
      }
    }
  }
  function toggleThumbs(open = $("thumbs").hidden) {
    if (open && !$("toc").hidden) { $("toc").hidden = true; $("tocBtn").setAttribute("aria-expanded", "false"); }
    $("thumbs").hidden = !open;
    $("pagesBtn").setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("thumbs-open", open);
    if (open && !thumbsBuilt) buildThumbs();
    if (open) showPage(current);
    setTimeout(() => setZoom(zoom), 0); // page width changes when the side panel opens
  }
  $("pagesBtn").addEventListener("click", () => toggleThumbs());
  $("thumbsClose").addEventListener("click", () => toggleThumbs(false));

  /* ---------- Listen: read the essay aloud with the device's own voice ---------- */
  const speech = window.speechSynthesis;
  if (speech && window.SpeechSynthesisUtterance) {
    const btn = $("listenBtn");
    const status = $("listenStatus");
    btn.hidden = false;
    let listening = false;
    let run = 0; // bumps on every start/stop so an old loop knows to quit

    // Page text in reading order, split into sentence-sized pieces (long
    // utterances get cut off in some browsers).
    async function pageChunks(n) {
      const tc = await pages[n - 1].page.getTextContent();
      let text = "";
      for (const it of tc.items) {
        if (!("str" in it)) continue;
        text += it.str;
        if (it.hasEOL) text = text.endsWith("-") ? text.slice(0, -1) : text + " ";
      }
      text = text.replace(/\s+/g, " ").trim();
      const sentences = text.match(/[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g) || [];
      const chunks = [];
      for (const s of sentences) {
        if (chunks.length && (chunks[chunks.length - 1] + s).length < 220) chunks[chunks.length - 1] += s;
        else chunks.push(s);
      }
      return chunks.map((c) => c.trim()).filter(Boolean);
    }
    const say = (text, id) => new Promise((resolve) => {
      if (id !== run) return resolve(false);
      const u = new SpeechSynthesisUtterance(text);
      const voice = speech.getVoices().find((v) => /^en(-|_)(GB|IN|US)/i.test(v.lang)) || speech.getVoices().find((v) => /^en/i.test(v.lang));
      if (voice) u.voice = voice;
      u.rate = 1;
      u.onend = () => resolve(id === run);
      u.onerror = () => resolve(false);
      speech.speak(u);
    });
    function setState(on, msg) {
      listening = on;
      btn.setAttribute("aria-pressed", String(on));
      btn.classList.toggle("is-on", on);
      btn.title = on ? "Stop listening" : "Listen";
      status.hidden = !msg;
      status.textContent = msg || "";
    }
    function stop(msg) {
      run++;
      speech.cancel();
      setState(false, msg);
      if (msg) setTimeout(() => { if (!listening) status.hidden = true; }, 2500);
    }
    async function start() {
      const id = ++run;
      speech.cancel();
      // An immediate (silent) utterance keeps iPhones happy: speech must start from the tap.
      speech.speak(new SpeechSynthesisUtterance(""));
      for (let n = current; n <= total; n++) {
        if (id !== run) return;
        if (n !== current) goTo(n);
        setState(true, `Listening · page ${n} of ${total}`);
        for (const chunk of await pageChunks(n)) {
          if (!(await say(chunk, id))) return;
        }
      }
      if (id === run) stop("Finished reading aloud");
    }
    btn.addEventListener("click", () => (listening ? stop() : start()));
    window.addEventListener("pagehide", () => speech.cancel());
  }

  /* ---------- Start where the reader left off (or ?page=N) ---------- */
  const start = Math.min(total, +params.get("page") || (progress.get(book.id) || {}).page || 1);
  // Only count an essay as started once the reader moves past the first page.
  if (start > 1) progress.set(book.id, start, total);
  current = start;
  showPage(start);
  if (start > 1) requestAnimationFrame(() => goTo(start, false));
})();
