// 제품 분리 — V38.1 지시서 §2·§13·§14 Product Separation
//
// "Pleos 빌드 산출물" = prototype/pleos.html 과 거기서 닿는 모든 모듈·CSS 다 (이 저장소는 빌드가 없다).
// 그 산출물에 다른 제품(AETHERUS)의 모듈·경로·문자열·분석 이벤트·에셋이 없어야 한다.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { importPrototype, createRunner, moduleGraph, htmlModuleEntries, PROTOTYPE, rel } from './pleos-test-support.mjs';

const target = await importPrototype('prototype/js/product-target.js');
const pleosTarget = await importPrototype('prototype/js/pleos/pleos-target.js');
const { test, run } = createRunner('test_pleos_product_separation');

const PLEOS_HTML = path.join(PROTOTYPE, 'pleos.html');
const WEB_HTML = path.join(PROTOTYPE, 'index.html');
const pleosEntries = htmlModuleEntries(PLEOS_HTML);
const pleosGraph = new Map();
for (const e of pleosEntries) for (const [f, v] of moduleGraph(e)) pleosGraph.set(f, v);
const webGraph = moduleGraph(htmlModuleEntries(WEB_HTML)[0]);
const pleosFiles = [...pleosGraph.keys()];
const protoRel = f => path.relative(PROTOTYPE, f).split(path.sep).join('/');

// 다른 제품의 흔적: 이름, 우주 장면 모듈, 분석 이벤트, 화면 이벤트, 데이터·에셋 경로
const MARKERS = [/aetherus/i, /cosmic3d/i, /js\/space\//, /data\/aetherus/, /['"`]space\//, /aetherus[.:]/i, /skyframe/i, /three-r\d+/];
const scan = text => MARKERS.filter(re => re.test(text)).map(String);

test('제품 조합 6개: 5개 허용, AETHERUS+PLEOS 만 거절', () => {
  const ok = [['EARTHUS', 'PLEOS'], ['EARTHUS', 'MOBILE'], ['EARTHUS', 'WEB'], ['AETHERUS', 'MOBILE'], ['AETHERUS', 'WEB']];
  for (const [p, f] of ok) assert.doesNotThrow(() => target.createTarget(p, f), `${p}+${f}`);
  assert.throws(() => target.createTarget('AETHERUS', 'PLEOS'), /INVALID_PRODUCT_TARGET:AETHERUS:PLEOS/);
  assert.deepEqual(target.targetMatrix(), {
    EARTHUS: { WEB: true, MOBILE: true, PLEOS: true },
    AETHERUS: { WEB: true, MOBILE: true, PLEOS: false },
  });
});
test('모르는 제품·플랫폼은 거절한다 (fail-closed)', () => {
  for (const [p, f] of [['EARTHUS', 'TV'], ['OTHER', 'WEB'], [undefined, undefined], ['earthus', 'pleos']]) {
    assert.throws(() => target.assertProductTarget(p, f), /INVALID_PRODUCT_TARGET/);
  }
});
test('Pleos 등록 규칙: 다른 제품의 모듈·경로 키·분석 이벤트·화면 이벤트를 거절한다', () => {
  assert.throws(() => target.assertPleosRegistration({ module: 'js/space/cosmic3d.js' }), /PLEOS_MODULE_REJECTED/);
  assert.throws(() => target.assertPleosRegistration({ module: 'prototype/js/aetherus-lab.js' }), /PLEOS_MODULE_REJECTED/);
  assert.throws(() => target.assertPleosRegistration({ module: 'data/aetherus/photos.json' }), /PLEOS_MODULE_REJECTED/);
  assert.throws(() => target.assertPleosRegistration({ routeKey: 'aetherus' }), /PLEOS_ROUTE_REJECTED/);
  assert.throws(() => target.assertPleosRegistration({ routeKey: 'solar' }), /PLEOS_ROUTE_REJECTED/);
  assert.throws(() => target.assertPleosRegistration({ analyticsEvent: 'aetherus.opened' }), /PLEOS_ANALYTICS_REJECTED/);
  assert.throws(() => target.assertPleosRegistration({ domEvent: 'aetherus:route' }), /PLEOS_EVENT_REJECTED/);
  assert.equal(target.assertPleosRegistration({ module: 'js/pleos/app.js', routeKey: 'earthLat', analyticsEvent: 'earth.opened' }), true);
});
test('Pleos 실행 대상은 EARTHUS+PLEOS 하나뿐이다', () => {
  assert.deepEqual({ ...pleosTarget.PLEOS_TARGET }, { product: 'EARTHUS', platform: 'PLEOS' });
  assert.throws(() => pleosTarget.assertPleosTarget('AETHERUS', 'PLEOS'), /PLEOS_TARGET_REJECTED/);
});
test('Pleos 는 허용하지 않은 URL 키(다른 제품 딥링크 포함)를 거절한다', () => {
  assert.deepEqual(pleosTarget.rejectedQueryKeys('?aetherus=1&solar=1'), ['aetherus', 'solar']);
  assert.deepEqual(pleosTarget.rejectedQueryKeys('?space=milkyway'), ['space']);
  assert.deepEqual(pleosTarget.rejectedQueryKeys(''), []);
});
test('pleos.html 의 진입 모듈은 js/pleos/main.js 하나이고 본 앱 main.js 가 아니다', () => {
  assert.deepEqual(pleosEntries.map(protoRel), ['js/pleos/main.js']);
  assert.ok(!pleosGraph.has(path.join(PROTOTYPE, 'js/main.js')));
});
test('Pleos 모듈 그래프: 빠진 파일·외부 패키지·정적으로 못 따라가는 동적 import 가 없다', () => {
  for (const [f, v] of pleosGraph) {
    assert.equal(v.missing, false, `없는 파일: ${rel(f)}`);
    assert.deepEqual(v.nonRelative, [], `상대 경로가 아닌 import: ${rel(f)}`);
    assert.equal(v.computedImport, false, `import(변수): ${rel(f)}`);
  }
});
test('Pleos 모듈 그래프에 다른 제품 모듈이 없다 (js/space/·aetherus-*·data/aetherus)', () => {
  const bad = pleosFiles.map(protoRel).filter(f => /^js\/space\//.test(f) || /aetherus/i.test(f) || /^data\/aetherus/.test(f) || /^space\//.test(f));
  assert.deepEqual(bad, []);
});
test('Pleos 모듈 그래프에 product-target.js·i18n.js·analytics 가 들어가지 않는다', () => {
  const names = pleosFiles.map(protoRel);
  for (const f of ['js/product-target.js', 'js/i18n.js', 'js/analytics.js', 'js/analytics-contract.js', 'js/ui.js', 'js/viewer.js', 'js/store.js']) {
    assert.ok(!names.includes(f), f);
  }
});
test('Pleos 산출물(HTML·CSS·모든 모듈) 본문에 다른 제품 문자열이 없다', () => {
  const assets = [PLEOS_HTML, path.join(PROTOTYPE, 'css/pleos.css'), ...pleosFiles];
  const hits = assets.map(f => [rel(f), scan(fs.readFileSync(f, 'utf8'))]).filter(([, h]) => h.length);
  assert.deepEqual(hits, []);
});
test('pleos.html 이 부르는 CSS·아이콘은 다른 제품 에셋이 아니다', () => {
  const html = fs.readFileSync(PLEOS_HTML, 'utf8');
  const refs = [...html.matchAll(/(?:href|src)=["']([^"']+)["']/g)].map(m => m[1]);
  assert.deepEqual(refs.sort(), ['css/pleos.css', 'favicon.svg', 'js/pleos/main.js']);
  assert.doesNotMatch(html, /serviceWorker|sw\.js|manifest/);
});
test('WEB(=MOBILE PWA 같은 번들) 산출물에는 AETHERUS 가 들어 있다 (기대값 — 웹·모바일은 유지)', () => {
  const names = [...webGraph.keys()].map(protoRel);
  assert.ok(names.some(f => f.startsWith('js/space/')), 'index.html → main.js 그래프에 js/space/ 가 있어야 한다');
  assert.match(fs.readFileSync(WEB_HTML, 'utf8'), /aetherus/i);
  // MOBILE 은 같은 index.html 을 PWA(manifest display:standalone)로 설치하는 형태다 (SOURCE_SURVEY §2)
  assert.match(fs.readFileSync(path.join(PROTOTYPE, 'manifest.webmanifest'), 'utf8'), /"display"\s*:\s*"standalone"/);
});
test('렌더된 Pleos 화면(운전·주차 모두)에 다른 제품 문자열이 없다', async () => {
  const { createPleosApp } = await importPrototype('prototype/js/pleos/app.js');
  for (const drivingState of ['UNKNOWN', 'DRIVING', 'PARKED']) {
    const bridge = { drivingState: () => drivingState, location: () => null, canOpenDirections: () => false, onDrivingStateChange: () => () => {}, openDirections: () => false };
    const app = createPleosApp({ bridge, repository: {} });
    const html = app.html();
    assert.match(html, /data-product="EARTHUS"/);
    assert.deepEqual(scan(html), [], drivingState);
    if (drivingState === 'PARKED') for (const d of ['earth', 'weather', 'satellite', 'ocean', 'air', 'disaster', 'local']) assert.match(html, new RegExp(`data-arg="${d}"`));
  }
});

await run();
