// render/plants3d.js — real 3D white spruce and willow/alder clumps near the hunter, impostors further out.
// Everything is built in code from fixed seeds when the marsh loads (about a fifth of a second): no downloads.
//   spruce (the forest's spruce-type trees): full 3D within FULL_R of the stand, a lighter 3D tree to LIGHT_R,
//     impostors to IMP_R (pictures of the 3D tree from 16 sides; the game shows the one for your side), then the
//     old cards. Under the binoculars the impostors in view switch to the lighter 3D tree (they'd look blocky).
//   willow/alder (the shared, seeded SHRUBS the bulls thrash): full 3D within SHRUB_FULL_R, impostors to
//     SHRUB_IMP_R (3D under the binoculars), then cards.
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
function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
// twig along x (u), needles both sides pointing forward; lighter new growth at the tip
function paintSpray() {
  const r = rngOf(11),
    W = 256,
    H = 128,
    c = mkC(W, H),
    g = c.getContext('2d');
  const cols = ['#24352a', '#2c3f2e', '#33472f', '#203026', '#3a4f36', '#2a3b33'];
  const y = (u) => H / 2 + Math.sin(u * 2.2) * 4 - u * 6;
  g.strokeStyle = '#4a3828';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, y(0));
  for (let u = 0; u <= 1; u += 0.05) g.lineTo(u * W * 0.97, y(u));
  g.stroke();
  // a dark, soft core first, so the spray stays solid when it's small (far off) instead of breaking up
  for (let i = 0; i < 220; i++) {
    const u = Math.pow(r(), 0.8),
      x = u * W * 0.92;
    g.fillStyle = shade(r, '#1c2a20', r(0.85, 1.1), 4);
    g.beginPath();
    g.ellipse(x, y(u) + r(-1, 1) * (1 - u * 0.5) * H * 0.18, r(5, 10), r(4, 9) * (1 - u * 0.4), 0, 0, TAU);
    g.fill();
  }
  for (let i = 0; i < 3200; i++) {
    const u = Math.pow(r(), 0.85),
      x = u * W * 0.96,
      s = r() < 0.5 ? -1 : 1,
      spread = (1 - u * 0.45) * H * 0.44,
      L = r(0.3, 1) * spread,
      a = s * r(0.45, 1.35);
    const tip = u > 0.86 ? r(0, 1) : 0;
    g.strokeStyle =
      tip > 0.6 ? shade(r, '#4f6a46', r(0.85, 1.05)) : shade(r, cols[(r() * cols.length) | 0], r(0.8, 1.2));
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

// White spruce: narrow cone of whorled branches, level to slightly drooping with upturned tips, dense sprays,
// the inner lower crown bare. detail 1 = close up; ~0.35 = the cheaper version for trees further off.
function spruce(seed, H, detail = 1) {
  const r = rngOf(seed),
    B = new Builder(),
    up = new THREE.Vector3(0, 1, 0);
  const R0 = 0.24 * (H / 16),
    crownBase = r(1.0, 1.8),
    maxR = H * r(0.15, 0.18);
  const lean = new THREE.Vector3(r(-0.02, 0.02), 0, r(-0.02, 0.02));
  const axis = (y) => new THREE.Vector3(lean.x * y, y, lean.z * y);
  const trunk = [];
  for (let i = 0; i <= 12; i++) {
    const y = (i / 12) * H;
    trunk.push({ p: axis(y - 0.3 * (i === 0)), r: R0 * Math.pow(1 - y / H, 0.9) + 0.012, ao: 0.55 + 0.45 * (y / H) });
  }
  B.tube(trunk, detail < 1 ? 5 : 8);
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
    spacing = low ? 0.34 : 0.15,
    sprayL = low ? 0.9 : 0.5;
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
    levels.push({ y, n: Math.round(r(6, 8) * (low ? 0.8 : 1)), k: 1 });
    if (!low && r() < 0.6) levels.push({ y: y + dy * 0.5, n: Math.round(r(1, 2)), k: 0.45 }); // small branches between whorls
  }
  for (const lv of levels) {
    const y = lv.y,
      t = (y - crownBase) / (H - crownBase);
    if (t > 0.985) continue;
    const n = lv.n;
    a0 += 2.4;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU + r(-0.3, 0.3);
      const L = (maxR * Math.pow(1 - t, 1.05) + 0.22) * r(0.8, 1.12) * lv.k;
      const h = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const el = lerp(-0.12, 0.5, Math.pow(t, 1.6)),
        droop = 0.32 * (1 - t) * L,
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
        spray(p, tg.clone().addScaledVector(up, r(-0.15, 0.1)), sprayL * tipK * r(0.8, 1.1), 1.0);
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
function woodMat(colour, H0, AMT) {
  const key = 'plantwood' + matN++;
  const m = new THREE.MeshLambertMaterial({ map: T.bark, vertexColors: true, color: colour });
  m.onBeforeCompile = (sh) => {
    addUniforms(sh);
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
  _s = new THREE.Vector3(),
  ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
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
    im.castShadow = true;
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
function impostorShader(sh, views, cols, rows, H0, AMT) {
  addUniforms(sh);
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
  gl_Position = projectionMatrix * mvPosition;`,
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
    impostorShader(sh, views, cols, rows, H0, AMT);
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
  im.frustumCulled = false;
  im.castShadow = true;
  im.customDepthMaterial = imp.depth;
  return {
    mesh: im,
    items,
    hide(i) {
      im.setMatrixAt(i, ZERO);
      im.instanceMatrix.needsUpdate = true;
    },
    show(i) {
      put(i);
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

/* ---------------- the live marsh ---------------- */
const FULL_R = 32, // full 3D spruce
  LIGHT_R = 115, // lighter 3D spruce
  IMP_R = 320, // spruce impostors; cards beyond
  SHRUB_FULL_R = 35, // 3D willow/alder
  SHRUB_IMP_R = 160, // their impostors; cards beyond
  ZOOM_FOV = 24; // narrower than this (binoculars): impostors in view become 3D
const SP_H = 15, // model heights the plants are built at (instances scale from these)
  WI_H = 3;
const SPRUCE_SEEDS = [7, 31, 58],
  WILLOW_SEEDS = [3, 17];
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

let LIVE = null; // what was built, for the binocular swap

// spruce: [{x, y, z, h, rot, hide()}], shrubs: [{x, y, z, sy, tile, hide()}]; centre = where the hunter sits.
// Builds everything first and only then hides the cards it replaces, so a failure leaves the old forest intact.
function buildPlants3D(spruceList, shrubList, centre) {
  const t0 = performance.now();
  const added = [],
    hidden = [];
  const add = (o) => {
    scene.add(o);
    added.push(o);
  };
  try {
    const sprayTex = paintSpray(),
      willowTex = paintWillow();
    const spMats = { wood: woodMat(0x9a8f84, SP_H, 0.25), leaf: leafMat(sprayTex, SP_H, 0.25) };
    const wiMats = [
      {
        wood: woodMat(0x8a7a64, WI_H, 0.12),
        leaf: leafMat(willowTex, WI_H, 0.12, new THREE.Color().setRGB(1.5, 1.35, 0.95)),
      }, // willow, autumn gold
      {
        wood: woodMat(0x6f6458, WI_H, 0.12),
        leaf: leafMat(willowTex, WI_H, 0.12, new THREE.Color().setRGB(1.2, 1.2, 0.8)),
      }, // alder, a little greener
    ];
    const spFull = SPRUCE_SEEDS.map((s) => spruce(s, SP_H, 1)),
      spLight = SPRUCE_SEEDS.map((s) => spruce(s, SP_H, 0.35)),
      wiGeo = WILLOW_SEEDS.map((s) => willow(s, WI_H));
    const spImp = spLight.map((g) => bakeImpostor(plantMeshes(g, spMats), { tileH: 512, H0: SP_H, AMT: 0.25 }));
    const wiImp = [0, 1].map((tint) =>
      wiGeo.map((g) => bakeImpostor(plantMeshes(g, wiMats[tint]), { tileH: 256, H0: WI_H, AMT: 0.12 })),
    );

    // sort the plants by distance from the stand
    const sp = { full: SPRUCE_SEEDS.map(() => []), light: SPRUCE_SEEDS.map(() => []), imp: SPRUCE_SEEDS.map(() => []) };
    const wi = { full: [[], []].map(() => [[], []]), imp: [[], []].map(() => [[], []]) };
    const hides = [];
    for (const t of spruceList) {
      const d = Math.hypot(t.x - centre.x, t.z - centre.z);
      if (d > IMP_R) continue;
      const v = Math.floor(hash(t.x, t.z) * SPRUCE_SEEDS.length) % SPRUCE_SEEDS.length;
      const it = { x: t.x, y: t.y, z: t.z, rot: t.rot, s: t.h / SP_H, v };
      (d < FULL_R ? sp.full : d < LIGHT_R ? sp.light : sp.imp)[v].push(it);
      hides.push(t.hide);
    }
    for (const b of shrubList) {
      const d = Math.hypot(b.x - centre.x, b.z - centre.z);
      if (d > SHRUB_IMP_R) continue;
      const tint = b.tile === 1 ? 1 : 0,
        v = Math.floor(hash(b.x, b.z) * WILLOW_SEEDS.length) % WILLOW_SEEDS.length;
      const it = { x: b.x, y: b.y, z: b.z, rot: b.rot, s: (b.sy / WI_H) * 1.2, v, tint };
      (d < SHRUB_FULL_R ? wi.full : wi.imp)[tint][v].push(it);
      hides.push(b.hide);
    }
    let n3d = 0,
      nImp = 0;
    SPRUCE_SEEDS.forEach((_, v) => {
      for (const m of plantInstances(spFull[v], spMats, sp.full[v], { height: SP_H, receive: true })) add(m);
      for (const m of plantInstances(spLight[v], spMats, sp.light[v], { height: SP_H })) add(m);
      n3d += sp.full[v].length + sp.light[v].length;
    });
    for (const tint of [0, 1])
      WILLOW_SEEDS.forEach((_, v) => {
        for (const m of plantInstances(wiGeo[v], wiMats[tint], wi.full[tint][v], {
          height: WI_H,
          cell: 40,
          receive: true,
        }))
          add(m);
        n3d += wi.full[tint][v].length;
      });
    // impostors, each with a pool of 3D plants that take over under the binoculars
    const groups = [];
    SPRUCE_SEEDS.forEach((_, v) => {
      const I = impostorInstances(spImp[v], sp.imp[v]);
      const pool = plantPool(spLight[v], spMats, 500);
      add(I.mesh);
      pool.meshes.forEach(add);
      groups.push({ I, pool, swapped: [] });
      nImp += sp.imp[v].length;
    });
    for (const tint of [0, 1])
      WILLOW_SEEDS.forEach((_, v) => {
        const I = impostorInstances(wiImp[tint][v], wi.imp[tint][v]);
        const pool = plantPool(wiGeo[v], wiMats[tint], 150);
        add(I.mesh);
        pool.meshes.forEach(add);
        groups.push({ I, pool, swapped: [] });
        nImp += wi.imp[tint][v].length;
      });
    // all built: now take the old cards away
    for (const h of hides) {
      h(true);
      hidden.push(h);
    }
    LIVE = { groups, added, hidden, zoomed: false, yaw: 0, fov: 0, frames: [], t0: 0 };
    const info = { ms: Math.round(performance.now() - t0), plants3d: n3d, impostors: nImp, cardsHidden: hides.length };
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
  if (LIVE.zoomed && dy < half * 0.25 && Math.abs(fov - LIVE.fov) < 1) return; // nothing much changed
  LIVE.zoomed = true;
  LIVE.yaw = yaw;
  LIVE.fov = fov;
  const cx = camera.position.x,
    cz = camera.position.z,
    wide = half * 1.6; // a margin either side, so turning a little doesn't show impostors at the edge
  for (const g of LIVE.groups) {
    for (const i of g.swapped) g.I.show(i);
    const swapped = [],
      list = [];
    g.I.items.forEach((it, i) => {
      let a = Math.atan2(it.x - cx, it.z - cz) - yaw;
      a = Math.abs(((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI);
      if (a < wide) {
        swapped.push(i);
        list.push(it);
      }
    });
    const n = g.pool.set(list);
    g.swapped = swapped.slice(0, n);
    for (const i of g.swapped) g.I.hide(i);
  }
}

export { buildPlants3D, updatePlants3D, plants3dWanted, plants3dSupported, plants3dSetting, savePlants3dSetting };
