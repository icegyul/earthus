const DEPTH_CLASS = Object.freeze({
  I0_DIGEST: 'C1_MATERIALIZED_SHARED',
  I1_STATE: 'C1_MATERIALIZED_SHARED',
  I2_RISK_IMPACT: 'C2_EVENT_DELTA',
  I3_DEEP_SHARED: 'C3_SHARED_DEEP',
  I4_PERSONAL: 'C4_PREMIUM_PROJECTION',
  I5_SCENARIO: 'C5_PREMIUM_SCENARIO',
});

const CLASS_RANK = Object.freeze({
  C0_STATIC_BASELINE: 0,
  C1_MATERIALIZED_SHARED: 1,
  C2_EVENT_DELTA: 2,
  C3_SHARED_DEEP: 3,
  C4_PREMIUM_PROJECTION: 4,
  C5_PREMIUM_SCENARIO: 5,
});

function minClass(a, b) {
  return CLASS_RANK[a] <= CLASS_RANK[b] ? a : b;
}

export function resolveIntelligenceLod({
  spatialScope = 'GLOBAL', temporalClass = 'T0', requestedDepth = 'I0_DIGEST',
  visualTier = 'V2_BALANCED', cameraState = 'STABLE', planClass = 'FREE',
  globalFirstLoad = false,
} = {}) {
  const requestedClass = DEPTH_CLASS[requestedDepth] || 'C1_MATERIALIZED_SHARED';
  let policyCeiling = planClass === 'PAID' ? 'C5_PREMIUM_SCENARIO' : 'C2_EVENT_DELTA';
  const reasons = [];
  if (globalFirstLoad || spatialScope === 'GLOBAL') {
    policyCeiling = minClass(policyCeiling, 'C1_MATERIALIZED_SHARED');
    reasons.push('GLOBAL_MATERIALIZED_ONLY');
  }
  if (cameraState === 'MOVING') {
    policyCeiling = minClass(policyCeiling, 'C1_MATERIALIZED_SHARED');
    reasons.push('CAMERA_MOVING');
  }
  const computeCeiling = minClass(requestedClass, policyCeiling);
  return Object.freeze({
    spatialScope, temporalClass, requestedDepth, visualTier, cameraState,
    computeCeiling,
    allowDeepCompute: CLASS_RANK[computeCeiling] >= CLASS_RANK.C3_SHARED_DEEP,
    centerFirst: cameraState === 'STABLE' && spatialScope !== 'GLOBAL',
    reasons: Object.freeze(reasons),
  });
}
