/* 날씨 서술 — "왜 오늘이 이런 날인가"를 숫자와 함께 한 문장으로
 *
 * 받은 요청: 내 위치 날씨를 **원고처럼** 보여 달라.
 *   원고(영상 스크립트): "이중 열돔에서 벗어난 한반도 / 열기 위에 습도 폭탄 /
 *   습도가 높으면 땀이 안 말라 체감온도 급상승 / 밤에도 안 빠져 초열대야"
 *
 * ⚠️⚠️ 그 원고가 좋은 이유는 형용사가 아니라 **검증 가능한 주장**이라는 것이다.
 *    "덥습니다"가 아니라 "평년보다 상위 5%"다. 그래서 이 파일의 규칙은 하나다:
 *    **숫자 없는 문장은 쓰지 않는다.**
 *
 * ⚠️⚠️ 세 층을 섞지 않는다 (docs/weather-narrative-design.md §0)
 *      ① 상태 — 우리가 잰 숫자          "최저 27.3°C, 평년 상위 10%"
 *      ② 기작 — 교과서에서 인용          "습도가 높으면 땀이 안 마른다"
 *      ③ 전망 — 기관 발표 그대로          기상청 특보
 *    ②를 ①의 숫자 범위 밖으로 늘리지 않는다.
 *    "열돔이라 40도가 될 것이다" ❌ / "평년 상위 5%이고 기상청이 폭염경보를 냈다" ⭕
 *
 * ⚠️⚠️ **평범한 날을 부끄러워하지 않는다.**
 *    매일 나가는 물건은 아무 일 없는 날이 대부분이다. 흔한 실패가 둘인데 둘 다 안 한다.
 *      ❌ 없는 드라마를 만든다 — 27도인데 "숨막히는 더위"
 *      ❌ 아무 말도 안 한다 — 빈칸이면 매일 볼 이유가 없다
 *    → 3단(사건·특징·평온)으로 항상 채우되 **등급을 정직하게 낮춘다.**
 *      매일 극적인 척하면 진짜 위험한 날에 아무도 안 믿는다.
 */

import { fetchT } from './net.js';
import { API } from './config.js';

const IDX = 'data/doy/index.json';
const DOY = s => `data/doy/${s}.json`;

/* 관측소가 이보다 멀면 "가까운 관측소가 없다"고 말한다.
   ⚠️ 40km 를 넘으면 다른 날씨다. 억지로 갖다 붙이면 "평년 대비"가 거짓이 된다. */
const MAX_KM = 40;
/* 고도가 이보다 차이 나면 밝힌다 — 산 위와 산 아래는 같은 날이 아니다. */
const ALT_WARN_M = 300;

/* ── 기상청 공식 기준 ────────────────────────────────────────
   ⚠️ 우리가 정한 값이 하나도 없다. 전부 기상청이 쓰는 정의다.
      우리 기준을 섞는 순간 "지어낸 판정"이 된다. */
const KMA = {
  tropicalNight: 25,      // 열대야   — 밤 최저기온 25°C 이상
  superTropical: 30,      // 초열대야 — 30°C 이상
  heatWatch: 33,          // 폭염주의보 — 체감온도 33°C 이상 이틀
  heatWarn: 35,           // 폭염경보   — 35°C 이상 이틀
  coldWatch: -12,         // 한파주의보 — 아침 최저 -12°C 이하
};

/* 조사 — ⚠️ 받침에 따라 "이/가", "은/는" 이 갈린다.
   실측에서 "습도**이** 평년보다 높습니다"가 나왔다. 한국어 화면에서 이건 바로 티가 난다. */
function josa(word, withBatchim, without) {
  const c = String(word || '').trim().slice(-1);
  const code = c.charCodeAt(0);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return without;
  return ((code - 0xac00) % 28) ? withBatchim : without;
}
const iGa = w => josa(w, '이', '가');

function km(a1, o1, a2, o2) {
  const R = 6371, r = Math.PI / 180;
  const dl = (o2 - o1) * r, dp = (a2 - a1) * r;
  const h = Math.sin(dp / 2) ** 2
    + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** 값이 평년 분위수 어디쯤인가 → 백분위(0~100).
 *  ⚠️ 분위수 사이는 선형 보간이다. 끝을 넘으면 5 미만 / 95 초과로만 말한다 —
 *     30년 450개 표본으로 "상위 1%"를 말할 근거가 없다. */
function pct(qs, cuts, v) {
  if (v == null || !cuts) return null;
  if (v <= cuts[0]) return { p: qs[0], edge: 'below' };
  if (v >= cuts[cuts.length - 1]) return { p: qs[qs.length - 1], edge: 'above' };
  for (let i = 1; i < cuts.length; i++) {
    if (v <= cuts[i]) {
      const f = (v - cuts[i - 1]) / ((cuts[i] - cuts[i - 1]) || 1);
      return { p: Math.round(qs[i - 1] + (qs[i] - qs[i - 1]) * f), edge: null };
    }
  }
  return null;
}

/* 백분위를 **일상어**로. ⚠️⚠️ "상위 5%"는 통계를 아는 사람의 말이다 —
   받은 지적: "쉬운 단어를 써서 작성해줘 그런 전문 용어는 일반인들은 몰라"
   → "스무 번에 한 번"으로 바꾼다. 5% = 1/20, 10% = 1/10 이라 산수가 그대로 맞다.
   ⚠️ 숫자를 **지우지는 않는다.** 쉬운 말이 앞, 정확한 값은 괄호 안에 남긴다.
      지워 버리면 "믿을 만한가"를 독자가 확인할 방법이 사라진다.
   ⚠️ "20년에 한 번"이라고는 안 쓴다 — 이건 연 최댓값 분포가 아니라
      **같은 날짜(±7일) 기록의 분포**다. 재현기간과 다른 개념이다. */
function howOften(p) {
  if (p == null) return null;
  const hi = p >= 50;
  const tail = hi ? 100 - p : p;
  const n = tail <= 5 ? '스무 번' : tail <= 10 ? '열 번' : tail <= 25 ? '네 번' : null;
  if (!n) return null;
  return `예년 같은 날짜 ${n}에 한 번 있을까 하게 ${hi ? '높습니다' : '낮습니다'}`;
}

/* ── 체감온도 — 공식이 여럿이고 서로 다른 값을 낸다 ────────────
   ⚠️⚠️ 하나만 쓰면 그 공식의 가정(그늘·미풍 등)이 숨는다.
      셋을 나란히 놓고 **몇 개가 위험 단계인지**로 결론을 낸다.
   ⚠️ 단위와 척도가 서로 다르다(Humidex 는 °C 가 아니라 지수).
      숫자를 같은 축에 놓고 비교하지 않는다 — 등급으로만 합산한다. */
function heatIndexNWS(t, rh) {
  // 미국 NWS Rothfusz 회귀식. ⚠️ 화씨로 계산해 섭씨로 되돌린다.
  if (t == null || rh == null) return null;
  const f = t * 9 / 5 + 32;
  if (f < 80) return t;
  let hi = -42.379 + 2.04901523 * f + 10.14333127 * rh
    - 0.22475541 * f * rh - 0.00683783 * f * f - 0.05481717 * rh * rh
    + 0.00122874 * f * f * rh + 0.00085282 * f * rh * rh
    - 0.00000199 * f * f * rh * rh;
  if (rh < 13 && f >= 80 && f <= 112) {
    hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(f - 95)) / 17);
  }
  return Math.round(((hi - 32) * 5 / 9) * 10) / 10;
}

function humidex(t, dew) {
  // 캐나다 환경부. ⚠️ 이슬점 기반이라 습도 기반 공식과 다르게 반응한다.
  if (t == null || dew == null) return null;
  const e = 6.11 * Math.exp(5417.7530 * (1 / 273.16 - 1 / (dew + 273.15)));
  return Math.round((t + 0.5555 * (e - 10)) * 10) / 10;
}

function kmaFeel(t, rh) {
  /* 기상청 여름 체감온도 — 습구온도를 거쳐 낸다(Stull 근사).
     ⚠️ 국내 폭염특보의 근거가 이 값이다. */
  if (t == null || rh == null) return null;
  const tw = t * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(t + rh) - Math.atan(rh - 1.67633)
    + 0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035;
  return Math.round((-0.2442 + 0.55399 * tw + 0.45535 * t
    - 0.0022 * tw * tw + 0.00278 * tw * t + 3.0) * 10) / 10;
}

/** 단계 — ⚠️ 기상청 폭염 기준(33/35°C)에 맞춘다. 우리가 정한 값이 아니다. */
function heatLevel(v) {
  if (v == null) return null;
  if (v >= KMA.heatWarn) return 'danger';
  if (v >= KMA.heatWatch) return 'watch';
  return 'ok';
}

export const narrative = {
  _idx: null,
  _doy: new Map(),

  async index() {
    if (this._idx) return this._idx;
    try {
      const r = await fetchT(IDX, { cache: 'force-cache' });
      this._idx = r.ok ? await r.json() : { stations: [] };
    } catch (_) { this._idx = { stations: [] }; }
    return this._idx;
  },

  /** 가장 가까운 관측소의 평년 분위수 표 */
  async normalsAt(lat, lon) {
    const idx = await this.index();
    let best = null, bd = Infinity;
    (idx.stations || []).forEach(s => {
      const d = km(lat, lon, s.la, s.lo);
      if (d < bd) { bd = d; best = s; }
    });
    /* ⚠️ 멀면 안 쓴다. 40km 넘게 떨어진 관측소로 "평년 대비"를 말하면
       그 숫자가 이 자리의 것이 아니다. */
    if (!best || bd > MAX_KM) return { station: best, km: bd, tooFar: true, doy: null };
    if (!this._doy.has(best.s)) {
      try {
        const r = await fetchT(DOY(best.s), { cache: 'force-cache' });
        this._doy.set(best.s, r.ok ? await r.json() : null);
      } catch (_) { this._doy.set(best.s, null); }
    }
    return { station: best, km: Math.round(bd), doy: this._doy.get(best.s) };
  },

  /** 오늘 한반도 상태 판정 — 어제와 달라졌는지.
   *  ⚠️⚠️ 원고의 제목이 **"이중 열돔에서 벗어난"** 이다. 값이 아니라 **바뀜**이 기사다.
   *  ⚠️ 화면에서 그때그때 계산하면 오늘 값밖에 없어 "벗어났다"를 영영 못 쓴다 —
   *     air-state Lambda 가 매일 판정을 남기고, 여기서는 읽기만 한다.
   *  ⚠️ 하루 튐으로 쓰지 않는다. Lambda 가 **연속 2일** 확인한 것(publish)만 쓴다. */
  async state() {
    if (this._state !== undefined) return this._state;
    try {
      const r = await fetchT(`${API.WIND}/air-state.json`, { cache: 'no-cache' });
      this._state = r.ok ? await r.json() : null;
    } catch (_) { this._state = null; }
    return this._state;
  },

  /** 지금 살아 있는 태풍 — 원고의 "태풍까지 북상하면" 자리.
   *  ⚠️ 실패해도 나머지 문단은 그대로 나와야 한다. */
  async cyclones() {
    try {
      const r = await fetchT(`${API.EVENTS}/typhoon-official.json`, { cache: 'no-cache' });
      if (!r.ok) return [];
      const j = await r.json();
      return (j.storms || []).map(s => {
        const g = (s.agencies || [])[0];
        const now = (g?.steps || []).find(x => x.h === 0) || (g?.steps || [])[0];
        if (now?.lat == null) return null;
        /* ⚠️⚠️ **이름 없는 열대저압부가 있다.** 아직 태풍으로 승격 전이면 이름이 없고
           번호만 있는데, 그 번호가 'b' 한 글자일 때가 있다 —
           실측 화면에 "지금 **B** 가 2,416km" 라고 나왔다.
           → 두 글자 미만이면 이름으로 쓰지 않는다. 그냥 "열대저압부"라고 적는다.
           ⚠️ 없는 이름을 지어내지 않는다. 모르면 모른다고 부른다. */
        const raw = String(s.name || '').trim();
        const named = raw.length >= 2;
        /* 기상청 호수("2026-13호") — 한국 뉴스가 실제로 부르는 이름이다.
           ⚠️ 로마자 이름에는 "이/가" 규칙이 안 통한다("Dolphin 가"가 화면에 나왔다).
              "13호 태풍"으로 부르면 **한글로 끝나 조사가 저절로 맞는다.** */
        const kn = (s.agencies || []).find(a => a.agency === 'KMA')?.number;
        const no = /(\d+)호/.exec(kn || '')?.[1] || null;
        return { name: named ? raw : '열대저압부', named, no,
                 lat: now.lat, lon: now.lon };
      }).filter(Boolean);
    } catch (_) { return []; }
  },

  /** 오늘 상층·수증기·불안정 — 원고의 "습도 폭탄 / 물폭탄의 재료" 자리 */
  async air(lat, lon) {
    const q = new URLSearchParams({
      latitude: lat.toFixed(3), longitude: lon.toFixed(3),
      current: 'temperature_2m,relative_humidity_2m,dew_point_2m,'
             + 'apparent_temperature,precipitation,cloud_cover,cape,'
             + 'wind_speed_10m,pressure_msl',
      daily: 'temperature_2m_max,temperature_2m_min',
      wind_speed_unit: 'ms', timezone: 'auto', forecast_days: '2',
    });
    try {
      const r = await fetchT(`https://api.open-meteo.com/v1/forecast?${q}`);
      if (!r.ok) return null;
      return await r.json();
    } catch (_) { return null; }
  },

  /* ══ 서술 만들기 ═══════════════════════════════════════════
     돌려주는 것: { level, head, num, why, rows, sources, caveats }
     ⚠️ 못 내는 항목은 **빼고 낸다.** 추정으로 메우지 않는다. */
  async build(lat, lon, ko = true) {
    const [nrm, air, st, tc] = await Promise.all([
      this.normalsAt(lat, lon), this.air(lat, lon), this.state(), this.cyclones(),
    ]);
    const c = air?.current;
    if (!c) return null;

    const t = c.temperature_2m, rh = c.relative_humidity_2m, dew = c.dew_point_2m;
    const tmax = air?.daily?.temperature_2m_max?.[0];
    const tmin = air?.daily?.temperature_2m_min?.[0];
    // ⚠️ 오늘 밤 최저는 **내일 아침** 값이다. 오늘 낮에 오늘 최저를 보면 새벽값이라 뜻이 다르다
    const tminTonight = air?.daily?.temperature_2m_min?.[1] ?? tmin;

    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}`
      + `${String(now.getDate()).padStart(2, '0')}`;
    const cell = nrm?.doy?.doy?.[mmdd] || null;
    const qs = nrm?.doy?.qs || null;

    const P = (fld, v) => (cell?.[fld] && qs) ? pct(qs, cell[fld].q, v) : null;
    const pTmax = P('tmax', tmax), pTmin = P('tmin', tmin), pHm = P('hm', rh);

    /* ── ① 상태 ─────────────────────────────────────── */
    const rows = [];
    const feel = {
      kma: kmaFeel(t, rh), nws: heatIndexNWS(t, rh), hx: humidex(t, dew),
    };
    const lv = [heatLevel(feel.kma), heatLevel(feel.nws), heatLevel(feel.hx)]
      .filter(Boolean);
    const hot = lv.filter(x => x !== 'ok').length;

    /* ⚠️ pct() 는 {p, edge} 객체를 준다. 화면 막대는 **숫자**를 기대한다 —
       객체를 그대로 넘겨 Math.min(98, r.p) 이 NaN 이 되고 막대가 깨졌다(실측).
       여기서 숫자로 풀어 내보낸다. */
    const num = x => (x && typeof x.p === 'number') ? x.p : null;
    if (tmax != null) {
      rows.push({ k: ko ? '오늘 최고' : 'High', v: `${tmax.toFixed(1)}°`,
                  p: num(pTmax), fld: 'tmax' });
    }
    if (tminTonight != null) {
      rows.push({ k: ko ? '오늘 밤 최저' : 'Tonight low', v: `${tminTonight.toFixed(1)}°`,
                  p: num(P('tmin', tminTonight)), fld: 'tmin' });
    }
    if (rh != null) rows.push({ k: ko ? '습도' : 'Humidity', v: `${Math.round(rh)}%`, p: num(pHm), fld: 'hm' });
    /* ⚠️ 이름은 쉬운 말로, 값에는 원래 단위를 남긴다 —
       이름만 쉬우면 못 읽고, 값까지 바꾸면 확인할 수가 없다. */
    if (c.cape != null) rows.push({ k: ko ? '위로 솟구치는 힘(CAPE)' : 'CAPE', v: `${Math.round(c.cape)} J/kg` });

    /* ── 헤드라인 고르기 ─────────────────────────────
       ⚠️⚠️ **가장 이례적인 것 하나만** 고른다. 여러 개를 늘어놓으면 무엇이 오늘의
          일인지 사라진다. 원고도 한 가지("이중 열돔에서 벗어난")로 시작한다. */
    const cands = [];

    // 초열대야·열대야 — 기상청 정의
    if (tminTonight != null && tminTonight >= KMA.superTropical) {
      cands.push({ w: 100, level: 'event',
        head: ko ? `오늘 밤 **초열대야**입니다` : 'Super tropical night tonight',
        num: ko ? `최저 ${tminTonight.toFixed(1)}°C` : `low ${tminTonight.toFixed(1)}°C`,
        why: ko ? '밤 최저기온이 30°C 아래로 내려가지 않는 밤을 기상청은 초열대야라 부릅니다. '
                + '낮에 데워진 열이 밤새 빠지지 않는다는 뜻입니다.' : '' });
    } else if (tminTonight != null && tminTonight >= KMA.tropicalNight) {
      cands.push({ w: 70, level: 'event',
        head: ko ? `오늘 밤 **열대야**입니다` : 'Tropical night tonight',
        num: ko ? `최저 ${tminTonight.toFixed(1)}°C` : `low ${tminTonight.toFixed(1)}°C`,
        why: ko ? '밤 최저기온이 25°C 아래로 내려가지 않는 밤입니다 (기상청 정의).' : '' });
    }

    // 체감 — 여러 공식이 함께 위험을 가리킬 때만
    if (hot >= 2 && feel.kma != null) {
      cands.push({ w: 85, level: 'event',
        head: ko ? `체감온도가 **${feel.kma.toFixed(1)}°C** 입니다`
                 : `Feels like ${feel.kma.toFixed(1)}°C`,
        num: ko ? `공식 ${lv.length}개 중 ${hot}개가 폭염 단계` : `${hot} of ${lv.length} formulas in heat range`,
        why: ko ? '습도가 높으면 땀이 잘 마르지 않아 몸이 열을 못 버립니다. '
                + '같은 기온이라도 체감이 크게 오르는 이유입니다.' : '' });
    }

    // 평년 대비 — 상위/하위 10% 밖
    const odd = [['tmax', pTmax, ko ? '낮 기온' : 'daytime high'],
                 ['tmin', P('tmin', tminTonight), ko ? '밤 기온' : 'night low'],
                 ['hm', pHm, ko ? '습도' : 'humidity']]
      .filter(([, p]) => p && (p.p >= 90 || p.p <= 10));
    odd.forEach(([fld, p, label]) => {
      const high = p.p >= 90;
      const v = fld === 'hm' ? `${Math.round(rh)}%`
              : `${(fld === 'tmax' ? tmax : tminTonight).toFixed(1)}°C`;
      cands.push({ w: 50 + Math.abs(p.p - 50), level: 'feature',
        head: ko ? `${label}${iGa(label)} 평년보다 **${high ? '높습니다' : '낮습니다'}**`
                 : `${label} is ${high ? 'above' : 'below'} normal`,
        num: ko ? `${v} — ${high ? '상위' : '하위'} ${high ? 100 - p.p : p.p}%`
                : `${v} — ${high ? 'top' : 'bottom'} ${high ? 100 - p.p : p.p}%`,
        why: ko ? (howOften(p.p) ? `${howOften(p.p)}. ` : '')
                + `${nrm.doy.from}~${nrm.doy.to}년 같은 날짜(앞뒤 ${nrm.doy.winDays}일까지) `
                + `${cell[fld].n}번을 세어 낸 값입니다.` : '' });
    });

    // 호우 잠재 — ⚠️ 둘 다 충족할 때만. 하나만으론 안 부른다
    if (c.cape != null && c.cape >= 1000 && rh != null && rh >= 75) {
      cands.push({ w: 80, level: 'event',
        head: ko ? '비구름이 커지기 쉬운 상태입니다' : 'Unstable and humid',
        num: ko ? `CAPE ${Math.round(c.cape)} J/kg · 습도 ${Math.round(rh)}%` : '',
        why: ko ? '공기가 위로 솟구치려는 힘이 세고 물기도 많으면, 소나기가 한번 서면 '
                + '갑자기 굵어질 수 있습니다. '
                + '⚠️ 이건 지금 상태이지 비가 온다는 예보가 아닙니다.' : '' });
    }

    /* ── 상태 전이 — ⚠️⚠️ **이게 가장 앞선다.** ────────────────
       원고의 제목이 "벗어난"이다. 오늘 값이 어떤가보다 **어제와 달라졌는가**가 기사다.
       ⚠️ Lambda 가 연속 2일 확인한 것(publish)만 쓴다. 하루 튐으로 쓰지 않는다. */
    const pub = st?.publish;
    if (pub && (pub.left?.length || pub.entered?.length)) {
      const L = { 초열대야: '초열대야', 열대야: '열대야',
                  고온: '예년보다 더운 상태', 저온: '예년보다 서늘한 상태',
                  다습: '하늘에 물기가 많은 상태', 건조: '하늘이 마른 상태',
                  불안정: '공기가 들뜬 상태', 열돔: '열돔', 이중열돔: '이중 열돔' };
      if (pub.left?.length) {
        const w = pub.left.map(x => L[x] || x).join('·');
        cands.push({ w: 999, level: 'event',
          head: ko ? `한반도가 **${w}에서 벗어났습니다**` : `Left ${w}`,
          num: ko ? `${st.date} 판정 · 어제와 비교` : st.date,
          why: ko ? '남·중·북 세 곳 중 둘 이상에서 그 상태가 사라졌고, '
                  + '이틀 연속 확인해 알려드립니다. ⚠️ 하루 변덕으로는 쓰지 않습니다.' : '' });
      } else {
        const w = pub.entered.map(x => L[x] || x).join('·');
        cands.push({ w: 998, level: 'event',
          head: ko ? `한반도가 **${w}에 들어섰습니다**` : `Entered ${w}`,
          num: ko ? `${st.date} 판정 · 어제와 비교` : st.date,
          why: ko ? '남·중·북 세 곳 중 둘 이상에서 그 상태가 나타났고, '
                  + '이틀 연속 확인해 알려드립니다.' : '' });
      }
    }

    /* 전이가 없어도 오늘 상태는 말할 수 있다.
       ⚠️ 가중치를 낮게 둔다 — 지점별 특징(위 후보들)이 더 구체적이면 그쪽이 먼저다. */
    const mine = st?.points?.find(p => Math.abs(p.lat - lat) < 2.2);

    /* ── 열돔 — ⚠️⚠️ 원고의 첫 문장이 이것이다 ─────────────────
       "이중 열돔에서 벗어난 한반도".
       ⚠️⚠️ **"열돔"은 공식 기상 용어가 아니라 언론 표현이다.** 우리가 쓰려면
          "우리는 이런 기준으로 그렇게 부른다"를 반드시 함께 적어야 한다 —
          안 적으면 지어낸 말이 된다. 그래서 why 에 기준을 박아 둔다. */
    const dome = st?.national?.includes('이중열돔') ? 2
               : st?.national?.includes('열돔') ? 1 : 0;
    if (dome && mine?.vals?.pH500 != null) {
      const v = mine.vals;
      cands.push({ w: 120, level: 'event',
        head: ko ? (dome === 2 ? '한반도가 **이중 열돔** 상태입니다'
                               : '한반도가 **열돔** 상태입니다')
                 : (dome === 2 ? 'Double heat dome' : 'Heat dome'),
        num: ko ? `하늘이 평년보다 ${Math.round(v.h500 - v.h500Normal)}m 더 부풀었습니다 `
                + `(약 5.9km 상공 ${Math.round(v.h500).toLocaleString()}m · 상위 ${100 - v.pH500}%)`
                + (dome === 2 && v.pH200 != null
                    ? ` · 약 12km 상공도 상위 ${100 - v.pH200}%` : '') : '',
        why: ko
          ? '더워진 공기는 부풀어 오릅니다. 그래서 하늘이 얼마나 부풀었는지를 재면 '
            + '아래가 얼마나 뜨거운지를 알 수 있습니다. '
            + '⚠️ "열돔"은 공식 기상 용어가 아니라 언론 표현입니다. '
            + '저희는 <b>약 5.9km 상공(500hPa)의 높이가 예년 열 번 중 한 번 있을까 하게 클 때</b> '
            + '그렇게 부르고, <b>약 12km 상공(200hPa)까지 그러면</b> "이중"이라고 씁니다 — '
            + '뜨거운 공기가 두 겹으로 덮였다는 뜻입니다. '
            + '뚜껑이 덮이면 공기가 눌려 내려오면서 데워지고, 구름이 못 생겨 '
            + '햇볕이 그대로 들어옵니다. '
            + '⚠️ 남·중·북 세 곳 중 둘 이상에서 나와야 "한반도"라고 씁니다.'
          : '' });
    }

    if (mine?.vals?.pTcwv != null && (mine.vals.pTcwv >= 90 || mine.vals.pTcwv <= 10)) {
      const many = mine.vals.pTcwv >= 90;
      cands.push({ w: 55, level: 'feature',
        head: ko ? `하늘에 든 물기가 예년보다 **${many ? '많습니다' : '적습니다'}**`
                 : `Column water vapour ${many ? 'above' : 'below'} normal`,
        num: ko ? `짜면 ${mine.vals.tcwv?.toFixed(0)}mm — 평년 ${mine.vals.tcwvNormal}mm `
                + `· ${many ? '상위' : '하위'} ${many ? 100 - mine.vals.pTcwv : mine.vals.pTcwv}%` : '',
        why: ko
          ? '머리 위 하늘을 통째로 쥐어짰을 때 나올 물의 깊이입니다(가강수량). '
            + (many ? '많으면 소나기가 굵어지기 쉽습니다.' : '적으면 소나기가 커지기 어렵습니다.')
            + ' ⚠️ 땅바닥에서 재는 습도와는 다른 값입니다 — '
            + '발밑만 눅눅하고 하늘은 마를 수 있습니다.'
          : '' });
    }

    cands.sort((a, b) => b.w - a.w);
    let pick = cands[0];

    /* ── 평온 — ⚠️ 부끄러워하지 않는다 ────────────────
       평년 범위라고 말해주는 것도 정보다. 매일 극적인 척하면
       진짜 위험한 날에 아무도 안 믿는다. */
    if (!pick) {
      const bits = [];
      if (pTmax) bits.push(ko ? `낮 ${tmax.toFixed(1)}°C(평년 ${cell.tmax.q[3]}°C)` : '');
      if (pHm) bits.push(ko ? `습도 ${Math.round(rh)}%(평년 ${cell.hm.q[3]}%)` : '');
      pick = { level: 'calm',
        head: ko ? '특별한 것이 없는 날입니다' : 'Nothing unusual today',
        num: bits.join(' · '),
        why: ko ? '기온·습도 모두 평년 범위 안에 있습니다.' : '' };
    }

    /* ── 출처·한계 — ⚠️ 접혀 있어도 **존재해야** 한다 ── */
    const sources = [];
    if (nrm?.doy) {
      sources.push(ko
        ? `평년 분포 — 기상청 ASOS ${nrm.doy.name} 관측소 (${nrm.km}km) · `
          + `${nrm.doy.from}~${nrm.doy.to}년`
        : `Normals — KMA ASOS ${nrm.doy.name}`);
    }
    sources.push(ko ? '지금 값 — Open-Meteo (GFS/ECMWF)' : 'Now — Open-Meteo');
    sources.push(ko ? '열대야·폭염 기준 — 기상청 정의' : 'Thresholds — KMA definitions');
    if (st?.national?.length) {
      sources.push(ko
        ? `오늘 한반도 상태 — ${st.national.join(' · ')} (${st.date}, 남·중·북 3점 중 2점 이상)`
        : `Today: ${st.national.join(', ')}`);
    }
    if (dome) {
      sources.push(ko
        ? '상층 고도 평년 — NOAA NCEP/NCAR 재분석 1995~2026 · ⚠️ 재분석은 모델이 '
          + '관측을 끌어안아 만든 값이지 순수 실측이 아닙니다'
        : 'Upper-air normals — NOAA NCEP/NCAR Reanalysis (not pure observation)');
    }

    const caveats = [];
    if (nrm?.tooFar) {
      caveats.push(ko
        ? `⚠️ 가장 가까운 관측소가 ${Math.round(nrm.km)}km 떨어져 있어 **평년 대비는 내지 않았습니다.**`
        : '⚠️ Nearest station too far — no normal comparison.');
    } else if (nrm?.doy && nrm.station?.a != null) {
      caveats.push(ko
        ? `평년 비교는 ${nrm.doy.name} 관측소(${nrm.km}km, ${Math.round(nrm.station.a)}m) 기준입니다.`
        : '');
    }
    caveats.push(ko
      ? '⚠️ 이 글은 **예보가 아닙니다.** 지금 잰 값과 30년 기록을 견준 것입니다.'
      : '⚠️ Not a forecast — measured values compared against 30 years.');

    /* ══ 문단 — 원고처럼 ═══════════════════════════════════════
       받은 요청: 영상 스크립트를 보여주며 "이런 식으로 원고 작성 해달라는거야".

       원고의 뼈대를 그대로 따른다:
         ① 상태      "이중 열돔에서 벗어난 한반도"
         ② 무엇이 겹쳤나 "여기에 남쪽 수증기까지 더해져 열기 위에 습도 폭탄"
         ③ 왜 문제인가  "습도가 높으면 땀이 안 말라 → 열이 안 빠져 → 체감 급상승"
         ④ 그래서 무엇이 "밤에도 안 빠져 초열대야"
         ⑤ 앞으로 변수  "태풍까지 북상하면 폭염을 키우거나 비구름을 만든다"

       ⚠️⚠️ **각 문장은 해당 값이 실제로 그럴 때만 나온다.**
          초열대야가 아니면 그 문장이 없다. 수증기가 적으면 **반대로** 적는다.
          원고를 흉내내려고 없는 문장을 채우면 그날부터 이 화면은 거짓이 된다.
       ⚠️ 인과 사슬(③)은 교과서 내용이라 인용해도 되지만,
          **앞의 조건이 측정으로 참일 때만** 붙인다.
       ⚠️ "폭염 3배 레버리지" 같은 비유는 쓰지 않는다 — 세기를 지어내는 말이다.
          대신 "지표 셋이 동시에 상위 10%"처럼 **센 것을 센 만큼** 적는다. */
    const story = [];
    const S = t => { if (t) story.push(t); };

    /* ── 날마다 다른 말투 ──────────────────────────────────────────
       받은 지적: "이 글은 어제도 오늘도 같아. 매번은 아니어도 하루하루
       다르게 작성되게 해줘" — 값이 같으면 문장까지 똑같았다.
       사실과 숫자는 그대로 두고 **표현만** 날짜로 고른다.
       ⚠️ Math.random 은 안 쓴다. 같은 날 안에서 새로고침마다 글이 바뀌면
          고장으로 읽힌다 — 날짜가 넘어갈 때만 바뀌어야 한다.
       ⚠️ slot 을 문장마다 다르게 줘서 온 글이 한꺼번에 같은 순번으로
          돌지 않게 한다. */
    const dSeed = (() => { const d = new Date();
      return d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate(); })();
    const vary = (slot, arr) => arr[(dSeed + slot) % arr.length];

    if (ko) {
      // ① 상태
      if (dome) {
        const up = Math.round(mine.vals.h500 - mine.vals.h500Normal);
        const domeTail = `${howOften(mine.vals.pH500) || '평소보다 높습니다'} `
          + `(약 5.9km 상공 ${Math.round(mine.vals.h500).toLocaleString()}m · `
          + `평년 ${Math.round(mine.vals.h500Normal).toLocaleString()}m).`;
        S(vary(0, [
          `더워진 공기는 풍선처럼 부풉니다. 지금 머리 위 하늘이 평소보다 `
            + `${up}m 더 부풀어 올라 있습니다 — ` + domeTail,
          `하늘에도 키가 있습니다. 더운 공기가 쌓이면 하늘이 위로 붓는데, `
            + `오늘은 평소보다 ${up}m 높습니다 — ` + domeTail,
          `오늘 머리 위 하늘은 평소보다 ${up}m 부어올라 있습니다. 더워진 공기가 `
            + `그만큼 자리를 차지하고 있다는 뜻입니다 — ` + domeTail,
        ]));
        S(dome === 2 && mine.vals.pH200 != null
          ? vary(1, [
              `더 높은 하늘(약 12km)도 똑같이 부풀어 있습니다. 뜨거운 공기가 한 겹이 `
                + `아니라 **두 겹**으로 덮여 있다는 뜻이고, 저희는 이걸 이중 열돔이라 부릅니다.`,
              `약 12km 상공도 같은 모양으로 부풀어 있습니다. 아래위 **두 겹**이 함께 `
                + `덮인 상태 — 저희는 이걸 이중 열돔이라 부릅니다.`,
            ])
          : vary(1, [
              `뜨거운 공기가 뚜껑처럼 덮여 있는 셈이고, 저희는 이걸 열돔이라 부릅니다.`,
              `말하자면 뜨거운 공기 덮개가 얹힌 상태입니다 — 저희는 이걸 열돔이라 부릅니다.`,
            ]));
        S(vary(2, [
          '뚜껑이 덮이면 구름이 잘 생기지 않습니다. 햇볕이 가려지지 않고 그대로 내리쬐고, '
            + '위에서 공기가 눌러 내려오면서 한 번 더 데워집니다.',
          '덮개 아래에서는 공기가 가라앉습니다. 가라앉는 공기는 데워지고, 구름은 설 자리를 '
            + '잃어 햇볕이 그대로 꽂힙니다.',
          '이렇게 덮이면 구름을 만들 상승기류가 눌립니다. 해는 종일 그대로 내리쬐고, '
            + '내려앉는 공기가 데워지며 더위가 한 겹 더 쌓입니다.',
        ]));
      }

      /* ② 무엇이 겹쳤나 — 하늘의 물기
         ⚠️ "가강수량 62 kg/m²"는 일반 독자에게 아무 그림도 못 그려 준다.
            1 kg/m² = 물 1mm 라 **"하늘을 짜면 나올 물의 깊이"**로 그대로 바꿔 쓸 수 있다.
            단위 환산이지 근사가 아니다 — 물 1kg 을 1m² 에 펴면 정확히 1mm 다. */
      const wp = mine?.vals?.pTcwv;
      if (wp != null) {
        if (wp >= 90) {
          S(`여기에 남쪽 바다에서 올라온 물기까지 겹쳤습니다. 지금 머리 위 하늘을 `
            + `통째로 쥐어짜면 물 ${mine.vals.tcwv?.toFixed(0)}mm 가 나옵니다 — `
            + `평소 이맘때는 ${mine.vals.tcwvNormal}mm 입니다. `
            + `**뜨거운 공기 위에 물기가 얹힌** 셈입니다.`);
        } else if (wp <= 10) {
          S(`다만 하늘의 물기는 적습니다. 머리 위 하늘을 통째로 쥐어짜도 물 `
            + `${mine.vals.tcwv?.toFixed(0)}mm 밖에 안 나옵니다 — `
            + `평소 이맘때는 ${mine.vals.tcwvNormal}mm 입니다. `
            + `⚠️ 아래에 나오는 습도(${rh != null ? Math.round(rh) + '%' : '—'})와는 다른 이야기입니다. `
            + `발밑은 눅눅한데 하늘은 말라 있습니다.`);
        }
      }

      /* ③ 왜 문제인가 — 체감
         ⚠️ 앞 문장에서 "하늘의 물기는 적다"고 했는데 여기서 "습도가 높으면"으로 시작하면
            앞뒤가 어긋나 읽힌다. 땅바닥 습도를 **먼저 말해** 무엇을 가리키는지 분명히 한다. */
      if (hot >= 1 && feel.kma != null) {
        const feelTail = `체감온도 계산법 ${lv.length}가지 중 ${hot}가지가 폭염 구간을 `
          + `가리키고, 기상청 방식으로는 ${feel.kma.toFixed(1)}°C 입니다.`;
        S(vary(3, [
          `땅바닥 습도는 ${rh != null ? Math.round(rh) : '—'}% 입니다. `
            + `습도가 높으면 땀이 잘 마르지 않습니다. `
            + `땀이 마르면서 열을 가져가야 몸이 식는데 그게 안 되니, `
            + `같은 기온이라도 훨씬 덥게 느껴집니다 — ` + feelTail,
          `땅바닥 습도 ${rh != null ? Math.round(rh) : '—'}% — 이 정도면 땀이 더디게 `
            + `마릅니다. 몸은 땀이 마를 때 식는데 그 길이 막혀, 같은 기온도 더 덥게 `
            + `느껴집니다 — ` + feelTail,
        ]));
      }

      // ④ 그래서 무엇이 — 밤
      if (tminTonight != null) {
        if (tminTonight >= KMA.superTropical) {
          S(`낮에 달궈진 열이 밤에도 빠지지 않습니다. 오늘 밤 가장 낮은 기온이 `
            + `${tminTonight.toFixed(1)}°C 입니다 — 밤새 30°C 아래로 내려가지 않는 밤을 `
            + `기상청은 **초열대야**라고 부릅니다.`);
        } else if (tminTonight >= KMA.tropicalNight) {
          S(vary(4, [
            `낮에 달궈진 열이 밤에도 덜 빠집니다. 오늘 밤 가장 낮은 기온이 `
              + `${tminTonight.toFixed(1)}°C 입니다 — 밤새 25°C 아래로 내려가지 않는 밤을 `
              + `기상청은 **열대야**라고 부릅니다.`,
            `오늘 밤 최저가 ${tminTonight.toFixed(1)}°C 에 그칩니다. 25°C 밑으로 못 `
              + `내려가는 밤 — 기상청이 **열대야**라고 부르는 밤입니다.`,
          ]));
        } else if (dome) {
          S(`다만 밤에는 ${tminTonight.toFixed(1)}°C 까지 내려갑니다. `
            + `열대야 기준(25°C)보다는 낮습니다.`);
        }
      }

      /* ⑤ 소나기 재료
         ⚠️⚠️ CAPE 를 "대기 불안정도"라고만 적으면 그것도 전문 용어다.
            **용수철** 비유로 쓴다 — 감긴 만큼 튀어 오른다는 것이 CAPE 의 정의 그대로다.
         ⚠️ 그리고 CAPE 는 **에너지지 방아쇠가 아니다.** 감긴 용수철도 놓아 주는 손이
            없으면 그대로다. "힘이 세다 = 비가 온다"로 읽히지 않게 반드시 덧붙인다. */
      if (c.cape != null && c.cape >= 1000) {
        const spring = `공기가 위로 솟구치려는 힘이 용수철처럼 감겨 있습니다`
                     + `(세기 ${Math.round(c.cape).toLocaleString()} — 1,000이 넘으면 센 편입니다)`;
        if (wp != null && wp >= 90) {
          S(`그 물기가 소나기의 재료가 됩니다. ${spring} — `
            + `한번 터지면 빗줄기가 갑자기 굵어질 수 있습니다.`);
        } else if (wp != null && wp <= 10) {
          S(`${spring}. 다만 비로 만들 물기가 적어서, `
            + `소나기가 서더라도 오래 가기는 어렵습니다.`);
        } else {
          S(`${spring}. 소나기가 설 수 있는 상태입니다.`);
        }
        S('⚠️ 힘이 감겨 있다고 반드시 터지는 것은 아닙니다. '
          + '찬 공기가 들어오거나, 산을 타고 오르거나, 바닷바람이 부딪치는 것 같은 '
          + '방아쇠가 있어야 실제로 소나기가 됩니다.');
      }

      /* ⑤-b 앞으로의 변수 — 태풍
         원고: "여기에 태풍까지 북상하면 폭염을 더 키우거나 강력한 비구름을 만들기도 한다"
         ⚠️⚠️ **진로를 단정하지 않는다.** "온다/안 온다"는 우리가 할 말이 아니다 —
            기관 예보를 옮길 뿐이고, 여기서는 **있다는 사실과 거리**만 적는다.
         ⚠️ 우리 쪽으로 오는지도 말하지 않는다. 그건 태풍 화면에서 기관별 예보선으로 본다. */
      if (tc?.length) {
        const near = tc.map(x => ({ ...x, km: Math.round(km(lat, lon, x.lat, x.lon)) }))
          .sort((a, b) => a.km - b.km)[0];
        if (near && near.km < 3500) {
          /* ⚠️ 태풍 이름은 로마자가 많다(Dolphin·Genevieve). 받침 규칙이 안 통하므로
             로마자면 "가"로 둔다 — "Genevieve 이"가 실측 화면에 나왔다. */
          /* ⚠️ 이름을 **한글로 끝내** 조사를 맞춘다. 로마자 이름은 괄호로 뺀다. */
          const who = near.named
            ? (near.no ? `**${near.no}호 태풍**(${near.name})이`
                       : `**${near.name}** 태풍이`)
            : '아직 태풍이 되기 전 단계인 **열대저압부**가';
          const tcWarn = `⚠️ 어디로 갈지는 저희가 말하지 않습니다 — `
            + `태풍 화면에서 기관별 예보를 보세요.`;
          S(vary(5, [
            `지금 ${who} ${near.km.toLocaleString()}km 떨어져 있습니다. `
              + `태풍은 이 뜨거운 공기 덩어리의 가장자리를 따라 빙 돌아 움직입니다. `
              + `그래서 어디쯤 있느냐에 따라 더위를 더 키우기도 하고, `
              + `비구름을 몰고 오기도 합니다. ` + tcWarn,
            `${near.km.toLocaleString()}km 밖에는 지금 ${who} 있습니다. `
              + `태풍은 이 더운 공기 덩어리의 가장자리를 타고 돌기 때문에, `
              + `위치에 따라 더위를 키우기도 하고 비구름을 끌고 오기도 합니다. ` + tcWarn,
          ]));
        }
      }

      // 평온한 날 — ⚠️ 부끄러워하지 않는다
      if (!story.length) {
        const bits = [];
        if (pTmax) bits.push(`낮 ${tmax.toFixed(1)}°C(평년 ${cell.tmax.q[3]}°C)`);
        if (pHm) bits.push(`습도 ${Math.round(rh)}%(평년 ${cell.hm.q[3]}%)`);
        S(`오늘은 눈에 띄는 것이 없습니다. ${bits.join(' · ')} 로 예년 그 언저리입니다.`);
        S('⚠️ 평범한 날은 평범하다고 적습니다. 매일 극적인 척하면 진짜 위험한 날에 '
          + '아무도 믿지 않기 때문입니다.');
      }
    }

    return {
      level: pick.level, head: pick.head, num: pick.num, why: pick.why, story,
      rows, feel, feelHot: hot, feelN: lv.length,
      station: nrm?.doy ? { name: nrm.doy.name, km: nrm.km } : null,
      sources, caveats,
      at: c.time,
    };
  },

  KMA_RULES: KMA, MAX_KM,
};
