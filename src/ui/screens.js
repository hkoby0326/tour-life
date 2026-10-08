// Screens: plan, report, ranking, calendar, player, team, finance, records, settings.
(function () {
  const U = TL.UI, W = U.W, D = U.D;
  const { esc, flag, money, signed, catPill, icon } = U;
  const cal = U.cal, human = U.human, rival = U.rival, ATTRL = U.ATTRL;

  function sparkline(vals, color) {
    if (vals.length < 2) return '<span class="muted small">データ不足</span>';
    const w = 300, hh = 56, min = Math.min(...vals) - 0.5, max = Math.max(...vals) + 0.5;
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${hh - ((v - min) / (max - min)) * hh}`).join(" ");
    return `<svg width="100%" viewBox="0 0 ${w} ${hh}" preserveAspectRatio="none" style="height:56px;display:block"><polyline fill="none" stroke="${color || "var(--accent)"}" stroke-width="2" points="${pts}"/></svg>`;
  }
  U.sparkline = sparkline;
  function seasonStrip(me) {
    const S = U.S;
    const cells = [];
    for (let w = 1; w <= 52; w++) {
      const res = me.results.filter((r) => r.year === S.year && r.week === w && r.cat !== "PREV");
      const gs = D.ATP_CALENDAR.some((x) => x.week === w && x.cat === "GS");
      let cls = res.length ? (res.some((r) => r.round === "優勝") ? "won" : "played") : "";
      if (gs) cls += " gs";
      if (w === S.week) cls += " now";
      const title = res.length ? res.map((r) => `${r.name} ${r.round} ${r.pts}pt`).join(", ") : `第${w}週`;
      cells.push(`<div class="${cls}" title="${esc(title)}"></div>`);
    }
    return `<div class="strip">${cells.join("")}</div><div class="row between small muted"><span>1月</span><span>4月</span><span>7月</span><span>10月</span><span>オフ</span></div>`;
  }

  // ---------- ホーム（UI-2） ----------
  function decisionCard(me) {
    const S = U.S;
    const tours0 = W.weekTournaments(S);
    const blocked = me.blockedUntil >= S.t;
    const auto0 = blocked ? { type: "blocked", reason: "2週開催の大会の2週目" } : me.injury ? { type: "rest", reason: `${me.injury.label}。復帰まで${me.injury.weeks}週` } : W.autoAction(S, tours0);
    const autoT = auto0.type === "enter" ? tours0.find((T) => T.id === auto0.tid) : null;
    const label = auto0.type === "enter" ? `${flag(autoT.country)} ${esc(autoT.name)} にエントリー` : auto0.type === "rest" ? "休養" : auto0.type === "camp" ? "オフシーズン合宿" : auto0.type === "blocked" ? "大会2週目（移動・調整）" : `練習（${ATTRL[S.human.focus[0]]}・${ATTRL[S.human.focus[1]]}）`;
    return { auto0, autoT, label };
  }
  // v2.11: what the coming season's decline looks like, and the three levers against it
  function declineBlock(me) {
    const S = U.S, a = W.age(S, me);
    if (a < 29) return "";
    const e = W.declineEstimate(S, me), m = W.declineMods(S), al = W.allocOf(S), dev = W.devOf(S);
    const on = (b) => (b ? '<b class="green">ON</b>' : '<span class="muted">OFF</span>');
    return `<div class="card" style="margin-top:10px"><h3>衰えとの向き合い方 <span class="muted small">${a}歳</span></h3>
      ${e.ga >= 30 ? `<p class="small">来季の衰えの見込み: 身体（スピード・スタミナ・パワー）<b class="red">−${e.body}</b>/年${e.body < e.raw ? ` <span class="muted">（対策なしなら −${e.raw}）</span>` : ""} ・ 技術 約<b class="red">−${e.tech}</b>/年</p>` : '<p class="small muted">衰えは来季から始まる。</p>'}
      <ul class="small" style="margin:6px 0 0 18px;line-height:1.8">
        <li>身体を守る: 練習配分のフィジカル ${al.physical || 0}コマ → 身体の衰え −${Math.round(Math.min(0.5, (al.physical || 0) * 0.1) * 100)}%（1コマ −10%、最大 −50%）</li>
        <li>スタイルを変える（29歳〜）: 目標スタイル「ベテランの技巧」 ${on(dev.style === "veteran")} → 技術の衰え −50%、確立でサーブ +2.5・勝負所 +8</li>
        <li>出場を絞る（30歳〜）: 方針「厳選（ベテラン）」 ${on(S.human.strategy === "veteran")} → GS・マスターズでサーブ・リターン +1.5、怪我 ×0.75、身体の衰え −15%</li></ul>
      <p class="tiny muted" style="margin-top:4px">現在の倍率: 身体 ×${m.body.toFixed(2)}、技術 ×${m.tech.toFixed(2)}</p></div>`;
  }
  // v2.12: how the player's game travels across surfaces (style fit + surface affinity), vs an equal all-rounder
  function surfEdge(p, s) { const f = TL.surfaceFit(p)[s] || 0, aff = ((p.surf[s] || 50) - 50) * 0.29; return { style: f, aff, total: f + aff }; }
  function surfFitHtml(p) {
    const sg = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(0)}%`;
    return `<table class="small" style="margin-top:6px"><tr><th></th><th class="num">プレースタイル</th><th class="num">適性値</th><th class="num">合計（目安）</th></tr>${Object.keys(D.SURFACES).map((s) => { const e = surfEdge(p, s); return `<tr><td>${D.SURFACES[s]}</td><td class="num">${sg(e.style)}</td><td class="num">${sg(e.aff)}</td><td class="num ${e.total >= 2 ? "green" : e.total <= -2 ? "red" : ""}"><b>${sg(e.total)}</b></td></tr>`; }).join("")}</table>
      <p class="tiny muted">同じ総合力のオールラウンダーと戦ったときの勝率の差（目安）。芝・室内はサーブとリターン、クレーはラリーが効く。適性値は試合に出るたびに上がる。</p>`;
  }
  // v2.17: who is becoming a rival, and why
  function rivalCandsHtml() {
    const S = U.S, cands = (S.human.rivalCands || []).map((c) => Object.assign({ p: S.players.find((p) => p.id === c.id) }, c)).filter((c) => c.p && !c.p.retired);
    if (!cands.length) return `<div class="panel"><h2>ライバル関係</h2><p class="small muted">まだ因縁はない。同じ相手と何度も当たる、決勝で負ける、同世代と順位を競る——そこから宿敵が生まれる（スコア ${W.RIVAL_MIN} 以上で宿敵に）。</p></div>`;
    return `<div class="panel"><h2>ライバル関係 <span class="muted small">結果から自動で決まる</span></h2><table class="small">${cands.map((c) => { const h2h = S.history.matches.filter((m) => m.oppId === c.id); return `<tr class="${c.p.isRival ? "rival" : ""}"><td><span data-player="${c.id}" class="accent">${esc(c.p.name)}</span>${c.p.isRival ? ' <span class="pill rival">宿敵</span>' : ""}</td><td class="num">${c.p.rank || "-"}位</td><td class="num">${h2h.filter((m) => m.won).length}-${h2h.filter((m) => !m.won).length}</td><td class="muted">${esc([...new Set(c.why)].slice(0, 3).join("・"))}</td><td class="num">${c.v}</td></tr>`; }).join("")}</table><p class="tiny muted">スコア: 直近3季の対戦1回 +3、3戦以上で拮抗 +4、大舞台・決勝での対戦 +2、決勝で敗れた +3、同世代で順位が近い +3。${W.RIVAL_MIN} 以上で宿敵、入れ替わりには +8 の差と40週以上の間隔が必要（対戦が途絶えて薄れた因縁は除く）。</p></div>`;
  }
  function goalsCard() {
    const G = W.goalsView(U.S);
    return `<div class="panel"><h2>今季の目標 <span class="muted small">${cal(G.year)}年</span></h2><div class="goals">${G.list.map((g) => `<div class="goal ${g.done ? "done" : ""}"><span class="gk">${g.done ? "✓" : "○"}</span><div><b>${esc(g.label)}</b><div class="tiny muted">${g.done ? "達成" : esc(g.cur)}${g.type === "rank" && !g.done ? " ・ 年末に判定" : ""} ・ 成長pt +${g.gp}</div></div></div>`).join("")}</div><div class="tiny muted" style="margin-top:6px">3つとも達成でスポンサーから ${money(G.bonus)}</div></div>`;
  }
  function legacyCard() {
    const L = W.legacyView(U.S);
    const chase = L.records.filter((r) => r.mine > 0 && !r.mineIsRecord).sort((a, b) => (a.record - a.mine) - (b.record - b.mine))[0];
    const held = L.records.filter((r) => r.mineIsRecord);
    return `<div class="panel"><h2>レガシー <span class="muted small">最終目標は殿堂入り</span></h2>
      <div class="row between"><div><span style="font-size:26px;font-weight:800" class="${L.hof ? "gold" : ""}">${L.total}</span><span class="muted small"> / 殿堂ライン ${L.line}</span></div><button class="small" data-legacy>詳しく</button></div>
      <div class="lgbar big"><i style="width:${Math.min(100, (L.total / L.line) * 100)}%"></i></div>
      <div class="small" style="margin-top:6px">${L.hof ? '<b class="gold">殿堂入りラインに到達</b>' : `殿堂まで ${esc(L.gapText)}`}</div>
      <div class="small muted" style="margin-top:4px">この世界の歴代 ${L.rank ? `<b>${L.rank}位</b> / ${L.of}人` : "-"}${L.next ? ` ・ 次は <span data-player="${L.next.id}" class="accent">${esc(L.next.name)}</span>（${L.next.v}pt）まで あと${L.next.gap}` : ""}</div>
      ${!U.S.human.retireYear && W.age(U.S, U.human()) >= 30 ? '<div style="margin-top:8px"><button class="small" data-announce-open>今季限りで引退を表明…</button></div>' : ""}
      ${held.length ? `<div class="small gold" style="margin-top:4px">記録保持: ${held.map((r) => `${esc(r.label)} ${r.mine}${r.unit}`).join("、")}</div>` : chase ? `<div class="small muted" style="margin-top:4px">記録まで: ${esc(chase.label)} ${chase.mine}/${chase.record}${chase.unit}（${esc(chase.holder)}）</div>` : ""}</div>`;
  }
  U.screens.home = function (c) {
    const S = U.S, me = human(), rv = rival();
    if (S.human.careerOver) { c.innerHTML = `<div class="panel"><h2>キャリア終了</h2>${U.epilogueHtml()}<button class="danger" id="newgame">新しいキャリアを始める</button></div>`; document.getElementById("newgame").onclick = U.newGame; return; }
    const { auto0, autoT, label } = decisionCard(me);
    const load8 = W.recentLoad(S, me, 8);
    const r0 = me.rank || 9999;
    const maxLoad = r0 <= 20 ? 4 : r0 <= 100 ? 5 : 6;
    const seasonT = new Set(me.results.filter((r) => r.year === S.year && r.cat !== "PREV").map((r) => r.t)).size;
    const guide = r0 <= 20 ? "年15〜20大会" : r0 <= 100 ? "年22〜26大会" : "年26〜30大会";
    // next event card
    let nextCard = "";
    if (autoT) {
      const st = W.humanStatus(S, autoT);
      const heads = W.likelyEntrants(S, autoT, 4);
      const defend = me.results.filter((r) => r.tid === autoT.tid).reduce((s, r) => s + r.pts, 0);
      nextCard = `<div class="card"><h3>次の大会</h3><div class="row between"><div><b style="font-size:16px">${flag(autoT.country)} ${esc(autoT.name)}</b> ${catPill(autoT)}${autoT.country === me.country ? ' <span class="pill gold">ホーム</span>' : ""}</div><span class="small"><span class="sdot ${st.code}"></span>${esc(st.label)}</span></div>
        <div class="small muted" style="margin:6px 0">${autoT.def.draw}ドロー ・ 優勝 ${autoT.def.points[0]}pt / ${money(autoT.def.prize[0])} ・ 初戦敗退 ${money(autoT.def.prize[autoT.def.prize.length - 1])}${autoT.def.weeks === 2 ? " ・ 2週開催" : ""}${autoT.def.bo5 ? " ・ 5セット" : ""}${defend ? ` ・ <span class="gold">防衛 ${defend}pt</span>` : ""}</div>
        ${(() => { const e = surfEdge(me, autoT.surface); return Math.abs(e.total) >= 1 ? `<div class="small ${e.total > 0 ? "green" : "red"}" style="margin-bottom:4px">${D.SURFACES[autoT.surface]}との相性 ${e.total > 0 ? "+" : "−"}${Math.abs(e.total).toFixed(0)}%（目安。選手タブで詳細）</div>` : ""; })()}
        ${heads.length ? `<div class="small">有力出場者: ${heads.map((p) => `<span data-player="${p.id}" class="accent">${esc(p.name)}</span><span class="muted">(${p.rank})</span>`).join("、")}</div>` : ""}</div>`;
    }
    // rank trend
    const rh = (S.human.rankHist || []).filter((x) => x.rank);
    const rankSpark = rh.length >= 2 ? sparkline(rh.map((x) => -x.rank), "var(--accent)") : '<span class="muted small">まだデータがない</span>';
    const best = rh.length ? Math.min(...rh.map((x) => x.rank)) : null;
    // inbox: pending event, recent news, coach comment
    const hr = me.potential - TL.overall(me);
    const coachLine = hr > 20 ? "伸びしろはまだ大きい。土台を作る時期だ" : hr > 10 ? "まだ伸びる。弱点を一つずつ潰そう" : hr > 4 ? "完成が近い。勝ち方を覚える段階だ" : "技術はほぼ完成形。維持とスケジュール管理が課題";
    const items = [];
    if (S.human.event) items.push(`<div class="item event"><span class="when">今</span><div><b class="gold">${esc(S.human.event.title)}</b><div class="muted">${esc(S.human.event.text)}</div><button class="primary small" data-ev style="margin-top:4px">選択する</button></div></div>`);
    const talk = W.coachTalk(S);
    items.push(`<div class="item coach"><span class="when">${esc(talk.who)}<br><span class="tiny">${esc(talk.type)}</span></span><div>${talk.lines.map((l) => `「${esc(l)}」`).join("<br>")}</div></div>`);
    for (const n of S.history.news.slice().reverse().slice(0, 12)) items.push(`<div class="item"><span class="when">${cal(n.year)} W${n.week}</span><div>${esc(n.text)}</div></div>`);
    // rival card
    const h2h = S.history.matches.filter((m) => m.oppId === S.rivalId);
    const rivalCard = rv ? `<div class="panel"><h2>宿敵</h2><div class="rivalcard"><div class="identity">${U.avatar(me)}<div><div class="name">${esc(me.name)}</div><div class="sub">${me.rank ? me.rank + "位" : "ランク外"} ・ ${me.stats.titles}勝</div></div></div><div class="vs">VS</div><div class="identity" data-player="${rv.id}" style="cursor:pointer">${U.avatar(rv)}<div><div class="name">${esc(rv.name)}</div><div class="sub">${rv.retired ? "引退" : rv.rank ? rv.rank + "位" : "ランク外"} ・ ${rv.stats.titles}勝</div></div></div></div>
      <p class="small" style="margin-top:8px">対戦成績 <b>${h2h.filter((m) => m.won).length}勝${h2h.filter((m) => !m.won).length}敗</b>${rv.rank && me.rank ? ` ・ 順位差 ${me.rank < rv.rank ? `<span class="green">${rv.rank - me.rank}位リード</span>` : me.rank > rv.rank ? `<span class="red">${me.rank - rv.rank}位ビハインド</span>` : "同順位"}` : ""}${h2h.length ? ` ・ 前回 ${esc(h2h[h2h.length - 1].tour)} ${h2h[h2h.length - 1].won ? '<span class="green">勝ち</span>' : '<span class="red">負け</span>'}` : ""}</p>
      <div class="row small" style="gap:8px;margin-top:6px"><span class="muted">関係</span><span class="heat" title="因縁メーター"><div style="width:${Math.round(S.human.rivalry ? S.human.rivalry.heat : 25)}%"></div></span><b>${W.rivalryLabel(S.human.rivalry ? S.human.rivalry.heat : 25)}</b></div>
      ${S.human.rivalry && S.human.rivalry.log.length ? `<div class="small muted" style="margin-top:6px">${S.human.rivalry.log.slice(-3).reverse().map((l) => `<div>${cal(l.year)} W${l.week} ・ ${esc(l.text)}</div>`).join("")}</div>` : ""}</div>` : "";
    c.innerHTML = `<div class="grid2" style="grid-template-columns:1.25fr .75fr">
      <div>
        ${S.human.retireYear ? `<div class="card farewell"><b class="gold">${S.year === S.human.retireYear ? "ラストシーズン" : `${cal(S.human.retireYear)}年がラストシーズン`}</b> <span class="small muted">${S.year === S.human.retireYear ? `残り${53 - S.week}週 ・ 全試合で勝負所 +2` : "表明済み"}</span></div>` : ""}
        <div class="card hero" style="padding:16px 18px"><h3>今週の決断 ・ ${cal()}年 第${S.week}週</h3><div style="font-size:22px;font-weight:800;margin:4px 0 6px">${label}</div><p class="small muted" style="margin:0 0 6px">${esc(auto0.reason || "")}</p>
          <label class="small" style="display:block;margin:0 0 10px">方針 <select data-strategy-home>${Object.entries(W.STRATEGIES).filter(([k]) => W.strategyOk(S, k) || S.human.strategy === k).map(([k, v]) => `<option value="${k}" ${(S.human.strategy || "big") === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
          <div class="row actions"><button class="primary bigbtn" data-go-auto>この判断で1週進める</button><button data-go="plan">4週プランを組む</button><button data-auto>自動進行（停止条件まで）</button></div></div>
        ${nextCard}
        <div class="panel"><h2>シーズン ・ ${cal()}年</h2>${seasonStrip(me)}<div class="row between small muted"><span>今季 ${seasonT}大会（目安 ${guide}）</span><span class="loadmeter">直近8週の負荷 <span class="bar"><div style="width:${Math.min(100, (load8 / maxLoad) * 100)}%;background:${load8 >= maxLoad ? "var(--red)" : load8 >= maxLoad - 1 ? "var(--gold)" : "var(--green)"}"></div></span> ${load8}/${maxLoad}</span></div></div>
        <div class="grid2"><div class="panel"><h2>順位の推移</h2><div class="small muted" style="margin:-6px 0 6px">直近${rh.length}週${best ? ` ・ 最高${best}位` : ""}</div>${rankSpark}</div>
        <div class="panel"><h2>コンディション</h2><div class="attr" style="grid-template-columns:70px 1fr 40px"><span>疲労</span><div class="bar"><div style="width:${me.fatigue}%;background:${me.fatigue > 60 ? "var(--red)" : me.fatigue > 40 ? "var(--gold)" : "var(--green)"}"></div></div><span class="num">${Math.round(me.fatigue)}</span></div>
          <div class="small muted">${me.injury ? `<span class="red">${esc(me.injury.label)} 残り${me.injury.weeks}週</span>` : "怪我なし"} ・ 資金 <b class="${S.human.money < 0 ? "red" : ""}">${money(S.human.money)}</b>${W.cashOf(S).budget ? ' ・ <span class="gold">節約モード</span>' : ""}${W.cashOf(S).loan > 0 ? ` ・ 借入 ${money(W.cashOf(S).loan)}` : ""}</div>
          ${S.human.money < 10 ? `<div class="small red" style="margin-top:4px">資金が尽きかけている。<a href="#" data-goto-finance class="accent">財務タブで資金繰り</a></div>` : ""}
          <div class="attr" style="grid-template-columns:70px 1fr 40px;margin-top:4px"><span>試合勘</span><div class="bar"><div style="width:${Math.round(me.sharp || 0)}%;background:${(me.sharp || 0) >= 55 ? "var(--green)" : (me.sharp || 0) >= 40 ? "var(--gold)" : "var(--red)"}"></div></div><span class="num">${Math.round(me.sharp || 0)}</span></div>
          <div class="small muted">${W.sharpLabel(me.sharp || 0)} ・ 自信: ${W.confLabel(me.conf || 0)}${(me.sharp || 0) < 55 ? ' <span class="gold">（試合に出ると戻る）</span>' : ""}</div>
          <div class="small muted" style="margin-top:6px">試合プラン: ${TL.PLANS[S.human.plan].label} ・ 練習: ${esc(W.allocSummary(W.devOf(S).auto ? W.autoAlloc(S, me) : W.allocOf(S)))} ・ 方針: ${W.STRATEGIES[S.human.strategy || "big"].label}</div></div></div>
      </div>
      <div>${goalsCard()}${legacyCard()}${rivalCard}<div class="panel"><h2>受信箱</h2><div class="inbox">${items.join("")}</div></div></div></div>`;
    const lgb = c.querySelector("[data-legacy]"); if (lgb) lgb.onclick = () => U.openModal(U.legacyHtml(), true);
    c.querySelectorAll("[data-announce-open]").forEach((b) => b.onclick = U.announceModal);
    c.querySelector("[data-go-auto]").onclick = () => U.runWeeks([auto0.type === "blocked" ? { type: "blocked" } : { type: "auto" }]);
    const gf = c.querySelector("[data-goto-finance]"); if (gf) gf.onclick = (e) => { e.preventDefault(); U.tab = "finance"; U.render(); };
    const sh = c.querySelector("[data-strategy-home]"); if (sh) sh.onchange = () => { S.human.strategy = sh.value; U.save(); U.render(); };
    c.querySelector("[data-go]").onclick = () => { U.tab = "plan"; U.render(); };
    c.querySelector("[data-auto]").onclick = () => U.autoRun(60);
    const eb = c.querySelector("[data-ev]"); if (eb) eb.onclick = () => U.openModal(U.eventHtml(S.human.event));
    U.bindPlayerLinks(c);
  };

  // ---------- プラン（UI-3: 月カレンダー形式） ----------
  function weekAt(i) { const S = U.S; let wk = S.week + i, yr = S.year; while (wk > 52) { wk -= 52; yr++; } return { wk, yr }; }
  function ensurePlan() { const S = U.S; if (U.planSel && U.planWeekT === S.t) return; U.planSel = [0, 1, 2, 3].map(() => ({ choice: "auto", doubles: false })); U.planWeekT = S.t; }
  function toAction(p) {
    const S = U.S;
    if (p.choice === "auto") return { type: "auto" };
    if (p.choice === "train") return { type: "train", focus: S.human.focus };
    if (p.choice === "camp") return { type: "camp", focus: S.human.focus };
    if (p.choice === "rest") return { type: "rest" };
    if (p.choice === "blocked") return { type: "blocked" };
    return { type: "enter", tid: p.choice, doubles: p.doubles };
  }
  U.screens.plan = function (c) {
    const S = U.S, settings = U.settings;
    const me = human();
    if (S.human.careerOver) { c.innerHTML = `<div class="panel"><h2>キャリア終了</h2>${U.epilogueHtml()}<button class="danger" id="newgame">新しいキャリアを始める</button></div>`; document.getElementById("newgame").onclick = U.newGame; return; }
    ensurePlan();
    let html = "";
    if (me.injury) {
      html += `<div class="panel"><h2>離脱中</h2><p>${esc(me.injury.label)}。復帰まで${me.injury.weeks}週。リハビリ中は休養に固定される。</p><div class="row"><button class="primary" data-run="1">1週進める</button><button data-run="heal">復帰まで進める</button></div></div>`;
      c.innerHTML = html;
      c.querySelector('[data-run="1"]').onclick = () => U.runWeeks([{ type: "rest" }]);
      c.querySelector('[data-run="heal"]').onclick = () => U.runWeeks(Array.from({ length: me.injury.weeks + 1 }, () => ({ type: "rest" })), { untilHealed: true });
      return;
    }
    const seasonT = new Set(me.results.filter((r) => r.year === S.year && r.cat !== "PREV").map((r) => r.t)).size;
    const load8 = W.recentLoad(S, me, 8);
    const r0 = me.rank || 9999;
    const guide = r0 <= 20 ? "年15〜20大会" : r0 <= 100 ? "年22〜26大会" : "年26〜30大会";
    const maxLoad = r0 <= 20 ? 4 : r0 <= 100 ? 5 : 6;
    const showAll = window._showAllTours;
    let hidden = 0;
    // header: policy + load meter
    html += `<div class="panel"><div class="row between"><h2 style="margin:0;border:0;padding:0">4週間のプラン <span class="muted small">第${S.week}週〜</span></h2><span class="loadmeter">今季 ${seasonT}大会（目安 ${guide}） ・ 負荷 <span class="bar"><div style="width:${Math.min(100, (load8 / maxLoad) * 100)}%;background:${load8 >= maxLoad ? "var(--red)" : load8 >= maxLoad - 1 ? "var(--gold)" : "var(--green)"}"></div></span> ${load8}/${maxLoad}</span></div>
      <div class="row" style="gap:16px;margin-top:10px">
      <span class="small">練習配分: <b>${esc(W.allocSummary(W.devOf(S).auto ? W.autoAlloc(S, me) : W.allocOf(S)))}</b>${W.devOf(S).auto ? "（コーチ）" : ""}</span>
      <label class="small">試合プラン <select data-plan>${Object.entries(TL.PLANS).map(([k, p]) => `<option value="${k}" ${S.human.plan === k ? "selected" : ""}>${p.label}</option>`).join("")}</select></label>
      <label class="small">自動の方針 <select data-strategy>${Object.entries(W.STRATEGIES).filter(([k]) => W.strategyOk(S, k) || S.human.strategy === k).map(([k, v]) => `<option value="${k}" ${(S.human.strategy || "big") === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
      <label class="small">セット間 <select data-rule><option value="none" ${S.human.switchRule === "none" ? "selected" : ""}>切り替えない</option><option value="behind" ${S.human.switchRule === "behind" ? "selected" : ""}>セットを落としたら攻撃的に</option></select></label></div>
      <p class="small muted" style="margin:8px 0 0">${esc(W.STRATEGIES[S.human.strategy || "big"].desc)}</p>
      <p class="small muted" style="margin:4px 0 0">育成計画: ${W.devOf(S).style ? W.DEV_STYLES[W.devOf(S).style].label + (W.devOf(S).established ? "（確立）" : "") : "スタイル未設定"} ・ 強度 ${W.INTENSITY[W.devOf(S).intensity].label}${W.devOf(S).auto ? " ・ 重点はコーチ任せ" : ""} <a href="#" data-goto-player class="accent">選手タブで変更</a></p></div>`;
    // columns (phones show one week at a time via .wtabs)
    let cols = "";
    const activeW = U.planWeekTab || 0;
    let wtabs = "";
    let blockedNext = me.blockedUntil >= S.t;
    for (let i = 0; i < 4; i++) {
      const { wk, yr } = weekAt(i);
      const tours = W.weekTournaments(S, wk, yr);
      const sel = U.planSel[i];
      wtabs += `<button class="${activeW === i ? "on" : ""}" data-wtab="${i}">第${wk}週<span class="sub">${blockedNext ? "大会2週目" : sel.choice === "auto" ? "おまかせ" : sel.choice === "train" ? "練習" : sel.choice === "rest" ? "休養" : sel.choice === "camp" ? "合宿" : "大会"}</span></button>`;
      if (blockedNext) { cols += `<div class="pcol blocked ${activeW === i ? "active" : ""}"><div><b>第${wk}週</b><div class="small muted">大会2週目<br>（移動・調整）</div></div></div>`; blockedNext = false; sel.choice = "blocked"; continue; }
      if (sel.choice === "blocked") sel.choice = "auto";
      const all = tours.map((T) => { const st = W.humanStatus(S, T); const ok = ["direct", "bubble", "qual", "wc"].includes(st.code) || (T.cat === "FINALS" && st.code === "direct"); return { T, st, ok }; });
      const vis = showAll ? all : all.filter((o) => (o.ok && !(o.st.code === "wc" && /低確率/.test(o.st.label))) || o.st.code === "money");
      hidden += all.length - vis.length;
      const isTour = !["auto", "train", "rest", "camp"].includes(sel.choice);
      const segs = [["auto", "おまかせ"], ["train", "練習"], ["rest", "休養"]];
      if (tours.length === 0) segs.push(["camp", "合宿"]);
      const seg = `<div class="seg">${segs.map(([k, l]) => `<button class="${sel.choice === k ? "on" : ""}" data-seg="${i}:${k}">${l}</button>`).join("")}</div>`;
      const cards = vis.map((o) => {
        const T = o.T;
        const defend = me.results.filter((r) => r.tid === T.tid).reduce((s, r) => s + r.pts, 0);
        return `<div class="tcard t${T.def.tier} ${sel.choice === T.id ? "sel" : ""} ${o.ok ? "" : "disabled"}" data-pick="${i}:${T.id}" ${o.ok ? "" : 'data-disabled="1"'} title="${esc(o.st.label)}">
          <div class="tname"><span>${flag(T.country)} ${esc(T.name)}</span><span class="pill tier${T.def.tier}">${T.def.short}</span></div>
          <div class="tmeta"><span class="pill ${T.surface}">${D.SURFACES[T.surface]}</span><span>${T.def.draw}ドロー</span><span>${T.def.points[0]}pt</span><span>${money(T.def.prize[0])}</span>${T.def.weeks === 2 ? "<span>2週</span>" : ""}${T.country === me.country ? '<span class="gold">ホーム</span>' : ""}${defend ? `<span class="gold">防衛${defend}</span>` : ""}</div>
          <div class="tstat"><span class="sdot ${o.st.code}"></span>${esc(o.st.label)}</div>
          ${sel.choice === T.id && T.cat !== "FINALS" ? `<label class="tiny" style="display:block;margin-top:4px"><input type="checkbox" data-dbl="${i}" ${sel.doubles ? "checked" : ""}> ダブルスにも出る</label>` : ""}</div>`;
      }).join("");
      cols += `<div class="pcol ${activeW === i ? "active" : ""}"><div class="phead"><b>第${wk}週</b><span class="small muted">${yr !== S.year ? cal(yr) + "年" : ""}</span></div>${seg}${cards || (tours.length ? '<div class="small muted" style="text-align:center;padding:12px 0">出られる大会なし</div>' : '<div class="small muted" style="text-align:center;padding:12px 0">オフシーズン</div>')}</div>`;
      const chosen = tours.find((T) => T.id === sel.choice);
      if (isTour && chosen && chosen.def.weeks === 2) blockedNext = true;
    }
    html += `<div class="panel"><div class="wtabs">${wtabs}</div><div class="planner">${cols}</div>
      <div class="row between actions" style="margin-top:12px"><div class="row actions" style="flex:1"><button class="primary bigbtn" data-run="4">この4週を進める</button><button data-run="1">1週だけ進める</button><button data-auto="60">自動進行（停止条件まで）</button></div>${hidden || showAll ? `<button data-showall class="small">${showAll ? "出られない大会を隠す" : `出られない大会を表示（${hidden}）`}</button>` : ""}</div>
      <p class="small muted" style="margin:8px 0 0">大会カードをクリックで選択。「おまかせ」は出られる最上位の大会に出るが、疲労45超・負荷上限・GS翌週は休む。先の週の当落は現在のランキングで推定。</p></div>`;
    html += `<div class="grid2"><div class="panel"><h2>自動進行の停止条件</h2>
      ${[["stopTournament", "自分の大会が終わるごと"], ["stopMilestone", "ランキングの節目"], ["stopEvent", "イベント（選択肢）"], ["stopRival", "宿敵との対戦"], ["stopSeason", "シーズン終了"]].map(([k, l]) => `<label class="small" style="display:inline-block;margin-right:14px"><input type="checkbox" data-set="${k}" ${settings[k] ? "checked" : ""}> ${l}</label>`).join("")}</div>
    <div class="panel"><h2>観戦モード</h2><p class="small muted">重要試合はポイント単位で観戦し、セット間にプランを変えられる。</p>
      ${[["watchEnabled", "観戦モードを使う"], ["watchFinals", "ATPファイナルズ（全試合）"], ["watchTop10", "トップ10戦"], ["watchRival", "宿敵戦"]].map(([k, l]) => `<label class="small" style="display:inline-block;margin-right:14px"><input type="checkbox" data-set="${k}" ${settings[k] ? "checked" : ""}> ${l}</label>`).join("")}
      <div class="row" style="gap:14px;flex-wrap:wrap;margin-top:8px">${(() => { const d = U.watchDepth(); const opt = (k, list) => list.map(([v, l]) => `<option value="${v}" ${d[k] === v ? "selected" : ""}>${l}</option>`).join("");
        const F = [["off", "観戦しない"], ["final", "決勝のみ"], ["sf", "準決勝から"], ["qf", "準々決勝から"], ["all", "全試合"]];
        return [["gs", "グランドスラム", F], ["m1000", "マスターズ1000・五輪・デビスカップ", F.slice(0, 4)], ["tour", "ATP 500・250", F.slice(0, 3)], ["lower", "チャレンジャー・ITF", F.slice(0, 2)]].map(([k, l, list]) => `<label class="small">${l} <select data-wdepth="${k}">${opt(k, list)}</select></label>`).join(""); })()}</div></div></div>`;
    c.innerHTML = html;
    const gp = c.querySelector("[data-goto-player]"); if (gp) gp.onclick = (e) => { e.preventDefault(); U.tab = "player"; U.render(); };
    const stSel = c.querySelector("[data-strategy]"); if (stSel) stSel.onchange = () => { S.human.strategy = stSel.value; U.save(); U.render(); };
    c.querySelectorAll("[data-focus]").forEach((s) => s.onchange = () => { const f = [...c.querySelectorAll("[data-focus]")].map((x) => x.value); if (f[0] === f[1]) f[1] = W.ATTRS.find((k) => k !== f[0]); S.human.focus = f; U.save(); U.render(); });
    c.querySelector("[data-plan]").onchange = (e) => { S.human.plan = e.target.value; U.save(); };
    c.querySelector("[data-rule]").onchange = (e) => { S.human.switchRule = e.target.value; U.save(); };
    c.querySelectorAll("[data-wtab]").forEach((b) => b.onclick = () => { U.planWeekTab = parseInt(b.dataset.wtab, 10); U.render(); });
    c.querySelectorAll("[data-seg]").forEach((b) => b.onclick = () => { const [i, k] = b.dataset.seg.split(":"); U.planSel[parseInt(i, 10)].choice = k; U.render(); });
    c.querySelectorAll("[data-pick]").forEach((el) => el.onclick = (e) => { if (el.dataset.disabled || e.target.closest("[data-dbl]")) return; const idx = el.dataset.pick.indexOf(":"); const i = parseInt(el.dataset.pick.slice(0, idx), 10), tid = el.dataset.pick.slice(idx + 1); U.planSel[i].choice = U.planSel[i].choice === tid ? "auto" : tid; U.render(); });
    c.querySelectorAll("[data-dbl]").forEach((cb) => cb.onchange = () => { U.planSel[parseInt(cb.dataset.dbl, 10)].doubles = cb.checked; });
    c.querySelectorAll("[data-set]").forEach((cb) => cb.onchange = () => { settings[cb.dataset.set] = cb.checked; U.saveSettings(); });
    c.querySelectorAll("[data-wdepth]").forEach((sel) => sel.onchange = () => { U.watchDepth()[sel.dataset.wdepth] = sel.value; U.saveSettings(); });
    c.querySelectorAll("[data-run]").forEach((b) => b.onclick = () => U.runWeeks(U.planSel.slice(0, parseInt(b.dataset.run, 10)).map(toAction)));
    c.querySelector("[data-auto]").onclick = () => U.autoRun(60);
    const sa = c.querySelector("[data-showall]"); if (sa) sa.onclick = () => { window._showAllTours = !showAll; U.render(); };
  };

  // ---------- ドロー表（UI-5） ----------
  U.bracketHtml = function (entry, onlyMine) {
    const S = U.S;
    const b = entry.bracket;
    const byId = new Map(b.slots.filter(Boolean).map((p) => [p.id, p]));
    const humanSlot = b.slots.findIndex((p) => p && p.human);
    // "my section": the 16-player section (first 4 rounds) that contains the human
    const secSize = Math.min(16, b.N);
    const secStart = humanSlot >= 0 ? Math.floor(humanSlot / secSize) * secSize : 0;
    const T = D.CATS[entry.cat];
    const winners = (S.history.tournaments || []).filter((t) => t.name === entry.name && t.year < entry.year).slice(-5).reverse();
    const cols = b.rounds.map((rd, r) => {
      const perRound = b.N / Math.pow(2, r + 1);
      let ms = rd.matches.map((mm, i) => ({ mm, i }));
      if (onlyMine && r < Math.log2(secSize)) { const from = secStart / Math.pow(2, r + 1), cnt = secSize / Math.pow(2, r + 1); ms = ms.slice(from, from + cnt); }
      const cells = ms.map(({ mm }) => {
        if (!mm) return `<div class="bm bye"><div class="bp muted">—</div></div>`;
        const pa = byId.get(mm.a), pb = byId.get(mm.b);
        const side = (p, isW) => p ? `<div class="bp ${isW ? "w" : "l"} ${p.human ? "hum" : ""} ${p.rival ? "riv" : ""}"><span class="sd">${p.seed || ""}</span><span class="nm" data-player="${p.id}">${flag(p.country)} ${esc(p.name)}</span><span class="sc">${isW ? esc(mm.score === "bye" ? "bye" : mm.score) : ""}</span></div>` : `<div class="bp l"><span class="sd"></span><span class="nm muted">bye</span></div>`;
        const mine = (pa && pa.human) || (pb && pb.human);
        return `<div class="bm ${mine ? "mine" : ""} ${mm.score === "bye" ? "bye" : ""}">${side(pa, mm.w === mm.a)}${side(pb, mm.w === mm.b)}</div>`;
      }).join("");
      return `<div class="bround"><h4>${esc(rd.label)}</h4>${cells}</div>`;
    }).join("");
    return `<div class="row between"><div><div class="small muted" style="text-transform:uppercase;letter-spacing:.08em">Draw ・ ${cal(entry.year)}年 第${entry.week}週</div><div style="font-size:18px;font-weight:800">${flag(entry.country)} ${esc(entry.name)} <span class="pill tier${T.tier}">${T.short}</span> <span class="pill ${entry.surface}">${D.SURFACES[entry.surface]}</span></div><div class="small muted">${b.N}ドロー ・ ${b.seeds}シード ・ 優勝 ${T.points[0]}pt / ${money(T.prize[0])}${winners.length ? ` ・ 過去の優勝: ${winners.map((w) => `${cal(w.year)} ${esc(w.winner)}`).join("、")}` : ""}</div></div>
      <div class="row"><button class="small ${onlyMine ? "primary" : ""}" data-bmine="${onlyMine ? 0 : 1}">${onlyMine ? "全体を表示" : "自分の山だけ"}</button><button class="small" data-close>閉じる</button></div></div>
      <div class="bracket" style="margin-top:10px">${cols}</div>`;
  };
  U.openBracket = function (entry, onlyMine) {
    U.openModal(U.bracketHtml(entry, onlyMine), true);
    const btn = document.querySelector("[data-bmine]");
    if (btn) btn.onclick = () => U.openBracket(entry, btn.dataset.bmine === "1");
  };

  // ---------- 結果 ----------
  function matchHtml(m) {
    const S = U.S;
    const sets = m.log.filter((l) => l.t === "set"), breaks = m.log.filter((l) => l.t === "break"), plans = m.log.filter((l) => l.t === "plan");
    const hi = m.humanIdx;
    const lines = sets.map((s) => {
      const mine = s.games[hi], theirs = s.games[1 - hi];
      const bk = breaks.filter((b) => b.set === s.set).map((b) => `${b.who === hi ? "自分" : "相手"}がブレーク(${b.score})`).join("、");
      const pl = plans.filter((p) => p.set === s.set + 1 && p.who === hi).map(() => ` <span class="accent">→ 次セットから攻撃的に切替</span>`).join("");
      return `第${s.set}セット <b class="score">${mine}-${theirs}${s.tb ? (s.tb10 ? `(${Math.max(s.tb[0], s.tb[1])}-${Math.min(s.tb[0], s.tb[1])})` : `(${Math.min(s.tb[0], s.tb[1])})`) : ""}</b> ${s.who === hi ? '<span class="green">取る</span>' : '<span class="red">落とす</span>'}${bk ? ` <span class="muted">— ${bk}</span>` : ""}${pl}`;
    }).join("<br>");
    const st = m.stats;
    const table = st ? `<table class="small statsbox" style="margin-top:6px"><tr><th></th><th class="num">自分</th><th class="num">${esc(m.opp)}</th></tr>${U.matchStatsRows(st, hi)}</table>` : "";
    return `<div class="match ${m.won ? "win" : "loss"}"><div class="row between"><span><b>${esc(m.round)}</b> vs <span data-player="${m.oppId}" class="accent">${esc(m.opp)}</span> <span class="muted">(${m.oppRank || "ランク外"})</span>${m.oppId === S.rivalId ? ' <span class="pill rival">宿敵</span>' : ""}</span><span class="score ${m.won ? "green" : "red"}">${m.won ? "WIN" : "LOSS"} ${esc(m.score)}${m.minutes ? ` <span class="muted small">${U.minutesText(m.minutes)}</span>` : ""}</span></div>
      ${m.wo ? "" : `<details><summary class="small">詳細・スタッツ</summary><div class="log">${lines}</div>${table}</details>`}</div>`;
  }
  function deltaHtml(delta, limit) {
    const e = Object.entries(delta || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!e.length) return '<span class="muted">—</span>';
    return e.slice(0, limit || 99).map(([k, v]) => `<span class="${v > 0 ? "green" : "red"}">${ATTRL[k] || D.SURFACES[k] || k} ${signed(v, 2)}</span>`).join(" ・ ");
  }
  function weekCard(rep, open) {
    const r = rep.human;
    let body = "";
    if (r) body += `<div class="row between"><b>${flag(r.T.country)} ${esc(r.T.name)}</b> ${catPill(r.T)} <span class="${r.humanRound === "優勝" ? "gold" : ""}"><b>${esc(r.humanRound || "")}</b> ${r.humanPts ? `+${r.humanPts}pt` : ""} ${r.humanPrize ? money(r.humanPrize) : ""}</span></div>${r.qualified ? '<p class="small green">予選を突破して本戦へ</p>' : ""}${r.humanMatches.map(matchHtml).join("")}${r.isFinals ? `<p class="small">グループA: ${r.groups[0].join(" / ")}<br>グループB: ${r.groups[1].join(" / ")}</p>` : ""}<p class="small muted">優勝: <span data-player="${r.winner.id}">${esc(r.winner.name)}</span>${r.finalist ? ` d. <span data-player="${r.finalist.id}">${esc(r.finalist.name)}</span> ${esc(r.finalScore)}` : ""}${r.bracket ? ` <button class="small" data-bracket="${rep.year}:${rep.week}:${esc(r.T.name)}">ドロー表</button>` : ""}</p>`;
    if (r && r.davis) body += `<div class="small" style="margin:6px 0">${r.davis.ties.map((t) => `<div class="${t.mine ? "" : "muted"}"><b>${esc(t.label)}</b> ${esc(t.a)} ${t.score} ${esc(t.b)}${t.mine ? `<div class="tiny muted">${t.rubbers.map(esc).join(" ・ ")}</div>` : ""}</div>`).join("")}</div>`;
    for (const it of rep.items) body += `<p class="small ${it.type === "milestone" ? "gold" : it.type === "rejected" ? "red" : ""}">${esc(it.text)}</p>`;
    body += `<p class="small"><b>成長:</b> ${deltaHtml(rep.attrDelta, 6)}${Object.keys(rep.surfDelta || {}).length ? ` ・ ${deltaHtml(rep.surfDelta, 2)}` : ""}</p>`;
    const others = rep.tournaments.filter((t) => !t.humanPlayed && t.T.def.tier >= 7);
    if (others.length) body += `<p class="small muted">${others.map((t) => `${esc(t.T.name)}: <span data-player="${t.winner.id}">${esc(t.winner.name)}</span>`).join(" ・ ")}</p>`;
    if (rep.news && rep.news.length) body += `<ul class="news small muted">${rep.news.slice(0, 4).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
    const title = `${cal(rep.year)}年 第${rep.week}週 — ${r ? esc(r.T.name) + " " + esc(r.humanRound) : rep.items[0] ? esc(rep.items[0].text.split("（")[0].split(":")[0]) : "—"} <span class="muted small">→ ${rep.rankAfter ? rep.rankAfter + "位" : "ランク外"}</span>`;
    return `<details class="card" ${open ? "open" : ""}><summary>${title}</summary>${body}</details>`;
  }
  U.screens.report = function (c) {
    const S = U.S;
    const log = U.runLog || (S.lastReport ? [S.lastReport] : null);
    if (!log) { c.innerHTML = `<div class="panel"><div class="empty">まだ結果はない。「プラン」から進めてください。</div></div>`; return; }
    const first = log[0], last = log[log.length - 1];
    const sumDelta = {};
    let w = 0, l = 0, prize = 0;
    for (const r of log) {
      for (const [k, v] of Object.entries(r.attrDelta || {})) sumDelta[k] = Math.round(((sumDelta[k] || 0) + v) * 100) / 100;
      if (r.human) { w += r.human.humanMatches.filter((m) => m.won).length; l += r.human.humanMatches.filter((m) => !m.won).length; prize += r.human.humanPrize || 0; }
    }
    let html = `<div class="panel"><h2>${cal(first.year)}年 第${first.week}週 〜 第${last.week}週（${log.length}週）</h2>
      <div class="kpi"><div class="card"><div class="v">${first.rankBefore ? first.rankBefore + "位" : "-"} → ${last.rankAfter ? last.rankAfter + "位" : "-"}</div><div class="l">ランキング</div></div><div class="card"><div class="v">${w}-${l}</div><div class="l">試合</div></div><div class="card"><div class="v">${money(prize)}</div><div class="l">賞金</div></div><div class="card"><div class="v">${money(S.human.money)}</div><div class="l">資金</div></div></div>
      <p><b>期間の成長:</b> ${deltaHtml(sumDelta)}</p>
      ${last.event ? `<div class="card" style="border-color:var(--gold)"><b class="gold">イベント: ${esc(last.event.title)}</b><p class="small">${esc(last.event.text)}</p><button class="primary" data-ev>選択する</button></div>` : ""}</div>`;
    html += `<div class="panel"><h2>週ごとの詳細</h2>${log.map((r, i) => weekCard(r, i === log.length - 1 || !!r.human)).join("")}</div>`;
    html += `<div class="row"><button class="primary" data-go="plan">プランへ</button>${last.season ? `<button data-season>シーズン総括を見る</button>` : ""}</div>`;
    c.innerHTML = html;
    c.querySelector("[data-go]").onclick = () => { U.tab = "plan"; U.render(); };
    U.bindPlayerLinks(c);
    c.querySelectorAll("[data-bracket]").forEach((b) => b.onclick = () => { const [y, w, name] = b.dataset.bracket.split(":"); const e = (S.history.brackets || []).find((x) => x.year === parseInt(y, 10) && x.week === parseInt(w, 10)) || (S.history.brackets || []).find((x) => x.name === name); if (e) U.openBracket(e, e.bracket.N > 32); });
    const sb = c.querySelector("[data-season]"); if (sb) sb.onclick = () => U.openModal(U.seasonHtml(last.season));
    const eb = c.querySelector("[data-ev]"); if (eb) eb.onclick = () => { if (S.human.event) U.openModal(U.eventHtml(S.human.event)); };
  };

  // ---------- ランキング ----------
  U.screens.ranking = function (c) {
    const S = U.S, me = human();
    const list = S.players.filter((p) => p.rank).sort((a, b) => a.rank - b.rank);
    const showAll = window._rankAll;
    const rows = (showAll ? list : list.slice(0, 100).concat(me.rank && me.rank > 100 ? [me] : [])).map((p) => {
      const d = p.prevRank && p.rank ? p.prevRank - p.rank : 0;
      return `<tr class="${p.isHuman ? "me" : p.isRival ? "rival" : ""}"><td class="num">${p.rank}</td><td><span data-player="${p.id}" class="accent">${U.avatar(p, "sm")} <span style="margin-left:6px">${esc(p.name)}</span></span>${p.isRival ? ' <span class="pill rival">宿敵</span>' : ""}</td><td class="num">${W.age(S, p)}</td><td class="num small">${(p.isHuman ? W.strengthOf(S, p) : W.playerInfo(S, p.id).strength).toFixed(1)}</td><td class="num">${p.points}</td><td class="num small ${d > 0 ? "green" : d < 0 ? "red" : "muted"}">${d > 0 ? "▲" + d : d < 0 ? "▼" + -d : "-"}</td></tr>`;
    }).join("");
    c.innerHTML = `<div class="panel"><div class="row between"><h2>ATPランキング <span class="muted small">${cal()}年 第${S.week}週</span></h2><button data-all>${showAll ? "Top100のみ" : "全選手"}</button></div><table><tr><th class="num">#</th><th>選手</th><th class="num">年齢</th><th class="num" title="試合での強さ（総合＋サーフェス適性・試合勘・特性など）。他選手はスカウティングの推定">実力</th><th class="num">ポイント</th><th class="num">変動</th></tr>${rows}</table><p class="small muted" style="margin-top:8px">実力＝総合（試合エンジンと同じ重み）にサーフェス適性・試合勘・特性などを足した試合での強さ。ランキングは過去52週の成績なので、伸び盛りの若手や怪我明けの選手は実力より下に、衰え始めたベテランは上にいることが多い。</p></div>`;
    c.querySelector("[data-all]").onclick = () => { window._rankAll = !showAll; U.render(); };
    U.bindPlayerLinks(c);
  };

  // ---------- カレンダー ----------
  U.screens.calendar = function (c) {
    const S = U.S, me = human();
    const rows = [];
    for (let w = 1; w <= 52; w++) {
      const atp = D.ATP_CALENDAR.filter((x) => x.week === w);
      const lower = D.LOWER_CALENDAR[w] || [];
      const mine = me.results.filter((r) => r.week === w && r.cat !== "PREV");
      const defend = mine.reduce((s, r) => s + r.pts, 0);
      rows.push(`<tr class="${w === S.week ? "me" : ""}"><td class="num">${w}</td><td>${atp.map((x) => `<span class="pill tier${D.CATS[x.cat].tier}">${D.CATS[x.cat].short}</span> <span class="pill ${x.surface}">${D.SURFACES[x.surface]}</span> ${flag(x.country)}${esc(x.name)}${S.cutoffs[x.id] ? ` <span class="muted small">当落線${S.cutoffs[x.id]}位</span>` : ""}`).join("<br>") || `<span class="muted small">${lower.length ? lower.map((l) => l[0]).join(" / ") : "オフ"}</span>`}</td><td class="small">${mine.map((r) => `${esc(r.name)} ${esc(r.round)} ${r.pts}pt`).join("<br>")}</td><td class="num">${defend || ""}</td></tr>`);
    }
    c.innerHTML = `<div class="panel"><h2>年間カレンダー</h2><p class="small muted">「保持」は52週ローリングで今その週に持っているポイント。来年同じ週に落ちる。「当落線」は昨年の本戦最後の直接入り順位。</p><table><tr><th class="num">週</th><th>ATP大会 / 下部</th><th>自分の結果（保持中）</th><th class="num">保持pt</th></tr>${rows.join("")}</table></div>`;
  };

  // ---------- 選手 ----------
  // Career / season statistics panel (ATP-style: serve, return, pressure points, records)
  U.careerStatsHtml = function (me) {
    const S = U.S;
    const season = window._statsSeason;
    const v = W.csView(season ? W.statsFromHistory(S, S.year) : me.cs || W.initCs());
    const P = (x) => (x === null || x === undefined ? "-" : x + "%");
    const wl = (a) => `${a[0]}-${a[1]}`;
    const rec = (a) => (a[0] + a[1] ? `${wl(a)} <span class="muted">(${Math.round((100 * a[0]) / (a[0] + a[1]))}%)</span>` : "-");
    const r = (l, x) => `<div class="srow"><span class="muted">${l}</span><b>${x}</b></div>`;
    const matches = season ? S.history.matches.filter((m) => m.year === S.year && !m.wo) : S.history.matches.filter((m) => !m.wo);
    const bySurf = {}; const byCat = {};
    for (const m of matches) { bySurf[m.surface] = bySurf[m.surface] || [0, 0]; bySurf[m.surface][m.won ? 0 : 1]++; const c = /^(GS|1000|500|250|Finals)/.test(m.cat) ? m.cat : "下部"; byCat[c] = byCat[c] || [0, 0]; byCat[c][m.won ? 0 : 1]++; }
    return `<div class="row between" style="margin-top:12px"><h3 style="margin:0">スタッツ <span class="muted small">${v.m}試合</span></h3><div class="seg small"><button class="${season ? "" : "on"}" data-stats-season="0">通算</button><button class="${season ? "on" : ""}" data-stats-season="1">今季</button></div></div>
      <div class="statgrid">
        <div><h4>サーブ</h4>${r("最速サーブ", v.svMax ? v.svMax + " km/h" : "-")}${r("1stサーブ平均速度", v.svAvg1 ? v.svAvg1 + " km/h" : "-")}${r("エース / 試合", v.acesPm === null ? "-" : v.acesPm)}${r("ダブルフォルト / 試合", v.dfsPm === null ? "-" : v.dfsPm)}${r("1stサーブ率", P(v.firstIn))}${r("1stサーブ得点率", P(v.firstWon))}${r("2ndサーブ得点率", P(v.secondWon))}${r("サービスゲーム獲得率", P(v.hold))}${r("ブレークポイントセーブ", `${P(v.bpSaved)} <span class="muted">(${v.bpSavedN}/${v.bpFaced})</span>`)}</div>
        <div><h4>リターン</h4>${r("リターンポイント獲得率", P(v.retWon))}${r("ブレークポイント変換率", `${P(v.bpConv)} <span class="muted">(${v.bpConvN}/${v.bpChances})</span>`)}${r("リターンゲーム獲得率", P(v.retGamesWon))}${r("総ポイント獲得率", P(v.totalPts))}${r("ネットポイント", `${P(v.net)} <span class="muted">(${v.netPts})</span>`)}${r("ウィナー / UE", `${v.winners} / ${v.ues}`)}</div>
        <div><h4>勝負所</h4>${r("タイブレーク", rec(v.tb))}${r("最終セット", rec(v.dec))}${r("第1セットを落として逆転", v.cb[0])}${r("第1セットを取って逆転負け", v.cb[1])}${r("マッチポイントセーブ", v.mpSaved)}${r("最長連勝", v.bestStreak + (v.streak >= 3 ? ` <span class="green">(現在${v.streak}連勝)</span>` : ""))}</div>
        <div><h4>戦績</h4>${r("対Top10", rec(v.top10))}${r("決勝", rec(v.finals))}${Object.entries(bySurf).map(([k, a]) => r(D.SURFACES[k], rec(a))).join("")}${Object.entries(byCat).map(([k, a]) => r(k, rec(a))).join("")}${r("平均試合時間", U.minutesText(v.avgMin))}${r("最長試合", v.longestVs ? `${U.minutesText(v.longestMin)} <span class="muted">${esc(v.longestVs)}</span>` : "-")}${r("最長ラリー", v.longest ? v.longest + "打" : "-")}</div>
      </div>`;
  };
  // Development plan panel (v1.9): target style, intensity, coach-chosen focus, projected gains
  U.devPanelHtml = function () {
    const S = U.S, me = human(), dev = W.devOf(S);
    const st = dev.style ? W.DEV_STYLES[dev.style] : null;
    const alloc = dev.auto ? W.autoAlloc(S, me) : W.allocOf(S);
    const focus = W.ATTRS.slice().sort((x, y) => W.allocShare(alloc, y) - W.allocShare(alloc, x)).slice(0, 2);
    const log = S.human.actLog || [];
    const trainWks = log.filter((a) => a === "train" || a === "camp").length;
    const share = log.length ? trainWks / log.length : 0.35;
    const others = W.ATTRS.filter((k) => k !== "durability" && !(st && st.keys.includes(k)));
    const oa = others.reduce((a, k) => a + me.attrs[k], 0) / others.length;
    const gap = st ? W.styleGap(me, dev.style) : 0;
    const rows = W.ATTRS.map((k) => {
      const isKey = st && st.keys.includes(k), isFocus = W.allocShare(alloc, k) > 0.04;
      const rate = W.trainRate(S, me, k, focus, 1, { session: true, alloc });
      const capped = me.attrs[k] > W.attrCeil(me, k);
      let eta = "";
      if (isKey && !dev.established) {
        const target = Math.ceil(oa + 5.5);
        const need = target - me.attrs[k];
        if (need <= 0) eta = '<span class="green">到達</span>';
        else { const wk = Math.ceil(need / Math.max(0.01, rate)); eta = `${target}まで 練習${wk}週${share > 0 ? `<span class="muted">（約${Math.round(wk / Math.max(0.15, share))}週）</span>` : ""}`; }
      }
      return `<tr class="${isFocus ? "" : "muted"}"><td>${ATTRL[k]}${isKey ? ' <span class="pill" style="padding:0 5px">キー</span>' : ""}${isFocus ? ' <b class="accent">●</b>' : ""}</td><td class="num">${Math.round(me.attrs[k])}</td><td class="num ${isFocus ? "green" : ""}">+${rate.toFixed(2)}${capped ? ' <span class="gold" title="天井より大きく上: 伸びが鈍る">鈍化</span>' : ""}</td><td class="small">${eta}</td></tr>`;
    }).join("");
    return `<div class="panel"><h2>育成計画 <span class="muted small">どんな選手に育てるか</span></h2>
      <div class="row" style="gap:14px;flex-wrap:wrap">
        <label class="small">目標スタイル <select data-dev-style><option value="">決めない</option>${Object.entries(W.DEV_STYLES).filter(([k]) => W.devStyleOk(S, k) || dev.style === k).map(([k, v]) => `<option value="${k}" ${dev.style === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
        <label class="small">練習強度 <select data-dev-int>${Object.entries(W.INTENSITY).map(([k, v]) => `<option value="${k}" ${dev.intensity === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>
        <label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-dev-auto style="width:auto;margin:0" ${dev.auto ? "checked" : ""}> 練習配分はコーチに任せる</label></div>
      <p class="small muted" style="margin:6px 0">${st ? esc(st.desc) + `。キー能力（${st.keys.map((k) => ATTRL[k]).join("・")}）の練習効果 ×1.15。` : "スタイルを決めると、キー能力の練習効果が上がり、確立すると試合で効果が出る。"} ${esc(W.INTENSITY[dev.intensity].desc)}。</p>
      <h3 style="margin:10px 0 4px">練習配分 <span class="muted small">週${W.TRAIN_SLOTS}コマ${dev.auto ? " ・ コーチが毎週組む" : ` ・ 残り ${W.TRAIN_SLOTS - Object.values(alloc).reduce((a, b) => a + b, 0)}コマ`}</span></h3>
      <div class="alloc">${Object.entries(W.TRAIN_CATS).map(([c, v]) => `<div class="arow"><div><b>${v.label}</b><div class="tiny muted">${esc(v.desc)}</div></div><div class="actl">${dev.auto ? "" : `<button class="small" data-alloc="${c}:-1" ${alloc[c] ? "" : "disabled"}>−</button>`}<span class="num">${alloc[c] || 0}</span>${dev.auto ? "" : `<button class="small" data-alloc="${c}:1" ${Object.values(alloc).reduce((a, b) => a + b, 0) < W.TRAIN_SLOTS ? "" : "disabled"}>＋</button>`}</div><div class="abar"><div style="width:${(alloc[c] || 0) * 10}%"></div></div></div>`).join("")}</div>
      ${st ? `<div class="attr" style="grid-template-columns:110px 1fr 70px"><span class="small">スタイル確立度</span><div class="bar"><div style="width:${Math.max(0, Math.min(100, (gap / 5) * 100))}%;background:${dev.established ? "var(--gold)" : "var(--accent)"}"></div></div><span class="num small">${dev.established ? '<b class="gold">確立</b>' : `${gap.toFixed(1)}/5`}</span></div><p class="small muted" style="margin:2px 0 8px">キー能力の平均が他の能力の平均より 5 以上高くなると確立（3 を割ると解除）。</p>` : ""}
      <div class="tscroll"><table class="small"><tr><th>能力</th><th class="num">現在</th><th class="num">練習1週</th><th>${st && !dev.established ? "確立の目安" : ""}</th></tr>${rows}</table></div>
      <p class="small muted" style="margin-top:6px">練習1週あたりの期待値（年齢・伸びしろ・コーチ・スタッフ・強度・方針込み）。直近12週の練習は ${trainWks}週${S.human.strategy === "develop" ? "（育成重視: 練習効果 ×1.2）" : ""}。試合でも少しずつ伸びる。天井より 6 以上高い能力は伸びが鈍る。</p>${declineBlock(me)}</div>`;
  };
  U.traitsPanelHtml = function () {
    const S = U.S, H = S.human;
    const lv = W.traitLevels(S), held = W.traitList(S), slots = W.traitSlots(S);
    const pips = (l) => `<span class="pips">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= l ? "on" : ""}"></i>`).join("")}</span>`;
    const card = (id) => {
      const T = W.TRAITS[id], l = lv[id] || 0, next = l + 1;
      const cost = l < 5 ? W.TRAIT_COST[l] : null;
      const req = l < 5 ? W.traitReq(S, id, next) : [];
      const reqOk = req.every((r) => r.ok), afford = cost !== null && (H.gp || 0) >= cost, slotOk = l > 0 || held.length < slots;
      const can = l < 5 && reqOk && afford && slotOk;
      const why = l >= 5 ? "" : !slotOk ? "スロットが空いていない" : !reqOk ? "" : !afford ? `あと ${cost - (H.gp || 0)}pt` : "";
      return `<div class="card trait ${l ? "on" : ""}" style="${l || (reqOk && slotOk) ? "" : "opacity:.6"}">
        <div class="row between"><div><b>${esc(T.label)}</b> ${l ? `<span class="pill gold">Lv${l}</span>` : ""} ${pips(l)}</div>
          <div class="row" style="gap:6px">${l ? `<button class="small" data-trait-drop="${id}">外す</button>` : ""}${l < 5 ? `<button class="small ${can ? "primary" : ""}" data-trait="${id}" ${can ? "" : "disabled"}>${l ? "強化" : "習得"} ${cost}pt</button>` : '<span class="pill gold">最大</span>'}</div></div>
        ${l ? `<div class="small">${esc(W.traitEffectText(id, l))}</div>` : ""}
        ${l < 5 ? `<div class="small muted">${l ? "次" : "Lv1"}: ${esc(W.traitEffectText(id, next))}</div>` : ""}
        ${req.length ? `<div class="tiny">${req.map((r) => `<span class="${r.ok ? "green" : "gold"}">${esc(r.text)}</span>`).join("・")}</div>` : ""}
        ${why ? `<div class="tiny gold">${esc(why)}</div>` : ""}</div>`;
    };
    const ids = Object.keys(W.TRAITS).sort((a, b) => (lv[b] || 0) - (lv[a] || 0));
    return `<div class="panel"><h2>特性 <span class="muted small">成長ポイント <b class="accent">${H.gp || 0}</b> ・ スロット <b>${held.length}/${slots}</b></span></h2>
      <p class="small muted">各特性は Lv1〜5。強化コスト ${W.TRAIT_COST.join("→")}pt、効果は Lv1 の ${W.TRAIT_LV.slice(2).map((x) => "×" + x).join("・")}。持てるのは${slots}つまで（最高20位で+1、最高3位で+1）。外すと使ったポイントの半分が戻る。ポイントはタイトル（下部 1／250・500 2〜3／1000 4／GS・ファイナルズ 6）、トップ200以上の節目（2）、シーズン終了（1）で貯まる。</p>
      ${(H.gpLog || []).length ? `<p class="tiny muted">最近の獲得: ${(H.gpLog || []).slice(-4).reverse().map((g) => `${esc(g.why)} +${g.n}`).join("、")}</p>` : ""}
      ${gpSinksHtml()}
      <div class="tgrid2">${ids.map(card).join("")}</div></div>`;
  };
  // v2.15: other things growth points can buy
  function gpSinksHtml() {
    const S = U.S, H = S.human, me = human(), gp = H.gp || 0, K = W.GP_SINK;
    const cd = Math.max(0, (H.drillUntil || 0) - S.t);
    const opts = W.ATTRS.map((k) => `<option value="${k}">${ATTRL[k]} ${Math.round(me.attrs[k])}${me.attrs[k] > W.attrCeil(me, k) ? "（鈍化）" : ""}</option>`).join("");
    return `<div class="card" style="margin:8px 0"><h3>ポイントの使い道 <span class="muted small">特性のほかに</span></h3>
      <div class="gpsinks">
        <div class="row between"><div><b>集中特訓</b> <span class="muted small">${K.drill}pt</span><div class="tiny muted">選んだ能力 +1.0（天井を超えている能力は +0.4）。${W.DRILL_COOLDOWN}週に1回</div></div>
          <div class="row" style="gap:6px"><select data-drill-attr>${opts}</select><button class="small ${gp >= K.drill && !cd ? "primary" : ""}" data-drill ${gp >= K.drill && !cd ? "" : "disabled"}>${cd ? `あと${cd}週` : "特訓"}</button></div></div>
        <div class="row between"><div><b>調整合宿</b> <span class="muted small">${K.prep}pt</span><div class="tiny muted">次に出る大会で勝負所 +2、入りの疲労 −8${H.prep ? '<span class="green"> ・ 準備済み（次の大会で効く）</span>' : ""}</div></div>
          <button class="small ${gp >= K.prep && !H.prep ? "primary" : ""}" data-prep ${gp >= K.prep && !H.prep ? "" : "disabled"}>${H.prep ? "準備済み" : "組む"}</button></div>
        <div class="row between"><div><b>特性スロット +1</b> <span class="muted small">${K.slot}pt</span><div class="tiny muted">一度だけ。${H.extraSlot ? '<span class="green">購入済み</span>' : "持てる特性が1つ増える"}</div></div>
          <button class="small ${gp >= K.slot && !H.extraSlot ? "primary" : ""}" data-slot ${gp >= K.slot && !H.extraSlot ? "" : "disabled"}>${H.extraSlot ? "購入済み" : "増やす"}</button></div>
      </div></div>`;
  }
  U.bindDevPanel = function (c) {
    const S = U.S, dev = W.devOf(S);
    const ss = c.querySelector("[data-dev-style]"); if (ss) ss.onchange = () => { dev.style = ss.value || null; dev.established = false; U.save(); U.render(); };
    const si = c.querySelector("[data-dev-int]"); if (si) si.onchange = () => { dev.intensity = si.value; U.save(); U.render(); };
    const sa = c.querySelector("[data-dev-auto]"); if (sa) sa.onchange = () => { dev.auto = sa.checked; if (!dev.auto) S.human.alloc = W.autoAlloc(S, human()); U.save(); U.render(); };
    c.querySelectorAll("[data-alloc]").forEach((b) => b.onclick = () => { const [cat, d] = b.dataset.alloc.split(":"); const a = W.allocOf(S); const tot = Object.values(a).reduce((x, y) => x + y, 0); const n = parseInt(d, 10); if (n > 0 && tot >= W.TRAIN_SLOTS) return; a[cat] = Math.max(0, (a[cat] || 0) + n); U.save(); U.render(); });
    c.querySelectorAll("[data-trait]").forEach((b) => b.onclick = () => { const id = b.dataset.trait; const T = W.TRAITS[id]; const l = W.traitLevel(S, id); U.openModal(`<h2>${esc(T.label)} ${l ? `Lv${l} → Lv${l + 1}` : "を習得"}</h2><p>${esc(W.traitEffectText(id, l + 1))}</p>${l ? `<p class="small muted">現在: ${esc(W.traitEffectText(id, l))}</p>` : ""}<p>成長ポイント ${W.TRAIT_COST[l]} を使いますか？（残り ${S.human.gp}）</p><div class="row"><button class="primary" data-trait-confirm="${id}">${l ? "強化する" : "習得する"}</button><button data-close>やめる</button></div>`); });
    const dr = c.querySelector("[data-drill]"); if (dr) dr.onclick = () => { const k = c.querySelector("[data-drill-attr]").value; const g = W.gpDrill(S, k); if (g) { U.save(); U.toast(`集中特訓: ${ATTRL[k]} +${g.toFixed(1)}`, "gold"); U.render(); } };
    const pr = c.querySelector("[data-prep]"); if (pr) pr.onclick = () => { if (W.gpPrep(S)) { U.save(); U.render(); } };
    const sl = c.querySelector("[data-slot]"); if (sl) sl.onclick = () => { if (W.gpSlot(S)) { U.save(); U.render(); } };
    c.querySelectorAll("[data-trait-drop]").forEach((b) => b.onclick = () => { const id = b.dataset.traitDrop; const T = W.TRAITS[id]; const l = W.traitLevel(S, id); const back = Math.floor(W.TRAIT_COST.slice(0, l).reduce((a, x) => a + x, 0) / 2); U.openModal(`<h2>${esc(T.label)} を外す</h2><p>Lv${l} の特性を外してスロットを空けます。${back}pt が戻ります（使った分の半分）。</p><div class="row"><button class="danger" data-trait-drop-confirm="${id}">外す</button><button data-close>やめる</button></div>`); });
  };
  U.screens.player = function (c) {
    const S = U.S, me = human(), rv = rival();
    const ovr = TL.overall(me);
    const hr = me.potential - ovr;
    const hint = hr > 20 ? "コーチ: 伸びしろはまだ大きい" : hr > 10 ? "コーチ: まだ伸びる" : hr > 4 ? "コーチ: 完成が近い" : "コーチ: ほぼ完成形";
    const peers = S.players.filter((p) => !p.retired && !p.isHuman && Math.abs(p.birthYear - me.birthYear) <= 1 && p.rank).sort((a, b) => a.rank - b.rank);
    const myPos = peers.filter((p) => me.rank && p.rank < me.rank).length + 1;
    const sa = S.human.seasonStartAttrs || me.attrs;
    const hist = S.human.attrHist;
    const h4 = hist.length > 4 ? hist[hist.length - 5].attrs : hist[0] ? hist[0].attrs : me.attrs;
    const attrs = W.ATTRS.map((k) => { const ds = me.attrs[k] - sa[k], d4 = me.attrs[k] - h4[k]; return `<div class="attr"><span>${ATTRL[k]}</span><div class="bar"><div style="width:${me.attrs[k]}%;background:${me.attrs[k] >= 80 ? "var(--gold)" : me.attrs[k] >= 65 ? "var(--green)" : "var(--accent)"}"></div></div><span class="num">${Math.round(me.attrs[k])}</span><span class="small ${d4 > 0.05 ? "green" : d4 < -0.05 ? "red" : "muted"}">${signed(d4)}</span><span class="small ${ds > 0.05 ? "green" : ds < -0.05 ? "red" : "muted"}">${signed(ds)}</span></div>`; }).join("");
    const surf = Object.keys(D.SURFACES).map((s) => `<div class="attr"><span>${D.SURFACES[s]}</span><div class="bar"><div style="width:${me.surf[s]}%;background:var(--${s})"></div></div><span class="num">${Math.round(me.surf[s])}</span><span></span><span></span></div>`).join("");
    const h2h = S.history.matches.filter((m) => m.oppId === S.rivalId);
    const top10 = S.history.matches.filter((m) => m.oppRank && m.oppRank <= 10);
    const titles = S.history.tournaments.filter((t) => t.winnerId === me.id);
    const curSeason = { age: W.age(S, me), rank: me.rank, w: S.history.matches.filter((m) => m.year === S.year && m.won).length, l: S.history.matches.filter((m) => m.year === S.year && !m.won).length };
    c.innerHTML = `${U.devPanelHtml()}${U.traitsPanelHtml()}<div class="grid2"><div class="panel"><div class="identity" style="margin-bottom:12px">${U.avatar(me)}<div><div class="name">${esc(me.name)}</div><div class="sub">総合 ${ovr.toFixed(1)} ・ 実力 ${W.strengthOf(S, me).toFixed(1)} ・ ${W.heightOf(S, me)}cm ・ ${me.hand === "L" ? "左利き" : "右利き"} ・ ${W.STYLE_LABEL[me.style] || ""} ・ ${esc(hint)}</div></div></div>
      ${U.radarSvg(me.attrs, rv && !rv.retired ? rv.attrs : null)}<div class="small muted" style="text-align:center;margin:-4px 0 10px"><span class="accent">■</span> 自分${rv && !rv.retired ? ` <span class="red">■</span> 宿敵 ${esc(rv.name)}` : ""}</div>
      <div class="attr" style="color:var(--muted);font-size:11px"><span></span><span></span><span class="num">値</span><span>4週</span><span>今季</span></div>${attrs}
      <h3 style="margin-top:12px">サーフェス適性</h3>${surf}${surfFitHtml(me)}
      <h3 style="margin-top:12px">総合の推移（直近${Math.min(hist.length, 120)}週）</h3>${sparkline(hist.map((x) => x.ovr))}
      <p class="small muted">同年代（±1歳）${peers.length + 1}人中 ${me.rank ? myPos + "番目" : "ランク外"}。成長は年齢・隠れた天井・練習の重点・コーチで決まる。</p></div>
      <div><div class="panel"><div class="row between"><h2 style="margin:0;border:0;padding:0">キャリア</h2><button class="small" data-share>キャリアカードを保存</button></div><div class="kpi" style="margin-top:10px"><div class="card"><div class="v">${me.stats.bestRank || "-"}</div><div class="l">最高ランク</div></div><div class="card"><div class="v">${me.stats.titles}</div><div class="l">タイトル</div></div><div class="card"><div class="v">${me.stats.gs}</div><div class="l">GS</div></div><div class="card"><div class="v">${me.stats.m1000}</div><div class="l">1000</div></div><div class="card"><div class="v">${me.stats.weeksNo1}</div><div class="l">No.1週</div></div><div class="card"><div class="v">${money(me.stats.prize)}</div><div class="l">生涯賞金</div></div></div>
        <p class="small">試合勘 <b>${Math.round(me.sharp || 0)}</b>（${W.sharpLabel(me.sharp || 0)}） ・ 自信 <b>${(me.conf || 0) >= 0 ? "+" : ""}${Math.round(me.conf || 0)}</b>（${W.confLabel(me.conf || 0)}）</p>
        <p class="small">対Top10: ${top10.filter((m) => m.won).length}勝${top10.filter((m) => !m.won).length}敗 ・ 通算 ${me.stats.w}勝${me.stats.l}敗 ・ 怪我 ${(S.human.injuryLog || []).length}回${me.stats.oly ? ` ・ 五輪 🥇${me.stats.oly.g} 🥈${me.stats.oly.s} 🥉${me.stats.oly.b}` : ""}${me.stats.davis && (me.stats.davis.w || me.stats.davis.f) ? ` ・ デビスカップ 優勝${me.stats.davis.w}・準優勝${me.stats.davis.f}` : ""}</p>
        ${U.careerStatsHtml(me)}
        <h3 style="margin-top:10px">年表</h3>${U.timelineHtml(S.history.seasons, curSeason)}
        <h3 style="margin-top:10px">トロフィーケース</h3>${U.trophyCase(titles)}</div>
        <div class="panel"><h2>グランドスラム・マスターズ成績 <span class="muted small">年ごと</span></h2>${U.bigTimelineHtml(me)}</div>
      ${rivalCandsHtml()}
      ${rv ? `<div class="panel"><h2>宿敵</h2><div class="identity" data-player="${rv.id}">${U.avatar(rv)}<div><div class="name">${esc(rv.name)}</div><div class="sub">${W.age(S, rv)}歳 ・ ${rv.retired ? "引退" : rv.rank ? rv.rank + "位" : "ランク外"} ・ 最高${rv.stats.bestRank || "-"}位 ・ タイトル${rv.stats.titles}</div></div></div><p style="margin-top:8px">対戦成績 <b>${h2h.filter((m) => m.won).length}勝${h2h.filter((m) => !m.won).length}敗</b></p>${h2h.slice(-5).reverse().map((m) => `<div class="small ${m.won ? "green" : "red"}">${cal(m.year)} ${esc(m.tour)} ${esc(m.round)} ${m.won ? "WIN" : "LOSS"} ${esc(m.score)}</div>`).join("")}</div>` : ""}</div></div>`;
    U.bindPlayerLinks(c);
    U.bindDevPanel(c);
    c.querySelectorAll("[data-stats-season]").forEach((b) => b.onclick = () => { window._statsSeason = b.dataset.statsSeason === "1"; U.render(); });
    const sh = c.querySelector("[data-share]"); if (sh) sh.onclick = () => U.shareCard();
  };

  // ---------- チーム ----------
  U.screens.team = function (c) {
    const S = U.S, H = S.human;
    const coachCard = (o, i) => {
      const current = i === undefined;
      const remain = current ? Math.max(0, (o.until || S.t) - S.t) : 0;
      const compat = current ? (W.compatKnown(S) ? `相性: <b class="${o.compat >= 0.05 ? "green" : o.compat > -0.05 ? "" : "red"}">${W.compatLabel(o)}</b>` : `相性: <span class="muted">8週で分かる（残り${Math.max(0, 8 - (S.t - (o.since || S.t)))}週）</span>`) : "相性: <span class='muted'>雇ってみないと分からない</span>";
      return `<div class="card"><div class="row between"><div class="row" style="align-items:flex-start">${U.avatar(o)}<div><b>${esc(o.name)}</b> <span class="muted small">${o.age || ""}歳</span> <span class="pill">${W.COACH_TYPES[o.type].label}</span> <span class="gold">${"★".repeat(o.quality)}</span><div class="small muted">${W.COACH_TYPES[o.type].desc}${o.type === "tech" ? `（この候補は ＋${25 * o.quality}%）` : ""}</div><div class="small">${compat}${current ? ` ・ 契約 残り${remain}週（${o.years}年契約）` : ` ・ ${o.years}年契約`}</div></div></div><div style="text-align:right"><div><b>${money(o.cost)}</b><span class="muted small">/週</span></div>${current ? `<button class="danger small" data-fire>解雇（違約金 ${money(W.terminationFee(S))}）</button>` : `<button class="primary" data-hire="${i}" ${S.human.money < 0 ? "disabled title=\"残高がマイナスの間は雇えない\"" : ""}>雇う</button>`}</div></div></div>`;
    };
    c.innerHTML = `<div class="grid2"><div><div class="panel"><h2>コーチ</h2>${H.coach ? coachCard(H.coach) : '<p class="muted">コーチなし。契約は1〜3年で、途中解除は残り期間の半額が違約金。相性は雇って8週で分かり、練習効果に ±20% 前後効く。満了時に更新交渉。</p>'}
      <h3 style="margin-top:12px">候補（シーズンごとに入れ替わる）</h3>${H.coachOffers.length ? H.coachOffers.map(coachCard).join("") : '<p class="muted small">候補なし</p>'}</div>
      <div class="panel"><h2>サポートスタッフ <span class="muted small">最高ランキングで枠が増える ・ 週 ${money(W.staffCost(S))}</span></h2>${Object.entries(W.ROLES).map(([k, r]) => { const on = !!W.staffOf(S)[k]; const ok = W.roleUnlocked(S, k); return `<div class="card" style="${ok ? "" : "opacity:.55"}"><div class="row between"><div><b>${r.label}</b> <span class="muted small">${money(r.cost)}/週</span><div class="small muted">${r.desc}</div>${ok ? "" : `<div class="small gold">解放条件: 最高ランキング ${r.unlock}位以内（現在 ${human().stats.bestRank || "-"}位）</div>`}</div><label><input type="checkbox" data-staff="${k}" ${on ? "checked" : ""} ${ok && (on || S.human.money >= 0) ? "" : "disabled"}> 雇う</label></div></div>`; }).join("")}
      <p class="small muted">帯同人数 <b>${W.partySize(S)}人</b>（移動費は人数倍）。エージェントとアナリストは帯同しない。全部雇うと週 ${money(Object.values(W.ROLES).reduce((s, r) => s + r.cost, 0))} ＋コーチ。</p></div></div>
      <div><div class="panel"><h2>試合プラン</h2><p class="small muted">試合前に決める方針。全試合に適用され、セット間の切替ルールで試合中に変わる。</p>
        <table><tr><th>プラン</th><th>効果</th></tr><tr><td>相手に合わせる</td><td class="small">試合ごとに相手のタイプ（サーブ型／ラリー型／カウンター型／オールラウンド型）を読み、コーチが対策プランを選ぶ。対策が噛み合うと全局面 +0.8（勝率 約+1.7%）。手動でも噛み合えば同じ効果。試合前の判断で決まり、セット間の切替では付かない</td></tr><tr><td>バランス</td><td class="small">標準</td></tr><tr><td>攻撃的</td><td class="small">サーブ ＋2.5、ラリー ＋1、リターン −2。タイブレーク勝負になりやすい</td></tr><tr><td>守備的</td><td class="small">リターン ＋2.5、ラリー ＋0.5、サーブ −2。試合が長くなり疲労 ×1.1</td></tr><tr><td>体力温存</td><td class="small">全体 −1.5、疲労 ×0.7。格下相手や連戦向け</td></tr></table>
        <div class="row" style="margin-top:8px"><label class="small">現在: <select data-plan>${Object.entries(TL.PLANS).map(([k, p]) => `<option value="${k}" ${H.plan === k ? "selected" : ""}>${p.label}</option>`).join("")}</select></label>
        <label class="small">セット間: <select data-rule><option value="none" ${H.switchRule === "none" ? "selected" : ""}>切り替えない</option><option value="behind" ${H.switchRule === "behind" ? "selected" : ""}>セットを落としたら攻撃的に</option></select></label></div></div>
      <div class="panel"><h2>チームの効果</h2><ul class="small muted"><li>技術コーチ: 練習週の重点スキル</li><li>フィジカル: 練習週の身体系＋毎週の疲労回復</li><li>メンタル: クラッチ・集中の練習効果＋全試合のブレークポイント</li><li>クレー／芝の専門家: 練習週に適性が上がり、そのサーフェスの試合経験値が増える</li><li>スタッフ: フィジオ（怪我・回復）、トレーナー（身体系・回復・怪我）、ヒッティング（練習・経験値）、エージェント（スポンサー・アピアランスフィー・WC）、アナリスト（格上戦）</li></ul></div></div></div>`;
    c.querySelectorAll("[data-hire]").forEach((b) => b.onclick = () => { W.hireCoach(S, parseInt(b.dataset.hire, 10)); U.save(); U.render(); });
    const f = c.querySelector("[data-fire]"); if (f) f.onclick = () => { const fee = W.terminationFee(S); U.openModal(`<h2>契約解除</h2><p>${esc(H.coach.name)} との契約を解除しますか？残り期間の半額（上限26週）が違約金になります: <b>${money(fee)}</b></p><div class="row"><button class="danger" data-confirm-fire>解除する</button><button data-close>やめる</button></div>`); };
    c.querySelectorAll("[data-staff]").forEach((cb) => cb.onchange = () => { W.setStaff(S, cb.dataset.staff, cb.checked); U.save(); U.render(); });
    c.querySelector("[data-plan]").onchange = (e) => { H.plan = e.target.value; U.save(); };
    c.querySelector("[data-rule]").onchange = (e) => { H.switchRule = e.target.value; U.save(); };
  };

  // ---------- 財務 ----------
  U.screens.finance = function (c) {
    const S = U.S, H = S.human;
    const led = H.ledger || [];
    const season = led.filter((e) => e.year === S.year);
    const sum = (arr, k) => Math.round(arr.reduce((s, e) => s + (e[k] || 0), 0) * 10) / 10;
    const cats = [["prize", "賞金（シングルス＋ダブルス）", 1], ["support", "支援（出自・後援）", 1], ["rankSponsor", "小口スポンサー・出場手当", 1], ["contracts", "スポンサー契約（週給）", 1], ["signing", "契約金・優勝ボーナス", 1], ["extra", "契約スポンサー・手当・アピアランスフィー", 1], ["tax", `税（賞金・スポンサーの${Math.round(W.TAX * 100)}%）`, -1], ["agentFee", `エージェント手数料（スポンサー収入の${Math.round(W.AGENT_CUT * 100)}%）`, -1], ["base", "基本経費（用具・滞在）", -1], ["team", "チーム（コーチ・スタッフ）", -1], ["travel", "移動費", -1], ["rehab", "治療・リハビリ", -1], ["jobIncome", "クラブリーグ・アルバイト", 1], ["funding", "借入・強化費・寄付", 1], ["loanPay", "借入の返済", -1], ["assetsCost", "契約（メディカル等）", -1], ["purchase", "投資・設備（一括）", -1]];
    const last = led[led.length - 1];
    const weekly = last ? last.support + last.rankSponsor + last.extra - last.base - last.team - (last.tax || 0) - (last.agentFee || 0) - (last.rehab || 0) - (last.assetsCost || 0) : 0;
    const as = W.assetsOf(S);
    const assetCard = (k) => { const A = W.ASSETS[k]; const ok = W.assetUnlocked(S, k); const on = !!as[k]; const btn = A.type === "once" ? (on ? '<span class="pill gold">所有</span>' : `<button class="primary small" data-asset="${k}" ${ok && H.money >= A.cost ? "" : "disabled"}>購入 ${money(A.cost)}</button>`) : `<button class="small ${on ? "primary" : ""}" data-asset="${k}" ${ok ? "" : "disabled"}>${on ? "解約" : A.type === "weekly" ? `契約 ${money(A.cost)}/週` : "利用する"}</button>`; return `<div class="card" style="${ok ? "" : "opacity:.55"}"><div class="row between"><div><b>${A.label}</b>${on ? ' <span class="pill">稼働中</span>' : ""}<div class="small muted">${A.desc}</div>${ok ? "" : `<div class="small gold">解放条件: 最高ランキング ${A.unlock}位以内</div>`}</div>${btn}</div></div>`; };
    const C = W.cashOf(S);
    const cashPanel = `<div class="panel" id="cashpanel"><h2>資金繰り ${H.money < 10 ? '<span class="pill" style="border-color:var(--red)">資金難</span>' : ""}</h2>
      <p class="small muted">残高がマイナスになると 2,500km 超の遠征ができない。$50k の赤字で給与を2週払えないとコーチとスタッフが離れる。$150k の赤字で「キャリアの危機」。マイナスの間はコーチ・スタッフを新しく雇えない。</p>
      <div class="card"><div class="row between"><div><b>節約モード</b>${C.budget ? ' <span class="pill gold">オン</span>' : ""}<div class="small muted">単独で遠征し、安い宿と乗り継ぎ便を使う。移動費 ×0.6。大会中はコーチ・帯同スタッフの効果なし（メンタルコーチの勝負所、フィジオ・トレーナーの回復と怪我予防）。大会週の疲労 +3、時差疲労 ×1.5</div></div><button class="small ${C.budget ? "primary" : ""}" data-budget>${C.budget ? "やめる" : "切り替える"}</button></div></div>
      ${C.loan > 0 ? `<p class="small">借入残高 <b class="red">${money(C.loan)}</b>${C.loanRate ? `（週 ${(C.loanRate * 100).toFixed(2)}% の利息）` : "（無利子）"}。賞金とスポンサー収入の25%で自動返済。</p>` : ""}
      ${C.job && C.jobUntil > S.t ? `<p class="small"><b>${W.JOBS[C.job].label}</b> 中（残り ${C.jobUntil - S.t}週）</p>` : ""}
      ${W.fundingOptions(S).map((o) => `<div class="card" style="${o.ok ? "" : "opacity:.55"}"><div class="row between"><div><b>${o.label}</b><div class="small muted">${esc(o.desc)}</div>${o.ok ? "" : `<div class="tiny gold">${esc(o.why)}</div>`}</div><button class="small" data-fund="${o.key}" ${o.ok ? "" : "disabled"}>${o.key === "club" || o.key === "lesson" ? "引き受ける" : "受け取る"}</button></div></div>`).join("")}</div>`;
    const assetsPanel = `<div class="panel"><h2>資産と投資 <span class="muted small">お金の使い道</span></h2>${Object.keys(W.ASSETS).map(assetCard).join("")}${H.investment ? `<p class="small"><b>出資中:</b> ${esc(H.investment.label)} $${H.investment.amount}k（結果まで ${Math.max(0, H.investment.until - S.t)}週）</p>` : '<p class="small muted">投資話はエージェント経由で不定期に届く（トップ100・残高 $800k 以上）。</p>'}</div>`;
    const me = human();
    const rows = (arr) => cats.map(([k, l, sgn]) => { const v = sum(arr, k); return `<tr><td>${l}</td><td class="num ${sgn > 0 ? "green" : "red"}">${sgn > 0 ? "+" : "−"}${money(v)}</td></tr>`; }).join("") + `<tr><td><b>純増減</b></td><td class="num"><b>${money(sum(arr, "net"))}</b></td></tr>`;
    const seasonsHist = S.history.seasons.filter((z) => z.finance);
    c.innerHTML = `<div class="kpi"><div class="card"><div class="v ${H.money < 0 ? "red" : ""}">${money(H.money)}</div><div class="l">残高</div></div><div class="card"><div class="v">${money(sum(season, "net"))}</div><div class="l">今季の純増減</div></div><div class="card"><div class="v ${weekly < 0 ? "red" : "green"}">${(weekly >= 0 ? "+" : "") + money(weekly)}</div><div class="l">大会に出ない週の収支</div></div><div class="card"><div class="v">${money(me.stats.prize)}</div><div class="l">生涯賞金</div></div></div>
      <div class="grid2"><div class="panel"><h2>今季の内訳 <span class="muted small">${cal()}年 ${season.length}週</span></h2><table>${rows(season)}</table>
        <p class="small muted" style="margin-top:8px">固定収入: ${H.sponsorUntil > S.t ? `支援 ${money(H.sponsorWeekly)}/週（残り${H.sponsorUntil - S.t}週）` : "支援なし"}${H.sponsor2 && H.sponsor2.until > S.t ? ` ・ 契約 ${money(H.sponsor2.weekly)}/週（残り${H.sponsor2.until - S.t}週）` : ""} ・ 小口スポンサー ${last ? money(last.rankSponsor) : "-"}/週 ・ 契約 ${money(W.sponsorWeekly(S))}/週<br>固定支出: 基本 $0.5k/週${H.coach ? ` ・ コーチ ${money(H.coach.cost)}/週` : ""}${W.staffCost(S) ? ` ・ スタッフ ${money(W.staffCost(S))}/週` : ""}<br>移動費: 拠点（${D.COUNTRIES[me.country].name}。連戦中は前の大会地）からの距離で決まり、1人あたり $0.75k ＋ $0.25k/1,000km（2週大会は＋$0.4k）。帯同は現在 <b>${W.partySize(S)}人</b>（本人＋コーチ＋帯同スタッフ）なので人数倍。トップ100で ×1.4、トップ30で ×2、トップ10で ×2.5（移動と宿泊のグレード）。4,000km超の移動は翌週に疲労 ＋3、8,000km超で ＋6。残高が負だと2,500km超の移動ができない${me.injury ? '<br><span class="red">離脱中: ランキング連動スポンサーは半額、治療費が毎週かかる</span>' : ""}</p></div>
      ${cashPanel}${assetsPanel}
      <div class="panel"><h2>残高の推移 <span class="muted small">直近${led.length}週</span></h2>${sparkline(led.map((e) => e.balance), "var(--green)")}<h3 style="margin-top:12px">直近12週</h3><div class="tscroll"><table><tr><th>週</th><th class="num">賞金</th><th class="num">スポンサー</th><th class="num">経費</th><th class="num">移動</th><th class="num">純増減</th><th class="num">残高</th></tr>${led.slice(-12).reverse().map((e) => `<tr><td>${cal(e.year)} W${e.week}</td><td class="num">${e.prize ? money(e.prize) : "-"}</td><td class="num">${money(e.support + e.rankSponsor + e.extra + (e.contracts || 0) + (e.signing || 0))}</td><td class="num">${money(e.base + e.team + (e.tax || 0) + (e.agentFee || 0) + (e.rehab || 0) + (e.assetsCost || 0) + (e.purchase || 0))}</td><td class="num" title="${e.travelInfo ? `${D.COUNTRIES[e.travelInfo.from].name}→${D.COUNTRIES[e.travelInfo.to].name} ${e.travelInfo.dist}km ×${e.travelInfo.party}人` : ""}">${e.travel ? money(e.travel) + (e.travelInfo ? `<span class="tiny muted"> ${e.travelInfo.dist}km×${e.travelInfo.party}</span>` : "") : "-"}</td><td class="num ${e.net < 0 ? "red" : "green"}">${money(e.net)}</td><td class="num">${money(e.balance)}</td></tr>`).join("")}</table></div></div></div>
      ${seasonsHist.length ? `<div class="panel"><h2>シーズン別</h2><table><tr><th>年</th><th class="num">賞金</th><th class="num">支援・スポンサー</th><th class="num">チーム</th><th class="num">移動</th><th class="num">年末残高</th></tr>${seasonsHist.slice().reverse().map((z) => `<tr><td>${z.calendarYear}</td><td class="num">${money(z.finance.prize)}</td><td class="num">${money(z.finance.support + z.finance.rankSponsor + z.finance.extra + (z.finance.contracts || 0) + (z.finance.signing || 0))}</td><td class="num">${money(z.finance.team)}</td><td class="num">${money(z.finance.travel)}</td><td class="num ${z.money < 0 ? "red" : ""}">${money(z.money)}</td></tr>`).join("")}</table></div>` : ""}`;
    c.querySelectorAll("[data-asset]").forEach((b) => b.onclick = () => { const k = b.dataset.asset; const A = W.ASSETS[k]; if (A.type === "once") U.openModal(`<h2>${A.label}</h2><p>${A.desc}</p><p>${money(A.cost)} を支払いますか？（残高 ${money(S.human.money)}）</p><div class="row"><button class="primary" data-asset-confirm="${k}">購入する</button><button data-close>やめる</button></div>`); else { W.buyAsset(S, k); U.save(); U.render(); } });
    const bb = c.querySelector("[data-budget]"); if (bb) bb.onclick = () => { W.setBudget(S, !W.cashOf(S).budget); U.save(); U.render(); };
    c.querySelectorAll("[data-fund]").forEach((b) => b.onclick = () => { const o = W.fundingOptions(S).find((x) => x.key === b.dataset.fund); U.openModal(`<h2>${esc(o.label)}</h2><p>${esc(o.desc)}</p><div class="row"><button class="primary" data-fund-confirm="${o.key}">決める</button><button data-close>やめる</button></div>`); });
  };

  // ---------- スポンサー ----------
  U.screens.sponsor = function (c) {
    const S = U.S, H = S.human, me = human();
    const sp = W.sponsorsOf(S);
    const perks = W.sponsorPerks(S);
    const perkText = (b) => Object.entries(b.perk).map(([k, v]) => ({ serve: `サーブ ＋${v}`, ret: `リターン ＋${v}`, rally: `ラリー ＋${v}`, injury: `怪我 ×${v}`, recovery: `回復 ＋${v}/週`, travel: `移動費 ×${v}`, rehab: `治療費 ×${v}`, focus: `義務（勝負所 −${v}）`, lag: `時差疲労 −${v}` }[k])).join("・");
    const bonusText = (b) => Object.entries(b.bonus).map(([k, v]) => `${{ title: "優勝", m1000: "1000優勝", gs: "GS優勝" }[k]} ${money(v)}`).join("・") || "なし";
    const sel = window._spYears || {};
    const section = (cat) => {
      const brands = D.SPONSORS[cat];
      const current = cat === "other" ? sp.other : sp[cat] ? [sp[cat]] : [];
      const cur = current.map((ct) => { const b = W.brandOf(cat, ct.id); return `<div class="card" style="border-color:var(--accent)"><div class="row between"><div><b>${esc(ct.name)}</b> <span class="pill">契約中</span><div class="small">${money(ct.pay)}/週 ・ 残り ${Math.max(0, ct.until - S.t)}週（${ct.years}年契約）</div><div class="small muted">${b ? perkText(b) || "効果なし" : ""} ・ ボーナス: ${b ? bonusText(b) : ""}</div></div><button class="small danger" data-sp-release="${cat}:${ct.id}">解除 ${money(W.sponsorTerminationFee(S, ct))}</button></div></div>`; }).join("");
      const canSign = cat === "other" ? sp.other.length < D.SPONSOR_MAX_OTHER : !sp[cat];
      const list = brands.filter((b) => !current.some((ct) => ct.id === b.id)).map((b) => {
        const ok = W.sponsorUnlocked(S, b);
        const pay = W.sponsorOffer(S, cat, b);
        const yrs = sel[b.id] || 1;
        return `<div class="card" style="${ok ? "" : "opacity:.55"}"><div class="row between"><div><b>${esc(b.name)}</b>${b.risky ? ' <span class="pill" style="border-color:var(--red)">リスク</span>' : ""}<div class="small muted">${esc(b.desc)}</div><div class="small">${perkText(b) || "効果なし"} ・ ボーナス: ${bonusText(b)}</div>${ok ? `<div class="small"><b class="green">${money(pay)}/週</b> ・ 契約金 ${money(pay * 10)}×年数 <span class="muted">（契約時のランキングで固定）</span></div>` : `<div class="small gold">解放条件: ランキング ${b.unlock}位以内（現在 ${me.rank || "ランク外"}）</div>`}</div>
          ${ok && canSign ? `<div class="row" style="gap:6px;flex-wrap:nowrap"><select data-sp-years="${b.id}">${[1, 2, 3].map((y) => `<option value="${y}" ${yrs === y ? "selected" : ""}>${y}年</option>`).join("")}</select><button class="primary small" data-sp-sign="${cat}:${b.id}">契約</button></div>` : ""}</div></div>`;
      }).join("");
      return `<div class="panel"><h2>${D.SPONSOR_CATS[cat]} <span class="muted small">${cat === "other" ? `${sp.other.length}/${D.SPONSOR_MAX_OTHER}社` : current.length ? "契約中" : "未契約"}</span></h2>${cur}${list}</div>`;
    };
    const weekly = W.sponsorWeekly(S);
    c.innerHTML = `<div class="kpi"><div class="card"><div class="v">${money(weekly)}</div><div class="l">契約収入 / 週</div></div><div class="card"><div class="v">${W.activeContracts(S).length}</div><div class="l">契約社数</div></div><div class="card"><div class="v">${perks.serve || perks.ret || perks.rally ? `+${(perks.serve + perks.ret + perks.rally).toFixed(1)}` : "-"}</div><div class="l">用具効果（合計）</div></div><div class="card"><div class="v">${perks.injury < 1 ? `×${perks.injury.toFixed(2)}` : "-"}</div><div class="l">怪我</div></div></div>
      <p class="small muted">ランキングが上がるほど上位ブランドが解放され、提示額も上がる。週給は契約時に固定されるので、順位が上がったら契約満了を待つか違約金（残り期間の25%）を払って乗り換える。契約金は税とエージェント手数料の対象。${perks.focus ? `<span class="gold">露出義務の合計 ${perks.focus}: 勝負所でわずかに不利。</span>` : ""}</p>
      ${["racket", "apparel", "shoes", "other"].map(section).join("")}`;
    c.querySelectorAll("[data-sp-years]").forEach((el) => el.onchange = () => { window._spYears = Object.assign({}, sel, { [el.dataset.spYears]: parseInt(el.value, 10) }); });
    c.querySelectorAll("[data-sp-sign]").forEach((b) => b.onclick = () => { const [cat, id] = b.dataset.spSign.split(":"); const yrs = (window._spYears || {})[id] || 1; const br = W.brandOf(cat, id); const pay = W.sponsorOffer(S, cat, br); U.openModal(`<h2>${esc(br.name)} と契約</h2><p>${yrs}年契約、${money(pay)}/週（固定）、契約金 ${money(pay * 10 * yrs)}。${br.perk.focus ? "露出義務あり。" : ""}${br.risky ? "<b class=\"red\">破綻リスクあり。</b>" : ""}</p><div class="row"><button class="primary" data-sp-confirm="${cat}:${id}:${yrs}">契約する</button><button data-close>やめる</button></div>`); });
    c.querySelectorAll("[data-sp-release]").forEach((b) => b.onclick = () => { const [cat, id] = b.dataset.spRelease.split(":"); const ct = cat === "other" ? sp.other.find((x) => x.id === id) : sp[cat]; U.openModal(`<h2>契約解除</h2><p>${esc(ct.name)} との契約を解除しますか？違約金 ${money(W.sponsorTerminationFee(S, ct))}</p><div class="row"><button class="danger" data-sp-release-confirm="${cat}:${id}">解除する</button><button data-close>やめる</button></div>`); });
  };

  // ---------- 記録 ----------
  U.screens.records = function (c) {
    const S = U.S;
    const seasons = S.history.seasons.slice().reverse();
    const matches = S.history.matches.slice().reverse().slice(0, 60);
    c.innerHTML = `<div class="panel"><h2>シーズン履歴</h2>${seasons.length ? `<table><tr><th>年</th><th class="num">年齢</th><th class="num">年末</th><th class="num">成績</th><th class="num">勝</th><th class="num">賞金</th><th>優勝</th></tr>${seasons.map((z) => `<tr><td>${z.calendarYear}</td><td class="num">${z.age}</td><td class="num">${z.rank || "-"}</td><td class="num">${z.w}-${z.l}</td><td class="num">${z.titles.length}</td><td class="num">${money(z.prize)}</td><td class="small">${z.titles.map(esc).join("、")}</td></tr>`).join("")}</table>` : '<div class="empty">まだシーズンを終えていない。</div>'}</div>
      <div class="panel"><h2>最近の試合</h2>${matches.map((m) => `<div class="match ${m.won ? "win" : "loss"} small"><span class="muted">${cal(m.year)} W${m.week}</span> ${esc(m.tour)} <span class="pill">${esc(m.cat)}</span> ${esc(m.round)} vs <span data-player="${m.oppId}" class="accent">${esc(m.opp)}</span>(${m.oppRank || "-"}) <span class="score ${m.won ? "green" : "red"}">${m.won ? "W" : "L"} ${esc(m.score)}</span></div>`).join("") || '<div class="empty">まだ試合がない。</div>'}</div>
      ${(S.history.brackets || []).length ? `<div class="panel"><h2>最近のドロー</h2><div class="row">${S.history.brackets.slice().reverse().map((e, i) => `<button class="small" data-br="${S.history.brackets.length - 1 - i}">${flag(e.country)} ${esc(e.name)} ${cal(e.year)}</button>`).join("")}</div></div>` : ""}
      <div class="panel"><h2>ニュース</h2><ul class="news small">${S.history.news.slice().reverse().slice(0, 40).map((n) => `<li><span class="muted">${cal(n.year)} W${n.week}</span> ${esc(n.text)}</li>`).join("")}</ul></div>`;
    U.bindPlayerLinks(c);
    c.querySelectorAll("[data-br]").forEach((b) => b.onclick = () => { const e = S.history.brackets[parseInt(b.dataset.br, 10)]; U.openBracket(e, e.bracket.N > 32); });
  };

  // ---------- 設定 ----------
  U.screens.settings = function (c) {
    const S = U.S;
    c.innerHTML = `<div class="panel"><h2>セーブ</h2><p class="small muted">毎回自動保存（このブラウザのlocalStorage）。乱数はシード固定で、リロードしてやり直しても同じ結果になる。</p>
      <div class="row"><button data-export>エクスポート（JSON）</button><label>インポート <input type="file" id="imp" accept=".json"></label></div>
      <p class="small muted" style="margin-top:8px">シード: ${S.seed} ・ 出自: ${U.ORIGINS[S.config.origin].name} ・ 難易度: ${(W.DIFFICULTY[S.config.difficulty] || W.DIFFICULTY.normal).label} ・ 怪我: ${S.config.injuryRealism === "low" ? "低頻度" : "標準"}</p></div>
      ${S.human.careerOver ? "" : `<div class="panel"><h2>引退</h2><p class="small muted">現役を退く。キャリアの総括と殿堂判定が行われ、殿堂ギャラリーに記録される。年齢だけで引退になることはない。シーズン終了時に「34歳以上で250位の外」または「38歳以上で100位の外」なら引退。32歳以降に順位を大きく落とすと「引退を考える」イベントが届く。${S.human.retireYear ? `<br><b class="gold">${cal(S.human.retireYear)}年がラストシーズン（表明済み）</b>` : ""}</p>
        <div class="row" style="gap:8px;flex-wrap:wrap">${S.human.retireYear ? "" : '<button class="primary" data-announce-open>今季限りで引退を表明…</button>'}<button class="danger" id="retire">今すぐ引退する</button></div>
        <p class="tiny muted" style="margin-top:6px">表明するとラストシーズンに: 全試合で勝負所 +2、各地の大会の引退セレモニー、元トップ50なら本戦ワイルドカード、最後のGSの決意、好成績なら一度だけ撤回できる。</p></div>`}
      <div class="panel"><h2>セーブスロット</h2><p class="small muted">3つのキャリアを並行して持てる。殿堂ギャラリーは共通。</p>${U.slotsHtml(false)}</div>
      <div class="panel"><h2>表示とサウンド</h2>
        <label class="small" style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" style="width:auto;margin:0" data-setting="sound" ${U.settings.sound ? "checked" : ""}> サウンド（観戦モードの効果音・節目のファンファーレ）</label>
        <label class="small" style="display:flex;gap:8px;align-items:center;margin:6px 0">音量 <input type="range" min="0" max="1" step="0.1" value="${U.settings.volume == null ? 0.5 : U.settings.volume}" data-volume style="vertical-align:middle;width:140px"> <button class="small" data-sound-test>テスト</button></label>
        <label class="small" style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" style="width:auto;margin:0" data-setting="reduceMotion" ${U.settings.reduceMotion ? "checked" : ""}> アニメーションを減らす（ボールの動き・画面遷移）</label>
        <label class="small" style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" style="width:auto;margin:0" data-setting="hintsAlways" ${U.settings.hintsAlways ? "checked" : ""}> 2シーズン目以降もヒントを表示</label>
        <div class="row" style="margin-top:8px"><button class="small" data-hints-reset>ヒントをもう一度表示</button><button class="small" data-intro>遊び方を見る</button></div></div>
      <div class="panel"><h2>新しいキャリア</h2><p class="small muted">現在のスロットのセーブは消える。</p><button class="danger" id="newgame">新しいキャリアを始める</button></div>
      <div class="panel"><h2>このゲームについて</h2><p class="small muted">Tour Life ${U.VERSION}。登場選手はすべて架空（2025/26年のツアーをモデルにした近似名）。能力値は推定であり公式データではない。ポイント表は現行ATPルールの近似。</p></div>`;
    c.querySelector("[data-export]").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([W.serialize(S)], { type: "application/json" })); a.download = `tourlife_${cal()}_w${S.week}.json`; a.click(); };
    document.getElementById("imp").onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { U.S = W.deserialize(r.result); U.save(); U.tab = "plan"; U.runLog = null; U.planSel = null; U.render(); } catch (err) { U.openModal(`<h2>読み込めませんでした</h2><p class="small">${esc(err.message)}</p><button data-close>閉じる</button>`); } }; r.readAsText(f); };
    document.getElementById("newgame").onclick = U.newGame;
    U.bindSlots(c);
    c.querySelectorAll("[data-setting]").forEach((cb) => cb.onchange = () => { U.settings[cb.dataset.setting] = cb.checked; U.saveSettings(); if (U.applyMotion) U.applyMotion(); if (cb.dataset.setting === "sound" && cb.checked && U.sfx) U.sfx("click"); });
    c.querySelector("[data-volume]").oninput = (e) => { U.settings.volume = parseFloat(e.target.value); U.saveSettings(); };
    c.querySelector("[data-sound-test]").onclick = () => { if (!U.settings.sound) { U.toast("サウンドがオフです"); return; } U.sfx("win"); };
    c.querySelector("[data-hints-reset]").onclick = () => { U.settings.hints = {}; U.saveSettings(); U.toast("ヒントを再表示します"); };
    c.querySelector("[data-intro]").onclick = () => U.openModal(U.introHtml());
    c.querySelectorAll("[data-announce-open]").forEach((b) => b.onclick = U.announceModal);
    const rb = document.getElementById("retire");
    if (rb) rb.onclick = () => { U.openModal(`<h2>引退する</h2><p>${esc(human().name)}（${W.age(S, human())}歳、${human().rank ? human().rank + "位" : "ランク外"}）は現役を退きますか？この操作は取り消せません。</p><div class="row"><button class="danger" data-confirm-retire>引退する</button><button data-close>やめる</button></div>`); };
  };
})();
