// M1 (2026-09-20) — 폰 3단 바텀시트 계약 시험. 계약 §C-0: Context Action 은 새 부품이 아니라 이 시트에 흡수한다.
// initShell 은 실제 DOM 을 요구하므로 배선은 소스에서 확인한다(다른 v2 시험과 같은 방식).
// 로컬 실측(375×812): peek 118px · half 31vh(윗변 332px — 지구 위쪽 40% 이상) · full 윗변 88px.
// (2026-09-23 정정 · B4/B5 PD 승인) 손잡이가 #intel-body 밖(#intel 의 첫 자식)으로 나왔다 — 보이는 띠 24 · 표적 44 · 굴려도 남는다.
//   세로 폰: 손잡이 24 + 본문(peek 118 · half 28dvh · full 천장 = 범례 윗변 108). 402×714 실측: half 손잡이 336~360 · 본문 360~560 · 알약 560~614.
//   (2026-09-24 정정 · 위 한 줄) 도구 줄이 전환기 줄(8~48)로 올라가 범례 윗변 = full 천장이 108 → 56 이다('천장 = 범례 윗변' 규칙은 그대로).
//   눕힌 폰: 본문에서 손잡이 띠만큼 빼서 시트 바깥 윗변을 예전 그대로 지킨다(812×375 실측 half 104~228 · full 88~228, 변경 전과 같다).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = (p) => new URL(`../../${p}`, import.meta.url);
// ⚠️ 줄바꿈을 LF 로 맞춰 읽는다. 이 저장소는 core.autocrlf=true 인 윈도우에서 돌고, git 이 파일을 다시 쓰는 순간
//    (cherry-pick · 새 워크트리 체크아웃) 작업본이 CRLF 로 풀린다. 아래 정규식은 LF 를 못박고 있어서 그때마다
//    내용이 한 글자도 안 바뀌었는데 시험이 떨어졌다 — 2026-09-20 에 워크트리 5개와 본 체크아웃이 모두 같은 3건에 걸렸다.
//    시험이 지키려는 것은 소스의 내용이지 줄바꿈이 아니다.
const lf = (s) => s.replace(/\r\n/g, '\n');
const shell = lf(readFileSync(root('prototype/v2-three/js/ui-shell.js'), 'utf8'));
const html = lf(readFileSync(root('prototype/v2-three/index.html'), 'utf8'));

test('세 단계만 있다 — peek · half · full', () => {
  assert.match(shell, /const SHEET_STEPS = \['peek', 'half', 'full'\];/);
  for (const s of ['peek', 'half', 'full']) assert.match(html, new RegExp(`#intel\\[data-sheet="${s}"\\]\\.open #intel-body`));
});

test('열면 half(INFORMATION)에서 시작하고, 셸 밖에서 단계를 고를 수 있다', () => {
  assert.match(shell, /if \(intelOpen\) setSheet\('half'\);/);
  assert.match(shell, /setSheet,\n\s+getPhenomenonContext,/, 'setSheet 을 셸 API 로 내주지 않는다');
});

test('시트 함수는 setIntelOpen 보다 먼저 선언된다 — const 를 선언 전에 부르면 죽는다', () => {
  assert.ok(shell.indexOf('const setSheet') < shell.indexOf('const setIntelOpen'));
});

test('손잡이는 넓은 화면에서 숨고 좁은 화면에서만 보인다', () => {
  assert.match(html, /\.sheet-grip \{ display: none; \}/);
  const narrow = html.slice(html.indexOf('M1 (2026-09-20) 3단 바텀시트'));
  assert.match(narrow, /\.sheet-grip \{ display: block;/);
  assert.match(narrow, /touch-action: none/, '끌기가 페이지 스크롤로 새면 안 된다');
});

test('half 는 지구 위쪽 40% 이상을 남긴다 — 31vh 이하 (세로 폰은 손잡이가 밖이라 본문 28dvh 이하)', () => {
  // 2026-09-23: index.html 이 half 를 31vh → 31dvh 로 바꿨다(이 페이지는 주소창이 안 접혀 vh 가 보이는 높이보다 크다 —
  //   그 파일의 메뉴 패널 기록). dvh 는 보이는 높이라 같은 수면 vh 보다 작거나 같다 — 상한 31 의 뜻은 그대로다.
  const m = html.match(/#intel\[data-sheet="half"\]\.open #intel-body \{ max-height: (\d+)d?vh; \}/);
  assert.ok(m && Number(m[1]) <= 31, `half 가 ${m && m[1]}vh — 34vh 는 812 높이에서 39% 였다`);
  // (2026-09-23 정정 · B4) 첫 규칙(폰 두 방향 공통)만 보면 세로 폰의 실제 값을 못 본다 — 세로 자리표의 half 를 따로 읽는다.
  //   손잡이 24 가 본문 **밖**이므로 손잡이 + 본문 ≤ 예전 31dvh 가 되려면 본문은 28dvh 이하여야 한다(402×714 실측: 손잡이 24 + 본문 200 = 224 · 예전 half 229).
  // (2026-09-24 정정) 세로 폰 머리글은 이제 두 곳에 있다 — 색면 범례 절(범례 규칙은 그 절에만 산다: field-legend 시험)과 '폰 세로 아래 자리표'.
  //   첫 머리글에서 자르면 범례 절부터 읽혀 아래의 **공통** half(31dvh)를 세로 값으로 오독한다 — 자리표 머리 주석에서 자른다.
  const portrait = html.slice(html.indexOf('---------- 폰 세로 아래 자리표'));
  const p = portrait.match(/#intel\[data-sheet="half"\]\.open #intel-body \{ max-height: (\d+)d?vh; \}/);
  assert.ok(p, '세로 폰 자리표에 half 규칙이 없다 — 손잡이 24 가 밖으로 나온 만큼 시트가 커진다');
  assert.ok(Number(p[1]) <= 28, `세로 half 본문이 ${p[1]}dvh — 손잡이 24 를 더하면 예전 half(31dvh)보다 커진다`);
  // 눕힌 폰은 본문에서 손잡이 띠를 뺀다 — 시트 바깥 윗변이 예전 그대로다.
  const land = html.slice(html.indexOf('---------- 눕힌 폰 (2026-09-21'));
  assert.match(land, /#intel\[data-sheet="half"\]\.open #intel-body \{ max-height: calc\(31dvh - var\(--grip-h\)\); \}/);
  assert.match(land, /#intel\[data-sheet="peek"\]\.open #intel-body \{ max-height: calc\(118px - var\(--grip-h\)\); \}/);
  // (2026-09-23 정정 · B5 반박 검증) 이 빼기는 눕힌 폰만이 아니라 세로 자리표가 안 거는 **720 이하의 가로 창 전부**에 걸려야 한다 —
  //   M1 절은 max-width 720 이면 포인터와 무관하게 걸린다. 좁은 데스크톱 창(700×600)에서 full 윗변이 88 → 64 로 도구줄을 덮었다.
  const comp = land.slice(0, land.indexOf('#intel[data-sheet="peek"].open #intel-body { max-height: calc(118px - var(--grip-h)); }'));
  const head = comp.slice(comp.lastIndexOf('@media'));
  assert.match(head, /^@media \(max-width: 720px\) and \(orientation: landscape\), \(max-height: 520px\) and \(pointer: coarse\) and \(orientation: landscape\) \{/,
    `손잡이 빼기의 머리글이 가로 창 전부를 덮지 않는다: ${head.slice(0, 120)}`);
});

test('손잡이는 #intel-body 밖, #intel 의 첫 자식이다 — 본문을 굴려도 남고 표적이 44 다 (B4)', () => {
  const tpl = shell.slice(shell.indexOf('intel.innerHTML = `'), shell.indexOf('root.appendChild(intel);'));
  const grip = tpl.indexOf('class="sheet-grip"');
  const body = tpl.indexOf('<div id="intel-body">');
  assert.ok(grip > 0 && body > 0, '템플릿에서 손잡이나 본문을 못 찾았다');
  assert.ok(grip < body, '손잡이가 #intel-body 안에 있다 — half 에서 본문을 굴리면 손잡이가 같이 밀려 사라진다');
  // 본문 밖으로 나왔으니 닫힌 시트에서 손잡이 혼자 떠 있으면 안 된다.
  assert.match(html, /#intel:not\(\.open\) \.sheet-grip \{ display: none; \}/);
  const narrow = html.slice(html.indexOf('M1 (2026-09-20) 3단 바텀시트'));
  assert.match(narrow, /\.sheet-grip \{ display: block;[^}]*height: var\(--grip-h\);/, '보이는 띠가 --grip-h 가 아니다');
  // 표적 = 띠 + 위 8 + 아래 12 = 44. 아래 12 는 본문의 안쪽 여백(12)이라 누를 것을 가로채지 않는다.
  const before = narrow.match(/\.sheet-grip::before \{[^}]*top: -(\d+)px; bottom: -(\d+)px;/);
  const grip24 = Number((html.match(/--grip-h:\s*(\d+)px/) || [])[1]);
  assert.ok(before, '손잡이 표적(::before)이 없다');
  // (2026-09-24 정정 · UX 자동 점검 '97×43') 딱 44 로 짠 표적은 손잡이 윗변이 소수점에 서면 화면 픽셀로 43 이 잡혔다 — 위로 2 를 더 번져 46.
  //   예전 단언: 띠 + 위 + 아래 === 44. 이제: ≥ 46(반올림 한 번을 견딘다) · full 에서는 위 8 그대로(아래 단언).
  assert.ok(grip24 + Number(before[1]) + Number(before[2]) >= 46, `손잡이 표적이 ${grip24 + Number(before[1]) + Number(before[2])} — 반올림 하나에 44 아래로 떨어진다`);
  // full 시트 윗변은 --top-reserve(56)다. 위로 10 을 번지면 46 — 위 한 줄 단추(그림 8~48)의 보이는 아랫변을 시트(z4)가 가로챈다.
  //   full 에서는 8 로 두어 48(단추 그림 아랫변)에서 멈춘다.
  const full = narrow.match(/#intel\[data-sheet="full"\] \.sheet-grip::before \{ top: -(\d+)px; \}/);
  assert.ok(full, 'full 시트에서 손잡이 표적이 위 한 줄 단추를 가로챈다(덮어 쓰는 규칙이 없다)');
  assert.ok(56 - Number(full[1]) >= 48, `full 에서 손잡이 표적 윗변 ${56 - Number(full[1])} 이 단추 그림 아랫변 48 위로 올라간다`);
  assert.ok(grip24 + Number(full[1]) + Number(before[2]) >= 44, 'full 에서 손잡이 표적이 44 미만');
  const bodyPad = html.match(/#intel\.open #intel-body \{[^}]*padding: (\d+)px/);
  assert.ok(bodyPad && Number(bodyPad[1]) >= Number(before[2]), '표적 아래쪽이 본문 여백을 넘어 탭 줄을 가로챈다');
});

test('롱프레스를 쓰지 않는다 — 레이어 피커의 "길게 눌러 핀"과 겹친다(§C-0)', () => {
  const sheet = shell.slice(shell.indexOf('// ── 바텀시트 단계 (M1)'), shell.indexOf("grip.addEventListener('pointercancel'"));
  assert.ok(!/contextmenu|longpress|setTimeout/.test(sheet));
});

test('움직임 줄이기 설정을 따른다', () => {
  assert.match(html, /prefers-reduced-motion: reduce\) \{ #intel\.open #intel-body \{ transition: none; \} \}/);
});
