// 지역 기관 재해 — 각 나라 공식기관이 직접 본 것
//
// 왜 전지구 지진 레이어와 따로 두나
//   USGS 는 해외에서 대개 규모 4.5 이상만 싣는다. 각 나라 기관은 자기 땅의
//   작은 지진까지 본다 — 그 지역 사람에게는 그게 중요하다.
//   ⚠️ 대신 **큰 지진은 양쪽에 다 나온다.** 한 레이어에 섞으면 같은 지진이
//      두 번 찍혀 "두 번 났다"로 읽힌다. 그래서 켜고 끄는 걸 따로 둔다.
//
// ⚠️ 좌표가 없는 항목(화산 주간보고)은 **지도에 올리지 않는다.**
//    이름만 있는 것을 억지로 어딘가에 찍으면 그건 거짓말이다.

import { PointLayer } from './pointLayer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';

/* 종류별 색.
   ⚠️ 전지구 지진(빨강 계열)과 **구분되는 색**을 쓴다. 같은 색이면
      "USGS 가 본 것"과 "그 나라가 본 것"이 화면에서 섞인다. */
const KIND = {
  quake:   { color: '#7bc8ff', ko: '지진', en: 'Earthquake' },
  volcano: { color: '#ff9f45', ko: '화산경보', en: 'Volcano alert' },
  warning: { color: '#ffd166', ko: '기상경보', en: 'Weather warning' },
};

export const regional = {
  layer: null,
  meta: null,

  init() {
    this.layer = new PointLayer({
      id: 'regional',
      color: KIND.quake.color,
      radius: 3.4,
      cluster: true,          // 300건 가까이 온다. 묶지 않으면 화면이 덮인다.
      /* 규모 4 이상은 전지구 화면에서도 보이게 한다.
         ⚠️ 작은 지진까지 전지구에 다 찍으면 화면이 점으로 덮인다 —
            그게 이 레이어의 장점(촘촘함)을 오히려 못 쓰게 만든다.
            가까이 가면 전부 보인다. */
      globalOK: (m) => {
        const t = m?.data && (m.data['규모'] || m.data.Magnitude);
        return t == null ? true : parseFloat(t) >= 4;
      },
    });
    return this.layer;
  },

  async refresh() {
    const r = await fetch(`${API.EVENTS}/regional.json`, { cache: 'no-cache' });
    // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님).
    if (!r.ok) throw new Error('regional ' + r.status);
    const j = await r.json();

    const ko = i18n.lang === 'ko';
    const items = [];
    let noCoords = 0;

    (j.items || []).forEach((it, i) => {
      // 좌표 없는 것은 세기만 하고 지도에 올리지 않는다
      if (it.lat == null || it.lon == null) { noCoords++; return; }
      const k = KIND[it.kind] || KIND.quake;
      const mag = it.mag;
      const name = mag != null
        ? `M${mag.toFixed(1)}`
        : (ko ? k.ko : k.en);

      const d = {};
      d[ko ? '종류' : 'Type'] = ko ? k.ko : k.en;
      if (mag != null) d[ko ? '규모' : 'Magnitude'] = mag.toFixed(1);
      if (it.depth != null) d[ko ? '깊이' : 'Depth'] = `${it.depth}`;
      if (it.place) d[ko ? '위치' : 'Place'] = it.place;
      if (it.level != null) d[ko ? '경보단계' : 'Alert level'] = String(it.level);
      if (it.severity) d[ko ? '심각도' : 'Severity'] = it.severity;
      if (it.utc) d[ko ? '시각(UTC)' : 'Time (UTC)'] = String(it.utc).slice(0, 19).replace('T', ' ');
      /* ⚠️ 출처를 반드시 보여준다. "그 나라 기관이 본 것"이라는 게 이 레이어의 뜻이다. */
      d[ko ? '출처' : 'Source'] = it._src;
      /* ⚠️ 구역 경보는 점이 아니라 넓은 구역이다. 점 하나로 오해하지 않게 적는다. */
      if (it.area) d[ko ? '범위' : 'Extent'] = ko ? '구역 전체 (표시는 중심점)' : 'Area (shown at centre)';

      items.push({
        id: `${it.kind}-${i}`,
        lat: it.lat, lon: it.lon,
        name,
        color: k.color,
        // 규모가 클수록 크게. ⚠️ 규모가 없으면 기본 크기.
        radius: mag != null ? 2.6 + Math.min(6, Math.max(0, mag - 2) * 1.3) : 4,
        data: d,
        _time: it.utc ? Date.parse(it.utc) : undefined,
      });
    });

    this.meta = {
      generated: j.generated, source: j.source, note: j.note,
      counts: j.counts, failed: j.failed,
      total: j.count, mapped: items.length, noCoords,
    };
    this.layer.setData(items);
    return items.length;
  },
};
