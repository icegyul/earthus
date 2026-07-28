// 면(imagery) 레이어 — 전지구부터 항상 표시 (§5-10)
import { viewer, gibsProvider } from '../viewer.js';
import { API } from '../config.js';
import { CONFIG } from '../config.local.js';

/** GIBS 시간축 레이어는 D-1이 안전 (당일치는 처리 지연) */
function ymd(offsetDays = -1) {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  return d.toISOString().slice(0, 10);
}

export const imagery = {
  base: null, detail: null, truecolor: null, clouds: null, cloudLayers: [], citylight: null, temp: null, aurora: null,
  auroraMeta: null,

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
        credit: 'Esri, Maxar, Earthstar Geographics',
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
         가공  Lambda(gmgsi-clouds) → 회색조 PNG 2048×1229 (1.2MB) → 우리 S3
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
    this._addClouds();

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
  _swapCloudLayer(L) {
    // ⚠️ 새 구름 타일도 트루컬러 상태를 따라야 한다 (안 그러면 갱신될 때 다시 겹친다)
    L.alpha = (this._cloudOn && !(this.truecolor && this.truecolor.show)) ? 1.0 : 0.0;
    const old = this.cloudLayers.slice();
    this.cloudLayers = [L];
    this.clouds = L;
    old.forEach(o => { try { viewer.imageryLayers.remove(o, true); } catch (_) {} });
  },

  /* ── 1순위: 우리가 만든 GMGSI 합성본 ──────────────────────────
     Lambda 가 NOAA 원본을 시간마다 받아 회색조 PNG 로 만들어 S3 에 올린다.
     회색값이 곧 구름량이라 여기서 "흰색 + 그 값을 알파로" 바꿔 얹는다.

     왜 서버에서 RGBA 로 안 만들고 회색조로 받아 변환하나
       RGB 가 상수 흰색이어도 RGBA PNG 는 1.4배 커진다 (실측 1.75MB vs 1.21MB).
       폰에서 매시간 받는 파일이라 0.5MB 차이가 크다.
       변환은 2048×1229 한 번 훑는 것이라 수십 ms 면 끝난다. */
  async _cloudsFromGMGSI() {
    try {
      const r = await fetch(`${API.CLOUDS}/meta.json`, { cache: 'no-cache' });
      if (!r.ok) return false;
      const m = await r.json();
      if (!m.time) return false;
      if (m.time === this._cloudTime) return true;    // 이미 최신

      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((ok, no) => {
        img.onload = ok; img.onerror = () => no(new Error('png'));
        img.src = `${API.CLOUDS}/global.png?t=${encodeURIComponent(m.time)}`;
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
        }
      } else {
        for (let i = 0; i < d.length; i += 4) {
          d[i + 3] = d[i];
          d[i] = d[i + 1] = d[i + 2] = 255;
        }
      }
      ctx.putImageData(px, 0, 0);

      const L = viewer.imageryLayers.addImageryProvider(
        new Cesium.SingleTileImageryProvider({
          url: cv.toDataURL('image/png'),
          // ⚠️ 자료가 위도 ±72.7° 까지다. 이 사각형을 정확히 맞춰야 구름이 제 위치에 온다.
          rectangle: Cesium.Rectangle.fromDegrees(-180, m.south, 180, m.north),
          tileWidth: cv.width, tileHeight: cv.height,
          credit: m.credit || 'NOAA NESDIS GMGSI',
        })
      );
      this._cloudTime = m.time;
      this._cloudSource = 'gmgsi';
      this._swapCloudLayer(L);
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
      const r = await fetch(`${API.REALEARTH}/times?products=globalir`);
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

    const L = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: `${API.REALEARTH}/image?products=globalir&time=${time}&x={x}&y={y}&z={z}`
             + (CONFIG?.REALEARTH_KEY ? `&key=${CONFIG.REALEARTH_KEY}` : ''),
        maximumLevel: 8,
        credit: 'Source: SSEC RealEarth, UW-Madison',
      })
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
    /* 중위도를 넓게 훑는다. 4장으로는 우연에 좌우된다 (실측으로 확인). */
    const TILES = [];
    for (let y = 2; y <= 5; y++) for (let x = 0; x < 8; x++) TILES.push([3, y, x]);

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

    let best = null, first = null;
    /* ⚠️ 오늘(back=0)은 넣지 않는다. 아직 궤도가 절반도 안 들어와 있다
       (실측: 07-26 평균 26%, 최대 100%). 어제부터 본다. */
    for (let back = 1; back <= 4; back++) {
      const day = ymd(back);
      const pcts = await Promise.all(TILES.map(([z, y, x]) =>
        blackPct(`${base}/${day}/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`)));
      const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
      if (back === 1) first = avg;      // 어제(즉시 띄운 날)의 빈 구간 — 교체 판단용
      if (!best || avg < best.avg) best = { day, avg };
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
    this._truecolorLoading(true);   // 새 날짜 타일 로딩 표시
  },

  async setTrueColor(on) {
    if (!on) {
      if (this.truecolor) this.truecolor.show = false;
      this._truecolorLoading(false);
      this._applyClouds();
      return;
    }
    if (!this.truecolor) {
      /* ⚡ 즉시 — 어제 날짜로 바로 띄운다. 예전엔 "가장 덜 빈 날짜"를 고르려고
         날짜당 타일 32장 × 최대 4일을 먼저 받아 검사하느라(최악 128장) 수 초 걸렸다.
         실측상 어느 날짜든 빈 구간이 ~12%로 비슷해 화질 차이가 거의 없으므로,
         어제로 바로 띄우고 날짜 탐색은 배경으로 돌린다. */
      const day = this._ymdBack(1);
      this._tcDate = day;
      this.truecolor = this._addTruecolorLayer(day);
      this._truecolorLoading(true);

      /* 배경 탐색 — 어제가 유난히 나쁜 날(빈 구간이 훨씬 큼)에만 조용히 교체한다.
         평소엔 어제가 최선이라 그대로 둔다(불필요한 리로드·깜빡임 방지). */
      this.pickTrueColorDate().then(r => {
        if (r && r.day !== this._tcDate && (r.first - r.avg) > 12) {
          this._swapTruecolorDate(r.day);
        }
      }).catch(() => {});
    }
    this.truecolor.show = true;
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

  /** 위성 영상 로딩 표시 — 타일이 다 로드될 때까지 하단에 "불러오는 중" 을 띄운다.
   *  ⚠️ tileLoadProgressEvent 는 전지구 타일 전체를 세지만, 트루컬러를 켜는 순간
   *     그 타일들이 큐에 쌓이므로 사실상 위성영상 로딩을 따라간다.
   *     한 번이라도 대기(remaining>0)를 본 뒤 0 이 되면 끈다(캐시로 즉시 0 인 경우 오인 방지). */
  _truecolorLoading(show) {
    const globe = viewer.scene.globe;
    // 이전 리스너·타이머 정리
    if (this._tcProg) { globe.tileLoadProgressEvent.removeEventListener(this._tcProg); this._tcProg = null; }
    clearTimeout(this._tcLoadTimer);

    if (!show) { this._tcLoadEl?.classList.remove('on'); return; }

    if (!this._tcLoadEl) {
      const el = document.createElement('div');
      el.id = 'tcLoading';
      el.innerHTML = '<span class="tcl-spin"></span>위성 영상 불러오는 중…';
      document.body.appendChild(el);
      this._tcLoadEl = el;
    }
    this._tcLoadEl.classList.add('on');

    let sawPending = false;
    this._tcProg = (remaining) => {
      if (remaining > 0) { sawPending = true; return; }
      if (sawPending) this._truecolorLoading(false);
    };
    globe.tileLoadProgressEvent.addEventListener(this._tcProg);
    // 안전 타임아웃 — 어떤 이유로 progress 가 안 끝나도 20초 뒤엔 끈다
    this._tcLoadTimer = setTimeout(() => this._truecolorLoading(false), 20_000);
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
  _applyClouds() {
    const tcOn = !!(this.truecolor && this.truecolor.show);
    const day = tcOn ? (this._d || 0) : 1.0;
    this.cloudLayers.forEach(L => {
      L.alpha = this._cloudOn ? 1.0 : 0.0;
      L.dayAlpha = day;
      L.nightAlpha = 1.0;
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
  _himaOn: false,
  _himaManual: false,

  /* 히마와리가 보는 범위 (위성 위치 140.7°E 기준, 가장자리는 잘라냈다).
     ⚠️ 원반 가장자리는 비스듬히 봐서 왜곡이 크다. 넉넉히 안쪽만 쓴다. */
  HIMA_BOX: [-50, 85, 55, 195],
  /* 이 고도보다 가까울 때만. 전지구에서 켜면 이음매가 보인다. */
  HIMA_H: 5_000_000,

  /** 지금 받을 수 있는 가장 최근 10분 단위 시각을 찾는다.
   *  ⚠️ 정지위성은 20~40분 늦게 올라온다. "지금"으로 요청하면 빈 타일이 온다.
   *     실제로 타일을 받아보고 되는 시각을 고른다 — 지어내지 않는다. */
  async pickHimaTime() {
    const probe = (ts) => new Promise(res => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im.naturalWidth > 1);
      im.onerror = () => res(false);
      im.src = `${API.GIBS}/Himawari_AHI_Band3_Red_Visible_1km/default/${ts}`
             + '/GoogleMapsCompatible_Level7/5/12/27.png';
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
      this.himaLayers.forEach(L => { try { viewer.imageryLayers.remove(L, true); } catch (_) {} });
      this.himaLayers = [];
      this._himaTime = null;
      /* ⚠️ 좌하단 안내가 바로 따라와야 한다. 안 알리면 최대 1분 동안
         전지구 합성 출처가 떠 있는데 화면은 히마와리인 상태가 된다. */
      document.dispatchEvent(new CustomEvent('earthus:imagery'));
      return;
    }
    const ts = await this.pickHimaTime();
    if (!ts) { this._himaOn = false; console.warn('[hima] 받을 수 있는 시각을 못 찾음'); return; }
    if (!this._himaOn) return;                      // 그 사이 화면이 벗어났다
    this._himaTime = ts;

    /* 낮 = 가시광(구름이 하얗게), 밤 = 적외(구름 꼭대기 온도).
       ⚠️ 둘 다 얹고 알파로 나눈다. 하나만 쓰면 반쪽 지구가 비어 보인다. */
    const add = (layer, tms, dayA, nightA) => {
      const L = viewer.imageryLayers.addImageryProvider(
        new Cesium.UrlTemplateImageryProvider({
          url: `${API.GIBS}/${layer}/default/${ts}/${tms}/{z}/{y}/{x}.png`,
          maximumLevel: tms.endsWith('7') ? 7 : 6,
          credit: 'JMA Himawari via NASA GIBS',
        }));
      L.dayAlpha = dayA;
      L.nightAlpha = nightA;
      /* ⚠️ 검은 배경(원반 바깥)을 뚫어야 지구 나머지가 보인다. */
      L.colorToAlpha = Cesium.Color.BLACK;
      L.colorToAlphaThreshold = 0.16;
      this.himaLayers.push(L);
      return L;
    };
    add('Himawari_AHI_Band3_Red_Visible_1km', 'GoogleMapsCompatible_Level7', 0.9, 0.0);
    add('Himawari_AHI_Band13_Clean_Infrared', 'GoogleMapsCompatible_Level6', 0.0, 0.75);
    document.dispatchEvent(new CustomEvent('earthus:imagery'));
    console.log(`[hima] ${ts} 적용`);
  },

  /** 적외(Band 13) 단독 레이어 — 낮·밤 모두 같은 자료를 쓴다.
   *
   *  왜 따로 두나 (받은 지적)
   *    "일본꺼 구름 데이터 그거 구름에서 왜 비의 양까지 체크되는거 같아"
   *    정확한 관찰이다. 구름 레이어의 **밤 쪽**이 이 적외 자료인데,
   *    GIBS 가 아주 찬 꼭대기를 색으로 강조해서 그린다. 그래서 비처럼 보인다.
   *    섞여 있으면 오해하니 따로 고를 수 있게 뺐다.
   *
   *  ⚠️ GIBS 히마와리는 3종뿐이고 **회색조 적외가 없다.** 색을 뺄 방법이 없어서,
   *     대신 무엇을 보고 있는지 화면(ui-source)에 적는다.
   */
  async setHimaIR(on) {
    (this.irLayers || []).forEach(L => { try { viewer.imageryLayers.remove(L, true); } catch (_) {} });
    this.irLayers = [];
    if (!on) { document.dispatchEvent(new CustomEvent('earthus:imagery')); return; }

    const ts = await this.pickHimaTime();
    if (!ts) { console.warn('[himaIR] 받을 수 있는 시각을 못 찾음'); return; }
    if (!this._irManual) return;                    // 그 사이 꺼졌다
    this._irTime = ts;

    const L = viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: `${API.GIBS}/Himawari_AHI_Band13_Clean_Infrared/default/${ts}/GoogleMapsCompatible_Level6/{z}/{y}/{x}.png`,
        maximumLevel: 6,
        credit: 'JMA Himawari via NASA GIBS',
      }));
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
      case 'citylight': this.citylight.show = on; break;
      case 'aurora':    if (this.aurora) this.aurora.show = on; break;
    }
  },

  /* ── 오로라 (SWPC OVATION) ──────────────────────────────────
     360×181 격자의 오로라 출현 확률(0~100)을 캔버스로 그려 단일 타일로 얹음 */
  async loadAurora() {
    const res = await fetch(API.AURORA);
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
    const res = await fetch(API.KP);
    if (!res.ok) return null;
    const rows = await res.json();
    const last = rows[rows.length - 1];
    return { kp: Number(last.kp_index ?? last.estimated_kp ?? 0), time: last.time_tag };
  },
};
