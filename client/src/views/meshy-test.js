// ?test=meshy: the bull moose made in Meshy, shown beside the game's own second-largest bull (built by the sim,
// in the middle), at the same length, side-on. The rigged Meshy model (about 10,000 triangles) walks to and fro in
// front of them, its legs, body and head moved by code (&still: standing as Meshy made him; &phase=0..1: frozen at
// one moment of the stride; &inplace: walking on the spot). Right: the high-detail Meshy model (about 457,000
// triangles, no rig). Loaded only for this test.
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
// Meshy modelled the bull with one hind leg raised. To stand him on four legs, that leg takes the shape of the
// other hind leg, mirrored, joint by joint. The other three keep the shape Meshy gave them.
const SIDE = new THREE.Vector3(1, 0, 0); // the model's sideways axis (it is long along z): legs swing about it
const boneKids = (b) => b.children.filter((c) => c.isBone).length;
function legRig(root) {
  const bones = [];
  root.traverse((b) => b.isBone && bones.push(b));
  root.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  // the hooves: the four lowest bone tips (the raised hind hoof is off the ground)
  const hooves = bones
    .filter((b) => !boneKids(b))
    .sort((a, b) => wp(a).y - wp(b).y)
    .slice(0, 4);
  const midZ = hooves.reduce((s, b) => s + wp(b).z, 0) / (hooves.length || 1);
  const legs = [];
  for (const h of hooves) {
    const chain = [h]; // hoof first, up the leg until the bone above branches (the spine)
    while (chain.length < 8 && chain.at(-1).parent && chain.at(-1).parent.isBone && boneKids(chain.at(-1).parent) === 1)
      chain.push(chain.at(-1).parent);
    if (chain.length >= 5) legs.push({ front: wp(h).z > midZ, x: wp(chain.at(-1)).x, hoof: h, down: chain.reverse() });
  }
  // a raised leg copies its partner's shape: each bone, top down, turned so it points the way the partner's does
  // (mirrored side to side)
  const q = new THREE.Quaternion(),
    qw = new THREE.Quaternion();
  for (const pair of [legs.filter((l) => l.front), legs.filter((l) => !l.front)]) {
    if (pair.length !== 2 || pair[0].down.length !== pair[1].down.length) continue;
    const [low, high] = wp(pair[0].hoof).y <= wp(pair[1].hoof).y ? pair : [pair[1], pair[0]];
    if (wp(high.hoof).y - wp(low.hoof).y < 0.05) continue; // both on the ground
    for (let i = 0; i < high.down.length - 1; i++) {
      const b = high.down[i];
      const cur = wp(high.down[i + 1])
        .sub(wp(b))
        .normalize();
      const want = wp(low.down[i + 1])
        .sub(wp(low.down[i]))
        .normalize();
      want.x = -want.x;
      b.getWorldQuaternion(qw);
      q.setFromUnitVectors(cur, want.normalize()); // the turn in world space, then in the bone's own frame
      b.quaternion.multiply(qw.clone().invert().multiply(q).multiply(qw));
      root.updateMatrixWorld(true);
    }
  }
  // what the walk needs from each leg (model units, side view: z forward, y up). Angles are measured from straight
  // down, positive leaning back; rotating a bone by +a about SIDE leans what hangs below it back by a.
  const lean = (a, b) => Math.atan2(-(b.z - a.z), -(b.y - a.y));
  const joint = (b) => ({
    b,
    q0: b.quaternion.clone(),
    ax: SIDE.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()),
  });
  for (const l of legs) {
    const top = wp(l.down[0]),
      knee = wp(l.down.at(-4)), // the knee (front) or hock (hind): the 4th bone up from the hoof
      hoof = wp(l.hoof);
    l.top = joint(l.down[0]);
    l.knee = joint(l.down.at(-4));
    l.A = top.distanceTo(knee); // top of the leg to the knee or hock
    l.B = knee.distanceTo(hoof); // knee or hock to the hoof (the cannon)
    l.g1 = lean(top, knee);
    l.g2 = lean(knee, hoof);
    l.topY = top.y;
    l.topZ = top.z;
    l.hoofY = hoof.y;
    l.hoofZ = hoof.z;
  }
  // where each hoof stands when the leg is under the body: the pair's average, so left and right match
  for (const pair of [legs.filter((l) => l.front), legs.filter((l) => !l.front)]) {
    const dz = pair.reduce((s, l) => s + l.hoofZ - l.topZ, 0) / pair.length,
      y = Math.min(...pair.map((l) => l.hoofY));
    for (const l of pair) {
      l.homeZ = dz;
      l.groundY = y;
    }
  }
  // a moose's walk: left hind, left fore, right hind, right fore, a quarter of a stride apart
  for (const pair of [legs.filter((l) => l.front), legs.filter((l) => !l.front)]) {
    pair.sort((a, b) => a.x - b.x);
    pair.forEach((l, i) => (l.off = (l.front ? 0 : 0.25) + i * 0.5));
  }
  return legs;
}

// the neck: the chain of bones from the chest to the head (the bone furthest forward), turned at its base to nod
function neckRig(root) {
  const bones = [];
  root.traverse((b) => b.isBone && bones.push(b));
  root.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(new THREE.Vector3());
  let b = bones.reduce((m, x) => (wp(x).y > 0.5 && wp(x).z > wp(m).z ? x : m), bones[0]);
  while (b.parent && b.parent.isBone && boneKids(b.parent) === 1) b = b.parent;
  return {
    b,
    q0: b.quaternion.clone(),
    ax: SIDE.clone().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert()),
  };
}

// the walk, in model units (the model is about 2.1 long): seconds per stride, how far each hoof travels, how high
// it lifts (front, hind), the share of the stride it spends on the ground, the body's rise and fall, the head's nod
const WALK = { stride: 1.25, sweep: 0.5, liftF: 0.13, liftH: 0.1, ground: 0.65, bob: 0.012, nod: 0.05 };
const smooth = (u) => u * u * (3 - 2 * u);

// put the hoof at (z, y) relative to the top of its leg: two segments (top to knee, knee to hoof) and the angle at
// the knee that makes them reach. Front knees sit forward of the line from top to hoof, hind hocks behind it.
function reach(l, z, y, q) {
  const D = Math.min(Math.hypot(z, y), l.A + l.B - 1e-4),
    gd = Math.atan2(-z, -y);
  const cosA = (l.A * l.A + D * D - l.B * l.B) / (2 * l.A * D),
    cosB = (l.B * l.B + D * D - l.A * l.A) / (2 * l.B * D);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA))),
    b = Math.acos(Math.max(-1, Math.min(1, cosB)));
  const s = l.front ? 1 : -1;
  const g1 = gd - s * a,
    g2 = gd + s * b;
  const d1 = g1 - l.g1;
  l.top.b.quaternion.copy(l.top.q0).multiply(q.setFromAxisAngle(l.top.ax, d1));
  l.knee.b.quaternion.copy(l.knee.q0).multiply(q.setFromAxisAngle(l.knee.ax, g2 - l.g2 - d1));
}

// pose the walk at phase ph (0..1 = one stride). On the ground the hoof stays put while the body moves over it (it
// slides back relative to the body); in the air it lifts and swings forward to land ahead. Returns the body's rise
// (model units): the caller raises the model by it, and the hooves are aimed lower by the same amount.
function poseWalk(legs, neck, ph) {
  const q = new THREE.Quaternion(),
    W = WALK;
  const bob = W.bob * Math.cos(4 * PI * ph); // up twice a stride, as each pair of legs passes under the body
  for (const l of legs) {
    const p = (((ph + l.off) % 1) + 1) % 1;
    let z, lift;
    if (p < W.ground) {
      z = W.sweep / 2 - (W.sweep * p) / W.ground;
      lift = 0;
    } else {
      const u = (p - W.ground) / (1 - W.ground);
      z = -W.sweep / 2 + W.sweep * smooth(u);
      lift = (l.front ? W.liftF : W.liftH) * Math.sin(PI * u);
    }
    reach(l, l.homeZ + z, l.groundY - l.topY + lift - bob, q);
  }
  if (neck) neck.b.quaternion.copy(neck.q0).multiply(q.setFromAxisAngle(neck.ax, W.nod * Math.cos(4 * PI * ph + 0.6)));
  return bob;
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
  // &still: exactly as Meshy made him (one hind leg raised mid-step); otherwise the legs are set up for the walk
  const still = Q.has('still'),
    frozen = Q.has('phase');
  const legs = still ? [] : legRig(rig.scene);
  const neck = still ? null : neckRig(rig.scene);
  // the walking bull has his own lane, 6 m nearer the stand, so he can walk past the other two
  const R = place(rig.scene, bull.x - GAP, still || frozen ? bull.z : bull.z + 6, len);
  place(hires.scene, bull.x + GAP, bull.z, len);
  showCaption(
    'meshy',
    (still || frozen
      ? `Left: Meshy, rigged (10k triangles)${still ? ', standing as Meshy made him' : ', one moment of the walk'}\n`
      : 'Front: Meshy, rigged (10k triangles), walking: legs, body and head moved by code\n') +
      `Middle: the game's own bull (second-largest size)\nRight: Meshy, high detail (457k triangles, no rig)\nAll the same length: ${len.toFixed(2)} m nose to tail`,
  );
  if (still) return;
  if (frozen) {
    R.wrap.position.y += R.k * poseWalk(legs, neck, +Q.get('phase'));
    return;
  }
  // walk to and fro across the clearing, turning at each end (&inplace: walk on the spot). His speed is the speed
  // his hooves pass under him, so they don't slide.
  const inplace = Q.has('inplace'),
    speed = (WALK.sweep / (WALK.ground * WALK.stride)) * R.k,
    x0 = bull.x - 14,
    x1 = bull.x + 14,
    w = R.wrap;
  let ph = 0,
    dir = 1,
    turn = 0,
    last = performance.now();
  if (!inplace) w.position.x = x0;
  const tick = () => {
    const now = performance.now(),
      dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    ph = (ph + dt / WALK.stride) % 1;
    if (!inplace) {
      // turning round: a slow half circle, away from the stand at one end and towards it at the other, so he
      // keeps to his lane
      let v = speed;
      if (turn > 0) {
        const a = Math.min(turn, (dt * PI) / 4);
        turn -= a;
        w.rotation.y += a * dir;
        v *= 0.6;
      } else if ((dir > 0 && w.position.x > x1) || (dir < 0 && w.position.x < x0)) {
        turn = PI;
        dir = -dir;
      }
      w.position.x += Math.sin(w.rotation.y) * v * dt;
      w.position.z += Math.cos(w.rotation.y) * v * dt;
    }
    const bob = poseWalk(legs, neck, ph);
    w.position.y = groundAt(w.position.x, w.position.z) + R.k * bob;
    requestAnimationFrame(tick);
  };
  tick();
}
