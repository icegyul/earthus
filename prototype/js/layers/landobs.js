// 지상 관측소 — GTS SYNOP + 공항 METAR + 기상청 ASOS + 일본 JMA AMeDAS 실황
//
// 왜 별도 레이어인가
//   기존 '관측소'(weather.js) 는 도시 47곳을 Open-Meteo 로 조회해 **예보**를 보여준다.
//   실제로 계기가 놓인 자리가 아니다.
//   이건 전 세계 지상에 물리적으로 설치된 장비가 내는 **실황**이다.
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
import { jpName } from '../jpname.js';

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

/* ⚠️ JMA AMeDAS의 windDirection은 각도가 아니라 0(고요)+16방위 코드다.
   METAR/KMA용 compass()에 넣으면 9를 북쪽으로 잘못 읽으므로 따로 옮긴다. */
function jmaCompass(code) {
  if (code == null) return '';
  const ko = i18n.lang === 'ko';
  const K = ['고요', '북북동', '북동', '동북동', '동', '동남동', '남동', '남남동',
    '남', '남남서', '남서', '서남서', '서', '서북서', '북서', '북북서', '북'];
  const E = ['Calm', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW', 'N'];
  return (ko ? K : E)[Number(code)] || '';
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
    /* 전지구는 GTS SYNOP + METAR, 한국은 기상청 ASOS 96곳, 일본은 JMA AMeDAS 대표 지점,
       대만은 CWA 전 측후소를
       같은 '실황 관측' 층에 놓는다.
       ⚠️ 하나가 실패해도 다른 관측망은 보여야 한다. Promise.all 로 묶어 한쪽
          장애가 전체를 빈 지도로 만들면 '관측 없음'처럼 읽힌다. */
    const [r, rg, rk, rj, rc] = await Promise.all([
      fetch(`${API.WIND}/stations.json`, { cache: 'no-cache' }).catch(() => null),
      fetch(`${API.WIND}/gts-global.json`, { cache: 'no-cache' }).catch(() => null),
      fetch(`${API.WIND}/kma-aws.json`, { cache: 'no-cache' }).catch(() => null),
      fetch(`${API.WIND}/jp-amedas.json`, { cache: 'no-cache' }).catch(() => null),
      fetch(`${API.WIND}/cwa-observations.json`, { cache: 'no-cache' }).catch(() => null),
    ]);
    // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님). 다섯 자료원이 모두 없을 때만 실패로 올린다.
    if (!r?.ok && !rg?.ok && !rk?.ok && !rj?.ok && !rc?.ok) {
      throw new Error(`stations ${r?.status || 'network'} · gts ${rg?.status || 'network'} · kma ${rk?.status || 'network'} · jma ${rj?.status || 'network'} · cwa ${rc?.status || 'network'}`);
    }
    const j = r?.ok ? await r.json() : { stations: [], count: 0 };
    const g = rg?.ok ? await rg.json() : { stations: [], count: 0 };
    const k = rk?.ok ? await rk.json() : { stations: [], count: 0 };
    const a = rj?.ok ? await rj.json() : { stations: [], count: 0 };
    const c = rc?.ok ? await rc.json() : { stations: [], count: 0 };
    this.meta = {
      generated: [j.generated, g.generated, k.generated, a.time, c.generated].filter(Boolean).sort().at(-1),
      source: [j.source, g.source, k.source, a.source, c.source].filter(Boolean).join(' + '),
      count: (j.count || 0) + (g.count || 0) + (k.count || 0) + (a.count || 0) + (c.landCount || 0),
      note: { metar: j.note || null, gts: g.note || null, kma: k.note || null, jma: a.note || null, cwa: c.terms || null },
      failed: [!r?.ok ? 'METAR' : null, !rg?.ok ? 'GTS SYNOP' : null, !rk?.ok ? 'KMA ASOS' : null,
        !rj?.ok ? 'JMA AMeDAS' : null, !rc?.ok ? 'CWA Taiwan' : null].filter(Boolean),
    };
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
          /* ⚠️ "포화에 가까움"은 화학 시간에 들은 말이다.
             뜻은 **공기가 물기를 더 못 머금는다**는 것이고, 그래서 안개가 낀다. */
          d[ko ? '이슬점까지 남은 폭' : 'Spread'] = `${gap.toFixed(0)}°C`
            + (gap <= 2 ? (ko ? ' · 안개가 끼기 쉬운 상태' : ' · near saturation') : '');
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
        ? '자료 유형 · 공항 계기 **실황 관측**'
        : 'Data type · airport instrument **observation**';

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

    /* 전 세계 GTS SYNOP. 공항만 보는 METAR와 달리 육상 기상관측소까지 들어온다.
       ⚠️ 같은 물리 관측소가 METAR에도 있을 수 있다. 억지로 하나를 삭제하지 않는다:
       두 전문은 갱신시각·측정항목·품질 통과 여부가 달라, "한 점"으로 합치면 원 출처와
       실제 관측시각을 잃는다. 지도 클러스터는 겹침을 정리하고 상세는 출처를 분명히 한다. */
    (g.stations || []).forEach(s => {
      if (s.lat == null || s.lon == null) return;
      const d = {};
      if (s.ta != null) d[ko ? '기온' : 'Temperature'] = i18n.temp(s.ta, 1);
      if (s.td != null) d[ko ? '이슬점' : 'Dew point'] = i18n.temp(s.td, 1);
      if (s.hm != null) d[ko ? '습도' : 'Humidity'] = `${Math.round(s.hm)}%`;
      if (s.ws != null) d[ko ? '바람' : 'Wind'] = `${s.ws.toFixed(1)} m/s ${compass(s.wd)}`;
      if (s.pa != null) d[ko ? '해면기압' : 'Sea-level pressure'] = `${s.pa.toFixed(1)} hPa`;
      if (s.ps != null) d[ko ? '현지기압' : 'Station pressure'] = `${s.ps.toFixed(1)} hPa`;
      if (s.rn != null) d[ko ? '강수' : 'Rain'] = `${s.rn.toFixed(1)} mm`;
      if (s.alt != null) d[ko ? '해발' : 'Elevation'] = `${s.alt} m`;
      d[ko ? '관측소' : 'Station'] = `${s.name || s.id} · WMO ${s.id}`;
      if (s.tm && /^\d{12}$/.test(s.tm)) {
        d[ko ? '관측 시각(UTC)' : 'Observed (UTC)'] = `${s.tm.slice(0, 4)}-${s.tm.slice(4, 6)}-${s.tm.slice(6, 8)} ${s.tm.slice(8, 10)}:${s.tm.slice(10, 12)} UTC`;
      }
      d[ko ? '출처' : 'Source'] = ko
        ? (g.source || '세계기상통신망(GTS) 지상관측')
        : (g.sourceEn || 'GTS SYNOP surface observations');
      d['_note'] = ko
        ? '자료 유형 · GTS SYNOP 지상 **실황 관측** · 좌표 매핑 완료 WMO 지점'
        : 'Data type · GTS SYNOP surface **observation** · coordinate-matched WMO stations';
      items.push({
        id: `gts-${s.id}`,
        // 수천 곳의 라벨은 읽을 수 없고 발열만 만든다. 점을 눌러 상세를 연다.
        name: '',
        lat: s.lat, lon: s.lon,
        kind: 'landobs', color: '#b4d978', _place: true,
        data: { _landobs: true, _gtsSynop: true, ...d },
      });
    });

    /* 대만 CWA 전 측후소. 태풍 주변 근거 계산에 쓰는 같은 정규화 파일을 지도도
       읽는다. 부이는 해양 부이 레이어에서 다루므로 여기서는 land만 — 같은 점을
       두 레이어에 중복해 놓지 않는다. 원문 시각·CWA 출처를 그대로 남긴다. */
    (c.stations || []).filter(s => s.platform === 'land').forEach(s => {
      if (s.lat == null || s.lon == null) return;
      const d = {};
      if (s.temp_c != null) d[ko ? '기온' : 'Temperature'] = i18n.temp(s.temp_c, 1);
      if (s.humid_pct != null) d[ko ? '습도' : 'Humidity'] = `${Math.round(s.humid_pct)}%`;
      if (s.wind_ms != null) d[ko ? '바람' : 'Wind'] = `${s.wind_ms.toFixed(1)} m/s ${compass(s.wind_dir)}`;
      if (s.pres_hpa != null) d[ko ? '기압' : 'Pressure'] = `${s.pres_hpa.toFixed(1)} hPa`;
      if (s.rain_mm != null) d[ko ? '강수' : 'Rain'] = `${s.rain_mm.toFixed(1)} mm`;
      d[ko ? '관측소' : 'Station'] = `${s.name} · ${s.sourceStationId || s.id}`;
      if (s.observed) d[ko ? '관측 시각' : 'Observed'] = s.observed;
      d[ko ? '출처' : 'Source'] = c.source || 'Taiwan CWA Open Data';
      d['_note'] = ko
        ? '자료 유형 · 대만 중앙기상서(CWA) 지상 **실황 관측**'
        : 'Data type · Taiwan CWA surface **observation**';
      items.push({
        id: `cwa-${s.id}`,
        name: '',
        lat: s.lat, lon: s.lon,
        kind: 'landobs', color: '#b493e8', _place: true,
        data: { _landobs: true, _cwa: true, ...d },
      });
    });

    /* 한국 시·군을 알아볼 수 있는 고도에서 관측소명 + 현재 기온을 라벨로 쓴다.
       ⚠️ 736개 AWS를 전부 쓰면 한 화면이 글자로 덮인다. 장기 관측 기준점인 ASOS
          96곳만 대표로 쓰고, PointLayer의 거리 제한·클러스터 규칙을 그대로 따른다.
       ⚠️ 온도가 결측이면 이름만 쓴다. 0°C로 채우지 않는다. */
    (k.stations || []).forEach(s => {
      if (s.lat == null || s.lon == null) return;
      const d = {};
      if (s.temp_c != null) d[ko ? '기온' : 'Temperature'] = i18n.temp(s.temp_c, 1);
      if (s.humid_pct != null) d[ko ? '습도' : 'Humidity'] = `${Math.round(s.humid_pct)}%`;
      if (s.wind_ms != null) d[ko ? '바람' : 'Wind'] = `${s.wind_ms.toFixed(1)} m/s ${compass(s.wind_dir)}`;
      if (s.rain_mm != null) d[ko ? '강수' : 'Rain'] = `${s.rain_mm.toFixed(1)} mm`;
      if (s.pres_sea != null) d[ko ? '해면기압' : 'Sea-level pressure'] = `${s.pres_sea.toFixed(1)} hPa`;
      if (s.dewp_c != null) d[ko ? '이슬점' : 'Dew point'] = i18n.temp(s.dewp_c, 1);
      if (s.alt != null) d[ko ? '해발' : 'Elevation'] = `${s.alt} m`;
      d[ko ? '관측소' : 'Station'] = `${s.name} · ${s.id}`;
      if (k.observedKst) d[ko ? '관측 시각(KST)' : 'Observed (KST)'] = k.observedKst;
      d[ko ? '출처' : 'Source'] = ko ? (k.source || '기상청 지상관측') : (k.sourceEn || 'KMA surface observations');
      d['_note'] = ko
        ? '자료 유형 · 기상청 ASOS 정시 **실황 관측**'
        : 'Data type · hourly KMA ASOS **observation**';
      items.push({
        id: `kma-asos-${s.id}`,
        name: `${s.name}${s.temp_c != null ? ` ${i18n.temp(s.temp_c, 0)}` : ''}`,
        lat: s.lat, lon: s.lon,
        kind: 'landobs', color: '#8fd0e8', _place: true,
        /* 전지구 METAR 1,987곳의 60km 제한과 분리한다. ASOS는 96곳뿐이라
           140km에서도 수도권 몇 개 시·군을 읽을 수 있고 전국을 덮지 않는다. */
        labelFar: 140_000,
        _stationId: String(s.id),
        data: { _landobs: true, _kmaAsos: true, ...d },
      });
    });

    /* 일본도 한국과 같은 확대 경험을 준다. AMeDAS 1,285곳을 전부 이름표로 만들면
       간토 한 화면이 글자로 덮이므로, 기압·기온을 함께 재는 154개 기상관서급 지점만
       대표로 쓴다. 비만 재는 지점도 원자료 수에는 포함되지만 지도 라벨에는 넣지 않는다. */
    (a.stations || []).filter(s => s.pres != null && s.temp != null).forEach(s => {
      if (s.lat == null || s.lon == null) return;
      const nm = jpName(s, i18n.lang);
      const d = {};
      d[ko ? '기온' : 'Temperature'] = i18n.temp(s.temp, 1);
      if (s.hum != null) d[ko ? '습도' : 'Humidity'] = `${Math.round(s.hum)}%`;
      if (s.wind != null) {
        const dir = jmaCompass(s.wdir);
        d[ko ? '바람' : 'Wind'] = `${s.wind.toFixed(1)} m/s${dir ? ` ${dir}` : ''}`;
      }
      if (s.rain10 != null) d[ko ? '10분 강수' : 'Rain (10 min)'] = `${s.rain10.toFixed(1)} mm`;
      if (s.rain1h != null) d[ko ? '1시간 강수' : 'Rain (1 h)'] = `${s.rain1h.toFixed(1)} mm`;
      if (s.rain24h != null) d[ko ? '24시간 강수' : 'Rain (24 h)'] = `${s.rain24h.toFixed(1)} mm`;
      d[ko ? '현지기압' : 'Station pressure'] = `${s.pres.toFixed(1)} hPa`;
      if (s.snow != null) d[ko ? '적설' : 'Snow depth'] = `${s.snow} cm`;
      if (s.alt != null) d[ko ? '해발' : 'Elevation'] = `${s.alt} m`;
      d[ko ? '관측소' : 'Station'] = `${nm.text} · ${s.id}`;
      if (a.timeJst) d[ko ? '관측 시각(JST)' : 'Observed (JST)'] = a.timeJst;
      d[ko ? '출처' : 'Source'] = a.source || 'JMA AMeDAS';
      d['_note'] = ko
        ? '자료 유형 · JMA AMeDAS 10분 **실황 관측**'
          + (nm.mark === 'tr' ? ' · 한글 지명은 영문 기반 변환' : '')
        : 'Data type · JMA AMeDAS 10-minute **observation**';
      items.push({
        id: `jma-amedas-${s.id}`,
        name: `${nm.text}${s.temp != null ? ` ${i18n.temp(s.temp, 0)}` : ''}`,
        lat: s.lat, lon: s.lon,
        kind: 'landobs', color: '#ffb46b', _place: true,
        labelFar: 140_000,
        data: { _landobs: true, _jmaAmedas: true, ...d },
      });
    });

    this.layer.setData(items);
    return items;
  },
};

export { CAT as FLIGHT_CAT };
