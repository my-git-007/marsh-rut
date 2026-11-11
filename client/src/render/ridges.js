// render/ridges.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { TAU, clamp, hexLin, lerp, mix3, noise2 } from '../../../shared/util.js';
import { MAP } from '../../../shared/world.js';
import { PLAYER } from '../state.js';
import { FOG_COL, scene } from './core.js';

/* ================= distant ridges ================= */
function buildRidge(R, hmin, hmax, col, haze, seed, N) {
  const pos = [],
    cols = [],
    idx = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * TAU;
    const f =
      0.5 +
      0.5 *
        (noise2(Math.cos(a) * 3 + seed, Math.sin(a) * 3 + seed) * 1.25 +
          noise2(Math.cos(a) * 11 + seed * 2, Math.sin(a) * 11) * 0.3);
    const h =
      lerp(hmin, hmax, clamp(f, 0, 1)) + (Math.random() - 0.5) * R * 0.0032 + (Math.random() < 0.12 ? R * 0.0028 : 0);
    const x = PLAYER.x + Math.sin(a) * R,
      z = PLAYER.z - Math.cos(a) * R;
    pos.push(x, -80, z, x, h, z);
    cols.push(haze[0], haze[1], haze[2], col[0], col[1], col[2]);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  m.frustumCulled = false;
  scene.add(m);
}
function buildRidges() {
  if (MAP.look && MAP.look.mountains) return; // the map has real mountains all around (render/alpine.js)
  const fc = [FOG_COL.r, FOG_COL.g, FOG_COL.b];
  const f = (c, h) => {
    const l = hexLin(c);
    return mix3(l, fc, h);
  };
  buildRidge(5400, 200, 480, f('#2e4458', 0.7), mix3(fc, [fc[0] * 1.02, fc[1] * 1.02, fc[2] * 1.04], 1), 11, 900);
  buildRidge(3000, 90, 230, f('#22342c', 0.55), mix3(f('#22342c', 0.55), fc, 0.55), 23, 1100);
  buildRidge(1350, 42, 88, f('#18241a', 0.38), mix3(f('#18241a', 0.38), fc, 0.35), 37, 1600);
}

export { buildRidge, buildRidges };
