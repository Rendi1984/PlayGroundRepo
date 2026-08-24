'use strict';
// Multiplayer roulette server: zero dependencies.
// Realtime uses Server-Sent Events (supported by every modern Android/iOS browser),
// client -> server actions use plain JSON POSTs.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

const START_CHIPS = 1000;
const BETTING_MS = 20000;   // betting window
const SPIN_MS = 6000;       // wheel animation before payout
const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

/** @type {Map<string, Room>} */
const rooms = new Map();

const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

function newRoomCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.randomInt(32)];
  } while (rooms.has(code));
  return code;
}

function createRoom() {
  const room = {
    code: newRoomCode(),
    players: new Map(),   // playerId -> {id,name,chips,bets:[],lastWin,connected,seen,isHost}
    clients: new Set(),   // SSE responses
    phase: 'waiting',     // waiting | betting | spinning | result
    phaseEndsAt: 0,
    round: 0,
    result: null,
    history: [],
    timer: null,
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function publicState(room) {
  return {
    type: 'state',
    code: room.code,
    phase: room.phase,
    round: room.round,
    msLeft: room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - Date.now()) : 0,
    result: room.result,
    history: room.history.slice(0, 12),
    players: [...room.players.values()].map((p) => ({
      id: p.id, name: p.name, chips: p.chips, isHost: p.isHost, connected: p.connected,
      betTotal: p.bets.reduce((s, b) => s + b.amount, 0),
      bets: p.bets, lastWin: p.lastWin,
    })),
  };
}

function broadcast(room) {
  const payload = `data: ${JSON.stringify(publicState(room))}\n\n`;
  for (const res of room.clients) {
    try { res.write(payload); } catch { room.clients.delete(res); }
  }
}

function setPhase(room, phase, ms, next) {
  room.phase = phase;
  room.phaseEndsAt = ms ? Date.now() + ms : 0;
  if (room.timer) clearTimeout(room.timer);
  room.timer = ms ? setTimeout(next, ms) : null;
  broadcast(room);
}

function startRound(room) {
  room.round += 1;
  room.result = null;
  for (const p of room.players.values()) { p.bets = []; p.lastWin = null; }
  setPhase(room, 'betting', BETTING_MS, () => spin(room));
}

function spin(room) {
  const anyBet = [...room.players.values()].some((p) => p.bets.length);
  if (!anyBet) { setPhase(room, 'waiting', 0, null); return; }

  const number = WHEEL[crypto.randomInt(WHEEL.length)];
  room.result = { number, color: colorOf(number) };
  setPhase(room, 'spinning', SPIN_MS, () => settle(room));
}

function payoutFor(bet, n) {
  const color = colorOf(n);
  switch (bet.kind) {
    case 'number': return bet.value === n ? 36 : 0;      // 35:1 + stake
    case 'red': return color === 'red' ? 2 : 0;
    case 'black': return color === 'black' ? 2 : 0;
    case 'even': return n !== 0 && n % 2 === 0 ? 2 : 0;
    case 'odd': return n % 2 === 1 ? 2 : 0;
    case 'low': return n >= 1 && n <= 18 ? 2 : 0;
    case 'high': return n >= 19 && n <= 36 ? 2 : 0;
    case 'dozen1': return n >= 1 && n <= 12 ? 3 : 0;
    case 'dozen2': return n >= 13 && n <= 24 ? 3 : 0;
    case 'dozen3': return n >= 25 && n <= 36 ? 3 : 0;
    default: return 0;
  }
}

function settle(room) {
  const n = room.result.number;
  for (const p of room.players.values()) {
    let staked = 0, back = 0;
    for (const b of p.bets) { staked += b.amount; back += b.amount * payoutFor(b, n); }
    p.chips += back;
    p.lastWin = p.bets.length ? back - staked : null;
    if (p.chips <= 0) p.chips = 100; // friendly re-buy so nobody is stuck out
  }
  room.history.unshift(room.result);
  setPhase(room, 'result', 6000, () => startRound(room));
}

// ---------- HTTP ----------

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e5) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
}

function getRoom(code) { return rooms.get(String(code || '').toUpperCase()); }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;

  if (req.method === 'GET' && p === '/api/events') {
    const room = getRoom(url.searchParams.get('code'));
    const player = room && room.players.get(url.searchParams.get('playerId'));
    if (!room || !player) return json(res, 404, { error: 'room_or_player_not_found' });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    room.clients.add(res);
    player.connected = true;
    broadcast(room);

    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch {} }, 15000);
    req.on('close', () => {
      clearInterval(ping);
      room.clients.delete(res);
      player.connected = false;
      player.seen = Date.now();
      broadcast(room);
    });
    return;
  }

  if (req.method === 'POST' && p.startsWith('/api/')) {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'bad_json' }); }
    const name = String(body.name || '').trim().slice(0, 16) || 'Player';

    if (p === '/api/create') {
      const room = createRoom();
      const id = crypto.randomUUID();
      room.players.set(id, { id, name, chips: START_CHIPS, bets: [], lastWin: null, isHost: true, connected: false, seen: Date.now() });
      return json(res, 200, { code: room.code, playerId: id });
    }

    if (p === '/api/join') {
      const room = getRoom(body.code);
      if (!room) return json(res, 404, { error: 'room_not_found' });
      if (room.players.size >= 8) return json(res, 403, { error: 'room_full' });
      const id = crypto.randomUUID();
      room.players.set(id, { id, name, chips: START_CHIPS, bets: [], lastWin: null, isHost: false, connected: false, seen: Date.now() });
      broadcast(room);
      return json(res, 200, { code: room.code, playerId: id });
    }

    const room = getRoom(body.code);
    const player = room && room.players.get(body.playerId);
    if (!room || !player) return json(res, 404, { error: 'room_or_player_not_found' });

    if (p === '/api/bet') {
      if (room.phase !== 'betting') return json(res, 409, { error: 'betting_closed' });
      const amount = Math.floor(Number(body.amount));
      const kind = String(body.kind || '');
      const value = body.value === undefined ? null : Math.floor(Number(body.value));
      const valid = ['number', 'red', 'black', 'even', 'odd', 'low', 'high', 'dozen1', 'dozen2', 'dozen3'].includes(kind);
      if (!valid) return json(res, 400, { error: 'bad_bet' });
      if (kind === 'number' && !(value >= 0 && value <= 36)) return json(res, 400, { error: 'bad_number' });
      if (!(amount > 0) || amount > player.chips) return json(res, 400, { error: 'bad_amount' });

      player.chips -= amount;
      const existing = player.bets.find((b) => b.kind === kind && b.value === (kind === 'number' ? value : null));
      if (existing) existing.amount += amount;
      else player.bets.push({ kind, value: kind === 'number' ? value : null, amount });
      broadcast(room);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/clear') {
      if (room.phase !== 'betting') return json(res, 409, { error: 'betting_closed' });
      player.chips += player.bets.reduce((s, b) => s + b.amount, 0);
      player.bets = [];
      broadcast(room);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/start') {
      if (!player.isHost) return json(res, 403, { error: 'host_only' });
      if (room.phase === 'waiting' || room.phase === 'result') startRound(room);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/spin') {
      if (!player.isHost) return json(res, 403, { error: 'host_only' });
      if (room.phase === 'betting') spin(room);
      return json(res, 200, { ok: true });
    }

    if (p === '/api/leave') {
      room.players.delete(player.id);
      if (player.isHost) {
        const next = room.players.values().next().value;
        if (next) next.isHost = true;
      }
      broadcast(room);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'unknown_endpoint' });
  }

  if (req.method === 'GET') return serveStatic(req, res, p);
  res.writeHead(405).end('method not allowed');
});

// Reap idle rooms.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idle = room.clients.size === 0 && now - room.createdAt > ROOM_TTL_MS;
    if (idle || room.players.size === 0) {
      if (room.timer) clearTimeout(room.timer);
      rooms.delete(code);
    }
  }
}, 60000).unref();

server.listen(PORT, () => {
  console.log(`Roulette running on http://localhost:${PORT}`);
});

module.exports = { server, payoutFor, colorOf, WHEEL };
