// EARTHUS v2 — 색면 위의 나라·해안 윤곽선 (2026-09-20 · 합친 화면을 브라우저에서 직접 보고 넣었다)
//
// 무엇이 없어 있었나: 새 색면(기온·풍속 — js/field-renderer.js)은 지형을 덮는 불투명 0.8 의 구간색이다. 바탕 지도에 구워진
//   국경·해안은 그 **아래**에 있다. 기온을 켜면 색 띠와 등온선은 잘 보이는데 **어디가 한반도인지 알 수 없었다** —
//   PD 정본의 완료 기준은 "10초 안에 '어디가 얼마나 다른가'를 말할 수 있다"이고, 시안 01·02 에는 색면 위로 가는 윤곽선이 있다.
//
// 무엇인가: 이미 받아 둔 나라 폴리곤(data/country-reference.json — Natural Earth 110m, 국가 포커스가 쓰는 그 자료)을 선분 한 묶음으로
//   색면 **위**에 그린다. 새 자료·새 요청 0건. 드로우콜 1개. 색면(또는 바람)이 켜져 있을 때만 보인다.
//   · 색은 **어두운 선**이다. 등온선이 흰색이라 윤곽까지 희면 선이 값인지 땅인지 구별되지 않는다.
//   · 지형을 따라간다(surfR) — 색면이 지형을 따라 올라가므로 고정 반지름이면 산악 국경이 색면에 묻힌다. 과장이 바뀌면 자리만 다시 셈한다.
//   · 110m 해상도다: 전지구·대륙 뷰용이다. 한반도 확대에서는 해안이 각져 보인다 — 거짓은 아니지만 정밀 해안선은 아니다(카드·문서에 적을 것).
//   · 날짜변경선을 건너는 변(|Δlon| > 180)과 폴리곤을 닫으려고 ±180° 경선·남극 바닥을 따라 그은 변은 **지도 밖의 선**이라 그리지 않는다.
//
// 계산(폴리곤 → 선분 좌표)은 순수 함수다 — tools/earthus-v53/field-outlines.test.mjs 가 THREE 없이 부른다.

// 윤곽선을 색면보다 얼마나 더 띄우나(지구 반지름 = 1). 색면은 지형 + 0.0012(field-renderer.js FIELD_LIFT) — 그 위에 있어야 깊이 검사에서 산다.
export const OUTLINE_LIFT = 0.0022;
// 어두운 선 — 흰 등치선과 구별된다. 밝은 구간색(노랑) 위에서도 어두운 구간색(남색) 위에서도 읽히도록 완전한 검정이 아니라 남색 기운의 먹색.
export const OUTLINE_COLOR = 0x0b1220;
export const OUTLINE_OPACITY = 0.62;
// 과장이 이만큼(비율) 바뀌면 자리를 다시 셈한다 — 슬라이더를 끄는 동안 매 프레임 다시 짓지 않는다.
export const OUTLINE_EXAG_EPS = 0.02;

const EDGE_LON = 179.999;
const FLOOR_LAT = -89.9;

/** 이 변은 지도 밖의 선인가 — 날짜변경선을 건너거나, 폴리곤을 닫으려고 ±180° 경선·남극 바닥을 따라 그은 변. */
export const isSeamEdge = (lon0, lat0, lon1, lat1) => {
  if (Math.abs(lon1 - lon0) > 180) return true;
  if (Math.abs(lon0) >= EDGE_LON && Math.abs(lon1) >= EDGE_LON) return true;
  if (lat0 <= FLOOR_LAT && lat1 <= FLOOR_LAT) return true;
  return false;
};

/**
 * 나라 폴리곤 목록 → 선분의 위경도 쌍 [lon0, lat0, lon1, lat1, …] (Float32Array).
 * features: [{ geometry: { type: 'Polygon'|'MultiPolygon', coordinates } }] — country-reference.json 의 features 그대로.
 * 숫자가 아닌 좌표는 그 변만 버린다(자료 한 점이 깨졌다고 윤곽 전체를 잃지 않는다).
 */
export function outlineSegments(features) {
  const out = [];
  for (const f of features || []) {
    const g = f && f.geometry;
    if (!g || !Array.isArray(g.coordinates)) continue;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const poly of polys) {
      for (const ring of poly || []) {
        for (let i = 1; i < (ring ? ring.length : 0); i += 1) {
          const a = ring[i - 1];
          const b = ring[i];
          const lon0 = +a[0]; const lat0 = +a[1]; const lon1 = +b[0]; const lat1 = +b[1];
          if (!Number.isFinite(lon0) || !Number.isFinite(lat0) || !Number.isFinite(lon1) || !Number.isFinite(lat1)) continue;
          if (isSeamEdge(lon0, lat0, lon1, lat1)) continue;
          out.push(lon0, lat0, lon1, lat1);
        }
      }
    }
  }
  return Float32Array.from(out);
}

/**
 * 위경도 쌍 → 월드 좌표(Float32Array xyz…). 좌표 규약은 v2 전체와 같다: x = cosφ·sinλ, y = sinφ, z = cosφ·cosλ.
 * radiusAt(lat, lon) 이 그 점의 반지름을 준다(지형 × 과장 + 띄움). 없으면 1 + OUTLINE_LIFT.
 */
export function outlinePositions(lonlat, radiusAt, out = null) {
  const n = lonlat.length / 2;
  const pos = out && out.length === n * 3 ? out : new Float32Array(n * 3);
  const D = Math.PI / 180;
  for (let i = 0; i < n; i += 1) {
    const lon = lonlat[i * 2];
    const lat = lonlat[i * 2 + 1];
    const r = radiusAt ? radiusAt(lat, lon) : 1 + OUTLINE_LIFT;
    const c = Math.cos(lat * D);
    pos[i * 3] = r * c * Math.sin(lon * D);
    pos[i * 3 + 1] = r * Math.sin(lat * D);
    pos[i * 3 + 2] = r * c * Math.cos(lon * D);
  }
  return pos;
}

/**
 * createFieldOutlines({ THREE, parent, getFeatures, surfR, getExagger })
 *   getFeatures()  → 나라 폴리곤 목록 또는 null(아직 안 받았다 — 받을 때까지 아무것도 그리지 않는다. 받으러 가지도 않는다)
 *   surfR(lat, lon, lift) → 그 점의 반지름(LiveLayers.surfR) · getExagger() → 지형 과장
 * 돌려주는 것: { setVisible(bool), tick(), state(), dispose() }
 */
export function createFieldOutlines({ THREE, parent, getFeatures, surfR = null, getExagger = () => 1 } = {}) {
  let mesh = null;
  let lonlat = null;
  let builtExag = null;
  let wanted = false;

  const radiusAt = surfR ? (lat, lon) => surfR(lat, lon, OUTLINE_LIFT) : null;

  const build = () => {
    const features = getFeatures ? getFeatures() : null;
    if (!features || !features.length) return false;
    lonlat = outlineSegments(features);
    if (!lonlat.length) return false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(outlinePositions(lonlat, radiusAt), 3));
    const mat = new THREE.LineBasicMaterial({
      color: OUTLINE_COLOR, transparent: true, opacity: OUTLINE_OPACITY, depthWrite: false,
    });
    mesh = new THREE.LineSegments(geo, mat);
    mesh.renderOrder = 0;            // 색면(−1) 위 · 구름(1) 아래 — 구름은 색면이 켜진 동안 꺼져 있다(main.js starLayers)
    mesh.frustumCulled = false;      // 지구 전체를 도는 한 묶음이다 — 경계 구가 늘 화면에 걸린다
    mesh.visible = wanted;
    builtExag = getExagger();
    parent.add(mesh);
    return true;
  };

  return {
    setVisible(on) {
      wanted = !!on;
      if (mesh) mesh.visible = wanted;
    },
    // 매 프레임 불러도 싸다: 보일 필요가 없으면 첫 줄에서 돌아간다. 폴리곤은 필요해진 뒤에야 선분으로 바꾼다.
    tick() {
      if (!wanted) return;
      if (!mesh) { build(); return; }
      const ex = getExagger();
      if (radiusAt && builtExag != null && Math.abs(ex - builtExag) > Math.abs(builtExag) * OUTLINE_EXAG_EPS) {
        const attr = mesh.geometry.getAttribute('position');
        outlinePositions(lonlat, radiusAt, attr.array);
        attr.needsUpdate = true;
        builtExag = ex;
      }
    },
    state() { return { built: !!mesh, visible: !!(mesh && mesh.visible), segments: lonlat ? lonlat.length / 4 : 0, exagger: builtExag }; },
    dispose() {
      if (!mesh) return;
      parent.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh = null;
    },
  };
}
