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
  // 메뉴·근거·켜진자료 세 곳 모두 씬을 넘겨야 한다.
  assert.equal((shellSrc.match(/i18n\.layer\([^)]*s\.id\)/g) || []).length, 3);
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
