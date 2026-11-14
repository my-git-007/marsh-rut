// render/deadwood.js — the old timber lying about the marsh: big grey logs (some blown over with their root plate
// standing up), and stumps, sawn flat or snapped off in splinters. A few round every stand (the old cuts from when
// it was built), the rest out across the marsh and in among the dead standing trees. Seeded, so every player sees
// the same ones. They're low enough for a moose to step over, so the animals don't need to know about them.
import * as THREE from 'three';
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
import { scene } from './core.js';
import { T } from './textures.js';

const BARK = [1, 1, 1],
  DAMP = [0.74, 0.72, 0.68], // a log on the ground: damper and darker than the standing dead
  MOSS = [0.56, 0.62, 0.4], // moss and lichen on its upper side
  CUT = [1.35, 1.18, 0.9], // an old sawn face: paler and warmer than the bark
  INNER = [1.05, 0.98, 0.86]; // splintered wood

class Mesh {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }
  // pts: [{p, r}] along the piece; bark u around, v along
  tube(pts, sides, col = BARK, mossy = false) {
    const up = new THREE.Vector3(0, 1, 0),
      base = this.pos.length / 3;
    let v = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)].p,
        b = pts[Math.min(pts.length - 1, i + 1)].p;
      const t = b.clone().sub(a).normalize();
      const s = Math.abs(t.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up;
      const n1 = new THREE.Vector3().crossVectors(t, s).normalize(),
        n2 = new THREE.Vector3().crossVectors(t, n1).normalize();
      if (i) v += pts[i].p.distanceTo(pts[i - 1].p);
      for (let k = 0; k <= sides; k++) {
        const ang = (k / sides) * TAU,
          n = n1.clone().multiplyScalar(Math.cos(ang)).addScaledVector(n2, Math.sin(ang));
        const p = pts[i].p.clone().addScaledVector(n, pts[i].r * (pts[i].j ? pts[i].j[k % sides] : 1));
        this.pos.push(p.x, p.y, p.z);
        this.nor.push(n.x, n.y, n.z);
        this.uv.push(k / sides, v * 0.8);
        const ao = pts[i].ao ?? 1,
          c = mossy && n.y > 0.35 ? MOSS : col;
        this.col.push(c[0] * ao, c[1] * ao, c[2] * ao);
      }
    }
    for (let i = 0; i < pts.length - 1; i++)
      for (let k = 0; k < sides; k++) {
        const a = base + i * (sides + 1) + k,
          b = a + sides + 1;
        this.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  // a flat round end facing along n (a sawn face, or the end of a log)
  disc(c, n, r, sides, col) {
    const s = Math.abs(n.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(n, s).normalize(),
      w = new THREE.Vector3().crossVectors(n, u).normalize();
    const base = this.pos.length / 3;
    this.pos.push(c.x, c.y, c.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(0.5, 0.5);
    this.col.push(...col);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TAU,
        p = c
          .clone()
          .addScaledVector(u, Math.cos(a) * r)
          .addScaledVector(w, Math.sin(a) * r);
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(n.x, n.y, n.z);
      this.uv.push(0.5 + Math.cos(a) * 0.15, 0.5 + Math.sin(a) * 0.15);
      this.col.push(...col);
    }
    for (let k = 0; k < sides; k++) this.idx.push(base, base + 1 + k, base + 2 + k);
  }
  // jagged splinters standing up from a broken end
  splinters(c, axis, r, n, len, rnd) {
    for (let k = 0; k < n; k++) {
      const a = rnd() * TAU,
        side = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
        p0 = c.clone().addScaledVector(side, r * lerp(0.2, 0.75, rnd()));
      const tip = p0
        .clone()
        .addScaledVector(axis, len * lerp(0.3, 1, rnd()))
        .addScaledVector(side, r * 0.25 * rnd());
      this.tube(
        [
          { p: p0, r: r * lerp(0.18, 0.3, rnd()) },
          { p: tip, r: 0.01 },
        ],
        3,
        INNER,
      );
    }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

// a fallen trunk along +x, centred on the origin, its underside at y = 0. Some have the root plate that tore out
// of the bog standing up at one end; the other end sawn or snapped.
function logGeo(seed, L, R, roots) {
  const rnd = mulberry32(seed),
    M = new Mesh(),
    sag = lerp(-0.12, 0.12, rnd()),
    wob = lerp(-0.3, 0.3, rnd());
  const at = (f) => new THREE.Vector3((f - 0.5) * L, R + Math.sin(f * Math.PI) * sag, Math.sin(f * 3.1) * wob);
  const rad = (f) => R * (1 - 0.4 * f);
  const pts = [];
  for (let i = 0; i <= 8; i++) pts.push({ p: at(i / 8), r: rad(i / 8), ao: 0.85 + 0.15 * Math.sin((i / 8) * Math.PI) });
  M.tube(pts, 9, DAMP, true);
  const ax = new THREE.Vector3(1, 0, 0);
  // the thin end: snapped, or sawn
  if (rnd() < 0.5) M.splinters(at(1), ax, rad(1), 4, rad(1) * 2.2, rnd);
  else M.disc(at(1), ax, rad(1), 9, CUT);
  // the root end: a plate of earth and roots on edge, else a sawn butt
  if (roots) {
    // a ragged wall of peat and roots on edge, standing mostly above the ground, the trunk going in low down
    const RP = R * lerp(2.6, 3.2, rnd()),
      c = at(0).add(new THREE.Vector3(-0.15, RP * 0.45 - R * 0.6, 0)),
      ring = Array.from({ length: 14 }, () => lerp(0.55, 1.25, rnd()));
    M.tube(
      [
        { p: c.clone().add(new THREE.Vector3(0.3, 0, 0)), r: RP * 0.5, j: ring, ao: 0.7 },
        { p: c, r: RP, j: ring, ao: 0.6 },
        { p: c.clone().add(new THREE.Vector3(-0.45, 0, 0)), r: RP * 0.8, j: ring, ao: 0.45 },
        { p: c.clone().add(new THREE.Vector3(-0.6, 0, 0)), r: RP * 0.2, ao: 0.4 },
      ],
      14,
      [0.36, 0.31, 0.26], // peat
    );
    // roots torn out of the rim, grey where they've weathered
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU + rnd() * 0.4,
        d = new THREE.Vector3(lerp(-0.25, 0.15, rnd()), Math.cos(a), Math.sin(a)).normalize(),
        reach = RP * ring[k] * lerp(1.15, 1.6, rnd());
      M.tube(
        [
          { p: c.clone().addScaledVector(d, RP * ring[k] * 0.7), r: R * lerp(0.1, 0.22, rnd()) },
          {
            p: c
              .clone()
              .addScaledVector(d, reach)
              .add(new THREE.Vector3(0, -0.25 * rnd(), 0)),
            r: 0.015,
          },
        ],
        3,
        DAMP,
      );
    }
  } else M.disc(at(0), ax.clone().negate(), rad(0), 9, CUT);
  // stubs of the old branches
  for (let i = 0, n = 6 + Math.floor(rnd() * 8); i < n; i++) {
    const f = lerp(0.25, 0.95, rnd()),
      a = lerp(-0.3, Math.PI + 0.3, rnd()); // the upper half (the lower ones broke off under it)
    const d = new THREE.Vector3(lerp(0.2, 0.6, rnd()), Math.sin(a), Math.cos(a)).normalize(),
      p0 = at(f).addScaledVector(d, rad(f) * 0.8),
      l = lerp(0.25, 1.2, rnd());
    M.tube(
      [
        { p: p0, r: rad(f) * 0.16 },
        { p: p0.clone().addScaledVector(d, l), r: 0.015 },
      ],
      3,
      DAMP,
    );
  }
  return M.geo();
}

// a stump: a flared base and a short bole, the top sawn flat (pale, weathered) or snapped off in splinters
function stumpGeo(seed, H, R, sawn) {
  const rnd = mulberry32(seed),
    M = new Mesh(),
    up = new THREE.Vector3(0, 1, 0);
  const tilt = new THREE.Vector3(lerp(-0.06, 0.06, rnd()), 0, lerp(-0.06, 0.06, rnd()));
  const at = (y) => new THREE.Vector3(tilt.x * y, y, tilt.z * y);
  M.tube(
    [
      { p: at(-0.25), r: R * 1.55, ao: 0.6 },
      { p: at(0.05), r: R * 1.35, ao: 0.7 },
      { p: at(H * 0.3), r: R * 1.06 },
      { p: at(H), r: R },
    ],
    10,
  );
  if (sawn) M.disc(at(H), up, R, 10, CUT);
  else {
    M.disc(at(H * 0.9), up, R * 0.98, 10, INNER);
    M.splinters(at(H * 0.88), up, R, 5 + Math.floor(rnd() * 4), Math.max(0.35, H * 0.8), rnd);
  }
  // root buttresses into the ground
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + rnd() * 0.6,
      d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    M.tube(
      [
        { p: at(0.15).addScaledVector(d, R * 0.9), r: R * 0.32 },
        {
          p: at(-0.15)
            .addScaledVector(d, R * lerp(1.9, 2.6, rnd()))
            .add(new THREE.Vector3(0, 0, 0)),
          r: R * 0.1,
        },
      ],
      4,
    );
  }
  return M.geo();
}

// weathered grey wood, the same as the dead standing trees (render/plants3d.js); vertex colours warm the cut faces
function deadMat() {
  const m = new THREE.MeshLambertMaterial({ map: T.bark, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      '#include <map_fragment>\n  diffuseColor.rgb = mix(vec3(0.53, 0.51, 0.48), vec3(dot(texelColor.rgb, vec3(0.3, 0.59, 0.11))), 0.4);',
    );
  };
  m.customProgramCacheKey = () => 'deadwood';
  return m;
}

// where they go: [{ kind: 'log' | 'stump', x, z, yaw, s }]
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
    out.push({ kind, x, z, yaw: R(0, TAU), s: R(0.85, 1.2), v: Math.floor(r() * 4) });
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

export function buildDeadwood() {
  if (MAP.id !== 'the-marsh') return null;
  const t0 = performance.now();
  const mat = deadMat();
  // four of each, in different sizes (logs 6-17 m, stumps knee- to chest-high); every placed one is a copy
  const LOGS = [
      { g: logGeo(11, 14, 0.55, true), L: 14, R: 0.55 },
      { g: logGeo(12, 10, 0.45, false), L: 10, R: 0.45 },
      { g: logGeo(13, 12, 0.6, false), L: 12, R: 0.6 },
      { g: logGeo(14, 7, 0.4, true), L: 7, R: 0.4 },
    ],
    STUMPS = [
      { g: stumpGeo(21, 0.5, 0.32, true) },
      { g: stumpGeo(22, 0.9, 0.38, false) },
      { g: stumpGeo(23, 0.35, 0.42, true) },
      { g: stumpGeo(24, 1.4, 0.3, false) },
    ];
  const items = layout();
  const groups = [
    ...LOGS.map((d) => ({ d, log: true, list: [] })),
    ...STUMPS.map((d) => ({ d, log: false, list: [] })),
  ];
  for (const it of items) groups[(it.kind === 'log' ? 0 : 4) + it.v].list.push(it);
  for (const G of groups) {
    if (!G.list.length) continue;
    const im = new THREE.InstancedMesh(G.d.g, mat, G.list.length);
    G.list.forEach((it, i) => {
      let y = groundAt(it.x, it.z),
        pitch = 0;
      if (G.log) {
        // lying along the ground: its ends follow the slope, and it sinks a little into the moss
        const h = (G.d.L * it.s) / 2,
          dx = Math.cos(it.yaw) * h,
          dz = -Math.sin(it.yaw) * h;
        const g1 = groundAt(it.x - dx, it.z - dz),
          g2 = groundAt(it.x + dx, it.z + dz);
        pitch = Math.atan2(g2 - g1, 2 * h);
        // resting on the flattened grass and moss, not down in it, or the grass would hide it
        y = Math.max((g1 + g2) / 2, y) + 0.25;
      } else y -= 0.05;
      _p.set(it.x, y, it.z);
      _q.setFromEuler(_e.set(0, it.yaw, pitch, 'YXZ'));
      _s.setScalar(it.s);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(i, _m);
    });
    im.frustumCulled = false; // a few hundred spread over the whole marsh: cheaper to draw than to cull
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  }
  const info = {
    logs: items.filter((i) => i.kind === 'log').length,
    stumps: items.filter((i) => i.kind === 'stump').length,
    ms: Math.round(performance.now() - t0),
  };
  // (in test runs: the nearest few of each, to aim at)
  if (/[?&]test=/.test(location.search)) {
    const P = STANDS[0];
    info.near = ['log', 'stump'].map((k) =>
      items
        .filter((i) => i.kind === k)
        .map((i) => ({ x: i.x, z: i.z, y: groundAt(i.x, i.z), d: Math.hypot(i.x - P.x, i.z - P.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 6),
    );
  }
  window.__deadwood = info;
  return info;
}
