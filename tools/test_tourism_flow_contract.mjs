import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/tourism-flow-contract.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const flow = await import(moduleUrl);

const raw = {
  RESULT: { CODE: 'INFO-000', MESSAGE: '정상 처리되었습니다' },
  'SeoulRtd.citydata_ppltn': [{
    AREA_NM: '광화문·덕수궁', AREA_CD: 'POI009', AREA_CONGEST_LVL: '보통',
    AREA_CONGEST_MSG: '사람이 몰려있을 수 있지만 크게 붐비지는 않아요.',
    AREA_PPLTN_MIN: '40000', AREA_PPLTN_MAX: '42000',
    REPLACE_YN: 'N', PPLTN_TIME: '2026-08-20 15:35', FCST_YN: 'Y',
    FCST_PPLTN: [
      { FCST_TIME: '2026-08-20 17:00', FCST_CONGEST_LVL: '약간 붐빔', FCST_PPLTN_MIN: '38000', FCST_PPLTN_MAX: '40000' },
      { FCST_TIME: '2026-08-20 21:00', FCST_CONGEST_LVL: '여유', FCST_PPLTN_MIN: '20000', FCST_PPLTN_MAX: '22000' },
    ],
  }],
};

const catalog = [{ code: 'POI009', category: '고궁·문화유산', nameKo: '광화문·덕수궁',
  nameEn: 'Gwanghwamun & Deoksugung Palace', lat: 37.5721, lon: 126.9768 }];
const now = '2026-08-20T06:42:00Z';
const item = flow.normalizeSeoulPopulation(raw, { catalog, receivedAt: now, now });

assert.equal(item.id, 'earthus:tourism:seoul:POI009');
assert.equal(item.state, flow.DATA_STATE.LIVE);
assert.equal(item.official.level, '보통');
assert.equal(item.official.rank, 2);
assert.deepEqual(item.official.populationRange, { min: 40000, max: 42000 });
assert.equal(item.position.source, '서울시 주요 121장소 영역');
assert.equal(item.forecast.length, 2);
assert.equal(item.forecast[1].sourceType, 'OFFICIAL_FORECAST');
assert.equal(item.provenance.sourceId, 'seoul-citydata-ppltn');
assert.equal(item.provenance.observedAt, '2026-08-20T06:35:00.000Z');
assert.equal(item.provenance.receivedAt, '2026-08-20T06:42:00.000Z');
assert.equal(item.provenance.license, '공공누리 제1유형');
assert.equal('crowdIndex' in item, false, 'official level must not be replaced with an invented index');
assert.equal(item.flow.direction.state, 'UNAVAILABLE');
assert.match(item.flow.direction.reason, /OD|이동 경로/);

const replaced = flow.normalizeSeoulPopulation({
  ...raw,
  'SeoulRtd.citydata_ppltn': [{ ...raw['SeoulRtd.citydata_ppltn'][0], REPLACE_YN: 'Y' }],
}, { catalog, receivedAt: now, now });
assert.equal(replaced.state, flow.DATA_STATE.DEGRADED);
assert.ok(replaced.reasonCodes.includes('PROVIDER_REPLACEMENT_VALUE'));

const stale = flow.normalizeSeoulPopulation(raw, {
  catalog, receivedAt: '2026-08-20T07:10:00Z', now: '2026-08-20T07:10:00Z',
});
assert.equal(stale.state, flow.DATA_STATE.STALE);
assert.notEqual(stale.stateLabelKo, 'LIVE');

const missingCoord = flow.normalizeSeoulPopulation(raw, { catalog: [], receivedAt: now, now });
assert.equal(missingCoord.position, null);
assert.ok(missingCoord.reasonCodes.includes('OFFICIAL_AREA_GEOMETRY_MISSING'));

const trend = flow.deriveScalarTrend([
  { observedAt: '2026-08-20T06:05:00Z', midpoint: 30000 },
  { observedAt: '2026-08-20T06:20:00Z', midpoint: 34000 },
  { observedAt: '2026-08-20T06:35:00Z', midpoint: 41000 },
]);
assert.equal(trend.direction, 'INCREASING');
assert.equal(trend.flowDirection, null, 'aggregate population cannot create map arrows');
assert.ok(trend.perHour > 0);
assert.match(trend.method, /robust/i);
assert.equal(flow.deriveScalarTrend([{ observedAt: now, midpoint: 41000 }]).state, 'UNAVAILABLE');

const crowdOnly = flow.evaluateBestTime(item, { safetyGate: { status: 'SAFE', blocksPositiveRecommendation: false } });
assert.equal(crowdOnly.state, 'CROWD_ONLY');
assert.equal(crowdOnly.at, '2026-08-20T12:00:00.000Z');
assert.match(crowdOnly.labelKo, /혼잡도 기준/);
assert.doesNotMatch(crowdOnly.labelKo, /안전|가도/);

const ready = flow.evaluateBestTime(item, {
  safetyGate: { status: 'SAFE', blocksPositiveRecommendation: false },
  accessibility: { state: 'OPEN', observedAt: now, sourceId: 'official-facility-hours' },
});
assert.equal(ready.state, 'READY');
assert.equal(ready.at, '2026-08-20T12:00:00.000Z');

const withheld = flow.evaluateBestTime(item, {
  safetyGate: { status: 'WARNING', blocksPositiveRecommendation: true },
  accessibility: { state: 'OPEN', observedAt: now, sourceId: 'official-facility-hours' },
});
assert.equal(withheld.state, 'WITHHELD');
assert.equal(withheld.at, null);

const alternatives = flow.rankAlternatives([
  item,
  { ...item, id: 'earthus:tourism:seoul:POI008', nameKo: '경복궁', official: { ...item.official, rank: 1 } },
  { ...item, id: 'earthus:tourism:seoul:POI010', nameKo: '보신각', state: flow.DATA_STATE.UNAVAILABLE },
], item.id);
assert.equal(alternatives.length, 1);
assert.equal(alternatives[0].nameKo, '경복궁');
assert.equal(alternatives[0].basis, 'OFFICIAL_CURRENT_CONGESTION');

const snapshot = flow.buildTourismSnapshot({
  responses: [raw], catalog, mode: 'SAMPLE', receivedAt: now, now,
  historyByCode: {
    POI009: [
      { observedAt: '2026-08-20T06:05:00Z', midpoint: 30000 },
      { observedAt: '2026-08-20T06:20:00Z', midpoint: 34000 },
      { observedAt: '2026-08-20T06:35:00Z', midpoint: 41000 },
    ],
  },
});
assert.equal(snapshot.schemaVersion, 'earthus.tourism-flow.v1');
assert.equal(snapshot.state, flow.DATA_STATE.LIVE);
assert.equal(snapshot.provider.mode, 'SAMPLE');
assert.equal(snapshot.coverage.available, 1);
assert.equal(snapshot.coverage.total, 121);
assert.equal(snapshot.coverage.fullCoverage, false);
assert.match(snapshot.coverage.noteKo, /광화문·덕수궁 1곳/);
assert.equal(snapshot.places[0].flow.scalarTrend.direction, 'INCREASING');
assert.equal(snapshot.quality.withOfficialForecast, 1);
assert.equal(snapshot.quality.withDirectionEvidence, 0);
assert.equal(flow.validateTourismSnapshot(snapshot), true);
assert.throws(() => flow.validateTourismSnapshot({
  ...snapshot,
  places: [{ ...snapshot.places[0], state: flow.DATA_STATE.STALE, stateLabelKo: 'LIVE' }],
}), /STALE_CANNOT_BE_LIVE/);

const towerNow = flow.towerVisual(item, null);
assert.equal(towerNow.heightMeters, 164);
assert.equal(towerNow.footprintMeters, 420);
assert.equal(towerNow.primitive, 'AREA_MARKER');
assert.equal(towerNow.footprintMeaning, 'FIXED_DISPLAY_CELL_NOT_OFFICIAL_AREA');
assert.equal(towerNow.color, '#f7aa45');
assert.equal(towerNow.sourceType, 'OFFICIAL_OBSERVATION');
assert.equal(towerNow.animated, false);
assert.match(towerNow.legendKo, /기관 혼잡 등급/);
const towerAt = flow.towerVisual(item, '2026-08-20T12:00:00Z');
assert.equal(towerAt.heightMeters, 120);
assert.equal(towerAt.color, '#f5d58a');
assert.equal(towerAt.sourceType, 'OFFICIAL_FORECAST');
assert.equal(towerAt.at, '2026-08-20T12:00:00.000Z');
assert.equal(flow.towerVisual(stale, null).live, false);
assert.equal(flow.towerVisual(missingCoord, null), null);
assert.ok(towerNow.heightMeters >= 8 && towerNow.heightMeters <= 180);
assert.equal('radiusMeters' in towerNow, false, 'thin cylinder geometry must not return');

console.log('tourism flow contract: PASS');
