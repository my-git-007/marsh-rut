// Private marshes on a local server: does each player get their own marsh, does a bull react to that
// player's call, does a second tab take over, does reloading return to the same marsh, and is a bad
// login refused?     node tools/mp-test.mjs   (starts its own servers on ports 8091 and 8092)
import { spawn } from 'child_process';
import WebSocket from 'ws';
import { PROTOCOL_VERSION } from '../shared/protocol.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
function startServer(port, env) {
  const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  srv.stdout.on('data', (d) => process.stdout.write(`  [${port}] ` + d));
  return srv;
}
const dev = startServer(8091, { MARSH_AUTH: 'off', MARSH_DEBUG: '1', MARSH_BULL_NOW: '1', KEEP_MINUTES: '5', MAX_CONN_PER_IP: '3', MAX_NEW_PER_IP: '3' });
const idle = startServer(8093, { MARSH_AUTH: 'off', IDLE_MINUTES: '0', IDLE_GRACE_S: '4' });
const real = startServer(8092, { FIREBASE_PROJECT_ID: 'marsh-rut-test' });
await wait(1200);

function hunter(port, token, stand) {   // with MARSH_AUTH=off the token is the user's name
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}`); const h = { ws, ticks: new Map(), events: [], token, msgs: [] };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token, stand })));
    ws.on('message', (d) => {
      const m = JSON.parse(d); h.msgs.push(m.t);
      if (m.t === 'welcome') { h.you = m.you; h.spawns = m.spawns; resolve(h); }
      if (m.t === 'tick') { h.ticks.set(m.snap.t, m.snap); h.events.push(...m.ev); }
      if (m.t === 'denied') { h.denied = m.reason; resolve(h); }
    });
    ws.on('close', () => { h.closed = true; resolve(h); });
    ws.on('error', () => resolve(h));
  });
}
const health = async () => (await fetch('http://localhost:8091/health')).json();
const debug = async () => (await fetch('http://localhost:8091/debug')).text();
const interestOf = (txt, who) => { const sec = txt.split('== ').find((s) => s.startsWith('dev:' + who)); const m = sec && sec.match(/interest ([\d.]+)/); return m ? +m[1] : null; };

// 1. two players, two marshes
const a = await hunter(8091, 'Alice', 0), b = await hunter(8091, 'Bob', 0);
ok(a.you && b.you && a.you.stand === 0 && b.you.stand === 0, 'both players can take stand 0 (each has their own marsh)');
await wait(3000);
const h1 = await health();
ok(h1.marshes === 2 && h1.players === 2, `the server runs 2 marshes for 2 players (${JSON.stringify(h1)})`);
const lastA = [...a.ticks.values()].pop(), lastB = [...b.ticks.values()].pop();
ok(JSON.stringify(lastA.wind) !== JSON.stringify(lastB.wind), `each marsh has its own wind (${lastA.wind[0]}° vs ${lastB.wind[0]}°)`);
const before = await debug();
a.ws.send(JSON.stringify({ t: 'call', type: 'long', dur: 4, clip: 'ucowL_test' }));
await wait(6000);
const after = await debug();
ok(a.events.some((e) => e.e === 'call'), 'Alice gets her own call back as an event');
ok(!b.events.some((e) => e.e === 'call'), "Bob's marsh does not hear Alice's call");
ok(interestOf(after, 'Alice') > interestOf(before, 'Alice'), `Alice's bull got interested after her call (${interestOf(before, 'Alice')} -> ${interestOf(after, 'Alice')})`);
ok(interestOf(after, 'Bob') <= interestOf(before, 'Bob') + 0.05, `Bob's bull did not react (${interestOf(before, 'Bob')} -> ${interestOf(after, 'Bob')})`);

// 2. Alice opens a second tab: it takes over, the first one is told why and closed
const aliceAnimals = new Set(a.spawns.map((s) => s.id).concat(...[...a.ticks.values()].pop().a.map((r) => r[0])));
const a2 = await hunter(8091, 'Alice', 3);
await wait(500);
ok(a.msgs.includes('replaced') && a.closed, 'the first tab is told it was replaced and closed');
ok(a2.you && a2.spawns.some((s) => aliceAnimals.has(s.id)), `the second tab continues Alice's marsh (${a2.spawns.length} animals carried over)`);
ok((await health()).marshes === 2, 'still 2 marshes');

// 3. Alice leaves and comes back: same marsh
a2.ws.close(); await wait(500);
const h3 = await health(); ok(h3.players === 1 && h3.marshes === 2, `after Alice leaves her marsh waits for her (${JSON.stringify(h3)})`);
const a3 = await hunter(8091, 'Alice', 0);
ok(a3.you && a3.spawns.some((s) => aliceAnimals.has(s.id)), 'coming back within the keep time returns to the same marsh');

// 4. a login the server can't verify is refused (real Firebase checking on port 8092)
const bad = await hunter(8092, 'not-a-real-token', 0);
ok(bad.denied === 'login' && !bad.you, `a bad login token is refused (${bad.denied})`);
const old = await new Promise((resolve) => { const ws = new WebSocket('ws://localhost:8091'); ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, token: 'X' }))); ws.on('message', (d) => resolve(JSON.parse(d))); });
ok(old.t === 'denied' && old.reason === 'version', 'an out-of-date game is told to reload');

const unconfirmed = await hunter(8091, 'Carl?', 0);
ok(unconfirmed.denied === 'verify', `a player who hasn't confirmed their email is refused (${unconfirmed.denied})`);

// 5. limits per internet address (this test runs everything from one address)
for (const h of [b, a3]) h.ws.close(); await wait(500);
const carol = await hunter(8091, 'Carol', 0);
ok(!!carol.you, 'a third new marsh from this address is allowed (limit 3 per hour)');
const dave = await hunter(8091, 'Dave', 0);
ok(dave.denied === 'limit', `a fourth new marsh from the same address within the hour is refused (${dave.denied})`);
const bobBack = await hunter(8091, 'Bob', 0);
ok(!!bobBack.you, 'but a player whose marsh is still open can go back to it');
const extra = await new Promise((resolve) => { const ws = new WebSocket('ws://localhost:8091'); ws.on('open', () => resolve('open')); ws.on('unexpected-response', (q, r) => resolve(r.statusCode)); ws.on('error', () => resolve('error')); });
const third = await new Promise((resolve) => { const ws = new WebSocket('ws://localhost:8091'); ws.on('open', () => resolve('open')); ws.on('unexpected-response', (q, r) => resolve(r.statusCode)); ws.on('error', () => resolve('error')); });
ok(extra === 'open' && third === 429, `a fourth connection at once from one address is refused (3rd: ${extra}, 4th: ${third})`);
const leaver = carol; leaver.ws.send(JSON.stringify({ t: 'leave' })); await wait(500);
ok(!(await debug()).includes('dev:Carol'), 'logging out closes the marsh right away');
const codes = await Promise.all(Array.from({ length: 35 }, () => fetch('http://localhost:8091/health').then((r) => r.status)));
ok(codes.includes(429), `flooding the status page gets "too many requests" (${codes.filter((c) => c === 429).length} of 35 refused)`);

// 6. inactivity: a marsh that hears nothing is closed; one that is told "active" stays (server with a 4 s limit)
const sleepy = await hunter(8093, 'Sleepy', 0), busy = await hunter(8093, 'Busy', 0);
const keep = setInterval(() => busy.ws.send(JSON.stringify({ t: 'active' })), 1000);
await wait(7000); clearInterval(keep);
ok(sleepy.msgs.includes('idle') && sleepy.closed, 'an inactive player is told "idle" and disconnected');
ok(!busy.closed, 'an active player stays connected');

for (const h of [bobBack, busy]) h.ws.close();
dev.kill(); real.kill(); idle.kill(); console.log(fail ? `${fail} check(s) failed` : 'all server checks passed'); process.exit(fail ? 1 : 0);
