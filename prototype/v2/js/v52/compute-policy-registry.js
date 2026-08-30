export const COMPUTE_CLASSES = Object.freeze([
  Object.freeze({ id: 'C0_STATIC_BASELINE', rank: 0 }),
  Object.freeze({ id: 'C1_MATERIALIZED_SHARED', rank: 1 }),
  Object.freeze({ id: 'C2_EVENT_DELTA', rank: 2 }),
  Object.freeze({ id: 'C3_SHARED_DEEP', rank: 3 }),
  Object.freeze({ id: 'C4_PREMIUM_PROJECTION', rank: 4 }),
  Object.freeze({ id: 'C5_PREMIUM_SCENARIO', rank: 5 }),
]);

const CLASS_RANK = new Map(COMPUTE_CLASSES.map(item => [item.id, item.rank]));
const PRIVATE_CACHE_FIELDS = new Set([
  'userId', 'principalId', 'principalScope', 'privateContext', 'privateRoute',
  'preciseLocation', 'savedPlaces', 'tenantSecret',
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fnv1a64(value) {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function validatePolicy(input) {
  if (!input?.capabilityId) fail('COMPUTE_POLICY_CAPABILITY_REQUIRED');
  if (!Array.isArray(input.ownerEngineIds) || input.ownerEngineIds.length === 0) {
    fail('COMPUTE_POLICY_OWNER_REQUIRED');
  }
  if (!CLASS_RANK.has(input.computeClass)) fail('COMPUTE_POLICY_CLASS_INVALID');
  if (!Array.isArray(input.cacheKeyFields) || input.cacheKeyFields.length === 0) {
    fail('COMPUTE_POLICY_CACHE_FIELDS_REQUIRED');
  }
  if (input.shareScope === 'PUBLIC') {
    const forbidden = input.cacheKeyFields.find(field => PRIVATE_CACHE_FIELDS.has(field));
    if (forbidden) fail(`PUBLIC_POLICY_PRIVATE_FIELD:${forbidden}`);
  }
  for (const numberField of [
    'ttlSeconds', 'freshnessHalfLifeSeconds', 'staleWhileRevalidateSeconds',
    'maxStaleSeconds', 'maxRuntimeMs', 'maxResultBytes',
  ]) {
    if (!Number.isFinite(Number(input[numberField])) || Number(input[numberField]) < 0) {
      fail(`COMPUTE_POLICY_NUMBER_INVALID:${numberField}`);
    }
  }
  return Object.freeze({
    ...input,
    ownerEngineIds: Object.freeze([...input.ownerEngineIds]),
    scopeLevels: Object.freeze([...(input.scopeLevels || [])]),
    dependencyKeys: Object.freeze([...(input.dependencyKeys || [])]),
    cacheKeyFields: Object.freeze([...input.cacheKeyFields]),
    truthRestrictions: Object.freeze([...(input.truthRestrictions || [])]),
  });
}

function ceilingFor(context = {}) {
  if (context.globalFirstLoad || context.cameraState === 'MOVING') {
    return 'C1_MATERIALIZED_SHARED';
  }
  if (context.planClass === 'FREE') return 'C2_EVENT_DELTA';
  if (context.computeCeiling && CLASS_RANK.has(context.computeCeiling)) return context.computeCeiling;
  return context.planClass === 'PAID' ? 'C5_PREMIUM_SCENARIO' : 'C1_MATERIALIZED_SHARED';
}

export function createComputePolicyRegistry(initialPolicies = []) {
  const policies = new Map();
  const register = policyInput => {
    const policy = validatePolicy(policyInput);
    if (policies.has(policy.capabilityId)) fail(`COMPUTE_POLICY_DUPLICATE:${policy.capabilityId}`);
    policies.set(policy.capabilityId, policy);
    return policy;
  };
  initialPolicies.forEach(register);

  return Object.freeze({
    register,
    resolve(capabilityId) {
      const policy = policies.get(capabilityId);
      if (!policy) fail(`COMPUTE_POLICY_UNKNOWN:${capabilityId}`);
      return policy;
    },
    plan(capabilityId, request = {}, context = {}) {
      const policy = this.resolve(capabilityId);
      const computeCeiling = ceilingFor(context);
      const dimensions = {};
      for (const field of policy.cacheKeyFields) {
        dimensions[field] = field === 'capabilityId' ? capabilityId : request[field] ?? policy[field] ?? null;
      }
      const cacheKey = `${capabilityId}:${fnv1a64(stable(dimensions))}`;
      const computeAllowed = CLASS_RANK.get(policy.computeClass) <= CLASS_RANK.get(computeCeiling);
      return Object.freeze({
        capabilityId, policy, computeCeiling, computeAllowed, cacheKey,
        fallbackMode: policy.fallbackMode,
        reason: Object.freeze(computeAllowed ? ['WITHIN_COMPUTE_CEILING'] : ['COMPUTE_CEILING_EXCEEDED']),
      });
    },
    list() { return Object.freeze([...policies.values()]); },
  });
}
