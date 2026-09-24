/* EARTHUS v2 — 옛 /v2/ 서비스워커를 스스로 걷어내는 kill-switch (2026-09-24, 지시서 D16 · verify-feasibility #4)
 *
 * ⚠️⚠️ 이 파일은 **아무것도 캐시하지 않는다. fetch 처리기도 없다.** 등록하는 코드도 없다(v2 HTML 은 SW 를 등록하지 않는다).
 *
 * 왜 있나
 *   운영 https://earthus.net/v2/sw.js 에 저장소에 원본이 없는 옛 서비스워커(13,239 B, 캐시 'earthus-v2-2026-08-28-device1',
 *   importScripts('./seo-geo-sw-routes.js'))가 남아 있었다. 예전에 이것을 등록한 기기에서는 아직 /v2/ 범위를 쥐고
 *   옛 v2 문서를 캐시로 내줄 수 있다 — v1 sw.js 머리의 "폰에만 옛 화면이 남는" 사고와 같은 종류다.
 *   안드로이드 앱(TWA)은 Chrome 과 서비스워커·저장소를 공유하므로 앱 안에서도 같은 일이 난다.
 *
 * 어떻게 걷히나
 *   옛 등록이 있는 기기가 /v2/ 를 열면 브라우저가 이 주소를 다시 받아 본다(갱신 확인). 내용이 달라졌으니
 *   이 워커가 설치되고(skipWaiting) → 활성화되면서 옛 v2 캐시를 지우고 → 자기 등록을 푼다.
 *   다음 방문부터 /v2/ 는 서비스워커 없이(= v1 루트 워커의 오프라인 안내만) 네트워크에서 온다.
 *
 * ⚠️ 지우는 것은 이름이 'earthus-v2-' 로 시작하는 캐시뿐이다 — 옛 워커의 V2_CACHE_PREFIX 그대로다.
 *    v1 캐시('earthus-shell-*')는 같은 CacheStorage 에 있지만 **절대 건드리지 않는다**(옛 워커 머리 주석:
 *    "V2와 production은 CacheStorage를 공유한다. V1 cache를 열거나 지우지 않는다.").
 * ⚠️ 열린 탭을 강제로 새로고침하지 않는다 — 보고 있던 화면을 날리지 않는다. fetch 처리기가 없으니
 *    이 워커가 붙은 동안에도 요청은 그대로 네트워크로 간다.
 * ⚠️ 옛 워커로 받은 푸시 구독이 /v2/ 등록에 붙어 있었다면 등록을 풀 때 함께 사라진다. 푸시는 v1 루트 워커가
 *    맡는다(push.js) — 서버는 사라진 구독에 보내면 410 을 받아 정리한다.
 */
const OLD_V2_CACHE_PREFIX = 'earthus-v2-';

self.addEventListener('install', () => {
  // 옛 워커가 열린 탭을 쥐고 있어도 기다리지 않는다(옛 워커도 skipWaiting 이었다).
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter((key) => key.startsWith(OLD_V2_CACHE_PREFIX))
        .map((key) => caches.delete(key)));
    } catch (_) { /* 캐시를 못 지워도 등록은 푼다 — 등록이 없으면 옛 캐시는 쓰이지 않는다 */ }
    try { await self.registration.unregister(); } catch (_) { /* 다음 갱신 확인 때 다시 시도된다 */ }
  })());
});
