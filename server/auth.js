// Who is connecting? The browser logs in with Firebase Authentication and sends its ID token in the
// 'hello' message. We check the token's signature against Google's public keys, and that it was issued
// for our Firebase project and has not expired. Passwords never reach this server.
//
//   FIREBASE_PROJECT_ID   required in production
//   MARSH_AUTH=off        local development and tests only: no login; the 'token' is used as the user id
//                         (a token ending in '?' stands for a player whose email is not confirmed)
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PROJECT = process.env.FIREBASE_PROJECT_ID || '';
export const AUTH_OFF = process.env.MARSH_AUTH === 'off';
if (!PROJECT && !AUTH_OFF) {
  console.error('Set FIREBASE_PROJECT_ID (or MARSH_AUTH=off for local testing).');
  process.exit(1);
}
const KEYS = PROJECT ? createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')) : null;

export const cleanName = (s) => String(s || '').replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 24) || 'Hunter';

// -> { uid, name, verified }   (throws if the token is not good). verified = the player confirmed their email.
export async function whoIs(token) {
  if (AUTH_OFF) { const id = cleanName(token); return { uid: 'dev:' + id, name: id, verified: !String(token).endsWith('?'), email: '' }; }   // tests: 'Name?' = email not confirmed
  if (typeof token !== 'string' || token.length > 4096) throw new Error('no token');
  const { payload } = await jwtVerify(token, KEYS, { issuer: `https://securetoken.google.com/${PROJECT}`, audience: PROJECT, algorithms: ['RS256'] });
  if (!payload.sub) throw new Error('no user');
  return { uid: payload.sub, name: cleanName(payload.name || String(payload.email || '').split('@')[0]), verified: payload.email_verified === true, email: String(payload.email || '') };
}
