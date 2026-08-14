// Earthus 공통 접근 모드.
// 결제 가능 여부와 기능 준비/권리/안전 gate를 섞지 않는다.

export const MONETIZATION_MODE = Object.freeze({
  FREE_OPEN: 'FREE_OPEN',
  PAID: 'PAID',
});

export function normalizeMonetizationMode(value) {
  // 오타·구버전 config는 결제를 열지 않고 무료 쪽으로 fail-safe한다.
  return value === MONETIZATION_MODE.PAID
    ? MONETIZATION_MODE.PAID : MONETIZATION_MODE.FREE_OPEN;
}

export function isFreeOpenMode(value) {
  return normalizeMonetizationMode(value) === MONETIZATION_MODE.FREE_OPEN;
}

export function decideCapabilityAccess({ mode, available = true, paidEntitled = false,
  alwaysFree = false } = {}) {
  if (available !== true) return Object.freeze({ allowed: false, reason: 'CAPABILITY_NOT_AVAILABLE' });
  if (alwaysFree === true) return Object.freeze({ allowed: true, reason: 'ALWAYS_FREE' });
  if (isFreeOpenMode(mode)) {
    return Object.freeze({ allowed: true, reason: 'FREE_OPEN_UNTIL_PAID_LAUNCH' });
  }
  return Object.freeze({ allowed: paidEntitled === true,
    reason: paidEntitled === true ? 'PAID_ENTITLED' : 'PAID_ENTITLEMENT_REQUIRED' });
}

export function salesAllowed({ mode, salesOpen } = {}) {
  return normalizeMonetizationMode(mode) === MONETIZATION_MODE.PAID && salesOpen === true;
}

export function subscriptionUiAllowed({ mode, showSubscribe } = {}) {
  return normalizeMonetizationMode(mode) === MONETIZATION_MODE.PAID && showSubscribe === true;
}
