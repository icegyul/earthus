import { clamp } from '../core/math.js';

export function bathymetryLevelPolicy({ level, deviceClass = 'desktop', thermalState = 'NORMAL', sourceResolutionM }) {
  if (![1, 2, 3].includes(level)) throw new RangeError('bathymetry level must be 1, 2 or 3');
  if (!Number.isFinite(sourceResolutionM) || sourceResolutionM <= 0) throw new RangeError('sourceResolutionM must be positive');
  if (level === 3 && (deviceClass === 'mobile' || ['ECO', 'SAFE'].includes(thermalState))) {
    return Object.freeze({ allowed: false, reason: 'UNDERWATER_LEVEL3_DEVICE_OR_THERMAL_GATE' });
  }
  const targetResolutionM = level === 1 ? Math.max(500, sourceResolutionM) : level === 2 ? Math.max(50, sourceResolutionM) : Math.max(5, sourceResolutionM);
  return Object.freeze({
    allowed: true,
    level,
    targetResolutionM,
    seaSurfaceOpacity: level === 1 ? 0.18 : level === 2 ? 0.08 : 0.02,
    underwaterCamera: level >= 3,
    clippingEnabled: true,
    negativeElevationRequired: true,
  });
}

export function depthVisualScale(depthM, { shallowLimitM = 200, trenchLimitM = 11000 } = {}) {
  if (!Number.isFinite(depthM) || depthM > 0) throw new RangeError('depthM must be a non-positive elevation');
  const depth = Math.abs(depthM);
  if (depth <= shallowLimitM) return depth / shallowLimitM * 0.25;
  return clamp(0.25 + 0.75 * Math.log1p(depth - shallowLimitM) / Math.log1p(trenchLimitM - shallowLimitM), 0, 1);
}
