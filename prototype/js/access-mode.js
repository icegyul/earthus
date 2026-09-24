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

/* ── 요금제 사다리 — 정본은 docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md (v5.3 §1.4 를 대체) ──
   FREE             — SEE THE EARTH        : 지금 지구를 본다
   EXPLORER         — UNDERSTAND THE EARTH : 이해하고 분석하고 보고서를 만든다 (고급 Intelligence · REPORT)
   PRO              — SIMULATE THE EARTH   : 조건을 바꾸어 시뮬레이션한다 (SCENARIO · SIMULATION)
   ⚠️ 셋째 단의 **id 는 그대로 'intelligence'** 다(과금 id·billing.sql). 화면 이름만 PRO 다.
   ⚠️ 09-02 에 뗀 'EXPLORER PRO / INTELLIGENCE PRO' 접미사는 다시 쓰지 않는다.

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

/* ── 판매 개시 조건 (2026-09-24 추가 — docs/PAID-APP-LAUNCH-REVIEW-2026-09-24.md §1-5 · §4 · §00-4) ──
   ⚠️ 예전 판매 스위치(billing.js · ui-subscribe.js)는 Open-Meteo·GVP 두 값만 봤다.
      점검 보고서가 찾은 나머지 관문(기상예보업 등록 · Esri 인증 · Gemini 연령 조항 · 에코뱅크 · 지역 뉴스 RSS ·
      v2 서버 등급 판정 · Play 결제)은 SALES_OPEN 하나만 켜면 그대로 지나갈 수 있었다.
   ⚠️ 여기 목록이 **정본 하나**다. billing.js(결제 시작)와 ui-subscribe.js(결제 단추)가 같은 목록을 읽는다 —
      두 곳에 따로 적으면 한쪽만 고쳐지는 날이 온다.
   ⚠️ 값은 config.local.js 의 **PD 선언**이다. 이 코드는 아무것도 검증하지 않는다 — true 로 바꾸기 전에
      reason 에 적은 일이 실제로 끝났는지 사람이 확인한다. 서버 쪽 최종 관문은 checkout 함수의 SALES_ENABLED 다.
   ⚠️ 운영 config.local.js 에 값이 없으면(undefined) **막힌 것**으로 읽는다(=== true 만 통과). 오타도 막힌다.
   ⚠️ 기상청 서면 질의는 조건에 넣지 않았다 — 2026-09-24 PD: 질의를 보내지 않는다(AGENTS.md). */
export const SALES_PRECONDITIONS = Object.freeze([
  Object.freeze({ key: 'WEATHER_BUSINESS_REGISTERED', ref: 'L1',
    ko: '기상예보업 등록 — 기상산업진흥법 제6조(상근 기상예보사 1명). 등록 전 유료 예보·확률은 미등록 사업',
    en: 'Weather forecasting business registration (Meteorological Industry Promotion Act art. 6)' }),
  Object.freeze({ key: 'OPEN_METEO_COMMERCIAL_READY', ref: 'D1',
    ko: 'Open-Meteo 상업 이용 — 유료 키(customer-api)·셀프호스팅 전환 또는 GFS·ECMWF 로 대체 완료. 무료 API 는 비상업 전용',
    en: 'Open-Meteo commercial route (paid key, self-hosted, or replaced) — the free API is non-commercial' }),
  Object.freeze({ key: 'ESRI_AUTH_TILES_READY', ref: 'D2',
    ko: 'Esri 타일 인증 — ArcGIS Location Platform 키로 전환(또는 대체)하고 "Powered by Esri"·제공자 표기',
    en: 'Esri tiles authenticated (ArcGIS Location Platform key) or replaced, with attribution' }),
  Object.freeze({ key: 'GVP_COMMERCIAL_READY', ref: 'D6',
    ko: '스미소니언 GVP — 상업 이용 서면 허가 또는 유료 화면에서 주간 화산 보고 제외',
    en: 'Smithsonian GVP commercial permission, or weekly reports removed from paid screens' }),
  Object.freeze({ key: 'GEMINI_AGE_CLAUSE_RESOLVED', ref: 'D4',
    ko: 'Gemini 18세 조항 — 성인 확인 계정에만 열기 · 다른 LLM 경로 · 가입 연령 상향 중 하나를 적용(변호사 확인)',
    en: 'Gemini under-18 clause resolved (adult-only, another LLM route, or raised sign-up age)' }),
  Object.freeze({ key: 'ECOBANK_CLEARED', ref: 'D13',
    ko: '국립생태원 에코뱅크 — 서면 확인(제3자 권리 포함) 또는 유료 앱에서 제외',
    en: 'NIE EcoBank written clearance, or removed from the paid app' }),
  Object.freeze({ key: 'NEWS_RSS_CLEARED', ref: 'D12',
    ko: '지역 뉴스 RSS — 매체별 이용 조건 확인(RNZ "personal use only" 포함)',
    en: 'Regional news RSS terms cleared per outlet (incl. RNZ personal-use-only)' }),
  Object.freeze({ key: 'V2_SERVER_TIER_LIVE', ref: '§3-5-1',
    ko: 'v2 등급 서버 판정 운영 — 지금 v2 는 브라우저 localStorage 등급을 믿는다',
    en: 'Server-side v2 tier check live (v2 currently trusts client localStorage)' }),
  Object.freeze({ key: 'PLAY_BILLING_LIVE', ref: 'P4',
    ko: 'Google Play 결제 운영 — 선불형 상품 · 서버 영수증 검증 · 3일 안 확인(acknowledge) · 환불 시 권한 회수',
    en: 'Google Play billing live (prepaid products, server receipt check, acknowledge within 3 days, revoke on refund)' }),
]);

/** 아직 true 가 아닌 판매 조건들. 빈 배열이면 조건은 모두 찼다.
    ⚠️ config 가 없거나 값이 true 가 아니면 막힌 것으로 센다(fail-closed). */
export function salesPreconditionsBlocking(config) {
  const c = config && typeof config === 'object' ? config : {};
  return SALES_PRECONDITIONS.filter(p => c[p.key] !== true);
}

/** 판매를 실제로 열어도 되는가 — salesAllowed(모드·SALES_OPEN) 와 조건 목록을 **둘 다** 본다.
    { ready, salesOpen, blocking } — salesOpen 은 모드·스위치만 본 값(막힌 이유를 적을지 가를 때 쓴다). */
export function salesReadiness({ mode, salesOpen, config } = {}) {
  const open = salesAllowed({ mode, salesOpen });
  const blocking = salesPreconditionsBlocking(config);
  return Object.freeze({ ready: open && blocking.length === 0, salesOpen: open,
    blocking: Object.freeze(blocking.map(p => p.key)) });
}

export function subscriptionUiAllowed({ mode, showSubscribe } = {}) {
  return normalizeMonetizationMode(mode) === MONETIZATION_MODE.PAID && showSubscribe === true;
}

/* 잠긴 기능 안내 — C3. "LOCKED" 한 마디로 끝내지 않는다.
   WHAT(무엇이 막혔나) · WHY(왜 막혔나 — 깊이 기능이라서) · WHAT EXPLORER ADDS(풀면 뭐가 깊어지나) ·
   UPGRADE(다음 손 — 지금은 사전등록, 판매가 열리면 구독 화면)를 한 묶음으로 준다.
   값은 만들지 않고 문구만 만든다 — 권한 판정은 decideCapabilityAccess·서버가 한다.
   FREE_OPEN 에서는 allowed:true 이므로 이 설명을 부르지 않는다. */
export function lockExplanation({ cap = '', requiredTier = null, reason = '', ko = true } = {}) {
  const need = String(requiredTier || TIER.EXPLORER).toLowerCase();
  // 화면 이름 — id 'intelligence' 의 이름은 PRO 다(정본 2026-09-14 §4). 판정 코드(reason)는 id 그대로 둔다.
  const tierName = need === TIER.INTELLIGENCE ? 'PRO' : 'EXPLORER';
  const what = ko ? `‘${cap || '이 기능'}’은 깊이 탐색 기능입니다` : `‘${cap || 'This feature'}’ is a depth feature`;
  const why = ko
    ? '지금 보는 화면(현재값·출처·안전)은 그대로 무료입니다 — 더 깊이 파고드는 분석이라서 막혀 있습니다'
    : 'The current view (present values, sources, safety) stays free — deeper analysis is gated';
  // ⚠️ EXPLORER 문구가 '더 긴 시뮬레이션 구간'을 약속하고 있었다 — 시뮬레이션은 PRO 다(정본 §3).
  const adds = need === TIER.INTELLIGENCE
    ? (ko ? `${tierName}가 열리면 조건을 바꾸는 시나리오와 검증된 시뮬레이션 계산을 같은 화면에서 돌립니다`
          : `${tierName} unlocks what-if scenarios and validated simulation runs in the same view`)
    : (ko ? `${tierName}가 열리면 평년 대비·함께 나타난 조건·연결·신뢰도 같은 깊은 분석과 리포트를 같은 화면에서 봅니다`
          : `${tierName} unlocks deeper analysis (anomaly, co-occurring conditions, links, confidence) and reports in the same view`);
  const upgrade = ko
    ? '지금은 사전등록으로 소식을 받으실 수 있습니다 — 판매가 열리면 구독 화면으로 안내합니다'
    : 'Register for launch news now — the subscribe screen opens once sales begin';
  return Object.freeze({
    allowed: false, reason: reason || `REQUIRES_${need.toUpperCase()}`, requiredTier: need, what, why, adds, upgrade,
  });
}
