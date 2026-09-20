// H3 — '오늘 발견' 카드가 "매일 다시 점수 매깁니다"라고 말하고 있었다 (2026-09-20).
// 날마다 달라지는 것은 게이트(기상청 특보 · 에어코리아 대기질)뿐이고, 점수 몸통(목적 밀도 · 덜 붐빔)은
// 미리 집계해 실은 파일(data/tourism/kto-discovery.json) 값이다.
// 이 시험은 금지("그 문장이 없어야 한다")만이 아니라 결과를 본다 —
//   카드가 **자료에 적힌** 집계일 · 방문자 기간 · 게이트 관측 시각을 실제로 담는가. 날짜가 코드에 박혀 있지 않은가.
// ⚠️ 기대값은 전부 자료 파일에서 계산한다. 시험에 날짜를 적어 두면 파일을 새로 집계한 날 시험이 거짓으로 깨진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { TravelScene, gateStamp, discoverBasis } = await import('../../prototype/v2-three/js/travel.js');
const src = readFileSync(new URL('../../prototype/v2-three/js/travel.js', import.meta.url), 'utf8');
// travel.js 와 **같은 URL**(질의문자열까지)로 들여야 같은 사본이다 — 다른 URL 이면 여기서 바꾼 언어가 카드에 닿지 않는다.
// 버전 숫자를 시험에 적어 두지 않는다: 모두가 함께 버전을 올린 날 이 시험만 엉뚱한 이유로 깨진다. travel.js 가 쓴 것을 그대로 읽는다.
const I18N_SPEC = (/from '\.\/(i18n\.js[^']*)'/.exec(src) || [])[1];
assert.ok(I18N_SPEC, 'travel.js 가 i18n 을 들이지 않는다 — 영어 문장이 나올 길이 없다');
const { i18n } = await import(`../../prototype/v2-three/js/${I18N_SPEC}`);

const DATA = JSON.parse(readFileSync(new URL('../../prototype/v2-three/data/tourism/kto-discovery.json', import.meta.url), 'utf8'));
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // 주석은 사고 기록이라 옛 문장을 인용한다 — 뺀다

// 게이트 캐시가 실제로 쓰는 두 가지 시각 꼴 (aws/kma-warn · aws/air-korea 의 observedKst)
const WARN_OK = { observedKst: '203101020304', active: [] };
const AIR_OK = { observedKst: '2031-01-02 05:00', stations: [] };

function sceneWith(data, gates, lang) {
  i18n.set(lang);   // Node 의 navigator.language 는 en 이다 — 기본값에 기대지 않는다
  const scene = Object.create(TravelScene.prototype);
  const d = structuredClone(data);
  d.regions.forEach((r, i) => { r.i = i; });
  Object.assign(scene, { data: d, gates: { ...gates, at: Date.now() }, mode: 'discover', catalog: null, error: null, busy: false, selectedPlace: null });
  scene.computeScores();
  return scene;
}

// 기대값: 자료에서 직접 센다
const withVisitors = DATA.regions.map((r) => r.visitors).filter((v) => v && v.dateFrom && v.dateTo);
const expFrom = withVisitors.map((v) => v.dateFrom).sort()[0];
const expTo = withVisitors.map((v) => v.dateTo).sort().at(-1);
const expGen = DATA.generatedAt.slice(0, 10);

test('자료 전제 — 배포본에 집계일과 방문자 기간이 적혀 있다 (없으면 아래 시험이 빈 말을 검사한다)', () => {
  assert.match(DATA.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(withVisitors.length > 100, `방문자 기간이 적힌 시군구 ${withVisitors.length}곳`);
  assert.match(expFrom, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(expTo, /^\d{4}-\d{2}-\d{2}$/);
});

test('한국어 카드 — 집계일 · 방문자 기간 · 게이트 시각이 자료에서 읽혀 나온다', () => {
  const card = sceneWith(DATA, { warn: WARN_OK, air: AIR_OK }, 'ko').sceneCard();
  assert.ok(card.includes(`<b>${expGen}</b>에 집계한 파일 값`), '집계일(generatedAt)');
  assert.ok(card.includes(`${expFrom}~${expTo}`), '방문자 기간(dateFrom~dateTo)');
  const basis = discoverBasis(DATA);
  if (basis.visitors.uniform && basis.visitors.meanPerDay) assert.ok(card.includes(`${basis.visitors.dayCount}일의 하루 평균`), '며칠 평균인지');
  assert.match(card, /지금 값은 특보·대기질뿐입니다/);
  assert.ok(card.includes('기상청 특보 2031-01-02 03:04 KST 기준'), '특보 관측 시각');
  assert.ok(card.includes('에어코리아 대기질 2031-01-02 05:00 KST 측정'), '대기질 측정 시각');
  // 방문자 고지는 그대로 — 기간 옆에도, 자료 주석 줄에도
  assert.match(card, /이동통신 기반 · 관광객 수 아님/);
  assert.ok(card.includes(DATA.notes.visitors.replace(/&/g, '&amp;')), '자료의 방문자 주석 줄');
  // 공식 문장과 제외 수는 그대로다 (문구만 고쳤다 — 동작은 안 바꿨다)
  assert.match(card, /점수 = 목적 밀도 0\.6 \+ 덜 붐빔 0\.4\./);
  assert.match(card, /지금 <b>0곳<\/b> 제외/);
});

test('날짜는 코드가 아니라 자료에서 온다 — 자료를 바꾸면 카드가 따라 바뀐다', () => {
  const d = structuredClone(DATA);
  d.generatedAt = '2033-03-04T05:06:07+00:00';
  d.regions.forEach((r) => { if (r.visitors) Object.assign(r.visitors, { dateFrom: '2033-01-10', dateTo: '2033-01-16', dayCount: 7, aggregation: 'MEAN_PER_DAY' }); });
  const card = sceneWith(d, { warn: WARN_OK, air: AIR_OK }, 'ko').sceneCard();
  assert.ok(card.includes('<b>2033-03-04</b>에 집계한 파일 값'));
  assert.ok(card.includes('2033-01-10~2033-01-16 7일의 하루 평균'));
  assert.ok(!card.includes(`<b>${expGen}</b>에 집계`), '옛 집계일이 남으면 코드에 박힌 것이다');
  // 카드 아래 주석 줄(notes.visitors)은 자료의 글자 그대로라 옛 기간을 담는다 — 우리가 쓴 첫머리만 본다
  const head = card.slice(0, card.indexOf('점수 = '));
  assert.ok(head.length > 0 && !head.includes(`${expFrom}~${expTo}`));
  // 소스 쪽에서도: 주석 밖에 날짜 글자가 없다
  assert.doesNotMatch(code, /20\d\d-\d\d-\d\d/);
});

test('영어 카드 — 같은 날짜 · 같은 시각을 영어 문장으로 말한다', () => {
  const card = sceneWith(DATA, { warn: WARN_OK, air: AIR_OK }, 'en').sceneCard();
  assert.match(card, /Only the warnings and air quality are current values/);
  assert.ok(card.includes('KMA warnings as of 2031-01-02 03:04 KST'));
  assert.ok(card.includes('AirKorea air quality measured 2031-01-02 05:00 KST'));
  assert.ok(card.includes(`compiled on <b>${expGen}</b>`));
  assert.ok(card.includes(expFrom) && card.includes(expTo));
  assert.match(card, /mobile-signal based, not tourist counts/);
  assert.match(card, /Score = purpose density × 0\.6 \+ quiet × 0\.4\./);
  assert.doesNotMatch(card, /every day|daily re-?scor|re-?scored? (every|each) day/i);
  i18n.set('ko');
});

test('게이트를 받지 못했으면 시각 대신 "확인 불가"와 "거르지 못했다"를 말한다 — 시각을 짓지 않는다', () => {
  const card = sceneWith(DATA, { warn: { __error: 'HTTP 500' }, air: AIR_OK }, 'ko').sceneCard();
  const first = card.slice(card.indexOf('지금 값은'), card.indexOf('이 메뉴를 열 때'));
  const [warnPart, airPart] = first.split(' · 에어코리아');
  assert.match(warnPart, /기상청 특보 <b>확인 불가<\/b> — 이번에는 특보로 거르지 못했습니다/);
  assert.doesNotMatch(warnPart, /\d{2}:\d{2}/, '받지 못한 특보에 시각이 붙으면 안 된다');
  assert.match(airPart, /2031-01-02 05:00 KST 측정/);
  // 둘 다 없을 때(아직 받기 전 null 포함)도 같다
  const none = sceneWith(DATA, { warn: null, air: { __error: 'timeout' } }, 'ko').sceneCard();
  assert.match(none, /기상청 특보 <b>확인 불가<\/b>/);
  assert.match(none, /에어코리아 대기질 <b>확인 불가<\/b> — 이번에는 대기질로 거르지 못했습니다/);
  const en = sceneWith(DATA, { warn: { __error: 'HTTP 500' }, air: AIR_OK }, 'en').sceneCard();
  assert.match(en, /KMA warnings <b>unavailable<\/b> — no warning filter was applied this time/);
  i18n.set('ko');
});

test('gateStamp — 두 가지 꼴만 읽고, 모르는 꼴은 시각 없음으로 둔다 ("24:00" 도 글자 그대로)', () => {
  assert.deepEqual(gateStamp({ observedKst: '202609201302' }), { ok: true, at: '2026-09-20 13:02' });
  assert.deepEqual(gateStamp({ observedKst: '2026-09-20 24:00' }), { ok: true, at: '2026-09-20 24:00' });
  assert.deepEqual(gateStamp({ observedKst: 'soon' }), { ok: true, at: null });
  assert.deepEqual(gateStamp({}), { ok: true, at: null });
  assert.deepEqual(gateStamp({ __error: 'HTTP 403' }), { ok: false, at: null });
  assert.deepEqual(gateStamp(null), { ok: false, at: null });
  const card = sceneWith(DATA, { warn: { active: [] }, air: AIR_OK }, 'ko').sceneCard();
  assert.match(card, /기상청 특보\(자료에 시각이 없음\)/);
});

test('방문자 기간이 지역마다 다르면 "N일의 하루 평균"이라 뭉뚱그리지 않는다', () => {
  const d = structuredClone(DATA);
  const first = d.regions.find((r) => r.visitors);
  Object.assign(first.visitors, { dateFrom: '2032-02-01', dateTo: '2032-02-03', dayCount: 3 });
  const basis = discoverBasis(d);
  assert.equal(basis.visitors.uniform, false);
  assert.equal(basis.visitors.dayCount, null);
  const card = sceneWith(d, { warn: WARN_OK, air: AIR_OK }, 'ko').sceneCard();
  assert.match(card, /지역마다 집계 기간이 다릅니다/);
  assert.doesNotMatch(card.slice(0, card.indexOf('점수 = ')), /일의 하루 평균/);
  // 방문자가 하나도 없으면 없다고 말한다
  const none = structuredClone(DATA);
  none.regions.forEach((r) => { delete r.visitors; });
  assert.equal(discoverBasis(none).visitors, null);
  assert.match(sceneWith(none, { warn: WARN_OK, air: AIR_OK }, 'ko').sceneCard(), /방문자 자료 없음 — 덜 붐빔은 중립 50/);
  // 집계일이 파일에 없으면 날짜를 짓지 않는다
  const noGen = structuredClone(DATA); delete noGen.generatedAt;
  const c2 = sceneWith(noGen, { warn: WARN_OK, air: AIR_OK }, 'ko').sceneCard();
  assert.match(c2, /미리 집계한 파일 값입니다\(집계일이 파일에 적혀 있지 않음\)/);
});

test('"매일 다시 점수" 류 문장이 코드에도 화면에도 남지 않았다', () => {
  // 'daily mean'(방문자 하루 평균)은 사실이라 막지 않는다 — 막는 것은 '날마다 점수를 다시 낸다'는 주장이다
  const claim = /매일|날마다|다시 점수|every day|each day|re-?scor|scored? daily|daily (re-?)?scor/i;
  assert.doesNotMatch(code, claim);
  for (const lang of ['ko', 'en']) {
    const card = sceneWith(DATA, { warn: WARN_OK, air: AIR_OK }, lang).sceneCard();
    assert.doesNotMatch(card, claim);
  }
  i18n.set('ko');
});

test('i18n 은 다른 모듈과 같은 URL 로 들인다 — 다르면 언어 단추가 닿지 않는 두 번째 사본이 생긴다', () => {
  // 언어를 바꾸는 쪽은 main.js 다(i18n.set). travel.js 는 main.js 와 글자 하나까지 같은 주소를 써야 한다.
  const main = readFileSync(new URL('../../prototype/v2-three/js/main.js', import.meta.url), 'utf8');
  const mainSpec = (/from '\.\/(i18n\.js[^']*)'/.exec(main) || [])[1];
  assert.ok(mainSpec, 'main.js 의 i18n import 를 찾지 못했다');
  assert.equal(I18N_SPEC, mainSpec, 'main.js 가 i18n 버전을 올리면 travel.js 도 같이 올려야 한다');
});
