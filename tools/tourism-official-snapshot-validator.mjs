export const OFFICIAL_TOURISM_SNAPSHOT_CONTRACT = Object.freeze({
  schemaVersion: 'earthus.tourism-flow.v1',
  providerId: 'seoul-citydata-ppltn',
  providerMode: 'FULL',
  endpointClass: 'OFFICIAL_PUBLIC_API',
  sourceName: '서울특별시 실시간 인구데이터',
  sourceUrl: 'https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do',
  positionSource: '서울시 주요 121장소 영역',
});

const CATALOG_COORDINATE_TOLERANCE_DEGREES = 1e-6;
const ALLOWED_KEYS = Object.freeze({
  snapshot: ['schemaVersion', 'generatedAt', 'state', 'provider', 'source', 'coverage', 'quality', 'places'],
  provider: ['id', 'mode', 'endpointClass'],
  source: ['name', 'url', 'license'],
  coverage: ['available', 'total', 'requested', 'responses', 'errorCount', 'fullCoverage', 'noteKo'],
  quality: ['live', 'degraded', 'stale', 'unavailable', 'withOfficialForecast', 'withDirectionEvidence'],
  place: ['id', 'code', 'category', 'nameKo', 'nameEn', 'state', 'stateLabelKo', 'reasonCodes',
    'observedAgeMinutes', 'position', 'official', 'forecast', 'flow', 'provenance'],
  position: ['lat', 'lon', 'source'],
  observation: ['level', 'rank', 'message', 'populationRange', 'color', 'replacement', 'sourceType'],
  populationRange: ['min', 'max'],
  forecast: ['at', 'level', 'rank', 'populationRange', 'sourceType'],
  flow: ['scalarTrend', 'direction'],
  scalarTrend: ['state', 'direction', 'perHour', 'relativePerHour', 'flowDirection', 'sourceType',
    'method', 'sampleCount'],
  directionEvidence: ['state', 'value', 'reason'],
  provenance: ['sourceId', 'sourceName', 'sourceUrl', 'observedAt', 'receivedAt', 'schemaVersion',
    'processorVersion', 'license', 'redisplay'],
});

function requireOfficial(condition, code) {
  if (!condition) throw new Error(code);
}

function assertAllowedRecord(value, allowedKeys, code) {
  requireOfficial(value != null && typeof value === 'object' && !Array.isArray(value), code);
  const allowed = new Set(allowedKeys);
  requireOfficial(Object.keys(value).every(key => allowed.has(key)), code);
}

function assertStringFields(value, fields, code) {
  requireOfficial(fields.every(key => typeof value[key] === 'string'), code);
}

function assertNumberFields(value, fields, code) {
  requireOfficial(fields.every(key => Number.isFinite(value[key])), code);
}

function canonicalPlaces(catalog) {
  requireOfficial(catalog?.schemaVersion === 'earthus.tourism-place-catalog.v1',
    'OFFICIAL_CATALOG_SCHEMA_INVALID');
  requireOfficial(catalog?.source?.publisher === '서울특별시', 'OFFICIAL_CATALOG_SOURCE_INVALID');
  requireOfficial(Array.isArray(catalog?.places) && catalog.places.length === 121,
    'OFFICIAL_CATALOG_COUNT_INVALID');
  requireOfficial(new Set(catalog.places.map(place => place.code)).size === 121,
    'OFFICIAL_CATALOG_CODE_DUPLICATE');
  requireOfficial(catalog.places.every(place => /^POI\d{3}$/.test(place.code)
    && typeof place.nameKo === 'string' && typeof place.nameEn === 'string'
    && typeof place.category === 'string' && Number.isFinite(place.lat) && Number.isFinite(place.lon)
    && place.geometrySource === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.positionSource),
  'OFFICIAL_CATALOG_SCHEMA_INVALID');
  return new Map(catalog.places.map(place => [place.code, Object.freeze({
    ...place,
    id: `earthus:tourism:seoul:${place.code}`,
  })]));
}

export function assertOfficialTourismSnapshot(candidate, catalog) {
  const canonicalPlacesByCode = canonicalPlaces(catalog);
  assertAllowedRecord(candidate, ALLOWED_KEYS.snapshot, 'OFFICIAL_SNAPSHOT_SCHEMA_INVALID');
  assertAllowedRecord(candidate.provider, ALLOWED_KEYS.provider, 'OFFICIAL_PROVIDER_SCHEMA_INVALID');
  assertAllowedRecord(candidate.source, ALLOWED_KEYS.source, 'OFFICIAL_SOURCE_SCHEMA_INVALID');
  assertAllowedRecord(candidate.coverage, ALLOWED_KEYS.coverage, 'OFFICIAL_COVERAGE_SCHEMA_INVALID');
  assertAllowedRecord(candidate.quality, ALLOWED_KEYS.quality, 'OFFICIAL_QUALITY_SCHEMA_INVALID');
  assertStringFields(candidate, ['schemaVersion', 'generatedAt', 'state'], 'OFFICIAL_SNAPSHOT_SCHEMA_INVALID');
  assertStringFields(candidate.provider, ['id', 'mode', 'endpointClass'], 'OFFICIAL_PROVIDER_SCHEMA_INVALID');
  assertStringFields(candidate.source, ['name', 'url', 'license'], 'OFFICIAL_SOURCE_SCHEMA_INVALID');
  assertNumberFields(candidate.coverage, ['available', 'total', 'requested', 'responses', 'errorCount'],
    'OFFICIAL_COVERAGE_SCHEMA_INVALID');
  requireOfficial(typeof candidate.coverage.fullCoverage === 'boolean'
    && typeof candidate.coverage.noteKo === 'string', 'OFFICIAL_COVERAGE_SCHEMA_INVALID');
  assertNumberFields(candidate.quality,
    ['live', 'degraded', 'stale', 'unavailable', 'withOfficialForecast', 'withDirectionEvidence'],
    'OFFICIAL_QUALITY_SCHEMA_INVALID');
  requireOfficial(candidate.schemaVersion === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.schemaVersion,
    'OFFICIAL_SCHEMA_INVALID');
  requireOfficial(candidate.provider.id === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.providerId,
    'OFFICIAL_PROVIDER_INVALID');
  requireOfficial(candidate.provider.mode === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.providerMode,
    'OFFICIAL_PROVIDER_MODE_INVALID');
  requireOfficial(candidate.provider.endpointClass === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.endpointClass,
    'OFFICIAL_ENDPOINT_INVALID');
  requireOfficial(candidate.source.name === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.sourceName
    && candidate.source.url === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.sourceUrl,
  'OFFICIAL_SOURCE_URL_INVALID');
  requireOfficial(candidate.coverage.available === 121 && candidate.coverage.total === 121
    && candidate.coverage.requested === 121 && candidate.coverage.responses === 121
    && candidate.coverage.errorCount === 0 && candidate.coverage.fullCoverage === true,
  'OFFICIAL_COVERAGE_INVALID');
  requireOfficial(Array.isArray(candidate.places) && candidate.places.length === 121,
    'OFFICIAL_PLACE_COUNT_INVALID');

  const ids = new Set();
  const codes = new Set();
  for (const place of candidate.places) {
    assertAllowedRecord(place, ALLOWED_KEYS.place, 'OFFICIAL_PLACE_SCHEMA_INVALID');
    requireOfficial(typeof place.id === 'string', 'OFFICIAL_PLACE_ID_INVALID');
    requireOfficial(!ids.has(place.id), 'OFFICIAL_PLACE_ID_DUPLICATE');
    ids.add(place.id);
    requireOfficial(typeof place.code === 'string' && /^POI\d{3}$/.test(place.code),
      'OFFICIAL_PLACE_CODE_INVALID');
    requireOfficial(!codes.has(place.code), 'OFFICIAL_PLACE_CODE_DUPLICATE');
    codes.add(place.code);
  }

  for (const place of candidate.places) {
    const canonical = canonicalPlacesByCode.get(place.code);
    requireOfficial(Boolean(canonical) && place.id === canonical.id, 'OFFICIAL_CATALOG_IDENTITY_INVALID');
    requireOfficial(place.nameKo === canonical.nameKo && place.nameEn === canonical.nameEn,
      'OFFICIAL_PLACE_NAME_INVALID');
    requireOfficial(place.category === canonical.category, 'OFFICIAL_PLACE_CATEGORY_INVALID');
    assertStringFields(place, ['id', 'code', 'category', 'nameKo', 'nameEn', 'state', 'stateLabelKo'],
      'OFFICIAL_PLACE_SCHEMA_INVALID');
    assertNumberFields(place, ['observedAgeMinutes'], 'OFFICIAL_PLACE_SCHEMA_INVALID');
    requireOfficial(Array.isArray(place.reasonCodes)
      && place.reasonCodes.every(reason => typeof reason === 'string'), 'OFFICIAL_PLACE_SCHEMA_INVALID');
    assertAllowedRecord(place.position, ALLOWED_KEYS.position, 'OFFICIAL_POSITION_SCHEMA_INVALID');
    requireOfficial(Number.isFinite(place.position.lat) && Number.isFinite(place.position.lon)
      && Math.abs(place.position.lat - canonical.lat) <= CATALOG_COORDINATE_TOLERANCE_DEGREES
      && Math.abs(place.position.lon - canonical.lon) <= CATALOG_COORDINATE_TOLERANCE_DEGREES,
    'OFFICIAL_PLACE_POSITION_INVALID');
    assertAllowedRecord(place.official, ALLOWED_KEYS.observation, 'OFFICIAL_OBSERVATION_SCHEMA_INVALID');
    assertAllowedRecord(place.official.populationRange, ALLOWED_KEYS.populationRange,
      'OFFICIAL_OBSERVATION_SCHEMA_INVALID');
    requireOfficial(typeof place.official.message === 'string' && typeof place.official.level === 'string'
      && typeof place.official.color === 'string' && typeof place.official.replacement === 'boolean'
      && typeof place.official.sourceType === 'string' && Number.isFinite(place.official.rank)
      && Number.isFinite(place.official.populationRange.min)
      && Number.isFinite(place.official.populationRange.max), 'OFFICIAL_OBSERVATION_SCHEMA_INVALID');
    requireOfficial(Array.isArray(place.forecast), 'OFFICIAL_FORECAST_SCHEMA_INVALID');
    for (const row of place.forecast) {
      assertAllowedRecord(row, ALLOWED_KEYS.forecast, 'OFFICIAL_FORECAST_SCHEMA_INVALID');
      assertAllowedRecord(row.populationRange, ALLOWED_KEYS.populationRange, 'OFFICIAL_FORECAST_SCHEMA_INVALID');
      requireOfficial(typeof row.at === 'string' && typeof row.level === 'string'
        && typeof row.sourceType === 'string' && Number.isFinite(row.rank)
        && Number.isFinite(row.populationRange.min) && Number.isFinite(row.populationRange.max),
      'OFFICIAL_FORECAST_SCHEMA_INVALID');
    }
    assertAllowedRecord(place.flow, ALLOWED_KEYS.flow, 'OFFICIAL_FLOW_SCHEMA_INVALID');
    assertAllowedRecord(place.flow.scalarTrend, ALLOWED_KEYS.scalarTrend,
      'OFFICIAL_SCALAR_TREND_SCHEMA_INVALID');
    assertAllowedRecord(place.flow.direction, ALLOWED_KEYS.directionEvidence,
      'OFFICIAL_DIRECTION_EVIDENCE_SCHEMA_INVALID');
    requireOfficial(typeof place.flow.scalarTrend.direction === 'string',
      'OFFICIAL_SCALAR_TREND_SCHEMA_INVALID');
    assertStringFields(place.flow.scalarTrend, ['state', 'direction', 'sourceType', 'method'],
      'OFFICIAL_SCALAR_TREND_SCHEMA_INVALID');
    assertNumberFields(place.flow.scalarTrend, ['perHour', 'relativePerHour', 'sampleCount'],
      'OFFICIAL_SCALAR_TREND_SCHEMA_INVALID');
    requireOfficial(place.flow.scalarTrend.flowDirection == null, 'MOVEMENT_DIRECTION_FORBIDDEN');
    assertStringFields(place.flow.direction, ['state', 'reason'], 'OFFICIAL_DIRECTION_EVIDENCE_SCHEMA_INVALID');
    requireOfficial(place.flow.direction.state === 'UNAVAILABLE' && place.flow.direction.value == null,
      'MOVEMENT_DIRECTION_FORBIDDEN');
    assertAllowedRecord(place.provenance, ALLOWED_KEYS.provenance,
      'OFFICIAL_PLACE_PROVENANCE_SCHEMA_INVALID');
    assertStringFields(place.provenance, ALLOWED_KEYS.provenance,
      'OFFICIAL_PLACE_PROVENANCE_SCHEMA_INVALID');
    requireOfficial(place.position.source === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.positionSource
      && place.provenance.sourceId === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.providerId
      && place.provenance.sourceName === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.sourceName
      && place.provenance.sourceUrl === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.sourceUrl
      && place.provenance.schemaVersion === OFFICIAL_TOURISM_SNAPSHOT_CONTRACT.schemaVersion,
    'OFFICIAL_PLACE_PROVENANCE_INVALID');
    requireOfficial(place.official.sourceType === 'OFFICIAL_OBSERVATION',
      'OFFICIAL_OBSERVATION_SOURCE_TYPE_INVALID');
    requireOfficial(place.forecast.every(row => row.sourceType === 'OFFICIAL_FORECAST'),
      'OFFICIAL_FORECAST_SOURCE_TYPE_INVALID');
  }
  requireOfficial(canonicalPlacesByCode.size === codes.size
    && [...canonicalPlacesByCode.keys()].every(code => codes.has(code)),
  'OFFICIAL_CATALOG_IDENTITY_INVALID');
  return Object.freeze({
    state: candidate.state,
    canonicalPlaceIds: [...canonicalPlacesByCode.values()].map(place => place.id).sort(),
  });
}

export const OFFICIAL_TOURISM_SNAPSHOT_NEGATIVE_CASES = Object.freeze([
  ['official-looking synthetic catalog', /OFFICIAL_CATALOG_IDENTITY_INVALID/, candidate => {
    candidate.places.forEach((place, index) => {
      place.code = `POI${String(index + 201).padStart(3, '0')}`;
      place.id = `earthus:tourism:seoul:${place.code}`;
    });
  }],
  ['canonical place added and one missing', /OFFICIAL_CATALOG_IDENTITY_INVALID/, candidate => {
    candidate.places[0].code = 'POI999';
    candidate.places[0].id = 'earthus:tourism:seoul:POI999';
  }],
  ['canonical Korean name changed', /OFFICIAL_PLACE_NAME_INVALID/, candidate => {
    candidate.places[0].nameKo = '공식처럼 보이는 합성 관광지';
  }],
  ['canonical English name changed', /OFFICIAL_PLACE_NAME_INVALID/, candidate => {
    candidate.places[0].nameEn = 'Official-looking Synthetic Place';
  }],
  ['canonical coordinate displaced', /OFFICIAL_PLACE_POSITION_INVALID/, candidate => {
    candidate.places[0].position.lat += 0.001;
  }],
  ['generic direction injection', /OFFICIAL_PLACE_SCHEMA_INVALID/, candidate => {
    candidate.places[0].direction = { bearing: 90, to: 'POI002' };
  }],
  ['snapshot movement injection', /OFFICIAL_SNAPSHOT_SCHEMA_INVALID/, candidate => {
    candidate.movement = { path: [[126.9, 37.5], [127.0, 37.6]] };
  }],
  ['observation route injection', /OFFICIAL_OBSERVATION_SCHEMA_INVALID/, candidate => {
    candidate.places[0].official.route = [[126.9, 37.5], [127.0, 37.6]];
  }],
  ['forecast vector injection', /OFFICIAL_FORECAST_SCHEMA_INVALID/, candidate => {
    candidate.places[0].forecast[0].vector = { bearing: 90 };
  }],
  ['flow path injection', /OFFICIAL_FLOW_SCHEMA_INVALID/, candidate => {
    candidate.places[0].flow.path = [[126.9, 37.5], [127.0, 37.6]];
  }],
  ['scalar trend direction object', /OFFICIAL_SCALAR_TREND_SCHEMA_INVALID/, candidate => {
    candidate.places[0].flow.scalarTrend.direction = { bearing: 90 };
  }],
  ['schema', /OFFICIAL_SCHEMA_INVALID/, candidate => { candidate.schemaVersion = 'earthus.synthetic-tourism.v1'; }],
  ['provider', /OFFICIAL_PROVIDER_INVALID/, candidate => { candidate.provider.id = 'synthetic-provider'; }],
  ['provider mode', /OFFICIAL_PROVIDER_MODE_INVALID/, candidate => { candidate.provider.mode = 'SAMPLE'; }],
  ['endpoint contract', /OFFICIAL_ENDPOINT_INVALID/, candidate => { candidate.provider.endpointClass = 'SYNTHETIC_FIXTURE'; }],
  ['public source URL', /OFFICIAL_SOURCE_URL_INVALID/, candidate => { candidate.source.url = 'https://example.test/data.json'; }],
  ['unique place IDs', /OFFICIAL_PLACE_ID_DUPLICATE/, candidate => { candidate.places[1].id = candidate.places[0].id; }],
  ['unique place codes', /OFFICIAL_PLACE_CODE_DUPLICATE/, candidate => { candidate.places[1].code = candidate.places[0].code; }],
  ['per-place provenance', /OFFICIAL_PLACE_PROVENANCE_INVALID/, candidate => { candidate.places[0].provenance.sourceId = 'synthetic-provider'; }],
  ['observation source type', /OFFICIAL_OBSERVATION_SOURCE_TYPE_INVALID/, candidate => { candidate.places[0].official.sourceType = 'SYNTHETIC_OBSERVATION'; }],
  ['forecast source type', /OFFICIAL_FORECAST_SOURCE_TYPE_INVALID/, candidate => { candidate.places[0].forecast[0].sourceType = 'SYNTHETIC_FORECAST'; }],
  ['OD shape', /OFFICIAL_PLACE_SCHEMA_INVALID/, candidate => { candidate.places[0].od = [{ from: 'POI001', to: 'POI002' }]; }],
  ['direction shape', /MOVEMENT_DIRECTION_FORBIDDEN/, candidate => {
    candidate.places[0].flow.direction = { state: 'READY', value: { bearing: 90 }, reason: 'made-up' };
  }],
  ['link shape', /OFFICIAL_PLACE_SCHEMA_INVALID/, candidate => { candidate.places[0].links = [{ to: 'POI002' }]; }],
  ['edge shape', /OFFICIAL_PLACE_SCHEMA_INVALID/, candidate => { candidate.places[0].edges = [{ from: 'POI001', to: 'POI002' }]; }],
  ['flow-line shape', /OFFICIAL_PLACE_SCHEMA_INVALID/, candidate => { candidate.places[0].flowLines = [[126.9, 37.5], [127.0, 37.6]]; }],
]);
