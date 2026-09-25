/**
 * V38 FINAL — Pleos product target.
 * This file intentionally has NO AETHERUS dependency or renderer import.
 * Pleos is an EARTHUS-only build target.
 */
export const PRODUCT = 'EARTHUS';
export const PLATFORM = 'PLEOS';

export function createPleosTarget() {
  return Object.freeze({ product: PRODUCT, platform: PLATFORM });
}

export function assertPleosTarget(product = PRODUCT, platform = PLATFORM) {
  if (product !== PRODUCT || platform !== PLATFORM) {
    throw new Error(`PLEOS_TARGET_REJECTED:${product}:${platform}`);
  }
  return true;
}

export const PLEOS_POLICY = Object.freeze({
  allowedRoutePrefixes: ['/earthus'],
  excludedRoutePrefixes: ['/aetherus', '/space'],
  allowedBundleNamespaces: ['earthus/', 'shared/'],
  excludedBundleNamespaces: ['aetherus/', 'space/'],
  allowedAnalyticsPrefixes: ['earthus.'],
  excludedAnalyticsPrefixes: ['aetherus.', 'space.']
});

export function assertPleosRegistration({route, bundleNamespace, analyticsEvent} = {}) {
  assertPleosTarget();
  if (route && PLEOS_POLICY.excludedRoutePrefixes.some(p => route.startsWith(p)))
    throw new Error(`PLEOS_ROUTE_REJECTED:${route}`);
  if (bundleNamespace && PLEOS_POLICY.excludedBundleNamespaces.some(p => bundleNamespace.startsWith(p)))
    throw new Error(`PLEOS_BUNDLE_REJECTED:${bundleNamespace}`);
  if (analyticsEvent && PLEOS_POLICY.excludedAnalyticsPrefixes.some(p => analyticsEvent.startsWith(p)))
    throw new Error(`PLEOS_ANALYTICS_REJECTED:${analyticsEvent}`);
  return true;
}
