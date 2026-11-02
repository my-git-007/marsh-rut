// audio/audio.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { TAU, chance, clamp, noise1, pick, rand, randi } from '../../../shared/util.js';
import { WIND } from '../../../shared/wind.js';
import { POND, groundAt, marshE } from '../../../shared/world.js';
import { spawnFlock } from '../render/birds.js';
import { camera } from '../render/core.js';
import { vaporFrom } from '../render/fx.js';
import { ANIMALS, PLAYER } from '../state.js';

// every recording under client/assets/sounds, as cacheable files (Vite gives each a hashed URL)
const SOUND_URLS = import.meta.glob('../../assets/sounds/**/*.{m4a,mp3,wav,ogg,aac}', { query: '?url', import: 'default', eager: true });
import onsetsUrl from '../../assets/sounds/bull-replies/onsets.json?url';
let SND_META = {};

/* ================= audio ================= */
const MIX_KEYS = [
  ['master', 'Master'],
  ['calls', 'My calls & pour'],
  ['others', 'Other hunters’ calls'],
  ['moose', 'Moose (bulls, cows, antlers, brush)'],
  ['wildlife', 'Birds & wildlife'],
  ['wind', 'Wind'],
  ['forest', 'Forest background'],
  ['fx', 'Water & other effects'],
];
const MIX = { master: 1, calls: 1, others: 1, moose: 1, wildlife: 1, wind: 1, forest: 1, fx: 1 };
try {
  const saved = JSON.parse(localStorage.getItem('marshrut-mix') || '{}');
  for (const k in MIX) if (typeof saved[k] === 'number') MIX[k] = saved[k];
} catch (e) {}
function setMix(k, v) {
  MIX[k] = v;
  try {
    localStorage.setItem('marshrut-mix', JSON.stringify(MIX));
  } catch (e) {}
  if (!A.ctx) return;
  const now = A.ctx.currentTime;
  if (k === 'master') A.out.gain.setTargetAtTime(v, now, 0.05);
  else if (A.bus && A.bus[k]) A.bus[k].gain.setTargetAtTime(v, now, 0.05);
}
const A = { ctx: null, voices: [] };
const A_ok = () => !!A.ctx;
const LP = { x: 0, y: 0, z: 0 };
function makeNoise(ctx, sec, type) {
  const len = Math.floor(ctx.sampleRate * sec),
    b = ctx.createBuffer(1, len, ctx.sampleRate),
    d = b.getChannelData(0);
  let last = 0,
    b0 = 0,
    b1 = 0,
    b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'white') d[i] = w;
    else if (type === 'brown') {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      b0 = 0.997 * b0 + w * 0.029591;
      b1 = 0.985 * b1 + w * 0.032534;
      b2 = 0.95 * b2 + w * 0.048056;
      d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6;
    }
  }
  return b;
}
function makeIR(ctx, sec) {
  const sr = ctx.sampleRate,
    len = Math.floor(sr * sec),
    b = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / sr;
      const w = Math.random() * 2 - 1;
      const k = 0.12 + 0.85 * (tt / sec);
      lp += (w - lp) * (1 - k * 0.88);
      d[i] = lp * Math.pow(1 - tt / sec, 2.4) * (tt < 0.012 ? tt / 0.012 : 1) * 0.55;
    }
    for (const [et, ea] of [
      [0.38 + ch * 0.06, 0.45],
      [1.25 + ch * 0.13, 0.32],
      [2.15 - ch * 0.08, 0.2],
      [3.6 + ch * 0.1, 0.1],
    ]) {
      const s = Math.floor(et * sr);
      for (let i = 0; i < sr * 0.3 && s + i < len; i++) d[s + i] += (Math.random() * 2 - 1) * ea * Math.exp(-i / (sr * 0.06)) * 0.45;
    }
  }
  return b;
}
function audioInit() {
  if (A.ctx) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  A.ctx = ctx;
  A.out = ctx.createGain();
  A.out.gain.value = MIX.master;
  A.out.connect(ctx.destination);
  A.master = ctx.createGain();
  A.master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.008;
  comp.release.value = 0.25;
  A.master.connect(comp);
  comp.connect(A.out);
  A.bus = {};
  for (const k of ['calls', 'others', 'moose', 'wildlife', 'wind', 'forest', 'fx']) {
    const g = ctx.createGain();
    g.gain.value = MIX[k];
    g.connect(k === 'calls' ? A.out : A.master);
    A.bus[k] = g;
  }
  A.rev = ctx.createConvolver();
  A.rev.buffer = makeIR(ctx, 4.6);
  A.revIn = ctx.createGain();
  const ro = ctx.createGain();
  ro.gain.value = 0.6;
  A.revIn.connect(A.rev);
  A.rev.connect(ro);
  ro.connect(A.master);
  A.noise = makeNoise(ctx, 4, 'white');
  A.brown = makeNoise(ctx, 6, 'brown');
  A.pink = makeNoise(ctx, 5, 'pink');
  loadSamples();
  forgetOldCustomCall();
  // player call bus with treeline echoes
  A.callBus = ctx.createGain();
  A.callBus.gain.value = 1;
  A.callBus.connect(A.master);
  const cs = ctx.createGain();
  cs.gain.value = 0.55;
  A.callBus.connect(cs);
  cs.connect(A.revIn);
  for (const [dt, gv, pan, f] of [
    [1.42, 0.16, -0.45, 2200],
    [2.35, 0.1, 0.5, 1600],
    [4.6, 0.06, 0.1, 1100],
  ]) {
    const dl = ctx.createDelay(6);
    dl.delayTime.value = dt;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = gv;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    A.callBus.connect(dl);
    dl.connect(lp);
    lp.connect(g);
    g.connect(p);
    p.connect(A.master);
  }
  startAmbience();
}
function noiseSrc(buf) {
  const s = A.ctx.createBufferSource();
  s.buffer = buf || A.noise;
  s.loop = true;
  return s;
}
function bp(f, Q) {
  const b = A.ctx.createBiquadFilter();
  b.type = 'bandpass';
  b.frequency.value = f;
  b.Q.value = Q;
  return b;
}
function filt(type, f, Q = 0.7) {
  const b = A.ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = Q;
  return b;
}
function gainN(v = 0) {
  const g = A.ctx.createGain();
  g.gain.value = v;
  return g;
}
function env(gp, t, a, peak, hold, rel) {
  gp.setValueAtTime(0.0001, t);
  gp.linearRampToValueAtTime(peak, t + a);
  gp.setValueAtTime(peak, t + a + hold);
  gp.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
}
function oscN(type, f, t, dur) {
  const o = A.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}
function spatial(x, y, z, o = {}) {
  const ctx = A.ctx;
  const d = Math.hypot(x - LP.x, y - LP.y, z - LP.z);
  const ref = o.ref || 20;
  const inp = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = clamp(17000 * Math.exp(-d / (o.air || 300)), 380, 17000);
  lp.Q.value = 0.5;
  const pn = ctx.createPanner();
  pn.panningModel = 'equalpower';
  pn.distanceModel = 'inverse';
  pn.refDistance = ref;
  pn.rolloffFactor = o.roll || 1.15;
  pn.maxDistance = 50000;
  if (pn.positionX) {
    pn.positionX.value = x;
    pn.positionY.value = y;
    pn.positionZ.value = z;
  } else pn.setPosition(x, y, z);
  const bus = A.bus[o.bus || 'fx'];
  inp.connect(lp);
  lp.connect(pn);
  pn.connect(bus);
  const send = ctx.createGain();
  send.gain.value = (((o.wet == null ? 0.3 : o.wet) * 0.6 * ref) / (ref + d)) * bus.gain.value;
  lp.connect(send);
  send.connect(A.revIn);
  setTimeout(
    () => {
      try {
        inp.disconnect();
        lp.disconnect();
        pn.disconnect();
        send.disconnect();
      } catch (e) {}
    },
    ((o.life || 6) + 2) * 1000,
  );
  inp.pn = pn;
  return inp;
}
function forestSpot(minD, maxD, yy) {
  for (let i = 0; i < 80; i++) {
    const a = rand(0, TAU),
      r = rand(minD, maxD);
    const x = PLAYER.x + Math.cos(a) * r,
      z = PLAYER.z + Math.sin(a) * r;
    if (marshE(x, z) > 0.02) return { x, y: groundAt(x, z) + (yy || rand(4, 14)), z };
  }
  return { x: PLAYER.x + 40, y: 8, z: PLAYER.z + 30 };
}
function whistle(dest, t, f0, f1, dur, vol, vib) {
  const o = oscN('sine', f0, t, dur);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = gainN();
  env(g.gain, t, 0.02, vol, Math.max(0.01, dur - 0.07), 0.05);
  o.connect(g);
  g.connect(dest);
  if (vib) {
    const l = oscN('sine', vib, t, dur);
    const lg = gainN(f0 * 0.012);
    l.connect(lg);
    lg.connect(o.frequency);
  }
}
function chickadee() {
  const p = forestSpot(15, 90);
  const d = spatial(p.x, p.y, p.z, { ref: 6, life: 6, wet: 0.2 });
  let t = A.ctx.currentTime + 0.05;
  const v = rand(0.12, 0.22);
  for (let r = 0; r < randi(1, 3); r++) {
    whistle(d, t, 4050, 3950, 0.34, v);
    whistle(d, t + 0.42, 3480, 3400, 0.3, v * 0.85);
    t += rand(1.8, 2.6);
  }
}
function whiteThroat() {
  const p = forestSpot(30, 180);
  const d = spatial(p.x, p.y, p.z, { ref: 8, life: 8, wet: 0.35 });
  let t = A.ctx.currentTime + 0.05;
  const v = rand(0.12, 0.2),
    k = rand(0.94, 1.06);
  whistle(d, t, 3150 * k, 3120 * k, 0.6, v, 6);
  t += 0.68;
  whistle(d, t, 4250 * k, 4220 * k, 0.55, v, 6);
  t += 0.62;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      whistle(d, t, (j ? 4120 : 4200) * k, (j ? 4100 : 4150) * k, 0.12, v * 0.85);
      t += 0.15;
    }
    t += 0.04;
  }
}
function raven() {
  const p = forestSpot(80, 400, rand(25, 60));
  const d = spatial(p.x, p.y, p.z, { ref: 30, life: 6, wet: 0.5 });
  let t = A.ctx.currentTime + 0.05;
  const f = rand(300, 380);
  for (let i = 0; i < randi(1, 3); i++) {
    const o = oscN('sawtooth', f, t, 0.36);
    o.frequency.exponentialRampToValueAtTime(f * 0.82, t + 0.33);
    const am = gainN(0.6);
    const l = oscN('square', rand(45, 65), t, 0.36);
    const lg = gainN(0.4);
    l.connect(lg);
    lg.connect(am.gain);
    const g = gainN();
    env(g.gain, t, 0.02, 0.5, 0.22, 0.1);
    const f1 = bp(1000, 2.5),
      f2 = bp(2100, 3);
    o.connect(am);
    am.connect(f1);
    am.connect(f2);
    f1.connect(g);
    f2.connect(g);
    g.connect(d);
    t += rand(0.5, 0.75);
  }
}
function jay() {
  const p = forestSpot(20, 120);
  const d = spatial(p.x, p.y, p.z, { ref: 12, life: 5, wet: 0.3 });
  let t = A.ctx.currentTime + 0.05;
  for (let i = 0; i < randi(2, 4); i++) {
    const o = oscN('sawtooth', 2600, t, 0.22);
    o.frequency.exponentialRampToValueAtTime(1700, t + 0.2);
    const n = noiseSrc();
    const nb = bp(2600, 1.5);
    const g = gainN();
    env(g.gain, t, 0.01, 0.25, 0.12, 0.08);
    const og = gainN(0.25);
    o.connect(og);
    og.connect(nb);
    n.connect(nb);
    nb.connect(g);
    g.connect(d);
    n.start(t, rand(0, 3));
    n.stop(t + 0.25);
    t += rand(0.32, 0.45);
  }
}
function squirrel() {
  const p = forestSpot(10, 70, rand(3, 10));
  const d = spatial(p.x, p.y, p.z, { ref: 8, life: 6, wet: 0.2 });
  let t = A.ctx.currentTime + 0.05;
  const n = randi(25, 55);
  const src = noiseSrc();
  const f = bp(rand(3800, 5200), 5);
  const g = gainN();
  src.connect(f);
  f.connect(g);
  g.connect(d);
  src.start(t, rand(0, 3));
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < n; i++) {
    const tt = t + i * 0.052;
    const v = 0.6 * (1 - (i / n) * 0.6);
    g.gain.setValueAtTime(0.0001, tt);
    g.gain.linearRampToValueAtTime(v, tt + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.035);
  }
  src.stop(t + n * 0.052 + 0.1);
}
function woodpecker() {
  const p = forestSpot(90, 350);
  const d = spatial(p.x, p.y, p.z, { ref: 15, life: 5, wet: 0.5 });
  let t = A.ctx.currentTime + 0.05;
  const n = randi(14, 22);
  let gap = 0.085;
  for (let i = 0; i < n; i++) {
    const o = oscN('sine', rand(620, 700), t, 0.05);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.04);
    const g = gainN();
    env(g.gain, t, 0.001, 0.5, 0, 0.04);
    o.connect(g);
    g.connect(d);
    t += gap;
    gap *= 0.985;
  }
}
function geese() {
  const sx = rand(-700, 700),
    sz = PLAYER.z - rand(400, 900),
    ex = sx > 0 ? -900 : 900;
  const d = spatial(sx, 120, sz, { ref: 35, life: 16, wet: 0.5 });
  const T0 = A.ctx.currentTime;
  if (d.pn.positionX) {
    d.pn.positionX.setValueAtTime(sx, T0);
    d.pn.positionX.linearRampToValueAtTime(ex, T0 + 14);
  }
  for (let i = 0; i < randi(10, 22); i++) {
    const t = T0 + rand(0, 12);
    const f = rand(380, 520);
    const o = oscN('sawtooth', f * 0.7, t, 0.28);
    o.frequency.linearRampToValueAtTime(f, t + 0.07);
    o.frequency.exponentialRampToValueAtTime(f * 0.88, t + 0.25);
    const g = gainN();
    env(g.gain, t, 0.02, 0.35, 0.12, 0.1);
    const f1 = bp(1150, 3),
      f2 = bp(2600, 4);
    o.connect(f1);
    o.connect(f2);
    f1.connect(g);
    f2.connect(g);
    g.connect(d);
  }
}
function loon() {
  const x = POND.x + rand(-30, 30),
    z = POND.z + rand(-20, 20);
  const d = spatial(x, 0.5, z, { ref: 40, life: 10, wet: 0.85, air: 500 });
  const t = A.ctx.currentTime + 0.05;
  const k = rand(0.9, 1.1);
  const o = oscN('triangle', 620 * k, t, 4.2);
  const o2 = oscN('sine', 1240 * k, t, 4.2);
  const f = o.frequency,
    f2 = o2.frequency;
  const path = [
    [0, 620],
    [0.5, 1000],
    [1.6, 990],
    [2.0, 880],
    [2.6, 1180],
    [3.4, 1100],
    [4.0, 900],
  ];
  for (const [dt, v] of path) {
    f.linearRampToValueAtTime(v * k, t + dt);
    f2.linearRampToValueAtTime(v * 2 * k, t + dt);
  }
  const vib = oscN('sine', 5.5, t, 4.2);
  const vg = gainN(9);
  vib.connect(vg);
  vg.connect(f);
  const g = gainN();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.25);
  g.gain.setValueAtTime(0.4, t + 1.8);
  g.gain.linearRampToValueAtTime(0.15, t + 2.05);
  g.gain.linearRampToValueAtTime(0.38, t + 2.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 4.1);
  const g2 = gainN(0.12);
  o.connect(g);
  o2.connect(g2);
  g2.connect(g);
  g.connect(d);
}
function knock(dest, t, f, v) {
  const o = oscN('sine', f, t, 0.16);
  o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.12);
  const g = gainN();
  env(g.gain, t, 0.002, v, 0, 0.12);
  o.connect(g);
  g.connect(dest);
  const n = noiseSrc();
  const fl = bp(f * 3.2, 2);
  const g2 = gainN();
  env(g2.gain, t, 0.001, v * 0.9, 0, 0.05);
  n.connect(fl);
  fl.connect(g2);
  g2.connect(dest);
  n.start(t, rand(0, 3));
  n.stop(t + 0.1);
}
function crack(dest, t, v) {
  for (let k = 0; k < randi(2, 5); k++) {
    const tt = t + k * rand(0.006, 0.03);
    const n = noiseSrc();
    const h = filt('highpass', 1600);
    const r = bp(rand(2000, 3600), 8);
    const g = gainN();
    env(g.gain, tt, 0.001, v * rand(0.5, 1), 0, rand(0.015, 0.04));
    n.connect(h);
    h.connect(g);
    h.connect(r);
    r.connect(g);
    g.connect(dest);
    n.start(tt, rand(0, 3));
    n.stop(tt + 0.08);
  }
}
/* ---- real field recordings (decoded from embedded WAVs) ---- */
const SB = {};
let SB_READY = false;
// the same names the old single-file build used: ucowL_/ucowC_ (my long/coaxing calls), ubull_ (bull replies),
// amb_<species>_ and fx_<kind>_ (ambient and effects folders), and the wild recordings by file name
function soundKey(path) {
  const p = path.split('/assets/sounds/')[1];   // glob keys always use forward slashes
  if (!p) return null;
  const parts = p.split('/'),
    base = parts[parts.length - 1].replace(/\.[^.]+$/, '');
  if (parts[0] === 'cow-calls') return (parts[1] === 'long' ? 'ucowL_' : 'ucowC_') + base;
  if (parts[0] === 'bull-replies') return 'ubull_' + base;
  if (parts[0] === 'ambient') return 'amb_' + parts[1] + '_' + base;
  if (parts[0] === 'effects') return 'fx_' + parts[1] + '_' + base;
  if (parts[0] === 'wild-recordings') return base.replace('fws_', '');
  return null;
}
async function loadSamples() {
  fetch(onsetsUrl).then((r) => r.json()).then((j) => { SND_META = j; }).catch(() => {});
  await Promise.all(
    Object.entries(SOUND_URLS).map(async ([path, url]) => {
      const k = soundKey(path);
      if (!k) return;
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        SB[k] = await A.ctx.decodeAudioData(buf);
      } catch (e) {
        console.warn('sample ' + k, e);
      }
    }),
  );
  SB_READY = true;
}
// another hunter's call, heard from their stand across the marsh
function playOtherCall(h, key) {
  if (!A_ok() || !SB[key]) return;
  const b = SB[key];
  const d = spatial(h.x, h.eye || 6, h.z, { ref: 60, life: b.duration + 3, wet: 0.55, air: 700, roll: 0.9, bus: 'others' });
  playBuf(b, d, A.ctx.currentTime + 0.02, { gain: fullLevel(key) * 1.6 });
}
function playOtherPour(h) {
  if (!A_ok()) return;
  const ks = Object.keys(SB).filter((k) => k.startsWith('fx_water-pour_'));
  if (!ks.length) return;
  const k = pick(ks);
  const d = spatial(h.x, h.eye || 6, h.z, { ref: 10, life: SB[k].duration + 2, wet: 0.3, bus: 'others' });
  playBuf(SB[k], d, A.ctx.currentTime + 0.02, { gain: fullLevel(k) * 0.6, fade: 0.08 });
}
function fullLevel(k) {
  const b = SB[k];
  if (!b) return 1;
  if (b.__pk == null) {
    let pk = 0;
    for (let c = 0; c < b.numberOfChannels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i += 2) pk = Math.max(pk, Math.abs(d[i]));
    }
    b.__pk = pk || 1;
  }
  return 0.95 / b.__pk;
}
const sampleSet = (p) =>
  Object.keys(SB)
    .filter((k) => k.startsWith(p))
    .sort((a, b) => parseInt(a.slice(p.length)) - parseInt(b.slice(p.length)))
    .map((k) => SB[k]);
function playBuf(buf, dest, t, o = {}) {
  const s = A.ctx.createBufferSource();
  s.buffer = buf;
  const rate = o.rate || 1;
  s.playbackRate.value = rate;
  const gv = o.gain == null ? 1 : o.gain;
  const g = gainN(gv);
  s.connect(g);
  g.connect(dest);
  const off = o.offset || 0,
    dur = o.dur || Math.max(0.01, buf.duration - off);
  if (o.fade) {
    const end = t + dur / rate;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gv, t + o.fade);
    g.gain.setValueAtTime(gv, Math.max(t + o.fade, end - o.fade));
    g.gain.linearRampToValueAtTime(0.0001, end);
  }
  s.start(t, off, dur);
  s.__t = t;
  return { s, g };
}
function playThrash(x, y, z, dur) {
  if (!A_ok()) return;
  const rakes = sampleSet('rake_');
  if (!rakes.length) return;
  const dest = spatial(x, y, z, { ref: 26, life: dur + 12, wet: 0.5, air: 260, bus: 'moose' });
  let t = A.ctx.currentTime + 0.05;
  let left = dur;
  while (left > 1) {
    const b = pick(rakes);
    const len = Math.min(left, rand(4, 9), b.duration - 0.5);
    const off = rand(0, Math.max(0, b.duration - len - 0.1));
    playBuf(b, dest, t, { offset: off, dur: len, gain: rand(1.7, 2.5), rate: rand(0.94, 1.06), fade: 0.3 });
    t += len + rand(0.4, 2.2);
    left -= len + 1;
  }
}
function playCrack(x, y, z, v) {
  if (!A_ok()) return;
  playBrush(x, y, z, rand(0.5, 1.1), 2.2 * v, rand(1.0, 1.15));
}
// real twig snaps from the willow-brush recording
function playSplash(x, y, z, v) {
  if (!A_ok()) return;
  const wk = Object.keys(SB).filter((k) => k.startsWith('fx_wading_'));
  if (wk.length) {
    const w = SB[pick(wk)];
    const d = spatial(x, y, z, { ref: 12, life: 2, wet: 0.35 });
    const len = rand(0.45, 0.85);
    playBuf(w, d, A.ctx.currentTime + 0.01, {
      offset: rand(0, Math.max(0, w.duration - len - 0.1)),
      dur: len,
      rate: rand(0.72, 0.88),
      gain: v * 2.2,
      fade: 0.08,
    });
    return;
  }
  const d = spatial(x, y, z, { ref: 12, life: 2, wet: 0.35 });
  const t = A.ctx.currentTime + 0.01;
  const n = noiseSrc();
  const f = filt('lowpass', rand(900, 1600));
  const b = bp(rand(500, 900), 1.5);
  const g = gainN();
  env(g.gain, t, 0.01, v * 0.9, 0.05, rand(0.2, 0.35));
  n.connect(f);
  f.connect(b);
  f.connect(g);
  b.connect(g);
  g.connect(d);
  n.start(t, rand(0, 3));
  n.stop(t + 0.5);
}
function playBrush(x, y, z, len, gain, rate, o_bus) {
  if (!A_ok()) return;
  const w = SB.willow_walk;
  if (!w) return;
  const d = spatial(x, y, z, { ref: 18, life: len + 3, wet: 0.4, air: 280, bus: o_bus || 'moose' });
  playBuf(w, d, A.ctx.currentTime + 0.02, {
    offset: rand(0, Math.max(0, w.duration - len - 0.2)),
    dur: len,
    gain,
    rate: rate || 1,
    fade: 0.15,
  });
}
function playCrash(x, y, z) {
  if (!A_ok()) return;
  playBrush(x, y, z, rand(3, 5), 3.2, 1.35);
  setTimeout(() => playBrush(x, y, z, rand(2, 3), 2.6, 1.2), rand(400, 900));
}
function bullGrunts(an, n, voice) {
  const ub = A_ok() ? Object.keys(SB).filter((k) => k.startsWith('ubull_')) : [];
  if (ub.length && chance(0.85)) {
    const k = pick(ub),
      b = SB[k];
    const rate = clamp(voice.rate, 0.94, 1.06);
    const dest = spatial(an.x, groundAt(an.x, an.z) + 2, an.z, { ref: 30, life: b.duration / rate + 3, wet: 0.42, air: 340, bus: 'moose' });
    const t = A.ctx.currentTime + 0.05;
    playBuf(b, dest, t, { rate, gain: voice.vol * 0.95 * BULL_GAIN });
    const on = (SND_META[k] || {}).onsets || [0];
    for (const o of on)
      setTimeout(
        () => {
          an.grunt ? an.grunt() : (an.gruntT = 0.45);
        },
        (0.05 + o / rate) * 1000,
      );
    return;
  }
  const all = A_ok() ? sampleSet('grunt') : [];
  if (!all.length) {
    for (let i = 0; i < n; i++)
      setTimeout(() => {
        an.grunt ? an.grunt() : (an.gruntT = 0.45);
      }, i * 1400);
    return;
  }
  const main = [all[0], all[1], all[5]].filter(Boolean);
  const dest = spatial(an.x, groundAt(an.x, an.z) + 2, an.z, { ref: 30, life: n * 2 + 3, wet: 0.42, air: 340, bus: 'moose' });
  let t = A.ctx.currentTime + 0.05;
  for (let i = 0; i < n; i++) {
    const b = chance(0.65) ? pick(main) : pick(all);
    playBuf(b, dest, t, { rate: voice.rate * rand(0.97, 1.03), gain: voice.vol });
    const ms = (t - A.ctx.currentTime) * 1000;
    setTimeout(() => {
      an.grunt ? an.grunt() : (an.gruntT = 0.45);
    }, ms);
    t += rand(1.1, 1.7);
  }
}
/* The player's call. Unprocessed real cow-moose calls: holding Space keeps her calling, one real
   call every ~1.2 s (the rhythm in the recording). If the player has loaded their own call recording,
   that plays instead and is cut off (with a short fade) when Space is released. */
// The player's recordings are quiet as recorded; one fixed boost for each set keeps their relative levels.
const COW_GAIN = 2.2,
  BULL_GAIN = 1.8;
const UCOWS = () => Object.keys(SB).filter((k) => k.startsWith('ucowL_') || k.startsWith('ucowC_'));
class SeriesCall {
  constructor(dest, lastKey) {
    this.out = gainN(1);
    this.out.connect(dest);
    this.released = false;
    const uc = UCOWS();
    if (!uc.length) {
      this.dur = 0;
      this.label = 'cow calls still loading';
      return;
    }
    let k = pick(uc);
    if (k === lastKey && uc.length > 1) k = pick(uc.filter((x) => x !== lastKey));
    this.key = k;
    const b = SB[k];
    this.src = playBuf(b, this.out, A.ctx.currentTime + 0.01, { gain: 1 });
    this.dur = b.duration;
    this.label = 'cow call · ' + k.replace('ucow_', '');
  }
  update() {}
  release() {
    if (this.released) return;
    this.released = true;
    const now = A.ctx.currentTime;
    this.out.gain.setValueAtTime(1, now);
    this.out.gain.linearRampToValueAtTime(0.0001, now + 0.03);
    if (this.src)
      try {
        this.src.s.stop(now + 0.05);
      } catch (e) {}
    setTimeout(() => {
      try {
        this.out.disconnect();
      } catch (e) {}
    }, 500);
  }
}
function forgetOldCustomCall() {
  try {
    indexedDB.deleteDatabase('marshrut');
  } catch (e) {}
}
function cowMoan(an, calf) {
  if (!A_ok() || calf) return;
  vaporFrom(an, 0.8);
  const uc = UCOWS();
  if (uc.length) {
    const b = SB[pick(uc)];
    const dest = spatial(an.x, groundAt(an.x, an.z) + 1.7, an.z, { ref: 22, life: b.duration + 3, wet: 0.45, air: 320, bus: 'moose' });
    const len = Math.min(b.duration, rand(3, 7));
    playBuf(b, dest, A.ctx.currentTime + 0.05, { dur: len, gain: 0.95 * COW_GAIN, fade: 0.2 });
    return;
  }
  const cows = sampleSet('cow');
  if (!cows.length) return;
  const dest = spatial(an.x, groundAt(an.x, an.z) + 1.7, an.z, { ref: calf ? 12 : 22, life: 9, wet: 0.45, air: 320 });
  let t = A.ctx.currentTime + 0.05;
  const n = calf ? randi(1, 3) : randi(1, 4);
  const r = calf ? rand(1.35, 1.6) : rand(0.92, 1.04);
  for (let i = 0; i < n; i++) {
    playBuf(pick(cows), dest, t, { rate: r * rand(0.98, 1.02), gain: calf ? 0.6 : 1.0 });
    t += rand(1.0, 1.4);
  }
}
function waterPour() {
  if (!A_ok()) return;
  const ks = Object.keys(SB).filter((k) => k.startsWith('fx_water-pour_'));
  if (!ks.length) return;
  const k = pick(ks);
  playBuf(SB[k], A.bus.calls, A.ctx.currentTime + 0.02, { gain: fullLevel(k) * 0.75, fade: 0.08 });
  return true;   // the host tells the animals (calls.js)
}
function startAmbience() {
  const c = A.ctx;
  A.amb = [];
  for (const pan of [-0.7, 0.7]) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    p.connect(A.bus.wind);
    const s = noiseSrc(A.brown);
    const lp = filt('lowpass', 420);
    const g = gainN(0);
    s.connect(lp);
    lp.connect(g);
    g.connect(p);
    s.start(0, rand(0, 5));
    const s2 = noiseSrc(A.noise);
    const b = bp(2400 + pan * 500, 0.5);
    const g2 = gainN(0);
    s2.connect(b);
    b.connect(g2);
    g2.connect(p);
    s2.start(0, rand(0, 3));
    A.amb.push({ g, g2, lp, ph: rand(0, 100) });
  }
}
/* Real recordings in sounds/ambient/<species>/ — each species plays a random clip from its folder,
   from a believable place: chickadees/squirrels close in the trees, woodpecker far in the timber,
   loon on the pond, cranes and geese overhead. Delete a clip (or a whole folder) to drop it. */
const AMB = {
  // bands: where this species is heard from, picked fresh (with a new direction) every time
  chickadee: { t: rand(5, 15), every: [15, 45], bands: { near: 0.5, mid: 0.4, far: 0.1 }, gain: 1.0 },
  'white-throated-sparrow': { t: rand(10, 30), every: [25, 80], bands: { near: 0.2, mid: 0.5, far: 0.3 }, gain: 1.0 },
  'red-squirrel': { t: rand(15, 45), every: [40, 110], bands: { near: 0.55, mid: 0.4, far: 0.05 }, gain: 0.9 },
  'pileated-woodpecker': { t: rand(30, 90), every: [60, 160], bands: { mid: 0.3, far: 0.5, veryfar: 0.2 }, gain: 1.3 },
  'blue-jay': { t: rand(25, 70), every: [50, 140], bands: { near: 0.2, mid: 0.5, far: 0.3 }, gain: 0.9 },
  'common-loon': { t: rand(30, 80), every: [100, 240], where: 'pond', gain: 1.4, ref: 45 },
  'sandhill-cranes': { t: rand(150, 400), every: [300, 700], where: 'sky', gain: 1.3, ref: 70 },
  'canada-geese': { t: rand(90, 260), every: [240, 520], where: 'skymove', gain: 1.4, ref: 60 },
  wolves: { t: rand(300, 700), every: [600, 1300], bands: { far: 0.3, veryfar: 0.7 }, gain: 1.6 },
  coyotes: { t: rand(200, 500), every: [420, 900], bands: { mid: 0.1, far: 0.5, veryfar: 0.4 }, gain: 1.4 },
};
const BANDS = { near: [12, 60, 8], mid: [60, 200, 12], far: [200, 480, 18], veryfar: [450, 950, 30] };
// metres from the stand, reference distance
const PHANTOM = { t: rand(45, 120) };
function ambClips(cat) {
  return Object.keys(SB).filter((k) => k.startsWith('amb_' + cat + '_'));
}
function ambSpot(w) {
  if (w === 'near') return forestSpot(15, 90);
  if (w === 'forest') return forestSpot(40, 220);
  if (w === 'far') return forestSpot(90, 380);
  if (w === 'pond') return { x: POND.x + rand(-30, 30), y: 0.5, z: POND.z + rand(-20, 20) };
  return { x: PLAYER.x + rand(-500, 500), y: rand(80, 160), z: PLAYER.z - rand(200, 800) };
}
function pickBand(bands) {
  let r = Math.random() * Object.values(bands).reduce((a, b) => a + b, 0);
  for (const k in bands) {
    if (r < bands[k]) return k;
    r -= bands[k];
  }
  return 'mid';
}
function playAmb(cat, c) {
  const ks = ambClips(cat);
  if (!ks.length) return;
  const b = SB[pick(ks)];
  let p,
    ref = c.ref;
  if (c.bands) {
    const band = BANDS[pickBand(c.bands)];
    p = forestSpot(band[0], band[1]);
    ref = band[2];
  } else p = ambSpot(c.where);
  const d = spatial(p.x, p.y, p.z, { ref, life: b.duration + 3, wet: 0.3, air: 400, bus: 'wildlife' });
  if (cat === 'canada-geese') spawnFlock('goose', randi(8, 16), p, b.duration);
  if (c.where === 'skymove' && d.pn.positionX) {
    const T0 = A.ctx.currentTime,
      ex = p.x > PLAYER.x ? PLAYER.x - 700 : PLAYER.x + 700;
    d.pn.positionX.setValueAtTime(p.x, T0);
    d.pn.positionX.linearRampToValueAtTime(ex, T0 + b.duration);
  }
  playBuf(b, d, A.ctx.currentTime + 0.05, { gain: c.gain * rand(0.8, 1.15), fade: 0.25 });
}
// long background beds, looped with 2 s crossfades so there is no seam
function bedTick(bed) {
  const now = A.ctx.currentTime;
  if (now < bed.next - 3) return;
  const b = SB[pick(bed.keys)];
  const st = Math.max(now + 0.05, bed.next - 2);
  playBuf(b, bed.bus, st, { gain: 1, fade: 2, offset: 0 });
  bed.next = st + b.duration;
}
function startBeds() {
  A.bedsOn = true;
  A.beds = [];
  for (const [cat, g] of [
    ['forest-bed', 0.6],
    ['wind', 0.5],
  ]) {
    const keys = ambClips(cat);
    if (!keys.length) continue;
    const bus = gainN(0);
    bus.connect(cat === 'wind' ? A.bus.wind : A.bus.forest);
    bus.gain.setTargetAtTime(g, A.ctx.currentTime, 3);
    A.beds.push({ cat, keys, bus, next: 0, g });
  }
  if (A.beds.some((b) => b.cat === 'wind')) A.synthWindOff = true;
}
function updateAmbience(dt) {
  const now = A.ctx.currentTime;
  if (SB_READY && !A.bedsOn) startBeds();
  for (const bed of A.beds || []) {
    bedTick(bed);
    if (bed.cat === 'wind') {
      const l = clamp(WIND.gust * (WIND.speed / 9), 0.15, 1.6);
      bed.bus.gain.setTargetAtTime(bed.g * (0.45 + 0.55 * l), now, 0.6);
    }
  }
  for (const a of A.amb) {
    if (A.synthWindOff) {
      a.g.gain.setTargetAtTime(0, now, 1);
      a.g2.gain.setTargetAtTime(0, now, 1);
      continue;
    }
    a.ph += dt;
    const l = clamp(WIND.gust * (0.7 + 0.3 * noise1(a.ph * 0.3)), 0.05, 1.5);
    a.g.gain.setTargetAtTime(0.11 * l * (WIND.speed / 9), now, 0.3);
    a.g2.gain.setTargetAtTime(0.024 * l * l * (WIND.speed / 9), now, 0.3);
    a.lp.frequency.setTargetAtTime(280 + l * 280, now, 0.3);
  }
  if (SB_READY)
    for (const cat in AMB) {
      const c = AMB[cat];
      c.t -= dt;
      if (c.t <= 0) {
        c.t = rand(c.every[0], c.every[1]);
        playAmb(cat, c);
      }
    }
  PHANTOM.t -= dt;
  if (PHANTOM.t <= 0) {
    PHANTOM.t = rand(100, 220);
    const p = forestSpot(220, 620, 1.8); // an unseen bull working a tree out in the timber
    if (!ANIMALS.some((a) => a.kind === 'bull' && Math.hypot(a.x - p.x, a.z - p.z) < 200)) {
      playThrash(p.x, p.y, p.z, rand(6, 13));
      if (chance(0.3))
        setTimeout(
          () => {
            bullGrunts({ x: p.x, z: p.z, gruntT: 0 }, randi(2, 4), { rate: rand(0.88, 1.05), vol: 2.6 });
          },
          rand(3000, 9000),
        );
    }
  }
}
const _fw = new THREE.Vector3(),
  _uw = new THREE.Vector3();
function updateListener() {
  const L = A.ctx.listener,
    p = camera.position;
  LP.x = p.x;
  LP.y = p.y;
  LP.z = p.z;
  _fw.set(0, 0, -1).applyQuaternion(camera.quaternion);
  _uw.set(0, 1, 0).applyQuaternion(camera.quaternion);
  if (L.positionX) {
    L.positionX.value = p.x;
    L.positionY.value = p.y;
    L.positionZ.value = p.z;
    L.forwardX.value = _fw.x;
    L.forwardY.value = _fw.y;
    L.forwardZ.value = _fw.z;
    L.upX.value = _uw.x;
    L.upY.value = _uw.y;
    L.upZ.value = _uw.z;
  } else {
    L.setPosition(p.x, p.y, p.z);
    L.setOrientation(_fw.x, _fw.y, _fw.z, _uw.x, _uw.y, _uw.z);
  }
}

// antlers coming together when two bulls fight
function playClack(x, z) {
  if (!A_ok()) return;
  const d = spatial(x, groundAt(x, z) + 1.8, z, { ref: 26, life: 5, wet: 0.5, air: 300, bus: 'moose' });
  const t = A.ctx.currentTime + 0.02;
  const fk = Object.keys(SB).filter((k) => k.startsWith('fx_antler-fight_'));
  if (fk.length) {
    const b = SB[pick(fk)];
    const len = rand(0.8, 2.2);
    playBuf(b, d, t, { offset: rand(0, Math.max(0, b.duration - len - 0.1)), dur: len, gain: 2.4, fade: 0.05 });
    return;
  }
  for (let i = 0; i < randi(2, 4); i++) knock(d, t + i * rand(0.03, 0.09), rand(380, 720), rand(2.2, 3.2));
}

export {
  playClack,
  playOtherCall,
  playOtherPour,
  soundKey,
  A,
  AMB,
  A_ok,
  BANDS,
  BULL_GAIN,
  COW_GAIN,
  LP,
  MIX,
  MIX_KEYS,
  PHANTOM,
  SB,
  SB_READY,
  SeriesCall,
  UCOWS,
  _fw,
  _uw,
  ambClips,
  ambSpot,
  audioInit,
  bedTick,
  bp,
  bullGrunts,
  chickadee,
  cowMoan,
  crack,
  env,
  filt,
  forestSpot,
  forgetOldCustomCall,
  fullLevel,
  gainN,
  geese,
  jay,
  knock,
  loadSamples,
  loon,
  makeIR,
  makeNoise,
  noiseSrc,
  oscN,
  pickBand,
  playAmb,
  playBrush,
  playBuf,
  playCrack,
  playCrash,
  playSplash,
  playThrash,
  raven,
  sampleSet,
  setMix,
  spatial,
  squirrel,
  startAmbience,
  startBeds,
  updateAmbience,
  updateListener,
  waterPour,
  whistle,
  whiteThroat,
  woodpecker,
};
