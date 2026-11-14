// How an animal moves over the ground: heading, speed, gait, and the few posture states the behaviour
// code needs to know about (bedded, grazing, swaying, fighting). No meshes here: each browser draws the
// animal from the snapshot the host sends (x, z, heading, speed, gait, flags, where it is looking).
import { clamp, wrapA } from '../util.js';
import { outDist, rockDetour, rockOut } from '../world.js';
import { SPECIES } from './catalog.js';

export const FLAG = { graze: 1, bed: 2, sway: 4, fight: 8, alert: 16, thrash: 32, forage: 64, quills: 128 };
export const MODES = ['walk', 'trot', 'run'];

// The rocks out in the marsh are solid: a walker heads round one that is in its way (to a point beside it), a
// target inside one moves to its edge, and anything that ends up inside one (pushed, or placed) is put back out.
// pad: the animal's half-width.
function aimPast(b, pad) {
  const t = b.target;
  const o = rockOut(t.x, t.z, pad + 0.5);
  if (o) b.target = o;
  return rockDetour(b.x, b.z, b.target.x, b.target.z, pad, 30) || b.target;
}
function keepOut(b, pad) {
  const o = rockOut(b.x, b.z, pad);
  if (o) {
    b.x = o.x;
    b.z = o.z;
  }
}

export class Body {
  // kind: bull | cow | calf ; vis: what a browser needs to build the same-looking animal (scale, coat, antlers, seed)
  constructor(sim, kind, vis, o = {}) {
    this.sim = sim;
    this.kind = kind;
    this.vis = vis;
    this.id = sim.newId();
    this.x = 0;
    this.z = 0;
    this.h = 0;
    this.speed = 0;
    this.tspeed = 0;
    this.target = null;
    this.mode = 'walk';
    this.arrived = false;
    this.walkSpeed = o.walk || 1.2;
    this.trotSpeed = o.trot || 3.0;
    this.runSpeed = o.run || 5;
    this.grazeOn = false;
    this.alertT = 0;
    this.look = null;
    this.thrashT = 0;
    this.bedOn = false;
    this.bd = 0;
    this.swayOn = false;
    this.fightOn = false;
    this.shuffle = 0;
    this.removed = false;
    sim.addBody(this);
  }
  get scale() {
    return this.vis.scale;
  }
  // half its width, for keeping out of the rocks (a moose; the smaller animals override it)
  get pad() {
    return 0.9 * (this.scale || 1);
  }
  get run() {
    return this.mode === 'run';
  }
  place(x, z, h) {
    this.x = x;
    this.z = z;
    this.h = h;
  }
  goTo(x, z, mode) {
    this.target = { x, z };
    this.mode = mode === true ? 'run' : mode || 'walk';
    this.arrived = false;
  }
  halt() {
    this.target = null;
  }
  dist() {
    return this.sim.nearestHunter(this.x, this.z).d;
  } // to the nearest hunter
  distTo(p) {
    return p ? Math.hypot(this.x - p.x, this.z - p.z) : 1e9;
  }
  alert(t) {
    this.alertT = Math.max(this.alertT, t);
  }
  headPos(d) {
    const s = this.scale * (d || 2.1);
    return { x: this.x + Math.cos(this.h) * s, z: this.z - Math.sin(this.h) * s };
  }
  thrash(d, sx, sz) {
    // antlers into the brush: the browsers shake the bush and play the raking
    this.thrashT = d;
    const hp = sx == null ? this.headPos() : { x: sx, z: sz };
    this.sim.emit({ e: 'thrash', id: this.id, x: +hp.x.toFixed(1), z: +hp.z.toFixed(1), d: +d.toFixed(1) });
  }
  facing(x, z) {
    return Math.atan2(-(z - this.z), x - this.x);
  }
  update(dt) {
    if (this.target) {
      const dx = this.target.x - this.x,
        dz = this.target.z - this.z,
        d = Math.hypot(dx, dz);
      if (d < (this.mode === 'walk' ? 1.2 : 3)) {
        this.target = null;
        this.arrived = true;
      } else {
        const aim = aimPast(this, this.pad);
        const des = Math.atan2(-(aim.z - this.z), aim.x - this.x),
          diff = wrapA(des - this.h),
          tr = (this.mode === 'run' ? 1.5 : this.mode === 'trot' ? 1.1 : 0.75) * dt;
        this.h += clamp(diff, -tr, tr);
        const face = Math.cos(diff);
        const base = this.mode === 'run' ? this.runSpeed : this.mode === 'trot' ? this.trotSpeed : this.walkSpeed;
        this.tspeed = base * clamp(face * 1.2, 0.15, 1) * (this.mode === 'walk' && d < 4 ? clamp(d / 4, 0.35, 1) : 1);
      }
    }
    if (!this.target) this.tspeed = 0;
    if (this.bd > 0.05) this.tspeed = 0;
    const acc = this.mode === 'run' ? 3.2 : this.mode === 'trot' ? 2.0 : 0.9;
    this.speed += clamp(this.tspeed - this.speed, -acc * 1.8 * dt, acc * dt);
    if (this.speed < 0.001) this.speed = 0;
    this.x += Math.cos(this.h) * this.speed * dt;
    this.z -= Math.sin(this.h) * this.speed * dt;
    keepOut(this, this.pad);
    this.bd += ((this.bedOn ? 1 : 0) - this.bd) * Math.min(1, dt * (this.bedOn ? 0.6 : 1.2));
    this.alertT -= dt;
    this.thrashT -= dt;
  }
  flags() {
    return (
      (this.grazeOn ? FLAG.graze : 0) |
      (this.bedOn ? FLAG.bed : 0) |
      (this.swayOn ? FLAG.sway : 0) |
      (this.fightOn ? FLAG.fight : 0) |
      (this.alertT > 0 ? FLAG.alert : 0) |
      (this.thrashT > 0 ? FLAG.thrash : 0) |
      (this.forageOn ? FLAG.forage : 0) |
      (this.quillsOn ? FLAG.quills : 0)
    );
  }
  visible() {
    return outDist(this.x, this.z) < 230;
  }
  remove() {
    if (this.removed) return;
    this.removed = true;
    this.sim.removeBody(this);
  }
}

// Bears, wolves, coyotes, raccoons, hares and porcupines move a little differently (quicker turns, harder starts).
// Speeds and strides come from SPECIES[kind].move in catalog.js.
export const CRITTER_SPEC = Object.fromEntries(
  Object.entries(SPECIES).map(([k, S]) => [k, { ...S.move, forage: !!S.forage }]),
);
export class CritterBody extends Body {
  constructor(sim, kind, vis) {
    super(sim, kind, vis);
    this.sp = CRITTER_SPEC[kind];
    this.forage = 0;
    this.forageOn = false;
  }
  get pad() {
    return this.kind === 'bear' ? 0.7 : 0.4;
  }
  update(dt) {
    const sp = this.sp;
    let ts = 0;
    if (this.target) {
      const dx = this.target.x - this.x,
        dz = this.target.z - this.z,
        d = Math.hypot(dx, dz);
      if (d < 1) {
        this.target = null;
        this.arrived = true;
      } else {
        const aim = aimPast(this, this.pad);
        const des = Math.atan2(-(aim.z - this.z), aim.x - this.x),
          diff = wrapA(des - this.h),
          tr = (sp.turn || 1.4) * (this.mode === 'run' ? 1.2 : 1) * dt;
        this.h += clamp(diff, -tr, tr);
        ts =
          (this.mode === 'run' ? sp.run : this.mode === 'trot' ? sp.trot : sp.walk) *
          clamp(Math.cos(diff) * 1.2, 0.2, 1);
      }
    }
    this.speed += clamp(ts - this.speed, -4 * dt, (this.mode === 'run' ? 5 : 1.5) * dt);
    if (this.speed < 0.01) this.speed = 0;
    this.x += Math.cos(this.h) * this.speed * dt;
    this.z -= Math.sin(this.h) * this.speed * dt;
    keepOut(this, this.pad);
    this.forage += ((this.forageOn && this.speed < 0.3 ? 1 : 0) - this.forage) * Math.min(1, dt * 1.5);
    this.alertT -= dt;
  }
}
