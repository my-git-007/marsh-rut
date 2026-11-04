// render/textures.js — split out of the original single-file game (game.src.html)
import * as THREE from 'three';
import { PI, TAU, clamp, hexRgb, lerp, pick, rand, randi } from '../../../shared/util.js';
import { renderer } from './core.js';

/* ================= textures ================= */
function mkC(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function vc(h, k = 1, j = 10) {
  const c = hexRgb(h);
  return `rgb(${clamp(c[0] * k + rand(-j, j), 0, 255) | 0},${clamp(c[1] * k + rand(-j, j), 0, 255) | 0},${clamp(c[2] * k + rand(-j, j), 0, 255) | 0})`;
}
function toTex(c, srgb = true, rep = false) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.encoding = THREE.sRGBEncoding;
  if (rep) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}
function wrapStroke(g, S, fn) {
  fn(0, 0);
  fn(-S, 0);
  fn(S, 0);
  fn(0, -S);
  fn(0, S);
}
function paintDetail(base, cols, n, maxL) {
  const S = 512,
    c = mkC(S, S),
    g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) {
    const x = rand(0, S),
      y = rand(0, S),
      a = rand(0, TAU),
      l = rand(2, maxL);
    g.strokeStyle = vc(pick(cols), 1, 10);
    g.globalAlpha = rand(0.3, 0.9);
    g.lineWidth = rand(0.6, 1.9);
    const draw = (ox, oy) => {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    };
    draw(0, 0);
    if (x > S - maxL) draw(-S, 0);
    if (y > S - maxL) draw(0, -S);
    if (x < maxL) draw(S, 0);
    if (y < maxL) draw(0, S);
  }
  g.globalAlpha = 1;
  return c;
}
function paintFur() {
  const S = 256,
    c = mkC(S, S),
    g = c.getContext('2d');
  g.fillStyle = '#d4d4d4';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const x = rand(0, S),
      y = rand(0, S),
      l = rand(3, 12),
      a = PI / 2 + rand(-0.35, 0.35);
    const v = randi(150, 255);
    g.strokeStyle = `rgba(${v},${v},${v},${rand(0.25, 0.6)})`;
    g.lineWidth = rand(0.5, 1.4);
    for (const [ox, oy] of [
      [0, 0],
      [-S, 0],
      [0, -S],
      [S, 0],
      [0, S],
    ]) {
      g.beginPath();
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      g.stroke();
    }
  }
  return c;
}
function paintGrassCard() {
  const W = 512,
    H = 512,
    c = mkC(W, H),
    g = c.getContext('2d');
  const pal = [
    '#cdb27a',
    '#b99a5c',
    '#d8c48e',
    '#a8864e',
    '#c2a265',
    '#9b7a45',
    '#e0cf9c',
    '#bfa36a',
    '#8f8a52',
    '#a3703f',
    '#c9a96b',
  ];
  for (let i = 0; i < 360; i++) {
    const x0 = 14 + Math.random() * 484,
      h = H * (0.4 + 0.6 * Math.pow(Math.random(), 0.65)),
      lean = (Math.random() - 0.5) * 120,
      w = 1.7 + Math.random() * 3.6;
    const base = pick(pal),
      k = 0.8 + Math.random() * 0.35;
    const gr = g.createLinearGradient(0, H, 0, H - h);
    gr.addColorStop(0, vc(base, 0.45 * k, 3));
    gr.addColorStop(0.35, vc(base, 0.85 * k, 5));
    gr.addColorStop(1, vc(base, 1.12 * k, 8));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0 - w / 2, H);
    g.quadraticCurveTo(x0 - w / 2 + lean * 0.25, H - h * 0.55, x0 + lean, H - h);
    g.quadraticCurveTo(x0 + w / 2 + lean * 0.25, H - h * 0.55, x0 + w / 2, H);
    g.closePath();
    g.fill();
    if (Math.random() < 0.13) {
      const tx = x0 + lean,
        ty = H - h;
      g.fillStyle = vc(pick(['#8a7460', '#a08c6c', '#76604e', '#9a8a70']), 1, 8);
      for (let s = 0; s < 14; s++) {
        const u = s / 14;
        g.beginPath();
        g.ellipse(tx - lean * 0.12 * u + (Math.random() - 0.5) * 7, ty + u * 58, 1.7, 4.6, lean * 0.003, 0, TAU);
        g.fill();
      }
    }
  }
  return c;
}
function paintCattail() {
  const W = 512,
    H = 512,
    c = mkC(W, H),
    g = c.getContext('2d');
  const pal = ['#6f7240', '#8a8448', '#a39552', '#5d6436', '#b9a660', '#7c7038'];
  for (let i = 0; i < 120; i++) {
    const x0 = 40 + Math.random() * 432,
      h = H * (0.55 + 0.45 * Math.random()),
      lean = (Math.random() - 0.5) * 160,
      w = 3 + Math.random() * 5;
    const base = pick(pal);
    const gr = g.createLinearGradient(0, H, 0, H - h);
    gr.addColorStop(0, vc(base, 0.35, 3));
    gr.addColorStop(0.4, vc(base, 0.8, 6));
    gr.addColorStop(1, vc(pick(['#c2ad6a', '#a89458', '#8a7a48']), 1, 8));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0 - w / 2, H);
    g.quadraticCurveTo(x0 + lean * 0.3, H - h * 0.6, x0 + lean, H - h);
    g.quadraticCurveTo(x0 + w / 2 + lean * 0.3, H - h * 0.6, x0 + w / 2, H);
    g.fill();
  }
  for (let i = 0; i < 9; i++) {
    const x = 60 + Math.random() * 392,
      top = H * (0.02 + Math.random() * 0.2);
    g.strokeStyle = '#6a6438';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(x, H);
    g.lineTo(x + rand(-6, 6), top);
    g.stroke();
    g.fillStyle = vc('#5a3a22', 1, 10);
    g.beginPath();
    g.ellipse(x, top + 42, 7, 32, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,240,210,.12)';
    g.fillRect(x - 2, top + 14, 2, 50);
  }
  return c;
}
function paintBushTile(g, ox, oy, W, H, pal, leafL, stemCol) {
  const stems = [];
  for (let i = 0; i < 28; i++) {
    const ang = -PI / 2 + (Math.random() - 0.5) * 1.9,
      L = H * (0.4 + 0.5 * Math.random());
    stems.push({ x: ox + W / 2 + (Math.random() - 0.5) * W * 0.16, y: oy + H, ang, L });
  }
  g.strokeStyle = stemCol;
  for (const s of stems) {
    g.lineWidth = rand(1.5, 3.5);
    g.beginPath();
    g.moveTo(s.x, s.y);
    s.ex = s.x + Math.cos(s.ang) * s.L;
    s.ey = s.y + Math.sin(s.ang) * s.L;
    g.quadraticCurveTo(s.x + Math.cos(s.ang) * s.L * 0.3, s.y + Math.sin(s.ang) * s.L * 0.62, s.ex, s.ey);
    g.stroke();
  }
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < 2600; i++) {
      const s = pick(stems),
        u = Math.pow(Math.random(), 0.55);
      let x = lerp(s.x, s.ex, u) + (Math.random() - 0.5) * W * 0.2 * u,
        y = lerp(s.y, s.ey, u) + (Math.random() - 0.5) * H * 0.14 * u;
      {
        const ex = (x - (ox + W / 2)) / (W * 0.46),
          ey = (y - (oy + H * 0.62)) / (H * 0.56);
        if (ex * ex + ey * ey > 1 || y > oy + H - 3) continue;
      }
      const hl = 1 - (y - oy) / H;
      const lk = (pass ? 0.85 : 0.5) + 0.35 * hl;
      g.fillStyle = vc(pick(pal), lk, 10);
      g.save();
      g.translate(x, y);
      g.rotate(rand(-1.2, 1.2) + (Math.random() < 0.5 ? 0 : PI));
      g.beginPath();
      g.ellipse(0, 0, leafL * rand(0.6, 1), leafL * rand(0.22, 0.34), 0, 0, TAU);
      g.fill();
      g.restore();
    }
}
function paintConifer(g, ox, oy, W, H, o) {
  const cx = ox + W / 2,
    top = oy + H * 0.012,
    cb = oy + H * o.crownBase;
  g.fillStyle = '#2b221b';
  g.beginPath();
  g.moveTo(cx - W * 0.02, oy + H);
  g.lineTo(cx - W * 0.004, top + H * 0.04);
  g.lineTo(cx + W * 0.004, top + H * 0.04);
  g.lineTo(cx + W * 0.02, oy + H);
  g.fill();
  g.fillStyle = o.core;
  g.beginPath();
  g.moveTo(cx, top + H * 0.01);
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    g.lineTo(cx + W * 0.47 * o.prof(t) * 0.5, top + t * (cb - top));
  }
  for (let i = 40; i >= 0; i--) {
    const t = i / 40;
    g.lineTo(cx - W * 0.47 * o.prof(t) * 0.5, top + t * (cb - top));
  }
  g.fill();
  const NB = o.nb || 190;
  for (let i = 0; i < NB; i++) {
    const t = Math.min(1, (i + Math.random() * 0.8) / NB);
    const y = top + t * (cb - top) + rand(-3, 3);
    const R = W * 0.47 * o.prof(t) * (0.72 + 0.28 * Math.random());
    const side = (i % 2 ? 1 : -1) * (Math.random() < 0.15 ? -1 : 1);
    const len = Math.max(4, R * (0.78 + 0.22 * Math.random()));
    const droop = len * o.droop * (0.25 + t * 0.9),
      lift = len * o.tipUp,
      th = H * 0.02 * (0.55 + t * 0.9) * (o.thick || 1);
    const ex = cx + side * len,
      ey = y + droop - lift;
    const shade = 0.62 + 0.32 * (1 - t) + 0.18 * Math.random();
    g.fillStyle = vc(o.cols[0], shade * 0.62, 6);
    g.beginPath();
    g.moveTo(cx, y - th * 0.3);
    g.quadraticCurveTo(cx + side * len * 0.55, y + droop * 0.35 - th * 0.5, ex, ey);
    g.quadraticCurveTo(cx + side * len * 0.6, y + droop * 0.55 + th * 0.9, cx, y + th);
    g.closePath();
    g.fill();
    const nn = Math.max(6, Math.floor(len / 3.2));
    g.lineWidth = rand(1.1, 2);
    for (let s = 0; s < nn; s++) {
      const u = (s + Math.random()) / nn;
      const px = cx + side * len * u,
        py = y + droop * u * u * 0.9 - lift * u * u * u;
      const lk = shade * (0.72 + 0.5 * u) * (side > 0 ? 1.1 : 0.92);
      g.strokeStyle = vc(pick(o.cols), lk, 7);
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = rand(0.2, PI - 0.2);
        const l = rand(3, 7) + th * 0.35 * (1 - u * 0.5);
        g.moveTo(px, py - th * 0.15);
        g.lineTo(px + Math.cos(a) * l * 0.6 * side, py + Math.sin(a) * l);
      }
      g.stroke();
      if (Math.random() < 0.5) {
        g.strokeStyle = vc(pick(o.cols), lk * 1.25, 6);
        g.beginPath();
        g.moveTo(px, py - th * 0.25);
        g.lineTo(px + side * rand(2, 5), py - th * 0.25 - rand(1, 3));
        g.stroke();
      }
    }
  }
}
function paintDeciduous(g, ox, oy, W, H, o) {
  const cx = ox + W / 2;
  const tb = oy + H,
    tt = oy + H * 0.22;
  g.fillStyle = o.bark;
  g.beginPath();
  g.moveTo(cx - W * 0.03, tb);
  g.quadraticCurveTo(cx - W * 0.02, oy + H * 0.6, cx - W * 0.008, tt);
  g.lineTo(cx + W * 0.008, tt);
  g.quadraticCurveTo(cx + W * 0.02, oy + H * 0.6, cx + W * 0.03, tb);
  g.fill();
  g.fillStyle = 'rgba(20,18,16,.75)';
  for (let k = 0; k < 50; k++) {
    const y = rand(oy + H * 0.35, tb);
    g.beginPath();
    g.ellipse(cx + rand(-W * 0.015, W * 0.015), y, rand(2, 6), rand(1, 2.5), 0, 0, TAU);
    g.fill();
  }
  g.strokeStyle = o.bark;
  for (let k = 0; k < 16; k++) {
    const y = rand(oy + H * 0.25, oy + H * 0.62),
      s = Math.random() < 0.5 ? -1 : 1,
      l = W * rand(0.12, 0.3);
    g.lineWidth = rand(1.5, 3);
    g.beginPath();
    g.moveTo(cx, y);
    g.quadraticCurveTo(cx + s * l * 0.5, y - l * 0.2, cx + s * l, y - l * 0.55);
    g.stroke();
  }
  const cl = [];
  for (let k = 0; k < 13; k++) {
    const yy = rand(0.06, 0.6);
    cl.push({ x: cx + rand(-0.3, 0.3) * W * (0.7 + 0.5 * yy), y: oy + H * yy, r: W * rand(0.14, 0.22) });
  }
  for (const c of cl) {
    g.fillStyle = vc(o.cols[3], 0.55, 6);
    g.beginPath();
    g.ellipse(c.x, c.y, c.r * 0.8, c.r * 0.85, 0, 0, TAU);
    g.fill();
  }
  for (let pass = 0; pass < 2; pass++)
    for (let i = 0; i < 2300; i++) {
      const c = pick(cl),
        a = rand(0, TAU),
        r = Math.sqrt(Math.random()) * c.r;
      const x = c.x + Math.cos(a) * r,
        y = c.y + Math.sin(a) * r * 1.1;
      const lk = (pass ? 0.78 : 0.45) + 0.45 * clamp(((c.y - y) / c.r) * 0.5 + ((x - c.x) / c.r) * 0.3 + 0.5, 0, 1);
      g.fillStyle = vc(pick(o.cols), lk, 10);
      g.beginPath();
      g.ellipse(x, y, rand(2.5, 5.5), rand(2, 4), rand(0, PI), 0, TAU);
      g.fill();
    }
}
function paintSnag(g, ox, oy, W, H) {
  const cx = ox + W / 2;
  g.fillStyle = '#7d776c';
  g.beginPath();
  g.moveTo(cx - W * 0.035, oy + H);
  g.lineTo(cx - W * 0.006, oy + H * 0.1);
  g.lineTo(cx + W * 0.006, oy + H * 0.1);
  g.lineTo(cx + W * 0.035, oy + H);
  g.fill();
  g.strokeStyle = '#6e695f';
  for (let k = 0; k < 70; k++) {
    const t = rand(0.12, 0.85),
      y = oy + H * t,
      s = Math.random() < 0.5 ? -1 : 1,
      l = W * rand(0.03, 0.2) * (0.4 + t);
    g.lineWidth = rand(1, 2.5);
    g.beginPath();
    g.moveTo(cx, y);
    g.lineTo(cx + s * l, y + l * rand(-0.2, 0.4));
    g.stroke();
  }
}
function paintBranch() {
  const W = 512,
    H = 256,
    c = mkC(W, H),
    g = c.getContext('2d');
  const cols = ['#22301f', '#2c3b26', '#1b2618', '#34452c', '#3a4c30'];
  g.strokeStyle = '#3a2c20';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, H / 2);
  g.quadraticCurveTo(W * 0.5, H * 0.52, W * 0.97, H * 0.45);
  g.stroke();
  for (let i = 0; i < 26; i++) {
    const u = rand(0.05, 0.95),
      x = u * W,
      y = H / 2 - u * 12,
      s = Math.random() < 0.5 ? -1 : 1,
      l = H * rand(0.18, 0.42) * (1.1 - u * 0.6);
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + l * 0.6, y + s * l);
    g.stroke();
  }
  for (let i = 0; i < 5200; i++) {
    const u = Math.pow(Math.random(), 0.9),
      x = u * W * 0.98 + rand(-10, 10),
      spread = H * 0.45 * (1.05 - u * 0.55);
    const y = H / 2 - u * 12 + (Math.random() - 0.5) * 2 * spread * Math.sqrt(Math.random());
    const a = rand(0, TAU),
      l = rand(5, 11);
    g.strokeStyle = vc(pick(cols), 0.8 + 0.5 * Math.random(), 6);
    g.lineWidth = rand(1, 1.8);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return c;
}
function paintBark() {
  const W = 128,
    H = 512,
    c = mkC(W, H),
    g = c.getContext('2d');
  g.fillStyle = '#4a3e34';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const x = rand(0, W),
      y = rand(0, H),
      w = rand(6, 22),
      h = rand(8, 30);
    g.fillStyle = vc(pick(['#5c4e42', '#3a3028', '#6a5c4e', '#2e2620', '#54483c']), 1, 8);
    g.beginPath();
    g.ellipse(x, y, w / 2, h / 2, rand(-0.2, 0.2), 0, TAU);
    g.fill();
  }
  return c;
}
function makeTextures() {
  T.marsh = toTex(
    paintDetail('#8a8070', ['#a89c84', '#7c705e', '#968a74', '#5e5446', '#b8ab90', '#6e6656'], 24000, 15),
    false,
    true,
  );
  T.forest = toTex(
    paintDetail('#6a6858', ['#7a6a50', '#4a4436', '#5a6444', '#3a3a2e', '#8a7656', '#4e5a3c'], 22000, 9),
    false,
    true,
  );
  T.fur = toTex(paintFur(), false, true);
  T.fur.repeat.set(5, 5);
  T.grass = toTex(paintGrassCard());
  T.cattail = toTex(paintCattail());
  const bc = mkC(1024, 512),
    bg = bc.getContext('2d');
  paintBushTile(bg, 0, 0, 512, 512, ['#6c6a34', '#a38e38', '#7a5228', '#5e6448', '#957a34', '#525e34'], 11, '#4a3a2a');
  paintBushTile(bg, 512, 0, 512, 512, ['#4e5a2e', '#5f6a34', '#6e5a2a', '#3e4a28', '#7a6a34'], 9, '#3a3028');
  T.bush = toTex(bc);
  const tc = mkC(2048, 2048),
    tg = tc.getContext('2d');
  const spruceCols = ['#22301f', '#2c3b26', '#1b2618', '#34452c', '#283a2a', '#3a4a33'];
  paintConifer(tg, 0, 0, 512, 1024, {
    crownBase: 0.95,
    prof: (t) => Math.pow(t, 0.7),
    n: 1300,
    dens: 0.8,
    droop: 0.35,
    tipUp: 0.12,
    cols: spruceCols,
    core: 'rgba(14,20,14,.92)',
  });
  paintConifer(tg, 512, 0, 512, 1024, {
    crownBase: 0.93,
    prof: (t) => Math.pow(t, 0.62) * (0.92 + 0.08 * Math.sin(t * 30)),
    n: 1200,
    dens: 0.78,
    droop: 0.45,
    tipUp: 0.15,
    cols: spruceCols,
    core: 'rgba(14,20,14,.92)',
  });
  paintConifer(tg, 1024, 0, 512, 1024, {
    nb: 150,
    thick: 0.8,
    crownBase: 0.92,
    prof: (t) => (t < 0.13 ? 0.55 * Math.sin((t / 0.13) * PI) + 0.12 : 0.28 + 0.32 * t) * 0.85,
    n: 1000,
    dens: 0.85,
    droop: 0.5,
    tipUp: 0.05,
    cols: ['#1f2a1c', '#27331f', '#18201a', '#2c3622'],
    core: 'rgba(12,16,12,.92)',
  });
  paintConifer(tg, 1536, 0, 512, 1024, {
    crownBase: 0.9,
    prof: (t) => t * 0.95,
    n: 1200,
    dens: 0.8,
    droop: 0.18,
    tipUp: 0.2,
    cols: ['#22341f', '#2c4226', '#1c2a18', '#33482a'],
    core: 'rgba(14,22,14,.92)',
  });
  paintDeciduous(tg, 0, 1024, 512, 1024, {
    bark: '#c9c4b2',
    cols: ['#e3b53a', '#d79a28', '#f0cd5a', '#c4862a', '#e8c24a', '#9aa53a'],
  });
  paintDeciduous(tg, 512, 1024, 512, 1024, {
    bark: '#ddd8cc',
    cols: ['#d9a830', '#e6bd45', '#c98a26', '#b0762a', '#efd06a'],
  });
  paintConifer(tg, 1024, 1024, 512, 1024, {
    crownBase: 0.9,
    prof: (t) => Math.pow(t, 0.7) * 0.85,
    n: 900,
    dens: 0.8,
    droop: 0.2,
    tipUp: 0.1,
    cols: ['#c99a3a', '#d9ad4a', '#b88a30', '#a87a2a', '#e0bc5a'],
    core: 'rgba(90,64,24,.55)',
  });
  paintSnag(tg, 1536, 1024, 512, 1024);
  T.trees = toTex(tc);
  T.branch = toTex(paintBranch());
  T.bark = toTex(paintBark(), true, true);
}
const T = {};

export {
  T,
  makeTextures,
  mkC,
  paintBark,
  paintBranch,
  paintBushTile,
  paintCattail,
  paintConifer,
  paintDeciduous,
  paintDetail,
  paintFur,
  paintGrassCard,
  paintSnag,
  toTex,
  vc,
  wrapStroke,
};
