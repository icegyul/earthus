// 화면 왼쪽 아래 자료 안내 — 무엇을 보고 있고, 언제 것이고, 다음은 언제인가
//
// 왜 필요한가 (받은 지적)
//   "화면 좌측 하단쪽에 설명이 필요해. 출처 자료 안내와 몇시몇분때 만들어진
//    구름자료, 다음 구름자료는 몇시 몇분에 들어온다 그런 안내가 필요해
//    지금 이 두개 구름데이터가 달라"
//
//   맞는 지적입니다. 지금 화면에 구름이 두 종류로 나올 수 있었습니다:
//     · 구름 오버레이 — NOAA GMGSI 합성, 매시간 갱신
//     · 실제 위성 영상 — VIIRS 트루컬러, 하루 한 장, 게다가 "오늘"이 아니다
//   같은 지구인데 시각이 다르니 구름 모양이 다를 수밖에 없습니다.
//   이제 둘은 서로를 대체하고(배타 그룹), 어느 쪽을 보고 있는지 여기 적습니다.
//
// ⚠️ "다음 갱신"은 **예정**이지 약속이 아니다.
//    상류가 늦으면 늦는다. 그래서 "예정"이라고 쓰고, 지나면 "기다리는 중"으로 바꾼다.
//    지나간 시각을 그대로 두면 고장난 시계가 된다.
//
// ⚠️ 출처 표기는 지워도 되는 장식이 아니다.
//    RealEarth 는 이용약관상 워터마크를 가리면 안 되고, NOAA·NASA 자료도 표기를 요구한다.

import { i18n } from './i18n.js';
import { store } from './store.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* 레이어 → 출처와 갱신 주기(분).
   ⚠️ 주기는 우리 예약 실행 간격이다. 상류가 그보다 늦게 낼 수도 있다. */
const SRC = {
  clouds:   { ko: 'NOAA GMGSI 전지구 구름 합성', en: 'NOAA GMGSI global cloud composite', every: 60 },
  /* 확대하면 갈아타는 고해상도 구름. ⚠️ 전지구 합성과 자료가 다르므로
     화면에 그 사실을 적어야 한다 — 안 적으면 같은 구름의 다른 모습으로 오해한다. */
  /* 적외 단독 — 무엇을 보고 있는지 반드시 적어야 하는 자료다.
     ⚠️ 색이 강수량처럼 읽힌다. 실제로 "구름에서 왜 비의 양까지 체크되는 것 같냐"는
        지적을 받았다. 아주 찬 꼭대기가 강한 대류(=소나기·뇌우)와 관계가 깊은 건 맞지만,
        **강수량 자체가 아니다** — 높고 얇은 권운도 차갑다. 그 차이를 화면에 적는다. */
  /* ── 천리안2A ──────────────────────────────────────────────
     ⚠️ **"NASA GIBS 경유" 같은 중간 경유가 없다.** 우리 Lambda 가 NOAA 공개 원본을
        직접 받아 만든다. 출처를 그렇게 정확히 적는다 — 기상청이 만들고 NOAA 가 공개한다. */
  gk2a_ir:  { ko: '천리안2A 적외 11.2㎛ (기상청) · NOAA 공개자료',
              en: 'Chollian-2A IR 11.2µm (KMA) via NOAA open data', every: 10 },
  gk2a_nightlow: { ko: '천리안2A 11.2−3.8㎛ 밝기온도차 (기상청) · NOAA 공개자료',
                    en: 'Chollian-2A 11.2−3.8µm BTD (KMA) via NOAA open data', every: 10 },
  gk2a_vis: { ko: '천리안2A 가시광 0.64㎛ (기상청) · NOAA 공개자료',
              en: 'Chollian-2A visible 0.64µm (KMA) via NOAA open data', every: 10 },
  gk2a_vis_ea: { ko: '천리안2A 가시광 0.64㎛ · 동아시아 2km (기상청) · NOAA 공개자료',
                 en: 'Chollian-2A visible, E. Asia 2 km (KMA) via NOAA', every: 10 },
  gk2a_ir_ea:  { ko: '천리안2A 적외 11.2㎛ · 동아시아 2km (기상청) · NOAA 공개자료',
                 en: 'Chollian-2A infrared, E. Asia 2 km (KMA) via NOAA', every: 10 },
  gk2a_vis_fd: { ko: '천리안2A 가시광 0.64㎛ · 전면 (기상청) · NOAA 공개자료',
                 en: 'Chollian-2A visible 0.64µm, full disk (KMA) via NOAA open data', every: 10 },
  gk2a_wv:  { ko: '천리안2A 수증기 6.3㎛ (기상청) · NOAA 공개자료',
              en: 'Chollian-2A water vapour 6.3µm (KMA) via NOAA open data', every: 10 },
  hima_ir: { ko: '히마와리 적외 (일본 기상청) · NASA GIBS 경유',
             en: 'Himawari infrared (JMA) via NASA GIBS', every: 10 },
  clouds_hima: { ko: '히마와리 (일본 기상청) · NASA GIBS 경유',
                 en: 'Himawari (JMA) via NASA GIBS', every: 10 },
  /* ⚠️ "하루 한 장"만 쓰면 뜻이 안 통한다 — 받은 질문 그대로다:
     "접속자 기준의 하루 한 장이라는 거야? 몇 시 기준 사진이라는 거야?"
     정확히는 이렇다: 극궤도 위성이 지구를 남북으로 훑고 지나가며 띠를 찍고,
     NASA 가 그 띠들을 하루치 한 장으로 이어 붙인다.
     태양동기궤도라 **각 지점은 늘 그 지역 현지 낮 1시 30분경**에 찍힌다.
     즉 "전 지구를 같은 순간에 찍은 사진"이 아니라
     "각 지점을 현지 오후 1시 반에 찍어 이어 붙인 사진"이다. */
  /* ⚠️ 위성(수오미 NPP)과 센서(VIIRS)를 **둘 다** 적는다. 예전엔 메뉴는 위성,
     여기는 센서라 같은 것을 두 이름으로 부르고 있었다. */
  truecolor:{ ko: '수오미 NPP 위성 · VIIRS 센서 (NASA)',
              en: 'Suomi NPP satellite · VIIRS sensor (NASA)', every: 1440 },
  temp:     { ko: 'Open-Meteo (GFS/ECMWF)', en: 'Open-Meteo (GFS/ECMWF)', every: 60 },
  humidity: { ko: 'Open-Meteo (GFS/ECMWF)', en: 'Open-Meteo (GFS/ECMWF)', every: 60 },
  tmax:     { ko: 'Open-Meteo — 내일 예보', en: 'Open-Meteo — tomorrow’s forecast', every: 60 },
  tmin:     { ko: 'Open-Meteo — 내일 예보', en: 'Open-Meteo — tomorrow’s forecast', every: 60 },
  wind:     { ko: 'Open-Meteo (GFS/ECMWF)', en: 'Open-Meteo (GFS/ECMWF)', every: 60 },
  windfc:   { ko: 'Open-Meteo — 내일 예보', en: 'Open-Meteo — tomorrow’s forecast', every: 60 },
  fog:      { ko: 'Open-Meteo — 시정', en: 'Open-Meteo — visibility', every: 60 },
  drought:  { ko: 'Open-Meteo — 토양수분', en: 'Open-Meteo — soil moisture', every: 60 },
  pressure: { ko: 'Open-Meteo — 해면기압', en: 'Open-Meteo — mean sea-level pressure', every: 60 },
  rain:     { ko: 'Open-Meteo — 강수량(mm/h)', en: 'Open-Meteo — precipitation', every: 60 },
  pm25:     { ko: 'Copernicus CAMS (Open-Meteo 경유)', en: 'Copernicus CAMS via Open-Meteo', every: 60 },
  pm10:     { ko: 'Copernicus CAMS (Open-Meteo 경유)', en: 'Copernicus CAMS via Open-Meteo', every: 60 },
  dust:     { ko: 'Copernicus CAMS — 먼지 질량', en: 'Copernicus CAMS — dust mass', every: 60 },
  aqi:      { ko: 'Copernicus CAMS — 유럽 기준 AQI', en: 'Copernicus CAMS — European AQI', every: 60 },
  uv:       { ko: 'Copernicus CAMS — 자외선 지수', en: 'Copernicus CAMS — UV index', every: 60 },
  ozone:    { ko: 'Copernicus CAMS — 오존', en: 'Copernicus CAMS — ozone', every: 60 },
  sst:      { ko: 'Open-Meteo 해양 (파랑모델)', en: 'Open-Meteo Marine', every: 60 },
  sstanom:  { ko: '지금 수온 − 평년(NOAA OISST 1991–2020)', en: 'Now minus NOAA OISST 1991–2020 normal', every: 60 },
  wave:     { ko: 'Open-Meteo 해양 (파랑모델)', en: 'Open-Meteo Marine', every: 60 },
  swell:    { ko: 'Open-Meteo 해양 (파랑모델)', en: 'Open-Meteo Marine', every: 60 },
  current:  { ko: 'Open-Meteo 해양 — 표층 해류', en: 'Open-Meteo Marine — surface current', every: 60 },
  landobs:  { ko: 'NOAA METAR + 기상청 ASOS + JMA AMeDAS 실황', en: 'NOAA METAR + KMA ASOS + JMA AMeDAS observations', every: 20 },
  /* ⚠️ "Powered by Met Office data" 는 Met Office 약관이 요구하는 **의무 문구**다.
        번역하거나 줄이지 말 것. 한국어 표기에도 원문을 그대로 남긴다. */
  ukfc:     { ko: '영국 기상청 · Powered by Met Office data',
              en: 'Powered by Met Office data', every: 180 },
  buoy:     { ko: 'NOAA NDBC + OSMC 부이', en: 'NOAA NDBC + OSMC buoys', every: 30 },
  coverage: { ko: '우리 관측점을 직접 센 것 (부이 + 지상 관측소)',
              en: 'Counted from our own observation points (buoys + ground stations)', every: 60 },
  wildfire: { ko: 'NASA FIRMS 위성 화재 관측', en: 'NASA FIRMS active fire', every: 30 },
  quake:    { ko: 'USGS 지진 (일본 근해는 기상청 대조)', en: 'USGS (JMA cross-check near Japan)', every: 2 },
  cyclone:  { ko: 'Global Disaster Awareness and Coordination System, GDACS · CC BY 4.0',
              en: 'Global Disaster Awareness and Coordination System, GDACS · CC BY 4.0', every: 20 },
  tsunami:  { ko: 'NOAA NWS 쓰나미 경보', en: 'NOAA NWS tsunami alerts', every: 3 },
  aurora:   { ko: 'NOAA SWPC 우주기상', en: 'NOAA SWPC space weather', every: 5 },
  news:     { ko: 'GDELT Project (우리가 신뢰도 채점)', en: 'GDELT Project, scored by us',
              url: 'https://www.gdeltproject.org/', every: 30 },
  poi:      { ko: '© OpenStreetMap contributors · ODbL 1.0',
              en: '© OpenStreetMap contributors · ODbL 1.0', every: 60 },
  orbits:   { ko: 'CelesTrak OMM JSON + SATCAT · 하루 1회 캐시',
              en: 'CelesTrak OMM JSON + SATCAT · cached daily', every: 1440 },
};

/* 어느 레이어의 시각을 보여줄까 — 위에 있는 것부터.
   ⚠️ 켜진 것이 여러 개면 "지금 바탕에 깔린 것"을 우선한다. 사람이 보고 있는 게 그것이다. */
/* ⚠️⚠️ **레이어를 새로 만들면 이 목록에도 넣어야 한다.**
   여기 없으면 find 가 undefined 를 주고 `render()` 가 첫 줄에서 빠져나가
   **좌하단 안내가 통째로 사라진다.** 오류도 경고도 없다 —
   실제로 천리안 3종을 넣고 이걸 빼먹어 "위성정보가 안나와"라는 신고를 받았다.
   (layerbar 의 CATEGORIES 도 같은 성격이다. 레이어 추가는 세 곳을 함께 고친다.) */
const PRIORITY = ['gk2aAuto', 'gk2aNightLow', 'gk2aIR', 'gk2aVIS', 'gk2aVISea', 'gk2aIRea', 'gk2aVISfd', 'gk2aWV',
                  'himaIR', 'himawari', 'truecolor', 'clouds', 'sstanom', 'temp', 'tmax', 'tmin', 'humidity', 'rain', 'pressure', 'fog', 'drought',
                  'pm25', 'pm10', 'dust', 'aqi', 'uv', 'ozone',
                  'sst', 'wave', 'swell', 'current', 'wind', 'windfc',
                  'coverage', 'ukfc', 'landobs', 'buoy', 'wildfire', 'cyclone', 'quake', 'tsunami', 'aurora', 'news',
                  'poi', 'orbits'];

/* 지구 표면을 통째로 칠하는 레이어들 — 화면을 지배하므로 출처도 이쪽이 우선이다.
   ⚠️ 점·선 레이어(산불·지진·태풍·낙뢰)는 여기 넣지 않는다. 그것들은 위에 얹히는 것이라
      "지금 보고 있는 바탕"이 아니다.
   ⚠️ 위성 영상이 켜져 있으면 그게 바탕이다 — 그래서 맨 앞이다. */
const PAINT = ['gk2aAuto', 'gk2aNightLow', 'gk2aIR', 'gk2aVIS', 'gk2aVISea', 'gk2aIRea', 'gk2aVISfd', 'gk2aWV',
               'himaIR', 'himawari', 'truecolor',
               'temp', 'tmax', 'tmin', 'humidity', 'rain', 'pressure', 'fog', 'drought',
               'pm25', 'pm10', 'dust', 'aqi', 'uv', 'ozone',
               'sst', 'sstanom', 'wave', 'swell', 'current', 'wind', 'windfc',
               'clouds'];

function hhmm(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const sourceNote = {
  root: null,
  _timer: 0,

  init() {
    this.root = document.getElementById('srcNote');
    if (!this.root) return this;
    store.on('layer', () => this.render());
    i18n.onChange(() => this.render());
    /* 확대하면 자료가 바뀐다 (전지구 합성 ↔ 히마와리). 그때 바로 다시 그린다. */
    document.addEventListener('earthus:imagery', () => this.render());
    /* 1분마다 다시 그린다 — "다음 갱신까지 몇 분"이 줄어드는 게 보여야 한다.
       ⚠️ 렌더를 요청하지 않는다. 이건 DOM 이라 지구본 그리기와 무관하다(발열). */
    this._timer = setInterval(() => this.render(), 60_000);
    this.render();
    return this;
  },

  /* 지구를 누른 지점의 값 — main.js 가 넣어 준다. (감사 3차)
     받은 감사: "지구의 한 지점을 누르면 해당 위치의 값을 함께 보여준다."
     ⚠️ 격자 밖이거나 값이 없으면 null 로 지운다 — 옛 값이 남으면 거짓말이 된다. */
  _pointVal: null,
  setPoint(id, v) {
    this._pointVal = (v == null || !Number.isFinite(v)) ? null
      : { id, v: Math.round(v * 10) / 10 };
    this.render();
  },

  async render() {
    if (!this.root) return;
    const ko = i18n.lang === 'ko';
    let esriVisible = false;
    try {
      const { imagery } = await import('./layers/imagery.js');
      esriVisible = (imagery.detail?.alpha || 0) > 0.02;
    } catch (_) { /* 기본면이 아직 만들어지기 전일 수 있다 */ }
    /* ⚠️⚠️ **지구를 칠하고 있는 레이어를 먼저 고른다.** (감사 P1-2)
       예전에는 PRIORITY 순서만 봤는데 그 목록에서 구름이 기온보다 앞이라,
       기온을 켜서 지구가 기온색으로 바뀌어도 좌하단은 계속
       "구름 · NOAA GMGSI"라고 적고 있었다 — 화면과 출처가 어긋난 것이다.
       면을 칠하는 레이어(PAINT)가 켜져 있으면 그것을 주 레이어로 삼고,
       없을 때만 예전 순서로 돌아간다. */
    const painted = PAINT.find(x => store.isOn(x));
    const id = painted || PRIORITY.find(x => store.isOn(x));
    if (!id && !esriVisible) {
      this.root.innerHTML = ''; this.root.classList.remove('on'); return;
    }
    /* 확대용 World Imagery만 보이는 경우에도 크레딧은 사라지면 안 된다.
       Esri 공식 요건은 지도에 Esri와 자료 제공자 표기를 모두 표시하라는 것이다. */
    if (!id) {
      this.root.innerHTML = '<span class="map-credit">Powered by Esri · Source: Esri, Vantor, '
        + 'Earthstar Geographics, and the GIS User Community</span>';
      this.root.classList.add('on');
      return;
    }

    /* ⚠️ 구름은 확대하면 자료가 바뀐다 (전지구 합성 → 히마와리).
       보고 있는 것과 다른 출처를 적으면 안내가 아니라 오정보다. */
    let key = id, hima = null;
    if (id.startsWith('gk2a')) {
      if (id === 'gk2aAuto') {
        const { imagery } = await import('./layers/imagery.js');
        key = imagery._gk2aDetailOn ? 'gk2a_vis'
          : imagery._gk2aAutoMode === 'infrared' ? 'gk2a_ir_ea' : 'gk2a_vis_ea';
      } else {
        key = { gk2aIR: 'gk2a_ir', gk2aNightLow: 'gk2a_nightlow', gk2aVIS: 'gk2a_vis', gk2aVISfd: 'gk2a_vis_fd',
                gk2aVISea: 'gk2a_vis_ea', gk2aIRea: 'gk2a_ir_ea',
                gk2aWV: 'gk2a_wv' }[id];
      }
    } else if (id === 'himaIR') {
      key = 'hima_ir';
      try {
        const { imagery } = await import('./layers/imagery.js');
        hima = imagery._irTime || null;
      } catch (_) { /* 아직 없을 수 있다 */ }
    } else if (id === 'himawari' || id === 'clouds') {
      try {
        const { imagery } = await import('./layers/imagery.js');
        if (imagery._himaOn && imagery._himaTime) { key = 'clouds_hima'; hima = imagery._himaTime; }
        else if (id === 'himawari') { key = 'clouds_hima'; }
      } catch (_) { /* 아직 없을 수 있다 */ }
    }
    const src = SRC[key];
    const name = i18n.t.L?.[id] || id;

    // 자료 시각 — 격자·영상은 파일에 시각이 들어 있다
    let made = null, landMeta = null;
    try {
      const { gridOverlay } = await import('./gridoverlay.js');
      const SOURCE_MAP = { pm25: 'air', pm10: 'air', dust: 'air', aqi: 'air', uv: 'air', ozone: 'air',
                           sst: 'marine', sstanom: 'marine', wave: 'marine', swell: 'marine',
                           current: 'marine' };
      if (id in SOURCE_MAP || ['temp', 'tmax', 'tmin', 'humidity', 'fog', 'drought', 'wind', 'windfc'].includes(id)) {
        const g = await gridOverlay.load(SOURCE_MAP[id] || 'wind');
        if (g?.time) made = new Date(g.time);
      } else if (id === 'truecolor') {
        const { imagery } = await import('./layers/imagery.js');
        if (imagery._tcDate) made = new Date(`${imagery._tcDate}T12:00:00Z`);
      } else if (id.startsWith('gk2a')) {
        /* ⚠️ 시각은 meta.json 이 말하는 **관측 시각**이다. 우리가 받은 시각이 아니다.
           둘을 섞으면 "방금 자료"라고 적어 놓고 실제로는 20분 전 하늘이 된다. */
        const { imagery } = await import('./layers/imagery.js');
        /* ⚠️ 레이어를 켜는 순간에는 meta 가 아직 안 왔을 수 있다. 그러면 시각이 없어
           **설명 블록 전체가 건너뛰어진다** (히마와리에서 이미 한 번 겪은 함정이다).
           → 없으면 여기서 직접 한 번 받는다. */
        const meta = imagery._gk2aMeta || await imagery._gk2aBox();
        const ch = id === 'gk2aAuto'
          ? (imagery._gk2aDetailOn ? 'vi006' : imagery._gk2aAutoChannel) : {
          gk2aIR: 'ir112', gk2aNightLow: 'nightlow', gk2aVIS: 'vi006',
          gk2aVISfd: 'vi006fd', gk2aVISea: 'vi006ea', gk2aIRea: 'ir112ea', gk2aWV: 'wv063',
        }[id];
        made = imagery._gk2aDate(meta?.channels?.[ch], meta);
      } else if (id === 'himaIR') {
        /* ⚠️ 이 분기를 빼먹으면 made 가 null 이라 **설명 블록 전체가 건너뛰어진다.**
           실제로 그렇게 돼서 "이건 강수량이 아니다"라는 경고가 화면에 안 나왔다. */
        if (hima) made = new Date(hima);
      } else if (id === 'clouds' || id === 'himawari') {
        const { imagery } = await import('./layers/imagery.js');
        // 히마와리를 보고 있으면 그 시각이 지금 화면의 시각이다
        const t = hima || (id === 'clouds' ? imagery.cloudTime?.() : null);
        if (t) made = new Date(t);
      } else if (id === 'orbits') {
        const { orbits } = await import('./layers/space.js');
        if (orbits._catalog?.generated) made = new Date(orbits._catalog.generated);
      } else if (id === 'landobs') {
        /* 세 관측망은 시각 필드 이름이 서로 다르다. landobs.refresh()가 가장 최근
           생성 시각으로 합친 meta.generated를 다시 쓴다 — 현재 시각을 지어 넣지 않는다. */
        const { landObs } = await import('./layers/landobs.js');
        landMeta = landObs.meta;
        if (landMeta?.generated) made = new Date(landMeta.generated);
      }
    } catch (_) { /* 시각을 못 알아내면 출처만 적는다 — 지어내지 않는다 */ }

    const bits = [];
    /* ⚠️ 관측망 하나가 실패해도 나머지는 계속 그린다. 그때 고정된 세 기관 이름을
       그대로 쓰면 못 받은 자료까지 화면에 있는 것처럼 보이므로 성공한 출처만 쓴다. */
    const failedLand = new Set(landMeta?.failed || []);
    const availableLand = [
      ['METAR', 'NOAA METAR', 'NOAA METAR'],
      ['KMA ASOS', '기상청 ASOS', 'KMA ASOS'],
      ['JMA AMeDAS', 'JMA AMeDAS', 'JMA AMeDAS'],
    ].filter(([id]) => !failedLand.has(id)).map(x => x[ko ? 1 : 2]).join(' + ');
    const sourceText = esc(id === 'landobs' && failedLand.size
      ? availableLand : (ko ? src?.ko : src?.en)) || '—';
    const sourceHtml = src?.url
      ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${sourceText}</a>`
      : sourceText;
    bits.push(`<b>${esc(name)}</b> · ${sourceHtml}`);
    if (id === 'landobs' && landMeta?.failed?.length) {
      bits.push(ko
        ? `<i>⚠️ 지금 못 받은 관측망: <b>${esc(landMeta.failed.join(' · '))}</b>. 나머지 자료만 표시합니다.</i>`
        : `<i>⚠️ Observation networks unavailable now: <b>${esc(landMeta.failed.join(' · '))}</b>. Showing the remaining sources only.</i>`);
    }

    if (made && !Number.isNaN(made.getTime())) {
      if (id === 'truecolor') {
        /* ⚠️ 트루컬러는 "오늘"이 아니다. 당일치는 궤도가 덜 처리돼 줄무늬가 생긴다.
           며칠 전 영상을 보고 있다는 사실을 반드시 밝힌다. */
        const days = Math.round((Date.now() - made.getTime()) / 86400000);
        bits.push(ko
          ? `${made.getMonth() + 1}월 ${made.getDate()}일 촬영${days > 0 ? ` · ${days}일 전` : ''}`
          : `imaged ${made.toISOString().slice(0, 10)}${days > 0 ? ` · ${days}d ago` : ''}`);
        bits.push(ko
          ? '<i>각 지점을 <b>현지 낮 1시 30분경</b>에 찍어 이어 붙인 하루치 한 장입니다. 전 지구를 같은 순간에 찍은 게 아닙니다.</i>'
          : '<i>One daily mosaic, each place imaged around <b>13:30 its own local time</b> — not the whole Earth at one instant.</i>');
        /* ⚠️ 빈 구간이 있다는 사실을 숨기지 않는다. 실측: 어느 날짜든 평균 12%.
           띠 사이가 안 닿는 구간이라 날짜를 바꿔도 없어지지 않는다. */
        const gap = (await import('./layers/imagery.js')).imagery._tcGap;
        if (gap != null) {
          bits.push(ko
            ? `<i>화면의 약 ${gap}%는 위성 띠 사이가 안 닿은 빈 구간이라 아래 기본 지도가 비칩니다.</i>`
            : `<i>About ${gap}% is gaps between satellite swaths, where the base map shows through.</i>`);
        }
      } else {
        bits.push(ko ? `${hhmm(made)} 자료` : `data ${hhmm(made)}`);
        /* ── 천리안 — 무엇을 보고 있고 무엇이 안 보이는가 ──────────── */
        if (key === 'gk2a_ir') {
          bits.push(ko
            ? '<i>구름 <b>꼭대기 온도</b>입니다. 밝을수록 차갑고 높은 구름입니다. <b>밤에도 보입니다.</b></i>'
            : '<i><b>Cloud-top temperature.</b> Brighter = colder, higher cloud. Works at night.</i>');
          /* ⚠️⚠️ 이걸 안 적으면 "천리안은 구름을 못 본다"로 읽힌다.
             실측(2026-08-03): 강릉 앞 낮은 구름 꼭대기 21.6°C, 바다 25°C — **3°C 차이**다.
             적외 11.2㎛ 의 한계이지 이 위성의 성능이 아니다. 히마와리 적외도 똑같다. */
          bits.push(ko
            ? '<i>⚠️ <b>낮은 구름은 잘 안 보입니다.</b> 바다와 온도가 몇 도밖에 차이 나지 않기 때문입니다 '
              + '— 적외선의 한계입니다. 낮이라면 <b>천리안 구름(낮)</b>이나 '
              + '<b>천리안 구름(낮·전지구)</b>가 훨씬 잘 보입니다.</i>'
            : '<i>⚠️ <b>Low cloud is hard to see</b> — only a few degrees colder than the sea. '
              + 'In daylight use the visible channel instead.</i>');
        }
        if (key === 'gk2a_nightlow') {
          const { imagery } = await import('./layers/imagery.js');
          const signal = Number(imagery._gk2aMeta?.channels?.nightlow?.signal);
          bits.push(ko
            ? '<i>두 적외 채널의 <b>밝기온도 차(11.2㎛ − 3.8㎛)</b>가 1.5K를 넘는 밤의 화소만 표시합니다. 밝을수록 차이가 큽니다.</i>'
            : '<i>Night pixels where the <b>brightness-temperature difference (11.2µm − 3.8µm)</b> exceeds 1.5 K. Brighter means a larger difference.</i>');
          if (Number.isFinite(signal)) bits.push(ko
            ? `<i>이번 영상에서 문턱을 넘은 화소는 전체 격자의 <b>${signal.toFixed(1)}%</b>입니다. 등위도 격자 비율이라 실제 구름 면적은 아닙니다.</i>`
            : `<i><b>${signal.toFixed(1)}%</b> of this image grid exceeds the display threshold. This is an equirectangular pixel share, not cloud area.</i>`);
          bits.push(ko
            ? '<i>⚠️ 물방울로 된 낮은 구름의 <b>후보</b>입니다. 위성은 구름 꼭대기만 보므로 <b>지면에 닿은 안개인지 판정할 수 없고</b>, 위에 높은 구름이 있으면 그 아래도 못 봅니다.</i>'
            : '<i>⚠️ A <b>candidate signal</b> for low water cloud. The satellite sees only cloud tops, so it <b>cannot tell fog from low stratus</b>, and high cloud hides anything below.</i>');
          bits.push(ko
            ? '<i>⚠️ 3.8㎛에 햇빛이 섞이는 <b>낮은 자료 없음</b>으로 비웁니다. 빈 곳이 맑다는 뜻은 아닙니다.</i>'
            : '<i>⚠️ <b>No data in daylight</b>, where sunlight contaminates 3.8µm. Blank does not mean clear.</i>');
        }
        if (key === 'gk2a_vis_fd') {
          /* ⚠️⚠️ 이 레이어가 왜 생겼는지가 곧 사용자에게 필요한 설명이다.
             받은 지적: "일본꺼는 잘 표현되는데 천리안은 안보여" — 같은 시각 15분 차.
             원인은 위성이 아니라 **채널**이었다. 그걸 여기서 밝힌다. */
          bits.push(ko
            ? '<i>같은 천리안2A 이지만 <b>적외(온도)가 아니라 가시광(햇빛 반사)</b>입니다. '
              + '히마와리 구름과 <b>같은 방식으로 같은 것을 봅니다.</b></i>'
            : '<i>Same satellite as the infrared layer, but this is <b>visible light</b> — '
              + 'the same thing Himawari’s cloud layer shows.</i>');
          bits.push(ko
            ? '<i>⚠️ <b>천리안 구름(밤에도)에서 안 보이던 낮은 구름이 여기서는 보입니다.</b> '
              + '적외는 구름 꼭대기 <b>온도</b>로 찾는데, 낮은 구름은 지표와 온도가 거의 같아 '
              + '원리상 안 잡힙니다 (실측: 서울 위 구름이 지표보다 5°C도 안 찼습니다).</i>'
            : '<i>⚠️ Low cloud that the infrared layer misses shows up here. Infrared finds cloud by '
              + 'temperature, and low cloud is nearly as warm as the ground.</i>');
          bits.push(ko
            ? '<i>⚠️ <b>가시광이라 밤에는 비어 보입니다.</b> 고장이 아닙니다 — '
              + '그때는 <b>천리안 구름(밤에도)</b>을 쓰세요.</i>'
            : '<i>⚠️ Visible light — blank at night. Use the infrared layer then.</i>');
        }
        if (key === 'gk2a_vis') {
          bits.push(ko
            ? '<i><b>0.5km</b> 로 이 앱에서 가장 자세한 구름입니다 (히마와리 1km · 전지구 합성 2.4km). '
              + '낮은 구름도 그대로 보입니다.</i>'
            : '<i><b>0.5 km</b> — the sharpest cloud imagery here (Himawari 1 km, global composite 2.4 km).</i>');
          if (id !== 'gk2aAuto') bits.push(ko
            ? '<i>⚠️ <b>가시광이라 밤에는 비어 보입니다.</b> 고장이 아닙니다 — 그때는 <b>천리안 구름</b>(적외)을 쓰세요.</i>'
            : '<i>⚠️ Visible light — blank at night. Use the infrared channel then.</i>');
        }
        if (id === 'gk2aAuto') {
          const { imagery } = await import('./layers/imagery.js');
          bits.push(ko
            ? `<i>한국의 태양고도에 맞춰 <b>${imagery._gk2aAutoMode === 'infrared' ? '밤 적외' : '낮 가시광'}</b> 채널을 자동 선택했습니다. 동아시아는 2km 타일이며, 한반도로 확대하면 ${imagery._gk2aDetailOn ? '<b>현재 0.5km 원본 타일</b>' : '0.5km 원본 타일'}로 바뀝니다.</i>`
            : `<i>Automatically using <b>${imagery._gk2aAutoMode === 'infrared' ? 'night infrared' : 'daylight visible'}</b>. East Asia starts at 2 km; zoom into Korea for native 0.5 km tiles.</i>`);
          if (imagery._gk2aAutoMode === 'infrared') bits.push(ko
            ? '<i>⚠️ 밤에는 0.5km 가시광 원본이 유효하지 않아 2km 적외를 그대로 씁니다. 없는 야간 0.5km 자료를 확대해 표시하지 않습니다.</i>'
            : '<i>⚠️ At night the 0.5 km visible feed is not valid, so the 2 km infrared feed remains. No fake night upscaling.</i>');
        }
        if (key === 'gk2a_wv') {
          bits.push(ko
            ? '<i>땅이 아니라 <b>하늘 중상층(약 6~8km)의 물기</b>를 봅니다. 밝은 띠가 습한 흐름, '
              + '어두운 곳이 마른 공기가 내려앉는 자리입니다.</i>'
            : '<i>Moisture in the <b>mid-to-upper troposphere</b>, not at the ground.</i>');
          bits.push(ko
            ? '<i>⚠️ 구름이 없어도 밝게 나옵니다 — 이건 구름 그림이 아니라 <b>공기의 흐름</b>입니다.</i>'
            : '<i>⚠️ Bright without cloud — this shows airflow, not cloud.</i>');
        }
        /* ⚠️ 덮는 범위는 **채널마다 다르다.** 하나로 적으면 둘 중 하나는 거짓말이 된다. */
        if (key.startsWith('gk2a_')) {
          const { imagery } = await import('./layers/imagery.js');
          const ch = id === 'gk2aAuto'
            ? (imagery._gk2aDetailOn ? 'vi006' : imagery._gk2aAutoChannel) : {
                       gk2a_ir: 'ir112', gk2a_nightlow: 'nightlow',
                       gk2a_vis: 'vi006', gk2a_vis_fd: 'vi006fd',
                       gk2a_vis_ea: 'vi006ea', gk2a_ir_ea: 'ir112ea',
                       gk2a_wv: 'wv063' }[key];
          const area = imagery._gk2aMeta?.channels?.[ch]?.area;
          bits.push(ko
            ? (area === 'LA'
              ? '<i>⚠️ <b>한반도 주변만</b> 덮습니다 (32~40°N · 123.5~131.5°E). 그 밖은 비어 있습니다.</i>'
              : area === 'EA'
                ? '<i><b>동아시아 2km</b> 영역입니다 (23~47°N · 114~150°E).</i>'
                : '<i>위성이 보는 <b>전면</b>입니다 — 동아시아·서태평양·호주까지. 지구 반대편은 이 위성이 못 봅니다.</i>')
            : (area === 'LA'
              ? '<i>⚠️ Korea only (32–40°N, 123.5–131.5°E).</i>'
              : area === 'EA'
                ? '<i><b>East Asia 2 km</b> (23–47°N, 114–150°E).</i>'
                : '<i>Full disk — East Asia to Australia. The other side of Earth is not visible to this satellite.</i>'));
        }
        if (key === 'hima_ir') {
          /* ⚠️ 이 자료의 색은 **강수량이 아니다.** 그런데 꼭 그렇게 읽힌다.
             무엇인지와 무엇이 아닌지를 둘 다 적어야 오해가 안 생긴다. */
          bits.push(ko
            ? '<i>구름 <b>꼭대기 온도</b>입니다. 색이 진할수록 꼭대기가 차고, 그런 곳은 대개 대류가 강해 <b>소나기·뇌우</b>가 있습니다.</i>'
            : '<i><b>Cloud-top temperature.</b> Deeper colour = colder top, usually strong convection with showers or thunderstorms.</i>');
          bits.push(ko
            ? '<i>⚠️ 강수량 자체는 아닙니다 — 높고 얇은 구름(권운)도 차갑습니다.</i>'
            : '<i>⚠️ Not rainfall itself — thin high cirrus is cold too.</i>');
          /* ⚠️⚠️ 천리안 적외에는 이 안내를 적어 두고 **히마와리 적외에는 빠뜨렸다.**
             같은 파장, 같은 한계인데 한쪽만 적으면 "천리안만 못 본다"로 읽힌다.
             실제로 그렇게 읽혔다 — 받은 지적이 그것이었다. */
          bits.push(ko
            ? '<i>⚠️ <b>낮은 구름은 잘 안 보입니다.</b> 바다·땅과 온도가 몇 도밖에 차이 나지 '
              + '않기 때문입니다 — 적외선이면 어느 위성이든 같습니다(천리안도 마찬가지). '
              + '낮이라면 <b>가시광</b> 레이어가 훨씬 잘 보입니다.</i>'
            : '<i>⚠️ <b>Low cloud is hard to see</b> — only a few degrees from the surface. '
              + 'This is true of any infrared channel, on any satellite. Use a visible layer by day.</i>');
        }
        if (key === 'clouds_hima') {
          /* ⚠️ "왜 갑자기 촘촘해졌나"에 답한다. 자료가 바뀐 걸 모르면
             확대했더니 구름 모양이 달라진 것으로 보인다.
             ⚠️ 직접 고른 경우와 확대해서 자동으로 바뀐 경우를 구분해 적는다 —
                "확대해서 바뀌었습니다"라고 써 놓고 사실은 사람이 고른 것이면 틀린 안내다. */
          /* ⚠️ "낮은 가시광, 밤은 적외" 라고 적어 두었던 것을 고쳤다.
             밤에 적외를 얹으면 그게 「구름 꼭대기 온도」와 같은 자료라
             구름 메뉴에서 색칠된 그림이 나와 강수량으로 오해된다.
             이제 **가시광만** 쓴다 — 그래서 밤에는 비어 보인다. 그걸 그대로 적는다. */
          bits.push(ko
            ? (id === 'himawari'
              ? '<i>동아시아·서태평양만 보는 정지위성입니다. <b>1km · 10분</b> (전지구 구름은 2.4km · 1시간). <b>가시광</b>이라 낮에만 보입니다.</i>'
              : '<i>확대해서 <b>1km · 10분</b> 자료로 바뀌었습니다 (전지구는 2.4km · 1시간). <b>가시광</b>이라 낮에만 보입니다.</i>')
            : (id === 'himawari'
              ? '<i>A geostationary satellite covering only East Asia and the western Pacific. <b>1 km · 10 min</b> (the global cloud layer is 2.4 km · hourly). <b>Visible light</b>, so it shows only in daylight.</i>'
              : '<i>Zoomed in, so this is the <b>1 km · 10 min</b> feed (the global one is 2.4 km · hourly). <b>Visible light</b>, so it shows only in daylight.</i>'));
          bits.push(ko
            ? '<i>밤에는 「구름 꼭대기 온도」(적외)를 쓰세요 — 어두워도 구름을 봅니다.</i>'
            : '<i>At night use “Cloud-top temperature” (infrared) — it sees cloud in the dark.</i>');
          /* ⚠️ 구역 밖으로 나가면 아무것도 안 보인다. 그 사실을 미리 알린다. */
          if (id === 'himawari') {
            bits.push(ko
              ? '<i>⚠️ 이 위성은 전 지구를 못 봅니다. 동아시아를 벗어나면 화면이 비어 보입니다.</i>'
              : '<i>⚠️ This satellite does not see the whole Earth — leave East Asia and the view goes empty.</i>');
          }
        }
        const every = src?.every || 60;
        const next = new Date(made.getTime() + every * 60_000);
        const mins = Math.round((next - Date.now()) / 60_000);
        bits.push(mins > 0
          ? (ko ? `다음 ${hhmm(next)} 예정 (${mins}분 뒤)` : `next ~${hhmm(next)} (in ${mins} min)`)
          /* ⚠️ 예정 시각이 지났으면 그대로 두지 않는다. 고장난 시계가 된다. */
          : (ko ? `다음 자료 기다리는 중 (${-mins}분 지연)` : `waiting for the next update (${-mins} min late)`));
      }
    }

    /* ── 수치 범례 ────────────────────────────────────────────────
       받은 감사(3차): "기온·습도·수온·파고 등은 색상만 있고 수치 범례가 없다.
       색상·단위 정의는 이미 gridoverlay.js 에 있지만 지도 UI 에서 사용하지 않는다.
       Windy 와 비교했을 때 가장 큰 실사용 차이다."
       맞는 지적이다 — **색을 칠해 놓고 그 색이 몇인지 안 알려주면 그림일 뿐이다.**
       ⚠️ 눈금은 우리가 만들지 않는다. 화면을 칠할 때 쓴 그 색표(SCALES)를 그대로
          꺼내 그린다. 따로 그리면 화면과 범례가 어긋나는 날이 온다.
       ⚠️ 면을 칠하는 레이어일 때만 나온다. 점·선 레이어에는 눈금이 없다. */
    try {
      const { gridOverlay } = await import('./gridoverlay.js');
      const sc = painted ? gridOverlay.scaleOf(painted) : null;
      if (sc?.stops?.length >= 2) {
        const lo = sc.stops[0][0], hi = sc.stops[sc.stops.length - 1][0];
        const css = sc.stops.map(([v, c]) => {
          const pct = ((v - lo) / ((hi - lo) || 1) * 100).toFixed(1);
          return `rgb(${c[0]},${c[1]},${c[2]}) ${pct}%`;
        }).join(',');
        // 눈금 숫자 — 처음·가운데·끝만. 다 적으면 좁은 화면에서 뭉갠다
        const mid = sc.stops[Math.floor(sc.stops.length / 2)][0];
        /* 눌러 본 지점의 값 — 있으면 눈금 앞에 굵게 붙인다.
           ⚠️ 값이 없으면 자리를 비워 둔다. "—" 를 넣으면 0 으로 읽힌다. */
        const pv = this._pointVal;
        const shown = (pv && pv.id === painted)
          ? `<b class="lg-v">${pv.v}${sc.unit || ''}</b>` : '';
        bits.push(shown
          + `<span class="lg-wrap"><i class="lg-bar" style="background:linear-gradient(90deg,${css})"></i>`
          + `<i class="lg-n">${lo}</i><i class="lg-n">${mid}</i>`
          + `<i class="lg-n">${hi}${sc.unit || ''}</i></span>`);
      }
    } catch (_) { /* 격자 모듈이 아직 없으면 넘어간다 */ }

    /* ⚠️⚠️ 안전 레이어(지진·쓰나미·특보·이안류·낙뢰·산불)가 **실패했으면 말한다.**
       (감사 P1-3) 빈 지도를 "위험 없음"으로 읽게 두면 안 된다 —
       "자료 확인 불가"와 "받은 자료 0건"은 다른 상태다.
       ⚠️ 성공했을 때는 아무 말도 보태지 않는다. 평상시에 줄이 늘면 아무도 안 읽는다. */
    try {
      const { registry } = await import('./layers/registry.js');
      const SAFE = { quake: '지진', tsunami: '쓰나미', alerts: '특보',
                     lightning: '낙뢰', wildfire: '산불', cyclone: '태풍' };
      const bad = Object.keys(SAFE)
        .filter(k => store.isOn(k) && registry.status?.[k] === 'error');
      if (bad.length) {
        const names = bad.map(k => ko ? SAFE[k] : k).join(' · ');
        const t = registry.lastOk?.[bad[0]];
        bits.push(ko
          ? `<i>⚠️ <b>${names} 자료를 지금 확인할 수 없습니다</b> — 빈 화면이 "사건 없음"이라는 뜻이 아닙니다.`
            + (t ? ` 마지막으로 받은 시각 ${hhmm(new Date(t))}.` : '') + '</i>'
          : `<i>⚠️ <b>Cannot reach ${names} data</b> — an empty map does not mean "nothing is happening".`
            + (t ? ` Last good ${hhmm(new Date(t))}.` : '') + '</i>');
      }
    } catch (_) { /* 레지스트리가 아직 없으면 넘어간다 */ }

    this.root.innerHTML = bits.map(b => `<span>${b}</span>`).join('')
      + (esriVisible
        ? '<span class="map-credit">Powered by Esri · Source: Esri, Vantor, '
          + 'Earthstar Geographics, and the GIS User Community</span>'
        : '');
    this.root.classList.add('on');
  },
};
