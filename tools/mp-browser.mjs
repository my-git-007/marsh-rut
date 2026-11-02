// Two browsers join a local marsh server through the real start screen; checks they share the animals.
//   node tools/mp-browser.mjs <gameUrl> <wsUrl> <outDir>
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer'); } catch { puppeteer = require('C:/Users/16138/node_modules/puppeteer'); }
const [game, wsUrl, out] = process.argv.slice(2);
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
async function player(name, stand) {
  const page = await browser.newPage(); await page.setViewport({ width: 960, height: 540 }); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
  await page.goto(`${game}?server=${encodeURIComponent(wsUrl)}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.getElementById('go').textContent === 'Join the marsh', { timeout: 120000 });
  await page.$eval('#pname', (el) => { el.value = ''; }); await page.type('#pname', name); await page.select('#pstand', String(stand));
  await page.$eval('#go', (el) => el.click());
  await page.waitForFunction(() => document.getElementById('go').textContent === 'Climb into the stand', { timeout: 120000 });
  await page.$eval('#go', (el) => el.click());
  return { page, errs, name };
}
const a = await player('Alice', 0), b = await player('Bob', 2);
await new Promise((r) => setTimeout(r, 15000));
for (const p of [a, b]) {
  await p.page.bringToFront(); await new Promise((r) => setTimeout(r, 4000));
  const info = await p.page.evaluate(() => ({ others: document.getElementById('others').textContent, netmsg: document.getElementById('netmsg').textContent, me: [window.__marsh.PLAYER.name, window.__marsh.PLAYER.stand], animals: window.__marsh.ANIMALS.map((x) => `${x.kind}#${x.id}@${Math.round(x.x)},${Math.round(x.z)}`).sort() }));
  console.log(p.name, JSON.stringify(info)); if (p.errs.length) console.log('  errors:', p.errs.slice(0, 5));
  await p.page.screenshot({ path: `${out}/mp-${p.name}.png` });
}
await browser.close();
