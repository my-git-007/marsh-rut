// Checks the animal engine without a browser: the catalogue is complete, and the behaviours happen —
// courtship and bellows, a cow with a calf keeping bulls at a distance, predators and how each animal answers
// them, calves staying near mom. Each behaviour runs several times; we check how often it happens.
//   node tools/check-animals.js
import { Sim } from '../shared/sim/sim.js';
import {
  BULL_TIERS,
  BULL_TYPES,
  MOOSE_COATS,
  COW_TYPES,
  CALF_TYPES,
  SPECIES,
  CALF_LEASH,
  MARSH_SPECIES,
} from '../shared/sim/catalog.js';
import { makeBullParams } from '../shared/sim/bullparams.js';
import { WildEvent } from '../shared/sim/wildlife.js';
import { Body } from '../shared/sim/body.js';
import { ROCKS, SOLIDS, inWater, rockOut, useWorld } from '../shared/world.js';

let fail = 0;
const ok = (c, m) => {
  console.log((c ? 'PASS ' : 'FAIL ') + m);
  if (!c) fail++;
};
const pct = (n, N) => Math.round((n / N) * 100) + '%';

// ---- the catalogue
const want = [4, 6, 6, 6, 6, 3];
ok(
  BULL_TIERS.length === 6 && want.every((n, i) => BULL_TYPES.filter((t) => t.tier === i).length === n),
  `bull types per tier: ${BULL_TIERS.map((t) => BULL_TYPES.filter((x) => x.tier === t.i).length).join(' ')} (want ${want.join(' ')}), ${BULL_TYPES.length} in all`,
);
ok(new Set(BULL_TYPES.map((t) => t.id)).size === BULL_TYPES.length, 'bull type ids are unique');
// sizes, from the 3rd largest (tier 3): each size down ~5% smaller in body and ~10% in antlers; the two biggest ~10% up
{
  const mid = (r) => (r[0] + r[1]) / 2,
    T = BULL_TIERS,
    near = (a, b) => Math.abs(a / b - 1) < 0.02;
  const body = [0.95 ** 3, 0.95 ** 2, 0.95, 1, 1.1, 1.21],
    rack = [0.9 ** 3, 0.9 ** 2, 0.9, 1, 1.1, 1.21];
  const bad = T.filter(
    (t) => !near(mid(t.scale), mid(T[3].scale) * body[t.i]) || !near(mid(t.spreadIn), mid(T[3].spreadIn) * rack[t.i]),
  );
  ok(
    !bad.length,
    `bull sizes step as asked: body ${T.map((t) => mid(t.scale).toFixed(3)).join(' ')}, antlers ${T.map((t) => mid(t.spreadIn) + '"').join(' ')}` +
      (bad.length ? ' — off: ' + bad.map((t) => t.k).join(', ') : ''),
  );
  const coatOf = (i) => Object.keys(T[i].coats);
  ok(
    coatOf(5).every((k) => MOOSE_COATS.bull[k].c.hump) &&
      [2, 3, 4].every((i) => coatOf(i).every((k) => !MOOSE_COATS.bull[k].c.hump)) &&
      [0, 1, 2, 3, 4].every((i) => coatOf(i).every((k) => parseInt(MOOSE_COATS.bull[k].c.body.slice(1, 3), 16) < 0x28)),
    `bull coats: the biggest (old) ${coatOf(5).join('/')}; every other size near-black ${coatOf(0).join('/')}`,
  );
  ok(
    T.every((t) => Object.keys(t.coats).every((k) => MOOSE_COATS.bull[k])) && !BULL_TYPES.some((t) => t.coat),
    'every tier coat exists, and bulls take their coat from their size',
  );
}
const coatOk = (kind, w) => Object.keys(w || {}).every((k) => MOOSE_COATS[kind][k]);
ok(
  COW_TYPES.every((t) => coatOk('cow', t.coat)) && CALF_TYPES.every((t) => coatOk('calf', t.coat)),
  'every coat a cow or calf type asks for exists',
);
let badBull = '';
for (const t of BULL_TYPES)
  for (let i = 0; i < 20; i++) {
    const p = makeBullParams({ type: t.id }),
      T = BULL_TIERS[t.tier];
    if (
      !(p.scale >= T.scale[0] - 1e-9 && p.scale <= T.scale[1] + 1e-9) ||
      !(p.spreadIn >= T.spreadIn[0] - 1 && p.spreadIn <= T.spreadIn[1] + 1) ||
      !(p.points >= 2) ||
      !Number.isFinite(p.ant.spread)
    )
      badBull = `${t.id}: scale ${p.scale} spread ${p.spreadIn} pts ${p.points}`;
  }
ok(!badBull, 'every bull type rolls a bull inside its tier (size, spread, points)' + (badBull ? ' — ' + badBull : ''));
const tierN = new Array(6).fill(0);
for (let i = 0; i < 4000; i++) tierN[makeBullParams().tier]++;
ok(
  tierN[5] > 40 && tierN[5] < 300,
  `random bulls by tier (of 4000): ${tierN.join(' ')} — extremely large ones are rare`,
);
ok(
  Object.values(SPECIES).every((S) => S.sizes.length >= 2 && S.coats.length >= 2),
  `other species: ${Object.entries(SPECIES)
    .map(([k, S]) => `${k} ${S.sizes.length} sizes × ${S.coats.length} coats`)
    .join(', ')}`,
);

// ---- running a scene
function scene(name, q = {}, T = 300, each) {
  const s = new Sim({ log: true });
  s.addHunter('h', 'H');
  s.scenario(name, (k) => (q[k] != null ? String(q[k]) : null));
  for (let t = 0; t < T; t += 0.05) {
    s.update(0.05);
    s.takeEvents();
    if (each) each(s, t);
  }
  return s;
}
const N = 12;

// a young bull pesters a lone cow → she bellows → a bigger bull comes → the young one is run off (or they fight)
// (more tries here: whether the bigger bull runs the young one off is close to a coin toss — about 55-65 % —
// so with 12 tries an unlucky run fell under the bar about once in a hundred and stopped a deploy)
const NC = 40;
let bellowed = 0,
  bigCame = 0,
  youngOff = 0;
for (let i = 0; i < NC; i++) {
  const s = scene('court', { tier: 0 }, 420);
  const L = s.log.join('\n');
  if (/bellows, fed up/.test(L)) bellowed++;
  if (/comes in to the bellowing cow|heard a cow bellow/.test(L)) bigCame++;
  if (/pushed off by a bigger bull|lost the fight|backed down/.test(L)) youngOff++;
}
ok(bellowed >= NC * 0.6, `a young bull pestering a lone cow makes her bellow: ${pct(bellowed, NC)}`);
ok(bigCame >= NC * 0.3, `her bellows bring in another bull: ${pct(bigCame, NC)}`);
ok(youngOff >= NC * 0.2, `... who runs the young one off (or beats him): ${pct(youngOff, NC)}`);

// a lone cow and a big bull: welcome, he stays close, no bellowing
let close = 0,
  bel2 = 0;
for (let i = 0; i < N; i++) {
  let near = 0;
  const s = scene('court', { tier: 4 }, 300, (s) => {
    const b = s.bulls.find((x) => x.cowGoal),
      c = s.cows[0];
    if (b && c && Math.hypot(b.a.x - c.cow.x, b.a.z - c.cow.z) < 16) near += 0.05;
  });
  if (near > 60) close++;
  if (/bellows, fed up/.test(s.log.join('\n'))) bel2++;
}
ok(close >= N * 0.6, `a lone cow lets a big bull stay close (tending her): ${pct(close, N)}`);
ok(bel2 <= N * 0.2, `... and rarely bellows at him: ${pct(bel2, N)}`);

// a cow with a calf keeps a bull at a distance
let kept = 0,
  moved = 0;
for (let i = 0; i < N; i++) {
  let closeT = 0;
  const s = scene('calfcow', { tier: 3 }, 300, (s) => {
    const b = s.bulls[0],
      c = s.cows[0];
    if (b && c && !b.done && Math.hypot(b.a.x - c.cow.x, b.a.z - c.cow.z) < 30) closeT += 0.05;
  });
  if (closeT < 20) kept++;
  if (/with calf moves away/.test(s.log.join('\n'))) moved++;
}
ok(kept >= N * 0.75, `a cow with a calf keeps a bull beyond ~30 m (under 20 s closer): ${pct(kept, N)}`);
ok(moved >= N * 0.4, `... moving off when he comes closer: ${pct(moved, N)}`);

// wolves: the cow defends then runs with her calf, the calf staying at her side; a very large bull stands his ground
let cowRan = 0,
  calfFar = 0,
  bigStood = 0,
  bigRan = 0;
for (let i = 0; i < N; i++) {
  let far = 0;
  const s = scene('wolves', { tier: 4 }, 200, (s) => {
    const c = s.cows[0];
    if (c && !c.done && c.state !== 'flee')
      for (const k of c.calves) if (Math.hypot(k.x - c.cow.x, k.z - c.cow.z) > CALF_LEASH.max + 15) far += 0.05;
  });
  if (/cow #\d+ (ran from wolves|faces a wolf)/.test(s.log.join('\n'))) cowRan++;
  if (far > 10) calfFar++;
  const t = scene('wolves', { tier: 4, target: 'bull' }, 150);
  const L = t.log.join('\n');
  if (/stands his ground/.test(L)) bigStood++;
  if (/-> flee .*ran from wolves/.test(L)) bigRan++;
}
ok(cowRan >= N * 0.7, `wolves: the cow faces them, then runs off with her calf: ${pct(cowRan, N)}`);
ok(calfFar <= N * 0.2, `... the calf keeps with her: ${pct(N - calfFar, N)}`);
ok(
  bigStood >= N * 0.6 && bigRan <= N * 0.2,
  `wolves testing a very large bull: he stands his ground ${pct(bigStood, N)}, runs ${pct(bigRan, N)}`,
);
let smallRan = 0;
for (let i = 0; i < N; i++) {
  const s = scene('wolves', { tier: 0, target: 'bull' }, 200);
  if (/-> flee .*ran from wolves|moved off from wolves/.test(s.log.join('\n'))) smallRan++;
}
ok(smallRan >= N * 0.5, `wolves: a small bull runs off: ${pct(smallRan, N)}`);

// a coyote and a hare
let chased = 0,
  hareRan = 0;
for (let i = 0; i < N; i++) {
  const s = scene('hare', {}, 120);
  const L = s.log.join('\n');
  if (/coyote gave up the chase|rabbit caught/.test(L)) chased++;
  if (/rabbit (bolted|ran from)|rabbit caught/.test(L)) hareRan++;
}
ok(chased >= N * 0.5, `a coyote stalks and chases a hare: ${pct(chased, N)}`);
ok(hareRan >= N * 0.5, `... the hare bolts (or is caught): ${pct(hareRan, N)}`);

// a porcupine and a coyote: quills up, the coyote gives way
{
  let quills = 0,
    gave = 0;
  for (let i = 0; i < N; i++) {
    const s = new Sim({ log: true });
    const H = s.addHunter('h', 'H');
    const p = new WildEvent(s, 'porcupine', { at: { x: H.x + 30, z: H.z - 120 } });
    const c = new WildEvent(s, 'coyote', { at: { x: H.x + 30, z: H.z - 160 }, n: 1 });
    s.wild = [p, c];
    c.lead.goTo(p.lead.x, p.lead.z, 'walk');
    c.setState('avoid');
    c.st = -40;
    for (let t = 0; t < 60; t += 0.05) {
      s.update(0.05);
      s.takeEvents();
    }
    const L = s.log.join('\n');
    if (/porcupine raises its quills/.test(L)) quills++;
    if (/coyote gives way to a porcupine/.test(L)) gave++;
  }
  ok(
    quills >= N * 0.7 && gave >= N * 0.5,
    `a coyote walks up to a porcupine: quills up ${pct(quills, N)}, the coyote gives way ${pct(gave, N)}`,
  );
}

// a long ordinary morning: calves never wander off, nothing breaks, and every species turns up
{
  const s = new Sim({ log: true });
  s.addHunter('a', 'A');
  s.addHunter('b', 'B');
  const seen = new Set();
  let worst = 0,
    calfT = 0,
    inRock = 0,
    byRock = 0,
    closest = { gap: Infinity };
  for (let t = 0; t < 7200; t += 0.05) {
    s.update(0.05);
    s.takeEvents();
    for (const b of s.bodies.values()) {
      seen.add(b.kind);
      if (!Number.isFinite(b.x)) throw new Error('NaN ' + b.kind);
      for (const k of SOLIDS) {
        const d = Math.hypot(b.x - k.x, b.z - k.z);
        // (never more than half its width over the edge of a rock, root plate or tall stump)
        if (d < k.r + b.pad * 0.5) inRock++;
        if (d - k.r < closest.gap) closest = { kind: b.kind, gap: d - k.r, pad: b.pad };
        else if (d < k.r + 4) byRock += 0.05;
      }
    }
    for (const c of s.cows)
      if (['graze', 'listen', 'bed', 'walk', 'drink'].includes(c.state))
        for (const k of c.calves) {
          calfT += 0.05;
          worst = Math.max(worst, Math.hypot(k.x - c.cow.x, k.z - c.cow.z));
        }
  }
  ok(
    worst < CALF_LEASH.max + 12,
    `two hours: a calf is never more than ${Math.round(worst)} m from its mother while she is calm (${Math.round(calfT)} calf-seconds)`,
  );
  ok(
    inRock === 0,
    `two hours: no animal is ever inside a rock, root plate or tall stump (${ROCKS.length} rocks, ${SOLIDS.length - ROCKS.length} of the wood, ${Math.round(byRock)} animal-seconds beside one; closest a ${closest.kind} ${closest.gap.toFixed(2)} m from its edge, half-width ${closest.pad?.toFixed(2)} m)`,
  );
  ok(
    ['bull', 'cow'].every((k) => seen.has(k)) && [...seen].every((k) => !SPECIES[k] || MARSH_SPECIES.includes(k)),
    `two hours: seen ${[...seen].sort().join(', ')} (this marsh: moose, ${MARSH_SPECIES.join(', ')})`,
  );
}

// moose sent straight through the biggest rocks (and the smaller ones round them), and the biggest root plates, go
// round and get there
{
  const s = new Sim({ log: false });
  useWorld(s.map);
  const wood = SOLIDS.filter((k) => !ROCKS.includes(k));
  const big = [...[...ROCKS].sort((a, b) => b.r - a.r).slice(0, 4), ...wood.sort((a, b) => b.r - a.r).slice(0, 3)];
  const free = (x, z) => !inWater(x, z) && !rockOut(x, z, 1.5);
  let arrived = 0,
    inside = 0,
    N = 0;
  for (const k of big)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2,
        D = k.r + 25;
      const x0 = k.x + Math.cos(a) * D,
        z0 = k.z + Math.sin(a) * D,
        x1 = k.x - Math.cos(a) * D,
        z1 = k.z - Math.sin(a) * D;
      if (!free(x0, z0) || !free(x1, z1)) continue;
      N++;
      const b = new Body(s, 'bull', { scale: 1.1 });
      b.place(x0, z0, Math.atan2(Math.sin(a), -Math.cos(a))); // facing the rock
      b.goTo(x1, z1, i % 2 ? 'trot' : 'walk');
      for (let t = 0; t < 180 && !b.arrived; t += 0.05) {
        b.update(0.05);
        for (const q of SOLIDS) if (Math.hypot(b.x - q.x, b.z - q.z) < q.r + 0.4) inside++;
      }
      if (b.arrived) arrived++;
      b.remove();
    }
  ok(
    N >= 20 && arrived === N && inside === 0,
    `moose sent straight through the 4 biggest boulders and 3 biggest root plates (${big.map((k) => (2 * k.r).toFixed(1)).join(', ')} m across) walk round them: arrived ${arrived}/${N}, too close ${inside} times`,
  );
}
console.log(fail ? `${fail} failed` : 'all animal checks passed');
process.exit(fail ? 1 : 0);
