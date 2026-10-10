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
    let timer = null;
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
          <circle id="v-hitA" cx="22" cy="55" r="5" class="hit"/><circle id="v-hitB" cx="178" cy="55" r="5" class="hit"/>
          <circle id="v-pa" cx="22" cy="55" r="5" class="pl me"/><circle id="v-pb" cx="178" cy="55" r="5" class="pl op"/>
          <ellipse id="v-shadow" cx="22" cy="55" rx="2.4" ry="1.2" class="shadow"/><circle id="v-ball" cx="22" cy="50" r="3" class="ball"/></svg>
          <div id="v-kind" class="kind"></div></div>
      </div>
      <div id="v-tactics" class="tactics" style="display:none"></div>
      <div class="row" style="margin:8px 0"><button id="v-play" class="primary">▶ 再生</button><button id="v-point">1ポイント</button><button id="v-set">セット終了まで</button><button id="v-skip">スキップ</button>
        <label class="small">速度 <select id="v-speed"><option value="900" ${speed === 900 ? "selected" : ""}>ゆっくり</option><option value="450" ${speed === 450 || speed === 300 ? "selected" : ""}>普通</option><option value="120" ${speed === 120 || speed === 80 ? "selected" : ""}>速い</option></select></label>
        <button id="v-snd" class="small" title="サウンド">${U.settings.sound ? "🔊" : "🔇"}</button>
        <label class="small">プラン <select id="v-planSel">${Object.entries(TL.PLANS).filter(([, p]) => !p.auto).map(([k, p]) => `<option value="${k}" ${m.plans[hi] === k ? "selected" : ""}>${p.label}</option>`).join("")}</select></label></div>
      ${y.tactic ? `<div class="small tactic"><span class="muted">相手は</span> <b>${esc(y.tactic.oppStyle)}</b> <span class="muted">→ コーチの推奨は</span> <b>${TL.PLANS[y.tactic.suggested].label}</b>${y.tactic.hit ? ' <span class="green">✓ 作戦が噛み合っている（全局面 +0.8）</span>' : ` <span class="gold">現在: ${TL.PLANS[y.tactic.plan].label}</span>`}<div class="tiny muted">${esc(y.tactic.why)}</div></div>` : ""}
      <div class="grid2"><div><h3>実況</h3><div id="v-feed" class="feed"></div></div><div><h3>スタッツ</h3><table class="small" id="v-stats"></table></div></div>
      <div class="row" style="margin-top:10px;justify-content:flex-end"><button id="v-done" class="primary" disabled>続ける</button></div></div>`;
    document.body.appendChild(bg);
    const $ = (id) => bg.querySelector("#" + id);
    if (![900, 450, 120].includes(speed)) speed = speed <= 100 ? 120 : speed >= 700 ? 900 : 450;
    const feed = [];
    let feedSeen = 0;
    const recent = [];
    const ball = $("v-ball");
    // Rally animation (rAF). Builds the point as a list of flights: serve into the service box,
    // then baseline exchanges; players slide toward where the ball will land, the ball follows an
    // arc (drawn as a shadow on the ground plus a lifted ball), and the last flight shows the
    // outcome: a winner passes the mover, an error dies in the net or sails long, an ace is unreturned.
    const pa = $("v-pa"), pb = $("v-pb"), shadow = $("v-shadow"), hitA = $("v-hitA"), hitB = $("v-hitB");
    const pos = [{ x: 22, y: 55 }, { x: 178, y: 55 }];
    let raf = null;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const lerp = (a, b, t) => a + (b - a) * t;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    function buildFlights(ev) {
      const sv = ev.server, rt = 1 - sv, dir = sv === 0 ? 1 : -1;
      const hops = Math.max(1, ev.rally || 1);
      const deuce = (m.pts[0] + m.pts[1]) % 2 === 0;
      const F = [];
      // serve
      const sy = deuce ? 62 : 48;
      const from = { x: sv === 0 ? 14 : 186, y: sy };
      pos[sv] = { x: from.x, y: from.y }; pos[rt] = { x: rt === 0 ? 20 : 180, y: deuce ? 44 : 66 };
      const box = { x: sv === 0 ? rnd(108, 144) : rnd(56, 92), y: deuce ? rnd(26, 52) : rnd(58, 86) };
      if (ev.kind === "double_fault") { F.push({ from, to: { x: 100 - dir * 2, y: box.y }, hitter: sv, mover: rt, moverTo: { x: pos[rt].x, y: pos[rt].y }, h: 0.5, result: "net" }); return F; }
      if (ev.kind === "ace") { F.push({ from, to: box, hitter: sv, mover: rt, moverTo: { x: pos[rt].x, y: lerp(pos[rt].y, box.y, 0.25) }, h: 1, result: "pass", through: { x: Math.max(3, Math.min(197, box.x + dir * 50)), y: Math.max(4, Math.min(106, box.y + (box.y - 55) * 0.4)) } }); return F; }
      F.push({ from, to: box, hitter: sv, mover: rt, moverTo: { x: rt === 0 ? rnd(16, 26) : rnd(174, 184), y: box.y + rnd(-4, 4) }, h: 1 });
      let hitter = rt, cur = box;
      for (let i = 1; i < hops; i++) {
        const last = i === hops - 1;
        const who = hitter, other = 1 - hitter, d = who === 0 ? 1 : -1;
        let to = { x: who === 0 ? rnd(150, 184) : rnd(16, 50), y: rnd(24, 86) };
        let f = { from: { x: pos[who].x + (cur.x - pos[who].x) * 0.3, y: cur.y }, to, hitter: who, mover: other, moverTo: null, h: rnd(0.6, 1.2) };
        if (last) {
          if (ev.kind === "winner" || ev.kind === "serve_winner" || ev.kind === "return_winner") {
            // the winner lands where the mover is not: aim for the far corner and let them arrive late
            to.y = pos[other].y > 55 ? rnd(22, 34) : rnd(76, 88);
            f.result = "pass"; f.through = { x: Math.max(3, Math.min(197, to.x + d * 30)), y: Math.max(4, Math.min(106, to.y + (to.y - 55) * 0.3)) }; f.moverTo = { x: pos[other].x, y: lerp(pos[other].y, to.y, 0.45) };
          } else if (ev.kind === "error") {
            const net = Math.random() < 0.45;
            if (net) { f.to = { x: 100 - d * 2, y: to.y }; f.h = 0.4; f.result = "net"; }
            else { f.to = { x: who === 0 ? rnd(192, 198) : rnd(2, 8), y: Math.random() < 0.5 ? rnd(4, 16) : rnd(94, 106) }; f.result = "out"; }
            f.moverTo = { x: pos[other].x, y: lerp(pos[other].y, to.y, 0.5) };
          }
        }
        if (!f.moverTo) f.moverTo = { x: other === 0 ? rnd(16, 28) : rnd(172, 184), y: to.y + rnd(-5, 5) };
        F.push(f); cur = f.to; hitter = other;
      }
      if (hops === 1 && ev.kind !== "ace") F[0].result = ev.winner === sv ? "pass" : "net";
      return F;
    }
    function place(i) { const el = i === 0 ? pa : pb; el.setAttribute("cx", pos[i].x.toFixed(1)); el.setAttribute("cy", pos[i].y.toFixed(1)); }
    function setBall(x, y, lift) {
      shadow.setAttribute("cx", x.toFixed(1)); shadow.setAttribute("cy", y.toFixed(1));
      ball.setAttribute("cx", x.toFixed(1)); ball.setAttribute("cy", (y - lift * 7).toFixed(1)); ball.setAttribute("r", (2.6 + lift * 1.2).toFixed(2));
    }
    function pulse(i) { const el = i === 0 ? hitA : hitB; el.setAttribute("cx", pos[i].x.toFixed(1)); el.setAttribute("cy", pos[i].y.toFixed(1)); el.classList.remove("on"); void el.getBBox(); el.classList.add("on"); }
    function animate(ev) {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      const kb = KIND_BADGE[ev.kind];
      $("v-kind").innerHTML = (kb ? `<span class="${kb[1]}">${kb[0]}</span>${ev.rally >= 3 ? ` <span class="muted">${ev.rally}打</span>` : ""}` : "") + (ev.kmh ? ` <span class="kmh">${ev.first ? "1st" : "2nd"} ${ev.kmh} km/h</span>` : "");
      $("v-kind").className = "kind " + (ev.winner === hi ? "me" : "op");
      const F = buildFlights(ev);
      ball.classList.remove("dead");
      if (U.reducedMotion && U.reducedMotion()) { const f = F[F.length - 1]; setBall(f.to.x, f.to.y, 0); place(0); place(1); return; }
      const total = Math.max(240, Math.min(speed * 0.9, 1500));
      const per = Math.max(110, total / F.length);
      let i = 0, t0 = null, moverFrom = null;
      pulse(F[0].hitter);
      const frame = (ts) => {
        if (t0 === null) { t0 = ts; moverFrom = { x: pos[F[0].mover].x, y: pos[F[0].mover].y }; }
        const f = F[i];
        const dur = per * (f.through ? 1.15 : 1);
        let t = Math.min(1, (ts - t0) / dur);
        const to = f.through && t > 0.75 ? f.through : f.to;
        // ball: linear in the plane with a parabolic lift; a passing shot keeps travelling past the mover
        const bt = f.through ? Math.min(1, t / 0.75) : t;
        const bx = lerp(f.from.x, f.to.x, bt), by = lerp(f.from.y, f.to.y, bt);
        if (f.through && t > 0.75) { const u = (t - 0.75) / 0.25; setBall(lerp(f.to.x, f.through.x, u), lerp(f.to.y, f.through.y, u), 0.15 * (1 - u)); }
        else setBall(bx, by, f.h * 4 * bt * (1 - bt));
        // mover slides toward the landing spot (late on a winner, because moverTo stops short)
        const mt = ease(Math.min(1, t * (f.result === "pass" ? 0.9 : 1.15)));
        pos[f.mover] = { x: lerp(moverFrom.x, f.moverTo.x, mt), y: lerp(moverFrom.y, f.moverTo.y, mt) };
        place(f.mover);
        if (t >= 1) {
          if (f.result === "net" || f.result === "out") ball.classList.add("dead");
          i++;
          if (i >= F.length) { raf = null; return; }
          t0 = ts; moverFrom = { x: pos[F[i].mover].x, y: pos[F[i].mover].y };
          pulse(F[i].hitter);
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
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
      if (m.done) banner = `<b class="${m.winnerIdx === hi ? "green" : "red"}" style="font-size:15px">${m.winnerIdx === hi ? "勝利" : "敗戦"}</b> ${esc(m.result.score)} <span class="muted small">試合時間 ${U.minutesText(m.result.minutes)}</span>`;
      else if (m.betweenSets) banner = `<b class="gold">セット間</b>（セット ${m.setsWon[hi]}-${m.setsWon[1 - hi]}）`;
      else if (sit.matchPoint >= 0) banner = `<b class="${sit.matchPoint === hi ? "green" : "red"}">マッチポイント ${sit.matchPoint === hi ? "自分" : "相手"}</b>`;
      else if (sit.setPoint >= 0) banner = `<b class="gold">セットポイント ${sit.setPoint === hi ? "自分" : "相手"}</b>`;
      else if (sit.bp) banner = `<b class="${m.server === hi ? "red" : "green"}">ブレークポイント ${m.server === hi ? "相手" : "自分"}</b>`;
      else if (m.tb) banner = "タイブレーク";
      $("v-banner").innerHTML = banner;
      const st = m.stats;
      const row = (l, a, b) => `<tr><td class="muted">${l}</td><td class="num"><b>${a}</b></td><td class="num">${b}</td></tr>`;
      $("v-stats").innerHTML = `<tr><th></th><th class="num">自分</th><th class="num">相手</th></tr>${U.matchStatsRows(st, hi, TL.PLANS[m.plans[hi]].label, TL.PLANS[m.plans[1 - hi]].label)}`;
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
    $("v-done").onclick = () => { stop(); if (raf) cancelAnimationFrame(raf); if (!m.done) m.finish(); bg.remove(); done(); };
    board();
    // v2.21: a big final opens on a title card instead of the first point
    if (y.stakes) {
      const st = y.stakes, opp = y.a.isHuman ? y.b : y.a;
      const card = document.createElement("div");
      card.className = "hype" + (st.big ? " big" : "");
      card.innerHTML = `<div class="hype-in"><div class="hk">${esc(T.name)}</div><div class="ht">${esc(st.title)}</div>
        <div class="hvs"><div class="hp me">${U.avatar(me)}<div class="hn">${esc(me.name)}</div><div class="hr">${me.rank ? me.rank + "位" : "ランク外"}</div></div><div class="hv">VS</div><div class="hp op">${U.avatar(opp)}<div class="hn">${esc(opp.name)}</div><div class="hr">${opp.rank ? opp.rank + "位" : "ランク外"}</div></div></div>
        <div class="hl">${st.lines.map((l) => `<div>${esc(l)}</div>`).join("")}<div class="muted">${esc(st.rec)}</div></div>
        <button class="primary bigbtn" id="v-hype-go">試合開始</button></div>`;
      bg.querySelector(".modal.viewer").appendChild(card);
      if (U.sfx) U.sfx("hype");
      card.querySelector("#v-hype-go").onclick = () => { card.classList.add("out"); setTimeout(() => card.remove(), 350); start(); };
    } else start();
  };
})();
