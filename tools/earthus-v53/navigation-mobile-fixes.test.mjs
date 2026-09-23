// 수정 지시서 §8~15 — 하단바 단일 점등 · 시뮬레이션 ESC · 모바일 길게 누르기 ·
// 조각 캡션 닫기/축소 · 자동 오버레이 정리 · 국가 카드 compact.
// 감사 IA-01(P2)·SIM-01(P2)·QM-01(P2)·UX-01·MOB-02의 회귀를 잠근다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const shellSrc = src('prototype/v2-three/js/ui-shell.js');
const mainSrc = src('prototype/v2-three/js/main.js');
const sculptSrc = src('prototype/v2-three/js/pop-sculpture.js');
const htmlSrc = src('prototype/v2-three/index.html');

test('하단바 .on 의 화가는 하나다 — 클릭 핸들러는 직접 쓰지 않는다', () => {
  // 2026-09-10 live 실측: 클릭 토글 + syncIntelNav 재점등이 싸워 두 칸이 켜졌다.
  assert.ok(!/forEach\(\(b\) => b\.classList\.toggle\('on', b === btn\)/.test(shellSrc),
    '클릭 핸들러가 .on 을 직접 쓴다 — 두 화가 문제 회귀');
  assert.match(shellSrc, /\.on 의 유일한 쓰기 지점/, '단일 쓰기 지점 주석(계약)이 없다');
  assert.match(shellSrc, /if \(openBrand === 'report'\) want = 'report';/);
  assert.match(shellSrc, /else if \(openBrand === 'earthus'\) want = 'explore';/);
  assert.match(shellSrc, /else if \(intelOpen\) want = NAV_FOR_TAB\[curTab\] \|\| null;/);
});

test('패널이 열리고 닫힐 때도 같은 화가가 불을 정리한다', () => {
  // openPanel/closeFlyout 본문 안에서 syncIntelNav 를 부르는지 — 함수 정의부가 아니라 본문을 본다.
  assert.match(shellSrc, /panel\.classList\.add\('open'\);[\s\S]{0,400}syncIntelNav\(\);/);
  assert.match(shellSrc, /const closeFlyout = \(\) => \{[\s\S]{0,300}syncIntelNav\(\);/);
});

test('우주 문 표시는 AETHERUS 서랍이 열려 있는 동안에만 산다', () => {
  assert.match(shellSrc, /let spaceDoor = false;/);
  assert.match(shellSrc, /if \(brand !== 'aetherus'\) spaceDoor = false;/);
  assert.match(shellSrc, /case 'space': spaceDoor = true; gotoScene\('aetherus', 'space'\); break;/);
  assert.match(shellSrc, /else if \(openBrand === 'aetherus'\) want = spaceDoor \? 'space' : null;/);
});

test('시뮬레이션은 ESC 사슬의 맨 앞에서 닫힌다 — 버튼만이 출구면 §31 위반이다', () => {
  assert.match(mainSrc, /if \(sim\.active\) \{ sim\.close\(\); return; \}/,
    'ESC 가 시뮬레이션을 닫지 않는다');
  assert.match(mainSrc, /시뮬레이션 → 플라이아웃 → 포커스 → 인텔 패널/);
});

test('모바일 길게 누르기(450ms)로 같은 radial 문을 연다', () => {
  assert.match(mainSrc, /pointerType === 'touch'/, '터치 진입이 없다');
  // (2026-09-24 정정) 타이머 안 longPressFired 와 quickMenu.open 사이에 '창 걷기' 해제(orbit.motion.longPress)가 들어갔다 —
  //   7~10px 흔들린 길게 누르기가 걷힌 창 사이에 안 보이는 퀵메뉴를 열던 결함(motion-chrome.test.mjs). 사이 몇 줄만 허용한다.
  assert.match(mainSrc, /setTimeout\(\(\) => \{\s*\n\s*longPressFired = true;[\s\S]{0,900}?\n\s*quickMenu\.open\(x, y, raycastGlobe\(x, y\)\);\s*\n\s*\}, 450\);/,
    '길게 누르기 450ms 진입이 없다');
  assert.match(mainSrc, /if \(longPressFired\) \{/, '떼는 손가락이 선택으로 읽히는 걸 막는 가드가 없다');
  assert.match(mainSrc, /Math\.hypot\(e\.clientX - downAt\.x, e\.clientY - downAt\.y\) > 10\)\s*\{\s*\n\s*clearTimeout\(pressTimer\);/,
    '10px 초과 이동(회전)에 타이머를 버리지 않는다');
});

test('인구 조각 캡션에는 닫기가 있고, 닫는 손은 main.js 를 거친다', () => {
  assert.match(sculptSrc, /<button class="sc-x" aria-label="인구 조각 끄기">✕<\/button>/);
  assert.match(sculptSrc, /if \(e\.target\.closest\('\.sc-x'\) && this\.onClose\) this\.onClose\(\);/);
  assert.match(mainSrc, /popSculpt\.onClose = \(\) => \{/, '캡션 닫기 배선이 없다');
  assert.match(htmlSrc, /#sculpt-cap \.sc-x \{/, '닫기 버튼 CSS 가 없다');
});

test('모바일 캡션은 압축된다 — 순위는 접힘, 화면 42% 이하', () => {
  assert.match(htmlSrc, /#sculpt-cap \{ max-height: 42vh; overflow-y: auto;/);
  assert.match(htmlSrc, /#sculpt-cap \.sc-rank \{ display: none; \}/);
  assert.match(sculptSrc, /<button class="sc-more">순위 보기 ▾<\/button>/);
  assert.match(sculptSrc, /const open = this\.capEl\.classList\.toggle\('expanded'\);/);
});

test('자동으로 켠 조각만 문맥 종료에 같이 꺼진다 — 사용자 것이 강제로 꺼지지 않는다 (§15)', () => {
  assert.match(mainSrc, /let sculptAutoFor = null;/, '자동 문맥 추적이 없다');
  assert.match(mainSrc, /if \(!popSculpt\.on\) sculptAutoFor = popIso; else sculptAutoFor = null;/,
    '자동/수동 구분이 없다');
  assert.match(mainSrc, /const clearFocusContext = \(\) => \{[\s\S]{0,200}sculptAutoFor = null;/);
  // ESC 와 바다 클릭이 공용 문을 쓴다.
  assert.match(mainSrc, /if \(focus\.selected\) \{ clearFocusContext\(\); return; \}/);
  assert.match(mainSrc, /const hadSelection = !!focus\.selected;\s*\n\s*clearFocusContext\(\);/);
  // onChange 의 문맥 종료 분기도 같은 정리를 한다.
  // (2026-09-24 정정) 한 장 시트 — 고른 바다의 값 카드로 연다(openIntel('now')). 사이의 주석 줄은 건너뛴다.
  assert.match(mainSrc, /if \(sculptAutoFor && popSculpt\.on\) popSculpt\.toggle\(\);\s*\n\s*sculptAutoFor = null;\s*\n(?:\s*\/\/[^\n]*\n)*\s*if \(f\) shell\.openIntel\('now'\);/);
});

test('국가 카드는 인구가 첫 줄이다 — "대한민국 인구 5,170만"이 핵심이다 (§13)', () => {
  const rows = mainSrc.indexOf("statRow('인구', '불러오는 중…', true)");
  const area = mainSrc.indexOf("statRow('면적 (근사)'");
  assert.ok(rows > 0 && area > 0, '국가 카드 통계 행을 찾지 못했다');
  assert.ok(rows < area, '인구가 면적보다 뒤에 있다 — 핵심이 먼저여야 한다');
});

test('모바일 하단 버튼 터치 영역은 44px 이상이다', () => {
  // 2026-09-21: 44 를 글자로 찾던 시험이었다. 그 수는 :root 의 --tap 으로 옮겼다 —
  // 메뉴 패널이 알약을 피하는 높이(--nav-reserve)가 같은 토큰에서 나오기 때문이다.
  // 그래서 이제 **값을 꺼내 견준다**: 글자가 아니라 수가 44 이상인지를 본다.
  const rule = htmlSrc.match(/#bottom-nav button \{([^}]*)\}/g)?.pop();
  assert.ok(rule, '하단 바 버튼 규칙을 못 찾았다');
  const minH = rule.match(/min-height:\s*([^;]+);/)?.[1].trim();
  assert.ok(minH, 'min-height 선언이 없다 — 터치 영역이 글자 높이에 끌려간다');

  const token = minH.match(/var\((--[a-z-]+)\)/)?.[1];
  const value = token
    ? htmlSrc.match(new RegExp(`${token}\\s*:\\s*([\\d.]+)px`))?.[1]
    : minH.match(/([\d.]+)px/)?.[1];
  assert.ok(value !== undefined, `min-height ${minH} 에서 수를 못 꺼냈다`);
  assert.ok(Number(value) >= 44,
    `하단 바 버튼이 ${value}px — 42px 미만 터치 영역 회귀 (iOS HIG 최소 44)`);
  assert.match(rule, /min-width:\s*\d+px/, '가로 최소치가 사라졌다');
});
