// 시간 하나(js/time-bus.js) — 타임라인이 가리키는 시각을 모든 레이어가 같은 곳에서 듣는다.
// 7단계 문법 ④ 의 바닥이다: 한 레이어가 빠지면 그 메뉴만 '지금'에 멈춘다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTimeBus, NOW_EPS_MS } from '../../prototype/v2-three/js/time-bus.js';

const lf = (s) => s.replace(/\r\n/g, '\n');

test('듣기 시작하면 지금 값으로 바로 한 번 부른다 — 타임라인을 민 뒤에 켠 레이어도 그 시각에서 시작한다', () => {
  const bus = createTimeBus({ now: () => 1_000_000 });
  bus.set(3 * 3.6e6);
  const seen = [];
  bus.on((ms) => seen.push(ms));
  assert.deepEqual(seen, [3 * 3.6e6]);
  assert.equal(bus.validMs(), 1_000_000 + 3 * 3.6e6);
});

test('바뀔 때만 알리고, 숫자가 아닌 값은 버린다', () => {
  const bus = createTimeBus();
  const seen = [];
  bus.on((ms) => seen.push(ms));
  assert.equal(bus.set(1000), true);
  assert.equal(bus.set(1000), false, '같은 값으로 또 알렸다 — 슬라이더 input 은 같은 값으로 여러 번 온다');
  assert.equal(bus.set(NaN), false);
  assert.equal(bus.set('abc'), false);
  assert.equal(bus.set(undefined), false);
  assert.deepEqual(seen, [0, 1000]);
  assert.equal(bus.offsetMs, 1000, 'NaN 이 들어가면 모든 레이어의 bracket 이 null 을 낸다');
});

test('그만 듣기 — 꺼진 레이어가 프레임을 계속 받지 않는다', () => {
  const bus = createTimeBus();
  let n = 0;
  const off = bus.on(() => { n += 1; });
  bus.set(10);
  off();
  bus.set(20);
  assert.equal(n, 2, '끈 뒤에도 불렸다');
  assert.equal(bus.listeners(), 0);
});

test('듣는 쪽 하나가 던져도 나머지는 계속 듣는다', () => {
  const bus = createTimeBus();
  const warn = console.warn; console.warn = () => {};
  try {
    const seen = [];
    bus.on(() => { throw new Error('레이어 하나가 죽었다'); });
    bus.on((ms) => seen.push(ms));
    bus.set(5000);
    assert.deepEqual(seen, [0, 5000]);
  } finally { console.warn = warn; }
});

test("'지금'은 0 근처 한 눈금뿐이다 — 조금이라도 밀었으면 예보를 보고 있다(관측 숫자를 숨긴다)", () => {
  const bus = createTimeBus();
  assert.equal(bus.isNow(), true);
  bus.set(NOW_EPS_MS - 1);
  assert.equal(bus.isNow(), true);
  bus.set(NOW_EPS_MS);
  assert.equal(bus.isNow(), false);
  bus.set(-3 * 3.6e6);
  assert.equal(bus.isNow(), false, '과거도 지금이 아니다');
});

test('타임라인이 시간 버스에 적는다 — 구름만 따로 부르지 않는다', () => {
  const main = lf(readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8'));
  assert.match(main, /import \{ timeBus \} from '\.\/time-bus\.js\?v=1';/);
  // 시각이 **바뀌는** 자리는 셸의 onTimeOffset 하나다(슬라이더 · '지금' 단추 · 재생이 전부 이 문으로 온다).
  // main.js 의 다른 clouds.setForecastOffset(timeOffsetMs) 는 구름 모드를 바꾼 뒤 같은 시각을 다시 입히는 것이라 새 시각이 아니다.
  const at = main.indexOf('onTimeOffset: (ms) => {');
  assert.ok(at > 0, 'onTimeOffset 훅을 못 찾았다 — 이 시험의 전제가 바뀌었다');
  const body = main.slice(at, main.indexOf('\n    },', at));
  assert.match(body, /clouds\.setForecastOffset\(ms\)/, '전제: 구름이 이 훅에서 시각을 받는다');
  assert.match(body, /timeBus\.set\(ms\)/, '타임라인을 밀어도 버스가 모른다 — 기온·바람이 지금에 멈춘다');
});
