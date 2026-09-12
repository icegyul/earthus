// EARTHUS ICON SYSTEM — v1 · v2 공용 아이콘 정본
// 인수 패키지: docs/icon-system/EARTHUS_ICON_SYSTEM_DEV_DIRECTIVE_v1.1.md (2026-09-12)
// 자산: prototype/assets/earthus-icons/ (24·32·64·128px PNG · 투명 배경)
//
// ⚠️ 이 파일이 존재하는 이유가 지시서 §13 합격조건 그 자체다 —
//    "V1 과 V2 가 같은 라벨에 같은 아이콘 ID 를 쓴다."
//    두 화면이 각자 표를 들고 있으면 그 조건은 며칠 안에 깨진다. 표는 여기 하나뿐이다.
//
// ⚠️ 크기 이름 주의: 패키지의 `-128.png` 는 **실제로 110×110** 이다(36장 전부, 실측).
//    파일 이름을 바꾸지 않은 것은 레지스트리(assets/earthus-icons/registry.json)가
//    그 이름을 정본으로 적고 있기 때문이다. 2배 자산으로 쓸 때 110px 인 것을 알고 써라.

/* 자산 위치는 **이 파일 기준**으로 푼다(import.meta.url). v1 은 js/ 에서 직접 읽고,
   v2 소스는 저장소 위쪽을 거슬러 같은 파일을 읽으므로 양쪽이 같은 곳을 본다.
   ⚠️ 배포 번들에서도 이 파일은 js/ 바로 아래, 그림은 번들 루트 assets/ 아래여야 한다
      (tools/build-v2-bundle.sh 가 그렇게 복사한다). 한 칸 더 깊은 js/shared/ 로 옮기면
      아래 경로가 번들 밖을 가리키게 되고 번들 무결성 검사가 배포를 막는다.
   ⚠️ 이 주석에 위로 거슬러 올라가는 상대경로를 글자 그대로 적지 않는다 — 그 검사기는
      주석까지 훑기 때문에, 설명하려고 적어 둔 경로 한 줄이 배포를 막는다(실제로 막았다). */
const ICON_BASE = new URL('../assets/earthus-icons/', import.meta.url);

/** 지금 저장소에 **실제 파일이 있는** 아이콘 44종. 없는 것을 있다고 적지 않는다. */
const SHIPPED = new Set([
  'temperature', 'precipitation', 'wind', 'pressure',
  'sea-level', 'ocean-current', 'sea-temperature', 'typhoon',
  'glacier', 'snow-ice', 'flood-hydrology', 'drought',
  'wildfire', 'landslide', 'earthquake', 'tsunami',
  'storm-surge', 'sea-ice', 'permafrost', 'air-quality',
  'satellite-observation', 'ecosystem', 'agriculture', 'population-society',
  'forecast-scenario', 'tourism-culture', 'urban-infrastructure', 'energy',
  'water-resources', 'food-vegetation', 'health', 'economy',
  'education', 'policy-regulation', 'ai-research', 'settings',
  // v1.2 (2026-09-13) — 같은 화풍으로 새로 그린 여덟.
  // 이 여덟이 없던 동안 V1 대기질 일곱 줄이 전부 같은 동그라미였다.
  // 28px 에서 읽히는지 실측하고 넣었다(지시서 §13) — 첫 판은 풍경화라 뭉개져서 버렸다.
  'humidity', 'water-vapor', 'pm10', 'dust', 'aqi', 'uv', 'ozone', 'swell',
]);

/* 그림이 아직 없는 아이콘 → 그때까지 대신 쓸 부모.
   지시서 §6 의 "전용 아이콘이 생기기 전까지는 가장 가까운 부모를 상속한다" 를 코드로 옮긴 것이다.
   ⚠️ 지금은 비어 있다(44종 전부 그림이 있다). 지우지 않는다 — 다음 메뉴가 생기면
      아이콘이 도착하기 전에도 화면이 비지 않게 하는 자리다. 새 slug 를 여기 적고,
      그림이 오면 SHIPPED 로 옮긴다(SHIPPED 가 먼저 이기므로 양쪽에 있어도 해는 없다). */
const PENDING_PARENT = Object.freeze({});

/** 이름표 — 지시서 §5 표 그대로. 화면 문구가 아니라 개발·점검용이다. */
export const ICON_LABELS = Object.freeze({
  temperature: { ko: '기온', en: 'Temperature' },
  precipitation: { ko: '강수', en: 'Precipitation' },
  wind: { ko: '바람', en: 'Wind' },
  pressure: { ko: '기압', en: 'Pressure' },
  'sea-level': { ko: '해수면', en: 'Sea Level' },
  'ocean-current': { ko: '해류', en: 'Ocean Current' },
  'sea-temperature': { ko: '수온', en: 'Sea Temperature' },
  typhoon: { ko: '태풍', en: 'Typhoon' },
  glacier: { ko: '빙하', en: 'Glacier' },
  'snow-ice': { ko: '적설·빙설', en: 'Snow & Ice' },
  'flood-hydrology': { ko: '홍수·수문', en: 'Flood & Hydrology' },
  drought: { ko: '가뭄', en: 'Drought' },
  wildfire: { ko: '산불', en: 'Wildfire' },
  landslide: { ko: '산사태', en: 'Landslide' },
  earthquake: { ko: '지진', en: 'Earthquake' },
  tsunami: { ko: '지진해일', en: 'Tsunami' },
  'storm-surge': { ko: '해안재해', en: 'Storm Surge' },
  'sea-ice': { ko: '해빙', en: 'Sea Ice' },
  permafrost: { ko: '영구동토', en: 'Permafrost' },
  'air-quality': { ko: '대기질', en: 'Air Quality' },
  'satellite-observation': { ko: '위성·관측', en: 'Satellite & Observation' },
  ecosystem: { ko: '생태계', en: 'Ecosystem' },
  agriculture: { ko: '농업', en: 'Agriculture' },
  'population-society': { ko: '인구·사회', en: 'Population & Society' },
  'forecast-scenario': { ko: '미래예측', en: 'Forecast & Scenario' },
  'tourism-culture': { ko: '관광·문화', en: 'Tourism & Culture' },
  'urban-infrastructure': { ko: '도시·인프라', en: 'Urban & Infrastructure' },
  energy: { ko: '에너지', en: 'Energy' },
  'water-resources': { ko: '수자원', en: 'Water Resources' },
  'food-vegetation': { ko: '식량·식생', en: 'Food & Vegetation' },
  health: { ko: '건강', en: 'Health' },
  economy: { ko: '경제', en: 'Economy' },
  education: { ko: '교육', en: 'Education' },
  'policy-regulation': { ko: '정책·규제', en: 'Policy & Regulation' },
  'ai-research': { ko: 'AI 연구', en: 'AI Research' },
  settings: { ko: '설정', en: 'Settings' },
  // v1.2 로 추가할 여덟
  humidity: { ko: '습도', en: 'Humidity' },
  'water-vapor': { ko: '수증기', en: 'Water Vapour' },
  pm10: { ko: '미세먼지', en: 'PM10' },
  dust: { ko: '먼지·황사', en: 'Dust & Yellow Sand' },
  aqi: { ko: '대기질 지수', en: 'Air Quality Index' },
  uv: { ko: '자외선', en: 'UV Index' },
  ozone: { ko: '오존', en: 'Ozone' },
  swell: { ko: '너울', en: 'Swell' },
});

// ---------------------------------------------------------------------------
// V1 (prototype/js/layerbar.js ITEMS) — 레이어 id → 아이콘
// 근거: 지시서 §6 의 55-레이어 표. 표에 없는 V1 항목은 가장 가까운 부모를 준다.
// ⚠️ 위성 세 종(gk2aAuto·himawari·truecolor)은 **일부러 비워 둔다** —
//    지금 화면은 실제 위성 사진 썸네일(img/sat-*.png)을 쓰고 있고, 그건 '혼합 아이콘 계열'이
//    아니라 그 자료 자체의 미리보기다. 그림을 아이콘으로 바꾸면 셋이 전부 같은 동그라미가 된다.
//    (clouds 는 사진이 없어서 예외다 — 바로 아래에 이유를 적었다)
// ---------------------------------------------------------------------------
export const V1_LAYER_ICON = Object.freeze({
  // 위성 채널 — 사진 썸네일이 없는 것만 관측 부모를 준다.
  // ⚠️ clouds(전지구 합성)는 여러 나라 위성을 NOAA 가 합친 것이라 **보여 줄 기체가 하나도 없다** —
  //    그래서 사진 썸네일이 없고, 옆의 셋과 달리 혼자 옛 색 원으로 남아 있었다. §6 #11 대로 관측 아이콘을 준다.
  clouds: 'satellite-observation',
  gk2aIR: 'satellite-observation',
  gk2aNightLow: 'satellite-observation',
  gk2aVIS: 'satellite-observation',
  gk2aVISfd: 'satellite-observation',
  gk2aIRea: 'satellite-observation',
  gk2aVISea: 'satellite-observation',
  gk2aWV: 'water-vapor',
  himaIR: 'satellite-observation',

  // 기상
  temp: 'temperature',
  tmax: 'temperature',
  tmin: 'temperature',
  heatdome: 'temperature',
  wind: 'wind',
  windfc: 'wind',
  synop: 'satellite-observation',   // 일기도 기입 모형 = 지상 관측의 표준 표기 (§6 #44)
  humidity: 'humidity',
  tpw: 'water-vapor',
  pressure: 'pressure',
  rain: 'precipitation',
  fog: 'precipitation',
  drought: 'drought',
  landobs: 'satellite-observation',
  coverage: 'satellite-observation',
  ukfc: 'forecast-scenario',

  // 대기질 — 서로 다른 물질·양이라 각각 다른 아이콘을 쓴다.
  // 단 airkr(실측 관측소)과 pm25(격자 값)는 **같은 양**이라 한 아이콘을 공유한다.
  airkr: 'air-quality',
  pm25: 'air-quality',
  pm10: 'pm10',
  dust: 'dust',
  aqi: 'aqi',
  uv: 'uv',
  ozone: 'ozone',

  // 해양 — sst 와 sstanom 은 같은 양(값 vs 평년 편차)이라 한 아이콘을 공유한다.
  sst: 'sea-temperature',
  sstanom: 'sea-temperature',
  wave: 'sea-level',
  swell: 'swell',
  current: 'ocean-current',
  buoy: 'ocean-current',
  phenomena: 'ocean-current',
  ship: 'ocean-current',

  // 재해·사건
  cyclone: 'typhoon',
  alerts: 'typhoon',
  lightning: 'typhoon',
  regional: 'storm-surge',
  quake: 'earthquake',
  tsunami: 'tsunami',
  wildfire: 'wildfire',
  news: 'policy-regulation',

  // 하늘·우주
  aurora: 'satellite-observation',
  eclipse: 'satellite-observation',

  // 사람·이동
  tourism: 'tourism-culture',
  poi: 'tourism-culture',
  flight: 'urban-infrastructure',
});

// ---------------------------------------------------------------------------
// V2 (prototype/v2-three/js/phenomenon-registry.js) — 현상 id → 아이콘
// 66개 현상 전부에 아이콘이 있다. 빈 칸을 남기면 메뉴가 들쭉날쭉해진다.
// ---------------------------------------------------------------------------
export const V2_PHENOMENON_ICON = Object.freeze({
  // 날씨
  'weather.temperature': 'temperature',
  'weather.temperature_anomaly': 'temperature',
  'weather.daily_extremes': 'temperature',
  'weather.mountain_summit': 'temperature',
  'weather.precipitation': 'precipitation',
  'weather.cloud': 'precipitation',
  'weather.fog': 'precipitation',
  'weather.upper_moisture': 'water-vapor',
  'weather.wind': 'wind',
  'weather.paragliding': 'wind',
  'weather.pressure': 'pressure',
  'weather.warning': 'typhoon',
  'weather.air_quality': 'air-quality',
  'weather.uv': 'uv',
  'weather.station_obs': 'satellite-observation',
  'weather.climate_series': 'forecast-scenario',

  // 바다
  'ocean.sst': 'sea-temperature',
  'ocean.sst_anomaly': 'sea-temperature',
  'ocean.subsurface_profile': 'sea-temperature',
  'ocean.sea_level_rise': 'sea-level',
  'ocean.wave': 'sea-level',
  'ocean.surf_conditions': 'swell',
  'ocean.coastal_inundation': 'storm-surge',
  'ocean.surface_current': 'ocean-current',
  'ocean.sea_observation': 'ocean-current',
  'ocean.vessel_traffic': 'ocean-current',
  'ocean.fishing_conditions': 'ocean-current',
  'ocean.sea_ice': 'sea-ice',
  'ocean.bathymetry': 'sea-level',
  'ocean.trench': 'sea-level',
  'ocean.deep_sea': 'sea-level',
  'ocean.coastal_spots': 'tourism-culture',
  'ocean.sea_turtle': 'ecosystem',
  'ocean.seabird': 'ecosystem',

  // 재해
  'hazards.earthquake': 'earthquake',
  'hazards.crustal_motion': 'earthquake',
  'hazards.tsunami': 'tsunami',
  'hazards.typhoon': 'typhoon',
  'hazards.lightning': 'typhoon',
  'hazards.wildfire': 'wildfire',
  'hazards.glacial_lake_flood': 'flood-hydrology',

  // 땅
  'land.terrain': 'urban-infrastructure',
  'land.forest': 'ecosystem',
  'land.snow_cover': 'snow-ice',
  'land.surface_temperature': 'temperature',
  'land.crustal_motion': 'earthquake',
  'land.bird_migration': 'ecosystem',
  'land.bird_survey': 'ecosystem',

  // 사람
  'people.population': 'population-society',
  'people.crowding': 'population-society',
  'people.night_lights': 'urban-infrastructure',
  'people.news': 'policy-regulation',

  // 여행
  'travel.today_pick': 'tourism-culture',
  'travel.place_catalog': 'tourism-culture',
  'travel.place_sequence': 'tourism-culture',
  'travel.visitor_pressure': 'tourism-culture',
  'travel.poi': 'tourism-culture',
  'travel.flight': 'urban-infrastructure',

  // 우주
  'space.satellite': 'satellite-observation',
  'space.orbital_debris': 'satellite-observation',
  'space.aurora': 'satellite-observation',
  'space.rocket_launch': 'satellite-observation',
  'space.solar_activity': 'satellite-observation',
  'space.solar_system': 'satellite-observation',
  'space.photo': 'satellite-observation',
  'space.galaxy': 'satellite-observation',
});

/** 실제로 그릴 수 있는 slug 로 바꾼다. 그림이 없으면 부모로 내린다. 끝내 없으면 null. */
export function resolveIcon(slug) {
  if (!slug) return null;
  if (SHIPPED.has(slug)) return slug;
  const parent = PENDING_PARENT[slug];
  return parent && SHIPPED.has(parent) ? parent : null;
}

/** 파일 주소. size 는 24·32·64·128 중 하나 (128 은 실제 110px). */
export function iconSrc(slug, size = 64) {
  const real = resolveIcon(slug);
  return real ? new URL(`earthus-icon-${real}-${size}.png`, ICON_BASE).href : null;
}

/** 2배 화면까지 한 번에. `<img src srcset>` 에 그대로 넣는다. */
export function iconSrcSet(slug, size = 64, retina = 128) {
  const one = iconSrc(slug, size);
  if (!one) return null;
  const two = iconSrc(slug, retina);
  return two && two !== one ? `${one} 1x, ${two} 2x` : null;
}

/** V1 레이어 하나의 아이콘 slug (없으면 null → 부르는 쪽이 기존 썸네일을 그린다). */
export const iconForV1Layer = (layerId) => resolveIcon(V1_LAYER_ICON[layerId]);

/** V2 현상 하나의 아이콘 slug. */
export const iconForPhenomenon = (phenomenonId) => resolveIcon(V2_PHENOMENON_ICON[phenomenonId]);

/** 점검용 — 아직 그림이 없어 부모로 내려간 항목들. 시험이 읽는다. */
export const pendingIcons = () => Object.keys(PENDING_PARENT).filter((s) => !SHIPPED.has(s));
