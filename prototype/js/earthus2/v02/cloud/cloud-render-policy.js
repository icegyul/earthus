import { clamp } from '../core/math.js';
import { cloudHorizonKind } from './cloud-forecast.js';

export function cloudRenderPolicy({ horizonHours, confidence, uncertainty, deviceClass = 'desktop', thermalState = 'NORMAL', panelOpen = false }) {
  const kind = cloudHorizonKind(horizonHours);
  const c = clamp(confidence, 0, 1);
  const u = clamp(uncertainty, 0, 1);
  const horizonPenalty = kind === 'LONG_RANGE_OUTLOOK' ? 0.45 : kind === 'OUTLOOK' ? 0.72 : 1;
  let mode = deviceClass === 'mobile' ? 'LOW_3D_CLOUD' : 'MEDIUM_3D_VOLUME';
  if (thermalState === 'ECO') mode = 'LOW_3D_CLOUD';
  if (thermalState === 'SAFE') mode = 'STATIC_3D_CLOUD';
  if (kind === 'LONG_RANGE_OUTLOOK') mode = 'PROBABILITY_VOLUME';
  const panelScale = panelOpen ? 0.8 : 1;
  return Object.freeze({
    mode,
    opacity: clamp((0.20 + 0.80 * c) * horizonPenalty, 0.08, 1),
    boundaryBlur: 0.5 + 8 * u + (1 - horizonPenalty) * 5,
    detailFrequency: clamp(c * (1 - u) * horizonPenalty * panelScale, 0.04, 1),
    shadowEnabled: deviceClass !== 'mobile' && thermalState === 'NORMAL' && horizonHours <= 72,
    animationFps: thermalState === 'NORMAL' ? 30 : thermalState === 'BALANCED' ? 26 : thermalState === 'ECO' ? 18 : 0,
    currentLikeSharpnessAllowed: horizonHours <= 72,
    probabilityLabelRequired: horizonHours > 168,
  });
}
