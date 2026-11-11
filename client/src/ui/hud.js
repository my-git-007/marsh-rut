// ui/hud.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { PI, clamp, compassName, smoothstep } from '../../../shared/util.js';
import { WIND } from '../../../shared/wind.js';
import { canopyAt, groundAt, marshE } from '../../../shared/world.js';
import { camera } from '../render/core.js';
import { obstacleHit } from '../render/vegetation.js';
import { ANIMALS, G, NET, UI } from '../state.js';
import { V } from './input.js';

/* ================= HUD ================= */
const binocEl = document.getElementById('binoc'),
  binocSvg = document.getElementById('binocsvg');
function layoutBinoc() {
  const w = innerWidth,
    h = innerHeight;
  const r = Math.min(h * 0.47, w * 0.27),
    cx = w / 2,
    o = r * 0.62;
  binocSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  binocSvg.innerHTML = `<defs><filter id="bl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${(r * 0.035).toFixed(1)}"/></filter>
  <mask id="bm"><rect width="${w}" height="${h}" fill="white"/><g filter="url(#bl)"><circle cx="${cx - o}" cy="${h / 2}" r="${r}" fill="black"/><circle cx="${cx + o}" cy="${h / 2}" r="${r}" fill="black"/></g></mask>
  <radialGradient id="vg"><stop offset="70%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity=".55"/></radialGradient></defs>
  <rect width="${w}" height="${h}" fill="#050505" mask="url(#bm)"/>`;
}
let rangeT = 0,
  dbgT = 0;
function rangeFind() {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const o = camera.position;
  let best = null;
  for (const a of ANIMALS) {
    if (!a.M.root.visible) continue;
    const s = a.o.scale;
    const cx = a.x,
      cy = groundAt(a.x, a.z) + 1.4 * s,
      cz = a.z;
    const vx = cx - o.x,
      vy = cy - o.y,
      vz = cz - o.z;
    const t = vx * dir.x + vy * dir.y + vz * dir.z;
    if (t < 0) continue;
    const px = o.x + dir.x * t - cx,
      py = o.y + dir.y * t - cy,
      pz = o.z + dir.z * t - cz;
    if (px * px + py * py + pz * pz < 1.3 * s * s * 1.3 && (!best || t < best)) best = t;
  }
  let t = 2;
  while (t < 1900) {
    const x = o.x + dir.x * t,
      y = o.y + dir.y * t,
      z = o.z + dir.z * t;
    // the ground and its grass (deep in the woods, the canopy); the trees and bushes themselves are checked below
    const top = groundAt(x, z) + canopyAt(x, z) + (marshE(x, z) < 0 ? 0.8 : 0.3);
    if (y < top) break;
    t += 0.5 + t * 0.008;
  }
  if (t < 1900 && (!best || t < best)) best = t;
  const tree = obstacleHit(o, dir, best || 1900);
  if (tree !== null && (!best || tree < best)) best = tree;
  return best;
}
function updateHUD(dt) {
  const heading = ((((-V.yaw * 180) / PI) % 360) + 360) % 360;
  document.getElementById('compass').textContent =
    compassName(heading) + '  ' + String(Math.round(heading) % 360).padStart(3, '0') + '°';
  const toDeg = (WIND.from + 180) % 360;
  document.getElementById('windarrow').setAttribute('transform', `rotate(${(toDeg - heading).toFixed(1)})`);
  document.getElementById('windtxt').textContent = 'wind from ' + compassName(WIND.from);
  document.getElementById('windsub').textContent =
    Math.round(WIND.speed * WIND.gust) + ' km/h' + (WIND.swirl > 0.3 ? ' · swirling' : '');
  const bo = smoothstep(24, 15, V.fov);
  binocEl.style.opacity = bo.toFixed(3);
  const rg = document.getElementById('range');
  rg.style.opacity = bo > 0.8 ? 0.85 : 0;
  rangeT -= dt;
  if (bo > 0.8 && rangeT < 0) {
    rangeT = 0.2;
    const r = rangeFind();
    rg.textContent = (r ? Math.round(r * 1.09361) + ' yds' : '— yds') + '  ·  ' + (62 / V.fov).toFixed(1) + '×';
  }
  if (G.time < G.callEnd)
    document.getElementById('breathbar').style.width = clamp(((G.time - G.callStart) / G.callDur) * 100, 0, 100) + '%';
  else if (G.callEnd) document.getElementById('breath').style.opacity = 0;
  dbgT -= dt;
  if (UI.debugOn && dbgT < 0) {
    dbgT = 0.25;
    let s = NET.host ? NET.host.debugText() : '';
    s += `\nlast call ${G.lastCallEnd > 0 ? Math.round(G.time - G.lastCallEnd) + 's ago' : '—'}`;
    if (NET.host && NET.host.local) s += '\nN new bull · M add a second bull';
    document.getElementById('debug').textContent = s;
  }
}

export { binocEl, binocSvg, dbgT, layoutBinoc, rangeFind, rangeT, updateHUD };
