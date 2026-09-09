// 지시서 §34 — 18km 블랙 화면 회귀 시험.
// 원인(2026-09-10 실측): near 평면 고정 0.005(≈31.9km) > closeUp 하한 18km →
// 그 고도에서는 시야의 모든 광선이 지표에 닿기 전에 near 에서 잘려 지구 몸통이
// 통째로 프러스텀 밖으로 나갔다. 수정은 near 를 실제 카메라 반지름에서 매 프레임
// 따라가게 한 것. 하한을 다시 올려 버그를 숨긴 것이 아닌지도 함께 잠근다.
// initShell·WebGL 은 노드에서 못 돌리므로 배선 계약은 소스에서 확인한다(기존 관례).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mainSrc = readFileSync(
  new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8');

test('near 평면이 실제 카메라 반지름에서 매 프레임 갱신된다', () => {
  assert.match(mainSrc,
    /const surfDist = Math\.max\(camera\.position\.length\(\) - 1, 1e-6\);/,
    '표면까지의 실제 거리 계산이 없다');
  assert.match(mainSrc,
    /camera\.near = THREE\.MathUtils\.clamp\(surfDist \* 0\.25, 1e-6, 0\.005\);/,
    'near 동적 갱신이 없다 — 18km 블랙 화면 회귀');
  const nearAt = mainSrc.indexOf('camera.near = THREE.MathUtils.clamp');
  const updateAt = mainSrc.indexOf('camera.updateProjectionMatrix()', nearAt);
  assert.ok(updateAt > 0, 'near 갱신 뒤 updateProjectionMatrix 를 부르지 않는다');
  assert.ok(updateAt - nearAt < 200, 'near 갱신과 투영 갱신이 떨어져 있다');
});

test('원래 고도의 깊이 정밀도는 그대로다 — near 상한 0.005 를 유지한다', () => {
  assert.match(mainSrc,
    /new THREE\.PerspectiveCamera\(48, window\.innerWidth \/ window\.innerHeight, 0\.005, 200\)/,
    '초기 카메라 near/far 가 바뀌었다 — 고고도 z-파이팅 위험');
});

test('18km 블랙의 두 번째 원인 — 변위 지형이 카메라를 덮지 못하게 그릴 배율을 제한한다', () => {
  // 2026-09-10 실측: near 고정만 고쳐도 50× 과장 지형(오리건 1,465m → 변위 반경 1.0115)이
  // 18km 카메라(1.0028)를 덮어 뒷면 컬링으로 지구가 통째로 검었다. 사용자 설정값과
  // 그리는 값을 분리하고, 시점 링(2.5°·5.5°) 최고 고도가 카메라 고도의 35% 이상 못
  // 오르게 그릴 배율만 낮춘다. near(25%)와 35% 사이에는 항상 여유가 남는다.
  assert.match(mainSrc, /let exagUser = 50;/, '사용자 과장 설정 분리가 없다');
  assert.match(mainSrc, /uniforms\.uExagger\.value = Math\.min\(exagUser, exagCeil\);/,
    '지형 클램프가 없다 — 카메라가 변위 지형 안으로 들어간다');
  assert.match(mainSrc,
    /const exagCeil = Math\.max\(0\.65 \* surfDist \* EARTH_RADIUS_M \/ Math\.max\(elevMax, 50\), 1\);/,
    '클램프 식이 카메라 실제 반경 기준이 아니다');
  assert.match(mainSrc, /const RING_SAMPLES = Object\.freeze\(/, '시점 링 표본이 없다');
  // 슬라이더는 설정만 바꾼다 — 균일값을 직접 쓰면 클램프가 다음 프레임에 풀린다.
  assert.ok(!/c-exagger', 'v-exagger', \(v\) => `\$\{v\}×`, \(v\) => \{\s*\n\s*uniforms\.uExagger\.value = v;/.test(mainSrc),
    '슬라이더가 균일값을 직접 쓴다 — 클램프와 싸운다');
});

test('수치 불변식 — 클램프 지형(35%)은 near(25%)보다 항상 카메라에서 멀다', () => {
  // 어떤 고도·어떤 클램프 결과에서도 near < 지형거리 이므로 지형이 near 에서 잘리지 않는다.
  for (const altUnits of [0.002825, 0.004, 0.01, 0.02, 0.1, 2.0]) {
    const near = Math.min(Math.max(altUnits * 0.25, 1e-6), 0.005);
    const terrainFloor = 0.35 * altUnits;
    assert.ok(near < terrainFloor,
      `alt=${altUnits}: near(${near}) >= 지형 하한(${terrainFloor}) — 클램프 지형이 잘린다`);
  }
});

test('18km 하한은 그대로다 — 버그를 숨기려고 시야를 닫지 않았다', () => {
  assert.match(mainSrc, /orbit\.minDist = closeUp \? 1 \+ 18 \/ 6371 : 1\.02;/,
    'closeUp 하한이 18km 가 아니다 — 하한을 올려 문제를 감추면 안 된다(지시서 §34)');
});

test('수치 불변식 — 어떤 허용 고도에서도 near 가 지표거리보다 작아 전화면 클리핑이 없다', () => {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const R = 6371; // km
  const CLOSE_UP = 1 + 18 / R;   // closeUp 하한
  const DEFAULT = 1.02;          // 기본 하한
  const MAX = 7.0;               // 최대 거리
  // 두 하한~상한 구간을 기하급수 표본으로 훑는다(실수 반복 무한루프를 피한다).
  const samples = [CLOSE_UP, DEFAULT, MAX];
  for (const from of [CLOSE_UP, DEFAULT]) {
    for (const to of [CLOSE_UP, DEFAULT, MAX]) {
      for (let d = from; d < to; d = d * 1.3 + 0.0005) samples.push(d);
    }
  }
  for (const d of samples) {
    const surfDist = Math.max(d - 1, 1e-6);
    const near = clamp(surfDist * 0.25, 1e-6, 0.005);
    assert.ok(near < surfDist,
      `dist=${d}: near(${near}) >= 지표거리(${surfDist}) — 이 고도에서 지구가 잘린다`);
    assert.ok(near <= 0.005 + 1e-12, `dist=${d}: near 상한이 바뀌었다`);
  }
  // 기본 시점(1.02)에선 상한에 걸려 옛 값과 같다 — 기존 화면의 깊이 정밀도가 유지된다.
  assert.equal(clamp((DEFAULT - 1) * 0.25, 1e-6, 0.005), 0.005);
  // 18km 하한에선 near 가 지표거리의 1/4 — 전 화면이 잘리지 않고 남는다.
  const altUnits = 18 / R;
  assert.equal(clamp(altUnits * 0.25, 1e-6, 0.005), altUnits * 0.25);
});
