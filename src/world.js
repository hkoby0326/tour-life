// World simulation: roster, calendar, entries, draws, ranking, growth, injuries,
// finances and season turnover. Everything random goes through state.rng.
(function (g) {
  const TL = (g.TL = g.TL || {});
  const D = TL.DATA;
  const clamp = TL.clamp;
  const ATTRS = ["serve", "return", "fh", "bh", "net", "speed", "stamina", "power", "durability", "clutch", "focus"];
  const STYLE_LABEL = { all: "オールラウンド", server: "ビッグサーバー", grinder: "グラインダー", clay: "クレーコーター", grass: "芝・速いコート巧者", mental: "メンタル型", baseline: "ベースライナー", big: "パワーヒッター", counter: "カウンターパンチャー", young: "若手（発展途上）" };
  const ATTR_LABEL = { serve: "サーブ", return: "リターン", fh: "フォア", bh: "バック", net: "ネット", speed: "スピード", stamina: "スタミナ", power: "パワー", durability: "耐久性", clutch: "クラッチ", focus: "集中力" };
  const START_YEAR = 2026;
  const ROSTER = 330;

  // ---------- helpers ----------
  function interp(table, x) {
    const lx = Math.log(Math.max(1, x));
    if (lx <= Math.log(table[0][0])) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      if (lx <= Math.log(x1)) {
        const f = (lx - Math.log(x0)) / (Math.log(x1) - Math.log(x0));
        return y0 + f * (y1 - y0);
      }
    }
    return table[table.length - 1][1];
  }
  const OVR_TABLE = [[1, 92], [2, 90.5], [5, 86.5], [10, 83], [20, 79], [50, 73.5], [100, 68], [200, 61], [300, 55], [400, 50]];
  const PTS_TABLE = [[1, 11500], [2, 9000], [3, 7000], [5, 5000], [10, 3600], [20, 2200], [50, 1050], [100, 620], [150, 400], [200, 280], [300, 160], [330, 130]];
  const COUNTRY_WEIGHTS = [["USA", 14], ["FRA", 12], ["ITA", 11], ["ESP", 10], ["ARG", 8], ["GER", 7], ["AUS", 6], ["GBR", 5], ["CZE", 4], ["SRB", 3], ["RUS", 4], ["BRA", 4], ["CHN", 4], ["JPN", 3], ["CAN", 3], ["SUI", 2], ["NED", 2], ["BEL", 2], ["AUT", 2], ["CRO", 2], ["POL", 2], ["HUN", 1], ["POR", 2], ["CHI", 2], ["COL", 2], ["KOR", 2], ["IND", 2], ["KAZ", 1], ["DEN", 1], ["NOR", 1], ["SWE", 2], ["FIN", 1], ["GRE", 1], ["BUL", 1], ["ROU", 1], ["TUR", 1], ["MEX", 1], ["PER", 1], ["URU", 1], ["ECU", 1], ["TPE", 1], ["RSA", 1], ["TUN", 1], ["EGY", 1], ["BIH", 1], ["MON", 0.3]];
  const COUNTRY_TOTAL = COUNTRY_WEIGHTS.reduce((s, c) => s + c[1], 0);

  function age(state, p) {
    return START_YEAR + state.year - 1 - p.birthYear;
  }
  function growthAge(state, p) {
    return age(state, p) + (p.growth === "late" ? -2 : p.growth === "early" ? 2 : 0);
  }
  // Difficulty: scales growth, the AI pool's youth development, off-court income and injury risk.
  const DIFFICULTY = {
    easy: { label: "やさしい", grow: 1.2, aiGrow: 0.8, income: 1.3, injury: 0.8, pot: 3, desc: "成長が速く、収入が多く、AIの若手は伸びにくい" },
    normal: { label: "標準", grow: 1, aiGrow: 1, income: 1, injury: 1, pot: 0, desc: "100位から30位は普通に狙える。No.1は天井と運次第" },
    hard: { label: "難しい", grow: 0.85, aiGrow: 1.2, income: 0.8, injury: 1.15, pot: -4, desc: "成長が遅く、天井が低め。AIの若手が速く伸び、収入も少ない" },
  };
  function diff(state) { return DIFFICULTY[state.config.difficulty] || DIFFICULTY.normal; }
  // v2.2: the tour renews itself with faster-developing young AI players. The human's growth is
  // scaled so a "normal" career climbs at the same pace as before the world got younger.
  const HUMAN_GROW = 1.11;
  // Age curve of development. Flatter than a pure "prodigy" curve: a player keeps developing
  // through 22-25 (real tour peaks are 25-28), so the climb from 100 to 30 is spread over seasons.
  function ageMult(a) {
    if (a <= 17) return 0.9;
    if (a <= 19) return 0.9;
    if (a <= 21) return 0.85;
    if (a <= 23) return 0.75;
    if (a <= 25) return 0.6;
    if (a <= 27) return 0.4;
    if (a <= 29) return 0.25;
    if (a <= 32) return 0.12;
    return 0.05; // mid-thirties: training mostly slows the decline instead of adding
  }
  function headroomMult(p) {
    const hr = p.potential - TL.overall(p);
    if (hr >= 10) return 1;
    if (hr <= 0) return 0.05;
    return Math.max(0.15, hr / 10);
  }

  function randomName(rng, country) {
    const pool = D.NAMES[country] || D.NAMES.USA;
    if (pool.full) {
      const sep = pool.sep || (country === "JPN" ? " " : "");
      return rng.pick(pool.last) + sep + rng.pick(pool.first);
    }
    return rng.pick(D.INITIALS) + "." + rng.pick(pool.last);
  }
  function randomCountry(rng) {
    let r = rng.next() * COUNTRY_TOTAL;
    for (const [c, w] of COUNTRY_WEIGHTS) {
      r -= w;
      if (r <= 0) return c;
    }
    return "USA";
  }

  function buildAttrs(rng, targetOverall, style) {
    const off = D.STYLES[style] || {};
    const a = {};
    for (const k of ATTRS) a[k] = targetOverall + (off[k] || 0) + rng.gauss(0, 2.5);
    const tmp = { attrs: a };
    const shift = targetOverall - TL.overall(tmp);
    for (const k of ATTRS) a[k] = clamp(a[k] + shift, 25, 99);
    const surf = {};
    const so = D.STYLE_SURF[style] || {};
    for (const s of ["hard", "clay", "grass", "indoor"]) surf[s] = clamp(50 + (so[s] || 0) + rng.gauss(0, 5), 20, 80);
    return { attrs: a, surf };
  }

  function potentialFor(rng, ovr, a, eliteP) {
    let hr;
    if (a <= 19) hr = rng.gauss(11, 6);
    else if (a <= 22) hr = rng.gauss(7, 4);
    else if (a <= 25) hr = rng.gauss(4, 3);
    else hr = rng.gauss(1, 1.5);
    hr = Math.max(0, hr);
    if (a <= 21 && rng.chance(eliteP || 0.02)) hr += 8;
    return clamp(ovr + hr, ovr, 97);
  }

  // ---------- career statistics (broadcast-style) ----------
  const CS_KEYS = ["m", "w", "aces", "dfs", "svPts", "svWon", "firstIn", "firstWon", "secondWon", "retPts", "retWon", "bpFaced", "bpSaved", "bpChances", "bpConv", "svGames", "holds", "retGames", "breaks", "tbW", "tbL", "decW", "decL", "cbW", "cbL", "top10W", "top10L", "finalW", "finalL", "netPts", "netWon", "winners", "ues", "mpSaved", "minutes", "streak", "bestStreak", "longest", "longestMin"];
  function initCs() { const o = {}; for (const k of CS_KEYS) o[k] = 0; o.longestVs = null; return o; }
  // add one finished match to a player's running totals
  function addCs(cs, st, i, won, opp, oppRank, label, res) {
    const j = 1 - i, g = (k) => (st[k] ? st[k][i] : 0), go = (k) => (st[k] ? st[k][j] : 0);
    cs.m++; if (won) cs.w++;
    cs.aces += g("aces"); cs.dfs += g("dfs");
    cs.svPts += g("svPts"); cs.svWon += g("svWon"); cs.firstIn += g("firstIn"); cs.firstWon += g("firstWon"); cs.secondWon += g("secondWon");
    cs.retPts += go("svPts"); cs.retWon += go("svPts") - go("svWon");
    cs.bpFaced += g("bpFaced"); cs.bpSaved += g("bpSaved"); cs.bpChances += go("bpFaced"); cs.bpConv += g("breaks");
    cs.svGames += g("svGames"); cs.holds += g("holds"); cs.retGames += go("svGames"); cs.breaks += g("breaks");
    cs.tbW += g("tbW"); cs.tbL += g("tbL");
    if (res && res.deciding) { if (won) cs.decW++; else cs.decL++; }
    if (res && res.comeback) { if (won) cs.cbW++; else cs.cbL++; }
    if (oppRank && oppRank <= 10) { if (won) cs.top10W++; else cs.top10L++; }
    if (label === "決勝" || label === "優勝") { if (won) cs.finalW++; else cs.finalL++; }
    cs.netPts += g("netPts"); cs.netWon += g("netWon"); cs.winners += g("winners"); cs.ues += g("ues"); cs.mpSaved += g("mpSaved");
    const min = res && res.minutes ? res.minutes : 0;
    cs.minutes += min;
    if (min > cs.longestMin) { cs.longestMin = min; cs.longestVs = opp ? `${opp.name} ${res.score}` : null; }
    if (st.longest > cs.longest) cs.longest = st.longest;
    cs.streak = won ? Math.max(1, cs.streak + 1) : 0;
    if (cs.streak > cs.bestStreak) cs.bestStreak = cs.streak;
  }
  // derived percentages for display; null when there is no sample
  function csView(cs) {
    const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null);
    return {
      m: cs.m, w: cs.w, l: cs.m - cs.w, acesPm: cs.m ? Math.round((10 * cs.aces) / cs.m) / 10 : null, dfsPm: cs.m ? Math.round((10 * cs.dfs) / cs.m) / 10 : null,
      firstIn: pct(cs.firstIn, cs.svPts), firstWon: pct(cs.firstWon, cs.firstIn), secondWon: pct(cs.secondWon, cs.svPts - cs.firstIn), svWon: pct(cs.svWon, cs.svPts),
      hold: pct(cs.holds, cs.svGames), bpSaved: pct(cs.bpSaved, cs.bpFaced), bpFaced: cs.bpFaced, bpSavedN: cs.bpSaved,
      retWon: pct(cs.retWon, cs.retPts), bpConv: pct(cs.bpConv, cs.bpChances), bpChances: cs.bpChances, bpConvN: cs.bpConv, retGamesWon: pct(cs.breaks, cs.retGames),
      totalPts: pct(cs.svWon + cs.retWon, cs.svPts + cs.retPts), tb: [cs.tbW, cs.tbL], dec: [cs.decW, cs.decL], cb: [cs.cbW, cs.cbL], top10: [cs.top10W, cs.top10L], finals: [cs.finalW, cs.finalL],
      net: pct(cs.netWon, cs.netPts), netPts: cs.netPts, winners: cs.winners, ues: cs.ues, mpSaved: cs.mpSaved, avgMin: cs.m ? Math.round(cs.minutes / cs.m) : null, longestMin: cs.longestMin, longestVs: cs.longestVs, longest: cs.longest, bestStreak: cs.bestStreak, streak: cs.streak,
    };
  }
  // season/career aggregate for the human from match history (full stats are kept for every human match)
  function statsFromHistory(state, year) {
    const cs = initCs();
    for (const m of state.history.matches) { if (m.wo || !m.stats) continue; if (year && m.year !== year) continue; addCs(cs, m.stats, m.humanIdx, m.won, { name: m.opp }, m.oppRank, m.round, { minutes: m.minutes || 0, deciding: !!m.deciding, comeback: !!m.comeback, score: m.score }); }
    return cs;
  }
  // ---------- match sharpness and confidence (v1.8) ----------
  // sharp 0-100: how match-tight a player is. Rises with matches, decays in idle weeks and
  // fastest while injured. Below 60 it costs serve/return/rally; a player back from a long
  // layoff starts around 20-30 and needs two or three events to look like themselves again.
  // conf -10..10: recent results; feeds the clutch component (big points only).
  function sharpBonus(p) { const s = p.sharp === undefined ? 65 : p.sharp; if (s >= 55) return 0; if (s >= 40) return -0.5 * (55 - s) / 15; return -0.5 - 2.0 * (40 - s) / 40; }
  function sharpLabel(s) { return s >= 75 ? "絶好調" : s >= 60 ? "万全" : s >= 40 ? "やや鈍い" : s >= 25 ? "試合勘なし" : "長期離脱明け"; }
  function confLabel(c) { return c >= 5 ? "自信あり" : c >= 2 ? "上向き" : c > -2 ? "普通" : c > -5 ? "下向き" : "自信喪失"; }
  function sharpWeekly(state, p, played) {
    if (p.sharp === undefined) p.sharp = 65;
    if (p.conf === undefined) p.conf = 0;
    const m = p.mw || 0;
    if (m > 0) p.sharp = clamp(p.sharp + Math.min(20, 8 * m), 0, 100);
    else if (p.injury) p.sharp = clamp(p.sharp - 10, 10, 100);
    else if (played === "rest") p.sharp = clamp(p.sharp - 6, 10, 100);
    else p.sharp = clamp(p.sharp - 4, 10, 100);
    p.conf = Math.round(p.conf * 0.8 * 100) / 100;
    p.mw = 0;
  }
  // ---------- 実力 (v2.4): match strength in overall-equivalent points ----------
  // "総合" is a weighted sum of skills. 実力 adds what the match engine also uses: surface affinity
  // (weighted by how much of the season is played on each surface), match sharpness and, for the
  // human, the established style, traits, sponsor gear and a mental coach. Conversions are measured:
  // +1 on all three match components is worth about half a point of overall.
  const SURF_SHARE = { hard: 0.55, clay: 0.3, grass: 0.08, indoor: 0.07 };
  const TRAIT_EQ = { bigserve: 1.2, returner: 1.3, tiebreak: 0.9, comeback: 1.0, frontrunner: 0.7, faststart: 1.2, marathon: 1.3, claycourt: 0.6, fastcourt: 0.3, bigstage: 0.5, crowd: 0.1, giantkiller: 0.5 };
  function strengthOf(state, p, est) {
    const ovr = est ? est.overall : TL.overall(p);
    const surf = est ? est.surf : p.surf;
    let comp = 0;
    for (const [k, w] of Object.entries(SURF_SHARE)) comp += w * (((surf[k] !== undefined ? surf[k] : 50) - 50) / 50) * 6;
    comp += sharpBonus(p);
    let extra = 0;
    if (!p.isHuman && p.traits) for (const [t, l] of Object.entries(p.traits)) extra += (TRAIT_EQ[t] || 0) * TRAIT_LV[l];
    if (p.isHuman) {
      const dev = devOf(state);
      if (dev.style && dev.established) extra += DEV_STYLES[dev.style].eq;
      for (const t of traitList(state)) extra += (TRAIT_EQ[t] || 0) * TRAIT_LV[traitLevel(state, t)];
      if (state.human.coach && state.human.coach.type === "mental" && !cashOf(state).budget) extra += 0.3;
      const sp = sponsorPerks(state); extra += (sp.serve + sp.ret + sp.rally) * 0.2;
    }
    return Math.round((ovr + comp * 0.5 + extra) * 10) / 10;
  }
  function newPlayer(state, spec) {
    const rng = state.rng;
    const style = spec.style || rng.pick(["all", "server", "grinder", "clay", "grass", "mental", "baseline", "big", "counter", "all", "baseline"]);
    const built = buildAttrs(rng, spec.overall, style);
    const p = {
      id: state.nextId++, name: spec.name, country: spec.country, birthYear: spec.birthYear, hand: rng.chance(0.14) ? "L" : "R",
      style, attrs: built.attrs, surf: built.surf, potential: 0, growth: spec.growth || (rng.chance(0.2) ? "late" : rng.chance(0.25) ? "early" : "normal"),
      fatigue: rng.int(0, 20), injury: null, blockedUntil: -1, results: [], points: 0, rank: null, prevRank: null,
      isHuman: !!spec.isHuman, real: !!spec.real, retired: false, consec: 0, cs: initCs(), sharp: 65, conf: 0, mw: 0,
      stats: { w: 0, l: 0, titles: 0, prize: 0, gs: 0, m1000: 0, weeksNo1: 0, weeksTop10: 0, bestRank: null, seasons: [] },
    };
    const a = age(state, p);
    p.potential = spec.potential !== undefined ? spec.potential : potentialFor(rng, TL.overall(p), a, spec.eliteP);
    return p;
  }

  function seedResults(state, p, totalPts) {
    // Fabricate last season's results so points roll off gradually.
    if (totalPts <= 0) return;
    const rng = state.rng;
    const n = totalPts > 2000 ? 14 : totalPts > 400 ? 11 : 8;
    const weights = [];
    let sum = 0;
    for (let i = 0; i < n; i++) { const w = 0.5 + rng.next(); weights.push(w); sum += w; }
    for (let i = 0; i < n; i++) {
      const wk = 2 + Math.floor((i / n) * 43) + rng.int(0, 2);
      p.results.push({ t: state.t - 52 + wk, tid: "prev" + i, name: "昨季の結果", cat: "PREV", pts: Math.round((totalPts * weights[i]) / sum), prize: 0, round: "-" });
    }
  }

  // ---------- creation ----------
  function create(cfg) {
    const seed = cfg.seed || Math.floor(Math.random() * 4294967295);
    const state = {
      version: 1, seed, year: 1, week: 1, t: 0, nextId: 1, players: [], humanId: null, rivalId: null,
      config: { name: cfg.name || "選手", country: cfg.country || "JPN", origin: cfg.origin || "grinder", injuryRealism: cfg.injuryRealism || "standard", difficulty: DIFFICULTY[cfg.difficulty] ? cfg.difficulty : "normal" },
      rankSnaps: [], history: { tournaments: [], seasons: [], matches: [], news: [] }, lastReport: null,
      human: { money: 0, sponsorWeekly: 0, sponsorUntil: 0, wcBoostUntil: 0, lastRegion: null, focus: ["serve", "fh"], careerOver: false, epilogue: null, milestones: {},
        coach: null, physio: false, coachOffers: [], plan: "balanced", switchRule: "none", event: null, lastEventT: -99, forceRest: false, riskWeek: -1, sponsor2: { weekly: 0, until: 0 }, pressureUntil: -1, attrHist: [], seasonStartAttrs: null, exhibitionYear: 0, rivalry: { heat: 25, log: [], flags: {}, lastCross: -99 }, rivalAhead: null, focusBoostUntil: -1, assets: { jet: false, medical: false, base: false, academy: false }, investment: null, pendingPurchase: 0, sponsors: { racket: null, apparel: null, shoes: null, other: [] }, sponsorsInit: true, pendingSigning: 0, pendingBonus: 0, strategy: "big", dev: { style: null, intensity: "normal", auto: false, established: false }, actLog: [], alloc: { serve: 3, stroke: 3, ret: 3, physical: 1, mental: 0, match: 0 }, allocV2: true, gp: 0, gpLog: [], traits: [], traitLv: {}, aiTraitsInit: true, cash: { budget: false, loan: 0, loanRate: 0, unpaid: 0, family: false, crowd: false, fedYear: 0, job: null, jobUntil: 0, jobCooldown: {}, crisisYear: 0, lowYear: 0 } },
      cutoffs: {},
    };
    state.rng = new TL.RNG(seed);
    const rng = state.rng;
    const usedRanks = new Set();
    for (const r of D.REAL_PLAYERS) {
      const p = newPlayer(state, { name: r[0], country: r[1], birthYear: r[2], overall: interp(OVR_TABLE, r[3]), style: r[4], real: true });
      p.initRank = r[3];
      p.stats.bestRank = r[3];
      usedRanks.add(r[3]);
      state.players.push(p);
    }
    for (let rank = 1; state.players.length < ROSTER; rank++) {
      if (usedRanks.has(rank)) continue;
      const a = rank < 60 ? rng.int(21, 31) : rank < 150 ? rng.int(19, 32) : rng.int(18, 30);
      const country = randomCountry(rng);
      const p = newPlayer(state, { name: randomName(rng, country), country, birthYear: START_YEAR - a, overall: interp(OVR_TABLE, rank) + rng.gauss(0, 1) });
      p.initRank = rank;
      state.players.push(p);
    }
    for (const p of state.players) seedResults(state, p, interp(PTS_TABLE, p.initRank));

    // human
    const o = state.config.origin;
    let spec;
    if (o === "junior") spec = { overall: 56, birthYear: START_YEAR - 16, potential: 76 + rng.int(0, 12), money: 60, sponsor: 1.5, sponsorWeeks: 156, pts: 30, wcBoost: 104, style: "all" };
    // sponsor = 週あたりの支援（k$）。叩き上げは地元の後援会、大学経由は協会支援という設定
    // v2.8: どの出自も同じポテンシャル帯。開始能力・ポイントは「ジュニア王者がその年齢で届いている水準」に揃え、出自で天井や確率が変わらないようにする
    else if (o === "college") spec = { overall: 73, birthYear: START_YEAR - 21, potential: 76 + rng.int(0, 12), money: 25, sponsor: 0.6, sponsorWeeks: 104, pts: 300, wcBoost: 0, growth: rng.chance(0.5) ? "late" : "normal", style: "baseline" };
    else spec = { overall: 62, birthYear: START_YEAR - 18, potential: 76 + rng.int(0, 12), money: 12, sponsor: 0.5, sponsorWeeks: 156, pts: 120, wcBoost: 0, style: "grinder" };
    const generational = rng.chance(0.10);
    if (generational) spec.potential = Math.max(spec.potential, 90 + rng.int(0, 6));
    spec.potential = clamp(spec.potential + diff(state).pot, 60, 97);
    const h = newPlayer(state, { name: state.config.name, country: state.config.country, birthYear: spec.birthYear, overall: spec.overall, potential: spec.potential, style: spec.style, growth: spec.growth, isHuman: true });
    if (o === "grinder") { h.attrs.durability = clamp(h.attrs.durability + 8, 25, 99); h.attrs.clutch += 5; h.attrs.stamina += 5; }
    h.surf.hard += state.config.country === "JPN" ? 4 : 0;
    state.players.push(h);
    state.humanId = h.id;
    state.human.money = spec.money;
    state.human.sponsorWeekly = spec.sponsor;
    state.human.sponsorUntil = spec.sponsorWeeks;
    state.human.wcBoostUntil = spec.wcBoost;
    state.human.generational = generational;
    if (spec.pts) seedResults(state, h, spec.pts);

    // rival: same age, similar ceiling
    const rc = rng.pick(["ESP", "FRA", "ITA", "USA", "ARG", "GER", "AUS", "CZE", "BRA", "GBR"]);
    const rv = newPlayer(state, { name: randomName(rng, rc), country: rc, birthYear: spec.birthYear, overall: spec.overall + rng.gauss(1, 2), potential: clamp(spec.potential + rng.gauss(0, 4), 60, 97) });
    if (RIVALS) rv.isRival = true;
    state.players.push(rv);
    state.rivalId = RIVALS ? rv.id : null;
    seedResults(state, rv, Math.max(0, spec.pts + rng.int(-10, 30)));

    recomputeRanking(state);
    starterSponsors(state);
    for (const p of state.players) if (!p.isHuman && p.rank && p.rank <= 100) assignAiTraits(state, p, p.rank);
    state.rankSnaps.push(snapshot(state));
    state.human.coachOffers = genCoachOffers(state);
    normalizeNumbers(state);
    state.human.seasonStartAttrs = Object.assign({}, h.attrs);
    pushAttrHist(state);
    return state;
  }

  // ---------- team ----------
  const COACH_TYPES = {
    tech: { label: "技術コーチ", desc: "重点スキルの練習効果 ＋25%×質" },
    physical: { label: "フィジカルコーチ", desc: "身体系の成長 ×1.5、疲労回復 ＋6/週" },
    mental: { label: "メンタルコーチ", desc: "クラッチ・集中の成長 ×1.6、試合でクラッチ ＋2" },
    clay: { label: "クレー巧者", desc: "練習週にクレー適性 ＋0.25、クレーでの経験値 ×1.3" },
    grass: { label: "芝・速いコートの専門家", desc: "練習週に芝・インドア適性 ＋0.2、速いコートでの経験値 ×1.3" },
  };
  // Support staff unlocks as the career progresses (best ranking so far).
  const ROLES = {
    physio: { label: "フィジオ", unlock: 400, cost: 0.8, travels: true, desc: "怪我確率 ×0.7、疲労回復 ＋5/週。帯同（移動費がかかる）" },
    fitness: { label: "フィジカルトレーナー", unlock: 150, cost: 1.2, travels: true, desc: "身体系の練習効果 ×1.3、疲労回復 ＋4/週、怪我確率 ×0.85。帯同" },
    hitting: { label: "ヒッティングパートナー", unlock: 100, cost: 0.8, travels: true, desc: "練習効果 ＋15%、試合経験値 ＋10%。帯同" },
    agent: { label: "エージェント", unlock: 80, cost: 1.5, travels: false, desc: "スポンサー収入 ×1.3、ATP250/500のアピアランスフィー（トップ50以上）、ホームWC確率 ↑。帯同しない" },
    analyst: { label: "アナリスト", unlock: 40, cost: 1.5, travels: false, desc: "格上との対戦でサーブ・リターン ＋1（対戦データ分析）。帯同しない" },
  };
  function staffOf(state) {
    const H = state.human;
    if (!H.staff) H.staff = { physio: !!H.physio, fitness: false, hitting: false, agent: false, analyst: false };
    if (H.coach && H.coach.until === undefined) { H.coach.since = s.t; H.coach.until = s.t + 52; H.coach.years = 1; H.coach.compat = H.coach.compat || 0; H.coach.rankAtHire = 9999; }
    for (const o of H.coachOffers) if (o.years === undefined) { o.years = 2; o.compat = 0; }
    return H.staff;
  }
  function roleUnlocked(state, role) {
    const h = human(state);
    const best = h.stats.bestRank || 9999;
    return best <= ROLES[role].unlock;
  }
  function setStaff(state, role, on) {
    const st = staffOf(state);
    if (on && (!roleUnlocked(state, role) || state.human.money < 0)) return false;
    st[role] = !!on;
    if (role === "physio") state.human.physio = !!on;
    return true;
  }
  function staffCost(state) {
    const st = staffOf(state);
    let c = 0;
    for (const k of Object.keys(ROLES)) if (st[k]) c += ROLES[k].cost;
    return c;
  }
  function genCoachOffers(state) {
    const rng = state.rng;
    const offers = [];
    const types = rng.shuffle(Object.keys(COACH_TYPES)).slice(0, 3);
    const h = human(state);
    const best = h.stats.bestRank || 9999;
    for (const type of types) {
      // better-ranked players attract better coaches
      const p3 = best <= 20 ? 0.6 : best <= 60 ? 0.35 : best <= 150 ? 0.15 : 0.05;
      const p2 = best <= 150 ? 0.6 : 0.35;
      const quality = rng.chance(p3) ? 3 : rng.chance(p2) ? 2 : 1;
      const c = randomCountry(rng);
      const years = rng.chance(0.3) ? 1 : rng.chance(0.6) ? 2 : 3;
      // compatibility is hidden until 8 weeks into the contract; it scales every training gain
      const compat = clamp(Math.round(rng.gauss(0.05, 0.12) * 100) / 100, -0.2, 0.3);
      // weekly salary: journeyman ~$0.9k, established ~$2.5k, elite ~$6.5k (top coaches earn $300-500k a year)
      const baseCost = { 1: 0.9, 2: 2.5, 3: 6.5 }[quality];
      offers.push({ name: randomName(rng, c), country: c, type, quality, cost: Math.round(baseCost * (0.85 + rng.next() * 0.35) * 10) / 10, years, compat, age: rng.int(32, 58) });
    }
    return offers;
  }
  function hireCoach(state, idx) {
    const o = state.human.coachOffers[idx];
    if (!o || state.human.money < 0) return false;
    o.since = state.t;
    o.until = state.t + 52 * (o.years || 1);
    o.rankAtHire = human(state).rank || 9999;
    state.human.coach = o;
    state.human.coachOffers.splice(idx, 1);
    news(state, `${o.name} を${COACH_TYPES[o.type].label}として${o.years}年契約で雇用`);
  }
  // Early termination costs half of the remaining salary (capped at 26 weeks).
  function terminationFee(state) {
    const c = state.human.coach;
    if (!c) return 0;
    const remaining = Math.max(0, (c.until || state.t) - state.t);
    return Math.round(Math.min(26, remaining) * c.cost * 0.5 * 10) / 10;
  }
  function fireCoach(state) {
    const c = state.human.coach;
    if (!c) return 0;
    const fee = terminationFee(state);
    state.human.money -= fee;
    state.human.coach = null;
    news(state, `${c.name} との契約を解除（違約金 ${money(fee)}）`);
    return fee;
  }
  function compatKnown(state) {
    const c = state.human.coach;
    return !!c && state.t - (c.since || state.t) >= 8;
  }
  function compatLabel(c) {
    return c.compat >= 0.15 ? "とても良い" : c.compat >= 0.05 ? "良い" : c.compat > -0.05 ? "普通" : "悪い";
  }
  // Renewal terms depend on how the ranking moved during the contract.
  function renewalTerms(state) {
    const c = state.human.coach;
    const h = human(state);
    const improved = (h.rank || 9999) < (c.rankAtHire || h.rank || 9999);
    const cost = Math.round(c.cost * (improved ? 1.25 : 1.0) * 10) / 10;
    return { cost, years: 2 };
  }
  function pushAttrHist(state) {
    const h = human(state);
    const a = {};
    for (const k of ATTRS) a[k] = Math.round(h.attrs[k] * 10) / 10;
    state.human.attrHist.push({ t: state.t, year: state.year, week: state.week, ovr: Math.round(TL.overall(h) * 10) / 10, attrs: a });
    if (state.human.attrHist.length > 120) state.human.attrHist.shift();
  }

  // ---------- doubles (minimal: a side job during a tournament week) ----------
  function runDoubles(state, T, h) {
    const rng = state.rng;
    const def = T.def;
    const tierBase = { 1: 50, 2: 54, 3: 60, 4: 64, 5: 67, 6: 71, 7: 74, 8: 77, 9: 78 }[def.tier] || 60;
    const partner = tierBase + rng.gauss(0, 3);
    const mine = 0.4 * h.attrs.net + 0.3 * h.attrs.serve + 0.3 * h.attrs.return + (h.surf[T.surface] - 50) / 10;
    const team = (mine + partner) / 2;
    const rounds = def.tier === 9 ? 6 : def.tier === 8 ? 5 : 4;
    let won = 0;
    let prize = 0;
    const mult = ageMult(growthAge(state, h)) * headroomMult(h);
    for (let r = 0; r < rounds; r++) {
      const opp = tierBase + 2 * r + rng.gauss(0, 4);
      const pw = 1 / (1 + Math.exp(-(team - opp) / 6));
      h.fatigue = clamp(h.fatigue + 3 * (1.3 - h.attrs.stamina / 100), 0, 100);
      for (const k of ["net", "return"]) h.attrs[k] = clamp(h.attrs[k] + 0.06 * mult, 25, 99);
      if (!rng.chance(pw)) break;
      won++;
    }
    const idx = Math.min(def.prize.length - 1, Math.max(0, rounds - won));
    prize = Math.round((def.prize[idx] || 0) * 0.1 * 10) / 10;
    state.human.money += prize;
    h.stats.prize += prize;
    const label = won === rounds ? "優勝" : won === 0 ? "初戦敗退" : `${won}勝（${roundLabel(Math.pow(2, rounds - won))}敗退）`;
    return { partner: randomName(rng, randomCountry(rng)), won, rounds, prize, label };
  }

  // ---------- events with choices ----------
  // ---------- rivalry story ----------
  // v2.10: the rival feature is switched off (it did not add much). The same-age player is still
  // created (keeps the RNG stream) but is an ordinary AI player; flip this to bring it back.
  const RIVALS = false;
  // heat 0-100: how charged the rivalry is. Rises with head-to-heads, rank crossings and media;
  // cools with friendly choices and time. High heat makes rival matches swing more on big points.
  function rivalryLabel(heat) { return heat >= 70 ? "因縁" : heat >= 45 ? "ライバル" : heat >= 25 ? "意識" : "友好"; }
  function rivalLog(state, text, quiet) {
    const R = state.human.rivalry;
    R.log.push({ year: state.year, week: state.week, text });
    if (R.log.length > 40) R.log.shift();
    if (!quiet) news(state, text);
  }
  function rivalHeat(state, d) { const R = state.human.rivalry; R.heat = clamp(Math.round((R.heat + d) * 10) / 10, 0, 100); }
  function rivalMeet(state, T, m) {
    const rv = rival(state);
    if (!rv) return;
    const final = m.round === "優勝" || m.round === "決勝";
    rivalHeat(state, final ? 18 : T.def.tier >= 8 ? 12 : 8);
    if (final || T.def.tier >= 9) rivalLog(state, `${T.name} ${m.round}で宿敵 ${rv.name} と対戦、${m.won ? "勝利" : "敗戦"}（${m.score}）`, true);
  }
  function rivalWeekly(state, h, rv) {
    const H = state.human, R = H.rivalry;
    if (!rv || rv.retired) return;
    // drift back toward a baseline; staying neck-and-neck in the ranking keeps it warm
    rivalHeat(state, (25 - R.heat) * 0.03);
    if (rv.rank && h.rank && Math.abs(rv.rank - h.rank) <= 25) rivalHeat(state, 0.5);
    for (const r of rv.results) if (r.t === state.t && r.round === "優勝") { rivalHeat(state, r.cat === "GS" ? 10 : 4); if (r.cat === "GS" || r.cat === "M1000L" || r.cat === "M1000S" || r.cat === "FINALS") rivalLog(state, `宿敵 ${rv.name} が ${r.name} で優勝`, true); }
    const ahead = h.rank && rv.rank ? h.rank < rv.rank : null;
    if (ahead !== null) {
      if (H.rivalAhead !== null && ahead !== H.rivalAhead && state.t - R.lastCross >= 8 && state.t > 4) {
        R.lastCross = state.t;
        rivalHeat(state, 6);
        rivalLog(state, ahead ? `宿敵 ${rv.name} を追い抜いた（${h.rank}位 vs ${rv.rank}位）` : `宿敵 ${rv.name} に追い抜かれた（${rv.rank}位 vs ${h.rank}位）`);
      }
      H.rivalAhead = ahead;
    }
  }
  function maybeEvent(state, report) {
    const H = state.human;
    if (H.event) return;
    const h = human(state);
    const rng = state.rng;
    const r = h.rank || 9999;
    let ev = null;
    if (H.coach && H.coach.until !== undefined && state.t >= H.coach.until) {
      const terms = renewalTerms(state);
      ev = { id: "contract", title: `${H.coach.name} との契約満了`, text: `${COACH_TYPES[H.coach.type].label}との${H.coach.years}年契約が満了。相性は「${compatLabel(H.coach)}」。更新条件は ${money(terms.cost)}/週 × ${terms.years}年${terms.cost > H.coach.cost ? "（実績により増額）" : ""}。`, terms, choices: [
        { key: "renew", label: "更新する", desc: `${money(terms.cost)}/週、${terms.years}年。相性は引き継ぐ` },
        { key: "release", label: "契約を終える", desc: "違約金なし。候補から新しいコーチを探す" }] };
      H.event = ev; H.lastEventT = state.t; report.event = ev; report.stops.push("event");
      return;
    }
    {
      const C = cashOf(state);
      if (H.money < -150 && C.crisisYear !== state.year) {
        C.crisisYear = state.year;
        const ev = { id: "crisis", title: "キャリアの危機", text: `借金が $${Math.round(-H.money)}k に膨らんだ。このままでは遠征もチームの維持もできない。`, choices: [
          { key: "bank", label: "銀行から借りる", desc: "$100k。年約8%の利息、賞金とスポンサー収入の25%で返済" },
          ...(C.family ? [] : [{ key: "family", label: "家族に頼る", desc: "$40k。無利子" }]),
          { key: "budget", label: "節約モードで立て直す", desc: "単独遠征で移動費4割減。大会中はスタッフの効果なし" },
          { key: "retire", label: "引退する", desc: "ここでキャリアを終える" }] };
        H.event = ev; H.lastEventT = state.t; report.event = ev; report.stops.push("event");
        return;
      }
    }
    if (state.t - H.lastEventT < 5) return;
    {
      const C = cashOf(state);
      if (H.money < 10 && !C.budget && C.lowYear !== state.year && state.t > 4 && !(C.job && C.jobUntil > state.t)) {
        C.lowYear = state.year;
        const ev = { id: "lowcash", title: "資金が尽きかけている", text: `残高は $${Math.round(H.money)}k。このペースでは数週間で遠征費が払えなくなる。マイナスになると2,500km超の遠征ができず、$50k の赤字が2週続くとチームが離れる。`, choices: [
          { key: "budget", label: "節約モードに切り替える", desc: "単独遠征で移動費4割減。大会中はスタッフの効果なし、疲労と時差が増える" },
          { key: "club", label: "欧州クラブリーグに出る", desc: JOBS.club.desc },
          { key: "lesson", label: "レッスンのアルバイト", desc: JOBS.lesson.desc },
          { key: "none", label: "このまま続ける", desc: "財務タブからいつでも資金繰りできる" }] };
        H.event = ev; H.lastEventT = state.t; report.event = ev; report.stops.push("event");
        return;
      }
    }
    {
      const a = age(state, h);
      if (a >= 32 && H.retireThinkYear !== state.year && !H.retireYear && !H.retireAtSeasonEnd && !h.injury) {
        const ago = (H.rankHist || []).find((x) => x.t === state.t - 52);
        const prev = ago && ago.rank ? ago.rank : null;
        const cur = h.rank || 9999;
        const dropped = prev && cur >= prev * 2 && cur - prev >= 40;
        const fallen = (h.stats.bestRank || 9999) <= 100 && cur > 200;
        if (dropped || fallen) {
          H.retireThinkYear = state.year;
          const ev = { id: "retirethink", title: "引退を考える", text: `${a}歳。${prev ? `この1年で${prev}位から` : ""}${h.rank ? h.rank + "位" : "ランク外"}まで落ちた。最高${h.stats.bestRank || "-"}位まで上った身体は、もう以前のようには動かない。家族とコーチは「決めるのはあなた」と言っている。`, choices: [
            { key: "continue", label: "まだ続ける", desc: "もう一度上を目指す。自信 +3。来年また大きく順位を落とせば、またこの話になる" },
            { key: "farewell", label: "来季限りで引退", desc: "来季を最後のシーズンにすると表明する。ラストシーズンは全試合で勝負所 +2（声援と覚悟）" }] };
          H.event = ev; H.lastEventT = state.t; report.event = ev; report.stops.push("event");
          return;
        }
      }
    }
    const rv = rival(state), R = H.rivalry;
    const countryName = D.COUNTRIES[h.country].name;
    const topOfCountry = state.players.filter((p) => !p.retired && p.country === h.country && p.rank && p.rank < r).length < 4;
    if (h.fatigue > 70 && !h.injury && rng.chance(0.35)) {
      ev = { id: "niggle", title: "身体に違和感", text: "トレーナーは「今週は休んだほうがいい」と言っている。疲労が溜まっている。", choices: [
        { key: "rest", label: "今週は休む", desc: "次の週は休養に固定される" },
        { key: "play", label: "予定どおり出る", desc: "次の週の怪我確率が2倍" }] };
    } else if (rv && !rv.retired && R.heat >= 40 && !R.flags["media" + state.year] && rng.chance(0.08)) {
      R.flags["media" + state.year] = 1;
      ev = { id: "rivalmedia", title: `「${rv.name} との因縁」特集`, text: `メディアが${rv.name}との対戦成績や過去の発言を並べて因縁を煽っている。インタビューでどう答える？`, choices: [
        { key: "fire", label: "挑発に乗る", desc: "「次は負けない」。注目が集まりスポンサー ＋$0.3k/週（半年）、因縁 ＋15（宿敵戦の勝負所が荒れる）" },
        { key: "cool", label: "受け流す", desc: "「ただの一選手」。集中力 ＋0.5、因縁 −10" }] };
    } else if (rv && !rv.retired && state.week >= 46 && state.week <= 49 && rv.rank && h.rank && Math.abs(rv.rank - h.rank) <= 80 && !R.flags["camp" + state.year] && rng.chance(0.5)) {
      R.flags["camp" + state.year] = 1;
      ev = { id: "rivalcamp", title: `${rv.name} から合同練習の誘い`, text: `オフシーズンに2週間、${rv.name}のチームと合同で練習しないかという連絡。手の内を見せ合うことになる。`, choices: [
        { key: "join", label: "一緒に練習する", desc: "自分の最弱スキル ＋0.8（相手も強くなる）、因縁 −15" },
        { key: "solo", label: "断って独りで鍛える", desc: "クラッチ ＋0.4、因縁 ＋8" }] };
    } else if (rv && !rv.retired && rv.injury && rv.injury.weeks >= 6 && !R.flags["inj" + rv.injuredAt]) {
      R.flags["inj" + rv.injuredAt] = 1;
      ev = { id: "rivalinjury", title: `${rv.name} が長期離脱`, text: `宿敵が${rv.injury.label}で${rv.injury.weeks}週の離脱。連絡を取るか、黙って差を広げるか。`, choices: [
        { key: "visit", label: "見舞いのメッセージを送る", desc: "集中力 ＋0.5、因縁 −20" },
        { key: "focus", label: "好機とみて練習に集中", desc: "4週間、練習効果 ＋25%、因縁 ＋10" }] };
    } else if ((state.week === 4 || state.week === 36) && r <= 150 && topOfCountry && !h.injury) {
      ev = { id: "daviscup", title: `デビスカップ ${countryName}代表に招集`, text: "代表戦は国の期待を背負う。経験は得られるが、翌週の大会に疲労を持ち越す。", choices: [
        { key: "accept", label: "受ける", desc: "疲労＋15、クラッチ＋0.8、国内スポンサー ＋$0.3k/週（1年）" },
        { key: "decline", label: "辞退する", desc: h.country === "JPN" ? "国内メディアに批判される（スポンサー収入 −$0.2k/週、半年）" : "特に影響なし" }] };
    } else if (state.week >= 48 && state.week <= 50 && r <= 60 && H.exhibitionYear !== state.year && rng.chance(0.6)) {
      const fee = r <= 10 ? 300 : r <= 30 ? 120 : 50;
      H.exhibitionYear = state.year;
      ev = { id: "exhibition", title: "オフシーズンのエキシビション", text: `出場料 $${fee}k のエキシビションに招待された。`, fee, choices: [
        { key: "accept", label: "出る", desc: `＋$${fee}k、疲労 ＋12` },
        { key: "decline", label: "断って合宿に集中", desc: "この週の合宿効果 ＋20%" }] };
    } else if (h.country === "JPN" && H.milestones[100] && H.milestones[100].year === state.year && H.milestones[100].week === state.week - 0 && !H.successorDone) {
      H.successorDone = true;
      ev = { id: "successor", title: "「西織の後継者」報道", text: "トップ100入りで国内メディアが一斉に報じた。スポンサーは注目を利用したがっている。", choices: [
        { key: "embrace", label: "期待に応える", desc: "スポンサー ＋$1.0k/週（1年）。半年間、重圧でクラッチ −3" },
        { key: "ignore", label: "受け流す", desc: "変化なし" }] };
    } else if (r <= 100 && H.money >= 800 && !H.investment && rng.chance(0.04)) {
      const amount = Math.round(H.money * 0.3);
      const label = rng.pick(["テニスアパレルの新ブランド", "地元のスポーツクラブ", "元選手が立ち上げるアカデミー", "スポーツテック企業"]);
      ev = { id: "invest", title: "投資の持ちかけ", text: `エージェント経由で「${label}」への出資話。$${amount}k を1年。うまくいけば倍近く、外せばほぼ消える。`, amount, label, choices: [
        { key: "yes", label: "出資する", desc: `$${amount}k を1年間拘束。1年後に 45% で約1.8倍、35% で微増、20% でほぼ損失` },
        { key: "no", label: "見送る", desc: "変化なし" }] };
    } else if (state.week === 47 && rng.chance(0.5) && H.money > 10) {
      ev = { id: "camp", title: "クレー強化合宿の誘い", text: "スペインのアカデミーから2週間の合宿の誘い。費用 $6k。", choices: [
        { key: "accept", label: "参加する", desc: "クレー適性 ＋4、資金 −$6k、疲労 ＋10" },
        { key: "decline", label: "見送る", desc: "変化なし" }] };
    }
    if (ev) { H.event = ev; H.lastEventT = state.t; report.event = ev; report.stops.push("event"); }
  }
  function resolveEvent(state, key) {
    const H = state.human;
    const ev = H.event;
    if (!ev) return null;
    const h = human(state);
    let text = "";
    const c = ev.choices.find((x) => x.key === key) || ev.choices[0];
    switch (ev.id + ":" + c.key) {
      case "niggle:rest": H.forceRest = true; text = "次の週は休養に充てる。"; break;
      case "niggle:play": H.riskWeek = state.t; text = "違和感を抱えたまま出場する。"; break;
      case "daviscup:accept": h.fatigue = clamp(h.fatigue + 15, 0, 100); h.attrs.clutch = clamp(h.attrs.clutch + 0.8, 25, 99); H.sponsor2 = { weekly: (H.sponsor2.weekly || 0) + 0.3, until: state.t + 52 }; text = "代表戦を戦った。重圧の中での試合経験が残った。"; break;
      case "daviscup:decline": if (h.country === "JPN") { H.sponsor2 = { weekly: (H.sponsor2.weekly || 0) - 0.2, until: state.t + 26 }; text = "辞退を批判する記事が出た。"; } else text = "辞退した。"; break;
      case "sponsor:accept": H.money += ev.lump; H.sponsor2 = { weekly: (H.sponsor2.weekly || 0) + ev.lump / 40, until: state.t + 52 }; h.attrs.focus = clamp(h.attrs.focus - 1, 25, 99); text = "契約した。撮影やイベントの予定が増えた。"; break;
      case "sponsor:decline": h.attrs.focus = clamp(h.attrs.focus + 1, 25, 99); text = "断って練習に集中した。"; break;
      case "exhibition:accept": H.money += ev.fee; h.fatigue = clamp(h.fatigue + 12, 0, 100); text = "エキシビションに出場して出場料を得た。"; break;
      case "exhibition:decline": H.campBonus = true; text = "合宿に集中する。"; break;
      case "successor:embrace": H.sponsor2 = { weekly: (H.sponsor2.weekly || 0) + 1.0, until: state.t + 52 }; H.pressureUntil = state.t + 26; text = "インタビューに応え、期待を背負うことにした。"; break;
      case "successor:ignore": text = "受け流した。"; break;
      case "contract:renew": H.coach.cost = ev.terms.cost; H.coach.years = ev.terms.years; H.coach.until = state.t + 52 * ev.terms.years; H.coach.rankAtHire = h.rank || 9999; text = "契約を更新した。"; break;
      case "contract:release": text = `${H.coach.name} と別れた。`; H.coach = null; break;
      case "lowcash:budget": case "crisis:budget": setBudget(state, true); text = "節約モードに切り替えた。しばらくは一人で回る。"; break;
      case "lowcash:club": text = useFunding(state, "club") || "今は引き受けられない。"; break;
      case "lowcash:lesson": text = useFunding(state, "lesson") || "今は引き受けられない。"; break;
      case "lowcash:none": text = "このまま続ける。"; break;
      case "crisis:bank": text = useFunding(state, "bank") || "これ以上は借りられない。"; break;
      case "crisis:family": text = useFunding(state, "family") || "家族にはもう頼れない。"; break;
      case "crisis:retire": H.event = null; retireNow(state); text = "ラケットを置くことにした。"; break;
      case "retirethink:continue": h.conf = clamp((h.conf || 0) + 3, -10, 10); text = "まだ終われない。もう一度コートに戻る。"; break;
      case "retirethink:farewell": H.retireYear = state.year + 1; news(state, `${h.name} が来季限りでの引退を表明`); text = "来季を最後のシーズンにすると発表した。"; break;
      case "limit:continue": h.fragile = true; text = "リハビリに入る。身体と相談しながら続ける。"; break;
      case "limit:retire": H.retireAtSeasonEnd = true; text = "今シーズン限りでの引退を決めた。"; break;
      case "rivalmedia:fire": H.sponsor2 = { weekly: (H.sponsor2.weekly || 0) + 0.3, until: state.t + 26 }; rivalHeat(state, 15); text = "「次は必ず勝つ」と答えた。記事は大きく取り上げられた。"; break;
      case "rivalmedia:cool": h.attrs.focus = clamp(h.attrs.focus + 0.5, 25, 99); rivalHeat(state, -10); text = "淡々と答えた。話題はすぐに消えた。"; break;
      case "rivalcamp:join": { const rv = rival(state); const weakest = ATTRS.reduce((a, k) => (h.attrs[k] < h.attrs[a] ? k : a), ATTRS[0]); h.attrs[weakest] = clamp(h.attrs[weakest] + 0.8, 25, 99); if (rv) { const k2 = ATTRS.reduce((a, k) => (rv.attrs[k] < rv.attrs[a] ? k : a), ATTRS[0]); rv.attrs[k2] = clamp(rv.attrs[k2] + 0.6, 25, 99); } rivalHeat(state, -15); text = `2週間打ち合った。${ATTR_LABEL[weakest]}に手応えがある。`; break; }
      case "rivalcamp:solo": h.attrs.clutch = clamp(h.attrs.clutch + 0.4, 25, 99); rivalHeat(state, 8); text = "独りでコートに立ち続けた。"; break;
      case "rivalinjury:visit": h.attrs.focus = clamp(h.attrs.focus + 0.5, 25, 99); rivalHeat(state, -20); text = "短い返事が来た。「戻ったら、また」。"; break;
      case "rivalinjury:focus": H.focusBoostUntil = state.t + 4; rivalHeat(state, 10); text = "練習量を上げた。相手が戻る前に差をつける。"; break;
      case "spexpire:renew": signSponsor(state, ev.cat, ev.brand, 1); text = "契約を更新した。"; break;
      case "spexpire:release": text = "更新しなかった。"; break;
      case "invest:yes": H.money -= ev.amount; H.investment = { amount: ev.amount, label: ev.label, until: state.t + 52 }; text = `${ev.label} に $${ev.amount}k を出資した。結果は1年後。`; break;
      case "invest:no": text = "見送った。"; break;
      case "camp:accept": H.money -= 6; h.surf.clay = clamp(h.surf.clay + 4, 20, 85); h.fatigue = clamp(h.fatigue + 10, 0, 100); text = "スペインで2週間クレーを打ち込んだ。"; break;
      default: text = "見送った。";
    }
    news(state, `${ev.title}: ${c.label}`);
    if (ev.id.indexOf("rival") === 0) rivalLog(state, `${ev.title} → ${c.label}`, true);
    H.event = null;
    return text;
  }

  // ---------- ranking ----------
  function recomputeRanking(state) {
    for (const p of state.players) {
      if (p.retired) continue;
      p.results = p.results.filter((r) => r.t > state.t - 52);
      const sorted = p.results.slice().sort((a, b) => b.pts - a.pts);
      let pts = 0;
      let n = 0;
      for (const r of sorted) {
        if (r.cat === "FINALS") { pts += r.pts; continue; }
        if (n < 19) { pts += r.pts; n++; }
      }
      p.points = pts;
      p.prevRank = p.rank;
    }
    const act = state.players.filter((p) => !p.retired && p.points > 0);
    act.sort((a, b) => b.points - a.points || TL.overall(b) - TL.overall(a));
    for (const p of state.players) if (!p.retired) p.rank = null;
    act.forEach((p, i) => (p.rank = i + 1));
  }
  function snapshot(state) {
    const m = {};
    for (const p of state.players) if (!p.retired && p.rank) m[p.id] = p.rank;
    return m;
  }
  function rank6(state, p) {
    const snaps = state.rankSnaps;
    const s = snaps.length >= 6 ? snaps[snaps.length - 6] : snaps[0];
    const r = s ? s[p.id] : undefined;
    return r || p.rank || 9999;
  }

  // ---------- calendar ----------
  function weekTournaments(state, weekOverride, yearOverride) {
    const week = weekOverride || state.week, year = yearOverride || state.year;
    const list = [];
    for (const c of D.ATP_CALENDAR) {
      if (c.week !== week) continue;
      list.push({ id: c.id + "-" + year, tid: c.id, name: c.name, cat: c.cat, def: D.CATS[c.cat], surface: c.surface, country: c.country, region: D.COUNTRIES[c.country].region, isAtp: true });
    }
    const lower = D.LOWER_CALENDAR[week] || [];
    lower.forEach((l, i) => {
      const def = D.CATS[l[0]];
      const city = D.cityFor(l[1], week + i + year);
      list.push({ id: "L" + week + "-" + i + "-" + year, tid: "L" + week + "-" + i, name: city + " " + def.short, cat: l[0], def, surface: l[2], country: l[1], region: D.COUNTRIES[l[1]].region, isAtp: false });
    });
    list.sort((a, b) => b.def.tier - a.def.tier);
    return list;
  }

  function directCut(T) {
    return T.def.draw - T.def.q - T.def.wc;
  }
  // Typical ranking of the last direct acceptance (lower tiers are relative to who enters).
  const CUT = { CH175: 110, CH125: 170, CH100: 200, CH75: 250, CH50: 290, M25: 420, M15: 600 };
  // ATP level: typical last direct acceptance (top players skip 250s, so the cut is far below the draw size).
  const ATP_CUT = { GS: 108, M1000L: 82, M1000S: 48, A500L: 62, A500: 52, A250: 92, A250B: 98 };
  function lowerCut(T) {
    return CUT[T.cat] || directCut(T);
  }
  // Expected cutoff: last year's actual cutoff for this event if known, else the table.
  function expectedCut(state, T) {
    if (T.def.tier <= 5) return lowerCut(T);
    const rec = state.cutoffs && state.cutoffs[T.tid];
    return rec || ATP_CUT[T.cat] || directCut(T);
  }
  function qualSize(T) {
    return T.def.q * Math.pow(2, T.def.qRounds);
  }
  // how far below the direct cutoff the qualifying field reaches (GS quali ~250, ATP 250 quali ~200)
  function qualReach(T) {
    return Math.max(qualSize(T) * 1.2, 110);
  }

  // Human preview of entry status for a tournament.
  function humanStatus(state, T) {
    const h = human(state);
    const r = rank6(state, h);
    const home = T.country === h.country;
    const D0 = directCut(T);
    if (T.cat === "FINALS") return { code: r <= 8 ? "direct" : "none", label: r <= 8 ? "出場権あり" : "上位8名のみ" };
    if (state.human.money < 0 && distKm(state.human.loc || h.country, T.country) > 2500) return { code: "money", label: "資金不足（長距離の移動ができない）" };
    if (T.def.tier <= 5) {
      const c = lowerCut(T);
      if (r <= 50) return { code: "none", label: "トップ50はツアー大会のみ（出場しない）" };
      if (T.def.tier <= 3 && r <= 100) return { code: "none", label: "トップ100は CH50/75 に出ない" };
      if (T.def.tier <= 2 && r <= 200) return { code: "none", label: "ITFは200位以下の大会" };
      if (r <= 100 && T.def.tier >= 4) return { code: "direct", label: "本戦ダイレクトイン（格下。ATP大会がない週の選択肢）" };
      if (r <= c) return { code: "direct", label: "本戦ダイレクトイン見込み" };
      if (r <= c * 1.2) return { code: "bubble", label: "当落線上" };
      if (T.def.tier <= 2) return { code: "wc", label: home ? "ワイルドカード確実（ホーム）" : T.cat === "M15" ? "ワイルドカード枠あり" : "ワイルドカード次第" };
      return { code: "wc", label: home ? "ワイルドカード申請（ホーム・有力）" : "ワイルドカード次第（低確率）" };
    }
    const cut = expectedCut(state, T);
    if (r <= cut * 0.95) return { code: "direct", label: `本戦ダイレクトイン見込み（昨年の当落線 ${cut}位）` };
    if (r <= cut * 1.15) return { code: "bubble", label: `当落線上（本戦か予選、当落線 ${cut}位前後）` };
    if (T.def.q > 0 && r <= cut + qualReach(T)) return { code: "qual", label: "予選から" };
    if (T.def.tier <= 2) return { code: "wc", label: home ? "ワイルドカード確実（ホーム）" : T.cat === "M15" ? "ワイルドカード枠あり" : "ワイルドカード次第" };
    if (home) return { code: "wc", label: state.human.wcBoostUntil > state.t ? "ワイルドカード有力（ホーム・注目選手）" : "ワイルドカード申請（ホーム）" };
    if (r <= 300) return { code: "wc", label: "ワイルドカード次第（ごく低確率）" };
    return { code: "none", label: "ランキング不足" };
  }

  // ---------- AI entry decisions ----------
  function aiWants(state, p, T, rankNow) {
    const rng = state.rng;
    const tier = T.def.tier;
    const r = rankNow;
    const D0 = directCut(T);
    const home = T.country === p.country;
    if (T.cat === "FINALS") return false;
    if (tier <= 2) return r > CUT.CH50 || r === 9999 ? true : r > 200 && rng.chance(0.3);
    if (tier <= 5) {
      const c = lowerCut(T);
      if (r <= 50) return false;
      if (r <= 100) return tier >= 4 && rng.chance(home ? 0.35 : 0.12);
      return r <= c + 40 || (r <= c + 100 && rng.chance(0.35));
    }
    // ATP level: entry is driven by the expected cutoff, and each player commits to one event per tier per week.
    const cut = expectedCut(state, T);
    if (r <= cut * 1.05) {
      if (tier === 6 && r <= 10 && !home) return rng.chance(0.15);
      if (tier === 6 && r <= 30 && !home) return rng.chance(0.5);
      if (tier === 7 && r <= 5 && !home) return rng.chance(0.6);
      return rng.chance(0.92);
    }
    if (T.def.q > 0 && r <= cut + qualReach(T) && r <= 330) {
      if (tier >= 8) return rng.chance(0.8);
      return rng.chance(0.5);
    }
    return false;
  }

  function wantsRest(state, p) {
    const rng = state.rng;
    if (p.fatigue > 75) return rng.chance(0.85);
    if (p.fatigue > 60) return rng.chance(0.5);
    if (p.consec >= 4) return rng.chance(0.65);
    if (p.consec >= 3) return rng.chance(0.35);
    return rng.chance(0.08);
  }

  // ---------- bracket ----------
  function bracketOrder(n) {
    let order = [1, 2];
    while (order.length < n) {
      const m = order.length * 2 + 1;
      const next = [];
      for (const s of order) next.push(s, m - s);
      order = next;
    }
    return order;
  }
  function roundLabel(playersInRound) {
    return playersInRound === 2 ? "決勝" : playersInRound === 4 ? "準決勝" : playersInRound === 8 ? "準々決勝" : "R" + playersInRound;
  }

  // Is this human match worth watching live? (settings come from the UI via action.watch)
  function isImportant(state, T, label, a, b, qualifying) {
    const w = state._watch;
    if (!w || !w.enabled) return false;
    const o = a.isHuman ? b : a;
    if (qualifying) return (o.isRival && w.rival) || (o.rank && o.rank <= 10 && w.top10);
    if (T.cat === "FINALS" && w.finals) return true;
    if (T.def.tier === 9 && w.gs) return true;
    if (o.isRival && w.rival) return true;
    if (o.rank && o.rank <= 10 && w.top10) return true;
    if (label === "決勝" && T.def.tier >= 6 && w.titleMatch) return true;
    if (T.def.tier === 8 && label === "準決勝" && w.titleMatch) return true;
    return false;
  }
  // Plays one match; yields an interactive match object when the human should watch it.
  function* playOne(state, T, a, b, label, qualifying) {
    const rng = state.rng;
    const hum = a.isHuman || b.isHuman;
    // Grand Slam qualifying is best-of-three; only the main draw is best-of-five.
    const mo = Object.assign({ rng, surface: T.surface, bo5: T.def.bo5 && !qualifying, finalTb10: T.def.tier === 9, log: hum }, hum ? matchOpts(state, a, b, T) : {});
    // AI traits apply in every match (AI vs AI too), with the same situational context
    if (a.traits || b.traits) {
      mo.traits = [0, 1].map((i) => { const p = [a, b][i]; return p.isHuman ? (mo.traits && mo.traits[i]) || {} : p.traits || {}; });
      const t = mo.tctx || { bigStage: T.def.tier >= 8 || T.cat === "FINALS", home: [false, false], underdog: [false, false] };
      for (const i of [0, 1]) { const p = [a, b][i], o = [a, b][1 - i]; if (!p.isHuman) { t.home[i] = T.country === p.country; t.underdog[i] = (o.rank || 9999) + 30 < (p.rank || 9999); } }
      mo.tctx = t;
    }
    const sb = [sharpBonus(a), sharpBonus(b)];
    mo.bonus = [0, 1].map((i) => { const b = (mo.bonus && mo.bonus[i]) || {}; return { serve: (b.serve || 0) + sb[i], ret: (b.ret || 0) + sb[i], rally: (b.rally || 0) + sb[i] }; });
    mo.clutch = [0, 1].map((i) => ((mo.clutch && mo.clutch[i]) || 0) + ([a, b][i].conf || 0) * 0.2);
    if (hum && isImportant(state, T, label, a, b, qualifying)) {
      const m = TL.Match.create(a, b, mo);
      yield { type: "match", match: m, T, round: label, a, b };
      return m.result || m.finish();
    }
    return TL.Match.play(a, b, mo);
  }

  // entrants sorted by rank (best first). Returns {results: Map id->{roundIdx, bye, won}, winner, finalist, matches}
  function* playKnockout(state, T, entrants, opts) {
    const rng = state.rng;
    const n = entrants.length;
    if (n < 2) return { placements: new Map(), winner: entrants[0] || null, matches: [], rounds: 0 };
    let N = 2;
    while (N < Math.max(n, opts.drawSize || 0)) N *= 2;
    const seedsN = Math.min(n, N >= 128 ? 32 : N >= 48 ? 16 : N >= 16 ? 8 : N >= 8 ? 4 : 2);
    const order = bracketOrder(N);
    const B = N - n;
    const slots = new Array(N).fill(undefined);
    const unseeded = rng.shuffle(entrants.slice(seedsN));
    let ui = 0;
    for (let k = 0; k < N; k++) {
      const o = order[k];
      if (o <= seedsN) slots[k] = entrants[o - 1];
      else if (o > N - B) slots[k] = null; // bye
      else slots[k] = unseeded[ui++];
    }
    const placements = new Map();
    const hadBye = new Set();
    const matches = [];
    const capture = !opts.qualifying && entrants.some((p) => p.isHuman);
    const bracket = capture ? { N, seeds: seedsN, slots: slots.map((p) => (p ? { id: p.id, name: p.name, rank: p.rank, country: p.country, seed: entrants.indexOf(p) < seedsN ? entrants.indexOf(p) + 1 : 0, human: !!p.isHuman, rival: !!p.isRival } : null)), rounds: [] } : null;
    let cur = slots;
    let r = 0;
    const totalRounds = Math.log2(N);
    while (cur.length > 1) {
      const next = [];
      const label = opts.qualifying ? (r === totalRounds - 1 ? "予選最終ラウンド" : `予選${r + 1}回戦`) : roundLabel(cur.length);
      const roundRec = bracket ? [] : null;
      if (bracket) bracket.rounds.push({ label, matches: roundRec });
      for (let i = 0; i < cur.length; i += 2) {
        const a = cur[i], b = cur[i + 1];
        if (a === null && b === null) { next.push(null); if (roundRec) roundRec.push(null); continue; }
        if (a === null || b === null) { const w = a || b; hadBye.add(w.id); next.push(w); if (roundRec) roundRec.push({ a: a ? a.id : null, b: b ? b.id : null, w: w.id, score: "bye" }); continue; }
        // injured during this event -> withdraws (walkover)
        const wo = a.injury && a.injuredAt === state.t ? a : b.injury && b.injuredAt === state.t ? b : null;
        if (wo) {
          const w = wo === a ? b : a;
          placements.set(wo.id, { roundIdx: r, bye: hadBye.has(wo.id), won: false, wo: true });
          matches.push({ round: label, roundIdx: r, a, b, w, res: { winnerIdx: w === a ? 0 : 1, sets: [], score: "W/O（" + wo.name + " 棄権）", log: [], stats: null, names: [a.name, b.name] }, wo: true });
          if (wo.isHuman || w.isHuman) state.history.matches.push({ t: state.t, year: state.year, week: state.week, tour: T.name, cat: T.def.short, surface: T.surface, round: label, opp: (wo.isHuman ? w : wo).name, oppRank: (wo.isHuman ? w : wo).rank, oppId: (wo.isHuman ? w : wo).id, won: w.isHuman, score: wo.isHuman ? "棄権" : "W/O", log: [], stats: null, humanIdx: a.isHuman ? 0 : 1, wo: true });
          if (T.def.tier >= 8 || wo.isHuman || wo.isRival) news(state, `${T.name} ${label}: ${wo.name} が ${wo.injury.label} で棄権`);
          if (roundRec) roundRec.push({ a: a.id, b: b.id, w: w.id, score: "W/O" });
          next.push(w);
          continue;
        }
        const res = yield* playOne(state, T, a, b, label, !!opts.qualifying);
        const w = res.winnerIdx === 0 ? a : b, l = res.winnerIdx === 0 ? b : a;
        if (roundRec) roundRec.push({ a: a.id, b: b.id, w: w.id, score: res.score });
        afterMatch(state, w, l, res, T, label);
        placements.set(l.id, { roundIdx: r, bye: hadBye.has(l.id), won: false, firstMatch: !placements.has(l.id) });
        matches.push({ round: label, roundIdx: r, a, b, w, res });
        next.push(w);
      }
      cur = next;
      r++;
    }
    const winner = cur[0];
    placements.set(winner.id, { roundIdx: r, bye: hadBye.has(winner.id), won: true });
    return { placements, winner, matches, rounds: r, N, bracket };
  }

  function matchOpts(state, a, b, T) {
    const H = state.human;
    const idx = a.isHuman ? 0 : 1;
    const plans = ["balanced", "balanced"], rules = ["none", "none"], clutch = [0, 0];
    plans[idx] = H.plan || "balanced";
    rules[idx] = H.switchRule || "none";
    if (H.coach && H.coach.type === "mental" && !cashOf(state).budget) clutch[idx] += 2; // a coach who stays home cannot help on court
    if (H.pressureUntil > state.t) clutch[idx] -= 3;
    if (H.retireYear && state.year === H.retireYear) clutch[idx] += 2; // farewell season
    clutch[idx] -= sponsorPerks(state).focus * 3; // media obligations: slightly worse on big points
    const edge = [0, 0];
    const me = a.isHuman ? a : b, opp = a.isHuman ? b : a;
    if (staffOf(state).analyst && (opp.rank || 9999) < (me.rank || 9999)) edge[idx] = 1;
    const sp = sponsorPerks(state);
    const bonus = [null, null]; bonus[idx] = { serve: sp.serve, ret: sp.ret, rally: sp.rally };
    const dev = devOf(state);
    const traits = [null, null]; traits[idx] = Object.assign({}, traitLevels(state));
    const tctx = { bigStage: !!(T && (T.def.tier >= 8 || T.cat === "FINALS")), home: [false, false], underdog: [false, false] };
    tctx.home[idx] = !!(T && T.country === me.country);
    tctx.underdog[idx] = (opp.rank || 9999) + 30 < (me.rank || 9999);
    if (dev.style && dev.established) {
      const sb = DEV_STYLES[dev.style].bonus;
      bonus[idx].serve += sb.serve || 0; bonus[idx].ret += sb.ret || 0; bonus[idx].rally += (sb.rally || 0) + (sb.clay && T && T.surface === "clay" ? sb.clay : 0);
      clutch[idx] += sb.clutch || 0;
    }
    // charged rivalry: big points swing more for both (clutch difference matters more)
    if (opp.isRival && H.rivalry && H.rivalry.heat >= 60) { const k = (H.rivalry.heat - 60) / 40; clutch[idx] += (me.attrs.clutch - opp.attrs.clutch) * 0.15 * k; }
    return { plans, rules, clutch, edge, bonus, traits, tctx };
  }
  // per-match consequences: stats, fatigue, xp, injury roll
  function afterMatch(state, w, l, res, T, label) {
    const rng = state.rng;
    w.stats.w++; l.stats.l++;
    if (!w.cs) w.cs = initCs(); if (!l.cs) l.cs = initCs();
    w.mw = (w.mw || 0) + 1; l.mw = (l.mw || 0) + 1;
    const wr = w.rank || 9999, lr = l.rank || 9999;
    w.conf = clamp((w.conf || 0) + (lr < wr ? 2 : 1), -10, 10);
    l.conf = clamp((l.conf || 0) - (wr > lr + 30 ? 2 : 1), -10, 10);
    addCs(w.cs, res.stats, res.winnerIdx, true, l, l.rank, label, res);
    addCs(l.cs, res.stats, 1 - res.winnerIdx, false, w, w.rank, label, res);
    const sets = res.sets.length;
    for (const p of [w, l]) {
      const i = p === w ? res.winnerIdx : 1 - res.winnerIdx;
      const fm = res.fatigueMult ? res.fatigueMult[i] : 1;
      const fat = (5 + 1.2 * sets + (T.def.bo5 ? 2 : 0)) * (1.3 - p.attrs.stamina / 100) * fm;
      p.fatigue = clamp(p.fatigue + fat, 0, 100);
      const opp = p === w ? l : w;
      const oppBetter = (opp.rank || 9999) < (p.rank || 9999);
      let mult = ageMult(growthAge(state, p)) * headroomMult(p) * (oppBetter ? 1.5 : 1) * (p === w ? 1.15 : 1);
      if (p.isHuman && state.human.coach) {
        const ct = state.human.coach.type;
        if ((ct === "clay" && T.surface === "clay") || (ct === "grass" && (T.surface === "grass" || T.surface === "indoor"))) mult *= 1.3;
      }
      if (p.isHuman && staffOf(state).hitting) mult *= 1.1;
      if (!p.isHuman) { const ga = growthAge(state, p); mult *= ga <= 20 ? 2.0 : ga <= 22 ? 1.6 : ga <= 24 ? 1.25 : 1; } // young AI players learn fast from matches
      mult *= p.isHuman ? diff(state).grow * HUMAN_GROW : diff(state).aiGrow;
      for (const k of ["serve", "return", "fh", "bh", "speed", "clutch"]) p.attrs[k] = clamp(p.attrs[k] + 0.03 * mult * (0.6 + rng.next()), 25, 99);
      p.surf[T.surface] = clamp(p.surf[T.surface] + 0.18, 20, 85); // same rate for the human and the AI
      rollInjury(state, p, T);
    }
    if (w.isHuman || l.isHuman) {
      const h = w.isHuman ? w : l, o = w.isHuman ? l : w;
      state.history.matches.push({ t: state.t, year: state.year, week: state.week, tour: T.name, cat: T.def.short, surface: T.surface, round: label, opp: o.name, oppRank: o.rank, oppId: o.id, won: w.isHuman, score: res.score, log: res.log, stats: res.stats, humanIdx: res.names[0] === h.name ? 0 : 1, minutes: res.minutes, deciding: !!res.deciding, comeback: !!res.comeback });
      if (state.history.matches.length > 400) state.history.matches.splice(0, state.history.matches.length - 400);
    }
    if (T.def.tier >= 8 && (w.rank || 9999) > (l.rank || 9999) + 40 && (l.rank || 9999) <= 20) {
      news(state, `${T.name} ${label}: ${w.name}(${w.rank || "-"}位) が ${l.name}(${l.rank}位) を ${res.score} で破る金星`);
    }
  }

  // Injury risk factors shared by match and off-court rolls.
  function injuryFactor(state, p, onTour) {
    let f = state.config.injuryRealism === "low" ? 0.5 : 1;
    const a = age(state, p);
    if (a >= 33) f *= 1.8; else if (a >= 30) f *= 1.4;
    if (p.fragile) f *= 1.3;
    if (p.isHuman) { f *= diff(state).injury * sponsorPerks(state).injury * traitOffCourt(state, "ironbody") || 1; if (assetsOf(state).medical) f *= 0.7; const st = staffOf(state); const away = onTour && cashOf(state).budget; if (st.physio && !away) f *= 0.7; if (st.fitness && !away) f *= 0.85; if (state.human.riskWeek === state.t) f *= 2; }
    return f * (1 + Math.max(0, p.fatigue - 45) / 20) * (1.7 - p.attrs.durability / 100);
  }
  // Target (calibrated with tools/injury_stats.js): ~1 injury per player-season, ~4 weeks lost, ~11% chance of a 10+ week layoff.
  function rollInjury(state, p, T, base) {
    if (p.injury) return;
    const rng = state.rng;
    const prob = (base || 0.014) * injuryFactor(state, p, !!T);
    if (!rng.chance(prob)) return;
    const r = rng.next();
    let inj;
    const a = age(state, p);
    if (r < 0.55) inj = { weeks: rng.int(1, 2), label: rng.pick(["足首の捻挫", "腹筋の張り", "手首の炎症", "背中の張り", "太ももの張り"]), sev: 1 };
    else if (r < 0.88) inj = { weeks: rng.int(3, 8), label: rng.pick(["肘の炎症", "ハムストリング損傷", "腹斜筋の損傷", "膝の炎症", "肩の炎症", "足底筋膜炎"]), sev: 2 };
    else {
      inj = { weeks: rng.int(10, 22), label: rng.pick(["手首の手術", "膝の手術", "股関節の手術", "腰椎のヘルニア", "足首の靭帯断裂", "肘の手術"]), sev: 3 };
      const before = Object.assign({}, p.attrs);
      for (const k of ["speed", "stamina", "power"]) p.attrs[k] = clamp(p.attrs[k] - rng.int(1, 3), 25, 99);
      p.attrs.durability = clamp(p.attrs.durability - 2, 25, 99);
      inj.loss = {};
      for (const k of ["speed", "stamina", "power", "durability"]) if (before[k] !== p.attrs[k]) inj.loss[k] = Math.round(p.attrs[k] - before[k]);
      if (a >= 30) for (const k of PHYS) p.attrs[k] = clamp(p.attrs[k] - 1, 25, 99);
      if (p.isHuman && a >= 30 && !state.human.limitAsked) {
        state.human.limitAsked = true;
        state.human.event = { id: "limit", title: "身体の限界", text: `${inj.label}。${a}歳での大怪我は、以前のようには戻らないかもしれない。医師は「続けるなら身体に負担の少ないスケジュールで」と言っている。`, choices: [
          { key: "continue", label: "現役を続ける", desc: "復帰後は怪我しやすくなり（×1.3）、身体能力の衰えが加速する" },
          { key: "retire", label: "引退を決める", desc: "今シーズン限りで引退。キャリアの総括へ" }] };
        state.human.lastEventT = state.t;
      }
    }
    if (p.isHuman && assetsOf(state).medical && inj.sev >= 2) inj.weeks = Math.max(1, Math.round(inj.weeks * 0.8));
    p.injury = inj;
    p.injuredAt = state.t;
    if (p.isHuman) { state.human.injuryLog = state.human.injuryLog || []; state.human.injuryLog.push({ year: state.year, week: state.week, label: inj.label, weeks: inj.weeks, sev: inj.sev, where: T ? T.name : "練習中" }); }
    if (p.isHuman || (p.rank && p.rank <= 10) || p.isRival || inj.sev === 3 && p.rank && p.rank <= 50) news(state, `${p.name} が ${inj.label} で ${inj.weeks}週間の離脱${T ? "（" + T.name + "）" : "（練習中）"}`);
  }

  // rehab and medical bills per injured week; top players pay for specialists, lower-ranked
  // players use federation and public care; the medical contract halves them
  function rehabWeekly(state) {
    const h = human(state), sev = h.injury ? h.injury.sev || 2 : 0, r = h.rank || 9999;
    const rehabScale = r <= 50 ? 1 : r <= 200 ? 0.4 : 0.2;
    return sev ? Math.round((sev === 3 ? 10 : sev === 2 ? 5 : 2) * rehabScale * (assetsOf(state).medical ? 0.5 : 1) * sponsorPerks(state).rehab * 10) / 10 : 0;
  }
  function money(k) { return k >= 1000 ? "$" + (k / 1000).toFixed(2) + "M" : "$" + Math.round(k) + "k"; }
  function news(state, text) {
    state.history.news.push({ t: state.t, year: state.year, week: state.week, text });
    if (state.history.news.length > 300) state.history.news.splice(0, state.history.news.length - 300);
  }

  // ---------- big-event record (v2.5): Grand Slams, Masters 1000 and the Finals, per year ----------
  // p.big[year] = one character per event in calendar order (14 events), "." = not played.
  // Characters: W F S(emi) Q(uarter) 6(R16) 3(R32) 4(R64) 8(R128) R(round robin) q(lost in qualifying)
  const BIG_KEEP_YEARS = 25;
  const BIG_EVENTS = D.ATP_CALENDAR.filter((c) => D.CATS[c.cat] && D.CATS[c.cat].tier >= 8).map((c) => c.id);
  const BIG_ENC = { W: "W", F: "F", SF: "S", QF: "Q", R16: "6", R32: "3", R64: "4", R128: "8", RR: "R", Q: "q" };
  const BIG_DEC = Object.fromEntries(Object.entries(BIG_ENC).map(([k, v]) => [v, k]));
  function bigGet(p, y, tid) { const row = p.big && p.big[y]; const i = BIG_EVENTS.indexOf(tid); return row && i >= 0 && row[i] !== "." ? BIG_DEC[row[i]] : null; }
  function bigSet(p, y, tid, code) {
    const i = BIG_EVENTS.indexOf(tid); if (i < 0 || !BIG_ENC[code]) return;
    p.big = p.big || {};
    const row = (p.big[y] || ".".repeat(BIG_EVENTS.length)).split("");
    row[i] = BIG_ENC[code]; p.big[y] = row.join("");
  }
  function recordBig(state, p, T, code, onlyIfEmpty) {
    if (!T || !T.def || T.def.tier < 8) return;
    if (!p.isHuman && code === "Q") return; // qualifying losses only for the human (save size)
    const y = state.year;
    if (onlyIfEmpty && bigGet(p, y, T.tid)) return;
    bigSet(p, y, T.tid, code);
    const keep = p.isHuman ? BIG_KEEP_YEARS : 15;
    for (const k of Object.keys(p.big)) if (+k < y - keep) delete p.big[k];
  }
  function bigCodeFor(remaining) { return remaining === 2 ? "F" : remaining === 4 ? "SF" : remaining === 8 ? "QF" : "R" + remaining; }
  // the human's record before v2.5, rebuilt from the match history
  function backfillBig(state) {
    const h = human(state);
    if (state.human.bigBackfilled) return;
    state.human.bigBackfilled = true;
    const byName = {};
    for (const c of D.ATP_CALENDAR) byName[c.name] = c;
    const groups = {};
    for (const m of state.history.matches) {
      const c = byName[m.tour];
      if (!c || !D.CATS[c.cat] || D.CATS[c.cat].tier < 8) continue;
      const key = m.year + "|" + c.id;
      (groups[key] = groups[key] || []).push(m);
    }
    for (const [key, ms] of Object.entries(groups)) {
      const [y, tid] = key.split("|");
      const last = ms[ms.length - 1];
      let code;
      if (/予選/.test(last.round) && !last.won) code = "Q";
      else if (last.round === "決勝") code = last.won ? "W" : "F";
      else if (last.round === "ラウンドロビン") code = "RR";
      else if (!last.won) code = last.round === "準決勝" ? "SF" : last.round === "準々決勝" ? "QF" : last.round;
      else continue; // record cut off mid-event
      if (!bigGet(h, y, tid)) bigSet(h, y, tid, code);
    }
  }
  // timeline for the UI: rows in calendar order, one column per season
  function bigTimeline(state, p) {
    const big = p.big || {};
    const years = Object.keys(big).map(Number).sort((a, b) => a - b);
    if (!years.length) return null;
    const ev = D.ATP_CALENDAR.filter((c) => D.CATS[c.cat] && D.CATS[c.cat].tier >= 8);
    const rank = { W: 0, F: 1, SF: 2, QF: 3, R16: 4, R32: 5, RR: 5, R64: 6, R128: 7, Q: 8 };
    const rows = ev.map((c) => {
      const cells = {}; let best = null, titles = 0, played = 0;
      for (const y of years) { const v = bigGet(p, y, c.id); if (v) { cells[y] = v; played++; if (v === "W") titles++; if (best === null || (rank[v] ?? 9) < (rank[best] ?? 9)) best = v; } }
      return { tid: c.id, name: c.name, cat: c.cat, surface: c.surface, week: c.week, cells, best, titles, played };
    });
    // Grand Slam match record per year (main draw: 128 → wins = 7 − log2(remaining))
    const gsWL = {};
    for (const y of years) {
      let w = 0, l = 0;
      for (const c of ev.filter((x) => x.cat === "GS")) {
        const v = bigGet(p, y, c.id); if (!v || v === "Q") continue;
        const rem = v === "W" ? 1 : v === "F" ? 2 : v === "SF" ? 4 : v === "QF" ? 8 : parseInt(v.slice(1), 10) || 128;
        w += 7 - Math.round(Math.log2(rem)); if (v !== "W") l++;
      }
      gsWL[y] = [w, l];
    }
    const yearEnd = {};
    if (p.isHuman) for (const z of state.history.seasons) yearEnd[z.year] = z.rank;
    return { years, rows, gsWL, yearEnd };
  }
  function addResult(state, p, T, pts, prize, round, extra) {
    // AI players keep a compact record (save size); the human keeps full detail.
    if (p.isHuman) p.results.push({ t: state.t, tid: T.tid, name: T.name, cat: T.cat, pts, prize, round, year: state.year, week: state.week, surface: T.surface });
    else p.results.push({ t: state.t, tid: T.tid, cat: T.cat, pts });
    p.stats.prize += prize;
    if (p.isHuman) state.human.money += prize;
  }

  // ---------- tournament run ----------
  function* runTournament(state, T, mainEntrants, qualEntrants, humanInfo) {
    const def = T.def;
    const report = { T, humanPlayed: false, humanRound: null, humanMatches: [], winner: null, finalist: null, qualified: false, qualLost: false };
    // qualifying
    let qualifiers = [];
    if (qualEntrants.length > 0 && def.q > 0) {
      const need = Math.min(def.q, Math.max(1, Math.floor(qualEntrants.length / Math.pow(2, def.qRounds))));
      // split into `need` mini-brackets by snake seeding
      const buckets = Array.from({ length: need }, () => []);
      qualEntrants.forEach((p, i) => buckets[i % need].push(p));
      for (const bucket of buckets) {
        const res = yield* playKnockout(state, T, bucket, { drawSize: 0, qualifying: true });
        qualifiers.push(res.winner);
        report.humanMatches.push(...res.matches.filter((m) => m.a.isHuman || m.b.isHuman).map(describeMatch));
        for (const p of bucket) {
          if (p === res.winner) { addResult(state, p, T, def.qPts, def.qPrize || 0, "予選通過"); if (p.isHuman) report.qualified = true; continue; }
          const pl = res.placements.get(p.id);
          const finalLoser = pl && pl.roundIdx === res.rounds - 1;
          addResult(state, p, T, finalLoser ? Math.round(def.qPts / 2) : 0, (def.qPrize || 0) * (finalLoser ? 0.5 : 0.25), "予選敗退");
          recordBig(state, p, T, "Q", true);
          if (p.isHuman) { report.humanPlayed = true; report.qualLost = true; report.humanRound = "予選敗退"; }
        }
      }
    }
    const field = mainEntrants.concat(qualifiers);
    field.sort((a, b) => (rank6(state, a) - rank6(state, b)));
    const res = yield* playKnockout(state, T, field, { drawSize: def.draw });
    const Tn = Math.log2(res.N);
    for (const p of field) {
      const pl = res.placements.get(p.id);
      let idx;
      if (pl.won) idx = 0;
      else if (pl.bye && pl.roundIdx === 1) idx = Tn; // bye then lost first match: first-round-loser points
      else idx = Tn - pl.roundIdx;
      idx = Math.min(idx, def.points.length - 1);
      const pts = def.points[idx] || 0;
      const prize = (def.prize && def.prize[idx]) || 0;
      const round = pl.won ? "優勝" : pl.roundIdx === res.rounds - 1 ? "準優勝" : roundLabel(res.N / Math.pow(2, pl.roundIdx)) + "敗退";
      addResult(state, p, T, pts, prize, round);
      recordBig(state, p, T, pl.won ? "W" : bigCodeFor(res.N / Math.pow(2, pl.roundIdx)));
      if (pl.won) { p.stats.titles++; if (def.tier === 9) p.stats.gs++; if (def.tier === 8) p.stats.m1000++; if (p.isHuman) { sponsorTitleBonus(state, T, report); awardGP(state, def.tier >= 6 ? GP_AWARD.title[def.tier] || 2 : GP_AWARD.lowerTitle, `${T.name} 優勝`, report); } }
      if (p.isHuman) { report.humanPlayed = true; report.humanRound = round; report.humanPts = pts; report.humanPrize = prize; }
      p.consec++;
      if (def.weeks === 2) p.blockedUntil = state.t + 1;
    }
    for (const p of qualEntrants) if (!qualifiers.includes(p)) p.consec++;
    report.winner = res.winner;
    if (res.bracket) {
      report.bracket = res.bracket;
      state.history.brackets = state.history.brackets || [];
      state.history.brackets.push({ year: state.year, week: state.week, name: T.name, cat: T.cat, surface: T.surface, country: T.country, bracket: res.bracket });
      if (state.history.brackets.length > 8) state.history.brackets.shift();
    }
    const finalMatch = res.matches[res.matches.length - 1];
    report.finalist = finalMatch ? (finalMatch.w === finalMatch.a ? finalMatch.b : finalMatch.a) : null;
    report.finalScore = finalMatch ? finalMatch.res.score : "";
    report.humanMatches = report.humanMatches.concat(res.matches.filter((m) => m.a.isHuman || m.b.isHuman).map(describeMatch));
    report.semis = res.matches.filter((m) => m.round === "準決勝").map((m) => `${m.w.name} d. ${(m.w === m.a ? m.b : m.a).name} ${m.res.score}`);
    if (def.tier >= 6 || report.humanPlayed) state.history.tournaments.push({ year: state.year, week: state.week, name: T.name, cat: T.cat, short: def.short, surface: T.surface, winner: res.winner.name, winnerId: res.winner.id, finalist: report.finalist ? report.finalist.name : "", score: report.finalScore, tier: def.tier });
    if (def.tier >= 8) news(state, `${T.name}: ${res.winner.name} が優勝（決勝 ${report.finalist ? report.finalist.name : ""} に ${report.finalScore}）`);
    return report;
  }
  function describeMatch(m) {
    const h = m.a.isHuman ? m.a : m.b, o = m.a.isHuman ? m.b : m.a;
    return { round: m.round, opp: o.name, oppRank: o.rank, oppId: o.id, won: m.w === h, score: m.res.score, log: m.res.log || [], stats: m.res.stats, humanIdx: m.a.isHuman ? 0 : 1, wo: !!m.wo };
  }

  function* runFinals(state, T, field) {
    const rng = state.rng;
    const def = T.def;
    const report = { T, humanPlayed: false, humanMatches: [], winner: null, finalist: null, isFinals: true, groups: [] };
    field.sort((a, b) => a.rank - b.rank);
    const g1 = [field[0], rng.chance(0.5) ? field[2] : field[3], rng.chance(0.5) ? field[4] : field[5], rng.chance(0.5) ? field[6] : field[7]];
    const g2 = field.filter((p) => !g1.includes(p));
    const pts = new Map(field.map((p) => [p.id, { p, pts: 0, prize: 330, w: 0, sets: 0 }]));
    const allMatches = [];
    function* rr(group) {
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const res = yield* playOne(state, T, group[i], group[j], "ラウンドロビン");
        const w = res.winnerIdx === 0 ? group[i] : group[j], l = w === group[i] ? group[j] : group[i];
        afterMatch(state, w, l, res, T, "RR");
        const e = pts.get(w.id); e.pts += 200; e.prize += 390; e.w++;
        allMatches.push({ round: "ラウンドロビン", a: group[i], b: group[j], w, res });
      }
      return group.slice().sort((a, b) => pts.get(b.id).w - pts.get(a.id).w || rng.next() - 0.5);
    }
    const s1 = yield* rr(g1), s2 = yield* rr(g2);
    report.groups = [s1.map((p) => `${p.name} ${pts.get(p.id).w}勝`), s2.map((p) => `${p.name} ${pts.get(p.id).w}勝`)];
    const sf = [];
    for (const pair of [[s1[0], s2[1]], [s2[0], s1[1]]]) {
      const res = yield* playOne(state, T, pair[0], pair[1], "準決勝");
      const w = res.winnerIdx === 0 ? pair[0] : pair[1], l = w === pair[0] ? pair[1] : pair[0];
      afterMatch(state, w, l, res, T, "準決勝");
      const e = pts.get(w.id); e.pts += 400; e.prize += 1100;
      allMatches.push({ round: "準決勝", a: pair[0], b: pair[1], w, res });
      sf.push(w);
    }
    const fres = yield* playOne(state, T, sf[0], sf[1], "決勝");
    const champ = fres.winnerIdx === 0 ? sf[0] : sf[1], runner = champ === sf[0] ? sf[1] : sf[0];
    afterMatch(state, champ, runner, fres, T, "決勝");
    const ce = pts.get(champ.id); ce.pts += 500; ce.prize += 2200;
    allMatches.push({ round: "決勝", a: sf[0], b: sf[1], w: champ, res: fres });
    champ.stats.titles++;
    if (champ.isHuman) awardGP(state, 6, "ATPファイナルズ優勝", report);
    for (const e of pts.values()) {
      addResult(state, e.p, T, e.pts, e.prize, e.p === champ ? "優勝" : e.p === runner ? "準優勝" : sf.includes(e.p) ? "準決勝敗退" : "ラウンドロビン");
      recordBig(state, e.p, T, e.p === champ ? "W" : e.p === runner ? "F" : sf.includes(e.p) ? "SF" : "RR");
      if (e.p.isHuman) { report.humanPlayed = true; report.humanRound = e.p === champ ? "優勝" : e.p === runner ? "準優勝" : "敗退"; report.humanPts = e.pts; report.humanPrize = e.prize; }
      e.p.consec++;
    }
    report.winner = champ; report.finalist = runner; report.finalScore = fres.score;
    report.humanMatches = allMatches.filter((m) => m.a.isHuman || m.b.isHuman).map(describeMatch);
    state.history.tournaments.push({ year: state.year, week: state.week, name: T.name, cat: T.cat, short: def.short, surface: T.surface, winner: champ.name, winnerId: champ.id, finalist: runner.name, score: fres.score, tier: def.tier });
    news(state, `ATPファイナルズ: ${champ.name} が優勝（決勝 ${runner.name} に ${fres.score}）`);
    return report;
  }

  // ---------- growth off-court ----------
  const PHYS = ["speed", "stamina", "power", "durability"];
  // ---------- development plan (v1.9) ----------
  // A target style names the 3-4 attributes that define the player. Key attributes train 15%
  // faster; once they stand 5 points above the rest the style is "established" and pays off in
  // matches. Training intensity trades growth for fatigue and injury risk on training weeks.
  // Bonuses sized so an established style is worth about one good trait (~+3.5% win rate against
  // an equal opponent, about +1 overall). A one-component bonus needs ~4 points for that.
  const DEV_STYLES = {
    server: { label: "ビッグサーバー", keys: ["serve", "power", "fh"], bonus: { serve: 5.5 }, eq: 1.0, desc: "サーブとフォアの一撃で主導権を握る。確立するとサーブ +5.5（勝率 約+3.5%）" },
    baseline: { label: "アグレッシブベースライナー", keys: ["fh", "bh", "speed"], bonus: { rally: 3.5 }, eq: 1.0, desc: "ストロークで押し込む。確立するとラリー +3.5（勝率 約+3.5%）" },
    counter: { label: "カウンターパンチャー", keys: ["return", "speed", "bh"], bonus: { ret: 5.5 }, eq: 1.0, desc: "拾って粘って崩す。確立するとリターン +5.5（勝率 約+3.5%）" },
    all: { label: "オールコート", keys: ["serve", "return", "fh", "bh"], bonus: { serve: 1.6, ret: 1.6, rally: 1.6 }, eq: 1.0, desc: "穴のない万能型。確立すると全体 +1.6（勝率 約+3%）" },
    clay: { label: "クレー巧者", keys: ["speed", "bh", "stamina"], bonus: { clay: 5 }, eq: 0.5, desc: "赤土の長期戦に強い。確立するとクレーでラリー +5（クレーで勝率 約+6%）、練習でクレー適性も伸びる" },
    mental: { label: "勝負師", keys: ["clutch", "return", "fh"], bonus: { clutch: 16 }, eq: 0.9, desc: "大事なポイントで強い。確立すると勝負所 +16（勝率 約+3%）" },
  };
  const INTENSITY = {
    light: { label: "軽め", mult: 0.75, fat: -6, inj: 0.7, desc: "練習効果 ×0.75、疲労がさらに 6 抜ける、練習中の怪我 ×0.7" },
    normal: { label: "標準", mult: 1, fat: 0, inj: 1, desc: "標準の練習量" },
    hard: { label: "ハード", mult: 1.3, fat: 8, inj: 2.5, desc: "練習効果 ×1.3、疲労 +8、練習中の怪我 ×2.5" },
  };
  // Weekly training time: 10 sessions split across categories (replaces "two focus skills").
  const TRAIN_SLOTS = 10, SLOT_BUDGET = 0.056; // a category spreads over several skills, so the budget is a little above the old 2 x 0.245
  const TRAIN_CATS = {
    serve: { label: "サーブ", w: { serve: 0.75, power: 0.25 }, desc: "サーブ・パワー" },
    stroke: { label: "ストローク", w: { fh: 0.45, bh: 0.4, net: 0.15 }, desc: "フォア・バック・ネット" },
    ret: { label: "リターン・守備", w: { return: 0.65, speed: 0.35 }, desc: "リターン・スピード" },
    physical: { label: "フィジカル", w: { stamina: 0.35, speed: 0.25, power: 0.2, durability: 0.2 }, desc: "スタミナ・スピード・パワー・耐久。4コマ以上で疲労が溜まる" },
    mental: { label: "メンタル", w: { clutch: 0.5, focus: 0.5 }, desc: "クラッチ・集中力" },
    match: { label: "実戦形式", w: { serve: 0.2, return: 0.2, fh: 0.2, bh: 0.2, clutch: 0.2 }, desc: "全体を少しずつ。1コマごとに試合勘 +1.5、疲労 +0.5" },
  };
  const ATTR_CAT = { serve: "serve", power: "serve", fh: "stroke", bh: "stroke", net: "stroke", return: "ret", speed: "ret", stamina: "physical", durability: "physical", clutch: "mental", focus: "mental" };
  function allocOf(state) {
    const H = state.human;
    if (!H.alloc) {
      H.alloc = { serve: 3, stroke: 3, ret: 3, physical: 1, mental: 0, match: 0 };
    }
    return H.alloc;
  }
  function allocShare(alloc, k) { let x = 0; for (const c of Object.keys(TRAIN_CATS)) x += (alloc[c] || 0) * SLOT_BUDGET * (TRAIN_CATS[c].w[k] || 0); return x; }
  // coach's allocation: most time on the categories of the two skills autoFocus picks
  function autoAlloc(state, p) {
    const f = autoFocus(state, p);
    const a = { serve: 0, stroke: 0, ret: 0, physical: 1, mental: 0, match: 2 };
    a[ATTR_CAT[f[0]]] += 4; a[ATTR_CAT[f[1]]] += 3;
    return a;
  }
  function allocSummary(a) { return Object.keys(TRAIN_CATS).filter((c) => a[c]).map((c) => `${TRAIN_CATS[c].label}${a[c]}`).join("・"); }
  function topFocus(a) { return ATTRS.slice().sort((x, y) => allocShare(a, y) - allocShare(a, x)).slice(0, 2); }

  // ---------- traits (v2.6): five levels, limited slots ----------
  // Each trait has levels 1-5. A level multiplies the base effect (×1 / 1.6 / 2.1 / 2.5 / 2.8);
  // upgrades cost 2 / 4 / 6 / 9 / 12 growth points. Only 3 traits can be held (+1 at a best
  // ranking of 20, +1 at 3). Higher levels need more of the governing skill (+3 per level) or,
  // for traits without one, a best ranking of 50 (Lv4) / 10 (Lv5).
  const TRAIT_LV = [0, 1, 1.6, 2.1, 2.5, 2.8];
  const TRAIT_COST = [2, 4, 6, 9, 12];
  const pct = (x) => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, "") + "%";
  const TRAITS = {
    bigserve: { label: "ビッグサーブ", req: { serve: 72 }, v: 3, fx: (v) => `自分のサービスのBP・セットポイント・タイブレークで得点率 +${pct(v)}` },
    returner: { label: "鉄壁のリターン", req: { return: 72 }, v: 3, fx: (v) => `ブレークポイントを握ったとき得点率 +${pct(v)}` },
    tiebreak: { label: "タイブレークの鬼", req: { clutch: 65 }, v: 2.5, fx: (v) => `タイブレーク中の得点率 +${pct(v)}` },
    comeback: { label: "逆転の鬼", req: {}, v: 1.6, fx: (v) => `セットカウントで負けている間、得点率 +${pct(v)}` },
    frontrunner: { label: "先行逃げ切り", req: {}, v: 1.2, fx: (v) => `セットカウントで勝っている間、得点率 +${pct(v)}` },
    faststart: { label: "立ち上がり", req: {}, v: 1.1, fx: (v) => `第1セットの得点率 +${pct(v)}` },
    marathon: { label: "鉄人", req: { stamina: 72 }, v: 0.6, fx: (v, l) => `試合中の疲労の影響 ×${[0, 0.5, 0.42, 0.35, 0.3, 0.25][l]}、最終セットの得点率 +${pct(v)}` },
    claycourt: { label: "赤土の申し子", req: {}, v: 0.5, fx: (v) => `クレーでの得点率 +${pct(v)}` },
    fastcourt: { label: "高速コートの使い手", req: {}, v: 0.5, fx: (v) => `芝・インドアでの得点率 +${pct(v)}` },
    bigstage: { label: "大舞台", req: { focus: 65 }, v: 0.5, fx: (v) => `GS・マスターズ・ファイナルズで得点率 +${pct(v)}` },
    crowd: { label: "ホームの声援", req: {}, v: 0.5, fx: (v) => `自国開催の大会で得点率 +${pct(v)}` },
    giantkiller: { label: "ジャイアントキラー", req: {}, v: 0.6, fx: (v) => `30位以上格上の相手に得点率 +${pct(v)}` },
    ironbody: { label: "頑丈な身体", req: { durability: 65 }, lv: [1, 0.8, 0.72, 0.65, 0.6, 0.55], fx: (v, l, T) => `怪我の確率 ×${T.lv[l]}` },
    recovery: { label: "回復力", req: {}, lv: [0, 4, 6, 8, 10, 12], fx: (v, l, T) => `毎週の疲労回復 +${T.lv[l]}` },
    learner: { label: "吸収力", req: {}, lv: [1, 1.1, 1.15, 1.2, 1.25, 1.3], fx: (v, l, T) => `練習の効果 ×${T.lv[l]}` },
  };
  const GP_AWARD = { title: { 9: 6, 10: 6, 8: 4, 7: 3, 6: 2 }, lowerTitle: 1, milestone: 2, season: 1 };
  function traitLevels(state) {
    const H = state.human;
    if (!H.traitLv) { H.traitLv = {}; for (const t of H.traits || []) H.traitLv[t] = 1; } // v2.0-2.5 saves: everything learned becomes Lv1
    return H.traitLv;
  }
  function traitLevel(state, id) { return traitLevels(state)[id] || 0; }
  function hasTrait(state, id) { return traitLevel(state, id) > 0; }
  function traitList(state) { return Object.keys(traitLevels(state)).filter((k) => traitLevels(state)[k] > 0); }
  function traitSlots(state) { const b = human(state).stats.bestRank || 9999; return 3 + (b <= 20 ? 1 : 0) + (b <= 3 ? 1 : 0); }
  function traitEffectText(id, l) { const T = TRAITS[id]; return l ? T.fx((T.v || 0) * TRAIT_LV[l], l, T) : ""; }
  function traitOffCourt(state, id) { const T = TRAITS[id], l = traitLevel(state, id); return T.lv ? T.lv[l] : 0; }
  // requirement for reaching level l
  function traitReq(state, id, l) {
    const T = TRAITS[id], h = human(state), out = [];
    for (const [k, v] of Object.entries(T.req)) { const need = v + 3 * (l - 1); out.push({ text: `${ATTR_LABEL[k]}${need}以上`, ok: h.attrs[k] >= need }); }
    if (!Object.keys(T.req).length && l >= 4) { const need = l === 4 ? 50 : 10; out.push({ text: `最高${need}位以内`, ok: (h.stats.bestRank || 9999) <= need }); }
    return out;
  }
  function traitReqOk(state, id, l) { return traitReq(state, id, l || traitLevel(state, id) + 1).every((r) => r.ok); }
  function learnTrait(state, id) {
    const T = TRAITS[id], H = state.human, lv = traitLevels(state);
    const cur = lv[id] || 0;
    if (!T || cur >= 5) return false;
    if (!cur && traitList(state).length >= traitSlots(state)) return false;
    const cost = TRAIT_COST[cur];
    if ((H.gp || 0) < cost || !traitReqOk(state, id, cur + 1)) return false;
    H.gp -= cost; lv[id] = cur + 1;
    H.traits = traitList(state);
    news(state, cur ? `${human(state).name} の特性「${T.label}」が Lv${cur + 1} に` : `${human(state).name} が特性「${T.label}」を身につけた`);
    return true;
  }
  // ---------- AI traits (v2.7) ----------
  // Top AI players get traits by the same rules as the human: up to 3 by best ranking, chosen
  // from their strengths, levelled with a budget equivalent to a human's growth points for the
  // same career (seasons, titles, big titles). Reviewed every season end; held traits are kept.
  const AI_TRAIT_IDS = ["bigserve", "returner", "tiebreak", "comeback", "frontrunner", "faststart", "marathon", "claycourt", "fastcourt", "bigstage", "giantkiller"];
  function aiTraitReqOk(p, id, l) {
    const T = TRAITS[id];
    for (const [k, v] of Object.entries(T.req)) if (p.attrs[k] < v + 3 * (l - 1)) return false;
    if (!Object.keys(T.req).length && l >= 4 && (p.stats.bestRank || 9999) > (l === 4 ? 50 : 10)) return false;
    return true;
  }
  function assignAiTraits(state, p, initRank) {
    const best = Math.min(p.stats.bestRank || 9999, initRank || 9999);
    if (best > 100 || p.isHuman || p.retired) { if (!p.isHuman) delete p.traits; return; }
    const n = best <= 10 ? 3 : best <= 30 ? 2 : 1;
    const a = p.attrs, avg = ATTRS.reduce((x, k) => x + a[k], 0) / ATTRS.length;
    const ageNow = age(state, p);
    const fit = {
      bigserve: a.serve - avg, returner: a.return - avg, tiebreak: a.clutch - avg, marathon: a.stamina - avg,
      claycourt: (p.surf.clay - 60) * 0.8, fastcourt: ((p.surf.grass + p.surf.indoor) / 2 - 60) * 0.8,
      bigstage: (p.stats.gs + p.stats.m1000 > 0 ? 3 : -3) + (a.focus - avg) * 0.5, comeback: (a.clutch - avg) * 0.4 - 1,
      frontrunner: (a.power - avg) * 0.4 - 1, faststart: (a.speed - avg) * 0.4 - 1, giantkiller: ageNow <= 23 ? 2 : -5,
    };
    // personality: a stable per-player random preference so similar players still differ
    const tie = (id) => ((TL.RNG.hash(`${state.seed}:${p.id}:${id}`) % 1000) / 1000) * 5;
    const held = Object.keys(p.traits || {}).filter((id) => AI_TRAIT_IDS.includes(id));
    const pick = held.slice(0, n);
    for (const id of AI_TRAIT_IDS.slice().sort((x, y) => fit[y] + tie(y) - (fit[x] + tie(x)))) { if (pick.length >= n) break; if (!pick.includes(id) && aiTraitReqOk(p, id, 1)) pick.push(id); }
    // budget equivalent to a human career with the same record
    const seasons = Math.max(0, ageNow - 18);
    let budget = initRank ? (initRank <= 3 ? 22 : initRank <= 10 ? 14 : initRank <= 30 ? 8 : 4) : seasons + p.stats.titles * 1.5 + p.stats.m1000 * 2 + p.stats.gs * 4;
    const lv = {};
    for (const id of pick) if (aiTraitReqOk(p, id, 1)) lv[id] = 0;
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const id of Object.keys(lv)) {
        const next = lv[id] + 1;
        if (next > 5 || budget < TRAIT_COST[next - 1] || !aiTraitReqOk(p, id, next)) continue;
        budget -= TRAIT_COST[next - 1]; lv[id] = next; progressed = true;
      }
    }
    for (const id of Object.keys(lv)) if (!lv[id]) delete lv[id];
    p.traits = Object.keys(lv).length ? lv : undefined;
    if (!p.traits) delete p.traits;
  }
  function aiTraitList(p) { return p.traits ? Object.entries(p.traits).map(([id, l]) => ({ id, l, label: TRAITS[id].label })) : []; }
  function dropTrait(state, id) {
    const H = state.human, lv = traitLevels(state), cur = lv[id] || 0;
    if (!cur) return 0;
    const spent = TRAIT_COST.slice(0, cur).reduce((a, b) => a + b, 0);
    const back = Math.floor(spent / 2);
    H.gp = (H.gp || 0) + back; delete lv[id]; H.traits = traitList(state);
    news(state, `特性「${TRAITS[id].label}」を外した（${back}pt 戻る）`);
    return back;
  }
  function awardGP(state, n, why, report) {
    if (!n) return;
    const H = state.human;
    H.gp = (H.gp || 0) + n;
    H.gpLog = H.gpLog || []; H.gpLog.push({ year: state.year, week: state.week, n, why }); if (H.gpLog.length > 40) H.gpLog.shift();
    H.gpNew = (H.gpNew || []).concat({ n, why }); // flushed into the weekly report
  }
  function devOf(state) { return state.human.dev || (state.human.dev = { style: null, intensity: "normal", auto: false, established: false }); }
  function styleGap(p, key) {
    const st = DEV_STYLES[key]; if (!st) return 0;
    const ka = st.keys.reduce((a, k) => a + p.attrs[k], 0) / st.keys.length;
    const others = ATTRS.filter((k) => !st.keys.includes(k) && k !== "durability");
    const oa = others.reduce((a, k) => a + p.attrs[k], 0) / others.length;
    return Math.round((ka - oa) * 10) / 10;
  }
  // coach-chosen focus: the two weakest key attributes of the target style (or the two weakest overall)
  function autoFocus(state, p) {
    const dev = devOf(state);
    // once the style clearly stands out (gap 7+), the coach rounds out the weakest other skills
    const keys = dev.style ? DEV_STYLES[dev.style].keys : null;
    if (keys && styleGap(p, dev.style) < 7) return keys.slice().sort((a, b) => p.attrs[a] - p.attrs[b]).slice(0, 2);
    // otherwise pick by match value: how much the attribute counts × how far it lags the player's average
    const OVW = TL.OVERALL_W;
    const avg = ATTRS.reduce((a, k) => a + p.attrs[k], 0) / ATTRS.length;
    const pool = Object.keys(OVW).filter((k) => !keys || !keys.includes(k));
    const val = (k) => OVW[k] * (p.attrs[k] > p.potential + 6 ? 0.4 : 1) * (1 + (avg - p.attrs[k]) / 40);
    pool.sort((a, b) => val(b) - val(a));
    return pool.slice(0, 2);
  }
  // Expected gain of one attribute for one week of training (no randomness). trainPlayer uses the
  // same numbers, so what the development panel promises is what the engine does.
  function trainRate(state, p, k, focus, intensity, opts) {
    const mult = ageMult(growthAge(state, p)) * headroomMult(p);
    const coach = p.isHuman ? state.human.coach : null;
    const useAlloc = p.isHuman && opts && opts.session;
    const share = useAlloc ? allocShare(opts.alloc || allocOf(state), k) : focus && focus.includes(k) ? 0.245 : 0;
    let f = (0.035 + share) * intensity;
    if (coach) {
      if (coach.type === "tech" && share > 0.05) f *= 1 + 0.25 * coach.quality;
      if (coach.type === "physical" && PHYS.includes(k)) f *= 1.5;
      if (coach.type === "mental" && (k === "clutch" || k === "focus")) f *= 1.6;
    }
    if (p.isHuman) {
      const st = staffOf(state);
      if (st.fitness && PHYS.includes(k)) f *= 1.3;
      if (st.hitting) f *= 1.15;
      if (coach) f *= 1 + (coach.compat || 0);
      if (state.human.focusBoostUntil > state.t) f *= 1.25;
      if (assetsOf(state).base) f *= 1.1;
      f *= traitOffCourt(state, "learner") || 1;
      f *= diff(state).grow * HUMAN_GROW;
      const dev = devOf(state);
      if (opts && opts.session) {
        f *= INTENSITY[dev.intensity] ? INTENSITY[dev.intensity].mult : 1;
        const C = cashOf(state);
        if (C.job && C.jobUntil > state.t) f *= C.job === "club" ? 0.8 : 0.6;
        if (state.human.strategy === "develop") f *= 1.2;
      }
      if (dev.style && DEV_STYLES[dev.style].keys.includes(k)) f *= 1.15;
      // specialising has diminishing returns: an attribute well above the player's ceiling grows slowly
      if (p.attrs[k] > p.potential + 6) f *= 0.4;
    }
    return f * mult;
  }
  function trainPlayer(state, p, focus, intensity, opts) {
    const rng = state.rng;
    const mult = ageMult(growthAge(state, p)) * headroomMult(p);
    const coach = p.isHuman ? state.human.coach : null;
    if (p.isHuman) {
      for (const k of ATTRS) p.attrs[k] = clamp(p.attrs[k] + trainRate(state, p, k, focus, intensity, opts) * (0.7 + 0.6 * rng.next()), 25, 99);
      if (coach && intensity > 0.6) {
        if (coach.type === "clay") p.surf.clay = clamp(p.surf.clay + 0.25, 20, 85);
        if (coach.type === "grass") { p.surf.grass = clamp(p.surf.grass + 0.2, 20, 85); p.surf.indoor = clamp(p.surf.indoor + 0.2, 20, 85); }
      }
      if (opts && opts.session && devOf(state).style === "clay") p.surf.clay = clamp(p.surf.clay + 0.1, 20, 85);
      return;
    }
    for (const k of ATTRS) {
      let f = focus && focus.includes(k) ? 0.28 * intensity : 0.035 * intensity;
      if (coach) {
        if (coach.type === "tech" && focus && focus.includes(k)) f *= 1 + 0.25 * coach.quality;
        if (coach.type === "physical" && PHYS.includes(k)) f *= 1.5;
        if (coach.type === "mental" && (k === "clutch" || k === "focus")) f *= 1.6;
      }
      if (p.isHuman) {
        const st = staffOf(state);
        if (st.fitness && PHYS.includes(k)) f *= 1.3;
        if (st.hitting) f *= 1.15;
        if (coach) f *= 1 + (coach.compat || 0);
        if (state.human.focusBoostUntil > state.t) f *= 1.25;
        if (assetsOf(state).base) f *= 1.1;
        f *= diff(state).grow;
      }
      p.attrs[k] = clamp(p.attrs[k] + f * mult * (0.7 + 0.6 * rng.next()), 25, 99);
    }
    if (coach && intensity > 0.6) {
      if (coach.type === "clay") p.surf.clay = clamp(p.surf.clay + 0.25, 20, 85);
      if (coach.type === "grass") { p.surf.grass = clamp(p.surf.grass + 0.2, 20, 85); p.surf.indoor = clamp(p.surf.indoor + 0.2, 20, 85); }
    }
  }
  function aiOffWeek(state, p) {
    const rng = state.rng;
    const mult = ageMult(growthAge(state, p)) * headroomMult(p);
    // AI trains toward its weakest skills
    const weakest = ATTRS.slice().sort((a, b) => p.attrs[a] - p.attrs[b]).slice(0, 3);
    for (const k of ATTRS) {
      // AI youngsters develop at a pace comparable to the human's, so the climb is contested
      // young AI players develop fastest: juniors turning pro reach their level within a few seasons
      const ga = growthAge(state, p);
      const youth = ga <= 20 ? 2.0 : ga <= 22 ? 1.6 : ga <= 24 ? 1.25 : 1;
      const f = (weakest.includes(k) ? 0.34 : 0.08) * diff(state).aiGrow * youth;
      p.attrs[k] = clamp(p.attrs[k] + f * mult * (0.7 + 0.6 * rng.next()), 25, 99);
    }
    p.fatigue = clamp(p.fatigue - 25, 0, 100);
    p.consec = 0;
  }

  function human(state) {
    return state.players.find((p) => p.id === state.humanId);
  }
  function rival(state) {
    if (!RIVALS || state.rivalId === null || state.rivalId === undefined) return null;
    return state.players.find((p) => p.id === state.rivalId);
  }

  // ---------- the weekly step ----------
  // action: {type:'enter', tid} | {type:'train', focus:[a,b]} | {type:'rest'} | {type:'auto'}
  function advanceWeek(state, action) {
    const g = advanceWeekGen(state, action);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }
  function* advanceWeekGen(state, action) {
    const rng = state.rng;
    const h = human(state);
    const rv = rival(state);
    state._watch = (action && action.watch) || null;
    const report = { year: state.year, week: state.week, t: state.t, items: [], stops: [], tournaments: [], humanAction: null, rankBefore: h.rank, newsStart: state.history.news.length };
    const tours = weekTournaments(state);
    const blocked = (p) => p.blockedUntil >= state.t;
    const offseason = tours.length === 0;

    // resolve human action
    let act = action || { type: "rest" };
    if (state.human.event) { const txt = resolveEvent(state, state.human.event.choices[0].key); report.items.push({ type: "event", text: `（未回答のイベントは既定の選択）${txt}` }); }
    const attrsBefore = Object.assign({}, h.attrs);
    const surfBefore = Object.assign({}, h.surf);
    if (state.human.forceRest && !h.injury) { act = { type: "rest", forced: "niggle" }; state.human.forceRest = false; }
    if (h.injury) act = { type: "rest", forced: "injury" };
    else if (blocked(h)) act = { type: "blocked" };
    else if (act.type === "auto") act = autoAction(state, tours);
    report.humanAction = act;

    // --- entries ---
    const assigned = new Set();
    const avail = state.players.filter((p) => !p.retired && !p.isHuman && !p.injury && !blocked(p));
    const resting = new Set();
    for (const p of avail) if (!offseason && wantsRest(state, p)) resting.add(p.id);
    const rankNow = new Map(avail.map((p) => [p.id, rank6(state, p)]));
    let humanAccepted = null;
    // each AI player commits to one event per tier (home country first, then own region)
    const byTier = {};
    for (const T of tours) (byTier[T.def.tier] = byTier[T.def.tier] || []).push(T);
    const pref = new Map();
    for (const p of avail) {
      const m = {};
      for (const tier in byTier) {
        const list = byTier[tier];
        if (list.length === 1) { m[tier] = list[0].id; continue; }
        const home = list.filter((T) => T.country === p.country);
        const reg = list.filter((T) => T.region === D.COUNTRIES[p.country].region);
        m[tier] = (home.length ? rng.pick(home) : reg.length && rng.chance(0.7) ? rng.pick(reg) : rng.pick(list)).id;
      }
      pref.set(p.id, m);
    }
    state.cutoffs = state.cutoffs || {};

    const runs = [];
    for (const T of tours) {
      if (T.cat === "FINALS") {
        const top = state.players.filter((p) => !p.retired && !p.injury && p.rank && p.rank <= 12).sort((a, b) => a.rank - b.rank).slice(0, 8);
        if (top.length === 8) {
          for (const p of top) assigned.add(p.id);
          if (top.includes(h)) { humanAccepted = T; act = { type: "enter", tid: T.id, finals: true }; report.humanAction = act; }
          runs.push({ T, finals: true, field: top });
        }
        continue;
      }
      const cands = avail.filter((p) => !assigned.has(p.id) && !resting.has(p.id) && pref.get(p.id)[T.def.tier] === T.id && aiWants(state, p, T, rankNow.get(p.id)));
      cands.sort((a, b) => rankNow.get(a.id) - rankNow.get(b.id) || rng.next() - 0.5);
      const humanIn = act.type === "enter" && act.tid === T.id && !humanAccepted;
      let list = cands.slice();
      if (humanIn) {
        const hr = rank6(state, h);
        let i = 0;
        while (i < list.length && rankNow.get(list[i].id) <= hr) i++;
        list.splice(i, 0, h);
      }
      const D0 = directCut(T);
      const main = list.slice(0, D0);
      if (T.isAtp && main.length) {
        const last = Math.max(...main.map((p) => (p.isHuman ? rank6(state, h) : rankNow.get(p.id))).filter((x) => x < 9999));
        state.cutoffs[T.tid] = main.length < D0 ? Math.max(last, ATP_CUT[T.cat] || 0) : last;
      }
      const Q = T.def.q > 0 ? qualSize(T) : 0;
      let qual = list.slice(D0, D0 + Q);
      let rest = list.slice(D0 + Q);
      // wild cards
      const wcs = [];
      if (humanIn && rest.includes(h)) {
        const home = T.country === h.country;
        let p = 0;
        if (T.def.tier <= 1) p = 1;
        else if (T.def.tier === 2) p = home ? 0.95 : 0.6;
        else if (T.def.tier <= 5) p = home ? 0.6 : 0.08;
        else p = home ? (state.human.wcBoostUntil > state.t ? 0.7 : 0.35) : 0.03;
        if (staffOf(state).agent) p = Math.min(0.9, p + 0.15);
        if (rng.chance(p)) { wcs.push(h); rest = rest.filter((x) => x !== h); }
      }
      const homeRest = rest.filter((p) => p.country === T.country);
      while (wcs.length < T.def.wc && homeRest.length) { const p = homeRest.shift(); wcs.push(p); rest = rest.filter((x) => x !== p); }
      while (wcs.length < T.def.wc && rest.length && main.length + wcs.length < T.def.draw - T.def.q) { wcs.push(rest.shift()); }
      const mainAll = main.concat(wcs);
      for (const p of mainAll) assigned.add(p.id);
      for (const p of qual) assigned.add(p.id);
      if (humanIn) {
        if (mainAll.includes(h) || qual.includes(h)) humanAccepted = T;
        else { report.items.push({ type: "rejected", text: `${T.name}: カットオフ外でエントリーできず（この週は練習に切り替え）` }); act = { type: "train", focus: state.human.focus, fallback: true }; report.humanAction = act; }
      }
      runs.push({ T, main: mainAll, qual });
    }

    // --- play tournaments ---
    let travel = 0, fee = 0, travelInfo = null;
    for (const run of runs) {
      let rep;
      if (run.finals) rep = yield* runFinals(state, run.T, run.field);
      else if (run.main.length + run.qual.length >= 4) rep = yield* runTournament(state, run.T, run.main, run.qual, null);
      else continue;
      rep.entrants = run.finals ? 8 : run.main.length;
      report.tournaments.push(rep);
      if (rep.humanPlayed) {
        report.human = rep;
        report.stops.push("tournament");
        const rvMs = rival(state) ? rep.humanMatches.filter((m) => m.oppId === state.rivalId) : [];
        if (rvMs.length) { report.stops.push("rival"); for (const m of rvMs) rivalMeet(state, run.T, m); }
        const tq = travelQuote(state, run.T);
        travel = tq.cost;
        travelInfo = tq;
        state.human.lastRegion = run.T.region;
        state.human.loc = run.T.country;
        state.human.money -= travel;
        if (tq.lag) h.fatigue = clamp(h.fatigue + tq.lag, 0, 100);
        if (staffOf(state).agent && !run.finals && (run.T.def.tier === 6 || run.T.def.tier === 7) && h.rank && h.rank <= 50) {
          const r0 = h.rank;
          fee = run.T.def.tier === 7 ? (r0 <= 10 ? 100 : r0 <= 20 ? 40 : 12) : (r0 <= 10 ? 60 : r0 <= 20 ? 25 : 8);
          state.human.money += fee;
          report.items.push({ type: "fee", text: `アピアランスフィー ${money(fee)}（エージェント交渉）` });
        }
        if (act.doubles && !run.finals) { rep.doubles = runDoubles(state, run.T, h); report.items.push({ type: "doubles", text: `ダブルス（${rep.doubles.partner}と組む）: ${rep.doubles.label}、賞金 $${rep.doubles.prize}k` }); }
      }
    }

    // --- off-court for everyone else ---
    for (const p of state.players) {
      if (p.retired || p.isHuman || assigned.has(p.id)) continue;
      if (p.injury) { p.fatigue = clamp(p.fatigue - 20, 0, 100); continue; }
      if (blocked(p)) continue;
      aiOffWeek(state, p);
    }
    if (!humanAccepted) {
      if (act.type !== "blocked") state.human.loc = h.country; // back to the home base
      if (act.type === "train" || act.type === "camp") {
        const dev = devOf(state);
        if (dev.auto) state.human.alloc = autoAlloc(state, h);
        const alloc = allocOf(state);
        const focus = topFocus(alloc);
        state.human.focus = focus;
        trainPlayer(state, h, focus, act.type === "camp" ? (state.human.campBonus ? 1.7 : 1.4) : 1, { session: true });
        if (act.type === "camp") state.human.campBonus = false;
        const physLoad = Math.max(0, (alloc.physical || 0) - 3) * 1.5 + (alloc.match || 0) * 0.5;
        h.fatigue = clamp(h.fatigue - (act.type === "camp" ? 18 : 12) + (INTENSITY[dev.intensity] ? INTENSITY[dev.intensity].fat : 0) + physLoad, 0, 100);
        if (alloc.match) h.sharp = clamp((h.sharp || 65) + alloc.match * 1.5, 0, 100);
        h.consec = 0;
        report.items.push({ type: "train", text: `練習: ${allocSummary(alloc)}${act.fallback ? "（大会に入れなかったため）" : ""}` });
      } else if (act.type === "rest") {
        h.fatigue = clamp(h.fatigue - 30 - (assetsOf(state).base ? 5 : 0), 0, 100);
        h.consec = 0;
        trainPlayer(state, h, [], 0.5);
        report.items.push({ type: "rest", text: act.forced === "injury" ? `リハビリ中（${h.injury.label}、残り${h.injury.weeks}週）` : "休養週: 疲労を回復" });
      } else if (act.type === "blocked") {
        h.fatigue = clamp(h.fatigue - 5, 0, 100);
        report.items.push({ type: "blocked", text: "2週大会の2週目（移動・調整）" });
      }
    }

    // --- weekly recovery, injuries countdown, training strains ---
    for (const p of state.players) {
      if (p.retired) continue;
      const trainWk = p.isHuman && act && (act.type === "train" || act.type === "camp");
      if (!p.injury && !assigned.has(p.id) && !blocked(p)) rollInjury(state, p, null, 0.006 * (trainWk && INTENSITY[devOf(state).intensity] ? INTENSITY[devOf(state).intensity].inj : 1));
      let rec = 10;
      if (p.isHuman) { const st = staffOf(state); const away = cashOf(state).budget && assigned.has(p.id); if (state.human.coach && state.human.coach.type === "physical" && !away) rec += 6; if (st.physio && !away) rec += 5; if (st.fitness && !away) rec += 4; rec += sponsorPerks(state).recovery + traitOffCourt(state, "recovery"); }
      p.fatigue = clamp(p.fatigue - rec, 0, 100);
      const hadSharp = p.sharp;
      sharpWeekly(state, p, p.isHuman && act && act.type === "rest" ? "rest" : "other");
      if (p.isHuman && p.injury === null && hadSharp !== undefined && p.sharp < 45 && (p.mw || 0) === 0 && act && act.type !== "enter" && state.t % 4 === 0) report.items.push({ type: "sharp", text: `試合勘が落ちている（${Math.round(p.sharp)}）。試合に出て取り戻す必要がある` });
      if (p.injury && p.injuredAt !== state.t) {
        p.injury.weeks--;
        if (p.injury.weeks <= 0) { if (p.isHuman) report.items.push({ type: "healed", text: `${p.injury.label} から復帰。試合に戻れる。試合勘は ${Math.round(p.sharp)}（${sharpLabel(p.sharp)}）。復帰後2〜3大会は本来の力が出ない` }); p.injury = null; p.consec = 0; }
      }
    }
    if (h.injury && h.injuredAt === state.t) report.stops.push("injury");

    // --- sponsors: expiry, collapses ---
    sponsorTick(state, report);
    // --- finances ---
    const support = state.human.sponsorUntil > state.t ? state.human.sponsorWeekly : 0;
    const extra = state.human.sponsor2 && state.human.sponsor2.until > state.t ? state.human.sponsor2.weekly : 0;
    const r = h.rank || 9999;
    const agentMult = staffOf(state).agent ? 1.3 : 1;
    // sponsors pay for appearances: an injured player loses the ranking-linked bonus while out
    const injCut = h.injury ? 0.5 : 1;
    // small sponsors and appearance deals (the big money now comes from brand contracts in the sponsor tab)
    const rankSponsor = Math.round((r <= 5 ? 40 : r <= 10 ? 25 : r <= 20 ? 12 : r <= 50 ? 5 : r <= 100 ? 2.5 : r <= 200 ? 0.8 : r <= 300 ? 0.3 : 0) * 0.25 * agentMult * injCut * 10) / 10;
    const contracts = Math.round(sponsorWeekly(state) * injCut * 10) / 10;
    const signing = state.human.pendingSigning || 0, bonusPay = state.human.pendingBonus || 0;
    state.human.pendingSigning = 0; state.human.pendingBonus = 0;
    const team = (state.human.coach ? state.human.coach.cost : 0) + staffCost(state);
    const base = 0.5;
    const prize = (report.human ? report.human.humanPrize || 0 : 0) + (report.human && report.human.doubles ? report.human.doubles.prize : 0);
    // side jobs while short of money
    const C = cashOf(state);
    let jobIncome = 0;
    if (C.job && C.jobUntil > state.t) {
      jobIncome = jobPay(state, C.job);
      if (C.job === "club") { h.fatigue = clamp(h.fatigue + 6, 0, 100); h.sharp = clamp((h.sharp || 65) + 4, 0, 100); }
      else h.sharp = clamp((h.sharp || 65) - 2, 10, 100);
    } else if (C.job) { report.items.push({ type: "money", text: `${JOBS[C.job].label}が終わった` }); C.jobCooldown[C.job] = state.t + JOBS[C.job].cooldown; C.job = null; }
    const income = (support + extra + rankSponsor + contracts) * diff(state).income + jobIncome, expense = base + team;
    // tax on prize money and sponsor income (support from family or federation is untaxed)
    const tax = Math.round((prize + fee + signing + bonusPay + (extra + rankSponsor + contracts) * diff(state).income) * TAX * 10) / 10;
    const agentFee = staffOf(state).agent ? Math.round((fee + signing + bonusPay + (extra + rankSponsor + contracts) * diff(state).income) * AGENT_CUT * 10) / 10 : 0;
    // rehab and medical bills while injured; the medical contract halves them
    const rehab = rehabWeekly(state);
    const assetsCost = Math.round(assetsWeekly(state) * 10) / 10;
    const purchase = state.human.pendingPurchase || 0;
    state.human.pendingPurchase = 0;
    state.human.money += income - expense - tax - agentFee - rehab - assetsCost;
    // loan: interest accrues, repayment comes out of prize money and sponsor income
    let loanPay = 0;
    if (C.loan > 0) {
      C.loan = Math.round((C.loan * (1 + (C.loanRate || 0))) * 100) / 100;
      const earn = prize + fee + signing + bonusPay + (extra + rankSponsor + contracts) * diff(state).income;
      loanPay = Math.min(C.loan, Math.max(0, Math.round(earn * 0.25 * 10) / 10), Math.max(0, state.human.money));
      C.loan = Math.round((C.loan - loanPay) * 100) / 100;
      state.human.money -= loanPay;
      if (C.loan <= 0.05) { C.loan = 0; C.loanRate = 0; report.items.push({ type: "money", text: "借入をすべて返済した" }); }
    }
    const funding = state.human.pendingFunding || 0;
    state.human.pendingFunding = 0;
    // unpaid wages: two weeks deep in the red and the team walks out
    if (state.human.money < -50 && (state.human.coach || Object.values(staffOf(state)).some(Boolean))) {
      C.unpaid++;
      if (C.unpaid === 1) report.items.push({ type: "money", text: "給与が払えていない。来週も払えなければチームが離れる（財務タブで資金繰りを）" });
      if (C.unpaid >= 2) {
        const names = [state.human.coach ? state.human.coach.name : null].filter(Boolean);
        state.human.coach = null;
        const st = staffOf(state); for (const k of Object.keys(st)) st[k] = false; state.human.physio = false;
        C.unpaid = 0;
        news(state, `給与未払いでチームが離脱${names.length ? `（${names.join("・")}）` : ""}`);
        report.items.push({ type: "money", text: "給与未払いが続き、コーチとスタッフが離れた" });
        report.stops.push("event");
      }
    } else C.unpaid = 0;
    const entry = { t: state.t, year: state.year, week: state.week, prize, support, rankSponsor, contracts: contracts * diff(state).income, signing: signing + bonusPay, extra: extra + fee, fee, base, team, travel, travelInfo, tax, agentFee, rehab, assetsCost, purchase, jobIncome, funding, loanPay, net: Math.round((prize + fee + signing + bonusPay + funding + income - expense - travel - tax - agentFee - rehab - assetsCost - purchase - loanPay) * 100) / 100, balance: Math.round(state.human.money * 10) / 10 };
    state.human.ledger = state.human.ledger || [];
    state.human.ledger.push(entry);
    if (state.human.ledger.length > 160) state.human.ledger.shift();
    report.finance = Object.assign({ income, expense }, entry);

    // --- investments mature ---
    const inv = state.human.investment;
    if (inv && state.t >= inv.until) {
      const u = rng.next();
      const mult = u < 0.45 ? 1.8 : u < 0.8 ? 1.1 : 0.25;
      const back = Math.round(inv.amount * mult);
      state.human.money += back;
      state.human.investment = null;
      news(state, `${inv.label}: 投資 $${inv.amount}k が $${back}k で戻った（${mult >= 1.5 ? "大成功" : mult >= 1 ? "小さな利益" : "ほぼ損失"}）`);
      report.items.push({ type: "invest", text: `${inv.label}: $${inv.amount}k → $${back}k` });
    }
    // --- time ---
    state.t++;
    state.week++;
    let seasonEnd = false;
    if (state.week > 52) {
      seasonEnd = true;
    }
    recomputeRanking(state);
    state.rankSnaps.push(snapshot(state));
    if (state.rankSnaps.length > 10) state.rankSnaps.shift();
    report.rankAfter = h.rank;
    for (const p of state.players) if (!p.retired && p.rank && (!p.stats.bestRank || p.rank < p.stats.bestRank)) p.stats.bestRank = p.rank;
    if (h.rank === 1) h.stats.weeksNo1++;
    if (h.rank && h.rank <= 10) h.stats.weeksTop10++;
    if (h.rank && (!h.stats.bestRank || h.rank < h.stats.bestRank)) h.stats.bestRank = h.rank;
    if (rv && rv.rank && (!rv.stats.bestRank || rv.rank < rv.stats.bestRank)) rv.stats.bestRank = rv.rank;
    rivalWeekly(state, h, rv);
    for (const m of [300, 200, 100, 50, 20, 10, 5, 1]) {
      if (h.rank && h.rank <= m && !state.human.milestones[m]) {
        state.human.milestones[m] = { year: state.year, week: state.week };
        report.items.push({ type: "milestone", text: m === 1 ? "世界ランキング1位に到達！" : `トップ${m}入り（${h.rank}位）` });
        if (m <= 200) awardGP(state, GP_AWARD.milestone, m === 1 ? "世界1位" : `トップ${m}入り`, report);
        report.stops.push("milestone");
      }
    }
    if (seasonEnd) {
      report.season = endSeason(state);
      report.stops.push("season");
      state.week = 1;
      state.year++;
    }
    if (!seasonEnd && !state.human.careerOver) maybeEvent(state, report);
    const attrDelta = {};
    for (const k of ATTRS) { const d = h.attrs[k] - attrsBefore[k]; if (Math.abs(d) >= 0.05) attrDelta[k] = Math.round(d * 100) / 100; }
    const surfDelta = {};
    for (const k of Object.keys(h.surf)) { const d = h.surf[k] - surfBefore[k]; if (Math.abs(d) >= 0.05) surfDelta[k] = Math.round(d * 100) / 100; }
    report.attrDelta = attrDelta;
    {
      const dev = devOf(state);
      state.human.actLog = state.human.actLog || [];
      state.human.actLog.push(act ? act.type : "rest");
      if (state.human.actLog.length > 12) state.human.actLog.shift();
      if (dev.style) {
        const gap = styleGap(h, dev.style);
        if (!dev.established && gap >= 5) { dev.established = true; h.style = dev.style; news(state, `${h.name} のプレースタイルが「${DEV_STYLES[dev.style].label}」として確立`); report.items.push({ type: "milestone", text: `スタイル確立: ${DEV_STYLES[dev.style].label}（${DEV_STYLES[dev.style].desc.split("。")[1] || ""}）` }); report.stops.push("milestone"); }
        else if (dev.established && gap < 3) { dev.established = false; report.items.push({ type: "sharp", text: `${DEV_STYLES[dev.style].label}の特徴が薄れた（キー能力の差 ${gap}）` }); }
      }
    }
    report.surfDelta = surfDelta;
    pushAttrHist(state);
    state.human.rankHist = state.human.rankHist || [];
    state.human.rankHist.push({ t: state.t, year: state.year, week: state.week, rank: h.rank, pts: h.points });
    if (state.human.rankHist.length > 160) state.human.rankHist.shift();
    normalizeNumbers(state);
    for (const g of state.human.gpNew || []) report.items.push({ type: "gp", text: `成長ポイント +${g.n}（${g.why}）。選手タブで特性を習得できる（残り ${state.human.gp}）` });
    state.human.gpNew = [];
    report.news = state.history.news.slice(report.newsStart).map((n) => n.text);
    report.rivalNote = rv && !rv.retired ? `${rv.name}: ${rv.rank ? rv.rank + "位" : "ランク外"}` : null;
    state.lastReport = report;
    return report;
  }

  function distKm(c1, c2) {
    const a = D.COUNTRIES[c1] && D.COUNTRIES[c1].ll, b = D.COUNTRIES[c2] && D.COUNTRIES[c2].ll;
    if (!a || !b) return 3000;
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
  }
  // ---------- sponsors (v1.6): brand contracts per category ----------
  const SPONSOR_SCALE = [[1, 40], [5, 40], [10, 25], [20, 12], [50, 5], [100, 2.5], [200, 0.8], [300, 0.3], [500, 0.12]];
  function sponsorsOf(state) { return state.human.sponsors || (state.human.sponsors = { racket: null, apparel: null, shoes: null, other: [] }); }
  function brandOf(cat, id) { return (D.SPONSORS[cat] || []).find((b) => b.id === id); }
  // weekly pay a brand would offer now (k$/week), fixed for the contract term once signed
  function sponsorOffer(state, cat, brand) {
    const h = human(state);
    const r = h.rank || 9999;
    const scale = r > 500 ? 0.08 : interp(SPONSOR_SCALE, r);
    const agent = staffOf(state).agent ? 1.2 : 1;
    const home = brand.id === "bank" && true;
    return Math.max(0.1, Math.round(scale * D.SPONSOR_SHARE[cat] * brand.tier * agent * (home ? 1 : 1) * 10) / 10);
  }
  function sponsorUnlocked(state, brand) { const h = human(state); return (h.rank || 9999) <= brand.unlock; }
  function activeContracts(state) { const sp = sponsorsOf(state); return [sp.racket, sp.apparel, sp.shoes, ...sp.other].filter(Boolean); }
  function signSponsor(state, cat, id, years) {
    const brand = brandOf(cat, id);
    if (!brand || !sponsorUnlocked(state, brand)) return false;
    const sp = sponsorsOf(state);
    if (cat === "other") { if (sp.other.length >= D.SPONSOR_MAX_OTHER || sp.other.some((c) => c.id === id)) return false; }
    else if (sp[cat]) return false;
    years = Math.max(1, Math.min(3, years || 1));
    const pay = sponsorOffer(state, cat, brand);
    const signing = Math.round(pay * 10 * years * 10) / 10; // signing bonus: 10 weeks of pay per contract year
    const c = { cat, id, name: brand.name, pay, years, until: state.t + 52 * years, signed: state.t, signing };
    if (cat === "other") sp.other.push(c); else sp[cat] = c;
    state.human.money += signing;
    state.human.pendingSigning = (state.human.pendingSigning || 0) + signing;
    news(state, `${brand.name} と${years}年契約（${money(pay)}/週、契約金 ${money(signing)}）`);
    return true;
  }
  // every career starts with entry-level deals so income never collapses for a player who ignores the tab
  function starterSponsors(state) {
    const sp = sponsorsOf(state);
    if (sp.racket || sp.apparel || sp.shoes || sp.other.length) return;
    for (const [cat, id] of [["racket", "nova"], ["apparel", "courtline"], ["shoes", "grip"]]) {
      const b = brandOf(cat, id);
      const pay = sponsorOffer(state, cat, b);
      sp[cat] = { cat, id, name: b.name, pay, years: 1, until: state.t + 52, signed: state.t, signing: 0 };
    }
  }
  function sponsorTerminationFee(state, c) { return Math.round(Math.max(0, c.until - state.t) * c.pay * 0.25 * 10) / 10; }
  function releaseSponsor(state, cat, id) {
    const sp = sponsorsOf(state);
    const c = cat === "other" ? sp.other.find((x) => x.id === id) : sp[cat];
    if (!c) return false;
    const fee = sponsorTerminationFee(state, c);
    state.human.money -= fee;
    if (cat === "other") sp.other = sp.other.filter((x) => x.id !== id); else sp[cat] = null;
    news(state, `${c.name} との契約を解除（違約金 ${money(fee)}）`);
    return true;
  }
  // combined perks of every active contract
  function sponsorPerks(state) {
    const P = { serve: 0, ret: 0, rally: 0, injury: 1, recovery: 0, travel: 1, rehab: 1, focus: 0, lag: 0 };
    for (const c of activeContracts(state)) {
      const b = brandOf(c.cat, c.id); if (!b) continue;
      for (const [k, v] of Object.entries(b.perk)) { if (k === "injury" || k === "travel" || k === "rehab") P[k] *= v; else P[k] += v; }
    }
    return P;
  }
  function sponsorWeekly(state) { return Math.round(activeContracts(state).reduce((s, c) => s + c.pay, 0) * 10) / 10; }
  // expiry, risky brands, and title bonuses
  function sponsorTick(state, report) {
    const sp = sponsorsOf(state), rng = state.rng;
    const check = (c) => {
      if (!c) return c;
      const b = brandOf(c.cat, c.id);
      if (state.t >= c.until) {
        news(state, `${c.name} との契約が満了`);
        if (!state.human.event && b && sponsorUnlocked(state, b)) {
          const pay = sponsorOffer(state, c.cat, b);
          state.human.event = { id: "spexpire", title: `${c.name} との契約満了`, text: `${D.SPONSOR_CATS[c.cat]}契約が満了。${c.name} は ${money(pay)}/週 で1年の更新を提示している${pay > c.pay ? "（ランキング上昇で増額）" : ""}。`, cat: c.cat, brand: b.id, pay, choices: [
            { key: "renew", label: "更新する", desc: `${money(pay)}/週 × 1年、契約金 ${money(pay * 10)}` },
            { key: "release", label: "更新しない", desc: "スポンサータブで別のブランドを探す" }] };
          state.human.lastEventT = state.t; report.event = state.human.event; report.stops.push("event");
        } else report.items.push({ type: "sponsor", text: `${c.name} との契約が満了。スポンサータブで再契約できる` });
        return null;
      }
      if (b && b.risky && rng.chance(0.2 / 52)) { const h = human(state); h.attrs.focus = clamp(h.attrs.focus - 1, 25, 99); news(state, `${c.name} が経営破綻。契約は消滅し、イメージが傷ついた`); report.items.push({ type: "sponsor", text: `${c.name} が破綻した` }); return null; }
      return c;
    };
    sp.racket = check(sp.racket); sp.apparel = check(sp.apparel); sp.shoes = check(sp.shoes);
    sp.other = sp.other.map(check).filter(Boolean);
    // tell the player once when a better brand opens up
    const seen = state.human.sponsorSeen || (state.human.sponsorSeen = {});
    const h = human(state);
    if (h.rank) for (const cat of Object.keys(D.SPONSORS)) for (const b of D.SPONSORS[cat]) if (!seen[b.id] && h.rank <= b.unlock) { seen[b.id] = 1; if (b.unlock < 400) { news(state, `${b.name}（${D.SPONSOR_CATS[cat]}）がスポンサー候補に加わった`); report.items.push({ type: "sponsor", text: `${b.name}（${D.SPONSOR_CATS[cat]}）と契約できるようになった` }); } }
  }
  function sponsorTitleBonus(state, T, report) {
    let total = 0; const lines = [];
    const key = T.def.tier === 9 ? "gs" : T.def.tier === 8 ? "m1000" : "title";
    for (const c of activeContracts(state)) {
      const b = brandOf(c.cat, c.id); if (!b) continue;
      const v = b.bonus[key] !== undefined ? b.bonus[key] : key !== "title" ? b.bonus.title || 0 : 0;
      if (v) { total += v; lines.push(`${c.name} ${money(v)}`); }
    }
    if (total) { state.human.money += total; state.human.pendingBonus = (state.human.pendingBonus || 0) + total; news(state, `優勝ボーナス: ${lines.join("、")}`); if (report && report.items) report.items.push({ type: "sponsor", text: `スポンサーの優勝ボーナス ${money(total)}（${lines.join("、")}）` }); }
    return total;
  }
  // ---------- cash crunch (v2.3): getting by when the money runs out ----------
  const BIG_FEDS = ["USA", "FRA", "GBR", "AUS", "ESP", "ITA", "GER", "JPN"];
  const JOBS = {
    club: { label: "欧州クラブリーグ", weeks: 8, cooldown: 16, desc: "週末にクラブ対抗戦。週 $2〜4k（ランキング次第）、試合勘 +4/週、疲労 +6/週、練習効果 ×0.8" },
    lesson: { label: "レッスンのアルバイト", weeks: 8, cooldown: 8, desc: "地元でコーチング。週 $1.2k、練習効果 ×0.6、試合勘 −2/週" },
  };
  function cashOf(state) {
    const H = state.human;
    if (!H.cash) H.cash = { budget: false, loan: 0, loanRate: 0, unpaid: 0, family: false, crowd: false, fedYear: 0, job: null, jobUntil: 0, jobCooldown: {}, crisisYear: 0, lowYear: 0 };
    return H.cash;
  }
  function fedGrant(state) {
    const h = human(state), r = h.rank || 9999;
    const base = r <= 150 ? 25 : r <= 300 ? 15 : r <= 500 ? 8 : 4;
    return Math.round(base * (BIG_FEDS.includes(h.country) ? 1.5 : 1));
  }
  function jobPay(state, key) { const r = human(state).rank || 9999; return key === "club" ? (r <= 200 ? 4 : r <= 400 ? 3 : 2) : 1.2; }
  // what the player can do about money right now (availability + reason)
  function fundingOptions(state) {
    const C = cashOf(state), h = human(state), a = age(state, h), H = state.human;
    const jobBusy = C.job && C.jobUntil > state.t;
    const out = [
      { key: "family", label: "家族からの借金", amount: 40, ok: !C.family, why: C.family ? "一度だけ" : "", desc: "$40k。無利子。賞金とスポンサー収入の一部から返済" },
      { key: "fed", label: "協会の強化費", amount: fedGrant(state), ok: C.fedYear !== state.year && a <= 25, why: a > 25 ? "25歳まで" : C.fedYear === state.year ? "今年は受給済み" : "", desc: `年1回・返済不要。ランキングと協会の規模で決まる（今なら $${fedGrant(state)}k）` },
      { key: "crowd", label: "クラウドファンディング", amount: 0, ok: !C.crowd && (h.rank || 9999) <= 600, why: C.crowd ? "一度だけ" : (h.rank || 9999) > 600 ? "ランキング600位以内" : "", desc: "一度だけ。$15〜35k（母国の注目度次第）" },
      { key: "bank", label: "銀行ローン", amount: 100, ok: C.loan < 250, why: C.loan >= 250 ? "借入上限" : "", desc: "$100k。週0.15%の利息（年約8%）。賞金とスポンサー収入の一部から返済" },
      { key: "club", label: JOBS.club.label, amount: 0, ok: !jobBusy && !(C.jobCooldown.club > state.t), why: jobBusy ? "別の仕事中" : C.jobCooldown.club > state.t ? `あと${C.jobCooldown.club - state.t}週` : "", desc: JOBS.club.desc },
      { key: "lesson", label: JOBS.lesson.label, amount: 0, ok: !jobBusy && !(C.jobCooldown.lesson > state.t), why: jobBusy ? "別の仕事中" : C.jobCooldown.lesson > state.t ? `あと${C.jobCooldown.lesson - state.t}週` : "", desc: JOBS.lesson.desc },
    ];
    return out;
  }
  function useFunding(state, key) {
    const C = cashOf(state), H = state.human, h = human(state);
    const opt = fundingOptions(state).find((o) => o.key === key);
    if (!opt || !opt.ok) return null;
    let amt = 0, text = "";
    if (key === "family") { amt = 40; C.family = true; C.loan += 40; text = "家族から $40k を借りた。勝って返す。"; }
    else if (key === "fed") { amt = fedGrant(state); C.fedYear = state.year; text = `協会から強化費 $${amt}k を受け取った。`; }
    else if (key === "crowd") { amt = Math.round(15 + state.rng.next() * 20 + (h.country === "JPN" ? 5 : 0)); C.crowd = true; text = `クラウドファンディングで $${amt}k が集まった。応援してくれる人がいる。`; }
    else if (key === "bank") { amt = 100; C.loan += 100; C.loanRate = 0.0015; text = "銀行から $100k を借りた。利息がかかる。"; }
    else if (key === "club" || key === "lesson") { C.job = key; C.jobUntil = state.t + JOBS[key].weeks; text = `${JOBS[key].label}を${JOBS[key].weeks}週間引き受けた。`; }
    if (amt) { H.money += amt; H.pendingFunding = (H.pendingFunding || 0) + amt; }
    news(state, text);
    return text;
  }
  function setBudget(state, on) { cashOf(state).budget = !!on; }
  // ---------- money sinks (v1.5): what a wealthy player can buy ----------
  const TAX = 0.3;          // flat tax on prize money and sponsor income
  const AGENT_CUT = 0.15;   // agent's commission on sponsor income and appearance fees
  const ASSETS = {
    jet: { label: "プライベート移動", type: "toggle", cost: 0, unlock: 9999, desc: "チャーター便で移動。移動費 ×3（1回 $25k以上）、長距離移動の疲労を半減" },
    medical: { label: "専属メディカル契約", type: "weekly", cost: 5.8, unlock: 30, desc: "年 $300k。怪我確率 ×0.7、リハビリ費 −50%、離脱期間 −20%" },
    base: { label: "トレーニング拠点", type: "once", cost: 1500, unlock: 50, desc: "一括 $1.5M。練習効果 ＋10%、休養週の回復 ＋5" },
    academy: { label: "アカデミー設立", type: "once", cost: 3000, unlock: 20, desc: "一括 $3M。母国に若手育成の場を作る。毎年アカデミー出身の新人が登場し、引退時の評価に加わる" },
  };
  function assetsOf(state) { return state.human.assets || (state.human.assets = { jet: false, medical: false, base: false, academy: false }); }
  function assetUnlocked(state, k) { const h = human(state); return (h.stats.bestRank || 9999) <= ASSETS[k].unlock || ASSETS[k].unlock >= 9999; }
  function buyAsset(state, k) {
    const A = ASSETS[k], as = assetsOf(state);
    if (!A || !assetUnlocked(state, k)) return false;
    if (A.type === "toggle" || A.type === "weekly") { as[k] = !as[k]; news(state, `${A.label}: ${as[k] ? "開始" : "解約"}`); return true; }
    if (as[k] || state.human.money < A.cost) return false;
    state.human.money -= A.cost; as[k] = true;
    state.human.pendingPurchase = (state.human.pendingPurchase || 0) + A.cost;
    news(state, `${A.label} に $${(A.cost / 1000).toFixed(1)}M を投資`);
    return true;
  }
  function assetsWeekly(state) { const as = assetsOf(state); let c = 0; for (const k of Object.keys(ASSETS)) if (as[k] && ASSETS[k].type === "weekly") c += ASSETS[k].cost; return c; }
  // Travelling party: the player, the coach and the staff who travel.
  function partySize(state) {
    if (cashOf(state).budget) return 1; // budget mode: the player travels alone
    const st = staffOf(state);
    let n = 1 + (state.human.coach ? 1 : 0);
    for (const k of Object.keys(ROLES)) if (st[k] && ROLES[k].travels) n++;
    return n;
  }
  // Travel is priced from where the player is (home, or the last event when playing back-to-back weeks)
  // to the event, per travelling person: flights by distance plus lodging; two-week events cost an extra week of lodging.
  function travelQuote(state, T) {
    const home = human(state).country;
    const from = state.human.loc || home;
    const dist = distKm(from, T.country);
    const party = partySize(state);
    // top players travel the way their status demands: better flights and hotels for the whole party
    const r = human(state).rank || 9999;
    const cls = r <= 10 ? 2.5 : r <= 30 ? 2.0 : r <= 100 ? 1.4 : 1;
    const perHead = (0.35 + 0.25 * (dist / 1000) + 0.4 + (T.def.weeks === 2 ? 0.4 : 0)) * cls;
    const sp = sponsorPerks(state);
    const budget = cashOf(state).budget;
    let cost = perHead * party * sp.travel * (budget ? 0.6 : 1);
    const jet = assetsOf(state).jet;
    if (jet) cost = Math.max(25, cost * 3);
    // long-haul fatigue (jet lag) carried into the following week; a charter halves it
    const lag = Math.max(0, (dist > 8000 ? 6 : dist > 4000 ? 3 : 0) * (jet ? 0.5 : 1) * (budget ? 1.5 : 1) - (dist > 4000 ? sp.lag : 0)) + (budget ? 3 : 0);
    return { from, to: T.country, dist, party, cls, jet, budget, lag, cost: Math.round(cost * 10) / 10 };
  }
  function travelCost(state, T) {
    return travelQuote(state, T).cost;
  }

  // Weeks of tournament play in the last n weeks (two-week events count double).
  function recentLoad(state, h, n) {
    const seen = new Set();
    let load = 0;
    for (const r of h.results) {
      if (r.cat === "PREV" || r.t <= state.t - n || seen.has(r.t)) continue;
      seen.add(r.t);
      load += D.CATS[r.cat] && D.CATS[r.cat].weeks === 2 ? 2 : 1;
    }
    return load;
  }
  const STRATEGIES = {
    big: { label: "ビッグイベント優先", desc: "GS・マスターズ・自国大会を最優先し、前週は休んで万全で臨む。年15〜22大会" },
    points: { label: "ポイント重視", desc: "出られる週はほぼ毎週出る。負荷上限 +1、休養は疲労55から。ランキングは伸びやすいが怪我と疲労のリスク" },
    develop: { label: "育成重視", desc: "大会を絞って練習週を増やし、練習効果 ×1.2。本戦ダイレクトインのATP大会と優先イベントだけ。試合勘は落ちやすい" },
    regional: { label: "移動最小", desc: "今いる地域の大会を優先し、8,000km超の移動は優先イベント以外しない。移動費と時差疲労を抑える" },
  };
  function autoAction(state, tours) {
    const h = human(state);
    if (tours.length === 0) return { type: "camp", focus: state.human.focus, reason: "オフシーズン。合宿で集中的に鍛える" };
    const r = rank6(state, h);
    const strat = STRATEGIES[state.human.strategy] ? state.human.strategy : "big";
    // Real-world pacing: top players ~15-22 events/year, top-50 ~22-26, lower tiers ~26-30.
    const load8 = recentLoad(state, h, 8);
    const maxLoad = strat === "develop" ? (r <= 20 ? 3 : 4) : (r <= 20 ? 4 : r <= 100 ? 5 : 6) + (strat === "points" ? 1 : 0);
    const restAt = strat === "points" ? 55 : strat === "develop" ? 35 : 45;
    const from = state.human.loc || h.country;
    const lastWeek = h.results.find((x) => x.t === state.t - 1 && x.cat !== "PREV");
    const bigLast = lastWeek && D.CATS[lastWeek.cat] && D.CATS[lastWeek.cat].tier >= 9;
    const ranked = tours.filter((T) => T.cat !== "FINALS").map((T) => ({ T, st: humanStatus(state, T) }));
    // Priority events: Grand Slams, Masters 1000 and home-country ATP events come first. They
    // override the pacing rules below (only exhaustion keeps the player out), and the week
    // before a Slam or Masters is kept free so the player arrives fresh.
    const prio = (T) => (T.def.tier === 9 ? 3 : T.def.tier === 8 ? 2 : T.def.tier >= 6 && T.country === h.country ? 2 : 0);
    // qualifying is worth it for a Slam (points and prize money even when losing), for a Masters
    // only near the cut, for a home ATP event only inside the top 150
    const qualOk = (T) => (T.def.tier === 9 ? r <= 250 : T.def.tier === 8 ? r <= 90 : r <= 150);
    const enterable = (x) => x.st.code === "direct" || x.st.code === "bubble" || (x.st.code === "qual" && qualOk(x.T)) || (x.st.code === "wc" && x.T.country === h.country && (r <= 250 || state.human.wcBoostUntil > state.t));
    const big = ranked.filter((x) => prio(x.T) > 0 && enterable(x)).sort((a, b) => prio(b.T) - prio(a.T) || b.T.def.tier - a.T.def.tier)[0];
    const prioName = (T) => (T.def.tier === 9 ? "グランドスラム" : T.def.tier === 8 ? "マスターズ1000" : "自国のATP大会");
    if (big) {
      if (h.fatigue > 65) return { type: "rest", reason: `${prioName(big.T)}の週だが疲労が${Math.round(h.fatigue)}。無理をせず休養` };
      return { type: "enter", tid: big.T.id, auto: true, reason: `${prioName(big.T)}を最優先（${big.st.label}）` };
    }
    // look ahead: a Slam or Masters next week → arrive fresh
    let nextWeek = state.week + 1, nextYear = state.year;
    if (nextWeek > 52) { nextWeek = 1; nextYear++; }
    const nextBig = weekTournaments(state, nextWeek, nextYear).filter((T) => T.def.tier >= 8).map((T) => ({ T, st: humanStatus(state, T) })).find(enterable);
    if (nextBig && strat !== "points" && (h.fatigue > 25 || load8 >= maxLoad - 1 || (h.consec || 0) >= 2)) return { type: h.fatigue > 20 ? "rest" : "train", focus: state.human.focus, reason: `来週の${nextBig.T.name}に備えて${h.fatigue > 20 ? "休養" : "調整練習"}` };
    if (h.fatigue > restAt) return { type: "rest", reason: `疲労が${Math.round(h.fatigue)}で高い。休養して回復` };
    if (bigLast && h.fatigue > 25) return { type: "rest", reason: "グランドスラムの翌週は休養" };
    if (load8 >= maxLoad) return { type: h.fatigue > 30 ? "rest" : "train", focus: state.human.focus, reason: `直近8週の負荷が上限（${load8}/${maxLoad}）。出場数の目安を守る` };
    if ((h.consec || 0) >= 3 && strat !== "points") return { type: "train", focus: state.human.focus, reason: "3週連戦のあとは練習週にする" };
    if (state.human.money < 20 && state.human.lastRegion) ranked.sort((a, b) => b.T.def.tier - a.T.def.tier || (b.T.region === state.human.lastRegion) - (a.T.region === state.human.lastRegion));
    if (strat === "regional") ranked.sort((a, b) => { const da = distKm(from, a.T.country), db = distKm(from, b.T.country); const za = da > 8000 ? 2 : da > 3000 ? 1 : 0, zb = db > 8000 ? 2 : db > 3000 ? 1 : 0; return za - zb || b.T.def.tier - a.T.def.tier; });
    const pick = (codes, pred) => ranked.find((x) => codes.includes(x.st.code) && (!pred || pred(x.T)) && (strat !== "regional" || distKm(from, x.T.country) <= 8000));
    const atpOnly = (T) => T.def.tier >= 6;
    // top-20 players skip most 250s unless at home or under-played
    const skip250 = (T) => !(r <= 20 && T.def.tier === 6 && T.country !== h.country && load8 >= 2 && strat !== "points");
    // rusty: take any direct entry to get matches
    if ((h.sharp || 65) < 45 && !h.injury) { const any = pick(["direct"]); if (any) return { type: "enter", tid: any.T.id, auto: true, reason: `試合勘が落ちている（${Math.round(h.sharp)}）。試合数を取り戻す` }; }
    let c;
    if (strat === "develop") c = pick(["direct"], (T) => atpOnly(T) && skip250(T)) || (r > 100 ? pick(["direct"]) : null);
    else if (r > 80) {
      // outside the top 80, a Challenger main draw earns far more than an ATP qualifying loss
      c = pick(["direct"], atpOnly) || pick(["direct"], (T) => T.def.tier >= 4) || pick(["bubble"], atpOnly) || (r <= 120 ? pick(["qual"], (T) => T.def.tier >= 6) : null) || pick(["wc"], (T) => T.country === h.country && T.def.tier >= 6);
    } else c = pick(["direct"], (T) => atpOnly(T) && skip250(T)) || pick(["bubble"], atpOnly) || pick(["qual"], (T) => T.def.tier >= 6 && r <= 250) || pick(["wc"], (T) => T.country === h.country && T.def.tier >= 6);
    if (!c && strat !== "develop" && (r > 50 || strat === "points")) c = pick(["direct"], (T) => T.def.tier >= 4 || r > 100) || pick(["bubble"]) || pick(["wc"], (T) => T.def.tier <= 2);
    if (!c && r <= 100 && h.fatigue > 35) return { type: "rest", reason: "出られるツアー大会がない週。疲労もあるので休養" };
    if (c) return { type: "enter", tid: c.T.id, auto: true, reason: (strat === "regional" ? "移動を抑えつつ、" : strat === "points" ? "ポイントを稼ぐため、" : "") + (c.st.code === "direct" ? "出られる最上位の大会（本戦ダイレクトイン見込み）" : c.st.code === "bubble" ? "当落線上だが最上位の大会に挑む" : c.st.code === "qual" ? "予選から上のカテゴリーに挑戦" : "ワイルドカードに期待してエントリー") };
    return { type: "train", focus: state.human.focus, reason: strat === "develop" ? "育成重視: 大会を絞って練習週にする" : "出られる大会がないので練習週" };
  }

  // ---------- season end ----------
  function endSeason(state) {
    const rng = state.rng;
    const h = human(state);
    const rv = rival(state);
    const yr = state.year;
    const summary = { year: yr, calendarYear: START_YEAR + yr - 1 };
    const myRes = h.results.filter((r) => r.year === yr);
    const myMatches = state.history.matches.filter((m) => m.year === yr);
    summary.tournaments = new Set(myRes.map((r) => r.t)).size;
    summary.injuries = (state.human.injuryLog || []).filter((i) => i.year === yr).map((i) => `${i.label}（${i.weeks}週）`);
    summary.titleCats = myRes.filter((r) => r.round === "優勝").map((r) => r.cat);
    const rankAt = (t) => { const e = (state.human.rankHist || []).find((x) => x.t === t); return e && e.rank ? e.rank : 9999; };
    summary.upsets = myMatches.filter((m) => m.won && m.oppRank && m.oppRank < rankAt(m.t) - 20).length;
    summary.w = myMatches.filter((m) => m.won).length;
    summary.l = myMatches.length - summary.w;
    summary.titles = myRes.filter((r) => r.round === "優勝").map((r) => r.tid.startsWith("L") ? r.name : `${r.name} (${D.CATS[r.cat].short})`);
    summary.finals = myRes.filter((r) => r.round === "準優勝").length;
    summary.rank = h.rank;
    summary.points = h.points;
    summary.prize = Math.round(myRes.reduce((s, r) => s + r.prize, 0));
    summary.money = Math.round(state.human.money);
    awardGP(state, GP_AWARD.season, "シーズン終了", null);
    const wins = myMatches.filter((m) => m.won && m.oppRank).sort((a, b) => a.oppRank - b.oppRank);
    summary.bestWin = wins[0] ? `${wins[0].opp}（${wins[0].oppRank}位）${wins[0].tour} ${wins[0].round} ${wins[0].score}` : "なし";
    const rvM = myMatches.filter((m) => m.oppId === state.rivalId);
    summary.rivalH2H = rv ? { name: rv.name, w: rvM.filter((m) => m.won).length, l: rvM.filter((m) => !m.won).length, rank: rv.rank, titles: rv.results.filter((r) => r.year === yr && r.round === "優勝").length, heat: state.human.rivalry.heat, label: rivalryLabel(state.human.rivalry.heat) } : null;
    const bySurf = {};
    for (const m of myMatches) { bySurf[m.surface] = bySurf[m.surface] || { w: 0, l: 0 }; bySurf[m.surface][m.won ? "w" : "l"]++; }
    summary.bySurface = bySurf;
    // points to defend next year by quarter
    const q = [0, 0, 0, 0];
    for (const r of myRes) q[Math.min(3, Math.floor((r.week - 1) / 13))] += r.pts;
    summary.defend = q;
    summary.overall = TL.overall(h);
    summary.age = age(state, h);
    const hr = h.potential - TL.overall(h);
    summary.coach = hr > 20 ? "コーチ: 「伸びしろはまだ大きい。土台を作る年にしよう」" : hr > 10 ? "コーチ: 「まだ伸びる。弱点を一つずつ潰そう」" : hr > 4 ? "コーチ: 「完成が近い。勝ち方を覚える段階だ」" : "コーチ: 「技術はほぼ完成形。維持とスケジュール管理が課題」";
    if (age(state, h) >= 30) summary.coach += " 身体のケアを優先する時期に入っている。";
    summary.no1 = state.players.filter((p) => p.rank === 1).map((p) => p.name)[0] || "-";
    summary.gsWinners = state.history.tournaments.filter((t) => t.year === yr && t.cat === "GS").map((t) => `${t.name}: ${t.winner}`);
    summary.ovrDelta = (h.stats.seasons.length ? summary.overall - h.stats.seasons[h.stats.seasons.length - 1].overall : null);
    const fin = { prize: 0, support: 0, rankSponsor: 0, contracts: 0, signing: 0, extra: 0, base: 0, team: 0, travel: 0, tax: 0, agentFee: 0, rehab: 0, assetsCost: 0, purchase: 0, jobIncome: 0, funding: 0, loanPay: 0 };
    for (const e of (state.human.ledger || [])) if (e.year === yr) for (const k of Object.keys(fin)) fin[k] += e[k] || 0;
    for (const k of Object.keys(fin)) fin[k] = Math.round(fin[k] * 10) / 10;
    summary.finance = fin;
    const sa = state.human.seasonStartAttrs || h.attrs;
    summary.attrDelta = ATTRS.map((k) => [k, Math.round((h.attrs[k] - sa[k]) * 10) / 10]).filter((x) => Math.abs(x[1]) >= 0.1).sort((a, b) => b[1] - a[1]);
    state.human.seasonStartAttrs = Object.assign({}, h.attrs);
    state.human.coachOffers = genCoachOffers(state);
    h.stats.seasons.push({ year: yr, rank: h.rank, overall: summary.overall, titles: summary.titles.length, w: summary.w, l: summary.l });
    state.history.seasons.push(summary);

    // aging, retirements, newcomers
    const retired = [];
    for (const p of state.players) {
      if (p.retired) continue;
      const a = age(state, p) + 1; // age next season
      const ga = a + (p.growth === "late" ? -2 : p.growth === "early" ? 2 : 0);
      if (ga >= 30) {
        // physical decline from 30, steepening in the mid-thirties; technique erodes later and slower
        const dec = (ga - 29) * (ga >= 34 ? 0.95 : 0.8) * (p.fragile ? 1.5 : 1);
        for (const k of ["speed", "stamina", "power"]) p.attrs[k] = clamp(p.attrs[k] - dec * (0.7 + 0.6 * rng.next()), 25, 99);
        p.attrs.durability = clamp(p.attrs.durability - (ga >= 34 ? 1.2 : 0.6), 25, 99);
        for (const k of ["serve", "fh", "bh", "return"]) p.attrs[k] = clamp(p.attrs[k] - dec * (ga >= 34 ? 0.6 : 0.4) * rng.next(), 25, 99);
      }
      if (ga < 33) p.attrs.clutch = clamp(p.attrs.clutch + 0.4, 25, 99);
      if (p.isHuman) continue;
      assignAiTraits(state, p);
      const r = p.rank || 9999;
      let retire = false;
      if (a >= 37) retire = r > 30 || rng.chance(0.35); // a 37-year-old in the top 30 may well go on
      else if (a >= 34 && r > 100 && rng.chance(0.6)) retire = true;
      else if (a >= 31 && r > 250 && rng.chance(0.6)) retire = true;
      else if (a >= 29 && r > 320 && rng.chance(0.5)) retire = true;
      if (!retire && a >= 27 && !p.rank && rng.chance(0.5)) retire = true;
      if (!retire && a >= 25 && r > 280 && rng.chance(0.35)) retire = true; // journeymen leave the lower tiers, making room for juniors
      if (retire) { p.retired = true; p.retiredYear = yr; p.rank = null; p.points = 0; p.results = []; if (!(p.stats.bestRank && p.stats.bestRank <= 30) && !p.isRival) delete p.big; retired.push(p); }
    }
    summary.retired = retired.filter((p) => p.real || p.isRival || (p.stats.bestRank && p.stats.bestRank <= 30)).map((p) => `${p.name}（最高${p.stats.bestRank || "-"}位、${p.stats.titles}勝）`);
    if (rv && rv.retired) news(state, `宿敵 ${rv.name} が現役引退を表明`);
    const academy = assetsOf(state).academy;
    const active = state.players.filter((p) => !p.retired).length;
    const need = Math.max(18, ROSTER + 1 - active);
    const newcomers = [];
    for (let i = 0; i < need; i++) {
      const country = randomCountry(rng);
      const a = rng.pick([16, 17, 17, 18, 18, 19, 20]);
      const grad = academy && i === 0;
      // newcomers: junior-circuit graduates at 50-56 with a ceiling drawn on an absolute scale
      // (about a third can reach the top 100, a few the top 10), so the tour keeps renewing itself
      // ~6% are blue-chip prospects: further along at turning pro and with a high ceiling
      const elite = rng.chance(grad ? 0.25 : 0.12);
      const ovr0 = 51 + rng.gauss(0, 3) + (a - 17) * 1.5 + (grad ? 3 : 0) + (elite ? 6 : 0);
      const p = newPlayer(state, { name: randomName(rng, grad ? h.country : country), country: grad ? h.country : country, birthYear: START_YEAR + yr - a, overall: ovr0, potential: clamp(Math.max(ovr0 + 5, rng.gauss(63, 7) + (elite ? 18 : 0)), 50, 95) });
      if (grad) { p.academy = true; news(state, `${h.name} のアカデミーから ${p.name}（${a}歳）がプロ転向`); }
      state.players.push(p);
      if (rng.chance(0.6)) p.results.push({ t: state.t - rng.int(1, 20), tid: "jr", name: "ITF下部大会", cat: "M15", pts: rng.int(5, 40), prize: 0, round: "-" });
      newcomers.push(p);
    }
    const hot = newcomers.slice().sort((a, b) => b.potential - a.potential)[0];
    summary.newcomer = hot ? `注目の新人: ${hot.name}（${D.COUNTRIES[hot.country].name}、${age(state, hot) + 1}歳）` : "";
    // career end: chosen (this season / farewell season) or forced by age AND ranking — never by age alone
    const nextAge = age(state, h) + 1;
    const forced = forcedRetire(nextAge, h.rank);
    const farewell = state.human.retireYear && yr >= state.human.retireYear;
    if (forced || farewell || state.human.retireAtSeasonEnd) {
      state.human.careerOver = true;
      state.human.retireReason = forced && !farewell && !state.human.retireAtSeasonEnd ? forced : farewell ? "ラストシーズンを終えて引退" : "引退を決断";
      news(state, `${h.name} が現役引退を表明（${state.human.retireReason}）`);
      state.human.epilogue = epilogue(state);
    }
    return summary;
  }

  // Forced end of a career: the tour no longer has room for the player (age and ranking together).
  function forcedRetire(nextAge, rank) {
    const r = rank || 9999;
    if (nextAge >= 34 && r > 250) return `${nextAge}歳で${rank ? rank + "位" : "ランク外"}。ツアーで戦える場所がなくなった`;
    if (nextAge >= 38 && r > 100) return `${nextAge}歳でトップ100の外。身体がツアーの水準についてこなくなった`;
    return null;
  }
  function epilogue(state) {
    const h = human(state);
    const s = h.stats;
    const titlesBySurf = {};
    const allTitles = state.history.tournaments.filter((t) => t.winnerId === h.id);
    for (const t of allTitles) titlesBySurf[t.surface] = (titlesBySurf[t.surface] || 0) + 1;
    const total = allTitles.length;
    let tag;
    if (s.gs >= 5) tag = "時代を作った王者";
    else if (s.weeksNo1 > 0 && s.gs === 0) tag = "GS無冠のNo.1";
    else if (s.gs >= 1) tag = "グランドスラム・チャンピオン";
    else if (total && (titlesBySurf.clay || 0) / total >= 0.6) tag = "クレーの職人";
    else if (total && (titlesBySurf.grass || 0) / total >= 0.5) tag = "芝のスペシャリスト";
    else if (s.bestRank && s.bestRank <= 10) tag = "トップ10の常連";
    else if (s.bestRank && s.bestRank <= 50) tag = "ツアーを生き抜いた職人";
    else if (s.bestRank && s.bestRank <= 150) tag = "チャレンジャーの旅人";
    else tag = "夢を追い続けた男";
    const firstTitle = state.history.seasons.find((x) => x.titles.length > 0);
    const late = firstTitle && firstTitle.age >= 27 ? "遅咲きの" : "";
    const hof = s.gs >= 2 || s.weeksNo1 >= 20 || (s.gs >= 1 && s.m1000 >= 3);
    const byCat = {};
    for (const t of allTitles) byCat[t.cat] = (byCat[t.cat] || 0) + 1;
    return {
      timeline: state.history.seasons.map((z) => ({ y: z.calendarYear, age: z.age, rank: z.rank, titles: z.titles.length, w: z.w, l: z.l })), byCat, injuries: (state.human.injuryLog || []).length,
      tag: late + tag, hof, name: h.name, country: h.country, origin: state.config.origin, seasons: state.history.seasons.length, titles: total, gs: s.gs, m1000: s.m1000, bestRank: s.bestRank, weeksNo1: s.weeksNo1, prize: Math.round(s.prize), w: s.w, l: s.l,
      lines: [
        `通算 ${s.w}勝${s.l}敗、タイトル${total}（GS ${s.gs}、1000 ${s.m1000}）`,
        `最高ランキング ${s.bestRank || "-"}位、No.1在位 ${s.weeksNo1}週、トップ10在位 ${s.weeksTop10}週`,
        `生涯賞金 $${(s.prize / 1000).toFixed(2)}M`,
        hof ? "国際テニス殿堂に選出" : "殿堂入りには届かなかったが、記録はここに残る",
        ...(assetsOf(state).academy ? [`母国にアカデミーを設立。${state.players.filter((p) => p.academy).length}人の卒業生がツアーに出た`] : []),
      ],
      academy: !!assetsOf(state).academy,
    };
  }

  // Voluntary retirement: ends the career now (season summary for the partial season is generated).
  function retireNow(state) {
    const h = human(state);
    if (state.human.careerOver) return;
    state.human.careerOver = true;
    state.human.epilogue = epilogue(state);
    news(state, `${h.name} が現役引退を表明`);
  }

  // Likely headliners for an event: best-ranked available players under the expected cutoff.
  function likelyEntrants(state, T, n) {
    const cut = expectedCut(state, T);
    const floor = T.def.tier <= 2 ? 200 : T.def.tier <= 3 ? 100 : T.def.tier <= 5 ? 50 : 0; // top players skip lower tiers
    return state.players.filter((p) => !p.retired && !p.isHuman && !p.injury && p.rank && p.rank <= cut && p.rank > floor && !(T.def.tier === 6 && p.rank <= 10 && p.country !== T.country)).sort((a, b) => a.rank - b.rank).slice(0, n || 4);
  }

  // ---------- public view of any player (no hidden potential) ----------
  function playerInfo(state, id) {
    const p = state.players.find((x) => x.id === id);
    if (!p) return null;
    const h = human(state);
    const h2h = state.history.matches.filter((m) => m.oppId === id);
    const titles = state.history.tournaments.filter((t) => t.winnerId === id);
    const seasonRes = p.results.filter((r) => r.year === state.year || (r.t > state.t - 52 && r.cat !== "PREV"));
    // Scouting precision: your own numbers are exact; other players are estimates whose error
    // shrinks with head-to-heads and vanishes with an analyst on staff. The noise is deterministic
    // per player/attribute/season so the report does not flicker between views.
    const exact = p.isHuman || !!staffOf(state).analyst;
    const amp = exact ? 0 : h2h.length >= 3 ? 2 : h2h.length >= 1 ? 4 : 6;
    const noise = (k) => (amp ? Math.round(((TL.RNG.hash(`${state.seed}:${p.id}:${k}:${state.year}`) % 2001) / 1000 - 1) * amp) : 0);
    const attrs = {};
    for (const k of ATTRS) attrs[k] = clamp(Math.round(p.attrs[k]) + noise(k), 25, 99);
    const surf = {};
    for (const k of Object.keys(p.surf)) surf[k] = clamp(Math.round(p.surf[k]) + noise("s" + k), 20, 85);
    const ovrEst = exact ? Math.round(TL.overall(p) * 10) / 10 : Math.round(TL.overall(p) + noise("ovr") / 2);
    const peers = state.players.filter((x) => !x.retired && x.rank && Math.abs(x.birthYear - p.birthYear) <= 1);
    return { id: p.id, name: p.name, country: p.country, age: age(state, p), hand: p.hand, style: p.style, rank: p.rank, points: p.points, bestRank: p.stats.bestRank, traits: aiTraitList(p).map((t) => ({ id: t.id, label: t.label, l: exact || h2h.length ? t.l : null })), overall: ovrEst, strength: strengthOf(state, p, exact ? null : { overall: ovrEst, surf }), scout: { exact, amp, seen: h2h.length },
      attrs, surf, w: p.stats.w, l: p.stats.l, titles: p.stats.titles, gs: p.stats.gs, m1000: p.stats.m1000, prize: p.stats.prize, injury: p.injury, fatigue: Math.round(p.fatigue), retired: p.retired,
      isHuman: p.isHuman, isRival: !!p.isRival, real: p.real, sharp: Math.round(p.sharp === undefined ? 65 : p.sharp), sharpLabel: sharpLabel(p.sharp === undefined ? 65 : p.sharp), conf: Math.round(p.conf || 0), confLabel: confLabel(p.conf || 0), h2hW: h2h.filter((m) => m.won).length, h2hL: h2h.filter((m) => !m.won).length, h2h: h2h.slice(-6).reverse(),
      titleList: titles.slice(-8).reverse(), tournaments52: new Set(seasonRes.map((r) => r.t)).size, peers: peers.length,
      peerPos: p.rank ? peers.filter((x) => x.rank < p.rank).length + 1 : null, growth: p.growth, cs: csView(p.cs || initCs()) };
  }

  // Keep in-memory numbers identical to what the save stores (2 decimals), so a reload is bit-for-bit the same.
  function normalizeNumbers(state) {
    const r2 = (x) => Math.round(x * 100) / 100;
    for (const p of state.players) {
      if (p.retired) continue;
      for (const k of ATTRS) p.attrs[k] = r2(p.attrs[k]);
      for (const k of Object.keys(p.surf)) p.surf[k] = r2(p.surf[k]);
      p.fatigue = r2(p.fatigue);
      p.sharp = r2(p.sharp === undefined ? 65 : p.sharp); p.conf = r2(p.conf || 0);
      p.potential = r2(p.potential);
      p.stats.prize = r2(p.stats.prize);
    }
    state.human.money = r2(state.human.money);
  }

  // ---------- serialization ----------
  function serialize(state) {
    const copy = Object.assign({}, state);
    copy.rngState = state.rng.getState();
    delete copy.rng;
    delete copy.lastReport;
    delete copy._watch;
    return JSON.stringify(copy, (k, v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v));
  }
  function deserialize(json) {
    const s = JSON.parse(json);
    s.rng = new TL.RNG(1);
    s.rng.setState(s.rngState);
    const H = s.human;
    Object.assign(H, { coach: H.coach || null, physio: !!H.physio, coachOffers: H.coachOffers || [], plan: H.plan || "balanced", switchRule: H.switchRule || "none", event: H.event || null, lastEventT: H.lastEventT === undefined ? -99 : H.lastEventT, forceRest: !!H.forceRest, riskWeek: H.riskWeek === undefined ? -1 : H.riskWeek, sponsor2: H.sponsor2 || { weekly: 0, until: 0 }, pressureUntil: H.pressureUntil === undefined ? -1 : H.pressureUntil, attrHist: H.attrHist || [], seasonStartAttrs: H.seasonStartAttrs || null, exhibitionYear: H.exhibitionYear || 0 });
    s.cutoffs = s.cutoffs || {};
    if (!DIFFICULTY[s.config.difficulty]) s.config.difficulty = "normal";
    for (const p of s.players) if (!p.cs) p.cs = p.isHuman ? statsFromHistory(s) : initCs();
    for (const p of s.players) { if (p.sharp === undefined) p.sharp = p.injury ? 30 : 65; if (p.conf === undefined) p.conf = 0; if (p.mw === undefined) p.mw = 0; }
    if (!H.strategy) H.strategy = "big";
    H.dev = H.dev || { style: null, intensity: "normal", auto: false, established: false };
    H.actLog = H.actLog || [];
    cashOf(s); H.cash.jobCooldown = H.cash.jobCooldown || {};
    backfillBig(s);
    if (!RIVALS && s.rivalId !== null) { s.rivalId = null; for (const p of s.players) if (p.isRival) delete p.isRival; }
    if (!H.aiTraitsInit) { H.aiTraitsInit = true; for (const p of s.players) if (!p.isHuman && !p.retired) assignAiTraits(s, p); }
    allocOf(s);
    // v2.4: the old default (serve 5 / strokes 5) built lopsided players; move untouched defaults to the balanced one
    if (!H.allocV2) { const a = H.alloc; if (a.serve === 5 && a.stroke === 5 && !a.ret && !a.physical && !a.mental && !a.match) H.alloc = { serve: 3, stroke: 3, ret: 3, physical: 1, mental: 0, match: 0 }; H.allocV2 = true; }
    H.gp = H.gp || 0; H.gpLog = H.gpLog || []; H.traits = H.traits || []; traitLevels(s);
    H.rivalry = H.rivalry || { heat: 25, log: [], flags: {}, lastCross: -99 };
    H.rivalry.flags = H.rivalry.flags || {};
    if (H.rivalAhead === undefined) H.rivalAhead = null;
    if (H.focusBoostUntil === undefined) H.focusBoostUntil = -1;
    H.assets = H.assets || { jet: false, medical: false, base: false, academy: false };
    if (H.investment === undefined) H.investment = null;
    H.pendingPurchase = H.pendingPurchase || 0;
    H.sponsors = H.sponsors || { racket: null, apparel: null, shoes: null, other: [] };
    H.pendingSigning = H.pendingSigning || 0; H.pendingBonus = H.pendingBonus || 0;
    if (!H.sponsorsInit) { H.sponsorsInit = true; starterSponsors(s); }
    H.ledger = H.ledger || [];
    H.rankHist = H.rankHist || [];
    H.injuryLog = H.injuryLog || [];
    s.history.brackets = s.history.brackets || [];
    if (!H.staff) H.staff = { physio: !!H.physio, fitness: false, hitting: false, agent: false, analyst: false };
    if (!H.coachOffers.length) H.coachOffers = genCoachOffers(s);
    s.lastReport = null;
    return s;
  }

  TL.World = { RIVALS, rehabWeekly, aiTraitList, TRAIT_LV, TRAIT_COST, traitLevels, traitLevel, traitList, traitSlots, traitEffectText, traitReq, dropTrait, bigTimeline, strengthOf, cashOf, fundingOptions, useFunding, setBudget, JOBS, forcedRetire, TRAIN_SLOTS, TRAIN_CATS, allocOf, allocShare, autoAlloc, allocSummary, TRAITS, hasTrait, traitReqOk, learnTrait, DEV_STYLES, INTENSITY, devOf, styleGap, autoFocus, trainRate, STRATEGIES, sharpBonus, sharpLabel, confLabel, sponsorsOf, brandOf, sponsorOffer, sponsorUnlocked, activeContracts, signSponsor, releaseSponsor, sponsorTerminationFee, sponsorPerks, sponsorWeekly, ASSETS, TAX, AGENT_CUT, assetsOf, assetUnlocked, buyAsset, assetsWeekly, DIFFICULTY, csView, statsFromHistory, initCs, rivalryLabel, travelQuote, partySize, distKm, likelyEntrants, terminationFee, compatKnown, compatLabel, renewalTerms, retireNow, injuryFactor, STYLE_LABEL, ROLES, staffOf, roleUnlocked, setStaff, staffCost, playerInfo, recentLoad, create, advanceWeek, advanceWeekGen, weekTournaments, humanStatus, human, rival, age, serialize, deserialize, ATTRS, ATTR_LABEL, START_YEAR, rank6, directCut, interp, OVR_TABLE, autoAction, headroomMult, expectedCut, COACH_TYPES, hireCoach, fireCoach, resolveEvent, genCoachOffers };
})(typeof globalThis !== "undefined" ? globalThis : window);
