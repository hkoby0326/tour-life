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
    items.push(`<div class="item coach"><span class="when">${S.human.coach ? esc(S.human.coach.name) : "コーチ"}</span><div>${esc(coachLine)}${me.fatigue > 45 ? "。疲労が溜まっている、無理はするな" : ""}</div></div>`);
    for (const n of S.history.news.slice().reverse().slice(0, 12)) items.push(`<div class="item"><span class="when">${cal(n.year)} W${n.week}</span><div>${esc(n.text)}</div></div>`);
    // rival card
    const h2h = S.history.matches.filter((m) => m.oppId === S.rivalId);
    const rivalCard = rv ? `<div class="panel"><h2>宿敵</h2><div class="rivalcard"><div class="identity">${U.avatar(me)}<div><div class="name">${esc(me.name)}</div><div class="sub">${me.rank ? me.rank + "位" : "ランク外"} ・ ${me.stats.titles}勝</div></div></div><div class="vs">VS</div><div class="identity" data-player="${rv.id}" style="cursor:pointer">${U.avatar(rv)}<div><div class="name">${esc(rv.name)}</div><div class="sub">${rv.retired ? "引退" : rv.rank ? rv.rank + "位" : "ランク外"} ・ ${rv.stats.titles}勝</div></div></div></div>
      <p class="small" style="margin-top:8px">対戦成績 <b>${h2h.filter((m) => m.won).length}勝${h2h.filter((m) => !m.won).length}敗</b>${rv.rank && me.rank ? ` ・ 順位差 ${me.rank < rv.rank ? `<span class="green">${rv.rank - me.rank}位リード</span>` : me.rank > rv.rank ? `<span class="red">${me.rank - rv.rank}位ビハインド</span>` : "同順位"}` : ""}${h2h.length ? ` ・ 前回 ${esc(h2h[h2h.length - 1].tour)} ${h2h[h2h.length - 1].won ? '<span class="green">勝ち</span>' : '<span class="red">負け</span>'}` : ""}</p></div>` : "";
    c.innerHTML = `<div class="grid2" style="grid-template-columns:1.25fr .75fr">
      <div>
        <div class="card hero" style="padding:16px 18px"><h3>今週の決断 ・ ${cal()}年 第${S.week}週</h3><div style="font-size:22px;font-weight:800;margin:4px 0 6px">${label}</div><p class="small muted" style="margin:0 0 10px">${esc(auto0.reason || "")}</p>
          <div class="row"><button class="primary bigbtn" data-go-auto>この判断で1週進める</button><button data-go="plan">4週プランを組む</button><button data-auto>自動進行（停止条件まで）</button></div></div>
        ${nextCard}
        <div class="panel"><h2>シーズン ・ ${cal()}年</h2>${seasonStrip(me)}<div class="row between small muted"><span>今季 ${seasonT}大会（目安 ${guide}）</span><span class="loadmeter">直近8週の負荷 <span class="bar"><div style="width:${Math.min(100, (load8 / maxLoad) * 100)}%;background:${load8 >= maxLoad ? "var(--red)" : load8 >= maxLoad - 1 ? "var(--gold)" : "var(--green)"}"></div></span> ${load8}/${maxLoad}</span></div></div>
        <div class="grid2"><div class="panel"><h2>順位の推移</h2><div class="small muted" style="margin:-6px 0 6px">直近${rh.length}週${best ? ` ・ 最高${best}位` : ""}</div>${rankSpark}</div>
        <div class="panel"><h2>コンディション</h2><div class="attr" style="grid-template-columns:70px 1fr 40px"><span>疲労</span><div class="bar"><div style="width:${me.fatigue}%;background:${me.fatigue > 60 ? "var(--red)" : me.fatigue > 40 ? "var(--gold)" : "var(--green)"}"></div></div><span class="num">${Math.round(me.fatigue)}</span></div>
          <div class="small muted">${me.injury ? `<span class="red">${esc(me.injury.label)} 残り${me.injury.weeks}週</span>` : "怪我なし"} ・ 資金 <b class="${S.human.money < 0 ? "red" : ""}">${money(S.human.money)}</b></div>
          <div class="small muted" style="margin-top:6px">試合プラン: ${TL.PLANS[S.human.plan].label} ・ 重点: ${ATTRL[S.human.focus[0]]}・${ATTRL[S.human.focus[1]]}</div></div></div>
      </div>
      <div>${rivalCard}<div class="panel"><h2>受信箱</h2><div class="inbox">${items.join("")}</div></div></div></div>`;
    c.querySelector("[data-go-auto]").onclick = () => U.runWeeks([auto0.type === "blocked" ? { type: "blocked" } : { type: "auto" }]);
    c.querySelector("[data-go]").onclick = () => { U.tab = "plan"; U.render(); };
    c.querySelector("[data-auto]").onclick = () => U.autoRun(60);
    const eb = c.querySelector("[data-ev]"); if (eb) eb.onclick = () => { U.modal = U.eventHtml(S.human.event); U.render(); };
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
      <label class="small">重点スキル ${[0, 1].map((i) => `<select data-focus="${i}">${W.ATTRS.map((k) => `<option value="${k}" ${S.human.focus[i] === k ? "selected" : ""}>${ATTRL[k]}</option>`).join("")}</select>`).join(" ")}</label>
      <label class="small">試合プラン <select data-plan>${Object.entries(TL.PLANS).map(([k, p]) => `<option value="${k}" ${S.human.plan === k ? "selected" : ""}>${p.label}</option>`).join("")}</select></label>
      <label class="small">セット間 <select data-rule><option value="none" ${S.human.switchRule === "none" ? "selected" : ""}>切り替えない</option><option value="behind" ${S.human.switchRule === "behind" ? "selected" : ""}>セットを落としたら攻撃的に</option></select></label></div></div>`;
    // columns
    let cols = "";
    let blockedNext = me.blockedUntil >= S.t;
    for (let i = 0; i < 4; i++) {
      const { wk, yr } = weekAt(i);
      const tours = W.weekTournaments(S, wk, yr);
      const sel = U.planSel[i];
      if (blockedNext) { cols += `<div class="pcol blocked"><div><b>第${wk}週</b><div class="small muted">大会2週目<br>（移動・調整）</div></div></div>`; blockedNext = false; sel.choice = "blocked"; continue; }
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
      cols += `<div class="pcol"><div class="phead"><b>第${wk}週</b><span class="small muted">${yr !== S.year ? cal(yr) + "年" : ""}</span></div>${seg}${cards || (tours.length ? '<div class="small muted" style="text-align:center;padding:12px 0">出られる大会なし</div>' : '<div class="small muted" style="text-align:center;padding:12px 0">オフシーズン</div>')}</div>`;
      const chosen = tours.find((T) => T.id === sel.choice);
      if (isTour && chosen && chosen.def.weeks === 2) blockedNext = true;
    }
    html += `<div class="panel"><div class="planner">${cols}</div>
      <div class="row between" style="margin-top:12px"><div class="row"><button class="primary bigbtn" data-run="4">この4週を進める</button><button data-run="1">1週だけ進める</button><button data-auto="60">自動進行（停止条件まで）</button></div>${hidden || showAll ? `<button data-showall class="small">${showAll ? "出られない大会を隠す" : `出られない大会を表示（${hidden}）`}</button>` : ""}</div>
      <p class="small muted" style="margin:8px 0 0">大会カードをクリックで選択。「おまかせ」は出られる最上位の大会に出るが、疲労45超・負荷上限・GS翌週は休む。先の週の当落は現在のランキングで推定。</p></div>`;
    html += `<div class="grid2"><div class="panel"><h2>自動進行の停止条件</h2>
      ${[["stopTournament", "自分の大会が終わるごと"], ["stopMilestone", "ランキングの節目"], ["stopInjury", "怪我"], ["stopEvent", "イベント（選択肢）"], ["stopRival", "宿敵との対戦"], ["stopSeason", "シーズン終了"]].map(([k, l]) => `<label class="small" style="display:inline-block;margin-right:14px"><input type="checkbox" data-set="${k}" ${settings[k] ? "checked" : ""}> ${l}</label>`).join("")}</div>
    <div class="panel"><h2>観戦モード</h2><p class="small muted">重要試合はポイント単位で観戦し、セット間にプランを変えられる。</p>
      ${[["watchEnabled", "観戦モードを使う"], ["watchGs", "グランドスラム"], ["watchFinals", "ATPファイナルズ"], ["watchTitle", "決勝と1000の準決勝"], ["watchRival", "宿敵戦"], ["watchTop10", "トップ10戦"]].map(([k, l]) => `<label class="small" style="display:inline-block;margin-right:14px"><input type="checkbox" data-set="${k}" ${settings[k] ? "checked" : ""}> ${l}</label>`).join("")}</div></div>`;
    c.innerHTML = html;
    c.querySelectorAll("[data-focus]").forEach((s) => s.onchange = () => { const f = [...c.querySelectorAll("[data-focus]")].map((x) => x.value); if (f[0] === f[1]) f[1] = W.ATTRS.find((k) => k !== f[0]); S.human.focus = f; U.save(); U.render(); });
    c.querySelector("[data-plan]").onchange = (e) => { S.human.plan = e.target.value; U.save(); };
    c.querySelector("[data-rule]").onchange = (e) => { S.human.switchRule = e.target.value; U.save(); };
    c.querySelectorAll("[data-seg]").forEach((b) => b.onclick = () => { const [i, k] = b.dataset.seg.split(":"); U.planSel[parseInt(i, 10)].choice = k; U.render(); });
    c.querySelectorAll("[data-pick]").forEach((el) => el.onclick = (e) => { if (el.dataset.disabled || e.target.closest("[data-dbl]")) return; const idx = el.dataset.pick.indexOf(":"); const i = parseInt(el.dataset.pick.slice(0, idx), 10), tid = el.dataset.pick.slice(idx + 1); U.planSel[i].choice = U.planSel[i].choice === tid ? "auto" : tid; U.render(); });
    c.querySelectorAll("[data-dbl]").forEach((cb) => cb.onchange = () => { U.planSel[parseInt(cb.dataset.dbl, 10)].doubles = cb.checked; });
    c.querySelectorAll("[data-set]").forEach((cb) => cb.onchange = () => { settings[cb.dataset.set] = cb.checked; U.saveSettings(); });
    c.querySelectorAll("[data-run]").forEach((b) => b.onclick = () => U.runWeeks(U.planSel.slice(0, parseInt(b.dataset.run, 10)).map(toAction)));
    c.querySelector("[data-auto]").onclick = () => U.autoRun(60);
    const sa = c.querySelector("[data-showall]"); if (sa) sa.onclick = () => { window._showAllTours = !showAll; U.render(); };
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
      return `第${s.set}セット <b class="score">${mine}-${theirs}${s.tb ? `(${Math.min(s.tb[0], s.tb[1])})` : ""}</b> ${s.who === hi ? '<span class="green">取る</span>' : '<span class="red">落とす</span>'}${bk ? ` <span class="muted">— ${bk}</span>` : ""}${pl}`;
    }).join("<br>");
    const st = m.stats;
    const bp = st ? `BP: 自分 ${st.breaks[hi]}ブレーク / 被BP ${st.bpSaved[hi]}/${st.bpFaced[hi]} セーブ ・ 総ポイント ${st.points[hi]}-${st.points[1 - hi]}` : "";
    return `<div class="match ${m.won ? "win" : "loss"}"><div class="row between"><span><b>${esc(m.round)}</b> vs <span data-player="${m.oppId}" class="accent">${esc(m.opp)}</span> <span class="muted">(${m.oppRank || "ランク外"})</span>${m.oppId === S.rivalId ? ' <span class="pill rival">宿敵</span>' : ""}</span><span class="score ${m.won ? "green" : "red"}">${m.won ? "WIN" : "LOSS"} ${esc(m.score)}</span></div>
      ${m.wo ? "" : `<details><summary class="small">詳細</summary><div class="log">${lines}<br>${bp}</div></details>`}</div>`;
  }
  function deltaHtml(delta, limit) {
    const e = Object.entries(delta || {}).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (!e.length) return '<span class="muted">—</span>';
    return e.slice(0, limit || 99).map(([k, v]) => `<span class="${v > 0 ? "green" : "red"}">${ATTRL[k] || D.SURFACES[k] || k} ${signed(v, 2)}</span>`).join(" ・ ");
  }
  function weekCard(rep, open) {
    const r = rep.human;
    let body = "";
    if (r) body += `<div class="row between"><b>${flag(r.T.country)} ${esc(r.T.name)}</b> ${catPill(r.T)} <span class="${r.humanRound === "優勝" ? "gold" : ""}"><b>${esc(r.humanRound || "")}</b> ${r.humanPts ? `+${r.humanPts}pt` : ""} ${r.humanPrize ? money(r.humanPrize) : ""}</span></div>${r.qualified ? '<p class="small green">予選を突破して本戦へ</p>' : ""}${r.humanMatches.map(matchHtml).join("")}${r.isFinals ? `<p class="small">グループA: ${r.groups[0].join(" / ")}<br>グループB: ${r.groups[1].join(" / ")}</p>` : ""}<p class="small muted">優勝: <span data-player="${r.winner.id}">${esc(r.winner.name)}</span>${r.finalist ? ` d. <span data-player="${r.finalist.id}">${esc(r.finalist.name)}</span> ${esc(r.finalScore)}` : ""}</p>`;
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
    const sb = c.querySelector("[data-season]"); if (sb) sb.onclick = () => { U.modal = U.seasonHtml(last.season); U.render(); };
    const eb = c.querySelector("[data-ev]"); if (eb) eb.onclick = () => { if (S.human.event) { U.modal = U.eventHtml(S.human.event); U.render(); } };
  };

  // ---------- ランキング ----------
  U.screens.ranking = function (c) {
    const S = U.S, me = human();
    const list = S.players.filter((p) => p.rank).sort((a, b) => a.rank - b.rank);
    const showAll = window._rankAll;
    const rows = (showAll ? list : list.slice(0, 100).concat(me.rank && me.rank > 100 ? [me] : [])).map((p) => {
      const d = p.prevRank && p.rank ? p.prevRank - p.rank : 0;
      return `<tr class="${p.isHuman ? "me" : p.isRival ? "rival" : ""}"><td class="num">${p.rank}</td><td><span data-player="${p.id}" class="accent">${U.avatar(p, "sm")} <span style="margin-left:6px">${esc(p.name)}</span></span>${p.isRival ? ' <span class="pill rival">宿敵</span>' : ""}</td><td class="num">${W.age(S, p)}</td><td class="num">${p.points}</td><td class="num small ${d > 0 ? "green" : d < 0 ? "red" : "muted"}">${d > 0 ? "▲" + d : d < 0 ? "▼" + -d : "-"}</td></tr>`;
    }).join("");
    c.innerHTML = `<div class="panel"><div class="row between"><h2>ATPランキング <span class="muted small">${cal()}年 第${S.week}週</span></h2><button data-all>${showAll ? "Top100のみ" : "全選手"}</button></div><table><tr><th class="num">#</th><th>選手</th><th class="num">年齢</th><th class="num">ポイント</th><th class="num">変動</th></tr>${rows}</table></div>`;
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
    c.innerHTML = `<div class="grid2"><div class="panel"><div class="identity" style="margin-bottom:12px">${U.avatar(me)}<div><div class="name">${esc(me.name)}</div><div class="sub">総合 ${ovr.toFixed(1)} ・ ${me.hand === "L" ? "左利き" : "右利き"} ・ ${W.STYLE_LABEL[me.style] || ""} ・ ${esc(hint)}</div></div></div>
      <div class="attr" style="color:var(--muted);font-size:11px"><span></span><span></span><span class="num">値</span><span>4週</span><span>今季</span></div>${attrs}
      <h3 style="margin-top:12px">サーフェス適性</h3>${surf}
      <h3 style="margin-top:12px">総合の推移（直近${Math.min(hist.length, 120)}週）</h3>${sparkline(hist.map((x) => x.ovr))}
      <p class="small muted">同年代（±1歳）${peers.length + 1}人中 ${me.rank ? myPos + "番目" : "ランク外"}。成長は年齢・隠れた天井・練習の重点・コーチで決まる。</p></div>
      <div><div class="panel"><h2>キャリア</h2><div class="kpi"><div class="card"><div class="v">${me.stats.bestRank || "-"}</div><div class="l">最高ランク</div></div><div class="card"><div class="v">${me.stats.titles}</div><div class="l">タイトル</div></div><div class="card"><div class="v">${me.stats.gs}</div><div class="l">GS</div></div><div class="card"><div class="v">${me.stats.m1000}</div><div class="l">1000</div></div><div class="card"><div class="v">${me.stats.weeksNo1}</div><div class="l">No.1週</div></div><div class="card"><div class="v">${money(me.stats.prize)}</div><div class="l">生涯賞金</div></div></div>
        <p class="small">対Top10: ${top10.filter((m) => m.won).length}勝${top10.filter((m) => !m.won).length}敗 ・ 通算 ${me.stats.w}勝${me.stats.l}敗</p>
        ${titles.length ? `<p class="small"><b class="gold">タイトル:</b> ${titles.map((t) => `${cal(t.year)} ${esc(t.name)}`).join("、")}</p>` : ""}</div>
      ${rv ? `<div class="panel"><h2>宿敵</h2><div class="identity" data-player="${rv.id}">${U.avatar(rv)}<div><div class="name">${esc(rv.name)}</div><div class="sub">${W.age(S, rv)}歳 ・ ${rv.retired ? "引退" : rv.rank ? rv.rank + "位" : "ランク外"} ・ 最高${rv.stats.bestRank || "-"}位 ・ タイトル${rv.stats.titles}</div></div></div><p style="margin-top:8px">対戦成績 <b>${h2h.filter((m) => m.won).length}勝${h2h.filter((m) => !m.won).length}敗</b></p>${h2h.slice(-5).reverse().map((m) => `<div class="small ${m.won ? "green" : "red"}">${cal(m.year)} ${esc(m.tour)} ${esc(m.round)} ${m.won ? "WIN" : "LOSS"} ${esc(m.score)}</div>`).join("")}</div>` : ""}</div></div>`;
    U.bindPlayerLinks(c);
  };

  // ---------- チーム ----------
  U.screens.team = function (c) {
    const S = U.S, H = S.human;
    const coachCard = (o, i) => {
      const current = i === undefined;
      const remain = current ? Math.max(0, (o.until || S.t) - S.t) : 0;
      const compat = current ? (W.compatKnown(S) ? `相性: <b class="${o.compat >= 0.05 ? "green" : o.compat > -0.05 ? "" : "red"}">${W.compatLabel(o)}</b>` : `相性: <span class="muted">8週で分かる（残り${Math.max(0, 8 - (S.t - (o.since || S.t)))}週）</span>`) : "相性: <span class='muted'>雇ってみないと分からない</span>";
      return `<div class="card"><div class="row between"><div class="row" style="align-items:flex-start">${U.avatar(o)}<div><b>${esc(o.name)}</b> <span class="muted small">${o.age || ""}歳</span> <span class="pill">${W.COACH_TYPES[o.type].label}</span> <span class="gold">${"★".repeat(o.quality)}</span><div class="small muted">${W.COACH_TYPES[o.type].desc}${o.type === "tech" ? `（この候補は ＋${25 * o.quality}%）` : ""}</div><div class="small">${compat}${current ? ` ・ 契約 残り${remain}週（${o.years}年契約）` : ` ・ ${o.years}年契約`}</div></div></div><div style="text-align:right"><div><b>${money(o.cost)}</b><span class="muted small">/週</span></div>${current ? `<button class="danger small" data-fire>解雇（違約金 ${money(W.terminationFee(S))}）</button>` : `<button class="primary" data-hire="${i}">雇う</button>`}</div></div></div>`;
    };
    c.innerHTML = `<div class="grid2"><div><div class="panel"><h2>コーチ</h2>${H.coach ? coachCard(H.coach) : '<p class="muted">コーチなし。契約は1〜3年で、途中解除は残り期間の半額が違約金。相性は雇って8週で分かり、練習効果に ±20% 前後効く。満了時に更新交渉。</p>'}
      <h3 style="margin-top:12px">候補（シーズンごとに入れ替わる）</h3>${H.coachOffers.length ? H.coachOffers.map(coachCard).join("") : '<p class="muted small">候補なし</p>'}</div>
      <div class="panel"><h2>サポートスタッフ <span class="muted small">最高ランキングで枠が増える ・ 週 ${money(W.staffCost(S))}</span></h2>${Object.entries(W.ROLES).map(([k, r]) => { const on = !!W.staffOf(S)[k]; const ok = W.roleUnlocked(S, k); return `<div class="card" style="${ok ? "" : "opacity:.55"}"><div class="row between"><div><b>${r.label}</b> <span class="muted small">${money(r.cost)}/週</span><div class="small muted">${r.desc}</div>${ok ? "" : `<div class="small gold">解放条件: 最高ランキング ${r.unlock}位以内（現在 ${human().stats.bestRank || "-"}位）</div>`}</div><label><input type="checkbox" data-staff="${k}" ${on ? "checked" : ""} ${ok ? "" : "disabled"}> 雇う</label></div></div>`; }).join("")}
      <p class="small muted">トップ選手の帯同チームは5〜6人が普通。全部雇うと週 ${money(Object.values(W.ROLES).reduce((s, r) => s + r.cost, 0))} ＋コーチ。</p></div></div>
      <div><div class="panel"><h2>試合プラン</h2><p class="small muted">試合前に決める方針。全試合に適用され、セット間の切替ルールで試合中に変わる。</p>
        <table><tr><th>プラン</th><th>効果</th></tr><tr><td>バランス</td><td class="small">標準</td></tr><tr><td>攻撃的</td><td class="small">サーブ ＋2.5、ラリー ＋1、リターン −2。タイブレーク勝負になりやすい</td></tr><tr><td>守備的</td><td class="small">リターン ＋2.5、ラリー ＋0.5、サーブ −2。試合が長くなり疲労 ×1.1</td></tr><tr><td>体力温存</td><td class="small">全体 −1.5、疲労 ×0.7。格下相手や連戦向け</td></tr></table>
        <div class="row" style="margin-top:8px"><label class="small">現在: <select data-plan>${Object.entries(TL.PLANS).map(([k, p]) => `<option value="${k}" ${H.plan === k ? "selected" : ""}>${p.label}</option>`).join("")}</select></label>
        <label class="small">セット間: <select data-rule><option value="none" ${H.switchRule === "none" ? "selected" : ""}>切り替えない</option><option value="behind" ${H.switchRule === "behind" ? "selected" : ""}>セットを落としたら攻撃的に</option></select></label></div></div>
      <div class="panel"><h2>チームの効果</h2><ul class="small muted"><li>技術コーチ: 練習週の重点スキル</li><li>フィジカル: 練習週の身体系＋毎週の疲労回復</li><li>メンタル: クラッチ・集中の練習効果＋全試合のブレークポイント</li><li>クレー／芝の専門家: 練習週に適性が上がり、そのサーフェスの試合経験値が増える</li><li>スタッフ: フィジオ（怪我・回復）、トレーナー（身体系・回復・怪我）、ヒッティング（練習・経験値）、エージェント（スポンサー・アピアランスフィー・WC）、アナリスト（格上戦）</li></ul></div></div></div>`;
    c.querySelectorAll("[data-hire]").forEach((b) => b.onclick = () => { W.hireCoach(S, parseInt(b.dataset.hire, 10)); U.save(); U.render(); });
    const f = c.querySelector("[data-fire]"); if (f) f.onclick = () => { const fee = W.terminationFee(S); U.modal = `<h2>契約解除</h2><p>${esc(H.coach.name)} との契約を解除しますか？残り期間の半額（上限26週）が違約金になります: <b>${money(fee)}</b></p><div class="row"><button class="danger" data-confirm-fire>解除する</button><button data-close>やめる</button></div>`; U.render(); };
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
    const cats = [["prize", "賞金（シングルス＋ダブルス）", 1], ["support", "支援（出自・後援）", 1], ["rankSponsor", "ランキング連動スポンサー", 1], ["extra", "契約スポンサー・手当・アピアランスフィー", 1], ["base", "基本経費（用具・滞在）", -1], ["team", "チーム（コーチ・スタッフ）", -1], ["travel", "移動費", -1]];
    const last = led[led.length - 1];
    const weekly = last ? last.support + last.rankSponsor + last.extra - last.base - last.team : 0;
    const me = human();
    const rows = (arr) => cats.map(([k, l, sgn]) => { const v = sum(arr, k); return `<tr><td>${l}</td><td class="num ${sgn > 0 ? "green" : "red"}">${sgn > 0 ? "+" : "−"}${money(v)}</td></tr>`; }).join("") + `<tr><td><b>純増減</b></td><td class="num"><b>${money(sum(arr, "net"))}</b></td></tr>`;
    const seasonsHist = S.history.seasons.filter((z) => z.finance);
    c.innerHTML = `<div class="kpi"><div class="card"><div class="v ${H.money < 0 ? "red" : ""}">${money(H.money)}</div><div class="l">残高</div></div><div class="card"><div class="v">${money(sum(season, "net"))}</div><div class="l">今季の純増減</div></div><div class="card"><div class="v ${weekly < 0 ? "red" : "green"}">${(weekly >= 0 ? "+" : "") + money(weekly)}</div><div class="l">大会に出ない週の収支</div></div><div class="card"><div class="v">${money(me.stats.prize)}</div><div class="l">生涯賞金</div></div></div>
      <div class="grid2"><div class="panel"><h2>今季の内訳 <span class="muted small">${cal()}年 ${season.length}週</span></h2><table>${rows(season)}</table>
        <p class="small muted" style="margin-top:8px">固定収入: ${H.sponsorUntil > S.t ? `支援 ${money(H.sponsorWeekly)}/週（残り${H.sponsorUntil - S.t}週）` : "支援なし"}${H.sponsor2 && H.sponsor2.until > S.t ? ` ・ 契約 ${money(H.sponsor2.weekly)}/週（残り${H.sponsor2.until - S.t}週）` : ""} ・ ランキング連動 ${last ? money(last.rankSponsor) : "-"}/週<br>固定支出: 基本 $0.5k/週${H.coach ? ` ・ コーチ ${money(H.coach.cost)}/週` : ""}${W.staffCost(S) ? ` ・ スタッフ ${money(W.staffCost(S))}/週` : ""}<br>移動費: 同地域 $0.6k、地域外 $2.5k（1000以上は＋$0.5k）。残高が負だと地域外へ移動できない</p></div>
      <div class="panel"><h2>残高の推移 <span class="muted small">直近${led.length}週</span></h2>${sparkline(led.map((e) => e.balance), "var(--green)")}<h3 style="margin-top:12px">直近12週</h3><table><tr><th>週</th><th class="num">賞金</th><th class="num">スポンサー</th><th class="num">経費</th><th class="num">移動</th><th class="num">純増減</th><th class="num">残高</th></tr>${led.slice(-12).reverse().map((e) => `<tr><td>${cal(e.year)} W${e.week}</td><td class="num">${e.prize ? money(e.prize) : "-"}</td><td class="num">${money(e.support + e.rankSponsor + e.extra)}</td><td class="num">${money(e.base + e.team)}</td><td class="num">${e.travel ? money(e.travel) : "-"}</td><td class="num ${e.net < 0 ? "red" : "green"}">${money(e.net)}</td><td class="num">${money(e.balance)}</td></tr>`).join("")}</table></div></div>
      ${seasonsHist.length ? `<div class="panel"><h2>シーズン別</h2><table><tr><th>年</th><th class="num">賞金</th><th class="num">支援・スポンサー</th><th class="num">チーム</th><th class="num">移動</th><th class="num">年末残高</th></tr>${seasonsHist.slice().reverse().map((z) => `<tr><td>${z.calendarYear}</td><td class="num">${money(z.finance.prize)}</td><td class="num">${money(z.finance.support + z.finance.rankSponsor + z.finance.extra)}</td><td class="num">${money(z.finance.team)}</td><td class="num">${money(z.finance.travel)}</td><td class="num ${z.money < 0 ? "red" : ""}">${money(z.money)}</td></tr>`).join("")}</table></div>` : ""}`;
  };

  // ---------- 記録 ----------
  U.screens.records = function (c) {
    const S = U.S;
    const seasons = S.history.seasons.slice().reverse();
    const matches = S.history.matches.slice().reverse().slice(0, 60);
    c.innerHTML = `<div class="panel"><h2>シーズン履歴</h2>${seasons.length ? `<table><tr><th>年</th><th class="num">年齢</th><th class="num">年末</th><th class="num">成績</th><th class="num">勝</th><th class="num">賞金</th><th>優勝</th></tr>${seasons.map((z) => `<tr><td>${z.calendarYear}</td><td class="num">${z.age}</td><td class="num">${z.rank || "-"}</td><td class="num">${z.w}-${z.l}</td><td class="num">${z.titles.length}</td><td class="num">${money(z.prize)}</td><td class="small">${z.titles.map(esc).join("、")}</td></tr>`).join("")}</table>` : '<div class="empty">まだシーズンを終えていない。</div>'}</div>
      <div class="panel"><h2>最近の試合</h2>${matches.map((m) => `<div class="match ${m.won ? "win" : "loss"} small"><span class="muted">${cal(m.year)} W${m.week}</span> ${esc(m.tour)} <span class="pill">${esc(m.cat)}</span> ${esc(m.round)} vs <span data-player="${m.oppId}" class="accent">${esc(m.opp)}</span>(${m.oppRank || "-"}) <span class="score ${m.won ? "green" : "red"}">${m.won ? "W" : "L"} ${esc(m.score)}</span></div>`).join("") || '<div class="empty">まだ試合がない。</div>'}</div>
      <div class="panel"><h2>ニュース</h2><ul class="news small">${S.history.news.slice().reverse().slice(0, 40).map((n) => `<li><span class="muted">${cal(n.year)} W${n.week}</span> ${esc(n.text)}</li>`).join("")}</ul></div>`;
    U.bindPlayerLinks(c);
  };

  // ---------- 設定 ----------
  U.screens.settings = function (c) {
    const S = U.S;
    c.innerHTML = `<div class="panel"><h2>セーブ</h2><p class="small muted">毎回自動保存（このブラウザのlocalStorage）。乱数はシード固定で、リロードしてやり直しても同じ結果になる。</p>
      <div class="row"><button data-export>エクスポート（JSON）</button><label>インポート <input type="file" id="imp" accept=".json"></label></div>
      <p class="small muted" style="margin-top:8px">シード: ${S.seed} ・ 出自: ${U.ORIGINS[S.config.origin].name} ・ 怪我: ${S.config.injuryRealism === "low" ? "低頻度" : "標準"}</p></div>
      ${S.human.careerOver ? "" : `<div class="panel"><h2>引退</h2><p class="small muted">現役を退く。キャリアの総括と殿堂判定が行われ、殿堂ギャラリーに記録される。36歳のシーズン終了時には自動的に引退。</p><button class="danger" id="retire">引退する</button></div>`}
      <div class="panel"><h2>新しいキャリア</h2><p class="small muted">現在のセーブは消える。</p><button class="danger" id="newgame">新しいキャリアを始める</button></div>
      <div class="panel"><h2>このゲームについて</h2><p class="small muted">Tour Life ${U.VERSION}。登場選手はすべて架空（2025/26年のツアーをモデルにした近似名）。能力値は推定であり公式データではない。ポイント表は現行ATPルールの近似。</p></div>`;
    c.querySelector("[data-export]").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([W.serialize(S)], { type: "application/json" })); a.download = `tourlife_${cal()}_w${S.week}.json`; a.click(); };
    document.getElementById("imp").onchange = (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { U.S = W.deserialize(r.result); U.save(); U.tab = "plan"; U.runLog = null; U.planSel = null; U.render(); } catch (err) { U.modal = `<h2>読み込めませんでした</h2><p class="small">${esc(err.message)}</p><button data-close>閉じる</button>`; U.render(); } }; r.readAsText(f); };
    document.getElementById("newgame").onclick = U.newGame;
    const rb = document.getElementById("retire");
    if (rb) rb.onclick = () => { U.modal = `<h2>引退する</h2><p>${esc(human().name)}（${W.age(S, human())}歳、${human().rank ? human().rank + "位" : "ランク外"}）は現役を退きますか？この操作は取り消せません。</p><div class="row"><button class="danger" data-confirm-retire>引退する</button><button data-close>やめる</button></div>`; U.render(); };
  };
})();
