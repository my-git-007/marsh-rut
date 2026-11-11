// Alpine Valley Stream (id 'alpine-valley-stream'): a wide valley floor of tundra, willow and scattered spruce, with a
// stream winding across it, under snow-capped mountains. The hunter's stand is on the lower slope at the south side,
// looking north across the floor; the far wall rises about 1 km out, a side valley comes down from the left, and the
// main valley carries on far to the right (north-east). Distances from the stand (as the hunter sees them):
// open tundra to ~100 yds, a band of willow and spruce at 200–300 yds, the stream at ~300 yds right and ~450 yds
// ahead, spruce groves at 500–800 yds, the far slopes beyond ~1000 yds.
// Deterministic like every map (fixed seeds): the server and every browser build the same valley.
// Used through shared/world.js (useWorld), never directly.
import { CatmullRomCurve3, Vector3 } from 'three';
import { TAU, clamp, lerp, smoothstep, noise2, mulberry32, withSeed, rand, random, chance } from '../util.js';
import { WATER_Y, standHelpers, edgeFinder } from './common.js';

// x = east, z = south (north is -z); the stand is at the origin
const P = (pts) => pts.map(([x, z]) => new Vector3(x, 0, z));
const smoothLine = (pts, closed, n) =>
  new CatmullRomCurve3(P(pts), closed, 'centripetal').getSpacedPoints(n).map((p) => ({ x: p.x, z: p.z }));

// the open valley floor (marshE < 0 inside): what the animals treat as "the open"
const FLOOR_CP = [
  [-130, -22],
  [0, -26],
  [140, -34],
  [330, -70],
  [520, -170],
  [760, -330],
  [1010, -560],
  [1130, -820],
  [920, -1060],
  [560, -1010],
  [180, -960],
  [-160, -890],
  [-340, -770],
  [-470, -600],
  [-470, -420],
  [-390, -270],
  [-300, -150],
  [-210, -60],
];
// the valley carries on to the north-east, out of the hunting area, as far as the eye goes
const NE_CP = [
  [700, -560],
  [1300, -1000],
  [2200, -1700],
  [3300, -2400],
  [4600, -3300],
  [6400, -4300],
  [9000, -5600],
];
// the side valley coming down from the left: a dry gravel wash climbing into the mountains
const DRAIN_CP = [
  [-330, -640],
  [-560, -900],
  [-760, -1250],
  [-900, -1700],
  [-1150, -2300],
  [-1350, -3000],
];
const MARSH = { cx: 330, cz: -540, a: 800, b: 520, reach: 1300 };
const POND = { x: -235, z: -585, rx: 46, rz: 28, rot: -0.5 };
const STREAM_CP = [
  [-360, -660],
  [-290, -540],
  [-180, -470],
  [-70, -430],
  [30, -375],
  [100, -300],
  [150, -232],
  [235, -192],
  [335, -205],
  [455, -262],
  [600, -330],
  [770, -420],
  [960, -560],
  [1160, -720],
  [1420, -900],
];

let FLOOR = [],
  NE = [],
  DRAIN = [],
  STREAM = [];
const POOLS = [];
const MAIN_STAND = { x: 0, z: 0 };
const STANDS = [];
const STAND_EYE = 5.6;
const { inStandCorridor, nearestStandDist } = standHelpers(STANDS);

/* ---- distances to the lines, kept in grids so the ground can be asked for quickly ---- */
function segDist(pts, x, z, closed) {
  let best = 1e9,
    bi = 0,
    bt = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let k = 0; k < n; k++) {
    const a = pts[k],
      b = pts[(k + 1) % pts.length],
      vx = b.x - a.x,
      vz = b.z - a.z,
      L2 = vx * vx + vz * vz || 1;
    const t = clamp(((x - a.x) * vx + (z - a.z) * vz) / L2, 0, 1);
    const ex = a.x + vx * t - x,
      ez = a.z + vz * t - z,
      d = ex * ex + ez * ez;
    if (d < best) {
      best = d;
      bi = k;
      bt = t;
    }
  }
  return { d: Math.sqrt(best), i: bi + bt };
}
function inside(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i],
      b = pts[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) c = !c;
  }
  return c;
}
// the floor's signed distance (metres; < 0 inside), with a ragged edge
function floorSDraw(x, z) {
  const d = segDist(FLOOR, x, z, true).d;
  return (
    (inside(FLOOR, x, z) ? -d : d) - noise2(x * 0.012 + 3.1, z * 0.012 - 7.7) * 34 - noise2(x * 0.05, z * 0.05) * 6
  );
}
// how far along each valley line a point is (metres), and how far from it
const lens = (pts) => {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return L;
};
let NE_L = [],
  DR_L = [];
const along = (L, i) => {
  const k = Math.min(Math.floor(i), L.length - 2);
  return lerp(L[k], L[k + 1], i - k);
};
// the far valleys: signed distance from their floors (the main valley widens as it goes)
function neSD(x, z) {
  const s = segDist(NE, x, z, false),
    a = along(NE_L, s.i);
  return { sd: s.d - (300 + a * 0.06 + noise2(x * 0.004, z * 0.004 + 9) * 120), a };
}
function drSD(x, z) {
  const s = segDist(DRAIN, x, z, false),
    a = along(DR_L, s.i);
  return { sd: s.d - (45 + a * 0.02), a, d: s.d };
}

// one grid holds all three for the middle of the map (8 m cells); further out they are worked out directly
const GR = {
  x0: -1500,
  z0: -2100,
  step: 8,
  nx: 460,
  nz: 340,
  f: null,
  ne: null,
  nea: null,
  dr: null,
  dra: null,
  drd: null,
};
function buildGrid() {
  const n = GR.nx * GR.nz;
  GR.f = new Float32Array(n);
  GR.ne = new Float32Array(n);
  GR.nea = new Float32Array(n);
  GR.dr = new Float32Array(n);
  GR.dra = new Float32Array(n);
  GR.drd = new Float32Array(n);
  for (let j = 0; j < GR.nz; j++)
    for (let i = 0; i < GR.nx; i++) {
      const x = GR.x0 + i * GR.step,
        z = GR.z0 + j * GR.step,
        k = j * GR.nx + i;
      GR.f[k] = floorSDraw(x, z);
      const ne = neSD(x, z),
        dr = drSD(x, z);
      GR.ne[k] = ne.sd;
      GR.nea[k] = ne.a;
      GR.dr[k] = dr.sd;
      GR.dra[k] = dr.a;
      GR.drd[k] = dr.d;
    }
}
function gridAt(arr, x, z) {
  const fx = (x - GR.x0) / GR.step,
    fz = (z - GR.z0) / GR.step;
  if (fx < 0 || fz < 0 || fx >= GR.nx - 1 || fz >= GR.nz - 1) return null;
  const i = fx | 0,
    j = fz | 0,
    u = fx - i,
    v = fz - j,
    n = GR.nx,
    k = j * n + i;
  return lerp(lerp(arr[k], arr[k + 1], u), lerp(arr[k + n], arr[k + n + 1], u), v);
}
const inGrid = (x, z) => {
  const fx = (x - GR.x0) / GR.step,
    fz = (z - GR.z0) / GR.step;
  return fx >= 0 && fz >= 0 && fx < GR.nx - 1 && fz < GR.nz - 1;
};
function floorSD(x, z) {
  return inGrid(x, z) ? gridAt(GR.f, x, z) : floorSDraw(x, z);
}
function lines(x, z) {
  if (inGrid(x, z))
    return {
      ne: gridAt(GR.ne, x, z),
      nea: gridAt(GR.nea, x, z),
      dr: gridAt(GR.dr, x, z),
      dra: gridAt(GR.dra, x, z),
      drd: gridAt(GR.drd, x, z),
    };
  const ne = neSD(x, z),
    dr = drSD(x, z);
  return { ne: ne.sd, nea: ne.a, dr: dr.sd, dra: dr.a, drd: dr.d };
}

/* ---- the stream (on the valley floor: level water, like the marsh's) ---- */
const SG = { x0: -500, z0: -960, step: 2, nx: 1050, nz: 520, d: null };
function buildStream() {
  STREAM = smoothLine(STREAM_CP, false, 900);
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
function pondE(x, z) {
  const dx = x - POND.x,
    dz = z - POND.z;
  const c = Math.cos(POND.rot),
    s = Math.sin(POND.rot);
  const u = (dx * c - dz * s) / POND.rx,
    v = (dx * s + dz * c) / POND.rz;
  const a = Math.atan2(v, u);
  return (u * u + v * v) * (1 + 0.2 * noise2(Math.cos(a) * 1.7 + 13, Math.sin(a) * 1.7 + 2));
}

/* ---- the ground ---- */
// < 0 on the open floor, > 0 on the slopes and in the timber; about metres / 300, like the marsh's
function marshE(x, z) {
  return floorSD(x, z) / 300;
}
function outDist(x, z) {
  return Math.max(0, floorSD(x, z));
}
// mountains: ridges and peaks that grow with the distance from the valley floors
function mountain(x, z) {
  const r1 = 1 - Math.abs(noise2(x * 0.0004 + 17.3, z * 0.0004 + 3.9) * 1.4);
  const r2 = 1 - Math.abs(noise2(x * 0.0011 + 5.1, z * 0.0011 - 2.7) * 1.4);
  const r3 = 1 - Math.abs(noise2(x * 0.0029 + 1.7, z * 0.0029 + 8.2) * 1.4);
  const r4 = noise2(x * 0.0075 - 3.3, z * 0.0075 + 1.1);
  // the smaller ridges and gullies cut deepest where the big ridges stand highest
  return r1 * r1 * 640 + r2 * r2 * (220 + r1 * 160) + r3 * r3 * (60 + r1 * 90) + r4 * 30;
}
// the rise of a valley wall, out metres from its floor
function wall(out, x, z) {
  // foothills to about 1.5 km out, then the big mountains (peaks of 1,300–2,000 m some 5–8 km from the stand)
  return (
    Math.min(out, 6000) * 0.07 +
    220 * smoothstep(80, 1400, out) +
    800 * smoothstep(1500, 6000, out) +
    mountain(x, z) * smoothstep(400, 4000, out) +
    noise2(x * 0.01 + 4, z * 0.01) * 6 * smoothstep(0, 80, out)
  );
}
// a soft minimum that eases from one surface to the other where they come within k of each other; it never goes
// below the lower one (the usual smooth-min dips by up to k/4 there, which sank the valley floor under the water)
const smin = (a, b, k) => {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h);
};
// height of the ground without the stream, pond and pools cut into it
function baseGround(x, z) {
  const f = floorSD(x, z),
    L = lines(x, z);
  const hum = noise2(x * 0.021, z * 0.021) * 0.5 + noise2(x * 0.08, z * 0.08) * 0.15;
  // the floor: low by the stream, rising gently toward its edges; the main valley's far reaches a little higher
  const sd = streamDist(x, z);
  const floorBase = 0.55 + hum + Math.min(sd, 160) * 0.012;
  const hFloor = floorBase + 4.5 * smoothstep(-150, 0, f) + wall(Math.max(0, f), x, z);
  const hNE = 1.2 + hum + L.nea * 0.006 + wall(Math.max(0, L.ne), x, z);
  // the side valley climbs steeply; its gravel wash runs down the middle
  const hDr =
    6 +
    L.dra * 0.2 +
    noise2(x * 0.03, z * 0.03) * 1.2 -
    2.2 * (1 - smoothstep(4, 22, L.drd)) +
    wall(Math.max(0, L.dr), x, z);
  return smin(smin(hFloor, hNE, 30), hDr, 40);
}
function groundAt(x, z) {
  let h = baseGround(x, z);
  if (h < 12) {
    const sd = streamDist(x, z);
    if (sd < 12) {
      const hw = 2.4 + 1.2 * noise2(x * 0.02 + 3, z * 0.02);
      const t = 1 - smoothstep(hw, hw + 2.6, sd);
      h = lerp(h, WATER_Y - 0.75, t);
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
  }
  return h;
}
// the timber here is open and patchy: no raised canopy anywhere
function canopyAt() {
  return 0;
}
function inWater(x, z) {
  return groundAt(x, z) < WATER_Y - 0.04;
}
// the gravel wash and the dry channels: for the ground's colour (render/alpine-ground.js)
function washAt(x, z) {
  const L = lines(x, z);
  return 1 - smoothstep(6, 26 + L.dra * 0.004, L.drd + noise2(x * 0.04, z * 0.04) * 8);
}

function placeStand() {
  STANDS.length = 0;
  const x = MAIN_STAND.x,
    z = MAIN_STAND.z,
    y = groundAt(x, z);
  // how far the hunter may turn each way (degrees): the ends of the valley floor in sight
  STANDS.push({ i: 0, name: 'South slope', x, z, y, eye: y + STAND_EYE, yaw: 0, look: { left: 72, right: 82 } });
}
function makePools() {
  const r = mulberry32(91);
  let n = 0,
    it = 0;
  while (n < 9 && it < 6000) {
    it++;
    const x = lerp(-380, 1000, r()),
      z = lerp(-1000, -60, r());
    if (marshE(x, z) > -0.12) continue;
    if (pondE(x, z) < 3) continue;
    if (streamDist(x, z) < 22) continue;
    if (Math.hypot(x, z) < 120) continue;
    POOLS.push({ x, z, r: 4 + r() * 8 });
    n++;
  }
}
let WATER_PTS = [];
function buildWaterPts() {
  WATER_PTS = [];
  for (let i = 0; i < STREAM.length; i += 8) {
    const p = STREAM[i];
    if (marshE(p.x, p.z) < -0.02 && groundAt(p.x, p.z) < WATER_Y - 0.15) WATER_PTS.push({ x: p.x, z: p.z });
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU,
      c = Math.cos(POND.rot),
      sn = Math.sin(POND.rot),
      u = Math.cos(a) * POND.rx * 0.75,
      v = Math.sin(a) * POND.rz * 0.75;
    const x = POND.x + u * c + v * sn,
      z = POND.z - u * sn + v * c;
    if (groundAt(x, z) < WATER_Y - 0.1) WATER_PTS.push({ x, z });
  }
  for (const p of POOLS) WATER_PTS.push({ x: p.x, z: p.z });
}
// Willow thickets (tile 0: tall, autumn gold) along the stream and in bands across the floor, and dwarf birch
// (tile 1: knee to waist high, red) all over the tundra. Seeded: the bulls thrash the same willows for everyone.
let SHRUBS = [],
  SHRUB_PTS = [];
function buildShrubs() {
  SHRUBS = withSeed(6262, () => {
    const items = [];
    let tries = 0;
    // willows
    while (items.length < 1900 && tries < 90000) {
      tries++;
      const x = rand(-480, 1150),
        z = rand(-1080, -10);
      const f = floorSD(x, z);
      if (f > 40) continue;
      const sd = streamDist(x, z);
      const band = noise2(x * 0.011 + 21, z * 0.011 - 5);
      const w = (sd < 30 ? 0.75 : sd < 70 ? 0.3 : 0) + (band > 0.18 ? 0.5 : 0) + (f > -40 ? 0.12 : 0) + 0.02;
      if (random() > w) continue;
      const h = groundAt(x, z);
      if (h < WATER_Y + 0.1) continue;
      if (nearestStandDist(x, z) < 30 || inStandCorridor(x, z, 120)) continue;
      const hh = rand(1.6, 3.6) * (sd < 30 ? 1.1 : 1);
      items.push({ x, y: h - 0.15, z, rot: rand(0, TAU), sx: hh * rand(1.2, 1.8), sy: hh, tile: 0 });
    }
    // dwarf birch, low and red, thickest near the hunter (the open slope below the stand)
    tries = 0;
    let n = 0;
    while (n < 3600 && tries < 160000) {
      tries++;
      const near = chance(0.5);
      const x = near ? rand(-260, 260) : rand(-480, 1150),
        z = near ? rand(-260, 30) : rand(-1080, 40);
      const f = floorSD(x, z);
      if (f > 160) continue;
      if (streamDist(x, z) < 6) continue;
      // in clumps and drifts, with open grass between
      const patch = noise2(x * 0.02 - 13, z * 0.02 + 6) + noise2(x * 0.07 + 2, z * 0.07) * 0.25;
      if (random() > smoothstep(0.02, 0.32, patch) * 0.95 + 0.01) continue;
      const h = groundAt(x, z);
      if (h < WATER_Y + 0.15) continue;
      if (nearestStandDist(x, z) < 9) continue;
      const hh = rand(0.7, 1.5);
      items.push({ x, y: h - 0.1, z, rot: rand(0, TAU), sx: hh * rand(1.6, 2.4), sy: hh, tile: 1 });
      n++;
    }
    return items;
  });
  // the bulls rub and thrash the willows (not the knee-high birch)
  SHRUB_PTS = SHRUBS.filter((s) => s.tile === 0).map((i) => ({ x: i.x, z: i.z }));
}

let W = null;
export function build() {
  if (W) return W;
  FLOOR = smoothLine(FLOOR_CP, true, 240);
  NE = smoothLine(NE_CP, false, 120);
  DRAIN = smoothLine(DRAIN_CP, false, 90);
  NE_L = lens(NE);
  DR_L = lens(DRAIN);
  buildGrid();
  buildStream();
  makePools();
  placeStand();
  buildWaterPts();
  buildShrubs();
  W = {
    id: 'alpine-valley-stream',
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
    edgeAt: edgeFinder(MARSH, marshE),
    inStandCorridor,
    nearestStandDist,
    washAt,
    // for the browser (render/core.js setMapLook): thin mountain air, shadows over the valley floor
    look: {
      fog: 0.00014,
      sunAt: { x: 220, z: -430 },
      water: { x: 480, z: -560, w: 2100, d: 1000 },
      mountains: true,
      // the bushes' colours: gold willow, red dwarf birch (3D leaves; the flat cards far off)
      shrubs3d: [
        [0.95, 0.74, 0.3],
        [0.78, 0.2, 0.11],
      ],
      shrubCards: [
        [1.15, 0.95, 0.5],
        [1.05, 0.32, 0.2],
      ],
    },
    openBox: { x0: -440, x1: 1100, z0: -1040, z1: -60 },
  };
  return W;
}
