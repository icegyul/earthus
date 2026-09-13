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
import { createBackgroundSelector, LABEL_KO } from '../../../packages/wonder-environment/src/background-select.mjs';
import { createEnvironmentView } from './environment.mjs';

const ROOT = new URL('../../../', import.meta.url);      // earthus-v3-wonder/
const CONTENT = new URL('content/', ROOT);
const $ = s => document.querySelector(s);
const logEl = $('#log'), lines = [];
const log = m => { lines.push(m); if (lines.length > 10) lines.shift(); logEl.textContent = lines.join('\n'); };
const t0 = performance.now();
const sleep = ms => (ms > 0 ? new Promise(r => setTimeout(r, ms)) : Promise.resolve());

const state = { view: 'world', region: null, envHit: null, idleSince: performance.now(), firstFrameMs: null, textureMs: null, geoBytes: null, frames: 0,
  environments: [], registryIndex: null, manifestBySlug: null, landmarks: null, spriteLoading: new Set(), bgSelector: null, bgManifest: null };
const pending = {};                                        // ensure* 의 진행 중 약속 — 동시에 두 번 불려도 한 번만 받는다(스테이징 CDN 에서 JSON 2회 요청 발견, 2026-09-13)
const prefersReduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const reducedMotion = () => $('#rm').checked || prefersReduced();

const canvas = $('#globe');
const world = $('#world');
const camera = new OrbitCamera({ lat: 24, lon: 127, viewW: world.clientWidth, viewH: world.clientHeight, reducedMotion: reducedMotion() });
const flow = createEnvironmentFlow({ reducedMotion });
let earth = null, detach = null, assets = null, envView = null;

// 패널이 아직 안 그려져 0 이 나오면 창 크기로 대신한다(0 을 그대로 쓰면 지구가 1px 이 된다).
function viewSize() { return { w: world.clientWidth || innerWidth || 1440, h: world.clientHeight || innerHeight || 900 }; }
async function loadJson(rel) { const r = await fetch(new URL(rel, ROOT)); if (!r.ok) throw new Error(`${rel} ${r.status}`); return r.json(); }

/** 레지스트리·자산 런타임·환경 화면은 처음 필요할 때 만든다(첫 화면에 안 받는다). */
function ensureRegistry() { return state.registryIndex ? Promise.resolve() : (pending.registry ??= loadRegistry().finally(() => { pending.registry = null; })); }
async function loadRegistry() {
  const reg = await loadJson('content/registry/asset-registry.json');
  state.registryIndex = new Map(reg.assets.map(a => [a.path, a]));
  // content/ 자산은 content/ 기준, Background Pack(assets/…, root: project) 은 프로젝트 루트 기준. 둘 다 ?v=sha12 로 불변 캐시.
  const urlOf = (p, sha12) => `${p.startsWith('assets/') ? ROOT.href : CONTENT.href}${p}${sha12 ? `?v=${sha12}` : ''}`;
  assets = createAssetRuntime({ lookup: p => state.registryIndex.get(p), load: defaultImageLoader, urlOf, base: CONTENT.href, budgetBytes: 30 * 1024 * 1024 });
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
function ensureContent() { return (state.manifestBySlug && state.landmarks) ? Promise.resolve() : (pending.content ??= loadContent().finally(() => { pending.content = null; })); }
async function loadContent() {
  await ensureRegistry();
  if (!state.manifestBySlug) { const man = await loadJson('content/characters/manifest-124.json'); state.manifestBySlug = new Map(man.map(m => [m.slug, m])); }
  if (!state.landmarks) state.landmarks = await loadJson('content/landmarks/landmarks.json');
}
/** Background Pack v1 — manifest 는 지역 진입 때 처음 받고, 그림은 그때 고른 한 장만 받는다(24장 preload 없음). */
function ensureBackgrounds() { return state.bgSelector ? Promise.resolve() : (pending.bg ??= loadJson('assets/background_manifest.json').then(m => { state.bgManifest = m; state.bgSelector = createBackgroundSelector(m); log(`배경 팩 ${m.count}장 목록 (그림은 지역마다 한 장만)`); }).finally(() => { pending.bg = null; })); }
/** 선택기 결과 → 환경 화면이 쓰는 배경 설명(경로·safe-crop·초점·모션). REJECT 는 선택기가 이미 거른다. */
function backgroundDesc(asset) { return asset ? { ...asset, motion: state.bgSelector.motionFor(asset.id) } : null; }
function pickBackground(env) {
  if (!state.bgSelector) return null;
  const r = state.bgSelector.select({ envBackground: env.background ?? null, lat: env.anchor?.lat, lon: env.anchor?.lon, regionId: env.regionId ?? null, hour: new Date().getHours() });
  return { desc: backgroundDesc(r.asset), reason: r.reason };
}
const PAPER_PALETTE = { sky: '#e9e2d3', far: '#d9cfbd', mid: '#cbbfa8', ground: '#bfb094', ink: '#3b3325' };
/** 캐릭터 환경이 없는 지역·바다 진입용 합성 환경: 배경 한 장 + 라벨. 캐릭터·랜드마크·이야기 없음(Discovery 는 캐릭터가 있을 때만). */
function syntheticEnv(hit, bg) {
  const r = hit.region;
  return { id: `region:${r.id}`, regionId: r.id, nameKo: r.nameKo, nameEn: r.nameEn, descriptorKo: bg ? (LABEL_KO[bg.slug] ?? '') : '', descriptorEn: '', anchor: { lat: hit.lat, lon: hit.lon },
    radiusKm: null, placeBasis: '지역 배정(Background Pack v1)', landmark: null, characters: [], nearbyCharacters: [], palette: PAPER_PALETTE, ambient: { main: 'clouds', secondary: [] }, background: bg?.id ?? null, synthetic: true };
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
/** 캐릭터 환경이 없는 지역: 배경 팩에 그 지역 배경이 있으면 종이 펼침으로 진입(§7), 없으면 예전처럼 줌만. */
async function enterRegion(hit) {
  if (flow.state !== 'earth') { log(`전환 중(${flow.state})`); return false; }
  await ensureBackgrounds();
  const r = state.bgSelector.select({ lat: hit.lat, lon: hit.lon, regionId: hit.region.id, hour: new Date().getHours() });
  if (r.asset && r.reason !== 'atmosphere') return enterEnvironment({ environment: syntheticEnv(hit, r.asset), distanceKm: hit.distanceKm, backgroundReason: r.reason });
  const f = regionFocus(hit);
  camera.setZoomStep(2, f);
  earth.setMarker(f.lat, f.lon);
  setView('region', hit.region);
  log(`지역 포커스 ${hit.region.id} (${hit.distanceKm}km) — 환경·배경 없음`);
  updateZoomDots();
  return true;
}

async function enterEnvironment({ environment: env, distanceKm, backgroundReason = null }) {
  const r = flow.enter(env.id);
  if (!r.ok) { log(`진입 거부: ${r.reason}`); return false; }
  const { plan, seq } = r;
  state.envHit = env;
  setView('region', { nameKo: env.nameKo, nameEn: env.nameEn, descriptor: env.descriptorKo });
  earth.setMarker(env.anchor.lat, env.anchor.lon);
  camera.setZoomStep(2, env.anchor, { durMs: plan.approachMs });
  updateZoomDots();
  log(`${env.synthetic ? '지역' : '환경'} ${env.id} 접근 (${plan.mode}, ${distanceKm}km)`);
  await Promise.all([ensureContent(), ensureBackgrounds(), sleep(plan.approachMs)]);
  if (flow.seq !== seq || flow.state !== 'approaching') return false;
  flow.approached();
  const row = env.characters?.[0] ? state.manifestBySlug.get(env.characters[0]) ?? null : null;
  const lm = env.landmark ? state.landmarks.items[env.landmark] : null;
  const origin = earth.project(env.anchor.lat, env.anchor.lon);
  const bg = pickBackground(env);                               // 지역 진입 때 배경 한 장만 고른다 (Paper Unfold → Environment Background)
  $('#btnFart').hidden = !row?.interaction?.fart;
  await envView.open({ env, row, landmarkPath: lm?.path ?? null, origin, plan, background: bg?.desc ?? null });
  if (flow.seq !== seq) { await envView.close({ plan: { foldMs: 0 } }); return false; }   // 펼치는 사이에 지구로 돌아갔다 — 열린 층을 도로 닫는다
  flow.unfolded();
  setView('environment', { nameKo: env.nameKo, nameEn: env.nameEn, descriptor: env.descriptorKo });
  log(`${env.synthetic ? '지역' : '환경'} ${env.id} 활성 · unfold ${plan.unfoldMs}ms(${plan.mode}) · 배경 ${bg?.desc ? `${bg.desc.id} (${backgroundReason ?? bg.reason})` : '없음(종이)'}${row ? ' · discovery-ready' : ''}`);
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
  // 들어가는 중(접근·펼침)에 눌러도 지구로 돌아온다 — 지구 버튼이 먹지 않는 순간이 있으면 안 된다(PHASE 1 수용 기준 "Earth return works").
  if (flow.state === 'approaching' || flow.state === 'unfolding' || flow.state === 'folding' || flow.state === 'zooming-out') {
    flow.abort();                                              // seq 를 올려 진행 중이던 진입을 무효로 만든다
    $('#btnFart').hidden = true;
    if (envView?.isOpen) await envView.close({ plan: { foldMs: 0 } });
    earth.setMarker(null);
    camera.setZoomStep(0);
    setView('world', null); updateZoomDots();
    state.envHit = null; syncSprites();
    log('지구로 (진입 취소)');
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
  if (!hit) {
    // 먼바다: 지역은 없지만 배경 팩의 바닷속(underwater) 이 있으면 그리로 들어간다(LOCAL → 필요할 때 load).
    log(`탭 (${ll.lat.toFixed(1)}, ${ll.lon.toFixed(1)}) — 지역 없음(먼바다)`);
    enterOcean(ll);
    return;
  }
  enterRegion(hit);
}
async function enterOcean(ll) {
  if (flow.state !== 'earth') return false;
  await ensureBackgrounds();
  const asset = state.bgSelector.loadable('bg-16') ? state.bgSelector.byId('bg-16') : null;
  if (!asset) { $('#hint').textContent = '여기는 넓은 바다예요'; return false; }
  const hit = { region: { id: 'ocean', nameKo: '넓은 바다', nameEn: 'Open Ocean' }, lat: ll.lat, lon: ll.lon, distanceKm: 0 };
  return enterEnvironment({ environment: { ...syntheticEnv(hit, asset), background: asset.id }, distanceKm: 0, backgroundReason: 'ocean' });
}

// 창이 0×0 인 순간(패널이 숨겨졌거나 전환 중)에는 크기를 반영하지 않는다 — 반영하면 카메라 거리가 NaN 이 되어 지구가 사라진다(2026-09-13 실측).
function resize() { const { w, h } = viewSize(); if (w < 2 || h < 2) return; earth?.resize(w, h); camera.resize(w, h); }

const marks = {};
const mark = k => { marks[k] = Math.round(performance.now() - t0); };
async function boot() {
  mark('boot');
  const params = new URLSearchParams(location.search);
  if (params.has('debug') || params.get('qa') === '1') document.body.classList.add('debug');   // 개발 표시는 요청할 때만(화면은 지구 하나다)
  // 첫 그림은 지구 자료 하나에만 매인다. 환경 카탈로그는 옆에서 받아 온다(탭이 그때까지 기다리지 않게).
  const geoP = loadJson('content/geo/country-reference.json');
  const envP = loadJson('content/environments/environments.json').then(c => { state.environments = c.environments; }).catch(e => log(`⚠ 환경 카탈로그: ${e.message}`));
  const geo = await geoP;
  mark('geo');
  const { w, h } = viewSize();
  const small = Math.min(w, h) < 600;
  const full = small ? { w: 1024, h: 512 } : { w: 2048, h: 1024 };
  const tex = document.createElement('canvas');
  // 낮은 해상도로 먼저 굽고 바로 그린다 → 지구가 즉시 뜬다. 고해상도는 첫 프레임 뒤에 다시 굽는다(같은 캔버스, 텍스처만 갱신).
  const first = { w: Math.min(full.w, 1024), h: Math.min(full.h, 512) };
  const paint = paintPaperEarth(tex, geo, first);
  state.textureMs = paint.ms; mark('texture');
  log(`종이 지구 텍스처 ${paint.w}×${paint.h} · 나라 ${paint.features} · ${paint.ms}ms`);

  earth = createPaperEarth({ canvas, textureCanvas: tex, pixelRatio: Math.min(2, devicePixelRatio || 1), ambient: true, labels: !params.has('nolabel') });
  mark('gl');
  if (full.w !== first.w) {                                     // 고해상 승급 — 첫 프레임이 나간 뒤 한가할 때
    const upgrade = () => { const p2 = paintPaperEarth(tex, geo, full); earth.refreshTexture(); state.textureMs = p2.ms; state.textureSize = [p2.w, p2.h]; log(`텍스처 승급 ${p2.w}×${p2.h} · ${p2.ms}ms`); };
    (globalThis.requestIdleCallback ?? (f => setTimeout(f, 120)))(() => upgrade(), { timeout: 1500 });
  }
  state.textureSize = [paint.w, paint.h];
  resize();
  new ResizeObserver(resize).observe(world);
  state.gestures = { drag: 0, 'pinch-in': 0, 'pinch-out': 0, 'wheel-in': 0, 'wheel-out': 0, tap: 0, touchDrag: 0, touchPinch: 0, touchTap: 0 };
  detach = attachGlobeInput(canvas, {
    camera, onTap,
    onInteract: () => { state.idleSince = performance.now(); $('#hint').classList.add('hide'); },
    onBack: returnToEarth,
    onGesture: (kind, info) => { state.gestures[kind] = (state.gestures[kind] ?? 0) + 1; if (info?.pointerType === 'touch') { if (kind === 'drag') state.gestures.touchDrag++; else if (kind.startsWith('pinch')) state.gestures.touchPinch++; else if (kind === 'tap') state.gestures.touchTap++; } },
  });
  // 실기기 QA 하네스: ?qa=1 일 때만 (Device Gate 용). 운영 기능 아님.
  if (new URLSearchParams(location.search).get('qa') === '1') import('./qa-overlay.mjs').then(m => m.installQaOverlay(window.__wonder, { log })).catch(e => log(`QA 오버레이 실패: ${e.message}`));
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
    if (state.view === 'world' && !camera.tween && !camera.dragging && !camera.reducedMotion && t - state.idleSince > 6000) camera.nudgeLon(0.45 * dt);   // 첫 화면 자동 회전: 현재값·목표를 함께 민다(V2 autoRotate 와 같은 자리)
    camera.tick(dt);
    if (!camera.reducedMotion) earth.tick(dt);                  // 종이 구름이 아주 느리게 흐른다(움직임 줄이기면 멈춘다)
    earth.render(camera.pose());
    state.frames++;
    if (camera.step !== lastStep || (camera.step >= 1 && state.frames % 30 === 0 && !camera.animating)) { lastStep = camera.step; syncSprites(); }
    if (state.firstFrameMs == null) { state.firstFrameMs = Math.round(performance.now() - t0); mark('firstFrame'); log(`첫 그림 ${state.firstFrameMs}ms (자료 ${marks.geo} · 텍스처 ${marks.texture} · GL ${marks.gl}) · 지름 ${Math.round(earth.projectedDiameter(camera.pose()))}px (목표 ${Math.round(targetDiameter(w, h))})`); $('#phase').textContent = 'PHASE 1 · Paper Earth'; }
  }
  function frame(t) { const dt = Math.min(0.05, (t - last) / 1000); last = t; renderOnce(dt, t); requestAnimationFrame(frame); }
  renderOnce(0);                                                // 첫 그림은 rAF 를 기다리지 않는다 — 지구가 바로 뜬다(창이 가려져 있어도 계측이 정직하다)
  requestAnimationFrame(frame);
  await envP;                                                   // 환경 카탈로그는 지구가 뜬 뒤에 붙는다
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

/** 배경 팩 검증·조작 창구(브라우저 검증용): 목록·선택·지금 열린 환경의 배경 바꾸기·닫힌 상태면 그 배경으로 지역 열기. */
const background = {
  ensure: ensureBackgrounds,
  list: () => state.bgSelector?.list() ?? [],
  select: q => state.bgSelector?.select(q) ?? null,
  async show(id) {
    await ensureBackgrounds();
    const asset = state.bgSelector.byId(id);
    if (!asset || !state.bgSelector.loadable(id)) { log(`배경 ${id}: 없거나 REJECT`); return false; }
    if (envView?.isOpen) return envView.setBackground(backgroundDesc(asset));
    const pose = camera.pose();
    const hit = { region: { id: `bg-${asset.slug}`, nameKo: LABEL_KO[asset.slug] ?? asset.slug, nameEn: asset.slug }, lat: pose.lat, lon: pose.lon, distanceKm: 0 };
    return enterEnvironment({ environment: { ...syntheticEnv(hit, asset), background: asset.id }, distanceKm: 0, backgroundReason: 'manual' });
  },
  get current() { return envView?.background ?? null; },
};
window.__wonder = {
  state, camera, flow, REGIONS, regionAt, environmentAt: (lat, lon) => environmentAt(lat, lon, state.environments), enterRegion, enterEnvironment, returnToEarth, background,
  get earth() { return earth; }, assets: null, env: null, requests,
  projectedDiameter: () => earth ? earth.projectedDiameter(camera.pose()) : null,
  targetDiameter: () => { const { w, h } = viewSize(); return targetDiameter(w, h); },
  metrics: () => ({ heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, ...(earth ? earth.metrics() : {}), firstFrameMs: state.firstFrameMs, marks, textureMs: state.textureMs, frames: state.frames, view: viewSize(),
    assets: assets ? assets.status() : null, sprites: earth ? earth.spriteIds : [], flow: flow.state,
    resources: performance.getEntriesByType('resource').map(r => ({ name: r.name.split('/').slice(-2).join('/'), kb: Math.round((r.transferSize || r.encodedBodySize) / 1024), ms: Math.round(r.duration) })) }),
};
boot().catch(e => { console.error(e); log(`✗ 부팅 실패: ${e.message}`); $('#phase').textContent = '부팅 실패'; });
