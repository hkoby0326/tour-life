// UI core: shared state, helpers, app frame (rail + topbar), modal, run loop, setup screen.
(function () {
  const W = TL.World, D = TL.DATA;
  const U = (TL.UI = {
    W, D, S: null, tab: "home", modal: null, planSel: null, planWeekT: -1, runLog: null, running: false, screens: {},
    SAVE_KEY: "tourlife_v1", SETTINGS_KEY: "tourlife_settings_v1", HOF_KEY: "tourlife_hof_v1",
    DEFAULT_SETTINGS: { stopTournament: true, stopMilestone: true, stopInjury: true, stopSeason: true, stopEvent: true, stopRival: true, watchEnabled: true, watchGs: true, watchFinals: true, watchRival: true, watchTop10: true, watchTitle: true, watchSpeed: 300, sound: false, volume: 0.5, reduceMotion: false, slot: 1, introSeen: false, hints: {}, hintsAlways: false },
    VERSION: "v2.11.1",
  });
  U.ATTRL = W.ATTR_LABEL;
  U.ORIGINS = {
    junior: { name: "ジュニア王者", age: 16, desc: "ITFジュニア1位相当。資金$60k・スポンサー付き・ホーム大会のWCが有力。キャリアが最も長い（タイトルを積み上げる時間がある）が、親の支援は3年で切れる。", diff: "長期戦", icon: "🏆" },
    grinder: { name: "叩き上げ", age: 18, desc: "ITF下部大会から。資金$12k、後援会から週$0.5k。耐久性・メンタルが高く怪我に強い。最初の数年は資金繰りとの戦い。", diff: "資金難", icon: "🧗" },
    college: { name: "大学経由", age: 21, desc: "米大学テニス出身。能力の完成度が高く即戦力。協会支援2年。キャリアは短いぶん、勝負の時期がすぐ来る。", diff: "短期決戦", icon: "🎓" },
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
    more: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>',
    plan: '<path d="M8 2v3M16 2v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="m9 15 2 2 4-4"/>',
    report: '<path d="M4 5h16M4 12h10M4 19h7"/>',
    ranking: '<path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3"/>',
    calendar: '<path d="M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 2v3M16 2v3"/>',
    player: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20a7 7 0 0 1 14 0M15 20a5 5 0 0 1 7-4"/>',
    finance: '<path d="M3 7h18v12H3zM3 11h18M16 15h2"/>',
    sponsor: '<path d="M20 7h-4V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM10 5h4v2h-4z"/><path d="M3 12h18"/>',
    records: '<path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2zM4 18a2 2 0 0 1 2-2h12"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  };
  U.icon = (n) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ""}</svg>`;
  U.TABS = [["home", "ホーム"], ["plan", "プラン"], ["report", "結果"], ["ranking", "ランキング"], ["calendar", "カレンダー"], ["player", "選手"], ["team", "チーム"], ["sponsor", "スポンサー"], ["finance", "財務"], ["records", "記録"], ["settings", "設定"]];
  U.PRIMARY = ["home", "plan", "report", "ranking"]; // bottom tab bar on phones; the rest live behind "その他"
  U.TAB_LABEL = Object.fromEntries(U.TABS);

  // ---------- persistence ----------
  U.loadSettings = () => { try { return Object.assign({}, U.DEFAULT_SETTINGS, JSON.parse(localStorage.getItem(U.SETTINGS_KEY) || "{}")); } catch (e) { return Object.assign({}, U.DEFAULT_SETTINGS); } };
  U.settings = U.loadSettings();
  U.saveSettings = () => { try { localStorage.setItem(U.SETTINGS_KEY, JSON.stringify(U.settings)); } catch (e) {} };
  U.watchOpts = () => ({ enabled: U.settings.watchEnabled, gs: U.settings.watchGs, finals: U.settings.watchFinals, rival: U.settings.watchRival, top10: U.settings.watchTop10, titleMatch: U.settings.watchTitle });
  // save slots: slot 1 keeps the historical key so existing saves carry over
  U.slot = () => U.settings.slot || 1;
  U.saveKeyFor = (n) => (n === 1 ? U.SAVE_KEY : `${U.SAVE_KEY}_s${n}`);
  U.save = () => { try { localStorage.setItem(U.saveKeyFor(U.slot()), W.serialize(U.S)); } catch (e) { console.warn(e); } };
  U.load = () => { try { const j = localStorage.getItem(U.saveKeyFor(U.slot())); U.S = j ? W.deserialize(j) : null; } catch (e) { console.warn(e); U.S = null; } };
  U.slotInfo = (n) => { try { const j = localStorage.getItem(U.saveKeyFor(n)); if (!j) return null; const s = JSON.parse(j); const h = s.players.find((p) => p.id === s.humanId); return { name: h.name, country: h.country, year: W.START_YEAR + s.year - 1, week: s.week, rank: h.rank, titles: h.stats.titles, age: W.START_YEAR + s.year - 1 - h.birthYear, over: !!s.human.careerOver, kb: Math.round(j.length / 1024) }; } catch (e) { return null; } };
  U.switchSlot = (n) => { if (U.S) U.save(); U.settings.slot = n; U.saveSettings(); U.modal = null; U.runLog = null; U.planSel = null; U.tab = "home"; U.load(); U.render(); };
  U.copyToSlot = (n) => { try { localStorage.setItem(U.saveKeyFor(n), W.serialize(U.S)); } catch (e) {} U.toast(`スロット${n}に保存した`); U.closeModal(); U.render(); };
  U.deleteSlot = (n) => { try { localStorage.removeItem(U.saveKeyFor(n)); } catch (e) {} if (n === U.slot()) { U.S = null; U.runLog = null; U.planSel = null; } U.modal = null; U.render(); };
  U.slotsHtml = (compact) => {
    const { esc, flag } = U;
    return [1, 2, 3].map((n) => {
      const i = U.slotInfo(n), on = n === U.slot();
      const info = i ? `<b>${flag(i.country)} ${esc(i.name)}</b> <span class="small muted">${i.year}年 第${i.week}週 ・ ${i.age}歳 ・ ${i.over ? "引退" : i.rank ? i.rank + "位" : "ランク外"} ・ ${i.titles}勝</span>` : '<span class="muted">空き</span>';
      const btns = compact
        ? (i && !on ? `<button class="primary small" data-slot-switch="${n}">続ける</button>` : on ? '<span class="pill">このスロットに作成</span>' : `<button class="small" data-slot-switch="${n}">ここで始める</button>`)
        : `${on ? '<span class="pill gold">使用中</span>' : `<button class="small" data-slot-switch="${n}">${i ? "切り替え" : "ここで新規"}</button>`}${U.S && !on ? ` <button class="small" data-slot-copy="${n}">ここにコピー</button>` : ""}${i ? ` <button class="small danger" data-slot-del="${n}">削除</button>` : ""}`;
      return `<div class="slot ${on ? "on" : ""}"><div><div class="small muted">スロット${n}</div>${info}</div><div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${btns}</div></div>`;
    }).join("");
  };
  U.bindSlots = (root) => {
    root.querySelectorAll("[data-slot-switch]").forEach((b) => b.onclick = () => U.switchSlot(parseInt(b.dataset.slotSwitch, 10)));
    root.querySelectorAll("[data-slot-copy]").forEach((b) => b.onclick = () => { const n = parseInt(b.dataset.slotCopy, 10); if (U.slotInfo(n)) U.openModal(`<h2>スロット${n}を上書き</h2><p>スロット${n}の既存セーブを現在のキャリアで上書きしますか？</p><div class="row"><button class="danger" data-slot-copy-confirm="${n}">上書きする</button><button data-close>やめる</button></div>`); else U.copyToSlot(n); });
    root.querySelectorAll("[data-slot-del]").forEach((b) => b.onclick = () => { const n = parseInt(b.dataset.slotDel, 10); U.openModal(`<h2>スロット${n}を削除</h2><p>このセーブは消えます。取り消せません。</p><div class="row"><button class="danger" data-slot-del-confirm="${n}">削除する</button><button data-close>やめる</button></div>`); });
  };
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
    const sameTab = U._renderedTab === U.tab;
    const scrollY = window.scrollY;
    app.innerHTML = `<div class="app">
      <nav class="rail"><div class="brand"><span class="logo">TL</span><span>Tour Life</span></div>
        ${U.TABS.map(([k, l]) => `<button class="nav ${U.tab === k ? "active" : ""} ${U.PRIMARY.includes(k) ? "" : "more-hidden"}" data-tab="${k}" title="${l}">${U.icon(k)}<span>${l}</span>${k === "report" && S.human.event ? '<span class="badge">!</span>' : ""}</button>`).join("")}
        <button class="nav more-only ${U.PRIMARY.includes(U.tab) ? "" : "active"}" data-more title="その他">${U.icon("more")}<span>${U.PRIMARY.includes(U.tab) ? "その他" : U.TAB_LABEL[U.tab]}</span></button>
        <div class="spacer"></div><div class="version">${U.VERSION}</div></nav>
      <div class="main"><header class="topbar">
        <div class="identity">${U.avatar(me)}<div><div class="name">${esc(me.name)}</div><div class="sub">${U.cal()}年 第${S.week}週 ・ ${W.age(S, me)}歳 ・ ${U.ORIGINS[S.config.origin].name}${S.human.retireYear && S.year === S.human.retireYear ? ' ・ <span class="gold">ラストシーズン</span>' : ""}</div></div></div>
        <div class="statrow">
        <div class="stat"><span class="l">Ranking</span><span class="v">${me.rank ? me.rank + "位" : "ランク外"}</span><span class="d">${me.points}pt ${delta > 0 ? `<span class="green">▲${delta}</span>` : delta < 0 ? `<span class="red">▼${-delta}</span>` : ""}</span></div>
        ${(() => { const L = W.legacyView(S); return `<div class="stat" data-goto-legacy style="cursor:pointer" title="レガシー（キャリア評価）"><span class="l">Legacy</span><span class="v ${L.hof ? "gold" : ""}">${L.total}<span class="small muted">pt</span></span><span class="d"><span class="lgbar"><i style="width:${Math.min(100, (L.total / L.line) * 100)}%"></i></span>${L.hof ? '<span class="gold">殿堂ライン到達</span>' : `殿堂まで ${L.gap}`}</span></div>`; })()}
        <div class="stat"><span class="l">Money</span><span class="v ${S.human.money < 0 ? "red" : ""}">${money(S.human.money)}</span><span class="d">${S.human.ledger && S.human.ledger.length ? (S.human.ledger[S.human.ledger.length - 1].net >= 0 ? '<span class="green">+' : '<span class="red">') + money(S.human.ledger[S.human.ledger.length - 1].net) + "/週</span>" : ""}</span></div>
        <div class="stat"><span class="l">Fatigue ${Math.round(me.fatigue)}</span><div class="gauge"><div style="width:${me.fatigue}%;background:${me.fatigue > 60 ? "var(--red)" : me.fatigue > 40 ? "var(--gold)" : "var(--green)"}"></div></div></div>
        <div class="stat"><span class="l">Record</span><span class="v small">${me.stats.w}勝${me.stats.l}敗</span><span class="d">タイトル ${me.stats.titles}</span></div>
        <div class="stat"><span class="l">Team</span><span class="v small">${S.human.coach ? esc(S.human.coach.name) : "コーチなし"}</span><span class="d">${S.human.coach ? W.COACH_TYPES[S.human.coach.type].label : ""}${staffN ? ` ・ スタッフ${staffN}` : ""}</span></div>
        ${rv ? `<div class="stat"><span class="l">Rival</span><span class="v small" data-player="${rv.id}" style="cursor:pointer">${esc(rv.name)}</span><span class="d">${rv.rank ? rv.rank + "位" : rv.retired ? "引退" : "ランク外"}</span></div>` : ""}
        ${inj}
        </div></header><div class="content" id="content"></div></div></div>`;
    app.querySelectorAll(".rail .nav[data-tab]").forEach((b) => b.onclick = () => { U.tab = b.dataset.tab; U.render(); });
    app.querySelectorAll("[data-goto-legacy]").forEach((b) => b.onclick = () => U.openModal(U.legacyHtml(), true));
    const more = app.querySelector("[data-more]");
    if (more) more.onclick = () => U.openModal(`<h2>メニュー</h2><div class="grid2" style="grid-template-columns:repeat(2,1fr)">${U.TABS.filter(([k]) => !U.PRIMARY.includes(k)).map(([k, l]) => `<button class="${U.tab === k ? "primary" : ""}" data-goto="${k}" style="display:flex;gap:8px;align-items:center;justify-content:flex-start">${U.icon(k)} ${l}</button>`).join("")}</div><div style="margin-top:10px"><button data-close>閉じる</button></div>`);
    U.bindPlayerLinks(app);
    const c = document.getElementById("content");
    (U.screens[U.tab] || U.screens.home)(c);
    U.applyHints(c);
    U._renderedTab = U.tab;
    // same screen re-rendered (e.g. a plan pick): keep the reader's place instead of jumping to the top
    window.scrollTo(0, sameTab ? scrollY : 0);
    U.renderModal();
    U.scrollTimelines(app);
  };
  // performance timelines open on the most recent seasons
  U.scrollTimelines = (root) => root.querySelectorAll(".tscroll").forEach((el) => { if (el.querySelector(".ptl")) el.scrollLeft = el.scrollWidth; });
  // The modal lives in its own layer so opening/closing one never rebuilds the screen behind it.
  U.renderModal = function () {
    let layer = document.getElementById("modal-layer");
    if (!layer) { layer = document.createElement("div"); layer.id = "modal-layer"; document.body.appendChild(layer); }
    if (!U.modal) { layer.innerHTML = ""; U.modalWide = false; return; }
    const S = U.S, { esc } = U;
    layer.innerHTML = `<div class="modal-bg ${U.modalClass || ""}" id="modalbg"><div class="modal ${U.modalWide ? "wide" : ""} ${U.modalClass || ""}">${U.modal}</div></div>`;
    const bg = document.getElementById("modalbg");
    bg.onclick = (e) => { if (e.target === bg && !(S && S.human.event) && U.modalClass !== "injury") U.closeModal(); };
    layer.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => U.closeModal());
    layer.querySelectorAll("[data-heal]").forEach((b) => b.onclick = () => { U.modal = null; U.modalClass = null; U.renderModal(); const me = U.human(); if (me.injury) U.runWeeks(Array.from({ length: me.injury.weeks + 1 }, () => ({ type: "rest" })), { untilHealed: true }); });
    layer.querySelectorAll("[data-goto]").forEach((g) => g.onclick = () => { U.tab = g.dataset.goto; U.modal = null; U.render(); });
    layer.querySelectorAll("[data-confirm-new]").forEach((b) => b.onclick = U.resetGame);
    layer.querySelectorAll("[data-slot-copy-confirm]").forEach((b) => b.onclick = () => U.copyToSlot(parseInt(b.dataset.slotCopyConfirm, 10)));
    layer.querySelectorAll("[data-slot-del-confirm]").forEach((b) => b.onclick = () => U.deleteSlot(parseInt(b.dataset.slotDelConfirm, 10)));
    if (S) {
      layer.querySelectorAll("[data-fund-confirm]").forEach((b) => b.onclick = () => { const t = W.useFunding(S, b.dataset.fundConfirm); U.save(); U.modalDirty = true; U.openModal(`<h2>資金繰り</h2><p>${esc(t || "今は使えない。")}</p><button class="primary" data-close>閉じる</button>`, false, true); });
      layer.querySelectorAll("[data-trait-confirm]").forEach((b) => b.onclick = () => { W.learnTrait(S, b.dataset.traitConfirm); U.save(); U.modal = null; U.render(); });
      layer.querySelectorAll("[data-trait-drop-confirm]").forEach((b) => b.onclick = () => { W.dropTrait(S, b.dataset.traitDropConfirm); U.save(); U.modal = null; U.render(); });
      layer.querySelectorAll("[data-sp-confirm]").forEach((b) => b.onclick = () => { const [cat, id, y] = b.dataset.spConfirm.split(":"); W.signSponsor(S, cat, id, parseInt(y, 10)); U.save(); U.modal = null; U.render(); });
      layer.querySelectorAll("[data-sp-release-confirm]").forEach((b) => b.onclick = () => { const [cat, id] = b.dataset.spReleaseConfirm.split(":"); W.releaseSponsor(S, cat, id); U.save(); U.modal = null; U.render(); });
      layer.querySelectorAll("[data-asset-confirm]").forEach((b) => b.onclick = () => { W.buyAsset(S, b.dataset.assetConfirm); U.save(); U.modal = null; U.render(); });
      layer.querySelectorAll("[data-confirm-fire]").forEach((b) => b.onclick = () => { W.fireCoach(S); U.save(); U.modal = null; U.render(); });
      layer.querySelectorAll("[data-confirm-retire]").forEach((b) => b.onclick = () => { W.retireNow(S); U.save(); U.pushHof(S.human.epilogue); U.modal = `<h2>引退</h2>${U.epilogueHtml()}<button data-close>閉じる</button>`; U.tab = "plan"; U.render(); });
      layer.querySelectorAll("[data-choice]").forEach((b) => b.onclick = () => { const txt = W.resolveEvent(S, b.dataset.choice); U.save(); U.modalDirty = true; U.openModal(`<h2>結果</h2><p>${esc(txt)}</p><button class="primary" data-close>閉じる</button>`, false, true); });
    }
    U.bindPlayerLinks(layer);
    if (U.bindWrapped) U.bindWrapped(layer);
    if (U.scrollTimelines) U.scrollTimelines(layer);
  };
  U.openModal = (html, wide, keepDirty) => { U.modal = html; U.modalWide = !!wide; if (!keepDirty) U.modalDirty = false; U.renderModal(); };
  // closing re-renders the screen only when the modal changed game state (an event choice)
  // v2.9: injury popup — what happened, how long, what it costs, what changes after return
  // v2.11: legacy — the career score, the Hall of Fame line, the all-time table and records
  U.legacyHtml = function () {
    const S = U.S, { esc, flag } = U, L = W.legacyView(S);
    const parts = Object.entries(L.parts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${W.LEGACY_LABEL[k]}</td><td class="num">${v}</td></tr>`).join("") || '<tr><td colspan="2" class="muted">まだ加点なし</td></tr>';
    const rule = Object.entries(W.LEGACY).map(([k, v]) => `${W.LEGACY_LABEL[k]} ${v}${k === "no1Week" ? "/週" : k.startsWith("ye") ? "/回" : ""}`).join(" ・ ");
    return `<h2>レガシー <span class="muted small">キャリアの評価点</span></h2>
      <div class="kpi"><div class="card"><div class="v ${L.hof ? "gold" : ""}">${L.total}</div><div class="l">レガシー</div></div><div class="card"><div class="v">${L.line}</div><div class="l">殿堂ライン</div></div><div class="card"><div class="v">${L.rank ? L.rank + "位" : "-"}</div><div class="l">この世界の歴代</div></div></div>
      <div class="lgbar big"><i style="width:${Math.min(100, (L.total / L.line) * 100)}%"></i></div><p class="small">${L.hof ? '<b class="gold">殿堂入りラインに到達済み。</b>' : `殿堂入りまで ${esc(L.gapText)}`}</p>
      <div class="grid2"><div><h3>内訳</h3><table class="small">${parts}</table></div>
      <div><h3>歴代レガシー（この世界）</h3><table class="small">${L.top.map((x, i) => `<tr class="${x.me ? "me" : ""}"><td class="num">${i + 1}</td><td><span data-player="${x.id}" class="accent">${flag(x.country)} ${esc(x.name)}</span>${x.retired ? ' <span class="muted tiny">引退</span>' : ""}</td><td class="num">${x.v}</td></tr>`).join("")}${L.rank && L.rank > 10 ? `<tr class="me"><td class="num">${L.rank}</td><td>${esc(U.human().name)}</td><td class="num">${L.total}</td></tr>` : ""}</table></div></div>
      <h3>記録への挑戦</h3><table class="small">${L.records.map((r) => `<tr><td>${esc(r.label)}</td><td class="num ${r.mineIsRecord ? "gold" : ""}">${r.mine}${r.unit}</td><td class="muted">${r.holder ? `最多 ${r.record}${r.unit}（${esc(r.holder)}）` : "-"}</td><td class="small">${r.mineIsRecord ? '<b class="gold">記録保持</b>' : r.record ? `あと ${r.record - r.mine + 1}` : ""}</td></tr>`).join("")}</table>
      <p class="tiny muted" style="margin-top:8px">配点: ${rule}。ゲーム開始以降のこの世界の成績で数える（開始時のベテランの過去の実績は含まない）。</p>
      <button data-close>閉じる</button>`;
  };
  U.injuryHtml = function () {
    const S = U.S, me = U.human(), inj = me.injury, { esc, money } = U;
    if (!inj) return "";
    const log = (S.human.injuryLog || []).slice(-1)[0] || {};
    const sev = inj.sev || 2;
    let w = S.week + inj.weeks, y = U.cal();
    while (w > 52) { w -= 52; y++; }
    const sharpNow = me.sharp === undefined ? 65 : me.sharp;
    const sharpAfter = Math.max(10, Math.round(sharpNow - 10 * inj.weeks));
    const lost = (me.results || []).filter((r) => r.t + 52 > S.t && r.t + 52 <= S.t + inj.weeks).reduce((a, r) => a + (r.pts || 0), 0);
    const rehab = W.rehabWeekly(S);
    const loss = inj.loss && Object.keys(inj.loss).length ? Object.entries(inj.loss).map(([k, v]) => `${U.ATTRL[k]} ${v}`).join("・") : "";
    return `<div class="injpop sev${sev}"><div class="injic">${sev === 3 ? "🚑" : "🩹"}</div>
      <div class="injk">怪我 ・ ${["", "軽傷", "中程度", "重傷"][sev]}</div><h2>${esc(inj.label)}</h2>
      <p class="muted small">${esc(log.where || "")}${log.where ? "で負傷" : ""}</p>
      <div class="kpi"><div class="card"><div class="v red">${inj.weeks}週</div><div class="l">離脱</div></div><div class="card"><div class="v">${y}年 第${w}週</div><div class="l">復帰見込み</div></div><div class="card"><div class="v">${rehab ? money(rehab) : "-"}</div><div class="l">リハビリ費 / 週</div></div><div class="card"><div class="v">${lost ? "-" + lost : 0}pt</div><div class="l">離脱中に失効</div></div></div>
      <ul class="small injlist"><li>離脱中は休養に固定され、予定していた大会は欠場になる</li><li>復帰時の試合勘は約${sharpAfter}（${W.sharpLabel(sharpAfter)}）。試合をこなすと戻る</li>${loss ? `<li class="red">手術の影響で能力が低下: ${esc(loss)}</li>` : ""}${sev === 3 ? "<li>大怪我の後は再発しやすい。復帰直後の連戦は避けたい</li>" : ""}</ul>
      <div class="row" style="gap:8px;justify-content:center;margin-top:12px">${U.modalQueue && U.modalQueue.length ? "" : '<button class="primary" data-heal>治るまで進める</button>'}<button data-close>閉じる</button></div></div>`;
  };
  U.closeModal = () => {
    U.modalClass = null;
    // something was waiting behind the injury screen (season report etc.)
    if (U.modalQueue && U.modalQueue.length) { const q = U.modalQueue.shift(); U.modal = q.html; U.modalWide = q.wide; U.renderModal(); return; }
    if (U.S && U.S.human.event) U.modalDirty = true;
    U.modal = null; U.modalWide = false; if (U.modalDirty) { U.modalDirty = false; U.render(); } else U.renderModal(); };

  // ---------- onboarding (UI-9): first-season hints per screen, replayable from settings ----------
  U.HINTS = {
    home: ["ホームの読み方", "右の「今季の目標」は毎シーズン3つ。達成すると成長ポイント、全達成でボーナス。「レガシー」はキャリアの評価点で、殿堂ラインを越えるのが最終目標。「今週の決断」は自動方針の提案。そのまま1週進めるか、「4週プラン」で大会・練習・休養を自分で組む。受信箱には選択肢つきのイベントとニュースが届く。"],
    plan: ["4週プランの組み方", "「自動の方針」で大会選びの考え方（ビッグイベント優先／ポイント重視／育成重視／移動最小）を決められる。各週は 自動／大会／練習／休養／合宿 から選ぶ。大会カードの点はエントリー見込み（緑=本戦、黄=予選、赤=カットオフ外）。負荷メーターが赤なら休養を。重要試合は観戦モードになる。"],
    report: ["結果の見方", "試合ごとのスコアと、練習で伸びた能力が週単位で出る。「ドロー表」で本戦の全試合を確認できる。"],
    sponsor: ["スポンサー契約", "ラケット・ウエア・シューズは各1社、その他は2社まで。ブランドはランキングで解放され、週給は契約時のランキングで決まって期間中固定。用具には試合やコンディションへの効果、優勝ボーナス条項もある。"],
    team: ["チームの作り方", "コーチは契約年数と相性つき。相性は数ヶ月かけて判明する。スタッフ枠はランキングが上がると解禁され、同行させる人数ぶん移動費も増える。"],
    finance: ["お金の流れ", "収入は賞金・スポンサー・支援。支出はチーム給与と移動費（ホームからの距離 × 同行人数）。資金が尽きそうなら「資金繰り」で節約モード・強化費・借入・クラブリーグなどを使う。マイナスだと長距離遠征とコーチの雇用ができない。"],
    player: ["育成の組み立て", "上の「育成計画」で目標スタイル・練習強度・週10コマの練習配分を決める。タイトルや節目で貯まる成長ポイントで「特性」を習得・強化できる（Lv1〜5、持てるのは3〜5つ）。キー能力の練習効果が上がり、確立すると試合で効く。表の「練習1週」は実際に伸びる期待値。能力の天井（ポテンシャル）は見えない。"],
    ranking: ["ランキングの仕組み", "直近52週のベスト19大会（＋ファイナルズ）の合計。昨年の同じ週のポイントは消える（防衛）。「実力」は今の試合での強さで、順位とずれることがある。他の選手名を押すとスカウティングレポート。"],
  };
  U.applyHints = (c) => {
    const h = U.HINTS[U.tab]; if (!h || !U.S) return;
    const seen = U.settings.hints || {};
    if (seen[U.tab] || (U.S.year > 1 && !U.settings.hintsAlways)) return;
    c.insertAdjacentHTML("afterbegin", `<div class="hintcard"><div class="ic">💡</div><div><b>${h[0]}</b><div class="small">${h[1]}</div></div><button class="x" data-hint-close title="閉じる">×</button></div>`);
    c.querySelector("[data-hint-close]").onclick = (e) => { U.settings.hints = Object.assign({}, seen, { [U.tab]: 1 }); U.saveSettings(); e.target.closest(".hintcard").remove(); };
  };
  U.introHtml = () => `<div class="intro"><h2>Tour Life の遊び方</h2>
    <div class="steps">
      <div class="step"><div class="n">1</div><div><b>1週＝1ターン</b><div class="small muted">大会に出る・練習する・休む。4週まとめてプランを組み、「進める」で時間が進む。迷ったら「今週の決断」に任せてよい。</div></div></div>
      <div class="step"><div class="n">2</div><div><b>試合は観るもの</b><div class="small muted">グランドスラムやトップ10戦などの重要試合はポイント単位の観戦モードに。セット間に試合プランを変えられる。</div></div></div>
      <div class="step"><div class="n">3</div><div><b>伸びしろは見えない</b><div class="small muted">コーチのコメントと同年代比較から才能を推測する。</div></div></div>
      <div class="step"><div class="n">4</div><div><b>自動進行と停止条件</b><div class="small muted">自動進行は大会終了・怪我・ランキングの節目・イベントで止まる。条件はプラン画面の下で変えられる。</div></div></div>
    </div><p class="small muted">最初のシーズンは各画面の上にヒントが出ます（設定からいつでも再表示できます）。</p>
    <button class="primary bigbtn" data-close>キャリアを始める</button></div>`;

  // ---------- shared html ----------
  // Broadcast-style match stats table rows for a finished (or live) match, from the human's side `hi`.
  U.matchStatsRows = function (st, hi, planA, planB) {
    const j = 1 - hi;
    const g = (k, i) => (st[k] ? st[k][i] : null);
    const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "-");
    const row = (l, a, b) => `<tr><td class="muted">${l}</td><td class="num"><b>${a}</b></td><td class="num">${b}</td></tr>`;
    const first = (i) => (g("svPts", i) === null ? ["-", "-", "-"] : [pct(g("firstIn", i), g("svPts", i)), pct(g("firstWon", i), g("firstIn", i)), pct(g("secondWon", i), g("svPts", i) - g("firstIn", i))]);
    const fa = first(hi), fb = first(j);
    let rows = row("総ポイント", st.points[hi], st.points[j]) + row("エース", st.aces[hi], st.aces[j]) + row("ダブルフォルト", st.dfs[hi], st.dfs[j]);
    rows += row("1stサーブ率", fa[0], fb[0]) + row("1st得点率", fa[1], fb[1]) + row("2nd得点率", fa[2], fb[2]);
    rows += row("サービスゲーム", g("svGames", hi) === null ? "-" : `${g("holds", hi)}/${g("svGames", hi)}`, g("svGames", j) === null ? "-" : `${g("holds", j)}/${g("svGames", j)}`);
    rows += row("ブレーク/BP", `${st.breaks[hi]}/${st.bpFaced[j]}`, `${st.breaks[j]}/${st.bpFaced[hi]}`) + row("被BPセーブ", `${st.bpSaved[hi]}/${st.bpFaced[hi]}`, `${st.bpSaved[j]}/${st.bpFaced[j]}`);
    rows += row("ウィナー", st.winners[hi], st.winners[j]) + row("アンフォーストエラー", st.ues[hi], st.ues[j]);
    if (g("netPts", hi) !== null) rows += row("ネットポイント", `${g("netWon", hi)}/${g("netPts", hi)}`, `${g("netWon", j)}/${g("netPts", j)}`);
    if (st.tbW) rows += row("タイブレーク", `${st.tbW[hi]}-${st.tbL[hi]}`, `${st.tbW[j]}-${st.tbL[j]}`);
    rows += row("最長ラリー", st.longest + "打", "");
    if (planA) rows += row("プラン", planA, planB);
    return rows;
  };
  U.minutesText = (m) => (m ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}` : "-");
  U.playerModalHtml = function (id) {
    const S = U.S, { esc, flag, money, cal } = U, ATTRL = U.ATTRL;
    const p = W.playerInfo(S, id);
    if (!p) return "<p>選手が見つからない</p>";
    const bar = (v, cls) => `<div class="bar"><div style="width:${v}%;background:${cls || (v >= 80 ? "var(--gold)" : v >= 65 ? "var(--green)" : "var(--accent)")}"></div></div>`;
    const attrs = W.ATTRS.map((k) => `<div class="attr" style="grid-template-columns:84px 1fr 36px"><span>${ATTRL[k]}</span>${bar(p.attrs[k])}<span class="num">${p.attrs[k]}</span></div>`).join("");
    const surf = Object.keys(D.SURFACES).map((k) => `<div class="attr" style="grid-template-columns:84px 1fr 36px"><span>${D.SURFACES[k]}</span>${bar(p.surf[k], `var(--${k})`)}<span class="num">${p.surf[k]}</span></div>`).join("");
    return `<div class="row between"><div class="identity">${U.avatar(p)}<div><div class="name">${esc(p.name)} ${p.isRival ? '<span class="pill rival">宿敵</span>' : ""}${p.isHuman ? '<span class="pill">自分</span>' : ""}</div><div class="sub">${p.age}歳 ・ ${D.COUNTRIES[p.country].name} ・ ${p.hand === "L" ? "左利き" : "右利き"} ・ ${W.STYLE_LABEL[p.style] || p.style}</div></div></div><div style="text-align:right"><div class="kpi .v" style="font-size:22px;font-weight:800">${p.retired ? "引退" : p.rank ? p.rank + "位" : "ランク外"}</div><div class="small muted">${p.points}pt ・ 最高${p.bestRank || "-"}位 ・ 総合 ${p.overall} ・ 実力 ${p.strength}${p.scout && !p.scout.exact ? `<span class="pill" style="margin-left:4px">推定 ±${p.scout.amp}</span>` : ""}</div></div></div>
      ${p.injury ? `<p class="small red">${esc(p.injury.label)} 残り${p.injury.weeks}週</p>` : ""}
      <p class="small muted">試合勘 ${p.sharp}（${p.sharpLabel}） ・ 自信: ${p.confLabel}${p.isHuman && W.traitList(U.S).length ? ` ・ 特性: ${W.traitList(U.S).map((t) => `${W.TRAITS[t].label} Lv${W.traitLevel(U.S, t)}`).join("・")}` : ""}${!p.isHuman && p.traits && p.traits.length ? ` ・ 特性: ${p.traits.map((t) => `<span title="${esc(t.l ? W.traitEffectText(t.id, t.l) : "対戦するか観察を重ねるとレベルが分かる")}">${esc(t.label)} Lv${t.l || "?"}</span>`).join("・")}` : ""}</p>
      <div class="grid2" style="margin-top:10px"><div>${U.radarSvg(p.attrs, p.isHuman ? null : U.human().attrs)}<div class="small muted" style="text-align:center;margin:-4px 0 8px"><span class="accent">■</span> ${esc(p.name)}${p.isHuman ? "" : ' <span class="red">■</span> 自分'}</div>${attrs}<h3 style="margin-top:8px">サーフェス</h3>${surf}</div>
      <div><div class="kpi"><div class="card"><div class="v">${p.titles}</div><div class="l">タイトル</div></div><div class="card"><div class="v">${p.gs}</div><div class="l">GS</div></div><div class="card"><div class="v">${p.w}-${p.l}</div><div class="l">通算</div></div><div class="card"><div class="v">${money(p.prize)}</div><div class="l">賞金</div></div></div>
        <p class="small">直近52週 ${p.tournaments52}大会 ・ 疲労 ${p.fatigue} ・ 同年代${p.peers}人中${p.peerPos ? p.peerPos + "番目" : "-"}</p>
        ${p.cs && p.cs.m ? `<p class="small"><b>通算スタッツ（${p.cs.m}試合）:</b> エース ${p.cs.acesPm}/試合 ・ DF ${p.cs.dfsPm}/試合 ・ 1st得点率 ${p.cs.firstWon === null ? "-" : p.cs.firstWon + "%"} ・ サービスキープ ${p.cs.hold === null ? "-" : p.cs.hold + "%"} ・ BP変換 ${p.cs.bpConv === null ? "-" : p.cs.bpConv + "%"} ・ TB ${p.cs.tb[0]}-${p.cs.tb[1]} ・ 最終セット ${p.cs.dec[0]}-${p.cs.dec[1]} ・ 対Top10 ${p.cs.top10[0]}-${p.cs.top10[1]}</p>` : ""}
        ${p.isHuman ? "" : `<p class="small"><b>対戦成績:</b> ${p.h2hW}勝${p.h2hL}敗${p.h2h.length ? "<br>" + p.h2h.map((m) => `<span class="${m.won ? "green" : "red"}">${cal(m.year)} ${esc(m.tour)} ${esc(m.round)} ${m.won ? "W" : "L"} ${esc(m.score)}</span>`).join("<br>") : ""}</p>`}
        ${p.titleList.length ? `<p class="small"><b class="gold">最近のタイトル:</b> ${p.titleList.map((t) => `${cal(t.year)} ${esc(t.name)}`).join("、")}</p>` : ""}</div></div>
      <h3 style="margin-top:10px">グランドスラム・マスターズ成績</h3>${U.bigTimelineHtml(W.human(U.S).id === p.id ? W.human(U.S) : U.S.players.find((x) => x.id === p.id), { compact: true, last: 8 })}
      <p class="small muted">${p.isHuman ? "自分の能力値は正確。伸びしろ（天井）は見えない。" : p.scout && p.scout.exact ? "アナリストが精査したレポート（正確な値）。伸びしろは分からない。" : `スカウティングによる推定値（誤差 ±${p.scout ? p.scout.amp : 6}）。対戦を重ねると精度が上がり、アナリストを雇うと正確になる。`}</p>
      <button class="primary" data-close>閉じる</button>`;
  };
  U.bindPlayerLinks = (root) => root.querySelectorAll("[data-player]").forEach((el) => { el.style.cursor = "pointer"; el.onclick = (e) => { e.stopPropagation(); U.openModal(U.playerModalHtml(parseInt(el.dataset.player, 10))); }; });
  U.eventHtml = (ev) => `<h2>${U.esc(ev.title)}</h2><p>${U.esc(ev.text)}</p>${ev.choices.map((c) => `<div class="card"><div class="row between"><div><b>${U.esc(c.label)}</b><div class="small muted">${U.esc(c.desc)}</div></div><button class="primary" data-choice="${c.key}">選ぶ</button></div></div>`).join("")}`;
  U.seasonHtml = function (z) {
    const { esc, money, signed } = U, ATTRL = U.ATTRL;
    const surf = Object.entries(z.bySurface).map(([s, v]) => `${D.SURFACES[s]} ${v.w}-${v.l}`).join(" ・ ");
    return `<h2>${z.calendarYear}年シーズン総括 <span class="muted small">${z.age}歳</span></h2>
      <div class="kpi"><div class="card"><div class="v">${z.rank ? z.rank + "位" : "-"}</div><div class="l">年末ランキング</div></div><div class="card"><div class="v">${z.w}-${z.l}</div><div class="l">年間成績</div></div><div class="card"><div class="v">${z.tournaments || "-"}</div><div class="l">出場大会</div></div><div class="card"><div class="v">${z.titles.length}</div><div class="l">タイトル</div></div><div class="card"><div class="v">${money(z.prize)}</div><div class="l">年間賞金</div></div><div class="card"><div class="v ${z.money < 0 ? "red" : ""}">${money(z.money)}</div><div class="l">資金残高</div></div></div>
      ${z.titles.length ? `<p><b class="gold">優勝:</b> ${z.titles.map(esc).join("、")}</p>` : ""}
      <p><b>ベストマッチ:</b> ${esc(z.bestWin)}</p><p><b>サーフェス別:</b> ${surf || "-"}</p>
      ${z.goals ? `<p><b>シーズン目標:</b> ${z.goals.list.map((g) => `<span class="${g.ok ? "green" : "muted"}">${g.ok ? "✓" : "✗"} ${esc(g.label)}</span>`).join(" ・ ")}${z.goals.all ? ` <span class="gold">全達成ボーナス ${money(z.goals.bonus)}</span>` : ""}</p>` : ""}
      ${z.legacy !== undefined ? `<p><b>レガシー:</b> ${z.legacy}pt <span class="muted small">（殿堂ライン ${W.HOF_LINE}）</span></p>` : ""}
      ${z.rivalH2H ? `<p><b>宿敵 ${esc(z.rivalH2H.name)}:</b> 今季の対戦 ${z.rivalH2H.w}勝${z.rivalH2H.l}敗 ・ 相手は${z.rivalH2H.rank ? z.rivalH2H.rank + "位" : "ランク外"}、今季${z.rivalH2H.titles}勝${z.rivalH2H.label ? ` ・ 関係「${z.rivalH2H.label}」` : ""}</p>` : ""}
      <p><b>今季の成長:</b> ${(z.attrDelta || []).map(([k, v]) => `<span class="${v > 0 ? "green" : "red"}">${ATTRL[k]} ${signed(v)}</span>`).join(" ・ ") || "—"}</p>
      <p><b>来季の防衛ポイント:</b> 1-3月 ${z.defend[0]} / 4-6月 ${z.defend[1]} / 7-9月 ${z.defend[2]} / 10-12月 ${z.defend[3]}</p>
      <p class="accent">${esc(z.coach)}${z.ovrDelta !== null && z.ovrDelta !== undefined ? ` <span class="muted small">（総合 ${signed(z.ovrDelta)}）</span>` : ""}</p>
      <hr><p class="small"><b>年末No.1:</b> ${esc(z.no1)}<br><b>GS:</b> ${z.gsWinners.map(esc).join(" / ")}<br>${z.retired.length ? `<b>引退:</b> ${z.retired.map(esc).join("、")}<br>` : ""}${esc(z.newcomer || "")}</p>
      <p class="small muted">チームタブに新しいコーチ候補が届いています。</p>
      <button class="primary" data-close>閉じる</button>`;
  };
  U.epilogueHtml = () => { const e = U.S.human.epilogue; if (!e) return ""; return `${U.S.human.retireReason ? `<p class="small muted">${U.esc(U.S.human.retireReason)}</p>` : ""}<h1 class="gold">「${U.esc(e.tag)}」</h1><p>${e.lines.map(U.esc).join("<br>")}</p><p class="small muted">殿堂ギャラリー（スタート画面）に記録されました。</p>`; };

  // ---------- run loop ----------
  U.shouldStop = (rep) => { const st = rep.stops, s = U.settings; return st.includes("injury") || (st.includes("season") && s.stopSeason) || (st.includes("event") && s.stopEvent) || (st.includes("rival") && s.stopRival); };
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
    U.save(); U.runLog = log; U.planSel = null; U.planWeekTab = 0; U.modalQueue = [];
    const seasonRep = log.find((r) => r.season);
    if (seasonRep) U.modal = U.seasonHtml(seasonRep.season);
    if (S.human.careerOver) { U.pushHof(S.human.epilogue); U.modal = `<h2>引退</h2>${U.epilogueHtml()}<button data-close>閉じる</button>`; }
    let fanfare = false;
    for (const r of log) {
      for (const it of r.items) if (it.type === "milestone") { U.toast(`🏅 ${U.esc(it.text)}`, "gold"); fanfare = true; } else if (it.type === "goal") { U.toast(`🎯 ${U.esc(it.text)}`, "gold"); fanfare = true; }
      if (r.human && r.human.humanRound === "優勝") { U.toast(`🏆 ${U.esc(r.human.T.name)} 優勝！ +${r.human.humanPts}pt`, "gold"); fanfare = true; }
    }
    if (fanfare && U.sfx) U.sfx("milestone");
    // injury this run and nothing more important on screen → popup
    // the injury comes first, full screen; anything else (season report) waits behind it, events after
    if (!S.human.careerOver && U.human().injury && log.some((r) => r.stops.includes("injury"))) {
      if (U.modal) U.modalQueue.push({ html: U.modal, wide: U.modalWide });
      U.modal = U.injuryHtml(); U.modalWide = false; U.modalClass = "injury";
      if (U.sfx) U.sfx("injury");
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
          <label>難易度 <select id="diff">${Object.entries(W.DIFFICULTY).map(([k, d]) => `<option value="${k}" ${(window._diff || "normal") === k ? "selected" : ""}>${d.label}</option>`).join("")}</select></label>
          <label>怪我 <select id="inj"><option value="standard">標準</option><option value="low">低頻度</option></select></label>
          <label>シード <input id="seed" placeholder="空欄でランダム" style="width:120px"></label></div>
        <p class="small muted" style="margin-top:8px">所属国はホーム大会のワイルドカード確率・デビスカップ・スポンサーに影響。ホームATP大会がない国は実質ハードモード。</p>
        <p class="small muted" id="diffdesc">${Object.entries(W.DIFFICULTY).map(([k, d]) => `<b>${d.label}</b>: ${d.desc}`).join(" ／ ")}</p></div>
      <div class="panel"><h2>出自を選ぶ</h2>
      <div class="grid3">${Object.entries(U.ORIGINS).map(([k, o]) => `<div class="card origin ${sel === k ? "sel" : ""}" data-o="${k}"><div style="font-size:26px">${o.icon}</div><h3>${o.name} <span class="muted small">${o.age}歳スタート</span></h3><p class="small">${o.desc}</p><p class="small muted">特徴: ${o.diff}</p></div>`).join("")}</div>
      <p class="small muted">ポテンシャル（能力の天井）はプレイヤーには見えません。コーチのコメントと同年代との比較から推測してください。約10%で「世代の才能」を引きます。出自で天井は変わらず、どの出自からでもNo.1を狙えます。</p>
      <button class="primary" id="start" style="padding:10px 22px;font-size:15px">キャリアを始める</button></div>
      ${[1, 2, 3].some((n) => U.slotInfo(n)) ? `<div class="panel"><h2>セーブデータ</h2>${U.slotsHtml(true)}</div>` : ""}
      ${hof.length ? `<div class="panel"><h2>殿堂ギャラリー</h2>${hof.map((e) => `<div class="card"><div class="row between"><div><b>${flag(e.country)} ${esc(e.name)}</b> <span class="muted small">${U.ORIGINS[e.origin] ? U.ORIGINS[e.origin].name : ""} ・ ${e.seasons || "-"}シーズン ・ ${e.date || ""}</span><div class="${e.hof ? "gold" : "muted"}" style="font-weight:700">「${esc(e.tag)}」${e.hof ? " 🏛 殿堂入り" : ""}${e.academy ? " 🎓" : ""}</div></div><div class="small muted" style="text-align:right">最高${e.bestRank || "-"}位 ・ ${e.titles}勝（GS${e.gs}）<br>${e.legacy !== undefined ? `レガシー ${e.legacy} ・ ` : ""}No.1 ${e.weeksNo1}週 ・ ${e.w}-${e.l} ・ ${U.money(e.prize || 0)}</div></div>${e.timeline && e.timeline.length ? `<div class="timeline" style="margin-top:8px">${e.timeline.map((z) => `<div class="yr"><div class="muted">${z.y}<br><span class="tiny">${z.age}歳</span></div><div class="r ${z.rank && z.rank <= 10 ? "top10" : z.rank && z.rank <= 50 ? "top50" : ""}">${z.rank || "-"}</div><div>${z.w}-${z.l}</div>${z.titles ? `<div class="t">🏆×${z.titles}</div>` : ""}</div>`).join("")}</div>` : ""}</div>`).join("")}</div>` : ""}
    </div>`;
    app.querySelectorAll(".origin").forEach((el) => el.onclick = () => { window._origin = el.dataset.o; window._name = document.getElementById("name").value; window._country = document.getElementById("country").value; window._diff = document.getElementById("diff").value; U.renderSetup(); });
    document.getElementById("start").onclick = () => {
      const name = document.getElementById("name").value.trim() || "名無しの選手";
      const seedStr = document.getElementById("seed").value.trim();
      U.S = W.create({ name, country: document.getElementById("country").value, origin: sel, difficulty: document.getElementById("diff").value, injuryRealism: document.getElementById("inj").value, seed: seedStr ? (parseInt(seedStr, 10) || TL.RNG.hash(seedStr)) : undefined });
      U.save(); U.tab = "home"; U.runLog = null; U.planSel = null; U.render();
      if (!U.settings.introSeen) { U.settings.introSeen = true; U.saveSettings(); U.openModal(U.introHtml()); }
    };
    U.bindSlots(app);
    U.renderModal();
  };
  U.newGame = () => U.openModal(`<h2>新しいキャリアを始める</h2><p>スロット${U.slot()}のキャリアを削除して新しく始めますか？この操作は取り消せません。別のスロットで始めるなら設定の「セーブスロット」から。</p><div class="row"><button class="danger" data-confirm-new>削除して始める</button><button data-close>やめる</button></div>`);
  U.resetGame = () => { try { localStorage.removeItem(U.saveKeyFor(U.slot())); } catch (e) {} U.S = null; U.modal = null; U.runLog = null; U.planSel = null; U.render(); };
})();
