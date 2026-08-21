// AETHERUS major-body ephemeris cache builder.
//
// JPL Horizons는 브라우저에 직접 embed하지 않는다. API fair-use/CORS 정책을 지키기 위해
// 이 Lambda가 major-body state vector를 순차 요청하고, 검증이 모두 끝난 한 묶음만 S3에 쓴다.
// 중간 body 하나라도 실패하면 기존 last-good object를 덮지 않는다.
//
// Horizons contract:
//   EPHEM_TYPE=VECTORS, CENTER=@0 (Solar System Barycenter), REF_PLANE=FRAME,
//   REF_SYSTEM=ICRF, OUT_UNITS=AU-D, VEC_TABLE=2, VEC_CORR=NONE, TIME_TYPE=UT.
// Source: https://ssd-api.jpl.nasa.gov/doc/horizons.html

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { gzipSync } from 'node:zlib';
import {
  assertAlignedBodies,
  buildHorizonsUrl,
  floorToStep,
  parseHorizonsVectorResult,
} from './horizons-parser.mjs';

const BUCKET = process.env.CACHE_BUCKET;
const REGION = process.env.CACHE_REGION || process.env.AWS_REGION;
const KEY = process.env.EPHEMERIS_KEY || 'aetherus/ephemeris-major.json.gz';
const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const PAST_DAYS = Number(process.env.EPHEMERIS_PAST_DAYS || 370);
const FUTURE_DAYS = Number(process.env.EPHEMERIS_FUTURE_DAYS || 35);
const STEP_HOURS = Number(process.env.EPHEMERIS_STEP_HOURS || 6);
const REQUEST_TIMEOUT_MS = Number(process.env.HORIZONS_TIMEOUT_MS || 30_000);
const REQUEST_GAP_MS = Number(process.env.HORIZONS_REQUEST_GAP_MS || 350);
const DAY_MS = 86_400_000;

const BODIES = Object.freeze({
  sun: '10',
  mercury: '199',
  venus: '299',
  earth: '399',
  mars: '499',
  jupiter: '599',
  saturn: '699',
  uranus: '799',
  neptune: '899',
});

const s3 = new S3Client({ region: REGION });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function assertEnvironment() {
  if (!BUCKET) throw new Error('CACHE_BUCKET_REQUIRED');
  if (!Number.isFinite(PAST_DAYS) || PAST_DAYS < 2) throw new Error('EPHEMERIS_PAST_DAYS_INVALID');
  if (!Number.isFinite(FUTURE_DAYS) || FUTURE_DAYS < 1) throw new Error('EPHEMERIS_FUTURE_DAYS_INVALID');
  if (!Number.isFinite(STEP_HOURS) || STEP_HOURS < 1 || STEP_HOURS > 24) throw new Error('EPHEMERIS_STEP_HOURS_INVALID');
}

export { assertAlignedBodies };

async function fetchHorizonsBody(body, command, start, stop) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(buildHorizonsUrl(command, start, stop, {
      endpoint: HORIZONS_URL,
      stepHours: STEP_HOURS,
    }), {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'earthus-aetherus-ephemeris/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HORIZONS_HTTP_${response.status}:${body}`);
    const payload = await response.json();
    if (payload.error) throw new Error(`HORIZONS_API_ERROR:${body}:${payload.error}`);
    const samples = parseHorizonsVectorResult(payload.result, body);
    return {
      body,
      command,
      samples,
      apiVersion: payload.signature?.version || payload.version || null,
      apiSource: payload.signature?.source || 'NASA/JPL Horizons API',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function buildCatalog(now = new Date()) {
  assertEnvironment();
  const anchor = floorToStep(now);
  const start = new Date(anchor.getTime() - PAST_DAYS * DAY_MS);
  const stop = new Date(anchor.getTime() + FUTURE_DAYS * DAY_MS);
  const results = [];
  const entries = Object.entries(BODIES);
  for (let index = 0; index < entries.length; index += 1) {
    const [body, command] = entries[index];
    results.push(await fetchHorizonsBody(body, command, start, stop));
    if (index < entries.length - 1) await sleep(REQUEST_GAP_MS);
  }
  assertAlignedBodies(results);

  const firstSamples = results[0].samples;
  const coverageStart = new Date(firstSamples[0][0]).toISOString();
  const coverageEnd = new Date(firstSamples[firstSamples.length - 1][0]).toISOString();
  const apiVersions = [...new Set(results.map(result => result.apiVersion).filter(Boolean))];

  return {
    schema: 'earthus.aetherus-ephemeris.v1',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    frame: {
      origin: 'solar-system-barycenter',
      orientation: 'icrf-j2000',
      positionUnit: 'AU',
      velocityUnit: 'AU/day',
      vectorCorrection: 'NONE',
      timeType: 'UT',
    },
    coverage: {
      startAt: coverageStart,
      endAt: coverageEnd,
      stepHours: STEP_HOURS,
      sampleCountPerBody: firstSamples.length,
    },
    source: {
      name: 'NASA/JPL Horizons API',
      url: 'https://ssd-api.jpl.nasa.gov/doc/horizons.html',
      endpoint: HORIZONS_URL,
      apiVersion: apiVersions.length === 1 ? apiVersions[0] : apiVersions,
      fairUse: 'sequential-major-body-requests-server-side-cache',
      queryContract: {
        ephemerisType: 'VECTORS',
        center: '@0',
        referencePlane: 'FRAME',
        referenceSystem: 'ICRF',
        outputUnits: 'AU-D',
        vectorTable: 2,
        vectorCorrection: 'NONE',
        timeType: 'UT',
      },
    },
    bodies: Object.fromEntries(results.map(result => [result.body, {
      command: result.command,
      samples: result.samples,
    }])),
  };
}

async function writeCatalog(catalog) {
  const raw = Buffer.from(`${JSON.stringify(catalog)}\n`, 'utf8');
  const gz = gzipSync(raw, { level: 9 });
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
    Body: gz,
    ContentType: 'application/json; charset=utf-8',
    ContentEncoding: 'gzip',
    CacheControl: 'public, max-age=3600, stale-if-error=86400',
    Metadata: {
      schema: 'earthus.aetherus-ephemeris.v1',
      generatedat: catalog.generatedAt,
      source: 'jpl-horizons',
    },
  }));
  return { rawBytes: raw.length, gzipBytes: gz.length };
}

export const handler = async () => {
  try {
    const catalog = await buildCatalog(new Date());
    const bytes = await writeCatalog(catalog);
    return {
      ok: true,
      key: KEY,
      generatedAt: catalog.generatedAt,
      coverage: catalog.coverage,
      bodies: Object.keys(catalog.bodies).length,
      ...bytes,
    };
  } catch (error) {
    console.error('[aetherus-ephemeris]', error);
    // last-good S3 object는 그대로 남는다. 부분 결과로 덮어쓰지 않는다.
    throw error;
  }
};
