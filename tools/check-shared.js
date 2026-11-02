// Runs the shared simulation with no browser: three hunters, an hour of marsh time, calls now and then.
// Fails loudly if anything in shared/ touches the DOM or throws.
import { Sim } from '../shared/sim/sim.js';
import { STANDS } from '../shared/world.js';

const sim = new Sim({ log: true });
console.log('stands:', STANDS.map(s => `${s.i}:${s.name}(${s.x.toFixed(0)},${s.z.toFixed(0)})`).join(' '));
const ids = ['a', 'b', 'c']; for (const id of ids) { const H = sim.addHunter(id, 'Hunter ' + id); console.log('joined', id, 'stand', H.stand, STANDS[H.stand].name); }
const counts = {}; let maxBodies = 0, snapBytes = 0, snaps = 0;
const dt = 0.05, T = 3600;
for (let t = 0, step = 0; t < T; t += dt, step++) {
  sim.update(dt);
  if (step % 400 === 0) { const id = ids[(step / 400) % 3 | 0]; sim.hunterCall(id, Math.random() < 0.5 ? 'long' : 'coax', 4, 'ucowL_test'); }
  if (step === 30000) sim.removeHunter('c');
  for (const e of sim.takeEvents()) counts[e.e] = (counts[e.e] || 0) + 1;
  if (step % 2 === 0) { const s = JSON.stringify(sim.snapshot()); snapBytes += s.length; snaps++; maxBodies = Math.max(maxBodies, sim.bodies.size); }
  for (const b of sim.bodies.values()) if (!Number.isFinite(b.x) || !Number.isFinite(b.z)) throw new Error('NaN position on ' + b.kind + ' #' + b.id);
}
console.log('events:', JSON.stringify(counts));
console.log('max animals at once:', maxBodies, '· mean snapshot', Math.round(snapBytes / snaps), 'bytes');
console.log('bull log (last 25):\n  ' + sim.log.slice(-25).join('\n  '));
console.log('\n' + sim.debugText());
for (const sc of ['showcase', 'bull', 'wild', 'antlers', 'lineup', 'fight', 'cows']) { const s = new Sim(); s.addHunter('x'); s.scenario(sc, () => null); for (let i = 0; i < 200; i++) s.update(0.05); s.takeEvents(); console.log('scenario', sc, 'ok,', s.bodies.size, 'animals'); }
