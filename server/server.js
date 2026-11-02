// Marsh Rut server: every logged-in player gets their own private marsh.
// Each marsh runs the same simulation as offline play (shared/sim) and streams it to that player's browser
// over a WebSocket: a snapshot of every animal 10 times a second, plus events (grunts, raking...) as they happen.
//
// A marsh is keyed by the player's account, so reloading the page (or reconnecting after a dropped line)
// within KEEP_MINUTES puts them back into the same marsh. Opening the game in a second tab moves the
// player there and closes the first. A marsh can hold more hunters (8 stands), which leaves room for
// inviting friends later; today each marsh has exactly one.
//
//   npm run server            PORT (8080), FIREBASE_PROJECT_ID, ALLOWED_ORIGINS, MAX_MARSHES (40), KEEP_MINUTES (5)
//   GET /health  -> {"ok":true,"marshes":n,"players":n,...}
//   MARSH_DEBUG=1 also serves GET /debug (every marsh's spotter readout) — leave it off in public.
import http from 'http';
import { WebSocketServer } from 'ws';
import { Sim } from '../shared/sim/sim.js';
import { STANDS } from '../shared/world.js';
import { TICK_HZ, SEND_EVERY, PROTOCOL_VERSION } from '../shared/protocol.js';
import { whoIs, AUTH_OFF } from './auth.js';

const PORT = +process.env.PORT || 8080;
const DEBUG = process.env.MARSH_DEBUG === '1';
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);   // empty = any origin
const MAX_MARSHES = +process.env.MAX_MARSHES || 40;
const KEEP_MS = (+process.env.KEEP_MINUTES || 5) * 60000;
const BULL_NOW = process.env.MARSH_BULL_NOW === '1';   // tests: first bull right away

const marshes = new Map();   // uid -> { uid, sim, conn, emptySince, step }
const conns = new Set();     // { ws, uid, hid, marsh, lastPour, msgs, windowStart, busy }

function openMarsh(uid) {
  let m = marshes.get(uid);
  if (m) return m;
  if (marshes.size >= MAX_MARSHES) {   // make room by closing the marsh that has been empty longest
    let old = null; for (const x of marshes.values()) if (!x.conn && (!old || x.emptySince < old.emptySince)) old = x;
    if (!old) return null;
    marshes.delete(old.uid);
  }
  m = { uid, sim: new Sim({ log: DEBUG }), conn: null, emptySince: Date.now(), step: 0 };
  if (BULL_NOW) m.sim.nextBull = 0.5;
  marshes.set(uid, m);
  return m;
}
const players = () => [...marshes.values()].filter((m) => m.conn).length;

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.url === '/health') {
    let animals = 0; for (const m of marshes.values()) animals += m.sim.bodies.size;
    res.writeHead(200, cors); res.end(JSON.stringify({ ok: true, marshes: marshes.size, players: players(), animals, max: MAX_MARSHES, auth: AUTH_OFF ? 'off' : 'firebase' })); return;
  }
  if (DEBUG && req.url === '/debug') {
    const out = [...marshes.values()].map((m) => `== ${m.uid.slice(0, 10)} ${m.conn ? '(playing)' : '(empty)'}\n${m.sim.debugText()}\n${(m.sim.log || []).slice(-12).join('\n')}`);
    res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' }); res.end(out.join('\n\n') || 'no marshes'); return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Marsh Rut server.\n');
});
const wss = new WebSocketServer({ server, maxPayload: 8192, verifyClient: (info) => !ORIGINS.length || ORIGINS.includes(info.origin) });

const send = (ws, o) => { if (ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const hunterOut = (H) => ({ id: H.id, name: H.name, stand: H.stand, x: H.x, z: H.z, y: H.y, eye: H.eye, yaw: H.yaw });
const CLIP = /^ucow[LC]_[\w .()-]{1,60}$/;
const log = (s) => console.log(`${new Date().toISOString()} ${s}`);

function leave(c) {
  const m = c.marsh; if (!m || m.conn !== c) return;
  m.sim.removeHunter(c.hid); m.conn = null; m.emptySince = Date.now();
  log(`- ${c.uid.slice(0, 10)} left — ${players()} playing, ${marshes.size} marsh(es)`);
}

async function hello(c, msg) {
  if (msg.v !== PROTOCOL_VERSION) { send(c.ws, { t: 'denied', reason: 'version' }); c.ws.close(); return; }
  let who;
  try { who = await whoIs(msg.token); } catch (e) { send(c.ws, { t: 'denied', reason: 'login' }); c.ws.close(); return; }
  if (c.ws.readyState !== 1) return;
  const m = openMarsh(who.uid);
  if (!m) { send(c.ws, { t: 'denied', reason: 'busy' }); c.ws.close(); return; }
  if (m.conn) { const old = m.conn; leave(old); old.marsh = null; send(old.ws, { t: 'replaced' }); old.ws.close(); }   // same account, another tab
  const hid = 'h' + who.uid.slice(-6);
  const H = m.sim.addHunter(hid, who.name, Number.isInteger(msg.stand) && msg.stand >= 0 && msg.stand < STANDS.length ? msg.stand : undefined);
  if (!H) { send(c.ws, { t: 'denied', reason: 'full' }); c.ws.close(); return; }
  Object.assign(c, { uid: who.uid, hid, marsh: m }); m.conn = c;
  send(c.ws, { t: 'welcome', you: hunterOut(H), hunters: m.sim.hunterList(), spawns: m.sim.spawnList(), snap: m.sim.snapshot(), rate: TICK_HZ / SEND_EVERY });
  log(`+ ${who.name} (${who.uid.slice(0, 10)}) at ${STANDS[H.stand].name} — ${players()} playing, ${marshes.size} marsh(es)`);
}

wss.on('connection', (ws) => {
  const c = { ws, uid: null, hid: null, marsh: null, lastPour: -99, msgs: 0, windowStart: Date.now(), busy: false };
  conns.add(c);
  const timeout = setTimeout(() => { if (!c.marsh) ws.close(); }, 15000);   // must say hello within 15 s
  ws.on('message', (data) => {
    // a light flood guard: 40 messages per 10 s is far more than a hunter ever needs
    if (Date.now() - c.windowStart > 10000) { c.windowStart = Date.now(); c.msgs = 0; }
    if (++c.msgs > 40) return;
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') { if (!c.marsh && !c.busy) { c.busy = true; hello(c, msg).finally(() => { c.busy = false; }); } return; }
    if (msg.t === 'ping') { send(ws, { t: 'pong', c: +msg.c || 0 }); return; }
    const m = c.marsh; if (!m || m.conn !== c) return;
    if (msg.t === 'call') m.sim.hunterCall(c.hid, msg.type === 'coax' ? 'coax' : 'long', +msg.dur || 3, CLIP.test(msg.clip) ? msg.clip : '');
    else if (msg.t === 'pour') { if (m.sim.time - c.lastPour > 5) { c.lastPour = m.sim.time; m.sim.hunterPour(c.hid); } }
  });
  ws.on('close', () => { clearTimeout(timeout); conns.delete(c); leave(c); });
});

// the clock: a marsh only runs while its player is in it, and is closed after KEEP_MS empty
setInterval(() => {
  const now = Date.now();
  for (const m of marshes.values()) {
    if (!m.conn) { if (now - m.emptySince > KEEP_MS) marshes.delete(m.uid); continue; }
    m.sim.update(1 / TICK_HZ); m.step++;
    if (m.step % SEND_EVERY) continue;
    send(m.conn.ws, { t: 'tick', snap: m.sim.snapshot(), ev: m.sim.takeEvents() });
  }
}, 1000 / TICK_HZ);

server.listen(PORT, () => log(`Marsh Rut server on :${PORT} — private marshes, up to ${MAX_MARSHES}; login ${AUTH_OFF ? 'OFF (testing)' : 'Firebase'}${DEBUG ? '; debug on' : ''}`));
