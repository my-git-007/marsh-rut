// render/terrain.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { PI, clamp, lin, mix3, noise2, smoothstep } from '../../../shared/util.js';
import { MAP, WATER_Y, canopyAt, groundAt, marshE } from '../../../shared/world.js';
import { buildAlpineFar, buildAlpineNear } from './alpine.js';
import { scene } from './core.js';
import { T } from './textures.js';

/* ================= terrain ================= */
function groundColor(x, z, h, e) {
  const n1 = noise2(x * 0.009 + 11, z * 0.009),
    n2 = noise2(x * 0.035, z * 0.035 + 4),
    n3 = noise2(x * 0.12, z * 0.12);
  let m = [0.66, 0.55, 0.33];
  m = mix3(m, [0.58, 0.4, 0.22], clamp(0.45 + n1 * 1.4, 0, 1));
  m = mix3(m, [0.74, 0.66, 0.45], clamp(n2 * 1.2, 0, 0.6));
  m = mix3(m, [0.45, 0.44, 0.26], clamp(-n2, 0, 0.5));
  const wet = 1 - smoothstep(WATER_Y + 0.05, WATER_Y + 0.45, h);
  m = mix3(m, [0.24, 0.22, 0.14], wet * 0.85);
  if (h < WATER_Y) m = [0.18, 0.15, 0.1];
  m = m.map((v) => v * (0.88 + n3 * 0.28));
  const out = Math.max(0, e) * 300;
  let f = [0.23, 0.2, 0.14].map((v) => v * (0.85 + n3 * 0.35));
  f = mix3(
    f,
    [0.1, 0.135, 0.085].map((v) => v * (0.8 + n2 * 0.5)),
    smoothstep(140, 230, out),
  );
  return lin(mix3(f, m, 1 - smoothstep(-0.005, 0.025, e)));
}
function buildTerrain() {
  if (MAP.id === 'alpine-valley-stream') {
    buildAlpineFar(scene);
    return buildAlpineNear(terrainMat(), scene);
  }
  const X0 = -720,
    X1 = 720,
    Z0 = -1120,
    Z1 = 460,
    step = 3;
  const nx = Math.round((X1 - X0) / step),
    nz = Math.round((Z1 - Z0) / step);
  const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, nx, nz);
  geo.rotateX(-PI / 2);
  geo.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const p = geo.attributes.position,
    n = p.count;
  const col = new Float32Array(n * 3),
    am = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = p.getX(i),
      z = p.getZ(i);
    const e = marshE(x, z);
    const h = groundAt(x, z);
    p.setY(i, h + canopyAt(x, z));
    const c = groundColor(x, z, h, e);
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    am[i] = 1 - smoothstep(-0.005, 0.025, e);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aM', new THREE.BufferAttribute(am, 1));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, terrainMat());
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
// the ground's material: vertex colours times two detail textures, the meadow's (aM = 1) and the forest floor's
function terrainMat() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: T.marsh });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tForest = { value: T.forest };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aM;\nvarying float vM;\nvarying vec2 vW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvM=aM;vW=(modelMatrix*vec4(position,1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform sampler2D tForest;\nvarying float vM;\nvarying vec2 vW;',
      )
      .replace(
        '#include <map_fragment>',
        `
      vec3 m1=texture2D(map,vW/7.0).rgb,m2=texture2D(map,vW/61.0+0.3).rgb;
      vec3 f1=texture2D(tForest,vW/4.0).rgb,f2=texture2D(tForest,vW/37.0).rgb;
      vec3 dm=m1*mix(vec3(1.0),m2*1.85,0.5)*1.85, df=f1*mix(vec3(1.0),f2*1.85,0.5)*1.85;
      diffuseColor.rgb*=mix(df,dm,vM);`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain';
  return mat;
}

export { buildTerrain, groundColor };
