/* 額縁を本物の立体として組む（three.js）
   断面のプロファイルを四辺に沿って掃引し、四隅は45°の留め継ぎ。
   中に写真、前にガラス、裏に裏板・吊り紐・ラベル。 */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const loader = new THREE.TextureLoader();
const texCache = new Map();
const redraws = new Set();
function tex(src, srgb = true, rep = false) {
  const k = src + rep;
  if (texCache.has(k)) return texCache.get(k);
  const t = loader.load(src, () => redraws.forEach(f => f()));
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 8;
  texCache.set(k, t);
  return t;
}

/* 断面（外側の縁 u=0 から内側へ、v は裏 0 から手前へ。単位はメートル） */
const PROFILE = [
  [0, 0], [0, .028], [.0015, .034], [.005, .0385], [.0095, .0412], [.0145, .042],
  [.0195, .0412], [.0235, .0385], [.0255, .0345], [.028, .0318], [.0315, .0302],
  [.036, .0296], [.042, .0296], [.0445, .031], [.0465, .0322], [.0485, .031],
  [.05, .0285], [.0525, .0235], [.055, .0205], [.055, .0115], [.06, .0115], [.06, 0]
];
const SIGHT = .055;   // 見付け（表から見える額の幅）
const RABBET = .06;   // 写真が額の裏に入り込む位置

function moulding(OW, OH, s = 1) {
  const P = PROFILE.map(([u, v]) => [u * s, v * s]);
  // 断面に沿った長さ（木目の縦方向の UV）
  const arc = [0];
  for (let i = 1; i < P.length; i++) arc.push(arc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const sides = [
    { n: [0, 1], t: [1, 0], E: OH / 2, L: OW / 2 },
    { n: [1, 0], t: [0, -1], E: OW / 2, L: OH / 2 },
    { n: [0, -1], t: [-1, 0], E: OH / 2, L: OW / 2 },
    { n: [-1, 0], t: [0, 1], E: OW / 2, L: OH / 2 },
  ];
  const geos = sides.map((sd, k) => {
    const pos = [], uv = [], idx = [];
    const off = k * 0.37;      // 辺ごとに木目の位置をずらす
    P.forEach(([u, v], i) => {
      for (const sg of [-1, 1]) {
        const a = sg * (sd.L - u), d = sd.E - u;
        pos.push(sd.n[0] * d + sd.t[0] * a, sd.n[1] * d + sd.t[1] * a, v);
        uv.push(a * 2.2 + off, arc[i] * 6 + k * .21);
      }
    });
    for (let i = 0; i < P.length - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, d, b, a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
  return geos;
}

function woodMats() {
  const map = tex('tex/wood-board.webp', true, true);
  return new THREE.MeshPhysicalMaterial({
    map, color: 0x7a6250, roughness: .6, metalness: 0,
    clearcoat: .22, clearcoatRoughness: .55, sheen: .2, sheenColor: 0x5a3a22,
  });
}

/* 裏板のテクスチャを描く：木目の上にロゴを彫り、彫り跡を濃く焼く。凹凸は bumpMap で */
const imgCache = new Map();
function loadImg(src) {
  if (!imgCache.has(src)) imgCache.set(src, new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }));
  return imgCache.get(src);
}
function carveBack(mat, bw, bh) {
  const W = 2048, H = Math.round(W * bh / bw);
  const col = document.createElement('canvas'), bmp = document.createElement('canvas');
  col.width = bmp.width = W; col.height = bmp.height = H;
  const cm = new THREE.CanvasTexture(col), bm = new THREE.CanvasTexture(bmp);
  cm.colorSpace = THREE.SRGBColorSpace; cm.anisotropy = bm.anisotropy = 8;
  mat.map = cm; mat.bumpMap = bm;
  Promise.all([loadImg('tex/wood-back.webp'), loadImg('logo.png')]).then(([wood, logo]) => {
    const c = col.getContext('2d'), b = bmp.getContext('2d');
    // 木目
    const s = Math.max(W / wood.width, H / wood.height) * 1.1;
    c.drawImage(wood, (W - wood.width * s) / 2, (H - wood.height * s) / 2, wood.width * s, wood.height * s);
    c.fillStyle = 'rgba(120,86,56,.35)'; c.globalCompositeOperation = 'multiply'; c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
    // ロゴの位置（少し下寄り、中央）
    const lw = W * .19, lh = lw * logo.height / logo.width, lx = (W - lw) / 2, ly = H * .66 - lh / 2;
    // ロゴを単色の形に（彫刻刀の幅ぶん、線を少し太らせる）
    const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
    const mk = mask.getContext('2d');
    for (let k = 0; k < 12; k++) { const t = k / 12 * Math.PI * 2; mk.drawImage(logo, lx + Math.cos(t) * 1.6, ly + Math.sin(t) * 1.6, lw, lh); }
    mk.globalCompositeOperation = 'source-in'; mk.fillStyle = '#000'; mk.fillRect(0, 0, W, H);
    const layer = (color, blur, cutDx, cutDy, shift = [0, 0]) => {
      const t = document.createElement('canvas'); t.width = W; t.height = H; const tc = t.getContext('2d');
      tc.drawImage(mask, shift[0], shift[1]);
      if (cutDx !== null) { tc.globalCompositeOperation = 'destination-out'; tc.drawImage(mask, cutDx, cutDy); }
      tc.globalCompositeOperation = 'source-in'; tc.fillStyle = color; tc.fillRect(0, 0, W, H);
      if (!blur) return t;
      const u = document.createElement('canvas'); u.width = W; u.height = H; const uc = u.getContext('2d');
      uc.filter = `blur(${blur}px)`; uc.drawImage(t, 0, 0); return u;
    };
    // 彫りの底（削られて少し明るい木肌）→ 上の壁の影 → 下の縁の光
    c.drawImage(layer('#6b4a2e', 0, null), 0, 0);
    c.globalAlpha = .85; c.drawImage(layer('#140904', .7, 0, 3), 0, 0);
    c.globalAlpha = .5; c.drawImage(layer('#2a1608', 1.2, 0, 1.2), 0, 0);
    c.globalAlpha = .28; c.drawImage(layer('#d8b48a', .6, 0, 0, [0, 2]), 0, 0);
    c.globalAlpha = 1;
    // 凹凸：板は白（高い）、ロゴは黒（低い）。少しぼかして彫り口をなだらかに
    b.fillStyle = '#fff'; b.fillRect(0, 0, W, H);
    b.filter = 'blur(1.2px)'; b.drawImage(mask, 0, 0); b.filter = 'none';
    cm.needsUpdate = bm.needsUpdate = true;
    redraws.forEach(f => f());
  });
}

/* 額縁一式を作る。opening = 表から見える写真の大きさ（m） */
export function buildFrame(src, ar, { opening = .5 } = {}) {
  const ow = ar >= 1 ? opening : opening * ar, oh = ar >= 1 ? opening / ar : opening;
  const OW = ow + SIGHT * 2, OH = oh + SIGHT * 2;
  const g = new THREE.Group();
  const wood = woodMats();
  moulding(OW, OH).forEach(geo => { const m = new THREE.Mesh(geo, wood); m.castShadow = true; g.add(m); });

  // 写真（見付けの奥まで入り込む）
  const pw = ow + (RABBET - SIGHT) * 2 - .002, ph = oh + (RABBET - SIGHT) * 2 - .002;
  const pt = tex(src);
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph),
    new THREE.MeshStandardMaterial({ map: pt, roughness: .85, metalness: 0, color: 0xf2ece2 }));
  photo.position.z = .0112;
  g.add(photo);

  // ガラス：映り込みだけを足す
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph),
    new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: .04, metalness: 0, reflectivity: .55,
      envMapIntensity: 1.1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glass.position.z = .0114;
  g.add(glass);

  // 裏板：古い板に、ロゴが彫り込まれている
  const back = new THREE.Mesh(new THREE.PlaneGeometry(OW - .004, OH - .004),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .88, bumpScale: 2.2 }));
  carveBack(back.material, OW - .004, OH - .004);
  back.rotation.y = Math.PI; back.position.z = -.0004;
  g.add(back);
  // 吊り金具と紐
  const brass = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: .9, roughness: .35 });
  const ex = OW / 2 - .07, ey = OH * .22;
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.TorusGeometry(.006, .0016, 8, 20), brass);
    eye.position.set(sx * ex, ey, -.006); eye.rotation.y = Math.PI / 2;
    g.add(eye);
  }
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-ex, ey, -.006), new THREE.Vector3(-ex * .5, ey + .035, -.008),
    new THREE.Vector3(0, ey + .05, -.009), new THREE.Vector3(ex * .5, ey + .035, -.008), new THREE.Vector3(ex, ey, -.006)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, .0011, 6), new THREE.MeshStandardMaterial({ color: 0x8c8274, metalness: .6, roughness: .5 })));

  g.userData = { OW, OH, depth: .042 };
  return g;
}

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}
const envs = new WeakMap();
function envFor(r) {
  if (!envs.has(r)) { const pm = new THREE.PMREMGenerator(r); envs.set(r, pm.fromScene(new RoomEnvironment(), .04).texture); pm.dispose(); }
  return envs.get(r);
}
function lights(scene, warm = 1) {
  scene.add(new THREE.HemisphereLight(0xfff2e0, 0x2a1a10, .35));
  const key = new THREE.DirectionalLight(0xffe2bd, 2.2 * warm); key.position.set(-1.2, 1.6, 2.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbcd4ff, .5); rim.position.set(1.5, .4, -1.2); scene.add(rim);
}

/* 拡大表示：ドラッグで回転、ホイール・ピンチで寄る、ダブルクリックで戻す */
export function mountViewer(stage, it, RM = false) {
  const canvas = document.createElement('canvas');
  canvas.className = 'f3d';
  stage.appendChild(canvas);
  const r = makeRenderer(canvas);
  const scene = new THREE.Scene();
  scene.environment = envFor(r);
  lights(scene);
  const frame = buildFrame(it.src, it.ar || 1);
  const pivot = new THREE.Group(); pivot.add(frame); frame.position.z = -.021; scene.add(pivot);
  const cam = new THREE.PerspectiveCamera(28, 1, .01, 20);
  const { OW, OH } = frame.userData;
  let rx = -.12, ry = .32, z = 1, vx = 0, vy = 0, dragging = false, idle = true, t0 = performance.now(), raf = 0, base = 2;
  const pts = new Map(); let pinch = null;
  function size() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    base = Math.max((OH / 2) / th / .86, (OW / 2) / (th * cam.aspect) / .86) + .03;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function loop(now) {
    if (!stage.isConnected) { cancelAnimationFrame(raf); ro.disconnect(); r.dispose(); return; }
    if (idle && !RM) { const t = (now - t0) / 1000; ry = .3 * Math.cos(t * .35); rx = -.1 + .07 * Math.sin(t * .27); }
    else if (!dragging) { ry += vx; rx += vy; vx *= .9; vy *= .9; rx = clamp(rx, -1.25, 1.25); }
    pivot.rotation.set(-rx, ry, 0);
    cam.position.set(0, 0, base / z); cam.lookAt(0, 0, 0);
    r.render(scene, cam);
    raf = requestAnimationFrame(loop);
  }
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    idle = false; dragging = pts.size === 1; vx = vy = 0; stage.classList.add('drag');
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z }; dragging = false; }
  });
  stage.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; z = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, .6, 3.5); return; }
    if (dragging) { ry += dx * .0055; rx = clamp(rx - dy * .0055, -1.25, 1.25); vx = dx * .0035; vy = -dy * .0035; }
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { dragging = false; stage.classList.remove('drag'); } };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', e => { e.preventDefault(); idle = false; z = clamp(z * Math.exp(-e.deltaY * .0015), .6, 3.5); }, { passive: false });
  stage.addEventListener('dblclick', () => { rx = -.12; ry = .32; z = 1; vx = vy = 0; idle = true; t0 = performance.now(); });
  const ro = new ResizeObserver(size); ro.observe(stage); size();
  raf = requestAnimationFrame(loop);
}

/* 部屋の壁に掛かっている額：ふだんは静か、マウスを近づけると少し傾く */
export function mountWallFrame(btn, src, ar, mwPx) {
  const canvas = document.createElement('canvas');
  canvas.className = 'f3d-wall';
  btn.appendChild(canvas);
  btn.classList.add('r3d');
  const r = makeRenderer(canvas);
  const scene = new THREE.Scene();
  scene.environment = envFor(r);
  lights(scene, .85);
  const frame = buildFrame(src, ar);
  const pivot = new THREE.Group(); pivot.add(frame); frame.position.z = -.021; scene.add(pivot);
  const { OW, OH } = frame.userData;
  const ow = ar >= 1 ? .5 : .5 * ar;  // 写真の見える幅（m）
  // 正射影に近い望遠で、壁に正面から掛かって見えるように
  const cam = new THREE.PerspectiveCamera(10, 1, .1, 50);
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, hover = false, pad = 1.25;
  function size() {
    const bw = btn.clientWidth, bh = btn.clientHeight; if (!bw) return;
    const pxPerM = bw / ow;               // 写真の幅をボタンの幅に合わせる
    const cw = OW * pxPerM * pad, ch = OH * pxPerM * pad;
    Object.assign(canvas.style, { width: cw + 'px', height: ch + 'px', left: (bw - cw) / 2 + 'px', top: (bh - ch) / 2 + 'px' });
    r.setSize(cw, ch, false); cam.aspect = cw / ch; cam.updateProjectionMatrix();
    const th = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(0, 0, (OH * pad / 2) / th); cam.lookAt(0, 0, 0);
    draw();
  }
  function draw() { pivot.rotation.set(cy, cx, 0); r.render(scene, cam); }
  function tick() {
    cx += (tx - cx) * .12; cy += (ty - cy) * .12; draw();
    if (Math.abs(tx - cx) > .0005 || Math.abs(ty - cy) > .0005) raf = requestAnimationFrame(tick); else raf = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  btn.addEventListener('pointermove', e => {
    const b = btn.getBoundingClientRect();
    tx = ((e.clientX - b.left) / b.width - .5) * .5; ty = ((e.clientY - b.top) / b.height - .5) * .4; kick();
  });
  btn.addEventListener('pointerleave', () => { tx = ty = 0; kick(); });
  const ro = new ResizeObserver(size); ro.observe(btn);
  // テクスチャが届いたら描き直す
  redraws.add(draw);
}
