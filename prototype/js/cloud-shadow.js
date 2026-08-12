/* NOAA 구름 알파로 만드는 시각용 지표 그림자.
 *
 * 이것은 구름 높이 관측이나 일사량 자료가 아니다. 같은 관측 알파를 관측 시각의
 * 태양 방향으로 조금 투영해 지구본의 깊이만 보강한다. 결과를 예보·위험·영향 판단에
 * 쓰지 않으며, 대표 높이도 화면 수치나 자료 속성으로 노출하지 않는다. */

const EARTH_RADIUS_M = 6_371_000;
const VISUAL_CLOUD_HEIGHT_M = 12_000;
const MIN_SUN_DOT = 0.06;
const FULL_SUN_DOT = 0.20;
const MAX_SURFACE_SHIFT_RAD = 0.022;
const SHADOW_DOWNSAMPLE = 4;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function normalizeCloudShadowSun(sun) {
  if (!Array.isArray(sun) || sun.length !== 3 || !sun.every(Number.isFinite)) {
    throw new TypeError('FINITE_SUN_VECTOR_REQUIRED');
  }
  const magnitude = Math.hypot(sun[0], sun[1], sun[2]);
  if (!(magnitude > 0)) throw new RangeError('NONZERO_SUN_VECTOR_REQUIRED');
  return sun.map(value => value / magnitude);
}

/** 한 지표 화소의 그림자를 만든 구름 원본 위치를 역으로 찾는다. */
export function cloudShadowSourceAt({ longitude, latitude, sun, cloudHeightMeters = VISUAL_CLOUD_HEIGHT_M }) {
  if (![longitude, latitude, cloudHeightMeters].every(Number.isFinite)) {
    throw new TypeError('FINITE_CLOUD_SHADOW_INPUT_REQUIRED');
  }
  if (!(cloudHeightMeters > 0)) throw new RangeError('CLOUD_HEIGHT_OUT_OF_RANGE');
  const [sx, sy, sz] = normalizeCloudShadowSun(sun);
  const cosLat = Math.cos(latitude);
  const nx = cosLat * Math.cos(longitude);
  const ny = cosLat * Math.sin(longitude);
  const nz = Math.sin(latitude);
  const sunDot = sx * nx + sy * ny + sz * nz;
  if (sunDot <= MIN_SUN_DOT) return null;

  // 그림자 지점에서 태양 쪽으로 올라가 원래 구름 위치를 찾는다.
  const tangentX = sx - sunDot * nx;
  const tangentY = sy - sunDot * ny;
  const tangentZ = sz - sunDot * nz;
  const tangentMagnitude = Math.hypot(tangentX, tangentY, tangentZ);
  const rawShift = (cloudHeightMeters / EARTH_RADIUS_M) * tangentMagnitude / sunDot;
  const surfaceShift = Math.min(MAX_SURFACE_SHIFT_RAD, rawShift);
  const tangentScale = tangentMagnitude > 0 ? surfaceShift / tangentMagnitude : 0;
  const cx = nx + tangentX * tangentScale;
  const cy = ny + tangentY * tangentScale;
  const cz = nz + tangentZ * tangentScale;
  const magnitude = Math.hypot(cx, cy, cz);
  return Object.freeze({
    longitude: Math.atan2(cy, cx),
    latitude: Math.asin(clamp(cz / magnitude, -1, 1)),
    daylight: smoothstep(MIN_SUN_DOT, FULL_SUN_DOT, sunDot),
  });
}

/** equirectangular 구름 RGBA에서 저해상도의 부드러운 그림자 알파를 만든다. */
export function buildCloudShadowAlpha({ rgba, sourceWidth, sourceHeight, north, south, sun }) {
  if (!(rgba instanceof Uint8ClampedArray)
      || ![sourceWidth, sourceHeight, north, south].every(Number.isFinite)) {
    throw new TypeError('VALID_CLOUD_RASTER_REQUIRED');
  }
  if (sourceWidth <= 0 || sourceHeight <= 0 || rgba.length !== sourceWidth * sourceHeight * 4
      || north <= south) {
    throw new RangeError('CLOUD_RASTER_DIMENSION_OUT_OF_RANGE');
  }
  const normalizedSun = normalizeCloudShadowSun(sun);
  /* 그림자는 원본 디테일을 복제하는 층이 아니다. 1/4 해상도면 흐린 윤곽에는 충분하고,
     2K GMGSI 한 장의 초기 투영량을 약 16만 화소로 제한해 구형 기기 로딩을 보호한다. */
  const width = Math.ceil(sourceWidth / SHADOW_DOWNSAMPLE);
  const height = Math.ceil(sourceHeight / SHADOW_DOWNSAMPLE);
  const alpha = new Uint8ClampedArray(width * height);
  const longitudeSpan = Math.PI * 2;
  const latitudeSpan = north - south;

  for (let y = 0; y < height; y += 1) {
    const latitude = north - (y / Math.max(1, height - 1)) * latitudeSpan;
    for (let x = 0; x < width; x += 1) {
      const longitude = -Math.PI + (x / Math.max(1, width - 1)) * longitudeSpan;
      const source = cloudShadowSourceAt({ longitude, latitude, sun: normalizedSun });
      if (!source || source.latitude > north || source.latitude < south) continue;
      const sourceX = Math.round(((source.longitude + Math.PI) / longitudeSpan) * (sourceWidth - 1));
      const sourceY = clamp(
        Math.round(((north - source.latitude) / latitudeSpan) * (sourceHeight - 1)),
        0,
        sourceHeight - 1,
      );
      const wrappedX = ((sourceX % sourceWidth) + sourceWidth) % sourceWidth;
      const sourceAlpha = rgba[(sourceY * sourceWidth + wrappedX) * 4 + 3];
      alpha[y * width + x] = Math.round(sourceAlpha * source.daylight);
    }
  }
  return Object.freeze({ width, height, alpha });
}
