// render/birds.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { PI, TAU, lerp, pick, rand, randi } from '../../../shared/util.js';
import { POND, WATER_Y, groundAt, marshE } from '../../../shared/world.js';
import { A, A_ok, SB, ambClips, playBuf, spatial } from '../audio/audio.js';
import { G, PLAYER } from '../state.js';
import { C, scene } from './core.js';

/* ====== birds: ravens over the marsh, ducks off the pond, geese in a V, blue jays and songbirds crossing the
   marsh, a hawk circling high up ====== */
const BIRDS = [];
const BIRD_MATS = {};
function birdMesh(type) {
  const c = { raven: '#0d0c0c', goose: '#5a5048', duck: '#4a4034', jay: '#4a74b4', song: '#4a3f36', hawk: '#5e4634' }[
    type
  ];
  if (!BIRD_MATS[type]) BIRD_MATS[type] = new THREE.MeshLambertMaterial({ color: C(c) });
  const m = BIRD_MATS[type];
  const S = { raven: 0.6, goose: 0.9, duck: 0.55, jay: 0.36, song: 0.22, hawk: 1.15 }[type];
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), m);
  body.scale.set(S, S * 0.28, S * 0.3);
  g.add(body);
  if (type === 'goose') {
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, S * 0.55, 5), BIRD_MATS.raven || m);
    neck.rotation.z = -PI / 2 + 0.2;
    neck.position.set(S * 0.55, 0.03, 0);
    g.add(neck);
  }
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(S * 0.11, 6, 5),
    type === 'goose'
      ? BIRD_MATS.goosehead || (BIRD_MATS.goosehead = new THREE.MeshLambertMaterial({ color: C('#0a0a0a') }))
      : m,
  );
  head.position.set(S * (type === 'goose' ? 0.85 : 0.55), 0.03, 0);
  g.add(head);
  const wg = new THREE.BoxGeometry(S * 0.35, 0.01, S * 1.0);
  wg.translate(0, 0, S * 0.5);
  const wings = [];
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(wg, m);
    w.scale.z = s;
    g.add(w);
    wings.push(w);
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return { g, wings };
}
function spawnFlock(type, n, p, dur) {
  // a flock crossing the sky along the same line as its sound
  const ex = p.x > PLAYER.x ? PLAYER.x - 700 : PLAYER.x + 700;
  const alt = type === 'goose' ? rand(90, 150) : rand(25, 60);
  for (let i = 0; i < n; i++) {
    const row = Math.ceil(i / 2),
      side = i % 2 ? 1 : -1;
    const offx = -row * 3.2 * (ex > p.x ? 1 : -1),
      offz = row * 2.4 * side;
    const b = birdMesh(type);
    scene.add(b.g);
    BIRDS.push({
      ...b,
      type,
      x0: p.x + offx,
      z0: p.z + offz,
      x1: ex + offx,
      z1: p.z + offz + rand(-40, 40),
      y: alt + rand(-2, 2),
      t: 0,
      dur: dur || rand(20, 30),
      flap: rand(2.4, 3),
    });
  }
}
function spawnBirds(type) {
  if (type === 'raven') {
    const a = rand(0, TAU),
      r = rand(150, 500);
    const p = { x: PLAYER.x + Math.cos(a) * r, z: PLAYER.z - 200 + Math.sin(a) * r };
    const q = { x: PLAYER.x - Math.cos(a) * r + rand(-100, 100), z: PLAYER.z - 200 - Math.sin(a) * r };
    for (let i = 0; i < randi(1, 2); i++) {
      const b = birdMesh('raven');
      scene.add(b.g);
      BIRDS.push({
        ...b,
        type,
        x0: p.x + i * 6,
        z0: p.z + i * 4,
        x1: q.x,
        z1: q.z,
        y: rand(25, 55),
        t: 0,
        dur: Math.hypot(q.x - p.x, q.z - p.z) / rand(11, 14),
        flap: rand(3.5, 4.5),
        glide: true,
        callAt: 0.5,
      });
    }
  } else if (type === 'duck') {
    const n = randi(3, 7);
    if (A_ok()) {
      const ks = Object.keys(SB).filter((k) => k.startsWith('fx_ducks-flush_'));
      if (ks.length) {
        const d = spatial(POND.x, 0.5, POND.z, { ref: 20, life: 12, wet: 0.3, bus: 'wildlife' });
        playBuf(SB[pick(ks)], d, A.ctx.currentTime + 0.05, { gain: 1.3, fade: 0.1 });
      }
    }
    const a = rand(0, TAU);
    for (let i = 0; i < n; i++) {
      const b = birdMesh('duck');
      scene.add(b.g);
      BIRDS.push({
        ...b,
        type,
        x0: POND.x + rand(-15, 15),
        z0: POND.z + rand(-10, 10),
        x1: POND.x + Math.cos(a) * 700,
        z1: POND.z + Math.sin(a) * 700,
        y: 0,
        climb: true,
        t: 0,
        dur: rand(40, 50),
        flap: rand(6, 7),
      });
    }
  }
}
// a line across the marsh in front of the hunter: from one side to the other, between dMin and dMax metres out
function acrossMarsh(dMin, dMax, half) {
  const y = PLAYER.yaw || 0,
    fx = -Math.sin(y),
    fz = -Math.cos(y),
    rx = Math.cos(y),
    rz = -Math.sin(y);
  const side = Math.random() < 0.5 ? -1 : 1,
    d0 = rand(dMin, dMax),
    d1 = rand(dMin, dMax),
    L = half * rand(0.8, 1.2);
  return {
    a: { x: PLAYER.x + fx * d0 - rx * L * side, z: PLAYER.z + fz * d0 - rz * L * side },
    b: { x: PLAYER.x + fx * d1 + rx * L * side, z: PLAYER.z + fz * d1 + rz * L * side },
  };
}
function jayCall(x, y, z) {
  if (!A_ok()) return;
  const ks = ambClips('blue-jay');
  if (!ks.length) return;
  const d = spatial(x, y, z, { ref: 14, life: 8, wet: 0.3, bus: 'wildlife' });
  playBuf(SB[pick(ks)], d, A.ctx.currentTime + 0.05, { gain: 1.0, fade: 0.1 });
}
// blue jays (one to three, calling), a small flock of songbirds, or a hawk circling
function spawnCrossing(type) {
  if (type === 'hawk') {
    const y = PLAYER.yaw || 0,
      d = rand(150, 420),
      a = rand(-0.8, 0.8);
    const cx = PLAYER.x - Math.sin(y + a) * d,
      cz = PLAYER.z - Math.cos(y + a) * d;
    const b = birdMesh('hawk');
    b.g.rotation.order = 'YXZ'; // turn first, then bank about its own length
    scene.add(b.g);
    BIRDS.push({
      ...b,
      type,
      circle: { cx, cz, r: rand(35, 75), w: rand(0.1, 0.16) * (Math.random() < 0.5 ? -1 : 1), ph: rand(0, TAU) },
      drift: { x: rand(-1.5, 1.5), z: rand(-1.5, 1.5) },
      y: rand(70, 130),
      t: 0,
      dur: rand(60, 110),
      flap: 2.2,
      glide: true,
    });
    return;
  }
  const jay = type === 'jay';
  const { a, b: e } = acrossMarsh(jay ? 30 : 40, jay ? 220 : 320, jay ? rand(160, 300) : rand(200, 380));
  const n = jay ? randi(1, 3) : randi(5, 12),
    dist = Math.hypot(e.x - a.x, e.z - a.z),
    ux = (e.x - a.x) / dist,
    uz = (e.z - a.z) / dist,
    speed = jay ? rand(9, 12) : rand(11, 14);
  // high enough for the whole line: over the highest ground, and over the treetops where it crosses the woods
  let top = -1e9;
  for (let k = 0; k <= 16; k++) {
    const px = lerp(a.x, e.x, k / 16),
      pz = lerp(a.z, e.z, k / 16);
    top = Math.max(top, groundAt(px, pz) + (marshE(px, pz) > 0.01 ? 24 : 0));
  }
  const alt = top + (jay ? rand(5, 12) : rand(8, 22));
  for (let i = 0; i < n; i++) {
    const bm = birdMesh(type);
    scene.add(bm.g);
    const lag = jay ? i * rand(4, 9) : rand(0, 6),
      off = jay ? rand(-4, 4) : rand(-7, 7);
    BIRDS.push({
      ...bm,
      type,
      // spread sideways (across the line of flight), each starting a little behind the leader
      x0: a.x - ux * lag - uz * off,
      z0: a.z - uz * lag + ux * off,
      x1: e.x - uz * off,
      z1: e.z + ux * off,
      y: alt + rand(-1.5, 1.5),
      t: 0,
      dur: (dist + lag) / speed,
      flap: jay ? rand(7, 9) : rand(11, 14),
      bound: rand(0, TAU), // undulating flight: a few flaps up, then a dip with wings closed
      calls: jay && i === 0 ? [rand(0.15, 0.35), rand(0.55, 0.8)] : null,
    });
  }
}
function updateBirds(dt) {
  for (let i = BIRDS.length - 1; i >= 0; i--) {
    const b = BIRDS[i];
    b.t += dt / b.dur;
    if (b.t >= 1) {
      scene.remove(b.g);
      BIRDS.splice(i, 1);
      continue;
    }
    let x, z, y, head;
    if (b.circle) {
      // circling on a thermal, drifting with it
      const c = b.circle,
        s = b.t * b.dur,
        an = c.ph + c.w * s;
      x = c.cx + b.drift.x * s + Math.cos(an) * c.r;
      z = c.cz + b.drift.z * s + Math.sin(an) * c.r;
      y = b.y + Math.sin(s * 0.2) * 4;
      head = Math.atan2(-(Math.cos(an) * Math.sign(c.w)), -Math.sin(an) * Math.sign(c.w));
    } else {
      x = lerp(b.x0, b.x1, b.t);
      z = lerp(b.z0, b.z1, b.t);
      y = b.climb ? WATER_Y + 0.3 + Math.min(1, b.t * 6) * 35 + b.t * 20 : b.y + Math.sin(b.t * 9) * 1.5;
      if (b.bound !== undefined) y += Math.sin(b.t * b.dur * 2.6 + b.bound) * 1.1;
      head = Math.atan2(-(b.z1 - b.z0), b.x1 - b.x0);
    }
    b.g.position.set(x, y, z);
    b.g.rotation.y = head;
    if (b.circle) b.g.rotation.x = 0.25 * Math.sign(b.circle.w); // banking into the turn
    const flapping =
      b.bound !== undefined
        ? Math.cos(b.t * b.dur * 2.6 + b.bound) > -0.2 // flaps while rising, wings shut in the dip
        : !b.glide || Math.sin(b.t * 40) > 0;
    const f = flapping ? Math.sin(G.time * TAU * b.flap) * 0.6 : b.bound !== undefined ? 0 : 0.08;
    if (b.calls && b.calls.length && b.t > b.calls[0]) {
      b.calls.shift();
      if (Math.hypot(x - PLAYER.x, z - PLAYER.z) < 400) jayCall(x, y, z);
    }
    b.wings[0].rotation.x = -f;
    b.wings[1].rotation.x = f;
    if (b.callAt && b.t > b.callAt) {
      b.callAt = 0;
      if (A_ok() && Math.hypot(x - PLAYER.x, z - PLAYER.z) < 450) {
        const ks = Object.keys(SB).filter((k) => k.startsWith('fx_raven-wings_'));
        if (ks.length) {
          const d = spatial(x, y, z, { ref: 15, life: 12, wet: 0.3, bus: 'wildlife' });
          playBuf(SB[pick(ks)], d, A.ctx.currentTime + 0.05, { gain: 1.2, fade: 0.2 });
        }
      }
    }
  }
}

export { BIRDS, BIRD_MATS, birdMesh, spawnBirds, spawnCrossing, spawnFlock, updateBirds };
