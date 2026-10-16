'use strict';
// Post-processing: the scene renders into an off-screen target, bright parts are
// blurred into a bloom glow, then a final pass applies a soft tone curve,
// mild contrast/saturation, a warm grade and fine film grain.
const POST = { ok: false, texel: [0, 0] };
function initPost(renderer) {
  try {
    const fl = renderer.capabilities.isWebGL2 && renderer.extensions.get('EXT_color_buffer_float');
    const type = fl ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const mk = depth => new THREE.WebGLRenderTarget(4, 4, { type, depthBuffer: depth, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    POST.rt = mk(true); POST.a = mk(false); POST.b = mk(false);
    POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    POST.scene = new THREE.Scene();
    POST.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); POST.quad.frustumCulled = false; POST.scene.add(POST.quad);
    const VS = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }';
    const m = (u, fs) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false });
    POST.bright = m({ t: { value: null } }, `uniform sampler2D t; varying vec2 vUv;
      void main(){ vec3 c=texture2D(t,vUv).rgb; float l=max(c.r,max(c.g,c.b)); gl_FragColor=vec4(c*smoothstep(0.62,1.2,l),1.0); }`);
    POST.blur = m({ t: { value: null }, dir: { value: new THREE.Vector2() } }, `uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
      void main(){ vec3 c=texture2D(t,vUv).rgb*0.227;
        c+=(texture2D(t,vUv+dir*1.385).rgb+texture2D(t,vUv-dir*1.385).rgb)*0.316;
        c+=(texture2D(t,vUv+dir*3.23).rgb+texture2D(t,vUv-dir*3.23).rgb)*0.07; gl_FragColor=vec4(c,1.0); }`);
    POST.comp = m({ tScene: { value: null }, tBloom: { value: null }, k: { value: 0.9 }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, ads: { value: 0 } }, `
      uniform sampler2D tScene; uniform sampler2D tBloom; uniform float k; uniform float time; uniform vec2 res; uniform float ads; varying vec2 vUv;
      void main(){
        vec3 c=texture2D(tScene,vUv).rgb+texture2D(tBloom,vUv).rgb*k;
        vec3 t=1.0-exp(-c*1.4); c=mix(c,t,smoothstep(0.5,1.3,c));
        float l=dot(c,vec3(0.299,0.587,0.114)); c=mix(vec3(l),c,1.1); c=(c-0.5)*1.05+0.5;
        c*=vec3(1.03,1.0,0.96);
        vec2 q=vUv-0.5; c*=1.0-dot(q,q)*ads*1.6;
        float g=fract(sin(dot(vUv*res+time*61.0,vec2(12.9898,78.233)))*43758.5453); c+=(g-0.5)*0.022;
        gl_FragColor=vec4(clamp(c,0.0,1.0),1.0);
      }`);
    POST.ok = true;
  } catch (e) { console.warn('post-processing disabled', e); POST.ok = false; }
}
function resizePost(w, h) {
  if (!POST.ok) return;
  POST.rt.setSize(w, h);
  const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2);
  POST.a.setSize(bw, bh); POST.b.setSize(bw, bh); POST.texel = [1 / bw, 1 / bh];
  POST.comp.uniforms.res.value.set(w, h);
}
function postPass(renderer, mat, target) { POST.quad.material = mat; renderer.setRenderTarget(target); renderer.render(POST.scene, POST.cam); }
function runPost(renderer, time, ads) {
  POST.bright.uniforms.t.value = POST.rt.texture; postPass(renderer, POST.bright, POST.a);
  for (let i = 0; i < 2; i++) {
    const s = 1 + i * 1.8;
    POST.blur.uniforms.t.value = POST.a.texture; POST.blur.uniforms.dir.value.set(POST.texel[0] * s, 0); postPass(renderer, POST.blur, POST.b);
    POST.blur.uniforms.t.value = POST.b.texture; POST.blur.uniforms.dir.value.set(0, POST.texel[1] * s); postPass(renderer, POST.blur, POST.a);
  }
  const u = POST.comp.uniforms;
  u.tScene.value = POST.rt.texture; u.tBloom.value = POST.a.texture; u.time.value = time % 100; u.ads.value = ads;
  postPass(renderer, POST.comp, null);
}
