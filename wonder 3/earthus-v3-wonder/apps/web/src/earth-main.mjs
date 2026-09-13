// EARTHUS V3 WONDER — PHASE 1 Paper Earth 부팅. 지구·카메라·회전·줌·터치/핀치·지역 진입·지구 복귀·반응형.
import { OrbitCamera, targetDiameter } from '../../../packages/globe-engine/src/camera.mjs';
import { paintPaperEarth } from '../../../packages/globe-engine/src/paper-texture.mjs';
import { createPaperEarth } from '../../../packages/globe-engine/src/earth.mjs';
import { attachGlobeInput } from '../../../packages/globe-engine/src/input.mjs';
import { regionAt, regionFocus, REGIONS } from '../../../packages/globe-engine/src/regions.mjs';

const ROOT = new URL('../../../', import.meta.url);      // earthus-v3-wonder/
const $ = s => document.querySelector(s);
const logEl = $('#log'), lines = [];
const log = m => { lines.push(m); if (lines.length > 10) lines.shift(); logEl.textContent = lines.join('\n'); };
const t0 = performance.now();

const state = { view: 'world', region: null, idleSince: performance.now(), firstFrameMs: null, textureMs: null, geoBytes: null, frames: 0 };
const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const reducedMotion = () => $('#rm').checked || prefersReduced();

const canvas = $('#globe');
const world = $('#world');
const camera = new OrbitCamera({ lat: 24, lon: 127, viewW: world.clientWidth, viewH: world.clientHeight, reducedMotion: reducedMotion() });
let earth = null, detach = null;

function viewSize() { return { w: world.clientWidth, h: world.clientHeight }; }

function setView(view, region) {
  state.view = view; state.region = region ?? null;
  $('#btnEarth').hidden = view === 'world';
  const chip = $('#regionChip');
  if (region) { chip.textContent = `${region.nameKo} · ${region.nameEn}`; chip.hidden = false; } else chip.hidden = true;
  $('#hint').textContent = view === 'world' ? '지구를 돌려 보고, 궁금한 곳을 톡 눌러 보세요' : '🌍 지구 를 누르면 돌아가요';
  document.title = view === 'world' ? 'EARTHUS WONDER · 종이 지구' : `EARTHUS WONDER · ${region.nameKo}`;
}

function updateZoomDots() { [...$('#zoomDots').children].forEach((el, i) => el.classList.toggle('on', i === camera.step)); }

function enterRegion(hit) {
  const f = regionFocus(hit);
  camera.setZoomStep(2, f);
  earth.setMarker(f.lat, f.lon);
  setView('region', hit.region);
  log(`지역 진입 ${hit.region.id} (${hit.distanceKm}km)`);
  updateZoomDots();
}

function returnToEarth() {
  if (state.view === 'world' && camera.step === 0) return false;
  camera.setZoomStep(0);
  earth.setMarker(null);
  setView('world', null);
  log('지구로');
  updateZoomDots();
  return true;
}

function onTap(at) {
  const ll = earth.pick(at.x, at.y);
  if (!ll) { log('탭: 우주(빗나감)'); return; }
  const hit = regionAt(ll.lat, ll.lon);
  if (!hit) { log(`탭 (${ll.lat.toFixed(1)}, ${ll.lon.toFixed(1)}) — 지역 없음(먼바다)`); $('#hint').textContent = '여기는 넓은 바다예요'; return; }
  enterRegion(hit);
}

function resize() {
  const { w, h } = viewSize();
  earth?.resize(w, h);
  camera.resize(w, h);
}

const marks = {};                                        // 부팅 단계별 시각(ms, 모듈 평가 기준)
const mark = k => { marks[k] = Math.round(performance.now() - t0); };
async function boot() {
  mark('boot');
  const geoUrl = new URL('content/geo/country-reference.json', ROOT);
  const res = await fetch(geoUrl);
  if (!res.ok) throw new Error(`geo ${res.status}`);
  const geo = await res.json();
  mark('geo');
  state.geoBytes = Number(res.headers.get('content-length')) || null;
  const { w, h } = viewSize();
  const small = Math.min(w, h) < 600;
  const tex = document.createElement('canvas');
  const paint = paintPaperEarth(tex, geo, { w: small ? 1024 : 2048, h: small ? 512 : 1024 });
  state.textureMs = paint.ms;
  mark('texture');
  log(`종이 지구 텍스처 ${paint.w}×${paint.h} · 나라 ${paint.features} · ${paint.ms}ms`);

  earth = createPaperEarth({ canvas, textureCanvas: tex, pixelRatio: Math.min(2, devicePixelRatio || 1) });
  mark('gl');
  resize();
  new ResizeObserver(resize).observe(world);
  detach = attachGlobeInput(canvas, {
    camera,
    onTap,
    onInteract: () => { state.idleSince = performance.now(); $('#hint').classList.add('hide'); },
    onBack: returnToEarth,
  });
  $('#btnEarth').addEventListener('click', returnToEarth);
  $('#btnZoomIn').addEventListener('click', () => { camera.zoomIn(); updateZoomDots(); state.idleSince = performance.now(); });
  $('#btnZoomOut').addEventListener('click', () => { camera.zoomOut(); updateZoomDots(); state.idleSince = performance.now(); if (camera.step === 0 && state.view === 'region') { earth.setMarker(null); setView('world', null); } });
  $('#rm').addEventListener('change', () => { camera.reducedMotion = reducedMotion(); log(`움직임 줄이기 ${camera.reducedMotion}`); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { camera.reducedMotion = reducedMotion(); });
  updateZoomDots();
  setView('world', null);

  let last = performance.now();
  /** 한 프레임: ambient → 카메라 진행 → 그리기. rAF 와 검증용 stepFrames 가 같은 함수를 쓴다. */
  function renderOnce(dt, t = performance.now()) {
    // 평소에는 조용히 — 6초 넘게 손이 없으면 아주 느리게 돈다(주 ambient 1개). 움직임 줄이기면 안 돈다.
    if (state.view === 'world' && !camera.animating && !camera.dragging && !camera.reducedMotion && t - state.idleSince > 6000) camera.lon += 0.45 * dt;
    camera.tick(dt);
    earth.render(camera.pose());
    state.frames++;
    if (state.firstFrameMs == null) { state.firstFrameMs = Math.round(performance.now() - t0); mark('firstFrame'); log(`첫 그림 ${state.firstFrameMs}ms (자료 ${marks.geo} · 텍스처 ${marks.texture} · GL ${marks.gl}) · 지름 ${Math.round(earth.projectedDiameter(camera.pose()))}px (목표 ${Math.round(targetDiameter(w, h))})`); $('#phase').textContent = 'PHASE 1 · 종이 지구 · 준비됨'; }
  }
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    renderOnce(dt, t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // 검증용: 브라우저 패널이 뒤에 있어 rAF 가 멈춰도 프레임을 동기적으로 민다(기존 실측 함정). 운영 기능 아님.
  window.__wonder.stepFrames = (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) renderOnce(dt, performance.now()); return camera.pose(); };
}

// 검증용 손잡이. 운영 기능이 이것에 의존하지 않는다.
window.__wonder = {
  state, camera, get earth() { return earth; }, REGIONS, regionAt, enterRegion, returnToEarth,
  projectedDiameter: () => earth ? earth.projectedDiameter(camera.pose()) : null,
  targetDiameter: () => { const { w, h } = viewSize(); return targetDiameter(w, h); },
  metrics: () => ({ heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, ...(earth ? earth.metrics() : {}), firstFrameMs: state.firstFrameMs, marks, textureMs: state.textureMs, geoBytes: state.geoBytes, frames: state.frames, view: viewSize(),
    resources: performance.getEntriesByType('resource').map(r => ({ name: r.name.split('/').slice(-2).join('/'), kb: Math.round((r.transferSize || r.encodedBodySize) / 1024), ms: Math.round(r.duration) })) }),
};
boot().catch(e => { console.error(e); log(`✗ 부팅 실패: ${e.message}`); $('#phase').textContent = '부팅 실패'; });
