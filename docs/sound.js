'use strict';
/*
 * קול הגלגל — מסונתז ב-Web Audio, בלי קבצים חיצוניים.
 * הטיקים מתוזמנים לפי אותה עקומת האטה של האנימציה, כך שהם מתקרבים
 * ומאטים בדיוק כמו הגלגל, ונעצרים ברגע שהוא נעצר.
 */
const Sound = (() => {
  const EASE = [0.13, 0.72, 0.14, 1];   // must match the canvas transition
  let ctx = null;
  let on = true;
  try { on = localStorage.getItem('wheel.sound') !== 'off'; } catch {}

  // cubic-bezier(x1,y1,x2,y2) — progress at time fraction t
  const bez = (a, b, t) => {
    const u = 1 - t;
    return 3 * u * u * t * a + 3 * u * t * t * b + t * t * t;
  };
  // time fraction at which the wheel has turned `p` of the way
  const timeAt = (p) => {
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (bez(EASE[1], EASE[3], mid) < p) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };

  function audio() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();   // iOS unlocks only inside a gesture
    return ctx;
  }

  // one flapper click: a short filtered noise burst
  function tick(at, gain) {
    const c = ctx, dur = 0.045;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 2.5;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(bp).connect(g).connect(c.destination);
    src.start(at);
  }

  function chime(at) {
    const c = ctx;
    [660, 990].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, at + i * 0.09);
      g.gain.linearRampToValueAtTime(0.16, at + i * 0.09 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + i * 0.09 + 0.5);
      o.connect(g).connect(c.destination);
      o.start(at + i * 0.09); o.stop(at + i * 0.09 + 0.55);
    });
  }

  return {
    get on() { return on; },
    toggle() {
      on = !on;
      try { localStorage.setItem('wheel.sound', on ? 'up' : 'off'); } catch {}
      if (on) { const c = audio(); if (c) chime(c.currentTime + 0.02); }
      return on;
    },
    // call on the spin gesture: schedules the whole run at once
    spin(ms, slices) {
      if (!on) return;
      const c = audio();
      if (!c) return;
      const t0 = c.currentTime + 0.02;
      const clicks = Math.min(90, Math.max(8, Math.round(4.5 * slices)));
      for (let j = 1; j <= clicks; j++) {
        const t = timeAt(j / clicks);
        tick(t0 + t * (ms / 1000), 0.06 + 0.16 * (1 - t));   // loud and fast, then sparse and soft
      }
      chime(t0 + ms / 1000 + 0.05);
    },
  };
})();
