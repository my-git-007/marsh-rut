// The account pages, one folder each with an index.html (the game itself is /hunting/):
//   /                   log in (client/index.html)
//   /create-account/    create an account, then /confirm-email/
//   /forgot-password/   ask for a reset link
//   /reset-password/    the reset email's link lands here: choose a new password
//   /confirm-email/     "check your email" while waiting, and where the confirmation email's link lands
// <body data-page="..."> says which page this is. A note can travel to the next page (sessionStorage): a message to
// show, and the email to fill in.
//
// Form conventions: labels for screen readers, hints under the field, errors under the field they belong to (and
// the field marked invalid), one message box for everything else, the submit button says what it is doing while
// busy, an eye to show the password, a Caps Lock warning.
import {
  FIREBASE,
  watchUser,
  logIn,
  signUp,
  resetPassword,
  logOut,
  currentUser,
  authMessage,
  resendConfirmation,
  recheckConfirmed,
  emailLink,
  forgetEmailLink,
  useEmailCode,
  checkResetCode,
  setNewPassword,
} from '../auth/auth.js';
import { site } from '../site.js';

const $ = (id) => document.getElementById(id);
const PAGE = document.body.dataset.page;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---- moving between pages ----
const CARRY = 'hl-carry';
function go(page, carry) {
  try {
    if (carry) sessionStorage.setItem(CARRY, JSON.stringify(carry));
  } catch (e) {}
  location.href = page;
}
function carried() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CARRY) || 'null');
    sessionStorage.removeItem(CARRY);
    return c || {};
  } catch (e) {
    return {};
  }
}

// ---- messages and field errors ----
export function say(text, kind = 'err') {
  const el = $('acctmsg');
  el.textContent = text || '';
  el.className = text ? kind : '';
  const view = [...document.querySelectorAll('#acct > .af')].find((v) => !v.hidden);
  if (view) view.insertBefore(el, view.querySelector('.primary') || null); // just above the main button
}
function fieldError(id, text) {
  const input = $(id),
    err = $(id + '-err');
  input.setAttribute('aria-invalid', 'true');
  if (err) err.textContent = text;
  const ids = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
  ids.add(id + '-err');
  input.setAttribute('aria-describedby', [...ids].join(' '));
}
function clearErrors(root) {
  for (const i of root.querySelectorAll('[aria-invalid]')) i.removeAttribute('aria-invalid');
  for (const e of root.querySelectorAll('.ferr')) e.textContent = '';
}
function check(rules) {
  // true if fine; otherwise marks the fields and focuses the first bad one
  let first = null;
  for (const [id, test, text] of rules)
    if (!test($(id).value)) {
      fieldError(id, text);
      first = first || id;
    }
  if (first) {
    $(first).focus();
    return false;
  }
  return true;
}
const filled = (v) => v.trim() !== '',
  isEmail = (v) => EMAIL_RE.test(v.trim());
const emailRules = (id) => [
  [id, filled, 'Enter your email.'],
  [id, (v) => !filled(v) || isEmail(v), 'Enter an email like name@example.com.'],
];
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
  const label = btn.textContent;
  btn.disabled = true;
  if (btn.dataset.busy) btn.textContent = btn.dataset.busy;
  say('');
  if (formId) clearErrors($(formId));
  try {
    await fn();
    return true;
  } catch (e) {
    const field = formId && FIELD_OF[e && e.code] && FIELD_OF[e.code][formId];
    if (field) {
      fieldError(field, authMessage(e));
      $(field).focus();
    } else say(authMessage(e));
    return false;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
const submitBtn = (form) => form.querySelector('button[type=submit]');
function onSubmit(id, fn) {
  $(id).addEventListener('submit', (e) => {
    e.preventDefault();
    clearErrors(e.target);
    say('');
    fn(e.target);
  });
}

function passwordHelpers() {
  for (const b of document.querySelectorAll('#acct .reveal'))
    b.addEventListener('click', () => {
      const input = $(b.getAttribute('aria-controls')),
        showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      b.textContent = showing ? 'Show' : 'Hide';
      b.setAttribute('aria-pressed', String(!showing));
      b.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      input.focus();
    });
  for (const input of document.querySelectorAll('#acct input[type=password]')) {
    const caps = input.closest('.field').querySelector('.caps');
    if (!caps) continue;
    const upd = (e) => {
      if (e.getModifierState) caps.hidden = !e.getModifierState('CapsLock');
    };
    input.addEventListener('keydown', upd);
    input.addEventListener('keyup', upd);
    input.addEventListener('blur', () => {
      caps.hidden = true;
    });
  }
  for (const input of document.querySelectorAll('#acct input'))
    input.addEventListener('input', () => {
      // fixing a field clears its error
      if (input.getAttribute('aria-invalid')) {
        input.removeAttribute('aria-invalid');
        const e = $(input.id + '-err');
        if (e) e.textContent = '';
      }
    });
}
// show one of this page's views (pages with more than one: reset-password, confirm-email)
function show(id) {
  for (const v of document.querySelectorAll('#acct > .af')) v.hidden = v.id !== id;
  const first = $(id).querySelector('input');
  if (first) setTimeout(() => first.focus(), 0);
}
// one message with one button
function note(title, text, button, then) {
  $('nt-title').textContent = title;
  $('nt-text').textContent = text;
  $('nt-go').textContent = button;
  $('nt-go').onclick = then;
  $('nt-go').hidden = false;
  show('v-note');
  say('');
  setTimeout(() => $('nt-go').focus(), 0);
}
const toLogin = (email, msg) => () => go(site(''), { email, msg, kind: 'ok' });
// the first answer from Firebase about who is logged in on this browser
const firstUser = () =>
  new Promise((resolve) => {
    let done = false;
    watchUser((u) => {
      if (!done) {
        done = true;
        resolve(u);
      }
    }).catch(() => resolve(null));
  });

// Fetch the game in the background while the player is on the log-in page, so entering the marsh is quick.
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
  }, 1500);
}

// ---- the pages ----
const PAGES = {
  async login() {
    const c = carried();
    if (c.email) $('li-email').value = c.email;
    if (c.msg) say(c.msg, c.kind || 'ok');
    if (!FIREBASE) {
      // local testing without Firebase: a name is enough (server must run with MARSH_AUTH=off)
      for (const el of document.querySelectorAll('.fb-only')) el.hidden = true;
      $('li-email-label').textContent = 'Name (test login)';
      $('li-email').placeholder = 'Name (test login)';
      $('li-email').type = 'text';
      $('li-email').autocomplete = 'off';
    }
    $('to-forgot').addEventListener('click', () => {
      try {
        sessionStorage.setItem(CARRY, JSON.stringify({ email: $('li-email').value.trim() }));
      } catch (e) {}
    });
    const enter = (u) => location.replace(u.verified ? site('hunting') : site('confirm-email'));
    // already logged in on this browser: straight on (the root page hid the card while we find out)
    const u = await firstUser();
    if (u) return enter(u);
    document.documentElement.classList.remove('checking');
    (c.email ? $('li-pass') : $('li-email')).focus();
    prefetchGame();
    onSubmit('f-login', async (form) => {
      const ok = FIREBASE
        ? check([...emailRules('li-email'), ['li-pass', (v) => v !== '', 'Enter your password.']])
        : check([['li-email', filled, 'Enter a name.']]);
      if (!ok) return;
      if (await act(submitBtn(form), () => logIn($('li-email').value, $('li-pass').value), 'f-login')) {
        $('li-pass').value = '';
        const me = currentUser();
        if (me && !me.verified)
          go(site('confirm-email'), {
            msg: 'Your email isn’t confirmed yet. Open the link in the email we sent you, or send it again below.',
            kind: 'err',
          });
        else location.replace(site('hunting'));
      }
    });
  },

  async 'create-account'() {
    $('su-name').focus();
    onSubmit('f-signup', async (form) => {
      const p1 = $('su-pass').value;
      if (
        !check([
          ['su-name', filled, 'Choose a hunter name.'],
          ...emailRules('su-email'),
          ['su-pass', (v) => v.length >= 8, 'Use at least 8 characters.'],
          ['su-pass2', (v) => v === p1, 'The passwords don’t match.'],
        ])
      )
        return;
      if (await act(submitBtn(form), () => signUp($('su-name').value, $('su-email').value, p1), 'f-signup')) {
        $('su-pass').value = $('su-pass2').value = '';
        go(site('confirm-email'), { msg: 'Account created. One more step: confirm your email.', kind: 'ok' });
      }
    });
  },

  async 'forgot-password'() {
    const c = carried();
    if (c.email) $('fp-email').value = c.email;
    $('fp-email').focus();
    onSubmit('f-forgot', async (form) => {
      if (!check(emailRules('fp-email'))) return;
      const email = $('fp-email').value.trim();
      if (await act(submitBtn(form), () => resetPassword(email), 'f-forgot')) {
        go(site(''), {
          email,
          msg: `If there’s an account for ${email}, we’ve sent a link to choose a new password. Check your spam folder too.`,
          kind: 'ok',
        });
      }
    });
  },

  async 'reset-password'() {
    const link = emailLink();
    if (!link || link.mode !== 'resetPassword') {
      if (link) return location.replace(site('confirm-email') + location.search);
      return note(
        'Choose a new password',
        'Open the link in the password reset email we sent you. No email? Ask for a new one.',
        'Get a reset link',
        () => go(site('forgot-password')),
      );
    }
    forgetEmailLink();
    try {
      const email = await checkResetCode(link.code);
      $('np-email').textContent = email;
      show('f-newpass');
      onSubmit('f-newpass', async (form) => {
        const p1 = $('np-pass').value;
        if (
          !check([
            ['np-pass', (v) => v.length >= 8, 'Use at least 8 characters.'],
            ['np-pass2', (v) => v === p1, 'The passwords don’t match.'],
          ])
        )
          return;
        if (await act(submitBtn(form), () => setNewPassword(link.code, p1), 'f-newpass')) {
          $('np-pass').value = $('np-pass2').value = '';
          note('Password changed', 'Your new password is set.', 'Sign in to play the game', toLogin(email));
        }
      });
    } catch (e) {
      const used = e && (e.code === 'auth/invalid-action-code' || e.code === 'auth/expired-action-code');
      note(
        'This link doesn’t work any more',
        used ? 'Password reset links work once and expire after an hour. Ask for a new one.' : authMessage(e),
        'Get a new link',
        () => go(site('forgot-password')),
      );
    }
  },

  async 'confirm-email'() {
    const link = emailLink();
    if (link && link.mode === 'resetPassword') return location.replace(site('reset-password') + location.search);
    if (link) {
      // the link in the confirmation email (or the "undo an email change" link)
      forgetEmailLink();
      try {
        const email = await useEmailCode(link.code);
        if (link.mode === 'verifyEmail')
          note('Email confirmed', 'Thank you! Your account is ready.', 'Sign in to play the game', toLogin(email));
        else
          note(
            'Email address restored',
            'Your account’s email address has been changed back. If you didn’t ask for the change, reset your password too.',
            'Sign in',
            toLogin(email),
          );
      } catch (e) {
        const used = e && (e.code === 'auth/invalid-action-code' || e.code === 'auth/expired-action-code');
        note(
          'This link doesn’t work any more',
          used
            ? 'It may already have been used: if you confirmed your email earlier, just sign in. If not, sign in and ask for a new confirmation email.'
            : authMessage(e),
          'Sign in',
          toLogin(''),
        );
      }
      return;
    }
    // waiting for the player to click the link (in this browser, on a phone, anywhere): check every few seconds
    const c = carried(),
      u = await firstUser();
    if (!u) return location.replace(site(''));
    if (u.verified) return location.replace(site('hunting'));
    $('vf-email').textContent = u.email;
    show('v-verify');
    if (c.msg) say(c.msg, c.kind || 'ok');
    let leaving = false;
    const done = async (email) => {
      leaving = true;
      clearInterval(poll);
      await logOut();
      note('Email confirmed', 'Thank you! Your account is ready.', 'Sign in to play the game', toLogin(email));
    };
    const poll = setInterval(async () => {
      if (document.hidden || leaving) return;
      try {
        const me = await recheckConfirmed();
        if (me && me.verified) done(me.email);
      } catch (e) {}
    }, 5000);
    // the link was opened in another tab of this browser: that tab logs out, so this one does too
    watchUser((me) => {
      if (!me && !leaving) {
        leaving = true;
        clearInterval(poll);
        go(site(''), { email: u.email, msg: 'Email confirmed? Sign in to play the game.', kind: 'ok' });
      }
    });
    $('vf-resend').addEventListener('click', async (e) => {
      if (await act(e.target, resendConfirmation))
        say('Sent again. It can take a minute or two to arrive; check your spam folder too.', 'ok');
    });
    $('vf-logout').addEventListener('click', async (e) => {
      e.preventDefault();
      leaving = true;
      clearInterval(poll);
      await logOut();
      go(site(''));
    });
  },
};

passwordHelpers();
(PAGES[PAGE] || (() => {}))().catch((e) => {
  document.documentElement.classList.remove('checking');
  say(authMessage(e));
});
