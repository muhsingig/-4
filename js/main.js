// Page orchestration: Lenis smooth scroll + GSAP ScrollTrigger, the loader,
// nav/menu, and every scroll scene. Motion timings follow landonorris.com.
const { gsap, ScrollTrigger, Lenis } = window;
gsap.registerPlugin(ScrollTrigger);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const ramp = (p, a, b) => clamp01((p - a) / (b - a));
const rem = () => parseFloat(getComputedStyle(document.documentElement).fontSize);
const isMobile = () => window.innerWidth < 992;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'expo.inOut';

if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
window.scrollTo(0, 0);

// ---------- smooth scroll ----------
const lenis = new Lenis({ lerp: reduceMotion ? 1 : 0.1, smoothWheel: !reduceMotion, wheelMultiplier: 1 });
lenis.stop();
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

// ---------- theme: nav/text colours on <body>, background colours in the GL canvas ----------
let gl = null;
let theme = '';
let bgTheme = 'dark';
function setTheme(t, bg = t) {
  if (t !== theme) { theme = t; document.body.dataset.theme = t; }
  if (bg !== bgTheme) { bgTheme = bg; document.body.dataset.bg = bg; if (gl) gl.setTheme(bg); }
}
setTheme('cream', 'dark');

// ---------- signatures: inline the symbol so each copy can be drawn on ----------
const sigSymbol = $('#sig');
$$('svg').forEach((svg) => {
  const use = svg.querySelector('use[href="#sig"]');
  if (!use) return;
  use.remove();
  sigSymbol.querySelectorAll('path').forEach((p) => svg.appendChild(p.cloneNode(true)));
});
function prepSig(svg) {
  const paths = $$('.sig-path', svg);
  const lens = paths.map((p) => p.getTotalLength());
  paths.forEach((p, i) => { p.style.strokeDasharray = lens[i]; p.style.strokeDashoffset = lens[i]; });
  return { paths, lens, total: lens.reduce((a, b) => a + b, 0) };
}
function drawSig(sig, t) {
  let left = t * sig.total;
  sig.paths.forEach((p, i) => {
    const d = Math.min(Math.max(left, 0), sig.lens[i]);
    p.style.strokeDashoffset = sig.lens[i] - d;
    left -= sig.lens[i];
  });
}
function animateSig(svg, opts = {}) {
  const sig = prepSig(svg);
  const o = { t: 0 };
  return gsap.to(o, { t: 1, duration: opts.duration || 1.6, ease: 'power2.inOut', paused: true, onUpdate: () => drawSig(sig, o.t) });
}

// ---------- highlight sweeps (eyebrows, callout words) ----------
function prepHighlight(el) {
  el.innerHTML = `<span class="hl-text">${el.innerHTML}</span><span class="hl-bar"></span>`;
  const text = $('.hl-text', el), bar = $('.hl-bar', el);
  gsap.set(text, { opacity: 0 });
  return gsap.timeline({ paused: true })
    .fromTo(bar, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 0.45, ease: 'power2.inOut' })
    .set(text, { opacity: 1 })
    .set(bar, { transformOrigin: 'right center' })
    .to(bar, { scaleX: 0, duration: 0.45, ease: 'power2.inOut' });
}

// ---------- split a heading into lines that sweep in ----------
function splitLines(el) {
  if (!el.dataset.src) el.dataset.src = el.innerHTML;
  el.innerHTML = el.dataset.src;
  const words = [];
  let pendingSpace = false;
  const walk = (node, tag) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { pendingSpace = true; frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement(tag);
          w.className = 'w';
          w.textContent = part;
          w.dataset.space = pendingSpace ? '1' : '';
          pendingSpace = false;
          frag.appendChild(w);
          words.push(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) {
        walk(n, n.tagName.toLowerCase());
        n.replaceWith(...n.childNodes);
      }
    });
  };
  walk(el, 'span');
  // group by vertical centre: serif and sans words on one line sit a few px apart
  const lines = [];
  const tol = parseFloat(getComputedStyle(el).fontSize) * 0.45;
  let lastMid = null;
  words.forEach((w) => {
    const mid = w.offsetTop + w.offsetHeight / 2;
    if (lastMid === null || Math.abs(mid - lastMid) > tol) { lines.push([]); lastMid = mid; }
    lines[lines.length - 1].push(w);
  });
  el.innerHTML = '';
  return lines.map((ws) => {
    const line = document.createElement('span'); line.className = 'line';
    const inner = document.createElement('span'); inner.className = 'line-inner';
    const text = document.createElement('span'); text.className = 'line-text';
    ws.forEach((w, i) => { if (i && w.dataset.space) text.appendChild(document.createTextNode(' ')); text.appendChild(w); });
    const bar = document.createElement('span'); bar.className = 'hl-bar';
    inner.append(text, bar); line.appendChild(inner); el.appendChild(line);
    return line;
  });
}
function lineTimeline(lines, revealed) {
  const tl = gsap.timeline({ paused: true });
  lines.forEach((l, i) => {
    const bar = $('.hl-bar', l), text = $('.line-text', l), at = i * 0.09;
    gsap.set(text, { opacity: revealed ? 1 : 0 });
    if (revealed) return;
    tl.fromTo(bar, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, at)
      .set(text, { opacity: 1 }, at + 0.5)
      .set(bar, { transformOrigin: 'right center' }, at + 0.5)
      .to(bar, { scaleX: 0, duration: 0.5, ease: 'power2.inOut' }, at + 0.5);
  });
  return tl;
}
const splitTargets = $$('[data-lines]').map((el) => ({ el, revealed: false }));
function buildSplits() {
  splitTargets.forEach((s) => {
    const lines = splitLines(s.el);
    s.tl = lineTimeline(lines, s.revealed);
  });
}

// ---------- nav, anchors, menu ----------
const menu = $('.menu');
const ham = $('.nav-ham');
let menuOpen = false;
function openMenu() {
  menuOpen = true;
  document.body.classList.add('menu-open');
  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');
  ham.setAttribute('aria-expanded', 'true');
  ham.setAttribute('aria-label', 'Close menu');
  lenis.stop();
  gsap.killTweensOf(menu);
  gsap.timeline()
    .to(menu, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: EASE })
    .fromTo('.menu-links a', { yPercent: 110 }, { yPercent: 0, duration: 1, ease: 'expo.out', stagger: 0.06 }, 0.35)
    .fromTo('.menu-tile', { scale: 0.86, opacity: 0 }, { scale: 1, opacity: 1, duration: 1, ease: 'expo.out', stagger: 0.07 }, 0.4)
    .fromTo('.menu-badge, .menu-bottom', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, 0.65);
}
function closeMenu(then) {
  menuOpen = false;
  document.body.classList.remove('menu-open');
  ham.setAttribute('aria-expanded', 'false');
  ham.setAttribute('aria-label', 'Open menu');
  gsap.killTweensOf(menu);
  gsap.to(menu, {
    clipPath: 'inset(0% 0% 100% 0%)', duration: 0.8, ease: EASE,
    onComplete: () => { menu.classList.remove('is-open'); menu.setAttribute('aria-hidden', 'true'); },
  });
  lenis.start();
  if (then) gsap.delayedCall(0.35, then);
}
ham.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); });
const tiles = $$('.menu-tile');
function activateTile(i) { tiles.forEach((t, k) => t.classList.toggle('is-active', k === i)); }
activateTile(0);
$$('.menu-links a').forEach((a) => a.addEventListener('mouseenter', () => activateTile(+a.dataset.tile)));

$$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const id = a.getAttribute('href');
  const target = id === '#home' ? 0 : $(id);
  if (target === null) return;
  e.preventDefault();
  $$('.menu-links a').forEach((m) => m.classList.toggle('is-current', m.getAttribute('href') === id));
  const go = () => lenis.scrollTo(target, { duration: 1.8, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) });
  if (menuOpen) closeMenu(go); else go();
}));

// scroll indicator on the right edge
const indicator = $('.scroll-indicator');
const indicatorBar = $('.scroll-indicator-bar');
let indicatorTimer = 0;
lenis.on('scroll', ({ progress }) => {
  indicatorBar.style.top = `${clamp01(progress) * 90}%`;
  indicator.classList.add('is-active');
  clearTimeout(indicatorTimer);
  indicatorTimer = setTimeout(() => indicator.classList.remove('is-active'), 900);
});

// ---------- hero ----------
// where the helmet sits on the head plane (plane units). The model* values were fitted
// so the helmet's screen box matches the original's at 1024x768 (494 x 598px, top at
// 44px), with the original's 0.06 pi forward tilt; y/sx/sy/sz fit the coded fallback
const HELMET_FIT = {
  modelSx: 0.26, modelTop: 0.3422, modelStretch: 1.038, modelPitch: Math.PI * 0.06,
  y: 0.07, sx: 0.248, sy: 0.27, sz: 0.275,
};
// Over the first screen of scroll the whole hero frame shrinks to .hero-target
// (drawn in the GL canvas); once the track ends the frame rides up with the page.
const heroTrack = $('.hero-track');
const heroTarget = $('.hero-target');
const heroMsg = $('.hero-msg');
const mqRows = $$('.mq-row');
const mqInners = $$('.mq-inner');
const heroMsgTop = $('.hero-msg-top');
const heroCard = $('.hero-card');
const heroFallback = $('.hero-fallback');
const heroSig = prepSig($('.hero-sig'));

// signature + "message from" eyebrow play through once the frame is small (a Rive clip on the original)
const sigState = { t: 0 };
const sigTl = gsap.timeline({ paused: true })
  .to(sigState, { t: 1, duration: 1.7, ease: 'power1.inOut', onUpdate: () => drawSig(heroSig, sigState.t) }, 0)
  .fromTo(heroMsgTop, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, 0);
let sigShown = false;
let cursorOff = false;

function updateHero() {
  const H = window.innerHeight;
  const r = heroTrack.getBoundingClientRect();
  const p = clamp01(-r.top / H);
  const top = Math.min(0, r.bottom - H);
  const visible = r.bottom > 0 && r.top < H;

  let frame = { x: 0, y: top, w: window.innerWidth, h: H };
  if (gl) {
    Object.assign(gl.hero, { progress: p, top, visible, targetW: heroTarget.offsetWidth, targetH: heroTarget.offsetHeight });
    gl.layout();
    frame = gl.heroRect;
    // the cursor effect and the helmet wireframe switch off a little under halfway
    const off = -r.top > H / 2.25;
    if (off !== cursorOff) {
      cursorOff = off;
      gsap.to(gl.hero, { cursor: off ? 0 : 1, wire: off ? 0 : 1, duration: 0.25, ease: 'power1.inOut', overwrite: 'auto' });
    }
  }

  const rows = ramp(p, 0.22, 0.55);
  mqRows.forEach((row, i) => {
    row.style.opacity = rows;
    row.style.transform = `translateY(${(1 - rows) * (i ? 2.5 : -2.5)}rem)`;
  });
  // punch the frame out of the text rows so the frame sits in front of them
  const x1 = frame.x, y1 = frame.y - top, x2 = frame.x + frame.w, y2 = y1 + frame.h;
  heroMsg.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px, ${x1}px ${y1}px)`;

  heroCard.style.opacity = 1 - ramp(p, 0.02, 0.1);
  heroCard.style.pointerEvents = p > 0.08 ? 'none' : '';
  heroFallback.style.opacity = 1 - ramp(p, 0.1, 0.5);

  if (p >= 0.74 && !sigShown) { sigShown = true; sigTl.timeScale(1).play(); }
  else if (p < 0.66 && sigShown) { sigShown = false; sigTl.timeScale(2.5).reverse(); }

  // nav reads dark-on-cream while the frame still sits under it
  if (r.bottom > H * 0.5) setTheme(frame.x < 6 && frame.y < 70 && visible ? 'cream' : 'dark', 'dark');
}

heroCard.addEventListener('mouseenter', () => gl && gsap.to(gl.hero, { hover: 1, duration: 1.1, ease: 'power2.inOut', overwrite: 'auto' }));
heroCard.addEventListener('mouseleave', () => gl && gsap.to(gl.hero, { hover: 0, duration: 0.8, ease: 'power2.inOut', overwrite: 'auto' }));

// marquee rows drift continuously, nudged by scroll speed
const mqState = mqInners.map((el, i) => ({ el, x: 0, dir: i ? 1 : -1 }));
function tickMarquee(dt) {
  const boost = 1 + Math.min(4, Math.abs(lenis.velocity || 0) * 0.08);
  mqState.forEach((s) => {
    const w = s.el.firstElementChild.offsetWidth || 1;
    s.x += s.dir * dt * 60 * boost;
    if (s.x <= -w) s.x += w;
    if (s.x > 0) s.x -= w;
    s.el.style.transform = `translate3d(${s.x}px,0,0)`;
  });
}

// ---------- horizontal gallery ----------
const hs = $('.hscroll');
const hsTrack = $('.hs-track');
const hsDistance = () => Math.max(0, hsTrack.scrollWidth - window.innerWidth);
function sizeGallery() { hs.style.height = `${window.innerHeight + hsDistance()}px`; }

// ---------- brands marquee ----------
const brandsInner = $('.brands-inner');
let brandsX = 0;
function tickBrands(dt) {
  const half = brandsInner.scrollWidth / 2 || 1;
  brandsX -= dt * 50 * (1 + Math.min(3, Math.abs(lenis.velocity || 0) * 0.05));
  if (brandsX <= -half) brandsX += half;
  brandsInner.style.transform = `translate3d(${brandsX}px,0,0)`;
}

// ---------- socials fan ----------
const fanCards = $$('.fan-card');
let fanSpread = 0;
function poseFan(spread, instant) {
  fanSpread = spread;
  const mid = (fanCards.length - 1) / 2;
  const r = rem();
  const step = (isMobile() ? 3.3 : 8.2) * r;
  fanCards.forEach((c, i) => {
    const k = i - mid;
    c.style.zIndex = String(10 - Math.abs(Math.round(k)));
    gsap.to(c, {
      x: k * step * spread, y: Math.abs(k) * r * 1.6 * spread, rotation: k * 7 * spread,
      scale: 1 - Math.abs(k) * 0.075, duration: instant ? 0 : 1.1, ease: 'expo.out', overwrite: true,
    });
  });
}

// ---------- build all scroll scenes (after fonts, so measurements are right) ----------
function buildScenes() {
  buildSplits();
  sizeGallery();

  // theme for the plain sections (the hero sets its own every frame)
  $$('[data-theme]').forEach((el) => {
    if (el === heroTrack || el === hs) return;
    ScrollTrigger.create({
      trigger: el, start: 'top 50%', end: 'bottom 50%',
      onToggle: (self) => self.isActive && setTheme(el.dataset.theme),
    });
  });

  // impact statement
  splitTargets.forEach((s) => ScrollTrigger.create({
    trigger: s.el, start: 'top 82%', once: true,
    onEnter: () => { s.revealed = true; s.tl.play(); },
  }));
  $$('[data-hl]').forEach((el) => {
    const tl = prepHighlight(el);
    const inGallery = hsTrack.contains(el);
    ScrollTrigger.create({
      trigger: el, start: inGallery ? 'left 78%' : 'top 85%', once: true,
      containerAnimation: inGallery ? hsTween() : undefined,
      onEnter: () => tl.play(),
    });
  });
  gsap.from('.impact-icon svg', {
    y: 30, opacity: 0, duration: 1, ease: 'expo.out',
    scrollTrigger: { trigger: '.impact', start: 'top 85%', once: true },
  });

  // gallery: pin + horizontal scrub, theme flips to cream near the end
  const tween = hsTween();
  $$('.hs-img img').forEach((img) => gsap.fromTo(img, { xPercent: 0 }, {
    xPercent: -12, ease: 'none',
    scrollTrigger: { trigger: img.parentElement, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
  }));
  $$('.hs-item').forEach((item) => gsap.from(item, {
    opacity: 0, y: 60, duration: 1.1, ease: 'expo.out',
    scrollTrigger: { trigger: item, containerAnimation: tween, start: 'left 92%', once: true },
  }));
  $$('.callout-sig').forEach((svg) => {
    const t = animateSig(svg, { duration: 1.4 });
    ScrollTrigger.create({ trigger: svg, containerAnimation: tween, start: 'left 75%', once: true, onEnter: () => t.play() });
  });

  // on brand / off script
  const ototTrack = $('.otot-track');
  gsap.timeline({ scrollTrigger: { trigger: ototTrack, start: 'top bottom', end: 'top top', scrub: true } })
    .fromTo('.otot-side.is-left', { xPercent: -80 }, { xPercent: 0, ease: 'none' }, 0)
    .fromTo('.otot-side.is-right', { xPercent: 80 }, { xPercent: 0, ease: 'none' }, 0);
  gsap.timeline({ scrollTrigger: { trigger: ototTrack, start: 'top top', end: 'bottom bottom', scrub: true } })
    .to('.otot-side.is-left', { xPercent: -12, ease: 'none' }, 0)
    .to('.otot-side.is-right', { xPercent: 12, ease: 'none' }, 0)
    .to('.otot-links', { scale: 0.94, ease: 'none' }, 0);
  gsap.from('.otot-link > *:not(.otot-script)', {
    y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.06,
    scrollTrigger: { trigger: ototTrack, start: 'top 35%', once: true },
  });
  gsap.to('.otot-script', {
    clipPath: 'inset(0 0% 0 0)', duration: 1.3, ease: 'power2.inOut',
    scrollTrigger: { trigger: ototTrack, start: 'top 5%', once: true },
  });

  // big image opens up to full bleed
  gsap.timeline({ scrollTrigger: { trigger: '.big-reveal', start: 'top bottom', end: 'top top', scrub: true } })
    .fromTo('.big-reveal-inner', { clipPath: 'inset(22% 20% 22% 20%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'none' }, 0)
    .fromTo('.big-reveal-inner img', { scale: 1.35 }, { scale: 1, ease: 'none' }, 0);

  // projects
  gsap.from('.projects-head > *', {
    y: 60, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1,
    scrollTrigger: { trigger: '.projects-head', start: 'top 80%', once: true },
  });
  gsap.set('.proj-card', { opacity: 0 });
  ScrollTrigger.batch('.proj-card', {
    start: 'top 92%', once: true,
    onEnter: (batch) => {
      gsap.to(batch, { opacity: 1, duration: 0.8, stagger: 0.08 });
      gsap.from(batch.map((c) => [...c.children]).flat(), { y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.04 });
    },
  });
  gsap.from('.projects-cta > *', {
    y: 30, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.08,
    scrollTrigger: { trigger: '.projects-cta', start: 'top 85%', once: true },
  });

  // experience
  gsap.from('.exp-copy > *, .text-impact-md > span', {
    y: 60, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.07,
    scrollTrigger: { trigger: '.experience', start: 'top 70%', once: true },
  });
  $$('[data-speed]').forEach((el) => {
    const s = parseFloat(el.dataset.speed);
    gsap.fromTo(el, { y: () => -s * window.innerHeight }, {
      y: () => s * window.innerHeight, ease: 'none',
      scrollTrigger: { trigger: '.experience', start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true },
    });
  });

  // brands
  gsap.from('.brands-head > *', {
    y: 60, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1,
    scrollTrigger: { trigger: '.brands', start: 'top 75%', once: true },
  });
  gsap.to('.brands-script', {
    clipPath: 'inset(0 0% 0 0)', duration: 1.8, ease: 'power2.inOut',
    scrollTrigger: { trigger: '.brands-row', start: 'top 75%', once: true },
  });

  // socials
  poseFan(0, true);
  ScrollTrigger.create({ trigger: '.fan', start: 'top 80%', once: true, onEnter: () => poseFan(1) });
  const fan = $('.fan');
  fan.addEventListener('mouseenter', () => fanSpread && poseFan(1.18));
  fan.addEventListener('mouseleave', () => fanSpread && poseFan(1));
  gsap.from('.socials .title-lg > span, .socials-mark', {
    y: 50, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08,
    scrollTrigger: { trigger: '.socials', start: 'top 75%', once: true },
  });

  // footer
  const footSig = animateSig($('.footer-sig'), { duration: 1.6 });
  ScrollTrigger.create({ trigger: '.footer-panel', start: 'top 75%', once: true, onEnter: () => footSig.play() });
  gsap.from('.footer-title > span', {
    y: 60, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.1,
    scrollTrigger: { trigger: '.footer-panel', start: 'top 70%', once: true },
  });
  gsap.from('.footer-figure img', {
    yPercent: 25, ease: 'none',
    scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
  });
}

let hsTweenRef = null;
function hsTween() {
  if (hsTweenRef) return hsTweenRef;
  hsTweenRef = gsap.to(hsTrack, {
    x: () => -hsDistance(), ease: 'none',
    scrollTrigger: {
      trigger: hs, start: 'top top', end: 'bottom bottom', scrub: true, invalidateOnRefresh: true,
      onUpdate: (self) => { if (self.isActive) setTheme(self.progress > 0.86 ? 'cream' : 'dark'); },
    },
  });
  return hsTweenRef;
}

// ---------- per-frame work ----------
gsap.ticker.add((time, deltaMs) => {
  const dt = Math.min(0.05, deltaMs / 1000);
  updateHero();
  tickMarquee(dt);
  tickBrands(dt);
});

// ---------- resize ----------
let lastW = window.innerWidth, lastH = window.innerHeight, resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = window.innerWidth, h = window.innerHeight;
    const touch = window.matchMedia('(hover: none)').matches;
    if (touch && w === lastW && Math.abs(h - lastH) < 160) return; // mobile URL bar
    lastW = w; lastH = h;
    buildSplits();
    sizeGallery();
    if (gl) gl.resize();
    poseFan(fanSpread, true);
    ScrollTrigger.refresh();
  }, 200);
});

// ---------- loader + boot ----------
const loader = $('.loader');
const counter = $('.loader-count');
let shown = 0, target = 8;
const countTick = () => {
  shown += (target - shown) * 0.12;
  counter.textContent = String(Math.round(shown));
};
gsap.ticker.add(countTick);

async function boot() {
  const started = performance.now();
  const fonts = document.fonts ? document.fonts.ready.then(() => { target += 30; }) : Promise.resolve();
  const heroReady = import('./gl.js')
    .then(({ createGL }) => createGL({
      canvas: $('.gl'),
      head: { map: 'assets/img/head-diffuse.webp', depth: 'assets/img/head-depth.webp' },
      helmetFit: HELMET_FIT,
      helmetModelUrl: 'assets/models/helmet.glb',
    }))
    .then((g) => { gl = g; gl.setTheme(bgTheme); target += 50; })
    .catch((err) => {
      console.warn('Hero WebGL unavailable, using the still portrait.', err);
      document.documentElement.classList.add('no-gl');
      target += 50;
    });
  await Promise.all([fonts, heroReady]);
  const wait = Math.max(0, 1400 - (performance.now() - started));
  await new Promise((r) => setTimeout(r, wait));
  target = 100;

  buildScenes();
  ScrollTrigger.refresh();
  updateHero();

  await new Promise((r) => setTimeout(r, 450));
  gsap.ticker.remove(countTick);
  counter.textContent = '100';

  gsap.timeline({ onComplete: () => loader.remove() })
    .to('.loader-mark', { scale: 0.6, opacity: 0, duration: 0.5, ease: 'power2.in' })
    .to('.loader-label', { opacity: 0, duration: 0.3 }, 0)
    .to(loader, { clipPath: 'inset(0% 0% 100% 0%)', duration: 1.1, ease: EASE }, 0.25)
    .add(() => {
      document.body.classList.remove('is-loading');
      lenis.start();
    }, 0.7)
    .add(() => { if (gl) gl.startReveal(); }, 0.45)
    .from('.hero-fallback', { scale: 1.08, duration: 1.8, ease: 'expo.out' }, 0.35)
    .from('.nav > *', { y: -30, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.06 }, 0.85)
    .from('.hero-card', { y: 40, opacity: 0, duration: 1.1, ease: 'expo.out', clearProps: 'transform' }, 0.95);
}
boot();
