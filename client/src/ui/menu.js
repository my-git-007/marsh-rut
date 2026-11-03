// The pause menu (Esc). While it is open everything stops: the picture, every sound (the audio context is
// suspended) and, online, the player's marsh on the server. Items: Resume, Change location, Settings, Contact,
// Exit game.
//
// Esc and the browser: while the mouse is captured for looking around, the browser keeps Esc for itself (it
// releases the mouse). So the menu opens whenever the mouse is released while playing (Esc, switching windows),
// and Esc pressed while the menu is open goes back a step or resumes.
import { STANDS } from '../../../shared/world.js';
import { A, MIX, MIX_KEYS, setMix } from '../audio/audio.js';
import { canvas } from '../render/core.js';
import { NET, PLAYER, UI } from '../state.js';
import { V } from './input.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['m-main', 'm-loc', 'm-set', 'm-contact', 'm-exit'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let opts = { onMoved: async () => {}, onExit: async () => {}, user: () => null, online: false };
let openedAt = 0, view = 'm-main';

// ---- look settings (saved on this device) ----
const LOOK_KEY = 'marshrut-look';
function loadLook() {
  try { const s = JSON.parse(localStorage.getItem(LOOK_KEY) || '{}'); if (s.sens > 0) V.sens = s.sens; V.invert = !!s.invert; } catch (e) {}
}
function saveLook() { try { localStorage.setItem(LOOK_KEY, JSON.stringify({ sens: V.sens, invert: V.invert })); } catch (e) {} }

function show(v) {
  view = v;
  for (const id of VIEWS) $(id).hidden = id !== v;
  if (v === 'm-loc') buildStands();
  if (v === 'm-set') buildSettings();
  if (v === 'm-contact') prepContact();
  const first = $(v).querySelector(v === 'm-main' ? '#m-resume' : v === 'm-contact' ? 'input, textarea' : '.mlist button:not([disabled]), input, .primary, .back');
  if (first) setTimeout(() => first.focus(), 0);
}

export function openMenu(v = 'm-main') {
  if (!V.started) return;
  if (!UI.paused) {
    UI.paused = true; openedAt = performance.now();
    if (A.ctx && A.ctx.state === 'running') A.ctx.suspend();
    if (NET.host) NET.host.pause();
    if (document.pointerLockElement) document.exitPointerLock();
    document.body.classList.add('menu-open');
    $('menu').hidden = false; note('');
  }
  show(v);
}
export function resumeGame() {
  if (!UI.paused) return;
  $('menu').hidden = true; document.body.classList.remove('menu-open');
  UI.paused = false;
  if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  if (NET.host) NET.host.resume();
  if (!V.dragMode && canvas.requestPointerLock) {   // capture the mouse again (needs this click or key press)
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {}
  }
}
export function note(text) { $('m-note').textContent = text || ''; }

// ---- change location ----
function buildStands() {
  const box = $('m-stands'); box.innerHTML = ''; $('m-loc-msg').textContent = '';
  for (const s of STANDS) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'mitem';
    const here = s.i === PLAYER.stand;
    b.innerHTML = `${s.name}<span>${here ? 'You are here' : 'Move here'}</span>`;
    if (here) { b.setAttribute('aria-current', 'true'); b.disabled = true; b.style.cursor = 'default'; }
    b.addEventListener('click', () => moveTo(s));
    box.appendChild(b);
  }
}
async function moveTo(s) {
  const msg = $('m-loc-msg'), buttons = [...$('m-stands').querySelectorAll('button')];
  buttons.forEach((b) => { b.disabled = true; });
  msg.className = 'mmsg info'; msg.textContent = `Climbing down and walking to the ${s.name} stand…`;
  try {
    const you = await NET.host.moveTo(s.i);
    await opts.onMoved(you);
    show('m-main'); note(`You’re now in the ${s.name} stand.`);
  } catch (e) {
    buildStands(); $('m-loc-msg').className = 'mmsg'; $('m-loc-msg').textContent = e.message || 'Couldn’t move. Try again.';
  }
}

// ---- settings ----
function buildSettings() {
  const box = $('m-mix'); box.innerHTML = '';
  for (const [k, label] of MIX_KEYS) {
    const v = Math.round(MIX[k] * 100), row = document.createElement('div');
    row.className = 'srow';
    row.innerHTML = `<label for="set-mix-${k}">${label}</label><input type="range" id="set-mix-${k}" min="0" max="150" step="5" value="${v}"><output for="set-mix-${k}">${v}%</output>`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.addEventListener('input', () => { out.textContent = inp.value + '%'; setMix(k, inp.value / 100); });
    box.appendChild(row);
  }
  $('set-sens').value = Math.round(V.sens * 100); $('set-sens-out').textContent = Math.round(V.sens * 100) + '%';
  $('set-invert').checked = !!V.invert;
}

// ---- contact ----
function prepContact() {
  const u = opts.user() || {};
  if (!$('ct-name').value) $('ct-name').value = u.name || '';
  if (!$('ct-email').value) $('ct-email').value = u.email || '';
  $('ct-msg').textContent = '';
}
function fieldError(id, text) {
  const input = $(id); input.setAttribute('aria-invalid', 'true'); $(id + '-err').textContent = text;
  input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), id + '-err'].filter(Boolean).join(' '));
}
function clearErrors() {
  for (const i of $('f-contact').querySelectorAll('[aria-invalid]')) i.removeAttribute('aria-invalid');
  for (const e of $('f-contact').querySelectorAll('.ferr')) e.textContent = '';
  $('ct-msg').textContent = '';
}
const CONTACT_REASON = {
  off: 'The contact form isn’t switched on yet. Please try again later.',
  limit: 'You’ve sent several messages recently. Please try again in an hour.',
  failed: 'Your message couldn’t be sent just now. Please try again in a few minutes.',
  offline: 'The contact form works when you play online.',
};
async function sendContact(e) {
  e.preventDefault(); clearErrors();
  const name = $('ct-name').value.trim(), email = $('ct-email').value.trim(), message = $('ct-message').value.trim();
  let first = null;
  if (!name) { fieldError('ct-name', 'Enter your name.'); first = first || 'ct-name'; }
  if (!EMAIL_RE.test(email)) { fieldError('ct-email', email ? 'Enter an email like name@example.com.' : 'Enter your email.'); first = first || 'ct-email'; }
  if (message.length < 2) { fieldError('ct-message', 'Write a message.'); first = first || 'ct-message'; }
  if (first) { $(first).focus(); return; }
  const btn = $('f-contact').querySelector('.primary'), label = btn.textContent;
  btn.disabled = true; btn.textContent = btn.dataset.busy;
  try {
    const r = await NET.host.contact({ name, email, message });
    if (r.ok) {
      $('f-contact').hidden = true; $('ct-done').hidden = false; $('ct-done-email').textContent = email; $('ct-message').value = '';
      $('ct-another').focus();
    } else if (r.reason === 'invalid' && r.field) {
      const id = 'ct-' + r.field; fieldError(id, r.field === 'email' ? 'Enter an email like name@example.com.' : r.field === 'name' ? 'Enter your name.' : 'Write a message.'); $(id).focus();
    } else $('ct-msg').textContent = CONTACT_REASON[r.reason] || CONTACT_REASON.failed;
  } catch (err) {
    $('ct-msg').textContent = err.message || CONTACT_REASON.failed;
  } finally { btn.disabled = false; btn.textContent = label; }
}

export function initMenu(o = {}) {
  Object.assign(opts, o); loadLook(); UI.openMenu = openMenu;
  for (const b of document.querySelectorAll('#menu [data-go]')) b.addEventListener('click', () => show(b.dataset.go));
  $('m-resume').addEventListener('click', resumeGame);
  $('set-sens').addEventListener('input', (e) => { V.sens = e.target.value / 100; $('set-sens-out').textContent = e.target.value + '%'; saveLook(); });
  $('set-invert').addEventListener('change', (e) => { V.invert = e.target.checked; saveLook(); });
  $('f-contact').addEventListener('submit', sendContact);
  for (const id of ['ct-name', 'ct-email', 'ct-message']) $(id).addEventListener('input', () => { $(id).removeAttribute('aria-invalid'); $(id + '-err').textContent = ''; });
  $('ct-another').addEventListener('click', () => { $('ct-done').hidden = true; $('f-contact').hidden = false; $('ct-message').focus(); });
  $('m-exit-yes').addEventListener('click', async (e) => { e.target.disabled = true; e.target.textContent = 'Leaving…'; await opts.onExit(); });
  if (!opts.online) $('m-exit-text').textContent = 'Leave the marsh and go back to the start screen?';
  // the mouse was released while playing (Esc, or switching to another window): pause
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && V.started && !UI.paused && !V.dragMode && !UI.helpOn) openMenu();
  });
  // Esc when the mouse isn't captured (menu open, or a browser without mouse capture)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !V.started) return;
    if (!UI.paused) { if (!UI.helpOn) { e.preventDefault(); openMenu(); } return; }
    if (performance.now() - openedAt < 400) return;   // the same Esc that just released the mouse
    e.preventDefault();
    if (view !== 'm-main') show('m-main'); else resumeGame();
  }, true);
}
