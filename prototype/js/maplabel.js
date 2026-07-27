// 지도 라벨 공용 스타일
//
// 왜 만들었나
//   "시위·집회" 가 화면에서 읽을 수 없는 덩어리로 나왔다.
//   원인은 11px 글자에 3px 검은 외곽선(FILL_AND_OUTLINE)을 준 것이다.
//
//   ⚠️ 이건 한글에서만 터지는 문제다.
//      라틴 문자는 획이 적고 열려 있어 외곽선 3px 을 버틴다.
//      한글은 한 글자에 획이 여러 개 겹쳐 있어(시·위·집·회 모두 그렇다)
//      안쪽으로 파고든 외곽선이 획 사이 공간을 메워버린다.
//      영어로 테스트하면 멀쩡해 보여서 놓치기 쉽다 — 실제로 놓쳤다.
//
// 해결
//   외곽선 대신 **배경 알약(showBackground)** 을 쓴다.
//   글자 자체는 건드리지 않고 뒤에 판을 깔아 대비를 만든다. 획이 안 뭉갱진다.
//   Cesium 이 기본으로 지원하는 기능이라 추가 비용도 없다.
//
// 여기 한곳에서 정의하는 이유
//   레이어마다 손으로 스타일을 적어두면 또 어긋난다.
//   새 라벨을 만들 때 이 함수를 쓰면 같은 실수가 반복되지 않는다.

/** 라벨 크기 단계 */
const SIZE = {
  sm: { px: 12,   pad: [6, 4] },
  md: { px: 13,   pad: [7, 4] },
  lg: { px: 14.5, pad: [8, 5] },
};

/**
 * 지도용 라벨 그래픽을 만든다.
 *
 * @param {object} o
 *   text        표시할 글자 (필수)
 *   color       글자색 (Cesium.Color 또는 CSS 문자열)
 *   size        'sm' | 'md' | 'lg'
 *   weight      글자 굵기 (기본 500)
 *   offsetY     픽셀 오프셋 (기본 -20, 마커 위)
 *   maxDistance 이 거리보다 멀면 숨긴다 (m)
 *   alwaysOnTop 지구 뒤편에서도 보이게 할지
 */
export function mapLabel(o = {}) {
  const s = SIZE[o.size] || SIZE.sm;
  const col = typeof o.color === 'string'
    ? Cesium.Color.fromCssColorString(o.color)
    : (o.color || Cesium.Color.WHITE);

  const g = {
    text: o.text,
    /* ⚠️ 한글 폰트를 반드시 지정한다.
       -apple-system 만 두면 안드로이드·윈도우에서 대체 폰트로 떨어져
       자간이 틀어지고 굵기가 달라진다. */
    font: `${o.weight ?? 500} ${s.px}px -apple-system, "Apple SD Gothic Neo", `
        + `"Noto Sans KR", system-ui, sans-serif`,
    fillColor: col,
    // 외곽선을 쓰지 않는다 (위 머리말 참고)
    style: Cesium.LabelStyle.FILL,
    showBackground: true,
    backgroundColor: new Cesium.Color(0.02, 0.04, 0.07, 0.72),
    backgroundPadding: new Cesium.Cartesian2(s.pad[0], s.pad[1]),
    pixelOffset: new Cesium.Cartesian2(0, o.offsetY ?? -20),
    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    /* 라벨이 겹치면 Cesium 이 알아서 밀어내지 않는다 —
       그래서 거리 조건으로 개수를 줄이는 게 유일한 수단이다. */
    ...(o.maxDistance
      ? { distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, o.maxDistance) }
      : {}),
    /* ⚠️ Infinity 를 쓰면 지구 반대편 라벨이 뚫고 보인다.
       (실제로 카리브해 쓰나미 라벨이 한국 상공에서 보였다.
        pointLayer.js 에 같은 함정을 적어뒀는데 또 밟았다.)
       유한값이면 "카메라가 이만큼 가까울 때만" 깊이검사를 끈다:
         전지구 뷰(수만 km) → 깊이검사 ON  → 뒤편 라벨 가려짐 ✓
         근접 뷰(수백 km)   → 깊이검사 OFF → 지형에 파묻히지 않음 ✓ */
    disableDepthTestDistance: o.alwaysOnTop ? 1_500_000 : 600_000,
  };
  return g;
}
