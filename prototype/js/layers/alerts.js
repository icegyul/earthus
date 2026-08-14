// 기상경보 — 호우·한파·폭염·대설·강풍이 지금 어디에 걸려 있나
//
// 왜 한 레이어로 묶나 (받은 요청)
//   "낙뢰, 호우, 한파, 눈, 비, 폭우 … 지역별로 발생하거나 예보가 있을경우
//    지도에 표시해주고 … 한 번에 보는 메뉴를 만들어주던지"
//   경보는 종류가 달라도 "지금 조심할 일"이라는 점에서 하나다. 한 레이어에 담고
//   **종류는 색과 아이콘으로 구분**한다. 종류마다 레이어를 만들면 메뉴만 열 줄 늘고
//   정작 "지금 어디가 위험한가"는 한눈에 안 들어온다.
//
// ⚠️ **낙뢰는 여기 안 넣는다.** 낙뢰는 '경보'가 아니라 '이미 떨어진 것'이다.
//    예보·경보와 실측을 한 레이어에 섞으면 "이건 예보인가 실제인가"를 알 수 없다.
//    낙뢰는 옆 항목(재난 › 낙뢰)에 따로 둔다.
//
// ⚠️ 경보는 **점이 아니라 구역**이다. 우리가 가진 건 그 구역의 대표 좌표 하나뿐이다.
//    점만 찍고 끝내면 "여기만 위험"으로 읽힌다. 시트에 '구역 전체'라고 적는다.
//
// ⚠️ 지금 자료가 있는 곳은 **한국·미국·브라질**이다. 다른 나라가 비어 있는 것은
//    "경보가 없어서"가 아니라 "우리가 아직 그 나라 자료를 안 받아서"다.
//    그 차이를 화면에 적지 않으면 조용한 거짓말이 된다.
//    (일본 JMA·독일 DWD 는 지역코드에 좌표가 없어 매핑을 따로 만들어야 한다 — 다음 단계)

import { PointLayer } from './pointLayer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';
import { levelEn } from '../warn.js';

/* 종류별 색. kma-warn 이 이미 색·아이콘을 실어 보내므로 그걸 먼저 쓰고,
   없는 종류만 여기서 채운다. */
const FALLBACK = { icon: '', color: '#fa5252' };

/* 라벨을 붙일 대표 도시 — 특별·광역·특별자치시와 도청 소재지급.
   특보가 전국에 깔리면(폭염철에 실제로 그렇다) 라벨 수백 장이 지도를 덮어
   서로 겹쳐 읽을 수 없게 된다. 라벨은 여기 해당하는 구역만 붙이고
   나머지는 점만 남긴다 — 탭하면 정보 시트에 이름이 그대로 나온다.
   ⚠️ 구역 이름은 기상청 특보구역명("서울", "경기도 남부", "백령도" 식)이라
      완전일치가 아니라 포함으로 본다. '광주'는 광역시와 경기 광주가 같이
      걸리지만, 라벨이 하나 더 붙는 쪽이 빠지는 쪽보다 낫다. */
const MAJOR_KR = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '수원', '춘천', '청주', '전주', '목포', '포항', '창원', '제주', '강릉'];

/** 수준 → 점 크기. 주의보보다 경보가 커야 한눈에 읽힌다. */
const SIZE = { 1: 4.2, 2: 5.6, 3: 7.2 };

export const alerts = {
  layer: null,
  meta: null,

  init() {
    this.layer = new PointLayer({
      id: 'alerts',
      color: FALLBACK.color,
      radius: 5,
      cluster: true,          // 한국만 400건 가까이 된다
      /* ⚠️ 전지구 화면에서도 보여야 한다.
         PointLayer 는 기본적으로 **국가급으로 확대해야** 점을 보여주는데,
         경보는 "지구 어디가 지금 위험한가"를 한눈에 보는 게 목적이라
         확대하기 전에 안 보이면 레이어를 켠 의미가 없다.
         (실측: 이걸 빼먹어 ds.show=false 로 378건이 통째로 안 보였다.) */
      globalOK: () => true,
    });
    return this.layer;
  },

  async refresh() {
    const ko = i18n.lang === 'ko';
    const items = [];
    const sources = [];
    let noCoords = 0;

    /* ── 한국 기상특보 ─────────────────────────────────── */
    try {
      const r = await fetch(`${API.EVENTS}/kma-warn.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      sources.push({ name: j.source, license: j.license, count: j.activeCount });

      /* ⚠️ 같은 구역에 특보가 여러 개 걸리는 일은 흔하다 (폭염+열대야).
         구역 좌표가 같으니 특보마다 엔티티를 만들면 라벨이 정확히 겹쳐
         글자가 뭉개진다 (실제 신고: "폭염"과 "열대야"가 "열폭염야" 덩어리로 보임).
         → 구역당 엔티티 하나로 합치고, 종류는 줄바꿈으로 위아래 나열한다.
           Cesium 라벨은 \n 멀티라인을 지원하고 배경 알약도 전체를 덮는다. */
      const byRegion = new Map();
      (j.active || []).forEach(w => {
        if (w.lat == null || w.lon == null) { noCoords++; return; }
        const g = byRegion.get(w.regionId);
        if (g) g.warns.push(w);
        else byRegion.set(w.regionId, { region: w.region, lat: w.lat, lon: w.lon, warns: [w] });
      });

      byRegion.forEach((g, regionId) => {
        g.warns.sort((a, b) => b.levelRank - a.levelRank);   // 심한 것이 첫 줄 — 색·크기도 그걸 따른다
        const top = g.warns[0];
        const d = {};
        d[ko ? '종류' : 'Type'] = g.warns
          .map(w => (ko ? `${w.kind}${w.level}` : `${w.kindEn || w.kind} ${levelEn(w.level)}`))
          .join(' · ');
        d[ko ? '구역' : 'Zone'] = g.region;
        if (top.effectiveKst) d[ko ? '발효(KST)' : 'From (KST)'] = fmt(top.effectiveKst);
        // ⚠️ 구역 경보임을 반드시 적는다. 점 하나로 오해하면 안 된다.
        d[ko ? '범위' : 'Extent'] = ko ? '구역 전체 (표시는 대표 지점)' : 'Whole zone (shown at a representative point)';
        d[ko ? '출처' : 'Source'] = j.source;
        items.push({
          id: `kr-${regionId}`,
          lat: g.lat, lon: g.lon,
          name: g.warns
            .map(w => `${w.icon || FALLBACK.icon} ${ko ? w.kind : (w.kindEn || w.kind)}`)
            .join('\n'),
          // 라벨은 대표 도시만 — 나머지 구역은 점만 (위 MAJOR_KR 머리말 참고)
          noLabel: !MAJOR_KR.some(n => (g.region || '').includes(n)),
          color: top.color || FALLBACK.color,
          radius: SIZE[top.levelRank] || 5,
          data: d,
        });
      });
    } catch (e) {
      console.warn('[경보] 한국 —', e.message);
    }

    /* ── 그 밖의 나라 (지금은 브라질 INMET) ─────────────── */
    try {
      const r = await fetch(`${API.EVENTS}/regional.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const w = (j.items || []).filter(x => x.kind === 'warning');
      if (w.length) sources.push({ name: 'INMET (브라질 기상청)', count: w.length });
      w.forEach((x, i) => {
        if (x.lat == null || x.lon == null) { noCoords++; return; }
        const d = {};
        d[ko ? '종류' : 'Type'] = ko ? '기상경보' : 'Weather warning';
        if (x.severity) d[ko ? '심각도' : 'Severity'] = x.severity;
        if (x.place) d[ko ? '지역' : 'Area'] = x.place;
        if (x.start) d[ko ? '시작' : 'From'] = String(x.start).slice(0, 16).replace('T', ' ');
        d[ko ? '범위' : 'Extent'] = ko ? '구역 전체 (표시는 중심점)' : 'Whole area (shown at centre)';
        d[ko ? '출처' : 'Source'] = x._src;
        items.push({
          id: `br-${i}`, lat: x.lat, lon: x.lon,
          name: ` ${ko ? '기상경보' : 'Warning'}`,
          color: '#ffd166', radius: 5.4, data: d,
        });
      });
    } catch (e) {
      console.warn('[경보] 지역 —', e.message);
    }

    /* ── 미국 (NWS) ─────────────────────────────────────── */
    try {
      const r = await fetch(`${API.EVENTS}/world-alerts.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (j.count) sources.push({ name: j.source, license: j.license, count: j.count });
      (j.alerts || []).forEach((a, i) => {
        if (a.lat == null || a.lon == null) { noCoords++; return; }
        const d = {};
        d[ko ? '종류' : 'Type'] = ko ? a.kind : a.kindEn;
        if (a.severity) d[ko ? '수준' : 'Severity'] = a.severity;
        if (a.area) d[ko ? '지역' : 'Area'] = a.area;
        if (a.expires) d[ko ? '해제예정' : 'Expires'] = String(a.expires).slice(0, 16).replace('T', ' ');
        d[ko ? '범위' : 'Extent'] = ko ? '구역 전체 (표시는 대표 지점)' : 'Whole zone (representative point)';
        d[ko ? '출처' : 'Source'] = a._src;
        items.push({
          id: `us-${i}`, lat: a.lat, lon: a.lon,
          name: `${a.icon} ${ko ? a.kind : a.kindEn}`,
          color: a.color, radius: SIZE[a.rank] || 5,
          data: d,
        });
      });
      /* ⚠️ 아직 좌표를 못 받은 경보가 있으면 그 수를 남긴다.
         지도에 없는 것을 '없는 일'로 만들면 안 된다. */
      if (j.unplaced) noCoords += j.unplaced;
    } catch (e) {
      console.warn('[경보] 미국 —', e.message);
    }

    // 종류별 집계 — 화면에서 "무엇이 몇 건"을 말할 수 있게
    const byKind = {};
    items.forEach(it => {
      const k = (it.data[ko ? '종류' : 'Type']) || '?';
      byKind[k] = (byKind[k] || 0) + 1;
    });

    this.meta = {
      sources, byKind, count: items.length, noCoords,
      /* ⚠️ 어디까지 덮는지 분명히 적는다. 비어 있는 나라는 '경보가 없다'가 아니다. */
      coverage: ko
        ? '자료 범위 · 한국 기상청 · 미국 NWS · 브라질 INMET'
        : 'Coverage · Korea KMA · United States NWS · Brazil INMET',
    };
    this.layer.setData(items);
    return items.length;
  },
};

/** 20260727 1100 → 27일 11:00 */
function fmt(t) {
  const s = String(t || '');
  return s.length >= 12 ? `${+s.slice(6, 8)}일 ${s.slice(8, 10)}:${s.slice(10, 12)}` : s;
}
