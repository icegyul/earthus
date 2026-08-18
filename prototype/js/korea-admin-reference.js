// 한국 좌표의 시·도 / 시·군·구 지명 참조.
//
// ⚠️ 최근접 도시나 관측지점 이름을 좌표의 지역명으로 쓰지 않는다. 경계 가까이서는
// 관측소 두 곳의 거리가 비슷해 다른 시 이름이 붙을 수 있으므로 ADM2 면을 직접 검사한다.
// ⚠️ 지명 표기용 참조이며 법적 주소·특보구역·행정 판단에는 사용하지 않는다.

const DATA_URL = new URL('../data/korea-admin-reference.json?v=20260815-admin1', import.meta.url).href;
let documentPromise = null;

function loadDocument() {
  if (!documentPromise) documentPromise = fetch(DATA_URL, { cache: 'force-cache' }).then(async response => {
    if (!response.ok) throw new Error(`Korea admin reference: HTTP ${response.status}`);
    const doc = await response.json();
    if (doc?.schemaVersion !== 'earthus.korea-admin-reference.v1' || !Array.isArray(doc.features)) {
      throw new Error('Korea admin reference: invalid schema');
    }
    return doc;
  });
  return documentPromise;
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
  const [minX, minY, maxX, maxY] = feature.bbox || [];
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  const geometry = feature.geometry;
  if (geometry?.type === 'Polygon') return inPolygon(x, y, geometry.coordinates);
  if (geometry?.type === 'MultiPolygon') {
    return geometry.coordinates.some(polygon => inPolygon(x, y, polygon));
  }
  return false;
}

/**
 * @returns {Promise<{nameKo:string,nameEn:string,regionKo:string,regionEn:string,boundaryYear:number,source:string}|null>}
 */
export async function koreaAdminAt(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)
      || lat < 32.5 || lat > 39 || lon < 124 || lon > 132.5) return null;
  try {
    const doc = await loadDocument();
    const feature = doc.features.find(item => contains(item, lon, lat));
    if (!feature) return null;
    return {
      nameKo: feature.nameKo, nameEn: feature.nameEn,
      regionKo: feature.regionKo, regionEn: feature.regionEn,
      boundaryYear: doc.boundaryYear,
      source: doc.source,
    };
  } catch (error) {
    console.warn('[place] 한국 행정구역 reference를 못 열었습니다', error?.message || error);
    return null;
  }
}
