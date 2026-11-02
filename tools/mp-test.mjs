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
const dev = startServer(8091, { MARSH_AUTH: 'off', MARSH_DEBUG: '1', MARSH_BULL_NOW: '1', KEEP_MINUTES: '5' });
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

for (const h of [b, a3]) h.ws.close();
dev.kill(); real.kill(); console.log(fail ? `${fail} check(s) failed` : 'all server checks passed'); process.exit(fail ? 1 : 0);
