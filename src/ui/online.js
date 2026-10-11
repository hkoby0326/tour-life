// v2.27: real-time online match. The server runs the engine and ticks one point at a time; this
// client replays the identical deterministic engine from the same seed, so scores always agree.
(function () {
  const U = TL.UI, W = TL.World, D = TL.DATA;
  const O = (U.online = { ws: null, url: "", status: "idle", code: null, you: -1, host: false, players: [null, null], nicks: ["", ""], opts: null, error: null, ctl: null, match: null, speed: 450, planned: [false, false], result: null, emotes: [] });
  const SURF = { hard: "ハード", clay: "クレー", grass: "芝", indoor: "インドア" };
  // the player as the engine sees them, nothing hidden the other side could exploit beyond the match itself
  U.onlineSnapshot = function () {
    const S = U.S, me = U.human(); const traits = {}; for (const t of W.traitList(S)) traits[t] = W.traitLevel(S, t);
    return { name: me.name, country: me.country, height: me.height || W.HEIGHT_BASE, style: me.style, attrs: Object.assign({}, me.attrs), surf: Object.assign({}, me.surf), traits, fatigue: 0, sharp: me.sharp === undefined ? 65 : me.sharp, rank: me.rank || null, overall: Math.round(TL.overall(me) * 10) / 10 };
  };
  function send(msg) { if (O.ws && O.ws.readyState === 1) O.ws.send(JSON.stringify(msg)); }
  function connect(url, then) {
    if (O.ws && O.ws.readyState === 1 && O.url === url) return then();
    try { if (O.ws) O.ws.close(); } catch (e) {}
    O.url = url; O.status = "connecting"; O.error = null; U.render();
    let ws;
    try { ws = new WebSocket(url); } catch (e) { O.status = "idle"; O.error = "URL が不正: " + e.message; U.render(); return; }
    O.ws = ws;
    ws.onopen = () => { O.status = "connected"; then(); };
    ws.onclose = () => { if (O.ws === ws) { O.ws = null; if (O.status !== "playing") { O.status = "idle"; O.code = null; } else O.error = "接続が切れた"; U.render(); } };
    ws.onerror = () => { O.error = "接続できない（URL、サーバーの起動、wss/ws を確認）"; };
    ws.onmessage = (e) => { let msg; try { msg = JSON.parse(e.data); } catch (x) { return; } handle(msg); };
  }
  function handle(msg) {
    switch (msg.t) {
      case "hello": if (msg.v && msg.v !== U.VERSION) { O.error = `サーバーのバージョンが違う（サーバー ${msg.v} / この画面 ${U.VERSION}）。試合がずれる可能性があるので、どちらかを更新してください`; U.render(); } break;
      case "room": O.code = msg.code; O.you = msg.you; O.host = msg.you === 0; O.status = "lobby"; U.render(); break;
      case "lobby": O.players = msg.players; O.opts = msg.opts; O.host = msg.host; if (O.status !== "playing") O.status = "lobby"; U.render(); break;
      case "error": O.error = msg.msg; U.render(); break;
      case "closed": O.status = O.ws ? "connected" : "idle"; O.code = null; O.error = `部屋が閉じた: ${msg.why}`; if (O.ctl) O.ctl.abort(msg.why); O.ctl = null; U.render(); break;
      case "speed": O.speed = msg.ms; break;
      case "start": startMatch(msg); break;
      case "you": O.you = msg.idx; break;
      case "tick": if (O.ctl) O.ctl.step(msg.n); break;
      case "break": O.planned = [false, false]; if (O.ctl) O.ctl.breakNotice(msg.secs); break;
      case "planned": O.planned[msg.idx] = true; if (O.ctl) O.ctl.planned(msg.idx); break;
      case "plans": if (O.ctl) O.ctl.applyPlans(msg.plans); break;
      case "end": finishMatch(msg); break;
      case "emote": if (O.ctl) O.ctl.emote(msg.idx, msg.e); break;
    }
  }
  function startMatch(msg) {
    const S = U.S; O.status = "playing"; O.opts = msg.opts; O.nicks = msg.nicks; O.speed = msg.speed || 450; O.result = null;
    const mine = O.you, ps = msg.players.map((p, i) => Object.assign({}, p, { isHuman: i === mine, id: -100 - i }));
    const rng = new TL.RNG(msg.seed);
    const m = TL.Match.create(ps[0], ps[1], { rng, surface: msg.opts.surface, bo5: !!msg.opts.bo5, log: true, plans: ["balanced", "balanced"], traits: [ps[0].traits || {}, ps[1].traits || {}], tctx: { bigStage: false, home: [false, false], underdog: [false, false] } });
    O.match = m;
    const T = { id: "online", tid: "online", name: `オンライン対戦 ・ ${msg.nicks[1 - mine]}`, cat: "EXH", def: { short: "EXH", tier: 0, bo5: !!msg.opts.bo5, label: "オンライン対戦" }, surface: msg.opts.surface, country: ps[1 - mine].country };
    U.modal = null; U.modalClass = null; U.renderModal(); U.render();
    U.showMatchViewer({ type: "match", match: m, T, round: `エキシビション（${msg.opts.bo5 ? "5セット" : "3セット"}）`, a: ps[0], b: ps[1], tactic: null, stakes: null, online: { you: mine, sendPlan: (k) => send({ t: "plan", plan: k }), emote: (e) => send({ t: "emote", e }), attach: (ctl) => { O.ctl = ctl; } } }, () => { O.ctl = null; if (O.status === "playing") O.status = "lobby"; U.tab = "online"; U.render(); });
  }
  function finishMatch(msg) {
    const S = U.S, m = O.match; if (!m) return;
    if (!m.done) { /* should not happen: the server's last tick finished it; keep local state */ }
    const won = msg.winnerIdx === O.you;
    O.result = { score: msg.score, won, opp: O.nicks[1 - O.you], oppName: O.players[1 - O.you] && O.players[1 - O.you].player ? O.players[1 - O.you].player.name : "", surface: O.opts.surface, bo5: !!O.opts.bo5 };
    S.history.online = S.history.online || [];
    S.history.online.push({ date: new Date().toISOString().slice(0, 10), year: S.year, week: S.week, opp: O.result.opp, oppName: O.result.oppName, won, score: msg.score, surface: O.opts.surface, bo5: !!O.opts.bo5, mine: U.human().name });
    U.save();
    O.status = "done";
    if (O.ctl) O.ctl.ended(won, msg.score);
  }
  // ---------- screen ----------
  U.screens.online = function (c) {
    const S = U.S, me = U.human(), { esc, flag } = U;
    const url = U.settings.onlineUrl || "", nick = U.settings.onlineNick || me.name;
    const hist = (S.history.online || []).slice().reverse();
    const histHtml = `<div class="panel"><h2>対戦の記録 <span class="muted small">${hist.length}試合 ・ ${hist.filter((h) => h.won).length}勝</span></h2>${hist.length ? hist.slice(0, 30).map((h) => `<div class="match ${h.won ? "win" : "loss"} small"><span class="muted">${esc(h.date)}</span> vs <b>${esc(h.opp)}</b>${h.oppName && h.oppName !== h.opp ? `（${esc(h.oppName)}）` : ""} <span class="pill ${h.surface}">${SURF[h.surface] || h.surface}</span> <span class="score ${h.won ? "green" : "red"}">${h.won ? "W" : "L"} ${esc(h.score)}</span></div>`).join("") : '<div class="empty">まだ対戦していない。</div>'}</div>`;
    const snap = U.onlineSnapshot();
    const meCard = `<div class="card"><div class="row between"><div class="identity">${U.avatar(me)}<div><div class="name">${esc(me.name)}</div><div class="sub">${me.rank ? me.rank + "位" : "ランク外"} ・ 総合 ${snap.overall} ・ ${W.STYLE_LABEL[me.style] || me.style} ・ ${snap.height}cm</div></div></div><span class="small muted">この時点の能力で戦う</span></div></div>`;
    let main = "";
    if (O.status === "idle" || O.status === "connecting" || O.status === "connected") {
      main = `<div class="panel"><h2>オンライン対戦 ${U.helpTo("online")}</h2>
        ${O.error ? `<p class="small red">${esc(O.error)}</p>` : ""}
        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end"><label class="small">サーバー URL <input data-ourl value="${esc(url)}" placeholder="wss://xxx.onrender.com/ws" style="width:260px"></label><label class="small">ニックネーム <input data-onick value="${esc(nick)}" maxlength="16" style="width:140px"></label></div>
        <p class="tiny muted" style="margin:6px 0 10px">サーバーは <code>server/server.js</code>（依存なし、Node）。ローカルなら <code>node server/server.js</code> を起動して <code>ws://localhost:8787/ws</code>。状態: ${O.status === "connected" ? '<span class="green">接続中</span>' : O.status === "connecting" ? "接続しています…" : "未接続"}</p>
        ${meCard}
        <div class="grid2" style="margin-top:10px"><div class="card"><h3>部屋を作る</h3><div class="row" style="gap:10px;flex-wrap:wrap"><label class="small">コート <select data-osurf>${Object.entries(SURF).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label><label class="small">セット <select data-obo5><option value="0">3セットマッチ</option><option value="1">5セットマッチ</option></select></label></div><button class="primary" data-ocreate style="margin-top:8px" ${O.status === "connecting" ? "disabled" : ""}>部屋を作る</button></div>
        <div class="card"><h3>コードで参加</h3><div class="row" style="gap:10px"><input data-ocode placeholder="例: K7Q2M" maxlength="5" style="width:120px;text-transform:uppercase;font-weight:800;letter-spacing:.1em"><button class="primary" data-ojoin ${O.status === "connecting" ? "disabled" : ""}>参加する</button></div><p class="tiny muted" style="margin-top:6px">相手が作った5文字のコードを入れる</p></div></div></div>`;
    } else if (O.status === "lobby" || O.status === "done") {
      const ps = O.players || [null, null];
      const pc = (p, i) => p ? `<div class="card"><div class="identity"><span class="avatar">${esc(p.nick.slice(0, 1))}</span><div><div class="name">${esc(p.nick)} ${i === O.you ? '<span class="pill">自分</span>' : ""}${i === 0 ? '<span class="pill gold">ホスト</span>' : ""}</div><div class="sub">${p.player ? `${flag(p.player.country)} ${esc(p.player.name)} ・ ${p.player.rank ? p.player.rank + "位" : "ランク外"} ・ 総合 ${p.player.overall || "-"} ・ ${W.STYLE_LABEL[p.player.style] || p.player.style || ""}` : ""}</div></div></div></div>` : '<div class="card"><div class="empty">相手を待っている…</div></div>';
      main = `<div class="panel"><div class="row between"><h2>部屋 <span class="code">${esc(O.code || "")}</span></h2><button class="small" data-oleave>退室</button></div>
        ${O.error ? `<p class="small red">${esc(O.error)}</p>` : ""}
        ${O.result ? `<div class="card" style="border-color:${O.result.won ? "var(--green)" : "var(--red)"}"><b class="${O.result.won ? "green" : "red"}" style="font-size:18px">${O.result.won ? "勝利" : "敗戦"}</b> ${esc(O.result.score)} <span class="muted small">vs ${esc(O.result.opp)}</span></div>` : ""}
        <p class="small muted">このコードを相手に送る。2人そろったらホストが開始。試合はサーバーが進め、セット間に20秒でプランを選べる。</p>
        <div class="grid2">${pc(ps[0], 0)}${pc(ps[1], 1)}</div>
        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
          ${O.host ? `<label class="small">コート <select data-osurf2>${Object.entries(SURF).map(([k, l]) => `<option value="${k}" ${O.opts && O.opts.surface === k ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="small">セット <select data-obo52><option value="0" ${O.opts && !O.opts.bo5 ? "selected" : ""}>3セット</option><option value="1" ${O.opts && O.opts.bo5 ? "selected" : ""}>5セット</option></select></label><label class="small">速度 <select data-ospeed><option value="900">ゆっくり</option><option value="450" selected>普通</option><option value="200">速い</option></select></label><button class="primary bigbtn" data-ostart ${ps[0] && ps[1] ? "" : "disabled"}>${O.status === "done" ? "もう一度" : "試合開始"}</button>` : `<span class="small muted">${O.opts ? `${SURF[O.opts.surface]} ・ ${O.opts.bo5 ? "5セット" : "3セット"} ・ ` : ""}ホストの開始を待っている</span>`}
        </div></div>`;
    } else if (O.status === "playing") {
      main = `<div class="panel"><h2>試合中</h2><p class="small muted">観戦画面が閉じている場合は、相手の接続が切れたか部屋が閉じた。</p><button data-oleave>退室</button></div>`;
    }
    c.innerHTML = main + histHtml;
    const q = (s) => c.querySelector(s);
    const saveInputs = () => { const u = q("[data-ourl]"), n = q("[data-onick]"); if (u) U.settings.onlineUrl = u.value.trim(); if (n) U.settings.onlineNick = n.value.trim(); U.saveSettings(); };
    const cr = q("[data-ocreate]"); if (cr) cr.onclick = () => { saveInputs(); const u = U.settings.onlineUrl; if (!u) { O.error = "サーバー URL を入れてください"; U.render(); return; } const opts = { surface: q("[data-osurf]").value, bo5: q("[data-obo5]").value === "1" }; connect(u, () => send({ t: "create", nick: U.settings.onlineNick || me.name, player: U.onlineSnapshot(), opts })); };
    const jn = q("[data-ojoin]"); if (jn) jn.onclick = () => { saveInputs(); const u = U.settings.onlineUrl, code = (q("[data-ocode]").value || "").toUpperCase().trim(); if (!u) { O.error = "サーバー URL を入れてください"; U.render(); return; } if (code.length !== 5) { O.error = "コードは5文字"; U.render(); return; } connect(u, () => send({ t: "join", code, nick: U.settings.onlineNick || me.name, player: U.onlineSnapshot() })); };
    const lv = q("[data-oleave]"); if (lv) lv.onclick = () => { send({ t: "leave" }); O.status = O.ws ? "connected" : "idle"; O.code = null; O.result = null; O.error = null; U.render(); };
    const st = q("[data-ostart]"); if (st) st.onclick = () => { if (O.status === "done") { send({ t: "again" }); O.result = null; } send({ t: "speed", ms: parseInt(q("[data-ospeed]").value, 10) }); send({ t: "start" }); };
    const s2 = q("[data-osurf2]"); if (s2) s2.onchange = () => send({ t: "opts", surface: s2.value });
    const b2 = q("[data-obo52]"); if (b2) b2.onchange = () => send({ t: "opts", bo5: b2.value === "1" });
    const sp = q("[data-ospeed]"); if (sp) sp.onchange = () => send({ t: "speed", ms: parseInt(sp.value, 10) });
  };
})();
