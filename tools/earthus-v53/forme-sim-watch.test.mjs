// FOR ME × 시뮬레이션 (계약 §I · 2026-09-20) — 내 장소 감시의 넷째 조건: 쓰나미 도달시간 계산.
// 색인 모양은 운영 ocean/tsunami-eta.json(earthus.tsunami-eta-index.v1) 그대로다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const w = await import('../../prototype/v2-three/js/watch.js');
const main = readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8');

const NOW = Date.parse('2026-09-20T03:00:00Z');
const BUSAN = { lat: 35.18, lon: 129.08 };
const entry = (over = {}) => ({ usgsId: 'us7000test', mag: 7.4, place: 'off Kyushu', originUtc: '2026-09-20T02:10:00Z',
  computedAt: '2026-09-20T02:25:00Z', nearestKorea: { iso: 'KOR', name: '부산', lat: 35.10, lon: 129.04, etaMin: 95 }, ...over });
const base = { place: BUSAN, zone: null, warn: { state: 'OK', active: [] }, now: NOW };

test('계산된 한국 연안 첫 도달이 내 장소 300 km 안이면 적는다 — 시뮬레이션이고 공식 경보가 아니라고', () => {
  const { hits } = w.evaluateWatch({ ...base, tsunamiEta: [entry()] });
  assert.equal(hits.length, 1);
  const h = hits[0];
  assert.equal(h.conditionId, 'tsunami-eta-sim');
  assert.equal(h.simulation, true);
  assert.equal(h.official, false);
  assert.equal(h.runRef, 'tsunami-eta:us7000test');
  assert.match(h.reasonKo, /부산 약 95분/);
  assert.match(h.reasonKo, /공식 경보 아님/);
});

test('없는 계산을 만들지 않는다 — 한국에 닿지 않음·오래됨·멀리 있음이면 적지 않는다', () => {
  assert.equal(w.evaluateWatch({ ...base, tsunamiEta: [entry({ nearestKorea: null })] }).hits.length, 0);
  assert.equal(w.evaluateWatch({ ...base, tsunamiEta: [entry({ computedAt: '2026-09-18T13:06:30Z' })] }).hits.length, 0);
  const seoulFar = { ...base, place: { lat: 37.57, lon: 126.98 } };   // 부산 연안 지점에서 약 330 km
  assert.equal(w.evaluateWatch({ ...seoulFar, tsunamiEta: [entry()] }).hits.length, 0);
});

test('같은 사건은 한 번만', () => {
  const seen = new Set(['tsu:us7000test']);
  assert.equal(w.evaluateWatch({ ...base, tsunamiEta: [entry()], seen }).hits.length, 0);
});

test('기존 세 조건은 그대로다 — 특보 소스 실패는 감시 중단이지 안전이 아니다', () => {
  const r = w.evaluateWatch({ place: BUSAN, zone: null, warn: { state: 'FAILED' }, tsunamiEta: [], now: NOW });
  assert.equal(r.monitoring, 'SUSPENDED');
  const q = w.evaluateWatch({ ...base, quakes: [{ id: 'q1', title: 'M5.4', lat: 35.5, lon: 129.5, whenT: NOW - 3600000, facts: [['규모', 'M5.4']] }] });
  assert.equal(q.hits[0].conditionId, 'nearby-quake');
});

test('배선 — 내 지역 새로고침이 색인을 받아 넘기고, 기록에 SIMULATION 배지를 단다', () => {
  assert.match(main, /fetchS3\('\/ocean\/tsunami-eta\.json'\)\.catch\(\(\) => null\)/);
  assert.match(main, /tsunamiEta: \(tsuIdx && Array\.isArray\(tsuIdx\.events\)\) \? tsuIdx\.events : \[\]/);
  assert.match(main, /h\.simulation \? dataBadge\('SIMULATION_ONLY'\)/);
});
