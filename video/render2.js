const { chromium } = require('playwright-core');const fs=require('fs');
(async()=>{const [page,mode,...ts]=process.argv.slice(2);
 const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
 const p=await b.newPage({viewport:{width:540,height:960},deviceScaleFactor:2});
 p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto('file://'+__dirname+'/'+page);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1000);
 if(mode==='stills'){for(const t of ts){await p.evaluate(t=>render(+t),t);await p.screenshot({path:`s2_${t}.png`});}}
 else{const [fps,dur,from=0,to]=ts.map(Number);fs.mkdirSync('frames2',{recursive:true});const N=to||fps*dur;
  for(let i=from;i<N;i++){await p.evaluate(t=>render(t),i/fps);await p.screenshot({path:`frames2/f${String(i).padStart(4,'0')}.png`});}}
 await b.close();})();
