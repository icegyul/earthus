// 지시서 §16·§19 — 시뮬레이션 능력 레지스트리 계약 시험.
// 질문 → 현상 → 연산 → 능력 → 엔진 → 실행 흐름이 실제 파일과 실제 레지스트리에
// 묶여 있는지 매번 대조한다. 레지스트리가 거짓말을 하면 화면도 거짓말을 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const reg = await import('../../prototype/v2-three/js/phenomenon-registry.js');
const { SIM_STATUS, SIM_CAPABILITIES, simEntryFor, questionsForPhenomenon } =
  await import('../../prototype/v2-three/js/sim-questions.js');

const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const mainSrc = src('prototype/v2-three/js/main.js');
const shellSrc = src('prototype/v2-three/js/ui-shell.js');
const entrySrc = src('prototype/v2-three/js/sim-questions.js');

test('레지스트리의 모든 항목은 정본 현상표에 있는 id 다', () => {
  assert.equal(Object.keys(reg.PHENOMENA).length, 66);
  for (const id of Object.keys(SIM_CAPABILITIES)) {
    assert.ok(reg.PHENOMENA[id], `시뮬 능력표가 정본에 없는 현상을 만들었다: ${id}`);
  }
});

test('질문은 현상마다 기본 3개를 넘지 않고, 항상 KO·EN 이 쌍으로 있다', () => {
  for (const [id, entry] of Object.entries(SIM_CAPABILITIES)) {
    assert.ok(entry.questions.length <= 3, `${id}: 질문이 3개를 넘는다`);
    assert.ok(entry.questions.length >= 1, `${id}: 질문이 없다`);
    for (const q of entry.questions) {
      assert.ok(q.ko && q.en, `${id}/${q.id}: 문장이 한쪽 언어에만 있다`);
      assert.ok(q.id, `${id}: 질문에 id 가 없다`);
    }
  }
});

test('상태 어휘는 지시서 §16의 다섯 개다', () => {
  assert.deepEqual(Object.values(SIM_STATUS).sort(),
    ['available', 'limited', 'not_available', 'not_evaluable', 'unavailable']);
  for (const entry of Object.values(SIM_CAPABILITIES)) {
    assert.ok(Object.values(SIM_STATUS).includes(entry.status));
  }
});

test('available 은 실제 엔진 파일을 가리킨다 — 파일이 없으면 거짓말이다', () => {
  for (const [id, entry] of Object.entries(SIM_CAPABILITIES)) {
    if (entry.status !== SIM_STATUS.AVAILABLE && entry.status !== SIM_STATUS.LIMITED) continue;
    assert.ok(entry.engine, `${id}: available 인데 엔진 설명이 없다`);
    assert.ok(entry.engineRef, `${id}: available 인데 엔진 파일이 없다`);
    assert.ok(existsSync(new URL(`../../${entry.engineRef}`, import.meta.url)),
      `${id}: engineRef 파일이 저장소에 없다 — ${entry.engineRef}`);
  }
});

test('엔진이 없는 질문은 실행 액션을 갖지 않는다 — 가짜 호출 금지 (§18)', () => {
  for (const [id, entry] of Object.entries(SIM_CAPABILITIES)) {
    for (const q of entry.questions) {
      if (entry.status === SIM_STATUS.NOT_AVAILABLE) {
        assert.ok(!q.action, `${id}/${q.id}: 엔진이 없는데 실행 액션을 갖는다`);
        assert.ok(q.reasonKo && q.reasonEn, `${id}/${q.id}: 없는 이유를 말하지 않는다`);
      }
      if (q.status === SIM_STATUS.LIMITED) {
        assert.ok(q.reasonKo && q.reasonEn, `${id}/${q.id}: limited 인데 한계 설명이 없다`);
      }
    }
  }
});

test('실행 가능한 질문의 액션은 main.js 가 실제로 받는다 — 연결이 조용히 끊기지 않는다', () => {
  assert.match(mainSrc, /action === 'sim-q'/, 'main.js 에 sim-q 분기가 없다');
  for (const entry of Object.values(SIM_CAPABILITIES)) {
    for (const q of entry.questions) {
      if (!q.action) continue;
      assert.ok(mainSrc.includes(`ds.sim === '${q.action}'`),
        `질문 액션 ${q.action} 을 main.js 가 받지 않는다`);
    }
  }
});

test('화면은 레지스트리가 없는 현상에 질문 블록을 그리지 않는다', () => {
  assert.match(shellSrc, /simEntryFor\(pctx\.phenomenonId\)/);
  assert.ok(!/const SIM_CAPABILITIES/.test(shellSrc), 'ui-shell 이 능력표를 따로 들고 있다');
  assert.equal(simEntryFor('weather.precipitation') !== null, true);
  assert.equal(simEntryFor('weather.temperature'), null, '없는 현상 조회가 null 이어야 한다');
  assert.equal(simEntryFor(null), null);
});

test('입력이 없으면 available 이 not_evaluable 로 내려가 입력 방법을 안내한다 (§19)', () => {
  const ko = { ko: true };
  const qs = questionsForPhenomenon('ocean.wave', ko, { hasInput: false, whyKo: '먼저 바다 지점을 선택하세요' });
  const move = qs.find((q) => q.id === 'wave-motion');
  assert.equal(move.status, 'not_evaluable');
  assert.equal(move.runnable, false);
  assert.match(move.reason, /바다 지점/);
  // 입력이 있으면 실행 가능한 버튼이 된다.
  const ok = questionsForPhenomenon('ocean.wave', ko, { hasInput: true });
  assert.equal(ok.find((q) => q.id === 'wave-motion').runnable, true);
  // 문맥이 없으면(선택 전) available 은 그대로 실행 버튼이다.
  const plain = questionsForPhenomenon('ocean.wave', ko, null);
  assert.equal(plain.find((q) => q.id === 'wave-motion').runnable, true);
});

test('질문 문장은 선택 언어를 따르고, 없는 엔진의 이유를 실제로 말한다', () => {
  const koQ = questionsForPhenomenon('weather.precipitation', { ko: true }, null);
  assert.match(koQ[0].text, /비가 어디로/);
  assert.equal(koQ[0].runnable, false);
  assert.ok(koQ[0].reason.length > 5);
  const enQ = questionsForPhenomenon('weather.precipitation', { ko: false }, null);
  assert.match(enQ[0].text, /rain move/i);
});

test('화면 배선 — 궁금한 점·직접 질문하기·sim-why 가 셸에 있다', () => {
  assert.match(shellSrc, /data-action="sim-q" data-sim=/);
  assert.match(shellSrc, /data-action="sim-why"/);
  assert.match(shellSrc, /data-action="shell-open-ask"/);
  assert.match(mainSrc, /action === 'shell-open-ask'/);
  assert.match(shellSrc, /simQuestionsHtml\(\)/);
  assert.match(entrySrc, /slice\(0, 3\)/, '레지스트리가 기본 3개를 자르지 않는다');
});
