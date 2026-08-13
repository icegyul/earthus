// 면(imagery) 레이어 — 전지구부터 항상 표시 (§5-10)
import { viewer, gibsProvider } from '../viewer.js';
import { API } from '../config.js';
import { store } from '../store.js';
import { fetchT } from '../net.js';
import { CONFIG } from '../config.local.js';
import { buildCloudShadowAlpha } from '../cloud-shadow.js?v=20260812-cloudshadow1';
import { CloudDepthImageryProvider } from '../cloud-depth-provider.js?v=20260813-clouddepth1';

/** GIBS 시간축 레이어는 D-1이 안전 (당일치는 처리 지연) */
function ymd(offsetDays = -1) {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

export const imagery = {
  base: null, detail: null, truecolor: null, clouds: null, cloudLayers: [], citylight: null, temp: null, aurora: null,
  auroraMeta: null,

  /** 타일 구름 본체와 그 아래의 시각 깊이 층을 항상 함께 제거한다. */
  _removeImageryWithDepth(layer) {
    if (!layer) return;
    if (layer._earthusDepthLayer) {
      try { viewer.imageryLayers.remove(layer._earthusDepthLayer, true); } catch (_) { }
      layer._earthusDepthLayer = null;
    }
    try { viewer.imageryLayers.remove(layer, true); } catch (_) { }
  },

  /** 같은 관측 제공자를 공유하는 깊이 층을 먼저 넣고 본체를 위에 놓는다. */
  _addImageryWithDepth(provider, { mode, sun = null, alpha = 0.18,
                                  dayAlpha = 1.0, nightAlpha = 1.0 } = {}) {
    const depth = viewer.imageryLayers.addImageryProvider(
      new CloudDepthImageryProvider(provider, { mode, sun })
    );
    depth._earthusCloudRole = sun ? 'sun-shadow' : 'visual-relief';
    depth._earthusDepthBaseAlpha = alpha;
    depth._earthusDepthDayAlpha = dayAlpha;
    depth._earthusDepthNightAlpha = nightAlpha;
    depth.alpha = alpha;
    depth.dayAlpha = dayAlpha;
    depth.nightAlpha = nightAlpha;
    const layer = viewer.imageryLayers.addImageryProvider(provider);
    layer._earthusDepthLayer = depth;
    return layer;
  },

  init() {
    // ── Blue Marble : 주간 기본면 ──
    this.base = viewer.imageryLayers.addImageryProvider(
      gibsProvider({ layer: 'BlueMarble_ShadedRelief_Bathymetry', level: 8, ext: 'jpeg' })
    );
    this.base.dayAlpha = 1.0;
    this.base.nightAlpha = 0.0;

    /* ── 확대용 고해상도 면 ──────────────────────────────────────
       Blue Marble 은 레벨 8 이 끝이다 = 적도에서 약 611 m/px.
       그런데 카메라는 150km 고도까지 내려간다 (viewer.js 의 minimumZoomDistance).
       그 높이에서 화면 한 폭이 100km 남짓이니 약 116 m/px 가 필요하다.
       즉 5배 부족하다 — 확대하면 뭉개져 보이는 게 당연했다.

       Esri World Imagery 는 레벨 19 까지 있고 키가 필요 없다.
       다만 전지구 뷰에서 이걸 쓰면 리빙어스 룩이 깨진다 (구름·계절·이음매가 섞인 실사).
       → 전지구에선 Blue Marble, 확대하면 Esri 로 넘긴다. 아래 updateForHeight 참고.

       ⚠️ 출처 표기 의무가 있다. credit 을 지우지 말 것. */
    this.detail = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maximumLevel: 19,
        /* 서비스가 현재 직접 반환하는 copyrightText와 맞춘다.
           ⚠️ 공급사가 Maxar→Vantor로 바뀌었는데 옛 문자열을 계속 쓰고 있었다. */
        credit: 'Powered by Esri · Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
      })
    );
    this.detail.alpha = 0.0;   // updateForHeight 가 고도에 따라 올린다

    /* ── 오늘의 실제 위성 영상 (트루컬러) ──────────────────────────
       기본면(Blue Marble)은 정지 사진이다. 계절도 구름도 연기도 없다.
       NASA GIBS 의 일일 트루컬러를 얹으면 산불 연기가 그대로 보인다.
       ⚠️ 레이어는 여기서 만들지 않는다 — setTrueColor() 가 자료가 완전한
          날짜를 실제로 재본 뒤 만든다. 아래 pickTrueColorDate 참고. */
    this.truecolor = null;
    this._tcDate = null;

    /* ── 구름 ─────────────────────────────────────────────────────
       리빙어스처럼 "진짜 구름"으로 보이게 하는 게 목표다.

       ── GIBS 로 시도했다가 접은 것들 ─────────────────────────────
         MODIS_Terra_Cloud_Fraction        ✗ 과학용 위색(분홍/보라). "구름비율"이라
                                             옅은 구름까지 칠해 지구를 덮는다. 하루 1~2회.
         *_CorrectedReflectance_TrueColor  ✗ 실사지만 육지가 같이 들어있어 구름만 못 뽑는다.
         ABI/AHI_Band13 (적외)             ✗ 위색 팔레트라 saturation=0 을 걸면
                                             가장 차가운 구름 꼭대기(=제일 강한 뇌우)가
                                             검은 반점이 된다. 제일 중요한 게 반대로 나온다.
         ABI_Band2 / AHI_Band3 (가시광)    ✗ 그림 자체는 예쁜데 밤에 새까맣다.

       그리고 무엇보다 — GIBS 는 정지위성 "낱장"만 준다.
       GOES-East / GOES-West / Himawari 를 직접 겹쳐야 하는데
       ① 원반 경계가 직선으로 뚝 잘려 보이고 ② Meteosat 이 없어 유럽·아프리카가 빈다.
       실제로 "구름이 잘린다"는 지적을 받은 게 이 때문이다.

       ── 채택: NOAA GMGSI 를 우리가 직접 가공 (1순위) ──────────────
       NOAA 가 전 세계 정지위성(Meteosat 포함)을 이미 하나로 합성해 공개한다.
       즉 이음매 맞추는 일은 NOAA 가 해놨고, 우리는 화면용으로 바꾸기만 하면 된다.
         원본  s3://noaa-gmgsi-pds  (퍼블릭 도메인, 인증 불필요, 1시간 간격, 2.4km/px)
         가공  Lambda(gmgsi-clouds) → 회색조 LA PNG 3072px 폭 → 우리 S3
       퍼블릭 도메인이라 워터마크도, 사용량 한도도, 라이선스 제약도 없다.
       ⚠️ 위도 ±72.7° 까지다 (정지위성이 극을 못 본다). 경계는 알파를 빼서 뭉갠다.

       ── 폴백: SSEC RealEarth (2순위) ────────────────────────────
       우리 Lambda 나 S3 가 죽었을 때만 쓴다. 평상시 경로가 아니다.
       ⚠️ 등록 없이 쓰면 "Referer not allowed" 로 타일에 워터마크가 찍힌다.
          config.local.js 의 REALEARTH_KEY 에 키를 넣으면 사라진다.
          (워터마크를 지우거나 가리는 방식으로 우회하지 말 것 — 약관 위반이다)
       ⚠️ 하루 1,000MP 한도. 전지구 한 화면에 20~40타일이 드니 400~700회분이다.
          폴백으로만 써야 하는 이유가 이것이다. */
    this.cloudLayers = [];
    /* 구름은 첫 화면에 **켜진 채로 나온다** (받은 지시: "구름만 켜줘, NOAA 껄로").
       1순위가 GMGSI = NOAA 원본을 우리 Lambda 가 합성해 우리 S3 에 올린 것이다.
       RealEarth(위스콘신대)는 우리 쪽이 죽었을 때만 쓰는 폴백이다.
       ⚠️ 끈 상태에서는 여기 오지 않게 해야 한다 — alpha 0 인 이미지 레이어도
          타일 요청은 그대로 한다(그리지 않을 뿐이다). set('clouds', …) 참고. */
    if (store.isOn('clouds')) this._addClouds();

    // 기온은 GIBS(AIRS, 하루 1회, 위색)에서 wind-grid 격자로 옮겼다.
    // 매시간 갱신되고 색 눈금을 우리가 정할 수 있다 — gridoverlay.js 참고.

    // ── 야간 도시 불빛 ──
    this.citylight = viewer.imageryLayers.addImageryProvider(
      gibsProvider({ layer: 'VIIRS_CityLights_2012', level: 8, ext: 'jpeg' })
    );
    this.citylight.dayAlpha = 0.0;
    this.citylight.nightAlpha = 1.0;
    this.citylight.brightness = 1.6;
  },

  /* ── RealEarth 전지구 구름 ────────────────────────────────────
     타일 주소에 시각이 들어간다. 최신 시각을 먼저 물어보고 그걸로 레이어를 만든다.
     자료가 1시간 간격이라 20분마다 확인해서 새 시각이 나오면 레이어를 갈아끼운다. */
  _cloudTime: null,

  /** 지금 그려진 구름이 언제 것인가. 화면 왼쪽 아래 안내가 쓴다.
   *  ⚠️ 모르면 null 을 준다 — 지어낸 시각을 보여주면 안 된다. */
  cloudTime() { return this._cloudTime; },
  _cloudOn: false,
  _cloudSource: null,   // 'gmgsi' | 'realearth'

  async _addClouds() {
    // 우리 파이프라인(GMGSI) 우선. 실패하면 RealEarth 로 버틴다.
    if (await this._cloudsFromGMGSI()) return;
    await this._cloudsFromRealEarth();
  },

  /** 새 레이어를 얹고 이전 것을 치운다 (깜빡임 없이 교체) */
  _swapCloudLayer(L, shadow = null) {
    /* 그림자를 먼저 넣어 같은 구름 본체 아래에만 놓는다. 둘 다 같은 관측 알파에서
       나왔고, 구름 설정·트루컬러·타임라인 상태도 _applyClouds 한 곳에서 함께 따른다. */
    L._earthusCloudRole = 'cloud';
    const depth = shadow || L._earthusDepthLayer || null;
    if (shadow) {
      shadow._earthusCloudRole = 'shadow';
      shadow._earthusDepthBaseAlpha = 0.28;
      shadow._earthusDepthDayAlpha = 1.0;
      shadow._earthusDepthNightAlpha = 0.0;
    }
    const old = this.cloudLayers.slice();
    this.cloudLayers = depth ? [depth, L] : [L];
    this.clouds = L;
    this._applyClouds();
    old.forEach(o => this._removeImageryWithDepth(o));
  },

  /** 관측 시각의 태양 방향. Cesium의 주야 조명과 같은 천체/고정 좌표계를 쓴다. */
  _sunFixedAt(isoTime) {
    const time = Cesium.JulianDate.fromIso8601(isoTime);
    const inertial = Cesium.Simon1994PlanetaryPositions
      .computeSunPositionInEarthInertialFrame(time, new Cesium.Cartesian3());
    let transform = Cesium.Transforms.computeIcrfToFixedMatrix(time, new Cesium.Matrix3());
    if (!Cesium.defined(transform)) {
      transform = Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, new Cesium.Matrix3());
    }
    const fixed = Cesium.Matrix3.multiplyByVector(transform, inertial, new Cesium.Cartesian3());
    Cesium.Cartesian3.normalize(fixed, fixed);
    return [fixed.x, fixed.y, fixed.z];
  },

  _cloudShadowCanvas(rgba, width, height, meta) {
    const shadow = buildCloudShadowAlpha({
      rgba, sourceWidth: width, sourceHeight: height,
      north: Cesium.Math.toRadians(meta.north), south: Cesium.Math.toRadians(meta.south),
      sun: this._sunFixedAt(meta.time),
    });
    const mask = document.createElement('canvas');
    mask.width = shadow.width; mask.height = shadow.height;
    const maskContext = mask.getContext('2d');
    const maskPixels = maskContext.createImageData(mask.width, mask.height);
    for (let i = 0; i < shadow.alpha.length; i += 1) {
      const offset = i * 4;
      maskPixels.data[offset] = maskPixels.data[offset + 1] = maskPixels.data[offset + 2] = 0;
      maskPixels.data[offset + 3] = shadow.alpha[i];
    }
    maskContext.putImageData(maskPixels, 0, 0);

    // 날카로운 복사본이 아니라 지표에 닿는 부드러운 그림자로 보이게 한다.
    const canvas = document.createElement('canvas');
    canvas.width = mask.width; canvas.height = mask.height;
    const context = canvas.getContext('2d');
    context.filter = 'blur(1.4px)';
    context.drawImage(mask, 0, 0);
    return canvas;
  },

  /* ── 1순위: 우리가 만든 GMGSI 합성본 ──────────────────────────
     Lambda 가 NOAA 원본을 시간마다 받아 회색조 PNG 로 만들어 S3 에 올린다.
     회색값이 곧 구름량이라 여기서 "흰색 + 그 값을 알파로" 바꿔 얹는다.

     왜 서버에서 RGBA 로 안 만들고 회색조로 받아 변환하나
       RGB 가 상수 흰색이어도 RGBA PNG 는 1.4배 커진다 (실측 1.75MB vs 1.21MB).
       폰에서 매시간 받는 파일이라 0.5MB 차이가 크다.
       변환은 3072px 폭 한 번 훑는 작업이며 Lambda 안에서만 수행한다. */
  async _cloudsFromGMGSI() {
    try {
      const r = await fetch(`${API.CLOUDS}/meta.json`, { cache: 'no-cache' });
      if (!r.ok) return false;
      const m = await r.json();
      if (!m.time) return false;
      if (m.time === this._cloudTime) return true;    // 이미 최신

      /* ⚠️ 1.2MB 다. 예전엔 아무 표시 없이 몇 초를 기다렸다 —
         첫 화면에서 켜지는 레이어라 "구름이 왜 안 나오지"가 된다. */
      const src = await this._fetchImage(
        `${API.CLOUDS}/global.png?t=${encodeURIComponent(m.time)}`, '전지구 구름');
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((ok, no) => {
        img.onload = ok; img.onerror = () => no(new Error('png'));
        img.src = src;
      });

      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const ctx = cv.getContext('2d', { willReadFrequently: false });
      ctx.drawImage(img, 0, 0);
      /* 서버가 LA PNG 로 보낸다 — L=명암(입체감), A=구름량.
         브라우저가 LA 를 RGBA 로 풀 때 R=G=B=L, A=A 로 들어오므로
         사실 그대로 쓰면 된다. 다만 아주 어두운 쪽은 회색이 탁해 보여서
         최소 밝기를 깔아준다.

         ⚠️ 옛 버전(format: 'gray8')은 회색값이 곧 알파였다. 그때 만들어진
            파일이 캐시에 남아 있을 수 있어 두 형식을 모두 받는다. */
      const px = ctx.getImageData(0, 0, cv.width, cv.height);
      const d = px.data;
      if (m.format === 'la8') {
        for (let i = 0; i < d.length; i += 4) {
          const l = 90 + (d[i] * 165 / 255);   // 90~255 로 눌러 탁함 방지
          d[i] = d[i + 1] = d[i + 2] = l;
          /* 네 빠른 위성 영상을 같은 동아시아 장면에서 대조했다(2026-08-11).
             NOAA와 천리안 적외의 화소 상관은 0.83이었지만, NOAA의 중간 알파는
             같은 구름을 훨씬 옅게 보여 화면에서 양이 적어 보였다.

             ⚠️ 탐지 문턱이나 구름 면적을 바꾸지 않는다. 서버가 이미 구름이라고 낸
             알파만 0.78 감마로 보이기 쉽게 만든다. 0은 계속 0, 1은 계속 1이다. */
          d[i + 3] = Math.round(255 * Math.pow(d[i + 3] / 255, 0.78));
        }
      } else {
        for (let i = 0; i < d.length; i += 4) {
          d[i + 3] = Math.round(255 * Math.pow(d[i] / 255, 0.78));
          d[i] = d[i + 1] = d[i + 2] = 255;
        }
      }
      ctx.putImageData(px, 0, 0);

      /* 받은 지적(2026-08-12): "리빙어스를 보면 구름 그림자도 표현되어 있어 진짜
         구름처럼 보여". 같은 NOAA 구름 알파를 관측 시각의 태양 방향으로만 투영한다.
         ⚠️ 대표 구름 높이는 시각 효과일 뿐 관측값이 아니며 화면·자료로 내보내지 않는다.
         ⚠️ 별도 타이머나 애니메이션이 없다. 새 관측 영상이 올 때 한 번만 다시 만든다. */
      const shadowCanvas = this._cloudShadowCanvas(d, cv.width, cv.height, m);
      const rectangle = Cesium.Rectangle.fromDegrees(-180, m.south, 180, m.north);
      const shadowLayer = viewer.imageryLayers.addImageryProvider(
        new Cesium.SingleTileImageryProvider({
          url: shadowCanvas.toDataURL('image/png'),
          rectangle,
          tileWidth: shadowCanvas.width, tileHeight: shadowCanvas.height,
        })
      );

      const L = viewer.imageryLayers.addImageryProvider(
        new Cesium.SingleTileImageryProvider({
          url: cv.toDataURL('image/png'),
          // ⚠️ 자료가 위도 ±72.7° 까지다. 이 사각형을 정확히 맞춰야 구름이 제 위치에 온다.
          rectangle,
          tileWidth: cv.width, tileHeight: cv.height,
          credit: m.credit || 'NOAA NESDIS GMGSI',
        })
      );
      this._cloudTime = m.time;
      this._cloudSource = 'gmgsi';
      this._swapCloudLayer(L, shadowLayer);
      return true;
    } catch (e) {
      console.warn('[clouds] GMGSI 실패 → RealEarth 로 폴백:', e.message);
      return false;
    }
  },

  /* ── 2순위: SSEC RealEarth ────────────────────────────────────
     우리 파이프라인이 죽었을 때만 쓴다.
     ⚠️ 등록 없이 쓰면 타일에 워터마크가 찍히고 하루 1,000MP 한도가 있다.
        평상시 경로가 아니라 비상용이다. */
  async _cloudsFromRealEarth() {
    let time = null;
    try {
      const r = await fetchT(`${API.REALEARTH}/times?products=globalir`, { timeout: 10_000 });
      if (r.ok) {
        const j = await r.json();
        const list = j.globalir || [];
        time = list[list.length - 1] || null;
      }
    } catch (_) { /* 아래에서 처리 */ }

    if (!time) {
      console.warn('[clouds] 폴백도 실패 — 구름 없이 진행');
      return;
    }
    if (time === this._cloudTime) return;

    const L = this._addImageryWithDepth(
      new Cesium.UrlTemplateImageryProvider({
          url: `${API.REALEARTH}/image?products=globalir&time=${time}&x={x}&y={y}&z={z}`
               + (CONFIG?.REALEARTH_KEY ? `&key=${CONFIG.REALEARTH_KEY}` : ''),
          maximumLevel: 8,
          credit: 'Source: SSEC RealEarth, UW-Madison',
      }),
      { mode: 'infrared', alpha: 0.12 },
    );
    L.brightness = 1.0;
    L.contrast   = 2.2;
    L.colorToAlpha = Cesium.Color.BLACK;
    L.colorToAlphaThreshold = 0.42;
    this._cloudTime = time;
    this._cloudSource = 'realearth';
    this._swapCloudLayer(L);
  },

  /* 고도에 따른 주야 처리 (§5-9 Ambient ↔ Explore)
     Ambient(멀리): 야간면은 도시 불빛만 — 리빙어스 룩
     Explore(가까이): 야간이어도 지표가 보여야 지도로 쓸 수 있음
     → 확대할수록 기본면의 nightAlpha 를 올려 자연스럽게 전환 */
  _t: -1, _d: -1,

  /** 오늘의 실제 위성 영상 켜기/끄기
      ⚠️ 켜면 Blue Marble 위에 덮인다. 확대용 Esri 는 그대로 둔다 —
         가까이 가면 해상도가 훨씬 높은 쪽이 필요하다. */
  /* 왜 VIIRS 인가 (실측)
       같은 적도 타일에서 "거의 검은 픽셀"(=관측 공백) 비율:
         VIIRS SNPP   07-25  0.1%   ← 사실상 공백 없음
         VIIRS NOAA20 07-25  0.1%
         MODIS Terra  07-25  5.0%   ← 하루치가 완전해도 궤도 사이가 빈다
       MODIS 는 관측 폭이 좁아 적도 부근에 궤도 간 틈이 남는다.
       처음에 Terra 로 만들었더니 지구가 세로 줄무늬가 됐다 — 그 이유였다.
       VIIRS 는 관측 폭이 넓어 적도에서도 겹친다. */
  TC_LAYER: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',

  /* 자료가 완전한 날짜를 고른다.
     ⚠️ 파일 크기로는 판별할 수 없다. 공백은 **타일 안쪽의 좁은 띠**라서
        타일 자체는 정상 크기로 온다 (실측: 공백 36% 인 타일도 20KB).
        그래서 실제로 그려보고 검은 픽셀 비율을 센다.
        GIBS 가 CORS 를 열어 두어(실측) 캔버스로 읽을 수 있다.
     ⚠️ "어제"로 고정하지 않는다. 어제도 불완전할 수 있다
        (실측: 07-26 은 VIIRS 도 36.7% 가 검정이었다). 재보고 고른다. */
  /** 트루컬러로 쓸 날짜 고르기.
   *
   * ⚠️ 예전에는 타일 4장만 보고 "검정 4% 이하면 합격"이라 판정했다.
   *    그 4장이 우연히 깨끗해서 통과시켰고, 화면에는 줄무늬가 그대로 나왔다.
   *    32장으로 넓혀 재보니 **어느 날짜, 어느 위성이든 평균 12%** 였다 (실측):
   *      SNPP  07-24 12.1% / 07-21 12.4% / 07-18 13.6%
   *      NOAA20 07-24 11.7% / 07-21 11.8% / 07-18 12.7%
   *    즉 이건 "처리가 덜 끝나서"가 아니라 **띠(swath) 사이가 안 닿는 구간**이다.
   *    날짜를 바꿔서 없앨 수 있는 문제가 아니다.
   *
   * 그래서 판정을 바꿨다: "합격/불합격"이 아니라 **가장 덜 빈 날을 고른다.**
   * 남는 빈 구간은 colorToAlpha 로 뚫어 아래 기본 지도가 비치게 한다.
   */
  async pickTrueColorDate() {
    const base = `${API.GIBS}/${this.TC_LAYER}/default`;
    /* 날짜 확인이 화면 표시보다 오래 걸리면 최신이어도 쓸 수 없다. 전지구 중위도 양쪽을
       대표하는 8장을 본다. 4장은 우연이 컸고, 32장은 실화면에서 1분 가까이 걸렸다. */
    const TILES = [];
    for (const y of [3, 4]) for (const x of [0, 2, 4, 6]) TILES.push([3, y, x]);

    const blackPct = (url) => new Promise((res) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = c.height = 96;
          const g = c.getContext('2d', { willReadFrequently: true });
          g.drawImage(im, 0, 0, 96, 96);
          const d = g.getImageData(0, 0, 96, 96).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (Math.max(d[i], d[i + 1], d[i + 2]) < 12) n++;
          }
          res(n / (96 * 96) * 100);
        } catch (_) { res(100); }
      };
      im.onerror = () => res(100);
      im.src = url;
    });

    const ymd = (back) => {
      const d = new Date(Date.now() - back * 86400000);
      return d.toISOString().slice(0, 10);
    };

    /* ⚠️⚠️ **한 번에 32장을 던지면 안 된다.**
       받은 지적: "나사 구름 누르면 굉징히 늦게 뜨니깐" · "확대나 줌을 하려하면
                  안되 그냥 지구가 움직여"
       두 지적의 원인이 하나다. 이 탐색이 최악 128장을 동시에 받고 각각을 캔버스로
       디코딩한다. 브라우저 연결 수를 이 검사가 다 먹어 **정작 보여줄 타일이 밀리고**,
       메인 스레드가 getImageData 로 막혀 requestRenderMode 가 프레임을 못 낸다.
       그래서 확대를 해도 화면이 안 바뀌고 지구만 도는 것처럼 보였다.
       → 4장씩만 받는다. 느려도 화면이 살아 있는 쪽이 낫다. */
    const pool = async (arr, n, fn) => {
      const out = new Array(arr.length);
      let i = 0;
      await Promise.all(Array.from({ length: Math.min(n, arr.length) }, async () => {
        while (i < arr.length) { const k = i++; out[k] = await fn(arr[k]); }
      }));
      return out;
    };

    let best = null, first = null;
    /* ⚠️ 오늘(back=0)은 넣지 않는다. 아직 궤도가 절반도 안 들어와 있다
       (실측: 07-26 평균 26%, 최대 100%). 어제부터 본다. */
    for (let back = 1; back <= 4; back++) {
      const day = ymd(back);
      const pcts = await pool(TILES, 4, ([z, y, x]) =>
        blackPct(`${base}/${day}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`));
      const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      if (back === 1) first = avg;      // 어제(즉시 띄운 날)의 빈 구간 — 교체 판단용
      /* 받은 지적: "수오미 NPP 자료는 2일전 사진 자료가 들어와요".
         어제 자료가 기존 실측 정상 범위(약 12~14%)에 여유를 둔 18% 이내면
         미세한 공백 차이를 찾으려고 더 오래된 날짜로 내려가지 않는다. */
      if (back === 1 && avg <= 18) {
        this._tcGap = Math.round(avg * 10) / 10;
        return { day, avg, first };
      }
      /* ⚠️ **새 날짜를 조금 우대한다.** 빈 구간이 몇 %p 차이라면 하루라도 새 것이 낫다 —
         사용자가 보고 싶은 건 "가장 안 빈 날"이 아니라 "가장 최근의 쓸 만한 날"이다.
         실측(2026-08-04): 08-02 와 08-01 이 둘 다 멀쩡한데 08-01 이 조금 덜 비어서
         **3일 전 사진**이 뽑혔다. 3%p 안쪽이면 새 쪽을 남긴다.
         ⚠️ 그냥 "제일 새 날"로 하면 안 된다 — 어제가 통째로 비는 날이 실제로 있다
            (08-03 은 한국 상공이 404 였다). 어디까지나 **비슷할 때만** 우대한다. */
      if (!best || avg < best.avg - 3) best = { day, avg };
      /* 확연히 깨끗하면 더 볼 필요가 없다 */
      if (avg < 6) break;
    }
    if (best) {
      this._tcGap = Math.round(best.avg * 10) / 10;
      console.log(`[truecolor] ${best.day} 선택 (빈 구간 ${this._tcGap}%)`);
    }
    return best ? { day: best.day, avg: best.avg, first } : null;
  },

  /** 어제로부터 n 일 전 날짜 (YYYY-MM-DD) */
  _ymdBack(n) {
    const d = new Date(Date.now() - n * 86400000);
    return d.toISOString().slice(0, 10);
  },

  /** 주어진 날짜로 트루컬러 레이어를 만들어 얹는다 (설정 한 곳에 모음) */
  _addTruecolorLayer(day) {
    const L = viewer.imageryLayers.addImageryProvider(
      gibsProvider({ layer: this.TC_LAYER, level: 9, ext: 'jpg', date: day })
    );
    /* ⚠️ 밤면에는 그리지 않는다(반사광이라 밤엔 새까맣다). 밤은 기본면+도시불빛에 맡긴다. */
    L.nightAlpha = 0.0;
    /* ⚠️ 관측 공백 타일은 검은색으로 채워져 온다(투명 아님). 거의 검은 픽셀만 투명으로
       만들어 아래 기본 지도가 비치게 한다. 낮면에만 그리므로 진짜 검정만 노린다. */
    L.colorToAlpha = Cesium.Color.BLACK;
    L.colorToAlphaThreshold = 0.14;
    // 구름·도시불빛보다 아래(기본면 바로 위)에 있어야 한다
    const want = viewer.imageryLayers.indexOf(this.detail) + 1;
    while (viewer.imageryLayers.indexOf(L) > want) viewer.imageryLayers.lower(L);
    return L;
  },

  /** 어제가 유난히 나쁜 날에만 배경에서 더 좋은 날짜로 조용히 교체 */
  _swapTruecolorDate(day) {
    if (!this.truecolor) return;
    const old = this.truecolor;
    const wasShown = old.show, alpha = old.dayAlpha;
    this._tcDate = day;
    this.truecolor = this._addTruecolorLayer(day);
    this.truecolor.show = wasShown;
    this.truecolor.dayAlpha = alpha;
    viewer.imageryLayers.remove(old, true);
    this._imgLoading(true, '수오미 NPP');   // 새 날짜 타일 로딩 표시
  },

  async setTrueColor(on) {
    this._truecolorWanted = !!on;
    if (!on) {
      if (this.truecolor) this.truecolor.show = false;
      this._imgLoading(false);
      this._applyClouds();
      return;
    }
    if (!this.truecolor) {
      /* toggle 이벤트와 applyAll 이 같은 순간 들어와도 GIBS 검사를 중복 실행하거나,
         끈 뒤 늦게 끝난 비동기 검사가 레이어를 되살리지 않게 한 작업만 공유한다. */
      if (this._truecolorPending) {
        await this._truecolorPending;
        if (!this._truecolorWanted || !this.truecolor) return;
      }
    }
    if (!this.truecolor) {
      /* 오래된 안전 날짜를 먼저 보여 주지 않는다. 로딩 표시를 유지한 채 실제 GIBS
         타일을 검사해 최신 완성일을 고른 뒤 그 날짜만 화면에 올린다. */
      this._imgLoading(true, '수오미 최신 촬영일 확인', true);
      const KEY = 'earthus.tcProbe';
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) { }
      const today = this._ymdBack(0);
      this._truecolorPending = (async () => {
        let picked = cached?.on === today && cached?.day ? cached : null;
        if (!picked) {
          const r = await this.pickTrueColorDate();
          picked = r?.day ? { on: today, day: r.day, avg: r.avg } : null;
          if (picked) try { localStorage.setItem(KEY, JSON.stringify(picked)); } catch (_) { }
        }
        return picked;
      })();
      let picked = null;
      try { picked = await this._truecolorPending; }
      finally { this._truecolorPending = null; }
      if (!this._truecolorWanted) { this._imgLoading(false); return; }
      if (!picked?.day) {
        this._imgLoading(false);
        this._say('수오미 NPP의 완성된 최신 촬영일을 확인하지 못했습니다',
          'Could not verify the latest complete Suomi NPP observation day');
        return;
      }
      this._tcDate = picked.day;
      this._tcGap = Number.isFinite(picked.avg) ? Math.round(picked.avg * 10) / 10 : null;
      this.truecolor = this._addTruecolorLayer(picked.day);
    }
    this.truecolor.show = true;
    /* ⚠️ 로딩 표시는 **켤 때마다** 띄운다. 예전엔 레이어를 처음 만들 때만 띄워서,
       두 번째부터는 새 지역 타일을 받는 동안 아무 표시가 없었다 —
       받은 지적: "수오미 위성 누르면 반응이 없어 … 느리게 뜨네".
       이미 캐시돼 바로 뜨는 경우는 _imgLoading 의 2.5초 대기가 알아서 걷는다. */
    this._imgLoading(true, '수오미 NPP');
    // 켤 때 현재 고도에 맞는 알파를 즉시 반영한다 (다음 프레임까지 기다리지 않게)
    this.truecolor.dayAlpha = 1 - (this._d || 0);
    /* ⚠️ 구름을 두 번 그리지 않는다.
       트루컬러 영상에는 그날의 실제 구름이 이미 찍혀 있다. 그 위에 우리 구름
       오버레이(GMGSI, 다른 위성·다른 시각)를 겹치면 구름이 두 겹으로 어긋난다 —
       "구름도 다르다"는 지적이 이것이다. 트루컬러가 켜져 있는 동안은 물린다.
       ⚠️ 사용자의 구름 설정(_cloudOn)은 건드리지 않는다. 트루컬러를 끄면
          원래대로 돌아와야 한다. */
    this._applyClouds();
  },


  /* ── 한 장짜리 큰 그림은 **실제 바이트로** 진행률을 낸다 ─────────────
     받은 지적: "모든 지구 위성 구름 사진은 로딩바 만들자 뜨는지 안뜨는지 모르겠어"

     ⚠️⚠️ 타일 세기(tileLoadProgressEvent)로는 **한 장짜리 그림의 진행을 못 본다.**
        천리안은 채널당 2~3MB 인데 그동안 아무 표시가 없었다 — 켜 놓고 몇 초 동안
        화면이 그대로라 "안 켜졌나" 싶게 된다.
     → fetch 로 직접 받으면서 Content-Length 대비 몇 % 왔는지 그대로 말한다.
        이건 추정이 아니라 **실제로 받은 바이트**다.
     ⚠️ 서버가 길이를 안 주면(압축 전송 등) 퍼센트를 지어내지 않고 흐르는 막대로 둔다. */
  async _fetchImage(url, label) {
    this._imgLoading(true, label);
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) throw new Error(String(r.status));
      const total = Number(r.headers.get('content-length')) || 0;
      if (!r.body || !total) {
        // 길이를 모르면 흐르는 막대 그대로 — 다 받으면 끝낸다
        const b = await r.blob();
        this._imgDone();
        return URL.createObjectURL(b);
      }
      const rd = r.body.getReader();
      const chunks = []; let got = 0;
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        chunks.push(value); got += value.length;
        this._imgBytes(got, total);
      }
      this._imgDone();
      return URL.createObjectURL(new Blob(chunks, { type: 'image/png' }));
    } catch (e) {
      this._imgLoading(false);
      throw e;
    }
  },

  /** 바이트 진행률을 막대에 반영 */
  _imgBytes(got, total) {
    if (!this._tcBar) return;
    this._tcLoadEl?.classList.remove('indet');
    const pct = Math.min(100, Math.round(got / total * 100));
    this._tcBar.style.width = `${Math.max(3, pct)}%`;
    // ⚠️ MB 도 함께 적는다 — 느릴 때 "얼마나 남았나"를 알아야 기다릴지 정한다
    this._tcTxt.textContent =
      `${this._tcLabel} ${pct}% · ${(got / 1e6).toFixed(1)}/${(total / 1e6).toFixed(1)}MB`;
  },

  _imgDone() {
    if (!this._tcBar) return;
    this._tcLoadEl?.classList.remove('indet');
    this._tcBar.style.width = '100%';
    this._tcTxt.textContent = `${this._tcLabel} 100%`;
    setTimeout(() => this._imgLoading(false), 420);
  },

  /** 타일이 다 앉은 뒤에 무언가를 한다 (없으면 그냥 조금 뒤에).
   *  ⚠️ 무거운 배경 작업은 **화면이 다 뜬 뒤에** 시작해야 한다.
   *     같이 달리면 그 작업이 연결을 다 먹어 정작 보여줄 것이 늦게 뜬다. */
  _afterTilesSettle(fn) {
    const globe = viewer.scene.globe;
    let done = false;
    const run = () => { if (done) return; done = true; clearTimeout(t);
      globe.tileLoadProgressEvent.removeEventListener(h);
      // ⚠️ 한 박자 더 쉰다 — 0 이 되자마자 시작하면 후속 타일과 다시 겹친다
      setTimeout(fn, 1500); };
    const h = (remaining) => { if (remaining === 0) run(); };
    globe.tileLoadProgressEvent.addEventListener(h);
    const t = setTimeout(run, 15_000);   // 안 끝나도 언젠간 한다
  },

  /** 위성 영상 로딩 표시 — 타일이 다 로드될 때까지 진행 막대를 띄운다.
   *
   *  받은 지적: "나사 구름 누르면 굉징히 늦게 뜨니깐 로딩바 보여주자"
   *
   *  ⚠️ tileLoadProgressEvent 는 **남은 개수**만 준다. 전체 개수는 안 알려준다.
   *     그래서 **여태 본 최댓값**을 분모로 쓴다. 도중에 더 늘면 분모도 같이 늘려
   *     막대가 **뒤로 가지 않게** 한다 — 되돌아가는 막대는 고장으로 읽힌다.
   *  ⚠️ 한 번이라도 대기(remaining>0)를 본 뒤 0 이 되면 끈다
   *     (캐시로 즉시 0 인 경우 오인 방지). */
  _imgLoading(show, label, hold = false) {
    const globe = viewer.scene.globe;
    if (this._tcProg) { globe.tileLoadProgressEvent.removeEventListener(this._tcProg); this._tcProg = null; }
    clearTimeout(this._tcLoadTimer);
    clearTimeout(this._tcIdleTimer);

    if (!show) {
      this._tcLoadEl?.classList.remove('on');
      this._tcLoadEl?.classList.remove('indet');
      return;
    }

    if (!this._tcLoadEl) {
      const el = document.createElement('div');
      el.id = 'tcLoading';
      el.innerHTML = '<span class="tcl-txt"></span>'
                   + '<span class="tcl-bar"><i></i></span>';
      document.body.appendChild(el);
      this._tcLoadEl = el;
      this._tcBar = el.querySelector('.tcl-bar > i');
      this._tcTxt = el.querySelector('.tcl-txt');
    }
    this._tcLoadEl.classList.add('on');
    /* ⚠️⚠️ 처음에는 **몇 장인지 모른다.** 타일이 큐에 쌓이는 동안은 remaining 이
       계속 늘어서, 최댓값을 분모로 삼으면 막대가 4% 에 붙어 있다(실측으로 확인했다).
       모르는 것을 아는 척하지 않는다 — 총량을 알기 전까지는 **흐르는 막대**로 두고,
       remaining 이 줄기 시작한 뒤에야 퍼센트를 말한다. */
    this._tcLoadEl.classList.add('indet');
    this._tcBar.style.width = '';
    this._tcLabel = label || '위성 영상';
    this._tcTxt.textContent = `${this._tcLabel} 불러오는 중…`;

    let sawPending = false, peak = 0, shown = 0;

    /* ⚠️⚠️ **받을 것이 없으면 막대를 띄우면 안 된다.**
       타일이 이미 캐시에 있으면 remaining 이 처음부터 0 이라 sawPending 이
       영영 참이 되지 않는다 — 실측에서 막대가 13초 넘게 "흐름"으로 떠 있었다.
       (안전 타임아웃 30초까지 갔을 것이다.)
       → 잠깐 기다려 보고 대기가 한 번도 없으면 조용히 끈다. */
    if (!hold) {
      this._tcIdleTimer = setTimeout(() => {
        if (!sawPending) this._imgLoading(false);
      }, 2_500);
    }
    this._tcProg = (remaining) => {
      if (remaining > 0) {
        sawPending = true;
        if (remaining > peak) { peak = remaining; return; }   // 아직 쌓이는 중
        this._tcLoadEl.classList.remove('indet');             // 이제 총량을 안다
        const pct = Math.round((1 - remaining / peak) * 100);
        shown = Math.max(shown, pct);                         // ⚠️ 뒤로 가지 않는다
        this._tcBar.style.width = `${Math.max(4, shown)}%`;
        this._tcTxt.textContent = `${this._tcLabel} 불러오는 중… ${shown}%`;
        return;
      }
      if (sawPending) {
        this._tcLoadEl.classList.remove('indet');
        this._tcBar.style.width = '100%';
        this._tcTxt.textContent = `${this._tcLabel} 100%`;
        // 100% 를 잠깐 보여 주고 끈다 — 갑자기 사라지면 끝난 건지 죽은 건지 모른다
        setTimeout(() => this._imgLoading(false), 420);
        this._tcProg && globe.tileLoadProgressEvent.removeEventListener(this._tcProg);
        this._tcProg = null;
      }
    };
    globe.tileLoadProgressEvent.addEventListener(this._tcProg);
    // 안전 타임아웃 — 어떤 이유로 progress 가 안 끝나도 30초 뒤엔 끈다
    this._tcLoadTimer = setTimeout(() => this._imgLoading(false), 30_000);
  },

  /** 구름 오버레이 표시 여부를 한 곳에서 정한다.
   *
   * ⚠️ **낮과 밤을 나눠야 한다.** 여기서 한 번 틀렸다.
   *    트루컬러가 켜져 있으면 구름 오버레이를 통째로 껐었다(alpha=0).
   *    그런데 트루컬러는 낮면에만 그린다(nightAlpha=0) — 반사광이라 밤엔 새까맣다.
   *    결과: 밤인 쪽에 트루컬러도 없고 구름도 없었다.
   *    받은 지적 그대로다: "아시아는 지금 밤인데 구름이 없어".
   *
   *    그래서 낮/밤을 나눠 정확히 서로를 메우게 한다.
   *      낮면 — 트루컬러가 그날의 실제 구름을 이미 담고 있다 → 오버레이를 물린다
   *      밤면 — 트루컬러가 아무것도 못 그린다              → 오버레이를 그대로 둔다
   *    새벽·황혼선에서 Cesium 이 둘을 부드럽게 섞으므로 이음매가 생기지 않는다.
   *
   * ⚠️ 확대해서 트루컬러가 물러나면(_d) 낮면 구름도 그만큼 되돌린다.
   *    안 그러면 확대했을 때 낮면만 구름이 사라진다. */
  /** 예보 보기(타임라인) — 위성 구름 옅게/복귀 */
  setFxDim(on) { this._fxDim = !!on; this._applyClouds(); },

  _applyClouds() {
    const tcOn = !!(this.truecolor && this.truecolor.show);
    const day = tcOn ? (this._d || 0) : 1.0;
    this.cloudLayers.forEach(L => {
      /* ⚠️ alpha 0 만으로는 부족하다 — 안 그릴 뿐 **타일은 계속 받는다.**
         show=false 라야 요청이 멈춘다. 통신과 텍스처 메모리가 여기서 갈린다. */
      L.show = this._cloudOn;
      /* 타임라인 예보 보기 중엔 옅게 — 위성 구름은 실황이라 미래가 없다.
         진하게 두면 '+48시간의 구름'으로 잘못 읽힌다. (_swapCloudLayer 에도 같은 식) */
      const depth = L._earthusCloudRole !== 'cloud';
      const baseAlpha = depth ? (L._earthusDepthBaseAlpha ?? 0.28) : 1.0;
      L.alpha = this._cloudOn ? baseAlpha * (this._fxDim ? 0.15 : 1.0) : 0.0;
      L.dayAlpha = depth ? day * (L._earthusDepthDayAlpha ?? 1.0) : day;
      L.nightAlpha = depth ? (L._earthusDepthNightAlpha ?? 0.0) : 1.0;
    });
  },


  /* ══════════════════════════════════════════════════════════════
     고해상도 구름 — 확대하면 정지위성으로 갈아탄다
     ══════════════════════════════════════════════════════════════
     받은 요청: "한국 위성 및 한국 지역을 보는 관측 위성 데이터를 가져와서
     지구를 한국쪽으로 확대하면 더 디테일한 구름부터 다양한 자료를 볼 수 있게"

     ⚠️ 천리안(GK-2A)은 못 쓴다.
        기상청 국가기상위성센터가 배포하지만 인증키가 필요하고, NASA GIBS 에도
        RealEarth 에도 GK-2A 레이어가 없다 (실측으로 둘 다 확인).
        대신 **히마와리(Himawari AHI)** 가 한국을 포함한 동아시아를 덮는다:
          해상도 1km  (지금 쓰는 GMGSI 는 2.4km)
          갱신  10분  (GMGSI 는 1시간)
        같은 하늘을 6배 자주, 2.4배 촘촘하게 본다.

     ⚠️ 가시광 밴드(Band3)는 밤에 새까맣다.
        그래서 낮은 Band3, 밤은 적외(Band13)로 나눠 얹는다.
        Cesium 의 dayAlpha/nightAlpha 가 지구의 낮밤 경계를 알아서 처리한다.

     ⚠️ 전지구에서는 켜지 않는다.
        히마와리는 동아시아·서태평양만 본다. 전지구 화면에서 켜면 그 구역만
        다른 자료로 칠해져 이음매가 생긴다 — 예전에 정지위성 낱장을 겹쳤다가
        "구름이 잘린다"는 지적을 받은 것과 같은 문제다. */
  himaLayers: [],
  _himaTime: null,
  _himaVisibleTime: null,
  _himaIRTime: null,
  _himaOn: false,
  _himaManual: false,
  _himaMode: null,

  /* 히마와리가 보는 범위 (위성 위치 140.7°E 기준, 가장자리는 잘라냈다).
     ⚠️ 원반 가장자리는 비스듬히 봐서 왜곡이 크다. 넉넉히 안쪽만 쓴다. */
  HIMA_BOX: [-50, 85, 55, 195],
  /* 이 고도보다 가까울 때만. 전지구에서 켜면 이음매가 보인다. */
  HIMA_H: 5_000_000,

  /** 채널별로 지금 받을 수 있는 가장 최근 10분 단위 시각을 찾는다.
   *  ⚠️ 정지위성은 20~40분 늦게 올라온다. "지금"으로 요청하면 빈 타일이 온다.
   *     실제로 타일을 받아보고 되는 시각을 고른다 — 지어내지 않는다.
   *  ⚠️ 적외와 가시광은 올라오는 시각이 다를 수 있다. 적외 최신 시각 하나를
   *     가시광에도 붙였더니 적외는 보이는데 낮 구름이 통째로 비는 일을 재현했다.
   *  ⚠️ HTTP 200만 보지 않는다. GIBS는 아직 비어 있는 검은 타일도 200으로 줄 수
   *     있으므로 실제 화소의 2% 이상에 신호가 있는지 확인한다. */
  async pickHimaTime(layer = 'Himawari_AHI_Band13_Clean_Infrared',
                     tms = 'GoogleMapsCompatible_Level6') {
    const probe = (ts) => new Promise(res => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => {
        if (im.naturalWidth <= 1) { res(false); return; }
        try {
          const cv = document.createElement('canvas');
          cv.width = cv.height = 64;
          const cx = cv.getContext('2d', { willReadFrequently: true });
          cx.drawImage(im, 0, 0, 64, 64);
          const p = cx.getImageData(0, 0, 64, 64).data;
          let signal = 0;
          for (let i = 0; i < p.length; i += 4) {
            if (p[i + 3] > 8 && Math.max(p[i], p[i + 1], p[i + 2]) > 12) signal++;
          }
          res(signal / (64 * 64) >= 0.02);
        } catch (_) {
          /* CORS 정책이 바뀌어 화소를 못 읽는 날에는 종전의 이미지 존재 검사로 폴백한다. */
          res(true);
        }
      };
      im.onerror = () => res(false);
      im.src = `${API.GIBS}/${layer}/default/${ts}/${tms}/5/12/27.png`;
    });
    const now = Date.now();
    for (let back = 2; back <= 12; back++) {          // 20분 ~ 2시간 전
      const d = new Date(now - back * 10 * 60_000);
      d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 10) * 10, 0, 0);
      const ts = d.toISOString().slice(0, 17) + '00Z';
      if (await probe(ts)) return ts;
    }
    return null;
  },

  async setHima(on) {
    if (on === this._himaOn) return;
    this._himaOn = on;
    if (!on) {
      this._imgLoading(false);
      this.himaLayers.forEach(L => this._removeImageryWithDepth(L));
      this.himaLayers = [];
      this._himaTime = null;
      this._himaVisibleTime = null;
      this._himaIRTime = null;
      this._himaMode = null;
      /* ⚠️ 좌하단 안내가 바로 따라와야 한다. 안 알리면 최대 1분 동안
         전지구 합성 출처가 떠 있는데 화면은 히마와리인 상태가 된다. */
      document.dispatchEvent(new CustomEvent('earthus:imagery'));
      return;
    }
    /* ⚠️ 타일 레이어라 바이트로 못 잰다 — 타일 진행으로 표시한다.
       그래도 표시는 해야 한다: 켜고 자료가 올 때까지 화면이 그대로면
       "고장인가" 싶게 된다. 실제로 그 신고를 받았다. */
    this._imgLoading(true, '히마와리');
    const [visTs, irTs] = await Promise.all([
      this.pickHimaTime('Himawari_AHI_Band3_Red_Visible_1km', 'GoogleMapsCompatible_Level7'),
      this.pickHimaTime('Himawari_AHI_Band13_Clean_Infrared', 'GoogleMapsCompatible_Level6'),
    ]);
    if (!visTs && !irTs) {
      this._himaOn = false;
      console.warn('[hima] 받을 수 있는 시각을 못 찾음');
      this._himaUnavailable();
      return;
    }
    if (!this._himaOn) return;                      // 그 사이 화면이 벗어났다
    this._himaVisibleTime = visTs;
    this._himaIRTime = irTs;
    this._himaTime = this._isNightHere() ? (irTs || visTs) : (visTs || irTs);

    /* 받은 지시(2026-08-11): 빠른 목록의 히마와리9는 저녁에도 보여야 한다.
       낮에는 가시광(Band3), 밤에는 적외(Band13)를 같은 선택 안에서 자동으로 잇는다.
       Cesium의 주야 경계가 두 영상을 섞으므로 지역별 일출·일몰도 따라간다.

       ⚠️ 밤 적외의 색은 강수량이 아니라 구름 꼭대기 온도다. 예전에 비의 양처럼
       읽힌 사고가 있었으므로 ui-source에서 현재 채널과 이 한계를 반드시 밝힌다. */
    const add = (layer, ts, tms, dayA, nightA, threshold, mode) => {
      const provider = new Cesium.UrlTemplateImageryProvider({
        url: `${API.GIBS}/${layer}/default/${ts}/${tms}/{z}/{y}/{x}.png`,
        maximumLevel: tms.endsWith('7') ? 7 : 6,
        credit: 'JMA Himawari via NASA GIBS',
      });
      const L = this._addImageryWithDepth(provider, {
        mode,
        sun: mode === 'visible' ? this._sunFixedAt(ts) : null,
        alpha: mode === 'visible' ? 0.20 : 0.12,
        dayAlpha: dayA > 0 ? 1.0 : 0.0,
        nightAlpha: nightA > 0 ? 1.0 : 0.0,
      });
      L.dayAlpha = dayA;
      L.nightAlpha = nightA;
      /* ⚠️ 검은 배경(원반 바깥)을 뚫어야 지구 나머지가 보인다. */
      L.colorToAlpha = Cesium.Color.BLACK;
      L.colorToAlphaThreshold = threshold;
      this.himaLayers.push(L);
      return L;
    };
    /* ⚠️ 가시광의 검은색 제거 문턱은 0.16을 유지한다. 0.22로 올려 실제 화면을
       비교했더니 지표뿐 아니라 얇은 구름까지 사라졌다. 구름 양을 잘 보이게 하려다
       관측된 구름을 지우는 쪽으로 가면 안 된다. */
    if (visTs) add('Himawari_AHI_Band3_Red_Visible_1km', visTs,
      'GoogleMapsCompatible_Level7', 0.9, 0.0, 0.16, 'visible');
    if (irTs) add('Himawari_AHI_Band13_Clean_Infrared', irTs,
      'GoogleMapsCompatible_Level6', 0.0, 0.82, 0.62, 'infrared');
    this._himaMode = this._isNightHere() ? 'infrared' : 'visible';
    document.dispatchEvent(new CustomEvent('earthus:imagery'));
    console.log(`[hima] 가시광 ${visTs || '없음'} · 적외 ${irTs || '없음'} 적용`);
  },

  /** 히마와리를 보는 지역이 지금 밤이면 그 사실을 알려준다.
   *
   *  ⚠️ 태양 위치를 직접 계산하지 않는다. 화면 중심의 **현지 시각**으로 판단한다 —
   *     경도만 알면 되고(UTC + 경도/15), 이 안내에는 그 정밀도로 충분하다.
   *     '해가 떴는지'를 정확히 따지려면 위도·날짜까지 필요한데, 여기서 그 정확도를
   *     흉내 내면 오히려 틀린 시각을 말하게 된다. 어림임을 전제로 쓴다.
   */
  /** 화면 중심이 지금 밤인가 — 어림값.
   *  ⚠️ 태양 위치를 계산하지 않는다. 경도만으로 현지 시각을 낸다(UTC + 경도/15).
   *     이 안내에는 그 정밀도로 충분하고, 어설프게 정확한 척하면 오히려 틀린다. */
  _isNightHere() {
    let lonDeg = 135;                               // 히마와리 정지 위치 근처
    try {
      const c = Cesium.Cartographic.fromCartesian(viewer.camera.position);
      lonDeg = Cesium.Math.toDegrees(c.longitude);
    } catch (_) {}
    const now = new Date();
    const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
    const localH = (utcH + lonDeg / 15 + 24) % 24;
    return localH < 6 || localH >= 19;
  },

  /* ⚠️ ui.js 를 정적 import 하면 순환이 된다 (registry → imagery → ui → registry).
     안내 한 줄 띄우자고 모듈 그래프를 꼬지 않는다 — 부를 때 가져온다. */
  async _say(ko, en) {
    try {
      const [{ toast }, { i18n }] = await Promise.all([
        import('../ui.js'), import('../i18n.js'),
      ]);
      toast(i18n.lang === 'ko' ? ko : en);
    } catch (_) { /* 안내를 못 띄우는 것으로 레이어를 막지는 않는다 */ }
  },

  /** 켜자마자 현재 자동 선택을 알려준다 (밤일 때만). */
  _himaNightHint() {
    if (!this._isNightHere()) return;
    this._say(
      '히마와리9가 밤 적외선으로 자동 전환했습니다 · 색은 강수량이 아니라 구름 꼭대기 온도입니다',
      'Himawari-9 switched to night infrared · colours show cloud-top temperature, not rainfall');
  },

  /** 실제로 적외 기준 최신 자료를 못 받았을 때 */
  _himaUnavailable() {
    this._say(
      '히마와리9 최신 영상을 아직 받지 못했습니다 — 잠시 뒤 다시 시도해 주세요',
      'The latest Himawari-9 image is not available yet — please try again shortly');
  },

  /** 적외(Band 13) 단독 분석 레이어 — 낮·밤 모두 같은 자료를 쓴다.
   *
   *  왜 따로 두나 (받은 지적)
   *    "일본꺼 구름 데이터 그거 구름에서 왜 비의 양까지 체크되는거 같아"
   *    정확한 관찰이다. 구름 레이어의 **밤 쪽**이 이 적외 자료인데,
   *    GIBS 가 아주 찬 꼭대기를 색으로 강조해서 그린다. 그래서 비처럼 보인다.
   *    빠른 히마와리9는 주야 자동으로 잇되, 전체 목록에는 적외만 계속 비교할 수 있는
   *    분석 선택지를 남긴다. 어느 경로에서도 강수량이 아니라는 설명은 지우지 않는다.
   *
   *  ⚠️ GIBS 히마와리는 3종뿐이고 **회색조 적외가 없다.** 색을 뺄 방법이 없어서,
   *     대신 무엇을 보고 있는지 화면(ui-source)에 적는다.
   */
  async setHimaIR(on) {
    (this.irLayers || []).forEach(L => this._removeImageryWithDepth(L));
    this.irLayers = [];
    if (!on) { this._imgLoading(false); document.dispatchEvent(new CustomEvent('earthus:imagery')); return; }
    /* ⚠️ 타일 레이어라 바이트로 못 잰다 — 타일 진행으로 표시한다.
       그래도 표시는 해야 한다: 켜고 자료가 올 때까지 화면이 그대로면
       "고장인가" 싶게 된다. 실제로 그 신고를 받았다. */
    this._imgLoading(true, '구름 꼭대기 온도');

    const ts = await this.pickHimaTime(
      'Himawari_AHI_Band13_Clean_Infrared', 'GoogleMapsCompatible_Level6');
    if (!ts) { console.warn('[himaIR] 받을 수 있는 시각을 못 찾음'); return; }
    if (!this._irManual) return;                    // 그 사이 꺼졌다
    this._irTime = ts;

    const L = this._addImageryWithDepth(
      new Cesium.UrlTemplateImageryProvider({
          url: `${API.GIBS}/Himawari_AHI_Band13_Clean_Infrared/default/${ts}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
          maximumLevel: 6,
          credit: 'JMA Himawari via NASA GIBS',
      }),
      { mode: 'infrared', alpha: 0.12 },
    );
    // 낮이든 밤이든 같은 자료다 — 적외는 해와 무관하게 관측한다.
    L.dayAlpha = 0.82;
    L.nightAlpha = 0.82;
    /* ⚠️ 임계값을 구름 레이어(0.16)보다 크게 잡는다.
       적외 영상에서 **어두운 곳 = 따뜻한 곳**(맑은 지표·해수면)이다.
       0.16 으로 두면 그 회색이 전부 남아 지구 전체에 회색 막이 씌워진다.
       0.62 면 따뜻한 배경은 비치고 찬 구름(밝은 회색~컬러)만 남는다. */
    L.colorToAlpha = Cesium.Color.BLACK;
    L.colorToAlphaThreshold = 0.62;
    this.irLayers.push(L);
    document.dispatchEvent(new CustomEvent('earthus:imagery'));
    console.log(`[himaIR] ${ts} 적용`);
  },

  /** 히마와리가 보이는 곳으로 화면을 옮긴다.
   *  ⚠️ 전지구 화면에 두면 동아시아만 다른 자료로 칠해져 이음매가 보인다.
   *     그래서 켜는 순간 그 구역 한가운데로 데려간다 — 한국이 중심에 오게 잡았다. */
  flyToHima() {
    try {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(128, 34, 4_200_000),
        duration: 1.6,
      });
    } catch (_) { /* 카메라가 아직 없을 수 있다 */ }
  },

  /* ── 천리안2A ────────────────────────────────────────────────
     Lambda(gk2a-clouds)가 NOAA 공개 원본을 등경위도 PNG와 지역 타일로 바꾼다.
     빠른 메뉴는 동아시아 2km 타일부터 시작해, 한반도로 가까워지면 원본 해상도를
     살린 0.5km 타일만 추가한다. 멀리서 0.5km 전체를 받지 않는 것이 발열·통신의 핵심이다. */
  gk2aLayers: {},
  _gk2aMeta: null,
  _gk2aAt: 0,
  gk2aAutoLayers: [],
  /* 전면 적외(8km)를 단독으로 쓰면 태풍의 큰 흐름은 보이지만, 한국·일본·대만의
     구름 결은 원본 2km를 3.4배 줄인 만큼 사라진다. 전면과 동아시아 상세는
     서로 대체하는 레이어가 아니라 한 장면의 서로 다른 확대 단계다. store의
     배타 규칙은 그대로 지키면서, 이 한 선택 안에서만 두 제공자를 관리한다. */
  gk2aWideIRLayers: [],
  _gk2aWideIROn: false,
  _gk2aAutoOn: false,
  _gk2aAutoMode: null,
  _gk2aAutoChannel: null,
  _gk2aAutoTimer: 0,
  _gk2aAutoPending: null,
  _gk2aDetailPending: null,
  _gk2aDetailWanted: false,
  _gk2aDetailOn: false,

  async _gk2aBox() {
    // ⚠️ 범위를 코드에 박지 않는다. Lambda 가 격자를 바꾸면 여기도 같이 틀어진다.
    //    meta.json 이 말하는 대로 얹는다.
    if (this._gk2aMeta && Date.now() - this._gk2aAt < 5 * 60_000) return this._gk2aMeta;
    try {
      const r = await fetchT(`${API.GK2A}/meta.json`, { cache: 'no-cache' });
      this._gk2aMeta = r.ok ? await r.json() : null;
      this._gk2aAt = Date.now();
    } catch (_) { this._gk2aMeta = null; }
    return this._gk2aMeta;
  },

  /** 메타의 채널별 관측시각(YYYYMMDDHHMM)을 Date로 바꾼다.
   *  ⚠️ 최상위 meta.time은 여러 채널 중 가장 최신일 뿐이다. 적외가 04:30이고
   *     가시광이 04:46인 운영 자료에서 적외에도 04:46을 붙이는 오류가 실제로 있었다. */
  _gk2aDate(info, meta) {
    if (!info) return null;
    const s = info?.at;
    if (/^\d{12}$/.test(s || '')) {
      return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8),
                               +s.slice(8, 10), +s.slice(10, 12)));
    }
    return meta?.time ? new Date(meta.time) : null;
  },

  /** 표준 Web Mercator XYZ 타일 메타가 있으면 필요한 줌 타일만, 옛 산출물이면 단일 PNG를 읽는다.
   *  ⚠️ UrlTemplate 제공자에 지역 rectangle을 주면 가까이 확대할 때 Cesium 1.143의
   *     visible-frustum 계산이 터졌다. 제공자는 전역으로 두고, 실제 파일만 지역에 만든다. */
  async _addGK2ALayer(ch, meta, label) {
    const info = meta?.channels?.[ch];
    const b = info?.bbox;
    if (!b || !info?.ok) throw new Error(info?.reason || '자료 없음');
    const rectangle = Cesium.Rectangle.fromDegrees(b.west, b.south, b.east, b.north);
    let provider;
    if (info.tiles?.scheme === 'webmercator-global-v1' && info.tiles.template) {
      const tilingScheme = new Cesium.WebMercatorTilingScheme();
      provider = new Cesium.UrlTemplateImageryProvider({
        /* 산출기를 고쳐도 같은 관측시각의 타일 URL은 브라우저가 max-age 동안
           이전 알파 조각으로 남긴다. 관측시각은 그대로 두고 산출 버전만 더해
           이미 열린 탭도 새 경계 보정 타일을 즉시 다시 받는다. */
        url: `${API.GK2A}/${info.tiles.template}?t=${encodeURIComponent(info.at || '')}&render=20260813-edge1`,
        // ⚠️ rectangle을 넣지 말 것 — 위 주석의 렌더 중단을 실화면에서 반복 재현했다.
        tilingScheme,
        tileWidth: info.tiles.tileWidth || 512,
        tileHeight: info.tiles.tileHeight || 512,
        minimumLevel: Number(info.tiles.minimumLevel ?? 0),
        maximumLevel: Number(info.tiles.maximumLevel ?? 0),
        credit: 'GK-2A · KMA/NMSC via NOAA open data',
      });
    } else {
      const src = await this._fetchImage(
        `${API.GK2A}/${ch}.png?t=${encodeURIComponent(info.at || meta.time || '')}`, label);
      provider = new Cesium.SingleTileImageryProvider({
        url: src,
        rectangle,
        tileWidth: info.width,
        tileHeight: info.height,
        credit: 'GK-2A · KMA/NMSC via NOAA open data',
      });
    }
    /* 천리안 산출물은 서버가 원본 신호로 만든 gray+alpha다. 적외·가시광 모두
       그 기존 알파만 깊이 마스크로 재사용한다. 새 구름 판정을 만들지 않는다.
       가시광만 채널 관측 시각의 태양 방향으로 옮기고, 적외·야간 하층운은
       물리적 그림자처럼 보이지 않는 약한 명암 분리만 둔다. 수증기는 구름층이
       아니므로 깊이 효과를 붙이지 않는다. */
    const visible = ch.startsWith('vi006');
    const cloudChannel = visible || ch === 'ir112' || ch === 'ir112ea' || ch === 'nightlow';
    const observed = this._gk2aDate(info, meta);
    const layer = cloudChannel
      ? this._addImageryWithDepth(provider, {
          mode: 'alpha',
          sun: visible && observed ? this._sunFixedAt(observed.toISOString()) : null,
          alpha: visible ? 0.20 : 0.14,
          dayAlpha: visible ? 1.0 : 1.0,
          nightAlpha: visible ? 0.0 : 1.0,
        })
      : viewer.imageryLayers.addImageryProvider(provider);
    layer.alpha = 1.0;
    layer._earthusGK2AInfo = info;
    return layer;
  },

  /** NOAA 태양 위치 근사식. 한국/동아시아 중심의 가시광 사용 가능 여부만 판정한다.
   *  산출 Lambda가 가시광을 비우는 태양고도 약 9°와 같은 경계를 쓴다. */
  _gk2aDaylight(at = new Date()) {
    let lon = 127.5, lat = 36.0;
    try {
      const c = viewer.camera.positionCartographic;
      const x = Cesium.Math.toDegrees(c.longitude), y = Cesium.Math.toDegrees(c.latitude);
      if (x >= 114 && x <= 150 && y >= 23 && y <= 47) { lon = x; lat = y; }
    } catch (_) { }
    const start = Date.UTC(at.getUTCFullYear(), 0, 0);
    const doy = Math.floor((Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - start) / 86400000);
    const hour = at.getUTCHours() + at.getUTCMinutes() / 60;
    const g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
      - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g)
      - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g)
      - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const tst = ((at.getUTCHours() * 60 + at.getUTCMinutes() + eq + 4 * lon) % 1440 + 1440) % 1440;
    const ha = (tst / 4 - 180) * Math.PI / 180;
    const p = lat * Math.PI / 180;
    const sinAlt = Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(ha);
    return Math.asin(Math.max(-1, Math.min(1, sinAlt))) * 180 / Math.PI > 9;
  },

  _removeGK2AAutoLayers() {
    this.gk2aAutoLayers.forEach(L => this._removeImageryWithDepth(L));
    this.gk2aAutoLayers = [];
    this._gk2aDetailWanted = false;
    this._gk2aDetailOn = false;
  },

  /** 전면 8km와 동아시아 2km는 같은 장면을 보완하는 자료지만, 한 화면에
   *  겹쳐 칠하면 해상도·처리 시각 차이가 두 겹 구름처럼 읽힌다. 동아시아 안에서
   *  충분히 가까워진 경우에는 상세만, 그 밖에서는 전면만 요청·표시한다.
   *
   *  ⚠️ 제공자 rectangle을 제한하지 않는다. Cesium 1.143에서 Web Mercator
   *  XYZ provider에 rectangle을 주면 확대 중 frustum 계산이 멈춘다. 여기서는
   *  이미 만든 레이어의 show만 바꾼다. show=false면 타일 요청도 멈춘다. */
  _syncGK2AAutoLevels(h) {
    const overview = this.gk2aAutoLayers.find(L => L._earthusGK2ARole === 'overview');
    const broad = this.gk2aAutoLayers.find(L => L._earthusGK2ARole === 'broad');
    const fine = this.gk2aAutoLayers.find(L => L._earthusGK2ARole === 'detail');
    const b = broad?._earthusGK2AInfo?.bbox;
    let inside = false;
    try {
      const c = viewer.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
      inside = !!b && lon >= b.west + 2 && lon <= b.east - 2
        && lat >= b.south + 2 && lat <= b.north - 2;
    } catch (_) { }
    /* 2,400km보다 멀면 한 화면에 동아시아 전역과 전면 경계가 함께 들어온다.
       이 거리에서는 8km 전면 하나가 정직하다. 더 가까워져 상세 범위 안에
       들어온 뒤에만 2km를 단독으로 보인다. */
    const broadOnly = !!broad && inside && h < 2_400_000 && !fine;
    if (overview) overview.show = !broadOnly && !fine;
    if (broad) broad.show = broadOnly;
    if (fine) fine.show = true;
  },

  _removeGK2AWideIRLayers() {
    this.gk2aWideIRLayers.forEach(L => this._removeImageryWithDepth(L));
    this.gk2aWideIRLayers = [];
  },

  /** 전면 8km는 태풍의 넓은 흐름용, 동아시아 2km는 실제 판독용이다.
   *
   * ⚠️ 받은 지적: "천리안위성 8km의 구름 위성이 성능이 떨어진다".
   * 위성 원본 적외는 2km지만 전면 5500×5500을 1600×1600으로 줄인 결과가
   * 8km다. 전면 PNG를 5500px로 키우면 매 10분마다 수십 MB를 폰에 강요한다.
   * 따라서 전면은 한 장으로 유지하고, 같은 관측시각의 동아시아 2km XYZ 타일을
   * 그 위에 얹는다. 범위 밖(필리핀 남쪽·서태평양 동쪽)은 전면이 남고, 범위 안은
   * 실제 2km 결을 쓴다. */
  async setGK2AWideIR(on) {
    this._gk2aWideIROn = on;
    if (!on) {
      this._imgLoading(false);
      this._removeGK2AWideIRLayers();
      return;
    }
    if (this.gk2aWideIRLayers.length) return;
    this._imgLoading(true, '천리안2A 구름');

    const m = await this._gk2aBox();
    const overview = m?.channels?.ir112;
    const detail = m?.channels?.ir112ea;
    if (!overview?.ok) {
      this._say(overview?.reason
        ? `천리안 전면 적외를 아직 못 받았습니다 — ${overview.reason}`
        : '천리안 전면 적외를 아직 못 받았습니다',
      'Chollian full-disk infrared is not available yet');
      return;
    }

    try {
      const fullLayer = await this._addGK2ALayer('ir112', m, '천리안 전면 적외 8km');
      if (!this._gk2aWideIROn) {
        this._removeImageryWithDepth(fullLayer);
        return;
      }
      fullLayer._earthusGK2ARole = 'overview';
      this.gk2aWideIRLayers.push(fullLayer);

      /* 상세 타일이 늦거나 일시적으로 실패해도 전면 관측을 버리지 않는다.
         "전면 8km + 동아시아 2km"라고 약속한 상태만 화면 설명에서 바로잡는다. */
      if (detail?.ok) {
        try {
          const detailLayer = await this._addGK2ALayer('ir112ea', m, '천리안 동아시아 적외 2km');
          if (!this._gk2aWideIROn) {
            this._removeImageryWithDepth(detailLayer);
            return;
          }
          detailLayer._earthusGK2ARole = 'east-asia-detail';
          this.gk2aWideIRLayers.push(detailLayer);
        } catch (e) {
          console.warn('[gk2a-wide-ir-detail]', e.message);
        }
      }
      document.dispatchEvent(new CustomEvent('earthus:imagery'));
    } catch (e) {
      this._removeGK2AWideIRLayers();
      this._say(`천리안 영상을 받지 못했습니다 (${e.message})`, 'Failed to load Chollian imagery');
      return;
    }

    const t = this._gk2aDate(overview, m);
    if (t) {
      const min = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
      const hhmm = t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      this._say(`천리안2A 전면 8km · 동아시아 2km · ${hhmm} 관측 · ${min}분 전`,
        `Chollian-2A full disk 8 km · East Asia 2 km · ${min} min ago`);
    }
  },

  async _loadGK2AAuto() {
    if (this._gk2aAutoPending) return this._gk2aAutoPending;
    this._gk2aAutoPending = (async () => {
      this._imgLoading(true, '천리안2A 자동 영상');
      const m = await this._gk2aBox();
      if (!this._gk2aAutoOn || !m) return;
      const daylight = this._gk2aDaylight();
      const overview = daylight ? 'vi006fd' : 'ir112';
      const broad = daylight ? 'vi006ea' : 'ir112ea';
      const overviewInfo = m.channels?.[overview];
      const broadInfo = m.channels?.[broad];
      if (!overviewInfo?.ok) throw new Error(overviewInfo?.reason || '자동 전면 채널 자료 없음');

      this._removeGK2AAutoLayers();
      const overviewLayer = await this._addGK2ALayer(
        overview, m, daylight ? '천리안 전면 가시광' : '천리안 전면 적외 8km');
      if (!this._gk2aAutoOn) { this._removeImageryWithDepth(overviewLayer); return; }
      overviewLayer._earthusGK2ARole = 'overview';
      this.gk2aAutoLayers.push(overviewLayer);

      /* 전면으로 넓게 본 상태를 보장하고, 동아시아 상세가 실제로 있을 때만 2km를 겹친다.
         상세가 늦었다고 전면 관측까지 버리면 '광범위하게 보기'가 빈 화면이 된다. */
      if (broadInfo?.ok) {
        try {
          const broadLayer = await this._addGK2ALayer(
            broad, m, daylight ? '천리안 동아시아 가시광 2km' : '천리안 동아시아 적외 2km');
          if (!this._gk2aAutoOn) { this._removeImageryWithDepth(broadLayer); return; }
          broadLayer._earthusGK2ARole = 'broad';
          this.gk2aAutoLayers.push(broadLayer);
        } catch (e) {
          console.warn('[gk2a-auto-detail]', e.message);
        }
      }

      this._gk2aAutoMode = daylight ? 'visible' : 'infrared';
      this._gk2aAutoChannel = broadInfo?.ok ? broad : overview;
      this._syncGK2AAutoLevels(viewer.camera.positionCartographic?.height || 24_000_000);
      this._updateGK2ADetail(viewer.camera.positionCartographic?.height || 24_000_000);
      document.dispatchEvent(new CustomEvent('earthus:imagery'));

      const observed = this._gk2aDate(broadInfo?.ok ? broadInfo : overviewInfo, m);
      if (observed) {
        const min = Math.max(0, Math.round((Date.now() - observed.getTime()) / 60000));
        const hhmm = observed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        this._say(
          `천리안2A ${daylight ? '가시광' : '적외'} · 전면 + 동아시아 2km · ${hhmm} 관측 · ${min}분 전`,
          `Chollian-2A ${daylight ? 'visible' : 'infrared'} · full disk + E. Asia 2 km · ${min} min ago`);
      }
    })().catch(e => {
      console.warn('[gk2a-auto]', e.message);
      this._say(`천리안 자동 영상을 받지 못했습니다 (${e.message})`, 'Failed to load Chollian imagery');
    }).finally(() => { this._gk2aAutoPending = null; });
    return this._gk2aAutoPending;
  },

  setGK2AAuto(on) {
    /* 빠른 레이어는 store 배타 그룹을 거쳐 오지만, 초기화 중 비동기 구름 교체가
       뒤늦게 끝나거나 외부 호출이 이 메서드로 바로 들어와도 NOAA 합성본을 남기지
       않는다. 상태·화면을 함께 끄므로 '천리안 선택인데 NOAA 구름도 보임'이 없다. */
    if (on && store.isOn('clouds')) store.setLayer('clouds', false);
    const firstOpen = on && !this._gk2aAutoOn;
    this._gk2aAutoOn = on;
    if (!on) {
      this._imgLoading(false);
      clearTimeout(this._gk2aAutoTimer);
      this._gk2aAutoTimer = 0;
      this._removeGK2AAutoLayers();
      this._gk2aAutoMode = this._gk2aAutoChannel = null;
      document.dispatchEvent(new CustomEvent('earthus:imagery'));
      return;
    }
    /* 이미 받은 레이어로 돌아가는 경우에도 전환 시작을 즉시 알려야 한다. */
    this._imgLoading(true, '천리안2A 자동 영상');
    if (firstOpen) {
      /* 빠른 메뉴인데 현재 화면이 동아시아 밖이면 회색 빈 영역만 보인다.
         히마와리와 같은 원칙으로 관측 범위에 한 번만 데려가고, 이후 카메라는 건드리지 않는다. */
      try {
        const c = viewer.camera.positionCartographic;
        const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
        if (c.height > 7_000_000 || lon < 108 || lon > 156 || lat < 17 || lat > 53) {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(128, 36, 4_200_000),
            duration: 1.4,
          });
        }
      } catch (_) { }
    }
    if (!this.gk2aAutoLayers.length) this._loadGK2AAuto();
    /* 일몰을 지나도 낮 채널이 남지 않게, 켜진 동안에만 5분마다 한 번 판정한다.
       렌더를 요청하는 애니메이션이 아니라 단순 시각 확인이고, 끄면 즉시 취소한다. */
    if (this._gk2aAutoTimer) return;
    this._gk2aAutoTimer = setTimeout(() => {
      this._gk2aAutoTimer = 0;
      if (!this._gk2aAutoOn) return;
      const next = this._gk2aDaylight() ? 'visible' : 'infrared';
      if (next !== this._gk2aAutoMode) {
        this._removeGK2AAutoLayers();
        this._loadGK2AAuto();
      }
      this.setGK2AAuto(true);
    }, 5 * 60_000);
  },

  _updateGK2ADetail(h) {
    this._syncGK2AAutoLevels(h);
    const info = this._gk2aMeta?.channels?.vi006;
    const b = info?.bbox;
    let inside = false;
    try {
      const c = viewer.camera.positionCartographic;
      const lon = Cesium.Math.toDegrees(c.longitude), lat = Cesium.Math.toDegrees(c.latitude);
      inside = b && lon >= b.west - 2 && lon <= b.east + 2 && lat >= b.south - 2 && lat <= b.north + 2;
    } catch (_) { }
    /* 1,800km에서 열었더니 8°짜리 상세 상자의 경계가 화면에 들어와, 관측시각이
       6분 다른 2km 영상과 세로 이음매가 보였다. 상자 경계가 화면 밖으로 나가는
       거리에서만 상세를 연다. 해상도가 실제로 필요한 거리이기도 하다. */
    const show = this._gk2aAutoOn && this._gk2aAutoMode === 'visible'
      && !!info?.ok && inside && h < 850_000;
    this._gk2aDetailWanted = show;
    const detail = this.gk2aAutoLayers.find(L => L._earthusGK2ARole === 'detail');
    if (show && !detail) {
      if (!this._gk2aDetailPending) {
        /* 멀리 있을 때 show=false 제공자를 미리 만들 필요가 없다. 실제로 필요한 850km
           안에서만 제공자 자체를 만들고, 다시 멀어지면 파괴해야 통신·메모리도 단계적으로 쓴다. */
        this._gk2aDetailPending = this._addGK2ALayer(
          'vi006', this._gk2aMeta, '천리안 한반도 0.5km').then(L => {
          if (!this._gk2aDetailWanted || !this._gk2aAutoOn) {
            this._removeImageryWithDepth(L);
            return;
          }
          L._earthusGK2ARole = 'detail';
          this.gk2aAutoLayers.push(L);
          this._gk2aDetailOn = true;
          this._syncGK2AAutoLevels(viewer.camera.positionCartographic?.height || h);
          viewer.scene.requestRender();
          document.dispatchEvent(new CustomEvent('earthus:imagery'));
          this._announceGK2ADetail(true, L);
        }).catch(e => console.warn('[gk2a-detail]', e.message))
          .finally(() => { this._gk2aDetailPending = null; });
      }
      return;
    }
    if (!show && detail) {
      this._removeImageryWithDepth(detail);
      this.gk2aAutoLayers = this.gk2aAutoLayers.filter(L => L !== detail);
      this._gk2aDetailOn = false;
      this._syncGK2AAutoLevels(h);
      viewer.scene.requestRender();
      document.dispatchEvent(new CustomEvent('earthus:imagery'));
      this._announceGK2ADetail(false, this.gk2aAutoLayers.find(L => L._earthusGK2ARole === 'broad'));
    }
  },

  _announceGK2ADetail(show, current) {
    /* 화면 설명의 채널 시각만 바뀌고 아래 토스트에는 2km 시각이 남으면 서로 모순된다.
       단계가 실제로 전환될 때 현재 보이는 채널의 관측시각도 함께 바꾼다. */
    const observed = this._gk2aDate(current?._earthusGK2AInfo, this._gk2aMeta);
    if (observed) {
      const min = Math.max(0, Math.round((Date.now() - observed.getTime()) / 60000));
      const hhmm = observed.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      this._say(
        `천리안2A ${show ? '가시광 0.5km' : '가시광 2km'} · ${hhmm} 관측 · ${min}분 전`,
        `Chollian-2A visible ${show ? '0.5 km' : '2 km'} · ${min} min ago`);
    }
  },

  async setGK2A(ch, on) {
    const cur = this.gk2aLayers[ch];
    if (!on) {
      this._imgLoading(false);
      if (cur) this._removeImageryWithDepth(cur);
      this.gk2aLayers[ch] = null;
      return;
    }
    if (cur) { cur.show = true; return; }
    this._imgLoading(true, '천리안2A 영상');

    const m = await this._gk2aBox();
    const info = m?.channels?.[ch];
    /* ⚠️⚠️ **범위는 채널마다 다르다.** 적외·수증기는 전면(위성이 보는 전부),
       가시광은 한반도만이다. 예전처럼 최상위 bbox 하나를 쓰면
       한반도 그림이 전면 사각형에 늘어붙어 **엉뚱한 자리에 그려진다.** */
    const box = info?.bbox;
    /* ⚠️⚠️ 자료가 없으면 **아무것도 얹지 않고 그렇게 말한다.**
       빈 레이어를 얹어 두면 "켰는데 왜 안 보이지"가 되고, 그게 고장으로 읽힌다.
       특히 가시광은 **밤이면 원본이 있어도 새까맣다** — 그건 고장이 아니다. */
    if (!box || !info?.ok) {
      this._say(
        info?.reason ? `천리안 자료를 아직 못 받았습니다 — ${info.reason}`
                     : '천리안 자료를 아직 못 받았습니다',
        'Chollian imagery is not available yet');
      return;
    }
    const b = box;
    /* ⚠️ 채널당 2~3MB 다. 그냥 얹으면 다 올 때까지 화면이 그대로라
       "안 켜졌나" 싶게 된다 — 받으면서 진행률을 보여준다. */
    const LABEL = { ir112: '천리안 구름', nightlow: '천리안 야간 하층운',
                    vi006: '천리안 구름(낮)', wv063: '천리안 수증기' }[ch]
                || '천리안 영상';
    let L;
    try {
      L = await this._addGK2ALayer(ch, m, LABEL);
    } catch (e) {
      this._say(`천리안 영상을 받지 못했습니다 (${e.message})`, 'Failed to load Chollian imagery');
      return;
    }
    /* ⚠️ 밤낮을 나누지 않는다. 적외는 밤에도 유효하고, 가시광은 원본 자체가
       밤에 어두워 알아서 사라진다 — Cesium 의 nightAlpha 로 지우면
       "밤에도 보이는 적외"라는 이 레이어의 존재 이유가 없어진다. */
    L.alpha = 1.0;
    this.gk2aLayers[ch] = L;

    /* 한반도만 덮는 채널(가시광)일 때만 그 자리로 데려간다.
       ⚠️ 전면 채널까지 끌고 가면 남미를 보다가 켰는데 화면이 한국으로 튄다 —
          그 채널은 거기서도 보이는데 말이다. */
    try {
      if (info.area !== 'LA') throw 0;
      const mid = viewer.camera.positionCartographic;
      const far = Cesium.Math.toDegrees(mid.longitude) < b.west - 6
               || Cesium.Math.toDegrees(mid.longitude) > b.east + 6
               || Cesium.Math.toDegrees(mid.latitude) < b.south - 6
               || Cesium.Math.toDegrees(mid.latitude) > b.north + 6
               || mid.height > 6_000_000;
      if (far) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            (b.west + b.east) / 2, (b.south + b.north) / 2, 2_400_000),
          duration: 1.4,
        });
      }
    } catch (_) { }

    /* ⚠️ **언제 찍은 것인지 반드시 말한다.** 위성 영상은 지금처럼 보이지만
       10~20분 전이다. 그 사실을 안 적으면 사용자가 실시간으로 읽는다. */
    const t = this._gk2aDate(info, m);
    if (t) {
      const min = Math.round((Date.now() - t.getTime()) / 60000);
      const hhmm = t.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      this._say(`천리안2A ${hhmm} 관측 · ${min}분 전`, `Chollian-2A · ${min} min ago`);
    }
    /* 가시광인데 지금 밤이면 미리 알려준다 — 새까만 화면은 고장으로 읽힌다 */
    if (ch === 'vi006' && this._isNightHere()) {
      this._say('지금 이 지역은 밤이라 가시광 위성이 구름을 볼 수 없습니다 — 「천리안 구름」을 켜 보세요',
                'It is night here — try “Chollian clouds” (infrared)');
    }
    if (ch === 'nightlow') {
      this._say(
        '야간 하층운 신호입니다 · 해가 뜬 곳은 자료 없음 · 안개 여부는 판정할 수 없습니다',
        'Night low-cloud signal · no data in daylight · this cannot determine whether cloud reaches the ground');
    }
  },

  /** 화면 중심이 히마와리 구역 안이고 충분히 가까운가 */
  himaWanted(h, lon, lat) {
    if (h > this.HIMA_H || lon == null) return false;
    const [s, w, n, e] = this.HIMA_BOX;
    /* ⚠️ 0~360 으로 맞춘다. +180 을 더하면 안 된다 — 한 번 그렇게 썼다가
       경도 127.5°(한국)가 307.5 로 바뀌어 구역 밖으로 판정됐다. */
    const L = ((lon % 360) + 360) % 360;
    const w2 = ((w % 360) + 360) % 360, e2 = ((e % 360) + 360) % 360;
    const inLon = w2 <= e2 ? (L >= w2 && L <= e2) : (L >= w2 || L <= e2);
    return lat >= s && lat <= n && inLon;
  },

  updateForHeight(h) {
    const FAR = 12_000_000, NEAR = 2_500_000;
    const t = Math.min(1, Math.max(0, (FAR - h) / (FAR - NEAR)));  // 0(멀다) → 1(가깝다)

    // 고해상도 면은 더 가까이서 들어온다. 전지구에서 실사가 섞이면 리빙어스 룩이 깨진다.
    const D_FAR = 3_000_000, D_NEAR = 700_000;
    const d = Math.min(1, Math.max(0, (D_FAR - h) / (D_FAR - D_NEAR)));

    // 매 프레임 호출된다. 값이 그대로면 쓰지 않는다 —
    // 알파를 대입하면 Cesium 이 레이어를 다시 합성한다.
    if (Math.abs(t - this._t) > 0.002) {
      this._t = t;
      if (this.base) this.base.nightAlpha = t;
      if (this.citylight) this.citylight.nightAlpha = 1 - t * 0.55;  // 확대해도 완전히 죽이진 않음
    }
    if (Math.abs(d - this._d) > 0.002) {
      this._d = d;
      if (this.detail) this.detail.alpha = d;
      /* ⚠️ Cesium 기본 크레딧 UI는 앱 레이아웃 때문에 숨겨져 있다(viewer.js).
         따라서 확대용 Esri 영상이 실제로 보이기 시작/끝날 때 좌하단 출처를 다시
         그려야 한다. 매 프레임 보내면 DOM을 계속 갱신하므로 경계에서 한 번만 보낸다. */
      const creditOn = d > 0.02;
      if (creditOn !== this._detailCreditOn) {
        this._detailCreditOn = creditOn;
        document.dispatchEvent(new CustomEvent('earthus:imagery'));
      }
      /* ⚠️ 확대하면 트루컬러를 물린다.
         일일 트루컬러는 250m/px 가 한계다(레벨 9). 그보다 가까이 가면
         픽셀이 무너져 보인다 — "확대하면 픽셀이 무너진다"는 지적 그대로다.
         고해상도 실사(Esri, 레벨 19)가 들어오는 구간과 겹치게 빼서
         전환이 끊기지 않게 한다. 멀리서는 연기가 보이고, 가까이서는 선명해진다. */
      if (this.truecolor) {
        this.truecolor.dayAlpha = 1 - d;
        this._applyClouds();   // 트루컬러가 물러난 만큼 낮면 구름을 되돌린다
      }
    }

    // 0.5km 한반도 타일은 가까이 왔을 때만 보이고 요청된다.
    this._updateGK2ADetail(h);

    /* ── 자동 히마와리 제거 ────────────────────────────────────
       ⚠️ 예전엔 구름(NOAA)이 켜진 채 동아시아로 확대하면 히마와리를 자동으로 얹었다.
          그런데 이 경로는 store 의 배타 그룹(구름 4종 중 하나만)을 우회해서,
          "구름과 일본(히마와리)이 동시에 뜨는" 문제가 있었다.
          → 히마와리는 이제 **사람이 메뉴에서 직접 고를 때만** 켜진다.
            수동으로 고르면 store 배타가 다른 구름 3종을 자동으로 끈다. */
  },

  set(id, on) {
    switch (id) {
      case 'clouds':
        this._cloudOn = on;
        if (on) this._imgLoading(true, 'NOAA 전지구 구름');
        /* ⚠️ 켜는데 아직 받아둔 게 없으면 그때 받는다.
           init() 이 꺼진 상태로 시작했을 수 있다(첫 화면 부하를 줄이려고). */
        if (on && !this.cloudLayers.length) this._addClouds();
        this._applyClouds();
        break;
      /* 히마와리를 사람이 직접 골랐을 때.
         ⚠️ 구름(전지구 합성)을 확대했을 때 자동으로 갈아타는 것과는 다르다.
            직접 고르면 고도와 무관하게 켜 두고, 볼 수 있는 곳으로 화면을 옮긴다. */
      case 'himawari':
        this._himaManual = on;
        if (on) {
          this.setHima(true);
          this.flyToHima();
          /* 밤이면 적외로 자동 전환한다. 색을 강수량으로 읽지 않도록 바로 알린다. */
          this._himaNightHint();
        } else {
          this.setHima(false);
        }
        break;
      /* 적외 단독 — 구름 꼭대기 온도.
         ⚠️ 이건 **강수량이 아니다.** 아주 찬 꼭대기(색이 진한 곳)는 대개 대류가 강해
            소나기·뇌우가 있을 수 있지만, 높고 얇은 권운도 차갑다. 화면에 그렇게 적는다. */
      case 'himaIR':
        this._irManual = on;
        if (on) { this.setHimaIR(true); this.flyToHima(); }
        else { this.setHimaIR(false); }
        break;
      case 'gk2aAuto': this.setGK2AAuto(on); break;
      /* ── 천리안2A — 우리 위성이 본 동아시아·서태평양 ───────────
         ⚠️ 히마와리와 겹쳐 보이지만 다르다. 히마와리는 NASA GIBS 를 거친
            가시광이라 **밤에 빈 화면**이고, 이건 우리 Lambda 가 원본에서
            직접 만든 것이라 적외가 **밤에도 보인다.**
         ⚠️ 전면 적외는 넓게, 동아시아는 원본 해상도에 맞춘 상세 타일로 낸다.
            한반도 0.5km는 낮 가시광에서만 유효하다. */
      case 'gk2aIR':  this.setGK2AWideIR(on); break;
      case 'gk2aNightLow': this.setGK2A('nightlow', on); break;
      case 'gk2aVIS': this.setGK2A('vi006', on); break;
      case 'gk2aVISfd': this.setGK2A('vi006fd', on); break;
      case 'gk2aIRea':  this.setGK2A('ir112ea', on); break;
      case 'gk2aVISea': this.setGK2A('vi006ea', on); break;
      case 'gk2aWV':  this.setGK2A('wv063', on); break;
      case 'citylight': this.citylight.show = on; break;
      case 'aurora':    if (this.aurora) this.aurora.show = on; break;
    }
  },

  /* ── 오로라 (SWPC OVATION) ──────────────────────────────────
     360×181 격자의 오로라 출현 확률(0~100)을 캔버스로 그려 단일 타일로 얹음 */
  async loadAurora() {
    const res = await fetchT(API.AURORA, { timeout: 15_000 });   // 1.5MB 격자라 넉넉히
    if (!res.ok) throw new Error('aurora ' + res.status);
    const j = await res.json();

    const W = 360, H = 181;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);

    let peak = 0;
    for (const [lon, lat, v] of j.coordinates) {
      if (v > peak) peak = v;
      if (v <= 0) continue;
      // lon 0~359 → -180~179 로 재배치, lat -90~90 → y (위가 북극)
      const x = (lon + 180) % 360;
      const y = H - 1 - (lat + 90);
      if (x < 0 || x >= W || y < 0 || y >= H) continue;
      const i = (y * W + x) * 4;
      const a = Math.min(1, v / 40);          // 40% 이상은 포화
      img.data[i]     = 90  + 60 * a;         // R
      img.data[i + 1] = 255;                  // G — 오로라 그린
      img.data[i + 2] = 150 + 60 * a;         // B
      img.data[i + 3] = Math.round(210 * a);  // A
    }
    ctx.putImageData(img, 0, 0);

    // 가장자리를 부드럽게 (격자 티 제거)
    const soft = document.createElement('canvas');
    soft.width = W * 4; soft.height = H * 4;
    const sctx = soft.getContext('2d');
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cv, 0, 0, soft.width, soft.height);

    if (this.aurora) viewer.imageryLayers.remove(this.aurora, true);
    this.aurora = viewer.imageryLayers.addImageryProvider(
      new Cesium.SingleTileImageryProvider({
        url: soft.toDataURL('image/png'),
        rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 180, 90),
        tileWidth: soft.width, tileHeight: soft.height,
        credit: 'NOAA SWPC OVATION',
      })
    );
    this.aurora.alpha = 0.9;
    this.aurora.show = false;

    this.auroraMeta = {
      observed: j['Observation Time'],
      forecast: j['Forecast Time'],
      peak,
    };
    return this.auroraMeta;
  },

  /** 지자기 활동 지수 */
  async loadKp() {
    const res = await fetchT(API.KP);
    if (!res.ok) return null;
    const rows = await res.json();
    const last = rows[rows.length - 1];
    return { kp: Number(last.kp_index ?? last.estimated_kp ?? 0), time: last.time_tag };
  },
};
