// The screen after logging in (client/play/): My Character, Gear, Range and Cabin, then "Choose the animal to hunt.".
// Only Moose leads anywhere yet (a plain link to /hunting/, the moose screen); the others are picked (gold frame) and
// say they are coming soon. Needs a logged-in player with a confirmed email, like the game itself.
import { watchUser, logOut } from '../auth/auth.js';
import { site } from '../site.js';

const $ = (id) => document.getElementById(id);
let leaving = false;

watchUser((u) => {
  if (!u) {
    if (!leaving) location.replace(site('sign-in'));
    return;
  }
  if (!u.verified) {
    location.replace(site('confirm-email'));
    return;
  }
  $('in-name').textContent = u.name;
  $('in-email').textContent = u.email || '';
  $('start').classList.remove('loading');
  prefetchGame();
}).catch((e) => {
  // most likely no connection: say so, rather than quietly showing the log-in page
  $('playmsg').textContent =
    'Can’t reach the login service' +
    (e && e.message ? ` (${e.message})` : '') +
    '. Check your internet connection and reload.';
});

$('logout').addEventListener('click', async (e) => {
  e.preventDefault();
  leaving = true;
  try {
    await logOut();
  } catch (err) {}
  location.replace(site('sign-in'));
});

// a picture not built yet: mark it chosen and say so
const tiles = document.querySelectorAll('#hub .tile');
for (const t of tiles) {
  if (t.tagName === 'BUTTON') t.setAttribute('aria-pressed', 'false');
  t.addEventListener('click', () => {
    for (const o of tiles) if (o.hasAttribute('aria-pressed')) o.setAttribute('aria-pressed', 'false');
    $('soon').textContent = '';
    if (!t.dataset.soon) return; // Moose: the link does the rest
    t.setAttribute('aria-pressed', 'true');
    // set a moment after clearing, so a screen reader reads it again when the same picture is pressed twice
    setTimeout(() => ($('soon').textContent = t.dataset.soon + ' is coming soon.'), 50);
  });
}

// fetch the game in the background, so the moose screen opens quickly
function prefetchGame() {
  setTimeout(async () => {
    try {
      const game = site('hunting'),
        html = await (await fetch(game)).text();
      for (const [, href] of html.matchAll(/(?:src|href)="((?:\.\.?\/)+assets\/[^"]+\.(?:js|css))"/g)) {
        const l = document.createElement('link');
        l.rel = 'prefetch';
        l.href = new URL(href, game).href;
        document.head.appendChild(l);
      }
    } catch (e) {}
  }, 1000);
}
