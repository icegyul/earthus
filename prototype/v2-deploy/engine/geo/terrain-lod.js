import { clamp } from '../core/math.js';

export function screenSpaceError({ geometricErrorM, distanceM, viewportHeightPx, verticalFovDeg }) {
  for (const [name, value] of Object.entries({ geometricErrorM, distanceM, viewportHeightPx, verticalFovDeg })) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive`);
  }
  const denominator = 2 * distanceM * Math.tan((verticalFovDeg * Math.PI / 180) / 2);
  return geometricErrorM * viewportHeightPx / denominator;
}

export function selectTerrainLod({ levels, distanceM, viewportHeightPx, verticalFovDeg, targetSse = 2, tileBudget = Infinity }) {
  if (!Array.isArray(levels) || !levels.length) throw new TypeError('levels are required');
  const evaluated = levels.map((level) => ({
    ...level,
    sse: screenSpaceError({ geometricErrorM: level.geometricErrorM, distanceM, viewportHeightPx, verticalFovDeg }),
  })).sort((a, b) => a.level - b.level);
  const candidates = evaluated.filter((level) => level.sse <= targetSse && (level.estimatedTiles ?? 0) <= tileBudget);
  return Object.freeze(candidates.at(-1) ?? evaluated[0]);
}

export function verticalExaggeration({ cameraHeightM, mode = 'RELIEF', max = 8 }) {
  if (!Number.isFinite(cameraHeightM) || cameraHeightM < 0) throw new RangeError('cameraHeightM must be >=0');
  const globeFactor = clamp(Math.log10(Math.max(1, cameraHeightM)) / 7, 0, 1);
  if (mode === 'REAL') return 1;
  if (mode === 'DATA') return 1 + globeFactor * Math.min(max - 1, 3);
  return 1 + globeFactor * (max - 1);
}

export function terrainTileBudget({ deviceClass = 'desktop', thermalState = 'NORMAL', panelOpen = false }) {
  let budget = deviceClass === 'mobile' ? 140 : 420;
  if (thermalState === 'BALANCED') budget *= 0.75;
  if (thermalState === 'ECO') budget *= 0.45;
  if (thermalState === 'SAFE') budget = 40;
  if (panelOpen) budget *= 0.8;
  return Math.max(32, Math.floor(budget));
}
