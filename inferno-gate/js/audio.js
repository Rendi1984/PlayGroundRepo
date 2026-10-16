'use strict';
// All sound is synthesized with WebAudio: effects run through a short
// generated reverb; the music is an original chugging riff in E.
let AC = null, sfxBus, musBus, NOISE, SHAPER, musicOn = true, musTimer = null, mStep = 0, mNext = 0;
let listenerX = 0, listenerY = 0;
function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; return; }
  const master = AC.createGain(); master.gain.value = 0.7;
  const comp = AC.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(AC.destination);
  sfxBus = AC.createGain(); sfxBus.gain.value = 0.85; sfxBus.connect(master);
  const rev = AC.createConvolver(), len = AC.sampleRate * 1.6, ir = AC.createBuffer(2, len, AC.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  rev.buffer = ir;
  const wet = AC.createGain(); wet.gain.value = 0.22; sfxBus.connect(rev).connect(wet).connect(master);
  musBus = AC.createGain(); musBus.gain.value = 0.2; musBus.connect(master);
  NOISE = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const ch = NOISE.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  SHAPER = new Float32Array(1024); for (let i = 0; i < 1024; i++) SHAPER[i] = Math.tanh((i / 512 - 1) * 6);
}
function aNoise(t, dur, freq, vol, band, out, pan) {
  const s = AC.createBufferSource(); s.buffer = NOISE;
  const f = AC.createBiquadFilter(); f.type = band ? 'bandpass' : 'lowpass';
  f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.3), t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g); route(g, out, pan); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function aTone(t, type, f0, f1, dur, vol, out, pan) {
  const o = AC.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); route(g, out, pan); o.start(t); o.stop(t + dur + 0.05);
}
function route(node, out, pan) {
  if (pan && AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; node.connect(p).connect(out || sfxBus); }
  else node.connect(out || sfxBus);
}
// x,y = world position of the source (optional) for distance falloff and panning
function sfx(name, x, y) {
  if (!AC) return;
  let v = 1, pan = 0;
  if (x !== undefined) {
    const dx = x - listenerX, dy = y - listenerY, d = Math.hypot(dx, dy);
    v = 1 / (1 + d * 0.28); if (v < 0.04) return;
    if (d > 0.5 && typeof P !== 'undefined') pan = clamp(Math.sin(normA(Math.atan2(dy, dx) - P.a)) * 0.7, -0.7, 0.7);
  }
  const t = AC.currentTime, N = (d, f, vv, b) => aNoise(t, d, f, vv * v, b, null, pan), Tn = (ty, a, b, d, vv, dt = 0) => aTone(t + dt, ty, a, b, d, vv * v, null, pan);
  switch (name) {
    case 'pistol': N(0.16, 2600, 0.75); Tn('square', 230, 60, 0.07, 0.22); break;
    case 'shotgun': N(0.45, 1500, 1.1); Tn('sawtooth', 150, 38, 0.22, 0.4); N(0.08, 900, 0.3); break;
    case 'pump': N(0.06, 1800, 0.25); N(0.06, 1200, 0.25); break;
    case 'chain': N(0.1, 2800, 0.62); Tn('square', 210, 70, 0.05, 0.18); break;
    case 'rocket': N(0.6, 900, 0.8, true); Tn('sawtooth', 90, 200, 0.4, 0.15); break;
    case 'plasma': Tn('square', 1400, 300, 0.09, 0.14); N(0.08, 5000, 0.2, true); break;
    case 'punch': N(0.09, 700, 0.8); break;
    case 'swing': N(0.14, 3200, 0.16, true); break;
    case 'pickup': Tn('square', 740, 980, 0.07, 0.15); break;
    case 'power': Tn('sine', 300, 1200, 0.6, 0.3); Tn('triangle', 450, 1800, 0.6, 0.15); break;
    case 'weapon': Tn('square', 440, 440, 0.07, 0.17); Tn('square', 660, 660, 0.07, 0.17, 0.08); Tn('square', 880, 880, 0.12, 0.17, 0.16); break;
    case 'door': N(0.8, 260, 0.55); Tn('sawtooth', 55, 46, 0.7, 0.14); break;
    case 'doorstop': N(0.12, 400, 0.6); break;
    case 'locked': Tn('square', 200, 200, 0.12, 0.2); Tn('square', 150, 150, 0.15, 0.2, 0.14); break;
    case 'oof': Tn('sawtooth', 160, 90, 0.15, 0.22); break;
    case 'land': N(0.12, 300, 0.5); break;
    case 'hurt': Tn('sawtooth', 320, 110, 0.22, 0.3); N(0.1, 900, 0.2); break;
    case 'pdeath': Tn('sawtooth', 300, 40, 0.9, 0.42); N(0.6, 500, 0.3); break;
    case 'zsight': Tn('sawtooth', 180, 110, 0.35, 0.28); break;
    case 'ssight': Tn('sawtooth', 140, 80, 0.4, 0.3); break;
    case 'isight': N(0.35, 1200, 0.4, true); Tn('sawtooth', 420, 180, 0.3, 0.22); break;
    case 'dsight': Tn('sawtooth', 90, 55, 0.55, 0.36); Tn('square', 93, 57, 0.55, 0.18); break;
    case 'csight': Tn('sawtooth', 70, 50, 0.7, 0.36); N(0.6, 400, 0.3, true); break;
    case 'bsight': Tn('sawtooth', 60, 40, 0.9, 0.45); Tn('square', 62, 41, 0.9, 0.22); N(0.8, 300, 0.4); break;
    case 'lsight': Tn('sawtooth', 900, 400, 0.3, 0.18); N(0.3, 3000, 0.25, true); break;
    case 'epain': Tn('sawtooth', 260, 160, 0.15, 0.22); break;
    case 'edeath': Tn('sawtooth', 240, 40, 0.55, 0.32); N(0.3, 600, 0.22); break;
    case 'bdeath': Tn('sawtooth', 120, 30, 1.2, 0.45); N(0.9, 400, 0.35); break;
    case 'gib': N(0.4, 900, 0.5); Tn('sine', 120, 50, 0.3, 0.3); break;
    case 'fireball': N(0.45, 900, 0.5, true); break;
    case 'fbhit': N(0.35, 700, 0.55); break;
    case 'boom': N(1.2, 700, 1.3); Tn('sine', 90, 28, 0.7, 0.7); break;
    case 'bite': N(0.12, 1600, 0.5); Tn('square', 120, 80, 0.1, 0.25); break;
    case 'claw': N(0.1, 3000, 0.4); break;
    case 'charge': N(0.5, 2000, 0.4, true); break;
    case 'switch': Tn('square', 300, 300, 0.05, 0.22); Tn('square', 200, 200, 0.06, 0.22, 0.07); break;
    case 'empty': Tn('square', 1200, 1200, 0.02, 0.08); break;
    case 'sizzle': N(0.25, 2400, 0.12, true); break;
  }
}
const RIFF = [40, 40, 40, 43, 40, 40, 45, 46, 40, 40, 40, 43, 40, 47, 46, 45, 38, 38, 38, 41, 38, 38, 43, 44, 36, 36, 36, 40, 36, 43, 42, 40];
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
function musicStep(i, t) {
  const note = RIFF[i % 32], accent = (i % 4) === 0;
  const shp = AC.createWaveShaper(); shp.curve = SHAPER;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  const g = AC.createGain(); g.gain.value = 0.5; shp.connect(lp).connect(g).connect(musBus);
  const dur = accent ? 0.12 : 0.08;
  aTone(t, 'sawtooth', midi(note), midi(note), dur, 0.6, shp);
  aTone(t, 'square', midi(note) * 1.498, midi(note) * 1.498, dur, 0.25, shp);
  if (i % 8 === 0 || i % 16 === 10) aTone(t, 'sine', 130, 40, 0.18, 0.85, musBus);
  if (i % 8 === 4) aNoise(t, 0.15, 1800, 0.45, true, musBus);
  if (i % 2 === 1) aNoise(t, 0.03, 7000, 0.08, true, musBus);
}
function startMusic() {
  if (!AC || musTimer || !musicOn) return;
  mNext = AC.currentTime + 0.1;
  musTimer = setInterval(() => { while (mNext < AC.currentTime + 0.25) { musicStep(mStep++, mNext); mNext += 0.11; } }, 60);
}
function stopMusic() { if (musTimer) { clearInterval(musTimer); musTimer = null; } }
