import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildTravelCatalog, validateTravelCatalog, searchTravelCatalog, safeSourceUrl, TRAVEL_CATALOGS } from '../prototype/v2-three/js/travel-catalog.js';
import { TravelScene } from '../prototype/v2-three/js/travel.js';

const source = (mode, items) => ({ provider: 'KTO', schemaVersion: 'earthus.kto-normalized.v1', service: TRAVEL_CATALOGS[mode].service,
  semanticType: TRAVEL_CATALOGS[mode].type, state: 'AVAILABLE', fetchedAt: '2026-09-04T21:00:35Z',
  provenance: { sourceName: '한국관광공사', sourceUrl: 'https://www.data.go.kr/data/15101897/openapi.do' }, items });
const place = (id, title, extra = {}) => ({ externalContentId: id, title, position: { lat: 37.5, lon: 127 }, officialFields: { addr1: '서울특별시 종로구', showflag: '1' }, ...extra });

test('catalog retains actual content IDs and source times, excludes hidden/duplicate rows and sensitive fields', () => {
  const doc = source('bf', [place('1', '첫 장소', { apiKey: 'never', officialFields: { addr1: '서울', showflag: '1', serviceKey: 'never', orgImage: 'never' } }),
    place('2', '숨김', { showFlag: '0' }), place('1', '중복')]);
  const result = buildTravelCatalog(doc, 'bf');
  assert.equal(result.items.length, 1); assert.equal(result.sourceItemCount, 3);
  assert.equal(result.items[0].id, '1'); assert.equal(result.fetchedAt, doc.fetchedAt);
  assert.equal(result.detailState, 'NOT_FETCHED'); assert.equal(result.items[0].accessibility, undefined);
  assert.doesNotMatch(JSON.stringify(result), /never|serviceKey|orgImage|apiKey/);
});

test('missing, mismatched and same-name accessibility details never become facility facts', () => {
  const doc = source('bf', [place('1', '동일한 이름'), place('2', '동일한 이름')]);
  const details = { provider: 'KTO', service: 'barrierFree', operation: 'detailWithTour2', state: 'AVAILABLE', fetchedAt: '2026-09-03T00:00:00Z',
    items: [{ externalContentId: '1', officialFacts: { restroom: '장애인 화장실 있음', token: 'never' } }] };
  const joined = buildTravelCatalog(doc, 'bf', { detailDocument: details });
  assert.equal(joined.items[0].accessibility.restroom, '장애인 화장실 있음');
  assert.equal(joined.items[1].accessibility, undefined);
  assert.equal(joined.items[0].accessibility.token, undefined);
  const unrelated = buildTravelCatalog(doc, 'bf', { detailDocument: { ...details, service: 'english' } });
  assert.equal(unrelated.items[0].accessibility, undefined);
});

test('purpose schema does not accept another service or invalid source timestamps', () => {
  assert.throws(() => buildTravelCatalog(source('wl', [place('1', '한 곳')]), 'bf'));
  assert.throws(() => buildTravelCatalog({ ...source('bf', []), fetchedAt: null }, 'bf'));
  assert.throws(() => buildTravelCatalog({ ...source('bf', []), state: 'UNAVAILABLE' }, 'bf'));
  assert.equal(safeSourceUrl('javascript:alert(1)'), null);
  assert.equal(safeSourceUrl('https://user:password@example.com'), null);
});

test('address and name searches are case-insensitive, paginated and clear empty results', () => {
  const catalog = buildTravelCatalog(source('en', Array.from({ length: 27 }, (_, i) => place(String(i), `Seoul Museum ${i}`))), 'en');
  assert.equal(searchTravelCatalog(catalog, 'SEOUL 2').total, 9);
  assert.equal(searchTravelCatalog(catalog, '종로구').total, 27);
  assert.equal(searchTravelCatalog(catalog, '', 1).items.length, 3);
  assert.equal(searchTravelCatalog(catalog, '없음', 9).total, 0);
  assert.equal(searchTravelCatalog(catalog, '없음', 9).page, 0);
});

function stubScene() {
  const scene = Object.create(TravelScene.prototype);
  Object.assign(scene, { mode: null, requestId: 0, controller: null, catalogs: new Map(), group: { visible: false },
    build() { this.buildCount = (this.buildCount || 0) + 1; }, clear() {}, catalog: null, error: null, busy: false });
  return scene;
}

test('a slow previous purpose response cannot overwrite the newest menu', async () => {
  const original = globalThis.fetch;
  let finishBarrier;
  globalThis.fetch = url => {
    const mode = String(url).includes('barrier-free') ? 'bf' : 'wl';
    const response = { ok: true, json: async () => buildTravelCatalog(source(mode, [place(mode, `${mode} 장소`)]), mode) };
    return mode === 'bf' ? new Promise(resolve => { finishBarrier = () => resolve(response); }) : Promise.resolve(response);
  };
  try {
    const scene = stubScene();
    const first = scene.setMode('bf');
    const second = await scene.setMode('wl');
    finishBarrier();
    assert.equal((await first).stale, true); assert.equal(second.on, true);
    assert.equal(scene.mode, 'wl'); assert.equal(scene.catalog.mode, 'wl'); assert.equal(scene.buildCount, 1);
  } finally { globalThis.fetch = original; }
});

test('failed request is not an empty catalog and retry can recover', async () => {
  const original = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = async () => ++attempt === 1 ? { ok: false, status: 503 }
    : { ok: true, json: async () => buildTravelCatalog(source('bf', [place('1', '실제 장소')]), 'bf') };
  try {
    const scene = stubScene();
    assert.equal((await scene.setMode('bf')).error, true); assert.equal(scene.catalog, null);
    assert.match(scene.sceneCard(), /불러오지 못했습니다/); assert.doesNotMatch(scene.sceneCard(), /검색 결과 0/);
    assert.equal((await scene.retry()).on, true); assert.equal(scene.error, null); assert.equal(scene.catalog.items.length, 1);
  } finally { globalThis.fetch = original; }
});

test('each generated catalog contains usable places and provenance without credentials or media', async () => {
  for (const [mode, config] of Object.entries(TRAVEL_CATALOGS)) {
    const raw = await readFile(new URL(`../prototype/v2-three/data/tourism/${config.file}`, import.meta.url), 'utf8');
    const catalog = validateTravelCatalog(JSON.parse(raw), mode);
    assert.ok(catalog.items.length > 0); assert.match(catalog.sourceSha256, /^[a-f0-9]{64}$/);
    assert.ok(catalog.items.some(item => item.location && item.address));
    assert.doesNotMatch(raw, /"(?:serviceKey|apiKey|password|accessToken|orgImage|thumbImage)"/i);
    const scene = stubScene(); scene.mode = mode; scene.catalog = catalog; scene.query = ''; scene.page = 0;
    assert.match(scene.sceneCard(), /관광지 이름·주소 검색/); assert.doesNotMatch(scene.sceneCard(), /목적 밀도 0.6/);
    assert.match(scene.placeCard(catalog.items[0]), /공식 콘텐츠 ID/);
    if (mode === 'bf') assert.match(scene.placeCard(catalog.items[0]), /아직 수집되지 않았습니다/);
  }
});
