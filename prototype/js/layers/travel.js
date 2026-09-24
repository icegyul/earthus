// 명소(POI) — OpenStreetMap Overpass (§4-9)
// 뷰포트 기반 로딩 (§5-1). 탭 시 §4-8 예약/예매 제휴 링크로 연결(현재는 스텁).
// (2026-09-24 정정) 브라우저가 공용 Overpass 를 직접 부르지 않는다 — aws/travel-poi 가 하루 1회 만든
//   5°칸 정적 파일(/tourism/poi/)을 읽는다. 자료는 그대로 OpenStreetMap(© OpenStreetMap contributors, ODbL)이다.
//   왜: 공용 서버는 커뮤니티 운영이라 앱 이용자 요청이 합산되고, 504 인 날엔 레이어가 조용히 비었다
//   (docs/PAID-APP-LAUNCH-REVIEW-2026-09-24.md D3 · docs/OPEN-METEO-REPLACEMENT-MAP-2026-09-24.md §5).
import { PointLayer } from './pointLayer.js';
import { viewRect } from '../viewer.js';
import { store } from '../store.js';
import { API, C } from '../config.js';
import { fetchT } from '../net.js';
import { i18n } from '../i18n.js';
import { tilesForView, inCoverage, tileUrl, pickItems } from './poi-static.js';

const INDEX_TTL_MS = 6 * 3600_000;   // 색인은 하루 1회 바뀐다 — 세션 안에서 6시간마다만 다시 본다

const KIND_LABEL = {
  museum:      { ko:'박물관', en:'Museum' },
  observatory: { ko:'천문대', en:'Observatory' },
  planetarium: { ko:'천문관', en:'Planetarium' },
  aquarium:    { ko:'아쿠아리움', en:'Aquarium' },
  zoo:         { ko:'동물원', en:'Zoo' },
  attraction:  { ko:'명소', en:'Attraction' },
};

export const poi = {
  layer: null,
  busy: false,
  lastKey: '',
  _index: null,
  _indexAt: 0,
  _tiles: new Map(),        // 칸 키 → 칸 문서(세션 동안 재사용)
  _told: new Set(),         // "이 지역은 아직 준비되지 않았다"는 이유마다 세션에 한 번만 말한다

  init() {
    this.layer = new PointLayer({ id: 'poi', color: '#8fd694', radius: 5, cluster: true });
    return this.layer;
  },

  /** 뷰포트 기반 로딩 — 화면 범위가 충분히 좁을 때만 요청 */
  async refresh() {
    if (!store.isOn('poi') || this.busy) return;
    const r = viewRect();
    if (!r) return;

    // 전지구/대륙급에서 Overpass를 때리면 응답이 거대 → 시도급 이하에서만
    // (2026-09-24 정정) 이제 Overpass 를 부르지 않지만 같은 문턱을 둔다 — 한 화면에 5°칸 파일 몇 장만 받게 된다.
    const span = Math.max(r.north - r.south, Math.abs(r.east - r.west));
    if (store.height > 900_000 || span > 6) {
      this.layer.setData([]);
      this.lastKey = '';
      return;
    }

    const key = [r.west, r.south, r.east, r.north].map(v => v.toFixed(2)).join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;

    /* (2026-09-24 정정) 아래는 옛 Overpass 직접 질의다 — 기록으로 남긴다. 더는 보내지 않는다.
         const bbox = `${r.south},${r.west},${r.north},${r.east}`;
         const q = `[out:json][timeout:20]; ( node["tourism"~"^(museum|aquarium|zoo|attraction)$"](${bbox});
                    node["amenity"="planetarium"](${bbox}); node["man_made"="observatory"](${bbox}); ); out body 120;`;
         fetchT(API.OVERPASS, { timeout: 25_000,   // Overpass 는 원래 느리다 — 짧게 끊으면 멀쩡한 질의를 죽인다
                                method: 'POST', body: 'data=' + encodeURIComponent(q), … })
       정적 파일은 서버가 이름 없는 점을 이미 버렸고(옛 filter — name 또는 name:en 이 있는 점만 — 와 같은 규칙), 칸마다 위키 연결 → 드문 종류 순으로 줄을 세웠다. */
    this.busy = true;
    try {
      const index = await this._loadIndex();
      if (!inCoverage(index, r)) {
        // ⚠️ 비어 있는 이유를 말한다 — "명소가 없다"가 아니라 "아직 준비되지 않았다"다.
        this.layer.setData([]);
        this._tellCoverage(index);
        return;
      }
      const view = tilesForView(index, r);
      if (!view.length || view.every(t => !t.fetchedAt)) {
        // 덮는 나라 안이지만 서버가 이 칸을 아직 한 번도 받지 못했다(첫 실행 전·공용 서버 504) — 그 사실을 말한다.
        this.layer.setData([]);
        this._tellCoverage(index, 'NOT_YET');
        return;
      }
      const want = view.filter(t => t.count > 0);
      const docs = await Promise.all(want.map(t => this._loadTile(index, t.key)));
      const t = i18n.t.F;

      const items = pickItems(docs.filter(Boolean), r, 120)
        .map(e => {
          const raw = e.k || 'attraction';
          const label = (KIND_LABEL[raw] || KIND_LABEL.attraction)[i18n.lang] || raw;
          return {
            id: 'osm' + e.id,
            name: e.n || e.ne,
            lat: e.la, lon: e.lo,
            kind: 'poi',
            data: {
              [t.type]: label,
              _booking: true,          // §4-8 제휴 링크 연결 지점
              _osm: e.id,
            },
          };
        });
      this.layer.setData(items);
    } catch (e) {
      console.warn('[poi]', e.message);
    } finally {
      this.busy = false;
    }
  },

  async _loadIndex() {
    if (this._index && Date.now() - this._indexAt < INDEX_TTL_MS) return this._index;
    const res = await fetchT(`${API.TRAVEL_POI}/index.json`, { timeout: 15_000 });
    if (!res.ok) throw new Error('poi-index ' + res.status);
    this._index = await res.json();
    this._indexAt = Date.now();
    this._tiles.clear();          // 색인이 바뀌면 칸도 새로 받는다
    return this._index;
  },

  async _loadTile(index, key) {
    if (this._tiles.has(key)) return this._tiles.get(key);
    try {
      const res = await fetchT(tileUrl(API.TRAVEL_POI, index, key), { timeout: 15_000 });
      if (!res.ok) throw new Error('poi-tile ' + res.status);
      const doc = await res.json();
      this._tiles.set(key, doc);
      return doc;
    } catch (e) {
      // 칸 하나가 없어도 나머지 칸은 그린다 — 없는 칸을 채우지 않는다.
      console.warn('[poi]', key, e.message);
      return null;
    }
  },

  _tellCoverage(index, why = 'OUT') {
    if (this._told.has(why)) return;
    this._told.add(why);
    const ko = i18n.lang === 'ko';
    const note = index?.coverageNote || {};
    const msg = why === 'NOT_YET'
      ? (ko ? '이 지역 명소 자료를 아직 받지 못했습니다 · 하루 1회 갱신'
        : 'Places for this area have not been fetched yet · updated daily')
      : ((ko ? note.ko : note.en)
        || (ko ? '이 지역의 명소 자료는 아직 준비되지 않았습니다.' : 'Places are not ready for this region yet.'));
    // layers/imagery.js 와 같은 방식 — ui.js 를 늦게 불러 순환 import 를 만들지 않는다.
    import('../ui.js').then(({ toast }) => toast(msg)).catch(() => {});
  },
};
