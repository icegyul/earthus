import { createHash } from 'node:crypto';
import { buildEarthVersion } from './lib/earth-version-diff.mjs';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return createHash('sha256').update(stable(value)).digest('hex');
}

function iso(value, code) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new Error(code);
  return new Date(time).toISOString();
}

function normalizeStorm(storm) {
  const agencies = Array.isArray(storm?.agencies) ? storm.agencies : [];
  const officialAgencies = [...new Set(agencies.map(item => item?.agency).filter(Boolean))].sort();
  const revisions = agencies.map(agency => ({
    agency: agency.agency,
    issuedAt: iso(agency.issue, 'TYPHOON_ISSUE_TIME_INVALID'),
    horizonHours: Number.isFinite(Number(agency.horizonH)) ? Number(agency.horizonH) : null,
    steps: (agency.steps || []).map(step => ({
      horizonHours: Number(step.h),
      validAt: iso(step.validKst || step.validUtc, 'TYPHOON_VALID_TIME_INVALID'),
      latitude: Number(step.lat), longitude: Number(step.lon),
      windMs: Number.isFinite(Number(step.windMs)) ? Number(step.windMs) : null,
      category: step.category || null,
    })),
  }));
  return Object.freeze({
    eventId: `typhoon:${storm.key}`,
    name: storm.name,
    truthState: 'OFFICIAL_FORECAST',
    officialAgencies: Object.freeze(officialAgencies),
    firstIssuedBy: storm.firstIssuedBy || null,
    firstIssuedAt: iso(storm.firstIssuedAt, 'TYPHOON_FIRST_ISSUE_TIME_INVALID'),
    revisions: Object.freeze(revisions),
  });
}

export async function materializeWeatherTyphoon({
  kmaAws, fxEa, typhoonOfficial, service, parentVersion = null,
} = {}) {
  if (!service) throw new Error('MATERIALIZED_SERVICE_REQUIRED');
  const observedAt = iso(kmaAws?.generated, 'KMA_AWS_TIME_INVALID');
  const forecastAt = iso(fxEa?.time, 'FX_EA_TIME_INVALID');
  const eventGeneratedAt = iso(typhoonOfficial?.generated, 'TYPHOON_GENERATED_TIME_INVALID');
  if (!Array.isArray(kmaAws?.stations)) throw new Error('KMA_AWS_STATIONS_REQUIRED');
  if (!Array.isArray(fxEa?.steps)) throw new Error('FX_EA_STEPS_REQUIRED');
  if (!Array.isArray(typhoonOfficial?.storms)) throw new Error('TYPHOON_STORMS_REQUIRED');

  const weatherRevision = fingerprint({
    observedAt, forecastAt,
    stationIds: kmaAws.stations.map(station => station.id).sort(),
    forecastShape: [fxEa.nx, fxEa.ny, fxEa.steps.length],
  });
  const events = Object.freeze(typhoonOfficial.storms.map(normalizeStorm));
  const eventRevision = fingerprint({ eventGeneratedAt, events });

  const regionSnapshot = await service.publish({
    productType: 'REGION_SNAPSHOT', spatialScope: 'COUNTRY', spatialKey: 'KR',
    targetTime: observedAt, schemaVersion: 'earthus.materialized.v5.2',
    policyVersion: '5.2.0', modelVersion: 'earthus-weather-cache-v1',
    dataRevision: weatherRevision,
    dependencies: [
      `provider:KMA:observation:KR:${observedAt}`,
      `model:GFS_ECMWF:forecast:EA:${forecastAt}`,
    ],
    shareScope: 'PUBLIC', truthState: 'OBSERVED',
    sourceRefs: ['KMA_API_HUB_AWS', 'OPEN_METEO_GFS_ECMWF'],
    confidenceClass: 'SOURCE_REPORTED',
    payload: {
      observation: {
        truthState: 'OBSERVED', source: kmaAws.source, observedAt,
        stationCount: kmaAws.stations.length,
        positionedStationCount: Number(kmaAws.withPosition || kmaAws.stations.length),
      },
      forecast: {
        truthState: 'MODEL_SIGNAL', source: fxEa.source, validAt: forecastAt,
        grid: { nx: Number(fxEa.nx), ny: Number(fxEa.ny), steps: fxEa.steps.length },
        units: fxEa.unit || {},
      },
    },
  });

  const eventCapsule = await service.publish({
    productType: 'EVENT_CAPSULE_SUMMARY', spatialScope: 'GLOBAL', spatialKey: 'TYPHOON',
    targetTime: eventGeneratedAt, schemaVersion: 'earthus.materialized.v5.2',
    policyVersion: '5.2.0', modelVersion: 'official-agency-cache-v1',
    dataRevision: eventRevision,
    dependencies: [`provider:OFFICIAL_TYPHOON:GLOBAL:${eventGeneratedAt}`],
    shareScope: 'PUBLIC', truthState: 'OFFICIAL_FORECAST',
    sourceRefs: ['KMA', 'JMA', 'NHC'], confidenceClass: 'AGENCY_REPORTED',
    payload: { generatedAt: eventGeneratedAt, source: typhoonOfficial.source, events },
  });

  const globalDigest = await service.publish({
    productType: 'GLOBAL_DIGEST', spatialScope: 'GLOBAL', spatialKey: 'GLOBAL',
    targetTime: [observedAt, eventGeneratedAt].sort().at(-1),
    schemaVersion: 'earthus.materialized.v5.2', policyVersion: '5.2.0',
    modelVersion: 'earthus-digest-v1',
    dataRevision: fingerprint({ weatherRevision, eventRevision }),
    dependencies: [
      `artifact:${regionSnapshot.artifactId}`,
      `artifact:${eventCapsule.artifactId}`,
    ],
    shareScope: 'PUBLIC', truthState: 'DERIVED',
    sourceRefs: ['KMA_API_HUB_AWS', 'OPEN_METEO_GFS_ECMWF', 'KMA', 'JMA', 'NHC'],
    confidenceClass: 'EVIDENCE_BOUND_SUMMARY',
    payload: {
      activeEventCount: events.length,
      changedRegionCount: 1,
      primaryEventIds: events.slice(0, 8).map(event => event.eventId),
      weatherArtifactRef: regionSnapshot.artifactId,
      eventArtifactRef: eventCapsule.artifactId,
      freshness: { observedAt, forecastAt, eventGeneratedAt },
    },
  });

  const earthVersion = buildEarthVersion({
    parentVersion,
    createdAt: [observedAt, eventGeneratedAt].sort().at(-1),
    artifacts: {
      'KR/weather': regionSnapshot.contentHash,
      'GLOBAL/typhoon-events': eventCapsule.contentHash,
      'GLOBAL/digest': globalDigest.contentHash,
    },
  });
  return Object.freeze({
    regionSnapshot, eventCapsule, globalDigest, earthVersion,
    publicCurrent: Object.freeze([globalDigest, regionSnapshot, eventCapsule]),
  });
}
