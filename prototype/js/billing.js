// 구독 — 요금제 정의 + 결제 연결 지점
//
// ⚠️ 이 파일은 결제를 "처리"하지 않는다. 처리하면 안 된다.
//    카드번호·계좌번호를 우리 화면에서 받는 순간 PCI-DSS 대상이 되고,
//    앱스토어 규정도 위반한다. 결제는 반드시 아래 셋 중 하나로 넘긴다:
//
//      iOS 앱   → Apple In-App Purchase   (App Store 규정 3.1.1 — 디지털 구독은 IAP 필수)
//      안드로이드 → Google Play Billing     (Play 결제 정책 동일)
//      웹        → PG 사의 결제창으로 리다이렉트 (토스페이먼츠 / 아임포트 / Stripe)
//                  우리 페이지에서 카드 정보를 받지 않는다.
//
//    지금은 PG 계약이 없다. 없는 걸 있는 척하지 않는다 —
//    "결제 준비 중"을 분명히 알리고 사전등록으로 안내한다.
//    계약이 끝나면 PROVIDERS 에 어댑터 하나만 채우면 된다.

import { auth } from './auth.js';
import { CONFIG } from './config.local.js';
import { i18n } from './i18n.js';

/* ── 요금제 ────────────────────────────────────────────────────
   ⚠️ 가격은 config.local.js 에서 덮어쓸 수 있게 둔다.
      PG·앱스토어에 등록한 실제 상품 가격과 어긋나면 안 되기 때문이다. */
const DEFAULT_PLANS = {
  monthly:  { id: 'earthus.pro.monthly',  krw: 3900,  usd: 2.99,  period: 'month' },
  yearly:   { id: 'earthus.pro.yearly',   krw: 29000, usd: 21.99, period: 'year'  },
  /* 창립회원 — **수량 제한 상품**이다 (500명).
     ⚠️ 좌석이 남았는지는 서버만 안다. 클라이언트가 세면 동시에 결제한 사람을 못 막는다.
        화면 표시는 참고용이고, 실제 차단은 checkout Edge Function 이 한다. */
  founding: { id: 'earthus.founding.500', krw: 19000, usd: 14.99, period: 'year',
              seats: 500, foundingOnly: true },
};

/* ⚠️⚠️ 여기 값은 **화면 표시용**이다. 결제 금액의 정본은 서버(plans 테이블)다.
      브라우저에서 이 숫자를 고쳐도 결제 금액은 바뀌지 않는다 —
      checkout 함수가 planId 만 받고 금액은 DB 에서 찾기 때문이다. */
export const PLANS = { ...DEFAULT_PLANS, ...(CONFIG.PLANS || {}) };

/* 구독하면 열리는 것.
   ⚠️ 레이어를 넣지 않는다. 전부 무료다 (config.js 의 티어 판단 참고).
      여기 들어갈 자격은 "사용자당 계산이 실제로 드는가" 또는
      "우리만 가진 것인가" 둘 중 하나다. */
/* ⚠️⚠️ **아직 동작하지 않는 것에 soon:true 를 붙인다.**
   예전 이 목록은 "지진 알림"을 팔고 있었는데 **웹푸시 서버가 없어서 알림이 안 갔다.**
   돈을 받고 못 주는 것보다 나쁜 건 없다. 화면은 soon 인 항목을 "준비 중"으로 표시하고,
   준비 중인 것만 남으면 결제 버튼 자체를 내린다.

   경계를 가르는 기준 — **"요약이냐 상세냐"가 아니다.**
   출처·표본수(n)·기준·한계는 **전부 무료**다. 그게 이 앱의 신뢰이고,
   그걸 가리면 무료 사용자에게는 근거 없는 단정만 남는다.
   유료가 되는 것은 셋뿐이다:
     ① 시간  — 우리만 쌓고 있는 과거 (저장 비용이 실제로 든다)
     ② 나    — 사용자마다 따로 계산해야 하는 것
     ③ 양    — 여러 곳을 동시에 지켜보는 것 */
export const PAID_FEATURES = [
  { ko: '되감기 · 이력 — 지난 며칠의 지구를 다시 본다',
    en: 'Rewind & history — replay the past days of Earth' },
  { ko: '내 지점 기록 — 이 해변·이 산의 지난 30일과 작년 같은 날',
    en: 'My spot over time — last 30 days and the same date last year' },
  { ko: '여러 곳 동시 감시 — 관심 지점 20곳까지',
    en: 'Watch up to 20 places at once' },
  { ko: '위성 전체 16,000개 · 스타링크',
    en: 'All 16,000 satellites, including Starlink' },
  { ko: '궤도 추적선 · 위성 용도 상세',
    en: 'Orbit tracks & per-satellite mission detail' },
  { ko: '내 위치 위성 통과 예보', en: 'Satellite passes over my location' },
  // ⚠️ 아래 둘은 **웹푸시 서버가 아직 없다.** 만들기 전까지 팔지 않는다.
  { ko: '관심 지역 지진 · 이벤트 알림',
    en: 'Quake & event alerts for places I care about', soon: true },
  { ko: '이안류 · 특보 알림', en: 'Rip-current and warning alerts', soon: true },
];

/* 무료로 유지되는 것 — 유료 안내에서 이것도 같이 보여준다.
   ⚠️ "뭘 빼앗기는지"가 아니라 "뭐가 그대로인지"를 알아야 판단이 된다.
      그리고 이 목록이 짧으면 유료가 인질처럼 보인다. 실제로 무료가 더 길다. */
export const FREE_FEATURES = [
  { ko: '모든 레이어 — 구름·기온·바람·태풍·지진·산불·쓰나미·화산·낙뢰·위성·발사·오로라·부이',
    en: 'Every layer — clouds, temp, wind, cyclones, quakes, wildfires, tsunami, volcanoes, lightning, satellites, launches, aurora, buoys' },
  /* ⚠️⚠️ **안전 정보는 영원히 무료다.** 이건 요금제 문제가 아니라 원칙이다.
     특보·지진·쓰나미·이안류 위험·낙뢰 위치를 결제 뒤에 두면 사람이 다칠 수 있다.
     이 줄을 지우자는 제안이 나오면 그때도 지우지 않는다. */
  { ko: '⚠️ 안전 정보는 언제나 무료 — 특보·지진·쓰나미·이안류 위험·낙뢰',
    en: '⚠️ Safety information is always free — warnings, quakes, tsunami, rip currents, lightning' },
  { ko: '출처 · 관측 지점 수 · 판단 기준 · 한계 — 전부 공개',
    en: 'Sources, sample sizes, thresholds and limits — all shown' },
  { ko: '이벤트 뉴스 교차검증 — 신뢰도 점수와 근거까지',
    en: 'Cross-verified event news, with scores and reasoning' },
  { ko: '일본 지진 기상청 대조 — 진앙 차이까지 공개',
    en: 'JMA cross-check for Japanese quakes, epicenter differences shown' },
  { ko: '3D 자연현상 학습 · 일식 · 유성우',
    en: '3D phenomena lessons, eclipses, meteor showers' },
  { ko: '내 항공편 추적 · 항공권 검색',
    en: 'Track my flight, flight search' },
];

/* 왜 이렇게 갈랐는지 사용자에게도 밝힌다.
   ⚠️ "유료가 더 좋다"가 아니라 "무료로 줄 수 있는 건 다 준다"가 우리 입장이다. */
export const TIER_RATIONALE = {
  ko: '지금 지구에서 무슨 일이 일어나고 있는지, 그리고 그걸 저희가 어떻게 아는지(출처·관측 지점 수·판단 기준·한계)는 전부 무료입니다. 다른 곳에서도 공개된 자료를 결제 뒤에 숨기지 않고, 안전에 관한 정보는 어떤 경우에도 유료로 돌리지 않습니다.\n구독은 셋에만 해당합니다 — 저희만 쌓고 있는 과거(이력), 사용자마다 따로 계산해야 하는 것(내 지점·통과 예보), 여러 곳을 동시에 지켜보는 것.',
  en: 'What is happening right now — and how we know it (sources, sample sizes, thresholds, limits) — is free. We do not paywall data that is public elsewhere, and safety information is never behind payment. Subscription covers only three things: the past that only we accumulate, what we must compute per user, and watching many places at once.',
};

/* ── 결제 제공자 어댑터 ────────────────────────────────────────
   available() 가 true 인 것 중 플랫폼에 맞는 것을 고른다.
   계약이 끝나면 start() 안만 채우면 나머지 화면은 그대로 동작한다. */
const PROVIDERS = {
  apple: {
    ko: 'App Store', en: 'App Store',
    // 웹에서는 IAP 를 쓸 수 없다. 네이티브 래퍼가 이 브리지를 심어준다.
    available: () => typeof window.webkit?.messageHandlers?.iap !== 'undefined',
    start: plan => window.webkit.messageHandlers.iap.postMessage({ productId: plan.id }),
  },
  google: {
    ko: 'Google Play', en: 'Google Play',
    available: () => typeof window.AndroidBilling?.purchase === 'function',
    start: plan => window.AndroidBilling.purchase(plan.id),
  },
  web: {
    ko: '카드 · 간편결제', en: 'Card / wallet',
    /* PG 결제창은 서버가 만든 주문번호로 연다.
       ⚠️ 클라이언트가 금액을 정해 보내면 위변조가 가능하다 —
          그래서 우리가 서버에 보내는 것은 **planId 뿐**이고, 금액은 서버가 정한다.
       CONFIG.CHECKOUT_URL 이 그 서버 엔드포인트(Supabase Edge Function)다. */
    available: () => !!CONFIG.CHECKOUT_URL,
    start: async (plan) => {
      // ⚠️ 로그인 토큰을 반드시 보낸다. 없으면 서버가 누구의 주문인지 모른다.
      const token = await auth.accessToken?.();
      if (!token) throw new Error('NOT_SIGNED_IN');

      const r = await fetch(CONFIG.CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ planId: plan.id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        // 서버가 이유를 준다 — 삼켜서 "실패"로 뭉뚱그리지 않는다.
        throw new Error(j.error || `checkout ${r.status}`);
      }

      await loadToss();
      /* ⚠️⚠️ 이 호출부가 **토스 SDK 버전에 따라 바뀌는 유일한 곳**이다.
         아래는 v1 표준 결제창 형식이다. 가맹점 키를 받으면 그때 문서와 대조하고,
         바뀌었으면 **여기 한 곳만** 고치면 된다 — 나머지(주문·승인·권한)는 그대로다.
         ⚠️ 카드 정보는 토스 화면에서 받는다. 우리 페이지는 절대 받지 않는다. */
      const toss = window.TossPayments(j.clientKey);
      await toss.requestPayment('카드', {
        amount: j.amount,
        orderId: j.orderId,
        orderName: j.orderName,
        customerEmail: j.customerEmail,
        successUrl: j.successUrl,
        failUrl: j.failUrl,
      });
    },
  },
};

/** 토스 결제 SDK 를 필요할 때만 불러온다.
 *  ⚠️ 처음부터 넣으면 결제할 생각이 없는 사람에게도 외부 스크립트가 붙는다.
 *     (개인정보 최소수집 원칙과 첫 화면 속도 둘 다에 걸린다) */
let _tossLoading = null;
function loadToss() {
  if (window.TossPayments) return Promise.resolve();
  if (_tossLoading) return _tossLoading;
  _tossLoading = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = 'https://js.tosspayments.com/v1/payment';
    s.onload = ok;
    // ⚠️ 실패를 조용히 넘기면 버튼이 아무 반응 없는 것처럼 보인다.
    s.onerror = () => { _tossLoading = null; no(new Error('PG_SDK_BLOCKED')); };
    document.head.appendChild(s);
  });
  return _tossLoading;
}

export const billing = {
  /** 지금 이 기기에서 쓸 수 있는 결제 수단. 없으면 빈 배열. */
  providers() {
    return Object.entries(PROVIDERS)
      .filter(([, p]) => { try { return p.available(); } catch { return false; } })
      .map(([k, p]) => ({ key: k, ...p }));
  },

  ready() { return this.providers().length > 0; },

  price(planKey) {
    const p = PLANS[planKey];
    if (!p) return '—';
    const ko = i18n.lang === 'ko';
    return ko
      ? `₩${p.krw.toLocaleString()}`
      : `$${p.usd.toFixed(2)}`;
  },

  /** 연간 구독이 월간 대비 몇 % 싼가 — 계산해서 보여준다 (반올림해 부풀리지 않는다) */
  yearlySavingPct() {
    const m = PLANS.monthly, y = PLANS.yearly;
    if (!m || !y) return 0;
    return Math.floor((1 - y.krw / (m.krw * 12)) * 100);
  },

  /**
   * 구독 시작. 성공하면 결제창으로 넘어간다.
   * @throws {Error} 'NOT_AVAILABLE' — 결제 수단이 아직 연결되지 않음
   */
  async subscribe(planKey, providerKey) {
    const plan = PLANS[planKey];
    if (!plan) throw new Error('UNKNOWN_PLAN');
    const list = this.providers();
    const prov = providerKey ? list.find(p => p.key === providerKey) : list[0];
    if (!prov) throw new Error('NOT_AVAILABLE');
    return PROVIDERS[prov.key].start(plan);
  },

  /* 창립회원 남은 자리. ⚠️ 못 세면 0 이 아니라 **null** 이다 —
     0 으로 두면 "마감"으로 읽혀서 팔 수 있는 걸 못 판다. */
  async seatsLeft(planKey = 'founding') {
    const plan = PLANS[planKey];
    if (!plan?.seats || !auth.client) return null;
    try {
      const { data, error } = await auth.client.rpc('plan_seats_left', { p_plan_id: plan.id });
      return error ? null : (typeof data === 'number' ? data : null);
    } catch { return null; }
  },

  /**
   * 결제창에서 돌아온 뒤의 **승인**. pay-return.html 이 부른다.
   * ⚠️⚠️ 이 함수는 금액을 보내지 않는다. 서버가 DB 에서 찾는다 —
   *    주소창의 amount 를 그대로 승인에 쓰면 39원 결제가 통과한다.
   * ⚠️ 두 번 불려도 안전하다 (서버가 멱등).
   */
  async confirm({ paymentKey, orderId }) {
    if (!CONFIG.CONFIRM_URL) throw new Error('NOT_CONFIGURED');
    const token = await auth.accessToken?.();
    if (!token) throw new Error('NOT_SIGNED_IN');
    const r = await fetch(CONFIG.CONFIRM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ paymentKey, orderId }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || `confirm ${r.status}`), { detail: j });
    // 서버가 바꾼 값을 다시 읽는다 — 화면이 스스로 'paid' 라고 우기지 않는다.
    await auth.refresh?.();
    return j;
  },

  /* 구독 상태는 서버(profiles.tier)가 정본이다.
     ⚠️ 클라이언트가 스스로 'paid' 로 바꿀 수 있으면 결제를 우회할 수 있다.
        영수증 검증은 서버(Supabase Edge Function)가 하고, 앱은 결과만 읽는다. */
  isPaid() { return auth.isPaid(); },
};
