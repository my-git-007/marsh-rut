// render/boulders.js — scanned boulders (Megascans, made small by tools/scan-assets/prep.py), from knee-high stones
// to glacial erratics the size of a cabin. Where they go is the map's (shared/maps/*.js ROCKS: seeded, the same for
// every player, and solid to the animals); a map without rocks loads nothing. On any error the map has no boulders.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ROCKS, groundAt } from '../../../shared/world.js';
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

export async function buildBoulders() {
  const t0 = performance.now();
  const rocks = ROCKS;
  if (!rocks.length) return null;
  const models = await Promise.all([flatUrl, mossyUrl, roundUrl, erraticUrl].map(model));
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
