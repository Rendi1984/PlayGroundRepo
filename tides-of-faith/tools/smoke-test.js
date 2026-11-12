// Smoke test: loads the game, builds every facility, takes close-up screenshots, reports page errors.
// Usage: npm i playwright && node tools/smoke-test.js [outDir]
// THREE_LOCAL=/path/to/three/package  -> serve three@0.160.0 from disk (when the CDN is blocked)
const { chromium } = require('playwright'); const path = require('path');
const out = process.argv[2] || '.'; const page = 'file://' + path.resolve(__dirname, '../index.html');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 850 } }); const errs = []; p.on('pageerror', e => errs.push(e.stack));
  if (process.env.THREE_LOCAL) await p.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ path: path.join(process.env.THREE_LOCAL, r.request().url().split('three@0.160.0/')[1]), contentType: 'application/javascript' }));
  await p.goto(page); await p.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await p.click('#startBtn');
  await p.evaluate(() => { const g = window.__game, v = g.villages().find(v => v.owner === 'p'); for (let i = 0; i < 60; i++) g.update(0.05); v.wood = 400;
    let k = 0; for (const t of ['barracks', 'granary', 'well', 'shrine']) { g.select(t); for (let a = k; a < 6.28 + k; a += 0.25) { const n = v.sites.length; g.tryPlace(t, v.x + Math.cos(a) * 130, v.y + Math.sin(a) * 130); if (v.sites.length > n) break; } k += 1.2; }
    for (const s of [...v.sites]) { s.progress = s.need; g.completeSite(s); }
    g.select('hand'); for (let i = 0; i < 200; i++) g.update(0.05); });
  for (const t of ['barracks', 'granary', 'well', 'shrine']) {
    await p.evaluate(t => { const g = window.__game, v = g.villages().find(v => v.owner === 'p'), h = v.houses.find(h => h.type === t); if (!h) return; g.camS.tx = h.x / 20 - 62.5; g.camS.tz = h.y / 20 - 42.5; g.camS.dist = 5; g.camS.yaw = -h.rot + 1.2; }, t);
    await p.waitForTimeout(2500); await p.screenshot({ path: path.join(out, `smoke-${t}.png`), timeout: 180000 });
  }
  const types = await p.evaluate(() => window.__game.villages().find(v => v.owner === 'p').houses.map(h => h.type));
  console.log('buildings:', types.join(', ')); console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors'); await b.close(); process.exit(errs.length ? 1 : 0);
})();
