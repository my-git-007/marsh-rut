// models/moose.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { clamp, hexLin, mix3, noise2, rand, randi, smoothstep } from '../../../shared/util.js';
import { T } from '../render/textures.js';
import { EAR, SHELLS, buildAntlers, furMat, furRim } from './antlers.js';
import { loft } from './moose-geo.js';
import { REF_GEO, REF_MAT, buildRefAntlers, refAntlerReady } from './ref-bull.js';

/* ================= sculpted moose: blended anatomical forms → one seamless skinned mesh ================= */
/* Each moose kind is sculpted from ~30 smoothly blended forms (rib cage, hump, haunches, neck, skull, nose,
   jaw, leg bones...), proportioned from the reference renders, turned into a single mesh (surface nets),
   skinned to a skeleton (neck, head, jaw, hips, knees/hocks) and coloured per coat variant. */
const MOOSE_KINDS = {};
const SHELL_N = 8;
const SHELL_MATS = []; // fur shells (moose and the larger critters); the tips are a lighter shade of the animal's own colour
let MOOSE_BASE_MAT = null;
const MOOSE_PALS = {
  bull: [
    // dark chocolate · grizzled grey-brown · reddish-brown · near-black
    {
      body: '#2e241c',
      back: '#3b2f26',
      belly: '#1d1712',
      legUp: '#2a221b',
      leg: '#5c554c',
      hoof: '#16120f',
      head: '#33281f',
      muzzle: '#241b14',
      mane: '#1c1611',
    },
    {
      body: '#3a3129',
      back: '#5e554b',
      belly: '#231c16',
      legUp: '#2e261f',
      leg: '#6a6258',
      hoof: '#16120f',
      head: '#4a3e34',
      muzzle: '#2a211a',
      mane: '#2a221b',
    },
    {
      body: '#3f2c20',
      back: '#4c372a',
      belly: '#261b14',
      legUp: '#33251b',
      leg: '#645a4e',
      hoof: '#16120f',
      head: '#3c2c20',
      muzzle: '#261c15',
      mane: '#241a13',
    },
    {
      body: '#211b16',
      back: '#2c241d',
      belly: '#15110e',
      legUp: '#1e1814',
      leg: '#57504a',
      hoof: '#120f0d',
      head: '#262019',
      muzzle: '#1a1511',
      mane: '#14100d',
    },
  ],
  cow: [
    {
      body: '#45362a',
      back: '#4f3e30',
      belly: '#2f251c',
      legUp: '#3c2f24',
      leg: '#77706a',
      hoof: '#1c1813',
      head: '#544538',
      muzzle: '#5e5046',
      mane: '#33281f',
    },
    {
      body: '#55432f',
      back: '#614d38',
      belly: '#3a2d20',
      legUp: '#4a3a2a',
      leg: '#8a8378',
      hoof: '#1c1813',
      head: '#6a5848',
      muzzle: '#6e5e50',
      mane: '#3e3024',
    },
    {
      body: '#3a2e25',
      back: '#463830',
      belly: '#261f19',
      legUp: '#33281f',
      leg: '#6c665e',
      hoof: '#1c1813',
      head: '#4a3d32',
      muzzle: '#56483e',
      mane: '#2a221b',
    },
  ],
  calf: [
    {
      body: '#5c3e2a',
      back: '#62432e',
      belly: '#4a3022',
      legUp: '#5a3c2a',
      leg: '#665244',
      hoof: '#2a2018',
      head: '#5e4030',
      muzzle: '#4a3426',
      mane: '#4a3224',
    },
    {
      body: '#6e4530',
      back: '#754b34',
      belly: '#563526',
      legUp: '#6a432e',
      leg: '#76604e',
      hoof: '#2a2018',
      head: '#704a34',
      muzzle: '#56392a',
      mane: '#5a3a28',
    },
  ],
};
const FUR_LEN = {
  mane: 0.085,
  neck: 0.05,
  torso: 0.038,
  hump: 0.06,
  tail: 0.05,
  head: 0.016,
  muzzle: 0.008,
  jaw: 0.02,
  legUp: 0.025,
  legMid: 0.016,
  legLo: 0.01,
  hoof: 0,
  bell: 0.07,
};
const BULL_LEN = 1.1; // bulls' bodies are this much longer than the base sculpt (cows and calves keep it)
const BONES = ['body', 'neck', 'head', 'jaw', 'fhL', 'fkL', 'fhR', 'fkR', 'hhL', 'hkL', 'hhR', 'hkR'];
function mooseRig(kind) {
  const cow = kind !== 'bull',
    calf = kind === 'calf';
  const J = {
    neck: [0.62, 1.72, 0],
    head: [1.04, 1.86, 0],
    fh: [0.46, 1.25, 0.2],
    fk: [0.46, 0.53, 0.2],
    hh: [-0.72, 1.32, 0.18],
    hk: [-0.86, 0.64, 0.18],
  };
  const a = -0.62,
    dx = Math.cos(a),
    dy = Math.sin(a),
    ux = dy,
    uy = -dx; // head axis and the direction "under" the face
  const HL = cow ? 1.06 : 1.0;
  const H = (t, o, z = 0) => [J.head[0] + (dx * t + ux * o) * HL, J.head[1] + (dy * t + uy * o) * HL, z];
  J.jaw = H(0.1, 0.13);
  const P = [];
  const E = (tag, bone, c, r, k, ang, sym) => P.push({ t: 'e', tag, bone, c, r, k, a: ang || 0, sym: !!sym });
  const Cp = (tag, bone, p0, p1, r0, r1, k, sym) => P.push({ t: 'c', tag, bone, p0, p1, r0, r1, k, sym: !!sym });
  const hump = cow ? 0.72 : 1,
    neckR = cow ? 0.82 : 1;
  // torso
  E('torso', 'body', [0.22, 1.5, 0], [0.6, 0.5, 0.4], 0.12);
  E('torso', 'body', [-0.38, 1.44, 0], [0.62, 0.45, 0.41], 0.15);
  E('torso', 'body', [-0.82, 1.56, 0], [0.3, 0.33, 0.31], 0.12);
  E('hump', 'body', [0.3, 1.84 + 0.04 * hump, 0], [0.46, 0.2 * hump + 0.02, 0.17], 0.14, -0.12);
  E('torso', 'body', [0.66, 1.35, 0], [0.27, 0.36, 0.3], 0.12);
  E('torso', 'body', [0.46, 1.42, 0.19], [0.3, 0.38, 0.14], 0.1, 0, true);
  E('torso', 'body', [-0.76, 1.4, 0.17], [0.3, 0.36, 0.15], 0.1, 0, true);
  E('tail', 'body', [-1.1, 1.62, 0], [0.07, 0.1, 0.05], 0.04, 0.4);
  // neck
  Cp('neck', 'neck', [0.5, 1.66, 0], [J.head[0] + 0.02, J.head[1] - 0.02, 0], 0.33 * neckR, 0.22 * neckR, 0.14);
  E('mane', 'neck', [0.8, 1.97, 0], [0.3, 0.1 * neckR, 0.08], 0.1, 0.3);
  E('neck', 'neck', [0.92, 1.62, 0], [0.18, 0.16, 0.14 * neckR], 0.1);
  // head
  E('head', 'head', H(0.08, 0.02), [0.2, 0.19, 0.16], 0.08, a);
  Cp('head', 'head', H(0.08, 0), H(0.52, 0), 0.15, 0.11, 0.06);
  E('muzzle', 'head', H(0.6, 0.03), [0.15, 0.15, cow ? 0.115 : 0.125], 0.06, a);
  E('muzzle', 'head', H(0.66, 0.11), [0.1, 0.08, 0.1], 0.05, a);
  E('head', 'head', H(0.02, -0.12), [0.12, 0.06, 0.14], 0.05, a);
  E('head', 'head', H(0.12, 0.08, 0.1), [0.14, 0.1, 0.06], 0.05, a, true);
  // jaw
  Cp('jaw', 'jaw', H(0.12, 0.14), H(0.55, 0.16), 0.09, 0.06, 0.04);
  E('jaw', 'jaw', H(0.58, 0.17), [0.06, 0.05, 0.06], 0.03);
  // bell (dewlap)
  if (kind === 'bull') {
    Cp('bell', 'neck', [0.96, 1.52, 0], [0.98, 1.2, 0], 0.07, 0.045, 0.06);
    E('bell', 'neck', [0.99, 1.13, 0], [0.06, 0.08, 0.05], 0.04);
  } else if (kind === 'cow') E('bell', 'neck', [0.96, 1.47, 0], [0.05, 0.07, 0.04], 0.05);
  // front legs
  Cp('legUp', 'fh', [0.47, 1.2, 0.2], [0.44, 0.95, 0.2], 0.15, 0.12, 0.08, true);
  Cp('legMid', 'fh', [0.44, 0.95, 0.2], [0.46, 0.55, 0.2], 0.1, 0.06, 0.04, true);
  E('legLo', 'fk', [0.46, 0.53, 0.2], [0.06, 0.06, 0.055], 0.03, 0, true);
  Cp('legLo', 'fk', [0.46, 0.52, 0.2], [0.47, 0.13, 0.2], 0.045, 0.04, 0.02, true);
  Cp('legLo', 'fk', [0.47, 0.13, 0.2], [0.51, 0.05, 0.2], 0.05, 0.045, 0.02, true);
  E('hoof', 'fk', [0.53, 0.035, 0.2], [0.075, 0.04, 0.052], 0.012, 0, true);
  // hind legs
  Cp('legUp', 'hh', [-0.74, 1.3, 0.18], [-0.66, 0.98, 0.18], 0.17, 0.11, 0.08, true);
  Cp('legMid', 'hh', [-0.66, 0.98, 0.18], [-0.85, 0.66, 0.18], 0.09, 0.055, 0.04, true);
  E('legLo', 'hk', [-0.87, 0.64, 0.18], [0.06, 0.065, 0.05], 0.03, 0, true);
  Cp('legLo', 'hk', [-0.86, 0.64, 0.18], [-0.82, 0.13, 0.18], 0.045, 0.04, 0.02, true);
  Cp('legLo', 'hk', [-0.82, 0.13, 0.18], [-0.78, 0.05, 0.18], 0.05, 0.045, 0.02, true);
  E('hoof', 'hk', [-0.76, 0.035, 0.18], [0.075, 0.04, 0.052], 0.012, 0, true);
  // bulls: a longer body. The torso stretches by BULL_LEN; the head, neck and legs move with it, unchanged.
  if (kind === 'bull') {
    const d = (x) => (BULL_LEN - 1) * clamp(x, -0.9, 0.6);
    const legX = { fh: J.fh[0], fk: J.fh[0], hh: J.hh[0], hk: J.hh[0] };
    for (const p of P) {
      const leg = /^(leg|hoof)/.test(p.tag);
      const sh = (q) => [q[0] + d(leg ? legX[p.bone] : q[0]), q[1], q[2]];
      if (p.t === 'e') {
        p.c = sh(p.c);
        if (p.tag === 'torso' || p.tag === 'hump') p.r = [p.r[0] * BULL_LEN, p.r[1], p.r[2]];
      } else {
        p.p0 = sh(p.p0);
        p.p1 = sh(p.p1);
      }
    }
    for (const k of ['neck', 'head', 'jaw']) J[k] = [J[k][0] + d(J[k][0]), J[k][1], J[k][2]];
    for (const k of ['fh', 'fk', 'hh', 'hk']) J[k] = [J[k][0] + d(legX[k]), J[k][1], J[k][2]];
  }
  // calves: leggier, body raised, smaller head
  if (calf) {
    const isLeg = (p) => /^(leg|hoof)/.test(p.tag);
    const lift = 0.26,
      LS = 1.22,
      HS = 0.82;
    const hj = J.head.slice();
    const tf = (p, leg, hd) => {
      if (leg) return [p[0], p[1] * LS, p[2]];
      let q = [p[0], p[1] + lift, p[2]];
      if (hd) {
        q = [hj[0] + (p[0] - hj[0]) * HS, hj[1] + lift + (p[1] - hj[1]) * HS, p[2] * HS];
      }
      return q;
    };
    for (const p of P) {
      const leg = isLeg(p),
        hd = /^(head|muzzle|jaw)$/.test(p.tag);
      if (p.t === 'e') {
        p.c = tf(p.c, leg, hd);
        if (hd) p.r = p.r.map((v) => v * HS);
      } else {
        p.p0 = tf(p.p0, leg, hd);
        p.p1 = tf(p.p1, leg, hd);
        if (hd) {
          p.r0 *= HS;
          p.r1 *= HS;
        }
      }
      if (!leg && !hd && p.tag !== 'bell') {
        if (p.t === 'e') p.r = [p.r[0], p.r[1] * 0.92, p.r[2] * 0.9];
        else {
          p.r0 *= 0.9;
          p.r1 *= 0.9;
        }
      }
    }
    J.fh = [J.fh[0], J.fh[1] * LS, J.fh[2]];
    J.fk = [J.fk[0], J.fk[1] * LS, J.fk[2]];
    J.hh = [J.hh[0], J.hh[1] * LS, J.hh[2]];
    J.hk = [J.hk[0], J.hk[1] * LS, J.hk[2]];
    J.neck = [J.neck[0], J.neck[1] + lift, 0];
    J.head = [hj[0], hj[1] + lift, 0];
    J.jaw = [hj[0] + (J.jaw[0] - hj[0]) * HS, hj[1] + lift + (J.jaw[1] - hj[1]) * HS, 0];
  }
  const HS2 = calf ? 0.82 : HL;
  const Hl = (t, o, z = 0) => [(dx * t + ux * o) * HS2, (dy * t + uy * o) * HS2, z]; // head-bone-local point
  for (const p of P) {
    p.cs = Math.cos(-p.a || 0);
    p.sn = Math.sin(-p.a || 0);
    let lo, hi;
    if (p.t === 'e') {
      const m = Math.max(...p.r);
      lo = p.c.map((v) => v - m);
      hi = p.c.map((v) => v + m);
    } else {
      const m = Math.max(p.r0, p.r1);
      lo = p.p0.map((v, i) => Math.min(v, p.p1[i]) - m);
      hi = p.p0.map((v, i) => Math.max(v, p.p1[i]) + m);
    }
    const k = p.k * 1.5;
    p.lo = lo.map((v) => v - k);
    p.hi = hi.map((v) => v + k);
    if (p.sym) {
      p.lo[2] = -p.hi[2];
    }
  }
  return { J, P, Hl, nose: [Hl(0.68, 0.06), Hl(1.5, 0.2)] };
}
function sdPrim(p, x, y, z) {
  if (p.sym) z = Math.abs(z);
  if (p.t === 'e') {
    let px = x - p.c[0],
      py = y - p.c[1];
    const pz = z - p.c[2];
    if (p.a) {
      const qx = px * p.cs - py * p.sn,
        qy = px * p.sn + py * p.cs;
      px = qx;
      py = qy;
    }
    const r = p.r;
    const k0 = Math.sqrt((px / r[0]) ** 2 + (py / r[1]) ** 2 + (pz / r[2]) ** 2),
      k1 = Math.sqrt((px / (r[0] * r[0])) ** 2 + (py / (r[1] * r[1])) ** 2 + (pz / (r[2] * r[2])) ** 2);
    return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(r[0], r[1], r[2]);
  }
  const ax = p.p0[0],
    ay = p.p0[1],
    az = p.p0[2],
    bx = p.p1[0] - ax,
    by = p.p1[1] - ay,
    bz = p.p1[2] - az,
    qx = x - ax,
    qy = y - ay,
    qz = z - az;
  const t = clamp((qx * bx + qy * by + qz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(qx - bx * t, qy - by * t, qz - bz * t) - (p.r0 + (p.r1 - p.r0) * t);
}
function sminK(a, b, k) {
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}
function mooseField(P, x, y, z) {
  let d = 1e9;
  for (const p of P) {
    if (x < p.lo[0] || x > p.hi[0] || y < p.lo[1] || y > p.hi[1] || z < p.lo[2] || z > p.hi[2]) continue;
    d = sminK(d, sdPrim(p, x, y, z), p.k);
  }
  return d > 1e8 ? 1 : d;
}
function buildMooseKind(kind) {
  const R = mooseRig(kind),
    P = R.P,
    h = 0.024;
  const f = (x, y, z) => mooseField(P, x, y, z);
  const x0 = -1.3,
    y0 = -0.03,
    z0 = -0.55,
    nx = Math.ceil((2.05 - x0) / h) + 1,
    ny = Math.ceil(((kind === 'calf' ? 2.6 : 2.35) - y0) / h) + 1,
    nz = Math.ceil((0.55 - z0) / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[id(i, j, k)] = f(x0 + i * h, y0 + j * h, z0 + k * h);
  // surface nets
  const cellV = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const CO = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ],
    ED = [
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [0, 2],
      [1, 3],
      [4, 6],
      [5, 7],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let m = 0;
        for (let c = 0; c < 8; c++) {
          const o = CO[c];
          cv[c] = V[id(i + o[0], j + o[1], k + o[2])];
          if (cv[c] < 0) m |= 1 << c;
        }
        if (m === 0 || m === 255) continue;
        let sx = 0,
          sy = 0,
          sz = 0,
          n = 0;
        for (const [a, b] of ED) {
          if (cv[a] < 0 === cv[b] < 0) continue;
          const t = cv[a] / (cv[a] - cv[b]);
          const A = CO[a],
            B = CO[b];
          sx += A[0] + (B[0] - A[0]) * t;
          sy += A[1] + (B[1] - A[1]) * t;
          sz += A[2] + (B[2] - A[2]) * t;
          n++;
        }
        cellV[id(i, j, k)] = pos.length / 3;
        pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
      }
  const idx = [];
  const quad = (a, b, c, d) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const v0 = V[id(i, j, k)] < 0;
        if (i < nx - 1 && V[id(i + 1, j, k)] < 0 !== v0)
          quad(cellV[id(i, j - 1, k - 1)], cellV[id(i, j, k - 1)], cellV[id(i, j, k)], cellV[id(i, j - 1, k)]);
        if (j < ny - 1 && V[id(i, j + 1, k)] < 0 !== v0)
          quad(cellV[id(i - 1, j, k - 1)], cellV[id(i, j, k - 1)], cellV[id(i, j, k)], cellV[id(i - 1, j, k)]);
        if (k < nz - 1 && V[id(i, j, k + 1)] < 0 !== v0)
          quad(cellV[id(i - 1, j - 1, k)], cellV[id(i, j - 1, k)], cellV[id(i, j, k)], cellV[id(i - 1, j, k)]);
      }
  const nv = pos.length / 3,
    nor = new Float32Array(nv * 3),
    e = h * 0.5;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3],
      y = pos[v * 3 + 1],
      z = pos[v * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z),
      gy = f(x, y + e, z) - f(x, y - e, z),
      gz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(gx, gy, gz) || 1;
    nor[v * 3] = gx / l;
    nor[v * 3 + 1] = gy / l;
    nor[v * 3 + 2] = gz / l;
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t],
      b = idx[t + 1],
      c = idx[t + 2];
    const ax = pos[b * 3] - pos[a * 3],
      ay = pos[b * 3 + 1] - pos[a * 3 + 1],
      az = pos[b * 3 + 2] - pos[a * 3 + 2],
      bx = pos[c * 3] - pos[a * 3],
      by = pos[c * 3 + 1] - pos[a * 3 + 1],
      bz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = ay * bz - az * by,
      fy = az * bx - ax * bz,
      fz = ax * by - ay * bx;
    if (
      fx * (nor[a * 3] + nor[b * 3] + nor[c * 3]) +
        fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1]) +
        fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]) <
      0
    ) {
      idx[t + 1] = c;
      idx[t + 2] = b;
    }
  }
  // skin weights + region tags from the nearest forms
  const sI = new Uint16Array(nv * 4),
    sW = new Float32Array(nv * 4),
    fur = new Float32Array(nv),
    tagOf = new Array(nv);
  const bd = new Float32Array(BONES.length);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3],
      y = pos[v * 3 + 1],
      z = pos[v * 3 + 2];
    bd.fill(1e9);
    let best = 1e9,
      bt = 'torso';
    for (const p of P) {
      const d = sdPrim(p, x, y, z);
      let bn = p.bone;
      if (bn.length === 2) bn += z >= 0 ? 'L' : 'R';
      const bi = BONES.indexOf(bn);
      if (d < bd[bi]) bd[bi] = d;
      if (d < best) {
        best = d;
        bt = p.tag;
      }
    }
    tagOf[v] = bt;
    fur[v] = FUR_LEN[bt] || 0.03;
    let dmin = 1e9;
    for (let b = 0; b < bd.length; b++) dmin = Math.min(dmin, bd[b]);
    const ws = [];
    for (let b = 0; b < bd.length; b++) {
      const w = Math.exp(-(bd[b] - dmin) / 0.028);
      if (w > 0.01) ws.push([b, w]);
    }
    ws.sort((A_, B_) => B_[1] - A_[1]);
    ws.length = Math.min(4, ws.length);
    const sum = ws.reduce((s_, q) => s_ + q[1], 0);
    for (let q = 0; q < 4; q++) {
      sI[v * 4 + q] = ws[q] ? ws[q][0] : 0;
      sW[v * 4 + q] = ws[q] ? ws[q][1] / sum : 0;
    }
  }
  const base = new THREE.BufferGeometry();
  base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  base.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  base.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sI, 4));
  base.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  base.setAttribute('aFur', new THREE.BufferAttribute(fur, 1));
  base.setIndex(idx);
  // coat variants share the shape; only the colour attribute differs
  const variants = [],
    pals = [];
  for (const pd of MOOSE_PALS[kind]) {
    const v = coatVariant(base, kind, pd, pos, nor, tagOf);
    variants.push(v.geo);
    pals.push(v.pal);
  }
  return { J: R.J, Hl: R.Hl, nose: R.nose, variants, pals, verts: nv, pos, nor, tagOf, base, byCoat: {} };
}
// paint one coat (hex colours by part: body back belly legUp leg hoof head muzzle mane) onto the shared shape
function coatVariant(base, kind, pd, pos, nor, tagOf) {
  const nv = pos.length / 3;
  const pl = {};
  for (const k in pd) pl[k] = typeof pd[k] === 'number' ? pd[k] : hexLin(pd[k]);
  const col = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3],
      y = pos[v * 3 + 1],
      z = pos[v * 3 + 2],
      ny_ = nor[v * 3 + 1],
      t = tagOf[v];
    let c;
    // grizzle: fine grey flecks (grey hairs mixed into the coat), strongest on top of the hump and fading out
    // smoothly around it, so there is no edge
    const fleck = pl.hump || pl.bell ? 0.55 + noise2(x * 31 + z * 17 + 3, y * 31 - z * 23) : 0;
    const griz = pl.hump ? (pl.humpK || 0.4) * fleck : 0;
    const humpW = griz ? smoothstep(1.6, 1.92, y) * (1 - smoothstep(0.3, 0.75, Math.abs(x - 0.33))) : 0;
    if (t === 'torso' || t === 'hump' || t === 'tail') {
      c = mix3(pl.body, pl.back, smoothstep(0.25, 0.85, ny_) * smoothstep(1.55, 1.85, y));
      c = mix3(c, pl.belly, smoothstep(-0.3, -0.8, ny_));
      if (griz) c = mix3(c, pl.hump, griz * humpW);
    } else if (t === 'neck') c = mix3(pl.body, pl.belly, smoothstep(-0.2, -0.8, ny_));
    else if (t === 'mane') c = griz ? mix3(pl.mane, pl.hump, griz * 0.5) : pl.mane;
    else if (t === 'bell') c = pl.bell ? mix3(pl.mane, pl.bell, 0.3 + 0.6 * fleck) : pl.mane;
    else if (t === 'head') c = mix3(pl.head, pl.belly, smoothstep(-0.3, -0.9, ny_) * 0.4);
    else if (t === 'muzzle') c = pl.muzzle;
    else if (t === 'jaw') c = mix3(pl.muzzle, pl.belly, 0.4);
    else if (t === 'legUp') c = pl.legUp;
    else if (t === 'legMid') {
      const fr = x > 0;
      c = mix3(pl.legUp, pl.leg, smoothstep(fr ? 0.85 : 0.95, fr ? 0.6 : 0.72, y / (kind === 'calf' ? 1.22 : 1)));
    } else if (t === 'legLo') {
      // below the knee: mid brown fading to light brown down toward the hoof
      const kn = (x > 0 ? 0.53 : 0.64) * (kind === 'calf' ? 1.22 : 1);
      c = pl.shin ? mix3(pl.leg, pl.shin, smoothstep(kn, 0.12, y)) : pl.leg;
    } else c = pl.hoof;
    const nz_ = 0.9 + 0.2 * (0.5 + noise2(x * 7.1 + z * 3.3 + 11, y * 7.1 - z * 5.2));
    col[v * 3] = c[0] * nz_;
    col[v * 3 + 1] = c[1] * nz_;
    col[v * 3 + 2] = c[2] * nz_;
  }
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'aFur']) g.setAttribute(k, base.getAttribute(k));
  g.setIndex(base.getIndex());
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  g.userData.shared = true;
  return { geo: g, pal: pl };
}
// a coat from the animal catalogue (vis.coat = { id, c: { part: '#hex' } }), painted once per coat and kept
function coatGeo(K, kind, coat) {
  return K.byCoat[coat.id] || (K.byCoat[coat.id] = coatVariant(K.base, kind, coat.c, K.pos, K.nor, K.tagOf));
}
function getMooseKind(kind) {
  return MOOSE_KINDS[kind] || (MOOSE_KINDS[kind] = buildMooseKind(kind));
}
function mooseMats() {
  if (MOOSE_BASE_MAT) return;
  MOOSE_BASE_MAT = new THREE.MeshStandardMaterial({ skinning: true, vertexColors: true, roughness: 1, metalness: 0 });
  MOOSE_BASE_MAT.onBeforeCompile = furRim;
  MOOSE_BASE_MAT.customProgramCacheKey = () => 'mooseSkinRim';
  for (let i = 1; i <= SHELL_N; i++) {
    const sh = i / SHELL_N;
    const m = new THREE.MeshStandardMaterial({ skinning: true, vertexColors: true, roughness: 1, metalness: 0 });
    m.onBeforeCompile = (s) => {
      s.uniforms.uSh = { value: sh };
      s.vertexShader = s.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uSh;\nattribute float aFur;\nvarying vec3 vObj;',
        )
        .replace(
          '#include <begin_vertex>',
          'vec3 transformed=vec3(position)+normal*(uSh*aFur);transformed.y-=aFur*0.45*uSh*uSh;vObj=position;',
        );
      s.fragmentShader = s.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uSh;\nvarying vec3 vObj;\nfloat h13(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
        )
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\nif(h13(floor(vObj*165.0))<uSh*0.93+0.04)discard;diffuseColor.rgb*=mix(0.62,1.12,uSh)+0.5*uSh*uSh;',
        );
      furRim(s);
    };
    m.customProgramCacheKey = () => 'mooseShell';
    SHELL_MATS.push(m);
  }
}
function buildMoose2(o) {
  const K = getMooseKind(o.kind);
  mooseMats();
  const vi = o.variant != null ? o.variant % K.variants.length : randi(0, K.variants.length - 1);
  let geo = K.variants[vi],
    baseMat = MOOSE_BASE_MAT,
    pal = K.pals[vi];
  if (o.coat && o.coat.c) ({ geo, pal } = coatGeo(K, o.kind, o.coat)); // the host chose this animal's coat (catalog.js)
  const J = K.J;
  if (o.refBull && REF_GEO) {
    geo = REF_GEO;
    baseMat = REF_MAT;
  }
  const root = new THREE.Group();
  const b = {};
  const mk = (name, abs, parent, pabs) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(abs[0] - (pabs ? pabs[0] : 0), abs[1] - (pabs ? pabs[1] : 0), abs[2] - (pabs ? pabs[2] : 0));
    if (parent) parent.add(bone);
    b[name] = bone;
    return bone;
  };
  mk('body', [0, 0, 0]);
  mk('neck', J.neck, b.body, [0, 0, 0]);
  mk('head', J.head, b.neck, J.neck);
  mk('jaw', J.jaw, b.head, J.head);
  for (const [n, s] of [
    ['L', 1],
    ['R', -1],
  ]) {
    const fh = [J.fh[0], J.fh[1], J.fh[2] * s],
      fk = [J.fk[0], J.fk[1], J.fk[2] * s],
      hh = [J.hh[0], J.hh[1], J.hh[2] * s],
      hk = [J.hk[0], J.hk[1], J.hk[2] * s];
    mk('fh' + n, fh, b.body, [0, 0, 0]);
    mk('fk' + n, fk, b['fh' + n], fh);
    mk('hh' + n, hh, b.body, [0, 0, 0]);
    mk('hk' + n, hk, b['hh' + n], hh);
  }
  const bones = BONES.map((n) => b[n]);
  const mesh = new THREE.SkinnedMesh(geo, baseMat);
  mesh.add(b.body);
  root.add(mesh);
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  mesh.bind(skel);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const shells = [];
  for (const m of SHELL_MATS) {
    const s = new THREE.SkinnedMesh(geo, m);
    s.bind(skel, mesh.bindMatrix);
    s.frustumCulled = false;
    root.add(s);
    shells.push(s);
  }
  // ears, eyes, bell tuft, antlers ride on the bones
  const mats = [];
  const lm = new THREE.MeshStandardMaterial({ vertexColors: true, map: T.fur, roughness: 1, metalness: 0 });
  lm.onBeforeCompile = furRim;
  lm.customProgramCacheKey = () => 'mooseRim';
  mats.push(lm);
  const _id = new THREE.Matrix4();
  const fur = (mesh_, len) => {
    const im = new THREE.InstancedMesh(mesh_.geometry, furMat(len), SHELLS);
    for (let i = 0; i < SHELLS; i++) im.setMatrixAt(i, _id);
    im.castShadow = false;
    mesh_.add(im);
    shells.push(im);
    return mesh_;
  };
  const Hl = K.Hl,
    es = o.kind === 'calf' ? 1.6 : o.kind === 'cow' ? 1.35 : 1.25;
  const ears = [];
  for (const s of [1, -1]) {
    const piv = new THREE.Group();
    const p = Hl(-0.05, -0.15, 0.11 * s);
    piv.position.set(p[0], p[1], p[2]);
    b.head.add(piv);
    const em = new THREE.Mesh(loft(EAR, { sub: 3, radial: 10, col: (t) => mix3(pal.head, pal.mane, t) }), lm);
    fur(em, 0.016);
    em.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.35, 0.6, 0.75 * s).normalize());
    em.rotateX(s * 1.1);
    em.scale.setScalar(es);
    em.castShadow = true;
    piv.add(em);
    ears.push(piv);
  }
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x0a0706, roughness: 0.12, metalness: 0 });
  mats.push(eyeM);
  const eg = new THREE.SphereGeometry(0.024, 10, 8);
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(eg, eyeM);
    const p = Hl(0.2, -0.05, 0.135 * s);
    e.position.set(p[0], p[1], p[2]);
    b.head.add(e);
  }
  let antler = null;
  if (o.antler) {
    const am = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    mats.push(am);
    antler = o.antler.ref && refAntlerReady() ? buildRefAntlers(o.antler, am) : buildAntlers(o.antler, am);
    const ar = new THREE.Group();
    const p = Hl(0.0, -0.2);
    ar.position.set(p[0], p[1], 0);
    ar.add(antler);
    b.head.add(ar);
  }
  const legs = [
    { hip: b.fhL, knee: b.fkL, front: true, walkOff: 0.25, trotOff: 0 },
    { hip: b.fhR, knee: b.fkR, front: true, walkOff: 0.75, trotOff: 0.5 },
    { hip: b.hhL, knee: b.hkL, front: false, walkOff: 0, trotOff: 0.5 },
    { hip: b.hhR, knee: b.hkR, front: false, walkOff: 0.5, trotOff: 0 },
  ];
  b.body.userData.baseY = 0;
  root.scale.setScalar(o.scale);
  return {
    root,
    body: b.body,
    neck: b.neck,
    head: b.head,
    ears,
    legs,
    bell: null,
    antler,
    mats,
    shells,
    jaw: b.jaw,
    neckBase: o.refBull ? 0.3 : 0,
    headBase: o.refBull ? -0.2 : 0,
    nose: K.nose,
    variant: vi,
  };
}
function coatPal(kind, worn) {
  // From the reference renders: bulls dark chocolate with grizzled tips; cows warmer reddish-brown with a
  // lighter grey-brown face and pale nose; calves an even reddish-tan; lower legs grey-tan on all.
  const v = rand(0.9, 1.1);
  const P = (h, k = 1) => hexLin(h, k * v);
  if (kind === 'bull')
    return {
      body: P('#2e241c'),
      back: P(worn ? '#5e554b' : '#3d3128'),
      belly: P('#1d1712'),
      leg: P('#5c554c'),
      legUp: P('#2a221b'),
      head: P(worn ? '#4a3e34' : '#33281f'),
      muzzle: P('#231b15'),
      mane: P('#1c1611'),
      hoof: P('#16120f', 0.9),
    };
  if (kind === 'cow')
    return {
      body: P('#45362a'),
      back: P('#4f3e30'),
      belly: P('#2f251c'),
      leg: P('#77706a'),
      legUp: P('#3c2f24'),
      head: P('#544538'),
      muzzle: P('#5e5046'),
      mane: P('#33281f'),
      hoof: P('#1c1813'),
    };
  return {
    body: P('#5c3e2a'),
    back: P('#62432e'),
    belly: P('#4a3022'),
    leg: P('#665244'),
    legUp: P('#5a3c2a'),
    head: P('#6e4a34'),
    muzzle: P('#4e3426'),
    mane: P('#5a3c2a'),
    hoof: P('#2a2018'),
  };
}

export {
  BONES,
  FUR_LEN,
  MOOSE_BASE_MAT,
  MOOSE_KINDS,
  MOOSE_PALS,
  SHELL_MATS,
  SHELL_N,
  buildMoose2,
  buildMooseKind,
  coatPal,
  getMooseKind,
  mooseField,
  mooseMats,
  mooseRig,
  sdPrim,
  sminK,
};
