// Live match viewer (broadcast-style scoreboard). Drives TL.Match stepper point by point.
(function () {
  const U = TL.UI;
  U.showMatchViewer = function (y, done) {
    const { esc, flag, catPill } = U;
    const S = U.S;
    const m = y.match, T = y.T;
    const hi = y.a.isHuman ? 0 : 1;
    const me = y.a.isHuman ? y.a : y.b;
    let timer = null;
    let speed = U.settings.watchSpeed || 300;
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal viewer">
      <div class="row between"><div><div class="small muted" style="text-transform:uppercase;letter-spacing:.08em">Live ・ ${esc(y.round)}</div><div style="font-size:18px;font-weight:800">${flag(T.country)} ${esc(T.name)} ${catPill(T)}${T.def.bo5 ? ' <span class="pill">5セット</span>' : ""}</div></div><div class="small muted" id="v-plan-label"></div></div>
      <table class="scoreboard"><tbody id="v-board"></tbody></table>
      <div class="momentum" id="v-mom" title="直近10ポイント"></div>
      <div id="v-banner" class="banner"></div>
      <div class="row" style="margin:8px 0"><button id="v-play" class="primary">▶ 再生</button><button id="v-point">1ポイント</button><button id="v-set">セット終了まで</button><button id="v-skip">スキップ</button>
        <label class="small">速度 <select id="v-speed"><option value="700" ${speed === 700 ? "selected" : ""}>ゆっくり</option><option value="300" ${speed === 300 ? "selected" : ""}>普通</option><option value="80" ${speed === 80 ? "selected" : ""}>速い</option></select></label>
        <label class="small">プラン <select id="v-planSel">${Object.entries(TL.PLANS).map(([k, p]) => `<option value="${k}" ${m.plans[hi] === k ? "selected" : ""}>${p.label}</option>`).join("")}</select></label></div>
      <div class="grid2"><div><h3>実況</h3><div id="v-feed" class="feed"></div></div><div><h3>スタッツ</h3><div id="v-stats" class="small"></div></div></div>
      <div class="row" style="margin-top:10px;justify-content:flex-end"><button id="v-done" class="primary" disabled>続ける</button></div></div>`;
    document.body.appendChild(bg);
    const $ = (id) => bg.querySelector("#" + id);
    const feed = [];
    let feedSeen = 0;
    const recent = [];
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
      else if (m.betweenSets) banner = `<b class="gold">セット間</b> — プランを変えられる（セット ${m.setsWon[hi]}-${m.setsWon[1 - hi]}）`;
      else if (sit.matchPoint >= 0) banner = `<b class="${sit.matchPoint === hi ? "green" : "red"}">マッチポイント ${sit.matchPoint === hi ? "自分" : "相手"}</b>`;
      else if (sit.setPoint >= 0) banner = `<b class="gold">セットポイント ${sit.setPoint === hi ? "自分" : "相手"}</b>`;
      else if (sit.bp) banner = `<b class="${m.server === hi ? "red" : "green"}">ブレークポイント ${m.server === hi ? "相手" : "自分"}</b>`;
      else if (m.tb) banner = "タイブレーク";
      $("v-banner").innerHTML = banner;
      const st = m.stats;
      $("v-stats").innerHTML = `総ポイント <b>${st.points[hi]}-${st.points[1 - hi]}</b><br>ブレーク ${st.breaks[hi]}-${st.breaks[1 - hi]}<br>被BPセーブ ${st.bpSaved[hi]}/${st.bpFaced[hi]}（相手 ${st.bpSaved[1 - hi]}/${st.bpFaced[1 - hi]}）<br>プラン: 自分 ${TL.PLANS[m.plans[hi]].label} ／ 相手 ${TL.PLANS[m.plans[1 - hi]].label}`;
      $("v-plan-label").textContent = `セット ${m.setsWon[hi]}-${m.setsWon[1 - hi]}`;
      while (feedSeen < m.events.length) { const e = m.events[feedSeen++]; feed.unshift(`<div class="${e.kind === "set" || e.kind === "end" ? "gold" : e.kind === "break" ? (e.who === hi ? "green" : "red") : "muted"}">${esc(e.text)}</div>`); }
      $("v-feed").innerHTML = feed.slice(0, 14).join("");
      if (m.last && m.last.kind === "point") { const tr = $("v-board").children[m.last.winner]; if (tr) tr.classList.add(m.last.winner === hi ? "flash-me" : "flash-op"); }
      if (m.done) { stop(); $("v-done").disabled = false; $("v-play").disabled = true; $("v-point").disabled = true; $("v-set").disabled = true; $("v-skip").disabled = true; }
    }
    function step() { const ev = m.step(); if (ev && ev.kind === "point") recent.push(ev.winner); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } $("v-play").textContent = "▶ 再生"; }
    function start() { if (m.done) return; stop(); $("v-play").textContent = "❚❚ 停止"; timer = setInterval(() => { if (m.done) { stop(); return; } step(); board(); if (m.betweenSets) stop(); }, speed); }
    $("v-play").onclick = () => (timer ? stop() : start());
    $("v-point").onclick = () => { stop(); step(); board(); };
    $("v-set").onclick = () => { stop(); const n = m.setNo; while (!m.done && m.setNo === n) step(); board(); };
    $("v-skip").onclick = () => { stop(); while (!m.done) step(); board(); };
    $("v-speed").onchange = (e) => { speed = parseInt(e.target.value, 10); U.settings.watchSpeed = speed; U.saveSettings(); if (timer) start(); };
    $("v-planSel").onchange = (e) => { m.setPlan(hi, e.target.value); S.human.plan = e.target.value; m.events.push({ kind: "plan", who: hi, text: `${me.name} が${TL.PLANS[e.target.value].label}に切り替える` }); board(); };
    $("v-done").onclick = () => { stop(); if (!m.done) m.finish(); bg.remove(); done(); };
    board();
    start();
  };
})();
