// Runs the shared simulation with no browser: three hunters, an hour of marsh time, calls now and then.
// Fails loudly if anything in shared/ touches the DOM or throws.
import { Sim } from '../shared/sim/sim.js';
import { STANDS } from '../shared/world.js';

const sim = new Sim({ log: true });
console.log('stands:', STANDS.map((s) => `${s.i}:${s.name}(${s.x.toFixed(0)},${s.z.toFixed(0)})`).join(' '));
const ids = ['a', 'b', 'c'];
for (const id of ids) {
  const H = sim.addHunter(id, 'Hunter ' + id);
  console.log('joined', id, 'stand', H.stand, STANDS[H.stand].name);
}
const counts = {};
let maxBodies = 0,
  snapBytes = 0,
  snaps = 0;
const dt = 0.05,
  T = 3600;
for (let t = 0, step = 0; t < T; t += dt, step++) {
  sim.update(dt);
  if (step % 400 === 0) {
    const id = ids[(step / 400) % 3 | 0];
    sim.hunterCall(id, Math.random() < 0.5 ? 'long' : 'coax', 4, 'ucowL_test');
  }
  if (step === 30000) sim.removeHunter('c');
  for (const e of sim.takeEvents()) counts[e.e] = (counts[e.e] || 0) + 1;
  if (step % 2 === 0) {
    const s = JSON.stringify(sim.snapshot());
    snapBytes += s.length;
    snaps++;
    maxBodies = Math.max(maxBodies, sim.bodies.size);
  }
  for (const b of sim.bodies.values())
    if (!Number.isFinite(b.x) || !Number.isFinite(b.z)) throw new Error('NaN position on ' + b.kind + ' #' + b.id);
}
console.log('events:', JSON.stringify(counts));
console.log('max animals at once:', maxBodies, '· mean snapshot', Math.round(snapBytes / snaps), 'bytes');
console.log('bull log (last 25):\n  ' + sim.log.slice(-25).join('\n  '));
console.log('\n' + sim.debugText());
for (const sc of [
  'showcase',
  'bull',
  'wild',
  'antlers',
  'lineup',
  'fight',
  'cows',
  'catalog',
  'zoo',
  'court',
  'calfcow',
  'wolves',
  'hare',
]) {
  const s = new Sim();
  s.addHunter('x');
  s.scenario(sc, () => null);
  for (let i = 0; i < 200; i++) s.update(0.05);
  s.takeEvents();
  console.log('scenario', sc, 'ok,', s.bodies.size, 'animals');
}

// Every map, stepped together in one process (as on the server; with more than one map, each must keep to its own
// ground: an animal standing on another map's ground would show up as a body far off its own floor). Animals must
// come out on every map.
import { MAP_IDS, useWorld, groundAt, marshE } from '../shared/world.js';
{
  const sims = MAP_IDS.map((id) => {
    const s = new Sim({ map: id });
    s.addHunter('h-' + id, 'Hunter');
    return s;
  });
  const seen = {};
  for (let step = 0; step < 36000; step++) {
    for (const s of sims) {
      s.update(0.05);
      if (step % 300 === 0) s.hunterCall(s.hunters.keys().next().value, 'long', 4, 'ucowL_test');
      for (const e of s.takeEvents()) seen[s.map + ' ' + e.e] = 1;
      if (step % 20 === 0) s.snapshot();
    }
    if (step % 200 === 0)
      for (const s of sims) {
        useWorld(s.map);
        for (const b of s.bodies.values()) {
          if (!Number.isFinite(b.x) || !Number.isFinite(b.z)) throw new Error(`${s.map}: NaN position on ${b.kind}`);
          // nothing walks up the mountains: every animal stays within reach of its map's open ground
          if (marshE(b.x, b.z) * 300 > 700 || groundAt(b.x, b.z) > 400)
            throw new Error(`${s.map}: ${b.kind} #${b.id} at ${b.x.toFixed(0)},${b.z.toFixed(0)} is far off the floor`);
        }
      }
  }
  for (const s of sims) {
    useWorld(s.map);
    console.log(`map ${s.map}: stands ${s.stands.map((t) => t.name).join(', ')} · ${s.bodies.size} animals now`);
    console.log('  ' + s.debugText().split('\n').slice(0, 4).join('\n  '));
  }
  for (const id of MAP_IDS) if (!seen[id + ' spawn']) throw new Error(`nothing ever came out on ${id}`);
  console.log('maps ok:', MAP_IDS.join(', '));
}
