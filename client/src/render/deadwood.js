// render/deadwood.js — the old timber lying about the marsh: scanned spruce logs (some blown over with their root
// plate torn out of the bog), and old stumps, mossy, rotten, sawn low or snapped off high (Megascans, made small by
// tools/scan-assets/prep.py). A few round every stand (the old cuts from when it was built), the rest out across the
// marsh. Seeded, so every player sees the same ones. They're low enough for a moose to step over, so the animals
// don't need to know about them. On any error the marsh has none.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TAU, lerp, mulberry32 } from '../../../shared/util.js';
import {
  MAP,
  ROCKS,
  STANDS,
  WATER_Y,
  groundAt,
  inStandCorridor,
  marshE,
  nearestStandDist,
  streamDist,
} from '../../../shared/world.js';
import { camera, scene } from './core.js';
import logBigUrl from '../../assets/scan/log-spruce-big.glb?url';
import logBigFarUrl from '../../assets/scan/log-spruce-big-far.glb?url';
import logUrl from '../../assets/scan/log-spruce.glb?url';
import logFarUrl from '../../assets/scan/log-spruce-far.glb?url';
import uprootUrl from '../../assets/scan/log-uprooted.glb?url';
import uprootFarUrl from '../../assets/scan/log-uprooted-far.glb?url';
import uprootSmallUrl from '../../assets/scan/log-uprooted-small.glb?url';
import uprootSmallFarUrl from '../../assets/scan/log-uprooted-small-far.glb?url';
import stumpMossyUrl from '../../assets/scan/stump-mossy.glb?url';
import stumpMossyFarUrl from '../../assets/scan/stump-mossy-far.glb?url';
import stumpRottenUrl from '../../assets/scan/stump-rotten.glb?url';
import stumpRottenFarUrl from '../../assets/scan/stump-rotten-far.glb?url';
import stumpLowUrl from '../../assets/scan/stump-low.glb?url';
import stumpLowFarUrl from '../../assets/scan/stump-low-far.glb?url';
import stumpTallUrl from '../../assets/scan/stump-tall.glb?url';
import stumpTallFarUrl from '../../assets/scan/stump-tall-far.glb?url';
import stumpBrokenUrl from '../../assets/scan/stump-broken.glb?url';
import stumpBrokenFarUrl from '../../assets/scan/stump-broken-far.glb?url';

// each model and how big it's drawn (the scans are of smaller wood than a marsh's old spruce); lift: how far a log
// rests above the ground, so the grass doesn't swallow it (the root plates sit down on it)
const LOGS = [
  { url: logBigUrl, far: logBigFarUrl, k: 1.9, lift: 0.1 }, // 4.7 m -> 9 m
  { url: logUrl, far: logFarUrl, k: 2.2, lift: 0.1 }, // 2.3 m -> 5 m
  { url: uprootUrl, far: uprootFarUrl, k: 1.6, lift: 0 }, // 3.9 m, root plate 2.2 m high -> 6 m, 3.5 m
  { url: uprootSmallUrl, far: uprootSmallFarUrl, k: 1.7, lift: 0 }, // 2.8 m -> 4.7 m
];
const STUMPS = [
  { url: stumpMossyUrl, far: stumpMossyFarUrl, k: 1 }, // 1 m, wide and mossy
  { url: stumpRottenUrl, far: stumpRottenFarUrl, k: 1 }, // 1.7 m, rotten away on one side
  { url: stumpLowUrl, far: stumpLowFarUrl, k: 1.2 }, // 0.6 m, an old low cut
  { url: stumpTallUrl, far: stumpTallFarUrl, k: 0.8 }, // 2.3 m, snapped off high
  { url: stumpBrokenUrl, far: stumpBrokenFarUrl, k: 1 }, // 1.8 m, broken
];
// a copy is drawn from the full scan when it's within this many metres (or looks it, through the binoculars), else
// from a light one (a few thousand triangles, no shadow)
const NEAR = 120;

const load = (url) => new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));

// the one mesh in a scan .glb, and a matrix that stands it upright in metres, centred, its lowest point at y = 0
// (and for a log, its long side along +x)
async function model(url, farUrl, alongX) {
  const [g, f] = await Promise.all([load(url), load(farUrl)]);
  g.scene.updateMatrixWorld(true);
  let out = null;
  g.scene.traverse((o) => {
    if (!o.isMesh || out) return;
    const box = new THREE.Box3().setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(o.matrixWorld);
    const c = box.getCenter(new THREE.Vector3()),
      s = box.getSize(new THREE.Vector3());
    const turn = new THREE.Matrix4().makeRotationY(alongX && s.z > s.x ? Math.PI / 2 : 0);
    const base = turn.multiply(new THREE.Matrix4().makeTranslation(-c.x, -box.min.y, -c.z)).multiply(o.matrixWorld);
    // wood isn't metal (glTF's default is fully metallic, scaled by the map, and with no reflections to show that
    // goes dark), and it's lifted a little: the scans were shot in forest shade, this is open marsh
    const m = o.material;
    m.side = THREE.FrontSide;
    m.metalness = 0;
    m.metalnessMap = null;
    m.color.setScalar(1.35);
    out = { geo: o.geometry, mat: o.material, base, L: Math.max(s.x, s.z) };
  });
  // (the far copy has the same node, so the same matrix fits it)
  f.scene.traverse((o) => {
    if (o.isMesh && !out.far) out.far = o.geometry;
  });
  return out;
}

// the lowest ground under a stump (its middle and four points round it), so it doesn't float on a slope
const lowGround = (x, z, r) =>
  Math.min(groundAt(x, z), groundAt(x + r, z), groundAt(x - r, z), groundAt(x, z + r), groundAt(x, z - r));

// where they go: [{ kind: 'log' | 'stump', x, z, yaw, s, v }]
function layout() {
  const r = mulberry32(6060),
    R = (a, b) => lerp(a, b, r());
  const out = [];
  const clear = (x, z, room) => {
    if (groundAt(x, z) < WATER_Y + 0.12 || streamDist(x, z) < 2 + room) return false;
    if (nearestStandDist(x, z) < 4 + room) return false;
    for (const k of ROCKS) if (Math.hypot(k.x - x, k.z - z) < k.r + room) return false;
    return true;
  };
  const put = (kind, x, z, room) => {
    if (!clear(x, z, room)) return false;
    out.push({ kind, x, z, yaw: R(0, TAU), s: R(0.85, 1.2), v: r() }); // (v picks the model)
    return true;
  };
  // round every stand: the stumps of the trees cut to build it and open the lane, and a log or two
  for (const st of STANDS) {
    // (in front of it, where the hunter can see them: a bearing is yaw, facing (-sin, -cos))
    const front = (spread, d) => {
      const a = st.yaw + R(-spread, spread);
      return [st.x - Math.sin(a) * d, st.z - Math.cos(a) * d];
    };
    for (let n = 0, i = 0; n < 7 && i < 80; i++) {
      const [x, z] = front(1.5, R(6, 35));
      if (put('stump', x, z, 0.8)) n++;
    }
    for (let n = 0, i = 0; n < 3 && i < 60; i++) {
      const [x, z] = front(1.4, R(12, 45));
      if (inStandCorridor(x, z, 60)) continue; // nothing lying across the near lane
      if (put('log', x, z, 9)) n++; // (room for its whole length, whichever way it lies)
    }
  }
  // out across the marsh and along its edge
  for (let n = 0, i = 0; n < 220 && i < 3000; i++) {
    const x = R(-250, 250),
      z = R(-770, 0);
    if (marshE(x, z) > 0.05) continue;
    if (put('stump', x, z, 0.8)) n++;
  }
  for (let n = 0, i = 0; n < 110 && i < 3000; i++) {
    const x = R(-250, 250),
      z = R(-770, 0);
    if (marshE(x, z) > 0.05 || inStandCorridor(x, z, 50)) continue;
    if (put('log', x, z, 9)) n++; // (room for its whole length, whichever way it lies)
  }
  return out;
}

const _m = new THREE.Matrix4(),
  _p = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _s = new THREE.Vector3(),
  _e = new THREE.Euler();

const GROUPS = []; // per model: its near and far meshes, and every placed copy ({ m: matrix, p: where })
let seen = null; // where the camera was (and its field of view) when they were last sorted near and far

// each frame: the copies near the camera (or that look near, through the binoculars) from the full scan, the rest
// from the light copy. Only re-sorted when the view has moved or zoomed, which in a stand is seldom.
export function updateDeadwood(cam, fov) {
  if (seen && seen.p.distanceToSquared(cam.position) < 4 && Math.abs(Math.log(seen.fov / fov)) < 0.05) return;
  seen = { p: cam.position.clone(), fov };
  const lim = NEAR * (62 / fov);
  for (const G of GROUPS) {
    let n = 0,
      f = 0;
    for (const c of G.list) {
      if (c.p.distanceTo(cam.position) - c.r < lim) G.near.setMatrixAt(n++, c.m);
      else G.far.setMatrixAt(f++, c.m);
    }
    G.near.count = n;
    G.far.count = f;
    G.near.instanceMatrix.needsUpdate = G.far.instanceMatrix.needsUpdate = true;
  }
}

export async function buildDeadwood() {
  if (MAP.id !== 'the-marsh') return null;
  const t0 = performance.now();
  const [logs, stumps] = await Promise.all([
    Promise.all(LOGS.map((d) => model(d.url, d.far, true).then((M) => ({ ...d, ...M, log: true, list: [] })))),
    Promise.all(STUMPS.map((d) => model(d.url, d.far, false).then((M) => ({ ...d, ...M, log: false, list: [] })))),
  ]);
  const items = layout();
  for (const it of items) {
    const kinds = it.kind === 'log' ? logs : stumps,
      M = kinds[Math.floor(it.v * kinds.length)];
    const s = M.k * it.s;
    let y,
      pitch = 0;
    if (M.log) {
      // lying along the ground: its ends follow the slope
      const h = (M.L * s) / 2,
        dx = Math.cos(it.yaw) * h,
        dz = -Math.sin(it.yaw) * h;
      const g1 = groundAt(it.x - dx, it.z - dz),
        g2 = groundAt(it.x + dx, it.z + dz);
      pitch = Math.atan2(g2 - g1, 2 * h);
      y = Math.min((g1 + g2) / 2, groundAt(it.x, it.z)) + M.lift - 0.05;
    } else y = lowGround(it.x, it.z, M.L * s * 0.3) - 0.06 * s; // set down into the moss
    _p.set(it.x, y, it.z);
    _q.setFromEuler(_e.set(0, it.yaw, pitch, 'YXZ'));
    _s.setScalar(s);
    M.list.push({ m: new THREE.Matrix4().compose(_p, _q, _s).multiply(M.base), p: _p.clone(), r: (M.L * s) / 2 });
  }
  let tris = 0;
  for (const M of [...logs, ...stumps]) {
    if (!M.list.length) continue;
    // (spread over the whole marsh: cheaper to draw than to cull)
    const near = new THREE.InstancedMesh(M.geo, M.mat, M.list.length),
      far = new THREE.InstancedMesh(M.far, M.mat, M.list.length);
    near.frustumCulled = far.frustumCulled = false;
    near.castShadow = true; // (the far ones' shadows are lost in the grass)
    near.receiveShadow = far.receiveShadow = true;
    scene.add(near, far);
    GROUPS.push({ near, far, list: M.list });
    tris += (M.geo.index.count / 3) * M.list.length;
  }
  seen = null;
  updateDeadwood(camera, camera.fov);
  const info = {
    get full() {
      return GROUPS.reduce((n, G) => n + G.near.count, 0); // (how many are drawn from the full scans now)
    },
    logs: items.filter((i) => i.kind === 'log').length,
    stumps: items.filter((i) => i.kind === 'stump').length,
    tris,
    ms: Math.round(performance.now() - t0),
  };
  // (in test runs: the nearest few of each, to aim at)
  if (/[?&]test=/.test(location.search)) {
    const P = STANDS[0];
    info.near = ['log', 'stump'].map((k) =>
      items
        .filter((i) => i.kind === k)
        .map((i) => ({ x: i.x, z: i.z, y: groundAt(i.x, i.z), d: Math.hypot(i.x - P.x, i.z - P.z), m: i.v }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 12),
    );
  }
  window.__deadwood = info;
  return info;
}
