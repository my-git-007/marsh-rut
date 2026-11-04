// How a moose looks and moves on screen. The host decides where it is and what it is doing (position,
// heading, speed, gait, and posture flags in each snapshot); this builds the same-looking animal from the
// host's description (seeded, so antlers and coat match in every browser) and animates legs, head, ears,
// jaw and bell, plus splashes, ripples, trampled grass and shaking brush.
import { PI, TAU, clamp, lerp, rand, wrapA, withSeed } from '../../../shared/util.js';
import { WATER_Y, groundAt, marshE, outDist } from '../../../shared/world.js';
import { FLAG } from '../../../shared/sim/body.js';
import { camera, scene } from '../render/core.js';
import { buildMoose2 } from '../models/moose.js';
import { buildMoose, HEAD_BASE, NECK_BASE } from '../models/antlers.js';
import { makeRefBull } from '../models/ref-bull.js';
import { addRipple, addShake, vaporFrom, TRAILS, GRASS_HITS } from '../render/fx.js';
import { A_ok, playSplash, playThrash } from '../audio/audio.js';
import { ANIMALS, G, PLAYER } from '../state.js';

export class MooseView {
  constructor(id, vis) {
    this.id = id;
    this.kind = vis.kind;
    this.vis = vis;
    const o = (this.o = { ...vis, legK: vis.kind === 'calf' ? 1.28 : undefined });
    if (vis.refBull) makeRefBull();
    this.M = withSeed(vis.seed >>> 0, () => {
      try {
        return buildMoose2(o);
      } catch (err) {
        console.warn('sculpted moose failed, using simple model', err);
        return buildMoose(o);
      }
    });
    this.M.root.visible = false;
    scene.add(this.M.root);
    ANIMALS.push(this);
    this.x = 0;
    this.z = 0;
    this.h = 0;
    this.speed = 0;
    this.mode = 'walk';
    this.phase = Math.random();
    this.placed = false;
    this.grazeOn = false;
    this.g = 0;
    this.alertOn = false;
    this.al = 0;
    this.look = null;
    this.gruntT = 0;
    this.gr = 0;
    this.thrashOn = false;
    this.th = 0;
    this.bedOn = false;
    this.bd = 0;
    this.swayOn = false;
    this.sw = 0;
    this.fightOn = false;
    this.fg = 0;
    this.shuffle = 0;
    this.jw = 0;
    this.nY = 0;
    this.nP = 0;
    this.hP = 0;
    this.hY = 0;
    this.earT = [rand(1, 4), rand(1, 4)];
    this.earA = [0, 0];
    this.time = rand(0, 100);
    this.stepSide = 0;
    this.removed = false;
    this.ripT = 0;
    this.shakeT = 0;
    this.trailX = null;
    this.trailZ = null;
  }
  dist() {
    return Math.hypot(this.x - PLAYER.x, this.z - PLAYER.z);
  }
  headPos(d) {
    const s = this.o.scale * (d || 2.1);
    return { x: this.x + Math.cos(this.h) * s, z: this.z - Math.sin(this.h) * s };
  }
  grunt() {
    this.gruntT = 0.6;
    vaporFrom(this, 1);
  } // called on each grunt onset by bullGrunts()
  thrashFx(d, x, z) {
    // antlers into a bush: shake it, flatten the grass, play the raking
    addShake(x, z, 4.5, 1.0, d);
    GRASS_HITS.push({ x, z, r: 2.2, s: 1.4, t: G.time + d });
    playThrash(x, groundAt(x, z) + 1.8, z, d);
  }
  // st: { x, z, h, speed, mode, flags, look, shuffle } from the host
  update(dt, st) {
    if (st) {
      this.x = st.x;
      this.z = st.z;
      this.h = st.h;
      this.speed = st.speed;
      this.mode = st.mode;
      this.look = st.look;
      this.shuffle = st.shuffle || 0;
      const f = st.flags;
      this.grazeOn = !!(f & FLAG.graze);
      this.bedOn = !!(f & FLAG.bed);
      this.swayOn = !!(f & FLAG.sway);
      this.fightOn = !!(f & FLAG.fight);
      this.alertOn = !!(f & FLAG.alert);
      this.thrashOn = !!(f & FLAG.thrash);
      if (!this.placed) {
        this.placed = true;
        this.trailX = this.x;
        this.trailZ = this.z;
        this.bd = this.bedOn ? 1 : 0;
      }
    }
    if (!this.placed) return;
    this.time += dt;
    const M = this.M,
      o = this.o;
    const gy = groundAt(this.x, this.z);
    M.root.position.set(this.x, gy, this.z);
    M.root.rotation.y = this.h;
    // gait (shuffle animates the legs while shoving without travelling)
    const sp = Math.max(this.speed / o.scale, this.shuffle);
    const trot = sp > 2.3;
    const stride = trot ? 2.7 : 1.65;
    this.phase = (this.phase + (sp * dt) / stride) % 1;
    const ampK = clamp(sp / (trot ? 3 : 1.05), 0, 1) * (1 - this.bd);
    const A = trot ? 0.5 : 0.42;
    const stp = trot ? 0.42 : 0.62;
    this.bd += ((this.bedOn ? 1 : 0) - this.bd) * Math.min(1, dt * (this.bedOn ? 0.6 : 1.2));
    for (const L of M.legs) {
      const p = (this.phase + (trot ? L.trotOff : L.walkOff)) % 1;
      let up, lo;
      if (p < stp) {
        const u = p / stp;
        up = A * (1 - 2 * u);
        lo = 0;
      } else {
        const u = (p - stp) / (1 - stp);
        const e = 0.5 - 0.5 * Math.cos(PI * u);
        up = A * (-1 + 2 * e);
        lo = Math.sin(PI * u);
      }
      const fu = L.front ? -0.35 : 0.75,
        fl = L.front ? -2.3 : 2.4; // folded legs when bedded
      L.hip.rotation.z = lerp(up * ampK, fu, this.bd);
      L.knee.rotation.z = lerp(lo * ampK * (L.front ? -(trot ? 1.5 : 1.05) : trot ? 1.25 : 0.85), fl, this.bd);
    }
    M.body.position.y =
      M.body.userData.baseY -
      (trot ? 0.05 : 0.022) * ampK * (0.5 + 0.5 * Math.cos(this.phase * TAU * 2)) -
      this.bd * 0.95;
    M.body.rotation.z = (trot ? 0.025 : 0.012) * ampK * Math.sin(this.phase * TAU * 2) + 0.03 * this.bd;
    M.body.rotation.x = 0.012 * ampK * Math.sin(this.phase * TAU) + Math.sin(this.time * 1.1) * 0.02 * this.sw;
    // water: splashes, ripples
    if (gy < WATER_Y - 0.05) {
      if (this.speed > 0.3) {
        const s = Math.floor(this.phase * 2);
        if (s !== this.stepSide) {
          this.stepSide = s;
          if (A_ok() && this.dist() < 650) playSplash(this.x, gy, this.z, trot ? 1.6 : 0.6);
        }
      }
      this.ripT -= dt;
      if (this.ripT < 0) {
        const mv = this.speed > 0.2;
        this.ripT = mv ? (trot ? 0.35 : 0.6) : rand(1.6, 3);
        const hp = this.headPos(mv ? 1.0 : this.g > 0.5 ? 2.0 : 0.3);
        addRipple(hp.x, hp.z, mv ? (trot ? 0.2 : 0.12) : 0.05);
      }
    }
    // brush/trees pushed aside, grass trampled
    this.shakeT -= dt;
    if (this.shakeT < 0 && (this.speed > 0.3 || this.fg > 0.3)) {
      this.shakeT = 0.3;
      const hp = this.headPos(1.2);
      addShake(
        hp.x,
        hp.z,
        outDist(this.x, this.z) > 2 ? 5.5 : 3.2 * o.scale,
        0.35 + 0.4 * Math.min(1, this.speed / 3) + this.fg * 0.5,
        0.6,
      );
    }
    if (Math.hypot(this.x - this.trailX, this.z - this.trailZ) > 2.4) {
      this.trailX = this.x;
      this.trailZ = this.z;
      if (marshE(this.x, this.z) < 0.01) TRAILS.push({ x: this.x, z: this.z, r: 1.25 * o.scale, s: 0.8, t: G.time });
    }
    // pose
    this.g += ((this.grazeOn && this.speed < 0.25 ? 1 : 0) - this.g) * Math.min(1, dt * 1.1);
    this.al += ((this.alertOn ? 1 : 0) - this.al) * Math.min(1, dt * 3);
    this.gruntT -= dt;
    this.gr += ((this.gruntT > 0 ? 1 : 0) - this.gr) * Math.min(1, dt * 7);
    this.th += ((this.thrashOn ? 1 : 0) - this.th) * Math.min(1, dt * 2.5);
    this.sw += ((this.swayOn ? 1 : 0) - this.sw) * Math.min(1, dt * 1.5);
    this.fg += ((this.fightOn ? 1 : 0) - this.fg) * Math.min(1, dt * 2.5);
    let nP = 0,
      hP = 0,
      nY = 0,
      hY = 0;
    const g = this.g * (1 - this.al);
    nP = lerp(nP, -1.35, g);
    hP += 0.5 * g + Math.sin(this.time * 2.6) * 0.05 * g;
    nP += 0.2 * this.al;
    nP += 0.2 * this.gr;
    hP += 0.42 * this.gr; // grunting: chin up, mouth open
    nP += 0.25 * this.sw;
    hP += 0.2 * this.sw;
    nY += Math.sin(this.time * 1.25) * 0.38 * this.sw;
    hY += Math.sin(this.time * 1.25 - 0.5) * 0.15 * this.sw; // head-high sway
    nP -= 0.15 * this.bd;
    if (this.look) {
      const des = Math.atan2(-(this.look.z - this.z), this.look.x - this.x);
      const rel = clamp(wrapA(des - this.h), -1.3, 1.3);
      nY = nY * (1 - this.al) + rel * 0.62 * (1 - g * 0.5);
      hY = hY * (1 - this.al) + rel * 0.32;
    }
    if (this.th > 0.01) {
      nP = lerp(nP, -1.0, this.th);
      hP = lerp(hP, 0.25, this.th);
      nY += Math.sin(this.time * 8.5) * 0.42 * this.th;
      hY += Math.sin(this.time * 8.5 + 0.6) * 0.2 * this.th;
    }
    if (this.fg > 0.01) {
      nP = lerp(nP, -0.8, this.fg);
      hP = lerp(hP, -0.05, this.fg);
      nY += Math.sin(this.time * 3.1) * 0.12 * this.fg;
    }
    nP += Math.sin(this.phase * TAU * 2) * 0.035 * ampK;
    const k = Math.min(1, dt * (this.th > 0.1 || this.gr > 0.1 ? 6 : 2.8));
    this.nP += (nP - this.nP) * k;
    this.hP += (hP - this.hP) * k;
    this.nY += (nY - this.nY) * k;
    this.hY += (hY - this.hY) * k;
    M.neck.rotation.y = this.nY;
    M.neck.rotation.z = (M.neckBase != null ? M.neckBase : NECK_BASE) + this.nP;
    M.head.rotation.y = this.hY;
    M.head.rotation.z = (M.headBase != null ? M.headBase : HEAD_BASE) + this.hP;
    this.jw += (this.gr * 0.55 - this.jw) * Math.min(1, dt * 10);
    if (M.jaw) M.jaw.rotation.z = -this.jw;
    M.body.scale.y = 1 + 0.025 * this.gr * Math.sin(this.time * 9); // flanks heave with the grunt
    for (let i = 0; i < 2; i++) {
      this.earT[i] -= dt;
      if (this.earT[i] < 0) {
        this.earT[i] = rand(1.5, 6);
        this.earA[i] = rand(-0.6, 0.6);
      }
      this.earA[i] *= Math.exp(-dt * 2.5);
      const fw = this.al * 0.5 - this.gr * 0.4 - this.fg * 0.5;
      M.ears[i].rotation.set(0, this.earA[i] * 0.5 - fw * (i ? -1 : 1) * 0.4, this.earA[i] * 0.4 + fw * 0.3);
    }
    if (M.bell)
      M.bell.rotation.z =
        -this.nP * 0.6 +
        Math.sin(this.time * 1.7) * 0.04 +
        this.speed * 0.05 +
        Math.sin(this.phase * TAU * 2) * 0.06 * ampK +
        Math.sin(this.time * 1.25) * 0.1 * this.sw;
    const vis = outDist(this.x, this.z) < 230;
    M.root.visible = vis;
    const sz = (o.scale * 3) / (Math.max(1, this.dist()) * 2 * Math.tan((camera.fov * PI) / 360));
    const sv = vis && sz > 0.035;
    if (sv !== this.shellVis) {
      this.shellVis = sv;
      for (const sh of M.shells) sh.visible = sv;
    }
  }
  dispose() {
    if (this.removed) return;
    this.removed = true;
    scene.remove(this.M.root);
    this.M.root.traverse((m) => {
      if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
    });
    this.M.mats.forEach((m) => m.dispose());
    const i = ANIMALS.indexOf(this);
    if (i >= 0) ANIMALS.splice(i, 1);
  }
}
