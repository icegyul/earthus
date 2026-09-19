// P1 — Intelligence 띠 렌더러 시험. 2026-09-20 운영 태풍(DUJUAN-26) 패킷을 aws/cyclone-analog/intel_v1.py 로
// v1 으로 옮긴 픽스처(tools/earthus-v53/fixtures/intel-v1-typhoon-1001322.json)로 돈다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = (p) => new URL(`../../${p}`, import.meta.url);
const V1 = JSON.parse(readFileSync(new URL('./fixtures/intel-v1-typhoon-1001322.json', import.meta.url), 'utf8'));
const vocab = JSON.parse(readFileSync(root('aws/_shared/contracts/intel-vocab.json'), 'utf8'));
const s = await import('../../prototype/v2-three/js/intel-strip.js');
const shellSrc = readFileSync(root('prototype/v2-three/js/ui-shell.js'), 'utf8');
const mainSrc = readFileSync(root('prototype/v2-three/js/main.js'), 'utf8');
const ko = { ko: true };

test('운영 패킷 → 띠에 값 한 줄과 재료 있는 절의 질문 다섯', () => {
  const html = s.intelStripHtml({ phenomenonId: 'hazards.typhoon', packet: V1, i18n: ko });
  assert.match(html, /최대풍속 <b>35 m\/s<\/b> · 강/);
  assert.match(html, /변화 <b>\+3 m\/s<\/b>/);
  assert.equal((html.match(/data-action="intel-q"/g) || []).length, 5);
  for (const sec of ['WHAT', 'WHY', 'NEXT', 'IMPACT', 'EVIDENCE']) assert.match(html, new RegExp(`data-sec="${sec}"`));
  assert.ok(!/sq-lock/.test(html), 'FREE_OPEN(유료 출시 전)에는 잠금이 없다');
});

test('패킷이 없거나 다른 현상이면 아무것도 그리지 않는다 — 빈 띠 금지', () => {
  assert.equal(s.intelStripHtml({ phenomenonId: 'hazards.typhoon', packet: null, i18n: ko }), '');
  assert.equal(s.intelStripHtml({ phenomenonId: 'ocean.wave', packet: V1, i18n: ko }), '');
  assert.equal(s.intelOf({ intel: null }), null);
  assert.equal(s.intelOf({ intel: { schema: 2, phenomenonId: 'x' } }), null, '모르는 판은 없는 것으로');
});

test('재료가 없는 절은 질문에서 빠진다 (빈 NEXT 금지)', () => {
  const p = structuredClone(V1);
  delete p.next;
  p.coverage.missing.push({ section: 'next', reason: '기관 예보 없음' });
  const html = s.intelStripHtml({ phenomenonId: 'hazards.typhoon', packet: p, i18n: ko });
  assert.ok(!/data-sec="NEXT"/.test(html));
  assert.match(s.intelSectionHtml({ packet: p, section: 'NEXT', i18n: ko }), /기관 예보 없음/);
});

test('유료 모드 FREE 는 WHY·IMPACT 를 일부만 보고 잠금 설명을 받는다 — WHAT·NEXT 는 무료', () => {
  const opt = { mode: 'PAID', tier: 'free' };
  const strip = s.intelStripHtml({ phenomenonId: 'hazards.typhoon', packet: V1, i18n: ko, ...opt });
  assert.equal((strip.match(/sq-lock/g) || []).length, 2, 'WHY·IMPACT 두 곳만 잠긴다');
  const why = s.intelSectionHtml({ packet: V1, section: 'WHY', i18n: ko, ...opt });
  assert.match(why, /29\.29/, '결과 일부는 보인다');
  assert.match(why, /함께 나타난 조건/);
  assert.match(why, /사전등록/, '잠금은 다음 손을 말한다');
  assert.ok(!/why’|‘why/.test(why), '내부 키를 사용자 문구로 쓰지 않는다');
  const next = s.intelSectionHtml({ packet: V1, section: 'NEXT', i18n: ko, ...opt });
  assert.ok(!/사전등록/.test(next), '기관 예보는 무료다');
  const explorer = s.intelSectionHtml({ packet: V1, section: 'WHY', i18n: ko, mode: 'PAID', tier: 'explorer' });
  assert.ok(!/사전등록/.test(explorer));
});

test('절 본문에 인과 어휘가 없고, WHY 는 원인이 아니라고 말한다', () => {
  for (const sec of ['WHAT', 'WHY', 'NEXT', 'IMPACT', 'EVIDENCE']) {
    const html = s.intelSectionHtml({ packet: V1, section: sec, i18n: ko });
    for (const w of vocab.FORBIDDEN_CAUSAL) assert.ok(!html.includes(w), `${sec} 에 '${w}'`);
  }
  assert.match(s.intelSectionHtml({ packet: V1, section: 'WHY', i18n: ko }), /원인이라고 말하지 않습니다/);
  assert.match(s.intelSectionHtml({ packet: V1, section: 'NEXT', i18n: ko }), /우리가 만든 예보가 아닙니다/);
  assert.match(s.intelSectionHtml({ packet: V1, section: 'IMPACT', i18n: ko }), /교과서 관계/);
  assert.match(s.intelSectionHtml({ packet: V1, section: 'EVIDENCE', i18n: ko }), /anomaly/, '빠진 절을 숨기지 않는다');
});

test('띠는 요청·계산을 하지 않는다 (계약 §C-0) — fetch·LLM 호출이 없다', () => {
  const src = readFileSync(root('prototype/v2-three/js/intel-strip.js'), 'utf8');
  assert.ok(!/\bfetch\(|XMLHttpRequest|\/api\/ask/.test(src));
});

test('화면 배선 — 셸에 띠, main.js 에 intel-q 분기, limited 한계 문장', () => {
  assert.match(shellSrc, /\$\{simQuestionsHtml\(\)\}\$\{regionLine\(\)\}\$\{intelStripBlock\(\)\}/);   // §L 지역 한 줄이 사이에 온다
  assert.match(shellSrc, /packet: intelOf\(hooks\.getEventPacket\?\.\(\)\)/);
  assert.match(mainSrc, /action === 'intel-q'/);
  assert.match(mainSrc, /getEventPacket: \(\) =>/);
  // 레지스트리만 정직하고 화면이 한계 문장을 버리면 안 된다(2026-09-20 권고 #1)
  assert.match(shellSrc, /q\.status === 'limited' && q\.reason \? `<div class="sq-why sq-limit">/);
});
