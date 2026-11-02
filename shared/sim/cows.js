// A cow and her calves: they wander in, graze, walk, listen, bed, trot off, drink, and leave. Calves
// keep station on the cow and wander off to play. A cow that winds or sees a hunter close alarms and runs.
import { TAU, clamp, rand, chance, random } from '../util.js';
import { marshE, outDist, nearestPoint, WATER_PTS, off } from '../world.js';
import { Body } from './body.js';
import { coatPal } from './bullparams.js';
import { SPOT_R, randomEdge, nearestEdge, edgeAwayFrom, marshPoint } from './places.js';

export class CowGroup {
  constructor(sim, initial) {
    this.sim = sim; this.done = false; this.t = 0; this.st = 0; this.stay = rand(240, 600); this.scentT = 1; this.nervous = 0; this.sawT = 1;
    this.pers = { wary: rand(0.2, 1), restless: rand(0, 1), lazy: rand(0, 1) };
    const cs = rand(0.82, 0.86);
    this.cow = new Body(sim, 'cow', { kind: 'cow', scale: cs, seed: sim.seed(), pal: coatPal('cow'), saddle: 0.4, bellLen: rand(0.06, 0.14) }, { walk: rand(0.95, 1.15), trot: 2.9, run: 5.2 });
    this.cow.brain = this;
    const n = chance(0.55) ? (chance(0.25) ? 2 : 1) : 0; this.calves = [];
    for (let i = 0; i < n; i++) this.addCalf(cs * rand(0.5, 0.54), i);
    if (initial) { const p = marshPoint(sim, 150, 700); this.cow.place(p.x, p.z, rand(0, TAU)); this.setState('graze', rand(10, 40)); this.inMarshT = 60; }
    else {
      this.edge = randomEdge(sim, 150, 850); const h = off(this.edge, rand(50, 90)); this.cow.place(h.x, h.z, Math.atan2(this.edge.nz, -this.edge.nx));
      const t = off(this.edge, -rand(15, 40)); this.cow.goTo(t.x, t.z); this.state = 'enter'; this.inMarshT = 0;
    }
    for (const c of this.calves) c.place(this.cow.x + rand(-4, 4), this.cow.z + rand(-4, 4), this.cow.h);
    this.moanT = rand(30, 120);
  }
  addCalf(scale, i = 0) {
    const c = new Body(this.sim, 'calf', { kind: 'calf', scale, seed: this.sim.seed(), pal: coatPal('calf'), saddle: 0.3, bellLen: 0 }, { walk: 1.1, trot: 2.8, run: 5 });
    c.offA = rand(2.4, 3.8) * (i ? -1 : 1); c.offD = rand(3, 6); c.playT = rand(10, 40); this.calves.push(c); return c;
  }
  all() { return [this.cow, ...this.calves]; }
  setState(s, timer) { this.state = s; this.st = 0; if (timer != null) this.timer = timer; }
  next() {
    const c = this.cow, P = this.pers; c.grazeOn = false; c.bedOn = false; c.look = null;
    const w = [['graze', 0.4], ['walk', 0.2], ['listen', 0.12 * (0.4 + P.wary)], ['bed', this.inMarshT > 120 ? 0.1 * (0.3 + P.lazy) : 0], ['trot', 0.06 * (0.2 + P.restless)], ['drink', 0.08]];
    let r = random() * w.reduce((q, x) => q + x[1], 0), k = 'graze';
    for (const [n, v] of w) { if (r < v) { k = n; break; } r -= v; }
    if (k === 'graze') { c.grazeOn = true; this.setState('graze', rand(25, 80)); }
    else if (k === 'walk') { const p = this.spot(10, 45); c.walkSpeed = rand(0.6, 1.0); c.goTo(p.x, p.z); c.grazeOn = false; this.setState('walk', 90); }
    else if (k === 'listen') { c.alert(rand(5, 12)); const ang = rand(0, TAU); c.look = { x: c.x + Math.cos(ang) * 50, z: c.z + Math.sin(ang) * 50 }; this.setState('listen', rand(5, 14)); }
    else if (k === 'bed') { c.bedOn = true; this.setState('bed', rand(60, 140) * (0.6 + this.pers.lazy)); }
    else if (k === 'trot') { const p = this.spot(80, 220); c.goTo(p.x, p.z, 'trot'); this.setState('trot', 80); }
    else {
      const wp = nearestPoint(WATER_PTS, c.x, c.z, 240);
      if (wp) { c.walkSpeed = 1.0; c.goTo(wp.x, wp.z); this.setState('drink', 120); this.drinkAt = wp; } else { c.grazeOn = true; this.setState('graze', rand(25, 60)); }
    }
  }
  spot(a, b) {
    const c = this.cow;
    for (let i = 0; i < 20; i++) { const ang = rand(0, TAU), r = rand(a, b); const x = c.x + Math.cos(ang) * r, z = c.z + Math.sin(ang) * r; if (marshE(x, z) < -0.03 && this.sim.nearestHunter(x, z).d > 90) return { x, z }; }
    return { x: c.x, z: c.z };
  }
  update(dt) {
    const c = this.cow, G = this.sim; c.update(dt); this.t += dt; this.st += dt;
    const { h: near, d } = G.nearestHunter(c.x, c.z);
    if (this.state !== 'enter') this.inMarshT += dt; this.nervous = Math.max(0, this.nervous - dt * 0.004);
    switch (this.state) {
      case 'enter': if (c.arrived) { c.arrived = false; this.next(); } break;
      case 'graze': case 'listen': case 'bed': if (this.st > this.timer) this.next(); break;
      case 'walk': case 'trot': if (c.arrived || this.st > this.timer) { c.arrived = false; c.halt(); this.next(); } break;
      case 'drink':
        if (c.arrived && !this.drinking) { c.arrived = false; this.drinking = true; c.grazeOn = true; this.timer = this.st + rand(20, 45); }
        if (this.drinking && this.st > this.timer) { this.drinking = false; this.next(); } else if (!this.drinking && this.st > this.timer) this.next();
        break;
      case 'alert': c.grazeOn = false; c.bedOn = false; c.look = this.alarmFrom || near; c.alert(1); if (this.st > this.timer) { if (this.spooked) this.flee(); else if (this.leaving) this.leave(); else this.next(); } break;
      case 'leave': if (c.arrived || outDist(c.x, c.z) > 70) this.done = true; break;
      case 'flee': if (outDist(c.x, c.z) > 140 || this.st > 60) this.done = true; break;
    }
    if (this.t > this.stay && ['graze', 'walk', 'listen'].includes(this.state)) this.leave();
    this.moanT -= dt; if (this.moanT < 0) { this.moanT = rand(50, 160); if (chance(0.4) && !['flee', 'bed'].includes(this.state)) G.emit({ e: 'moan', id: c.id }); }
    for (const k of this.calves) {
      const ca = Math.cos(c.h + k.offA), sa = Math.sin(c.h + k.offA); const tx = c.x + ca * k.offD, tz = c.z - sa * k.offD; const dd = Math.hypot(tx - k.x, tz - k.z);
      if (dd > 2) { k.bedOn = false; k.walkSpeed = clamp(c.speed * 1.15 + dd * 0.12, 0.5, 2.2); k.goTo(tx, tz, c.run ? 'run' : dd > 12 || c.mode === 'trot' ? 'trot' : 'walk'); k.grazeOn = false; }
      else { k.bedOn = c.bedOn && c.bd > 0.5; k.grazeOn = c.grazeOn; k.look = c.look; }
      k.playT -= dt; if (k.playT < 0) { k.playT = rand(20, 60); if (this.state === 'graze' && chance(0.5)) { k.offA = rand(-2.5, 2.5); k.offD = rand(4, 14); } }
      k.update(dt);
    }
    if (['flee', 'alert', 'leave'].includes(this.state) || !near) return;
    // she may simply notice a hunter who is close, or wind one
    this.sawT -= dt;
    if (this.sawT <= 0) {
      this.sawT = 1; if (d < 45 && chance(0.12 * (0.5 + this.pers.wary))) { this.alarm(true, near); return; }
      let smelled = null, sd = 1e9;
      for (const h of G.hunters.values()) { const hd = c.distTo(h) || 1; const cosA = ((c.x - h.x) / hd) * G.wind.tx + ((c.z - h.z) / hd) * G.wind.tz; if (hd < 300 && cosA > Math.cos(0.4 + G.wind.swirl * 0.9) && hd < sd) { sd = hd; smelled = h; } }
      if (smelled) this.scentAcc = (this.scentAcc || 0) + 1; else this.scentAcc = Math.max(0, (this.scentAcc || 0) - 1);
      if (smelled && this.scentAcc >= 3 && chance(0.3 * (1 - sd / 320))) this.alarm(true, smelled);
    }
  }
  alarm(spooked, from) { this.spooked = spooked; this.leaving = !spooked; this.alarmFrom = from || this.sim.nearestHunter(this.cow.x, this.cow.z).h; for (const a of this.all()) { a.bedOn = false; a.grazeOn = false; a.look = this.alarmFrom; a.alert(4); } this.setState('alert', rand(1.5, 5)); }
  leave() { const c = this.cow; c.grazeOn = false; c.bedOn = false; c.look = null; this.setState('leave'); const e = nearestEdge(this.sim, c.x, c.z); const h = off(e, 90); c.walkSpeed = 1.1; c.goTo(h.x, h.z); }
  flee() {
    this.setState('flee'); const c = this.cow; c.grazeOn = false; c.bedOn = false; c.look = null; const F = this.alarmFrom || { x: c.x + 1, z: c.z };
    const e = edgeAwayFrom(this.sim, c.x, c.z, F.x, F.z); const t = off(e, 200); c.goTo(t.x, t.z, 'run');
    this.sim.after(rand(9, 16), () => this.sim.emit({ e: 'crash', x: t.x, z: t.z }));
  }
  heardCall(H, type, tooOften) {
    if (['flee', 'leave'].includes(this.state)) return; const d = this.cow.distTo(H); if (d > (type === 'long' ? 1400 : 380)) return;
    if (d < SPOT_R) { this.alarm(true, H); return; }
    if (tooOften && d < 450) { this.nervous += 0.45 * (0.5 + this.pers.wary); if (this.nervous > 0.9) { this.alarm(false, H); return; } }
    for (const a of this.all()) { a.look = H; a.alert(rand(2, 5)); }
    this.sim.after(rand(5, 9), () => { if (!['alert', 'flee', 'leave'].includes(this.state)) for (const a of this.all()) a.look = null; });
  }
  heardPour(H) { const d = this.cow.distTo(H); if (d < SPOT_R && !['flee', 'leave'].includes(this.state)) this.alarm(true, H); }
  dispose() { for (const a of this.all()) a.remove(); }
}
