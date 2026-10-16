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

  // Filtered noise: a short burst through a filter. "bandpass" + high
  // frequency is the snap of a hard switch; "lowpass" is a muffled press.
  let grain = null;
  function hiss(type, freq, q, len, vol, delay = 0) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    if (!grain) {
      grain = a.createBuffer(1, Math.floor(a.sampleRate * 0.12), a.sampleRate);
      const d = grain.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + delay;
    const src = a.createBufferSource();
    src.buffer = grain;
    const f = a.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const gain = a.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(gain).connect(a.destination);
    src.start(t);
    src.stop(t + len + 0.02);
  }
  // A mechanical switch: a bright snap over a small, hollow body knock.
  const snap = (f, vol, delay = 0) => { hiss("bandpass", f, 9, 0.022, vol, delay); blip(f / 9, 0.035, "triangle", vol * 0.35, null, delay); };
  // A soft press: a low, rounded thud with a little air, like a rubber key.
  const press = (f, vol, delay = 0) => { blip(f, 0.09, "sine", vol, f * 0.7, delay); hiss("lowpass", 700, 0.7, 0.05, vol * 0.5, delay); };

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
    {
      id: "switch", title: "Tactile switches", note: "Firm mechanical clicks, for the skeuomorphic look",
      tick: () => snap(3200, 0.22),
      soft: () => snap(4200, 0.12),
      pop: () => { snap(2600, 0.22); snap(3600, 0.16, 0.06); },
      unpop: () => { snap(3600, 0.18); snap(2400, 0.16, 0.06); },
      ding: () => { snap(3000, 0.2); bell(988, 0.22, 0.08, 0.06, 2); bell(1319, 0.3, 0.06, 0.14, 2); },
    },
    {
      id: "press", title: "Soft presses", note: "Pillowy, muffled taps, for the neumorphic look",
      tick: () => press(230, 0.2),
      soft: () => press(300, 0.11),
      pop: () => { press(210, 0.2); press(320, 0.15, 0.08); },
      unpop: () => { press(320, 0.16); press(200, 0.16, 0.08); },
      ding: () => { press(220, 0.18); blip(392, 0.3, "sine", 0.07, null, 0.08); blip(523, 0.4, "sine", 0.06, null, 0.16); },
    },
  ];
  let pack = PACKS[0];
  try { pack = PACKS.find((p) => p.id === localStorage.getItem(PACK_KEY)) || pack; } catch {}

  /* ---------- Dice: a rattle while shuffling, then a landing ---------- */
  // One clack: a burst of noise through a narrow filter sounds like a plastic
  // die knocking on a table. Pitch and loudness vary so no two sound alike.
  let noise = null;
  function clack(vol = 0.5, delay = 0) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    if (!noise) {
      noise = a.createBuffer(1, Math.floor(a.sampleRate * 0.05), a.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    const t = a.currentTime + delay;
    const src = a.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.5;
    const band = a.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1800 + Math.random() * 1600;
    band.Q.value = 6;
    const gain = a.createGain();
    const v = vol * (0.7 + Math.random() * 0.3);
    gain.gain.setValueAtTime(v, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(band).connect(gain).connect(a.destination);
    src.start(t);
    // the body of the die: a short, low knock under the click
    blip(220 + Math.random() * 120, 0.04, "triangle", vol * 0.12, null, delay);
  }

  // Haptics. Android vibrates; iPhones (iOS 18+) give a tick when a hidden
  // switch is toggled, which is the only haptic a web page can reach there.
  let iosSwitch = null;
  function haptic(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch {}
      return;
    }
    if (!/iP(hone|ad|od)/.test(navigator.userAgent)) return;
    if (!iosSwitch) {
      iosSwitch = document.createElement("label");
      iosSwitch.setAttribute("aria-hidden", "true");
      iosSwitch.style.cssText = "position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:0";
      iosSwitch.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.appendChild(iosSwitch);
    }
    const taps = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
    for (let i = 0; i < taps; i++) setTimeout(() => iosSwitch.click(), i * 70);
  }

  const Sfx = {
    // A die tumbling: one knock per shuffle step (sound when sounds are on; a light tick of haptics always).
    rattle() { clack(0.45); haptic(6); },
    // The die settles: two quick knocks and a gentle chime, with a firmer buzz.
    land() {
      clack(0.55);
      clack(0.35, 0.07);
      if (!muted) setTimeout(() => pack.ding(), 140);
      haptic([14, 50, 24]);
    },
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
    // The look picker swaps to the set that suits the look, without
    // switching sounds on; plays a sample only when they are already on.
    usePack(id) {
      pack = PACKS.find((p) => p.id === id) || pack;
      try { localStorage.setItem(PACK_KEY, pack.id); } catch {}
      if (!muted) pack.tick();
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
