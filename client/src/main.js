// Hunting LTD — start-up and the frame loop.
// Builds the marsh, seats this player at a stand through a host (the simulation in this tab for solo play,
// or the marsh server for multiplayer), then every frame: take the host's snapshot and events, pose the
// animals, play the sounds, render.
import { clamp, smoothstep, noise1, rand } from '../../shared/util.js';
import { useWorld, MAP, MAP_IDS, DEFAULT_MAP, STANDS, groundAt, marshE } from '../../shared/world.js';
import { WIND } from '../../shared/wind.js';
import { renderer, scene, camera, canvas, U, setMapLook } from './render/core.js';
import { makeTextures } from './render/textures.js';
import { buildSky } from './render/sky.js';
import { buildTerrain } from './render/terrain.js';
import { buildWater, renderReflection, reflRT } from './render/water.js';
import { buildRidges } from './render/ridges.js';
import { buildGrass, buildForest, buildPlants, buildShrubs, buildStand } from './render/vegetation.js';
import { updatePlants3D } from './render/plants3d.js';
import { updateFx, updateVapor } from './render/fx.js';
import { spawnBirds, spawnCrossing, spawnFlock, updateBirds } from './render/birds.js';
import { loadRefAssets } from './models/ref-bull.js';
import { A, audioInit, updateAmbience, updateListener } from './audio/audio.js';
import { V, clampLook, setLookLimits, showMsg } from './ui/input.js';
import { LULL, updateLull } from './lull.js';
import { layoutBinoc, rangeFind, setDeadwoodHit, updateHUD } from './ui/hud.js';
import { updateCallLabel } from './calls.js';
import { LocalHost, RemoteHost } from './net/hosts.js';
import { watchIdle } from './ui/idle.js';
import { initMenu, note as menuNote } from './ui/menu.js';
import './ui/start-screen.js'; // builds the start screen, with #go, before the code below runs
import { getToken, watchUser, logOut } from './auth/auth.js';
import { site } from './site.js';
import { LOCATIONS } from './locations.js';
import { handleEvent, updateViews } from './views/world-events.js';
import { ANIMALS, G, NET, PLAYER, Q, TEST, UI, bearingOf } from './state.js';

window.addEventListener('error', (e) => {
  const el = document.getElementById('err');
  el.style.display = 'block';
  el.textContent +=
    (e.message || String(e)) + ' @' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '?') + '\n';
});
window.__log = [];
window.__marsh = { NET, PLAYER, ANIMALS, G, V, UI, A, groundAt, camera, rangeFind }; // for tests and the console

// Online when a server is configured (?server=wss://… or VITE_SERVER_URL at build time): players log in and
// the server runs each player's own marsh. Otherwise (or with ?solo) the marsh runs in this tab, no account.
const SERVER = Q.has('solo') ? '' : Q.get('server') || import.meta.env.VITE_SERVER_URL || '';
const SHOWCASE = Q.has('showcase') || /showcase/.test(location.hash);
// Each open location's Go hunting button (ui/start-screen.js). Online, pressing one builds that map (progress on
// the button), joins the player's marsh there and goes straight in. Offline and in tests the map is built at once:
// ?at=<map id> picks it (Grassland Marsh if not given).
const GOS = [...document.querySelectorAll('#locs .go')];
const AT = MAP_IDS.includes(Q.get('at')) ? Q.get('at') : DEFAULT_MAP;
let go = GOS.find((b) => b.dataset.map === AT) || GOS[0];
const st = (t) => {
  go.textContent = t;
};
const netMsg = (t) => {
  const el = go && go.closest('.loc').querySelector('.netmsg');
  if (el) el.textContent = t || '';
};
const tick = () => new Promise((r) => setTimeout(r, 0));
let updateDeadwood = null; // (once the logs and stumps have loaded: render/deadwood.js)
let sky = null,
  grassBuilt = false,
  USER = null,
  leaving = false,
  ready = false, // textures painted (online: the buttons can be pressed)
  built = null; // the map that has been built (one per page: Change location reloads the page)
// show the whole start card at once, when it can be used and (online) we know who is playing
const reveal = () => {
  if (ready && (USER || !SERVER || TEST)) document.getElementById('start').classList.remove('loading');
};

// build one map's ground, sky, water and timber (the grass and 3D plants come once the hunter is seated)
async function buildMap(id) {
  const name = (LOCATIONS.find((l) => l.id === id) || {}).name || 'the hunting grounds';
  st(`Shaping ${name}…`);
  await tick();
  useWorld(id);
  built = id;
  HERE = name;
  setMapLook(MAP);
  Object.assign(PLAYER, { x: STANDS[0].x, z: STANDS[0].z, y: STANDS[0].y, eye: STANDS[0].eye, yaw: STANDS[0].yaw });
  buildTerrain();
  await tick();
  sky = buildSky();
  buildRidges();
  buildWater();
  st('Planting forest…');
  await tick();
  buildForest();
  buildShrubs();
  buildStand();
  layoutBinoc();
  onResize();
  updateCallLabel();
}

async function init() {
  if (SERVER && !TEST) startSession(); // online: who is playing (checked while the textures are painted)
  st('Painting textures…');
  await tick();
  makeTextures();
  await loadRefAssets();
  if (SERVER && !TEST) {
    for (const b of GOS) b.disabled = false;
    for (const b of GOS) b.textContent = 'Go hunting';
    ready = true;
    document.getElementById('start').classList.add('bare'); // nothing built behind the card yet
    reveal();
    watchIdle({
      onWarn: (s) => {
        if (!USER) return;
        const t = `Still there? You’ll be logged out in ${s} seconds unless you move the mouse.`;
        showMsg(t, 60000);
        if (!NET.host) netMsg(t);
        if (UI.paused) menuNote(t);
      },
      onBack: () => {
        showMsg('', 1);
        if (!NET.host) netMsg('');
        if (UI.paused) menuNote('');
      },
      onIdle: () => {
        if (USER || NET.host) idleLogout();
      },
      tellServer: () => {
        if (NET.host) NET.host.active();
      },
    });
  } else {
    await buildMap(AT);
    await seat(new LocalHost({ log: !!TEST, map: AT }), 'You', Q.has('stand') ? +Q.get('stand') : 0);
    for (const b of GOS) b.disabled = false;
    st('Go hunting');
    ready = true;
    reveal();
  }
  initMenu({ online: !!(SERVER && !TEST), user: () => USER, onChangeLocation: changeLocation, onExit: exitGame });
  requestAnimationFrame(loop);
}

// The game page needs a logged-in player with a confirmed email; anyone else goes to the account pages.
function startSession() {
  watchUser((u) => {
    if (!u) {
      if (!leaving) location.replace(site('sign-in'));
      return;
    }
    if (!u.verified) {
      location.replace(site('confirm-email'));
      return;
    }
    USER = u;
    document.getElementById('in-name').textContent = u.name;
    document.getElementById('in-email').textContent = u.email || '';
    if (!NET.host) document.getElementById('acct').hidden = false;
    reveal();
  }).catch((e) => {
    netMsg(e.message);
    document.getElementById('start').classList.remove('loading'); // don't leave the card half-shown
  });
  document.getElementById('logout').addEventListener('click', (e) => {
    e.preventDefault();
    leaveTo('');
  });
}
// leave the marsh, log out and go to the log-in page, with a message for it
// the hunting grounds this page is playing, for messages like "You've left Grassland Marsh." (set by buildMap)
let HERE = LOCATIONS.find((l) => l.id === DEFAULT_MAP).name;
async function leaveTo(msg) {
  leaving = true;
  try {
    if (NET.host && NET.host.leave) NET.host.leave();
  } catch (e) {}
  try {
    if (msg) sessionStorage.setItem('hl-carry', JSON.stringify({ msg, kind: 'ok' }));
  } catch (e) {}
  try {
    await logOut();
  } catch (e) {}
  location.replace(site('sign-in'));
}
// Change location (pause menu): leave the marsh and reload this page, which opens on its own Choose your hunting
// grounds (the moose screen here; each animal's screen works the same way). Still logged in.
function changeLocation() {
  leaving = true;
  try {
    if (NET.host && NET.host.leave) NET.host.leave();
  } catch (e) {}
  location.replace(location.pathname);
}
// Exit game (pause menu): online, leave the marsh and log out; offline, back to the start
async function exitGame() {
  if (SERVER && !TEST) return leaveTo(`You’ve left ${HERE}. Log in to go back.`);
  location.reload();
}

// How far the marsh reaches to the left and right of a stand, as angles from where the stand faces: the hunter
// may turn that far. Looks out along each bearing (1 degree apart) for open marsh within 900 m.
function marshSpan(st) {
  const sees = (deg) => {
    const y = st.yaw + (deg * Math.PI) / 180,
      fx = -Math.sin(y),
      fz = -Math.cos(y);
    for (let d = 15; d < 900; d += 3) if (marshE(st.x + fx * d, st.z + fz * d) < 0) return true;
    return false;
  };
  // the last bearing with marsh, stepping over gaps of up to 4 degrees (a wiggle in the shoreline)
  const reach = (sign) => {
    let last = 0;
    for (let a = 1; a <= 175 && a - last <= 5; a++) if (sees(sign * a)) last = a;
    return last;
  };
  let left = reach(1),
    right = reach(-1);
  if (left + right < 40) left = right = 60; // (not facing the marsh: shouldn't happen)
  return { left: (left * Math.PI) / 180, right: (right * Math.PI) / 180 };
}

// put this player in a stand and finish the bits of the world that depend on where they sit
async function seat(host, name, stand) {
  const { you, hunters } = await host.join(name, stand);
  NET.host = host;
  NET.hunters = hunters;
  Object.assign(PLAYER, {
    id: you.id,
    name: you.name,
    stand: you.stand,
    x: you.x,
    z: you.z,
    y: you.y,
    eye: you.eye,
    yaw: you.yaw,
  });
  camera.position.set(PLAYER.x, PLAYER.eye, PLAYER.z);
  V.yaw = PLAYER.yaw;
  // how far the hunter may turn: set by the map for its stand, or as far as the marsh reaches
  const sd = STANDS[PLAYER.stand] || {};
  const span = sd.look
    ? { left: (sd.look.left * Math.PI) / 180, right: (sd.look.right * Math.PI) / 180 }
    : marshSpan(PLAYER);
  setLookLimits(PLAYER.yaw, span.left, span.right);
  // looking a touch down to start with (a map's stand can set its own pitch)
  V.pitch = sd.look && typeof sd.look.pitch === 'number' ? sd.look.pitch : -0.035;
  if (!host.local) {
    host.onHunters = (list) => {
      const before = new Set(NET.hunters.map((h) => h.id));
      NET.hunters = list;
      for (const h of list)
        if (!before.has(h.id)) showMsg(`${h.name} climbed into the ${STANDS[h.stand].name} stand`, 4000);
    };
    host.onClose = (why) => {
      if (why === 'idle') idleLogout();
      else showMsg((why || 'Lost the connection to the marsh server.') + ' Reload the page to go back in.', 600000);
    };
  }
  if (!grassBuilt) {
    grassBuilt = true;
    st('Growing grass…');
    await tick();
    buildGrass();
    st('Growing trees…');
    await tick();
    buildPlants();
    // scanned boulders, from stones to glacial erratics (render/boulders.js); none if they fail to load
    st('Placing rocks…');
    await import('./render/boulders.js')
      .then((m) => m.buildBoulders())
      .catch((err) => console.warn('Boulders failed', err));
    // logs and stumps (render/deadwood.js): not waited for, they come in while the hunter settles
    import('./render/deadwood.js')
      .then(async (m) => {
        if (!(await m.buildDeadwood())) return;
        updateDeadwood = m.updateDeadwood;
        setDeadwoodHit(m.deadwoodHit);
      })
      .catch((err) => console.warn('Logs and stumps failed', err));
  }
  if (TEST) setupTest();
  else if (SHOWCASE && host.local) {
    host.scenario('showcase', () => null);
    V.yaw = PLAYER.yaw;
  }
  renderer.shadowMap.needsUpdate = true;
}

// 10 minutes without touching mouse or keyboard: log out, close the marsh, and start over at the login screen
async function idleLogout() {
  if (leaving) return;
  leaveTo(`You were logged out after 10 minutes without activity. Log in to go back to ${HERE}.`);
}

async function joinOnline() {
  if (!USER) return false;
  const stand = 0; // one spot per location for now: the map's first stand
  for (const b of GOS) b.disabled = true;
  if (built !== go.dataset.map)
    try {
      await buildMap(go.dataset.map);
    } catch (e) {
      netMsg('Couldn’t build this location: ' + e.message + ' Reload the page to try again.');
      st('Go hunting');
      return false;
    }
  st('Walking in…');
  netMsg('Opening your marsh…');
  try {
    await seat(new RemoteHost(SERVER, getToken, built), USER.name, stand);
    netMsg(`Your marsh is ready. You are in the ${STANDS[PLAYER.stand].name} stand.`);
    return true;
  } catch (e) {
    netMsg(e.message);
    st('Go hunting');
    for (const b of GOS) b.disabled = false; // another location reloads the page first (enter)
    return false;
  }
}

function setupTest() {
  const q = (k) => Q.get(k);
  document.getElementById('start').style.display = 'none';
  V.started = true;
  UI.helpOn = false;
  if (TEST !== '1' && TEST !== 'solo') NET.host.scenario(TEST, q);
  if (TEST === 'meshy')
    import('./views/meshy-test.js') // the Meshy bull beside ours
      .then((m) => m.startMeshyTest())
      .catch((err) => {
        console.warn('Meshy test failed', err);
        const el = document.getElementById('testcap');
        if (el) el.textContent = 'The Meshy test failed: ' + err.message;
      });
  if (TEST === 'fight') {
    V.yaw = 0;
    V.pitch = Math.atan2(groundAt(PLAYER.x, PLAYER.z - 80) + 1.2 - PLAYER.eye, 80);
  }
  if (Q.has('birds')) {
    spawnBirds('raven');
    spawnCrossing('jay');
    spawnCrossing('song');
    spawnCrossing('hawk');
    spawnFlock('goose', 10, { x: PLAYER.x - 300, y: 120, z: PLAYER.z - 250 }, 30);
  }
  if (Q.has('nograss')) camera.layers.disable(1);
  if (Q.has('yaw')) V.yaw = +Q.get('yaw');
  if (TEST !== 'fight' && Q.has('pitch')) V.pitch = +Q.get('pitch');
  V.fov = V.fovT = +(Q.get('fov') || 62);
  if (Q.has('debug')) {
    UI.debugOn = true;
    document.getElementById('debug').style.display = 'block';
  }
  if (NET.host.local) window.__log = NET.host.sim.log;
}

for (const b of GOS) b.addEventListener('click', () => enter(b));
async function enter(b) {
  if (b.disabled) return;
  if (built && b.dataset.map !== built) {
    // this page already holds another map: load it again (offline straight onto the new one; online back to this
    // screen, fresh, to press Go hunting again)
    const u = new URL(location.href);
    if (!SERVER || TEST) u.searchParams.set('at', b.dataset.map);
    location.replace(u);
    return;
  }
  if (!NET.host) go = b; // (once seated, only this map's button is live)
  // online: build the map and join this player's marsh first (Walking in…), then straight into it
  if (!NET.host && !(await joinOnline())) return;
  document.getElementById('start').classList.remove('bare');
  audioInit();
  if (A.ctx.state === 'suspended') A.ctx.resume();
  document.getElementById('start').style.display = 'none';
  UI.helpOn = false;
  if (!V.started) {
    V.started = true;
    showMsg('Listen. Scan the timber edges. Hold Space to call.', 6500);
  }
  try {
    const r = canvas.requestPointerLock();
    // refused, e.g. joining took too long after the click: the next click on the marsh captures the mouse
    if (r && r.catch) r.catch(() => showMsg('Click the marsh to look around. Hold Space to call.', 8000));
  } catch (e) {
    V.dragMode = true; // no mouse capture in this browser: drag to look around
  }
}
function onResize() {
  const w = innerWidth,
    h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const pr = renderer.getPixelRatio();
  reflRT && reflRT.setSize(Math.max(256, Math.floor(w * pr * 0.5)), Math.max(256, Math.floor(h * pr * 0.5)));
  layoutBinoc();
}
window.addEventListener('resize', onResize);

// birds are scenery: each browser makes its own (nothing in the marsh reacts to them)
const BIRD_T = {
  raven: rand(20, 60),
  duck: rand(180, 420),
  jay: rand(15, 45),
  song: rand(25, 70),
  hawk: rand(60, 160),
};
const BIRD_EVERY = { jay: [45, 120], song: [50, 130], hawk: [150, 360] };
function updateLocalWildlife(dt) {
  BIRD_T.raven -= dt;
  if (BIRD_T.raven < 0) {
    BIRD_T.raven = rand(35, 100);
    spawnBirds('raven');
  }
  for (const k in BIRD_EVERY) {
    BIRD_T[k] -= dt;
    if (BIRD_T[k] < 0) {
      BIRD_T[k] = rand(BIRD_EVERY[k][0], BIRD_EVERY[k][1]);
      spawnCrossing(k);
    }
  }
  BIRD_T.duck -= dt;
  if (BIRD_T.duck < 0) {
    BIRD_T.duck = rand(300, 600);
    spawnBirds('duck');
  }
  updateBirds(dt);
}
let othersAt = 0;
function updateOthers() {
  // top-left: where the other hunters are sitting (refreshed once a second, wall clock)
  const now = performance.now();
  if (now - othersAt < 1000) return;
  othersAt = now;
  const others = NET.hunters.filter((h) => h.id !== PLAYER.id);
  document.getElementById('others').textContent = others
    .map((h) => {
      const s = STANDS[h.stand];
      return `${h.name} · ${s.name} · ${bearingOf(s)}° ${Math.round(Math.hypot(s.x - PLAYER.x, s.z - PLAYER.z) * 1.0936)} yds`;
    })
    .join('\n');
}

let last = performance.now(),
  frameN = 0,
  autoT = 20;
const SPEED = TEST ? +(Q.get('speed') || 1) : 1;
function loop(now) {
  requestAnimationFrame(loop);
  if (!built || !sky) {
    last = now;
    return; // nothing to draw until a map is built
  }
  if (UI.paused) {
    // pause menu: nothing moves; draw again only if something changed (a new stand)
    last = now;
    if (UI.redraw) {
      UI.redraw = false;
      camera.rotation.set(V.pitch, V.yaw, 0);
      camera.updateMatrixWorld();
      sky.position.copy(camera.position);
      renderReflection();
      renderer.render(scene, camera);
    }
    return;
  }
  let dt = (now - last) / 1000;
  last = now;
  dt = clamp(dt, 0, 0.05) * SPEED;
  G.time += dt;
  frameN++;
  if (TEST && Q.has('autocall') && NET.host) {
    autoT -= dt;
    if (autoT < 0) {
      autoT = +Q.get('autocall') || 25;
      const nb = ANIMALS.find((a) => a.kind === 'bull');
      NET.host.call(nb && nb.dist() < 350 ? 'coax' : 'long', 4, '');
    }
  }
  U.time.value += dt;
  updateLull(dt); // the wind dropping away now and then: only for what is heard and seen (lull.js)
  const felt = WIND.gust * LULL.k;
  U.wind.value.set(((WIND.tx * WIND.speed) / 9) * felt, felt, ((WIND.tz * WIND.speed) / 9) * felt);
  // view: zoom, and a little hand shake through the binoculars
  const lf = Math.log(V.fov),
    lt = Math.log(V.fovT);
  V.fov = Math.exp(lf + (lt - lf) * Math.min(1, dt * 9));
  const zoom = smoothstep(30, 6, V.fov),
    t = G.time;
  const jy = (noise1(t * 0.55) * 0.0011 + noise1(t * 2.3 + 9) * 0.00025) * zoom,
    jp = (noise1(t * 0.6 + 40) * 0.0009 + noise1(t * 2.1 + 19) * 0.00022) * zoom + Math.sin(t * 0.9) * 0.0005;
  // no turning past the marsh (test views that aim the camera themselves are left alone)
  if (!(TEST && (Q.has('free') || Q.has('aim') || Q.has('yaw') || TEST === 'fight'))) clampLook(camera.aspect);
  camera.rotation.set(V.pitch + jp, V.yaw + jy, 0);
  camera.fov = V.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  // the marsh: host snapshot + events
  if (NET.host) {
    const { events, states } = NET.host.update(dt);
    for (const ev of events) handleEvent(ev);
    updateViews(dt, states);
  }
  if (TEST && Q.has('aim')) {
    const tg = ANIMALS.find((a) => a.kind === (Q.get('aim') === 'cow' ? 'cow' : 'bull') && a.placed);
    if (tg) {
      const dx = tg.x - PLAYER.x,
        dz = tg.z - PLAYER.z;
      V.yaw = Math.atan2(-dx, -dz);
      V.pitch = Math.atan2(groundAt(tg.x, tg.z) + 1.4 - PLAYER.eye, Math.hypot(dx, dz));
      V.fov = V.fovT = +(Q.get('fov') || 8);
      window.__aimed = (window.__aimed || 0) + 1;
    }
  }
  updateLocalWildlife(dt);
  updateFx();
  updateVapor(dt);
  if (A.ctx) {
    updateListener();
    updateAmbience(dt);
    for (const v of A.voices) v.update(dt);
  }
  updateHUD(dt);
  updateOthers();
  sky.position.copy(camera.position);
  if (frameN % 2 === 0) renderer.shadowMap.needsUpdate = true;
  if (TEST && Q.has('norender')) {
    if (frameN % 60 === 0) document.title = 'f' + frameN + ' t' + Math.round(G.time);
    return;
  }
  updatePlants3D(camera, V.fov);
  if (updateDeadwood) updateDeadwood(camera, V.fov);
  renderReflection();
  renderer.render(scene, camera);
}
init().catch((e) => {
  const el = document.getElementById('err');
  el.style.display = 'block';
  el.textContent += 'init: ' + e.message + '\n' + e.stack;
});
