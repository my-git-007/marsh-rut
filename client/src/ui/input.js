// ui/input.js — split out of the original single-file game (game.src.html)
import { clamp } from '../../../shared/util.js';
import { MIX, MIX_KEYS, setMix } from '../audio/audio.js';
import { startCall, setCallType, pour } from '../calls.js';
import { canvas } from '../render/core.js';
import { NET, UI } from '../state.js';

/* ================= input & view ================= */
const V = {
  yaw: 0,
  pitch: -0.035,
  fov: 62,
  fovT: 62,
  locked: false,
  drag: false,
  dragMode: false,
  lx: 0,
  ly: 0,
  prevFov: 62,
  started: false,
  sens: 1, // look sensitivity (Settings)
  invert: false, // invert up and down (Settings)
};
function setLook(dx, dy) {
  const k = 0.0022 * V.sens * (V.fov / 62);
  V.yaw -= dx * k;
  V.pitch = clamp(V.pitch - (V.invert ? -dy : dy) * k, -1.25, 0.95);
}
document.addEventListener('mousemove', (e) => {
  if (!V.started || UI.paused || (e.target && e.target.closest && e.target.closest('input,select,textarea'))) return;
  if (V.locked) setLook(e.movementX || 0, e.movementY || 0);
  else if (V.drag) {
    setLook(e.clientX - V.lx, e.clientY - V.ly);
    V.lx = e.clientX;
    V.ly = e.clientY;
  }
});
canvas.addEventListener('mousedown', (e) => {
  if (!V.started || (e.target && e.target.closest && e.target.closest('input,select,textarea'))) return;
  if (e.button === 2) {
    toggleBinos();
    return;
  }
  if (!V.locked) {
    if (!V.dragMode) {
      try {
        const r = canvas.requestPointerLock();
        if (r && r.catch) r.catch(() => {}); // e.g. too soon after Esc: dragging still looks around; the next click tries again
      } catch (err) {
        V.dragMode = true;
      }
    }
    V.drag = true;
    V.lx = e.clientX;
    V.ly = e.clientY;
  }
});
document.addEventListener('mouseup', () => {
  V.drag = false;
});
document.addEventListener('pointerlockchange', () => {
  V.locked = document.pointerLockElement === canvas; // losing it while playing opens the pause menu (ui/menu.js)
});
document.addEventListener('pointerlockerror', () => {}); // not captured this time; dragging with the button held still looks around
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener(
  'wheel',
  (e) => {
    if (!V.started || UI.paused || popupOpen()) return;
    e.preventDefault();
    V.fovT = clamp(V.fovT * Math.pow(1.0016, e.deltaY * (e.deltaMode === 1 ? 33 : 1)), 1.5, 70);
  },
  { passive: false },
);
function toggleBinos() {
  if (V.fovT > 20) {
    V.prevFov = V.fovT;
    V.fovT = 7;
  } else V.fovT = V.prevFov > 20 ? V.prevFov : 62;
}
const popupOpen = () => !!document.querySelector('dialog[open]'); // a start-screen pop-up (ui/start-screen.js)
window.addEventListener('keydown', (e) => {
  if (!V.started || UI.paused || (e.target && e.target.closest && e.target.closest('input,select,textarea'))) return;
  if (popupOpen()) {
    if (e.code === 'KeyH' && UI.toggleHowto) UI.toggleHowto(); // H closes the instructions again
    return;
  }
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) startCall();
  } else if (e.code === 'Digit1' || e.code === 'Numpad1') setCallType('long');
  else if (e.code === 'Digit2' || e.code === 'Numpad2') setCallType('coax');
  else if (e.code === 'KeyO' && !e.repeat) UI.openMenu ? UI.openMenu('m-set') : toggleMixer();
  else if (e.code === 'KeyV' && !e.repeat) pour();
  else if (e.code === 'KeyB') toggleBinos();
  else if (e.code === 'KeyH') {
    if (UI.toggleHowto) UI.toggleHowto(); // the Game Play Instructions pop-up
  } else if (e.code === 'KeyG') {
    UI.debugOn = !UI.debugOn;
    document.getElementById('debug').style.display = UI.debugOn ? 'block' : 'none';
  } else if ((e.code === 'KeyN' || e.code === 'KeyM') && UI.debugOn) {
    NET.host && NET.host.cmd(e.code === 'KeyN' ? 'newBull' : 'secondBull'); // solo play only
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') e.preventDefault();
});
function buildMixer() {
  const rows = document.getElementById('mixrows');
  rows.innerHTML = '';
  for (const [k, label] of MIX_KEYS) {
    const v = Math.round(MIX[k] * 100);
    const d = document.createElement('div');
    d.className = 'mx-row';
    d.innerHTML = `<label for="mix-${k}">${label}</label><input type="range" id="mix-${k}" min="0" max="150" step="5" value="${v}"><output for="mix-${k}">${v}%</output>`;
    rows.appendChild(d);
    const inp = d.querySelector('input'),
      out = d.querySelector('output');
    inp.addEventListener('input', () => {
      out.textContent = inp.value + '%';
      setMix(k, inp.value / 100);
    });
  }
}
function toggleMixer(show) {
  const el = document.getElementById('mixer');
  const open = show != null ? show : el.hidden;
  if (open) {
    buildMixer();
    el.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
  } else el.hidden = true;
}
document.getElementById('mixclose').addEventListener('click', () => toggleMixer(false));
function showMsg(t, ms = 5000) {
  const m = document.getElementById('msg');
  m.textContent = t;
  m.style.opacity = 1;
  clearTimeout(showMsg.h);
  showMsg.h = setTimeout(() => {
    m.style.opacity = 0;
  }, ms);
}

export { V, buildMixer, setLook, showMsg, toggleBinos, toggleMixer };
