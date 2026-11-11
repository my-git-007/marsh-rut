// Alpine Valley Stream (id 'alpine-valley-stream'), built from the user's picture "Autumn Alpine Valley from a Tree
// Stand". The stand is high on a hillside (its ground ~37 m above the stream) and the land falls away from it in
// steps, as in the picture:
//   1. the stand's own slope, red and orange shrubs (0–50 m)
//   2. a pale, frosty meadow bench (to ~150 m on the right, ~250 m on the left; ~100 yds is ~20 m below the eye)
//   3. a drop of ~13 m to the willow flats, where the stream runs: it comes down a rocky gully from the left
//      mountain, crosses in front (~450 yds out) and comes within ~200 yds on the right before running off right
//   4. spruce groves on a slight rise at 500–800 yds
//   5. a second drop at ~1 km to a lower open field, and the main valley carrying on to the north-east, lower and
//      lower, to a river on the horizon ~13 km out
// with a forested ridge ahead at 1–1.5 km, the big massif behind it (its long shoulder running down to the right),
// a hillside rising on the left, and snowy ranges far to the right. Bearings below are degrees from north (the way the
// stand faces), + to the right. Heights are metres above the stream (the water is at WATER_Y, just below 0).
// Deterministic like every map: the server and every browser build the same valley. Used through shared/world.js.
import { CatmullRomCurve3, Vector3 } from 'three';
import { TAU, clamp, lerp, smoothstep, noise2, mulberry32, withSeed, rand, random, chance } from '../util.js';
import { WATER_Y, standHelpers, edgeFinder } from './common.js';

// x = east, z = south (north is -z); the stand is at the origin
const D2R = Math.PI / 180;
const pol = (az, r) => [r * Math.sin(az * D2R), -r * Math.cos(az * D2R)];
const P = (pts) => pts.map(([x, z]) => new Vector3(x, 0, z));
const smoothLine = (pts, closed, n) =>
  new CatmullRomCurve3(P(pts), closed, 'centripetal').getSpacedPoints(n).map((p) => ({ x: p.x, z: p.z }));

// the open ground the animals use (marshE < 0 inside): the meadow bench, the flats and the groves beyond, up to the
// second drop; the left hillside and the stand's own slope are "timber"
const FLOOR_CP = [
  pol(-62, 75),
  pol(-40, 70),
  pol(-34, 250),
  pol(-27, 380),
  pol(-20, 560),
  pol(-12, 760),
  pol(-3, 880),
  pol(8, 930),
  pol(20, 950),
  pol(32, 960),
  pol(44, 930),
  pol(56, 800),
  pol(66, 600),
  pol(76, 400),
  pol(86, 230),
  pol(92, 110),
  pol(80, 70),
  pol(50, 62),
  pol(20, 60),
  pol(-10, 60),
  pol(-35, 66),
];
// the stream on the flats (level water): out of the gully on the left, across, close on the right, then away
// to the right and north-east to the second drop
const STREAM_CP = [
  pol(-24, 470),
  pol(-21, 425),
  pol(-13, 440),
  pol(-4, 452),
  pol(4, 425),
  pol(9, 365),
  pol(14, 290),
  pol(18, 225),
  pol(22, 196),
  pol(28, 186),
  pol(36, 196),
  pol(44, 230),
  pol(49, 300),
  pol(51, 400),
  pol(47, 520),
  pol(43, 680),
  pol(40, 830),
  pol(38, 960),
];
// the gully on the left: a rocky creek bed climbing into the mountains from the stream
const GULLY_CP = [
  pol(-24, 470),
  pol(-27, 640),
  pol(-30, 950),
  pol(-31, 1400),
  pol(-30, 2000),
  pol(-28, 2700),
  pol(-27, 3400),
];
const POND = (() => {
  const [x, z] = pol(-8, 600);
  return { x, z, rx: 40, rz: 24, rot: 0.3 };
})();
const MARSH = (() => {
  const [cx, cz] = pol(15, 470);
  return { cx, cz, a: 600, b: 450, reach: 1100 };
})();
// the main valley north-east of the second drop: an axis from A along bearing 32 degrees; the river meanders along it
const NE_A = (() => {
  const [x, z] = pol(30, 1050);
  return { x, z };
})();
const NE_D = { x: Math.sin(32 * D2R), z: -Math.cos(32 * D2R) };
// the big mountains: [bearing, distance, height, radius]
const MASSIFS = [
  [-4, 5400, 780, 3900], // the massif straight ahead
  [6, 5700, 650, 2600], // its shoulder, running down to the right
  [16, 6100, 430, 2300],
  [25, 6700, 330, 2200],
  [-24, 3700, 470, 1900], // the mountain on the left, above the gully
  [-40, 4200, 600, 2400],
  [-58, 3900, 650, 2400],
  [14, 9800, 950, 2800], // the snowy range beyond the shoulder, far right
  [23, 10600, 1150, 2600],
  [26, 14500, 1150, 3000],
  [28, 18500, 1000, 4200], // far peaks closing the end of the valley
  [34, 17000, 1050, 3600],
  [44, 13500, 1150, 3200],
  [55, 6200, 900, 2600], // the ranges right of the picture
  [72, 5200, 1000, 2600],
  [95, 4800, 900, 2600],
  [125, 4800, 850, 2800], // behind the stand
  [180, 4200, 800, 3000],
  [-125, 4600, 850, 2800],
  [-85, 4300, 850, 2600],
].map(([az, r, h, R]) => {
  const [x, z] = pol(az, r);
  return { x, z, h, R };
});

let FLOOR = [],
  GULLY = [],
  GULLY_L = [],
  STREAM = [];
const POOLS = [];
const MAIN_STAND = { x: 0, z: 0 };
const STANDS = [];
const STAND_EYE = 5.6;
const { inStandCorridor, nearestStandDist } = standHelpers(STANDS);

/* ---- distances to lines ---- */
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
const lens = (pts) => {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  return L;
};
const along = (L, i) => {
  const k = Math.min(Math.floor(i), L.length - 2);
  return lerp(L[k], L[k + 1], i - k);
};

// grids (8 m) for the open ground's edge and the gully, over the middle of the map; worked out directly further out
const GR = { x0: -1700, z0: -3600, step: 8, nx: 520, nz: 500, f: null, gd: null, ga: null };
function floorSDraw(x, z) {
  const d = segDist(FLOOR, x, z, true).d;
  return (inside(FLOOR, x, z) ? -d : d) - noise2(x * 0.012 + 3.1, z * 0.012 - 7.7) * 22;
}
function gullyRaw(x, z) {
  const s = segDist(GULLY, x, z, false);
  return { d: s.d, a: along(GULLY_L, s.i) };
}
function buildGrid() {
  const n = GR.nx * GR.nz;
  GR.f = new Float32Array(n);
  GR.gd = new Float32Array(n);
  GR.ga = new Float32Array(n);
  for (let j = 0; j < GR.nz; j++)
    for (let i = 0; i < GR.nx; i++) {
      const x = GR.x0 + i * GR.step,
        z = GR.z0 + j * GR.step,
        k = j * GR.nx + i;
      // the floor's edge only matters near the floor
      GR.f[k] = Math.hypot(x - MARSH.cx, z - MARSH.cz) < 1500 ? floorSDraw(x, z) : 400;
      // (the gully is all well left of x 400)
      const g = x < 400 ? gullyRaw(x, z) : { d: 999, a: 0 };
      GR.gd[k] = g.d;
      GR.ga[k] = g.a;
    }
}
function gridAt(arr, x, z) {
  const fx = (x - GR.x0) / GR.step,
    fz = (z - GR.z0) / GR.step;
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
  if (inGrid(x, z)) return gridAt(GR.f, x, z);
  return 400 + Math.hypot(x - MARSH.cx, z - MARSH.cz) * 0.5;
}
function gully(x, z) {
  if (inGrid(x, z)) return { d: gridAt(GR.gd, x, z), a: gridAt(GR.ga, x, z) };
  return gullyRaw(x, z);
}

/* ---- the stream on the flats ---- */
const SG = { x0: -400, z0: -1000, step: 2, nx: 650, nz: 470, d: null };
function buildStream() {
  STREAM = smoothLine(STREAM_CP, false, 700);
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
    chunks.push({ seg, x0: x0 - 50, x1: x1 + 50, z0: z0 - 50, z1: z1 + 50 });
  }
  SG.d = new Float32Array(SG.nx * SG.nz);
  for (let j = 0; j < SG.nz; j++)
    for (let i = 0; i < SG.nx; i++) {
      const x = SG.x0 + i * SG.step,
        z = SG.z0 + j * SG.step;
      let best = 50;
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
  if (!SG.d || fx < 0 || fz < 0 || fx >= SG.nx - 1 || fz >= SG.nz - 1) return 50;
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

/* ---- the river down the main valley (beyond the second drop; drawn by the browser, render/alpine.js) ---- */
// where a point is along the valley (s, metres from NE_A) and across it (l, + to the left looking down it)
function neCoords(x, z) {
  const px = x - NE_A.x,
    pz = z - NE_A.z;
  return { s: px * NE_D.x + pz * NE_D.z, l: NE_D.x * pz - NE_D.z * px };
}
// the river's line across the valley, and its half-width
const riverL = (s) => 112 * Math.cos((s + 60) / 650) + 45 * Math.sin(s / 230) + 30 * Math.sin(s / 1700);
const riverW = (s) => 3.5 + Math.max(0, s) * 0.0022;
// the river from the second drop to the horizon: points with the water's height
function riverLine() {
  const pts = [];
  for (let s = -70; s < 12400; s += s < 2000 ? 8 : 30) {
    const l = riverL(s);
    // along the valley by s, then across it by l (the left-hand normal of NE_D is (-NE_D.z, NE_D.x))
    const x = NE_A.x + NE_D.x * s - NE_D.z * l,
      z = NE_A.z + NE_D.z * s + NE_D.x * l;
    pts.push({ x, z, s, w: riverW(s) });
  }
  return pts;
}

/* ---- the ground ---- */
const smin = (a, b, k) => {
  // a soft minimum: eases from one to the other where they come within k (never below the lower one)
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return lerp(b, a, h);
};
const smax = (a, b, k) => -smin(-a, -b, k);
// the hillside the stand is on, its steps down to the flats, and the land just beyond (the picture's middle ground)
// where a point is: its distance and bearing from the stand, and how far out the steps are on that bearing (the foot
// of the stand's slope R0, the top of the drop to the flats R1 and its foot R2)
// the bearing folded about east-west: the same in front, mirrored behind, so nothing that depends on it jumps where
// the bearing wraps from -180 to 180 degrees straight behind the stand
const fold = (az) => (Math.abs(az) > 90 ? Math.sign(az) * (180 - Math.abs(az)) : az);
function tierAt(x, z) {
  const r = Math.hypot(x, z),
    az = Math.atan2(x, -z) / D2R,
    azf = fold(az);
  const n1 = noise2(x * 0.01 + 5, z * 0.01),
    n2 = noise2(x * 0.03 + 2, z * 0.03 - 4);
  const R0 = 52 + noise2(x * 0.015 + 9, z * 0.015) * 10;
  // (the bench reaches ~120 m out ahead, less on the right, where the stream comes close under it, and much
  // further on the left)
  const R1 = clamp(120 + Math.max(0, -azf) * 7.5 - Math.max(0, azf - 6) * 1.6, 92, 300) + n1 * 12;
  return { r, az, n1, n2, R0, R1, R2: R1 + 38 + n2 * 6 };
}
function nearGround(x, z) {
  const { r, az: az0, n1, n2, R0, R1, R2 } = tierAt(x, z);
  const az = fold(az0);
  let h =
    37 -
    13 * smoothstep(0, R0, r) -
    10 * clamp((r - R0) / (R1 - R0), 0, 1) -
    11 * smoothstep(R1, R2, r) -
    3 * clamp((r - R2) / 320, 0, 1);
  h += n2 * 0.9 + noise2(x * 0.08, z * 0.08) * 0.25; // hummocks
  // the flats rise a little to the spruce groves at 500–800 yds
  h += 8 * smoothstep(600, 820, r) * (1 - smoothstep(30, 50, az));
  // the second drop (~1 km), ahead and to the right, to the lower field and the main valley
  const wDrop = smoothstep(-10, 4, az) * (1 - smoothstep(70, 90, az));
  h -= 10 * smoothstep(970 + n1 * 40, 1090, r) * wDrop;
  // the forested ridge ahead and to the left, 1–1.6 km out, rising toward the massif
  h += 80 * smoothstep(1000, 1600, r) * (1 - smoothstep(-4, 14, az));
  // the hillside rising on the left, out of the flats
  h += Math.min(420, Math.max(0, r - 330) * 0.2) * smoothstep(-12, -34, az);
  // behind the stand the hillside keeps rising
  h += Math.max(0, z + 10) * 0.32 * smoothstep(-10, 40, z);
  // and far out, foothills (the mountains rise out of them, below)
  h += 140 * smoothstep(1500, 3800, r) * (0.7 + 0.3 * n1);
  return h;
}
// the main valley beyond the second drop: wide, falling slowly to the north-east, with walls
function valleyGround(x, z) {
  const { s, l } = neCoords(x, z);
  const hw = 480 + Math.min(Math.max(0, s), 4000) * 0.04 + noise2(x * 0.0015, z * 0.0015) * 140;
  const floor = 1 - Math.max(0, s - 250) * 0.0085 + noise2(x * 0.004 + 7, z * 0.004) * 3;
  const e = Math.max(0, Math.abs(l - riverL(s) * 0.3) - hw);
  // (it ends ~14 km out, under the far peaks)
  const end = 3000 * smoothstep(12500, 16000, s);
  return floor + e * 0.3 + 280 * smoothstep(150, 2200, e) + Math.max(0, e - 350) * 1.2 + (s < 0 ? -s * 0.7 : 0) + end;
}
// the mountains: each massif a broad cone, roughened by ridges and gullies that cut deeper the higher it stands
function ridged(x, z) {
  const r1 = 1 - Math.abs(noise2(x * 0.0005 + 17.3, z * 0.0005 + 3.9) * 1.4);
  const r2 = 1 - Math.abs(noise2(x * 0.0013 + 5.1, z * 0.0013 - 2.7) * 1.4);
  const r3 = 1 - Math.abs(noise2(x * 0.0033 + 1.7, z * 0.0033 + 8.2) * 1.4);
  const r4 = noise2(x * 0.009 - 3.3, z * 0.009 + 1.1);
  return { r1, r2, r3, r4 };
}
function mountains(x, z) {
  let m = 0;
  for (const M of MASSIFS) {
    const dx = x - M.x,
      dz = z - M.z,
      d2 = dx * dx + dz * dz;
    if (d2 >= M.R * M.R) continue;
    const t = Math.sqrt(d2) / M.R;
    m = Math.max(m, M.h * 0.8 * Math.pow(1 - t, 1.3) * (1 + 0.15 * (1 - t)));
  }
  const { r1, r2, r3, r4 } = ridged(x, z);
  // lower ranges fill the gaps between the big massifs, far off
  const back = 380 * smoothstep(3000, 7000, Math.hypot(x, z)) * (0.55 + 0.45 * r2);
  m = Math.max(m, back);
  const rough = smoothstep(0, 300, m) * (0.35 + m / 800);
  // (well below the land where there's no mountain, so the near land is left as it is)
  return (
    m * (0.66 + 0.34 * r1) +
    rough * (r2 * r2 * 300 + r3 * r3 * 150 + r4 * 30 + r1 * r1 * 120) -
    300 * (1 - smoothstep(40, 400, m))
  );
}
// height of the ground before the stream, pond and pools are cut into it
function baseGround(x, z) {
  // the mountains rise out of the near land; the main valley is cut down through both
  let h = smax(nearGround(x, z), mountains(x, z), 90);
  h = smin(h, valleyGround(x, z), 40);
  // the gully: a rocky notch cut down the left hillside, deeper as it climbs
  const g = gully(x, z);
  if (g.d < 200) {
    const depth = Math.min(4 + g.a * 0.018, 45),
      w = 18 + g.a * 0.025;
    h -= depth * Math.pow(1 - smoothstep(0, w, g.d), 1.6) * smoothstep(0, 60, g.a);
  }
  // the flats sink gently toward the stream (low banks, not a ditch)
  const sd = streamDist(x, z);
  if (sd < 45) h = lerp(h, Math.min(h, 0.15 + sd * 0.045), 1 - smoothstep(8, 45, sd));
  return h;
}
function groundAt(x, z) {
  let h = baseGround(x, z);
  const sd = streamDist(x, z);
  if (sd < 12) {
    const hw = 3.6 + 1.4 * noise2(x * 0.02 + 3, z * 0.02);
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
  // the river's bed down the main valley
  const { s, l } = neCoords(x, z);
  if (s > -80 && s < 12500) {
    const off = Math.abs(l - riverL(s)),
      w = riverW(s);
    if (off < w + 8) h -= 1.4 * (1 - smoothstep(w * 0.6, w + 6, off));
  }
  return h;
}
function marshE(x, z) {
  return floorSD(x, z) / 300;
}
function outDist(x, z) {
  return Math.max(0, floorSD(x, z));
}
function canopyAt() {
  return 0; // open, patchy timber: no raised canopy
}
// standing water: the stream, the pond and the pools on the flats (the low valley beyond the drop is dry ground)
function inWater(x, z) {
  return groundAt(x, z) < WATER_Y - 0.04 && (streamDist(x, z) < 8 || pondE(x, z) < 1.2 || nearPool(x, z));
}
function nearPool(x, z) {
  for (const p of POOLS) if (Math.hypot(x - p.x, z - p.z) < p.r * 1.2) return true;
  return false;
}
// which step of the land a point is on (for the colours and plants, render/alpine.js):
// 0 the stand's slope, 1 the meadow bench, 2 the drop, 3 the flats, 4 the groves beyond, 5 the lower field and the
// main valley, 6 the hillsides and the ridge, 7 the mountains
function zoneAt(x, z) {
  const { r, az, R0, R1, R2 } = tierAt(x, z);
  const h = baseGround(x, z);
  if (h > 420) return 7;
  if (z > 30 || az < -40 || az > 100) return h > 70 ? 6 : r < R0 ? 0 : 1;
  if ((az < -16 && r > 340) || (az < 10 && r > 1050)) return 6;
  if (r < R0) return 0;
  if (r < R1) return 1;
  if (r < R2) return 2;
  if (r < 620) return 3;
  if (r < 980) return 4;
  return h > 60 ? 6 : 5;
}
// the gully's rocky bed (for the ground's colour)
function washAt(x, z) {
  const g = gully(x, z);
  return (1 - smoothstep(4, 10 + g.a * 0.012, g.d + noise2(x * 0.04, z * 0.04) * 5)) * smoothstep(0, 40, g.a);
}

function placeStand() {
  STANDS.length = 0;
  const x = MAIN_STAND.x,
    z = MAIN_STAND.z,
    y = groundAt(x, z);
  // how far the hunter may turn each way (degrees), and how far down they look to start with (radians)
  STANDS.push({
    i: 0,
    name: 'South slope',
    x,
    z,
    y,
    eye: y + STAND_EYE,
    yaw: 0,
    look: { left: 72, right: 82, pitch: -0.1 },
  });
}
function makePools() {
  const r = mulberry32(91);
  let n = 0,
    it = 0;
  while (n < 6 && it < 6000) {
    it++;
    const [x, z] = pol(lerp(-15, 60, r()), lerp(300, 900, r()));
    if (marshE(x, z) > -0.1) continue;
    if (pondE(x, z) < 3) continue;
    if (streamDist(x, z) < 22) continue;
    if (baseGround(x, z) > 6) continue;
    POOLS.push({ x, z, r: 4 + r() * 7 });
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
// Willow thickets (tile 0: big, autumn gold) on the flats and along the stream, and dwarf birch (tile 1: knee to
// waist high, red) on the stand's slope, the edges of the bench and the hillsides. Seeded: the bulls thrash the same
// willows for everyone.
let SHRUBS = [],
  SHRUB_PTS = [];
function buildShrubs() {
  SHRUBS = withSeed(6262, () => {
    const items = [];
    let tries = 0;
    while (items.length < 3600 && tries < 260000) {
      tries++;
      const [x, z] = pol(rand(-40, 70), Math.sqrt(random()) * 1000);
      const zone = zoneAt(x, z);
      const sd = streamDist(x, z);
      // in thickets: along the stream and in broad drifts across the flats, open meadow between
      const band = noise2(x * 0.012 + 21, z * 0.012 - 5) + noise2(x * 0.04 - 3, z * 0.04 + 9) * 0.3;
      const thicket = smoothstep(0.02, 0.22, band);
      const w =
        zone === 3
          ? 0.04 + (sd < 30 ? 0.6 : 0) + thicket * 0.9
          : zone === 2
            ? 0.1 + thicket * 0.6
            : zone === 4
              ? 0.04 + thicket * 0.4
              : 0;
      if (random() > w) continue;
      const h = groundAt(x, z);
      if (h < WATER_Y + 0.1 || sd < 7) continue;
      // the near bank, where the stream comes close on the right, stays open: the stand looks down onto the water
      const t = tierAt(x, z);
      if (t.az > 4 && t.az < 50 && t.r < 222) continue;
      if (nearestStandDist(x, z) < 30 || inStandCorridor(x, z, 120)) continue;
      const hh = rand(2.8, 5.2) * (sd < 30 ? 1.1 : 1);
      items.push({ x, y: h - 0.15, z, rot: rand(0, TAU), sx: hh * rand(1.5, 2.2), sy: hh, tile: 0 });
    }
    tries = 0;
    let n = 0;
    while (n < 2200 && tries < 200000) {
      tries++;
      const near = chance(0.6);
      const [x, z] = near ? pol(rand(-75, 95), rand(6, 200)) : pol(rand(-60, 90), rand(150, 900));
      const zone = zoneAt(x, z);
      const patch = noise2(x * 0.02 - 13, z * 0.02 + 6) + noise2(x * 0.07 + 2, z * 0.07) * 0.25;
      // thick on the stand's slope, in drifts along the bench's edges and the hillsides, little out on the meadow
      const base = zone === 0 ? 0.3 : zone === 1 ? 0.02 + smoothstep(0.15, 0.4, patch) * 0.3 : zone === 6 ? 0.4 : 0.06;
      if (random() > base * (zone === 0 ? 1 : smoothstep(-0.05, 0.3, patch) + 0.15)) continue;
      const h = groundAt(x, z);
      if (h < WATER_Y + 0.15 || streamDist(x, z) < 6) continue;
      if (nearestStandDist(x, z) < 5) continue;
      const hh = rand(0.6, 1.4) * (zone === 0 ? 1.1 : 1);
      items.push({ x, y: h - 0.1, z, rot: rand(0, TAU), sx: hh * rand(1.6, 2.4), sy: hh, tile: 1 });
      n++;
    }
    return items;
  });
  SHRUB_PTS = SHRUBS.filter((s) => s.tile === 0).map((i) => ({ x: i.x, z: i.z }));
}

let W = null;
export function build() {
  if (W) return W;
  FLOOR = smoothLine(FLOOR_CP, true, 260);
  GULLY = smoothLine(GULLY_CP, false, 120);
  GULLY_L = lens(GULLY);
  buildGrid();
  buildStream();
  makePools();
  placeStand();
  buildWaterPts();
  buildShrubs();
  let x0 = 1e9,
    x1 = -1e9,
    z0 = 1e9,
    z1 = -1e9;
  for (const p of FLOOR) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
  }
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
    zoneAt,
    tierAt,
    baseGround,
    river: riverLine(),
    // for the browser (render/core.js setMapLook and render/alpine.js)
    look: {
      fog: 0.000045,
      far: 50000,
      sunAt: { x: 120, z: -380 },
      // open water is drawn only by the stream, the pond and the pools (the low valley must stay dry)
      waterNear: true,
      mountains: true,
      // the bushes' colours: gold willow, red dwarf birch (3D leaves; the flat cards far off)
      shrubs3d: [
        [0.95, 0.72, 0.26],
        [0.62, 0.12, 0.08],
      ],
      shrubCards: [
        [1.15, 0.92, 0.45],
        [1.05, 0.3, 0.2],
      ],
    },
    openBox: { x0, x1, z0, z1 },
  };
  return W;
}
