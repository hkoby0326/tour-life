// Seeded deterministic RNG (mulberry32). State is saved with the game so
// reloading a save and advancing again produces the identical outcome.
(function (g) {
  const TL = (g.TL = g.TL || {});

  function RNG(seed) {
    this.s = (seed >>> 0) || 1;
  }
  RNG.prototype.next = function () {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.int = function (a, b) {
    return a + Math.floor(this.next() * (b - a + 1));
  };
  RNG.prototype.chance = function (p) {
    return this.next() < p;
  };
  RNG.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };
  RNG.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  };
  RNG.prototype.gauss = function (mean, sd) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return (mean || 0) + z * (sd === undefined ? 1 : sd);
  };
  RNG.prototype.getState = function () {
    return this.s;
  };
  RNG.prototype.setState = function (s) {
    this.s = s >>> 0;
  };
  // Derive a child RNG from a string key (used for per-year procedural data).
  RNG.hash = function (str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  TL.RNG = RNG;
  TL.clamp = function (x, a, b) {
    return x < a ? a : x > b ? b : x;
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
