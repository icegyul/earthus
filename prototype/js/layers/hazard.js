// 재난 레이어 — 지진(USGS 실시간 + 일본은 JMA 대조) + 화산
import { PointLayer } from './pointLayer.js';
import { API, C, GLOBAL_EVENT } from '../config.js';
import { i18n } from '../i18n.js';
import { jma, inJapan, distKm } from '../jma.js';

/* ══════════════════════════════════════════════════════════════
   지진 — USGS 실시간 GeoJSON (인증 불필요, CORS 허용)
   §5-10 이벤트 예외: 규모 6.5+ 만 전지구 뷰에 노출
   ══════════════════════════════════════════════════════════════ */
export const quakes = {
  layer: null,
  lastFetch: 0,
  raw: [],

  init() {
    this.layer = new PointLayer({
      id: 'quake',
      color: C.red,
      radius: 6,
      pulse: true,
      cluster: false,                                  // 이벤트는 클러스터하지 않음
      globalOK: m => m.data._mag >= GLOBAL_EVENT.QUAKE_MAG,
    });
    return this.layer;
  },

  /** 규모에 따라 점 크기 — 시각적 중요도 */
  _radius(mag) { return Math.max(4, Math.min(16, (mag - 2) * 2.6)); },
  _color(mag) {
    if (mag >= 6.5) return '#ff3b3b';
    if (mag >= 5.0) return '#ff7a45';
    if (mag >= 4.0) return '#ffab40';
    return '#ffd166';
  },

  async refresh() {
    const res = await fetch(API.QUAKE_DAY);
    if (!res.ok) throw new Error('usgs ' + res.status);
    const j = await res.json();
    this.raw = j.features;

    /* ⚠️ 지진은 발생 후 하루만 보여준다.
       all_day 피드가 이미 24시간치지만, 갱신 지연으로 오래된 게 섞일 수 있어
       시각으로 한 번 더 거른다. 며칠 전 지진이 계속 떠 있으면
       "지금 일어난 일"이라는 신호가 흐려진다. */
    const DAY = 24 * 3600_000;
    const now = Date.now();
    const items = j.features
      .filter(f => f.properties.mag != null && f.properties.mag >= 2.5)
      .filter(f => now - f.properties.time <= DAY)
      .map(f => {
        const [lon, lat, depth] = f.geometry.coordinates;
        const mag = f.properties.mag;
        return {
          id: f.id,
          name: `M ${mag.toFixed(1)}`,
          lat, lon,
          kind: 'quake',
          color: this._color(mag),
          radius: this._radius(mag),
          /* 파문은 규모 4 이상에 준다. 그 아래까지 주면 화면이 파문투성이가 된다.
             퍼지는 반경도 규모에 따라 키운다 — 큰 지진이 크게 보여야 한다.
             M4 ≈ 90km, M6 ≈ 360km, M8 ≈ 1,400km (규모는 로그 척도라 지수로 키운다) */
          pulse: mag >= 4.0,
          rippleKm: Math.min(1600, Math.round(22 * Math.pow(2, mag - 3))),
          data: {
            _mag: mag,
            _time: f.properties.time,
            _url: f.properties.url,
            // 단층 메커니즘은 요약 피드에 없다. 상세 API 를 따로 불러야 한다 (faultmech.js)
            _detail: f.properties.detail,
            [i18n.t.F.mag]: `M ${mag.toFixed(1)}`,
            [i18n.t.F.depth]: `${depth.toFixed(0)} km`,
            [i18n.t.F.place]: f.properties.place || '—',
            [i18n.t.F.time]: i18n.rel(f.properties.time),
          },
        };
      })
      .sort((a, b) => b.data._mag - a.data._mag);

    /* 일본 근해는 기상청(JMA) 발표로 대조한다.
       실패해도 지진 표시 자체는 계속돼야 하므로 조용히 넘어간다. */
    try { await this._crossCheckJapan(items); }
    catch (e) { console.warn('[jma]', e.message); }

    this.layer.setData(items);
    this.lastFetch = Date.now();
    return items;
  },

  /**
   * USGS 해와 일본 기상청 해를 맞춰본다.
   *
   * 왜 JMA 를 정본으로 삼는가
   *   USGS 는 전 지구를 고르게 보는 대신 특정 나라 안에서는 그 나라 관측망보다
   *   진앙이 부정확하다. 일본은 관측점이 수백 개다.
   *   실측(30일, USGS M4.5+ 일본권 40건 중 25건 대조 성공):
   *     진앙 차이 3~35 km (중앙값 약 14 km), 규모 차이 최대 0.4
   *   즉 "둘 중 하나가 틀린" 게 아니라 관측망이 달라 나는 정상적인 차이다.
   *   다만 일본 안에서 어디였는지를 말할 때는 JMA 가 맞다.
   *
   * ⚠️ 대조가 안 되는 지진도 많다 (쿠릴·이즈·오가사와라 등).
   *    JMA 의 震源・震度情報 는 일본에서 진도가 관측된 지진만 낸다.
   *    그럴 땐 USGS 값을 그대로 두고, "대조 없음"이라고 밝힌다.
   */
  async _crossCheckJapan(items) {
    const targets = items.filter(m => inJapan(m.lat, m.lon));
    if (!targets.length) return;
    await jma.load();
    const ko = i18n.lang === 'ko';

    for (const m of targets) {
      const j = jma.match({ lat: m.lat, lon: m.lon, time: m.data._time });
      if (!j) {
        m.data._jma = { checked: true, found: false };
        continue;
      }
      const usgs = { lat: m.lat, lon: m.lon, mag: m.data._mag };

      // 진앙을 JMA 해로 옮긴다 — 일본 안에서는 이게 정본이다
      m.lat = j.lat; m.lon = j.lon;
      if (j.mag != null) {
        m.data._mag = j.mag;
        m.name = `M ${j.mag.toFixed(1)}`;
        m.color = this._color(j.mag);
        m.radius = this._radius(j.mag);
        m.data[i18n.t.F.mag] = `M ${j.mag.toFixed(1)}`;
      }
      if (j.depth != null) m.data[i18n.t.F.depth] = `${j.depth.toFixed(0)} km`;
      if (j.placeEn || j.placeJa) {
        m.data[i18n.t.F.place] = ko ? (j.placeJa || j.placeEn) : (j.placeEn || j.placeJa);
      }
      // 진도 — 일본에서 실제로 중요한 값. USGS 피드에는 없다.
      const sh = jma.shindoText(j.shindo, ko);
      if (sh) m.data[ko ? '최대 진도' : 'Max intensity'] = sh;

      m.data._jma = {
        checked: true, found: true,
        usgs, jma: { lat: j.lat, lon: j.lon, mag: j.mag, depth: j.depth },
        distKm: distKm(usgs, j),
        placeJa: j.placeJa, placeEn: j.placeEn,
      };
    }
  },

  /** 전지구 노출 대상 (배너용)
      ⚠️ layer 가 아직 없을 수 있다 — registry.init() 은 비동기고,
         배너는 그보다 먼저 그려질 수 있다. 여기서 터지면 배너 전체가 죽는다.
         (wildfire.headline 은 원래 이렇게 쓰고 있었다. 여기만 빠져 있었다.) */
  headline() {
    const items = this.layer?.items || [];
    const big = items.filter(m => m.data?._mag >= GLOBAL_EVENT.QUAKE_MAG);
    return big.length ? big[0] : null;
  },
};

/* ══════════════════════════════════════════════════════════════
   화산 — 주요 활화산 정적 데이터
   실시간 분화 상태는 Smithsonian GVP → CORS 미허용이라 프록시 필요
   ══════════════════════════════════════════════════════════════ */
const VOLCANOES = [
  ['백두산',      41.993, 128.078, '성층화산', '1903'],
  ['후지산',      35.361, 138.727, '성층화산', '1707'],
  ['사쿠라지마',  31.585, 130.657, '성층화산', '진행 중'],
  ['아소산',      32.884, 131.104, '칼데라',   '2021'],
  ['운젠',        32.761, 130.299, '성층화산', '1996'],
  ['탐보라',      -8.250, 118.000, '성층화산', '1967'],
  ['크라카타우', -6.102, 105.423, '칼데라',   '2023'],
  ['메라피',     -7.540, 110.446, '성층화산', '진행 중'],
  ['피나투보',   15.130, 120.350, '성층화산', '1993'],
  ['마욘',       13.257, 123.685, '성층화산', '2023'],
  ['타알',       14.002, 120.993, '칼데라',   '2022'],
  ['에트나',     37.748,  14.999, '성층화산', '진행 중'],
  ['베수비오',   40.821,  14.426, '성층화산', '1944'],
  ['스트롬볼리', 38.789,  15.213, '성층화산', '진행 중'],
  ['산토리니',   36.404,  25.396, '칼데라',   '1950'],
  ['에이야퍄들라', 63.633, -19.633, '성층화산', '2010'],
  ['그림스보튼', 64.416, -17.333, '칼데라',   '2011'],
  ['킬라우에아', 19.421,-155.287, '순상화산', '진행 중'],
  ['마우나로아', 19.475,-155.608, '순상화산', '2022'],
  ['세인트헬렌스',46.200,-122.180, '성층화산', '2008'],
  ['레이니어',   46.853,-121.760, '성층화산', '1894'],
  ['포포카테페틀',19.023, -98.622, '성층화산', '진행 중'],
  ['후에고',     14.473, -90.880, '성층화산', '진행 중'],
  ['코토팍시',   -0.677, -78.436, '성층화산', '2023'],
  ['비야리카',  -39.420, -71.930, '성층화산', '2023'],
  ['네바도델루이스',4.892,-75.324,'성층화산', '진행 중'],
  ['에레보스',  -77.530, 167.170, '성층화산', '진행 중'],
  ['니라공고',   -1.520,  29.250, '성층화산', '2021'],
  ['킬리만자로', -3.066,  37.355, '성층화산', '휴화산'],
  ['테이데',     28.271, -16.641, '성층화산', '1909'],
];

/* 화산 종류별 분화 양상 — "이 화산이 터지면 어떻게 되는가".
   ⚠️ 화산학의 표준 분류다. 종류에 따라 위험의 성격이 완전히 다르다. */
const VOLCANO_KIND = {
  '성층화산': {
    ko: '용암과 화산재가 층층이 쌓여 만들어진 원뿔형 화산입니다. 끈적한 마그마가 가스를 가두고 있다가 한꺼번에 터지기 때문에 폭발이 격렬하고, 화산재가 성층권까지 올라가 항공기 운항을 막기도 합니다.',
    en: 'A cone built from alternating lava and ash layers. Its sticky magma traps gas, so eruptions are explosive and ash can reach the stratosphere, grounding aircraft.' },
  '순상화산': {
    ko: '묽은 용암이 넓게 흘러 방패를 엎어놓은 모양이 된 화산입니다. 폭발은 약한 대신 용암이 멀리까지 흘러갑니다. 하와이 킬라우에아가 대표적입니다.',
    en: 'A broad, shield-shaped volcano from runny lava. Eruptions are gentle but lava travels far — Kīlauea is the classic example.' },
  '칼데라': {
    ko: '거대한 분화로 마그마방이 비면서 지붕이 무너져 생긴 함몰 지형입니다. 과거에 매우 큰 분화가 있었다는 뜻이며, 다시 활동하면 규모가 클 수 있습니다.',
    en: 'A collapse basin formed when a huge eruption emptied the magma chamber. Signals a very large past eruption.' },
  '복합화산': {
    ko: '여러 분화구가 겹쳐 자란 화산입니다. 분화 지점이 옮겨 다니는 특징이 있습니다.',
    en: 'Built from multiple overlapping vents; eruption sites can shift over time.' },
};

export const volcanoes = {
  layer: null,
  init() {
    this.layer = new PointLayer({ id: 'volcano', color: C.amber, radius: 6, cluster: true });
    const t = i18n.t.F;
    this.layer.setData(VOLCANOES.map(([n, lat, lon, type, last]) => ({
      id: n, name: n, lat, lon, kind: 'volcano',
      // 분화 중인 화산만 파문 — 전부 주면 "지금 터지는 중"이라는 신호가 죽는다
      pulse: last === '진행 중',
      rippleKm: 180,
      data: {
        /* ⚠️ 파문이 떠서 눌렀는데 "분화 중"만 나오면 무슨 일인지 알 수 없다.
           애니메이션으로 주의를 끌었으면 그만큼 설명해야 한다.
           화산 종류마다 분화 양상이 달라서 그 차이를 알려준다. */
        [i18n.lang === 'ko' ? '지금 상태' : 'Status']: last === '진행 중'
          ? (i18n.lang === 'ko'
              ? '분화가 진행 중입니다. 화면의 퍼지는 원은 이 활동을 표시한 것입니다.'
              : 'Currently erupting — the expanding rings mark this activity.')
          : (i18n.lang === 'ko' ? '현재 분화 활동은 없습니다.' : 'No current eruption.'),
        [i18n.lang === 'ko' ? '이 화산은' : 'This volcano']: VOLCANO_KIND[type]
          ? (i18n.lang === 'ko' ? VOLCANO_KIND[type].ko : VOLCANO_KIND[type].en)
          : (i18n.lang === 'ko' ? '분류 정보가 없습니다.' : 'No classification info.'),
        [t.type]: type,
        [t.lastEruption]: last,
        [t.alert]: last === '진행 중' ? '분화 중' : '정상',
      },
    })));
    return this.layer;
  },
};
