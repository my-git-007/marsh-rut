// A cow and her calves: they wander in, graze, walk, listen, bed, trot off, drink, and leave.
// Calves are curious and playful — they frisk about and go to look at things — but never stray far from her,
// and run to her side at the first sign of trouble. A cow with a calf is more watchful: she keeps bulls at a
// distance (moving off if one comes closer) and faces down predators before running with her calf.
// A cow on her own welcomes an older bull, puts up with a middling one, and gets fed up with a young one that
// won't take the hint — she bellows, and her bellows carry and bring other (often bigger) bulls.
// A cow that winds or sees a hunter close alarms and runs. Numbers: COW_TYPES / COW_SOCIAL / CALF_* in catalog.js.
import { TAU, clamp, lerp, rand, chance, random, wrapA } from '../util.js';
import { marshE, outDist, nearestPoint, WATER_PTS, off } from '../world.js';
import { Body } from './body.js';
import { palLin } from './bullparams.js';
import { rollCow, rollCalf, between, COW_SOCIAL, CALF_LEASH } from './catalog.js';
import { SPOT_R, randomEdge, nearestEdge, edgeAwayFrom, marshPoint } from './places.js';
import { threat, nearestBody, awayFrom, distB, SENSE_EVERY } from './ecology.js';

const CURIOUS_OF = new Set(['rabbit', 'porcupine', 'raccoon', 'calf']);

export class CowGroup {
  // opt: type (cow type id), calves (0/1/2) — for test scenes
  constructor(sim, initial, opt = {}) {
    this.sim = sim;
    this.done = false;
    this.t = 0;
    this.st = 0;
    this.scentT = 1;
    this.nervous = 0;
    this.sawT = 1;
    const R = rollCow(opt),
      T = (this.traits = R.traits);
    this.type = R.type;
    this.pers = { wary: T.wary, restless: T.restless, lazy: T.lazy };
    this.stay = rand(240, 600) * lerp(0.75, 1.35, T.lazy) * lerp(1.2, 0.8, T.restless);
    this.cow = new Body(
      sim,
      'cow',
      {
        kind: 'cow',
        type: R.type.id,
        scale: R.scale,
        seed: sim.seed(),
        coat: R.coat,
        pal: palLin(R.coat.c),
        saddle: 0.4,
        bellLen: rand(0.06, 0.14),
      },
      { walk: rand(0.95, 1.15), trot: 2.9, run: 5.2 },
    );
    this.cow.brain = this;
    this.calves = [];
    this.suitors = [];
    this.annoy = 0;
    this.bellows = 0;
    this.cow.eco = { role: 'cow', sp: 'moose' };
    for (let i = 0; i < R.calves; i++) this.addCalf(null, i);
    this.keepOff = lerp(COW_SOCIAL.keepOffCalf[0], COW_SOCIAL.keepOffCalf[1], T.wary);
    if (initial) {
      const p = marshPoint(sim, 150, 700);
      this.cow.place(p.x, p.z, rand(0, TAU));
      this.setState('graze', rand(10, 40));
      this.inMarshT = 60;
    } else {
      this.edge = randomEdge(sim, 150, 850);
      const h = off(this.edge, rand(50, 90));
      this.cow.place(h.x, h.z, Math.atan2(this.edge.nz, -this.edge.nx));
      const t = off(this.edge, -rand(15, 40));
      this.cow.goTo(t.x, t.z);
      this.state = 'enter';
      this.inMarshT = 0;
    }
    for (const c of this.calves) c.place(this.cow.x + rand(-4, 4), this.cow.z + rand(-4, 4), this.cow.h);
    this.moanT = rand(30, 120);
  }
  // scale: force a size (test scenes); otherwise the calf type's fraction of her size
  addCalf(scale, i = 0) {
    const R = rollCalf(),
      s = scale || this.cow.scale * R.scale;
    const c = new Body(
      this.sim,
      'calf',
      {
        kind: 'calf',
        type: R.type.id,
        scale: s,
        seed: this.sim.seed(),
        coat: R.coat,
        pal: palLin(R.coat.c),
        saddle: 0.3,
        bellLen: 0,
      },
      { walk: 1.1, trot: 2.8, run: 5 },
    );
    c.eco = { role: 'calf', sp: 'moose' };
    c.traits = R.traits;
    c.calfType = R.type;
    c.offA = rand(2.4, 3.8) * (i ? -1 : 1);
    c.offD = between(CALF_LEASH.heel);
    c.playT = rand(10, 40);
    c.task = 'heel';
    c.taskT = 0;
    c.hopT = 0;
    c.retT = 0;
    this.calves.push(c);
    this.cow.eco.role = 'cowCalf';
    return c;
  }
  all() {
    return [this.cow, ...this.calves];
  }
  placeAt(x, z, h) {
    this.cow.place(x, z, h);
    for (const k of this.calves) k.place(x + Math.cos(h + k.offA) * k.offD, z - Math.sin(h + k.offA) * k.offD, h);
  }
  setState(s, timer) {
    this.state = s;
    this.st = 0;
    if (timer != null) this.timer = timer;
  }
  // how welcome a bull is (0..1): see COW_SOCIAL
  receptiveTo(b) {
    if (this.calves.length) return 0.1;
    const t = b.p.tier;
    return t >= COW_SOCIAL.receptiveTier ? 0.9 : t >= COW_SOCIAL.tolerateTier ? 0.5 : 0.15;
  }
  next() {
    const c = this.cow,
      P = this.pers,
      mom = this.calves.length ? 1.8 : 1;
    c.grazeOn = false;
    c.bedOn = false;
    c.look = null;
    const w = [
      ['graze', 0.4],
      ['walk', 0.2],
      ['listen', 0.12 * (0.4 + P.wary) * mom],
      ['bed', this.inMarshT > 120 ? 0.1 * (0.3 + P.lazy) : 0],
      ['trot', 0.06 * (0.2 + P.restless)],
      ['drink', 0.08],
    ];
    let r = random() * w.reduce((q, x) => q + x[1], 0),
      k = 'graze';
    for (const [n, v] of w) {
      if (r < v) {
        k = n;
        break;
      }
      r -= v;
    }
    if (k === 'graze') {
      c.grazeOn = true;
      this.setState('graze', rand(25, 80));
    } else if (k === 'walk') {
      const p = this.spot(10, 45);
      c.walkSpeed = rand(0.6, 1.0);
      c.goTo(p.x, p.z);
      c.grazeOn = false;
      this.setState('walk', 90);
    } else if (k === 'listen') {
      c.alert(rand(5, 12));
      const ang = rand(0, TAU);
      c.look = { x: c.x + Math.cos(ang) * 50, z: c.z + Math.sin(ang) * 50 };
      this.setState('listen', rand(5, 14));
    } else if (k === 'bed') {
      c.bedOn = true;
      this.setState('bed', rand(60, 140) * (0.6 + this.pers.lazy));
    } else if (k === 'trot') {
      const p = this.spot(80, 220);
      c.goTo(p.x, p.z, 'trot');
      this.setState('trot', 80);
    } else {
      const wp = nearestPoint(WATER_PTS, c.x, c.z, 240);
      if (wp) {
        c.walkSpeed = 1.0;
        c.goTo(wp.x, wp.z);
        this.setState('drink', 120);
        this.drinkAt = wp;
      } else {
        c.grazeOn = true;
        this.setState('graze', rand(25, 60));
      }
    }
  }
  spot(a, b) {
    const c = this.cow;
    for (let i = 0; i < 20; i++) {
      const ang = rand(0, TAU),
        r = rand(a, b);
      const x = c.x + Math.cos(ang) * r,
        z = c.z + Math.sin(ang) * r;
      if (marshE(x, z) < -0.03 && this.sim.nearestHunter(x, z).d > 90) return { x, z };
    }
    return { x: c.x, z: c.z };
  }
  update(dt) {
    const c = this.cow,
      G = this.sim;
    c.update(dt);
    this.t += dt;
    this.st += dt;
    const { h: near, d } = G.nearestHunter(c.x, c.z);
    if (this.state !== 'enter') this.inMarshT += dt;
    this.nervous = Math.max(0, this.nervous - dt * (this.calves.length ? 0.003 : 0.004));
    switch (this.state) {
      case 'enter':
        if (c.arrived) {
          c.arrived = false;
          this.next();
        }
        break;
      case 'graze':
      case 'listen':
      case 'bed':
        if (this.st > this.timer) this.next();
        break;
      case 'walk':
      case 'trot':
      case 'avoid':
        if (c.arrived || this.st > this.timer) {
          c.arrived = false;
          c.halt();
          this.next();
        }
        break;
      case 'drink':
        if (c.arrived && !this.drinking) {
          c.arrived = false;
          this.drinking = true;
          c.grazeOn = true;
          this.timer = this.st + rand(20, 45);
        }
        if (this.drinking && this.st > this.timer) {
          this.drinking = false;
          this.next();
        } else if (!this.drinking && this.st > this.timer) this.next();
        break;
      case 'defend': {
        // facing a predator, calf tucked in beside her
        const p = this.threatB;
        if (!p || p.removed || distB(c, p) > 300 || this.st > this.timer) {
          this.threatB = null;
          c.arrived = false;
          this.next();
          break;
        }
        c.look = p;
        c.alert(1);
        if (c.arrived) {
          c.arrived = false;
          c.halt();
        }
        if (!c.target) c.h += clamp(wrapA(c.facing(p.x, p.z) - c.h), -0.8 * dt, 0.8 * dt);
        break;
      }
      case 'alert':
        c.grazeOn = false;
        c.bedOn = false;
        c.look = this.alarmFrom || near;
        c.alert(1);
        if (this.st > this.timer) {
          if (this.spooked) this.flee();
          else if (this.leaving) this.leave();
          else this.next();
        }
        break;
      case 'leave':
        if (c.arrived || outDist(c.x, c.z) > 70) this.done = true;
        break;
      case 'flee':
        if (outDist(c.x, c.z) > 140 || this.st > 60) this.done = true;
        break;
    }
    if (this.t > this.stay && ['graze', 'walk', 'listen'].includes(this.state)) this.leave();
    this.moanT -= dt;
    if (this.moanT < 0) {
      this.moanT = rand(50, 160);
      if (chance(0.4) && !['flee', 'bed', 'defend'].includes(this.state)) G.emit({ e: 'moan', id: c.id });
    }
    this.updateCalves(dt);
    if (['flee', 'alert', 'leave', 'frozen'].includes(this.state) || !near) return;
    // she may simply notice a hunter who is close, or wind one
    this.sawT -= dt;
    if (this.sawT <= 0) {
      this.sawT = 1;
      if (d < 45 && chance(0.12 * (0.5 + this.pers.wary) * (this.calves.length ? 1.4 : 1))) {
        this.alarm(true, near);
        return;
      }
      let smelled = null,
        sd = 1e9;
      for (const h of G.hunters.values()) {
        const hd = c.distTo(h) || 1;
        const cosA = ((c.x - h.x) / hd) * G.wind.tx + ((c.z - h.z) / hd) * G.wind.tz;
        if (hd < 300 && cosA > Math.cos(0.4 + G.wind.swirl * 0.9) && hd < sd) {
          sd = hd;
          smelled = h;
        }
      }
      if (smelled) this.scentAcc = (this.scentAcc || 0) + 1;
      else this.scentAcc = Math.max(0, (this.scentAcc || 0) - 1);
      if (smelled && this.scentAcc >= 3 && chance(0.3 * (1 - sd / 320))) this.alarm(true, smelled);
    }
  }
  // calves: at heel, frisking about, or off to look at something — always within reach of her
  updateCalves(dt) {
    const c = this.cow;
    const calm =
      ['graze', 'listen', 'bed', 'drink', 'walk'].includes(this.state) && this.inMarshT > 20 && c.speed < 1.5;
    const danger = ['defend', 'alert', 'flee', 'avoid'].includes(this.state) || c.run;
    for (const k of this.calves) {
      const T = k.traits;
      k.taskT -= dt;
      k.retT -= dt;
      if (danger && (k.task !== 'heel' || k.offD > 2)) {
        k.task = 'heel';
        k.curio = null;
        k.offD = 1.8;
        k.offA = (k.offA > 0 ? 1 : -1) * rand(1.6, 2.4);
      }
      if (k.task === 'play') {
        if (k.taskT <= 0 || !calm) {
          k.task = 'heel';
          k.offD = between(CALF_LEASH.heel);
        } else {
          k.hopT -= dt;
          if (k.hopT <= 0 || k.arrived) {
            k.arrived = false;
            k.hopT = rand(1.2, 2.6);
            const a = rand(0, TAU),
              r = between(CALF_LEASH.play);
            k.walkSpeed = 1.4;
            k.grazeOn = false;
            k.bedOn = false;
            k.goTo(c.x + Math.cos(a) * r, c.z + Math.sin(a) * r, chance(0.7) ? 'trot' : 'walk');
          }
        }
      } else if (k.task === 'curious') {
        const o = k.curio;
        if (!o || o.removed || k.taskT <= 0 || !calm || distB(k, c) > CALF_LEASH.max) {
          k.task = 'heel';
          k.curio = null;
          k.look = null;
          k.offD = between(CALF_LEASH.heel);
        } else {
          const d = distB(k, o);
          if (d > 5) {
            if (k.retT <= 0) {
              k.retT = 1.5;
              k.walkSpeed = 0.9;
              k.grazeOn = false;
              k.goTo(o.x + ((k.x - o.x) / d) * 4, o.z + ((k.z - o.z) / d) * 4);
            }
          } else {
            k.halt();
            k.look = o;
            k.alert(1);
          }
        }
      }
      if (k.task === 'heel') {
        const ca = Math.cos(c.h + k.offA),
          sa = Math.sin(c.h + k.offA);
        const tx = c.x + ca * k.offD,
          tz = c.z - sa * k.offD;
        const dd = Math.hypot(tx - k.x, tz - k.z);
        if (dd > 2) {
          k.bedOn = false;
          k.walkSpeed = clamp(c.speed * 1.15 + dd * 0.12, 0.5, 2.2);
          k.goTo(tx, tz, c.run || (danger && dd > 8) ? 'run' : dd > 12 || c.mode === 'trot' ? 'trot' : 'walk');
          k.grazeOn = false;
        } else {
          k.bedOn = c.bedOn && c.bd > 0.5;
          k.grazeOn = c.grazeOn;
          k.look = c.look;
        }
        if (calm) {
          k.playT -= dt;
          if (k.playT < 0) {
            k.playT = rand(25, 70) * lerp(1.6, 0.6, T.playful);
            if (chance(0.25 + T.playful * 0.6)) {
              k.task = 'play';
              k.taskT = rand(4, 12);
              k.hopT = 0;
            } else {
              k.offA = rand(-2.5, 2.5);
              k.offD = between(CALF_LEASH.wander);
            }
          }
        }
      }
      k.update(dt);
    }
  }
  // twice a second: predators, bulls, and things a calf might want a look at
  sense(all) {
    if (this.done || this.sim.frozen || ['flee', 'leave', 'frozen', 'enter'].includes(this.state)) return;
    const c = this.cow,
      T = this.traits,
      own = new Set(this.all());
    const t = threat(c, c.eco.role, T, all, (o) => own.has(o));
    if (t) {
      const k = t.other.kind,
        what = k === 'wolf' ? 'wolves' : 'a ' + k;
      if (t.act === 'flee') {
        this.why = 'ran from ' + what;
        this.alarmFrom = t.other;
        this.sim.note(`cow #${c.id} ${this.why}`);
        this.flee();
        return;
      }
      if (t.act === 'defend') {
        this.defend(t.other);
        return;
      }
      if (t.act === 'avoid' && this.state !== 'avoid') {
        c.look = t.other;
        this.moveAway(t.other, rand(40, 70), false);
        return;
      }
      if (t.act === 'watch' && !['defend', 'alert', 'avoid'].includes(this.state)) {
        c.look = t.other;
        c.alert(3);
        for (const q of this.calves) q.alert(2);
        if (['graze', 'bed', 'drink'].includes(this.state)) {
          c.grazeOn = false;
          c.bedOn = false;
          this.setState('listen', rand(5, 10));
        }
        return;
      }
    }
    // bulls
    let nb = null,
      nd = 170;
    for (const b of this.sim.bulls) {
      if (b.done || ['flee', 'retreat', 'leave'].includes(b.state)) continue;
      const d = distB(c, b.a);
      if (d < nd) {
        nd = d;
        nb = b;
      }
    }
    if (nb) this.bullNear(nb, nd);
    else this.annoy = Math.max(0, this.annoy - 0.01);
    // a calm calf at heel may go and look at something
    if (['graze', 'listen', 'bed', 'drink'].includes(this.state)) {
      for (const k of this.calves) {
        if (k.task !== 'heel' || !chance(0.04 + k.traits.curious * 0.08)) continue;
        const o = nearestBody(k, all, 45, (q) => !own.has(q) && CURIOUS_OF.has(q.eco.role));
        if (o) {
          k.task = 'curious';
          k.curio = o.b;
          k.taskT = rand(8, 20);
          k.retT = 0;
          this.sim.note(`calf #${k.id} goes to look at a ${o.b.kind}`);
        }
      }
    }
  }
  bullNear(b, d) {
    const c = this.cow;
    if (this.calves.length) {
      // tolerated, but only at a distance
      if (d < this.keepOff && !['avoid', 'defend'].includes(this.state)) {
        c.look = b.a;
        c.alert(3);
        this.moveAway(b.a, this.keepOff + rand(30, 60), d < this.keepOff * 0.5);
        this.sim.note(`cow #${c.id} with calf moves away from ${b.p.typeName} (${Math.round(d)} m)`);
      }
      return;
    }
    const r = this.receptiveTo(b);
    if (d > COW_SOCIAL.annoyNear) {
      this.annoy = Math.max(0, this.annoy - 0.01);
      return;
    }
    if (r > 0.6) {
      this.annoy = Math.max(0, this.annoy - 0.05);
      if (chance(0.015)) this.sim.emit({ e: 'moan', id: c.id });
      return;
    } // welcome
    this.annoy = Math.min(
      1,
      this.annoy + COW_SOCIAL.annoyRate * SENSE_EVERY * (r > 0.3 ? 0.35 : 1) * lerp(0.7, 1.3, this.traits.aggressive),
    );
    if (this.annoy >= 1 && this.sim.time > (this.bellowAt || 0)) {
      this.bellow(b);
      this.annoy = 0.25;
      this.bellowAt = this.sim.time + between(COW_SOCIAL.bellowGap);
    } else if (this.annoy > 0.3 && this.state !== 'avoid' && chance(0.25)) {
      c.look = b.a;
      this.moveAway(b.a, rand(25, 60), this.annoy > 0.7);
    }
  }
  // a loud, drawn-out bellow: carries far, and other bulls come to it
  bellow(b) {
    const c = this.cow;
    this.bellows++;
    c.alert(3);
    c.look = b ? b.a : null;
    this.sim.emit({ e: 'moan', id: c.id, loud: 1 });
    this.sim.note(`cow #${c.id} bellows, fed up with ${b ? b.p.typeName : 'a bull'}`);
    this.sim.bellow(this, b);
  }
  moveAway(from, dist, fast) {
    const c = this.cow;
    c.grazeOn = false;
    c.bedOn = false;
    const p = awayFrom(c, from, dist, true);
    c.walkSpeed = rand(1.0, 1.25);
    c.goTo(p.x, p.z, fast ? 'trot' : 'walk');
    this.setState('avoid', 60);
  }
  defend(p) {
    const c = this.cow,
      T = this.traits;
    if (this.state !== 'defend') {
      this.setState('defend', rand(15, 35));
      this.sim.note(`cow #${c.id} faces a ${p.kind}, calf at her side`);
    }
    this.threatB = p;
    c.grazeOn = false;
    c.bedOn = false;
    c.look = p;
    c.alert(3);
    for (const k of this.calves) {
      k.bedOn = false;
      k.task = 'heel';
      k.curio = null;
      k.offD = 1.8;
    }
    const d = distB(c, p); // a bold cow charges a predator that comes in close (never a bear)
    if (d < 35 && !c.target && p.kind !== 'bear' && chance(0.3 * (0.4 + T.aggressive))) {
      c.goTo(c.x + (p.x - c.x) * 0.7, c.z + (p.z - c.z) * 0.7, 'trot');
      this.sim.emit({ e: 'brush', x: c.x, z: c.z, len: 1.5, gain: 1.2 });
    } else if (!c.target) c.halt();
  }
  alarm(spooked, from) {
    this.spooked = spooked;
    this.leaving = !spooked;
    this.alarmFrom = from || this.sim.nearestHunter(this.cow.x, this.cow.z).h;
    for (const a of this.all()) {
      a.bedOn = false;
      a.grazeOn = false;
      a.look = this.alarmFrom;
      a.alert(4);
    }
    this.setState('alert', rand(1.5, 5));
  }
  leave() {
    const c = this.cow;
    c.grazeOn = false;
    c.bedOn = false;
    c.look = null;
    this.setState('leave');
    const e = nearestEdge(this.sim, c.x, c.z);
    const h = off(e, 90);
    c.walkSpeed = 1.1;
    c.goTo(h.x, h.z);
  }
  flee() {
    this.setState('flee');
    const c = this.cow;
    c.grazeOn = false;
    c.bedOn = false;
    c.look = null;
    const F = this.alarmFrom || { x: c.x + 1, z: c.z };
    const e = edgeAwayFrom(this.sim, c.x, c.z, F.x, F.z);
    const t = off(e, 200);
    c.goTo(t.x, t.z, 'run');
    if (this.calves.length) c.runSpeed = Math.min(c.runSpeed, 4.4); // she runs at her calf's pace
    this.sim.after(rand(9, 16), () => this.sim.emit({ e: 'crash', x: t.x, z: t.z }));
  }
  heardCall(H, type, tooOften) {
    if (['flee', 'leave'].includes(this.state)) return;
    const d = this.cow.distTo(H);
    if (d > (type === 'long' ? 1400 : 380)) return;
    if (d < SPOT_R) {
      this.alarm(true, H);
      return;
    }
    if (tooOften && d < 450) {
      this.nervous += 0.45 * (0.5 + this.pers.wary);
      if (this.nervous > 0.9) {
        this.alarm(false, H);
        return;
      }
    }
    for (const a of this.all()) {
      a.look = H;
      a.alert(rand(2, 5));
    }
    this.sim.after(rand(5, 9), () => {
      if (!['alert', 'flee', 'leave', 'defend'].includes(this.state)) for (const a of this.all()) a.look = null;
    });
  }
  heardPour(H) {
    const d = this.cow.distTo(H);
    if (d < SPOT_R && !['flee', 'leave'].includes(this.state)) this.alarm(true, H);
  }
  dispose() {
    for (const b of [...this.suitors]) if (b.cowGoal === this) b.dropCow();
    for (const a of this.all()) a.remove();
  }
}
