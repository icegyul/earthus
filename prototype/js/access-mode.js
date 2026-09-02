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

/* ── 요금제 사다리 — 정본은 v5.3 §1.4 ───────────────────────
   FREE             — SEE THE EARTH        : 지금 지구를 본다
   EXPLORER         — UNDERSTAND THE EARTH : 왜 그런지 이해한다
   INTELLIGENCE     — INVESTIGATE THE EARTH : 돌려보고 비교하고 보고서로 남긴다
   ⚠️ 정본 v5.3 표기는 EXPLORER PRO / INTELLIGENCE PRO 다. 화면에서는 PRO 를 뗐다(2026-09-02).

   ⚠️⚠️ **레거시 'paid' 를 지우면 안 된다.**
      서버(supabase/billing.sql)가 지금까지 쓴 값이 'paid' 하나뿐이라,
      빼는 순간 기존 구독자가 전부 무료로 떨어진다. explorer 와 같은 자리로 읽는다.
   ⚠️ 'business' 는 소비자 티어가 아니다 — v5.3이 소비자 3단계에서 빼고
      Team/Institution add-on 으로 돌렸다. 사다리에는 남기되 상품으로 팔지 않는다.
   ⚠️ 이 사다리는 earthus2/v02/paid/entitlement.js 의 RANK 와 같은 순서다
      (FREE 0 / PLUS 1 / CONTROL 2 / BUSINESS 3). 이름만 제품명으로 바꿔 부른다 —
      엔진을 새로 만들지 않는다(v5.3 PAY-001 PRESERVE_AND_REUSE). */
export const TIER = Object.freeze({
  FREE:         'free',
  EXPLORER:     'explorer',
  INTELLIGENCE: 'intelligence',
});

const TIER_RANK = Object.freeze({
  free: 0,
  paid: 1,          // 레거시 별칭 — explorer 와 동급
  explorer: 1,
  intelligence: 2,
  business: 3,      // 소비자 티어 아님
});

/** 모르는 값은 0(무료)으로 읽는다 — 오타가 권한을 열어주면 안 된다. */
export function tierRank(tier) {
  const r = TIER_RANK[String(tier || '').toLowerCase()];
  return Number.isInteger(r) ? r : 0;
}

/** 사용자 티어가 요구 티어 이상인가. 위 티어는 아래를 전부 포함한다. */
export function tierAtLeast(userTier, requiredTier) {
  return tierRank(userTier) >= tierRank(requiredTier);
}

/** 서버가 준 값을 **현재 등급 이름 셋 중 하나**로 바꾼다.
    ⚠️⚠️ 이게 없으면 레거시 'paid' 구독자가 화면에서 "무료"로 보인다 —
       권한은 사다리가 지켜주는데 표시만 틀리는, 제일 찾기 어려운 종류의 버그다.
    ⚠️ 모르는 값은 free 로 떨어뜨린다. 표시를 위해 권한을 지어내지 않는다. */
export function normalizeTier(tier) {
  const rank = tierRank(tier);
  if (rank >= tierRank(TIER.INTELLIGENCE)) return TIER.INTELLIGENCE;
  if (rank >= tierRank(TIER.EXPLORER)) return TIER.EXPLORER;
  return TIER.FREE;
}

/* ⚠️ requiredTier 를 주면 사다리로 판정하고, 안 주면 예전처럼 paidEntitled 불리언으로 판정한다.
   기존 호출부를 한꺼번에 고치지 않아도 되게 두 방식을 함께 받는다. */
export function decideCapabilityAccess({ mode, available = true, paidEntitled = false,
  alwaysFree = false, userTier = null, requiredTier = null } = {}) {
  if (available !== true) return Object.freeze({ allowed: false, reason: 'CAPABILITY_NOT_AVAILABLE' });
  if (alwaysFree === true) return Object.freeze({ allowed: true, reason: 'ALWAYS_FREE' });
  if (isFreeOpenMode(mode)) {
    return Object.freeze({ allowed: true, reason: 'FREE_OPEN_UNTIL_PAID_LAUNCH' });
  }
  if (requiredTier) {
    const ok = tierAtLeast(userTier, requiredTier);
    return Object.freeze({ allowed: ok, requiredTier,
      reason: ok ? 'TIER_OK' : `REQUIRES_${String(requiredTier).toUpperCase()}` });
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
