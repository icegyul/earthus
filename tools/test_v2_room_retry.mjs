// 지시서 A-2 후속 — 사건 방 '재시도'는 실패한 소스만 다시 받는다(부분 재조회).
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { EventRoom } = await import('../prototype/v2-three/js/event-room.js');

test('두 번째 build 는 실패했던 소스만 다시 요청한다', async () => {
  const calls = [];
  let warnFails = true;
  const fetchJson = async (url) => {
    calls.push(url);
    if (/kma-warn\.json/.test(url) && warnFails) throw new Error('503');
    return { generated: new Date().toISOString(), features: [], active: [], tracks: [], stations: [], regions: {} };
  };
  const room = new EventRoom({ fetchJson, now: () => Date.now() });
  room.clearCache();
  const it = { kind: 'EQ', id: 'eq-1', title: 'M5.0 지진', lat: 33.0, lon: 131.0, whenT: Date.now(), time: {}, facts: [] };
  await room.build(it);
  const first = calls.length;
  assert.ok(first >= 3, `first round fetched ${first}`);
  assert.ok(calls.some((u) => /kma-warn\.json/.test(u)));
  warnFails = false;
  calls.length = 0;
  await room.build(it);                     // 재시도 — clearCache 없이
  assert.deepEqual(calls.filter((u) => !/kma-warn\.json/.test(u)), [], `성공했던 소스를 다시 받았다: ${calls}`);
  assert.equal(calls.filter((u) => /kma-warn\.json/.test(u)).length, 1);
});
