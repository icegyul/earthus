/* PR-00 전용 읽기 진단 함수.
 * 운영 entry는 이 파일을 import하지 않는다. 계측 harness가 명시적으로 불러 현재 레이어,
 * 요청 중복, mask 작업 시간, 유휴 렌더를 기록한다. URL query 값이나 사용자 위치는 내보내지 않는다. */

export function percentile(samples, ratio) {
  const values = samples.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return Math.round(values[index] * 1000) / 1000;
}

export function maskTimingSummary(samples) {
  const values = samples.filter(Number.isFinite);
  return {
    count: values.length,
    p50Ms: percentile(values, 0.50),
    p95Ms: percentile(values, 0.95),
    maxMs: values.length ? Math.round(Math.max(...values) * 1000) / 1000 : null,
    longTasksOver50Ms: values.filter(value => value > 50).length,
  };
}

/** 민감 query를 버리고 provider/frame/tile만 재현 가능한 키로 바꾼다. */
export function satelliteRequestKey(rawUrl) {
  let url;
  try { url = new URL(rawUrl, 'https://earthus.invalid/'); } catch (_) { return null; }
  const path = decodeURIComponent(url.pathname);
  const gibs = path.match(/\/([^/]+)\/default\/([^/]+)\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.(?:png|jpg|jpeg|webp)$/i);
  if (gibs) return `GIBS/${gibs[1]}/${gibs[2]}/${gibs[3]}/${gibs[4]}/${gibs[5]}/${gibs[6]}`;
  const gk2a = path.match(/\/(?:clouds\/)?gk2a\/(.+?)\/(\d+)\/(\d+)\/(\d+)\.(?:png|jpg|jpeg|webp)$/i);
  if (gk2a) return `GK2A/${gk2a[1]}/${gk2a[2]}/${gk2a[3]}/${gk2a[4]}`;
  if (/\/(?:clouds\/)?gk2a\/(?:meta\.json|[^/]+\.png)$/i.test(path)) return `GK2A/${path.split('/').pop()}`;
  if (/\/clouds\/(?:meta\.json|global\.png)$/i.test(path)) return `NOAA_GMGSI/${path.split('/').pop()}`;
  return null;
}

export function requestSummary(urls) {
  const counts = new Map();
  for (const url of urls) {
    const key = satelliteRequestKey(url);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const providerBreakdown = {};
  for (const [key, count] of counts) {
    const provider = key.split('/')[0];
    providerBreakdown[provider] = (providerBreakdown[provider] || 0) + count;
  }
  const requestCount = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return {
    requestCount,
    uniqueKeyCount: counts.size,
    duplicateRequestCount: duplicates.reduce((sum, item) => sum + item.count - 1, 0),
    /* 현재 promise dedupe가 없으므로 실제 hit가 아니라 PR-02에서 없앨 수 있는 비율이다. */
    dedupeOpportunityRatio: requestCount ? Math.round((1 - counts.size / requestCount) * 10000) / 10000 : 0,
    providerBreakdown,
    duplicates,
  };
}

function layerAt(collection, index) {
  return typeof collection.get === 'function' ? collection.get(index) : collection[index];
}

export function imageryLayerSnapshot(collection) {
  const layers = [];
  const length = Number(collection?.length || 0);
  for (let index = 0; index < length; index += 1) {
    const layer = layerAt(collection, index);
    if (!layer) continue;
    layers.push({
      index,
      show: layer.show !== false,
      alpha: Number.isFinite(layer.alpha) ? Math.round(layer.alpha * 1000) / 1000 : null,
      role: layer._earthusCloudRole || layer._earthusGK2ARole || 'unclassified',
      hasDepthSibling: !!layer._earthusDepthLayer,
    });
  }
  const depthLayers = layers.filter(layer => ['sun-shadow', 'visual-relief', 'shadow'].includes(layer.role));
  return {
    total: layers.length,
    visible: layers.filter(layer => layer.show).length,
    depthSiblingCount: depthLayers.length,
    baseWithDepthCount: layers.filter(layer => layer.hasDepthSibling).length,
    layers,
  };
}

export function estimateTextureBytes(width, height, bytesPerPixel = 4) {
  if (![width, height, bytesPerPixel].every(Number.isFinite) || width <= 0 || height <= 0 || bytesPerPixel <= 0) {
    return null;
  }
  return Math.round(width * height * bytesPerPixel);
}
