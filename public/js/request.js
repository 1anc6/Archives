// PDF downloads go through the author: tapping any "Download PDF" link opens a
// small form, and submitting it opens the visitor's email app with a request
// addressed to Lanchenba. Loaded on every page, including the reader.
(function () {
  const EMAIL = "lanchenba613500@gmail.com";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function mailto(title, name, note) {
    const subject = `PDF request: ${title}`;
    const body = [
      "Hi Lanchenba,",
      "",
      `May I download your essay "${title}" as a PDF?`,
      ...(note ? ["", note] : []),
      "",
      `Full name: ${name}`,
      "",
      "Thanks!",
    ].join("\n");
    return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function open(title) {
    window.Sfx?.tick?.();
    const opener = document.activeElement;
    const scrim = document.createElement("div");
    scrim.className = "cite-scrim";
    scrim.innerHTML = `
      <div class="cite-dialog request-dialog" role="dialog" aria-modal="true" aria-labelledby="requestTitle">
        <div class="cite-head">
          <div><h2 id="requestTitle"><span class="cite-label">Download the PDF</span>${esc(title)}</h2></div>
          <button class="ib" type="button" data-close aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
        <form class="request-form" novalidate>
          <p class="request-intro">The PDFs are shared by request. Add your name and your email app will open with a short note to Lanchenba asking for this one.</p>
          <label class="field">
            <span>Full name</span>
            <input name="name" type="text" autocomplete="name" required>
          </label>
          <p class="field-error" id="requestError" hidden>Please enter your full name.</p>
          <label class="field">
            <span>Anything to add? <small>(optional)</small></span>
            <textarea name="note" rows="3"></textarea>
          </label>
          <div class="cite-foot">
            <span class="muted">Sends to ${EMAIL}</span>
            <button class="btn primary" type="submit">Write the email</button>
          </div>
          <p class="request-done" role="status" hidden>Your email app should be open now. If nothing happened, email <a href="mailto:${EMAIL}">${EMAIL}</a> with the essay title and your full name.</p>
        </form>
      </div>`;
    document.body.appendChild(scrim);
    document.body.classList.add("no-scroll");
    const form = scrim.querySelector("form");
    const nameInput = form.elements.name;
    const error = scrim.querySelector("#requestError");

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
    scrim.addEventListener("click", (e) => {
      if (e.target === scrim || e.target.closest("[data-close]")) close();
    });
    nameInput.addEventListener("input", () => {
      error.hidden = true;
      nameInput.removeAttribute("aria-invalid");
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput.value.trim().replace(/\s+/g, " ");
      if (!name) {
        error.hidden = false;
        nameInput.setAttribute("aria-invalid", "true");
        nameInput.setAttribute("aria-describedby", "requestError");
        nameInput.focus();
        return;
      }
      window.Sfx?.pop?.();
      location.href = mailto(title, name, form.elements.note.value.trim());
      scrim.querySelector(".request-done").hidden = false;
    });
    nameInput.focus();
  }

  // Every PDF link on the site opens the request form instead of downloading.
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
    const name = notifyForm.elements.name.value.trim().replace(/\s+/g, " ");
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
