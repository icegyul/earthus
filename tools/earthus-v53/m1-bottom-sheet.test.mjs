// M1 (2026-09-20) — 폰 3단 바텀시트 계약 시험. 계약 §C-0: Context Action 은 새 부품이 아니라 이 시트에 흡수한다.
// initShell 은 실제 DOM 을 요구하므로 배선은 소스에서 확인한다(다른 v2 시험과 같은 방식).
// 로컬 실측(375×812): peek 118px · half 31vh(윗변 332px — 지구 위쪽 40% 이상) · full 윗변 88px.
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

test('half 는 지구 위쪽 40% 이상을 남긴다 — 31vh 이하', () => {
  // 2026-09-23: index.html 이 half 를 31vh → 31dvh 로 바꿨다(이 페이지는 주소창이 안 접혀 vh 가 보이는 높이보다 크다 —
  //   그 파일의 메뉴 패널 기록). dvh 는 보이는 높이라 같은 수면 vh 보다 작거나 같다 — 상한 31 의 뜻은 그대로다.
  const m = html.match(/#intel\[data-sheet="half"\]\.open #intel-body \{ max-height: (\d+)d?vh; \}/);
  assert.ok(m && Number(m[1]) <= 31, `half 가 ${m && m[1]}vh — 34vh 는 812 높이에서 39% 였다`);
});

test('롱프레스를 쓰지 않는다 — 레이어 피커의 "길게 눌러 핀"과 겹친다(§C-0)', () => {
  const sheet = shell.slice(shell.indexOf('// ── 바텀시트 단계 (M1)'), shell.indexOf("grip.addEventListener('pointercancel'"));
  assert.ok(!/contextmenu|longpress|setTimeout/.test(sheet));
});

test('움직임 줄이기 설정을 따른다', () => {
  assert.match(html, /prefers-reduced-motion: reduce\) \{ #intel\.open #intel-body \{ transition: none; \} \}/);
});
