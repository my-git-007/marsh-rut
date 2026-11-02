// models/moose-geo.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { PI, TAU, hexLin, lerp, mix3, noise2 } from '../../../shared/util.js';

/* ================= moose geometry ================= */
function catm(p0, p1, p2, p3, t) {
  const t2 = t * t,
    t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function subdiv(S, sub) {
  const out = [],
    n = S.length;
  for (let i = 0; i < n - 1; i++)
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      const a = S[Math.max(i - 1, 0)],
        b = S[i],
        c = S[i + 1],
        d = S[Math.min(i + 2, n - 1)];
      out.push(b.map((_, k) => catm(a[k], b[k], c[k], d[k], t)));
    }
  out.push(S[n - 1].slice());
  return out;
}
const _ta = new THREE.Vector3(),
  _up = new THREE.Vector3(),
  _sd = new THREE.Vector3(),
  _Z = new THREE.Vector3(0, 0, 1),
  _P = new THREE.Vector3();
function loft(S0, o = {}) {
  const S = subdiv(
    S0.map((r) => [r[0], r[1], r[2] || 0, r[3], r[4], r[5] || 0, r[6] || 0]),
    o.sub || 4,
  );
  const R = o.radial || 18,
    n = S.length,
    V = n * (R + 1);
  const pos = new Float32Array(V * 3),
    col = new Float32Array(V * 3),
    uv = new Float32Array(V * 2);
  let len = 0;
  const cum = [0];
  for (let i = 1; i < n; i++) {
    len += Math.hypot(S[i][0] - S[i - 1][0], S[i][1] - S[i - 1][1], S[i][2] - S[i - 1][2]);
    cum.push(len);
  }
  for (let i = 0; i < n; i++) {
    const a = S[Math.max(i - 1, 0)],
      b = S[Math.min(i + 1, n - 1)];
    _ta.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    _up.crossVectors(_Z, _ta).normalize();
    _sd.crossVectors(_ta, _up).normalize();
    const [cx, cy, cz, rh, rw, pk, bl] = S[i];
    for (let j = 0; j <= R; j++) {
      const ang = (j / R) * TAU + PI,
        ca = Math.cos(ang),
        sa = Math.sin(ang);
      const zf = rw * sa * (1 - pk * Math.pow(Math.max(0, ca), 3)) * (1 - bl * Math.max(0, -ca) * 0.45);
      const yf = rh * ca;
      const per = PI * (rh + rw);
      _P.set(cx, cy, cz).addScaledVector(_up, yf).addScaledVector(_sd, zf);
      const k = i * (R + 1) + j;
      pos[k * 3] = _P.x;
      pos[k * 3 + 1] = _P.y;
      pos[k * 3 + 2] = _P.z;
      uv[k * 2] = cum[i];
      uv[k * 2 + 1] = (j / R) * per;
      const c = o.col ? o.col(len ? cum[i] / len : 0, ca, sa, _P) : [0.3, 0.3, 0.3];
      const pn = 0.9 + 0.2 * (0.5 + noise2(_P.x * 6.3 + _P.z * 3.1 + 7, _P.y * 6.3 - _P.z * 4.7));
      col[k * 3] = c[0] * pn;
      col[k * 3 + 1] = c[1] * pn;
      col[k * 3 + 2] = c[2] * pn;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j,
        b = a + R + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const k0 = i * (R + 1),
      k1 = k0 + R;
    const x = nr.getX(k0) + nr.getX(k1),
      y = nr.getY(k0) + nr.getY(k1),
      z = nr.getZ(k0) + nr.getZ(k1);
    const l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(k0, x / l, y / l, z / l);
    nr.setXYZ(k1, x / l, y / l, z / l);
  }
  return g;
}
function taperTube(pts, r0, r1, colFn, radial = 8, segs = 14) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const fr = curve.computeFrenetFrames(segs, false);
  const pos = [],
    col = [],
    idx = [];
  const P = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const N = fr.normals[i],
      B = fr.binormals[i];
    const r = lerp(r0, r1, Math.pow(t, 0.9));
    const c = colFn(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * TAU;
      pos.push(
        P.x + (N.x * Math.cos(a) + B.x * Math.sin(a)) * r,
        P.y + (N.y * Math.cos(a) + B.y * Math.sin(a)) * r,
        P.z + (N.z * Math.cos(a) + B.z * Math.sin(a)) * r,
      );
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j,
        b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const ANT_BASE = hexLin('#3e3022'),
  ANT_MID = hexLin('#8e7050'),
  ANT_TIP = hexLin('#cdb994');
const antCol = (f) => (f < 0.5 ? mix3(ANT_BASE, ANT_MID, f * 2) : mix3(ANT_MID, ANT_TIP, (f - 0.5) * 2));
function palmGeo(rim, bw, thick, map, colFn) {
  const N = rim.length - 1,
    M = 9,
    pos = [],
    col = [],
    idx = [];
  const L = (N + 1) * (M + 1);
  for (const sgn of [1, -1])
    for (let k = 0; k <= N; k++)
      for (let j = 0; j <= M; j++) {
        const a = j / M;
        const bv = lerp(-bw, bw, k / N);
        const u = lerp(0, rim[k].u, a),
          v = lerp(bv, rim[k].v, a);
        const th = thick * (1 - 0.7 * a * a) * 0.5 * sgn;
        const P = map(u, v, th + Math.pow(a, 2.2) * rim[k].tip * 0.35, a);
        pos.push(P.x, P.y, P.z);
        const c = colFn(a, rim[k]);
        col.push(c[0], c[1], c[2]);
      }
  const T_ = (k, j) => k * (M + 1) + j,
    B_ = (k, j) => L + k * (M + 1) + j;
  for (let k = 0; k < N; k++)
    for (let j = 0; j < M; j++) {
      idx.push(T_(k, j), T_(k + 1, j + 1), T_(k + 1, j), T_(k, j), T_(k, j + 1), T_(k + 1, j + 1));
      idx.push(B_(k, j), B_(k + 1, j), B_(k + 1, j + 1), B_(k, j), B_(k + 1, j + 1), B_(k, j + 1));
    }
  for (let k = 0; k < N; k++) {
    const a = T_(k, M),
      b = T_(k + 1, M),
      c = B_(k + 1, M),
      d = B_(k, M);
    idx.push(a, c, b, a, d, c);
  }
  for (let j = 0; j < M; j++) {
    let a = T_(0, j),
      b = T_(0, j + 1),
      c = B_(0, j + 1),
      d = B_(0, j);
    idx.push(a, c, b, a, d, c);
    a = T_(N, j);
    b = T_(N, j + 1);
    c = B_(N, j + 1);
    d = B_(N, j);
    idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export { ANT_BASE, ANT_MID, ANT_TIP, _P, _Z, _sd, _ta, _up, antCol, catm, loft, palmGeo, subdiv, taperTube };
