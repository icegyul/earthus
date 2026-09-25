export const PRODUCT = Object.freeze({ EARTHUS: 'EARTHUS', AETHERUS: 'AETHERUS' });
export const PLATFORM = Object.freeze({ WEB: 'WEB', MOBILE: 'MOBILE' });
export const MATRIX = Object.freeze({
  EARTHUS: { WEB: true, MOBILE: true },
  AETHERUS: { WEB: true, MOBILE: true }
});
export function assertTarget(product, platform) {
  if (!MATRIX[product]?.[platform]) throw new Error(`INVALID_TARGET:${product}:${platform}`);
  return true;
}
