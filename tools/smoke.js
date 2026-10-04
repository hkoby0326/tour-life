// Full-career smoke test: runs N seasons on auto for each origin and prints a summary.
// usage: node tools/smoke.js [seasons] [seed]
require("../src/rng.js"); require("../src/data_tournaments.js"); require("../src/data_players.js"); require("../src/match.js"); require("../src/world.js");
const seasons = parseInt(process.argv[2] || "8", 10);
const seed = parseInt(process.argv[3] || "7", 10);
let fail = 0;
for (const origin of ["junior", "grinder", "college"]) {
  const s = TL.World.create({ name: "テスト", country: "JPN", origin, seed });
  const h = TL.World.human(s);
  console.log(`== ${origin} start ovr ${TL.overall(h).toFixed(1)} potential ${h.potential}${s.human.generational ? " (世代の才能)" : ""}`);
  const t0 = Date.now();
  for (let i = 0; i < 52 * seasons; i++) {
    const r = TL.World.advanceWeek(s, { type: "auto" });
    if (r.season) {
      const z = r.season;
      console.log(`  ${z.calendarYear} age ${z.age} rank ${String(z.rank).padStart(3)} ovr ${z.overall.toFixed(1)} W-L ${z.w}-${z.l} titles ${z.titles.length} money ${z.money} | No.1 ${z.no1}`);
    }
    if (s.human.careerOver) { console.log("  career over:", s.human.epilogue.tag); break; }
  }
  // invariants
  const active = s.players.filter((p) => !p.retired);
  const ranked = active.filter((p) => p.rank);
  const ranks = new Set(ranked.map((p) => p.rank));
  if (ranks.size !== ranked.length) { console.log("  !! duplicate ranks"); fail++; }
  if (s.players.some((p) => p.retired && p.rank)) { console.log("  !! retired player with rank"); fail++; }
  for (const p of active) for (const k of Object.keys(p.attrs)) if (!(p.attrs[k] >= 25 && p.attrs[k] <= 99)) { console.log("  !! attr out of range", p.name, k, p.attrs[k]); fail++; break; }
  const json = TL.World.serialize(s);
  const s2 = TL.World.deserialize(json);
  const r1 = TL.World.advanceWeek(s, { type: "auto" }), r2 = TL.World.advanceWeek(s2, { type: "auto" });
  if (r1.rankAfter !== r2.rankAfter || JSON.stringify(r1.human && r1.human.humanRound) !== JSON.stringify(r2.human && r2.human.humanRound)) { console.log("  !! save/reload not deterministic"); fail++; }
  console.log(`  ${Date.now() - t0}ms, active ${active.length}, save ${(json.length / 1024).toFixed(0)}KB, determinism ok`);
}
process.exit(fail ? 1 : 0);
