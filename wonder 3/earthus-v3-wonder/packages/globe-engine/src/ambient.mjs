// EARTHUS V3 WONDER — globe-engine / ambient (PHASE 1 Paper Earth Core)
// 지구 둘레의 조용한 것들: 별밭 · 종이 구름 · 대륙 이름표. 전부 순수 계산(three·DOM 없음) — earth.mjs 가 이 계획을 받아 장면에 세운다.
// 규칙: 지구가 주인공이다. 구름은 적게(기본 10장), 이름표는 대륙 6개만(과도한 라벨 금지), 별은 배경으로만.

const rng = seed => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

/** 대륙 이름표 — 6개만. 승인된 reference 의 종이 태그. 나라 이름·바다 이름은 넣지 않는다(PHASE 2 LOD 의 몫). */
export const CONTINENT_TAGS = Object.freeze([
  { id: 'asia', ko: '아시아', en: 'ASIA', lat: 44, lon: 92 },
  { id: 'europe', ko: '유럽', en: 'EUROPE', lat: 52, lon: 14 },
  { id: 'africa', ko: '아프리카', en: 'AFRICA', lat: 2, lon: 20 },
  { id: 'north-america', ko: '북아메리카', en: 'NORTH AMERICA', lat: 45, lon: -100 },
  { id: 'south-america', ko: '남아메리카', en: 'SOUTH AMERICA', lat: -12, lon: -58 },
  { id: 'oceania', ko: '오세아니아', en: 'AUSTRALIA', lat: -25, lon: 134 },
]);

/**
 * 종이 구름 배치. 지구 가까이(r 1.03~1.16) 떠서 아주 느리게 동쪽으로 흐른다.
 * 반지름이 큰 몇 장은 실루엣 밖으로 삐져나와 "지구 옆에 떠 있는 구름"이 된다(reference).
 * @returns {{lat:number, lon:number, r:number, size:number, degPerSec:number, shape:number}[]}
 */
export function cloudPlan(n = 10, seed = 20260913) {
  const rnd = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const band = i % 3;                                   // 0 적도대 · 1 중위도 · 2 높은 쪽
    const lat = (rnd() < .5 ? 1 : -1) * (band === 0 ? rnd() * 16 : band === 1 ? 18 + rnd() * 22 : 42 + rnd() * 22);
    out.push({
      lat, lon: (i * 360 / n + rnd() * 24) - 180,
      r: 1.03 + rnd() * 0.13,
      size: 0.17 + rnd() * 0.13,
      degPerSec: 0.35 + rnd() * 0.5,                      // 한 바퀴 약 12~17분 — 움직임을 알아채기 전에 멈추지 않을 만큼만
      shape: Math.floor(rnd() * 3),
    });
  }
  return out;
}

/** 별밭. 카메라보다 훨씬 먼 구면에 뿌린다 — 지구를 돌리면 별도 같이 흐른다. */
export function starPlan(n = 420, seed = 7) {
  const rnd = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, k = Math.sqrt(1 - u * u), R = 26 + rnd() * 10;
    out.push({ x: R * k * Math.cos(th), y: R * u, z: R * k * Math.sin(th), size: 0.06 + rnd() * 0.16, alpha: 0.35 + rnd() * 0.6 });
  }
  return out;
}
