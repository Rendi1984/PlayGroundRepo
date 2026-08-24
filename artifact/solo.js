(() => {
  'use strict';
  const SPIN_MS = 4700;
  let names = ['', ''], level = 2, turn = 0, round = 1, phase = 'setup';
  let rotation = 0, task = null, score = [0, 0], log = [];

  const fill = (t, you, them) => t.replace(/\{you\}/g, you).replace(/\{them\}/g, them);
  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const app = () => document.getElementById('app');

  function drawWheel() {
    const cv = document.getElementById('wheel');
    if (!cv) return;
    const S = 640, R = S / 2, ctx = cv.getContext('2d');
    cv.width = S; cv.height = S;
    const step = (Math.PI * 2) / SEGMENTS.length;
    SEGMENTS.forEach((seg, i) => {
      const a0 = -Math.PI / 2 + i * step;
      ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, R - 4, a0, a0 + step); ctx.closePath();
      ctx.fillStyle = seg.hue; ctx.fill();
      ctx.strokeStyle = 'rgba(27,15,28,.55)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.save(); ctx.translate(R, R); ctx.rotate(a0 + step / 2);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.font = '600 34px Assistant, system-ui, sans-serif';
      ctx.fillText(seg.label, R - 74, 0);
      ctx.font = '40px system-ui, sans-serif';
      ctx.fillText(seg.icon, R - 26, 2);
      ctx.restore();
    });
  }

  function spin() {
    const seg = Math.floor(Math.random() * SEGMENTS.length);
    const all = TASKS[SEGMENTS[seg].key].filter(t => t.level <= level);
    // levels 1–2 are additive; from 3 up, keep the heat where the dial is
    const hot = level >= 3 ? all.filter(t => t.level >= level - 1) : [];
    const pool = hot.length ? hot : all;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    task = { icon: SEGMENTS[seg].icon, cat: SEGMENTS[seg].label, level: pick.level,
      text: fill(pick.text, names[turn], names[1 - turn]) };
    const target = ((-45 * seg - 22.5) % 360 + 360) % 360;
    const now = ((rotation % 360) + 360) % 360;
    rotation += 4 * 360 + ((target - now) + 360) % 360;
    phase = 'spinning'; render();
    const cv = document.getElementById('wheel');
    if (cv) requestAnimationFrame(() => { cv.style.transform = `rotate(${rotation}deg)`; });
    setTimeout(() => { phase = 'task'; render(); }, SPIN_MS);
  }

  function finish(done) {
    if (done) {
      score[turn] += 1;
      log = [{ name: names[turn], icon: task.icon, text: task.text }, ...log].slice(0, 4);
    }
    turn = 1 - turn; round += 1; phase = 'idle'; task = null; render();
  }

  const wheelBox = icon => `<div class="wheelbox"><div class="pointer"></div>
    <canvas id="wheel"></canvas><div class="cap">${icon}</div></div>`;

  function render() {
    if (phase === 'setup') {
      app().innerHTML = `
        <div class="stage">${wheelBox('💞')}</div>
        <div class="panel">
          <p class="eyebrow">משחק לשניים · טלפון אחד</p>
          <h1>גלגל הזוגות</h1>
          <p class="muted" style="margin:10px 0 16px">מסובבים את הגלגל, הוא נוחת על משימה — ומבצעים. מעבירים את הטלפון ביניכם בכל תור.</p>
          <input id="n0" maxlength="14" placeholder="השם שלך">
          <div style="height:10px"></div>
          <input id="n1" maxlength="14" placeholder="השם של בן/בת הזוג">
          <div class="actions" style="margin-top:12px"><button class="btn rose" id="btnGo">מתחילים</button></div>
        </div>`;
      drawWheel();
      document.getElementById('btnGo').onclick = () => {
        names = [document.getElementById('n0').value.trim() || 'את/ה',
                 document.getElementById('n1').value.trim() || 'בן/בת הזוג'];
        phase = 'idle'; render();
      };
      return;
    }

    const callout = phase === 'spinning' ? 'הגלגל מסתובב…'
      : phase === 'task' ? `המשימה של <b>${esc(names[turn])}</b>`
      : `התור של <b>${esc(names[turn])}</b> — העבירו את הטלפון`;

    app().innerHTML = `
      <div class="topbar">
        <button class="room" id="btnReset">משחק חדש</button>
        <div class="score">${names.map((n, i) =>
          `<span class="pill${i === turn ? ' turn' : ''}">${esc(n)} <b>${score[i]}</b></span>`).join('')}</div>
      </div>

      <div class="stage">
        ${wheelBox(phase === 'task' && task ? task.icon : '💞')}
        <p class="callout">${callout}</p>
      </div>

      ${phase === 'task' && task ? `
        <div class="task">
          <div class="icon">${task.icon}</div>
          <p class="cat">${esc(task.cat)} · ${esc((LEVELS.find(l => l.id === task.level) || {}).name || '')}</p>
          <p>${esc(task.text)}</p>
          <p class="who">סיבוב ${round}</p>
        </div>
        <div class="actions"><div class="btn two">
          <button class="btn rose" id="btnDone">בוצע ✔</button>
          <button class="btn" id="btnSkip">דלגו</button>
        </div></div>` : `
        <div class="actions">
          <button class="btn rose" id="btnSpin" ${phase === 'spinning' ? 'disabled' : ''}>
            ${phase === 'spinning' ? 'מסתובב…' : 'סובבו את הגלגל'}</button>
        </div>`}

      <div class="panel">
        <p class="eyebrow">רמת החום</p>
        <div class="levels">${LEVELS.map(l =>
          `<button class="level" data-level="${l.id}" aria-pressed="${l.id === level}">${l.name}<small>${l.note}</small></button>`).join('')}</div>
      </div>

      ${log.length ? `<div class="log">${log.map(l =>
        `<div><span>${l.icon}</span><b>${esc(l.name)}</b><span>${esc(l.text)}</span></div>`).join('')}</div>` : ''}`;

    drawWheel();
    const cv = document.getElementById('wheel');
    if (cv && phase !== 'spinning') {
      cv.style.transition = 'none';
      cv.style.transform = `rotate(${rotation}deg)`;
      void cv.offsetWidth;
      cv.style.transition = '';
    }
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('btnSpin', spin);
    on('btnDone', () => finish(true));
    on('btnSkip', () => finish(false));
    on('btnReset', () => { score = [0, 0]; log = []; round = 1; turn = 0; phase = 'setup'; render(); });
    app().querySelectorAll('.level').forEach(b =>
      b.onclick = () => { level = +b.dataset.level; render(); });
  }

  render();
})();
