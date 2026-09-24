// 2026-09-24 PD "줌 들어가는 속도도 빨라 … 조금만 더 줄여도 될거 같아 줌인 속도".
// 결과로 잠근다: 지표 가까이서 **한 번에 하한까지 떨어지지 않아야** 통과, 지구 전체에서는 **예전과 거의 같아야** 통과,
// 그리고 줌이 **되기는 해야** 통과(느리게 만들다 못 들어가게 하면 안 된다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zoomDist, ZOOM_RATE_CAP, ZOOM_SLOW } from '../../prototype/v2-three/js/zoom-rate.js';

const mainSrc = readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8');
const R = 6371;
const km = (d) => (d - 1) * R;
const dist = (k) => 1 + k / R;
const MIN = 1.02;   // main.js 기본 하한(≈127 km)
// 핀치는 pointermove 마다 조금씩 들어온다 — 한 번의 손짓을 n 조각으로 나눠 적용한다(예전 식은 곱이라 조각과 무관).
const inc = (d, f, n = 60) => { for (let i = 0; i < n; i += 1) d = zoomDist(d, f ** (1 / n)); return d; };

test('637 km 에서 손가락 1.25배 — 예전엔 하한까지 떨어졌고, 이제는 절반 고도도 안 내려간다', () => {
  const d0 = dist(637);
  const old = Math.max(MIN, d0 / 1.25);
  assert.equal(old, MIN, '예전 식은 한 번에 하한(127 km)');
  const now = Math.max(MIN, inc(d0, 1 / 1.25));
  assert.ok(now > MIN, '이제는 하한에 안 닿는다');
  assert.ok(km(now) > 637 / 2, `한 번에 절반 넘게 내려가면 안 된다 (${km(now).toFixed(0)} km)`);
  assert.ok(km(now) < 637 * 0.9, `그래도 확실히 들어가야 한다 (${km(now).toFixed(0)} km)`);
});

test('지구 전체(거리 3)에서는 예전과 거의 같다 — 10~25% 느린 정도', () => {
  const d0 = 3.0;
  const f = 1 / 2;   // 손가락 2배
  const oldAlt = km(d0 * f);
  const newAlt = km(inc(d0, f));
  // 로그 고도 변화량의 비 = 새 속도 / 옛 속도
  const ratio = Math.log(km(d0) / newAlt) / Math.log(km(d0) / oldAlt);
  assert.ok(ratio > 0.75 && ratio < 0.95, `속도 비 ${ratio.toFixed(2)}`);
});

test('지구 전체 → 나라(1,000 km)는 핀치 몇 번이면 간다(과하게 느리지 않다)', () => {
  let d = 3.0; let n = 0;
  while (km(d) > 1000 && n < 20) { d = Math.max(MIN, inc(d, 1 / 2.5)); n += 1; }   // 한 번에 손가락 2.5배
  assert.ok(n <= 3, `${n}번`);
});

test('휠 한 칸(deltaY −100) — 637 km 에서 하한까지 가지 않는다 · 멀리서는 예전과 비슷', () => {
  const f = Math.exp(-100 * 0.0011);
  assert.equal(Math.max(MIN, dist(637) * f), MIN, '예전 식은 한 칸에 하한');
  const near = zoomDist(dist(637), f);
  assert.ok(km(near) > 400, `${km(near).toFixed(0)} km`);
  const far = zoomDist(3.0, f);
  assert.ok(far < 3.0 && far > 3.0 * f, '멀리서는 들어가되 예전보다 조금 덜');
});

test('멀어지기(factor>1)도 대칭 — 들어갔다 같은 만큼 나오면 제자리', () => {
  for (const d0 of [3.0, 1.5, 1.1, 1.03]) {
    const back = inc(inc(d0, 0.8), 1 / 0.8);
    assert.ok(Math.abs(back - d0) < 0.01 * (d0 - 1), `d0 ${d0} → ${back}`);
  }
});

test('CAP·SLOW 를 풀면(=∞·1) 작은 한 걸음은 예전 식과 같다 — 식을 바꾼 게 아니라 속도만 눌렀다', () => {
  for (const d0 of [3.0, 1.5, 1.1]) {
    const f = 0.999;
    const a = zoomDist(d0, f, { cap: Infinity, slow: 1 });
    assert.ok(Math.abs(a - d0 * f) < 1e-5, `d0 ${d0}`);   // 2차 항(≈1e-6·d²/고도)만 남는다
  }
  assert.ok(ZOOM_RATE_CAP > 1 && ZOOM_SLOW > 0.5 && ZOOM_SLOW <= 1);
});

test('main.js — 핀치와 휠이 모두 zoomDist 를 지난다(곱하기 줄이 남아 있지 않다)', () => {
  assert.match(mainSrc, /import \{ zoomDist \} from '\.\/zoom-rate\.js\?v=\d+'/);
  assert.match(mainSrc, /this\.targetDist = zoomDist\(this\.targetDist, this\.lastPinch\.dist \/ dist\)/);
  assert.match(mainSrc, /this\.targetDist = zoomDist\(this\.targetDist, Math\.exp\(e\.deltaY \* 0\.0011\)\)/);
  const live = mainSrc.split('\n').filter((l) => !/^\s*\/\//.test(l));
  assert.ok(!live.some((l) => /targetDist \*=/.test(l)), '곱하기 줄이 코드로 남아 있다');
});
