// 탭한 좌표의 국가를 가까운 도시가 아니라 Natural Earth 국가 면으로 판정한다.
//
// ⚠️ 화면에 붙이는 대략적인 국가명 reference다. 공식 영토·특보구역·안전 판정에는
// 쓰지 않는다. 국경선 위나 작은 도서는 null일 수 있으며, 그때는 나라를 지어내지 않는다.

const DATA_URL = new URL('../data/country-reference.json?v=20260815-country1', import.meta.url).href;
let documentPromise = null;

function loadDocument() {
  if (!documentPromise) documentPromise = fetch(DATA_URL, { cache: 'force-cache' }).then(async response => {
    if (!response.ok) throw new Error(`country reference: HTTP ${response.status}`);
    const doc = await response.json();
    if (doc?.schemaVersion !== 'earthus.country-reference.v1' || !Array.isArray(doc.features)) {
      throw new Error('country reference: invalid schema');
    }
    return doc;
  });
  return documentPromise;
}

function normalizeLon(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

function onSegment(x, y, ax, ay, bx, by) {
  const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
  if (Math.abs(cross) > 1e-10) return false;
  return x >= Math.min(ax, bx) - 1e-10 && x <= Math.max(ax, bx) + 1e-10
    && y >= Math.min(ay, by) - 1e-10 && y <= Math.max(ay, by) + 1e-10;
}

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i], b = ring[j];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    if (onSegment(x, y, a[0], a[1], b[0], b[1])) return true;
    const crosses = (a[1] > y) !== (b[1] > y)
      && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0];
    if (crosses) inside = !inside;
  }
  return inside;
}

function inPolygon(x, y, polygon) {
  if (!polygon?.length || !inRing(x, y, polygon[0])) return false;
  return !polygon.slice(1).some(hole => inRing(x, y, hole));
}

function contains(feature, x, y) {
  const geometry = feature?.geometry;
  if (geometry?.type === 'Polygon') return inPolygon(x, y, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates.some(polygon => inPolygon(x, y, polygon));
  }
  return false;
}

/**
 * @returns {Promise<{code:string|null, code3:string|null, nameKo:string, nameEn:string}|null>}
 */
export async function countryAt(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) return null;
  const x = normalizeLon(lon);
  try {
    const doc = await loadDocument();
    const feature = doc.features.find(item => contains(item, x, lat));
    if (!feature) return null;
    return {
      code: feature.code || null,
      code3: feature.code3 || null,
      nameKo: feature.nameKo,
      nameEn: feature.nameEn,
    };
  } catch (error) {
    console.warn('[place] 국가 reference를 못 열었습니다', error?.message || error);
    return null;
  }
}
