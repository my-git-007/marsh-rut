// The wind: a prevailing direction that wanders, gusts, and now and then swirls. The animals smell the
// hunters by it, so the host (server, or the browser in solo play) owns it and sends it to everyone.
import { PI, clamp, rand, chance, noise1 } from './util.js';

// Each simulation owns its own wind object (newWind), so one server can run many marshes side by side.
// WIND is this browser's copy, used only for what the player sees and hears (HUD arrow, grass, wind noise).
export const newWind = () => ({ from: 0, baseFrom: 0, speed: 8, tx: 0, tz: 1, swirl: 0, gust: 0.6, t: 0, swirlT: 120, swirlLen: 15 });
export const WIND = newWind();
export function initWind(W) {
  W.t = rand(0, 500); W.swirlT = rand(70, 200);
  W.baseFrom = chance(0.7) ? rand(-55, 55) : rand(0, 360); W.speed = rand(4, 13); updateWind(W, 0);
  return W;
}
export function updateWind(W, dt) {
  W.t += dt; let from = W.baseFrom + noise1(W.t * 0.004) * 60;
  W.swirlT -= dt;
  if (W.swirlT < 0) { W.swirl = Math.min(1, W.swirl + dt * 0.2); if (W.swirlT < -W.swirlLen) { W.swirlT = rand(70, 220); W.swirlLen = rand(10, 25); } }
  else W.swirl = Math.max(0, W.swirl - dt * 0.1);
  from += W.swirl * noise1(W.t * 0.12 + 30) * 170;
  setWindFrom(W, from);
  W.gust = clamp(0.55 + noise1(W.t * 0.09) * 0.9 + noise1(W.t * 0.37 + 5) * 0.35, 0.1, 1.4);
}
export function setWindFrom(W, from) { W.from = ((from % 360) + 360) % 360; const r = (W.from * PI) / 180; W.tx = -Math.sin(r); W.tz = Math.cos(r); }
// Copy a wind as sent by the host (from, speed, gust, swirl) into this browser's WIND.
export function applyWind(w) { setWindFrom(WIND, w[0]); WIND.speed = w[1]; WIND.gust = w[2]; WIND.swirl = w[3]; }
export const windState = (W) => [+W.from.toFixed(1), +W.speed.toFixed(2), +W.gust.toFixed(3), +W.swirl.toFixed(3)];
