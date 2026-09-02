// 전역 설정 — 임계값, 엔드포인트, 티어 정의
// 인수인계 §5-9 / §5-10 / §3 기준

export const CESIUM_VER = '1.143.0';

/* ── 줌 임계 (§5-10, 실기기 조정 대상) ─────────────────────────── */
export const T = {
  CHROME: 9_000_000,  // 이하 → Ambient 크롬 페이드아웃, Explore 진입
  PIN:    1_500_000,  // 이하 → 점(point) 레이어 등장 (국가급)
  EXPAND:   500_000,  // 이하 → 클러스터 해제, 개별 전개 (시도급)
  // 위성은 반대다 — "이 이상 멀어지면" 보인다.
  // 가까이서는 궤도가 화면 밖이라 점만 떠다니고 지표를 가린다.
  // CHROME(9,000km)과 같은 지점으로 잡아 Ambient 로 나가는 순간 궤도가 켜지게 한다.
  SAT_SHOW: 9_000_000,
};

/* ── 데이터 소스 ──────────────────────────────────────────────── */

/* 자료를 어디서 받을지 — **열린 주소를 보고 스스로 고른다.**
 *
 * earthus.net 으로 열었으면 빈 문자열('')을 써서 **같은 출처**로 받는다.
 *   · CloudFront 가 brotli 로 압축해 준다 (JSON 은 통상 70~90% 축소).
 *     받는 양이 줄면 통신 모듈이 켜져 있는 시간이 줄고, 그게 곧 발열·배터리다.
 *   · 한국 엣지에 캐시된다.
 *   · 같은 출처라 CORS 예비요청(preflight)이 아예 없다.
 *
 * 그 밖(로컬 개발·옛 S3 주소)에서는 S3 로 직접 간다.
 *   ⚠️ 여기를 earthus.net 으로 고정하면 S3 주소나 localhost 로 열었을 때
 *      전부 교차출처가 되어 CORS 로 막힌다. 고정하지 말 것.
 */
const CDN = location.hostname.endsWith('earthus.net')
  ? ''
  : 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';

export const API = {
  GIBS: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best',   // 4326 격자는 Cesium 과 안 맞음
  // 전지구 구름 합성 (위스콘신대 SSEC). 정지위성 낱장을 직접 겹치면 이음매가 생겨서 이걸 쓴다.
  // 출처 표기 의무: "Source: SSEC RealEarth, UW-Madison"
  REALEARTH: 'https://realearth.ssec.wisc.edu/api',   // 폴백 전용 (워터마크·한도 있음)
  // 1순위 구름 — Lambda(gmgsi-clouds)가 NOAA GMGSI 를 매시간 합성해 올린다.
  // 퍼블릭 도메인이라 워터마크·사용량 한도·라이선스 제약이 없다.
  CLOUDS: CDN + '/clouds',
  // 천리안2A(GK-2A) — Lambda(gk2a-clouds)가 NOAA 공개 원본을 받아
  // 전면 8km + 동아시아 2km 타일 / 한반도 낮 가시광 0.5km로 올린다.
  //    구름(밤에도) / 구름(낮) / 상층 수증기 + meta.json
  // ⚠️ clouds/ 아래다. 버킷 공개 접두사가 고정이라 gk2a/ 로 두면 403 이 난다(실측).
  GK2A:   CDN + '/clouds/gk2a',
  // 전지구 바람 격자 — Lambda(wind-grid)가 매시간 만든다. 파티클 애니메이션용.
  WIND:   CDN + '/wind',
  // 동아시아·서태평양 총가강수량 1° 격자 — Lambda(tpw-grid), wind/ 접두사 공유.
  TPW:    CDN + '/wind',
  // 전지구 대기질 격자 — Lambda(air-grid)가 매시간 만든다.
  // PM2.5·미세먼지·먼지(황사)·오존·자외선·대기질지수가 한 파일에 들어 있다.
  // ⚠️ air/ 가 아니라 wind/ 아래다. 버킷 공개 접두사가 고정이라 air/ 는 403 이 난다(실측).
  AIR:    CDN + '/wind',
  // 전지구 해양 격자 — Lambda(marine-grid). 파고·너울·해수면온도·해류.
  // ⚠️ 아래쪽 MARINE(지점 조회용 Open-Meteo)과 이름이 겹치면 나중 것이 이긴다.
  //    그래서 이름을 달리 둔다. 실제로 한 번 겹쳤다.
  MARINE_GRID: CDN + '/ocean',
  // 이벤트 뉴스 — Lambda(gdelt-events)가 GDELT 원본을 받아 신뢰도 점수를 매겨 올린다 (§5-2)
  EVENTS: CDN + '/events',
  // 관광·인간 흐름 — 서울시 공식 실시간 인구를 서버에서 정규화한 공개 스냅샷.
  TOURISM: CDN + '/tourism',
  // LAB 종료 보고서 공통 목록. 실제 보고서가 생긴 현상만 이 경로에 합류한다.
  ANALYSIS: CDN + '/ocean',
  // 해양 관측 부이 / 태양 영상 — Lambda(ocean-solar)가 30분마다 올린다.
  // NDBC 도 SDO 도 CORS 헤더가 없어 브라우저가 직접 못 부른다.
  OCEAN:  CDN + '/ocean',
  SOLAR:  CDN + '/solar',
  // 쓰나미 경보 — 미국 NWS. CORS 가 열려 있어 프록시가 필요 없다(실측).
  // ⚠️ 미국 관할(태평양·대서양·카리브) 중심이다. 전 세계를 덮지 않는다.
  NWS_ALERTS: 'https://api.weather.gov/alerts/active',
  /* 내 항공편 추적 — OpenSky 프록시 (Lambda Function URL).
     ⚠️ 현재 이 계정은 Lambda Function URL 의 공개 접근이 막혀 있다.
        배포·정책은 정상인데 호출하면 403 AccessDeniedException 이 온다
        (기존 celestrak-proxy URL 도 같은 증상 — 계정 차원의 차단이다).
        차단이 풀리면 이 주소 그대로 동작한다. 그때까지 UI 는 원인을 밝히고 멈춘다. */
  FLIGHT: 'https://tkz55limqwqgcirrb6zwq7z6km0hrruk.lambda-url.ap-northeast-2.on.aws/',
  // 태풍 — GDACS(EU JRC + UN). 전지구를 한 소스로 덮는다.
  // NHC 는 대서양·동태평양만, JTWC 는 RSS 라 파싱이 번거롭다. GDACS 가 둘을 포함한다.
  GDACS: 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP',
  QUAKE_DAY:   'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
  QUAKE_WEEK:  'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
  METEO:       'https://api.open-meteo.com/v1/forecast',
  // 파도 — 파고·파향·주기. 항해·서핑용. 육지 좌표를 주면 값이 비어서 온다.
  MARINE:      'https://marine-api.open-meteo.com/v1/marine',
  // 역지오코딩 — 탭한 지점의 국가·시도·도시. 키 불필요, 한국어 지원, CORS 열림.
  REVGEO:      'https://api.bigdatacloud.net/data/reverse-geocode-client',
  // 위성 카탈로그 — AWS Lambda 가 하루 1회 CelesTrak OMM + SATCAT 을 조인해 S3 에 올린 것.
  // 브라우저가 CelesTrak 을 직접 부르면 rate limit 에 걸리고, SATCAT 도 커서 매번 못 받는다.
  SAT_CATALOG: CDN + '/celestrak/catalog.json.gz',
  GP:          'https://celestrak.org/NORAD/elements/gp.php',   // OMM JSON 폴백용
  LAUNCH:      'https://ll.thespacedevs.com/2.3.0/launches/upcoming/',
  KP:          'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json',
  AURORA:      'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json',
  OVERPASS:    'https://overpass-api.de/api/interpreter',
  SDO_IMG:     'https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg',
};

// CORS가 막혀 서버 프록시가 필요한 소스
// NDBC · GDELT · SDO 는 Lambda 로 해결했다 (위 OCEAN / EVENTS / SOLAR).
// 아래는 아직 막혀 있는 것들 — 프록시만으로는 안 풀린다.
export const NEEDS_PROXY = {
  // 상어 추적. 공개 JSON 엔드포인트가 없다 — 트래커가 SPA 라 HTML 만 온다.
  OCEARCH:  'https://www.ocearch.org/tracker/',
  MOVEBANK: 'https://www.movebank.org/movebank/service/public/json', // + 연구자 인증
  // 해양 플라스틱(CYGNSS L3). Earthdata 로그인이 필요해 익명 접근이 안 된다.
  CYGNSS:   'https://podaac.jpl.nasa.gov/dataset/CYGNSS_L3_MICROPLASTIC_V1.0',
};

/* ── 티어 (§3 재조정, 2026-07-26) ──────────────────────────────
   ⚠️ 처음엔 "재난·위성·우주 = 유료" 로 레이어를 갈랐다. 그 구조는 방어가 안 된다.
      경쟁 조사 결과: overwatch.earth 가 지진·산불·화산·위성·발사·오로라·부이·
      항공기·선박을 **전부 무료**로 준다 (31개 레이어, 로그인 없음).
      우리가 그걸 결제 뒤에 두면 "저기선 공짜인데?" 가 된다.

   → 기준을 "무슨 데이터인가" 에서 "무슨 일을 해주는가" 로 옮겼다.

      무료 : 레이어 전부 + 검증 표시.
             검증(JMA 대조·신뢰도·재분류)은 특히 무료여야 한다 —
             신뢰를 쌓는 장치를 결제 뒤에 두면 신뢰가 안 쌓인다.
      유료 : 사용자당 계산이 실제로 드는 것.
             · 내 위치 기준 위성 통과 예보 + 알람
             · 관심 지역 이벤트·지진 알림
             · 위성 전체 그룹(16,000개)·스타링크 — 대역폭·연산 부담
             · 궤도 추적선 — 위성 용도 상세는 무료
             · 되감기·이력 — 우리만 쌓고 있다 (§0, archive 파이프라인)

   ⚠️ 레이어의 tier 를 다시 유료로 돌리려면 위 판단을 먼저 뒤집을 것. */
/* 요금제 사다리의 정본은 access-mode.js 다 — 여기서는 다시 내보내기만 한다.
   ⚠️ 2026-09-02: v5.3 §1.4 대로 FREE / EXPLORER / INTELLIGENCE 3단계가 됐다(표기에서 PRO 는 뗐다).
      예전의 TIER.PAID 는 사라졌다. 서버가 보내는 레거시 'paid' 문자열은
      access-mode.js 의 사다리가 explorer 와 동급으로 읽어주므로 기존 구독자는 그대로 유지된다. */
export { TIER } from './access-mode.js';
import { TIER } from './access-mode.js';

/* 유료로 여는 "기능". 레이어가 아니다.
   ⚠️ 여기에 레이어 id 를 넣지 말 것 — 그 순간 위 판단이 무너진다. */
/* ⚠️⚠️ 2026-09-02 — 위성 3종(satAll · satDeep · passes)을 무료로 풀었다.
   판정 기준: **다른 데서도 볼 수 있는가.**
     · Celestrak 카탈로그는 공개고, SGP4 궤도선과 통과 예보는 Heavens-Above 같은
       무료 서비스가 이미 준다. 우리만 만드는 것이 아니므로 가둘 근거가 없다.
   ⚠️ 무료로 푼 것이 "성능 가드를 없앤 것"은 아니다. 무거운 그룹의 확인 대화와
      기기별 표시 수 제한(orbits.satsCapped)은 그대로 남는다 — ui-sat.js 참고.
   남은 둘은 **돈이 실제로 나가는 것**이라 유료다 (billing.js 기준 ④ 원가). */
export const PAID_CAP = {
  ALARMS:   'alarms',    // 통과·이벤트 알람 — 사용자별로 계산해 보내는 양
  HISTORY:  'history',   // 되감기 · 이력 — 우리가 쌓는 장기 저장
};

/* 기능마다 **어느 티어부터 열리는가**. v5.3 §1.4 기준.
   ⚠️ 여기 없는 기능은 무료다. 목록에 넣는 것이 곧 잠그는 것이므로
      추가할 때는 billing.js 의 기준(①보고서 ②차트 ③시뮬레이션 ④원가)에 걸리는지 먼저 본다.
   ⚠️ 둘 다 EXPLORER 다 — v5.3이 Watch/Follow 와 PAST·3D Replay 를 EXPLORER 에 뒀다.
      INTELLIGENCE 는 그 위(deep history · 비교 · 시나리오 · 보고서)를 맡는다. */
export const CAP_TIER = {
  [PAID_CAP.ALARMS]:  TIER.EXPLORER,
  [PAID_CAP.HISTORY]: TIER.EXPLORER,
};

/* ── 레이어 정의 ──────────────────────────────────────────────── */
// kind: imagery(면) | line(선) | point(점) | event(이벤트)
// §5-10: 면·선은 전지구부터, 점은 국가급부터, 이벤트는 중요도 임계 통과분만 전지구
/* ⚠️ 기본값은 **구름만 켜둔다**.
   처음 접속한 사람에게 지구를 보여주는 것이 먼저다 — 지진 점·위성 궤도·
   발사대·부이가 한꺼번에 얹히면 지구가 안 보이고 계기판이 보인다.
   부수 효과로 발열도 줄어든다: 위성이 꺼지면 위치 갱신 때문에 계속
   렌더를 요청하던 일이 없어진다 (power.js 주석 참고).

   ⚠️ 레이어를 끄는 것은 **지도 표시를 끄는 것**이지 감시를 끄는 것이 아니다.
      자료는 레이어가 꺼져 있어도 계속 받는다(registry.run 은 on/off 를 보지 않는다).
      그래서 쓰나미·큰 지진 같은 긴급 사항은 레이어가 꺼져 있어도
      화면 하단에 떴다가 사라진다 (ui.js 의 banner).
      "안 보이게 했다"와 "놓쳤다"는 다른 일이고, 후자가 되면 안 된다. */
export const LAYER_DEFS = [
  // ── 면 ──
  /* ⚠️ 첫 화면에서 **켜져 있는 유일한 레이어**다.
     받은 지시: "처음 접속시 모든 기능 다 꺼줘, 지구 무빙 애니메이션만" +
                "구름만 켜줘, NOAA 껄로".
     NOAA GMGSI = 우리 Lambda 가 합성해 우리 S3 에 올린 것 (퍼블릭 도메인).
     RealEarth 는 우리 쪽이 죽었을 때만 쓰는 폴백이다 — imagery.js 주석 참고. */
  { id:'clouds',   kind:'imagery', tier:TIER.FREE, on:true,  group:'weather' },
  /* 오늘의 실제 위성 영상 — 기본면(정지 사진) 대신 그날 찍힌 트루컬러를 얹는다.
     ⚠️ 산불 연기·황사·화산재가 그대로 보인다. 기본면에는 안 보인다. */
  { id:'truecolor',kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  /* 히마와리 — 동아시아·서태평양만 보는 정지위성. 1km·10분.
     ⚠️ 전지구를 못 덮는다. 켜면 그 구역으로 화면을 옮기고, 벗어나면 안내를 띄운다.
        전지구 화면에서 이것만 칠하면 그 구역만 다른 자료라 이음매가 보인다. */
  { id:'himawari', kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  /* 적외 단독 — 구름 꼭대기 온도. 구름 레이어에 섞여 있던 것을 따로 뺐다.
     ⚠️ 강수량이 아니다. 찬 꼭대기가 강한 비와 관계가 깊을 뿐이다. */
  { id:'himaIR',   kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  /* ── 천리안2A — 우리 위성이 본 동아시아·서태평양 ───────────────
     ⚠️ 히마와리와 겹치는 것 같지만 다르다.
        히마와리는 NASA GIBS 를 거친 가시광이라 **밤에 빈 화면**이고,
        이건 우리가 원본에서 직접 만든 것이라 적외가 **밤에도 보인다.**
     ⚠️ 전면 적외는 넓게 보되 8km다. 동아시아 상세은 2km, 한반도 0.5km는
        낮 가시광에서만 유효하다. 영역·해상도는 화면 부제와 출처 패널에 함께 적는다. */
  { id:'gk2aAuto', kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  { id:'gk2aIR',   kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  { id:'gk2aNightLow',kind:'imagery',tier:TIER.FREE,on:false, group:'base' },
  { id:'gk2aVIS',  kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  { id:'gk2aVISfd',kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  { id:'gk2aIRea', kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  { id:'gk2aVISea',kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  { id:'gk2aWV',   kind:'imagery', tier:TIER.FREE, on:false, group:'base' },
  // 야간 불빛은 메뉴에서 뺐다.
  //   해가 없는 쪽은 어차피 밤이 되므로 사용자가 켜고 끌 이유가 없다.
  //   imagery.init() 이 dayAlpha=0 / nightAlpha=1 로 얹고 그대로 둔다.
  //   (LAYER_DEFS 에 없으면 registry 가 건드리지 않아 계속 켜진 상태로 남는다)
  // 기온·습도는 GIBS 타일이 아니라 wind-grid 격자를 브라우저에서 칠해 얹는다
  // (Open-Meteo 는 지점 API 라 타일을 안 준다 — gridoverlay.js 참고)
  { id:'temp',     kind:'grid',    tier:TIER.FREE, on:false, group:'weather' },
  { id:'humidity', kind:'grid',    tier:TIER.FREE, on:false, group:'weather' },
  /* 총가강수량(TPW) — 지상 습도나 천리안 6.3㎛ 상층 수증기와 다른 값이다.
     대기 기둥 전체를 물로 만들었을 때의 깊이(mm)를 보여준다.
     ⚠️ 모델장만으로 비가 온다고 판정하지 않는다. */
  { id:'tpw',      kind:'grid',    tier:TIER.FREE, on:false, group:'weather' },
  /* 예보 3종 — **내일** 기준이다.
     ⚠️ '오늘'을 예보라고 부르면 안 된다. 오늘은 이미 지나간 시간이 섞여 있어
        최고기온이 실제보다 낮게 나온다. wind-grid Lambda 가 forecast_days=2 로
        받아 인덱스 1(내일)만 쓴다. 지점 현지 날짜 기준이다(timezone=auto).
     ⚠️ 화면에 반드시 "내일 · 날짜"를 같이 띄운다. 예보를 현재값처럼 보여주면
        그건 틀린 정보를 주는 것이다. */
  { id:'tmax',     kind:'grid',    tier:TIER.FREE, on:false, group:'weather' },
  { id:'tmin',     kind:'grid',    tier:TIER.FREE, on:false, group:'weather' },
  { id:'windfc',   kind:'wind',    tier:TIER.FREE, on:false, group:'weather' },

  /* ── 대기질 (air-grid 격자) ────────────────────────────
     한 번의 API 호출로 여섯 가지가 다 온다 — 요청 수가 늘지 않는다. */
  { id:'pm25',     kind:'grid',    tier:TIER.FREE, on:false, group:'air' },
  { id:'pm10',     kind:'grid',    tier:TIER.FREE, on:false, group:'air' },
  /* 먼지 질량 — 사막 모래바람(황사)이 이 값으로 보인다.
     ⚠️ 어디서 온 먼지인지는 이 숫자에 없다. 화면에 "황사"라고 단정하지 않는다. */
  { id:'dust',     kind:'grid',    tier:TIER.FREE, on:false, group:'air' },
  { id:'ozone',    kind:'grid',    tier:TIER.FREE, on:false, group:'air' },
  { id:'uv',       kind:'grid',    tier:TIER.FREE, on:false, group:'air' },
  { id:'aqi',      kind:'grid',    tier:TIER.FREE, on:false, group:'air' },

  /* ── 해양 (marine-grid 격자) ───────────────────────────
     ⚠️ current 는 해류다. 조류(물때)가 아니다 — 어민·낚시용으로 쓰면 안 된다. */
  { id:'sst',      kind:'grid',    tier:TIER.FREE, on:false, group:'ocean' },
  /* 평년 대비 해수면온도 편차. ⚠️ 평년값(OISST 1991–2020)이 있어야만 그린다.
     없는데 실측을 편차인 척 칠하면 전 세계가 새빨개진다. */
  { id:'sstanom',  kind:'grid',    tier:TIER.FREE, on:false, group:'ocean' },
  { id:'wave',     kind:'grid',    tier:TIER.FREE, on:false, group:'ocean' },
  { id:'swell',    kind:'grid',    tier:TIER.FREE, on:false, group:'ocean' },
  { id:'current',  kind:'grid',    tier:TIER.FREE, on:false, group:'ocean' },

  /* ── 안개 · 가뭄 (wind-grid 격자에 함께 들어온다) ──────
     ⚠️ drought 는 지금의 토양수분이다. 진짜 가뭄 지수는 몇 주 누적으로 판정한다.
        평년 기준선이 생기기 전까지 "가뭄이다"라고 말하지 않는다. */
  { id:'fog',      kind:'grid',    tier:TIER.FREE, on:false, group:'weather' },
  { id:'drought',  kind:'grid',    tier:TIER.FREE, on:false, group:'weather' },
  /* 해면기압 — 고기압·저기압 배치.
     받은 요청: 태풍이 "북태평양 고기압 가장자리를 따라" 간다는 것을 그림으로도 보고 싶다.
     ⚠️ 이 값은 태풍 시트의 "무엇이 밀고 있나" 와 **다른 높이**다.
        여기는 지상(해면), 저기는 500hPa(약 5.5km 상공)이다. 진로를 끌고 가는 것은
        상층 흐름이고, 이 레이어는 그 배치가 지상에 어떻게 나타나는지를 보여준다.
        둘을 같은 것이라고 말하면 안 된다. */
  { id:'pressure', kind:'grid',    tier:TIER.FREE, on:false, group:'weather' },
  /* 비구름 — 지금 내리는 양(mm/h).
     ⚠️ 구름량이 아니다. 구름 레이어(clouds)는 위성이 본 구름이고, 이건 **비**다.
        흐리기만 한 날과 비 오는 날을 가르는 것이 이 레이어의 존재 이유다. */
  { id:'rain',     kind:'grid',    tier:TIER.FREE, on:false, group:'weather' },
  { id:'aurora',   kind:'imagery', tier:TIER.FREE, on:false, group:'space' },

  // ── 선 ──
  { id:'wind',     kind:'line',    tier:TIER.FREE, on:false, group:'weather' },
  // 멀어지면 자동으로 보인다 (registry 의 SAT_SHOW 규칙). 기본 켜짐.
  { id:'orbits',   kind:'line',    tier:TIER.FREE, on:false, group:'space' },

  // ── 점 ──
  { id:'stations', kind:'point',   tier:TIER.FREE, on:false, group:'weather' },
  /* 지상 관측소 — 공항에 실제로 설치된 계기의 **실황**(METAR).
     ⚠️ 위 'stations' 와 다르다. 저건 도시 47곳의 예보 조회다.
        실황과 예보를 같은 이름으로 두면 사용자가 구분할 수 없다. */
  { id:'landobs',  kind:'point',   tier:TIER.FREE, on:false, group:'weather' },
  /* 영국 예보 — 영국 기상청(Met Office) 지점예보 36곳.
     한국(기상청) 다음으로 **자국 기관 예보**가 들어온 두 번째 나라다.
     ⚠️ 출처 문구 "Powered by Met Office data" 는 약관상 의무다.
     ⚠️ 무료 플랜 재배포 약관 확인 중(2026-07-28 문의). 부정적 답이 오면
        **이 줄만 지우면** 화면에서 즉시 사라진다. Lambda 수집은 그대로 둬도 된다. */
  { id:'ukfc',     kind:'point',   tier:TIER.FREE, on:false, group:'weather' },
  /* 관측망 밀도 — "어디를 아무도 안 보고 있나". 우리 자료의 약한 곳을 스스로 밝힌다.
     ⚠️ kind:'coverage' 는 이 레이어 전용이다 (격자도 점도 아니다). */
  { id:'coverage', kind:'coverage', tier:TIER.FREE, on:false, group:'weather' },
  { id:'volcano',  kind:'point',   tier:TIER.FREE, on:false, group:'hazard' },
  { id:'launch',   kind:'point',   tier:TIER.FREE, on:false, group:'space' },
  { id:'tourism',  kind:'tower',   tier:TIER.FREE, on:false, group:'travel' },
  { id:'poi',      kind:'point',   tier:TIER.FREE, on:false, group:'travel' },
  { id:'phenomena',kind:'point',   tier:TIER.FREE, on:false, group:'learn' },
  /* 열돔 — '자연현상'에서 떼어냈다.
     반경 수백 km 반투명 면이라 다른 걸 볼 때 방해가 된다 — 끌 수 있어야 한다.
     ⚠️ 기본을 off 로 둔다. 켜져 있는 게 기본이면 "끌 수 있게 해달라"는 요청의
        절반만 해결한 것이다. 필요한 사람이 켜는 쪽이 맞다. */
  { id:'heatdome', kind:'point',   tier:TIER.FREE, on:false, group:'learn' },
  // 일식 식심 지점 — 다음 3개만. NASA 5천년 목록의 실제 좌표다.
  { id:'eclipse',  kind:'point',   tier:TIER.FREE, on:false, group:'learn' },

  // ── 이벤트 ──
  { id:'quake',    kind:'event',   tier:TIER.FREE, on:false, group:'hazard' },
  /* 산불 — NASA FIRMS 위성 관측. 무료다.
     뉴스로 추정하던 걸 관측으로 바꾼 레이어라 기본 켜둔다. */
  { id:'wildfire', kind:'event',   tier:TIER.FREE, on:false, group:'hazard' },
  { id:'cyclone',  kind:'event',   tier:TIER.FREE, on:false, group:'hazard' },
  /* 쓰나미는 무료다. 목숨이 걸린 정보를 결제 뒤에 두지 않는다.
     기본 켜짐이고, 경보가 없으면 아무것도 안 그린다(= 평소엔 존재를 모른다). */
  { id:'tsunami',  kind:'event',   tier:TIER.FREE, on:false, group:'hazard' },
  /* 낙뢰 — 한국만. 5분마다 갱신되는 실측 탐지자료다.
     ⚠️ 자료가 한반도 주변에만 있다. 전지구 화면에서 켜면 그쪽에만 점이 찍힌다 —
        그게 정상이고, 없는 곳을 만들어 내지 않는다. */
  { id:'lightning',kind:'event',   tier:TIER.FREE, on:false, group:'hazard' },
  /* 각국 공식기관 재해 — USGS 가 안 싣는 작은 지진까지 본다.
     ⚠️ 큰 지진은 USGS 와 겹친다. 그래서 전지구 지진 레이어와 **따로** 둔다. */
  /* 기상경보 통합 — 호우·한파·폭염·대설·강풍을 한 레이어에 담고 색으로 구분한다.
     ⚠️ 낙뢰는 여기 안 넣는다. 낙뢰는 경보가 아니라 **이미 떨어진 것**이다. */
  { id:'alerts',   kind:'event',   tier:TIER.FREE, on:false, group:'hazard' },
  { id:'regional', kind:'event',   tier:TIER.FREE, on:false, group:'hazard' },

  // ── 점 ──
  { id:'buoy',     kind:'point',   tier:TIER.FREE, on:false, group:'ocean' },
  /* 에어코리아(한국환경공단) 실측 — 673개 측정소. 지도의 pm25/pm10/aqi 격자는
     유럽 CAMS 모델값이고, 이건 한국이 실제로 잰 값이다. group 은 'air' —
     모델과 실측을 같은 메뉴에서 고르게 한다(어느 쪽인지는 각 항목 이름에 적는다). */
  { id:'airkr',    kind:'point',   tier:TIER.FREE, on:false, group:'air' },

  // ── 미구현 (연결 지점만) ──
  /* 이벤트 뉴스는 무료다.
     교차검증(§5-2)이 이 앱의 핵심 차별화인데 결제 뒤에 두면 아무도 못 본다.
     리빙어스에 없는 기능이라 무료 티어의 무게를 늘리는 쪽이 맞다 (§12). */
  { id:'news',     kind:'event',   tier:TIER.FREE, on:false, group:'events' },
  { id:'wildlife', kind:'line',    tier:TIER.FREE, on:false, group:'nature', blocked:'auth'  },
  { id:'plastic',  kind:'imagery', tier:TIER.FREE, on:false, group:'ocean',  blocked:'proxy' },
  { id:'flight',   kind:'point',   tier:TIER.FREE, on:false, group:'transit',blocked:'provider' },
  { id:'ship',     kind:'point',   tier:TIER.FREE, on:false, group:'transit',blocked:'provider' },
];

/* ── 이벤트 전지구 노출 임계 (§5-10) ──────────────────────────── */
export const GLOBAL_EVENT = {
  QUAKE_MAG: 6.5,        // 이 규모 이상만 전지구 뷰에 노출
  LAUNCH_HOURS: 24,      // 발사 D-24h 이내면 전지구 노출
};

/* ── 색상 ─────────────────────────────────────────────────────── */
export const C = {
  teal:  '#3fc7c0',
  amber: '#f2a65a',
  red:   '#ff5d5d',
  gold:  '#ffd166',
  violet:'#c9a7ff',
  paper: '#f2f5f8',
};
