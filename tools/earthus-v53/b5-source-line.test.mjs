// B5 (2026-09-23 PD 승인 + 정정) — 좌하단 출처 줄이 **지금 켜진 색면의 출처를 맨 먼저** 말하는가.
// PD: "화면 좌하단 구름출처 에 같이 나오게 하라고 몇번이야기하니".
// 완료 기준은 금지가 아니라 결과로 쓴다(AGENTS.md '일하는 법' 2) — '어떤 단어가 없다'가 아니라
// '기온을 켜면 모델·런·유효시각이 구름 출처보다 앞에 **나와야** 통과'를 시험한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { composeSourceLine, readLegend } from '../../prototype/v2-three/js/source-line.js';

const lf = (s) => s.replace(/\r\n/g, '\n');
const main = lf(readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8'));
const html = lf(readFileSync(new URL('../../prototype/v2-three/index.html', import.meta.url), 'utf8'));
const text = (h) => h.replace(/<[^>]+>/g, '');

// 범례가 실제로 그리는 글(field-legend.js legendMetaLine) 모양 그대로 — 402×714 실측에서 뜬 글.
const FIELD = { title: '전지구 기온 · 지상 2 m', meta: 'MODEL · NOAA GFS 0.5° · 런 09/23 06Z · 유효 09/23 21:00 KST' };
const CLOUD = '관측 실황 · 다중위성 IR 합성 (NOAA GMGSI) · 2026-09-23 12:00Z · 3D 릴리프(DERIVED: IR→고도 근사)';

test('색면이 켜져 있으면 출처 줄의 **첫 항목**이 그 색면의 출처·런·유효시각이다 → 구름 → 지형·바탕', () => {
  const t = text(composeSourceLine({ field: FIELD, cloud: CLOUD, ko: true }));
  assert.ok(t.startsWith('출처: 전지구 기온 · 지상 2 m MODEL · NOAA GFS 0.5° · 런 09/23 06Z · 유효 09/23 21:00 KST'),
    `첫 항목이 색면 출처가 아니다: ${t.slice(0, 80)}`);
  const iField = t.indexOf('NOAA GFS'), iCloud = t.indexOf('NOAA GMGSI'), iTerrain = t.indexOf('AWS Terrarium'), iBase = t.indexOf('Natural Earth II');
  assert.ok(iField >= 0 && iCloud > iField && iTerrain > iCloud && iBase > iTerrain, `순서가 다르다: ${t}`);
  // 시각이 빠지면 '모든 값에 출처와 시각'을 어긴다 — 런과 유효가 둘 다 나와야 한다.
  assert.match(t, /런 09\/23 06Z/);
  assert.match(t, /유효 09\/23 21:00 KST/);
});

test('영어 화면도 같은 순서다', () => {
  const t = text(composeSourceLine({ field: { title: 'Global temperature · 2 m', meta: 'MODEL · NOAA GFS 0.5° · run 09/23 06Z · valid 09/23 12:00 UTC' }, cloud: 'Observed now · NOAA GMGSI', ko: false }));
  assert.ok(t.startsWith('Source: Global temperature · 2 m MODEL · NOAA GFS 0.5° · run 09/23 06Z · valid 09/23 12:00 UTC · Observed now'), t);
  assert.ok(t.indexOf('AWS Terrarium') > t.indexOf('GMGSI'));
});

test('색면이 꺼져 있으면 예전 글 그대로다(넓은 화면 무변경의 근거) — 색면 칸 자체가 없다', () => {
  const h = composeSourceLine({ field: null, cloud: CLOUD, ko: true });
  assert.ok(!h.includes('src-field'));
  // (2026-09-23 정정) 크레딧을 자르지 않는 줄(.src-credit)로 감싸면서 태그는 늘었다 — 넓은 화면이 **읽는 글**은 예전과 한 글자도 같아야 한다.
  //   (.src-sep ' · ' 는 넓은 화면에서 보인다. 폰 세로에서만 index.html 이 숨기고 크레딧을 셋째 줄로 세운다.)
  assert.equal(text(h), `출처: ${CLOUD} · AWS Terrarium 지형 · Natural Earth II 기본색`);
  assert.match(h, /<span class="src-credit"><b>AWS Terrarium<\/b> 지형 · <b>Natural Earth II<\/b> 기본색<\/span>$/, '크레딧이 따로 감싸이지 않았다 — 폰에서 두 줄 자르기에 잘린다');
  // 구름을 끈 것도 사실이다 — 빼지 않는다.
  assert.match(text(composeSourceLine({ cloud: '구름 끔', ko: true })), /^출처: 구름 끔 · AWS Terrarium/);
});

test('기본색 크레딧은 지금 걸린 바탕을 말한다 — Natural Earth II 고정 글자였다(DEV-DIRECTIVE 지형 ③ 정직성 버그)', () => {
  const t = text(composeSourceLine({ cloud: CLOUD, base: { src: 'VIIRS True Color', date: '2026-09-22' }, ko: true }));
  assert.match(t, /VIIRS True Color 기본색 2026-09-22/);
  assert.ok(!t.includes('Natural Earth II'), '바탕을 바꿨는데도 Natural Earth II 라고 말한다');
  // 바탕을 모르면(null) 지어내지 않고 이름을 뺀다.
  assert.ok(!text(composeSourceLine({ cloud: CLOUD, base: null, ko: true })).includes('기본색'));
});

test('남의 자료에서 온 글은 HTML 로 해석되지 않는다', () => {
  const h = composeSourceLine({ field: { title: '<img src=x onerror=alert(1)>', meta: 'a & b' }, cloud: '<script>', ko: true });
  assert.ok(!/<img|<script/.test(h));
  assert.match(h, /&lt;img/);
  assert.match(h, /a &amp; b/);
});

test('범례를 읽는다 — 숨은 범례는 출처가 아니다', () => {
  const fake = (hidden) => ({ hidden, querySelector: (s) => ({ '.fl-title': { textContent: FIELD.title }, '.fl-meta': { textContent: FIELD.meta } }[s] || null) });
  assert.deepEqual(readLegend(fake(false)), FIELD);
  assert.equal(readLegend(fake(true)), null);
  assert.equal(readLegend(null), null);
});

test('배선 — main.js 가 범례 글을 그대로 읽고, 범례·바탕·언어가 바뀌면 다시 칠한다', () => {
  const blk = main.slice(main.indexOf("const srcNote = document.getElementById('srcNote');"), main.indexOf('askEarth.init();'));
  // (2026-09-23 정정 · B5 반박 검증) 색면 칸은 세로 폰에서만 넣는다 — 넓은 화면은 숨긴 글을 aria-live 줄에 새로 쓰며 되읽혔다.
  //   조건식은 index.html 의 세로 자리표 머리글과 **같은 글자**여야 한다(보이는 화면 = 넣는 화면).
  assert.match(blk, /composeSourceLine\(\{\s*field: \(!srcFieldMQ \|\| srcFieldMQ\.matches\) \? readLegend\(document\.getElementById\('field-legend'\)\) : null/);
  const mq = (blk.match(/srcFieldMQ = window\.matchMedia \? window\.matchMedia\('([^']+)'\)/) || [])[1];
  assert.ok(mq && html.includes(`@media ${mq} {`), `출처 줄 조건식 '${mq}' 이 index.html 세로 자리표 머리글과 다르다`);
  assert.match(blk, /srcFieldMQ\.addEventListener\('change', paintSrc\)/, '폰을 세우고 눕힐 때 다시 칠하지 않는다');
  assert.match(blk, /attributeFilter: \['hidden'\]/, '범례가 숨고 나타나는 것을 안 본다');
  assert.match(blk, /addEventListener\('earthus:base', paintSrc\)/);
  assert.match(blk, /addEventListener\('earthus:lang', paintSrc\)/);
  // TDZ — BASE_STYLES·baseStyle 은 이 블록보다 한참 뒤에서 선언된다. 이름으로 부르면 첫 칠에서 main() 이 죽는다.
  assert.ok(!/\bBASE_STYLES\b|\bbaseStyle\b/.test(blk), '출처 줄이 BASE_STYLES/baseStyle 을 이름으로 부른다 — TDZ');
  assert.ok(main.indexOf("const srcNote = document.getElementById('srcNote');") < main.indexOf('const BASE_STYLES = ['), '전제(블록이 표보다 앞)가 바뀌었다');
  // 바탕을 바꾸는 두 길 모두 알린다.
  const setBase = main.slice(main.indexOf('async function setBaseStyle('), main.indexOf('window.__earthusBase ='));
  assert.equal((setBase.match(/baseChanged\(\);/g) || []).length, 2, '바탕을 바꾸는 두 길(캐시·새로 받기) 중 하나가 출처 줄에 안 알린다');
});

test('세로 폰에서만 색면 칸이 보인다 — 넓은 화면·눕힌 폰은 한 치도 안 바뀐다', () => {
  assert.match(html, /\n  #srcNote \.src-field \{ display: none; \}/);
  const portrait = html.slice(html.indexOf('@media (max-width: 720px) and (orientation: portrait)'), html.indexOf('---------- 눕힌 폰 (2026-09-21'));
  assert.match(portrait, /#srcNote \.src-field \{ display: inline; \}/);
});

// (2026-09-24 · 위 한 줄) 세로 폰에서는 범례의 출처 줄(.fl-meta)을 CSS 로 숨긴다 — 좌하단 줄이 같은 글을 이미 말하기 때문이다(PD 폰 캡처:
//   'IPCC AR6 · NASA/JPL · SSP5-8.5 · 2100 · 겹쳐 N곳 솎음' 이 범례와 좌하단에 두 번). 숨겨도 사실이 화면에서 사라지면 안 된다 —
//   결과로 시험한다: ① 숨기는 화면 = 좌하단이 색면 출처를 쓰는 화면(같은 글자의 질의) ② 숨긴 범례에서도 좌하단 줄에 '겹쳐 N곳 솎음'이 **나와야** 통과.
test('세로 폰 — 범례의 출처 줄을 숨겨도 좌하단 줄이 그 글(솎은 수 포함)을 그대로 말한다', async () => {
  const { slrLegendArgs } = await import('../../prototype/v2-three/js/flood-overlay.js');
  const { legendView } = await import('../../prototype/v2-three/js/field-legend.js');
  // ① 숨기는 규칙은 범례 절 안의 세로 폰 덩어리 **한 곳**이고, 그 머리글이 main.js 출처 줄 조건식과 같은 글자다.
  const mq = (main.match(/srcFieldMQ = window\.matchMedia \? window\.matchMedia\('([^']+)'\)/) || [])[1];
  assert.ok(mq, 'main.js 출처 줄 조건식을 못 찾았다');
  const from = html.indexOf('/* ---------- 색면 범례');
  const legendSec = html.slice(from, html.indexOf('/* ---------- ', from + 10));
  const blk = (legendSec.match(new RegExp(`@media ${mq.replace(/[()]/g, '\\$&')} \\{([\\s\\S]*?)\\n {2}\\}`)) || [])[1];
  assert.ok(blk, `범례 절에 '${mq}' 덩어리가 없다 — 범례 출처를 숨기는 화면과 좌하단이 쓰는 화면이 어긋난다`);
  assert.match(blk, /#field-legend \.fl-meta \{ display: none; \}/);
  assert.equal((html.match(/\.fl-meta \{[^}]*display: none/g) || []).length, 1, '범례 출처 줄을 숨기는 규칙이 다른 화면에도 있다');
  // ② readLegend 는 상자의 hidden 속성만 본다 — CSS display 와 무관하게 글자를 읽는다(가짜 요소에는 style 이 아예 없다).
  const v = legendView(slrLegendArgs({ scenario: 'ssp585', year: '2100', clashed: 41, capped: 0 }));
  assert.match(v.meta, /솎음/, '해수면 범례가 솎은 수를 말하지 않는다 — 시험의 전제가 바뀌었다');
  const el = { hidden: false, querySelector: (s) => ({ '.fl-title': { textContent: v.title }, '.fl-meta': { textContent: v.meta } }[s] || null) };
  const t = text(composeSourceLine({ field: readLegend(el), cloud: CLOUD, ko: true }));
  assert.ok(t.includes(v.meta), `좌하단 줄에 범례 출처가 없다: ${t.slice(0, 120)}`);
  assert.match(t, /\d+곳 솎음/, "'겹쳐 N곳 솎음' 사실이 좌하단에서 빠졌다");
});
