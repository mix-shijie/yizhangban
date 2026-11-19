/* 一张板的真相 · 程序化纹理（花色 + 基材截面），全部用 canvas 现场生成，不依赖外部图片 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;

  function hash(ix, iy, s) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(s, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // 周期性 value noise，保证贴图可无缝平铺
  function vn(x, y, px, py, s) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const xa = ((x0 % px) + px) % px, xb = (xa + 1) % px, ya = ((y0 % py) + py) % py, yb = (ya + 1) % py;
    const a = hash(xa, ya, s), b = hash(xb, ya, s), c = hash(xa, yb, s), d = hash(xb, yb, s);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(u, v, px, py, oct, s) {
    let sum = 0, a = 0.5, n = 0;
    for (let o = 0; o < oct; o++) { sum += a * vn(u * px, v * py, px, py, s + o * 31); n += a; a *= 0.5; px *= 2; py *= 2; }
    return sum / n;
  }
  const hex = h => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

  /* ---------- 饰面 ---------- */
  const sm = k => { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
  // 低频噪声先算在粗网格上，再双线性取样（大贴图省时间）
  function lowField(W, H, q, fn) {
    const lw = W / q, lh = H / q, F = new Float32Array(lw * lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) F[y * lw + x] = fn(x / lw, y / lh);
    return (x, y) => {
      const fx = x / q, fy = y / q, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const xa = x0 % lw, xb = (x0 + 1) % lw, ya = (y0 % lh) * lw, yb = ((y0 + 1) % lh) * lw;
      const a = F[ya + xa], b = F[ya + xb], c = F[yb + xa], e = F[yb + xb];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + e) * tx * ty;
    };
  }
  /* 山纹（弦切）：把板面看成切过原木年轮的平面。
     年轮到髓心的距离 f = sqrt(X² + Z(v)²)，X 是离“山尖中线”的横向距离，Z 是切面离髓心的深度，沿板长缓慢变化。
     中线附近是一层层的拱形山纹，越往两侧越接近直纹。
     板面横向由几幅木皮拼成（leaves: [相对宽度, 山尖中线在这一幅里的位置 0..1]）：
     中线在幅内 = 整座山（山纹）；中线压在幅边或幅外 = 只露半座山或接近直纹（半山纹）。 */
  function crownSetup(o, W, H) {
    const cr = o.crown, r = rng(o.seed * 7 + 3), leaves = [], idx = new Uint8Array(W), X0 = new Float32Array(W);
    let tot = 0, acc = 0; cr.leaves.forEach(l => { tot += l[0]; });
    cr.leaves.forEach((l, k) => {
      const u0 = acc / tot, u1 = (acc + l[0]) / tot, cu = u0 + (u1 - u0) * l[1]; acc += l[0];
      for (let x = Math.round(u0 * W); x < Math.round(u1 * W); x++) { idx[x] = k; X0[x] = (x / W - cu) * 1.22; }
      const ph = r(), zs = 0.85 + r() * 0.3, up = 0.64 + r() * 0.12, tone = 1 + (r() - 0.5) * 0.045;
      const Z = new Float32Array(H), Wd = new Float32Array(H);
      for (let y = 0; y < H; y++) {
        const v = y / H, p = (v + ph) % 1;
        const P = p < up ? p / up : 1 - sm((p - up) / (1 - up));
        Z[y] = (cr.z0 + cr.za * P) * zs + (vn(v * 9, k * 3 + 1, 9, 97, o.seed + 13) - 0.5) * 0.014;
        Wd[y] = (vn(v * 5, k * 3 + 2, 5, 97, o.seed + 17) - 0.5) * cr.wander;
      }
      leaves.push({ Z, Wd, tone });
    });
    return { leaves, idx, X0, s1: r() * 50, s2: r() * 50 };
  }
  function wood(o) {
    const W = o.W || 1024, H = W * 2, c = mk(W, H), g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data;
    const A = hex(o.a), B = hex(o.b), cr = o.crown, cs = cr ? crownSetup(o, W, H) : null;
    const warpF = lowField(W, H, 8, (u, v) => fbm(u, v, 3, 2, 3, o.seed));
    const toneF = lowField(W, H, 8, (u, v) => fbm(u, v, 2, 1, 2, o.seed + 77));
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const warp = warpF(x, y);
        const fiber = vn(u * 200, v * 16, 200, 16, o.seed + 5);
        const fine = vn(u * 512, v * 64, 512, 64, o.seed + 9) * 0.6 + vn(u * 1024, v * 160, 1024, 160, o.seed + 10) * 0.4;
        const pore = vn(u * 340, v * 28, 340, 28, o.seed + 3);
        let t, lt = 1;
        if (cs) {
          const L = cs.leaves[cs.idx[x]], X = cs.X0[x] + L.Wd[y], Z = L.Z[y];
          let f = Math.sqrt(X * X + Z * Z);
          f += (warp - 0.5) * 0.016 * o.warp + (vn(u * 260, v * 22, 260, 22, o.seed + 21) - 0.5) * 0.0032;
          lt = L.tone;
          const ph = f / cr.ring + 0.3 * Math.sin(f * 60 + cs.s1) + 0.22 * Math.sin(f * 147 + cs.s2);
          const s = ph - Math.floor(ph);
          // 年轮一侧边界清楚、另一侧慢慢淡出（早材到晚材）
          const ring = s < 0.07 ? s / 0.07 : Math.pow(1 - (s - 0.07) / 0.93, 1.9);
          t = ring * 0.56 + fiber * 0.26 + fine * 0.18;
          if (pore > 0.7) t += (pore - 0.7) * 2.4 * o.pore * (0.35 + ring);
        } else {
          const phase = o.rings * u + warp * o.warp + 0.27 * Math.sin(u * 31 + Math.sin(v * TAU) * 0.6);
          const ring = Math.pow(0.5 + 0.5 * Math.sin(TAU * phase), 2.8);
          t = ring * 0.32 + fiber * 0.44 + fine * 0.24;
          if (pore > 0.74) t += (pore - 0.74) * 2.2 * o.pore;
        }
        t = Math.min(1, Math.max(0, t));
        const tone = (0.93 + 0.14 * toneF(x, y)) * lt;
        const i = (y * W + x) * 4;
        d[i] = (A[0] + (B[0] - A[0]) * t) * tone;
        d[i + 1] = (A[1] + (B[1] - A[1]) * t) * tone;
        d[i + 2] = (A[2] + (B[2] - A[2]) * t) * tone;
        d[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    return c;
  }
  function stone(o) {
    const W = 512, H = 1024, c = mk(W, H), g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data;
    const A = hex(o.a), B = hex(o.b), V = hex(o.v);
    for (let y = 0; y < H; y++) {
      const v = y / H;
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const n = fbm(u, v, 3, 6, 5, o.seed), n2 = fbm(u, v, 5, 10, 4, o.seed + 40);
        const v1 = Math.pow(1 - Math.abs(Math.sin(Math.PI * (2 * u + 3 * v) + n * 7)), o.sharp);
        const v2 = Math.pow(1 - Math.abs(Math.sin(Math.PI * (-3 * u + 2 * v) + n2 * 9)), o.sharp * 1.6) * 0.5;
        const k = Math.min(1, (v1 + v2) * o.vein);
        const grain = 1 + (vn(u * 512, v * 1024, 512, 1024, o.seed + 3) - 0.5) * 0.035;
        const i = (y * W + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const base = A[ch] + (B[ch] - A[ch]) * n;
          d[i + ch] = (base + (V[ch] - base) * k) * grain;
        }
        d[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    return c;
  }
  function solid(o) {
    const W = 256, H = 256, c = mk(W, H), g = c.getContext('2d'), im = g.createImageData(W, H), d = im.data, A = hex(o.a);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const k = 1 + (vn(x, y, 256, 256, o.seed) - 0.5) * 0.035, i = (y * W + x) * 4;
      d[i] = A[0] * k; d[i + 1] = A[1] * k; d[i + 2] = A[2] * k; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return c;
  }

  const builtin = [
    { id: 'oak', name: '暖橡', kind: '直纹', rough: 0.62, sw: '#c2a070', gen: () => wood({ a: 0xc9b394, b: 0xa58b68, rings: 23, warp: 1.3, pore: 1, seed: 11 }) },
    { id: 'oakc', name: '山纹橡', kind: '山纹', rough: 0.62, sw: '#c4a06c', gen: () => wood({ a: 0xcbb398, b: 0xa38a68, warp: 1, pore: 1, seed: 13, crown: { ring: 0.013, z0: 0.045, za: 0.15, wander: 0.03, leaves: [[0.27, 0.5], [0.21, 0.42], [0.29, 0.56], [0.23, 0.5]] } }) },
    { id: 'walnut', name: '胡桃', kind: '直纹', rough: 0.58, sw: '#6a4630', gen: () => wood({ a: 0x82573a, b: 0x553725, rings: 15, warp: 1.7, pore: 0.8, seed: 23 }) },
    { id: 'cherry', name: '樱桃', kind: '半山纹', rough: 0.58, sw: '#b07a52', gen: () => wood({ a: 0xc69468, b: 0x94603e, warp: 1, pore: 0.35, seed: 29, crown: { ring: 0.013, z0: 0.05, za: 0.14, wander: 0.025, leaves: [[0.3, 0.03], [0.2, 1.9], [0.28, 0.96], [0.22, -0.8]] } }) },
    { id: 'ash', name: '白蜡', kind: '直纹', rough: 0.66, sw: '#dccaa6', gen: () => wood({ a: 0xe5d6b8, b: 0xcfbb96, rings: 23, warp: 1.0, pore: 1.2, seed: 37 }) },
    { id: 'smoke', name: '烟熏橡', kind: '直纹', rough: 0.6, sw: '#3d322b', gen: () => wood({ a: 0x554438, b: 0x322822, rings: 19, warp: 1.3, pore: 0.6, seed: 41 }) },
    { id: 'marble', name: '雪域白', kind: '石纹', rough: 0.32, sw: '#e9e5dd', gen: () => stone({ a: 0xefece6, b: 0xe2ded6, v: 0x9c978d, sharp: 16, vein: 0.75, seed: 53 }) },
    { id: 'slate', name: '岩灰', kind: '石纹', rough: 0.42, sw: '#7b7873', gen: () => stone({ a: 0x8a8782, b: 0x6b6863, v: 0xc4c0b8, sharp: 20, vein: 0.5, seed: 67 }) },
    { id: 'cream', name: '奶油白', kind: '纯色', rough: 0.5, sw: '#efe7d8', gen: () => solid({ a: 0xefe7d8, seed: 71 }) },
    { id: 'sage', name: '鼠尾草', kind: '纯色', rough: 0.52, sw: '#98a48b', gen: () => solid({ a: 0x98a48b, seed: 73 }) },
    { id: 'graphite', name: '石墨灰', kind: '纯色', rough: 0.48, sw: '#3b3d40', gen: () => solid({ a: 0x3b3d40, seed: 79 }) }
  ];
  /* config.json 里的 finishes：引用内置花色（builtin）或用户自己的图片（image）。没配就用全部内置花色。 */
  const CFG = window.YZB_CONFIG || {}, IMGS = window.YZB_IMAGES || {};
  let finishes = builtin;
  if (Array.isArray(CFG.finishes) && CFG.finishes.length) {
    const seen = new Set();
    finishes = CFG.finishes.map(c => {
      if (!c || !c.id || seen.has(c.id)) return null;
      const rough = typeof c.rough === 'number' ? c.rough : undefined;
      if (c.image) {
        if (!IMGS[c.id]) return null;
        seen.add(c.id);
        return { id: c.id, name: c.name || c.id, kind: c.kind || '自定义', rough: rough ?? 0.6, sw: c.swatch || '#cccccc', gen: () => IMGS[c.id] };
      }
      const b = builtin.find(f => f.id === (c.builtin || c.id));
      if (!b) { console.warn('[config] 找不到内置花色：' + (c.builtin || c.id)); return null; }
      seen.add(c.id);
      return Object.assign({}, b, { id: c.id, name: c.name || b.name, kind: c.kind || b.kind, rough: rough ?? b.rough });
    }).filter(Boolean);
    if (!finishes.length) finishes = builtin;
  }
  const fcache = {};
  function finishCanvas(id) {
    // 先找当前花色表，再找内置（楼梯踏板、格栅固定用内置暖橡）
    if (!fcache[id]) fcache[id] = (finishes.find(f => f.id === id) || builtin.find(f => f.id === id) || finishes[0]).gen();
    return fcache[id];
  }

  /* ---------- 基材截面 ---------- */
  // 画一批可左右无缝衔接的碎片
  function chips(g, W, r, n, cols, y0, y1, rmin, rmax, flat, anyRot, alpha) {
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = y0 + r() * (y1 - y0), rx = rmin + r() * (rmax - rmin);
      const ry = flat ? Math.max(0.6, rx * flat * (0.6 + r() * 0.8)) : rx;
      const rot = anyRot ? r() * Math.PI : (r() - 0.5) * 0.25;
      g.fillStyle = cols[(r() * cols.length) | 0];
      g.globalAlpha = (alpha || 0.55) + r() * 0.4;
      for (const dx of [-W, 0, W]) { g.beginPath(); g.ellipse(x + dx, y, rx, ry, rot, 0, TAU); g.fill(); }
    }
    g.globalAlpha = 1;
  }
  function streaks(g, W, r, n, y0, y1, col, alpha) {
    g.strokeStyle = col; g.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const y = y0 + r() * (y1 - y0), x = r() * W, len = 40 + r() * 260;
      g.globalAlpha = alpha * (0.4 + r() * 0.6);
      for (const dx of [-W, 0, W]) { g.beginPath(); g.moveTo(x + dx, y); g.lineTo(x + dx + len, y + (r() - 0.5) * 1.5); g.stroke(); }
    }
    g.globalAlpha = 1;
  }
  const EW = 1024, EH = 128;

  function pbEdge() {
    const S = 2, W = EW * S, H = EH * S, c = mk(W, H), g = c.getContext('2d'), r = rng(101);
    g.fillStyle = '#b4925f'; g.fillRect(0, 0, W, H);
    chips(g, W, r, 1500, ['#d2b382', '#a9844e', '#8c6b3d', '#e0c79a', '#6e5230', '#bf9c66'], 24 * S, 104 * S, 5 * S, 22 * S, 0.22);
    chips(g, W, r, 900, ['#c9a874', '#9a7745', '#dcc293'], 24 * S, 104 * S, 2 * S, 7 * S, 0.3);
    chips(g, W, r, 260, ['#3d2c18', '#4a3620'], 26 * S, 102 * S, 1 * S, 3.2 * S, 0.5, false, 0.5);
    for (const [a, b] of [[0, 25 * S], [103 * S, H]]) {
      g.fillStyle = '#a98758'; g.globalAlpha = 0.9; g.fillRect(0, a, W, b - a); g.globalAlpha = 1;
      chips(g, W, r, 5200, ['#c4a373', '#94713f', '#b08d59', '#7d5e36'], a, b, 0.8 * S, 2.4 * S, 0.6);
    }
    return c;
  }
  function pbFace() {
    const c = mk(512, 512), g = c.getContext('2d'), r = rng(103);
    g.fillStyle = '#b89662'; g.fillRect(0, 0, 512, 512);
    chips(g, 512, r, 2600, ['#d2b382', '#a9844e', '#8c6b3d', '#e0c79a', '#bf9c66'], 0, 512, 2, 9, 0.35, true);
    return c;
  }
  function plyEdge(flip) {
    const c = mk(EW, EH), g = c.getContext('2d'), r = rng(flip ? 211 : 207), n = 9, lh = EH / n;
    for (let i = 0; i < n; i++) {
      const long = (i % 2 === 0) !== !!flip, y0 = i * lh, y1 = y0 + lh;
      g.fillStyle = long ? '#dcc296' : '#b9925e'; g.fillRect(0, y0, EW, lh);
      if (long) streaks(g, EW, r, 60, y0 + 1, y1 - 1, '#8a6a40', 0.35);
      else chips(g, EW, r, 500, ['#8e6b3c', '#cfae78', '#74552e'], y0 + 1, y1 - 1, 0.7, 1.8, 0.9, false, 0.4);
    }
    g.fillStyle = '#4f3620';
    for (let i = 1; i < n; i++) g.fillRect(0, i * lh - 1, EW, 2);
    return c;
  }
  function veneerFace(col, line, seed) {
    const c = mk(512, 512), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = col; g.fillRect(0, 0, 512, 512);
    streaks(g, 512, r, 500, 0, 512, line, 0.3);
    return c;
  }
  function blockLayers(g, r) {
    // 上下各两层单板：外层面板 + 内层横纹芯板
    g.fillStyle = '#dcc296'; g.fillRect(0, 0, EW, 9); g.fillRect(0, EH - 9, EW, 9);
    g.fillStyle = '#b58c58'; g.fillRect(0, 9, EW, 11); g.fillRect(0, EH - 20, EW, 11);
    chips(g, EW, r, 500, ['#8e6b3c', '#cfae78'], 10, 19, 0.7, 1.6, 0.9, false, 0.4);
    chips(g, EW, r, 500, ['#8e6b3c', '#cfae78'], EH - 19, EH - 10, 0.7, 1.6, 0.9, false, 0.4);
    g.fillStyle = '#4f3620';
    for (const y of [9, 20, EH - 20, EH - 9]) g.fillRect(0, y - 1, EW, 1.6);
  }
  function blockEnd() {
    const c = mk(EW, EH), g = c.getContext('2d'), r = rng(307);
    const ws = []; let sum = 0;
    while (sum < EW) { const w = 150 + r() * 110; ws.push(w); sum += w; }
    const k = EW / sum; let x = 0;
    const tones = ['#e3cfa3', '#d6bd8c', '#cdb07c', '#e8d6ae', '#dac396'];
    ws.forEach(w0 => {
      const w = w0 * k;
      g.save(); g.beginPath(); g.rect(x, 20, w, EH - 40); g.clip();
      g.fillStyle = tones[(r() * tones.length) | 0]; g.fillRect(x, 20, w, EH - 40);
      const cx = x + r() * w, cy = r() < 0.5 ? -40 - r() * 120 : EH + 40 + r() * 120;
      g.strokeStyle = 'rgba(120,85,45,.38)'; g.lineWidth = 1.2;
      for (let rad = 30; rad < 420; rad += 7 + r() * 6) { g.beginPath(); g.arc(cx, cy, rad, 0, TAU); g.stroke(); }
      g.restore();
      g.fillStyle = '#5a4026'; g.fillRect(x - 1, 20, 2, EH - 40);
      x += w;
    });
    blockLayers(g, r);
    return c;
  }
  function blockLong() {
    const c = mk(EW, EH), g = c.getContext('2d'), r = rng(311);
    g.fillStyle = '#dcc598'; g.fillRect(0, 0, EW, EH);
    streaks(g, EW, r, 260, 20, EH - 20, '#9a7747', 0.4);
    blockLayers(g, r);
    return c;
  }
  function mdfEdge() {
    const c = mk(EW, EH), g = c.getContext('2d'), r = rng(401);
    g.fillStyle = '#a8855c'; g.fillRect(0, 0, EW, EH);
    chips(g, EW, r, 7000, ['#bb986c', '#8f6e48', '#b08c60'], 0, EH, 0.6, 1.5, 0.7, false, 0.22);
    g.fillStyle = 'rgba(86,58,30,.28)'; g.fillRect(0, 0, EW, 14); g.fillRect(0, EH - 14, EW, 14);
    return c;
  }
  function mdfFace() {
    const c = mk(512, 512), g = c.getContext('2d'), r = rng(403);
    g.fillStyle = '#a98862'; g.fillRect(0, 0, 512, 512);
    chips(g, 512, r, 5000, ['#bb986c', '#94734c'], 0, 512, 0.6, 1.5, 0.8, true, 0.2);
    return c;
  }

  const core = {
    pb: { name: '刨花板', desc: '木质刨花施胶热压，表层细、芯层粗的三层结构', end: pbEdge, long: pbEdge, face: pbFace },
    ply: { name: '多层板', desc: '多层单板纵横交错胶合，层数为奇数', end: () => plyEdge(true), long: () => plyEdge(false), face: () => veneerFace('#dcc296', '#8a6a40', 209) },
    eco: { name: '生态板', desc: '实木条拼成芯板，上下再压单板（细木工芯）', end: blockEnd, long: blockLong, face: () => veneerFace('#dcc296', '#8a6a40', 313) },
    mdf: { name: '密度板', desc: '木纤维施胶热压，质地均匀细密', end: mdfEdge, long: mdfEdge, face: mdfFace }
  };
  const ccache = {};
  function coreCanvas(type, which) {
    const k = type + which;
    if (!ccache[k]) ccache[k] = core[type][which]();
    return ccache[k];
  }
  function floorCanvas() {
    // 浅色木地板：8 条板宽，长向错缝
    const c = wood({ a: 0xc9bba5, b: 0xb09d80, rings: 16, warp: 1.2, pore: 0.6, seed: 501 }), g = c.getContext('2d'), r = rng(503);
    const W = c.width, H = c.height, n = 8, pw = W / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,240,215,' + (r() * 0.12).toFixed(3) + ')' : 'rgba(70,45,20,' + (r() * 0.12).toFixed(3) + ')';
      g.fillRect(i * pw, 0, pw, H);
      g.fillStyle = 'rgba(52,34,18,.5)'; g.fillRect(i * pw, 0, 2, H);
      const off = r() * H;
      for (let k = 0; k < 3; k++) g.fillRect(i * pw, (off + k * H / 3) % H, pw, 2.5);
    }
    return c;
  }

  window.TEX = { finishes, builtin, finishCanvas, core, coreCanvas, floorCanvas };
})();
