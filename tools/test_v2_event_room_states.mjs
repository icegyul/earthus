// 지시서 A-2·A-3·C-2 — 소스 상태 5분법, 특보 구역 연관 2단계, 기관별 행. F02(실패→없음)·F03(지역 연관)·F08(대표값).
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { EventRoom, SOURCE_STATE } = await import('../prototype/v2-three/js/event-room.js');

const NOW = Date.parse('2026-09-05T03:00:00Z');
const busanTC = { kind: 'TC', title: '열대저기압 KROVANH-26', stormName: 'KROVANH', lat: 34.0, lon: 129.0, whenT: NOW - 3600000, alert: 'Orange', where: 'Korea', source: 'GDACS (JRC/UN)', facts: [['경보', 'Orange']] };
const farTC = { ...busanTC, lat: 15.0, lon: -110.0, where: 'Mexico' };
const regions = { regions: { S1312020: { name: '남해동부바깥먼바다', lat: 34.4, lon: 129.2 }, L1061610: { name: '군산', lat: 35.96, lon: 126.65 }, S1700000: { name: '동해중부', lat: 38.0, lon: 130.5 } } };
const warnOK = { generated: '2026-09-05T02:50:00Z', active: [
  { region: '남해동부바깥먼바다', regionId: 'S1312020', kind: '풍랑', level: '경보', levelRank: 2, issuedKst: '202609051000' },
  { region: '동해중부', regionId: 'S1700000', kind: '강풍', level: '주의보', levelRank: 1, issuedKst: '202609050900' },
], upcoming: [] };
const empty = { generated: '2026-09-05T02:50:00Z', active: [], upcoming: [] };
const nothing = { storms: [], stations: [], districts: [], alerts: [] };

const roomWith = (table) => new EventRoom({ now: () => NOW, fetchJson: async (url) => {
  const key = Object.keys(table).find((k) => url.includes(k));
  const v = key ? table[key] : nothing;
  if (v instanceof Error) throw v;
  return v;
} });

test('특보 조회가 실패하면 행동 칸은 "조회 불가"이고 절대 "없음"이 아니다', async () => {
  const room = roomWith({ 'kma-warn.json': new Error('timeout'), 'kma-warn-regions': regions });
  room.clearCache();
  const html = await room.build(busanTC);
  assert.equal(room.warnState, SOURCE_STATE.FAILED);
  assert.match(room.last.tl.action, /특보 조회 불가/);
  assert.doesNotMatch(room.last.tl.action, /특보 없음/);
  assert.match(html, /room-src none fail|room-src fail/);
  assert.match(html, /재시도/);
});

test('특보가 정상 0건이면 "관련 유형 특보 없음 (전체 N건)"과 자료 시각', async () => {
  const room = roomWith({ 'kma-warn.json': empty, 'kma-warn-regions': regions });
  room.clearCache();
  await room.build(busanTC);
  assert.equal(room.warnState, SOURCE_STATE.EMPTY);
  assert.match(room.last.tl.action, /관련 유형 특보 없음 \(전체 발효 0건 · 02:50Z 자료\)/);
});

test('구역 중심 350 km 안이면 RELATED 로 행동 칸에 오르고 거리를 적는다; 밖이면 DOMESTIC', async () => {
  const room = roomWith({ 'kma-warn.json': warnOK, 'kma-warn-regions': regions });
  room.clearCache();
  await room.build(busanTC);
  assert.equal(room.warnState, 'RELATED');
  assert.match(room.last.tl.action, /풍랑 경보 발효 중.*남해동부바깥먼바다 \(\d+ km\)/);
  // 사건을 서해 먼 바다(구역 중심에서 350 km 밖)로 옮기면 DOMESTIC
  const far = roomWith({ 'kma-warn.json': warnOK, 'kma-warn-regions': regions });
  far.clearCache();
  await far.build({ ...busanTC, lat: 31.0, lon: 122.0 });
  assert.equal(far.warnState, 'DOMESTIC');
  assert.match(far.last.tl.action, /구역 관계는 확인되지 않음/);
});

test('한반도 밖 사건은 OUT_OF_SCOPE — 범위 밖이라고 적고 특보를 판단하지 않는다', async () => {
  const room = roomWith({ 'kma-warn.json': warnOK });
  room.clearCache();
  await room.build(farTC);
  assert.equal(room.warnState, SOURCE_STATE.OUT_OF_SCOPE);
  assert.match(room.last.tl.action, /한반도 밖 사건/);
});

test('3시간 넘은 특보 자료는 STALE 로 나이를 병기한다', async () => {
  const room = roomWith({ 'kma-warn.json': { ...empty, generated: '2026-09-04T20:00:00Z' }, 'kma-warn-regions': regions });
  room.clearCache();
  await room.build(busanTC);
  assert.equal(room.sources.warn.state, SOURCE_STATE.STALE);
  assert.match(room.last.rows.find((r) => r.agency === '기상청 특보').sub, /STALE · 4\d\d분 전 자료/);
});

test('공식 트랙은 기관마다 한 행 — 이름만 합치고 첫 기관 값만 쓰지 않는다', async () => {
  const off = { generated: '2026-09-05T02:00:00Z', storms: [{ key: 'KROVANH', name: 'Krovanh', firstIssuedAt: '2026-09-05T00:00:00Z', agencies: [
    { agency: 'KMA', agencyKo: '한국 기상청', issue: '2026-09-05T00:00:00Z', steps: [{ h: 0, lat: 34.0, lon: 129.0, windMs: 24, hpa: 990, place: '부산 남쪽' }, { h: 24, lat: 36.0, lon: 130.0, windMs: 21 }] },
    { agency: 'JMA', agencyKo: '일본 기상청', issue: '2026-09-05T00:45:00+09:00', steps: [{ h: 0, lat: 34.1, lon: 129.1, windMs: 20, categoryKo: '열대폭풍' }, { h: 24, lat: 36.5, lon: 130.6, windMs: 18 }] },
  ] }] };
  const room = roomWith({ 'typhoon-official.json': off, 'kma-warn.json': empty, 'kma-warn-regions': regions });
  room.clearCache();
  await room.build(busanTC);
  const agencies = room.last.rows.map((r) => r.agency);
  assert.ok(agencies.includes('한국 기상청') && agencies.includes('일본 기상청'), agencies.join(','));
  const jma = room.last.rows.find((r) => r.agency === '일본 기상청');
  assert.match(jma.sub, /등급 열대폭풍 · 한국 기상청 대비 \+24h 위치 차 \d+ km/);
});

test('기상청 발표가 stale(허브 조회 실패 → 직전 발표 유지)이면 행이 사라지지 않고 그렇게 적힌다', async () => {
  const empty = { generated: '2026-09-05T02:00:00Z', active: [] };
  const regions = { regions: {} };
  const off = { generated: '2026-09-05T02:00:00Z', kmaState: 'QUOTA_EXHAUSTED', storms: [{ key: 'KROVANH', name: 'Krovanh', agencies: [
    { agency: 'KMA', agencyKo: '한국 기상청', issue: '2026-09-05T00:00:00Z', stale: true, staleReason: 'QUOTA_EXHAUSTED', staleOrigin: 'archive', steps: [{ h: 0, lat: 34.0, lon: 129.0, windMs: 24, hpa: 990 }, { h: 24, lat: 36.0, lon: 130.0, windMs: 21 }] },
    { agency: 'JMA', agencyKo: '일본 기상청', issue: '2026-09-05T00:45:00+09:00', steps: [{ h: 0, lat: 34.1, lon: 129.1, windMs: 20 }, { h: 24, lat: 36.5, lon: 130.6, windMs: 18 }] },
  ] }] };
  const { EventRoom } = await import('../prototype/v2-three/js/event-room.js');
  const room = new EventRoom({ fetchJson: async (url) => (/typhoon-official/.test(url) ? off : /kma-warn-regions/.test(url) ? regions : /kma-warn/.test(url) ? empty : { generated: '2026-09-05T02:00:00Z', stations: [], storms: [], alerts: [] }), now: () => Date.parse('2026-09-05T02:30:00Z') });
  room.clearCache();
  const html = await room.build({ kind: 'TC', id: 'tc-1', eventid: 1, episodeid: 1, stormName: 'KROVANH', title: '열대저기압 KROVANH-26', where: 'Japan', lat: 34.0, lon: 129.0, whenT: Date.parse('2026-09-05T00:00:00Z'), time: {}, facts: [] });
  assert.ok(room.last.rows.some((r) => r.agency === '한국 기상청' && /직전 발표 유지/.test(r.what)), '기상청 stale 행이 없다');
  assert.match(html, /발표 09-05T00:00 · 직전 발표 유지\(허브 조회 실패\)/);
});
