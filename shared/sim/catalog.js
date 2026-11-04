// The animal catalogue: every species and every type of bull, cow and calf — sizes, coats, personalities, how
// often each shows up, and how each reacts to the others. The behaviour code (bull.js, cows.js, wildlife.js,
// ecology.js) reads its numbers from here, so tuning the marsh means editing this file.
//
// Real 3D models later: each species and coat has an id; a browser can map `species/coat` (or a bull type's id)
// to a model file and fall back to the sculpted polygon animal when there is none.
//
// Units: metres, seconds, m/s. Bull spreads are in inches (as hunters measure them). Weights (w) are relative.
import { clamp, lerp, rand, random } from '../util.js';

/* ---------------------------------------------------------------- helpers */
export function pickW(list, w = (x) => x.w) {
  let t = 0;
  for (const x of list) t += w(x);
  let r = random() * t;
  for (const x of list) {
    r -= w(x);
    if (r < 0) return x;
  }
  return list[list.length - 1];
}
const pickKey = (obj) => pickW(Object.entries(obj), (e) => e[1])[0];
export const between = ([a, b]) => rand(a, b);

/* ---------------------------------------------------------------- personality
   Every animal gets a set of traits (0..1), rolled from its species' base and nudged by its type:
     bold        walks into the open, answers calls, slow to spook
     wary        notices things early, scans, spooks at less
     curious     goes to look at things (calves especially)
     playful     bucks, frisks, trots in circles (calves, young animals)
     aggressive  stands its ground, challenges, chases
     persistent  keeps at it (a young bull after a cow that wants nothing to do with him)
     restless    moves on sooner, covers more ground
     lazy        beds sooner and longer
     rut         a bull's drive to find cows (and fight for them)                                               */
export const TRAITS = ['bold', 'wary', 'curious', 'playful', 'aggressive', 'persistent', 'restless', 'lazy', 'rut'];
export function rollTraits(base = {}, bias = {}) {
  const t = {};
  for (const k of TRAITS) {
    const [m, s] = base[k] || [0.5, 0.2];
    t[k] = +clamp(m + (bias[k] || 0) + rand(-s, s), 0, 1).toFixed(2);
  }
  return t;
}

/* ---------------------------------------------------------------- coats (hex; browsers convert)
   Moose coat keys: body back belly legUp (above the knee) leg (just below the knee) shin (down by the hoof: the
   lower leg fades from leg to shin) hoof head muzzle mane; optional bell, and hump + humpK (grey worked into the hump)                                               */
export const MOOSE_COATS = {
  bull: {
    'old-grey': {
      name: 'very dark brown, grey on the hump and bell',
      c: {
        body: '#231a13',
        back: '#281e16',
        belly: '#6c5440',
        legUp: '#1f1712',
        leg: '#57432f',
        shin: '#8a7257',
        hoof: '#0c0a09',
        head: '#261c15',
        muzzle: '#1b1410',
        mane: '#28221e',
        humpK: 0.4,
        bell: '#4e4842',
        hump: '#6a645d',
      },
    },
    'old-grizzled': {
      name: 'very dark brown, grizzled grey hump and bell',
      c: {
        body: '#261c15',
        back: '#2b2018',
        belly: '#6e5642',
        legUp: '#211913',
        leg: '#59452f',
        shin: '#8c7459',
        hoof: '#0c0a09',
        head: '#291f17',
        muzzle: '#1d1511',
        mane: '#2e2823',
        humpK: 0.5,
        bell: '#5c5650',
        hump: '#77706a',
      },
    },
    'black-brown': {
      name: 'black-brown',
      c: {
        body: '#1d1712',
        back: '#211a14',
        belly: '#644f3b',
        legUp: '#1a1410',
        leg: '#52402e',
        shin: '#806a52',
        hoof: '#0c0a09',
        head: '#201913',
        muzzle: '#18120e',
        mane: '#15110d',
      },
    },
    sooty: {
      name: 'sooty near-black',
      c: {
        body: '#1a1613',
        back: '#1e1915',
        belly: '#5e4c3a',
        legUp: '#17130f',
        leg: '#4e3e2d',
        shin: '#7c674f',
        hoof: '#0c0a09',
        head: '#1d1814',
        muzzle: '#16120f',
        mane: '#131010',
      },
    },
    'dark-chocolate': {
      name: 'darkest chocolate',
      c: {
        body: '#221911',
        back: '#271d14',
        belly: '#68523d',
        legUp: '#1e160f',
        leg: '#55422f',
        shin: '#846d54',
        hoof: '#0c0a09',
        head: '#251b13',
        muzzle: '#1a130e',
        mane: '#17110c',
      },
    },
    umber: {
      name: 'deep umber',
      c: {
        body: '#241b14',
        back: '#291f17',
        belly: '#6a533f',
        legUp: '#20180f',
        leg: '#57442f',
        shin: '#877057',
        hoof: '#0c0a09',
        head: '#271d15',
        muzzle: '#1c140f',
        mane: '#19130e',
      },
    },
    coal: {
      name: 'coal brown',
      c: {
        body: '#1b1511',
        back: '#1f1813',
        belly: '#605039',
        legUp: '#18120e',
        leg: '#4f3f2d',
        shin: '#7e6950',
        hoof: '#0c0a09',
        head: '#1e1712',
        muzzle: '#15110d',
        mane: '#120f0c',
      },
    },
  },
  cow: {
    'dark-brown': {
      name: 'dark brown',
      c: {
        body: '#2a2018',
        back: '#2f241b',
        belly: '#6e5642',
        legUp: '#251c15',
        leg: '#5a4632',
        shin: '#8a7259',
        hoof: '#0c0a09',
        head: '#30251c',
        muzzle: '#271d16',
        mane: '#201812',
      },
    },
    'deep-brown': {
      name: 'deep brown',
      c: {
        body: '#251c15',
        back: '#2a2018',
        belly: '#6a533f',
        legUp: '#211913',
        leg: '#57442f',
        shin: '#877057',
        hoof: '#0c0a09',
        head: '#2b2119',
        muzzle: '#231a14',
        mane: '#1d1611',
      },
    },
    chocolate: {
      name: 'dark chocolate',
      c: {
        body: '#2c1f15',
        back: '#31231a',
        belly: '#705640',
        legUp: '#271b12',
        leg: '#5b4531',
        shin: '#8b7158',
        hoof: '#0c0a09',
        head: '#33251a',
        muzzle: '#291d14',
        mane: '#21170f',
      },
    },
    sooty: {
      name: 'sooty brown',
      c: {
        body: '#221c17',
        back: '#26201a',
        belly: '#665240',
        legUp: '#1e1914',
        leg: '#54432f',
        shin: '#836d55',
        hoof: '#0c0a09',
        head: '#28211b',
        muzzle: '#211b16',
        mane: '#1a1511',
      },
    },
    greyface: {
      name: 'dark, grey-faced',
      c: {
        body: '#29211a',
        back: '#2e251d',
        belly: '#6c5643',
        legUp: '#241d16',
        leg: '#59472f',
        shin: '#8a745b',
        hoof: '#0c0a09',
        head: '#4a433c',
        muzzle: '#3e3732',
        mane: '#211a14',
      },
    },
  },
  calf: {
    red: {
      name: 'reddish',
      c: {
        body: '#5c3e2a',
        back: '#62432e',
        belly: '#4a3022',
        legUp: '#5a3c2a',
        leg: '#665244',
        hoof: '#2a2018',
        head: '#5e4030',
        muzzle: '#4a3426',
        mane: '#4a3224',
      },
    },
    ginger: {
      name: 'ginger',
      c: {
        body: '#6e4530',
        back: '#754b34',
        belly: '#563526',
        legUp: '#6a432e',
        leg: '#76604e',
        hoof: '#2a2018',
        head: '#704a34',
        muzzle: '#56392a',
        mane: '#5a3a28',
      },
    },
    dusky: {
      name: 'dusky brown',
      c: {
        body: '#4a3526',
        back: '#533b2a',
        belly: '#38281c',
        legUp: '#4a3425',
        leg: '#5e4c3e',
        hoof: '#2a2018',
        head: '#4e3828',
        muzzle: '#3e2c20',
        mane: '#3c2a1e',
      },
    },
  },
};

/* ---------------------------------------------------------------- bull moose
   Six size tiers, smallest first (age drives body size and rack); each tier has named types.
   scale: body size (1 = the sculpted model); each size down is ~5% smaller in body and ~10% in antlers, and the
   two biggest are each ~10% bigger again. spreadIn: the antler spread you see, in inches (not scaled by body).
   coats: which coats this size wears (MOOSE_COATS.bull); styleW: how likely each approach style is
   [charger, swagger, cautious, silent]; role: how he reacts to predators and other bulls (see REACT)          */
export const BULL_TIERS = [
  {
    i: 0,
    k: 'small',
    label: 'small bull',
    age: '3½–4½',
    w: 0.17,
    scale: [0.883, 0.926],
    kg: [430, 500],
    spreadIn: [42, 48],
    tines: [4, 7],
    mass: [0.55, 0.7],
    styleW: [0.45, 0.2, 0.2, 0.15],
    voice: 1.07,
    bellLen: [0.18, 0.32],
    role: 'bullSmall',
    coats: { 'black-brown': 1, sooty: 1, 'dark-chocolate': 1, umber: 1, coal: 1 },
    traits: {
      bold: [0.75, 0.12],
      wary: [0.3, 0.15],
      curious: [0.6, 0.15],
      playful: [0.3, 0.15],
      aggressive: [0.35, 0.15],
      persistent: [0.85, 0.12],
      rut: [0.65, 0.2],
    },
  },
  {
    i: 1,
    k: 'medium',
    label: 'medium bull',
    age: '5½–6½',
    w: 0.22,
    scale: [0.93, 0.975],
    kg: [490, 560],
    spreadIn: [47, 53],
    tines: [5, 8],
    mass: [0.7, 0.85],
    styleW: [0.32, 0.33, 0.2, 0.15],
    voice: 1.01,
    bellLen: [0.25, 0.45],
    role: 'bullMid',
    coats: { 'black-brown': 1, sooty: 1, 'dark-chocolate': 1, umber: 1, coal: 1 },
    traits: {
      bold: [0.62, 0.12],
      wary: [0.4, 0.15],
      curious: [0.45, 0.15],
      playful: [0.15, 0.1],
      aggressive: [0.5, 0.15],
      persistent: [0.6, 0.15],
      rut: [0.75, 0.15],
    },
  },
  {
    i: 2,
    k: 'medium-large',
    label: 'medium-large bull',
    age: '6½–8',
    w: 0.22,
    scale: [0.979, 1.026],
    kg: [540, 610],
    spreadIn: [52, 59],
    tines: [6, 10],
    mass: [0.85, 1.0],
    styleW: [0.28, 0.35, 0.22, 0.15],
    voice: 0.97,
    bellLen: [0.3, 0.5],
    role: 'bullMid',
    coats: { 'black-brown': 1, sooty: 1, 'dark-chocolate': 1, umber: 1, coal: 1 },
    traits: {
      bold: [0.52, 0.12],
      wary: [0.5, 0.15],
      curious: [0.35, 0.15],
      playful: [0.1, 0.08],
      aggressive: [0.6, 0.15],
      persistent: [0.5, 0.15],
      rut: [0.85, 0.12],
    },
  },
  {
    i: 3,
    k: 'large',
    label: 'large bull',
    age: '8–10',
    w: 0.2,
    scale: [1.03, 1.08],
    kg: [570, 660],
    spreadIn: [58, 66],
    tines: [8, 12],
    mass: [1.0, 1.12],
    styleW: [0.18, 0.37, 0.3, 0.15],
    voice: 0.93,
    bellLen: [0.35, 0.55],
    role: 'bullBig',
    coats: { 'black-brown': 1, sooty: 1, 'dark-chocolate': 1, umber: 1, coal: 1 },
    traits: {
      bold: [0.42, 0.12],
      wary: [0.6, 0.15],
      curious: [0.3, 0.12],
      playful: [0.05, 0.05],
      aggressive: [0.7, 0.15],
      persistent: [0.45, 0.15],
      rut: [0.9, 0.1],
    },
  },
  {
    i: 4,
    k: 'very large',
    label: 'very large bull',
    age: '10–12',
    w: 0.14,
    scale: [1.133, 1.188],
    kg: [650, 740],
    spreadIn: [64, 72],
    tines: [10, 14],
    mass: [1.1, 1.2],
    styleW: [0.15, 0.35, 0.35, 0.15],
    voice: 0.9,
    bellLen: [0.4, 0.6],
    role: 'bullBig',
    coats: { 'black-brown': 1, sooty: 1, 'dark-chocolate': 1, umber: 1, coal: 1 },
    traits: {
      bold: [0.35, 0.12],
      wary: [0.68, 0.12],
      curious: [0.25, 0.12],
      playful: [0.03, 0.03],
      aggressive: [0.75, 0.12],
      persistent: [0.4, 0.15],
      rut: [0.9, 0.1],
    },
  },
  {
    i: 5,
    k: 'extremely large',
    label: 'extremely large bull (rare)',
    age: '11–14',
    w: 0.04,
    scale: [1.246, 1.307],
    kg: [720, 820],
    spreadIn: [70, 79],
    tines: [12, 16],
    mass: [1.18, 1.28],
    styleW: [0.1, 0.35, 0.4, 0.15],
    voice: 0.87,
    bellLen: [0.45, 0.65],
    role: 'bullBig',
    coats: { 'old-grey': 2, 'old-grizzled': 1 },
    traits: {
      bold: [0.3, 0.1],
      wary: [0.75, 0.12],
      curious: [0.2, 0.1],
      playful: [0.02, 0.02],
      aggressive: [0.8, 0.12],
      persistent: [0.35, 0.15],
      rut: [0.95, 0.05],
    },
  },
];
// Antler forms: spike | fork | cervina (branched, no palms) | palm. Fields left out fall back to the tier's.
//   q: where in the tier's spread range he falls [0..1, 0..1]  butterfly/nonTyp/blunt: chance  broken: [min, max] snapped tines
//   palmW/cup: palm width / cupping multipliers  tilt: how far the palms lie back  build: body size within the tier (-1..1)
//   bias: nudges to personality   style: fixed approach style   (coats come from the tier)
export const BULL_TYPES = [
  // small (4)
  {
    id: 'young-cervina',
    tier: 0,
    w: 1,
    name: 'Young cervina bull',
    note: 'long branched tines, no palms yet',
    ant: { form: 'cervina' },
  },
  {
    id: 'young-paddle',
    tier: 0,
    w: 1.2,
    name: 'Young paddle bull',
    note: 'narrow first palms',
    ant: { form: 'palm', palmW: 0.7 },
  },
  {
    id: 'lanky',
    tier: 0,
    w: 0.9,
    name: 'Lanky young bull',
    note: 'long-legged, thin, will not take no for an answer',
    ant: { form: 'palm', palmW: 0.6, q: [0, 0.6] },
    build: -0.6,
    bias: { persistent: 0.1, bold: 0.05 },
  },
  {
    id: 'lopsided',
    tier: 0,
    w: 0.7,
    name: 'Lopsided young bull',
    note: 'one side palmed, one side branched',
    ant: { form: 'palm', palmW: 0.7, nonTyp: 1, asym: 0.25 },
  },
  // medium (6)
  {
    id: 'solid-palm-3',
    tier: 1,
    w: 1.3,
    name: 'Solid-palm bull',
    note: 'first good set of solid palms',
    ant: { form: 'palm', butterfly: 0 },
  },
  {
    id: 'butterfly-3',
    tier: 1,
    w: 1,
    name: 'Butterfly-palm bull',
    note: 'split brow palms',
    ant: { form: 'palm', butterfly: 1 },
  },
  {
    id: 'rut-black',
    tier: 1,
    w: 0.9,
    name: 'Rut-stained bull',
    note: 'stained from the wallows, rutting hard',
    ant: { form: 'palm' },
    bias: { rut: 0.1 },
  },
  {
    id: 'dusky',
    tier: 1,
    w: 0.8,
    name: 'Dusky bull',
    note: 'keeps to the willows, slips in quietly',
    ant: { form: 'palm' },
  },
  {
    id: 'timber-3',
    tier: 1,
    w: 0.8,
    name: 'Wary timber bull',
    note: 'hangs up in the trees, circles downwind',
    ant: { form: 'palm' },
    style: 'cautious',
    bias: { wary: 0.2, bold: -0.15 },
  },
  {
    id: 'scrapper-3',
    tier: 1,
    w: 0.8,
    name: 'Scrappy bull',
    note: 'picks fights above his weight; a snapped tine',
    ant: { form: 'palm', broken: [1, 2] },
    style: 'charger',
    bias: { aggressive: 0.2 },
  },
  // medium-large (6)
  {
    id: 'broad-palm',
    tier: 2,
    w: 1.2,
    name: 'Broad-palm bull',
    note: 'wide shovel palms',
    ant: { form: 'palm', palmW: 1.2, butterfly: 0.2 },
  },
  {
    id: 'tall-tine',
    tier: 2,
    w: 1,
    name: 'Tall-tined bull',
    note: 'long points along the palm edge',
    ant: { form: 'palm', tines: [7, 9], palmW: 0.9 },
  },
  {
    id: 'rangy',
    tier: 2,
    w: 0.9,
    name: 'Rangy bull',
    note: 'long-legged and lean',
    ant: { form: 'palm' },
  },
  {
    id: 'swaggerer',
    tier: 2,
    w: 1,
    name: 'Swaggering bull',
    note: 'head high, rack swaying, all show',
    ant: { form: 'palm', butterfly: 0.4 },
    style: 'swagger',
    bias: { bold: 0.1 },
  },
  {
    id: 'non-typ-4',
    tier: 2,
    w: 0.7,
    name: 'Non-typical bull',
    note: 'odd extra points and a twisted palm',
    ant: { form: 'palm', nonTyp: 1, asym: 0.18 },
  },
  {
    id: 'silent-4',
    tier: 2,
    w: 0.8,
    name: 'Silent bull',
    note: 'comes in without a sound',
    ant: { form: 'palm' },
    style: 'silent',
    bias: { wary: 0.1 },
  },
  // large (6)
  {
    id: 'heavy-palm',
    tier: 3,
    w: 1.2,
    name: 'Heavy-palm bull',
    note: 'thick, deep palms in his prime',
    ant: { form: 'palm', mass: [1.0, 1.08], cup: 1.15 },
  },
  {
    id: 'butterfly-big',
    tier: 3,
    w: 1,
    name: 'Big butterfly bull',
    note: 'split palms, wide brow points',
    ant: { form: 'palm', butterfly: 1 },
  },
  {
    id: 'black-bull',
    tier: 3,
    w: 0.9,
    name: 'Black bull',
    note: 'the darkest coat in the marsh',
    ant: { form: 'palm' },
    bias: { rut: 0.05, aggressive: 0.05 },
  },
  {
    id: 'scarred',
    tier: 3,
    w: 0.9,
    name: 'Scarred fighter',
    note: 'two snapped points, quick to fight',
    ant: { form: 'palm', broken: [1, 3] },
    style: 'charger',
    bias: { aggressive: 0.15 },
  },
  {
    id: 'flat-wide',
    tier: 3,
    w: 0.9,
    name: 'Wide flat-palm bull',
    note: 'palms laid back and wide',
    ant: { form: 'palm', q: [0.6, 1], tilt: [0.1, 0.18], cup: 0.85 },
  },
  {
    id: 'high-shoulder',
    tier: 3,
    w: 0.8,
    name: 'High-shouldered bull',
    note: 'tall at the shoulder, deep-chested',
    ant: { form: 'palm' },
  },
  // very large (6)
  {
    id: 'monarch',
    tier: 4,
    w: 1.1,
    name: 'Marsh monarch',
    note: 'massive, many-pointed palms',
    ant: { form: 'palm', tines: [10, 12], mass: [1.1, 1.15] },
  },
  {
    id: 'battle-worn',
    tier: 4,
    w: 1,
    name: 'Old battle-worn bull',
    note: 'past his best: broken, blunted points, a scarred hide',
    ant: { form: 'palm', q: [0, 0.5], broken: [2, 4], blunt: 0.6, asym: 0.2, nonTyp: 0.4 },
    worn: true,
    build: -0.3,
    bias: { wary: 0.1, aggressive: 0.05 },
  },
  {
    id: 'wide-butterfly',
    tier: 4,
    w: 0.9,
    name: 'Wide butterfly giant',
    note: 'deeply split palms, enormous spread',
    ant: { form: 'palm', butterfly: 1, q: [0.5, 1] },
  },
  {
    id: 'heavy-chocolate',
    tier: 4,
    w: 0.9,
    name: 'Heavy chocolate bull',
    note: 'the biggest body in the marsh',
    ant: { form: 'palm', cup: 1.2 },
    build: 0.7,
  },
  {
    id: 'drop-tine',
    tier: 4,
    w: 0.7,
    name: 'Drop-tine giant',
    note: 'non-typical: extra points hanging off the palms',
    ant: { form: 'palm', nonTyp: 1, asym: 0.15 },
  },
  {
    id: 'quiet-giant',
    tier: 4,
    w: 0.8,
    name: 'Quiet old giant',
    note: 'barely grunts, stays in the timber',
    ant: { form: 'palm' },
    style: 'silent',
    bias: { wary: 0.15, bold: -0.1 },
  },
  // extremely large and rare (3)
  {
    id: 'marsh-king',
    tier: 5,
    w: 1,
    name: 'The Marsh King',
    note: 'once in a lifetime: 65"+, 28+ points',
    ant: { form: 'palm', q: [0.4, 1], tines: [13, 15], mass: [1.18, 1.25], palmW: 1.25 },
    build: 0.6,
  },
  {
    id: 'grey-bell',
    tier: 5,
    w: 0.7,
    name: 'Grey-belled giant',
    note: 'long grey bell and a greying hump; the one people tell stories about',
    ant: { form: 'palm', butterfly: 0.5 },
    bias: { wary: 0.15 },
  },
  {
    id: 'mossback',
    tier: 5,
    w: 0.9,
    name: 'Old Mossback',
    note: 'ancient, huge-bodied, palms like shovels, a few points snapped',
    ant: { form: 'palm', broken: [1, 3], blunt: 0.4, mass: [1.2, 1.25], cup: 1.25 },
    build: 0.8,
    worn: true,
    bias: { aggressive: 0.1, wary: 0.1 },
  },
];
export const BULL_TYPE = Object.fromEntries(BULL_TYPES.map((t) => [t.id, t]));
// approach styles (how he comes to a call) — see bull.js
export const STYLE_NAMES = {
  charger: 'charger — trots in, grunting and thrashing',
  swagger: 'swaggerer — head high, swaying',
  cautious: 'cautious — slow, long stops, circles downwind',
  silent: 'quiet — comes in without a sound',
};
export const STYLES = ['charger', 'swagger', 'cautious', 'silent'];

/* ---------------------------------------------------------------- cows and calves
   calf: chance she has a calf at heel; twins: chance of a second one if she has one                            */
export const COW_TYPES = [
  {
    id: 'yearling-cow',
    w: 0.6,
    name: 'Yearling cow',
    note: "last year's calf, on her own, a little skittish",
    scale: [0.76, 0.8],
    calf: 0,
    twins: 0,
    coat: { 'dark-brown': 1, 'deep-brown': 1 },
    bias: { wary: 0.1, curious: 0.15, playful: 0.15, bold: -0.1 },
  },
  {
    id: 'young-cow',
    w: 1,
    name: 'Young cow',
    note: 'first or second calf',
    scale: [0.8, 0.84],
    calf: 0.45,
    twins: 0.08,
    coat: { 'dark-brown': 2, 'deep-brown': 1, chocolate: 1 },
  },
  {
    id: 'prime-cow',
    w: 1.4,
    name: 'Prime cow',
    note: 'big, steady, usually has a calf (sometimes twins)',
    scale: [0.83, 0.87],
    calf: 0.7,
    twins: 0.25,
    coat: { 'dark-brown': 2, chocolate: 1, sooty: 1 },
  },
  {
    id: 'big-cow',
    w: 0.6,
    name: 'Big-bodied cow',
    note: 'as tall as a young bull',
    scale: [0.86, 0.9],
    calf: 0.6,
    twins: 0.2,
    coat: { 'deep-brown': 1, sooty: 1, chocolate: 1 },
    bias: { bold: 0.1, aggressive: 0.1 },
  },
  {
    id: 'old-cow',
    w: 0.6,
    name: 'Old cow',
    note: 'grey-faced, very wary, slow to settle',
    scale: [0.82, 0.86],
    calf: 0.45,
    twins: 0.05,
    coat: { greyface: 2, sooty: 1 },
    bias: { wary: 0.25, restless: -0.1, lazy: 0.1 },
  },
  {
    id: 'sooty-cow',
    w: 0.35,
    name: 'Sooty cow',
    note: 'the darkest of the cows, almost black',
    scale: [0.81, 0.86],
    calf: 0.5,
    twins: 0.1,
    coat: { sooty: 2, 'deep-brown': 1 },
  },
];
export const COW_TRAITS = {
  bold: [0.4, 0.15],
  wary: [0.6, 0.2],
  curious: [0.35, 0.15],
  playful: [0.1, 0.08],
  aggressive: [0.35, 0.2],
  persistent: [0.5, 0.2],
  restless: [0.5, 0.3],
  lazy: [0.5, 0.3],
  rut: [0.5, 0.3],
};
export const CALF_TYPES = [
  // autumn calves, four to five months old; scale is a fraction of the mother's
  { id: 'calf', w: 2, name: 'Calf', note: 'reddish, all legs', scale: [0.5, 0.54], coat: { red: 2, ginger: 1 } },
  {
    id: 'big-calf',
    w: 0.8,
    name: 'Big calf',
    note: 'an early calf, already sturdy',
    scale: [0.54, 0.58],
    coat: { red: 1, dusky: 1 },
    bias: { bold: 0.1 },
  },
  {
    id: 'small-calf',
    w: 0.6,
    name: 'Small calf',
    note: 'a late calf (or a twin), sticks close',
    scale: [0.45, 0.5],
    coat: { ginger: 1, red: 1 },
    bias: { wary: 0.15, curious: -0.1 },
  },
];
export const CALF_TRAITS = {
  bold: [0.3, 0.15],
  wary: [0.35, 0.2],
  curious: [0.8, 0.15],
  playful: [0.75, 0.2],
  aggressive: [0.05, 0.05],
  persistent: [0.3, 0.2],
  restless: [0.6, 0.25],
  lazy: [0.4, 0.2],
  rut: [0, 0],
};
// how calves keep to their mother (metres)
export const CALF_LEASH = { heel: [3, 6], wander: [6, 16], max: 26, play: [5, 13] };
// how a cow treats bulls: a cow with a calf keeps them at a distance; a lone cow welcomes older bulls and gets
// annoyed with young ones, and her bellows carry and bring other bulls
export const COW_SOCIAL = {
  keepOffCalf: [45, 75], // a cow with a calf moves away from a bull closer than this (scaled by wary)
  receptiveTier: 3, // a lone cow is receptive to bulls of this tier and up (large and bigger)
  tolerateTier: 2, // ... tolerates this tier (with the odd bout of annoyance)
  annoyNear: 30, // a young bull this close annoys her
  annoyRate: 0.045, // annoyance per second while he pesters (0..1; she bellows at 1)
  bellowGap: [25, 60], // seconds between bellows at the least
  bellowRange: 1500, // how far her bellow carries to other bulls
  bellowNewBull: 0.55, // chance a bellow brings in a new (bigger) bull when none is around to answer
};

/* ---------------------------------------------------------------- other species
   move: walk/trot/run speeds (m/s at scale 1), stride (m per cycle), turn (rad/s)
   sizes: age/sex classes with a body scale; coats: colour phases (keys match the browser's sculpted model)
   group: how many come together; spawn: every [a,b] seconds, chance p, max at once                            */
export const SPECIES = {
  bear: {
    label: 'American black bear',
    role: 'bear',
    predator: true,
    move: { walk: 0.9, trot: 2.2, run: 8, stride: 1.1, turn: 1.4 },
    group: [1, 1],
    forage: true,
    spawn: { first: [240, 600], every: [480, 900], p: 0.55, max: 1 },
    traits: {
      bold: [0.6, 0.2],
      wary: [0.5, 0.2],
      curious: [0.6, 0.2],
      playful: [0.1, 0.1],
      aggressive: [0.35, 0.2],
      persistent: [0.5, 0.2],
      restless: [0.4, 0.2],
      lazy: [0.5, 0.2],
    },
    sizes: [
      { id: 'yearling', w: 0.25, name: 'yearling', scale: [0.7, 0.8], bias: { curious: 0.2, bold: -0.15, wary: 0.1 } },
      { id: 'sow', w: 0.4, name: 'sow', scale: [0.88, 0.98] },
      { id: 'boar', w: 0.28, name: 'boar', scale: [1.02, 1.15], bias: { bold: 0.1, aggressive: 0.1 } },
      {
        id: 'big-boar',
        w: 0.07,
        name: 'big old boar',
        scale: [1.18, 1.3],
        bias: { bold: 0.2, aggressive: 0.15, wary: 0.1 },
      },
    ],
    coats: [
      {
        id: 'black',
        w: 4,
        name: 'black',
        c: {
          body: '#0b0a09',
          belly: '#090807',
          head: '#0e0d0c',
          muzzle: '#8a6e50',
          ear: '#141210',
          leg: '#100e0d',
          legLo: '#0e0c0b',
          paw: '#0b0a09',
          tail: '#141210',
        },
      },
      {
        id: 'grey-tipped',
        w: 1,
        name: 'black, a touch of grey',
        c: {
          body: '#151413',
          belly: '#0c0b0a',
          head: '#1f1d1b',
          muzzle: '#8e7658',
          ear: '#1a1817',
          leg: '#0e0d0c',
          legLo: '#0c0b0a',
          paw: '#0b0a09',
          tail: '#151413',
        },
      },
    ],
  },
  wolf: {
    label: 'grey wolf',
    role: 'wolf',
    predator: true,
    move: { walk: 1.3, trot: 3.2, run: 9, stride: 1.0, turn: 1.6 },
    group: [2, 5],
    spawn: { first: [300, 650], every: [420, 840], p: 0.55 * 0.4, max: 1 },
    traits: {
      bold: [0.5, 0.2],
      wary: [0.65, 0.15],
      curious: [0.5, 0.2],
      playful: [0.25, 0.2],
      aggressive: [0.55, 0.2],
      persistent: [0.6, 0.2],
      restless: [0.7, 0.2],
      lazy: [0.2, 0.15],
    },
    sizes: [
      { id: 'yearling', w: 0.3, name: 'yearling', scale: [0.86, 0.93], bias: { playful: 0.2, curious: 0.1 } },
      { id: 'female', w: 0.35, name: 'female', scale: [0.93, 1.0] },
      { id: 'male', w: 0.35, name: 'male', scale: [1.0, 1.1], bias: { bold: 0.1, aggressive: 0.1 } },
    ],
    coats: [
      {
        id: 'grey',
        w: 5,
        name: 'grey',
        c: {
          body: '#6a655c',
          belly: '#a8a090',
          head: '#7a7468',
          muzzle: '#a49a88',
          ear: '#4a4640',
          leg: '#8a8274',
          legLo: '#9a9284',
          paw: '#3a3632',
          tail: '#5a554c',
          ruff: '#77716a',
        },
      },
      {
        id: 'black',
        w: 1.5,
        name: 'black',
        c: {
          body: '#1e1c1a',
          belly: '#2e2b28',
          head: '#232120',
          muzzle: '#3a3632',
          ear: '#151413',
          leg: '#26231f',
          legLo: '#2e2b27',
          paw: '#121110',
          tail: '#1a1817',
          ruff: '#262422',
        },
      },
      {
        id: 'tawny',
        w: 1.5,
        name: 'tawny grey',
        c: {
          body: '#7e6c56',
          belly: '#b6a68c',
          head: '#8a7860',
          muzzle: '#b0a088',
          ear: '#54463a',
          leg: '#9a8870',
          legLo: '#a8987e',
          paw: '#3a3228',
          tail: '#6a5a48',
          ruff: '#8a7a64',
        },
      },
      {
        id: 'cream',
        w: 0.4,
        name: 'cream (rare)',
        c: {
          body: '#b8b0a0',
          belly: '#d8d0c0',
          head: '#c0b8a8',
          muzzle: '#d0c8b8',
          ear: '#8a8274',
          leg: '#c8c0b0',
          legLo: '#d0c8b8',
          paw: '#5a5448',
          tail: '#a8a090',
          ruff: '#c4bcac',
        },
      },
    ],
  },
  coyote: {
    label: 'eastern coyote',
    role: 'coyote',
    predator: true,
    move: { walk: 1.2, trot: 3.0, run: 8.5, stride: 0.85, turn: 1.8 },
    group: [1, 3],
    spawn: { first: [200, 500], every: [420, 840], p: 0.55 * 0.6, max: 1 },
    traits: {
      bold: [0.4, 0.2],
      wary: [0.7, 0.15],
      curious: [0.6, 0.2],
      playful: [0.3, 0.2],
      aggressive: [0.35, 0.2],
      persistent: [0.5, 0.2],
      restless: [0.7, 0.2],
      lazy: [0.2, 0.15],
    },
    sizes: [
      {
        id: 'pup',
        w: 0.3,
        name: "this year's pup",
        scale: [0.62, 0.68],
        bias: { playful: 0.25, curious: 0.15, wary: -0.1 },
      },
      { id: 'female', w: 0.35, name: 'female', scale: [0.7, 0.76] },
      { id: 'male', w: 0.35, name: 'male', scale: [0.76, 0.84], bias: { bold: 0.1 } },
    ],
    coats: [
      {
        id: 'grizzled',
        w: 4,
        name: 'grizzled buff',
        c: {
          body: '#8a7458',
          belly: '#c4b498',
          head: '#9a8264',
          muzzle: '#c0ac8c',
          ear: '#6a5440',
          leg: '#a08866',
          legLo: '#b09a78',
          paw: '#4a3e30',
          tail: '#7a6448',
          ruff: '#9a8466',
        },
      },
      {
        id: 'red',
        w: 1.5,
        name: 'reddish',
        c: {
          body: '#94664a',
          belly: '#c8ac90',
          head: '#a07050',
          muzzle: '#c4a484',
          ear: '#704830',
          leg: '#a8805e',
          legLo: '#b89470',
          paw: '#4a3424',
          tail: '#80583e',
          ruff: '#a0745a',
        },
      },
      {
        id: 'dark',
        w: 1,
        name: 'dark',
        c: {
          body: '#4e4438',
          belly: '#8a7e6c',
          head: '#5a4e40',
          muzzle: '#8a7c68',
          ear: '#3a3228',
          leg: '#6a5e4e',
          legLo: '#7a6e5c',
          paw: '#2a241c',
          tail: '#443a30',
          ruff: '#5a5042',
        },
      },
      {
        id: 'pale',
        w: 0.6,
        name: 'pale',
        c: {
          body: '#a89a82',
          belly: '#d4c8b2',
          head: '#b4a68c',
          muzzle: '#d0c4ac',
          ear: '#7a6c58',
          leg: '#bcae94',
          legLo: '#c8baa0',
          paw: '#504636',
          tail: '#988a74',
          ruff: '#b4a690',
        },
      },
    ],
  },
  raccoon: {
    label: 'raccoon',
    role: 'raccoon',
    move: { walk: 0.55, trot: 1.5, run: 3.5, stride: 0.32, turn: 1.6 },
    group: [1, 1],
    forage: true,
    spawn: { first: [150, 360], every: [300, 600], p: 0.6, max: 1 },
    traits: {
      bold: [0.45, 0.2],
      wary: [0.5, 0.2],
      curious: [0.75, 0.15],
      playful: [0.3, 0.2],
      aggressive: [0.2, 0.15],
      persistent: [0.6, 0.2],
      restless: [0.4, 0.2],
      lazy: [0.4, 0.2],
    },
    sizes: [
      { id: 'young', w: 0.35, name: "this year's young", scale: [0.75, 0.86], bias: { curious: 0.15, playful: 0.2 } },
      { id: 'adult', w: 0.5, name: 'adult', scale: [0.95, 1.08] },
      { id: 'big', w: 0.15, name: 'big old boar', scale: [1.1, 1.22], bias: { bold: 0.15 } },
    ],
    coats: [
      {
        id: 'grey',
        w: 4,
        name: 'grey',
        c: {
          body: '#4e4a42',
          belly: '#625c52',
          head: '#7a766c',
          muzzle: '#d0ccc2',
          ear: '#4a4640',
          leg: '#3a3632',
          legLo: '#2a2725',
          paw: '#1e1c1a',
          tail: '#7a7266',
          mask: '#161412',
        },
      },
      {
        id: 'brown',
        w: 1.5,
        name: 'brownish',
        c: {
          body: '#5a4a3a',
          belly: '#6e5e4c',
          head: '#86786a',
          muzzle: '#d2c8bc',
          ear: '#4e4234',
          leg: '#3e342a',
          legLo: '#2c2620',
          paw: '#1e1a16',
          tail: '#7e6e5c',
          mask: '#18140f',
        },
      },
      {
        id: 'dark',
        w: 1,
        name: 'dark',
        c: {
          body: '#35322e',
          belly: '#46423c',
          head: '#5c5852',
          muzzle: '#bab6ae',
          ear: '#2e2b28',
          leg: '#262422',
          legLo: '#1e1c1a',
          paw: '#141312',
          tail: '#5a5650',
          mask: '#0e0d0c',
        },
      },
    ],
  },
  rabbit: {
    label: 'snowshoe hare',
    role: 'rabbit',
    move: { walk: 0.6, trot: 2.4, run: 11, stride: 0.55, turn: 3.2 },
    group: [1, 2],
    forage: true,
    spawn: { first: [60, 200], every: [150, 360], p: 0.7, max: 2 },
    traits: {
      bold: [0.25, 0.15],
      wary: [0.8, 0.15],
      curious: [0.3, 0.2],
      playful: [0.3, 0.2],
      aggressive: [0, 0],
      persistent: [0.3, 0.2],
      restless: [0.5, 0.25],
      lazy: [0.3, 0.2],
    },
    sizes: [
      { id: 'leveret', w: 0.35, name: "this year's young", scale: [0.8, 0.9], bias: { wary: -0.1, curious: 0.15 } },
      { id: 'adult', w: 0.65, name: 'adult', scale: [0.95, 1.08] },
    ],
    coats: [
      // autumn: brown, a few already turning white
      {
        id: 'brown',
        w: 4,
        name: 'summer brown',
        c: {
          body: '#6a5640',
          belly: '#a89a86',
          head: '#6e5a44',
          muzzle: '#8a7864',
          ear: '#5a4836',
          earTip: '#1e1a16',
          leg: '#8a7a66',
          legLo: '#c8c0b2',
          paw: '#d8d2c6',
          tail: '#c8c0b2',
        },
      },
      {
        id: 'turning',
        w: 1.2,
        name: 'turning white',
        c: {
          body: '#9a8c78',
          belly: '#d8d2c6',
          head: '#8a7a64',
          muzzle: '#a89884',
          ear: '#7a6a56',
          earTip: '#1e1a16',
          leg: '#c0b8aa',
          legLo: '#e0dad0',
          paw: '#ece8e0',
          tail: '#e0dad0',
        },
      },
      {
        id: 'grey',
        w: 1,
        name: 'grey-brown',
        c: {
          body: '#5e564c',
          belly: '#9a948a',
          head: '#625a50',
          muzzle: '#7e766c',
          ear: '#4e4840',
          earTip: '#1a1816',
          leg: '#7e786e',
          legLo: '#bcb6ac',
          paw: '#ccc6bc',
          tail: '#bcb6ac',
        },
      },
    ],
  },
  porcupine: {
    label: 'North American porcupine',
    role: 'porcupine',
    move: { walk: 0.35, trot: 0.7, run: 1.1, stride: 0.22, turn: 1.0 },
    group: [1, 1],
    forage: true,
    spawn: { first: [300, 700], every: [500, 900], p: 0.5, max: 1 },
    traits: {
      bold: [0.8, 0.15],
      wary: [0.3, 0.15],
      curious: [0.3, 0.15],
      playful: [0.05, 0.05],
      aggressive: [0.3, 0.15],
      persistent: [0.6, 0.2],
      restless: [0.2, 0.15],
      lazy: [0.6, 0.2],
    },
    sizes: [
      { id: 'young', w: 0.3, name: 'young', scale: [0.75, 0.88] },
      { id: 'adult', w: 0.7, name: 'adult', scale: [0.95, 1.12] },
    ],
    coats: [
      {
        id: 'dark',
        w: 3,
        name: 'dark brown',
        c: {
          body: '#2a231c',
          belly: '#1e1914',
          head: '#262019',
          muzzle: '#151210',
          ear: '#1e1914',
          leg: '#161310',
          legLo: '#121010',
          paw: '#0e0c0a',
          tail: '#2a231c',
          quill: '#8a8070',
        },
      },
      {
        id: 'frosted',
        w: 2,
        name: 'white-tipped quills',
        c: {
          body: '#3a322a',
          belly: '#221d18',
          head: '#2e2720',
          muzzle: '#181412',
          ear: '#221d18',
          leg: '#1a1612',
          legLo: '#141210',
          paw: '#0e0c0a',
          tail: '#3a322a',
          quill: '#d0c8b8',
        },
      },
      {
        id: 'blond',
        w: 0.4,
        name: 'yellowish (rare)',
        c: {
          body: '#5a4a32',
          belly: '#3a3022',
          head: '#4a3c2a',
          muzzle: '#221c14',
          ear: '#3a3022',
          leg: '#2a2218',
          legLo: '#201a12',
          paw: '#120e0a',
          tail: '#5a4a32',
          quill: '#d8c89a',
        },
      },
    ],
  },
};

// Which of the other species live in this marsh (the rest stay in the catalogue for other places, and the
// test scenes can still show them)
export const MARSH_SPECIES = ['bear', 'wolf', 'coyote'];

/* ---------------------------------------------------------------- how often moose come out */
export const SPAWN = {
  bull: { first: [8, 20], every: [30, 75] }, // one bull per two hunters (max four) at a time
  cow: { first: [45, 110], every: [60, 150], p: 0.8 },
  // which species turn up together: wolves and coyotes share one timer (coyotes far more often)
  canid: { coyote: 0.6, wolf: 0.4 },
};

/* ---------------------------------------------------------------- reactions
   REACT[role][other] = { notice, act, near, then }: once the other animal is within `notice` metres this animal
   does `act`; within `near` it escalates to `then`. Distances shrink for bold animals and grow for wary ones.
   acts: ignore | watch (stop, stare) | avoid (walk away) | flee (run off) | stand (face it, hold ground, threat
   display) | defend (cow: face it, call the calf in, stamp) | freeze (hare) | quills (porcupine) | yield (give way)
   Roles: bullSmall bullMid bullBig cowCalf cow bear wolf coyote raccoon rabbit porcupine; 'moose' = any moose.    */
export const REACT = {
  cowCalf: {
    wolf: { notice: 260, act: 'defend', near: 120, then: 'flee' },
    bear: { notice: 220, act: 'defend', near: 110, then: 'flee' },
    coyote: { notice: 140, act: 'defend', near: 40, then: 'flee' },
  },
  cow: {
    wolf: { notice: 230, act: 'watch', near: 100, then: 'flee' },
    bear: { notice: 180, act: 'watch', near: 80, then: 'flee' },
    coyote: { notice: 100, act: 'watch', near: 25, then: 'avoid' },
  },
  bullSmall: {
    wolf: { notice: 220, act: 'watch', near: 130, then: 'flee' },
    bear: { notice: 170, act: 'watch', near: 90, then: 'flee' },
    coyote: { notice: 100, act: 'watch', near: 40, then: 'flee' },
  },
  bullMid: {
    wolf: { notice: 190, act: 'watch', near: 70, then: 'flee' },
    bear: { notice: 150, act: 'watch', near: 45, then: 'avoid' },
    coyote: { notice: 80, act: 'watch', near: 15, then: 'stand' },
  },
  bullBig: {
    wolf: { notice: 160, act: 'watch', near: 70, then: 'stand' },
    bear: { notice: 130, act: 'watch', near: 40, then: 'stand' },
    coyote: { notice: 50, act: 'ignore' },
  },
  bear: {
    bullBig: { notice: 35, act: 'yield' },
    wolf: { notice: 40, act: 'watch' },
    porcupine: { notice: 10, act: 'avoid' },
  },
  wolf: {
    bear: { notice: 40, act: 'avoid' },
    bullBig: { notice: 60, act: 'watch', near: 35, then: 'avoid' },
    porcupine: { notice: 12, act: 'avoid' },
  },
  coyote: {
    wolf: { notice: 220, act: 'flee' },
    bear: { notice: 70, act: 'avoid' },
    bullBig: { notice: 45, act: 'avoid' },
    bullMid: { notice: 30, act: 'avoid' },
    cow: { notice: 25, act: 'avoid' },
    cowCalf: { notice: 25, act: 'avoid' },
    porcupine: { notice: 12, act: 'avoid' },
  },
  raccoon: {
    bear: { notice: 60, act: 'flee' },
    wolf: { notice: 70, act: 'flee' },
    coyote: { notice: 50, act: 'flee' },
    moose: { notice: 8, act: 'avoid' },
  },
  rabbit: {
    coyote: { notice: 70, act: 'freeze', near: 20, then: 'flee' },
    wolf: { notice: 70, act: 'freeze', near: 22, then: 'flee' },
    bear: { notice: 30, act: 'flee' },
    raccoon: { notice: 6, act: 'avoid' },
    moose: { notice: 7, act: 'avoid' },
  },
  porcupine: {
    coyote: { notice: 30, act: 'quills' },
    wolf: { notice: 35, act: 'quills' },
    bear: { notice: 35, act: 'quills' },
    moose: { notice: 6, act: 'quills' },
  },
};
// what predators make of other animals: hunt (go after it), test (move in to see if it runs), or nothing
//   chase: how long they keep up a chase (s); give: distance at which they give up
export const PREY = {
  coyote: {
    rabbit: { act: 'hunt', p: 0.9, chase: [4, 9] },
    cowCalf: { act: 'test', p: 0.35, chase: [5, 10], keep: [35, 60] },
  },
  wolf: {
    cowCalf: { act: 'test', p: 0.7, chase: [10, 22], keep: [30, 55] },
    cow: { act: 'test', p: 0.35, chase: [8, 16], keep: [30, 50] },
    bullSmall: { act: 'test', p: 0.3, chase: [8, 14], keep: [30, 50] },
    bullMid: { act: 'test', p: 0.15, chase: [6, 10], keep: [35, 55] },
    bullBig: { act: 'test', p: 0.1, chase: [4, 8], keep: [40, 60] },
    rabbit: { act: 'hunt', p: 0.4, chase: [3, 6] },
  },
  bear: { cowCalf: { act: 'test', p: 0.3, chase: [6, 12], keep: [25, 45] } },
};
// how far each species' senses reach (m): sight in the open marsh, hearing, and scent from downwind
export const SENSES = {
  moose: { see: 220, hear: 400 },
  bear: { see: 120, hear: 250 },
  wolf: { see: 250, hear: 500 },
  coyote: { see: 200, hear: 400 },
  raccoon: { see: 50, hear: 120 },
  rabbit: { see: 70, hear: 150 },
  porcupine: { see: 25, hear: 60 },
};

/* ---------------------------------------------------------------- rolling one animal */
export function rollBullType(opt = {}) {
  let tier;
  if (opt.type) {
    const t = BULL_TYPE[opt.type];
    return { type: t, tier: BULL_TIERS[t.tier] };
  }
  if (opt.tier != null) tier = BULL_TIERS[clamp(opt.tier, 0, BULL_TIERS.length - 1)];
  else if (opt.minTier != null) tier = pickW(BULL_TIERS.filter((t) => t.i >= opt.minTier));
  else tier = pickW(BULL_TIERS);
  const type = pickW(BULL_TYPES.filter((t) => t.tier === tier.i));
  return { type, tier };
}
export function rollCoat(kind, w) {
  const id = pickKey(w || Object.fromEntries(Object.keys(MOOSE_COATS[kind]).map((k) => [k, 1])));
  const c = MOOSE_COATS[kind][id];
  return { id, name: c.name, c: c.c };
}
export function rollCow(opt = {}) {
  const type = opt.type ? COW_TYPES.find((t) => t.id === opt.type) : pickW(COW_TYPES);
  const coat = rollCoat('cow', opt.coat ? { [opt.coat]: 1 } : type.coat);
  const traits = rollTraits(COW_TRAITS, type.bias);
  let calves = 0;
  if (random() < type.calf) calves = random() < type.twins ? 2 : 1;
  if (opt.calves != null) calves = opt.calves;
  return { type, coat, traits, scale: between(type.scale), calves };
}
export function rollCalf(opt = {}) {
  const type = opt.type ? CALF_TYPES.find((t) => t.id === opt.type) : pickW(CALF_TYPES);
  return {
    type,
    coat: rollCoat('calf', opt.coat ? { [opt.coat]: 1 } : type.coat),
    traits: rollTraits(CALF_TRAITS, type.bias),
    scale: between(type.scale),
  };
}
export function rollCritter(kind, opt = {}) {
  const S = SPECIES[kind];
  const size = opt.size ? S.sizes.find((s) => s.id === opt.size) : pickW(S.sizes);
  const coat = opt.coat ? S.coats.find((c) => c.id === opt.coat) : pickW(S.coats);
  return { S, size, coat, traits: rollTraits(S.traits, size.bias), scale: between(size.scale) };
}
// tune a reaction to this animal's personality
export function reaction(role, otherRole, traits) {
  const R = REACT[role];
  if (!R) return null;
  const r =
    R[otherRole] ||
    ((otherRole && otherRole.startsWith('bull')) ||
    otherRole === 'cow' ||
    otherRole === 'cowCalf' ||
    otherRole === 'calf'
      ? R.moose
      : null);
  if (!r) return null;
  const k = traits ? lerp(0.75, 1.3, traits.wary) * lerp(1.15, 0.8, traits.bold) : 1;
  return { ...r, notice: r.notice * k, near: r.near != null ? r.near * k : null };
}
