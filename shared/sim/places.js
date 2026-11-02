// Where animals come from and go to: points on the timber edge and out in the marsh, chosen relative to
// the hunters' stands (bulls show up in front of a hunter, animals leave by edges away from the stands).
import { TAU, PI, rand, wrapA } from '../util.js';
import { MARSH, marshE, pondE, streamDist, edgeAt } from '../world.js';

export const SPOT_R = 68.6; // 75 yards: inside this, a call or a pour gives you away

function standOf(sim, h) { return h || sim.pickHunter() || sim.stands[0]; }
export function randomEdge(sim, minD, maxD = 1e9, ref) {
  const r = standOf(sim, ref);
  for (let i = 0; i < 300; i++) { const e = edgeAt(rand(0, TAU)); const d = Math.hypot(e.x - r.x, e.z - r.z); if (d >= minD && d <= maxD && streamDist(e.x, e.z) > 10) return e; }
  return edgeAt(-PI / 2);
}
// a bull's entry point: 150–850 m from his hunter, somewhere in front of (within 150° of) where that stand faces
export function bullEdge(sim, avoid, hunter) {
  const r = standOf(sim, hunter); const yaw = r.yaw || 0;
  for (let i = 0; i < 400; i++) {
    const e = edgeAt(rand(0, TAU)); const dx = e.x - r.x, dz = e.z - r.z, d = Math.hypot(dx, dz);
    const rel = (wrapA(Math.atan2(dx, -dz) + yaw) * 180) / PI;
    if (avoid && Math.hypot(e.x - avoid.x, e.z - avoid.z) < 180) continue;
    if (d >= 150 && d <= 850 && Math.abs(rel) <= 150 && streamDist(e.x, e.z) > 10) return e;
  }
  return randomEdge(sim, 200, 1e9, r);
}
// the edge nearest a point, staying clear of the occupied stands
export function nearestEdge(sim, x, z) {
  let best = null, bd = 1e9;
  for (let i = 0; i < 48; i++) {
    const e = edgeAt((i / 48) * TAU); let d = Math.hypot(e.x - x, e.z - z);
    for (const h of sim.hunters.values()) if (Math.hypot(e.x - h.x, e.z - h.z) < 160) d += 400;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
export function edgeAwayFrom(sim, x, z, fx, fz) { const d = Math.hypot(x - fx, z - fz) || 1; return nearestEdge(sim, x + ((x - fx) / d) * 120, z + ((z - fz) / d) * 120); }
// a spot out in the marsh, at least minD from every hunter and within maxD of one
export function marshPoint(sim, minD, maxD) {
  for (let i = 0; i < 400; i++) {
    const x = rand(-220, 220), z = rand(-740, -30); if (marshE(x, z) > -0.06) continue; if (pondE(x, z) < 0.7) continue;
    const d = sim.nearestHunter(x, z).d; if (d >= minD && d <= maxD) return { x, z };
  }
  return { x: MARSH.cx, z: -400 };
}
