import { boundedLogScale, clamp, percentile } from '../core/math.js';

export function towerVisual(value, values, {
  heightMinM = 12,
  heightMaxM = 680,
  widthM = 120,
  scale = 'LOG',
  evidenceKind = 'OFFICIAL_OBSERVATION',
  officialLevel = null,
} = {}) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('tower value must be finite and >=0');
  const valid = values.filter(Number.isFinite).filter((item) => item >= 0);
  const maxValue = Math.max(1, percentile(valid, 0.95) ?? value ?? 1);
  const normalized = scale === 'SQRT'
    ? clamp(Math.sqrt(value / maxValue), 0, 1)
    : boundedLogScale(value, { minValue: 0, maxValue, minOutput: 0, maxOutput: 1 });
  const opacity = ['OFFICIAL_OBSERVATION', 'HISTORY'].includes(evidenceKind) ? 1
    : evidenceKind === 'ESTIMATED_DISTRIBUTION' ? 0.72 : 0.58;
  return Object.freeze({
    heightM: heightMinM + normalized * (heightMaxM - heightMinM),
    widthM,
    normalized,
    opacity,
    officialLevel,
    evidenceKind,
  });
}

export function massPreservingAllocation({ total, cells, weights }) {
  if (!Number.isFinite(total) || total < 0) throw new RangeError('total must be >=0');
  if (!Array.isArray(cells) || !cells.length || !Array.isArray(weights) || weights.length !== cells.length) {
    throw new TypeError('cells and matching weights are required');
  }
  const sanitized = weights.map((weight) => Number.isFinite(weight) && weight > 0 ? weight : 0);
  const sum = sanitized.reduce((acc, value) => acc + value, 0);
  if (sum <= 0) throw new RangeError('at least one positive weight is required');
  const raw = sanitized.map((weight) => total * weight / sum);
  let remaining = Math.round(total) - raw.reduce((acc, value) => acc + Math.floor(value), 0);
  const fractions = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction);
  const allocated = raw.map(Math.floor);
  for (let index = 0; index < fractions.length && remaining > 0; index += 1, remaining -= 1) allocated[fractions[index].index] += 1;
  return Object.freeze(cells.map((cell, index) => Object.freeze({ cell: structuredClone(cell), value: allocated[index], weight: sanitized[index] / sum })));
}

export function towerPoolPlan({ visibleCount, deviceClass = 'desktop', thermalState = 'NORMAL' }) {
  if (!Number.isInteger(visibleCount) || visibleCount < 0) throw new RangeError('visibleCount must be a non-negative integer');
  let budget = deviceClass === 'mobile' ? 900 : 2500;
  if (thermalState === 'BALANCED') budget = Math.floor(budget * 0.75);
  if (thermalState === 'ECO') budget = Math.floor(budget * 0.4);
  if (thermalState === 'SAFE') budget = 0;
  return Object.freeze({ budget, renderCount: Math.min(visibleCount, budget), aggregateRemainder: Math.max(0, visibleCount - budget), useInstancing: true, recreateOnTimeStep: false });
}
