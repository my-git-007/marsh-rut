// render/fx.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { rand, smoothstep } from '../../../shared/util.js';
import { CRITTERS } from '../models/critters.js';
import { ANIMALS, G, PLAYER } from '../state.js';
import { U, scene } from './core.js';
import { mkC } from './textures.js';

/* ---- world effects: breath vapour, grass push/trails, shaking brush, ripples ---- */
const VAPOR = [];
let VTEX = null;
const _nose = new THREE.Vector3(),
  _nose2 = new THREE.Vector3();
function vaporFrom(an, k) {
  if (!an.M || !an.M.root.visible || an.dist() > 700) return;
  if (!VTEX) {
    const c = mkC(64, 64),
      g = c.getContext('2d'),
      gr = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    VTEX = new THREE.CanvasTexture(c);
  }
  const h = an.M.head;
  h.updateMatrixWorld(true);
  const nz = an.M.nose;
  if (nz) {
    _nose.set(nz[0][0], nz[0][1], 0);
    _nose2.set(nz[1][0], nz[1][1], 0);
  } else {
    _nose.set(0.8, -0.15, 0);
    _nose2.set(1.7, -0.3, 0);
  }
  h.localToWorld(_nose);
  h.localToWorld(_nose2);
  const dir = _nose2.sub(_nose).normalize();
  for (let i = 0; i < 5; i++) {
    let v = VAPOR.find((q) => q.age >= q.life);
    if (!v) {
      if (VAPOR.length > 90) return;
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: VTEX, transparent: true, depthWrite: false, opacity: 0, color: 0xe8eef2 }),
      );
      s.layers.set(1);
      scene.add(s);
      v = { s, age: 9, life: 1, v: new THREE.Vector3() };
      VAPOR.push(v);
    }
    v.s.position.copy(_nose).addScaledVector(dir, i * 0.04);
    v.v
      .copy(dir)
      .multiplyScalar(rand(0.5, 1.1) * k)
      .add(new THREE.Vector3(rand(-0.1, 0.1), 0.1, rand(-0.1, 0.1)));
    v.age = -i * 0.05;
    v.life = rand(1.6, 2.6);
    v.k = k * an.o.scale;
    v.s.visible = true;
  }
}
function updateVapor(dt) {
  for (const v of VAPOR) {
    if (v.age >= v.life) {
      v.s.visible = false;
      continue;
    }
    v.age += dt;
    if (v.age < 0) {
      v.s.material.opacity = 0;
      continue;
    }
    v.s.position.addScaledVector(v.v, dt);
    v.v.multiplyScalar(Math.exp(-dt * 1.2));
    v.v.y += dt * 0.05;
    const t = v.age / v.life;
    v.s.material.opacity = 0.42 * smoothstep(0, 0.12, t) * (1 - t);
    const sc = (0.12 + t * 0.95) * v.k;
    v.s.scale.set(sc, sc, sc);
  }
}
const SHAKES = [],
  TRAILS = [],
  GRASS_HITS = [];
function addShake(x, z, r, amp, dur) {
  SHAKES.push({ x, z, r, amp, t: G.time + dur });
  if (SHAKES.length > 40) SHAKES.shift();
}
let RIPI = 0;
function addRipple(x, z, amp) {
  const r = U.rip.value[RIPI];
  r.set(x, z, U.time.value, amp);
  RIPI = (RIPI + 1) % U.rip.value.length;
}
function updateFx() {
  for (let i = SHAKES.length - 1; i >= 0; i--) if (SHAKES[i].t < G.time) SHAKES.splice(i, 1);
  const sh = SHAKES.slice().sort(
    (a, b) => Math.hypot(a.x - PLAYER.x, a.z - PLAYER.z) - Math.hypot(b.x - PLAYER.x, b.z - PLAYER.z),
  );
  U.shake.value.forEach((v, i) => {
    const s = sh[i];
    if (s) v.set(s.x, s.z, s.r, s.amp * Math.min(1, (s.t - G.time) * 2));
    else v.set(0, 0, 0, 0);
  });
  const slots = U.moose.value;
  let n = 0;
  for (const a of ANIMALS) {
    if (n >= slots.length) break;
    const s = a.o.scale;
    slots[n++].set(a.x, a.z, (1.7 + a.bd * 0.6 + a.fg * 1.2) * s, 0.9 + a.bd * 0.7 + a.fg * 0.6);
  }
  for (const c of CRITTERS) {
    if (n >= slots.length || c.kind === 'raccoon') continue;
    slots[n++].set(c.x, c.z, (c.kind === 'bear' ? 1.3 : 0.8) * c.scale, 0.7);
  }
  for (let i = GRASS_HITS.length - 1; i >= 0; i--) {
    const h = GRASS_HITS[i];
    if (h.t < G.time) {
      GRASS_HITS.splice(i, 1);
      continue;
    }
    if (n < slots.length) slots[n++].set(h.x, h.z, h.r, h.s);
  }
  for (let i = TRAILS.length - 1; i >= 0; i--) {
    if (G.time - TRAILS[i].t > 150) TRAILS.splice(i, 1);
  }
  for (let i = TRAILS.length - 1; i >= 0 && n < slots.length; i--) {
    const t = TRAILS[i];
    slots[n++].set(t.x, t.z, t.r, t.s * (1 - (G.time - t.t) / 150));
  }
  while (n < slots.length) slots[n++].set(0, 0, 0, 0);
}
U.moose = { value: [...Array(24)].map(() => new THREE.Vector4()) };
U.shake = { value: [...Array(6)].map(() => new THREE.Vector4()) };
U.rip = { value: [...Array(14)].map(() => new THREE.Vector4(0, 0, -99, 0)) };

export {
  GRASS_HITS,
  RIPI,
  SHAKES,
  TRAILS,
  VAPOR,
  VTEX,
  _nose,
  _nose2,
  addRipple,
  addShake,
  updateFx,
  updateVapor,
  vaporFrom,
};
