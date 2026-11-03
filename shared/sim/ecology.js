// How animals notice each other. Twice a second every animal's brain is handed everything in the marsh and
// decides, from the REACT / PREY tables in catalog.js and its own personality, whether to watch, move off,
// run, stand its ground, defend a calf, freeze, raise its quills, or go after something.
// Each body carries `eco = { role, sp }` (role: bullSmall | bullMid | bullBig | cow | cowCalf | calf | bear |
// wolf | coyote | raccoon | rabbit | porcupine; sp: the species, for how far its senses reach).
import { reaction, SENSES } from './catalog.js';
import { nearestEdge, edgeAwayFrom } from './places.js';
import { off, marshE } from '../world.js';

export const SENSE_EVERY = 0.5;
const RANK = { watch: 1, freeze: 1.5, yield: 2, avoid: 2, quills: 3, defend: 3, stand: 3, flee: 4 };

export function updateEcology(sim, dt) {
  sim.ecoT = (sim.ecoT || 0) - dt; if (sim.ecoT > 0) return; sim.ecoT = SENSE_EVERY;
  const all = []; for (const b of sim.bodies.values()) if (b.eco && !b.removed) all.push(b);
  const brains = new Set(); for (const b of all) if (b.brain && b.brain.sense) brains.add(b.brain);
  for (const br of brains) if (!br.done) br.sense(all);
}
// the strongest reaction `self` has to anything around it: { other, d, act, r } or null
//   skip(o): bodies to ignore (its own group)
export function threat(self, role, traits, all, skip) {
  let best = null; const see = (SENSES[self.eco.sp] || SENSES.moose).see * 1.4;
  for (const o of all) {
    if (o === self || o.removed || (skip && skip(o))) continue;
    const d = Math.hypot(o.x - self.x, o.z - self.z); if (d > see) continue;
    const r = reaction(role, o.eco.role, traits); if (!r || r.act === 'ignore' || d > r.notice) continue;
    const act = r.near != null && d < r.near ? r.then : r.act;
    const rank = RANK[act] + (1 - d / r.notice) * 0.5;
    if (!best || rank > best.rank) best = { other: o, d, act, rank, r };
  }
  return best;
}
// the nearest body that passes test(o), within maxD
export function nearestBody(self, all, maxD, test) {
  let best = null, bd = maxD;
  for (const o of all) { if (o === self || o.removed || !test(o)) continue; const d = Math.hypot(o.x - self.x, o.z - self.z); if (d < bd) { bd = d; best = o; } }
  return best ? { b: best, d: bd } : null;
}
// a point `dist` metres from `self`, directly away from `from` (kept out in the marsh if `inMarsh`)
export function awayFrom(self, from, dist, inMarsh) {
  const dx = self.x - from.x, dz = self.z - from.z, d = Math.hypot(dx, dz) || 1;
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.5, -1.5]) {
    const a = Math.atan2(dz, dx) + turn; const x = self.x + Math.cos(a) * dist, z = self.z + Math.sin(a) * dist;
    if (!inMarsh || marshE(x, z) < -0.03) return { x, z };
  }
  return { x: self.x + (dx / d) * dist, z: self.z + (dz / d) * dist };
}
// somewhere in the timber away from `from` (to run off to)
export function escapeFrom(sim, self, from, depth = 200) { return off(edgeAwayFrom(sim, self.x, self.z, from.x, from.z), depth); }
export function exitNear(sim, self, depth = 100) { return off(nearestEdge(sim, self.x, self.z), depth); }
export const distB = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
