// Who a bull is: size tier, type, body size, antlers, temperament, voice and coat. Rolled once by the host
// when the bull is born and sent to every browser, so everyone sees the same bull. The numbers live in catalog.js.
import { clamp, lerp, rand, randi, pick, chance, hexLin } from '../util.js';
import {
  BULL_TIERS,
  BULL_TYPES,
  STYLES,
  STYLE_NAMES,
  rollBullType,
  rollCoat,
  rollTraits,
  pickW,
  between,
} from './catalog.js';

export { STYLE_NAMES };
export const BULL_CLASSES = BULL_TIERS; // older name, still used by scenarios
export const ANT_COLS = [
  ['#4a3828', '#a8865e', '#e2d0aa'],
  ['#3a2c20', '#7a5e42', '#c8b48c'],
  ['#5a4634', '#b89c74', '#efe2c2'],
  ['#2e2218', '#5e4a36', '#a89678'],
];
const IN = 39.37;

// antlers for a bull of this tier and type (see BULL_TYPES[].ant in catalog.js)
export function antlerFor(tier, type = {}) {
  const T = type.ant || {},
    form = T.form || (tier.i === 0 ? pick(['spike', 'fork', 'cervina']) : 'palm');
  const q = T.q || [0, 1],
    f = rand(q[0], q[1]);
  const A = {
    type: form,
    asym: T.asym != null ? T.asym : 0.05,
    tilt: T.tilt ? between(T.tilt) : rand(0.15, 0.38),
    cup: rand(0.9, 1.3) * (T.cup || 1),
    palmW: rand(0.85, 1.15) * (T.palmW || 1),
    nonTyp: chance(T.nonTyp || (tier.i >= 3 ? 0.12 : 0)),
    broken: T.broken ? randi(T.broken[0], T.broken[1]) : 0,
    butterfly: chance(T.butterfly != null ? T.butterfly : 0.3),
    blunt: chance(T.blunt || 0),
    col: pick(ANT_COLS).map((h) => hexLin(h)),
  };
  A.spread = lerp(tier.spreadIn[0], tier.spreadIn[1], f) / IN;
  const tn = T.tines || tier.tines;
  A.tines =
    form === 'spike' || form === 'fork' ? 0 : randi(Math.max(form === 'cervina' ? 2 : 2, tn[0]), Math.max(2, tn[1]));
  A.mass = T.mass ? between(T.mass) : between(tier.mass);
  if (form !== 'palm') A.butterfly = false;
  if (A.nonTyp) A.asym = Math.max(A.asym, 0.12);
  A.points =
    form === 'spike'
      ? 2
      : form === 'fork'
        ? 4
        : form === 'cervina'
          ? (A.tines + 1) * 2
          : A.tines * 2 + (A.nonTyp ? randi(2, 4) : 0) - A.broken;
  A.form =
    form === 'palm'
      ? A.butterfly
        ? 'split ("butterfly") palms'
        : 'solid palms'
      : form === 'cervina'
        ? 'branched, no palms'
        : form === 'fork'
          ? 'forks'
          : 'spikes';
  return A;
}
const rgbLin = (r, g, b) => [Math.pow(r / 255, 2.2), Math.pow(g / 255, 2.2), Math.pow(b / 255, 2.2)];
// The bull from "Bull Moose Reference Sheet.png": palms cut from the sheet (client/assets/reference).
export function refBullAntlers() {
  return {
    ref: true,
    type: 'palm',
    butterfly: false,
    spread: 1.62,
    tines: 11,
    mass: 1.15,
    tilt: 0.22,
    cup: 1.15,
    palmW: 1.35,
    vv: [0.7, 0.95, 0],
    asym: 0.04,
    tineUp: true,
    nonTyp: false,
    broken: 0,
    blunt: false,
    col: [rgbLin(124, 89, 60), rgbLin(149, 114, 85), rgbLin(191, 157, 128)],
    points: 22,
    form: 'solid palms (reference bull)',
  };
}
// a coat's colours in linear RGB (what the browsers' simple fallback model wants)
export function palLin(c) {
  const v = rand(0.94, 1.06),
    o = {};
  for (const k in c) o[k] = hexLin(c[k], v);
  return o;
}
// kept for anything that still asks for a coat by kind
export function coatPal(kind) {
  return palLin(rollCoat(kind).c);
}

// opt: tier (0..6), type (id), minTier, style (force) — test scenarios and bellow-drawn bulls use them
export function makeBullParams(opt = {}) {
  if (opt.cls != null && opt.tier == null) opt = { ...opt, tier: opt.cls };
  const { tier, type } = rollBullType(opt);
  const traits = rollTraits(tier.traits, type.bias);
  const ant = antlerFor(tier, type);
  const worn = !!type.worn;
  const style = opt.style || type.style || STYLES[pickW([0, 1, 2, 3], (i) => tier.styleW[i])];
  const bold = traits.bold;
  const reply = style === 'silent' ? rand(0.08, 0.2) : style === 'charger' ? rand(0.65, 0.95) : rand(0.35, 0.8);
  const build = clamp((type.build || 0) * 0.5 + 0.5 + rand(-0.3, 0.3), 0, 1);
  const coat = rollCoat('bull', type.coat);
  return {
    cls: tier,
    tier: tier.i,
    type,
    typeId: type.id,
    typeName: type.name,
    ant,
    style,
    traits,
    scale: lerp(tier.scale[0], tier.scale[1], build),
    kg: Math.round(lerp(tier.kg[0], tier.kg[1], build)),
    bold,
    reply,
    circle: clamp((style === 'cautious' ? 1.25 : 0.95) - bold + rand(-0.2, 0.2), 0.05, 0.9),
    comeThr: lerp(0.55, 0.25, bold),
    closeLim: rand(25, 45) * (1.3 - bold * 0.4) * lerp(0.85, 1.2, traits.wary),
    voice: { rate: tier.voice * rand(0.97, 1.03), vol: 2.6 },
    coat,
    pal: palLin(coat.c),
    worn,
    spreadIn: Math.round(ant.spread * IN),
    points: ant.points,
    bellLen: between(tier.bellLen) * (worn ? 1.2 : 1),
  };
}
export { BULL_TYPES };
