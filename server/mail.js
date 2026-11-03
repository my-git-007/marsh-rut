// Account emails (confirm your email, reset your password), sent by this server instead of by Firebase.
// Firebase won't let this project point its own emails at the game (EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED), so its
// links open a plain page on marsh-rut.firebaseapp.com. Here the server asks Firebase for the one-time code
// (Firebase still checks it and changes the password), puts it in a link to the game itself
// (https://hunting.ltd/?mode=...&oobCode=..., handled by client/src/ui/account.js) and sends a branded email
// through Resend from support@hunting.ltd.
//
//   FIREBASE_SA_B64   secret: the Firebase service account key (the downloaded JSON file, base64-encoded).
//                     Without it (or without RESEND_API_KEY) /email/* answers 503 and the game falls back to
//                     Firebase's own emails.
//   MAIL_FROM         sender (default "Hunting LTD <support@hunting.ltd>"), MAIL_REPLY_TO (support@hunting.ltd)
//   GAME_URL          where links go when the request's origin isn't one of the game's own (https://hunting.ltd/)
//   GOOGLE_TOKEN_URL, IDTK_URL, RESEND_URL   tests only
import { SignJWT, importPKCS8 } from 'jose';
import { whoIs, AUTH_OFF, cleanName } from './auth.js';

const env = process.env;
const RESEND_KEY = env.RESEND_API_KEY || '';
const FROM = env.MAIL_FROM || 'Hunting LTD <support@hunting.ltd>';
const REPLY_TO = env.MAIL_REPLY_TO || 'support@hunting.ltd';
const GAME = env.GAME_URL || 'https://hunting.ltd/';
const GAME_ORIGINS = ['https://hunting.ltd', 'https://www.hunting.ltd'];
const TOKEN_URL = env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const IDTK = env.IDTK_URL || 'https://identitytoolkit.googleapis.com/v1';
const RESEND_URL = env.RESEND_URL || 'https://api.resend.com/emails';
let SA = null;
try { if (env.FIREBASE_SA_B64) SA = JSON.parse(Buffer.from(env.FIREBASE_SA_B64, 'base64').toString('utf8')); }
catch (e) { console.error('mail: FIREBASE_SA_B64 is not a base64-encoded service account key'); }
const PROJECT = env.FIREBASE_PROJECT_ID || (SA && SA.project_id) || '';
export const MAIL_ON = !!(SA && SA.client_email && SA.private_key && RESEND_KEY && PROJECT);

// ---- Google: an access token for the service account, then a one-time code from Firebase ----
let token = null;
async function googleToken() {
  if (token && token.until > Date.now()) return token.value;
  const key = await importPKCS8(SA.private_key, 'RS256'), now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/cloud-platform' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', ...(SA.private_key_id ? { kid: SA.private_key_id } : {}) })
    .setIssuer(SA.client_email).setSubject(SA.client_email).setAudience(TOKEN_URL).setIssuedAt(now).setExpirationTime(now + 3600).sign(key);
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }), signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google token: ' + r.status + ' ' + JSON.stringify(j).slice(0, 200));
  token = { value: j.access_token, until: Date.now() + Math.max(60, (j.expires_in || 3600) - 300) * 1000 };
  return token.value;
}
// -> the one-time code, or null when there is no account with that email
async function oobCode(requestType, email) {
  const r = await fetch(`${IDTK}/projects/${PROJECT}/accounts:sendOobCode`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + (await googleToken()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType, email, returnOobLink: true }), signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const why = (j.error && j.error.message) || String(r.status);
    if (/^EMAIL_NOT_FOUND|^USER_NOT_FOUND/.test(why)) return null;
    throw new Error('Firebase: ' + why);
  }
  // with email-enumeration protection on, an email with no account gets a normal answer but no link
  if (!j.oobLink) return null;
  const code = new URL(j.oobLink).searchParams.get('oobCode');
  if (!code) throw new Error('Firebase: no code in the link');
  return code;
}

// ---- limits (per account, email and address) ----
const hits = new Map();
function allow(rules) {   // rules: [[key, n, ms]]; counts only if every rule allows it
  const now = Date.now();
  for (const [k, n, ms] of rules) if ((hits.get(k) || []).filter((t) => now - t < ms).length >= n) return false;
  for (const [k] of rules) hits.set(k, [...(hits.get(k) || []).filter((t) => now - t < 86400000), now]);
  return true;
}
setInterval(() => { const now = Date.now(); for (const [k, ts] of hits) if (!ts.some((t) => now - t < 86400000)) hits.delete(k); }, 3600000).unref();

// ---- the emails ----
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function page({ title, lines, button, link, after }) {
  const p = (t) => `<p style="margin:0 0 16px;font:16px/1.55 Helvetica,Arial,sans-serif;color:#3a2a1a">${t}</p>`;
  return `<!doctype html><html><body style="margin:0;padding:0;background:#13120e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#13120e"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#f6ecd9;border-radius:14px;overflow:hidden">
<tr><td><img src="${esc(GAME)}badge.jpg" width="520" alt="Hunting LTD" style="display:block;width:100%;max-width:520px;height:auto;border:0"></td></tr>
<tr><td style="padding:26px 30px 8px">
<h1 style="margin:0 0 16px;font:bold 26px/1.2 Georgia,serif;color:#2a1c10">${esc(title)}</h1>
${lines.map(p).join('\n')}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr><td style="border-radius:10px;background:#3b2716">
<a href="${esc(link)}" style="display:inline-block;padding:14px 26px;font:bold 16px Helvetica,Arial,sans-serif;color:#f2cf9d;text-decoration:none;border-radius:10px">${esc(button)}</a></td></tr></table>
${p(esc(after))}
<p style="margin:0 0 22px;font:13px/1.5 Helvetica,Arial,sans-serif;color:#6e5a44">If the button doesn't work, copy this link into your browser:<br><a href="${esc(link)}" style="color:#8f5d2e;word-break:break-all">${esc(link)}</a></p>
</td></tr>
<tr><td style="padding:14px 30px 22px;border-top:1px solid #e3d3b5;font:12px/1.5 Helvetica,Arial,sans-serif;color:#8a7458">Hunting LTD · <a href="${esc(GAME)}" style="color:#8f5d2e">hunting.ltd</a> · Questions? Just reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}
export const EMAILS = {   // exported for previews
  verifyEmail: (name, link) => ({
    subject: 'Confirm your email for Hunting LTD',
    html: page({ title: 'Confirm your email', lines: [`Hi ${esc(name)},`, 'Welcome to Hunting LTD! Click the button below to confirm your email address. Then sign in and head for the marsh.'],
      button: 'Confirm my email', link, after: 'If you didn’t create a Hunting LTD account, you can ignore this email.' }),
    text: `Hi ${name},\n\nWelcome to Hunting LTD! Open this link to confirm your email address, then sign in and head for the marsh:\n\n${link}\n\nIf you didn't create a Hunting LTD account, you can ignore this email.\n\nHunting LTD · ${GAME}`,
  }),
  resetPassword: (email, link) => ({
    subject: 'Reset your Hunting LTD password',
    html: page({ title: 'Reset your password', lines: [`We got a request to reset the password for <b>${esc(email)}</b>.`, 'Click the button below to choose a new one. The link works once and expires in an hour.'],
      button: 'Choose a new password', link, after: 'If you didn’t ask for this, you can ignore this email. Your password won’t change.' }),
    text: `We got a request to reset the password for ${email}.\n\nOpen this link to choose a new one (it works once and expires in an hour):\n\n${link}\n\nIf you didn't ask for this, you can ignore this email. Your password won't change.\n\nHunting LTD · ${GAME}`,
  }),
};
async function deliver(to, { subject, html, text }) {
  const r = await fetch(RESEND_URL, {
    method: 'POST', headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, html, text }), signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error('Resend: ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

// ---- HTTP: POST /email/verify (Authorization: Bearer <Firebase ID token>, body {name}) and POST /email/reset {email} ----
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
function body(req) {
  return new Promise((resolve) => {
    let b = '', big = false;
    req.on('data', (d) => { b += d; if (b.length > 2048) { big = true; req.destroy(); } });
    req.on('end', () => { try { resolve(big ? null : JSON.parse(b || '{}')); } catch (e) { resolve(null); } });
    req.on('error', () => resolve(null));
  });
}
export async function handleMail(req, res, ip, origins) {
  const origin = req.headers.origin || '';
  const okOrigin = !origins.length || origins.includes(origin);
  const head = { 'Content-Type': 'application/json', Vary: 'Origin', ...(okOrigin && origin ? { 'Access-Control-Allow-Origin': origin } : {}) };
  const out = (status, o) => { res.writeHead(status, head); res.end(JSON.stringify(o)); };
  if (!okOrigin) return out(403, { ok: false, reason: 'origin' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { ...head, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '600' });
    return res.end();
  }
  if (req.method !== 'POST') return out(405, { ok: false });
  const kind = req.url === '/email/verify' ? 'verifyEmail' : req.url === '/email/reset' ? 'resetPassword' : '';
  if (!kind) return out(404, { ok: false });
  if (!MAIL_ON) return out(503, { ok: false, reason: 'off' });
  const b = await body(req);
  if (!b || typeof b !== 'object') return out(400, { ok: false, reason: 'invalid' });
  const base = GAME_ORIGINS.includes(origin) ? origin + '/' : GAME;
  try {
    if (kind === 'verifyEmail') {
      let who; try { who = await whoIs(String(req.headers.authorization || '').replace(/^Bearer /, '')); } catch (e) { return out(401, { ok: false, reason: 'login' }); }
      if (who.verified) return out(200, { ok: true });
      const email = who.email || (AUTH_OFF ? String(b.email || '') : '');   // tests run without real logins
      if (!EMAIL_RE.test(email)) return out(400, { ok: false, reason: 'invalid' });
      if (!allow([['v:' + who.uid, 3, 3600000], ['v:' + who.uid, 8, 86400000], ['vi:' + ip, 10, 3600000]])) return out(429, { ok: false, reason: 'limit' });
      const code = await oobCode('VERIFY_EMAIL', email);
      if (!code) return out(400, { ok: false, reason: 'invalid' });
      await deliver(email, EMAILS.verifyEmail(cleanName(b.name || who.name), `${base}?mode=verifyEmail&oobCode=${encodeURIComponent(code)}`));
      console.log('mail: confirmation sent to account', who.uid.slice(0, 10));
    } else {
      const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
      if (!EMAIL_RE.test(email)) return out(400, { ok: false, reason: 'invalid' });
      if (!allow([['r:' + email, 3, 3600000], ['ri:' + ip, 6, 3600000]])) return out(429, { ok: false, reason: 'limit' });
      const code = await oobCode('PASSWORD_RESET', email);
      if (code) { await deliver(email, EMAILS.resetPassword(email, `${base}?mode=resetPassword&oobCode=${encodeURIComponent(code)}`)); console.log('mail: reset link sent'); }
      // no account with that email: answer the same way, so the form doesn't reveal who has an account
    }
    return out(200, { ok: true });
  } catch (e) {
    console.error('mail:', e.message);
    return out(502, { ok: false, reason: 'failed' });
  }
}
