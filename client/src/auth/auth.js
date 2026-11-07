// Player accounts: log in, create an account, reset a forgotten password, log out.
// Firebase Authentication does the work (stores passwords, sends the reset emails); the game only shows
// the forms. The browser stays logged in between visits. The marsh server checks the ID token we send it.
//
// The Firebase web settings are public by design (they identify the project, they are not secrets) and
// come in at build time: VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID,
// VITE_FIREBASE_APP_ID. Without them the game uses a stand-in "dev login" (a name only), which only works
// against a server started with MARSH_AUTH=off.
const env = import.meta.env;
const CONFIG = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
export const FIREBASE = !!(CONFIG.apiKey && CONFIG.projectId);

let fb = null,
  auth = null;
async function load() {
  // Firebase is only downloaded when there is a login screen to show
  if (auth) return;
  const [app, a] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  fb = a;
  auth = a.getAuth(app.initializeApp(CONFIG));
  auth.useDeviceLanguage(); // reset emails in the player's language
}

const MESSAGES = {
  'auth/invalid-credential': 'That email and password don’t match an account.',
  'auth/wrong-password': 'That email and password don’t match an account.',
  'auth/user-not-found': 'That email and password don’t match an account.',
  'auth/invalid-login-credentials': 'That email and password don’t match an account.',
  'auth/email-already-in-use': 'There is already an account with that email. Log in, or reset the password.',
  'auth/weak-password': 'Choose a longer password: at least 8 characters.',
  'auth/password-does-not-meet-requirements': 'Choose a longer password: at least 8 characters.',
  'auth/invalid-email': 'That doesn’t look like an email address.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Can’t reach the login service. Check your internet connection.',
  'auth/user-disabled': 'This account has been switched off.',
  'auth/unauthorized-continue-uri': 'Password reset isn’t set up for this web address yet.',
  'auth/operation-not-allowed': 'Email login isn’t switched on for this game yet.',
  'auth/invalid-action-code': 'This link has expired or has already been used.',
  'auth/expired-action-code': 'This link has expired.',
};
export const authMessage = (e) =>
  MESSAGES[e && e.code] ||
  'Something went wrong' + (e && e.code ? ` (${e.code.replace('auth/', '')})` : '') + '. Try again.';

// ---- the user, as the game sees it: { name, email, verified } or null ----
// verified = they clicked the link in the confirmation email; the server only opens a marsh for them then.
const DEV_KEY = 'marshrut-devuser';
let devUser = null;
const view = (u) =>
  u ? { name: u.displayName || (u.email || '').split('@')[0], email: u.email, verified: !!u.emailVerified } : null;
const devView = () => (devUser ? { name: devUser, email: '', verified: true } : null);
// Firebase's own emails link to its plain page on marsh-rut.firebaseapp.com (this project isn't allowed to point
// them at the game), so the game's server sends these emails itself (server/mail.js), with links that open the
// game's own screens. If the server can't (not set up yet, or unreachable), Firebase sends them as before.
const BACK = () => ({
  url: new URL((document.body.dataset.root || './') + 'sign-in/', location.href).href.split(/[?#]/)[0],
}); // Firebase's page offers a link back to the log-in page
const MAILER = (import.meta.env.VITE_SERVER_URL || '').replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '');
async function gameMail(path, body, idToken) {
  // -> true when the game's server sent it
  if (!MAILER) return false;
  let r;
  try {
    r = await fetch(MAILER + path, {
      method: 'POST',
      body: JSON.stringify(body || {}),
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', ...(idToken ? { Authorization: 'Bearer ' + idToken } : {}) },
    });
  } catch (e) {
    return false;
  }
  if (r.status === 429) {
    const e = new Error('Too many emails');
    e.code = 'auth/too-many-requests';
    throw e;
  }
  if (r.status === 400) {
    const e = new Error('Bad email');
    e.code = 'auth/invalid-email';
    throw e;
  }
  // only a real 'sent' answer counts (an older server answers any address with a plain 200 page)
  const j = r.ok ? await r.json().catch(() => null) : null;
  return !!(j && j.ok === true);
}

// A flag that this browser has someone logged in, readable before Firebase loads: the pages use it to avoid
// showing the wrong screen for a moment (the log-in page and /hunting/).
const flag = (on) => {
  try {
    if (on) localStorage.setItem('hl-in', '1');
    else localStorage.removeItem('hl-in');
  } catch (e) {}
};
export async function watchUser(cb) {
  if (!FIREBASE) {
    try {
      devUser = localStorage.getItem(DEV_KEY);
    } catch (e) {}
    flag(!!devUser);
    cb(devView());
    return;
  }
  await load();
  fb.onAuthStateChanged(auth, (u) => {
    flag(!!u);
    cb(view(u));
  });
}
export async function logIn(email, password) {
  if (!FIREBASE) return devLogIn(email);
  await load();
  await fb.signInWithEmailAndPassword(auth, email.trim(), password);
}
export async function signUp(name, email, password) {
  if (!FIREBASE) return devLogIn(name);
  await load();
  const cred = await fb.createUserWithEmailAndPassword(auth, email.trim(), password);
  await fb.updateProfile(cred.user, { displayName: name.trim().slice(0, 24) });
  // they must click the link before they can play
  if (!(await gameMail('/email/verify', { name: name.trim().slice(0, 24) }, await cred.user.getIdToken())))
    await fb.sendEmailVerification(cred.user, BACK());
}
// send the confirmation email again
export async function resendConfirmation() {
  if (!FIREBASE) return;
  await load();
  const u = auth.currentUser;
  if (!u) return;
  if (!(await gameMail('/email/verify', { name: u.displayName || '' }, await u.getIdToken())))
    await fb.sendEmailVerification(u, BACK());
}
// after the player clicked the link (in another tab): ask Firebase again, and get a token that says so
export async function recheckConfirmed() {
  if (!FIREBASE) return devView();
  await load();
  const u = auth.currentUser;
  if (!u) return null;
  await u.reload();
  if (u.emailVerified) await u.getIdToken(true);
  return view(u);
}
export async function resetPassword(email) {
  if (!FIREBASE) return;
  await load();
  if (!(await gameMail('/email/reset', { email: email.trim() })))
    await fb.sendPasswordResetEmail(auth, email.trim(), BACK());
}
export async function logOut() {
  flag(false);
  if (!FIREBASE) {
    devUser = null;
    try {
      localStorage.removeItem(DEV_KEY);
    } catch (e) {}
    return;
  }
  await load();
  await fb.signOut(auth);
}
export const currentUser = () => (FIREBASE ? view(auth && auth.currentUser) : devView());
// what the marsh server checks: a short-lived Firebase ID token (refreshed automatically)
export async function getToken() {
  if (!FIREBASE) {
    if (!devUser) throw new Error('Log in first.');
    return devUser;
  }
  await load();
  const u = auth.currentUser;
  if (!u) throw new Error('Log in first.');
  // A token made before the player confirmed their email still says "not confirmed" for up to an hour, and the
  // server would turn them away. If Firebase now knows the email is confirmed, get a fresh token that says so.
  const r = await u.getIdTokenResult();
  if (u.emailVerified && !r.claims.email_verified) return u.getIdToken(true);
  return r.token;
}

// ---- the links in Firebase's emails ----
// The game's server sends these emails (server/mail.js) with links to the game's own pages:
// /reset-password/ and /confirm-email/ ?mode=resetPassword|verifyEmail|recoverEmail&oobCode=...
// (src/pages/account-pages.js handles them; old links to the site's root are forwarded by client/index.html).
export function emailLink() {
  const q = new URLSearchParams(location.search),
    mode = q.get('mode'),
    code = q.get('oobCode');
  return FIREBASE && code && ['verifyEmail', 'resetPassword', 'recoverEmail'].includes(mode) ? { mode, code } : null;
}
export function forgetEmailLink() {
  // so reloading the page doesn't use the link again
  const u = new URL(location.href);
  for (const k of ['mode', 'oobCode', 'apiKey', 'continueUrl', 'lang', 'tenantId']) u.searchParams.delete(k);
  history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
}
// confirm the email (or undo an email change); returns the account's email. Logs this browser out afterwards,
// so the player signs in fresh, with a login that knows the email is confirmed.
export async function useEmailCode(code) {
  await load();
  const info = await fb.checkActionCode(auth, code);
  await fb.applyActionCode(auth, code);
  if (auth.currentUser) await fb.signOut(auth);
  return (info.data && (info.data.email || info.data.previousEmail)) || '';
}
export async function checkResetCode(code) {
  await load();
  return fb.verifyPasswordResetCode(auth, code);
} // -> email
export async function setNewPassword(code, password) {
  await load();
  await fb.confirmPasswordReset(auth, code, password);
}
function devLogIn(name) {
  devUser =
    String(name || '')
      .trim()
      .slice(0, 24) || 'Hunter';
  try {
    localStorage.setItem(DEV_KEY, devUser);
  } catch (e) {}
  flag(true);
}
