// EARTHUS Pleos — 실행 대상 고정
//
// Pleos 실행 코드는 EARTHUS+PLEOS 하나만 안다. 다른 제품의 이름·경로·이벤트를 이 그래프에 넣지 않기 위해
// 거절 목록(denylist)이 아니라 허용 목록(allowlist)으로 막는다. 허용하지 않은 URL 키가 하나라도 있으면 열지 않는다.
// 제품 조합 전체 표와 등록 거절 규칙은 prototype/js/product-target.js (웹·모바일·도구용)에 있다.

export const PLEOS_TARGET = Object.freeze({ product: 'EARTHUS', platform: 'PLEOS' });

// 지금 Pleos 화면이 받는 URL 키는 없다. 늘릴 때는 이 목록에 이유와 함께 추가한다.
export const PLEOS_ALLOWED_QUERY_KEYS = Object.freeze([]);

export function assertPleosTarget(product = PLEOS_TARGET.product, platform = PLEOS_TARGET.platform) {
  if (product !== PLEOS_TARGET.product || platform !== PLEOS_TARGET.platform) {
    throw new Error(`PLEOS_TARGET_REJECTED:${product}:${platform}`);
  }
  return PLEOS_TARGET;
}

/** 허용하지 않은 URL 키 목록. 비어 있어야 화면을 연다. */
export function rejectedQueryKeys(search) {
  const keys = [...new URLSearchParams(search || '').keys()];
  return [...new Set(keys.filter(key => !PLEOS_ALLOWED_QUERY_KEYS.includes(key)))];
}
