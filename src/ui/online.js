// v2.28: account (ID/password), cloud save and real-time online match. The server keeps the save;
// matches use the player taken from that save, never from what this client claims. The engine runs on
// the server and ticks one point at a time; this client replays the same deterministic engine.
(function () {
  const U = TL.UI, W = TL.World, D = TL.DATA;
  const O = (U.online = { ws: null, status: "idle", authed: false, code: null, you: -1, host: false, players: [null, null], nicks: ["", ""], opts: null, error: null, notice: null, ctl: null, match: null, speed: 450, planned: [false, false], result: null, me: null, serverMatches: null, busy: false });
  const SURF = { hard: "ハード", clay: "クレー", grass: "芝", indoor: "インドア" };
  // ---------- server address ----------
  U.serverBase = () => { let u = (U.settings.serverUrl || "").trim(); if (!u && U.settings.onlineUrl) u = U.settings.onlineUrl.replace(/^ws/, "http").replace(/\/ws\/?$/, ""); return u.replace(/\/+$/, ""); };
  const wsUrl = () => U.serverBase().replace(/^http/, "ws") + "/ws";
  const token = () => (U.settings.account && U.settings.account.token) || null;
  // ---------- http ----------
  async function api(path, opt) {
    opt = opt || {};
    const headers = Object.assign({}, opt.headers || {}); if (token()) headers.authorization = "Bearer " + token();
    if (opt.json !== undefined) { headers["content-type"] = "application/json"; opt.body = JSON.stringify(opt.json); }
    let r; try { r = await fetch(U.serverBase() + path, { method: opt.method || (opt.body ? "POST" : "GET"), headers, body: opt.body }); } catch (e) { throw new Error("サーバーに接続できない（URL とサーバーの起動を確認）"); }
    if (opt.raw) { if (!r.ok) { let e = {}; try { e = await r.json(); } catch (x) {} throw new Error(e.error || `HTTP ${r.status}`); } return r; }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { if (data.code === "auth") { U.settings.account = null; U.saveSettings(); O.authed = false; } throw new Error(data.error || `HTTP ${r.status}`); }
    return data;
  }
  U.api = api;
  // ---------- account ----------
  U.loggedIn = () => !!(U.settings.account && U.settings.account.token);
  async function register(id, pass) { const r = await api("/api/register", { json: { id, pass } }); U.settings.account = { id: r.id, token: r.token }; U.saveSettings(); return r.recovery; }
  async function login(id, pass) { const r = await api("/api/login", { json: { id, pass } }); U.settings.account = { id: r.id, token: r.token }; U.saveSettings(); }
  async function logout() { try { await api("/api/logout", { method: "POST", body: "" }); } catch (e) {} U.settings.account = null; U.saveSettings(); O.me = null; O.authed = false; disconnect(); }
  async function recover(id, recovery, pass) { const r = await api("/api/recover", { json: { id, recovery, pass } }); U.settings.account = { id: r.id, token: r.token }; U.saveSettings(); return r.recovery; }
  // ---------- cloud save ----------
  async function gzip(str) { if (typeof CompressionStream === "undefined") return new Blob([str]); const cs = new CompressionStream("gzip"); const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close(); return new Response(cs.readable).blob(); }
  async function gunzip(buf) { if (typeof DecompressionStream === "undefined") throw new Error("このブラウザは gzip 展開に対応していない"); const ds = new DecompressionStream("gzip"); const w = ds.writable.getWriter(); w.write(buf); w.close(); return new Response(ds.readable).text(); }
  U.cloudSave = async function (quiet) {
    if (!U.loggedIn() || !U.S) return null;
    const body = await gzip(W.serialize(U.S));
    const r = await api("/api/save", { method: "PUT", body, headers: { "content-type": "application/octet-stream" } });
    O.me = O.me || {}; O.me.save = { updated: r.updated, summary: r.summary };
    if (!quiet) U.toast(`クラウドに保存した（${Math.round(r.bytes / 1024)}KB）`, "green");
    return r;
  };
  U.cloudLoad = async function () {
    const r = await api("/api/save", { raw: true });
    const text = await gunzip(await r.arrayBuffer());
    const S = W.deserialize(text); U.S = S; U.applyNames(); U.save(); U.runLog = null; U.planSel = null;
    U.toast("クラウドセーブを読み込んだ", "green"); U.tab = "home"; U.render();
  };
  async function refreshMe() { if (!U.loggedIn()) { O.me = null; return; } try { O.me = await api("/api/me"); } catch (e) { O.me = null; O.error = e.message; } }
  // season-end auto save (called from finishRun)
  U.cloudAutoSave = () => { if (U.settings.cloudAutoSave !== false && U.loggedIn()) U.cloudSave(true).catch(() => U.toast("クラウド保存に失敗（オフライン？）", "red")); };
  // ---------- websocket ----------
  function send(msg) { if (O.ws && O.ws.readyState === 1) O.ws.send(JSON.stringify(msg)); }
  function disconnect() { try { if (O.ws) O.ws.close(); } catch (e) {} O.ws = null; O.status = "idle"; O.code = null; O.authed = false; }
  function connect(then) {
    if (O.ws && O.ws.readyState === 1 && O.authed) return then();
    disconnect(); O.status = "connecting"; O.error = null; U.render();
    let ws; try { ws = new WebSocket(wsUrl()); } catch (e) { O.status = "idle"; O.error = "URL が不正: " + e.message; U.render(); return; }
    O.ws = ws; O.pending = then;
    ws.onopen = () => { send({ t: "auth", token: token() }); };
    ws.onclose = () => { if (O.ws === ws) { O.ws = null; O.authed = false; if (O.status !== "playing") { O.status = "idle"; O.code = null; } else O.error = "接続が切れた"; U.render(); } };
    ws.onerror = () => { O.error = "接続できない（URL、サーバーの起動、wss/ws を確認）"; };
    ws.onmessage = (e) => { let msg; try { msg = JSON.parse(e.data); } catch (x) { return; } handle(msg); };
  }
  function handle(msg) {
    switch (msg.t) {
      case "hello": if (msg.v && msg.v !== U.VERSION) { O.error = `サーバーのバージョンが違う（サーバー ${msg.v} / この画面 ${U.VERSION}）。試合がずれる可能性があるので、どちらかを更新してください`; U.render(); } break;
      case "authed": O.authed = true; O.status = "connected"; if (O.pending) { const f = O.pending; O.pending = null; f(); } U.render(); break;
      case "room": O.code = msg.code; O.you = msg.you; O.host = msg.you === 0; O.status = "lobby"; U.render(); break;
      case "lobby": O.players = msg.players; O.opts = msg.opts; O.host = msg.host; if (O.status !== "playing") O.status = "lobby"; U.render(); break;
      case "error": O.error = msg.msg; if (msg.code === "auth") { U.settings.account = null; U.saveSettings(); disconnect(); } U.render(); break;
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
    O.status = "playing"; O.opts = msg.opts; O.nicks = msg.nicks; O.speed = msg.speed || 450; O.result = null;
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
    const won = msg.winnerIdx === O.you;
    O.result = { score: msg.score, won, opp: O.nicks[1 - O.you], surface: O.opts.surface, bo5: !!O.opts.bo5 };
    S.history.online = S.history.online || [];
    S.history.online.push({ date: new Date().toISOString().slice(0, 10), year: S.year, week: S.week, opp: O.result.opp, won, score: msg.score, surface: O.opts.surface, bo5: !!O.opts.bo5, mine: U.human().name });
    U.save(); O.status = "done"; O.serverMatches = null;
    if (O.ctl) O.ctl.ended(won, msg.score);
  }
  // ---------- screen ----------
  const fmtDate = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  U.screens.online = function (c) {
    const S = U.S, me = U.human(), { esc, flag } = U;
    const base = U.serverBase(), acc = U.settings.account;
    const hist = (S.history.online || []).slice().reverse();
    const histHtml = `<div class="panel"><h2>対戦の記録 <span class="muted small">${hist.length}試合 ・ ${hist.filter((h) => h.won).length}勝</span></h2>${hist.length ? hist.slice(0, 30).map((h) => `<div class="match ${h.won ? "win" : "loss"} small"><span class="muted">${esc(h.date)}</span> vs <b>${esc(h.opp)}</b> <span class="pill ${h.surface}">${SURF[h.surface] || h.surface}</span> <span class="score ${h.won ? "green" : "red"}">${h.won ? "W" : "L"} ${esc(h.score)}</span></div>`).join("") : '<div class="empty">まだ対戦していない。</div>'}</div>`;
    const serverRow = `<div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end"><label class="small">サーバー URL <input data-ourl value="${esc(base)}" placeholder="https://xxx.example.com" style="width:260px" ${acc ? "disabled" : ""}></label>${acc ? `<span class="small">ログイン中: <b>${esc(acc.id)}</b> <button class="small" data-ologout>ログアウト</button></span>` : ""}</div>`;
    let main = "";
    if (!acc) {
      main = `<div class="panel"><h2>オンライン ${U.helpTo("online")}</h2>${O.error ? `<p class="small red">${esc(O.error)}</p>` : ""}${O.notice ? `<p class="small green">${esc(O.notice)}</p>` : ""}${serverRow}
        <p class="tiny muted" style="margin:6px 0 10px">サーバーは <code>server/server.js</code>（依存なし、Node 22）。ローカルなら <code>node server/server.js</code> を起動して <code>http://localhost:8787</code>。</p>
        <div class="grid2"><div class="card"><h3>ログイン</h3><div class="row" style="gap:8px;flex-wrap:wrap"><input data-lid placeholder="ID" maxlength="16" style="width:140px" autocomplete="username"><input data-lpass type="password" placeholder="パスワード" style="width:160px" autocomplete="current-password"><button class="primary" data-login ${O.busy ? "disabled" : ""}>ログイン</button></div><p class="tiny muted" style="margin-top:6px"><a href="#" data-recover-open class="accent">パスワードを忘れた（復旧コードで再設定）</a></p></div>
        <div class="card"><h3>新規登録</h3><div class="row" style="gap:8px;flex-wrap:wrap"><input data-rid placeholder="ID（英数字 3〜16）" maxlength="16" style="width:160px" autocomplete="username"><input data-rpass type="password" placeholder="パスワード（8文字以上）" style="width:180px" autocomplete="new-password"><button class="primary" data-register ${O.busy ? "disabled" : ""}>登録</button></div><p class="tiny muted" style="margin-top:6px">メールは使わない。登録時に出る「復旧コード」がパスワードを忘れたときの唯一の手段。</p></div></div></div>`;
    } else {
      const sv = O.me && O.me.save;
      const cloud = `<div class="panel"><h2>クラウドセーブ</h2><div class="row between" style="flex-wrap:wrap;gap:8px"><div class="small">${sv ? `サーバー上: <b>${esc(sv.summary.name)}</b> ${sv.summary.rank ? sv.summary.rank + "位" : "ランク外"} ・ ${U.cal(sv.summary.year)}年 第${sv.summary.week}週 ・ 総合 ${sv.summary.overall} ・ <span class="muted">${fmtDate(sv.updated)} 保存</span>` : O.me ? '<span class="muted">まだ保存していない</span>' : '<span class="muted">確認中…</span>'}</div><div class="row" style="gap:8px"><button class="primary small" data-csave ${O.busy ? "disabled" : ""}>いま保存</button><button class="small" data-cload ${sv && !O.busy ? "" : "disabled"}>サーバーから読み込む</button></div></div>
        <label class="small" style="display:flex;gap:8px;align-items:center;margin-top:8px"><input type="checkbox" style="width:auto;margin:0" data-cauto ${U.settings.cloudAutoSave !== false ? "checked" : ""}> シーズン末に自動で保存する</label>
        <p class="tiny muted" style="margin-top:4px">対戦は、サーバーに保存された選手で行う（部屋を作る／参加の前に自動で保存する）。「読み込む」はこの端末のセーブを上書きする。</p></div>`;
      const snap = { overall: Math.round(TL.overall(me) * 10) / 10, height: me.height || W.HEIGHT_BASE };
      const meCard = `<div class="card"><div class="row between"><div class="identity">${U.avatar(me)}<div><div class="name">${esc(me.name)}</div><div class="sub">${me.rank ? me.rank + "位" : "ランク外"} ・ 総合 ${snap.overall} ・ ${W.STYLE_LABEL[me.style] || me.style} ・ ${snap.height}cm</div></div></div><span class="small muted">この時点の能力で戦う</span></div></div>`;
      let room = "";
      if (O.status === "idle" || O.status === "connecting" || O.status === "connected") {
        room = `<div class="panel"><h2>対戦 ${U.helpTo("online")}</h2>${meCard}
          <div class="grid2" style="margin-top:10px"><div class="card"><h3>部屋を作る</h3><div class="row" style="gap:10px;flex-wrap:wrap"><label class="small">コート <select data-osurf>${Object.entries(SURF).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label><label class="small">セット <select data-obo5><option value="0">3セットマッチ</option><option value="1">5セットマッチ</option></select></label></div><button class="primary" data-ocreate style="margin-top:8px" ${O.status === "connecting" || O.busy ? "disabled" : ""}>部屋を作る</button></div>
          <div class="card"><h3>コードで参加</h3><div class="row" style="gap:10px"><input data-ocode placeholder="例: K7Q2M" maxlength="5" style="width:120px;text-transform:uppercase;font-weight:800;letter-spacing:.1em"><button class="primary" data-ojoin ${O.status === "connecting" || O.busy ? "disabled" : ""}>参加する</button></div><p class="tiny muted" style="margin-top:6px">相手が作った5文字のコードを入れる</p></div></div>
          <p class="tiny muted" style="margin-top:8px">状態: ${O.status === "connected" ? '<span class="green">接続中</span>' : O.status === "connecting" ? "接続しています…" : "未接続（部屋を作る／参加で接続する）"}</p></div>`;
      } else if (O.status === "lobby" || O.status === "done") {
        const ps = O.players || [null, null];
        const pc = (p, i) => p ? `<div class="card"><div class="identity"><span class="avatar">${esc(p.nick.slice(0, 1).toUpperCase())}</span><div><div class="name">${esc(p.nick)} ${i === O.you ? '<span class="pill">自分</span>' : ""}${i === 0 ? '<span class="pill gold">ホスト</span>' : ""}</div><div class="sub">${p.player ? `${flag(p.player.country)} ${esc(p.player.name)} ・ ${p.player.rank ? p.player.rank + "位" : "ランク外"} ・ 総合 ${p.player.overall || "-"} ・ ${W.STYLE_LABEL[p.player.style] || p.player.style || ""}` : ""}</div></div></div></div>` : '<div class="card"><div class="empty">相手を待っている…</div></div>';
        room = `<div class="panel"><div class="row between"><h2>部屋 <span class="code">${esc(O.code || "")}</span></h2><button class="small" data-oleave>退室</button></div>
          ${O.result ? `<div class="card" style="border-color:${O.result.won ? "var(--green)" : "var(--red)"}"><b class="${O.result.won ? "green" : "red"}" style="font-size:18px">${O.result.won ? "勝利" : "敗戦"}</b> ${esc(O.result.score)} <span class="muted small">vs ${esc(O.result.opp)}</span></div>` : ""}
          <p class="small muted">このコードを相手に送る。2人そろったらホストが開始。試合はサーバーが進め、セット間に20秒でプランを選べる。</p>
          <div class="grid2">${pc(ps[0], 0)}${pc(ps[1], 1)}</div>
          <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">
            ${O.host ? `<label class="small">コート <select data-osurf2>${Object.entries(SURF).map(([k, l]) => `<option value="${k}" ${O.opts && O.opts.surface === k ? "selected" : ""}>${l}</option>`).join("")}</select></label><label class="small">セット <select data-obo52><option value="0" ${O.opts && !O.opts.bo5 ? "selected" : ""}>3セット</option><option value="1" ${O.opts && O.opts.bo5 ? "selected" : ""}>5セット</option></select></label><label class="small">速度 <select data-ospeed><option value="900">ゆっくり</option><option value="450" selected>普通</option><option value="200">速い</option></select></label><button class="primary bigbtn" data-ostart ${ps[0] && ps[1] ? "" : "disabled"}>${O.status === "done" ? "もう一度" : "試合開始"}</button>` : `<span class="small muted">${O.opts ? `${SURF[O.opts.surface]} ・ ${O.opts.bo5 ? "5セット" : "3セット"} ・ ` : ""}ホストの開始を待っている</span>`}
          </div></div>`;
      } else if (O.status === "playing") {
        room = `<div class="panel"><h2>試合中</h2><p class="small muted">観戦画面が閉じている場合は、相手の接続が切れたか部屋が閉じた。</p><button data-oleave>退室</button></div>`;
      }
      const sm = O.serverMatches;
      const srv = `<div class="panel"><h2>サーバーの対戦成績 <span class="muted small">${sm ? sm.length + "試合" : ""}</span></h2>${sm === null ? '<button class="small" data-smatches>読み込む</button>' : sm.length ? sm.map((m) => { const won = m.winner === acc.id, opp = m.a === acc.id ? m.b : m.a; return `<div class="match ${won ? "win" : "loss"} small"><span class="muted">${fmtDate(m.at)}</span> vs <b>${esc(opp)}</b> <span class="pill ${m.surface}">${SURF[m.surface] || m.surface}</span> <span class="score ${won ? "green" : "red"}">${won ? "W" : "L"} ${esc(m.score)}</span></div>`; }).join("") : '<div class="empty">記録なし</div>'}</div>`;
      main = `<div class="panel"><h2>オンライン ${U.helpTo("online")}</h2>${O.error ? `<p class="small red">${esc(O.error)}</p>` : ""}${O.notice ? `<p class="small green">${esc(O.notice)}</p>` : ""}${serverRow}</div>${cloud}${room}${srv}`;
    }
    c.innerHTML = main + histHtml;
    const q = (s) => c.querySelector(s);
    const saveUrl = () => { const u = q("[data-ourl]"); if (u && !u.disabled) { U.settings.serverUrl = u.value.trim().replace(/\/+$/, ""); U.saveSettings(); } };
    const run = async (fn) => { O.busy = true; O.error = null; O.notice = null; U.render(); try { await fn(); } catch (e) { O.error = e.message; } O.busy = false; U.render(); };
    const lg = q("[data-login]"); if (lg) lg.onclick = () => { saveUrl(); if (!U.serverBase()) { O.error = "サーバー URL を入れてください"; U.render(); return; } const id = q("[data-lid]").value.trim(), pass = q("[data-lpass]").value; run(async () => { await login(id, pass); await refreshMe(); }); };
    const rg = q("[data-register]"); if (rg) rg.onclick = () => { saveUrl(); if (!U.serverBase()) { O.error = "サーバー URL を入れてください"; U.render(); return; } const id = q("[data-rid]").value.trim(), pass = q("[data-rpass]").value; run(async () => { const rec = await register(id, pass); await refreshMe(); U.openModal(`<h2>登録した</h2><p>復旧コードを控えてください。パスワードを忘れたときの唯一の手段で、二度と表示されません。</p><p class="code" style="margin:10px 0;font-size:22px">${esc(rec)}</p><button class="primary" data-close>控えた</button>`); }); };
    const ro = q("[data-recover-open]"); if (ro) ro.onclick = (e) => { e.preventDefault(); saveUrl(); U.openModal(`<h2>パスワードの再設定</h2><div class="row" style="gap:8px;flex-wrap:wrap"><input data-xid placeholder="ID" style="width:140px"><input data-xrec placeholder="復旧コード XXXX-XXXX-XXXX-XXXX" style="width:260px"><input data-xpass type="password" placeholder="新しいパスワード" style="width:180px"></div><div class="row" style="margin-top:10px"><button class="primary" data-recover-go>再設定する</button><button data-close>やめる</button></div>`); const go = document.querySelector("[data-recover-go]"); if (go) go.onclick = () => { const id = document.querySelector("[data-xid]").value.trim(), rec = document.querySelector("[data-xrec]").value.trim(), pass = document.querySelector("[data-xpass]").value; U.closeModal(); run(async () => { const nr = await recover(id, rec, pass); await refreshMe(); U.openModal(`<h2>再設定した</h2><p>新しい復旧コード（古いものは無効）:</p><p class="code" style="margin:10px 0;font-size:22px">${esc(nr)}</p><button class="primary" data-close>控えた</button>`); }); }; };
    const lo = q("[data-ologout]"); if (lo) lo.onclick = () => run(logout);
    const cs = q("[data-csave]"); if (cs) cs.onclick = () => run(() => U.cloudSave());
    const cl = q("[data-cload]"); if (cl) cl.onclick = () => U.openModal(`<h2>サーバーから読み込む</h2><p>この端末のセーブは上書きされる。取り消せない。</p><div class="row"><button class="primary" data-cload-go>読み込む</button><button data-close>やめる</button></div>`, false, false) || setTimeout(() => { const g = document.querySelector("[data-cload-go]"); if (g) g.onclick = () => { U.closeModal(); run(() => U.cloudLoad()); }; }, 0);
    const ca = q("[data-cauto]"); if (ca) ca.onchange = () => { U.settings.cloudAutoSave = ca.checked; U.saveSettings(); };
    const smb = q("[data-smatches]"); if (smb) smb.onclick = () => run(async () => { O.serverMatches = (await api("/api/matches")).matches; });
    const withSave = (fn) => run(async () => { await U.cloudSave(true); await new Promise((res) => connect(res)); fn(); });
    const cr = q("[data-ocreate]"); if (cr) cr.onclick = () => { const opts = { surface: q("[data-osurf]").value, bo5: q("[data-obo5]").value === "1" }; withSave(() => send({ t: "create", opts })); };
    const jn = q("[data-ojoin]"); if (jn) jn.onclick = () => { const code = (q("[data-ocode]").value || "").toUpperCase().trim(); if (code.length !== 5) { O.error = "コードは5文字"; U.render(); return; } withSave(() => send({ t: "join", code })); };
    const lv = q("[data-oleave]"); if (lv) lv.onclick = () => { send({ t: "leave" }); O.status = O.ws ? "connected" : "idle"; O.code = null; O.result = null; O.error = null; U.render(); };
    const st = q("[data-ostart]"); if (st) st.onclick = () => { if (O.status === "done") { send({ t: "again" }); O.result = null; } send({ t: "speed", ms: parseInt(q("[data-ospeed]").value, 10) }); send({ t: "start" }); };
    const s2 = q("[data-osurf2]"); if (s2) s2.onchange = () => send({ t: "opts", surface: s2.value });
    const b2 = q("[data-obo52]"); if (b2) b2.onchange = () => send({ t: "opts", bo5: b2.value === "1" });
    const sp = q("[data-ospeed]"); if (sp) sp.onchange = () => send({ t: "speed", ms: parseInt(sp.value, 10) });
    if (acc && !O.me && !O._meLoading) { O._meLoading = true; refreshMe().then(() => { O._meLoading = false; if (U.tab === "online") U.render(); }); }
  };
})();
