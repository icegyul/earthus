/* 해변 — 방위와 파랑을 합친다
 *
 * data/beaches.json 은 **미리 만들어 둔 정적 파일**이다. 해변은 움직이지 않으므로
 * 런타임에 OSM 을 부를 이유가 없다 (부르면 느리고 Overpass 에도 폐가 된다).
 *   전국 300곳 중 228곳(76%)에 바다 방향이 들어 있다.
 *   본토 해안 기준 90%가 기대 방향과 맞는 것을 확인했다 (동해안은 97곳 100%).
 *
 * 파랑은 Open-Meteo 해양에서 **여러 지점을 한 번에** 받는다.
 * ⚠️ 해변마다 부르면 안 된다 — 12곳이면 12번이고, 목록을 열 때마다 그만큼이다.
 *    좌표를 쉼표로 이어 한 번에 묻는다 (weather.js 의 격자 조회와 같은 방식).
 *
 * ⚠️ 육지 좌표를 넣어도 200 이 오고 값만 null 이다. "응답이 왔다"로 판단하면 안 된다.
 *    OSM 해변 노드가 모래사장 안쪽에 찍혀 있으면 그렇게 된다 —
 *    그래서 **바다 쪽으로 조금 밀어서** 묻는다.
 */

import { API } from './config.js';
import { fetchT } from './net.js';
import { distKm } from './korea.js';
/* 일본 해변 이름을 기기 언어에 맞춰 고른다 */
import { jpName } from './jpname.js';
import { i18n } from './i18n.js';

const SRC = 'data/beaches.json';
const JP_SRC = 'data/jp/beaches.json';

/* 조회 지점을 해변에서 바다 쪽으로 미는 거리.
   ⚠️ 너무 적게 밀면 육지라 값이 비고, 너무 많이 밀면 앞바다가 아니라 먼바다가 된다.
      Open-Meteo 해양 격자가 대략 이 정도 크기다. */
const OFFSHORE_KM = 1.2;

/* 한 번에 물어볼 최대 지점 수.
   ⚠️ 좌표를 URL 에 이어 붙이므로 무한정 늘릴 수 없다(주소 길이 제한). */
const BATCH = 16;

/* ⚠️ 너울(swell)과 풍파(wind wave)를 **따로** 받는다.
   서퍼에게 이 둘은 다른 파도다 — 너울은 먼 바다에서 정리돼 온 것,
   풍파는 근처 바람이 방금 만든 잡파다. 합쳐진 wave_* 만 보면 구분이 안 된다.
   수온도 함께 받는다 (슈트를 입을지 정하는 값이다). */
/* 조차가 이보다 작으면 물때를 **크게 말하지 않는다.**
   ⚠️ 실측(2026-08-02, 48시간):
        양양·강릉 0.27m · 포항 0.16m   ← 한국 서핑의 중심인데 가장 작다
        부산 1.00m · 제주 남 2.21m
        대천 5.53m · 인천 6.87m       ← 크지만 여기선 서핑을 안 한다
      동해에서 물때를 크게 띄우면 **없는 중요성을 만드는 것**이 된다.
      대신 제주·남해에서는 실제로 포인트가 열리고 닫히는 값이다. */
const TIDE_MATTERS_M = 0.5;

const MARINE_FIELDS = 'wave_height,wave_direction,wave_period,'
  + 'swell_wave_height,swell_wave_direction,swell_wave_period,'
  + 'wind_wave_height,wind_wave_period,sea_surface_temperature';

/** 해변에서 바다 쪽으로 km 만큼 민 좌표
 *  ⚠️ load() 가 축약 필드(n/la/lo/f)를 풀어 이름을 바꿔 놓는다.
 *     여기서 원본 이름을 쓰면 undefined 가 되어 조용히 육지 좌표를 묻게 된다. */
function offshore(b, km = OFFSHORE_KM) {
  if (b.facing == null) return [b.lat, b.lon];
  const r = Math.PI / 180;
  const dLat = (km * Math.cos(b.facing * r)) / 110.57;
  const dLon = (km * Math.sin(b.facing * r)) / (111.32 * Math.cos(b.lat * r));
  return [b.lat + dLat, b.lon + dLon];
}

/* 이름에서 "해수욕장·해변" 같은 꼬리를 뗀다.
   받은 지시: "주문진해변에서 해변만 빼고 이름만 나와도 돼 (사근진 너울 파도 온도)"
   ⚠️ 떼고 나서 비면 원래 이름을 그대로 쓴다 — 빈 칸이 나오면 안 된다. */
const TAIL = /\s*(해수욕장|해변|해안|해수욕|비치|야영장|캠핑장)+\s*$/;
export function shortName(n) {
  const t = String(n || '').replace(TAIL, '').replace(TAIL, '').trim();
  return t || String(n || '');
}

/* 지역 라벨에서 괄호 안을 뗀다 — "동해 북부 (고성·속초·양양)" → "동해 북부" */
export function shortRegion(r) {
  return String(r || '').replace(/\s*\(.*$/, '').trim();
}

/* 시간별 조위에서 **다음 만조·간조**와 조차를 낸다.
   ⚠️ 예보 곡선의 봉우리·골을 찾는 것이지 조화분해가 아니다. 시간 간격이 1시간이라
      실제 만조 시각과 최대 30분쯤 어긋날 수 있다 — 화면에 그렇게 적는다.
   ⚠️ 못 내면 null. 지어내지 않는다. */
function tideOf(hourly) {
  const t = hourly?.time, h = hourly?.sea_level_height_msl;
  if (!t?.length || !h?.length) return null;
  const now = Date.now();
  const pts = t.map((x, i) => ({ at: new Date(x).getTime(), v: h[i] }))
    .filter(x => x.v != null && Number.isFinite(x.at));
  if (pts.length < 6) return null;

  const vals = pts.map(x => x.v);
  const range = Math.max(...vals) - Math.min(...vals);

  // 앞으로 오는 봉우리(만조)·골(간조)
  const next = [];
  for (let i = 1; i < pts.length - 1; i++) {
    if (pts[i].at < now) continue;
    const a = pts[i - 1].v, b = pts[i].v, c = pts[i + 1].v;
    if (b >= a && b >= c) next.push({ kind: 'high', at: pts[i].at, v: b });
    else if (b <= a && b <= c) next.push({ kind: 'low', at: pts[i].at, v: b });
    if (next.length >= 4) break;
  }
  const cur = pts.reduce((best, x) =>
    Math.abs(x.at - now) < Math.abs(best.at - now) ? x : best, pts[0]);
  return {
    rangeM: Math.round(range * 100) / 100,
    matters: range >= TIDE_MATTERS_M,
    nowM: Math.round(cur.v * 100) / 100,
    next: next.slice(0, 2),
    // 지금 물이 드는 중인가 나는 중인가
    rising: next.length ? next[0].kind === 'high' : null,
  };
}

export const beaches = {
  list: [],
  meta: null,
  _sea: new Map(),        // name → 파랑값 (15분 캐시)
  _seaAt: 0,

  async load() {
    if (this.list.length) return this.list;
    const r = await fetchT(SRC, { cache: 'force-cache' });
    if (!r.ok) throw new Error('beaches ' + r.status);
    const j = await r.json();
    this.list = (j.beaches || []).map(b => ({
      name: b.n, nameEn: b.en || null,
      lat: b.la, lon: b.lo, region: b.r, country: 'kr',
      facing: b.f ?? null, consist: b.c ?? null, spanM: b.sp ?? null,
      why: b.why || null,
    }));

    /* ── 일본 해변 ────────────────────────────────────────────
       ⚠️⚠️ **바다 방향(facing)이 없다.** 한국 해변은 OSM 해안선에서 축평균으로
          계산해 뒀지만 일본은 아직 안 했다. facing 이 없으면 이 화면의 핵심 판단
          ("이 스웰이 이 해변에 들어오는가")을 **할 수 없다.**
       ⚠️ 그렇다고 빼지 않는다. 파고·주기·수온은 그대로 말할 수 있고,
          그것만으로도 볼 이유가 있다. 대신 **못 하는 판단을 화면에 적는다.**
       ⚠️ 실패해도 한국 자료는 그대로 뜬다 — 일본이 없다고 서핑 화면을 막지 않는다. */
    try {
      const jr = await fetchT(JP_SRC, { cache: 'force-cache' });
      if (jr.ok) {
        const jj = await jr.json();
        const lang = i18n.lang;
        (jj.beaches || []).forEach(b => {
          /* ⚠️⚠️ 파일의 ko 에는 **두 가지가 섞여 있다** —
             OSM 에 사람이 적어 둔 한국어(how='osm')와 우리가 옮긴 표기(how='tr').
             그대로 넘기면 화면이 둘을 구분 못 해 **"표기 변환입니다"를 못 밝힌다.**
             지어낸 값이 아니라는 것과, 공식 지명이 아니라는 것을 둘 다 말해야 한다. */
          const nm = b.ko
            ? { text: (lang === 'ja' ? (b.n || b.ko)
                     : lang === 'ko' ? b.ko : (b.en || b.ko)),
                mark: lang === 'ko' ? (b.how === 'tr' ? 'tr' : 'ko')
                    : lang === 'ja' ? 'ja' : (b.en ? 'en' : 'ko') }
            : jpName({ ja: b.n, en: b.en }, lang);
          this.list.push({
            name: nm.text, nameEn: b.en || null, nameJa: b.n,
            nameMark: nm.mark,          // ko | tr | en | ja — 어디서 온 이름인가
            lat: b.la, lon: b.lo, region: 'jp', country: 'jp',
            facing: null, consist: null, spanM: null, why: null,
          });
        });
        this._jp = { n: (jj.beaches || []).length, names: jj.names, note: jj.note };
      }
    } catch (_) { /* 일본이 없어도 한국은 뜬다 */ }

    this.meta = {
      generated: j.generated, source: j.source, license: j.license,
      count: j.count, withFacing: j.withFacing,
      method: j.method, note: j.note, rule: j.rule,
    };
    return this.list;
  },

  /** 내 위치에서 가까운 순. 방위가 있는 곳을 앞에 둔다 (판단이 되는 곳이므로). */
  near(lat, lon, n = 12, onlyFacing = true) {
    const all = this.list.map(b => ({ ...b, km: Math.round(distKm(lat, lon, b.lat, b.lon)) }))
      .sort((a, b) => a.km - b.km);
    if (!onlyFacing) return all.slice(0, n);
    const withF = all.filter(b => b.facing != null);
    /* ⚠️⚠️ 방향이 있는 곳만 고르면 **일본이 통째로 빠진다** — 일본 해변은 아직
       해안선에서 방향을 계산하지 않았기 때문이다. 일본 바다를 보고 있는데
       목록이 한국 해변으로 채워지면 그건 고장으로 보인다.
       → 가까운 곳에 방향 있는 해변이 없으면 **방향 없는 곳이라도 보여준다.**
         대신 화면이 "이 해변은 스웰 방향을 판단하지 못합니다"라고 적는다. */
    if (withF.length && withF[0].km <= 150) return withF.slice(0, n);
    return all.slice(0, n);
  },

  byRegion(region) {
    return this.list.filter(b => b.region === region);
  },

  regions() {
    return [...new Set(this.list.map(b => b.region))].sort();
  },

  /**
   * 여러 해변의 파랑을 **한 번에** 받는다.
   * ⚠️ 실패하거나 값이 비면 그 해변은 Map 에 넣지 않는다 — 없는 걸 0 으로 채우면
   *    "파도가 없다"로 읽힌다. 없는 것과 0 은 다르다.
   */
  async sea(items) {
    const fresh = Date.now() - this._seaAt < 15 * 60_000;
    const need = items.filter(b => !(fresh && this._sea.has(b.name)));
    if (!need.length) return this._sea;
    if (!fresh) { this._sea.clear(); this._seaAt = Date.now(); }

    for (let i = 0; i < need.length; i += BATCH) {
      const chunk = need.slice(i, i + BATCH);
      const pts = chunk.map(b => offshore(b));
      const q = new URLSearchParams({
        latitude: pts.map(p => p[0].toFixed(3)).join(','),
        longitude: pts.map(p => p[1].toFixed(3)).join(','),
        current: MARINE_FIELDS,
        // 조위는 시간별로 받아야 만조·간조를 낼 수 있다 (현재값 하나로는 못 낸다)
        hourly: 'sea_level_height_msl',
        forecast_days: '2',
        timezone: 'auto',
      });
      try {
        const r = await fetchT(`${API.MARINE}?${q}`);
        if (!r.ok) continue;
        const j = await r.json();
        // ⚠️ 지점이 하나면 배열이 아니라 객체로 온다. 둘 다 받아야 한다.
        const rows = Array.isArray(j) ? j : [j];
        rows.forEach((row, k) => {
          const c = row?.current;
          const b = chunk[k];
          if (!b || !c || c.wave_height == null) return;   // 육지이거나 결측
          this._sea.set(b.name, {
            waveH: c.wave_height, waveDir: c.wave_direction, wavePeriod: c.wave_period,
            swellH: c.swell_wave_height, swellDir: c.swell_wave_direction,
            swellPeriod: c.swell_wave_period,
            windH: c.wind_wave_height, windPeriod: c.wind_wave_period,
            sst: c.sea_surface_temperature,
            at: c.time,
            tide: tideOf(row.hourly),
          });
        });
      } catch (e) {                                        // noqa
        console.warn('[beaches] 파랑 조회 실패', e.message);
      }
    }
    return this._sea;
  },

  OFFSHORE_KM,
};
