// One public LL2 request shared by Earthus launch pins and Aetherus Mission Control.
// Keep the original retrieval time on fallback; provider throttling must not become a retry loop.
const CACHE_KEY = 'earthus:launch-schedule:v1';
const FRESH_MS = 5 * 60_000;
const MAX_CACHE_MS = 24 * 60 * 60_000;

export function normalizeLaunches(value) {
  if (!Array.isArray(value?.results)) return [];
  return value.results.filter(item => item?.id && item?.name
    && Number.isFinite(Date.parse(item.net || item.window_start || ''))).map(item => {
    const listedVideos = item.vid_urls || item.vidURLs;
    const videos = [...(Array.isArray(listedVideos) ? listedVideos : []),
      ...(Array.isArray(item.mission?.vid_urls) ? item.mission.vid_urls : [])];
    const seen = new Set();
    return {
      id: String(item.id), name: String(item.name), scheduledAt: item.net || item.window_start,
      windowStart: item.window_start || null, windowEnd: item.window_end || null,
      status: item.status?.name || '상태 미수신', statusDescription: item.status?.description || '',
      webcastLive: item.webcast_live === true,
      provider: item.launch_service_provider?.name || '운영기관 미수신',
      site: item.pad?.location?.name || item.pad?.name || '발사장 미수신',
      missionType: item.mission?.type || null, missionName: item.mission?.name || null,
      missionDescription: item.mission?.description || null,
      videoUrls: videos.map(video => {
        try {
          const url = new URL(typeof video === 'string' ? video : video?.url);
          if (url.protocol !== 'https:' || seen.has(url.href)) return null;
          seen.add(url.href);
          return { url: url.href, title: String(video?.title || video?.publisher || '발사 중계 열기') };
        } catch { return null; }
      }).filter(Boolean),
    };
  }).sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
}

export function launchListUrl(endpoint) {
  const url = new URL(endpoint);
  // A single normal response supplies launch pins, mission cards and provider filters.
  url.searchParams.set('limit', '30');
  url.searchParams.set('hide_recent_previous', 'true');
  url.searchParams.set('mode', 'normal');
  url.searchParams.set('ordering', 'net');
  return url.href;
}

export function createLaunchScheduleClient({ now = Date.now, storage } = {}) {
  let memory = null;
  let verifiedInSession = false;
  let pending = null;
  let retryAt = 0;
  let lastError = null;
  const store = () => {
    try { return storage === undefined ? globalThis.localStorage : storage; } catch { return null; }
  };
  const usable = entry => entry?.version === 1 && Array.isArray(entry.rawResults)
    && (!entry.rawResults.length || normalizeLaunches({ results: entry.rawResults }).length > 0)
    && Number.isFinite(Date.parse(entry.retrievedAt))
    && now() - Date.parse(entry.retrievedAt) >= 0
    && now() - Date.parse(entry.retrievedAt) <= MAX_CACHE_MS;
  const read = () => {
    if (usable(memory)) return memory;
    try {
      const entry = JSON.parse(store()?.getItem(CACHE_KEY) || 'null');
      if (usable(entry)) { verifiedInSession = false; return (memory = entry); }
    } catch { /* Public cache is optional when storage is disabled. */ }
    return null;
  };
  const result = (entry, mode, error = null) => ({
    launches: normalizeLaunches({ results: entry.rawResults }), rawResults: entry.rawResults,
    retrievedAt: entry.retrievedAt, mode, error,
    retryAt: retryAt > now() ? new Date(retryAt).toISOString() : null,
  });
  return async function getLaunchSchedule({ url, fetcher, force = false } = {}) {
    if (pending) return pending;
    const cached = read();
    if (retryAt > now()) {
      if (cached) return result(cached, 'cached', lastError?.message);
      throw lastError || new Error('발사 자료 재조회 대기 중');
    }
    if (!force && cached && now() - Date.parse(cached.retrievedAt) < FRESH_MS) {
      return result(cached, verifiedInSession ? 'live' : 'cached');
    }
    pending = (async () => {
      try {
        const response = await fetcher(launchListUrl(url), { cache: 'no-cache' });
        if (!response.ok) {
          const error = new Error(`LL2 ${response.status}`); error.status = response.status;
          if (response.status === 429) {
            const retry = response.headers?.get?.('retry-after');
            const seconds = retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) : null;
            const retryMs = seconds !== null ? now() + seconds * 1000 : Date.parse(retry || '');
            retryAt = Number.isFinite(retryMs) && retryMs > now() ? retryMs : now() + 15 * 60_000;
            error.retryAt = new Date(retryAt).toISOString();
          }
          throw error;
        }
        const raw = await response.json();
        if (!Array.isArray(raw?.results) || (raw.results.length && !normalizeLaunches(raw).length)) {
          throw new Error('LL2 일정 응답 형식 오류');
        }
        // An empty, valid response means there are no returned schedules, not an outage.
        memory = { version: 1, rawResults: raw.results, retrievedAt: new Date(now()).toISOString() };
        verifiedInSession = true;
        retryAt = 0; lastError = null;
        try { store()?.setItem(CACHE_KEY, JSON.stringify(memory)); } catch { /* In-memory sharing remains usable. */ }
        return result(memory, 'live');
      } catch (error) {
        lastError = error;
        if (retryAt <= now()) retryAt = now() + 60_000;
        const previous = read();
        if (previous) return result(previous, 'cached', error.message);
        throw error;
      } finally { pending = null; }
    })();
    return pending;
  };
}

export const getLaunchSchedule = createLaunchScheduleClient();
