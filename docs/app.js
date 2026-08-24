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
    if (isHost) return;
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
  const unused = (key, lvl) => TASKS[key]
    .map((t, i) => ({ ...t, id: taskId(key, i) }))
    .filter(t => t.level <= lvl && !(state.used || []).includes(t.id));
  const liveSegments = () => SEGMENTS.map((s2, i) => i).filter(i => unused(SEGMENTS[i].key, state.level).length);

  function onAction(a) {
    const p = state.players.find(x => x.id === a.from);
    if (p) p.seen = Date.now();                       // any message is a sign of life

    if (a.t === 'ping') return;                       // presence only, nothing to apply

    if (a.t === 'join') {
      if (!p) {
        if (state.players.length >= 2) return;        // a table for two
        state.players.push({ id: a.from, name: String(a.name || 'שחקן').slice(0, 14),
          g: a.g === 'f' ? 'f' : 'm', score: 0, seen: Date.now(), online: true });
      } else { p.name = String(a.name || p.name).slice(0, 14); if (a.g) p.g = a.g === 'f' ? 'f' : 'm'; }
    } else if (a.t === 'level') {
      const lvl = LEVELS.find(l => l.id === a.level);
      if (lvl) { state.level = lvl.id; state.manual = true; }
    } else if (a.t === 'again') {
      state.used = []; state.round = 1; state.level = 1; state.manual = false;
      state.phase = 'idle'; state.task = null; state.log = [];
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
    const live = liveSegments();
    if (!live.length) { state.phase = 'done'; sendState(); render(); return; }

    const seg = live[Math.floor(Math.random() * live.length)];
    const left = unused(SEGMENTS[seg].key, state.level);
    // levels 1–2 are additive; from 3 up the wheel stops offering the gentle cards
    const hot = state.level >= 3 ? left.filter(t => t.level >= state.level - 1) : [];
    const pool = hot.length ? hot : left;
    const pick = pool[Math.floor(Math.random() * pool.length)];

    const you = turnPlayer();
    const them = state.players.find(p => p.id !== you.id);
    state.seg = seg;
    state.task = {
      id: pick.id,
      icon: SEGMENTS[seg].icon,
      cat: SEGMENTS[seg].label,
      level: pick.level,
      text: fill(pick.text, you ? you.name : 'את/ה', them ? them.name : 'בן/בת הזוג',
        you ? you.g : 'm', them ? them.g : 'f'),
    };

    // land the chosen segment under the pointer, after four full turns
    const target = ((-45 * seg - 22.5) % 360 + 360) % 360;
    const now = ((state.rotation % 360) + 360) % 360;
    state.rotation += 4 * 360 + ((target - now) + 360) % 360;

    state.phase = 'spinning';
    sendState(); render(); spinWheel();
    clearTimeout(spinTimer);
    spinTimer = setTimeout(() => { state.phase = 'task'; sendState(); render(); }, SPIN_MS);
  }

  function finish(done) {
    const you = turnPlayer();
    if (done) {
      if (you) {
        you.score += 1;
        state.log = [{ name: you.name, icon: state.task.icon, text: state.task.text }, ...(state.log || [])].slice(0, 4);
      }
      state.used = [...(state.used || []), state.task.id];   // performed — off the wheel
    }
    const other = state.players.find(p => p.id !== state.turn);
    if (other) state.turn = other.id;
    state.round += 1;
    // starts gentle and climbs fast: two rounds per level, unless someone set the dial by hand
    if (!state.manual) state.level = Math.min(4, Math.ceil(state.round / 2));
    state.phase = liveSegments().length ? 'idle' : 'done';
    state.task = null;
    sendState(); render();
  }

  // ---------- lobby ----------
  const newCode = () => Array.from({ length: 4 },
    () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

  function host(name) {
    myName = name || 'שחקן'; store.set('wheel.name', myName);
    code = newCode(); isHost = true; screen = 'table';
    state = { code, round: 1, phase: 'idle', level: 1, manual: false, used: [], turn: meId,
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
    connect(() => act({ t: 'join', name: myName, g: myGender }));
    clearInterval(beat);
    beat = setInterval(() => act({ t: 'ping' }), 5000);
    render();
  }

  // ---------- wheel ----------
  function drawWheel() {
    const cv = document.getElementById('wheel');
    if (!cv) return;
    const spent = state ? SEGMENTS.map(sg => !unused(sg.key, 4).length) : SEGMENTS.map(() => false);
    const S = 640, R = S / 2, ctx = cv.getContext('2d');
    cv.width = S; cv.height = S;
    ctx.clearRect(0, 0, S, S);
    const step = (Math.PI * 2) / SEGMENTS.length;

    SEGMENTS.forEach((seg, i) => {
      const a0 = -Math.PI / 2 + i * step;
      ctx.beginPath();
      ctx.moveTo(R, R);
      ctx.arc(R, R, R - 4, a0, a0 + step);
      ctx.closePath();
      ctx.fillStyle = spent[i] ? '#3a2b3c' : seg.hue;
      ctx.fill();
      ctx.strokeStyle = 'rgba(27,15,28,.55)';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.save();
      ctx.translate(R, R);
      ctx.rotate(a0 + step / 2);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = spent[i] ? 'rgba(255,255,255,.32)' : '#fff';
      ctx.globalAlpha = spent[i] ? .55 : 1;
      ctx.font = '600 34px Assistant, system-ui, sans-serif';
      ctx.fillText(seg.label, R - 74, 0);
      ctx.font = '40px system-ui, sans-serif';
      ctx.fillText(seg.icon, R - 26, 2);
      ctx.globalAlpha = 1;
      ctx.restore();
    });
  }

  function spinWheel() {
    const cv = document.getElementById('wheel');
    if (cv && state) cv.style.transform = `rotate(${state.rotation}deg)`;
  }

  // ---------- view ----------
  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const app = () => document.getElementById('app');
  const CONN = { off: ['', 'מנותק'], connecting: ['', 'מתחבר…'], on: ['on', 'מחוברים'], lost: ['bad', 'מחפש חיבור…'] };

  function render() {
    screen === 'lobby' ? renderLobby() : renderTable();
  }

  function renderLobby() {
    app().innerHTML = `
      <div class="stage">
        <div class="wheelbox"><div class="pointer"></div><canvas id="wheel"></canvas><div class="cap">💞</div></div>
      </div>
      <div class="panel">
        <p class="eyebrow">משחק לשניים</p>
        <h1>גלגל הזוגות</h1>
        <p class="muted" style="margin:10px 0 16px">מסובבים את הגלגל, הוא נוחת על משימה — ומבצעים. טלפון אחד פותח שולחן, השני מצטרף עם הקוד.</p>
        <input id="name" maxlength="14" placeholder="השם שלך" autocomplete="nickname" value="${esc(myName)}">
        <p class="label" style="margin:14px 0 7px">לפנות אליך ב…</p>
        <div class="genders">
          <button class="level" data-g="m" aria-pressed="${myGender === 'm'}">לשון זכר</button>
          <button class="level" data-g="f" aria-pressed="${myGender === 'f'}">לשון נקבה</button>
        </div>
        <div class="actions" style="margin-top:12px"><button class="btn rose" id="btnHost">פתיחת שולחן</button></div>
        <p class="or">או</p>
        <input id="code" maxlength="4" placeholder="קוד" autocapitalize="characters">
        <div class="actions" style="margin-top:10px"><button class="btn" id="btnJoin">הצטרפות</button></div>
        <p class="note" id="note">${esc(err)}</p>
      </div>`;
    drawWheel();
    app().querySelectorAll('.genders .level').forEach(b => b.onclick = () => {
      myGender = b.dataset.g; store.set('wheel.g', myGender); render();
    });
    const nameOf = () => document.getElementById('name').value.trim();
    document.getElementById('btnHost').onclick = () => host(nameOf());
    document.getElementById('btnJoin').onclick = () => {
      const c = document.getElementById('code').value.trim().toUpperCase();
      if (c.length !== 4) { err = 'קוד שולחן הוא 4 תווים'; render(); return; }
      join(nameOf(), c);
    };
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

      <div class="stage">
        <div class="wheelbox">
          <div class="pointer"></div>
          <canvas id="wheel"></canvas>
          <div class="cap">${state.phase === 'task' && t ? t.icon : '💞'}</div>
        </div>
        <p class="callout">${callout}</p>
      </div>

      ${state.phase === 'task' && t ? `
        <div class="task">
          <div class="icon">${t.icon}</div>
          <p class="cat">${esc(t.cat)} · ${esc((LEVELS.find(l => l.id === t.level) || {}).name || '')}</p>
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

      <div class="panel">
        <p class="eyebrow">רמת החום · נשארו ${SEGMENTS.reduce((n, sg) => n + unused(sg.key, 4).length, 0)} משימות</p>
        <div class="levels">${LEVELS.map(l =>
          `<button class="level" data-level="${l.id}" aria-pressed="${l.id === state.level}">${l.name}<small>${l.note}</small></button>`).join('')}</div>
      </div>

      ${(state.log || []).length ? `<div class="log">${state.log.map(l =>
        `<div><span>${l.icon}</span><b>${esc(l.name)}</b><span>${esc(l.text)}</span></div>`).join('')}</div>` : ''}

      <p class="link"><i class="dot ${dotClass}"></i>${connText} · ${
        alone ? 'רק אתם בשולחן' : dropped ? `${esc(other.name)} מנותק/ת` : `${esc(other.name)} מחובר/ת`
      }${stale ? ' · השולחן לא משדר' : ''}</p>
      <p class="note" id="note">${esc(err)}</p>`;

    drawWheel();
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
    on('btnSpin', () => act({ t: 'spin' }));
    on('btnAgain', () => act({ t: 'again' }));
    on('btnDone', () => act({ t: 'done' }));
    on('btnSkip', () => act({ t: 'skip' }));
    app().querySelectorAll('.level').forEach(b =>
      b.onclick = () => act({ t: 'level', level: +b.dataset.level }));
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

  const qs = new URLSearchParams(location.search).get('code');
  render();
  if (qs && /^[A-Z0-9]{4}$/i.test(qs)) {
    const el = document.getElementById('code');
    if (el) el.value = qs.toUpperCase();
  }
})();
