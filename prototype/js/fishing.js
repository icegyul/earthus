/* 낚시 — 물때와 안전
 *
 * 받은 요청: "서핑처럼 낚시도 하자. 이건 근교 바다도 보여주면 되지 않을까? 섬도 그렇고"
 *
 * ⚠️⚠️ **"잘 나옵니다"라고 말하지 않는다.** 조황은 우리가 아는 값이 아니다 —
 *    어군·미끼·시기·그날의 운이 섞인다. 우리가 말할 수 있는 것은 셋뿐이다.
 *        ① 물이 얼마나 움직이는가 (물때)
 *        ② 지금 나가면 위험한가   (너울·파고·바람)
 *        ③ 물이 얼마나 찬가       (수온)
 *    무슨 고기가 나오는지는 **말하지 않는다.**
 *
 * ⚠️⚠️ **안전이 이 화면의 첫 번째 목적이다.**
 *    갯바위·방파제에서 해마다 사람이 죽는다. 원인은 대부분 너울이다 —
 *    하늘은 맑고 바람도 없는데 먼 바다에서 온 긴 파도가 갑자기 덮친다.
 *    그래서 "파고"가 아니라 **너울을 따로** 본다. 서핑과 같은 이유, 반대 방향이다.
 *
 * ⚠️ 물때 번호(몇 물)는 적지 않는다.
 *    서해식(8물때)과 남해식(7물때)이 서로 하루씩 어긋나고, 지역마다 부르는 법이 또 다르다.
 *    틀린 물때를 적으면 그날 하루를 통째로 버리게 만든다.
 *    대신 **실제 조위 예보에서 잰 조차**로 사리·조금을 말한다 —
 *    물때 번호가 대신 말하려던 것이 바로 그 값이다.
 */

import { API } from './config.js';
import { fetchT } from './net.js';
import { distKm } from './korea.js';
/* 일본 지점 이름을 기기 언어에 맞춰 */
import { jpName } from './jpname.js';
import { i18n } from './i18n.js';

const SRC = 'data/fishing.json';
const JP_SRC = 'data/jp/fishing.json';

/* 조회 지점을 뭍에서 바다 쪽으로 미는 거리(km).
   ⚠️ 방파제·항구 좌표는 뭍에 찍혀 있다. 그대로 물으면 값이 통째로 빈다
      (해변에서 이미 겪은 함정 — beaches.js 머리말 참고). */
const OFFSHORE_KM = 2.0;

/* 한 번에 물어볼 최대 지점 수 (주소 길이 제한) */
const BATCH = 16;

const N_DAYS = 5;    // 조위를 이만큼 받아 사리·조금을 가른다

/* ⚠️ 조차가 이보다 작으면 물때를 크게 말하지 않는다.
      실측(2026-08-02): 양양 0.27m · 포항 0.16m · 부산 1.00m ·
                        제주 남 2.21m · 대천 5.53m · 인천 6.87m
      동해에서 물때를 크게 띄우면 **없는 중요성을 만드는 것**이 된다.
      그런데 낚시에서는 서해·남해가 중심이라 서핑과 사정이 다르다. */
const TIDE_MATTERS_M = 0.5;

/* ── 안전 문턱 ──────────────────────────────────────────────────
   ⚠️⚠️ 이 숫자는 우리가 지어낸 것이 아니다. 기상청 너울 주의 안내와
      해양경찰 갯바위 사고 통계가 가리키는 구간에 맞췄다.
      ⚠️ 그래도 **"안전하다"고는 말하지 않는다.** 낮은 쪽은 "지금은 낮다"까지다.
         이안류·조류·발판·물때는 이 숫자에 안 들어 있다. */
const SWELL_WATCH_M = 1.0;    // 이 이상이면 갯바위·방파제에서 조심
const SWELL_DANGER_M = 1.5;   // 이 이상이면 나가지 말라고 적는다
const WIND_WATCH_MS = 8;      // 배낚시가 어려워지기 시작하는 구간
const WIND_DANGER_MS = 12;

export const FISH_RULES = {
  swellWatchM: SWELL_WATCH_M, swellDangerM: SWELL_DANGER_M,
  windWatchMs: WIND_WATCH_MS, windDangerMs: WIND_DANGER_MS,
  tideMattersM: TIDE_MATTERS_M, offshoreKm: OFFSHORE_KM, days: N_DAYS,
};

const MARINE_FIELDS = 'wave_height,wave_period,'
  + 'swell_wave_height,swell_wave_period,'
  + 'wind_wave_height,sea_surface_temperature,ocean_current_velocity';

/** 뭍 좌표를 바다 쪽으로 민다.
 *  ⚠️ 어느 쪽이 바다인지 모르므로 **네 방향을 다 시도**하지 않는다 —
 *     대신 가장 가까운 다른 지점들의 반대편으로 밀지도 않는다.
 *     지금은 그냥 원 좌표로 묻고, 값이 비면 그 지점을 빼는 쪽을 택했다.
 *     ⚠️ 없는 것과 0 은 다르다. 육지라 값이 없는 것을 "파도 없음"으로 만들면 안 된다. */
function askPoint(s) {
  return [s.lat, s.lon];
}

/* 시간별 조위에서 오늘의 조차·다음 만조/간조를 낸다.
   ⚠️ 예보 곡선의 봉우리·골을 찾는 것이지 조화분해가 아니다.
      시간 간격이 1시간이라 실제 시각과 최대 30분쯤 어긋난다 — 화면에 그렇게 적는다. */
function tideOf(hourly) {
  const t = hourly?.time, h = hourly?.sea_level_height_msl;
  if (!t?.length || !h?.length) return null;
  const now = Date.now();
  const pts = t.map((x, i) => ({ at: new Date(x).getTime(), v: h[i] }))
    .filter(x => x.v != null && Number.isFinite(x.at));
  if (pts.length < 12) return null;

  // 오늘(앞으로 24시간)의 조차
  const day = pts.filter(x => x.at >= now - 3 * 3600_000 && x.at <= now + 24 * 3600_000);
  const dayV = day.map(x => x.v);
  const todayRange = dayV.length ? Math.max(...dayV) - Math.min(...dayV) : null;

  /* 며칠치 중 가장 큰 조차와 견준다.
     ⚠️⚠️ 이것이 물때 번호를 대신하는 값이다. 사리(대조)면 이번 주 최대에 가깝고
        조금(소조)이면 절반 아래로 떨어진다. 우리가 정한 기준이 아니라
        **그 바다의 실제 조위 예보에서 잰 값**이다. */
  const byDay = new Map();
  pts.forEach(x => {
    const k = new Date(x.at).toDateString();
    const a = byDay.get(k) || [];
    a.push(x.v); byDay.set(k, a);
  });
  const ranges = [...byDay.values()].filter(a => a.length >= 20)
    .map(a => Math.max(...a) - Math.min(...a));
  const maxRange = ranges.length ? Math.max(...ranges) : null;
  const minRange = ranges.length ? Math.min(...ranges) : null;

  let phase = null, ratio = null;
  if (todayRange != null && maxRange && maxRange > 0) {
    ratio = todayRange / maxRange;
    /* ⚠️ 이름을 붙이되 **어떻게 낸 값인지 화면에 함께 적는다.**
       "사리"라는 말은 물때 번호와 얽혀 있어, 근거 없이 쓰면 다른 뜻으로 읽힌다. */
    if (ratio >= 0.85) phase = 'spring';        // 사리에 가깝다
    else if (ratio <= 0.55) phase = 'neap';     // 조금에 가깝다
    else phase = 'mid';
  }

  // 앞으로 오는 만조·간조
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
    rangeM: todayRange == null ? null : Math.round(todayRange * 100) / 100,
    maxRangeM: maxRange == null ? null : Math.round(maxRange * 100) / 100,
    minRangeM: minRange == null ? null : Math.round(minRange * 100) / 100,
    ratio: ratio == null ? null : Math.round(ratio * 100) / 100,
    phase,
    matters: (todayRange ?? 0) >= TIDE_MATTERS_M,
    nowM: Math.round(cur.v * 100) / 100,
    next: next.slice(0, 3),
    rising: next.length ? next[0].kind === 'high' : null,
    days: ranges.length,
  };
}

/** 지금 나가도 되는가 — **값의 전달이지 판정이 아니다.**
 *  ⚠️ "안전합니다"라고 절대 쓰지 않는다. 우리가 모르는 것이 너무 많다:
 *     발판·이끼·조류·수심·혼자인지·구명조끼를 입었는지.
 *  ⚠️ 낮은 쪽은 "지금은 낮습니다"까지만 말한다. */
export function safety(sea, wind, spot, ko) {
  const out = { level: 'unknown', lines: [] };
  const sw = sea?.swellH, wv = sea?.waveH;
  const ws = wind?.speed;

  // 갯바위·섬은 같은 너울에도 더 위험하다 — 물이 차면 나올 길이 사라진다
  const exposed = spot?.kind === 'island' || spot?.kind === 'breakwater';

  if (sw == null && wv == null) {
    out.lines.push(ko ? '이 지점의 파도 자료가 없습니다.' : 'No wave data here.');
    return out;
  }
  const s = sw ?? 0;
  if (s >= SWELL_DANGER_M) {
    out.level = 'danger';
    out.lines.push(ko
      ? `너울이 **${s.toFixed(1)}m** 입니다. 갯바위·방파제에 올라가지 마세요.`
      : `Swell is ${s.toFixed(1)} m. Do not go onto rocks or breakwaters.`);
  } else if (s >= SWELL_WATCH_M) {
    out.level = 'watch';
    out.lines.push(ko
      ? `너울 **${s.toFixed(1)}m**. 하늘이 맑아도 큰 물결이 갑자기 올라옵니다.`
      : `Swell ${s.toFixed(1)} m — long waves can surge without warning.`);
  } else {
    out.level = 'low';
    out.lines.push(ko
      ? `너울 ${s.toFixed(1)}m — 지금은 낮습니다.`
      : `Swell ${s.toFixed(1)} m — low right now.`);
  }

  if (ws != null) {
    if (ws >= WIND_DANGER_MS) {
      if (out.level !== 'danger') out.level = 'danger';
      out.lines.push(ko ? `바람 ${ws.toFixed(1)}m/s — 배는 대부분 못 뜹니다.`
                        : `Wind ${ws.toFixed(1)} m/s — boats generally stay in.`);
    } else if (ws >= WIND_WATCH_MS) {
      if (out.level === 'low') out.level = 'watch';
      out.lines.push(ko ? `바람 ${ws.toFixed(1)}m/s — 채비가 밀립니다.`
                        : `Wind ${ws.toFixed(1)} m/s — tackle will drift.`);
    }
  }

  if (exposed && out.level !== 'low') {
    out.lines.push(ko
      ? (spot.kind === 'island'
          ? '⚠️ 섬·갯바위는 물이 차면 나올 길이 없어집니다. 물때를 먼저 보세요.'
          : '⚠️ 테트라포드는 젖으면 미끄럽고, 빠지면 혼자 못 올라옵니다.')
      : '⚠️ Exposed spot — check the tide before going.');
  }
  return out;
}

export const fishing = {
  list: [],
  meta: null,
  _sea: new Map(),
  _seaAt: 0,

  async load() {
    if (this.list.length) return this.list;
    const r = await fetchT(SRC, { cache: 'force-cache' });
    if (!r.ok) throw new Error('fishing ' + r.status);
    const j = await r.json();
    this.list = (j.spots || []).map(s => ({
      name: s.n, lat: s.la, lon: s.lo, region: s.r, country: 'kr',
      kind: s.k, kindKo: s.kko, spanM: s.sp ?? null,
    }));

    /* ── 일본 방파제·선착장 ────────────────────────────────────
       ⚠️⚠️ **한국어 이름이 한 곳도 없다.** OSM 에 name:ko 가 0곳이고,
          영문도 68곳뿐이라 규칙으로 옮겨진 것이 **단 2곳**이다.
          나머지 490곳은 일본어 원문 그대로 나간다 — 그게 자료의 현실이다.
       ⚠️ 그래도 넣는다. 물때·파고·수온은 그대로 잰 값이고, 이름을 못 읽는 것과
          자리를 모르는 것은 다르다.
       ⚠️ 실패해도 한국 자료는 그대로 뜬다. */
    try {
      const jr = await fetchT(JP_SRC, { cache: 'force-cache' });
      if (jr.ok) {
        const jj = await jr.json();
        const lang = i18n.lang;
        (jj.spots || []).forEach(s => {
          const nm = s.ko
            ? { text: lang === 'ko' ? s.ko : lang === 'ja' ? s.n : (s.en || s.ko),
                mark: lang === 'ko' ? 'tr' : lang === 'ja' ? 'ja' : (s.en ? 'en' : 'tr') }
            : jpName({ ja: s.n, en: s.en }, lang);
          this.list.push({
            name: nm.text, nameJa: s.n, nameMark: nm.mark,
            lat: s.la, lon: s.lo, region: 'jp', country: 'jp',
            kind: 'jp', kindKo: null, spanM: null,
          });
        });
      }
    } catch (_) { /* 일본이 없어도 한국은 뜬다 */ }

    this.meta = { generated: j.generated, source: j.source, license: j.license,
                  count: j.count, note: j.note };
    return this.list;
  },

  near(lat, lon, n = 12) {
    return this.list
      .map(s => ({ ...s, km: Math.round(distKm(lat, lon, s.lat, s.lon)) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, n);
  },

  byRegion(r) { return this.list.filter(s => s.region === r); },
  regions() { return [...new Set(this.list.map(s => s.region))].sort(); },

  /** 여러 지점의 바다 상태를 한 번에 받는다 (15분 캐시) */
  async sea(items) {
    const fresh = Date.now() - this._seaAt < 15 * 60_000;
    const need = items.filter(s => !(fresh && this._sea.has(s.name)));
    if (!need.length) return this._sea;
    if (!fresh) { this._sea.clear(); this._seaAt = Date.now(); }

    for (let i = 0; i < need.length; i += BATCH) {
      const chunk = need.slice(i, i + BATCH);
      const pts = chunk.map(s => askPoint(s));
      const q = new URLSearchParams({
        latitude: pts.map(p => p[0].toFixed(3)).join(','),
        longitude: pts.map(p => p[1].toFixed(3)).join(','),
        current: MARINE_FIELDS,
        hourly: 'sea_level_height_msl',
        forecast_days: String(N_DAYS),
        timezone: 'auto',
      });
      try {
        const r = await fetchT(`${API.MARINE}?${q}`);
        if (!r.ok) continue;
        const j = await r.json();
        const rows = Array.isArray(j) ? j : [j];
        rows.forEach((row, k) => {
          const c = row?.current;
          const s = chunk[k];
          if (!s || !c) return;
          /* ⚠️ 파고가 없어도 조위는 있을 수 있다(항구 안쪽). 통째로 버리지 않는다 —
             물때만 알려주는 것도 낚시에는 쓸모가 있다. */
          const tide = tideOf(row.hourly);
          if (c.wave_height == null && !tide) return;
          this._sea.set(s.name, {
            waveH: c.wave_height, wavePeriod: c.wave_period,
            swellH: c.swell_wave_height, swellPeriod: c.swell_wave_period,
            windH: c.wind_wave_height,
            sst: c.sea_surface_temperature,
            cur: c.ocean_current_velocity,
            at: c.time, tide,
          });
        });
      } catch (e) {                                          // noqa
        console.warn('[낚시] 바다 조회 실패', e.message);
      }
    }
    return this._sea;
  },

  OFFSHORE_KM,
};
