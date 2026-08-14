// 산불 — NASA FIRMS 위성 열점 (Lambda 가 30분마다 묶어서 올린다)
//
// 왜 이 레이어가 필요했나
//   뉴스로 산불을 추정하던 게 문제였다. GDELT 가 "소방대가 불길과 사투(battle)" 를
//   무력 충돌로 코딩해서 프랑스·스페인 대형 산불이 "교전"으로 표시됐다.
//   불은 위성이 직접 본다. 추정 대신 관측을 쓴다.
//
// 크기 = FRP(화재복사강도, MW). 개수가 아니라 이걸 봐야 "얼마나 큰 불인가"를 안다.
//
// ⚠️ 열점 = 산불이 아니다. 화산·가스플레어·화전도 잡힌다.
//    구름에 가리면 안 보이고, 위성이 지나갈 때만 본다.
//    "탐지 없음"은 "불이 없음"이 아니다 — 내부 판정에서만 이 한계를 지킨다.

import { PointLayer } from './pointLayer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';

/* FRP 구간별 색·크기.
   ⚠️ 임의로 정한 게 아니라 실측 분포를 보고 나눴다.
      전지구 3,943건 중 대부분은 수백 MW, 상위 몇 건이 5만 MW 다 (로그 분포). */
function grade(frp) {
  if (frp >= 10000) return { ko: '매우 큼', en: 'Very large', color: '#ff2d2d', r: 15 };
  if (frp >= 3000)  return { ko: '큼',      en: 'Large',      color: '#ff5d1f', r: 12 };
  if (frp >= 800)   return { ko: '중간',    en: 'Moderate',   color: '#ff9a3c', r: 9 };
  if (frp >= 200)   return { ko: '작음',    en: 'Small',      color: '#ffc65c', r: 6.5 };
  return                   { ko: '열점',    en: 'Hotspot',    color: '#ffe08a', r: 4.5 };
}

export const wildfires = {
  layer: null,
  meta: null,

  init() {
    this.layer = new PointLayer({
      id: 'wildfire',
      color: '#ff7a2f',
      radius: 6,
      cluster: false,          // 이미 Lambda 가 묶었다. 또 묶으면 규모가 흐려진다
      /* 아주 큰 불은 전지구 뷰에서도 보인다.
         지진의 규모 임계와 같은 취지 — 세계적 사건은 멀리서도 알아야 한다. */
      globalOK: m => m.data._frp >= 5000,
    });
    return this.layer;
  },

  async refresh() {
    const r = await fetch(`${API.EVENTS}/wildfire.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('wildfire ' + r.status);
    const j = await r.json();
    this.meta = {
      generated: j.generated, source: j.source, credit: j.credit,
      detections: j.detections, fires: j.fires, shown: j.shown,
    };
    const ko = i18n.lang === 'ko';

    const items = (j.items || []).map((f, i) => {
      const g = grade(f.frp);
      const d = {};
      d[ko ? '규모' : 'Size'] = `${ko ? g.ko : g.en} · ${Math.round(f.frp).toLocaleString()} MW`;
      d[ko ? '화선 길이' : 'Fire front'] = `${f.spanKm} km`;
      d[ko ? '탐지 픽셀' : 'Detections'] = ko
        ? `${f.count}개 (고신뢰 ${f.highConf}개)`
        : `${f.count} (${f.highConf} high-confidence)`;
      d[ko ? '최근 관측' : 'Last seen'] = `${f.date} ${String(f.time).padStart(4, '0').replace(/(\d\d)(\d\d)/, '$1:$2')} UTC`;
      d[ko ? '위성' : 'Satellite'] = (f.sats || []).join(', ');
      /* 추적 정보 — 서버가 지속 ID 로 이어준 결과.
         ⚠️ "같은 불"이라는 것은 거리·시간에 근거한 **추정**이다. 단정하지 않는다. */
      if (f.seenCount > 1) {
        d[ko ? '추적' : 'Tracked'] = ko
          ? `${f.seenCount}회 연속 관측` : `seen ${f.seenCount} times`;
        if (f.firstSeen) {
          d[ko ? '처음 확인' : 'First seen'] = f.firstSeen.slice(0, 16).replace('T', ' ') + ' UTC';
        }
        if (f.movedKm != null && f.movedKm > 0) {
          d[ko ? '중심 이동' : 'Centre moved'] = `${f.movedKm} km`;
        }
        if (f.peakFrp && f.peakFrp > f.frp) {
          d[ko ? '최대 세기' : 'Peak'] = `${Math.round(f.peakFrp).toLocaleString()} MW`;
        }
      }
      // 시트가 지명을 붙여준다 (ui.js 의 _place)
      return {
        /* ⚠️ id 를 순번(fire-0)으로 쓰면 갱신 때마다 다른 불을 가리킨다.
           서버가 지속 ID(fid)를 붙이므로 그걸 쓴다 — 같은 불은 계속 같은 id 다. */
        id: f.fid ? `fire-${f.fid}` : `fire-${i}`,
        name: `${Math.round(f.frp).toLocaleString()} MW`,
        lat: f.lat, lon: f.lon,
        kind: 'wildfire',
        /* 위성 영상은 **위성이 실제로 본 날짜**로 요청한다 (당일 영상은 아직
           안 올라왔을 수 있다 — 실측으로 확인). FIRMS 의 date 를 그대로 쓴다. */
        _date: f.date,
        _fid: f.fid || null,
        color: g.color,
        radius: g.r,
        pulse: f.frp >= 3000,                 // 큰 불만 파문 — 다 주면 화면이 덮인다
        rippleKm: Math.min(400, 40 + f.frp / 40),
        _place: true,
        data: { _frp: f.frp, _note: true, ...d },
      };
    });

    this.layer.setData(items);
    return items;
  },

  /** 지금 가장 큰 불 (배너·이벤트 목록용) */
  headline() {
    const it = this.layer?.items || [];
    return it.length && it[0].data._frp >= 10000 ? it[0] : null;
  },
};
