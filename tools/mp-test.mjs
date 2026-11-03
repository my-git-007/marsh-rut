// Private marshes on a local server: does each player get their own marsh, does a bull react to that
// player's call, does a second tab take over, does reloading return to the same marsh, and is a bad
// login refused?     node tools/mp-test.mjs   (starts its own servers on ports 8091 and 8092)
import { spawn } from 'child_process';
import WebSocket from 'ws';
import http from 'http';
import { PROTOCOL_VERSION } from '../shared/protocol.js';
import { generateKeyPairSync } from 'crypto';
import { jwtVerify, importSPKI } from 'jose';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fail = 0, b2; const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) fail++; };
function startServer(port, env) {
  const srv = spawn(process.execPath, ['server/server.js'], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  srv.stdout.on('data', (d) => process.stdout.write(`  [${port}] ` + d));
  return srv;
}
const mails = [], google = { tokens: [], oob: [] };
// a fake Resend (/emails) and a fake Google (/token, /idtk/...: the account-email codes)
const SAKEY = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const SA_B64 = Buffer.from(JSON.stringify({ project_id: 'marsh-rut-test', client_email: 'mailer@marsh-rut-test.iam.gserviceaccount.com', private_key: SAKEY.privateKey, private_key_id: 'k1' })).toString('base64');
const fakeResend = http.createServer((req, res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
  const json = (o, st = 200) => { res.writeHead(st, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (req.url === '/token') { google.tokens.push(new URLSearchParams(b).get('assertion')); return json({ access_token: 'goog-test', expires_in: 3600 }); }
  if (req.url.startsWith('/idtk/')) { const q = JSON.parse(b); google.oob.push({ url: req.url, auth: req.headers.authorization, ...q });
    if (q.email === 'nobody@example.com') return json({ error: { code: 400, message: 'EMAIL_NOT_FOUND' } }, 400);
    if (q.email === 'hidden@example.com') return json({ kind: 'identitytoolkit#GetOobConfirmationCodeResponse', email: q.email });   // enumeration protection
    return json({ email: q.email, oobLink: `https://marsh-rut.firebaseapp.com/__/auth/action?mode=x&oobCode=CODE${google.oob.length}&apiKey=k` }); }
  mails.push({ auth: req.headers.authorization, ...JSON.parse(b) }); json({ id: 'test' }); }); }).listen(8099);
const mailer = startServer(8094, { MARSH_AUTH: 'off', RESEND_API_KEY: 're_test', CONTACT_TO: 'owner@example.com', RESEND_URL: 'http://localhost:8099/emails',
  FIREBASE_SA_B64: SA_B64, GOOGLE_TOKEN_URL: 'http://localhost:8099/token', IDTK_URL: 'http://localhost:8099/idtk' });
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

// 7. pause menu: the marsh stops while paused; change location; contact form
const p = await hunter(8094, 'Pat', 0);
await wait(1500);
p.ws.send(JSON.stringify({ t: 'pause' })); await wait(400);
const tPaused = [...p.ticks.keys()].pop(); await wait(1500);
ok([...p.ticks.keys()].pop() === tPaused, `while paused the marsh stands still (no new snapshots after t=${tPaused})`);
p.ws.send(JSON.stringify({ t: 'resume' })); await wait(800);
const tAfter = [...p.ticks.keys()].pop();
ok(tAfter > tPaused && tAfter - tPaused < 1.2, `after resuming it carries on from where it stopped (t ${tPaused} -> ${tAfter})`);
const answer = (h, type, msg) => new Promise((resolve) => { const t = setTimeout(() => resolve({ timeout: true }), 8000); const on = (d) => { const m = JSON.parse(d); if (m.t === type) { clearTimeout(t); h.ws.off('message', on); resolve(m); } }; h.ws.on('message', on); h.ws.send(JSON.stringify(msg)); });
const mv = await answer(p, 'moved', { t: 'stand', stand: 5 });
ok(mv.you && mv.you.stand === 5, `change location moves the hunter to stand 5 (${mv.you && mv.you.stand})`);
const off = await answer(b2 = await hunter(8093, 'Quinn', 0), 'contact', { t: 'contact', name: 'Q', email: 'q@example.com', message: 'hello' });
ok(off.ok === false && off.reason === 'off', `without an email key the contact form says it isn't set up (${off.reason})`);
const badMail = await answer(p, 'contact', { t: 'contact', name: 'Pat', email: 'not-an-email', message: 'hello' });
ok(badMail.ok === false && badMail.field === 'email', `a bad reply address is refused (${badMail.field})`);
const sent = await answer(p, 'contact', { t: 'contact', name: 'Pat', email: 'pat@example.com', message: 'Love the game!\nOne question…' });
const mail = mails[0] || {};
ok(sent.ok === true && mail.to && mail.to[0] === 'owner@example.com' && mail.reply_to === 'pat@example.com' && /Love the game/.test(mail.text) && mail.auth === 'Bearer re_test',
  `a message is emailed to the owner with the player as reply-to (${sent.ok}, to ${mail.to}, reply-to ${mail.reply_to})`);
await answer(p, 'contact', { t: 'contact', name: 'Pat', email: 'pat@example.com', message: 'second' });
await answer(p, 'contact', { t: 'contact', name: 'Pat', email: 'pat@example.com', message: 'third' });
const fourth = await answer(p, 'contact', { t: 'contact', name: 'Pat', email: 'pat@example.com', message: 'fourth' });
ok(fourth.ok === false && fourth.reason === 'limit' && mails.length === 3, `a 4th message within the hour is refused (${fourth.reason}, ${mails.length} emailed)`);
p.ws.close(); b2.ws.close();

// 8. account emails sent by the server (server/mail.js): links to the game, not Firebase's page
const post = (port, path, b, hdr = {}) => fetch(`http://localhost:${port}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://hunting.ltd', ...hdr }, body: JSON.stringify(b) });
const pre = await fetch('http://localhost:8094/email/reset', { method: 'OPTIONS', headers: { Origin: 'https://hunting.ltd', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'https://hunting.ltd' && /Authorization/.test(pre.headers.get('access-control-allow-headers')), `the browser may call /email/* from hunting.ltd (${pre.status})`);
mails.length = 0;
const rs = await post(8094, '/email/reset', { email: 'Pat@Example.com' }); const rm = mails[0] || {};
ok(rs.status === 200 && google.oob[0] && google.oob[0].requestType === 'PASSWORD_RESET' && google.oob[0].returnOobLink === true && google.oob[0].auth === 'Bearer goog-test' && google.oob[0].url === '/idtk/projects/marsh-rut-test/accounts:sendOobCode',
  `a reset asks Firebase for a code with the service account (${rs.status}, ${google.oob[0] && google.oob[0].requestType})`);
ok(rm.to && rm.to[0] === 'pat@example.com' && rm.reply_to === 'support@hunting.ltd' && /Hunting LTD <support@hunting.ltd>/.test(rm.from) && rm.html.includes('https://hunting.ltd/?mode=resetPassword&amp;oobCode=CODE1') && rm.text.includes('https://hunting.ltd/?mode=resetPassword&oobCode=CODE1') && !/firebaseapp/.test(rm.html + rm.text),
  `the reset email comes from support@hunting.ltd and links to the game (${rm.subject})`);
const tok = google.tokens[0] ? await jwtVerify(google.tokens[0], await importSPKI(SAKEY.publicKey, 'RS256'), { issuer: 'mailer@marsh-rut-test.iam.gserviceaccount.com', audience: 'http://localhost:8099/token' }).catch(() => null) : null;
ok(tok && /cloud-platform/.test(tok.payload.scope), 'the Google sign-in is signed with the service account key');
const nb = await post(8094, '/email/reset', { email: 'nobody@example.com' });
ok(nb.status === 200 && mails.length === 1, `an email with no account gets the same answer and no email (${nb.status}, ${mails.length} sent)`);
const hid = await post(8094, '/email/reset', { email: 'hidden@example.com' });
ok(hid.status === 200 && mails.length === 1, `with Firebase's enumeration protection (no link), the same quiet answer (${hid.status})`);
const vf = await post(8094, '/email/verify', { name: 'Pat', email: 'pat@example.com' }, { Authorization: 'Bearer Pat?' }); const vm = mails[1] || {};
ok(vf.status === 200 && vm.subject === 'Confirm your email for Hunting LTD' && vm.html.includes('https://hunting.ltd/?mode=verifyEmail&amp;oobCode=') && /Hi Pat,/.test(vm.text), `a confirmation email links to the game (${vf.status}, ${vm.subject})`);
const done = await post(8094, '/email/verify', {}, { Authorization: 'Bearer Pat' });
ok(done.status === 200 && mails.length === 2, 'an already-confirmed player gets no email');
await post(8094, '/email/reset', { email: 'pat@example.com' }); await post(8094, '/email/reset', { email: 'pat@example.com' });
const lim = await post(8094, '/email/reset', { email: 'pat@example.com' });
ok(lim.status === 429 && mails.length === 4, `a 4th reset email within the hour is refused (${lim.status}, ${mails.length} sent)`);
const badAddr = await post(8094, '/email/reset', { email: 'not an email' });
ok(badAddr.status === 400, `a bad address is refused (${badAddr.status})`);
const offm = await post(8093, '/email/reset', { email: 'pat@example.com' });
ok(offm.status === 503, `without the key the server says it can't, so the game falls back to Firebase (${offm.status})`);

// 6. inactivity: a marsh that hears nothing is closed; one that is told "active" stays (server with a 4 s limit)
const sleepy = await hunter(8093, 'Sleepy', 0), busy = await hunter(8093, 'Busy', 0);
const keep = setInterval(() => busy.ws.send(JSON.stringify({ t: 'active' })), 1000);
await wait(7000); clearInterval(keep);
ok(sleepy.msgs.includes('idle') && sleepy.closed, 'an inactive player is told "idle" and disconnected');
ok(!busy.closed, 'an active player stays connected');

for (const h of [bobBack, busy]) h.ws.close();
dev.kill(); real.kill(); idle.kill(); mailer.kill(); fakeResend.close(); console.log(fail ? `${fail} check(s) failed` : 'all server checks passed'); process.exit(fail ? 1 : 0);
