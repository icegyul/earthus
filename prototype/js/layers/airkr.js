// 대기오염 실측 (한국환경공단 · 에어코리아) — 673개 측정소
//
// ⚠️ 지도의 pm25/pm10/aqi 격자(air-grid)는 유럽 CAMS **모델값**이다.
//    이건 한국이 **실제로 잰 값**이다. 모델을 대체하지 않는다 — 모델은 전 지구를
//    덮고 실측은 정확하지만 한국뿐이다. 둘 다 켤 수 있게 둔다.
//
// ⚠️ 등급(좋음·보통·나쁨·매우 나쁨)은 **환경부가 매긴 것**을 그대로 옮긴다.
//    우리가 농도에 임계값을 새로 매기지 않는다 — aws/air-korea/handler.py 와 같은 원칙.
//
// ⚠️ 값이 없는 항목은 '—' 로 둔다. 결측을 0 으로 읽으면
//    고장난 측정소가 "가장 깨끗한 곳"이 된다.

import { PointLayer } from './pointLayer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';

// 환경부 통합대기환경지수 등급색. ⚠️ 임의로 고른 색이 아니라
// 에어코리아·공공 대기질 안내에서 통용되는 4단계 배색을 따른다.
const GRADE_COLOR = { 1: '#3fc7c0', 2: '#5fd15a', 3: '#ff9f43', 4: '#ff5a5a' };
const GRADE_RADIUS = { 1: 3.2, 2: 3.6, 3: 4.4, 4: 5.2 };   // 나쁠수록 눈에 띄게

export const airStations = {
  layer: null,
  meta: null,

  init() {
    this.layer = new PointLayer({
      id: 'airkr',
      color: '#8a97a8',   // 등급 없는 측정소용 기본값 (아래서 대부분 덮어씀)
      radius: 3.5,
      cluster: true,
    });
    return this.layer;
  },

  async refresh() {
    const r = await fetch(`${API.WIND}/korea-air-obs.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('air-kr ' + r.status);
    const j = await r.json();
    this.meta = { generated: j.generated, observedKst: j.observedKst, count: j.count,
                  have: j.have, note: j.note };
    const ko = i18n.lang === 'ko';

    const items = (j.stations || [])
      .filter(s => s.lat != null && s.lon != null)   // 좌표 없는 측정소는 지도에 안 찍는다 (값은 별도로 노출 가능)
      .map(s => {
        const d = {};
        // 초미세먼지가 먼저다 — 건강 영향이 더 크다고 알려진 항목이 위로 온다
        if (s.pm25 != null) d[ko ? '초미세먼지 PM2.5' : 'PM2.5'] = `${s.pm25} µg/㎥`;
        if (s.pm10 != null) d[ko ? '미세먼지 PM10' : 'PM10'] = `${s.pm10} µg/㎥`;
        if (s.gradeKo) {
          d[ko ? '통합대기환경지수' : 'Air quality grade'] =
            ko ? `${s.gradeKo} (환경부 등급)` : `${s.gradeKo} (KME grade)`;
        }
        if (s.o3 != null) d[ko ? '오존' : 'Ozone'] = `${s.o3} ppm`;
        if (s.no2 != null) d[ko ? '이산화질소' : 'NO₂'] = `${s.no2} ppm`;
        if (s.so2 != null) d[ko ? '아황산가스' : 'SO₂'] = `${s.so2} ppm`;
        if (s.co != null) d[ko ? '일산화탄소' : 'CO'] = `${s.co} ppm`;
        if (s.kind) d[ko ? '측정망' : 'Network'] = s.kind;
        if (s.addr) d[ko ? '주소' : 'Address'] = s.addr;
        // ⚠️ 결측 사유 — "왜 비었나"를 말할 수 있어야 한다 (부이 레이어와 같은 원칙).
        if (s.flags && Object.keys(s.flags).length) {
          d[ko ? '결측 사유' : 'Data flag'] = Object.values(s.flags).join(' · ');
        }
        d[ko ? '측정소' : 'Station'] = s.name;

        const grade = Number(s.grade) || null;

        return {
          id: `airkr-${s.name}`,
          name: ko ? `${s.name} · 대기질(실측)` : `${s.name} · Air quality (measured)`,
          lat: s.lat, lon: s.lon,
          kind: 'airkr',
          _obsAt: s.at || null,
          _obs: { pm25: s.pm25, pm10: s.pm10, grade },
          radius: GRADE_RADIUS[grade] ?? 3.2,
          color: GRADE_COLOR[grade] ?? '#8a97a8',
          data: d,
        };
      });

    this.layer.setData(items);
    return items;
  },

  /** 매우나쁨(4등급) 측정소가 있는가 — 상단 배너 판단용.
   *  ⚠️ "경보"라고 말하지 않는다. 우리가 발령하는 게 아니라 실측 등급이 그렇다는 것이다. */
  worst() {
    const items = this.layer?.items || [];
    return items.filter(x => x._obs?.grade === 4);
  },
};
