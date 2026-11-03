// Hunting LTD — start-up and the frame loop.
// Builds the marsh, seats this player at a stand through a host (the simulation in this tab for solo play,
// or the marsh server for multiplayer), then every frame: take the host's snapshot and events, pose the
// animals, play the sounds, render.
import { clamp, smoothstep, noise1, rand } from '../../shared/util.js';
import { buildWorld, STANDS, groundAt } from '../../shared/world.js';
import { WIND } from '../../shared/wind.js';
import { renderer, scene, camera, canvas, U } from './render/core.js';
import { makeTextures } from './render/textures.js';
import { buildSky } from './render/sky.js';
import { buildTerrain } from './render/terrain.js';
import { buildWater, renderReflection, reflRT } from './render/water.js';
import { buildRidges } from './render/ridges.js';
import { buildGrass, buildForest, buildShrubs, buildStand } from './render/vegetation.js';
import { updateFx, updateVapor } from './render/fx.js';
import { spawnBirds, spawnFlock, updateBirds } from './render/birds.js';
import { loadRefAssets } from './models/ref-bull.js';
import { A, audioInit, updateAmbience, updateListener } from './audio/audio.js';
import { V, showMsg } from './ui/input.js';
import { layoutBinoc, updateHUD } from './ui/hud.js';
import { updateCallLabel } from './calls.js';
import { LocalHost, RemoteHost } from './net/hosts.js';
import { initAccount, hideAccount, logOutNow, say } from './ui/account.js';
import { watchIdle } from './ui/idle.js';
import { initMenu, note as menuNote } from './ui/menu.js';
import { getToken } from './auth/auth.js';
import { handleEvent, updateViews } from './views/world-events.js';
import { ANIMALS, G, NET, PLAYER, Q, TEST, UI, bearingOf } from './state.js';

window.addEventListener('error', (e) => { const el = document.getElementById('err'); el.style.display = 'block'; el.textContent += (e.message || String(e)) + ' @' + (e.filename || '').split('/').pop() + ':' + (e.lineno || '?') + '\n'; });
window.__log = [];
window.__marsh = { NET, PLAYER, ANIMALS, G, V, UI, A };   // for tests and the console

// Online when a server is configured (?server=wss://… or VITE_SERVER_URL at build time): players log in and
// the server runs each player's own marsh. Otherwise (or with ?solo) the marsh runs in this tab, no account.
const SERVER = Q.has('solo') ? '' : Q.get('server') || import.meta.env.VITE_SERVER_URL || '';
const SHOWCASE = Q.has('showcase') || /showcase/.test(location.hash);
const go = document.getElementById('go');
const st = (t) => { go.textContent = t; };
const netMsg = (t) => { document.getElementById('netmsg').textContent = t || ''; };
const tick = () => new Promise((r) => setTimeout(r, 0));
let sky = null, grassBuilt = false, USER = null;

async function init() {
  // the page starts on the sign-in card (index.html), so players never see the old start card while the marsh builds;
  // solo and test runs have no accounts, so they hide it at once
  if (!(SERVER && !TEST)) hideAccount();
  st('Painting textures…'); await tick(); makeTextures(); await loadRefAssets();
  st('Shaping the marsh…'); await tick(); buildWorld(); Object.assign(PLAYER, { x: STANDS[0].x, z: STANDS[0].z, y: STANDS[0].y, eye: STANDS[0].eye, yaw: STANDS[0].yaw }); buildTerrain(); await tick(); sky = buildSky(); buildRidges(); buildWater();
  st('Planting forest…'); await tick(); buildForest(); buildShrubs(); buildStand();
  layoutBinoc(); onResize(); updateCallLabel();
  const sel = document.getElementById('pstand');
  sel.innerHTML = STANDS.map((s) => `<option value="${s.i}">${s.name}</option>`).join('');
  try { sel.value = localStorage.getItem('marshrut-stand') || '0'; } catch (e) {}
  if (SERVER && !TEST) {
    go.hidden = true; st('Into the marsh'); go.disabled = false;
    initAccount((user) => { USER = user; go.hidden = !user; if (!user) netMsg(''); }, { beforeLogout: async () => { if (NET.host) NET.host.leave(); } });
    try { const m = sessionStorage.getItem('marshrut-msg'); if (m) { sessionStorage.removeItem('marshrut-msg'); say(m, 'ok'); } } catch (e) {}
    watchIdle({
      onWarn: (s) => { if (!USER) return; const t = `Still there? You’ll be logged out in ${s} seconds unless you move the mouse.`; showMsg(t, 60000); if (!NET.host) say(t); if (UI.paused) menuNote(t); },
      onBack: () => { showMsg('', 1); if (!NET.host) say(''); if (UI.paused) menuNote(''); },
      onIdle: () => { if (USER || NET.host) idleLogout(); },
      tellServer: () => { if (NET.host) NET.host.active(); },
    });
  } else {
    await seat(new LocalHost({ log: !!TEST }), 'You', Q.has('stand') ? +Q.get('stand') : 0);
    st('Climb into the stand'); go.disabled = false;
  }
  initMenu({ online: !!(SERVER && !TEST), user: () => USER, onMoved: changedStand, onExit: exitGame });
  requestAnimationFrame(loop);
}

// Change location (pause menu): the host has moved this hunter; move the camera and regrow the grass around the new stand
async function changedStand(you) {
  Object.assign(PLAYER, { stand: you.stand, x: you.x, z: you.z, y: you.y, eye: you.eye, yaw: you.yaw });
  camera.position.set(PLAYER.x, PLAYER.eye, PLAYER.z); V.yaw = PLAYER.yaw; V.pitch = -0.035;
  try { localStorage.setItem('marshrut-stand', String(you.stand)); } catch (e) {}
  await tick(); buildGrass();
  renderer.shadowMap.needsUpdate = true; UI.redraw = true;
}
// Exit game (pause menu): online, leave the marsh and log out; offline, back to the start
async function exitGame() {
  if (SERVER && !TEST) {
    try { sessionStorage.setItem('marshrut-msg', 'You’ve left the marsh. Log in to go back.'); } catch (e) {}
    try { await logOutNow(); } catch (e) {}
  }
  location.reload();
}

// put this player in a stand and finish the bits of the world that depend on where they sit
async function seat(host, name, stand) {
  const { you, hunters } = await host.join(name, stand);
  NET.host = host; NET.hunters = hunters;
  Object.assign(PLAYER, { id: you.id, name: you.name, stand: you.stand, x: you.x, z: you.z, y: you.y, eye: you.eye, yaw: you.yaw });
  camera.position.set(PLAYER.x, PLAYER.eye, PLAYER.z); V.yaw = PLAYER.yaw;
  if (!host.local) {
    host.onHunters = (list) => {
      const before = new Set(NET.hunters.map((h) => h.id)); NET.hunters = list;
      for (const h of list) if (!before.has(h.id)) showMsg(`${h.name} climbed into the ${STANDS[h.stand].name} stand`, 4000);
    };
    host.onClose = (why) => { if (why === 'idle') idleLogout(); else showMsg((why || 'Lost the connection to the marsh server.') + ' Reload the page to go back in.', 600000); };
  }
  if (!grassBuilt) { grassBuilt = true; st('Growing grass…'); await tick(); buildGrass(); }
  if (TEST) setupTest();
  else if (SHOWCASE && host.local) { host.scenario('showcase', () => null); V.yaw = PLAYER.yaw; }
  renderer.shadowMap.needsUpdate = true;
}

// 10 minutes without touching mouse or keyboard: log out, close the marsh, and start over at the login screen
let leaving = false;
async function idleLogout() {
  if (leaving) return; leaving = true;
  try { sessionStorage.setItem('marshrut-msg', 'You were logged out after 10 minutes without activity. Log in to go back to the marsh.'); } catch (e) {}
  try { await logOutNow(); } catch (e) {}
  location.reload();
}

async function joinOnline() {
  if (!USER) return false;
  const stand = +document.getElementById('pstand').value || 0;
  try { localStorage.setItem('marshrut-stand', String(stand)); } catch (e) {}
  go.disabled = true; st('Walking in…'); netMsg('Opening your marsh…');
  try {
    await seat(new RemoteHost(SERVER, getToken), USER.name, stand);
    netMsg(`Your marsh is ready. You are in the ${STANDS[PLAYER.stand].name} stand.`);
    return true;
  } catch (e) {
    netMsg(e.message); st('Into the marsh'); go.disabled = false; return false;
  }
}

function setupTest() {
  const q = (k) => Q.get(k);
  document.getElementById('start').style.display = 'none'; V.started = true; UI.helpOn = false;
  if (TEST !== '1' && TEST !== 'solo') NET.host.scenario(TEST, q);
  if (TEST === 'fight') { V.yaw = 0; V.pitch = Math.atan2(groundAt(PLAYER.x, PLAYER.z - 80) + 1.2 - PLAYER.eye, 80); }
  if (Q.has('birds')) { spawnBirds('raven'); spawnFlock('goose', 10, { x: PLAYER.x - 300, y: 120, z: PLAYER.z - 250 }, 30); }
  if (Q.has('nograss')) camera.layers.disable(1);
  if (Q.has('yaw')) V.yaw = +Q.get('yaw');
  if (TEST !== 'fight') V.pitch = +(Q.get('pitch') || -0.035);
  V.fov = V.fovT = +(Q.get('fov') || 62);
  if (Q.has('debug')) { UI.debugOn = true; document.getElementById('debug').style.display = 'block'; }
  if (NET.host.local) window.__log = NET.host.sim.log;
}

go.addEventListener('click', async () => {
  if (!NET.host) { if (!(await joinOnline())) return; st('Climb into the stand'); go.disabled = false; hideAccount(); return; }
  audioInit(); if (A.ctx.state === 'suspended') A.ctx.resume();
  document.getElementById('start').style.display = 'none'; UI.helpOn = false;
  if (!V.started) { V.started = true; showMsg('Listen. Scan the timber edges. Hold Space to call.', 6500); }
  try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => { V.dragMode = true; }); } catch (e) { V.dragMode = true; }
});
function onResize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  const pr = renderer.getPixelRatio(); reflRT && reflRT.setSize(Math.max(256, Math.floor(w * pr * 0.5)), Math.max(256, Math.floor(h * pr * 0.5))); layoutBinoc();
}
window.addEventListener('resize', onResize);

// birds are scenery: each browser makes its own (nothing in the marsh reacts to them)
const BIRD_T = { raven: rand(40, 120), duck: rand(180, 420) };
function updateLocalWildlife(dt) {
  BIRD_T.raven -= dt; if (BIRD_T.raven < 0) { BIRD_T.raven = rand(60, 180); spawnBirds('raven'); }
  BIRD_T.duck -= dt; if (BIRD_T.duck < 0) { BIRD_T.duck = rand(300, 600); spawnBirds('duck'); }
  updateBirds(dt);
}
let othersAt = 0;
function updateOthers() {   // top-left: where the other hunters are sitting (refreshed once a second, wall clock)
  const now = performance.now(); if (now - othersAt < 1000) return; othersAt = now;
  const others = NET.hunters.filter((h) => h.id !== PLAYER.id);
  document.getElementById('others').textContent = others.map((h) => { const s = STANDS[h.stand]; return `${h.name} · ${s.name} · ${bearingOf(s)}° ${Math.round(Math.hypot(s.x - PLAYER.x, s.z - PLAYER.z) * 1.0936)} yds`; }).join('\n');
}

let last = performance.now(), frameN = 0, autoT = 20;
const SPEED = TEST ? +(Q.get('speed') || 1) : 1;
function loop(now) {
  requestAnimationFrame(loop);
  if (UI.paused) {   // pause menu: nothing moves; draw again only if something changed (a new stand)
    last = now;
    if (UI.redraw) { UI.redraw = false; camera.rotation.set(V.pitch, V.yaw, 0); camera.updateMatrixWorld(); sky.position.copy(camera.position); renderReflection(); renderer.render(scene, camera); }
    return;
  }
  let dt = (now - last) / 1000; last = now; dt = clamp(dt, 0, 0.05) * SPEED; G.time += dt; frameN++;
  if (TEST && Q.has('autocall') && NET.host) { autoT -= dt; if (autoT < 0) { autoT = +Q.get('autocall') || 25; const nb = ANIMALS.find((a) => a.kind === 'bull'); NET.host.call(nb && nb.dist() < 350 ? 'coax' : 'long', 4, ''); } }
  U.time.value += dt; U.wind.value.set((WIND.tx * WIND.speed) / 9 * WIND.gust, WIND.gust, (WIND.tz * WIND.speed) / 9 * WIND.gust);
  // view: zoom, and a little hand shake through the binoculars
  const lf = Math.log(V.fov), lt = Math.log(V.fovT); V.fov = Math.exp(lf + (lt - lf) * Math.min(1, dt * 9));
  const zoom = smoothstep(30, 6, V.fov), t = G.time;
  const jy = (noise1(t * 0.55) * 0.0011 + noise1(t * 2.3 + 9) * 0.00025) * zoom, jp = (noise1(t * 0.6 + 40) * 0.0009 + noise1(t * 2.1 + 19) * 0.00022) * zoom + Math.sin(t * 0.9) * 0.0005;
  camera.rotation.set(V.pitch + jp, V.yaw + jy, 0); camera.fov = V.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  // the marsh: host snapshot + events
  if (NET.host) {
    const { events, states } = NET.host.update(dt);
    for (const ev of events) handleEvent(ev);
    updateViews(dt, states);
  }
  if (TEST && Q.has('aim')) {
    const tg = ANIMALS.find((a) => a.kind === (Q.get('aim') === 'cow' ? 'cow' : 'bull') && a.placed);
    if (tg) { const dx = tg.x - PLAYER.x, dz = tg.z - PLAYER.z; V.yaw = Math.atan2(-dx, -dz); V.pitch = Math.atan2(groundAt(tg.x, tg.z) + 1.4 - PLAYER.eye, Math.hypot(dx, dz)); V.fov = V.fovT = +(Q.get('fov') || 8); window.__aimed = (window.__aimed || 0) + 1; }
  }
  updateLocalWildlife(dt); updateFx(); updateVapor(dt);
  if (A.ctx) { updateListener(); updateAmbience(dt); for (const v of A.voices) v.update(dt); }
  updateHUD(dt); updateOthers();
  sky.position.copy(camera.position);
  if (frameN % 2 === 0) renderer.shadowMap.needsUpdate = true;
  if (TEST && Q.has('norender')) { if (frameN % 60 === 0) document.title = 'f' + frameN + ' t' + Math.round(G.time); return; }
  renderReflection(); renderer.render(scene, camera);
}
init().catch((e) => { const el = document.getElementById('err'); el.style.display = 'block'; el.textContent += 'init: ' + e.message + '\n' + e.stack; });
