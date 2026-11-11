// render/vegetation.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { PI, TAU, chance, clamp, lin, noise2, pick, rand, randi, smoothstep } from '../../../shared/util.js';
import {
  POND,
  POOLS,
  SHRUBS,
  STANDS,
  STREAM,
  WATER_Y,
  groundAt,
  marshE,
  streamDist,
  inStandCorridor,
  nearestStandDist,
} from '../../../shared/world.js';
import { PLAYER, TEST } from '../state.js';
import { atlasMats, buildInstanced, crossGeo, grassGeo, hideInstance, windInject } from './billboards.js';
import { buildPlants3D, plants3dWanted } from './plants3d.js';
import { C, SUN_DIR, scene } from './core.js';
import { T } from './textures.js';

/* ================= vegetation ================= */
// The grass depends on where this player sits (it is densest in front of their stand), so changing location
// grows it again: the old grass is removed first. The reeds along the water don't depend on the stand.
let GRASS = null,
  reedsBuilt = false;
function buildGrass() {
  if (GRASS) {
    scene.remove(GRASS);
    GRASS.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
    if (GRASS.children[0]) GRASS.children[0].material.dispose();
    GRASS = null;
  }
  const items = [];
  const FWD = Math.atan2(-Math.cos(PLAYER.yaw || 0), -Math.sin(PLAYER.yaw || 0));
  const fx = Math.cos(FWD),
    fz = Math.sin(FWD);
  // test scenes (?test=zoo, catalog, ...): a wide clearing in front of the stand, so every animal is in full view
  const clearing = TEST && TEST !== '1' && TEST !== 'solo';
  const tryAdd = (x, z) => {
    if (clearing) {
      const dx = x - PLAYER.x,
        dz = z - PLAYER.z,
        f = dx * fx + dz * fz,
        l = Math.abs(dz * fx - dx * fz);
      if (f > 3 && f < 340 && l < 35 + f * 0.45) return;
    }
    const e = marshE(x, z);
    if (e > 0.035) return;
    const edgeK = 1 - smoothstep(-0.012, 0.035, e);
    if (Math.random() > edgeK * edgeK + 0.02) return;
    const h = groundAt(x, z);
    if (h < WATER_Y + 0.05) return;
    const dens = 0.55 + 0.45 * noise2(x * 0.03 + 70, z * 0.03);
    if (Math.random() > dens + 0.25) return;
    const n1 = noise2(x * 0.009 + 11, z * 0.009),
      n2 = noise2(x * 0.035, z * 0.035 + 4);
    let k = rand(0.78, 1.12);
    let c = [k * rand(0.96, 1.04), k, k * rand(0.9, 1.05)];
    const rust = clamp(0.45 + n1 * 1.4, 0, 1);
    c = [c[0] * (1 + rust * 0.05), c[1] * (1 - rust * 0.16), c[2] * (1 - rust * 0.3)];
    const pale = clamp(n2 * 1.2, 0, 0.6);
    c = c.map((v) => v * (1 + pale * 0.25));
    const wet = 1 - smoothstep(WATER_Y + 0.05, WATER_Y + 0.7, h);
    c = [c[0] * (1 - wet * 0.35), c[1] * (1 - wet * 0.2), c[2] * (1 - wet * 0.45)];
    // a few patches where the grass grows shorter (open spots where smaller animals show)
    const short = smoothstep(0.14, 0.24, noise2(x * 0.016 + 41, z * 0.016 - 17));
    const hgt = rand(0.85, 1.42) * (1 - wet * 0.25) * (0.85 + 0.3 * dens) * (0.45 + 0.55 * edgeK) * (1 - 0.45 * short);
    items.push({
      x,
      y: h - 0.05,
      z,
      rot: rand(0, TAU),
      tx: rand(-0.08, 0.08),
      sx: rand(1.4, 2.3),
      sy: hgt,
      c: lin(c).map((v) => Math.pow(v, 0.45) * 1.18),
    });
  };
  for (let i = 0; i < 95000; i++) tryAdd(rand(-260, 260), rand(-760, 10));
  // extra-dense grass in front of this player's stand (it's only scenery, so each browser does its own)
  for (let i = 0; i < 70000; i++) {
    const a = rand(-PI * 0.95, PI * 0.95) + FWD,
      r = Math.sqrt(Math.random()) * 320;
    tryAdd(PLAYER.x + Math.cos(a) * r, PLAYER.z + Math.sin(a) * r);
  }
  for (let i = 0; i < 55000; i++) {
    const a = rand(-PI / 2, PI / 2) + FWD,
      r = Math.sqrt(Math.random()) * 110;
    tryAdd(PLAYER.x + Math.cos(a) * r, PLAYER.z + Math.sin(a) * r);
  }
  const sunH = new THREE.Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize();
  const nrm = new THREE.Vector3(sunH.x * 0.6, 1, sunH.z * 0.6).normalize();
  const mat = new THREE.MeshLambertMaterial({
    map: T.grass,
    alphaTest: 0.36,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  mat.onBeforeCompile = windInject(0.38);
  mat.customProgramCacheKey = () => 'grass';
  try {
    mat.alphaToCoverage = true;
  } catch (e) {}
  GRASS = buildInstanced(items, grassGeo(nrm), mat, { cell: 60, receive: true, layer: 1 });
  if (reedsBuilt) return;
  reedsBuilt = true;
  // cattails & reeds at water edges
  const reeds = [];
  const addReed = (x, z) => {
    const h = groundAt(x, z);
    if (Math.abs(h - WATER_Y) > 0.32) return;
    if (marshE(x, z) > 0) return;
    if (noise2(x * 0.05 + 3, z * 0.05) < -0.08) return;
    reeds.push({
      x,
      y: h - 0.05,
      z,
      rot: rand(0, TAU),
      sx: rand(1.0, 1.7),
      sy: rand(1.0, 1.9),
      c: [rand(0.85, 1.1), rand(0.85, 1.05), rand(0.8, 1)],
    });
  };
  for (const p of STREAM)
    for (let k = 0; k < 7; k++) {
      const a = rand(0, TAU),
        r = rand(2, 6.5);
      addReed(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
    }
  for (let i = 0; i < 2200; i++) {
    const a = rand(0, TAU),
      f = rand(0.9, 1.12);
    const c = Math.cos(POND.rot),
      s = Math.sin(POND.rot);
    const u = Math.cos(a) * POND.rx * f,
      v = Math.sin(a) * POND.rz * f;
    addReed(POND.x + u * c + v * s, POND.z - u * s + v * c);
  }
  for (const pl of POOLS)
    for (let k = 0; k < 40; k++) {
      const a = rand(0, TAU),
        r = pl.r * rand(0.7, 1.2);
      addReed(pl.x + Math.cos(a) * r, pl.z + Math.sin(a) * r);
    }
  const rm = new THREE.MeshLambertMaterial({
    map: T.cattail,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    vertexColors: true,
  });
  rm.onBeforeCompile = windInject(0.3);
  rm.customProgramCacheKey = () => 'reed';
  buildInstanced(reeds, grassGeo(nrm), rm, { cell: 80, receive: true, layer: 1 });
}
// the view lane in front of every stand is kept clear of trees and brush (shared/world.js)
const inFrontCorridor = inStandCorridor;
const TT = [
  { h: [14, 24], w: 0.4 },
  { h: [13, 22], w: 0.38 },
  { h: [8, 15], w: 0.26 },
  { h: [11, 19], w: 0.36 },
  { h: [14, 21], w: 0.58 },
  { h: [12, 18], w: 0.52 },
  { h: [9, 16], w: 0.4 },
  { h: [7, 15], w: 0.3 },
];
function buildForest() {
  const items = [],
    near = [];
  let tries = 0;
  while (items.length < 21000 && tries < 240000) {
    tries++;
    const x = rand(-650, 650),
      z = rand(-1030, 330);
    const e = marshE(x, z);
    const out = e * 300;
    if (out < -24 || out > 250) continue;
    const p = out < 0 ? 0.05 : out < 10 ? 0.95 : 0.78;
    if (Math.random() > p) continue;
    const pd = nearestStandDist(x, z);
    if (pd < 2.6) continue;
    if (inFrontCorridor(x, z, 48)) continue;
    if (streamDist(x, z) < 5) continue;
    const dec = noise2(x * 0.012 + 40, z * 0.012);
    const wet = out < 35;
    const r = Math.random();
    let t;
    if (dec > 0.17 && r < 0.78) t = r < 0.45 ? 4 : 5;
    else if (r < 0.025) t = 7;
    else if (wet && r < 0.36) t = r < 0.22 ? 2 : 6;
    else t = r < 0.5 ? 0 : r < 0.78 ? 1 : r < 0.9 ? 3 : 2;
    let h =
      rand(TT[t].h[0], TT[t].h[1]) *
      (chance(0.28) ? rand(0.4, 0.7) : 1) *
      (0.85 + 0.3 * noise2(x * 0.02, z * 0.02) + 0.15);
    if (out < 0) h *= 0.55;
    const y = groundAt(x, z) - 0.3;
    if (pd < 30 && t < 4) {
      near.push({ x, y, z, h, t });
      continue;
    }
    items.push({ x, y, z, rot: rand(0, TAU), sx: h * TT[t].w * rand(0.85, 1.18), sy: h, tile: t });
  }
  // islands of small conifers + scattered snags in the marsh
  const isl = [
    [-120, -300],
    [150, -560],
    [-60, -650],
    [190, -420],
    [-170, -470],
  ];
  for (let i = 0; i < 220; i++) {
    const c = pick(isl);
    const x = c[0] + rand(-25, 25) * Math.random() * 1.5,
      z = c[1] + rand(-25, 25) * Math.random() * 1.5;
    if (marshE(x, z) > 0 || groundAt(x, z) < WATER_Y + 0.1) continue;
    const t = chance(0.6) ? 2 : chance(0.5) ? 6 : 0;
    const h = rand(2.5, 9);
    items.push({ x, y: groundAt(x, z) - 0.2, z, rot: rand(0, TAU), sx: h * TT[t].w, sy: h, tile: t });
  }
  for (let i = 0; i < 30; i++) {
    const x = rand(-220, 220),
      z = rand(-720, -60);
    if (marshE(x, z) > -0.03 || groundAt(x, z) < WATER_Y + 0.1 || inFrontCorridor(x, z, 100)) continue;
    const h = rand(4, 10);
    items.push({ x, y: groundAt(x, z) - 0.2, z, rot: rand(0, TAU), sx: h * 0.3, sy: h, tile: 7 });
  }
  // understory: young spruce & brush along the timber edge
  for (let i = 0; i < 6000 && tries < 400000; i++) {
    tries++;
    const x = rand(-650, 650),
      z = rand(-1030, 330);
    const out = marshE(x, z) * 300;
    if (out < -6 || out > 22) continue;
    if (nearestStandDist(x, z) < 6 || inFrontCorridor(x, z, 40) || streamDist(x, z) < 5) continue;
    const t = chance(0.55) ? (chance(0.6) ? 2 : 0) : chance(0.5) ? 6 : 4;
    const h = rand(2.5, 7);
    items.push({ x, y: groundAt(x, z) - 0.2, z, rot: rand(0, TAU), sx: h * TT[t].w * rand(1, 1.4), sy: h, tile: t });
  }
  const { m, d } = atlasMats(T.trees, 4, 2, 0.45);
  buildInstanced(items, crossGeo(3, 0.55), m, { cell: 140, tile: true, cast: true, depth: d, track: FOREST.track });
  FOREST.items = items;
  FOREST.near = near;
  for (const it of items) addObstacle(it.x, it.y, it.z, it.sy, it.tile);
  for (const tr of near) addObstacle(tr.x, tr.y, tr.z, tr.h, tr.t);
  buildNearTrees(near);
}
// the card forest, remembered so the 3D plants (render/plants3d.js) can take the place of every tree but the snags
const FOREST = { items: [], near: [], track: new Map(), nearTrack: new Map(), shrubTrack: new Map() };
// willow and alder clumps: the layout is shared and seeded (the bulls thrash these), so every player sees the same bushes
function buildShrubs() {
  const { m, d } = atlasMats(T.bush, 2, 1, 0.4);
  buildInstanced(SHRUBS, crossGeo(3, 0.7), m, {
    cell: 120,
    tile: true,
    cast: true,
    depth: d,
    track: FOREST.shrubTrack,
  });
  for (const b of SHRUBS) addObstacle(b.x, b.y, b.z, b.sy * 1.2, b.tile, b.sx * 0.45);
}
/* ---------------- what the rangefinder hits: the real trees and bushes ---------------- */
// Each tree is a simple solid the size of its 3D model (a cone for the conifers, a trunk and a round crown for
// aspen and birch, a pole for a snag); each bush a dome. Kept in a 16 m grid so a sightline only checks nearby ones.
const OB_CELL = 16,
  OB = new Map();
const CONE_R = { 0: 0.17, 1: 0.17, 2: 0.1, 3: 0.14, 6: 0.15 }; // crown radius at the base, as a share of the height
function addObstacle(x, y, z, h, tile, shrubW) {
  let o;
  if (shrubW) o = { x, y, z, h, kind: 2, R: shrubW };
  else if (tile === 7) o = { x, y, z, h, kind: 3, R: 0.3 };
  else if (tile === 4 || tile === 5) o = { x, y, z, h, kind: 1, R: h * 0.22 };
  else o = { x, y, z, h, kind: 0, R: h * (CONE_R[tile] || 0.15) };
  const r = o.R + 0.5,
    c0 = Math.floor((x - r) / OB_CELL),
    c1 = Math.floor((x + r) / OB_CELL),
    d0 = Math.floor((z - r) / OB_CELL),
    d1 = Math.floor((z + r) / OB_CELL);
  for (let i = c0; i <= c1; i++)
    for (let j = d0; j <= d1; j++) {
      const k = i + ',' + j;
      if (!OB.has(k)) OB.set(k, []);
      OB.get(k).push(o);
    }
}
// the radius of an obstacle at height u above its base (0 = outside it)
function obRadius(o, u) {
  if (u < 0 || u > o.h) return 0;
  const f = u / o.h;
  if (o.kind === 0) return f < 0.08 ? 0.3 : o.R * (1 - f) + 0.15; // trunk, then the cone
  if (o.kind === 1) {
    if (f < 0.45) return 0.3; // the bare trunk
    const q = (f - 0.725) / 0.275; // a round crown over the top half
    return o.R * Math.sqrt(Math.max(0, 1 - q * q)) + 0.3;
  }
  if (o.kind === 2) return o.R * Math.sqrt(Math.max(0, 1 - f * f)); // a dome
  return o.R;
}
// distance along the sightline (o: start, d: unit direction) to the first tree or bush, or null within tMax
let obStamp = 0;
function obstacleHit(o, d, tMax) {
  const hl = Math.hypot(d.x, d.z);
  if (hl < 1e-4) return null;
  obStamp++;
  let best = null;
  const step = OB_CELL / 3 / hl; // along the line, a third of a cell at a time (sideways)
  for (let t = 0; t < tMax + step; t += step) {
    if (best !== null && t > best + OB_CELL / hl) break;
    const ci = Math.floor((o.x + d.x * t) / OB_CELL),
      cj = Math.floor((o.z + d.z * t) / OB_CELL);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const list = OB.get(ci + di + ',' + (cj + dj));
        if (list) best = obCheck(list, o, d, hl, tMax, best);
      }
  }
  return best;
}
function obCheck(list, o, d, hl, tMax, best) {
  {
    for (const b of list) {
      if (b.stamp === obStamp) continue;
      b.stamp = obStamp;
      // where the line passes within b.R of the stem (seen from above)
      const px = b.x - o.x,
        pz = b.z - o.z,
        tc = (px * d.x + pz * d.z) / (hl * hl),
        mx = o.x + d.x * tc - b.x,
        mz = o.z + d.z * tc - b.z,
        m2 = mx * mx + mz * mz,
        R = b.R + 0.3;
      if (m2 > R * R) continue;
      // the hunter's own eye inside it (a big spruce right beside the stand): look past it, not at it
      const ex = o.x - b.x,
        ez = o.z - b.z,
        er = obRadius(b, o.y - b.y);
      if (er > 0 && ex * ex + ez * ez < er * er) continue;
      const half = Math.sqrt(R * R - m2) / hl;
      const ta = Math.max(0.5, tc - half),
        tb = Math.min(tMax, tc + half);
      for (let s = 0; s <= 12; s++) {
        const tt = ta + ((tb - ta) * s) / 12;
        if (tt > tb || (best !== null && tt >= best)) break;
        const dx = o.x + d.x * tt - b.x,
          dz = o.z + d.z * tt - b.z,
          rr = obRadius(b, o.y + d.y * tt - b.y);
        if (rr > 0 && dx * dx + dz * dz < rr * rr) {
          best = tt;
          break;
        }
      }
    }
  }
  return best;
}
// Once the hunter is seated: real 3D trees (every kind but the dead snags) and willow/alder clumps
// in place of the cards (render/plants3d.js). Off in Game Settings, or on any error: the cards stay.
let plantsBuilt = false;
function buildPlants() {
  if (plantsBuilt || !plants3dWanted()) return null;
  plantsBuilt = true;
  const trees = [];
  for (const it of FOREST.items)
    if (it.tile !== 7)
      trees.push({
        x: it.x,
        y: it.y,
        z: it.z,
        h: it.sy,
        rot: it.rot,
        tile: it.tile,
        hide: (on) => hideInstance(FOREST.track, it, on),
      });
  for (const tr of FOREST.near)
    if (tr.trunk)
      trees.push({
        x: tr.x,
        y: tr.y,
        z: tr.z,
        h: tr.h,
        rot: hash01(tr.x, tr.z) * TAU,
        tile: tr.t,
        hide: (on) => {
          tr.trunk.visible = !on;
          for (const c of tr.cards) hideInstance(FOREST.nearTrack, c, on);
        },
      });
  const shrubs = SHRUBS.map((b) => ({
    x: b.x,
    y: b.y,
    z: b.z,
    sy: b.sy,
    rot: b.rot,
    tile: b.tile,
    hide: (on) => hideInstance(FOREST.shrubTrack, b, on),
  }));
  return buildPlants3D(trees, shrubs, PLAYER);
}
const hash01 = (x, z) => {
  const v = Math.sin(x * 7.13 + z * 3.71) * 9617.31;
  return v - Math.floor(v);
};
function buildNearTrees(list) {
  const bark = new THREE.MeshLambertMaterial({ map: T.bark });
  const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 10, 1, true);
  trunkGeo.translate(0, 0.5, 0);
  const cards = [];
  // the spruce each stand is hung on, half a metre behind the hunter
  const standTrees = STANDS.map((s) => {
    const x = s.x + Math.sin(s.yaw) * 0.5,
      z = s.z + Math.cos(s.yaw) * 0.5;
    return { x, z, y: groundAt(x, z) - 0.2, h: 19, t: 0, stand: true, eye: s.eye };
  });
  for (const tr of [...standTrees, ...list]) {
    const r = tr.stand ? 0.24 : 0.08 + tr.h * 0.011;
    const tm = new THREE.Mesh(trunkGeo, bark);
    tm.position.set(tr.x, tr.y, tr.z);
    tm.scale.set(r, tr.h, r);
    tm.castShadow = true;
    tm.layers.set(tr.stand ? 1 : 0);
    scene.add(tm);
    tr.trunk = tm;
    tr.cards = [];
    const maxR = tr.h * (tr.t === 2 ? 0.1 : 0.16);
    const step = tr.t === 2 ? 0.32 : 0.4;
    for (let y = tr.stand ? tr.eye - tr.y + 2.6 : rand(1.2, 3); y < tr.h - 0.3; y += step * rand(0.8, 1.2)) {
      const t = y / tr.h;
      const R = maxR * Math.pow(1 - t, 0.85) + 0.3;
      const n = randi(5, 7);
      const off = rand(0, TAU);
      for (let k = 0; k < n; k++) {
        const ang = off + (k / n) * TAU + rand(-0.3, 0.3);
        const L = R * rand(0.75, 1.1);
        tr.cards.push({
          x: tr.x,
          y: tr.y + y,
          z: tr.z,
          rot: ang,
          tz: -rand(0.25, 0.6),
          tx: rand(-0.3, 0.3),
          sx: L,
          sy: L * 0.5,
          sz: L * 0.5,
        });
      }
    }
    cards.push(...tr.cards);
    if (tr.stand) {
      for (let y = 1.5; y < tr.eye - tr.y - 1.6; y += 0.45) {
        for (let k = 0; k < 3; k++)
          cards.push({
            x: tr.x,
            y: tr.y + y,
            z: tr.z,
            rot: rand(0, TAU),
            tz: -0.3,
            tx: 0,
            sx: 0.5,
            sy: 0.25,
            sz: 0.25,
            dead: true,
          });
      }
    }
  }
  // branch card: plane spanning x 0..1 with crossed vertical card
  const g = new THREE.BufferGeometry();
  const pos = [0, 0, -0.5, 1, 0, -0.5, 1, 0, 0.5, 0, 0, 0.5, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const nor = [];
  for (let i = 0; i < 8; i++) nor.push(0, 1, 0);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  const bm = new THREE.MeshLambertMaterial({ map: T.branch, alphaTest: 0.4, side: THREE.DoubleSide });
  const bd = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T.branch, alphaTest: 0.4 });
  const live = cards.filter((c) => !c.dead),
    dead = cards.filter((c) => c.dead);
  buildInstanced(live, g, bm, { cell: 400, cast: true, depth: bd, track: FOREST.nearTrack });
  // swap scale: our items use sx as length, sy/sz as width — handled by buildInstanced (sz)
  if (dead.length) {
    const dm = new THREE.MeshLambertMaterial({ color: C('#5a4c40') });
    const dg = new THREE.CylinderGeometry(0.012, 0.025, 1, 4);
    dg.rotateZ(-PI / 2);
    dg.translate(0.5, 0, 0);
    buildInstanced(dead, dg, dm, { cell: 400, layer: 1 });
  }
}
// a ladder stand at every stand position (the other hunters' stands are visible across the marsh)
function buildStand() {
  for (const s of STANDS) buildOneStand(s);
}
function buildOneStand(S) {
  const EYE = S.eye;
  const mat = new THREE.MeshLambertMaterial({ color: C('#3b3d33') });
  const grp = new THREE.Group();
  const py = EYE - 1.05;
  const plat = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.04, 0.78), mat);
  plat.position.set(0, py, -0.12);
  grp.add(plat);
  for (let i = -3; i <= 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.045, 0.76), mat);
    s.position.set(i * 0.1, py + 0.005, -0.12);
    grp.add(s);
  }
  const bar = (x0, y0, z0, x1, y1, z1, r) => {
    const a = new THREE.Vector3(x0, y0, z0),
      b = new THREE.Vector3(x1, y1, z1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    grp.add(m);
  };
  const ry = EYE - 0.42;
  bar(-0.42, ry, -0.62, 0.42, ry, -0.62, 0.017);
  bar(-0.42, ry, -0.62, -0.42, ry, 0.2, 0.017);
  bar(0.42, ry, -0.62, 0.42, ry, 0.2, 0.017);
  bar(-0.42, ry, -0.62, -0.36, py, -0.5, 0.014);
  bar(0.42, ry, -0.62, 0.36, py, -0.5, 0.014);
  bar(-0.36, py, -0.5, -0.05, py - 0.9, 0.5, 0.02);
  bar(0.36, py, -0.5, 0.05, py - 0.9, 0.5, 0.02);
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.05, 0.34),
    new THREE.MeshLambertMaterial({ color: C('#2a2a24') }),
  );
  seat.position.set(0, EYE - 0.62, 0.22);
  grp.add(seat);
  grp.position.set(S.x, 0, S.z);
  grp.rotation.y = S.yaw;
  grp.traverse((o) => {
    o.layers.set(1);
    if (o.isMesh) o.castShadow = true;
  });
  scene.add(grp);
}

export {
  TT,
  buildForest,
  buildGrass,
  buildNearTrees,
  buildPlants,
  buildShrubs,
  buildStand,
  inFrontCorridor,
  obstacleHit,
};
