// Who a bull is: age class, body size, antlers, temperament, voice and coat. Rolled once by the host
// when the bull is born and sent to every browser, so everyone sees the same bull.
import { clamp, lerp, rand, randi, pick, chance, random, hexLin } from '../util.js';

export const BULL_CLASSES = [   // bigger, older bulls carry bigger bodies and bigger racks; young bulls carry no palms
  { k: 'yearling', p: 0.12, scale: [0.8, 0.85], bold: 0.9 },
  { k: 'young bull', p: 0.24, scale: [0.87, 0.92], bold: 0.72 },
  { k: 'prime bull', p: 0.32, scale: [0.93, 0.98], bold: 0.55 },
  { k: 'mature bull', p: 0.2, scale: [1.0, 1.06], bold: 0.36 },
  { k: 'old battle-worn bull', p: 0.12, scale: [0.98, 1.03], bold: 0.3, worn: true },
];
export const ANT_COLS = [['#4a3828', '#a8865e', '#e2d0aa'], ['#3a2c20', '#7a5e42', '#c8b48c'], ['#5a4634', '#b89c74', '#efe2c2'], ['#2e2218', '#5e4a36', '#a89678']];
export function antlerFor(cls) {
  const k = cls.k; const A = { asym: 0.05, tilt: rand(0.15, 0.38), cup: rand(0.9, 1.3), palmW: rand(0.85, 1.15), nonTyp: false, broken: 0, butterfly: false, blunt: false, col: pick(ANT_COLS).map(h => hexLin(h)) };
  if (k === 'yearling') { const r = random(); A.type = r < 0.4 ? 'spike' : r < 0.8 ? 'fork' : 'cervina'; A.spread = rand(0.25, 0.5); A.tines = A.type === 'cervina' ? randi(2, 3) : 0; A.mass = 0.3; }
  else if (k === 'young bull') { if (chance(0.5)) { A.type = 'cervina'; A.spread = rand(0.6, 0.85); A.tines = randi(3, 5); } else { A.type = 'palm'; A.spread = rand(0.7, 0.95); A.tines = randi(3, 5); A.palmW *= 0.7; } A.mass = 0.45; }
  else if (k === 'prime bull') { A.type = 'palm'; A.butterfly = chance(0.4); A.spread = rand(1.0, 1.35); A.tines = randi(5, 8); A.mass = rand(0.7, 0.85); A.nonTyp = chance(0.15); }
  else if (k === 'mature bull') { A.type = 'palm'; A.butterfly = chance(0.35); A.spread = rand(1.3, 1.7); A.tines = randi(7, 11); A.mass = rand(1.0, 1.12); A.nonTyp = chance(0.2); }
  else { A.type = 'palm'; A.butterfly = chance(0.3); A.spread = rand(1.2, 1.5); A.tines = randi(4, 7); A.mass = rand(1.05, 1.15); A.broken = randi(2, 4); A.blunt = chance(0.5); A.asym = 0.2; A.nonTyp = chance(0.4); }
  if (A.nonTyp) A.asym = Math.max(A.asym, 0.12);
  A.points = A.type === 'spike' ? 2 : A.type === 'fork' ? 4 : A.type === 'cervina' ? (A.tines + 1) * 2 : A.tines * 2 + (A.nonTyp ? randi(2, 4) : 0);
  A.form = A.type === 'palm' ? (A.butterfly ? 'split ("butterfly") palms' : 'solid palms') : A.type === 'cervina' ? 'branched, no palms' : A.type === 'fork' ? 'forks' : 'spikes';
  return A;
}
const rgbLin = (r, g, b) => [Math.pow(r / 255, 2.2), Math.pow(g / 255, 2.2), Math.pow(b / 255, 2.2)];
// The bull from "Bull Moose Reference Sheet.png": palms cut from the sheet (client/assets/reference).
export function refBullAntlers() {
  return { ref: true, type: 'palm', butterfly: false, spread: 1.62, tines: 11, mass: 1.15, tilt: 0.22, cup: 1.15, palmW: 1.35, vv: [0.7, 0.95, 0], asym: 0.04, tineUp: true, nonTyp: false, broken: 0, blunt: false,
    col: [rgbLin(124, 89, 60), rgbLin(149, 114, 85), rgbLin(191, 157, 128)], points: 22, form: 'solid palms (reference bull)' };
}
export const STYLE_NAMES = { charger: 'charger — trots in, grunting and thrashing', swagger: 'swaggerer — head high, swaying', cautious: 'cautious — slow, long stops, circles downwind', silent: 'quiet — comes in without a sound' };
function pickStyle(k) {
  const w = k === 'yearling' || k === 'young bull' ? [0.45, 0.2, 0.2, 0.15] : k === 'prime bull' ? [0.3, 0.35, 0.2, 0.15] : [0.15, 0.35, 0.35, 0.15];
  const s = ['charger', 'swagger', 'cautious', 'silent']; let r = random();
  for (let i = 0; i < 4; i++) { if (r < w[i]) return s[i]; r -= w[i]; }
  return 'swagger';
}
// From the reference renders: bulls dark chocolate with grizzled tips; cows warmer reddish-brown with a
// lighter grey-brown face and pale nose; calves an even reddish-tan; lower legs grey-tan on all.
export function coatPal(kind, worn) {
  const v = rand(0.9, 1.1); const P = (h, k = 1) => hexLin(h, k * v);
  if (kind === 'bull') return { body: P('#2e241c'), back: P(worn ? '#5e554b' : '#3d3128'), belly: P('#1d1712'), leg: P('#5c554c'), legUp: P('#2a221b'), head: P(worn ? '#4a3e34' : '#33281f'), muzzle: P('#231b15'), mane: P('#1c1611'), hoof: P('#16120f', 0.9) };
  if (kind === 'cow') return { body: P('#45362a'), back: P('#4f3e30'), belly: P('#2f251c'), leg: P('#77706a'), legUp: P('#3c2f24'), head: P('#544538'), muzzle: P('#5e5046'), mane: P('#33281f'), hoof: P('#1c1813') };
  return { body: P('#5c3e2a'), back: P('#62432e'), belly: P('#4a3022'), leg: P('#665244'), legUp: P('#5a3c2a'), head: P('#6e4a34'), muzzle: P('#4e3426'), mane: P('#5a3c2a'), hoof: P('#2a2018') };
}
// opt.cls / opt.style force a class index or temperament (test scenarios)
export function makeBullParams(opt = {}) {
  let r = random(), cls = BULL_CLASSES[0];
  for (const c of BULL_CLASSES) { if (r < c.p) { cls = c; break; } r -= c.p; }
  if (opt.cls != null) cls = BULL_CLASSES[opt.cls];
  const ant = antlerFor(cls); const spread = ant.spread, worn = !!cls.worn;
  const bold = clamp(cls.bold + rand(-0.15, 0.15), 0.1, 1); const style = opt.style || pickStyle(cls.k);
  const reply = style === 'silent' ? rand(0.08, 0.2) : style === 'charger' ? rand(0.65, 0.95) : rand(0.35, 0.8);
  return {
    cls, ant, style, scale: rand(cls.scale[0], cls.scale[1]), bold, reply,
    circle: clamp((style === 'cautious' ? 1.25 : 0.95) - bold + rand(-0.2, 0.2), 0.05, 0.9), comeThr: lerp(0.55, 0.25, bold), closeLim: rand(25, 45) * (1.3 - bold * 0.4),
    voice: { rate: { yearling: 1.12, 'young bull': 1.05, 'prime bull': 0.98, 'mature bull': 0.92, 'old battle-worn bull': 0.89 }[cls.k] * rand(0.97, 1.03), vol: 2.6 },
    pal: coatPal('bull', worn), worn, spreadIn: Math.round(spread * 39.37), points: ant.points,
  };
}
