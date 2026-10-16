'use strict';
// Game loop, entities, monster AI, weapons, projectiles, particles and screens.

// ---------- definitions ----------
const AMMO_MAX = { bul: 200, shl: 50, rkt: 50, cel: 300 };
const WEAPONS = {
  fist: { slot: 1, ammo: null, cool: 0.5 },
  pistol: { slot: 2, ammo: 'bul', cool: 0.36 },
  shotgun: { slot: 3, ammo: 'shl', cool: 1.0 },
  chaingun: { slot: 4, ammo: 'bul', cool: 0.11 },
  launcher: { slot: 5, ammo: 'rkt', cool: 0.75 },
  plasma: { slot: 6, ammo: 'cel', cool: 0.085 },
};
const WORDER = ['fist', 'pistol', 'shotgun', 'chaingun', 'launcher', 'plasma'];
const DEF = {
  zombie: { mon: 1, hp: 20, speed: 1.4, r: 0.3, h: 0.875, pain: 0.78, size: 1.125, cool: [0.9, 1.6], ranged: { kind: 'bullet', n: 1, rate: 1.3 }, sight: 'zsight', drop: 'clip' },
  sergeant: { mon: 1, hp: 30, speed: 1.4, r: 0.3, h: 0.875, pain: 0.67, size: 1.125, cool: [1.2, 1.9], ranged: { kind: 'bullet', n: 3, rate: 1.1 }, sight: 'ssight', drop: 'shotgun' },
  imp: { mon: 1, hp: 60, speed: 1.5, r: 0.3, h: 0.875, pain: 0.78, size: 1.16, cool: [1.1, 1.7], melee: { range: 0.95, mul: 3, max: 8, snd: 'claw' }, ranged: { kind: 'proj', proj: 'fireball', rate: 1.1 }, sight: 'isight' },
  demon: { mon: 1, hp: 150, speed: 2.8, r: 0.42, h: 0.875, pain: 0.7, size: 1.15, cool: [0.5, 0.7], melee: { range: 0.95, mul: 4, max: 10, snd: 'bite' }, sight: 'dsight' },
  spectre: { mon: 1, hp: 150, speed: 2.8, r: 0.42, h: 0.875, pain: 0.7, size: 1.15, cool: [0.5, 0.7], melee: { range: 0.95, mul: 4, max: 10, snd: 'bite' }, sight: 'dsight', fuzz: 1 },
  lostsoul: { mon: 1, hp: 100, speed: 1.7, r: 0.27, h: 0.55, fly: 1, pain: 1, size: 0.78, cool: [1.3, 2.2], ranged: { kind: 'charge', rate: 1.2 }, sight: 'lsight', bright: 1, alt: 0.3 },
  caco: { mon: 1, hp: 400, speed: 1.3, r: 0.5, h: 0.875, fly: 1, pain: 0.5, size: 1.3, cool: [1.4, 2.2], melee: { range: 1.0, mul: 10, max: 6, snd: 'bite' }, ranged: { kind: 'proj', proj: 'cacoball', rate: 0.9 }, sight: 'csight', alt: 0.15 },
  baron: { mon: 1, hp: 1000, speed: 1.4, r: 0.38, h: 1.0, pain: 0.2, size: 1.42, cool: [1.2, 1.8], melee: { range: 1.0, mul: 10, max: 8, snd: 'claw' }, ranged: { kind: 'proj', proj: 'baronball', rate: 1.0 }, sight: 'bsight', death: 'bdeath' },
  barrel: { shoot: 1, block: 1, hp: 20, r: 0.28, h: 0.6, size: [0.62, 0.62] },
  lamp: { block: 1, r: 0.18, h: 1.2, size: [0.3, 1.2], bright: 1, halo: [0.5, 1.03, [1, 0.95, 0.8]] },
  torch: { block: 1, r: 0.18, h: 1.1, size: [0.27, 1.1], bright: 1, halo: [0.7, 0.85, [1, 0.45, 0.12]], flicker: 1 },
};
for (const k of ['clip', 'ammobox', 'shells', 'shellbox', 'rocket', 'rocketbox', 'cell', 'cellpack', 'stim', 'medikit', 'greenarmor', 'bluearmor']) DEF[k] = { item: 1, size: [0.5, 0.5] };
DEF.soulsphere = { item: 1, size: [0.55, 0.55], bright: 1, bob: 1 };
DEF.redkey = { item: 1, size: [0.45, 0.45], bright: 1, bob: 1 };
DEF.bluekey = { item: 1, size: [0.45, 0.45], bright: 1, bob: 1 };
for (const k of WSIDE) DEF[k] = { item: 1, size: [0.95, 0.475] };
const PROJ = {
  fireball: { speed: 6.5, mul: 3, max: 8, col: [1, 0.45, 0.12], size: 0.55, light: [1.4, 0.6, 0.2], lrad: 3.4, hit: 'fbhit' },
  cacoball: { speed: 5.5, mul: 5, max: 8, col: [1, 0.3, 0.75], size: 0.6, light: [1.3, 0.35, 0.9], lrad: 3.4, hit: 'fbhit' },
  baronball: { speed: 7.5, mul: 8, max: 8, col: [0.4, 1, 0.3], size: 0.6, light: [0.5, 1.4, 0.4], lrad: 3.6, hit: 'fbhit' },
  rocket: { speed: 15, mul: 20, max: 8, col: [1, 0.7, 0.3], size: 0.4, light: [1.5, 0.9, 0.4], lrad: 3.6, hit: 'boom', splash: 2.0, trail: 1 },
  plasma: { speed: 20, mul: 5, max: 8, col: [0.45, 0.7, 1], size: 0.4, light: [0.5, 0.8, 1.6], lrad: 3, hit: 'sizzle' },
};

// ---------- renderer ----------
const frameEl = document.getElementById('frame');
const glc = document.getElementById('gl'), ovc = document.getElementById('ov'), O = ovc.getContext('2d');
ovc.width = OW; ovc.height = OH;
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000);
const MAXSCALE = Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.75);
let pixScale = MAXSCALE;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1.9, 0.03, 160);
camera.rotation.order = 'YXZ';
const HFOV = 88 * Math.PI / 180;
function applyRes() {
  const gw = Math.max(1, frameEl.clientWidth), gh = Math.max(1, Math.round(frameEl.clientHeight * VIEWH / OH));
  renderer.setPixelRatio(pixScale); renderer.setSize(gw, gh, false);
  camera.aspect = gw / gh; camera.fov = 2 * Math.atan(Math.tan(HFOV / 2) / camera.aspect) * 180 / Math.PI;
  camera.updateProjectionMatrix();
  PSCALE.value = gh * pixScale / (2 * Math.tan(camera.fov * Math.PI / 360));
}
function fit() {
  const a = document.getElementById('app'), w = Math.min(a.clientWidth, a.clientHeight * 1.6);
  frameEl.style.width = Math.floor(w) + 'px'; frameEl.style.height = Math.floor(w / 1.6) + 'px';
  applyRes();
}

// ---------- particles ----------
const PSCALE = { value: 400 };
class Particles {
  constructor(max, additive) {
    this.max = max; this.n = 0;
    this.d = new Float32Array(max * 12); // x y z vx vy vz life life0 size grav r g ... (packed, see spawn)
    this.c = new Float32Array(max * 3);
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.sz = new Float32Array(max); this.al = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.ap = new THREE.BufferAttribute(this.pos, 3); this.ac = new THREE.BufferAttribute(this.col, 3);
    this.as = new THREE.BufferAttribute(this.sz, 1); this.aa = new THREE.BufferAttribute(this.al, 1);
    for (const a of [this.ap, this.ac, this.as, this.aa]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.ap); g.setAttribute('pcol', this.ac); g.setAttribute('psize', this.as); g.setAttribute('palpha', this.aa);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { scale: PSCALE },
      vertexShader: `attribute vec3 pcol; attribute float psize; attribute float palpha; uniform float scale; varying vec3 vC; varying float vA;
        void main(){ vC=pcol; vA=palpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(psize*scale/max(-mv.z,0.05),1.0,96.0); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.1,d)*vA; if(a<0.01) discard; gl_FragColor=vec4(vC,a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
    this.geo = g;
  }
  spawn(x, y, z, vx, vy, vz, r, g, b, size, life, grav = 0) {
    let i = this.n < this.max ? this.n++ : (Math.random() * this.max) | 0;
    const d = this.d, k = i * 12;
    d[k] = x; d[k + 1] = y; d[k + 2] = z; d[k + 3] = vx; d[k + 4] = vy; d[k + 5] = vz; d[k + 6] = life; d[k + 7] = life; d[k + 8] = size; d[k + 9] = grav;
    this.c[i * 3] = r; this.c[i * 3 + 1] = g; this.c[i * 3 + 2] = b;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
  update(dt) {
    const d = this.d;
    for (let i = 0; i < this.n; i++) {
      const k = i * 12;
      d[k + 6] -= dt;
      if (d[k + 6] <= 0) {
        const last = (this.n - 1) * 12;
        for (let j = 0; j < 12; j++) d[k + j] = d[last + j];
        this.c[i * 3] = this.c[(this.n - 1) * 3]; this.c[i * 3 + 1] = this.c[(this.n - 1) * 3 + 1]; this.c[i * 3 + 2] = this.c[(this.n - 1) * 3 + 2];
        this.n--; i--; continue;
      }
      d[k + 5] -= d[k + 9] * dt;
      d[k] += d[k + 3] * dt; d[k + 1] += d[k + 4] * dt; d[k + 2] += d[k + 5] * dt;
      if (d[k + 9] > 0) {
        const c = cell(d[k], d[k + 1]);
        if (!c.solid && d[k + 2] < c.f + 0.01) { d[k + 2] = c.f + 0.01; d[k + 5] *= -0.25; d[k + 3] *= 0.5; d[k + 4] *= 0.5; }
      }
    }
    for (let i = 0; i < this.n; i++) {
      const k = i * 12, t = d[k + 6] / d[k + 7];
      this.pos[i * 3] = d[k]; this.pos[i * 3 + 1] = d[k + 2]; this.pos[i * 3 + 2] = d[k + 1];
      this.col[i * 3] = this.c[i * 3]; this.col[i * 3 + 1] = this.c[i * 3 + 1]; this.col[i * 3 + 2] = this.c[i * 3 + 2];
      this.sz[i] = d[k + 8] * (0.6 + 0.4 * t); this.al[i] = Math.min(1, t * 1.6);
    }
    for (const a of [this.ap, this.ac, this.as, this.aa]) a.needsUpdate = true;
    this.geo.setDrawRange(0, this.n);
  }
}
const PFX = new Particles(1400, true), PDK = new Particles(900, false);
scene.add(PFX.points); scene.add(PDK.points);
function bloodBurst(x, y, z, n) { for (let i = 0; i < n; i++) PDK.spawn(x, y, z, rr(-1.6, 1.6), rr(-1.6, 1.6), rr(0, 2.6), rr(0.4, 0.6), 0, 0, rr(0.05, 0.1), rr(0.5, 1.1), 9); }
function puff(x, y, z) {
  for (let i = 0; i < 4; i++) PFX.spawn(x, y, z, rr(-1.5, 1.5), rr(-1.5, 1.5), rr(0, 2), 1, rr(0.6, 0.9), 0.3, 0.04, rr(0.15, 0.3), 6);
  for (let i = 0; i < 3; i++) PDK.spawn(x, y, z, rr(-0.2, 0.2), rr(-0.2, 0.2), rr(0.2, 0.6), 0.55, 0.53, 0.5, 0.12, rr(0.4, 0.7));
}
function fireBurst(x, y, z, col, n, spd, size) { for (let i = 0; i < n; i++) { const a = rr(0, TAU), e = rr(-1, 1), s = rr(0.3, 1) * spd; PFX.spawn(x, y, z, Math.cos(a) * s, Math.sin(a) * s, e * s, col[0], col[1] * rr(0.7, 1), col[2], size * rr(0.6, 1.3), rr(0.25, 0.6)); } }

// ---------- state ----------
let LV = null, levelIndex = 0, worldGroup = null, sky = null, things = [], projs = [], tlights = [], halos = [];
let state = 'title', stateT = 0, showMap = false, fireHeld = false, levelTime = 0, totalKills = 0, totalItems = 0, gtime = 0;
const P = { x: 0, y: 0, z: 0, a: 0, r: PR, h: PH, isPlayer: true };
function freshLoadout() { return { health: 100, armor: 0, armorType: 0, ammo: { bul: 50, shl: 0, rkt: 0, cel: 0 }, has: { fist: 1, pistol: 1 }, w: 'pistol' }; }
function saveLoadout() { return { health: P.health, armor: P.armor, armorType: P.armorType, ammo: { ...P.ammo }, has: { ...P.has }, w: P.w }; }
let startLoadout = freshLoadout();

const PLANE = new THREE.PlaneGeometry(1, 1); PLANE.translate(0, 0.5, 0);
const SHADOW_GEO = new THREE.PlaneGeometry(1, 1); SHADOW_GEO.rotateX(-Math.PI / 2);
let SHADOW_MAT = null, PMAT = {}, CORE_MAT = null;

function spawn(type, x, y, extra) {
  const d = DEF[type] || SPR[type] && { item: 1, size: [0.5, 0.5] };
  if (!d) { console.warn('unknown thing', type); return null; }
  const c = cell(x, y);
  if (c.solid) console.warn('thing inside a wall', type, x, y);
  const t = { type, d, x, y, z: c.f, vz: 0, floorZ: c.f, r: d.r || 0.25, h: d.h || 0.5, hp: d.hp || 0, state: 'idle', timer: 0, cool: rr(0.5, 1.5), anim: rr(0, 1), dir: 0, think: rr(0, 0.4), seeT: 0, sees: false, flashT: 0, hitFlash: 0, target: null, fly: !!d.fly };
  if (t.fly) t.z = c.f + 0.4;
  Object.assign(t, extra);
  things.push(t);
  return t;
}
function attachMesh(t) {
  const d = t.d, S = SPR[t.type];
  const tex = d.mon ? S.walk[0] : S;
  t.mat = spriteMat(tex, { bright: d.bright, fuzz: d.fuzz });
  t.mesh = new THREE.Mesh(PLANE, t.mat);
  const sz = d.mon ? [d.size, d.size] : d.size;
  t.mesh.scale.set(sz[0], sz[1], 1);
  worldGroup.add(t.mesh);
  if (d.mon || d.item || t.type === 'barrel') {
    t.shadow = new THREE.Mesh(SHADOW_GEO, SHADOW_MAT);
    const s = (d.mon ? t.r * 2.6 : 0.5);
    t.shadow.scale.set(s, 1, s); t.shadow.renderOrder = 1;
    worldGroup.add(t.shadow);
  }
  if (d.halo) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: SPR.glow, color: new THREE.Color(...d.halo[2]), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55, fog: false }));
    m.scale.set(d.halo[0], d.halo[0], 1); m.position.set(t.x, t.z + d.halo[1], t.y);
    worldGroup.add(m); halos.push({ m, t, base: d.halo[0] });
  }
}
function removeThing(t) {
  t.remove = true;
  if (t.mesh) { worldGroup.remove(t.mesh); t.mat.dispose(); t.mesh = null; }
  if (t.shadow) { worldGroup.remove(t.shadow); t.shadow = null; }
}

function disposeWorld() {
  if (!worldGroup) return;
  worldGroup.traverse(o => { if (o.geometry && o.geometry !== PLANE && o.geometry !== SHADOW_GEO) o.geometry.dispose(); if (o.material && o.material.isSpriteMaterial && o.material.map === SPR.glow && !Object.values(PMAT).includes(o.material) && o.material !== CORE_MAT) o.material.dispose(); });
  for (const t of things) if (t.mat) t.mat.dispose();
  scene.remove(worldGroup); worldGroup = null;
}
function loadLevel(i, loadout) {
  disposeWorld();
  if (sky) { scene.remove(sky); sky.material.map.dispose(); sky.material.dispose(); sky = null; }
  LV = LEVELS[i]; levelIndex = i;
  parseLevel(LV);
  things = []; projs = []; tlights = []; halos = []; PFX.clear(); PDK.clear();
  totalKills = 0; totalItems = 0;
  for (const [ch, x, y] of LV.things) {
    const type = THING_CHARS[ch];
    if (!type) { console.warn('unknown thing char', ch); continue; }
    const t = spawn(type, x + 0.5, y + 0.5);
    if (!t) continue;
    if (t.d.mon) { totalKills++; t.counted = true; }
    if (t.d.item) { totalItems++; t.counted = true; }
  }
  worldGroup = buildWorld(LV, things);
  scene.add(worldGroup);
  for (const t of things) attachMesh(t);
  sky = makeSkyMesh(makeSky(LV.sky)); scene.add(sky);
  SU.fogCol.value.set(...LV.fog); SU.fogDen.value = LV.fogDen;
  MAT.exitsw && (MAT.exitsw.uniforms.map.value = TEX.exitsw.map);
  if (loadout) Object.assign(P, JSON.parse(JSON.stringify(loadout)));
  startLoadout = saveLoadout();
  const c = cellAt(LV.start[0], LV.start[1]);
  Object.assign(P, {
    x: LV.start[0] + 0.5, y: LV.start[1] + 0.5, z: c.f, floorZ: c.f, vz: 0, vx: 0, vy: 0, a: LV.start[2], keys: {}, dead: false,
    kills: 0, items: 0, hurt: 0, bonus: 0, msg: '', msgT: 0, wcool: 0, refire: false, stepLag: 0, bob: 0, moveAmt: 0,
    ouchT: 0, grinT: 0, lookDir: 0, lookT: 0, liqT: 1, shake: 0, deathT: 0, pendingW: null, seenT: 0,
    wst: { bx: 0, by: 0, drop: 160, fire: 0, flash: 0, pump: 0, pumpT: -1, spin: 0, spinV: 0, alt: false, loaded: true, t: 0 },
  });
  if (!P.has[P.w]) P.w = 'pistol';
  levelTime = 0; showMap = false;
}

// ---------- movement & collision ----------
const SI = { maxF: 0, minF: 0, minC: 0 };
function standInfo(e, nx, ny) {
  const r = e.r; let maxF = -1e9, minF = 1e9, minC = 1e9;
  const x0 = Math.floor(nx - r), x1 = Math.floor(nx + r), y0 = Math.floor(ny - r), y1 = Math.floor(ny + r);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const c = cellAt(cx, cy); if (c.solid) return null;
    if (c.f > maxF) maxF = c.f; if (c.f < minF) minF = c.f;
    const ce = ceilOf(c); if (ce < minC) minC = ce;
  }
  SI.maxF = maxF; SI.minF = minF; SI.minC = minC; return SI;
}
const blocksT = o => !o.remove && (o.d.block || (o.d.mon && !o.dead));
function canMoveTo(e, nx, ny) {
  const s = standInfo(e, nx, ny); if (!s) return false;
  if (e.fly && !e.dead) { if (s.maxF > e.z + 0.01 || s.minC < e.z + e.h) return false; }
  else {
    if (s.maxF > e.z + STEP) return false;
    if (s.minC - Math.max(e.z, s.maxF) < e.h) return false;
    if (e.d && e.d.mon && (s.maxF - s.minF > STEP || s.maxF < e.z - STEP)) return false;
  }
  const hit = o => {
    if (e.z >= o.z + o.h || o.z >= e.z + e.h) return false;
    const dx = o.x - nx, dy = o.y - ny, rr2 = (e.r + o.r) * (e.r + o.r), d2 = dx * dx + dy * dy;
    return d2 < rr2 && d2 < (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
  };
  for (const o of things) if (o !== e && blocksT(o) && hit(o)) return false;
  if (e !== P && !P.dead && hit(P)) return false;
  return true;
}
function tryMove(e, nx, ny) {
  if (!canMoveTo(e, nx, ny)) return false;
  standInfo(e, nx, ny);
  e.x = nx; e.y = ny; e.floorZ = SI.maxF;
  if (!(e.fly && !e.dead) && e.z < SI.maxF) { if (e === P) P.stepLag -= SI.maxF - e.z; e.z = SI.maxF; }
  return true;
}
function gravity(e, dt) {
  const s = standInfo(e, e.x, e.y);
  if (s) { e.floorZ = s.maxF; e.ceilZ = s.minC; }
  if (e.fly && !e.dead) return;
  if (e.z > e.floorZ + 0.001) {
    e.vz -= 16 * dt; e.z += e.vz * dt;
    if (e.z <= e.floorZ) { const hard = e.vz < -4; e.z = e.floorZ; e.vz = 0; if (e === P && hard) { sfx('land'); P.stepLag -= 0.12; } }
  } else { e.z = e.floorZ; e.vz = 0; }
}
function sightLine(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, n = Math.ceil(Math.hypot(dx, dy) / 0.15);
  for (let i = 1; i < n; i++) {
    const t = i / n, c = cell(ax + dx * t, ay + dy * t), z = az + dz * t;
    if (c.solid || z < c.f || z > ceilOf(c)) return false;
  }
  return true;
}
const canSee = (a, b) => sightLine(a.x, a.y, a.z + a.h * 0.8, b.x, b.y, b.z + b.h * 0.6);

// ---------- doors ----------
function doorBusy(d) {
  const inside = e => e.x + e.r > d.x && e.x - e.r < d.x + 1 && e.y + e.r > d.y && e.y - e.r < d.y + 1;
  if (!P.dead && inside(P)) return true;
  for (const t of things) if (t.d.mon && !t.dead && inside(t)) return true;
  return false;
}
function openDoor(d, byPlayer) {
  if (d.key && !(byPlayer && P.keys[d.key])) {
    if (byPlayer) { say(d.key === 'red' ? 'צריך את המפתח האדום כדי לפתוח את הדלת הזו' : 'צריך את המפתח הכחול כדי לפתוח את הדלת הזו'); sfx('locked'); }
    return false;
  }
  if (d.state === 0 || d.state === 3) { d.state = 1; sfx('door', d.x + 0.5, d.y + 0.5); }
  else if (d.state === 2) d.timer = 4;
  return true;
}
function updateDoors(dt) {
  for (const d of WD.doors) {
    if (d.state === 1) { d.cur = Math.min(d.top, d.cur + dt * 2.4); if (d.cur >= d.top) { d.state = 2; d.timer = 4; sfx('doorstop', d.x + 0.5, d.y + 0.5); } }
    else if (d.state === 2) { d.timer -= dt; if (d.timer <= 0) { if (doorBusy(d)) d.timer = 0.8; else { d.state = 3; sfx('door', d.x + 0.5, d.y + 0.5); } } }
    else if (d.state === 3) {
      if (doorBusy(d)) d.state = 1;
      else { d.cur = Math.max(d.f, d.cur - dt * 2.4); if (d.cur <= d.f) { d.state = 0; sfx('doorstop', d.x + 0.5, d.y + 0.5); } }
    }
    d.mesh.position.y = d.cur - d.f;
  }
}
function useAction() {
  if (P.dead) return;
  const ca = Math.cos(P.a), sa = Math.sin(P.a);
  for (let s = 0.2; s <= 1.8; s += 0.05) {
    const c = cell(P.x + ca * s, P.y + sa * s);
    if (c.door) { if (c.door.cur - c.door.f >= PH) continue; openDoor(c.door, true); return; }
    if (c.solid) { if (c.exit) exitLevel(); else sfx('oof'); return; }
    if (c.f > P.z + STEP) { sfx('oof'); return; }
  }
  sfx('oof');
}
function exitLevel() {
  if (state !== 'play') return;
  MAT.exitsw.uniforms.map.value = TEX.exitswOn.map;
  sfx('switch'); state = 'exiting'; stateT = 1.0;
}

// ---------- combat ----------
const roll = pd => pd.mul * ri(1, pd.max);
const isShootable = t => !t.remove && ((t.d.mon && !t.dead) || (t.d.shoot && t.boom === undefined));
function say(m) { P.msg = m; P.msgT = 2.8; }
function addLight(x, y, z, col, rad, life) { tlights.push({ x, y, z, col, rad, life, life0: life }); }
function traceWall(ox, oy, oz, dx, dy, slope, range) {
  for (let s = 0.05; s < range; s += 0.04) {
    const x = ox + dx * s, y = oy + dy * s, z = oz + slope * s, c = cell(x, y);
    if (c.solid || z < c.f) return [s, false];
    if (z > ceilOf(c)) return [s, c.sky && !c.door];
  }
  return [range, true];
}
function hitscan(src, ox, oy, oz, ang, slope, range, dmg, puffs = true) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const [wd, skyHit] = traceWall(ox, oy, oz, dx, dy, slope, range);
  let best = null, bd = wd;
  const test = t => {
    const rx = t.x - ox, ry = t.y - oy, al = rx * dx + ry * dy;
    if (al <= 0 || al >= bd || Math.abs(rx * dy - ry * dx) > t.r) return;
    const zz = oz + slope * al; if (zz < t.z || zz > t.z + t.h) return;
    best = t; bd = al;
  };
  for (const t of things) if (t !== src && isShootable(t)) test(t);
  if (src !== P && !P.dead) test(P);
  const hx = ox + dx * bd, hy = oy + dy * bd, hz = oz + slope * bd;
  if (best) { damage(best, dmg, src); if (best !== P && best.d.mon) bloodBurst(hx, hy, hz, 7); else if (best !== P) puff(hx, hy, hz); }
  else if (puffs && !skyHit && wd < range) puff(ox + dx * (bd - 0.05), oy + dy * (bd - 0.05), hz);
  return best;
}
function autoaim(ang, range) {
  let best = null, bd = range;
  for (const t of things) {
    if (!t.d.mon || t.dead || t.remove) continue;
    const rx = t.x - P.x, ry = t.y - P.y, d = Math.hypot(rx, ry);
    if (d >= bd) continue;
    if (Math.abs(normA(Math.atan2(ry, rx) - ang)) > Math.max(0.05, Math.atan2(t.r * 1.15, d))) continue;
    if (!sightLine(P.x, P.y, P.z + 0.5, t.x, t.y, t.z + t.h * 0.5)) continue;
    best = t; bd = d;
  }
  return best ? clamp((best.z + best.h * 0.5 - (P.z + 0.5)) / bd, -1.2, 1.2) : 0;
}
function damage(t, amt, src) {
  amt = Math.round(amt);
  if (t === P) { hurtPlayer(amt, src); return; }
  if (t.d.shoot) { t.hp -= amt; if (t.hp <= 0 && t.boom === undefined) { t.boom = rr(0.1, 0.2); t.boomSrc = src; } return; }
  if (!t.d.mon || t.dead) return;
  t.hp -= amt; t.hitFlash = 0.1;
  if (t.hp <= 0) { kill(t); return; }
  if (src && src !== P && src.d && src.d.mon && !src.dead && src.type !== t.type) t.target = src;
  if (t.state === 'idle') wake(t, true);
  if (Math.random() < t.d.pain && t.state !== 'charge') { t.state = 'pain'; t.timer = 0.22; sfx('epain', t.x, t.y); }
}
function kill(t) {
  t.dead = true; t.state = 'die'; t.timer = 0; t.hitFlash = 0; t.fly = false;
  if (t.counted) P.kills++;
  sfx(t.d.death || 'edeath', t.x, t.y);
  bloodBurst(t.x, t.y, t.z + t.h * 0.6, 14);
  if (t.type === 'lostsoul') { fireBurst(t.x, t.y, t.z + 0.3, [1, 0.6, 0.2], 30, 3, 0.25); addLight(t.x, t.y, t.z + 0.3, [1.6, 0.8, 0.3], 4, 0.4); removeThing(t); return; }
  if (t.d.drop) {
    const type = t.d.drop === 'shotgun' && P.has.shotgun ? 'shells' : t.d.drop;
    const it = spawn(type, t.x + rr(-0.15, 0.15), t.y + rr(-0.15, 0.15), { dropped: true });
    if (it) attachMesh(it);
  }
}
function hurtPlayer(amt, src) {
  if (P.dead || state !== 'play') return;
  if (P.armor > 0) {
    let saved = P.armorType === 2 ? Math.floor(amt / 2) : Math.floor(amt / 3);
    if (saved >= P.armor) { saved = P.armor; P.armorType = 0; }
    P.armor -= saved; amt -= saved;
  }
  P.health -= amt; P.hurt = Math.min(0.85, P.hurt + amt / 30); P.ouchT = amt > 20 ? 0.9 : 0.5; P.shake = Math.min(0.6, P.shake + amt / 50);
  if (src && src !== P) { const rel = normA(Math.atan2(src.y - P.y, src.x - P.x) - P.a); P.lookDir = Math.abs(rel) < 0.5 ? 0 : rel > 0 ? 1 : -1; P.lookT = 0.9; }
  if (P.health <= 0) { P.health = 0; P.dead = true; state = 'dying'; stateT = 1.8; sfx('pdeath'); }
  else sfx('hurt');
}
function radiusDamage(x, y, z, R, maxD, src) {
  const list = things.filter(isShootable); if (!P.dead) list.push(P);
  for (const t of list) {
    const dd = Math.max(Math.max(0, Math.hypot(t.x - x, t.y - y) - t.r), Math.max(0, Math.abs(t.z + t.h / 2 - z) - t.h / 2));
    if (dd >= R || !sightLine(x, y, z, t.x, t.y, t.z + t.h * 0.5)) continue;
    damage(t, maxD * (1 - dd / R), src);
  }
}
function explosion(x, y, z, big) {
  fireBurst(x, y, z, [1, 0.55, 0.15], big ? 70 : 24, big ? 4.5 : 2.5, big ? 0.45 : 0.25);
  for (let i = 0; i < (big ? 18 : 6); i++) PDK.spawn(x, y, z, rr(-0.8, 0.8), rr(-0.8, 0.8), rr(0.3, 1.4), 0.2, 0.18, 0.16, rr(0.3, 0.6), rr(0.8, 1.5));
  addLight(x, y, z, big ? [2.4, 1.4, 0.5] : [1.4, 0.8, 0.3], big ? 7 : 4, big ? 0.6 : 0.3);
  if (big) { sfx('boom', x, y); const d = Math.hypot(P.x - x, P.y - y); P.shake = Math.min(0.9, P.shake + Math.max(0, 0.6 - d * 0.08)); }
}
function spawnProj(kind, src, x, y, z, dx, dy, dz) {
  const pd = PROJ[kind], l = Math.hypot(dx, dy, dz) || 1;
  if (!PMAT[kind]) PMAT[kind] = new THREE.SpriteMaterial({ map: SPR.glow, color: new THREE.Color(...pd.col), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  const p = { kind, pd, src, x, y, z, vx: dx / l * pd.speed, vy: dy / l * pd.speed, vz: dz / l * pd.speed, life: 6, r: 0.12 };
  p.spr = new THREE.Sprite(PMAT[kind]); p.spr.scale.set(pd.size, pd.size, 1);
  p.core = new THREE.Sprite(CORE_MAT); p.core.scale.set(pd.size * 0.4, pd.size * 0.4, 1);
  worldGroup.add(p.spr); worldGroup.add(p.core);
  projs.push(p);
}
function killProj(p) { p.dead = true; worldGroup.remove(p.spr); worldGroup.remove(p.core); }
function burstProj(p) {
  const pd = p.pd;
  if (pd.splash) { explosion(p.x, p.y, p.z, true); radiusDamage(p.x, p.y, p.z, pd.splash, 128, p.src); }
  else { fireBurst(p.x, p.y, p.z, pd.col, 16, 2.2, 0.22); addLight(p.x, p.y, p.z, pd.light, pd.lrad, 0.25); sfx(pd.hit, p.x, p.y); }
  killProj(p);
}
function updateProj(p, dt) {
  const steps = Math.max(1, Math.ceil(p.pd.speed * dt / 0.1)), sd = dt / steps;
  for (let i = 0; i < steps; i++) {
    const nx = p.x + p.vx * sd, ny = p.y + p.vy * sd, nz = p.z + p.vz * sd, c = cell(nx, ny);
    if (c.solid || nz < c.f || nz > ceilOf(c)) {
      if (!c.solid && c.sky && !c.door && nz > c.c) { killProj(p); return; }
      burstProj(p); return;
    }
    p.x = nx; p.y = ny; p.z = nz;
    for (const t of things) {
      if (t === p.src || !isShootable(t)) continue;
      if (Math.hypot(t.x - p.x, t.y - p.y) > t.r + p.r || p.z < t.z || p.z > t.z + t.h) continue;
      if (t.d.mon && p.src.d && p.src.d.mon && t.type === p.src.type) continue;
      damage(t, roll(p.pd), p.src); burstProj(p); return;
    }
    if (p.src !== P && !P.dead && Math.hypot(P.x - p.x, P.y - p.y) < P.r + p.r && p.z >= P.z && p.z <= P.z + P.h) { damage(P, roll(p.pd), p.src); burstProj(p); return; }
  }
  p.life -= dt; if (p.life <= 0) { killProj(p); return; }
  if (p.pd.trail) { PDK.spawn(p.x, p.y, p.z, rr(-0.1, 0.1), rr(-0.1, 0.1), rr(0.1, 0.4), 0.5, 0.48, 0.45, 0.2, 0.8); PFX.spawn(p.x, p.y, p.z, 0, 0, 0, 1, 0.6, 0.2, 0.18, 0.12); }
  else if (Math.random() < 0.6) PFX.spawn(p.x, p.y, p.z, rr(-0.3, 0.3), rr(-0.3, 0.3), rr(-0.3, 0.3), p.pd.col[0], p.pd.col[1], p.pd.col[2], 0.14, 0.25);
  p.spr.position.set(p.x, p.z, p.y); p.core.position.set(p.x, p.z, p.y);
}

// ---------- monsters ----------
function wake(t, loud) { if (t.state !== 'idle') return; t.state = 'chase'; t.think = 0; t.cool = rr(0.4, 1.0); if (loud) sfx(t.d.sight, t.x, t.y); }
function alertMonsters() {
  for (const t of things) {
    if (!t.d.mon || t.dead || t.state !== 'idle') continue;
    const d = Math.hypot(t.x - P.x, t.y - P.y);
    if (d < 9 || (d < 18 && canSee(t, P))) wake(t, true);
  }
}
const SNAP = a => Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
function chooseDir(t, tg) {
  const base = Math.atan2(tg.y - t.y, tg.x - t.x), s = Math.random() < 0.5 ? 1 : -1, q = Math.PI / 4;
  const cands = [SNAP(base), SNAP(base + s * q), SNAP(base - s * q), SNAP(base + s * 2 * q), SNAP(base - s * 2 * q), SNAP(base + s * 3 * q), SNAP(base + Math.PI)];
  if (Math.random() < 0.18) cands.unshift(cands.splice(1, 1)[0]);
  for (const a of cands) {
    const px = t.x + Math.cos(a) * 0.4, py = t.y + Math.sin(a) * 0.4;
    if (canMoveTo(t, px, py)) { t.dir = a; return; }
    const c = cell(px, py);
    if (c.door && !c.door.key) { openDoor(c.door, false); t.dir = a; return; }
  }
  t.dir = SNAP(base + Math.PI);
}
function targetOf(t) {
  if (t.target && (t.target.dead || t.target.remove)) t.target = null;
  if (t.target) return t.target;
  return P.dead ? null : P;
}
function startAttack(t, kind) { t.state = 'attack'; t.akind = kind; t.fired = false; t.timer = kind === 'melee' ? 0.45 : 0.55; }
function doAttack(t, tg) {
  const d = t.d, dist = Math.hypot(tg.x - t.x, tg.y - t.y);
  if (t.akind === 'melee') {
    if (dist < d.melee.range + tg.r + 0.25 && Math.abs(tg.z - t.z) < 1) { sfx(d.melee.snd, t.x, t.y); damage(tg, d.melee.mul * ri(1, d.melee.max), t); }
    return;
  }
  const r = d.ranged, oz = t.z + t.h * 0.65, slope = (tg.z + tg.h * 0.5 - oz) / Math.max(dist, 0.1), ang = Math.atan2(tg.y - t.y, tg.x - t.x);
  if (r.kind === 'bullet') {
    t.flashT = 0.12; addLight(t.x, t.y, oz, [1.3, 0.9, 0.4], 4, 0.08);
    sfx(r.n > 1 ? 'shotgun' : 'pistol', t.x, t.y);
    for (let i = 0; i < r.n; i++) hitscan(t, t.x, t.y, oz, ang + rr(-0.09, 0.09), slope, 40, 3 * ri(1, 5));
  } else if (r.kind === 'proj') {
    spawnProj(r.proj, t, t.x + Math.cos(ang) * (t.r + 0.1), t.y + Math.sin(ang) * (t.r + 0.1), oz, Math.cos(ang), Math.sin(ang), slope);
    sfx('fireball', t.x, t.y); t.flashT = 0.15;
  }
}
function updateMonster(t, dt) {
  const d = t.d; t.anim += dt;
  if (t.flashT > 0) t.flashT -= dt; if (t.hitFlash > 0) t.hitFlash -= dt;
  gravity(t, dt);
  if (t.dead) { if (t.state === 'die') { t.timer += dt; if (t.timer > 0.5) t.state = 'dead'; } return; }
  if (t.state === 'idle') {
    t.think -= dt;
    if (t.think <= 0) { t.think = rr(0.3, 0.55); if (!P.dead && Math.hypot(P.x - t.x, P.y - t.y) < 26 && canSee(t, P)) wake(t, true); }
    return;
  }
  const tg = targetOf(t);
  if (!tg) return;
  if (t.state === 'pain') { t.timer -= dt; if (t.timer <= 0) t.state = 'chase'; return; }
  if (t.state === 'attack') {
    t.timer -= dt;
    if (!t.fired && t.timer <= 0.22) { t.fired = true; doAttack(t, tg); }
    if (t.timer <= 0) { t.state = 'chase'; t.cool = rr(d.cool[0], d.cool[1]); }
    return;
  }
  if (t.state === 'charge') { updateCharge(t, tg, dt); return; }
  t.cool -= dt; t.seeT -= dt;
  if (t.seeT <= 0) { t.seeT = 0.2; t.sees = canSee(t, tg); }
  const dx = tg.x - t.x, dy = tg.y - t.y, dist = Math.hypot(dx, dy);
  if (t.sees && t.cool <= 0) {
    if (d.melee && dist < d.melee.range + tg.r && Math.abs(tg.z - t.z) < 0.9) { startAttack(t, 'melee'); return; }
    if (d.ranged && dist > 1.2 && dist < 30 && Math.random() < dt * d.ranged.rate * (dist < 8 ? 1.5 : 0.8)) {
      if (d.ranged.kind === 'charge') { startCharge(t, tg); return; }
      startAttack(t, 'ranged'); return;
    }
  }
  if (t.fly) {
    const want = tg.z + (d.alt || 0), s = standInfo(t, t.x, t.y);
    let nz = t.z + clamp(want - t.z, -1.2 * dt, 1.2 * dt);
    if (s) nz = clamp(nz, s.maxF, s.minC - t.h);
    t.z = nz;
  }
  t.think -= dt;
  if (t.think <= 0 || t.blocked) { chooseDir(t, tg); t.think = rr(0.35, 0.8); t.blocked = false; }
  if (dist < (d.melee ? d.melee.range * 0.75 + tg.r : 1.1)) return;
  const sp = d.speed * dt, mx = Math.cos(t.dir) * sp, my = Math.sin(t.dir) * sp;
  if (!tryMove(t, t.x + mx, t.y + my) && !tryMove(t, t.x + mx, t.y) && !tryMove(t, t.x, t.y + my)) t.blocked = true;
}
function startCharge(t, tg) {
  const dx = tg.x - t.x, dy = tg.y - t.y, dz = tg.z + tg.h * 0.5 - (t.z + t.h * 0.5), l = Math.hypot(dx, dy, dz) || 1;
  t.cv = [dx / l * 9, dy / l * 9, dz / l * 9]; t.state = 'charge'; t.timer = 1.1; sfx('charge', t.x, t.y);
}
function updateCharge(t, tg, dt) {
  t.timer -= dt;
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const nx = t.x + t.cv[0] * dt / steps, ny = t.y + t.cv[1] * dt / steps;
    const hitT = (Math.hypot(tg.x - nx, tg.y - ny) < t.r + tg.r + 0.05 && t.z < tg.z + tg.h && tg.z < t.z + t.h);
    if (hitT) { sfx('bite', t.x, t.y); damage(tg, 3 * ri(1, 8), t); t.state = 'chase'; t.cool = rr(1.2, 2); return; }
    const s = standInfo(t, nx, ny);
    const nz = t.z + t.cv[2] * dt / steps;
    if (!s || nz < s.maxF || nz + t.h > s.minC || !canMoveTo(t, nx, ny)) { t.state = 'chase'; t.cool = rr(1, 1.8); return; }
    t.x = nx; t.y = ny; t.z = nz;
  }
  if (t.timer <= 0) { t.state = 'chase'; t.cool = rr(1, 1.8); }
}
function monsterFrame(t) {
  const S = SPR[t.type];
  if (t.state === 'die') return S.die[t.timer < 0.18 ? 0 : 1];
  if (t.state === 'dead') return S.dead;
  if (t.state === 'pain') return S.pain;
  if (t.flashT > 0) return S.fire;
  if (t.state === 'attack' || t.state === 'charge') return S.atk;
  if (t.state === 'chase') return S.walk[((t.anim * 5) | 0) & 1];
  return S.walk[0];
}

// ---------- player ----------
const keys = {}, touchIn = { fwd: 0, str: 0 };
function pickup(t) {
  const a = P.ammo, add = (k, n) => { if (a[k] >= AMMO_MAX[k]) return false; a[k] = Math.min(AMMO_MAX[k], a[k] + n); return true; };
  let m = '', snd = 'pickup';
  const weapon = (w, k, n, name) => { const isNew = !P.has[w]; P.has[w] = 1; add(k, n); if (isNew) { P.pendingW = w; P.grinT = 1.6; } m = name; snd = 'weapon'; return true; };
  let ok;
  switch (t.type) {
    case 'clip': ok = add('bul', t.dropped ? 5 : 10); m = 'אספת מחסנית'; break;
    case 'ammobox': ok = add('bul', 50); m = 'אספת ארגז כדורים'; break;
    case 'shells': ok = add('shl', 4); m = 'אספת 4 פגזים'; break;
    case 'shellbox': ok = add('shl', 20); m = 'אספת ארגז פגזים'; break;
    case 'rocket': ok = add('rkt', 1); m = 'אספת טיל'; break;
    case 'rocketbox': ok = add('rkt', 5); m = 'אספת ארגז טילים'; break;
    case 'cell': ok = add('cel', 20); m = 'אספת תא אנרגיה'; break;
    case 'cellpack': ok = add('cel', 100); m = 'אספת חבילת אנרגיה'; break;
    case 'stim': ok = P.health < 100; if (ok) P.health = Math.min(100, P.health + 10); m = 'אספת זריקת מרץ'; break;
    case 'medikit': ok = P.health < 100; if (ok) { m = P.health < 25 ? 'ערכת עזרה ראשונה. בדיוק בזמן.' : 'אספת ערכת עזרה ראשונה'; P.health = Math.min(100, P.health + 25); } break;
    case 'soulsphere': ok = true; P.health = Math.min(200, P.health + 100); m = 'כדור הנשמה!'; snd = 'power'; break;
    case 'greenarmor': ok = P.armor < 100; if (ok) { P.armor = 100; P.armorType = 1; } m = 'אספת שריון'; break;
    case 'bluearmor': ok = P.armor < 200; if (ok) { P.armor = 200; P.armorType = 2; } m = 'אספת שריון-על!'; snd = 'power'; break;
    case 'redkey': ok = true; P.keys.red = 1; m = 'אספת את המפתח האדום'; break;
    case 'bluekey': ok = true; P.keys.blue = 1; m = 'אספת את המפתח הכחול'; break;
    case 'shotgun': ok = weapon('shotgun', 'shl', t.dropped ? 4 : 8, 'מצאת רובה ציד!'); break;
    case 'chaingun': ok = weapon('chaingun', 'bul', 20, 'מצאת מקלע!'); break;
    case 'launcher': ok = weapon('launcher', 'rkt', 2, 'מצאת משגר טילים!'); break;
    case 'plasma': ok = weapon('plasma', 'cel', 40, 'מצאת רובה פלזמה!'); break;
  }
  if (!ok) return false;
  say(m); P.bonus = 0.45; sfx(snd);
  if (t.counted) P.items++;
  return true;
}
function selectWeapon(w) { if (P.has[w] && !P.dead && (P.w !== w || P.pendingW)) P.pendingW = w === P.w ? null : w; }
function bestWeapon() {
  const a = P.ammo;
  for (const [w, k] of [['plasma', 'cel'], ['chaingun', 'bul'], ['shotgun', 'shl'], ['pistol', 'bul']]) if (P.has[w] && a[k] > 0) return w;
  return 'fist';
}
function fireWeapon() {
  const w = WEAPONS[P.w], st = P.wst;
  if (w.ammo && P.ammo[w.ammo] < 1) { sfx('empty'); const b = bestWeapon(); if (b !== P.w) selectWeapon(b); P.wcool = 0.35; return; }
  if (w.ammo) P.ammo[w.ammo]--;
  P.wcool = w.cool; st.fire = 1;
  const ca = Math.cos(P.a), sa = Math.sin(P.a), oz = P.z + 0.5, slope = autoaim(P.a, 26);
  const spread = P.refire ? 0.055 : 0;
  switch (P.w) {
    case 'fist': { const hit = hitscan(P, P.x, P.y, oz, P.a, slope, 1.15, 2 * ri(1, 10), false); sfx(hit ? 'punch' : 'swing'); break; }
    case 'pistol': hitscan(P, P.x, P.y, oz, P.a + rr(-spread, spread), slope, 40, 5 * ri(1, 3)); sfx('pistol'); break;
    case 'chaingun': hitscan(P, P.x, P.y, oz, P.a + rr(-spread, spread), slope, 40, 5 * ri(1, 3)); sfx('chain'); st.alt = !st.alt; break;
    case 'shotgun': for (let i = 0; i < 7; i++) hitscan(P, P.x, P.y, oz, P.a + rr(-0.09, 0.09), slope + rr(-0.02, 0.02), 40, 5 * ri(1, 3)); sfx('shotgun'); st.pumpT = 0; break;
    case 'launcher': spawnProj('rocket', P, P.x + ca * 0.35, P.y + sa * 0.35, oz, ca, sa, slope); sfx('rocket'); break;
    case 'plasma': spawnProj('plasma', P, P.x + ca * 0.35, P.y + sa * 0.35, oz, ca, sa, slope); sfx('plasma'); break;
  }
  if (P.w !== 'fist') {
    st.flash = 0.07;
    addLight(P.x + ca * 0.7, P.y + sa * 0.7, P.z + 0.6, P.w === 'plasma' ? [0.6, 0.9, 1.8] : [1.8, 1.3, 0.6], 6, 0.07);
  }
  alertMonsters();
  P.refire = true;
}
function updatePlayer(dt) {
  const st = P.wst; st.t += dt;
  gravity(P, dt);
  if (P.dead) { P.deathT = Math.min(1, P.deathT + dt * 1.6); return; }
  const run = keys.ShiftLeft || keys.ShiftRight;
  let fw = ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0) + touchIn.fwd;
  let sd = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + touchIn.str;
  const turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
  P.a = normA(P.a + turn * 2.8 * dt * (run ? 1.4 : 1));
  const len = Math.hypot(fw, sd); if (len > 1) { fw /= len; sd /= len; }
  const sp = run ? 7 : 4.2, ca = Math.cos(P.a), sa = Math.sin(P.a);
  const wx = (ca * fw - sa * sd) * sp, wy = (sa * fw + ca * sd) * sp, k = Math.min(1, dt * 11);
  P.vx += (wx - P.vx) * k; P.vy += (wy - P.vy) * k;
  if (Math.abs(P.vx) > 0.001) tryMove(P, P.x + P.vx * dt, P.y);
  if (Math.abs(P.vy) > 0.001) tryMove(P, P.x, P.y + P.vy * dt);
  const moving = Math.min(1, Math.hypot(P.vx, P.vy) / 4.2);
  P.moveAmt += (moving - P.moveAmt) * Math.min(1, dt * 8);
  P.bob += dt * (run ? 11 : 8.5) * P.moveAmt;
  P.stepLag += (0 - P.stepLag) * Math.min(1, dt * 9);
  // liquids
  const c = cell(P.x, P.y);
  if (c.liquid && P.z <= c.f + 0.02) { P.liqT -= dt; if (P.liqT <= 0) { P.liqT = 1; hurtPlayer(c.liquid === 'lava' ? 10 : 5, null); sfx('sizzle'); } }
  else P.liqT = Math.min(P.liqT, 0.3);
  // weapon
  if (P.pendingW) { st.drop += dt * 900; if (st.drop >= 160) { P.w = P.pendingW; P.pendingW = null; } }
  else st.drop = Math.max(0, st.drop - dt * 900);
  P.wcool -= dt; st.flash -= dt;
  st.fire = Math.max(0, st.fire - dt * (P.w === 'fist' ? 3 : 6));
  if (st.pumpT >= 0) { st.pumpT += dt; const ph = (st.pumpT - 0.25) / 0.5; st.pump = ph > 0 && ph < 1 ? Math.sin(ph * Math.PI) : 0; if (st.pumpT > 0.3 && st.pumpT - dt <= 0.3) sfx('pump'); if (st.pumpT > 0.8) st.pumpT = -1; }
  st.spinV = P.w === 'chaingun' && fireHeld ? 26 : st.spinV * Math.max(0, 1 - dt * 3); st.spin += st.spinV * dt;
  st.loaded = P.wcool < 0.25 && P.ammo.rkt > 0;
  st.bx = Math.cos(P.bob) * 14 * P.moveAmt; st.by = Math.abs(Math.sin(P.bob)) * 12 * P.moveAmt;
  if (fireHeld && P.wcool <= 0 && st.drop < 20 && !P.pendingW) fireWeapon();
  if (!fireHeld) P.refire = false;
  // pickups
  for (const t of things) {
    if (!t.d.item || t.remove) continue;
    if (Math.hypot(t.x - P.x, t.y - P.y) < 0.58 && Math.abs(t.z - P.z) < 0.7 && pickup(t)) removeThing(t);
  }
  // automap reveal
  P.seenT -= dt;
  if (P.seenT <= 0) {
    P.seenT = 0.2;
    for (let i = 0; i < 40; i++) {
      const a = P.a + (i / 39 - 0.5) * 1.8, dx = Math.cos(a), dy = Math.sin(a);
      for (let s = 0; s < 22; s += 0.25) {
        const cx = Math.floor(P.x + dx * s), cy = Math.floor(P.y + dy * s), cc = cellAt(cx, cy);
        if (cc.solid) break;
        WD.seen[cy * WD.W + cx] = 1;
        if (cc.door && cc.door.cur - cc.door.f < 0.5) break;
      }
    }
  }
}

// ---------- per-frame visuals ----------
const _L = [0, 0, 0], _cand = [];
function updateVisuals(dt) {
  const rotY = Math.atan2(-Math.cos(P.a), -Math.sin(P.a));
  for (const t of things) {
    if (!t.mesh) continue;
    const bob = t.d.bob ? 0.06 + Math.sin(gtime * 3 + t.x * 2) * 0.05 : 0;
    t.mesh.position.set(t.x, t.z + bob, t.y); t.mesh.rotation.y = rotY;
    if (t.d.mon) t.mat.uniforms.map.value = monsterFrame(t);
    sampleLight(t.x, t.y, _L); t.mat.uniforms.tint.value.set(Math.min(_L[0], 1.15), Math.min(_L[1], 1.15), Math.min(_L[2], 1.15));
    t.mat.uniforms.flash.value = t.hitFlash > 0 ? 0.3 : 0;
    if (t.shadow) { t.shadow.position.set(t.x, t.floorZ + 0.012, t.y); t.shadow.visible = !(t.d.mon && t.dead && t.state === 'dead'); }
  }
  for (const h of halos) {
    if (h.t.remove) { h.m.visible = false; continue; }
    if (h.t.d.flicker) { const f = 0.85 + Math.sin(gtime * 17 + h.t.x) * 0.08 + Math.sin(gtime * 31 + h.t.y) * 0.07; h.m.scale.set(h.base * f, h.base * f, 1); }
  }
  // dynamic lights: pick the 8 nearest
  _cand.length = 0;
  for (const l of tlights) _cand.push([l.x, l.y, l.z, l.col[0] * l.life / l.life0, l.col[1] * l.life / l.life0, l.col[2] * l.life / l.life0, l.rad]);
  for (const p of projs) if (!p.dead) _cand.push([p.x, p.y, p.z, p.pd.light[0], p.pd.light[1], p.pd.light[2], p.pd.lrad]);
  for (const t of things) if (t.type === 'lostsoul' && !t.dead) _cand.push([t.x, t.y, t.z + 0.3, 0.9, 0.45, 0.15, 2.6]);
  for (const t of things) if (t.d.flicker) { const f = 0.25 + Math.sin(gtime * 13 + t.x) * 0.12; _cand.push([t.x, t.y, t.z + 0.9, 1.2 * f, 0.5 * f, 0.15 * f, 3.5]); }
  _cand.sort((a, b) => ((a[0] - P.x) ** 2 + (a[1] - P.y) ** 2) - ((b[0] - P.x) ** 2 + (b[1] - P.y) ** 2));
  const n = Math.min(8, _cand.length);
  for (let i = 0; i < n; i++) { const c = _cand[i]; SU.dlPos.value[i].set(c[0], c[2], c[1]); SU.dlCol.value[i].set(c[3], c[4], c[5]); SU.dlRad.value[i] = c[6]; }
  SU.dlN.value = n;
  for (const k of ['nukage', 'lava']) if (MAT[k]) MAT[k].uniforms.scroll.value.set(Math.sin(gtime * 0.4) * 0.08, gtime * (k === 'lava' ? 0.03 : 0.05));
  SU.time.value = gtime;
  // camera
  P.shake = Math.max(0, P.shake - dt * 1.5);
  const sh = P.shake * 0.06, bobZ = Math.sin(P.bob * 2) * 0.028 * P.moveAmt;
  const eye = P.dead ? P.z + lerp(EYE, 0.14, P.deathT) : P.z + EYE + P.stepLag + bobZ;
  camera.position.set(P.x + rr(-sh, sh), eye + rr(-sh, sh), P.y + rr(-sh, sh));
  camera.rotation.set(0, -P.a - Math.PI / 2, P.dead ? P.deathT * 0.5 : 0);
  if (sky) sky.position.set(camera.position.x, eye + 26, camera.position.z);
  listenerX = P.x; listenerY = P.y;
}

// ---------- update ----------
function update(dt) {
  gtime += dt;
  if (state === 'play') levelTime += dt;
  updatePlayer(dt);
  updateDoors(dt);
  const cnt = things.length;
  for (let i = 0; i < cnt; i++) {
    const t = things[i]; if (t.remove) continue;
    if (t.d.mon) updateMonster(t, dt);
    else if (t.type === 'barrel' && t.boom !== undefined) {
      t.boom -= dt;
      if (t.boom <= 0) { const src = t.boomSrc; removeThing(t); explosion(t.x, t.y, t.z + 0.35, true); radiusDamage(t.x, t.y, t.z + 0.35, 2.0, 128, src); }
    }
  }
  things = things.filter(t => !t.remove);
  for (const p of projs) if (!p.dead) updateProj(p, dt);
  projs = projs.filter(p => !p.dead);
  for (const l of tlights) l.life -= dt;
  tlights = tlights.filter(l => l.life > 0);
  PFX.update(dt); PDK.update(dt);
  P.hurt = Math.max(0, P.hurt - dt * 0.9); P.bonus = Math.max(0, P.bonus - dt);
  P.msgT -= dt; P.ouchT -= dt; P.grinT -= dt; P.lookT -= dt;
  if (P.lookT <= 0) { P.lookT = rr(0.8, 2); P.lookDir = ri(-1, 1); }
  if (state === 'dying') { stateT -= dt; if (stateT <= 0) { state = 'dead'; showOv('ovDead'); } }
  if (state === 'exiting') { stateT -= dt; if (stateT <= 0) showIntermission(); }
}

// ---------- overlay ----------
let VIGNETTE = null;
function buildVignette() {
  const c = mkCanvas(OW, VIEWH), g = c.getContext('2d'), gr = g.createRadialGradient(OW / 2, VIEWH / 2, VIEWH * 0.35, OW / 2, VIEWH / 2, OW * 0.62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = gr; g.fillRect(0, 0, OW, VIEWH); VIGNETTE = c;
}
function drawOverlay() {
  O.clearRect(0, 0, OW, OH);
  O.drawImage(VIGNETTE, 0, 0);
  if (state !== 'title') {
    if (!P.dead) { sampleLight(P.x, P.y, _L); drawWeapon(O, P, _L); }
    O.fillStyle = 'rgba(255,240,220,0.55)'; O.fillRect(OW / 2 - 1, VIEWH / 2 - 1, 2, 2);
  }
  if (P.hurt > 0) { O.fillStyle = `rgba(200,0,0,${P.hurt * 0.55})`; O.fillRect(0, 0, OW, VIEWH); }
  if (P.bonus > 0) { O.fillStyle = `rgba(255,215,90,${P.bonus * 0.3})`; O.fillRect(0, 0, OW, VIEWH); }
  const c = cell(P.x, P.y);
  if (c.liquid && P.z <= c.f + 0.02 && !P.dead) { O.fillStyle = c.liquid === 'lava' ? 'rgba(255,90,0,0.18)' : 'rgba(40,255,40,0.12)'; O.fillRect(0, 0, OW, VIEWH); }
  if (!P.dead && P.health <= 25 && state === 'play') { O.fillStyle = `rgba(160,0,0,${0.12 + Math.sin(gtime * 4) * 0.08})`; O.fillRect(0, 0, OW, VIEWH); }
  if (P.dead) { O.fillStyle = `rgba(110,0,0,${0.45 * P.deathT})`; O.fillRect(0, 0, OW, VIEWH); }
  if (showMap) drawAutomap(O, P, LV);
  if (P.msgT > 0 && state !== 'title') {
    O.font = '600 19px "Rubik", sans-serif'; O.textAlign = 'right'; O.direction = 'rtl'; O.textBaseline = 'top';
    O.fillStyle = 'rgba(0,0,0,0.8)'; O.fillText(P.msg, OW - 10, 12); O.fillStyle = '#f2e4b8'; O.fillText(P.msg, OW - 12, 10);
    O.direction = 'ltr';
  }
  drawHud(O, P, LV);
}

// ---------- screens ----------
const OVS = ['ovTitle', 'ovInter', 'ovDead', 'ovPause'];
function showOv(id) {
  for (const o of OVS) document.getElementById(o).hidden = o !== id;
  if (id && document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { } }
  document.getElementById('touch').hidden = !(isTouch && !id);
  fireHeld = false;
}
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (a, b) => (b ? Math.round(a / b * 100) : 100) + '%';
function showIntermission() {
  const last = levelIndex === LEVELS.length - 1;
  state = last ? 'win' : 'inter';
  document.getElementById('iTitle').textContent = last ? 'ניצחת' : 'השלב הושלם';
  document.getElementById('iName').textContent = last ? 'סגרת את שער התופת. לבינתיים.' : LV.name;
  document.getElementById('sK').textContent = pct(P.kills, totalKills);
  document.getElementById('sI').textContent = pct(P.items, totalItems);
  document.getElementById('sT').textContent = fmtTime(levelTime);
  document.getElementById('bNext').textContent = last ? 'שחק שוב' : 'לשלב הבא';
  showOv('ovInter');
}
function lockPointer() {
  if (isTouch || document.pointerLockElement === glc) return;
  try { const p = glc.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { }
}
function beginPlay() { state = 'play'; showOv(null); initAudio(); startMusic(); lockPointer(); }
function togglePause() {
  if (state === 'play') { state = 'pause'; stopMusic(); showOv('ovPause'); }
  else if (state === 'pause') beginPlay();
}
document.getElementById('bStart').onclick = e => { e.currentTarget.blur(); loadLevel(levelIndex, freshLoadout()); beginPlay(); };
document.getElementById('bNext').onclick = e => { e.currentTarget.blur(); if (state === 'win') loadLevel(0, freshLoadout()); else loadLevel(levelIndex + 1, saveLoadout()); beginPlay(); };
document.getElementById('bRetry').onclick = e => { e.currentTarget.blur(); loadLevel(levelIndex, startLoadout); beginPlay(); };
document.getElementById('bResume').onclick = e => { e.currentTarget.blur(); togglePause(); };

// ---------- input ----------
addEventListener('keydown', e => {
  const c = e.code;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c) && state === 'play') e.preventDefault();
  if (c === 'Tab') e.preventDefault();
  keys[c] = true;
  if (e.repeat) return;
  if (c === 'Enter' && state !== 'play') {
    const b = { title: 'bStart', inter: 'bNext', win: 'bNext', dead: 'bRetry', pause: 'bResume' }[state];
    if (b) { e.preventDefault(); document.getElementById(b).click(); }
    return;
  }
  if (c === 'KeyM') { musicOn = !musicOn; if (musicOn && state === 'play') startMusic(); else stopMusic(); say(musicOn ? 'מוזיקה: פועלת' : 'מוזיקה: כבויה'); }
  if (c === 'KeyB') { const g = [1, 1.25, 1.5, 1.8], i = (g.indexOf(SU.gain.value) + 1) % g.length; SU.gain.value = g[i]; say('בהירות: ' + (i + 1) + '/4'); }
  if (c === 'KeyP' || (c === 'Escape' && state === 'pause')) togglePause();
  if (state !== 'play') return;
  if (c === 'Space') fireHeld = true;
  if (c === 'KeyE' || c === 'KeyF') useAction();
  if (c === 'Tab') showMap = !showMap;
  if (c.startsWith('Digit')) { const w = WORDER[+c.slice(5) - 1]; if (w) selectWeapon(w); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') fireHeld = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; fireHeld = false; });
function cycleWeapon(dir) {
  const owned = WORDER.filter(w => P.has[w]), cur = P.pendingW || P.w;
  selectWeapon(owned[(owned.indexOf(cur) + dir + owned.length) % owned.length]);
}
frameEl.addEventListener('mousedown', e => { if (state !== 'play' || isTouch) return; lockPointer(); if (e.button === 0) fireHeld = true; });
addEventListener('mouseup', e => { if (e.button === 0 && !isTouch) fireHeld = false; });
addEventListener('mousemove', e => { if (state === 'play' && document.pointerLockElement === glc) P.a = normA(P.a + e.movementX * 0.0026); });
addEventListener('wheel', e => { if (state === 'play') cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });
frameEl.addEventListener('contextmenu', e => e.preventDefault());
if (isTouch) {
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  let sid = null;
  const sm = e => {
    const b = stick.getBoundingClientRect(), rad = b.width / 2;
    let dx = (e.clientX - b.left - rad) / rad, dy = (e.clientY - b.top - rad) / rad;
    const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    touchIn.str = Math.abs(dx) > 0.2 ? dx : 0; touchIn.fwd = Math.abs(dy) > 0.15 ? -dy : 0;
    knob.style.transform = `translate(${dx * rad * 0.6}px,${dy * rad * 0.6}px)`;
  };
  stick.addEventListener('pointerdown', e => { sid = e.pointerId; stick.setPointerCapture(sid); sm(e); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === sid) sm(e); });
  const se = e => { if (e.pointerId !== sid) return; sid = null; touchIn.fwd = touchIn.str = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', se); stick.addEventListener('pointercancel', se);
  const look = document.getElementById('lookpad'); let lid = null, lx = 0;
  look.addEventListener('pointerdown', e => { lid = e.pointerId; lx = e.clientX; look.setPointerCapture(lid); });
  look.addEventListener('pointermove', e => { if (e.pointerId !== lid || state !== 'play') return; P.a = normA(P.a + (e.clientX - lx) * 0.009); lx = e.clientX; });
  const le = e => { if (e.pointerId === lid) lid = null; };
  look.addEventListener('pointerup', le); look.addEventListener('pointercancel', le);
  const fb = document.getElementById('bFire');
  fb.addEventListener('pointerdown', e => { fb.setPointerCapture(e.pointerId); fireHeld = true; });
  fb.addEventListener('pointerup', () => { fireHeld = false; }); fb.addEventListener('pointercancel', () => { fireHeld = false; });
  document.getElementById('bUse').addEventListener('pointerdown', () => { if (state === 'play') useAction(); });
  document.getElementById('bMap').addEventListener('pointerdown', () => { if (state === 'play') showMap = !showMap; });
  document.getElementById('bWpn').addEventListener('pointerdown', () => { if (state === 'play') cycleWeapon(1); });
}

// ---------- loop ----------
let last = performance.now(), frameMs = 16, resT = 0;
function loop(now) {
  const raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
  if (state === 'play' || state === 'dying' || state === 'exiting') update(dt);
  else if (state === 'title') { gtime += dt; P.a = normA(P.a + dt * 0.12); }
  updateVisuals(dt);
  renderer.render(scene, camera);
  drawOverlay();
  frameMs = lerp(frameMs, raw * 1000, 0.05); resT += raw;
  if (resT > 2) {
    resT = 0;
    if (frameMs > 24 && pixScale > 0.5) { pixScale = Math.max(0.5, pixScale - 0.15); applyRes(); }
    else if (frameMs < 14 && pixScale < MAXSCALE) { pixScale = Math.min(MAXSCALE, pixScale + 0.1); applyRes(); }
  }
  requestAnimationFrame(loop);
}
function boot(data) {
  initTextures(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  initSprites(); buildHudBg(); buildVignette();
  SHADOW_MAT = new THREE.MeshBasicMaterial({ map: SPR.shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  CORE_MAT = new THREE.SpriteMaterial({ map: SPR.glow, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  addEventListener('resize', fit); fit();
  const lvl = data && Number.isInteger(data.level) ? clamp(data.level, 0, LEVELS.length - 1) : 0;
  loadLevel(lvl, (data && data.loadout) || freshLoadout());
  levelIndex = lvl;
  document.getElementById('loading').hidden = true;
  showOv('ovTitle');
  requestAnimationFrame(t => { last = t; loop(t); });
}
window.claude?.hot?.snapshot?.(() => ({ level: levelIndex, loadout: startLoadout }));
function start() { const run = d => { try { boot(d); } catch (err) { console.error(err); document.getElementById('loading').textContent = 'שגיאה בטעינה: ' + err.message; } }; window.claude?.hot?.ready ? window.claude.hot.ready(run) : run(window.claude?.hot?.data ?? {}); }
setTimeout(start, 30);
