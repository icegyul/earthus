// EARTHUS V3 WONDER — PHASE 1 Paper Earth + PHASE 1-B Wonder Environment 부팅.
// 흐름: Paper Earth → tap → (환경 있으면) camera approach → paper unfold → environment active(discovery-ready) → EARTH → fold → zoom-out → Earth.
// 첫 화면은 지구 자료(Natural Earth)와 환경 카탈로그만 받는다. 레지스트리·manifest·썸네일은 줌/진입 때, 런타임·랜드마크는 진입 때만.
import { OrbitCamera, targetDiameter } from '../../../packages/globe-engine/src/camera.mjs';
import { paintPaperEarth } from '../../../packages/globe-engine/src/paper-texture.mjs';
import { createPaperEarth } from '../../../packages/globe-engine/src/earth.mjs';
import { attachGlobeInput } from '../../../packages/globe-engine/src/input.mjs';
import { regionAt, regionFocus, REGIONS } from '../../../packages/globe-engine/src/regions.mjs';
import { createAssetRuntime, defaultImageLoader } from '../../../packages/asset-runtime/src/loader.mjs';
import { createEnvironmentFlow } from '../../../packages/wonder-environment/src/environment-state.mjs';
import { environmentAt } from '../../../packages/wonder-environment/src/environments.mjs';
import { createEnvironmentView } from './environment.mjs';

const ROOT = new URL('../../../', import.meta.url);      // earthus-v3-wonder/
const CONTENT = new URL('content/', ROOT);
const $ = s => document.querySelector(s);
const logEl = $('#log'), lines = [];
const log = m => { lines.push(m); if (lines.length > 10) lines.shift(); logEl.textContent = lines.join('\n'); };
const t0 = performance.now();
const sleep = ms => (ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve());

const state = { view: 'world', region: null, envHit: null, idleSince: performance.now(), firstFrameMs: null, textureMs: null, geoBytes: null, frames: 0,
  environments: [], registryIndex: null, manifestBySlug: null, landmarks: null, spriteLoading: new Set() };
const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const reducedMotion = () => $('#rm').checked || prefersReduced();

const canvas = $('#globe');
const world = $('#world');
const camera = new OrbitCamera({ lat: 24, lon: 127, viewW: world.clientWidth, viewH: world.clientHeight, reducedMotion: reducedMotion() });
const flow = createEnvironmentFlow({ reducedMotion });
let earth = null, detach = null, assets = null, envView = null;

function viewSize() { return { w: world.clientWidth, h: world.clientHeight }; }
async function loadJson(rel) { const r = await fetch(new URL(rel, ROOT)); if (!r.ok) throw new Error(`${rel} ${r.status}`); return r.json(); }

/** 레지스트리·자산 런타임·환경 화면은 처음 필요할 때 만든다(첫 화면에 안 받는다). */
async function ensureRegistry() {
  if (state.registryIndex) return;
  const reg = await loadJson('content/registry/asset-registry.json');
  state.registryIndex = new Map(reg.assets.map(a => [a.path, a]));
  assets = createAssetRuntime({ lookup: p => state.registryIndex.get(p), load: defaultImageLoader, base: CONTENT.href, budgetBytes: 30 * 1024 * 1024 });
  envView = createEnvironmentView($('#env'), {
    assets, contentBase: ROOT, log, reducedMotion,
    onEarth: () => returnToEarth(),
    onStoryOpen: () => flow.openStory(),
    onStoryClose: () => flow.closeStory(),
    loadStories: async () => { if (!state.stories) state.stories = (await loadJson('content/stories/stories.json')).stories; return state.stories; },
  });
  window.__wonder.assets = assets; window.__wonder.env = envView;
  log(`레지스트리 ${reg.assets.length} 자산 (지연 로드)`);
}
async function ensureContent() {
  await ensureRegistry();
  if (!state.manifestBySlug) { const man = await loadJson('content/characters/manifest-124.json'); state.manifestBySlug = new Map(man.map(m => [m.slug, m])); }
  if (!state.landmarks) state.landmarks = await loadJson('content/landmarks/landmarks.json');
}

function setView(view, label) {
  state.view = view; state.region = label ?? null;
  $('#btnEarth').hidden = view === 'world';
  const chip = $('#regionChip');
  if (label) { chip.textContent = label.descriptor ? `${label.nameKo} · ${label.descriptor}` : `${label.nameKo} · ${label.nameEn}`; chip.hidden = false; } else chip.hidden = true;
  $('#hint').textContent = view === 'world' ? '지구를 돌려 보고, 궁금한 곳을 톡 눌러 보세요' : view === 'environment' ? '친구를 톡 눌러 보세요 · 🌍 지구 를 누르면 돌아가요' : '🌍 지구 를 누르면 돌아가요';
  document.title = view === 'world' ? 'EARTHUS WONDER · 종이 지구' : `EARTHUS WONDER · ${label.nameKo}`;
}
function updateZoomDots() { [...$('#zoomDots').children].forEach((el, i) => el.classList.toggle('on', i === camera.step)); }

/* ── 지구 위 캐릭터 스프라이트 (LOD1 썸네일, 보이는 지역만) ─────────────────────────── */
async function syncSprites() {
  if (!earth) return;
  const pose = camera.pose();
  // 보이는 지역만: 1단은 앞반구(cos>0.25), 2단(지역 줌)은 화면에 실제로 들어오는 근처만(cos>0.85 ≈ 32° 안)
  const minCos = camera.step >= 2 ? 0.85 : 0.25;
  const want = camera.step >= 1 ? state.environments.filter(e => earth.facing(e.anchor.lat, e.anchor.lon, pose, minCos)).map(e => e.id) : [];
  for (const id of earth.spriteIds) if (!want.includes(id)) earth.removeSprite(id);
  for (const e of state.environments) {
    if (!want.includes(e.id) || earth.spriteIds.includes(e.id) || state.spriteLoading.has(e.id)) continue;
    state.spriteLoading.add(e.id);
    try {
      await ensureContent();
      const row = state.manifestBySlug.get(e.characters[0]);
      if (row?.art?.thumb) {
        const t = await assets.get(row.art.thumb);
        if (camera.step >= 1 && earth.facing(e.anchor.lat, e.anchor.lon, camera.pose(), minCos)) earth.setSprite(e.id, { lat: e.anchor.lat, lon: e.anchor.lon, image: t.value, size: camera.step >= 2 ? 0.075 : 0.11 });
      }
    } catch (err) { log(`⚠ 스프라이트 ${e.id}: ${err.message}`); }
    finally { state.spriteLoading.delete(e.id); }
  }
}

/* ── 지역 / 환경 진입 ────────────────────────────────────────────────────────────── */
function enterRegion(hit) {
  const f = regionFocus(hit);
  camera.setZoomStep(2, f);
  earth.setMarker(f.lat, f.lon);
  setView('region', hit.region);
  log(`지역 포커스 ${hit.region.id} (${hit.distanceKm}km) — 환경 없음`);
  updateZoomDots();
}

async function enterEnvironment({ environment: env, distanceKm }) {
  const r = flow.enter(env.id);
  if (!r.ok) { log(`진입 거부: ${r.reason}`); return false; }
  const { plan, seq } = r;
  state.envHit = env;
  setView('region', { nameKo: env.nameKo, nameEn: env.nameEn, descriptor: env.descriptorKo });
  earth.setMarker(env.anchor.lat, env.anchor.lon);
  camera.setZoomStep(2, env.anchor, { durMs: plan.approachMs });
  updateZoomDots();
  log(`환경 ${env.id} 접근 (${plan.mode}, ${distanceKm}km)`);
  await Promise.all([ensureContent(), sleep(plan.approachMs)]);
  if (flow.seq !== seq || flow.state !== 'approaching') return false;
  flow.approached();
  const row = state.manifestBySlug.get(env.characters[0]);
  const lm = state.landmarks.items[env.landmark];
  const origin = earth.project(env.anchor.lat, env.anchor.lon);
  $('#btnFart').hidden = !row?.interaction?.fart;
  await envView.open({ env, row, landmarkPath: lm?.path ?? null, origin, plan });
  if (flow.seq !== seq) return false;
  flow.unfolded();
  setView('environment', { nameKo: env.nameKo, nameEn: env.nameEn, descriptor: env.descriptorKo });
  log(`환경 ${env.id} 활성 · unfold ${plan.unfoldMs}ms(${plan.mode}) · discovery-ready`);
  return true;
}

async function returnToEarth() {
  if (flow.state === 'active') {
    const x = flow.exit(); if (!x.ok) return false;
    const { plan, seq } = x;
    $('#btnFart').hidden = true;
    await envView.close({ plan });
    flow.folded();
    earth.setMarker(null);
    camera.setZoomStep(0, {}, { durMs: plan.zoomOutMs });
    setView('world', null); updateZoomDots();
    await sleep(plan.zoomOutMs);
    if (flow.seq === seq) flow.zoomedOut();
    state.envHit = null;
    syncSprites();
    log('지구로 (접기 → 줌아웃)');
    return true;
  }
  if (flow.state !== 'earth') { log(`전환 중(${flow.state}) — 잠시 뒤`); return false; }
  if (state.view === 'world' && camera.step === 0) return false;
  camera.setZoomStep(0);
  earth.setMarker(null);
  setView('world', null); updateZoomDots();
  log('지구로');
  syncSprites();
  return true;
}

function onTap(at) {
  if (flow.state !== 'earth') { log(`전환 중(${flow.state})`); return; }
  const ll = earth.pick(at.x, at.y);
  if (!ll) { log('탭: 우주(빗나감)'); return; }
  const envHit = environmentAt(ll.lat, ll.lon, state.environments);
  if (envHit) { enterEnvironment(envHit); return; }
  const hit = regionAt(ll.lat, ll.lon);
  if (!hit) { log(`탭 (${ll.lat.toFixed(1)}, ${ll.lon.toFixed(1)}) — 지역 없음(먼바다)`); $('#hint').textContent = '여기는 넓은 바다예요'; return; }
  enterRegion(hit);
}

function resize() { const { w, h } = viewSize(); earth?.resize(w, h); camera.resize(w, h); }

const marks = {};
const mark = k => { marks[k] = Math.round(performance.now() - t0); };
async function boot() {
  mark('boot');
  const [geo, envCat] = await Promise.all([loadJson('content/geo/country-reference.json'), loadJson('content/environments/environments.json')]);
  state.environments = envCat.environments;
  mark('geo');
  const { w, h } = viewSize();
  const small = Math.min(w, h) < 600;
  const tex = document.createElement('canvas');
  const paint = paintPaperEarth(tex, geo, { w: small ? 1024 : 2048, h: small ? 512 : 1024 });
  state.textureMs = paint.ms; mark('texture');
  log(`종이 지구 텍스처 ${paint.w}×${paint.h} · 나라 ${paint.features} · ${paint.ms}ms · 환경 ${state.environments.length}곳`);

  earth = createPaperEarth({ canvas, textureCanvas: tex, pixelRatio: Math.min(2, devicePixelRatio || 1) });
  mark('gl');
  resize();
  new ResizeObserver(resize).observe(world);
  detach = attachGlobeInput(canvas, {
    camera, onTap,
    onInteract: () => { state.idleSince = performance.now(); $('#hint').classList.add('hide'); },
    onBack: returnToEarth,
  });
  $('#btnEarth').addEventListener('click', returnToEarth);
  $('#btnFart').addEventListener('click', () => envView?.fart());
  $('#btnZoomIn').addEventListener('click', () => { if (envView?.isOpen || flow.state !== 'earth') return; camera.zoomIn(); updateZoomDots(); state.idleSince = performance.now(); });
  $('#btnZoomOut').addEventListener('click', () => { if (envView?.isOpen || flow.state !== 'earth') return; camera.zoomOut(); updateZoomDots(); state.idleSince = performance.now(); if (camera.step === 0 && state.view === 'region') { earth.setMarker(null); setView('world', null); } });
  $('#rm').addEventListener('change', () => { camera.reducedMotion = reducedMotion(); log(`움직임 줄이기 ${camera.reducedMotion}`); });
  matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { camera.reducedMotion = reducedMotion(); });
  updateZoomDots();
  setView('world', null);

  let last = performance.now(), lastStep = 0;
  function renderOnce(dt, t = performance.now()) {
    if (state.view === 'world' && !camera.animating && !camera.dragging && !camera.reducedMotion && t - state.idleSince > 6000) camera.lon += 0.45 * dt;
    camera.tick(dt);
    earth.render(camera.pose());
    state.frames++;
    if (camera.step !== lastStep || (camera.step >= 1 && state.frames % 30 === 0 && !camera.animating)) { lastStep = camera.step; syncSprites(); }
    if (state.firstFrameMs == null) { state.firstFrameMs = Math.round(performance.now() - t0); mark('firstFrame'); log(`첫 그림 ${state.firstFrameMs}ms (자료 ${marks.geo} · 텍스처 ${marks.texture} · GL ${marks.gl}) · 지름 ${Math.round(earth.projectedDiameter(camera.pose()))}px (목표 ${Math.round(targetDiameter(w, h))})`); $('#phase').textContent = 'PHASE 1-B · 종이 지구 · 준비됨'; }
  }
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; renderOnce(dt, t); requestAnimationFrame(frame); }
  requestAnimationFrame(frame);
  window.__wonder.stepFrames = (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) renderOnce(dt, performance.now()); return camera.pose(); };
}

/** 실제로 요청된 자산 수 — content/ 아래 요청을 종류별로 센다(브라우저 검증·보고용). */
function requests() {
  const rows = performance.getEntriesByType('resource').filter(r => r.name.includes('/content/'));
  const kind = n => n.includes('/characters/thumb/') ? 'character-thumb' : n.includes('/characters/runtime/') && n.includes('_scene') ? 'character-scene' : n.includes('/characters/runtime/') ? 'character-runtime' : n.includes('/landmarks/') && n.endsWith('.json') ? 'landmarks-json' : n.includes('/landmarks/') ? 'landmark' : n.includes('/pack-1.8/fx/') ? 'fx' : n.includes('/pack-1.8/backgrounds/') ? 'background' : n.includes('/registry/') ? 'registry' : n.includes('manifest-124') ? 'manifest-124' : n.includes('/environments/') ? 'environments' : n.includes('/stories/') ? 'stories' : n.includes('/geo/') ? 'geo' : 'other';
  const byKind = {};
  for (const r of rows) { const k = kind(r.name.split('?')[0]); (byKind[k] ??= []).push({ file: r.name.split('/').pop(), kb: Math.round((r.transferSize || r.encodedBodySize) / 1024) }); }
  return { total: rows.length, byKind, characterFiles: rows.filter(r => r.name.includes('/characters/') && !r.name.includes('manifest')).length };
}

window.__wonder = {
  state, camera, flow, REGIONS, regionAt, environmentAt: (lat, lon) => environmentAt(lat, lon, state.environments), enterRegion, enterEnvironment, returnToEarth,
  get earth() { return earth; }, assets: null, env: null, requests,
  projectedDiameter: () => earth ? earth.projectedDiameter(camera.pose()) : null,
  targetDiameter: () => { const { w, h } = viewSize(); return targetDiameter(w, h); },
  metrics: () => ({ heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, ...(earth ? earth.metrics() : {}), firstFrameMs: state.firstFrameMs, marks, textureMs: state.textureMs, frames: state.frames, view: viewSize(),
    assets: assets ? assets.status() : null, sprites: earth ? earth.spriteIds : [], flow: flow.state,
    resources: performance.getEntriesByType('resource').map(r => ({ name: r.name.split('/').slice(-2).join('/'), kb: Math.round((r.transferSize || r.encodedBodySize) / 1024), ms: Math.round(r.duration) })) }),
};
boot().catch(e => { console.error(e); log(`✗ 부팅 실패: ${e.message}`); $('#phase').textContent = '부팅 실패'; });
