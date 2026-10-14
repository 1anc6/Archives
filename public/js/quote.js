// Selected-text tools in the reader: select text on a page and a small
// toolbar offers to copy or share it as a quote (with the essay, page and a
// link back), turn it into a quote-card image, or keep it as a highlight.
// Needs the pdf.js text layer drawn by reader.js.
(function () {
  const MAX = 600; // longer selections are trimmed with an ellipsis
  const HL_KEY = "books.highlights";
  const SITE = "The Open Archive";

  const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const bar = document.createElement("div");
  bar.className = "quote-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Selected text");
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" data-act="copy">${icon('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>')}Copy</button>
    <button type="button" data-act="share">${icon('<path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>')}Share</button>
    <button type="button" data-act="image">${icon('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m20 16-4.5-4.5L7 19.5"/>')}Image</button>
    <button type="button" data-act="highlight">${icon('<path d="m14.5 4.5 5 5L10 19H5v-5z"/><path d="M4 21h16"/>')}Highlight</button>`;
  document.body.appendChild(bar);

  let current = null; // { text, page }

  function toast(msg) {
    let t = document.getElementById("toast");
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
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 2600);
  }

  // The selection, if it sits inside a page's text layer.
  function readSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const page = el?.closest(".page") || (el?.closest(".pages") && sel.anchorNode?.parentElement?.closest(".page"));
    if (!page) return null;
    let text = sel.toString().replace(/-\n(?=[a-z])/g, "").replace(/\s+/g, " ").trim();
    if (text.length < 2) return null;
    if (text.length > MAX) text = text.slice(0, MAX).replace(/\s+\S*$/, "") + "…";
    return { text, page: +page.dataset.num, rect: range.getBoundingClientRect() };
  }

  function place(rect) {
    bar.hidden = false;
    const touch = matchMedia("(pointer: coarse)").matches;
    const w = bar.offsetWidth, h = bar.offsetHeight;
    // Phones show their own copy menu above the selection, so go below it there.
    let top = touch ? rect.bottom + 12 : rect.top - h - 10;
    if (top < 70) top = rect.bottom + 12;
    if (top + h > innerHeight - 90) top = Math.max(70, rect.top - h - 10);
    const left = Math.min(innerWidth - w - 8, Math.max(8, rect.left + rect.width / 2 - w / 2));
    bar.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  function hide() {
    bar.hidden = true;
    current = null;
  }
  function done() {
    window.getSelection()?.removeAllRanges();
    hide();
  }

  let timer;
  document.addEventListener("selectionchange", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const s = readSelection();
      if (!s) return hide();
      current = s;
      place(s.rect);
    }, 180);
  });
  window.addEventListener("scroll", () => {
    if (!current) return;
    const s = readSelection();
    s ? place(s.rect) : hide();
  }, { passive: true });

  const book = () => window.ReaderBook || {};
  function compose() {
    const b = book();
    const url = new URL(`reader.html?id=${encodeURIComponent(b.id || "")}&page=${current.page}`, location.href).href;
    const cite = `${b.author || "Lanchenba Mutum"}, ${b.title || document.title}, p. ${current.page}`;
    return { url, text: `“${current.text}”\n— ${cite}`, title: b.title || document.title };
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  /* ---------- Quote card image (1080 × 1350, made for Instagram and WhatsApp) ---------- */
  const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻", SUB = "₀₁₂₃₄₅₆₇₈₉", PLAIN = "0123456789n+-";

  function wrapLines(ctx, text, width) {
    const words = text.split(" ");
    const lines = [];
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width <= width || !line) line = test;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawNotation(ctx, glyph, x, y, size) {
    for (const ch of glyph) {
      const sup = SUP.indexOf(ch), sub = SUB.indexOf(ch);
      if (sup > -1 || sub > -1) {
        ctx.font = `italic 400 ${Math.round(size * 0.6)}px "STIX Two Text", "Noto Sans Math", serif`;
        const c = PLAIN[sup > -1 ? sup : sub];
        ctx.fillText(c, x, y + (sup > -1 ? -size * 0.38 : size * 0.18));
        x += ctx.measureText(c).width;
      } else {
        ctx.font = `italic 400 ${size}px "STIX Two Text", "Noto Sans Math", serif`;
        ctx.fillText(ch, x, y);
        x += ctx.measureText(ch).width;
      }
    }
  }

  async function quoteCard(text, page) {
    const b = book();
    await Promise.all([
      document.fonts.load('italic 400 60px "Newsreader"'),
      document.fonts.load('400 36px "Newsreader"'),
      document.fonts.load('500 26px "Newsreader"'),
      document.fonts.load('400 24px "IBM Plex Mono"'),
      document.fonts.load('italic 400 60px "STIX Two Text"'),
    ]).catch(() => {});
    const W = 1080, H = 1350, M = 150; // M: text starts right of the margin rule
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    // squared notebook paper with a margin rule
    ctx.fillStyle = "#f7f3ed";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#e7e0d6";
    ctx.lineWidth = 1.5;
    for (let x = 0; x <= W; x += 54) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 54) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }
    ctx.strokeStyle = "#d6a896";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(108, 0); ctx.lineTo(108, H); ctx.stroke();

    const ink = "#544c40", muted = "#655c50", hi = "#a4553f";
    const textW = W - M - 110;
    // the essay's symbol, top left
    if (b.glyph) {
      ctx.fillStyle = hi;
      drawNotation(ctx, b.glyph, M, 210, 64);
    }
    // the quote: largest size whose lines fit the space
    let size = 64, lines;
    const room = 640;
    for (; size >= 32; size -= 2) {
      ctx.font = `italic 400 ${size}px "Newsreader", Georgia, serif`;
      lines = wrapLines(ctx, text, textW);
      if (lines.length * size * 1.3 <= room) break;
    }
    const maxLines = Math.floor(room / (size * 1.3));
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "…";
    }
    const lineH = size * 1.3;
    const top = 300 + (room - lines.length * lineH) / 2;
    ctx.fillStyle = hi;
    ctx.font = `400 ${size * 2.2}px "Newsreader", Georgia, serif`;
    ctx.fillText("“", M - size * 0.7, top + size * 0.9);
    ctx.fillStyle = ink;
    ctx.font = `italic 400 ${size}px "Newsreader", Georgia, serif`;
    lines.forEach((l, i) => ctx.fillText(l, M, top + size + i * lineH));

    // credit
    let y = 1040;
    ctx.fillStyle = ink;
    ctx.font = '400 38px "Newsreader", Georgia, serif';
    ctx.fillText(`— ${b.author || "Lanchenba Mutum"}`, M, y);
    ctx.fillStyle = muted;
    ctx.font = 'italic 400 30px "Newsreader", Georgia, serif';
    wrapLines(ctx, `${b.title || document.title}, p. ${page}`, textW).slice(0, 2).forEach((l) => {
      y += 44;
      ctx.fillText(l, M, y);
    });
    // site
    ctx.fillStyle = ink;
    ctx.font = '500 26px "Newsreader", Georgia, serif';
    ctx.letterSpacing = "6px";
    ctx.fillText(SITE.toUpperCase(), M, 1262);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = muted;
    ctx.font = '400 24px "IBM Plex Mono", monospace';
    ctx.textAlign = "right";
    ctx.fillText(location.host || "theopenarchive.onrender.com", W - 80, 1262);
    ctx.textAlign = "left";
    return new Promise((res) => c.toBlob(res, "image/png"));
  }

  async function shareImage() {
    const sel = { ...current };
    toast("Making your quote card…");
    const blob = await quoteCard(sel.text, sel.page);
    if (!blob) return toast("Couldn't make the image. Try Copy instead.");
    const name = `quote-${book().id || "essay"}-p${sel.page}.png`;
    const file = new File([blob], name, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: book().title || SITE });
        return;
      } catch (err) {
        if (err?.name === "AbortError") return;
      }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Quote card saved to your downloads");
  }

  /* ---------- Highlights, kept on this device ---------- */
  const readHL = () => {
    try { return JSON.parse(localStorage.getItem(HL_KEY)) || []; } catch { return []; }
  };
  const writeHL = (list) => {
    try { localStorage.setItem(HL_KEY, JSON.stringify(list)); } catch {}
  };
  // Compare text without spaces or hyphens, which the PDF splits unpredictably.
  const squash = (s) => s.replace(/[\s­-]+/g, "").toLowerCase();

  // Paint saved highlights onto a page's text layer.
  function paint(pageEl) {
    const b = book();
    const num = +pageEl.dataset.num;
    const mine = readHL().filter((h) => h.book === b.id && h.page === num);
    const layer = pageEl.querySelector(".textLayer");
    if (!layer) return;
    layer.querySelectorAll(".hl").forEach((s) => s.classList.remove("hl"));
    if (!mine.length) return;
    const spans = [...layer.querySelectorAll("span")].filter((s) => !s.children.length && s.textContent.trim());
    let all = "";
    const ranges = spans.map((s) => {
      const start = all.length;
      all += squash(s.textContent);
      return [start, all.length];
    });
    for (const h of mine) {
      const needle = squash(h.text.replace(/…$/, ""));
      const at = needle ? all.indexOf(needle) : -1;
      if (at < 0) continue;
      const end = at + needle.length;
      spans.forEach((s, i) => {
        if (ranges[i][1] > at && ranges[i][0] < end) s.classList.add("hl");
      });
    }
  }
  document.addEventListener("page-rendered", (e) => paint(e.detail.el));

  function saveHighlight() {
    const b = book();
    const list = readHL();
    if (list.some((h) => h.book === b.id && h.page === current.page && h.text === current.text)) {
      toast("Already in your highlights");
      return;
    }
    list.push({ book: b.id, title: b.title, page: current.page, text: current.text, at: Date.now() });
    writeHL(list);
    const pageEl = document.querySelector(`.page[data-num="${current.page}"]`);
    if (pageEl) paint(pageEl);
    toast("Highlighted. Find all your highlights in the Library");
  }

  // Keep the selection alive while pressing the toolbar.
  bar.addEventListener("pointerdown", (e) => e.preventDefault());
  bar.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn || !current) return;
    const act = btn.dataset.act;
    if (act === "image") return shareImage().finally(done);
    if (act === "highlight") {
      saveHighlight();
      return done();
    }
    const q = compose();
    if (act === "share" && navigator.share) {
      try {
        await navigator.share({ title: q.title, text: q.text, url: q.url });
      } catch (err) {
        if (err?.name !== "AbortError") toast("Couldn't share that. Try Copy instead.");
      }
      return;
    }
    const ok = await copy(`${q.text}\n${q.url}`);
    toast(ok ? "Quote copied, with a link to this page" : "Couldn't copy. Select the text and copy it manually.");
    if (ok) done();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current) done();
  });
})();
