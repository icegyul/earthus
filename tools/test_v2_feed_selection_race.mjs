// 지시서 B — 사건 전환 경쟁(F04). A 를 눌렀다 B 를 누르면 A 의 늦은 이력·트랙이 B 위에 덮이지 않는다.
import { deferred } from './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { IntelFeed } = await import('../prototype/v2-three/js/intel-feed.js');

function harness() {
  const added = [];
  const scene = { add: (o) => added.push(o), remove() {} };
  const feed = new IntelFeed(scene, (s) => `[${s}]`);
  feed.room = { build: async () => '<div>room</div>' };
  const pending = [];
  feed.fetchJson = (url) => { const d = deferred(); pending.push({ url, ...d }); return d.promise; };
  feed.items = [
    { id: 'tc-1', kind: 'TC', eventid: 1, episodeid: 1, stormName: 'AAA', title: '열대저기압 AAA', lat: 20, lon: 130, whenT: 1, alert: 'Green', facts: [] },
    { id: 'eq-2', kind: 'EQ', title: 'M5.0 지진', lat: 35, lon: 135, whenT: 2, alert: 'Green', facts: [['규모', 'M5.0']] },
  ];
  const orbit = { yaw: 0, pitch: 0 };
  return { feed, pending, added, orbit };
}

test('B 를 고른 뒤 도착한 A 의 이력은 버려지고, A 의 트랙은 지구에 올라가지 않는다', async () => {
  const { feed, pending, added, orbit } = harness();
  const selA = feed.select(0, orbit);            // A: 공식 발표(past) + GDACS 트랙 두 요청이 걸린다
  await new Promise((r) => setTimeout(r, 5));
  const aPast = pending.find((p) => /typhoon-official/.test(p.url));
  const aTrack = pending.find((p) => /getgeometry/.test(p.url));
  assert.ok(aPast && aTrack, '두 요청이 열려 있어야 한다');
  feed.select(1, orbit);                         // B 선택 — A 요청은 세대가 지났다
  await new Promise((r) => setTimeout(r, 5));
  const bPast = pending.find((p) => /fdsnws/.test(p.url));
  bPast.resolve({ features: [{ properties: { mag: 4.1, place: 'near', time: 1 } }] });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(feed.past.kind, 'EQ');
  // 이제 A 의 늦은 응답이 도착한다
  aPast.resolve({ storms: [{ key: 'AAA', agencies: [{ agency: 'KMA', steps: [{ h: 0, windMs: 30 }] }] }] });
  aTrack.resolve({ features: [{ geometry: { type: 'LineString', coordinates: [[130, 20], [131, 21]] } }] });
  await selA; await new Promise((r) => setTimeout(r, 5));
  assert.equal(feed.past.kind, 'EQ', 'A 의 이력이 B 를 덮었다');
  assert.equal(added.length, 0, 'A 의 트랙이 지구에 올라갔다');
  assert.equal(feed.selected.id, 'eq-2');
});

test('피드로 돌아간 뒤 도착한 늦은 응답은 화면을 사건 방으로 되돌리지 않는다', async () => {
  const { feed, pending, orbit } = harness();
  const sel = feed.select(0, orbit);
  await new Promise((r) => setTimeout(r, 5));
  feed.back();
  const aPast = pending.find((p) => /typhoon-official/.test(p.url));
  aPast.resolve({ storms: [] });
  pending.find((p) => /getgeometry/.test(p.url)).resolve({ features: [] });
  await sel; await new Promise((r) => setTimeout(r, 5));
  assert.equal(feed.view, 'list');
  assert.equal(feed.past, null);
});
