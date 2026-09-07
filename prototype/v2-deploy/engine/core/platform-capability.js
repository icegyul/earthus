export function platformCapabilityPlan({ pwa = true, webPush = false, nativeWrapper = false, nativeIos = false, nativeAndroid = false, geofence = false, visionPro = false }) {
  const capabilities = {
    web: pwa,
    push: webPush || nativeWrapper || nativeIos || nativeAndroid,
    backgroundGeofence: geofence && (nativeWrapper || nativeIos || nativeAndroid),
    appStoreDistribution: nativeWrapper || nativeIos || nativeAndroid,
    visionPro: visionPro && nativeIos,
  };
  const blockers = [];
  if (geofence && !capabilities.backgroundGeofence) blockers.push('GEOFENCE_REQUIRES_NATIVE_DELIVERY');
  if (visionPro && !nativeIos) blockers.push('VISION_PRO_REQUIRES_APPLE_NATIVE_TARGET');
  return Object.freeze({ strategy: nativeIos || nativeAndroid ? 'NATIVE_OR_HYBRID' : nativeWrapper ? 'WRAPPER' : 'PWA_FIRST', capabilities: Object.freeze(capabilities), blockers: Object.freeze(blockers) });
}
