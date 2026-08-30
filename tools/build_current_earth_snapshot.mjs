#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateImsPng } from '../aws/current-earth-snow-ice/png-contract.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'prototype/v2/data/current-earth');
const service = 'https://mapservices.weather.noaa.gov/raster/rest/services/obs/usnic_ims_snow_ice_1km/ImageServer';
const rasterFunction = 'rft_usnic_ims_1km';
const headers = { 'User-Agent': 'earthus-v2/2.0 (+provider-cache)' };

async function json(url) {
  const response = await fetch(url, { cache: 'no-store', headers });
  if (!response.ok) throw new Error(`IMS_SOURCE_${response.status}:${url}`);
  return response.json();
}

const metadata = await json(`${service}?f=json`);
const functions = (metadata?.rasterFunctionInfos || []).map(item => item?.name);
if (!String(metadata?.name || '').includes('usnic_ims_snow_ice_1km')) {
  throw new Error('IMS_METADATA_IDENTITY_MISMATCH');
}
if (!functions.includes(rasterFunction)) throw new Error('IMS_RASTER_FUNCTION_UNAVAILABLE');

const query = new URLSearchParams({
  where: '1=1', outFields: 'idp_filedate,idp_ingestdate,idp_validtime',
  orderByFields: 'idp_filedate DESC', resultRecordCount: '1',
  returnGeometry: 'false', f: 'json',
});
const latest = await json(`${service}/query?${query}`);
const attrs = latest?.features?.[0]?.attributes || {};
const epoch = [attrs.idp_validtime, attrs.idp_filedate, attrs.idp_ingestdate]
  .map(Number).find(Number.isFinite);
const validAt = epoch == null ? null : new Date(epoch).toISOString();

const exportParams = new URLSearchParams({
  bbox: '-180,0,180,90', bboxSR: '4326', imageSR: '4326', size: '2048,1024',
  format: 'png32', transparent: 'true', interpolation: 'RSP_NearestNeighbor',
  renderingRule: JSON.stringify({ rasterFunction }), f: 'image',
});
const imageResponse = await fetch(`${service}/exportImage?${exportParams}`, {
  cache: 'no-store', headers,
});
if (!imageResponse.ok) throw new Error(`IMS_EXPORT_${imageResponse.status}`);
const bytes = Buffer.from(await imageResponse.arrayBuffer());
const image = validateImsPng(bytes);
const retrievedAt = new Date().toISOString();
const sha256 = createHash('sha256').update(bytes).digest('hex');
const receipt = Object.freeze({
  schemaVersion: 'earthus.provider-receipt.v1',
  source: 'NOAA_USNIC_IMS_1KM',
  provider: 'NOAA / U.S. National Ice Center',
  product: 'Interactive Multisensor Snow and Ice Mapping System (IMS) 1 km',
  truthState: 'OBSERVED', semanticMeaning: 'SNOW_ICE_EXTENT_NOT_DEPTH',
  spatialCoverage: 'NORTHERN_HEMISPHERE_0_TO_90N', nominalResolutionM: 1000,
  updateCadence: 'DAILY_00UTC_SERVICE', validAt, retrievedAt,
  sourceUrl: service, rasterFunction, sha256, bytes: image.bytes,
  dimensions: { width: image.width, height: image.height },
  rights: {
    credit: 'National Oceanic & Atmospheric Administration, U.S. National Ice Center, National Weather Service',
    sourcePublic: true,
  },
  caveat: 'Context layer only; not snow depth/SWE and not an emergency decision surface.',
});
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'snow-ice.png'), bytes);
await fs.writeFile(path.join(output, 'snow-ice.meta.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: 'CURRENT_EARTH_SNAPSHOT_BUILT', validAt, retrievedAt, sha256, bytes: image.bytes }, null, 2));
