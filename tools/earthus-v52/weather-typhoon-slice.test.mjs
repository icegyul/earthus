import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MaterializedEarthService,
  MemoryMaterializedStore,
} from '../../aws/materialized-earth/lib/materialized-earth-service.mjs';
import { materializeWeatherTyphoon } from '../../aws/materialized-earth/weather-typhoon.mjs';
import { diffEarthVersions } from '../../aws/materialized-earth/lib/earth-version-diff.mjs';

const kmaAws = {
  generated: '2026-08-30T13:25:00Z', observedKst: '2026-08-30T22:25:00+09:00',
  source: '기상청 지상관측 (API허브)', count: 2, withPosition: 2,
  stations: [
    { id: '90', name: '속초', lat: 38.2508, lon: 128.5647, temp_c: 24.4, humid_pct: 91, wind_ms: 0.7, rain_mm: null },
    { id: '108', name: '서울', lat: 37.5714, lon: 126.9658, temp_c: 27.1, humid_pct: 70, wind_ms: 1.8, rain_mm: 0 },
  ],
};

const fxEa = {
  time: '2026-08-30T15:00:00Z', source: 'Open-Meteo (GFS·ECMWF 모델 예보)',
  unit: { mslp: 'hPa', uv: 'm/s' }, nx: 51, ny: 31,
  steps: [{ h: 0, t: '2026-08-30T15:00:00Z', min: 999, max: 1020, mslp: [], u: [], v: [] }],
};

const typhoonOfficial = {
  generated: '2026-08-30T14:25:00Z', source: '기상청(KMA) · 일본 기상청(JMA) · 미국 NHC', count: 1,
  storms: [{
    key: 'ETAU', name: 'Etau', firstIssuedBy: 'JMA', firstIssuedAt: '2026-08-30T22:10:00+09:00',
    agencies: [{ agency: 'JMA', issue: '2026-08-30T22:10:00+09:00', horizonH: 48, steps: [
      { h: 0, validKst: '2026-08-30T21:00:00+09:00', lat: 31.1, lon: 166, windMs: 18, category: 'TS' },
      { h: 48, validKst: '2026-09-01T21:00:00+09:00', lat: 45.2, lon: 172.1, windMs: 23, category: 'LOW' },
    ] }],
  }],
};

test('real-cache shaped Weather/Typhoon inputs produce evidence-bearing materialized products', async () => {
  const store = new MemoryMaterializedStore();
  const service = new MaterializedEarthService({ store, now: () => '2026-08-31T00:00:00.000Z' });
  const result = await materializeWeatherTyphoon({ kmaAws, fxEa, typhoonOfficial, service });
  assert.equal(result.regionSnapshot.truthState, 'OBSERVED');
  assert.equal(result.regionSnapshot.payload.observation.stationCount, 2);
  assert.equal(result.regionSnapshot.payload.forecast.truthState, 'MODEL_SIGNAL');
  assert.equal(result.eventCapsule.payload.events[0].eventId, 'typhoon:ETAU');
  assert.equal(result.eventCapsule.payload.events[0].officialAgencies[0], 'JMA');
  assert.equal(result.globalDigest.payload.activeEventCount, 1);
  assert.ok(result.earthVersion.earthVersion.startsWith('ev_'));
  assert.equal(store.artifacts.size, 3);
  assert.ok(result.publicCurrent.every(item => item.shareScope === 'PUBLIC'));
});

test('typhoon-only revision changes only the event and digest leaves', async () => {
  const beforeStore = new MemoryMaterializedStore();
  const before = await materializeWeatherTyphoon({
    kmaAws, fxEa, typhoonOfficial,
    service: new MaterializedEarthService({ store: beforeStore, now: () => '2026-08-31T00:00:00.000Z' }),
  });
  const changedTyphoon = {
    ...typhoonOfficial,
    generated: '2026-08-30T15:25:00Z',
    storms: typhoonOfficial.storms.map(storm => ({
      ...storm,
      agencies: storm.agencies.map(agency => ({ ...agency, issue: '2026-08-30T23:10:00+09:00' })),
    })),
  };
  const afterStore = new MemoryMaterializedStore();
  const after = await materializeWeatherTyphoon({
    kmaAws, fxEa, typhoonOfficial: changedTyphoon,
    service: new MaterializedEarthService({ store: afterStore, now: () => '2026-08-31T01:00:00.000Z' }),
    parentVersion: before.earthVersion.earthVersion,
  });
  const diff = diffEarthVersions(before.earthVersion, after.earthVersion);
  assert.deepEqual(diff.changes.map(change => change.key), [
    'GLOBAL/digest', 'GLOBAL/typhoon-events',
  ]);
});

test('malformed source time fails closed', async () => {
  const service = new MaterializedEarthService({ store: new MemoryMaterializedStore() });
  await assert.rejects(() => materializeWeatherTyphoon({
    kmaAws: { ...kmaAws, generated: 'not-a-time' }, fxEa, typhoonOfficial, service,
  }), /KMA_AWS_TIME_INVALID/);
});

test('NHC UTC step time is normalized without pretending it is KST', async () => {
  const nhc = {
    ...typhoonOfficial,
    storms: [{
      key: 'KARINA', name: 'Karina', firstIssuedBy: 'NHC',
      firstIssuedAt: '2026-08-30T09:00:00.000Z',
      agencies: [{ agency: 'NHC', issue: '2026-08-30T09:00:00.000Z', horizonH: 0, steps: [{
        h: 0, validUtc: '2026-08-30T09:00:00.000Z', lat: 17.3, lon: -121.1,
        windMs: 36, category: 'HU',
      }] }],
    }],
  };
  const result = await materializeWeatherTyphoon({
    kmaAws, fxEa, typhoonOfficial: nhc,
    service: new MaterializedEarthService({ store: new MemoryMaterializedStore() }),
  });
  assert.equal(
    result.eventCapsule.payload.events[0].revisions[0].steps[0].validAt,
    '2026-08-30T09:00:00.000Z',
  );
});
