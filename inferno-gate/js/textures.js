'use strict';
// Procedural world textures. Every texture is 128x128 = one world unit, with
// RGB color + A emissive mask, plus a tangent-space normal map from a height field.
// Generator coordinates have y pointing UP (row 0 = bottom of a wall).
const TS = 128;
const TEX = {};
let TEX_ANISO = 1;

function genTex(fn, bump) {
  const col = new Uint8Array(TS * TS * 4), hgt = new Float32Array(TS * TS), o = [0, 0, 0, 0.5, 0];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    o[0] = o[1] = o[2] = 0; o[3] = 0.5; o[4] = 0;
    fn(x, y, o);
    const i = y * TS + x;
    col[i * 4] = clamp(o[0], 0, 255); col[i * 4 + 1] = clamp(o[1], 0, 255); col[i * 4 + 2] = clamp(o[2], 0, 255);
    col[i * 4 + 3] = clamp(o[4] * 255, 0, 255);
    hgt[i] = o[3];
  }
  const nor = new Uint8Array(TS * TS * 4);
  const H = (x, y) => hgt[((y + TS) % TS) * TS + ((x + TS) % TS)];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let nx = -(H(x + 1, y) - H(x - 1, y)) * bump, ny = -(H(x, y + 1) - H(x, y - 1)) * bump, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * TS + x) * 4;
    nor[i] = (nx * 0.5 + 0.5) * 255; nor[i + 1] = (ny * 0.5 + 0.5) * 255; nor[i + 2] = (nz * 0.5 + 0.5) * 255; nor[i + 3] = 255;
  }
  return { col, nor };
}
function dataTex(arr) {
  const t = new THREE.DataTexture(arr, TS, TS, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = TEX_ANISO; t.needsUpdate = true;
  return t;
}
function defTex(name, fn, bump = 3, emis = 1, stretch = false) {
  const { col, nor } = genTex(fn, bump);
  TEX[name] = { map: dataTex(col), nmap: dataTex(nor), emis, stretch };
}

function initTextures(aniso) {
  TEX_ANISO = aniso;
  srand(7);
  const F4 = makeFbm(4), F8 = makeFbm(8), F16 = makeFbm(16);
  const Wc = makeWorley(7, TS), Wf = makeWorley(14, TS);

  defTex('brick', (x, y, o) => {
    const bh = 16, bw = 32, row = Math.floor(y / bh), bx = (x + (row & 1) * 16) % TS, col = Math.floor(bx / bw);
    const lx = bx - col * bw, ly = y - row * bh;
    const n = F8(x, y, TS, 4), gr = F16(x, y, TS, 3), hv = hash2(col + row * 13, 7);
    const e = Math.min(lx, bw - 1 - lx, ly, bh - 1 - ly);
    if (e < 1.5) { const m = 0.5 + n * 0.5; o[0] = 74 * m; o[1] = 66 * m; o[2] = 58 * m; o[3] = 0.1 + n * 0.1; return; }
    const chip = n < 0.36 && e < 4;
    let k = (0.7 + hv * 0.4) * (0.78 + gr * 0.42);
    if (chip) k *= 0.7;
    o[0] = 140 * k; o[1] = 74 * k; o[2] = 50 * k;
    if (hv > 0.86) { o[0] *= 0.78; o[1] *= 0.84; o[2] *= 0.92; }
    o[3] = chip ? 0.35 : 0.55 + Math.min(1, e / 3) * 0.3 + gr * 0.12;
  }, 4);

  const techFn = (x, y, o) => {
    const px = x & 63, py = y & 63, pid = (x >> 6) + (y >> 6) * 2;
    const n = F8(x, y, TS, 4), gr = F4(x, y, TS, 3);
    const e = Math.min(px, 63 - px, py, 63 - py);
    let r = 104, g = 106, b = 112, h = 0.6, em = 0;
    if (e < 2) { r = 34; g = 34; b = 38; h = 0.05; }
    else if (e < 5) { const t = (e - 2) / 3; r = g = 152 - t * 34; b = r + 6; h = 0.25 + t * 0.35; }
    else {
      if (pid === 1 && py > 14 && py < 50 && px > 10 && px < 54) { if ((py - 14) % 6 < 3) { r = 28; g = 28; b = 32; h = 0.2; } else { r = 122; g = 124; b = 130; h = 0.65; } }
      if (pid === 2 && px > 17 && px < 47 && py > 23 && py < 41) {
        const ee = Math.min(px - 18, 46 - px, py - 24, 40 - py);
        if (ee < 2) { r = 40; g = 40; b = 44; h = 0.4; }
        else { r = 70; g = 210; b = 255; em = 1; h = 0.7; if (((px >> 2) + (py >> 2)) & 1) { r = 40; g = 150; b = 215; em = 0.8; } }
      }
      if (pid === 3 && px > 6 && px < 58) { const q = (px - 7) % 16; if (q < 9) { const t = Math.sin(q / 9 * Math.PI); r = 80 + t * 72; g = 82 + t * 72; b = 90 + t * 72; h = 0.35 + t * 0.55; } }
      if (pid === 0 && py > 8 && py < 20 && px > 8 && px < 56) { const s = ((px + py) >> 2) & 1; r = s ? 212 : 30; g = s ? 172 : 30; b = s ? 34 : 30; h = 0.62; }
    }
    for (const c of [8, 55]) for (const d of [8, 55]) { const dd = Math.hypot(px - c, py - d); if (dd < 3) { const t = 1 - dd / 3; r = g = b = 118 + t * 105; h = 0.7 + t * 0.3; em = 0; } }
    const k = 0.78 + n * 0.4, gk = 1 - Math.max(0, gr - 0.55) * 0.9;
    o[0] = r * k * gk; o[1] = g * k * gk; o[2] = b * k * gk; o[3] = h + n * 0.05; o[4] = em;
  };
  defTex('tech', techFn, 4);

  defTex('marble', (x, y, o) => {
    const n = F8(x, y, TS, 5), v = Math.abs(Math.sin(x / TS * 2 * TAU + n * 9 + F4(x, y, TS, 3) * 6)), vein = Math.pow(1 - v, 8);
    const px = x & 63, py = y & 63, e = Math.min(px, 63 - px, py, 63 - py);
    let r = 38 + n * 30 + vein * 120, g = 84 + n * 40 + vein * 130, b = 56 + n * 30 + vein * 110, h = 0.6 + n * 0.1;
    if (e < 2) { r *= 0.4; g *= 0.4; b *= 0.4; h = 0.1; } else if (e < 4) h = 0.42;
    o[0] = r; o[1] = g; o[2] = b; o[3] = h;
  }, 3);

  defTex('rock', (x, y, o) => {
    const n = F8(x, y, TS, 5), w = Wc(x, y), crack = clamp((w[1] - w[0]) * 6, 0, 1), h = n * 0.6 + (1 - w[0]) * 0.4, k = (0.42 + h * 0.85) * (0.45 + crack * 0.55);
    o[0] = 120 * k; o[1] = 58 * k; o[2] = 40 * k; o[3] = h * crack + 0.05;
  }, 6);

  defTex('flesh', (x, y, o) => {
    const w = Wf(x, y), n = F8(x, y, TS, 4), bump = Math.pow(clamp(1 - w[0], 0, 1), 1.5), vein = clamp((w[1] - w[0]) * 5, 0, 1);
    let r = 160 * (0.45 + bump * 0.65) * (0.6 + n * 0.5), g = 52 * (0.5 + bump * 0.5) * (0.6 + n * 0.5), b = 50 * (0.5 + bump * 0.5);
    if (vein < 0.25) { r *= 0.42; g *= 0.3; b *= 0.4; }
    if (bump > 0.8) { r += 40; g += 20; b += 20; }
    o[0] = r; o[1] = g; o[2] = b; o[3] = bump * 0.8 + 0.1;
  }, 5);

  const doorFn = key => (x, y, o) => {
    const n = F8(x, y, TS, 4), ex = Math.min(x, 127 - x);
    let r = 118, g = 106, b = 92, h = 0.6, em = 0;
    if (ex < 7) { r = 72; g = 68; b = 64; h = 0.85; }
    else if (ex < 9) { r = 36; g = 34; b = 32; h = 0.15; }
    else {
      const pr = y % 32;
      if (pr < 2) { r = 46; g = 42; b = 38; h = 0.12; } else if (pr < 4) { r = 168; g = 154; b = 134; h = 0.78; }
      if ((x - 12) % 26 < 3) { r *= 0.8; g *= 0.8; b *= 0.8; h = 0.45; }
      if (pr > 5 && pr < 9 && (x + 4) % 16 < 3) { r = g = b = 190; h = 0.95; }
      if (y < 14) { const s = ((x + y) >> 3) & 1; r = s ? 222 : 28; g = s ? 180 : 28; b = s ? 36 : 28; h = 0.62; }
    }
    if (key) {
      const kc = key === 'red' ? [226, 32, 24] : [46, 98, 246];
      if (ex < 7) { r = kc[0] * 0.75; g = kc[1] * 0.75; b = kc[2] * 0.75; em = 0.5; }
      const dd = Math.abs(x - 64) + Math.abs(y - 70);
      if (dd < 24 && dd > 13) { r = kc[0]; g = kc[1]; b = kc[2]; em = 1; h = 0.85; }
      if (dd <= 13) { r = 30; g = 26; b = 24; h = 0.4; }
    }
    const k = 0.75 + n * 0.45;
    o[0] = r * k; o[1] = g * k; o[2] = b * k; o[3] = h; o[4] = em;
  };
  defTex('door', doorFn(null), 4);
  defTex('reddoor', doorFn('red'), 4);
  defTex('bluedoor', doorFn('blue'), 4);

  defTex('track', (x, y, o) => {
    const n = F8(x, y, TS, 3), s = ((x + y) >> 4) & 1;
    let r = s ? 215 : 30, g = s ? 175 : 30, b = s ? 40 : 28, h = s ? 0.7 : 0.4;
    if (x < 16 || x > 111) { r = 82; g = 82; b = 88; h = 0.6; }
    const k = 0.75 + n * 0.4; o[0] = r * k; o[1] = g * k; o[2] = b * k; o[3] = h;
  }, 3);

  defTex('step', (x, y, o) => {
    const n = F8(x, y, TS, 4), py = y & 31;
    let r = 94, g = 92, b = 90, h = 0.5;
    if (py > 26) { r = 205; g = 162; b = 40; h = 0.72; } else if (py < 2) { r = 28; g = 28; b = 28; h = 0.1; }
    if ((x & 15) === 0) { r *= 0.6; g *= 0.6; b *= 0.6; }
    const k = 0.75 + n * 0.4; o[0] = r * k; o[1] = g * k; o[2] = b * k; o[3] = h;
  }, 3);

  // exit switch: tech panel + glowing EXIT sign + lever, stretched once over the wall face
  const sign = mkCanvas(TS, TS), sg = sign.getContext('2d');
  sg.fillStyle = '#fff'; sg.font = 'bold 30px Arial, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
  sg.fillText('EXIT', 64, 22);
  const mask = sg.getImageData(0, 0, TS, TS).data;
  const exitFn = on => (x, y, o) => {
    techFn(x, y, o);
    const iy = 127 - y;
    if (iy > 4 && iy < 40 && x > 16 && x < 112) {
      const m = mask[(iy * TS + x) * 4 + 3] / 255;
      o[0] = 14 + m * (on ? 60 : 255); o[1] = 10 + m * (on ? 255 : 40); o[2] = 10 + m * (on ? 90 : 30); o[3] = 0.3 + m * 0.3; o[4] = m;
      if (x < 19 || x > 109 || iy < 7 || iy > 37) { o[0] = o[1] = o[2] = 60; o[3] = 0.7; o[4] = 0; }
    }
    if (x > 44 && x < 84 && y > 22 && y < 78) {
      const e = Math.min(x - 45, 83 - x, y - 23, 77 - y);
      o[0] = o[1] = o[2] = e < 3 ? 40 : 70; o[3] = e < 3 ? 0.3 : 0.5; o[4] = 0;
      const ly = on ? 34 : 56;
      if (x > 56 && x < 72 && y > ly && y < ly + 16) { o[0] = on ? 60 : 230; o[1] = on ? 240 : 40; o[2] = on ? 80 : 30; o[3] = 0.95; o[4] = 0.9; }
    }
  };
  defTex('exitsw', exitFn(false), 4, 1, true);
  defTex('exitswOn', exitFn(true), 4, 1, true);

  // ---- floors & ceilings ----
  defTex('floor', (x, y, o) => {
    const tx = x >> 5, ty = y >> 5, px = x & 31, py = y & 31, e = Math.min(px, 31 - px, py, 31 - py);
    const n = F8(x, y, TS, 4), gr = F4(x, y, TS, 3), hv = hash2(tx, ty);
    if (e < 1.5) { o[0] = 40; o[1] = 38; o[2] = 36; o[3] = 0.1; return; }
    const k = (0.74 + hv * 0.22) * (0.75 + n * 0.45) * (1 - Math.max(0, gr - 0.5) * 0.7);
    o[0] = 98 * k; o[1] = 94 * k; o[2] = 88 * k; o[3] = 0.6 + Math.min(1, e / 3) * 0.2;
  }, 3);
  defTex('grate', (x, y, o) => {
    const n = F8(x, y, TS, 4), hole = (x & 7) < 5 && (y & 7) < 5, frame = (x & 63) < 3 || (y & 63) < 3;
    if (frame) { o[0] = o[1] = o[2] = 120 * (0.8 + n * 0.3); o[3] = 0.9; return; }
    if (hole) { o[0] = 14; o[1] = 14; o[2] = 16; o[3] = 0.05; return; }
    const k = 0.7 + n * 0.5; o[0] = 92 * k; o[1] = 92 * k; o[2] = 98 * k; o[3] = 0.65;
  }, 3);
  defTex('dirt', (x, y, o) => {
    const n = F8(x, y, TS, 5), w = Wf(x, y), peb = w[0] < 0.28 ? 1 : 0, k = 0.5 + n * 0.7;
    o[0] = (92 + peb * 30) * k; o[1] = (66 + peb * 22) * k; o[2] = (50 + peb * 18) * k; o[3] = n * 0.6 + peb * (0.3 - w[0]) * 2;
  }, 4);
  defTex('rockfl', (x, y, o) => {
    const n = F8(x, y, TS, 5), w = Wc(x, y), crack = clamp((w[1] - w[0]) * 5, 0, 1), k = (0.38 + n * 0.6) * (0.5 + crack * 0.5);
    o[0] = 100 * k; o[1] = 56 * k; o[2] = 44 * k; o[3] = n * 0.5 * crack + 0.05;
  }, 5);
  defTex('hellfl', (x, y, o) => {
    const px = x & 63, py = y & 63, e = Math.min(px, 63 - px, py, 63 - py), n = F8(x, y, TS, 5), bl = F16(x + 40, y, TS, 4);
    if (e < 2) { o[0] = 26; o[1] = 14; o[2] = 12; o[3] = 0.05; return; }
    const k = 0.5 + n * 0.6; let r = 104 * k, g = 84 * k, b = 76 * k;
    if (bl > 0.6) { const t = Math.min(1, (bl - 0.6) * 6); r = lerp(r, 120, t); g = lerp(g, 12, t); b = lerp(b, 10, t); }
    o[0] = r; o[1] = g; o[2] = b; o[3] = 0.55 + n * 0.25;
  }, 4);
  defTex('marblefl', (x, y, o) => {
    const tx = x >> 5, ty = y >> 5, px = x & 31, py = y & 31, e = Math.min(px, 31 - px, py, 31 - py), n = F8(x, y, TS, 5);
    const v = Math.pow(1 - Math.abs(Math.sin(x / TS * TAU * 2 + n * 8)), 6), dark = (tx + ty) & 1;
    let r = dark ? 34 : 150, g = dark ? 76 : 158, b = dark ? 50 : 140;
    r += v * 60; g += v * 70; b += v * 60;
    if (e < 1.5) { r = g = b = 22; }
    o[0] = r * (0.8 + n * 0.3); o[1] = g * (0.8 + n * 0.3); o[2] = b * (0.8 + n * 0.3); o[3] = e < 1.5 ? 0.1 : 0.6;
  }, 3);
  defTex('ceil', (x, y, o) => {
    const n = F8(x, y, TS, 3), px = x & 63, py = y & 63;
    let r = 66, g = 66, b = 72, h = 0.5, em = 0;
    if (px === 0 || py === 0) { r = g = b = 30; h = 0.1; }
    if (x > 38 && x < 90 && y > 38 && y < 90) {
      const e = Math.min(x - 39, 89 - x, y - 39, 89 - y);
      if (e < 3) { r = g = b = 46; h = 0.3; } else { r = 250; g = 246; b = 226; em = 1; h = 0.6; }
    }
    const k = em ? 1 : 0.75 + n * 0.4; o[0] = r * k; o[1] = g * k; o[2] = b * k; o[3] = h; o[4] = em;
  }, 3);
  defTex('ceild', (x, y, o) => {
    const n = F8(x, y, TS, 4), px = x & 31, py = y & 31, e = Math.min(px, 31 - px, py, 31 - py), k = 0.65 + n * 0.5;
    o[0] = (e < 2 ? 22 : 56) * k; o[1] = (e < 2 ? 22 : 54) * k; o[2] = (e < 2 ? 24 : 58) * k; o[3] = e < 2 ? 0.1 : 0.55;
  }, 3);
  defTex('rockce', (x, y, o) => {
    const n = F8(x, y, TS, 5), w = Wc(x, y), k = 0.3 + n * 0.5;
    o[0] = 80 * k; o[1] = 46 * k; o[2] = 38 * k; o[3] = n * 0.7 + (1 - w[0]) * 0.3;
  }, 5);
  defTex('nukage', (x, y, o) => {
    const n = F8(x, y, TS, 5), s = Math.sin((x / TS * TAU * 2) + n * 6) * 0.5 + 0.5;
    o[0] = 30 + n * 50 + s * 30; o[1] = 130 + n * 90 + s * 35; o[2] = 24 + n * 20; o[3] = n; o[4] = 0.5 + s * 0.4;
  }, 2, 0.9);
  defTex('lava', (x, y, o) => {
    const w = Wc(x, y), n = F8(x, y, TS, 4), hot = 1 - clamp((w[1] - w[0]) * 3.2, 0, 1);
    if (hot < 0.3) { o[0] = 80 + n * 30; o[1] = 22 + n * 10; o[2] = 12; o[3] = 0.7; o[4] = 0.15; return; }
    o[0] = 255; o[1] = 70 + hot * 170 * n + hot * 40; o[2] = 10 + hot * 50; o[3] = 0.2; o[4] = 0.6 + hot * 0.4;
  }, 3, 1.15);
}

// Sky panorama for a level: glowing horizon, drifting clouds, jagged mountains.
function makeSky(pal) {
  srand(pal.seed || 3);
  const W = 1024, H = 256, c = mkCanvas(W, H), g = c.getContext('2d'), id = g.createImageData(W, H), d = id.data;
  const F = makeFbm(8), top = hexRgb(pal.top), hor = hexRgb(pal.horizon), cl = hexRgb(pal.cloud);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = y / H, base = [lerp(top[0], hor[0], t * t), lerp(top[1], hor[1], t * t), lerp(top[2], hor[2], t * t)];
    const n = F(x, y * 2.2, W, 5), m = clamp((n - 0.45) * 2.6, 0, 1) * (0.25 + t * 0.85);
    const i = (y * W + x) * 4;
    d[i] = lerp(base[0], cl[0], m); d[i + 1] = lerp(base[1], cl[1], m); d[i + 2] = lerp(base[2], cl[2], m); d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  const M = makeFbm(4), mt = hexRgb(pal.mount);
  for (const [lay, k, off] of [[0, 0.6, 150], [1, 1, 182]]) {
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) g.lineTo(x, off - M(x + lay * 300, lay * 40, W, 5) * 90 * k);
    g.lineTo(W, H); g.closePath();
    g.fillStyle = css(mt, lay ? -0.2 : 0.15); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1); t.magFilter = THREE.LinearFilter;
  return t;
}
