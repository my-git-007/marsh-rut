// Marsh Rut multiplayer server: one shared marsh, up to one hunter per stand (8).
// Runs the same simulation as solo play (shared/sim) and streams it to every browser over a WebSocket:
// a snapshot of every animal 10 times a second, plus events (grunts, raking, calls...) as they happen.
//
//   npm run server                      (PORT, default 8080)
//   GET /health  -> {"ok":true,"hunters":n,"animals":n}
//   MARSH_DEBUG=1 also serves GET /debug (the spotter readout) — leave it off in public.
import http from 'http';
import { WebSocketServer } from 'ws';
import { Sim } from '../shared/sim/sim.js';
import { STANDS } from '../shared/world.js';
import { TICK_HZ, SEND_EVERY, PROTOCOL_VERSION } from '../shared/protocol.js';

const PORT = +process.env.PORT || 8080;
const DEBUG = process.env.MARSH_DEBUG === '1';
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);   // empty = any origin

const sim = new Sim({ log: DEBUG });
if (process.env.MARSH_BULL_NOW === '1') sim.nextBull = 0.5;   // tests: first bull right away
const clients = new Set();   // { ws, id, name }
let nextId = 1;

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.url === '/health') { res.writeHead(200, cors); res.end(JSON.stringify({ ok: true, hunters: sim.hunters.size, animals: sim.bodies.size, stands: STANDS.length })); return; }
  if (DEBUG && req.url === '/debug') { res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' }); res.end(sim.debugText() + '\n\n' + (sim.log || []).slice(-30).join('\n')); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Marsh Rut server. Point the game at this address with ?server=wss://<this host>\n');
});
const wss = new WebSocketServer({ server, maxPayload: 4096, verifyClient: (info) => !ORIGINS.length || ORIGINS.includes(info.origin) });

const send = (ws, o) => { if (ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const broadcast = (o) => { const s = JSON.stringify(o); for (const c of clients) if (c.id) send(c.ws, s); };
const hunterOut = (H) => ({ id: H.id, name: H.name, stand: H.stand, x: H.x, z: H.z, y: H.y, eye: H.eye, yaw: H.yaw });
const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 24) || 'Hunter';
const CLIP = /^ucow[LC]_[\w .()-]{1,60}$/;

wss.on('connection', (ws) => {
  const c = { ws, id: null, lastPour: -99, msgs: 0, windowStart: Date.now() };
  clients.add(c);
  ws.on('message', (data) => {
    // a light flood guard: 40 messages per 10 s is far more than a hunter ever needs
    if (Date.now() - c.windowStart > 10000) { c.windowStart = Date.now(); c.msgs = 0; }
    if (++c.msgs > 40) return;
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello' && !c.id) {
      if (m.v !== PROTOCOL_VERSION) { send(ws, { t: 'full', reason: 'version' }); ws.close(); return; }
      const id = 'h' + nextId++;
      const H = sim.addHunter(id, cleanName(m.name), Number.isInteger(m.stand) ? m.stand : undefined);
      if (!H) { send(ws, { t: 'full' }); ws.close(); return; }
      c.id = id;
      send(ws, { t: 'welcome', you: hunterOut(H), hunters: sim.hunterList(), spawns: sim.spawnList(), snap: sim.snapshot(), rate: TICK_HZ / SEND_EVERY });
      broadcast({ t: 'hunters', list: sim.hunterList() });
      console.log(`${new Date().toISOString()} + ${H.name} (${id}) at ${STANDS[H.stand].name} — ${sim.hunters.size} hunter(s)`);
    } else if (!c.id) return;
    else if (m.t === 'call') sim.hunterCall(c.id, m.type === 'coax' ? 'coax' : 'long', +m.dur || 3, CLIP.test(m.clip) ? m.clip : '');
    else if (m.t === 'pour') { if (sim.time - c.lastPour > 5) { c.lastPour = sim.time; sim.hunterPour(c.id); } }
    else if (m.t === 'ping') send(ws, { t: 'pong', c: +m.c || 0 });
  });
  ws.on('close', () => {
    clients.delete(c);
    if (c.id) { sim.removeHunter(c.id); broadcast({ t: 'hunters', list: sim.hunterList() }); console.log(`${new Date().toISOString()} - ${c.id} left — ${sim.hunters.size} hunter(s)`); }
  });
});

// the clock: the marsh only runs while someone is in it
let step = 0;
setInterval(() => {
  if (!sim.hunters.size) return;
  sim.update(1 / TICK_HZ); step++;
  if (step % SEND_EVERY) return;
  broadcast({ t: 'tick', snap: sim.snapshot(), ev: sim.takeEvents() });
}, 1000 / TICK_HZ);

server.listen(PORT, () => console.log(`Marsh Rut server on :${PORT} — ${STANDS.length} stands${DEBUG ? ' (debug on)' : ''}`));
