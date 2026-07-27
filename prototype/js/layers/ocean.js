// 해양 관측 부이 (NOAA NDBC) — 파고·수온·기압·풍속
//
// 실측: 869개 부이가 관측값을 내고 있고 그중 165개가 파고를 잰다.
//       한국 근해(22102~22105)도 포함된다.
//
// ⚠️ 부이마다 재는 항목이 다르다. 파고를 안 재는 부이가 훨씬 많다.
//    없는 값을 0 으로 표시하면 "파도가 없다"로 읽힌다 — 반드시 '—' 로 둔다.
//
// ⚠️ 869개를 전부 항상 그리면 연안이 점으로 덮인다.
//    §5-10 규칙대로 점(point) 레이어는 국가급 확대부터 보이게 한다.

import { PointLayer } from './pointLayer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';
import { compass, seaState } from '../place.js';

export const buoys = {
  layer: null,
  meta: null,

  init() {
    this.layer = new PointLayer({
      id: 'buoy',
      color: '#5ad1e8',
      radius: 4,
      cluster: true,
    });
    return this.layer;
  },

  async refresh() {
    const r = await fetch(`${API.OCEAN}/buoys.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('ndbc ' + r.status);
    const j = await r.json();
    this.meta = { generated: j.generated, source: j.source, count: j.count };
    const ko = i18n.lang === 'ko';

    const items = (j.buoys || []).map(b => {
      const d = {};
      // 파도를 재는 부이가 먼저다 — 항해에 쓰는 값이 위로 와야 한다
      if (b.wvht != null) {
        d[ko ? '파고' : 'Wave height'] = `${b.wvht.toFixed(1)} m · ${seaState(b.wvht)}`;
      }
      if (b.dpd != null) d[ko ? '파주기' : 'Wave period'] = `${b.dpd.toFixed(1)} s`;
      if (b.wtmp != null) d[ko ? '수온' : 'Water temp'] = i18n.temp(b.wtmp, 1);
      if (b.atmp != null) d[ko ? '기온' : 'Air temp'] = i18n.temp(b.atmp, 1);
      if (b.wspd != null) {
        d[ko ? '풍속' : 'Wind'] = `${(b.wspd * 3.6).toFixed(0)} km/h`
          + (b.wdir != null ? ` ${compass(b.wdir)}` : '');
      }
      if (b.pres != null) d[ko ? '기압' : 'Pressure'] = `${b.pres.toFixed(0)} hPa`;
      d[ko ? '관측소' : 'Station'] = `NDBC ${b.id}`;

      /* ── 제원 ──
         "저 해양부이가 뭐하는지 궁금하잖아"에 답하는 부분이다.
         NDBC 관측소 제원표(station_table.txt)에서 온 값이다.
         ⚠️ 없는 항목은 넣지 않는다. 빈 칸을 지어내지 않는다. */
      const M = b.meta;
      if (M) {
        if (M.type) d[ko ? '부이 종류' : 'Buoy type'] = M.type;
        if (M.payload) d[ko ? '탑재 장비' : 'Payload'] = M.payload;
        if (M.hull) d[ko ? '선체 번호' : 'Hull'] = M.hull;
        const owner = ko ? M.ownerKo : M.ownerEn;
        if (owner) d[ko ? '운용' : 'Operated by'] = owner;
        /* ⚠️ 국가는 표기가 있을 때만 넣는다. OSMC 의 'UNKNOWN' 은
           "국가가 없다"가 아니라 "표기가 빠졌다"는 뜻이라 서버에서 이미 비웠다. */
        if (M.country) d[ko ? '국가' : 'Country'] = M.country;
      }

      return {
        id: `buoy-${b.id}`,
        /* 이름에 위치 설명을 넣는다 — "부이 41001" 만으로는 어디인지 모른다.
           NDBC 이름은 'EAST HATTERAS - 150 NM East of Cape Hatteras' 식이다. */
        name: M?.name ? `${ko ? '부이' : 'Buoy'} ${b.id} · ${M.name}`
                      : `${ko ? '부이' : 'Buoy'} ${b.id}`,
        lat: b.lat, lon: b.lon,
        kind: 'buoy',
        _buoyId: b.id,
        _meta2: M || null,
        /* NDBC 가 이 관측소를 호스팅하나 — 카메라·차트·상세 페이지의 조건.
           ⚠️ 예전에는 `src`가 'NDBC'로 시작하는지만 봤다. 그러면 OSMC 로 들어온
              관측소는 전부 빠진다 — 그런데 실측하니 그중에도 NDBC 차트가 있는 곳이
              많았다 (ACYN4·32ST0·51WH0). 그래서 서버가 HEAD 로 실제 확인한
              `chart` 표시를 쓴다. 빈 차트를 띄우지 않으면서 최대한 많이 보여준다. */
        _ndbc: !!(M && (M.chart || String(M.src || '').startsWith('NDBC'))),
        // 파고를 재는 부이는 조금 크게 — 항해자가 찾는 것이 그것이다
        radius: b.wvht != null ? 5.5 : 3.5,
        color: b.wvht != null ? '#5ad1e8' : '#4a7f92',
        data: d,
      };
    });

    this.layer.setData(items);
    return items;
  },
};
