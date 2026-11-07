// Prints the "notify me" list as CSV (email,signed_up_utc), oldest first. Read-only.
//   node server/notify-list.js            on Fly: flyctl ssh console -a marsh-rut -C "node server/notify-list.js"
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync(process.env.NOTIFY_DB || 'data/notify.db', { readOnly: true });
const rows = db.prepare('SELECT email, created_at FROM notify ORDER BY created_at, email').all();
// every field quoted; a leading = + - @ gets a ' so a spreadsheet shows it as text, not a formula
const cell = (v) => '"' + (/^[=+\-@\t\r]/.test(String(v)) ? "'" : '') + String(v).replace(/"/g, '""') + '"';
console.log('email,signed_up_utc');
for (const r of rows) console.log(`${cell(r.email)},${cell(r.created_at)}`);
console.error(`${rows.length} address(es)`);
