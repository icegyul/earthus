// 국가별 · 대륙별 · 전지구 집계 — 우리 자료에서 직접 센다
//
// 왜 만드나 (받은 요청)
//   "국가별 대륙별 지구별 평균 온도를 그래프로 나오게 해주고 오늘 온도 그래프도
//    올려서 볼 수 있게"
//
// 두 가지 자료를 쓴다. 성격이 완전히 다르므로 절대 섞지 않는다.
//
//   격자 (5°, 약 550km)  — 전지구·대륙 평균에 쓴다.
//     ⚠️ 국가 단위로 쓰면 안 된다. 한국은 격자 한두 칸이라 "한국 평균"이 될 수 없다.
//
//   지상 관측소 (METAR)  — 국가 평균에 쓴다.
//     실제로 설치된 계기 1,900여 곳이고, ICAO 부호 앞 두 글자가 나라를 가리킨다.
//     ⚠️ 공항에 있는 계기라 그 나라 전체의 평균이 아니다. "관측소 평균"이라고 부른다.
//     ⚠️ 관측소가 적은 나라는 값이 흔들린다. 개수를 반드시 같이 보여준다.
//
// ⚠️ 면적 가중을 한다.
//    위도가 높을수록 격자칸이 좁다. 그냥 평균 내면 극지가 과대평가된다.

import { i18n } from './i18n.js';

/* 대륙 — [남, 서, 북, 동] 상자. 정확한 경계가 아니라 대략의 범위다.
   ⚠️ 상자라서 바다가 섞인다. 육지만 세려면 육지 마스크가 필요한데,
      기온 격자는 육지·바다를 모두 담고 있어 상자만으로도 "그 지역 기온"은 된다.
      다만 "대륙 평균"이라 부르지 않고 "지역 평균"으로 적는다. */
export const CONTINENTS = [
  /* ⚠️ 한국을 맨 앞에 둔다 (받은 요청: "항상 한국은 최우선으로 볼 수 있게").
     상자가 5° 격자보다 작아서 한두 칸밖에 안 걸린다 — 그래서 값 옆에 칸 수를
     같이 보여준다. 칸이 적다는 사실을 숨기면 정밀한 값처럼 읽힌다. */
  { id: 'korea',   ko: '한국',     en: 'Korea',         box: [33, 124, 39.5, 132] },
  { id: 'asia',    ko: '아시아',   en: 'Asia',          box: [5, 60, 75, 150] },
  { id: 'europe',  ko: '유럽',     en: 'Europe',        box: [35, -10, 71, 40] },
  { id: 'africa',  ko: '아프리카', en: 'Africa',        box: [-35, -18, 37, 52] },
  { id: 'namerica', ko: '북아메리카', en: 'N. America',  box: [15, -168, 72, -52] },
  { id: 'samerica', ko: '남아메리카', en: 'S. America',  box: [-56, -82, 13, -34] },
  { id: 'oceania', ko: '오세아니아', en: 'Oceania',     box: [-48, 110, -10, 180] },
  { id: 'arctic',  ko: '북극권',   en: 'Arctic',        box: [66, -180, 90, 180] },
  { id: 'antarctic', ko: '남극권', en: 'Antarctic',     box: [-90, -180, -66, 180] },
];

/* ICAO 앞 두 글자 → 나라.
   ⚠️ 완전한 표가 아니다. 없는 부호는 "기타"로 묶고 그 사실을 화면에 적는다.
      지어낸 나라 이름을 붙이는 것보다 "모름"이 정직하다. */
const ICAO = {
  RK: ['대한민국', 'South Korea'], RJ: ['일본', 'Japan'], RO: ['일본', 'Japan'],
  ZB: ['중국', 'China'], ZG: ['중국', 'China'], ZH: ['중국', 'China'],
  ZJ: ['중국', 'China'], ZL: ['중국', 'China'], ZP: ['중국', 'China'],
  ZS: ['중국', 'China'], ZU: ['중국', 'China'], ZW: ['중국', 'China'], ZY: ['중국', 'China'],
  RC: ['대만', 'Taiwan'], VH: ['홍콩', 'Hong Kong'], RP: ['필리핀', 'Philippines'],
  WS: ['싱가포르', 'Singapore'], WM: ['말레이시아', 'Malaysia'], WI: ['인도네시아', 'Indonesia'],
  WA: ['인도네시아', 'Indonesia'], VT: ['태국', 'Thailand'], VV: ['베트남', 'Vietnam'],
  VD: ['캄보디아', 'Cambodia'], VL: ['라오스', 'Laos'], VY: ['미얀마', 'Myanmar'],
  VA: ['인도', 'India'], VE: ['인도', 'India'], VI: ['인도', 'India'], VO: ['인도', 'India'],
  VC: ['스리랑카', 'Sri Lanka'], VN: ['네팔', 'Nepal'], OP: ['파키스탄', 'Pakistan'],
  OI: ['이란', 'Iran'], OM: ['아랍에미리트', 'UAE'], OE: ['사우디아라비아', 'Saudi Arabia'],
  OJ: ['요르단', 'Jordan'], OL: ['레바논', 'Lebanon'], LT: ['튀르키예', 'Türkiye'],
  UU: ['러시아', 'Russia'], UL: ['러시아', 'Russia'], UN: ['러시아', 'Russia'],
  UR: ['러시아', 'Russia'], US: ['러시아', 'Russia'], UH: ['러시아', 'Russia'],
  UE: ['러시아', 'Russia'], UI: ['러시아', 'Russia'], UO: ['러시아', 'Russia'],
  UA: ['카자흐스탄', 'Kazakhstan'], UK: ['우크라이나', 'Ukraine'],
  EG: ['영국', 'UK'], EI: ['아일랜드', 'Ireland'], LF: ['프랑스', 'France'],
  ED: ['독일', 'Germany'], ET: ['독일', 'Germany'], LI: ['이탈리아', 'Italy'],
  LE: ['스페인', 'Spain'], LP: ['포르투갈', 'Portugal'], EH: ['네덜란드', 'Netherlands'],
  EB: ['벨기에', 'Belgium'], LS: ['스위스', 'Switzerland'], LO: ['오스트리아', 'Austria'],
  EK: ['덴마크', 'Denmark'], ES: ['스웨덴', 'Sweden'], EN: ['노르웨이', 'Norway'],
  EF: ['핀란드', 'Finland'], BI: ['아이슬란드', 'Iceland'], EP: ['폴란드', 'Poland'],
  LK: ['체코', 'Czechia'], LH: ['헝가리', 'Hungary'], LR: ['루마니아', 'Romania'],
  LG: ['그리스', 'Greece'], LB: ['불가리아', 'Bulgaria'], LY: ['세르비아', 'Serbia'],
  LD: ['크로아티아', 'Croatia'], EV: ['라트비아', 'Latvia'], EE: ['에스토니아', 'Estonia'],
  EY: ['리투아니아', 'Lithuania'],
  K:  ['미국', 'USA'], P:  ['미국', 'USA'],
  CY: ['캐나다', 'Canada'], CW: ['캐나다', 'Canada'], CZ: ['캐나다', 'Canada'],
  MM: ['멕시코', 'Mexico'], MR: ['코스타리카', 'Costa Rica'], MP: ['파나마', 'Panama'],
  MU: ['쿠바', 'Cuba'], MD: ['도미니카공화국', 'Dominican Rep.'], MK: ['자메이카', 'Jamaica'],
  SB: ['브라질', 'Brazil'], SA: ['아르헨티나', 'Argentina'], SC: ['칠레', 'Chile'],
  SK: ['콜롬비아', 'Colombia'], SP: ['페루', 'Peru'], SV: ['베네수엘라', 'Venezuela'],
  SU: ['우루과이', 'Uruguay'], SG: ['파라과이', 'Paraguay'], SL: ['볼리비아', 'Bolivia'],
  SE: ['에콰도르', 'Ecuador'],
  FA: ['남아프리카공화국', 'South Africa'], HE: ['이집트', 'Egypt'],
  GM: ['모로코', 'Morocco'], DT: ['튀니지', 'Tunisia'], DA: ['알제리', 'Algeria'],
  HK: ['케냐', 'Kenya'], HT: ['탄자니아', 'Tanzania'], DN: ['나이지리아', 'Nigeria'],
  GO: ['세네갈', 'Senegal'], HA: ['에티오피아', 'Ethiopia'], FL: ['잠비아', 'Zambia'],
  FV: ['짐바브웨', 'Zimbabwe'], FQ: ['모잠비크', 'Mozambique'], FY: ['나미비아', 'Namibia'],
  Y:  ['호주', 'Australia'], NZ: ['뉴질랜드', 'New Zealand'], NF: ['피지', 'Fiji'],
  BG: ['그린란드', 'Greenland'], NC: ['쿡제도', 'Cook Is.'],
  /* ── 실측으로 채운 나머지 ──────────────────────────────────
     화면에 나온 관측소 부호 중 표에 없던 88개를 채웠다.
     ⚠️ 여전히 모르는 부호는 "모름"으로 두고 그 수를 화면에 적는다.
        추측해서 나라 이름을 붙이면 그 나라 평균이 통째로 틀어진다. */
  UW: ['러시아', 'Russia'], UM: ['벨라루스', 'Belarus'], UZ: ['우즈베키스탄', 'Uzbekistan'],
  UT: ['우즈베키스탄', 'Uzbekistan'], UB: ['아제르바이잔', 'Azerbaijan'],
  UC: ['키르기스스탄', 'Kyrgyzstan'], UD: ['아르메니아', 'Armenia'], UG: ['조지아', 'Georgia'],
  WB: ['말레이시아', 'Malaysia'], VG: ['방글라데시', 'Bangladesh'], VR: ['몰디브', 'Maldives'],
  ZM: ['몽골', 'Mongolia'],
  OO: ['오만', 'Oman'], OR: ['이라크', 'Iraq'], OS: ['시리아', 'Syria'],
  OY: ['예멘', 'Yemen'], OK: ['쿠웨이트', 'Kuwait'], OT: ['카타르', 'Qatar'],
  FM: ['마다가스카르', 'Madagascar'], FN: ['앙골라', 'Angola'], FK: ['카메룬', 'Cameroon'],
  FC: ['콩고공화국', 'Congo'], FI: ['모리셔스', 'Mauritius'], FO: ['가봉', 'Gabon'],
  FB: ['보츠와나', 'Botswana'], FE: ['중앙아프리카공화국', 'Central African Rep.'],
  FG: ['적도기니', 'Eq. Guinea'], FH: ['세인트헬레나', 'St Helena'],
  FJ: ['영국령 인도양', 'Br. Indian Ocean'], FP: ['상투메프린시페', 'São Tomé'],
  FS: ['세이셸', 'Seychelles'], FT: ['차드', 'Chad'],
  DG: ['가나', 'Ghana'], DF: ['부르키나파소', 'Burkina Faso'], DX: ['토고', 'Togo'],
  DI: ['코트디부아르', "Côte d'Ivoire"], DR: ['니제르', 'Niger'],
  GC: ['스페인(카나리아)', 'Spain (Canaries)'], GV: ['카보베르데', 'Cabo Verde'],
  GQ: ['모리타니', 'Mauritania'], GA: ['말리', 'Mali'], GB: ['감비아', 'Gambia'],
  GG: ['기니비사우', 'Guinea-Bissau'], GL: ['라이베리아', 'Liberia'], GU: ['기니', 'Guinea'],
  HR: ['르완다', 'Rwanda'], HU: ['우간다', 'Uganda'],
  MG: ['과테말라', 'Guatemala'], MH: ['온두라스', 'Honduras'], MN: ['니카라과', 'Nicaragua'],
  MS: ['엘살바도르', 'El Salvador'], MT: ['아이티', 'Haiti'], MW: ['케이맨제도', 'Cayman Is.'],
  MY: ['바하마', 'Bahamas'], MZ: ['벨리즈', 'Belize'], MB: ['터크스케이커스', 'Turks & Caicos'],
  TN: ['퀴라소', 'Curaçao'], TJ: ['푸에르토리코', 'Puerto Rico'], TF: ['프랑스령 앤틸리스', 'Fr. Antilles'],
  TI: ['미국령 버진아일랜드', 'US Virgin Is.'], TA: ['앤티가바부다', 'Antigua'],
  TB: ['바베이도스', 'Barbados'], TD: ['도미니카연방', 'Dominica'], TG: ['그레나다', 'Grenada'],
  TL: ['세인트루시아', 'St Lucia'], TR: ['몬트세랫', 'Montserrat'],
  TT: ['트리니다드토바고', 'Trinidad & Tobago'], TV: ['세인트빈센트', 'St Vincent'],
  TX: ['버뮤다', 'Bermuda'],
  SM: ['수리남', 'Suriname'], SO: ['프랑스령 기아나', 'Fr. Guiana'], SY: ['가이아나', 'Guyana'],
  LC: ['키프로스', 'Cyprus'], LQ: ['보스니아헤르체고비나', 'Bosnia'], LZ: ['슬로바키아', 'Slovakia'],
  LM: ['몰타', 'Malta'], LU: ['몰도바', 'Moldova'], LX: ['지브롤터', 'Gibraltar'],
  LL: ['이스라엘', 'Israel'], EL: ['룩셈부르크', 'Luxembourg'],
  NV: ['바누아투', 'Vanuatu'], NG: ['키리바시', 'Kiribati'], NT: ['프랑스령 폴리네시아', 'Fr. Polynesia'],
  NW: ['뉴칼레도니아', 'New Caledonia'], NI: ['니우에', 'Niue'],
  CX: ['캐나다', 'Canada'], CB: ['캐나다', 'Canada'],
  AG: ['솔로몬제도', 'Solomon Is.'], AN: ['나우루', 'Nauru'],
  Z:  ['중국', 'China'],
};

function countryOf(icao) {
  const ko = i18n.lang === 'ko';
  const two = ICAO[icao.slice(0, 2)];
  if (two) return ko ? two[0] : two[1];
  const one = ICAO[icao[0]];
  if (one) return ko ? one[0] : one[1];
  return null;                                   // ⚠️ 모르면 지어내지 않는다
}

/** 격자에서 상자 안 면적가중 평균 */
function boxMean(g, field, box) {
  const arr = g[field];
  if (!arr) return null;
  let num = 0, den = 0, n = 0;
  for (let iy = 0; iy < g.ny; iy++) {
    const lat = g.lat0 + iy * g.res;
    if (box && (lat < box[0] || lat > box[2])) continue;
    const w = Math.cos(lat * Math.PI / 180);
    for (let ix = 0; ix < g.nx; ix++) {
      const v = arr[iy * g.nx + ix];
      if (v == null) continue;
      const lon = g.lon0 + ix * g.res;
      if (box) {
        const inLon = box[1] <= box[3]
          ? (lon >= box[1] && lon <= box[3])
          : (lon >= box[1] || lon <= box[3]);
        if (!inLon) continue;
      }
      num += v * w; den += w; n++;
    }
  }
  if (den) return { mean: num / den, n };
  /* ⚠️ 상자가 격자(5°)보다 작으면 한 칸도 안 걸린다 — 한국이 그렇다.
     "자료 없음"으로 두면 한국만 표에서 사라진다. 가장 가까운 칸을 쓰고
     그 사실을 표시한다 (nearest). */
  if (!box) return null;
  const cLat = (box[0] + box[2]) / 2;
  const cLon = box[1] <= box[3] ? (box[1] + box[3]) / 2 : box[1];
  let best = null;
  for (let iy = 0; iy < g.ny; iy++) {
    for (let ix = 0; ix < g.nx; ix++) {
      const v = arr[iy * g.nx + ix];
      if (v == null) continue;
      const lat = g.lat0 + iy * g.res, lon = g.lon0 + ix * g.res;
      let dLon = Math.abs(lon - cLon); if (dLon > 180) dLon = 360 - dLon;
      const d = (lat - cLat) ** 2 + dLon ** 2;
      if (!best || d < best.d) best = { d, v };
    }
  }
  return best && best.d <= 100 ? { mean: best.v, n: 1, nearest: true } : null;
}

export const stats = {
  /** 전지구 + 대륙별 지금 기온·수온 */
  async regions() {
    const { gridOverlay } = await import('./gridoverlay.js');
    const [wind, sstGrid] = await Promise.all([
      gridOverlay.load('wind').catch(() => null),
      gridOverlay.load('sstGlobal').catch(() => null),
    ]);
    const ko = i18n.lang === 'ko';
    const out = [];

    if (wind) {
      const g = boxMean(wind, 't', null);
      if (g) out.push({ id: 'global', name: ko ? '전지구' : 'Global',
                        temp: g.mean, n: g.n });
      CONTINENTS.forEach(c => {
        const m = boxMean(wind, 't', c.box);
        if (m) out.push({ id: c.id, name: ko ? c.ko : c.en, temp: m.mean, n: m.n,
                          nearest: !!m.nearest });
      });
    }
    let sst = null;
    if (sstGrid) {
      const m = boxMean(sstGrid, 'sst', null);
      if (m) sst = { mean: m.mean, n: m.n };
    }
    return { rows: out, sst, time: wind?.time || sstGrid?.time };
  },

  /** 국가별 — 지상 관측소 평균.
   *  ⚠️ "그 나라 평균 기온"이 아니라 "그 나라 공항 관측소들의 평균"이다. */
  async countries(min = 3) {
    const ko = i18n.lang === 'ko';
    /* ⚠️ 레이어가 꺼져 있으면 pointLayers 에 자료가 없다.
       그렇다고 "국가별 자료 없음"으로 두면, 지도에서 관측소를 켜야만 그래프가
       나오는 이상한 동작이 된다. 없으면 파일을 직접 받는다. */
    let list = null;
    try {
      const { pointLayers } = await import('./layers/registry.js');
      const L = pointLayers.landobs;
      if (L?.items?.length) list = L.items.map(m => m._station).filter(Boolean);
    } catch (_) { /* 레지스트리가 아직 없을 수 있다 */ }
    if (!list) {
      const { API } = await import('./config.js');
      try {
        const r = await fetch(`${API.WIND}/stations.json`, { cache: 'no-cache' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        list = (await r.json()).stations || [];
      } catch (_) { return null; }
    }
    if (!list.length) return null;
    const acc = new Map();
    let unknown = 0;
    list.forEach(st => {
      const t = st?.temp_c;
      if (t == null) return;
      const c = countryOf(st.id || '');
      if (!c) { unknown++; return; }
      const a = acc.get(c) || { sum: 0, n: 0, hi: -999, lo: 999 };
      a.sum += t; a.n++;
      if (t > a.hi) a.hi = t;
      if (t < a.lo) a.lo = t;
      acc.set(c, a);
    });
    const KR = ko ? '대한민국' : 'South Korea';
    const rows = [...acc.entries()]
      /* ⚠️ 관측소가 너무 적으면 "그 나라 값"이라 부를 수 없다. 그런 나라는 뺀다.
         단, 한국은 항상 남긴다 (받은 요청) — 대신 관측소 수를 함께 보여준다. */
      .filter(([name, a]) => a.n >= min || name === KR)
      .map(([name, a]) => ({ name, mean: a.sum / a.n, n: a.n, hi: a.hi, lo: a.lo,
                             kr: name === KR }))
      .sort((x, y) => y.mean - x.mean);
    /* 한국이 몇 등인지도 알려준다 — 목록에서 빠졌을 때 "우리는 어디쯤?"에 답해야 한다 */
    const krRank = rows.findIndex(r => r.kr);
    return { rows, unknown, total: list.length,
             kr: krRank >= 0 ? { ...rows[krRank], rank: krRank + 1, of: rows.length } : null };
  },

  /** 일별 해수면온도 시계열 (해마다 한 줄) — 스파게티 그래프용 */
  async sstSeries() { return this._series('MARINE_GRID', 'series/sst-daily.json'); },

  /** 일별 육상 기온 시계열 — 대륙별. CPC 는 육지만 담아서 진짜 대륙 평균이 된다. */
  async landSeries() { return this._series('WIND', 'series/temp-daily.json'); },

  /** 해빙 면적 — 북극·남극. 1979~오늘.
   *  ⚠️ '면적(extent)'이지 '넓이(area)'가 아니다. 20~30% 차이 나므로 섞으면 안 된다. */
  async seaIceSeries() { return this._series('MARINE_GRID', 'series/seaice-daily.json'); },

  /** 한국 — 기상청 관측(GHCN 경유) 10개 관측소.
   *  ⚠️ 전지구 격자에서 한국을 잘라내는 것보다 이쪽이 훨씬 정확하다.
   *     한국은 격자 몇 칸이라 바다와 산이 뭉뚱그려진다. */
  async koreaSeries() { return this._series('WIND', 'series/korea-daily.json'); },

  async _series(apiKey, path) {
    const { API } = await import('./config.js');
    try {
      const r = await fetch(`${API[apiKey]}/${path}`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님). 아직 만드는 중일 수 있다.
      //    "없다"와 "권한 없음"을 우리가 구분할 수 없으므로 둘 다 null 로 본다.
      return null;
    }
  },
};
