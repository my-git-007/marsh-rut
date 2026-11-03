// The in-game Contact form: a logged-in player (email confirmed) writes to the game's owner.
// Messages go out through Resend (https://resend.com), as plain text, with the player's email as Reply-To,
// so replying in your mail program answers the player directly.
//
//   RESEND_API_KEY   secret (fly secrets set ...)        without it the form says contact isn't set up yet
//   CONTACT_TO       where messages go (secret too, so the address isn't in the public repository)
//   CONTACT_FROM     sender (default "Marsh Rut <onboarding@resend.dev>", Resend's test sender, which may only
//                    send to the Resend account's own address; use your own domain's address once it's verified)
const KEY = process.env.RESEND_API_KEY || '', TO = process.env.CONTACT_TO || '';
const FROM = process.env.CONTACT_FROM || 'Marsh Rut <onboarding@resend.dev>';
export const CONTACT_ON = !!(KEY && TO);

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/;
const sent = new Map();   // key (account or address) -> [times]
const LIMITS = [['uid', 3, 3600000], ['uid', 10, 86400000], ['ip', 6, 3600000]];   // per account: 3/hour, 10/day; per address: 6/hour

function allowed(uid, ip) {
  const now = Date.now();
  for (const [kind, n, win] of LIMITS) {
    const k = kind + ':' + (kind === 'uid' ? uid : ip), ts = (sent.get(k) || []).filter((t) => now - t < 86400000);
    sent.set(k, ts);
    if (ts.filter((t) => now - t < win).length >= n) return false;
  }
  return true;
}
function record(uid, ip) { const now = Date.now(); for (const k of ['uid:' + uid, 'ip:' + ip]) sent.set(k, [...(sent.get(k) || []), now]); }

const clean = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, n);

// -> { ok: true } or { ok: false, reason: 'off' | 'invalid' | 'limit' | 'failed', field? }
export async function sendContact(who, ip, msg) {
  if (!CONTACT_ON) return { ok: false, reason: 'off' };
  const name = clean(msg.name, 80).replace(/\n/g, ' '), email = clean(msg.email, 200).replace(/\s/g, ''), text = clean(msg.message, 4000);
  if (!name) return { ok: false, reason: 'invalid', field: 'name' };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: 'invalid', field: 'email' };
  if (text.length < 2) return { ok: false, reason: 'invalid', field: 'message' };
  if (!allowed(who.uid, ip)) return { ok: false, reason: 'limit' };
  record(who.uid, ip);
  const body = `${text}\n\n— \nFrom: ${name} <${email}>\nAccount: ${who.name} · ${who.email || 'no email'} · ${who.uid}\nSent from the Marsh Rut contact form, ${new Date().toISOString()}`;
  try {
    const r = await fetch(process.env.RESEND_URL || 'https://api.resend.com/emails', {   // RESEND_URL: tests only
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [TO], reply_to: email, subject: `Marsh Rut: message from ${name}`, text: body }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { console.error('contact: Resend said', r.status, (await r.text()).slice(0, 300)); return { ok: false, reason: 'failed' }; }
    return { ok: true };
  } catch (e) { console.error('contact: could not reach Resend:', e.message); return { ok: false, reason: 'failed' }; }
}
