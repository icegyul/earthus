// 하늘 이벤트 — 일식·월식·유성우
//
// 왜 API 를 안 쓰는가
//   천문 이벤트는 "예보"가 아니라 "역학"이다. 수백 년 뒤까지 이미 계산돼 있고 바뀌지 않는다.
//   매번 서버에 물어볼 이유가 없다. 표로 두면 오프라인에서도 동작한다.
//
// 데이터 출처 (직접 받아서 옮긴 값이다 — 기억으로 쓴 게 아니다)
//   일식/월식 : NASA GSFC Five Millennium Catalog (Espenak & Meeus)
//               https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html
//               https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html
//               가시 지역 문구는 NASA 10년 표(SEdecade/LEdecade)의 표기를 그대로 옮겼다.
//   유성우   : IMO (국제유성기구) 연간 유성우 달력
//               https://www.imo.net/resources/calendar/
//
// ⚠️ "내 위치에서 일식이 몇 시에 어떻게 보이는가"는 계산하지 않는다.
//    지방 상황은 베셀 요소가 필요하고, 어설프게 계산해 틀리면 사람이 헛걸음한다.
//    NASA 가 이미 위치별 지도를 제공하므로 그쪽으로 넘긴다.
//    반면 유성우 복사점 고도·달 방해는 표준 공식으로 정확히 나오므로 직접 계산한다.

const D2R = Math.PI / 180, R2D = 180 / Math.PI;

/* ── 일식 (2026–2033) ──────────────────────────────────────────
   lat/lon = 식심(greatest eclipse) 지점, mag = 식분,
   width = 개기/금환대 폭(km), dur = 최대 지속, see = NASA 가시 지역 표기 */
export const SOLAR_ECLIPSES = [
  { date:'2026-02-17T12:13:05Z', type:'A', lat:-65, lon: 87, mag:0.963, width:616, dur:'2m20s',
    see:'s Argentina & Chile, s Africa, Antarctica', central:'Antarctica', slug:'SE2026Feb17A' },
  { date:'2026-08-12T17:47:05Z', type:'T', lat: 65, lon:-25, mag:1.039, width:294, dur:'2m18s',
    see:'n N. America, w Africa, Europe', central:'Arctic, Greenland, Iceland, Spain', slug:'SE2026Aug12T' },
  { date:'2027-02-06T16:00:47Z', type:'A', lat:-31, lon:-48, mag:0.928, width:282, dur:'7m51s',
    see:'S. America, Antarctica, w & s Africa', central:'Chile, Argentina, Atlantic', slug:'SE2027Feb06A' },
  { date:'2027-08-02T10:07:49Z', type:'T', lat: 26, lon: 33, mag:1.079, width:258, dur:'6m23s',
    see:'Africa, Europe, Mid East, w & s Asia',
    central:'Morocco, Spain, Algeria, Libya, Egypt, Saudi Arabia, Yemen, Somalia', slug:'SE2027Aug02T' },
  { date:'2028-01-26T15:08:58Z', type:'A', lat:  3, lon:-52, mag:0.921, width:323, dur:'10m27s',
    see:'e N. America, C. & S. America, w Europe, nw Africa',
    central:'Ecuador, Peru, Brazil, Suriname, Spain, Portugal', slug:'SE2028Jan26A' },
  { date:'2028-07-22T02:56:39Z', type:'T', lat:-16, lon:127, mag:1.056, width:230, dur:'5m10s',
    see:'SE Asia, E. Indies, Australia, N.Z.', central:'Australia, New Zealand', slug:'SE2028Jul22T' },
  { date:'2029-01-14T17:13:47Z', type:'P', lat: 64, lon:-114, mag:0.871,
    see:'N. America, C. America' },
  { date:'2029-06-12T04:06:13Z', type:'P', lat: 67, lon:-66,  mag:0.458,
    see:'Arctic, Scandinavia, Alaska, n Asia, n Canada' },
  { date:'2029-07-11T15:37:18Z', type:'P', lat:-64, lon:-86,  mag:0.230,
    see:'s Chile, s Argentina' },
  { date:'2029-12-05T15:03:57Z', type:'P', lat:-68, lon:136,  mag:0.891,
    see:'s Argentina, s Chile, Antarctica' },
  { date:'2030-06-01T06:29:13Z', type:'A', lat: 57, lon: 80, mag:0.944, width:250, dur:'5m21s',
    see:'Europe, n Africa, Mid East, Asia, Arctic, Alaska',
    central:'Algeria, Tunisia, Greece, Turkey, Russia, n China, Japan', slug:'SE2030Jun01A' },
  { date:'2030-11-25T06:51:37Z', type:'T', lat:-44, lon: 71, mag:1.047, width:169, dur:'3m44s',
    see:'s Africa, s Indian Oc., E. Indies, Australia, Antarctica',
    central:'Botswana, South Africa, Australia', slug:'SE2030Nov25T' },
  { date:'2031-05-21T07:16:04Z', type:'A', lat:  9, lon: 72, mag:0.959, width:152, dur:'5m26s',
    see:'Africa, s Asia, E. Indies, Australia',
    central:'Angola, Congo, Zambia, Tanzania, s India, Malaysia, Indonesia', slug:'SE2031May21A' },
  { date:'2031-11-14T21:07:30Z', type:'H', lat: -1, lon:-138, mag:1.011, width:38, dur:'1m08s',
    see:'Pacific, s US, C. America, nw S. America', central:'Pacific, Panama', slug:'SE2031Nov14H' },
  { date:'2032-05-09T13:26:42Z', type:'A', lat:-51, lon: -7, mag:0.996, width:44, dur:'0m22s',
    see:'s S. America, s Africa', central:'s Atlantic', slug:'SE2032May09A' },
  { date:'2032-11-03T05:34:12Z', type:'P', lat: 70, lon:133, mag:0.855, see:'Asia' },
  { date:'2033-03-30T18:02:35Z', type:'T', lat: 71, lon:-156, mag:1.046, width:781, dur:'2m37s',
    see:'N. America', central:'e Russia, Alaska', slug:'SE2033Mar30T' },
  { date:'2033-09-23T13:54:31Z', type:'P', lat:-72, lon:-121, mag:0.689, see:'s S. America, Antarctica' },
];

/* ── 월식 (2026–2030) ──────────────────────────────────────────
   월식은 밤인 쪽 어디서나 같은 시각에 보인다. 그래서 "가시 지역"이 넓다.
   mag = 본영 식분(음수면 반영식), tot = 개기 지속 */
export const LUNAR_ECLIPSES = [
  { date:'2026-03-03T11:34:52Z', type:'T', mag:1.151, par:'3h27m', tot:'0h58m',
    see:'e Asia, Australia, Pacific, Americas', slug:'LE2026Mar03T' },
  { date:'2026-08-28T04:14:04Z', type:'P', mag:0.930, par:'3h18m',
    see:'e Pacific, Americas, Europe, Africa', slug:'LE2026Aug28P' },
  { date:'2027-02-20T23:14:06Z', type:'N', mag:-0.057,
    see:'Americas, Europe, Africa, Asia', slug:'LE2027Feb20N' },
  { date:'2027-07-18T16:04:09Z', type:'N', mag:-1.068,
    see:'e Africa, Asia, Australia, Pacific', slug:'LE2027Jul18N' },
  { date:'2027-08-17T07:14:59Z', type:'N', mag:-0.525, see:'Pacific, Americas', slug:'LE2027Aug17N' },
  { date:'2028-01-12T04:14:13Z', type:'P', mag:0.066, par:'0h56m',
    see:'Americas, Europe, Africa', slug:'LE2028Jan12P' },
  { date:'2028-07-06T18:20:57Z', type:'P', mag:0.389, par:'2h21m',
    see:'Europe, Africa, Asia, Australia', slug:'LE2028Jul06P' },
  { date:'2028-12-31T16:53:15Z', type:'T', mag:1.246, par:'3h29m', tot:'1h11m',
    see:'Europe, Africa, Asia, Australia, Pacific', slug:'LE2028Dec31T' },
  { date:'2029-06-26T03:23:22Z', type:'T', mag:1.844, par:'3h40m', tot:'1h42m',
    see:'Americas, Europe, Africa, Mid East', slug:'LE2029Jun26T' },
  { date:'2029-12-20T22:43:12Z', type:'T', mag:1.117, par:'3h33m', tot:'0h54m',
    see:'Americas, Europe, Africa, Asia', slug:'LE2029Dec20T' },
  { date:'2030-06-15T18:34:34Z', type:'P', mag:0.502, par:'2h24m',
    see:'Europe, Africa, Asia, Australia', slug:'LE2030Jun15P' },
  { date:'2030-12-09T22:28:51Z', type:'N', mag:-0.163,
    see:'Americas, Europe, Africa, Asia', slug:'LE2030Dec09N' },
];

/* ── 유성우 (IMO 연간 달력) ────────────────────────────────────
   ra 는 시(hour), dec 는 도. zhr 은 이상 조건에서의 시간당 개수다.
   ⚠️ ZHR 은 "천정에 복사점이 있고 6.5등급까지 보이는 완벽한 하늘" 기준이다.
      실제로 보이는 개수는 늘 그보다 적다 — UI 에서 그렇게 말한다. */
export const SHOWERS = [
  { id:'QUA', ko:'사분의자리', en:'Quadrantids',  from:[12,28], to:[1,12],  peak:[1,3],   ra:15.33, dec: 49.0, zhr:120, body:'2003 EH₁' },
  { id:'LYR', ko:'거문고자리', en:'Lyrids',       from:[4,14],  to:[4,30],  peak:[4,22],  ra:18.07, dec: 34.0, zhr: 18, body:'C/1861 G1 Thatcher' },
  { id:'ETA', ko:'물병자리 에타', en:'eta Aquariids', from:[4,19], to:[5,28], peak:[5,6], ra:22.53, dec: -1.0, zhr: 50, body:'1P/Halley' },
  { id:'CAP', ko:'염소자리 알파', en:'alpha Capricornids', from:[7,3], to:[8,15], peak:[7,30], ra:20.47, dec:-10.0, zhr:5, body:'169P/NEAT' },
  { id:'SDA', ko:'물병자리 델타', en:'S. delta Aquariids', from:[7,12], to:[8,23], peak:[7,30], ra:22.67, dec:-16.4, zhr:25, body:'96P/Machholz' },
  { id:'PER', ko:'페르세우스자리', en:'Perseids',  from:[7,17],  to:[8,24],  peak:[8,12],  ra: 3.20, dec: 58.1, zhr:100, body:'109P/Swift-Tuttle' },
  { id:'ORI', ko:'오리온자리',   en:'Orionids',    from:[10,2],  to:[11,7],  peak:[10,21], ra: 6.33, dec: 15.8, zhr: 20, body:'1P/Halley' },
  { id:'STA', ko:'황소자리 남쪽', en:'S. Taurids', from:[9,20],  to:[11,20], peak:[11,4],  ra: 3.47, dec: 14.5, zhr:  5, body:'2P/Encke' },
  { id:'NTA', ko:'황소자리 북쪽', en:'N. Taurids', from:[10,20], to:[12,10], peak:[11,11], ra: 3.87, dec: 22.2, zhr:  5, body:'2P/Encke' },
  { id:'LEO', ko:'사자자리',     en:'Leonids',     from:[11,6],  to:[11,30], peak:[11,16], ra:10.13, dec: 21.8, zhr: 15, body:'55P/Tempel-Tuttle' },
  { id:'GEM', ko:'쌍둥이자리',   en:'Geminids',    from:[12,4],  to:[12,17], peak:[12,13], ra: 7.47, dec: 33.0, zhr:150, body:'3200 Phaethon' },
  { id:'URS', ko:'작은곰자리',   en:'Ursids',      from:[12,17], to:[12,26], peak:[12,21], ra:14.47, dec: 76.0, zhr: 10, body:'8P/Tuttle' },
];

export const ECLIPSE_TYPE = {
  T: { ko:'개기일식', en:'Total',    color:'#ff5d5d' },
  A: { ko:'금환일식', en:'Annular',  color:'#f2a65a' },
  H: { ko:'혼합일식', en:'Hybrid',   color:'#ffd166' },
  P: { ko:'부분일식', en:'Partial',  color:'#9fb4c4' },
};
export const LUNAR_TYPE = {
  T: { ko:'개기월식', en:'Total lunar' },
  P: { ko:'부분월식', en:'Partial lunar' },
  N: { ko:'반영월식', en:'Penumbral' },
};

/* ══ 천문 계산 ═══════════════════════════════════════════════════
   저정밀 공식(Astronomical Almanac). 태양 ~0.01°, 달 ~0.3° 오차.
   "복사점이 얼마나 높이 뜨는가 / 달이 얼마나 밝은가"에는 충분하다.
   ⚠️ 이 정밀도로 일식 접촉 시각 같은 걸 계산하면 안 된다. 그래서 안 한다. */

const jd = t => t / 86400000 + 2440587.5;
const days = t => jd(t) - 2451545.0;        // J2000 이후 일수
const norm = a => ((a % 360) + 360) % 360;

/** 태양 — 황경, 적경(도), 적위(도) */
function sun(t) {
  const d = days(t);
  const g = norm(357.528 + 0.9856003 * d) * D2R;
  const L = norm(280.460 + 0.9856474 * d);
  const lam = norm(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
  return { lam, ...eq(lam, 0, d) };
}

/** 달 — 황경·황위(저정밀), 적경/적위, 지구까지 거리(km) */
function moon(t) {
  const d = days(t);
  const Lm = norm(218.316 + 13.176396 * d);
  const Mm = norm(134.963 + 13.064993 * d) * D2R;
  const Fm = norm(93.272 + 13.229350 * d) * D2R;
  const lam = norm(Lm + 6.289 * Math.sin(Mm));
  const bet = 5.128 * Math.sin(Fm);
  return { lam, bet, dist: 385001 - 20905 * Math.cos(Mm), ...eq(lam, bet, d) };
}

/** 황도좌표 → 적도좌표 */
function eq(lam, bet, d) {
  const e = (23.439 - 0.0000004 * d) * D2R;
  const l = lam * D2R, b = bet * D2R;
  const x = Math.cos(b) * Math.cos(l);
  const y = Math.cos(e) * Math.cos(b) * Math.sin(l) - Math.sin(e) * Math.sin(b);
  const z = Math.sin(e) * Math.cos(b) * Math.sin(l) + Math.cos(e) * Math.sin(b);
  return { ra: norm(Math.atan2(y, x) * R2D) / 15, dec: Math.asin(z) * R2D };
}

/** 그리니치 항성시(도) */
const gmst = t => norm(280.46061837 + 360.98564736629 * days(t));

/** 적경(시)·적위(도) → 지평 고도(도) */
export function altitude(raH, decDeg, lat, lon, t) {
  const ha = (gmst(t) + lon - raH * 15) * D2R;
  const dec = decDeg * D2R, la = lat * D2R;
  return Math.asin(Math.sin(dec) * Math.sin(la) +
                   Math.cos(dec) * Math.cos(la) * Math.cos(ha)) * R2D;
}

/** 달의 위상 — 0=삭, 0.5=망. illum 은 밝은 면 비율 0~1 */
export function moonPhase(t = Date.now()) {
  const s = sun(t), m = moon(t);
  const elong = norm(m.lam - s.lam);
  return { elong, phase: elong / 360, illum: (1 - Math.cos(elong * D2R)) / 2 };
}

export function moonPhaseName(elong, ko) {
  const n = [
    [22.5,  '삭',        'New moon'],
    [67.5,  '초승달',    'Waxing crescent'],
    [112.5, '상현',      'First quarter'],
    [157.5, '차오르는 달','Waxing gibbous'],
    [202.5, '보름',      'Full moon'],
    [247.5, '기우는 달', 'Waning gibbous'],
    [292.5, '하현',      'Last quarter'],
    [337.5, '그믐달',    'Waning crescent'],
  ];
  for (const [lim, k, e] of n) if (elong < lim) return ko ? k : e;
  return ko ? '삭' : 'New moon';
}

/* ── 유성우 관측 조건 ────────────────────────────────────────── */

/** 올해(또는 다음 해)의 극대 시각을 Date 로 */
export function peakDate(sh, now = new Date()) {
  const [mo, dy] = sh.peak;
  let y = now.getUTCFullYear();
  // 극대는 보통 자정 무렵이다. 정확한 시각은 해마다 몇 시간씩 다르므로 날짜만 쓴다.
  let p = new Date(Date.UTC(y, mo - 1, dy, 2));
  if (p.getTime() < now.getTime() - 18 * 3600e3) p = new Date(Date.UTC(y + 1, mo - 1, dy, 2));
  return p;
}

/** 활동 기간 안인가 */
export function isActive(sh, now = new Date()) {
  const md = (now.getUTCMonth() + 1) * 100 + now.getUTCDate();
  const a = sh.from[0] * 100 + sh.from[1], b = sh.to[0] * 100 + sh.to[1];
  return a <= b ? (md >= a && md <= b) : (md >= a || md <= b);   // 연말을 넘는 사분의자리 대응
}

/**
 * 극대 밤의 관측 조건을 계산한다.
 *
 * 방법: 극대일 현지 일몰~일출 사이를 10분 간격으로 훑어
 *       "태양 고도 < -18°(천문박명 끝)" 구간에서 복사점이 가장 높은 순간을 찾는다.
 *       그 시각의 달 고도·위상을 함께 본다 — 달이 떠 있으면 어두운 유성이 다 묻힌다.
 *
 * @returns {{best:Date, alt:number, moonAlt:number, illum:number, rate:number}|null}
 *          복사점이 밤새 지평선 아래면 null (그 위도에선 못 본다)
 */
export function viewing(sh, lat, lon, when = peakDate(sh)) {
  const t0 = when.getTime() - 14 * 3600e3;     // 극대일 전날 정오 UTC 부근부터
  let best = null;
  for (let i = 0; i <= 28 * 6; i++) {          // 28시간을 10분 간격으로
    const t = t0 + i * 600e3;
    const s = sun(t);
    const sAlt = altitude(s.ra, s.dec, lat, lon, t);
    if (sAlt > -18) continue;                  // 아직 밝다
    const alt = altitude(sh.ra, sh.dec, lat, lon, t);
    if (!best || alt > best.alt) {
      const m = moon(t);
      best = { best: new Date(t), alt,
               moonAlt: altitude(m.ra, m.dec, lat, lon, t),
               illum: moonPhase(t).illum };
    }
  }
  if (!best || best.alt <= 0) return null;

  /* 실제 기대 개수 ≈ ZHR × sin(복사점 고도) × 달 감쇠.
     ⚠️ 이건 널리 쓰이는 근사이지 정밀 예측이 아니다. UI 에서 "대략"이라고 말한다.
        달 감쇠는 경험적으로 잡았다 — 보름달이 떠 있으면 절반 이하로 떨어진다. */
  const moonLoss = best.moonAlt > 0 ? 1 - 0.65 * best.illum : 1;
  best.rate = Math.max(0, Math.round(sh.zhr * Math.sin(best.alt * D2R) * moonLoss));
  return best;
}

/* ── 목록 헬퍼 ────────────────────────────────────────────────── */

/** 앞으로 다가올 일식/월식 (가까운 순) */
export function upcomingEclipses(now = Date.now(), n = 6) {
  const all = [
    ...SOLAR_ECLIPSES.map(e => ({ ...e, kind: 'solar' })),
    ...LUNAR_ECLIPSES.map(e => ({ ...e, kind: 'lunar' })),
  ].filter(e => new Date(e.date).getTime() > now - 6 * 3600e3);
  all.sort((a, b) => new Date(a.date) - new Date(b.date));
  return all.slice(0, n);
}

/** 다가오는 유성우 극대 (가까운 순) */
export function upcomingShowers(now = new Date(), n = 4) {
  return SHOWERS
    .map(s => ({ ...s, at: peakDate(s, now), active: isActive(s, now) }))
    .sort((a, b) => a.at - b.at)
    .slice(0, n);
}

/** NASA 상세 페이지 — 위치별 상황은 우리가 계산하지 않고 여기로 넘긴다 */
export function nasaLink(e) {
  if (e.kind === 'lunar' || e.slug?.startsWith('LE')) {
    return `https://eclipse.gsfc.nasa.gov/LEplot/LEplot2001/${e.slug}.pdf`;
  }
  if (e.slug) {
    return `https://eclipse.gsfc.nasa.gov/SEgoogle/SEgoogle2001/${e.slug}google.html`;
  }
  // 부분일식은 지도 페이지가 없다 — 10년 표로 보낸다
  const y = new Date(e.date).getUTCFullYear();
  const dec = Math.floor(y / 10) * 10 + 1;
  return `https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade${dec}.html`;
}
