// 지시서 §28·29·31 — 우클릭 퀵 메뉴(radial) 계약 시험.
// 기준은 국가 중심이 아니라 우클릭 화면 좌표여야 하고, ESC·바깥 클릭·선택으로
// 닫혀야 하며, 화면 경계 밖으로 나가지 않아야 한다. 오른쪽 버튼으로 지구를
// 고르는(선택) 옛 동작이 살아 있으면 메뉴와 선택이 겹치므로 함께 잠근다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const qmSrc = src('prototype/v2-three/js/quick-menu.js');
const mainSrc = src('prototype/v2-three/js/main.js');
const htmlSrc = src('prototype/v2-three/index.html');

test('항목은 인구·기온·습도·바람·강수·설정 여섯 개다 (§28)', () => {
  const ids = [...qmSrc.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['population', 'temperature', 'humidity', 'wind', 'rain', 'settings']);
  assert.equal([...qmSrc.matchAll(/ko: '/g)].length, 6, '항목마다 한국어 문구가 있다');
  assert.equal([...qmSrc.matchAll(/en: '/g)].length, 6, '항목마다 영어 문구가 있다');
});

test('열림 기준은 클릭 지점이다 — 국가 중심이 아니다 (§28)', () => {
  assert.match(mainSrc, /quickMenu\.open\(e\.clientX, e\.clientY, raycastGlobe\(e\.clientX, e\.clientY\)\)/,
    '우클릭 화면 좌표로 열지 않는다');
  assert.match(qmSrc, /--qk-x/, '원형 배치 오프셋이 없다');
  assert.ok(!/countryCent|countryCenter/.test(qmSrc), '국가 중심 좌표를 쓴다');
});

test('끄는 손은 세 개다 — ESC·바깥 pointerdown·항목 선택 (§31)', () => {
  assert.match(qmSrc, /e\.key === 'Escape' \) this\.close\(\)|e\.key === 'Escape'\) this\.close\(\)/,
    'ESC 로 닫히지 않는다');
  assert.match(qmSrc, /!this\.el\.contains\(e\.target\) this\.close\(\)|!this\.el\.contains\(e\.target\)\) this\.close\(\)/,
    '바깥 클릭으로 닫히지 않는다');
  assert.match(qmSrc, /this\.close\(\);\s*\n\s*if \(m\) this\.onPick/,
    '항목을 고르고 닫는 순서가 아니다');
});

test('화면 경계 밖으로 나가지 않게 중심을 보정한다 (§29)', () => {
  assert.match(qmSrc, /Math\.min\(Math\.max\(x, RADIUS \+ 12\), W - RADIUS - 12\)/);
  assert.match(qmSrc, /Math\.min\(Math\.max\(y, RADIUS \+ 12\), H - RADIUS - 12\)/);
});

test('짧은 등장 애니메이션 — 150~220ms 창 안이다 (§29)', () => {
  assert.match(htmlSrc, /#quick-menu \.qk-item \{/, '퀵메뉴 CSS 가 없다');
  const m = htmlSrc.match(/transition: transform \.(\d+)s ease, opacity \.(\d+)s ease/);
  assert.ok(m, '등장 transition 이 없다');
  // CSS 의 .18s 는 0.18초다 — 소수 두 자리를 10으로 곱해 ms 로 읽는다.
  const ms = Number(m[1]) * 10;
  assert.ok(ms >= 150 && ms <= 220, `등장 애니메이션이 ${ms}ms — 150~220ms 규약 밖`);
});

test('오른쪽 버튼은 메뉴의 것 — 지구 선택(픽) 경로에서 제외됐다', () => {
  assert.match(mainSrc, /if \(e\.button === 2\) return; \/\/ 오른쪽 버튼은 퀵메뉴의 것/,
    '우클릭이 왼쪽 클릭 선택 경로에 새어 든다');
  assert.match(mainSrc, /canvas\.addEventListener\('contextmenu'/, 'contextmenu 배선이 없다');
  // 2026-09-10 MASTER: Android 길게 누르기 이중 open 방지 가드가 preventDefault 뒤에 들어갔다 —
  // 기본 메뉴 차단은 그대로 있어야 한다. 사이 400자까지 허용한다.
  assert.match(mainSrc, /e\.preventDefault\(\);[\s\S]{0,400}\/\/ 오른쪽 버튼을 끌어/,
    '브라우저 기본 메뉴를 막지 않는다');
  // 끌면(6px 초과 이동) 메뉴를 열지 않는다 — 조작과 메뉴를 가른다.
  assert.match(mainSrc, /rightDownAt\.y\) > 6\) return;/);
});

test('항목이 하는 일은 실제 조회·실제 화면이다 — 가짜 값이 없다 (§18)', () => {
  // 기온·습도·바람·강수 → 지점 실황(Open-Meteo 현재값) 조회로 흘러간다.
  assert.match(mainSrc, /if \(hit\) pointWeather\(hit\.lat, hit\.lon, metricId\);/);
  // 인구 → 기존 국가 픽 + 지표 메뉴(실제 격자를 세는 기둥).
  assert.match(mainSrc, /focus\.pick\(hit\.lat, hit\.lon\)/);
  assert.match(mainSrc, /popMetricMenu\.showAt\(x, y, 'population'\)/);
  // 설정 → 기존 설정 서랍 버튼을 그대로 누른다 — 새 화면을 만들지 않는다.
  assert.match(mainSrc, /document\.getElementById\('btn-settings'\)\.click\(\)/);
  // 지점 실황 카드는 출처·유효 시각·조회 시각을 적는다 (원칙 §1).
  assert.match(mainSrc, /Open-Meteo \(GFS 분석\) · 유효/);
  assert.match(mainSrc, /조회 \$\{new Date\(\)\.toISOString\(\)\}/);
  assert.match(mainSrc, /action === 'point-weather-retry'/, '조회 실패 시 다시 시도가 없다');
});

test('좌클릭 픽킹과 우클릭이 같은 교산을 쓴다 — 메뉴가 엉뚱한 나라를 잡지 않는다', () => {
  assert.match(mainSrc, /const raycastGlobe = \(clientX, clientY\) => \{/);
  // 픽 경로도 이 헬퍼를 쓴다(두 경로가 다른 교산이면 우클릭 인구가 잘못된 나라에 선다).
  assert.match(mainSrc, /const hit = raycastGlobe\(e\.clientX, e\.clientY\);/);
});
