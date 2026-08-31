import { clamp } from '../core/math.js';

function valueAt(field, x, y) {
  if (x < 0 || y < 0 || x >= field.width || y >= field.height) return null;
  const value = field.values[y * field.width + x];
  return Number.isFinite(value) ? value : null;
}

export function sampleScalarGrid(field, nx, ny) {
  if (!field || !Number.isInteger(field.width) || !Number.isInteger(field.height) || !Array.isArray(field.values)) throw new TypeError('complete scalar grid is required');
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  const gx = nx * (field.width - 1); const gy = ny * (field.height - 1);
  const x0 = Math.floor(gx); const y0 = Math.floor(gy); const x1 = Math.min(field.width - 1, x0 + 1); const y1 = Math.min(field.height - 1, y0 + 1);
  const values = [valueAt(field, x0, y0), valueAt(field, x1, y0), valueAt(field, x0, y1), valueAt(field, x1, y1)];
  if (values.some((value) => value === null)) return null;
  const tx = gx - x0; const ty = gy - y0;
  return (values[0] * (1 - tx) + values[1] * tx) * (1 - ty) + (values[2] * (1 - tx) + values[3] * tx) * ty;
}

export function advectScalarField({ field, vectorField, dtSeconds, coordinateScale = 1, growth = null, decay = null }) {
  if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new RangeError('dtSeconds must be >=0');
  if (field.width !== vectorField.width || field.height !== vectorField.height) throw new TypeError('field and vector dimensions must match');
  const values = new Array(field.width * field.height).fill(null);
  for (let y = 0; y < field.height; y += 1) {
    for (let x = 0; x < field.width; x += 1) {
      const index = y * field.width + x;
      const u = vectorField.u[index]; const v = vectorField.v[index];
      if (![u, v].every(Number.isFinite)) continue;
      const nx = field.width > 1 ? x / (field.width - 1) : 0;
      const ny = field.height > 1 ? y / (field.height - 1) : 0;
      const sourceX = nx - u * dtSeconds * coordinateScale;
      const sourceY = ny - v * dtSeconds * coordinateScale;
      const source = sampleScalarGrid(field, sourceX, sourceY);
      if (!Number.isFinite(source)) continue;
      const growthValue = typeof growth === 'function' ? Number(growth({ x, y, index, source })) || 0 : 0;
      const decayValue = typeof decay === 'function' ? Number(decay({ x, y, index, source })) || 0 : 0;
      values[index] = Math.max(0, source + growthValue - decayValue);
    }
  }
  return Object.freeze({ width: field.width, height: field.height, values: Object.freeze(values), validAtOffsetSec: dtSeconds });
}

export function blendNowcastWithNwp({ nowcast, nwp, horizonHours }) {
  if (nowcast.width !== nwp.width || nowcast.height !== nwp.height) throw new TypeError('nowcast and NWP dimensions must match');
  const nwpWeight = clamp(horizonHours / 6, 0, 1);
  const values = nowcast.values.map((value, index) => {
    const model = nwp.values[index];
    if (!Number.isFinite(value)) return Number.isFinite(model) ? model : null;
    if (!Number.isFinite(model)) return value;
    return value * (1 - nwpWeight) + model * nwpWeight;
  });
  return Object.freeze({ width: nowcast.width, height: nowcast.height, values: Object.freeze(values), nwpWeight });
}
