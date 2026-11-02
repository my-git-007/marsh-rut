// Headless check: open the built game, wait for the marsh, screenshot, report errors.
//   node tools/smoke.mjs <url> <out.png> [waitSeconds]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let puppeteer; try { puppeteer = require('puppeteer'); } catch { puppeteer = require('C:/Users/16138/node_modules/puppeteer'); }
const [url, out, wait = '12'] = process.argv.slice(2);
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'load', timeout: 120000 });
await new Promise(r => setTimeout(r, +wait * 1000));
const info = await page.evaluate(() => ({ err: document.getElementById('err').textContent, go: document.getElementById('go').textContent, debug: document.getElementById('debug').textContent, others: document.getElementById('others').textContent, log: (window.__log || []).slice(-8), frames: document.title, views: (window.__marsh ? window.__marsh.ANIMALS.map(a => a.kind + '@' + Math.round(a.x) + ',' + Math.round(a.z) + (a.M.root.visible ? ' vis' : ' hid')) : []), player: window.__marsh && [window.__marsh.PLAYER.x, window.__marsh.PLAYER.z, window.__marsh.PLAYER.eye], gtime: window.__marsh && window.__marsh.G.time }));
await page.screenshot({ path: out });
console.log(JSON.stringify(info, null, 1)); console.log('console:', errs.slice(0, 15).join('\n'));
await browser.close();
