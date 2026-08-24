'use strict';
/*
 * Static multiplayer roulette — no server of our own.
 * Realtime sync rides on a public MQTT broker over WSS; the player who opens
 * the room is the authority for that room (rolls the wheel, pays out) and
 * publishes the whole game state as a retained message, so anyone who joins
 * later receives the current table immediately.
 */
(() => {
  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ];
  const TOPIC = (code, leaf) => `roulette/v1/${code}/${leaf}`;

  const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const colorOf = n => n === 0 ? 'green' : RED.has(n) ? 'red' : 'black';
  const STAKES = [5, 25, 100, 500];
  const START = 1000, BET_MS = 20000, SPIN_MS = 5000, RESULT_MS = 6000;

  const OUTSIDE = [
    ['red','אדום · 1:1'], ['black','שחור · 1:1'], ['even','זוגי · 1:1'],
    ['odd','אי-זוגי · 1:1'], ['low','1–18 · 1:1'], ['high','19–36 · 1:1'],
    ['dozen1','1–12 · 2:1'], ['dozen2','13–24 · 2:1'], ['dozen3','25–36 · 2:1'],
  ];

  const payout = (bet, n) => {
    const c = colorOf(n);
    switch (bet.kind) {
      case 'number': return bet.value === n ? 36 : 0;
      case 'red': return c === 'red' ? 2 : 0;
      case 'black': return c === 'black' ? 2 : 0;
      case 'even': return n !== 0 && n % 2 === 0 ? 2 : 0;
      case 'odd': return n % 2 === 1 ? 2 : 0;
      case 'low': return n >= 1 && n <= 18 ? 2 : 0;
      case 'high': return n >= 19 && n <= 36 ? 2 : 0;
      case 'dozen1': return n >= 1 && n <= 12 ? 3 : 0;
      case 'dozen2': return n >= 13 && n <= 24 ? 3 : 0;
      case 'dozen3': return n >= 25 && n <= 36 ? 3 : 0;
      default: return 0;
    }
  };

  // ---------- identity ----------
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  let meId = store.get('roulette.id');
  if (!meId) { meId = 'p' + Math.random().toString(36).slice(2, 10); store.set('roulette.id', meId); }
  let myName = store.get('roulette.name') || '';

  // ---------- app state ----------
  let screen = 'lobby';          // lobby | table
  let code = null, isHost = false;
  let client = null, brokerIdx = 0, conn = 'off';   // off | connecting | on | lost
  let state = null;              // authoritative table state (host owns it)
  let gotStateAt = 0, msLeftAt = 0;
  let stake = 25, staged = [], err = '', hostTimer = null, beat = null, ui = null;

  const me = () => state && state.players.find(p => p.id === meId);
  const stagedTotal = () => staged.reduce((s, b) => s + b.amount, 0);
  const purse = () => { const m = me(); return m ? m.chips - stagedTotal() : 0; };

  // ---------- transport ----------
  function connect(onReady) {
    conn = 'connecting'; render();
    const url = BROKERS[brokerIdx % BROKERS.length];
    client = mqtt.connect(url, {
      clientId: 'rlt_' + meId + '_' + Math.random().toString(16).slice(2, 6),
      connectTimeout: 7000, reconnectPeriod: 0, keepalive: 30, clean: true,
    });
    client.on('connect', () => {
      conn = 'on';
      client.subscribe([TOPIC(code, 'state'), TOPIC(code, 'act')], { qos: 0 }, () => onReady && onReady());
      render();
    });
    client.on('message', (topic, buf) => {
      let msg; try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (topic.endsWith('/state')) onState(msg);
      else if (topic.endsWith('/act') && isHost) onAction(msg);
    });
    const drop = () => {
      if (conn === 'lost') return;
      conn = 'lost'; render();
      try { client.end(true); } catch {}
      brokerIdx += 1;
      setTimeout(() => connect(onReady), 1200);   // fall through to the next public broker
    };
    client.on('error', drop);
    client.on('close', drop);
  }

  const sendState = () => {
    if (!isHost || !client || conn !== 'on') return;
    const msLeft = state.deadline ? Math.max(0, state.deadline - Date.now()) : 0;
    client.publish(TOPIC(code, 'state'), JSON.stringify({ ...state, msLeft }), { qos: 0, retain: true });
  };

  const act = (a) => {
    if (isHost) { onAction({ ...a, from: meId }); return; }
    if (client && conn === 'on') client.publish(TOPIC(code, 'act'), JSON.stringify({ ...a, from: meId }));
  };

  function onState(s) {
    if (isHost) return;                 // the host is the source of truth, never a follower
    state = s; gotStateAt = Date.now(); msLeftAt = Date.now();
    if (screen !== 'table') screen = 'table';
    render();
  }

  // ---------- host: the rules live here ----------
  function onAction(a) {
    const p = state.players.find(x => x.id === a.from);
    if (a.t === 'join') {
      if (!p) {
        if (state.players.length >= 8) return;
        state.players.push({ id: a.from, name: String(a.name || 'שחקן').slice(0, 14), chips: START, bets: [], last: null });
      } else p.name = String(a.name || p.name).slice(0, 14);
    } else if (a.t === 'bets' && p) {
      if (state.phase !== 'betting' || p.bets.length) return;
      const bets = (Array.isArray(a.bets) ? a.bets : []).filter(b =>
        Number.isFinite(b.amount) && b.amount > 0 &&
        (b.kind !== 'number' || (Number.isInteger(b.value) && b.value >= 0 && b.value <= 36))).slice(0, 20);
      const total = bets.reduce((s, b) => s + b.amount, 0);
      if (!bets.length || total > p.chips) return;
      p.chips -= total; p.bets = bets;
    } else if (a.t === 'start') {
      if (state.phase === 'waiting') startRound();
      return;
    } else if (a.t === 'spin') {
      if (state.phase === 'betting' && state.players.some(x => x.bets.length)) { spin(); return; }
      return;
    } else if (a.t === 'leave' && p) {
      state.players = state.players.filter(x => x.id !== a.from);
    } else return;
    sendState(); render();
  }

  const at = (phase, ms, next) => {
    state.phase = phase;
    state.deadline = ms ? Date.now() + ms : 0;
    clearTimeout(hostTimer);
    hostTimer = ms ? setTimeout(next, ms) : null;
    sendState(); render();
  };

  function startRound() {
    state.round += 1; state.result = null;
    for (const p of state.players) { if (p.chips <= 0) p.chips = 100; p.bets = []; p.last = null; }
    staged = [];
    at('betting', BET_MS, () => state.players.some(p => p.bets.length) ? spin() : at('waiting', 0, null));
  }

  function spin() {
    const n = Math.floor(Math.random() * 37);
    state.result = { number: n, color: colorOf(n) };
    at('spinning', SPIN_MS, () => settle());
  }

  function settle() {
    const n = state.result.number;
    for (const p of state.players) {
      if (!p.bets.length) { p.last = null; continue; }
      const back = p.bets.reduce((t, b) => t + b.amount * payout(b, n), 0);
      const risked = p.bets.reduce((t, b) => t + b.amount, 0);
      p.chips += back; p.last = back - risked;
    }
    state.history = [state.result, ...state.history].slice(0, 14);
    at('result', RESULT_MS, () => startRound());
  }

  // ---------- lobby ----------
  const newCode = () => Array.from({ length: 4 },
    () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

  function host(name) {
    myName = name || 'שחקן'; store.set('roulette.name', myName);
    code = newCode(); isHost = true; screen = 'table';
    state = { code, round: 0, phase: 'waiting', deadline: 0, result: null, history: [],
      players: [{ id: meId, name: myName, chips: START, bets: [], last: null }] };
    connect(() => sendState());
    clearInterval(beat);
    beat = setInterval(sendState, 3000);   // heartbeat: proves the table is still open
    render();
  }

  function join(name, c) {
    myName = name || 'שחקן'; store.set('roulette.name', myName);
    code = c; isHost = false; screen = 'table'; state = null;
    connect(() => act({ t: 'join', name: myName }));
    render();
  }

  // ---------- view ----------
  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const swatch = c => c === 'red' ? 'background:#9d1f2f' : c === 'black' ? 'background:#171a19' : 'background:#126b4b';
  const app = () => document.getElementById('app');

  function place(kind, value) {
    if (!state || state.phase !== 'betting' || me()?.bets.length) return;
    if (purse() < stake) { err = 'אין מספיק ז\'טונים'; render(); return; }
    const hit = staged.find(b => b.kind === kind && b.value === value);
    if (hit) hit.amount += stake; else staged.push({ kind, value, amount: stake });
    err = ''; render();
  }

  function render() {
    if (screen === 'lobby') return renderLobby();
    renderTable();
  }

  function renderLobby() {
    app().innerHTML = `
      <div class="stage"><div class="wheel"><div class="hub"><b>🎲</b></div></div></div>
      <div class="panel">
        <p class="eyebrow">שולחן פרטי</p>
        <h1>רולטה עם חברים</h1>
        <p class="muted" style="margin:8px 0 14px">פתחו שולחן בטלפון אחד, שלחו את הקוד לטלפון השני, ושחקו יחד.</p>
        <input id="name" maxlength="14" placeholder="השם שלך" autocomplete="nickname" value="${esc(myName)}">
        <div class="actions" style="margin-top:10px">
          <button class="btn gold" id="btnHost">פתיחת שולחן חדש</button>
        </div>
        <p class="or">או</p>
        <input id="code" maxlength="4" placeholder="קוד" autocapitalize="characters" inputmode="text">
        <div class="actions" style="margin-top:10px">
          <button class="btn" id="btnJoin">הצטרפות לשולחן</button>
        </div>
        <p class="note" id="note">${esc(err)}</p>
      </div>`;
    const nameOf = () => document.getElementById('name').value.trim();
    document.getElementById('btnHost').onclick = () => host(nameOf());
    document.getElementById('btnJoin').onclick = () => {
      const c = document.getElementById('code').value.trim().toUpperCase();
      if (c.length !== 4) { err = 'קוד שולחן הוא 4 תווים'; render(); return; }
      join(nameOf(), c);
    };
  }

  const CONN = { off: ['', 'מנותק'], connecting: ['', 'מתחבר…'], on: ['on', 'מחובר'], lost: ['bad', 'מחפש חיבור…'] };

  function renderTable() {
    const [dotClass, connText] = CONN[conn];
    const link = `${location.origin}${location.pathname}?code=${code}`;

    if (!state) {
      app().innerHTML = `
        <div class="stage"><div class="wheel turning"><div class="hub"><b>·</b></div></div>
          <p class="callout">מצטרפים לשולחן <b>${code}</b>…</p>
          <p class="link"><i class="dot ${dotClass}"></i>${connText}</p></div>
        <p class="note">אם זה נתקע — ודאו שהמארח פתוח באותו רגע.</p>`;
      return;
    }

    const m = me();
    const stale = !isHost && Date.now() - gotStateAt > 14000;
    const sent = !!m?.bets.length;
    const locked = state.phase !== 'betting' || sent;
    const shown = sent ? m.bets : staged;
    const byNum = new Map(), byKind = new Map();
    for (const b of shown) b.kind === 'number' ? byNum.set(b.value, b.amount) : byKind.set(b.kind, b.amount);

    const callout = state.phase === 'result' && state.result
      ? `יצא <b>${state.result.number}</b> · ${{red:'אדום',black:'שחור',green:'ירוק'}[state.result.color]}`
      : state.phase === 'spinning' ? 'הגלגל מסתובב…'
      : state.phase === 'waiting' ? (isHost ? 'פתחו סיבוב כשכולם בפנים' : 'ממתינים למארח')
      : sent ? 'ההימור נשלח — ממתינים לסיבוב' : 'הניחו ז\'טונים על השולחן';

    app().innerHTML = `
      <div class="topbar">
        <button class="room" id="btnShare">שולחן <b>${code}</b> · שיתוף</button>
        <div class="purse"><small>הקופה שלך</small>${m ? purse() : '–'}</div>
      </div>

      <div class="stage">
        <div class="wheel ${state.phase === 'spinning' ? 'turning' : ''}">
          <div class="hub"><b>${state.result && state.phase !== 'betting' ? state.result.number : '·'}</b></div>
        </div>
        <p class="callout">${callout}</p>
        <p class="timer" id="timer"></p>
        <div class="history">${state.history.map(h =>
          `<div class="hist" style="${swatch(h.color)}">${h.number}</div>`).join('')}</div>
      </div>

      <div class="players">${state.players.map(p => {
        const res = p.last === null || p.last === undefined ? ''
          : `<span class="${p.last >= 0 ? 'win' : 'lose'} num">${p.last >= 0 ? '+' : ''}${p.last}</span> · `;
        const risked = p.bets.reduce((t, b) => t + b.amount, 0);
        return `<div class="player${p.id === meId ? ' me' : ''}">
          <div class="who"><span>${esc(p.name)}${p.id === state.players[0]?.id ? ' 👑' : ''}</span>
            ${p.bets.length ? `<i class="tag in">הימר ${risked}</i>` : `<i class="tag">ממתין</i>`}</div>
          <div>${res}<span class="num">🪙 ${p.chips}</span></div></div>`;
      }).join('')}</div>

      <div class="panel">
        <p class="label">ערך הז'טון</p>
        <div class="chips">${STAKES.map(s =>
          `<button class="chip" data-stake="${s}" aria-pressed="${s === stake}">${s}</button>`).join('')}</div>
      </div>

      <div class="${locked ? 'locked' : ''}">
        <div class="board">
          <button class="cell zero" data-n="0">0${byNum.has(0) ? `<i class="stake">${byNum.get(0)}</i>` : ''}</button>
          ${Array.from({ length: 36 }, (_, i) => i + 1).map(n =>
            `<button class="cell ${colorOf(n)}" data-n="${n}">${n}${
              byNum.has(n) ? `<i class="stake">${byNum.get(n)}</i>` : ''}</button>`).join('')}
        </div>
        <div class="outside" style="margin-top:5px">
          ${OUTSIDE.map(([k, l]) =>
            `<button class="out" data-kind="${k}">${l}${
              byKind.has(k) ? `<i class="stake">${byKind.get(k)}</i>` : ''}</button>`).join('')}
        </div>
      </div>

      <div class="actions">
        ${state.phase === 'betting' && !sent ? `
          <button class="btn gold" id="btnSend" ${staged.length ? '' : 'disabled'}>
            שליחת הימור${staged.length ? ` · ${stagedTotal()}` : ''}</button>
          <button class="btn" id="btnClear" ${staged.length ? '' : 'disabled'}>ניקוי השולחן</button>` : ''}
        ${isHost && state.phase === 'waiting' ? `<button class="btn gold" id="btnStart">פתיחת סיבוב</button>` : ''}
        ${isHost && state.phase === 'betting' ? `<button class="btn" id="btnSpin">סובבו עכשיו</button>` : ''}
      </div>

      <p class="link"><i class="dot ${dotClass}"></i>${connText}${
        stale ? ' · המארח לא משדר, ייתכן שסגר את העמוד' : ''}</p>
      <p class="note" id="note">${esc(err)}</p>`;

    app().querySelectorAll('.chip').forEach(b => b.onclick = () => { stake = +b.dataset.stake; render(); });
    if (!locked) {
      app().querySelectorAll('.cell').forEach(b => b.onclick = () => place('number', +b.dataset.n));
      app().querySelectorAll('.out').forEach(b => b.onclick = () => place(b.dataset.kind, null));
    }
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('btnSend', () => { act({ t: 'bets', bets: staged }); staged = []; render(); });
    on('btnClear', () => { staged = []; render(); });
    on('btnStart', () => act({ t: 'start' }));
    on('btnSpin', () => act({ t: 'spin' }));
    on('btnShare', async () => {
      const text = `הצטרפו לשולחן הרולטה שלי — קוד ${code}`;
      if (navigator.share) { try { await navigator.share({ title: 'רולטה', text, url: link }); return; } catch {} }
      try { await navigator.clipboard.writeText(link); err = 'הקישור הועתק'; }
      catch { err = link; }
      render();
    });
  }

  // countdown, painted outside the render pass so it never fights a re-render
  setInterval(() => {
    const el = document.getElementById('timer');
    if (!el || !state) return;
    const base = isHost ? (state.deadline ? state.deadline - Date.now() : 0)
                        : (state.msLeft || 0) - (Date.now() - msLeftAt);
    const left = Math.max(0, Math.ceil(base / 1000));
    el.textContent = state.phase === 'betting' ? `נסגר בעוד ${left}`
      : state.phase === 'result' ? `סיבוב חדש בעוד ${left}` : '';
  }, 250);

  // reconnect when the phone comes back from sleep or another app
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && code && conn !== 'on') { try { client.end(true); } catch {} connect(() =>
      isHost ? sendState() : act({ t: 'join', name: myName })); }
  });
  window.addEventListener('beforeunload', () => { if (code && !isHost) act({ t: 'leave' }); });

  const qs = new URLSearchParams(location.search).get('code');
  if (qs && /^[A-Z0-9]{4}$/i.test(qs)) {
    screen = 'lobby'; render();
    document.getElementById('code').value = qs.toUpperCase();
  } else render();
})();
