// The "Coming early 2027" list on the front page (client/index.html), with a confirmation step (double opt-in):
//   POST /notify {email}          answers at once, then emails the address a link to confirm (and one to remove it)
//   POST /notify/confirm {t}      the link's page (client/notify/) confirms the address
//   POST /notify/remove {t}       ... or takes it off the list (t = the emailed code, or the address's removal code)
// Only confirmed addresses get the launch email: server/notify-list.js lists them, each with its own removal link
// for that email. Every answer to POST /notify is the same and immediate, so the form never reveals who signed up.
//
//   NOTIFY_DB             the database file (default data/notify.db; on Fly /data/notify.db, on the volume)
//   NOTIFY_MAX_PER_DAY    confirmation emails the whole server may send a day (default 80), so nobody can use the
//                         form to spam people or use up the Resend quota the account emails also need
//   Needs RESEND_API_KEY (server/mail.js sends the confirmation email); without it /notify answers 503.
//
// Rows: email, created_at (first sign-up), sent_at (latest link sent), token (SHA-256 of the latest emailed code;
// only the hash is kept), confirmed_at, unsub (removal code made on confirming, for links in later emails).
// Addresses that were sent a link but didn't confirm within UNCONFIRMED_DAYS are deleted. Rows from before the
// confirmation step (no link ever sent) are kept until they sign up again or are emailed.
//
// SQLite comes with Node 22.13 and later (node:sqlite). On an older Node the list is off: /notify answers 503 and
// everything else on the server works as before.
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { createHash, randomBytes } from 'crypto';
import { readBody, allow, EMAIL_RE, EMAILS, deliver, linkBase, MAIL_SEND_ON } from './mail.js';

export const NOTIFY_DB = process.env.NOTIFY_DB || 'data/notify.db';
const MAX_PER_DAY = +process.env.NOTIFY_MAX_PER_DAY || 80;
const UNCONFIRMED_DAYS = 14;
const NOW = "strftime('%Y-%m-%dT%H:%M:%SZ', 'now')";
const hash = (t) => createHash('sha256').update(t).digest('hex');
const code = () => randomBytes(32).toString('base64url'); // 43 characters
let q = null;
try {
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync(dirname(NOTIFY_DB), { recursive: true });
  const db = new DatabaseSync(NOTIFY_DB);
  // WAL + synchronous NORMAL: a sign-up doesn't wait for a disk flush on the thread that runs every marsh
  db.exec(`PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS notify (
      email      TEXT PRIMARY KEY COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (${NOW})
    )`);
  const cols = db
    .prepare('PRAGMA table_info(notify)')
    .all()
    .map((c) => c.name);
  for (const c of ['confirmed_at', 'token', 'sent_at', 'unsub'])
    if (!cols.includes(c)) db.exec(`ALTER TABLE notify ADD COLUMN ${c} TEXT`);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS notify_token ON notify(token);
    CREATE UNIQUE INDEX IF NOT EXISTS notify_unsub ON notify(unsub)`);
  q = {
    confirmed: db.prepare('SELECT 1 FROM notify WHERE email = ? AND confirmed_at IS NOT NULL'),
    // after the email went out: the new link replaces any older unconfirmed one; created_at keeps the first sign-up
    sent: db.prepare(
      `INSERT INTO notify (email, token, sent_at) VALUES (?, ?, ${NOW})
       ON CONFLICT(email) DO UPDATE SET token = excluded.token, sent_at = excluded.sent_at WHERE confirmed_at IS NULL`,
    ),
    exists: db.prepare('SELECT 1 FROM notify WHERE token = ?'),
    confirm: db.prepare(`UPDATE notify SET confirmed_at = ${NOW}, unsub = ? WHERE token = ? AND confirmed_at IS NULL`),
    remove: db.prepare('DELETE FROM notify WHERE token = ? OR unsub = ?'),
    prune: db.prepare(
      `DELETE FROM notify WHERE confirmed_at IS NULL AND sent_at IS NOT NULL AND sent_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-${UNCONFIRMED_DAYS} days')`,
    ),
  };
} catch (e) {
  console.error('notify: list off —', e.message);
  q = null;
}
function prune() {
  try {
    const n = q.prune.run().changes;
    if (n) console.log(`notify: removed ${n} unconfirmed address(es)`);
  } catch (e) {
    console.error('notify: prune failed —', e.message); // never let a disk problem take the game server down
  }
}
if (q) {
  prune();
  setInterval(prune, 6 * 3600000).unref();
}
export const NOTIFY_ON = !!q && MAIL_SEND_ON;

// the confirmation email, after the answer has gone back: same timing for every address
async function sendLink(email, origin) {
  try {
    if (q.confirmed.get(email)) return; // already on the list: nothing to send
    if (!allow([['ne:' + email, 3, 86400000]])) return; // this address got 3 links today
    if (!allow([['n:all', MAX_PER_DAY, 86400000]])) return console.error('notify: daily email cap reached');
    const t = code(),
      base = linkBase(origin),
      link = (a) => `${base}notify/?a=${a}&t=${t}`;
    await deliver(email, EMAILS.notifyConfirm(email, link('confirm'), link('remove')));
    q.sent.run(email, hash(t)); // only once it was sent, so a failed resend doesn't break the link they have
    console.log('notify: confirmation sent');
  } catch (e) {
    console.error('notify: confirmation not sent —', e.message);
  }
}

export async function handleNotify(req, res, ip, origins) {
  const origin = req.headers.origin || '';
  const okOrigin = !origins.length || origins.includes(origin);
  const head = {
    'Content-Type': 'application/json',
    Vary: 'Origin',
    ...(okOrigin && origin ? { 'Access-Control-Allow-Origin': origin } : {}),
  };
  const out = (status, o) => {
    res.writeHead(status, head);
    res.end(JSON.stringify(o));
  };
  if (!okOrigin) return out(403, { ok: false, reason: 'origin' });
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...head,
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }
  if (req.method !== 'POST') return out(405, { ok: false });
  if (!NOTIFY_ON) return out(503, { ok: false, reason: 'off' });
  const b = await readBody(req);
  try {
    if (req.url === '/notify') {
      const email = String((b && b.email) || '')
        .trim()
        .toLowerCase();
      if (email.length > 254 || !EMAIL_RE.test(email)) return out(400, { ok: false, reason: 'invalid' });
      if (!allow([['n:' + ip, 10, 3600000]])) return out(429, { ok: false, reason: 'limit' });
      out(200, { ok: true });
      sendLink(email, origin);
      return;
    }
    const t = String((b && b.t) || '');
    if (!/^[\w-]{43}$/.test(t)) return out(400, { ok: false, reason: 'link' });
    if (!allow([['nt:' + ip, 30, 3600000]])) return out(429, { ok: false, reason: 'limit' });
    const h = hash(t);
    if (req.url === '/notify/confirm') {
      if (!q.exists.get(h)) return out(404, { ok: false, reason: 'link' });
      if (q.confirm.run(code(), h).changes) console.log('notify: an address was confirmed');
      return out(200, { ok: true });
    }
    if (req.url === '/notify/remove') {
      // removing an address that's already gone answers the same: the link did its job
      if (q.remove.run(h, t).changes) console.log('notify: an address was removed');
      return out(200, { ok: true });
    }
    return out(404, { ok: false });
  } catch (e) {
    console.error('notify:', e.message);
    return out(500, { ok: false, reason: 'failed' });
  }
}
