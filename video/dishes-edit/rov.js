const { chromium } = require('playwright-core');const fs=require('fs');
(async()=>{const [mode,...ts]=process.argv.slice(2);
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:540,height:960},deviceScaleFactor:2});
 p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto('file://'+__dirname+'/overlay.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1000);
 if(mode==='stills'){for(const t of ts){await p.evaluate(t=>render(+t),t);await p.screenshot({path:`ov_${t}.png`,omitBackground:true});}}
 else{const [from,to]=ts.map(Number);fs.mkdirSync('ovf',{recursive:true});
  for(let i=from;i<to;i++){await p.evaluate(t=>render(t),i/30);await p.screenshot({path:`ovf/o${String(i).padStart(4,'0')}.png`,omitBackground:true});}}
 await b.close();})();
