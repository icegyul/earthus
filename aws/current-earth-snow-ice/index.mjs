// EARTHUS V2 — NOAA/USNIC IMS Current Earth snow/ice cache adapter.
//
// Provider is fetched server-side because the ArcGIS exportImage response does not
// expose browser CORS headers. The public app reads only versioned/cacheable Earthus
// objects from S3/CloudFront. No user request is sent directly to NOAA.
//
// Output (default):
//   s3://$CACHE_BUCKET/app/v2/data/current-earth/snow-ice.png
//   s3://$CACHE_BUCKET/app/v2/data/current-earth/snow-ice.meta.json
//
// Truth: OBSERVED snow/ice EXTENT only. This is not snow depth/SWE and is not an
// emergency decision surface.

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { validateImsPng } from './png-contract.mjs';

const SERVICE = 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/usnic_ims_snow_ice_1km/ImageServer';
const RASTER_FUNCTION = 'rft_usnic_ims_1km';
const BUCKET = process.env.CACHE_BUCKET;
const REGION = process.env.CACHE_REGION || process.env.AWS_REGION;
const PREFIX = (process.env.PUBLIC_PREFIX || 'app/v2/data/current-earth').replace(/^\/+|\/+$/g, '');
const USER_AGENT = process.env.EARTHUS_USER_AGENT || 'earthus-v2/2.0 (+provider-cache)';
const s3 = new S3Client({ region: REGION });

function exportUrl() {
  const params = new URLSearchParams({
    bbox: '-180,0,180,90',
    bboxSR: '4326',
    imageSR: '4326',
    size: '2048,1024',
    format: 'png32',
    transparent: 'true',
    interpolation: 'RSP_NearestNeighbor',
    renderingRule: JSON.stringify({ rasterFunction: RASTER_FUNCTION }),
    f: 'image',
  });
  return `${SERVICE}/exportImage?${params}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

async function latestValidAt() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: 'idp_filedate,idp_ingestdate,idp_validtime',
    orderByFields: 'idp_filedate DESC',
    resultRecordCount: '1',
    returnGeometry: 'false',
    f: 'json',
  });
  try {
    const json = await fetchJson(`${SERVICE}/query?${params}`);
    const attrs = json?.features?.[0]?.attributes || {};
    const epoch = [attrs.idp_validtime, attrs.idp_filedate, attrs.idp_ingestdate]
      .map(Number).find(Number.isFinite);
    return epoch == null ? null : new Date(epoch).toISOString();
  } catch (error) {
    console.warn('[current-earth/valid-at]', error?.message || error);
    return null;
  }
}

export async function fetchImsSnapshot() {
  const metadata = await fetchJson(`${SERVICE}?f=json`);
  const names = Array.isArray(metadata?.rasterFunctionInfos)
    ? metadata.rasterFunctionInfos.map(item => item?.name).filter(Boolean)
    : [];
  if (!String(metadata?.name || '').includes('usnic_ims_snow_ice_1km')) {
    throw new Error('IMS_METADATA_IDENTITY_MISMATCH');
  }
  if (!names.includes(RASTER_FUNCTION)) throw new Error('IMS_RASTER_FUNCTION_UNAVAILABLE');

  const validAt = await latestValidAt();
  const url = exportUrl();
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, cache: 'no-store' });
  if (!response.ok) throw new Error(`IMS_EXPORT_${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  validateImsPng(bytes);

  const retrievedAt = new Date().toISOString();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const receipt = Object.freeze({
    schemaVersion: 'earthus.provider-receipt.v1',
    source: 'NOAA_USNIC_IMS_1KM',
    provider: 'NOAA / U.S. National Ice Center',
    product: 'Interactive Multisensor Snow and Ice Mapping System (IMS) 1 km',
    truthState: 'OBSERVED',
    semanticMeaning: 'SNOW_ICE_EXTENT_NOT_DEPTH',
    spatialCoverage: 'NORTHERN_HEMISPHERE_0_TO_90N',
    nominalResolutionM: 1000,
    updateCadence: 'DAILY_00UTC_SERVICE',
    validAt,
    retrievedAt,
    sourceUrl: SERVICE,
    rasterFunction: RASTER_FUNCTION,
    sha256,
    bytes: bytes.length,
    rights: {
      credit: 'National Oceanic & Atmospheric Administration, U.S. National Ice Center, National Weather Service',
      sourcePublic: true,
    },
    caveat: 'Context layer only; not snow depth/SWE and not an emergency decision surface.',
  });
  return { bytes, receipt };
}

export async function publishSnapshot(snapshot) {
  if (!BUCKET) throw new Error('CACHE_BUCKET_REQUIRED');
  const imageKey = `${PREFIX}/snow-ice.png`;
  const metaKey = `${PREFIX}/snow-ice.meta.json`;
  await Promise.all([
    s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: imageKey,
      Body: snapshot.bytes,
      ContentType: 'image/png',
      CacheControl: 'public, max-age=1800, stale-while-revalidate=21600',
      Metadata: {
        'earthus-truth': 'observed',
        'earthus-provider': 'noaa-usnic-ims-1km',
        'earthus-sha256': snapshot.receipt.sha256,
      },
    })),
    s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: metaKey,
      Body: Buffer.from(JSON.stringify(snapshot.receipt, null, 2), 'utf8'),
      ContentType: 'application/json; charset=utf-8',
      CacheControl: 'public, max-age=300, stale-while-revalidate=3600',
    })),
  ]);
  return { imageKey, metaKey };
}

export const handler = async event => {
  try {
    const snapshot = await fetchImsSnapshot();
    const published = await publishSnapshot(snapshot);
    return {
      ok: true,
      source: snapshot.receipt.source,
      truthState: snapshot.receipt.truthState,
      validAt: snapshot.receipt.validAt,
      retrievedAt: snapshot.receipt.retrievedAt,
      sha256: snapshot.receipt.sha256,
      bytes: snapshot.receipt.bytes,
      ...published,
      eventSource: event?.source || null,
    };
  } catch (error) {
    console.error('[current-earth-snow-ice]', error);
    throw error;
  }
};
