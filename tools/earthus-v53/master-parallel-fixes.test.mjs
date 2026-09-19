// MASTER PARALLEL — A/B/C 회귀 잠금.
// A: 검색·URL 국가 진입의 질문, 문맥 종료 정리, 모바일 radial, 18km 갇힘.
// B: space.satellite 능력 일치, sim stale(runId)·onClose, 우주 문 하단 불.
// C: lockExplanation WHAT/WHY/ADDS/UPGRADE + 서버 권위 유지.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const mainSrc = src('prototype/v2-three/js/main.js');
const shellSrc = src('prototype/v2-three/js/ui-shell.js');
const regSrc = src('prototype/v2-three/js/phenomenon-registry.js');
const { lockExplanation, decideCapabilityAccess, salesAllowed } =
  await import('../../prototype/js/access-mode.js');

test('A1 — 검색·URL 국가 진입도 countryClick 을 남긴다', () => {
  assert.match(mainSrc, /const centroidOfCountry = \(f\) => \{/);
  assert.match(mainSrc, /if \(h\.kind === 'country'\) \{ focus\.clear\(\); const cc = centroidOfCountry\(h\.f\); if \(cc\) countryClick = cc; focus\.select\(h\.f\); return; \}/);
  // URL 진입은 applyLinkCountry 한 문으로만 간다 — 클릭·검색과 같은 centroid→select.
  assert.match(mainSrc, /const applyLinkCountry = \(code\) => \{/);
  assert.match(mainSrc, /const cc = centroidOfCountry\(f\);\s*\n\s*if \(cc\) countryClick = cc;\s*\n\s*focus\.select\(f\);/);
});

test('URL ?c= 부팅 경주 — 늦은 data를 버리지 않고 맡긴 뒤 한 번만 적용한다', () => {
  // data 도착 콜백이 있다. 폴링·슬립으로 기다리지 않는다.
  assert.match(mainSrc, /this\.onData = null;/);
  assert.match(mainSrc, /this\.data = j; if \(this\.onData\) this\.onData\(j\);/);
  assert.match(mainSrc, /let pendingLinkCountry = null;/);
  assert.match(mainSrc, /focus\.onData = \(\) => \{\s*\n\s*if \(pendingLinkCountry\) applyLinkCountry\(pendingLinkCountry\);\s*\n\s*pendingLinkCountry = null;\s*\n\s*\};/);
  // 늦으면 맡기고(data 없음), 준비됐으면 즉시 적용한다. 없는 코드는 조용히 둔다.
  assert.match(mainSrc, /if \(!applyLinkCountry\(o\.c\) && !focus\.data\) pendingLinkCountry = o\.c;/);
  assert.match(mainSrc, /if \(!f\) return false;/);
  // 이미 골라져 있으면 토글 off 사고 없이 사용자 손이 이긴다.
  assert.match(mainSrc, /if \(focus\.selected\) return true;/);
  // 폴링·슬립 금지: pendingLinkCountry 주변에 타이머가 없다.
  assert.ok(!/setTimeout\([^)]*pendingLinkCountry|setInterval\([^)]*pendingLinkCountry|pendingLinkCountry[^;]*setTimeout/.test(mainSrc),
    'pendingLinkCountry 를 타이머로 기다린다');
});

test('A7 — 문맥 종료가 countryClick·sculptAutoFor·seaPoint 를 함께 버린다', () => {
  assert.match(mainSrc, /const clearFocusContext = \(\) => \{\s*\n\s*focus\.clear\(\);\s*\n\s*countryClick = null;/);
  assert.match(mainSrc, /countryClick = null;\s*\n\s*seaPoint = null;/);
  assert.match(mainSrc, /countryClick=null;sculptAutoFor=null;/);
  assert.match(mainSrc, /sculptAutoFor = iso3;/);
});

test('A4 — Android 이중 open 방지 + 스타일러스 지원', () => {
  assert.match(mainSrc, /if \(quickMenu\.visible\) return;/);
  assert.match(mainSrc, /if \(e\.pointerType === 'touch' \|\| e\.pointerType === 'pen'\) \{/);
});

test('A3/B10 — sim onClose 배선 + 질문 연타 stale 방지', () => {
  assert.match(mainSrc, /sim\.onClose = \(\) => \{ try \{ shell\.renderIntel\(\); \} catch/);
  assert.match(mainSrc, /let simRunId = 0;/);
  assert.match(mainSrc, /const myRun = \+\+simRunId;/);
  assert.match(mainSrc, /if \(myRun !== simRunId\) return;/);
});

test('A10 — 조각을 끄면 올라간 하한에 갇히지 않는다 + 극 과소평가 보정', () => {
  assert.match(mainSrc, /if \(orbit\.targetDist < orbit\.minDist\) orbit\.targetDist = orbit\.minDist;/);
  assert.match(mainSrc, /if \(orbit\.dist < orbit\.minDist\) orbit\.dist = orbit\.minDist;/);
  assert.match(mainSrc, /if \(Math\.abs\(latCam\) > 82 && elevMax < 2800\) elevMax = 2800;/);
});

test('A2/B — 질문 진입의 우주 이동도 하단 불을 켠다', () => {
  assert.match(shellSrc, /if \(brand === 'aetherus' && sceneId === 'space'\) spaceDoor = true;/);
});

test('B — space.satellite 능력은 시뮬레이션 질문과 일치한다', () => {
  assert.match(regSrc, /'space\.satellite': Object\.freeze\(\{/);
  assert.match(regSrc, /simulation: true, evidence: true, report: false \}\),\s*\n\s*availability: 'ready',\s*\n\s*evidenceProfile: 'OFFICIAL_OBSERVATION',/);
});

test('C — 잠긴 기능은 WHAT/WHY/ADDS/UPGRADE 를 말한다', () => {
  const ko = lockExplanation({ cap: 'history', requiredTier: 'explorer', ko: true });
  assert.equal(ko.allowed, false);
  assert.ok(ko.what.length > 5 && ko.why.length > 5 && ko.adds.length > 5 && ko.upgrade.length > 5);
  assert.match(ko.why, /무료/);
  const en = lockExplanation({ cap: 'history', requiredTier: 'intelligence', ko: false });
  assert.match(en.adds, /INTELLIGENCE/);
});

test('C — FREE_OPEN 은 모두 허용, 서버 판매는 여전히 닫힘', () => {
  assert.equal(decideCapabilityAccess({ mode: 'FREE_OPEN', available: true }).allowed, true);
  assert.equal(salesAllowed({ mode: 'FREE_OPEN', salesOpen: false }), false);
  assert.equal(salesAllowed({ mode: 'PAID', salesOpen: true }), true);
});
