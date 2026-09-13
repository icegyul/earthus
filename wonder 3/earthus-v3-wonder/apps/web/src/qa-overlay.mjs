// EARTHUS V3 WONDER — 실기기 QA 오버레이 (PHASE 1-D Device Gate). `?qa=1` 일 때만 실린다. 운영 기능 아님.
// PD 지시의 14단계를 실제 터치로 수행하면 자동으로 체크되고, 성능(전송량·요청 수·힙·프레임 안정성)을 기록한다.
// "페이지가 열린다"만으로 PASS 하지 않는다 — 각 단계는 실제 상태 변화로만 체크된다.
const STEPS = [
  ['initial-load', '처음 열림(첫 그림)'], ['rotate', '지구 돌리기(터치 드래그)'], ['pinch', '두 손가락 줌'], ['region', '지역 고르기(톡)'],
  ['unfold', '종이 펼침 → 활성'], ['tap', '캐릭터 톡'], ['longpress', '캐릭터 꾹'], ['special', '캐릭터 특별 동작'],
  ['story', '이야기 카드 열림'], ['card-close', '카드 닫기'], ['return', '지구로 돌아오기'], ['repeat', '두 번 이상 들어갔다 나오기'],
  ['bottom-sheet', '폰 하단 시트(폭 ≤ 640)'], ['reduced', '움직임 줄이기로 진입'],
];

export function installQaOverlay(W, { log = () => {} } = {}) {
  const done = new Map(); const detail = new Map();
  const mark = (id, d) => { if (!done.has(id)) { done.set(id, Date.now()); detail.set(id, d ?? ''); render(); } };
  const startLon = W.camera.lon; let sawEnv = false, sawActive = false, sawStoryOpen = false, sawReduced = false;
  const frames = []; let lastT = performance.now();
  (function sample(t) { const dt = t - lastT; lastT = t; frames.push(dt); if (frames.length > 600) frames.shift(); requestAnimationFrame(sample); })(performance.now());
  const baselineRes = performance.getEntriesByType('resource').length;
  let regionBaseline = null;

  const panel = document.createElement('div');
  panel.id = 'qa'; panel.setAttribute('aria-label', '실기기 QA');
  panel.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;max-width:min(92vw,360px);max-height:46vh;overflow:auto;background:rgba(20,26,40,.92);color:#fff;font:12px/1.5 ui-monospace,Menlo,monospace;border-radius:12px;padding:8px 10px;box-shadow:0 8px 24px rgba(0,0,0,.35)';
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong>QA ${STEPS.length}단계</strong><span><button id="qaCopy" style="font:inherit;padding:2px 8px;border-radius:6px;border:0;background:#f2a541;color:#222">결과 복사</button> <button id="qaMin" style="font:inherit;padding:2px 8px;border-radius:6px;border:0">−</button></span></div><ol id="qaList" style="margin:6px 0 0;padding-left:18px"></ol><pre id="qaPerf" style="margin:6px 0 0;white-space:pre-wrap;opacity:.85"></pre><textarea id="qaOut" hidden style="width:100%;height:80px;font:10px monospace"></textarea>`;
  document.body.appendChild(panel);
  panel.querySelector('#qaMin').addEventListener('click', () => { const l = panel.querySelector('#qaList'); l.hidden = !l.hidden; panel.querySelector('#qaPerf').hidden = l.hidden; });
  panel.querySelector('#qaCopy').addEventListener('click', async () => {
    const text = JSON.stringify(report(), null, 1);
    try { await navigator.clipboard.writeText(text); panel.querySelector('#qaCopy').textContent = '복사됨'; }
    catch { const ta = panel.querySelector('#qaOut'); ta.hidden = false; ta.value = text; ta.select(); }
  });

  function perf() {
    const res = performance.getEntriesByType('resource');
    const kb = rows => Math.round(rows.reduce((a, r) => a + (r.transferSize || r.encodedBodySize || 0), 0) / 1024);
    const initial = res.slice(0, baselineRes), region = regionBaseline != null ? res.slice(regionBaseline) : [];
    const recent = frames.slice(-300); const avg = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
    const gaps = recent.filter(d => d > 100).length;
    return {
      initialTransferKB: kb(initial), initialRequests: initial.length,
      sinceRegionTransferKB: kb(region), sinceRegionRequests: region.length,
      contentRequests: W.requests().total, characterFiles: W.requests().characterFiles, byKind: Object.fromEntries(Object.entries(W.requests().byKind).map(([k, v]) => [k, v.length])),
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null,
      assets: W.assets ? W.assets.status() : null,
      fps: avg ? +(1000 / avg).toFixed(1) : null, frameGapsOver100ms: gaps, frameMaxMs: recent.length ? Math.round(Math.max(...recent)) : null,
      firstFrameMs: W.state.firstFrameMs, marks: W.metrics().marks,
    };
  }
  function report() {
    return {
      device: { ua: navigator.userAgent, dpr: devicePixelRatio, viewport: [innerWidth, innerHeight], touchPoints: navigator.maxTouchPoints, reducedMotionMedia: matchMedia('(prefers-reduced-motion: reduce)').matches, time: new Date().toISOString() },
      steps: STEPS.map(([id, label]) => ({ id, label, pass: done.has(id), detail: detail.get(id) ?? '', at: done.get(id) ?? null })),
      passed: STEPS.filter(([id]) => done.has(id)).length, total: STEPS.length,
      gestures: W.state.gestures, visits: W.state.environments.map(e => [e.id, W.flow.visitsOf(e.id)]),
      perf: perf(),
    };
  }
  function render() {
    const list = panel.querySelector('#qaList');
    list.innerHTML = STEPS.map(([id, label]) => `<li style="opacity:${done.has(id) ? 1 : .55}">${done.has(id) ? '✅' : '▫️'} ${label} <small style="opacity:.75">${detail.get(id) ?? ''}</small></li>`).join('');
    const p = perf();
    panel.querySelector('#qaPerf').textContent = `${done.size}/${STEPS.length} · 첫 그림 ${p.firstFrameMs ?? '–'}ms · 처음 ${p.initialTransferKB}KB/${p.initialRequests}req · 지역 후 ${p.sinceRegionTransferKB}KB/${p.sinceRegionRequests}req · 캐릭터 파일 ${p.characterFiles} · fps ${p.fps ?? '–'} (>100ms 끊김 ${p.frameGapsOver100ms}) · heap ${p.heapMB ?? 'n/a'}MB`;
  }

  setInterval(() => {
    const g = W.state.gestures ?? {};
    if (W.state.firstFrameMs != null) mark('initial-load', `${W.state.firstFrameMs}ms`);
    if (g.touchDrag > 0 || (g.drag > 0 && Math.abs(W.camera.lon - startLon) > 20)) mark('rotate', `drag ${g.drag}`);
    if (g.touchPinch > 0 || g['pinch-in'] + g['pinch-out'] > 0) mark('pinch', `pinch ${g['pinch-in'] + g['pinch-out']}`);
    if (W.flow.state !== 'earth' && !sawEnv) { sawEnv = true; regionBaseline = performance.getEntriesByType('resource').length; mark('region', W.flow.current ?? ''); }
    if (W.flow.state === 'active') { sawActive = true; mark('unfold', `${W.flow.plan?.mode} ${W.flow.plan?.unfoldMs}ms`); if (W.flow.plan?.mode === 'reduced') sawReduced = true; }
    const seq = W.env?.state?.lastSequence;
    if (seq?.kind === 'tap') mark('tap', seq.seq.join('→'));
    if (seq?.kind === 'longPress') mark('longpress', seq.seq.join('→'));
    if (seq && W.env?.state?.profile && seq.seq.includes(W.env.state.profile.special)) mark('special', W.env.state.profile.special);
    if (W.flow.story === 'open') { sawStoryOpen = true; mark('story', W.env?.state?.storyId ?? ''); if (innerWidth <= 640) mark('bottom-sheet', `${innerWidth}px`); }
    if (sawStoryOpen && W.flow.story === 'closed' && W.flow.state === 'active') mark('card-close', '');
    if (sawActive && W.flow.state === 'earth') mark('return', '');
    const visits = W.state.environments.reduce((a, e) => a + W.flow.visitsOf(e.id), 0);
    if (visits >= 2) mark('repeat', `${visits}회`);
    if (sawReduced) mark('reduced', '');
    render();
  }, 500);
  render();
  log('QA 오버레이 켜짐 (?qa=1)');
  return { report };
}
