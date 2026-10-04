// Injury-rate calibration: injuries per player-season by severity, weeks lost, long layoffs.
require("../src/rng.js"); require("../src/data_tournaments.js"); require("../src/data_players.js"); require("../src/match.js"); require("../src/world.js");
const seasons = parseInt(process.argv[2] || "3", 10);
const s = TL.World.create({ name: "t", country: "JPN", origin: "college", seed: 9 });
const counts = { 1: 0, 2: 0, 3: 0 }; let weeksOut = 0; let long = 0; const humanInj = []; let wos = 0;
for (let i = 0; i < 52 * seasons; i++) {
  TL.World.advanceWeek(s, { type: "auto" });
  for (const p of s.players) {
    if (p.retired) continue;
    if (p.injury && p.injuredAt === s.t - 1) { counts[p.injury.sev]++; if (p.injury.weeks + 1 >= 10) long++; if (p.isHuman) humanInj.push(`${p.injury.label} ${p.injury.weeks + 1}w`); }
    if (p.injury) weeksOut++;
  }
  wos += s.history.matches.filter((m) => m.wo && m.t === s.t - 1).length;
}
const n = s.players.filter((p) => !p.retired).length;
const tot = counts[1] + counts[2] + counts[3];
console.log(`roster ${n}, ${seasons} seasons: injuries/player-season ${(tot / n / seasons).toFixed(2)} (minor ${(counts[1] / n / seasons).toFixed(2)}, moderate ${(counts[2] / n / seasons).toFixed(2)}, major ${(counts[3] / n / seasons).toFixed(3)})`);
console.log(`weeks lost/player-season ${(weeksOut / n / seasons).toFixed(1)}, long layoffs (10w+)/player-season ${(long / n / seasons).toFixed(3)}, human walkovers ${wos}`);
console.log("human injuries:", humanInj.join(", ") || "none");
