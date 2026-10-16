'use strict';
// Soft textures used for additive glows (projectiles, halos, muzzle flash) and blob shadows.
const SPR = {};
function initSprites() {
  const gc = mkCanvas(64, 64), gg = gc.getContext('2d');
  glowDot(gg, 32, 32, 32, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.35)');
  SPR.glow = new THREE.CanvasTexture(gc);
  const fc = mkCanvas(128, 128), fg = fc.getContext('2d');
  fg.translate(64, 64); fg.fillStyle = '#fff';
  for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, l = 40 + (i % 3) * 14; fg.beginPath(); fg.moveTo(Math.cos(a + 0.18) * 10, Math.sin(a + 0.18) * 10); fg.lineTo(Math.cos(a) * l, Math.sin(a) * l); fg.lineTo(Math.cos(a - 0.18) * 10, Math.sin(a - 0.18) * 10); fg.fill(); }
  glowDot(fg, 0, 0, 34, 'rgba(255,255,255,1)', 'rgba(255,255,255,0.6)');
  SPR.star = new THREE.CanvasTexture(fc);
  const sc = mkCanvas(64, 64), sg = sc.getContext('2d');
  const gr = sg.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  sg.fillStyle = gr; sg.fillRect(0, 0, 64, 64);
  SPR.shadow = new THREE.CanvasTexture(sc);
}
