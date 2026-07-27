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
  monthly: { id: 'earthus.pro.monthly', krw: 4900,  usd: 3.99,  period: 'month' },
  yearly:  { id: 'earthus.pro.yearly',  krw: 39000, usd: 29.99, period: 'year'  },
};

export const PLANS = { ...DEFAULT_PLANS, ...(CONFIG.PLANS || {}) };

/* 구독하면 열리는 것.
   ⚠️ 레이어를 넣지 않는다. 전부 무료다 (config.js 의 티어 판단 참고).
      여기 들어갈 자격은 "사용자당 계산이 실제로 드는가" 또는
      "우리만 가진 것인가" 둘 중 하나다. */
export const PAID_FEATURES = [
  { ko: '되감기 · 이력 — 지난 며칠의 지구를 다시 본다',
    en: 'Rewind & history — replay the past days of Earth' },
  { ko: '내 위치 위성 통과 예보 + 알람',
    en: 'Satellite passes over my location, with alarms' },
  { ko: '관심 지역 지진 · 이벤트 알림',
    en: 'Quake & event alerts for places I care about' },
  { ko: '위성 전체 16,000개 · 스타링크',
    en: 'All 16,000 satellites, including Starlink' },
  { ko: '궤도 추적선 · 위성 용도 상세',
    en: 'Orbit tracks & per-satellite mission detail' },
];

/* 무료로 유지되는 것 — 유료 안내에서 이것도 같이 보여준다.
   ⚠️ "뭘 빼앗기는지"가 아니라 "뭐가 그대로인지"를 알아야 판단이 된다.
      그리고 이 목록이 짧으면 유료가 인질처럼 보인다. 실제로 무료가 더 길다. */
export const FREE_FEATURES = [
  { ko: '모든 레이어 — 구름·기온·바람·태풍·지진·산불·쓰나미·화산·위성·발사·오로라·부이',
    en: 'Every layer — clouds, temp, wind, cyclones, quakes, wildfires, tsunami, volcanoes, satellites, launches, aurora, buoys' },
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
  ko: '지구를 보는 데 필요한 데이터는 전부 무료입니다. 다른 곳에서도 공개된 자료를 결제 뒤에 숨기지 않습니다. 구독은 저희가 사용자마다 따로 계산해야 하는 것(통과 예보·알림)과, 저희만 쌓고 있는 것(이력)에만 해당합니다.',
  en: 'Everything you need to watch the Earth is free. We do not paywall data that is public elsewhere. Subscription covers what we must compute per user (pass predictions, alerts) and what only we accumulate (history).',
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
    /* PG 결제창 URL 은 서버가 주문번호와 함께 만들어야 한다.
       클라이언트가 금액을 정해 보내면 위변조가 가능하기 때문이다.
       CONFIG.CHECKOUT_URL 이 그 서버 엔드포인트다. */
    available: () => !!CONFIG.CHECKOUT_URL,
    start: async plan => {
      const r = await fetch(CONFIG.CHECKOUT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, userId: auth.user?.id || null }),
      });
      if (!r.ok) throw new Error('checkout ' + r.status);
      const { url } = await r.json();
      if (!url) throw new Error('NO_CHECKOUT_URL');
      window.location.href = url;      // PG 결제창으로 이동 — 카드 정보는 그쪽에서 받는다
    },
  },
};

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

  /* 구독 상태는 서버(profiles.tier)가 정본이다.
     ⚠️ 클라이언트가 스스로 'paid' 로 바꿀 수 있으면 결제를 우회할 수 있다.
        영수증 검증은 서버(Supabase Edge Function)가 하고, 앱은 결과만 읽는다. */
  isPaid() { return auth.isPaid(); },
};
