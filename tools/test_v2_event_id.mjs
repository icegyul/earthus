// PHASE 2 STEP 2.1 — 사건 id 정본화.
// 왜: 사건 방을 배열 인덱스로 열고 있었다(feed-open data-idx). 목록은 정착할 때마다 재정렬되므로
//     사용자가 누른 항목과 열리는 항목이 어긋날 수 있었다. 이 시험은 그 회귀를 막는다.
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { IntelFeed } = await import('../prototype/v2-three/js/intel-feed.js');

function harness() {
  const scene = { add() {}, remove() {} };
  const feed = new IntelFeed(scene, (s) => `[${s}]`);
  feed.room = { build: async () => '<div>room</div>' };
  // 이 시험은 '어느 사건이 열리는가'만 본다. 요청은 즉시 빈 응답으로 닫아 열린 핸들을 남기지 않는다.
  feed.fetchJson = async () => ({ features: [], storms: [], events: [] });
  feed.items = [
    { id: 'tc-1', kind: 'TC', eventid: 1, episodeid: 1, stormName: 'AAA', title: '열대저기압 AAA', lat: 20, lon: 130, whenT: 1, alert: 'Green', facts: [] },
    { id: 'eq-2', kind: 'EQ', title: 'M5.0 지진', lat: 35, lon: 135, whenT: 2, alert: 'Green', facts: [] },
    { id: 'eq-3', kind: 'EQ', title: 'M6.0 지진', lat: 10, lon: 100, whenT: 3, alert: 'Orange', facts: [] },
  ];
  return { feed, orbit: { yaw: 0, pitch: 0 } };
}

test('목록이 재정렬돼도 selectById 는 같은 사건을 연다', async () => {
  const { feed, orbit } = harness();
  await feed.selectById('eq-3', orbit);
  assert.equal(feed.selected.id, 'eq-3');

  // 정착 후 재정렬을 흉내낸다 — 인덱스는 뒤집히고 id 는 그대로다.
  feed.items.reverse();
  await feed.selectById('eq-3', orbit);
  assert.equal(feed.selected.id, 'eq-3', '재정렬 뒤 다른 사건이 열렸다');
});

test('없는 사건 id 는 조용히 아무 것도 열지 않는다', async () => {
  const { feed, orbit } = harness();
  await feed.selectById('tc-1', orbit);
  await feed.selectById('없는-사건', orbit);
  assert.equal(feed.selected.id, 'tc-1', '없는 id 가 선택을 지웠다');
});

test('목록 HTML 은 인덱스가 아니라 정본 사건 id 로 주소를 잡는다', () => {
  const { feed } = harness();
  feed.view = 'list';
  feed.state = 'ready';        // 기본값은 'loading' 이라 목록 대신 로딩 카드가 나온다
  feed.showResolved = true;    // '지난 사건' 접힘에 걸리지 않게 전부 그린다
  const html = feed.html();
  assert.ok(!/data-idx=/.test(html), 'data-idx 가 아직 남아 있다 — 재정렬되면 엉뚱한 사건이 열린다');
  assert.ok(/data-event-id="tc-1"/.test(html), 'tc-1 주소가 없다');
  assert.ok(/data-event-id="eq-3"/.test(html), 'eq-3 주소가 없다');
});

test('수집한 사건은 기계가 읽는 출처 신원을 함께 들고 온다', () => {
  const { feed } = harness();
  feed.items = [];
  feed.ingestEQ({ features: [{ id: 'us7000abcd', geometry: { type: 'Point', coordinates: [130, 35, 10] }, properties: { mag: 5.2, place: 'x', time: 1785000000000, updated: 1785000009999 } }] });
  const eq = feed.items[0];
  assert.equal(eq.id, 'eq-us7000abcd');
  assert.equal(eq.sourceSystem, 'usgs');
  assert.equal(eq.sourceEventId, 'us7000abcd');
  assert.equal(typeof eq.revision, 'number');
  // 사람에게 보여주는 표기와 기계가 읽는 신원은 서로 다른 필드다 — 섞으면 배지가 거짓말한다.
  assert.equal(eq.source, 'USGS');

  feed.items = [];
  feed.ingestTC({ features: [{ geometry: { type: 'Point', coordinates: [130, 20] }, properties: { eventid: 1234, episodeid: 7, eventname: 'SAUDEL-26', alertlevel: 'Orange', fromdate: '2026-09-01', todate: '2026-09-03' } }] });
  const tc = feed.items[0];
  assert.equal(tc.id, 'tc-1234');
  assert.equal(tc.sourceSystem, 'gdacs');
  assert.equal(tc.sourceEventId, '1234');
  assert.equal(tc.revision, 7, 'GDACS episodeid 를 개정 번호로 들고 있어야 한다');
});

test('같은 사건이 갱신돼도 정본 id 는 유지된다', () => {
  const { feed } = harness();
  const mk = (episode, todate) => ({ features: [{ geometry: { type: 'Point', coordinates: [130, 20] }, properties: { eventid: 1234, episodeid: episode, eventname: 'SAUDEL-26', alertlevel: 'Orange', fromdate: '2026-09-01', todate } }] });
  feed.items = []; feed.ingestTC(mk(7, '2026-09-03'));
  const first = feed.items[0];
  feed.items = []; feed.ingestTC(mk(8, '2026-09-04'));
  const second = feed.items[0];
  assert.equal(second.id, first.id, '회차가 오르자 새 사건이 되어버렸다');
  assert.ok(second.revision > first.revision, '개정 번호가 오르지 않았다');
});

test('원본 MAP 폴백에서 같은 태풍의 회차가 여러 건 와도 최신 회차 하나만 남는다', () => {
  const { feed } = harness();
  const pt = (ep, name) => ({ geometry: { type: 'Point', coordinates: [130, 20] }, properties: { eventid: 1234, episodeid: ep, eventname: name, alertlevel: 'Orange', fromdate: '2026-09-01', todate: '2026-09-03' } });
  feed.items = [];
  feed.ingestTC({ features: [pt(5, 'A-26'), pt(9, 'A-26'), pt(7, 'A-26')] });
  const tcs = feed.items.filter((x) => x.kind === 'TC' && x.eventid === 1234);
  assert.equal(tcs.length, 1, '같은 태풍이 여러 건 남았다 — 지구에 옛 회차 트랙이 그려진다');
  assert.equal(tcs[0].episodeid, 9, '상류 규칙(회차 최댓값)과 다르다');
  assert.equal(tcs[0].revision, 9);
});
