// Tour Life — online match server. No dependencies: plain Node (>=18).
//   node server/server.js [port]      (default 8787, or $PORT)
// Serves the game files from the repo root (handy for local play) and a WebSocket endpoint at /ws.
// One room = two players + one match. The server runs the match engine (authoritative) and sends
// one "tick" per point; both clients replay the same deterministic engine from the same seed, so
// what they see is exactly what the server scored. Plans can change only between sets.
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
require("../src/rng.js"); require("../src/match.js");
const TL = globalThis.TL;
const ROOT = path.join(__dirname, ".."), PORT = parseInt(process.argv[2] || process.env.PORT || "8787", 10);
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const BREAK_SECS = 20, ROOM_TTL = 60 * 60 * 1000;
const VERSION = (fs.readFileSync(path.join(ROOT, "src/ui/core.js"), "utf8").match(/VERSION: "([^"]+)"/) || [, "?"])[1]; // must match the client engine

// ---------- minimal WebSocket (RFC 6455, text frames, no extensions) ----------
function acceptKey(key) { return crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64"); }
function encodeFrame(str, opcode) {
  const payload = Buffer.from(str, "utf8"), len = payload.length;
  let head;
  if (len < 126) head = Buffer.from([0x80 | (opcode || 1), len]);
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | (opcode || 1); head[1] = 126; head.writeUInt16BE(len, 2); }
  else { head = Buffer.alloc(10); head[0] = 0x80 | (opcode || 1); head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([head, payload]);
}
class Conn {
  constructor(socket) { this.socket = socket; this.buf = Buffer.alloc(0); this.open = true; this.room = null; this.idx = -1; this.nick = ""; this.player = null; this.onmessage = null; this.onclose = null;
    socket.on("data", (d) => this.feed(d)); socket.on("close", () => this.closed()); socket.on("error", () => this.closed()); }
  send(obj) { if (!this.open) return; try { this.socket.write(encodeFrame(JSON.stringify(obj))); } catch (e) {} }
  close() { if (!this.open) return; try { this.socket.write(Buffer.from([0x88, 0])); } catch (e) {} this.socket.end(); this.closed(); }
  closed() { if (!this.open) return; this.open = false; if (this.onclose) this.onclose(); }
  feed(d) {
    this.buf = Buffer.concat([this.buf, d]);
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
const rooms = new Map();
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() { for (;;) { let c = ""; for (let i = 0; i < 5; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (!rooms.has(c)) return c; } }
function summary(p) { return p ? { name: p.name, country: p.country, rank: p.rank || null, overall: p.overall || null, style: p.style, height: p.height } : null; }
function cleanPlayer(p) {
  if (!p || typeof p !== "object" || !p.attrs || !p.surf) return null;
  const attrs = {}; for (const [k, v] of Object.entries(p.attrs)) attrs[k] = Math.max(20, Math.min(99, Number(v) || 50));
  const surf = {}; for (const [k, v] of Object.entries(p.surf)) surf[k] = Math.max(20, Math.min(85, Number(v) || 50));
  const traits = {}; for (const [k, v] of Object.entries(p.traits || {})) traits[String(k).slice(0, 24)] = Math.max(1, Math.min(5, Number(v) || 1));
  return { name: String(p.name || "Player").slice(0, 24), country: String(p.country || "JPN").slice(0, 3), height: Math.max(170, Math.min(205, Number(p.height) || 186)), style: String(p.style || "all").slice(0, 12), attrs, surf, traits, fatigue: 0, sharp: Math.max(10, Math.min(100, Number(p.sharp) || 65)), rank: p.rank ? Number(p.rank) : null, overall: p.overall ? Number(p.overall) : null };
}
function lobby(room) {
  for (const c of room.conns) if (c) c.send({ t: "lobby", code: room.code, players: room.conns.map((x) => x ? { nick: x.nick, player: summary(x.player) } : null), opts: room.opts, host: c.idx === 0, state: room.state });
}
function broadcast(room, msg) { for (const c of room.conns) if (c) c.send(msg); }
function closeRoom(room, why) { if (room.timer) clearInterval(room.timer); if (room.breakTimer) clearTimeout(room.breakTimer); rooms.delete(room.code); for (const c of room.conns) if (c) { c.send({ t: "closed", why }); c.room = null; } }

function startMatch(room) {
  const [a, b] = room.conns; if (!a || !b || room.state !== "lobby") return;
  const seed = crypto.randomInt(1, 2147483647);
  room.seed = seed; room.state = "playing"; room.n = 0;
  const rng = new TL.RNG(seed);
  const pa = Object.assign({}, a.player), pb = Object.assign({}, b.player);
  room.m = TL.Match.create(pa, pb, { rng, surface: room.opts.surface, bo5: !!room.opts.bo5, log: false, plans: [room.opts.planA || "balanced", room.opts.planB || "balanced"], traits: [pa.traits, pb.traits], tctx: { bigStage: false, home: [false, false], underdog: [false, false] } });
  broadcast(room, { t: "start", seed, opts: room.opts, players: [a.player, b.player], nicks: [a.nick, b.nick], speed: room.speed });
  for (const c of room.conns) c.send({ t: "you", idx: c.idx });
  room.started = Date.now();
  setTimeout(() => resume(room), 2500);
}
function resume(room) {
  if (room.state !== "playing" || room.timer) return;
  room.timer = setInterval(() => {
    const m = room.m; if (!m || m.done) { pause(room); finish(room); return; }
    m.step(); room.n++;
    broadcast(room, { t: "tick", n: room.n });
    if (m.done) { pause(room); finish(room); return; }
    if (m.betweenSets) {
      pause(room); room.plans = [null, null];
      broadcast(room, { t: "break", secs: BREAK_SECS, sets: m.setsWon.slice(), plans: m.plans.slice() });
      room.breakTimer = setTimeout(() => endBreak(room), BREAK_SECS * 1000);
    }
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
  broadcast(room, { t: "end", score: m.result.score, winnerIdx: m.winnerIdx, n: room.n, minutes: m.result.minutes });
}

function handle(conn, msg) {
  const room = conn.room;
  switch (msg.t) {
    case "create": {
      if (room) closeRoom(room, "再作成");
      const player = cleanPlayer(msg.player); if (!player) return conn.send({ t: "error", msg: "選手データが不正" });
      const code = newCode();
      const r = { code, conns: [conn, null], opts: { surface: ["hard", "clay", "grass", "indoor"].includes(msg.opts && msg.opts.surface) ? msg.opts.surface : "hard", bo5: !!(msg.opts && msg.opts.bo5) }, state: "lobby", m: null, timer: null, breakTimer: null, speed: 450, plans: [null, null], created: Date.now() };
      rooms.set(code, r); conn.room = r; conn.idx = 0; conn.nick = String(msg.nick || player.name).slice(0, 16); conn.player = player;
      conn.send({ t: "room", code, you: 0 }); lobby(r); break;
    }
    case "join": {
      const r = rooms.get(String(msg.code || "").toUpperCase().trim());
      if (!r) return conn.send({ t: "error", msg: "その部屋はない（コードを確認）" });
      if (r.conns[1] || r.state !== "lobby") return conn.send({ t: "error", msg: "その部屋は満員か、試合中" });
      const player = cleanPlayer(msg.player); if (!player) return conn.send({ t: "error", msg: "選手データが不正" });
      r.conns[1] = conn; conn.room = r; conn.idx = 1; conn.nick = String(msg.nick || player.name).slice(0, 16); conn.player = player;
      conn.send({ t: "room", code: r.code, you: 1 }); lobby(r); break;
    }
    case "opts": if (room && conn.idx === 0 && room.state === "lobby") { if (["hard", "clay", "grass", "indoor"].includes(msg.surface)) room.opts.surface = msg.surface; if (msg.bo5 !== undefined) room.opts.bo5 = !!msg.bo5; lobby(room); } break;
    case "speed": if (room && conn.idx === 0) { const ms = Math.max(120, Math.min(1500, Number(msg.ms) || 450)); room.speed = ms; broadcast(room, { t: "speed", ms }); if (room.timer) { pause(room); resume(room); } } break;
    case "plan": if (room && room.state === "playing" && room.plans && TL.PLANS[msg.plan] && !TL.PLANS[msg.plan].auto) { room.plans[conn.idx] = msg.plan; broadcast(room, { t: "planned", idx: conn.idx }); if (room.plans[0] && room.plans[1]) endBreak(room); } break;
    case "start": if (room && conn.idx === 0) startMatch(room); break;
    case "again": if (room && conn.idx === 0 && room.state === "done") { room.state = "lobby"; room.m = null; lobby(room); } break;
    case "emote": if (room && typeof msg.e === "string") broadcast(room, { t: "emote", idx: conn.idx, e: msg.e.slice(0, 8) }); break;
    case "leave": if (room) closeRoom(room, `${conn.nick} が退室`); break;
    case "ping": conn.send({ t: "pong" }); break;
  }
}

// ---------- http ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: true, rooms: rooms.size, version: VERSION })); }
  let file = path.normalize(path.join(ROOT, url.pathname === "/" ? "index.html" : url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => { if (err) { res.writeHead(404); return res.end("not found"); } res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "no-cache" }); res.end(data); });
});
server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key || !/^\/ws/.test(req.url)) { socket.destroy(); return; }
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + acceptKey(key) + "\r\n\r\n");
  const conn = new Conn(socket);
  conn.send({ t: "hello", v: VERSION });
  conn.onmessage = (msg) => { try { handle(conn, msg); } catch (e) { conn.send({ t: "error", msg: "サーバー内部エラー" }); } };
  conn.onclose = () => { const r = conn.room; if (r) { r.conns[conn.idx] = null; if (r.state === "playing") closeRoom(r, `${conn.nick} の接続が切れた`); else if (!r.conns[0] && !r.conns[1]) closeRoom(r, "空室"); else lobby(r); } };
});
setInterval(() => { const now = Date.now(); for (const r of rooms.values()) if (now - r.created > ROOM_TTL) closeRoom(r, "時間切れ"); }, 60000);
server.listen(PORT, () => console.log(`Tour Life online server on :${PORT}  (ws endpoint /ws, static from ${ROOT})`));
