// Quote sharing in the reader: select text on a page and a small toolbar
// offers to copy or share it as a quote, with the essay, page and a link
// back to that page. Needs the pdf.js text layer drawn by reader.js.
(function () {
  const MAX = 600; // longer selections are trimmed with an ellipsis

  const bar = document.createElement("div");
  bar.className = "quote-bar";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Selected text");
  bar.hidden = true;
  bar.innerHTML = `
    <button type="button" data-act="copy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>Copy quote</button>
    <button type="button" data-act="share"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>Share</button>`;
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
    toast.timer = setTimeout(() => (t.hidden = true), 2400);
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

  function compose() {
    const book = window.ReaderBook || {};
    const url = new URL(`reader.html?id=${encodeURIComponent(book.id || "")}&page=${current.page}`, location.href).href;
    const cite = `${book.author || "Lanchenba Mutum"}, ${book.title || document.title}, p. ${current.page}`;
    return { url, text: `“${current.text}”\n— ${cite}`, title: book.title || document.title };
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

  // Keep the selection alive while pressing the toolbar.
  bar.addEventListener("pointerdown", (e) => e.preventDefault());
  bar.addEventListener("click", async (e) => {
    const btn = e.target.closest("button");
    if (!btn || !current) return;
    const q = compose();
    if (btn.dataset.act === "share" && navigator.share) {
      try {
        await navigator.share({ title: q.title, text: q.text, url: q.url });
      } catch (err) {
        if (err?.name !== "AbortError") toast("Couldn't share that. Try Copy quote instead.");
      }
      return;
    }
    const ok = await copy(`${q.text}\n${q.url}`);
    toast(ok ? "Quote copied, with a link to this page" : "Couldn't copy. Select the text and copy it manually.");
    if (ok) {
      window.getSelection()?.removeAllRanges();
      hide();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && current) {
      window.getSelection()?.removeAllRanges();
      hide();
    }
  });
})();
