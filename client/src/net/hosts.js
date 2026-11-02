// Where the animals come from. Both hosts look the same to the game loop:
//   join(name, stand) -> Promise<{ you, hunters }>    seats this player at a stand
//   update(dt)        -> { events, states }           states: Map id -> { x, z, h, speed, mode, flags, look, shuffle }
//   call(type, dur, clip), pour(), cmd(name), debugText()
// LocalHost runs the simulation right here in the tab (solo play, works offline and on GitHub Pages).
// RemoteHost talks to the marsh server, which runs one simulation for everyone, and draws its snapshots
// a little in the past so motion between them can be interpolated smoothly.
import { Sim } from '../../../shared/sim/sim.js';
import { Bull } from '../../../shared/sim/bull.js';
import { MODES } from '../../../shared/sim/body.js';
import { applyWind, WIND } from '../../../shared/wind.js';
import { wrapA } from '../../../shared/util.js';
import { INTERP_DELAY, PROTOCOL_VERSION } from '../../../shared/protocol.js';

const rowState = (r) => ({ x: r[1], z: r[2], h: r[3], speed: r[4], mode: MODES[r[5]] || 'walk', flags: r[6], look: r[7] == null ? null : { x: r[7], z: r[8] }, shuffle: r[9] });

export class LocalHost {
  constructor(opt = {}) { this.local = true; this.sim = new Sim({ log: !!opt.log }); this.me = 'me'; }
  async join(name, stand) {
    const you = this.sim.addHunter(this.me, name, stand);
    return { you, hunters: this.sim.hunterList() };
  }
  scenario(name, q) { this.sim.scenario(name, q); }
  update(dt) {
    this.sim.update(dt);
    const states = new Map();
    for (const b of this.sim.bodies.values()) states.set(b.id, { x: b.x, z: b.z, h: b.h, speed: b.speed, mode: b.mode, flags: b.flags(), look: b.look, shuffle: b.shuffle || 0 });
    return { events: this.sim.takeEvents(), states };
  }
  call(type, dur, clip) { this.sim.hunterCall(this.me, type, dur, clip); }
  pour() { this.sim.hunterPour(this.me); }
  cmd(c) {   // debug keys (G panel): N = a new bull now, M = a second bull
    const s = this.sim, H = s.hunters.get(this.me);
    if (c === 'newBull') { for (const b of s.bulls) b.dispose(); s.bulls = [new Bull(s, { focus: H })]; }
    else if (c === 'secondBull' && s.bulls.length < 3) s.bulls.push(new Bull(s, { second: true, interest: 1, focus: H }));
  }
  debugText() { return 'solo — the marsh runs in this tab\n' + this.sim.debugText(); }
  get hunters() { return this.sim.hunterList(); }
}

export class RemoteHost {
  constructor(url) { this.local = false; this.url = url; this.snaps = []; this.queue = []; this.hunters = []; this.offset = null; this.ping = 0; this.onHunters = null; this.onClose = null; this.stats = { bytes: 0, msgs: 0 }; }
  join(name, stand) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = this.ws = new WebSocket(this.url); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => reject(new Error('no answer from ' + this.url)), 8000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name, stand }));
      ws.onerror = () => { clearTimeout(timer); reject(new Error('could not reach ' + this.url)); };
      ws.onclose = () => { this.closed = true; this.onClose && this.onClose(); };
      ws.onmessage = (m) => {
        this.stats.bytes += m.data.length; this.stats.msgs++;
        const msg = JSON.parse(m.data);
        if (msg.t === 'welcome') {
          clearTimeout(timer); this.me = msg.you.id; this.hunters = msg.hunters;
          for (const a of msg.spawns) this.queue.push({ t: -1e9, ev: { e: 'spawn', a } });
          this.addSnap(msg.snap); resolve({ you: msg.you, hunters: msg.hunters });
          this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
        } else if (msg.t === 'full') { clearTimeout(timer); reject(new Error('every stand on this marsh is taken')); }
        else if (msg.t === 'tick') { this.addSnap(msg.snap); for (const ev of msg.ev || []) this.queue.push({ t: msg.snap.t, ev }); }
        else if (msg.t === 'hunters') { this.hunters = msg.list; this.onHunters && this.onHunters(msg.list); }
        else if (msg.t === 'pong') this.ping = performance.now() - msg.c;
      };
    });
  }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  addSnap(s) {
    const now = performance.now() / 1000; const rows = new Map(); for (const r of s.a) rows.set(r[0], r);
    this.snaps.push({ t: s.t, rows, wind: s.wind });
    const off = s.t - now;   // server clock minus ours; keep the smallest lag seen (least network delay), drift slowly
    this.offset = this.offset == null ? off : Math.max(off, this.offset + (off - this.offset) * 0.02);
    if (this.snaps.length > 60) this.snaps.shift();
  }
  update() {
    const states = new Map(), events = [];
    if (!this.snaps.length) return { events, states };
    const rt = performance.now() / 1000 + this.offset - INTERP_DELAY;   // the moment we draw (server time)
    while (this.queue.length && this.queue[0].t <= rt) events.push(this.queue.shift().ev);
    let i = this.snaps.length - 1; while (i > 0 && this.snaps[i - 1].t > rt) i--;
    const s1 = this.snaps[i], s0 = this.snaps[i - 1] || s1;
    const k = s1.t > s0.t ? Math.max(0, Math.min(1.5, (rt - s0.t) / (s1.t - s0.t))) : 1;   // a little extrapolation if packets are late
    for (const [id, r1] of s1.rows) {
      const r0 = s0.rows.get(id) || r1; const st = rowState(r1);
      if (r0 !== r1) { st.x = r0[1] + (r1[1] - r0[1]) * k; st.z = r0[2] + (r1[2] - r0[2]) * k; st.h = r0[3] + wrapA(r1[3] - r0[3]) * Math.min(k, 1); st.speed = r0[4] + (r1[4] - r0[4]) * Math.min(k, 1); }
      states.set(id, st);
    }
    applyWind(s1.wind);
    return { events, states };
  }
  call(type, dur, clip) { this.send({ t: 'call', type, dur, clip }); }
  pour() { this.send({ t: 'pour' }); }
  cmd() {}
  debugText() {
    return `online — ${this.url}\n${this.hunters.length} hunter(s): ${this.hunters.map((h) => h.name + ' @' + h.stand).join(', ')}\nping ${this.ping.toFixed(0)} ms · ${(this.stats.bytes / 1024).toFixed(0)} KB received\nwind ${WIND.from.toFixed(0)}° ${WIND.speed.toFixed(1)} m/s`;
  }
}
