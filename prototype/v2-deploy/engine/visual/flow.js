import { clamp } from '../core/math.js';

export function sampleVectorGrid(frame, x, y) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width < 2 || frame.height < 2) {
    throw new TypeError('complete vector grid dimensions are required');
  }
  if (!Array.isArray(frame.u) || !Array.isArray(frame.v) || frame.u.length !== frame.width * frame.height || frame.v.length !== frame.width * frame.height) {
    throw new TypeError('complete u/v arrays are required');
  }
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  const gx = x * (frame.width - 1);
  const gy = y * (frame.height - 1);
  const x0 = Math.floor(gx); const y0 = Math.floor(gy);
  const x1 = Math.min(frame.width - 1, x0 + 1); const y1 = Math.min(frame.height - 1, y0 + 1);
  const indices = [y0 * frame.width + x0, y0 * frame.width + x1, y1 * frame.width + x0, y1 * frame.width + x1];
  const us = indices.map((index) => frame.u[index]);
  const vs = indices.map((index) => frame.v[index]);
  if ([...us, ...vs].some((value) => !Number.isFinite(value))) return null;
  const tx = gx - x0; const ty = gy - y0;
  const bilinear = (values) => (values[0] * (1 - tx) + values[1] * tx) * (1 - ty) + (values[2] * (1 - tx) + values[3] * tx) * ty;
  return Object.freeze({ u: bilinear(us), v: bilinear(vs) });
}

export function advectNormalized(position, frame, dtSeconds, scale = 1) {
  const vector = sampleVectorGrid(frame, position.x, position.y);
  if (!vector) return Object.freeze({ ...position, state: 'MISSING_VECTOR' });
  const next = {
    x: clamp(position.x + vector.u * dtSeconds * scale, 0, 1),
    y: clamp(position.y + vector.v * dtSeconds * scale, 0, 1),
  };
  return Object.freeze({ ...next, state: 'ADVECTED', vector });
}

export function flowRenderBudget({ deviceClass = 'desktop', thermalState = 'NORMAL', panelOpen = false }) {
  let particles = deviceClass === 'mobile' ? 5000 : 18000;
  let fps = 30;
  if (thermalState === 'BALANCED') { particles *= 0.55; fps = 26; }
  if (thermalState === 'ECO') { particles *= 0.18; fps = 20; }
  if (thermalState === 'SAFE') { particles = 0; fps = 0; }
  if (panelOpen) particles *= 0.75;
  return Object.freeze({ maxParticles: Math.floor(particles), maxFps: fps, visibleTilesOnly: true });
}
