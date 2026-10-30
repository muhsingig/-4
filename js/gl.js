// One fixed WebGL canvas behind the page, rebuilt from how landonorris.com's
// hero works:
//  - a stable-fluids simulation driven by the cursor (or an idle auto-cursor)
//  - a stepped simplex noise field whose edges draw the topographic lines
//  - a background pass that paints those lines in the current theme colours
//  - a 3D head (a depth-displaced photo) and a modelled 3D helmet (js/helmet.js) seen
//    through a 15deg perspective camera at z=3, turning toward the mouse, plus the
//    helmet's wireframe
//  - the hero "plane": composites those, where the fluid reveals the helmet and
//    swaps the cream background for grey noise bands, then on scroll the whole
//    frame shrinks into a card while the camera pushes in and an olive filter fades in.
// Hero colour maths runs on raw values and is gamma-encoded at the end, the way
// the original's three.js pipeline does, so the creams and greys come out the same.
import * as THREE from 'three';
import { createHelmet, loadHelmet } from './helmet.js';

const quadVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// ---------- fluid (Stam's stable fluids) ----------
const advectFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVel;
  uniform vec2 uRatio;
  uniform float uDt;
  uniform float uDissipation;
  void main() {
    vec2 vel = texture2D(uVel, vUv).xy;
    vec2 back = vUv - vel * uDt * uRatio;
    gl_FragColor = vec4(texture2D(uVel, back).xy * uDissipation, 0.0, 1.0);
  }
`;
const forceVert = /* glsl */ `
  varying vec2 vUv;
  uniform vec2 uCenter;
  uniform vec2 uScale;
  void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0 * uScale + uCenter, 0.0, 1.0); }
`;
const forceFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uForce;
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float d = 1.0 - min(length(c), 1.0);
    d *= d;
    gl_FragColor = vec4(uForce * d, 0.0, 1.0);
  }
`;
const divergenceFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uVel;
  uniform vec2 uPx;
  uniform float uDt;
  void main() {
    float x0 = texture2D(uVel, vUv - vec2(uPx.x, 0.0)).x;
    float x1 = texture2D(uVel, vUv + vec2(uPx.x, 0.0)).x;
    float y0 = texture2D(uVel, vUv - vec2(0.0, uPx.y)).y;
    float y1 = texture2D(uVel, vUv + vec2(0.0, uPx.y)).y;
    gl_FragColor = vec4((x1 - x0 + y1 - y0) / 2.0 / uDt);
  }
`;
const poissonFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uP;
  uniform sampler2D uDiv;
  uniform vec2 uPx;
  void main() {
    float p0 = texture2D(uP, vUv + vec2(uPx.x * 2.0, 0.0)).r;
    float p1 = texture2D(uP, vUv - vec2(uPx.x * 2.0, 0.0)).r;
    float p2 = texture2D(uP, vUv + vec2(0.0, uPx.y * 2.0)).r;
    float p3 = texture2D(uP, vUv - vec2(0.0, uPx.y * 2.0)).r;
    gl_FragColor = vec4((p0 + p1 + p2 + p3) / 4.0 - texture2D(uDiv, vUv).r);
  }
`;
const pressureFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uP;
  uniform sampler2D uVel;
  uniform vec2 uPx;
  uniform float uDt;
  void main() {
    float p0 = texture2D(uP, vUv + vec2(uPx.x, 0.0)).r;
    float p1 = texture2D(uP, vUv - vec2(uPx.x, 0.0)).r;
    float p2 = texture2D(uP, vUv + vec2(0.0, uPx.y)).r;
    float p3 = texture2D(uP, vUv - vec2(0.0, uPx.y)).r;
    vec2 v = texture2D(uVel, vUv).xy - vec2(p0 - p1, p2 - p3) * 0.5 * uDt;
    gl_FragColor = vec4(v, 0.0, 1.0);
  }
`;

// ---------- noise field ----------
const simplex3 = /* glsl */ `
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`;
const noiseFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uAspect;
  uniform float uTime;
  uniform float uMousePace;
  uniform float uReveal;
  uniform vec2 uMouse;
  ${simplex3}
  const float SCALE = 1.0;
  const float SPEED = 0.1;
  const float DISTORT_SCALE = 1.0;
  const float DISTORT_INTENSITY = 0.5;
  const float NOISE_DETAIL = 3.0;
  const float CURSOR_INTENSITY = 0.15;
  const float CURSOR_SCALE = 3.0;
  const float CURSOR_BOUNCE = -0.75;
  const float REVEAL_SIZE = 25.0;
  void main() {
    vec2 uv = vUv;
    uv.x *= uAspect;
    uv.y += (REVEAL_SIZE + REVEAL_SIZE / 3.0) * (1.0 - uReveal);
    uv.y /= 1.0 + REVEAL_SIZE * (1.0 - uReveal);
    vec2 mouse = uMouse * 0.5 + 0.5;
    mouse.x *= uAspect;
    float cursor = 1.0 - distance(mouse, uv) * CURSOR_SCALE;
    cursor *= uMousePace;
    cursor = clamp(cursor, CURSOR_BOUNCE, 1.0);
    float distort = 0.5 + snoise(vec3(uv * DISTORT_SCALE, uTime * SPEED * 0.1)) * 0.5;
    vec2 p = (uv + cursor * CURSOR_INTENSITY + distort * DISTORT_INTENSITY) * SCALE;
    float n = 0.5 + snoise(vec3(p, uTime * SPEED)) * 0.5;
    n = fract(n * NOISE_DETAIL);
    gl_FragColor = vec4(step(0.5, n), n, 0.0, 1.0);
  }
`;

// ---------- background pass: theme colour + contour edges ----------
const bgFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uNoise;
  uniform vec2 uTexel;
  uniform vec3 uBg;
  uniform vec3 uLine;
  void main() {
    float n = texture2D(uNoise, vUv).r;
    float edge = (texture2D(uNoise, vUv + vec2(uTexel.x, 0.0)).r != n || texture2D(uNoise, vUv + vec2(0.0, uTexel.y)).r != n) ? 1.0 : 0.0;
    gl_FragColor = vec4(mix(uBg, uLine, edge), 1.0);
  }
`;

// ---------- 3D head / helmet ----------
// a 1x1 plane, 128x128 segments, pushed toward the camera by a depth map (as the original's head)
const meshVert = /* glsl */ `
  uniform sampler2D uDepth;
  uniform float uDisp;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += texture2D(uDepth, vec2(uv.x, 1.0 - uv.y)).r * uDisp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const meshFrag = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform float uFade;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(uMap, vec2(vUv.x, 1.0 - vUv.y));
    c.a *= uFade;
    if (c.a < 0.003) discard;
    gl_FragColor = vec4(c.rgb * c.a, c.a);   // premultiplied, so edges filter cleanly
  }
`;
// the original's wireframe: faint black lines with a scan band running up the helmet
const wireVert = /* glsl */ `
  varying vec3 vPosition;
  varying float vFacing;
  void main() {
    vPosition = position;
    vFacing = normalize(normalMatrix * normal).z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const wireFrag = /* glsl */ `
  precision highp float;
  varying vec3 vPosition;
  varying float vFacing;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uVisorCut;   // the coded shell has no real eye port, so cut one out of its lines
  void main() {
    if (vFacing < 0.08) discard;                                                     // front shell only
    if (uVisorCut > 0.5 && vPosition.z > 0.35 && vPosition.y > -0.35 && vPosition.y < 0.13) discard;
    float scan = pow(fract(-vPosition.y * 0.6 - uTime), 4.0) * 0.1;
    gl_FragColor = vec4(0.0, 0.0, 0.0, (0.02 + scan) * uOpacity);
  }
`;

// ---------- hero plane ----------
const planeVert = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vScreen;
  uniform vec4 uRect;   // x, y, w, h in css px (y down)
  uniform vec2 uRes;
  void main() {
    vUv = uv;
    vec2 px = uRect.xy + vec2(uv.x, 1.0 - uv.y) * uRect.zw;
    vScreen = vec2(px.x / uRes.x, 1.0 - px.y / uRes.y);
    gl_Position = vec4(vScreen * 2.0 - 1.0, 0.0, 1.0);
  }
`;
const planeFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying vec2 vScreen;
  uniform sampler2D uHead;     // 3D head render (premultiplied)
  uniform sampler2D uHelmet;   // 3D helmet render (premultiplied)
  uniform sampler2D uWire;     // helmet wireframe render
  uniform sampler2D uFluid;
  uniform sampler2D uNoise;
  uniform vec2 uTexel;
  uniform float uReveal;
  uniform float uCursor;
  uniform float uHelmetHover;
  uniform float uFilter;
  uniform float uWireOpacity;
  uniform float uTime;
  const float PI = 3.141592;
  const vec3 COLOR_OUTLINE = vec3(0.796, 0.796, 0.725);
  const vec3 COLOR_FOREGROUND = vec3(0.824, 1.0, 0.0);
  const vec3 COLOR_BACKGROUND = vec3(0.973, 0.973, 0.953);
  const vec3 COLOR_CURSOR_FOREGROUND = vec3(0.812, 0.824, 0.773);
  const vec3 COLOR_CURSOR_BACKGROUND = vec3(0.910, 0.910, 0.875);
  const vec3 COLOR_CURSOR_OUTLINE = vec3(0.910, 0.910, 0.875);
  const vec3 COLOR_FILTER = vec3(0.314, 0.349, 0.247);

  vec3 toLinear(vec3 c) { return pow(c, vec3(2.2)); }
  vec3 toSRGB(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }
  float overlay(float b, float s) { return b < 0.5 ? (2.0 * b * s) : (1.0 - 2.0 * (1.0 - b) * (1.0 - s)); }
  vec3 hardLight(vec3 base, vec3 blend) { return vec3(overlay(blend.r, base.r), overlay(blend.g, base.g), overlay(blend.b, base.b)); }

  vec4 sampleLayer(sampler2D t) {
    vec4 c = texture2D(t, vUv);
    vec3 rgb = c.a > 0.0001 ? c.rgb / c.a : vec3(0.0);
    return vec4(toLinear(rgb), c.a);
  }
  // the 3D helmet is rendered with PBR lighting, so its colours are already linear
  vec4 sampleLit(sampler2D t) {
    vec4 c = texture2D(t, vUv);
    vec3 rgb = c.a > 0.0001 ? c.rgb / c.a : vec3(0.0);
    rgb = rgb / (1.0 + max(rgb - 0.85, 0.0));   // soften blown highlights
    return vec4(rgb, c.a);
  }

  void main() {

    // noise bands + their 1px outlines, sampled across the plane like the original
    float n = texture2D(uNoise, vUv).r;
    float edge = (texture2D(uNoise, vUv + vec2(uTexel.x, 0.0)).r != n || texture2D(uNoise, vUv + vec2(0.0, uTexel.y)).r != n) ? 1.0 : 0.0;
    vec3 background = mix(COLOR_BACKGROUND, mix(COLOR_BACKGROUND, COLOR_OUTLINE, uReveal), edge);
    vec3 cursorBackground = mix(COLOR_CURSOR_BACKGROUND, COLOR_CURSOR_FOREGROUND, n);
    cursorBackground = mix(cursorBackground, COLOR_CURSOR_OUTLINE, edge);

    // fluid velocity -> hard-edged reveal mask (same mapping as the original's output pass)
    vec2 vel = texture2D(uFluid, vec2(0.025 + vScreen.x * 0.95, 0.025 + vScreen.y * 0.95)).xy;
    float len = length(vel);
    float r = mix(1.0, vel.x * 0.5 + 0.5, len);
    float cursorEffect = step(0.1, 1.0 - r);

    background = mix(background, cursorBackground, cursorEffect * uCursor);

    // hovering the bottom-left card wipes the full helmet in from the top
    float hoverTransition = vUv.y + sin(vUv.x * PI) * sin(uHelmetHover * PI) * 0.2;
    float hoverMask = step(1.0 - hoverTransition, uHelmetHover);
    cursorEffect = clamp((cursorEffect + hoverMask) * uCursor, 0.0, 1.0);
    background = mix(background, cursorBackground, hoverMask * uCursor);

    vec4 photo = sampleLayer(uHead);
    vec4 helmet = sampleLit(uHelmet);
    vec3 base = mix(background, photo.rgb, photo.a);

    // the helmet's wireframe sits over the head until the cursor takes over
    float wire = texture2D(uWire, vUv).a;
    base = mix(base, vec3(0.0), wire * uWireOpacity * (1.0 - cursorEffect));

    vec3 final = mix(base, helmet.rgb, cursorEffect * helmet.a);

    // scroll filter: greyscale, flattened, tinted olive
    vec3 end = mix(photo.rgb, vec3(0.05), 1.0 - photo.a);
    end = vec3(dot(end, vec3(0.299, 0.587, 0.114)));
    end = (end - 0.5) * 0.8 + 0.5;
    end *= 0.75;
    end = hardLight(end, COLOR_FILTER);
    vec3 outc = mix(final, end, uFilter);

    gl_FragColor = vec4(toSRGB(outc), 1.0);
  }
`;

// ---------- helpers ----------
const THEMES = {
  dark: { bg: '#282C20', line: '#363B25' },
  cream: { bg: '#F4F4ED', line: '#DCDDD1' },
  lime: { bg: '#F4F4ED', line: '#DCDDD1' },
  black: { bg: '#111112', line: '#19191a' },
};
const hexToVec = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const power1InOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function makeTarget(w, h, type) {
  return new THREE.WebGLRenderTarget(w, h, {
    type, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false,
  });
}

// head: { map, depth } texture urls laid out like the original's 2048px head texture;
// helmetFit: where the helmet sits on that head, in plane units;
// helmetModelUrl: a modelled helmet GLB (falls back to the coded helmet if missing)
export async function createGL({ canvas, head, helmetFit: fit, helmetModelUrl }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.autoClear = false;
  const floatType = renderer.capabilities.isWebGL2 ? THREE.HalfFloatType : THREE.FloatType;

  const loader = new THREE.TextureLoader();
  const load = (url) => new Promise((res, rej) => loader.load(url, (t) => {
    t.flipY = false;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 4;
    res(t);
  }, undefined, rej));
  const [headMap, headDepth] = await Promise.all([head.map, head.depth].map(load));

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);
  const unitQuad = new THREE.PlaneGeometry(1, 1);
  const pass = (frag, uniforms, extra = {}) => {
    const mat = new THREE.ShaderMaterial({ vertexShader: extra.vert || quadVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, ...extra.mat });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(extra.geo || quad, mat));
    return { mat, scene, u: mat.uniforms };
  };
  const draw = (p, target) => { renderer.setRenderTarget(target); renderer.render(p.scene, camera); };

  // ---- fluid state ----
  const F = { dt: 0.014, dissipation: 0.96, force: 50, resolution: 0.1, cursorSize: 18, poisson: 4 };
  let fw = 2, fh = 2;
  let vel0 = makeTarget(2, 2, floatType), vel1 = makeTarget(2, 2, floatType);
  const divT = makeTarget(2, 2, floatType);
  let p0 = makeTarget(2, 2, floatType), p1 = makeTarget(2, 2, floatType);
  const px = new THREE.Vector2(), ratio = new THREE.Vector2();
  const advect = pass(advectFrag, { uVel: { value: null }, uRatio: { value: ratio }, uDt: { value: F.dt }, uDissipation: { value: F.dissipation } });
  const force = pass(forceFrag, { uForce: { value: new THREE.Vector2() }, uCenter: { value: new THREE.Vector2() }, uScale: { value: new THREE.Vector2() } },
    { vert: forceVert, geo: unitQuad, mat: { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, transparent: true } });
  const divergence = pass(divergenceFrag, { uVel: { value: null }, uPx: { value: px }, uDt: { value: F.dt } });
  const poisson = pass(poissonFrag, { uP: { value: null }, uDiv: { value: divT.texture }, uPx: { value: px } });
  const pressure = pass(pressureFrag, { uP: { value: null }, uVel: { value: null }, uPx: { value: px }, uDt: { value: F.dt } });

  // ---- noise, background, hero ----
  let noiseT = makeTarget(2, 2, THREE.UnsignedByteType);
  noiseT.texture.minFilter = THREE.NearestFilter;
  noiseT.texture.magFilter = THREE.NearestFilter;
  const texel = new THREE.Vector2();
  const noise = pass(noiseFrag, {
    uAspect: { value: 1 }, uTime: { value: 0 }, uMousePace: { value: 0 }, uReveal: { value: 0 }, uMouse: { value: new THREE.Vector2() },
  });
  const bgColor = hexToVec(THEMES.dark.bg), lineColor = hexToVec(THEMES.dark.line);
  let bgTarget = bgColor.clone(), lineTarget = lineColor.clone();
  const bg = pass(bgFrag, { uNoise: { value: noiseT.texture }, uTexel: { value: texel }, uBg: { value: bgColor }, uLine: { value: lineColor } });
  // ---- 3D head + helmet, as the original: PerspectiveCamera(15) at z=3, a 1x1 plane
  // with 0.25 displacement, turning +-0.075 rad toward the eased mouse ----
  const cam3 = new THREE.PerspectiveCamera(15, 1, 0.1, 100);
  const layerTarget = () => new THREE.WebGLRenderTarget(2, 2, { samples: renderer.capabilities.isWebGL2 ? 4 : 0 });
  const headRT = layerTarget(), helmetRT = layerTarget(), wireRT = layerTarget();
  const headGeo = new THREE.PlaneGeometry(1, 1, 128, 128);
  const meshMat = (map, depth) => new THREE.ShaderMaterial({
    vertexShader: meshVert, fragmentShader: meshFrag,
    uniforms: { uMap: { value: map }, uDepth: { value: depth }, uDisp: { value: 0.25 }, uFade: { value: 0 } },
    blending: THREE.NoBlending,
  });
  const headMesh = new THREE.Mesh(headGeo, meshMat(headMap, headDepth));
  const headScene = new THREE.Scene(); headScene.add(headMesh);

  // the modelled helmet, sized and placed like the original's: ~64% of the screen height
  // wide, ~60% tall, crown ~7% from the top, visor across the eyes
  let helmetModel = null;
  if (helmetModelUrl) {
    try { helmetModel = await loadHelmet(renderer, helmetModelUrl); }
    catch (err) { console.info('No helmet model loaded, using the coded helmet.', err.message || err); }
  }
  const modelled = !!helmetModel;
  if (!helmetModel) helmetModel = createHelmet(renderer);
  const helmetScene = new THREE.Scene();
  helmetScene.environment = helmetModel.env;
  const helmetRig = new THREE.Group();          // turns with the head, pivoting at the head plane
  const helmetFit = new THREE.Group();          // sizes and places the model on the head
  if (modelled) {
    // fitted so its screen box matches the original's helmet (measured against the
    // original's own model and placement); the model is normalised with its crown at y = 1
    const sy = fit.modelSx * fit.modelStretch;
    helmetFit.scale.set(fit.modelSx, sy, fit.modelSx);
    helmetFit.position.set(0, fit.modelTop - sy, 0.27 - helmetModel.halfDepth * fit.modelSx);
  } else {
    helmetFit.scale.set(fit.sx, fit.sy, fit.sz);
    helmetFit.position.set(0, fit.y, 0.25 - fit.sz);
  }
  const helmetPitch = modelled ? fit.modelPitch : 0;   // the original tilts its helmet forward by 0.06 pi
  helmetFit.add(helmetModel.group);
  helmetRig.add(helmetFit);
  helmetScene.add(helmetRig, ...helmetModel.lights);

  // the original's wireframe is its helmet mesh drawn as lines; this is ours
  const wireMat = new THREE.ShaderMaterial({
    vertexShader: wireVert, fragmentShader: wireFrag, wireframe: true, transparent: true,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uVisorCut: { value: helmetModel.visorCut ? 1 : 0 } }, depthTest: false,
  });
  const wireRig = new THREE.Group();
  const wireFit = helmetFit.clone(false);
  wireFit.add(new THREE.Mesh(helmetModel.wireGeo, wireMat));
  wireRig.add(wireFit);
  const wireScene = new THREE.Scene(); wireScene.add(wireRig);
  const clearTo = (target) => { renderer.setRenderTarget(target); renderer.setClearColor(0x000000, 0); renderer.clear(); };

  const res = new THREE.Vector2();
  const plane = pass(planeFrag, {
    uHead: { value: headRT.texture }, uHelmet: { value: helmetRT.texture }, uWire: { value: wireRT.texture },
    uFluid: { value: vel0.texture }, uNoise: { value: noiseT.texture }, uTexel: { value: texel },
    uRect: { value: new THREE.Vector4() }, uRes: { value: res },
    uReveal: { value: 0 }, uCursor: { value: 1 }, uHelmetHover: { value: 0 }, uFilter: { value: 0 },
    uWireOpacity: { value: 1 }, uTime: { value: 0 },
  }, { vert: planeVert });

  // ---- input: eased mouse, pace, idle auto-cursor ----
  let W = 1, H = 1;
  const mouse = { x: 0, y: 0, ex: 0, ey: 0, pace: 0, epace: 0, lastMove: performance.now(), moved: false };
  const fluidMouse = { x: 0, y: 0, ox: 0, oy: 0, init: false };
  let idle = { active: false, t: 0 };
  let firstIdleAt = performance.now() + 2500;
  window.addEventListener('pointermove', (e) => {
    const nx = (e.clientX / W) * 2 - 1, ny = -(e.clientY / H) * 2 + 1;
    mouse.pace = Math.min(1, Math.hypot(nx - mouse.x, ny - mouse.y) * 8);
    mouse.x = nx; mouse.y = ny;
    mouse.lastMove = performance.now(); mouse.moved = true;
    firstIdleAt = 0;
    if (idle.active) { idle.active = false; fluidMouse.init = false; }
  }, { passive: true });

  // idle path from the original: two sweeps across, 2.5s each, then a pause
  function idlePoint(t) {
    const cycle = 9.5;
    const c = t % cycle;
    let px = 0, py = 0;
    if (c < 2.5) { py = c / 2.5; px = power1InOut(c / 2.5); }
    else if (c < 4) { py = 1; px = 1; }
    else if (c < 6.5) { py = 1 - (c - 4) / 2.5; px = 1 - power1InOut((c - 4) / 2.5); }
    return { x: -Math.cos(px * Math.PI * 4) * 0.75, y: Math.cos(py * Math.PI) * 0.5 };
  }

  // ---- hero state (driven from main.js) ----
  const hero = { progress: 0, top: 0, visible: true, cursor: 1, wire: 1, hover: 0, targetW: 400, targetH: 260, portrait: false };
  const heroRect = { x: 0, y: 0, w: 1, h: 1 };
  let reveal = 0, revealStart = -1;
  let time = 0;

  function layoutHero() {
    const e = power1InOut(Math.min(1, Math.max(0, hero.progress)));
    const w = W + (hero.targetW - W) * e;
    const h = H + (hero.targetH - H) * e;
    Object.assign(heroRect, { x: (W - w) / 2, y: (H - h) / 2 + hero.top, w, h });
    plane.u.uRect.value.set(heroRect.x, heroRect.y, heroRect.w, heroRect.h);
    plane.u.uFilter.value = e;

    // camera: z 3 (3.75 on phones), pushed in by 1 over the shrink; lifts 0.1 as the
    // hero scrolls away; drifts a touch with the mouse
    cam3.aspect = w / h;
    cam3.updateProjectionMatrix();
    const leave = Math.min(1, Math.max(0, -hero.top / H));
    cam3.position.set(mouse.ex * 0.02, power1InOut(leave) * 0.1 + mouse.ey * 0.01, (hero.portrait ? 3.75 : 3) - e);

    // head turns toward the mouse; the helmet follows at two-thirds
    const r = 0.075 * reveal;
    headMesh.position.y = hero.portrait ? -0.05 : 0;
    headMesh.rotation.y = mouse.ex * r;
    headMesh.rotation.x = W > 768 ? -mouse.ey * r * (1 - e) : 0;
    // as the original: the helmet copies the head's turn at two-thirds, plus its forward tilt
    helmetRig.position.y = headMesh.position.y;
    helmetRig.rotation.set(headMesh.rotation.x / 1.5 + helmetPitch, headMesh.rotation.y / 1.5, 0);
    wireRig.position.copy(helmetRig.position);
    wireRig.rotation.copy(helmetRig.rotation);
  }

  function renderLayers() {
    const fade = Math.min(1, Math.max(0, (reveal - 0.15) / 0.7));
    headMesh.material.uniforms.uFade.value = fade;
    helmetFit.visible = fade > 0.02;
    wireMat.uniforms.uTime.value = time;
    wireMat.uniforms.uOpacity.value = fade;
    clearTo(headRT); renderer.render(headScene, cam3);
    clearTo(helmetRT); renderer.render(helmetScene, cam3);
    clearTo(wireRT); renderer.render(wireScene, cam3);
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, W < 768 ? 1.5 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    res.set(W, H);
    fw = Math.max(32, Math.round(W * F.resolution)); fh = Math.max(32, Math.round(H * F.resolution));
    [vel0, vel1, divT, p0, p1].forEach((t) => t.setSize(fw, fh));
    px.set(1 / fw, 1 / fh);
    ratio.set(Math.max(fw, fh) / fw, Math.max(fw, fh) / fh);
    const nw = Math.round(W * dpr), nh = Math.round(H * dpr);
    noiseT.setSize(nw, nh);
    [headRT, helmetRT, wireRT].forEach((t) => t.setSize(nw, nh));
    texel.set(1 / nw, 1 / nh);
    noise.u.uAspect.value = W / H;
    hero.portrait = W < H * 0.9;
    layoutHero();
  }

  function stepFluid() {
    // pointer (or idle path) -> force
    const now = performance.now();
    const idleNow = (firstIdleAt && now > firstIdleAt) || (!firstIdleAt && now - mouse.lastMove > 2000);
    if (idleNow && !idle.active) { idle.active = true; idle.t = 0; fluidMouse.init = false; }
    let cx, cy;
    if (idle.active) { idle.t += 1 / 60; const q = idlePoint(idle.t); cx = q.x; cy = q.y; }
    else { cx = mouse.x; cy = mouse.y; }
    if (!fluidMouse.init) { fluidMouse.ox = cx; fluidMouse.oy = cy; fluidMouse.init = true; }
    const dx = cx - fluidMouse.ox, dy = cy - fluidMouse.oy;
    fluidMouse.ox = cx; fluidMouse.oy = cy;

    advect.u.uVel.value = vel0.texture;
    renderer.setRenderTarget(vel1);
    renderer.clear();
    renderer.render(advect.scene, camera);
    const sx = F.cursorSize * px.x, sy = F.cursorSize * px.y;
    force.u.uForce.value.set((dx / 2) * F.force, (dy / 2) * F.force);
    force.u.uCenter.value.set(
      Math.min(Math.max(cx, -1 + sx + px.x * 2), 1 - sx - px.x * 2),
      Math.min(Math.max(cy, -1 + sy + px.y * 2), 1 - sy - px.y * 2),
    );
    force.u.uScale.value.set(sx, sy);
    if (dx || dy) renderer.render(force.scene, camera);

    divergence.u.uVel.value = vel1.texture;
    draw(divergence, divT);
    for (let i = 0; i < F.poisson; i++) {
      poisson.u.uP.value = p0.texture;
      draw(poisson, p1);
      [p0, p1] = [p1, p0];
    }
    pressure.u.uP.value = p0.texture;
    pressure.u.uVel.value = vel1.texture;
    draw(pressure, vel0);
  }

  let last = performance.now(), acc = 0, running = true;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; time += dt; acc += dt;

    if (revealStart >= 0) {
      const t = Math.min(1, (now - revealStart) / 1100);
      reveal = 1 - Math.pow(1 - t, 3);
    }
    mouse.ex += (mouse.x - mouse.ex) * 0.025 * dt * 60;
    mouse.ey += (mouse.y - mouse.ey) * 0.025 * dt * 60;
    mouse.epace += (mouse.pace - mouse.epace) * 0.01 * dt * 60;
    mouse.pace *= Math.pow(0.9, dt * 60);
    bgColor.lerp(bgTarget, Math.min(1, dt * 4));
    lineColor.lerp(lineTarget, Math.min(1, dt * 4));

    if (hero.visible && acc >= 1 / 60) { acc %= 1 / 60; stepFluid(); }

    noise.u.uTime.value = time;
    noise.u.uReveal.value = reveal;
    noise.u.uMouse.value.set(mouse.ex, mouse.ey);
    noise.u.uMousePace.value = mouse.epace * 4;
    draw(noise, noiseT);

    renderer.setRenderTarget(null);
    renderer.render(bg.scene, camera);
    if (hero.visible) {
      layoutHero();
      renderLayers();
      renderer.setRenderTarget(null);
      plane.u.uFluid.value = vel0.texture;
      plane.u.uReveal.value = reveal;
      plane.u.uCursor.value = hero.cursor;
      plane.u.uWireOpacity.value = hero.wire;
      plane.u.uHelmetHover.value = hero.hover;
      plane.u.uTime.value = time;
      renderer.render(plane.scene, camera);
    }
  }

  resize();
  requestAnimationFrame(frame);

  return {
    resize,
    hero,
    heroRect,
    layout: layoutHero,
    startReveal() { revealStart = performance.now(); },
    setTheme(name) {
      const t = THEMES[name] || THEMES.cream;
      bgTarget = hexToVec(t.bg); lineTarget = hexToVec(t.line);
    },
    setRunning(v) { running = v; last = performance.now(); },
  };
}
