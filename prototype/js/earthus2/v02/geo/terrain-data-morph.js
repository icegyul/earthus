import { clamp, lerp } from '../core/math.js';

export function morphTerrainValue({ terrainElevationM, normalizedData, mix, reliefScaleM, maxVisualElevationM = 20000 }) {
  if (![terrainElevationM, normalizedData, mix, reliefScaleM, maxVisualElevationM].every(Number.isFinite)) throw new TypeError('terrain morph inputs must be finite');
  const dataElevation = terrainElevationM + clamp(normalizedData, 0, 1) * Math.max(0, reliefScaleM);
  return clamp(lerp(terrainElevationM, dataElevation, clamp(mix, 0, 1)), -12000, maxVisualElevationM);
}

export function morphAnimationPlan({ fromMix = 0, toMix = 1, durationSec = 1.1, reducedMotion = false }) {
  if (![fromMix, toMix, durationSec].every(Number.isFinite) || durationSec <= 0) throw new RangeError('invalid morph animation settings');
  return Object.freeze({ fromMix: clamp(fromMix, 0, 1), toMix: clamp(toMix, 0, 1), durationSec: reducedMotion ? 0.01 : durationSec, easing: reducedMotion ? 'LINEAR' : 'CUBIC_OUT', recreateGeometry: false });
}
