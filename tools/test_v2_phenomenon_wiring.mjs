// PHASE 2 STEP 2.4 — 현상 레지스트리 런타임 배선.
// 왜: 질문과 영문 이름을 bare id 로 찾고 있었다(MENU_QUESTIONS[l.id], L_EN[id]).
//     같은 id 가 두 씬에 있으면 한쪽 답이 다른 쪽에 나온다 — 실제로 hobby/surf 가
//     ocean/surf 의 질문과 영문 이름을 그대로 쓰고 있었다. 이 시험이 그 회귀를 막는다.
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reg = await import('../prototype/v2-three/js/phenomenon-registry.js');
const { i18n } = await import('../prototype/v2-three/js/i18n.js');
const shellSrc = readFileSync(new URL('../prototype/v2-three/js/ui-shell.js', import.meta.url), 'utf8');

test('레지스트리가 109개 레이어와 66개 현상을 모두 들고 있다', () => {
  assert.equal(Object.keys(reg.LAYER_PHENOMENON).length, 109);
  assert.equal(Object.keys(reg.PHENOMENA).length, 66);
  // 참조된 현상이 전부 정의돼 있어야 한다 — 없는 현상을 가리키면 화면이 빈다.
  for (const [key, v] of Object.entries(reg.LAYER_PHENOMENON)) {
    if (v.phenomenon) assert.ok(reg.PHENOMENA[v.phenomenon], `${key} → ${v.phenomenon} 이 정의돼 있지 않다`);
  }
});

test('surf 충돌 — 두 씬이 서로 다른 질문을 받는다', () => {
  const ocean = reg.questionForLayer('ocean', 'surf');
  const hobby = reg.questionForLayer('hobby', 'surf');
  assert.ok(ocean && hobby);
  assert.notEqual(ocean, hobby, 'hobby/surf 가 다시 ocean/surf 의 질문을 쓰고 있다');
  assert.match(ocean, /해변|낚시/);
  assert.match(hobby, /너울|서핑/);
});

test('surf 충돌 — 영문 이름도 씬마다 다르다', () => {
  i18n.lang = 'en';
  try {
    const ocean = i18n.layer('surf', '해변 271곳·낚시 946곳', 'ocean');
    const hobby = i18n.layer('surf', '서핑', 'hobby');
    assert.notEqual(ocean, hobby, 'hobby/surf 가 다시 ocean/surf 의 영문 이름을 쓰고 있다');
    assert.match(hobby, /Surf/);
    // 씬을 안 주면 기존 bare 경로 그대로 — 기존 호출부가 깨지지 않는다.
    assert.equal(i18n.layer('surf', 'ko'), '271 beaches · 946 fishing spots');
  } finally { i18n.lang = 'ko'; }
});

test('vessel 은 같은 현상이므로 하나로 합쳐져 있다', () => {
  const a = reg.phenomenonForLayer('ocean', 'vessel');
  const b = reg.phenomenonForLayer('hobby', 'vessel');
  assert.ok(a && b);
  assert.equal(a.label.ko, b.label.ko, 'vessel 두 항목이 서로 다른 현상이 됐다');
});

test('ui-shell 이 더 이상 bare id 로 질문을 찾지 않는다', () => {
  assert.ok(!/MENU_QUESTIONS\[/.test(shellSrc), 'ui-shell 에 bare id 질문 조회가 남아 있다');
  assert.match(shellSrc, /questionForLayer\(s\.id,\s*l\.id\)/);
  assert.match(shellSrc, /questionForLayer\(selectedMenu\.s\.id,\s*selectedMenu\.l\.id\)/);
  // i18n.layer 호출은 **전부** 씬을 함께 넘겨야 한다. 개수를 못박으면 렌더러가 늘 때마다 깨진다 —
  // 지켜야 하는 것은 '세 곳'이 아니라 '씬 없이 부르는 곳이 0'이다.
  const calls = shellSrc.match(/i18n\.layer\([^;]*?\)/g) || [];
  assert.ok(calls.length >= 3, `i18n.layer 호출이 ${calls.length}곳뿐이다`);
  const withoutScene = calls.filter((c) => !/s\.id|sceneId/.test(c));
  assert.deepEqual(withoutScene, [], '씬 없이 부르는 i18n.layer 가 남아 있다 — bare id 충돌이 되살아난다');
});

test('레지스트리에 없는 레이어는 조용히 넘어가지 않는다', () => {
  const seen = [];
  const orig = console.warn;
  console.warn = (m) => seen.push(String(m));
  try {
    reg.phenomenonForLayer('nosuch', 'layer');
    reg.phenomenonForLayer('nosuch', 'layer');   // 두 번째는 조용해야 한다(한 번만 경고)
  } finally { console.warn = orig; }
  assert.equal(seen.length, 1, '경고가 없거나 매번 반복된다');
  assert.match(seen[0], /nosuch\/layer/);
  assert.equal(reg.isRegisteredLayer('nosuch', 'layer'), false);
  assert.equal(reg.isRegisteredLayer('ocean', 'surf'), true);
});

test('배경·조작 항목은 현상이 아니지만 등록은 돼 있다', () => {
  // 등록돼 있으면서 현상이 null 인 것은 정상이다 — 경고 대상이 아니다.
  assert.equal(reg.isRegisteredLayer('land', 'globe'), true);
  assert.equal(reg.phenomenonForLayer('land', 'globe'), null);
});

test('리포트 종류는 실제 생성기가 있는 현상에만 붙어 있다', () => {
  const kinds = Object.keys(reg.REPORT_KIND_PHENOMENON);
  assert.equal(kinds.length, 9);
  const mapped = kinds.filter((k) => reg.REPORT_KIND_PHENOMENON[k].phenomenon);
  assert.equal(mapped.length, 7);
  for (const k of mapped) {
    const p = reg.phenomenonForReportKind(k);
    assert.ok(p, `${k} 의 현상을 못 찾는다`);
    assert.equal(p.capabilities.report, true, `${k} 가 report:false 인 현상을 가리킨다`);
  }
  // 대응 현상이 없는 두 종류는 이유가 적혀 있어야 한다 — 조용히 비어 있으면 안 된다.
  for (const k of kinds.filter((x) => !reg.REPORT_KIND_PHENOMENON[x].phenomenon)) {
    assert.ok(reg.REPORT_KIND_PHENOMENON[k].note, `${k} 에 대응 현상도 이유도 없다`);
  }
});

test('시뮬레이션 능력은 정확히 2개다 — 마케팅으로 늘리지 않는다', () => {
  const sim = Object.entries(reg.PHENOMENA).filter(([, p]) => p.capabilities.simulation).map(([id]) => id);
  assert.deepEqual(sim.sort(), ['hazards.tsunami', 'ocean.wave']);
});

// ── PHASE 2 STEP 2.5~2.8 — 선택 문맥과 능력 게이팅 ────────────────────────────
// initShell 은 실제 DOM 을 요구하므로 여기서는 배선 계약을 소스에서 확인한다
// (tools/test_v2_badge_parity.mjs 와 같은 방식).

test('ui-shell 이 선택 문맥을 밖으로 내준다', () => {
  assert.match(shellSrc, /getSelection,/, 'getSelection 이 반환 API 에 없다');
  assert.match(shellSrc, /getPhenomenonContext,/, 'getPhenomenonContext 가 반환 API 에 없다');
  assert.match(shellSrc, /const getSelection = \(\) =>/);
  // 문맥은 복합키를 들고 나가야 한다 — bare id 만 주면 받는 쪽이 다시 충돌한다.
  assert.match(shellSrc, /layerKey: `\$\{s\.id\}\/\$\{l\.id\}`/);
});

test('선택이 바뀌는 모든 지점에서 능력 게이팅이 다시 돈다', () => {
  const calls = (shellSrc.match(/applyCapabilityGating\(\)/g) || []).length;
  // 정의 1 + 호출 3(메뉴 클릭 · setSelection · clearSelection)
  assert.ok(calls >= 4, `게이팅 호출이 ${calls}곳뿐이다 — 선택 경로 하나가 빠졌다`);
  assert.match(shellSrc, /selectedMenu=\{s:scene,l:layer\}; applyCapabilityGating\(\)/, '메뉴 클릭 경로에서 게이팅이 안 돈다');
});

test('능력 없는 행동은 숨긴다 — 준비 중으로 위장하지 않는다', () => {
  assert.match(shellSrc, /CAP_TAB = \{ scenario: 'simulation', next: 'forecast' \}/);
  assert.match(shellSrc, /btn\.hidden = hide/);
  // 숨긴 탭이 열려 있었으면 되돌린다 — 빈 화면을 남기지 않는다.
  assert.match(shellSrc, /if \(hide && curTab === tab\) showTab\('feed'\)/);
  assert.ok(!/준비\s*중/.test(shellSrc.slice(shellSrc.indexOf('CAP_TAB'), shellSrc.indexOf('CAP_TAB') + 900)),
    '능력 없는 행동을 "준비 중"으로 표시하고 있다');
});

test('낙뢰는 시뮬레이션도 예보도 없으므로 두 탭이 모두 숨겨져야 한다', () => {
  const p = reg.PHENOMENA['hazards.lightning'];
  assert.equal(p.capabilities.simulation, false);
  assert.equal(p.capabilities.forecast, false);
});

test('파고는 시뮬레이션은 있고 예보는 없다 — 지침서 §45 기대와 다른 실제', () => {
  const p = reg.PHENOMENA['ocean.wave'];
  assert.equal(p.capabilities.simulation, true);
  assert.equal(p.capabilities.forecast, false, 'marine.json 은 current= 만 받는다');
});

test('태풍은 예보·리포트는 있고 시뮬레이션은 없다', () => {
  const p = reg.PHENOMENA['hazards.typhoon'];
  assert.equal(p.capabilities.forecast, true);
  assert.equal(p.capabilities.report, true);
  assert.equal(p.capabilities.simulation, false, '5행 상수표는 시뮬레이션이 아니다');
});

test('어떤 레이어도 질문을 잃지 않았다 — 현상이 아닌 항목도 질문을 갖는다', async () => {
  const mg = await import('../prototype/v2-three/js/menu-guide.js');
  const lost = [];
  const missing = [];
  for (const key of Object.keys(reg.LAYER_PHENOMENON)) {
    const [s, l] = key.split('/');
    const now = reg.questionForLayer(s, l);
    if (!now) missing.push(key);
    if (mg.MENU_QUESTIONS[l] && !now) lost.push(key);
  }
  // 배경·조작·진입점은 현상이 아니지만 메뉴에서는 질문을 보여 준다. 행에 붙은 question 이 그 자리다.
  assert.deepEqual(lost, [], '레지스트리로 옮기면서 질문이 사라진 레이어가 있다');
  assert.deepEqual(missing, [], '질문이 없는 레이어가 있다 — 메뉴에 레이어 이름이 질문 자리에 나온다');
});
