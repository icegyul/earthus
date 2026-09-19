// M1 (2026-09-20) — 폰 3단 바텀시트 계약 시험. 계약 §C-0: Context Action 은 새 부품이 아니라 이 시트에 흡수한다.
// initShell 은 실제 DOM 을 요구하므로 배선은 소스에서 확인한다(다른 v2 시험과 같은 방식).
// 로컬 실측(375×812): peek 118px · half 31vh(윗변 332px — 지구 위쪽 40% 이상) · full 윗변 88px.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = (p) => new URL(`../../${p}`, import.meta.url);
const shell = readFileSync(root('prototype/v2-three/js/ui-shell.js'), 'utf8');
const html = readFileSync(root('prototype/v2-three/index.html'), 'utf8');

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
  const m = html.match(/#intel\[data-sheet="half"\]\.open #intel-body \{ max-height: (\d+)vh; \}/);
  assert.ok(m && Number(m[1]) <= 31, `half 가 ${m && m[1]}vh — 34vh 는 812 높이에서 39% 였다`);
});

test('롱프레스를 쓰지 않는다 — 레이어 피커의 "길게 눌러 핀"과 겹친다(§C-0)', () => {
  const sheet = shell.slice(shell.indexOf('// ── 바텀시트 단계 (M1)'), shell.indexOf("grip.addEventListener('pointercancel'"));
  assert.ok(!/contextmenu|longpress|setTimeout/.test(sheet));
});

test('움직임 줄이기 설정을 따른다', () => {
  assert.match(html, /prefers-reduced-motion: reduce\) \{ #intel\.open #intel-body \{ transition: none; \} \}/);
});
