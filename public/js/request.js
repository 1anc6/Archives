// PDFs are shared by request: tapping any "Request PDF" link opens a small
// form, and sending it opens the visitor's email app with a request addressed
// to Lanchenba (or copies the request, for people without an email app).
// Loaded on every page, including the reader.
(function () {
  const EMAIL = "lanchenba613500@gmail.com";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = (s) => s.trim().replace(/\s+/g, " ");

  function request(title, name, note) {
    const subject = `PDF request: ${title}`;
    const body = [
      "Hi Lance,",
      "",
      `Could I have the PDF of your essay "${title}"?`,
      ...(note ? ["", note] : []),
      ...(name ? ["", `Thanks!`, name] : ["", "Thanks!"]),
    ].join("\n");
    return { subject, body, url: `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
  }

  async function copyText(text) {
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

  function open(title) {
    window.Sfx?.tick?.();
    const opener = document.activeElement;
    const scrim = document.createElement("div");
    scrim.className = "cite-scrim";
    scrim.innerHTML = `
      <div class="cite-dialog request-dialog" role="dialog" aria-modal="true" aria-labelledby="requestTitle">
        <div class="cite-head">
          <div><h2 id="requestTitle"><span class="cite-label">Request the PDF</span>${esc(title)}</h2></div>
          <button class="ib" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
        <form class="request-form" novalidate>
          <p class="request-intro">The essay is free to read here, and I share the PDFs by email. Send me a quick request and I'll reply with the file.</p>
          <label class="field">
            <span>Your name <small>(optional)</small></span>
            <input name="name" type="text" autocomplete="name">
          </label>
          <label class="field">
            <span>Anything to add? <small>(optional)</small></span>
            <textarea name="note" rows="3"></textarea>
          </label>
          <div class="cite-foot request-foot">
            <button class="btn ghost" type="button" data-copy>Copy the request</button>
            <button class="btn primary" type="submit">Open my email app</button>
          </div>
          <p class="request-done" role="status" hidden></p>
          <p class="request-to muted">Goes to <a href="mailto:${EMAIL}">${EMAIL}</a></p>
        </form>
      </div>`;
    document.body.appendChild(scrim);
    document.body.classList.add("no-scroll");
    const form = scrim.querySelector("form");
    const done = scrim.querySelector(".request-done");
    const current = () => request(title, clean(form.elements.name.value), form.elements.note.value.trim());

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
      const f = [...scrim.querySelectorAll("button, input, textarea, a[href]")].filter((el) => el.offsetParent);
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    scrim.addEventListener("click", async (e) => {
      if (e.target === scrim || e.target.closest("[data-close]")) return close();
      if (e.target.closest("[data-copy]")) {
        const r = current();
        const ok = await copyText(`To: ${EMAIL}\nSubject: ${r.subject}\n\n${r.body}`);
        done.hidden = false;
        done.textContent = ok
          ? `Copied. Paste it into a new email to ${EMAIL}.`
          : `Couldn't copy automatically. Email ${EMAIL} with the essay title.`;
      }
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      window.Sfx?.pop?.();
      location.href = current().url;
      done.hidden = false;
      done.textContent = "If your email app opened, just press send. If it didn't, use Copy the request instead.";
    });
    form.elements.name.focus();
  }

  // Every PDF link on the site opens the request form.
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href$=".pdf"]');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    open(a.dataset.title || document.querySelector("h1")?.textContent || "your essay");
  }, true);

  // "Email me new essays": the visitor sends a short request from their own
  // email app, so the reply address is theirs.
  const notifyForm = document.getElementById("notifyForm");
  notifyForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = clean(notifyForm.elements.name.value);
    const body = [
      "Hi Lance,",
      "",
      "Please email me when there's a new essay on The Open Archive.",
      ...(name ? ["", `Name: ${name}`] : []),
      "",
      "Thanks!",
    ].join("\n");
    window.Sfx?.pop?.();
    location.href = `mailto:${EMAIL}?subject=${encodeURIComponent("New essay alerts")}&body=${encodeURIComponent(body)}`;
    notifyForm.querySelector(".notify-done").hidden = false;
  });

  window.RequestPDF = { open };
})();
