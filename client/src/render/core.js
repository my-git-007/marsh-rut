// render/core.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';

const C = (h) => new THREE.Color(h).convertSRGBToLinear();
/* ================= renderer / scene ================= */
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const scene = new THREE.Scene();
const FOG_COL = C('#bfc6c4');
scene.fog = new THREE.FogExp2(FOG_COL.getHex(), 0.00072);
scene.fog.color.copy(FOG_COL);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.25, 14000);
camera.rotation.order = 'YXZ';
camera.layers.enable(1);
const SUN_DIR = new THREE.Vector3(0.66, 0.25, 0.3).normalize();
const SUN_COL = C('#ffd8a6');
const hemi = new THREE.HemisphereLight(C('#a9bccb'), C('#5b4a31'), 0.72);
scene.add(hemi);
const sun = new THREE.DirectionalLight(SUN_COL, 3.0);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
const sc = sun.shadow.camera;
sc.left = -640;
sc.right = 640;
sc.top = 640;
sc.bottom = -640;
sc.near = 10;
sc.far = 3200;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.35;
scene.add(sun);
scene.add(sun.target);
sun.target.position.set(0, 0, -372);
sun.position.copy(SUN_DIR).multiplyScalar(1500).add(sun.target.position);
const U = { time: { value: 0 }, wind: { value: new THREE.Vector3(0, 0, 1) } };
// a map's own air and light: clearer mountain air (the peaks are kilometres away), and the shadows centred on its
// open ground (map.look, shared/maps/*.js)
function setMapLook(map) {
  const L = map.look || {};
  if (L.fog) scene.fog.density = L.fog;
  if (L.sunAt) {
    sun.target.position.set(L.sunAt.x, 0, L.sunAt.z);
    sun.position.copy(SUN_DIR).multiplyScalar(1500).add(sun.target.position);
  }
}

export { C, FOG_COL, SUN_COL, SUN_DIR, U, camera, canvas, hemi, renderer, sc, scene, setMapLook, sun };
