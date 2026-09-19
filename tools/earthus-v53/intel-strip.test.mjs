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

// P3 — 같은 띠가 태풍 밖 현상을 그린다(코드 분기 없이 패킷의 이름표로). 2026-09-20 운영 패킷을 그대로 옮긴 픽스처.
const SST = JSON.parse(readFileSync(new URL('./fixtures/intel-v1-sst-20260920.json', import.meta.url), 'utf8'));
const EQ = JSON.parse(readFileSync(new URL('./fixtures/intel-v1-quake-us7000tdvt.json', import.meta.url), 'utf8'));

test('수온 패킷 → 격자칸 이름표와 값, 좌표는 한 줄에 없다', () => {
  const html = s.intelStripHtml({ phenomenonId: 'ocean.sst', packet: SST, i18n: ko });
  assert.match(html, /동해 기준 격자칸 <b>25\.29 °C<\/b>/);
  assert.match(html, /data-phen="ocean\.sst"/);
  assert.ok(!/deg|°<\/b>/.test(html), '위경도는 띠 한 줄에 올리지 않는다');
  assert.equal(s.intelStripHtml({ phenomenonId: 'hazards.typhoon', packet: SST, i18n: ko }), '', '다른 현상 패킷은 버린다');
});

test('수온 평년 대비 — 관측·평년·차를 함께, 평년 출처를 적는다', () => {
  const p = structuredClone(SST);
  p.anomaly = { baseline: { name: 'NOAA OISST v2.1 일별 평년', period: '1991-2020' }, coverageKo: '평년 대비 값은 동아시아에만 있다',
    items: [{ key: 'sstEastSea', value: 25.29, baseline: 23.9, delta: 1.39, unit: '°C', kind: 'OFFICIAL_OBSERVATION', source: 'NOAA', labelKo: '동해 기준 격자칸' }] };
  const what = s.intelSectionHtml({ packet: p, section: 'WHAT', i18n: ko });
  assert.match(what, /동해 기준 격자칸 평년 대비/);
  assert.match(what, /\+1\.39 °C/);
  assert.match(what, /평년 23\.9 °C/);
  assert.match(what, /1991-2020/);
});

test('지진 패킷 → 규모·깊이 한 줄, 여진 변화에 이름, 여진 순서는 관측과 모형을 나란히', () => {
  const html = s.intelStripHtml({ phenomenonId: 'hazards.earthquake', packet: EQ, i18n: ko });
  assert.match(html, /규모 <b>6\.3<\/b>/, "규모 뒤에 'M' 을 겹쳐 쓰지 않는다");
  assert.match(html, /진원 깊이 <b>35 km<\/b>/);
  assert.match(html, /여진 M3 이상 \(100 km 안\) 변화 <b>\+3건<\/b>/, '패킷이 실은 이름표가 이긴다');
  const what = s.intelSectionHtml({ packet: EQ, section: 'WHAT', i18n: ko });
  assert.match(what, /본진 뒤/);
  assert.match(what, /실제 15건/);
  assert.match(what, /모형 기대 8\.5/);
  assert.match(what, /지역 보정 없음/, '모형 한계 문장을 버리지 않는다');
  for (const w of vocab.FORBIDDEN_CAUSAL) assert.ok(!what.includes(w), `WHAT 에 '${w}'`);
  assert.ok(!/data-sec="NEXT"/.test(html), '지진 NEXT 는 비워 둔다(PD 결정 전)');
});

// P2b — aws/kma-aws/intel_temp.py 가 만든 패킷(빠진 3시간을 채운 합성 하루 · tests/test_intel_temp.py full_day).
const TEMP = JSON.parse(readFileSync(new URL('./fixtures/intel-v1-temp-anomaly-fullday.json', import.meta.url), 'utf8'));

test('평년 대비 기온 — 지금 기온은 한 줄에, 평년차는 어제 하루 평균으로', () => {
  const html = s.intelStripHtml({ phenomenonId: 'weather.temperature_anomaly', packet: TEMP, i18n: ko });
  assert.match(html, /서울 기온\(지금\) <b>[\d.]+ °C<\/b>/);
  const what = s.intelSectionHtml({ packet: TEMP, section: 'WHAT', i18n: ko, badge: (k) => `[${k}]` });
  assert.match(what, /서울 어제 하루 평균 평년 대비/);
  assert.match(what, /\+2\.9 °C/);
  assert.match(what, /24회 정시 관측 평균/, '평균을 어떻게 냈는지 말한다');
  assert.match(what, /1991-2020/);
  assert.match(what, /EARTHUS_ANALYSIS/, '뺄셈은 우리 계산 — 관측 배지로 달지 않는다');
});

test('평년차 레이어는 한국 날짜의 월·일 칸을 읽는다 (UTC 연중 일자−1 금지)', () => {
  const ll = readFileSync(root('prototype/v2-three/js/live-layers.js'), 'utf8');
  const body = ll.slice(ll.indexOf('buildTempAnom(d) {'), ll.indexOf('metaTempAnom(d) {'));
  assert.match(body, /Date\.UTC\(2000, kst\.getUTCMonth\(\), kst\.getUTCDate\(\)\)/);
  assert.ok(!/getUTCFullYear\(\), 0, 0/.test(body), '옛 계산(평년 아닌 해에 하루 밀림)이 돌아오면 안 된다');
  assert.match(ll, /평년값은 하루 평균기온입니다/, '한 시각과 하루 평균을 비교한다는 사실을 카드가 말한다');
});

test('NEXT 의 EARTHUS 통계 모형은 기관 인용(유형 A)이라고 부르지 않는다', () => {
  const p = structuredClone(V1);
  p.next.items = [{ ...p.next.items[0], kind: 'EARTHUS_FORECAST', source: 'EARTHUS' }];
  const next = s.intelSectionHtml({ packet: p, section: 'NEXT', i18n: ko });
  assert.match(next, /유형 B EARTHUS 통계 모형/);
  assert.ok(!/유형 A/.test(next));
  p.next.items = [{ ...p.next.items[0], kind: 'PROVIDER_FORECAST', source: 'Open-Meteo' }];
  const prov = s.intelSectionHtml({ packet: p, section: 'NEXT', i18n: ko });
  assert.match(prov, /예보 제공자 인용/);
  assert.ok(!/기관 인용/.test(prov), '예보 제공자를 기관이라 부르지 않는다');
});

test('지진 패킷은 목록과 같이 한 번만 받는다 — 사건을 고를 때 요청하지 않는다(§C-0)', () => {
  const feedSrc = readFileSync(root('prototype/v2-three/js/intel-feed.js'), 'utf8');
  const load = feedSrc.slice(feedSrc.indexOf('async loadEvents()'), feedSrc.indexOf('packetOf(it)'));
  assert.match(load, /fetchJson\(EQ_INTEL/);
  const pick = feedSrc.slice(feedSrc.indexOf('eqIntelOf(it)'), feedSrc.indexOf('eqIntelOf(it)') + 300);
  assert.ok(!/fetch/.test(pick), '고를 때는 받아 둔 것만 본다');
});

test('띠는 요청·계산을 하지 않는다 (계약 §C-0) — fetch·LLM 호출이 없다', () => {
  const src = readFileSync(root('prototype/v2-three/js/intel-strip.js'), 'utf8');
  assert.ok(!/\bfetch\(|XMLHttpRequest|\/api\/ask/.test(src));
});

test('화면 배선 — 셸에 띠, main.js 에 intel-q 분기, limited 한계 문장', () => {
  assert.match(shellSrc, /\$\{simQuestionsHtml\(\)\}\$\{regionLine\(\)\}\$\{intelStripBlock\(\)\}/);   // §L 지역 한 줄이 사이에 온다
  assert.match(shellSrc, /packet: intelOf\(hooks\.getEventPacket\?\.\(pctx\.phenomenonId\)\)/);
  assert.match(mainSrc, /action === 'intel-q'/);
  assert.match(mainSrc, /getEventPacket: \(phenomenonId\) => intelHostFor\(phenomenonId\)/);
  assert.match(mainSrc, /intelOf\(intelHostFor\(ds\.phen \|\| null\)\)/, '절 카드도 같은 문으로 — 태풍만 보던 feed.packet 직접 참조 금지');
  // 레지스트리만 정직하고 화면이 한계 문장을 버리면 안 된다(2026-09-20 권고 #1)
  assert.match(shellSrc, /q\.status === 'limited' && q\.reason \? `<div class="sq-why sq-limit">/);
});
