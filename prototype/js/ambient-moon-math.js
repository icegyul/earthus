/**
 * 현재 달의 카메라 평면 방향을 지구 둘레의 압축 반지름에 놓는다.
 * 실제 거리 대신 방향만 보존하며, 카메라와 같은 쪽인지 지구 뒤쪽인지 함께 반환한다.
 */
export function projectMoonDirection({
  horizontal,
  vertical,
  towardCamera,
  viewportWidth,
  viewportHeight,
  earthRadius,
  moonRadius,
  gap,
}) {
  const values = [horizontal, vertical, towardCamera, viewportWidth, viewportHeight,
    earthRadius, moonRadius, gap].map(Number);
  if (!values.every(Number.isFinite)) throw new TypeError('FINITE_MOON_PROJECTION_REQUIRED');
  if (viewportWidth <= 0 || viewportHeight <= 0 || earthRadius <= 0 || moonRadius <= 0 || gap < 0) {
    throw new RangeError('MOON_PROJECTION_DIMENSION_OUT_OF_RANGE');
  }

  const projectedLength = Math.hypot(horizontal, vertical);
  if (projectedLength < 1e-6) return Object.freeze({ visible: false, reason: 'VIEW_AXIS_ALIGNMENT' });

  const radius = earthRadius + moonRadius + gap;
  return Object.freeze({
    visible: true,
    x: viewportWidth / 2 + horizontal / projectedLength * radius,
    y: viewportHeight / 2 - vertical / projectedLength * radius,
    depth: towardCamera >= 0 ? 'near' : 'far',
    distanceMode: 'compressed-direction-preserving',
  });
}
