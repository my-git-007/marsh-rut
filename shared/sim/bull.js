// A bull's behaviour: out in the timber, drawn in by calls, stepping out at the edge, holding and
// displaying, approaching in legs, circling downwind, winding a hunter, sparring with another bull.
// Each bull keeps a "focus": the hunter whose calling is drawing him. Any hunter can still spook him.
// The rut: a bull that sees a cow (or hears one bellow) goes to her instead — a cow with a calf keeps him at a
// distance, a lone cow welcomes an older bull and gets fed up with a young one (see cows.js). Predators: small
// bulls run, big bulls stand their ground (ecology.js + REACT in catalog.js).
import { clamp, lerp, rand, randi, chance, wrapA } from '../util.js';
import { outDist, nearestPoint, SHRUB_PTS, off } from '../world.js';
import { Body } from './body.js';
import { makeBullParams, refBullAntlers, BULL_CLASSES } from './bullparams.js';
import { threat, distB } from './ecology.js';
import { SPOT_R, bullEdge, nearestEdge, edgeAwayFrom } from './places.js';

const MARSH_STATES = new Set(['hold', 'approach', 'close', 'toShrub', 'court', 'standoff']);
export class Bull {
  constructor(sim, opt = {}) {
    this.sim = sim; const p = this.p = makeBullParams(opt);
    if (opt.refBull) { p.cls = BULL_CLASSES[4]; p.tier = 4; p.ant = refBullAntlers(); p.scale = 1.08; p.style = 'swagger'; p.worn = false; p.reply = 0.8; p.voice.rate = 0.9; p.spreadIn = Math.round(p.ant.spread * 39.37); p.points = p.ant.points; }
    const vis = { kind: 'bull', type: p.typeId, tier: p.tier, scale: p.scale, seed: sim.seed(), antler: p.ant, refBull: !!opt.refBull, coat: p.coat, pal: p.pal, saddle: p.worn ? 1 : rand(0.2, 0.9), bellLen: p.bellLen };
    this.a = new Body(sim, 'bull', vis, { walk: p.scale * (p.style === 'cautious' ? rand(0.85, 1.05) : rand(1.15, 1.45)), trot: 3.1 * p.scale, run: 5.6 });
    this.a.brain = this; this.a.eco = { role: p.cls.role, sp: 'moose' }; this.id = this.a.id; this.cowGoal = null;
    this.size = p.scale * (0.7 + p.ant.spread * 0.3);
    this.focus = opt.focus || sim.pickHunter();
    this.edge = bullEdge(sim, opt.avoid, this.focus); this.home = off(this.edge, rand(110, 190));
    this.a.place(this.home.x, this.home.z, Math.atan2(this.edge.nz, -this.edge.nx));
    this.state = 'distant'; this.t = 0; this.st = 0; this.interest = opt.interest != null ? opt.interest : rand(0, 0.18); this.susp = 0;
    this.thrashT = rand(6, 30); this.gruntT = rand(25, 80); this.wanderT = rand(5, 20);
    this.spont = rand(60, 170); this.scentT = 1; this.timer = 0; this.done = false; this.reason = ''; this.everSeen = false; this.second = !!opt.second;
    this.dispT = 0; this.resumeAt = 0; this.rival = null; this.showcase = false;
  }
  // the hunter he is working toward (falls back to whoever is nearest if that hunter has left)
  hunter() { const f = this.focus; if (f && this.sim.hunters.has(f.id)) return f; const n = this.sim.nearestHunter(this.a.x, this.a.z).h; this.focus = n; return n; }
  d() { const h = this.hunter(); return h ? this.a.distTo(h) : 1e9; }
  get G() { return this.sim; }
  setState(s) { this.state = s; this.st = 0; }
  grunts(n) { this.sim.emit({ e: 'grunts', id: this.a.id, n, rate: +this.p.voice.rate.toFixed(3), vol: this.p.voice.vol, seed: this.sim.seed() }); }
  inMarsh() { return MARSH_STATES.has(this.state) || (this.state === 'toCow' && (outDist(this.a.x, this.a.z) < 0 || (this.cowGoal && distB(this.a, this.cowGoal.cow) < 80))); }
  holdTime() { const s = this.p.style; return s === 'charger' ? rand(6, 15) : s === 'cautious' ? rand(20, 45) : rand(10, 25); }
  hold(t) { const a = this.a; a.halt(); a.swayOn = false; const tt = t || this.holdTime(); this.holdUntil = this.sim.time + tt; this.hangupAt = this.sim.time + tt + rand(40, 90); this.dispT = rand(1, 3); this.setState('hold'); }
  display() {
    const a = this.a, s = this.p.style; a.grazeOn = false;
    const w = [['grunt', s === 'silent' ? 0.05 : 0.32], ['sway', s === 'swagger' ? 0.35 : s === 'charger' ? 0.15 : 0.08], ['thrash', s === 'charger' ? 0.35 : s === 'swagger' ? 0.2 : 0.1], ['look', 0.22], ['browse', s === 'cautious' ? 0.3 : 0.12]];
    let r = Math.random() * w.reduce((q, x) => q + x[1], 0), k = 'look';
    for (const [n, v] of w) { if (r < v) { k = n; break; } r -= v; }
    if (k === 'grunt') { a.look = this.hunter(); this.grunts(randi(2, 5)); this.dispT = rand(6, 10); }
    else if (k === 'sway') { a.swayOn = true; a.look = null; this.dispT = rand(6, 14); this.sim.after(this.dispT * 0.9, () => { a.swayOn = false; }); if (s !== 'silent' && chance(0.5)) this.grunts(randi(1, 3)); }
    else if (k === 'thrash') {
      const sh = nearestPoint(SHRUB_PTS, a.x, a.z, 28);
      if (sh && this.state === 'hold' && !this.shrubbed) { this.shrubbed = true; this.shrub = sh; a.goTo(sh.x + rand(-1, 1), sh.z + rand(-1, 1)); this.setState('toShrub'); }
      else { a.thrash(rand(4, 8)); this.dispT = rand(6, 10); }
    }
    else if (k === 'look') { a.look = this.hunter(); a.alert(rand(2, 5)); this.dispT = rand(4, 8); }
    else { a.grazeOn = true; this.dispT = rand(8, 16); }
  }
  update(dt) {
    const a = this.a, G = this.sim; a.update(dt); this.t += dt; this.st += dt;
    this.interest = Math.max(0, this.interest - dt * (this.state === 'distant' ? 0.0015 : 0.0035)); this.susp = Math.max(0, this.susp - dt * 0.005);
    const d = this.d();
    switch (this.state) {
      case 'distant':
        this.wanderT -= dt; if (this.wanderT <= 0 && !a.target) { this.wanderT = rand(15, 45); a.walkSpeed = 0.6; a.goTo(this.home.x + rand(-35, 35), this.home.z + rand(-35, 35)); }
        this.thrashT -= dt; if (this.thrashT <= 0) { this.thrashT = rand(35, 95); if (chance(this.p.style === 'charger' ? 0.85 : 0.6)) a.thrash(rand(6, 14)); }
        this.gruntT -= dt; if (this.gruntT <= 0) { this.gruntT = rand(50, 140); if (chance(0.3 * this.p.reply + 0.05)) this.grunts(randi(2, 5)); }
        this.spont -= dt;
        if (this.interest > this.p.comeThr || (this.spont <= 0 && chance(0.7))) {
          this.spontaneous = this.interest <= this.p.comeThr; a.walkSpeed = this.p.scale * rand(1.1, 1.35); const tp = off(this.edge, 13);
          a.goTo(tp.x, tp.z, this.p.style === 'charger' && chance(0.5) ? 'trot' : 'walk'); this.gruntT = rand(8, 25); this.setState('coming');
        } else if (this.spont <= 0) { this.spont = rand(120, 260); }
        if (this.t > 900 && this.interest < 0.1) { this.done = true; this.reason = 'wandered off'; }
        break;
      case 'coming':
        this.gruntT -= dt; if (this.gruntT <= 0) { this.gruntT = rand(20, 50); if (chance(this.p.reply * 0.65)) this.grunts(randi(2, 4)); }
        if (chance(dt * 0.06)) G.emit({ e: 'crack', x: a.x, z: a.z, v: 0.6 });
        if (chance(dt * 0.08)) G.emit({ e: 'brush', x: a.x, z: a.z, len: rand(2, 4), gain: 1.5 });
        if (a.arrived) { a.arrived = false; a.look = this.hunter(); this.timer = rand(5, 22); this.setState('timber'); }
        break;
      case 'timber':
        if (this.st > this.timer) {
          const tp = off(this.edge, -rand(30, 70)); a.walkSpeed = this.p.scale * 0.9; a.goTo(tp.x, tp.z, this.p.style === 'charger' && chance(0.4) ? 'trot' : 'walk'); a.look = null;
          G.emit({ e: 'brush', x: a.x, z: a.z, len: rand(3, 5), gain: 2.2 }); this.setState('stepout');
        }
        break;
      case 'stepout':
        if (a.arrived) { a.arrived = false; this.everSeen = true; a.look = this.spontaneous ? null : this.hunter(); this.hold(rand(25, 60)); if (chance(this.p.reply)) this.grunts(randi(2, 4)); }
        break;
      case 'hold': { // stopped in the open: displays; a call now is what moves him
        this.dispT -= dt; if (this.dispT <= 0) this.display();
        if (this.resumeAt && G.time > this.resumeAt) { this.resumeAt = 0; this.approach(); break; }
        if (G.time > this.holdUntil && this.interest > 0.85 && this.susp < 0.5) { this.approach(); break; }
        if (G.time > this.hangupAt && !this.showcase) {
          if (this.interest < 0.3 || this.susp > 0.8) this.leave('hung up, then lost interest');
          else { this.hangupAt = G.time + rand(30, 60); if (this.interest > 0.5 && chance(0.5)) this.approach(); }
        }
        break;
      }
      case 'toShrub':
        if (a.arrived || this.st > 25) { a.arrived = false; a.halt(); const sh = this.shrub; if (sh) a.h = a.facing(sh.x, sh.z); a.thrash(rand(6, 12), sh ? sh.x : undefined, sh ? sh.z : undefined); this.setState('hold'); this.dispT = rand(12, 18); }
        break;
      case 'approach':
        if (this.p.style === 'swagger') a.swayOn = Math.sin(this.st * 0.5) > 0.2;
        if (this.p.style !== 'silent') { this.gruntT -= dt; if (this.gruntT <= 0) { this.gruntT = rand(6, 16); if (chance(this.p.reply * 0.5)) this.grunts(randi(1, 3)); } }
        if (a.arrived) { a.arrived = false; a.swayOn = false; if (this.final) { this.final = false; this.timer = rand(30, 90); a.look = this.hunter(); this.setState('close'); this.dispT = rand(2, 5); } else this.hold(); }
        break;
      case 'close': // he's come in looking for the cow; stay silent
        this.dispT -= dt; if (this.dispT <= 0) { this.dispT = rand(8, 16); if (this.p.style !== 'silent' && chance(0.5)) this.grunts(randi(1, 3)); else { a.look = this.hunter(); a.alert(3); } }
        if (this.st > this.timer) this.leave('came in, found no cow, drifted off');
        break;
      case 'leave':
        if (this.st < 1) break;
        if (a.arrived || Math.hypot(a.x - this.home.x, a.z - this.home.z) < 5) this.done = true;
        break;
      case 'flee': case 'retreat':
        if (outDist(a.x, a.z) > 2 && !this.crashed) { this.crashed = true; G.emit({ e: 'crash', x: a.x, z: a.z }); }
        if (outDist(a.x, a.z) > 170 || a.dist() > 950 || this.st > 70) this.done = true;
        break;
      case 'dominate': {
        const r = this.rival;
        if (!r || r.done || r.state === 'retreat') { this.rival = null; a.swayOn = false; this.resume(rand(8, 16)); if (this.p.style !== 'silent') this.grunts(randi(2, 4)); break; }
        a.swayOn = true; const rd = Math.hypot(r.a.x - a.x, r.a.z - a.z); if (rd > 18) a.goTo(r.a.x, r.a.z, 'walk'); else a.halt(); a.look = r.a;
        this.gruntT -= dt; if (this.gruntT <= 0) { this.gruntT = rand(3, 7); this.grunts(randi(1, 3)); }
        if (rd < 30 || this.st > 30) r.retreat('pushed off by a bigger bull');
        break;
      }
      case 'yield': {
        const r = this.rival; if (!r || r.done) { this.rival = null; this.resume(); break; }
        a.halt(); a.look = r.a; a.alert(1);
        if (this.st > rand(8, 16) || Math.hypot(r.a.x - a.x, r.a.z - a.z) < 35) this.retreat('pushed off by a bigger bull');
        break;
      }
      case 'posture': this.posture(dt); break;
      case 'toCow': case 'court': this.court(dt); break;
      case 'standoff': this.standoffStep(dt); break;
      case 'fight': this.fight(dt); break;
    }
    // scent: any hunter properly downwind of him, sustained, within ~300 m
    this.scentT -= dt;
    if (this.scentT <= 0 && !this.showcase && !['flee', 'retreat', 'fight'].includes(this.state)) {
      this.scentT = 1;
      if (this.state !== 'distant') {
        const cone = Math.cos(0.35 + G.wind.swirl * 0.9); let smelled = null, sd = 1e9, near = null, nd = 1e9;
        for (const h of G.hunters.values()) {
          const hd = a.distTo(h) || 1; if (hd < nd) { nd = hd; near = h; }
          const cosA = ((a.x - h.x) / hd) * G.wind.tx + ((a.z - h.z) / hd) * G.wind.tz;
          if (hd < 300 && cosA > cone && hd < sd) { sd = hd; smelled = h; }
        }
        if (smelled) this.scentAcc = (this.scentAcc || 0) + 1; else this.scentAcc = Math.max(0, (this.scentAcc || 0) - 1);
        let p = 0, from = smelled || near; if (this.scentAcc >= 4 && smelled) p += 0.25 * (1 - sd / 320);
        if (nd < this.p.closeLim) { p += 0.25; from = near; } if (nd < 20) p = 1;
        if (from && chance(p)) this.flee(nd < this.p.closeLim ? 'came too close and winded a hunter' : 'winded a hunter', from);
      }
    }
  }
  approach() {
    const a = this.a; this.shrubbed = false; a.look = null; a.grazeOn = false; a.swayOn = false; this.setState('approach');
    if (this.circling === undefined) { this.circling = chance(this.p.circle); this.circleD = rand(55, 140); }
    const H = this.hunter(); if (!H) { this.hold(); return; }
    let gx = H.x, gz = H.z + H.fz * 8; gx += H.fx * 8;   // a little in front of the stand
    if (this.circling) { gx += this.sim.wind.tx * this.circleD; gz += this.sim.wind.tz * this.circleD; }
    const dx = gx - a.x, dz = gz - a.z, dd = Math.hypot(dx, dz) || 1; const s = this.p.style;
    const stopAt = s === 'charger' ? rand(22, 40) : rand(30, 58); const leg = s === 'cautious' ? rand(30, 70) : s === 'charger' ? rand(60, 140) : rand(40, 110);
    const curD = this.d(); const step = Math.min(leg, Math.max(8, dd - stopAt)); this.final = curD - step <= stopAt + 15 || dd - step < stopAt + 5;
    const wx = a.x + (dx / dd) * step + rand(-12, 12), wz = a.z + (dz / dd) * step + rand(-12, 12);
    a.walkSpeed = this.p.scale * (s === 'cautious' ? rand(0.8, 1.0) : rand(1.1, 1.45)); a.goTo(wx, wz, s === 'charger' && chance(0.55) ? 'trot' : 'walk');
  }
  leave(why) {
    if (['leave', 'flee', 'retreat'].includes(this.state)) return;
    this.dropCow(); this.reason = why || 'lost interest'; this.setState('leave'); const a = this.a; a.look = null; a.grazeOn = false; a.swayOn = false; a.walkSpeed = this.p.scale * 1.2;
    const e = nearestEdge(this.sim, a.x, a.z); this.home = off(e, 140); a.goTo(this.home.x, this.home.z);
  }
  flee(why, from) {
    if (this.state === 'flee') return; this.dropCow(); this.reason = why; const a = this.a; this.setState('flee');
    const H = from || this.hunter() || { x: a.x + 1, z: a.z };
    a.grazeOn = false; a.look = H; a.alert(2); a.swayOn = false; a.fightOn = false; a.shuffle = 0;
    if (this.rival) { const r = this.rival; this.rival = null; r.rival = null; if (['posture', 'fight', 'dominate', 'yield'].includes(r.state)) r.resume(rand(5, 10)); }
    const e = edgeAwayFrom(this.sim, a.x, a.z, H.x, H.z); const t = off(e, 260);
    this.sim.after(rand(0.7, 1.6), () => { if (this.state === 'flee') { a.look = null; a.goTo(t.x, t.z, 'run'); } });
  }
  retreat(why) {
    if (['retreat', 'flee'].includes(this.state)) return; this.dropCow(); this.reason = why; const a = this.a, r = this.rival; this.setState('retreat');
    a.fightOn = false; a.shuffle = 0; a.swayOn = false; a.look = null;
    const e = r ? edgeAwayFrom(this.sim, a.x, a.z, r.a.x, r.a.z) : nearestEdge(this.sim, a.x, a.z); const t = off(e, 240);
    a.goTo(t.x, t.z, chance(0.6) ? 'trot' : 'run'); if (r) r.rival = null; this.rival = null;
  }
  /* evenly matched bulls: close in, circle broadside with heads swaying, then lock antlers or one backs down */
  posture(dt) {
    const a = this.a, r = this.rival, G = this.sim;
    if (!r || r.done || !['posture', 'fight'].includes(r.state)) { this.rival = null; a.swayOn = false; this.resume(); return; }
    const mx = (a.x + r.a.x) / 2, mz = (a.z + r.a.z) / 2, rd = Math.hypot(r.a.x - a.x, r.a.z - a.z); a.swayOn = true; a.look = r.a;
    if (rd > 16) { a.walkSpeed = this.p.scale * 0.8; a.goTo(r.a.x, r.a.z); }
    else { this.circA = (this.circA == null ? Math.atan2(a.z - mz, a.x - mx) : this.circA) + dt * 0.09; const R = 7.5; a.walkSpeed = 0.55 * this.p.scale; a.goTo(mx + Math.cos(this.circA) * R, mz + Math.sin(this.circA) * R); }
    this.gruntT -= dt; if (this.gruntT <= 0) { this.gruntT = rand(4, 9); if (chance(0.7)) this.grunts(randi(1, 3)); else if (chance(0.4)) a.thrash(rand(3, 5)); }
    if (this.id < r.id && G.time > this.postureEnd) {
      if (chance(G.alwaysFight ? 1 : 0.7)) {
        for (const b of [this, r]) { b.setState('fight'); b.a.halt(); b.a.swayOn = false; b.a.fightOn = true; b.a.shuffle = 0.7; }
        this.fightEnd = G.time + rand(12, 40); this.fmx = mx; this.fmz = mz; this.fang = Math.atan2(r.a.z - a.z, r.a.x - a.x); this.push = 0;
      } else { const lose = this.size * rand(0.85, 1.15) < r.size * rand(0.85, 1.15) ? this : r; lose.retreat('backed down after posturing'); }
    }
  }
  fight(dt) {
    const a = this.a, r = this.rival, G = this.sim;
    if (!r || r.done || r.state !== 'fight') { a.fightOn = false; a.shuffle = 0; this.rival = null; this.resume(); return; }
    if (this.id > r.id) return; // the lower-id bull drives the shoving match for both
    this.push += (rand(-1, 1) * 1.6 + (this.size - r.size) * 1.5) * dt; this.push *= Math.exp(-dt * 0.6); this.fang += rand(-1, 1) * dt * 0.25;
    this.fmx += Math.cos(this.fang) * this.push * dt * 0.9; this.fmz += Math.sin(this.fang) * this.push * dt * 0.9;
    const ux = Math.cos(this.fang), uz = Math.sin(this.fang), gap = 0.8 * (a.scale + r.a.scale);
    a.x = this.fmx - ux * gap; a.z = this.fmz - uz * gap; r.a.x = this.fmx + ux * gap; r.a.z = this.fmz + uz * gap;
    a.h = a.facing(r.a.x, r.a.z); r.a.h = r.a.facing(a.x, a.z); a.shuffle = r.a.shuffle = 0.4 + Math.abs(this.push) * 0.8;
    this.clackT = (this.clackT || 0) - dt;
    if (this.clackT <= 0) { this.clackT = rand(0.5, 2.2); G.emit({ e: 'clack', x: this.fmx, z: this.fmz }); if (chance(0.3)) (chance(0.5) ? this : r).grunts(1); }
    if (G.time > this.fightEnd) {
      const lose = this.size * rand(0.8, 1.2) < r.size * rand(0.8, 1.2) ? this : r; const win = lose === this ? r : this;
      win.a.fightOn = false; win.a.shuffle = 0; lose.retreat('lost the fight'); win.resume(rand(10, 20)); G.after(2.5, () => { if (!win.done) win.grunts(randi(2, 4)); });
    }
  }
  /* calls: type 'long' (carries far, for a bull you can't see) or 'coax' (short, ~400 yd, for a bull you can see) */
  heardCall(H, type, tooOften) {
    if (this.done || ['flee', 'retreat'].includes(this.state)) return; const a = this.a, d = a.distTo(H), G = this.sim;
    if (this.showcase) { a.look = H; a.alert(rand(2, 4)); if (chance(0.7)) G.after(rand(1.5, 4), () => { if (!this.done) this.grunts(randi(2, 5)); }); return; }
    const range = type === 'long' ? 1400 : 380; if (d > range) return;
    const visibleToHim = this.everSeen || this.inMarsh() || ['dominate', 'yield', 'posture', 'fight'].includes(this.state);
    if (visibleToHim && d < SPOT_R) { a.look = H; a.alert(2); this.flee('spotted a hunter calling inside 75 yards', H); return; }
    if (this.state === 'court' || this.state === 'toCow') {   // a real cow beats a call
      if (d < 600) { a.look = H; a.alert(rand(1.5, 3)); } if (tooOften) this.susp += 0.15;
      if (chance(this.p.reply * 0.4)) G.after(rand(1.5, 4), () => { if (!this.done) this.grunts(randi(1, 3)); });
      return;
    }
    // the hunter whose calls sound closest and most convincing becomes the one he works toward
    const cur = this.hunter(); if (!cur || cur === H || d < a.distTo(cur) * 0.8 || chance(0.35)) this.focus = H;
    const df = clamp(1.25 - d / 1400, 0.2, 1);
    if (tooOften) this.susp += 0.22 * (1.25 - this.p.bold * 0.5);
    if (['distant', 'coming', 'timber'].includes(this.state)) { this.interest += type === 'long' ? 0.32 * df * (0.7 + this.p.bold * 0.6) : 0.12; }
    else if (this.state === 'hold' || this.state === 'toShrub') {
      if (type === 'coax') { this.interest += 0.45; if (!tooOften) this.resumeAt = G.time + rand(2, 6); }
      else if (d < 250) { this.susp += 0.2; }            // a loud long call at a close bull: he hangs up
      else { this.interest += 0.3; if (!tooOften) this.resumeAt = G.time + rand(3, 8); }
    }
    else if (this.state === 'approach') { this.interest += 0.05; if (type === 'long' && d < 250) this.susp += 0.1; }
    else if (this.state === 'leave' && this.st > 1 && !tooOften && this.susp < 0.6) { if (type === 'coax' || d > 250) { this.interest += 0.5; if (chance(0.7)) this.approach(); } }
    else if (this.state === 'close') { this.susp += 0.15; }
    this.interest = Math.min(1.6, this.interest);
    if (this.susp > 0.9 && this.inMarsh()) { if (d < 150) this.flee('too much calling — got suspicious', H); else this.leave('too much calling — got suspicious'); return; }
    if (this.state !== 'distant' && this.state !== 'coming') a.alert(rand(1.5, 3.5));
    if (['hold', 'timber', 'close'].includes(this.state)) a.look = H;
    if (chance(this.p.reply * (this.interest > 0.3 ? 1 : 0.6))) G.after(rand(1.5, 5), () => { if (!this.done && !['flee', 'retreat'].includes(this.state)) this.grunts(randi(2, 6)); });
  }
  heardPour(H) {
    if (this.done || ['flee', 'retreat'].includes(this.state) || this.showcase) return; const a = this.a, d = a.distTo(H);
    if ((this.everSeen || this.inMarsh()) && d < SPOT_R) { this.flee('heard a pour inside 75 yards and spotted the hunter', H); return; }
    if (d < 300 && this.inMarsh()) { this.focus = H; this.interest = Math.min(1.6, this.interest + 0.5); a.alert(2); a.look = H; if (this.state === 'hold') this.resumeAt = this.sim.time + rand(2, 5); }
  }
  // ---- the rut: real cows ----
  courtCow(cg, why) {
    const a = this.a; this.dropCow(); this.cowGoal = cg; if (!cg.suitors.includes(this)) cg.suitors.push(this);
    this.whyCow = why; a.grazeOn = false; a.swayOn = false; a.look = cg.cow; this.cd = 0; this.retarget = 0;
    this.courtT = rand(150, 360) * (0.6 + this.p.traits.rut * 0.8); this.gruntT = rand(2, 8); this.setState('toCow');
    this.sim.note(`#${this.id} ${this.p.typeName} -> cow #${cg.cow.id} (${why})`);
  }
  dropCow() { const cg = this.cowGoal; if (cg) { const i = cg.suitors.indexOf(this); if (i >= 0) cg.suitors.splice(i, 1); } this.cowGoal = null; }
  // back to what he was doing after a rival, a standoff or a scare
  resume(t) {
    if (this.cowGoal && !this.cowGoal.done) { this.setState('court'); this.cd = 0; this.retarget = 0; return; }
    if (outDist(this.a.x, this.a.z) > 2 && !this.everSeen) { this.setState('distant'); this.wanderT = 0; return; }
    this.hold(t);
  }
  // how close he gets: a cow with a calf only lets a bull hang about at a distance
  courtDist() {
    const cg = this.cowGoal; if (cg.calves.length) return chance(0.3 + this.p.traits.persistent * 0.3) ? rand(15, 30) : cg.keepOff + rand(8, 25);   // now and then he presses in; she moves off
    const r = cg.receptiveTo(this); return r > 0.6 ? rand(6, 10) : rand(8, 14) * lerp(1.3, 0.8, this.p.traits.persistent);
  }
  court(dt) {
    const a = this.a, cg = this.cowGoal;
    if (!cg || cg.done || cg.cow.removed) { this.dropCow(); if (outDist(a.x, a.z) < 2) this.hold(rand(10, 20)); else this.leave('lost track of the cow'); return; }
    const c = cg.cow, d = distB(a, c); this.courtT -= dt; this.retarget -= dt;
    if (outDist(a.x, a.z) < 0) this.everSeen = true;
    if (cg.state === 'leave' || cg.state === 'flee') {   // she's going: a bull she welcomed follows her out; the rest give up
      if (cg.state === 'leave' && cg.receptiveTo(this) > 0.6) {
        if (this.retarget <= 0) { this.retarget = 3; a.walkSpeed = this.p.scale * 1.25; a.goTo(c.x, c.z); }
        if (outDist(a.x, a.z) > 60) { this.done = true; this.reason = 'followed the cow out of the marsh'; }
        return;
      }
      this.leave(cg.state === 'flee' ? 'the cow ran off' : 'the cow left'); return;
    }
    if (this.courtT <= 0) { this.leave(cg.calves.length ? 'the cow kept him at a distance; gave up' : 'gave up on the cow'); return; }
    if (this.retarget <= 0) {
      this.retarget = rand(2, 4); if (!this.cd || chance(0.12)) this.cd = this.courtDist();
      if (d > this.cd + 5) {
        const t = { x: c.x + ((a.x - c.x) / d) * this.cd, z: c.z + ((a.z - c.z) / d) * this.cd };
        a.walkSpeed = this.p.scale * (d > 80 ? rand(1.2, 1.45) : rand(0.8, 1.1)); a.swayOn = false; a.grazeOn = false;
        a.goTo(t.x, t.z, d > 120 && (this.p.style === 'charger' || this.p.traits.rut > 0.85) ? 'trot' : 'walk');
      }
    }
    if (d <= (this.cd || 15) + 5) {
      if (this.state === 'toCow') { this.setState('court'); this.dispT = rand(2, 5); this.sim.note(`#${this.id} ${this.p.typeName} is with cow #${c.id} at ${Math.round(d)} m`); }
      if (a.target && d < (this.cd || 15)) a.halt();
      if (!a.target) { a.look = c; this.dispT = (this.dispT || 0) - dt; if (this.dispT <= 0) this.courtDisplay(); }
    }
    if (this.p.style !== 'silent') { this.gruntT -= dt; if (this.gruntT <= 0) { this.gruntT = rand(10, 30); if (chance(this.p.reply * 0.8)) this.grunts(randi(2, 5)); } }
    if (this.state === 'toCow' && chance(dt * 0.05) && outDist(a.x, a.z) > 0) this.sim.emit({ e: 'brush', x: a.x, z: a.z, len: rand(2, 4), gain: 1.5 });
  }
  courtDisplay() {
    const a = this.a, s = this.p.style, r = Math.random();
    if (r < 0.3 && s !== 'silent') { this.grunts(randi(2, 4)); this.dispT = rand(6, 12); }
    else if (r < 0.5) { a.swayOn = true; this.dispT = rand(5, 10); this.sim.after(this.dispT * 0.9, () => { a.swayOn = false; }); }
    else if (r < 0.62) { a.thrash(rand(3, 6)); this.dispT = rand(6, 10); }
    else if (r < 0.78) { a.grazeOn = true; this.dispT = rand(6, 14); this.sim.after(this.dispT * 0.8, () => { a.grazeOn = false; }); }
    else { a.alert(rand(2, 4)); this.dispT = rand(4, 8); }
  }
  heardBellow(cg, d) {
    if (this.done || this.showcase || this.cowGoal === cg || ['flee', 'retreat', 'leave', 'fight', 'posture', 'dominate', 'yield', 'standoff'].includes(this.state)) return;
    const T = this.p.traits, p = clamp(1.3 - d / 1500, 0, 1) * (0.3 + T.rut * 0.7);
    if (d < 600) { this.a.look = cg.cow; this.a.alert(2); }
    if (chance(p)) { this.courtCow(cg, 'heard a cow bellow'); if (this.p.style !== 'silent' && chance(this.p.reply)) this.sim.after(rand(2, 5), () => { if (!this.done) this.grunts(randi(2, 4)); }); }
  }
  // ---- predators ----
  standoff(p) {
    this.threatB = p; if (this.state === 'standoff') return;
    const a = this.a; this.setState('standoff'); a.halt(); a.grazeOn = false; a.look = p; a.alert(4); this.standT = rand(25, 50); this.dispT = rand(1, 3);
    this.sim.note(`#${this.id} ${this.p.typeName} stands his ground against a ${p.kind}`);
  }
  standoffStep(dt) {
    const a = this.a, p = this.threatB;
    if (!p || p.removed || distB(a, p) > 120 || this.st > this.standT) { a.swayOn = false; this.threatB = null; this.resume(rand(5, 10)); return; }
    const d = distB(a, p); a.look = p; a.alert(1); if (a.arrived) a.arrived = false;
    if (!a.target) a.h += clamp(wrapA(a.facing(p.x, p.z) - a.h), -0.6 * dt, 0.6 * dt);   // turns to face it
    this.dispT -= dt;
    if (this.dispT <= 0) {
      this.dispT = rand(3, 7);
      if (d < 20 && this.p.traits.aggressive > 0.45) { a.goTo(a.x + (p.x - a.x) * 0.6, a.z + (p.z - a.z) * 0.6, 'trot'); this.sim.emit({ e: 'brush', x: a.x, z: a.z, len: 1.5, gain: 1.2 }); }   // a short charge
      else if (chance(0.4)) { a.swayOn = true; this.sim.after(4, () => { a.swayOn = false; }); }
      else if (chance(0.4)) a.thrash(rand(2, 4));
      else if (this.p.style !== 'silent' && chance(0.5)) this.grunts(randi(1, 3));
    }
  }
  // twice a second: predators nearby? a cow in sight?
  sense(all) {
    if (this.done || this.showcase || this.sim.frozen || ['flee', 'retreat', 'fight', 'leave'].includes(this.state)) return;
    const a = this.a, T = this.p.traits, t = threat(a, a.eco.role, T, all);
    if (t) {
      const k = t.other.kind, what = k === 'wolf' ? 'wolves' : 'a ' + k;
      if (t.act === 'flee') { this.flee('ran from ' + what, t.other); return; }
      if (t.act === 'avoid') { this.leave('moved off from ' + what); return; }
      if (t.act === 'stand') { this.standoff(t.other); return; }
      if (t.act === 'watch' && this.state !== 'standoff') { a.look = t.other; a.alert(2); if (!(this.sim.time < this.watchT)) { this.watchT = this.sim.time + 8; if (['approach', 'toCow'].includes(this.state) && chance(0.5)) a.halt(); } }
    }
    if (!this.cowGoal && ['hold', 'approach', 'close', 'toShrub', 'distant', 'coming', 'timber'].includes(this.state)) {
      const inM = this.inMarsh(), seeR = inM ? 260 : 120;
      for (const cg of this.sim.cows) {
        if (cg.done || cg.state === 'flee' || cg.state === 'leave' || cg.state === 'frozen') continue; const d = distB(a, cg.cow); if (d > seeR) continue;
        if (chance(0.06 * T.rut * (cg.calves.length ? 0.5 : 1) * (inM ? 1 : 0.6))) { this.courtCow(cg, 'saw a cow'); break; }
      }
    }
  }
  dispose() { this.dropCow(); this.a.remove(); }
}

export function updateRivals(sim) {
  const bs = sim.bulls.filter(b => !b.done && b.inMarsh() && !b.rival); if (bs.length < 2) return;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
    const A_ = bs[i], B_ = bs[j]; if (Math.hypot(A_.a.x - B_.a.x, A_.a.z - B_.a.z) > 170) continue;
    A_.rival = B_; B_.rival = A_; const ratio = A_.size / B_.size;
    if (ratio > 1.15 || ratio < 1 / 1.15) { const big = ratio > 1 ? A_ : B_, small = big === A_ ? B_ : A_; big.setState('dominate'); small.setState('yield'); big.gruntT = 0; }
    else { A_.setState('posture'); B_.setState('posture'); A_.postureEnd = B_.postureEnd = sim.time + rand(25, 60); }
    return;
  }
}
