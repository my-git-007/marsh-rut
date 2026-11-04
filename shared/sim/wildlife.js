// Other wildlife the host runs for everyone. Each visit is a WildEvent: one animal or a group, with its routine
//   bear       forages its way out into the marsh and back
//   wolf/coyote a pack or a pair trots across, pausing to sniff and mouse
//   raccoon    works along the stream banks, dabbling
//   rabbit     (snowshoe hare) nibbles along the brushy edge in short hops, sits up to listen
//   porcupine  waddles out to feed on marsh plants and takes its time
// ...and its reactions (REACT in catalog.js, through ecology.js): predators stalk and chase hares, test a cow with
// a calf (and chase if she runs), give way to big bulls and to each other; hares freeze then bolt in zig-zags;
// porcupines turn their backs and raise their quills; everything bolts if it winds a hunter.
// (Birds are scenery each browser makes for itself.)
import { PI, TAU, clamp, lerp, rand, randi, pick, chance } from '../util.js';
import { marshE, outDist, STREAM, edgeAt, off } from '../world.js';
import { CritterBody } from './body.js';
import { SPECIES, PREY, SENSES, rollCritter, between } from './catalog.js';
import { randomEdge, nearestEdge, edgeAwayFrom } from './places.js';
import { threat, distB, awayFrom } from './ecology.js';

export function critter(sim, kind, opt = {}) {
  const R = rollCritter(kind, opt);
  const c = new CritterBody(sim, kind, {
    kind,
    scale: R.scale,
    seed: sim.seed(),
    size: R.size.id,
    coat: { id: R.coat.id, c: R.coat.c },
  });
  c.traits = R.traits;
  c.eco = { role: SPECIES[kind].role, sp: kind };
  c.sizeName = R.size.name;
  c.coatName = R.coat.name;
  return c;
}
const ROUTINE = new Set(['forage', 'amble', 'travel', 'bank', 'dabble', 'feed', 'hop', 'enter']);

export class WildEvent {
  // opt: n (group size), size / coat (catalogue ids), at {x, z} (place it there: test scenes)
  constructor(sim, kind, opt = {}) {
    this.sim = sim;
    this.kind = kind;
    this.S = SPECIES[kind];
    this.t = 0;
    this.st = 0;
    this.done = false;
    this.members = [];
    this.scentT = 1;
    this.watchCool = 0;
    const mk = () => {
      const c = critter(sim, kind, opt);
      c.brain = this;
      this.members.push(c);
      return c;
    };
    if (kind === 'bear' || kind === 'porcupine') {
      const e = randomEdge(sim, kind === 'bear' ? 180 : 60, kind === 'bear' ? 750 : 350);
      const c = mk();
      const h = off(e, kind === 'bear' ? 40 : 15);
      c.place(h.x, h.z, Math.atan2(e.nz, -e.nx));
      this.edge = e;
      this.state = 'enter';
      this.stay = kind === 'bear' ? rand(120, 300) : rand(240, 600);
      const t = off(e, -rand(kind === 'bear' ? 20 : 8, kind === 'bear' ? 60 : 30));
      c.goTo(t.x, t.z);
    } else if (kind === 'wolf' || kind === 'coyote') {
      const e = randomEdge(sim, 200, 800);
      const n = opt.n || randi(this.S.group[0], this.S.group[1]);
      const far = edgeAt(Math.atan2(e.nz, e.nx) + PI + rand(-0.7, 0.7));
      for (let i = 0; i < n; i++) {
        const c = mk();
        const h = off(e, 40 + i * 5);
        c.place(h.x + rand(-3, 3), h.z + rand(-3, 3), Math.atan2(e.nz, -e.nx));
      }
      this.path = [
        off(e, -rand(30, 80)),
        { x: lerp(e.x, far.x, 0.5) + rand(-60, 60), z: lerp(e.z, far.z, 0.5) + rand(-60, 60) },
        off(far, -10),
        off(far, 120),
      ];
      this.pi = 0;
      this.state = 'travel';
      this.pause = 0;
      this.members[0].goTo(this.path[0].x, this.path[0].z, 'trot');
      if (chance(0.6)) sim.emit({ e: 'amb', cat: kind === 'wolf' ? 'wolves' : 'coyotes', band: 'far', gain: 1.5 });
    } else if (kind === 'rabbit') {
      // along the brushy edge, somewhere a hunter might see it
      const e = randomEdge(sim, 40, 260);
      const a0 = Math.atan2(e.nz, e.nx),
        dir = chance(0.5) ? 1 : -1;
      this.route = [];
      for (let i = 0; i < 10; i++) this.route.push(off(edgeAt(a0 + dir * i * rand(0.008, 0.02)), -rand(1, 14)));
      const c = mk();
      const h = off(e, 4);
      c.place(h.x, h.z, Math.atan2(e.nz, -e.nx));
      this.ri = 0;
      this.state = 'hop';
      c.goTo(this.route[0].x, this.route[0].z);
      this.stay = rand(90, 300);
      this.edge = e;
    } else {
      const ref = sim.pickHunter() || sim.stands[0];
      const pts = STREAM.filter(
        (p) =>
          marshE(p.x, p.z) < -0.03 &&
          Math.hypot(p.x - ref.x, p.z - ref.z) > 80 &&
          Math.hypot(p.x - ref.x, p.z - ref.z) < 420 &&
          sim.nearestHunter(p.x, p.z).d > 80,
      );
      if (!pts.length) {
        this.done = true;
        return;
      }
      const i0 = STREAM.indexOf(pick(pts));
      this.route = [];
      const dir = chance(0.5) ? 1 : -1;
      for (let i = 0; i < 14; i++) {
        const p = STREAM[clamp(i0 + dir * i * 6, 0, STREAM.length - 1)];
        const sd = rand(2.5, 4) * (chance(0.5) ? 1 : -1);
        this.route.push({ x: p.x + sd * 0.7, z: p.z + sd * 0.7 });
      }
      const c = mk();
      c.place(this.route[0].x, this.route[0].z, 0);
      this.ri = 1;
      this.state = 'bank';
      c.goTo(this.route[1].x, this.route[1].z);
    }
    if (opt.at) {
      const L = this.members[0];
      this.members.forEach((m, i) => m.place(opt.at.x + i * 2.5, opt.at.z + rand(-1, 1), opt.h || 0));
      L.halt();
      this.resume();
    }
  }
  get lead() {
    return this.members[0];
  }
  setState(s, timer) {
    this.state = s;
    this.st = 0;
    if (timer != null) this.timer = timer;
  }
  bolt(from, why) {
    if (this.state === 'bolt') return;
    this.setState('bolt');
    this.why = why || '';
    this.boltFrom = { x: from.x, z: from.z };
    this.zigT = 0;
    for (const c of this.members) {
      const t =
        this.kind === 'rabbit'
          ? off(edgeAwayFrom(this.sim, c.x, c.z, from.x, from.z), 30)
          : off(edgeAwayFrom(this.sim, c.x, c.z, from.x, from.z), 150);
      c.forageOn = false;
      c.quillsOn = false;
      c.escape = t;
      c.goTo(t.x, t.z, 'run');
    }
    if (this.kind === 'bear' || this.kind === 'wolf' || this.kind === 'coyote')
      this.sim.emit({
        e: 'brush',
        x: this.lead.x,
        z: this.lead.z,
        len: rand(2, 3),
        gain: 1.6,
        rate: 1.3,
        bus: 'wildlife',
      });
    if (why) this.sim.note(`${this.kind} ${why}`);
  }
  // back to its routine after a scare, a chase or a meal
  resume() {
    const L = this.lead;
    this.prey = null;
    for (const m of this.members) {
      m.quillsOn = false;
      m.forageOn = false;
      m.look = null;
    }
    if (this.kind === 'bear' || this.kind === 'porcupine') {
      this.setState('forage', rand(10, 30));
      L.halt();
      L.forageOn = true;
    } else if (this.kind === 'wolf' || this.kind === 'coyote') {
      this.setState('travel');
      this.pause = 0;
      const p = this.path[Math.min(this.pi, this.path.length - 1)];
      L.goTo(p.x, p.z, 'trot');
    } else if (this.kind === 'rabbit') {
      this.setState('feed', rand(4, 15));
      L.halt();
      L.forageOn = true;
    } else {
      this.setState('bank');
      const r = this.route[Math.min(this.ri, this.route.length - 1)];
      L.goTo(r.x, r.z);
    }
  }
  leave(depth = 120) {
    this.setState('leave');
    const L = this.lead;
    const e = nearestEdge(this.sim, L.x, L.z);
    const t = off(e, depth);
    for (const m of this.members) {
      m.forageOn = false;
      m.quillsOn = false;
    }
    L.goTo(t.x, t.z);
  }
  caught(by) {
    this.done = true;
    this.sim.note(`${this.kind} caught by a ${by.kind}`);
    for (const c of this.members) c.remove();
  }
  // the pack follows the leader in single file
  follow() {
    this.members.forEach((c, i) => {
      if (i === 0) return;
      const lead = this.members[i - 1];
      const bx = lead.x - Math.cos(lead.h) * 2.5 * lead.scale,
        bz = lead.z + Math.sin(lead.h) * 2.5 * lead.scale;
      const d = Math.hypot(bx - c.x, bz - c.z);
      if (d > 1.5) c.goTo(bx, bz, d > 8 ? 'run' : lead.speed > 2 ? 'trot' : 'walk');
      else if (lead.speed < 0.2) c.halt();
      c.forageOn = lead.forageOn && c.speed < 0.3;
    });
  }
  update(dt) {
    this.t += dt;
    this.st += dt;
    for (const c of this.members) c.update(dt);
    const L = this.lead;
    if (!L) {
      this.done = true;
      return;
    }
    const G = this.sim;
    switch (this.state) {
      case 'enter':
        if (L.arrived) {
          L.arrived = false;
          this.setState('forage', rand(15, 45));
          L.forageOn = true;
        }
        break;
      case 'forage':
        if (this.st > this.timer) {
          if (this.t > this.stay) this.leave(this.kind === 'bear' ? 120 : 40);
          else {
            L.forageOn = false;
            const a = rand(0, TAU),
              r = this.kind === 'porcupine' ? rand(3, 10) : rand(8, 30);
            let x = L.x + Math.cos(a) * r,
              z = L.z + Math.sin(a) * r;
            if (marshE(x, z) > 0.02) {
              x = L.x;
              z = L.z;
            }
            L.goTo(x, z);
            this.setState('amble');
          }
        }
        break;
      case 'amble':
        if (L.arrived) {
          L.arrived = false;
          L.forageOn = true;
          this.setState('forage', this.kind === 'porcupine' ? rand(30, 90) : rand(15, 50));
        }
        break;
      case 'leave':
        if (outDist(L.x, L.z) > (this.kind === 'rabbit' || this.kind === 'porcupine' ? 25 : 100) || this.st > 120)
          this.done = true;
        break;
      case 'bolt':
        if (this.kind === 'rabbit') {
          // zig-zag: short dashes off line toward cover
          this.zigT -= dt;
          if (this.zigT <= 0 && L.escape) {
            this.zigT = rand(0.4, 1.0);
            const dx = L.escape.x - L.x,
              dz = L.escape.z - L.z,
              d = Math.hypot(dx, dz) || 1,
              s = rand(-0.9, 0.9);
            const step = Math.min(d, rand(6, 12));
            L.goTo(L.x + (dx / d) * step - (dz / d) * s * step, L.z + (dz / d) * step + (dx / d) * s * step, 'run');
            if (d < 4) L.goTo(L.escape.x, L.escape.z, 'run');
          }
        }
        if (outDist(L.x, L.z) > (this.kind === 'rabbit' ? 20 : 100) || this.st > 90) this.done = true;
        break;
      case 'travel': {
        if (this.pause > 0) {
          this.pause -= dt;
          if (this.pause <= 0) {
            L.forageOn = false;
            L.goTo(this.path[this.pi].x, this.path[this.pi].z, 'trot');
          }
        } else if (L.arrived) {
          L.arrived = false;
          this.pi++;
          if (this.pi >= this.path.length) {
            this.done = true;
            break;
          }
          if (chance(0.5) && this.pi < 3) {
            this.pause = rand(5, 15);
            L.halt();
            L.forageOn = chance(0.5);
          } else L.goTo(this.path[this.pi].x, this.path[this.pi].z, 'trot');
        }
        this.follow();
        break;
      }
      case 'bank':
        if (L.arrived) {
          L.arrived = false;
          if (chance(0.4)) {
            L.forageOn = true;
            this.pause = rand(6, 18);
            this.state = 'dabble';
          } else {
            this.ri++;
            if (this.ri >= this.route.length) this.leave(60);
            else L.goTo(this.route[this.ri].x, this.route[this.ri].z);
          }
        }
        break;
      case 'dabble':
        this.pause -= dt;
        if (this.pause <= 0) {
          L.forageOn = false;
          this.ri++;
          if (this.ri >= this.route.length) this.leave(60);
          else {
            L.goTo(this.route[this.ri].x, this.route[this.ri].z);
            this.state = 'bank';
          }
        }
        break;
      case 'hop': // hare: a few hops to the next patch of browse
        if (L.arrived) {
          L.arrived = false;
          this.setState('feed', rand(4, 18));
          L.forageOn = true;
          if (chance(0.25)) L.alert(rand(2, 5));
        }
        break;
      case 'feed':
        if (this.st > this.timer) {
          L.forageOn = false;
          if (this.t > this.stay) {
            this.leave(15);
            break;
          }
          if (chance(0.3)) {
            L.alert(rand(3, 7));
            this.timer = this.st + rand(3, 7);
            L.forageOn = false;
            break;
          } // sits up and listens
          this.ri = (this.ri + 1) % this.route.length;
          const p = this.route[this.ri];
          L.goTo(p.x + rand(-2, 2), p.z + rand(-2, 2), chance(0.2) ? 'trot' : 'walk');
          this.setState('hop');
        }
        break;
      case 'freeze':
        for (const m of this.members) {
          m.halt();
          m.alert(1);
        }
        if (this.st > 25) this.resume();
        break;
      case 'quills': {
        const o = this.threatB;
        L.quillsOn = true;
        L.alert(1);
        if (o && !o.removed) {
          const away = Math.atan2(-(L.z - o.z), L.x - o.x);
          let df = away - L.h;
          while (df > PI) df -= TAU;
          while (df < -PI) df += TAU;
          L.h += clamp(df, -1.2 * dt, 1.2 * dt);
        }
        if (this.st > 40) this.resume();
        break;
      }
      case 'watch':
        for (const m of this.members) {
          m.halt();
          m.forageOn = false;
          if (this.threatB) m.look = this.threatB;
        }
        if (this.st > this.timer) {
          this.watchCool = G.time + 20;
          this.resume();
        }
        break;
      case 'avoid':
        if (L.arrived || this.st > 18) {
          L.arrived = false;
          this.resume();
        }
        this.follow();
        break;
      case 'eat':
        if (this.st > this.timer) this.resume();
        break;
      case 'stalk':
      case 'test':
      case 'chase':
        this.hunt(dt);
        break;
    }
    // winded or too close to any hunter: they bolt (hares freeze first; porcupines just raise their quills)
    this.scentT -= dt;
    if (this.scentT <= 0 && !['bolt', 'leave'].includes(this.state) && !this.done) {
      this.scentT = 1;
      for (const h of G.hunters.values()) {
        const d = L.distTo(h) || 1;
        const dx = (L.x - h.x) / d,
          dz = (L.z - h.z) / d;
        const winded = d < 300 && dx * G.wind.tx + dz * G.wind.tz > Math.cos(0.4);
        if (this.kind === 'porcupine') {
          if (d < 14 && this.state !== 'quills') {
            this.threatB = h;
            this.setState('quills');
            L.halt();
            L.forageOn = false;
          }
          continue;
        }
        if (this.kind === 'rabbit') {
          if (d < 9) {
            this.bolt(h, 'bolted from a hunter');
            break;
          }
          if (d < 22 && ROUTINE.has(this.state)) {
            this.setState('freeze');
            break;
          }
          continue;
        }
        if ((winded && chance(0.25)) || d < 35) {
          this.bolt(h, winded ? 'winded a hunter' : 'saw a hunter');
          break;
        }
      }
    }
    if (this.done) for (const c of this.members) c.remove();
  }
  // a predator after something: stalk (creep in) → chase; test (circle a cow and calf) → chase if they run
  hunt(dt) {
    const L = this.lead,
      P = this.prey,
      G = this.sim;
    if (!P || P.removed) {
      this.resume();
      return;
    }
    const d = distB(L, P);
    this.retT = (this.retT || 0) - dt;
    if (this.state === 'stalk') {
      if (this.retT <= 0) {
        this.retT = 1;
        L.forageOn = false;
        L.goTo(P.x, P.z, d > 40 ? 'trot' : 'walk');
      } // trot in, creep the last bit
      this.follow();
      if (d < 14 || (P.brain && P.brain.state === 'bolt' && d < 60)) {
        this.setState('chase');
        this.retT = 0;
        G.emit({ e: 'brush', x: L.x, z: L.z, len: 1.2, gain: 1, bus: 'wildlife' });
      }
      if (this.st > 120) this.resume();
    } else if (this.state === 'test') {
      const keep = this.keepD || (this.keepD = between(this.rule.keep || [30, 50]));
      if (this.retT <= 0) {
        this.retT = rand(2.5, 4);
        this.circA =
          (this.circA == null ? Math.atan2(L.z - P.z, L.x - P.x) : this.circA) +
          rand(0.25, 0.5) * (this.circDir || (this.circDir = chance(0.5) ? 1 : -1));
        L.goTo(
          P.x + Math.cos(this.circA) * keep,
          P.z + Math.sin(this.circA) * keep,
          this.kind === 'bear' ? 'walk' : d > keep * 1.6 ? 'trot' : 'walk',
        );
      }
      L.look = P;
      this.follow();
      const pb = P.brain;
      if (pb && (pb.state === 'flee' || pb.state === 'retreat') && d < 160) {
        this.setState('chase');
        this.retT = 0;
        G.note(`${this.kind} chases the fleeing ${P.kind}`);
      } else if (this.st > this.testT) {
        G.note(`${this.kind} gave up on the ${P.kind}`);
        this.resume();
      }
    } else {
      // chase: everyone runs at it
      if (this.retT <= 0) {
        this.retT = 0.4;
        for (const m of this.members) m.goTo(P.x, P.z, 'run');
      }
      this.chaseT -= dt;
      if (P.kind === 'rabbit' && d < 1.6 && !this.triedCatch) {
        this.triedCatch = true;
        if (chance(0.3)) {
          P.brain.caught(L);
          this.setState('eat', rand(20, 45));
          L.halt();
          L.forageOn = true;
          return;
        }
      }
      if (P.kind === 'rabbit' && P.brain && P.brain.state !== 'bolt' && d < 22)
        P.brain.bolt(L, 'bolted from a ' + this.kind);
      if (this.chaseT <= 0 || outDist(P.x, P.z) > 40 || d > 180) {
        G.note(`${this.kind} gave up the chase`);
        this.triedCatch = false;
        for (const m of this.members) m.halt();
        this.resume();
      }
    }
  }
  // twice a second: anything to react to? anything worth going after?
  sense(all) {
    if (this.done || this.sim.frozen || ['bolt', 'leave', 'eat'].includes(this.state)) return;
    const L = this.lead;
    if (!L) return;
    const own = new Set(this.members);
    const t = threat(L, L.eco.role, L.traits, all, (o) => own.has(o));
    if (t && this.reactTo(t)) return;
    if (!t && ['freeze', 'quills'].includes(this.state) && this.st > 3) {
      this.resume();
      return;
    }
    const P = PREY[this.kind];
    if (!P || !['forage', 'amble', 'travel'].includes(this.state) || this.t < 8) return;
    let best = null;
    const see = SENSES[this.kind].see;
    for (const o of all) {
      if (own.has(o) || o.removed) continue;
      const pr = P[o.eco.role];
      if (!pr) continue;
      const d = distB(L, o);
      if (d < see && (!best || d < best.d)) best = { o, d, pr };
    }
    if (!best || (this.tried && this.tried.has(best.o.id))) return;
    if (!chance(best.pr.p * 0.25 * lerp(0.6, 1.4, L.traits.aggressive))) return;
    (this.tried || (this.tried = new Set())).add(best.o.id);
    this.prey = best.o;
    this.rule = best.pr;
    this.keepD = 0;
    this.circA = null;
    this.chaseT = between(best.pr.chase);
    this.testT = rand(20, 45);
    this.retT = 0;
    this.setState(best.pr.act === 'hunt' ? 'stalk' : 'test');
    this.sim.note(`${this.kind} ${best.pr.act === 'hunt' ? 'stalks' : 'tests'} a ${best.o.kind}`);
  }
  reactTo(t) {
    const o = t.other,
      L = this.lead;
    if (t.act === 'flee') {
      this.bolt(o, `ran from a ${o.kind}`);
      return true;
    }
    if (t.act === 'avoid' || t.act === 'yield') {
      if (this.state !== 'avoid') {
        const p = awayFrom(L, o, rand(35, 70), false);
        L.forageOn = false;
        L.quillsOn = false;
        L.goTo(p.x, p.z, this.kind === 'porcupine' ? 'walk' : 'trot');
        this.setState('avoid');
        this.sim.note(`${this.kind} gives way to a ${o.kind}`);
      }
      return true;
    }
    if (t.act === 'freeze') {
      if (this.state !== 'freeze') {
        this.setState('freeze');
        for (const m of this.members) {
          m.forageOn = false;
          m.look = o;
          m.alert(4);
        }
      }
      return true;
    }
    if (t.act === 'quills') {
      this.threatB = o;
      if (this.state !== 'quills') {
        this.setState('quills');
        L.halt();
        L.forageOn = false;
        this.sim.note(`porcupine raises its quills at a ${o.kind}`);
      }
      return true;
    }
    if (t.act === 'watch' && ROUTINE.has(this.state) && this.sim.time > this.watchCool) {
      this.threatB = o;
      this.setState('watch', rand(5, 12));
      return true;
    }
    return false;
  }
  label() {
    const L = this.lead;
    return L
      ? `${this.kind}${this.members.length > 1 ? ' ×' + this.members.length : ''} (${L.sizeName}, ${L.coatName})`
      : this.kind;
  }
}
