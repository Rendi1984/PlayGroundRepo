'use strict';
/*
 * גלגל הזוגות — a spin-the-wheel dare game for two phones.
 * No server of our own: the phone that opens the table is the authority for
 * that table (spins the wheel, draws the task, keeps score) and publishes the
 * whole game state as a retained MQTT message over WSS, so the partner's phone
 * — and anyone who reopens the link later — lands on the current state.
 */
(() => {
  const BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ];
  const TOPIC = (code, leaf) => `couplewheel/v1/${code}/${leaf}`;
  const SPIN_MS = 4700;   // must match the canvas transition in styles.css

  // ---------- identity ----------
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  let meId = store.get('wheel.id');
  if (!meId) { meId = 'p' + Math.random().toString(36).slice(2, 10); store.set('wheel.id', meId); }
  let myName = store.get('wheel.name') || '';
  let myGender = store.get('wheel.g') === 'f' ? 'f' : 'm';
  let formName = myName, formCode = '';
  let secret = false, taps = 0, tapAt = 0, customDraft = '', pickId = '', deferred = false;
  let gateCode = '', gateErr = '';
  let pickGame = 'wheel';           // what a new table will play

  const GAMES = [
    { id: 'wheel', icon: '🎡', name: 'גלגל הזוגות', note: 'מסובבים, נוחתים על משימה, מבצעים' },
    { id: 'bj',    icon: '🃏', name: '21', note: 'מי שעובר 21 מוריד פריט. מי שנשאר בלי כלום הפסיד' },
  ];

  // ---------- app state ----------
  let screen = 'lobby', code = null, isHost = false;
  let client = null, brokerIdx = 0, conn = 'off';
  let state = null, gotStateAt = 0, err = '', beat = null, spinTimer = null;

  const me = () => state && state.players.find(p => p.id === meId);
  const partner = () => state && state.players.find(p => p.id !== meId);
  const turnPlayer = () => state && state.players.find(p => p.id === state.turn);
  const myTurn = () => state && state.turn === meId;

  // ---------- transport ----------
  function connect(onReady) {
    conn = 'connecting'; render();
    client = mqtt.connect(BROKERS[brokerIdx % BROKERS.length], {
      clientId: 'cw_' + meId + '_' + Math.random().toString(16).slice(2, 6),
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
      setTimeout(() => connect(onReady), 1200);   // try the next public broker
    };
    client.on('error', drop);
    client.on('close', drop);
  }

  const ONLINE_MS = 14000;

  const sendState = () => {
    if (!isHost || !client || conn !== 'on') return;
    const now = Date.now();
    for (const p of state.players) p.online = p.id === meId || now - (p.seen || 0) < ONLINE_MS;
    client.publish(TOPIC(code, 'state'), JSON.stringify(state), { qos: 0, retain: true });
  };

  const act = a => {
    if (isHost) return onAction({ ...a, from: meId });
    if (client && conn === 'on') client.publish(TOPIC(code, 'act'), JSON.stringify({ ...a, from: meId }));
  };

  function onState(s) {
    if (isHost) {
      // coming back after a refresh: take back the table we published before
      if (!state && s && s.code === code) {
        state = s;
        screen = 'table';
        const mine = state.players.find(p => p.id === meId);
        if (mine) { mine.online = true; mine.seen = Date.now(); }
        if (state.phase === 'spinning') state.phase = 'task';   // the timer died with the old page
        sendState(); render();
      }
      return;
    }
    const wasSpinning = state && state.phase === 'spinning';
    state = s; gotStateAt = Date.now(); screen = 'table';
    render();
    if (!wasSpinning && s.phase === 'spinning') spinWheel();
  }

  // ---------- the rules (host only) ----------
  // {זכר|נקבה} נוטה לפי מי שמבצע/ת, [זכר|נקבה] לפי בן/בת הזוג
  const fill = (text, you, them, gYou, gThem) =>
    text.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (m, a, b) => gYou === 'f' ? b : a)
        .replace(/\[([^\[\]|]*)\|([^\[\]|]*)\]/g, (m, a, b) => gThem === 'f' ? b : a)
        .replace(/\{you\}/g, you).replace(/\{them\}/g, them);

  const taskId = (key, i) => key + ':' + i;

  // the whole book: the built-in tasks plus anything added from the secret menu
  const allTasks = custom => SEGMENTS.flatMap(sg =>
    TASKS[sg.key].map((t, i) => ({ ...t, key: sg.key, id: taskId(sg.key, i) })))
    .concat((custom || []).map(c => ({ ...c, key: c.key || 'choice' })));

  const poolOf = (used, custom) => allTasks(custom).filter(t => !used.includes(t.id));

  // deal a fresh wheel: up to one task per category
  function deal(used, custom) {
    const from = poolOf(used, custom);
    // tasks the couple wrote themselves go on first — they added them to play them
    const board = from.filter(t => String(t.id).startsWith('custom:')).slice(0, 3);
    for (const sg of SEGMENTS) {
      if (board.length >= 8) break;
      const mine = from.filter(t => t.key === sg.key && !board.some(b => b.id === t.id));
      if (mine.length) board.push(mine[Math.floor(Math.random() * mine.length)]);
    }
    // if categories ran dry, top the wheel back up from whatever is left
    const rest = from.filter(t => !board.some(b => b.id === t.id));
    while (board.length < 8 && rest.length) board.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
    return board.sort(() => Math.random() - 0.5);
  }

  const segOf = key => SEGMENTS.find(sg => sg.key === key) || SEGMENTS[0];

  function onAction(a) {
    const p = state.players.find(x => x.id === a.from);
    if (p) p.seen = Date.now();                       // any message is a sign of life

    if (a.t === 'ping') return;                       // presence only, nothing to apply

    if (a.t === 'join') {
      if (!p) {
        if (state.players.length >= 2) return;        // a table for two
        state.players.push({ id: a.from, name: String(a.name || 'שחקן').slice(0, 14),
          g: a.g === 'f' ? 'f' : 'm', score: 0, seen: Date.now(), online: true });
        if (state.game === 'bj' && state.players.length === 2) {
          state.bj = BJ.fresh(state.players.map(q => q.id));
          BJ.newHand(state.bj, state.players.map(q => q.id));
        }
      } else { p.name = String(a.name || p.name).slice(0, 14); if (a.g) p.g = a.g === 'f' ? 'f' : 'm'; }
    } else if (a.t === 'level') {
      return;                                          // the dial is gone: one heat, no choice
    } else if (a.t === 'bj') {
      const ids = state.players.map(q => q.id);
      if (ids.length < 2) return;
      if (!state.bj) state.bj = BJ.fresh(ids);
      if (a.do === 'deal') BJ.newHand(state.bj, ids);
      else if (a.do === 'hit') BJ.hit(state.bj, a.from, ids);
      else if (a.do === 'stand') BJ.stand(state.bj, a.from, ids);
      else if (a.do === 'again') { state.bj = BJ.fresh(ids); BJ.newHand(state.bj, ids); }
      else return;
    } else if (a.t === 'switch') {
      state.game = a.game === 'bj' ? 'bj' : 'wheel';
      if (state.game === 'bj') {
        const ids = state.players.map(q => q.id);
        state.bj = BJ.fresh(ids);
        if (ids.length >= 2) BJ.newHand(state.bj, ids);
      } else if (!state.board || !state.board.length) {
        state.board = deal(state.used || [], state.custom || []);
        state.phase = 'idle';
      }
    } else if (a.t === 'refill') {
      state.used = []; state.board = deal([], state.custom || []); state.phase = 'idle'; state.task = null;
    } else if (a.t === 'pass') {
      const nxt = state.players.find(q => q.id !== state.turn);
      if (nxt) state.turn = nxt.id;
      state.phase = 'idle'; state.task = null;
    } else if (a.t === 'force') {
      const t = allTasks(state.custom || []).find(x => x.id === a.id);
      if (!t) return;
      const you = turnPlayer(), them = state.players.find(q => q.id !== (you || {}).id);
      state.task = { id: t.id, icon: segOf(t.key).icon, cat: segOf(t.key).label,
        text: fill(t.text, you ? you.name : 'את/ה', them ? them.name : 'בן/בת הזוג',
          you ? you.g : 'm', them ? them.g : 'f') };
      state.phase = 'task';
    } else if (a.t === 'custom') {
      const text = String(a.text || '').trim().slice(0, 160);
      if (!text) return;
      const id = 'custom:' + ((state.custom || []).length + 1) + ':' + Date.now().toString(36);
      state.custom = [...(state.custom || []), { id, key: 'choice', level: 4, text }];
      // a task they just wrote should be on the wheel right away, even if it is full
      if (state.phase === 'idle') state.board = [...state.board, state.custom[state.custom.length - 1]];
    } else if (a.t === 'again') {
      state.used = []; state.round = 1;
      state.phase = 'idle'; state.task = null; state.log = []; state.board = deal([], []);
      for (const q of state.players) q.score = 0;
    } else if (a.t === 'spin') {
      if (state.phase !== 'idle' || a.from !== state.turn) return;
      return doSpin();
    } else if (a.t === 'done' || a.t === 'skip') {
      if (state.phase !== 'task') return;
      return finish(a.t === 'done');
    } else return;

    sendState(); render();
  }

  function doSpin() {
    if (!state.board || !state.board.length) state.board = deal(state.used || [], state.custom || []);
    if (!state.board.length) { state.phase = 'done'; sendState(); render(); return; }

    const n = state.board.length;
    const seg = Math.floor(Math.random() * n);
    const pick = state.board[seg];
    const sg = segOf(pick.key);

    const you = turnPlayer();
    const them = state.players.find(p => p.id !== you.id);
    state.seg = seg;
    state.task = {
      id: pick.id, icon: sg.icon, cat: sg.label, level: pick.level,
      text: fill(pick.text, you ? you.name : 'את/ה', them ? them.name : 'בן/בת הזוג',
        you ? you.g : 'm', them ? them.g : 'f'),
    };

    // land this slice under the pointer, after four full turns
    const step = 360 / n;
    const target = ((-step * seg - step / 2) % 360 + 360) % 360;
    const now = ((state.rotation % 360) + 360) % 360;
    state.rotation += 4 * 360 + ((target - now) + 360) % 360;

    state.phase = 'spinning';
    sendState(); render(); spinWheel();
    clearTimeout(spinTimer);
    spinTimer = setTimeout(() => { state.phase = 'task'; sendState(); render(); }, SPIN_MS);
  }

  function finish(done) {
    const you = turnPlayer();
    if (done && you) {
      you.score += 1;
      state.log = [{ name: you.name, icon: state.task.icon, text: state.task.text }, ...(state.log || [])].slice(0, 4);
    }
    if (done) state.used = [...(state.used || []), state.task.id];   // performed — gone for good
    // either way the slice comes off the wheel, so every spin leaves one fewer
    state.board = (state.board || []).filter(b => b.id !== state.task.id);

    const other = state.players.find(p => p.id !== state.turn);
    if (other) state.turn = other.id;
    state.round += 1;
    // starts gentle and climbs fast: two rounds per level, unless someone set the dial by hand
    if (!state.board.length) state.board = deal(state.used || [], state.custom || []);   // a fresh wheel
    state.phase = state.board.length ? 'idle' : 'done';
    state.task = null;
    sendState(); render();
  }

  // ---------- lobby ----------
  const newCode = () => Array.from({ length: 4 },
    () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

  const remember = () => store.set('wheel.table', JSON.stringify({ code, isHost }));
  const forget = () => store.set('wheel.table', '');

  function host(name) {
    myName = name || 'שחקן'; store.set('wheel.name', myName);
    code = newCode(); isHost = true; screen = 'table';
    remember();
    state = { code, game: pickGame, round: 1, phase: 'idle', used: [], board: deal([], []), turn: meId,
      rotation: 0, seg: 0, task: null, log: [],
      players: [{ id: meId, name: myName, g: myGender, score: 0, seen: Date.now(), online: true }] };
    connect(() => sendState());
    clearInterval(beat);
    // heartbeat: publishes the table and refreshes our own view, so a partner
    // going quiet shows up here too and not only on their side
    beat = setInterval(() => { sendState(); render(); }, 4000);
    render();
  }

  function join(name, c) {
    myName = name || 'שחקן'; store.set('wheel.name', myName);
    code = c; isHost = false; screen = 'table'; state = null;
    remember();
    connect(() => act({ t: 'join', name: myName, g: myGender }));
    clearInterval(beat);
    beat = setInterval(() => act({ t: 'ping' }), 5000);
    render();
  }

  // ---------- wheel ----------
  function drawWheel() {
    const cv = document.getElementById('wheel');
    if (!cv) return;
    const board = (state && state.board) || SEGMENTS.map(sg => ({ key: sg.key }));
    const n = board.length;
    const S = 640, R = S / 2, ctx = cv.getContext('2d');
    cv.width = S; cv.height = S;
    ctx.clearRect(0, 0, S, S);
    if (!n) return;
    const step = (Math.PI * 2) / n;

    board.forEach((slice, i) => {
      const sg = segOf(slice.key);
      const a0 = -Math.PI / 2 + i * step;
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R - 4, a0, a0 + step);
      ctx.closePath();
      ctx.fillStyle = sg.hue;
      ctx.fill();
      ctx.strokeStyle = 'rgba(27,15,28,.55)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(a0 + step / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.font = '600 ' + (n > 6 ? 34 : 40) + 'px Assistant, system-ui, sans-serif';
      ctx.fillText(sg.label, R - 74, 0);
      ctx.font = (n > 6 ? 40 : 46) + 'px system-ui, sans-serif';
      ctx.fillText(sg.icon, R - 26, 2);
      ctx.restore();
    });
  }

  function spinWheel() {
    const cv = document.getElementById('wheel');
    if (cv && state) cv.style.transform = `rotate(${state.rotation}deg)`;
    Sound.spin(SPIN_MS, (state && state.board && state.board.length) || 8);
  }

  // ---------- view ----------
  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const app = () => document.getElementById('app');
  // ten taps within two seconds of each other
  function tapped() {
    const now = Date.now();
    taps = now - tapAt > 2000 ? 1 : taps + 1;
    tapAt = now;
    if (taps >= 10) { taps = 0; secret = true; render({ force: true }); }
  }

  function secretPanel() {
    const custom = state.custom || [];
    const list = allTasks(custom);
    const used = state.used || [];
    return `
      <div class="panel secret">
        <p class="eyebrow" style="margin:0 0 10px">תפריט סודי</p>
        <div class="actions">
          <button class="btn" id="scRefill">החזרת כל המשימות לגלגל</button>
          <button class="btn" id="scPass">העברת התור לצד השני</button>
          <button class="btn" id="scLock">נעילת המשחק במכשיר הזה</button>
        </div>
        <p class="label" style="margin:14px 0 7px">משימה משלכם</p>
        <input id="scText" maxlength="160" placeholder="כתבו משימה ולחצו הוספה" value="${esc(customDraft)}">
        <div class="actions" style="margin-top:8px"><button class="btn" id="scAdd">הוספה לגלגל</button></div>
        <p class="label" style="margin:14px 0 7px">בחירת משימה ידנית</p>
        <select id="scPick" class="picker">
          <option value="">— בחרו —</option>
          ${list.map(t => `<option value="${esc(t.id)}"${t.id === pickId ? ' selected' : ''}>${
            segOf(t.key).icon} ${esc(t.text.replace(/[{}\[\]]/g, '').slice(0, 42))}${used.includes(t.id) ? ' ✔' : ''}</option>`).join('')}
        </select>
        <div class="actions" style="margin-top:8px"><button class="btn" id="scForce">הצגת המשימה</button></div>
        <p class="muted" style="font-size:.78rem;margin:14px 0 0">
          שולחן ${esc(code)} · גרסה ${APP_VERSION} · ${used.length} בוצעו · ${list.length} סה"כ${
          custom.length ? ` · ${custom.length} משלכם` : ''}</p>
        <div class="actions" style="margin-top:10px"><button class="btn rose" id="scClose">סגירה</button></div>
      </div>`;
  }

  const CONN = { off: ['', 'מנותק'], connecting: ['', 'מתחבר…'], on: ['on', 'מחוברים'], lost: ['bad', 'מחפש חיבור…'] };

  // The heartbeat re-renders every few seconds. That is fine normally, but it
  // would tear down an open <select> mid-scroll, so while the hidden menu is up
  // we hold updates and apply them once it closes.
  function render(opts) {
    if (secret && !(opts && opts.force)) { deferred = true; return; }
    deferred = false;
    if (!Gate.open) return renderGate();
    screen === 'lobby' ? renderLobby() : renderTable();
  }

  function renderGate() {
    app().innerHTML = `
      <div class="stage">
        <div class="wheelbox"><div class="pointer"></div><canvas id="wheel"></canvas><div class="cap">🔒</div></div>
      </div>
      <div class="panel">
        <p class="eyebrow">כניסה</p>
        <h1>גלגל הזוגות</h1>
        <p class="muted" style="margin:10px 0 16px">המשחק נעול. הזינו את הקוד כדי להיכנס.</p>
        <input id="gate" inputmode="numeric" autocomplete="off" maxlength="12"
               placeholder="קוד כניסה" value="${esc(gateCode)}">
        <div class="actions" style="margin-top:12px"><button class="btn rose" id="gateGo">כניסה</button></div>
        <p class="note">${esc(gateErr)}</p>
      </div>
      <p class="version">גרסה ${APP_VERSION}</p>`;
    drawWheel();
    const el = document.getElementById('gate');
    el.addEventListener('input', () => { gateCode = el.value; });
    const submit = () => {
      if (!Gate.unlock(gateCode)) { gateErr = 'קוד שגוי'; render({ force: true }); return; }
      gateCode = ''; gateErr = '';
      boot();            // pick the table back up if this device was mid-game
    };
    el.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    document.getElementById('gateGo').onclick = submit;
  }

  function closeSecret() {
    secret = false;
    render({ force: true });
  }

  function renderLobby() {
    app().innerHTML = `
      <div class="stage">
        <div class="wheelbox"><div class="pointer"></div><canvas id="wheel"></canvas><div class="cap">💞</div></div>
      </div>
      <div class="panel">
        <p class="eyebrow">משחק לשניים</p>
        <h1>גלגל הזוגות</h1>
        <p class="muted" style="margin:10px 0 14px">טלפון אחד פותח שולחן, השני מצטרף עם הקוד.</p>
        <p class="label" style="margin:0 0 8px">איזה משחק</p>
        <div class="games">${GAMES.map(g => `
          <button class="game" data-game="${g.id}" aria-pressed="${g.id === pickGame}">
            <span class="ico">${g.icon}</span><span><b>${g.name}</b><small>${g.note}</small></span>
          </button>`).join('')}</div>
        <p class="label" style="margin:16px 0 7px">השם שלך</p>
        <input id="name" maxlength="14" placeholder="השם שלך" autocomplete="nickname" value="${esc(formName)}">
        <p class="label" style="margin:14px 0 7px">לפנות אליך ב…</p>
        <div class="genders">
          <button class="level" data-g="m" aria-pressed="${myGender === 'm'}">לשון זכר</button>
          <button class="level" data-g="f" aria-pressed="${myGender === 'f'}">לשון נקבה</button>
        </div>
        <div class="actions" style="margin-top:12px"><button class="btn rose" id="btnHost">פתיחת שולחן</button></div>
        <p class="or">או</p>
        <input id="code" maxlength="4" placeholder="קוד" autocapitalize="characters" value="${esc(formCode)}">
        <div class="actions" style="margin-top:10px"><button class="btn" id="btnJoin">הצטרפות</button></div>
        <p class="note" id="note">${esc(err)}</p>
      </div>`;
    drawWheel();
    const nameEl = document.getElementById('name'), codeEl = document.getElementById('code');
    nameEl.addEventListener('input', () => { formName = nameEl.value; });
    codeEl.addEventListener('input', () => { formCode = codeEl.value; });

    // formName/formCode are the source of truth: the inputs are re-created on
    // every render, so anything read only from the DOM would be lost
    app().querySelectorAll('.games .game').forEach(b => b.onclick = () => {
      pickGame = b.dataset.game; render({ force: true });
    });
    app().querySelectorAll('.genders .level').forEach(b => b.onclick = () => {
      myGender = b.dataset.g; store.set('wheel.g', myGender);
      render({ force: true });
    });
    document.getElementById('btnHost').onclick = () => host(formName.trim());
    document.getElementById('btnJoin').onclick = () => {
      const c = formCode.trim().toUpperCase();
      if (c.length !== 4) { err = 'קוד שולחן הוא 4 תווים'; render(); return; }
      join(formName.trim(), c);
    };
  }

  function bjBody() {
    if (state.players.length < 2)
      return '<p class="callout">21 מתחיל ברגע שהמכשיר השני מצטרף.</p>';
    if (!state.bj) return '<p class="callout">מחלקים…</p>';
    return BJ.view(state.bj, state.players, meId);
  }

  function renderTable() {
    const [dotClass, connText] = CONN[conn];

    if (!state) {
      app().innerHTML = `
        <div class="stage">
          <div class="wheelbox"><div class="pointer"></div><canvas id="wheel"></canvas><div class="cap">💞</div></div>
          <p class="callout">מצטרפים לשולחן <b>${esc(code)}</b>…</p>
          <p class="link"><i class="dot ${dotClass}"></i>${connText}</p>
        </div>
        <p class="note">אם זה נתקע — ודאו שהטלפון שפתח את השולחן פתוח באותו רגע.</p>`;
      drawWheel();
      return;
    }

    const you = turnPlayer();
    const other = partner();
    const alone = state.players.length < 2;
    const dropped = !!other && other.online === false;
    const stale = !isHost && Date.now() - gotStateAt > 16000;
    const t = state.task;

    const callout =
      state.phase === 'spinning' ? 'הגלגל מסתובב…' :
      state.phase === 'task' ? `המשימה של <b>${esc(you ? you.name : '')}</b>` :
      alone ? 'ממתינים לטלפון השני — או שמסובבים כבר' :
      myTurn() ? 'התור שלך. סובבו.' : `התור של <b>${esc(you ? you.name : '')}</b>`;

    app().innerHTML = `
      <div class="topbar">
        <button class="room" id="btnShare">שולחן <b>${esc(code)}</b> · שיתוף</button>
        <button class="room" id="btnGame" title="החלפת משחק">${state.game === 'bj' ? '🎡' : '🃏'}</button>
        <button class="room" id="btnSound" title="קול">${Sound.on ? '🔊' : '🔇'}</button>
        <button class="room" id="btnLeave" title="יציאה">יציאה</button>
        <div class="score">${state.players.map(p =>
          `<span class="pill${p.id === state.turn ? ' turn' : ''}"><i class="dot${
            p.online ? ' on' : ' bad'}"></i>${esc(p.name)} <b>${p.score}</b></span>`).join('')}</div>
      </div>

      ${alone ? `
        <div class="panel waiting">
          <p class="eyebrow">ממתינים לבן/בת הזוג</p>
          <p class="bigcode">${esc(code)}</p>
          <p class="muted" style="margin:0">שלחו את הלינק, או שיקלידו את הקוד הזה במכשיר השני.
            ברגע שיצטרפו — השם שלהם יופיע כאן למעלה עם נקודה ירוקה.</p>
          <button class="btn rose" id="btnShare2" style="margin-top:12px">שליחת הלינק</button>
        </div>` : dropped ? `
        <div class="panel waiting">
          <p class="eyebrow">החיבור נותק</p>
          <p class="muted" style="margin:0">${esc(other ? other.name : 'בן/בת הזוג')} לא מחובר/ת כרגע.
            המשחק ממתין — ברגע שהמכשיר השני יחזור, הנקודה תחזור לירוק.</p>
        </div>` : ''}

      ${state.game === 'bj' ? bjBody() : `
      <div class="stage">
        <div class="wheelbox">
          <div class="pointer"></div>
          <canvas id="wheel"></canvas>
          <div class="cap">${state.phase === 'task' && t ? t.icon : '💞'}</div>
        </div>
        <p class="callout">${callout}</p>
      </div>`}

      ${state.game === 'bj' ? '' : `
      ${state.phase === 'task' && t ? `
        <div class="task">
          <div class="icon">${t.icon}</div>
          <p class="cat">${esc(t.cat)}</p>
          <p>${esc(t.text)}</p>
          <p class="who">סיבוב ${state.round}</p>
        </div>
        <div class="actions">
          <div class="btn two">
            <button class="btn rose" id="btnDone">בוצע ✔</button>
            <button class="btn" id="btnSkip">דלגו</button>
          </div>
        </div>` : `
        ${state.phase === 'done' ? `
        <div class="panel waiting">
          <p class="eyebrow">הגלגל נגמר</p>
          <p class="muted" style="margin:0">עברתם על כל המשימות. אפשר להתחיל מחדש — או להפסיק לשחק.</p>
          <button class="btn rose" id="btnAgain" style="margin-top:12px">מהתחלה</button>
        </div>` : `
        <div class="actions">
          <button class="btn rose" id="btnSpin" ${state.phase === 'idle' && (myTurn() || alone) ? '' : 'disabled'}>
            ${state.phase === 'spinning' ? 'מסתובב…' : myTurn() || alone ? 'סובבו את הגלגל' : 'ממתינים לתורך'}</button>
        </div>`}`}

      <div class="panel heat">
        <p class="eyebrow" style="margin:0">${HEAT}</p>
        <p class="muted" style="margin:6px 0 0">${(state.board || []).length} על הגלגל · ${
          64 - (state.used || []).length} משימות נשארו</p>
      </div>

      ${(state.log || []).length ? `<div class="log">${state.log.map(l =>
        `<div><span>${l.icon}</span><b>${esc(l.name)}</b><span>${esc(l.text)}</span></div>`).join('')}</div>` : ''}

      `}
      <p class="link"><i class="dot ${dotClass}"></i>${connText} · ${
        alone ? 'רק אתם בשולחן' : dropped ? `${esc(other.name)} מנותק/ת` : `${esc(other.name)} מחובר/ת`
      }${stale ? ' · השולחן לא משדר' : ''}</p>
      <p class="version" id="ver">גרסה ${APP_VERSION}</p>
      ${secret ? secretPanel() : ''}
      <p class="note" id="note">${esc(err)}</p>`;

    if (state.game !== 'bj') drawWheel();
    const cv = document.getElementById('wheel');
    if (cv) {
      // land instantly when re-rendering mid-state; animate only on a fresh spin
      if (state.phase !== 'spinning') {
        cv.style.transition = 'none';
        cv.style.transform = `rotate(${state.rotation}deg)`;
        void cv.offsetWidth;
        cv.style.transition = '';
      } else {
        cv.style.transform = `rotate(${state.rotation}deg)`;
      }
    }

    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
    on('bjHit', () => act({ t: 'bj', do: 'hit' }));
    on('bjStand', () => act({ t: 'bj', do: 'stand' }));
    on('bjNext', () => act({ t: 'bj', do: 'deal' }));
    on('bjAgain', () => act({ t: 'bj', do: 'again' }));
    on('btnSpin', () => act({ t: 'spin' }));
    on('btnAgain', () => act({ t: 'again' }));
    on('btnSound', () => { Sound.toggle(); render(); });
    on('btnGame', () => act({ t: 'switch', game: state.game === 'bj' ? 'wheel' : 'bj' }));

    const ver = document.getElementById('ver');
    if (ver) ver.onclick = tapped;
    const connLine = app().querySelector('.link');   // not `conn` — that is the connection state
    if (connLine) connLine.onclick = tapped;

    if (secret) {
      const txt = document.getElementById('scText');
      if (txt) txt.addEventListener('input', () => { customDraft = txt.value; });
      const sel = document.getElementById('scPick');
      if (sel) sel.addEventListener('change', () => { pickId = sel.value; });
      on('scRefill', () => { act({ t: 'refill' }); render({ force: true }); });
      on('scPass', () => { act({ t: 'pass' }); render({ force: true }); });
      on('scAdd', () => {
        if (!customDraft.trim()) return;
        act({ t: 'custom', text: customDraft });
        customDraft = '';
        render({ force: true });
      });
      on('scForce', () => {
        const id = (sel && sel.value) || pickId;
        if (!id) return;
        act({ t: 'force', id });
        pickId = '';
        closeSecret();
      });
      on('scClose', () => { pickId = ''; closeSecret(); });
      on('scLock', () => { Gate.lock(); pickId = ''; closeSecret(); });
    }
    on('btnLeave', () => {
      forget();
      try { client.end(true); } catch {}
      clearInterval(beat);
      code = null; state = null; screen = 'lobby'; conn = 'off';
      render();
    });
    on('btnDone', () => act({ t: 'done' }));
    on('btnSkip', () => act({ t: 'skip' }));
    const share = async () => {
      const link = `${location.origin}${location.pathname}?code=${code}`;
      const text = `בוא/י נשחק — קוד השולחן ${code}`;
      if (navigator.share) { try { await navigator.share({ title: 'גלגל הזוגות', text, url: link }); return; } catch {} }
      try { await navigator.clipboard.writeText(link); err = 'הקישור הועתק'; }
      catch { err = link; }
      render();
    };
    on('btnShare', share);
    on('btnShare2', share);
  }

  // reconnect when the phone comes back from sleep
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && code && conn !== 'on') {
      try { client.end(true); } catch {}
      connect(() => isHost ? sendState() : act({ t: 'join', name: myName, g: myGender }));
    }
  });

  function resume() {
    let saved = null;
    try { saved = JSON.parse(store.get('wheel.table') || 'null'); } catch {}
    if (!saved || !saved.code) return false;
    code = saved.code; isHost = !!saved.isHost; screen = 'table'; state = null;
    if (isHost) {
      // the retained table arrives on subscribe; if nothing comes back, open a fresh one
      connect(() => setTimeout(() => {
        if (!state) {
          state = { code, game: pickGame, round: 1, phase: 'idle', used: [], board: deal([], []),
            turn: meId, rotation: 0, seg: 0, task: null, log: [],
            players: [{ id: meId, name: myName, g: myGender, score: 0, seen: Date.now(), online: true }] };
          sendState(); render();
        }
      }, 2500));
      clearInterval(beat);
      beat = setInterval(() => { sendState(); render(); }, 4000);
    } else {
      connect(() => act({ t: 'join', name: myName, g: myGender }));
      clearInterval(beat);
      beat = setInterval(() => act({ t: 'ping' }), 5000);
    }
    render();
    return true;
  }

  function boot() {
    if (!Gate.open) return render({ force: true });   // the shared link hits the gate first
    if (!resume()) render({ force: true });
  }

  const qs = new URLSearchParams(location.search).get('code');
  if (qs && /^[A-Z0-9]{4}$/i.test(qs)) formCode = qs.toUpperCase();
  boot();
})();
