const { chromium } = require('playwright-core');
const fs=require('fs');
(async()=>{
  const [mode, ...ts] = process.argv.slice(2);
  const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
  const p = await b.newPage({viewport:{width:540,height:960},deviceScaleFactor:2});
  await p.goto('file://'+__dirname+'/ad.html'); await p.evaluate(()=>document.fonts.ready); await p.waitForTimeout(800);
  if(mode==='stills'){ for(const t of ts){ await p.evaluate(t=>render(+t),t); await p.screenshot({path:`still_${t}.png`}); } }
  else { fs.mkdirSync('frames',{recursive:true}); const fps=30, dur=+ts[0];
    for(let i=0;i<fps*dur;i++){ await p.evaluate(t=>render(t),i/fps); await p.screenshot({path:`frames/f${String(i).padStart(4,'0')}.png`}); } }
  await b.close();
})();
