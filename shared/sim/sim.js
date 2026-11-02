// The host: owns every animal and every hunter in one marsh, steps the behaviour, and hands out
// snapshots (where everything is) and events (sounds and splashes the browsers should play).
// The same code runs in the multiplayer server and, for solo play, inside the browser tab.
import { PI, rand, chance, newSeed } from '../util.js';
import { buildWorld, STANDS, groundAt } from '../world.js';
import { newWind, initWind, updateWind, windState } from '../wind.js';
import { MODES } from './body.js';
import { Bull, updateRivals } from './bull.js';
import { CowGroup } from './cows.js';
import { WildEvent, critter } from './wildlife.js';

const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;

export class Sim {
  constructor(opt = {}) {
    buildWorld(); this.wind = initWind(newWind());   // this marsh's own wind
    this.time = 0; this.ids = 0; this.events = []; this.timers = []; this.bodies = new Map(); this.hunters = new Map();
    this.bulls = []; this.cows = []; this.wild = []; this.stands = STANDS;
    this.nextBull = rand(8, 20); this.nextCow = rand(45, 110);
    this.wildNext = { bear: rand(240, 600), canid: rand(300, 650), raccoon: rand(150, 360) };
    this.frozen = false; this.alwaysFight = false; this.forceTwo = false; this.log = opt.log ? [] : null;
  }
  // ---- plumbing used by the animals ----
  seed() { return newSeed(); }
  newId() { return ++this.ids; }
  addBody(b) { this.bodies.set(b.id, b); this.emit({ e: 'spawn', a: { id: b.id, kind: b.kind, vis: b.vis } }); }
  removeBody(b) { if (this.bodies.delete(b.id)) this.emit({ e: 'gone', id: b.id }); }
  emit(ev) { this.events.push(ev); }
  takeEvents() { const e = this.events; this.events = []; return e; }
  after(t, fn) { this.timers.push({ at: this.time + t, fn }); }
  // ---- hunters ----
  freeStands() { const used = new Set([...this.hunters.values()].map(h => h.stand)); return STANDS.filter(s => !used.has(s.i)); }
  addHunter(id, name = 'Hunter', want) {
    const free = this.freeStands(); if (!free.length) return null;
    const s = free.find(s => s.i === want) || free[0];
    const H = { id, name: String(name).slice(0, 24), stand: s.i, x: s.x, z: s.z, y: s.y, eye: s.eye, yaw: s.yaw, fx: -Math.sin(s.yaw), fz: -Math.cos(s.yaw),
      lastCallEnd: -999, callEnd: 0, calls: [], secondTried: false };
    this.hunters.set(id, H);
    if (this.hunters.size === 1 && !this.cows.length && !this.frozen) this.cows.push(new CowGroup(this, true));
    return H;
  }
  removeHunter(id) { this.hunters.delete(id); }
  hunterList() { return [...this.hunters.values()].map(h => ({ id: h.id, name: h.name, stand: h.stand })); }
  nearestHunter(x, z) { let h = null, d = 1e9; for (const H of this.hunters.values()) { const dd = Math.hypot(H.x - x, H.z - z); if (dd < d) { d = dd; h = H; } } return { h, d }; }
  pickHunter() {   // the hunter with the fewest bulls already working toward them
    let best = null, bn = 1e9;
    for (const H of this.hunters.values()) { const n = this.bulls.filter(b => b.focus === H).length + Math.random() * 0.5; if (n < bn) { bn = n; best = H; } }
    return best;
  }
  maxBulls() { const n = this.hunters.size; return n ? Math.min(4, 1 + Math.floor((n - 1) / 2)) : 0; }
  maxCows() { return 2 + Math.floor(this.hunters.size / 3); }
  // ---- what hunters do ----
  hunterCall(id, type, dur, clip) {
    const H = this.hunters.get(id); if (!H || this.time < H.callEnd - 0.2) return false;
    type = type === 'coax' ? 'coax' : 'long'; dur = Math.min(Math.max(+dur || 3, 0.5), 15);
    const tooOften = this.time - H.lastCallEnd < 30; H.callEnd = this.time + dur; H.lastCallEnd = H.callEnd;
    H.calls.push(this.time); H.calls = H.calls.filter(t => this.time - t < 600);
    this.emit({ e: 'call', hunter: id, clip: String(clip || '').slice(0, 80), type });
    for (const bl of this.bulls) { const delay = bl.a.distTo(H) / 343 + Math.min(dur, 3) * 0.5; this.after(delay, () => { if (this.bulls.includes(bl)) bl.heardCall(H, type, tooOften); }); }
    for (const c of this.cows) { const delay = c.cow.distTo(H) / 343 + 0.5; this.after(delay, () => { if (this.cows.includes(c)) c.heardCall(H, type, tooOften); }); }
    // rarely, a second bull answers while one is already out
    const first = this.bulls.find(b => b.everSeen && b.focus === H);
    if (first && !H.secondTried && H.calls.length >= 2 && this.bulls.length <= this.maxBulls()) {
      H.secondTried = true;
      if (chance(this.forceTwo ? 1 : 0.22)) this.after(rand(4, 15), () => { if (this.hunters.has(id) && this.bulls.length <= this.maxBulls()) this.bulls.push(new Bull(this, { second: true, avoid: first.edge, interest: 0.95, focus: H })); });
    }
    return true;
  }
  hunterPour(id) {
    const H = this.hunters.get(id); if (!H) return;
    this.emit({ e: 'pour', hunter: id });
    this.after(1.5, () => { for (const b of this.bulls) b.heardPour(H); for (const c of this.cows) c.heardPour(H); });
  }
  // ---- the clock ----
  update(dt) {
    this.time += dt; updateWind(this.wind, dt);
    for (let i = 0; i < this.timers.length; i++) { const t = this.timers[i]; if (t.at <= this.time) { this.timers.splice(i--, 1); t.fn(); } }
    if (this.frozen) { for (const b of this.bodies.values()) b.update(dt); return; }
    const hasHunters = this.hunters.size > 0;
    // bulls: one per two hunters (max four), each drawn toward the hunter who has the fewest
    if (hasHunters && this.bulls.length < this.maxBulls()) {
      this.nextBull -= dt;
      if (this.nextBull <= 0) { this.bulls.push(new Bull(this)); this.nextBull = rand(30, 75); for (const H of this.hunters.values()) H.secondTried = false; }
    }
    for (const b of this.bulls) b.update(dt);
    for (let i = this.bulls.length - 1; i >= 0; i--) {
      const b = this.bulls[i];
      if (b.done) { this.note(`DONE #${b.id} ${b.p.cls.k} (${b.p.style}) seen=${b.everSeen} reason=${b.reason || '?'} lastState=${b.state}`); b.dispose(); this.bulls.splice(i, 1); this.nextBull = Math.max(this.nextBull, rand(30, 75)); }
    }
    updateRivals(this);
    for (const c of this.cows) c.update(dt);
    for (let i = this.cows.length - 1; i >= 0; i--) if (this.cows[i].done) { this.cows[i].dispose(); this.cows.splice(i, 1); }
    if (hasHunters) { this.nextCow -= dt; if (this.nextCow <= 0) { this.nextCow = rand(60, 150); if (this.cows.length < this.maxCows() && chance(0.8)) this.cows.push(new CowGroup(this, false)); } }
    if (hasHunters) this.updateWildlife(dt); else for (const e of this.wild) e.update(dt);
    for (let i = this.wild.length - 1; i >= 0; i--) if (this.wild[i].done) this.wild.splice(i, 1);
    if (this.log) for (const b of this.bulls) if (b.state !== b.__ls) { b.__ls = b.state; this.note(`#${b.id} ${b.p.cls.k}/${b.p.style} -> ${b.state} d=${Math.round(b.d())} int=${b.interest.toFixed(2)}${b.rival ? ' rival#' + b.rival.id : ''} ${b.reason || ''}`); }
  }
  updateWildlife(dt) {
    const W = this.wildNext, has = k => this.wild.some(e => k.includes(e.kind));
    for (const k in W) {
      W[k] -= dt; if (W[k] > 0) continue;
      if (k === 'bear') { W[k] = rand(480, 900); if (!has(['bear']) && chance(0.55)) this.wild.push(new WildEvent(this, 'bear')); }
      else if (k === 'canid') { W[k] = rand(420, 840); if (!has(['wolf', 'coyote']) && chance(0.55)) this.wild.push(new WildEvent(this, chance(0.6) ? 'coyote' : 'wolf')); }
      else { W[k] = rand(300, 600); if (!has(['raccoon']) && chance(0.6)) this.wild.push(new WildEvent(this, 'raccoon')); }
    }
    for (const e of this.wild) e.update(dt);
  }
  note(s) { if (this.log) { this.log.push(Math.round(this.time) + 's ' + s); if (this.log.length > 400) this.log.shift(); } }
  // ---- what gets sent ----
  // one row per animal: [id, x, z, heading, speed, gait 0/1/2, flags, lookX, lookZ, shuffle]
  snapshot() {
    const rows = [];
    for (const b of this.bodies.values()) {
      const L = b.look; rows.push([b.id, r2(b.x), r2(b.z), r3(b.h), r2(b.speed), MODES.indexOf(b.mode), b.flags(), L ? r1(L.x) : null, L ? r1(L.z) : null, r2(b.shuffle || 0)]);
    }
    return { t: r3(this.time), wind: windState(this.wind), a: rows };
  }
  spawnList() { return [...this.bodies.values()].map(b => ({ id: b.id, kind: b.kind, vis: b.vis })); }
  debugText() {
    const L = []; L.push(`t ${this.time.toFixed(0)}s · hunters ${this.hunters.size} · wind ${this.wind.from.toFixed(0)}° ${this.wind.speed.toFixed(1)} m/s${this.wind.swirl > 0.1 ? ' (swirling)' : ''}`);
    for (const b of this.bulls) L.push(`bull #${b.id} ${b.p.cls.k}, ${b.p.style}, ${b.p.spreadIn}" ${b.p.points}pt — ${b.state} · ${Math.round(b.d())} m from ${b.hunter() ? b.hunter().name : '—'} · interest ${b.interest.toFixed(2)} susp ${b.susp.toFixed(2)}`);
    if (!this.bulls.length) L.push(`next bull in ${Math.max(0, this.nextBull).toFixed(0)}s`);
    for (const c of this.cows) L.push(`cow #${c.cow.id} +${c.calves.length} calf — ${c.state} · ${Math.round(c.cow.dist())} m`);
    for (const e of this.wild) L.push(`${e.kind} — ${e.state}`);
    return L.join('\n');
  }
  // ---- test scenes and the showcase (q(name) reads a URL parameter) ----
  scenario(name, q = () => null) {
    const H = this.hunters.values().next().value || STANDS[0]; const num = (k, d) => (q(k) != null ? +q(k) : d);
    const clear = () => { for (const b of this.bulls) b.dispose(); for (const c of this.cows) c.dispose(); this.bulls = []; this.cows = []; };
    if (q('bullnow') != null) this.nextBull = 0.5;
    if (q('frozen') != null) this.frozen = true;
    if (q('two') != null) this.forceTwo = true;
    if (name === 'showcase') {
      const b = new Bull(this, { refBull: true, focus: H }); b.showcase = true; b.everSeen = true;
      b.a.place(H.x, H.z - 137, num('h', -1.05)); b.hold(1e9); b.hangupAt = 1e12; b.dispT = rand(6, 10); b.a.look = H; this.bulls.unshift(b); this.nextBull = 600;
    } else if (name === 'bull') {
      clear(); const b = new Bull(this, { focus: H }); this.bulls = [b]; b.a.place(H.x + num('dx', 15), H.z - num('dist', 140), num('h', 2.6)); b.hold(1e9); b.dispT = 1e9; b.a.look = H;
    } else if (name === 'wild') {
      clear(); this.frozen = true; const kinds = (q('kinds') || 'bear,wolf,coyote,raccoon').split(',');
      kinds.forEach((k, i) => { const c = critter(this, k); c.place(H.x - 9 + i * 6, H.z - num('dist', 30), num('h', 0)); if (q('walk') != null) c.goTo(c.x + 60, c.z, q('walk') === 'trot' ? 'trot' : 'walk'); else if (q('forage') != null) c.forageOn = true; });
    } else if (name === 'antlers') {
      clear(); this.frozen = true; const z = H.z - num('dist', 40);
      for (let c = 0; c < 5; c++) { const b = new Bull(this, { cls: c, focus: H }); b.a.place(H.x - 12 + c * 6, z, num('h', -1.2)); b.hold(1e9); b.dispT = 1e9; b.a.look = null; this.bulls.push(b); }
    } else if (name === 'lineup') {
      clear(); this.frozen = true; const z = H.z - num('dist', 45), h = num('h', 0);
      const b = new Bull(this, { focus: H }); b.a.place(H.x - 7, z, h); b.hold(1e9); b.dispT = 1e9; this.bulls = [b];
      const cg = new CowGroup(this, true); for (const k of cg.calves) k.remove(); cg.calves = []; cg.cow.place(H.x, z, h); cg.state = 'frozen'; this.cows = [cg];
      const k = cg.addCalf(cg.cow.scale * 0.52); k.place(H.x + 5.5, z, h);
      for (const a of [b.a, cg.cow, k]) { a.look = null; if (q('walk') != null) a.goTo(a.x + (q('walk') === 'trot' ? 400 : 60), a.z, q('walk') === 'trot' ? 'trot' : 'walk'); }
    } else if (name === 'fight') {
      clear(); this.alwaysFight = true; const A_ = new Bull(this, { focus: H }), B_ = new Bull(this, { focus: H }); this.bulls = [A_, B_]; A_.size = B_.size = 1;
      A_.a.place(H.x - 6, H.z - 80, 0); B_.a.place(H.x + 6, H.z - 80, PI);
      for (const b of [A_, B_]) { b.everSeen = true; b.hold(1e9); }
      A_.rival = B_; B_.rival = A_; A_.setState('posture'); B_.setState('posture'); A_.postureEnd = B_.postureEnd = this.time + 1;
    } else if (name === 'cows') {
      if (!this.cows.length) this.cows.push(new CowGroup(this, true));
      const c = this.cows[0]; while (c.calves.length < 1) { const k = c.addCalf(0.6); k.offA = 2.5; k.offD = 4; k.playT = 99; }
      c.cow.place(H.x - 8, H.z - 70, 0.4); c.calves.forEach((k, i) => k.place(H.x - 12 + i * 3, H.z - 66, 0.9));
    }
  }
}
export { groundAt };
