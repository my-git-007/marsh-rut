// render/water.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { PI } from '../../../shared/util.js';
import { MAP, WATER_Y } from '../../../shared/world.js';
import { C, FOG_COL, SUN_COL, SUN_DIR, U, camera, renderer, scene } from './core.js';
import { NOISE_GLSL } from './sky.js';

/* ================= water with planar reflection ================= */
let reflRT, reflCam, water, clipPlane;
function buildWater() {
  reflRT = new THREE.WebGLRenderTarget(512, 512, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  reflCam = new THREE.PerspectiveCamera();
  reflCam.layers.set(0);
  clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(WATER_Y - 0.02));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uRefl: { value: reflRT.texture },
      uTexMat: { value: new THREE.Matrix4() },
      uTime: U.time,
      uSun: { value: SUN_DIR },
      uSunCol: { value: SUN_COL },
      uFog: { value: FOG_COL },
      uFogD: { value: scene.fog.density },
      uDeep: { value: C('#0d0f0a') },
      uRip: U.rip,
      uSky: { value: C('#8fa7bd') },
    },
    vertexShader: `uniform mat4 uTexMat;varying vec4 vR;varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;vR=uTexMat*w;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform sampler2D uRefl;uniform float uTime,uFogD;uniform vec3 uSun,uSunCol,uFog,uDeep,uSky;varying vec4 vR;varying vec3 vW;${NOISE_GLSL}
    uniform vec4 uRip[14];
    float rip(vec2 q){float s=0.0;for(int i=0;i<14;i++){vec4 r=uRip[i];float age=uTime-r.z;if(age>0.0&&age<7.0){float dd=length(q-r.xy);float x=dd-age*1.3;s+=r.w*exp(-x*x*2.5)*sin(x*9.0)*(1.0-age/7.0)/(1.0+dd*0.25);}}return s;}
    float hf(vec2 q){return vnoise(q*0.8+uTime*vec2(0.05,0.03))*0.5+vnoise(q*2.2-uTime*vec2(0.04,0.07))*0.28+vnoise(q*6.0+uTime*vec2(0.11,-0.06))*0.1;}
    void main(){vec2 p=vW.xz;float e=0.06;float dist=length(cameraPosition-vW);
      float k=0.22/(1.0+dist*0.01);
      float e2=0.05;vec2 rg=vec2(rip(p+vec2(e2,0.0))-rip(p-vec2(e2,0.0)),rip(p+vec2(0.0,e2))-rip(p-vec2(0.0,e2)))/(2.0*e2);
      vec3 n=normalize(vec3((hf(p-vec2(e,0.0))-hf(p+vec2(e,0.0)))/e*k-rg.x*0.5,1.0,(hf(p-vec2(0.0,e))-hf(p+vec2(0.0,e)))/e*k-rg.y*0.5));
      vec3 V=normalize(cameraPosition-vW);
      vec4 rc=vR;rc.xy+=n.xz*rc.w*0.035;
      vec3 refl=texture2DProj(uRefl,rc).rgb;
      float fr=0.02+0.98*pow(1.0-max(dot(n,V),0.0),5.0);
      vec3 col=mix(uDeep,refl,clamp(fr*1.05,0.0,1.0));
      float sp=pow(max(dot(reflect(-V,n),uSun),0.0),280.0);col+=uSunCol*sp*4.0;
      float ff=1.0-exp(-uFogD*uFogD*dist*dist);col=mix(col,uFog,ff);
      gl_FragColor=vec4(col,1.0);
      #include <tonemapping_fragment>
      #include <encodings_fragment>
    }`,
  });
  // one flat sheet under the whole map's open water (the ground hides it everywhere else)
  const R = (MAP.look && MAP.look.water) || { x: 0, z: -380, w: 900, d: 1000 };
  water = new THREE.Mesh(new THREE.PlaneGeometry(R.w, R.d, 1, 1), mat);
  water.rotation.x = -PI / 2;
  water.position.set(R.x, WATER_Y, R.z);
  scene.add(water);
}
const _rv = new THREE.Vector3(),
  _rt = new THREE.Vector3(),
  _rm = new THREE.Matrix4();
function renderReflection() {
  const cp = camera.position;
  reflCam.position.set(cp.x, 2 * WATER_Y - cp.y, cp.z);
  _rm.extractRotation(camera.matrixWorld);
  _rt.set(0, 0, -1).applyMatrix4(_rm).add(cp);
  _rt.y = 2 * WATER_Y - _rt.y;
  reflCam.up.set(0, 1, 0).applyMatrix4(_rm);
  reflCam.up.y *= -1;
  reflCam.lookAt(_rt);
  reflCam.fov = camera.fov;
  reflCam.aspect = camera.aspect;
  reflCam.near = camera.near;
  reflCam.far = camera.far;
  reflCam.updateProjectionMatrix();
  reflCam.updateMatrixWorld();
  const tm = water.material.uniforms.uTexMat.value;
  tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  tm.multiply(reflCam.projectionMatrix);
  tm.multiply(reflCam.matrixWorldInverse);
  water.visible = false;
  renderer.clippingPlanes = [clipPlane];
  renderer.setRenderTarget(reflRT);
  renderer.render(scene, reflCam);
  renderer.setRenderTarget(null);
  renderer.clippingPlanes = [];
  water.visible = true;
}

export { _rm, _rt, _rv, buildWater, clipPlane, reflCam, reflRT, renderReflection, water };
