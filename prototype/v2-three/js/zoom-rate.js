// 핀치·휠 줌이 카메라 거리를 얼마나 바꾸나 — 한 곳에서 정한다 (2026-09-24 PD: "줌 들어가는 속도도 빨라 … 조금만 더 줄여도").
//
// 예전 식: targetDist *= factor (factor = 손가락 간격 비 · 휠 exp(deltaY×0.0011)).
//   dist 는 '지구 중심까지'라 지표까지의 고도(dist − 1)로 보면 로그 변화율이 dist/(dist−1) 배로 불어난다 —
//   멀리(dist 3)서는 1.5배라 괜찮았지만, 637 km(dist 1.1)에서는 11배, 250 km 에서는 26배였다.
//   실측(2026-09-24 폰 402×714): 637 km 에서 손가락을 1.25배만 벌려도 하한(127 km)까지 한 번에 떨어졌다.
//
// 지금 식: 고도를 곱한다. 고도의 로그 변화율 = min(dist/(dist−1), CAP) × SLOW.
//   · 먼 거리(지구 전체)에서는 예전과 거의 같다(dist 3: 1.5 → 1.35, 10% 느림) — 지구→대륙은 여전히 한두 번에 간다.
//   · 가까워질수록 CAP 에 걸려 더는 빨라지지 않는다 — 637 km → 127 km 에 손가락 2배쯤이 든다(예전 1.25배).
//   작은 한 걸음에서 CAP·SLOW 가 없으면(= 1) 예전 식과 같은 값이 나온다(시험이 이 등식을 잡고 있다).
export const ZOOM_RATE_CAP = 2.5;
export const ZOOM_SLOW = 0.9;

/**
 * @param {number} dist   지금 목표 거리(지구 반지름 배수, 1 = 지표)
 * @param {number} factor 예전 식에서 dist 에 곱하던 비(>1 멀어짐 · <1 가까워짐)
 * @param {{cap?: number, slow?: number}} [opt]
 * @returns {number} 새 목표 거리 — 하한·상한 자르기는 부르는 쪽이 한다(minDist 는 층마다 바뀐다)
 */
export function zoomDist(dist, factor, opt = {}) {
  const cap = opt.cap ?? ZOOM_RATE_CAP;
  const slow = opt.slow ?? ZOOM_SLOW;
  if (!(factor > 0) || !Number.isFinite(factor) || !(dist > 1)) return dist * (factor > 0 ? factor : 1);
  const alt = dist - 1;
  const rate = Math.min(dist / alt, cap) * slow;
  return 1 + alt * Math.exp(Math.log(factor) * rate);
}
