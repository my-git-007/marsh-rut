// models/ref-bull.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { clamp, rand } from '../../../shared/util.js';
import { C, renderer } from '../render/core.js';
import { mkC } from '../render/textures.js';
import refTexUrl from '../../assets/reference/bull-ref-projection.jpg?url';
import refAntlerUrl from '../../assets/reference/ref-antlers.json?url';
import { antlerColFn, furRim } from './antlers.js';
import { taperTube } from './moose-geo.js';
import { getMooseKind } from './moose.js';

/* ================= the reference-sheet bull =================
   One bull built from "Bull Moose Reference Sheet.png": the sculpted bull body with the sheet's four views
   projected onto it (side view on flanks and back, front view on the face, rear view on the rump),
   blended by which way each part of the body faces; antlers built to match the sheet. */
const REFSHEET = {
  W: 1536,
  H: 1024,
  side: { nose: 882, rump: 1406, ground: 478, top: 112 },
  front: { cx: 377, ground: 1000 },
  rear: { cx: 1142, ground: 1000 },
};
let REF_IMG = null,
  REF_GEO = null,
  REF_MAT = null;
let REF_ANTLER = null;
// the sheet's coat (a JPEG) and the palms cut from it (JSON): fetched once, cached by the browser like any asset
async function loadRefAssets() {
  const img = new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = refTexUrl;
  });
  const ant = fetch(refAntlerUrl).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  [REF_IMG, REF_ANTLER] = await Promise.all([img, ant]);
}
const refAntlerReady = () => !!REF_ANTLER;
function makeRefBull() {
  if (REF_GEO || !REF_IMG) return;
  const K = getMooseKind('bull');
  const pos = K.pos,
    nor = K.nor,
    tags = K.tagOf,
    nv = pos.length / 3;
  let xmin = 1e9,
    xmax = -1e9,
    ytop = 0;
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3],
      y = pos[v * 3 + 1];
    xmin = Math.min(xmin, x);
    xmax = Math.max(xmax, x);
    if (!/head|muzzle|jaw/.test(tags[v])) ytop = Math.max(ytop, y);
  }
  const S = REFSHEET.side,
    F = REFSHEET.front,
    R = REFSHEET.rear,
    W = REFSHEET.W,
    H = REFSHEET.H;
  const sx = (S.rump - S.nose) / (xmax - xmin),
    sy = (S.ground - S.top) / ytop,
    pm = (sx + sy) / 2;
  const cv = mkC(W, H),
    g = cv.getContext('2d');
  g.drawImage(REF_IMG, 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data;
  const samp = (u, v) => {
    const X = clamp(Math.round(u), 0, W - 1),
      Y = clamp(Math.round(v), 0, H - 1),
      i = (Y * W + X) * 4;
    return [Math.pow(px[i] / 255, 2.2), Math.pow(px[i + 1] / 255, 2.2), Math.pow(px[i + 2] / 255, 2.2)];
  };
  const uvS = new Float32Array(nv * 2),
    uvF = new Float32Array(nv * 2),
    uvR = new Float32Array(nv * 2),
    wt = new Float32Array(nv * 3),
    col = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3],
      y = pos[v * 3 + 1],
      z = pos[v * 3 + 2],
      nx = nor[v * 3],
      nz = nor[v * 3 + 2],
      head = /head|muzzle|jaw/.test(tags[v]);
    const us = S.rump - (x - xmin) * sx,
      vs = S.ground - y * sy,
      uf = F.cx - z * pm,
      vf = F.ground - y * sy,
      ur = R.cx + z * pm,
      vr = R.ground - y * sy;
    uvS[v * 2] = us / W;
    uvS[v * 2 + 1] = 1 - vs / H;
    uvF[v * 2] = uf / W;
    uvF[v * 2 + 1] = 1 - vf / H;
    uvR[v * 2] = ur / W;
    uvR[v * 2 + 1] = 1 - vr / H;
    let ws = Math.pow(Math.abs(nz), 1.2) + 0.15,
      wf = head ? Math.pow(Math.max(nx, 0), 2) * 1.6 : 0,
      wr = x < -0.55 && !head ? Math.pow(Math.max(-nx, 0), 2) * 1.6 : 0;
    const sum = ws + wf + wr;
    ws /= sum;
    wf /= sum;
    wr /= sum;
    wt[v * 3] = ws;
    wt[v * 3 + 1] = wf;
    wt[v * 3 + 2] = wr;
    const a = samp(us, vs),
      b = samp(uf, vf),
      c = samp(ur, vr);
    for (let q = 0; q < 3; q++) col[v * 3 + q] = a[q] * ws + b[q] * wf + c[q] * wr;
  }
  const base = K.variants[0];
  const geo = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight', 'aFur']) geo.setAttribute(k, base.getAttribute(k));
  geo.setIndex(base.getIndex());
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uvS', new THREE.BufferAttribute(uvS, 2));
  geo.setAttribute('uvF', new THREE.BufferAttribute(uvF, 2));
  geo.setAttribute('uvR', new THREE.BufferAttribute(uvR, 2));
  geo.setAttribute('aW', new THREE.BufferAttribute(wt, 3));
  geo.computeBoundingSphere();
  REF_GEO = geo;
  const tex = new THREE.Texture(REF_IMG);
  tex.needsUpdate = true;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  REF_MAT = new THREE.MeshStandardMaterial({ skinning: true, vertexColors: true, roughness: 1, metalness: 0 });
  REF_MAT.onBeforeCompile = (sh) => {
    sh.uniforms.uRef = { value: tex };
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec2 uvS;attribute vec2 uvF;attribute vec2 uvR;attribute vec3 aW;varying vec2 vS;varying vec2 vF;varying vec2 vR;varying vec3 vW;',
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvS=uvS;vF=uvF;vR=uvR;vW=aW;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D uRef;varying vec2 vS;varying vec2 vF;varying vec2 vR;varying vec3 vW;',
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n{vec3 t=pow(texture2D(uRef,vS).rgb,vec3(2.2))*vW.x+pow(texture2D(uRef,vF).rgb,vec3(2.2))*vW.y+pow(texture2D(uRef,vR).rgb,vec3(2.2))*vW.z;diffuseColor.rgb=mix(diffuseColor.rgb,t,0.85);}',
      );
    furRim(sh);
  };
  REF_MAT.customProgramCacheKey = () => 'refBull';
}
const rgbLin = (r, g, b) => [Math.pow(r / 255, 2.2), Math.pow(g / 255, 2.2), Math.pow(b / 255, 2.2)];
function refBullAntlers() {
  return {
    ref: true,
    type: 'palm',
    butterfly: false,
    spread: 1.62,
    tines: 11,
    mass: 1.15,
    tilt: 0.22,
    cup: 1.15,
    palmW: 1.35,
    vv: [0.7, 0.95, 0],
    asym: 0.04,
    tineUp: true,
    nonTyp: false,
    broken: 0,
    blunt: false,
    col: [rgbLin(124, 89, 60), rgbLin(149, 114, 85), rgbLin(191, 157, 128)],
    points: 22,
    form: 'solid palms (reference bull)',
  };
}
function b64Bytes(b) {
  const s = atob(b),
    u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
function buildRefAntlers(P, mat) {
  // palms cut from the sheet's rear view; brow points measured off the side view
  const g = new THREE.Group();
  const col = antlerColFn(P);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const palms = [];
  for (const S of REF_ANTLER.sides) {
    const s = S.s;
    const q = new Int16Array(b64Bytes(S.pos).buffer),
      c8 = b64Bytes(S.col),
      ix = new Uint16Array(b64Bytes(S.idx).buffer);
    const pos = new Float32Array(q.length);
    for (let i = 0; i < q.length; i++) pos[i] = q[i] / 2000;
    const cl = new Float32Array(c8.length);
    for (let i = 0; i < c8.length; i++) cl[i] = Math.pow(c8[i] / 255, 2.2) * 0.85;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    geo.setIndex(new THREE.BufferAttribute(ix, 1));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    g.add(m);
    palms.push({ m, s, pos });
    const R = S.root;
    const root = V3(R[0], R[1] + 0.005, R[2]),
      burr = V3(0, 0, 0.075 * s);
    g.add(
      new THREE.Mesh(
        taperTube([burr.clone().add(V3(0, -0.02, -0.01 * s)), burr.clone().add(V3(0, 0.025, 0.02 * s))], 0.068, 0.062, () => col(0), 10, 2),
        mat,
      ),
    ); // burr
    g.add(
      new THREE.Mesh(
        taperTube(
          [burr, V3(0.005, 0.035, s * 0.17), V3(R[0] * 0.5, R[1] * 0.8, s * 0.24), root.clone().add(V3(-0.01, 0, s * 0.03))],
          0.066,
          0.058,
          (t) => col(0.12 + t * 0.15),
          10,
          10,
        ),
        mat,
      ),
    ); // beam
    // brow points: reach forward, then curl up (side view), converging slightly inward (front view)
    const B = V3(-0.01, 0.1, s * 0.235);
    const tips = [
      [0.72, 0.21, 0.31],
      [0.62, 0.29, 0.36],
      [0.47, 0.38, 0.38],
      [0.3, 0.46, 0.34],
    ];
    const curves = [];
    for (const [f, u, l] of tips) {
      const tp = V3(f + rand(-0.03, 0.03), u + rand(-0.02, 0.02), s * (l + rand(-0.02, 0.02)));
      const mid = B.clone()
        .lerp(tp, 0.5)
        .add(V3(0.02, -0.06, s * 0.05));
      const pts = [
        B.clone(),
        B.clone()
          .lerp(mid, 0.5)
          .add(V3(0, -0.01, 0)),
        mid,
        tp,
      ];
      curves.push(new THREE.CatmullRomCurve3(pts));
      g.add(
        new THREE.Mesh(
          taperTube(pts, 0.036, 0.007, (t) => col(0.3 + t * 0.65), 8, 14),
          mat,
        ),
      );
    }
    // the brow palm: webbing between the bases of the brow points
    const wp = [],
      wc = [],
      wi = [];
    const NS = 7;
    for (let k = 0; k < curves.length; k++)
      for (let j = 0; j <= NS; j++) {
        const p = curves[k].getPoint((j / NS) * 0.34);
        wp.push(p.x, p.y, p.z);
        const c = col(0.32 + (j / NS) * 0.1);
        wc.push(c[0], c[1], c[2]);
      }
    for (let k = 0; k < curves.length - 1; k++)
      for (let j = 0; j < NS; j++) {
        const a = k * (NS + 1) + j,
          b = a + 1,
          c = a + NS + 1,
          d = c + 1;
        wi.push(a, c, b, b, c, d);
      }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
    wg.setIndex(wi);
    wg.computeVertexNormals();
    g.add(new THREE.Mesh(wg, mat));
  }
  // shedding velvet hanging off the outer edge of each palm, longer on his right, as on the sheet
  const vm = new THREE.MeshStandardMaterial({ color: C('#4a2a1e'), roughness: 0.95 });
  for (const { s, pos } of palms) {
    let best = -1,
      bz = -1;
    const band = s > 0 ? [0.18, 0.3] : [0.28, 0.4];
    for (let i = 0; i < pos.length; i += 3) {
      const y = pos[i + 1];
      if (y < band[0] || y > band[1]) continue;
      const z = Math.abs(pos[i + 2]);
      if (z > bz) {
        bz = z;
        best = i;
      }
    }
    if (best < 0) continue;
    const a = V3(pos[best], pos[best + 1], pos[best + 2]);
    const L = s > 0 ? 0.38 : 0.24;
    g.add(
      new THREE.Mesh(
        taperTube(
          [
            a,
            a.clone().add(V3(0.01, -L * 0.35, s * 0.012)),
            a.clone().add(V3(-0.01, -L * 0.7, s * 0.004)),
            a.clone().add(V3(0.005, -L, 0)),
          ],
          0.011,
          0.004,
          () => [0.08, 0.025, 0.015],
          5,
          8,
        ),
        vm,
      ),
    );
  }
  g.rotation.z = -0.1; // the head is carried a little nose-up; keep the rack upright
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}
function addVelvetStrips(antler) {
  // shedding velvet hanging from the palms, as on the sheet
  const mat = new THREE.MeshStandardMaterial({ color: C('#5a3022'), roughness: 0.9 });
  let made = 0;
  antler.traverse((o) => {
    if (!o.isMesh || made >= 3) return;
    const p = o.geometry.attributes.position;
    if (p.count < 1500) return;
    for (let k = 0; k < 2 && made < 3; k++) {
      let best = null,
        bs = -1e9;
      for (let i = 0; i < p.count; i += 37) {
        const z = Math.abs(p.getZ(i)),
          y = p.getY(i);
        const sc = z * 0.6 + y * 0.4 + Math.random() * 0.15;
        if (sc > bs) {
          bs = sc;
          best = i;
        }
      }
      const a = new THREE.Vector3(p.getX(best), p.getY(best), p.getZ(best));
      const L = rand(0.22, 0.4);
      const tube = new THREE.Mesh(
        taperTube(
          [
            a,
            a.clone().add(new THREE.Vector3(rand(-0.03, 0.03), -L * 0.5, rand(-0.03, 0.03))),
            a.clone().add(new THREE.Vector3(rand(-0.05, 0.05), -L, 0)),
          ],
          0.012,
          0.004,
          () => [0.1, 0.03, 0.02],
          5,
          6,
        ),
        mat,
      );
      antler.add(tube);
      made++;
    }
  });
}
export {
  REFSHEET,
  REF_GEO,
  REF_IMG,
  REF_MAT,
  addVelvetStrips,
  b64Bytes,
  buildRefAntlers,
  loadRefAssets,
  refAntlerReady,
  makeRefBull,
  refBullAntlers,
  rgbLin,
};
