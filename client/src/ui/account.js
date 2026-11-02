// The account panel on the start screen: log in, create an account, forgot password, and once logged in,
// who you are, a log-out link and the stand picker. main.js decides what happens when someone is logged in.
import { FIREBASE, watchUser, logIn, signUp, resetPassword, logOut, currentUser, authMessage } from '../auth/auth.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['f-login', 'f-signup', 'f-forgot', 'v-in'];
let onUser = () => {};

function show(v) {
  for (const id of VIEWS) $(id).hidden = id !== v;
  say('');
  const first = $(v).querySelector('input'); if (first && v !== 'v-in') setTimeout(() => first.focus(), 0);
}
function say(text, kind = 'err') { const el = $('acctmsg'); el.textContent = text || ''; el.className = kind; }
function render(user) {
  if (user) { $('in-name').textContent = user.name; $('in-email').textContent = user.email ? `(${user.email})` : ''; show('v-in'); }
  else if (!$('f-signup').hidden || !$('f-forgot').hidden) { /* stay on the form they are filling in */ }
  else show('f-login');
  onUser(user);
}
// run an account action with the form's button disabled and errors shown in plain words
async function act(form, fn) {
  const btn = form.querySelector('button[type=submit]'); btn.disabled = true; say('');
  try { await fn(); return true; } catch (e) { say(authMessage(e)); return false; } finally { btn.disabled = false; }
}

export function initAccount(cb) {
  onUser = cb;
  $('acct').hidden = false;
  if (!FIREBASE) {   // local testing without Firebase: a name is enough (server must run with MARSH_AUTH=off)
    for (const el of document.querySelectorAll('.fb-only')) el.hidden = true;
    $('li-email').type = 'text'; $('li-email').placeholder = 'any name (test login)'; $('li-email').autocomplete = 'off'; $('li-pass').required = false;
  }
  for (const a of document.querySelectorAll('#acct [data-view]')) a.addEventListener('click', (e) => { e.preventDefault(); show(a.dataset.view); if (a.dataset.view === 'f-forgot') $('fp-email').value = $('li-email').value; });
  $('f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await act(e.target, () => logIn($('li-email').value, $('li-pass').value))) { $('li-pass').value = ''; render(currentUser()); }
  });
  $('f-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('su-pass').value !== $('su-pass2').value) { say('The two passwords don’t match.'); return; }
    if (await act(e.target, () => signUp($('su-name').value, $('su-email').value, $('su-pass').value))) {
      $('su-pass').value = $('su-pass2').value = ''; $('f-signup').hidden = true; render(currentUser());
    }
  });
  $('f-forgot').addEventListener('submit', async (e) => {
    e.preventDefault(); const email = $('fp-email').value.trim();
    if (await act(e.target, () => resetPassword(email))) {
      show('f-login'); $('li-email').value = email;
      say(`If there is an account for ${email}, a link to choose a new password is on its way. Check your spam folder too.`, 'ok');
    }
  });
  $('logout').addEventListener('click', async (e) => { e.preventDefault(); await logOut(); show('f-login'); render(null); });
  show('f-login');
  watchUser(render).catch((e) => say(authMessage(e)));
}
export function hideAccount() { $('acct').hidden = true; }
