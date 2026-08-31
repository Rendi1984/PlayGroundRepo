'use strict';
/*
 * 21 — גרסת הפשטה לזוגות.
 *
 * חוקים: כל אחד מתחיל עם חמישה פריטי לבוש. בכל יד מחלקים שני קלפים לכל צד,
 * ומי שרוצה מבקש עוד. מי שעובר את 21 מוריד פריט. אם אף אחד לא עבר — מי
 * שקרוב פחות ל-21 מוריד פריט; תיקו ואף אחד לא מוריד. מי שנשאר בלי בגדים הפסיד.
 *
 * המודול הזה מחזיק את החוקים ואת התצוגה, ומשמש גם את גרסת שני הטלפונים
 * וגם את גרסת טלפון אחד.
 */
const BJ = (() => {
  const SUITS = [
    { k: 'kiss',  icon: '💋', hot: true },
    { k: 'flame', icon: '🔥', hot: true },
    { k: 'peach', icon: '🍑', hot: false },
    { k: 'cherry',icon: '🍒', hot: false },
  ];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const ITEMS = [
    { icon: '👕', name: 'חולצה' },
    { icon: '👖', name: 'מכנסיים' },
    { icon: '🧦', name: 'גרביים' },
    { icon: '⌚', name: 'תכשיט' },
    { icon: '🩲', name: 'תחתונים' },
  ];
  const START_ITEMS = ITEMS.length;

  const deck = () => {
    const d = [];
    for (let s = 0; s < SUITS.length; s++) for (let r = 0; r < RANKS.length; r++) d.push({ s, r });
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  };

  const cardValue = r => (r === 0 ? 11 : r >= 9 ? 10 : r + 1);

  function total(hand) {
    let sum = 0, aces = 0;
    for (const c of hand) { sum += cardValue(c.r); if (c.r === 0) aces++; }
    while (sum > 21 && aces > 0) { sum -= 10; aces--; }
    return sum;
  }
  const busted = hand => total(hand) > 21;

  // a fresh game: everyone dressed, nobody out
  const fresh = ids => ({
    clothes: Object.fromEntries(ids.map(id => [id, START_ITEMS])),
    score: Object.fromEntries(ids.map(id => [id, 0])),
    round: 0, phase: 'deal', hands: {}, stood: {}, active: ids[0], starter: ids[0],
    shed: [], message: '', loser: null, deck: [],
  });

  function newHand(bj, ids) {
    bj.deck = deck();
    bj.hands = Object.fromEntries(ids.map(id => [id, [bj.deck.pop(), bj.deck.pop()]]));
    bj.stood = Object.fromEntries(ids.map(id => [id, false]));
    bj.round += 1;
    bj.starter = bj.round === 1 ? ids[0] : (bj.starter === ids[0] ? ids[1] || ids[0] : ids[0]);
    bj.active = bj.starter;
    bj.shed = [];
    bj.message = '';
    bj.phase = 'play';
    // a natural 21 stands on its own
    for (const id of ids) if (total(bj.hands[id]) === 21) bj.stood[id] = true;
    if (bj.stood[bj.active]) bj.active = nextUp(bj, ids);
    return bj;
  }

  const done = (bj, id) => bj.stood[id] || busted(bj.hands[id] || []);
  const nextUp = (bj, ids) => ids.find(id => id !== bj.active && !done(bj, id)) || null;

  function advance(bj, ids) {
    const nxt = nextUp(bj, ids);
    if (nxt) { bj.active = nxt; return bj; }
    if (ids.every(id => done(bj, id))) return resolve(bj, ids);
    return bj;
  }

  function hit(bj, id, ids) {
    if (bj.phase !== 'play' || bj.active !== id || done(bj, id)) return bj;
    bj.hands[id] = [...bj.hands[id], bj.deck.pop()];
    if (busted(bj.hands[id])) bj.stood[id] = true;
    return advance(bj, ids);
  }

  function stand(bj, id, ids) {
    if (bj.phase !== 'play' || bj.active !== id) return bj;
    bj.stood[id] = true;
    return advance(bj, ids);
  }

  // who takes something off
  function resolve(bj, ids) {
    const t = Object.fromEntries(ids.map(id => [id, total(bj.hands[id])]));
    const over = ids.filter(id => t[id] > 21);
    let shed = [];
    if (over.length) shed = over;                       // whoever went over pays
    else if (ids.length === 2 && t[ids[0]] !== t[ids[1]]) {
      shed = [t[ids[0]] < t[ids[1]] ? ids[0] : ids[1]];  // otherwise the lower hand pays
    }
    for (const id of shed) bj.clothes[id] = Math.max(0, (bj.clothes[id] || 0) - 1);
    bj.shed = shed;
    // one point to whoever took the hand; nothing on a double bust or a tie
    bj.score = bj.score || Object.fromEntries(ids.map(id => [id, 0]));
    if (shed.length === 1) {
      const winner = ids.find(id => id !== shed[0]);
      if (winner) bj.score[winner] = (bj.score[winner] || 0) + 1;
    }
    const out = ids.find(id => bj.clothes[id] === 0);
    bj.phase = out ? 'over' : 'reveal';
    bj.loser = out || null;
    return bj;
  }

  // ---------- view ----------
  const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const cardHtml = (c, hidden) => {
    if (hidden) return `<div class="pcard back" aria-label="קלף סגור"><span class="mono">💞</span></div>`;
    const su = SUITS[c.s], r = RANKS[c.r];
    const corner = `<b>${r}</b><i>${su.icon}</i>`;
    return `<div class="pcard${su.hot ? ' hot' : ''}" aria-label="${r} ${su.icon}">
      <span class="corner tl">${corner}</span>
      <span class="pip">${su.icon}</span>
      <span class="corner br">${corner}</span>
    </div>`;
  };

  const wardrobe = n => ITEMS.map((it, i) =>
    `<i class="rag${i < n ? '' : ' off'}" title="${it.name}">${it.icon}</i>`).join('');

  /*
   * opts: { me, active, phase, canAct }
   * Renders the whole 21 screen. Buttons carry stable ids the host app wires up.
   */
  function view(bj, players, meId) {
    const ids = players.map(p => p.id);
    const me = players.find(p => p.id === meId) || players[0];
    const them = players.find(p => p.id !== meId);
    const myTurn = bj.active === meId && bj.phase === 'play';
    const reveal = bj.phase !== 'play';

    const seat = (p, hideSecond) => {
      if (!p) return '';
      const hand = bj.hands[p.id] || [];
      const t = total(hand);
      const isMe = p.id === meId;
      const state = bj.phase === 'play'
        ? (busted(hand) ? 'עבר/ה' : bj.stood[p.id] ? 'עצר/ה' : bj.active === p.id ? 'תורו/ה' : '')
        : (t > 21 ? `עבר/ה · ${t}` : t);
      return `
        <div class="seat${bj.active === p.id && bj.phase === 'play' ? ' turn' : ''}${
          bj.shed.includes(p.id) ? ' shed' : ''}">
          <div class="seat-head">
            <span class="who">${esc(p.name)}${isMe ? ' (את/ה)' : ''}
              <em class="wins">${(bj.score || {})[p.id] || 0} ניצחונות</em></span>
            <span class="tot">${isMe || reveal ? state : (bj.stood[p.id] ? 'עצר/ה' : '')}</span>
          </div>
          <div class="hand">${hand.map((c, i) =>
            cardHtml(c, !isMe && !reveal && i > 0)).join('')}</div>
          <div class="rags">${wardrobe(bj.clothes[p.id] || 0)}</div>
        </div>`;
    };

    const banner =
      bj.phase === 'over'
        ? (bj.loser === meId ? 'נשארת בלי כלום. הפסדת.' : `${esc((players.find(p => p.id === bj.loser) || {}).name || '')} נשאר/ה בלי כלום.`)
      : bj.phase === 'reveal'
        ? (bj.shed.length === 0 ? 'תיקו — כולם נשארים לבושים.'
          : bj.shed.includes(meId) && bj.shed.length === 1 ? 'הפסדת את היד. פריט אחד יורד.'
          : bj.shed.length === 2 ? 'שניכם עברתם. פריט לכל אחד.'
          : `${esc((players.find(p => p.id === bj.shed[0]) || {}).name || '')} מוריד/ה פריט.`)
      : myTurn ? 'התור שלך — עוד קלף או עוצרים?'
      : them ? `התור של ${esc(them.name)}` : 'מחלקים…';

    return `
      <div class="bj">
        <p class="callout">${banner}</p>
        ${seat(them)}
        ${seat(me)}
        ${bj.phase !== 'play' ? `
          <div class="scoreboard">
            <span class="sb-title">ניקוד</span>
            ${players.map(p => `<span class="sb"><b>${esc(p.name)}</b> ${
              (bj.score || {})[p.id] || 0} <i>·</i> ${bj.clothes[p.id] || 0} פריטים</span>`).join('')}
          </div>` : ''}
        <div class="actions">
          ${bj.phase === 'play' ? `
            <div class="btn two">
              <button class="btn rose" id="bjHit" ${myTurn ? '' : 'disabled'}>עוד קלף</button>
              <button class="btn" id="bjStand" ${myTurn ? '' : 'disabled'}>עוצר</button>
            </div>` : ''}
          ${bj.phase === 'reveal' ? `<button class="btn rose" id="bjNext">יד הבאה</button>` : ''}
          ${bj.phase === 'over' ? `<button class="btn rose" id="bjAgain">משחק חדש</button>` : ''}
        </div>
        <p class="note">יד ${bj.round} · מי שעובר 21 מוריד פריט · מי שנשאר בלי כלום הפסיד</p>
      </div>`;
  }

  return { SUITS, RANKS, ITEMS, START_ITEMS, fresh, newHand, hit, stand, resolve, total, busted, view };
})();
