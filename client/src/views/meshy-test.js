// ?test=meshy: the bull moose made in Meshy, shown beside the game's own second-largest bull (built by the sim,
// in the middle), at the same length, side-on. Left: the rigged Meshy model (about 10,000 triangles), walking in
// place with its legs driven by code, to show the rig bends the mesh (&still stops it). Right: the high-detail
// Meshy model (about 457,000 triangles, no rig). Loaded only for this test.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import riggedUrl from '../../assets/meshy/meshy-bull-rigged.glb?url';
import hiresUrl from '../../assets/meshy/meshy-bull-hires.glb?url';
import { PI } from '../../../shared/util.js';
import { groundAt } from '../../../shared/world.js';
import { scene } from '../render/core.js';
import { ANIMALS, Q } from '../state.js';
import { showCaption } from './world-events.js';

const load = (url) => new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
const GAP = 7.5; // metres between the three bulls

// Meshy's material is fully metallic; with no reflections around it that renders nearly black, so make it fur
function furMaterials(root) {
  root.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false;
    for (const mat of [].concat(m.material)) {
      mat.metalness = 0;
      mat.metalnessMap = null;
      mat.needsUpdate = true;
    }
  });
}

// stand the model on the ground at (x, z), facing +x like the game's bulls, as long (nose to tail) as len
function place(root, x, z, len) {
  const wrap = new THREE.Group();
  wrap.add(root);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  // which end is the head: the antlers are the highest part of the model
  let sumZ = 0,
    n = 0;
  const v = new THREE.Vector3();
  root.traverse((m) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 7) {
      v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      if (v.y > box.max.y - size.y * 0.15) {
        sumZ += v.z;
        n++;
      }
    }
  });
  const headZ = n ? sumZ / n > (box.min.z + box.max.z) / 2 : true;
  const k = len / size.z;
  root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  wrap.scale.setScalar(k);
  wrap.rotation.y = headZ ? PI / 2 : -PI / 2; // the model's length is along z; the game's bulls face +x
  wrap.position.set(x, groundAt(x, z), z);
  scene.add(wrap);
  return { wrap, k, size };
}

// the rig: four legs, each a chain from hip to hoof. Find them by their hooves (bones near the ground).
function legRig(root) {
  const bones = [];
  root.traverse((b) => b.isBone && bones.push(b));
  root.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  const hooves = bones.filter((b) => !b.children.some((c) => c.isBone) && wp(b).y < 0.12);
  const midZ = hooves.reduce((s, b) => s + wp(b).z, 0) / (hooves.length || 1);
  const chains = hooves.map((h) => {
    const chain = [];
    for (let b = h; b && b.isBone && chain.length < 7; b = b.parent) chain.push(b);
    return [h, chain];
  });
  const legs = chains
    .filter(([, c]) => c.length >= 3)
    .map(([h, chain]) => {
      const hip = chain[chain.length - 2],
        knee = chain[Math.min(3, chain.length - 2)];
      const lat = new THREE.Vector3(1, 0, 0); // the model's sideways axis: legs swing about it
      const local = (b) => lat.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
      return {
        front: wp(h).z > midZ,
        x: wp(hip).x,
        hip: { b: hip, q0: hip.quaternion.clone(), ax: local(hip) },
        knee: { b: knee, q0: knee.quaternion.clone(), ax: local(knee) },
      };
    });
  // walk: diagonal pairs move together, each side half a stride apart
  for (const pair of [legs.filter((l) => l.front), legs.filter((l) => !l.front)]) {
    pair.sort((a, b) => a.x - b.x);
    pair.forEach((l, i) => (l.off = (l.front ? 0 : 0.5) + i * 0.5));
  }
  return legs;
}

export async function startMeshyTest() {
  showCaption('meshy', 'Loading the Meshy models…');
  // the game's bull (from the sim) tells us where to stand them and how long a bull of this size is
  let bull = null;
  for (let i = 0; i < 6000 && !(bull && bull.placed); i++) {
    bull = ANIMALS.find((a) => a.kind === 'bull');
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!bull || !bull.placed) return showCaption('meshy', 'No bull to compare with.');
  bull.M.root.updateMatrixWorld(true);
  const len = new THREE.Box3().setFromObject(bull.M.root).getSize(new THREE.Vector3()).x;
  let rig, hires;
  try {
    [rig, hires] = await Promise.all([load(riggedUrl), load(hiresUrl)]);
  } catch (err) {
    console.warn('Meshy models failed to load', err);
    return showCaption('meshy', 'The Meshy models failed to load.');
  }
  furMaterials(rig.scene);
  furMaterials(hires.scene);
  const legs = legRig(rig.scene);
  place(rig.scene, bull.x - GAP, bull.z, len);
  place(hires.scene, bull.x + GAP, bull.z, len);
  showCaption(
    'meshy',
    `Left: Meshy, rigged (10k triangles), legs moved by code\nMiddle: the game's own bull (second-largest size)\nRight: Meshy, high detail (457k triangles, no rig)\nAll three the same length: ${len.toFixed(2)} m nose to tail`,
  );
  if (Q.has('still')) return;
  const t0 = performance.now();
  const q = new THREE.Quaternion();
  const tick = () => {
    const t = (performance.now() - t0) / 1000,
      ph = t / 1.4; // one stride every 1.4 s
    for (const l of legs) {
      const a = (ph + l.off) * 2 * PI;
      l.hip.b.quaternion.copy(l.hip.q0).multiply(q.setFromAxisAngle(l.hip.ax, 0.32 * Math.sin(a)));
      const lift = Math.max(0, Math.sin(a + PI / 2)); // bend while the leg swings forward
      l.knee.b.quaternion.copy(l.knee.q0).multiply(q.setFromAxisAngle(l.knee.ax, (l.front ? -0.7 : 0.7) * lift));
    }
    requestAnimationFrame(tick);
  };
  tick();
}
