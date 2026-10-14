// Tiny interface sounds, synthesised with the Web Audio API (no audio files).
// Sfx.tick() – tapping a card or control      Sfx.pop() / Sfx.unpop() – save / unsave
// Sfx.ding() – starting to read                Sfx.soft() – small toggles
// There are a few sound sets to pick from (Sfx.packs / Sfx.setPack); the
// muted state and the chosen set are remembered per device.
(function () {
  const KEY = "books.sfxMuted";
  const PACK_KEY = "books.sfxPack";
  let ctx = null;
  // Off unless the visitor turns them on (stored as "0" once switched on).
  let muted = true;
  try { muted = localStorage.getItem(KEY) !== "0"; } catch {}

  function audio() {
    if (ctx === false) return null;
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = false; return null; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  // One short blip: frequency (Hz), length (s), waveform, volume, optional glide target (Hz), delay (s).
  function blip(freq, len, type, vol, glideTo, delay = 0) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime + delay;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + len * 0.6);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  function buzz(ms) {
    if (muted) return;
    try { navigator.vibrate && navigator.vibrate(ms); } catch {}
  }

  // A struck bell or bar: a fundamental plus a quieter overtone.
  const bell = (f, len, vol, delay, ratio = 2.76) => {
    blip(f, len, "sine", vol, null, delay);
    blip(f * ratio, len * 0.45, "sine", vol * 0.35, null, delay);
  };
  // A water droplet: a sine that slides quickly upwards.
  const drop = (f, vol, delay) => blip(f, 0.09, "sine", vol, f * 2.6, delay);

  const PACKS = [
    {
      id: "click", title: "Soft clicks", note: "Crisp little taps, like a keyboard",
      tick: () => blip(1180, 0.028, "square", 0.045),
      soft: () => blip(900, 0.022, "square", 0.025),
      pop: () => blip(520, 0.07, "triangle", 0.11, 880),
      unpop: () => blip(880, 0.07, "triangle", 0.09, 480),
      ding: () => { blip(880, 0.16, "sine", 0.13); blip(1320, 0.22, "sine", 0.1, null, 0.09); },
    },
    {
      id: "water", title: "Water drops", note: "Bloops and ripples",
      tick: () => drop(520, 0.12),
      soft: () => drop(700, 0.06),
      pop: () => { drop(420, 0.14); drop(640, 0.09, 0.07); },
      unpop: () => blip(900, 0.1, "sine", 0.11, 380),
      ding: () => { drop(380, 0.14); drop(560, 0.1, 0.11); drop(760, 0.08, 0.22); },
    },
    {
      id: "wood", title: "Wooden blocks", note: "Warm knocks, like a marimba",
      tick: () => bell(620, 0.07, 0.12, 0, 4),
      soft: () => bell(760, 0.05, 0.07, 0, 4),
      pop: () => { bell(523, 0.12, 0.13, 0, 4); bell(784, 0.14, 0.11, 0.07, 4); },
      unpop: () => { bell(784, 0.1, 0.11, 0, 4); bell(523, 0.14, 0.1, 0.07, 4); },
      ding: () => { bell(523, 0.25, 0.13, 0, 4); bell(659, 0.25, 0.11, 0.1, 4); bell(784, 0.35, 0.1, 0.2, 4); },
    },
    {
      id: "chime", title: "Glass chimes", note: "Light, ringing and airy",
      tick: () => bell(1568, 0.18, 0.05),
      soft: () => bell(2093, 0.12, 0.03),
      pop: () => { bell(1319, 0.3, 0.06); bell(1976, 0.35, 0.05, 0.08); },
      unpop: () => { bell(1976, 0.25, 0.05); bell(1319, 0.3, 0.05, 0.08); },
      ding: () => { bell(1047, 0.6, 0.07); bell(1568, 0.6, 0.06, 0.12); bell(2093, 0.8, 0.05, 0.24); },
    },
  ];
  let pack = PACKS[0];
  try { pack = PACKS.find((p) => p.id === localStorage.getItem(PACK_KEY)) || pack; } catch {}

  const Sfx = {
    tick() { pack.tick(); buzz(8); },
    soft() { pack.soft(); },
    pop() { pack.pop(); buzz(12); },
    unpop() { pack.unpop(); buzz(8); },
    ding() { pack.ding(); buzz(20); },
    get muted() { return muted; },
    get pack() { return pack.id; },
    packs: PACKS.map(({ id, title, note }) => ({ id, title, note })),
    // Picking a set switches sounds on and plays a short sample of it.
    setPack(id) {
      pack = PACKS.find((p) => p.id === id) || pack;
      try { localStorage.setItem(PACK_KEY, pack.id); } catch {}
      if (muted) Sfx.toggle();
      else { pack.tick(); setTimeout(() => pack.pop(), 160); }
    },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch {}
      if (!muted) Sfx.tick();
      return muted;
    },
  };
  window.Sfx = Sfx;
})();
