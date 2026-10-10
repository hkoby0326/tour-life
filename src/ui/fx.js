// UI-8: sound (Web Audio, synthesised, default off) and motion preferences.
(function () {
  const U = TL.UI;
  let ctx = null;
  function ac() {
    if (!U.settings.sound) return null;
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); return ctx; } catch (e) { return null; }
  }
  function tone(f, dur, type, vol, when, slide) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine";
    const t = c.currentTime + (when || 0);
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const v = (U.settings.volume == null ? 0.5 : U.settings.volume) * (vol || 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const SFX = {
    ptWin: () => tone(660, 0.09, "sine", 0.25),
    ptLose: () => tone(220, 0.12, "sine", 0.18),
    ace: () => { tone(880, 0.08, "square", 0.12); tone(1320, 0.12, "square", 0.12, 0.08); },
    df: () => tone(160, 0.25, "sawtooth", 0.1, 0, 90),
    brk: () => { tone(523, 0.1, "triangle", 0.3); tone(784, 0.18, "triangle", 0.3, 0.1); },
    set: () => [523, 659, 784].forEach((f, i) => tone(f, 0.16, "triangle", 0.3, i * 0.12)),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", 0.35, i * 0.14)),
    lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.25, "sine", 0.3, i * 0.18)),
    milestone: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.2, "sine", 0.3, i * 0.1)),
    click: () => tone(1200, 0.03, "square", 0.08),
    title: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.3, i * 0.11)); [784, 1047, 1319].forEach((f, i) => tone(f, 0.7, "sine", 0.22, 0.5 + i * 0.02)); },
    hype: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, "triangle", 0.28, i * 0.09)),
    injury: () => { tone(330, 0.18, "sawtooth", 0.12, 0, 200); tone(196, 0.35, "sine", 0.25, 0.16); },
  };
  U.sfx = (n) => { if (!U.settings.sound) return; const f = SFX[n]; if (f) try { f(); } catch (e) {} };
  U.sfxPoint = (ev, hi) => {
    if (!U.settings.sound || ev.winner === undefined) return;
    if (ev.kind === "ace") return U.sfx(ev.winner === hi ? "ace" : "ptLose");
    if (ev.kind === "double_fault") return U.sfx("df");
    U.sfx(ev.winner === hi ? "ptWin" : "ptLose");
  };
  // browsers only allow audio after a user gesture: warm the context up on the first tap
  document.addEventListener("pointerdown", () => { if (U.settings.sound) ac(); }, { passive: true });
  U.reducedMotion = () => !!U.settings.reduceMotion || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  U.applyMotion = () => document.documentElement.classList.toggle("reduce-motion", U.reducedMotion());
  U.applyMotion();
})();
