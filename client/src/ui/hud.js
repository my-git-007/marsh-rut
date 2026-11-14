// ui/hud.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { PI, clamp, compassName, smoothstep } from '../../../shared/util.js';
import { WIND } from '../../../shared/wind.js';
import { WATER_Y, canopyAt, groundAt, marshE } from '../../../shared/world.js';
import { CRITTERS } from '../models/critters.js';
import { camera } from '../render/core.js';
import { obstacleHit } from '../render/vegetation.js';
import { LULL } from '../lull.js';
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
// what the binoculars' rangefinder reads: the distance along the line of sight to the first thing it meets (an
// animal, a tree or bush, a log or stump, the water, or the ground just above its grass)
const _ray = new THREE.Ray(),
  _inv = new THREE.Matrix4(),
  _hit = new THREE.Vector3(),
  _m = new THREE.Matrix4(),
  _b = new THREE.Box3();
// an animal's own box (its body, legs, head and antlers in its rest pose), in its root's frame; made once
function animalBox(a) {
  if (a._rfBox) return a._rfBox;
  const root = a.M.root;
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const box = new THREE.Box3();
  root.traverse((m) => {
    if (!m.isMesh || !m.geometry) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    box.union(_b.copy(m.geometry.boundingBox).applyMatrix4(_m.multiplyMatrices(_inv, m.matrixWorld)));
  });
  // (a little inside its outline: the box's corners are air round the rump and brisket)
  const c = box.getCenter(new THREE.Vector3()),
    h = box.getSize(new THREE.Vector3()).multiplyScalar(0.45);
  h.y = box.getSize(_hit).y * 0.5;
  a._rfBox = new THREE.Box3(c.clone().sub(h), c.clone().add(h));
  return a._rfBox;
}
// the ground (or the water) with a short grass top: where a sightline comes down to it
const surface = (x, z) => Math.max(groundAt(x, z), WATER_Y) + (marshE(x, z) < 0 ? 0.2 : 0.1) + canopyAt(x, z);
function rangeFind() {
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  const o = camera.position;
  let best = null;
  for (const a of [...ANIMALS, ...CRITTERS]) {
    if (!a.M || !a.M.root.visible) continue;
    const root = a.M.root;
    // (only the ones near the line: a cheap check before the box)
    const vx = root.position.x - o.x,
      vz = root.position.z - o.z,
      tc = vx * dir.x + vz * dir.z;
    if (tc < 0 || vx * vx + vz * vz - (tc * tc) / (dir.x * dir.x + dir.z * dir.z) > 64) continue;
    _ray.set(o, dir).applyMatrix4(_inv.copy(root.matrixWorld).invert());
    if (!_ray.intersectBox(animalBox(a), _hit)) continue;
    const t = _hit.applyMatrix4(root.matrixWorld).distanceTo(o);
    if (!best || t < best) best = t;
  }
  // the ground: in steps (longer further out), then narrowed down to where the line crosses it
  let t = 2,
    prev = 2,
    hitT = null;
  while (t < 1900) {
    if (o.y + dir.y * t < surface(o.x + dir.x * t, o.z + dir.z * t)) {
      let lo = prev,
        hi = t;
      for (let i = 0; i < 14; i++) {
        const m = (lo + hi) / 2;
        if (o.y + dir.y * m < surface(o.x + dir.x * m, o.z + dir.z * m)) hi = m;
        else lo = m;
      }
      hitT = hi;
      break;
    }
    prev = t;
    t += 0.5 + t * 0.008;
  }
  let what = best ? 'animal' : null;
  if (hitT !== null && (!best || hitT < best)) (best = hitT), (what = 'ground');
  const tree = obstacleHit(o, dir, best || 1900);
  if (tree !== null && (!best || tree < best)) (best = tree), (what = 'tree');
  const wood = deadwoodHit && deadwoodHit(o, dir, best || 1900);
  if (wood && (!best || wood < best)) (best = wood), (what = 'wood');
  rangeFind.what = what; // (for tests)
  return best;
}
// (set once the logs and stumps have loaded: render/deadwood.js)
let deadwoodHit = null;
export function setDeadwoodHit(f) {
  deadwoodHit = f;
}
function updateHUD(dt) {
  const heading = ((((-V.yaw * 180) / PI) % 360) + 360) % 360;
  document.getElementById('compass').textContent =
    compassName(heading) + '  ' + String(Math.round(heading) % 360).padStart(3, '0') + '°';
  const toDeg = (WIND.from + 180) % 360;
  document.getElementById('windarrow').setAttribute('transform', `rotate(${(toDeg - heading).toFixed(1)})`);
  document.getElementById('windtxt').textContent = 'wind from ' + compassName(WIND.from);
  document.getElementById('windsub').textContent =
    Math.round(WIND.speed * WIND.gust * LULL.k) + ' km/h' + (WIND.swirl > 0.3 ? ' · swirling' : '');
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
