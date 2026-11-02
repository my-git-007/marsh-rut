// How a bear, wolf, coyote or raccoon looks and moves on screen (the host decides where it goes).
import * as THREE from 'three';
import { PI, TAU, clamp, rand, withSeed } from '../../../shared/util.js';
import { WATER_Y, groundAt, marshE, outDist } from '../../../shared/world.js';
import { FLAG } from '../../../shared/sim/body.js';
import { camera, scene } from '../render/core.js';
import { CRITTERS, CRITTER_SPEC, CR_BONES, getCritterKind } from '../models/critters.js';
import { mooseMats, MOOSE_BASE_MAT, SHELL_MATS } from '../models/moose.js';
import { addRipple, TRAILS } from '../render/fx.js';
import { G, PLAYER } from '../state.js';

export class CritterView {
  constructor(id, vis) {
    this.id = id; this.kind = vis.kind; this.vis = vis; const kind = vis.kind; this.sp = CRITTER_SPEC[kind];
    const K = getCritterKind(kind); mooseMats(); const J = K.J;
    const root = new THREE.Group(), b = {};
    const mk = (name, abs, parent, pabs) => { const bone = new THREE.Bone(); bone.position.set(abs[0] - (pabs ? pabs[0] : 0), abs[1] - (pabs ? pabs[1] : 0), abs[2] - (pabs ? pabs[2] : 0)); if (parent) parent.add(bone); b[name] = bone; };
    mk('body', [0, 0, 0]); mk('neck', J.neck, b.body, [0, 0, 0]); mk('head', J.head, b.neck, J.neck); mk('tail', J.tail, b.body, [0, 0, 0]);
    for (const [n, s] of [['L', 1], ['R', -1]]) {
      const fh = [J.fh[0], J.fh[1], J.fh[2] * s], fk = [J.fk[0], J.fk[1], J.fk[2] * s], hh = [J.hh[0], J.hh[1], J.hh[2] * s], hk = [J.hk[0], J.hk[1], J.hk[2] * s];
      mk('fh' + n, fh, b.body, [0, 0, 0]); mk('fk' + n, fk, b['fh' + n], fh); mk('hh' + n, hh, b.body, [0, 0, 0]); mk('hk' + n, hk, b['hh' + n], hh);
    }
    const mesh = new THREE.SkinnedMesh(K.geo, MOOSE_BASE_MAT); mesh.add(b.body); root.add(mesh); root.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(CR_BONES.map((n) => b[n])); mesh.bind(skel); mesh.castShadow = true; mesh.frustumCulled = false;
    const shells = [];
    if (kind !== 'raccoon') for (const m of SHELL_MATS.filter((_, i) => i % 2 === 1)) { const s = new THREE.SkinnedMesh(K.geo, m); s.bind(skel, mesh.bindMatrix); s.frustumCulled = false; root.add(s); shells.push(s); }
    this.scale = vis.scale; root.scale.setScalar(this.scale); root.visible = false; scene.add(root);
    this.M = { root, b, shells, legs: [{ hip: b.fhL, knee: b.fkL, front: true, off: 0.25 }, { hip: b.fhR, knee: b.fkR, front: true, off: 0.75 }, { hip: b.hhL, knee: b.hkL, front: false, off: 0 }, { hip: b.hhR, knee: b.hkR, front: false, off: 0.5 }] };
    withSeed(vis.seed >>> 0, () => { this.phase = rand(0, 1); this.time = rand(0, 50); });
    this.x = 0; this.z = 0; this.h = 0; this.speed = 0; this.mode = 'walk'; this.forage = 0; this.forageOn = false; this.placed = false;
    CRITTERS.push(this);
  }
  dist() { return Math.hypot(this.x - PLAYER.x, this.z - PLAYER.z); }
  update(dt, st) {
    if (st) {
      this.x = st.x; this.z = st.z; this.h = st.h; this.speed = st.speed; this.mode = st.mode; this.forageOn = !!(st.flags & FLAG.forage);
      if (!this.placed) { this.placed = true; this.trailX = this.x; this.trailZ = this.z; }
    }
    if (!this.placed) return;
    const sp = this.sp, M = this.M; this.time += dt;
    const gy = groundAt(this.x, this.z); M.root.position.set(this.x, gy, this.z); M.root.rotation.y = this.h;
    const s = this.speed / this.scale, fast = s > sp.walk * 1.8; this.phase = (this.phase + (s * dt) / (sp.stride * (fast ? 1.7 : 1))) % 1;
    const amp = clamp(s / sp.walk, 0, 1); const A = fast ? 0.55 : 0.4, stp = fast ? 0.42 : 0.6;
    for (const L of M.legs) {
      const p = (this.phase + (fast ? (L.front ? (L.off < 0.5 ? 0 : 0.5) : L.off < 0.25 ? 0.5 : 0) : L.off)) % 1; let up, lo;
      if (p < stp) { const u = p / stp; up = A * (1 - 2 * u); lo = 0; } else { const u = (p - stp) / (1 - stp); up = A * (-1 + 2 * (0.5 - 0.5 * Math.cos(PI * u))); lo = Math.sin(PI * u); }
      L.hip.rotation.z = up * amp; L.knee.rotation.z = lo * amp * (L.front ? -1.1 : 0.9);
    }
    M.b.body.position.y = -0.015 * amp * Math.cos(this.phase * TAU * 2) * this.scale; M.b.body.rotation.z = (this.kind === 'bear' ? 0.03 : 0.01) * amp * Math.sin(this.phase * TAU * 2);
    this.forage += ((this.forageOn && this.speed < 0.3 ? 1 : 0) - this.forage) * Math.min(1, dt * 1.5);
    const sniff = (this.kind === 'wolf' || this.kind === 'coyote') && this.speed > 0.3 && this.speed < 2 ? 0.25 : 0;
    M.b.neck.rotation.z = -0.75 * this.forage - sniff + Math.sin(this.time * 3) * 0.06 * this.forage; M.b.head.rotation.z = -0.35 * this.forage + Math.sin(this.phase * TAU * 2) * 0.04 * amp;
    M.b.neck.rotation.y = Math.sin(this.time * 0.7) * 0.25 * (1 - this.forage) * (this.speed < 0.2 ? 1 : 0.2);
    M.b.tail.rotation.y = Math.sin(this.time * (this.kind === 'raccoon' ? 2 : 3)) * 0.15; M.b.tail.rotation.z = this.kind === 'bear' ? 0 : this.mode === 'run' ? 0.3 : -0.1;
    const vis = outDist(this.x, this.z) < 230; M.root.visible = vis;
    const szr = (this.scale * 1.5) / (Math.max(1, this.dist()) * 2 * Math.tan((camera.fov * PI) / 360)); const sv = vis && szr > 0.035;
    if (sv !== this.shellVis) { this.shellVis = sv; for (const sh of M.shells) sh.visible = sv; }
    if (gy < WATER_Y - 0.05 && this.speed > 0.3) { this.ripT = (this.ripT || 0) - dt; if (this.ripT < 0) { this.ripT = 0.6; addRipple(this.x, this.z, 0.06 * this.scale); } }
    if (this.kind === 'raccoon' && this.forage > 0.5 && Math.random() < dt * 0.8) addRipple(this.x + Math.cos(this.h) * 0.4, this.z - Math.sin(this.h) * 0.4, 0.03);   // dabbling
    if (Math.hypot(this.x - this.trailX, this.z - this.trailZ) > 2.5) { this.trailX = this.x; this.trailZ = this.z; if (marshE(this.x, this.z) < 0.01 && this.kind !== 'raccoon') TRAILS.push({ x: this.x, z: this.z, r: 0.8 * this.scale, s: 0.5, t: G.time }); }
  }
  dispose() { scene.remove(this.M.root); const i = CRITTERS.indexOf(this); if (i >= 0) CRITTERS.splice(i, 1); }
}
