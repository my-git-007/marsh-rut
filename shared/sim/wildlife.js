// Other wildlife the host runs for everyone: a bear forages its way out into the marsh and back; a wolf
// pack or coyotes trot across; a raccoon works along the stream banks. All of them bolt if they wind a hunter.
// (Birds are scenery each browser makes for itself.)
import { PI, TAU, clamp, lerp, rand, randi, pick, chance } from '../util.js';
import { marshE, outDist, STREAM, edgeAt, off } from '../world.js';
import { WIND } from '../wind.js';
import { CritterBody, CRITTER_SPEC } from './body.js';
import { randomEdge, nearestEdge, edgeAwayFrom } from './places.js';

export function critter(sim, kind) { const sp = CRITTER_SPEC[kind]; return new CritterBody(sim, kind, { kind, scale: rand(sp.scale[0], sp.scale[1]), seed: sim.seed() }); }

export class WildEvent {
  constructor(sim, kind) {
    this.sim = sim; this.kind = kind; this.t = 0; this.st = 0; this.done = false; this.members = []; this.scentT = 1;
    if (kind === 'bear') {
      const e = randomEdge(sim, 180, 750); const c = critter(sim, 'bear'); const h = off(e, 40); c.place(h.x, h.z, Math.atan2(e.nz, -e.nx));
      this.members = [c]; this.edge = e; this.state = 'enter'; this.stay = rand(120, 300); const t = off(e, -rand(20, 60)); c.goTo(t.x, t.z);
    } else if (kind === 'wolf' || kind === 'coyote') {
      const e = randomEdge(sim, 200, 800); const n = kind === 'wolf' ? randi(2, 4) : randi(1, 2); const far = edgeAt(Math.atan2(e.nz, e.nx) + PI + rand(-0.7, 0.7));
      for (let i = 0; i < n; i++) { const c = critter(sim, kind); const h = off(e, 40 + i * 5); c.place(h.x + rand(-3, 3), h.z + rand(-3, 3), Math.atan2(e.nz, -e.nx)); this.members.push(c); }
      this.path = [off(e, -rand(30, 80)), { x: lerp(e.x, far.x, 0.5) + rand(-60, 60), z: lerp(e.z, far.z, 0.5) + rand(-60, 60) }, off(far, -10), off(far, 120)];
      this.pi = 0; this.state = 'travel'; this.lead = this.members[0]; this.pause = 0;
      this.lead.goTo(this.path[0].x, this.path[0].z, 'trot');
      if (chance(0.6)) sim.emit({ e: 'amb', cat: kind === 'wolf' ? 'wolves' : 'coyotes', band: 'far', gain: 1.5 });
    } else {
      const ref = sim.pickHunter() || sim.stands[0];
      const pts = STREAM.filter(p => marshE(p.x, p.z) < -0.03 && Math.hypot(p.x - ref.x, p.z - ref.z) > 80 && Math.hypot(p.x - ref.x, p.z - ref.z) < 420 && sim.nearestHunter(p.x, p.z).d > 80);
      if (!pts.length) { this.done = true; return; }
      const i0 = STREAM.indexOf(pick(pts)); this.route = []; const dir = chance(0.5) ? 1 : -1;
      for (let i = 0; i < 14; i++) { const p = STREAM[clamp(i0 + dir * i * 6, 0, STREAM.length - 1)]; const sd = rand(2.5, 4) * (chance(0.5) ? 1 : -1); this.route.push({ x: p.x + sd * 0.7, z: p.z + sd * 0.7 }); }
      const c = critter(sim, 'raccoon'); c.place(this.route[0].x, this.route[0].z, 0); this.members = [c]; this.ri = 1; this.state = 'bank'; c.goTo(this.route[1].x, this.route[1].z);
    }
  }
  bolt(from) {
    if (this.state === 'bolt') return; this.state = 'bolt'; this.st = 0;
    for (const c of this.members) { const e = edgeAwayFrom(this.sim, c.x, c.z, from.x, from.z); const t = off(e, 150); c.forageOn = false; c.goTo(t.x, t.z, 'run'); }
    if (this.kind !== 'raccoon') this.sim.emit({ e: 'brush', x: this.members[0].x, z: this.members[0].z, len: rand(2, 3), gain: 1.6, rate: 1.3, bus: 'wildlife' });
  }
  update(dt) {
    this.t += dt; this.st += dt; for (const c of this.members) c.update(dt); const L = this.members[0]; if (!L) { this.done = true; return; }
    const G = this.sim;
    switch (this.state) {
      case 'enter': if (L.arrived) { L.arrived = false; this.state = 'forage'; this.st = 0; L.forageOn = true; this.timer = rand(15, 45); } break;
      case 'forage':
        if (this.st > this.timer) {
          if (this.t > this.stay) { this.state = 'leave'; const e = nearestEdge(G, L.x, L.z); const t = off(e, 120); L.forageOn = false; L.goTo(t.x, t.z); }
          else { L.forageOn = false; const a = rand(0, TAU), r = rand(8, 30); let x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r; if (marshE(x, z) > 0.02) { x = L.x; z = L.z; } L.goTo(x, z); this.state = 'amble'; }
        }
        break;
      case 'amble': if (L.arrived) { L.arrived = false; L.forageOn = true; this.state = 'forage'; this.st = 0; this.timer = rand(15, 50); } break;
      case 'leave': case 'bolt': if (outDist(L.x, L.z) > 100 || this.st > 90) this.done = true; break;
      case 'travel': {
        if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0) L.goTo(this.path[this.pi].x, this.path[this.pi].z, 'trot'); }
        else if (L.arrived) {
          L.arrived = false; this.pi++; if (this.pi >= this.path.length) { this.done = true; break; }
          if (chance(0.5) && this.pi < 3) { this.pause = rand(5, 15); L.forageOn = chance(0.5); G.after(3.5, () => { L.forageOn = false; }); }
          else L.goTo(this.path[this.pi].x, this.path[this.pi].z, 'trot');
        }
        this.members.forEach((c, i) => {
          if (i === 0) return; const lead = this.members[i - 1]; const bx = lead.x - Math.cos(lead.h) * 2.5 * lead.scale, bz = lead.z + Math.sin(lead.h) * 2.5 * lead.scale;
          const d = Math.hypot(bx - c.x, bz - c.z); if (d > 1.5) c.goTo(bx, bz, d > 8 ? 'run' : lead.speed > 2 ? 'trot' : 'walk');
        });
        break;
      }
      case 'bank':
        if (L.arrived) {
          L.arrived = false;
          if (chance(0.4)) { L.forageOn = true; this.pause = rand(6, 18); this.state = 'dabble'; }
          else { this.ri++; if (this.ri >= this.route.length) { const e = nearestEdge(G, L.x, L.z); const t = off(e, 60); L.goTo(t.x, t.z); this.state = 'leave'; this.st = 0; } else L.goTo(this.route[this.ri].x, this.route[this.ri].z); }
        }
        break;
      case 'dabble':
        this.pause -= dt;
        if (this.pause <= 0) { L.forageOn = false; this.ri++; if (this.ri >= this.route.length) { this.state = 'leave'; this.st = 0; const e = nearestEdge(G, L.x, L.z); const t = off(e, 60); L.goTo(t.x, t.z); } else { L.goTo(this.route[this.ri].x, this.route[this.ri].z); this.state = 'bank'; } }
        break;
    }
    // winded or too close to any hunter: they bolt
    this.scentT -= dt;
    if (this.scentT <= 0 && this.state !== 'bolt' && this.state !== 'leave') {
      this.scentT = 1;
      for (const h of G.hunters.values()) {
        const d = L.distTo(h) || 1; const dx = (L.x - h.x) / d, dz = (L.z - h.z) / d;
        if ((d < 300 && dx * WIND.tx + dz * WIND.tz > Math.cos(0.4) && chance(0.25)) || d < 35) { this.bolt(h); break; }
      }
    }
    if (this.done) for (const c of this.members) c.remove();
  }
}
