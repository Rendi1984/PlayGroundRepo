'use strict';
// 2D overlay drawn on top of the 3D view: first-person weapons, status bar,
// face, messages, automap. Design space is 640x400; the 3D view covers y 0..336.
const OW = 640, OH = 400, VIEWH = 336;
const SKIN = '#c48a66', SLEEVE = '#3e5a2c';

function hand(g, x, y, s = 1, flip = 1) {
  g.save(); g.translate(x, y); g.scale(s * flip, s);
  limb(g, 0, 60, 0, 16, 22, 20, SLEEVE);
  ball(g, 0, 4, 22, 20, SKIN);
  for (let i = 0; i < 4; i++) ball(g, -14 + i * 9.5, -10, 6, 7, SKIN, 0, 0.4, 0.5);
  ball(g, 18, 4, 7, 11, SKIN, -0.4);
  g.restore();
}
function flashStar(g, x, y, r, inner, outer) {
  g.save(); g.globalCompositeOperation = 'lighter';
  glowDot(g, x, y, r * 1.6, outer, outer.replace(/[\d.]+\)$/, '0.25)'));
  g.fillStyle = inner;
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + rnd() * 0.4, l = r * (0.8 + rnd() * 0.6); poly(g, [x + Math.cos(a + 0.12) * r * 0.25, y + Math.sin(a + 0.12) * r * 0.25, x + Math.cos(a) * l, y + Math.sin(a) * l, x + Math.cos(a - 0.12) * r * 0.25, y + Math.sin(a - 0.12) * r * 0.25]); }
  glowDot(g, x, y, r * 0.7, 'rgba(255,255,255,1)', inner);
  g.restore();
}
// returns [x, y] of the muzzle so the caller can draw the (unlit) flash there
const WEAPON_DRAW = {
  fist(g, cx, by, st) {
    const k = st.fire > 0 ? Math.sin(Math.min(1, st.fire) * Math.PI) : 0;
    hand(g, cx - 190, by + 30, 1.6, -1);
    hand(g, cx + 150 - k * 120, by - 10 - k * 120, 1.9 + k * 0.5, 1);
    return null;
  },
  pistol(g, cx, by, st) {
    const r = st.fire > 0 ? st.fire * 16 : 0, y = by + r, x = cx + 8;
    hcyl(g, x - 24, y - 74, 48, 24, '#26262c', 6);
    cyl(g, x - 21, y - 178, 42, 118, '#3c3c46', 7);
    g.fillStyle = 'rgba(0,0,0,0.38)'; for (let i = 0; i < 6; i++) g.fillRect(x - 17, y - 96 + i * 6, 34, 2);
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x - 12, y - 176, 4, 100);
    cyl(g, x - 7, y - 194, 14, 20, '#2a2a30', 3);
    ball(g, x, y - 194, 5.5, 3.2, '#060606', 0, 0, 0);
    hcyl(g, x - 4, y - 186, 8, 7, '#6a6a74', 2);
    hand(g, x + 4, y - 26, 1.6, 1);
    return [x, y - 204];
  },
  shotgun(g, cx, by, st) {
    const r = st.fire > 0 ? st.fire * 20 : 0, pump = st.pump * 46, y = by + r;
    cyl(g, cx - 17, y - 250, 34, 210, '#2a2a30', 6);
    ball(g, cx, y - 250, 11, 5, '#060606', 0, 0, 0);
    cyl(g, cx - 12, y - 180, 24, 140, '#3a3a42', 6);
    cyl(g, cx - 34, y - 130 + pump, 68, 62, '#7a4a24', 10);
    g.fillStyle = 'rgba(30,14,6,0.55)'; for (let i = 0; i < 5; i++) g.fillRect(cx - 30, y - 120 + pump + i * 11, 60, 3);
    hand(g, cx - 42, y - 82 + pump, 1.15, -1);
    cyl(g, cx - 54, y - 54, 108, 90, '#6b4423', 18);
    hand(g, cx + 60, y - 6, 1.3, 1);
    return [cx, y - 262];
  },
  chaingun(g, cx, by, st) {
    const r = st.fire > 0 ? 6 : 0, y = by + r, spin = st.spin;
    const bars = [];
    for (let i = 0; i < 6; i++) { const a = spin + i / 6 * TAU; bars.push([Math.sin(a), Math.cos(a)]); }
    bars.sort((a, b) => a[1] - b[1]);
    for (const [s, c] of bars) cyl(g, cx - 9 + s * 30, y - 236, 18, 160, c > 0 ? '#3a3a42' : '#202024', 4);
    hcyl(g, cx - 44, y - 240, 88, 16, '#55555e', 6);
    hcyl(g, cx - 48, y - 150, 96, 20, '#4a4a52', 6);
    cyl(g, cx - 70, y - 96, 140, 120, '#44444c', 18);
    hand(g, cx - 90, y - 4, 1.3, -1); hand(g, cx + 90, y - 4, 1.3, 1);
    return [cx + (st.alt ? -16 : 16), y - 250];
  },
  launcher(g, cx, by, st) {
    const r = st.fire > 0 ? st.fire * 28 : 0, y = by + r;
    cyl(g, cx - 56, y - 270, 112, 270, '#5a5c3a', 20);
    hcyl(g, cx - 58, y - 262, 116, 16, '#3a3c26', 6);
    g.fillStyle = 'rgba(220,180,40,0.85)'; for (let i = 0; i < 6; i++) poly(g, [cx - 52 + i * 18, y - 246, cx - 42 + i * 18, y - 246, cx - 48 + i * 18, y - 238, cx - 58 + i * 18, y - 238]);
    cyl(g, cx - 64, y - 160, 20, 70, '#4a4c30', 6);
    ball(g, cx, y - 270, 46, 16, '#141410', 0, 0.05, 0.2);
    if (st.loaded) { ball(g, cx, y - 272, 22, 9, '#c02018', 0, 0.5, 0.4); }
    hcyl(g, cx - 56, y - 190, 112, 12, '#3a3c26', 4);
    hcyl(g, cx + 50, y - 230, 26, 60, '#3a3c2a', 6);
    hand(g, cx - 100, y - 30, 1.3, -1); hand(g, cx + 96, y - 10, 1.3, 1);
    return [cx, y - 286];
  },
  plasma(g, cx, by, st) {
    const r = st.fire > 0 ? 8 : 0, y = by + r;
    cyl(g, cx - 50, y - 230, 100, 230, '#3a4458', 22);
    cyl(g, cx - 24, y - 252, 48, 40, '#2a3040', 10);
    ball(g, cx, y - 252, 16, 6, '#0a1020', 0, 0, 0);
    hand(g, cx - 96, y - 20, 1.3, -1); hand(g, cx + 96, y - 20, 1.3, 1);
    return [cx, y - 262];
  },
};
const PLASMA_COILS = (g, cx, by, st) => {
  const y = by + (st.fire > 0 ? 8 : 0);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) { const gl = 0.55 + 0.45 * Math.sin(st.t * 6 + i); g.fillStyle = `rgba(90,170,255,${gl})`; rrect(g, cx - 46, y - 200 + i * 34, 92, 10, 4); g.fill(); }
  g.restore();
};
const WCV = mkCanvas(OW, OH), WCX = WCV.getContext('2d');
function drawWeapon(o, P, light) {
  const st = P.wst, cx = OW / 2 + st.bx, by = VIEWH + 14 + st.by + st.drop, K = 0.76;
  WCX.clearRect(0, 0, OW, OH);
  srand(((st.t * 30) | 0) + 1);
  WCX.save(); WCX.translate(cx, by); WCX.scale(K, K); WCX.translate(-cx, -by);
  let muzzle = WEAPON_DRAW[P.w](WCX, cx, by, st);
  if (P.w === 'plasma') PLASMA_COILS(WCX, cx, by, st);
  WCX.restore();
  if (muzzle) muzzle = [cx + (muzzle[0] - cx) * K, by + (muzzle[1] - by) * K];
  // light the weapon by the local light (keeps it from glowing in dark rooms)
  WCX.globalCompositeOperation = 'source-atop';
  const lum = clamp((light[0] + light[1] + light[2]) / 3 * 1.25 + (st.flash > 0 ? 0.5 : 0), 0.22, 1.1);
  if (lum < 1) { WCX.fillStyle = `rgba(0,0,0,${1 - lum})`; WCX.fillRect(0, 0, OW, OH); }
  WCX.fillStyle = `rgba(${light[0] * 255 | 0},${light[1] * 255 | 0},${light[2] * 255 | 0},0.12)`; WCX.fillRect(0, 0, OW, OH);
  WCX.globalCompositeOperation = 'source-over';
  if (muzzle && st.flash > 0) {
    if (P.w === 'plasma') flashStar(WCX, muzzle[0], muzzle[1], 36, 'rgba(160,210,255,1)', 'rgba(60,120,255,0.9)');
    else flashStar(WCX, muzzle[0], muzzle[1], P.w === 'shotgun' || P.w === 'launcher' ? 64 : 44, 'rgba(255,225,140,1)', 'rgba(255,140,30,0.9)');
  }
  o.drawImage(WCV, 0, 0);
}

// ---------- status bar ----------
let HUDBG = null;
function buildHudBg() {
  srand(21);
  const c = mkCanvas(OW, 64), g = c.getContext('2d'), F = makeFbm(8), id = g.createImageData(OW, 64), d = id.data;
  for (let y = 0; y < 64; y++) for (let x = 0; x < OW; x++) { const v = F(x % 128, y * 2, 128, 4) * 46 + rnd() * 10, i = (y * OW + x) * 4; d[i] = 62 + v; d[i + 1] = 58 + v; d[i + 2] = 54 + v; d[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  const lg = g.createLinearGradient(0, 0, 0, 64); lg.addColorStop(0, 'rgba(255,255,255,0.12)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = lg; g.fillRect(0, 0, OW, 64);
  g.fillStyle = '#1a1714'; g.fillRect(0, 0, OW, 2);
  for (const [x0, x1] of HUD_BOXES) {
    g.fillStyle = 'rgba(14,12,10,0.88)'; rrect(g, x0, 6, x1 - x0, 52, 3); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0 + 2, 57, x1 - x0 - 4, 1);
    for (const rx of [x0 + 4, x1 - 4]) for (const ry of [10, 54]) ball(g, rx, ry, 2, 2, '#a8a094', 0, 0.6, 0.6);
  }
  HUDBG = c;
}
const HUD_BOXES = [[4, 96], [100, 212], [216, 282], [286, 354], [358, 466], [470, 494], [498, 636]];
function bigNum(o, v, x, y) {
  o.font = '50px "VT323", monospace'; o.textAlign = 'right'; o.textBaseline = 'alphabetic';
  o.fillStyle = 'rgba(0,0,0,0.6)'; o.fillText(v, x + 2, y + 2);
  const gr = o.createLinearGradient(0, y - 34, 0, y); gr.addColorStop(0, '#ff5a3a'); gr.addColorStop(1, '#b80c06');
  o.fillStyle = gr; o.fillText(v, x, y);
}
function label(o, s, x, y) { o.font = '15px "VT323", monospace'; o.textAlign = 'center'; o.fillStyle = '#d8cfc0'; o.fillText(s, x, y); }
function drawHud(o, P, LV) {
  const y0 = VIEWH;
  o.drawImage(HUDBG, 0, y0);
  const w = WEAPONS[P.w];
  bigNum(o, w.ammo ? String(P.ammo[w.ammo]) : '', 90, y0 + 44); label(o, 'AMMO', 50, y0 + 57);
  bigNum(o, P.health + '%', 206, y0 + 44); label(o, 'HEALTH', 156, y0 + 57);
  o.font = '20px "VT323", monospace'; o.textAlign = 'center';
  ['pistol', 'shotgun', 'chaingun', 'launcher', 'plasma', null].forEach((k, i) => {
    o.fillStyle = k && P.has[k] ? '#f0d040' : '#5a544c';
    o.fillText(String(i + 2), 232 + (i % 3) * 17, y0 + 26 + ((i / 3) | 0) * 18);
  });
  label(o, 'ARMS', 249, y0 + 57);
  drawFace(o, 290, y0 + 7, P);
  bigNum(o, P.armor + '%', 460, y0 + 44); label(o, 'ARMOR', 410, y0 + 57);
  const key = (k, col, yy) => { if (!P.keys[k]) return; hcyl(o, 476, yy, 12, 14, col, 2); o.fillStyle = '#fff'; o.fillRect(478, yy + 4, 8, 2); };
  key('red', '#e01818', y0 + 12); key('blue', '#2050f0', y0 + 34);
  o.font = '16px "VT323", monospace'; o.textAlign = 'left';
  const rows = [['BULL', 'bul'], ['SHEL', 'shl'], ['RCKT', 'rkt'], ['CELL', 'cel']];
  rows.forEach(([nm, k], i) => {
    const yy = y0 + 19 + i * 11;
    o.fillStyle = '#c8bfb0'; o.textAlign = 'left'; o.fillText(nm, 506, yy);
    o.fillStyle = '#f0d040'; o.textAlign = 'right'; o.fillText(P.ammo[k] + '/' + AMMO_MAX[k], 630, yy);
  });
}
function drawFace(o, x, y, P) {
  const hp = P.health, lv = P.dead ? 5 : hp > 80 ? 0 : hp > 60 ? 1 : hp > 40 ? 2 : hp > 20 ? 3 : 4;
  o.save(); o.translate(x, y);
  o.fillStyle = '#120f0c'; o.fillRect(0, 0, 62, 50);
  const sk = P.dead ? '#7a5a4a' : '#c98d6a';
  ball(o, 31, 28, 19, 23, sk, 0, 0.35, 0.55);
  o.fillStyle = '#3a2414'; o.beginPath(); o.ellipse(31, 12, 19, 10, 0, Math.PI, TAU); o.fill(); o.fillRect(12, 8, 38, 6);
  ball(o, 13, 30, 3, 6, sk); ball(o, 49, 30, 3, 6, sk);
  const ey = 24, look = P.lookDir * 2;
  if (P.dead) { o.fillStyle = '#300'; o.fillRect(18, ey, 9, 3); o.fillRect(35, ey, 9, 3); }
  else {
    ball(o, 23, ey, 5, 3.5, '#f4efe6', 0, 0.2, 0.2); ball(o, 39, ey, 5, 3.5, '#f4efe6', 0, 0.2, 0.2);
    ball(o, 23 + look, ey, 2.4, 2.8, '#2a4a8a', 0, 0.4, 0.4); ball(o, 39 + look, ey, 2.4, 2.8, '#2a4a8a', 0, 0.4, 0.4);
    const angry = P.ouchT > 0 || lv >= 3 || P.wst.fire > 0;
    limb(o, 17, ey - (angry ? 5 : 7), 28, ey - (angry ? 3 : 7), 1.4, 1.4, '#3a2414');
    limb(o, 45, ey - (angry ? 5 : 7), 34, ey - (angry ? 3 : 7), 1.4, 1.4, '#3a2414');
  }
  ball(o, 31, 32, 3.5, 5, '#b07850', 0, 0.3, 0.3);
  if (P.grinT > 0 && !P.dead) { o.fillStyle = '#3a0a06'; rrect(o, 21, 40, 20, 6, 3); o.fill(); o.fillStyle = '#fff'; o.fillRect(23, 40, 16, 2); }
  else if (P.ouchT > 0 || P.dead) { ball(o, 31, 42, 5, 5, '#3a0a06', 0, 0, 0.2); }
  else { o.fillStyle = '#6a2a1a'; o.fillRect(23, 42, 16, 2); }
  o.fillStyle = '#a00808';
  if (lv >= 1) { o.fillRect(42, 14, 3, 8); }
  if (lv >= 2) { o.fillRect(16, 34, 5, 3); o.fillRect(44, 36, 3, 9); }
  if (lv >= 3) { o.fillRect(24, 10, 5, 5); o.fillRect(14, 20, 3, 10); }
  if (lv >= 4) { o.fillStyle = '#6a0404'; o.fillRect(18, 44, 26, 6); o.fillRect(32, 6, 6, 10); }
  o.restore();
}

// ---------- automap ----------
function drawAutomap(o, P, LV) {
  o.fillStyle = 'rgba(0,0,0,0.85)'; o.fillRect(0, 0, OW, VIEWH);
  const s = 13, ox = OW / 2 - P.x * s, oy = VIEWH / 2 - P.y * s;
  o.lineWidth = 2;
  const seg = (x0, y0, x1, y1, col) => { o.strokeStyle = col; o.beginPath(); o.moveTo(ox + x0 * s, oy + y0 * s); o.lineTo(ox + x1 * s, oy + y1 * s); o.stroke(); };
  for (let y = 0; y < WD.H; y++) for (let x = 0; x < WD.W; x++) {
    const c = cellAt(x, y);
    if (c.solid || !WD.seen[y * WD.W + x]) continue;
    for (const [dx, dy] of DIRS) {
      const nb = cellAt(x + dx, y + dy);
      let col = null;
      if (nb.solid) col = nb.exit ? '#40ff70' : '#d8301c';
      else if (Math.abs(nb.f - c.f) > 0.01 && nb.f > c.f) col = '#a07850';
      else if (nb.door && !c.door) col = nb.door.key === 'red' ? '#ff3a2a' : nb.door.key === 'blue' ? '#4a7aff' : '#e0c040';
      if (!col) continue;
      if (dx === 1) seg(x + 1, y, x + 1, y + 1, col); else if (dx === -1) seg(x, y, x, y + 1, col);
      else if (dy === 1) seg(x, y + 1, x + 1, y + 1, col); else seg(x, y, x + 1, y, col);
    }
  }
  const px = OW / 2, py = VIEWH / 2, c = Math.cos(P.a), sn = Math.sin(P.a);
  o.fillStyle = '#ffffff';
  poly(o, [px + c * 10, py + sn * 10, px - c * 6 - sn * 6, py - sn * 6 + c * 6, px - c * 6 + sn * 6, py - sn * 6 - c * 6]);
  o.font = '22px "VT323", monospace'; o.textAlign = 'left'; o.fillStyle = '#e0c040';
  o.fillText(LV.name.split(':')[0], 12, 24);
}
