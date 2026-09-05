// 지시서 N-1 — 사건 방의 도달시간 행: 있음(한국 3곳·대조) / 없음(404 → 계산 대상 아님, 실패 아님) / 조회 실패.
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { EventRoom } = await import('../prototype/v2-three/js/event-room.js');

const eq = { kind: 'EQ', id: 'eq-us7000abcd', title: 'M7.2 지진', where: 'off Japan', lat: 38.3, lon: 142.4, whenT: Date.now() - 3600000, time: {}, facts: [['규모', 'M7.2']], depthKm: 20 };
const base = { generated: new Date().toISOString(), alerts: [], stations: [], active: [], regions: {} };
const eta = { schema: 'earthus.tsunami-eta.v1', badge: 'SIMULATION_ONLY', time: { computedAt: '2026-09-05T10:00:00Z' },
  stations: [{ iso: 'KOR', name: '강릉', etaMin: 210 }, { iso: 'KOR', name: '부산', etaMin: 246 }, { iso: 'KOR', name: '인천', etaMin: null, note: '격자에서 닿지 않음' }, { iso: 'JPN', name: '센다이', etaMin: 25 }],
  official: { matched: true, compare: [{ official: 'SENDAI', ours: '센다이', officialMin: 30, oursMin: 25, diffMin: -5 }], note: null },
  isochronesMin: { '30': [[[38.5, 142.9], [38.6, 143.0]]] } };

const build = async (etaBehaviour) => {
  const room = new EventRoom({ fetchJson: async (url) => {
    if (/tsunami-eta\//.test(url)) return etaBehaviour();
    return base;
  }, now: () => Date.now() });
  room.clearCache();
  return { html: await room.build(eq), room };
};

test('도달시간 파일이 있으면 한국 연안 3곳·대조 결과가 행에 적힌다', async () => {
  const { html, room } = await build(() => eta);
  assert.match(html, /EARTHUS 기준선/);
  assert.match(html, /강릉 \+210분 · 부산 \+246분/);
  assert.match(html, /센다이 \+25분/);
  assert.match(html, /PTWC 게시문 ETA 대조 1곳 · 평균 차 5분/);
  assert.match(html, /파고·침수 아님/);
  assert.equal(room.eta.schema, 'earthus.tsunami-eta.v1');
});

test('404 는 "계산 대상 아님" — 실패 행도, 안전 문구도 아니다', async () => {
  const { html, room } = await build(() => { throw new Error('HTTP 404'); });
  assert.match(html, /도달시간 계산 대상이 아닙니다/);
  assert.match(html, /위험이 없다는 뜻이 아닙니다/);
  assert.doesNotMatch(html, /쓰나미 도달시간 추정[\s\S]{0,300}재시도/);
  assert.equal(room.eta, null);
});

test('네트워크 실패는 조회 불가 + 재시도', async () => {
  const { html } = await build(() => { throw new Error('timeout'); });
  assert.match(html, /쓰나미 도달시간 추정[\s\S]{0,400}재시도/);
});
