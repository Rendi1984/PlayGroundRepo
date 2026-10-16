'use strict';
// Monster, item and effect sprites, painted with the 2D toolkit in a 128-unit
// coordinate space (feet at y = 126) and rendered at 2x for crisp billboards.
// Each monster pose: { walk: -1..1, atk, flash, pain, die: 0 | 1 | 2 | 3 }.

function blood(g, list) { for (const [x, y, r] of list) splat(g, x, y, r, '#9a0b07'); }

// ---------- humanoid soldiers ----------
function soldier(g, p, pal) {
  const w = p.walk || 0;
  const leg = (hx, kx, fx) => { limb(g, hx, 74, kx, 98, 8, 6.5, pal.pants); limb(g, kx, 98, fx, 120, 6.5, 5.5, pal.pants); ball(g, fx, 121, 9, 5, pal.boot); };
  leg(56, 54 + w * 5, 52 + w * 9); leg(72, 74 - w * 5, 76 - w * 9);
  limb(g, 64, 77, 64, 45, 15, 18, pal.armor);
  ball(g, 64, 54, 13, 11, pal.armor, 0, 0.6, 0.45);
  g.fillStyle = css(pal.belt); rrect(g, 47, 70, 34, 6, 2); g.fill();
  ball(g, 64, 73, 4, 3, '#b89a40');
  ball(g, 45, 45, 9, 7, pal.armor); ball(g, 83, 45, 9, 7, pal.armor);
  limb(g, 64, 41, 64, 33, 5, 5, pal.skin);
  if (p.atk) {
    limb(g, 45, 47, 51, 62, 6, 5, pal.armor); limb(g, 51, 62, 59, 64, 5, 4, pal.skin);
    limb(g, 83, 47, 77, 62, 6, 5, pal.armor); limb(g, 77, 62, 69, 64, 5, 4, pal.skin);
    cyl(g, 56, 50, 16, 18, pal.gun, 3);
    ball(g, 64, 52, pal.shotgun ? 6 : 4, pal.shotgun ? 4 : 3, '#060606', 0, 0.1, 0.2);
    if (p.flash) glowDot(g, 64, 48, 22, 'rgba(255,255,235,1)', 'rgba(255,180,50,0.95)');
  } else {
    limb(g, 45, 47, 41, 64, 6, 5, pal.armor); limb(g, 41, 64, 49, 76, 5, 4, pal.skin);
    limb(g, 83, 47, 87, 62, 6, 5, pal.armor); limb(g, 87, 62, 79, 69, 5, 4, pal.skin);
    limb(g, 34, 84, 94, 50, pal.shotgun ? 3.6 : 3, pal.shotgun ? 3.6 : 2.4, pal.gun);
    limb(g, 34, 84, 46, 78, 5, 4, pal.stock);
    if (pal.shotgun) limb(g, 62, 68, 74, 61, 4, 4, pal.stock);
  }
  ball(g, 64, 26, 10, 12, pal.skin);
  g.fillStyle = css(pal.hair); g.beginPath(); g.ellipse(64, 20, 10.5, 7, 0, Math.PI, TAU); g.fill();
  ball(g, 64, 23, 9, 3, pal.skin, 0, -0.1, 0.4);
  ball(g, 60, 26, 2.4, 1.7, p.pain ? '#ffffff' : pal.eye, 0, 0.8, 0.1);
  ball(g, 68, 26, 2.4, 1.7, p.pain ? '#ffffff' : pal.eye, 0, 0.8, 0.1);
  g.fillStyle = '#2a1210'; g.fillRect(60, 32, 8, p.pain ? 3 : 1.6);
  if (p.pain) blood(g, [[58, 52, 4], [70, 30, 2.5], [72, 60, 3]]);
}
function corpseSoldier(g, pal) {
  ball(g, 64, 120, 46, 7, '#5a0806', 0, 0.25, 0.4);
  limb(g, 36, 113, 84, 115, 10, 9, pal.armor);
  limb(g, 84, 115, 112, 117, 7, 6, pal.pants); limb(g, 84, 118, 110, 122, 6, 5, pal.pants);
  ball(g, 27, 111, 9, 8, pal.skin); limb(g, 46, 111, 42, 100, 4, 3.5, pal.skin);
  blood(g, [[50, 112, 4], [30, 106, 3]]);
}
// generic fall: stage 1 lean + spray, stage 2 almost down, stage 3 corpse
function fallPose(g, stage, standing, corpse) {
  if (stage === 3) { corpse(); return; }
  g.save(); g.translate(64, 124); g.rotate(stage === 1 ? -0.3 : -1.2); g.translate(-64, stage === 2 ? -116 : -124);
  standing(); g.restore();
  blood(g, stage === 1 ? [[78, 40, 5], [88, 30, 3], [70, 58, 4]] : [[60, 114, 6], [40, 108, 4]]);
}
const PAL_ZOMBIE = { skin: '#9c8676', armor: '#4f6c39', pants: '#5b4733', boot: '#2a221c', belt: '#2b2218', gun: '#2a2a2e', stock: '#5a3d22', hair: '#2a1e16', eye: '#d01810' };
const PAL_SERG = { skin: '#7a685c', armor: '#2e2f34', pants: '#3b3c44', boot: '#18181c', belt: '#4a3a24', gun: '#2a2a30', stock: '#6b4423', hair: '#141010', eye: '#e8d020', shotgun: true };
function drawSoldier(pal) {
  return (g, p) => {
    if (p.die) fallPose(g, p.die, () => soldier(g, {}, pal), () => corpseSoldier(g, pal));
    else soldier(g, p, pal);
  };
}

// ---------- imp ----------
function impBody(g, p) {
  const w = p.walk || 0, sk = '#8a5a32', sp = '#e6dcc4';
  const leg = (hx, s) => {
    const kx = hx - 4 * s + w * 5 * s, ax = hx + 2 * s + w * 8 * s;
    limb(g, hx, 76, kx, 96, 8, 6, sk); limb(g, kx, 96, ax, 112, 6, 5, sk); limb(g, ax, 112, ax - 4 * s, 123, 5, 4, sk);
    spike(g, ax - 6 * s, 123, ax - 11 * s, 126, 4, sp); spike(g, ax - 2 * s, 124, ax - 4 * s, 127, 4, sp);
  };
  leg(56, 1); leg(72, -1);
  limb(g, 64, 79, 64, 43, 13, 19, sk);
  ball(g, 56, 51, 9, 8, '#a87240'); ball(g, 72, 51, 9, 8, '#a87240');
  for (let i = 0; i < 3; i++) { ball(g, 60, 61 + i * 6, 4, 3, '#9a6838'); ball(g, 68, 61 + i * 6, 4, 3, '#9a6838'); }
  spike(g, 45, 43, 37, 29, 8, sp); spike(g, 83, 43, 91, 29, 8, sp);
  for (let i = 0; i < 3; i++) { spike(g, 51, 54 + i * 7, 44, 52 + i * 7, 4, sp); spike(g, 77, 54 + i * 7, 84, 52 + i * 7, 4, sp); }
  if (p.atk) {
    limb(g, 45, 45, 38, 60, 6, 5, sk); limb(g, 38, 60, 46, 70, 5, 4, sk);
    limb(g, 83, 45, 95, 30, 6, 5, sk); limb(g, 95, 30, 91, 13, 5, 4, sk);
    glowDot(g, 91, 10, p.flash ? 20 : 15, 'rgba(255,255,210,1)', 'rgba(255,110,10,0.95)');
  } else {
    limb(g, 45, 45, 37, 63, 6, 5, sk); limb(g, 37, 63, 39, 81, 5, 4, sk);
    limb(g, 83, 45, 91, 63, 6, 5, sk); limb(g, 91, 63, 89, 81, 5, 4, sk);
    for (const [x, s] of [[39, -1], [89, 1]]) for (let i = 0; i < 3; i++) spike(g, x - 3 + i * 3, 82, x - 4 + i * 3 + s, 89, 3, sp);
  }
  ball(g, 64, 27, 11, 12, sk);
  limb(g, 55, 21, 73, 21, 4, 4, '#6a4222');
  spike(g, 57, 17, 52, 6, 5, sp); spike(g, 71, 17, 76, 6, 5, sp);
  ball(g, 59, 25, 3, 2, p.pain ? '#ffffff' : '#ffb020', 0, 0.9, 0); ball(g, 69, 25, 3, 2, p.pain ? '#ffffff' : '#ffb020', 0, 0.9, 0);
  ball(g, 64, 33, 6, p.atk ? 4 : 2.6, '#2a0806', 0, 0.1, 0.2);
  g.fillStyle = '#f4f0e0'; for (let i = 0; i < 4; i++) g.fillRect(60 + i * 2.4, 31, 1.2, 2);
  if (p.pain) blood(g, [[60, 54, 4], [70, 26, 2.5]]);
}
function drawImp(g, p) {
  if (!p.die) { impBody(g, p); return; }
  fallPose(g, p.die, () => impBody(g, {}), () => {
    ball(g, 64, 120, 44, 7, '#5a0806', 0, 0.2, 0.4);
    ball(g, 60, 114, 26, 8, '#7a4c28');
    spike(g, 40, 112, 32, 102, 6, '#e6dcc4'); spike(g, 74, 110, 80, 100, 6, '#e6dcc4');
    ball(g, 94, 114, 9, 8, '#8a5a32'); ball(g, 92, 113, 2, 1.5, '#ffb020');
    blood(g, [[54, 112, 4]]);
  });
}

// ---------- pinky demon ----------
function demonBody(g, p) {
  const w = p.walk || 0, pk = '#d07a86';
  const leg = (hx, s) => { const kx = hx - 4 * s + w * 5 * s; limb(g, hx, 92, kx, 110, 11, 9, pk); limb(g, kx, 110, kx + 2 * s, 120, 9, 8, pk); ball(g, kx + 2 * s, 122, 10, 5, '#3a2224'); };
  leg(46, 1); leg(82, -1);
  ball(g, 64, 78, 37, 27, pk);
  ball(g, 64, 87, 25, 14, '#e09aa4', 0, 0.3, 0.3);
  for (const s of [-1, 1]) {
    limb(g, 64 + 33 * s, 70, 64 + 40 * s, 88, 8, 7, pk); limb(g, 64 + 40 * s, 88, 64 + 36 * s, 99, 7, 6, pk);
    for (let i = 0; i < 3; i++) spike(g, 64 + (33 + i * 3) * s, 100, 64 + (34 + i * 3) * s, 106, 3, '#f0e8d8');
  }
  const open = p.atk ? 15 : 8, my = p.atk ? 64 : 61;
  ball(g, 64, 50, 28, 21, pk);
  ball(g, 64, my, 21, open, '#3a0408', 0, 0.15, 0.3);
  for (let i = 0; i < 6; i++) {
    const x = 50 + i * 5.6;
    spike(g, x, my - open + 1, x + 0.5, my - open + 8, 4.5, '#f4f0e0');
    spike(g, x + 2, my + open - 1, x + 2.5, my + open - 7, 4.5, '#f4f0e0');
  }
  ball(g, 51, 40, 4.5, 3.4, p.pain ? '#ffffff' : '#d8e040', 0, 0.8, 0.1); ball(g, 77, 40, 4.5, 3.4, p.pain ? '#ffffff' : '#d8e040', 0, 0.8, 0.1);
  limb(g, 44, 35, 56, 37, 3, 3, '#8a3c4a'); limb(g, 84, 35, 72, 37, 3, 3, '#8a3c4a');
  spike(g, 42, 34, 36, 25, 6, '#e8d8c0'); spike(g, 86, 34, 92, 25, 6, '#e8d8c0');
  if (p.pain) blood(g, [[50, 80, 5], [80, 48, 3]]);
}
function drawDemon(g, p) {
  if (!p.die) { demonBody(g, p); return; }
  fallPose(g, p.die, () => demonBody(g, {}), () => {
    ball(g, 64, 120, 50, 7, '#5a0806', 0, 0.2, 0.4);
    ball(g, 62, 112, 34, 12, '#c06a78');
    for (let i = 0; i < 6; i++) spike(g, 70 + i * 4, 106, 71 + i * 4, 100, 3.5, '#f4f0e0');
    blood(g, [[40, 110, 5]]);
  });
}

// ---------- lost soul ----------
function drawSoul(g, p) {
  if (p.die) {
    const r = 20 + p.die * 14;
    glowDot(g, 64, 64, r + 16, 'rgba(255,255,210,1)', 'rgba(255,120,20,0.95)');
    if (p.die < 3) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + p.die; ball(g, 64 + Math.cos(a) * r, 64 + Math.sin(a) * r, 6, 6, '#e8dccb'); }
    return;
  }
  srand(11);
  for (let i = 0; i < 14; i++) {
    const a = Math.PI + (i / 13) * Math.PI, len = 26 + rnd() * 22 + (p.atk ? 10 : 0), bx = 64 + Math.cos(a) * 20, by = 66 + Math.sin(a) * 18;
    spike(g, bx, by, bx + Math.cos(a) * len, by + Math.sin(a) * len - 8, 14, '#ff6a10');
    spike(g, bx, by, bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.6 - 5, 7, '#ffd040');
  }
  for (const s of [-1, 1]) spike(g, 64 + 18 * s, 52, 64 + 26 * s, 36, 6, '#d8ccb8');
  ball(g, 64, 60, 25, 23, '#e8dccb');
  ball(g, 64, 80, 16, 8, '#d8ccb8');
  ball(g, 55, 59, 7.5, 7, '#160806', 0, 0.1, 0.2); ball(g, 73, 59, 7.5, 7, '#160806', 0, 0.1, 0.2);
  glowDot(g, 55, 60, 4, 'rgba(255,240,180,1)', 'rgba(255,60,20,1)'); glowDot(g, 73, 60, 4, 'rgba(255,240,180,1)', 'rgba(255,60,20,1)');
  poly(g, [64, 66, 60, 74, 68, 74], '#2a1410');
  const jaw = p.atk ? 9 : 0;
  g.fillStyle = '#2a1410'; g.fillRect(52, 77, 24, 3 + jaw);
  ball(g, 64, 86 + jaw, 14, 6, '#d8ccb8');
  g.fillStyle = '#f8f0e0';
  for (let i = 0; i < 6; i++) { g.fillRect(53 + i * 4, 76, 3, 4); g.fillRect(53 + i * 4, 80 + jaw, 3, 4); }
}

// ---------- cacodemon ----------
function cacoBody(g, p) {
  const rd = '#c42a24', hn = '#e8d8c0';
  spike(g, 40, 34, 28, 12, 12, hn); spike(g, 52, 24, 47, 2, 10, hn); spike(g, 76, 24, 81, 2, 10, hn); spike(g, 88, 34, 100, 12, 12, hn);
  ball(g, 64, 66, 52, 50, rd, 0, 0.4, 0.7);
  srand(5);
  for (let i = 0; i < 14; i++) { const a = rnd() * TAU, d = 20 + rnd() * 26; ball(g, 64 + Math.cos(a) * d, 66 + Math.sin(a) * d * 0.9, 4 + rnd() * 4, 3 + rnd() * 3, '#9a1c18', 0, 0.3, 0.5); }
  const open = p.atk ? 20 : 9;
  ball(g, 64, 92, 31, open, '#2a0204', 0, 0.12, 0.3);
  if (p.atk) glowDot(g, 64, 92, 18, 'rgba(255,220,255,1)', 'rgba(255,60,140,0.95)');
  for (let i = 0; i < 8; i++) {
    const x = 39 + i * 7;
    spike(g, x, 92 - open + 1, x + 1, 92 - open + 9, 5, '#f8f0e0');
    spike(g, x + 3, 92 + open - 1, x + 4, 92 + open - 7, 5, '#f8f0e0');
  }
  ball(g, 64, 48, 16, 15, '#f2f0e0', 0, 0.5, 0.4);
  if (p.pain) { ball(g, 64, 48, 17, 16, rd); limb(g, 50, 48, 78, 48, 1.5, 1.5, '#4a0806'); blood(g, [[40, 70, 5], [86, 80, 4]]); }
  else { ball(g, 64, 48, 10.5, 10.5, '#3fc046', 0, 0.6, 0.5); ball(g, 64, 48, 3, 8, '#061006', 0, 0.1, 0.1); ball(g, 60, 44, 2.5, 2, '#ffffff', 0, 0, 0); }
}
function drawCaco(g, p) {
  if (!p.die) { cacoBody(g, p); return; }
  if (p.die === 1) { g.save(); g.translate(64, 120); g.scale(1.05, 0.88); g.translate(-64, -120); cacoBody(g, { pain: 1 }); g.restore(); return; }
  ball(g, 64, 120, 54, 8, '#5a0806', 0, 0.2, 0.4);
  ball(g, 64, p.die === 2 ? 100 : 112, 50, p.die === 2 ? 26 : 13, '#b0261f');
  spike(g, 30, p.die === 2 ? 92 : 108, 18, p.die === 2 ? 80 : 102, 9, '#e8d8c0'); spike(g, 98, p.die === 2 ? 92 : 108, 110, p.die === 2 ? 80 : 102, 9, '#e8d8c0');
  blood(g, [[44, 110, 5], [80, 106, 4], [64, 116, 6]]);
}

// ---------- baron ----------
function baronBody(g, p) {
  const w = p.walk || 0, sk = '#c9967c', fur = '#6e4c32', hn = '#e8dcc0';
  const leg = (hx, s) => {
    const kx = hx - 6 * s + w * 5 * s, ax = hx + 2 * s + w * 8 * s;
    limb(g, hx, 74, kx, 93, 11, 9, fur); limb(g, kx, 93, ax, 110, 8, 6, fur); limb(g, ax, 110, ax - 2 * s, 124, 5, 5, '#24160c');
  };
  leg(54, 1); leg(74, -1);
  ball(g, 64, 72, 21, 9, fur);
  limb(g, 64, 74, 64, 36, 16, 23, sk);
  ball(g, 54, 45, 11, 9, '#d8a890'); ball(g, 74, 45, 11, 9, '#d8a890');
  for (let i = 0; i < 3; i++) { ball(g, 59, 56 + i * 6, 4.5, 3, '#b8846c'); ball(g, 69, 56 + i * 6, 4.5, 3, '#b8846c'); }
  if (p.atk) {
    limb(g, 41, 39, 34, 58, 8, 7, sk); limb(g, 34, 58, 42, 70, 7, 6, sk);
    limb(g, 87, 39, 99, 22, 8, 7, sk); limb(g, 99, 22, 95, 7, 7, 6, sk);
    glowDot(g, 95, 6, p.flash ? 22 : 17, 'rgba(225,255,225,1)', 'rgba(60,255,60,0.95)');
  } else {
    limb(g, 41, 39, 33, 61, 8, 7, sk); limb(g, 33, 61, 37, 83, 7, 6, sk); ball(g, 37, 85, 6, 5, sk);
    limb(g, 87, 39, 95, 61, 8, 7, sk); limb(g, 95, 61, 91, 83, 7, 6, sk); ball(g, 91, 85, 6, 5, sk);
  }
  ball(g, 64, 24, 10, 11, sk);
  for (const s of [-1, 1]) { limb(g, 64 + 7 * s, 18, 64 + 18 * s, 12, 4.5, 3.5, hn); limb(g, 64 + 18 * s, 12, 64 + 21 * s, 1, 3.5, 1.5, hn); }
  ball(g, 60, 23, 2.6, 1.8, p.pain ? '#ffffff' : '#ffe040', 0, 0.9, 0); ball(g, 68, 23, 2.6, 1.8, p.pain ? '#ffffff' : '#ffe040', 0, 0.9, 0);
  ball(g, 64, 30, 5, p.atk ? 3.5 : 2, '#2a0806', 0, 0.1, 0.2);
  if (p.pain) blood(g, [[60, 50, 5], [70, 24, 2.5]]);
}
function drawBaron(g, p) {
  if (!p.die) { baronBody(g, p); return; }
  fallPose(g, p.die, () => baronBody(g, {}), () => {
    ball(g, 64, 120, 50, 8, '#5a0806', 0, 0.2, 0.4);
    limb(g, 30, 112, 84, 114, 12, 11, '#c9967c'); limb(g, 84, 114, 114, 118, 9, 7, '#6e4c32');
    ball(g, 22, 110, 9, 9, '#c9967c'); limb(g, 18, 104, 10, 96, 3, 1.5, '#e8dcc0');
    blood(g, [[50, 110, 5], [70, 108, 3]]);
  });
}

// ---------- items & decor (64x64 design space, painted at 2x) ----------
function crossBox(g, x, y, w, h) {
  hcyl(g, x, y, w, h, '#e4e4dc', 3, 0.3, 0.4);
  g.fillStyle = '#c41010'; g.fillRect(x + w / 2 - w * 0.11, y + h * 0.15, w * 0.22, h * 0.7); g.fillRect(x + w * 0.25, y + h / 2 - h * 0.12, w * 0.5, h * 0.24);
}
function weaponSide(g, kind) {
  if (kind === 'shotgun') { hcyl(g, 6, 34, 78, 6, '#2c2c32', 2); hcyl(g, 20, 40, 34, 5, '#6b4423', 2); poly(g, [80, 34, 122, 38, 122, 52, 86, 44], css('#6b4423')); }
  if (kind === 'chaingun') { for (let i = 0; i < 3; i++) hcyl(g, 4, 32 + i * 5, 46, 4, '#2a2a2e', 2); hcyl(g, 44, 28, 54, 22, '#55555e', 4); hcyl(g, 70, 48, 14, 12, '#3a3a40', 2); hcyl(g, 96, 34, 24, 8, '#3a3a40', 3); }
  if (kind === 'launcher') { hcyl(g, 4, 26, 116, 20, '#5a5c3a', 6); ball(g, 8, 36, 4, 9, '#141410'); hcyl(g, 60, 46, 12, 14, '#3a3a2a', 2); hcyl(g, 40, 16, 24, 10, '#3a3c2a', 2); }
  if (kind === 'plasma') { hcyl(g, 10, 26, 100, 22, '#3a4458', 6); for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(120,200,255,1)'; g.fillRect(30 + i * 14, 27, 5, 20); } hcyl(g, 2, 32, 12, 10, '#2a3040', 3); hcyl(g, 70, 48, 14, 12, '#2a3040', 2); }
}
const ITEM_ART = {
  clip: g => { hcyl(g, 22, 40, 20, 22, '#3a3428', 2); for (let i = 0; i < 4; i++) cyl(g, 23 + i * 4.6, 34, 4, 8, '#d0a848', 2); },
  ammobox: g => { hcyl(g, 8, 36, 48, 26, '#4a5a32', 3); g.fillStyle = '#d0a848'; for (let i = 0; i < 6; i++) g.fillRect(13 + i * 7, 41, 4, 4); hcyl(g, 8, 50, 48, 4, '#2a3420', 1); },
  shells: g => { for (let i = 0; i < 4; i++) { cyl(g, 16 + i * 8, 40, 7, 20, '#b8221a', 2); cyl(g, 16 + i * 8, 54, 7, 8, '#d4a848', 1); } },
  shellbox: g => { hcyl(g, 8, 34, 48, 28, '#9a1c14', 3); for (let i = 0; i < 5; i++) cyl(g, 12 + i * 9, 30, 7, 8, '#d4a848', 2); hcyl(g, 8, 48, 48, 5, '#5a0c08', 1); },
  rocket: g => { cyl(g, 27, 18, 10, 40, '#6a6a5a', 3); poly(g, [27, 20, 32, 6, 37, 20], css('#c02018')); poly(g, [24, 62, 27, 50, 27, 62], css('#4a4a40')); poly(g, [40, 62, 37, 50, 37, 62], css('#4a4a40')); },
  rocketbox: g => { hcyl(g, 6, 38, 52, 24, '#5a4a30', 3); for (let i = 0; i < 4; i++) { cyl(g, 10 + i * 12, 24, 8, 16, '#6a6a5a', 2); poly(g, [10 + i * 12, 25, 14 + i * 12, 16, 18 + i * 12, 25], css('#c02018')); } },
  cell: g => { hcyl(g, 18, 40, 28, 22, '#3a3e48', 3); g.fillStyle = '#50ff80'; g.fillRect(24, 46, 6, 4); g.fillRect(34, 46, 6, 4); },
  cellpack: g => { hcyl(g, 6, 28, 52, 34, '#3a3e48', 4); g.fillStyle = '#50ff80'; for (let i = 0; i < 4; i++) g.fillRect(12 + i * 11, 34, 6, 6); hcyl(g, 6, 48, 52, 6, '#22262e', 2); },
  stim: g => crossBox(g, 20, 44, 24, 18),
  medikit: g => { crossBox(g, 8, 34, 48, 28); hcyl(g, 24, 28, 16, 6, '#666', 2); },
  soulsphere: g => {
    glowDot(g, 32, 30, 30, 'rgba(200,230,255,1)', 'rgba(40,90,255,0.9)');
    ball(g, 32, 30, 20, 20, '#3a6af0', 0, 0.7, 0.5);
    ball(g, 26, 26, 4, 3, '#0a1440'); ball(g, 38, 26, 4, 3, '#0a1440'); ball(g, 32, 37, 6, 3, '#0a1440');
  },
  greenarmor: g => { poly(g, [10, 22, 22, 12, 27, 22, 37, 22, 42, 12, 54, 22, 52, 60, 12, 60], css('#2e8a2e')); ball(g, 32, 40, 16, 16, '#3aa63a', 0, 0.5, 0.2); poly(g, [26, 22, 32, 32, 38, 22], css('#124012')); hcyl(g, 12, 44, 40, 4, '#1a5a1a', 1); },
  bluearmor: g => { poly(g, [10, 22, 22, 12, 27, 22, 37, 22, 42, 12, 54, 22, 52, 60, 12, 60], css('#2a4ad0')); ball(g, 32, 40, 16, 16, '#3a66f0', 0, 0.5, 0.2); poly(g, [26, 22, 32, 32, 38, 22], css('#0a1450')); hcyl(g, 12, 44, 40, 4, '#1a2a8a', 1); },
  redkey: g => { glowDot(g, 32, 44, 20, 'rgba(255,120,100,1)', 'rgba(220,20,10,0.6)'); hcyl(g, 24, 32, 16, 26, '#e01818', 3); g.fillStyle = '#fff'; g.fillRect(27, 38, 10, 3); },
  bluekey: g => { glowDot(g, 32, 44, 20, 'rgba(140,170,255,1)', 'rgba(20,60,240,0.6)'); hcyl(g, 24, 32, 16, 26, '#2050f0', 3); g.fillStyle = '#fff'; g.fillRect(27, 38, 10, 3); },
  barrel: g => {
    cyl(g, 12, 12, 40, 50, '#5a6a4a', 6, 0.35, 0.7);
    hcyl(g, 12, 26, 40, 3, '#34402c', 1); hcyl(g, 12, 46, 40, 3, '#34402c', 1);
    ball(g, 32, 13, 19, 5, '#50ff40', 0, 0.6, 0.3);
    g.fillStyle = '#40e030'; g.fillRect(36, 14, 4, 12); g.fillRect(22, 14, 3, 7);
  },
};
const TALL_ART = { // 32x128 design space
  lamp: g => { cyl(g, 13, 26, 6, 98, '#5a5a62', 2); hcyl(g, 6, 118, 20, 8, '#3a3a40', 2); glowDot(g, 16, 16, 15, 'rgba(255,255,245,1)', 'rgba(220,235,255,0.85)'); ball(g, 16, 16, 7, 9, '#fffbea', 0, 0.3, 0.1); hcyl(g, 8, 24, 16, 5, '#3a3a40', 2); },
  torch: g => { cyl(g, 12, 44, 8, 82, '#5a3a28', 2); hcyl(g, 8, 40, 16, 6, '#3a2418', 2); spike(g, 16, 42, 16, 6, 16, '#ff4a10'); spike(g, 16, 42, 15, 16, 9, '#ffcc40'); },
};
const WSIDE = ['shotgun', 'chaingun', 'launcher', 'plasma'];

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4;
  return t;
}
function paint(w, h, scale, fn, line = true) {
  const c = mkCanvas(w * scale, h * scale), g = c.getContext('2d');
  g.scale(scale, scale); fn(g);
  if (line) outline(c);
  return canvasTexture(c);
}
const SPR = {};
function initSprites() {
  const set = draw => {
    const f = p => paint(128, 128, 2, g => draw(g, p));
    return { walk: [f({ walk: 1 }), f({ walk: -1 })], atk: f({ atk: 1 }), fire: f({ atk: 1, flash: 1 }), pain: f({ pain: 1 }), die: [f({ die: 1 }), f({ die: 2 })], dead: f({ die: 3 }) };
  };
  SPR.zombie = set(drawSoldier(PAL_ZOMBIE));
  SPR.sergeant = set(drawSoldier(PAL_SERG));
  SPR.imp = set(drawImp);
  SPR.demon = set(drawDemon);
  SPR.spectre = SPR.demon;
  SPR.caco = set(drawCaco);
  SPR.baron = set(drawBaron);
  SPR.lostsoul = set(drawSoul);
  for (const k in ITEM_ART) SPR[k] = paint(64, 64, 2, ITEM_ART[k]);
  for (const k in TALL_ART) SPR[k] = paint(32, 128, 2, TALL_ART[k]);
  for (const k of WSIDE) SPR[k] = paint(128, 64, 2, g => weaponSide(g, k));
  // soft round glow used for projectiles, halos and explosions (additive)
  const gc = mkCanvas(64, 64), gg = gc.getContext('2d');
  glowDot(gg, 32, 32, 32, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.35)');
  SPR.glow = new THREE.CanvasTexture(gc);
  const sc = mkCanvas(64, 64), sg = sc.getContext('2d');
  const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64);
  SPR.shadow = new THREE.CanvasTexture(sc);
}
