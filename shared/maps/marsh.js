// Grassland Marsh (id 'the-marsh'): its outline, stream, pond, pools, ground height, the tree stands and the shrubs.
// Everything here is deterministic (fixed seeds), so the server and every player's browser build exactly the same
// marsh. Used through shared/world.js (useWorld), never directly.
import { CatmullRomCurve3, Vector3 } from 'three';
import { TAU, PI, clamp, lerp, smoothstep, noise2, mulberry32, withSeed, rand, random, chance } from '../util.js';
import { WATER_Y, standHelpers, edgeFinder } from './common.js';

const MARSH = { cx: 0, cz: -372, a: 236, b: 368 };
function marshE(x, z) {
  const dx = (x - MARSH.cx) / MARSH.a,
    dz = (z - MARSH.cz) / MARSH.b;
  const ang = Math.atan2(dz, dx);
  const q = Math.pow(Math.pow(Math.abs(dx), 3) + Math.pow(Math.abs(dz), 3), 1 / 3);
  const w = noise2(Math.cos(ang) * 2.2 + 5.3, Math.sin(ang) * 2.2 + 9.1) * 0.13 + noise2(x * 0.011, z * 0.011) * 0.045;
  return q - 1 - w;
}
const POND = { x: 52, z: -290, rx: 72, rz: 44, rot: 0.18 };
function pondE(x, z) {
  const dx = x - POND.x,
    dz = z - POND.z;
  const c = Math.cos(POND.rot),
    s = Math.sin(POND.rot);
  const u = (dx * c - dz * s) / POND.rx,
    v = (dx * s + dz * c) / POND.rz;
  const a = Math.atan2(v, u);
  return (u * u + v * v) * (1 + 0.2 * noise2(Math.cos(a) * 1.7 + 3, Math.sin(a) * 1.7 + 7));
}
const STREAM_CP = [
  [-340, -610],
  [-262, -585],
  [-205, -540],
  [-160, -548],
  [-112, -492],
  [-80, -430],
  [-40, -372],
  [-12, -318],
  [20, -296],
  [52, -290],
  [100, -282],
  [140, -262],
  [160, -228],
  [150, -190],
  [185, -160],
  [220, -140],
  [260, -118],
  [300, -112],
  [350, -100],
];
let STREAM = [];
const SG = { x0: -400, z0: -720, step: 2, nx: 400, nz: 330, d: null };
function buildStream() {
  const curve = new CatmullRomCurve3(
    STREAM_CP.map((p) => new Vector3(p[0], 0, p[1])),
    false,
    'centripetal',
  );
  STREAM = curve.getSpacedPoints(520).map((p) => ({ x: p.x, z: p.z }));
  const chunks = [];
  for (let i = 0; i < STREAM.length - 1; i += 10) {
    const seg = STREAM.slice(i, Math.min(i + 11, STREAM.length));
    let x0 = 1e9,
      x1 = -1e9,
      z0 = 1e9,
      z1 = -1e9;
    for (const p of seg) {
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      z0 = Math.min(z0, p.z);
      z1 = Math.max(z1, p.z);
    }
    chunks.push({ seg, x0: x0 - 40, x1: x1 + 40, z0: z0 - 40, z1: z1 + 40 });
  }
  SG.d = new Float32Array(SG.nx * SG.nz);
  for (let j = 0; j < SG.nz; j++)
    for (let i = 0; i < SG.nx; i++) {
      const x = SG.x0 + i * SG.step,
        z = SG.z0 + j * SG.step;
      let best = 40;
      for (const c of chunks) {
        if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
        const s = c.seg;
        for (let k = 0; k < s.length - 1; k++) {
          const ax = s[k].x,
            az = s[k].z,
            vx = s[k + 1].x - ax,
            vz = s[k + 1].z - az;
          const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
          const ex = ax + vx * t - x,
            ez = az + vz * t - z;
          const d = Math.sqrt(ex * ex + ez * ez);
          if (d < best) best = d;
        }
      }
      SG.d[j * SG.nx + i] = best;
    }
}
function streamDist(x, z) {
  const fx = (x - SG.x0) / SG.step,
    fz = (z - SG.z0) / SG.step;
  if (!SG.d || fx < 0 || fz < 0 || fx >= SG.nx - 1 || fz >= SG.nz - 1) return 40;
  const i = fx | 0,
    j = fz | 0,
    u = fx - i,
    v = fz - j,
    d = SG.d,
    n = SG.nx,
    k = j * n + i;
  return lerp(lerp(d[k], d[k + 1], u), lerp(d[k + n], d[k + n + 1], u), v);
}
const POOLS = [];

/* ---- tree stands ----
   Stand 0 is the original stand on the south shore (the ground rises into a low knoll there). The others
   sit just inside the timber at the other compass points and diagonals, each facing the middle of the marsh.
   yaw: the direction the hunter faces when seated (0 = north, i.e. looking toward -z). */
const MAIN_STAND = { x: 0, z: 0 };
const STANDS = [];
const STAND_EYE = 5.6;
const { inStandCorridor, nearestStandDist } = standHelpers(STANDS);
const edgeAt = edgeFinder(MARSH, marshE);
function findMainStand() {
  let z = -372;
  while (marshE(0, z) < 0 && z < 200) z += 0.5;
  MAIN_STAND.x = 0;
  MAIN_STAND.z = z + 6;
}
function placeStands() {
  STANDS.length = 0;
  const add = (x, z, name) => {
    const dx = MARSH.cx - x,
      dz = MARSH.cz - z;
    const yaw = name === 'South knoll' ? 0 : Math.atan2(-dx, -dz);
    const y = groundAt(x, z);
    STANDS.push({ i: STANDS.length, name, x, z, y, eye: y + STAND_EYE, yaw });
  };
  add(MAIN_STAND.x, MAIN_STAND.z, 'South knoll');
  const spots = [
    [PI, 'West shore'],
    [0, 'East shore'],
    [-PI / 2, 'North end'],
    [PI * 0.75, 'Southwest bay'],
    [PI * 0.25, 'Southeast bay'],
    [-PI * 0.75, 'Northwest point'],
    [-PI * 0.25, 'Northeast point'],
  ];
  for (const [a0, name] of spots) {
    let best = null;
    for (let k = 0; k < 15 && !best; k++) {
      // nudge along the shore until clear of the stream and pond
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.06;
      const e = edgeAt(a);
      const x = e.x + e.nx * 6,
        z = e.z + e.nz * 6;
      if (streamDist(x, z) > 18 && pondE(x, z) > 2.5) best = { x, z };
    }
    if (best) add(best.x, best.z, name);
  }
}
function outDist(x, z) {
  return Math.max(0, marshE(x, z)) * 300;
}
function groundAt(x, z) {
  const e = marshE(x, z);
  const out = Math.max(0, e) * 300;
  let h = 0.14 + noise2(x * 0.021, z * 0.021) * 0.22 + noise2(x * 0.09, z * 0.09) * 0.07;
  h += smoothstep(0, 28, out) * 0.9 + out * 0.014 + smoothstep(25, 260, out) * (5 + noise2(x * 0.006, z * 0.006) * 9);
  const fadeS = 1 - smoothstep(40, 90, out);
  if (fadeS > 0) {
    const sd = streamDist(x, z);
    if (sd < 12) {
      const hw = 2.3 + 1.3 * noise2(x * 0.02 + 3, z * 0.02);
      const t = (1 - smoothstep(hw, hw + 2.6, sd)) * fadeS;
      h = lerp(h, WATER_Y - 0.75, t);
    }
  }
  {
    const kx = x - MAIN_STAND.x,
      kz = z - MAIN_STAND.z,
      k2 = kx * kx + kz * kz;
    if (k2 < 40000) h += 4.2 * Math.exp(-k2 / 3600) * smoothstep(-0.07, 0.02, e);
  }
  const pe = pondE(x, z);
  if (pe < 1.3) {
    const t = 1 - smoothstep(0.72, 1.06, pe);
    h = lerp(h, WATER_Y - 0.25 - 0.55 * (1 - Math.min(pe, 1)), t);
  }
  for (let i = 0; i < POOLS.length; i++) {
    const p = POOLS[i];
    const dx = x - p.x,
      dz = z - p.z,
      d2 = dx * dx + dz * dz;
    if (d2 < p.r * p.r * 1.6) {
      const d = Math.sqrt(d2);
      const t = 1 - smoothstep(p.r * 0.5, p.r * 1.15, d);
      h = lerp(h, WATER_Y - 0.3, t);
    }
  }
  return h;
}
function canopyAt(x, z) {
  const out = outDist(x, z);
  return smoothstep(150, 250, out) * (16 + noise2(x * 0.03, z * 0.03) * 4);
}
function inWater(x, z) {
  return groundAt(x, z) < WATER_Y - 0.04;
}
function makePools() {
  const r = mulberry32(77);
  let n = 0,
    it = 0;
  while (n < 30 && it < 6000) {
    it++;
    const x = lerp(-230, 230, r()),
      z = lerp(-740, -10, r());
    if (marshE(x, z) > -0.1) continue;
    if (pondE(x, z) < 2) continue;
    if (streamDist(x, z) < 14) continue;
    if (Math.hypot(x - MAIN_STAND.x, z - MAIN_STAND.z) < 70) continue;
    POOLS.push({ x, z, r: 3 + r() * 7 });
    n++;
  }
}
let WATER_PTS = [];
function buildWaterPts() {
  WATER_PTS = [];
  for (let i = 0; i < STREAM.length; i += 6) {
    const p = STREAM[i];
    if (marshE(p.x, p.z) < -0.02 && groundAt(p.x, p.z) < WATER_Y - 0.15) WATER_PTS.push({ x: p.x, z: p.z });
  }
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU,
      c = Math.cos(POND.rot),
      sn = Math.sin(POND.rot),
      u = Math.cos(a) * POND.rx * 0.8,
      v = Math.sin(a) * POND.rz * 0.8;
    const x = POND.x + u * c + v * sn,
      z = POND.z - u * sn + v * c;
    if (groundAt(x, z) < WATER_Y - 0.1) WATER_PTS.push({ x, z });
  }
  for (const p of POOLS) WATER_PTS.push({ x: p.x, z: p.z });
}
// Willow and alder clumps along the timber edge and the stream: the bulls thrash these.
// Seeded, so every player sees the bull working the same bush.
let SHRUBS = [],
  SHRUB_PTS = [];
function buildShrubs() {
  SHRUBS = withSeed(5150, () => {
    const items = [];
    let tries = 0;
    for (let i = 0; i < 2200; i++) {
      const x = rand(-280, 280),
        z = rand(-780, 20);
      const out = marshE(x, z) * 300;
      if (out < -12 || out > 8) continue;
      if (nearestStandDist(x, z) < 14 || inStandCorridor(x, z, 60)) continue;
      const hh = rand(1.8, 4.2);
      items.push({
        x,
        y: groundAt(x, z) - 0.15,
        z,
        rot: rand(0, TAU),
        sx: hh * rand(1.2, 1.8),
        sy: hh,
        tile: chance(0.6) ? 1 : 0,
      });
    }
    while (items.length < 2000 && tries < 60000) {
      tries++;
      const x = rand(-260, 260),
        z = rand(-770, 10);
      const e = marshE(x, z);
      if (e > 0.004) continue;
      const sd = streamDist(x, z);
      const w =
        smoothstep(-0.22, 0, e) * 0.7 +
        (sd < 22 ? 0.55 : 0) +
        (noise2(x * 0.02 + 9, z * 0.02) > 0.25 ? 0.45 : 0) +
        0.04;
      if (random() > w) continue;
      const h = groundAt(x, z);
      if (h < WATER_Y + 0.08) continue;
      if (nearestStandDist(x, z) < 25 || inStandCorridor(x, z, 70)) continue;
      const hh = rand(1.6, 3.8);
      const tile = chance(0.7) ? 0 : 1;
      items.push({ x, y: h - 0.15, z, rot: rand(0, TAU), sx: hh * rand(1.1, 1.7), sy: hh, tile });
    }
    return items;
  });
  SHRUB_PTS = SHRUBS.map((i) => ({ x: i.x, z: i.z }));
}
// builds it all (once) and hands world.js what the rest of the game uses
let W = null;
export function build() {
  if (W) return W;
  findMainStand();
  buildStream();
  makePools();
  placeStands();
  buildWaterPts();
  buildShrubs();
  W = {
    id: 'the-marsh',
    MARSH,
    POND,
    STREAM,
    STREAM_CP,
    POOLS,
    STANDS,
    MAIN_STAND,
    WATER_PTS,
    SHRUBS,
    SHRUB_PTS,
    marshE,
    pondE,
    streamDist,
    groundAt,
    canopyAt,
    outDist,
    inWater,
    edgeAt,
    inStandCorridor,
    nearestStandDist,
    // where to look for a random spot out in the open (sim/places.js marshPoint)
    openBox: { x0: -220, x1: 220, z0: -740, z1: -30 },
  };
  return W;
}
