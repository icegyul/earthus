// feeds.js — 형식 고정 · 두 시각 형식 · 풍향 부호 · 신선도 · 사실 카드 문장 (지시서 Phase 3 완료 기준 6·7·14)
// 금지만 시험하지 않는다: '근거 있는 문장이 나와야 통과'를 같이 본다(AGENTS.md 일하는 법 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  num, parseKstDigits, parseIso, windDirDegFromKma36, NORMALIZE, freshness, fmtKst, fmtUtc,
  buildFacts, cloudStatus, skyLine, warnLine, quakeLine, tsunamiLine, FRESH_MIN,
  shouldRefreshOnAlarm, needCloudDownload, pageShouldAskRefresh, RECENT_OPEN_MS,
} from '../feeds.js';
import { fixture, tKo, tEn, clone, SEOUL } from './helpers.mjs';

const MIN = 60000;
const norm = (k, j) => Object.assign({ fetchedAt: 0 }, NORMALIZE[k](j));
const liveFeeds = () => ({
  kmaAws: norm('kmaAws', fixture('wind_kma-aws')),
  kmaWarn: norm('kmaWarn', fixture('events_kma-warn')),
  quakeAsia: norm('quakeAsia', fixture('events_quake-asia')),
  tsunami: norm('tsunami', fixture('events_tsunami-intl')),
});
// 고정 자료가 만들어진 뒤 약 20분(2026-09-24 16:20 KST)
const NOW = Date.parse('2026-09-24T07:20:00Z');
const text = (line) => line.parts.map((p) => p.text).join(' · ');

test('값 읽기: 결측은 0 이 아니라 null', () => {
  assert.equal(num(null), null);
  assert.equal(num(''), null);
  assert.equal(num(undefined), null);
  assert.equal(num('abc'), null);
  assert.equal(num(NaN), null);
  assert.equal(num('-9.0'), -9);
  assert.equal(num(26.5), 26.5);
});

test('시각 형식 두 가지(둘 다 KST) — "20260924 14:00" · "202609241532"', () => {
  assert.equal(parseKstDigits('20260924 14:00'), Date.UTC(2026, 8, 24, 5, 0));
  assert.equal(parseKstDigits('202609241532'), Date.UTC(2026, 8, 24, 6, 32));
  assert.equal(parseKstDigits('2026092414'), null);
  assert.equal(parseKstDigits('20261324 14:00'), null);
  assert.equal(parseKstDigits(null), null);
  assert.equal(parseIso('2026-09-24T12:39:00+09:00'), Date.UTC(2026, 8, 24, 3, 39));
  assert.equal(parseIso('2026-09-24T06:00:00Z'), Date.UTC(2026, 8, 24, 6, 0));
  assert.equal(parseIso('2026-09-24 06:00'), null, '시간대 없는 시각은 기기 시간대로 읽히므로 받지 않는다');
});

test('기상청 풍향은 36방위 부호 ×10° (0 = 고요 → null)', () => {
  assert.equal(windDirDegFromKma36(25), 250);
  assert.equal(windDirDegFromKma36('5'), 50);
  assert.equal(windDirDegFromKma36(36), 0);
  assert.equal(windDirDegFromKma36(0), null);
  assert.equal(windDirDegFromKma36(37), null);
  assert.equal(windDirDegFromKma36(null), null);
  const aws = NORMALIZE.kmaAws(fixture('wind_kma-aws'));
  assert.equal(aws.data.stations.find((s) => s.id === '108').wind_dir_deg, 250, '운영 파일 서울 WD "25" → 250°');
});

test('KST 표기는 기기 시간대와 무관 · 날짜가 다르면 월-일을 붙인다', () => {
  const ms = Date.UTC(2026, 8, 24, 5, 0);
  assert.equal(fmtKst(ms, ms), '14:00');
  assert.equal(fmtUtc(ms), '05:00');
  assert.equal(fmtKst(ms, ms + 12 * 3600 * 1000), '09-24 14:00');
});

test('운영 파일 다섯 개가 모두 고정 형식으로 읽힌다', () => {
  for (const [k, f] of [['cloudMeta', 'clouds_meta'], ['kmaWarn', 'events_kma-warn'], ['quakeAsia', 'events_quake-asia'], ['tsunami', 'events_tsunami-intl'], ['kmaAws', 'wind_kma-aws']]) {
    const n = NORMALIZE[k](fixture(f));
    assert.equal(n.ok, true, `${k}: ${JSON.stringify(n.missing)}`);
  }
  const m = NORMALIZE.cloudMeta(fixture('clouds_meta')).data;
  assert.equal(m.credit, 'NOAA NESDIS GMGSI');
  assert.equal(m.key, 'clouds/global-2048.webp');
  assert.match(m.sha256, /^[0-9a-f]{64}$/);
});

test('내 장소 하늘: 값 + 출처·시각 문장이 나온다', () => {
  const l = skyLine(liveFeeds().kmaAws, SEOUL, 'ko', NOW, tKo);
  assert.equal(l.status, 'fresh');
  assert.equal(text(l), '서울 26.5℃ · 바람 2.5 m/s · 기상청 지상관측 14:00 KST');
  assert.equal(l.time, '2026-09-24T05:00:00.000Z');
  assert.ok(l.source.includes('기상청'));
  assert.equal(l.windDirDeg, 250);
  const en = skyLine(liveFeeds().kmaAws, SEOUL, 'en', NOW, tEn);
  assert.equal(text(en), 'Seoul 26.5 °C · wind 2.5 m/s · KMA surface observation 14:00 KST');
});

test('내 장소 하늘: 정상 발행 주기(관측 뒤 85~145분)에는 지연이라 하지 않고, 190분을 넘으면 지연', () => {
  const obs = Date.UTC(2026, 8, 24, 5, 0);
  assert.equal(skyLine(liveFeeds().kmaAws, SEOUL, 'ko', obs + 145 * MIN, tKo).status, 'fresh');
  const l = skyLine(liveFeeds().kmaAws, SEOUL, 'ko', obs + (FRESH_MIN.kmaAws + 1) * MIN, tKo);
  assert.equal(l.status, 'stale');
  assert.equal(text(l), '기온 자료 지연 (마지막 14:00)');
  assert.ok(!/26\.5/.test(text(l)), '늙은 값은 숫자로 말하지 않는다');
});

test('내 장소 하늘: 결측 값은 0 으로 찍지 않고 조각을 뺀다', () => {
  const j = clone(fixture('wind_kma-aws'));
  const s = j.stations.find((x) => x.id === '108');
  s.temp_c = null;
  const l = skyLine(norm('kmaAws', j), SEOUL, 'ko', NOW, tKo);
  assert.equal(text(l), '서울 · 바람 2.5 m/s · 기상청 지상관측 14:00 KST');
  s.wind_ms = null;
  assert.equal(skyLine(norm('kmaAws', j), SEOUL, 'ko', NOW, tKo), null, '값이 하나도 없으면 줄을 뺀다');
});

test('특보 없음: "없음" 문장 + 기상청 기준 시각이 반드시 나온다', () => {
  const l = warnLine(liveFeeds().kmaWarn, 'ko', NOW, tKo);
  assert.equal(text(l), '지금 발효 중인 기상특보 없음 · 기상청 16:02 KST 기준');
  assert.equal(l.time, '2026-09-24T07:02:00.000Z');
});

test('특보 자료가 45분(파일의 staleAfterMinutes)을 넘으면 "없음"이라 말하지 않는다', () => {
  const obs = Date.UTC(2026, 8, 24, 7, 2);
  assert.equal(warnLine(liveFeeds().kmaWarn, 'ko', obs + 44 * MIN, tKo).status, 'fresh');
  const l = warnLine(liveFeeds().kmaWarn, 'ko', obs + 46 * MIN, tKo);
  assert.equal(l.status, 'stale');
  assert.equal(text(l), '특보 자료 지연 (마지막 16:02)');
  assert.ok(!text(l).includes('없음'));
});

test('특보 있음: 종류와 구역 수가 나온다(높은 단계 먼저, 순서 고정)', () => {
  const j = clone(fixture('events_kma-warn'));
  const mk = (kind, kindEn, level, region) => ({ kind, kindEn, level, region });
  j.active = [mk('폭염', 'Heat wave', '주의보', 'A'), mk('호우', 'Heavy rain', '경보', 'B'), mk('폭염', 'Heat wave', '주의보', 'C'), mk('폭염', 'Heat wave', '주의보', 'D'), mk('강풍', 'Strong wind', '주의보', 'E')];
  j.activeCount = 5;
  const l = warnLine(norm('kmaWarn', j), 'ko', NOW, tKo);
  assert.equal(text(l), '기상특보 · 호우경보 1개 구역 · 폭염주의보 3개 구역 외 1종 · 기상청 16:02 KST 기준');
  const en = warnLine(norm('kmaWarn', j), 'en', NOW, tEn);
  assert.equal(text(en), 'Weather warnings · Heavy rain warning, zones: 1 · Heat wave advisory, zones: 3 + 1 more · KMA as of 16:02 KST');
});

test('지진: 24시간 창 안의 가장 최근 항목(기관이 쓴 곳 이름 원문 · 기관 · 진도)', () => {
  const l = quakeLine(liveFeeds().quakeAsia, 'ko', NOW, tKo);
  assert.equal(text(l), 'M3.0 · 岐阜県美濃東部 · 12:39 KST · 일본 기상청 · 진도 1');
  assert.equal(l.time, '2026-09-24T03:39:00.000Z');
  const en = quakeLine(liveFeeds().quakeAsia, 'en', NOW, tEn);
  assert.equal(text(en), 'M3.0 · Eastern Mino, Gifu Prefecture · 12:39 KST · Japan Meteorological Agency · JMA shindo 1');
});

test('지진: 한국 기상청 항목이 창 안에 있으면 그것을 먼저 쓴다', () => {
  const j = clone(fixture('events_quake-asia'));
  j.quakes.push({ src: 'KMA', srcKo: '기상청', kind: '국내지진통보', early: false, at: '2026-09-24T10:00:00+09:00', mag: 2.1, place: '경북 경주시 남남서쪽 9km 지역', intensity: '최대진도 Ⅱ' });
  const l = quakeLine(norm('quakeAsia', j), 'ko', NOW, tKo);
  assert.equal(text(l), 'M2.1 · 경북 경주시 남남서쪽 9km 지역 · 10:00 KST · 기상청 · 최대진도 Ⅱ');
});

test('지진: 창 안에 없으면 "지난 24시간 … 없음 · 기준 시각" 문장', () => {
  const j = clone(fixture('events_quake-asia'));
  j.generated = '2026-09-26T07:00:00Z';
  const now = Date.parse('2026-09-26T07:10:00Z');
  const l = quakeLine(norm('quakeAsia', j), 'ko', now, tKo);
  assert.equal(text(l), '지난 24시간 한·일 기관 발표 지진 없음 · 기상청·JMA 16:00 기준');
});

test('지진: 조기경보(early)는 사실 카드에 올리지 않는다 · 파일 60분 초과면 지연', () => {
  const j = clone(fixture('events_quake-asia'));
  j.quakes.unshift({ src: 'JMA', srcKo: '일본 기상청', early: true, at: '2026-09-24T16:10:00+09:00', mag: 6.0, place: 'X', intensity: '5' });
  assert.ok(!text(quakeLine(norm('quakeAsia', j), 'ko', NOW, tKo)).includes('M6.0'));
  const gen = Date.parse('2026-09-24T07:07:00Z');
  assert.equal(text(quakeLine(liveFeeds().quakeAsia, 'ko', gen + 61 * MIN, tKo)), '지진 자료 지연 (마지막 16:07)');
});

test('쓰나미: 일주일 지난 발표는 지금 일처럼 말하지 않는다(줄 없음) · 24시간 안이면 기관 분류 그대로 + 원문 링크', () => {
  assert.equal(tsunamiLine(liveFeeds().tsunami, 'ko', NOW, tKo), null);
  const j = clone(fixture('events_tsunami-intl'));
  j.alerts[1].updated = '2026-09-24T06:50:00Z';
  const l = tsunamiLine(norm('tsunami', j), 'ko', NOW, tKo);
  assert.equal(text(l), '쓰나미 · PTWC 발표 1건 (Information) · 15:50 KST');
  assert.match(l.href, /^https:\/\/www\.tsunami\.gov\//);
  assert.equal(l.hrefText, '원문 보기 →');
  j.alerts[1].bulletin = 'https://evil.example/x';
  assert.equal(tsunamiLine(norm('tsunami', j), 'ko', NOW, tKo).href, null, 'tsunami.gov 밖 주소는 걸지 않는다');
});

test('카드 전체: 특보·지진 줄이 있으면 안전 문구가 붙는다 · 켜고 끄기', () => {
  const lines = buildFacts(liveFeeds(), { city: SEOUL, lang: 'ko', nowMs: NOW, t: tKo });
  assert.deepEqual(lines.map((l) => l.id), ['sky', 'warn', 'quake', 'safety']);
  assert.equal(text(lines[3]), '대응은 기상청 공식 발표를 따르세요 · 이 화면은 15분 간격으로 받습니다');
  for (const l of lines.slice(0, 3)) { assert.ok(l.source); assert.ok(l.time); }
  const off = buildFacts(liveFeeds(), { city: SEOUL, lang: 'ko', nowMs: NOW, t: tKo, lines: { warn: false, quake: false } });
  assert.deepEqual(off.map((l) => l.id), ['sky']);
});

test('형식 변경: 키 하나를 지우면 그 줄 자리에 "형식 변경", 나머지는 정상 (완료 기준 14)', () => {
  const j = clone(fixture('events_kma-warn'));
  delete j.observedKst;
  const feeds = liveFeeds();
  feeds.kmaWarn = norm('kmaWarn', j);
  assert.equal(feeds.kmaWarn.ok, false);
  assert.deepEqual(feeds.kmaWarn.missing, ['observedKst']);
  const lines = buildFacts(feeds, { city: SEOUL, lang: 'ko', nowMs: NOW, t: tKo });
  assert.deepEqual(lines.map((l) => [l.id, l.status]), [['sky', 'fresh'], ['warn', 'format'], ['quake', 'fresh'], ['safety', 'note']]);
  assert.equal(text(lines[1]), '형식 변경 — 지구 전체 보기에서 확인');
  for (const [k, f, key] of [['kmaAws', 'wind_kma-aws', 'stations'], ['quakeAsia', 'events_quake-asia', 'quakes'], ['tsunami', 'events_tsunami-intl', 'alerts'], ['cloudMeta', 'clouds_meta', 'variants']]) {
    const x = clone(fixture(f)); delete x[key];
    assert.equal(NORMALIZE[k](x).ok, false, `${k} 에서 ${key} 를 지우면 형식 변경`);
  }
  assert.equal(NORMALIZE.kmaAws({ observedKst: '20260924 14:00', stations: [{ id: '108', nope: 1 }] }).ok, false);
});

test('받지 못한 자료는 줄을 뺀다(빈칸을 지어 채우지 않는다)', () => {
  const lines = buildFacts({}, { city: SEOUL, lang: 'ko', nowMs: NOW, t: tKo });
  assert.deepEqual(lines, []);
});

test('구름 상태 줄: 오프라인 · 받는 중 · 2시간 지연 · 형식 변경 (문구 고정)', () => {
  const tm = Date.parse('2026-09-24T06:00:00Z');
  assert.equal(cloudStatus({ online: false, shownCloud: { timeMs: tm }, nowMs: NOW, t: tKo }), '오프라인 — 마지막으로 받은 그림 (관측 15:00 KST)');
  assert.equal(cloudStatus({ online: true, shownCloud: null, nowMs: NOW, t: tKo }), '구름 관측을 받는 중…');
  assert.equal(cloudStatus({ online: true, shownCloud: { timeMs: tm }, nowMs: tm + 119 * MIN, t: tKo }), null);
  assert.equal(cloudStatus({ online: true, shownCloud: { timeMs: tm }, nowMs: tm + 3 * 60 * MIN, t: tKo }), '구름 자료 지연 — 마지막 관측 3시간 전 (15:00 KST)');
  assert.equal(cloudStatus({ online: true, shownCloud: { timeMs: tm }, metaFeed: { ok: false, reason: 'format' }, nowMs: NOW, t: tKo }), '형식 변경 — 지구 전체 보기에서 확인');
  assert.equal(freshness(tm, tm + 121 * MIN, FRESH_MIN.cloud), 'stale');
  assert.equal(freshness(tm + 2 * 3600 * 1000, tm, 60), 'stale', '미래로 한 시간 넘게 튄 시각은 믿지 않는다');
});

test('받기 규칙: 알람은 새 탭이 2시간 안에 열렸을 때만 · 구름은 meta.time 이 바뀌었을 때만 (완료 기준 15)', () => {
  const now = NOW;
  assert.equal(shouldRefreshOnAlarm(now, undefined), false, '한 번도 안 열렸으면 받지 않는다');
  assert.equal(shouldRefreshOnAlarm(now, now - RECENT_OPEN_MS + 1000), true);
  assert.equal(shouldRefreshOnAlarm(now, now - RECENT_OPEN_MS - 1000), false);
  const meta = { time: '2026-09-24T06:00:00Z' };
  assert.equal(needCloudDownload(meta, { time: '2026-09-24T06:00:00Z' }, now, now), false);
  assert.equal(needCloudDownload(meta, { time: '2026-09-24T05:00:00Z' }, now, now), true);
  assert.equal(needCloudDownload(meta, null, now, now - 3 * 3600 * 1000), false);
  assert.equal(pageShouldAskRefresh(now, now - 16 * MIN, true), true);
  assert.equal(pageShouldAskRefresh(now, now - 5 * MIN, true), false);
  assert.equal(pageShouldAskRefresh(now, undefined, false), false, '오프라인이면 청하지 않는다(요청 0건)');
});

// (2026-09-24 검수 추가) variants 가 통째로 없는 meta(Lambda 가 변형을 올리기 전 첫 쓰기)는 'no-variant' — 형식 변경이 아니다.
//   variants 는 있는데 webp2048 모양이 틀리면 그때는 형식 변경이다.
test('구름 meta: variants 없음 = no-variant(형식 변경 아님) · 모양이 틀린 webp2048 = 형식 변경', () => {
  const j = clone(fixture('clouds_meta'));
  delete j.variants;
  const n = NORMALIZE.cloudMeta(j);
  assert.equal(n.ok, false);
  assert.equal(n.reason, 'no-variant');
  const k = clone(fixture('clouds_meta'));
  k.variants.webp2048.sha256 = 'nope';
  assert.equal(NORMALIZE.cloudMeta(k).reason, 'format');
  const m = clone(fixture('clouds_meta'));
  delete m.time;
  assert.equal(NORMALIZE.cloudMeta(m).reason, 'format', '필수 키가 없으면 variants 와 무관하게 형식 변경');
});
