// 지시서 E — 내 장소 감시: 조건 3종·dedupe·소스 실패 시 "감시 중단".
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { evaluateWatch, myZone, kmBetween } = await import('../prototype/v2-three/js/watch.js');

const place = { lat: 35.18, lon: 129.08 };   // 부산
const stations = [{ name: '부산', lat: 35.1, lon: 129.03, zone: 'L1150000', zoneName: '부산' }, { name: '서울', lat: 37.57, lon: 126.98, zone: 'L1100000', zoneName: '서울' }];
const now = Date.parse('2026-09-05T09:00:00Z');
const warnOk = { state: 'OK', active: [
  { regionId: 'L1082500', parentId: 'L1150000', kind: '강풍', level: '주의보', issuedKst: '202609051610' },
  { regionId: 'L1073120', parentId: 'L1073100', kind: '강풍', level: '주의보', issuedKst: '202609051610' },
] };

test('내 구역은 가장 가까운 지점의 구역이고 거리(근사)를 함께 준다', () => {
  const z = myZone(place, stations);
  assert.equal(z.zone, 'L1150000');
  assert.ok(z.km < 15 && z.station === '부산');
  assert.ok(Math.abs(kmBetween(place, { lat: 37.57, lon: 126.98 }) - 325) < 15);
});

test('특보 소스가 실패하면 SUSPENDED — 특보 0건으로 바꾸지 않는다', () => {
  const r = evaluateWatch({ place, zone: myZone(place, stations), warn: { state: 'FAILED' }, now });
  assert.equal(r.monitoring, 'SUSPENDED');
  assert.match(r.reason, /조회 불가/);
  assert.equal(r.hits.length, 0);
});

test('내 구역(부모 구역 포함)에 발효된 특보만 잡고, 같은 특보는 두 번 적지 않는다', () => {
  const zone = myZone(place, stations);
  const r1 = evaluateWatch({ place, zone, warn: warnOk, now });
  assert.equal(r1.monitoring, 'ON');
  assert.equal(r1.hits.length, 1);
  assert.equal(r1.hits[0].conditionId, 'zone-warning');
  assert.match(r1.hits[0].reasonKo, /부산.*강풍 주의보/);
  const seen = new Set(r1.hits.map((h) => h.dedupeKey));
  const r2 = evaluateWatch({ place, zone, warn: warnOk, seen, now });
  assert.equal(r2.hits.length, 0);
});

test('팔로우한 사건의 새 회차는 lastRevisionAt 로 한 번만', () => {
  const events = [{ eventId: 'cyclone:1', name: 'AAA-26', lastRevisionAt: '2026-09-05T07:00:00Z', changeSummaryKo: '실황 21→24 m/s 강화' }];
  const r = evaluateWatch({ place, zone: null, warn: warnOk, events, now });
  assert.equal(r.hits.filter((h) => h.conditionId === 'follow-revision').length, 1);
  const seen = new Set(r.hits.map((h) => h.dedupeKey));
  assert.equal(evaluateWatch({ place, zone: null, warn: warnOk, events, seen, now }).hits.length, 0);
});

test('400 km 안 M5+ 24시간 안 지진만 — 멀거나 작거나 오래된 것은 제외', () => {
  const q = (id, lat, lon, mag, ageH) => ({ id, lat, lon, title: `M${mag} 지진`, whenT: now - ageH * 3600000, facts: [['규모', `M${mag}`]] });
  const quakes = [q('a', 33.0, 131.0, 5.4, 2), q('b', 33.0, 131.0, 4.2, 2), q('c', 25.0, 140.0, 6.0, 2), q('d', 33.0, 131.0, 5.5, 40)];
  const r = evaluateWatch({ place, zone: null, warn: warnOk, quakes, now });
  assert.deepEqual(r.hits.map((h) => h.eventId), ['a']);
  assert.match(r.hits[0].reasonKo, /km 거리 M5.4 지진/);
});
