const BUDGETS = Object.freeze({ FULL: { maxParticles: 18000, maxFps: 30 }, BALANCED: { maxParticles: 9000, maxFps: 24 }, LITE: { maxParticles: 3000, maxFps: 20 }, STATIC: { maxParticles: 0, maxFps: 0 } });
export function flowBudget(profile = 'BALANCED') { if (!BUDGETS[profile]) throw new TypeError(`unknown flow quality: ${profile}`); return { ...BUDGETS[profile] }; }
export function sampleVectorGrid(frame, x, y) {
  if (!frame || frame.width < 2 || frame.height < 2 || !Array.isArray(frame.u) || !Array.isArray(frame.v)) throw new TypeError('complete vector grid is required');
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  const gx = x * (frame.width - 1), gy = y * (frame.height - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(frame.width - 1, x0 + 1), y1 = Math.min(frame.height - 1, y0 + 1);
  const indices = [y0 * frame.width + x0, y0 * frame.width + x1, y1 * frame.width + x0, y1 * frame.width + x1];
  const us = indices.map(index => frame.u[index]), vs = indices.map(index => frame.v[index]);
  if ([...us, ...vs].some(value => value === null || value === undefined || !Number.isFinite(value))) return null;
  const tx = gx - x0, ty = gy - y0;
  const bilinear = values => (values[0] * (1-tx) + values[1] * tx) * (1-ty) + (values[2] * (1-tx) + values[3] * tx) * ty;
  return { u: bilinear(us), v: bilinear(vs) };
}
