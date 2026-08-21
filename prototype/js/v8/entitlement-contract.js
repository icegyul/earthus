const PUBLIC_ACCESS = new Set(['PUBLIC', 'ALWAYS_FREE_SAFETY']);

// 공개 브라우저는 유료 이용권을 판정하지 않는다. PREMIUM 응답 허가는 forecast-v8 서버만 한다.
export function evaluatePublicAccess({ accessClass }) {
  if (accessClass === 'ALWAYS_FREE_SAFETY') return { allowed: true, reason: 'SAFETY_ALWAYS_FREE' };
  if (accessClass === 'PUBLIC') return { allowed: true, reason: 'PUBLIC' };
  if (accessClass === 'PREMIUM') return { allowed: false, reason: 'SERVER_ENTITLEMENT_REQUIRED' };
  return { allowed: false, reason: 'ACCESS_CLASS_BLOCKED' };
}

export function enforceResponseBoundary(envelope, { surface }) {
  if (!envelope || typeof envelope !== 'object') throw new TypeError('response envelope is required');
  if (envelope.dataClass === 'OFFICIAL_WARNING' && envelope.accessClass !== 'ALWAYS_FREE_SAFETY') {
    throw new Error('SAFETY_MUST_BE_ALWAYS_FREE');
  }
  if (surface === 'PUBLIC' && (!PUBLIC_ACCESS.has(envelope.accessClass) || envelope.dataClass === 'EARTHUS_DERIVED')) {
    throw new Error('PREMIUM_PAYLOAD_ON_PUBLIC_SURFACE');
  }
  if (surface !== 'PUBLIC') throw new Error('SERVER_ONLY_SURFACE');
  return envelope;
}
