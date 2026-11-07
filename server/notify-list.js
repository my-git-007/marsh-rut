// Prints the "notify me" list as CSV, oldest first. Read-only.
// Default: the confirmed addresses (they clicked the link in the confirmation email), each with its own removal link
// to put in the launch email (Canada's anti-spam law needs a working unsubscribe link in it). --all: every row,
// including unconfirmed ones and any from before the confirmation step.
//   node server/notify-list.js [--all]    on Fly: flyctl ssh console -a marsh-rut -C "node server/notify-list.js"
import { DatabaseSync } from 'node:sqlite';

const all = process.argv.includes('--all');
const SITE = (process.env.GAME_URL || 'https://hunting.ltd/').replace(/\/?$/, '/');
const db = new DatabaseSync(process.env.NOTIFY_DB || 'data/notify.db', { readOnly: true });
const cols = db
  .prepare('PRAGMA table_info(notify)')
  .all()
  .map((c) => c.name);
const col = (c) => (cols.includes(c) ? c : 'NULL');
const rows = db
  .prepare(
    `SELECT email, created_at, ${col('confirmed_at')} AS confirmed_at, ${col('unsub')} AS unsub FROM notify
     ${all ? '' : `WHERE ${col('confirmed_at')} IS NOT NULL`} ORDER BY created_at, email`,
  )
  .all();
// every field quoted; a leading = + - @ gets a ' so a spreadsheet shows it as text, not a formula
const cell = (v) => '"' + (/^[=+\-@\t\r]/.test(String(v ?? '')) ? "'" : '') + String(v ?? '').replace(/"/g, '""') + '"';
console.log('email,signed_up_utc,confirmed_utc,remove_link');
for (const r of rows) {
  const remove = r.unsub ? `${SITE}notify/?a=remove&t=${r.unsub}` : '';
  console.log([r.email, r.created_at, r.confirmed_at, remove].map(cell).join(','));
}
console.error(`${rows.length} ${all ? '' : 'confirmed '}address(es)`);
