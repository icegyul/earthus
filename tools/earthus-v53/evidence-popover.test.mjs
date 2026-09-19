// M1 — 근거 배지 설명(EvidenceBadge 팝오버) 시험. 어휘는 EVIDENCE_KIND 10종 하나다(intel-vocab.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = (p) => new URL(`../../${p}`, import.meta.url);
const vocab = JSON.parse(readFileSync(root('aws/_shared/contracts/intel-vocab.json'), 'utf8'));
const ev = await import('../../prototype/v2-three/js/evidence-popover.js');
const bridge = readFileSync(root('prototype/v2-three/js/engine-bridge.js'), 'utf8');
const main = readFileSync(root('prototype/v2-three/js/main.js'), 'utf8');

test('10종 전부 정의와 "하지 말 것"이 KO·EN 으로 있다 — 새 어휘 없음', () => {
  assert.deepEqual(Object.keys(ev.KIND_INFO).sort(), [...vocab.EVIDENCE_KIND].sort());
  for (const [k, v] of Object.entries(ev.KIND_INFO)) {
    for (const lang of ['ko', 'en']) {
      assert.equal(v[lang].length, 3, `${k}/${lang}`);
      assert.ok(v[lang].every((s) => s && s.length >= 2), `${k}/${lang} 빈 칸`);   // '기록'·'표현' 은 두 글자
    }
  }
});

test('설명에 인과 어휘가 없고, 출처·시각은 카드의 출처 줄을 가리킨다(지어내지 않는다)', () => {
  for (const k of vocab.EVIDENCE_KIND) {
    const html = ev.popoverHtml(k, true) + ev.popoverHtml(k, false);
    for (const w of vocab.FORBIDDEN_CAUSAL) assert.ok(!html.toLowerCase().includes(w.toLowerCase()), `${k} 에 '${w}'`);
    assert.match(ev.popoverHtml(k, true), /출처 줄/);
  }
  assert.equal(ev.popoverHtml('MODEL', true), '', '모르는 종류는 설명을 만들지 않는다');
});

test('시뮬레이션·특보는 안전 판단의 선을 긋는다', () => {
  assert.match(ev.popoverHtml('SIMULATION', true), /대피·안전 판단에 쓰지 마세요/);
  assert.match(ev.popoverHtml('OFFICIAL_WARNING', true), /기관 안내를 따르세요/);
});

test('배지가 종류를 달고, 앱이 설명을 붙인다 — 버튼 안 배지는 가로채지 않는다', () => {
  assert.match(bridge, /data-kind="\$\{kind\}" tabindex="0"/);
  assert.match(main, /attachEvidencePopover\(i18n\);/);
  const src = readFileSync(root('prototype/v2-three/js/evidence-popover.js'), 'utf8');
  assert.match(src, /!badge\.closest\('button, a, \[data-action\]'\)/);
  assert.ok(!/\bfetch\(/.test(src), '설명은 요청하지 않는다');
});
