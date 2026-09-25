// EARTHUS 제품·플랫폼 대상 정본
//
//   WEB    = EARTHUS + AETHERUS
//   MOBILE = EARTHUS + AETHERUS
//   PLEOS  = EARTHUS ONLY
//
// Pleos 에서 AETHERUS 를 "숨기는" 것으로 끝내지 않는다. Pleos 진입점(prototype/pleos.html)의
// 모듈 그래프에는 js/space/·AETHERUS 모듈이 아예 들어가지 않는다. 이 사실은
// tools/test_pleos_product_separation.mjs 가 import 그래프를 직접 따라가 검사한다.
//
// ⚠️ 이 파일에는 제품 이름을 문자열 상수로만 둔다. AETHERUS 쪽 모듈을 import 하지 않는다.

export const PRODUCT_TARGET_VERSION = 'earthus.product-target.v1.0.0';

export const PRODUCT = Object.freeze({ EARTHUS: 'EARTHUS', AETHERUS: 'AETHERUS' });
export const PLATFORM = Object.freeze({ WEB: 'WEB', MOBILE: 'MOBILE', PLEOS: 'PLEOS' });

const ALLOWED = Object.freeze({
  EARTHUS: Object.freeze(['WEB', 'MOBILE', 'PLEOS']),
  AETHERUS: Object.freeze(['WEB', 'MOBILE']),
});

export function isTargetAllowed(product, platform) {
  return Object.prototype.hasOwnProperty.call(ALLOWED, product) && ALLOWED[product].includes(platform);
}

/** 허용되지 않은 조합(AETHERUS+PLEOS 포함)과 모르는 값은 모두 거절한다. */
export function assertProductTarget(product, platform) {
  if (!isTargetAllowed(product, platform)) throw new Error(`INVALID_PRODUCT_TARGET:${product}:${platform}`);
  return true;
}

export function createTarget(product, platform) {
  assertProductTarget(product, platform);
  return Object.freeze({ product, platform });
}

export function targetMatrix() {
  const out = {};
  for (const product of Object.values(PRODUCT)) {
    out[product] = {};
    for (const platform of Object.values(PLATFORM)) out[product][platform] = isTargetAllowed(product, platform);
  }
  return out;
}

// Pleos 등록 규칙. 실제 저장소의 AETHERUS 경계는 다음과 같다 (docs/pleos/SOURCE_SURVEY.md §2).
//   - 모듈: prototype/js/space/*, js/aetherus-*.js, prototype/data/aetherus/*, prototype/space/*
//   - URL 키: aetherus, space, solar, target, photo, telescope, craft, observer, precision, plan
//   - 분석 이벤트: aetherus.* (analytics-contract.js)
//   - 화면 이벤트: aetherus:route, aetherus:photo, aetherus:state
export const PLEOS_POLICY = Object.freeze({
  target: Object.freeze({ product: PRODUCT.EARTHUS, platform: PLATFORM.PLEOS }),
  excludedModulePrefixes: Object.freeze(['js/space/', 'js/aetherus-', 'data/aetherus/', 'space/']),
  excludedRouteKeys: Object.freeze(['aetherus', 'space', 'solar', 'target', 'photo', 'telescope', 'craft', 'observer', 'precision', 'plan']),
  excludedAnalyticsPrefixes: Object.freeze(['aetherus.', 'space.']),
  excludedEventPrefixes: Object.freeze(['aetherus:']),
});

/** Pleos 에 무언가를 등록하기 직전에 부른다. 걸리면 던진다. */
export function assertPleosRegistration({ module, routeKey, analyticsEvent, domEvent } = {}) {
  const p = PLEOS_POLICY;
  const norm = value => String(value).replace(/^\.?\/?(prototype\/)?/, '');
  if (module && p.excludedModulePrefixes.some(prefix => norm(module).startsWith(prefix))) {
    throw new Error(`PLEOS_MODULE_REJECTED:${module}`);
  }
  if (routeKey && p.excludedRouteKeys.includes(String(routeKey))) {
    throw new Error(`PLEOS_ROUTE_REJECTED:${routeKey}`);
  }
  if (analyticsEvent && p.excludedAnalyticsPrefixes.some(prefix => String(analyticsEvent).startsWith(prefix))) {
    throw new Error(`PLEOS_ANALYTICS_REJECTED:${analyticsEvent}`);
  }
  if (domEvent && p.excludedEventPrefixes.some(prefix => String(domEvent).startsWith(prefix))) {
    throw new Error(`PLEOS_EVENT_REJECTED:${domEvent}`);
  }
  return true;
}

/** Pleos 진입 URL 에 AETHERUS 딥링크 키가 있으면 거절 사유를 돌려준다. */
export function rejectedPleosRouteKeys(search) {
  const params = new URLSearchParams(search || '');
  return PLEOS_POLICY.excludedRouteKeys.filter(key => params.has(key));
}
