// 기상 레이어 — Open-Meteo (NOAA GFS / ECMWF 기반, 인증 불필요)
// §4-2 예보모델 + §10 Phase1: 지역 탭 → 기온·습도·강수 / 바람 방향 화살표
import { PointLayer } from './pointLayer.js';
import { viewer, viewRect } from '../viewer.js';
import { API, C } from '../config.js';
import { fetchT } from '../net.js';
import { i18n } from '../i18n.js';
import { store } from '../store.js';
import { buildWeatherQueryV7 } from '../weather-contract-v7.js';

const CITIES = [
  ['서울',37.5665,126.9780],['인천',37.4563,126.7052],['부산',35.1796,129.0756],
  ['대구',35.8714,128.6014],['광주',35.1595,126.8526],['대전',36.3504,127.3845],
  ['울산',35.5384,129.3114],['제주',33.4996,126.5312],['강릉',37.7519,128.8761],
  ['전주',35.8242,127.1480],['청주',36.6424,127.4890],['포항',36.0190,129.3435],
  ['도쿄',35.6762,139.6503],['오사카',34.6937,135.5023],['베이징',39.9042,116.4074],
  ['상하이',31.2304,121.4737],['타이베이',25.0330,121.5654],['홍콩',22.3193,114.1694],
  ['싱가포르',1.3521,103.8198],['방콕',13.7563,100.5018],['자카르타',-6.2088,106.8456],
  ['델리',28.6139,77.2090],['두바이',25.2048,55.2708],['이스탄불',41.0082,28.9784],
  ['모스크바',55.7558,37.6173],['런던',51.5074,-0.1278],['파리',48.8566,2.3522],
  ['베를린',52.5200,13.4050],['로마',41.9028,12.4964],['마드리드',40.4168,-3.7038],
  ['카이로',30.0444,31.2357],['나이로비',-1.2921,36.8219],['라고스',6.5244,3.3792],
  ['케이프타운',-33.9249,18.4241],['뉴욕',40.7128,-74.0060],['시카고',41.8781,-87.6298],
  ['로스앤젤레스',34.0522,-118.2437],['샌프란시스코',37.7749,-122.4194],
  ['멕시코시티',19.4326,-99.1332],['보고타',4.7110,-74.0721],['리마',-12.0464,-77.0428],
  ['상파울루',-23.5505,-46.6333],['부에노스아이레스',-34.6037,-58.3816],
  ['시드니',-33.8688,151.2093],['오클랜드',-36.8485,174.7633],
  ['앵커리지',61.2181,-149.9003],['레이캬비크',64.1466,-21.9426],
];

/* ── Open-Meteo 조회 ─────────────────────────────────────────── */
const WX_CODE_KO = {
  0:'맑음',1:'대체로 맑음',2:'구름 조금',3:'흐림',45:'안개',48:'짙은 안개',
  51:'가랑비',53:'가랑비',55:'강한 가랑비',61:'약한 비',63:'비',65:'강한 비',
  71:'약한 눈',73:'눈',75:'강한 눈',80:'소나기',81:'소나기',82:'강한 소나기',
  95:'뇌우',96:'우박 동반 뇌우',99:'강한 뇌우',
};
const WX_CODE_EN = {
  0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',
  51:'Light drizzle',53:'Drizzle',55:'Dense drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',
  71:'Light snow',73:'Snow',75:'Heavy snow',80:'Showers',81:'Showers',82:'Violent showers',
  95:'Thunderstorm',96:'Thunderstorm w/ hail',99:'Severe thunderstorm',
};
export function wxText(code) {
  const m = i18n.lang === 'ko' ? WX_CODE_KO : WX_CODE_EN;
  return m[code] ?? (i18n.lang === 'ko' ? '—' : '—');
}

export async function fetchWeather(lat, lon) {
  const q = buildWeatherQueryV7(lat, lon);
  const res = await fetchT(`${API.METEO}?${q}`);
  if (!res.ok) throw new Error('meteo ' + res.status);
  return res.json();
}

/** 여러 지점 한 번에 (바람 격자용) */
async function fetchGrid(pts) {
  const q = new URLSearchParams({
    latitude: pts.map(p => p[0].toFixed(3)).join(','),
    longitude: pts.map(p => p[1].toFixed(3)).join(','),
    current: 'wind_speed_10m,wind_direction_10m',
  });
  const res = await fetchT(`${API.METEO}?${q}`);
  if (!res.ok) throw new Error('meteo-grid ' + res.status);
  const j = await res.json();
  return Array.isArray(j) ? j : [j];
}

/* ══════════════════════════════════════════════════════════════
   관측소 핀 — 국가급부터 (§5-10 점 레이어)
   ══════════════════════════════════════════════════════════════ */
export const stations = {
  layer: null,
  // ⚠️ 점 47개는 켤 때 만든다 (화산과 같은 이유 — hazard.js 주석 참고)
  init() {
    this.layer = new PointLayer({ id: 'stations', color: C.teal, radius: 5, cluster: true });
    return this.layer;
  },

  load() {
    this.layer.setData(CITIES.map(([n, lat, lon]) => ({
      id: n, name: n, lat, lon, kind: 'station',
      data: { _lazy: true },      // 탭 시점에 Open-Meteo 조회
    })));
  },
};

/* ══════════════════════════════════════════════════════════════
   바람 / 이동 방향 화살표 (§10 Phase1-6)
   현재 뷰포트에 격자를 깔고 풍향·풍속을 화살표로
   ══════════════════════════════════════════════════════════════ */
export const wind = {
  ds: null,
  busy: false,
  lastKey: '',

  init() {
    this.ds = new Cesium.CustomDataSource('wind');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    return this;
  },

  set(on) {
    if (this.ds) this.ds.show = on;
    if (on) this.refresh();
  },

  /** 뷰포트 기반 로딩 (§5-1) — 화면 범위가 바뀌면 다시 요청 */
  async refresh() {
    if (!store.isOn('wind') || this.busy) return;
    const r = viewRect();
    if (!r) return;

    // 전지구 수준에서는 격자가 무의미 → 국가급 이하에서만
    if (store.height > 4_000_000) { this.ds.entities.removeAll(); return; }

    const key = [r.west, r.south, r.east, r.north].map(v => v.toFixed(1)).join(',');
    if (key === this.lastKey) return;
    this.lastKey = key;

    const N = 5;
    const pts = [];
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < N; k++) {
        const lat = r.south + ((r.north - r.south) * (i + 0.5)) / N;
        let lon = r.west + ((r.east - r.west) * (k + 0.5)) / N;
        if (lon > 180) lon -= 360; if (lon < -180) lon += 360;
        pts.push([lat, lon]);
      }
    }

    this.busy = true;
    try {
      const rows = await fetchGrid(pts);
      this.ds.entities.removeAll();
      rows.forEach((row, i) => {
        const c = row.current;
        if (!c) return;
        const [lat, lon] = pts[i];
        const spd = c.wind_speed_10m ?? 0;
        const dir = c.wind_direction_10m ?? 0;
        this.arrow(lat, lon, dir, spd);
      });
    } catch (e) {
      console.warn('[wind]', e.message);
    } finally {
      this.busy = false;
    }
  },

  /** dir: 바람이 불어오는 방향(기상 관례) → 진행 방향은 +180° */
  arrow(lat, lon, dirFrom, speed) {
    const heading = (dirFrom + 180) % 360;
    const lenDeg = Math.min(2.4, 0.35 + speed / 22);
    const rad = (heading * Math.PI) / 180;
    const dLat = Math.cos(rad) * lenDeg;
    const dLon = (Math.sin(rad) * lenDeg) / Math.max(0.25, Math.cos((lat * Math.PI) / 180));

    const a = Cesium.Cartesian3.fromDegrees(lon, lat);
    const b = Cesium.Cartesian3.fromDegrees(lon + dLon, lat + dLat);
    const alpha = Math.min(0.95, 0.3 + speed / 45);

    this.ds.entities.add({
      polyline: {
        positions: [a, b],
        width: 8,
        material: new Cesium.PolylineArrowMaterialProperty(
          Cesium.Color.fromCssColorString(C.paper).withAlpha(alpha)
        ),
        arcType: Cesium.ArcType.GEODESIC,
        clampToGround: false,
      },
    });
  },
};
