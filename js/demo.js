/* 一张板的真相 · 自动演示：字幕、英文解说、配乐、镜头路线。
   解说词和时间点全部读 narration.json；镜头和动作挂在每句的 id 上。 */
(function () {
  'use strict';
  const A = window.APP, $ = s => document.querySelector(s), body = document.body, V3 = THREE.Vector3, K = A.K;
  const D = { running: false, silent: false, audioEvents: [] };
  let N = null, tws = [], utter = [], voice = null, mp3 = null, token = 0;
  const DCLS = ['demo', 'd-dock', 'd-bom', 'd-bomzoom', 'd-chips', 'd-ask', 'd-cursor', 'outro'];

  /* ---------- 时间线 ---------- */
  const at = (t, fn) => tws.push(A.tween(0.01, () => { }, { delay: Math.max(0, t), done: fn }));
  const run = (t, dur, fn, ease) => tws.push(A.tween(dur, fn, { delay: Math.max(0, t), ease: ease || (x => x) }));
  const T = id => { const s = N.segments.find(s => s.id === id); return s ? s.t : 0; };

  /* ---------- 字幕 ---------- */
  const sub = $('#sub'), subZh = $('#subzh'), subEn = $('#suben');
  function showSub(s) { subZh.textContent = s.zh; subEn.textContent = N.showEnglish ? s.en : ''; sub.classList.add('on'); sub.dataset.id = s.id; }
  function hideSub(id) { if (!id || sub.dataset.id === id) sub.classList.remove('on'); }
  function toast(msg) { subZh.textContent = msg; subEn.textContent = ''; sub.classList.add('on'); sub.dataset.id = 'toast'; setTimeout(() => hideSub('toast'), 6000); }

  /* ---------- 英文解说：有 narration_en.mp3 就播文件，否则用浏览器自带的语音 ---------- */
  const synth = window.speechSynthesis;
  function pickVoice() {
    if (!synth) return null;
    let vs = synth.getVoices().filter(v => /^en[-_]/i.test(v.lang) || /^en$/i.test(v.lang));
    if (!navigator.onLine && vs.some(v => v.localService)) vs = vs.filter(v => v.localService);
    const pref = (N && N.voice && N.voice.prefer) || [];
    for (const p of pref) { const v = vs.find(v => v.name.toLowerCase().includes(p.toLowerCase())); if (v) return v; }
    return vs.find(v => /\bmale\b/i.test(v.name)) || vs.find(v => /en-US/i.test(v.lang)) || vs[0] || null;
  }
  if (synth) { synth.getVoices(); synth.addEventListener && synth.addEventListener('voiceschanged', () => { voice = pickVoice(); }); }
  function speak(s) {
    if (D.silent || !synth || !s.en) return;
    // Short scripts normally finish inside their slot. Never build up a drifting speech queue.
    if (utter.length) { D.audioEvents.push({id:s.id,event:'previous-slot-overrun'}); synth.cancel(); utter=[]; }
    const u = new SpeechSynthesisUtterance(s.en);
    let started=0;
    voice = voice || pickVoice(); if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : 'en-US'; u.rate = (N.voice && N.voice.rate) || 0.92; u.pitch = 1; u.volume = 1;
    u.onstart = () => { started=performance.now(); duck(true); D.audioEvents.push({id:s.id,event:'start',voice:voice&&voice.name,local:voice&&voice.localService}); };
    const complete = event => { utter = utter.filter(x => x !== u); if (!utter.length) duck(false); D.audioEvents.push({id:s.id,event,duration:started?(performance.now()-started)/1000:0}); };
    u.onend = () => complete('end'); u.onerror = e => complete('error:'+e.error);
    utter.push(u); synth.speak(u);
  }
  const exists = url => fetch(url, { method: 'HEAD', cache: 'no-store' }).then(r => r.ok, () => false);

  /* ---------- 配乐：Web Audio 现场合成（暖色铺底 + 稀疏钢琴 + 混响）；有 bgm.mp3 就用文件 ---------- */
  let ctx = null, master = null, musicTimer = null, bgmEl = null, bgmNode = null, nextBar = 0, bar = 0, live = [];
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  // 四个和弦一循环，每个和弦 6 秒：Fmaj9 → Am7 → Dm9 → Gsus
  const CH = [
    { pad: [41, 48, 57, 64], mel: [72, 69, 76, 67, 79] },
    { pad: [45, 52, 55, 60], mel: [72, 76, 67, 74, 79] },
    { pad: [38, 50, 53, 60], mel: [69, 77, 72, 76, 65] },
    { pad: [43, 50, 57, 62], mel: [74, 69, 71, 79, 67] }
  ];
  const BAR = 6;
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  function impulse(sec) {
    const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c); let lp = 0;
      for (let i = 0; i < n; i++) { const w = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); lp += (w - lp) * 0.35; d[i] = lp; }
    }
    return buf;
  }
  let dry = null, wet = null;
  function padNote(m, t0) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 820; f.Q.value = 0.4;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.05, t0 + 2.6); g.gain.setValueAtTime(0.05, t0 + BAR - 0.4); g.gain.linearRampToValueAtTime(0, t0 + BAR + 2.8);
    [[0, 'sine'], [5, 'triangle'], [-6, 'sine']].forEach(([det, type]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = hz(m); o.detune.value = det;
      o.connect(f); o.start(t0); o.stop(t0 + BAR + 3); live.push(o);
    });
    f.connect(g); g.connect(dry); g.connect(wet);
  }
  function pianoNote(m, t0, vel) {
    const g = ctx.createGain(), f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
    const dec = 3.6;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vel, t0 + 0.006); g.gain.exponentialRampToValueAtTime(vel * 0.32, t0 + 0.35); g.gain.exponentialRampToValueAtTime(0.0006, t0 + dec);
    [[1, 1], [2, 0.3], [3, 0.1], [4.02, 0.04]].forEach(([h, a]) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(m) * h; og.gain.value = a;
      o.connect(og); og.connect(f); o.start(t0); o.stop(t0 + dec + 0.1); live.push(o);
    });
    f.connect(g); const d = ctx.createGain(); d.gain.value = 0.55; g.connect(d); d.connect(dry); g.connect(wet);
  }
  function schedule() {
    if (!ctx) return;
    while (nextBar < ctx.currentTime + 1.5) {
      const c = CH[bar % 4], t0 = nextBar;
      c.pad.forEach(m => padNote(m, t0));
      pianoNote(c.pad[0] + 12, t0 + 0.02, 0.1);
      // 每小节 3—4 个钢琴音，落在 1.5 秒的格子上，偶尔空一拍
      [0.75, 2.25, 3.75, 5.0].forEach((off, i) => { if (rnd() < (i === 3 ? 0.45 : 0.8)) pianoNote(c.mel[Math.floor(rnd() * c.mel.length)], t0 + off + (rnd() - 0.5) * 0.04, 0.07 + rnd() * 0.05); });
      nextBar += BAR; bar++;
    }
    if (live.length > 600) live = live.slice(-400);
  }
  const vol = () => (N && N.music && N.music.volume) || 0.5;
  async function startMusic(hasFile) {
    if (D.silent) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = ctx || new AC(); if (ctx.state === 'suspended') ctx.resume();
    master = ctx.createGain(); master.gain.value = 0.0001; master.connect(ctx.destination);
    master.gain.setTargetAtTime(vol(), ctx.currentTime, 1.2);
    if (hasFile) {
      bgmEl = bgmEl || new Audio('bgm.mp3'); bgmEl.loop = true; bgmEl.currentTime = 0;
      if (!bgmNode) bgmNode = ctx.createMediaElementSource(bgmEl);
      bgmNode.connect(master); bgmEl.play().catch(() => { });
      return;
    }
    dry = ctx.createGain(); dry.gain.value = 0.8; dry.connect(master);
    const conv = ctx.createConvolver(); conv.buffer = impulse(3.4);
    wet = ctx.createGain(); wet.gain.value = 0.9; wet.connect(conv); conv.connect(master);
    seed = 7; bar = 0; nextBar = ctx.currentTime + 0.15;
    schedule(); musicTimer = setInterval(schedule, 250);
  }
  function stopMusic() {
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (!ctx || !master) return;
    const m = master, t = ctx.currentTime; master = null;
    m.gain.cancelScheduledValues(t); m.gain.setTargetAtTime(0.0001, t, 0.5);
    const os = live; live = [];
    setTimeout(() => { os.forEach(o => { try { o.stop(); } catch (e) { } }); if (bgmEl) bgmEl.pause(); if (bgmNode) { try { bgmNode.disconnect(); } catch (e) { } } try { m.disconnect(); } catch (e) { } }, 2200);
  }
  function duck(on) {
    if (!ctx || !master) return;
    const d = (N && N.music && N.music.duck) || 0.36;
    master.gain.setTargetAtTime(vol() * (on ? d : 1), ctx.currentTime, on ? 0.18 : 0.6);
  }

  /* ---------- 小道具：假光标、提问框、材料单高亮 ---------- */
  const cur = $('#cursor'), wp = new V3();
  function cursorAt(x, y, z, press) { wp.set(x, y, z); const s = A.scr(wp); cur.style.transform = `translate(${s.x}px,${s.y}px)`; cur.classList.toggle('press', !!press); }
  function hl(idx) { document.querySelectorAll('#bombody > *').forEach((el, i) => el.classList.toggle('hl', idx.includes(i))); }
  const bomOpen = on => { if ($('#bom').classList.contains('shut') === on) A.toggleBom(); };
  const divX = i => { let x = K.ROOM.x0; for (let k = 0; k <= i; k++) x += A.state.modules[k].w; return x; };
  function dragDiv(t0, dur, i, to) {
    let from = 0;
    at(t0 - 0.7, () => { from = divX(i); body.classList.add('d-cursor'); cursorAt(from, 1.15, K.D + 0.06, false); });
    at(t0 - 0.15, () => cursorAt(from, 1.15, K.D + 0.06, true));
    run(t0, dur, k => { const x = from + (to - from) * k; A.applyDrag({ h: 'div', i }, x, 0); cursorAt(x, 1.15, K.D + 0.06, true); }, x => x * x * (3 - 2 * x));
    at(t0 + dur + 0.25, () => cursorAt(to, 1.15, K.D + 0.06, false));
  }
  function dragTop(t0, dur, to) {
    let from = 0; const x = K.ROOM.x0 + K.CABW / 2;
    at(t0 - 0.7, () => { from = A.state.H; body.classList.add('d-cursor'); cursorAt(x, from, K.D + 0.06, false); });
    at(t0 - 0.15, () => cursorAt(x, from, K.D + 0.06, true));
    run(t0, dur, k => { const y = from + (to - from) * k; A.applyDrag({ h: 'top' }, 0, y); cursorAt(x, y, K.D + 0.06, true); }, x => x * x * (3 - 2 * x));
    at(t0 + dur + 0.25, () => cursorAt(x, to, K.D + 0.06, false));
  }

  /* 换花色这一段用 config.json 的 demo.finishSequence；不存在的花色跳过，不够两种就取花色表的前 6 种 */
  function demoFinishes() {
    const ids = TEX.finishes.map(f => f.id), cfg = (window.YZB_CONFIG && window.YZB_CONFIG.demo) || {};
    let seq = (Array.isArray(cfg.finishSequence) ? cfg.finishSequence : []).filter(id => ids.includes(id)).slice(0, 6);
    if (seq.length < 2) seq = ids.filter(id => id !== A.defaultFinish).slice(0, 5).concat(A.defaultFinish);
    return seq;
  }

  /* ---------- 路线 ---------- */
  const OPEN1 = ['0-a0', '1-u0', '1-u1', '1-l0', '1-l1', '2-u0', '2-u1', '2-d0', '2-d1'], OPEN2 = ['s-0', 's-1', 's-2'];
  function timeline() {
    D.elapsed=0;
    run(0,N.end||120,k=>{D.elapsed=k*(N.end||120);});
    const cls = (t, add, rm) => at(t, () => { (add || []).forEach(c => body.classList.add(c)); (rm || []).forEach(c => body.classList.remove(c)); });
    // 字幕和解说
    N.segments.forEach(s => {
      at(s.t, () => { if (s.sub !== false) showSub(s); if (mp3) duck(true); else speak(s); });
      at(s.t + s.dur, () => { hideSub(s.id); if (mp3) duck(false); });
    });
    // 1 开场（main.js 自带，10.5 秒）
    A.startIntro();
    // 2 换花色
    let t = T('finish');
    cls(t + 0.1, ['d-dock']);
    demoFinishes().forEach((f, i) => at(t + 0.4 + i * 1.3, () => A.setFinish(f)));
    // 3 开门、推近、楼梯下柜
    t = T('doors');
    cls(t - 0.6, [], ['d-dock']);
    at(t - 0.5, () => A.flyShot("doors", new V3(-1.2, 1.5, 4.9), new V3(-1.55, 1.15, 0.3), 1.6));
    OPEN1.forEach((k, i) => at(t + 0.6 + i * 0.32, () => A.openKey(k, true)));
    t = T('inside');
    at(t - 0.4, () => A.flyShot("inside", new V3(-1.75, 1.45, 3.25), new V3(-2.15, 1.15, 0.3), 2.4));
    t = T('stairs');
    at(t - 0.9, () => A.flyShot("stairs", new V3(0.35, 1.25, 3.9), new V3(2.35, 0.75, 2.35), 1.7));
    OPEN1.forEach((k, i) => at(t - 0.8 + i * 0.08, () => A.openKey(k, false)));
    OPEN2.forEach((k, i) => at(t + 0.5 + i * 0.4, () => A.openKey(k, true)));
    OPEN2.forEach((k, i) => at(t + 3.9 + i * 0.12, () => A.openKey(k, false)));
    // 4 透视
    t = T('xray1');
    at(t - 0.6, () => { if (A.state.mode !== 'xray') A.setMode('xray'); });
    cls(t + 1.5, ['d-chips']);
    at(T('ply') - 0.2, () => A.setCore('ply')); at(T('eco') - 0.2, () => A.setCore('eco')); at(T('mdf') - 0.2, () => A.setCore('mdf'));
    t = T('adjust1');
    at(t - 1.6, () => A.setCore('pb'));
    cls(t - 1.2, [], ['d-chips']);
    // 5 调尺寸，材料单联动
    at(t - 0.9, () => { A.setMode('adjust'); bomOpen(true); });
    cls(t - 0.3, ['d-bom', 'd-bomzoom']);
    dragDiv(t + 1.2, 1.9, 2, K.ROOM.x0 + 0.6 + 0.7 + 1.2);
    dragDiv(t + 4.1, 1.6, 0, K.ROOM.x0 + 0.45);
    dragTop(t + 7.0, 1.8, 2.15);
    dragTop(t + 9.5, 1.8, 2.5);
    // 6 材料单逐行讲
    t = T('bom1');
    cls(t - 1.1, [], ['d-cursor']);
    at(t - 0.9, () => { if (A.state.mode !== 'view') A.setMode(A.state.mode); });
    at(t + 0.4, () => hl([0, 1, 2, 3])); at(t + 3.1, () => hl([4])); at(t + 4.9, () => hl([5, 6]));
    at(T('bom2') + 0.1, () => hl([7, 8]));
    // 7 讲给 AI 听
    t = T('ai1');
    at(t - 0.6, () => { hl([]); });
    cls(t - 0.5, [], ['d-bom', 'd-bomzoom']);
    at(t - 0.1, () => { bomOpen(false); $('#askq').textContent = ''; $('#asks').textContent = ''; body.classList.add('d-ask'); });
    const q = N.ask || '';
    run(t + 0.7, 3.0, k => { $('#askq').textContent = q.slice(0, Math.round(k * q.length)); });
    at(t + 4.0, () => { $('#asks').textContent = '正在整理这套方案的产品事实…'; });
    t = T('ai2');
    at(t - 0.2, () => { body.classList.remove('d-ask'); A.openAI(q); });
    // 8 结尾
    t = T('outro');
    at(t - 0.8, () => body.classList.remove('ai-open'));
    at(t - 0.5, () => A.flyShot("outro", new V3(-2.1, 2.05, 9.6), new V3(0.55, 1.1, 0.8), (N.end || 120) - t));
    cls(t + 0.2, ['outro']);
    at((N.end || 120) + 0.3, () => D.stop(true));
  }

  D.start = async function () {
    if (D.running) return;
    const my = ++token;
    D.running = true;
    document.querySelectorAll('#tools button[data-act=demo]').forEach(b => b.classList.add('on'));
    try { N = await (await fetch('narration.json?_=' + Date.now(), { cache: 'no-store' })).json(); }
    catch (e) { D.running = false; document.querySelectorAll('#tools button[data-act=demo]').forEach(b => b.classList.remove('on')); toast('自动演示要读 narration.json：请用 http://localhost:8765 打开（见 README）'); return; }
    const [hasVo, hasBgm] = D.silent ? [false, false] : await Promise.all([exists('narration_en.mp3'), exists('bgm.mp3')]);
    if (my !== token || !D.running) return;
    // 复位到初始状态
    if (A.inIntro()) A.endIntro();
    body.classList.remove('ai-open'); body.classList.add('noui', 'demo');
    A.closeAll(); A.resetLayout(); bomOpen(false); hl([]);
    if (A.state.finish !== A.defaultFinish) A.setFinish(A.defaultFinish);
    if (A.state.core !== 'pb') A.setCore('pb');
    voice = pickVoice(); mp3 = null; D.audioEvents = [];
    if (hasVo) { mp3 = new Audio('narration_en.mp3'); mp3.play().catch(() => { }); }
    startMusic(hasBgm);
    timeline();
  };
  D.stop = function (finished) {
    if (!D.running) return;
    token++; D.running = false;
    tws.forEach(t => { t.dead = true; }); tws = [];
    if (synth) synth.cancel(); utter = [];
    if (mp3) { mp3.pause(); mp3 = null; }
    stopMusic();
    sub.classList.remove('on'); hl([]);
    DCLS.forEach(c => body.classList.remove(c)); body.classList.remove('noui');
    document.querySelectorAll('#tools button[data-act=demo]').forEach(b => b.classList.remove('on'));
    if (finished) {
      body.classList.remove('ai-open'); A.closeAll(); A.resetLayout(); bomOpen(false);
      if (A.state.mode !== 'view') A.setMode(A.state.mode); else A.flyTo(K.HERO, K.HERO_T, 1.6);
    }
  };
  // M：单独开关配乐（不在演示里也能听）
  window.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'm' || D.running) return;
    if (master) stopMusic(); else fetch('narration.json', { cache: 'no-store' }).then(r => r.json()).then(j => { N = N || j; }).catch(() => { }).then(() => exists('bgm.mp3')).then(startMusic);
  });
  D.previewSpeech = async id => {N=await(await fetch('narration.json?_='+Date.now(),{cache:'no-store'})).json();D.silent=false;voice=pickVoice();D.audioEvents=[];speak(N.segments.find(s=>s.id===id));};
  D.audioStatus = () => ({voice:voice?{name:voice.name,local:voice.localService}:null,events:D.audioEvents.slice(),musicVolume:vol(),duck:(N&&N.music&&N.music.duck)||0.28});
  window.DEMO = D;
})();
