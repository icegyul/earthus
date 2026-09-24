/* (2026-09-24) 빈 자리 채우개 — 옛 /v2/sw.js 가 importScripts('./seo-geo-sw-routes.js') 로 읽던 파일.
 *
 * 옛 워커는 저장소에 원본이 없고(지시서 D16), 이제 /v2/sw.js 는 스스로 등록을 푸는 kill-switch 다(같은 폴더 sw.js).
 * 이 파일을 남겨 두는 이유: 옛 워커가 아직 도는 기기에서 이 주소가 404 가 되면 옛 워커의 importScripts 가
 * 실패해 워커 시작이 깨질 수 있다. 안전하게 **빈 목록**만 둔다 — 이 값을 읽는 새 코드는 없다.
 * ⚠️ 이미 값이 있으면 덮지 않는다.
 */
self.EARTHUS_SEO_GEO_NON_CACHEABLE_PATHS = self.EARTHUS_SEO_GEO_NON_CACHEABLE_PATHS || [];
self.EARTHUS_SEO_GEO_NON_CACHEABLE_PREFIXES = self.EARTHUS_SEO_GEO_NON_CACHEABLE_PREFIXES || [];
self.EARTHUS_SEO_GEO_EXACT_DOCUMENT_PATHS = self.EARTHUS_SEO_GEO_EXACT_DOCUMENT_PATHS || [];
