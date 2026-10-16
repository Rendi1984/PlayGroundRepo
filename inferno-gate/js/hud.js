'use strict';
// 2D overlay drawn on top of the 3D view: status bar, face, messages, automap. Design space is 640x400; the 3D view covers y 0..336.
const OW = 640, OH = 400, VIEWH = 336;
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
