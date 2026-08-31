(() => {
  'use strict';
  const SPIN_MS = 4700;
  let names = ['', ''], genders = ['m', 'f'];
  let turn = 0, round = 1, phase = 'setup', rotation = 0, task = null;
  let score = [0, 0], log = [], used = [], board = [];

  const KEY = 'wheel.solo';
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(
    { names, genders, turn, round, phase: phase === 'spinning' ? 'task' : phase, rotation, task, score, log, used, board })); } catch {} };
  const restore = () => {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!d || !d.names || !d.names[0]) return false;
      ({ names, genders, turn, round, phase, rotation, task, score, log, used, board } = d);
      return true;
    } catch { return false; }
  };

  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const app = () => document.getElementById('app');

  // {זכר|נקבה} נוטה לפי מי שמבצע/ת, [זכר|נקבה] לפי בן/בת הזוג
  const fill = (text, you, them, gYou, gThem) =>
    text.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (m, a, b) => gYou === 'f' ? b : a)
        .replace(/\[([^\[\]|]*)\|([^\[\]|]*)\]/g, (m, a, b) => gThem === 'f' ? b : a)
        .replace(/\{you\}/g, you).replace(/\{them\}/g, them);

  const taskId = (key, i) => key + ':' + i;
  const segOf = key => SEGMENTS.find(sg => sg.key === key) || SEGMENTS[0];

  // every task not performed yet — one pool, no levels
  const poolOf = () => SEGMENTS.flatMap(sg =>
    TASKS[sg.key].map((t, i) => ({ ...t, key: sg.key, id: taskId(sg.key, i) }))
      .filter(t => !used.includes(t.id)));

  // deal a fresh wheel: up to one task per category
  function deal() {
    const from = poolOf();
    const out = [];
    for (const sg of SEGMENTS) {
      const mine = from.filter(t => t.key === sg.key);
      if (mine.length) out.push(mine[Math.floor(Math.random() * mine.length)]);
    }
    const rest = from.filter(t => !out.some(b => b.id === t.id));
    while (out.length < 8 && rest.length) out.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    return out.sort(() => Math.random() - 0.5);
  }

  function drawWheel() {
    const cv = document.getElementById('wheel');
    if (!cv) return;
    const slices = board.length ? board : SEGMENTS.map(sg => ({ key: sg.key }));
    const n = slices.length;
    const S = 640, R = S / 2, ctx = cv.getContext('2d');
    cv.width = S; cv.height = S;
    ctx.clearRect(0, 0, S, S);
    if (!n) return;
    const step = (Math.PI * 2) / n;
    slices.forEach((slice, i) => {
      const sg = segOf(slice.key);
      const a0 = -Math.PI / 2 + i * step;
      ctx.beginPath(); ctx.moveTo(R, R); ctx.arc(R, R, R - 4, a0, a0 + step); ctx.closePath();
      ctx.fillStyle = sg.hue; ctx.fill();
      ctx.strokeStyle = 'rgba(27,15,28,.55)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.save(); ctx.translate(R, R); ctx.rotate(a0 + step / 2);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
      ctx.font = '600 ' + (n > 6 ? 34 : 40) + 'px Assistant, system-ui, sans-serif';
      ctx.fillText(sg.label, R - 74, 0);
      ctx.font = (n > 6 ? 40 : 46) + 'px system-ui, sans-serif';
      ctx.fillText(sg.icon, R - 26, 2);
      ctx.restore();
    });
  }

  function spin() {
    if (!board.length) board = deal();
    if (!board.length) { phase = 'done'; render(); return; }

    const n = board.length;
    const seg = Math.floor(Math.random() * n);
    const pickd = board[seg];
    const sg = segOf(pickd.key);

    task = { id: pickd.id, icon: sg.icon, cat: sg.label,
      text: fill(pickd.text, names[turn], names[1 - turn], genders[turn], genders[1 - turn]) };

    const step = 360 / n;
    const target = ((-step * seg - step / 2) % 360 + 360) % 360;
    const now = ((rotation % 360) + 360) % 360;
    rotation += 4 * 360 + ((target - now) + 360) % 360;

    phase = 'spinning'; render(); save();
    Sound.spin(SPIN_MS, n);
    const cv = document.getElementById('wheel');
    if (cv) requestAnimationFrame(() => { cv.style.transform = `rotate(${rotation}deg)`; });
    setTimeout(() => { phase = 'task'; render(); save(); }, SPIN_MS);
  }

  function finish(done) {
    if (done) {
      score[turn] += 1;
      log = [{ name: names[turn], icon: task.icon, text: task.text }, ...log].slice(0, 4);
      used = [...used, task.id];                 // performed — gone for good
    }
    board = board.filter(b => b.id !== task.id); // either way the slice leaves the wheel
    turn = 1 - turn; round += 1;
    if (!board.length) board = deal();
    phase = board.length ? 'idle' : 'done';
    task = null; render(); save();
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
        board = deal(); phase = 'idle'; render(); save();
      };
      return;
    }

    const left = 64 - used.length;
    const callout = phase === 'spinning' ? 'הגלגל מסתובב…'
      : phase === 'task' ? `המשימה של <b>${esc(names[turn])}</b>`
      : phase === 'done' ? 'עברתם על הכל'
      : `התור של <b>${esc(names[turn])}</b> — העבירו את הטלפון`;

    app().innerHTML = `
      <div class="topbar">
        <button class="room" id="btnReset">משחק חדש</button>
        <button class="room" id="btnSound" title="קול">${Sound.on ? '🔊' : '🔇'}</button>
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
          <p class="cat">${esc(task.cat)}</p>
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

      <div class="panel heat">
        <p class="eyebrow" style="margin:0">${HEAT}</p>
        <p class="muted" style="margin:6px 0 0">${board.length} על הגלגל · ${left} משימות נשארו</p>
      </div>

      ${log.length ? `<div class="log">${log.map(l =>
        `<div><span>${l.icon}</span><b>${esc(l.name)}</b><span>${esc(l.text)}</span></div>`).join('')}</div>` : ''}
      <p class="version">גרסה ${APP_VERSION}</p>`;

    drawWheel();
    const cv = document.getElementById('wheel');
    if (cv && phase !== 'spinning') {
      cv.style.transition = 'none';
      cv.style.transform = `rotate(${rotation}deg)`;
      void cv.offsetWidth;
      cv.style.transition = '';
    }
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    const restart = () => { score = [0, 0]; log = []; used = []; board = deal();
      round = 1; turn = 0; phase = 'idle'; task = null; render(); save(); };
    on('btnSpin', spin);
    on('btnDone', () => finish(true));
    on('btnSkip', () => finish(false));
    on('btnAgain', restart);
    on('btnSound', () => { Sound.toggle(); render(); });
    on('btnReset', () => { restart(); phase = 'setup'; render(); });
  }

  restore();
  render();
})();
