// Live match viewer (broadcast-style). Drives the TL.Match stepper point by point,
// animates each rally on a court diagram and offers a tactics board between sets.
(function () {
  const U = TL.UI;
  const KIND_BADGE = { ace: ["エース", "gold"], double_fault: ["ダブルフォルト", "red"], serve_winner: ["サービスウィナー", "green"], return_winner: ["リターンウィナー", "green"], winner: ["ウィナー", "green"], error: ["ミス", "muted"] };
  U.showMatchViewer = function (y, done) {
    const { esc, flag, catPill } = U;
    const S = U.S;
    const m = y.match, T = y.T;
    const hi = y.a.isHuman ? 0 : 1;
    const me = y.a.isHuman ? y.a : y.b;
    let timer = null, animTimer = null;
    let speed = U.settings.watchSpeed || 300;
    const bg = document.createElement("div");
    bg.className = "modal-bg full";
    bg.innerHTML = `<div class="modal viewer">
      <div class="row between"><div><div class="small muted" style="text-transform:uppercase;letter-spacing:.08em">Live ・ ${esc(y.round)}</div><div style="font-size:18px;font-weight:800">${flag(T.country)} ${esc(T.name)} ${catPill(T)}${T.def.bo5 ? ' <span class="pill">5セット</span>' : ""}</div></div><div class="small muted" id="v-plan-label"></div></div>
      <div class="vgrid">
        <div><table class="scoreboard"><tbody id="v-board"></tbody></table>
          <div class="momentum" id="v-mom" title="直近10ポイント"></div>
          <div id="v-banner" class="banner"></div></div>
        <div class="court-wrap"><svg viewBox="0 0 200 110" class="court ${T.surface}" id="v-court">
          <rect x="10" y="10" width="180" height="90" rx="2" class="cline" fill="none"/>
          <line x1="10" y1="21" x2="190" y2="21" class="cline"/><line x1="10" y1="89" x2="190" y2="89" class="cline"/>
          <line x1="100" y1="10" x2="100" y2="100" class="net"/>
          <line x1="52" y1="21" x2="52" y2="89" class="cline"/><line x1="148" y1="21" x2="148" y2="89" class="cline"/><line x1="52" y1="55" x2="148" y2="55" class="cline"/>
          <circle id="v-pa" cx="22" cy="55" r="5" class="pl me"/><circle id="v-pb" cx="178" cy="55" r="5" class="pl op"/>
          <circle id="v-ball" cx="22" cy="55" r="3" class="ball"/></svg>
          <div id="v-kind" class="kind"></div></div>
      </div>
      <div id="v-tactics" class="tactics" style="display:none"></div>
      <div class="row" style="margin:8px 0"><button id="v-play" class="primary">▶ 再生</button><button id="v-point">1ポイント</button><button id="v-set">セット終了まで</button><button id="v-skip">スキップ</button>
        <label class="small">速度 <select id="v-speed"><option value="900" ${speed === 900 ? "selected" : ""}>ゆっくり</option><option value="450" ${speed === 450 || speed === 300 ? "selected" : ""}>普通</option><option value="120" ${speed === 120 || speed === 80 ? "selected" : ""}>速い</option></select></label>
        <button id="v-snd" class="small" title="サウンド">${U.settings.sound ? "🔊" : "🔇"}</button>
        <label class="small">プラン <select id="v-planSel">${Object.entries(TL.PLANS).map(([k, p]) => `<option value="${k}" ${m.plans[hi] === k ? "selected" : ""}>${p.label}</option>`).join("")}</select></label></div>
      <div class="grid2"><div><h3>実況</h3><div id="v-feed" class="feed"></div></div><div><h3>スタッツ</h3><table class="small" id="v-stats"></table></div></div>
      <div class="row" style="margin-top:10px;justify-content:flex-end"><button id="v-done" class="primary" disabled>続ける</button></div></div>`;
    document.body.appendChild(bg);
    const $ = (id) => bg.querySelector("#" + id);
    if (![900, 450, 120].includes(speed)) speed = speed <= 100 ? 120 : speed >= 700 ? 900 : 450;
    const feed = [];
    let feedSeen = 0;
    const recent = [];
    const ball = $("v-ball");
    // Rally animation: ball crosses the net `rally` times within the step interval.
    function animate(ev) {
      if (animTimer) { clearInterval(animTimer); animTimer = null; }
      const server = ev.server, xs = [22, 178];
      const hops = Math.max(1, ev.rally || 1);
      const dur = Math.max(60, Math.min(speed * 0.85, 1400) / hops);
      let i = 0;
      let side = server;
      ball.setAttribute("cx", xs[side]); ball.setAttribute("cy", 55);
      if (U.reducedMotion && U.reducedMotion()) { ball.setAttribute("cx", ev.winner === 0 ? 140 : 60); }
      else animTimer = setInterval(() => {
        i++;
        if (i > hops) { clearInterval(animTimer); animTimer = null; return; }
        side = 1 - side;
        const y = 25 + Math.random() * 60;
        if (ev.kind === "double_fault" && i === 1) { ball.setAttribute("cx", side === 0 ? 70 : 130); ball.setAttribute("cy", y); clearInterval(animTimer); animTimer = null; return; }
        ball.setAttribute("cx", side === 0 ? (i === hops && ev.winner !== side ? 60 : xs[0] + 8) : (i === hops && ev.winner !== side ? 140 : xs[1] - 8));
        ball.setAttribute("cy", y);
      }, dur);
      const kb = KIND_BADGE[ev.kind];
      $("v-kind").innerHTML = kb ? `<span class="${kb[1]}">${kb[0]}</span>${ev.rally >= 3 ? ` <span class="muted">${ev.rally}打</span>` : ""}` : "";
      $("v-kind").className = "kind " + (ev.winner === hi ? "me" : "op");
    }
    function tacticsBoard() {
      const box = $("v-tactics");
      if (!m.betweenSets || m.done) { box.style.display = "none"; return; }
      box.style.display = "block";
      box.innerHTML = `<div class="small gold" style="margin-bottom:6px">セット間 ・ タクティクスボード — 次のセットのプランを選ぶ</div><div class="tgrid">${Object.entries(TL.PLANS).map(([k, p]) => `<button class="tplan ${m.plans[hi] === k ? "on" : ""}" data-tplan="${k}"><b>${p.label}</b><span class="tiny muted">${k === "balanced" ? "標準" : k === "aggressive" ? "サーブ+2.5 ラリー+1 リターン−2" : k === "defensive" ? "リターン+2.5 ラリー+0.5 サーブ−2・疲労×1.1" : "全体−1.5・疲労×0.7"}</span></button>`).join("")}</div>`;
      box.querySelectorAll("[data-tplan]").forEach((b) => b.onclick = () => setPlan(b.dataset.tplan));
    }
    function setPlan(k) {
      if (k === m.plans[hi]) return;
      m.setPlan(hi, k); S.human.plan = k; $("v-planSel").value = k;
      m.events.push({ kind: "plan", who: hi, text: `${me.name} が${TL.PLANS[k].label}に切り替える` });
      board();
    }
    function board() {
      const pl = m.pointLabel();
      const rows = [0, 1].map((i) => {
        const p = m.players[i];
        const sets = m.sets.map((st) => `<td class="num ${st[i] > st[1 - i] ? "" : "muted"}">${st[i]}${st[2] ? `<sup class="muted small">${st[2][i]}</sup>` : ""}</td>`).join("");
        const cur = m.done ? "" : `<td class="num cur"><b>${m.games[i]}</b></td><td class="num cur" style="width:52px"><b class="${m.tb ? "gold" : ""}">${pl[i]}</b></td>`;
        return `<tr class="${i === hi ? "me" : ""}"><td style="width:26px">${!m.done && m.server === i ? '<span class="serve"></span>' : ""}</td><td>${U.avatar(p, "sm")} <b style="margin-left:6px">${esc(p.name)}</b> <span class="muted small">(${p.rank || "-"})</span>${p.isRival ? ' <span class="pill rival">宿敵</span>' : ""}</td>${sets}${cur}</tr>`;
      }).join("");
      $("v-board").innerHTML = rows;
      $("v-mom").innerHTML = Array.from({ length: 10 }, (_, k) => { const w = recent[recent.length - 10 + k]; return `<i class="${w === undefined ? "" : w === hi ? "me" : "op"}"></i>`; }).join("");
      const sit = m.done ? null : m.situation();
      let banner = "";
      if (m.done) banner = `<b class="${m.winnerIdx === hi ? "green" : "red"}" style="font-size:15px">${m.winnerIdx === hi ? "勝利" : "敗戦"}</b> ${esc(m.result.score)}`;
      else if (m.betweenSets) banner = `<b class="gold">セット間</b>（セット ${m.setsWon[hi]}-${m.setsWon[1 - hi]}）`;
      else if (sit.matchPoint >= 0) banner = `<b class="${sit.matchPoint === hi ? "green" : "red"}">マッチポイント ${sit.matchPoint === hi ? "自分" : "相手"}</b>`;
      else if (sit.setPoint >= 0) banner = `<b class="gold">セットポイント ${sit.setPoint === hi ? "自分" : "相手"}</b>`;
      else if (sit.bp) banner = `<b class="${m.server === hi ? "red" : "green"}">ブレークポイント ${m.server === hi ? "相手" : "自分"}</b>`;
      else if (m.tb) banner = "タイブレーク";
      $("v-banner").innerHTML = banner;
      const st = m.stats;
      const row = (l, a, b) => `<tr><td class="muted">${l}</td><td class="num"><b>${a}</b></td><td class="num">${b}</td></tr>`;
      $("v-stats").innerHTML = `<tr><th></th><th class="num">自分</th><th class="num">相手</th></tr>${row("総ポイント", st.points[hi], st.points[1 - hi])}${row("エース", st.aces[hi], st.aces[1 - hi])}${row("ダブルフォルト", st.dfs[hi], st.dfs[1 - hi])}${row("ウィナー", st.winners[hi], st.winners[1 - hi])}${row("アンフォーストエラー", st.ues[hi], st.ues[1 - hi])}${row("ブレーク", st.breaks[hi], st.breaks[1 - hi])}${row("被BPセーブ", `${st.bpSaved[hi]}/${st.bpFaced[hi]}`, `${st.bpSaved[1 - hi]}/${st.bpFaced[1 - hi]}`)}${row("最長ラリー", st.longest + "打", "")}${row("プラン", TL.PLANS[m.plans[hi]].label, TL.PLANS[m.plans[1 - hi]].label)}`;
      $("v-plan-label").textContent = `セット ${m.setsWon[hi]}-${m.setsWon[1 - hi]}`;
      while (feedSeen < m.events.length) { const e = m.events[feedSeen++]; if (U.sfx && timer) { if (e.kind === "set") U.sfx("set"); else if (e.kind === "break" && e.who === hi) U.sfx("brk"); } feed.unshift(`<div class="${e.kind === "set" || e.kind === "end" ? "gold" : e.kind === "break" ? (e.who === hi ? "green" : "red") : e.kind === "pt" ? (e.who === hi ? "" : "muted") : "muted"}">${esc(e.text)}</div>`); }
      $("v-feed").innerHTML = feed.slice(0, 16).join("");
      if (m.last && m.last.kind !== undefined && m.last.winner !== undefined) { const tr = $("v-board").children[m.last.winner]; if (tr) tr.classList.add(m.last.winner === hi ? "flash-me" : "flash-op"); }
      tacticsBoard();
      if (m.done && !ended) { ended = true; if (U.sfx) U.sfx(m.winnerIdx === hi ? "win" : "lose"); }
      if (m.done) { stop(); $("v-done").disabled = false; $("v-play").disabled = true; $("v-point").disabled = true; $("v-set").disabled = true; $("v-skip").disabled = true; }
    }
    let ended = false;
    function step(anim) { const ev = m.step(); if (ev && ev.winner !== undefined) { recent.push(ev.winner); if (anim) { animate(ev); if (U.sfxPoint) U.sfxPoint(ev, hi); } } return ev; }
    function stop() { if (timer) { clearInterval(timer); timer = null; } $("v-play").textContent = "▶ 再生"; }
    function start() { if (m.done) return; stop(); $("v-play").textContent = "❚❚ 停止"; timer = setInterval(() => { if (m.done) { stop(); return; } step(true); board(); if (m.betweenSets) stop(); }, speed); }
    $("v-play").onclick = () => (timer ? stop() : start());
    $("v-point").onclick = () => { stop(); step(true); board(); };
    $("v-set").onclick = () => { stop(); const n = m.setNo; while (!m.done && m.setNo === n) step(false); board(); };
    $("v-skip").onclick = () => { stop(); while (!m.done) step(false); board(); };
    $("v-speed").onchange = (e) => { speed = parseInt(e.target.value, 10); U.settings.watchSpeed = speed; U.saveSettings(); if (timer) start(); };
    $("v-planSel").onchange = (e) => setPlan(e.target.value);
    $("v-snd").onclick = () => { U.settings.sound = !U.settings.sound; U.saveSettings(); $("v-snd").textContent = U.settings.sound ? "🔊" : "🔇"; if (U.settings.sound && U.sfx) U.sfx("click"); };
    $("v-done").onclick = () => { stop(); if (animTimer) clearInterval(animTimer); if (!m.done) m.finish(); bg.remove(); done(); };
    board();
    start();
  };
})();
