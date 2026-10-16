'use strict';
// Builds the 3D level from the grid: sectors with floor/ceiling heights, walls,
// steps, rising doors and a sky. Static lighting (with shadows) is baked into
// vertices; up to 8 dynamic lights per frame are added in the shader.
// Map coordinates: x east, y south, z up. Three.js coordinates: (x, z, y).
const STEP = 0.46, EYE = 0.66, PH = 0.875, PR = 0.25;
const OOB = { solid: true, wt: 'rock', f: 0, c: 0 };
let WD = null;

// Cover pieces replace the floor of a cell with a raised block (crate top / barrier top),
// keeping that cell's ceiling, sky and lighting. Low ones hide a crouching player.
const COVER = {
  crate: { f: 0.62, top: 'cratetop', side: 'crate' },
  barrier: { f: 0.56, top: 'concrete', side: 'concrete' },
  stack: { f: 1.2, top: 'cratetop', side: 'crate' },
};
function parseLevel(L) {
  const H = L.map.length, W = L.map[0].length, cells = new Array(W * H), doors = [];
  L.map.forEach((row, y) => { if (row.length !== W) console.error('map row width', L.name, y, row.length); });
  const pil = new Map((L.pillars || []).map(([c, x, y]) => [y * W + x, c]));
  const cov = new Map((L.cover || []).map(([k, x, y]) => [y * W + x, k]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = pil.get(y * W + x) || L.map[y][x] || '#';
    const w = L.walls[ch];
    if (w) { cells[y * W + x] = { solid: true, wt: w.t, exit: !!w.exit, x, y }; continue; }
    const s = L.sectors[ch];
    if (!s) { console.error('unknown map char', ch, x, y); cells[y * W + x] = { solid: true, wt: L.defWall, x, y }; continue; }
    const c = { solid: false, x, y, f: s.f, c: s.c, ft: s.ft, ct: s.ct, sky: !!s.sky, liquid: s.liquid || null, amb: s.l, side: s.side, up: s.up, lit: !!s.lit };
    if (s.door) { c.door = { x, y, f: s.f, top: s.c, cur: s.f, state: 0, timer: 0, key: s.key || null, tex: s.tex, ns: false, mesh: null }; doors.push(c.door); }
    const cv = cov.get(y * W + x);
    if (cv) { const k = COVER[cv]; Object.assign(c, { f: k.f, ft: k.top, side: k.side, liquid: null, cover: true }); }
    cells[y * W + x] = c;
  }
  WD = { W, H, cells, doors, lg: null, seen: new Uint8Array(W * H) };
  for (const d of doors) d.ns = cellAt(d.x, d.y - 1).solid && cellAt(d.x, d.y + 1).solid;
  return WD;
}
function cellAt(cx, cy) { return (cx < 0 || cy < 0 || cx >= WD.W || cy >= WD.H) ? OOB : WD.cells[cy * WD.W + cx]; }
function cell(x, y) { return cellAt(Math.floor(x), Math.floor(y)); }
function ceilOf(c) { return c.door ? c.door.cur : c.c; }

// ---------- shaders ----------
const SU = {
  dlPos: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
  dlCol: { value: Array.from({ length: 8 }, () => new THREE.Vector3()) },
  dlRad: { value: new Float32Array(8).fill(1) },
  dlN: { value: 0 },
  fogCol: { value: new THREE.Vector3() },
  fogDen: { value: 0.004 },
  gain: { value: 1 },
  time: { value: 0 },
  detail: { value: null },
};
const GLSL_COMMON = `
uniform vec3 dlPos[8]; uniform vec3 dlCol[8]; uniform float dlRad[8]; uniform int dlN;
uniform vec3 fogCol; uniform float fogDen; uniform float gain; uniform float time;
vec3 fogIt(vec3 c, vec3 w){ float d=length(w-cameraPosition); return mix(c,fogCol,1.0-exp(-fogDen*d*d)); }
`;
const WORLD_VS = `
attribute vec4 tang; attribute vec3 blight;
varying vec2 vUv; varying vec3 vL; varying vec3 vW; varying vec3 vN; varying vec4 vT;
void main(){ vUv=uv; vL=blight; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normal; vT=tang; gl_Position=projectionMatrix*viewMatrix*w; }`;
const WORLD_FS = GLSL_COMMON + `
uniform sampler2D map; uniform sampler2D nmap; uniform vec2 scroll; uniform float emis; uniform sampler2D detail;
varying vec2 vUv; varying vec3 vL; varying vec3 vW; varying vec3 vN; varying vec4 vT;
void main(){
  vec2 uv=vUv+scroll;
  vec4 tc=texture2D(map,uv);
  // break up visible tiling: slow world-space variation plus fine grain that only shows up close
  float macro=texture2D(detail,vW.xz*0.043+vec2(vW.y*0.031,vW.y*0.017)).r;
  float micro=texture2D(detail,uv*4.0).g;
  float near=clamp(1.0-length(vW-cameraPosition)/6.0,0.0,1.0);
  tc.rgb*=mix(0.78,1.16,macro)*mix(1.0,0.86+micro*0.28,near*(1.0-tc.a));
  vec4 nm=texture2D(nmap,uv); vec3 nt=nm.xyz*2.0-1.0; float gloss=nm.a;
  vec3 N=normalize(vN), T=normalize(vT.xyz), B=cross(N,T)*vT.w;
  vec3 n=normalize(T*nt.x+B*nt.y+N*nt.z);
  vec3 V=normalize(cameraPosition-vW);
  float bump=clamp(dot(nt,vec3(-0.38,0.45,0.81)),0.0,1.25)/0.81;
  vec3 light=vL*mix(1.0,bump,0.6), spec=vec3(0.0);
  float sp=8.0+gloss*72.0;
  for(int i=0;i<8;i++){
    if(i>=dlN) break;
    vec3 Lv=dlPos[i]-vW; float d=length(Lv); float a=clamp(1.0-d/dlRad[i],0.0,1.0); a*=a;
    vec3 L=Lv/max(d,0.001);
    light+=dlCol[i]*a*(0.15+0.85*max(dot(n,L),0.0));
    spec+=dlCol[i]*a*pow(max(dot(n,normalize(L+V)),0.0),sp)*gloss*1.6;
  }
  vec3 R=reflect(-V,n);
  spec+=vL*pow(max(R.y,0.0),6.0)*gloss*0.28 + vL*pow(max(dot(R,normalize(vec3(0.4,0.7,0.3))),0.0),24.0)*gloss*0.35;
  vec3 c=(tc.rgb*light+spec)*gain + tc.rgb*tc.a*emis;
  gl_FragColor=vec4(fogIt(c,vW),1.0);
}`;
const SPRITE_VS = `
varying vec2 vUv; varying vec3 vW;
void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const SPRITE_FS = GLSL_COMMON + `
uniform sampler2D map; uniform vec3 tint; uniform float bright; uniform float fuzz; uniform float flash;
varying vec2 vUv; varying vec3 vW;
void main(){
  vec4 tc=texture2D(map,vUv);
  if(tc.a<0.5) discard;
  vec3 light=mix(tint,vec3(1.0),bright);
  for(int i=0;i<8;i++){
    if(i>=dlN) break;
    float d=length(dlPos[i]-vW); float a=clamp(1.0-d/dlRad[i],0.0,1.0); light+=dlCol[i]*a*a*0.8;
  }
  vec3 c=min(tc.rgb*light*gain+vec3(flash),vec3(1.0));
  c=fogIt(c,vW);
  if(fuzz>0.5){
    float nz=fract(sin(dot(floor(gl_FragCoord.xy/3.0)+vec2(time*13.0,time*7.0),vec2(12.9898,78.233)))*43758.5453);
    gl_FragColor=vec4(c*0.12,0.25+0.45*nz); return;
  }
  gl_FragColor=vec4(c,1.0);
}`;
const MAT = {};
function worldMat(name) {
  if (MAT[name]) return MAT[name];
  const T = TEX[name] || TEX.tech;
  MAT[name] = new THREE.ShaderMaterial({
    uniforms: { ...SU, map: { value: T.map }, nmap: { value: T.nmap }, scroll: { value: new THREE.Vector2() }, emis: { value: T.emis } },
    vertexShader: WORLD_VS, fragmentShader: WORLD_FS,
  });
  return MAT[name];
}
function spriteMat(tex, opts = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...SU, map: { value: tex }, tint: { value: new THREE.Vector3(1, 1, 1) }, bright: { value: opts.bright ? 1 : 0 }, fuzz: { value: opts.fuzz ? 1 : 0 }, flash: { value: 0 } },
    vertexShader: SPRITE_VS, fragmentShader: SPRITE_FS,
    transparent: !!opts.fuzz, depthWrite: !opts.fuzz,
  });
  return m;
}

// ---------- baked lighting ----------
let BAKE_LIGHTS = [], BAKE_L = null;
function bakeClear(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.sqrt(dx * dx + dy * dy + dz * dz), n = Math.ceil(d / 0.1);
  for (let i = 1; i < n; i++) {
    const t = i / n, c = cell(ax + dx * t, ay + dy * t), z = az + dz * t;
    if (c.solid || c.door || z < c.f - 0.01 || z > c.c + 0.01) return false;
  }
  return true;
}
// fraction of nearby probe points that are open air; darkens corners and the foot of walls
const AO_DIRS = [];
for (const r of [0.22, 0.45]) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; AO_DIRS.push([Math.cos(a) * r, Math.sin(a) * r, 0], [Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, r * 0.7], [Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7, -r * 0.7]); }
function bakeAO(px, py, pz, N) {
  let occ = 0, tot = 0;
  for (const d of AO_DIRS) {
    const dot = d[0] * N[0] + d[1] * N[1] + d[2] * N[2];
    if (dot < -0.02) continue;
    const x = px + d[0] + N[0] * 0.03, y = py + d[1] + N[1] * 0.03, z = pz + d[2] + N[2] * 0.03, c = cell(x, y), w = 1 / (0.3 + Math.hypot(d[0], d[1], d[2]));
    tot += w;
    if (c.solid || c.door || z < c.f || (!c.sky && z > c.c)) occ += w;
  }
  return tot ? 1 - 0.62 * occ / tot : 1;
}
function lightAt(px, py, pz, nx, ny, nz, amb, sky, omni, out) {
  const L = BAKE_L;
  let r = amb * L.amb[0], g = amb * L.amb[1], b = amb * L.amb[2];
  if (sky) {
    const s = L.sun, nd = omni ? 0.55 : Math.max(0, nx * s[0] + ny * s[1] + nz * s[2]);
    r += (0.12 + nd * 0.4) * L.sunCol[0]; g += (0.12 + nd * 0.4) * L.sunCol[1]; b += (0.12 + nd * 0.4) * L.sunCol[2];
  }
  for (const l of BAKE_LIGHTS) {
    const dx = l.x - px, dy = l.y - py, dz = l.z - pz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > l.r * l.r) continue;
    const d = Math.sqrt(d2) || 1e-3;
    let ndl = omni ? 1 : (dx * nx + dy * ny + dz * nz) / d;
    if (ndl <= -0.1) continue;
    ndl = clamp((ndl + 0.15) / 1.15, 0, 1);
    if (!bakeClear(px, py, pz, l.x, l.y, l.z)) continue;
    const att = (1 - d / l.r) * (1 - d / l.r) * ndl * 1.5;
    r += l.c[0] * att; g += l.c[1] * att; b += l.c[2] * att;
  }
  out[0] = Math.min(r, 2.2); out[1] = Math.min(g, 2.2); out[2] = Math.min(b, 2.2);
}
function collectLights(L, things) {
  const out = [];
  for (const c of WD.cells) {
    if (c.solid) continue;
    if (c.lit && !c.door && c.x % 2 === 0 && c.y % 2 === 0) out.push({ x: c.x + 0.5, y: c.y + 0.5, z: c.c - 0.12, r: 4.6, c: [0.82, 0.8, 0.74] });
    if (c.liquid === 'nukage' && (c.x + c.y) % 2 === 0) out.push({ x: c.x + 0.5, y: c.y + 0.5, z: c.f + 0.18, r: 2.6, c: [0.18, 0.7, 0.12] });
    if (c.liquid === 'lava' && (c.x + c.y) % 2 === 0) out.push({ x: c.x + 0.5, y: c.y + 0.5, z: c.f + 0.25, r: 3.4, c: [1.1, 0.38, 0.06] });
  }
  for (const c of WD.cells) {
    if (!c.exit) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nb = cellAt(c.x + dx, c.y + dy);
      if (!nb.solid) out.push({ x: c.x + 0.5 + dx * 0.85, y: c.y + 0.5 + dy * 0.85, z: nb.f + 1.2, r: 2.6, c: [1.0, 0.12, 0.08] });
    }
  }
  for (const t of things) {
    const lt = { lamp: [1.0, 5.6, [1.05, 1.02, 0.95]], torch: [0.9, 5, [1.25, 0.5, 0.16]], soulsphere: [0.4, 2.6, [0.3, 0.42, 1.2]], redkey: [0.2, 1.6, [0.9, 0.1, 0.05]], bluekey: [0.2, 1.6, [0.1, 0.25, 1.0]], barrel: [0.6, 1.4, [0.15, 0.6, 0.1]] }[t.type];
    if (lt) out.push({ x: t.x, y: t.y, z: t.z + lt[0], r: lt[1], c: lt[2] });
  }
  return out;
}

// ---------- geometry ----------
function newGroup() { return { p: [], n: [], u: [], t: [], l: [], idx: [] }; }
const _lc = [0, 0, 0];
// rectangle o + i/su*U + j/sv*V (map coords); uvf maps a map point to [u, v]
function rect(g, o, U, V, N, T, Bv, uvf, su, sv, cl) {
  const base = g.p.length / 3;
  const N3 = [N[0], N[2], N[1]], T3 = [T[0], T[2], T[1]], B3 = [Bv[0], Bv[2], Bv[1]];
  const cx = [N3[1] * T3[2] - N3[2] * T3[1], N3[2] * T3[0] - N3[0] * T3[2], N3[0] * T3[1] - N3[1] * T3[0]];
  const w = cx[0] * B3[0] + cx[1] * B3[1] + cx[2] * B3[2] >= 0 ? 1 : -1;
  for (let j = 0; j <= sv; j++) for (let i = 0; i <= su; i++) {
    const a = i / su, b = j / sv;
    const x = o[0] + U[0] * a + V[0] * b, y = o[1] + U[1] * a + V[1] * b, z = o[2] + U[2] * a + V[2] * b;
    g.p.push(x, z, y); g.n.push(N3[0], N3[1], N3[2]); g.t.push(T3[0], T3[1], T3[2], w);
    const uv = uvf(x, y, z, a, b); g.u.push(uv[0], uv[1]);
    // sample light slightly off the surface and inside the owning cell
    const sx = clamp(x + N[0] * 0.04, cl.x0 + 0.03, cl.x0 + 0.97), sy = clamp(y + N[1] * 0.04, cl.y0 + 0.03, cl.y0 + 0.97);
    lightAt(sx, sy, z + N[2] * 0.04, N[0], N[1], N[2], cl.amb, cl.sky, false, _lc);
    const ao = bakeAO(sx, sy, z + N[2] * 0.04, N);
    g.l.push(_lc[0] * ao, _lc[1] * ao, _lc[2] * ao);
  }
  const U3 = [U[0], U[2], U[1]], V3 = [V[0], V[2], V[1]];
  const fr = (U3[1] * V3[2] - U3[2] * V3[1]) * N3[0] + (U3[2] * V3[0] - U3[0] * V3[2]) * N3[1] + (U3[0] * V3[1] - U3[1] * V3[0]) * N3[2] > 0;
  for (let j = 0; j < sv; j++) for (let i = 0; i < su; i++) {
    const a = base + j * (su + 1) + i, b = a + 1, c = a + su + 2, d = a + su + 1;
    if (fr) g.idx.push(a, b, c, a, c, d); else g.idx.push(a, c, b, a, d, c);
  }
}
function groupMesh(g, mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
  geo.setAttribute('tang', new THREE.Float32BufferAttribute(g.t, 4));
  geo.setAttribute('blight', new THREE.Float32BufferAttribute(g.l, 3));
  geo.setIndex(g.idx);
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, mat);
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function wallFace(g, cx, cy, dx, dy, z0, z1, cl, stretch) {
  if (z1 - z0 < 0.005) return;
  const N = [-dx, -dy, 0], T = [N[1], -N[0], 0];
  let o, U;
  if (dx) { const ex = dx > 0 ? cx + 1 : cx; o = [ex, cy, z0]; U = [0, 1, 0]; }
  else { const ey = dy > 0 ? cy + 1 : cy; o = [cx, ey, z0]; U = [1, 0, 0]; }
  const u0 = Math.min(o[0] * T[0] + o[1] * T[1], (o[0] + U[0]) * T[0] + (o[1] + U[1]) * T[1]);
  const uvf = stretch
    ? (x, y, z) => [x * T[0] + y * T[1] - u0, (z - z0) / (z1 - z0)]
    : (x, y, z) => [x * T[0] + y * T[1], z];
  rect(g, o, U, [0, 0, z1 - z0], N, T, [0, 0, 1], uvf, 2, Math.max(1, Math.ceil((z1 - z0) / 0.5)), cl);
}

function buildWorld(L, things) {
  BAKE_L = L;
  BAKE_LIGHTS = collectLights(L, things);
  const root = new THREE.Group(), groups = new Map();
  const grp = name => { let g = groups.get(name); if (!g) { g = newGroup(); groups.set(name, g); } return g; };
  for (const c of WD.cells) {
    if (c.solid) continue;
    const cx = c.x, cy = c.y, cl = { x0: cx, y0: cy, amb: c.amb, sky: c.sky };
    const myC = c.door ? c.door.top : c.c;
    rect(grp(c.ft), [cx, cy, c.f], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0], (x, y) => [x, y], 2, 2, cl);
    if (!c.sky) rect(grp(c.ct), [cx, cy, myC], [1, 0, 0], [0, 1, 0], [0, 0, -1], [1, 0, 0], [0, 1, 0], (x, y) => [x, y], 2, 2, cl);
    for (const [dx, dy] of DIRS) {
      const nb = cellAt(cx + dx, cy + dy);
      if (nb.solid) {
        const tex = c.door ? 'track' : nb.wt;
        wallFace(grp(tex), cx, cy, dx, dy, c.f, myC, cl, TEX[tex] && TEX[tex].stretch);
        continue;
      }
      const nbC = nb.door ? nb.door.top : nb.c;
      if (nb.f > c.f) wallFace(grp(nb.side || 'step'), cx, cy, dx, dy, c.f, nb.f, cl, !!nb.cover);
      if (nbC < myC && !(c.sky && nb.sky)) wallFace(grp(c.up || L.defWall), cx, cy, dx, dy, nbC, myC, cl, false);
    }
  }
  for (const [name, g] of groups) root.add(groupMesh(g, worldMat(name)));
  // rising door slabs (geometry local to the closed position; the mesh moves up)
  for (const d of WD.doors) {
    const gs = new Map(), gd = n => { let g = gs.get(n); if (!g) { g = newGroup(); gs.set(n, g); } return g; };
    const h = d.top - d.f, cl = { x0: d.x, y0: d.y, amb: cellAt(d.x, d.y).amb + 0.05, sky: false }, t = 0.25;
    if (d.ns) {
      const x0 = d.x + 0.5 - t / 2, x1 = d.x + 0.5 + t / 2;
      rect(gd(d.tex), [x1, d.y, d.f], [0, 1, 0], [0, 0, h], [1, 0, 0], [0, -1, 0], [0, 0, 1], (x, y, z) => [-y, z - d.f], 2, 4, cl);
      rect(gd(d.tex), [x0, d.y, d.f], [0, 1, 0], [0, 0, h], [-1, 0, 0], [0, 1, 0], [0, 0, 1], (x, y, z) => [y, z - d.f], 2, 4, cl);
      rect(gd('step'), [x0, d.y, d.f], [t, 0, 0], [0, 1, 0], [0, 0, -1], [1, 0, 0], [0, 1, 0], (x, y) => [x, y], 1, 2, cl);
    } else {
      const y0 = d.y + 0.5 - t / 2, y1 = d.y + 0.5 + t / 2;
      rect(gd(d.tex), [d.x, y1, d.f], [1, 0, 0], [0, 0, h], [0, 1, 0], [1, 0, 0], [0, 0, 1], (x, y, z) => [x, z - d.f], 2, 4, cl);
      rect(gd(d.tex), [d.x, y0, d.f], [1, 0, 0], [0, 0, h], [0, -1, 0], [-1, 0, 0], [0, 0, 1], (x, y, z) => [-x, z - d.f], 2, 4, cl);
      rect(gd('step'), [d.x, y0, d.f], [1, 0, 0], [0, t, 0], [0, 0, -1], [1, 0, 0], [0, 1, 0], (x, y) => [x, y], 2, 1, cl);
    }
    d.mesh = new THREE.Group();
    for (const [name, g] of gs) d.mesh.add(groupMesh(g, worldMat(name)));
    root.add(d.mesh);
  }
  // light grid for sprites and the weapon
  WD.lg = new Float32Array(WD.W * WD.H * 3);
  for (const c of WD.cells) {
    if (c.solid) continue;
    lightAt(c.x + 0.5, c.y + 0.5, c.f + 0.55, 0, 0, 1, c.amb, c.sky, true, _lc);
    const k = (c.y * WD.W + c.x) * 3; WD.lg[k] = _lc[0]; WD.lg[k + 1] = _lc[1]; WD.lg[k + 2] = _lc[2];
  }
  return root;
}
function sampleLight(x, y, out) {
  const fx = x - 0.5, fy = y - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
  let r = 0, g = 0, b = 0, w = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const c = cellAt(x0 + i, y0 + j); if (c.solid) continue;
    const ww = (i ? tx : 1 - tx) * (j ? ty : 1 - ty) + 1e-4, k = ((y0 + j) * WD.W + x0 + i) * 3;
    r += WD.lg[k] * ww; g += WD.lg[k + 1] * ww; b += WD.lg[k + 2] * ww; w += ww;
  }
  if (w > 0) { out[0] = r / w; out[1] = g / w; out[2] = b / w; } else { out[0] = out[1] = out[2] = 0.3; }
  return out;
}
function makeSkyMesh(tex, top) {
  const g = new THREE.Group();
  const cylM = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 150, 48, 1, true), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }));
  const cap = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(top), side: THREE.DoubleSide, depthWrite: false, fog: false }));
  cap.rotation.x = Math.PI / 2; cap.position.y = 74.9;
  for (const m of [cylM, cap]) { m.renderOrder = -1; m.frustumCulled = false; g.add(m); }
  return g;
}
