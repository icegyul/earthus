// 지시서 A-1·A-4 — 시각 4분법과 피드 상태 5분법. 시각 없는 사건이 "방금"으로 보이던 F01, 부분 실패가 error 로 뭉치던 F05.
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { IntelFeed, iso, agoText } = await import('../prototype/v2-three/js/intel-feed.js');

const feedWith = (responses) => {
  const feed = new IntelFeed({ add() {}, remove() {} }, (s) => `[${s}]`);
  feed.fetchJson = async (url) => {
    const r = responses(url);
    if (r instanceof Error) throw r;
    return r;
  };
  return feed;
};
const tc = (over = {}) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [126.7, 27.7] },
  properties: { eventid: 1, episodeid: 9, eventname: 'KROVANH-26', alertlevel: 'Orange', country: 'Japan', fromdate: '2026-09-01T00:00:00', todate: '2026-09-05T00:00:00', ...over } });
const eq = (over = {}) => ({ type: 'Feature', id: 'us1', geometry: { coordinates: [130.6, 32.6, 8] }, properties: { mag: 6.8, place: 'Kumamoto', time: 1785000000000, url: 'https://earthquake.usgs.gov/x', ...over } });
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('시각이 없는 사건은 지금(Date.now)으로 채우지 않고 시각 미확인으로 남는다', async () => {
  const feed = feedWith((url) => (/gdacs/.test(url) ? { features: [tc({ fromdate: null, todate: null })] } : { features: [eq({ time: null })] }));
  await feed.load(); await settle();
  const t = feed.items.find((x) => x.kind === 'TC'), e = feed.items.find((x) => x.kind === 'EQ');
  assert.equal(t.time.issuedAt, null); assert.equal(t.time.updatedAt, null); assert.ok(t.time.retrievedAt);
  assert.ok(Number.isNaN(t.whenT)); assert.ok(Number.isNaN(e.whenT));
  assert.equal(e.time.occurredAt, null);
  assert.equal(e.facts[2][1], '시각 미확인');
  const html = feed.html();
  assert.doesNotMatch(html, /분 전|방금|min ago/);
  assert.match(html, /시각 미확인/);
});

test('정상 입력은 발생·발표·갱신·수집이 서로 다른 값으로 남고, 시각 없는 사건은 목록 맨 뒤', async () => {
  const feed = feedWith((url) => (/gdacs/.test(url) ? { features: [tc(), tc({ eventid: 2, eventname: 'NOTIME', fromdate: null, todate: null })] } : { features: [eq()] }));
  await feed.load(); await settle();
  const t = feed.items.find((x) => x.eventid === 1);
  assert.equal(t.time.issuedAt, '2026-09-01T00:00:00.000Z'); assert.equal(t.time.updatedAt, '2026-09-05T00:00:00.000Z');
  assert.notEqual(t.time.retrievedAt, t.time.updatedAt);
  assert.equal(feed.items[feed.items.length - 1].eventid, 2);
  assert.match(feed.timeLines(t), /발표 09-01 00:00Z · 갱신 09-05 00:00Z · 수집/);
  assert.equal(iso('garbage'), null); assert.equal(agoText(null), '시각 미확인');
});

test('한 출처만 실패하면 partial — 성공한 목록은 그대로, 실패한 출처는 조회 불가로 적힌다', async () => {
  const feed = feedWith((url) => (/gdacs/.test(url) ? { features: [tc()] } : new Error('timeout')));
  await feed.load(); await settle();
  assert.equal(feed.state, 'partial');
  assert.equal(feed.items.length, 1);
  assert.equal(feed.sources.usgs.state, 'FAILED'); assert.equal(feed.sources.gdacs.state, 'OK');
  assert.match(feed.html(), /USGS 조회 불가/);
  assert.match(feed.html(), /GDACS 1건/);
});

test('둘 다 정상 0건이면 empty — 실패와 다른 문장', async () => {
  const feed = feedWith(() => ({ features: [] }));
  await feed.load(); await settle();
  assert.equal(feed.state, 'empty');
  assert.match(feed.html(), /수집 범위에 사건이 없습니다/);
  assert.doesNotMatch(feed.html(), /조회 불가/);
});

test('재시도가 둘 다 실패하면 직전 목록을 이전 결과로 보존한다', async () => {
  let fail = false;
  const feed = feedWith((url) => (fail ? new Error('500') : /gdacs/.test(url) ? { features: [tc()] } : { features: [eq()] }));
  await feed.load(); await settle();
  assert.equal(feed.items.length, 2);
  fail = true;
  await feed.load(); await settle();
  assert.equal(feed.state, 'stale');
  assert.equal(feed.items.length, 2);
  assert.match(feed.html(), /이전 결과/);
});
