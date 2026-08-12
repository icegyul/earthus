/** 축약 3D 위치를 화면에 그릴 수 있는지 판정한다. 화면 테두리로 끌어오지 않는다. */
export function classifyMoonDisplay({
  inFront,
  occludedByEarth,
  screenX,
  screenY,
  viewportWidth,
  viewportHeight,
  moonRadius,
}) {
  const dimensions = [viewportWidth, viewportHeight, moonRadius].map(Number);
  if (!dimensions.every(Number.isFinite)) throw new TypeError('FINITE_MOON_PROJECTION_REQUIRED');
  if (viewportWidth <= 0 || viewportHeight <= 0 || moonRadius <= 0) {
    throw new RangeError('MOON_PROJECTION_DIMENSION_OUT_OF_RANGE');
  }
  if (!inFront) return Object.freeze({ visible: false, reason: 'BEHIND_CAMERA' });
  if (occludedByEarth) return Object.freeze({ visible: false, reason: 'EARTH_OCCLUDED' });
  if (![screenX, screenY].map(Number).every(Number.isFinite)) {
    throw new TypeError('FINITE_MOON_PROJECTION_REQUIRED');
  }
  if (screenX + moonRadius < 0 || screenX - moonRadius > viewportWidth
      || screenY + moonRadius < 0 || screenY - moonRadius > viewportHeight) {
    return Object.freeze({ visible: false, reason: 'OUTSIDE_VIEWPORT' });
  }
  return Object.freeze({
    visible: true,
    x: screenX,
    y: screenY,
    distanceMode: 'compressed-3d-direction-preserving',
  });
}
