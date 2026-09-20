// DEV-DIRECTIVE 2026-09-20 · 작업 E3 ① — 늦게 온 프레임을 넣을까 버릴까(prototype/v2-three/js/frame-arrival.js).
//
// 무엇이 잘못돼 있었나: 바람 층이 **청한 순서**로만 갈라, 재생(0.22초/칸)이 프레임 받는 시간(0.8초)보다 빨라지면
//   들어온 장을 전부 버렸다. 여기서는 금지가 아니라 **결과**를 잰다 — 어느 장을 넣고 어느 장을 버리나.
//
// 순수 함수라 DOM·THREE·저장소가 없다. 층에 이어 붙인 뒤의 결과는 wind-layer.test.mjs 의 재생 시험이 잰다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { acceptsArrival, bracketDistanceH, forecastHourAt, sameSpan } from '../../prototype/v2-three/js/frame-arrival.js';

const H = 3.6e6;
const T0 = Date.parse('2026-09-20T00:00:00Z');
const brAt = (ha, hb) => ({ a: { h: ha, t: T0 + ha * H }, b: { h: hb, t: T0 + hb * H }, outOfRange: null });

test('시간 거리 — 구간 안이면 0, 밖이면 가까운 끝까지', () => {
  const span = { ha: 6, hb: 9 };
  assert.equal(bracketDistanceH(span, 7.5), 0);
  assert.equal(bracketDistanceH(span, 6), 0);
  assert.equal(bracketDistanceH(span, 9), 0);
  assert.equal(bracketDistanceH(span, 4), 2);
  assert.equal(bracketDistanceH(span, 13), 4);
  // 한 장짜리 구간(정확히 그 시각)도 같은 자로 잰다.
  assert.equal(bracketDistanceH({ ha: 6, hb: 6 }, 6), 0);
  assert.equal(bracketDistanceH({ ha: 6, hb: 6 }, 7), 1);
  // 잴 수 없으면 '가장 나쁜 것' — 이것이 늦은 장을 안 넣는 쪽으로 기울게 한다.
  assert.equal(bracketDistanceH(null, 6), Infinity);
  assert.equal(bracketDistanceH(span, NaN), Infinity);
  assert.equal(bracketDistanceH({ ha: 'x', hb: 9 }, 6), Infinity);
});

test('예보 시각은 끼고 있는 구간의 앞 프레임에서 잰다 — 런 시각을 적지 않는다', () => {
  assert.equal(forecastHourAt(brAt(3, 6), T0 + 4.5 * H), 4.5);
  assert.equal(forecastHourAt(brAt(0, 3), T0 + 1 * H), 1);
  // 범위 밖(a = b = 끝 프레임)이면 h 가 구간 밖으로 나온다 — 그래서 거리가 0 이 아니다.
  const last = brAt(12, 12);
  assert.equal(forecastHourAt(last, T0 + 20 * H), 20);
  assert.equal(bracketDistanceH({ ha: 12, hb: 12 }, forecastHourAt(last, T0 + 20 * H)), 8);
  assert.ok(Number.isNaN(forecastHourAt(null, T0)));
  assert.ok(Number.isNaN(forecastHourAt(brAt(0, 3), NaN)));
});

test('늦게 온 장이라도 지금 시각에 더 가까우면 넣는다 — 이것이 재생을 살린다', () => {
  // 재생 중: 엔진에는 [0,3] 이 들어 있고 시각은 10h 를 지난다. 0.8초 전에 청한 [6,9] 가 이제 도착했다.
  const held = { ha: 0, hb: 3 };
  assert.equal(acceptsArrival({ arriving: { ha: 6, hb: 9 }, held, current: { ha: 9, hb: 12 }, hourNow: 10 }), true);
  // 옛 규칙(순서)이라면 '더 새 것을 청해 놨다'는 이유로 버렸다 — 그 결과가 얼어붙은 입자였다.
  // 거꾸로: 스크럽으로 앞서 갔다가 되돌아왔다. 옛 장이 지금 든 것보다 멀면 버린다.
  assert.equal(acceptsArrival({ arriving: { ha: 9, hb: 12 }, held: { ha: 0, hb: 3 }, current: { ha: 0, hb: 3 }, hourNow: 1 }), false);
});

test('같은 구간은 다시 올리지 않고, 든 것이 없으면 늦어도 넣는다', () => {
  assert.equal(acceptsArrival({ arriving: { ha: 3, hb: 6 }, held: { ha: 3, hb: 6 }, hourNow: 4 }), false);
  assert.equal(acceptsArrival({ arriving: { ha: 0, hb: 3 }, held: null, hourNow: 40 }), true, '빈 화면보다는 옛 장이라도 낫다');
  assert.equal(acceptsArrival({ arriving: null, held: null, hourNow: 1 }), false);
  assert.equal(acceptsArrival(), false);
});

test("'지금 구간'은 거리가 같아도 넣는다 — 안 그러면 정확히 프레임 위에서 비율이 멈춘다", () => {
  // 시각이 정확히 6h 에 닿았다: 새 구간은 한 장짜리 [6,6] 이고 지금 든 [3,6] 과 **둘 다 거리 0** 이다.
  // 거리만 보면 떨어지는데, 떨어뜨리면 열쇠가 [3,6] 인 채 남아 재생 중 setMix 가 옛 구간을 따라간다.
  const held = { ha: 3, hb: 6 };
  const arriving = { ha: 6, hb: 6 };
  assert.equal(bracketDistanceH(arriving, 6), bracketDistanceH(held, 6), '둘 다 거리 0 인 자리라야 이 시험이 뜻이 있다');
  assert.equal(acceptsArrival({ arriving, held, current: arriving, hourNow: 6 }), true);
  // 지금 구간이 아니면 같은 거리로는 못 이긴다.
  assert.equal(acceptsArrival({ arriving, held, current: held, hourNow: 6 }), false);
});

test('그릴 수 없는 시각(예보 범위 밖 · 자료 없음)은 늦은 장이 되살리지 않는다', () => {
  assert.equal(acceptsArrival({ arriving: { ha: 9, hb: 12 }, held: null, current: null, hourNow: 40, stale: true }), false);
  assert.equal(acceptsArrival({ arriving: { ha: 9, hb: 12 }, held: { ha: 0, hb: 3 }, hourNow: 10, stale: true }), false);
});

test('구간 견주기는 숫자다 — 열쇠 글자로 견주지 않는다', () => {
  assert.equal(sameSpan({ ha: 3, hb: 6 }, { ha: 3, hb: 6 }), true);
  assert.equal(sameSpan({ ha: 3, hb: 6 }, { ha: '3', hb: '6' }), true);
  assert.equal(sameSpan({ ha: 3, hb: 6 }, { ha: 3, hb: 9 }), false);
  assert.equal(sameSpan(null, { ha: 3, hb: 6 }), false);
});
