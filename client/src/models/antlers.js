// models/antlers.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { chance, clamp, lerp, mix3, rand, randi, random, smoothstep } from '../../../shared/util.js';
import { T, mkC } from '../render/textures.js';
import { ANT_BASE, ANT_MID, ANT_TIP, loft, palmGeo, taperTube } from './moose-geo.js';

/* ================= antlers =================
   Built like the reference racks: a short heavy beam from the skull; palmate bulls carry a cupped blade
   that opens upward/forward, with points as round tapering rods that curve up from its rim (brow points
   reach forward). Young bulls carry no palm: spikes, forks, or branched "cervina" antlers. */
function antlerColFn(P) {
  const b = P.col || [ANT_BASE, ANT_MID, ANT_TIP];
  return (f) => (f < 0.5 ? mix3(b[0], b[1], f * 2) : mix3(b[1], b[2], (f - 0.5) * 2));
}
function tine(grp, mat, p0, dir, up, L, r0, curl, col, f0) {
  // a round, tapering point that curves upward
  const d = dir.clone().normalize();
  const p1 = p0
    .clone()
    .addScaledVector(d, L * 0.5)
    .addScaledVector(up, L * 0.12 * curl);
  const p2 = p0
    .clone()
    .addScaledVector(d, L)
    .addScaledVector(up, L * 0.32 * curl);
  grp.add(
    new THREE.Mesh(
      taperTube([p0, p1, p2], r0, Math.max(0.004, r0 * 0.18), (t) => col(clamp((f0 || 0.45) + t * 0.6, 0, 1)), 7, 7),
      mat,
    ),
  );
}
function buildAntlerSide(P, s, mat, grp) {
  const asym = 1 + (random() - 0.5) * 2 * P.asym;
  const spread = P.spread * asym;
  const mass = P.mass * (0.92 + random() * 0.16);
  const col = antlerColFn(P);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const UP = V3(0, 1, 0);
  const base = V3(0, 0, 0.075 * s);
  grp.add(
    new THREE.Mesh(
      taperTube(
        [base.clone().add(V3(0, -0.02, -0.01 * s)), base.clone().add(V3(0, 0.025, 0.02 * s))],
        0.045 * mass + 0.014,
        0.045 * mass + 0.008,
        () => col(0),
        10,
        2,
      ),
      mat,
    ),
  ); // burr
  if (P.type === 'spike' || P.type === 'fork' || P.type === 'cervina') {
    // no palm: a round beam sweeping up and out, with branching tines on cervina racks
    const L = spread * 0.5;
    const beamPts =
      P.type === 'cervina'
        ? [
            base,
            V3(-0.03, 0.07, s * 0.15),
            V3(-0.07, 0.2, s * (0.15 + L * 0.45)),
            V3(-0.05, 0.36, s * (0.14 + L * 0.85)),
            V3(0.02, 0.5, s * (0.12 + L * 0.95)),
          ]
        : [
            base,
            V3(-0.01, 0.08, s * 0.12),
            V3(-0.02, 0.12 + L * 0.45, s * (0.12 + L * 0.35)),
            V3(0.02, 0.16 + L * 0.95, s * (0.1 + L * 0.55)),
          ];
    const r0 = (P.type === 'cervina' ? 0.034 : 0.026) * (0.8 + mass * 0.4);
    grp.add(
      new THREE.Mesh(
        taperTube(beamPts, r0, 0.006, (t) => col(0.15 + t * 0.85), 8, 14),
        mat,
      ),
    );
    const curve = new THREE.CatmullRomCurve3(beamPts);
    if (P.type === 'fork') {
      const c = curve.getPointAt(0.55);
      tine(grp, mat, c, V3(0.6, 0.8, s * 0.1), UP, rand(0.08, 0.16), r0 * 0.6, 0.6, col, 0.5);
    }
    if (P.type === 'cervina') {
      const nT = P.tines;
      for (let i = 0; i < nT; i++) {
        const t = i === 0 ? rand(0.18, 0.26) : lerp(0.4, 0.82, (i - 0.5) / Math.max(1, nT - 1)) + rand(-0.04, 0.04);
        const c = curve.getPointAt(Math.min(0.9, t));
        const dir = i === 0 ? V3(1, 0.35, s * 0.15) : V3(rand(0.15, 0.5), 1, s * rand(0.05, 0.3));
        tine(grp, mat, c, dir, UP, rand(0.1, 0.24) * (i === 0 ? 0.8 : 1), r0 * 0.62, 0.5, col, 0.45);
      }
    }
    return;
  }
  // palmate: short heavy beam → cupped blade → rod points on its rim
  const beamEnd = V3(-0.035, 0.085 + 0.03 * mass, s * (0.15 + spread * 0.05));
  grp.add(
    new THREE.Mesh(
      taperTube([base, V3(-0.02, 0.04, s * 0.1), beamEnd], 0.05 * mass + 0.01, 0.045 * mass + 0.01, (t) => col(t * 0.2), 10, 10),
      mat,
    ),
  );
  const Uv = V3(-0.32, P.tilt * rand(0.9, 1.1), s).normalize(); // out from the skull, rising
  let Vv = P.vv ? V3(P.vv[0], P.vv[1], P.vv[2]) : V3(1, 0.35, 0);
  Vv.addScaledVector(Uv, -Vv.dot(Uv)).normalize(); // fore-aft across the blade
  let Wv = new THREE.Vector3().crossVectors(Uv, Vv);
  if (Wv.y < 0) Wv.negate(); // the cupped face opens upward
  const Ru = Math.max(0.16, (spread / 2 - Math.abs(beamEnd.z) - 0.06) / 0.86) * rand(0.95, 1.05);
  const Rvb = Ru * P.palmW * rand(0.35, 0.48),
    Rvf = Ru * P.palmW * rand(0.42, 0.58);
  const cu = Ru * 0.45,
    ru = Ru * 0.55;
  const cleft = P.butterfly ? { th: rand(0.85, 1.05), d: rand(0.45, 0.62) } : null; // split "butterfly" palm: separate brow palm
  const NN = 180,
    rim = [];
  for (let k = 0; k <= NN; k++) {
    const th = -1.7 + (3.4 * k) / NN;
    let rr = 1;
    if (cleft) rr *= 1 - cleft.d * Math.exp(-Math.pow((th - cleft.th) / 0.1, 2));
    const rv = th < 0 ? Rvb : Rvf;
    rim.push({ u: cu + Math.cos(th) * ru * rr, v: Math.sin(th) * rv * rr, tip: 0, th });
  }
  const thick = 0.026 + 0.026 * mass,
    cup = P.cup;
  const map = (u, v, w) => {
    const ww = w + cup * (Math.pow(u / Ru, 2) * 0.3 * Ru + Math.pow(v / Rvf, 2) * 0.12 * Ru);
    return V3(0, 0, 0).copy(beamEnd).addScaledVector(Uv, u).addScaledVector(Vv, v).addScaledVector(Wv, ww);
  };
  grp.add(
    new THREE.Mesh(
      palmGeo(
        rim,
        0.04 * mass + 0.012,
        thick,
        (u, v, w) => map(u, v, w),
        (a) => col(clamp(0.22 + a * 0.28, 0, 1)),
      ),
      mat,
    ),
  );
  // points: rods from the rim — along the outer and rear edge rising up and out; brow points reach forward
  const nT = Math.max(2, P.tines + randi(-1, 1));
  const thFrom = -1.25,
    thTo = P.butterfly ? 1.45 : 1.3;
  for (let i = 0; i < nT; i++) {
    let th = lerp(thFrom, thTo, (i + 0.5) / nT) + rand(-0.05, 0.05);
    if (cleft && Math.abs(th - cleft.th) < 0.12) th += 0.16;
    const rv = th < 0 ? Rvb : Rvf;
    let rr = 1;
    if (cleft) rr *= 1 - cleft.d * Math.exp(-Math.pow((th - cleft.th) / 0.1, 2));
    const u = cu + Math.cos(th) * ru * rr * 0.97,
      v = Math.sin(th) * rv * rr * 0.97;
    const p0 = map(u, v, 0);
    const outU = Math.cos(th) / ru,
      outV = Math.sin(th) / rv;
    const out = V3(0, 0, 0).addScaledVector(Uv, outU).addScaledVector(Vv, outV).normalize();
    const brow = th > 0.95;
    let dir = V3(0, 0, 0)
      .addScaledVector(Wv, brow ? 0.55 : 0.75)
      .addScaledVector(out, brow ? 0.85 : 0.7);
    if (brow) dir.addScaledVector(Vv, 0.4);
    let L = rand(0.11, 0.26) * (0.7 + mass * 0.5) * (brow ? 0.75 : 1) * (Math.abs(th) < 0.45 ? 1.15 : 1) * (P.tineK || 1);
    const broken = P.broken > 0 && chance(P.broken / nT);
    if (broken) L *= rand(0.25, 0.45);
    if (P.blunt) L *= 0.7;
    if (P.tineUp) {
      // heavy points that rise off the top of the palm and curve upward (reference bull)
      dir = V3(0, 0, 0)
        .addScaledVector(out, 0.85)
        .addScaledVector(UP, brow ? 0.25 : 0.45)
        .addScaledVector(Wv, 0.25)
        .add(V3(rand(-0.15, 0.15), rand(-0.1, 0.15), rand(-0.15, 0.15)));
      if (brow) dir.addScaledVector(Vv, 0.45);
      L = rand(0.17, 0.36) * (brow ? 0.8 : 1) * (Math.abs(th) < 0.7 ? 1.15 : 0.9);
      tine(grp, mat, p0, dir, UP, L, 0.042, rand(0.6, 1.2), col, 0.38);
      continue;
    }
    tine(grp, mat, p0, dir, UP, L, (0.024 + 0.014 * mass) * (broken ? 1.15 : 1), broken ? 0.2 : 0.7, col, 0.42);
  }
  if (P.nonTyp)
    for (let i = 0; i < randi(1, 3); i++) {
      const th = rand(-1.3, 1.4),
        u = cu + Math.cos(th) * ru * 0.6,
        v = Math.sin(th) * Rvb * 0.6;
      const p0 = map(u, v, -thick * 0.5);
      tine(grp, mat, p0, V3(rand(-0.3, 0.3), -1, s * 0.2), UP, rand(0.08, 0.18), 0.02 * mass, -0.3, col, 0.45);
    } // drop points / kickers
}
function buildAntlers(P, mat) {
  const g = new THREE.Group();
  buildAntlerSide(P, 1, mat, g);
  buildAntlerSide(P, -1, mat, g);
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}
const TORSO = [
  [-1.06, 1.55, 0, 0.005, 0.005],
  [-1.05, 1.55, 0, 0.09, 0.08],
  [-1.02, 1.53, 0, 0.19, 0.16],
  [-0.96, 1.5, 0, 0.3, 0.24],
  [-0.82, 1.47, 0, 0.4, 0.32, 0.1],
  [-0.56, 1.44, 0, 0.44, 0.35, 0.1, 0.2],
  [-0.24, 1.45, 0, 0.47, 0.38, 0.1, 0.25],
  [0.08, 1.5, 0, 0.51, 0.4, 0.2, 0.2],
  [0.36, 1.58, 0, 0.53, 0.36, 0.5],
  [0.58, 1.55, 0, 0.47, 0.29, 0.42],
  [0.75, 1.49, 0, 0.33, 0.21, 0.2],
  [0.84, 1.47, 0, 0.1, 0.08],
  [0.85, 1.47, 0, 0.005, 0.005],
];
const NECK = [
  [-0.2, 0.0, 0, 0.44, 0.29, 0.3],
  [0.04, 0.01, 0, 0.37, 0.25, 0.35],
  [0.25, -0.02, 0, 0.32, 0.21, 0.25],
  [0.45, -0.07, 0, 0.27, 0.18],
  [0.56, -0.1, 0, 0.24, 0.165],
];
const HEAD = [
  [-0.12, 0.0, 0, 0.2, 0.15],
  [0.02, -0.01, 0, 0.235, 0.16],
  [0.17, -0.01, 0, 0.215, 0.145, 0.12],
  [0.33, -0.03, 0, 0.18, 0.125],
  [0.48, -0.05, 0, 0.17, 0.118],
  [0.62, -0.07, 0, 0.19, 0.138],
  [0.72, -0.1, 0, 0.165, 0.12],
  [0.78, -0.14, 0, 0.08, 0.07],
  [0.79, -0.16, 0, 0.02, 0.02],
];
const EAR = [
  [0, 0, 0, 0.05, 0.025],
  [0.07, 0.01, 0, 0.075, 0.03],
  [0.17, 0.0, 0, 0.06, 0.022],
  [0.25, 0, 0, 0.025, 0.012],
  [0.28, 0, 0, 0.004, 0.004],
];
const FUP = [
  [0, 0.06, 0, 0.17, 0.13],
  [0.02, -0.18, 0, 0.14, 0.105],
  [0.0, -0.42, 0, 0.08, 0.065],
  [0, -0.6, 0, 0.062, 0.052],
  [0, -0.66, 0, 0.06, 0.05],
];
const FLO = [
  [0, 0.03, 0, 0.06, 0.05],
  [0, -0.04, 0, 0.05, 0.043],
  [0, -0.3, 0, 0.042, 0.036],
  [0.01, -0.42, 0, 0.05, 0.043],
  [0.03, -0.48, 0, 0.045, 0.04],
  [0.06, -0.52, 0, 0.065, 0.05],
  [0.08, -0.545, 0, 0.06, 0.05],
  [0.09, -0.555, 0, 0.01, 0.01],
];
const HUP = [
  [0, 0.06, 0, 0.22, 0.16],
  [0.06, -0.24, 0, 0.16, 0.115],
  [-0.04, -0.5, 0, 0.085, 0.062],
  [-0.13, -0.68, 0, 0.06, 0.05],
];
const HLO = [
  [0, 0.03, 0, 0.07, 0.05],
  [0.01, -0.06, 0, 0.05, 0.04],
  [0.04, -0.42, 0, 0.042, 0.036],
  [0.05, -0.52, 0, 0.05, 0.043],
  [0.07, -0.57, 0, 0.045, 0.04],
  [0.1, -0.6, 0, 0.065, 0.05],
  [0.12, -0.618, 0, 0.06, 0.05],
  [0.13, -0.625, 0, 0.01, 0.01],
];
const HEAD_BASE = -1.0,
  NECK_BASE = 0.45;
// neck carried up and forward, head angled ~35° nose-down (reference renders)
const SHELLS = 12;
const FURMATS = {};
function makeFurStrands() {
  const S = 64,
    c = mkC(S, S),
    g = c.getContext('2d'),
    im = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = Math.pow(Math.random(), 0.5) * 255;
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
    im.data[i * 4 + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
function furMat(len) {
  const key = len.toFixed(3);
  if (FURMATS[key]) return FURMATS[key];
  if (!T.strands) T.strands = makeFurStrands();
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFurLen = { value: len };
    sh.uniforms.uFurTex = { value: T.strands };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uFurLen;\nvarying float vShell;\nvarying vec2 vFurUv;')
      .replace(
        '#include <begin_vertex>',
        'vec3 transformed=vec3(position);float sh=(float(gl_InstanceID)+1.0)/' +
          SHELLS +
          '.0;vShell=sh;vFurUv=uv;transformed+=objectNormal*(sh*uFurLen);transformed.y-=uFurLen*0.5*sh*sh;',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uFurTex;\nvarying float vShell;\nvarying vec2 vFurUv;')
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\nfloat fn=texture2D(uFurTex,vFurUv*2.4).r;if(fn<vShell*0.95+0.03)discard;diffuseColor.rgb*=mix(0.6,1.12,vShell);diffuseColor.rgb+=vec3(0.012,0.009,0.006)*vShell*vShell;',
      );
  };
  const ob = m.onBeforeCompile;
  m.onBeforeCompile = (sh) => {
    ob(sh);
    furRim(sh);
  };
  m.customProgramCacheKey = () => 'fur' + key;
  FURMATS[key] = m;
  return m;
}
function furRim(sh) {
  sh.fragmentShader = sh.fragmentShader.replace(
    '#include <emissivemap_fragment>',
    '#include <emissivemap_fragment>\n{float rimF=pow(1.0-abs(dot(normalize(vNormal),normalize(vViewPosition))),2.5);totalEmissiveRadiance+=mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(0.33))),0.6)*rimF*0.16;}',
  );
}
function buildMoose(o) {
  const pal = o.pal;
  const mats = [];
  const shells = [];
  const _id = new THREE.Matrix4();
  const fur = (mesh, len) => {
    const im = new THREE.InstancedMesh(mesh.geometry, furMat(len), SHELLS);
    for (let i = 0; i < SHELLS; i++) im.setMatrixAt(i, _id);
    im.castShadow = false;
    mesh.add(im);
    shells.push(im);
    return mesh;
  };
  const HD =
    o.kind === 'bull'
      ? HEAD
      : o.kind === 'calf'
        ? HEAD.map((r) => [r[0] * 0.82, r[1] * 0.9, r[2], r[3] * 0.92, r[4] * 0.92, r[5] || 0])
        : HEAD.map((r) => [r[0] * 1.02, r[1] * 0.95, r[2], r[3] * 0.98, r[4] * 0.88, r[5] || 0]);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: T.fur, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = furRim;
  mat.customProgramCacheKey = () => 'mooseRim';
  mats.push(mat);
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const lk = (o.legK || 1) * 1.1;
  body.userData.baseY = 1.24 * (lk - 1);
  body.position.y = body.userData.baseY;
  const torso = new THREE.Mesh(
    loft(TORSO, {
      sub: 5,
      radial: 24,
      col: (t, ca) => {
        let c = mix3(pal.belly, pal.body, smoothstep(-0.8, 0.1, ca));
        c = mix3(c, pal.back, smoothstep(0.35, 1, ca) * o.saddle * smoothstep(0.2, 0.75, t));
        return c;
      },
    }),
    mat,
  );
  fur(torso, 0.045);
  body.add(torso);
  const tail = new THREE.Mesh(
    loft(
      [
        [0.03, 0.03, 0, 0.01, 0.01],
        [0, 0, 0, 0.045, 0.04],
        [-0.05, -0.05, 0, 0.04, 0.032],
        [-0.08, -0.12, 0, 0.012, 0.012],
      ],
      { sub: 3, radial: 8, col: () => pal.body },
    ),
    mat,
  );
  fur(tail, 0.05);
  tail.position.set(-1.03, 1.62, 0);
  body.add(tail);
  const neck = new THREE.Group();
  neck.rotation.order = 'YZX';
  neck.position.set(0.6, 1.86, 0);
  body.add(neck);
  neck.add(
    fur(
      new THREE.Mesh(
        loft(NECK, {
          sub: 4,
          radial: 20,
          col: (t, ca) => mix3(mix3(pal.belly, pal.body, smoothstep(-0.7, 0, ca)), pal.mane, smoothstep(0.6, 1, ca)),
        }),
        mat,
      ),
      0.08,
    ),
  );
  let bell = null;
  if (o.bellLen > 0.05) {
    const bl = o.bellLen;
    bell = new THREE.Group();
    bell.position.set(0.45, -0.3, 0);
    neck.add(bell);
    bell.add(
      fur(
        new THREE.Mesh(
          loft(
            [
              [0, 0.05, 0, 0.07, 0.04],
              [0.02, -0.1, 0, 0.06, 0.032],
              [0.03, -bl * 0.6, 0, 0.045, 0.026],
              [0.035, -bl, 0, 0.055, 0.032],
              [0.04, -bl - 0.06, 0, 0.012, 0.012],
            ],
            { sub: 3, radial: 10, col: () => pal.mane },
          ),
          mat,
        ),
        0.07,
      ),
    );
  }
  const head = new THREE.Group();
  head.rotation.order = 'YZX';
  head.position.set(0.5, -0.1, 0);
  head.rotation.z = HEAD_BASE;
  neck.add(head);
  head.add(
    fur(
      new THREE.Mesh(
        loft(HD, {
          sub: 4,
          radial: 20,
          col: (t, ca) => {
            let c = mix3(pal.head, pal.muzzle, smoothstep(0.55, 0.9, t));
            c = mix3(c, pal.belly, smoothstep(-0.3, -0.9, ca) * 0.35);
            if (t > 0.94) c = c.map((v) => v * 0.45);
            return c;
          },
        }),
        mat,
      ),
      0.018,
    ),
  );
  const eyeM = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.15, metalness: 0 });
  mats.push(eyeM);
  const eg = new THREE.SphereGeometry(0.022, 10, 8);
  for (const s of [1, -1]) {
    const e = new THREE.Mesh(eg, eyeM);
    e.position.set(0.17, 0.075, 0.122 * s);
    head.add(e);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0.3, -0.15, 0);
  head.add(jaw);
  jaw.add(
    fur(
      new THREE.Mesh(
        loft(
          [
            [0, 0, 0, 0.05, 0.07],
            [0.18, -0.02, 0, 0.05, 0.065],
            [0.36, -0.03, 0, 0.04, 0.055],
            [0.43, -0.03, 0, 0.01, 0.01],
          ],
          { sub: 3, radial: 12, col: () => mix3(pal.muzzle, pal.belly, 0.3) },
        ),
        mat,
      ),
      0.012,
    ),
  );
  const ears = [];
  for (const s of [1, -1]) {
    const piv = new THREE.Group();
    piv.position.set(-0.03, 0.15, 0.09 * s);
    head.add(piv);
    const em = new THREE.Mesh(loft(EAR, { sub: 3, radial: 10, col: (t) => mix3(pal.head, pal.mane, t) }), mat);
    fur(em, 0.016);
    em.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-0.2, 0.55, 0.8 * s).normalize());
    em.rotateX(s * 1.1);
    em.scale.setScalar(o.kind === 'calf' ? 1.55 : o.kind === 'cow' ? 1.3 : 1.2);
    piv.add(em);
    ears.push(piv);
  }
  let antler = null;
  if (o.antler) {
    const am = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
    mats.push(am);
    antler = buildAntlers(o.antler, am);
    const ar = new THREE.Group();
    ar.position.set(-0.01, 0.17, 0);
    ar.rotation.z = -(HEAD_BASE + NECK_BASE) - 0.12;
    ar.add(antler);
    head.add(ar);
  }
  const legs = [];
  const mkLeg = (front, s) => {
    const hip = new THREE.Group();
    hip.position.set(front ? 0.45 : -0.72, front ? 1.18 : 1.3, s * (front ? 0.2 : 0.19));
    body.add(hip);
    hip.scale.y = lk;
    const up = front ? FUP : HUP,
      lo = front ? FLO : HLO;
    const kp = up[up.length - 1];
    hip.add(
      fur(
        new THREE.Mesh(
          loft(up, {
            sub: 3,
            radial: 14,
            col: (t, ca, sa, P) =>
              front
                ? mix3(mix3(pal.body, pal.legUp, smoothstep(-0.05, -0.3, P.y)), pal.leg, smoothstep(-0.42, -0.62, P.y))
                : mix3(mix3(pal.body, pal.legUp, smoothstep(-0.1, -0.35, P.y)), pal.leg, smoothstep(-0.55, -0.68, P.y)),
          }),
          mat,
        ),
        0.028,
      ),
    );
    const knee = new THREE.Group();
    knee.position.set(kp[0], kp[1], 0);
    hip.add(knee);
    knee.add(
      fur(
        new THREE.Mesh(loft(lo, { sub: 3, radial: 12, col: (t, ca, sa, P) => (P.y < (front ? -0.47 : -0.54) ? pal.hoof : pal.leg) }), mat),
        0.012,
      ),
    );
    legs.push({
      hip,
      knee,
      front,
      walkOff: front ? (s > 0 ? 0.25 : 0.75) : s > 0 ? 0 : 0.5,
      trotOff: front ? (s > 0 ? 0 : 0.5) : s > 0 ? 0.5 : 0,
    });
  };
  mkLeg(true, 1);
  mkLeg(true, -1);
  mkLeg(false, 1);
  mkLeg(false, -1);
  root.scale.setScalar(o.scale);
  root.traverse((m) => {
    if (m.isMesh && !m.isInstancedMesh) {
      m.castShadow = true;
    }
  });
  return { root, body, neck, head, ears, legs, bell, antler, mats, shells, jaw };
}

export {
  EAR,
  FLO,
  FUP,
  FURMATS,
  HEAD,
  HEAD_BASE,
  HLO,
  HUP,
  NECK,
  NECK_BASE,
  SHELLS,
  TORSO,
  antlerColFn,
  buildAntlerSide,
  buildAntlers,
  buildMoose,
  furMat,
  furRim,
  makeFurStrands,
  tine,
};
