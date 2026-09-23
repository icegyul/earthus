// EARTHUS — 현장 측정판 (?measure=1) · 지시서 §14 성공 기준을 PD 가 폰으로 직접 잰다
//
// 주소 끝에 ?measure=1 을 붙였을 때만 불러온다(main.js 동적 import). 평소 사용자에게는 한 바이트도 안 간다.
//
// 재는 것
//   과제 5개 — 각 과제의 탭 수·걸린 시간·성공 여부. 가능한 것은 앱의 실제 동작을 보고 자동으로 끝낸다.
//     ① 현상 하나를 골라 지금 상태 보기               자동: 선택 문맥에 현상 이름이 뜨면
//     ② 그 값이 관측인지 예보인지 말하기               사람이 답한다(이해를 재는 과제)
//     ③ "앞으로 어떻게 되나" 찾기                      자동: 예보·예정 탭 / Intelligence NEXT / FOR ME '언제'
//                                                     기준: 3탭 이내
//     ④ 내 장소 감시 등록                              자동: 내 장소가 새로 저장되면
//     ⑤ 쓰나미 계산 버튼 찾기 + 기온은 '왜 없는지' 읽기 자동: 쓰나미 sim-q 와 기온 sim-why 둘 다
//                                                     기준: 쓰나미 버튼까지 4탭 이내
//   성공 기준: 과제 5개 중 4개 이상(80%) · 새 1차 메뉴 0 · 위 탭 기준
//   기기: 첫 탭까지 시간, 60초 안 오류·WebGL 문맥 잃음·탭 죽음(다음에 열 때 판정), 메모리(크롬만),
//         FPS(10초·1분·5분·10분에 5초씩만 — 무한 측정 루프를 돌리지 않는다, 발열 규칙)
//   ⚠️ 발열은 브라우저가 알려주지 않는다 — 10분 뒤 손으로 느낀 것을 사람이 고른다.
//
// ⚠️ 결과는 이 기기에만 남는다(localStorage). 서버로 보내지 않는다 — '결과 복사'로 PD 가 붙여 넣는다.

const RUN_KEY = 'earthus.measure.run.v1';
const RES_KEY = 'earthus.measure.result.v1';
const MYPLACE_KEY = 'earthus.myplace';

const TASKS = [
  { id: 't1', ko: '현상 하나를 골라 지금 상태를 보세요', hint: '아래 [탐색]에서 아무 자료나 고릅니다' },
  { id: 't2', ko: '방금 본 값이 관측인지 예보인지 말할 수 있나요?', hint: '값 옆 배지를 보고 답하세요', ask: true },
  { id: 't3', ko: '"앞으로 어떻게 되나"를 찾으세요', hint: '예보·예정, 또는 태풍의 INTELLIGENCE', maxTaps: 3 },
  { id: 't4', ko: '내 장소를 감시 등록하세요', hint: '[내 지역]에서 위치를 정합니다' },
  { id: 't5', ko: '쓰나미 계산 버튼을 찾고, 기온은 왜 계산이 없는지 읽으세요', hint: '두 가지를 다 하면 끝납니다', maxTaps: 4 },
];

const safeGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const safeSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* 저장 못 해도 측정은 돈다 */ } };
const now = () => Math.round(performance.now());

export function startMeasure() {
  if (document.getElementById('earthus-measure')) return null;
  const t0 = now();                                   // 앱 초기화가 끝난 시점(main.js 가 부른 때)

  // ── 탭 죽음 판정 — 지난번 측정이 60초 안에 소식 없이 끊겼나 ─────────────────────
  let prevCrash = null;
  try {
    const prev = JSON.parse(safeGet(RUN_KEY) || 'null');
    if (prev && !prev.ended && prev.lastAlive - prev.startedAt < 60000) prevCrash = { at: new Date(prev.startedAt).toISOString() };
  } catch (_) { /* 무시 */ }
  const run = { startedAt: Date.now(), lastAlive: Date.now(), ended: false };
  safeSet(RUN_KEY, JSON.stringify(run));
  let aliveTicks = 0;
  const alive = setInterval(() => {                    // 70초만 — 그 뒤엔 멈춘다
    run.lastAlive = Date.now(); safeSet(RUN_KEY, JSON.stringify(run));
    if (++aliveTicks >= 14) { run.ended = true; safeSet(RUN_KEY, JSON.stringify(run)); clearInterval(alive); }
  }, 5000);

  const dev = {
    ua: navigator.userAgent, dpr: window.devicePixelRatio, screen: `${screen.width}×${screen.height}`,
    viewport: `${innerWidth}×${innerHeight}`, memoryGB: navigator.deviceMemory ?? null,
    cores: navigator.hardwareConcurrency ?? null, gpu: null,
  };
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    dev.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  } catch (_) { /* 없으면 null */ }

  const m = {
    appReadyMs: t0, firstTapMs: null, errors60s: 0, contextLost60s: 0, prevCrash,
    fps: {}, memPeakMB: null, heat: null,
    primaryMenu: null, tasks: TASKS.map((t) => ({ id: t.id, state: 'todo', taps: 0, ms: null, answer: null, parts: {} })),
  };
  let cur = 0;
  let taskStart = null;

  // ── 새 1차 메뉴 0 — 하단 바에 Intelligence·Simulation 칸이 생겼나 ─────────────
  const nav = document.getElementById('bottom-nav');
  const navLabels = nav ? [...nav.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean) : [];
  m.primaryMenu = { count: navLabels.length, labels: navLabels,
    newIntelOrSim: navLabels.some((l) => /intelligence|simulation|인텔리전스|시뮬레이션/i.test(l)) };

  // ── 오류·WebGL 문맥 (첫 60초) ─────────────────────────────────────────────
  const in60 = () => now() - t0 < 60000;
  window.addEventListener('error', () => { if (in60()) m.errors60s++; save(); });
  window.addEventListener('unhandledrejection', () => { if (in60()) m.errors60s++; save(); });
  document.getElementById('scene')?.addEventListener('webglcontextlost', () => { if (in60()) m.contextLost60s++; save(); });

  // ── FPS·메모리 — 정해진 네 번만, 5초씩 ─────────────────────────────────────
  const sampleFps = (label) => new Promise((resolve) => {
    let frames = 0; const start = performance.now();
    const step = (t) => { frames++; if (t - start < 5000) requestAnimationFrame(step); else resolve(Math.round(frames * 1000 / (t - start))); };
    requestAnimationFrame(step);
  }).then((fps) => {
    m.fps[label] = fps;
    const mem = performance.memory && performance.memory.usedJSHeapSize;
    if (mem) m.memPeakMB = Math.max(m.memPeakMB || 0, Math.round(mem / 1048576));
    save(); render();
  });
  [['10s', 10000], ['1m', 60000], ['5m', 300000], ['10m', 600000]].forEach(([label, ms]) => setTimeout(() => sampleFps(label), ms));

  // ── 과제 판정 ───────────────────────────────────────────────────────────
  const myPlace0 = safeGet(MYPLACE_KEY);
  const finish = (ok) => {
    const t = m.tasks[cur];
    if (!t || t.state !== 'doing') return;
    t.ms = now() - taskStart;
    const lim = TASKS[cur].maxTaps;
    t.state = ok ? (lim && t.taps > lim ? 'slow' : 'pass') : 'fail';
    cur++;
    if (cur < TASKS.length) { m.tasks[cur].state = 'doing'; taskStart = now(); }
    save(); render();
  };
  const onAppClick = (e) => {
    if (e.target.closest('#earthus-measure')) return;
    const t = m.tasks[cur];
    if (!t || t.state !== 'doing') return;
    // (2026-09-24 정정) 인텔리전스 시트가 한 장이 되며 탭 단추([data-tab])가 없어졌다 — '예보·예정' 절의 제목 줄(더 보기)이
    //   [data-intel-sec="next"] 안에 있다. 둘 다 받는다(예전 기록을 재현하는 화면이 남아 있어도 같은 뜻으로 센다).
    const el = e.target.closest('[data-action],[data-tab],[data-intel-sec]');
    const a = el && el.dataset.action;
    const tab = el && (el.dataset.tab || el.dataset.intelSec);
    setTimeout(() => {                                  // 앱이 화면을 바꾼 뒤에 본다
      // (2026-09-24 정정) 고른 현상의 이름은 이제 시트 머리(.intel-head .ih-title)에 선다 — 한 장 시트에서는 예전 머리말이 절로 나뉘었다.
      if (t.id === 't1' && document.querySelector('.information-context strong, #intel .intel-head .ih-title[data-phen="1"]')) finish(true);
      if (t.id === 't3' && (tab === 'next' || (a === 'intel-q' && el.dataset.sec === 'NEXT') || a === 'forme-when')) finish(true);
      if (t.id === 't4' && safeGet(MYPLACE_KEY) && safeGet(MYPLACE_KEY) !== myPlace0) finish(true);
      if (t.id === 't5') {
        if (a === 'sim-q' && el.dataset.sim === 'tsunami-reach') t.parts.tsunamiTaps = t.parts.tsunamiTaps ?? t.taps;
        if (a === 'sim-why' && /기온/.test(el.dataset.why || '')) t.parts.temperatureRead = true;
        if (t.parts.tsunamiTaps != null && t.parts.temperatureRead) {
          t.taps = t.parts.tsunamiTaps;                 // 기준은 쓰나미 버튼까지의 탭 수
          finish(true);
        }
      }
      render();
    }, 350);
  };
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#earthus-measure')) return;
    if (m.firstTapMs == null) { m.firstTapMs = now(); save(); }
    const t = m.tasks[cur];
    if (t && t.state === 'doing') t.taps++;
    render();
  }, true);
  document.addEventListener('click', onAppClick, true);

  // ── 화면 ───────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
  #earthus-measure { position: fixed; left: 8px; right: 8px; top: calc(58px + env(safe-area-inset-top)); z-index: 99;
    margin: 0 auto; max-width: 420px; background: rgba(10,14,22,0.94); border: 1px solid rgba(236,122,166,0.55);
    border-radius: 12px; color: #fff; font: 12px/1.5 system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.4); }
  #earthus-measure .mh { display: flex; align-items: center; gap: 8px; padding: 7px 10px; cursor: pointer; }
  #earthus-measure .mh b { color: #ec7aa6; }
  #earthus-measure .mb { display: none; padding: 0 10px 10px; max-height: 60vh; overflow-y: auto; }
  #earthus-measure.open .mb { display: block; }
  #earthus-measure .task { border-top: 1px solid rgba(255,255,255,.1); padding: 6px 0; }
  #earthus-measure .task.doing { color: #fff; } #earthus-measure .task.todo { color: rgba(255,255,255,.45); }
  #earthus-measure .st { float: right; font-size: 11px; }
  #earthus-measure button { font: inherit; margin: 4px 6px 0 0; padding: 4px 9px; border-radius: 8px; cursor: pointer;
    background: rgba(255,255,255,.08); color: #fff; border: 1px solid rgba(255,255,255,.2); }
  #earthus-measure .hint { color: rgba(255,255,255,.55); font-size: 11px; }
  #earthus-measure .kv { display: flex; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,.75); }`;
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.id = 'earthus-measure';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', '현장 측정');
  document.body.appendChild(box);

  const ST = { todo: '대기', doing: '진행 중', pass: '성공', slow: '성공·탭 초과', fail: '못 찾음' };
  const passCount = () => m.tasks.filter((t) => t.state === 'pass').length;
  const summary = () => {
    const done = m.tasks.filter((t) => t.state !== 'todo' && t.state !== 'doing').length;
    return `${passCount()}/5 성공 · ${done}/5 끝` + (done === 5 ? (passCount() >= 4 ? ' · 기준 통과(80%)' : ' · 기준 미달') : '');
  };
  const resultText = () => {
    const L = [];
    L.push(`EARTHUS §14 현장 측정 — ${new Date().toISOString()}`);
    L.push(`기기: ${dev.ua}`);
    L.push(`화면 ${dev.screen} · 창 ${dev.viewport} · DPR ${dev.dpr} · 메모리 ${dev.memoryGB ?? '?'}GB · 코어 ${dev.cores ?? '?'} · GPU ${dev.gpu ?? '?'}`);
    L.push(`과제: ${summary()}`);
    m.tasks.forEach((t, i) => L.push(`  ${i + 1}. ${TASKS[i].ko} → ${ST[t.state]} · 탭 ${t.taps}${TASKS[i].maxTaps ? `(기준 ${TASKS[i].maxTaps})` : ''} · ${t.ms != null ? `${(t.ms / 1000).toFixed(1)}초` : '-'}${t.answer ? ` · 답 ${t.answer}` : ''}`));
    L.push(`새 1차 메뉴: ${m.primaryMenu.newIntelOrSim ? '있음 ✗' : '없음 ✓'} (하단 ${m.primaryMenu.count}칸: ${m.primaryMenu.labels.join(' · ')})`);
    L.push(`앱 준비 ${(m.appReadyMs / 1000).toFixed(1)}초 · 첫 탭 ${m.firstTapMs != null ? `${(m.firstTapMs / 1000).toFixed(1)}초` : '-'}`);
    L.push(`60초 안: 오류 ${m.errors60s} · WebGL 문맥 잃음 ${m.contextLost60s} · 지난번 측정 탭 죽음 ${m.prevCrash ? `있음(${m.prevCrash.at})` : '없음'}`);
    L.push(`FPS: ${['10s', '1m', '5m', '10m'].map((k) => `${k} ${m.fps[k] ?? '-'}`).join(' · ')}`);
    L.push(`메모리 최고: ${m.memPeakMB != null ? `${m.memPeakMB} MB` : '측정 불가(이 브라우저는 값을 주지 않음)'}`);
    L.push(`10분 발열(손 느낌): ${m.heat ?? '-'}`);
    return L.join('\n');
  };
  function save() { safeSet(RES_KEY, JSON.stringify({ at: Date.now(), dev, m })); }
  function render() {
    const open = box.classList.contains('open');
    const t = m.tasks[cur];
    box.innerHTML = `<div class="mh" data-m="toggle"><b>측정</b><span>${cur < 5 ? `과제 ${cur + 1}/5 · 탭 ${t ? t.taps : 0}` : '끝'}</span><span style="margin-left:auto">${summary()}</span><span>${open ? '▴' : '▾'}</span></div>
      <div class="mb">
        ${m.tasks.map((x, i) => `<div class="task ${x.state}"><span class="st">${ST[x.state]}${x.state !== 'todo' ? ` · 탭 ${x.taps}` : ''}</span>${i + 1}. ${TASKS[i].ko}
          ${x.state === 'doing' ? `<div class="hint">${TASKS[i].hint}</div>${TASKS[i].ask
            ? '<button data-m="ans" data-v="관측">관측</button><button data-m="ans" data-v="예보">예보</button><button data-m="ans" data-v="모르겠음">모르겠음</button>'
            : '<button data-m="done">했음</button><button data-m="giveup">못 찾음</button>'}` : ''}</div>`).join('')}
        ${cur === 0 && m.tasks[0].state === 'todo' ? '<button data-m="start">과제 시작</button>' : ''}
        <div class="task">
          <div class="kv"><span>첫 탭</span><span>${m.firstTapMs != null ? `${(m.firstTapMs / 1000).toFixed(1)}초` : '-'}</span></div>
          <div class="kv"><span>60초 오류 · 문맥 잃음</span><span>${m.errors60s} · ${m.contextLost60s}</span></div>
          <div class="kv"><span>FPS 10초 · 1분 · 5분 · 10분</span><span>${['10s', '1m', '5m', '10m'].map((k) => m.fps[k] ?? '-').join(' · ')}</span></div>
          <div class="kv"><span>메모리 최고</span><span>${m.memPeakMB != null ? `${m.memPeakMB} MB` : '측정 불가'}</span></div>
          <div class="kv"><span>새 1차 메뉴</span><span>${m.primaryMenu.newIntelOrSim ? '있음 ✗' : '없음 ✓'}</span></div>
          <div class="hint">10분 뒤 발열(손 느낌):</div>
          ${['미지근', '따뜻', '뜨거움'].map((h) => `<button data-m="heat" data-v="${h}">${h}${m.heat === h ? ' ✓' : ''}</button>`).join('')}
        </div>
        <button data-m="copy">결과 복사</button><button data-m="reset">처음부터</button>
      </div>`;
  }
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b) return;
    const k = b.dataset.m;
    if (k === 'toggle') { box.classList.toggle('open'); render(); return; }
    if (k === 'start') { m.tasks[0].state = 'doing'; taskStart = now(); }
    if (k === 'done') finish(true);
    if (k === 'giveup') finish(false);
    if (k === 'ans') { m.tasks[cur].answer = b.dataset.v; finish(b.dataset.v !== '모르겠음'); }
    if (k === 'heat') m.heat = b.dataset.v;
    if (k === 'reset') { m.tasks.forEach((t) => Object.assign(t, { state: 'todo', taps: 0, ms: null, answer: null, parts: {} })); cur = 0; taskStart = null; }
    if (k === 'copy') {
      const txt = resultText();
      try { await navigator.clipboard.writeText(txt); b.textContent = '복사했습니다'; } catch (_) { prompt('아래 글을 복사하세요', txt); }
      return;
    }
    save(); render();
  });
  box.classList.add('open');
  render();
  return { m, resultText, finish };
}
