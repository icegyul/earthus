import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/* package.json에 type=module이 없는 브라우저 앱이라 Node는 .js를 CommonJS로 본다.
   제품과 같은 ES module 원문을 data URL로 불러 계약만 격리 검증한다. */
const source = await readFile(new URL('../prototype/js/earth-route-state.js', import.meta.url), 'utf8');
const {
  EarthRouteError,
  decodeEarthRoute,
  encodeEarthRoute,
  hasEarthRoute,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('query가 없으면 일반 Earth View이며 route를 만들지 않는다', () => {
  assert.equal(decodeEarthRoute('?lang=ko'), null);
  assert.equal(hasEarthRoute('?lang=ko'), false);
  assert.equal(hasEarthRoute('?earthView=data&space=solar'), true);
});

test('Style 상태를 왕복한다', () => {
  const url = encodeEarthRoute({ view: 'style' }, 'https://earthus.net/?lang=ko');
  assert.equal(url.searchParams.get('earth'), '1');
  assert.equal(url.searchParams.get('earthView'), 'style');
  assert.equal(url.searchParams.get('lang'), 'ko');
  assert.equal(decodeEarthRoute(url).view, 'style');
});

test('Data 상태는 layer/time/model을 복원한다', () => {
  const state = {
    view: 'data', layer: 'temp', at: '2026-08-12T12:00:00Z', model: 'noaa-gfs', read: true,
  };
  const decoded = decodeEarthRoute(encodeEarthRoute(state));
  assert.equal(decoded.view, 'data');
  assert.equal(decoded.layer, 'temp');
  assert.equal(decoded.at, '2026-08-12T12:00:00.000Z');
  assert.equal(decoded.model, 'noaa-gfs');
  assert.equal(decoded.read, true);
  assert.equal(encodeEarthRoute(state).searchParams.get('earthRead'), '1');
});

test('Evidence 좌표는 약 1km 정밀도로 제한해 왕복한다', () => {
  const state = { view: 'evidence', layer: 'tpw', point: { lat: 37.566535, lon: 126.977969 } };
  const url = encodeEarthRoute(state);
  assert.equal(url.searchParams.get('earthPoint'), '37.57,126.98');
  assert.deepEqual(decodeEarthRoute(url).point, { lat: 37.57, lon: 126.98 });
});

test('Decision 상태는 활동 또는 예약 대상을 요구한다', () => {
  const activity = decodeEarthRoute(encodeEarthRoute({
    view: 'decision', layer: 'temp', point: { lat: 37.57, lon: 126.98 }, activity: 'baseball',
  }));
  assert.equal(activity.view, 'decision');
  assert.equal(activity.activity, 'baseball');
  assert.throws(
    () => encodeEarthRoute({ view: 'decision', layer: 'temp' }),
    error => error instanceof EarthRouteError && error.code === 'MISSING_DECISION_TARGET',
  );
});

test('Earth 상태를 쓰면 AETHERUS와 해구 route가 섞이지 않는다', () => {
  const url = encodeEarthRoute(
    { view: 'data', layer: 'temp' },
    'https://earthus.net/?aetherus=2&solar=1&target=mars&dive=35,129&lang=en',
  );
  assert.equal(url.searchParams.has('aetherus'), false);
  assert.equal(url.searchParams.has('solar'), false);
  assert.equal(url.searchParams.has('target'), false);
  assert.equal(url.searchParams.has('dive'), false);
  assert.equal(url.searchParams.get('lang'), 'en');
});

test('Earth route 삭제는 다른 서비스 route를 보존한다', () => {
  const url = encodeEarthRoute(null,
    'https://earthus.net/?earth=1&earthView=data&earthLayer=temp&aetherus=2&solar=1');
  assert.equal(url.searchParams.has('earth'), false);
  assert.equal(url.searchParams.has('earthLayer'), false);
  assert.equal(url.searchParams.get('aetherus'), '2');
  assert.equal(url.searchParams.get('solar'), '1');
});

test('지원하지 않는 버전은 빈 화면 대신 Earth로 낮춘다', () => {
  const route = decodeEarthRoute('?earth=99&earthView=evidence&earthLayer=temp&earthPoint=37,127');
  assert.equal(route.view, 'earth');
  assert.ok(route.issues.includes('UNSUPPORTED_VERSION'));
});

test('레이어 없는 Data는 Style로 낮춘다', () => {
  const route = decodeEarthRoute('?earth=1&earthView=data&earthLayer=%3Cbad%3E');
  assert.equal(route.view, 'style');
  assert.ok(route.issues.includes('INVALID_LAYER'));
  assert.ok(route.issues.includes('MISSING_LAYER'));
});

test('지점 없는 Evidence는 Data로 낮춘다', () => {
  const route = decodeEarthRoute('?earth=1&earthView=evidence&earthLayer=temp&earthPoint=none');
  assert.equal(route.view, 'data');
  assert.equal(route.layer, 'temp');
  assert.ok(route.issues.includes('INVALID_POINT'));
  assert.ok(route.issues.includes('MISSING_POINT'));
});

test('잘못된 시각은 URL 생성 단계에서 거부한다', () => {
  assert.throws(
    () => encodeEarthRoute({ view: 'data', layer: 'temp', at: 'tomorrow' }),
    error => error instanceof EarthRouteError && error.code === 'INVALID_AT',
  );
});

test('잘못된 판독 모드 값은 켜지 않고 issue를 남긴다', () => {
  const route = decodeEarthRoute('?earth=1&earthView=data&earthLayer=temp&earthRead=yes');
  assert.equal(route.view, 'data');
  assert.equal(route.read, false);
  assert.ok(route.issues.includes('INVALID_READ_MODE'));
});

let passed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}
console.log(`Earth route contract: ${passed}/${tests.length} passed`);
