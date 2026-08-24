(() => {
  'use strict';
  const SPIN_MS = 4700;
  let names = ['', ''], genders = ['m', 'f'], level = 1, manual = false;
  let turn = 0, round = 1, phase = 'setup', rotation = 0, task = null, score = [0, 0], log = [], used = [];

  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const app = () => document.getElementById('app');

  // {זכר|נקבה} נוטה לפי מי שמבצע/ת, [זכר|נקבה] לפי בן/בת הזוג
  const fill = (text, you, them, gYou, gThem) =>
    text.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (m, a, b) => gYou === 'f' ? b : a)
        .replace(/\[([^\[\]|]*)\|([^\[\]|]*)\]/g, (m, a, b) => gThem === 'f' ? b : a)
        .replace(/\{you\}/g, you).replace(/\{them\}/g, them);

  const taskId = (key, i) => key + ':' + i;
  const unused = (key, lvl) => TASKS[key]
    .map((t, i) => ({ ...t, id: taskId(key, i) }))
    .filter(t => t.level <= lvl && !used.includes(t.id));
  const liveSegments = () => SEGMENTS.map((s, i) => i).filter(i => unused(SEGMENTS[i].key, level).length);

  function drawWheel() {
    const cv = document.getElementById('wheel');
    if (!cv) return;
    const spent = SEGMENTS.map(sg => !unused(sg.key, 4).length);
    const S = 640, R = S / 2, ctx = cv.getContext('2d');
    cv.width = S; cv.height = S;
    const step = (Math.PI * 2) / SEGMENTS.length;
    SEGMENTS.forEach((seg, i) => {
      const a0 = -Math.PI / 2 + i * step;
      ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, R - 4, a0, a0 + step); ctx.closePath();
      ctx.fillStyle = spent[i] ? '#3a2b3c' : seg.hue; ctx.fill();
      ctx.strokeStyle = 'rgba(27,15,28,.55)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.save(); ctx.translate(R, R); ctx.rotate(a0 + step / 2);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = spent[i] ? 'rgba(255,255,255,.32)' : '#fff';
      ctx.globalAlpha = spent[i] ? .55 : 1;
      ctx.font = '600 34px Assistant, system-ui, sans-serif';
      ctx.fillText(seg.label, R - 74, 0);
      ctx.font = '40px system-ui, sans-serif';
      ctx.fillText(seg.icon, R - 26, 2);
      ctx.globalAlpha = 1; ctx.restore();
    });
  }

  function spin() {
    const live = liveSegments();
    if (!live.length) { phase = 'done'; render(); return; }
    const seg = live[Math.floor(Math.random() * live.length)];
    const left = unused(SEGMENTS[seg].key, level);
    // levels 1–2 are additive; from 3 up the wheel stops offering the gentle cards
    const hot = level >= 3 ? left.filter(t => t.level >= level - 1) : [];
    const pool = hot.length ? hot : left;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    task = { id: pick.id, icon: SEGMENTS[seg].icon, cat: SEGMENTS[seg].label, level: pick.level,
      text: fill(pick.text, names[turn], names[1 - turn], genders[turn], genders[1 - turn]) };

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
      used = [...used, task.id];             // performed — off the wheel
    }
    turn = 1 - turn; round += 1;
    // starts gentle and climbs fast: two rounds per level, unless the dial was set by hand
    if (!manual) level = Math.min(4, Math.ceil(round / 2));
    phase = liveSegments().length ? 'idle' : 'done';
    task = null; render();
  }

  const wheelBox = icon => `<div class="wheelbox"><div class="pointer"></div>
    <canvas id="wheel"></canvas><div class="cap">${icon}</div></div>`;

  const genderPicker = (i) => `<div class="genders">
    <button class="level" data-who="${i}" data-g="m" aria-pressed="${genders[i] === 'm'}">לשון זכר</button>
    <button class="level" data-who="${i}" data-g="f" aria-pressed="${genders[i] === 'f'}">לשון נקבה</button>
  </div>`;

  function render() {
    if (phase === 'setup') {
      app().innerHTML = `
        <div class="stage">${wheelBox('💞')}</div>
        <div class="panel">
          <p class="eyebrow">משחק לשניים · טלפון אחד</p>
          <h1>גלגל הזוגות</h1>
          <p class="muted" style="margin:10px 0 16px">מסובבים, הגלגל נוחת על משימה — ומבצעים. מעבירים את הטלפון בכל תור. משימה שבוצעה יורדת מהגלגל.</p>
          <input id="n0" maxlength="14" placeholder="השם שלך" value="${esc(names[0])}">
          ${genderPicker(0)}
          <div style="height:14px"></div>
          <input id="n1" maxlength="14" placeholder="השם של בן/בת הזוג" value="${esc(names[1])}">
          ${genderPicker(1)}
          <div class="actions" style="margin-top:14px"><button class="btn rose" id="btnGo">מתחילים</button></div>
        </div>`;
      drawWheel();
      app().querySelectorAll('.genders .level').forEach(b => b.onclick = () => {
        names = [document.getElementById('n0').value, document.getElementById('n1').value];
        genders[+b.dataset.who] = b.dataset.g;
        render();
      });
      document.getElementById('btnGo').onclick = () => {
        names = [document.getElementById('n0').value.trim() || 'שחקן',
                 document.getElementById('n1').value.trim() || 'שחקנית'];
        phase = 'idle'; render();
      };
      return;
    }

    const left = SEGMENTS.reduce((n, sg) => n + unused(sg.key, 4).length, 0);
    const callout = phase === 'spinning' ? 'הגלגל מסתובב…'
      : phase === 'task' ? `המשימה של <b>${esc(names[turn])}</b>`
      : phase === 'done' ? 'עברתם על הכל'
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
        </div></div>`
      : phase === 'done' ? `
        <div class="panel waiting">
          <p class="eyebrow">הגלגל נגמר</p>
          <p class="muted" style="margin:0">עברתם על כל המשימות. אפשר להתחיל מחדש — או להפסיק לשחק.</p>
          <button class="btn rose" id="btnAgain" style="margin-top:12px">מהתחלה</button>
        </div>` : `
        <div class="actions">
          <button class="btn rose" id="btnSpin" ${phase === 'spinning' ? 'disabled' : ''}>
            ${phase === 'spinning' ? 'מסתובב…' : 'סובבו את הגלגל'}</button>
        </div>`}

      <div class="panel">
        <p class="eyebrow">רמת החום · נשארו ${left} משימות</p>
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
    const restart = () => { score = [0, 0]; log = []; used = []; round = 1; turn = 0;
      level = 1; manual = false; phase = 'idle'; task = null; render(); };
    on('btnSpin', spin);
    on('btnDone', () => finish(true));
    on('btnSkip', () => finish(false));
    on('btnAgain', restart);
    on('btnReset', () => { restart(); phase = 'setup'; render(); });
    app().querySelectorAll('.levels .level').forEach(b =>
      b.onclick = () => { level = +b.dataset.level; manual = true; render(); });
  }

  render();
})();
