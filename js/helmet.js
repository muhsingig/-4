// The racing helmet. loadHelmet() takes a modelled GLB (assets/models/helmet.glb),
// re-skins it with the site's livery (lime shell with black squiggle lines, mirrored
// iridescent visor, dark trims) and normalises it; createHelmet() is a fallback
// modelled in code. Both are lit by a small studio environment map so they pick up
// real reflections as they turn, like the original site's helmet.
import * as THREE from 'three';

// a small photo studio to reflect: grey gradient walls, an overhead strip, two side
// strips and a front softbox (the original lights its helmet with a studio HDRI)
function studioEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 64, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
      void main() {
        float h = normalize(vP).y;
        vec3 c = h > 0.0 ? mix(vec3(0.22, 0.225, 0.21), vec3(0.55, 0.55, 0.53), h) : mix(vec3(0.22, 0.225, 0.21), vec3(0.03, 0.03, 0.028), -h);
        gl_FragColor = vec4(c, 1.0);
      }`,
  })));
  const box = (w, h, x, y, z, v) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(v, v, v), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    scene.add(m);
  };
  box(9, 2.2, 0, 9, 4, 5);       // overhead strip, slightly in front
  box(2.2, 8, -9, 1.5, 4, 3.2);  // key strip, left
  box(2.2, 8, 9, 1, 1, 2);       // fill strip, right
  box(10, 2.6, 0, 4.5, 10, 1.5);  // front softbox above the camera: a soft band across the visor
  box(4, 1.2, -3, 1.5, 11, 0.8);  // small front card, a second visor glint
  box(5, 1.2, 0, -6, 6, 0.6);    // low bounce card
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return tex;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// sculpt a unit sphere (y up, z forward) into a helmet shell
function sculpt(v) {
  // superellipsoid: a fuller crown and squarer cheeks than a plain sphere
  const n = 2.6;
  const r = Math.pow(Math.abs(v.x) ** n + Math.abs(v.y) ** n + Math.abs(v.z) ** n, 1 / n);
  v.divideScalar(r);
  const low = Math.max(0, -v.y);
  // squarer cheeks, tapering in toward the neck (more at the back)
  const taper = 1 - 0.07 * low * low - (v.z < 0 ? 0.04 * low : 0);
  v.x *= taper * (1 - 0.05 * Math.abs(v.x) ** 3);
  // chin bar pushes forward and a little down at the front
  if (v.z > 0) v.z *= 1 + 0.16 * smooth(0.05, 0.75, low) * v.z;
  // longer, rounder back
  if (v.z < 0) v.z *= 1.06;
  return v;
}
function sculptGeometry(geo, inflate = 1) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    sculpt(v).multiplyScalar(inflate);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

const RIM = -0.87;                       // bottom opening, in unit-sphere y
const THETA_RIM = Math.acos(RIM);
const VISOR_TOP = 0.1, VISOR_BOTTOM = -0.32, VISOR_HALF = 1.05;   // eye port, unit-sphere y and half-angle

// livery painted in object space so it never stretches: thick black lines along the
// iso-contours of 3D noise (the same contour idea as the site's background), a dark rim
// trim and a slatted chin vent
const liveryPars = /* glsl */ `
  varying vec3 vLocal;
  vec4 permute4(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt4(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise3(vec3 v) {
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
    vec4 p = permute4(permute4(permute4(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
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
    vec3 q0 = vec3(a0.xy, h.x);
    vec3 q1 = vec3(a0.zw, h.y);
    vec3 q2 = vec3(a1.xy, h.z);
    vec3 q3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt4(vec4(dot(q0, q0), dot(q1, q1), dot(q2, q2), dot(q3, q3)));
    q0 *= norm.x; q1 *= norm.y; q2 *= norm.z; q3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(q0, x0), dot(q1, x1), dot(q2, x2), dot(q3, x3)));
  }
  float liveryMask(vec3 p) {
    float n = snoise3(p * 1.25 + vec3(3.1, 0.4, 1.7)) + snoise3(p * 2.9 + 7.0) * 0.15;
    float f = n * 1.45;
    float d = abs(fract(f) - 0.5);
    float w = fwidth(f) * 0.9;
    return 1.0 - smoothstep(0.12 - w, 0.12 + w, d);
  }
`;

// smoked mirror visor: a grey metal reflects the studio, iridescence adds the oil-slick sheen
function visorMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x3a3f48, metalness: 1, roughness: 0.06,
    clearcoat: 1, clearcoatRoughness: 0.03,
    iridescence: 0.7, iridescenceIOR: 1.7, iridescenceThicknessRange: [220, 600],
    envMapIntensity: 1.5,
  });
}
function trimMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: 0x111113, roughness: 0.45, clearcoat: 0.4, envMapIntensity: 0.8 });
}

// paintTrims: the coded shell paints its own chin vent and rim; a modelled helmet has real ones
function liveryMaterial(paintTrims = true) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d2ff00'),
    roughness: 0.32,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.05,
    envMapIntensity: 0.7,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + liveryPars)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ink = liveryMask(vLocal);
        float trim = ${paintTrims ? '1.0' : '0.0'} * (1.0 - smoothstep(-0.825, -0.805, vLocal.y));
        float vent = ${paintTrims ? '1.0' : '0.0'} * step(0.5, vLocal.z) * step(-0.66, vLocal.y) * step(vLocal.y, -0.46) * step(abs(vLocal.x), 0.24);
        float slat = step(0.45, fract(vLocal.x * 22.0));
        vec3 black = vec3(0.012);
        diffuseColor.rgb = mix(diffuseColor.rgb, black, max(ink, trim));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.004), vec3(0.03), slat), vent);`);
  };
  mat.customProgramCacheKey = () => `helmet-livery-${paintTrims}`;
  return mat;
}

export function createHelmet(renderer) {
  const group = new THREE.Group();

  const env = studioEnvironment(renderer);

  const shellGeo = sculptGeometry(new THREE.SphereGeometry(1, 160, 110, 0, Math.PI * 2, 0, THETA_RIM));
  const shell = new THREE.Mesh(shellGeo, liveryMaterial());
  group.add(shell);

  // rubber seal around the eye port, then the visor on top of it
  const port = (pad, inflate) => sculptGeometry(new THREE.SphereGeometry(
    1, 96, 32,
    Math.PI / 2 - VISOR_HALF - pad, (VISOR_HALF + pad) * 2,
    Math.acos(VISOR_TOP + pad * 0.6), Math.acos(VISOR_BOTTOM - pad * 0.6) - Math.acos(VISOR_TOP + pad * 0.6),
  ), inflate);
  const seal = new THREE.Mesh(port(0.05, 1.006), new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.75 }));
  const visor = new THREE.Mesh(port(0, 1.016), visorMaterial());
  group.add(seal, visor);

  // visor pivots on both sides
  const pivotMat = new THREE.MeshPhysicalMaterial({ color: 0x1a1b1d, metalness: 0.8, roughness: 0.25, clearcoat: 1 });
  [-1, 1].forEach((side) => {
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 40), pivotMat);
    const pos = sculpt(new THREE.Vector3(side * 0.97, (VISOR_TOP + VISOR_BOTTOM) / 2, 0.18).normalize());
    pivot.position.copy(pos.multiplyScalar(1.01));
    pivot.rotation.z = Math.PI / 2;
    group.add(pivot);
  });

  // padded neck roll inside the bottom opening
  const rimR = Math.sqrt(1 - RIM * RIM);
  const roll = new THREE.Mesh(new THREE.TorusGeometry(1, 0.11, 18, 96), new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.95 }));
  roll.rotation.x = Math.PI / 2;
  roll.position.y = RIM + 0.02;
  roll.scale.set(rimR * 0.9, rimR * 1.0, 1);
  group.add(roll);

  return { group, env, wireGeo: wireGeometry(), visorCut: true, lights: studioLights(), visorY: (VISOR_TOP + VISOR_BOTTOM) / 2 };
}

// a lower-poly helmet shell for the wireframe (the original draws its helmet mesh as lines)
function wireGeometry() {
  return sculptGeometry(new THREE.SphereGeometry(1, 34, 22, 0, Math.PI * 2, 0, THETA_RIM), 1.004);
}
function studioLights() {
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-1.5, 2.5, 3);
  const rim = new THREE.DirectionalLight(0xffffff, 0.6);
  rim.position.set(2, 0.5, -1.5);
  return [key, rim];
}

const VISOR_NAME = /visor|glass|shield|lens|screen|window/i;
const PAD_NAME = /inside|inner|interior|pad|liner|foam|lining/i;
const TRIM_NAME = /component|rubber|seal|strap|trim|vent|screw|bolt|pivot|metal|chrome|black|gasket|spoiler/i;

// a part's cut-out shape comes from its texture's alpha (kept by tools/hero/slim_glb.py)
function maskedTrimMaterial(mask) {
  const m = trimMaterial();
  if (mask) { m.map = mask; m.alphaTest = 0.5; }
  return m;
}
// visor glass: mirrored where the mask is the tint, dark matte where it's the frame
function maskedVisorMaterial(mask) {
  const m = visorMaterial();
  if (!mask) return m;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uMask = { value: mask };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMaskUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMaskUv = uv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMaskUv;\nuniform sampler2D uMask;\nfloat frameAmt = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float maskA = texture2D(uMask, vMaskUv).a;
        if (maskA < 0.04) discard;
        frameAmt = smoothstep(0.55, 0.8, maskA);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015), frameAmt);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.5, frameAmt);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, frameAmt);');
  };
  m.customProgramCacheKey = () => 'visor-masked';
  return m;
}
function padMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.95 });
}

// Load a modelled helmet and give it the site's livery. Everything is baked into one
// space where the model's width spans x -1..1, its crown sits at y = 1 and its visor
// faces +z, so it fits the head exactly like the coded helmet.
export async function loadHelmet(renderer, url) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);
  const gltf = await loader.loadAsync(url);
  gltf.scene.updateMatrixWorld(true);

  // bake every mesh into the scene's space so one livery pattern runs across all parts
  const parts = [];
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const name = `${o.name} ${mats.map((m) => m.name).join(' ')}`;
    geo.computeBoundingBox();
    const sz = geo.boundingBox.getSize(new THREE.Vector3());
    parts.push({ geo, name, mask: mats[0].map || null, volume: sz.x * sz.y * sz.z });
  });
  if (!parts.length) throw new Error('helmet model has no meshes');

  const box = new THREE.Box3();
  parts.forEach((p) => box.union(p.geo.boundingBox));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = 2 / size.x;
  const norm = new THREE.Matrix4()
    .makeTranslation(0, 1, 0)
    .multiply(new THREE.Matrix4().makeScale(s, s, s))
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -box.max.y, -center.z));
  parts.forEach((p) => { p.geo.applyMatrix4(norm); p.geo.computeBoundingBox(); });

  const isVisor = (p) => VISOR_NAME.test(p.name);
  const visorBox = () => {
    const vb = new THREE.Box3();
    parts.filter(isVisor).forEach((p) => vb.union(p.geo.boundingBox));
    return vb;
  };
  // turn the model so its visor faces the camera (+z)
  if (parts.some(isVisor) && visorBox().getCenter(new THREE.Vector3()).z < 0) {
    const flip = new THREE.Matrix4().makeRotationY(Math.PI);
    parts.forEach((p) => { p.geo.applyMatrix4(flip); p.geo.computeBoundingBox(); });
  }

  // the shell gets the livery; visor, trims and padding get their own finishes
  const group = new THREE.Group();
  const livery = liveryMaterial(false);
  parts.forEach((p) => {
    let mat = livery, role = 'shell';
    if (isVisor(p)) { mat = maskedVisorMaterial(p.mask); role = 'visor'; }
    else if (PAD_NAME.test(p.name)) { mat = padMaterial(); role = 'pad'; }
    else if (TRIM_NAME.test(p.name)) { mat = maskedTrimMaterial(p.mask); role = 'trim'; }
    const mesh = new THREE.Mesh(p.geo, mat);
    mesh.userData.role = role;
    group.add(mesh);
  });

  const height = size.y * s;
  const visorY = parts.some(isVisor) ? visorBox().getCenter(new THREE.Vector3()).y : 1 - height * 0.45;

  // wireframe: the model's own shell mesh drawn as lines, as the original does with its helmet
  const shell = parts.find((p) => !isVisor(p) && !PAD_NAME.test(p.name) && !TRIM_NAME.test(p.name))
    || parts.reduce((a, b) => (b.volume > a.volume ? b : a));

  return { group, env: studioEnvironment(renderer), wireGeo: shell.geo, visorCut: false, lights: studioLights(), visorY, halfDepth: (size.z * s) / 2 };
}
