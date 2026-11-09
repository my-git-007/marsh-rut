// The game's start screen (client/hunting/): Back, How to play and Game Settings at the top, then "Choose your
// hunting grounds" with one picture button per location (details link, Go hunting), then who's logged in.
// One spot per location for now: The Marsh always starts at the South knoll stand.
// Built when this module loads, before src/main.js looks up #go (The Marsh's button).
// The pop-ups are <dialog>s in hunting/index.html. In the marsh, H opens the instructions (UI.toggleHowto).
import { LOCATIONS } from '../locations.js';
import { canvas } from '../render/core.js';
import { UI } from '../state.js';
import { V, showMsg } from './input.js';
import { prepSettings, wireSettings } from './menu.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pic = (l) => `../locations/${l.id}.webp`;

function buildGrid() {
  const box = $('locs');
  box.innerHTML = LOCATIONS.map((l) => {
    const marsh = l.id === 'the-marsh';
    const go = marsh
      ? '<button type="button" id="go" class="hunt" disabled>Go hunting</button>'
      : '<button type="button" class="hunt" disabled title="Coming soon">Go hunting</button>';
    return `<section class="loc" data-loc="${l.id}" aria-labelledby="ln-${l.id}">
  <button type="button" class="loc-pic" aria-pressed="false" aria-label="Choose ${esc(l.name)}"><img src="${pic(l)}" alt="" width="133" height="160" loading="lazy"></button>
  <div class="loc-side">
    <h3 class="loc-name" id="ln-${l.id}">${esc(l.name)}</h3>
    <p class="loc-detail"><span class="loc-arrow" aria-hidden="true">&gt;</span> <button type="button" class="loc-more">Location details</button></p>
    <div class="loc-row">${go}</div>
    ${marsh ? '<div id="netmsg" role="status"></div>' : ''}
  </div>
</section>`;
  }).join('');
  for (const s of box.querySelectorAll('.loc')) {
    const l = LOCATIONS.find((x) => x.id === s.dataset.loc);
    s.querySelector('.loc-pic').addEventListener('click', () => choose(s));
    s.querySelector('.loc-more').addEventListener('click', () => details(l));
  }
}
// picking a picture marks that location as chosen (the gold frame stays) and moves to its Go hunting button
function choose(sec) {
  for (const b of document.querySelectorAll('#locs .loc-pic')) b.setAttribute('aria-pressed', 'false');
  sec.querySelector('.loc-pic').setAttribute('aria-pressed', 'true');
  const go = sec.querySelector('.hunt');
  if (go && !go.disabled) go.focus();
}
function details(l) {
  $('dl-title').textContent = l.name;
  $('dl-img').src = pic(l);
  $('dl-about').textContent = l.about;
  $('dl-status').textContent = l.open
    ? 'Open now. Press Go hunting.'
    : 'This location is still being built. It will open in a later update.';
  open('dlg-loc');
}

function open(id) {
  const d = $(id);
  if (!d.open) d.showModal();
}
// the instructions in the marsh (H): the mouse is let go while they're open, and taken back when they close
function toggleHowto() {
  const d = $('dlg-howto');
  if (d.open) {
    d.close();
    return backToMarsh(); // at once: the close event comes a frame later
  }
  UI.helpOn = true; // so letting go of the mouse doesn't open the pause menu (ui/menu.js)
  if (document.pointerLockElement) document.exitPointerLock();
  open('dlg-howto');
}

buildGrid();
for (const d of document.querySelectorAll('dialog.dlg')) {
  d.querySelector('.dlg-x').addEventListener('click', () => d.close());
  // a click on the dark area around the box closes it (not one on the box's own padding)
  d.addEventListener('click', (e) => {
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  });
}
$('open-howto').addEventListener('click', () => open('dlg-howto'));
$('open-settings').addEventListener('click', () => {
  prepSettings('gs', 'gs-mix');
  open('dlg-settings');
});
wireSettings('gs');
const clickHint = () => showMsg('Click the marsh to look around again.', 5000);
// the instructions closed in the marsh (H, Esc, × or a click outside): back to the game
function backToMarsh() {
  if (!V.started || !UI.helpOn) return;
  UI.helpOn = false;
  if (!V.dragMode) {
    try {
      // works after a click or H; after Esc the browser refuses, and a click on the marsh takes the mouse
      const r = canvas.requestPointerLock();
      if (r && r.catch) r.catch(clickHint);
    } catch (e) {
      clickHint();
    }
  }
}
$('dlg-howto').addEventListener('close', backToMarsh);
UI.toggleHowto = toggleHowto;
