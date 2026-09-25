import { PRODUCTS, PLATFORMS, assertProductTarget } from './PRODUCT_TARGET_V37.mjs';

export function createPleosBuildTarget() {
  assertProductTarget(PRODUCTS.EARTHUS, PLATFORMS.PLEOS);
  return Object.freeze({
    product: PRODUCTS.EARTHUS,
    platform: PLATFORMS.PLEOS,
    allowedRoutePrefixes: ['/earthus'],
    excludedRoutePrefixes: ['/aetherus', '/space'],
    allowedBundleNamespaces: ['earthus/', 'shared/'],
    excludedBundleNamespaces: ['aetherus/', 'space/'],
    allowedAnalyticsPrefixes: ['earthus.'],
    excludedAnalyticsPrefixes: ['aetherus.', 'space.']
  });
}

export function assertPleosRegistration({ route, bundleNamespace, analyticsEvent } = {}) {
  const target = createPleosBuildTarget();
  if (route && !target.allowedRoutePrefixes.some(p => route.startsWith(p))) {
    throw new Error(`PLEOS_ROUTE_REJECTED:${route}`);
  }
  if (bundleNamespace && target.excludedBundleNamespaces.some(p => bundleNamespace.startsWith(p))) {
    throw new Error(`PLEOS_BUNDLE_NAMESPACE_REJECTED:${bundleNamespace}`);
  }
  if (analyticsEvent && target.excludedAnalyticsPrefixes.some(p => analyticsEvent.startsWith(p))) {
    throw new Error(`PLEOS_ANALYTICS_REJECTED:${analyticsEvent}`);
  }
  return true;
}
