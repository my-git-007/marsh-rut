// ?test=meshy: the bull moose made in Meshy, shown beside the game's own second-largest bull (built by the sim,
// in the middle), at the same length, side-on. Left: the rigged Meshy model (about 10,000 triangles), walking in
// place with its legs driven by code, to show the rig bends the mesh (&still: standing; &phase=0..1: frozen). Right: the high-detail
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

// the rig: four legs, each a chain of bones from the hoof up to where it joins the spine (shoulder blade or hip).
// Meshy rigged the bull mid-stride, so first stand each leg straight: the hoof under the top of the leg, the cannon
// (knee or hock down to the hoof) upright. The walk then adds to that.
const SIDE = new THREE.Vector3(1, 0, 0); // the model's sideways axis (it is long along z): legs swing about it
const boneKids = (b) => b.children.filter((c) => c.isBone).length;
function legRig(root) {
  const bones = [];
  root.traverse((b) => b.isBone && bones.push(b));
  root.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  // the hooves: the four lowest bone tips (one hind hoof is raised mid-stride, so not all are on the ground)
  const hooves = bones
    .filter((b) => !boneKids(b))
    .sort((a, b) => wp(a).y - wp(b).y)
    .slice(0, 4);
  const midZ = hooves.reduce((s, b) => s + wp(b).z, 0) / (hooves.length || 1);
  const joint = (b) => ({
    b,
    q0: b.quaternion.clone(),
    ax: SIDE.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()),
  });
  const legs = [];
  for (const h of hooves) {
    const chain = [h]; // hoof first, up the leg until the bone above branches (the spine)
    while (chain.length < 8 && chain.at(-1).parent && chain.at(-1).parent.isBone && boneKids(chain.at(-1).parent) === 1)
      chain.push(chain.at(-1).parent);
    if (chain.length < 5) continue;
    legs.push({
      front: wp(h).z > midZ,
      x: wp(chain.at(-1)).x,
      hoof: h,
      top: joint(chain.at(-1)),
      knee: joint(chain[3]),
    });
  }
  // stand straight: rotating a bone by +angle about SIDE swings what hangs below it backwards (-z)
  const lean = (from, to) => {
    const a = wp(from),
      b = wp(to);
    return Math.atan2(b.z - a.z, a.y - b.y);
  };
  const q = new THREE.Quaternion();
  for (const l of legs) {
    l.top.base = lean(l.top.b, l.hoof);
    l.top.b.quaternion.copy(l.top.q0).multiply(q.setFromAxisAngle(l.top.ax, l.top.base));
    root.updateMatrixWorld(true);
    l.knee.base = lean(l.knee.b, l.hoof);
    l.knee.b.quaternion.copy(l.knee.q0).multiply(q.setFromAxisAngle(l.knee.ax, l.knee.base));
    root.updateMatrixWorld(true);
  }
  // a walk: each hind leg leads the front leg on its side by a quarter stride; the two sides half a stride apart
  for (const pair of [legs.filter((l) => l.front), legs.filter((l) => !l.front)]) {
    pair.sort((a, b) => a.x - b.x);
    pair.forEach((l, i) => (l.off = (l.front ? 0 : 0.25) + i * 0.5));
  }
  return legs;
}

// pose the legs at phase ph (0..1 = one stride). The leg swings forward for the last 40% of its cycle, folding at
// the knee (front: the cannon folds back) or the hock (hind: the cannon folds forward), and pushes back on the
// ground for the rest.
function poseLegs(legs, ph) {
  const q = new THREE.Quaternion();
  for (const l of legs) {
    const p = (((ph + l.off) % 1) + 1) % 1;
    let swing, fold;
    if (p < 0.6) {
      swing = -0.3 + (0.6 * p) / 0.6; // planted: from forward (-) to back (+)
      fold = 0;
    } else {
      const u = (p - 0.6) / 0.4;
      swing = 0.3 - 0.6 * (0.5 - 0.5 * Math.cos(PI * u)); // lifted: back to forward
      fold = Math.sin(PI * u);
    }
    l.top.b.quaternion.copy(l.top.q0).multiply(q.setFromAxisAngle(l.top.ax, l.top.base + swing));
    l.knee.b.quaternion
      .copy(l.knee.q0)
      .multiply(q.setFromAxisAngle(l.knee.ax, l.knee.base + (l.front ? 1.1 : -0.9) * fold));
  }
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
  let rig = null,
    hires = null;
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
  if (Q.has('still')) return; // standing straight
  if (Q.has('phase')) return poseLegs(legs, +Q.get('phase')); // frozen at one moment of the stride
  const t0 = performance.now();
  const tick = () => {
    poseLegs(legs, (performance.now() - t0) / 1000 / 1.4); // one stride every 1.4 s
    requestAnimationFrame(tick);
  };
  tick();
}
