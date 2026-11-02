// Refuses to continue while sounds that may not be published are in client/assets/sounds.
// Used by the GitHub Pages workflow; run it yourself with `npm run check:sounds`.
import fs from 'fs'; import path from 'path';
const root = 'client/assets/sounds'; const src = JSON.parse(fs.readFileSync(path.join(root, 'sources.json'), 'utf8'));
const AUDIO = /\.(m4a|mp3|wav|ogg|aac|flac)$/i; let bad = 0;
for (const dir of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const files = []; (function walk(p) { for (const e of fs.readdirSync(p, { withFileTypes: true })) e.isDirectory() ? walk(path.join(p, e.name)) : AUDIO.test(e.name) && files.push(e.name); })(path.join(root, dir.name));
  const info = src[dir.name];
  if (!files.length) continue;
  if (!info || info.public !== true) { bad += files.length; console.log(`NOT CLEARED  ${dir.name}/ (${files.length} files) — ${info ? info.source + '; ' + (info.license || '') : 'no entry in sources.json'}`); }
  else console.log(`ok           ${dir.name}/ (${files.length} files) — ${info.source}`);
}
if (bad) { console.log(`\n${bad} sound file(s) may not be published. Replace them (see SOUNDS.md) before a public build.`); process.exit(1); }
console.log('\nAll sounds are cleared for publishing.');
