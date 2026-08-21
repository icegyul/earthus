#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const target = process.env.EARTHUS_TOURISM_URL || 'http://127.0.0.1:8880/';
const snapshotPath = process.env.EARTHUS_TOURISM_SNAPSHOT || null;
const snapshotUrl = process.env.EARTHUS_TOURISM_SNAPSHOT_URL
  || 'https://earthus.net/tourism/seoul-flow.json';
const executablePath = process.env.EARTHUS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const localConfig = await readFile(
  new URL('../prototype/js/config.local.example.js', import.meta.url), 'utf8',
);
const officialCatalog = JSON.parse(await readFile(
  new URL('../prototype/data/tourism/seoul-121-catalog.v1.json', import.meta.url), 'utf8',
));
const loadedAt = new Date().toISOString();
const snapshot = snapshotPath
  ? JSON.parse(await readFile(snapshotPath, 'utf8'))
  : await fetch(snapshotUrl, { cache: 'no-cache' }).then(async response => {
    assert.equal(response.ok, true, `tourism snapshot HTTP ${response.status}`);
    return response.json();
  });

const OFFICIAL_SNAPSHOT_CONTRACT = Object.freeze({
  schemaVersion: 'earthus.tourism-flow.v1',
  providerId: 'seoul-citydata-ppltn',
  providerMode: 'FULL',
  endpointClass: 'OFFICIAL_PUBLIC_API',
  sourceName: '서울특별시 실시간 인구데이터',
  sourceUrl: 'https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do',
  positionSource: '서울시 주요 121장소 영역',
});
// 독립 catalog JSON과 snapshot JSON의 직렬화 오차만 허용한다(위도 1e-6°는 약 0.11m).
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

assert.equal(officialCatalog.schemaVersion, 'earthus.tourism-place-catalog.v1');
assert.equal(officialCatalog.source?.publisher, '서울특별시');
assert.equal(officialCatalog.places?.length, 121);
assert.equal(new Set(officialCatalog.places.map(place => place.code)).size, 121);
assert.ok(officialCatalog.places.every(place => /^POI\d{3}$/.test(place.code)
  && typeof place.nameKo === 'string' && typeof place.nameEn === 'string'
  && Number.isFinite(place.lat) && Number.isFinite(place.lon)
  && place.geometrySource === OFFICIAL_SNAPSHOT_CONTRACT.positionSource));
const canonicalPlacesByCode = new Map(officialCatalog.places.map(place => [place.code, Object.freeze({
  ...place,
  id: `earthus:tourism:seoul:${place.code}`,
})]));

function assertOfficialFullSnapshot(candidate) {
  assertAllowedRecord(candidate, ALLOWED_KEYS.snapshot, 'OFFICIAL_SNAPSHOT_SCHEMA_INVALID');
  assertAllowedRecord(candidate.provider, ALLOWED_KEYS.provider, 'OFFICIAL_PROVIDER_SCHEMA_INVALID');
  assertAllowedRecord(candidate.source, ALLOWED_KEYS.source, 'OFFICIAL_SOURCE_SCHEMA_INVALID');
  assertAllowedRecord(candidate.coverage, ALLOWED_KEYS.coverage, 'OFFICIAL_COVERAGE_SCHEMA_INVALID');
  assertAllowedRecord(candidate.quality, ALLOWED_KEYS.quality, 'OFFICIAL_QUALITY_SCHEMA_INVALID');
  assertStringFields(candidate, ['schemaVersion', 'generatedAt', 'state'],
    'OFFICIAL_SNAPSHOT_SCHEMA_INVALID');
  assertStringFields(candidate.provider, ['id', 'mode', 'endpointClass'],
    'OFFICIAL_PROVIDER_SCHEMA_INVALID');
  assertStringFields(candidate.source, ['name', 'url', 'license'],
    'OFFICIAL_SOURCE_SCHEMA_INVALID');
  assertNumberFields(candidate.coverage,
    ['available', 'total', 'requested', 'responses', 'errorCount'],
    'OFFICIAL_COVERAGE_SCHEMA_INVALID');
  requireOfficial(typeof candidate.coverage.fullCoverage === 'boolean'
    && typeof candidate.coverage.noteKo === 'string',
  'OFFICIAL_COVERAGE_SCHEMA_INVALID');
  assertNumberFields(candidate.quality,
    ['live', 'degraded', 'stale', 'unavailable', 'withOfficialForecast', 'withDirectionEvidence'],
    'OFFICIAL_QUALITY_SCHEMA_INVALID');
  requireOfficial(candidate?.schemaVersion === OFFICIAL_SNAPSHOT_CONTRACT.schemaVersion,
    'OFFICIAL_SCHEMA_INVALID');
  requireOfficial(candidate?.provider?.id === OFFICIAL_SNAPSHOT_CONTRACT.providerId,
    'OFFICIAL_PROVIDER_INVALID');
  requireOfficial(candidate?.provider?.mode === OFFICIAL_SNAPSHOT_CONTRACT.providerMode,
    'OFFICIAL_PROVIDER_MODE_INVALID');
  requireOfficial(candidate?.provider?.endpointClass === OFFICIAL_SNAPSHOT_CONTRACT.endpointClass,
    'OFFICIAL_ENDPOINT_INVALID');
  requireOfficial(candidate?.source?.name === OFFICIAL_SNAPSHOT_CONTRACT.sourceName
    && candidate?.source?.url === OFFICIAL_SNAPSHOT_CONTRACT.sourceUrl,
  'OFFICIAL_SOURCE_URL_INVALID');
  requireOfficial(candidate?.coverage?.available === 121
    && candidate?.coverage?.total === 121
    && candidate?.coverage?.requested === 121
    && candidate?.coverage?.responses === 121
    && candidate?.coverage?.errorCount === 0
    && candidate?.coverage?.fullCoverage === true,
  'OFFICIAL_COVERAGE_INVALID');
  requireOfficial(Array.isArray(candidate?.places) && candidate.places.length === 121,
    'OFFICIAL_PLACE_COUNT_INVALID');

  const ids = new Set();
  const codes = new Set();
  for (const place of candidate.places) {
    assertAllowedRecord(place, ALLOWED_KEYS.place, 'OFFICIAL_PLACE_SCHEMA_INVALID');
    requireOfficial(typeof place?.id === 'string', 'OFFICIAL_PLACE_ID_INVALID');
    requireOfficial(!ids.has(place.id), 'OFFICIAL_PLACE_ID_DUPLICATE');
    ids.add(place.id);
    requireOfficial(typeof place?.code === 'string' && /^POI\d{3}$/.test(place.code),
      'OFFICIAL_PLACE_CODE_INVALID');
    requireOfficial(!codes.has(place.code), 'OFFICIAL_PLACE_CODE_DUPLICATE');
    codes.add(place.code);
  }
  for (const place of candidate.places) {
    const canonical = canonicalPlacesByCode.get(place.code);
    requireOfficial(Boolean(canonical) && place.id === canonical.id,
      'OFFICIAL_CATALOG_IDENTITY_INVALID');
    requireOfficial(place.nameKo === canonical.nameKo && place.nameEn === canonical.nameEn,
      'OFFICIAL_PLACE_NAME_INVALID');
    requireOfficial(place.category === canonical.category, 'OFFICIAL_PLACE_CATEGORY_INVALID');
    assertStringFields(place,
      ['id', 'code', 'category', 'nameKo', 'nameEn', 'state', 'stateLabelKo'],
    'OFFICIAL_PLACE_SCHEMA_INVALID');
    assertNumberFields(place, ['observedAgeMinutes'], 'OFFICIAL_PLACE_SCHEMA_INVALID');
    assertAllowedRecord(place.position, ALLOWED_KEYS.position, 'OFFICIAL_POSITION_SCHEMA_INVALID');
    requireOfficial(Number.isFinite(place.position.lat) && Number.isFinite(place.position.lon)
      && Math.abs(place.position.lat - canonical.lat) <= CATALOG_COORDINATE_TOLERANCE_DEGREES
      && Math.abs(place.position.lon - canonical.lon) <= CATALOG_COORDINATE_TOLERANCE_DEGREES,
    'OFFICIAL_PLACE_POSITION_INVALID');
    requireOfficial(Array.isArray(place.reasonCodes)
      && place.reasonCodes.every(reason => typeof reason === 'string'),
    'OFFICIAL_PLACE_SCHEMA_INVALID');
    assertAllowedRecord(place.official, ALLOWED_KEYS.observation,
      'OFFICIAL_OBSERVATION_SCHEMA_INVALID');
    assertAllowedRecord(place.official.populationRange, ALLOWED_KEYS.populationRange,
      'OFFICIAL_OBSERVATION_SCHEMA_INVALID');
    requireOfficial(typeof place.official.message === 'string'
      && typeof place.official.level === 'string'
      && typeof place.official.color === 'string'
      && typeof place.official.replacement === 'boolean'
      && typeof place.official.sourceType === 'string'
      && Number.isFinite(place.official.rank)
      && Number.isFinite(place.official.populationRange.min)
      && Number.isFinite(place.official.populationRange.max),
    'OFFICIAL_OBSERVATION_SCHEMA_INVALID');
    requireOfficial(Array.isArray(place.forecast), 'OFFICIAL_FORECAST_SCHEMA_INVALID');
    for (const row of place.forecast) {
      assertAllowedRecord(row, ALLOWED_KEYS.forecast, 'OFFICIAL_FORECAST_SCHEMA_INVALID');
      assertAllowedRecord(row.populationRange, ALLOWED_KEYS.populationRange,
        'OFFICIAL_FORECAST_SCHEMA_INVALID');
      requireOfficial(typeof row.at === 'string' && typeof row.level === 'string'
        && typeof row.sourceType === 'string'
        && Number.isFinite(row.rank)
        && Number.isFinite(row.populationRange.min)
        && Number.isFinite(row.populationRange.max),
      'OFFICIAL_FORECAST_SCHEMA_INVALID');
    }
    assertAllowedRecord(place.flow, ALLOWED_KEYS.flow, 'OFFICIAL_FLOW_SCHEMA_INVALID');
    assertAllowedRecord(place.flow.scalarTrend, ALLOWED_KEYS.scalarTrend,
      'OFFICIAL_SCALAR_TREND_SCHEMA_INVALID');
    assertAllowedRecord(place.flow.direction, ALLOWED_KEYS.directionEvidence,
      'OFFICIAL_DIRECTION_EVIDENCE_SCHEMA_INVALID');
    requireOfficial(place.flow.direction.state === 'UNAVAILABLE'
      && place.flow.direction.value == null,
    'MOVEMENT_DIRECTION_FORBIDDEN');
    requireOfficial(typeof place.flow.scalarTrend.direction === 'string',
      'OFFICIAL_SCALAR_TREND_SCHEMA_INVALID');
    assertStringFields(place.flow.scalarTrend, ['state', 'direction', 'sourceType', 'method'],
      'OFFICIAL_SCALAR_TREND_SCHEMA_INVALID');
    assertNumberFields(place.flow.scalarTrend, ['perHour', 'relativePerHour', 'sampleCount'],
      'OFFICIAL_SCALAR_TREND_SCHEMA_INVALID');
    requireOfficial(place.flow.scalarTrend.flowDirection == null,
      'MOVEMENT_DIRECTION_FORBIDDEN');
    assertStringFields(place.flow.direction, ['state', 'reason'],
      'OFFICIAL_DIRECTION_EVIDENCE_SCHEMA_INVALID');
    requireOfficial(place.flow.direction.value == null, 'MOVEMENT_DIRECTION_FORBIDDEN');
    assertAllowedRecord(place.provenance, ALLOWED_KEYS.provenance,
      'OFFICIAL_PLACE_PROVENANCE_SCHEMA_INVALID');
    assertStringFields(place.provenance, ALLOWED_KEYS.provenance,
      'OFFICIAL_PLACE_PROVENANCE_SCHEMA_INVALID');
    requireOfficial(place?.position?.source === OFFICIAL_SNAPSHOT_CONTRACT.positionSource
      && place?.provenance?.sourceId === OFFICIAL_SNAPSHOT_CONTRACT.providerId
      && place?.provenance?.sourceName === OFFICIAL_SNAPSHOT_CONTRACT.sourceName
      && place?.provenance?.sourceUrl === OFFICIAL_SNAPSHOT_CONTRACT.sourceUrl
      && place?.provenance?.schemaVersion === OFFICIAL_SNAPSHOT_CONTRACT.schemaVersion,
    'OFFICIAL_PLACE_PROVENANCE_INVALID');
    requireOfficial(place?.official?.sourceType === 'OFFICIAL_OBSERVATION',
      'OFFICIAL_OBSERVATION_SOURCE_TYPE_INVALID');
    requireOfficial(Array.isArray(place?.forecast)
      && place.forecast.every(row => row?.sourceType === 'OFFICIAL_FORECAST'),
    'OFFICIAL_FORECAST_SOURCE_TYPE_INVALID');
  }
  requireOfficial(canonicalPlacesByCode.size === codes.size
    && [...canonicalPlacesByCode.keys()].every(code => codes.has(code)),
  'OFFICIAL_CATALOG_IDENTITY_INVALID');
}

const invalidOfficialSnapshotCases = [
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
  ['snapshot movement shape injection', /OFFICIAL_SNAPSHOT_SCHEMA_INVALID/, candidate => {
    candidate.movement = { path: [[126.9, 37.5], [127.0, 37.6]] };
  }],
  ['observation movement shape injection', /OFFICIAL_OBSERVATION_SCHEMA_INVALID/, candidate => {
    candidate.places[0].official.route = [[126.9, 37.5], [127.0, 37.6]];
  }],
  ['forecast movement shape injection', /OFFICIAL_FORECAST_SCHEMA_INVALID/, candidate => {
    candidate.places[0].forecast[0].vector = { bearing: 90 };
  }],
  ['flow movement shape injection', /OFFICIAL_FLOW_SCHEMA_INVALID/, candidate => {
    candidate.places[0].flow.path = [[126.9, 37.5], [127.0, 37.6]];
  }],
  ['scalar trend direction object', /OFFICIAL_SCALAR_TREND_SCHEMA_INVALID/, candidate => {
    candidate.places[0].flow.scalarTrend.direction = { bearing: 90 };
  }],
  ['schema', /OFFICIAL_SCHEMA_INVALID/, candidate => {
    candidate.schemaVersion = 'earthus.synthetic-tourism.v1';
  }],
  ['provider', /OFFICIAL_PROVIDER_INVALID/, candidate => {
    candidate.provider.id = 'self-declared-synthetic-provider';
  }],
  ['provider mode', /OFFICIAL_PROVIDER_MODE_INVALID/, candidate => {
    candidate.provider.mode = 'SAMPLE';
  }],
  ['endpoint contract', /OFFICIAL_ENDPOINT_INVALID/, candidate => {
    candidate.provider.endpointClass = 'SYNTHETIC_FIXTURE';
  }],
  ['public source URL', /OFFICIAL_SOURCE_URL_INVALID/, candidate => {
    candidate.source.url = 'https://example.test/self-declared.json';
  }],
  ['unique place IDs', /OFFICIAL_PLACE_ID_DUPLICATE/, candidate => {
    candidate.places[1].id = candidate.places[0].id;
  }],
  ['unique place codes', /OFFICIAL_PLACE_CODE_DUPLICATE/, candidate => {
    candidate.places[1].code = candidate.places[0].code;
  }],
  ['per-place provenance', /OFFICIAL_PLACE_PROVENANCE_INVALID/, candidate => {
    candidate.places[0].provenance.sourceId = 'synthetic-provider';
  }],
  ['observation source type', /OFFICIAL_OBSERVATION_SOURCE_TYPE_INVALID/, candidate => {
    candidate.places[0].official.sourceType = 'SYNTHETIC_OBSERVATION';
  }],
  ['forecast source type', /OFFICIAL_FORECAST_SOURCE_TYPE_INVALID/, candidate => {
    candidate.places[0].forecast[0].sourceType = 'SYNTHETIC_FORECAST';
  }],
  ['OD shape', /OFFICIAL_PLACE_SCHEMA_INVALID/, candidate => {
    candidate.places[0].od = [{ from: 'POI001', to: 'POI002' }];
  }],
  ['direction shape', /MOVEMENT_DIRECTION_FORBIDDEN/, candidate => {
    candidate.places[0].flow.direction = { state: 'READY', value: { bearing: 90 } };
  }],
  ['link shape', /OFFICIAL_PLACE_SCHEMA_INVALID/, candidate => {
    candidate.places[0].links = [{ to: 'POI002' }];
  }],
  ['edge shape', /OFFICIAL_PLACE_SCHEMA_INVALID/, candidate => {
    candidate.places[0].edges = [{ from: 'POI001', to: 'POI002' }];
  }],
  ['flow-line shape', /OFFICIAL_PLACE_SCHEMA_INVALID/, candidate => {
    candidate.places[0].flowLines = [[126.9, 37.5], [127.0, 37.6]];
  }],
];
const acceptedInvalidSnapshots = [];
const wrongInvalidSnapshotErrors = [];
for (const [label, expectedError, mutate] of invalidOfficialSnapshotCases) {
  const candidate = structuredClone(snapshot);
  mutate(candidate);
  try {
    assertOfficialFullSnapshot(candidate);
    acceptedInvalidSnapshots.push(label);
  } catch (error) {
    if (!expectedError.test(String(error?.message || error))) {
      wrongInvalidSnapshotErrors.push({ label, error: String(error?.message || error) });
    }
  }
}
assert.deepEqual(acceptedInvalidSnapshots, [],
  `invalid 121-row snapshots accepted by official visual QA: ${acceptedInvalidSnapshots.join(', ')}`);
assert.deepEqual(wrongInvalidSnapshotErrors, [],
  `invalid snapshots rejected for the wrong reason: ${JSON.stringify(wrongInvalidSnapshotErrors)}`);
assertOfficialFullSnapshot(snapshot);
console.log(`official snapshot gate: PASS (${invalidOfficialSnapshotCases.length} negative mutations, canonical catalog 121)`);
const forecastAt = [...new Set(snapshot.places.flatMap(place =>
  (place.forecast || []).filter(row => row.rank === 4).map(row => row.at),
))].sort()[0];
assert.ok(forecastAt, 'visual QA requires a real official forecast timestamp containing rank 4');
console.log(`snapshot: ${JSON.stringify({
  input: snapshotPath || snapshotUrl,
  loadedAt,
  generatedAt: snapshot.generatedAt,
  state: snapshot.state,
  sourceUrl: snapshot.source?.url,
  available: snapshot.coverage.available,
})}`);

const viewLevels = [
  { name: 'overview', height: 26_000, lon: 126.89, lat: 37.36, pitch: -52 },
  { name: 'district', height: 12_000, lon: 126.95, lat: 37.50, pitch: -58 },
  { name: 'detail', height: 4_000, lon: 126.976, lat: 37.568, pitch: -58 },
];

async function collectView(page) {
  return page.evaluate(async () => {
    const [{ tourismFlow }, { viewer }] = await Promise.all([
      import(new URL('js/layers/tourism-flow.js?v=20260821-density-lod1', location.href).href),
      import(new URL('js/viewer.js', location.href).href),
    ]);
    viewer.render();
    const canvas = viewer.scene.canvas;
    const cells = tourismFlow.ds.entities.values;
    const projected = cells.map(entity => {
      const world = entity.position?.getValue(viewer.clock.currentTime);
      const point = world
        ? Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, world) : null;
      return point && point.x >= 0 && point.x < canvas.clientWidth
        && point.y >= 0 && point.y < canvas.clientHeight ? point : null;
    }).filter(Boolean);
    const nearest = projected.map((point, index) => {
      let minimum = Number.POSITIVE_INFINITY;
      for (let other = 0; other < projected.length; other += 1) {
        if (index === other) continue;
        minimum = Math.min(minimum, Math.hypot(
          point.x - projected[other].x, point.y - projected[other].y,
        ));
      }
      return minimum;
    }).filter(Number.isFinite).sort((left, right) => left - right);
    const allocationRows = cells.flatMap(entity => entity._tourismContributors || []);
    const allocationAudit = new Map();
    for (const allocation of allocationRows) {
      const row = allocationAudit.get(allocation.placeId) || { count: 0, weight: 0 };
      row.count += 1;
      row.weight += Number(allocation.weight);
      allocationAudit.set(allocation.placeId, row);
    }
    const sourceWeightErrors = [...allocationAudit.entries()].filter(([, row]) =>
      row.count < 9 || row.count > 25 || Math.abs(row.weight - 1) > 1e-9,
    ).map(([placeId, row]) => ({ placeId, ...row }));
    const heights = cells.map(entity =>
      entity.box.dimensions.getValue(viewer.clock.currentTime).z);
    const visibleLabels = tourismFlow.labelDs.entities.values.filter(entity =>
      entity.label.show.getValue(viewer.clock.currentTime)).map(entity => ({
      text: entity.label.text.getValue(viewer.clock.currentTime),
      kind: entity._tourismLabelCandidate?.kind,
    }));
    const graphics = cells.map(entity => ({
      box: Boolean(entity.box),
      polyline: Boolean(entity.polyline),
      corridor: Boolean(entity.corridor),
      wall: Boolean(entity.wall),
    }));
    const bandHeights = cells.reduce((result, entity) => {
      const band = entity._tourismVisual?.band;
      const height = entity._tourismVisual?.heightMeters;
      if (band && Number.isFinite(height)) (result[band] ||= []).push(height);
      return result;
    }, {});
    const sourceToggle = document.querySelector('#provenanceDock .pd-toggle');
    const sourceStyle = sourceToggle ? getComputedStyle(sourceToggle) : null;
    const timeline = document.querySelector('.tm-timeline');
    const sourceRect = sourceToggle?.getBoundingClientRect() || null;
    const timelineRect = timeline?.getBoundingClientRect() || null;
    const rect = value => value ? {
      left: value.left, top: value.top, right: value.right, bottom: value.bottom,
      width: value.width, height: value.height,
    } : null;
    const intersects = (left, right) => Boolean(left && right
      && left.left < right.right && left.right > right.left
      && left.top < right.bottom && left.bottom > right.top);
    const visibleTimelineControlRects = [...(timeline?.querySelectorAll('button') || [])]
      .filter(button => {
        const style = getComputedStyle(button);
        const bounds = button.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden'
          && bounds.width > 0 && bounds.height > 0;
      })
      .map(button => button.getBoundingClientRect());
    return {
      sourcePlaceCount: tourismFlow.snapshot.places.length,
      renderSourceCount: tourismFlow._renderSourceCount,
      densityCellCount: cells.length,
      cellMeters: cells[0]?._tourismVisual?.cellMeters ?? null,
      placesWithNineAllocations: [...allocationAudit.values()]
        .filter(row => row.count >= 9 && row.count <= 25).length,
      visibleLabelCount: visibleLabels.length,
      visibleLabels,
      duplicateVisibleLabels: visibleLabels.length
        - new Set(visibleLabels.map(label => label.text)).size,
      occupiedScreenBins: new Set(projected.map(point =>
        `${Math.floor(point.x / 12)}:${Math.floor(point.y / 12)}`)).size,
      projectedCellCount: projected.length,
      medianNearestNeighborPx: nearest[Math.floor(nearest.length / 2)]
        ?? Number.POSITIVE_INFINITY,
      minHeight: Math.min(...heights),
      maxHeight: Math.max(...heights),
      minVeryCrowdedHeight: Math.min(...(bandHeights['very-crowded'] || [Infinity])),
      maxCrowdedHeight: Math.max(...(bandHeights.crowded || [-Infinity])),
      sourceWeightErrors,
      allocationSourceTypes: [...new Set(allocationRows.map(row => row.sourceType))],
      nonBoxGraphics: graphics.filter(item => !item.box || item.polyline || item.corridor || item.wall),
      cameraHeight: viewer.camera.positionCartographic.height,
      cameraPitchDegrees: Cesium.Math.toDegrees(viewer.camera.pitch),
      overflow: document.documentElement.scrollWidth - innerWidth,
      sourceText: sourceToggle?.innerText?.replace(/\s+/g, ' ').trim() || '',
      sourceBackground: sourceStyle?.backgroundColor || null,
      sourceBorder: sourceStyle?.borderTopWidth || null,
      sourceRadius: sourceStyle?.borderRadius || null,
      sourceRect: rect(sourceRect),
      timelineRect: rect(timelineRect),
      visibleTimelineControlCount: visibleTimelineControlRects.length,
      sourceInsideViewport: Boolean(sourceRect
        && sourceRect.left >= 0 && sourceRect.top >= 0
        && sourceRect.right <= innerWidth && sourceRect.bottom <= innerHeight),
      sourceTimelineOverlap: intersects(sourceRect, timelineRect),
      sourceTimelineControlOverlap: visibleTimelineControlRects
        .some(controlRect => intersects(sourceRect, controlRect)),
      counters: { ...window.__tourismDensityE2E },
    };
  });
}

async function moveToLevel(page, level) {
  const before = await page.evaluate(() => ({ ...window.__tourismDensityE2E }));
  await page.evaluate(async next => {
    const { viewer } = await import(new URL('js/viewer.js', location.href).href);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`moveEnd timeout at ${next.name}`)), 8_000);
      let remove = null;
      remove = viewer.camera.moveEnd.addEventListener(() => {
        remove?.();
        clearTimeout(timeout);
        resolve();
      });
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(next.lon, next.lat, next.height),
        orientation: {
          heading: Cesium.Math.toRadians(22),
          pitch: Cesium.Math.toRadians(next.pitch),
          roll: 0,
        },
        duration: 0.35,
      });
    });
  }, level);
  await page.waitForTimeout(500);
  const metrics = await collectView(page);
  metrics.moveRebuildDelta = metrics.counters.rebuildCount - before.rebuildCount;
  metrics.moveRequestRenderDelta = metrics.counters.requestRenderCount - before.requestRenderCount;
  return metrics;
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  for (const viewport of [
    { name: 'desktop', width: 1600, height: 900, minCells: 901, maxCells: 2500, maxNeighbor: 24 },
    { name: 'mobile', width: 390, height: 844, minCells: 401, maxCells: 900, maxNeighbor: 18 },
  ]) {
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    await page.route('**/js/config.local.js', route => route.fulfill({
      status: 200, contentType: 'text/javascript; charset=utf-8', body: localConfig,
    }));
    await page.route('**/tourism/seoul-flow.json*', route => route.fulfill({
      status: 200, contentType: 'application/json; charset=utf-8', body: JSON.stringify(snapshot),
    }));
    await page.route('**/tourism/health.json*', route => route.fulfill({ status: 404, body: '{}' }));
    await page.route('**/tourism/kto/summary.json*', route => route.fulfill({ status: 404, body: '{}' }));
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.__e?.store, null, { timeout: 30_000 });
    await page.locator('#loading').waitFor({ state: 'detached', timeout: 30_000 });
    await page.locator('#menuTab').click();
    await page.locator('#menuMain [data-open="earth"]').click();
    await page.locator('#layerStrip [data-id="tourism"]').first().click();
    await page.waitForFunction(async () => {
      const { tourismFlow } = await import(new URL(
        'js/layers/tourism-flow.js?v=20260821-density-lod1', location.href,
      ).href);
      return tourismFlow.ds?.show && tourismFlow.snapshot?.places?.length === 121
        && tourismFlow.ds.entities.values.length > 0 && tourismFlow._abort === null;
    }, null, { timeout: 30_000 });
    await page.waitForTimeout(1_600);
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('earthus:close-menu')));

    await page.evaluate(async () => {
      const [{ tourismFlow }, { viewer }] = await Promise.all([
        import(new URL('js/layers/tourism-flow.js?v=20260821-density-lod1', location.href).href),
        import(new URL('js/viewer.js', location.href).href),
      ]);
      window.__tourismDensityE2E = { rebuildCount: 0, requestRenderCount: 0 };
      const renderAt = tourismFlow.renderAt.bind(tourismFlow);
      tourismFlow.renderAt = (...args) => {
        window.__tourismDensityE2E.rebuildCount += 1;
        return renderAt(...args);
      };
      const requestRender = viewer.scene.requestRender.bind(viewer.scene);
      viewer.scene.requestRender = (...args) => {
        window.__tourismDensityE2E.requestRenderCount += 1;
        return requestRender(...args);
      };
    });

    const levels = {};
    for (const level of viewLevels) {
      levels[level.name] = await moveToLevel(page, level);
      assert.ok(Math.abs(levels[level.name].cameraHeight - level.height) <= 1,
        `${viewport.name} ${level.name} camera height: ${JSON.stringify(levels[level.name])}`);
      assert.equal(levels[level.name].moveRebuildDelta, 1,
        `${viewport.name} ${level.name} must rebuild once after moveEnd`);
      assert.ok(levels[level.name].densityCellCount > 0,
        `${viewport.name} ${level.name} must retain density cells`);
      assert.deepEqual(levels[level.name].nonBoxGraphics, [],
        `${viewport.name} ${level.name} must not create OD/direction graphics`);
      assert.ok(levels[level.name].visibleLabelCount >= 1
        && levels[level.name].visibleLabelCount <= 12,
      `${viewport.name} ${level.name} visible label budget`);
      assert.equal(levels[level.name].duplicateVisibleLabels, 0,
        `${viewport.name} ${level.name} duplicate labels`);
      assert.equal(levels[level.name].overflow, 0,
        `${viewport.name} ${level.name} horizontal overflow`);
      assert.equal(levels[level.name].sourceInsideViewport, true,
        `${viewport.name} ${level.name} source toggle must stay inside viewport: ${JSON.stringify(levels[level.name])}`);
      assert.ok(levels[level.name].visibleTimelineControlCount > 0,
        `${viewport.name} ${level.name} timeline controls must remain visible`);
      assert.equal(levels[level.name].sourceTimelineOverlap, false,
        `${viewport.name} ${level.name} source toggle must not overlap timeline: ${JSON.stringify(levels[level.name])}`);
      assert.equal(levels[level.name].sourceTimelineControlOverlap, false,
        `${viewport.name} ${level.name} source toggle must not overlap visible timeline controls: ${JSON.stringify(levels[level.name])}`);
      if (level.name === 'overview' || level.name === 'detail') {
        await page.evaluate(at => document.dispatchEvent(new CustomEvent('earthus:tourism-time', {
          detail: { at },
        })), forecastAt);
        await page.waitForTimeout(500);
        const forecastVisual = await collectView(page);
        assert.deepEqual(forecastVisual.allocationSourceTypes, ['OFFICIAL_FORECAST']);
        if (level.name === 'overview') {
          assert.equal(forecastVisual.renderSourceCount, 121, JSON.stringify(forecastVisual));
          assert.ok(Number.isFinite(forecastVisual.minVeryCrowdedHeight),
            `official forecast must visibly exercise red cells: ${JSON.stringify(forecastVisual)}`);
          assert.ok(Number.isFinite(forecastVisual.maxCrowdedHeight),
            `official forecast must visibly exercise orange cells: ${JSON.stringify(forecastVisual)}`);
          assert.ok(forecastVisual.minVeryCrowdedHeight >= forecastVisual.maxCrowdedHeight,
            `red relief must not be lower than orange: ${JSON.stringify(forecastVisual)}`);
        }
        await page.screenshot({
          path: `/private/tmp/earthus-tourism-density-${viewport.name}-${level.name}.png`,
          fullPage: false,
        });
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('earthus:tourism-time', {
          detail: { at: null },
        })));
        await page.waitForTimeout(500);
      }
    }

    const overview = levels.overview;
    assert.equal(overview.sourcePlaceCount, 121, JSON.stringify(overview));
    assert.equal(overview.renderSourceCount, 121, JSON.stringify(overview));
    assert.ok(overview.densityCellCount >= viewport.minCells
      && overview.densityCellCount <= viewport.maxCells, JSON.stringify(overview));
    assert.equal(overview.placesWithNineAllocations, 121, JSON.stringify(overview));
    assert.deepEqual(overview.sourceWeightErrors, [], JSON.stringify(overview));
    assert.ok(overview.minHeight >= 12 && overview.maxHeight <= 180, JSON.stringify(overview));
    assert.ok(overview.occupiedScreenBins >= 363, JSON.stringify(overview));
    assert.ok(overview.medianNearestNeighborPx <= viewport.maxNeighbor, JSON.stringify(overview));
    assert.ok(new Set([levels.overview.cellMeters, levels.district.cellMeters,
      levels.detail.cellMeters]).size >= 2,
    `${viewport.name} camera LOD must change rendered cell resolution`);
    assert.match(overview.sourceText,
      /^출처:\s*서울특별시 실시간 인구데이터 · \d{2}:\d{2} 자료$/);
    assert.equal(overview.sourceBackground, 'rgba(0, 0, 0, 0)');
    assert.equal(overview.sourceBorder, '0px');
    assert.equal(overview.sourceRadius, '0px');

    // 카메라 이동 직후의 유한 power 요청과 imagery tile 조립이 끝난 뒤를 idle로 잰다.
    await page.waitForFunction(async () => {
      const { power } = await import(new URL('js/power.js', location.href).href);
      return !power.animating;
    }, null, { timeout: 10_000 });
    await page.waitForTimeout(5_000);
    const idleBefore = await collectView(page);
    await page.waitForTimeout(5_000);
    const idleAfter = await collectView(page);
    const idle = {
      milliseconds: 5_000,
      entityCountBefore: idleBefore.densityCellCount,
      entityCountAfter: idleAfter.densityCellCount,
      rebuildDelta: idleAfter.counters.rebuildCount - idleBefore.counters.rebuildCount,
      requestRenderDelta: idleAfter.counters.requestRenderCount - idleBefore.counters.requestRenderCount,
    };
    assert.equal(idle.entityCountAfter, idle.entityCountBefore, JSON.stringify(idle));
    assert.equal(idle.rebuildDelta, 0, JSON.stringify(idle));
    assert.equal(idle.requestRenderDelta, 0, JSON.stringify(idle));
    assert.deepEqual(runtimeErrors, []);

    console.log(`${viewport.name}: ${JSON.stringify({
      overview, district: levels.district, detail: levels.detail, idle, runtimeErrors,
    })}`);
    await context.close();
  }
} finally {
  await browser.close();
}
