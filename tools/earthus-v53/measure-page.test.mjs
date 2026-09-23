// M1 — §14 현장 측정판(?measure=1) 계약 시험. 실제 동작은 2026-09-20 로컬 375×812 에서 과제 5개를 끝까지 걸어 확인했다
// (5/5 · 기준 통과 · 쓰나미 버튼 4탭 · 예보·예정 2탭 · 60초 오류 0). 여기서는 깨지면 안 되는 약속을 소스로 잠근다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = (p) => new URL(`../../${p}`, import.meta.url);
// ⚠️ 줄바꿈을 LF 로 맞춰 읽는다. 이 저장소는 core.autocrlf=true 인 윈도우에서 돌고, git 이 파일을 다시 쓰는 순간
//    (cherry-pick · 새 워크트리 체크아웃) 작업본이 CRLF 로 풀린다. 아래 정규식은 LF 를 못박고 있어서 그때마다
//    내용이 한 글자도 안 바뀌었는데 시험이 떨어졌다 — 2026-09-20 에 워크트리 5개와 본 체크아웃이 모두 같은 3건에 걸렸다.
//    시험이 지키려는 것은 소스의 내용이지 줄바꿈이 아니다.
const lf = (s) => s.replace(/\r\n/g, '\n');
const src = lf(readFileSync(root('prototype/v2-three/js/measure.js'), 'utf8'));
const main = lf(readFileSync(root('prototype/v2-three/js/main.js'), 'utf8'));

test('?measure=1 일 때만 불러온다 — 평소 사용자에게는 한 바이트도 안 간다', () => {
  // (2026-09-24 정정) ?v= 값은 박지 않는다 — 한 장 시트 때 측정판이 새 절 제목을 읽게 바뀌어 ?v=2 가 됐다. 지키는 것은 '조건부 동적 import'다.
  assert.match(main, /get\('measure'\) === '1'\) \{\n\s+import\('\.\/measure\.js\?v=[A-Za-z0-9-]+'\)/);
  assert.ok(!/^import .*measure\.js/m.test(main), '정적 import 로 늘 받고 있다');
});

test('결과는 기기 밖으로 나가지 않는다 — 복사만 한다', () => {
  assert.ok(!/\bfetch\(|sendBeacon|XMLHttpRequest|WebSocket/.test(src));
  assert.match(src, /navigator\.clipboard\.writeText/);
});

test('과제는 §14 의 다섯 개이고, 탭 기준은 NEXT 3·시뮬 4', () => {
  const ids = [...src.matchAll(/\{ id: '(t\d)', ko: '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['t1', 't2', 't3', 't4', 't5']);
  assert.match(src, /id: 't3'[^}]*maxTaps: 3/);
  assert.match(src, /id: 't5'[^}]*maxTaps: 4/);
  assert.match(src, /passCount\(\) >= 4 \? ' · 기준 통과\(80%\)'/);
});

test('자동 판정은 앱의 실제 동작을 본다', () => {
  assert.match(src, /tab === 'next' \|\| \(a === 'intel-q' && el\.dataset\.sec === 'NEXT'\) \|\| a === 'forme-when'/);
  assert.match(src, /a === 'sim-q' && el\.dataset\.sim === 'tsunami-reach'/);
  assert.match(src, /a === 'sim-why' && \/기온\//);
});

test('무한 측정 루프가 없다 — FPS 는 네 번·5초씩, 생존 신호는 70초에서 멈춘다(발열 규칙)', () => {
  assert.match(src, /\[\['10s', 10000\], \['1m', 60000\], \['5m', 300000\], \['10m', 600000\]\]/);
  assert.match(src, /if \(\+\+aliveTicks >= 14\) \{[^}]*clearInterval\(alive\)/);
  assert.equal((src.match(/setInterval\(/g) || []).length, 1);
});

test('모르는 값은 모른다고 적는다 — 메모리·발열', () => {
  assert.match(src, /측정 불가\(이 브라우저는 값을 주지 않음\)/);
  assert.match(src, /발열은 브라우저가 알려주지 않는다/);
});

test('새 1차 메뉴 0 을 스스로 확인한다', () => {
  assert.match(src, /intelligence\|simulation\|인텔리전스\|시뮬레이션/i);
});
