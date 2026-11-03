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

let fb = null, auth = null;
async function load() {   // Firebase is only downloaded when there is a login screen to show
  if (auth) return;
  const [app, a] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
  fb = a; auth = a.getAuth(app.initializeApp(CONFIG));
  auth.useDeviceLanguage();   // reset emails in the player's language
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
export const authMessage = (e) => MESSAGES[e && e.code] || 'Something went wrong' + (e && e.code ? ` (${e.code.replace('auth/', '')})` : '') + '. Try again.';

// ---- the user, as the game sees it: { name, email, verified } or null ----
// verified = they clicked the link in the confirmation email; the server only opens a marsh for them then.
const DEV_KEY = 'marshrut-devuser';
let devUser = null;
const view = (u) => (u ? { name: u.displayName || (u.email || '').split('@')[0], email: u.email, verified: !!u.emailVerified } : null);
const devView = () => (devUser ? { name: devUser, email: '', verified: true } : null);
const BACK = () => ({ url: location.origin + location.pathname });   // the email's link page offers a way back to the game

export async function watchUser(cb) {
  if (!FIREBASE) {
    try { devUser = localStorage.getItem(DEV_KEY); } catch (e) {}
    cb(devView()); return;
  }
  await load();
  fb.onAuthStateChanged(auth, (u) => cb(view(u)));
}
export async function logIn(email, password) {
  if (!FIREBASE) return devLogIn(email);
  await load(); await fb.signInWithEmailAndPassword(auth, email.trim(), password);
}
export async function signUp(name, email, password) {
  if (!FIREBASE) return devLogIn(name);
  await load();
  const cred = await fb.createUserWithEmailAndPassword(auth, email.trim(), password);
  await fb.updateProfile(cred.user, { displayName: name.trim().slice(0, 24) });
  await fb.sendEmailVerification(cred.user, BACK());   // they must click the link before they can play
}
// send the confirmation email again
export async function resendConfirmation() {
  if (!FIREBASE) return;
  await load(); if (auth.currentUser) await fb.sendEmailVerification(auth.currentUser, BACK());
}
// after the player clicked the link (in another tab): ask Firebase again, and get a token that says so
export async function recheckConfirmed() {
  if (!FIREBASE) return devView();
  await load(); const u = auth.currentUser; if (!u) return null;
  await u.reload(); if (u.emailVerified) await u.getIdToken(true);
  return view(u);
}
export async function resetPassword(email) {
  if (!FIREBASE) return;
  await load();
  // after choosing a new password, the reset page offers a link back to the game
  await fb.sendPasswordResetEmail(auth, email.trim(), BACK());
}
export async function logOut() {
  if (!FIREBASE) { devUser = null; try { localStorage.removeItem(DEV_KEY); } catch (e) {} return; }
  await load(); await fb.signOut(auth);
}
export const currentUser = () => (FIREBASE ? view(auth && auth.currentUser) : devView());
// what the marsh server checks: a short-lived Firebase ID token (refreshed automatically)
export async function getToken() {
  if (!FIREBASE) { if (!devUser) throw new Error('Log in first.'); return devUser; }
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
// In Firebase (Authentication -> Templates -> Customize action URL) the links point at the game itself:
// https://hunting.ltd/?mode=verifyEmail|resetPassword|recoverEmail&oobCode=...  The start screen handles them
// (ui/account.js) instead of Firebase's plain page.
export function emailLink() {
  const q = new URLSearchParams(location.search), mode = q.get('mode'), code = q.get('oobCode');
  return FIREBASE && code && ['verifyEmail', 'resetPassword', 'recoverEmail'].includes(mode) ? { mode, code } : null;
}
export function forgetEmailLink() {   // so reloading the page doesn't use the link again
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
export async function checkResetCode(code) { await load(); return fb.verifyPasswordResetCode(auth, code); }   // -> email
export async function setNewPassword(code, password) { await load(); await fb.confirmPasswordReset(auth, code, password); }
function devLogIn(name) {
  devUser = String(name || '').trim().slice(0, 24) || 'Hunter';
  try { localStorage.setItem(DEV_KEY, devUser); } catch (e) {}
}
