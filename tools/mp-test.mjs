// Two hunters on a local server: do they see the same animals, does one hunter's call reach the other,
// and does a bull react to it?   node tools/mp-test.mjs   (starts its own server on port 8091)
import { spawn } from 'child_process';
import WebSocket from 'ws';

const PORT = 8091, URL = `ws://localhost:${PORT}`;
const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(PORT), MARSH_DEBUG: '1', MARSH_BULL_NOW: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
srv.stdout.on('data', (d) => process.stdout.write('  [server] ' + d));
await new Promise((r) => setTimeout(r, 1200));
let fail = 0; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };

function hunter(name, stand) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL); const h = { ws, ticks: new Map(), events: [], name };
    ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', v: 1, name, stand })));
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.t === 'welcome') { h.you = m.you; h.spawns = m.spawns; resolve(h); }
      if (m.t === 'tick') { h.ticks.set(m.snap.t, JSON.stringify(m.snap.a)); h.events.push(...m.ev); }
      if (m.t === 'full') reject(new Error('full'));
    });
    ws.on('error', reject);
  });
}
const debug = async () => (await fetch(`http://localhost:${PORT}/debug`)).text();

const a = await hunter('Alice', 0), b = await hunter('Bob', 1);
ok(a.you.stand === 0 && b.you.stand === 1, `seated at different stands (${a.you.stand}, ${b.you.stand})`);
await new Promise((r) => setTimeout(r, 3000));
const common = [...a.ticks.keys()].filter((t) => b.ticks.has(t));
ok(common.length > 10 && common.every((t) => a.ticks.get(t) === b.ticks.get(t)), `both hunters received identical snapshots (${common.length} shared ticks)`);
const before = await debug(); console.log('  ' + before.split('\n').slice(0, 3).join('\n  '));
const interest = (s) => { const m = s.match(/interest ([\d.]+)/); return m ? +m[1] : null; };
a.ws.send(JSON.stringify({ t: 'call', type: 'long', dur: 4, clip: 'ucowL_test' }));
await new Promise((r) => setTimeout(r, 6000));
ok(b.events.some((e) => e.e === 'call' && e.hunter === a.you.id), "Bob heard Alice's call event");
const after = await debug(); console.log('  ' + after.split('\n').slice(0, 3).join('\n  '));
ok(interest(after) > interest(before), `the bull's interest rose after Alice called (${interest(before)} -> ${interest(after)})`);
const c = await hunter('Carol'); ok(c.spawns.length === JSON.parse(a.ticks.get([...a.ticks.keys()].pop())).length || c.spawns.length > 0, `a late joiner gets the animals already out (${c.spawns.length})`);
for (const h of [a, b, c]) h.ws.close();
srv.kill(); console.log(fail ? `${fail} check(s) failed` : 'all multiplayer checks passed'); process.exit(fail ? 1 : 0);
