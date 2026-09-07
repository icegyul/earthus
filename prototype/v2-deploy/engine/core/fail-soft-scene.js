import { DATA_STATE, THERMAL_STATE, VISUAL_ENGINE } from './constants.js';

const DYNAMIC = new Set([
  VISUAL_ENGINE.TOWER,
  VISUAL_ENGINE.FLOW,
  VISUAL_ENGINE.VOLUME,
  VISUAL_ENGINE.PULSE,
  VISUAL_ENGINE.TRACK,
]);

/**
 * Compile a truthful fallback plan instead of presenting a broken or fabricated scene.
 * The result describes presentation, not replacement data.
 */
export function compileFailSoftScene({
  requestedEngine,
  dataState = DATA_STATE.UNAVAILABLE,
  thermalState = THERMAL_STATE.NORMAL,
  vectorAvailable = false,
  actualSpatialGrid = false,
  volumeSupported = true,
  fallbackFieldAvailable = false,
  officialSafety = false,
}) {
  if (!Object.values(VISUAL_ENGINE).includes(requestedEngine)) {
    throw new TypeError(`invalid requestedEngine: ${requestedEngine}`);
  }

  if (dataState === DATA_STATE.UNAVAILABLE) {
    return Object.freeze({
      requestedEngine,
      activeEngine: officialSafety ? VISUAL_ENGINE.BEACON : null,
      mode: officialSafety ? 'OFFICIAL_SAFETY_ONLY' : 'UNAVAILABLE',
      degraded: true,
      reason: 'DATA_UNAVAILABLE',
      dataReplacementAllowed: false,
    });
  }

  if (requestedEngine === VISUAL_ENGINE.FLOW && !vectorAvailable) {
    return Object.freeze({
      requestedEngine,
      activeEngine: fallbackFieldAvailable ? VISUAL_ENGINE.FIELD : null,
      mode: fallbackFieldAvailable ? 'SCALAR_FIELD_FALLBACK' : 'UNAVAILABLE',
      degraded: true,
      reason: 'VECTOR_FIELD_UNAVAILABLE',
      dataReplacementAllowed: false,
    });
  }

  if (requestedEngine === VISUAL_ENGINE.TOWER && !actualSpatialGrid) {
    return Object.freeze({
      requestedEngine,
      activeEngine: VISUAL_ENGINE.BEACON,
      mode: 'AGGREGATE_CLUSTER',
      degraded: true,
      reason: 'ACTUAL_SPATIAL_GRID_UNAVAILABLE',
      dataReplacementAllowed: false,
    });
  }

  if (requestedEngine === VISUAL_ENGINE.VOLUME && (!volumeSupported || thermalState === THERMAL_STATE.ECO)) {
    return Object.freeze({
      requestedEngine,
      activeEngine: VISUAL_ENGINE.VOLUME,
      mode: 'THREE_SHELL',
      degraded: true,
      reason: !volumeSupported ? 'VOLUME_UNSUPPORTED' : 'THERMAL_ECO',
      dataReplacementAllowed: false,
    });
  }

  if (thermalState === THERMAL_STATE.SAFE && DYNAMIC.has(requestedEngine)) {
    return Object.freeze({
      requestedEngine,
      activeEngine: requestedEngine === VISUAL_ENGINE.TOWER ? VISUAL_ENGINE.BEACON : VISUAL_ENGINE.FIELD,
      mode: 'STATIC_SAFE_PROFILE',
      degraded: true,
      reason: 'THERMAL_SAFE',
      dataReplacementAllowed: false,
    });
  }

  return Object.freeze({
    requestedEngine,
    activeEngine: requestedEngine,
    mode: 'FULL_REQUESTED_MODE',
    degraded: dataState === DATA_STATE.DEGRADED || dataState === DATA_STATE.STALE,
    reason: dataState === DATA_STATE.LIVE ? 'READY' : dataState,
    dataReplacementAllowed: false,
  });
}
