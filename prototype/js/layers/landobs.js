// 지상 관측소 — 공항에 실제로 설치된 계기의 실황(METAR)
//
// 왜 별도 레이어인가
//   기존 '관측소'(weather.js) 는 도시 47곳을 Open-Meteo 로 조회해 **예보**를 보여준다.
//   실제로 계기가 놓인 자리가 아니다.
//   이건 전 세계 공항에 물리적으로 설치된 장비가 30~60분마다 내는 **실황**이다.
//   해양부이와 성격이 같아서, 부이와 같은 방식으로 다룬다.
//
// ⚠️ 예보와 실황을 한 화면에서 섞지 않는다.
//    시트에 "실황(관측)"이라고 명시하고, 5일치 그래프는 별도 출처를 밝힌다.
//
// ⚠️ METAR 은 항공용이라 단위가 항공 단위다 (풍속 노트, 고도 피트).
//    화면에는 사람이 쓰는 단위로 바꿔 보여주되, 원문 METAR 을 그대로 같이 둔다.
//    우리가 해석을 틀려도 원문에서 다시 읽을 수 있어야 한다.

import { PointLayer } from './pointLayer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';

/* 비행 기상 등급 — METAR 의 fltCat. 시정과 운고로 정해진다.
   ⚠️ 이건 항공 기준이지 "날씨가 나쁘다"가 아니다. 그대로 옮기고 뜻을 적어 준다. */
const CAT = {
  VFR:  { color: '#7ee0a0', ko: '시계비행 가능', en: 'Visual conditions' },
  MVFR: { color: '#8fd0ff', ko: '시계비행 제한', en: 'Marginal visual' },
  IFR:  { color: '#ffb84d', ko: '계기비행 필요', en: 'Instrument conditions' },
  LIFR: { color: '#ff6b6b', ko: '계기비행 (심함)', en: 'Low instrument' },
};

const COVER = {
  SKC: ['맑음', 'Clear'], CLR: ['맑음', 'Clear'], CAVOK: ['맑음', 'Clear'],
  FEW: ['약간', 'Few'], SCT: ['부분', 'Scattered'],
  BKN: ['대부분', 'Broken'], OVC: ['흐림', 'Overcast'],
  OVX: ['수직시정 불량', 'Obscured'],
};

function compass(deg) {
  if (deg == null) return '';
  const ko = i18n.lang === 'ko';
  const K = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  const E = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const i = Math.round(((deg % 360) / 45)) % 8;
  return (ko ? K : E)[i];
}

export const landObs = {
  layer: null,
  meta: null,

  init() {
    this.layer = new PointLayer({
      id: 'landobs',
      color: '#9fd8a8',
      radius: 3.6,
      cluster: true,          // 수천 곳이라 묶지 않으면 화면이 덮인다
    });
    return this.layer;
  },

  async refresh() {
    const r = await fetch(`${API.WIND}/stations.json`, { cache: 'no-cache' });
    // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님). 아직 안 만들어진 것과 권한 오류를 구분하지 못한다.
    if (!r.ok) throw new Error('stations ' + r.status);
    const j = await r.json();
    this.meta = { generated: j.generated, source: j.source, count: j.count, note: j.note };
    const ko = i18n.lang === 'ko';

    const items = (j.stations || []).map(s => {
      const d = {};
      if (s.temp_c != null) d[ko ? '기온' : 'Temperature'] = i18n.temp(s.temp_c, 0);
      if (s.dewp_c != null) {
        d[ko ? '이슬점' : 'Dew point'] = i18n.temp(s.dewp_c, 0);
        /* 기온과 이슬점이 가까우면 공기가 포화에 가깝다 — 안개가 끼는 조건이다.
           ⚠️ "안개다"라고 말하지 않는다. 조건일 뿐이고, 실제 안개는 시정으로 판정한다. */
        if (s.temp_c != null) {
          const gap = s.temp_c - s.dewp_c;
          d[ko ? '기온−이슬점' : 'Spread'] = `${gap.toFixed(0)}°C`
            + (gap <= 2 ? (ko ? ' · 포화에 가까움' : ' · near saturation') : '');
        }
      }
      if (s.wspd_kt != null) {
        const kmh = s.wspd_kt * 1.852;
        d[ko ? '바람' : 'Wind'] = `${kmh.toFixed(0)} km/h ${compass(s.wdir)}`
          + (s.wgst_kt ? (ko ? ` · 순간 ${(s.wgst_kt * 1.852).toFixed(0)}` : ` · gusts ${(s.wgst_kt * 1.852).toFixed(0)}`) : '');
      }
      if (s.visib != null) d[ko ? '시정' : 'Visibility'] = `${s.visib}${typeof s.visib === 'number' ? ' mi' : ''}`;
      if (s.pres_hpa != null) d[ko ? '기압' : 'Pressure'] = `${Math.round(s.pres_hpa)} hPa`;
      if (s.clouds?.length) {
        d[ko ? '구름' : 'Clouds'] = s.clouds.map(c => {
          const nm = (COVER[c.c] || [c.c, c.c])[ko ? 0 : 1];
          return c.b != null ? `${nm} ${Math.round(c.b * 0.3048)}m` : nm;
        }).join(' · ');
      }
      const cat = CAT[s.cat];
      if (cat) d[ko ? '비행 기상' : 'Flight category'] = `${s.cat} — ${ko ? cat.ko : cat.en}`;
      if (s.elev_m != null) d[ko ? '해발' : 'Elevation'] = `${s.elev_m} m`;
      d[ko ? '관측소' : 'Station'] = s.id;
      if (s.obs) d[ko ? '관측 시각' : 'Observed'] = s.obs.replace('T', ' ').replace(':00Z', ' UTC');

      d['_note'] = ko
        ? '공항에 설치된 계기의 **실황**입니다. 예보가 아닙니다.'
        : 'A **live reading** from an instrument at the airport — not a forecast.';

      return {
        id: `land-${s.id}`,
        name: s.id,
        lat: s.lat, lon: s.lon,
        kind: 'landobs',
        color: cat?.color || '#9fd8a8',
        _place: true,
        // 시트가 5일치 그래프·사진을 만들 때 쓴다
        _station: s,
        data: { _landobs: true, ...d },
      };
    });

    this.layer.setData(items);
    return items;
  },
};

export { CAT as FLIGHT_CAT };
