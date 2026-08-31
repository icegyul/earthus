import { clamp } from '../../v02/core/math.js';

export function buildTrenchCameraLevel2({ target, viewport = { width: 1280, height: 720 }, clearanceM = 1200, reducedMotion = false }) {
  if (!target || !Number.isFinite(target.lon) || !Number.isFinite(target.lat) || !Number.isFinite(target.depthM)) throw new TypeError('target lon/lat/depthM are required');
  if (target.depthM >= 0) throw new RangeError('trench target depthM must be below sea level');
  const aspect = Math.max(0.5, Math.min(3, (viewport.width || 1) / (viewport.height || 1)));
  const depth = Math.abs(target.depthM);
  const overviewHeightM = Math.max(25000, depth * (4.2 / aspect));
  const closeHeightM = Math.max(3500, depth * 1.4 + clearanceM);
  const pitchRad = -clamp(0.72 + depth / 50000, 0.72, 1.15);
  return Object.freeze({
    level: 2,
    cameraSubmerged: false,
    seaSurfaceMode: 'SUPPRESSED_OR_TRANSLUCENT',
    target: Object.freeze({ lon: target.lon, lat: target.lat, heightM: target.depthM }),
    waypoints: Object.freeze([
      Object.freeze({ stage: 'REGIONAL_APPROACH', lon: target.lon, lat: target.lat, heightM: overviewHeightM, pitchRad: -0.95 }),
      Object.freeze({ stage: 'BATHYMETRY_REVEAL', lon: target.lon, lat: target.lat, heightM: closeHeightM, pitchRad }),
    ]),
    durationSeconds: reducedMotion ? 0 : 1.6,
    labels: Object.freeze({ depthRequired: true, bathymetrySourceRequired: true }),
    prohibited: Object.freeze(['FULL_UNDERWATER_NAVIGATION', 'INVENTED_SEAFLOOR', 'UNVERIFIED_SUBDUCTION_GEOMETRY']),
  });
}
