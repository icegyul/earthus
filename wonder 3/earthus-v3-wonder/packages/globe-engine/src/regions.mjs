// EARTHUS V3 WONDER — globe-engine / regions (순수, DOM 없음)
// Master Directive §3 의 Region 예 9개(East Asia · Europe · North Africa · South Asia · Southeast Asia · North America
// · South America · Oceania · Polar)에, 아이가 눌렀을 때 빈 곳이 없도록 Africa · Middle East/Central Asia · Siberia 를 더했다(PD 확인 항목).
// 지역은 "중심 + 반경(km)" 이다. 탭 좌표에서 (거리/반경) 이 가장 작은 지역을 고른다. 반경 밖(먼바다)이면 null.
import { haversineKm } from './geo.mjs';

export const REGIONS = Object.freeze([
  { id: 'east-asia',       nameKo: '동아시아',        nameEn: 'East Asia',            centers: [{ lat: 35, lon: 115 }],  radiusKm: 3300, directive: true },
  { id: 'europe',          nameKo: '유럽',            nameEn: 'Europe',               centers: [{ lat: 50, lon: 15 }],   radiusKm: 2800, directive: true },
  { id: 'north-africa',    nameKo: '북아프리카',      nameEn: 'North Africa',         centers: [{ lat: 25, lon: 15 }],   radiusKm: 2600, directive: true },
  { id: 'south-asia',      nameKo: '남아시아',        nameEn: 'South Asia',           centers: [{ lat: 22, lon: 78 }],   radiusKm: 2200, directive: true },
  { id: 'southeast-asia',  nameKo: '동남아시아',      nameEn: 'Southeast Asia',       centers: [{ lat: 5, lon: 110 }],   radiusKm: 2500, directive: true },
  { id: 'north-america',   nameKo: '북아메리카',      nameEn: 'North America',        centers: [{ lat: 45, lon: -100 }], radiusKm: 4200, directive: true },
  { id: 'south-america',   nameKo: '남아메리카',      nameEn: 'South America',        centers: [{ lat: -15, lon: -60 }], radiusKm: 3500, directive: true },
  { id: 'oceania',         nameKo: '오세아니아',      nameEn: 'Oceania',              centers: [{ lat: -25, lon: 135 }], radiusKm: 4000, directive: true },
  { id: 'polar',           nameKo: '극지방',          nameEn: 'Polar',                centers: [{ lat: 85, lon: 0 }, { lat: -80, lon: 0 }], radiusKm: 2800, directive: true },
  { id: 'africa',          nameKo: '아프리카',        nameEn: 'Africa',               centers: [{ lat: -2, lon: 22 }],   radiusKm: 3600, directive: false },
  { id: 'middle-east',     nameKo: '중동·중앙아시아', nameEn: 'Middle East & Central Asia', centers: [{ lat: 35, lon: 55 }], radiusKm: 2500, directive: false },
  { id: 'siberia',         nameKo: '시베리아',        nameEn: 'Siberia',              centers: [{ lat: 62, lon: 95 }],   radiusKm: 3500, directive: false },
]);

/**
 * 좌표 → 지역. 반경 안에서 (거리/반경) 최소. 극지는 위도만으로도 판정한다(|lat| ≥ 66).
 * @returns {{ region: object, distanceKm: number, center: {lat:number,lon:number} } | null}
 */
export function regionAt(lat, lon, regions = REGIONS) {
  let best = null;
  for (const r of regions) {
    for (const c of r.centers) {
      const d = haversineKm(lat, lon, c.lat, c.lon);
      const ratio = d / r.radiusKm;
      if (ratio <= 1 && (!best || ratio < best.ratio)) best = { region: r, distanceKm: Math.round(d), center: c, lat, lon, ratio };
    }
  }
  if (!best && Math.abs(lat) >= 66) {
    const r = regions.find(x => x.id === 'polar');
    const c = lat > 0 ? r.centers[0] : r.centers[1];
    return { region: r, distanceKm: Math.round(haversineKm(lat, lon, c.lat, c.lon)), center: c, lat, lon };
  }
  if (!best) return null;
  const { ratio, ...rest } = best; return rest;
}

/** 지역 진입 때 카메라가 볼 중심. 극지는 눌린 반구 쪽. */
/**
 * 지역 진입 때 카메라·마커가 갈 곳 = **손가락이 닿은 그 자리**(hit.lat/lon). 지역 중심이 아니다.
 * 2026-09-13 실기기(iOS): 한국을 톡 누르면 동아시아 중심(35°N 115°E, 중국 내륙)으로 날아가 마커가 중국에 찍혔다 — PD 신고.
 * 라벨은 지역 이름 그대로(나라 이름은 뒤 단계). 좌표가 없는 hit(옛 호출)만 중심으로 간다.
 */
export function regionFocus(hit) {
  if (Number.isFinite(hit.lat) && Number.isFinite(hit.lon)) return { lat: hit.lat, lon: hit.lon };
  return { lat: hit.center.lat, lon: hit.center.lon };
}
