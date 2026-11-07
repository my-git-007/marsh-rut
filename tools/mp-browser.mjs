// Two players log in through the real start screen and each walks into their own marsh.
//   node tools/mp-browser.mjs <gameUrl> <wsUrl> <outDir>
// Against a local server started with MARSH_AUTH=off (the game then shows a name-only test login).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch {
  puppeteer = require('C:/Users/16138/node_modules/puppeteer');
}
const [game, wsUrl, out] = process.argv.slice(2);
const launch = () =>
  puppeteer.launch({
    headless: 'new',
    protocolTimeout: 600000,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
const browsers = [];
const visible = (sel) =>
  `(() => { const e = document.querySelector('${sel}'); return e && e.offsetParent !== null; })()`;
async function player(name, stand, shots) {
  const browser = await launch();
  browsers.push(browser); // a browser each, like two different computers
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 600 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text());
  });
  await page.goto(`${game}?server=${encodeURIComponent(wsUrl)}`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(visible('#f-login'), { timeout: 120000 });
  if (shots) await page.screenshot({ path: `${out}/login.png` });
  await page.type('#li-email', name);
  await page.$eval('#f-login button.primary', (b) => b.click());
  await page.waitForFunction(visible('#v-in') + ' && ' + visible('#go'), { timeout: 20000 });
  await page.select('#pstand', String(stand));
  if (shots) await page.screenshot({ path: `${out}/logged-in.png` });
  await page.$eval('#go', (el) => el.click());
  await page.waitForFunction(() => document.getElementById('go').textContent === 'Climb into the stand', {
    timeout: 60000,
  });
  const netmsg = await page.$eval('#netmsg', (e) => e.textContent);
  await page.$eval('#go', (el) => el.click());
  return { page, errs, name, netmsg };
}
const a = await player('Alice', 0, true),
  b = await player('Bob', 0, false);
await new Promise((r) => setTimeout(r, 12000));
for (const p of [a, b]) {
  const info = await p.page.evaluate(() => ({
    others: document.getElementById('others').textContent,
    me: [window.__marsh.PLAYER.name, window.__marsh.PLAYER.stand],
    wind: document.getElementById('windtxt').textContent,
    animals: window.__marsh.ANIMALS.map((x) => `${x.kind}@${Math.round(x.x)},${Math.round(x.z)}`).sort(),
  }));
  console.log(p.name, JSON.stringify({ netmsg: p.netmsg, ...info }));
  if (p.errs.length) console.log('  errors:', p.errs.slice(0, 5));
  await p.page.screenshot({ path: `${out}/marsh-${p.name}.png` });
}
for (const b of browsers) await b.close();
