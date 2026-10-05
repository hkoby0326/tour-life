// Point-by-point match simulator, written as a stepper so the UI can watch
// important matches live and change the game plan between sets.
// p(server wins point) = base(surface) + k1*(SERVE_A - RETURN_B) + k2*(RALLY_A - RALLY_B) + context
(function (g) {
  const TL = (g.TL = g.TL || {});
  const clamp = TL.clamp;

  const SURF = {
    hard: { base: 0.63, k1: 0.0013, k2: 0.0010, netW: 0.10, rally: 4.8, ace: 1.0 },
    clay: { base: 0.60, k1: 0.0010, k2: 0.0013, netW: 0.05, rally: 6.0, ace: 0.7 },
    grass: { base: 0.66, k1: 0.0016, k2: 0.0008, netW: 0.18, rally: 3.8, ace: 1.35 },
    indoor: { base: 0.65, k1: 0.0015, k2: 0.0009, netW: 0.12, rally: 4.3, ace: 1.15 },
  };
  TL.MATCH_SURF = SURF;

  function fatigueMult(f) {
    return 1 - Math.max(0, (f || 0) - 40) / 60 * 0.10;
  }
  function components(p, surface) {
    const a = p.attrs;
    const fm = fatigueMult(p.fatigue);
    const sAdj = ((p.surf && p.surf[surface] !== undefined ? p.surf[surface] : 50) - 50) / 50 * 6;
    const netW = SURF[surface].netW;
    const serve = (0.7 * a.serve + 0.3 * a.power) * fm + sAdj;
    const ret = (0.6 * a.return + 0.25 * a.speed + 0.15 * a.focus) * fm + sAdj;
    const rally = ((0.30 - netW / 2) * a.fh + (0.25 - netW / 2) * a.bh + 0.20 * a.speed + 0.10 * a.power + netW * a.net + 0.05 * a.stamina + 0.10 * a.focus) * fm + sAdj;
    return { serve, ret, rally, clutch: a.clutch, stamina: a.stamina };
  }
  TL.components = components;
  function overall(p) {
    const a = p.attrs;
    return 0.18 * a.serve + 0.14 * a.return + 0.15 * a.fh + 0.13 * a.bh + 0.06 * a.net + 0.12 * a.speed + 0.08 * a.stamina + 0.08 * a.power + 0.06 * a.clutch;
  }
  TL.overall = overall;

  const PLANS = {
    balanced: { label: "バランス", serve: 0, rally: 0, ret: 0, fat: 1 },
    aggressive: { label: "攻撃的", serve: 2.5, rally: 1.0, ret: -2.0, fat: 1 },
    defensive: { label: "守備的", serve: -2.0, rally: 0.5, ret: 2.5, fat: 1.1 },
    conserve: { label: "体力温存", serve: -1.5, rally: -1.5, ret: -1.5, fat: 0.7 },
  };
  TL.PLANS = PLANS;
  function applyPlan(base, plan, clutchBonus) {
    const P = PLANS[plan] || PLANS.balanced;
    return { serve: base.serve + P.serve, ret: base.ret + P.ret, rally: base.rally + P.rally, clutch: base.clutch + (clutchBonus || 0), stamina: base.stamina, fat: P.fat };
  }
  const PT_LABEL = ["0", "15", "30", "40"];

  // Interactive match. step() plays one point; finish() plays to the end.
  function create(pa, pb, opts) {
    const rng = opts.rng;
    const surface = opts.surface || "hard";
    const S = SURF[surface];
    const bo5 = !!opts.bo5;
    const setsToWin = bo5 ? 3 : 2;
    const doLog = !!opts.log;
    const M = {
      names: [pa.name, pb.name], players: [pa, pb], surface, bo5, setsToWin, done: false, winnerIdx: null, result: null,
      sets: [], setsWon: [0, 0], games: [0, 0], pts: [0, 0], tb: false, tbPts: null, tbCount: 0, server: 0, setNo: 0,
      plans: [(opts.plans && opts.plans[0]) || "balanced", (opts.plans && opts.plans[1]) || "balanced"],
      rules: [(opts.rules && opts.rules[0]) || "none", (opts.rules && opts.rules[1]) || "none"],
      stats: { points: [0, 0], breaks: [0, 0], bpSaved: [0, 0], bpFaced: [0, 0], aces: [0, 0], dfs: [0, 0], winners: [0, 0], ues: [0, 0], mpSaved: [0, 0], longest: 0,
        svPts: [0, 0], svWon: [0, 0], firstIn: [0, 0], firstWon: [0, 0], secondWon: [0, 0], netPts: [0, 0], netWon: [0, 0], svGames: [0, 0], holds: [0, 0], tbW: [0, 0], tbL: [0, 0] },
      log: [], events: [], betweenSets: false, last: null,
    };
    const base = [components(pa, surface), components(pb, surface)];
    if (opts.edge) for (const i of [0, 1]) { base[i].serve += opts.edge[i] || 0; base[i].ret += opts.edge[i] || 0; }
    if (opts.bonus) for (const i of [0, 1]) { const b = opts.bonus[i]; if (b) { base[i].serve += b.serve || 0; base[i].ret += b.ret || 0; base[i].rally += b.rally || 0; } }
    const clutchB = [(opts.clutch && opts.clutch[0]) || 0, (opts.clutch && opts.clutch[1]) || 0];
    const comp = [applyPlan(base[0], M.plans[0], clutchB[0]), applyPlan(base[1], M.plans[1], clutchB[1])];
    const fatigueMultArr = [comp[0].fat, comp[1].fat];
    const form = [rng.gauss(0, 2.5), rng.gauss(0, 2.5)];
    const momentum = [0, 0];
    M.server = rng.int(0, 1);

    // Traits (learned with growth points): deterministic, situation-dependent nudges to the point
    // probability. They consume no randomness, so watched and simulated matches stay identical.
    const TR = [new Set((opts.traits && opts.traits[0]) || []), new Set((opts.traits && opts.traits[1]) || [])];
    const TC = opts.tctx || {};
    const anyTraits = TR[0].size + TR[1].size > 0;
    function traitAdj(sv, ctx) {
      let d = 0;
      const decider = M.setsWon[0] === setsToWin - 1 && M.setsWon[1] === setsToWin - 1;
      for (const i of [0, 1]) {
        const t = TR[i]; if (!t.size) continue;
        const serving = i === sv;
        let x = 0;
        if (t.has("bigserve") && serving && (ctx.bp || ctx.big || ctx.sp)) x += 0.03;
        if (t.has("returner") && !serving && ctx.bp) x += 0.03;
        if (t.has("tiebreak") && ctx.tb) x += 0.025;
        if (t.has("comeback") && M.setsWon[i] < M.setsWon[1 - i]) x += 0.012;
        if (t.has("frontrunner") && M.setsWon[i] > M.setsWon[1 - i]) x += 0.009;
        if (t.has("marathon") && decider) x += 0.006;
        if (t.has("claycourt") && surface === "clay") x += 0.005;
        if (t.has("fastcourt") && (surface === "grass" || surface === "indoor")) x += 0.005;
        if (t.has("faststart") && M.setNo === 0) x += 0.011;
        if (t.has("bigstage") && TC.bigStage) x += 0.005;
        if (t.has("crowd") && TC.home && TC.home[i]) x += 0.005;
        if (t.has("giantkiller") && TC.underdog && TC.underdog[i]) x += 0.006;
        d += serving ? x : -x;
      }
      return d;
    }
    function pPoint(sv, rt, ctx) {
      const A = comp[sv], B = comp[rt];
      let p = S.base + S.k1 * (A.serve + form[sv] - (B.ret + form[rt])) + S.k2 * (A.rally + form[sv] - (B.rally + form[rt]));
      p += momentum[sv] - momentum[rt];
      const fat = (s) => Math.max(0, M.setNo) * 0.006 * (1 - comp[s].stamina / 100) * 2 * (TR[s].has("marathon") ? 0.5 : 1);
      p -= fat(sv) - fat(rt);
      if (ctx.bp) p += (A.clutch - B.clutch) * 0.0008;
      if (ctx.big) p += (A.clutch - B.clutch) * 0.0006;
      if (anyTraits) p += traitAdj(sv, ctx);
      return clamp(p, 0.25, 0.92);
    }
    // Cosmetic point classification (how the point was won) sampled after the winner is known.
    // Drawn for every point so headless and watched matches consume the RNG identically.
    const SHOTS = ["fh", "bh", "fh", "bh", "net"];
    function pointKind(sv, rt, w) {
      const A = comp[sv];
      // Calibrated against tour averages (per player, bo3 on hard): ~5-6 aces, ~2.5 double faults,
      // i.e. ~8-9% of service points are aces and ~3.5% double faults. aceP applies to points the
      // server wins (~63%), dfP to points the server loses (~37%).
      const aceP = clamp((0.06 + (A.serve - 60) * 0.0035) * S.ace, 0.03, 0.28);
      const dfP = clamp(0.10 - (A.serve - 60) * 0.0015, 0.05, 0.14);
      const r = rng.next();
      let kind, rally, shot = null;
      if (w === sv) {
        if (r < aceP) { kind = "ace"; rally = 1; }
        else if (r < aceP + 0.16) { kind = "serve_winner"; rally = 2; }
        else { rally = 3 + Math.floor(-Math.log(1 - rng.next()) * (S.rally - 2.2)); kind = rng.next() < 0.5 ? "winner" : "error"; shot = rng.next() < S.netW * (kind === "winner" ? 2.0 : 0.85) ? "net" : rng.next() < 0.55 ? "fh" : "bh"; }
      } else {
        if (r < dfP) { kind = "double_fault"; rally = 0; }
        else if (r < dfP + 0.14) { kind = "return_winner"; rally = 2; }
        else { rally = 3 + Math.floor(-Math.log(1 - rng.next()) * (S.rally - 2.2)); kind = rng.next() < 0.5 ? "winner" : "error"; shot = rng.next() < S.netW * (kind === "winner" ? 2.0 : 0.85) ? "net" : rng.next() < 0.55 ? "fh" : "bh"; }
      }
      if (kind === "ace") M.stats.aces[sv]++;
      if (kind === "double_fault") M.stats.dfs[sv]++;
      if (kind === "winner" || kind === "serve_winner" || kind === "return_winner") M.stats.winners[w]++;
      if (kind === "error") M.stats.ues[1 - w]++;
      if (rally > M.stats.longest) M.stats.longest = rally;
      // first or second serve (cosmetic, one draw per point): tour average ~62% first serves in,
      // ~73% of first-serve points and ~53% of second-serve points won by the server
      const u = rng.next();
      let first;
      if (kind === "double_fault") first = false;
      else if (kind === "ace") first = u < 0.9;
      else { const b = clamp(0.58 + (A.serve - 60) * 0.002, 0.54, 0.66); first = u < (w === sv ? b + 0.1 : b - 0.08); }
      M.stats.svPts[sv]++;
      if (w === sv) M.stats.svWon[sv]++;
      if (first) { M.stats.firstIn[sv]++; if (w === sv) M.stats.firstWon[sv]++; } else if (w === sv) M.stats.secondWon[sv]++;
      if (shot === "net") { const atNet = kind === "winner" ? w : 1 - w; M.stats.netPts[atNet]++; if (atNet === w) M.stats.netWon[atNet]++; }
      return { kind, rally, shot, first };
    }
    const SHOT_LABEL = { fh: "フォア", bh: "バック", net: "ボレー" };
    function kindText(ev, who) {
      const n = M.names[who];
      switch (ev.kind) {
        case "ace": return `${n} エース！`;
        case "double_fault": return `${M.names[1 - who]} ダブルフォルト`;
        case "serve_winner": return `${n} サービスウィナー`;
        case "return_winner": return `${n} リターンウィナー`;
        case "winner": return `${n} ${SHOT_LABEL[ev.shot] || ""}のウィナー（${ev.rally}打）`;
        default: return `${M.names[1 - who]} ${SHOT_LABEL[ev.shot] || ""}のミス（${ev.rally}打）`;
      }
    }
    M.kindText = kindText;
    M.setPlan = function (i, plan) {
      if (!PLANS[plan]) return;
      M.plans[i] = plan;
      comp[i] = applyPlan(base[i], plan, clutchB[i]);
      fatigueMultArr[i] = Math.max(fatigueMultArr[i], PLANS[plan].fat);
      if (doLog) M.log.push({ t: "plan", set: M.setNo + 1, who: i, plan });
    };
    // Situation flags before the next point (for display and clutch context)
    M.situation = function () {
      const sv = M.server, rt = 1 - sv;
      const isDecider = M.setsWon[0] === setsToWin - 1 && M.setsWon[1] === setsToWin - 1;
      if (M.tb) {
        const target = isDecider ? 10 : 7;
        const leader = M.tbPts[0] > M.tbPts[1] ? 0 : M.tbPts[1] > M.tbPts[0] ? 1 : -1;
        const big = leader >= 0 && M.tbPts[leader] >= target - 1 && M.tbPts[leader] - M.tbPts[1 - leader] >= 1;
        const setPoint = big ? leader : -1;
        const matchPoint = big && M.setsWon[leader] === setsToWin - 1 ? leader : -1;
        return { bp: big && leader === rt, big, setPoint, matchPoint, breakPoint: -1 };
      }
      const bp = M.pts[rt] >= 3 && M.pts[rt] > M.pts[sv];
      const gp = M.pts[sv] >= 3 && M.pts[sv] > M.pts[rt];
      let setPoint = -1, matchPoint = -1;
      for (const i of [0, 1]) {
        const onPoint = i === sv ? gp : bp;
        const wouldWinSet = M.games[i] + 1 >= 6 && M.games[i] + 1 - M.games[1 - i] >= 2;
        if (onPoint && wouldWinSet) { setPoint = i; if (M.setsWon[i] === setsToWin - 1) matchPoint = i; }
      }
      return { bp, big: setPoint >= 0, setPoint, matchPoint, breakPoint: bp ? rt : -1 };
    };
    function endSet(gamesArr, tbArr) {
      const sw = gamesArr[0] > gamesArr[1] ? 0 : 1;
      M.setsWon[sw]++;
      M.sets.push(tbArr ? [gamesArr[0], gamesArr[1], tbArr] : [gamesArr[0], gamesArr[1]]);
      if (doLog) M.log.push({ t: "set", set: M.setNo + 1, who: sw, games: gamesArr.slice(), tb: tbArr ? tbArr.slice() : null });
      M.events.push({ kind: "set", who: sw, text: `第${M.setNo + 1}セット ${M.names[sw]} が ${gamesArr[sw]}-${gamesArr[1 - sw]}${tbArr ? "(" + Math.min(tbArr[0], tbArr[1]) + ")" : ""} で取る` });
      M.setNo++;
      M.games = [0, 0]; M.pts = [0, 0]; M.tb = false; M.tbPts = null;
      if (M.setsWon[0] >= setsToWin || M.setsWon[1] >= setsToWin) { finalize(); return; }
      for (const i of [0, 1]) {
        if (M.rules[i] === "behind" && M.setsWon[i] < M.setsWon[1 - i] && M.plans[i] !== "aggressive") {
          M.setPlan(i, "aggressive");
          M.events.push({ kind: "plan", who: i, text: `${M.names[i]} が攻撃的に切り替える` });
        }
      }
      M.betweenSets = true;
    }
    function finalize() {
      M.done = true;
      M.winnerIdx = M.setsWon[0] > M.setsWon[1] ? 0 : 1;
      const w = M.winnerIdx;
      const score = M.sets.map((s) => {
        const a = w === 0 ? s[0] : s[1], b = w === 0 ? s[1] : s[0];
        return a + "-" + b + (s[2] ? "(" + Math.min(s[2][0], s[2][1]) + ")" : "");
      }).join(" ");
      const totalPts = M.stats.points[0] + M.stats.points[1];
      // rough broadcast-style duration: ~40s per point plus changeovers and set breaks
      const minutes = Math.round(totalPts * 0.62 + M.sets.length * 4 + 2);
      const firstSetWinner = M.sets[0][0] > M.sets[0][1] ? 0 : 1;
      M.result = { winnerIdx: w, sets: M.sets, score, log: M.log, stats: M.stats, names: M.names, fatigueMult: fatigueMultArr, games: M.sets.reduce((n, s) => n + s[0] + s[1], 0), minutes, deciding: M.sets.length === setsToWin * 2 - 1, comeback: firstSetWinner !== w };
      M.events.push({ kind: "end", who: w, text: `${M.names[w]} が ${score} で勝利` });
    }
    M.step = function () {
      if (M.done) return null;
      M.betweenSets = false;
      const sv = M.server, rt = 1 - sv;
      const sit = M.situation();
      const isDecider = M.setsWon[0] === setsToWin - 1 && M.setsWon[1] === setsToWin - 1;
      const ev = { kind: "point", server: sv, bp: sit.bp, setPoint: sit.setPoint, matchPoint: sit.matchPoint };
      if (M.tb) {
        const target = isDecider ? 10 : 7;
        if (sit.bp) M.stats.bpFaced[sv] += 0;
        const p = pPoint(sv, rt, { bp: sit.bp, big: sit.big, tb: true });
        const w = rng.next() < p ? sv : rt;
        Object.assign(ev, pointKind(sv, rt, w));
        if (sit.matchPoint === rt && w === sv) M.stats.mpSaved[sv]++;
        M.tbPts[w]++;
        M.stats.points[w]++;
        M.tbCount++;
        ev.winner = w;
        if (doLog && (ev.kind === "ace" || ev.kind === "double_fault" || ev.rally >= 12 || sit.big)) M.events.push({ kind: "pt", who: w, text: kindText(ev, w) });
        if (M.tbPts[w] >= target && M.tbPts[w] - M.tbPts[1 - w] >= 2) {
          M.games[w]++;
          const tbArr = M.tbPts.slice();
          M.server = 1 - M.server;
          ev.gameWon = w; ev.tiebreakWon = w;
          M.stats.tbW[w]++; M.stats.tbL[1 - w]++;
          M.last = ev;
          endSet(M.games.slice(), tbArr);
          return ev;
        }
        if (M.tbCount % 2 === 1) M.server = 1 - M.server;
        M.last = ev;
        return ev;
      }
      if (sit.bp) M.stats.bpFaced[sv]++;
      const p = pPoint(sv, rt, { bp: sit.bp, sp: sit.setPoint >= 0 });
      const w = rng.next() < p ? sv : rt;
      Object.assign(ev, pointKind(sv, rt, w));
      M.pts[w]++;
      M.stats.points[w]++;
      if (sit.bp && w === sv) { M.stats.bpSaved[sv]++; ev.bpSaved = true; }
      if (sit.matchPoint === rt && w === sv) M.stats.mpSaved[sv]++;
      ev.winner = w;
      if (doLog && (ev.kind === "ace" || ev.kind === "double_fault" || ev.rally >= 12 || sit.bp || sit.setPoint >= 0)) M.events.push({ kind: "pt", who: w, text: kindText(ev, w) });
      const gameOver = M.pts[w] >= 4 && M.pts[w] - M.pts[1 - w] >= 2;
      if (gameOver) {
        M.games[w]++;
        ev.gameWon = w;
        M.stats.svGames[sv]++;
        if (w === sv) M.stats.holds[sv]++;
        if (w !== sv) {
          M.stats.breaks[w]++;
          momentum[w] = 0.012; momentum[1 - w] = 0;
          ev.broke = true;
          if (doLog) M.log.push({ t: "break", set: M.setNo + 1, who: w, score: M.games[0] + "-" + M.games[1] });
          M.events.push({ kind: "break", who: w, text: `${M.names[w]} がブレーク（${M.games[w]}-${M.games[1 - w]}）` });
        } else { momentum[w] *= 0.5; momentum[1 - w] *= 0.5; }
        M.pts = [0, 0];
        M.server = 1 - M.server;
        M.last = ev;
        if (M.games[0] === 6 && M.games[1] === 6) { M.tb = true; M.tbPts = [0, 0]; M.tbCount = 0; M.events.push({ kind: "tb", text: isDecider ? "最終セット 10ポイントタイブレークへ" : "タイブレークへ" }); return ev; }
        if ((M.games[0] >= 6 || M.games[1] >= 6) && Math.abs(M.games[0] - M.games[1]) >= 2) endSet(M.games.slice(), null);
        return ev;
      }
      M.last = ev;
      return ev;
    };
    M.finish = function () { while (!M.done) M.step(); return M.result; };
    M.finishSet = function () { const n = M.setNo; while (!M.done && M.setNo === n) M.step(); };
    M.pointLabel = function () {
      if (M.tb) return [String(M.tbPts[0]), String(M.tbPts[1])];
      const a = M.pts[0], b = M.pts[1];
      if (a >= 3 && b >= 3) { if (a === b) return ["40", "40"]; return a > b ? ["AD", "-"] : ["-", "AD"]; }
      return [PT_LABEL[Math.min(a, 3)], PT_LABEL[Math.min(b, 3)]];
    };
    return M;
  }
  function play(pa, pb, opts) { return create(pa, pb, opts).finish(); }

  TL.Match = { play, create, fatigueMult };
})(typeof globalThis !== "undefined" ? globalThis : window);
