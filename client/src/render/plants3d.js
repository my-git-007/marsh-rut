// render/plants3d.js — real 3D trees (white and black spruce, lodgepole pine, balsam fir, tamarack, aspen, birch,
// dead snags) and willow/alder clumps. Everything is built in code from fixed seeds when the marsh loads (about a second): no downloads.
//   trees: full 3D within FULL_R of the stand, a lighter 3D tree to LIGHT_R, impostors beyond (pictures of the 3D
//     tree from 16 sides; the game shows the one for your side). Under the binoculars the impostors in view switch
//     to the lighter 3D tree, nearest first (they'd look blocky). Dead snags and lodgepole pine are 3D too.
//   willow/alder (the shared, seeded SHRUBS the bulls thrash): full 3D within SHRUB_FULL_R, impostors beyond.
// Off (Game Settings) or on any error, vegetation.js keeps the old cards for everything.
import * as THREE from 'three';
import { PI, TAU, clamp, lerp, mulberry32 } from '../../../shared/util.js';
import { renderer, scene, hemi, sun, SUN_DIR, U } from './core.js';
import { T, mkC } from './textures.js';
import { alphaFix } from './billboards.js';

/* ---------------- textures: a spruce needle spray and a sprig of willow leaves, painted in code ---------------- */
function rngOf(seed) {
  const r = mulberry32(seed);
  return (a = 0, b = 1) => a + r() * (b - a);
}
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function shade(r, h, k, j = 8) {
  const c = hex(h);
  return `rgb(${c.map((v) => clamp(v * k + r(-j, j), 0, 255) | 0).join(',')})`;
}
// A canvas keeps no colour where it's transparent (it reads back black), and the smaller mipmaps used further off
// blend that black into the leaf edges: dark blotches. So the clear parts get the average leaf colour (alpha 0).
function tex(c) {
  const W = c.width,
    H = c.height,
    src = c.getContext('2d').getImageData(0, 0, W, H).data;
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let i = 0; i < src.length; i += 4)
    if (src[i + 3] > 128) {
      r += src[i];
      g += src[i + 1];
      b += src[i + 2];
      n++;
    }
  n = Math.max(1, n);
  const data = new Uint8Array(src.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4,
        o = ((H - 1 - y) * W + x) * 4; // rows bottom-up, as a canvas texture would be flipped
      const a = src[i + 3],
        k = a < 8 ? 0 : a / 255; // soft edges lean toward the average too, so they don't darken
      data[o] = src[i] * k + (r / n) * (1 - k);
      data[o + 1] = src[i + 1] * k + (g / n) * (1 - k);
      data[o + 2] = src[i + 2] * k + (b / n) * (1 - k);
      data[o + 3] = a < 8 ? 0 : a;
    }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  t.encoding = THREE.sRGBEncoding;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.needsUpdate = true;
  return t;
}
// twig along x (u), needles both sides pointing forward; lighter new growth at the tip
function paintSpray(o = {}) {
  const r = rngOf(o.seed || 11),
    W = 256,
    H = 128,
    c = mkC(W, H),
    g = c.getContext('2d');
  const cols = o.cols || ['#24352a', '#2c3f2e', '#33472f', '#203026', '#3a4f36', '#2a3b33'];
  const y = (u) => H / 2 + Math.sin(u * 2.2) * 4 - u * 6;
  g.strokeStyle = '#4a3828';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, y(0));
  for (let u = 0; u <= 1; u += 0.05) g.lineTo(u * W * 0.97, y(u));
  g.stroke();
  // a dark, soft core first, so the spray stays solid when it's small (far off) instead of breaking up
  for (let i = 0; i < (o.coreN ?? 220); i++) {
    const u = Math.pow(r(), 0.8),
      x = u * W * 0.92;
    g.fillStyle = shade(r, o.core || '#1c2a20', r(0.85, 1.1), 4);
    g.beginPath();
    g.ellipse(x, y(u) + r(-1, 1) * (1 - u * 0.5) * H * 0.18, r(5, 10), r(4, 9) * (1 - u * 0.4), 0, 0, TAU);
    g.fill();
  }
  for (let i = 0; i < (o.n || 3200); i++) {
    const u = Math.pow(r(), 0.85),
      x = u * W * 0.96,
      s = r() < 0.5 ? -1 : 1,
      spread = (1 - u * 0.45) * H * 0.44,
      L = r(0.3, 1) * spread,
      a = s * r(0.45, 1.35);
    const tip = u > 0.86 ? r(0, 1) : 0;
    g.strokeStyle =
      tip > 0.6 ? shade(r, o.tip || '#4f6a46', r(0.85, 1.05)) : shade(r, cols[(r() * cols.length) | 0], r(0.8, 1.2));
    g.lineWidth = r(1.4, 2.4);
    g.beginPath();
    g.moveTo(x, y(u));
    g.lineTo(x + Math.cos(a) * L * 0.55 + L * 0.25, y(u) + Math.sin(a) * L);
    g.stroke();
  }
  return tex(c);
}
// a willow sprig: thin twig along x, narrow pointed leaves alternating, autumn green-gold
function paintWillow() {
  const r = rngOf(23),
    W = 256,
    H = 128,
    c = mkC(W, H),
    g = c.getContext('2d');
  const cols = ['#8f9a3c', '#a9a443', '#c3ac48', '#7d8c38', '#b8932f', '#6f7f36', '#cdb85a', '#94983f'];
  g.strokeStyle = '#5b4632';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, H / 2);
  g.quadraticCurveTo(W * 0.5, H / 2 + 6, W * 0.9, H / 2 - 3);
  g.stroke();
  const n = 11;
  for (let i = 0; i < n; i++) {
    const u = Math.min(0.92, 0.08 + Math.pow(i / n, 0.8) * 0.86 + r(-0.04, 0.04)),
      x = u * W * 0.9,
      y0 = H / 2 + 6 * Math.sin(u * PI) - 3 * u;
    const side = r() < 0.5 ? -1 : 1;
    const L = H * r(0.4, 0.62) * (1 - 0.25 * u),
      edge = r() < 0.25 ? r(0.25, 0.5) : 1, // some leaves are seen nearly edge-on
      wd = r(5, 9) * edge,
      a = side * r(0.3, 1.2),
      curl = r(-0.25, 0.25) * L;
    g.save();
    g.translate(x, y0);
    g.rotate(a);
    g.fillStyle = r() < 0.07 ? shade(r, '#8a6a34', 1) : shade(r, cols[(r() * cols.length) | 0], r(0.82, 1.12));
    g.beginPath(); // a narrow lance, pointed both ends, with a slight curl
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.25, -wd, L * 0.7, -wd * 0.6 + curl * 0.5, L, curl);
    g.bezierCurveTo(L * 0.7, wd * 0.6 + curl * 0.5, L * 0.25, wd, 0, 0);
    g.fill();
    g.strokeStyle = 'rgba(235,225,160,.3)';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(1, 0);
    g.quadraticCurveTo(L * 0.6, curl * 0.4, L * 0.92, curl * 0.9);
    g.stroke();
    g.restore();
  }
  return tex(c);
}

// a cluster of round aspen/birch leaves on fine twigs, square, filling a rough disc; autumn colours
function paintLeaves(cols, seed) {
  const r = rngOf(seed),
    S = 256,
    c = mkC(S, S),
    g = c.getContext('2d');
  g.strokeStyle = '#6a5a48';
  g.lineWidth = 1.5;
  for (let k = 0; k < 5; k++) {
    g.beginPath();
    g.moveTo(S / 2, S * 0.98);
    g.quadraticCurveTo(S / 2 + r(-40, 40), S * 0.6, S / 2 + r(-90, 90), S * r(0.1, 0.4));
    g.stroke();
  }
  for (let i = 0; i < 170; i++) {
    const a = r(0, TAU),
      d = Math.sqrt(r()) * S * 0.44;
    const x = S / 2 + Math.cos(a) * d,
      y = S * 0.48 + Math.sin(a) * d * 0.95;
    const rad = r(9, 15) * (1 - (d / S) * 0.5);
    g.save();
    g.translate(x, y);
    g.rotate(r(0, TAU));
    g.fillStyle = shade(r, cols[(r() * cols.length) | 0], r(0.8, 1.12), 10);
    g.beginPath(); // an aspen leaf: round with a short point
    g.moveTo(0, -rad);
    g.bezierCurveTo(rad * 1.1, -rad * 0.9, rad * 1.05, rad * 0.8, 0, rad * 1.25);
    g.bezierCurveTo(-rad * 1.05, rad * 0.8, -rad * 1.1, -rad * 0.9, 0, -rad);
    g.fill();
    g.restore();
  }
  return tex(c);
}

/* ---------------- geometry: tubes for wood, two-sided cards for foliage, lit as a volume ---------------- */
class Builder {
  constructor() {
    this.wood = { pos: [], nor: [], uv: [], col: [], idx: [] };
    this.leaf = { pos: [], nor: [], uv: [], col: [], idx: [] };
  }
  // pts: [{p: Vector3, r}] along the branch; bark u around, v along (metres)
  tube(pts, sides) {
    const B = this.wood,
      up = new THREE.Vector3(0, 1, 0);
    let v = 0;
    const base = B.pos.length / 3;
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
        const p = pts[i].p.clone().addScaledVector(n, pts[i].r);
        B.pos.push(p.x, p.y, p.z);
        B.nor.push(n.x, n.y, n.z);
        B.uv.push(k / sides, v * 0.8);
        const ao = pts[i].ao ?? 1;
        B.col.push(ao, ao, ao);
      }
    }
    for (let i = 0; i < pts.length - 1; i++)
      for (let k = 0; k < sides; k++) {
        const a = base + i * (sides + 1) + k,
          b = a + sides + 1;
        B.idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  // card from base b along U (length l), across V (width w); both faces get the same outward normals
  card(b, U, V, l, w, normalAt, tint) {
    const L = this.leaf;
    const corners = [
      [b.clone().addScaledVector(V, -w / 2), 0, 0],
      [b.clone().addScaledVector(V, w / 2), 0, 1],
      [
        b
          .clone()
          .addScaledVector(U, l)
          .addScaledVector(V, w / 2),
        1,
        1,
      ],
      [
        b
          .clone()
          .addScaledVector(U, l)
          .addScaledVector(V, -w / 2),
        1,
        0,
      ],
    ];
    const base = L.pos.length / 3;
    for (const [p, u, v] of corners) {
      const n = normalAt(p);
      L.pos.push(p.x, p.y, p.z);
      L.nor.push(n.x, n.y, n.z);
      L.uv.push(u, v);
      L.col.push(tint[0] * n.ao, tint[1] * n.ao, tint[2] * n.ao);
    }
    L.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2);
  }
  geo(B) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    g.setIndex(B.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// Conifers. White spruce: narrow cone of whorled branches, level to slightly drooping with upturned tips, dense
// sprays, the inner lower crown bare. The other conifers are the same tree with other proportions (CONIFERS).
// detail 1 = close up; ~0.35 = the cheaper version for trees further off.
const CONIFERS = {
  white: {},
  // black spruce: very narrow, drooping short branches, a dense club at the top
  black: { rad: [0.085, 0.1], prof: 0.8, droop: 0.55, elHi: 0.25, club: 0.9, whorl: [5, 7], spray: 0.85 },
  // balsam fir: a straight, regular cone with flat, level sprays
  fir: { rad: [0.13, 0.15], prof: 1.0, droop: 0.12, elLo: -0.04, elHi: 0.35, roll: 0.35, whorl: [5, 7] },
  // tamarack: open and airy, fewer branches, soft tufts (gold in autumn: its own needle texture)
  tamarack: { rad: [0.13, 0.16], prof: 0.9, droop: 0.2, whorl: [4, 6], between: 0.3, gap: 1.5, spray: 1.1 },
  // lodgepole pine: a tall straight bole, bare of live branches for half its height (a few dead stubs), a short
  // open crown of upswept branches with tufts at their ends (its own needle texture)
  pine: {
    rad: [0.1, 0.12],
    prof: 0.55,
    crown: [0.5, 0.62],
    droop: 0.04,
    elLo: 0.2,
    elHi: 0.75,
    whorl: [3, 5],
    between: 0.15,
    gap: 1.7,
    spray: 1.35,
    stubs: true,
  },
};
function spruce(seed, H, detail = 1, P = CONIFERS.white) {
  const r = rngOf(seed),
    B = new Builder(),
    up = new THREE.Vector3(0, 1, 0);
  const rad = P.rad || [0.15, 0.18];
  const R0 = 0.24 * (H / 16),
    crownBase = P.crown ? H * r(P.crown[0], P.crown[1]) : r(1.0, 1.8),
    maxR = H * r(rad[0], rad[1]);
  const lean = new THREE.Vector3(r(-0.02, 0.02), 0, r(-0.02, 0.02));
  const axis = (y) => new THREE.Vector3(lean.x * y, y, lean.z * y);
  const trunk = [];
  for (let i = 0; i <= 12; i++) {
    const y = (i / 12) * H;
    trunk.push({ p: axis(y - 0.3 * (i === 0)), r: R0 * Math.pow(1 - y / H, 0.9) + 0.012, ao: 0.55 + 0.45 * (y / H) });
  }
  B.tube(trunk, detail < 1 ? 5 : 8);
  if (P.stubs) deadStubs(B, r, axis, R0, H, 1.2, crownBase - 0.4, 0.15, 0.7, detail < 1);
  const normalAt = (p) => {
    const a = axis(p.y),
      n = new THREE.Vector3(p.x - a.x, 0, p.z - a.z);
    const d = n.length(),
      rr = maxR * Math.pow(Math.max(0, 1 - (p.y - crownBase) / (H - crownBase)), 0.95) + 0.3;
    n.normalize()
      .multiplyScalar(1)
      .add(new THREE.Vector3(0, 0.95, 0))
      .normalize();
    n.ao = clamp(0.38 + 0.62 * (d / rr), 0.35, 1.05) * (0.78 + 0.22 * clamp(p.y / H, 0, 1));
    return n;
  };
  const low = detail < 1;
  const dy = low ? 0.55 : 0.36,
    spacing = (low ? 0.34 : 0.15) * (P.gap || 1),
    sprayL = (low ? 0.9 : 0.5) * (P.spray || 1);
  // one spray card: along U, rolled about it so the sprays don't all lie flat
  const spray = (p, U0, l, rollMax) => {
    const U = U0.clone().normalize();
    let V = new THREE.Vector3().crossVectors(U, up);
    if (V.lengthSq() < 1e-4) V.set(1, 0, 0);
    V.normalize();
    const W2 = new THREE.Vector3().crossVectors(V, U).normalize(),
      roll = r(-rollMax, rollMax);
    V = V.multiplyScalar(Math.cos(roll)).addScaledVector(W2, Math.sin(roll));
    const g = r(0.88, 1.08);
    B.card(p, U, V, l, l * 0.5, normalAt, [g, g * r(0.97, 1.03), g * r(0.95, 1.06)]);
  };
  let a0 = r(0, TAU);
  const levels = [];
  for (let y = crownBase; y < H - 0.25; y += dy * r(0.85, 1.15)) {
    const wh = P.whorl || [6, 8];
    levels.push({ y, n: Math.round(r(wh[0], wh[1]) * (low ? 0.8 : 1)), k: 1 });
    if (!low && r() < (P.between ?? 0.6)) levels.push({ y: y + dy * 0.5, n: Math.round(r(1, 2)), k: 0.45 }); // small branches between whorls
  }
  for (const lv of levels) {
    const y = lv.y,
      t = (y - crownBase) / (H - crownBase);
    if (t > 0.985) continue;
    const n = lv.n;
    a0 += 2.4;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU + r(-0.3, 0.3);
      const club = (P.club || 0) * maxR * Math.exp(-(((t - 0.9) / 0.06) ** 2)); // black spruce's dense top
      const L = (maxR * Math.pow(1 - t, P.prof || 1.05) + 0.22 + club) * r(0.8, 1.12) * lv.k;
      const h = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const el = lerp(P.elLo ?? -0.12, P.elHi ?? 0.5, Math.pow(t, 1.6)),
        droop = (P.droop ?? 0.32) * (1 - t) * L,
        turn = 0.18 * L;
      const P0 = axis(y).addScaledVector(h, R0 * (1 - y / H));
      const at = (s) =>
        P0.clone()
          .addScaledVector(h, L * s)
          .addScaledVector(up, L * s * Math.tan(el) - droop * s * s + turn * Math.max(0, s - 0.72) ** 2 * 4);
      const pts = [0, 0.35, 0.7, 1].map((s) => ({
        p: at(s),
        r: (0.035 * (L / 2) + 0.006) * (1 - s * 0.8),
        ao: 0.6 + 0.4 * s,
      }));
      if (detail >= 1 || L > 1) B.tube(pts, detail < 1 ? 3 : 4);
      const s0 = t < 0.35 ? 0.3 : 0.12;
      for (let s = s0; s <= 1.0001; s += spacing / L) {
        const p = at(s),
          tg = at(Math.min(1, s + 0.03))
            .sub(at(Math.max(0, s - 0.03)))
            .normalize();
        const side = new THREE.Vector3().crossVectors(tg, up).normalize();
        const tipK = 1 - 0.35 * s;
        // a spray along the branch itself
        spray(p, tg.clone().addScaledVector(up, r(-0.15, 0.1)), sprayL * tipK * r(0.8, 1.1), P.roll ?? 1.0);
        if (s > 0.94) continue;
        // secondary branchlets to each side, angled forward and hanging a little, each carrying sprays
        for (const sg of [-1, 1]) {
          const phi = r(0.8, 1.2) * sg;
          const d2 = tg
            .clone()
            .multiplyScalar(Math.cos(phi))
            .addScaledVector(side, Math.sin(phi))
            .addScaledVector(up, r(-0.6, -0.05))
            .normalize();
          const lb = (0.2 + 0.45 * (1 - s)) * Math.min(1, L / 1.4) * r(0.8, 1.2) * (low ? 1.3 : 1);
          const n2 = low ? 1 : Math.max(1, Math.round(lb / 0.2));
          for (let j = 0; j < n2; j++) {
            const q = p.clone().addScaledVector(d2, (lb * j) / n2);
            const jit = new THREE.Vector3(r(-0.35, 0.35), r(-0.45, 0.15), r(-0.35, 0.35));
            spray(q, d2.clone().add(jit), sprayL * r(0.8, 1.15) * (low ? 1.15 : 1), 1.3);
          }
        }
        // now and then a hanging tuft underneath
        if (r() < (low ? 0.15 : 0.3)) spray(p, tg.clone().addScaledVector(up, -1.1), sprayL * r(0.6, 0.9), 1.2);
      }
    }
  }
  // the leader: a few sprays pointing up at the very top
  for (let k = 0; k < 5; k++) {
    const p = axis(H - 0.7 + k * 0.12),
      a = k * 2.4,
      U = new THREE.Vector3(Math.cos(a) * 0.35, 1, Math.sin(a) * 0.35).normalize();
    const V = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    B.card(p, U, V, 0.55, 0.3, normalAt, [1, 1, 1]);
  }
  return { wood: B.geo(B.wood), leaf: B.geo(B.leaf) };
}

// short dead branches broken off along a bole between heights y0 and y1 (lengths L0..L1 m), hanging a little
function deadStubs(B, r, axis, R0, H, y0, y1, L0, L1, low) {
  const up = new THREE.Vector3(0, 1, 0);
  let a0 = r(0, TAU);
  for (let y = y0; y < y1; y += r(0.35, 0.8) * (low ? 1.6 : 1)) {
    const n = Math.round(r(1, 3));
    a0 += 2.4;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU + r(-0.4, 0.4),
        h = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
        L = r(L0, L1) * 0.6,
        rb = R0 * Math.pow(1 - y / H, 0.9),
        dn = r(-0.35, 0.1);
      const P0 = axis(y).addScaledVector(h, rb * 0.8);
      // short and blunt, broken off: not tapering to a point (thin cones read as spikes from the stand)
      const r0 = 0.025 + rb * 0.12;
      // (the last ring, a hair further out and almost no width, closes the broken end)
      const pts = [0, 1, 1.02].map((s) => ({
        p: P0.clone()
          .addScaledVector(h, L * s)
          .addScaledVector(up, L * s * dn),
        r: s > 1 ? 0.002 : r0 * (1 - s * 0.35),
        ao: 0.7,
      }));
      B.tube(pts, low ? 3 : 4);
    }
  }
}

// Dead standing spruce (a snag): a weathered grey bole, the top snapped off or thinning to a dead spike, the branches
// gone to stubs low down and to bare, drooping dead limbs with a few grey twigs higher up. No needles.
// form: 'classic' (as above), 'bare' (stubs only, often snapped short), 'branchy' (dead limbs nearly to the ground,
// often a forked top), 'lean' (tipped over 10-20 degrees, as the bog gave way under it).
function snag(seed, H0, detail = 1, form = 'classic') {
  const r = rngOf(seed),
    B = new Builder(),
    up = new THREE.Vector3(0, 1, 0);
  const low = detail < 1;
  const R0 = 0.36 * (H0 / 14);
  const bare = form === 'bare',
    branchy = form === 'branchy';
  const H = bare ? H0 * r(0.55, 0.85) : H0; // a bare one is often snapped off well down
  const broken = bare || r() < 0.6; // snapped top (blunt), else it thins to a dead spike
  const tipA = r(0, TAU),
    tip = form === 'lean' ? r(0.17, 0.36) : r(0, 0.03); // how far it leans (rise over run)
  const lean = new THREE.Vector3(Math.cos(tipA) * tip, 0, Math.sin(tipA) * tip);
  const bend = r(-0.25, 0.25) * (form === 'lean' ? 2 : 1);
  const axis = (y) => new THREE.Vector3(lean.x * y + bend * (y / H) ** 3, y, lean.z * y);
  const trunk = [];
  for (let i = 0; i <= 10; i++) {
    const y = (i / 10) * H,
      f = y / H;
    const rr = broken ? R0 * (1 - 0.62 * f) : R0 * Math.pow(1 - f, 0.85) + 0.01;
    trunk.push({ p: axis(y - 0.3 * (i === 0)), r: rr, ao: 0.6 + 0.4 * f });
  }
  B.tube(trunk, low ? 5 : 8);
  // the snapped top: a few short, ragged splinters round the break
  if (broken)
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * TAU + r(-0.5, 0.5),
        rt = R0 * 0.38,
        p0 = axis(H - 0.05).add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(rt * 0.55));
      const tip = p0.clone().add(new THREE.Vector3(r(-0.04, 0.04), r(0.1, 0.4), r(-0.04, 0.04)));
      B.tube(
        [
          { p: p0, r: rt * 0.45, ao: 1 },
          { p: tip, r: rt * 0.12, ao: 1 },
          { p: tip.clone().add(new THREE.Vector3(0, 0.01, 0)), r: 0.002, ao: 1 }, // (closes the end)
        ],
        4,
      );
    }
  // stubs low down, longer dead limbs higher up (a branchy one keeps its limbs much lower)
  const limbs0 = branchy ? 0.18 : 0.45;
  deadStubs(B, r, axis, R0, H, 0.8, bare ? H * 0.9 : H * limbs0, 0.08, bare ? 0.3 : 0.45, low);
  // a forked top: a second leader that took over after the first one died back
  if (branchy && r() < 0.6) {
    const a = r(0, TAU),
      y0 = H * r(0.62, 0.75),
      out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const L = H - y0;
    B.tube(
      [0, 0.35, 0.7, 1].map((s) => ({
        p: axis(y0)
          .addScaledVector(out, R0 * 0.5 + L * 0.35 * Math.sqrt(s))
          .addScaledVector(up, L * 0.95 * s),
        r: R0 * (1 - 0.62 * (y0 / H)) * 0.7 * (1 - s * 0.85),
        ao: 0.9,
      })),
      low ? 4 : 6,
    );
  }
  const normalAt = (p) => {
    const a = axis(p.y),
      n = new THREE.Vector3(p.x - a.x, 0.6, p.z - a.z).normalize();
    n.ao = 0.85;
    return n;
  };
  let a0 = r(0, TAU);
  for (let y = H * limbs0; !bare && y < H * 0.95; y += r(0.5, 1.0) * (branchy ? 0.6 : 1) * (low ? 1.5 : 1)) {
    a0 += 2.4;
    if (r() < (branchy ? 0.1 : 0.35)) continue; // many have fallen off
    const n = Math.round(r(1, branchy ? 4 : 3));
    for (let k = 0; k < n; k++) {
      const t = y / H,
        a = a0 + (k / n) * TAU + r(-0.4, 0.4),
        h = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)),
        L = (1.6 * (1 - t) + 0.3) * r(0.5, 1.1) * (branchy ? 1.3 : 1),
        rb = R0 * (1 - 0.62 * t);
      const P0 = axis(y).addScaledVector(h, rb * 0.8);
      const at = (s) =>
        P0.clone()
          .addScaledVector(h, L * s)
          .addScaledVector(up, L * (s * 0.15 - 0.45 * s * s));
      B.tube(
        [0, 0.5, 1].map((s) => ({ p: at(s), r: (0.03 + rb * 0.1) * (1 - s * 0.75), ao: 0.8 })),
        3,
      );
      // a few grey twigs hanging on the outer part
      if (!low || r() < 0.5)
        for (let s = 0.45; s <= 1; s += 0.35) {
          const p = at(s),
            U = h.clone().addScaledVector(up, r(-0.6, 0.1)).normalize(),
            V = new THREE.Vector3().crossVectors(U, up).normalize();
          B.card(p, U, V, r(0.5, 0.9), r(0.3, 0.45), normalAt, [1, 1, 1]);
        }
    }
  }
  // (the leaf geometry must not be empty: one twig if every limb happened to be skipped)
  if (!B.leaf.pos.length)
    B.card(
      axis(H * 0.6),
      new THREE.Vector3(1, -0.3, 0).normalize(),
      new THREE.Vector3(0, 0, 1),
      0.3,
      0.2,
      normalAt,
      [1, 1, 1],
    );
  return { wood: B.geo(B.wood), leaf: B.geo(B.leaf) };
}

// Aspen / birch: a straight pale trunk, branches angled up in the top half, round clusters of leaves on the outer part.
// detail 1 = close up; 0.4 = the cheaper version.
function broadleaf(seed, H, detail = 1) {
  const r = rngOf(seed),
    B = new Builder(),
    up = new THREE.Vector3(0, 1, 0);
  const low = detail < 1;
  const R0 = 0.17 * (H / 16),
    crownBase = H * r(0.42, 0.52),
    maxR = H * r(0.17, 0.21),
    cy = (crownBase + H) / 2;
  const wig = [r(-0.15, 0.15), r(-0.15, 0.15)];
  const axis = (y) => new THREE.Vector3(Math.sin(y * 0.4) * wig[0], y, Math.cos(y * 0.33) * wig[1] - wig[1]);
  const trunk = [];
  for (let i = 0; i <= 10; i++) {
    const y = (i / 10) * H * 0.94;
    trunk.push({ p: axis(y - 0.3 * (i === 0)), r: R0 * Math.pow(1 - y / H, 0.8) + 0.02, ao: 0.6 + 0.4 * (y / H) });
  }
  B.tube(trunk, low ? 5 : 8);
  const normalAt = (p) => {
    const a = axis(p.y),
      n = new THREE.Vector3(p.x - a.x, (p.y - cy) * 0.6, p.z - a.z);
    const d = n.length();
    n.normalize()
      .add(new THREE.Vector3(0, 0.7, 0))
      .normalize();
    n.ao = clamp(0.45 + 0.6 * (d / maxR), 0.42, 1.05);
    return n;
  };
  const cluster = (p, l) => {
    const a = axis(p.y),
      outw = new THREE.Vector3(p.x - a.x, 0, p.z - a.z).normalize();
    for (let k = 0; k < (low ? 2 : 3); k++) {
      // the clusters face mostly outward and up, so the crown reads as a full mass from any side
      const U = new THREE.Vector3(r(-1, 1), r(-0.1, 1), r(-1, 1)).addScaledVector(outw, 0.8).normalize();
      let V = new THREE.Vector3().crossVectors(U, up);
      if (V.lengthSq() < 1e-4) V.set(1, 0, 0);
      V.normalize();
      const g = r(0.85, 1.1);
      B.card(p.clone().addScaledVector(U, -l * 0.45), U, V, l, l, normalAt, [g, g * r(0.95, 1.03), g * r(0.9, 1.05)]);
    }
  };
  const nb = Math.round(r(12, 17) * (low ? 0.75 : 1));
  let a0 = r(0, TAU);
  for (let i = 0; i < nb; i++) {
    const t = i / nb,
      y = lerp(crownBase, H * 0.9, t) + r(-0.3, 0.3);
    a0 += 2.4 + r(-0.3, 0.3);
    const hdir = new THREE.Vector3(Math.cos(a0), 0, Math.sin(a0));
    const L = (maxR * (1.05 - 0.55 * t) + 0.4) * r(0.85, 1.15) * 1.25,
      el = r(0.55, 0.95); // 30-55 degrees up
    const P0 = axis(y);
    const at = (s) =>
      P0.clone()
        .addScaledVector(hdir, L * s * Math.cos(el))
        .addScaledVector(up, L * s * Math.sin(el) - 0.12 * L * s * s);
    B.tube(
      [0, 0.5, 1].map((s) => ({ p: at(s), r: (0.05 * (L / 3) + 0.01) * (1 - s * 0.8), ao: 0.7 + 0.3 * s })),
      low ? 3 : 4,
    );
    for (let s = 0.3; s <= 1.0001; s += (low ? 0.75 : 0.4) / L) {
      const p = at(s).add(new THREE.Vector3(r(-0.4, 0.4), r(-0.25, 0.4), r(-0.4, 0.4)));
      cluster(p, r(1.2, 1.6) * (low ? 1.25 : 1));
    }
  }
  // the top
  for (let k = 0; k < (low ? 4 : 8); k++)
    cluster(axis(H * r(0.86, 0.97)).add(new THREE.Vector3(r(-0.7, 0.7), 0, r(-0.7, 0.7))), r(1.2, 1.5));
  return { wood: B.geo(B.wood), leaf: B.geo(B.leaf) };
}

// Willow clump: 10-16 stems arching up and out from one root, side shoots, sprigs of narrow leaves on the outer part.
function willow(seed, H) {
  const r = rngOf(seed),
    B = new Builder(),
    up = new THREE.Vector3(0, 1, 0);
  const normalAt = (p) => {
    const n = new THREE.Vector3(p.x, 0, p.z);
    const d = n.length();
    n.normalize()
      .add(new THREE.Vector3(0, 1.0 + 0.3 * (p.y / H), 0))
      .normalize();
    n.ao = clamp(0.45 + 0.6 * (d / (H * 0.55)), 0.4, 1.05) * (0.7 + 0.3 * clamp(p.y / H, 0, 1));
    return n;
  };
  const leaves = (at, s0, len, density) => {
    for (let s = s0; s <= 1.0001; s += 0.065 / len) {
      const p = at(s),
        tg = at(Math.min(1, s + 0.03))
          .sub(at(Math.max(0, s - 0.03)))
          .normalize();
      for (let k = 0; k < 2 + (r() < density ? 1 : 0); k++) {
        const side = new THREE.Vector3(r(-1, 1), r(-0.4, 0.6), r(-1, 1)).projectOnPlane(tg).normalize();
        const U = tg.clone().multiplyScalar(0.45).addScaledVector(side, 0.9).normalize();
        let V = new THREE.Vector3().crossVectors(U, up).normalize();
        const W2 = new THREE.Vector3().crossVectors(V, U).normalize(),
          roll = r(-1.2, 1.2);
        V = V.multiplyScalar(Math.cos(roll)).addScaledVector(W2, Math.sin(roll));
        const l = r(0.36, 0.52),
          g = r(0.88, 1.1),
          gold = r(0.94, 1.08);
        B.card(p, U, V, l, l * 0.5, normalAt, [g * gold, g, g * r(0.85, 1)]);
      }
    }
  };
  const n = Math.round(r(18, 26));
  for (let i = 0; i < n; i++) {
    const a = r(0, TAU),
      rb = r(0, 0.32),
      out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const b = new THREE.Vector3(Math.cos(a) * rb, -0.1, Math.sin(a) * rb);
    const beta = r(0.15, 0.6),
      Ls = H * r(0.7, 1.12),
      arch = r(0.12, 0.3);
    const at = (s) =>
      b
        .clone()
        .addScaledVector(out, Math.sin(beta) * Ls * s + arch * Ls * s * s)
        .addScaledVector(up, Math.cos(beta) * Ls * s - arch * 0.55 * Ls * s * s);
    B.tube(
      [0, 0.25, 0.5, 0.75, 1].map((s) => ({ p: at(s), r: 0.03 * (1 - 0.8 * s) + 0.004, ao: 0.6 + 0.4 * s })),
      5,
    );
    leaves(at, 0.22, Ls, 0.6);
    const shoots = Math.round(r(3, 6));
    for (let k = 0; k < shoots; k++) {
      const s1 = r(0.4, 0.85),
        p1 = at(s1),
        tg = at(s1 + 0.03)
          .sub(at(s1 - 0.03))
          .normalize();
      const sd = new THREE.Vector3(r(-1, 1), r(0, 0.5), r(-1, 1)).projectOnPlane(tg).normalize();
      const dir = tg.clone().addScaledVector(sd, 0.9).normalize(),
        ls = r(0.5, 1.0);
      const at2 = (s) =>
        p1
          .clone()
          .addScaledVector(dir, ls * s)
          .addScaledVector(up, 0.1 * ls * s * s);
      B.tube(
        [0, 0.5, 1].map((s) => ({ p: at2(s), r: 0.009 * (1 - 0.7 * s) + 0.002, ao: 0.85 })),
        3,
      );
      leaves(at2, 0.1, ls, 0.5);
    }
  }
  return { wood: B.geo(B.wood), leaf: B.geo(B.leaf) };
}

/* ---------------- materials: foliage sways in the wind (more toward the top) and shakes when a bull thrashes ---- */
// H0: the plant's model height; AMT: metres of sway at the top in a strong gust
function swayChunk(H0, AMT) {
  return `
  #ifdef USE_INSTANCING
  {
    vec3 ip = vec3(instanceMatrix[3]);
    mat3 im = mat3(instanceMatrix);
    float hh = clamp(position.y / ${H0.toFixed(2)}, 0.0, 1.0); hh *= hh;
    float ph = uTime * 1.1 + ip.x * 0.045 + ip.z * 0.06;
    float gust = 0.55 + 0.45 * sin(ph) * sin(ph * 0.37 + 1.3);
    vec3 w = vec3(uWind.x, 0.0, uWind.z) * gust * hh * ${AMT.toFixed(3)};
    w += vec3(sin(uTime * 2.3 + ip.z * 1.7 + position.y * 0.9), 0.0, cos(uTime * 2.1 + ip.x * 1.3 + position.x * 0.9))
         * ${(AMT * 0.12).toFixed(4)} * hh * (0.4 + uWind.y);
    for (int i = 0; i < 6; i++) { vec4 q = uShake[i]; if (q.w > 0.0) { float qd = length(ip.xz - q.xy);
      if (qd < q.z) { float a = q.w * (1.0 - qd / q.z) * (0.3 + hh);
        w.x += sin(uTime * 14.0 + ip.x * 3.1 + position.y * 3.0) * a * 0.2;
        w.z += cos(uTime * 11.0 + ip.z * 2.7 + position.x * 3.0) * a * 0.2; } } }
    transformed += vec3(dot(im[0], w) / dot(im[0], im[0]), dot(im[1], w) / dot(im[1], im[1]), dot(im[2], w) / dot(im[2], im[2]));
  }
  #endif`;
}
function addUniforms(sh) {
  sh.uniforms.uTime = U.time;
  sh.uniforms.uWind = U.wind;
  sh.uniforms.uShake = U.shake;
  sh.vertexShader = 'uniform float uTime;\nuniform vec3 uWind;\nuniform vec4 uShake[6];\n' + sh.vertexShader;
}
let matN = 0; // every material gets its own shader key (their sizes and sway are baked into the code)
function leafMat(map, H0, AMT, colour) {
  const key = 'plantleaf' + matN++;
  const sway = (sh) => {
    addUniforms(sh);
    sh.vertexShader = sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>' + swayChunk(H0, AMT),
    );
  };
  const m = new THREE.MeshLambertMaterial({ map, alphaTest: 0.5, vertexColors: true, color: colour || 0xffffff });
  m.onBeforeCompile = (sh) => {
    alphaFix(sh, map.image.width); // keeps far sprays solid (as the game's cards do)
    sway(sh);
  };
  m.customProgramCacheKey = () => key;
  try {
    m.alphaToCoverage = true;
  } catch (e) {}
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
  d.onBeforeCompile = sway;
  d.customProgramCacheKey = () => key + 'd';
  return { m, d };
}
function woodMat(colour, H0, AMT, grey) {
  const key = 'plantwood' + matN++;
  const m = new THREE.MeshLambertMaterial({ map: T.bark, vertexColors: true, color: colour });
  m.onBeforeCompile = (sh) => {
    addUniforms(sh);
    // weathered dead wood: pale silver-grey, with a little of the bark texture's pattern (its brown taken out)
    if (grey)
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb = mix(vec3(0.53, 0.51, 0.48), vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), 0.4);',
      );
    sh.vertexShader = sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>' + swayChunk(H0, AMT),
    );
  };
  m.customProgramCacheKey = () => key;
  return m;
}
// one plant as ordinary meshes (for photographing it into an impostor)
function plantMeshes(g, mats) {
  const grp = new THREE.Group();
  const w = new THREE.Mesh(g.wood, mats.wood);
  const l = new THREE.Mesh(g.leaf, mats.leaf.m);
  l.customDepthMaterial = mats.leaf.d;
  for (const m of [w, l]) {
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
  }
  return grp;
}
const _m4 = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _y = new THREE.Vector3(0, 1, 0),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3();
function instMatrix(it) {
  _q.setFromAxisAngle(_y, it.rot);
  return _m4.compose(_p.set(it.x, it.y, it.z), _q, _s.set(it.s, it.s, it.s));
}
// many copies of one plant, grouped in ground cells so the cells out of view aren't drawn
function plantInstances(g, mats, items, o = {}) {
  const cell = o.cell || 60,
    cells = new Map(),
    out = [];
  for (const it of items) {
    const k = Math.floor(it.x / cell) + ',' + Math.floor(it.z / cell);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(it);
  }
  const H = o.height || 16;
  for (const arr of cells.values())
    for (const [geo, mat, depth] of [
      [g.wood, mats.wood, null],
      [g.leaf, mats.leaf.m, mats.leaf.d],
    ]) {
      const gg = new THREE.BufferGeometry(); // shares the buffers; only the bounding sphere is its own
      for (const k in geo.attributes) gg.setAttribute(k, geo.attributes[k]);
      gg.setIndex(geo.index);
      const im = new THREE.InstancedMesh(gg, mat, arr.length);
      let x0 = 1e9,
        x1 = -1e9,
        z0 = 1e9,
        z1 = -1e9,
        y0 = 1e9,
        ms = 0;
      arr.forEach((it, i) => {
        im.setMatrixAt(i, instMatrix(it));
        x0 = Math.min(x0, it.x);
        x1 = Math.max(x1, it.x);
        z0 = Math.min(z0, it.z);
        z1 = Math.max(z1, it.z);
        y0 = Math.min(y0, it.y);
        ms = Math.max(ms, it.s);
      });
      gg.boundingSphere = new THREE.Sphere(
        new THREE.Vector3((x0 + x1) / 2, y0 + (H * ms) / 2, (z0 + z1) / 2),
        Math.hypot(x1 - x0, z1 - z0) / 2 + H * ms,
      );
      im.castShadow = true;
      im.receiveShadow = !!o.receive; // only the nearest; further out they'd change brightness where impostors take over
      if (depth) im.customDepthMaterial = depth;
      out.push(im);
    }
  return out;
}
// a fixed-size set of instances whose list changes while you use the binoculars
function plantPool(g, mats, cap) {
  const meshes = [
    [g.wood, mats.wood, null],
    [g.leaf, mats.leaf.m, mats.leaf.d],
  ].map(([geo, mat, depth]) => {
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.count = 0;
    im.frustumCulled = false;
    if (depth) im.customDepthMaterial = depth;
    return im;
  });
  return {
    meshes,
    set(items) {
      const n = Math.min(cap, items.length);
      for (const im of meshes) {
        for (let i = 0; i < n; i++) im.setMatrixAt(i, instMatrix(items[i]));
        im.count = n;
        im.instanceMatrix.needsUpdate = true;
      }
      return n;
    },
  };
}

/* ---------------- impostors: the 3D plant photographed from 16 sides into one texture ---------------- */
// The quad turns to face the camera (in the shadow pass that is the sun, so the shadow has the right outline) and
// shows the picture taken from that side; it sways like the 3D plant.
// colour: the picture pass, where single impostors can be hidden (aHide) while a 3D tree stands in for them under the
// binoculars; the shadow pass keeps drawing them (the stand-ins cast no shadow).
function impostorShader(sh, views, cols, rows, H0, AMT, colour) {
  addUniforms(sh);
  if (colour) sh.vertexShader = 'attribute float aHide;' + '\n' + sh.vertexShader;
  sh.vertexShader = sh.vertexShader
    // the camera's position from the view matrix: three r128 doesn't give MeshBasic/MeshDepth materials cameraPosition
    // (in the shadow pass this is the sun's shadow camera, so the quad turns to the sun)
    .replace(
      '#include <common>',
      '#include <common>\nattribute float aYaw;\nvec3 viewPos() { return -transpose(mat3(viewMatrix)) * viewMatrix[3].xyz; }',
    )
    .replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
  #ifdef USE_INSTANCING
  { vec3 ip0 = vec3(instanceMatrix[3]); vec2 d0 = viewPos().xz - ip0.xz;
    float k = mod(floor((atan(d0.x, d0.y) - aYaw) / 6.2831853 * ${views}.0 + 0.5), ${views}.0);
    vUv = (uv + vec2(mod(k, ${cols}.0), floor(k / ${cols}.0))) / vec2(${cols}.0, ${rows}.0); }
  #endif`,
    )
    .replace(
      '#include <project_vertex>',
      `#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3]); float sc = length(vec3(instanceMatrix[0]));
  vec2 dd = viewPos().xz - ip.xz; dd /= max(length(dd), 1e-3);
  float hh = clamp(transformed.y / ${H0.toFixed(2)}, 0.0, 1.0); hh *= hh;
  float ph = uTime * 1.1 + ip.x * 0.045 + ip.z * 0.06;
  float gust = 0.55 + 0.45 * sin(ph) * sin(ph * 0.37 + 1.3);
  vec3 w = vec3(uWind.x, 0.0, uWind.z) * gust * hh * ${AMT.toFixed(3)};
  for (int i = 0; i < 6; i++) { vec4 q = uShake[i]; if (q.w > 0.0) { float qd = length(ip.xz - q.xy);
    if (qd < q.z) { float a = q.w * (1.0 - qd / q.z) * (0.3 + hh);
      w.x += sin(uTime * 14.0 + ip.x * 3.1) * a * 0.2; w.z += cos(uTime * 11.0 + ip.z * 2.7) * a * 0.2; } } }
  vec3 wp = ip + vec3(dd.y, 0.0, -dd.x) * transformed.x * sc + vec3(0.0, transformed.y * sc, 0.0) + w;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  #else
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  #endif
  gl_Position = projectionMatrix * mvPosition;
  ${colour ? 'if (aHide > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);' : ''}`,
    );
}
function bakeImpostor(group, o = {}) {
  const views = 16,
    tileH = o.tileH || 512,
    H0 = o.H0 || 15,
    AMT = o.AMT || 0.3;
  const box = new THREE.Box3().setFromObject(group);
  let rx = 0;
  group.traverse((m) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) rx = Math.max(rx, Math.hypot(p.getX(i), p.getZ(i)));
  });
  const h = (box.max.y - box.min.y) * 1.03,
    w = rx * 2.06;
  const tileW = clamp(2 ** Math.round(Math.log2((tileH * w) / h)), 64, 512); // atlas at most 4096 wide
  const Wd = Math.max(w, (h * tileW) / tileH),
    Hd = (Wd * tileH) / tileW,
    cy = (box.min.y + box.max.y) / 2;
  const cols = 8,
    rows = views / cols;
  const rt = new THREE.WebGLRenderTarget(tileW * cols, tileH * rows, {
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
  });
  const tmp = new THREE.Scene();
  tmp.add(hemi.clone());
  const dl = new THREE.DirectionalLight(sun.color, sun.intensity);
  dl.position.copy(SUN_DIR).multiplyScalar(100);
  tmp.add(dl);
  const parent = group.parent;
  tmp.add(group);
  const cam = new THREE.OrthographicCamera(-Wd / 2, Wd / 2, Hd / 2, -Hd / 2, 0.1, 400);
  const keep = {
    auto: renderer.autoClear,
    col: renderer.getClearColor(new THREE.Color()),
    a: renderer.getClearAlpha(),
    tm: renderer.toneMapping,
    rt: renderer.getRenderTarget(),
    sh: renderer.shadowMap.enabled,
  };
  try {
    renderer.toneMapping = THREE.NoToneMapping; // graded once, when the impostor is drawn
    renderer.shadowMap.enabled = false;
    renderer.autoClear = false;
    renderer.setClearColor(0x2c3a2a, 0); // foliage-coloured but clear, so mipmaps don't darken the edges
    rt.scissorTest = false;
    rt.viewport.set(0, 0, tileW * cols, tileH * rows);
    renderer.setRenderTarget(rt);
    renderer.clear();
    const elev = 0.07; // seen from a stand: a few degrees above
    for (let i = 0; i < views; i++) {
      const th = (i / views) * TAU;
      cam.position.set(Math.sin(th) * 150, cy + Math.tan(elev) * 150, Math.cos(th) * 150);
      cam.lookAt(0, cy, 0);
      const x = (i % cols) * tileW,
        y = Math.floor(i / cols) * tileH;
      rt.viewport.set(x, y, tileW, tileH);
      rt.scissor.set(x, y, tileW, tileH);
      rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      renderer.render(tmp, cam);
    }
  } finally {
    renderer.setRenderTarget(keep.rt);
    renderer.toneMapping = keep.tm;
    renderer.shadowMap.enabled = keep.sh;
    renderer.autoClear = keep.auto;
    renderer.setClearColor(keep.col, keep.a);
    if (parent) parent.add(group);
    else tmp.remove(group);
  }
  const geo = new THREE.PlaneGeometry(Wd, Hd);
  geo.translate(0, cy, 0);
  const key = 'imp' + matN++;
  const mat = new THREE.MeshBasicMaterial({ map: rt.texture, alphaTest: 0.5 });
  try {
    mat.alphaToCoverage = true;
  } catch (e) {}
  mat.onBeforeCompile = (sh) => {
    alphaFix(sh, tileW * cols);
    impostorShader(sh, views, cols, rows, H0, AMT, true);
  };
  mat.customProgramCacheKey = () => key;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: rt.texture, alphaTest: 0.5 });
  depth.onBeforeCompile = (sh) => impostorShader(sh, views, cols, rows, H0, AMT);
  depth.customProgramCacheKey = () => key + 'd';
  return { geo, mat, depth, rt, size: [tileW * cols, tileH * rows] };
}
// one instanced quad per far plant; `hide(i)` / `show(i)` let the binoculars swap single plants for 3D ones
function impostorInstances(imp, items) {
  const im = new THREE.InstancedMesh(imp.geo.clone(), imp.mat, Math.max(1, items.length));
  im.count = items.length;
  const yaw = new Float32Array(Math.max(1, items.length));
  const put = (i) => {
    const it = items[i];
    _m4.makeScale(it.s, it.s, it.s).setPosition(it.x, it.y, it.z);
    im.setMatrixAt(i, _m4);
  };
  items.forEach((it, i) => {
    put(i);
    yaw[i] = it.rot;
  });
  im.geometry.setAttribute('aYaw', new THREE.InstancedBufferAttribute(yaw, 1));
  const hideA = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, items.length)), 1);
  hideA.setUsage(THREE.DynamicDrawUsage);
  im.geometry.setAttribute('aHide', hideA);
  im.frustumCulled = false;
  im.castShadow = true;
  im.customDepthMaterial = imp.depth;
  return {
    mesh: im,
    items,
    hide(i) {
      hideA.array[i] = 1;
      hideA.needsUpdate = true;
    },
    show(i) {
      hideA.array[i] = 0;
      hideA.needsUpdate = true;
    },
  };
}

/* ---------------- the live marsh ---------------- */
const FULL_R = 40, // full 3D trees
  LIGHT_R = 100, // lighter 3D trees; impostors beyond, all the way out
  SHRUB_FULL_R = 35, // 3D willow/alder; impostors beyond
  ZOOM_FOV = 24, // narrower than this (binoculars): impostors in view become 3D
  POOL_TREES = 100, // at most this many of each tree kind turn 3D under the binoculars (the nearest)
  POOL_SHRUBS = 120,
  SWAP_MAX = 700; // and at most this many in all
const TREE_H = 15, // model heights the plants are built at (instances scale from these)
  WI_H = 3;
const WILLOW_SEEDS = [3, 17];
// the forest's tree kinds (tiles of the card atlas, render/textures.js; tile 1's card is a spruce, kept as the
// fallback for the pine)
const SPECIES = [
  { tiles: [0], seeds: [7, 31], P: CONIFERS.white, leaf: 'spray', wood: 0x9a8f84, amt: 0.25 },
  { tiles: [1], seeds: [21, 52], P: CONIFERS.pine, leaf: 'pine', tint: [1.02, 1.0, 0.9], wood: 0xa0785a, amt: 0.22 },
  // dead standing spruce: silver-grey weathered wood, grey twigs
  {
    tiles: [7],
    seeds: [4, 15, 23, 37, 41, 58],
    forms: ['classic', 'bare', 'branchy', 'lean', 'bare', 'lean'],
    snag: true,
    leaf: 'dead',
    wood: [1, 1, 1],
    amt: 0.06,
    pool: 50,
  },
  { tiles: [2], seeds: [13, 44], P: CONIFERS.black, leaf: 'spray', tint: [0.8, 0.86, 0.9], wood: 0x857a70, amt: 0.2 },
  { tiles: [3], seeds: [5, 61], P: CONIFERS.fir, leaf: 'spray', tint: [0.88, 1.02, 0.9], wood: 0x8f8a80, amt: 0.25 },
  { tiles: [6], seeds: [9, 27], P: CONIFERS.tamarack, leaf: 'larch', wood: 0x8a7060, amt: 0.3 },
  { tiles: [4], seeds: [3, 19], broad: true, leaf: 'aspen', tint: [1, 0.84, 0.6], wood: [2.2, 2.2, 2.05], amt: 0.45 },
  { tiles: [5], seeds: [8, 33], broad: true, leaf: 'birch', tint: [1, 0.86, 0.64], wood: [2.6, 2.55, 2.4], amt: 0.45 },
];
const GFX_KEY = 'marshrut-gfx';

// the player's choice (Game Settings), and whether this computer's graphics can do it
function plants3dSetting() {
  try {
    const s = JSON.parse(localStorage.getItem(GFX_KEY) || '{}');
    return s.plants3d !== false;
  } catch (e) {
    return true;
  }
}
function savePlants3dSetting(on) {
  try {
    const s = JSON.parse(localStorage.getItem(GFX_KEY) || '{}');
    s.plants3d = !!on;
    localStorage.setItem(GFX_KEY, JSON.stringify(s));
  } catch (e) {}
}
function plants3dSupported() {
  const cap = renderer.capabilities;
  return !!cap.isWebGL2 && cap.maxTextureSize >= 4096;
}
function plants3dWanted() {
  return plants3dSetting() && plants3dSupported() && !new URLSearchParams(location.search).has('cards');
}

const hash = (x, z) => {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const colour = (c) => (Array.isArray(c) ? new THREE.Color().setRGB(c[0], c[1], c[2]) : c);

let LIVE = null; // what was built, for the binocular swap

// trees: [{x, y, z, h, rot, tile, hide(on)}], shrubs: [{x, y, z, sy, rot, tile, hide(on)}]; centre = the hunter's
// stand. Builds everything first and only then hides the cards it replaces, so a failure leaves the old forest.
// shrubTints: the two bush kinds' leaf colours, if the map has its own (none does now).
function buildPlants3D(trees, shrubs, centre, shrubTints) {
  const t0 = performance.now();
  const added = [],
    hidden = [];
  const add = (o) => {
    scene.add(o);
    added.push(o);
  };
  try {
    const texs = {
      spray: paintSpray(),
      larch: paintSpray({
        seed: 12,
        cols: ['#c99a3a', '#d9ad4a', '#b88a30', '#a87a2a', '#e0bc5a'],
        tip: '#e8c868',
        core: '#7a5a24',
        coreN: 120,
        n: 2400,
      }),
      aspen: paintLeaves(['#e3b53a', '#d79a28', '#f0cd5a', '#c4862a', '#e8c24a', '#9aa53a'], 5),
      birch: paintLeaves(['#d9a830', '#e6bd45', '#c98a26', '#b0762a', '#efd06a'], 6),
      willow: paintWillow(),
      // lodgepole pine: longer, yellower needles in looser tufts
      pine: paintSpray({
        seed: 21,
        cols: ['#3d4f2c', '#4a5c32', '#55673a', '#344628', '#5d6e3e'],
        tip: '#6f7f48',
        core: '#2a3820',
        coreN: 140,
        n: 2200,
      }),
      // a snag's last twigs: bare and grey
      dead: paintSpray({
        seed: 33,
        cols: ['#8a847a', '#777065', '#9a948a', '#6a6359'],
        tip: '#a8a298',
        core: '#5a544c',
        coreN: 0,
        n: 260,
      }),
    };
    // one entry per tree kind and seed: its full and light 3D models, materials and impostor
    const kinds = [],
      kindOfTile = new Map();
    for (const sp of SPECIES) {
      const mats = {
        wood: woodMat(colour(sp.wood), TREE_H, sp.amt, !!sp.snag),
        leaf: leafMat(texs[sp.leaf], TREE_H, sp.amt, sp.tint ? colour(sp.tint) : null),
      };
      const list = sp.seeds.map((seed, i) => {
        const make = (d) =>
          sp.broad
            ? broadleaf(seed, TREE_H, d)
            : sp.snag
              ? snag(seed, TREE_H, d, sp.forms[i])
              : spruce(seed, TREE_H, d, sp.P);
        const light = make(sp.broad ? 0.4 : sp.snag ? 0.5 : 0.35);
        return {
          mats,
          makeFull: () => make(1), // only built if a tree of this kind stands within FULL_R
          light,
          imp: bakeImpostor(plantMeshes(light, mats), { tileH: 256, H0: TREE_H, AMT: sp.amt }),
          items: { full: [], light: [], imp: [] },
          pool: sp.pool || POOL_TREES,
          shrub: false,
          H: TREE_H,
        };
      });
      kinds.push(...list);
      for (const t of sp.tiles) kindOfTile.set(t, list);
    }
    const ST = shrubTints || [
      [0.8, 0.72, 0.46], // willow, autumn gold
      [0.64, 0.68, 0.42], // alder, a little greener
    ];
    const wiMats = [
      { wood: woodMat(0x8a7a64, WI_H, 0.12), leaf: leafMat(texs.willow, WI_H, 0.12, colour(ST[0])) },
      { wood: woodMat(0x6f6458, WI_H, 0.12), leaf: leafMat(texs.willow, WI_H, 0.12, colour(ST[1])) },
    ];
    const wiGeo = WILLOW_SEEDS.map((s) => willow(s, WI_H));
    const shrubKinds = [0, 1].map((tint) =>
      wiGeo.map((g) => ({
        mats: wiMats[tint],
        makeFull: () => g,
        light: g,
        imp: bakeImpostor(plantMeshes(g, wiMats[tint]), { tileH: 128, H0: WI_H, AMT: 0.12 }),
        items: { full: [], light: [], imp: [] },
        pool: POOL_SHRUBS,
        shrub: true,
        H: WI_H,
      })),
    );

    // sort the plants by distance from the stand
    const hides = [];
    const nearest = {},
      testInfo = /[?&]test=/.test(location.search);
    for (const t of trees) {
      const list = kindOfTile.get(t.tile);
      if (!list) continue;
      const d = Math.hypot(t.x - centre.x, t.z - centre.z);
      if (testInfo && d > 25) (nearest[t.tile] ||= []).push({ x: t.x, y: t.y, z: t.z, h: t.h, d });
      const k = list[Math.floor(hash(t.x, t.z) * list.length) % list.length];
      const it = { x: t.x, y: t.y, z: t.z, rot: t.rot, s: t.h / TREE_H };
      k.items[d < FULL_R ? 'full' : d < LIGHT_R ? 'light' : 'imp'].push(it);
      hides.push(t.hide);
    }
    for (const b of shrubs) {
      const d = Math.hypot(b.x - centre.x, b.z - centre.z);
      const list = shrubKinds[b.tile === 1 ? 1 : 0];
      const k = list[Math.floor(hash(b.x, b.z) * list.length) % list.length];
      const it = { x: b.x, y: b.y, z: b.z, rot: b.rot, s: (b.sy / WI_H) * 1.2 };
      k.items[d < SHRUB_FULL_R ? 'full' : 'imp'].push(it);
      hides.push(b.hide);
    }
    let n3d = 0,
      nImp = 0;
    const groups = [];
    for (const k of [...kinds, ...shrubKinds.flat()]) {
      const H = k.H;
      // The nearest trees receive shadows (their impostors further out can't, so the light ones don't either).
      // The bushes don't: the shadow map's half-metre texels left dark blotches on them.
      if (k.items.full.length)
        for (const m of plantInstances(k.makeFull(), k.mats, k.items.full, { height: H, cell: 40, receive: !k.shrub }))
          add(m);
      for (const m of plantInstances(k.light, k.mats, k.items.light, { height: H })) add(m);
      n3d += k.items.full.length + k.items.light.length;
      // impostors, with a pool of 3D plants that take over under the binoculars
      const I = impostorInstances(k.imp, k.items.imp);
      const pool = plantPool(k.light, k.mats, k.pool);
      add(I.mesh);
      pool.meshes.forEach(add);
      // each impostor's bearing and distance from the stand (the camera never leaves it), nearest first
      const near = k.items.imp
        .map((it, i) => ({
          i,
          a: Math.atan2(it.x - centre.x, it.z - centre.z),
          d: Math.hypot(it.x - centre.x, it.z - centre.z),
        }))
        .sort((p, q) => p.d - q.d);
      groups.push({ I, pool, cap: k.pool, near, swapped: [] });
      nImp += k.items.imp.length;
    }
    // all built: now take the old cards away
    for (const h of hides) {
      h(true);
      hidden.push(h);
    }
    LIVE = { groups, added, hidden, zoomed: false, yaw: 0, fov: 0, frames: [], t0: 0 };
    const info = {
      ms: Math.round(performance.now() - t0),
      plants3d: n3d,
      impostors: nImp,
      cardsHidden: hides.length,
      // (in test runs only: how many trees of each kind beyond 25 m, and the eight nearest)
      counts: Object.fromEntries(Object.entries(nearest).map(([t, l]) => [t, l.length])),
      nearest: Object.fromEntries(
        Object.entries(nearest).map(([t, l]) => [t, l.sort((p, q) => p.d - q.d).slice(0, 8)]),
      ),
    };
    window.__plants3d = info;
    return info;
  } catch (err) {
    undo(added, hidden);
    console.warn('3D plants failed; keeping the painted cards', err);
    return null;
  }
}
// back to the painted cards
function undo(added, hidden) {
  for (const o of added) scene.remove(o);
  for (const h of hidden) h(false);
  LIVE = null;
}

// The first seconds in the marsh: if this computer can't keep 30 frames a second with the 3D plants, go back to the
// cards for this visit (the setting stays as it is, so a faster moment or computer gets them next time).
function watchSpeed() {
  const now = performance.now();
  if (!LIVE.t0) LIVE.t0 = now;
  const f = LIVE.frames;
  if (LIVE.last && now - LIVE.t0 > 2000) {
    const dt = now - LIVE.last;
    f.push(dt); // the median below ignores the odd long gap (a pause, a hidden tab)
  }
  LIVE.last = now;
  if (f.length < 150 && !(now - LIVE.t0 > 12000 && f.length >= 5)) return; // 150 frames, or 10 s of a slow machine
  const med = f.slice().sort((a, b) => a - b)[f.length >> 1];
  if (med > 1000 / 30) {
    undo(LIVE.added, LIVE.hidden);
    console.warn('3D plants: ' + Math.round(1000 / med) + ' fps, back to the painted cards for this visit');
    if (window.__plants3d) window.__plants3d.fallback = Math.round(1000 / med);
  } else LIVE.frames = null; // fast enough: stop watching
}

// Every frame: through the binoculars, impostors in view turn into 3D plants (an impostor magnified 7x is blocky).
const _fw = new THREE.Vector3();
function updatePlants3D(camera, fov) {
  if (!LIVE) return;
  if (LIVE.frames) {
    watchSpeed();
    if (!LIVE) return;
  }
  const zoom = fov < ZOOM_FOV;
  if (!zoom) {
    if (LIVE.zoomed) {
      for (const g of LIVE.groups) {
        for (const i of g.swapped) g.I.show(i);
        g.swapped = [];
        g.pool.set([]);
      }
      LIVE.zoomed = false;
    }
    return;
  }
  camera.getWorldDirection(_fw);
  const yaw = Math.atan2(_fw.x, _fw.z);
  const half = Math.atan(Math.tan((fov * Math.PI) / 360) * camera.aspect) + 0.06;
  let dy = Math.abs(yaw - LIVE.yaw);
  if (dy > Math.PI) dy = TAU - dy;
  if (LIVE.zoomed && dy < half * 0.25 && Math.abs(fov - LIVE.fov) < fov * 0.15) return; // nothing much changed
  LIVE.zoomed = true;
  LIVE.yaw = yaw;
  LIVE.fov = fov;
  const wide = half * 1.6; // a margin either side, so turning a little doesn't show impostors at the edge
  // the nearest impostors in view, per kind (its own cap), then the nearest SWAP_MAX of those over all kinds
  const cand = [];
  for (const g of LIVE.groups) {
    let n = 0;
    for (const e of g.near) {
      if (n >= g.cap) break;
      let a = e.a - yaw;
      a = Math.abs(((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI);
      if (a < wide) {
        cand.push([e.d, g, e.i]);
        n++;
      }
    }
  }
  cand.sort((p, q) => p[0] - q[0]);
  cand.length = Math.min(cand.length, SWAP_MAX);
  for (const g of LIVE.groups) {
    for (const i of g.swapped) g.I.show(i);
    g.swapped = [];
  }
  for (const [, g, i] of cand) g.swapped.push(i);
  for (const g of LIVE.groups) {
    g.pool.set(g.swapped.map((i) => g.I.items[i]));
    for (const i of g.swapped) g.I.hide(i);
  }
}

export { buildPlants3D, updatePlants3D, plants3dWanted, plants3dSupported, plants3dSetting, savePlants3dSetting };
