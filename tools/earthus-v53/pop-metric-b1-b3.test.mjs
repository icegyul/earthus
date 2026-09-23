// UX-CHECK-FIX-PLAN-2026-09-23 B1 · B3 (PD 승인 2026-09-23 "모두 진행해") 결과 시험.
//
// B1 — 나라를 누르면 뜨는 지표 팝업(#pop-menu)의 기온·바람·강수가 '준비 중'으로 막혀 있었다. 같은 id 가 우클릭 퀵메뉴에서는
//      값을 냈다(두 말). 선택지 ①: 실제 조회로 연다 — 고르면 누른 그 지점의 값 카드(pointWeather)가 선다.
//      습도만 '필드가 없다'는 사유와 함께 막는다. 막는 라벨은 '준비 중'이 아니다(곧 열린다는 약속이 된다).
// B3 — 첫 방문 때 자동으로 여는 '사건' 시트를 half 대신 peek 로 연다(폰). peek 에서는 머리말도 걷어 사건 첫 줄이 보이게 한다.
//
// ⚠️ 금지만 시험하면 아무 말도 안 하는 팝업이 통과한다(AGENTS.md '일하는 법' 2). 그래서 **고르면 값 조회가 불린다**,
//    **그 id 가 실제로 값을 내는 지표다**(point-readout.js 표에 있고 색면 기술자가 있다)를 같이 잰다.
// 모듈 자체는 가짜 DOM 에 세워 누름을 흉내 낸다 — 브라우저 실측(402×714 · 1280×800)은 작업 보고에 있다.
// ⚠️ globalThis.document 를 이 파일이 덮는다 — node --test 의 기본(파일마다 따로 도는 프로세스)에서만 안전하다.
//    --test-isolation=none 으로 돌리면 다른 시험에 새어 든다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { METRIC_ABSENT, METRIC_LAYER } from '../../prototype/v2-three/js/point-readout.js';
import { FIELD_DESCRIPTORS } from '../../prototype/v2-three/js/field-layer.js';

const root = (p) => new URL(`../../${p}`, import.meta.url);
// 줄바꿈을 LF 로 맞춰 읽는다 — 윈도우 core.autocrlf 로 작업본이 CRLF 로 풀리면 LF 를 못박은 정규식이 떨어진다(m1-bottom-sheet 기록).
const lf = (s) => s.replace(/\r\n/g, '\n');
const read = (p) => lf(readFileSync(root(p), 'utf8'));
const popSrc = read('prototype/v2-three/js/pop-metric-menu.js');
const qmSrc = read('prototype/v2-three/js/quick-menu.js');
const mainSrc = read('prototype/v2-three/js/main.js');
const shellSrc = read('prototype/v2-three/js/ui-shell.js');
const html = read('prototype/v2-three/index.html');

// ── 가짜 DOM — PopMetricMenu 가 쓰는 만큼만 ────────────────────────────────────────────────
const fakeEl = () => {
  const el = {
    attrs: {}, listeners: {}, style: {}, children: [], innerHTML: '', textContent: '', className: '',
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, toggle(c, on) { if (on) this.set.add(c); else this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(t, f) { this.listeners[t] = f; }, querySelectorAll() { return []; }, querySelector() { return null; },
    appendChild(c) { this.children.push(c); return c; }, contains() { return true; },
  };
  return el;
};
const installFakeDom = () => {
  const docListeners = [];
  globalThis.document = { createElement: () => fakeEl(), body: fakeEl(), addEventListener: (t, f) => docListeners.push([t, f]) };
  return docListeners;
};

async function buildMenu(ko = true) {
  installFakeDom();
  const { PopMetricMenu } = await import('../../prototype/v2-three/js/pop-metric-menu.js');
  const picked = [];
  const menu = new PopMetricMenu({ ko }, (id) => picked.push(id));
  const press = (id) => {
    const btn = fakeEl(); btn.dataset = { id };
    menu.el.listeners.click({ target: { closest: () => btn } });
    return btn;
  };
  return { menu, picked, press };
}

test('B1 — 기온·바람·강수는 열려 있고, 누르면 그 id 로 onPick 이 불린다(조용한 무반응이 아니다)', async () => {
  const { menu, picked, press } = await buildMenu(true);
  for (const id of ['temperature', 'wind', 'rain']) {
    const m = menu.el.innerHTML.match(new RegExp(`<button class="pm-item( pm-soon)?" role="menuitemradio"\\s+data-id="${id}"([^>]*)>`));
    assert.ok(m, `${id} 버튼이 없다`);
    assert.ok(!m[1], `${id} 가 아직 pm-soon(막힘)이다`);
    assert.doesNotMatch(m[2], /aria-disabled/, `${id} 가 아직 aria-disabled 다`);
    press(id);
  }
  assert.deepEqual(picked, ['temperature', 'wind', 'rain'], '고른 지표가 onPick 으로 넘어가지 않는다');
  clearTimeout(menu._tipTimer);
});

test('B1 — 습도만 막혀 있고, 누르면 값을 지어내지 않고 사유를 말한다', async () => {
  const { menu, picked, press } = await buildMenu(true);
  const btnHtml = menu.el.innerHTML.slice(menu.el.innerHTML.indexOf('data-id="humidity"') - 90, menu.el.innerHTML.indexOf('</button>', menu.el.innerHTML.indexOf('data-id="humidity"')));
  assert.match(btnHtml, /pm-soon/, '습도가 열렸다 — 우리 프레임에 습도 필드가 없다');
  assert.match(btnHtml, /aria-disabled="true" aria-describedby="pm-why-humidity"/, 'A3 — 사유가 보조기기에 이어지지 않는다');
  assert.match(btnHtml, /<span id="pm-why-humidity" hidden>습도는 우리가 굽는 GFS 0\.5° 예보 프레임에 없습니다/, '숨긴 사유가 사실(필드 없음)을 말하지 않는다');
  assert.match(btnHtml, /<em>자료 없음<\/em>/, "막힌 라벨이 지금 상태('자료 없음')가 아니다");
  const btn = press('humidity');
  assert.deepEqual(picked, [], '막힌 습도를 누르면 조회가 불리면 안 된다');
  assert.equal(btn.children.length, 1, '누르면 사유 말풍선(.pm-tip)이 서야 한다');
  assert.match(btn.children[0].textContent, /필드|프레임에 없습니다/);
  assert.equal(btn.children[0].attrs['aria-hidden'], 'true', 'A3 — 말풍선은 aria-hidden(사유는 describedby 로 이미 읽힌다)');
  clearTimeout(menu._tipTimer);
  // 막힌 것은 습도 하나뿐이다
  assert.equal((menu.el.innerHTML.match(/pm-item pm-soon/g) || []).length, 1, '막힌 버튼이 습도 하나가 아니다');
});

test("B1 — '준비 중'/'soon' 이 화면 문구에서 사라졌다(곧 열린다는 거짓 약속)", async () => {
  const ko = await buildMenu(true);
  const en = await buildMenu(false);
  assert.doesNotMatch(ko.menu.el.innerHTML, /준비 중/);
  assert.doesNotMatch(en.menu.el.innerHTML, />soon</);
  assert.match(en.menu.el.innerHTML, /<em>no data<\/em>/);
  // A2 — 이름 있는 menu · 만들자마자 aria-checked 를 칠한다(querySelectorAll 로 칠하는 _paintActive 가 생성자에 있다)
  assert.equal(ko.menu.el.attrs.role, 'menu');
  assert.equal(ko.menu.el.attrs['aria-label'], '지표 선택');
  assert.equal(en.menu.el.attrs['aria-label'], 'Metric');
  assert.match(popSrc, /document\.body\.appendChild\(this\.el\);[\s\S]{0,400}this\._paintActive\(\);/, 'A2 — 만들자마자 aria-checked 를 칠하지 않는다');
  assert.match(html, /#pop-menu \{[\s\S]{0,600}visibility: hidden;/,'A1 — 닫힌 팝업이 visibility 로 숨지 않는다');
  clearTimeout(ko.menu._tipTimer); clearTimeout(en.menu._tipTimer);
});

test('B1 — 팝업 id → 지점 값 id 표가 실제로 값을 내는 지표를 가리킨다(강수는 rain)', async () => {
  const { POP_POINT_METRIC } = await import('../../prototype/v2-three/js/pop-metric-menu.js');
  assert.deepEqual({ ...POP_POINT_METRIC }, { temperature: 'temperature', wind: 'wind', rain: 'rain' });
  assert.ok(Object.isFrozen(POP_POINT_METRIC));
  const qmIds = [...qmSrc.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  for (const [pop, point] of Object.entries(POP_POINT_METRIC)) {
    assert.ok(qmIds.includes(point), `${pop} → ${point} 가 quick-menu.js ITEMS(정본)에 없다`);
    const layer = METRIC_LAYER[point];
    assert.ok(layer, `${point} 가 point-readout.js METRIC_LAYER 에 없다 — pointWeather 가 '지점 값을 읽는 지표가 아닙니다' 로 샌다`);
    assert.ok(FIELD_DESCRIPTORS[layer], `${layer} 색면 기술자가 없다 — 값을 못 읽는다`);
  }
  assert.ok(!('precipitation' in POP_POINT_METRIC) && !Object.values(POP_POINT_METRIC).includes('precipitation'), "강수 id 는 'rain' 이다");
  assert.ok(!('humidity' in POP_POINT_METRIC), '습도는 막혀 있어야 한다');
  assert.ok(METRIC_ABSENT.humidity, '습도가 없다는 근거(point-readout.js METRIC_ABSENT)가 사라졌다 — 팝업 사유와 같이 봐야 한다');
  assert.ok(!('humidity' in METRIC_LAYER), '습도 색면이 생겼다면 팝업 습도도 열어야 한다');
});

test('B1 — main.js 가 팝업 선택을 누른 지점의 pointWeather 로 잇는다 · 두 여는 길 모두 지점을 세운다', () => {
  assert.match(mainSrc, /import \{ PopMetricMenu, POP_POINT_METRIC \} from '\.\/pop-metric-menu\.js\?v=3';/);
  const cb = mainSrc.slice(mainSrc.indexOf('const popMetricMenu = new PopMetricMenu('), mainSrc.indexOf('const quickMenu = new QuickMenu('));
  assert.match(cb, /const metric = POP_POINT_METRIC\[id\];/);
  assert.match(cb, /pointWeather\(countryClick\.lat, countryClick\.lon, metric\)/, '팝업 선택이 지점 값 조회로 가지 않는다');
  assert.doesNotMatch(cb, /new PopMetricMenu\(i18n, \(\) => \{\}\)/, 'onPick 이 아직 빈 함수다');
  assert.match(cb, /revealNoteCard/, '값 카드를 시트 맨 위로 올리지 않는다 — 나라 문맥 머리말 아래로 밀려 화면 밖이었다');
  // 좌클릭: 누른 지점
  assert.match(mainSrc, /countryClick = \{ lat, lon \};\n\s+focus\.select\(f\);[\s\S]{0,300}popMetricMenu\.showAt\(e\.clientX, e\.clientY, 'population'\)/);
  // 우클릭 '인구': 우클릭 지점(전에는 세우지 않아 지난 좌클릭의 다른 나라 자리 또는 null 을 읽었다)
  const qk = mainSrc.slice(mainSrc.indexOf("if (metricId === 'population') {"), mainSrc.indexOf("popMetricMenu.showAt(x, y, 'population')"));
  assert.match(qk, /countryClick = \{ lat: hit\.lat, lon: hit\.lon \};/, '우클릭 인구 길이 countryClick 을 세우지 않는다');
});

test('B1 — 값 카드를 올리는 손은 #intel-body 를 굴리고, peek 에서는 먼저 half 로 올린다', () => {
  const fn = mainSrc.slice(mainSrc.indexOf('const revealNoteCard = () => {'), mainSrc.indexOf('const popMetricMenu = new PopMetricMenu('));
  assert.match(fn, /document\.getElementById\('intel-body'\)/, '굴리는 상자는 #intel-body(overflow-y:auto) 다');
  assert.doesNotMatch(fn, /scrollIntoView/, '고정 패널 — scrollIntoView 는 페이지까지 끈다');
  assert.ok(fn.indexOf("shell.setSheet('half')") > 0 && fn.indexOf("shell.setSheet('half')") < fn.indexOf('body.scrollTop'),
    'peek(overflow:hidden)에서 굴리면 손잡이·✕ 가 밀려 나가 되돌릴 수 없다 — 먼저 half');
});

test('B3 — 첫 방문 사건 시트는 폰에서 peek 로 열린다(openIntel 뒤 — 열 때마다 half 로 되돌리므로)', () => {
  const body = mainSrc.slice(mainSrc.indexOf('const openFeedOnce = () => {'), mainSrc.indexOf('setTimeout(openFeedOnce, 2600);'));
  assert.ok(body.length > 0, 'openFeedOnce 가 없다');
  assert.match(body, /shell\.showTab\('feed'\);/, '여는 것 자체(첫인상)는 그대로여야 한다');
  const open = body.indexOf('shell.openIntel();');
  const peek = body.indexOf("shell.setSheet('peek')");
  assert.ok(open > 0 && peek > open, "setSheet('peek') 가 openIntel 뒤에 없다 — setIntelOpen 이 half 로 덮는다");
  assert.match(body, /window\.matchMedia\(PHONE_MQ\)\.matches\) shell\.setSheet\('peek'\)/, '넓은 화면까지 peek 로 바꾼다');
  // 그 전제: 셸은 열 때 half 로 되돌린다 · setSheet 을 밖에 내준다 · peek 는 셋 중 하나다
  assert.match(shellSrc, /if \(intelOpen\) setSheet\('half'\);/);
  assert.match(shellSrc, /const SHEET_STEPS = \['peek', 'half', 'full'\];/);
  assert.match(shellSrc, /setSheet,\n\s+getPhenomenonContext,/);
  assert.match(mainSrc, /const INTRO_FEED_KEY = 'earthus\.v2\.feedIntro';/, '한 번만 여는 열쇠가 바뀌었다');
});

test('B3 — 첫 방문 peek 가 그 다음 사람이 청한 값을 가두지 않는다(값을 여는 세 문이 openIntel 뒤에 half 로 올린다)', () => {
  // 적대 검토 실측(402×714): 첫 방문 peek → 퀵메뉴 '기온' · 바다 누르기 → 시트가 peek 그대로라 카드 머리만 보였다.
  //   ui-shell setIntelOpen 은 이미 열린 시트에는 일찍 돌아가 '열 때 half' 에 닿지 않는다.
  const fn = mainSrc.slice(mainSrc.indexOf('const liftPeekForValue = () => {'), mainSrc.indexOf('const stageNote = '));
  assert.ok(fn.length > 0, 'liftPeekForValue 가 없다');
  assert.match(fn, /dataset\.sheet !== 'peek'/);
  assert.match(fn, /dataset\.tab !== 'now' && el\.dataset\.tab !== 'point'/, "사건 탭('follow' 로 탭이 안 바뀐 경우)까지 키운다");
  assert.match(fn, /window\.matchMedia\(PHONE_MQ\)\.matches\) shell\.setSheet\('half'\)/, '넓은 화면까지 건드린다');
  const showNote = mainSrc.slice(mainSrc.indexOf('const showNote = (title, body, badge, source) => {'), mainSrc.indexOf('const PHONE_MQ ='));
  assert.match(showNote, /shell\.openIntel\(\);\n\s+liftPeekForValue\(\);/, 'showNote(퀵메뉴·사건 표식 등)가 peek 를 올리지 않는다');
  const marine = mainSrc.slice(mainSrc.indexOf('async function marineSelect('), mainSrc.indexOf('async function marineSelect(') + 900);
  assert.match(marine, /shell\.openIntel\(\);\n\s+liftPeekForValue\(\);/, '바다 누르기가 peek 를 올리지 않는다');
  const pc = mainSrc.slice(mainSrc.indexOf('const openPointCard = ('), mainSrc.indexOf('const openPointCard = (') + 1600);
  assert.match(pc, /shell\.openIntel\('point'\);\n\s+liftPeekForValue\(\);/, '지점 카드 한 장이 peek 에 갇힌다');
  // 색면 고르기는 시트를 열지도 키우지도 않는다(2026-09-23 PD '지구만 바뀐다')
  const stage = mainSrc.slice(mainSrc.indexOf('const stageNote = '), mainSrc.indexOf('const stageNote = ') + 300);
  assert.doesNotMatch(stage, /liftPeekForValue|openIntel/);
});

test('B1 — 지점이 없을 때 팝업은 조용히 남지 않고 닫힌다', () => {
  const cb = mainSrc.slice(mainSrc.indexOf('const popMetricMenu = new PopMetricMenu('), mainSrc.indexOf('const quickMenu = new QuickMenu('));
  assert.match(cb, /if \(!countryClick\) \{ popMetricMenu\.hide\(\); return; \}/);
});

test('B3 — peek 에서는 탭 단추와 머리말을 걷어 사건 첫 줄이 보인다(폰 블록 안)', () => {
  const phone = html.slice(html.indexOf('@media (max-width: 720px), (max-height: 520px) and (pointer: coarse) and (orientation: landscape) {'));
  // (2026-09-24 정정) 한 장 시트 — 탭 단추 줄이 템플릿에서 없어졌다(peek 에서 숨기던 규칙은 걸릴 곳이 없다).
  //   명세 'peek 에는 머리와 첫 카드 머리만'을 이렇게 본다: 탭 단추가 없고 · 시트 머리(무엇을 보고 있나 + ✕)는 peek 에서도 숨지 않는다.
  assert.ok(!/<button data-tab=/.test(shellSrc), 'A10 — 탭 단추가 다시 생겼다');
  assert.match(shellSrc, /<div class="intel-head">[\s\S]{0,200}id="intel-close"/);
  assert.ok(!/\[data-sheet="peek"\][^{]*\.intel-head[^{]*\{[^}]*display:\s*none/.test(html), 'peek 에서 시트 머리(✕)를 숨긴다 — 닫을 길이 없다');
  assert.match(phone, /#intel\[data-sheet="peek"\] #intel-content > \.information-context \{ display: none; \}/,
    "peek 118px 에 머리말('선택 장소: 지도에서 선택')만 서서 사건이 한 줄도 안 보였다");
  // 머리말은 half·full 에서는 그대로다 — 이 규칙 말고는 .information-context 를 숨기지 않는다
  assert.equal((html.match(/\.information-context \{ display: none; \}/g) || []).length, 1);
});

// 2026-09-23 정정: 정확한 토큰(196-bitems)을 못 박으면 다음 변경(197 메뉴 V1 모양)이 이 시험을 깬다.
//   지키려는 것은 'B1·B3 를 실은 뒤로 main.js 토큰이 196 아래로 돌아가지 않는다' 이다.
test('캐시 토큰 — main.js 196 이상 · pop-metric-menu v3', () => {
  const m = html.match(/<script type="module" src="\.\/js\/main\.js\?v=(\d+)-[a-z0-9-]+"><\/script>/);
  assert.ok(m && Number(m[1]) >= 196, 'main.js 캐시 토큰이 B1·B3 이전 값이다');
  assert.doesNotMatch(mainSrc, /pop-metric-menu\.js\?v=2'/);
});
