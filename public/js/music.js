// Background music: a few cosy tracks generated live with the Web Audio API,
// plus any MP3s listed in data/site.json ("music": [{ "title", "note", "file" }]).
// The music button opens a small panel to play/pause and switch tracks.
// Moving between pages (homepage → reader → essay page) keeps the same track
// and carries on from where it was, with a quick fade instead of a restart.
// Browsers block sound until the visitor has interacted, so if a page isn't
// allowed to play straight away it resumes on the first tap or key press.
(function () {
  const PREF_KEY = "books.music"; // "on" | "off" (localStorage)
  const TRACK_KEY = "books.music.track"; // chosen track (localStorage)
  const STATE_KEY = "books.music.state"; // where we left off (sessionStorage, this tab only)
  const VOLUME = 0.5;
  const ROOT = new URL("../", document.currentScript.src).href;

  const read = (s, k) => { try { return s.getItem(k); } catch { return null; } };
  const write = (s, k, v) => { try { s.setItem(k, v); } catch {} };
  const pref = { get: () => read(localStorage, PREF_KEY), set: (v) => write(localStorage, PREF_KEY, v) };

  /* ---------- The tracks ---------- */
  // chords: MIDI notes per bar · bar: seconds per chord · lead: the notes over the top
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const TRACKS = [
    {
      id: "study", title: "Evening study", note: "Soft piano over warm pads",
      chords: [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 57, 64]],
      bar: 8, pad: { type: "triangle", level: 0.035 }, cutoff: 2200,
      lead(v, t, chord, bar) {
        let s = 0.6 + Math.random();
        while (s < bar - 1) {
          if (Math.random() < 0.7) v.bell(pick([72, 74, 76, 79, 81, 84, 86]), t + s);
          s += 1 + Math.random() * 1.8;
        }
      },
    },
    {
      id: "rain", title: "Rainy window", note: "Mellow keys and gentle rain",
      chords: [[50, 53, 57, 64], [43, 53, 59, 64], [48, 52, 59, 62], [45, 55, 61, 65]],
      bar: 9, pad: { type: "sine", level: 0.03 }, cutoff: 1800, texture: "rain",
      lead(v, t, chord, bar) {
        // a slow strum of the chord, then a few drifting notes
        chord.forEach((n, i) => v.keys(n + 12, t + 0.15 + i * 0.09, 0.035));
        chord.forEach((n, i) => v.keys(n + 12, t + bar / 2 + i * 0.07, 0.025));
        let s = 2 + Math.random() * 2;
        while (s < bar - 1.5) {
          if (Math.random() < 0.55) v.keys(pick([74, 76, 77, 79, 81]), t + s, 0.04);
          s += 1.6 + Math.random() * 2;
        }
      },
    },
    {
      id: "musicbox", title: "Music box", note: "A little wind-up lullaby",
      chords: [[53, 60, 65, 69], [50, 57, 62, 65], [46, 58, 62, 65], [48, 55, 64, 67]],
      bar: 6, pad: { type: "sine", level: 0.02 }, cutoff: 4200,
      lead(v, t, chord) {
        // waltz-time arpeggio, up then down
        const top = chord.map((n) => n + 24).sort((a, b) => a - b);
        const notes = [top[0], top[1], top[2], top[3], top[2], top[1]];
        const step = 0.5;
        for (let i = 0; i < 12; i++) {
          if (i % 6 === 5 && Math.random() < 0.5) continue; // a breath now and then
          v.box(notes[i % notes.length], t + i * step, i % 3 === 0 ? 0.05 : 0.035);
        }
      },
    },
    {
      id: "fireside", title: "Fireside", note: "Low, warm chords and a crackling fire",
      chords: [[51, 58, 62, 67], [48, 55, 63, 70], [44, 56, 60, 67], [46, 53, 58, 67]],
      bar: 10, pad: { type: "triangle", level: 0.045 }, cutoff: 1100, texture: "crackle",
      lead(v, t, chord, bar) {
        let s = 1 + Math.random() * 2;
        while (s < bar - 2) {
          v.keys(pick([60, 63, 65, 67, 70]), t + s, 0.05);
          s += 2.5 + Math.random() * 3;
        }
      },
    },
  ];
  let tracks = TRACKS.slice();
  const byId = (id) => tracks.find((x) => x.id === id) || tracks[0];

  // MP3s listed in site.json go first, if there are any.
  const extra = fetch(ROOT + "data/site.json", { cache: "no-cache" })
    .then((r) => r.json())
    .then((site) => {
      const files = (site.music || []).filter((m) => m && m.file).map((m, i) => ({
        id: `file${i}`, title: m.title || `Track ${i + 1}`, note: m.note || "", file: new URL(m.file, ROOT).href,
      }));
      if (files.length) tracks = [...files, ...TRACKS];
    })
    .catch(() => {});

  /* ---------- Sound engine ---------- */
  function makeEngine() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // shared reverb from a decaying noise impulse
    const reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 4;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet).connect(master);

    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const ramp = (param, to, secs) => {
      const now = ctx.currentTime;
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(to, now + Math.max(0.05, secs));
    };

    // One playing track: its own volume (for cross-fades) and note scheduler.
    function player(track, from, warm) {
      const bus = ctx.createGain();
      bus.gain.value = 0;
      bus.connect(master);
      bus.connect(reverb);
      const out = ctx.createBiquadFilter();
      out.type = "lowpass";
      out.frequency.value = track.cutoff || 20000;
      out.connect(bus);
      const stops = [];

      /* MP3 track */
      if (track.file) {
        const audio = new Audio(track.file);
        audio.loop = true;
        audio.preload = "auto";
        ctx.createMediaElementSource(audio).connect(bus);
        const begin = () => { try { audio.currentTime = from || 0; } catch {} audio.play().catch(() => {}); };
        audio.readyState >= 1 ? begin() : audio.addEventListener("loadedmetadata", begin, { once: true });
        stops.push(() => audio.pause());
        return {
          track, bus,
          get pos() { return audio.currentTime; },
          stop(fade) {
            ramp(bus.gain, 0, fade);
            setTimeout(() => { stops.forEach((f) => f()); bus.disconnect(); }, fade * 1000 + 200);
          },
        };
      }

      /* Generated track */
      const v = {
        pad(midi, t, dur, quick) {
          for (const detune of [-6, 6]) {
            const o = ctx.createOscillator();
            o.type = track.pad.type;
            o.frequency.value = hz(midi);
            o.detune.value = detune;
            const g = ctx.createGain();
            const lvl = track.pad.level;
            g.gain.setValueAtTime(quick ? lvl : 0, t);
            if (!quick) g.gain.linearRampToValueAtTime(lvl, t + 2.5);
            g.gain.setValueAtTime(lvl, t + dur - 1);
            g.gain.linearRampToValueAtTime(0, t + dur + 2.5);
            o.connect(g).connect(out);
            o.start(t);
            o.stop(t + dur + 3);
          }
        },
        // soft bell / piano
        bell(midi, t, level = 0.07) {
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(level, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
          [[1, 1], [2, 0.25]].forEach(([mul, lv]) => {
            const o = ctx.createOscillator();
            o.frequency.value = hz(midi) * mul;
            const og = ctx.createGain();
            og.gain.value = lv;
            o.connect(og).connect(g);
            o.start(t);
            o.stop(t + 3.1);
          });
          g.connect(out);
        },
        // electric-piano keys with a slow wobble
        keys(midi, t, level = 0.05) {
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(level, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);
          const trem = ctx.createGain();
          trem.gain.value = 1;
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 4.2;
          const depth = ctx.createGain();
          depth.gain.value = 0.18;
          lfo.connect(depth).connect(trem.gain);
          [[1, 1], [3, 0.06], [0.5, 0.15]].forEach(([mul, lv]) => {
            const o = ctx.createOscillator();
            o.frequency.value = hz(midi) * mul;
            const og = ctx.createGain();
            og.gain.value = lv;
            o.connect(og).connect(g);
            o.start(t);
            o.stop(t + 4.6);
          });
          g.connect(trem).connect(out);
          lfo.start(t);
          lfo.stop(t + 4.6);
        },
        // tiny music-box tine
        box(midi, t, level = 0.04) {
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(level, t + 0.004);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
          [[1, 1], [4, 0.12], [6.2, 0.04]].forEach(([mul, lv]) => {
            const o = ctx.createOscillator();
            o.frequency.value = hz(midi) * mul;
            const og = ctx.createGain();
            og.gain.value = lv;
            o.connect(og).connect(g);
            o.start(t);
            o.stop(t + 1.9);
          });
          g.connect(out);
        },
      };

      // background textures
      if (track.texture === "rain") {
        const src = ctx.createBufferSource();
        src.buffer = noise;
        src.loop = true;
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.frequency.value = 2400;
        band.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.value = 0.05;
        src.connect(band).connect(g).connect(bus);
        src.start();
        stops.push(() => src.stop());
      }
      function crackle(t, dur) {
        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 1800;
        hp.connect(bus);
        for (let s = Math.random() * 0.4; s < dur; s += 0.08 + Math.random() * 0.5) {
          const src = ctx.createBufferSource();
          src.buffer = noise;
          const g = ctx.createGain();
          const at = t + s;
          g.gain.setValueAtTime(0.015 + Math.random() * 0.06, at);
          g.gain.exponentialRampToValueAtTime(0.0001, at + 0.02 + Math.random() * 0.03);
          src.connect(g).connect(hp);
          src.start(at, Math.random() * 1.9, 0.06);
        }
      }

      let bar = from || 0;
      let nextAt = 0;
      let timer = null;
      let first = true;
      function scheduleBar() {
        const t = Math.max(nextAt, ctx.currentTime + 0.05);
        const chord = track.chords[bar % track.chords.length];
        chord.forEach((n) => v.pad(n, t, track.bar, first && warm));
        track.lead(v, t, chord, track.bar);
        if (track.texture === "crackle") crackle(t, track.bar);
        bar++;
        first = false;
        nextAt = t + track.bar;
        timer = setTimeout(scheduleBar, (nextAt - ctx.currentTime - 1) * 1000);
      }
      scheduleBar();
      return {
        track, bus,
        get pos() { return bar; },
        stop(fade) {
          clearTimeout(timer);
          ramp(bus.gain, 0, fade);
          setTimeout(() => { stops.forEach((f) => { try { f(); } catch {} }); bus.disconnect(); }, fade * 1000 + 3500);
        },
      };
    }

    let current = null;
    let idle = null;
    return {
      ctx,
      // true if this page is allowed to make sound right now
      async unlocked() {
        if (ctx.state === "running") return true;
        await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
        return ctx.state === "running";
      },
      play(track, { from = 0, fade = 3, warm = false } = {}) {
        clearTimeout(idle);
        ctx.resume();
        if (!current || current.track !== track) {
          const old = current;
          current = player(track, from, warm);
          ramp(current.bus.gain, 1, old ? 2 : 0.05);
          if (old) old.stop(2);
        }
        ramp(master.gain, VOLUME, fade);
      },
      pause() {
        ramp(master.gain, 0, 1.2);
        clearTimeout(idle);
        idle = setTimeout(() => {
          const pos = current?.pos;
          current?.stop(0.05);
          current = null;
          ctx.suspend();
          engine.lastPos = pos;
        }, 1400);
      },
      get pos() { return current ? current.pos : 0; },
    };
  }

  /* ---------- Playing, pausing, switching ---------- */
  let engine = null;
  let playing = false;
  let currentId = read(localStorage, TRACK_KEY) || TRACKS[0].id;
  const getEngine = () => (engine ||= makeEngine());

  function saveState() {
    if (!playing || !engine) return;
    write(sessionStorage, STATE_KEY, JSON.stringify({ track: currentId, pos: engine.pos, at: Date.now() }));
  }
  function play(opts = {}) {
    const e = getEngine();
    if (!e) return;
    playing = true;
    e.play(byId(currentId), { from: engine.lastPos || 0, ...opts });
    engine.lastPos = 0;
    render();
  }
  function pause() {
    playing = false;
    saveState();
    write(sessionStorage, STATE_KEY, "");
    engine?.pause();
    render();
  }
  async function choose(id) {
    await extra;
    currentId = byId(id).id;
    write(localStorage, TRACK_KEY, currentId);
    pref.set("on");
    play({ from: 0, fade: playing ? 1 : 2 });
  }
  function next() {
    const i = tracks.indexOf(byId(currentId));
    choose(tracks[(i + 1) % tracks.length].id);
  }

  // Remember where the music is when leaving the page.
  addEventListener("pagehide", saveState);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && saveState());
  setInterval(saveState, 2000);

  /* ---------- Music panel ---------- */
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zM13 5h3v14h-3z"/></svg>';
  const NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l9 6-9 6zM17 6h2v12h-2z"/></svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let panel = null;
  let opener = null;

  function panelHTML() {
    const t = byId(currentId);
    return `
      <div class="mp-now">
        <button type="button" class="mp-toggle" data-mp="toggle" aria-label="${playing ? "Pause music" : "Play music"}">${playing ? PAUSE : PLAY}</button>
        <div class="mp-meta"><span class="mp-label">${playing ? "Now playing" : "Paused"}</span><span class="mp-title">${esc(t.title)}</span></div>
        <button type="button" class="mp-next" data-mp="next" aria-label="Next track" title="Next track">${NEXT}</button>
      </div>
      <ul class="mp-list" aria-label="Tracks">${tracks.map((x) => `
        <li><button type="button" data-track="${x.id}" aria-pressed="${x.id === t.id}">
          <span class="mp-dot" aria-hidden="true"></span>
          <span class="mp-t">${esc(x.title)}</span>
          ${x.note ? `<span class="mp-n">${esc(x.note)}</span>` : ""}
        </button></li>`).join("")}
      </ul>`;
  }
  function place() {
    if (!panel || !opener) return;
    const r = opener.getBoundingClientRect();
    const w = Math.min(300, innerWidth - 24);
    panel.style.width = `${w}px`;
    panel.style.top = `${Math.round(r.bottom + 8)}px`;
    panel.style.left = `${Math.round(Math.min(Math.max(12, r.right - w), innerWidth - w - 12))}px`;
  }
  function openPanel(btn) {
    opener = btn;
    panel = document.createElement("div");
    panel.className = "music-pop";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Music");
    panel.innerHTML = panelHTML();
    document.body.appendChild(panel);
    place();
    btn.setAttribute("aria-expanded", "true");
    panel.querySelector("[data-mp=toggle]").focus({ preventScroll: true });
    setTimeout(() => document.addEventListener("pointerdown", outside), 0);
    document.addEventListener("keydown", onKey);
    addEventListener("resize", place);
    addEventListener("scroll", place, { passive: true });
  }
  function closePanel(refocus = true) {
    if (!panel) return;
    panel.remove();
    panel = null;
    opener?.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside);
    document.removeEventListener("keydown", onKey);
    removeEventListener("resize", place);
    removeEventListener("scroll", place);
    if (refocus) opener?.focus({ preventScroll: true });
  }
  function outside(e) {
    if (!panel.contains(e.target) && !e.target.closest("[data-music]")) closePanel(false);
  }
  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); closePanel(); }
  }

  function render() {
    // lets the page react to the music (the homepage's liquid wave only flows while it plays)
    document.documentElement.classList.toggle("music-on", playing);
    document.querySelectorAll("[data-music]").forEach((btn) => {
      btn.classList.toggle("is-playing", playing);
      btn.setAttribute("aria-haspopup", "dialog");
      btn.setAttribute("aria-expanded", String(!!panel && opener === btn));
      btn.title = playing ? `Music: ${byId(currentId).title}` : "Music";
    });
    if (panel) {
      const focusKey = document.activeElement?.dataset?.mp || document.activeElement?.dataset?.track;
      panel.innerHTML = panelHTML();
      const again = focusKey && panel.querySelector(`[data-mp="${focusKey}"], [data-track="${focusKey}"]`);
      again?.focus({ preventScroll: true });
    }
  }

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-music]");
    if (btn) {
      if (panel) return closePanel();
      // a tap on the music button means "I want music": start it and show the tracks
      if (!playing) { pref.set("on"); play(); }
      await extra;
      openPanel(btn);
      render();
      return;
    }
    if (!panel || !panel.contains(e.target)) return;
    const ctl = e.target.closest("[data-mp]");
    const tr = e.target.closest("[data-track]");
    if (ctl?.dataset.mp === "toggle") {
      if (playing) { pause(); pref.set("off"); } else { pref.set("on"); play(); }
    } else if (ctl?.dataset.mp === "next") next();
    else if (tr) choose(tr.dataset.track);
  });

  /* ---------- Carry on from the previous page ---------- */
  if (pref.get() === "on") {
    let saved = null;
    try { saved = JSON.parse(read(sessionStorage, STATE_KEY) || "null"); } catch {}
    const recent = saved && Date.now() - saved.at < 15 * 60e3;
    if (recent && saved.track) currentId = saved.track;
    const opts = recent ? { from: saved.pos, fade: 0.8, warm: true } : {};
    const resume = () => {
      off();
      if (!playing && pref.get() === "on") extra.then(() => !playing && play(opts));
    };
    const events = ["pointerup", "touchend", "keydown", "click"];
    const off = () => events.forEach((ev) => document.removeEventListener(ev, resume, true));
    events.forEach((ev) => document.addEventListener(ev, resume, true));
    // Most browsers let a page play straight away after a click on the
    // previous page of the same site; if not, the listeners above take over.
    if (recent) {
      const e = getEngine();
      e?.unlocked().then((ok) => { if (ok) resume(); });
    }
  }

  document.addEventListener("DOMContentLoaded", render);
  render();
})();
