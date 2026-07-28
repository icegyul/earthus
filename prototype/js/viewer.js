// Cesium 초기화 + 리빙어스 룩 (§5-9)
import { API, T } from './config.js';

export let viewer, scene, globe;

export function initViewer(containerId) {
  viewer = new Cesium.Viewer(containerId, {
    baseLayer: false,
    baseLayerPicker: false, geocoder: false, homeButton: false,
    sceneModePicker: false, navigationHelpButton: false,
    animation: false, timeline: false, fullscreenButton: false,
    infoBox: false, selectionIndicator: false, vrButton: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    contextOptions: { webgl: { alpha: false, antialias: true } },
  });

  scene = viewer.scene;
  globe = scene.globe;

  /* ── 해상도 ────────────────────────────────────────────────────
     ⚠️ Cesium 의 useBrowserRecommendedResolution 기본값은 true 다.
        이러면 devicePixelRatio 를 무시하고 CSS 픽셀 그대로 그린다.
        레티나(dpr 2)에서 715×863 로 그려 1430×1726 로 늘리는 셈이라
        지구가 뿌옇게 보인다. 실측으로 확인한 "답답한 화질"의 원인이다.

        ⚠️ 단위에 주의. false 로 두면 Cesium 이 devicePixelRatio 를 이미 곱한다.
           최종 캔버스 = CSS크기 × devicePixelRatio × resolutionScale
           그래서 resolutionScale 은 1 이 "기기 네이티브 해상도"다.
           여기에 2 를 넣으면 네이티브의 4배가 된다 (실제로 2860×3452 가 나왔다).
           네이티브를 넘겨봐야 화면에 그만한 픽셀이 없어 보이지 않는다.

        예전엔 유효 배율을 2 로 잘랐는데(dpr 3 인 폰에서 0.67),
        아이폰 16 Pro 에서 "화질이 답답하다"는 지적을 받아 네이티브 그대로 쓴다.
        1206×2622 는 A18 Pro 가 감당한다. 못 버티면 renderQuality 가 내린다. */
  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = 1;
  viewer.resize();   // 이걸 안 부르면 속성만 바뀌고 캔버스는 그대로다

  /* 컨테이너 크기 추적 — 안전망이다.
     Cesium 은 자체 렌더 루프(rAF)에서 매 프레임 크기를 확인하므로 보통은 이것 없이도 맞다.
     다만 useDefaultRenderLoop 을 끄거나 루프가 멈춘 구간에서는 놓칠 수 있어 덧붙인다.

     ⚠️ 이걸로 검증하려 하지 말 것.
        ResizeObserver 콜백은 브라우저의 "렌더링 갱신" 단계에서 배달되므로
        탭이 가려지면 rAF 과 똑같이 멈춘다. 숨겨진 창에서 테스트하면
        콜백이 0번 불리는데, 그건 코드가 틀린 게 아니라 창이 안 보여서다. */
  const el = scene.canvas.parentElement || document.getElementById(containerId);
  if (el && window.ResizeObserver) {
    let pending = null;
    new ResizeObserver(() => {
      // ⚠️ 여기서 requestAnimationFrame 을 쓰면 안 된다.
      //    탭이 백그라운드거나 창이 가려지면 rAF 이 멈춰서 리사이즈가 영영 안 걸린다.
      //    (실제로 그래서 컨테이너를 줄여도 백버퍼가 그대로였다)
      //    setTimeout 은 그 상황에서도 돈다.
      clearTimeout(pending);
      pending = setTimeout(() => viewer.resize(), 60);   // 연속 리사이즈를 한 번으로 모음
    }).observe(el);
  }
  // ResizeObserver 가 못 잡는 경우 대비 (구형 브라우저, 화면 회전)
  window.addEventListener('orientationchange', () => setTimeout(() => viewer.resize(), 250));

  /* maximumScreenSpaceError 는 기본값 2 를 그대로 둔다.
     ⚠️ 이 값의 단위는 "드로잉 버퍼 픽셀"이다. 위에서 해상도를 2배로 올렸으므로
        같은 2 라도 이미 CSS 픽셀 기준으로는 1 만큼 엄격해진 셈이다.
        여기서 더 낮추면 타일 요청이 배로 늘어 회전 중 끊김이 심해진다.
        (한 번에 하나씩만 바꾼다 — 해상도부터 보고 판단할 것) */
  globe.maximumScreenSpaceError = 2;
  globe.preloadSiblings = true;          // 옆 타일 미리 받아 회전 중 팝인을 줄인다
  globe.tileCacheSize = 1000;            // 기본 100 — 되돌아올 때 다시 안 받는다

  /* ── 리빙어스 룩 ────────────────────────────────────────────── */
  scene.backgroundColor = Cesium.Color.BLACK;
  globe.baseColor = Cesium.Color.BLACK;
  globe.enableLighting = true;         // 주야 경계선
  globe.showGroundAtmosphere = true;   // 지표 대기산란
  scene.skyAtmosphere.show = true;     // 림 라이팅
  scene.fog.enabled = false;
  globe.showWaterEffect = false;
  scene.moon.show = false;
  scene.sun.show = true;
  scene.highDynamicRange = false;

  // 대기광 톤 — 리빙어스는 푸른 림이 뚜렷함
  scene.skyAtmosphere.atmosphereRayleighScaleHeight = 10000;
  scene.skyAtmosphere.brightnessShift = 0.12;
  globe.atmosphereBrightnessShift = 0.05;

  // ⚠️ fadeOut < fadeIn 이어야 한다. 뒤집으면 근거리에서 지구가 통째로 검게 죽는다.
  //   fadeOut 이하 거리 = 완전히 밝게(확대 시 야간이어도 지도가 보임)
  //   fadeIn 이상 거리 = 조명 적용(주야 경계선이 보임 → Ambient 룩)
  globe.lightingFadeOutDistance = 9_000_000;
  globe.lightingFadeInDistance  = 20_000_000;
  globe.dynamicAtmosphereLighting = true;

  /* 조작감 — 지구본 느낌 유지 (틸트 금지)
     inertiaSpin 은 손을 뗀 뒤 회전이 얼마나 이어지는지다 (0=즉시 정지, 1에 가까울수록 오래).
     Cesium 기본값 0.9 는 금방 멎어서 "돌렸다 멈췄다" 하는 느낌이 난다.
     실제 지구본처럼 여운을 남기려고 올렸다. */
  const cc = scene.screenSpaceCameraController;
  cc.minimumZoomDistance = 150_000;
  cc.maximumZoomDistance = 45_000_000;
  cc.enableTilt = false;
  cc.enableLook = false;
  cc.inertiaSpin = 0.96;
  cc.inertiaZoom = 0.88;

  /* ⚠️ 더블클릭하면 화면이 얼어붙는 문제.
     Cesium Viewer 는 엔티티를 더블클릭하면 viewer.trackedEntity 를 걸어
     카메라를 그 엔티티에 고정한다. 그런데 우리는 enableTilt 를 꺼둬서
     추적 모드에서 빠져나올 조작이 없다 — 지구가 통째로 잠긴 것처럼 보인다.
     (실제로 "더블클릭하니 고정되면서 안 풀린다"는 신고를 받았다.)

     우리 앱에서 위치를 보는 방법은 탭 → 정보 시트다. 추적은 필요 없다.
     기본 동작을 떼어내고, 혹시라도 걸리면 즉시 풀리도록 안전장치를 둔다. */
  viewer.screenSpaceEventHandler.removeInputAction(
    Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  viewer.trackedEntityChanged.addEventListener(() => {
    if (viewer.trackedEntity) viewer.trackedEntity = undefined;
  });

  // 기본 크레딧 컨테이너 숨김 (출처는 설정 화면에 별도 표기)
  viewer.cesiumWidget.creditContainer.style.display = 'none';

  return viewer;
}

/* ── 지구를 화면 비율에 맞춰 배치 ──────────────────────────────
   리빙어스는 지구가 화면의 절반쯤을 차지하고 위아래로 여백이 남는다.
   화면 비율이 달라도 같은 비율이 되도록 카메라 고도를 역산한다. */
// fraction = 지구가 세로로 차지할 비율. 이 값만 바꾸면 지구 크기가 바뀐다.
//   0.52 — 리빙어스 스크린샷에서 잰 값. 위아래 여백이 넉넉하다.
//   0.68 — 현재값. 화면이 작은 폰에서 지구가 작아 보인다는 지적을 반영했다.
//   0.85 이상 — 지구가 화면을 거의 채운다. 상단 칩·하단 시트와 겹치기 시작한다.
export function fitGlobeHeight(fraction = 0.68) {
  const R = 6_371_000;
  const cam = viewer.camera;
  const f = cam.frustum;
  // Cesium 기본 fov 는 가로/세로 중 긴 쪽 기준 → 세로 fov 를 구한다
  const aspect = scene.canvas.clientWidth / scene.canvas.clientHeight;
  const fovY = aspect > 1
    ? 2 * Math.atan(Math.tan(f.fov / 2) / aspect)
    : f.fov;
  const targetAngle = fovY * fraction;          // 지구가 차지할 각도
  const sin = Math.sin(targetAngle / 2);
  if (sin <= 0 || sin >= 1) return 24_000_000;
  return Math.max(8_000_000, R / sin - R);
}

/** Ambient 진입 위치로 (사용자 위치 위, 지구가 화면에 예쁘게 들어오는 고도) */
export function setAmbientView(lon = 127, lat = 25, fraction = 0.52) {
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, fitGlobeHeight(fraction)),
  });
}

/* ── GIBS 이미지 프로바이더 ────────────────────────────────────
   ⚠️ 반드시 EPSG:3857 엔드포인트를 쓸 것.
   GIBS 의 EPSG:4326 격자는 2×1 → 3×2 → 5×3 → 10×5 … 로,
   Cesium 의 GeographicTilingScheme(2→4→8→16)과 어긋난다.
   레벨 0 만 우연히 맞고 확대하면 전부 400 TileOutOfRange 가 난다.
   EPSG:3857 의 GoogleMapsCompatible 격자는 표준 2^z 라 WebMercatorTilingScheme 과 정확히 맞는다.

   레이어별 매트릭스셋 / 최대 레벨은 GetCapabilities 기준 (2026-07-26 확인):
     BlueMarble_ShadedRelief_Bathymetry     Level8  jpeg  (정적)
     VIIRS_CityLights_2012                  Level8  jpeg  (정적)
     MODIS_*_Cloud_Fraction_Day             Level6  png   (일 단위)
     AIRS_L2_Surface_Air_Temperature_Day    Level6  png   (일 단위)
     *_CorrectedReflectance_TrueColor       Level9  jpeg  (일 단위)                     */
export function gibsProvider({ layer, level, ext, date, maxLevel }) {
  const matrixSet = `GoogleMapsCompatible_Level${level}`;
  // 시간축 레이어는 시각 세그먼트가 필요하다. 'default' 를 주면 GIBS 가 최신을 준다.
  // ⚠️ 명시적 타임스탬프는 그 시각에 자료가 없으면 404 다 (실측). 최신이 필요하면 default 를 쓸 것.
  const seg = date ? `${date}/` : '';
  return new Cesium.WebMapTileServiceImageryProvider({
    url: `${API.GIBS}/${layer}/default/${seg}${matrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${ext}`,
    layer, style: 'default',
    format: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    tileMatrixSetID: matrixSet,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    tileWidth: 256, tileHeight: 256,
    maximumLevel: maxLevel ?? level,
    credit: 'NASA GIBS',
  });
}

/* ── 카메라 유틸 ──────────────────────────────────────────────── */
export function cameraHeight() {
  return viewer.camera.positionCartographic.height;
}

/** 현재 화면 범위 (뷰포트 기반 로딩용, §5-1) */
export function viewRect() {
  const r = viewer.camera.computeViewRectangle(scene.globe.ellipsoid);
  if (!r) return null;
  return {
    west:  Cesium.Math.toDegrees(r.west),
    south: Cesium.Math.toDegrees(r.south),
    east:  Cesium.Math.toDegrees(r.east),
    north: Cesium.Math.toDegrees(r.north),
  };
}

/** 카메라가 멈춘 뒤 한 번만 호출 (디바운스) */
export function onCameraIdle(fn, ms = 420) {
  let timer = null;
  viewer.camera.changed.addEventListener(() => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  });
  viewer.camera.percentageChanged = 0.15;
}

/* ⚠️ 도착 시점을 알려준다(onDone). 도착하고 나서 해야 하는 연출이 있다 —
   핀 꽂기를 출발과 동시에 시작하면 날아가는 내내 화면 밖에서 떨어진다. */
export function flyTo(lon, lat, height, duration = 1.5, onDone) {
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
    duration,
    complete: onDone,
    // 사용자가 도중에 화면을 만지면 비행이 취소된다 — 그때도 연출은 이어 준다
    cancel: onDone,
  });
}

/** 사용자 현재 위치로 (실패 시 기본값) */
export function locateUser() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 600_000 }
    );
  });
}
