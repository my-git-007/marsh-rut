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
};
export const authMessage = (e) => MESSAGES[e && e.code] || 'Something went wrong' + (e && e.code ? ` (${e.code.replace('auth/', '')})` : '') + '. Try again.';

// ---- the user, as the game sees it: { name, email } or null ----
const DEV_KEY = 'marshrut-devuser';
let devUser = null;
const view = (u) => (u ? { name: u.displayName || (u.email || '').split('@')[0], email: u.email } : null);

export async function watchUser(cb) {
  if (!FIREBASE) {
    try { devUser = localStorage.getItem(DEV_KEY); } catch (e) {}
    cb(devUser ? { name: devUser, email: '' } : null); return;
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
  await cred.user.getIdToken(true);   // a fresh token that carries the name
}
export async function resetPassword(email) {
  if (!FIREBASE) return;
  await load();
  // after choosing a new password, the reset page offers a link back to the game
  await fb.sendPasswordResetEmail(auth, email.trim(), { url: location.origin + location.pathname });
}
export async function logOut() {
  if (!FIREBASE) { devUser = null; try { localStorage.removeItem(DEV_KEY); } catch (e) {} return; }
  await load(); await fb.signOut(auth);
}
export const currentUser = () => (FIREBASE ? view(auth && auth.currentUser) : devUser ? { name: devUser, email: '' } : null);
// what the marsh server checks: a short-lived Firebase ID token (refreshed automatically)
export async function getToken() {
  if (!FIREBASE) { if (!devUser) throw new Error('Log in first.'); return devUser; }
  await load();
  if (!auth.currentUser) throw new Error('Log in first.');
  return auth.currentUser.getIdToken();
}
function devLogIn(name) {
  devUser = String(name || '').trim().slice(0, 24) || 'Hunter';
  try { localStorage.setItem(DEV_KEY, devUser); } catch (e) {}
}
