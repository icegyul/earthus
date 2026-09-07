import { clamp } from '../core/math.js';
import { geometryApproxDiameterM, geometryBounds, geometryCentroid } from './geospatial-reference.js';

export function buildCountryFocus({ countryId, geometry, viewport = { width: 1280, height: 720 }, padding = 0.12, scene = 'LAND' }) {
  if (typeof countryId !== 'string' || !countryId.trim()) throw new TypeError('countryId is required');
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError('viewport dimensions must be positive');
  }
  const bounds = geometryBounds(geometry);
  const centroid = geometryCentroid(geometry);
  const diameterM = geometryApproxDiameterM(geometry);
  const aspect = viewport.width / viewport.height;
  const cameraHeightM = clamp(diameterM * (aspect < 1 ? 1.35 : 0.95) * (1 + padding), 250000, 18000000);
  const sceneDimming = scene === 'OCEAN'
    ? { outsideBrightness: 0.18, outsideSaturation: 0.12, selectedBrightness: 0.45 }
    : { outsideBrightness: 0.28, outsideSaturation: 0.22, selectedBrightness: 1.0 };
  return Object.freeze({
    focusType: 'COUNTRY',
    countryId,
    geometry: structuredClone(geometry),
    bounds,
    centroid,
    camera: Object.freeze({ longitude: centroid.lon, latitude: centroid.lat, heightM: cameraHeightM, headingDeg: 0, pitchDeg: -58, durationSec: 1.05 }),
    dimming: Object.freeze(sceneDimming),
    clipping: Object.freeze({ mode: 'GEOMETRY_FILTER', preserveCoastlineContext: true, requestOnlyIntersectingTiles: true }),
    crossesAntimeridian: bounds.crossesAntimeridian,
  });
}

export function countryFocusReadiness({ geometryReady, terrainReady, sourceReady, licenseReady, visualReady, performanceReady }) {
  const gates = Object.freeze({ geometryReady, terrainReady, sourceReady, licenseReady, visualReady, performanceReady });
  const failed = Object.entries(gates).filter(([, value]) => value !== true).map(([name]) => name);
  return Object.freeze({ ready: failed.length === 0, failed: Object.freeze(failed), gates });
}
