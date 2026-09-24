// EARTHUS 새 탭 — 태양 직하점 (2026-09-24 · 지시서 APP-ANDROID-CHROME-NEWTAB-DIRECTIVE §4-3)
//
// 출처: prototype/v2-three/js/main.js:126 subsolarPoint() 를 그대로 옮겼다(식·상수 변경 없음).
//   NOAA 근사식 — 적위 오차 ±0.01° 수준이면 조명용으로 충분하다(원본 주석).
//   두 곳이 어긋나면 v2 지구와 새 탭의 밤 경계가 달라진다 — 원본을 고치면 여기도 고친다.
// 새 탭에서 이 값의 쓰임: 여는 순간 한 번 계산해 밤 경계를 그리고, 출처 줄에 '지금 태양 위치로 계산 (HH:MM KST)' 로 시각을 밝힌다.
//   예보가 아니다 — 여는 순간의 계산값이다.

export function subsolarPoint(date) {
  const DEG = Math.PI / 180;
  // J2000 기준 경과일 (UTC)
  const n = date.getTime() / 86400000 - 10957.5;
  const L = (280.460 + 0.9856474 * n) % 360;         // 평균 황경
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG; // 평균 근점이각
  const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;        // 황도 경사

  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda)); // 적위(rad)

  // 균시차: 평균 황경 - 적경 (°), [-180,180]로 감아 분 단위 환산
  const alpha = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG;
  const dAngle = (((L - alpha) % 360) + 540) % 360 - 180;
  const eotMin = 4 * dAngle;

  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  let lonDeg = -15 * (utcHours - 12 + eotMin / 60); // 동경 +
  lonDeg = ((lonDeg + 540) % 360) - 180;

  return { latRad: decl, lonRad: lonDeg * DEG, declDeg: decl / DEG, lonDeg };
}

// 태양 고도(°) — 위도·경도(°)의 지점에서 본 지금 태양의 높이. 0 = 지평선, 음수 = 밤.
//   sin h = sin φ sin δ + cos φ cos δ cos(λ − λs)
export function sunElevationDeg(latDeg, lonDeg, sun) {
  const DEG = Math.PI / 180;
  const phi = latDeg * DEG;
  const s = Math.sin(phi) * Math.sin(sun.latRad)
    + Math.cos(phi) * Math.cos(sun.latRad) * Math.cos(lonDeg * DEG - sun.lonRad);
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
}
