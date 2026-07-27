// 이벤트 뉴스 레이어 — 신뢰도 검증을 통과한 것만 (인수인계 §5-2, §5-3)
//
// ⚠️ 이 레이어의 핵심은 "많이 보여주는 것"이 아니라 "거르는 것"이다.
//    GDELT 는 자동 코딩이라 노이즈가 많다. 실측으로 3시간에 원본 7,120건이 들어오는데
//    그중 확정 등급은 17건뿐이다. 나머지를 그대로 뿌리면 지구가 점으로 덮이고,
//    틀린 사건 하나가 앱 전체의 신뢰를 깎는다.
//
// 확정 / 미확정을 시각적으로 반드시 구분한다 (§5-2 "미확정/확정 2단계 표시 분리").
//   확정   — 진하게, 라벨 표시
//   미확정 — 흐리게, 라벨 없음, 확대해야 보임
// 미확정을 확정처럼 보여주면 안 된다. 그게 이 레이어를 만든 이유다.

import { viewer } from '../viewer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';
import { mapLabel } from '../maplabel.js';

const KIND_COLOR = {
  '14': '#ffd166',   // 시위
  '13': '#ff9f45',   // 위협
  '15': '#ff9f45',   // 무력 과시
  '17': '#ff8a65',   // 강압
  '18': '#ff5d5d',   // 공격
  '19': '#ff4d4d',   // 교전
  '20': '#e03131',   // 대규모 폭력
};

export const events = {
  ds: null,
  list: [],
  meta: null,

  init() {
    this.ds = new Cesium.CustomDataSource('events');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    return this;
  },

  set(on) { if (this.ds) this.ds.show = on; },

  async refresh() {
    const r = await fetch(`${API.EVENTS}/global.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error('events ' + r.status);
    const j = await r.json();
    this.meta = {
      generated: j.generated, source: j.source,
      windowHours: j.windowHours, counts: j.counts, rules: j.rules,
    };
    this.list = j.events || [];
    this.draw();
    return this.list;
  },

  draw() {
    this.ds.entities.removeAll();
    const ko = i18n.lang === 'ko';

    this.list.forEach(e => {
      const confirmed = e.status === 'confirmed';
      const col = Cesium.Color.fromCssColorString(KIND_COLOR[e.root] || '#ffd166');

      this.ds.entities.add({
        id: `ev:${e.id}`,
        position: Cesium.Cartesian3.fromDegrees(e.lon, e.lat),
        point: {
          // 확정은 크고 진하게, 미확정은 작고 흐리게 — 한눈에 구분돼야 한다
          pixelSize: confirmed ? 9 : 5,
          color: col.withAlpha(confirmed ? 0.92 : 0.4),
          outlineColor: Cesium.Color.WHITE.withAlpha(confirmed ? 0.75 : 0.2),
          outlineWidth: confirmed ? 2 : 1,
          disableDepthTestDistance: 600_000,
          /* 미확정은 가까이 와야 보인다.
             전지구에서 미확정까지 다 뜨면 노이즈가 화면을 덮는다. */
          distanceDisplayCondition: confirmed
            ? undefined
            : new Cesium.DistanceDisplayCondition(0, 6_000_000),
        },
        // 라벨은 확정에만 — 미확정에 이름을 달면 "확인된 사건"처럼 읽힌다
        ...(confirmed ? {
          /* ⚠️ 외곽선 라벨을 쓰지 않는다 — 한글이 뭉갱진다.
             "시위·집회" 가 읽을 수 없는 덩어리로 나온 게 이 스타일이었다.
             maplabel.js 머리말에 이유를 적어뒀다. */
          label: mapLabel({
            text: ko ? e.kindKo : e.kindEn,
            color: col, size: 'sm', offsetY: -18,
            maxDistance: 30_000_000,
          }),
        } : {}),
        _meta: {
          id: `ev-${e.id}`, kind: 'newsevent',
          name: ko ? e.kindKo : e.kindEn,
          lat: e.lat, lon: e.lon, _ev: e,
        },
        _layer: 'news',
      });
    });
  },

  /** 정보 시트용 — 점수가 왜 그렇게 나왔는지까지 보여준다 */
  detail(e) {
    const ko = i18n.lang === 'ko';
    const d = {};
    d[ko ? '분류' : 'Type'] = ko ? e.kindKo : e.kindEn;
    d[ko ? '위치' : 'Place'] = e.place || '—';
    d[ko ? '신뢰도' : 'Credibility'] = `${e.score}/100 · ` + (e.status === 'confirmed'
      ? (ko ? '확정' : 'Confirmed') : (ko ? '미확정' : 'Unconfirmed'));
    d[ko ? '교차 검증' : 'Cross-checked'] = ko
      ? `${e.sources}개 매체 · ${e.mentions}회 언급`
      : `${e.sources} sources · ${e.mentions} mentions`;
    if (e.merged > 1) d[ko ? '통합된 보도' : 'Merged reports'] = `${e.merged}건`;
    d[ko ? '경과' : 'Age'] = e.ageMin < 60
      ? `${e.ageMin}${ko ? '분 전' : ' min ago'}`
      : `${Math.round(e.ageMin / 60)}${ko ? '시간 전' : ' h ago'}`;
    return { title: ko ? e.kindKo : e.kindEn, rows: d };
  },
};
