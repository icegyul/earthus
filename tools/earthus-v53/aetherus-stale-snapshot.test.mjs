// H2 (2026-09-20) — 우주쓰레기(궤도 인텔리전스) 화면이 거짓을 말했다.
//
// 운영 스냅샷이 16일 묵어(2026-09-04 발행 · 요소 상한 7일) 지구에는 0기를 그리는데
//   · 카드 첫 줄은 '500기를 지금 자리에 그렸습니다'   (받은 수를 그린 수로 말했다)
//   · 배지는 LIVE 고정                                  (main.js)
//   · 메뉴 출처는 'AETHERUS API · 서버 SGP4'            (운영에 그 서버는 없다)
//   · 자료 나이는 '390시간 전'                          ('일' 단위가 없었다)
//
// 금지("이 문장이 없어야 한다")만 시험하면 아무 말도 안 하는 카드가 통과한다.
// 그래서 **나와야 하는 것**을 같이 본다 — 묵으면 '위치 표시 안 함 — 스냅샷 N일 전(상한 7일)'이
// 첫 줄에 나오고, 멀쩡하면 '…기를 지금 자리에 그렸습니다'가 **실제로 그린 수와 같은 수로** 나온다.
//
// 코어는 v1·v2 공용 정본(prototype/js/aetherus/core.js)이다. 진짜 refresh() 경로를 탄다 —
// 라이브 API 가 죽어 있고(운영과 같다) 발행 스냅샷으로 내려가는 길. entries 를 손으로 채우지 않는다.
import '../v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = (p) => new URL(`../../${p}`, import.meta.url);

// satellite.js 는 UMD 다 — 모듈로 읽으면 globalThis.satellite 에 붙는다. 진짜 SGP4 로 '그린 수'를 센다.
await import('../../prototype/vendor/satellite-6.0.2.min.js');
const { AetherusCore } = await import('../../prototype/js/aetherus/core.js');

const DAY = 86400e3;
const HOUR = 3600e3;
const iso = (ms) => new Date(ms).toISOString();

/* 시험용 궤도요소 — 실재하는 물체의 값이 아니라 SGP4 가 받아들이는 모양의 LEO 요소다.
   식별부호는 코어의 픽스처 차단(isFixture)을 통과하는 실재 규약 모양으로 만든다:
   발사연도 ≤ 올해 · 조각은 문자 · 카탈로그 번호 5자리. (규약을 벗어나면 entries 가 비어
   '묵어서'가 아니라 '없어서' 안 그린 것이 된다 — 그러면 이 시험은 버그를 안 보고 통과한다.) */
const row = (i, { epochMs, debris = false, elements = true }) => ({
  catalog_id: String(25544 + i),
  canonical_name: debris ? `FENGYUN 1C DEB ${i}` : `SAT ${i}`,
  cospar_id: `1999-025${String.fromCharCode(65 + i)}`,
  status: 'ACTIVE',
  object_type: debris ? 'DEBRIS' : 'PAYLOAD',
  position_status: 'OK',
  sample_time: iso(epochMs),
  state: { r_km: [6800, 0, 0], v_km_s: [0, 7.5, 0] },
  geodetic: { alt_km: 430 },
  elements: elements ? {
    OBJECT_NAME: `SAT ${i}`, OBJECT_ID: `1999-025${String.fromCharCode(65 + i)}`,
    // 서버는 EPOCH 를 Z 붙은 UTC 로 낸다(services/aetherus-orbital/backend/explore/service.py _utc_z).
    // Z 를 떼면 Date.parse 가 현지 시각으로 읽어 나이가 시간대만큼(한국 9시간) 어긋난다.
    EPOCH: iso(epochMs),
    MEAN_MOTION: 15.5 - i * 0.1, ECCENTRICITY: 0.0005, INCLINATION: 51.64 + i,
    RA_OF_ASC_NODE: 10 * i, ARG_OF_PERICENTER: 30, MEAN_ANOMALY: 40 * i,
    EPHEMERIS_TYPE: 0, CLASSIFICATION_TYPE: 'U', NORAD_CAT_ID: 25544 + i,
    ELEMENT_SET_NO: 999, REV_AT_EPOCH: 1000, BSTAR: 0.0001, MEAN_MOTION_DOT: 0.00001, MEAN_MOTION_DDOT: 0,
  } : undefined,
});

/** 운영과 같은 길 — 라이브 API 는 없고(연결 실패), 발행 스냅샷만 있다. */
async function coreFrom({ rows, publishedMs, policyMaxAgeS, events = [] }) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (u.endsWith('/aetherus/manifest.json')) {
      return json({ generated_at: iso(publishedMs), policy: policyMaxAgeS == null ? {} : { position_max_age_s: policyMaxAgeS } });
    }
    if (u.endsWith('/aetherus/snapshot.json')) return json({ data: { at: iso(publishedMs), catalog: rows, coverage: { objects_total: 1234 } } });
    if (u.endsWith('/aetherus/conjunctions.json')) return json({ data: { events } });
    throw new Error(`connect ECONNREFUSED ${u}`);   // 라이브 API
  };
  const core = new AetherusCore();
  await core.refresh();
  assert.equal(core.fromSnapshot, true, '발행 스냅샷 경로를 타야 한다');
  return core;
}

/** 카드에서 사람이 가장 먼저 읽는 줄 — 맨 앞 ai-lead 의 첫 줄(태그를 걷어낸 글자). */
const firstLine = (html) => {
  assert.ok(html.startsWith('<div class="ai-lead">'), '머리말이 카드 맨 앞에 있어야 한다(접힌 근거 안이 아니라)');
  return html.slice('<div class="ai-lead">'.length).split('<br/>')[0].replace(/<[^>]+>/g, '');
};
const beforeDetails = (html) => html.slice(0, html.indexOf('<details'));

test('묵은 스냅샷(요소 16~17일) — 지구에 0기, 첫 줄은 "위치 표시 안 함 — 스냅샷 17일 전(상한 7일)"', async () => {
  const now = Date.now();
  const core = await coreFrom({
    publishedMs: now - 16 * DAY,
    rows: [0, 1, 2, 3, 4].map((i) => row(i, { epochMs: now - (16 * DAY + (i + 1) * 4 * HOUR), debris: i >= 3 })),
  });
  // 왜 안 그리는가를 먼저 못박는다 — '받은 것이 없어서'가 아니라 '전부 묵어서'다.
  assert.equal(core.entries.length, 5);
  assert.equal(core.mode(), 'SGP4');
  assert.equal(core.tooOld(), 5);
  assert.equal(core.positions().length, 0, '지구에는 0기를 그린다');

  const card = core.card(true);
  assert.equal(firstLine(card), '위치 표시 안 함 — 스냅샷 17일 전(상한 7일)');
  assert.ok(!card.includes('지금 자리에 그렸습니다'), '안 그렸는데 그렸다고 말하면 안 된다');
  assert.ok(!/\d+기<\/b>를/.test(beforeDetails(card)), '머리말에 "N기를 …" 이 남아 있다');
  // 자료 나이는 '일'로 — '약 390시간 전'이 아니라.
  assert.match(beforeDetails(card), /지금 가진 자료는 <b>17일 전<\/b> 것입니다/);
  assert.ok(!/\d+시간 전/.test(card), `나이가 시간으로 나갔다: ${card.match(/\d+시간 전/)}`);
  // 안 그리면서 '조금씩 벌어집니다'라고 하면 그리고 있다는 말이 된다.
  assert.ok(!beforeDetails(card).includes('조금씩 벌어집니다'));
  // 근거(접이식)는 지우지 않았다 — 거기에도 같은 사실이 있다.
  assert.match(card, /<details class="ai-more">.*<b>위치 비표시<\/b> — 모든 궤도요소가 허용\(7일\)보다 오래됐습니다/s);
  // 카드 어디에도 '그렸습니다'가 없다 — 접힌 근거의 'N기는 빼고 그렸습니다' 줄도 0기를 그릴 때는 안 나간다.
  assert.ok(!card.includes('그렸습니다'), card.match(/[^>]*그렸습니다/)?.[0]);

  // 배지가 볼 낱말 — LIVE 로 옮겨질 'FRESH' 가 아니다.
  assert.equal(core.freshness(), 'STALE');
  assert.equal(core.stale(), true);
});

test('묵은 동안 메뉴 칩은 "자료 묵음"으로 시작하고, 카드 첫 줄과 같은 문장을 쓴다 (HTML 없음)', async () => {
  const now = Date.now();
  const core = await coreFrom({
    publishedMs: now - 16 * DAY,
    rows: [0, 1, 2].map((i) => row(i, { epochMs: now - 17 * DAY + i * HOUR })),
  });
  const chip = core.state(true);
  assert.ok(chip.startsWith('자료 묵음 · 위치 표시 안 함 — 스냅샷 17일 전(상한 7일)'), chip);
  assert.ok(chip.includes(firstLine(core.card(true))), '칩과 카드 첫 줄이 다른 말을 한다');
  assert.ok(!/기 표시/.test(chip), chip);
  assert.ok(!/[<>]/.test(chip), '관제센터(js/spaceops)가 이 줄을 이스케이프해서 쓴다 — HTML 을 넣으면 글자로 보인다');
  assert.match(chip, /정본 1,234기 · 근접 0건 · 요소 SGP4$/);
  // 영어 줄에도 같은 사실이, 한국어 단위 없이.
  const en = core.state(false);
  assert.ok(en.startsWith('Stale data · Positions not shown — snapshot is 17 d old (limit 7 d)'), en);
  assert.ok(!/[가-힣]/.test(en), en);
});

test('멀쩡한 스냅샷(요소 1시간) — "N기를 지금 자리에 그렸습니다"가 나오고 N 은 실제로 그린 수다', async () => {
  const now = Date.now();
  const core = await coreFrom({
    publishedMs: now - HOUR,
    rows: [0, 1, 2, 3, 4].map((i) => row(i, { epochMs: now - HOUR, debris: i >= 3 })),
  });
  const drawn = core.positions().length;
  assert.equal(drawn, 5, 'SGP4 가 시험 요소를 풀지 못했다 — 픽스처를 고쳐야 한다');
  const card = core.card(true);
  assert.equal(firstLine(card), `지구 둘레를 도는 물체 ${drawn}기를 지금 자리에 그렸습니다 · 그중 2기가 부서진 파편입니다.`);
  assert.ok(!card.includes('위치 표시 안 함'));
  assert.match(beforeDetails(card), /지금 쓰는 자료는 <b>60분 전<\/b> 것이고/);
  assert.equal(core.freshness(), 'FRESH');
  assert.match(core.state(true), /^5기 표시 \/ 정본 1,234기 · 근접 0건 · 요소 SGP4 · 요소 60분 전$/);
});

test('자료 나이 — 하루를 넘기면 "N일 전", 그 안은 "N시간 전" (칩도 같은 기준)', async () => {
  const now = Date.now();
  const at = async (ageMs) => coreFrom({ publishedMs: now - ageMs, rows: [row(0, { epochMs: now - ageMs })] });
  const d2 = await at(50 * HOUR);
  assert.match(beforeDetails(d2.card(true)), /<b>2일 전<\/b>/);
  assert.match(d2.state(true), /요소 2일 전$/);
  const d1 = await at(30 * HOUR);   // 예전 칩은 이틀부터 '일'이라 여기서 '30시간'이었다
  assert.match(beforeDetails(d1.card(true)), /<b>1일 전<\/b>/);
  assert.match(d1.state(true), /요소 1일 전$/);
  const h5 = await at(5 * HOUR);
  assert.match(beforeDetails(h5.card(true)), /<b>5시간 전<\/b>/);
  assert.match(h5.state(true), /요소 5시간 전$/);
  // 영어 카드에 한국어 '…전'이 섞여 나가지 않는다.
  assert.match(beforeDetails(d2.card(false)), /This data is <b>2 d<\/b> old/);
});

test('일부만 묵은 벌 — 말하는 수는 받은 수(5)가 아니라 그린 수(3)다', async () => {
  const now = Date.now();
  const core = await coreFrom({
    publishedMs: now - HOUR,
    rows: [
      ...[0, 1, 2].map((i) => row(i, { epochMs: now - 2 * HOUR })),
      ...[3, 4].map((i) => row(i, { epochMs: now - 9 * DAY, debris: true })),
    ],
  });
  assert.equal(core.positions().length, 3);
  const card = core.card(true);
  // 파편 둘은 묵어서 안 그렸다 — '그중 2기가 파편'이라고 하면 안 그린 것을 그린 것 가운데서 센 것이다.
  assert.equal(firstLine(card), '지구 둘레를 도는 물체 3기를 지금 자리에 그렸습니다.');
  assert.match(card, /오래된 2기는 빼고 그렸습니다/);
  assert.match(core.state(true), /^3기 표시 /);
  assert.equal(core.freshness(), 'FRESH');
});

test('요소 있는 객체는 전부 묵고 요소 없는 객체만 남은 벌 — 그릴 것이 0기면 그렸다고 하지 않는다', async () => {
  const now = Date.now();
  const core = await coreFrom({
    publishedMs: now - 10 * DAY,
    rows: [
      row(0, { epochMs: now - 10 * DAY }), row(1, { epochMs: now - 10 * DAY }),
      row(2, { epochMs: now - 10 * DAY, elements: false }),   // 요소 경로에서는 안 그리는 객체
    ],
  });
  assert.equal(core.positions().length, 0);
  assert.ok(core.tooOld() < core.entries.length, '예전 판정(낡은 수 < 받은 수)은 이 벌을 "그릴 수 있음"이라 했다');
  assert.equal(core.positionsUsable(), false);
  assert.equal(firstLine(core.card(true)), '위치 표시 안 함 — 스냅샷 10일 전(상한 7일)');
});

test('요소 없는 발행본(선형 경로) — 상한은 7일이 아니라 발행 정책값을 읽어 적는다', async () => {
  const now = Date.now();
  const core = await coreFrom({
    publishedMs: now - 3 * HOUR, policyMaxAgeS: 900,
    rows: [0, 1].map((i) => row(i, { epochMs: now - 3 * HOUR, elements: false })),
  });
  assert.equal(core.mode(), 'LINEAR');
  assert.equal(firstLine(core.card(true)), '위치 표시 안 함 — 스냅샷 3시간 전(상한 15분)');
  assert.equal(core.freshness(), 'STALE');
});

test('받은 객체가 없으면 "묵음"이 아니라 "없음"이다 — 나이를 지어내지 않는다', async () => {
  const core = await coreFrom({ publishedMs: Date.now() - HOUR, rows: [] });
  assert.equal(core.freshness(), 'EMPTY');
  assert.equal(firstLine(core.card(true)), '위치 표시 안 함 — 표시할 객체가 없습니다.');
  assert.ok(!core.state(true).includes('자료 묵음'));
  assert.ok(!/\d+(일|시간|분) 전/.test(beforeDetails(core.card(true))), '없는 자료의 나이를 말했다');
  // 아직 아무것도 안 받았으면 판정 자체를 하지 않는다 — 메뉴의 고정 배지를 건드릴 근거가 없다.
  assert.equal(new AetherusCore().freshness(), null);
});

test('근접사건 — 묵은 자료에서도 TCA 가 미래인 것은 적되, 그린다는 말과 섞지 않는다', async () => {
  const now = Date.now();
  const ev = (a, b, tcaMs) => ({
    primary: { catalog_id: a }, secondary: { catalog_id: b }, tca: iso(tcaMs),
    latest_snapshot: { miss_distance_m: 1200, metrics: { PC: { status: 'NOT_COMPUTED' } } },
  });
  const core = await coreFrom({
    publishedMs: now - 16 * DAY,
    rows: [0, 1, 2].map((i) => row(i, { epochMs: now - 16 * DAY })),
    events: [ev('25544', '25545', now + 2 * DAY), ev('25544', '25546', now - 3 * DAY)],
  });
  const lead = beforeDetails(core.card(true));
  assert.match(lead, /근접 예정 <b>1건<\/b>/);
  assert.ok(!lead.includes('지금 자리에 그렸습니다'));
});

// ── v2 배선 ────────────────────────────────────────────────────────────────
const main = readFileSync(root('prototype/v2-three/js/main.js'), 'utf8');
const shell = readFileSync(root('prototype/v2-three/js/ui-shell.js'), 'utf8');

test('v2 카드 배지는 LIVE 고정이 아니라 코어 판정을 따른다 — STALE 은 이미 있는 배지 어휘다', async () => {
  assert.ok(!/note\('궤도 인텔리전스', aethLink\.card\(\), 'LIVE'\)/.test(main), '배지가 다시 LIVE 로 못박혔다');
  assert.match(main, /note\('궤도 인텔리전스', aethLink\.card\(\), aethOrbitBadge\(\) \|\| 'LIVE'\)/);
  assert.match(main, /const AETH_ORBIT_BADGE = \{ FRESH: 'LIVE', STALE: 'STALE', EMPTY: 'UNAVAILABLE' \};/);
  assert.match(main, /const aethOrbitBadge = \(\) => AETH_ORBIT_BADGE\[aethLink\.core\.freshness\(\)\] \|\| null;/);
  // 새 어휘를 만들지 않았다 — 옮겨 적는 세 낱말 모두 engine-bridge 가 그릴 줄 아는 배지다.
  const bridge = await import('../../prototype/v2-three/js/engine-bridge.js');
  for (const word of ['LIVE', 'STALE', 'UNAVAILABLE']) assert.match(bridge.renderBadge(word), /class="badge /, word);
  assert.match(bridge.renderBadge('STALE'), /badge stale/);
  assert.ok(!/badge live/.test(bridge.renderBadge('STALE')));
});

test('v2 메뉴 — 출처 줄은 "발행 스냅샷 · 브라우저 SGP4", 묵은 동안 메뉴 줄 배지도 낮춘다', () => {
  const line = shell.split('\n').find((l) => l.includes("{ id: 'aeth-orbit'"));
  assert.ok(line, '메뉴에서 aeth-orbit 줄을 못 찾았다');
  assert.match(line, /src: '발행 스냅샷 · 브라우저 SGP4'/);
  assert.ok(!/AETHERUS API|서버 SGP4/.test(line), '운영에 없는 서버를 출처로 적고 있다');
  // 레이어가 준 배지(st.badge)가 고정 state 보다 먼저다 — 현상 줄과 레이어 줄 둘 다.
  assert.match(shell, /const rowBadge = \(rec\) => dataBadge\(layerOnState\(rec\)\.badge \|\| rec\.l\.state\);/);
  assert.match(shell, /\+ rowBadge\(entry\.rep\)/);
  assert.match(shell, /<\/span>' \+ rowBadge\(rec\)/);
  // main.js 가 그 배지를 준다 — LIVE 일 때는 주지 않는다(고정 배지 그대로).
  // (줄바꿈을 \n 으로 못박지 않는다 — autocrlf 로 받은 작업본은 CRLF 라 같은 코드가 떨어진다.)
  assert.match(main, /const badge = aethOrbitBadge\(\);\s+return badge && badge !== 'LIVE' \? \{ \.\.\.st, badge \} : st;/);
});
