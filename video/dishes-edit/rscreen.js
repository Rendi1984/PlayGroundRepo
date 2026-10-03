const { chromium } = require('playwright-core');const fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:240,height:440},deviceScaleFactor:2});
 p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto('file://'+__dirname+'/screen.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(800);
 for(const m of ['mi-d','mi-r']){await p.evaluate(m=>show(m,0),m);await p.screenshot({path:`scr_${m}.png`});}
 fs.mkdirSync('wheelscr',{recursive:true});
 for(let i=0;i<190;i++){const t=i/23.75;await p.evaluate(t=>show('wheel',t),t);await p.screenshot({path:`wheelscr/w${String(i).padStart(4,'0')}.png`});}
 await b.close();})();
