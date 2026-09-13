// EARTHUS V3 WONDER — asset-runtime / loader (Master Directive §16~§19)
// 레지스트리 기반 자산 로더: 중복 요청 합치기 · 재시도(지수 백오프) · 타임아웃 · 취소 · LRU 예산 · unload · stale(해시 바뀜) 처리.
// DOM 을 모른다 — `load(url, {signal})` 을 주입받는다. 브라우저용 기본 구현은 아래 defaultImageLoader.

/**
 * @param {object} o
 * @param {(path:string)=>{sha256?:string, bytes?:number}|undefined} o.lookup  레지스트리 조회 (없으면 sha 없이)
 * @param {(url:string, ctx:{signal:{aborted:boolean}, path:string})=>Promise<any>} o.load  실제 로드
 * @param {(path:string, sha12:string|null)=>string} [o.urlOf]  경로 → URL (기본: base + path + ?v=sha12)
 * @param {number} [o.budgetBytes]  상주 예산(기본 30MB — PD LOCK "기본 30MB target")
 */
export function createAssetRuntime({ lookup, load, urlOf, base = '', budgetBytes = 30 * 1024 * 1024, maxRetries = 2, timeoutMs = 8000, backoffMs = 200,
  sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() } = {}) {
  if (typeof load !== 'function') throw new Error('load(url, ctx) 가 필요하다');
  const toUrl = urlOf ?? ((path, sha12) => `${base}${path}${sha12 ? `?v=${sha12}` : ''}`);
  const cache = new Map();      // key → { path, sha, bytes, value, used, pinned }
  const inflight = new Map();   // key → { promise, signal }
  const byPath = new Map();     // path → key (stale 판정용)
  const stats = { requests: 0, loads: 0, hits: 0, retries: 0, failures: 0, timeouts: 0, evictions: 0, cancelled: 0, stale: 0 };

  const keyOf = path => { const meta = lookup?.(path); const sha = meta?.sha256 ? meta.sha256.slice(0, 12) : null; return { key: `${path}@${sha ?? '-'}`, sha, bytes: meta?.bytes ?? 0 }; };
  const bytesTotal = () => { let b = 0; for (const e of cache.values()) b += e.bytes; return b; };

  function evictToBudget(reserve = 0) {
    let total = bytesTotal() + reserve;
    if (total <= budgetBytes) return 0;
    const candidates = [...cache.entries()].filter(([, e]) => !e.pinned).sort((a, b) => a[1].used - b[1].used);
    let n = 0;
    for (const [k, e] of candidates) {
      if (total <= budgetBytes) break;
      cache.delete(k); byPath.delete(e.path); total -= e.bytes; n++; stats.evictions++;
      e.value?.close?.();               // ImageBitmap 등
    }
    return n;
  }

  async function attempt(url, path, signal) {
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => { stats.timeouts++; rej(new Error(`timeout ${timeoutMs}ms: ${path}`)); }, timeoutMs); });
    try { return await Promise.race([load(url, { signal, path }), timeout]); }
    finally { clearTimeout(timer); }
  }

  /** 자산 하나. 같은 경로·같은 해시면 캐시/진행 중 요청을 재사용한다. */
  function get(path, { pin = false } = {}) {
    stats.requests++;
    const { key, sha, bytes } = keyOf(path);
    const prevKey = byPath.get(path);
    if (prevKey && prevKey !== key) {        // 레지스트리 해시가 바뀜 → 옛 사본은 stale
      const old = cache.get(prevKey); if (old) { cache.delete(prevKey); old.value?.close?.(); }
      byPath.delete(path); stats.stale++;
    }
    const hit = cache.get(key);
    if (hit) { hit.used = now(); if (pin) hit.pinned = true; stats.hits++; return Promise.resolve(hit); }
    if (inflight.has(key)) { stats.hits++; return inflight.get(key).promise; }

    const signal = { aborted: false };
    const url = toUrl(path, sha);
    const promise = (async () => {
      let lastErr;
      for (let n = 0; n <= maxRetries; n++) {
        if (signal.aborted) { stats.cancelled++; throw new Error(`cancelled: ${path}`); }
        try {
          if (n > 0) { stats.retries++; await sleep(backoffMs * 2 ** (n - 1)); }
          stats.loads++;
          const value = await attempt(url, path, signal);
          if (signal.aborted) { stats.cancelled++; value?.close?.(); throw new Error(`cancelled: ${path}`); }
          evictToBudget(bytes);
          const entry = { path, sha, bytes, value, used: now(), pinned: pin };
          cache.set(key, entry); byPath.set(path, key);
          return entry;
        } catch (e) { lastErr = e; if (signal.aborted) throw e; }
      }
      stats.failures++;
      throw Object.assign(new Error(`load failed after ${maxRetries + 1} tries: ${path}`), { cause: lastErr });
    })().finally(() => inflight.delete(key));
    inflight.set(key, { promise, signal });
    return promise;
  }

  function cancel(path) { const { key } = keyOf(path); const f = inflight.get(key); if (f) f.signal.aborted = true; return !!f; }
  function has(path) { return cache.has(keyOf(path).key); }
  function pin(path, on = true) { const e = cache.get(keyOf(path).key); if (e) e.pinned = on; return !!e; }
  function unload(path) { const { key } = keyOf(path); const e = cache.get(key); if (!e) return false; cache.delete(key); byPath.delete(path); e.value?.close?.(); return true; }
  function unloadWhere(pred) { let n = 0; for (const [k, e] of [...cache.entries()]) if (pred(e)) { cache.delete(k); byPath.delete(e.path); e.value?.close?.(); n++; } return n; }
  function status() { return { ...stats, resident: cache.size, residentBytes: bytesTotal(), inflight: inflight.size, budgetBytes }; }

  return { get, cancel, has, pin, unload, unloadWhere, evictToBudget, status, _cache: cache };
}

/** 브라우저 기본 로더: <img> 로 받는다. signal.aborted 면 src 를 비워 중단한다.
 *  ⚠️ decode() 를 기다리지 않는다 — 문서가 보이지 않을 때(뒤에 있는 패널·백그라운드 탭) Chrome 은 decode 를 미뤄
 *  약속이 끝나지 않고, 그러면 타임아웃 → 3회 실패로 떨어진다(2026-09-13 실측: timeouts 6). onload 면 바이트는 다 받은 것이다. */
export function defaultImageLoader(url, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { try { img.decode?.().catch(() => {}); } catch { /* */ } resolve(img); };
    img.onerror = () => reject(new Error(`image error: ${url}`));
    img.src = url;
    if (signal) { const t = setInterval(() => { if (signal.aborted) { img.src = ''; clearInterval(t); reject(new Error('aborted')); } if (img.complete) clearInterval(t); }, 100); }
  });
}
