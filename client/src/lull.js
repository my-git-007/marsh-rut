// lull.js — what the hunter feels of the wind. The host's wind (shared/wind.js) carries the scent to the animals and
// is the same for everyone; on top of it each browser adds lulls, now and then the wind dropping away almost to
// nothing for a while and picking up again. They only change what is heard and seen here: the wind noise and how
// much the grass, trees and bushes move. The scent keeps drifting as before.
import { clamp, rand } from '../../shared/util.js';

const LULL = { k: 1, target: 1, phase: 'blow', t: rand(20, 45), depth: 0.1 };

function updateLull(dt) {
  const L = LULL;
  L.t -= dt;
  if (L.t <= 0) {
    if (L.phase === 'blow') {
      // a lull: the wind falls away to a breath (or nothing) ...
      L.phase = 'lull';
      L.depth = Math.random() < 0.35 ? rand(0.0, 0.06) : rand(0.08, 0.3);
      L.t = rand(6, 20);
    } else {
      // ... and comes back
      L.phase = 'blow';
      L.t = rand(25, 75);
    }
  }
  L.target = L.phase === 'lull' ? L.depth : 1;
  // falling away takes a few seconds; picking up again a little longer
  const tau = L.target < L.k ? 1.6 : 2.4;
  L.k = clamp(L.k + (L.target - L.k) * Math.min(1, dt / tau), 0, 1);
}

export { LULL, updateLull };
