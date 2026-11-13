// render/boulders.js — scanned boulders (Megascans, made small by tools/scan-assets/prep.py), from knee-high stones
// to glacial erratics the size of a cabin. Alpine Valley Stream gets them all through the valley, in loose groups;
// the marsh gets a scatter of big erratics along its edges and islands. Seeded, so every visit has the same rocks.
// Loaded after the trees; on any error the map simply has no boulders.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TAU, lerp, mulberry32 } from '../../../shared/util.js';
import {
  MAP,
  WATER_Y,
  groundAt,
  inStandCorridor,
  marshE,
  nearestStandDist,
  streamDist,
} from '../../../shared/world.js';
import { PLAYER } from '../state.js';
import { V } from '../ui/input.js';
import { scene } from './core.js';
import { addObstacle } from './vegetation.js';
import flatUrl from '../../assets/scan/boulder-flat.glb?url';
import mossyUrl from '../../assets/scan/boulder-mossy.glb?url';
import roundUrl from '../../assets/scan/boulder-round.glb?url';
import erraticUrl from '../../assets/scan/boulder-erratic.glb?url';

const CELL = 80; // metres: rocks are drawn in squares, so the ones out of view are skipped
const load = (url) => new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));

// the one mesh in a boulder .glb, with its node transform (Z-up centimetres -> metres) and its size
async function model(url) {
  const g = await load(url);
  g.scene.updateMatrixWorld(true);
  let out = null;
  g.scene.traverse((o) => {
    if (!o.isMesh || out) return;
    const box = new THREE.Box3().setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(o.matrixWorld);
    const s = box.getSize(new THREE.Vector3());
    o.material.side = THREE.FrontSide;
    out = {
      geo: o.geometry,
      mat: o.material,
      base: o.matrixWorld.clone(),
      lift: -box.min.y,
      h: s.y,
      w: Math.max(s.x, s.z),
    };
  });
  return out;
}

// the lowest ground under a rock (its middle and four points round its edge), so it doesn't float on a slope
const lowGround = (x, z, r) =>
  Math.min(groundAt(x, z), groundAt(x + r, z), groundAt(x - r, z), groundAt(x, z + r), groundAt(x, z - r));

const _m = new THREE.Matrix4(),
  _p = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _s = new THREE.Vector3(),
  _e = new THREE.Euler();

// where the rocks go on this map: [{x, z, size (largest dimension, m), m (model index)}]
function layout() {
  const r = mulberry32(MAP.id === 'alpine-valley-stream' ? 4711 : 1903);
  const R = (a, b) => lerp(a, b, r());
  const alpine = MAP.id === 'alpine-valley-stream';
  const ok = (x, z, size) => {
    const h = groundAt(x, z);
    if (h < WATER_Y + 0.3 || streamDist(x, z) < 3 + size * 0.5) return false;
    if (nearestStandDist(x, z) < 10 + size) return false;
    if (inStandCorridor(x, z, 60)) return false; // the shooting lane stays clear near the stand
    return alpine ? true : marshE(x, z) > -0.02 && marshE(x, z) < 0.08; // the marsh: its edges and islands
  };
  // knee-high stones, rocks as tall as a man, boulders the size of a truck, and glacial erratics like a cabin
  // (the small ones vanish in the dwarf birch, so most are big)
  const size = () => {
    const u = r();
    return u < 0.3 ? R(0.8, 1.6) : u < 0.65 ? R(1.6, 3.5) : u < 0.9 ? R(3.5, 7) : R(8, 14);
  };
  const pickModel = (s) => (s > 7 ? 3 : s > 3.5 && r() < 0.4 ? 3 : Math.floor(r() * 3));
  const out = [];
  const put = (x, z, s) => {
    if (ok(x, z, s)) out.push({ x, z, size: s, m: pickModel(s), yaw: r() * TAU, tilt: R(-0.12, 0.12) });
  };
  const N = alpine ? 320 : 60;
  const span = alpine ? 900 : 650;
  // only where the hunter can look from the stand (a bearing is yaw = atan2(-dx, -dz)); all round if no limits
  const L = V.lim,
    lo = L ? L.yaw0 - L.right - 0.15 : 0,
    hi = L ? L.yaw0 + L.left + 0.15 : TAU;
  for (let i = 0; i < N; i++) {
    // closer to the stand more often (where single rocks show), but out across the valley too
    const a = R(lo, hi),
      d = 25 + Math.pow(r(), 1.3) * span;
    const x = PLAYER.x - Math.sin(a) * d,
      z = PLAYER.z - Math.cos(a) * d;
    const s = alpine ? size() : R(3, 12);
    put(x, z, s);
    // a big one usually has company: smaller rocks that broke off it or were dropped with it
    if (s > 2.5 && r() < 0.7)
      for (let k = 0, n = Math.floor(R(2, 7)); k < n; k++) {
        const b = r() * TAU,
          q = s * R(0.6, 1.8);
        put(x + Math.cos(b) * q, z + Math.sin(b) * q, s * R(0.15, 0.45));
      }
  }
  return out;
}

export async function buildBoulders() {
  const t0 = performance.now();
  const models = await Promise.all([flatUrl, mossyUrl, roundUrl, erraticUrl].map(model));
  const rocks = layout();
  const cells = new Map();
  for (const k of rocks) {
    const key = `${k.m}|${Math.floor(k.x / CELL)}|${Math.floor(k.z / CELL)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(k);
  }
  for (const [key, list] of cells) {
    const M = models[+key.split('|')[0]];
    // the same mesh data for every group of a model (only the bounding sphere is its own)
    const geo = new THREE.BufferGeometry();
    for (const n in M.geo.attributes) geo.setAttribute(n, M.geo.attributes[n]);
    geo.setIndex(M.geo.index);
    const im = new THREE.InstancedMesh(geo, M.mat, list.length);
    const box = new THREE.Box3();
    let big = 0;
    list.forEach((k, i) => {
      const s = k.size / M.w,
        sink = 0.12 + 0.08 * Math.sin(k.yaw * 3), // sunk 4-20 % of their height into the ground
        y = lowGround(k.x, k.z, k.size * 0.4) + (M.lift - sink * M.h) * s;
      _p.set(k.x, y, k.z);
      _q.setFromEuler(_e.set(k.tilt, k.yaw, k.tilt * 0.6));
      _s.setScalar(s);
      _m.compose(_p, _q, _s).multiply(M.base);
      im.setMatrixAt(i, _m);
      box.expandByPoint(_p);
      big = Math.max(big, k.size);
      // the rangefinder stops at the bigger ones
      if (k.size > 1.5) addObstacle(k.x, groundAt(k.x, k.z), k.z, M.h * s * (1 - sink), 7, k.size * 0.45);
    });
    geo.boundingSphere = new THREE.Sphere();
    box.getBoundingSphere(geo.boundingSphere);
    geo.boundingSphere.radius += big;
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  }
  const info = {
    rocks: rocks.length,
    big: rocks.filter((k) => k.size > 5.5).length,
    ms: Math.round(performance.now() - t0),
  };
  window.__boulders = info;
  // (for tests: aim the binoculars at the big ones)
  window.__bouldersBig = rocks.filter((k) => k.size > 4).map((k) => ({ ...k, gy: groundAt(k.x, k.z) }));
  return info;
}
