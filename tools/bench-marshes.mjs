// How much CPU does one marsh take? Steps N marshes (one hunter each) for 60 s of marsh time.
//   node tools/bench-marshes.mjs [N]
import { Sim } from '../shared/sim/sim.js';
import { TICK_HZ } from '../shared/protocol.js';
const N = +process.argv[2] || 40;
const sims = Array.from({ length: N }, (_, i) => {
  const s = new Sim();
  s.addHunter('h', 'H' + i, i % 8);
  s.nextBull = 1;
  return s;
});
for (let k = 0; k < 20 * 120; k++) for (const s of sims) s.update(1 / TICK_HZ); // warm up: 2 minutes, bulls and cows out
const steps = TICK_HZ * 60;
const t0 = process.hrtime.bigint();
for (let k = 0; k < steps; k++)
  for (const s of sims) {
    s.update(1 / TICK_HZ);
    if (k % 2) JSON.stringify(s.snapshot()), s.takeEvents();
  }
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
const animals = sims.reduce((n, s) => n + s.bodies.size, 0);
console.log(
  `${N} marshes, ${animals} animals: ${(ms / 60).toFixed(1)} ms of CPU per second of play = ${(ms / 600).toFixed(1)}% of one core`,
);
console.log(`one marsh ≈ ${(ms / 60 / N).toFixed(2)} ms per second (${(ms / 600 / N).toFixed(2)}% of a core)`);
