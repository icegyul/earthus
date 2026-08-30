import { createHash } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value) { return createHash('sha256').update(stable(value)).digest('hex'); }

export function buildSharedCacheKey(input = {}) {
  const allowed = {
    capabilityId: input.capabilityId,
    spatialKey: input.spatialKey,
    targetTimeBucket: input.targetTimeBucket,
    dataRevision: input.dataRevision,
    modelVersion: input.modelVersion,
    scenarioFingerprint: input.scenarioFingerprint || null,
    policyVersion: input.policyVersion,
  };
  return `shared:${digest(allowed)}`;
}

export function buildPrivateCacheKey({
  sharedBaseHash, principalScope, minimizedContext,
  entitlementVersion, policyVersion,
} = {}) {
  if (!sharedBaseHash || !principalScope) throw new Error('PRIVATE_CACHE_SCOPE_REQUIRED');
  return `private:${digest({
    sharedBaseHash,
    principalDigest: digest(principalScope),
    contextDigest: digest(minimizedContext || {}),
    entitlementVersion,
    policyVersion,
  })}`;
}

export async function projectPrivate({
  sharedBase, minimizedContext, entitlement, projector,
} = {}) {
  if (entitlement?.allowed !== true || !entitlement?.principalScope) {
    throw new Error('ENTITLEMENT_REQUIRED');
  }
  if (!sharedBase?.artifactId || typeof projector !== 'function') {
    throw new Error('PRIVATE_PROJECTION_INPUT_REQUIRED');
  }
  const result = await projector({ sharedBase, minimizedContext: minimizedContext || {} });
  return Object.freeze({
    baseArtifactId: sharedBase.artifactId,
    principalDigest: digest(entitlement.principalScope),
    result: Object.freeze({ ...result }),
    cacheControl: 'private, no-store',
    shareScope: 'PRIVATE_USER',
  });
}
