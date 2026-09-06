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
 *   · 일반 데이터 JSON·타일·CDN 은 손대지 않고 통과시킨다. 단, 사용자가 현장 세션을
 *     시작하면 그 화성 세션 복원에 필요한 exact catalog/detail texture만 제한 저장한다.
 */

const CACHE = 'earthus-shell-2026-09-07-scope';
const LEGACY_CACHES = new Set([
  'earthus-shell-2026-08-21-tourism-density2',   // 2026-09-07 scope 수정 전 캐시 — 활성화 때 지운다
  'earthus-shell-2026-08-21-tourism-density1',
  'earthus-shell-2026-08-20-weather-tourism1',
  'earthus-shell-2026-08-20-hobby-ocean1',
  'earthus-shell-2026-08-13-publicui1',
  'earthus-shell-2026-07-28c',
  'earthus-shell-2026-08-12-session1',
  'earthus-shell-2026-08-13-visualrelease1',
]);
const SKY_FALLBACK = './space/skybox/earthus-milky-way/panorama-2048.28125627e27567e3.webp';
const SHELL = ['./index.html', './manifest.webmanifest', SKY_FALLBACK];
const SESSION_DEPENDENCY_PATHS = new Set([
  '/data/celestial-bodies.json',
  '/space/planets/detail/mars.webp',
]);
const isSessionDependency = url => SESSION_DEPENDENCY_PATHS.has(url.pathname);

async function responseWithSessionDigest(response) {
  const body = await response.clone().arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', body);
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const headers = new Headers(response.headers);
  headers.set('X-Earthus-Aetherus-Session-Resource', '1');
  headers.set('X-Earthus-Aetherus-SHA256', hex);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(async keys => {
      const current = await caches.open(CACHE);
      // 기존 세션이 warm한 same-origin 앱 코드만 새 cache로 옮긴 뒤 옛 cache를 지운다.
      // 새 install이 넣은 index/manifest는 덮지 않고, 데이터·타일·외부 응답은 복사하지 않는다.
      for (const key of keys.filter(candidate => LEGACY_CACHES.has(candidate))) {
        const legacy = await caches.open(key);
        const requests = await legacy.keys();
        for (const request of requests) {
          const url = new URL(request.url);
          if (url.origin !== self.location.origin
            || (!/\.(?:js|css|html|webmanifest)$/i.test(url.pathname) && !isSessionDependency(url))
            || await current.match(request)) continue;
          const response = await legacy.match(request);
          if (response) await current.put(request, response);
        }
      }
      await Promise.all(keys.filter(key => key !== CACHE && LEGACY_CACHES.has(key))
        .map(key => caches.delete(key)));
    })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;   // CDN·NASA 타일·외부 API 는 통과
  /* ⚠️ 이 워커의 범위가 사이트 루트라 다른 지구(/v2 Intelligence, /v3·/wonder 종이 지구, 개발 폴더)의 요청도 여기로 온다.
     2026-09-07 실측: /v3 의 모듈 스크립트 fetch 가 한 번 실패하자 아래 폴백이 **v1 index.html** 을 돌려줘
     "module script … MIME type text/html" 오류로 종이 지구가 0% 에서 멈췄다. 다른 지구는 손대지 않는다. */
  if (['/v2','/v3','/Intelligence','/wonder','/v2-three','/v3-paper','/v3-kids','/v2-deploy'].some(p => url.pathname === p || url.pathname.toLowerCase().startsWith(p.toLowerCase() + '/'))) return;

  /* 천구는 content-hash라 오래 캐시해도 stale code가 되지 않는다. 오프라인에서 6K/4K를
     못 받으면 install 때 검증해 둔 2K로 내려 첫 지구의 검은 배경만 남는 일을 막는다. */
  if (req.destination === 'image'
      && url.pathname.includes('/space/skybox/earthus-milky-way/panorama-')) {
    e.respondWith(fetch(req).catch(() => caches.match(SKY_FALLBACK)));
    return;
  }

  // 앱 코드(화면·스크립트·스타일)만 다룬다. 데이터 JSON 등은 통과.
  const dest = req.destination;
  const isAppCode = req.mode === 'navigate'
    || dest === 'document' || dest === 'script' || dest === 'style';
  if (!isAppCode && isSessionDependency(url)) {
    e.respondWith(
      fetch(req, { cache: 'no-cache' })
        .catch(() => caches.match(req))
        .then(response => response || new Response('', { status: 503, statusText: 'Session dependency unavailable' }))
    );
    return;
  }
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
        /* index.html 폴백은 화면 이동(navigate)에만. 스크립트·스타일에 HTML 을 주면 MIME 오류로 앱이 멈춘다. */
        (r) => r || (req.mode === 'navigate' ? caches.match('./index.html', { ignoreSearch: true }) : undefined)))
  );
});

/* Aetherus 현장 세션을 시작한 뒤에는 그 순간 실제로 로드된 같은 출처의 앱 코드와
   화성 session 복원에 필요한 exact catalog/detail texture만 체크포인트한다. 전체 사이트,
   일반 데이터 JSON·사진·타일을 추측해 저장하지 않는다. 모든 항목은 SHA-256을 응답
   header에 고정하지만, 이 제한 cache를 완전한 offline pack 또는 server sync로 표현하지 않는다. */
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'earthus:aetherus-cache-session-shell') return;
  const reply = e.ports?.[0];
  const resources = [...new Set(Array.isArray(e.data.resources) ? e.data.resources : [])]
    .slice(0, 160)
    .map(value => {
      try { return new URL(String(value), self.location.origin); } catch (_) { return null; }
    })
    .filter(url => url?.origin === self.location.origin
      && (/\.(?:js|css|html|webmanifest)$/i.test(url.pathname) || isSessionDependency(url)));

  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const results = await Promise.all(resources.map(async url => {
      try {
        const existing = await cache.match(url.href);
        const response = existing || await fetch(url.href, { cache: 'no-cache' });
        if (!response.ok) return { cached: false, checksummed: false };
        const stamped = await responseWithSessionDigest(response);
        await cache.put(url.href, stamped);
        return { cached: true, checksummed: true };
      } catch (_) { return { cached: false, checksummed: false }; }
    }));
    const cached = results.filter(result => result.cached).length;
    const checksummed = results.filter(result => result.checksummed).length;
    try {
      reply?.postMessage({
        ok: cached === resources.length && checksummed === resources.length,
        cached,
        requested: resources.length,
        checksummed,
        checksum: 'SHA-256',
      });
    } catch (_) { }
  })());
});

/* ══════════════════════════════════════════════════════════════
   웹푸시 — 앱이 닫혀 있어도 알림
   ══════════════════════════════════════════════════════════════
   ⚠️⚠️ **이 자리는 안전 경보가 지나가는 길이다.** 여기서 예외가 나면
      알림이 통째로 안 뜨는데, 사용자는 "경보가 없었다"고 생각한다.
      → 본문 파싱이 실패해도 **반드시 무언가는 띄운다.**

   ⚠️ iOS 는 **홈 화면에 추가한 PWA** 에서만 이 이벤트가 온다. 사파리 탭에서는 안 온다.
      브라우저가 알려 주지 않으므로 화면 쪽(push.js)에서 미리 안내한다. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {
    // ⚠️ JSON 이 아니면 글자로라도 살린다. 조용히 삼키지 않는다.
    try { d = { body: e.data.text() }; } catch (_) { d = {}; }
  }

  const title = d.title || 'earthus';
  const opts = {
    body: d.body || '',
    /* ⚠️ icon.png 는 **없는 파일이었다** (감사). 저장소에는 icon-192/512.png 뿐이라
       운영에서 403 이 났고, 알림 아이콘과 배지가 깨진 채 나갔다.
       ⚠️ 배지는 단색으로 축약돼 그려지므로 작은 쪽을 준다. */
    icon: d.icon || './icon-192.png',
    badge: './icon-192.png',
    /* ⚠️ tag 를 주면 같은 tag 의 옛 알림을 **덮어쓴다.**
       이안류 등급이 오르면 이전 알림이 남지 않고 최신만 보인다 — 그게 맞다.
       ⚠️ 다만 서로 다른 사건이 같은 tag 를 쓰면 하나가 사라진다.
          서버가 사건마다 다른 tag 를 준다. */
    tag: d.tag || undefined,
    /* ⚠️ 중요한 경보는 **자동으로 안 사라지게** 한다. 지나가 버리면 못 본다. */
    requireInteraction: !!d.urgent,
    /* 진동 — 위험할 때만 길게. ⚠️ 평범한 알림까지 길게 울리면 다 꺼 버린다. */
    vibrate: d.urgent ? [200, 80, 200, 80, 200] : [120],
    data: { url: d.url || './', at: Date.now() },
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil((async () => {
    /* ⚠️ 이미 열려 있는 창이 있으면 **새로 열지 않고 그 창을 쓴다.**
       누를 때마다 창이 늘어나면 사용자가 앱을 정리하다 알림을 끈다. */
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.includes(self.location.origin)) {
        await c.focus();
        try { c.postMessage({ type: 'earthus:push-open', url }); } catch (_) { }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

/* 브라우저가 구독을 스스로 갱신할 때 (만료·키 교체).
   ⚠️ 이걸 안 받으면 **말없이 알림이 끊긴다.** 사용자는 이유를 모른다. */
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    /* ⚠️ 서비스워커는 로그인 토큰이 없어 서버에 직접 못 올린다.
       열려 있는 창에 알려 주고, 창이 없으면 다음 실행 때 화면이 다시 등록한다
       (push.js 가 켤 때마다 현재 구독을 서버와 맞춘다). */
    for (const c of list) {
      try { c.postMessage({ type: 'earthus:push-resubscribe' }); } catch (_) { }
    }
  })());
});
