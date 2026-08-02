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
import { bubbleImage } from '../newsbubble.js';

/* 뉴스 성격 → 색. **말풍선 테두리 색이 여기서 나온다** (받은 요청).
   ⚠️ 'DIS'(재난)가 빠져 있어서 재난 보도가 시위와 같은 노랑으로 떨어지고 있었다.
      ui-events.js 는 '#ff8a3c' 를 쓰고 있어 지도와 목록의 색이 서로 달랐다 —
      같은 값으로 맞춘다. 색이 곧 분류인데 두 화면이 다르면 분류가 거짓말이 된다. */
const KIND_COLOR = {
  DIS:  '#ff8a3c',   // 재난
  '14': '#ffd166',   // 시위
  '13': '#ffb84d',   // 위협
  '15': '#ff9f45',   // 무력 과시
  '17': '#ff8a65',   // 강압
  '18': '#ff5d5d',   // 공격
  '19': '#ff4d4d',   // 교전
  '20': '#e03131',   // 대규모 폭력
};

/* ⚠️⚠️ 말풍선을 몇 개까지 다나 — 이 숫자를 함부로 올리지 말 것.
   같은 날(2026-08-02) 새벽 발열의 원인이 **라벨 2,843개 동시 표시**였다.
   말풍선은 라벨보다 무겁다: 사건마다 글자가 달라 캐시가 안 되고 하나가 텍스처 한 장이다.
   확정 사건을 신뢰도 순으로 정렬해 위에서 이만큼만 단다. 나머지는 점으로 남는다.
   ⚠️ 미확정에는 절대 달지 않는다 — 말풍선은 라벨보다 강한 표시라
      "확인된 사건"으로 읽힌다. 이 레이어의 존재 이유(거르기)와 어긋난다. */
const BUBBLE_MAX = 12;
/* 말풍선이 보이는 거리. 전지구에서 12개가 다 뜨면 지구를 덮는다. */
const BUBBLE_FAR = 14_000_000;
/* 말풍선끼리 최소 간격(도).
   ⚠️ Cesium 은 겹친 표시를 밀어내 주지 않는다. 워싱턴 근처 사건 3건이 정확히
      포개져 글자가 통째로 뭉갠 화면을 보고 넣은 규칙이다.
      가까운 사건은 신뢰도가 높은 쪽만 말풍선을 갖고, 나머지는 라벨로 내려간다.
   ⚠️ 화면 좌표가 아니라 위경도로 재는 근사다 — 줌에 따라 완벽하지는 않지만,
      "읽을 수 있는 것 몇 개"가 "못 읽는 것 여러 개"보다 낫다. */
const BUBBLE_MIN_SEP_DEG = 6;

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

    /* 말풍선을 달 사건 고르기 — 확정 중 신뢰도 높은 순으로, **서로 떨어진 것만**.
       ⚠️ 정렬을 원본 배열에 하지 않는다(list 는 시트가 그대로 쓴다). */
    const picked = [];
    this.list.filter(e => e.status === 'confirmed')
      .slice()
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .forEach(e => {
        if (picked.length >= BUBBLE_MAX) return;
        // 이미 고른 말풍선과 너무 가까우면 건너뛴다 (겹쳐서 못 읽는다)
        const tooClose = picked.some(p =>
          Math.abs(p.lat - e.lat) < BUBBLE_MIN_SEP_DEG &&
          Math.abs(p.lon - e.lon) < BUBBLE_MIN_SEP_DEG);
        if (!tooClose) picked.push(e);
      });
    const bubbleIds = new Set(picked.map(e => e.id));

    this.list.forEach(e => {
      const confirmed = e.status === 'confirmed';
      const col = Cesium.Color.fromCssColorString(KIND_COLOR[e.root] || '#ffd166');
      const withBubble = bubbleIds.has(e.id);

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
        /* 말풍선을 다는 사건은 라벨을 달지 않는다 — 같은 말이 두 번 뜬다.
           라벨은 확정이면서 말풍선을 못 받은 사건에만.
           ⚠️ 미확정에 이름을 달면 "확인된 사건"처럼 읽힌다. */
        ...(confirmed && !withBubble ? {
          /* ⚠️ 외곽선 라벨을 쓰지 않는다 — 한글이 뭉갱진다.
             "시위·집회" 가 읽을 수 없는 덩어리로 나온 게 이 스타일이었다.
             maplabel.js 머리말에 이유를 적어뒀다. */
          label: mapLabel({
            text: ko ? e.kindKo : e.kindEn,
            color: col, size: 'sm', offsetY: -18,
            maxDistance: 30_000_000,
          }),
        } : {}),
        /* ── 말풍선 ──────────────────────────────────────────
           ⚠️ 꼬리 끝이 사건 좌표에 닿아야 한다 → verticalOrigin BOTTOM.
           ⚠️ disableDepthTestDistance 를 Infinity 로 주지 않는다 —
              지구 반대편 말풍선이 뚫고 보인다 (pin.js·maplabel.js 와 같은 함정). */
        ...(withBubble ? (() => {
          const img = bubbleImage({
            kind: ko ? e.kindKo : e.kindEn,
            /* 제목이 없는 사건이 있다(GKG 매칭 실패). 그럴 땐 장소로 대신한다 —
               빈 말풍선을 띄우지 않는다. ⚠️ 본문·요약은 넣지 않는다(저작권). */
            title: e.title || e.place || '',
            color: KIND_COLOR[e.root] || '#ffd166',
          });
          return {
            billboard: {
              image: img.url, width: img.w, height: img.h,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              disableDepthTestDistance: 600_000,
              distanceDisplayCondition:
                new Cesium.DistanceDisplayCondition(0, BUBBLE_FAR),
            },
          };
        })() : {}),
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
