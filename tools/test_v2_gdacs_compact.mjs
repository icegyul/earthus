// PHASE 1 — GDACS 축약본 경로: 축약본 → 마지막 정상 축약본 → 원본 폴백. ingestTC 필드 계약 동일.
const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { IntelFeed } = await import('../prototype/v2-three/js/intel-feed.js');

const COMPACT = /events\/gdacs-tc\.json/;
const ORIGIN = /gdacs\.org.*geteventlist\/MAP/;
const tc = (id, name, alert = 'Green', ep = 2) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [126.7, 27.7] },
  properties: { eventid: id, episodeid: ep, eventname: name, name: `Tropical Cyclone ${name}`, alertlevel: alert, country: 'Japan', fromdate: '2026-09-01T00:00:00', todate: '2026-09-05T00:00:00' } });
const compactDoc = { type: 'FeatureCollection', generated: '2026-09-05T12:17:00Z', features: [tc(1, 'AAA-26', 'Orange'), tc(2, 'BBB-26')] };
const originDoc = { features: [tc(9, 'ORIGIN-26', 'Red'), { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { eventid: 9 } }] };

function feedWith(router) {
  const feed = new IntelFeed({ add() {}, remove() {} }, (s) => `[${s}]`);
  const urls = [];
  feed.fetchJson = async (url) => { urls.push(url); const r = router(url); if (r instanceof Error) throw r; return r; };
  feed.loadEvents = async () => {};
  feed.urls = urls;
  return feed;
}
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('TEST 1·2 축약본 정상 → 축약본만 쓰고 원본 MAP 은 요청하지 않는다', async () => {
  store.clear();
  const feed = feedWith((url) => (COMPACT.test(url) ? compactDoc : { features: [] }));
  await feed.load(); await settle();
  assert.equal(feed.items.filter((i) => i.kind === 'TC').length, 2);
  assert.ok(feed.urls.some((u) => COMPACT.test(u)));
  assert.ok(!feed.urls.some((u) => ORIGIN.test(u)), '원본 MAP 을 요청했다');
  assert.equal(feed.sources.gdacs.origin, 'compact');
  assert.ok(store.get('earthus.gdacs.last'), '마지막 정상 축약본을 저장하지 않았다');
});

test('TEST 3 축약본 실패 → 마지막 정상 축약본을 쓰고 원본은 부르지 않는다 · 상태 줄에 "이전 축약본"', async () => {
  const feed = feedWith((url) => (COMPACT.test(url) ? new Error('503') : { features: [] }));
  await feed.load(); await settle();
  assert.equal(feed.items.filter((i) => i.kind === 'TC').length, 2);
  assert.equal(feed.sources.gdacs.origin, 'cache');
  assert.ok(!feed.urls.some((u) => ORIGIN.test(u)));
  assert.match(feed.sourceNote(), /이전 축약본 09-05 12:17Z/);
});

test('TEST 4 축약본·캐시 모두 없음 → 원본 폴백 (Point 만 카드가 된다)', async () => {
  store.clear();
  const feed = feedWith((url) => (COMPACT.test(url) ? new Error('404') : ORIGIN.test(url) ? originDoc : { features: [] }));
  await feed.load(); await settle();
  const tcs = feed.items.filter((i) => i.kind === 'TC');
  assert.equal(tcs.length, 1); assert.equal(feed.sources.gdacs.origin, 'origin');
  assert.match(feed.sourceNote(), /원본 직접/);
});

test('TEST 5~8 축약본으로 만든 카드가 원본과 같은 필드를 낸다 (eventid·episodeid·좌표·alert)', async () => {
  store.clear();
  const a = feedWith((url) => (COMPACT.test(url) ? compactDoc : { features: [] }));
  await a.load(); await settle();
  const b = feedWith((url) => (COMPACT.test(url) ? new Error('x') : ORIGIN.test(url) ? { features: compactDoc.features } : { features: [] }));
  store.clear(); await b.load(); await settle();
  const pick = (it) => ({ id: it.id, eventid: it.eventid, episodeid: it.episodeid, lat: it.lat, lon: it.lon, alert: it.alert, title: it.title, stormName: it.stormName, where: it.where, whenT: it.whenT });
  assert.deepEqual(a.items.filter((i) => i.kind === 'TC').map(pick), b.items.filter((i) => i.kind === 'TC').map(pick));
  const it = a.items.find((i) => i.eventid === 1);
  assert.equal(it.episodeid, 2); assert.equal(it.lat, 27.7); assert.equal(it.lon, 126.7); assert.equal(it.alert, 'Orange');
});

test('TEST 9 회귀 — 축약본이 깨진 JSON(features 없음)이면 캐시/원본으로 넘어가고 카드 계약은 유지', async () => {
  store.clear();
  const feed = feedWith((url) => (COMPACT.test(url) ? { generated: 'x' } : ORIGIN.test(url) ? originDoc : { features: [] }));
  await feed.load(); await settle();
  assert.equal(feed.sources.gdacs.origin, 'origin'); assert.equal(feed.sources.gdacs.state, 'OK');
});

// PHASE 2 STEP 05 — 축약본 5xx / timeout / stale / 원본도 불가
test('축약본 5xx → 캐시 사용, 캐시 없으면 원본', async () => {
  store.clear();
  const feed = feedWith((url) => (COMPACT.test(url) ? new Error('503') : ORIGIN.test(url) ? originDoc : { features: [] }));
  await feed.load(); await settle();
  assert.equal(feed.sources.gdacs.origin, 'origin'); assert.equal(feed.items.filter((i) => i.kind === 'TC').length, 1);
});

test('축약본 timeout → 캐시가 있으면 캐시, 원본 요청 없음', async () => {
  store.set('earthus.gdacs.last', JSON.stringify({ generated: '2026-09-05T11:00:00Z', savedAt: 'x', features: compactDoc.features }));
  const feed = feedWith((url) => (COMPACT.test(url) ? new Error('timeout') : { features: [] }));
  await feed.load(); await settle();
  assert.equal(feed.sources.gdacs.origin, 'cache'); assert.ok(!feed.urls.some((u) => ORIGIN.test(u)));
  assert.match(feed.sourceNote(), /이전 축약본 09-05 11:00Z/);
});

test('축약본이 묵어도(generated 오래됨) 값은 쓰되 시각이 상태 줄에 남는다 — 최신으로 위장하지 않는다', async () => {
  store.clear();
  const stale = { ...compactDoc, generated: '2026-09-04T00:00:00Z' };
  const feed = feedWith((url) => (COMPACT.test(url) ? stale : { features: [] }));
  await feed.load(); await settle();
  assert.equal(feed.sources.gdacs.generated, '2026-09-04T00:00:00Z');
});

test('축약본·캐시·원본 모두 불가 → GDACS FAILED, 직전 목록 보존, 지어낸 사건 없음', async () => {
  store.clear();
  const ok = feedWith((url) => (COMPACT.test(url) ? compactDoc : { features: [] }));
  await ok.load(); await settle();
  store.clear();
  ok.fetchJson = async (url) => { if (COMPACT.test(url) || ORIGIN.test(url)) throw new Error('offline'); throw new Error('offline'); };
  await ok.load(); await settle(60);
  assert.equal(ok.sources.gdacs.state, 'FAILED');
  assert.equal(ok.state, 'stale');                                   // 둘 다 실패 → 직전 목록 유지
  assert.equal(ok.items.filter((i) => i.kind === 'TC').length, 2);
  assert.match(ok.sourceNote(), /조회 불가/); assert.doesNotMatch(ok.html(), /안전|위험 없음/);
});

test('폴백 경로(캐시/원본)로 왔으면 정상 상태여도 목록 위 상태 줄에 그 사실이 보인다', async () => {
  store.set('earthus.gdacs.last', JSON.stringify({ generated: '2026-09-05T11:00:00Z', savedAt: 'x', features: compactDoc.features }));
  const feed = feedWith((url) => (COMPACT.test(url) ? new Error('503') : { features: [] }));
  await feed.load(); await settle();
  assert.equal(feed.state, 'ready');
  assert.match(feed.html(), /이전 축약본 09-05 11:00Z/);
  store.clear();
  const f2 = feedWith((url) => (COMPACT.test(url) ? new Error('404') : ORIGIN.test(url) ? originDoc : { features: [] }));
  await f2.load(); await settle();
  assert.match(f2.html(), /원본 직접/);
});
