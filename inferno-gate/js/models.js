'use strict';
// Procedural low-poly 3D models: monsters (jointed for animation), pickups, props,
// and first-person weapons with hands whose fingers wrap the grips.
// Model space: feet at y = 0, facing +Z. Weapon space: camera space, muzzle toward -Z.
// Vertex colors above 1.0 mark emissive parts (eyes, flames, glowing coils).

const G_SPH = new THREE.SphereGeometry(1, 14, 10);
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const G_CONE = new THREE.ConeGeometry(1, 1, 9);
const _Y = new THREE.Vector3(0, 1, 0), _m4 = new THREE.Matrix4();
const col01 = h => { const c = hexRgb(h); return [c[0] / 255, c[1] / 255, c[2] / 255]; };

// A Kit collects transformed primitives; positions are given in model space and
// stored relative to `pivot`, so each Kit becomes the geometry of one joint.
class Kit {
  constructor(pivot = [0, 0, 0]) { this.p = pivot; this.parts = []; }
  put(geo, col, pos, scl, quat, emis) {
    const g = geo.clone();
    _m4.compose(new THREE.Vector3(pos[0] - this.p[0], pos[1] - this.p[1], pos[2] - this.p[2]), quat || new THREE.Quaternion(), new THREE.Vector3(...scl));
    g.applyMatrix4(_m4); this.parts.push([g, col, emis]); return this;
  }
  ball(col, x, y, z, rx, ry = rx, rz = rx, emis) { return this.put(G_SPH, col, [x, y, z], [rx, ry, rz], null, emis); }
  ballR(col, x, y, z, rx, ry, rz, rot, emis) { return this.put(G_SPH, col, [x, y, z], [rx, ry, rz], new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), emis); }
  box(col, x, y, z, w, h, d, rot = [0, 0, 0], emis) { return this.put(G_BOX, col, [x, y, z], [w, h, d], new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), emis); }
  cyl(col, x, y, z, r, len, rot = [0, 0, 0], emis, seg = 12) {
    return this.put(new THREE.CylinderGeometry(r, r, 1, seg), col, [x, y, z], [1, len, 1], new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), emis);
  }
  // tapered capsule between two points
  limb(col, a, b, r1, r2, emis) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize());
    const m = A.clone().add(B).multiplyScalar(0.5);
    this.put(new THREE.CylinderGeometry(r2, r1, 1, 10, 1, true), col, [m.x, m.y, m.z], [1, len, 1], q, emis);
    this.ball(col, a[0], a[1], a[2], r1, r1, r1, emis); this.ball(col, b[0], b[1], b[2], r2, r2, r2, emis);
    return this;
  }
  chain(col, pts, r1, r2, emis) { for (let i = 0; i < pts.length - 1; i++) this.limb(col, pts[i], pts[i + 1], lerp(r1, r2, i / (pts.length - 1)), lerp(r1, r2, (i + 1) / (pts.length - 1)), emis); return this; }
  cone(col, base, tip, r, emis) {
    const A = new THREE.Vector3(...base), B = new THREE.Vector3(...tip), d = B.clone().sub(A), len = d.length();
    const q = new THREE.Quaternion().setFromUnitVectors(_Y, d.normalize()), m = A.clone().add(B).multiplyScalar(0.5);
    return this.put(G_CONE, col, [m.x, m.y, m.z], [r, len, r], q, emis);
  }
  mirror(fn) { fn(1, this); fn(-1, this); return this; }
  build() {
    let n = 0;
    const arr = this.parts.map(([g, c, e]) => { const ng = g.index ? g.toNonIndexed() : g; n += ng.attributes.position.count; return [ng, c, e]; });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), vc = new Float32Array(n * 3);
    let o = 0;
    for (const [g, c, e] of arr) {
      const cnt = g.attributes.position.count, rgb = col01(c), k = e ? 2.4 : 1;
      pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
      for (let i = 0; i < cnt; i++) { vc[(o + i) * 3] = rgb[0] * k; vc[(o + i) * 3 + 1] = rgb[1] * k; vc[(o + i) * 3 + 2] = rgb[2] * k; }
      o += cnt;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('vcol', new THREE.BufferAttribute(vc, 3));
    geo.computeBoundingSphere();
    return geo;
  }
}

// ---------- model shader ----------
const MODEL_VS = `
attribute vec3 vcol; varying vec3 vC; varying vec3 vN; varying vec3 vW;
void main(){ vC=vcol; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const MODEL_FS = GLSL_COMMON + `
uniform vec3 tint; uniform float bright; uniform float fuzz; uniform float flash; uniform float noFog;
varying vec3 vC; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 n=normalize(vN);
  float key=max(dot(n,normalize(vec3(0.35,0.85,0.4))),0.0);
  float rim=pow(1.0-max(dot(n,normalize(cameraPosition-vW)),0.0),2.5);
  vec3 light=mix(tint*(0.42+0.7*key)+tint*rim*0.35, vec3(1.0), bright);
  for(int i=0;i<8;i++){
    if(i>=dlN) break;
    vec3 Lv=dlPos[i]-vW; float d=length(Lv); float a=clamp(1.0-d/dlRad[i],0.0,1.0); a*=a;
    light+=dlCol[i]*a*(0.2+0.8*max(dot(n,Lv/max(d,0.001)),0.0));
  }
  float em=step(1.01,max(vC.r,max(vC.g,vC.b)));
  vec3 c=mix(min(vC*light*gain,vec3(1.0)), min(vC*0.62,vec3(1.0)), em)+vec3(flash);
  if(noFog<0.5) c=fogIt(c,vW);
  if(fuzz>0.5){
    float nz=fract(sin(dot(floor(gl_FragCoord.xy/3.0)+vec2(time*13.0,time*7.0),vec2(12.9898,78.233)))*43758.5453);
    gl_FragColor=vec4(c*0.1,0.22+0.45*nz); return;
  }
  gl_FragColor=vec4(c,1.0);
}`;
function modelMat(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { ...SU, tint: { value: new THREE.Vector3(1, 1, 1) }, bright: { value: opts.bright ? 1 : 0 }, fuzz: { value: opts.fuzz ? 1 : 0 }, flash: { value: 0 }, noFog: { value: opts.noFog ? 1 : 0 } },
    vertexShader: MODEL_VS, fragmentShader: MODEL_FS,
    transparent: !!opts.fuzz, depthWrite: !opts.fuzz, side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
  });
}

// template: { joints: [{ name, parent, pivot, geo }] }
function tpl(list) { return { joints: list.map(([name, parent, pivot, kit]) => ({ name, parent, pivot, geo: kit.build() })) }; }
function instantiate(T, mat, layer = 0) {
  const root = new THREE.Group(), J = { root };
  for (const j of T.joints) {
    const g = new THREE.Group(), par = j.parent ? J[j.parent] : root, pp = j.parent ? T.joints.find(x => x.name === j.parent).pivot : [0, 0, 0];
    g.position.set(j.pivot[0] - pp[0], j.pivot[1] - pp[1], j.pivot[2] - pp[2]);
    const m = new THREE.Mesh(j.geo, mat); m.layers.set(layer); g.add(m);
    par.add(g); J[j.name] = g; g.userData.mesh = m;
  }
  return J;
}

// ---------- monsters ----------
const MODELS = {};
function soldierTpl(pal) {
  const legs = s => new Kit([0.09 * s, 0.46, 0])
    .limb(pal.pants, [0.09 * s, 0.46, 0], [0.1 * s, 0.25, 0.03], 0.058, 0.046)
    .limb(pal.pants, [0.1 * s, 0.25, 0.03], [0.1 * s, 0.07, 0], 0.046, 0.04)
    .box(pal.boot, 0.1 * s, 0.04, 0.035, 0.09, 0.08, 0.17);
  const body = new Kit([0, 0.46, 0])
    .ball(pal.pants, 0, 0.49, 0, 0.13, 0.07, 0.09)
    .cyl(pal.belt, 0, 0.52, 0, 0.135, 0.045)
    .ball('#b89a40', 0, 0.52, 0.13, 0.025, 0.02, 0.012)
    .ball(pal.armor, 0, 0.64, 0, 0.16, 0.16, 0.11)
    .ball(pal.armorHi, 0, 0.67, 0.05, 0.13, 0.1, 0.075)
    .mirror((s, k) => k.ball(pal.armor, 0.17 * s, 0.75, 0, 0.075, 0.05, 0.075));
  const head = new Kit([0, 0.79, 0])
    .limb(pal.skin, [0, 0.77, 0], [0, 0.83, 0.01], 0.035, 0.035)
    .ball(pal.skin, 0, 0.88, 0.01, 0.072, 0.088, 0.078)
    .ball(pal.hair, 0, 0.915, -0.008, 0.075, 0.06, 0.08)
    .ball(pal.skin, 0, 0.845, 0.04, 0.05, 0.035, 0.05)
    .mirror((s, k) => k.ball(pal.eye, 0.027 * s, 0.887, 0.07, 0.012, 0.009, 0.006, true))
    .box('#2a1210', 0, 0.85, 0.083, 0.035, 0.007, 0.01);
  const arms = new Kit([0, 0.74, 0])
    .limb(pal.armor, [0.18, 0.74, 0], [0.17, 0.6, 0.1], 0.042, 0.036).limb(pal.skin, [0.17, 0.6, 0.1], [0.04, 0.6, 0.2], 0.033, 0.028)
    .limb(pal.armor, [-0.18, 0.74, 0], [-0.17, 0.62, 0.06], 0.042, 0.036).limb(pal.skin, [-0.17, 0.62, 0.06], [-0.03, 0.62, 0.05], 0.033, 0.028)
    .ball(pal.skin, 0.04, 0.6, 0.2, 0.032).ball(pal.skin, -0.03, 0.62, 0.05, 0.032);
  if (pal.shotgun) arms.box(pal.gun, 0, 0.64, 0.17, 0.05, 0.055, 0.46).box(pal.stock, 0, 0.62, -0.06, 0.045, 0.07, 0.12).cyl(pal.stock, 0, 0.62, 0.24, 0.03, 0.12, [Math.PI / 2, 0, 0]);
  else arms.box(pal.gun, 0, 0.645, 0.17, 0.035, 0.05, 0.44).box(pal.stock, 0, 0.62, -0.07, 0.035, 0.065, 0.12).box(pal.gun, 0, 0.6, 0.12, 0.025, 0.07, 0.035);
  const flash = new Kit([0, 0.645, 0.42]).ball('#fff0a0', 0, 0.645, 0.43, 0.07, 0.07, 0.1, true);
  return tpl([['legL', null, [0.09, 0.46, 0], legs(1)], ['legR', null, [-0.09, 0.46, 0], legs(-1)], ['body', null, [0, 0.46, 0], body],
    ['head', 'body', [0, 0.79, 0], head], ['arms', 'body', [0, 0.74, 0], arms], ['flash', 'arms', [0, 0.645, 0.42], flash]]);
}
function impTpl() {
  const sk = '#8a5a32', hi = '#a87240', sp = '#e6dcc4';
  const leg = s => new Kit([0.08 * s, 0.45, 0])
    .chain(sk, [[0.08 * s, 0.45, 0], [0.09 * s, 0.28, 0.07], [0.09 * s, 0.12, -0.05], [0.09 * s, 0.025, 0.04]], 0.052, 0.026)
    .cone(sp, [0.08 * s, 0.02, 0.06], [0.06 * s, 0.01, 0.12], 0.012).cone(sp, [0.1 * s, 0.02, 0.06], [0.12 * s, 0.01, 0.12], 0.012);
  const body = new Kit([0, 0.45, 0]).ball(sk, 0, 0.62, 0, 0.15, 0.18, 0.105);
  body.mirror(s => {
    body.ball(hi, 0.055 * s, 0.69, 0.065, 0.06, 0.05, 0.04);
    for (let i = 0; i < 3; i++) body.ball(hi, 0.03 * s, 0.6 - i * 0.045, 0.085, 0.027, 0.02, 0.018);
    body.cone(sp, [0.14 * s, 0.76, 0], [0.24 * s, 0.86, -0.03], 0.03).cone(sp, [0.13 * s, 0.68, 0.04], [0.21 * s, 0.7, 0.05], 0.018);
  });
  for (let i = 0; i < 4; i++) body.cone(sp, [0, 0.74 - i * 0.06, -0.09], [0, 0.76 - i * 0.06, -0.17], 0.02);
  const head = new Kit([0, 0.79, 0]).limb(sk, [0, 0.77, 0], [0, 0.83, 0.02], 0.04, 0.035).ball(sk, 0, 0.87, 0.02, 0.07, 0.078, 0.075)
    .ball('#6a4222', 0, 0.9, 0.065, 0.06, 0.02, 0.03).box('#2a0806', 0, 0.84, 0.085, 0.05, 0.016, 0.02);
  head.mirror(s => { head.ball('#ffb020', 0.026 * s, 0.885, 0.08, 0.013, 0.008, 0.006, true); head.cone(sp, [0.035 * s, 0.93, 0], [0.06 * s, 1.0, -0.04], 0.016); });
  for (let i = -2; i <= 2; i++) head.cone(sp, [i * 0.009, 0.846, 0.09], [i * 0.009, 0.832, 0.092], 0.004);
  const arm = s => {
    const k = new Kit([0.17 * s, 0.74, 0]).limb(sk, [0.17 * s, 0.74, 0], [0.2 * s, 0.6, 0.03], 0.045, 0.036).limb(sk, [0.2 * s, 0.6, 0.03], [0.2 * s, 0.46, 0.07], 0.036, 0.03)
      .cone(sp, [0.22 * s, 0.56, 0.0], [0.27 * s, 0.53, -0.04], 0.012);
    for (let i = -1; i <= 1; i++) k.cone(sp, [0.2 * s + i * 0.015, 0.44, 0.08], [0.2 * s + i * 0.018, 0.4, 0.11], 0.008);
    return k;
  };
  const fire = new Kit([-0.2, 0.42, 0.08]).ball('#ffb040', -0.2, 0.4, 0.09, 0.07, 0.07, 0.07, true).ball('#fff4c0', -0.2, 0.4, 0.09, 0.04, 0.04, 0.04, true);
  return tpl([['legL', null, [0.08, 0.45, 0], leg(1)], ['legR', null, [-0.08, 0.45, 0], leg(-1)], ['body', null, [0, 0.45, 0], body], ['head', 'body', [0, 0.79, 0], head],
    ['armL', 'body', [0.17, 0.74, 0], arm(1)], ['armR', 'body', [-0.17, 0.74, 0], arm(-1)], ['flash', 'armR', [-0.2, 0.42, 0.08], fire]]);
}
function demonTpl() {
  const pk = '#d07a86', hi = '#e2a0aa', th = '#f4f0e0';
  const leg = s => new Kit([0.14 * s, 0.32, -0.05]).limb(pk, [0.14 * s, 0.32, -0.05], [0.16 * s, 0.16, 0.03], 0.075, 0.062).limb(pk, [0.16 * s, 0.16, 0.03], [0.16 * s, 0.045, -0.02], 0.062, 0.05)
    .ball('#3a2224', 0.16 * s, 0.03, 0.01, 0.06, 0.03, 0.075);
  const body = new Kit([0, 0.36, 0]).ball(pk, 0, 0.5, 0, 0.25, 0.2, 0.23).ball(hi, 0, 0.44, 0.13, 0.17, 0.13, 0.1);
  const arm = s => new Kit([0.22 * s, 0.56, 0.06]).limb(pk, [0.22 * s, 0.56, 0.06], [0.26 * s, 0.41, 0.16], 0.055, 0.045).limb(pk, [0.26 * s, 0.41, 0.16], [0.24 * s, 0.3, 0.22], 0.045, 0.038)
    .cone(th, [0.23 * s, 0.28, 0.24], [0.22 * s, 0.24, 0.29], 0.01).cone(th, [0.26 * s, 0.28, 0.24], [0.27 * s, 0.24, 0.29], 0.01);
  const head = new Kit([0, 0.6, 0.15]).ball(pk, 0, 0.66, 0.24, 0.18, 0.12, 0.15).ball('#8a3c4a', 0, 0.72, 0.33, 0.13, 0.03, 0.05).ball('#3a0408', 0, 0.6, 0.31, 0.14, 0.045, 0.09);
  head.mirror(s => { head.ball('#d8e040', 0.07 * s, 0.705, 0.36, 0.022, 0.016, 0.01, true); head.cone('#e8d8c0', [0.12 * s, 0.73, 0.22], [0.16 * s, 0.8, 0.18], 0.025); });
  for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.225; head.cone(th, [Math.sin(a) * 0.15, 0.625, 0.24 + Math.cos(a) * 0.13], [Math.sin(a) * 0.15, 0.575, 0.24 + Math.cos(a) * 0.13], 0.014); }
  const jaw = new Kit([0, 0.58, 0.18]).ball(pk, 0, 0.54, 0.26, 0.16, 0.05, 0.13);
  for (let i = 0; i < 9; i++) { const a = -0.9 + i * 0.225; jaw.cone(th, [Math.sin(a) * 0.14, 0.565, 0.26 + Math.cos(a) * 0.12], [Math.sin(a) * 0.14, 0.605, 0.26 + Math.cos(a) * 0.12], 0.013); }
  return tpl([['legL', null, [0.14, 0.32, -0.05], leg(1)], ['legR', null, [-0.14, 0.32, -0.05], leg(-1)], ['body', null, [0, 0.36, 0], body], ['head', 'body', [0, 0.6, 0.15], head],
    ['jaw', 'head', [0, 0.58, 0.18], jaw], ['armL', 'body', [0.22, 0.56, 0.06], arm(1)], ['armR', 'body', [-0.22, 0.56, 0.06], arm(-1)]]);
}
function cacoTpl() {
  const rd = '#c42a24', hn = '#e8d8c0';
  const body = new Kit([0, 0.45, 0]).ball(rd, 0, 0.45, 0, 0.42, 0.4, 0.42);
  srand(5);
  for (let i = 0; i < 22; i++) { const a = rnd() * TAU, e = rnd() * 1.2 - 0.5; body.ball('#9a1c18', Math.cos(a) * Math.cos(e) * 0.4, 0.45 + Math.sin(e) * 0.38, Math.sin(a) * Math.cos(e) * 0.4, 0.04, 0.03, 0.04); }
  for (const [x, z] of [[-0.2, 0.05], [-0.07, 0.12], [0.07, 0.12], [0.2, 0.05], [0, -0.15], [-0.25, -0.12], [0.25, -0.12]]) body.cone(hn, [x, 0.78, z], [x * 1.4, 1.0, z * 1.3], 0.045);
  body.ball('#f2f0e0', 0, 0.55, 0.34, 0.13, 0.12, 0.09).ball('#3fc046', 0, 0.55, 0.42, 0.075, 0.075, 0.03).ball('#061006', 0, 0.55, 0.448, 0.02, 0.055, 0.008)
    .ball('#2a0204', 0, 0.3, 0.34, 0.27, 0.07, 0.09);
  for (let i = 0; i < 11; i++) { const a = -1 + i * 0.2; body.cone('#f8f0e0', [Math.sin(a) * 0.27, 0.36, 0.33 + Math.cos(a) * 0.08], [Math.sin(a) * 0.27, 0.31, 0.33 + Math.cos(a) * 0.08], 0.018); }
  const lid = new Kit([0, 0.55, 0.34]).ball(rd, 0, 0.57, 0.345, 0.14, 0.13, 0.1);
  const jaw = new Kit([0, 0.3, 0.2]).ball(rd, 0, 0.24, 0.32, 0.27, 0.07, 0.11);
  for (let i = 0; i < 11; i++) { const a = -1 + i * 0.2; jaw.cone('#f8f0e0', [Math.sin(a) * 0.25, 0.26, 0.34 + Math.cos(a) * 0.08], [Math.sin(a) * 0.25, 0.31, 0.34 + Math.cos(a) * 0.08], 0.017); }
  const glow = new Kit([0, 0.3, 0.36]).ball('#ff60b0', 0, 0.3, 0.36, 0.11, 0.05, 0.06, true);
  return tpl([['body', null, [0, 0.45, 0], body], ['lid', 'body', [0, 0.55, 0.34], lid], ['jaw', 'body', [0, 0.3, 0.2], jaw], ['flash', 'body', [0, 0.3, 0.36], glow]]);
}
function soulTpl() {
  const bone = '#e8dccb';
  const head = new Kit([0, 0.25, 0]).ball(bone, 0, 0.3, 0, 0.16, 0.15, 0.17).ball(bone, 0, 0.24, 0.08, 0.12, 0.08, 0.1);
  head.mirror(s => { head.ball('#160806', 0.06 * s, 0.3, 0.13, 0.045, 0.04, 0.03); head.ball('#ff4020', 0.06 * s, 0.3, 0.15, 0.015, 0.015, 0.01, true); head.cone('#d8ccb8', [0.12 * s, 0.38, 0], [0.18 * s, 0.5, -0.04], 0.03); });
  head.cone('#2a1410', [0, 0.25, 0.16], [0, 0.22, 0.175], 0.018).box('#f8f0e0', 0, 0.2, 0.15, 0.13, 0.03, 0.03);
  const jaw = new Kit([0, 0.2, 0.02]).ball('#d8ccb8', 0, 0.16, 0.08, 0.11, 0.04, 0.09).box('#f8f0e0', 0, 0.18, 0.15, 0.12, 0.025, 0.025);
  const fl = new Kit([0, 0.3, -0.05]);
  srand(11);
  for (let i = 0; i < 12; i++) {
    const a = rnd() * TAU, l = 0.18 + rnd() * 0.14;
    fl.cone('#ff6a10', [Math.cos(a) * 0.1, 0.3 + Math.sin(a) * 0.1, -0.05], [Math.cos(a) * 0.22, 0.32 + Math.sin(a) * 0.18 + 0.05, -0.05 - l], 0.06, true);
    fl.cone('#ffd040', [Math.cos(a) * 0.08, 0.3 + Math.sin(a) * 0.08, -0.04], [Math.cos(a) * 0.15, 0.32 + Math.sin(a) * 0.12, -0.04 - l * 0.6], 0.03, true);
  }
  return tpl([['head', null, [0, 0.25, 0], head], ['jaw', 'head', [0, 0.2, 0.02], jaw], ['fl', 'head', [0, 0.3, -0.05], fl]]);
}
function baronTpl() {
  const sk = '#c9967c', hi = '#d8a890', fur = '#6e4c32', hn = '#e8dcc0';
  const leg = s => new Kit([0.1 * s, 0.52, 0])
    .chain(fur, [[0.1 * s, 0.52, 0], [0.12 * s, 0.34, 0.08], [0.12 * s, 0.17, -0.05], [0.12 * s, 0.03, 0.02]], 0.075, 0.034)
    .ball('#24160c', 0.12 * s, 0.025, 0.03, 0.04, 0.03, 0.055);
  const body = new Kit([0, 0.52, 0]).ball(fur, 0, 0.55, 0, 0.17, 0.08, 0.12).ball(sk, 0, 0.75, 0, 0.19, 0.21, 0.13);
  body.mirror(s => { body.ball(hi, 0.07 * s, 0.82, 0.07, 0.075, 0.06, 0.05); for (let i = 0; i < 3; i++) body.ball('#b8846c', 0.035 * s, 0.71 - i * 0.05, 0.1, 0.03, 0.022, 0.02); });
  const head = new Kit([0, 0.94, 0]).limb(sk, [0, 0.92, 0], [0, 0.97, 0.01], 0.045, 0.04).ball(sk, 0, 1.01, 0.02, 0.075, 0.085, 0.08).ball(sk, 0, 0.965, 0.05, 0.05, 0.035, 0.05)
    .box('#2a0806', 0, 0.97, 0.095, 0.04, 0.01, 0.01);
  head.mirror(s => { head.ball('#ffe040', 0.027 * s, 1.015, 0.08, 0.013, 0.009, 0.006, true); head.chain(hn, [[0.05 * s, 1.06, 0], [0.13 * s, 1.1, -0.02], [0.18 * s, 1.05, -0.06], [0.19 * s, 0.98, -0.03]], 0.028, 0.008); });
  const arm = s => new Kit([0.21 * s, 0.88, 0]).limb(sk, [0.21 * s, 0.88, 0], [0.26 * s, 0.71, 0.03], 0.06, 0.048).limb(sk, [0.26 * s, 0.71, 0.03], [0.26 * s, 0.55, 0.09], 0.048, 0.038)
    .ball(sk, 0.26 * s, 0.52, 0.1, 0.042);
  const glow = new Kit([-0.26, 0.5, 0.1]).ball('#60ff60', -0.26, 0.48, 0.11, 0.08, 0.08, 0.08, true).ball('#e0ffe0', -0.26, 0.48, 0.11, 0.045, 0.045, 0.045, true);
  return tpl([['legL', null, [0.1, 0.52, 0], leg(1)], ['legR', null, [-0.1, 0.52, 0], leg(-1)], ['body', null, [0, 0.52, 0], body], ['head', 'body', [0, 0.94, 0], head],
    ['armL', 'body', [0.21, 0.88, 0], arm(1)], ['armR', 'body', [-0.21, 0.88, 0], arm(-1)], ['flash', 'armR', [-0.26, 0.5, 0.1], glow]]);
}

// ---------- pickups & props (one joint each, plus optional animated part) ----------
function crossKit(k, x, y, z, w, h, d) {
  k.box('#e4e4dc', x, y, z, w, h, d).box('#c41010', x, y + h / 2 + 0.002, z, w * 0.22, 0.004, d * 0.7).box('#c41010', x, y + h / 2 + 0.002, z, w * 0.7, 0.004, d * 0.22)
    .box('#c41010', x, y, z + d / 2 + 0.002, w * 0.22, h * 0.7, 0.004).box('#c41010', x, y, z + d / 2 + 0.002, w * 0.7, h * 0.22, 0.004);
  return k;
}
const ITEM_KITS = {
  clip: () => { const k = new Kit().box('#3a3428', 0, 0.06, 0, 0.05, 0.12, 0.03); for (let i = 0; i < 3; i++) k.cyl('#d0a848', 0, 0.13, -0.01 + i * 0.01, 0.006, 0.03); return k; },
  ammobox: () => { const k = new Kit().box('#4a5a32', 0, 0.06, 0, 0.26, 0.12, 0.13).box('#2a3420', 0, 0.12, 0, 0.27, 0.01, 0.14); for (let i = 0; i < 6; i++) k.cyl('#d0a848', -0.1 + i * 0.04, 0.135, 0, 0.008, 0.03); return k; },
  shells: () => { const k = new Kit(); for (let i = 0; i < 4; i++) k.cyl('#b8221a', -0.045 + i * 0.03, 0.04, 0, 0.012, 0.06).cyl('#d4a848', -0.045 + i * 0.03, 0.01, 0, 0.0125, 0.02); return k; },
  shellbox: () => { const k = new Kit().box('#9a1c14', 0, 0.06, 0, 0.24, 0.12, 0.14); for (let i = 0; i < 5; i++) k.cyl('#d4a848', -0.08 + i * 0.04, 0.13, 0, 0.012, 0.02); return k; },
  rocket: () => new Kit().cyl('#6a6a5a', 0, 0.13, 0, 0.025, 0.2).cone('#c02018', [0, 0.23, 0], [0, 0.3, 0], 0.025).cone('#4a4a40', [0.03, 0.03, 0], [0.03, 0.08, 0], 0.012).cone('#4a4a40', [-0.03, 0.03, 0], [-0.03, 0.08, 0], 0.012),
  rocketbox: () => { const k = new Kit().box('#5a4a30', 0, 0.06, 0, 0.3, 0.12, 0.14); for (let i = 0; i < 3; i++) k.cyl('#6a6a5a', -0.08 + i * 0.08, 0.13, 0, 0.022, 0.04, [Math.PI / 2, 0, 0]).cone('#c02018', [-0.08 + i * 0.08, 0.13, 0.02], [-0.08 + i * 0.08, 0.13, 0.06], 0.02); return k; },
  cell: () => new Kit().box('#3a3e48', 0, 0.05, 0, 0.12, 0.1, 0.08).box('#50ff80', 0, 0.07, 0.042, 0.06, 0.02, 0.004, [0, 0, 0], true),
  cellpack: () => new Kit().box('#3a3e48', 0, 0.09, 0, 0.26, 0.18, 0.14).box('#50ff80', -0.06, 0.12, 0.072, 0.05, 0.03, 0.004, [0, 0, 0], true).box('#50ff80', 0.06, 0.12, 0.072, 0.05, 0.03, 0.004, [0, 0, 0], true).box('#22262e', 0, 0.185, 0, 0.12, 0.02, 0.05),
  stim: () => crossKit(new Kit(), 0, 0.045, 0, 0.12, 0.09, 0.07),
  medikit: () => crossKit(new Kit(), 0, 0.075, 0, 0.26, 0.15, 0.13).box('#555', 0, 0.165, 0, 0.08, 0.03, 0.02),
  soulsphere: () => new Kit().ball('#3a6af0', 0, 0.3, 0, 0.17, 0.17, 0.17, true).ball('#0a1440', 0.05, 0.33, 0.15, 0.03).ball('#0a1440', -0.05, 0.33, 0.15, 0.03).ball('#0a1440', 0, 0.25, 0.155, 0.045, 0.02, 0.02),
  greenarmor: () => new Kit().ball('#2e8a2e', 0, 0.16, 0, 0.17, 0.15, 0.07).ball('#3aa63a', 0, 0.18, 0.04, 0.13, 0.11, 0.05).ball('#2e8a2e', 0.13, 0.27, 0, 0.06, 0.04, 0.06).ball('#2e8a2e', -0.13, 0.27, 0, 0.06, 0.04, 0.06).box('#124012', 0, 0.28, 0.02, 0.07, 0.04, 0.08),
  bluearmor: () => new Kit().ball('#2a4ad0', 0, 0.16, 0, 0.17, 0.15, 0.07).ball('#3a66f0', 0, 0.18, 0.04, 0.13, 0.11, 0.05).ball('#2a4ad0', 0.13, 0.27, 0, 0.06, 0.04, 0.06).ball('#2a4ad0', -0.13, 0.27, 0, 0.06, 0.04, 0.06).box('#0a1450', 0, 0.28, 0.02, 0.07, 0.04, 0.08),
  redkey: () => new Kit().box('#e01818', 0, 0.12, 0, 0.08, 0.12, 0.012, [0, 0, 0], true).box('#ffffff', 0, 0.14, 0.007, 0.05, 0.015, 0.002),
  bluekey: () => new Kit().box('#2050f0', 0, 0.12, 0, 0.08, 0.12, 0.012, [0, 0, 0], true).box('#ffffff', 0, 0.14, 0.007, 0.05, 0.015, 0.002),
  barrel: () => { const k = new Kit().cyl('#56664a', 0, 0.3, 0, 0.2, 0.58, [0, 0, 0], false, 16); for (const y of [0.1, 0.3, 0.5]) k.cyl('#34402c', 0, y, 0, 0.205, 0.025, [0, 0, 0], false, 16); return k.cyl('#40ff40', 0, 0.595, 0, 0.17, 0.01, [0, 0, 0], true, 16).box('#40e030', 0.12, 0.52, 0.12, 0.02, 0.12, 0.02, [0, 0.8, 0], true); },
  lamp: () => new Kit().cyl('#3a3a40', 0, 0.03, 0, 0.12, 0.06).cyl('#5a5a62', 0, 0.55, 0, 0.025, 1.0).cyl('#3a3a40', 0, 1.0, 0, 0.07, 0.04).ball('#fffbea', 0, 1.08, 0, 0.07, 0.09, 0.07, true),
  torch: () => new Kit().cyl('#3a2418', 0, 0.03, 0, 0.09, 0.06).cyl('#5a3a28', 0, 0.42, 0, 0.03, 0.8).cyl('#3a2418', 0, 0.83, 0, 0.06, 0.04),
};
const FLAME = () => new Kit([0, 0.86, 0]).cone('#ff4a10', [0, 0.85, 0], [0, 1.08, 0], 0.07, true).cone('#ffcc40', [0, 0.85, 0], [0, 1.0, 0], 0.04, true)
  .cone('#ff6a10', [0.03, 0.85, 0], [0.06, 1.0, 0.02], 0.035, true).cone('#ff6a10', [-0.03, 0.85, 0], [-0.05, 1.0, -0.02], 0.035, true);

// ---------- first-person weapons ----------
const VM = {}, SKIN = '#c48a66', SKIN_D = '#a8704e', SLEEVE = '#3e5a2c', GLOVE = '#4a3a2c';
// Right hand gripping a cylinder of radius rg whose axis is local Y, centered at the origin.
// Back of the hand on the right/back side, fingers packed together wrapping the front (-Z) toward the left,
// thumb over the top. opt.axis: forearm runs along +Y (for horizontal grips like a pump: rotate the joint
// by +PI/2 around X so local Y points at the camera). opt.fist: fingertips tuck into the palm.
function handKit(rg, opt = {}) {
  const k = new Kit(), sk = opt.skin || SKIN, fr = 0.0112, R = rg + fr * 0.95, fy = opt.axis ? -1 : 1;
  const pa = Math.PI / 4;
  k.ballR(sk, Math.cos(pa) * (rg + 0.016), 0.002 * fy, Math.sin(pa) * (rg + 0.016), 0.037, 0.05, 0.02, [0, Math.PI / 2 - pa, 0]);
  const ys = [0.034, 0.012, -0.01, -0.031], ends = opt.fist ? [-3.3, -3.35, -3.3, -3.1] : [-2.45, -2.5, -2.4, -2.2];
  ys.forEach((y0, i) => {
    const y = y0 * fy, r = fr - i * 0.0007;
    const angs = [0.35, -0.5, -1.35, ends[i]];
    const rad = j => (opt.fist ? [R + 0.004, R, R - 0.002, R - 0.008][j] : R + (j ? 0 : 0.005));
    const pts = angs.map((a, j) => [Math.cos(a) * rad(j), y, Math.sin(a) * rad(j)]);
    k.chain(sk, pts, r * 1.05, r * 0.85);
    k.ball(SKIN_D, pts[1][0], y, pts[1][2], r * 1.08, r * 1.0, r * 1.08);
  });
  const ty = (opt.fist ? 0.0 : 0.047) * fy;
  const tp = (opt.fist ? [0.9, 0.2, -0.6] : [1.15, 1.9, 2.55]).map((a, j) => [Math.cos(a) * (R + 0.008 + (opt.fist ? 0.012 : 0)), ty + (opt.fist ? 0.028 * fy : 0), Math.sin(a) * (R + 0.008 + (opt.fist ? 0.012 : 0))]);
  k.chain(sk, [[Math.cos(0.75) * (rg + 0.022), 0.018 * fy, Math.sin(0.75) * (rg + 0.022)], ...tp], 0.0135, 0.0105);
  let wr, mid, el;
  if (opt.axis) { wr = [0.022, 0.05, rg + 0.016]; mid = [0.03, 0.2, rg + 0.07]; el = [0.04, 0.44, rg + 0.15]; }
  else { wr = [0.016, -0.05, rg + 0.03]; mid = [0.035, -0.105, rg + 0.2]; el = [0.06, -0.17, rg + 0.42]; }
  k.ball(sk, wr[0], wr[1], wr[2], 0.032, 0.034, 0.032);
  k.limb(sk, wr, mid, 0.033, 0.037);
  k.limb(SLEEVE, mid, el, 0.044, 0.054);
  return k;
}
// assemble a weapon: parts = gun kits per joint, hands placed with [pos, rot, mirror]
function vmTpl(list) { return tpl(list); }
function initModels() {
  MODELS.zombie = soldierTpl({ skin: '#9c8676', armor: '#4f6c39', armorHi: '#68884c', pants: '#5b4733', boot: '#2a221c', belt: '#2b2218', gun: '#2a2a2e', stock: '#5a3d22', hair: '#2a1e16', eye: '#ff2010' });
  MODELS.sergeant = soldierTpl({ skin: '#7a685c', armor: '#2e2f34', armorHi: '#45474e', pants: '#3b3c44', boot: '#18181c', belt: '#4a3a24', gun: '#2a2a30', stock: '#6b4423', hair: '#141010', eye: '#ffe020', shotgun: true });
  MODELS.imp = impTpl(); MODELS.demon = demonTpl(); MODELS.spectre = MODELS.demon;
  MODELS.caco = cacoTpl(); MODELS.lostsoul = soulTpl(); MODELS.baron = baronTpl();
  for (const k in ITEM_KITS) MODELS[k] = tpl([['main', null, [0, 0, 0], ITEM_KITS[k]()]].concat(k === 'torch' ? [['fl', 'main', [0, 0.86, 0], FLAME()]] : []));
  // weapons (camera space)
  const metal = '#3c3c46', dark = '#22222a', wood = '#7a4a24';
  const pistol = new Kit([0, 0, 0])
    .box(metal, 0, 0.034, -0.07, 0.032, 0.036, 0.2).box('#4c4c58', 0, 0.053, -0.07, 0.022, 0.004, 0.19)
    .box(dark, 0, 0.008, -0.06, 0.029, 0.022, 0.16).cyl(dark, 0, 0.03, -0.172, 0.009, 0.012, [Math.PI / 2, 0, 0])
    .box(dark, 0, 0.056, -0.165, 0.005, 0.008, 0.008).box(dark, 0, 0.056, 0.022, 0.016, 0.008, 0.008)
    .box(dark, 0, -0.006, -0.085, 0.006, 0.022, 0.045).box('#2a2a30', 0, -0.045, -0.005, 0.028, 0.095, 0.042, [-0.25, 0, 0]);
  for (let i = 0; i < 5; i++) pistol.box('#26262c', 0, 0.034, 0.005 + i * 0.006, 0.0335, 0.03, 0.002);
  VM.pistol = { T: vmTpl([['gun', null, [0, 0, 0], pistol], ['handR', 'gun', [0, -0.045, -0.005], handKit(0.02)]]),
    base: [0.1, -0.13, -0.31], muzzle: [0, 0.03, -0.185], hands: { handR: [[-0.25, 0, 0], 1] } };
  const shot = new Kit().cyl(dark, 0, 0.032, -0.3, 0.013, 0.56, [Math.PI / 2, 0, 0]).cyl('#30303a', 0, 0.006, -0.25, 0.011, 0.44, [Math.PI / 2, 0, 0])
    .box(metal, 0, 0.02, -0.015, 0.042, 0.055, 0.15).box('#4a4a56', 0, 0.049, -0.015, 0.03, 0.004, 0.14).box(dark, 0, 0.05, -0.575, 0.006, 0.01, 0.01)
    .box(wood, 0, -0.012, 0.11, 0.036, 0.05, 0.17, [0.22, 0, 0]).box(wood, 0, -0.04, 0.045, 0.03, 0.075, 0.036, [-0.35, 0, 0]);
  const pump = new Kit([0, 0.004, -0.22]).cyl(wood, 0, 0.004, -0.22, 0.021, 0.14, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 5; i++) pump.cyl('#4a2a12', 0, 0.004, -0.27 + i * 0.025, 0.0218, 0.006, [Math.PI / 2, 0, 0]);
  VM.shotgun = { T: vmTpl([['gun', null, [0, 0, 0], shot], ['pump', 'gun', [0, 0.004, -0.22], pump], ['handR', 'gun', [0, -0.04, 0.045], handKit(0.019)], ['handL', 'pump', [0, 0.004, -0.22], handKit(0.021, { axis: true })]]),
    base: [0.085, -0.14, -0.31], muzzle: [0, 0.032, -0.6], hands: { handR: [[-0.35, 0, 0], 1], handL: [[Math.PI / 2, 0, 0.35], -1] } };
  const chain = new Kit().cyl('#44444c', 0, 0.02, -0.02, 0.052, 0.2, [Math.PI / 2, 0, 0], false, 16).box('#3a3a42', 0, 0.075, -0.02, 0.02, 0.03, 0.14).box(dark, 0, -0.04, 0.06, 0.03, 0.08, 0.04, [-0.3, 0, 0])
    .cyl('#4a4a52', -0.06, -0.01, -0.12, 0.014, 0.08, [0, 0, 0]);
  const spin = new Kit([0, 0.02, -0.12]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; spin.cyl(i % 2 ? '#2a2a30' : '#33333b', Math.cos(a) * 0.028, 0.02 + Math.sin(a) * 0.028, -0.3, 0.008, 0.38, [Math.PI / 2, 0, 0]); }
  spin.cyl('#55555e', 0, 0.02, -0.46, 0.042, 0.016, [Math.PI / 2, 0, 0], false, 16).cyl('#55555e', 0, 0.02, -0.25, 0.042, 0.016, [Math.PI / 2, 0, 0], false, 16);
  VM.chaingun = { T: vmTpl([['gun', null, [0, 0, 0], chain], ['spin', 'gun', [0, 0.02, -0.12], spin], ['handR', 'gun', [0, -0.04, 0.06], handKit(0.019)], ['handL', 'gun', [-0.06, -0.01, -0.12], handKit(0.016)]]),
    base: [0.1, -0.16, -0.38], muzzle: [0, 0.02, -0.48], hands: { handR: [[-0.3, 0, 0], 1], handL: [[0.1, 0.5, 0], -1] } };
  const rl = new Kit().cyl('#5a5c3a', 0, 0.02, -0.18, 0.056, 0.62, [Math.PI / 2, 0, 0], false, 18).cyl('#3a3c26', 0, 0.02, -0.48, 0.06, 0.03, [Math.PI / 2, 0, 0], false, 18)
    .cyl('#3a3c26', 0, 0.02, 0.12, 0.06, 0.03, [Math.PI / 2, 0, 0], false, 18).cyl('#0e0e0a', 0, 0.02, -0.49, 0.046, 0.032, [Math.PI / 2, 0, 0], false, 18)
    .box('#3a3c2a', -0.055, 0.075, -0.1, 0.03, 0.04, 0.12).box(dark, 0, -0.06, -0.12, 0.028, 0.07, 0.035, [-0.2, 0, 0]).box(dark, 0, -0.06, 0.02, 0.028, 0.07, 0.035, [-0.3, 0, 0]);
  for (let i = 0; i < 5; i++) rl.cyl(i % 2 ? '#c8a020' : '#1a1a10', 0, 0.02, -0.42 + i * 0.012, 0.0575, 0.012, [Math.PI / 2, 0, 0], false, 18);
  const tip = new Kit([0, 0.02, -0.47]).cone('#c02018', [0, 0.02, -0.45], [0, 0.02, -0.51], 0.03);
  VM.launcher = { T: vmTpl([['gun', null, [0, 0, 0], rl], ['tip', 'gun', [0, 0.02, -0.47], tip], ['handR', 'gun', [0, -0.065, 0.02], handKit(0.019)], ['handL', 'gun', [0, -0.065, -0.12], handKit(0.019)]]),
    base: [0.15, -0.16, -0.36], muzzle: [0, 0.02, -0.52], hands: { handR: [[-0.3, 0, 0], 1], handL: [[-0.15, 0.5, 0], -1] } };
  const pl = new Kit().box('#3a4458', 0, 0.015, -0.12, 0.07, 0.07, 0.34).box('#2a3040', 0, 0.06, -0.1, 0.04, 0.025, 0.24).cyl('#2a3040', 0, 0.015, -0.31, 0.024, 0.06, [Math.PI / 2, 0, 0])
    .box(dark, 0, -0.045, 0.02, 0.028, 0.08, 0.036, [-0.3, 0, 0]).box(dark, 0, -0.045, -0.18, 0.026, 0.07, 0.032, [-0.15, 0, 0]);
  for (let i = 0; i < 4; i++) pl.box('#70c0ff', 0, 0.015, -0.24 + i * 0.05, 0.074, 0.074, 0.012, [0, 0, 0], true);
  pl.cyl('#90d8ff', 0, 0.015, -0.342, 0.012, 0.006, [Math.PI / 2, 0, 0], true);
  VM.plasma = { T: vmTpl([['gun', null, [0, 0, 0], pl], ['handR', 'gun', [0, -0.045, 0.02], handKit(0.019)], ['handL', 'gun', [0, -0.045, -0.18], handKit(0.018)]]),
    base: [0.1, -0.14, -0.33], muzzle: [0, 0.015, -0.35], hands: { handR: [[-0.3, 0, 0], 1], handL: [[-0.15, 0.55, 0], -1] } };
  VM.fist = { T: vmTpl([['gun', null, [0, 0, 0], new Kit()], ['handR', 'gun', [0.11, -0.01, 0], handKit(0.014, { fist: true })], ['handL', 'gun', [-0.2, -0.03, 0.03], handKit(0.014, { fist: true })]]),
    base: [0.02, -0.13, -0.27], muzzle: null, hands: { handR: [[0.15, -0.2, 0.1], 1], handL: [[0.15, 0.2, -0.1], -1] } };
}
