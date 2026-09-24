// EARTHUS 새 탭 — 확장 서비스 워커 (2026-09-24 · 지시서 §4-3 · §4-5)
//
// 하는 일은 '받아서 저장' 하나다. 그리지 않는다.
//   · chrome.alarms 15분 — 단, **최근 2시간 안에 새 탭이 열린 적이 있을 때만** 받는다(새 탭을 안 여는 날에는 돌지 않는다).
//   · 새 탭이 '받아 줘'(earthus:refresh)를 청하면 받는다(새 탭 쪽 조건: 온라인 + 마지막 받기 15분 초과).
//   · 사실 JSON 넷 + 구름 meta 를 받는다(합 약 5 KB, br 기준 · 지시서 추정). fetch 마다 25초 제한.
//   · 구름 WebP(약 1.5 MB)는 meta.time 이 바뀌었을 때만 받는다(1시간에 최대 1회).
//   (2026-09-24 정정 · L4) 쓰나미 줄이 기본 꺼짐이 됐어도 tsunami-intl.json(약 1 KB)은 계속 받아 저장만 한다 —
//     설정에서 켜면 다음 받기를 기다리지 않고 곧바로 줄이 나오게. 화면에 내는지는 newtab.js·feeds.js buildFacts 가 설정으로 정한다.
//
// ⚠️ 구름 그림과 라벨의 짝 — sha256 으로 맞춘다(지시서 §4-5 · verify-feasibility #12 · R14).
//   CloudFront 캐시 정책이 질의문자열을 캐시 키에 넣지 않아서 ?t= 로는 엣지를 못 가른다(main.js:1609-1630 사고 기록).
//   그래서 ① earthus.net 에서 받은 blob 의 SHA-256 을 meta.variants.webp2048.sha256 과 비교하고 ② 다르면 S3 직접 주소로
//   다시 받아 비교하고 ③ 그래도 다르면 **이전 그림과 이전 시각을 그대로 둔다**(문구는 추가하지 않는다 — 지시서 §4-2).
//
// 코드는 받지 않는다 — 받는 것은 JSON·이미지(데이터)뿐이다(원격 코드 금지, 지시서 §4-7).
// 이 파일은 chrome 이 없으면(node --test) 이벤트를 걸지 않고 함수만 내보낸다.

import {
  ORIGIN, S3_DIRECT, ENDPOINTS, FEED_KEYS, NORMALIZE, ALARM_MINUTES, FETCH_TIMEOUT_MS,
  shouldRefreshOnAlarm, needCloudDownload,
} from './feeds.js';
import { chromeStore } from './store.js';

export const ALARM_NAME = 'earthus-refresh';
const MIN_GAP_MS = 60 * 1000;   // 새 탭 여러 개가 한꺼번에 청해도 1분 안에는 한 번만 받는다

export async function sha256Hex(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function makeFetchers(fetchImpl, stats) {
  const go = (url) => {
    if (stats) { stats.fetches += 1; stats.urls.push(url); }
    return fetchImpl(url, { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  };
  return {
    async json(url) {
      const r = await go(url);
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { kind: 'http' });
      const text = await r.text();
      try { return JSON.parse(text); } catch { return { __unparsable: true }; }
    },
    async blob(url) {
      const r = await go(url);
      if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { kind: 'http' });
      return r.blob();
    },
  };
}

/**
 * 한 번 받기. deps = { fetchers:{json,blob}, store:{get,set,putCloud}, now:()=>ms, digest:(ArrayBuffer)=>hex }
 * reason: 'alarm' | 'newtab'. 'alarm' 이면 2시간 조건을 여기서도 한 번 더 본다.
 * 반환: 무엇을 했는지(시험·진단용).
 */
export async function refreshAll(deps, reason) {
  const { fetchers, store, now, digest } = deps;
  const t = now();
  const st = await store.get(['feeds', 'cloud', 'lastNewtabOpenAt', 'lastFetchAt']);
  if (reason === 'alarm' && !shouldRefreshOnAlarm(t, st.lastNewtabOpenAt)) {
    return { skipped: 'no-recent-newtab' };
  }
  const feeds = Object.assign({}, st.feeds || {});
  const out = { fetched: [], kept: [], format: [], cloud: 'unchanged' };

  await Promise.all(FEED_KEYS.map(async (k) => {
    try {
      const j = await fetchers.json(ORIGIN + ENDPOINTS[k]);
      const n = j && j.__unparsable ? { ok: false, reason: 'format', missing: ['<json>'] } : NORMALIZE[k](j);
      // (2026-09-24 검수 추가) 형식 변경이 아닌 '아직 없음'(구름 meta 의 변형 미완성 창 — feeds.js normalizeCloudMeta 정정)은
      //   저장하지 않는다 — 지난 값을 그대로 두어 이전 그림·이전 시각이 유지되고 '형식 변경' 문구가 뜨지 않는다.
      if (!n.ok && n.reason !== 'format') { out.kept.push(k); return; }
      feeds[k] = Object.assign({ fetchedAt: t }, n);
      (n.ok ? out.fetched : out.format).push(k);
    } catch (e) {
      // 받지 못했으면(오프라인·시간 초과·5xx) 지난 값을 그대로 둔다 — 그 시각 그대로 늙어 가다 '지연'이 된다.
      out.kept.push(k);
    }
  }));

  let cloud = st.cloud || null;
  const meta = feeds.cloudMeta && feeds.cloudMeta.ok && out.fetched.includes('cloudMeta') ? feeds.cloudMeta.data : null;
  if (meta && needCloudDownload(meta, cloud, t, reason === 'newtab' ? t : st.lastNewtabOpenAt)) {
    const tryGet = async (base, via) => {
      try {
        const blob = await fetchers.blob(`${base}/${meta.key}`);
        const hex = await digest(await blob.arrayBuffer());
        return hex === meta.sha256 ? { blob, via } : { mismatch: hex };
      } catch (e) { return { error: String(e && e.message || e) }; }
    };
    let got = await tryGet(ORIGIN, 'earthus.net');
    if (!got.blob) got = await tryGet(S3_DIRECT, 's3');
    if (got.blob) {
      const info = { time: meta.time, timeMs: meta.timeMs, credit: meta.credit, north: meta.north, south: meta.south, sha256: meta.sha256, via: got.via };
      await store.putCloud(got.blob, info);   // 그림과 시각을 같은 응답에 — 먼저 캐시, 그다음 포인터
      cloud = info;
      out.cloud = `new:${got.via}`;
    } else {
      out.cloud = 'mismatch-kept-previous';
    }
  }

  await store.set({ feeds, cloud, lastFetchAt: t });
  return out;
}

/* ── 확장 안에서만 ─────────────────────────────────────────────────── */

if (typeof chrome !== 'undefined' && chrome.alarms && chrome.runtime) {
  const stats = { fetches: 0, urls: [], alarms: 0, skipped: 0 };
  const deps = {
    fetchers: makeFetchers((u, o) => fetch(u, o), stats),
    store: chromeStore,
    now: () => Date.now(),
    digest: sha256Hex,
  };
  let inflight = null;
  let lastRun = 0;
  const run = (reason) => {
    if (inflight) return inflight;
    if (reason === 'newtab' && Date.now() - lastRun < MIN_GAP_MS) return Promise.resolve({ skipped: 'min-gap' });
    inflight = refreshAll(deps, reason)
      .catch((e) => ({ error: String(e && e.message || e) }))
      .finally(() => { inflight = null; lastRun = Date.now(); });
    return inflight;
  };
  const ensureAlarm = async () => {
    const a = await chrome.alarms.get(ALARM_NAME);
    if (!a) await chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_MINUTES });
  };
  const onAlarm = async (alarm) => {
    if (!alarm || alarm.name !== ALARM_NAME) return null;
    stats.alarms += 1;
    const r = await run('alarm');
    if (r && r.skipped) stats.skipped += 1;
    return r;
  };
  chrome.runtime.onInstalled.addListener(() => { ensureAlarm(); });
  chrome.runtime.onStartup.addListener(() => { ensureAlarm(); });
  chrome.alarms.onAlarm.addListener(onAlarm);
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== 'earthus:refresh') return false;
    if (sender && sender.id !== chrome.runtime.id) return false;
    run('newtab').then(sendResponse);
    return true;
  });
  // 진단·측정용(시험 스크립트가 알람 조건을 확인한다). 네트워크나 권한을 더하지 않는다.
  self.__earthus = { stats, onAlarm: (name) => onAlarm({ name: name || ALARM_NAME }) };
}
