// Tour Life — account, cloud-save and online-match server. No dependencies: plain Node >= 22.
//   node server/server.js [port]            (default 8787 or $PORT)
//   DATA_DIR=/data  ADMIN_TOKEN=secret      (SQLite file lives in DATA_DIR; keep it on a persistent disk)
// HTTP: static game files from the repo root, JSON API under /api, WebSocket at /ws.
// The match engine runs here (authoritative) and ticks one point at a time; both clients replay the
// same deterministic engine from the same seed. Players come from the user's cloud save, never from
// what the client claims.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto"), zlib = require("zlib");
const { DatabaseSync } = require("node:sqlite");
require("../src/rng.js"); require("../src/match.js");
const TL = globalThis.TL;
const ROOT = path.join(__dirname, ".."), PORT = parseInt(process.argv[2] || process.env.PORT || "8787", 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const VERSION = (fs.readFileSync(path.join(ROOT, "src/ui/core.js"), "utf8").match(/VERSION: "([^"]+)"/) || [, "?"])[1];
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const BREAK_SECS = 20, ROOM_TTL = 60 * 60 * 1000, SESSION_DAYS = 30, SAVE_MAX = 4 * 1024 * 1024;

// ---------- database ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, "tourlife.db"));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, pass_hash TEXT NOT NULL, salt TEXT NOT NULL, rec_hash TEXT NOT NULL, created INTEGER NOT NULL, banned INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS saves(user_id TEXT PRIMARY KEY, blob BLOB NOT NULL, updated INTEGER NOT NULL, summary TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS matches(id INTEGER PRIMARY KEY AUTOINCREMENT, a TEXT NOT NULL, b TEXT NOT NULL, winner TEXT NOT NULL, score TEXT NOT NULL, surface TEXT NOT NULL, bo5 INTEGER NOT NULL, at INTEGER NOT NULL);`);
const Q = {
  user: db.prepare("SELECT * FROM users WHERE id = ?"),
  addUser: db.prepare("INSERT INTO users(id, pass_hash, salt, rec_hash, created) VALUES (?, ?, ?, ?, ?)"),
  setPass: db.prepare("UPDATE users SET pass_hash = ?, salt = ?, rec_hash = ? WHERE id = ?"),
  ban: db.prepare("UPDATE users SET banned = ? WHERE id = ?"),
  addSession: db.prepare("INSERT INTO sessions(token_hash, user_id, created, expires) VALUES (?, ?, ?, ?)"),
  session: db.prepare("SELECT user_id, expires FROM sessions WHERE token_hash = ?"),
  delSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
  delUserSessions: db.prepare("DELETE FROM sessions WHERE user_id = ?"),
  putSave: db.prepare("INSERT INTO saves(user_id, blob, updated, summary) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET blob = excluded.blob, updated = excluded.updated, summary = excluded.summary"),
  save: db.prepare("SELECT blob, updated, summary FROM saves WHERE user_id = ?"),
  saveMeta: db.prepare("SELECT updated, summary FROM saves WHERE user_id = ?"),
  addMatch: db.prepare("INSERT INTO matches(a, b, winner, score, surface, bo5, at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
  matchesOf: db.prepare("SELECT * FROM matches WHERE a = ? OR b = ? ORDER BY id DESC LIMIT 30"),
  h2h: db.prepare("SELECT winner, COUNT(*) n FROM matches WHERE (a = ? AND b = ?) OR (a = ? AND b = ?) GROUP BY winner"),
};
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hashPass = (pass, salt) => crypto.scryptSync(pass, salt, 64, { N: 16384 }).toString("hex");
const newToken = () => crypto.randomBytes(32).toString("hex");
const newRecovery = () => crypto.randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g).join("-");
const ID_RE = /^[A-Za-z0-9_]{3,16}$/;
function issueSession(userId) { const token = newToken(), now = Date.now(); Q.addSession.run(sha(token), userId, now, now + SESSION_DAYS * 86400000); return token; }
function userFromToken(token) { if (!token) return null; const s = Q.session.get(sha(token)); if (!s || s.expires < Date.now()) return null; const u = Q.user.get(s.user_id); if (!u || u.banned) return null; return u.id; }
// what the engine needs, taken from the stored save rather than the client's word
function snapshotFromSave(userId) {
  const row = Q.save.get(userId); if (!row) return null;
  let s; try { s = JSON.parse(zlib.gunzipSync(row.blob).toString("utf8")); } catch (e) { return null; }
  const h = (s.players || []).find((p) => p.isHuman); if (!h) return null;
  const H = s.human || {}, traits = {}; for (const t of H.traits || []) traits[t] = (H.traitLv && H.traitLv[t]) || 1;
  return { name: String(h.name).slice(0, 24), country: h.country, height: h.height || 186, style: h.style, attrs: h.attrs, surf: h.surf, traits, fatigue: 0, sharp: h.sharp === undefined ? 65 : h.sharp, rank: h.rank || null, overall: Math.round(TL.overall(h) * 10) / 10 };
}
function summarize(buf) {
  const s = JSON.parse(zlib.gunzipSync(buf).toString("utf8"));
  const h = (s.players || []).find((p) => p.isHuman); if (!h || !s.human) throw new Error("not a save");
  return { name: h.name, country: h.country, rank: h.rank || null, overall: Math.round(TL.overall(h) * 10) / 10, year: s.year, week: s.week, titles: h.stats ? h.stats.titles : 0, over: !!s.human.careerOver };
}
// ---------- rate limiting (per key, sliding window in memory) ----------
const hits = new Map();
function limited(key, max, windowMs) { const now = Date.now(); let h = hits.get(key); if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); } h.n++; return h.n > max; }
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (h.reset < now) hits.delete(k); }, 60000);

// ---------- minimal WebSocket (RFC 6455, text frames, no extensions) ----------
function acceptKey(key) { return crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64"); }
function encodeFrame(str, opcode) {
  const payload = Buffer.from(str, "utf8"), len = payload.length; let head;
  if (len < 126) head = Buffer.from([0x80 | (opcode || 1), len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | (opcode || 1); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | (opcode || 1); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
class Conn {
  constructor(socket) { this.socket = socket; this.buf = Buffer.alloc(0); this.open = true; this.room = null; this.idx = -1; this.user = null; this.player = null; this.onmessage = null; this.onclose = null;
    socket.on("data", (d) => this.feed(d)); socket.on("close", () => this.closed()); socket.on("error", () => this.closed()); }
  send(obj) { if (!this.open) return; try { this.socket.write(encodeFrame(JSON.stringify(obj))); } catch (e) {} }
  close() { if (!this.open) return; try { this.socket.write(Buffer.from([0x88, 0])); } catch (e) {} this.socket.end(); this.closed(); }
  closed() { if (!this.open) return; this.open = false; if (this.onclose) this.onclose(); }
  feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > 1 << 20) { this.close(); return; }
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1], opcode = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const total = off + (masked ? 4 : 0) + len;
      if (this.buf.length < total) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), total);
      if (masked) { const mask = this.buf.subarray(off, off + 4); const out = Buffer.alloc(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i & 3]; payload = out; }
      this.buf = this.buf.subarray(total);
      if (opcode === 8) { this.close(); return; }
      if (opcode === 9) { try { this.socket.write(encodeFrame(payload.toString("utf8"), 10)); } catch (e) {} continue; }
      if (opcode === 1 && this.onmessage) { let msg = null; try { msg = JSON.parse(payload.toString("utf8")); } catch (e) {} if (msg) this.onmessage(msg); }
    }
  }
}

// ---------- rooms ----------
const rooms = new Map(), online = new Map(); // online: user id → Conn
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() { for (;;) { let c = ""; for (let i = 0; i < 5; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!rooms.has(c)) return c; } }
function summary(p) { return p ? { name: p.name, country: p.country, rank: p.rank || null, overall: p.overall || null, style: p.style, height: p.height } : null; }
function lobby(room) { for (const c of room.conns) if (c) c.send({ t: "lobby", code: room.code, players: room.conns.map((x) => x ? { nick: x.user, player: summary(x.player) } : null), opts: room.opts, host: c.idx === 0, state: room.state }); }
function broadcast(room, msg) { for (const c of room.conns) if (c) c.send(msg); }
function closeRoom(room, why) { if (room.timer) clearInterval(room.timer); if (room.breakTimer) clearTimeout(room.breakTimer); rooms.delete(room.code); for (const c of room.conns) if (c) { c.send({ t: "closed", why }); c.room = null; } }
function startMatch(room) {
  const [a, b] = room.conns; if (!a || !b || room.state !== "lobby") return;
  const seed = crypto.randomInt(1, 2147483647);
  room.seed = seed; room.state = "playing"; room.n = 0;
  const rng = new TL.RNG(seed);
  const pa = Object.assign({}, a.player), pb = Object.assign({}, b.player);
  room.m = TL.Match.create(pa, pb, { rng, surface: room.opts.surface, bo5: !!room.opts.bo5, log: false, plans: ["balanced", "balanced"], traits: [pa.traits, pb.traits], tctx: { bigStage: false, home: [false, false], underdog: [false, false] } });
  broadcast(room, { t: "start", seed, opts: room.opts, players: [a.player, b.player], nicks: [a.user, b.user], speed: room.speed });
  for (const c of room.conns) c.send({ t: "you", idx: c.idx });
  setTimeout(() => resume(room), 2500);
}
function resume(room) {
  if (room.state !== "playing" || room.timer) return;
  room.timer = setInterval(() => {
    const m = room.m; if (!m || m.done) { pause(room); finish(room); return; }
    m.step(); room.n++;
    broadcast(room, { t: "tick", n: room.n });
    if (m.done) { pause(room); finish(room); return; }
    if (m.betweenSets) { pause(room); room.plans = [null, null]; broadcast(room, { t: "break", secs: BREAK_SECS, sets: m.setsWon.slice(), plans: m.plans.slice() }); room.breakTimer = setTimeout(() => endBreak(room), BREAK_SECS * 1000); }
  }, room.speed);
}
function pause(room) { if (room.timer) { clearInterval(room.timer); room.timer = null; } }
function endBreak(room) {
  if (room.state !== "playing" || !room.m || room.timer) return;
  if (room.breakTimer) { clearTimeout(room.breakTimer); room.breakTimer = null; }
  const m = room.m, plans = [0, 1].map((i) => room.plans[i] || m.plans[i]);
  for (const i of [0, 1]) if (plans[i] !== m.plans[i]) m.setPlan(i, plans[i]);
  broadcast(room, { t: "plans", plans, n: room.n });
  setTimeout(() => resume(room), 1200);
}
function finish(room) {
  const m = room.m; if (!m) return;
  if (!m.done) m.finish();
  room.state = "done";
  const [a, b] = room.conns;
  if (a && b) { try { Q.addMatch.run(a.user, b.user, m.winnerIdx === 0 ? a.user : b.user, m.result.score, room.opts.surface, room.opts.bo5 ? 1 : 0, Date.now()); } catch (e) {} }
  broadcast(room, { t: "end", score: m.result.score, winnerIdx: m.winnerIdx, n: room.n, minutes: m.result.minutes });
}
function handle(conn, msg) {
  const room = conn.room;
  if (msg.t === "auth") {
    const id = userFromToken(msg.token); if (!id) return conn.send({ t: "error", code: "auth", msg: "ログインが切れている。ログインし直してください" });
    const prev = online.get(id); if (prev && prev !== conn) prev.close();
    conn.user = id; online.set(id, conn);
    conn.player = snapshotFromSave(id);
    return conn.send({ t: "authed", id, hasSave: !!conn.player, player: summary(conn.player) });
  }
  if (msg.t === "ping") return conn.send({ t: "pong" });
  if (!conn.user) return conn.send({ t: "error", code: "auth", msg: "先にログイン" });
  switch (msg.t) {
    case "create": {
      if (room) closeRoom(room, "再作成");
      conn.player = snapshotFromSave(conn.user); if (!conn.player) return conn.send({ t: "error", msg: "クラウドセーブがない。先に保存してください" });
      const code = newCode();
      const r = { code, conns: [conn, null], opts: { surface: ["hard", "clay", "grass", "indoor"].includes(msg.opts && msg.opts.surface) ? msg.opts.surface : "hard", bo5: !!(msg.opts && msg.opts.bo5) }, state: "lobby", m: null, timer: null, breakTimer: null, speed: 450, plans: [null, null], created: Date.now() };
      rooms.set(code, r); conn.room = r; conn.idx = 0;
      conn.send({ t: "room", code, you: 0 }); lobby(r); break;
    }
    case "join": {
      const r = rooms.get(String(msg.code || "").toUpperCase().trim());
      if (!r) return conn.send({ t: "error", msg: "その部屋はない（コードを確認）" });
      if (r.conns[1] || r.state !== "lobby") return conn.send({ t: "error", msg: "その部屋は満員か、試合中" });
      if (r.conns[0] && r.conns[0].user === conn.user) return conn.send({ t: "error", msg: "自分の部屋には参加できない" });
      conn.player = snapshotFromSave(conn.user); if (!conn.player) return conn.send({ t: "error", msg: "クラウドセーブがない。先に保存してください" });
      r.conns[1] = conn; conn.room = r; conn.idx = 1;
      conn.send({ t: "room", code: r.code, you: 1 }); lobby(r); break;
    }
    case "opts": if (room && conn.idx === 0 && room.state === "lobby") { if (["hard", "clay", "grass", "indoor"].includes(msg.surface)) room.opts.surface = msg.surface; if (msg.bo5 !== undefined) room.opts.bo5 = !!msg.bo5; lobby(room); } break;
    case "speed": if (room && conn.idx === 0) { const ms = Math.max(120, Math.min(1500, Number(msg.ms) || 450)); room.speed = ms; broadcast(room, { t: "speed", ms }); if (room.timer) { pause(room); resume(room); } } break;
    case "plan": if (room && room.state === "playing" && room.plans && TL.PLANS[msg.plan] && !TL.PLANS[msg.plan].auto) { room.plans[conn.idx] = msg.plan; broadcast(room, { t: "planned", idx: conn.idx }); if (room.plans[0] && room.plans[1]) endBreak(room); } break;
    case "start": if (room && conn.idx === 0) startMatch(room); break;
    case "again": if (room && conn.idx === 0 && room.state === "done") { room.state = "lobby"; room.m = null; for (const c of room.conns) if (c) c.player = snapshotFromSave(c.user) || c.player; lobby(room); } break;
    case "emote": if (room && typeof msg.e === "string") broadcast(room, { t: "emote", idx: conn.idx, e: msg.e.slice(0, 8) }); break;
    case "leave": if (room) closeRoom(room, `${conn.user} が退室`); break;
  }
}

// ---------- http api ----------
function json(res, code, obj) { res.writeHead(code, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }); res.end(JSON.stringify(obj)); }
function readBody(req, max) { return new Promise((resolve, reject) => { const chunks = []; let n = 0; req.on("data", (c) => { n += c.length; if (n > max) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); }); req.on("end", () => resolve(Buffer.concat(chunks))); req.on("error", reject); }); }
function ipOf(req) { return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?"; }
function bearer(req) { const h = req.headers.authorization || ""; return h.startsWith("Bearer ") ? h.slice(7).trim() : null; }
async function api(req, res, url) {
  const p = url.pathname, ip = ipOf(req);
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "authorization,content-type,x-admin-token", "access-control-max-age": "600" }); return res.end(); }
  const body = async () => { try { const b = await readBody(req, 64 * 1024); return b.length ? JSON.parse(b.toString("utf8")) : {}; } catch (e) { return null; } };
  if (p === "/api/version") return json(res, 200, { version: VERSION, online: online.size, rooms: rooms.size });
  if (p === "/api/register" && req.method === "POST") {
    if (limited("reg:" + ip, 5, 3600000)) return json(res, 429, { error: "登録が多すぎる。しばらく待ってください" });
    const b = await body(); if (!b) return json(res, 400, { error: "不正なリクエスト" });
    const id = String(b.id || "").trim(), pass = String(b.pass || "");
    if (!ID_RE.test(id)) return json(res, 400, { error: "ID は英数字と _ で3〜16文字" });
    if (pass.length < 8 || pass.length > 72) return json(res, 400, { error: "パスワードは8文字以上" });
    if (Q.user.get(id)) return json(res, 409, { error: "その ID は使われている" });
    const salt = crypto.randomBytes(16).toString("hex"), recovery = newRecovery();
    Q.addUser.run(id, hashPass(pass, salt), salt, sha(recovery), Date.now());
    return json(res, 200, { token: issueSession(id), id, recovery });
  }
  if (p === "/api/login" && req.method === "POST") {
    if (limited("login:" + ip, 20, 600000)) return json(res, 429, { error: "試行が多すぎる。10分待ってください" });
    const b = await body(); if (!b) return json(res, 400, { error: "不正なリクエスト" });
    const id = String(b.id || "").trim(), pass = String(b.pass || "");
    if (limited("login:id:" + id, 10, 600000)) return json(res, 429, { error: "この ID への試行が多すぎる。10分待ってください" });
    const u = Q.user.get(id);
    if (!u || hashPass(pass, u.salt) !== u.pass_hash) return json(res, 401, { error: "ID かパスワードが違う" });
    if (u.banned) return json(res, 403, { error: "このアカウントは停止されている" });
    return json(res, 200, { token: issueSession(id), id });
  }
  if (p === "/api/recover" && req.method === "POST") {
    if (limited("recover:" + ip, 10, 3600000)) return json(res, 429, { error: "試行が多すぎる" });
    const b = await body(); if (!b) return json(res, 400, { error: "不正なリクエスト" });
    const id = String(b.id || "").trim(), rec = String(b.recovery || "").toUpperCase().replace(/\s/g, ""), pass = String(b.pass || "");
    const u = Q.user.get(id);
    if (!u || sha(rec) !== u.rec_hash) return json(res, 401, { error: "ID か復旧コードが違う" });
    if (pass.length < 8 || pass.length > 72) return json(res, 400, { error: "新しいパスワードは8文字以上" });
    const salt = crypto.randomBytes(16).toString("hex"), recovery = newRecovery();
    Q.setPass.run(hashPass(pass, salt), salt, sha(recovery), id); Q.delUserSessions.run(id);
    return json(res, 200, { token: issueSession(id), id, recovery });
  }
  if (p.startsWith("/api/admin/")) {
    if (!ADMIN_TOKEN || req.headers["x-admin-token"] !== ADMIN_TOKEN) return json(res, 403, { error: "forbidden" });
    const b = await body(); if (!b || !b.id) return json(res, 400, { error: "id" });
    if (p === "/api/admin/ban") { Q.ban.run(b.banned === false ? 0 : 1, b.id); Q.delUserSessions.run(b.id); const c = online.get(b.id); if (c) c.close(); return json(res, 200, { ok: true }); }
    if (p === "/api/admin/reset") { const salt = crypto.randomBytes(16).toString("hex"), recovery = newRecovery(); if (!Q.user.get(b.id)) return json(res, 404, { error: "no user" }); Q.setPass.run(hashPass(String(b.pass || recovery), salt), salt, sha(recovery), b.id); Q.delUserSessions.run(b.id); return json(res, 200, { ok: true, recovery }); }
    return json(res, 404, { error: "unknown" });
  }
  // everything below needs a session
  const token = bearer(req), uid = userFromToken(token);
  if (!uid) return json(res, 401, { error: "ログインが必要", code: "auth" });
  if (p === "/api/logout" && req.method === "POST") { Q.delSession.run(sha(token)); const c = online.get(uid); if (c) c.close(); return json(res, 200, { ok: true }); }
  if (p === "/api/me") { const m = Q.saveMeta.get(uid); return json(res, 200, { id: uid, save: m ? { updated: m.updated, summary: JSON.parse(m.summary) } : null, online: online.size }); }
  if (p === "/api/save" && req.method === "PUT") {
    if (limited("save:" + uid, 60, 3600000)) return json(res, 429, { error: "保存が多すぎる" });
    let buf; try { buf = await readBody(req, SAVE_MAX); } catch (e) { return json(res, 413, { error: "セーブが大きすぎる" }); }
    if (!(buf[0] === 0x1f && buf[1] === 0x8b)) buf = zlib.gzipSync(buf); // plain JSON from an old browser → compress here
    let sum; try { sum = summarize(buf); } catch (e) { return json(res, 400, { error: "セーブの形式が違う" }); }
    Q.putSave.run(uid, buf, Date.now(), JSON.stringify(sum));
    const c = online.get(uid); if (c) c.player = snapshotFromSave(uid);
    return json(res, 200, { ok: true, updated: Date.now(), summary: sum, bytes: buf.length });
  }
  if (p === "/api/save" && req.method === "GET") { const row = Q.save.get(uid); if (!row) return json(res, 404, { error: "クラウドセーブがない" }); res.writeHead(200, { "content-type": "application/gzip", "access-control-allow-origin": "*", "x-updated": String(row.updated) }); return res.end(row.blob); }
  if (p === "/api/matches") { const rows = Q.matchesOf.all(uid, uid); return json(res, 200, { matches: rows }); }
  if (p === "/api/h2h") { const o = url.searchParams.get("with") || ""; const rows = Q.h2h.all(uid, o, o, uid); const w = (rows.find((r) => r.winner === uid) || {}).n || 0, l = (rows.find((r) => r.winner === o) || {}).n || 0; return json(res, 200, { w, l }); }
  return json(res, 404, { error: "unknown" });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size, online: online.size, version: VERSION })); }
  if (url.pathname.startsWith("/api/")) { api(req, res, url).catch((e) => { try { json(res, 500, { error: "server error" }); } catch (x) {} }); return; }
  let file = path.normalize(path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(ROOT) || file.startsWith(DATA_DIR) || /[\\/]server[\\/]/.test(file)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end("not found"); } res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" }); res.end(data); });
});
server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || !/^\/ws/.test(req.url)) { socket.destroy(); return; }
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acceptKey(key) + "\r\n\r\n");
  const conn = new Conn(socket);
  conn.send({ t: "hello", v: VERSION });
  conn.onmessage = (msg) => { try { handle(conn, msg); } catch (e) { conn.send({ t: "error", msg: "サーバー内部エラー" }); } };
  conn.onclose = () => { if (conn.user && online.get(conn.user) === conn) online.delete(conn.user); const r = conn.room; if (r) { r.conns[conn.idx] = null; if (r.state === "playing") closeRoom(r, `${conn.user} の接続が切れた`); else if (!r.conns[0] && !r.conns[1]) closeRoom(r, "空室"); else lobby(r); } };
});
setInterval(() => { const now = Date.now(); for (const r of rooms.values()) if (now - r.created > ROOM_TTL) closeRoom(r, "時間切れ"); }, 60000);
server.listen(PORT, () => console.log(`Tour Life server ${VERSION} on :${PORT}  api /api, ws /ws, data ${DATA_DIR}`));
