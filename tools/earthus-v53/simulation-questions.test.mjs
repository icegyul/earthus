// 지시서 §16·§19 — 시뮬레이션 능력 레지스트리 계약 시험.
// 질문 → 현상 → 연산 → 능력 → 엔진 → 실행 흐름이 실제 파일과 실제 레지스트리에
// 묶여 있는지 매번 대조한다. 레지스트리가 거짓말을 하면 화면도 거짓말을 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const reg = await import('../../prototype/v2-three/js/phenomenon-registry.js');
const { SIM_STATUS, SIM_CAPABILITIES, simEntryFor, questionsForPhenomenon, previewSceneFor } =
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
  // (weather.temperature 는 2026-09-20 §G-2 로 not_available 등재됐다 — 등재 안 된 현상으로 바꿨다)
  assert.equal(simEntryFor('weather.uv'), null, '없는 현상 조회가 null 이어야 한다');
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

// ── 2026-09-20 계약 §G-2 · §K-2 ──────────────────────────────────────────
test('available 은 기록 남는 검증된 계산뿐이다 — 쓰나미 하나 (§G-2 정정)', () => {
  const avail = Object.entries(SIM_CAPABILITIES)
    .filter(([, e]) => e.status === SIM_STATUS.AVAILABLE).map(([id]) => id);
  assert.deepEqual(avail, ['hazards.tsunami']);
  assert.equal(SIM_CAPABILITIES['ocean.wave'].status, SIM_STATUS.LIMITED);
  assert.equal(SIM_CAPABILITIES['space.satellite'].status, SIM_STATUS.LIMITED);
  assert.ok(!SIM_CAPABILITIES['ocean.wave'].questions.some((q) => q.id === 'wave-typhoon'),
    '태풍 파도를 계산하는 엔진이 없다 — 계산처럼 읽히는 질문을 두지 않는다');
});

test('능력표와 현상표는 같은 말을 한다 — simulation:true 인 현상 = available 인 항목', () => {
  const sim = Object.entries(reg.PHENOMENA).filter(([, p]) => p.capabilities.simulation).map(([id]) => id).sort();
  const avail = Object.entries(SIM_CAPABILITIES).filter(([, e]) => e.status === SIM_STATUS.AVAILABLE).map(([id]) => id).sort();
  assert.deepEqual(sim, avail);
});

test('limited 는 액션이 있으면 누를 수 있고, 한계 문장을 항상 같이 낸다', () => {
  const ko = { ko: true };
  const wave = questionsForPhenomenon('ocean.wave', ko, { hasInput: true }).find((q) => q.id === 'wave-motion');
  assert.equal(wave.status, 'limited');
  assert.equal(wave.runnable, true, '파도 장면 버튼이 "왜 없나" 버튼으로 바뀌면 안 된다');
  assert.match(wave.reason, /기록 남는 계산이 아니/);
  const sat = questionsForPhenomenon('space.satellite', ko, null)[0];
  assert.equal(sat.runnable, true);
  assert.match(sat.reason, /기록 남는 계산이 아닙니다/);
  // 태풍 경로는 공식 예보 탭으로 간다 — 예전에는 limited 라 sim-why 로만 그려져 main.js 분기가 죽어 있었다.
  const ty = questionsForPhenomenon('hazards.typhoon', ko, null)[0];
  assert.equal(ty.runnable, true);
  assert.match(ty.reason, /기관 공식 예보/);
});

test('등재 9건(CROSSWALK §4-1)은 없는 이유만 말하고 실행 액션이 없다', () => {
  const nine = ['hazards.glacial_lake_flood', 'hazards.earthquake', 'land.snow_cover', 'ocean.sea_ice',
    'ocean.sea_level_rise', 'ocean.subsurface_profile', 'weather.temperature', 'weather.air_quality', 'weather.wind'];
  for (const id of nine) {
    const e = SIM_CAPABILITIES[id];
    assert.ok(e, `${id} 가 등재되지 않았다`);
    assert.equal(e.status, SIM_STATUS.NOT_AVAILABLE, id);
    for (const q of e.questions) {
      assert.ok(!q.action, `${id}/${q.id}`);
      assert.ok(q.reasonKo.length > 10 && q.reasonEn.length > 10, `${id}/${q.id} 사유가 비었다`);
    }
    for (const q of questionsForPhenomenon(id, { ko: true }, null)) assert.equal(q.runnable, false, id);
  }
  // 파일럿 사양: 기온은 "왜 없는지" 읽기 — 질문 블록이 생기고, 누르면 이유를 말한다.
  assert.match(questionsForPhenomenon('weather.temperature', { ko: true }, null)[0].reason, /기관 발표를 인용/);
});

test('가정 장면(Preview)은 능력과 따로 적혀 있고, 시나리오 탭은 둘 중 하나로 열린다 (§K-2)', () => {
  assert.ok(previewSceneFor('ocean.wave'), '태풍 해상 가정 장면으로 가는 길이 끊겼다');
  assert.ok(previewSceneFor('hazards.typhoon'));
  assert.equal(previewSceneFor('hazards.tsunami'), null, '쓰나미는 장면이 아니라 실제 계산이다');
  assert.equal(previewSceneFor('weather.temperature'), null);
  assert.match(shellSrc, /const hide = !ctx \|\| !ctx\.capabilities\[cap\] && !\(tab === 'scenario' && previewSceneFor\(ctx\.phenomenonId\)\)/);
  // 장면 카드는 SIMULATION 배지를 달지 않는다 — RUN(기록 남는 계산)만 받는다.
  const scen = mainSrc.slice(mainSrc.indexOf('getScenario: () => {'), mainSrc.indexOf('getScenario: () => {') + 6000);
  const typhoonPart = scen.slice(scen.indexOf("const hasSea = seaPoint && seaPoint.marine;"));
  assert.ok(!/SIMULATION_ONLY/.test(typhoonPart.slice(0, typhoonPart.indexOf('</div></div>`;', typhoonPart.indexOf('시나리오 시작')))),
    '태풍 가정 장면 카드에 SIMULATION 배지가 남아 있다');
});

test('화면 배선 — 궁금한 점·직접 질문하기·sim-why 가 셸에 있다', () => {
  assert.match(shellSrc, /data-action="sim-q" data-sim=/);
  assert.match(shellSrc, /data-action="sim-why"/);
  assert.match(shellSrc, /data-action="shell-open-ask"/);
  assert.match(mainSrc, /action === 'shell-open-ask'/);
  assert.match(shellSrc, /simQuestionsHtml\(\)/);
  assert.match(entrySrc, /slice\(0, 3\)/, '레지스트리가 기본 3개를 자르지 않는다');
});
