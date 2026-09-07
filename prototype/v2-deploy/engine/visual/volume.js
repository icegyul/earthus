import { clamp } from '../core/math.js';

export function volumeRenderPolicy({ deviceClass = 'desktop', thermalState = 'NORMAL', confidence = 1, uncertainty = 0, horizonHours = 0 }) {
  const c = clamp(confidence, 0, 1);
  const u = clamp(uncertainty, 0, 1);
  const longRange = horizonHours > 168;
  if (thermalState === 'SAFE') return Object.freeze({ mode: 'STATIC_SHELL', resolutionScale: 0.1, raySteps: 0, opacity: 0.28, boundaryBlur: 10, animate: false });
  if (deviceClass === 'mobile' || thermalState === 'ECO') {
    return Object.freeze({
      mode: 'THREE_SHELL',
      resolutionScale: thermalState === 'ECO' ? 0.2 : 0.35,
      raySteps: 0,
      opacity: clamp((0.25 + 0.65 * c) * (longRange ? 0.65 : 1), 0.12, 0.9),
      boundaryBlur: 1 + u * 9 + (longRange ? 4 : 0),
      animate: thermalState !== 'ECO',
    });
  }
  const balanced = thermalState === 'BALANCED';
  return Object.freeze({
    mode: 'HALF_RES_VOLUME',
    resolutionScale: balanced ? 0.35 : 0.5,
    raySteps: balanced ? 24 : 40,
    opacity: clamp((0.25 + 0.7 * c) * (longRange ? 0.65 : 1), 0.1, 0.95),
    boundaryBlur: 0.5 + u * 8 + (longRange ? 4 : 0),
    animate: true,
  });
}

export function shellLayerOpacity({ low, mid, high }) {
  const values = [low, mid, high].map((value) => clamp(Number.isFinite(value) ? value : 0, 0, 1));
  return Object.freeze({ low: values[0], mid: values[1], high: values[2], total: clamp(1 - values.reduce((product, value) => product * (1 - value), 1), 0, 1) });
}
