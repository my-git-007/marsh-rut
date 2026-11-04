// Checks the animal engine without a browser: the catalogue is complete, and the behaviours happen —
// courtship and bellows, a cow with a calf keeping bulls at a distance, predators and how each animal answers
// them, calves staying near mom. Each behaviour runs several times; we check how often it happens.
//   node tools/check-animals.js
import { Sim } from '../shared/sim/sim.js';
import { BULL_TIERS, BULL_TYPES, MOOSE_COATS, COW_TYPES, CALF_TYPES, SPECIES, CALF_LEASH } from '../shared/sim/catalog.js';
import { makeBullParams } from '../shared/sim/bullparams.js';
import { WildEvent } from '../shared/sim/wildlife.js';

let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const pct = (n, N) => Math.round((n / N) * 100) + '%';

// ---- the catalogue
const want = [4, 4, 6, 6, 6, 6, 3];
ok(BULL_TIERS.length === 7 && want.every((n, i) => BULL_TYPES.filter((t) => t.tier === i).length === n), `bull types per tier: ${BULL_TIERS.map((t) => BULL_TYPES.filter((x) => x.tier === t.i).length).join(' ')} (want ${want.join(' ')}), ${BULL_TYPES.length} in all`);
ok(new Set(BULL_TYPES.map((t) => t.id)).size === BULL_TYPES.length, 'bull type ids are unique');
const coatOk = (kind, w) => Object.keys(w || {}).every((k) => MOOSE_COATS[kind][k]);
ok(BULL_TYPES.every((t) => coatOk('bull', t.coat)) && COW_TYPES.every((t) => coatOk('cow', t.coat)) && CALF_TYPES.every((t) => coatOk('calf', t.coat)), 'every coat a type asks for exists');
let badBull = '';
for (const t of BULL_TYPES) for (let i = 0; i < 20; i++) {
  const p = makeBullParams({ type: t.id }), T = BULL_TIERS[t.tier];
  if (!(p.scale >= T.scale[0] - 1e-9 && p.scale <= T.scale[1] + 1e-9) || !(p.spreadIn >= T.spreadIn[0] - 1 && p.spreadIn <= T.spreadIn[1] + 1) || !(p.points >= 2) || !Number.isFinite(p.ant.spread)) badBull = `${t.id}: scale ${p.scale} spread ${p.spreadIn} pts ${p.points}`;
}
ok(!badBull, 'every bull type rolls a bull inside its tier (size, spread, points)' + (badBull ? ' — ' + badBull : ''));
const tierN = new Array(7).fill(0); for (let i = 0; i < 4000; i++) tierN[makeBullParams().tier]++;
ok(tierN[6] > 40 && tierN[6] < 300, `random bulls by tier (of 4000): ${tierN.join(' ')} — extremely large ones are rare`);
ok(Object.values(SPECIES).every((S) => S.sizes.length >= 2 && S.coats.length >= 3), `other species: ${Object.entries(SPECIES).map(([k, S]) => `${k} ${S.sizes.length} sizes × ${S.coats.length} coats`).join(', ')}`);

// ---- running a scene
function scene(name, q = {}, T = 300, each) {
  const s = new Sim({ log: true }); s.addHunter('h', 'H'); s.scenario(name, (k) => (q[k] != null ? String(q[k]) : null));
  for (let t = 0; t < T; t += 0.05) { s.update(0.05); s.takeEvents(); if (each) each(s, t); }
  return s;
}
const N = 12;

// a young bull pesters a lone cow → she bellows → a bigger bull comes → the young one is run off (or they fight)
let bellowed = 0, bigCame = 0, youngOff = 0;
for (let i = 0; i < N; i++) {
  const s = scene('court', { tier: 0 }, 420); const L = s.log.join('\n');
  if (/bellows, fed up/.test(L)) bellowed++;
  if (/comes in to the bellowing cow|heard a cow bellow/.test(L)) bigCame++;
  if (/pushed off by a bigger bull|lost the fight|backed down/.test(L)) youngOff++;
}
ok(bellowed >= N * 0.6, `a young bull pestering a lone cow makes her bellow: ${pct(bellowed, N)}`);
ok(bigCame >= N * 0.3, `her bellows bring in another bull: ${pct(bigCame, N)}`);
ok(youngOff >= N * 0.2, `... who runs the young one off (or beats him): ${pct(youngOff, N)}`);

// a lone cow and a big bull: welcome, he stays close, no bellowing
let close = 0, bel2 = 0;
for (let i = 0; i < N; i++) {
  let near = 0; const s = scene('court', { tier: 5 }, 300, (s) => { const b = s.bulls.find((x) => x.cowGoal), c = s.cows[0]; if (b && c && Math.hypot(b.a.x - c.cow.x, b.a.z - c.cow.z) < 16) near += 0.05; });
  if (near > 60) close++; if (/bellows, fed up/.test(s.log.join('\n'))) bel2++;
}
ok(close >= N * 0.6, `a lone cow lets a big bull stay close (tending her): ${pct(close, N)}`);
ok(bel2 <= N * 0.2, `... and rarely bellows at him: ${pct(bel2, N)}`);

// a cow with a calf keeps a bull at a distance
let kept = 0, moved = 0;
for (let i = 0; i < N; i++) {
  let closeT = 0; const s = scene('calfcow', { tier: 4 }, 300, (s) => { const b = s.bulls[0], c = s.cows[0]; if (b && c && !b.done && Math.hypot(b.a.x - c.cow.x, b.a.z - c.cow.z) < 30) closeT += 0.05; });
  if (closeT < 20) kept++; if (/with calf moves away/.test(s.log.join('\n'))) moved++;
}
ok(kept >= N * 0.75, `a cow with a calf keeps a bull beyond ~30 m (under 20 s closer): ${pct(kept, N)}`);
ok(moved >= N * 0.4, `... moving off when he comes closer: ${pct(moved, N)}`);

// wolves: the cow defends then runs with her calf, the calf staying at her side; a very large bull stands his ground
let cowRan = 0, calfFar = 0, bigStood = 0, bigRan = 0;
for (let i = 0; i < N; i++) {
  let far = 0;
  const s = scene('wolves', { tier: 5 }, 200, (s) => { const c = s.cows[0]; if (c && !c.done && c.state !== 'flee') for (const k of c.calves) if (Math.hypot(k.x - c.cow.x, k.z - c.cow.z) > CALF_LEASH.max + 15) far += 0.05; });
  if (/cow #\d+ (ran from wolves|faces a wolf)/.test(s.log.join('\n'))) cowRan++; if (far > 10) calfFar++;
  const t = scene('wolves', { tier: 5, target: 'bull' }, 150); const L = t.log.join('\n');
  if (/stands his ground/.test(L)) bigStood++; if (/-> flee .*ran from wolves/.test(L)) bigRan++;
}
ok(cowRan >= N * 0.7, `wolves: the cow faces them, then runs off with her calf: ${pct(cowRan, N)}`);
ok(calfFar <= N * 0.2, `... the calf keeps with her: ${pct(N - calfFar, N)}`);
ok(bigStood >= N * 0.6 && bigRan <= N * 0.2, `wolves testing a very large bull: he stands his ground ${pct(bigStood, N)}, runs ${pct(bigRan, N)}`);
let smallRan = 0;
for (let i = 0; i < N; i++) { const s = scene('wolves', { tier: 0, target: 'bull' }, 200); if (/-> flee .*ran from wolves|moved off from wolves/.test(s.log.join('\n'))) smallRan++; }
ok(smallRan >= N * 0.5, `wolves: a small bull runs off: ${pct(smallRan, N)}`);

// a coyote and a hare
let chased = 0, hareRan = 0;
for (let i = 0; i < N; i++) { const s = scene('hare', {}, 120); const L = s.log.join('\n'); if (/coyote gave up the chase|rabbit caught/.test(L)) chased++; if (/rabbit (bolted|ran from)|rabbit caught/.test(L)) hareRan++; }
ok(chased >= N * 0.5, `a coyote stalks and chases a hare: ${pct(chased, N)}`);
ok(hareRan >= N * 0.5, `... the hare bolts (or is caught): ${pct(hareRan, N)}`);

// a porcupine and a coyote: quills up, the coyote gives way
{
  let quills = 0, gave = 0;
  for (let i = 0; i < N; i++) {
    const s = new Sim({ log: true }); const H = s.addHunter('h', 'H');
    const p = new WildEvent(s, 'porcupine', { at: { x: H.x + 30, z: H.z - 120 } }); const c = new WildEvent(s, 'coyote', { at: { x: H.x + 30, z: H.z - 160 }, n: 1 }); s.wild = [p, c];
    c.lead.goTo(p.lead.x, p.lead.z, 'walk'); c.setState('avoid'); c.st = -40;
    for (let t = 0; t < 60; t += 0.05) { s.update(0.05); s.takeEvents(); }
    const L = s.log.join('\n'); if (/porcupine raises its quills/.test(L)) quills++; if (/coyote gives way to a porcupine/.test(L)) gave++;
  }
  ok(quills >= N * 0.7 && gave >= N * 0.5, `a coyote walks up to a porcupine: quills up ${pct(quills, N)}, the coyote gives way ${pct(gave, N)}`);
}

// a long ordinary morning: calves never wander off, nothing breaks, and every species turns up
{
  const s = new Sim({ log: true }); s.addHunter('a', 'A'); s.addHunter('b', 'B'); const seen = new Set(); let worst = 0, calfT = 0;
  for (let t = 0; t < 7200; t += 0.05) {
    s.update(0.05); s.takeEvents();
    for (const b of s.bodies.values()) { seen.add(b.kind); if (!Number.isFinite(b.x)) throw new Error('NaN ' + b.kind); }
    for (const c of s.cows) if (['graze', 'listen', 'bed', 'walk', 'drink'].includes(c.state)) for (const k of c.calves) { calfT += 0.05; worst = Math.max(worst, Math.hypot(k.x - c.cow.x, k.z - c.cow.z)); }
  }
  ok(worst < CALF_LEASH.max + 12, `two hours: a calf is never more than ${Math.round(worst)} m from its mother while she is calm (${Math.round(calfT)} calf-seconds)`);
  ok(['bull', 'cow', 'rabbit', 'raccoon'].every((k) => seen.has(k)), `two hours: seen ${[...seen].sort().join(', ')}`);
}
console.log(fail ? `${fail} failed` : 'all animal checks passed');
process.exit(fail ? 1 : 0);
