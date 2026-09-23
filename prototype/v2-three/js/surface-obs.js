// EARTHUS v2 — 지상관측 문서 한 벌 (DEV-DIRECTIVE 2026-09-20 · W1 ⑦ "허브 호출 증가 0")
//
// 무엇이 잘못돼 있었나: 같은 두 파일(wind/kma-aws.json · wind/gts-global.json)을 v2 안에서 **네 곳이 따로** 받았다.
//   live-layers.js  'wind'(둘 다) · 'tempanom'(기상청)     station-model.js  load()(둘 다)     main.js  내 동네 카드(기상청)
//   전부 cache:'no-store' 라 메뉴를 하나 켤 때마다 1.1 MB(GTS)를 통째로 다시 내려받는다. 지구 위 관측 숫자(obs-labels.js)가
//   다섯 번째 손님이 되면 기온 메뉴를 켜는 것만으로 또 한 번이다 — 폰 요금과 발열이 되는 쪽이다.
//
// 무엇인가: 파일마다 '받는 중인 약속 하나 · 받아 둔 문서 하나'를 들고, 묻는 쪽 전부에 같은 것을 준다.
//   · doc('aws' | 'gts') — 받아 둔 것이 TTL 안이면 그대로, 받는 중이면 그 약속을, 아니면 한 번 받는다.
//   · both()             — { aws, gts }. 한쪽이 실패하면 그쪽만 null(둘 다 실패해도 던지지 않는다 — 부르는 쪽이 정한다).
//   · 실패는 담아 두지 않는다. 한 번 실패한 약속을 들고 있으면 다음 메뉴도 같이 실패한다.
//
// TTL 이 10분인 이유(실측 2026-09-20): 두 수집기는 매시 한 번 돈다 — kma-aws cron(25 * * * ? *) · gts-global cron(35 * * * ? *)
//   (aws/schedules.sh:90 · aws/KMA-HUB-BUDGET.md:257). 10분보다 자주 받아도 같은 파일이다. 한편 live-layers 의 바람 레이어는
//   20분마다 다시 받으므로(REFRESH_MIN.wind) TTL 은 그보다 짧아야 그 갱신이 실제로 새 파일을 받는다.
//
// 여기는 S3 캐시만 읽는다 — 기상청 허브를 부르는 것은 Lambda 이고, 이 파일이 몇 번 불리든 허브 호출은 0건이다.
// DOM · THREE 를 모른다 — 시험이 가짜 fetch 로 그대로 부른다(tools/earthus-v53/surface-obs.test.mjs).

// CloudFront(earthus.net)는 /clouds/* 외 경로에 CORS 헤더를 안 붙인다 → S3 직접(CORS *). live-layers.js 와 같은 이유 · 같은 주소.
// (2026-09-23 정정) 위 CORS 이유는 **교차 출처(localhost 개발)** 에서만 맞다. 운영 v2(earthus.net/v2/)는 같은 출처라 CORS 가 필요 없다 —
//   운영에서는 '' (같은 출처 · CloudFront /wind/* · br 압축), 그 밖에서는 예전처럼 S3 직접. main.js CloudManager 위 DATA_BASE 주석.
export const SURFACE_OBS_BASE = (typeof location !== 'undefined' && location.hostname.endsWith('earthus.net')) ? '' : 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
export const SURFACE_OBS_PATH = Object.freeze({ aws: '/wind/kma-aws.json', gts: '/wind/gts-global.json' });
export const SURFACE_OBS_TTL_MS = 10 * 60 * 1000;
// GTS 가 1.1 MB 라 느린 회선에서 오래 걸린다 — live-layers 가 이 파일에 주던 시간(25초)을 그대로 쓴다.
export const SURFACE_OBS_TIMEOUT_MS = 25000;

export function createSurfaceObs({
  fetchImpl = (...a) => globalThis.fetch(...a),
  now = () => Date.now(),
  base = SURFACE_OBS_BASE,
  ttlMs = SURFACE_OBS_TTL_MS,
  timeoutMs = SURFACE_OBS_TIMEOUT_MS,
} = {}) {
  // kind → { doc, at, pending }
  const slots = { aws: { doc: null, at: 0, pending: null }, gts: { doc: null, at: 0, pending: null } };
  const fetches = { aws: 0, gts: 0 };

  const fetchOnce = (kind) => {
    const path = SURFACE_OBS_PATH[kind];
    fetches[kind] += 1;
    let timer = null;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`${path} timeout`)), timeoutMs); });
    const got = Promise.resolve()
      .then(() => fetchImpl(`${base}${path}`, { cache: 'no-store' }))
      .then((r) => {
        if (!r || !r.ok) throw new Error(`${path} HTTP ${r ? r.status : '?'}`);
        return r.json();
      });
    return Promise.race([got, timeout]).finally(() => clearTimeout(timer));
  };

  const doc = (kind) => {
    const s = slots[kind];
    if (!s) return Promise.reject(new Error(`unknown surface obs kind ${kind}`));
    if (s.doc && now() - s.at < ttlMs) return Promise.resolve(s.doc);
    if (s.pending) return s.pending;
    s.pending = fetchOnce(kind).then((d) => {
      s.doc = d; s.at = now(); s.pending = null;
      return d;
    }, (e) => {
      s.pending = null;      // 실패는 담아 두지 않는다 — 다음에 묻는 쪽이 다시 받는다. 옛 문서(s.doc)는 peek 로만 남는다.
      throw e;
    });
    return s.pending;
  };

  return {
    doc,
    both: () => Promise.all([doc('aws').catch(() => null), doc('gts').catch(() => null)])
      .then(([aws, gts]) => ({ aws, gts })),
    // 받아 둔 것만 본다(요청 없음). TTL 이 지났어도 준다 — 늙었는지는 문서 안의 관측 시각으로 읽는 쪽이 판단한다.
    peek: (kind) => (slots[kind] ? slots[kind].doc : null),
    // 콘솔 확인용: __earthus.surfaceObs.stats() → 파일마다 실제로 몇 번 받았나.
    stats: () => ({ fetches: { ...fetches }, cachedAt: { aws: slots.aws.at || null, gts: slots.gts.at || null } }),
  };
}

// 앱 전체가 나눠 쓰는 하나.
// ⚠️ 다른 모듈과 **같은 URL**(?v= 까지)로 import 해야 같은 인스턴스다 — ES 모듈은 URL 전체로 구분된다(time-bus.js 와 같은 함정).
//    URL 이 하나라도 다르면 저장소가 둘이 되고, 같은 파일을 다시 두 번 받는다. 시험이 네 곳의 import 줄을 잠근다.
export const surfaceObs = createSurfaceObs();
