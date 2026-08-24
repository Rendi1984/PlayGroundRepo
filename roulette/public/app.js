'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');
  const STAKES = [5, 25, 100, 500];

  let session = null;      // {code, playerId}
  let stake = 25;
  let es = null;
  let state = null;
  let tick = null;

  // ---------- persistence (survives phone lock / tab reload) ----------
  const save = () => { try { localStorage.setItem('roulette', JSON.stringify(session)); } catch {} };
  const load = () => { try { return JSON.parse(localStorage.getItem('roulette') || 'null'); } catch { return null; } };

  async function api(path, body) {
    const res = await fetch('/api/' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'network_error');
    return data;
  }

  // ---------- lobby ----------
  $('btnCreate').addEventListener('click', async () => {
    try {
      session = await api('create', { name: $('name').value });
      save(); enterGame();
    } catch (e) { showErr(e.message); }
  });

  $('btnJoin').addEventListener('click', async () => {
    const code = $('code').value.trim().toUpperCase();
    if (code.length !== 4) return showErr('קוד חדר צריך להיות 4 תווים');
    try {
      session = await api('join', { name: $('name').value, code });
      save(); enterGame();
    } catch (e) { showErr(e.message === 'room_not_found' ? 'חדר לא נמצא' : e.message === 'room_full' ? 'החדר מלא' : e.message); }
  });

  function showErr(m) { const el = $('lobbyErr'); el.textContent = m; el.hidden = false; }

  // ---------- board ----------
  function buildBoard() {
    const board = $('board');
    board.innerHTML = '';
    const zero = document.createElement('button');
    zero.className = 'cell green'; zero.innerHTML = '0<span class="amt" hidden></span>';
    zero.addEventListener('click', () => bet('number', 0));
    board.appendChild(zero);
    for (let n = 1; n <= 36; n++) {
      const b = document.createElement('button');
      b.className = 'cell ' + colorOf(n);
      b.dataset.n = String(n);
      b.innerHTML = `${n}<span class="amt" hidden></span>`;
      b.addEventListener('click', () => bet('number', n));
      board.appendChild(b);
    }
    const outs = [['red','אדום 1:1'],['black','שחור 1:1'],['even','זוגי 1:1'],
      ['odd','אי-זוגי 1:1'],['low','1-18'],['high','19-36'],
      ['dozen1','1-12 · 2:1'],['dozen2','13-24 · 2:1'],['dozen3','25-36 · 2:1']];
    const box = $('outside'); box.innerHTML = '';
    for (const [kind, label] of outs) {
      const b = document.createElement('button');
      b.className = 'out'; b.dataset.kind = kind;
      b.innerHTML = `${label}<span class="amt" hidden></span>`;
      b.addEventListener('click', () => bet(kind, null));
      box.appendChild(b);
    }
    const row = $('stakes'); row.innerHTML = '';
    for (const s of STAKES) {
      const b = document.createElement('button');
      b.className = 'stake' + (s === stake ? ' sel' : '');
      b.textContent = s;
      b.addEventListener('click', () => {
        stake = s;
        [...row.children].forEach((c) => c.classList.toggle('sel', c === b));
      });
      row.appendChild(b);
    }
  }

  async function bet(kind, value) {
    if (!state || state.phase !== 'betting') return msg('ההימורים סגורים כרגע');
    const me = myPlayer();
    if (!me || me.chips < stake) return msg('אין מספיק ז\'טונים');
    try { await api('bet', { ...session, kind, value, amount: stake }); msg(''); }
    catch (e) { msg(e.message === 'betting_closed' ? 'ההימורים נסגרו' : 'ההימור נדחה'); }
  }

  $('btnClear').addEventListener('click', () => api('clear', session).catch(() => {}));
  $('btnStart').addEventListener('click', () => api('start', session).catch(() => {}));
  $('btnSpin').addEventListener('click', () => api('spin', session).catch(() => {}));

  $('btnShare').addEventListener('click', async () => {
    const url = `${location.origin}/?code=${session.code}`;
    const text = `הצטרפו למשחק הרולטה שלי — קוד חדר ${session.code}`;
    if (navigator.share) { try { await navigator.share({ title: 'רולטה', text, url }); return; } catch {} }
    try { await navigator.clipboard.writeText(url); msg('הקישור הועתק'); }
    catch { msg(url); }
  });

  // ---------- realtime ----------
  function enterGame() {
    $('lobby').hidden = true;
    $('game').hidden = false;
    $('roomCode').textContent = session.code;
    buildBoard();
    connect();
  }

  function connect() {
    if (es) es.close();
    es = new EventSource(`/api/events?code=${encodeURIComponent(session.code)}&playerId=${encodeURIComponent(session.playerId)}`);
    es.onmessage = (ev) => { try { render(JSON.parse(ev.data)); } catch {} };
    es.onerror = () => { msg('מתחבר מחדש…'); };  // EventSource reconnects on its own
  }

  // iOS/Android suspend the stream when the tab is backgrounded — reconnect on return.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && session && (!es || es.readyState === 2)) connect();
  });

  const myPlayer = () => state && state.players.find((p) => p.id === session.playerId);

  const PHASES = { waiting: 'ממתינים לתחילת סיבוב…', betting: 'מקמו את ההימורים',
    spinning: 'הגלגל מסתובב…', result: 'תוצאה' };

  function render(s) {
    state = s;
    const me = myPlayer();
    if (!me) { // removed from room
      localStorage.removeItem('roulette');
      location.reload();
      return;
    }

    $('chips').textContent = me.chips;
    $('phase').textContent = PHASES[s.phase] || s.phase;

    const wheel = $('wheel');
    wheel.classList.toggle('spin', s.phase === 'spinning');
    $('resultNum').textContent = s.phase === 'result' && s.result ? s.result.number : '–';
    $('resultNum').style.color = s.phase === 'result' && s.result
      ? (s.result.color === 'black' ? '#e8edf7' : s.result.color === 'red' ? '#ff6b7d' : '#39d98a')
      : '';

    // timer
    if (tick) clearInterval(tick);
    if (s.msLeft > 0 && (s.phase === 'betting' || s.phase === 'result')) {
      const ends = Date.now() + s.msLeft;
      const paint = () => {
        const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000));
        $('timer').textContent = s.phase === 'betting' ? `נותרו ${left} שניות` : `סיבוב הבא בעוד ${left}`;
        if (left <= 0) clearInterval(tick);
      };
      paint(); tick = setInterval(paint, 250);
    } else $('timer').textContent = '';

    // history
    $('history').innerHTML = s.history.map((h) =>
      `<div class="hist" style="background:${h.color === 'red' ? '#d7263d' : h.color === 'black' ? '#20262f' : '#12915c'}">${h.number}</div>`).join('');

    // players
    $('players').innerHTML = s.players.map((p) => {
      const res = p.lastWin === null || p.lastWin === undefined ? ''
        : `<span class="${p.lastWin >= 0 ? 'win' : 'lose'}">${p.lastWin >= 0 ? '+' : ''}${p.lastWin}</span>`;
      return `<div class="player${p.id === me.id ? ' me' : ''}">
        <div class="who"><i class="dot${p.connected ? ' on' : ''}"></i><span>${esc(p.name)}${p.isHost ? ' 👑' : ''}</span></div>
        <div>${res} · הימור ${p.betTotal} · 🪙 ${p.chips}</div></div>`;
    }).join('');

    // my bets on the board
    const byNumber = new Map(), byKind = new Map();
    for (const b of me.bets) {
      if (b.kind === 'number') byNumber.set(b.value, b.amount);
      else byKind.set(b.kind, b.amount);
    }
    document.querySelectorAll('#board .cell').forEach((c) => {
      const n = c.classList.contains('green') ? 0 : Number(c.dataset.n);
      const amt = byNumber.get(n);
      const tag = c.querySelector('.amt');
      tag.textContent = amt || ''; tag.hidden = !amt;
    });
    document.querySelectorAll('#outside .out').forEach((c) => {
      const amt = byKind.get(c.dataset.kind);
      const tag = c.querySelector('.amt');
      tag.textContent = amt || ''; tag.hidden = !amt;
    });

    const locked = s.phase !== 'betting';
    $('board').classList.toggle('locked', locked);
    $('outside').classList.toggle('locked', locked);
    $('btnClear').disabled = locked || me.bets.length === 0;
    $('btnStart').hidden = !(me.isHost && (s.phase === 'waiting' || s.phase === 'result'));
    $('btnSpin').hidden = !(me.isHost && s.phase === 'betting');
    if (!me.isHost && s.phase === 'waiting') msg('ממתינים למארח שיתחיל את הסיבוב');
  }

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const msg = (t) => { $('gameMsg').textContent = t; };

  // ---------- boot ----------
  const params = new URLSearchParams(location.search);
  if (params.get('code')) $('code').value = params.get('code').toUpperCase();
  const saved = load();
  if (saved && saved.code && saved.playerId) {
    // Verify the session still exists on the server before restoring it.
    const probe = new EventSource(`/api/events?code=${saved.code}&playerId=${saved.playerId}`);
    probe.onmessage = () => { probe.close(); session = saved; enterGame(); };
    probe.onerror = () => { probe.close(); localStorage.removeItem('roulette'); };
  }
})();
