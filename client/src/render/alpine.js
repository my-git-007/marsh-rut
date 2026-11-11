// render/alpine.js — what Alpine Valley Stream looks like (its ground is shared/maps/alpine.js), after the user's
// picture: red dwarf birch on the stand's slope, a pale frosty meadow below it, gold willow and spruce groves on the
// flats by the stream, a lower straw-gold field past them, and hillsides of rust, orange and red tundra with dark
// spruce up to the treeline, then brown alpine tundra, grey rock and snow. The ground near the valley is one detailed
// mesh; around it a coarser one reaches 14 km, and a very coarse one carries the far ranges out to 40 km.
import * as THREE from 'three';
import { PI, TAU, clamp, chance, lin, mix3, noise2, rand, smoothstep } from '../../../shared/util.js';
import { MAP, WATER_Y, groundAt, nearestStandDist, inStandCorridor, streamDist } from '../../../shared/world.js';

// the near mesh covers this; the far ones have holes in them where the nearer one is
export const NEAR = { x0: -1500, x1: 2000, z0: -1900, z1: 500, step: 5 };
const FAR = { r: 14000, step: 70 };
const VFAR = { r: 40000, step: 500 };

// the steps of the land (shared/maps/alpine.js tierAt): how much of a point is the stand's slope, the meadow bench,
// the drop and the flats, and how much hillside (land well above the flats)
function tiers(x, z, h) {
  const t = MAP.tierAt(x, z);
  const front = 1 - smoothstep(20, 60, z); // (behind the stand it's all hillside)
  const slope = (1 - smoothstep(t.R0 - 10, t.R0 + 6, t.r)) * front;
  const bench = smoothstep(t.R0 - 10, t.R0 + 6, t.r) * (1 - smoothstep(t.R1 - 6, t.R1 + 14, t.r)) * front;
  const below = smoothstep(t.R1 - 6, t.R1 + 14, t.r) * front;
  // the hillsides: anything that stands well above the flats beyond the drop
  const hill = Math.max(below * smoothstep(14, 45, h), 1 - front, smoothstep(-36, -46, t.az) * smoothstep(30, 60, h));
  return { ...t, slope, bench, below: below * (1 - hill), hill };
}

// how thick the spruce grows (0..1)
export function spruceDensity(x, z, h = groundAt(x, z), T = tiers(x, z, h)) {
  const patch = noise2(x * 0.0065 + 31, z * 0.0065 - 12) + noise2(x * 0.02 + 5, z * 0.02) * 0.35;
  const grove = smoothstep(0.18, 0.42, patch);
  const sd = streamDist(x, z);
  // the bench: the odd small spruce; the flats: groves, thicker along the stream and toward the far side; the
  // hillsides: a broken band of timber low down, thinning out to the treeline
  const bench = 0.004 + smoothstep(0.35, 0.5, patch) * 0.05;
  const flats = 0.003 + grove * (0.25 + 0.4 * smoothstep(520, 800, T.r)) + (sd < 30 && sd > 9 ? 0.02 : 0);
  const line = 1 - smoothstep(170, 360, h + noise2(x * 0.004, z * 0.004) * 90);
  const hill = (0.02 + smoothstep(-0.05, 0.35, patch) * 0.75) * line;
  // the lower field past the second drop is open
  const field = smoothstep(1000, 1080, T.r) * (1 - smoothstep(14, 40, h));
  return clamp(T.slope * 0.02 + T.bench * bench + T.below * flats * (1 - field * 0.85) + T.hill * hill, 0, 1);
}

// the ground's colour (linear RGB, before the detail texture)
export function alpineColor(x, z, h, slope, near) {
  const n1 = noise2(x * 0.009 + 11, z * 0.009),
    n2 = noise2(x * 0.035, z * 0.035 + 4),
    n3 = noise2(x * 0.12, z * 0.12),
    nb = noise2(x * 0.0022 - 7, z * 0.0022 + 3),
    nm = noise2(x * 0.006 + 3.3, z * 0.006 - 8.1);
  const T = near ? tiers(x, z, h) : { slope: 0, bench: 0, below: h < 12 ? 1 : 0, hill: h < 12 ? 0 : 1, r: 1e4 };
  // the flats and the far valley: straw and olive under the willows, gold where the field opens out
  let c = mix3([0.44, 0.39, 0.25], [0.57, 0.48, 0.3], clamp(0.5 + n1 * 1.6, 0, 1));
  c = mix3(c, [0.5, 0.3, 0.18], clamp(n2 * 1.5, 0, 0.35)); // rust patches
  c = mix3(c, [0.42, 0.4, 0.22], clamp(-n2 * 1.4, 0, 0.4));
  c = mix3(c, [0.7, 0.58, 0.32], smoothstep(1000, 1100, T.r) * 0.6);
  // the meadow bench: pale, frosted grass, straw showing through, a little rust where the birch creeps in
  const frost = mix3([0.66, 0.6, 0.5], [0.78, 0.76, 0.72], clamp(0.35 + noise2(x * 0.03 + 50, z * 0.03) * 1.5, 0, 1));
  const benchCol = mix3(frost, [0.55, 0.38, 0.24], clamp(n1 * 1.5, 0, 0.35));
  c = mix3(c, benchCol, T.bench);
  // the stand's slope: dark earth and red leaf litter under the birch
  c = mix3(c, mix3([0.42, 0.3, 0.2], [0.5, 0.24, 0.14], clamp(0.5 + n2 * 2, 0, 1)), T.slope);
  // the hillsides: rust, orange and red tundra in broad sweeps, olive in the hollows
  const hillCol = mix3(
    mix3([0.72, 0.4, 0.15], [0.6, 0.2, 0.1], clamp(0.5 + nb * 2.4, 0, 1)),
    [0.45, 0.4, 0.22],
    clamp(0.25 + nm * 1.6, 0, 0.6),
  );
  c = mix3(c, hillCol, T.hill * 0.92);
  // spruce darkens the ground they stand on (more so from afar, where the trees themselves aren't drawn)
  if (h < 420) {
    const sp = spruceDensity(x, z, h, T);
    c = mix3(c, [0.1, 0.13, 0.08], clamp(sp * (near ? 0.8 : 1.1), 0, 0.85));
  }
  // higher up: brown alpine tundra, then grey rock and scree; steep faces are bare, darker rock
  c = mix3(
    c,
    mix3([0.5, 0.33, 0.2], [0.58, 0.32, 0.15], clamp(0.5 + n1 * 2, 0, 1)),
    smoothstep(260, 460, h + nb * 120),
  );
  const rock = [0.4 + n2 * 0.1, 0.38 + n2 * 0.09, 0.37 + n2 * 0.08];
  c = mix3(
    c,
    rock,
    clamp(smoothstep(380, 650, h + nb * 160) + smoothstep(0.35, 0.6, slope) * smoothstep(150, 380, h), 0, 1),
  );
  c = mix3(c, [0.2, 0.19, 0.19], smoothstep(0.55, 0.85, slope) * smoothstep(300, 700, h) * 0.8);
  // snow on the high ground, in streaks and fields; it doesn't hold on the steepest faces
  const snowLine = 820 + nb * 200 + n1 * 120 + n2 * 70;
  const snow = smoothstep(snowLine - 120, snowLine + 80, h) * (1 - smoothstep(0.66, 0.88, slope) * 0.8);
  c = mix3(c, [0.95, 0.96, 0.99], snow);
  // the gully's rocky bed
  const wash = near ? MAP.washAt(x, z) : 0;
  c = mix3(c, [0.6 + n3 * 0.05, 0.59 + n3 * 0.05, 0.56 + n3 * 0.05], wash * 0.85);
  // wet ground by the water
  if (near) {
    const wet = (1 - smoothstep(WATER_Y + 0.05, WATER_Y + 0.5, h)) * (streamDist(x, z) < 14 ? 1 : 0);
    c = mix3(c, [0.24, 0.21, 0.14], wet * 0.85);
    if (h < WATER_Y && streamDist(x, z) < 14) c = [0.17, 0.15, 0.11];
  }
  // far off, the colours fade toward the blue-grey of the air (more than the fog alone gives)
  if (!near) c = mix3(c, [0.5, 0.55, 0.62], smoothstep(2500, 18000, Math.hypot(x, z)) * 0.3);
  c = c.map((v) => v * (0.88 + n3 * 0.28));
  return lin(c);
}

function gridGeo(x0, x1, z0, z1, step) {
  const nx = Math.round((x1 - x0) / step),
    nz = Math.round((z1 - z0) / step);
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  geo.rotateX(-PI / 2);
  geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  return geo;
}

// the detailed ground around the valley; mat = the terrain material (render/terrain.js)
export function buildAlpineNear(mat, scene) {
  const geo = gridGeo(NEAR.x0, NEAR.x1, NEAR.z0, NEAR.z1, NEAR.step);
  const p = geo.attributes.position,
    n = p.count;
  const col = new Float32Array(n * 3),
    am = new Float32Array(n);
  for (let i = 0; i < n; i++) p.setY(i, groundAt(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      h = p.getY(i),
      ny = nrm.getY(i);
    const c = alpineColor(x, z, h, Math.sqrt(Math.max(0, 1 - ny * ny)), true);
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    // the meadow's detail texture almost everywhere; the forest floor's under thick spruce
    am[i] = 1 - (h < 420 ? spruceDensity(x, z, h) * 0.7 : 0);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aM', new THREE.BufferAttribute(am, 1));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  buildRiver(scene);
  return mesh;
}

// the far mesh's height at a point: the highest corner of its cell (the river is drawn just above it)
function farHeight(x, z) {
  const s = FAR.step,
    x0 = -FAR.r + Math.floor((x + FAR.r) / s) * s,
    z0 = -FAR.r + Math.floor((z + FAR.r) / s) * s;
  return Math.max(groundAt(x0, z0), groundAt(x0 + s, z0), groundAt(x0, z0 + s), groundAt(x0 + s, z0 + s)) - 0.3;
}

// a coarse ring of ground: the whole square, less the cells inside the hole (it overlaps the nearer mesh by a
// cell, pushed back in depth so the nearer one wins there)
function ringMesh(scene, R, step, hole, offset) {
  const geo = gridGeo(-R, R, -R, R, step);
  const p = geo.attributes.position,
    n = p.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) p.setY(i, groundAt(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const ny = nrm.getY(i);
    const c = alpineColor(p.getX(i), p.getZ(i), p.getY(i), Math.sqrt(Math.max(0, 1 - ny * ny)), false);
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const idx = geo.index.array,
    keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    let inside = true;
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k],
        x = p.getX(v),
        z = p.getZ(v);
      if (x < hole.x0 + step || x > hole.x1 - step || z < hole.z0 + step || z > hole.z1 - step) inside = false;
    }
    if (!inside) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  geo.setIndex(keep);
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: offset,
    polygonOffsetUnits: offset * 4,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
// the mountains all around
export function buildAlpineFar(scene) {
  ringMesh(scene, FAR.r, FAR.step, NEAR, 2);
  ringMesh(scene, VFAR.r, VFAR.step, { x0: -FAR.r, x1: FAR.r, z0: -FAR.r, z1: FAR.r }, 4);
}

// the river down the main valley past the second drop (map.river: its line and width): a ribbon of water a little
// under the valley floor's height, pale with the sky; white water where it falls steeply
function buildRiver(scene) {
  const L = MAP.river;
  if (!L || !L.length) return;
  const pos = [],
    col = [];
  const sky = lin([0.66, 0.74, 0.82]),
    white = lin([0.86, 0.88, 0.9]);
  let prevY = null;
  for (let i = 0; i < L.length - 1; i++) {
    const a = L[i],
      b = L[i + 1];
    const dx = b.x - a.x,
      dz = b.z - a.z,
      d = Math.hypot(dx, dz) || 1;
    const nx = -dz / d,
      nz = dx / d;
    // (past the near mesh the coarse far mesh can't follow the riverbed: keep the water just above it there)
    const inNear = a.x > NEAR.x0 && a.x < NEAR.x1 && a.z > NEAR.z0 && a.z < NEAR.z1;
    const y0 = MAP.baseGround(a.x, a.z) - 0.55;
    const y = inNear ? y0 : Math.max(y0, farHeight(a.x, a.z) + 0.4);
    const fall = prevY === null ? 0 : Math.max(0, prevY - y) / d;
    prevY = y;
    const c = mix3(sky, white, smoothstep(0.02, 0.08, fall));
    const w = a.w;
    pos.push(a.x + nx * w, y, a.z + nz * w, a.x - nx * w, y, a.z - nz * w);
    col.push(...c, ...c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const idx = [];
  for (let i = 0; i < pos.length / 6 - 1; i++) {
    const k = i * 2;
    idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
}

// Where the trees stand (render/vegetation.js buildForest draws them): spruce of three kinds, a few patches of
// aspen gone gold, and the odd dead snag. tiles: 0/1 white spruce, 2 black spruce, 3 subalpine fir, 4 aspen, 7 snag.
export function alpineTrees(TT) {
  const items = [],
    near = [];
  let tries = 0;
  while (items.length < 22000 && tries < 600000) {
    tries++;
    // more tries close in, where single trees show
    const x = rand(NEAR.x0 + 100, NEAR.x1 - 100),
      z = rand(NEAR.z0 + 100, 380);
    const h = groundAt(x, z);
    if (h < WATER_Y + 0.2 || h > 440) continue;
    const T = tiers(x, z, h);
    const dens = spruceDensity(x, z, h, T);
    if (Math.random() > dens * 0.9) continue;
    const pd = nearestStandDist(x, z);
    if (pd < 2.6) continue;
    // nothing big right in front of the stand or beside it (the stand faces north): the view stays open
    if (pd < 16 && z < 3) continue;
    if (inStandCorridor(x, z, 48)) continue;
    if (streamDist(x, z) < 8) continue;
    // the view down onto the stream where it comes close, on the right, stays open
    if (T.az > 4 && T.az < 50 && T.r < 222) continue;
    const r = Math.random();
    const asp = noise2(x * 0.01 - 40, z * 0.01 + 7);
    let t;
    if (asp > 0.25 && h < 160 && T.hill > 0.5 && r < 0.5) t = 4;
    else if (r < 0.012) t = 7;
    else if (h > 170) t = r < 0.55 ? 3 : 2;
    else t = r < 0.5 ? 2 : r < 0.85 ? 0 : r < 0.93 ? 1 : 3;
    // tall, narrow spires in the groves on the flats; small ones out on the bench; stunted toward the treeline
    const k =
      (1 - smoothstep(120, 360, h) * 0.6) *
      (T.bench > 0.5 ? rand(0.3, 0.6) : T.below > 0.5 ? rand(0.8, 1.15) : rand(0.7, 1));
    let ht = rand(TT[t].h[0], TT[t].h[1]) * k * (chance(0.2) ? rand(0.45, 0.75) : 1);
    ht = Math.max(ht, 2.2);
    const y = h - 0.3;
    if (pd < 30 && t < 4) {
      near.push({ x, y, z, h: ht, t });
      continue;
    }
    items.push({
      x,
      y,
      z,
      rot: rand(0, TAU),
      sx: ht * TT[t].w * (t === 4 ? 0.9 : 0.66) * rand(0.85, 1.15),
      sy: ht,
      tile: t,
    });
  }
  return { items, near };
}

// the grass's colour here: pale with frost on the bench, gold and straw on the flats, rust by the birch
export function alpineGrassColour(x, z) {
  const n1 = noise2(x * 0.009 + 11, z * 0.009),
    n2 = noise2(x * 0.035, z * 0.035 + 4),
    nf = noise2(x * 0.03 + 50, z * 0.03);
  const T = MAP.tierAt(x, z);
  let c = [rand(1.02, 1.1), rand(0.9, 0.97), rand(0.62, 0.72)];
  const rust = clamp(0.15 + n1 * 1.4, 0, 0.7);
  c = [c[0] * (1 + rust * 0.03), c[1] * (1 - rust * 0.22), c[2] * (1 - rust * 0.4)];
  const onBench = smoothstep(T.R0 - 10, T.R0 + 6, T.r) * (1 - smoothstep(T.R1 - 6, T.R1 + 14, T.r));
  const pale = clamp(0.3 + nf * 1.3, 0, 0.8) * (0.35 + onBench * 0.65);
  c = mix3(c, [1.1, 1.08, 1.04], pale);
  c = c.map((v) => v * (0.98 + n2 * 0.25) * (1 + onBench * 0.1));
  return c;
}
