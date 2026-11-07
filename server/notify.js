// The "Coming early 2027" list on the front page (client/index.html): POST /notify {email} keeps the address in
// a small SQLite database, so we can email everyone when the game goes live.
//
//   NOTIFY_DB   where the database file lives (default data/notify.db). On Fly it is /data/notify.db, on the
//               volume mounted at /data (fly.toml), so the list survives deploys and restarts.
//   List it:    node server/notify-list.js   (on Fly: flyctl ssh console -a marsh-rut -C "node server/notify-list.js")
//
// SQLite comes with Node 22.13 and later (node:sqlite). On an older Node the list is off: /notify answers 503 and
// everything else on the server works as before.
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import { readBody, allow, EMAIL_RE } from './mail.js';

export const NOTIFY_DB = process.env.NOTIFY_DB || 'data/notify.db';
let add = null;
try {
  const { DatabaseSync } = await import('node:sqlite');
  mkdirSync(dirname(NOTIFY_DB), { recursive: true });
  const db = new DatabaseSync(NOTIFY_DB);
  // WAL + synchronous NORMAL: a sign-up doesn't wait for a disk flush on the thread that runs every marsh
  db.exec(`PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS notify (
      email      TEXT PRIMARY KEY COLLATE NOCASE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )`);
  add = db.prepare('INSERT OR IGNORE INTO notify (email) VALUES (?)');
} catch (e) {
  console.error('notify: list off —', e.message);
}
export const NOTIFY_ON = !!add;

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
  const email = String((b && b.email) || '')
    .trim()
    .toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return out(400, { ok: false, reason: 'invalid' });
  if (!allow([['n:' + ip, 10, 3600000]])) return out(429, { ok: false, reason: 'limit' });
  try {
    // an address already on the list gets the same answer, so the form doesn't reveal who signed up
    if (add.run(email).changes) console.log('notify: an address was added');
    return out(200, { ok: true });
  } catch (e) {
    console.error('notify:', e.message);
    return out(500, { ok: false, reason: 'failed' });
  }
}
