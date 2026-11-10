// render/billboards.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { PI } from '../../../shared/util.js';
import { U, scene } from './core.js';

/* ================= helpers: billboards & instancing ================= */
function crossGeo(planes, normalUp) {
  const pos = [],
    nor = [],
    uv = [],
    idx = [];
  for (let p = 0; p < planes; p++) {
    const a = (p * PI) / planes,
      dx = Math.cos(a) * 0.5,
      dz = Math.sin(a) * 0.5;
    for (const side of [1, -1]) {
      const b = pos.length / 3;
      const pn = [-Math.sin(a) * side, 0, Math.cos(a) * side];
      const cs = [
        [-dx, 0, -dz, 0, 0],
        [dx, 0, dz, 1, 0],
        [dx, 1, dz, 1, 1],
        [-dx, 1, -dz, 0, 1],
      ];
      for (const c of cs) {
        pos.push(c[0], c[1], c[2]);
        uv.push(c[3], c[4]);
        let nx = c[0] * 1.6 + pn[0] * 0.6,
          ny = normalUp * (c[4] * 0.8 + 0.4),
          nz = c[2] * 1.6 + pn[2] * 0.6;
        const l = Math.hypot(nx, ny, nz);
        nor.push(nx / l, ny / l, nz / l);
      }
      if (side > 0) idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      else idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
function grassGeo(nrm) {
  // 2 crossed quads, normals tilted toward sun, vertex color AO gradient
  const pos = [],
    nor = [],
    uv = [],
    col = [],
    idx = [];
  for (let p = 0; p < 2; p++) {
    const a = (p * PI) / 2 + 0.4,
      dx = Math.cos(a) * 0.5,
      dz = Math.sin(a) * 0.5;
    const b = pos.length / 3;
    const cs = [
      [-dx, 0, -dz, 0, 0],
      [dx, 0, dz, 1, 0],
      [dx, 1, dz, 1, 1],
      [-dx, 1, -dz, 0, 1],
    ];
    for (const c of cs) {
      pos.push(c[0], c[1], c[2]);
      uv.push(c[3], c[4]);
      nor.push(nrm.x, nrm.y, nrm.z);
      const k = c[4] ? 1 : 0.62;
      col.push(k, k, k);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function atlasInject(cols, rows) {
  return (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTile;').replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>
  vUv=vec2((mod(aTile,${cols}.0)+vUv.x)/${cols}.0,(vUv.y-floor(aTile/${cols}.0))/${rows}.0+${((rows - 1) / rows).toFixed(4)});`,
    );
  };
}
const ALPHA_FIX = `#include <map_fragment>
  {vec2 tdx=dFdx(vUv*TSIZE),tdy=dFdy(vUv*TSIZE);float lod=0.5*log2(max(max(dot(tdx,tdx),dot(tdy,tdy)),1e-6));diffuseColor.a*=1.0+max(lod,0.0)*0.34;}`;
function alphaFix(sh, size) {
  sh.fragmentShader = sh.fragmentShader.replace(
    '#include <map_fragment>',
    ALPHA_FIX.replace(/TSIZE/g, size.toFixed(1)),
  );
}
function atlasMats(tex, cols, rows, alphaTest, side) {
  const m = new THREE.MeshLambertMaterial({ map: tex, alphaTest, side: side || THREE.FrontSide });
  const ai = atlasInject(cols, rows);
  m.onBeforeCompile = (sh) => {
    ai(sh);
    alphaFix(sh, tex.image.width);
    sh.uniforms.uTime = U.time;
    sh.uniforms.uShake = U.shake;
    sh.vertexShader =
      'uniform float uTime;\nuniform vec4 uShake[6];\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
    #ifdef USE_INSTANCING
    {vec3 sip=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
     for(int i=0;i<6;i++){vec4 q=uShake[i];if(q.w>0.0){float dd=length(sip.xz-q.xy);if(dd<q.z){float a=q.w*(1.0-dd/q.z)*uv.y*uv.y;transformed.x+=sin(uTime*14.0+sip.x*3.1)*a*0.07;transformed.z+=cos(uTime*11.0+sip.z*2.7)*a*0.07;}}}}
    #endif`,
      );
  };
  m.customProgramCacheKey = () => 'atl' + cols + 'x' + rows;
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest });
  d.onBeforeCompile = atlasInject(cols, rows);
  d.customProgramCacheKey = () => 'atld' + cols + 'x' + rows;
  return { m, d };
}
function windInject(amount) {
  return (sh) => {
    sh.uniforms.uTime = U.time;
    sh.uniforms.uWind = U.wind;
    sh.uniforms.uMoose = U.moose;
    sh.vertexShader =
      'uniform float uTime;\nuniform vec3 uWind;\nuniform vec4 uMoose[24];\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed=vec3(position);
  #ifdef USE_INSTANCING
  vec3 ip=vec3(instanceMatrix[3][0],instanceMatrix[3][1],instanceMatrix[3][2]);
  mat3 im=mat3(instanceMatrix);
  float hh=uv.y*uv.y;
  float ph=uTime*1.25+ip.x*0.045+ip.z*0.06;
  float gust=0.55+0.45*sin(ph)*sin(ph*0.37+1.3);
  vec3 w=vec3(uWind.x,0.0,uWind.z)*gust*hh*${amount.toFixed(3)};
  w+=vec3(sin(uTime*4.1+ip.z*2.1),0.0,cos(uTime*3.7+ip.x*1.7))*0.025*hh*(0.4+uWind.y);
  w.y-=dot(w,w)*0.6;
  for(int mi=0;mi<24;mi++){vec4 mo=uMoose[mi];if(mo.w>0.0){vec2 dv=ip.xz-mo.xy;float dd=length(dv);if(dd<mo.z){float kk=1.0-dd/mo.z;vec2 dr=dd>0.01?dv/dd:vec2(1.0,0.0);w.xz+=dr*kk*mo.w*hh*0.9;w.y-=kk*mo.w*hh*0.55;}}}
  transformed+=vec3(dot(im[0],w)/dot(im[0],im[0]),dot(im[1],w)/dot(im[1],im[1]),dot(im[2],w)/dot(im[2],im[2]));
  #endif`,
      );
  };
}
const _m4 = new THREE.Matrix4(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _p = new THREE.Vector3(),
  _s = new THREE.Vector3(),
  _col = new THREE.Color();
// hide one item of a tracked buildInstanced() (its spot is taken by something else), or show it again (hidden false)
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
function hideInstance(track, it, hidden = true) {
  const e = track.get(it);
  if (!e) return;
  if (hidden) {
    if (!e[2]) {
      e[2] = new THREE.Matrix4();
      e[0].getMatrixAt(e[1], e[2]);
    }
    e[0].setMatrixAt(e[1], _zero);
  } else if (e[2]) e[0].setMatrixAt(e[1], e[2]);
  e[0].instanceMatrix.needsUpdate = true;
}
function buildInstanced(items, geo, mat, o = {}) {
  const cell = o.cell || 120,
    cells = new Map();
  for (const it of items) {
    const k = Math.floor(it.x / cell) + ',' + Math.floor(it.z / cell);
    let a = cells.get(k);
    if (!a) {
      a = [];
      cells.set(k, a);
    }
    a.push(it);
  }
  const group = new THREE.Group();
  for (const arr of cells.values()) {
    const g = geo.clone();
    const mesh = new THREE.InstancedMesh(g, mat, arr.length);
    const tiles = o.tile ? new Float32Array(arr.length) : null;
    let x0 = 1e9,
      x1 = -1e9,
      y0 = 1e9,
      y1 = -1e9,
      z0 = 1e9,
      z1 = -1e9,
      ms = 0;
    arr.forEach((it, i) => {
      _e.set(it.tx || 0, it.rot || 0, it.tz || 0, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(it.x, it.y, it.z);
      _s.set(it.sx, it.sy, it.sz || it.sx);
      _m4.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m4);
      if (o.track) o.track.set(it, [mesh, i]); // so single items can be hidden later (render/plants3d.js)
      if (it.c) {
        _col.setRGB(it.c[0], it.c[1], it.c[2]);
        mesh.setColorAt(i, _col);
      }
      if (tiles) tiles[i] = it.tile;
      x0 = Math.min(x0, it.x);
      x1 = Math.max(x1, it.x);
      y0 = Math.min(y0, it.y);
      y1 = Math.max(y1, it.y);
      z0 = Math.min(z0, it.z);
      z1 = Math.max(z1, it.z);
      ms = Math.max(ms, it.sx, it.sy);
    });
    if (tiles) g.setAttribute('aTile', new THREE.InstancedBufferAttribute(tiles, 1));
    const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    g.boundingSphere = new THREE.Sphere(c, Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + ms);
    mesh.castShadow = !!o.cast;
    mesh.receiveShadow = !!o.receive;
    if (o.depth) mesh.customDepthMaterial = o.depth;
    mesh.layers.set(o.layer || 0);
    group.add(mesh);
  }
  scene.add(group);
  return group;
}

export {
  ALPHA_FIX,
  _col,
  _e,
  _m4,
  _p,
  _q,
  _s,
  alphaFix,
  atlasInject,
  atlasMats,
  buildInstanced,
  crossGeo,
  grassGeo,
  hideInstance,
  windInject,
};
