// Phase 0: match-model calibration. Prints win-rate matrix between synthetic players
// at given overall ratings and compares with target rank-based expectations.
require("../src/rng.js"); require("../src/data_tournaments.js"); require("../src/data_players.js"); require("../src/match.js");
const rng = new TL.RNG(12345);
function mk(o, name) {
  const a = {};
  for (const k of ["serve", "return", "fh", "bh", "net", "speed", "stamina", "power", "clutch", "focus", "durability"]) a[k] = o;
  return { name, attrs: a, surf: { hard: 50, clay: 50, grass: 50, indoor: 50 }, fatigue: 0 };
}
const N = parseInt(process.argv[2] || "2000", 10);
const levels = [92, 88, 83, 79, 73, 68, 61, 55];
const label = { 92: "#1", 88: "#3", 83: "#10", 79: "#20", 73: "#50", 68: "#100", 61: "#200", 55: "#300" };
for (const surface of ["hard", "clay"]) {
  console.log("\n== surface", surface, "bo3 ==  (row beats column, %)");
  console.log("      " + levels.map((l) => label[l].padStart(6)).join(""));
  for (const a of levels) {
    let row = label[a].padStart(6);
    for (const b of levels) {
      let w = 0;
      const pa = mk(a, "A"), pb = mk(b, "B");
      for (let i = 0; i < N; i++) w += TL.Match.play(pa, pb, { rng, surface }).winnerIdx === 0 ? 1 : 0;
      row += String(Math.round((100 * w) / N)).padStart(6);
    }
    console.log(row);
  }
}
console.log("\n== bo5 hard, #1 vs others ==");
for (const b of levels) {
  let w = 0;
  const pa = mk(92, "A"), pb = mk(b, "B");
  for (let i = 0; i < N; i++) w += TL.Match.play(pa, pb, { rng, surface: "hard", bo5: true }).winnerIdx === 0 ? 1 : 0;
  console.log(label[b].padStart(6), Math.round((100 * w) / N) + "%");
}
// sanity: equal players, serve hold rate and avg games
let holds = 0, games = 0, svGames = 0, pts = 0;
for (let i = 0; i < 500; i++) {
  const r = TL.Match.play(mk(75, "A"), mk(75, "B"), { rng, surface: "hard" });
  games += r.games; pts += r.stats.points[0] + r.stats.points[1];
  svGames += r.games; holds += r.games - r.stats.breaks[0] - r.stats.breaks[1];
}
console.log("\nequal 75v75: avg games", (games / 500).toFixed(1), "hold%", Math.round((100 * holds) / svGames), "avg points", Math.round(pts / 500));
