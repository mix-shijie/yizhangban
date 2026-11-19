/* 一张板的真相 · 读取 config.json，预载自定义花色图片，再按顺序加载 tex.js、main.js、demo.js。
   不向任何外部地址发请求，不收集任何数据。直接双击 index.html（file://）时读不到 config.json，会用下面的默认值。 */
(function () {
  'use strict';
  const DEFAULT = {
    brand: { title: '一张板的真相', subtitle: 'MIX饰界智变', productBrand: '示例品牌 A', productName: '地下室整墙储物柜 · 定制方案（示例）', contact: '' },
    defaultFinish: 'oak',
    finishes: null, // null = 使用 tex.js 里的 11 种内置花色
    cabinet: { widthsMm: [600, 700, 1000, 700, 600], heightMm: 2400, minModuleWidthMm: 300, maxModuleWidthMm: 1200, minHeightMm: 1900, maxHeightMm: 2500 },
    pricing: {
      currency: '¥', wasteFactor18: 1.18, wasteFactor9: 1.1, edgeFactor: 1.1, shelfPinPrice: 0.5,
      coreFactor: { pb: 1, mdf: 0.96, ply: 1.25, eco: 1.2 },
      tiers: [
        { name: '经济', p18: [150, 200], p9: [45, 60], edge: [3, 4], hinge: [8, 12], slide: [35, 55], handle: [10, 16], led: [60, 90] },
        { name: '中端', p18: [260, 360], p9: [70, 95], edge: [5, 8], hinge: [18, 28], slide: [80, 130], handle: [25, 42], led: [120, 190] },
        { name: '高端', p18: [460, 680], p9: [110, 160], edge: [9, 14], hinge: [45, 80], slide: [220, 380], handle: [60, 120], led: [260, 400] }
      ]
    },
    demo: { finishSequence: ['oakc', 'walnut', 'cherry', 'marble', 'sage', 'oak'] }
  };
  const CAB_TOTAL_MM = 3600; // 后墙整墙柜总宽固定（房间布局按它摆放）
  const IMG_W = 1024, IMG_H = 2048; // 自定义花色图片统一缩放到 1:2（代表一张 1220 × 2440 mm 的板）

  const warn = m => console.warn('[config] ' + m);
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const pick = (u, d) => (isObj(u) ? Object.assign({}, d, u) : Object.assign({}, d));

  function merge(user) {
    const c = {};
    c.brand = pick(user.brand, DEFAULT.brand);
    c.defaultFinish = typeof user.defaultFinish === 'string' ? user.defaultFinish : DEFAULT.defaultFinish;
    c.finishes = Array.isArray(user.finishes) && user.finishes.length ? user.finishes.filter(isObj) : DEFAULT.finishes;
    c.cabinet = pick(user.cabinet, DEFAULT.cabinet);
    c.pricing = pick(user.pricing, DEFAULT.pricing);
    c.pricing.coreFactor = pick(c.pricing.coreFactor, DEFAULT.pricing.coreFactor);
    if (!Array.isArray(c.pricing.tiers) || !c.pricing.tiers.length) c.pricing.tiers = DEFAULT.pricing.tiers;
    c.demo = pick(user.demo, DEFAULT.demo);

    // 尺寸校验：5 个模块，总宽 3600 mm，单柜和高度都在上下限以内；不合格就退回默认值
    const k = c.cabinet, d = DEFAULT.cabinet, w = k.widthsMm;
    const num = v => typeof v === 'number' && isFinite(v);
    ['minModuleWidthMm', 'maxModuleWidthMm', 'minHeightMm', 'maxHeightMm', 'heightMm'].forEach(n => { if (!num(k[n])) { warn(`cabinet.${n} 不是数字，用默认值`); k[n] = d[n]; } });
    if (k.minModuleWidthMm < 200 || k.maxModuleWidthMm > 1600 || k.minModuleWidthMm >= k.maxModuleWidthMm) { warn('单柜宽度上下限不合理，用默认值'); k.minModuleWidthMm = d.minModuleWidthMm; k.maxModuleWidthMm = d.maxModuleWidthMm; }
    if (k.minHeightMm < 1600 || k.maxHeightMm > 2550 || k.minHeightMm >= k.maxHeightMm) { warn('高度上下限不合理（房间层高 2600 mm），用默认值'); k.minHeightMm = d.minHeightMm; k.maxHeightMm = d.maxHeightMm; }
    const okW = Array.isArray(w) && w.length === 5 && w.every(num) && Math.abs(w.reduce((a, b) => a + b, 0) - CAB_TOTAL_MM) < 1 && w.every(x => x >= k.minModuleWidthMm && x <= k.maxModuleWidthMm);
    if (!okW) { warn(`cabinet.widthsMm 必须是 5 个数字、合计 ${CAB_TOTAL_MM}、每个在上下限以内，用默认值`); k.widthsMm = d.widthsMm.slice(); }
    k.heightMm = Math.min(k.maxHeightMm, Math.max(k.minHeightMm, k.heightMm));
    return c;
  }

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        // 居中裁成 1:2 再缩放，竖向代表板长方向
        const cv = document.createElement('canvas'); cv.width = IMG_W; cv.height = IMG_H;
        const r = img.naturalWidth / img.naturalHeight;
        let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
        if (r > 0.5) { sw = sh * 0.5; sx = (img.naturalWidth - sw) / 2; } else { sh = sw * 2; sy = (img.naturalHeight - sh) / 2; }
        cv.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, IMG_W, IMG_H);
        resolve(cv);
      };
      img.onerror = () => { warn('花色图片读取失败：' + src); resolve(null); };
      img.src = src;
    });
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('无法加载 ' + src));
      document.body.appendChild(s);
    });
  }

  function applyBrand(b) {
    const set = (sel, text) => document.querySelectorAll(sel).forEach(el => { el.textContent = text; });
    document.title = b.subtitle ? `${b.title} · ${b.subtitle}` : b.title;
    set('#brand h1, #title h1', b.title);
    set('#brand p.sub, #title p', b.subtitle);
    const ct = document.getElementById('contact');
    if (ct) { ct.textContent = b.contact || ''; ct.hidden = !b.contact; }
  }

  async function start() {
    let user = {};
    try {
      const r = await fetch('config.json', { cache: 'no-store' });
      if (r.ok) user = await r.json(); else warn('没有找到 config.json，用默认值');
    } catch (e) { warn('读不到 config.json（直接双击打开时会这样，请用本地服务打开），用默认值'); }
    const cfg = merge(isObj(user) ? user : {});
    const images = {};
    if (cfg.finishes) {
      await Promise.all(cfg.finishes.filter(f => typeof f.image === 'string' && f.id).map(async f => { const cv = await loadImage(f.image); if (cv) images[f.id] = cv; }));
    }
    window.YZB_CONFIG = cfg; window.YZB_IMAGES = images;
    applyBrand(cfg.brand);
    for (const src of ['js/tex.js', 'js/main.js', 'js/demo.js']) await loadScript(src);
  }
  start().catch(e => { console.error(e); const l = document.getElementById('load'); if (l) l.textContent = '加载失败，请用本地服务打开（见 README）'; });
})();
