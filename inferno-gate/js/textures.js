'use strict';
// Procedural world textures at 256x256 = one world unit. Each texture has:
//   color map: RGB + A = emissive mask
//   normal map: tangent-space normal from a height field + A = gloss (specular strength)
// Generator coordinates: x right, y UP (row 0 = bottom of a wall), both in pixels 0..255.
const TS = 256;
const TEX = {};
let TEX_ANISO = 1;

function genTex(fn, bump, ao = 0.28) {
  const N = TS * TS, col = new Uint8Array(N * 4), hgt = new Float32Array(N), gl = new Float32Array(N), o = [0, 0, 0, 0.5, 0, 0];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    o[0] = o[1] = o[2] = 0; o[3] = 0.5; o[4] = 0; o[5] = 0;
    fn(x, y, o);
    const i = y * TS + x, k = o[4] > 0.5 ? 1 : 1 - ao + ao * clamp(o[3] / 0.6, 0, 1);
    col[i * 4] = clamp(o[0] * k, 0, 255); col[i * 4 + 1] = clamp(o[1] * k, 0, 255); col[i * 4 + 2] = clamp(o[2] * k, 0, 255);
    col[i * 4 + 3] = clamp(o[4] * 255, 0, 255);
    hgt[i] = o[3]; gl[i] = o[5];
  }
  const nor = new Uint8Array(N * 4), H = (x, y) => hgt[((y + TS) % TS) * TS + ((x + TS) % TS)];
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    let nx = -(H(x + 1, y) - H(x - 1, y)) * bump, ny = -(H(x, y + 1) - H(x, y - 1)) * bump, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * TS + x) * 4;
    nor[i] = (nx * 0.5 + 0.5) * 255; nor[i + 1] = (ny * 0.5 + 0.5) * 255; nor[i + 2] = (nz * 0.5 + 0.5) * 255; nor[i + 3] = clamp(gl[y * TS + x] * 255, 0, 255);
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
function defTex(name, fn, bump = 4, emis = 1, stretch = false, ao) {
  const { col, nor } = genTex(fn, bump, ao);
  TEX[name] = { map: dataTex(col), nmap: dataTex(nor), emis, stretch };
}
// periodic value noise on a rectangular nx x ny lattice (for stretched grime streaks)
function makeNoise2(nx, ny) {
  const g = new Float32Array(nx * ny); for (let i = 0; i < g.length; i++) g[i] = rnd();
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    const xa = ((x0 % nx) + nx) % nx, ya = ((y0 % ny) + ny) % ny, xb = (xa + 1) % nx, yb = (ya + 1) % ny;
    return lerp(lerp(g[ya * nx + xa], g[ya * nx + xb], fx), lerp(g[yb * nx + xa], g[yb * nx + xb], fx), fy);
  };
}

function makeDetail() {
  const D = 128, F = makeFbm(4), G = makeFbm(16), a = new Uint8Array(D * D * 4);
  for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
    const i = (y * D + x) * 4;
    a[i] = clamp(F(x, y, D, 4) * 255, 0, 255); a[i + 1] = clamp((G(x, y, D, 3) * 0.7 + rnd() * 0.3) * 255, 0, 255); a[i + 2] = 128; a[i + 3] = 255;
  }
  const t = new THREE.DataTexture(a, D, D, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}
function initTextures(aniso) {
  TEX_ANISO = aniso;
  srand(7);
  SU.detail.value = makeDetail();
  const F4 = makeFbm(4), F8 = makeFbm(8), F16 = makeFbm(16), F32 = makeFbm(32);
  const Wc = makeWorley(7, TS), Wf = makeWorley(14, TS), Wg = makeWorley(28, TS);
  const S1 = makeNoise2(48, 3), S2 = makeNoise2(96, 5);
  // vertical grime/rust streaks: 0 clean .. 1 dirty, stronger near the top
  const streak = (x, y) => clamp((S1(x / TS * 48, y / TS * 3) * 0.6 + S2(x / TS * 96, y / TS * 5) * 0.4 - 0.45) * 2.4, 0, 1);
  const scratch = (x, y) => { const n = F16(x, y, TS, 2); return n > 0.58 && Math.abs(Math.sin((x * 0.83 + y * 0.31) * 0.55 + n * 30)) < 0.05 ? 1 : 0; };
  const grain = () => (rnd() - 0.5) * 10;

  // ---- walls ----
  defTex('brick', (x, y, o) => {
    const bh = 32, bw = 64, row = Math.floor(y / bh), bx = (x + (row & 1) * 32) % TS, c = Math.floor(bx / bw), lx = bx - c * bw, ly = y - row * bh;
    const n = F16(x, y, TS, 4), fine = F32(x, y, TS, 2), hv = hash2(c + row * 13, 7), e = Math.min(lx, bw - 1 - lx, ly, bh - 1 - ly);
    const st = streak(x, y) * (0.4 + y / TS * 0.6);
    if (e < 2.5) { const m = 0.45 + n * 0.5; o[0] = 78 * m; o[1] = 70 * m; o[2] = 62 * m; o[3] = 0.08 + n * 0.08; o[5] = 0.02; return; }
    const chip = n < 0.34 && e < 7;
    let k = (0.68 + hv * 0.42) * (0.8 + fine * 0.35) * (1 - st * 0.45);
    if (chip) k *= 0.68;
    o[0] = 142 * k + grain(); o[1] = 74 * k + grain() * 0.6; o[2] = 50 * k;
    if (hv > 0.87) { o[0] *= 0.75; o[1] *= 0.82; o[2] *= 0.92; }
    if (hv < 0.08) { o[0] *= 1.12; o[1] *= 1.05; }
    o[3] = chip ? 0.32 : 0.52 + Math.min(1, e / 5) * 0.3 + fine * 0.14; o[5] = 0.08;
  }, 6);

  const techFn = (x, y, o) => {
    const px = x & 127, py = y & 127, pid = (x >> 7) + (y >> 7) * 2;
    const n = F16(x, y, TS, 4), fine = F32(x, y, TS, 2), e = Math.min(px, 127 - px, py, 127 - py), st = streak(x, y);
    let r = 104, g = 106, b = 113, h = 0.6, em = 0, gl = 0.5;
    if (e < 3) { r = 30; g = 30; b = 34; h = 0.04; gl = 0.1; }
    else if (e < 9) { const t = (e - 3) / 6; r = g = 158 - t * 36; b = r + 6; h = 0.25 + t * 0.35; gl = 0.7; if (n > 0.62) { r += 40; g += 40; b += 40; } }
    else {
      if (pid === 1 && py > 26 && py < 102 && px > 20 && px < 108) { if ((py - 26) % 12 < 6) { r = 24; g = 24; b = 28; h = 0.15; gl = 0.2; } else { r = 126; g = 128; b = 134; h = 0.66; } }
      if (pid === 2 && px > 34 && px < 94 && py > 46 && py < 82) {
        const ee = Math.min(px - 35, 93 - px, py - 47, 81 - py);
        if (ee < 3) { r = 40; g = 40; b = 44; h = 0.4; }
        else { r = 80; g = 215; b = 255; em = 1; h = 0.7; gl = 0.9; if (((px >> 3) + (py >> 3)) & 1) { r = 46; g = 160; b = 220; em = 0.85; } }
      }
      if (pid === 3 && px > 12 && px < 116) { const q = (px - 14) % 32; if (q < 18) { const t = Math.sin(q / 18 * Math.PI); r = 78 + t * 80; g = 80 + t * 80; b = 88 + t * 82; h = 0.35 + t * 0.55; gl = 0.75; } }
      if (pid === 0 && py > 16 && py < 40 && px > 16 && px < 112) { const s = ((px + py) >> 3) & 1; r = s ? 214 : 30; g = s ? 172 : 30; b = s ? 34 : 30; h = 0.62; gl = 0.35; }
    }
    for (const c of [16, 111]) for (const d of [16, 111]) { const dd = Math.hypot(px - c, py - d); if (dd < 5.5) { const t = 1 - dd / 5.5; r = g = b = 120 + t * 110; h = 0.7 + t * 0.3; em = 0; gl = 0.9; } }
    if (scratch(x, y) && em === 0 && e >= 9) { r += 55; g += 55; b += 55; gl = 0.9; }
    const k = (0.8 + n * 0.35) * (0.92 + fine * 0.12) * (1 - st * 0.5);
    o[0] = r * k + grain(); o[1] = g * k + grain(); o[2] = b * k * (1 - st * 0.12) + grain(); o[3] = h + fine * 0.05; o[4] = em; o[5] = gl * (1 - st * 0.6);
  };
  defTex('tech', techFn, 6);

  defTex('marble', (x, y, o) => {
    const n = F8(x, y, TS, 6), v = Math.abs(Math.sin(x / TS * 2 * TAU + n * 9 + F4(x, y, TS, 3) * 6)), vein = Math.pow(1 - v, 9), fv = Math.pow(1 - Math.abs(Math.sin(y / TS * 3 * TAU + n * 14)), 22);
    const px = x & 127, py = y & 127, e = Math.min(px, 127 - px, py, 127 - py);
    let r = 36 + n * 32 + vein * 120 + fv * 40, g = 82 + n * 42 + vein * 130 + fv * 46, b = 54 + n * 30 + vein * 110 + fv * 40, h = 0.62 + n * 0.08;
    if (e < 3) { r *= 0.35; g *= 0.35; b *= 0.35; h = 0.06; } else if (e < 7) h = 0.42;
    o[0] = r; o[1] = g; o[2] = b; o[3] = h; o[5] = e < 3 ? 0.1 : 0.8;
  }, 4);

  defTex('rock', (x, y, o) => {
    const n = F8(x, y, TS, 6), w = Wc(x, y), w2 = Wg(x, y), crack = clamp((w[1] - w[0]) * 6, 0, 1), crack2 = clamp((w2[1] - w2[0]) * 4, 0, 1);
    const h = n * 0.55 + (1 - w[0]) * 0.35 + (1 - w2[0]) * 0.1, k = (0.4 + h * 0.85) * (0.4 + crack * 0.6) * (0.75 + crack2 * 0.25);
    o[0] = 122 * k + grain(); o[1] = 58 * k + grain() * 0.5; o[2] = 40 * k; o[3] = h * crack * (0.7 + 0.3 * crack2) + 0.04; o[5] = 0.12 + (1 - crack) * 0.1;
  }, 9);

  defTex('flesh', (x, y, o) => {
    const w = Wf(x, y), w2 = Wg(x, y), n = F8(x, y, TS, 4), bump = Math.pow(clamp(1 - w[0], 0, 1), 1.5), vein = clamp((w[1] - w[0]) * 5, 0, 1), small = clamp(1 - w2[0], 0, 1);
    let r = 160 * (0.45 + bump * 0.65) * (0.6 + n * 0.5), g = 50 * (0.5 + bump * 0.5) * (0.6 + n * 0.5), b = 50 * (0.5 + bump * 0.5);
    if (vein < 0.22) { r *= 0.4; g *= 0.28; b *= 0.4; }
    if (bump > 0.8) { r += 46; g += 22; b += 22; }
    o[0] = r; o[1] = g; o[2] = b; o[3] = bump * 0.7 + small * 0.15 + 0.08; o[5] = 0.65 * (0.5 + bump * 0.5);
  }, 8);

  const doorFn = key => (x, y, o) => {
    const n = F16(x, y, TS, 4), fine = F32(x, y, TS, 2), ex = Math.min(x, 255 - x), st = streak(x, y);
    let r = 120, g = 108, b = 94, h = 0.6, em = 0, gl = 0.45;
    if (ex < 14) { r = 74; g = 70; b = 66; h = 0.85; gl = 0.6; }
    else if (ex < 18) { r = 32; g = 30; b = 28; h = 0.12; }
    else {
      const pr = y % 64;
      if (pr < 4) { r = 44; g = 40; b = 36; h = 0.1; } else if (pr < 8) { r = 172; g = 158; b = 138; h = 0.78; gl = 0.7; }
      if ((x - 24) % 52 < 6) { r *= 0.78; g *= 0.78; b *= 0.78; h = 0.42; }
      if (pr > 12 && pr < 19 && (x + 8) % 32 < 6) { const dd = Math.hypot(((x + 8) % 32) - 3, pr - 15.5); if (dd < 3.4) { r = g = b = 200 - dd * 20; h = 0.95; gl = 0.9; } }
      if (y < 28) { const s = ((x + y) >> 4) & 1; r = s ? 224 : 26; g = s ? 182 : 26; b = s ? 36 : 26; h = 0.62; gl = 0.3; }
    }
    if (key) {
      const kc = key === 'red' ? [228, 34, 24] : [48, 100, 248];
      if (ex < 14) { r = kc[0] * 0.72; g = kc[1] * 0.72; b = kc[2] * 0.72; em = 0.45; }
      const dd = Math.abs(x - 128) + Math.abs(y - 140);
      if (dd < 48 && dd > 26) { r = kc[0]; g = kc[1]; b = kc[2]; em = 1; h = 0.85; gl = 0.9; }
      if (dd <= 26) { r = 28; g = 24; b = 22; h = 0.4; }
    }
    if (scratch(x, y) && em === 0) { r += 45; g += 42; b += 40; }
    const k = (0.75 + n * 0.4) * (0.92 + fine * 0.12) * (1 - st * 0.35);
    o[0] = r * k * (1 + st * 0.15); o[1] = g * k * (1 - st * 0.1); o[2] = b * k * (1 - st * 0.3); o[3] = h; o[4] = em; o[5] = gl * (1 - st * 0.5);
  };
  defTex('door', doorFn(null), 6);
  defTex('reddoor', doorFn('red'), 6);
  defTex('bluedoor', doorFn('blue'), 6);

  defTex('track', (x, y, o) => {
    const n = F16(x, y, TS, 3), s = ((x + y) >> 5) & 1, wear = F32(x, y, TS, 2) > 0.66;
    let r = s ? 216 : 28, g = s ? 176 : 28, b = s ? 40 : 26, h = s ? 0.7 : 0.4;
    if (wear) { r = 120; g = 116; b = 110; h = 0.5; }
    if (x < 32 || x > 223) { r = 84; g = 84; b = 90; h = 0.6; }
    const k = 0.75 + n * 0.4; o[0] = r * k; o[1] = g * k; o[2] = b * k; o[3] = h; o[5] = 0.4;
  }, 4);

  defTex('step', (x, y, o) => {
    const n = F16(x, y, TS, 4), py = y & 63;
    let r = 96, g = 94, b = 92, h = 0.5, gl = 0.4;
    if (py > 52) { r = 208; g = 164; b = 40; h = 0.72; gl = 0.5; if (F32(x, y, TS, 2) > 0.62) { r = 130; g = 120; b = 100; } } else if (py < 4) { r = 26; g = 26; b = 26; h = 0.1; }
    if ((x & 31) < 2) { r *= 0.55; g *= 0.55; b *= 0.55; h = 0.3; }
    const k = 0.75 + n * 0.4; o[0] = r * k; o[1] = g * k; o[2] = b * k; o[3] = h; o[5] = gl;
  }, 4);

  // exit switch: tech panel + glowing EXIT sign + lever, stretched once over the wall face
  const sign = mkCanvas(TS, TS), sg = sign.getContext('2d');
  sg.fillStyle = '#fff'; sg.font = 'bold 60px Arial, sans-serif'; sg.textAlign = 'center'; sg.textBaseline = 'middle';
  sg.fillText('EXIT', 128, 44);
  const mask = sg.getImageData(0, 0, TS, TS).data;
  const exitFn = on => (x, y, o) => {
    techFn(x, y, o);
    const iy = 255 - y;
    if (iy > 8 && iy < 80 && x > 32 && x < 224) {
      const m = mask[(iy * TS + x) * 4 + 3] / 255;
      o[0] = 14 + m * (on ? 60 : 255); o[1] = 10 + m * (on ? 255 : 40); o[2] = 10 + m * (on ? 90 : 30); o[3] = 0.3 + m * 0.3; o[4] = m; o[5] = 0.8;
      if (x < 38 || x > 218 || iy < 14 || iy > 74) { o[0] = o[1] = o[2] = 60; o[3] = 0.7; o[4] = 0; }
    }
    if (x > 88 && x < 168 && y > 44 && y < 156) {
      const e = Math.min(x - 89, 167 - x, y - 45, 155 - y);
      o[0] = o[1] = o[2] = e < 6 ? 40 : 70; o[3] = e < 6 ? 0.3 : 0.5; o[4] = 0; o[5] = 0.5;
      const ly = on ? 68 : 112;
      if (x > 112 && x < 144 && y > ly && y < ly + 32) { o[0] = on ? 60 : 232; o[1] = on ? 242 : 40; o[2] = on ? 80 : 30; o[3] = 0.95; o[4] = 0.9; o[5] = 0.9; }
    }
  };
  defTex('exitsw', exitFn(false), 6, 1, true);
  defTex('exitswOn', exitFn(true), 6, 1, true);

  // ---- cover: crates and concrete barriers ----
  defTex('crate', (x, y, o) => {
    const n = F16(x, y, TS, 4), fine = F32(x, y * 0.25, TS, 3), px = x, py = y, e = Math.min(px, 255 - px, py, 255 - py);
    let r = 132, g = 98, b = 58, h = 0.55, gl = 0.08;
    const plank = Math.floor(py / 42), pl = py % 42, ph = hash2(plank, 3);
    r *= 0.82 + ph * 0.3; g *= 0.82 + ph * 0.28; b *= 0.82 + ph * 0.25;
    const ring = Math.sin(x * 0.09 + Math.sin(y * 0.05 + plank) * 3 + fine * 6) * 0.5 + 0.5;
    r *= 0.85 + ring * 0.2; g *= 0.85 + ring * 0.18;
    if (pl < 3) { r *= 0.35; g *= 0.35; b *= 0.35; h = 0.15; }
    if (e < 26) { r = 104 * (0.85 + ph * 0.2); g = 76; b = 44; h = 0.85; }
    const dg = Math.abs((px - py)) < 14 || Math.abs((px + py) - 255) < 14;
    if (dg && e >= 26) { r = 110; g = 80; b = 46; h = 0.8; }
    if (e < 5) { r *= 0.4; g *= 0.4; b *= 0.4; h = 0.3; }
    for (const cx of [13, 242]) for (const cy of [13, 242]) { if (Math.abs(px - cx) < 13 && Math.abs(py - cy) < 13) { r = g = b = 92; h = 0.95; gl = 0.6; if (Math.hypot(px - cx, py - cy) < 3.5) { r = g = b = 170; } } }
    const k = 0.75 + n * 0.4; o[0] = r * k + grain(); o[1] = g * k + grain(); o[2] = b * k; o[3] = h + fine * 0.06; o[5] = gl;
  }, 6);
  defTex('cratetop', (x, y, o) => {
    const n = F16(x, y, TS, 4), fine = F32(x * 0.25, y, TS, 3), pk = Math.floor(x / 51), pl = x % 51, ph = hash2(pk, 9), e = Math.min(x, 255 - x, y, 255 - y);
    let r = 136 * (0.82 + ph * 0.3), g = 100 * (0.82 + ph * 0.28), b = 60 * (0.82 + ph * 0.25), h = 0.6;
    const ring = Math.sin(y * 0.08 + Math.sin(x * 0.05 + pk) * 3 + fine * 6) * 0.5 + 0.5; r *= 0.85 + ring * 0.2; g *= 0.85 + ring * 0.18;
    if (pl < 3) { r *= 0.35; g *= 0.35; b *= 0.35; h = 0.12; }
    if (e < 8) { r *= 0.6; g *= 0.6; b *= 0.6; h = 0.85; }
    const k = 0.75 + n * 0.4; o[0] = r * k + grain(); o[1] = g * k; o[2] = b * k; o[3] = h; o[5] = 0.06;
  }, 5);
  defTex('concrete', (x, y, o) => {
    const n = F16(x, y, TS, 5), w = Wg(x, y), agg = w[0] < 0.25 ? 1 : 0, st = streak(x, y), fine = F32(x, y, TS, 2);
    let r = 150, g = 146, b = 138, h = 0.55 + agg * 0.15 + fine * 0.1, gl = 0.06;
    if (agg) { r *= 0.85; g *= 0.83; b *= 0.8; }
    const band = y & 63;
    if (band > 44 && band < 58) { const s = ((x + y) >> 4) & 1; r = s ? 210 : 30; g = s ? 168 : 30; b = s ? 34 : 30; h = 0.58; gl = 0.25; if (fine > 0.6) { r = r * 0.6 + 60; g = g * 0.6 + 58; b = b * 0.6 + 54; } }
    if (band < 3) { r *= 0.5; g *= 0.5; b *= 0.5; h = 0.2; }
    const k = (0.72 + n * 0.4) * (1 - st * 0.4); o[0] = r * k + grain(); o[1] = g * k + grain(); o[2] = b * k + grain(); o[3] = h; o[5] = gl;
  }, 6);

  // ---- floors & ceilings ----
  defTex('floor', (x, y, o) => {
    const tx = x >> 6, ty = y >> 6, px = x & 63, py = y & 63, e = Math.min(px, 63 - px, py, 63 - py);
    const n = F16(x, y, TS, 4), gr = F8(x, y, TS, 3), fine = F32(x, y, TS, 2), hv = hash2(tx, ty);
    if (e < 2.5) { o[0] = 36; o[1] = 34; o[2] = 32; o[3] = 0.06; o[5] = 0.05; return; }
    const crack = hv > 0.8 && Math.abs(px - py * (0.4 + hv)) < 1.2;
    const dirt = Math.max(0, gr - 0.48) * 1.6;
    const k = (0.72 + hv * 0.22) * (0.78 + n * 0.4) * (1 - dirt * 0.6) * (crack ? 0.5 : 1);
    o[0] = 100 * k + grain(); o[1] = 96 * k + grain(); o[2] = 90 * k + grain(); o[3] = 0.58 + Math.min(1, e / 5) * 0.2 + fine * 0.05 - (crack ? 0.3 : 0); o[5] = 0.45 * (1 - dirt);
  }, 5);
  defTex('grate', (x, y, o) => {
    const n = F16(x, y, TS, 4), hole = (x & 15) < 10 && (y & 15) < 10, frame = (x & 127) < 6 || (y & 127) < 6;
    if (frame) { o[0] = o[1] = o[2] = 122 * (0.8 + n * 0.3); o[3] = 0.9; o[5] = 0.6; return; }
    if (hole) { const d = F8(x, y, TS, 2); o[0] = 10 + d * 12; o[1] = 10 + d * 12; o[2] = 12 + d * 10; o[3] = 0.02; o[5] = 0; return; }
    const k = 0.7 + n * 0.5; o[0] = 94 * k; o[1] = 94 * k; o[2] = 100 * k; o[3] = 0.66; o[5] = 0.65;
  }, 5);
  defTex('dirt', (x, y, o) => {
    const n = F8(x, y, TS, 6), w = Wf(x, y), w2 = Wg(x, y), peb = w[0] < 0.26 ? 1 : 0, sp = w2[0] < 0.18 ? 1 : 0, k = 0.48 + n * 0.72;
    o[0] = (94 + peb * 32 + sp * 14) * k + grain(); o[1] = (66 + peb * 22 + sp * 10) * k + grain(); o[2] = (50 + peb * 18) * k; o[3] = n * 0.5 + peb * (0.28 - w[0]) * 2.2 + sp * 0.1; o[5] = 0.04;
  }, 6);
  defTex('rockfl', (x, y, o) => {
    const n = F8(x, y, TS, 6), w = Wc(x, y), crack = clamp((w[1] - w[0]) * 5, 0, 1), k = (0.36 + n * 0.62) * (0.45 + crack * 0.55);
    o[0] = 102 * k + grain(); o[1] = 56 * k; o[2] = 44 * k; o[3] = n * 0.5 * crack + 0.04; o[5] = 0.12;
  }, 7);
  defTex('hellfl', (x, y, o) => {
    const px = x & 127, py = y & 127, e = Math.min(px, 127 - px, py, 127 - py), n = F8(x, y, TS, 6), bl = F16(x + 40, y, TS, 4), fine = F32(x, y, TS, 2), hv = hash2(x >> 7, y >> 7);
    if (e < 3) { o[0] = 24; o[1] = 12; o[2] = 10; o[3] = 0.04; return; }
    const k = (0.5 + n * 0.6) * (0.85 + hv * 0.3); let r = 106 * k, g = 86 * k, b = 78 * k, gl = 0.1;
    if (bl > 0.6) { const t = Math.min(1, (bl - 0.6) * 6); r = lerp(r, 118, t); g = lerp(g, 10, t); b = lerp(b, 8, t); gl = 0.1 + t * 0.6; }
    o[0] = r + grain(); o[1] = g; o[2] = b; o[3] = 0.55 + n * 0.22 + fine * 0.05; o[5] = gl;
  }, 5);
  defTex('marblefl', (x, y, o) => {
    const tx = x >> 6, ty = y >> 6, px = x & 63, py = y & 63, e = Math.min(px, 63 - px, py, 63 - py), n = F8(x, y, TS, 6);
    const v = Math.pow(1 - Math.abs(Math.sin(x / TS * TAU * 2 + n * 8)), 7), dark = (tx + ty) & 1;
    let r = dark ? 32 : 152, g = dark ? 74 : 160, b = dark ? 48 : 142;
    r += v * 60; g += v * 70; b += v * 60;
    if (e < 2) { r = g = b = 20; }
    o[0] = r * (0.8 + n * 0.3); o[1] = g * (0.8 + n * 0.3); o[2] = b * (0.8 + n * 0.3); o[3] = e < 2 ? 0.08 : 0.6; o[5] = e < 2 ? 0 : 0.85;
  }, 4);
  defTex('ceil', (x, y, o) => {
    const n = F16(x, y, TS, 3), px = x & 127, py = y & 127;
    let r = 66, g = 66, b = 72, h = 0.5, em = 0, gl = 0.3;
    if (px < 2 || py < 2) { r = g = b = 28; h = 0.1; }
    if (x > 76 && x < 180 && y > 76 && y < 180) {
      const e = Math.min(x - 77, 179 - x, y - 77, 179 - y);
      if (e < 6) { r = g = b = 44; h = 0.3; gl = 0.6; } else { r = 252; g = 248; b = 228; em = 1; h = 0.6; if (((x - 80) % 26) < 2) { r = 200; g = 196; b = 180; } }
    }
    const k = em ? 1 : 0.75 + n * 0.4; o[0] = r * k; o[1] = g * k; o[2] = b * k; o[3] = h; o[4] = em; o[5] = gl;
  }, 4);
  defTex('ceild', (x, y, o) => {
    const n = F16(x, y, TS, 4), px = x & 63, py = y & 63, e = Math.min(px, 63 - px, py, 63 - py), k = 0.65 + n * 0.5;
    o[0] = (e < 3 ? 20 : 56) * k; o[1] = (e < 3 ? 20 : 54) * k; o[2] = (e < 3 ? 22 : 58) * k; o[3] = e < 3 ? 0.08 : 0.55; o[5] = 0.3;
  }, 4);
  defTex('rockce', (x, y, o) => {
    const n = F8(x, y, TS, 6), w = Wc(x, y), k = 0.3 + n * 0.5;
    o[0] = 80 * k; o[1] = 46 * k; o[2] = 38 * k; o[3] = n * 0.7 + (1 - w[0]) * 0.3; o[5] = 0.1;
  }, 7);
  defTex('nukage', (x, y, o) => {
    const n = F8(x, y, TS, 6), s = Math.sin((x / TS * TAU * 2) + n * 6) * 0.5 + 0.5, f = F32(x, y, TS, 2);
    o[0] = 30 + n * 50 + s * 30; o[1] = 130 + n * 90 + s * 35; o[2] = 24 + n * 20; o[3] = n * 0.8 + f * 0.2; o[4] = 0.5 + s * 0.4; o[5] = 0.95;
  }, 3, 0.9, false, 0);
  defTex('lava', (x, y, o) => {
    const w = Wc(x, y), n = F8(x, y, TS, 5), hot = 1 - clamp((w[1] - w[0]) * 3.2, 0, 1);
    if (hot < 0.3) { o[0] = 80 + n * 30; o[1] = 22 + n * 10; o[2] = 12; o[3] = 0.7; o[4] = 0.15; o[5] = 0.3; return; }
    o[0] = 255; o[1] = 70 + hot * 170 * n + hot * 40; o[2] = 10 + hot * 50; o[3] = 0.2; o[4] = 0.6 + hot * 0.4; o[5] = 0.8;
  }, 4, 1.15, false, 0);
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
