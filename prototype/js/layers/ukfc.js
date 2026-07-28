// 영국 지점예보 — Met Office DataHub (Site Specific / Global Spot)
//
// 왜 별도 레이어인가
//   'landobs'(METAR)와 'stations'(Open-Meteo 도시예보)는 둘 다 전지구를 얕게 훑는다.
//   이건 한 나라를 **그 나라 기상청 자료로** 깊게 보는 첫 사례다.
//   한국(기상청) 다음으로 자국 기관 예보가 들어온 두 번째 나라다.
//
// ⚠️ 이건 **예보**다. 관측이 아니다.
//    같은 영국 땅에 landobs(METAR 실황)도 찍힌다 — 값이 다를 수 있고, 그게 정상이다.
//    시트에 "예보"라고 명시한다. 섞어서 "지금 기온"처럼 보이게 하면 안 된다.
//
// ⚠️ 출처 표기가 **의무**다: "Powered by Met Office data".
//    Met Office 약관이 요구하는 문구다. ui-source.js 에 등록돼 있다. 빼지 말 것.
//
// ⚠️ 무료 플랜 재배포 약관을 아직 확인받지 못했다 (2026-07-28 문의 발송).
//    부정적인 답이 오면 config.js 의 LAYER_DEFS 에서 이 줄만 지우면 즉시 사라진다.
//    Lambda 수집은 계속 돌아도 무방하다 — 화면에만 안 나오면 된다.
//
// ⚠️ 단위 함정 (실측으로 확인, parameter metadata 원문):
//      mslp        → **파스칼**  (hPa 아니다. 그대로 찍으면 101300 hPa 이 나온다)
//      visibility  → 미터
//      windSpeed   → m/s        (화면은 km/h)
//      precipRate  → mm/h

import { PointLayer } from './pointLayer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';

/* 날씨 코드 묶음 → 색.
   ⚠️ Lambda 가 이미 코드→라벨을 붙여서 보낸다. 여기선 색만 정한다.
      Lambda 가 라벨을 못 붙인 코드(wx === null)는 회색으로 두고 지어내지 않는다. */
function wxColor(code) {
  if (code == null) return '#9aa4ae';                 // 모르는 것은 회색
  if (code <= 1) return '#ffd166';                    // 맑음
  if (code <= 3) return '#ffe9b0';                    // 구름조금
  if (code <= 8) return '#b8c2cc';                    // 연무·안개·흐림
  if (code <= 15) return '#5aa9e8';                   // 비 계열
  if (code <= 27) return '#c9e4f5';                   // 진눈깨비·우박·눈
  return '#b98cf0';                                   // 뇌우
}

function compass(deg) {
  if (deg == null) return '';
  const ko = i18n.lang === 'ko';
  const K = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  const E = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return (ko ? K : E)[Math.round((deg % 360) / 45) % 8];
}

/* 앞으로 24시간 중 비가 가장 확실한 시각을 찾는다.
   ⚠️ "언제 비가 오나"가 예보에서 사람이 실제로 궁금해하는 것이다.
      최대 확률이 낮으면(30% 미만) 아무 말도 하지 않는다 — 없는 걱정을 만들지 않는다. */
function rainPeak(hours) {
  let best = null;
  for (const h of hours) {
    if (h.pop == null) continue;
    if (!best || h.pop > best.pop) best = h;
  }
  return best && best.pop >= 30 ? best : null;
}

function hhmmUTCtoLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const ukForecast = {
  layer: null,
  meta: null,

  init() {
    this.layer = new PointLayer({
      id: 'ukfc',
      color: '#8fd0ff',
      radius: 4.4,
      /* 36곳뿐이라 영국을 화면에 담으면 다 보인다.
         그래도 클러스터를 켜 두는 이유: 잉글랜드 남동부가 몰려 있어
         전지구에서 국가급으로 줌아웃할 때 겹친다. */
      cluster: true,
    });
    return this.layer;
  },

  async refresh() {
    const r = await fetch(`${API.EVENTS}/uk-forecast.json`, { cache: 'no-cache' });
    // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님) — 아직 안 올라온 것과 권한 오류가 구분이 안 된다.
    if (!r.ok) throw new Error('uk-forecast ' + r.status);
    const j = await r.json();
    this.meta = {
      updated: j.updated, source: j.source, lic: j._lic,
      count: j.received, requested: j.requested,
      modelRun: j.sites?.[0]?.modelRun,
    };
    const ko = i18n.lang === 'ko';

    const items = (j.sites || []).map(s => {
      const n = s.now || {};
      const hrs = s.hours || [];
      const d = {};

      if (n.ta != null) d[ko ? '기온' : 'Temperature'] = i18n.temp(n.ta, 0);
      if (n.feels != null) d[ko ? '체감' : 'Feels like'] = i18n.temp(n.feels, 0);
      if (n.wx) d[ko ? '날씨' : 'Conditions'] = `${n.icon || ''} ${n.wx}`.trim();

      if (n.ws != null) {
        // ⚠️ m/s 로 온다. 사람이 읽는 단위로 바꾼다.
        const kmh = n.ws * 3.6;
        const g = hrs[0]?.gust;
        d[ko ? '바람' : 'Wind'] = `${kmh.toFixed(0)} km/h ${compass(n.wd)}`
          + (g != null ? (ko ? ` · 순간 ${(g * 3.6).toFixed(0)}` : ` · gusts ${(g * 3.6).toFixed(0)}`) : '');
      }

      const h0 = hrs[0] || {};
      if (h0.hm != null) d[ko ? '습도' : 'Humidity'] = `${Math.round(h0.hm)}%`;
      // ⚠️ 파스칼 → hPa. 100 으로 나누지 않으면 101300 hPa 이 찍힌다.
      if (h0.pa != null) d[ko ? '기압' : 'Pressure'] = `${Math.round(h0.pa / 100)} hPa`;
      // ⚠️ visibility 는 미터다
      if (h0.vis != null) {
        d[ko ? '시정' : 'Visibility'] = h0.vis >= 1000
          ? `${(h0.vis / 1000).toFixed(0)} km` : `${Math.round(h0.vis)} m`;
      }
      if (h0.uv != null) d[ko ? '자외선 지수' : 'UV index'] = String(h0.uv);
      if (h0.td != null) d[ko ? '이슬점' : 'Dew point'] = i18n.temp(h0.td, 0);

      /* 앞으로 24시간 요약 — 최고/최저와 비가 가장 확실한 시각. */
      const tas = hrs.map(h => h.ta).filter(v => v != null);
      if (tas.length > 1) {
        d[ko ? '24시간 최고/최저' : 'Next 24h high/low'] =
          `${i18n.temp(Math.max(...tas), 0)} / ${i18n.temp(Math.min(...tas), 0)}`;
      }
      const peak = rainPeak(hrs);
      if (peak) {
        d[ko ? '비 가능성' : 'Rain likelihood'] =
          `${Math.round(peak.pop)}% · ${hhmmUTCtoLocal(peak.t)}` + (ko ? ' 무렵' : '');
      } else if (n.pop != null) {
        d[ko ? '강수 확률' : 'Precip. probability'] = `${Math.round(n.pop)}%`;
      }

      if (s.alt != null) d[ko ? '해발' : 'Elevation'] = `${Math.round(s.alt)} m`;
      d[ko ? '지역' : 'Region'] = s.region;
      /* 요청 좌표와 모델 지점 사이 거리. 크면 그만큼 대표성이 떨어진다 —
         숨기지 않고 보여준다. 실측 68~1273m. */
      if (s.gridDist != null) {
        d[ko ? '지점 오차' : 'Point offset'] = `${Math.round(s.gridDist)} m`;
      }
      if (s.modelRun) {
        d[ko ? '모델 발표' : 'Model run'] = s.modelRun.replace('T', ' ').replace('Z', ' UTC');
      }

      d['_note'] = ko
        ? (s.summit
            ? '영국 기상청(Met Office) **예보**입니다. 관측이 아닙니다.\n'
              + '산 정상 지점입니다 — 모델이 실제 표고를 반영합니다 (벤네비스 오차 1m).'
            : '영국 기상청(Met Office) **예보**입니다. 관측이 아닙니다.\n'
              + '같은 지역의 「지상 관측소」와 값이 다를 수 있습니다 — 그쪽은 실측입니다.')
        : (s.summit
            ? 'A Met Office **forecast**, not an observation.\nSummit location — the model resolves the true elevation.'
            : 'A Met Office **forecast**, not an observation.\nMay differ from “Ground stations” nearby, which are live readings.');
      d['_lic'] = 'Powered by Met Office data';

      return {
        id: `ukfc-${s.id}`,
        name: ko ? s.nameKo : s.name,
        lat: s.lat, lon: s.lon,
        kind: 'ukfc',
        color: wxColor(n.wx == null ? null : (hrs[0]?.wxCode ?? null)),
        _place: true,
        _summit: !!s.summit,
        _uk: s,
        data: { _ukfc: true, ...d },
      };
    });

    this.layer.setData(items);
    return items;
  },
};
