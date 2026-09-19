// M1 — 공식 특보 배너 시험 (지시서 v1.1 §4.4 OfficialWarningBanner, CAP 필드 5984d5b2).
// 배너는 '있을 때만' 나오고, 기상청 기록을 그대로 옮기며, 시험·연습 메시지와 해제는 띄우지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const b = await import('../../prototype/v2-three/js/warning-banner.js');
const main = readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8');
const src = readFileSync(new URL('../../prototype/v2-three/js/warning-banner.js', import.meta.url), 'utf8');

const W = (over = {}) => ({ region: '서울', kind: '호우', level: '경보', levelRank: 2, effectiveKst: '202609200100',
  cap: { status: 'Actual', msgType: 'Alert', severity: 'Severe' }, ...over });

test('특보가 없거나 자료가 늙었으면 배너가 없다 — 배너는 "있을 때"만', () => {
  assert.equal(b.bannerModel([]), null);
  assert.equal(b.bannerModel(null), null);
  assert.equal(b.bannerModel([W()], { stale: true }), null);
});

test('시험·연습·초안·시스템 메시지와 해제는 띄우지 않는다 (CAP status·msgType)', () => {
  for (const status of ['Test', 'Exercise', 'Draft', 'System']) {
    assert.equal(b.bannerModel([W({ cap: { status, msgType: 'Alert', severity: 'Severe' } })]), null, status);
  }
  assert.equal(b.bannerModel([W({ cap: { status: 'Actual', msgType: 'Cancel', severity: 'Severe' } })]), null);
});

test('CAP 이전 기록(기상청 원본)은 그대로 띄우고, 색은 모르면 중립이다', () => {
  const m = b.bannerModel([W({ cap: undefined })]);
  assert.equal(m.headline, '서울 호우경보');
  assert.equal(m.severity, 'Unknown');
  assert.equal(m.color, '#9aa7b8', '추측해서 빨갛게 하지 않는다');
});

test('가장 심각한 것을 머리에 두고 나머지 종류 수를 센다', () => {
  const m = b.bannerModel([
    W({ kind: '강풍', level: '주의보', levelRank: 1, cap: { status: 'Actual', msgType: 'Alert', severity: 'Moderate' } }),
    W(),
  ]);
  assert.equal(m.headline, '서울 호우경보');
  assert.equal(m.severity, 'Severe');
  assert.equal(m.more, 1);
  assert.equal(m.effective, '01:00');
  assert.equal(m.source, '기상청');
});

test('행동 지시·인과 문장을 짓지 않는다', () => {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // 주석은 규칙 설명이라 뺀다
  assert.ok(!/대피하세요|피하세요|때문에|evacuate/i.test(code));
});

test('잠그지 않는다 — 요금 판정을 부르지 않는다(공식 특보는 모든 요금제에서 같다)', () => {
  assert.ok(!/decideCapabilityAccess|lockExplanation|currentTier/.test(src));
});

test('배선 — 내 지역 새로고침과 앱 시작(내 장소가 있을 때) 두 곳', () => {
  assert.equal((main.match(/renderWarningBanner\(bannerModel\(/g) || []).length, 2);
  assert.match(main, /if \(myEarth\.place\) \{\n\s+const p = myEarth\.place;\n\s+fetchS3\('\/events\/kma-warn\.json'\)/);
});
