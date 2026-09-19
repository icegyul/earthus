// INTELLIGENCE-LAYER-PLAN P0 · 계약 §C-0·§C-3 — Intelligence 질문 레지스트리 · 연결표 · 어휘 정본 시험.
// 레지스트리가 거짓말을 하면 띠도 거짓말을 한다. 값을 만드는 곳이 아니라 '재료가 있나'를 말하는 곳이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = (p) => new URL(`../../${p}`, import.meta.url);
const vocab = JSON.parse(readFileSync(root('aws/_shared/contracts/intel-vocab.json'), 'utf8'));
const reg = await import('../../prototype/v2-three/js/phenomenon-registry.js');
const iq = await import('../../prototype/v2-three/js/intel-questions.js');
const rel = await import('../../prototype/v2-three/js/phenomenon-relations.js');
const { EVIDENCE_KIND } = await import('../../prototype/js/earthus2/v02/core/constants.js');

const AT = '2026-09-20T00:00:00Z';
const packet = () => ({
  schema: 1, phenomenonId: 'hazards.typhoon', eventId: 'cyclone:1',
  time: { retrievedAt: AT },
  current: { values: [{ key: 'maxWind', value: 35, unit: 'm/s', kind: 'OFFICIAL_OBSERVATION', source: 'KMA', at: AT }] },
  conditions: [{ key: 'sst', value: 28.4, unit: '°C', kind: 'OFFICIAL_OBSERVATION', source: 'NOAA OISST' }],
  related: [{ phenomenonId: 'weather.warning', relation: 'co_located', evidence: { distanceKm: 120 } }],
  sources: [{ id: 'kma', kind: 'OFFICIAL_OBSERVATION', ageMin: 40, slaMin: 180 }],
  coverage: { missing: [
    { section: 'next', reason: '공식 +24h 전망이 아직 없다' },
    { section: 'change', reason: '회차가 하나뿐' }, { section: 'anomaly', reason: 'P1' },
    { section: 'pattern', reason: 'P1' }, { section: 'importance', reason: 'P1' },
    { section: 'confidence', reason: '산식 없음' }, { section: 'uncertainty', reason: '자료 없음' },
  ] },
});

// ── 어휘 단일 정본 (§C-3) ─────────────────────────────────────────────────
test('EVIDENCE_KIND 의 JS 사본은 어휘 정본과 같다 — 두 개의 진실 금지', () => {
  assert.deepEqual(Object.values(EVIDENCE_KIND), vocab.EVIDENCE_KIND);
});

test('5절 대응표는 어휘 정본과 같다', () => {
  const want = Object.fromEntries(Object.entries(vocab.INTEL_SECTIONS).filter(([k]) => !k.startsWith('_')));
  assert.deepEqual(JSON.parse(JSON.stringify(iq.INTEL_SECTIONS)), want);
  assert.deepEqual(iq.INTEL_QUESTIONS.map((q) => q.section).sort(), Object.keys(want).sort());
  assert.ok(!('REPORT' in iq.INTEL_SECTIONS), 'REPORT 는 EXPLORER 발행물이지 5절이 아니다');
});

test('연결 종류는 어휘 정본의 셋이다', () => {
  assert.deepEqual([...rel.RELATION], vocab.RELATION);
});

// ── 질문 레지스트리 (LAYER-PLAN §2.2) ──────────────────────────────────────
test('질문 문장은 KO·EN 쌍이고 인과 어휘가 없다 — WHY 는 원인이 아니라 함께 나타난 조건', () => {
  for (const q of iq.INTEL_QUESTIONS) {
    assert.ok(q.ko && q.en, q.id);
    for (const w of vocab.FORBIDDEN_CAUSAL) {
      assert.ok(!q.ko.includes(w) && !q.en.toLowerCase().includes(w.toLowerCase()), `${q.id} 에 '${w}'`);
    }
  }
  assert.doesNotMatch(iq.INTEL_QUESTIONS.find((q) => q.section === 'WHY').ko, /원인|때문/);
});

test('패킷이 없으면 not_evaluable, 절이 있으면 available, missing 이면 이유와 함께 not_available', () => {
  const none = iq.intelQuestionsFor('hazards.typhoon', null, { ko: true });
  assert.equal(none.length, 5);
  assert.ok(none.every((q) => q.status === 'not_evaluable' && !q.runnable));
  const qs = iq.intelQuestionsFor('hazards.typhoon', packet(), { ko: true });
  const by = Object.fromEntries(qs.map((q) => [q.section, q]));
  for (const s of ['WHAT', 'WHY', 'IMPACT', 'EVIDENCE']) assert.equal(by[s].status, 'available', s);
  assert.equal(by.NEXT.status, 'not_available');
  assert.equal(by.NEXT.runnable, false, '빈 NEXT 카드 금지 — 누를 수 없다');
  assert.match(by.NEXT.reason, /\+24h 전망/);
  assert.ok(qs.every((q) => q.action === iq.INTEL_ACTION));
});

test('Intelligence 능력이 없는 현상은 질문 블록을 만들지 않는다', () => {
  assert.equal(iq.hasIntel('land.terrain'), false, '재감사로 내려간 현상');
  assert.deepEqual(iq.intelQuestionsFor('land.terrain', packet(), { ko: true }), []);
  assert.deepEqual(iq.intelQuestionsFor('no.such', packet(), { ko: true }), []);
});

test('JS 상태 규칙은 파이썬 section_status 와 같은 문장으로 적혀 있다', () => {
  const py = readFileSync(root('aws/_shared/intel_contract.py'), 'utf8');
  assert.match(py, /def section_status\(packet, intel_section\)/);
  // 두 쪽이 같은 규칙을 말하는지 — 패킷 없음·EVIDENCE·missing 이유 세 갈래가 둘 다 있다.
  for (const token of ['not_evaluable', 'not_available', 'EVIDENCE']) {
    assert.ok(py.includes(token), `파이썬에 ${token} 갈래가 없다`);
  }
});

test('패킷 주소는 LAYER-PLAN §2.1 모양이다', () => {
  assert.equal(iq.intelPacketKey('hazards.typhoon'), 'intel/hazards.typhoon.json');
  assert.equal(iq.intelPacketKey('hazards.typhoon', 'cyclone:1'), 'intel/hazards.typhoon/cyclone%3A1.json');
});

// ── 66 재감사 (P0 완료 기준 — 감사표) ──────────────────────────────────────
test('intelligence:true 는 패킷 재료(LAYER_TRUTH 등급이 있는 자료)가 있는 현상뿐이다', async () => {
  const { LAYER_TRUTH } = await import('../../prototype/v2-three/js/engine-bridge.js');
  const bad = [];
  for (const [id, p] of Object.entries(reg.PHENOMENA)) {
    if (!p.capabilities.intelligence) continue;
    const ok = (p.dataProducts || []).some((k) => LAYER_TRUTH[k] && LAYER_TRUTH[k].kind !== 'VISUALIZATION_ONLY');
    if (!ok) bad.push(id);
  }
  assert.deepEqual(bad, [], `재료 없는 intelligence:true — ${bad.join(', ')}`);
  assert.ok(existsSync(root('docs/INTEL-REAUDIT-2026-09-20.md')), '감사표 문서가 없다');
});

// ── 연결표 (LAYER-PLAN §2.3) ─────────────────────────────────────────────
test('연결은 정본 현상 사이에만 있고, 근거가 실제로 있다', () => {
  assert.ok(rel.RELATIONS.length >= 1);
  for (const r of rel.RELATIONS) {
    assert.ok(reg.PHENOMENA[r.from], `정본에 없는 현상: ${r.from}`);
    assert.ok(reg.PHENOMENA[r.to], `정본에 없는 현상: ${r.to}`);
    assert.ok(rel.RELATION.includes(r.relation), r.relation);
    assert.ok(r.ruleKo && r.ruleEn, `${r.from}→${r.to} 에 규칙 문장이 없다`);
    if (r.relation === 'reference') {
      assert.ok(r.citation && r.citation.length > 20, `${r.from}→${r.to}: 교과서 관계는 문헌을 단다`);
    } else {
      assert.ok(r.evidenceRef && existsSync(root(r.evidenceRef)), `${r.from}→${r.to}: 근거 파일이 없다 — ${r.evidenceRef}`);
    }
    for (const w of vocab.FORBIDDEN_CAUSAL) {
      for (const t of [r.ruleKo, r.ruleEn]) assert.ok(!t.toLowerCase().includes(w.toLowerCase()), `${r.from}→${r.to} 에 '${w}'`);
    }
  }
});

test('계산된 연쇄는 지진→쓰나미 하나뿐이다 — 늘리려면 계산이 먼저 있어야 한다', () => {
  const computed = rel.RELATIONS.filter((r) => r.relation === 'computed').map((r) => `${r.from}>${r.to}`);
  assert.deepEqual(computed, ['hazards.earthquake>hazards.tsunami']);
});
