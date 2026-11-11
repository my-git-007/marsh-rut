// render/alpine.js — what Alpine Valley Stream looks like (its ground is shared/maps/alpine.js): tundra in autumn
// colour (gold grass, red dwarf birch, orange slopes), patchy spruce, gravel washes, bare rock higher up and snow on
// the peaks. The ground near the valley is one detailed mesh; the mountains around it a second, coarser one that
// reaches 12 km out.
import * as THREE from 'three';
import { PI, TAU, clamp, chance, lin, mix3, noise2, rand, smoothstep } from '../../../shared/util.js';
import {
  MAP,
  WATER_Y,
  groundAt,
  marshE,
  nearestStandDist,
  inStandCorridor,
  streamDist,
} from '../../../shared/world.js';

// the near mesh covers this; the far one has a hole in it here
export const NEAR = { x0: -1300, x1: 1900, z0: -1700, z1: 500, step: 5 };
const FAR = { r: 12000, step: 50 };

// how thick the spruce grows (0..1): groves on the floor, a broken band of timber on the lower slopes that
// thins out to the treeline
export function spruceDensity(x, z, h = groundAt(x, z), e = marshE(x, z)) {
  const f = e * 300;
  const patch = noise2(x * 0.0065 + 31, z * 0.0065 - 12) + noise2(x * 0.02 + 5, z * 0.02) * 0.35;
  if (f < 0) {
    // the floor: open tundra with groves, a few more by the stream
    const sd = streamDist(x, z);
    return clamp(
      0.006 + smoothstep(0.26, 0.46, patch) * 0.5 + (sd < 40 ? 0.04 : 0) + smoothstep(-50, 0, f) * 0.05,
      0,
      1,
    );
  }
  const line = 1 - smoothstep(150, 330, h + noise2(x * 0.004, z * 0.004) * 90); // the treeline
  return clamp((0.04 + smoothstep(-0.08, 0.35, patch) * 0.6) * line, 0, 1);
}

// the ground's colour (linear RGB, before the detail texture)
export function alpineColor(x, z, h, e, slope) {
  const n1 = noise2(x * 0.009 + 11, z * 0.009),
    n2 = noise2(x * 0.035, z * 0.035 + 4),
    n3 = noise2(x * 0.12, z * 0.12),
    nb = noise2(x * 0.0022 - 7, z * 0.0022 + 3);
  const f = e * 300;
  // the tundra: straw-gold grass, rust and red where the dwarf birch and blueberry grow, olive in the hollows
  let c = [0.58, 0.48, 0.3];
  c = mix3(c, [0.55, 0.3, 0.17], clamp(0.15 + n1 * 1.4, 0, 0.45));
  c = mix3(c, [0.48, 0.45, 0.25], clamp(-n2 * 1.4, 0, 0.5));
  c = mix3(c, [0.74, 0.6, 0.34], clamp(n2 * 1.3, 0, 0.45));
  // pale, frosted grass on the open floor
  if (f < 0) c = mix3(c, [0.7, 0.66, 0.56], clamp(noise2(x * 0.014 + 50, z * 0.014) * 1.6, 0, 0.45));
  // the slopes: rust, red and olive-brown in patches, with darker spruce
  const up = smoothstep(14, 70, h) * smoothstep(0, 60, f); // up the slopes (not the bench the stand is on)
  const slopeCol = mix3(
    mix3([0.64, 0.36, 0.16], [0.55, 0.22, 0.11], clamp(0.5 + nb * 2.2, 0, 1)),
    [0.47, 0.42, 0.26],
    clamp(0.3 + n1 * 1.6, 0, 0.7),
  );
  c = mix3(c, slopeCol, up * 0.7);
  // a patchwork on the far slopes: browner and greener stretches, darker in the hollows
  const nm = noise2(x * 0.006 + 3.3, z * 0.006 - 8.1);
  c = mix3(c, [0.36, 0.33, 0.2], clamp(nm * 1.8, 0, 0.45) * up);
  c = mix3(c, [0.52, 0.42, 0.24], clamp(-nm * 1.8, 0, 0.35) * up);
  if (h < 400) {
    const sp = spruceDensity(x, z, h, e) * smoothstep(-20, 60, f);
    c = mix3(c, [0.1, 0.13, 0.08], clamp(sp * 0.85, 0, 0.8));
  }
  // higher up: brown alpine tundra, then grey rock and scree; steep faces are bare, darker rock
  c = mix3(
    c,
    mix3([0.44, 0.33, 0.22], [0.5, 0.3, 0.16], clamp(0.5 + n1 * 2, 0, 1)),
    smoothstep(320, 620, h + nb * 140),
  );
  const rock = [0.38 + n2 * 0.1, 0.36 + n2 * 0.09, 0.35 + n2 * 0.08];
  c = mix3(
    c,
    rock,
    clamp(smoothstep(650, 1050, h + nb * 200) + smoothstep(0.5, 0.78, slope) * smoothstep(150, 400, h), 0, 1),
  );
  c = mix3(c, [0.24, 0.23, 0.23], smoothstep(0.7, 0.92, slope) * smoothstep(300, 700, h) * 0.6);
  // snow: on the high ground, in streaks and fields; it doesn't hold on the steepest faces
  const snowLine = 1250 + nb * 220 + n1 * 120 + n2 * 60;
  const snow = smoothstep(snowLine - 120, snowLine + 80, h) * (1 - smoothstep(0.62, 0.85, slope) * 0.85);
  c = mix3(c, [0.95, 0.96, 0.99], snow);
  // the gravel wash coming down the side valley
  const wash = MAP.washAt ? MAP.washAt(x, z) : 0;
  c = mix3(c, [0.56 + n3 * 0.05, 0.55 + n3 * 0.05, 0.52 + n3 * 0.05], wash * 0.85);
  // wet ground by the water
  const wet = 1 - smoothstep(WATER_Y + 0.05, WATER_Y + 0.45, h);
  c = mix3(c, [0.22, 0.2, 0.13], wet * 0.85);
  if (h < WATER_Y) c = [0.16, 0.14, 0.1];
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
      e = marshE(x, z),
      ny = nrm.getY(i);
    const c = alpineColor(x, z, h, e, Math.sqrt(Math.max(0, 1 - ny * ny)));
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    // the meadow's detail texture almost everywhere; the forest floor's under thick spruce
    am[i] = 1 - (h < 400 ? spruceDensity(x, z, h, e) * 0.7 * smoothstep(-20, 60, e * 300) : 0);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aM', new THREE.BufferAttribute(am, 1));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// the mountains all around, 12 km out: coarse, with a hole where the near mesh is (it overlaps the near mesh by a
// cell, pushed back in depth so the near one wins there)
export function buildAlpineFar(scene) {
  const geo = gridGeo(-FAR.r, FAR.r, -FAR.r, FAR.r, FAR.step);
  const p = geo.attributes.position,
    n = p.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) p.setY(i, groundAt(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      h = p.getY(i),
      e = marshE(x, z),
      ny = nrm.getY(i);
    const c = alpineColor(x, z, h, e, Math.sqrt(Math.max(0, 1 - ny * ny)));
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // drop the cells the near mesh covers
  const idx = geo.index.array,
    keep = [];
  const m = FAR.step;
  for (let t = 0; t < idx.length; t += 3) {
    let inside = true;
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k],
        x = p.getX(v),
        z = p.getZ(v);
      if (x < NEAR.x0 + m || x > NEAR.x1 - m || z < NEAR.z0 + m || z > NEAR.z1 - m) inside = false;
    }
    if (!inside) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  geo.setIndex(keep);
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// Where the trees stand (render/vegetation.js buildForest draws them): spruce of three kinds, a few patches of
// aspen gone gold, and the odd dead snag. tiles: 0/1 white spruce, 2 black spruce, 3 subalpine fir, 4 aspen, 7 snag.
export function alpineTrees(TT) {
  const items = [],
    near = [];
  let tries = 0;
  while (items.length < 18000 && tries < 420000) {
    tries++;
    const x = rand(NEAR.x0 + 100, NEAR.x1 - 100),
      z = rand(NEAR.z0 + 100, 380);
    const e = marshE(x, z),
      h = groundAt(x, z);
    if (h < WATER_Y + 0.2 || h > 420) continue;
    const dens = spruceDensity(x, z, h, e);
    if (Math.random() > dens * 0.9) continue;
    const pd = nearestStandDist(x, z);
    if (pd < 2.6) continue;
    // nothing big right in front of the stand or beside it (the stand faces north): the view stays open
    if (pd < 16 && z < 3) continue;
    if (inStandCorridor(x, z, 48)) continue;
    if (streamDist(x, z) < 5) continue;
    const f = e * 300;
    const r = Math.random();
    const asp = noise2(x * 0.01 - 40, z * 0.01 + 7);
    let t;
    if (asp > 0.22 && h < 160 && r < 0.7) t = 4;
    else if (r < 0.012) t = 7;
    else if (h > 170) t = r < 0.55 ? 3 : 2;
    else if (f < 0) t = r < 0.62 ? 2 : r < 0.9 ? 0 : 3;
    else t = r < 0.45 ? 2 : r < 0.8 ? 0 : r < 0.9 ? 1 : 3;
    // stunted toward the treeline, short and spindly out on the floor
    const k = (1 - smoothstep(120, 330, h) * 0.6) * (f < 0 ? rand(0.45, 0.85) : 1);
    let ht = rand(TT[t].h[0], TT[t].h[1]) * k * (chance(0.25) ? rand(0.4, 0.7) : 1);
    ht = Math.max(ht, 2.2);
    const y = h - 0.3;
    if (pd < 30 && t < 4) {
      near.push({ x, y, z, h: ht, t });
      continue;
    }
    // narrow spires: the subalpine spruce is thin for its height
    items.push({
      x,
      y,
      z,
      rot: rand(0, TAU),
      sx: ht * TT[t].w * (t === 4 ? 0.9 : 0.78) * rand(0.85, 1.15),
      sy: ht,
      tile: t,
    });
  }
  return { items, near };
}

// the grass's colour here: gold and straw, rust where it runs into the birch, pale with frost in places
export function alpineGrassColour(x, z) {
  const n1 = noise2(x * 0.009 + 11, z * 0.009),
    n2 = noise2(x * 0.035, z * 0.035 + 4),
    nf = noise2(x * 0.014 + 50, z * 0.014);
  let c = [rand(1.02, 1.1), rand(0.92, 0.98), rand(0.66, 0.76)];
  const rust = clamp(0.2 + n1 * 1.4, 0, 0.8);
  c = [c[0] * (1 + rust * 0.03), c[1] * (1 - rust * 0.22), c[2] * (1 - rust * 0.4)];
  const pale = clamp(0.1 + nf * 1.6, 0, 0.6);
  c = mix3(c, [1.08, 1.05, 0.98], pale);
  c = c.map((v) => v * (0.98 + n2 * 0.25));
  return c;
}
