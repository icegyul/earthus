// 지시서 D-2·D-3 — Feed 카드 8필드·팔로우·정렬, 사건 방 비교·검증·NEXT 자동 채움.
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { IntelFeed } = await import('../prototype/v2-three/js/intel-feed.js');

const tc = (id, name, alert = 'Green') => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [126.7, 27.7] },
  properties: { eventid: id, episodeid: 1, eventname: name, alertlevel: alert, country: 'Japan', fromdate: '2026-09-01T00:00:00', todate: '2026-09-05T00:00:00' } });
const index = { generated: '2026-09-05T07:49:00Z', events: [
  { eventId: 'cyclone:1', gdacsId: '1', name: 'AAA-26', status: 'ACTIVE', changeSummaryKo: '한국 기상청 실황 21→24 m/s 강화', reasons: ['공식 경보 Orange', '한국 특보구역 120 km 안'], confidence: 'high', lastRevisionAt: '2026-09-05T07:00:00Z', nearestWarnRegionKm: 120 },
  { eventId: 'cyclone:2', gdacsId: '2', name: 'BBB-26', status: 'RESOLVED', changeSummaryKo: '변화 없음', reasons: ['GDACS 탐지'], confidence: 'low', lastRevisionAt: '2026-09-02T00:00:00Z', nearestWarnRegionKm: null },
] };
const packet = { eventId: 'cyclone:1', sessionStatus: 'ACTIVE', revisions: [
  { revisionId: 'r001', issuedAt: '2026-09-04T18:00:00Z', agencies: { KMA: { h0: { lat: 27, lon: 126, windMs: 21 }, h24: { lat: 28, lon: 126, windMs: 21 }, heading24Ko: '북' } }, changes: [], changeSummaryKo: '첫 회차' },
  { revisionId: 'r002', issuedAt: '2026-09-05T07:00:00Z', agencies: { KMA: { h0: { lat: 27.7, lon: 126.7, windMs: 24 }, h24: { lat: 28.5, lon: 127.5, windMs: 22 }, heading24Ko: '북동' }, JMA: { h0: { lat: 27.8, lon: 126.6, windMs: 20 }, h24: { lat: 28.4, lon: 127.3, windMs: 19 } } },
    changes: [{ field: 'KMA.h0.windMs', label: '실황 풍속', from: 21, to: 24, delta: 3 }], changeSummaryKo: '한국 기상청 실황 21→24 m/s 강화' },
], detail: { truthAgency: 'KMA', interimScores: [{ agency: 'KMA', n: 4, meanErrorKm: 60 }, { agency: 'EARTHUS_MULTI_SOURCE', n: 4, meanErrorKm: 150 }],
  headingScores: [{ agency: 'KMA', n: 4, meanErrDeg: 9, within45: 4 }, { agency: 'EARTHUS_MULTI_SOURCE', n: 4, meanErrDeg: 15, within45: 3 }] } };

function feedWith() {
  const added = [];
  const feed = new IntelFeed({ add: (o) => added.push(o), remove() {} }, (s) => `[${s}]`);
  feed.room = { build: async () => '<div>room</div>' };
  feed.fetchJson = async (url) => {
    if (/cyclone-events\.json/.test(url)) return index;
    if (/cyclone-events\/1\.json/.test(url)) return packet;
    if (/gdacs.*geteventlist/.test(url)) return { features: [tc(2, 'BBB-26', 'Orange'), tc(1, 'AAA-26', 'Green')] };
    if (/usgs/.test(url)) return { features: [] };
    if (/getgeometry/.test(url)) return { features: [] };
    return {};
  };
  return { feed, added };
}
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms));

test('카드에 바뀐 것·왜 지금·신뢰 배지가 붙고, 지난 사건은 접히며, 팔로우 사건은 맨 위', async () => {
  const { feed } = feedWith();
  await feed.load(); await tick();
  let html = feed.html();
  assert.match(html, /바뀐 것.*실황 21→24 m\/s 강화/);
  assert.match(html, /왜 지금.*공식 경보 Orange/);
  assert.match(html, /신뢰 高/);
  assert.match(html, /지난 사건 1건 보기/);
  assert.doesNotMatch(html.split('지난 사건')[0], /BBB-26/);
  // RESOLVED 인 BBB 가 Orange 라도 ACTIVE 인 AAA 보다 뒤
  assert.equal(feed.items[0].eventid, 1);
  feed.toggleFollow('tc-2'); html = feed.html();
  assert.equal(feed.items[0].eventid, 2, '팔로우한 사건이 맨 위');
  assert.match(html, /feed-item followed/);
});

test('사건 방: 비교 카드(회차 칩·변경·표)와 검증 카드(기준선 표기), NEXT 행이 채워지고 지구에 점선·실선이 오른다', async () => {
  const { feed, added } = feedWith();
  await feed.load(); await tick();
  await feed.select(feed.items.findIndex((x) => x.eventid === 1), { yaw: 0, pitch: 0 }); await tick(60);
  const html = feed.html();
  assert.match(html, /이전 발표와 비교.*r001 ⇄ r002/);
  assert.match(html, /실황 풍속: 21 → 24/);
  assert.match(html, /당시 전망 검증 \(잠정 · 한국 기상청 실황 기준\)/);
  assert.match(html, /EARTHUS 기준선/);
  assert.doesNotMatch(html, /순위|더 정확/);
  const next = feed.nextRows();
  assert.equal(next.length, 2); assert.equal(next[0].agency, 'KMA'); assert.equal(next[0].official, true);
  assert.equal(added.length, 2, '이전(점선)·현재(실선) 두 줄');
  feed.back();
  assert.equal(feed.revisionLines.length, 0);
});
