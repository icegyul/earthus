import { clamp } from '../core/math.js';

export function precipitationPhase({ surfaceTemperatureC, wetBulbTemperatureC, warmLayerDepthM = 0, coldLayerDepthM = 0 }) {
  if (![surfaceTemperatureC, wetBulbTemperatureC, warmLayerDepthM, coldLayerDepthM].every(Number.isFinite)) return Object.freeze({ phase: 'UNKNOWN', confidence: 0 });
  if (wetBulbTemperatureC <= -1 && warmLayerDepthM < 300) return Object.freeze({ phase: 'SNOW', confidence: 0.85 });
  if (surfaceTemperatureC <= 1 && warmLayerDepthM >= 300 && coldLayerDepthM >= 200) return Object.freeze({ phase: 'FREEZING_RAIN_OR_SLEET', confidence: 0.6 });
  if (wetBulbTemperatureC <= 1.5 && coldLayerDepthM > 400) return Object.freeze({ phase: 'SLEET_OR_WET_SNOW', confidence: 0.65 });
  return Object.freeze({ phase: 'RAIN', confidence: 0.85 });
}

export function precipitationState({ radarRateMmH, gaugeRateMmH, modelRateMmH, radarQuality = 1, gaugeQuality = 1, modelQuality = 0.5 }) {
  const sources = [
    { value: radarRateMmH, weight: radarQuality, id: 'RADAR' },
    { value: gaugeRateMmH, weight: gaugeQuality, id: 'GAUGE' },
    { value: modelRateMmH, weight: modelQuality, id: 'MODEL' },
  ].filter((item) => Number.isFinite(item.value) && item.value >= 0 && Number.isFinite(item.weight) && item.weight > 0);
  if (!sources.length) return Object.freeze({ rateMmH: null, state: 'UNAVAILABLE', sourceIds: Object.freeze([]) });
  const total = sources.reduce((sum, item) => sum + item.weight, 0);
  const rateMmH = sources.reduce((sum, item) => sum + item.value * item.weight, 0) / total;
  const observed = sources.some((item) => ['RADAR', 'GAUGE'].includes(item.id));
  return Object.freeze({ rateMmH, state: observed ? 'OBSERVED_BLEND' : 'MODEL_ONLY', sourceIds: Object.freeze(sources.map((item) => item.id)), intensity: rateMmH >= 30 ? 'VERY_HEAVY' : rateMmH >= 15 ? 'HEAVY' : rateMmH >= 3 ? 'MODERATE' : rateMmH > 0 ? 'LIGHT' : 'NONE' });
}

export function rainCurtainPolicy({ rateMmH, cameraHeightM, deviceClass = 'desktop', thermalState = 'NORMAL' }) {
  const normalized = clamp((Number.isFinite(rateMmH) ? rateMmH : 0) / 50, 0, 1);
  const close = Number.isFinite(cameraHeightM) && cameraHeightM < 150000;
  if (thermalState === 'SAFE') return Object.freeze({ mode: 'STATIC_AREA', density: 0, opacity: 0.25 });
  if (deviceClass === 'mobile' || thermalState === 'ECO' || !close) return Object.freeze({ mode: 'CURTAIN', density: Math.round(40 + normalized * 120), opacity: 0.25 + normalized * 0.55 });
  return Object.freeze({ mode: 'CURTAIN_PLUS_NEAR_PARTICLES', density: Math.round(120 + normalized * 600), opacity: 0.30 + normalized * 0.60 });
}
