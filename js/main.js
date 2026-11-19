/* 一张板的真相 · 场景、柜体、交互、透视、材料单、开场、讲给 AI 听 */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const V3 = THREE.Vector3;
  const body = document.body;
  const VERTICAL = new URLSearchParams(location.search).has('vertical');
  body.classList.toggle('vertical', VERTICAL);
  if (VERTICAL) { $('#ai .head p').textContent = '同一套方案：上面给人看，下面给 AI 看。'; }
  const stage = document.getElementById('stage');
  let viewW = window.innerWidth, viewH = window.innerHeight;

  /* ---------- 常量（单位：米） ---------- */
  const ROOM = { x0: -3.2, x1: 3.3, zd: 5.2, h: 2.6 };
  const D = 0.58, T = 0.018, P = 0.08;          // 柜深、板厚、踢脚高
  const RISE = 2.72 / 14, RUN = 0.25, SW = 0.95; // 楼梯踏步高、踏步深、梯宽
  const ZT = 0.6, ZF = ZT + 13 * RUN, WELL = 3.35; // 楼梯上端、落脚点、楼梯洞口前沿（都是离后墙的距离）
  const CABW = 3.6;                               // 后墙整墙柜总宽
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FIN = TEX.finishes, CORE = TEX.core, CORE_IDS = ['pb', 'ply', 'eco', 'mdf'];
  const HERO = VERTICAL ? new V3(-1.4, 1.55, 7.0) : new V3(-0.25, 1.58, 8.8), HERO_T = VERTICAL ? new V3(-1.25, 1.13, 0.4) : new V3(0.45, 1.08, 0.8);
  const ADJ = VERTICAL ? new V3(-1.4, 1.6, 7.8) : new V3(-1.4, 1.4, 5.9), ADJ_T = new V3(-1.4, 1.2, 0.3);
  const XB = new V3(0.2, 1.45, 3.6), XP = new V3(-0.92, 2.17, 5.35);

  const CFG = window.YZB_CONFIG, CAB = CFG.cabinet, PR = CFG.pricing, BR = CFG.brand;
  const MINW = CAB.minModuleWidthMm / 1000, MAXW = CAB.maxModuleWidthMm / 1000, MINH = CAB.minHeightMm / 1000, MAXH = CAB.maxHeightMm / 1000, DEF_H = CAB.heightMm / 1000;
  const DEF_MODULES = ['tall', 'split', 'niche', 'split', 'tall'].map((type, i) => ({ type, w: CAB.widthsMm[i] / 1000 }));
  const DEF_FINISH = FIN.some(f => f.id === CFG.defaultFinish) ? CFG.defaultFinish : FIN[0].id;
  const state = {
    modules: DEF_MODULES.map(m => Object.assign({}, m)),
    H: DEF_H, finish: DEF_FINISH, core: 'pb', open: {}, mode: 'view'
  };

  /* ---------- 渲染器 ---------- */
  const canvas = $('#gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe6dfd3);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.035, 40);
  camera.position.copy(HERO);
  const pm = new THREE.PMREMGenerator(renderer);
  const envTex = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;

  const controls = new THREE.OrbitControls(camera, canvas);
  controls.target.copy(HERO_T);
  controls.enableDamping = true; controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minDistance = 0.5; controls.maxDistance = VERTICAL ? 16 : 9.5;
  controls.maxPolarAngle = 1.56; controls.minPolarAngle = 0.5;
  controls.minAzimuthAngle = -0.95; controls.maxAzimuthAngle = 0.6;
  controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.7;

  function resize() {
    const rect = stage.getBoundingClientRect();
    const w = viewW = rect.width, h = viewH = rect.height;
    renderer.setPixelRatio(VERTICAL ? 1080 / w : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = VERTICAL ? 62 : w / h < 1 ? 58 : w / h < 1.4 ? 46 : 38;
    camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  }
  window.addEventListener('resize', resize);

  /* ---------- 材质 ---------- */
  function std(color, rough, extra) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: 0, envMapIntensity: 0.25 }, extra || {}));
  }
  function canvasTex(c) {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  const M = {
    wall: std(0xe4dccf, 0.95), ceil: std(0xefe9df, 0.95), inner: std(0xe9e1d2, 0.8), dark: std(0x2b2724, 0.6),
    metal: std(0x1c1a19, 0.35, { metalness: 0.85, envMapIntensity: 0.8 }), slatBack: std(0x3a3129, 0.85), balance: std(0xe7ddcb, 0.7),
    glue: std(0xe9c47c, 0.3, { transparent: true, opacity: 0.85 }),
    led: new THREE.MeshStandardMaterial({ color: 0xfff4e5, emissive: 0xffdbad, emissiveIntensity: 2.6, roughness: 0.5 }),
    grip: new THREE.MeshBasicMaterial({ color: 0xb8894a, depthTest: false }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
    gap: new THREE.MeshBasicMaterial({ color: 0x241b13, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
  };
  // 接触阴影：墙角、柜脚这些地方本来就该暗一点，用渐变贴片补出来（不参与构件穿插检查）
  const aoTex = (() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 64;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 8, 64);
    return new THREE.CanvasTexture(c);
  })();
  const blobTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 20, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const aoMat = (tex, op) => new THREE.MeshBasicMaterial({ map: tex, color: 0x2a1c10, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // a、b 是贴着墙角的那条线的两端，off 是阴影往外淡出的方向和长度
  function aoStrip(a, b, off, op, parent) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a[0], a[1], a[2], b[0], b[1], b[2], b[0] + off[0], b[1] + off[1], b[2] + off[2], a[0] + off[0], a[1] + off[1], a[2] + off[2]], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, aoMat(aoTex, op)); m.renderOrder = 2; m.raycast = () => { }; m.userData.fx = 1; (parent || scene).add(m); return m;
  }
  const glowMats = {};
  function glow(a, b, off, op, parent, color) {
    const m = aoStrip(a, b, off, op, parent), k = op + '|' + (color || 0xffc98a);
    glowMats[k] = glowMats[k] || new THREE.MeshBasicMaterial({ map: aoTex, color: color || 0xffc98a, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.material = glowMats[k]; m.renderOrder = 3; return m;
  }
  function aoBlob(x, z, w, d, op) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), aoMat(blobTex, op));
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.0005, z); m.renderOrder = 2; m.raycast = () => { }; m.userData.fx = 1; scene.add(m); return m;
  }

  // Millimetre-scale surface response. These data maps are linear, never colour encoded.
  const detailCache = {};
  function detailMap(kind) {
    if (detailCache[kind]) return detailCache[kind];
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d'), im = g.createImageData(512, 512), r = lcg(711);
    for (let y=0;y<512;y++) for(let x=0;x<512;x++) {
      const weave = kind==='linen' ? Math.sin(x*Math.PI/2)*Math.sin(y*Math.PI/2)*16 : 0;
      const value = 160 + weave + (r()-.5)*(kind==='plaster'?25:15);
      const i=(y*512+x)*4;im.data[i]=im.data[i+1]=im.data[i+2]=value;im.data[i+3]=255;
    }
    g.putImageData(im,0,0);
    const tex=new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
    tex.repeat.set(kind==='linen'?8:5,kind==='linen'?8:5); tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
    return detailCache[kind]=tex;
  }
  function cloth(color) { return std(color,0.94,{bumpMap:detailMap('linen'),bumpScale:0.00075,roughnessMap:detailMap('linen'),envMapIntensity:0.22}); }
  const surfaceCache = {};
  function surfaceMaps(id) {
    if(surfaceCache[id]) return surfaceCache[id];
    const c=document.createElement('canvas');c.width=256;c.height=512;
    const g=c.getContext('2d');g.drawImage(TEX.finishCanvas(id),0,0,256,512);
    const im=g.getImageData(0,0,256,512);
    for(let i=0;i<im.data.length;i+=4) {
      const lum=im.data[i]*.2126+im.data[i+1]*.7152+im.data[i+2]*.0722;
      const v=192+(lum-140)*.32;im.data[i]=im.data[i+1]=im.data[i+2]=v;
    }
    g.putImageData(im,0,0);
    const tex=new THREE.CanvasTexture(c);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
    return surfaceCache[id]=tex;
  }

  const finMats = {};
  function finishMat(id) {
    if (!finMats[id]) {
      const f = FIN.find(f => f.id === id);
      finMats[id] = new THREE.MeshPhysicalMaterial({ color:0xffffff, map:canvasTex(TEX.finishCanvas(id)),
        roughness:Math.min(0.82,f.rough*1.18), roughnessMap:surfaceMaps(id), bumpMap:surfaceMaps(id),
        bumpScale:f.kind==='纯色'?0.00008:0.00045, metalness:0, clearcoat:0.1, clearcoatRoughness:0.42, envMapIntensity:0.32 });
    }
    return finMats[id];
  }
  const coreMatCache = {};
  function coreMats(type) {
    if (!coreMatCache[type]) {
      const e = std(0xffffff, 0.9, { map: canvasTex(TEX.coreCanvas(type, 'end')) });
      const l = std(0xffffff, 0.9, { map: canvasTex(TEX.coreCanvas(type, 'long')) });
      const f = std(0xffffff, 0.9, { map: canvasTex(TEX.coreCanvas(type, 'face')) });
      coreMatCache[type] = [e, e, f, f, l, l];
    }
    return coreMatCache[type];
  }

  /* ---------- 几何辅助 ---------- */
  let uvS = 7;
  const rnd = () => { uvS = (uvS * 16807) % 2147483647; return uvS / 2147483647; };
  // 按真实尺寸铺贴图：一张贴图 = 1.22 × 2.44 米
  function uvBox(w, h, d) {
    const g = new THREE.RoundedBoxGeometry(w,h,d,1,Math.min(0.0008,w/8,h/8,d/8));
    const uv=g.attributes.uv, pos=g.attributes.position, normal=g.attributes.normal, ou=rnd(),ov=rnd();
    for(let i=0;i<pos.count;i++) {
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),nx=Math.abs(normal.getX(i)),ny=Math.abs(normal.getY(i)),nz=Math.abs(normal.getZ(i));
      if(nx>ny&&nx>nz) uv.setXY(i,(z+d/2)/1.22+ou,(y+h/2)/2.44+ov);
      else if(ny>nz) uv.setXY(i,(x+w/2)/1.22+ou,(z+d/2)/2.44+ov);
      else uv.setXY(i,(x+w/2)/1.22+ou,(y+h/2)/2.44+ov);
    }
    return g;
  }
  function box(w, h, d, mat, x, y, z, parent, cast) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = cast !== false; m.receiveShadow = true;
    (parent || scene).add(m); return m;
  }
  function part(parent, w, h, d, mat, x, y, z, list) {
    const m = new THREE.Mesh(uvBox(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); if (list) list.push(m); return m;
  }
  function clearGroup(g) {
    for (let i = g.children.length - 1; i >= 0; i--) {
      const c = g.children[i];
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      g.remove(c);
    }
  }

  function rbox(w, h, d, mat, x, y, z, r, parent) {
    const geo = THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, h, d, 3, Math.min(r || 0.02, w / 2.2, h / 2.2, d / 2.2)) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; (parent || scene).add(m); return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent, seg) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 32), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; (parent || scene).add(m); return m;
  }
  const lcg = seed => { let v = (seed * 9301 + 49297) % 2147483647; return () => { v = (v * 16807) % 2147483647; return v / 2147483647; }; };
  // 程序生成的抽象画：色块、拱形、圆和一条线，不模仿任何现成作品
  function artCanvas(seed, W, H) {
    const r = lcg(seed), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), pal = ['#c9b79a', '#9aa58d', '#b5714f', '#d9c7a3', '#55606a', '#c58f5a', '#e9e1d2'];
    g.fillStyle = '#ece4d6'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 7; k++) {
      g.fillStyle = pal[Math.floor(r() * pal.length)]; g.globalAlpha = 0.75 + r() * 0.25;
      const x = r() * W * 0.8, y = r() * H * 0.7, w = W * (0.12 + r() * 0.3), h = H * (0.2 + r() * 0.5), t = r();
      g.beginPath();
      if (t < 0.4) g.rect(x, y, w, h); else if (t < 0.75) g.arc(x + w / 2, y + h, w / 2, Math.PI, 0); else g.arc(x, y + h / 2, Math.min(w, h) / 2.4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1; g.strokeStyle = '#3a342d'; g.lineWidth = Math.max(2, W / 260);
    g.beginPath(); g.moveTo(W * 0.08, H * (0.3 + r() * 0.4)); g.bezierCurveTo(W * 0.35, H * r(), W * 0.6, H * r(), W * 0.93, H * (0.3 + r() * 0.4)); g.stroke();
    const im = g.getImageData(0, 0, W, H), d = im.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(im, 0, 0);
    return c;
  }
  let artSmall = null;
  // 柜内的东西：收纳盒、叠好的衣物。按这一格的净高挑着放；随机序列固定，同一格每次重建都一样
  const STUFF = [0xcfc4b0, 0x9aa58d, 0xb98263, 0x8f9aa6, 0xe3dccd, 0x6f6a62, 0xc9a66b], stuffMat = {};
  const sm = c => stuffMat[c] || (stuffMat[c] = std(c, 0.92, { envMapIntensity: 0.08 }));
  function stock(xL, xR, y, clear, seed) {
    if (clear < 0.13) return;
    const r = lcg(seed); let x = xL + 0.03 + r() * 0.03;
    for (let guard = 0; guard < 8; guard++) {
      const kind = r();
      if (kind < 0.45) {
        const bw = 0.2 + r() * 0.08, bh = Math.min(0.22, clear - 0.05), bd = 0.3 + r() * 0.06, z0 = 0.11 + r() * 0.04;
        if (x + bw > xR - 0.03) break;
        rbox(bw, bh, bd, sm(STUFF[Math.floor(r() * 4)]), x + bw / 2, y + bh / 2, z0 + bd / 2, 0.012, cab).castShadow = false;
        const tag = box(0.06, 0.028, 0.002, sm(0xe3dccd), x + bw / 2, y + bh * 0.62, z0 + bd + 0.001, cab, false); tag.userData.fx = 1;
        x += bw + 0.025 + r() * 0.03;
      } else if (kind < 0.88) {
        const cw = 0.24 + r() * 0.05, n = Math.min(5, Math.max(1, Math.floor((clear - 0.06) / 0.036))), k = 1 + Math.floor(r() * n);
        if (x + cw > xR - 0.03) break;
        for (let j = 0; j < k; j++) rbox(cw - r() * 0.02, 0.036, 0.3, sm(STUFF[Math.floor(r() * STUFF.length)]), x + cw / 2, y + 0.018 + j * 0.036, 0.3, 0.014, cab).castShadow = false;
        x += cw + 0.03 + r() * 0.03;
      } else x += 0.12;
    }
  }
  // 挂衣区：一根挂衣杆，挂几件长短不一的衣服
  function wardrobe(x0, w, yFloor, yCeil, seed) {
    const r = lcg(seed), iw = w - 2 * T, ry = yCeil - 0.07, maxL = ry - 0.05 - yFloor - 0.08;
    if (maxL < 0.3) return;
    const rail = cyl(0.012, 0.012, iw, M.metal, x0 + w / 2, ry, 0.29, cab, 12); rail.rotation.z = Math.PI / 2; rail.castShadow = false;
    const n = Math.floor((iw - 0.06) / 0.075);
    for (let k = 0; k < n; k++) {
      if (r() < 0.12) continue;
      const len = Math.min(maxL, 0.55 + r() * 0.45), x = x0 + T + 0.05 + k * 0.075;
      rbox(0.032, len, 0.4 + r() * 0.04, sm(STUFF[Math.floor(r() * STUFF.length)]), x, ry - 0.035 - len / 2, 0.29, 0.014, cab).castShadow = false;
      const hk = box(0.004, 0.03, 0.26, M.metal, x, ry - 0.02, 0.29, cab, false); hk.userData.fx = 1;
    }
  }

  /* ---------- 补间 ---------- */
  const tweens = [];
  const easeIO = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const easeO = k => 1 - Math.pow(1 - k, 3);
  function tween(dur, fn, o) {
    o = o || {};
    const t = { t: -(o.delay || 0), dur, fn, ease: o.ease || easeIO, done: o.done, dead: false };
    tweens.push(t); return t;
  }
  function updTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i];
      if (t.dead) { tweens.splice(i, 1); continue; }
      t.t += dt; if (t.t < 0) continue;
      const k = Math.min(1, t.t / t.dur);
      t.fn(t.ease(k), k);
      if (k >= 1) { tweens.splice(i, 1); if (t.done) t.done(); }
    }
  }
  let flyTw = null;
  function flyTo(p, tg, dur, done) {
    if (flyTw) flyTw.dead = true;
    const p0 = camera.position.clone(), t0 = controls.target.clone();
    controls.enabled = false;
    flyTw = tween(dur, k => {
      camera.position.lerpVectors(p0, p, k); controls.target.lerpVectors(t0, tg, k); camera.lookAt(controls.target);
    }, { done: () => { flyTw = null; controls.enabled = true; if (done) done(); } });
  }

  const verticalShots = {
    doors: [new V3(-1.45, 1.6, 7.2), new V3(-1.45, 1.2, 0.3)],
    inside: [new V3(-1.95, 1.5, 4.3), new V3(-2.05, 1.2, 0.3)],
    stairs: [new V3(0.45, 1.7, 6.3), new V3(2.35, 1.1, 2.2)],
    outro: [new V3(-1.45, 1.6, 7.5), HERO_T]
  };
  function flyShot(name, p, tg, dur) {
    const shot = VERTICAL && verticalShots[name];
    flyTo(shot ? shot[0] : p, shot ? shot[1] : tg, dur);
  }

  /* ---------- 房间 ---------- */
  function buildRoom() {
    const ft = canvasTex(TEX.floorCanvas()); ft.repeat.set(20, 5);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), std(0xe0d8cc, 0.46, { map: ft, envMapIntensity: 0.4 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 6); floor.receiveShadow = true; scene.add(floor);
    box(18, 4.2, 0.1, M.wall, 0, 2.1, -0.05, scene, false);
    // 侧墙用单面，镜头转到墙外也能看进来
    const sideWall = (x, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.zd, 4.2), M.wall);
      m.rotation.y = ry; m.position.set(x, 2.1, ROOM.zd / 2); m.receiveShadow = true; scene.add(m);
    };
    sideWall(ROOM.x0, Math.PI / 2); sideWall(ROOM.x1, -Math.PI / 2);
    // 吊顶：楼梯上方留洞口
    const OW = SW + 0.08, SX = ROOM.x1 - OW;
    box(SX - ROOM.x0, 0.12, ROOM.zd, M.ceil, (SX + ROOM.x0) / 2, 2.66, ROOM.zd / 2, scene, false);
    box(OW, 0.12, ROOM.zd - WELL, M.ceil, SX + OW / 2, 2.66, WELL + (ROOM.zd - WELL) / 2, scene, false);
    box(OW, 0.12, ZT, M.ceil, SX + OW / 2, 2.66, ZT / 2, scene, false);
    const strip = new THREE.MeshBasicMaterial({ color: 0xfff1d6 });
    for (const x of [-1.9, 0.1]) box(0.03, 0.012, 2.4, strip, x, 2.544, 2.7, scene, false);
    // 半地下室高窗
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.62), new THREE.MeshBasicMaterial({ color: 0xfff6e4 }));
    win.rotation.y = Math.PI / 2; win.position.set(ROOM.x0 + 0.004, 2.05, 2.9); scene.add(win);
    for (const z of [1.79, 2.9, 4.01]) box(0.03, 0.61, 0.03, M.dark, ROOM.x0 + 0.015, 2.05, z, scene, false);
    for (const y of [1.73, 2.37]) box(0.03, 0.03, 2.25, M.dark, ROOM.x0 + 0.015, y, 2.9, scene, false);
    // 休闲区：两人位沙发靠左墙，前面一块小地毯和圆茶几
    const fab = cloth(0x867b6b), fab2 = cloth(0x776c5d);
    const sx = ROOM.x0, o = sx + 0.05, zc = 2.65;
    const soft = (w, h, d, mat, x, y, z, r) => {
      const geo = THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, h, d, 4, r || 0.03) : new THREE.BoxGeometry(w, h, d);
      // Seat compression is millimetres, not a change to the furniture silhouette.
      if(h<0.15) {
        const pos=geo.attributes.position;
        for(let i=0;i<pos.count;i++) {
          const px=pos.getX(i),py=pos.getY(i),pz=pos.getZ(i);
          if(py>h*.18) pos.setY(i,py-.005*Math.exp(-Math.pow(px/(w*.4),4)-Math.pow(pz/(d*.4),4)));
        }
        geo.computeVertexNormals();
      }
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); return m;
    };
    box(0.72, 0.1, 1.42, M.dark, o + 0.4, 0.05, zc);
    soft(0.8, 0.26, 1.5, fab, o + 0.4, 0.23, zc, 0.04);
    soft(0.18, 0.4, 1.5, fab, o + 0.09, 0.56, zc, 0.05);
    soft(0.62, 0.22, 0.16, fab, o + 0.49, 0.47, zc - 0.67, 0.05);
    soft(0.58, 0.09, 0.64, fab2, o + 0.49, 0.405, zc - 0.255, 0.035);
    soft(0.58, 0.09, 0.64, fab2, o + 0.49, 0.405, zc + 0.405, 0.035);
    const pil = soft(0.11, 0.34, 0.34, cloth(0xa47760), o + 0.27, 0.62, zc + 0.44, 0.05);
    pil.rotation.z = 0.2; pil.userData.fx = 1;
    box(2.0, 0.012, 1.4, std(0x9b9b87, 0.98, { bumpMap:detailMap('linen'),bumpScale:0.002,envMapIntensity:0.15 }), sx + 1.95, 0.006, zc, scene, false);
    const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.324, 40), M.dark);
    tb.position.set(sx + 1.8, 0.174, zc + 0.05); tb.castShadow = true; scene.add(tb);
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.028, 64), std(0xe6dfd2, 0.3, { envMapIntensity: 0.7 }));
    tt.position.set(sx + 1.8, 0.35, zc + 0.05); tt.castShadow = tt.receiveShadow = true; scene.add(tt);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 1.43, 12), M.metal);
    pole.position.set(sx + 0.3, 0.715, zc + 1.05); scene.add(pole);
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffe8c2 }));
    shade.position.set(sx + 0.3, 1.56, zc + 1.05); scene.add(shade);
    const lampL = new THREE.PointLight(0xffd2a0, 0.28, 4, 2); lampL.position.copy(shade.position); scene.add(lampL);
    // Fine piping on the two seat cushions; geometry follows the rounded corners.
    const seamMat=std(0x6f6557,0.93,{envMapIntensity:0.15});
    for(const seatZ of [zc-0.255,zc+0.405]) {
      const points=[],x0=o+0.49,wx=.282,dz=.312,r=.028;
      for(let corner=0;corner<4;corner++) for(let j=0;j<=8;j++) {
        const angle=corner*Math.PI/2+j/8*Math.PI/2;
        const cx=(corner===0||corner===3?1:-1)*(wx-r);
        const cz=(corner<2?1:-1)*(dz-r);
        points.push(new V3(x0+cx+Math.cos(angle)*r,.423,seatZ+cz+Math.sin(angle)*r));
      }
      const curve=new THREE.CatmullRomCurve3(points,true),welt=new THREE.Mesh(new THREE.TubeGeometry(curve,112,.0013,5,true),seamMat);
      welt.userData.fx=1;scene.add(welt);
    }
    // 左墙踢脚线
    box(0.012, 0.07, 4.12 - 0.62, M.ceil, sx + 0.006, 0.035, (4.12 + 0.62) / 2, scene, false);
    box(0.012, 0.07, ROOM.zd - 5.08, M.ceil, sx + 0.006, 0.035, (ROOM.zd + 5.08) / 2, scene, false);

    // 接触阴影
    const cx1 = ROOM.x0 + CABW, fx = ROOM.x1 - SW;
    aoStrip([sx, 0, D - 0.04], [cx1, 0, D - 0.04], [0, 0, 0.6], 0.55);          // 柜脚前的地面
    aoStrip([cx1, 0, 0.05], [fx, 0, 0.05], [0, 0, 0.5], 0.5);                   // 格栅脚下
    aoStrip([fx, 0, 0.05], [fx, 0, ZF], [-0.55, 0, 0], 0.5);                    // 楼梯柜脚下
    aoStrip([sx, 0, D], [sx, 0, ROOM.zd], [0.45, 0, 0], 0.32);                  // 左墙根
    aoStrip([sx, ROOM.h, D], [sx, ROOM.h, ROOM.zd], [0, -0.4, 0], 0.22);        // 左墙顶
    aoStrip([sx, ROOM.h, D], [sx, ROOM.h, ROOM.zd], [0.4, 0, 0], 0.18);         // 顶面靠左墙
    aoStrip([sx, ROOM.h, D - 0.02], [cx1, ROOM.h, D - 0.02], [0, 0, 0.45], 0.26); // 顶面靠柜体
    aoStrip([cx1, ROOM.h, 0.05], [fx, ROOM.h, 0.05], [0, 0, 0.4], 0.26);        // 顶面靠格栅
    aoStrip([sx, 0, D], [sx, ROOM.h, D], [0, 0, 0.45], 0.26);                   // 左墙靠柜体
    aoStrip([cx1, 0, D], [cx1, ROOM.h, D], [0, 0, -0.5], 0.4);                  // 柜体右侧板靠格栅的阴角
    aoBlob(o + 0.4, zc, 1.25, 1.95, 0.6);
    aoBlob(sx + 1.8, zc + 0.05, 0.75, 0.75, 0.5);

    // 灯光
    scene.add(new THREE.HemisphereLight(0xf0f4fa, 0xb4a48e, 0.18));
    const sun = new THREE.DirectionalLight(0xffefd9, 0.68);
    sun.position.set(-5.6, 3.9, 5.2); sun.target.position.set(0.2, 1, 0.8);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 22;
    sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.007; sun.shadow.radius = 4.5;
    scene.add(sun, sun.target);
    THREE.RectAreaLightUniformsLib.init();
    const windowLight=new THREE.RectAreaLight(0xe6efff,2.1,2.15,0.62);
    windowLight.position.set(ROOM.x0+0.07,2.06,2.9);windowLight.lookAt(0.4,1.0,1.7);scene.add(windowLight);
    const fill = new THREE.DirectionalLight(0xe7efff, 0.12); fill.position.set(5, 3, 6); scene.add(fill);
    const up = new THREE.PointLight(0xffdcae, 0.55, 7, 2); up.position.set(ROOM.x1 - 0.5, 3.4, 2.0); scene.add(up);
    // 柜前和格栅前的洗墙射灯：在门板上打出一段段光斑
    const down = (x, z, tx, ty, tz, k) => {
      const sp = new THREE.SpotLight(0xffebd3, k * 0.82, 7, 0.48, 0.7, 1.2); sp.position.set(x, 2.59, z); sp.target.position.set(tx, ty, tz); scene.add(sp, sp.target);
      if (k > 3) { sp.castShadow = true; sp.shadow.mapSize.set(1024, 1024); sp.shadow.bias = -0.0002; sp.shadow.normalBias = 0.006; sp.shadow.radius = 2.2; sp.shadow.camera.near = 0.3; sp.shadow.camera.far = 6; }   // 柜前四盏投影
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.006, 24), M.led); f.position.set(x, 2.597, z); scene.add(f);
    };
    [-2.75, -1.85, -0.95, -0.05].forEach(x => down(x, D + 0.42, x, 0, D + 0.12, 3.2));
    [0.95, 1.8].forEach(x => down(x, 0.5, x, 0, 0.2, 2.6));
  }

  /* ---------- 布景：窗、画、软装、绿植、扫地机器人、门、开关、出风口、悬浮吊顶 ---------- */
  const leafG = new THREE.SphereGeometry(1, 10, 6);
  let leafM = null;
  function plant(x, y, z, sc, n, seed) {
    if(!leafM){
      const lc=document.createElement('canvas');lc.width=256;lc.height=128;
      const lg=lc.getContext('2d'),shade=lg.createLinearGradient(0,0,0,128);
      shade.addColorStop(0,'#8d9886');shade.addColorStop(.47,'#e2e8d9');shade.addColorStop(.53,'#c6d1b9');shade.addColorStop(1,'#919b86');
      lg.fillStyle=shade;lg.fillRect(0,0,256,128);
      lg.strokeStyle='rgba(246,250,236,.36)';lg.lineWidth=1.2;lg.beginPath();lg.moveTo(0,64);lg.lineTo(256,64);lg.stroke();
      lg.strokeStyle='rgba(75,89,64,.2)';lg.lineWidth=.8;
      for(let k=1;k<10;k++){lg.beginPath();lg.moveTo(k*25,64);lg.quadraticCurveTo(k*25+14,55,k*25+32,15);lg.moveTo(k*25,64);lg.quadraticCurveTo(k*25+14,73,k*25+32,113);lg.stroke();}
      const map=canvasTex(lc);
      leafM=[0x628056,0x72895e,0x566f4f].map(c=>std(c,.54,{map,envMapIntensity:.35}));
    }
    const r = lcg(seed), g = new THREE.Group(), up = new V3(0, 1, 0), fw = new V3(0, 0, 1); g.position.set(x, y, z); scene.add(g);
    for (let k = 0; k < n; k++) {
      const az = k * 2.39996 + r() * 0.5, tilt = 0.16 + 0.8 * (k / n) + r() * 0.1, len = (1.25 - 0.75 * (k / n)) * sc * (0.85 + r() * 0.3);
      const dir = new V3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006 * sc, 0.011 * sc, len, 6), leafM[2]);
      stem.position.copy(dir).multiplyScalar(len / 2); stem.quaternion.setFromUnitVectors(up, dir); stem.userData.fx = 1; stem.castShadow = true; g.add(stem);
      for (let j = 0; j < 3; j++) {
        const lf = new THREE.Mesh(leafG, leafM[(k + j) % 3]), f = 0.55 + j * 0.22, ll = (0.2 - j * 0.03) * sc, side = j === 2 ? 0 : (j ? 1 : -1);
        const out = new V3(dir.x + Math.cos(az + side * 1.3) * 0.7, dir.y * 0.35 + 0.1, dir.z + Math.sin(az + side * 1.3) * 0.7).normalize();
        lf.scale.set(ll * 0.42, 0.006, ll);
        lf.position.copy(dir).multiplyScalar(len * f).addScaledVector(out, ll * 0.9);
        lf.quaternion.setFromUnitVectors(fw, out); lf.userData.fx = 1; lf.castShadow = true; g.add(lf);
      }
    }
    return g;
  }
  function buildDecor() {
    const sx = ROOM.x0, o = sx + 0.05, zc = 2.65, fxm = m => { m.userData.fx = 1; return m; };
    const oak = std(0xffffff, 0.6, { map: canvasTex(TEX.finishCanvas('oak')) }), white = std(0xf1ede5, 0.45), cer = std(0xe9e4da, 0.3, { envMapIntensity: 0.5 });
    // 高窗：窗外的天光和绿篱，前面一副木百叶
    const vc = document.createElement('canvas'); vc.width = 512; vc.height = 144;
    const vg = vc.getContext('2d'), sky = vg.createLinearGradient(0, 0, 0, 144);
    sky.addColorStop(0, '#e6f1fb'); sky.addColorStop(0.6, '#fbf6ea'); sky.addColorStop(1, '#dfe6cf'); vg.fillStyle = sky; vg.fillRect(0, 0, 512, 144);
    const vr = lcg(5);
    for (let k = 0; k < 46; k++) {
      const x = vr() * 512, y = 96 + vr() * 50, rad = 16 + vr() * 30, gr = vg.createRadialGradient(x, y, 2, x, y, rad);
      gr.addColorStop(0, ['rgba(120,150,100,.85)', 'rgba(150,172,120,.8)', 'rgba(96,128,84,.85)'][k % 3]); gr.addColorStop(1, 'rgba(140,165,115,0)');
      vg.fillStyle = gr; vg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const view = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.62), new THREE.MeshBasicMaterial({ map: canvasTex(vc) }));
    view.rotation.y = Math.PI / 2; view.position.set(sx + 0.006, 2.05, 2.9); scene.add(view);
    for (let k = 0; k < 13; k++) { const sl = fxm(box(0.004, 0.032, 2.16, oak, sx + 0.04, 1.765 + k * 0.047, 2.9, scene, false)); sl.rotation.z = 0.62; }
    glow([sx + 0.002, 1.73, 1.8], [sx + 0.002, 1.73, 4.0], [0, -0.5, 0], 0.16, scene, 0xfff1d6);
    // 沙发上方的画
    box(0.022, 0.5, 1.06, std(0x4a3d30, 0.6), sx + 0.011, 1.2, zc, scene, false);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.44), std(0xffffff, 0.92, { map: canvasTex(artCanvas(17, 900, 396)), envMapIntensity: 0.04 }));
    art.rotation.y = Math.PI / 2; art.position.set(sx + 0.0228, 1.2, zc); fxm(art); scene.add(art);
    // A slim, unbranded 60-inch screen on the clear front section of the opposite wall.
    // Its lower edge stays above the first stair treads; no console occupies the circulation path.
    const screenZ=4.28, screenY=1.55;
    const television=rbox(0.018,0.75,1.33,std(0x242725,0.35,{metalness:0.45,envMapIntensity:0.5}),ROOM.x1-0.015,screenY,screenZ,0.006);
    television.name='无品牌壁挂电视';
    const screenCanvas=document.createElement('canvas');screenCanvas.width=768;screenCanvas.height=432;
    const sg=screenCanvas.getContext('2d'),reflection=sg.createLinearGradient(0,0,768,432);
    reflection.addColorStop(0,'#273039');reflection.addColorStop(.4,'#161e23');reflection.addColorStop(1,'#0c1012');
    sg.fillStyle=reflection;sg.fillRect(0,0,768,432);
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.302,0.723),new THREE.MeshPhysicalMaterial({map:canvasTex(screenCanvas),roughness:0.22,clearcoat:0.65,clearcoatRoughness:0.13,envMapIntensity:0.45}));
    screen.rotation.y=-Math.PI/2;screen.position.set(ROOM.x1-0.025,screenY,screenZ);scene.add(screen);
    // 沙发上：第二个靠枕和一条毯子
    const p2 = fxm(rbox(0.11, 0.32, 0.32, cloth(0x9aa58d), o + 0.27, 0.6, zc - 0.3, 0.05)); p2.rotation.z = 0.2; p2.rotation.x = 0.08;
    const bl = cloth(0xe4d9c2);
    bl.side=THREE.DoubleSide;
    const throwGeo=new THREE.PlaneGeometry(.78,.36,70,42),tp=throwGeo.attributes.position;
    for(let i=0;i<tp.count;i++) {
      const u=(tp.getX(i)+.39),v=tp.getY(i),fold=Math.sin(v*72+u*8)*.0028+Math.sin(v*113-u*12)*.001;
      let x,y;
      if(u<.49){x=o+.31+u;y=.468+fold;}
      else {const t=u-.49;x=o+.8+.02*(1-Math.exp(-t/.025))+fold*.55;y=.468-t+fold*.3;}
      tp.setXYZ(i,x,y,zc+.42+v);
    }
    throwGeo.computeVertexNormals();const throwMesh=new THREE.Mesh(throwGeo,bl);throwMesh.castShadow=throwMesh.receiveShadow=true;fxm(throwMesh);scene.add(throwMesh);
    // 沙发旁的边几和一盆小绿植
    const tx = sx + 0.32, tz = zc - 1.02;
    cyl(0.13, 0.13, 0.012, M.metal, tx, 0.006, tz); cyl(0.014, 0.014, 0.468, M.metal, tx, 0.246, tz, scene, 12); cyl(0.2, 0.2, 0.02, oak, tx, 0.49, tz, scene, 48);
    cyl(0.075, 0.06, 0.12, cer, tx, 0.56, tz, scene, 24); plant(tx, 0.62, tz, 0.32, 9, 11);
    aoBlob(tx, tz, 0.5, 0.5, 0.4);
    // 茶几上：托盘、两本书、一只杯子
    const cx = sx + 1.8, cz = zc + 0.05, ty = 0.364;
    rbox(0.3, 0.014, 0.2, std(0x4a3a2c, 0.5), cx - 0.05, ty + 0.007, cz + 0.02, 0.006);
    rbox(0.19, 0.022, 0.135, std(0x8f9aa6, 0.8), cx - 0.07, ty + 0.025, cz + 0.02, 0.004); fxm(rbox(0.17, 0.02, 0.125, std(0xd9c7a3, 0.8), cx - 0.065, ty + 0.046, cz + 0.02, 0.004)).rotation.y = 0.25;
    cyl(0.036, 0.03, 0.07, cer, cx + 0.16, ty + 0.035, cz - 0.1, scene, 24);
    // 格栅前的落地大绿植
    const px = 1.45, pz = 0.48;
    cyl(0.2, 0.16, 0.42, std(0xd6cfc2, 0.85), px, 0.21, pz); fxm(cyl(0.185, 0.185, 0.01, std(0x4a3c30, 1), px, 0.415, pz, scene, 32));
    plant(px, 0.42, pz, 1.0, 13, 23); aoBlob(px, pz, 0.75, 0.75, 0.55);
    // 扫地机器人，停在充电座上（通用造型，没有任何标志）
    const rx = 0.9, body = std(0xebe8e2, 0.4, { envMapIntensity: 0.4 }), dk = std(0x2c2c2e, 0.5);
    box(0.16, 0.12, 0.07, dk, rx, 0.06, 0.085);
    cyl(0.17, 0.17, 0.08, body, rx, 0.05, 0.3, scene, 48); fxm(cyl(0.172, 0.172, 0.014, dk, rx, 0.03, 0.3, scene, 48));
    cyl(0.045, 0.045, 0.022, dk, rx, 0.101, 0.3, scene, 24);
    fxm(box(0.012, 0.002, 0.012, new THREE.MeshBasicMaterial({ color: 0x9be8ae }), rx, 0.0905, 0.4, scene, false));
    aoBlob(rx, 0.3, 0.5, 0.5, 0.5);
    // 开关、插座面板
    const plate = (x, y, z) => { box(0.006, 0.086, 0.086, white, x, y, z, scene, false); fxm(box(0.008, 0.05, 0.034, cer, x, y, z, scene, false)); };
    plate(sx + 0.003, 1.3, 1.22); plate(sx + 0.003, 0.3, 1.22); plate(ROOM.x1 - 0.003, 1.3, 4.4);
    // 右墙前段的踢脚线
    box(0.012, 0.07, ROOM.zd - 4.0, M.ceil, ROOM.x1 - 0.006, 0.035, (ROOM.zd + 4.0) / 2, scene, false);
    // 左墙靠前一扇通往别处的门
    box(0.03, 2.1, 0.06, oak, sx + 0.015, 1.05, 4.15); box(0.03, 2.1, 0.06, oak, sx + 0.015, 1.05, 5.05); box(0.03, 0.06, 0.96, oak, sx + 0.015, 2.13, 4.6);
    box(0.02, 2.07, 0.84, std(0xe9e3d7, 0.6), sx + 0.01, 1.045, 4.6); fxm(box(0.05, 0.022, 0.13, M.metal, sx + 0.04, 1.0, 4.28, scene, false));
    // 空调出风口：吊顶上的两条条缝
    box(1.3, 0.006, 0.16, white, -0.9, 2.597, 4.9, scene, false);
    [4.865, 4.935].forEach(z => fxm(box(1.22, 0.004, 0.03, M.dark, -0.9, 2.5935, z, scene, false)));
    // 悬浮吊顶：中间一块板降下 5 厘米，四周藏灯带，光洗在原顶上
    const r0 = -2.75, r1 = 1.55, q0 = 1.35, q1 = 4.6, cg = 0xffe4bd;
    box(r1 - r0, 0.05, q1 - q0, M.ceil, (r0 + r1) / 2, 2.575, (q0 + q1) / 2, scene, false);
    glow([r0, 2.6, q0], [r1, 2.6, q0], [0, 0, -0.42], 0.34, scene, cg); glow([r0, 2.6, q1], [r1, 2.6, q1], [0, 0, 0.42], 0.34, scene, cg);
    glow([r0, 2.6, q0], [r0, 2.6, q1], [-0.42, 0, 0], 0.34, scene, cg); glow([r1, 2.6, q0], [r1, 2.6, q1], [0.42, 0, 0], 0.34, scene, cg);
    // 地面往上的反光：让吊顶和层板底面不至于一片灰
    const bounce = new THREE.DirectionalLight(0xffedda, 0.15); bounce.position.set(0, -3, 2.6); bounce.target.position.set(0, 2.6, 2.6); scene.add(bounce, bounce.target);
  }

  /* ---------- 柜体 ---------- */
  const cab = new THREE.Group(), stairG = new THREE.Group(), featG = new THREE.Group(), handles = new THREE.Group();
  scene.add(cab, stairG, featG, handles);
  let cabFin = [], stairFin = [], dimPts = [];
  const tally = { cab: null, stair: null };
  const newTally = () => ({ panels: [], hw: { hinge: 0, handle: 0, slide: 0, pin: 0, led: 0 } });
  function cnt(t, name, a, b, th, edge, n) {
    for (let i = 0; i < (n || 1); i++) t.panels.push({ name, a: Math.max(a, b), b: Math.min(a, b), th, edge });
  }

  // 门板背面四周各探出 2.6 毫米的深色细条：正面看就是门缝里的阴影线，门开了以后从背面看不到
  function reveal(m, W, Hh) {
    const e = 0.0026, w = 0.004, z = -T / 2 - 0.0004;
    [[W + 2 * e, w, 0, Hh / 2 + e - w / 2], [W + 2 * e, w, 0, -(Hh / 2 + e - w / 2)], [w, Hh, W / 2 + e - w / 2, 0], [w, Hh, -(W / 2 + e - w / 2), 0]].forEach(q => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(q[0], q[1]), M.gap);
      s.position.set(q[2], q[3], z); s.raycast = () => { }; s.userData.fx = 1; m.add(s);
    });
  }
  function mkDoor(parent, list, fm, xl, yb, dw, dh, hingeL, zf, key, t) {
    const g = 0.003, W = dw - 2 * g, Hh = dh - 2 * g, piv = new THREE.Group();
    // 转轴往柜内收半个板厚：门开到位后整扇落在自己这一侧，相邻两扇不打架（近似暗铰链的轨迹）
    const off = T / 2 + 0.002;
    piv.position.set(hingeL ? xl + g + off : xl + dw - g - off, yb + dh / 2, zf + T / 2 + 0.001);
    const m = new THREE.Mesh(uvBox(W, Hh, T), fm);
    m.position.x = hingeL ? W / 2 - off : -(W / 2 - off); m.castShadow = m.receiveShadow = true;
    const hl = Math.min(0.24, Hh * 0.4);
    const hy = Math.max(-Hh / 2 + hl / 2 + 0.06, Math.min(Hh / 2 - hl / 2 - 0.06, 1.05 - (yb + dh / 2)));
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.01, hl, 0.022), M.metal);
    hb.position.set((hingeL ? 1 : -1) * (W / 2 - 0.034), hy, T / 2 + 0.011); hb.castShadow = true; m.add(hb);
    reveal(m, W, Hh);
    m.userData = { kind: 'door', key, piv, ang: hingeL ? -1.5 : 1.5, pop: true, bz: 0 };
    piv.rotation.y = state.open[key] ? m.userData.ang : 0;
    piv.add(m); parent.add(piv); list.push(m);
    cnt(t, '门板', dh, dw, 18, 2 * (dh + dw));
    t.hw.hinge += dh < 0.9 ? 2 : dh < 1.6 ? 3 : dh < 2.1 ? 4 : 5; t.hw.handle++;
  }
  function mkDrawer(parent, list, fm, xl, yb, dw, dh, zf, key, t) {
    const g = 0.0025, W = dw - 2 * g, Hh = dh - 2 * g, piv = new THREE.Group(), dep = 0.45;
    const pz = zf + T / 2 + 0.001;
    piv.position.set(xl + dw / 2, yb + dh / 2, pz + (state.open[key] ? 0.36 : 0));
    const m = new THREE.Mesh(uvBox(W, Hh, T), fm); m.castShadow = m.receiveShadow = true;
    const hb = new THREE.Mesh(new THREE.BoxGeometry(Math.min(0.2, W * 0.4), 0.01, 0.022), M.metal);
    hb.position.set(0, Hh / 2 - 0.04, T / 2 + 0.011); m.add(hb);
    const bw = W - 0.07, bh = Hh - 0.07;
    const tray = (w, h, d, x, y, z) => { const b = new THREE.Mesh(uvBox(w, h, d), fm); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; piv.add(b); list.push(b); };
    // 抽屉盒：两块侧板通长，底板和背板夹在侧板之间，互相对接不重叠
    const st = 0.014, bt = 0.012;
    tray(st, bh, dep, -bw / 2 + st / 2, 0, -dep / 2 - T / 2); tray(st, bh, dep, bw / 2 - st / 2, 0, -dep / 2 - T / 2);
    tray(bw - 2 * st, bt, dep - st, 0, -bh / 2 + bt / 2, -(dep - st) / 2 - T / 2);
    tray(bw - 2 * st, bh - bt, st, 0, bt / 2, -dep - T / 2 + st / 2);
    reveal(m, W, Hh);
    m.userData = { kind: 'drawer', key, piv, pz, pop: true, bz: 0 };
    piv.add(m); parent.add(piv); list.push(m);
    cnt(t, '抽屉面板', dw, dh, 18, 2 * (dw + dh));
    cnt(t, '抽屉侧板', dep, bh, 18, dep, 2); cnt(t, '抽屉背板', bw - 2 * st, bh - bt, 18, bw - 2 * st); cnt(t, '抽屉底板', bw - 2 * st, dep - st, 9, 0);
    t.hw.slide++; t.hw.handle++;
  }

  function buildModule(m, i, x0, H, fm, t) {
    const w = m.w, iw = w - 2 * T, cx = x0 + w / 2, ch = H - P, L = cabFin;
    part(cab, T, ch, D, fm, x0 + T / 2, P + ch / 2, D / 2, L);
    part(cab, T, ch, D, fm, x0 + w - T / 2, P + ch / 2, D / 2, L);
    cnt(t, '侧板', ch, D, 18, ch, 2);
    part(cab, iw, T, D, fm, cx, H - T / 2, D / 2, L);
    part(cab, iw, T, D, fm, cx, P + T / 2, D / 2, L);
    cnt(t, '顶底板', iw, D, 18, iw, 2);
    part(cab, iw, ch - 2 * T, 0.009, fm, cx, P + ch / 2, 0.012, L);
    cnt(t, '背板', iw, ch - 2 * T, 9, 0);
    part(cab, w, P, T, M.dark, cx, P / 2, D - 0.06);
    cnt(t, '踢脚板', w, P, 18, 0);
    const shelf = (y, fixed) => {
      part(cab, iw, T, D - 0.05, fm, cx, y, 0.02 + (D - 0.05) / 2, L);
      cnt(t, fixed ? '固定层板' : '活动层板', iw, D - 0.05, 18, iw); if (!fixed) t.hw.pin += 4;
    };
    const doorRow = (yb, dh, tag) => {
      const n = w > 0.62 ? 2 : 1, dw = w / n;
      for (let k = 0; k < n; k++) mkDoor(cab, L, fm, x0 + k * dw, yb, dw, dh, n === 2 ? k === 0 : i % 2 === 0, D, i + '-' + tag + k, t);
    };
    // cs 是从底板到顶板各层板的中心高度；相邻两层之间就是一格
    const fill = (cs, skip) => { for (let j = 0; j < cs.length - 1; j++) if (j !== skip) stock(x0 + T, x0 + w - T, cs[j] + T / 2, cs[j + 1] - cs[j] - T, i * 10 + j + 1); };
    if (m.type === 'tall') {
      doorRow(P, ch, 'a');
      const hang = i === 0, ks = hang ? [1, 4] : [1, 2, 3, 4];    // 最左边的高柜做成挂衣区，中间两块层板不装
      ks.forEach(k => shelf(P + ch * k / 5, false));
      fill([P + T / 2].concat(ks.map(k => P + ch * k / 5), [H - T / 2]), hang ? 1 : -1);
      if (hang) wardrobe(x0, w, P + ch / 5 + T / 2, P + ch * 4 / 5 - T / 2, i + 3);
    } else if (m.type === 'split') {
      const ys = 0.92;
      doorRow(P, ys - P, 'l'); doorRow(ys, H - ys, 'u');
      shelf(ys, true); shelf(P + (ys - P) / 2, false);
      shelf(ys + (H - ys) / 3, false); shelf(ys + (H - ys) * 2 / 3, false);
      fill([P + T / 2, P + (ys - P) / 2, ys, ys + (H - ys) / 3, ys + (H - ys) * 2 / 3, H - T / 2]);
    } else {
      const y0 = 0.74, y1 = 1.52, dh = (y0 - P) / 2;
      mkDrawer(cab, L, fm, x0, P, w, dh, D, i + '-d0', t);
      mkDrawer(cab, L, fm, x0, P + dh, w, dh, D, i + '-d1', t);
      shelf(y0 - T / 2, true); shelf(y1 + T / 2, true);
      part(cab, iw, y1 - y0, 0.012, fm, cx, (y0 + y1) / 2, 0.03, L);
      cnt(t, '壁龛背板', iw, y1 - y0, 18, 0);
      box(iw - 0.04, 0.008, 0.014, M.led, cx, y1 - 0.005, D - 0.06, cab, false);
      const pl = new THREE.PointLight(0xffc98a, 0.95, 2.4, 2); pl.position.set(cx, y1 - 0.14, D - 0.22); cab.add(pl);
      t.hw.led++;
      // 壁龛里的几件小物
      const bx = x0 + T + 0.06, cols = [0x8a6f55, 0xd9cfbd, 0x56606a, 0xb99a6b];
      [0.2, 0.235, 0.185, 0.215].forEach((bh, k) => box(0.028, bh, 0.15, std(cols[k], 0.8), bx + k * 0.033, y0 + bh / 2, 0.3, cab));
      const vase = new THREE.Mesh(new THREE.SphereGeometry(0.075, 32, 20), std(0xe8e0d0, 0.35));
      vase.scale.y = 1.25; vase.position.set(x0 + w - 0.2, y0 + 0.093, 0.3); vase.castShadow = true; cab.add(vase);
      box(0.2, 0.03, 0.14, std(0x3a332c, 0.6), cx + 0.02, y0 + 0.015, 0.3, cab);
      doorRow(y1 + T, H - (y1 + T), 'u');
      shelf(y1 + T + (H - y1 - T) / 2, false);
      fill([y1 + T / 2, y1 + T + (H - y1 - T) / 2, H - T / 2]);
      // 壁龛暗藏灯带：靠背板再加一条，光打在背板上
      box(iw - 0.04, 0.006, 0.01, M.led, cx, y1 - 0.004, 0.045, cab, false).userData.fx = 1;
      glow([x0 + T, y1 - 0.002, 0.0365], [x0 + w - T, y1 - 0.002, 0.0365], [0, -(y1 - y0) * 0.7, 0], 0.42, cab);
      if (w >= 0.95) {
        // 相框（里面是程序生成的抽象画）和香薰
        artSmall = artSmall || canvasTex(artCanvas(31, 240, 320));
        box(0.15, 0.2, 0.014, std(0x3a332c, 0.6), x0 + 0.325, y0 + 0.1, 0.1, cab, false);
        const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.122, 0.172), std(0xffffff, 0.9, { map: artSmall, envMapIntensity: 0.05 }));
        pic.position.set(x0 + 0.325, y0 + 0.1, 0.1078); pic.userData.fx = 1; cab.add(pic);
        cyl(0.026, 0.032, 0.09, std(0xb08a58, 0.2, { envMapIntensity: 0.8 }), x0 + w - 0.33, y0 + 0.045, 0.14, cab, 20).castShadow = false;
        for (let k = 0; k < 5; k++) {
          const st = cyl(0.0018, 0.0018, 0.2, M.dark, x0 + w - 0.33 + (k - 2) * 0.012, y0 + 0.17, 0.14 + (k % 2) * 0.01, cab, 5);
          st.rotation.z = (k - 2) * 0.13; st.userData.fx = 1; st.castShadow = false;
        }
      }
    }
    dimPts.push({ p: new V3(cx, 0.045, D + 0.04), text: Math.round(w * 1000) + '' });
  }

  function buildHandles() {
    clearGroup(handles);
    let x = ROOM.x0; const H = state.H, z = D + 0.06;
    for (let i = 0; i < state.modules.length - 1; i++) {
      x += state.modules[i].w;
      const v = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.4, 0.016), M.grip); v.position.set(x, 1.15, z); v.renderOrder = 10;
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.12), M.hit); h.position.copy(v.position); h.userData = { h: 'div', i };
      handles.add(v, h);
    }
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.016, 0.016), M.grip); v.position.set(ROOM.x0 + CABW / 2, H, z); v.renderOrder = 10;
    const h = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.12), M.hit); h.position.copy(v.position); h.userData = { h: 'top' };
    handles.add(v, h);
    dimPts.push({ p: new V3(ROOM.x0 + CABW / 2, H + 0.09, z), text: '高 ' + Math.round(H * 1000) });
    handles.visible = state.mode === 'adjust';
  }

  function buildCab() {
    clearGroup(cab); cabFin = []; dimPts = []; uvS = 7;
    const t = tally.cab = newTally(), fm = finishMat(state.finish), H = state.H;
    let x = ROOM.x0;
    state.modules.forEach((m, i) => { buildModule(m, i, x, H, fm, t); x += m.w; });
    if (H < ROOM.h - 0.001) box(CABW, ROOM.h - H, D - 0.02, M.wall, ROOM.x0 + CABW / 2, (H + ROOM.h) / 2, (D - 0.02) / 2, cab);
    buildHandles(); updateBOM();
  }

  // 楼梯沿右侧墙，从前往后上行；整组在本地坐标里建好再转 90°，柜门朝房间（-x）
  // 本地坐标：x = 离后墙的距离，z = 离右墙的距离（z = SW 是朝房间的立面）
  function buildStairs() {
    uvS = 99;
    const t = tally.stair = newTally(), fm = finishMat(state.finish), L = stairFin, G = stairG, noop = () => { };
    G.rotation.y = -Math.PI / 2; G.position.set(ROOM.x1, 0, 0);
    const tread = std(0xffffff, 0.55, { map: canvasTex(TEX.finishCanvas('oak')) });
    const bays = [{ a: 2, b: 5 }, { a: 5, b: 8 }, { a: 8, b: 11 }, { a: 11, b: 13 }];
    const ZS = SW - 0.04;                               // 踏板和梯段体只做到外侧板的内侧，不再伸出去
    const pitch = x => RISE + (ZF - x) / RUN * RISE;    // 踏步前沿的连线
    const yt = x => pitch(x) + 0.05, yb = x => pitch(x) - 0.21;   // 外侧板的上沿和下沿
    const bayH = b => (b.a + 1) * RISE - 0.22;          // 楼梯下柜的柜顶，压在外侧板下沿以下
    // 按轮廓挤出一块板（本地 x–y 平面里的多边形，沿 z 方向有厚度），贴图按真实尺寸铺
    const slab = (pts, z0, z1, mat, list) => {
      const sh = new THREE.Shape(); pts.forEach((q, i) => { if (i) sh.lineTo(q[0], q[1]); else sh.moveTo(q[0], q[1]); }); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false }), pos = g.attributes.position, uv = g.attributes.uv, ou = rnd(), ov = rnd();
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.22 + ou, pos.getY(i) / 2.44 + ov);
      const m = new THREE.Mesh(g, mat); m.position.z = z0; m.castShadow = m.receiveShadow = true; G.add(m); if (list) list.push(m); return m;
    };
    for (let i = 0; i < 13; i++) {
      const b = bays.find(b => i >= b.a && i < b.b), base = b ? bayH(b) : 0, top = (i + 1) * RISE, x = ZF - (i + 0.5) * RUN, xf = ZF - i * RUN;
      box(RUN, top - 0.04 - base, ZS, M.wall, x, (top - 0.04 + base) / 2, ZS / 2, G);
      part(G, RUN + 0.02, 0.04, ZS, tread, x + 0.01, top - 0.02, ZS / 2);
      // 踏板前沿下面的灯带，和打在踢面上的光
      const led = box(0.008, 0.006, ZS - 0.1, M.led, xf + 0.008, top - 0.043, ZS / 2, G, false); led.userData.fx = 1;
      glow([xf + 0.001, top - 0.04, 0.04], [xf + 0.001, top - 0.04, ZS - 0.04], [0, -0.15, 0], 0.5, G);
    }
    // 外侧板：一整条斜板，把踏板端头包在里面
    const xa = ZF + 0.03, x0 = ZF - (0.21 - RISE) * RUN / RISE;
    slab([[xa, 0], [xa, yt(xa)], [ZT, yt(ZT)], [ZT, yb(ZT)], [x0, 0]], SW - 0.04, SW + 0.02, M.ceil);
    // 柜顶到斜板之间用同花色的固定封板补齐，不留白三角
    slab([[ZF - 2 * RUN, 0], [ZF - 2 * RUN, yb(ZF - 2 * RUN)], [x0, 0]], SW - T, SW, fm, L);
    cnt(t, '楼梯封板', 2 * RUN, yb(ZF - 2 * RUN), 18, 0);
    bays.forEach(b => {
      const xl = ZF - b.b * RUN, xh = ZF - b.a * RUN, h = bayH(b);
      slab([[xl, h], [xh, h], [xh, yb(xh)], [xl, yb(xl)]], SW - T, SW, fm, L);
      cnt(t, '楼梯封板', xh - xl, yb(xl) - h, 18, 0);
    });
    const mkBay = (x0, w, h, shelves, key, kind, hingeL) => {
      const p = 0.06, ch = h - p, iw = w - 2 * T, cx = x0 + w / 2, dz = SW - 0.02;
      part(G, T, ch, dz, fm, x0 + T / 2, p + ch / 2, dz / 2 + 0.02, L);
      part(G, T, ch, dz, fm, x0 + w - T / 2, p + ch / 2, dz / 2 + 0.02, L);
      part(G, iw, T, dz, fm, cx, h - T / 2, dz / 2 + 0.02, L);
      part(G, iw, T, dz, fm, cx, p + T / 2, dz / 2 + 0.02, L);
      part(G, iw, ch - 2 * T, 0.009, fm, cx, p + ch / 2, 0.03, L);
      part(G, w, p, T, M.dark, cx, p / 2, SW - 0.05);
      cnt(t, '楼梯柜侧板', ch, dz, 18, ch, 2); cnt(t, '楼梯柜顶底板', iw, dz, 18, iw, 2);
      cnt(t, '楼梯柜背板', iw, ch - 2 * T, 9, 0); cnt(t, '踢脚板', w, p, 18, 0);
      for (let s = 1; s <= shelves; s++) {
        part(G, iw, T, dz - 0.05, fm, cx, p + ch * s / (shelves + 1), 0.04 + (dz - 0.05) / 2, L);
        cnt(t, '活动层板', iw, dz - 0.05, 18, iw); t.hw.pin += 4;
      }
      if (kind === 'drawer') mkDrawer(G, L, fm, x0, p, w, ch, SW, key, t);
      else mkDoor(G, L, fm, x0, p, w, ch, hingeL, SW, key, t);
    };
    bays.forEach((b, k) => mkBay(ZF - b.b * RUN, (b.b - b.a) * RUN, bayH(b), k, 's-' + k, k === 0 ? 'drawer' : 'door', k % 2 === 1));
    // 楼梯上端到后墙之间的转角高柜，上面是楼上的平台
    mkBay(0.02, ZT - 0.02, 2.4, 4, 's-c', 'door', false);
    box(ZT, ROOM.h - 2.4, SW, M.wall, ZT / 2, (2.4 + ROOM.h) / 2, SW / 2, G);

    // 栏板：四块 12 毫米玻璃立在外侧板上，立边有高光；起步和平台各一根木立柱，木扶手从起步柱接到平台柱
    const glassM = new THREE.MeshStandardMaterial({ color: 0xe6f1ed, transparent: true, opacity: 0.16, roughness: 0.07, metalness: 0, envMapIntensity: 2.4, side: THREE.DoubleSide, depthWrite: false });
    const edgeM = new THREE.MeshBasicMaterial({ color: 0xe2f7ee, transparent: true, opacity: 0.85 });
    const gz = SW - 0.016, NP = 4, gx0 = ZF - 0.02, gx1 = ZT + 0.02, gw = (gx0 - gx1) / NP, GH = 0.9;
    for (let k = 0; k < NP; k++) {
      const xA = gx0 - k * gw - 0.008, xB = gx0 - (k + 1) * gw + 0.008;
      const g = slab([[xA, yt(xA)], [xA, pitch(xA) + GH], [xB, pitch(xB) + GH], [xB, yt(xB)]], gz, gz + 0.012, glassM);
      g.castShadow = false; g.raycast = noop; g.renderOrder = 4;
      [xA, xB].forEach(x => {
        const e = box(0.005, GH - 0.05, 0.014, edgeM, x, (yt(x) + pitch(x) + GH) / 2, gz + 0.006, G, false); e.userData.fx = 1; e.raycast = noop;
        const c = box(0.05, 0.06, 0.03, M.metal, x + (x === xA ? -0.04 : 0.04), yt(x + (x === xA ? -0.04 : 0.04)) + 0.03, gz + 0.006, G, false); c.userData.fx = 1; c.raycast = noop;
      });
    }
    const ry0 = pitch(xa) + GH + 0.02, ry1 = pitch(ZT) + GH + 0.02;
    const rail = part(G, Math.hypot(xa - ZT, ry1 - ry0), 0.045, 0.06, tread, (xa + ZT) / 2, (ry0 + ry1) / 2 + 0.0225, SW - 0.01);
    rail.rotation.z = Math.atan2(ry1 - ry0, ZT - xa); rail.raycast = noop;
    part(G, 0.06, ry0 + 0.07, 0.06, tread, xa + 0.03, (ry0 + 0.07) / 2, SW - 0.01).raycast = noop;
    const UF = ROOM.h + 0.12;                           // 楼上地面
    part(G, 0.06, ry1 + 0.07 - UF, 0.06, tread, ZT - 0.03, (UF + ry1 + 0.07) / 2, SW - 0.01).raycast = noop;
    // 洞口收边：木饰面包住楼板边，比吊顶垂下 4 厘米
    part(G, WELL - ZT, 0.16, 0.02, tread, (ZT + WELL) / 2, 2.64, SW + 0.07);
    part(G, 0.02, 0.16, SW + 0.06, tread, WELL - 0.01, 2.64, (SW + 0.06) / 2);
    part(G, 0.02, 0.16, SW - 0.05, tread, ZT + 0.01, 2.64, (SW - 0.05) / 2);
    glow([ZT + 0.02, 2.56, SW + 0.059], [WELL - 0.02, 2.56, SW + 0.059], [0, 0, -0.5], 0.28, G, 0xffe2b8);
    // 楼上沿洞口的护栏：玻璃栏板加木扶手
    const ugl = (w, d, x, z) => {
      const g = box(w, 0.95, d, glassM, x, UF + 0.475, z, G, false); g.raycast = noop; g.renderOrder = 4;
      part(G, w > d ? w : 0.05, 0.04, w > d ? 0.05 : d, tread, x, UF + 0.97, z).raycast = noop;
    };
    ugl(WELL - ZT - 0.1, 0.012, (ZT + 0.1 + WELL) / 2, SW + 0.11);
    ugl(0.012, SW + 0.08, WELL + 0.03, (SW + 0.08) / 2);
    // 后墙柜体与楼梯之间：通高格栅
    const fx0 = ROOM.x0 + CABW + 0.06, fx1 = ROOM.x1 - SW - 0.08, fw = fx1 - fx0, n = Math.floor(fw / 0.075);
    box(fw, ROOM.h, 0.02, M.slatBack, (fx0 + fx1) / 2, ROOM.h / 2, 0.01, featG, false);
    for (let i = 0; i < n; i++) part(featG, 0.036, ROOM.h - 0.01, 0.03, fm, fx0 + (i + 0.5) * fw / n, ROOM.h / 2, 0.035, L);
    cnt(t, '格栅条', ROOM.h, 0.036, 18, 0, n);
  }

  /* ---------- 换花色 ---------- */
  function setFinish(id) {
    if (id === state.finish) return;
    state.finish = id;
    const nm = finishMat(id), wp = new V3();
    [...cabFin, ...stairFin].forEach(m => {
      m.getWorldPosition(wp);
      const delay = Math.max(0, (wp.x - ROOM.x0) / 6.5) * 0.75; let sw = false;
      tween(0.5, (e, k) => {
        if (m.userData.pop) m.position.z = m.userData.bz + Math.sin(Math.PI * k) * 0.03;
        if (k >= 0.5 && !sw) { sw = true; m.material = nm; }
      }, { delay, ease: x => x });
    });
    if (xr.board) { xr.board.top.material = nm; xr.board.band.material = nm; }
    updateDock();
  }
  function setCore(id) {
    if (id === state.core) return;
    state.core = id;
    if (xr.board) {
      const b = xr.board;
      tween(0.5, (e, k) => {
        b.core.scale.y = 1 - Math.sin(Math.PI * k) * 0.85;
        if (k >= 0.5 && b.coreType !== id) { b.coreType = id; b.core.material = coreMats(id); }
      }, { ease: x => x });
    }
    updateChips(); updateBOM();
  }

  /* ---------- 一张板（开场与透视共用） ---------- */
  function coreGeo(w, tc, d) {
    const g = new THREE.BoxGeometry(w, tc, d), uv = g.attributes.uv, tl = tc * 8;
    const s = [[d / tl, 1], [d / tl, 1], [w / 0.4, d / 0.4], [w / 0.4, d / 0.4], [w / tl, 1], [w / tl, 1]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * s[f][0], uv.getY(i) * s[f][1]); }
    return g;
  }
  function makeBoard(w, d, t, tf, type, o) {
    const g = new THREE.Group(), tc = t - 2 * tf;
    let fm = finishMat(state.finish), cm = coreMats(type), bm = M.balance;
    if (o.fade) {
      fm = fm.clone(); bm = bm.clone();
      const e = cm[0].clone(), f = cm[2].clone(), l = cm[4].clone(); cm = [e, e, f, f, l, l];
      [fm, bm, e, f, l].forEach(m => { m.transparent = true; });
    }
    const top = new THREE.Mesh(uvBox(w, tf, d), fm); top.position.y = tc / 2 + tf / 2;
    const core = new THREE.Mesh(coreGeo(w, tc, d), cm);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(w, tf, d), bm); bot.position.y = -(tc / 2 + tf / 2);
    g.add(top, core, bot);
    const b = { g, top, core, bot, w, d, t, tc, y0: tc / 2 + tf / 2, coreType: type, mats: [fm, bm, cm[0], cm[2], cm[4]] };
    if (o.band) {
      b.band = new THREE.Mesh(uvBox(w, t, 0.008), fm); b.z0 = d / 2 + 0.004; b.band.position.z = b.z0;
      b.glue = new THREE.Mesh(new THREE.BoxGeometry(w, t * 0.86, 0.002), M.glue); b.glue.position.z = d / 2 + 0.001;
      g.add(b.band, b.glue);
    }
    if (o.shadow) [top, core, bot].forEach(m => { m.castShadow = true; m.receiveShadow = true; });
    return b;
  }

  /* ---------- 开场 ---------- */
  let intro = null;
  const IT = 10.5;
  function startIntro() {
    if (intro) return;
    resetToView(true);
    body.classList.add('intro'); controls.enabled = false;
    const b = makeBoard(2.44, 1.22, 0.018, 0.0009, 'pb', { fade: true, shadow: true });
    b.g.position.set(0.2, 1.25, 3.0); scene.add(b.g);
    intro = {
      t: 0, b,
      P: new THREE.CatmullRomCurve3([new V3(-0.33, 1.26, 3.685), new V3(-0.8, 1.36, 4.0), new V3(-1.9, 2.2, 5.5), HERO.clone()]),
      G: new THREE.CatmullRomCurve3([new V3(-0.29, 1.25, 3.61), new V3(-0.05, 1.25, 3.55), new V3(0.2, 1.2, 2.7), HERO_T.clone()])
    };
  }
  function introStep(dt) {
    const I = intro; I.t += dt;
    const tau = Math.min(1, I.t / IT), u = 1 - Math.pow(1 - Math.pow(tau, 1.7), 1.5);
    camera.position.copy(I.P.getPoint(u)); camera.lookAt(I.G.getPoint(u));
    const f = Math.min(1, Math.max(0, (tau - 0.6) / 0.24)), e = easeIO(f);
    I.b.mats.forEach(m => { m.opacity = 1 - e; });
    I.b.g.position.set(0.2 - 1.7 * e, 1.25 + 0.05 * e, 3.0 - 2.1 * e);
    I.b.g.rotation.x = Math.PI / 2 * e;
    if (f > 0) [I.b.top, I.b.core, I.b.bot].forEach(m => { m.castShadow = false; });
    body.classList.toggle('intro-title', I.t > 2.6 && I.t < 9.2);
    if (tau >= 1) endIntro();
  }
  function endIntro() {
    if (!intro) return;
    scene.remove(intro.b.g);
    intro.b.g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    intro.b.mats.forEach(m => m.dispose());
    intro = null;
    camera.position.copy(HERO); controls.target.copy(HERO_T); camera.lookAt(HERO_T); controls.enabled = true;
    body.classList.remove('intro', 'intro-title');
  }

  /* ---------- 透视模式 ---------- */
  const xscene = new THREE.Scene(); xscene.environment = envTex;
  xscene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a48, 0.75));
  const xk = new THREE.DirectionalLight(0xfff1dc, 1.5); xk.position.set(-2.5, 4.5, 6.5); xscene.add(xk);
  const xf = new THREE.DirectionalLight(0xcfe0ff, 0.45); xf.position.set(4, 2, 1); xscene.add(xf);
  const dimScene = new THREE.Scene(), dimCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const dimMat = new THREE.MeshBasicMaterial({ color: 0x15110d, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  dimScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), dimMat));
  const xr = { board: null, k: 0, ex: [0, 0, 0], tw: [] };
  const FROM = new V3(-1.4, 1.3, 0.95);

  function enterXray() {
    killXr();
    if (xr.board) { xscene.remove(xr.board.g); }
    const b = xr.board = makeBoard(0.9, 0.5, 0.072, 0.004, state.core, { band: true, fade: true });
    xscene.add(b.g); xr.ex = [0, 0, 0]; b.g.position.copy(XB); b.g.visible = false;
    b.mats.forEach(m => { m.opacity = 0; m.depthWrite = false; });
    const k0 = xr.k;
    xr.tw.push(tween(1.3, k => {
      b.g.position.copy(XB); b.g.rotation.x = 0; b.g.scale.setScalar(0.96 + 0.04 * k);
      xr.k = k0 + (1 - k0) * k;
    }));
    xr.tw.push(tween(0.55, k => { b.g.visible = true; b.mats.forEach(m => { m.opacity = k; }); }, { delay: 1.2 }));
    xr.tw.push(tween(1.0, k => { xr.ex[0] = k; }, { delay: 1.25, ease: easeO }));
    xr.tw.push(tween(1.0, k => { xr.ex[1] = k; }, { delay: 1.55, ease: easeO }));
    xr.tw.push(tween(1.0, k => { xr.ex[2] = k; }, { delay: 1.85, ease: easeO }));
    xr.tw.push(tween(0.01, () => { }, { delay: 2.3, done: () => body.classList.add('xr-labels') }));
    xr.tw.push(tween(0.01, () => { }, { delay: 3.3, done: () => body.classList.add('xr-cap') }));
    flyTo(VERTICAL ? new V3(-0.6, 2.35, 5.65) : XP, VERTICAL ? new V3(XB.x, XB.y - 0.25, XB.z) : XB, 1.7);
    updateChips();
  }
  function killXr() { xr.tw.forEach(t => { t.dead = true; }); xr.tw = []; }
  function exitXray(instant) {
    killXr(); body.classList.remove('xr-labels', 'xr-cap');
    const b = xr.board; if (!b) return;
    const fin = () => { xscene.remove(b.g); b.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); b.mats.forEach(m => m.dispose()); if (xr.board === b) xr.board = null; xr.k = 0; };
    if (instant) { fin(); return; }
    const k0 = xr.k, s0 = b.g.scale.x;
    xr.tw.push(tween(0.6, k => { xr.k = k0 * (1 - k); b.g.scale.setScalar(s0 * (1 - 0.5 * k)); xr.ex = xr.ex.map(v => v * (1 - k)); }, { done: fin }));
  }

  /* ---------- 模式 ---------- */
  const HINT = {
    view: '拖动旋转 · 滚轮缩放 · 点柜门打开 · C 巡游 · H 隐藏界面',
    adjust: '拖动金色手柄，调整宽度和高度 · 50 mm 吸附',
    xray: '数字键 1–4 切换基材 · 拖动旋转 · X 退出透视'
  };
  let cine = false, cineT = 0;
  function setCine(on) {
    if (intro) return;
    if (on && state.mode !== 'view') setMode(state.mode);
    cine = on; cineT = 0;
    document.querySelectorAll('#tools button[data-act=cine]').forEach(b => b.classList.toggle('on', on));
    if (on) flyTo(cinePos(0, new V3()), HERO_T, 1.2); else controls.enabled = true;
  }
  function cinePos(t, out) {
    const az = -0.25 + Math.sin(t * 0.17) * 0.4, r = 7.9 - (1 - Math.cos(t * 0.17)) * 0.6, pol = 1.5 - Math.sin(t * 0.085) * 0.05;
    return out.set(HERO_T.x + r * Math.sin(pol) * Math.sin(az), HERO_T.y + r * Math.cos(pol), HERO_T.z + r * Math.sin(pol) * Math.cos(az));
  }
  function setMode(m) {
    if (intro) return;
    if (cine) { cine = false; document.querySelectorAll('#tools button[data-act=cine]').forEach(b => b.classList.remove('on')); }
    const prev = state.mode; if (prev === m) m = 'view';
    if (prev === 'xray') exitXray(false);
    state.mode = m;
    body.classList.toggle('mode-xray', m === 'xray'); body.classList.toggle('mode-adjust', m === 'adjust');
    handles.visible = m === 'adjust';
    document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.act === m));
    $('#hint').textContent = HINT[m];
    if (m === 'xray') enterXray(); else if (m === 'adjust') flyTo(ADJ, ADJ_T, 1.1); else flyTo(HERO, HERO_T, 1.2);
  }
  function resetToView(instant) {
    if (state.mode === 'xray') exitXray(instant);
    cine = false;
    state.mode = 'view'; body.classList.remove('mode-xray', 'mode-adjust', 'ai-open'); handles.visible = false;
    document.querySelectorAll('#tools button').forEach(b => b.classList.remove('on'));
    $('#hint').textContent = HINT.view;
    if (flyTw) { flyTw.dead = true; flyTw = null; }
  }

  /* ---------- 指针交互 ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null, drag = null;
  const plane = new THREE.Plane(new V3(0, 0, 1), -(D + 0.06)), hitP = new V3();
  function setRay(e) { const r = canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, camera); }
  const snap = v => Math.round(v / 0.05) * 0.05;
  canvas.addEventListener('pointerdown', e => {
    stopDemo();
    down = { x: e.clientX, y: e.clientY };
    if (state.mode === 'adjust' && !intro) {
      setRay(e);
      const h = ray.intersectObjects(handles.children, false).find(i => i.object.userData.h);
      if (h) { drag = h.object.userData; controls.enabled = false; e.stopImmediatePropagation(); canvas.setPointerCapture(e.pointerId); }
    }
  }, true);
  function applyDrag(d, x, y) {
    const ms = state.modules;
    if (d.h === 'div') {
      let xl = ROOM.x0; for (let k = 0; k < d.i; k++) xl += ms[k].w;
      const xr2 = xl + ms[d.i].w + ms[d.i + 1].w;
      const nx = Math.min(xr2 - MINW, Math.max(xl + MINW, snap(x)));
      const wl = +(nx - xl).toFixed(3), wr = +(xr2 - nx).toFixed(3);
      if (wl !== ms[d.i].w && wl <= MAXW + 1e-6 && wr <= MAXW + 1e-6) { ms[d.i].w = wl; ms[d.i + 1].w = wr; buildCab(); }
    } else {
      const nh = +Math.min(MAXH, Math.max(MINH, snap(y))).toFixed(2);
      if (nh !== state.H) { state.H = nh; buildCab(); }
    }
  }
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    setRay(e); if (!ray.ray.intersectPlane(plane, hitP)) return;
    applyDrag(drag, hitP.x, hitP.y);
  }, true);
  canvas.addEventListener('pointerup', e => {
    if (drag) { drag = null; controls.enabled = true; down = null; return; }
    if (!down || intro || state.mode === 'xray') { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 5) return;
    setRay(e);
    const hit = ray.intersectObjects([cab, stairG], true)[0]; if (!hit) return;
    let o = hit.object; while (o && !(o.userData && o.userData.kind)) o = o.parent;
    if (o) toggleOpen(o);
  });
  function toggleOpen(m) {
    const u = m.userData, on = state.open[u.key] = !state.open[u.key];
    if (u.kind === 'door') { const a0 = u.piv.rotation.y, a1 = on ? u.ang : 0; tween(0.75, e => { u.piv.rotation.y = a0 + (a1 - a0) * e; }); }
    else { const z0 = u.piv.position.z, z1 = u.pz + (on ? 0.36 : 0); tween(0.6, e => { u.piv.position.z = z0 + (z1 - z0) * e; }); }
  }

  /* ---------- 自动演示：实现在 js/demo.js，解说词和时间点在 narration.json ---------- */
  function openKey(key, on) {
    const m = [...cabFin, ...stairFin].find(m => m.userData.key === key);
    if (m && !!state.open[key] !== on) toggleOpen(m);
  }
  const demoOn = () => !!(window.DEMO && window.DEMO.running);
  function stopDemo() { if (demoOn()) window.DEMO.stop(); }
  function startDemo() { if (window.DEMO) window.DEMO.start(); }
  function closeAll() { Object.keys(state.open).forEach(k => openKey(k, false)); }
  function resetLayout() {
    const same = state.H === DEF_H && state.modules.every((m, i) => m.w === DEF_MODULES[i].w);
    if (same) return;
    state.modules = DEF_MODULES.map(m => Object.assign({}, m)); state.H = DEF_H; buildCab();
  }

  /* ---------- 材料单与报价（全部示意） ---------- */
  const SHEET = 1.22 * 2.44;
  // 价格表、损耗系数全部来自 config.json，均为示意
  const ZERO = [0, 0], rng2 = a => (Array.isArray(a) && a.length === 2 ? a.map(Number) : ZERO);
  const PRICE = PR.tiers.slice(0, 3).map(t => ({ name: String(t.name || ''), p18: rng2(t.p18), p9: rng2(t.p9), edge: rng2(t.edge), hinge: rng2(t.hinge), slide: rng2(t.slide), handle: rng2(t.handle), led: rng2(t.led) }));
  const COREF = PR.coreFactor;
  function calc() {
    const ps = [...tally.cab.panels, ...tally.stair.panels], hw = {};
    for (const k in tally.cab.hw) hw[k] = tally.cab.hw[k] + tally.stair.hw[k];
    let a18 = 0, a9 = 0, edge = 0;
    ps.forEach(p => { const a = p.a * p.b; if (p.th === 9) a9 += a; else a18 += a; edge += p.edge; });
    edge *= PR.edgeFactor;
    const s18 = Math.ceil(a18 * PR.wasteFactor18 / SHEET), s9 = Math.ceil(a9 * PR.wasteFactor9 / SHEET);
    const hwN = hw.hinge + hw.handle + hw.slide + hw.pin + hw.led, cf = COREF[state.core] ?? 1;
    const tiers = PRICE.map(p => {
      const v = j => Math.round((s18 * SHEET * p.p18[j] * cf + s9 * SHEET * p.p9[j] + edge * p.edge[j] + hw.hinge * p.hinge[j] + hw.slide * p.slide[j] + hw.handle * p.handle[j] + hw.led * p.led[j] + hw.pin * PR.shelfPinPrice) / 100) * 100;
      return { name: p.name, lo: v(0), hi: v(1) };
    });
    return { ps, hw, a18, a9, edge, s18, s9, hwN, tiers };
  }
  const yuan = n => PR.currency + ' ' + n.toLocaleString('en-US');
  let bomPrev = {};
  function updateBOM() {
    if (!tally.cab || !tally.stair) return;
    const c = calc();
    const vals = { s18: c.s18, a18: c.a18.toFixed(1), s9: c.s9, a9: c.a9.toFixed(1), edge: c.edge.toFixed(1), hw: c.hwN, hws: c.hw.hinge + '/' + c.hw.pin, t0: c.tiers[0].lo, t1: c.tiers[1].lo, t2: c.tiers[2].lo };
    $('#bombody').innerHTML =
      `<div class="row"><span>18 mm 板材</span><b data-k="s18">${c.s18}<i>张</i></b></div>` +
      `<div class="sub" data-k="a18">展开面积 ${c.a18.toFixed(1)} ㎡ · 基材 ${CORE[state.core].name}</div>` +
      `<div class="row"><span>9 mm 背板</span><b data-k="s9">${c.s9}<i>张</i></b></div>` +
      `<div class="sub" data-k="a9">展开面积 ${c.a9.toFixed(1)} ㎡</div>` +
      `<div class="row"><span>封边</span><b data-k="edge">${c.edge.toFixed(1)}<i>米</i></b></div>` +
      `<div class="row"><span>五金</span><b data-k="hw">${c.hwN}<i>件</i></b></div>` +
      `<div class="sub" data-k="hws">铰链 ${c.hw.hinge} · 滑轨 ${c.hw.slide} 对 · 拉手 ${c.hw.handle} · 层板托 ${c.hw.pin} · 灯带 ${c.hw.led}</div>` +
      `<div class="tiers">` + c.tiers.map((t, i) => `<div class="tier"><span>${esc(t.name)}</span><b data-k="t${i}">${yuan(t.lo)} – ${t.hi.toLocaleString('en-US')}</b></div>`).join('') + `</div>` +
      `<div class="note">示意价格，非真实报价 · 用量系数为示意</div>` +
      `<button class="btn" id="csv">导出 CSV</button>`;
    document.querySelectorAll('#bombody [data-k]').forEach(el => { const k = el.dataset.k; if (bomPrev[k] !== undefined && bomPrev[k] !== vals[k]) el.classList.add('tick'); });
    bomPrev = vals;
    $('#bomsum').textContent = `板材 ${c.s18 + c.s9} 张 · 封边 ${c.edge.toFixed(1)} 米 · ${yuan(c.tiers[0].lo)} 起（示意）`;
    $('#csv').onclick = exportCSV;
  }
  function buildCSV() {
    const c = calc(), agg = {};
    c.ps.forEach(p => {
      const k = [p.name, Math.round(p.a * 1000), Math.round(p.b * 1000), p.th].join('|');
      agg[k] = (agg[k] || 0) + 1;
    });
    const rows = [['一张板的真相 · 材料单（示意数据，非真实报价）'], [], ['名称', '长 mm', '宽 mm', '厚 mm', '数量', '面积 ㎡']];
    Object.keys(agg).sort().forEach(k => { const [n, a, b, th] = k.split('|'); rows.push([n, a, b, th, agg[k], (a * b * agg[k] / 1e6).toFixed(3)]); });
    rows.push([], ['五金', '', '', '', '数量'], ['铰链', '', '', '', c.hw.hinge], ['抽屉滑轨（对）', '', '', '', c.hw.slide], ['拉手', '', '', '', c.hw.handle], ['层板托', '', '', '', c.hw.pin], ['灯带', '', '', '', c.hw.led]);
    rows.push([], ['汇总'], ['基材', CORE[state.core].name], ['饰面', FIN.find(f => f.id === state.finish).name],
      ['18 mm 板材（张）', c.s18], ['9 mm 背板（张）', c.s9], ['18 mm 展开面积 ㎡', c.a18.toFixed(2)], ['封边 米', c.edge.toFixed(1)]);
    c.tiers.forEach(t => rows.push([t.name + '档 示意价格区间', t.lo + ' – ' + t.hi]));
    rows.push([], ['说明：价格表与损耗系数均为虚拟示意，不代表任何真实品牌与报价。']);
    return '﻿' + rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  }
  function exportCSV() {
    const csv = buildCSV();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = BR.title + '_材料单_示意.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- 讲给 AI 听 ---------- */
  function openAI(ask) {
    $('#aiq').textContent = typeof ask === 'string' && ask ? '问：' + ask : '';
    const c = calc(), f = FIN.find(f => f.id === state.finish), core = CORE[state.core];
    const Hmm = Math.round(state.H * 1000);
    const name = BR.productName;
    const facts = [
      ['基材', `${core.name}（${core.desc}）`],
      ['饰面', `${f.name} · ${f.kind}，浸渍胶膜纸饰面`],
      ['环保等级', '示意，以检测报告为准'],
      ['尺寸', `后墙整墙柜 宽 ${Math.round(CABW * 1000)} × 高 ${Hmm} × 深 580 mm，${state.modules.length} 个模块；另有楼梯下柜 5 组、通高格栅一面`],
      ['板材用量', `18 mm 板 ${c.s18} 张（展开 ${c.a18.toFixed(1)} ㎡），9 mm 背板 ${c.s9} 张`],
      ['封边', `${c.edge.toFixed(1)} 米`],
      ['五金', `铰链 ${c.hw.hinge}，滑轨 ${c.hw.slide} 对，拉手 ${c.hw.handle}，灯带 ${c.hw.led}`]
    ];
    $('#card').innerHTML = `<div class="t">${esc(name)}</div><div class="b">${esc(BR.productBrand)}</div><dl>` + facts.map(r => `<dt>${esc(r[0])}</dt><dd>${esc(r[1])}</dd>`).join('') + `</dl>`;
    const q = (v, u) => ({ '@type': 'QuantitativeValue', value: v, unitCode: u });
    const pv = (n, v) => ({ '@type': 'PropertyValue', name: n, value: v });
    const ld = {
      '@context': 'https://schema.org', '@type': 'Product', name,
      brand: { '@type': 'Brand', name: BR.productBrand },
      category: '全屋定制 / 储物柜',
      material: `${core.name}基材，浸渍胶膜纸饰面`,
      color: f.name,
      width: q(Math.round(CABW * 1000), 'MMT'), height: q(Hmm, 'MMT'), depth: q(580, 'MMT'),
      additionalProperty: [
        pv('基材', core.name), pv('基材结构', core.desc), pv('饰面', `${f.name}（${f.kind}）`),
        pv('环保等级', '示意，以检测报告为准'), pv('模块数', state.modules.length), pv('楼梯下柜', '5 组'), pv('格栅', '通高一面'),
        pv('18mm 板材用量（张）', c.s18), pv('9mm 背板用量（张）', c.s9), pv('封边长度（米）', +c.edge.toFixed(1)),
        pv('铰链（只）', c.hw.hinge), pv('抽屉滑轨（对）', c.hw.slide)
      ]
    };
    const raw = JSON.stringify(ld, null, 2);
    $('#ld').dataset.raw = '<script type="application/ld+json">\n' + raw + '\n<\/script>';
    $('#ld').innerHTML = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"([^"]+)":/g, '<span class="k">"$1"</span>:');
    body.classList.add('ai-open');
  }
  $('#copyld').onclick = () => {
    const done = () => { $('#copyld').textContent = '已复制'; setTimeout(() => { $('#copyld').textContent = '复制 JSON-LD'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText($('#ld').dataset.raw).then(done, done); else done();
  };

  /* ---------- 界面 ---------- */
  function buildDock() {
    const sw = $('#sw');
    FIN.forEach(f => {
      const b = document.createElement('button'); b.dataset.id = f.id; b.title = f.name;
      const c = document.createElement('canvas'); c.width = c.height = 76;
      const src = TEX.finishCanvas(f.id), s = Math.min(src.width, src.height) * 0.45;
      c.getContext('2d').drawImage(src, 0, 0, s, s, 0, 0, 76, 76);
      b.style.backgroundImage = `url(${c.toDataURL()})`;
      b.onclick = () => setFinish(f.id); sw.appendChild(b);
    });
    updateDock();
  }
  function updateDock() {
    const f = FIN.find(f => f.id === state.finish);
    document.querySelectorAll('#sw button').forEach(b => b.classList.toggle('on', b.dataset.id === state.finish));
    $('#swname').innerHTML = `${esc(f.name)}<small>${esc(f.kind)}</small>`;
  }
  function buildChips() {
    const el = $('#chips');
    CORE_IDS.forEach((id, i) => {
      const b = document.createElement('button'); b.dataset.id = id; b.textContent = CORE[id].name; b.title = '快捷键 ' + (i + 1);
      b.onclick = () => setCore(id); el.appendChild(b);
    });
    updateChips();
  }
  function updateChips() {
    document.querySelectorAll('#chips button').forEach(b => b.classList.toggle('on', b.dataset.id === state.core));
    $('#xcore').textContent = '基材 · ' + CORE[state.core].name; $('#xdesc').textContent = CORE[state.core].desc;
  }
  function toggleUI() { body.classList.toggle('noui'); }
  function toggleBom() { const s = $('#bom').classList.toggle('shut'); $('#bomtog').textContent = s ? '展开' : '收起'; }
  $('#bom header').onclick = toggleBom;
  $('#skip').onclick = endIntro;
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-act]'); if (!a) { if (e.target.id === 'ai') body.classList.remove('ai-open'); return; }
    const act = a.dataset.act;
    if (act === 'xray' || act === 'adjust') setMode(act);
    else if (act === 'ai') openAI();
    else if (act === 'ai-close') body.classList.remove('ai-open');
    else if (act === 'cine') setCine(!cine);
    else if (act === 'demo') { if (demoOn()) stopDemo(); else startDemo(); }
    else if (act === 'replay') startIntro();
    else if (act === 'hide') toggleUI();
  });
  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'p') { if (demoOn()) stopDemo(); else startDemo(); return; }
    stopDemo();
    if (intro) { if (k === ' ' || k === 'escape' || k === 'enter') endIntro(); return; }
    if (k === 'h') toggleUI();
    else if (k === 'x') setMode('xray');
    else if (k === 'a') setMode('adjust');
    else if (k === 'g') { if (body.classList.contains('ai-open')) body.classList.remove('ai-open'); else openAI(); }
    else if (k === 'b') toggleBom();
    else if (k === 'q') setFX(!fxOn);
    else if (k === 'c') setCine(!cine);
    else if (k === 'r') startIntro();
    else if (k === 'escape') { if (body.classList.contains('ai-open')) body.classList.remove('ai-open'); else if (state.mode !== 'view') setMode(state.mode); }
    else if (k >= '1' && k <= '4') setCore(CORE_IDS[+k - 1]);
    else if (k === 'arrowright' || k === 'arrowleft') {
      const i = FIN.findIndex(f => f.id === state.finish), n = FIN.length;
      setFinish(FIN[(i + (k === 'arrowright' ? 1 : n - 1)) % n].id);
    }
  });

  /* ---------- 叠加层定位 ---------- */
  const tmp = new V3();
  function scr(v) { tmp.copy(v).project(camera); return { x: (tmp.x * 0.5 + 0.5) * viewW, y: (-tmp.y * 0.5 + 0.5) * viewH, ok: tmp.z < 1 }; }
  const dimsEl = $('#dims'), xls = [...document.querySelectorAll('.xl')], anc = new V3();
  function overlays() {
    const showD = state.mode === 'adjust' && !intro;
    while (dimsEl.children.length < (showD ? dimPts.length : 0)) dimsEl.appendChild(document.createElement('div'));
    while (dimsEl.children.length > (showD ? dimPts.length : 0)) dimsEl.removeChild(dimsEl.lastChild);
    if (showD) dimPts.forEach((d, i) => { const s = scr(d.p), el = dimsEl.children[i]; if (el.textContent !== d.text) el.textContent = d.text; el.style.left = s.x + 'px'; el.style.top = s.y + 'px'; });
    const b = xr.board;
    if (b) {
      const pts = [[b.w / 2, b.top.position.y, b.d / 2], [b.w / 2, 0, b.d / 2], [b.w / 2, b.bot.position.y, b.d / 2], [-b.w / 2, 0, b.band.position.z]];
      xls.forEach((el, i) => {
        anc.set(pts[i][0], pts[i][1], pts[i][2]); b.g.localToWorld(anc); const s = scr(anc);
        const W = viewW, H = viewH;
        if (VERTICAL) {
          el.style.cssText = ''; return;
        }
        const width = Math.min(390, W * 0.28);
        el.style.width = width + 'px'; el.style.whiteSpace = 'normal';
        el.style.left = Math.max(20, Math.min(W - width - 20, i === 3 ? s.x - width - 30 : s.x + 24)) + 'px';
        el.style.top = Math.max(138, Math.min(H - 170, s.y - 13)) + 'px';
        el.style.transform = 'none';
      });
      // Fit the complete right-hand label stack, using measured text heights for every core.
      const right = VERTICAL ? [] : xls.slice(0, 3), gap = 22;
      const total = right.reduce((n, el) => n + el.offsetHeight, 0) + gap * 2;
      let y = Math.max(138, Math.min(right.length ? parseFloat(right[0].style.top) : 0, viewH - 150 - total));
      right.forEach(el => { el.style.top = y + 'px'; y += el.offsetHeight + gap; });
    }
  }

  /* ---------- 后期：环境光遮蔽、轻微泛光、抗锯齿（Q 开关；网址加 ?nofx 默认关闭） ---------- */
  let composer = null, fxOn = !/nofx/.test(location.search), ssao = null, bloom = null;
  function initFX() {
    if (!THREE.EffectComposer || !THREE.SSAOPass || !THREE.UnrealBloomPass || !THREE.ShaderPass || !THREE.GammaCorrectionShader) { fxOn = false; return; }
    const w = viewW, h = viewH, pr = renderer.getPixelRatio();
    composer = new THREE.EffectComposer(renderer, new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType }));
    composer.setPixelRatio(pr); composer.setSize(w, h);
    ssao = new THREE.SSAOPass(scene, camera, w * pr, h * pr);
    ssao.beautyRenderTarget.texture.type = THREE.HalfFloatType;
    ssao.kernelRadius = 0.14; ssao.minDistance = 0.0004; ssao.maxDistance = 0.006;
    ssao.ssaoMaterial.fragmentShader = ssao.ssaoMaterial.fragmentShader.replace('vec3( 1.0 - occlusion )', 'vec3( 1.0 - 0.48 * occlusion )');
    // 法线通道里不画透明的东西（阴影贴片、光斑、玻璃），否则它们会被当成实体算遮蔽
    const vis = new Map();
    ssao.overrideVisibility = function () {
      scene.traverse(o => { vis.set(o, o.visible); if (o.isPoints || o.isLine || o.userData.fx || (o.isMesh && o.material && (o.material.transparent || o.material.visible === false))) o.visible = false; });
    };
    ssao.restoreVisibility = function () { scene.traverse(o => { if (vis.has(o)) o.visible = vis.get(o); }); vis.clear(); };
    composer.addPass(ssao);
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.09, 0.3, 0.94); composer.addPass(bloom);
    composer.addPass(new THREE.ShaderPass({
      uniforms:{tDiffuse:{value:null}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 tex=texture2D(tDiffuse,vUv);vec3 c=pow(max(tex.rgb,vec3(0.)),vec3(1.04));float l=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(l),c,.96);gl_FragColor=vec4(c,tex.a);}'
    }));
    composer.addPass(new THREE.ShaderPass(THREE.GammaCorrectionShader));
    if (THREE.SMAAPass) composer.addPass(new THREE.SMAAPass(w * pr, h * pr));
  }
  function setFX(on) { fxOn = !!on && !!composer; return fxOn; }

  /* ---------- 主循环 ---------- */
  let last = performance.now(), time = 0, fpsN = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!window.APP.hold) step(dt);   // APP.hold = true：调试时停住时间，用 APP.advance(秒) 手动走
    draw(); fpsN++;
    requestAnimationFrame(frame);
  }
  function step(dt) {
    time += dt;
    updTweens(dt);
    if (intro) introStep(dt);
    if (cine && !flyTw && !intro) { controls.enabled = false; cineT += dt; cinePos(cineT, camera.position); controls.target.copy(HERO_T); camera.lookAt(HERO_T); }
    if (controls.enabled) controls.update();
  }
  function draw() {
    renderer.autoClear = true;
    if (ssao) {
      // r147 only copies these on setSize: update after the current projection, never before.
      ssao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      ssao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
    }
    if (composer && fxOn) composer.render(); else renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const b = xr.board;
    if (b) {
      b.top.position.y = b.y0 + xr.ex[0] * 0.11;
      b.bot.position.y = -b.y0 - xr.ex[1] * 0.085;
      b.band.position.z = b.z0 + xr.ex[2] * 0.15;
      b.glue.position.z = b.d / 2 + 0.001 + xr.ex[2] * 0.07;
      b.g.rotation.y = Math.sin(time * 0.35) * 0.16 * xr.k;
      dimMat.opacity = xr.k * 0.8;
      renderer.autoClear = false;
      renderer.render(dimScene, dimCam);
      renderer.clearDepth();
      renderer.render(xscene, camera);
    }
    overlays();
  }

  /* ---------- 启动 ---------- */
  async function boot() {
    for (const f of FIN) { TEX.finishCanvas(f.id); await new Promise(r => setTimeout(r, 0)); }
    M.wall.bumpMap=detailMap('plaster');M.wall.bumpScale=0.00045;
    M.ceil.bumpMap=detailMap('plaster');M.ceil.bumpScale=0.0003;
    buildRoom(); buildDecor(); buildStairs(); buildCab(); buildDock(); buildChips();
    $('#hint').textContent = HINT.view;
    resize(); initFX(); resize();
    body.classList.remove('loading');
    if (!/nointro/.test(location.search)) startIntro(); else camera.lookAt(HERO_T);
    requestAnimationFrame(frame);
  }
  /* ---------- 调试：构件穿插检查。APP.audit() 返回全关和全开两种状态下互相重叠超过 3 毫米的构件对 ---------- */
  function audit() {
    const pass = () => {
      scene.updateMatrixWorld(true);
      const items = [], bad = [], sz = new V3(), ct = new V3();
      scene.traverse(o => {
        if (!o.isMesh || o.userData.fx || !/Box|Cylinder|Sphere/.test(o.geometry.type)) return;
        for (let q = o; q; q = q.parent) if (!q.visible) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        if (ms.some(m => m.visible === false || m.depthTest === false)) return;
        if (Math.abs(o.rotation.z) > 0.01 || Math.abs(o.rotation.x) > 0.01) return;   // 斜放的（扶手等）包围盒不准，不查
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        items.push({ o, b: o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld) });
      });
      const d = it => { it.b.getSize(sz); it.b.getCenter(ct); return `c(${ct.x.toFixed(2)},${ct.y.toFixed(2)},${ct.z.toFixed(2)}) s(${sz.x.toFixed(3)},${sz.y.toFixed(3)},${sz.z.toFixed(3)})`; };
      for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
        if (items[i].o.parent === items[j].o || items[j].o.parent === items[i].o) continue;
        const a = items[i].b, b = items[j].b;
        const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x), oy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y), oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
        if (ox > 0.003 && oy > 0.003 && oz > 0.003) bad.push(d(items[i]) + ' | ' + d(items[j]) + ' | 重叠毫米 ' + [ox, oy, oz].map(v => Math.round(v * 1000)).join('/'));
      }
      return { n: items.length, bad };
    };
    const each = fn => [cab, stairG].forEach(g => g.traverse(o => { if (o.userData && o.userData.kind) fn(o.userData); }));
    const closed = pass(); let moving = 0;
    each(u => { moving++; if (u.kind === 'door') u.piv.rotation.y = u.ang; else u.piv.position.z = u.pz + 0.36; });
    const open = pass();
    each(u => { if (u.kind === 'door') u.piv.rotation.y = state.open[u.key] ? u.ang : 0; else u.piv.position.z = u.pz + (state.open[u.key] ? 0.36 : 0); });
    return { parts: closed.n, moving, closed: closed.bad, open: open.bad };
  }
  window.APP = { defaultFinish: DEF_FINISH, audit, setFX, fx: () => ({ on: fxOn, ssao, bloom, composer }), hold: false, frames: () => fpsN, tween, flyTo, openKey, closeAll, resetLayout, applyDrag, toggleBom, scr, buildCab, inIntro: () => !!intro, flyShot, vertical: VERTICAL, viewport: () => ({width:viewW,height:viewH}), K: { ROOM, D, CABW, HERO, HERO_T, ADJ, ADJ_T }, state, setMode, setFinish, setCore, startIntro, endIntro, openAI, toggleUI, buildCSV, cab, stairG, featG, setCine, startDemo, stopDemo, advance: sec => { for (let t = 0; t < sec - 1e-9;) { const dt = Math.min(0.05, sec - t); step(dt); t += dt; } draw(); }, camera, controls, renderer, scene, calc };
  boot();
})();
