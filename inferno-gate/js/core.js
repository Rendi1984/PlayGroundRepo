'use strict';
// Shared math, noise and 2D painting helpers used by every other module.
const TAU = Math.PI * 2;
let SEED = 1;
function srand(s) { SEED = (s >>> 0) || 1; }
function rnd() { SEED = (SEED * 16807) % 2147483647; return (SEED - 1) / 2147483646; }
const rr = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
function normA(a) { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; }
function hash2(a, b) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// periodic value noise on an n x n lattice
function makeNoise(n) {
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    const xa = ((x0 % n) + n) % n, ya = ((y0 % n) + n) % n, xb = (xa + 1) % n, yb = (ya + 1) % n;
    return lerp(lerp(g[ya * n + xa], g[ya * n + xb], fx), lerp(g[yb * n + xa], g[yb * n + xb], fx), fy);
  };
}
// tileable fractal noise; u,v in pixels of a square of size S
function makeFbm(base) {
  const ns = [0, 1, 2, 3, 4, 5].map(o => makeNoise(base << o));
  return (u, v, S, oct = 4, gain = 0.5) => {
    let s = 0, a = 1, t = 0;
    for (let o = 0; o < oct; o++) { const f = (base << o) / S; s += ns[o](u * f, v * f) * a; t += a; a *= gain; }
    return s / t;
  };
}
// tileable cellular noise: returns [nearest, second nearest] distance in cell units
function makeWorley(cells, S) {
  const pts = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + rnd()) * S / cells, (j + rnd()) * S / cells]);
  const cs = S / cells, out = [0, 0];
  return (u, v) => {
    let d1 = 1e9, d2 = 1e9;
    const ci = Math.floor(u / cs), cj = Math.floor(v / cs);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      let ii = ci + di, jj = cj + dj, ox = 0, oy = 0;
      if (ii < 0) { ii += cells; ox = -S; } else if (ii >= cells) { ii -= cells; ox = S; }
      if (jj < 0) { jj += cells; oy = -S; } else if (jj >= cells) { jj -= cells; oy = S; }
      const p = pts[jj * cells + ii], dx = p[0] + ox - u, dy = p[1] + oy - v, d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    out[0] = d1 / cs; out[1] = d2 / cs; return out;
  };
}

// ---------- colors ----------
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// f in -1..1: darken (negative) or lighten (positive)
function css(c, f = 0, a = 1) {
  let [r, g, b] = typeof c === 'string' ? hexRgb(c) : c;
  if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  else if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

// ---------- 2D painting toolkit (light comes from the upper left) ----------
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rrect(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// shaded ellipse
function ball(g, x, y, rx, ry, col, rot = 0, hi = 0.5, lo = 0.65) {
  const m = Math.max(rx, ry);
  const gr = g.createRadialGradient(x - rx * 0.35, y - ry * 0.42, m * 0.04, x, y, m * 1.05);
  gr.addColorStop(0, css(col, hi)); gr.addColorStop(0.5, css(col, 0)); gr.addColorStop(1, css(col, -lo));
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill();
}
// shaded tapered capsule from (x1,y1) radius w1 to (x2,y2) radius w2
function limb(g, x1, y1, x2, y2, w1, w2, col, hi = 0.35, lo = 0.62) {
  const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a), ny = Math.cos(a);
  const s = nx + ny > 0 ? -1 : 1; // start the gradient on the upper-left side
  const gr = g.createLinearGradient(x1 + nx * w1 * s, y1 + ny * w1 * s, x1 - nx * w1 * s, y1 - ny * w1 * s);
  gr.addColorStop(0, css(col, hi)); gr.addColorStop(0.45, css(col, 0)); gr.addColorStop(1, css(col, -lo));
  g.fillStyle = gr; g.beginPath();
  g.moveTo(x1 + nx * w1, y1 + ny * w1); g.lineTo(x2 + nx * w2, y2 + ny * w2);
  g.arc(x2, y2, w2, a + Math.PI / 2, a - Math.PI / 2, true);
  g.lineTo(x1 - nx * w1, y1 - ny * w1);
  g.arc(x1, y1, w1, a - Math.PI / 2, a + Math.PI / 2, true);
  g.closePath(); g.fill();
}
// vertical cylinder look (metal parts, barrels)
function cyl(g, x, y, w, h, col, r = 4, hi = 0.4, lo = 0.7) {
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, css(col, -lo * 0.7)); gr.addColorStop(0.28, css(col, hi)); gr.addColorStop(0.55, css(col, 0)); gr.addColorStop(1, css(col, -lo));
  g.fillStyle = gr; rrect(g, x, y, w, h, r); g.fill();
}
// horizontal cylinder look
function hcyl(g, x, y, w, h, col, r = 4, hi = 0.4, lo = 0.7) {
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, css(col, -lo * 0.5)); gr.addColorStop(0.3, css(col, hi)); gr.addColorStop(0.6, css(col, 0)); gr.addColorStop(1, css(col, -lo));
  g.fillStyle = gr; rrect(g, x, y, w, h, r); g.fill();
}
function glowDot(g, x, y, r, inner, outer) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, inner); gr.addColorStop(0.45, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function poly(g, p, col) {
  if (col) g.fillStyle = col;
  g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.closePath(); g.fill();
}
// shaded horn / spike / tooth from a base centered at (x1,y1) of width w to tip (x2,y2)
function spike(g, x1, y1, x2, y2, w, col) {
  const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a) * w / 2, ny = Math.cos(a) * w / 2;
  const gr = g.createLinearGradient(x1 + nx, y1 + ny, x1 - nx, y1 - ny);
  gr.addColorStop(0, css(col, 0.3)); gr.addColorStop(1, css(col, -0.55));
  g.fillStyle = gr; g.beginPath(); g.moveTo(x1 + nx, y1 + ny); g.lineTo(x2, y2); g.lineTo(x1 - nx, y1 - ny); g.closePath(); g.fill();
}
function splat(g, x, y, r, col = '#8a0a06') {
  g.fillStyle = css(col); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  for (let i = 0; i < 5; i++) { const a = rnd() * TAU, d = r * (0.8 + rnd() * 0.9); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.2 + rnd() * 0.3), 0, TAU); g.fill(); }
}
// dark 1px outline around opaque pixels, and hard alpha so cutout edges stay crisp
function outline(c, col = [14, 7, 6]) {
  const g = c.getContext('2d'), w = c.width, h = c.height, id = g.getImageData(0, 0, w, h), d = id.data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (a[i]) { d[i * 4 + 3] = 255; continue; }
    if ((x > 0 && a[i - 1]) || (x < w - 1 && a[i + 1]) || (y > 0 && a[i - w]) || (y < h - 1 && a[i + w])) {
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
    } else d[i * 4 + 3] = 0;
  }
  g.putImageData(id, 0, 0);
}
