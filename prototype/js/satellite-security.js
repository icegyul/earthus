/* 위성 raster 입력 경계. 전체 URL이나 query는 telemetry에 남기지 않는다. */

const ALLOWED_HOSTS = new Set([
  'earthus.net',
  'earthus-cache-kr.s3.us-east-2.amazonaws.com',
  'gibs.earthdata.nasa.gov',
  'realearth.ssec.wisc.edu',
]);

export const RASTER_LIMITS = Object.freeze({
  maxDimension: 8192,
  maxDecodedBytes: 128 * 1024 * 1024,
  maxWorkerTasks: 2,
});

export function assertSatelliteProviderUrl(raw) {
  if (!raw) return true; // Cesium provider가 URL을 공개하지 않는 경우는 adapter 계약이 책임진다.
  const value = String(raw);
  if (value.startsWith('blob:') || value.startsWith('data:image/')) return true;
  const url = new URL(value, location.href);
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new TypeError('SATELLITE_PROVIDER_NOT_ALLOWED');
  }
  return true;
}
export function assertRasterDimensions(width, height) {
  const decoded = Number(width) * Number(height) * 4;
  if (!Number.isFinite(decoded) || width < 1 || height < 1
      || width > RASTER_LIMITS.maxDimension || height > RASTER_LIMITS.maxDimension
      || decoded > RASTER_LIMITS.maxDecodedBytes) {
    throw new RangeError('SATELLITE_RASTER_LIMIT_EXCEEDED');
  }
  return decoded;
}
