export const PRODUCTS = Object.freeze({ EARTHUS: 'EARTHUS', AETHERUS: 'AETHERUS' });
export const PLATFORMS = Object.freeze({ WEB: 'WEB', MOBILE: 'MOBILE', PLEOS: 'PLEOS' });

const ALLOWED = Object.freeze({
  EARTHUS: new Set(['WEB', 'MOBILE', 'PLEOS']),
  AETHERUS: new Set(['WEB', 'MOBILE'])
});

export function assertProductTarget(product, platform) {
  if (!ALLOWED[product]?.has(platform)) {
    throw new Error(`INVALID_PRODUCT_TARGET:${product}:${platform}`);
  }
  return true;
}

export function isAetherusAllowed(platform) {
  return platform !== PLATFORMS.PLEOS;
}

export function createTarget(product, platform) {
  assertProductTarget(product, platform);
  return Object.freeze({ product, platform });
}

export function targetMatrix() {
  return {
    EARTHUS: { WEB: true, MOBILE: true, PLEOS: true },
    AETHERUS: { WEB: true, MOBILE: true, PLEOS: false }
  };
}
