// The account panel on the start screen: log in, create an account (then confirm the email), reset a password,
// and once logged in, who you are, a log-out link and the stand picker. main.js decides what happens when a
// logged-in player with a confirmed email is ready.
//
// Form conventions: labels above fields, hints under labels, errors under the field they belong to (and the
// field marked invalid for screen readers), one message box for everything else, the submit button says what
// it is doing while busy, Show/Hide on password fields, a Caps Lock warning.
import { FIREBASE, watchUser, logIn, signUp, resetPassword, logOut, currentUser, authMessage, resendConfirmation, recheckConfirmed,
  emailLink, forgetEmailLink, useEmailCode, checkResetCode, setNewPassword } from '../auth/auth.js';

const $ = (id) => document.getElementById(id);
const VIEWS = ['f-login', 'f-signup', 'f-forgot', 'f-newpass', 'v-verify', 'v-note', 'v-in'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
let onUser = () => {}, beforeLogout = async () => {}, linkBusy = false, pollTimer = 0, wasWaiting = false, leaving = false;

function show(v, keepMsg) {
  for (const id of VIEWS) $(id).hidden = id !== v;
  // account screens show only themselves; the logged-in view also shows the instructions and the play button
  if (v === 'v-in') delete document.body.dataset.acct; else document.body.dataset.acct = v;
  const view = $(v), box = $('acctmsg');
  view.insertBefore(box, view.querySelector('.primary') || null);   // messages sit just above the main button
  if (!keepMsg) say('');
  clearErrors(view);
  const first = view.querySelector('input'); if (first && v.startsWith('f-')) setTimeout(() => (first.value ? view.querySelector('input[type=password]') || first : first).focus(), 0);
}
export function say(text, kind = 'err') { const el = $('acctmsg'); el.textContent = text || ''; el.className = text ? kind : ''; }

// ---- field errors ----
function fieldError(id, text) {
  const input = $(id), err = $(id + '-err');
  input.setAttribute('aria-invalid', 'true'); if (err) err.textContent = text;
  const ids = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean)); ids.add(id + '-err');
  input.setAttribute('aria-describedby', [...ids].join(' '));
}
function clearErrors(root) {
  for (const i of root.querySelectorAll('[aria-invalid]')) i.removeAttribute('aria-invalid');
  for (const e of root.querySelectorAll('.ferr')) e.textContent = '';
}
// check a form's fields; returns true if fine, otherwise marks the fields and focuses the first bad one
function check(rules) {
  let first = null;
  for (const [id, test, text] of rules) if (!test($(id).value)) { fieldError(id, text); first = first || id; }
  if (first) { $(first).focus(); return false; }
  return true;
}
const filled = (v) => v.trim() !== '', isEmail = (v) => EMAIL_RE.test(v.trim());
// Firebase errors that belong to one field go under that field; the rest go in the message box
const FIELD_OF = {
  'auth/invalid-email': { 'f-login': 'li-email', 'f-signup': 'su-email', 'f-forgot': 'fp-email' },
  'auth/missing-email': { 'f-login': 'li-email', 'f-signup': 'su-email', 'f-forgot': 'fp-email' },
  'auth/email-already-in-use': { 'f-signup': 'su-email' },
  'auth/weak-password': { 'f-signup': 'su-pass', 'f-newpass': 'np-pass' },
  'auth/password-does-not-meet-requirements': { 'f-signup': 'su-pass', 'f-newpass': 'np-pass' },
  'auth/missing-password': { 'f-login': 'li-pass' },
};

// run an account action: button busy ("Logging in…"), errors in plain words
async function act(btn, fn, formId) {
  const label = btn.textContent; btn.disabled = true; if (btn.dataset.busy) btn.textContent = btn.dataset.busy; say('');
  if (formId) clearErrors($(formId));
  try { await fn(); return true; }
  catch (e) {
    const field = formId && FIELD_OF[e && e.code] && FIELD_OF[e.code][formId];
    if (field) { fieldError(field, authMessage(e)); $(field).focus(); } else say(authMessage(e));
    return false;
  } finally { btn.disabled = false; btn.textContent = label; }
}
const submitBtn = (form) => form.querySelector('button[type=submit]');

function render(user, keepMsg) {
  if (linkBusy) { onUser(null); return; }   // an email link is being handled: its own screen decides what comes next
  if (!$('v-note').hidden || !$('f-newpass').hidden) { onUser(null); return; }
  stopPoll();
  if (user && !user.verified) { $('vf-email').textContent = user.email; show('v-verify', keepMsg); onUser(null); startPoll(); return; }
  // the player confirmed in another tab of this browser (that tab logs out), so this one is logged out too
  if (!user && wasWaiting && !leaving) { wasWaiting = false; show('f-login'); say('Email confirmed? Sign in to play the game.', 'ok'); onUser(null); return; }
  wasWaiting = false;
  if (user) { $('in-name').textContent = user.name; $('in-email').textContent = user.email ? `(${user.email})` : ''; show('v-in', keepMsg); }
  else if (!$('f-signup').hidden || !$('f-forgot').hidden) { /* stay on the form they are filling in */ }
  else show('f-login', keepMsg);
  onUser(user);
}

// Show/Hide on password fields, and a Caps Lock warning while typing in one
// ---- waiting for the confirmation ----
// The confirm screen has no "I've confirmed" button: it checks by itself every few seconds, so a link opened on
// a phone or in another browser also counts.
function startPoll() {
  wasWaiting = true; if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (document.hidden || $('v-verify').hidden) return;
    try {
      const u = await recheckConfirmed();
      if (u && u.verified) { stopPoll(); wasWaiting = false; await logOut(); confirmedNote(u.email); }
    } catch (e) {}
  }, 5000);
}
function stopPoll() { clearInterval(pollTimer); pollTimer = 0; }

// ---- one message with one button (after an email link) ----
function note(title, text, button, then) {
  $('nt-title').textContent = title; $('nt-text').textContent = text; $('nt-go').textContent = button;
  $('nt-go').onclick = then; show('v-note'); onUser(null);
  setTimeout(() => $('nt-go').focus(), 0);
}
const toLogin = (email) => () => { show('f-login'); if (email) $('li-email').value = email; $('li-email').value ? $('li-pass').focus() : $('li-email').focus(); };
const confirmedNote = (email) => note('Email confirmed', 'Thank you! Your account is ready.', 'Sign in to play the game', toLogin(email));

async function handleEmailLink(link) {
  linkBusy = true; forgetEmailLink();
  $('nt-title').textContent = 'One moment…'; $('nt-text').textContent = ''; $('nt-go').hidden = true; show('v-note');
  try {
    if (link.mode === 'resetPassword') {
      const email = await checkResetCode(link.code);
      $('np-email').textContent = email; $('f-newpass').dataset.code = link.code; $('f-newpass').dataset.email = email;
      show('f-newpass');
    } else {
      const email = await useEmailCode(link.code);
      if (link.mode === 'verifyEmail') confirmedNote(email);
      else note('Email address restored', 'Your account’s email address has been changed back. If you didn’t ask for the change, reset your password too.', 'Sign in', toLogin(email));
    }
  } catch (e) {
    const used = e && (e.code === 'auth/invalid-action-code' || e.code === 'auth/expired-action-code');
    if (link.mode === 'resetPassword') note('This link doesn’t work any more', used ? 'Password reset links work once and expire after an hour. Ask for a new one.' : authMessage(e), 'Get a new link', () => show('f-forgot'));
    else note('This link doesn’t work any more', used ? 'It may already have been used: if you confirmed your email earlier, just sign in. If not, sign in and ask for a new confirmation email.' : authMessage(e), 'Sign in', toLogin(''));
  } finally { $('nt-go').hidden = false; linkBusy = false; }
}

function passwordHelpers() {
  for (const b of document.querySelectorAll('#acct .reveal')) b.addEventListener('click', () => {
    const input = $(b.getAttribute('aria-controls')), showing = input.type === 'text';
    input.type = showing ? 'password' : 'text'; b.textContent = showing ? 'Show' : 'Hide'; b.setAttribute('aria-pressed', String(!showing));
    b.setAttribute('aria-label', showing ? 'Show password' : 'Hide password'); input.focus();
  });
  for (const input of document.querySelectorAll('#acct input[type=password]')) {
    const caps = input.closest('.field').querySelector('.caps'); if (!caps) continue;
    const upd = (e) => { if (e.getModifierState) caps.hidden = !e.getModifierState('CapsLock'); };
    input.addEventListener('keydown', upd); input.addEventListener('keyup', upd); input.addEventListener('blur', () => { caps.hidden = true; });
  }
  for (const input of document.querySelectorAll('#acct input')) input.addEventListener('input', () => {   // fixing a field clears its error
    if (input.getAttribute('aria-invalid')) { input.removeAttribute('aria-invalid'); const e = $(input.id + '-err'); if (e) e.textContent = ''; }
  });
}

export function initAccount(cb, opts = {}) {
  onUser = cb; if (opts.beforeLogout) beforeLogout = opts.beforeLogout;
  $('acct').hidden = false;
  if (!FIREBASE) {   // local testing without Firebase: a name is enough (server must run with MARSH_AUTH=off)
    for (const el of document.querySelectorAll('.fb-only')) el.hidden = true;
    $('li-email-label').textContent = 'Name (test login)'; $('li-email').placeholder = 'Name (test login)'; $('li-email').type = 'text'; $('li-email').autocomplete = 'off';
  }
  passwordHelpers();
  for (const a of document.querySelectorAll('#acct [data-view]')) a.addEventListener('click', (e) => {
    e.preventDefault(); const carry = $('li-email').value || $('su-email').value;
    show(a.dataset.view);
    if (a.dataset.view === 'f-forgot' && !$('fp-email').value) $('fp-email').value = carry;
    if (a.dataset.view === 'f-login' && !$('li-email').value) $('li-email').value = carry;
  });
  $('f-login').addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(e.target); say('');
    const ok = FIREBASE
      ? check([['li-email', filled, 'Enter your email.'], ['li-email', (v) => !filled(v) || isEmail(v), 'Enter an email like name@example.com.'], ['li-pass', (v) => v !== '', 'Enter your password.']])
      : check([['li-email', filled, 'Enter a name.']]);
    if (!ok) return;
    if (await act(submitBtn(e.target), () => logIn($('li-email').value, $('li-pass').value), 'f-login')) {
      $('li-pass').value = ''; const u = currentUser();
      render(u); if (u && !u.verified) say('Your email isn’t confirmed yet. Open the link in the email we sent you, or send it again below.');
    }
  });
  $('f-signup').addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(e.target); say('');
    const p1 = $('su-pass').value;
    const ok = check([
      ['su-name', filled, 'Choose a hunter name.'],
      ['su-email', filled, 'Enter your email.'],
      ['su-email', (v) => !filled(v) || isEmail(v), 'Enter an email like name@example.com.'],
      ['su-pass', (v) => v.length >= 8, 'Use at least 8 characters.'],
      ['su-pass2', (v) => v === p1, 'The passwords don’t match.'],
    ]);
    if (!ok) return;
    if (await act(submitBtn(e.target), () => signUp($('su-name').value, $('su-email').value, p1), 'f-signup')) {
      $('su-pass').value = $('su-pass2').value = ''; $('f-signup').hidden = true;
      render(currentUser()); say('Account created. One more step: confirm your email.', 'ok');
    }
  });
  $('f-forgot').addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(e.target); say('');
    if (!check([['fp-email', filled, 'Enter your email.'], ['fp-email', (v) => !filled(v) || isEmail(v), 'Enter an email like name@example.com.']])) return;
    const email = $('fp-email').value.trim();
    if (await act(submitBtn(e.target), () => resetPassword(email), 'f-forgot')) {
      show('f-login'); $('li-email').value = email;
      say(`If there’s an account for ${email}, we’ve sent a link to choose a new password. Check your spam folder too.`, 'ok');
    }
  });
  $('f-newpass').addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(e.target); say('');
    const p1 = $('np-pass').value;
    if (!check([['np-pass', (v) => v.length >= 8, 'Use at least 8 characters.'], ['np-pass2', (v) => v === p1, 'The passwords don’t match.']])) return;
    const { code, email } = e.target.dataset;
    if (await act(submitBtn(e.target), () => setNewPassword(code, p1), 'f-newpass')) {
      $('np-pass').value = $('np-pass2').value = '';
      note('Password changed', 'Your new password is set.', 'Sign in to play the game', toLogin(email));
    }
  });
  $('vf-resend').addEventListener('click', async (e) => {
    if (await act(e.target, resendConfirmation)) say('Sent again. It can take a minute or two to arrive; check your spam folder too.', 'ok');
  });
  for (const id of ['logout', 'vf-logout']) $(id).addEventListener('click', async (e) => { e.preventDefault(); await logOutNow(); });
  show('f-login');
  const link = emailLink(); if (link) handleEmailLink(link);
  watchUser((u) => render(u, true)).catch((e) => say(authMessage(e)));
}
export async function logOutNow(message, kind = 'ok') {
  try { await beforeLogout(); } catch (e) {}
  leaving = true; stopPoll(); wasWaiting = false;
  await logOut(); leaving = false; $('f-signup').hidden = $('f-forgot').hidden = true; render(null); if (message) say(message, kind);
}
export function hideAccount() { $('acct').hidden = true; delete document.body.dataset.acct; }
