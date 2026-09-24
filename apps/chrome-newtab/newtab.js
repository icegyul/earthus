// EARTHUS 새 탭 — 화면 (2026-09-24 · 지시서 §0-2 · §4-2 · §4-3 · §4-6)
//
// 순서(지시서 §4-3 — 바꾸면 '첫 그림 200 ms' 와 '네트워크를 기다리지 않는다'가 깨진다)
//   ① 캐시된 합성본(바탕+구름 정사영)을 곧바로 그린다 — 네트워크 0건
//   ② 밤 경계를 덧그린다(여는 순간의 태양 위치, sun.js)
//   ③ 사실 카드(저장된 JSON 에서 — feeds.js)
//   ④ 오래됐으면(마지막 받기 15분 초과) SW 에 '받아 줘'를 청한다 — 기다리지 않는다
//   ⑤ 새 구름이 도착하면 합성본을 한 번 다시 만들어 한 번 교체한다(300 ms 페이드 1회)
//
// ⚠️ requestAnimationFrame 을 쓰지 않는다 · WebGL 을 쓰지 않는다 · 타이머로 다시 그리지 않는다(HANDOVER §5 발열).
//   다시 그리는 때는 셋뿐이다: 창 크기가 바뀔 때 · 새 자료가 저장됐을 때 · 설정이 바뀌었을 때.
// ⚠️ 라벨은 **지금 그려진 합성본의 info** 에서 읽는다(저장소의 최신 meta 가 아니라). 그래야 새 시각 라벨에 지난 그림이
//   붙는 일이 없다(지시서 R14).

import { renderComposite, renderNight, compositeKey, orthoForward, COMPOSITE_SIZE, NIGHT_SIZE, CENTER_LAT_DEG } from './globe2d.js';
import { subsolarPoint } from './sun.js';
import { buildFacts, cloudStatus, fmtKst, fmtUtc, pageShouldAskRefresh } from './feeds.js';
import { getLocal, setLocal, getComposite, putComposite, getCloud } from './store.js';

const t = (key, subs) => chrome.i18n.getMessage(key, subs);
const LANG = /^ko/i.test(chrome.i18n.getUILanguage() || '') ? 'ko' : 'en';
let OPEN_MS = Date.now();
let SUN = subsolarPoint(new Date(OPEN_MS));   // 여는 순간 한 번 — 탭을 오래 열어 둬도 다시 계산하지 않는다(라벨에 그 시각이 적힌다)
// (2026-09-24 정정 · 적대 검수) '다시 계산하지 않는다'는 보이는 동안의 규칙이다. 숨겨 둔 새 탭으로 10분 넘게 지나 **돌아오면**
//   한 번 다시 계산한다(아래 visibilitychange) — 몇 시간 전 밤 경계에 '지금 태양 위치로 계산' 이라 붙이지 않게. 타이머·루프는 없다.
const SUN_RECALC_AFTER_MS = 10 * 60 * 1000;
const $ = (id) => document.getElementById(id);
const DRAFT_SIZE = 512;

const view = {
  local: {},            // chrome.storage.local 사본
  cities: [],
  city: null,
  shown: null,          // { bitmap, info } — 지금 보이는 합성본
  layer: 0,             // 0 = globe-a, 1 = globe-b
  night: new Map(),     // lon0 → 256px 밤 덮개 캔버스(여는 순간의 태양)
  building: null,
};

/* ── 준비 ─────────────────────────────────────────────────────────── */

function applyStaticText() {
  document.documentElement.lang = LANG;
  document.title = t('pageTitle');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
}

async function loadCities() {
  const r = await fetch('data/cities.json');
  const j = await r.json();
  return { list: j.cities, def: j.defaultCity };
}
function pickCity() {
  const want = view.local.settings && view.local.settings.cityId;
  return view.cities.list.find((c) => c.id === want) || view.cities.list.find((c) => c.id === view.cities.def) || view.cities.list[0];
}

/* ── 지구 ─────────────────────────────────────────────────────────── */

async function decode(blob, opts) {
  const bmp = await createImageBitmap(blob, opts);
  const oc = new OffscreenCanvas(bmp.width, bmp.height);
  const cx = oc.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0);
  const id = cx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { data: id.data, width: id.width, height: id.height };
}

let baseImage = null;
// 자료가 바뀌었을 때만 부른다(구름 시각 또는 중심 경도). 여는 순간마다 부르지 않는다.
// (2026-09-24) size 를 받는다: 캐시가 하나도 없을 때(첫 설치·도시 변경)는 512 px 초안을 먼저 그린다.
//   실측(이 PC, headless Chromium): 1024 px 투영 71 ms · 512 px 17.5 ms. 1024 로 곧바로 그리면 첫 설치 첫 그림이
//   219.7 ms 로 기준(200 ms, 지시서 Phase 3 기준 13)을 넘었다. 초안은 캐시에 저장하지 않고 곧바로 1024 로 바꿔 그린다.
async function buildComposite(city, size = COMPOSITE_SIZE) {
  if (!baseImage) baseImage = await decode(await (await fetch('assets/ne2-base-2048.jpg')).blob());
  let cloud = null, ci = null;
  const held = await getCloud().catch(() => null);
  if (held && held.info && held.info.time) {
    try {
      const d = await decode(held.blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      cloud = { data: d.data, width: d.width, height: d.height, north: held.info.north, south: held.info.south };
      ci = held.info;
    } catch { cloud = null; ci = null; }
  }
  const px = renderComposite(baseImage, cloud, { lon0: city.lon, lat0: CENTER_LAT_DEG, size });
  const oc = new OffscreenCanvas(size, size);
  oc.getContext('2d').putImageData(new ImageData(px, size, size), 0, 0);
  const info = {
    key: compositeKey(ci && ci.time, city.lon, size),
    cloudTime: ci ? ci.time : null,
    cloudTimeMs: ci ? ci.timeMs : null,
    credit: ci ? ci.credit : null,
    lon0: city.lon,
    size,
  };
  const bitmap = await createImageBitmap(oc);
  // 다음 새 탭이 곧바로 그리도록 저장한다(기다리지 않는다). 초안(작은 크기)은 저장하지 않는다.
  if (size === COMPOSITE_SIZE) oc.convertToBlob({ type: 'image/webp', quality: 0.9 }).then((b) => putComposite(b, info)).catch(() => {});
  return { bitmap, info };
}

function nightLayer(lon0) {
  let c = view.night.get(lon0);
  if (c) return c;
  const px = renderNight({ lon0, lat0: CENTER_LAT_DEG, sun: SUN, size: NIGHT_SIZE });
  c = new OffscreenCanvas(NIGHT_SIZE, NIGHT_SIZE);
  c.getContext('2d').putImageData(new ImageData(px, NIGHT_SIZE, NIGHT_SIZE), 0, 0);
  view.night.set(lon0, c);
  return c;
}

function paint(canvas, shown) {
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(rect.width * (window.devicePixelRatio || 1)));
  if (canvas.width !== W) { canvas.width = W; canvas.height = W; }
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, W);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(shown.bitmap, 0, 0, W, W);
  ctx.drawImage(nightLayer(shown.info.lon0), 0, 0, W, W);
  // 내 장소 — 점 하나(값이 아니라 자리 표시다)
  const c = view.city;
  if (c) {
    const p = orthoForward(c.lat, c.lon, CENTER_LAT_DEG, shown.info.lon0);
    if (p.visible) {
      const x = ((p.x + 1) / 2) * W, y = ((1 - p.y) / 2) * W, r = Math.max(3, W / 170);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = Math.max(1.5, r / 2); ctx.strokeStyle = 'rgba(2,6,12,0.85)'; ctx.stroke();
    }
  }
  canvas.setAttribute('aria-label', t('globeLabel', [LANG === 'ko' ? c.ko : c.en]));
}

function layers() { return [$('globe-a'), $('globe-b')]; }

function showFirst(shown) {
  view.shown = shown;
  paint(layers()[view.layer], shown);
  renderCredits();
}

// 새 합성본으로 한 번 교체한다. 페이드는 300 ms 한 번이고 끝나면 전이 규칙을 걷어 낸다(도는 것이 남지 않게).
function swapTo(shown) {
  const [a, b] = layers();
  const from = view.layer === 0 ? a : b;
  const to = view.layer === 0 ? b : a;
  paint(to, shown);
  const globe = $('globe');
  globe.classList.add('swapping');
  to.classList.add('is-on');
  from.classList.remove('is-on');
  to.removeAttribute('aria-hidden'); from.setAttribute('aria-hidden', 'true');
  to.setAttribute('role', 'img'); from.removeAttribute('role');
  view.layer = view.layer === 0 ? 1 : 0;
  if (view.shown && view.shown.bitmap !== shown.bitmap) { const old = view.shown.bitmap; setTimeout(() => old.close(), 400); }
  view.shown = shown;
  renderCredits();
  renderStatus();
  setTimeout(() => globe.classList.remove('swapping'), 350);
}

const wantedKey = () => compositeKey(view.local.cloud && view.local.cloud.time, view.city.lon, COMPOSITE_SIZE);
async function rebuildIfNeeded() {
  if (view.building) { view.recheck = true; return view.building; }
  if (view.shown && view.shown.info.key === wantedKey()) return null;
  view.building = (async () => {
    // 한 틱 양보 — 첫 그림·사실 카드가 먼저 화면에 나가게
    await new Promise((r) => setTimeout(r, 0));
    const next = await buildComposite(view.city);
    if (!view.shown) showFirst(next);
    else if (next.info.key !== view.shown.info.key) swapTo(next);
    else next.bitmap.close();
  })().finally(() => {
    view.building = null;
    // 만드는 사이에 새 구름·새 도시가 저장됐으면 한 번 더(자료가 바뀐 만큼만 — 도는 고리가 아니다)
    if (view.recheck) { view.recheck = false; rebuildIfNeeded(); }
  });
  return view.building;
}

/* ── 글자 ─────────────────────────────────────────────────────────── */

function renderCredits() {
  const s = view.shown && view.shown.info;
  const clouds = $('src-clouds');
  if (s && s.cloudTime && s.cloudTimeMs != null) {
    clouds.textContent = t('srcClouds', [s.credit, fmtKst(s.cloudTimeMs, Date.now()), fmtUtc(s.cloudTimeMs)]);
    clouds.dataset.source = s.credit;
    clouds.dataset.time = s.cloudTime;
    clouds.hidden = false;
  } else {
    clouds.hidden = true;
  }
  const night = $('src-night');
  night.textContent = t('srcNight', [fmtKst(OPEN_MS)]);
  night.dataset.source = 'computed · subsolar point, NOAA approximation (sun.js)';
  night.dataset.time = new Date(OPEN_MS).toISOString();
  night.hidden = false;
}

function renderStatus() {
  const s = view.shown && view.shown.info;
  const text = cloudStatus({
    online: navigator.onLine,
    shownCloud: s && s.cloudTime ? { timeMs: s.cloudTimeMs } : null,
    metaFeed: view.local.feeds && view.local.feeds.cloudMeta,
    nowMs: Date.now(),
    t,
  });
  const el = $('status');
  el.textContent = text || '';
  el.hidden = !text;
  el.dataset.state = !navigator.onLine ? 'offline' : (text ? 'notice' : 'ok');
}

function renderFacts() {
  const lines = buildFacts(view.local.feeds, {
    city: view.city, lang: LANG, nowMs: Date.now(), t,
    lines: view.local.settings && view.local.settings.lines,
  });
  const ul = $('facts');
  // 줄이 하나도 없으면(첫 설치로 아직 못 받음 · 전부 끔) 제목도 숨긴다 — 빈 칸을 보여 주지 않는다
  document.querySelector('.facts-heading').hidden = lines.length === 0;
  ul.hidden = lines.length === 0;
  ul.replaceChildren(...lines.map((l) => {
    const li = document.createElement('li');
    li.className = 'fact' + (l.status === 'fresh' || l.status === 'stale' ? ' value-el' : '');
    li.dataset.line = l.id;
    li.dataset.status = l.status;
    if (l.source) li.dataset.source = l.source;
    if (l.time) li.dataset.time = l.time;
    for (const p of l.parts) {
      const sp = document.createElement('span');
      sp.className = p.t;
      sp.textContent = p.text;
      li.append(sp);
    }
    if (l.windDirDeg != null) li.title = t('skyWindDirTitle', [String(l.windDirDeg)]);
    if (l.href && l.hrefText) {
      const a = document.createElement('a');
      a.className = 'ext'; a.href = l.href; a.target = '_self'; a.rel = 'noreferrer';
      a.textContent = l.hrefText;
      li.append(a);
    }
    return li;
  }));
}

function renderPlace() {
  $('place-label').textContent = t('placeLabel', [LANG === 'ko' ? view.city.ko : view.city.en]);
}

/* ── 시작 ─────────────────────────────────────────────────────────── */

async function main() {
  applyStaticText();
  const [local, comp, cities] = await Promise.all([
    getLocal(null).catch(() => ({})),
    getComposite().catch(() => null),
    loadCities(),
  ]);
  view.local = local || {};
  view.cities = cities;
  view.city = pickCity();
  renderPlace();

  // ① + ② 캐시 합성본(도시가 같을 때만 — 중심이 다른 그림 위에 밤을 그리면 어긋난다)
  if (comp && comp.info && Math.abs(comp.info.lon0 - view.city.lon) < 1e-6) {
    try { showFirst({ bitmap: await createImageBitmap(comp.blob), info: comp.info }); } catch { /* 깨진 캐시 → 아래에서 새로 만든다 */ }
  }
  if (!view.shown) showFirst(await buildComposite(view.city, DRAFT_SIZE));   // 첫 설치: 바탕(+쥔 구름) + 밤, 512 px 초안 → ⑤ 에서 1024 로
  performance.mark('earthus:first-paint');
  document.documentElement.dataset.firstPaintMs = performance.now().toFixed(1);
  document.documentElement.dataset.firstPaintFrom = comp && view.shown.info.key === comp.info.key ? 'cache' : 'built';

  // ③ 사실 카드 · 상태
  renderFacts();
  renderStatus();

  // ④ 받아 줘(기다리지 않는다)
  setLocal({ lastNewtabOpenAt: Date.now() }).catch(() => {});
  if (pageShouldAskRefresh(Date.now(), view.local.lastFetchAt, navigator.onLine)) {
    chrome.runtime.sendMessage({ type: 'earthus:refresh' }).catch(() => {});
  }
  // ⑤ 지금 쥔 구름이 그려진 것보다 새것이면 한 번 교체
  rebuildIfNeeded();

  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;
    if (!changes.feeds && !changes.cloud && !changes.settings) return;
    view.local = await getLocal(null);
    if (changes.settings) {
      const c = pickCity();
      if (c.id !== view.city.id) { view.city = c; renderPlace(); }
    }
    renderFacts();
    renderStatus();
    if (changes.cloud || changes.settings) rebuildIfNeeded();
  });
  window.addEventListener('online', renderStatus);
  window.addEventListener('offline', renderStatus);
  // (2026-09-24 검수 추가) 열어 둔 새 탭으로 돌아왔을 때 — 사고가 될 뻔한 것: 새 탭을 띄워 둔 채 다른 탭에서 2시간 넘게 일하면
  //   알람이 받기를 멈추고(새 탭 2시간 조건) 저장소가 안 바뀌어 화면이 다시 그려지지 않는다. 돌아와 보면 16:02 자료로
  //   '지금 발효 중인 기상특보 없음' 이 18:30 에도 그대로였다 — 지시서 §4-2 '45분 넘으면 없음이라 말하지 않는다' 위반.
  //   그래서 다시 보일 때 한 번: 문장을 지금 시각으로 다시 판정(늙었으면 '지연')하고, 본 시각을 적고, 오래됐으면 받기를 청한다.
  //   이벤트 한 번에 한 번 그릴 뿐 — 타이머·rAF 없음(HANDOVER §5).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !view.shown) return;
    const now = Date.now();
    setLocal({ lastNewtabOpenAt: now }).catch(() => {});
    if (pageShouldAskRefresh(now, view.local.lastFetchAt, navigator.onLine)) {
      chrome.runtime.sendMessage({ type: 'earthus:refresh' }).catch(() => {});
    }
    if (now - OPEN_MS > SUN_RECALC_AFTER_MS) {
      OPEN_MS = now;
      SUN = subsolarPoint(new Date(now));
      view.night.clear();
      paint(layers()[view.layer], view.shown);
      renderCredits();
    }
    renderFacts();
    renderStatus();
  });
  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (view.shown) paint(layers()[view.layer], view.shown); }, 120);
  });
  $('place-change').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
}

main().catch((e) => {
  document.documentElement.dataset.error = String(e && e.message || e);
});
