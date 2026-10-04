// UI core: shared state, helpers, app frame (rail + topbar), modal, run loop, setup screen.
(function () {
  const W = TL.World, D = TL.DATA;
  const U = (TL.UI = {
    W, D, S: null, tab: "home", modal: null, planSel: null, planWeekT: -1, runLog: null, running: false, screens: {},
    SAVE_KEY: "tourlife_v1", SETTINGS_KEY: "tourlife_settings_v1", HOF_KEY: "tourlife_hof_v1",
    DEFAULT_SETTINGS: { stopTournament: true, stopMilestone: true, stopInjury: true, stopSeason: true, stopEvent: true, stopRival: true, watchEnabled: true, watchGs: true, watchFinals: true, watchRival: true, watchTop10: true, watchTitle: true, watchSpeed: 300 },
    VERSION: "v0.9",
  });
  U.ATTRL = W.ATTR_LABEL;
  U.ORIGINS = {
    junior: { name: "ジュニア王者", age: 16, desc: "ITFジュニア1位相当。資金$60k・スポンサー付き・ホーム大会のWCが有力。ポテンシャル帯は高いが、親の支援は3年で切れる。", diff: "標準", icon: "🏆" },
    grinder: { name: "叩き上げ", age: 18, desc: "ITF M15の予選から。資金$12k、後援会から週$0.5k。耐久性・メンタルが高く怪我に強い。最初の2年はチャレンジャーにも届かない。", diff: "高", icon: "🧗" },
    college: { name: "大学経由", age: 21, desc: "米大学テニス出身。能力の完成度が高く即戦力。協会支援2年。ピークまでの時間が短く、天井は低め。", diff: "中（短期決戦）", icon: "🎓" },
  };
  const ISO = { JPN: "JP", USA: "US", ESP: "ES", FRA: "FR", ITA: "IT", GBR: "GB", AUS: "AU", GER: "DE", ARG: "AR", SRB: "RS", CHN: "CN", BRA: "BR", CAN: "CA", SUI: "CH", NED: "NL", CZE: "CZ", RUS: "RU", GRE: "GR", NOR: "NO", DEN: "DK", POL: "PL", BUL: "BG", CRO: "HR", AUT: "AT", BEL: "BE", POR: "PT", HUN: "HU", KAZ: "KZ", CHI: "CL", COL: "CO", MEX: "MX", KOR: "KR", IND: "IN", RSA: "ZA", QAT: "QA", UAE: "AE", MAR: "MA", MON: "MC", SWE: "SE", FIN: "FI", ROU: "RO", BIH: "BA", TPE: "TW", HKG: "HK", NZL: "NZ", TUN: "TN", EGY: "EG", TUR: "TR", PER: "PE", URU: "UY", ECU: "EC" };
  U.flag = (c) => { const iso = ISO[c]; if (!iso) return c; return String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)); };
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  U.money = (k) => { const sign = k < 0 ? "-" : ""; k = Math.abs(k); return sign + (k >= 1000 ? "$" + (k / 1000).toFixed(2) + "M" : k < 10 ? "$" + k.toFixed(1) + "k" : "$" + Math.round(k) + "k"); };
  U.signed = (x, d) => (x >= 0 ? "+" : "") + x.toFixed(d === undefined ? 1 : d);
  U.cal = (y) => W.START_YEAR + (y || U.S.year) - 1;
  U.human = () => W.human(U.S);
  U.rival = () => W.rival(U.S);
  U.catPill = (T) => `<span class="pill tier${T.def.tier}">${T.def.short}</span> <span class="pill ${T.surface}">${D.SURFACES[T.surface]}</span>`;
  // procedural avatar: initials on a colour derived from the name
  U.avatar = (p, cls) => {
    let h = 0; for (const ch of p.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const hue = h % 360;
    const m = p.name.match(/^([A-Za-z])\./);
    const init = m ? m[1] : p.name.slice(0, 1);
    return `<span class="avatar ${cls || ""}" style="background:linear-gradient(135deg,hsl(${hue},55%,42%),hsl(${(hue + 40) % 360},60%,28%))">${U.esc(init.toUpperCase())}<span class="fl">${U.flag(p.country)}</span></span>`;
  };
  const ICONS = {
    home: '<path d="M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10"/>',
    plan: '<path d="M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="m9 15 2 2 4-4"/>',
    report: '<path d="M4 5h16M4 12h10M4 19h7"/>',
    ranking: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
    calendar: '<path d="M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 2v3M16 2v3"/>',
    player: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20a7 7 0 0 1 14 0M15 20a5 5 0 0 1 7-4"/>',
    finance: '<path d="M3 7h18v12H3zM3 11h18M16 15h2"/>',
    records: '<path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2zM4 18a2 2 0 0 1 2-2h12"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  U.icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  U.TABS = [["home", "ホーム"], ["plan", "プラン"], ["report", "結果"], ["ranking", "ランキング"], ["calendar", "カレンダー"], ["player", "選手"], ["team", "チーム"], ["finance", "財務"], ["records", "記録"], ["settings", "設定"]];

  // ---------- persistence ----------
  U.loadSettings = () => { try { return Object.assign({}, U.DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(U.SETTINGS_KEY) || "{}")); } catch (e) { return Object.assign({}, U.DEFAULT_SETTINGS); } };
  U.settings = U.loadSettings();
  U.saveSettings = () => { try { localStorage.setItem(U.SETTINGS_KEY, JSON.stringify(U.settings)); } catch (e) {} };
  U.watchOpts = () => ({ enabled: U.settings.watchEnabled, gs: U.settings.watchGs, finals: U.settings.watchFinals, rival: U.settings.watchRival, top10: U.settings.watchTop10, titleMatch: U.settings.watchTitle });
  U.save = () => { try { localStorage.setItem(U.SAVE_KEY, W.serialize(U.S)); } catch (e) { console.warn(e); } };
  U.load = () => { try { const j = localStorage.getItem(U.SAVE_KEY); if (j) U.S = W.deserialize(j); } catch (e) { console.warn(e); U.S = null; } };
  U.loadHof = () => { try { return JSON.parse(localStorage.getItem(U.HOF_KEY) || "[]"); } catch (e) { return []; } };
  U.pushHof = (e) => { try { const l = U.loadHof(); l.unshift(Object.assign({ date: new Date().toISOString().slice(0, 10) }, e)); localStorage.setItem(U.HOF_KEY, JSON.stringify(l.slice(0, 30))); } catch (err) {} };

  // ---------- toasts ----------
  U.toast = (html, cls) => {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    const t = document.createElement("div"); t.className = "toast " + (cls || ""); t.innerHTML = html; wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .4s"; setTimeout(() => t.remove(), 400); }, 3800);
  };

  // ---------- frame ----------
  const app = document.getElementById("app");
  U.render = function () {
    const S = U.S;
    if (!S) return U.renderSetup();
    const me = U.human(), rv = U.rival();
    const { esc, flag, money } = U;
    if (!U.modal && S.human.event) U.modal = U.eventHtml(S.human.event);
    const inj = me.injury ? `<span class="chip" style="border-color:var(--red)"><b class="red">${esc(me.injury.label)}</b> 残り${me.injury.weeks}週</span>` : "";
    const delta = me.prevRank && me.rank ? me.prevRank - me.rank : 0;
    const staffN = Object.values(W.staffOf(S)).filter(Boolean).length;
    app.innerHTML = `<div class="app">
      <nav class="rail"><div class="brand"><span class="logo">TL</span><span>Tour Life</span></div>
        ${U.TABS.map(([k, l]) => `<button class="nav ${U.tab === k ? "active" : ""}" data-tab="${k}" title="${l}">${U.icon(k)}<span>${l}</span>${k === "report" && S.human.event ? '<span class="badge">!</span>' : ""}</button>`).join("")}
        <div class="spacer"></div><div class="version">${U.VERSION}</div></nav>
      <div class="main"><header class="topbar">
        <div class="identity">${U.avatar(me)}<div><div class="name">${esc(me.name)}</div><div class="sub">${U.cal()}年 第${S.week}週 ・ ${W.age(S, me)}歳 ・ ${U.ORIGINS[S.config.origin].name}</div></div></div>
        <div class="stat"><span class="l">Ranking</span><span class="v">${me.rank ? me.rank + "位" : "ランク外"}</span><span class="d">${me.points}pt ${delta > 0 ? `<span class="green">▲${delta}</span>` : delta < 0 ? `<span class="red">▼${-delta}</span>` : ""}</span></div>
        <div class="stat"><span class="l">Money</span><span class="v ${S.human.money < 0 ? "red" : ""}">${money(S.human.money)}</span><span class="d">${S.human.ledger && S.human.ledger.length ? (S.human.ledger[S.human.ledger.length - 1].net >= 0 ? '<span class="green">+' : '<span class="red">') + money(S.human.ledger[S.human.ledger.length - 1].net) + "/週</span>" : ""}</span></div>
        <div class="stat"><span class="l">Fatigue ${Math.round(me.fatigue)}</span><div class="gauge"><div style="width:${me.fatigue}%;background:${me.fatigue > 60 ? "var(--red)" : me.fatigue > 40 ? "var(--gold)" : "var(--green)"}"></div></div></div>
        <div class="stat"><span class="l">Record</span><span class="v small">${me.stats.w}勝${me.stats.l}敗</span><span class="d">タイトル ${me.stats.titles}</span></div>
        <div class="stat"><span class="l">Team</span><span class="v small">${S.human.coach ? esc(S.human.coach.name) : "コーチなし"}</span><span class="d">${S.human.coach ? W.COACH_TYPES[S.human.coach.type].label : ""}${staffN ? ` ・ スタッフ${staffN}` : ""}</span></div>
        ${rv ? `<div class="stat"><span class="l">Rival</span><span class="v small" data-player="${rv.id}" style="cursor:pointer">${esc(rv.name)}</span><span class="d">${rv.rank ? rv.rank + "位" : rv.retired ? "引退" : "ランク外"}</span></div>` : ""}
        ${inj}
      </header><div class="content" id="content"></div></div></div>
      ${U.modal ? `<div class="modal-bg" id="modalbg"><div class="modal ${U.modalWide ? "wide" : ""}">${U.modal}</div></div>` : ""}`;
    if (!U.modal) U.modalWide = false;
    app.querySelectorAll(".rail .nav").forEach((b) => b.onclick = () => { U.tab = b.dataset.tab; U.render(); });
    const bg = document.getElementById("modalbg");
    if (bg) {
      bg.onclick = (e) => { if (e.target === bg && !S.human.event) { U.modal = null; U.render(); } };
      app.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => { U.modal = null; U.modalWide = false; U.render(); });
      app.querySelectorAll("[data-confirm-new]").forEach((b) => b.onclick = U.resetGame);
      app.querySelectorAll("[data-confirm-fire]").forEach((b) => b.onclick = () => { W.fireCoach(S); U.save(); U.modal = null; U.render(); });
      app.querySelectorAll("[data-confirm-retire]").forEach((b) => b.onclick = () => { W.retireNow(S); U.save(); U.pushHof(S.human.epilogue); U.modal = `<h2>引退</h2>${U.epilogueHtml()}<button data-close>閉じる</button>`; U.tab = "plan"; U.render(); });
      app.querySelectorAll("[data-choice]").forEach((b) => b.onclick = () => { const txt = W.resolveEvent(S, b.dataset.choice); U.save(); U.modal = `<h2>結果</h2><p>${esc(txt)}</p><button class="primary" data-close>閉じる</button>`; U.render(); });
    }
    U.bindPlayerLinks(app);
    const c = document.getElementById("content");
    (U.screens[U.tab] || U.screens.home)(c);
  };

  // ---------- shared html ----------
  U.playerModalHtml = function (id) {
    const S = U.S, { esc, flag, money, cal } = U, ATTRL = U.ATTRL;
    const p = W.playerInfo(S, id);
    if (!p) return "<p>選手が見つからない</p>";
    const bar = (v, cls) => `<div class="bar"><div style="width:${v}%;background:${cls || (v >= 80 ? "var(--gold)" : v >= 65 ? "var(--green)" : "var(--accent)")}"></div></div>`;
    const attrs = W.ATTRS.map((k) => `<div class="attr" style="grid-template-columns:84px 1fr 36px"><span>${ATTRL[k]}</span>${bar(p.attrs[k])}<span class="num">${p.attrs[k]}</span></div>`).join("");
    const surf = Object.keys(D.SURFACES).map((k) => `<div class="attr" style="grid-template-columns:84px 1fr 36px"><span>${D.SURFACES[k]}</span>${bar(p.surf[k], `var(--${k})`)}<span class="num">${p.surf[k]}</span></div>`).join("");
    return `<div class="row between"><div class="identity">${U.avatar(p)}<div><div class="name">${esc(p.name)} ${p.isRival ? '<span class="pill rival">宿敵</span>' : ""}${p.isHuman ? '<span class="pill">自分</span>' : ""}</div><div class="sub">${p.age}歳 ・ ${D.COUNTRIES[p.country].name} ・ ${p.hand === "L" ? "左利き" : "右利き"} ・ ${W.STYLE_LABEL[p.style] || p.style}</div></div></div><div style="text-align:right"><div class="kpi .v" style="font-size:22px;font-weight:800">${p.retired ? "引退" : p.rank ? p.rank + "位" : "ランク外"}</div><div class="small muted">${p.points}pt ・ 最高${p.bestRank || "-"}位 ・ 総合 ${p.overall}</div></div></div>
      ${p.injury ? `<p class="small red">${esc(p.injury.label)} 残り${p.injury.weeks}週</p>` : ""}
      <div class="grid2" style="margin-top:10px"><div>${attrs}<h3 style="margin-top:8px">サーフェス</h3>${surf}</div>
      <div><div class="kpi"><div class="card"><div class="v">${p.titles}</div><div class="l">タイトル</div></div><div class="card"><div class="v">${p.gs}</div><div class="l">GS</div></div><div class="card"><div class="v">${p.w}-${p.l}</div><div class="l">通算</div></div><div class="card"><div class="v">${money(p.prize)}</div><div class="l">賞金</div></div></div>
        <p class="small">直近52週 ${p.tournaments52}大会 ・ 疲労 ${p.fatigue} ・ 同年代${p.peers}人中${p.peerPos ? p.peerPos + "番目" : "-"}</p>
        ${p.isHuman ? "" : `<p class="small"><b>対戦成績:</b> ${p.h2hW}勝${p.h2hL}敗${p.h2h.length ? "<br>" + p.h2h.map((m) => `<span class="${m.won ? "green" : "red"}">${cal(m.year)} ${esc(m.tour)} ${esc(m.round)} ${m.won ? "W" : "L"} ${esc(m.score)}</span>`).join("<br>") : ""}</p>`}
        ${p.titleList.length ? `<p class="small"><b class="gold">最近のタイトル:</b> ${p.titleList.map((t) => `${cal(t.year)} ${esc(t.name)}`).join("、")}</p>` : ""}</div></div>
      <p class="small muted">能力値はスカウティングレポート（公開情報）。伸びしろは本人にも見えない。</p>
      <button class="primary" data-close>閉じる</button>`;
  };
  U.bindPlayerLinks = (root) => root.querySelectorAll("[data-player]").forEach((el) => { el.style.cursor = "pointer"; el.onclick = (e) => { e.stopPropagation(); U.modal = U.playerModalHtml(parseInt(el.dataset.player, 10)); U.render(); }; });
  U.eventHtml = (ev) => `<h2>${U.esc(ev.title)}</h2><p>${U.esc(ev.text)}</p>${ev.choices.map((c) => `<div class="card"><div class="row between"><div><b>${U.esc(c.label)}</b><div class="small muted">${U.esc(c.desc)}</div></div><button class="primary" data-choice="${c.key}">選ぶ</button></div></div>`).join("")}`;
  U.seasonHtml = function (z) {
    const { esc, money, signed } = U, ATTRL = U.ATTRL;
    const surf = Object.entries(z.bySurface).map(([s, v]) => `${D.SURFACES[s]} ${v.w}-${v.l}`).join(" ・ ");
    return `<h2>${z.calendarYear}年シーズン総括 <span class="muted small">${z.age}歳</span></h2>
      <div class="kpi"><div class="card"><div class="v">${z.rank ? z.rank + "位" : "-"}</div><div class="l">年末ランキング</div></div><div class="card"><div class="v">${z.w}-${z.l}</div><div class="l">年間成績</div></div><div class="card"><div class="v">${z.tournaments || "-"}</div><div class="l">出場大会</div></div><div class="card"><div class="v">${z.titles.length}</div><div class="l">タイトル</div></div><div class="card"><div class="v">${money(z.prize)}</div><div class="l">年間賞金</div></div><div class="card"><div class="v ${z.money < 0 ? "red" : ""}">${money(z.money)}</div><div class="l">資金残高</div></div></div>
      ${z.titles.length ? `<p><b class="gold">優勝:</b> ${z.titles.map(esc).join("、")}</p>` : ""}
      <p><b>ベストマッチ:</b> ${esc(z.bestWin)}</p><p><b>サーフェス別:</b> ${surf || "-"}</p>
      ${z.rivalH2H ? `<p><b>宿敵 ${esc(z.rivalH2H.name)}:</b> 今季の対戦 ${z.rivalH2H.w}勝${z.rivalH2H.l}敗 ・ 相手は${z.rivalH2H.rank ? z.rivalH2H.rank + "位" : "ランク外"}、今季${z.rivalH2H.titles}勝</p>` : ""}
      <p><b>今季の成長:</b> ${(z.attrDelta || []).map(([k, v]) => `<span class="${v > 0 ? "green" : "red"}">${ATTRL[k]} ${signed(v)}</span>`).join(" ・ ") || "—"}</p>
      <p><b>来季の防衛ポイント:</b> 1-3月 ${z.defend[0]} / 4-6月 ${z.defend[1]} / 7-9月 ${z.defend[2]} / 10-12月 ${z.defend[3]}</p>
      <p class="accent">${esc(z.coach)}${z.ovrDelta !== null && z.ovrDelta !== undefined ? ` <span class="muted small">（総合 ${signed(z.ovrDelta)}）</span>` : ""}</p>
      <hr><p class="small"><b>年末No.1:</b> ${esc(z.no1)}<br><b>GS:</b> ${z.gsWinners.map(esc).join(" / ")}<br>${z.retired.length ? `<b>引退:</b> ${z.retired.map(esc).join("、")}<br>` : ""}${esc(z.newcomer || "")}</p>
      <p class="small muted">チームタブに新しいコーチ候補が届いています。</p>
      <button class="primary" data-close>閉じる</button>`;
  };
  U.epilogueHtml = () => { const e = U.S.human.epilogue; if (!e) return ""; return `<h1 class="gold">「${U.esc(e.tag)}」</h1><p>${e.lines.map(U.esc).join("<br>")}</p><p class="small muted">殿堂ギャラリー（スタート画面）に記録されました。</p>`; };

  // ---------- run loop ----------
  U.shouldStop = (rep) => { const st = rep.stops, s = U.settings; return (st.includes("injury") && s.stopInjury) || (st.includes("season") && s.stopSeason) || (st.includes("event") && s.stopEvent) || (st.includes("rival") && s.stopRival); };
  U.advanceInteractive = (action) => new Promise((resolve) => {
    const gen = W.advanceWeekGen(U.S, Object.assign({}, action, { watch: U.watchOpts() }));
    const pump = () => { let r = gen.next(); while (!r.done && r.value.type !== "match") r = gen.next(); if (r.done) { resolve(r.value); return; } U.showMatchViewer(r.value, pump); };
    pump();
  });
  U.runWeeks = async function (actions, opts) {
    if (U.running) return; U.running = true;
    const log = [];
    try {
      for (let i = 0; i < actions.length; i++) {
        const rep = await U.advanceInteractive(actions[i]);
        log.push(rep); U.save();
        if (U.S.human.careerOver) break;
        if (opts && opts.untilHealed && !U.human().injury) break;
        if (U.shouldStop(rep)) break;
      }
    } finally { U.running = false; }
    U.finishRun(log);
  };
  U.autoRun = async function (maxWeeks) {
    if (U.running) return; U.running = true;
    const log = [];
    try {
      for (let i = 0; i < maxWeeks; i++) {
        const rep = await U.advanceInteractive({ type: "auto" });
        log.push(rep); U.save();
        if (U.S.human.careerOver) break;
        if (U.shouldStop(rep)) break;
        if (rep.stops.includes("tournament") && U.settings.stopTournament) break;
        if (rep.stops.includes("milestone") && U.settings.stopMilestone) break;
        if (rep.items.some((it) => it.type === "healed")) break;
      }
    } finally { U.running = false; }
    U.finishRun(log);
  };
  U.finishRun = function (log) {
    const S = U.S;
    U.save(); U.runLog = log; U.planSel = null;
    const seasonRep = log.find((r) => r.season);
    if (seasonRep) U.modal = U.seasonHtml(seasonRep.season);
    if (S.human.careerOver) { U.pushHof(S.human.epilogue); U.modal = `<h2>引退</h2>${U.epilogueHtml()}<button data-close>閉じる</button>`; }
    for (const r of log) {
      for (const it of r.items) if (it.type === "milestone") U.toast(`🏅 ${U.esc(it.text)}`, "gold");
      if (r.human && r.human.humanRound === "優勝") U.toast(`🏆 ${U.esc(r.human.T.name)} 優勝！ +${r.human.humanPts}pt`, "gold");
    }
    U.tab = "report"; U.render();
  };

  // ---------- setup ----------
  U.renderSetup = function () {
    const { esc, flag } = U;
    const sel = window._origin || "grinder";
    const hof = U.loadHof();
    app.innerHTML = `<div class="setup">
      <div style="margin-bottom:18px"><div class="hero-title">Tour Life</div><p class="muted">試合は観るもの、人生は選ぶもの。1週＝1ターン、4週単位でプランを立ててATP No.1を目指すキャリアシミュレーション。</p></div>
      <div class="panel"><h2>選手</h2><div class="row" style="gap:16px">
          <label>名前 <input id="name" value="${esc(window._name || "")}" placeholder="例: 佐藤 大和" style="width:180px"></label>
          <label>所属国 <select id="country">${D.PLAYABLE_COUNTRIES.map((c) => `<option value="${c}" ${(window._country || "JPN") === c ? "selected" : ""}>${flag(c)} ${D.COUNTRIES[c].name}</option>`).join("")}</select></label>
          <label>怪我 <select id="inj"><option value="standard">標準</option><option value="low">低頻度</option></select></label>
          <label>シード <input id="seed" placeholder="空欄でランダム" style="width:120px"></label></div>
        <p class="small muted" style="margin-top:8px">所属国はホーム大会のワイルドカード確率・デビスカップ・スポンサーに影響。ホームATP大会がない国は実質ハードモード。</p></div>
      <div class="panel"><h2>出自を選ぶ</h2>
      <div class="grid3">${Object.entries(U.ORIGINS).map(([k, o]) => `<div class="card origin ${sel === k ? "sel" : ""}" data-o="${k}"><div style="font-size:26px">${o.icon}</div><h3>${o.name} <span class="muted small">${o.age}歳スタート</span></h3><p class="small">${o.desc}</p><p class="small muted">難易度: ${o.diff}</p></div>`).join("")}</div>
      <p class="small muted">ポテンシャル（能力の天井）はプレイヤーには見えません。コーチのコメントと同年代との比較から推測してください。約10%で「世代の才能」を引きます。</p>
      <button class="primary" id="start" style="padding:10px 22px;font-size:15px">キャリアを始める</button></div>
      ${hof.length ? `<div class="panel"><h2>殿堂ギャラリー</h2><table><tr><th>選手</th><th>称号</th><th class="num">最高</th><th class="num">タイトル</th><th class="num">GS</th><th class="num">No.1週</th><th class="num">成績</th></tr>${hof.map((e) => `<tr><td>${flag(e.country)} ${esc(e.name)} <span class="muted small">${U.ORIGINS[e.origin] ? U.ORIGINS[e.origin].name : ""}</span></td><td class="${e.hof ? "gold" : ""}">${esc(e.tag)}${e.hof ? " 🏛" : ""}</td><td class="num">${e.bestRank || "-"}</td><td class="num">${e.titles}</td><td class="num">${e.gs}</td><td class="num">${e.weeksNo1}</td><td class="num">${e.w}-${e.l}</td></tr>`).join("")}</table></div>` : ""}
    </div>`;
    app.querySelectorAll(".origin").forEach((el) => el.onclick = () => { window._origin = el.dataset.o; window._name = document.getElementById("name").value; window._country = document.getElementById("country").value; U.renderSetup(); });
    document.getElementById("start").onclick = () => {
      const name = document.getElementById("name").value.trim() || "名無しの選手";
      const seedStr = document.getElementById("seed").value.trim();
      U.S = W.create({ name, country: document.getElementById("country").value, origin: sel, injuryRealism: document.getElementById("inj").value, seed: seedStr ? (parseInt(seedStr, 10) || TL.RNG.hash(seedStr)) : undefined });
      U.save(); U.tab = "home"; U.runLog = null; U.planSel = null; U.render();
    };
  };
  U.newGame = () => { U.modal = `<h2>新しいキャリアを始める</h2><p>現在のキャリアを削除して新しく始めますか？この操作は取り消せません。</p><div class="row"><button class="danger" data-confirm-new>削除して始める</button><button data-close>やめる</button></div>`; U.render(); };
  U.resetGame = () => { try { localStorage.removeItem(U.SAVE_KEY); } catch (e) {} U.S = null; U.modal = null; U.runLog = null; U.planSel = null; U.render(); };
})();
