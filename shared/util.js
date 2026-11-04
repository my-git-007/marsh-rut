// Math, noise and random helpers shared by the browser and the server.
// Nothing in /shared may touch the DOM, WebGL or Web Audio: the same files run in Node.

export const TAU = Math.PI * 2,
  PI = Math.PI;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const wrapA = (a) => {
  while (a > PI) a -= TAU;
  while (a < -PI) a += TAU;
  return a;
};

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The random source behind rand/randi/pick/chance. Normally Math.random; withSeed() swaps in a seeded
// generator for the duration of a call, so things built from a seed come out the same everywhere
// (a bull's antlers, the shrub layout the bulls thrash).
let RNG = Math.random;
export function withSeed(seed, fn) {
  const prev = RNG;
  RNG = mulberry32(seed >>> 0);
  try {
    return fn();
  } finally {
    RNG = prev;
  }
}
export const random = () => RNG();
export const rand = (a = 0, b = 1) => a + RNG() * (b - a);
export const randi = (a, b) => Math.floor(a + RNG() * (b - a + 1));
export const pick = (a) => a[Math.floor(RNG() * a.length)];
export const chance = (p) => RNG() < p;
export const newSeed = () => (Math.random() * 4294967296) >>> 0;

const PERM = new Uint8Array(512);
(() => {
  const r = mulberry32(90210);
  const p = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();
function grad2(h, x, y) {
  switch (h & 7) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    case 3:
      return -x - y;
    case 4:
      return x;
    case 5:
      return -x;
    case 6:
      return y;
    default:
      return -y;
  }
}
export function noise2(x, y) {
  const X = Math.floor(x),
    Y = Math.floor(y);
  x -= X;
  y -= Y;
  const xi = X & 255,
    yi = Y & 255;
  const u = x * x * x * (x * (x * 6 - 15) + 10),
    v = y * y * y * (y * (y * 6 - 15) + 10);
  const aa = PERM[PERM[xi] + yi],
    ab = PERM[PERM[xi] + yi + 1],
    ba = PERM[PERM[xi + 1] + yi],
    bb = PERM[PERM[xi + 1] + yi + 1];
  return (
    lerp(lerp(grad2(aa, x, y), grad2(ba, x - 1, y), u), lerp(grad2(ab, x, y - 1), grad2(bb, x - 1, y - 1), u), v) * 0.7
  );
}
export const noise1 = (t) => noise2(t, 7.31);

export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const lin = (c) => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];
export function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const hexLin = (h, k = 1) => {
  const c = hexRgb(h);
  return [Math.pow((c[0] / 255) * k, 2.2), Math.pow((c[1] / 255) * k, 2.2), Math.pow((c[2] / 255) * k, 2.2)];
};
export const compassName = (d) =>
  ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][
    Math.round((((d % 360) + 360) % 360) / 22.5) % 16
  ];
