// The account panel on the start screen: log in, create an account (then confirm the email), forgot password,
// and once logged in, who you are, a log-out link and the stand picker. main.js decides what happens when a
// logged-in player with a confirmed email is ready.
import { FIREBASE, watchUser, logIn, signUp, resetPassword, logOut, currentUser, authMessage, resendConfirmation, recheckConfirmed } from '../auth/auth.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['f-login', 'f-signup', 'f-forgot', 'v-verify', 'v-in'];
let onUser = () => {}, beforeLogout = async () => {};

function show(v, keepMsg) {
  for (const id of VIEWS) $(id).hidden = id !== v;
  if (!keepMsg) say('');
  const first = $(v).querySelector('input'); if (first && v.startsWith('f-')) setTimeout(() => first.focus(), 0);
}
export function say(text, kind = 'err') { const el = $('acctmsg'); el.textContent = text || ''; el.className = kind; }
function render(user, keepMsg) {
  if (user && !user.verified) { $('vf-email').textContent = user.email; show('v-verify', keepMsg); onUser(null); return; }
  if (user) { $('in-name').textContent = user.name; $('in-email').textContent = user.email ? `(${user.email})` : ''; show('v-in', keepMsg); }
  else if (!$('f-signup').hidden || !$('f-forgot').hidden) { /* stay on the form they are filling in */ }
  else show('f-login', keepMsg);
  onUser(user);
}
// run an account action with the button disabled and errors shown in plain words
async function act(btn, fn) {
  btn.disabled = true; say('');
  try { await fn(); return true; } catch (e) { say(authMessage(e)); return false; } finally { btn.disabled = false; }
}
const submitBtn = (form) => form.querySelector('button[type=submit]');

export function initAccount(cb, opts = {}) {
  onUser = cb; if (opts.beforeLogout) beforeLogout = opts.beforeLogout;
  $('acct').hidden = false;
  if (!FIREBASE) {   // local testing without Firebase: a name is enough (server must run with MARSH_AUTH=off)
    for (const el of document.querySelectorAll('.fb-only')) el.hidden = true;
    $('li-email').type = 'text'; $('li-email').placeholder = 'any name (test login)'; $('li-email').autocomplete = 'off'; $('li-pass').required = false;
  }
  for (const a of document.querySelectorAll('#acct [data-view]')) a.addEventListener('click', (e) => { e.preventDefault(); show(a.dataset.view); if (a.dataset.view === 'f-forgot') $('fp-email').value = $('li-email').value; });
  $('f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await act(submitBtn(e.target), () => logIn($('li-email').value, $('li-pass').value))) {
      $('li-pass').value = ''; const u = currentUser();
      render(u); if (u && !u.verified) say('Your email isn’t confirmed yet. Click the link in the email we sent you, or send it again below.');
    }
  });
  $('f-signup').addEventListener('submit', async (e) => {
    e.preventDefault();
    if ($('su-name').value.trim() === '') { say('Choose a hunter name.'); return; }
    if ($('su-pass').value.length < 8) { say('Choose a longer password: at least 8 characters.'); return; }
    if ($('su-pass').value !== $('su-pass2').value) { say('The two passwords don’t match.'); return; }
    if (await act(submitBtn(e.target), () => signUp($('su-name').value, $('su-email').value, $('su-pass').value))) {
      $('su-pass').value = $('su-pass2').value = ''; $('f-signup').hidden = true;
      render(currentUser()); say('Account created. One more step: confirm your email.', 'ok');
    }
  });
  $('f-forgot').addEventListener('submit', async (e) => {
    e.preventDefault(); const email = $('fp-email').value.trim();
    if (await act(submitBtn(e.target), () => resetPassword(email))) {
      show('f-login'); $('li-email').value = email;
      say(`If there is an account for ${email}, a link to choose a new password is on its way. Check your spam folder too.`, 'ok');
    }
  });
  $('vf-done').addEventListener('click', async (e) => {
    let u = null;
    if (await act(e.target, async () => { u = await recheckConfirmed(); })) {
      if (u && u.verified) { render(u); say('Email confirmed. Welcome to the marsh.', 'ok'); }
      else say('Not confirmed yet. Click the link in the email (check spam too), then press this button again.');
    }
  });
  $('vf-resend').addEventListener('click', async (e) => {
    if (await act(e.target, resendConfirmation)) say('Sent again. It can take a minute or two; check your spam folder too.', 'ok');
  });
  for (const id of ['logout', 'vf-logout']) $(id).addEventListener('click', async (e) => { e.preventDefault(); await logOutNow(); });
  show('f-login');
  watchUser((u) => render(u, true)).catch((e) => say(authMessage(e)));
}
export async function logOutNow(message, kind = 'ok') {
  try { await beforeLogout(); } catch (e) {}
  await logOut(); $('f-signup').hidden = $('f-forgot').hidden = true; render(null); if (message) say(message, kind);
}
export function hideAccount() { $('acct').hidden = true; }
