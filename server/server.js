// Hunting LTD server: every logged-in player gets their own private marsh.
// Each marsh runs the same simulation as offline play (shared/sim) and streams it to that player's browser
// over a WebSocket: a snapshot of every animal 10 times a second, plus events (grunts, raking...) as they happen.
//
// A marsh is keyed by the player's account, so reloading the page (or reconnecting after a dropped line)
// within KEEP_MINUTES puts them back into the same marsh. Opening the game in a second tab moves the
// player there and closes the first. A marsh can hold more hunters (8 stands), which leaves room for
// inviting friends later; today each marsh has exactly one.
//
// Limits that keep one person (or a script) from using up the server:
//   one marsh per account · MAX_CONN_PER_IP connections at once per internet address · MAX_NEW_PER_IP new
//   marshes per address per hour · HTTP_PER_MIN requests per address per minute to /health etc. ·
//   IDLE_MINUTES without the player touching mouse or keyboard closes their marsh · email must be confirmed
//
//   npm run server     PORT (8080), FIREBASE_PROJECT_ID, ALLOWED_ORIGINS, MAX_MARSHES (40), KEEP_MINUTES (5),
//                      MAX_CONN_PER_IP (3), MAX_NEW_PER_IP (5), HTTP_PER_MIN (30), IDLE_MINUTES (10)
//   GET /health  -> {"ok":true,"marshes":n,"players":n,...}
//   MARSH_DEBUG=1 also serves GET /debug (every marsh's spotter readout) — leave it off in public.
import http from 'http';
import { WebSocketServer } from 'ws';
import { Sim } from '../shared/sim/sim.js';
import { STANDS } from '../shared/world.js';
import { TICK_HZ, SEND_EVERY, PROTOCOL_VERSION } from '../shared/protocol.js';
import { whoIs, AUTH_OFF } from './auth.js';
import { sendContact, CONTACT_ON } from './contact.js';
import { handleMail, MAIL_ON } from './mail.js';

const env = process.env,
  num = (k, d) => (env[k] != null && env[k] !== '' && !isNaN(+env[k]) ? +env[k] : d);
const PORT = num('PORT', 8080);
const DEBUG = env.MARSH_DEBUG === '1';
const ORIGINS = (env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean); // empty = any origin
const MAX_MARSHES = num('MAX_MARSHES', 40);
const KEEP_MS = num('KEEP_MINUTES', 5) * 60000;
const MAX_CONN_PER_IP = num('MAX_CONN_PER_IP', 3);
const MAX_NEW_PER_IP = num('MAX_NEW_PER_IP', 5);
const HTTP_PER_MIN = num('HTTP_PER_MIN', 30);
const IDLE_MS = num('IDLE_MINUTES', 10) * 60000 + num('IDLE_GRACE_S', 60) * 1000; // the browser logs an idle player out at 10 min; this is the backstop
const BULL_NOW = env.MARSH_BULL_NOW === '1'; // tests: first bull right away

// The player's internet address. On Fly.io the proxy passes it in Fly-Client-IP (and the socket address is
// the proxy's); elsewhere it is the socket address.
const ipOf = (req) => (env.FLY_APP_NAME && req.headers['fly-client-ip']) || req.socket.remoteAddress || '?';

const marshes = new Map(); // uid -> { uid, sim, conn, emptySince, step }
const connsByIp = new Map(); // ip -> number of open WebSockets
const newByIp = new Map(); // ip -> [times a new marsh was opened], last hour
const httpByIp = new Map(); // ip -> { start, n }

function openMarsh(uid, ip) {
  let m = marshes.get(uid);
  if (m) return m;
  const now = Date.now(),
    recent = (newByIp.get(ip) || []).filter((t) => now - t < 3600000);
  if (recent.length >= MAX_NEW_PER_IP) return 'limit';
  if (marshes.size >= MAX_MARSHES) {
    // make room by closing the marsh that has been empty longest
    let old = null;
    for (const x of marshes.values()) if (!x.conn && (!old || x.emptySince < old.emptySince)) old = x;
    if (!old) return 'busy';
    marshes.delete(old.uid);
  }
  recent.push(now);
  newByIp.set(ip, recent);
  m = { uid, sim: new Sim({ log: DEBUG }), conn: null, emptySince: now, step: 0 };
  if (BULL_NOW) m.sim.nextBull = 0.5;
  marshes.set(uid, m);
  return m;
}
const players = () => [...marshes.values()].filter((m) => m.conn).length;

const server = http.createServer((req, res) => {
  const ip = ipOf(req),
    now = Date.now();
  let h = httpByIp.get(ip);
  if (!h || now - h.start > 60000) httpByIp.set(ip, (h = { start: now, n: 0 }));
  if (++h.n > HTTP_PER_MIN) {
    res.writeHead(429, { 'Content-Type': 'text/plain', 'Retry-After': '60' });
    res.end('Too many requests\n');
    return;
  }
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (req.url.startsWith('/email/')) {
    handleMail(req, res, ip, ORIGINS);
    return;
  } // account emails (server/mail.js)
  if (req.url === '/health') {
    let animals = 0;
    for (const m of marshes.values()) animals += m.sim.bodies.size;
    res.writeHead(200, cors);
    res.end(
      JSON.stringify({
        ok: true,
        marshes: marshes.size,
        players: players(),
        animals,
        max: MAX_MARSHES,
        auth: AUTH_OFF ? 'off' : 'firebase',
      }),
    );
    return;
  }
  if (DEBUG && req.url === '/debug') {
    const out = [...marshes.values()].map(
      (m) =>
        `== ${m.uid.slice(0, 10)} ${m.conn ? '(playing)' : '(empty)'}\n${m.sim.debugText()}\n${(m.sim.log || []).slice(-12).join('\n')}`,
    );
    res.writeHead(200, { ...cors, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(out.join('\n\n') || 'no marshes');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Hunting LTD server.\n');
});
const wss = new WebSocketServer({
  server,
  maxPayload: 8192,
  verifyClient: (info, done) => {
    if (ORIGINS.length && !ORIGINS.includes(info.origin)) return done(false, 403, 'Forbidden');
    if ((connsByIp.get(ipOf(info.req)) || 0) >= MAX_CONN_PER_IP) return done(false, 429, 'Too many connections');
    done(true);
  },
});

const send = (ws, o) => {
  if (ws.readyState === 1) ws.send(typeof o === 'string' ? o : JSON.stringify(o));
};
const hunterOut = (H) => ({ id: H.id, name: H.name, stand: H.stand, x: H.x, z: H.z, y: H.y, eye: H.eye, yaw: H.yaw });
const CLIP = /^ucow[LC]_[\w .()-]{1,60}$/;
const log = (s) => console.log(`${new Date().toISOString()} ${s}`);
const deny = (c, reason) => {
  send(c.ws, { t: 'denied', reason });
  c.ws.close();
};

function leave(c, closeMarsh = false) {
  const m = c.marsh;
  if (!m || m.conn !== c) return;
  m.sim.removeHunter(c.hid);
  m.conn = null;
  m.emptySince = Date.now();
  if (closeMarsh) marshes.delete(m.uid); // logged out or idle: nothing to come back to
  log(
    `- ${c.uid.slice(0, 10)} left${closeMarsh ? ' (marsh closed)' : ''} — ${players()} playing, ${marshes.size} marsh(es)`,
  );
}

async function hello(c, msg) {
  if (msg.v !== PROTOCOL_VERSION) return deny(c, 'version');
  let who;
  try {
    who = await whoIs(msg.token);
  } catch (e) {
    return deny(c, 'login');
  }
  if (!who.verified) return deny(c, 'verify');
  if (c.ws.readyState !== 1) return;
  const m = openMarsh(who.uid, c.ip);
  if (typeof m === 'string') return deny(c, m);
  if (m.conn) {
    const old = m.conn;
    leave(old);
    old.marsh = null;
    send(old.ws, { t: 'replaced' });
    old.ws.close();
  } // same account, another tab
  const hid = 'h' + who.uid.slice(-6);
  const H = m.sim.addHunter(
    hid,
    who.name,
    Number.isInteger(msg.stand) && msg.stand >= 0 && msg.stand < STANDS.length ? msg.stand : undefined,
  );
  if (!H) return deny(c, 'full');
  Object.assign(c, { uid: who.uid, hid, who, marsh: m, active: Date.now() });
  m.conn = c;
  m.paused = false;
  send(c.ws, {
    t: 'welcome',
    you: hunterOut(H),
    hunters: m.sim.hunterList(),
    spawns: m.sim.spawnList(),
    snap: m.sim.snapshot(),
    rate: TICK_HZ / SEND_EVERY,
  });
  log(
    `+ ${who.name} (${who.uid.slice(0, 10)}) at ${STANDS[H.stand].name} — ${players()} playing, ${marshes.size} marsh(es)`,
  );
}

wss.on('connection', (ws, req) => {
  const ip = ipOf(req);
  connsByIp.set(ip, (connsByIp.get(ip) || 0) + 1);
  const c = {
    ws,
    ip,
    uid: null,
    hid: null,
    marsh: null,
    lastPour: -99,
    msgs: 0,
    windowStart: Date.now(),
    busy: false,
    active: Date.now(),
  };
  const timeout = setTimeout(() => {
    if (!c.marsh) ws.close();
  }, 15000); // must say hello within 15 s
  ws.on('message', (data) => {
    // a light flood guard: 40 messages per 10 s is far more than a hunter ever needs
    if (Date.now() - c.windowStart > 10000) {
      c.windowStart = Date.now();
      c.msgs = 0;
    }
    if (++c.msgs > 40) return;
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      if (!c.marsh && !c.busy) {
        c.busy = true;
        hello(c, msg).finally(() => {
          c.busy = false;
        });
      }
      return;
    }
    if (msg.t === 'ping') {
      send(ws, { t: 'pong', c: +msg.c || 0 });
      return;
    }
    const m = c.marsh;
    if (!m || m.conn !== c) return;
    if (msg.t === 'active')
      c.active = Date.now(); // the player touched the mouse or keyboard recently
    else if (msg.t === 'leave') {
      leave(c, true);
      ws.close();
    } else if (msg.t === 'pause')
      m.paused = true; // the player opened the menu: the marsh stands still
    else if (msg.t === 'resume') m.paused = false;
    else if (msg.t === 'stand') {
      // change location
      const H = Number.isInteger(msg.stand) ? m.sim.moveHunter(c.hid, msg.stand) : null;
      send(ws, H ? { t: 'moved', you: hunterOut(H) } : { t: 'moved', error: 'taken' });
    } else if (msg.t === 'contact') {
      if (c.contactBusy) return;
      c.contactBusy = true;
      sendContact(c.who, c.ip, msg)
        .then((r) => send(ws, { t: 'contact', ...r }))
        .finally(() => {
          c.contactBusy = false;
        });
    } else if (msg.t === 'call') {
      c.active = Date.now();
      m.sim.hunterCall(
        c.hid,
        msg.type === 'coax' ? 'coax' : 'long',
        +msg.dur || 3,
        CLIP.test(msg.clip) ? msg.clip : '',
      );
    } else if (msg.t === 'pour') {
      c.active = Date.now();
      if (m.sim.time - c.lastPour > 5) {
        c.lastPour = m.sim.time;
        m.sim.hunterPour(c.hid);
      }
    }
  });
  ws.on('close', () => {
    clearTimeout(timeout);
    leave(c);
    const n = (connsByIp.get(ip) || 1) - 1;
    if (n > 0) connsByIp.set(ip, n);
    else connsByIp.delete(ip);
  });
});

// the clock: a marsh only runs while its player is in it, and is closed after KEEP_MS empty
setInterval(() => {
  const now = Date.now();
  for (const m of marshes.values()) {
    if (!m.conn) {
      if (now - m.emptySince > KEEP_MS) marshes.delete(m.uid);
      continue;
    }
    if (now - m.conn.active > IDLE_MS) {
      const c = m.conn;
      send(c.ws, { t: 'idle' });
      leave(c, true);
      c.ws.close();
      continue;
    }
    if (m.paused) continue;
    m.sim.update(1 / TICK_HZ);
    m.step++;
    if (m.step % SEND_EVERY) continue;
    send(m.conn.ws, { t: 'tick', snap: m.sim.snapshot(), ev: m.sim.takeEvents() });
  }
}, 1000 / TICK_HZ);
// forget old per-address counters now and then
setInterval(() => {
  const now = Date.now();
  for (const [ip, ts] of newByIp) {
    const r = ts.filter((t) => now - t < 3600000);
    if (r.length) newByIp.set(ip, r);
    else newByIp.delete(ip);
  }
  for (const [ip, h] of httpByIp) if (now - h.start > 60000) httpByIp.delete(ip);
}, 60000);

server.listen(PORT, () =>
  log(
    `Hunting LTD server on :${PORT} — private marshes, up to ${MAX_MARSHES}; login ${AUTH_OFF ? 'OFF (testing)' : 'Firebase'}; contact ${CONTACT_ON ? 'on' : 'off'}; account emails ${MAIL_ON ? 'on' : 'off (Firebase sends them)'}; ${MAX_CONN_PER_IP} conn/address${DEBUG ? '; debug on' : ''}`,
  ),
);
