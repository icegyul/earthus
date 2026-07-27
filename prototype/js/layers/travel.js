// 명소(POI) — OpenStreetMap Overpass (§4-9)
// 뷰포트 기반 로딩 (§5-1). 탭 시 §4-8 예약/예매 제휴 링크로 연결(현재는 스텁).
import { PointLayer } from './pointLayer.js';
import { viewRect } from '../viewer.js';
import { store } from '../store.js';
import { API, C } from '../config.js';
import { i18n } from '../i18n.js';

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
    const span = Math.max(r.north - r.south, Math.abs(r.east - r.west));
    if (store.height > 900_000 || span > 6) {
      this.layer.setData([]);
      this.lastKey = '';
      return;
    }

    const key = [r.west, r.south, r.east, r.north].map(v => v.toFixed(2)).join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;

    const bbox = `${r.south},${r.west},${r.north},${r.east}`;
    const q = `[out:json][timeout:20];
(
  node["tourism"~"^(museum|aquarium|zoo|attraction)$"](${bbox});
  node["amenity"="planetarium"](${bbox});
  node["man_made"="observatory"](${bbox});
);
out body 120;`;

    this.busy = true;
    try {
      const res = await fetch(API.OVERPASS, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error('overpass ' + res.status);
      const j = await res.json();
      const t = i18n.t.F;

      const items = (j.elements || [])
        .filter(e => e.tags && (e.tags.name || e.tags['name:en']))
        .slice(0, 120)
        .map(e => {
          const raw = e.tags.man_made === 'observatory' ? 'observatory'
            : e.tags.amenity === 'planetarium' ? 'planetarium'
            : e.tags.tourism || 'attraction';
          const label = (KIND_LABEL[raw] || KIND_LABEL.attraction)[i18n.lang] || raw;
          return {
            id: 'osm' + e.id,
            name: e.tags.name || e.tags['name:en'],
            lat: e.lat, lon: e.lon,
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
};
