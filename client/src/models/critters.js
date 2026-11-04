// models/critters.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { clamp, hexLin, mix3, noise2, smoothstep } from '../../../shared/util.js';
import { mooseField, sdPrim } from './moose.js';
import { CRITTER_SPEC } from '../../../shared/sim/body.js';

/* ===== other wildlife: bear, wolves, coyotes, raccoon, snowshoe hare, porcupine (sculpted + skinned like the moose) =====
   Each species is sculpted once; each coat (SPECIES[kind].coats in shared/sim/catalog.js) is a colouring of it. */
const CR_BONES = ['body', 'neck', 'head', 'tail', 'fhL', 'fkL', 'fhR', 'fkR', 'hhL', 'hkL', 'hhR', 'hkR'];
const CR_FUR = {
  body: 0.05,
  neck: 0.05,
  head: 0.02,
  muzzle: 0.008,
  ear: 0.01,
  leg: 0.02,
  legLo: 0.012,
  paw: 0,
  tail: 0.06,
  mask: 0.015,
  ruff: 0.07,
  earTip: 0.004,
  quill: 0.075,
};
// shorten (L < 1) or lengthen a body along its length: the torso between xMin and xMax stretches by L; the head,
// neck and tail move with it, and each leg moves as one piece with its hip
function shorten(P, J, L, xMin, xMax) {
  const d = (x) => (L - 1) * clamp(x, xMin, xMax);
  const legX = { fh: J.fh[0], fk: J.fh[0], hh: J.hh[0], hk: J.hh[0] };
  for (const p of P) {
    const leg = p.bone in legX;
    const sh = (q) => [q[0] + d(leg ? legX[p.bone] : q[0]), q[1], q[2]];
    if (p.t === 'e') {
      p.c = sh(p.c);
      if (p.tag === 'body') p.r = [p.r[0] * L, p.r[1], p.r[2]];
    } else {
      p.p0 = sh(p.p0);
      p.p1 = sh(p.p1);
    }
  }
  for (const k in J) J[k] = [J[k][0] + d(k in legX ? legX[k] : J[k][0]), J[k][1], J[k][2]];
}
function critterRig(kind, coat) {
  const P = [];
  const E = (tag, bone, c, r, k, ang, sym) => P.push({ t: 'e', tag, bone, c, r, k, a: ang || 0, sym: !!sym });
  const Cp = (tag, bone, p0, p1, r0, r1, k, sym) => P.push({ t: 'c', tag, bone, p0, p1, r0, r1, k, sym: !!sym });
  let J, pal, bounds;
  if (kind === 'bear') {
    // American black bear: heavy, rounded, thick-legged, tan muzzle
    J = {
      neck: [0.5, 0.68, 0],
      head: [0.74, 0.66, 0],
      tail: [-0.75, 0.66, 0],
      fh: [0.35, 0.56, 0.17],
      fk: [0.36, 0.27, 0.17],
      hh: [-0.48, 0.6, 0.15],
      hk: [-0.43, 0.29, 0.15],
    };
    E('body', 'body', [0, 0.62, 0], [0.62, 0.34, 0.31], 0.15);
    E('body', 'body', [-0.45, 0.63, 0], [0.33, 0.35, 0.31], 0.15);
    E('body', 'body', [0.32, 0.72, 0], [0.3, 0.3, 0.28], 0.12);
    E('body', 'body', [0.3, 0.55, 0.15], [0.22, 0.26, 0.13], 0.1, 0, true);
    E('body', 'body', [-0.48, 0.55, 0.14], [0.24, 0.28, 0.13], 0.1, 0, true);
    Cp('neck', 'neck', [0.45, 0.7, 0], [0.76, 0.67, 0], 0.2, 0.16, 0.1);
    E('head', 'head', [0.84, 0.68, 0], [0.16, 0.14, 0.15], 0.07);
    Cp('muzzle', 'head', [0.9, 0.65, 0], [1.08, 0.61, 0], 0.085, 0.055, 0.05);
    E('muzzle', 'head', [1.09, 0.61, 0], [0.035, 0.03, 0.035], 0.02);
    E('ear', 'head', [0.8, 0.81, 0.1], [0.035, 0.045, 0.025], 0.03, 0, true);
    E('tail', 'tail', [-0.76, 0.67, 0], [0.05, 0.05, 0.04], 0.03);
    Cp('leg', 'fh', [0.35, 0.55, 0.17], [0.36, 0.27, 0.17], 0.11, 0.08, 0.06, true);
    Cp('legLo', 'fk', [0.36, 0.27, 0.17], [0.38, 0.06, 0.17], 0.075, 0.07, 0.03, true);
    E('paw', 'fk', [0.42, 0.04, 0.17], [0.1, 0.04, 0.075], 0.02, 0, true);
    Cp('leg', 'hh', [-0.48, 0.58, 0.15], [-0.42, 0.29, 0.15], 0.14, 0.09, 0.06, true);
    Cp('legLo', 'hk', [-0.42, 0.29, 0.15], [-0.47, 0.06, 0.15], 0.075, 0.07, 0.03, true);
    E('paw', 'hk', [-0.41, 0.035, 0.15], [0.12, 0.04, 0.075], 0.02, 0, true);
    shorten(P, J, 0.85, -0.55, 0.45); // a shorter, more compact body
    pal = {
      body: '#141210',
      belly: '#0f0d0c',
      head: '#191614',
      muzzle: '#8a6e50',
      ear: '#141210',
      leg: '#100e0d',
      legLo: '#0e0c0b',
      paw: '#0b0a09',
      tail: '#141210',
    };
    bounds = [-0.95, 1.25, -0.02, 1.15, -0.45, 0.45];
  } else if (kind === 'wolf' || kind === 'coyote') {
    // lean canid: deep chest, long legs, bushy tail, pointed ears
    J = {
      neck: [0.36, 0.7, 0],
      head: [0.58, 0.82, 0],
      tail: [-0.46, 0.66, 0],
      fh: [0.3, 0.52, 0.08],
      fk: [0.32, 0.27, 0.08],
      hh: [-0.32, 0.56, 0.08],
      hk: [-0.36, 0.2, 0.08],
    };
    E('body', 'body', [0.05, 0.62, 0], [0.42, 0.17, 0.14], 0.1);
    E('body', 'body', [0.28, 0.6, 0], [0.2, 0.21, 0.15], 0.1);
    E('body', 'body', [-0.33, 0.64, 0], [0.17, 0.15, 0.13], 0.1);
    Cp('ruff', 'neck', [0.32, 0.68, 0], [0.58, 0.8, 0], 0.13, 0.09, 0.08);
    E('head', 'head', [0.62, 0.82, 0], [0.1, 0.085, 0.085], 0.05);
    Cp('muzzle', 'head', [0.66, 0.8, 0], [0.85, 0.76, 0], 0.05, 0.028, 0.04);
    E('ear', 'head', [0.6, 0.92, 0.05], [0.025, 0.055, 0.018], 0.02, 0.25, true);
    Cp('tail', 'tail', [-0.46, 0.66, 0], [-0.78, 0.42, 0], 0.055, 0.04, 0.05);
    E('tail', 'tail', [-0.7, 0.48, 0], [0.09, 0.06, 0.055], 0.05, -0.6);
    Cp('leg', 'fh', [0.3, 0.52, 0.08], [0.32, 0.27, 0.08], 0.05, 0.035, 0.04, true);
    Cp('legLo', 'fk', [0.32, 0.27, 0.08], [0.33, 0.04, 0.08], 0.026, 0.022, 0.02, true);
    E('paw', 'fk', [0.35, 0.025, 0.08], [0.04, 0.022, 0.03], 0.015, 0, true);
    Cp('leg', 'hh', [-0.32, 0.56, 0.08], [-0.26, 0.33, 0.08], 0.075, 0.04, 0.05, true);
    Cp('leg', 'hh', [-0.26, 0.33, 0.08], [-0.36, 0.2, 0.08], 0.035, 0.03, 0.03, true);
    Cp('legLo', 'hk', [-0.36, 0.2, 0.08], [-0.34, 0.03, 0.08], 0.026, 0.022, 0.02, true);
    E('paw', 'hk', [-0.32, 0.02, 0.08], [0.04, 0.022, 0.03], 0.015, 0, true);
    pal =
      kind === 'wolf'
        ? {
            body: '#6a655c',
            belly: '#a8a090',
            head: '#7a7468',
            muzzle: '#a49a88',
            ear: '#4a4640',
            leg: '#8a8274',
            legLo: '#9a9284',
            paw: '#3a3632',
            tail: '#5a554c',
            ruff: '#77716a',
          }
        : {
            body: '#8a7458',
            belly: '#c4b498',
            head: '#9a8264',
            muzzle: '#c0ac8c',
            ear: '#6a5440',
            leg: '#a08866',
            legLo: '#b09a78',
            paw: '#4a3e30',
            tail: '#7a6448',
            ruff: '#9a8466',
          };
    bounds = [-0.95, 1.0, -0.02, 1.1, -0.3, 0.3];
  } else if (kind === 'rabbit') {
    // snowshoe hare: compact, long upright ears, short front legs, big hind feet
    J = {
      neck: [0.12, 0.2, 0],
      head: [0.17, 0.24, 0],
      tail: [-0.16, 0.16, 0],
      fh: [0.1, 0.13, 0.04],
      fk: [0.11, 0.06, 0.04],
      hh: [-0.1, 0.16, 0.06],
      hk: [-0.08, 0.06, 0.06],
    };
    E('body', 'body', [-0.02, 0.16, 0], [0.17, 0.1, 0.085], 0.05);
    E('body', 'body', [-0.09, 0.14, 0.05], [0.08, 0.09, 0.05], 0.04, 0, true);
    E('body', 'body', [0.08, 0.16, 0], [0.08, 0.08, 0.07], 0.04);
    Cp('neck', 'neck', [0.1, 0.18, 0], [0.17, 0.23, 0], 0.055, 0.045, 0.03);
    E('head', 'head', [0.19, 0.245, 0], [0.055, 0.045, 0.042], 0.025);
    Cp('muzzle', 'head', [0.21, 0.24, 0], [0.25, 0.225, 0], 0.03, 0.018, 0.02);
    Cp('ear', 'head', [0.17, 0.27, 0.022], [0.13, 0.37, 0.032], 0.018, 0.012, 0.012, true);
    E('earTip', 'head', [0.128, 0.372, 0.032], [0.012, 0.014, 0.008], 0.008, 0, true);
    E('tail', 'tail', [-0.19, 0.17, 0], [0.03, 0.03, 0.03], 0.02);
    Cp('leg', 'fh', [0.1, 0.13, 0.04], [0.11, 0.06, 0.04], 0.022, 0.016, 0.012, true);
    Cp('legLo', 'fk', [0.11, 0.06, 0.04], [0.12, 0.012, 0.04], 0.014, 0.012, 0.008, true);
    Cp('leg', 'hh', [-0.1, 0.16, 0.06], [-0.07, 0.07, 0.06], 0.05, 0.03, 0.02, true);
    Cp('legLo', 'hk', [-0.07, 0.07, 0.06], [-0.11, 0.016, 0.06], 0.02, 0.016, 0.01, true);
    E('paw', 'hk', [-0.03, 0.012, 0.06], [0.07, 0.012, 0.022], 0.01, 0, true);
    pal = {
      body: '#6a5640',
      belly: '#a89a86',
      head: '#6e5a44',
      muzzle: '#8a7864',
      ear: '#5a4836',
      earTip: '#1e1a16',
      leg: '#8a7a66',
      legLo: '#c8c0b2',
      paw: '#d8d2c6',
      tail: '#c8c0b2',
    };
    bounds = [-0.28, 0.32, -0.02, 0.42, -0.14, 0.14];
  } else if (kind === 'porcupine') {
    // porcupine: low and humped, a coat of quills over the back and tail, short thick legs
    J = {
      neck: [0.16, 0.2, 0],
      head: [0.22, 0.17, 0],
      tail: [-0.26, 0.17, 0],
      fh: [0.12, 0.13, 0.08],
      fk: [0.13, 0.06, 0.08],
      hh: [-0.14, 0.14, 0.08],
      hk: [-0.14, 0.06, 0.08],
    };
    E('body', 'body', [-0.02, 0.19, 0], [0.24, 0.14, 0.15], 0.08);
    E('quill', 'body', [-0.04, 0.25, 0], [0.22, 0.12, 0.15], 0.06);
    E('quill', 'body', [-0.15, 0.22, 0], [0.12, 0.11, 0.12], 0.05);
    Cp('neck', 'neck', [0.12, 0.2, 0], [0.22, 0.17, 0], 0.08, 0.06, 0.04);
    E('head', 'head', [0.24, 0.16, 0], [0.07, 0.06, 0.06], 0.03);
    Cp('muzzle', 'head', [0.27, 0.15, 0], [0.32, 0.13, 0], 0.035, 0.025, 0.02);
    E('ear', 'head', [0.22, 0.21, 0.045], [0.012, 0.012, 0.008], 0.01, 0, true);
    Cp('tail', 'tail', [-0.24, 0.17, 0], [-0.36, 0.1, 0], 0.06, 0.04, 0.03);
    Cp('leg', 'fh', [0.12, 0.13, 0.08], [0.13, 0.06, 0.08], 0.035, 0.028, 0.015, true);
    Cp('legLo', 'fk', [0.13, 0.06, 0.08], [0.14, 0.012, 0.08], 0.025, 0.022, 0.01, true);
    E('paw', 'fk', [0.16, 0.012, 0.08], [0.035, 0.012, 0.025], 0.01, 0, true);
    Cp('leg', 'hh', [-0.14, 0.14, 0.08], [-0.14, 0.06, 0.08], 0.04, 0.03, 0.015, true);
    Cp('legLo', 'hk', [-0.14, 0.06, 0.08], [-0.13, 0.012, 0.08], 0.026, 0.022, 0.01, true);
    E('paw', 'hk', [-0.11, 0.012, 0.08], [0.04, 0.012, 0.028], 0.01, 0, true);
    pal = {
      body: '#2a231c',
      belly: '#1e1914',
      head: '#262019',
      muzzle: '#151210',
      ear: '#1e1914',
      leg: '#161310',
      legLo: '#121010',
      paw: '#0e0c0a',
      tail: '#2a231c',
      quill: '#8a8070',
    };
    bounds = [-0.45, 0.4, -0.02, 0.42, -0.26, 0.26];
  } else {
    // raccoon: hunched, short-legged, black mask, ringed tail
    J = {
      neck: [0.18, 0.27, 0],
      head: [0.24, 0.25, 0],
      tail: [-0.29, 0.28, 0],
      fh: [0.12, 0.19, 0.07],
      fk: [0.13, 0.09, 0.07],
      hh: [-0.17, 0.21, 0.07],
      hk: [-0.18, 0.09, 0.07],
    };
    E('body', 'body', [0, 0.26, 0], [0.25, 0.14, 0.13], 0.08);
    E('body', 'body', [-0.15, 0.29, 0], [0.15, 0.15, 0.13], 0.08);
    E('head', 'head', [0.25, 0.25, 0], [0.08, 0.07, 0.075], 0.04);
    Cp('muzzle', 'head', [0.29, 0.24, 0], [0.37, 0.21, 0], 0.04, 0.018, 0.03);
    E('mask', 'head', [0.29, 0.26, 0.045], [0.04, 0.025, 0.03], 0.02, 0, true);
    E('ear', 'head', [0.22, 0.32, 0.05], [0.02, 0.03, 0.012], 0.015, 0, true);
    Cp('tail', 'tail', [-0.29, 0.28, 0], [-0.56, 0.2, 0], 0.05, 0.038, 0.03);
    Cp('leg', 'fh', [0.12, 0.2, 0.07], [0.13, 0.09, 0.07], 0.035, 0.028, 0.02, true);
    Cp('legLo', 'fk', [0.13, 0.09, 0.07], [0.14, 0.02, 0.07], 0.025, 0.022, 0.015, true);
    Cp('leg', 'hh', [-0.17, 0.22, 0.07], [-0.18, 0.09, 0.07], 0.045, 0.03, 0.02, true);
    Cp('legLo', 'hk', [-0.18, 0.09, 0.07], [-0.17, 0.02, 0.07], 0.025, 0.022, 0.015, true);
    pal = {
      body: '#4e4a42',
      belly: '#625c52',
      head: '#7a766c',
      muzzle: '#d0ccc2',
      ear: '#4a4640',
      leg: '#3a3632',
      legLo: '#2a2725',
      paw: '#1e1c1a',
      tail: '#7a7266',
      mask: '#161412',
    };
    bounds = [-0.7, 0.5, -0.02, 0.45, -0.22, 0.22];
  }
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
    if (p.sym) p.lo[2] = -p.hi[2];
  }
  if (coat && coat.c) pal = { ...pal, ...coat.c }; // the host chose this animal's coat (catalog.js)
  return {
    J,
    P,
    pal,
    bounds,
    h: kind === 'rabbit' ? 0.007 : kind === 'raccoon' || kind === 'porcupine' ? 0.011 : kind === 'bear' ? 0.02 : 0.016,
  };
}
const CRITTER_KINDS = {};
function buildCritterKind(kind, coat) {
  const R = critterRig(kind, coat),
    P = R.P,
    h = R.h,
    [x0, x1, y0, y1, z0, z1] = R.bounds;
  const f = (x, y, z) => mooseField(P, x, y, z);
  const nx = Math.ceil((x1 - x0) / h) + 1,
    ny = Math.ceil((y1 - y0) / h) + 1,
    nz = Math.ceil((z1 - z0) / h) + 1;
  const V = new Float32Array(nx * ny * nz);
  const id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[id(i, j, k)] = f(x0 + i * h, y0 + j * h, z0 + k * h);
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
          const A_ = CO[a],
            B_ = CO[b];
          sx += A_[0] + (B_[0] - A_[0]) * t;
          sy += A_[1] + (B_[1] - A_[1]) * t;
          sz += A_[2] + (B_[2] - A_[2]) * t;
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
        if (V[id(i + 1, j, k)] < 0 !== v0)
          quad(cellV[id(i, j - 1, k - 1)], cellV[id(i, j, k - 1)], cellV[id(i, j, k)], cellV[id(i, j - 1, k)]);
        if (V[id(i, j + 1, k)] < 0 !== v0)
          quad(cellV[id(i - 1, j, k - 1)], cellV[id(i, j, k - 1)], cellV[id(i, j, k)], cellV[id(i - 1, j, k)]);
        if (V[id(i, j, k + 1)] < 0 !== v0)
          quad(cellV[id(i - 1, j - 1, k)], cellV[id(i, j - 1, k)], cellV[id(i, j, k)], cellV[id(i - 1, j, k)]);
      }
  const nv = pos.length / 3,
    nor = new Float32Array(nv * 3),
    e = h * 0.5;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3],
      y = pos[v * 3 + 1],
      z = pos[v * 3 + 2];
    const gx = f(x + e, y, z) - f(x - e, y, z),
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
  const sI = new Uint16Array(nv * 4),
    sW = new Float32Array(nv * 4),
    fur = new Float32Array(nv),
    col = new Float32Array(nv * 3);
  const bd = new Float32Array(CR_BONES.length);
  const pal = {};
  for (const k in R.pal) pal[k] = hexLin(R.pal[k]);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3],
      y = pos[v * 3 + 1],
      z = pos[v * 3 + 2];
    bd.fill(1e9);
    let best = 1e9,
      bt = 'body';
    for (const p of P) {
      const d = sdPrim(p, x, y, z);
      let bn = p.bone;
      if (bn.length === 2) bn += z >= 0 ? 'L' : 'R';
      const bi = CR_BONES.indexOf(bn);
      if (d < bd[bi]) bd[bi] = d;
      if (d < best) {
        best = d;
        bt = p.tag;
      }
    }
    fur[v] = CR_FUR[bt] != null ? CR_FUR[bt] : 0.03;
    let dmin = 1e9;
    for (let b = 0; b < bd.length; b++) dmin = Math.min(dmin, bd[b]);
    const ws = [];
    for (let b = 0; b < bd.length; b++) {
      const w = Math.exp(-(bd[b] - dmin) / (h * 1.4));
      if (w > 0.01) ws.push([b, w]);
    }
    ws.sort((A_, B_) => B_[1] - A_[1]);
    ws.length = Math.min(4, ws.length);
    const sum = ws.reduce((s_, q) => s_ + q[1], 0);
    for (let q = 0; q < 4; q++) {
      sI[v * 4 + q] = ws[q] ? ws[q][0] : 0;
      sW[v * 4 + q] = ws[q] ? ws[q][1] / sum : 0;
    }
    const ny_ = nor[v * 3 + 1];
    let c = pal[bt] || pal.body;
    if (bt === 'body') c = mix3(pal.body, pal.belly, smoothstep(-0.2, -0.8, ny_));
    if (kind === 'raccoon' && bt === 'tail') {
      const ring = Math.sin((x + 0.29) * 55) > 0.2;
      c = ring ? pal.mask : pal.tail;
    }
    if (bt === 'quill')
      c = mix3(
        pal.body,
        pal.quill,
        smoothstep(0.1, 0.7, 0.5 + noise2(x * 70 + z * 31, y * 70 - z * 23)) * smoothstep(-0.2, 0.5, ny_),
      );
    const nz_ = 0.9 + 0.2 * (0.5 + noise2(x * 9.1 + z * 4.3 + 3, y * 9.1 - z * 6.2));
    col[v * 3] = c[0] * nz_;
    col[v * 3 + 1] = c[1] * nz_;
    col[v * 3 + 2] = c[2] * nz_;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sW, 4));
  g.setAttribute('aFur', new THREE.BufferAttribute(fur, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { J: R.J, geo: g, verts: nv };
}
// one sculpt per species and coat, built the first time it is needed
function getCritterKind(k, coat) {
  const key = k + '|' + (coat && coat.id ? coat.id : 'base');
  return CRITTER_KINDS[key] || (CRITTER_KINDS[key] = buildCritterKind(k, coat));
}
const CRITTERS = [];
export { CRITTERS, CRITTER_KINDS, CRITTER_SPEC, CR_BONES, CR_FUR, buildCritterKind, critterRig, getCritterKind };
