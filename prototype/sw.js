/* earthus 서비스워커
 *
 * 목적 둘:
 *   1) 홈 화면에 설치 가능하게 (manifest + 아이콘 + fetch 핸들러)
 *   2) **배포가 재접속 한 번에 반드시 반영되게** — 앱 코드(html·js·css)를
 *      브라우저 HTTP 캐시에 맡기면, 옛 파일이 max-age 안이나 휴리스틱 캐시로
 *      계속 나와 "폰에만 옛 화면이 남는" stale 버그가 된다.
 *      (실제로 배너가 옛 위치(하단)에 남는 문제가 이거였다.)
 *
 * 방식:
 *   · html·js·css(같은 출처)는 **network-first + cache:'reload'** 로 다룬다.
 *     cache:'reload' 는 브라우저 HTTP 캐시를 건너뛰고 네트워크에서 새로 받는다 →
 *     배포한 최신 코드가 항상 온다. 네트워크가 죽었을 때만 캐시로 폴백한다.
 *   · 데이터 JSON·타일·CDN 은 손대지 않고 통과시킨다 (여기서 캐시하면 용량만 는다).
 */

const CACHE = 'earthus-shell-2026-07-28c';
const SHELL = ['./index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;   // CDN·NASA 타일·외부 API 는 통과

  // 앱 코드(화면·스크립트·스타일)만 다룬다. 데이터 JSON 등은 통과.
  const dest = req.destination;
  const isAppCode = req.mode === 'navigate'
    || dest === 'document' || dest === 'script' || dest === 'style';
  if (!isAppCode) return;

  e.respondWith(
    /* cache:'no-cache' — 쓸 때마다 서버에 조건부로 확인한다(If-None-Match).
       바뀌었으면 새로 받고, 안 바뀌었으면 304(작음)로 캐시를 쓴다.
       → 옛 코드가 남지 않으면서(항상 최신) 매번 전체 재다운로드도 안 한다. */
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(
        (r) => r || caches.match('./index.html', { ignoreSearch: true })))
  );
});
