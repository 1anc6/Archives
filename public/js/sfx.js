// Tiny interface sounds, synthesised with the Web Audio API (no audio files).
// Sfx.tick() – tapping a card or control      Sfx.pop() / Sfx.unpop() – save / unsave
// Sfx.ding() – starting to read                Muted state is remembered per device.
(function () {
  const KEY = "books.sfxMuted";
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === "1"; } catch {}

  function audio() {
    if (ctx === false) return null;
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { ctx = false; return null; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }

  // One short blip: frequency (Hz), length (s), waveform, volume, optional glide target (Hz).
  function blip(freq, len, type, vol, glideTo) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + len);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  function buzz(ms) {
    if (muted) return;
    try { navigator.vibrate && navigator.vibrate(ms); } catch {}
  }

  const Sfx = {
    tick() { blip(1180, 0.028, "square", 0.045); buzz(8); },
    soft() { blip(900, 0.022, "square", 0.025); },
    pop() { blip(520, 0.07, "triangle", 0.11, 880); buzz(12); },
    unpop() { blip(880, 0.07, "triangle", 0.09, 480); buzz(8); },
    ding() {
      blip(880, 0.16, "sine", 0.13);
      setTimeout(() => blip(1320, 0.22, "sine", 0.1), 90);
      buzz(20);
    },
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch {}
      if (!muted) Sfx.tick();
      return muted;
    },
  };
  window.Sfx = Sfx;
})();
