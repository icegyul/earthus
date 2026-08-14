// 쓰나미 경보 (NOAA / NWS)
//
// ⚠️ 이 레이어는 다른 것과 성격이 다르다. 사람 목숨이 걸린 정보다.
//    · 경보가 없을 때 "없음"을 확실히 보여줘야 한다 (조용히 비어 있으면 장애와 구분이 안 된다)
//    · 등급을 임의로 바꾸지 않는다. NWS 가 쓰는 4단계를 그대로 옮긴다.
//    · 우리가 판단을 더하지 않는다. 기관 원문으로 바로 연결한다.
//
// NWS 경보 API 는 CORS 가 열려 있어 프록시가 필요 없다 (실측 확인).
// 다만 미국 관할(태평양·대서양·카리브) 중심이다. 전 세계 모든 쓰나미를 덮지는 못한다.

import { viewer } from '../viewer.js';
import { API } from '../config.js';
import { fetchT } from '../net.js';
import { i18n } from '../i18n.js';
import { mapLabel } from '../maplabel.js';

/* NWS 4단계. 위→아래로 위험도가 낮아진다.
   ⚠️ 번역을 임의로 만들지 않았다. 기상청·NWS 가 쓰는 대응어를 그대로 썼다. */
const LEVEL = {
  'Tsunami Warning':    { ko: '쓰나미 경보',    en: 'Tsunami Warning',    color: '#ff3b30', rank: 4 },
  'Tsunami Advisory':   { ko: '쓰나미 주의보',  en: 'Tsunami Advisory',   color: '#ff9500', rank: 3 },
  'Tsunami Watch':      { ko: '쓰나미 예비특보', en: 'Tsunami Watch',      color: '#ffcc00', rank: 2 },
  'Tsunami Information Statement': { ko: '쓰나미 정보', en: 'Tsunami Information', color: '#5ac8fa', rank: 1 },
};

export const tsunami = {
  ds: null,
  list: [],
  checkedAt: null,

  init() {
    this.ds = new Cesium.CustomDataSource('tsunami');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    return this;
  },

  set(on) { if (this.ds) this.ds.show = on; },

  /* 국제 경보(PTWC/NTWC) 등급 → 우리 LEVEL 로.
     ⚠️ 우리가 등급을 다시 매기지 않는다. 센터가 쓴 Category 를 그대로 대응시킨다.
        'Unknown' 은 Lambda 가 파싱에 실패했다는 뜻이므로 낮은 등급으로 묻지 않는다. */
  _intlLevel(cat) {
    const c = String(cat || '').toLowerCase();
    if (c === 'warning') return LEVEL['Tsunami Warning'];
    if (c === 'advisory') return LEVEL['Tsunami Advisory'];
    if (c === 'watch') return LEVEL['Tsunami Watch'];
    if (c === 'information') return LEVEL['Tsunami Information Statement'];
    return { ko: '쓰나미 (등급 확인 필요)', en: 'Tsunami (check bulletin)',
             color: '#ff9500', rank: 3 };
  },

  async refresh() {
    const events = Object.keys(LEVEL).map(encodeURIComponent).join(',');
    /* 두 소스를 함께 본다.
         NWS      — 미국 국내 경보. CORS 열려 있어 직접 부른다.
         PTWC/NTWC — 태평양·카리브 전역. CORS 가 없어 Lambda 가 5분마다 S3 에 올린다.
       ⚠️ 국제 것을 빼면 일본·필리핀·칠레 앞바다 쓰나미가 아예 안 뜬다.
          "전 세계를 보여주는 앱"에서 그건 기능이 없는 것과 같다. */
    const [nws, intl] = await Promise.allSettled([
      fetchT(`${API.NWS_ALERTS}?event=${events}&status=actual`).then(r => {
        if (!r.ok) throw new Error('nws ' + r.status);
        return r.json();
      }),
      fetch(`${API.EVENTS}/tsunami-intl.json`, { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);

    if (nws.status !== 'fulfilled' && !(intl.status === 'fulfilled' && intl.value)) {
      throw new Error(nws.reason?.message || 'tsunami sources unavailable');
    }
    const j = nws.status === 'fulfilled' ? nws.value : { features: [] };
    this.checkedAt = new Date().toISOString();

    this.list = (j.features || []).map(f => {
      const p = f.properties || {};
      const lv = LEVEL[p.event] || LEVEL['Tsunami Information Statement'];
      // 경보 구역은 폴리곤이거나 없을 수 있다. 없으면 지도에 못 찍는다.
      const g = f.geometry;
      let lat = null, lon = null;
      if (g?.type === 'Polygon' && g.coordinates?.[0]?.length) {
        const ring = g.coordinates[0];
        lon = ring.reduce((s, c) => s + c[0], 0) / ring.length;
        lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
      }
      return {
        id: p.id, event: p.event, level: lv,
        area: p.areaDesc, headline: p.headline,
        sent: p.sent, expires: p.expires,
        url: p.uri || p['@id'],
        lat, lon,
        polygon: g?.type === 'Polygon' ? g.coordinates[0] : null,
        source: 'NWS',
      };
    });

    // 국제 경보를 덧붙인다
    const ij = intl.status === 'fulfilled' ? intl.value : null;
    (ij?.alerts || []).forEach(a => {
      this.list.push({
        id: a.id, event: a.category, level: this._intlLevel(a.category),
        area: a.region || a.title, headline: a.title,
        sent: a.updated, expires: null,
        url: a.bulletin, lat: a.lat, lon: a.lon, polygon: null,
        source: a.center, sourceName: a.centerName,
        magnitude: a.magnitude, parsed: a.parsed,
      });
    });

    this.draw();
    return this.list;
  },

  draw() {
    this.ds.entities.removeAll();
    this.list.forEach(t => {
      const col = Cesium.Color.fromCssColorString(t.level.color);

      if (t.polygon?.length) {
        this.ds.entities.add({
          id: `ts:${t.id}:area`,
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(t.polygon.flat()),
            material: col.withAlpha(0.22),
            outline: true, outlineColor: col.withAlpha(0.8), height: 0,
          },
          _meta: { id: t.id, kind: 'tsunami', name: t.level[i18n.lang] || t.level.ko,
                   lat: t.lat, lon: t.lon, _ts: t },
          _layer: 'tsunami',
        });
      }
      if (t.lat != null) {
        this.ds.entities.add({
          id: `ts:${t.id}`,
          position: Cesium.Cartesian3.fromDegrees(t.lon, t.lat),
          point: { pixelSize: 12, color: col.withAlpha(0.95),
                   outlineColor: Cesium.Color.WHITE, outlineWidth: 2.5,
                   disableDepthTestDistance: 600_000 },
          // 쓰나미는 가장 크게 — 놓쳐서는 안 되는 라벨이다
          label: mapLabel({
            text: t.level[i18n.lang] || t.level.ko,
            color: col, size: 'lg', weight: 600, offsetY: -24, alwaysOnTop: true,
          }),
          _meta: { id: t.id, kind: 'tsunami', name: t.level[i18n.lang] || t.level.ko,
                   lat: t.lat, lon: t.lon, _ts: t },
          _layer: 'tsunami',
        });
      }
    });
  },

  /** 가장 높은 등급 — 배너에 띄울 용도 */
  headline() {
    if (!this.list.length) return null;
    return this.list.reduce((a, b) => (b.level.rank > (a?.level.rank ?? 0) ? b : a), null);
  },

  detail(t) {
    const ko = i18n.lang === 'ko';
    const d = {};
    d[ko ? '등급' : 'Level'] = ko ? t.level.ko : t.level.en;
    d[ko ? '발표 기관' : 'Issued by'] = t.sourceName || (ko ? '미국 국립기상청 (NWS)' : 'US NWS');
    d[ko ? '대상 구역' : 'Area'] = t.area || '—';
    if (t.magnitude != null) d[ko ? '지진 규모' : 'Quake magnitude'] = `M ${t.magnitude.toFixed(1)}`;
    if (t.headline && t.headline !== t.area) d[ko ? '요약' : 'Headline'] = t.headline;
    d[ko ? '발표' : 'Issued'] = (t.sent || '').slice(0, 16).replace('T', ' ');
    if (t.expires) d[ko ? '유효' : 'Expires'] = t.expires.slice(0, 16).replace('T', ' ');
    if (t.url) d[ko ? '원문 게시문' : 'Bulletin'] = t.url;

    /* ⚠️ 등급 파싱에 실패한 경우 반드시 알린다.
       "정보"인지 "경보"인지 모르는 채로 조용히 보여주면 안 된다. */
    if (t.parsed === false) {
      d[ko ? ' 주의' : ' Note'] = ko
        ? '이 발표의 등급을 자동으로 읽지 못했습니다. 반드시 원문 게시문을 확인하세요.'
        : 'The alert level could not be parsed automatically — read the bulletin.';
    }

    d['_note'] = ko
      ? '출처 · PTWC · NTWC · 미국 NWS · 등급은 발표 기관 원문 · 대피는 거주 국가 기관 지시'
      : 'Source · PTWC · NTWC · US NWS · issuing-centre level · follow national evacuation orders';
    return { title: ko ? t.level.ko : t.level.en, rows: d };
  },
};
