// The wind: a prevailing direction that wanders, gusts, and now and then swirls. The animals smell the
// hunters by it, so the host (server, or the browser in solo play) owns it and sends it to everyone.
import { PI, clamp, rand, chance, noise1 } from './util.js';

export const WIND = { from: 0, baseFrom: 0, speed: 8, tx: 0, tz: 1, swirl: 0, gust: 0.6, t: 0, swirlT: 120, swirlLen: 15 };
export function initWind() {
  WIND.t = rand(0, 500); WIND.swirlT = rand(70, 200);
  WIND.baseFrom = chance(0.7) ? rand(-55, 55) : rand(0, 360); WIND.speed = rand(4, 13); updateWind(0);
}
export function updateWind(dt) {
  WIND.t += dt; let from = WIND.baseFrom + noise1(WIND.t * 0.004) * 60;
  WIND.swirlT -= dt;
  if (WIND.swirlT < 0) { WIND.swirl = Math.min(1, WIND.swirl + dt * 0.2); if (WIND.swirlT < -WIND.swirlLen) { WIND.swirlT = rand(70, 220); WIND.swirlLen = rand(10, 25); } }
  else WIND.swirl = Math.max(0, WIND.swirl - dt * 0.1);
  from += WIND.swirl * noise1(WIND.t * 0.12 + 30) * 170;
  setWindFrom(from);
  WIND.gust = clamp(0.55 + noise1(WIND.t * 0.09) * 0.9 + noise1(WIND.t * 0.37 + 5) * 0.35, 0.1, 1.4);
}
export function setWindFrom(from) { WIND.from = ((from % 360) + 360) % 360; const r = (WIND.from * PI) / 180; WIND.tx = -Math.sin(r); WIND.tz = Math.cos(r); }
// A copy of the wind as received from the host (online play): from, speed, gust, swirl.
export function applyWind(w) { setWindFrom(w[0]); WIND.speed = w[1]; WIND.gust = w[2]; WIND.swirl = w[3]; }
export const windState = () => [+WIND.from.toFixed(1), +WIND.speed.toFixed(2), +WIND.gust.toFixed(3), +WIND.swirl.toFixed(3)];
