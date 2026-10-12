// Background music. Uses public/audio/background.mp3 if it exists; otherwise
// plays soft generative ambient music made with the Web Audio API.
// Browsers block sound until the visitor interacts, so music starts on the
// first click/tap (if it was left on) or when the music button is pressed.
(function () {
  const PREF_KEY = "books.music";
  const FILE = "audio/background.mp3";
  const VOLUME = 0.5;

  const pref = {
    get() { try { return localStorage.getItem(PREF_KEY); } catch { return null; } },
    set(v) { try { localStorage.setItem(PREF_KEY, v); } catch {} },
  };

  let playing = false;
  let engine = null; // { start(), stop() }

  /* ---------- File-based engine ---------- */
  function fileEngine() {
    const audio = new Audio(FILE);
    audio.loop = true;
    audio.volume = 0;
    let fade;
    const ramp = (to, done) => {
      clearInterval(fade);
      fade = setInterval(() => {
        const v = audio.volume + (to > audio.volume ? 0.02 : -0.02);
        audio.volume = Math.max(0, Math.min(1, v));
        if (Math.abs(audio.volume - to) < 0.03) {
          audio.volume = to;
          clearInterval(fade);
          done && done();
        }
      }, 60);
    };
    return {
      start() { audio.play().catch(() => {}); ramp(VOLUME); },
      stop() { ramp(0, () => audio.pause()); },
    };
  }

  /* ---------- Generative engine ---------- */
  function synthEngine() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0;

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2200;

    // Simple reverb from a decaying noise impulse.
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
    const dry = ctx.createGain();
    dry.gain.value = 0.6;

    tone.connect(dry).connect(master);
    tone.connect(reverb).connect(wet).connect(master);
    master.connect(ctx.destination);

    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    // Cmaj7 – Am7 – Fmaj7 – G6/9: calm, open voicings.
    const chords = [
      [48, 55, 64, 71],
      [45, 52, 60, 67],
      [41, 48, 57, 64],
      [43, 50, 57, 64],
    ];
    const melody = [72, 74, 76, 79, 81, 84, 86];
    const BAR = 8; // seconds per chord

    function pad(midi, t, dur) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = hz(midi);
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.035, t + 2.5);
        g.gain.setValueAtTime(0.035, t + dur - 1);
        g.gain.linearRampToValueAtTime(0, t + dur + 2.5);
        o.connect(g).connect(tone);
        o.start(t);
        o.stop(t + dur + 3);
      }
    }

    function pluck(midi, t) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = hz(midi);
      const o2 = ctx.createOscillator(); // soft overtone for a bell/piano feel
      o2.type = "sine";
      o2.frequency.value = hz(midi) * 2;
      const g = ctx.createGain();
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(tone);
      o.start(t); o2.start(t);
      o.stop(t + 3.1); o2.stop(t + 3.1);
    }

    let bar = 0;
    let timer = null;
    let nextAt = 0;

    function scheduleBar() {
      const t = Math.max(nextAt, ctx.currentTime + 0.1);
      const chord = chords[bar % chords.length];
      chord.forEach((n) => pad(n, t, BAR));
      // A few gentle melody notes per bar.
      let s = 0.6 + Math.random();
      while (s < BAR - 1) {
        if (Math.random() < 0.7) pluck(melody[Math.floor(Math.random() * melody.length)], t + s);
        s += 1 + Math.random() * 1.8;
      }
      bar++;
      nextAt = t + BAR;
      timer = setTimeout(scheduleBar, (nextAt - ctx.currentTime - 1) * 1000);
    }

    return {
      start() {
        ctx.resume();
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(VOLUME, now + 3);
        if (!timer) { nextAt = 0; scheduleBar(); }
      },
      stop() {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + 1.2);
        clearTimeout(timer);
        timer = null;
        setTimeout(() => { if (!playing) ctx.suspend(); }, 1400);
      },
    };
  }

  let enginePromise = null;
  function getEngine() {
    if (!enginePromise) {
      enginePromise = fetch(FILE, { method: "HEAD" })
        .then((r) => (r.ok && /audio/.test(r.headers.get("content-type") || "") ? fileEngine() : synthEngine()))
        .catch(() => synthEngine())
        .then((e) => (engine = e));
    }
    return enginePromise;
  }

  function render() {
    document.querySelectorAll("[data-music]").forEach((btn) => {
      btn.classList.toggle("is-playing", playing);
      btn.setAttribute("aria-pressed", String(playing));
      btn.title = playing ? "Pause music" : "Play music";
    });
  }

  async function play() {
    playing = true;
    render();
    const e = await getEngine();
    if (e && playing) e.start();
  }
  function pause() {
    playing = false;
    render();
    if (engine) engine.stop();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-music]");
    if (!btn) return;
    if (playing) { pause(); pref.set("off"); }
    else { play(); pref.set("on"); }
  });

  // If music was left on, resume on the first interaction with the page.
  if (pref.get() === "on") {
    const resume = (e) => {
      if (e.target.closest && e.target.closest("[data-music]")) return;
      if (!playing) play();
    };
    document.addEventListener("pointerdown", resume, { once: true });
    document.addEventListener("keydown", resume, { once: true });
  }

  document.addEventListener("DOMContentLoaded", render);
})();
