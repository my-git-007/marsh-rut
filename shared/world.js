// The hunting grounds: which map is being played, and everything about its ground that the simulation and the
// browser need (outline, stream, pond, pools, ground height, the tree stands, the shrubs). Each map lives in
// shared/maps/; this module hands out the one picked with useWorld(id). Every map is deterministic (fixed seeds),
// so the server and every player's browser build exactly the same ground.
//
// One process can hold several maps at once (the server runs a marsh for each player, each on the map they
// chose): a Sim calls useWorld(its map) before it does anything, and the bindings below switch to that map.
// Switching is cheap: each map is built once and kept.
import { build as buildMarsh } from './maps/marsh.js';
import { build as buildAlpine } from './maps/alpine.js';
export { WATER_Y } from './maps/common.js';

export const MAP_IDS = ['the-marsh', 'alpine-valley-stream'];
// (fixed comparisons, no lookup by name: an id from a player's message can only ever pick one of these builders)
const builderFor = (id) => (id === 'alpine-valley-stream' ? buildAlpine : buildMarsh);
export const DEFAULT_MAP = 'the-marsh';

let W = null;
export let MAP = null; // the map being used: { id, ... } (see shared/maps/*.js build())
export let MARSH = null, // the open ground's middle and size: { cx, cz, a, b }
  POND = null,
  STREAM = [],
  STREAM_CP = [],
  POOLS = [],
  STANDS = [],
  MAIN_STAND = null,
  WATER_PTS = [],
  SHRUBS = [],
  SHRUB_PTS = [],
  ROCKS = []; // boulders the animals walk round: { x, z, size, r (footprint radius), m, yaw, tilt }

// pick the map (built the first time it is used); returns its id. An unknown id gets the default map.
export function useWorld(id) {
  const build = builderFor(id);
  if (W && W.build === build) return W.id;
  W = build();
  W.build = build;
  ({ MARSH, POND, STREAM, STREAM_CP, POOLS, STANDS, MAIN_STAND, WATER_PTS, SHRUBS, SHRUB_PTS } = W);
  ROCKS = W.ROCKS || [];
  MAP = W;
  return W.id;
}
// (older callers) make sure some map is in use
export function buildWorld() {
  if (!W) useWorld(DEFAULT_MAP);
}

// < 0 out on the open ground (the marsh, the valley floor), > 0 in the timber; roughly metres / 300
export const marshE = (x, z) => W.marshE(x, z);
export const pondE = (x, z) => W.pondE(x, z);
export const streamDist = (x, z) => W.streamDist(x, z);
export const groundAt = (x, z) => W.groundAt(x, z);
// how much the far timber raises the ground (the terrain stands in for distant trees)
export const canopyAt = (x, z) => W.canopyAt(x, z);
// metres into the timber (0 out on the open ground)
export const outDist = (x, z) => W.outDist(x, z);
export const inWater = (x, z) => W.inWater(x, z);
export const edgeAt = (ang) => W.edgeAt(ang);
// Is (x,z) inside the view lane in front of any stand? (kept clear of trees and brush)
export const inStandCorridor = (x, z, maxD) => W.inStandCorridor(x, z, maxD);
export const nearestStandDist = (x, z) => W.nearestStandDist(x, z);

// If (x,z) is inside a rock (grown by pad, the animal's half-width), the nearest point just outside it; else null.
export function rockOut(x, z, pad) {
  for (const k of ROCKS) {
    const dx = x - k.x,
      dz = z - k.z,
      R = k.r + pad,
      d = Math.hypot(dx, dz);
    if (d < R) return d < 1e-6 ? { x: k.x + R, z: k.z } : { x: k.x + (dx / d) * R, z: k.z + (dz / d) * R };
  }
  return null;
}
// Walking from (x,z) toward (tx,tz): if a rock is in the way within `look` metres, a point beside it to head
// for instead (on the side the walker is already on); else null.
export function rockDetour(x, z, tx, tz, pad, look) {
  if (!ROCKS.length) return null;
  const L = Math.hypot(tx - x, tz - z);
  if (L < 0.01) return null;
  const ux = (tx - x) / L,
    uz = (tz - z) / L,
    nx = -uz,
    nz = ux;
  const reach = Math.min(L, look);
  let best = null,
    bt = Infinity; // the nearest rock in the way wins
  for (const k of ROCKS) {
    const cx = k.x - x,
      cz = k.z - z,
      R = k.r + pad,
      t = cx * ux + cz * uz,
      side = cx * nx + cz * nz;
    if (t < -R || t > reach + R || t >= bt || Math.abs(side) >= R) continue;
    bt = t;
    const s = side > 0 ? -1 : 1; // pass on the side away from the rock's middle
    best = { x: k.x + nx * s * (R + 1.5), z: k.z + nz * s * (R + 1.5) };
  }
  return best;
}

export const off = (e, d) => ({ x: e.x + e.nx * d, z: e.z + e.nz * d });
export function nearestPoint(list, x, z, maxD) {
  let best = null,
    bd = maxD || 1e9;
  for (const p of list) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}
