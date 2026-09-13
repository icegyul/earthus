// EARTHUS V3 WONDER — 배경 선택기 (Background Pack v1, PD 2026-09-13)
// 순수 함수: assets/background_manifest.json 을 받아 "지금 이 지역·지점·시각에 어떤 배경 하나를 쓰는가" 를 정한다. DOM·네트워크 없음.
// 규칙(우선순위): ① 환경 카탈로그가 지정한 배경(env.background) ② 한국 4곳 — 좌표 반경 안이면 그 도시 ③ 지역(regionId) 배정 ④ 대기(atmosphere) 는 시각으로
//               ⑤ 아무 것도 없으면 null (호출부가 종이 폴백을 그린다). 한 번에 하나만 고른다 — 24장을 미리 받지 않는다.
// REJECT(load = blocked-by-review) 인 배경은 절대 고르지 않는다. REVIEW/ACCEPT 만 후보다.
const R = 6371, rad = d => d * Math.PI / 180;
export function haversineKm(lat1, lon1, lat2, lon2) {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 배경별 모션 배정 — 정적 그림 위에 얹는 별도 레이어. MAIN 1 + SECONDARY ≤ 2 (지시 §8). 그림 파일 안에는 아무것도 굽지 않는다. */
export const MOTION = {
  earth: { main: 'clouds', secondary: ['stars'] },
  seoul: { main: 'clouds', secondary: ['petals'] }, busan: { main: 'clouds', secondary: ['shimmer'] }, gyeongju: { main: 'clouds', secondary: ['leaf-sway'] }, jeju: { main: 'clouds', secondary: ['shimmer'] },
  day: { main: 'clouds', secondary: [] }, sunset: { main: 'clouds', secondary: ['shimmer'] }, night: { main: 'stars', secondary: [] },
  himalaya: { main: 'clouds', secondary: ['snow', 'landmark-breathe'] }, tibet: { main: 'clouds', secondary: ['snow'] }, sahara: { main: 'sand', secondary: ['clouds'] }, savanna: { main: 'clouds', secondary: ['grass-sway'] },
  forest: { main: 'leaf-sway', secondary: ['shimmer'] }, jungle: { main: 'clouds', secondary: ['leaf-sway', 'shimmer'] }, ocean_shallow: { main: 'shimmer', secondary: ['bubbles'] }, underwater: { main: 'bubbles', secondary: ['shimmer'] },
  island: { main: 'clouds', secondary: ['shimmer'] }, coast: { main: 'shimmer', secondary: ['clouds'] }, volcano: { main: 'clouds', secondary: ['embers'] }, desert_oasis: { main: 'sand', secondary: ['shimmer'] },
  grassland: { main: 'clouds', secondary: ['grass-sway'] }, tundra: { main: 'snow', secondary: ['clouds'] }, canyon: { main: 'clouds', secondary: ['sand'] }, aurora: { main: 'aurora', secondary: ['snow'] },
};
export const MOTION_BUDGET = { main: 1, secondary: 2 };

/** 지역 진입 라벨용 짧은 느낌 말(사실 주장 아님 — 화면에서 <q> + "느낌 말" 표로 표시). */
export const LABEL_KO = {
  earth: '우주에서 본 우리 지구', seoul: '강과 탑이 있는 큰 도시', busan: '바다와 다리가 있는 항구', gyeongju: '기와지붕과 단풍 언덕', jeju: '바다 건너 큰 산이 보이는 섬',
  day: '맑은 낮 하늘', sunset: '노을이 번지는 하늘', night: '별이 쏟아지는 밤하늘',
  himalaya: '구름보다 높은 눈산', tibet: '설산 아래 하얀 궁전', sahara: '끝없는 모래 언덕', savanna: '넓은 풀밭과 우산 나무', forest: '시냇물이 흐르는 숲', jungle: '폭포가 떨어지는 정글',
  ocean_shallow: '맑고 얕은 바다', underwater: '햇빛이 내려오는 바닷속', island: '바다 한가운데 작은 섬', coast: '파도치는 절벽 바닷가', volcano: '연기 나는 불의 산', desert_oasis: '사막 속 야자나무 샘',
  grassland: '설산 앞 꽃밭 초원', tundra: '얼음과 눈뿐인 땅', canyon: '붉은 바위 사이 강', aurora: '밤하늘에 춤추는 빛',
};

export function motionFor(slug, override = null) {
  const m = override ?? MOTION[slug] ?? { main: 'clouds', secondary: [] };
  return { main: m.main, secondary: (m.secondary ?? []).slice(0, MOTION_BUDGET.secondary) };
}

/**
 * safe-crop cover 배치(순수 계산): 그림의 '안전 상자'(safeCropPx 를 뺀 부분)가 화면(Cw×Ch)을 완전히 덮도록 키우고, focal(0~1) 로 창을 둔다.
 * 반환 x/y 는 그림 좌상단의 화면 좌표(px), w/h 는 그림 표시 크기. coversViewport 가 false 면 여백이 보인다는 뜻(있어서는 안 된다).
 */
export function coverLayout(bg, Cw, Ch) {
  const c = bg.safeCropPx ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const Ws = bg.width - c.left - c.right, Hs = bg.height - c.top - c.bottom;
  const s = Math.max(Cw / Ws, Ch / Hs);
  const fx = bg.focal?.x ?? 0.5, fy = bg.focal?.y ?? 0.62;
  const x = -(c.left * s) - (Ws * s - Cw) * fx, y = -(c.top * s) - (Hs * s - Ch) * fy;
  const safe = { left: x + c.left * s, right: x + (bg.width - c.right) * s, top: y + c.top * s, bottom: y + (bg.height - c.bottom) * s };
  const eps = 1e-6;
  return { scale: s, x, y, w: bg.width * s, h: bg.height * s, safe, coversViewport: safe.left <= eps && safe.right >= Cw - eps && safe.top <= eps && safe.bottom >= Ch - eps,
    visibleFraction: { w: Cw / (bg.width * s), h: Ch / (bg.height * s) } };
}

/** @param {{assets: any[]}} manifest  assets/background_manifest.json */
export function createBackgroundSelector(manifest) {
  const all = manifest.assets;
  const byId = new Map(all.map(a => [a.id, a]));
  const loadable = a => !!a && a.load !== 'blocked-by-review' && a.status !== 'REJECT';
  const korea = all.filter(a => a.category === 'korea' && a.geo);
  const regionOf = id => all.find(a => a.category === 'region' && Array.isArray(a.region) && a.region.includes(id) && loadable(a)) ?? null;

  /** 시각(0~23)으로 대기 배경. */
  function atmosphere(hour) {
    const slug = hour >= 6 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'sunset' : 'night';
    const a = all.find(x => x.category === 'atmosphere' && x.slug === slug);
    return loadable(a) ? a : null;
  }

  /**
   * @param {{ envBackground?: string|null, lat?: number, lon?: number, regionId?: string|null, hour?: number }} q
   * @returns {{ asset: object|null, reason: string, distanceKm?: number }}
   */
  function select({ envBackground = null, lat = null, lon = null, regionId = null, hour = null } = {}) {
    if (envBackground) { const a = byId.get(envBackground); if (loadable(a)) return { asset: a, reason: 'environment' }; }
    if (lat != null && lon != null) {
      let best = null;
      for (const a of korea) {
        const d = haversineKm(lat, lon, a.geo.lat, a.geo.lon);
        if (d <= (a.geo.radiusKm ?? 60) && loadable(a) && (!best || d < best.d)) best = { a, d };
      }
      if (best) return { asset: best.a, reason: 'korea', distanceKm: Math.round(best.d) };
    }
    if (regionId) {
      if (regionId === 'polar' && lat != null) {                       // 북극은 오로라, 남극은 툰드라
        const want = lat >= 0 ? 'aurora' : 'tundra';
        const a = all.find(x => x.slug === want); if (loadable(a)) return { asset: a, reason: 'region' };
      }
      const a = regionOf(regionId); if (a) return { asset: a, reason: 'region' };
    }
    if (hour != null) { const a = atmosphere(hour); if (a) return { asset: a, reason: 'atmosphere' }; }
    return { asset: null, reason: 'none' };
  }

  return { select, atmosphere, byId: id => byId.get(id) ?? null, loadable: id => loadable(byId.get(id)), list: () => all.slice(), motionFor: (id, o) => motionFor(byId.get(id)?.slug, o) };
}
