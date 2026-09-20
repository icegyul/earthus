// EARTHUS v2 — 지구 위 실측 숫자 (DEV-DIRECTIVE 2026-09-20 · W1 ⑦ "지도 위 숫자는 실측 관측소 값")
//
// 무엇이 없어 있었나: v2 의 기온은 색면뿐이라 색을 값으로 되돌릴 숫자가 지구 위에 하나도 없었다. 그렇다고 색면의 격자값을
//   숫자로 찍으면 0.5°(약 55 km) 칸 평균이 '서울 27.4°'처럼 읽힌다 — 격자 평균은 도시값이 못 된다(기억 grid-vs-observation-rule).
//   v2 는 5일을 예보하고 해석하는 작업 공간이다: 그 해석의 발판은 '지금 실제로 잰 값'이어야 한다.
//   → 지구 위 숫자는 **실측 관측소 값**만 찍는다. 작은 점 + 숫자 + 'OBS' 꼬리표. 모델값은 여기로 들어오지 못한다.
//
// 규칙(전부 아래 시험이 잠근다 — tools/earthus-v53/obs-labels.test.mjs)
//   ① 타임라인이 '지금'이 아니면 숨는다. 예보 시각의 색면 위에 현재 관측을 얹으면 관측과 예보가 섞인다
//      (그때는 등치선 라벨이 숫자 역할을 한다). 시간은 time-bus.js 하나에서 듣는다.
//   ② 없는 값은 찍지 않는다. ⚠️ Number(null) === 0 — 결측이 0°C 로 찍히는 함정(기억 v1-weather-sheet-apple).
//      그래서 이 파일에는 Number(x) · x || 0 이 없다. obsNumber() 하나만 값을 숫자로 바꾼다.
//   ③ 늙은 관측은 찍지 않는다. 문서가 통째로 늙었으면 아무것도 안 찍고 state() 가 그 사실을 말한다
//      (기상청 허브 용량 초과면 수집기가 한꺼번에 묵는다 — 기억 kma-hub-quota-trap. 그때 묵은 숫자를 '지금'이라 하면 안 된다).
//   ④ 솎기는 화면 **CSS px** 격자 버킷. 확대하면 지점이 벌어져 더 많이 나온다(줌 정규화). 앞 반구만, 지평선에서 흐려진다.
//      한국 먼저(시장 우선순위) → 자료가 '주요 지점'이라 말한 곳 → 나머지.
//   ⑤ 발열: 글리프 아틀라스 1장 · 지오메트리 1개 · 드로우콜 1개. 지점이 10곳이든 6,000곳이든 GPU 자원 수는 같다.
//      카메라가 가만히 있으면 아무것도 하지 않는다. 조금 움직이면 찍힌 ≤60개의 흐림만 고친다. 많이 움직여야 다시 솎는다.
//
// ── 자료(운영 파일을 2026-09-20 에 공개 GET 으로 받아 확인한 모양) ─────────────────────────────
//   wind/kma-aws.json     기상청 ASOS 97지점. stations[].temp_c · wind_ms · wind_dir · pres_sea · lat · lon · name · id · alt
//                         관측 시각은 **문서에 하나**: observedKst '20260920 13:00' (KST). 지점마다는 없다.
//   wind/gts-global.json  GTS SYNOP 6,358지점. stations[].ta · ws · wd · ps · lat · lon · name · ctry · id · alt
//                         관측 시각은 지점마다 tm '202609200300' (**UTC**) + 문서 observedUtc.
//   두 파일을 받는 것은 이 파일이 아니다 — getData 로 받는다(main.js 가 surface-obs.js 의 공용 저장소를 넣어 준다).
//
// ⚠️ 결측 표기가 기관·열마다 다르다(수집기 머리말에서 읽었다 — 뭉뚱그리면 자료가 망가진다)
//   · 기상청(aws/kma-aws/handler.py:94): −9 · −99 · −999 가 결측이고 수집기가 null 로 비워서 준다. 혹시 새어 나온 −9 는 여기서도 버린다.
//   · GTS(aws/gts-global/handler.py 머리말): 기온의 결측은 −99 · −999 뿐이다. **−9.0°C 는 멀쩡한 기온이다** —
//     여기에 −9 를 결측으로 걸면 겨울 고위도 관측이 조용히 사라진다. 그래서 GTS 기온의 −9 는 찍는다.
//   · 풍속·기압은 음수가 있을 수 없다 — 기관과 무관하게 음수는 전부 결측이다(실측: GTS 풍속 −9.0 이 177곳 온 날이 있다).
//
// ⚠️ 늙음 상한이 기관마다 다른 이유(실측 · 상수 OBS_MAX_AGE_MS)
//   · kma-aws   cron(25 * * * ? *) 가 '한 시간 전 정시'를 읽는다(handler.py:314) → 정상 운영에서 나이가 1시간 25분 ~ 2시간 26분.
//   · gts-global cron(35 * * * ? *) 가 '두 시간 전 정시'를 읽는다(handler.py:247 backHours=2 — SYNOP 은 허브에 늦게 찬다)
//                → 정상 운영에서 나이가 **2시간 35분 ~ 3시간 36분**. 즉 '2시간' 한 줄로 자르면 GTS 는 영원히 안 찍히고,
//                기상청도 매시 25분 동안 사라진다. 상한은 '정상 운영의 가장 늙은 나이 + 약 30분'이다 — 수집기가 한 번
//                빠지면 숫자가 사라지는 것이 맞고(그것이 이 규칙의 목적이다), 정상일 때 사라지면 안 된다.
//
// ⚠️ 한국은 두 파일에 다 있다. GTS 의 WMO 번호 47xxx = '47' + 기상청 지점번호(47108 = 서울 108). 같은 지점을 두 번 찍지 않게
//   GTS 쪽을 버린다 — 기상청 것이 더 새롭고 좌표가 정확하다(실측: GTS 47104 는 NOAA 지점표 조인 탓에 북강릉에서 100 km 떨어져 찍힌다).
//
// ⚠️ 기상청 wind_dir 은 도(°)가 아니라 **36방위 부호**(×10°)다. 수집기 표에는 '풍향(deg)'라 적혀 있지만 실측 분포가
//   0·2·5·7·9·11·14·16·18·20·23·25·27·29·32·34·36 — 16방위를 10° 단위로 반올림한 값이다(0 = 고요). GTS wd 는 도 그대로다.
//
// 이 파일은 아무것도 import 하지 않는다 — THREE · 시간 버스 · 지표 반지름 · 지평선 흐림(live-layers.js newsChipOpacity)을
// 전부 createObsLabels 의 인자로 받는다. 그래서 시험이 DOM·GPU 없이 그대로 부르고, ?v= 가 어긋나 live-layers 가 두 번 실리는 일도 없다.

/* ── 상수 ──────────────────────────────────────────────────────────────── */
// 라벨 상한. 데스크톱 60: 1440p 에서 지구 원반 위 CSS px 버킷(72×34)이 대략 200칸이고 그 1/3 을 넘기면 색면이 숫자에 덮여
//   '어디가 얼마나 다른가'를 색으로 못 읽는다. 폰 24: 폭 375 의 지구 원반은 버킷이 50칸 남짓이고, 라벨마다 글리프 8개라
//   24 × 8 = 192 인스턴스 — 폰에서 매 프레임 흐림을 고쳐 써도 1 KB 가 안 된다.
export const OBS_MAX_DESKTOP = 60;
export const OBS_MAX_PHONE = 24;
// 늙음 상한(ms) — 위 머리말의 실측 근거. 숫자를 바꾸려면 수집기의 cron 과 '몇 시간 전 정시를 읽는가'를 먼저 본다.
export const OBS_MAX_AGE_MS = Object.freeze({ KMA: 3 * 3600 * 1000, GTS: 4 * 3600 * 1000 });
// 기기 시계가 틀려 관측이 '미래'로 읽힐 때의 허용 폭. 넘으면 나이를 믿을 수 없으니 찍지 않는다.
export const OBS_FUTURE_SLACK_MS = 3600 * 1000;
// 솎기 버킷(CSS px). 라벨 한 개의 자리(점 + '−12.4' + OBS 꼬리표 ≈ 50×26)에 숨 쉴 틈을 더한 크기.
export const OBS_CELL_CSS = Object.freeze({ w: 72, h: 34 });
// 이웃 버킷의 라벨과 이 폭·높이 안으로 겹치면 찍지 않는다(버킷 경계 양쪽에 붙은 두 지점).
export const OBS_BOX_CSS = Object.freeze({ w: 56, h: 27 });
// 상한을 넘으면 버킷을 이 사다리로 키운다 — 연속값이면 자동 회전 중 버킷 경계가 매번 움직여 라벨이 깜빡인다.
export const OBS_CELL_LADDER = Object.freeze([1, 1.25, 1.6, 2, 2.5, 3.2, 4, 5, 6.4, 8]);
// 다시 솎는 문턱: 기준점이 화면에서 이만큼(CSS px) 움직였거나, 고도가 이 비율만큼 바뀌었을 때. 그리고 아무리 빨라도 이 간격(ms).
export const OBS_RECULL_PX = 24;
export const OBS_RECULL_ZOOM = 0.12;
export const OBS_RECULL_MIN_MS = 120;
// 카메라가 멈춰 있어도 관측은 늙는다 — 이 간격으로 한 번씩 다시 솎아 상한을 넘긴 지점을 내린다.
export const OBS_AGE_RECHECK_MS = 5 * 60 * 1000;
// 문서를 다시 묻는 간격. 수집기는 매시 한 번 돌고, live-layers 의 바람 레이어도 20분이다(REFRESH_MIN.wind).
export const OBS_REFRESH_MS = 20 * 60 * 1000;
// 아무것도 못 받았을 때 다시 묻는 간격 — 20분을 기다리게 하면 한 번의 회선 끊김이 메뉴를 20분 비운다.
export const OBS_RETRY_MS = 60 * 1000;
// 지평선 흐림이 이 값보다 옅은 지점은 새로 뽑지 않는다(이미 찍힌 라벨은 0 까지 흐려지며 넘어간다).
export const OBS_MIN_OPACITY = 0.35;
// 누르기 허용 폭(CSS px) — 라벨 상자 밖으로 이만큼까지는 그 라벨을 누른 것으로 친다(손가락).
export const OBS_PICK_SLOP_PX = 12;
// 고요 — 이보다 약한 바람에는 화살촉을 달지 않는다(방향이 의미 없다). 기상 관례의 calm.
export const OBS_CALM_MS = 0.5;
// 라벨 하나가 쓰는 글리프 인스턴스 수의 상한: 점 1 + 글자 5('−12.4') + OBS 꼬리표 1 + 화살촉 1.
export const OBS_GLYPHS_PER_LABEL = 8;
// 배지 어휘는 engine-bridge.js 의 EVIDENCE_KIND 그대로다 — 새 낱말을 만들지 않는다.
export const OBS_BADGE = 'OFFICIAL_OBSERVATION';

export const OBS_METRICS = Object.freeze({
  temp: Object.freeze({ key: 'temp', unit: '°C', ko: '기온', en: 'Temperature', min: -90, max: 60 }),
  // 화살촉은 방향 기호다 — 크기가 고정이고 풍속은 숫자가 말한다(길이로 값을 말하는 막대기는 금지).
  wind: Object.freeze({ key: 'wind', unit: 'm/s', ko: '풍속', en: 'Wind speed', min: 0, max: 120 }),
});

/* ── 값 읽기(순수) ──────────────────────────────────────────────────────── */
const NUM_RE = /^-?\d+(\.\d+)?$/;
// 값 하나를 숫자로. null · undefined · '' · '-' · NaN · ±Infinity · 참거짓은 전부 null 이다.
// ⚠️ Number(null) 은 0 이고 Number('') 도 0 이다 — 그래서 Number() 를 쓰지 않고 꼴을 먼저 본다.
export function obsNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    return NUM_RE.test(s) ? parseFloat(s) : null;
  }
  return null;
}

const SENTINELS = new Set([-99, -999, -9999]);
// 지표 하나의 값. src 는 'KMA' | 'GTS' — 결측 규칙이 기관마다 다르다(머리말).
export function obsValue(v, metric, src) {
  const n = obsNumber(v);
  if (n == null || SENTINELS.has(n)) return null;
  const m = OBS_METRICS[metric];
  if (metric === 'temp') {
    if (src === 'KMA' && n === -9) return null;     // 기상청의 결측 부호가 새어 나온 것. GTS 의 −9.0 은 기온이다.
  } else if (n < 0) return null;                    // 풍속·기압에 음수는 없다
  if (m && (n < m.min || n > m.max)) return null;   // 물리적으로 불가능한 값(수집기 sanity 와 같은 뜻의 마지막 문)
  return n;
}

// 풍향(도, 바람이 불어**오는** 쪽). 기상청은 36방위 부호(×10°, 0 = 고요), GTS 는 도.
export function obsWindDirDeg(v, src) {
  const n = obsNumber(v);
  if (n == null || n < 0) return null;
  if (src === 'KMA') return n >= 1 && n <= 36 ? (n * 10) % 360 : null;
  return n <= 360 ? n % 360 : null;
}

// 'YYYYMMDD HH:mm'(기상청 · KST) · 'YYYYMMDDHHmm'(GTS · UTC) → ms. 못 읽으면 null.
export function parseObsTime(v, zone) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length < 12) return null;
  const y = +d.slice(0, 4), mo = +d.slice(4, 6), da = +d.slice(6, 8), h = +d.slice(8, 10), mi = +d.slice(10, 12);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, da, h, mi);
  if (!Number.isFinite(ms)) return null;
  return zone === 'KST' ? ms - 9 * 3600 * 1000 : ms;
}

// 관측 시각(ms) → '9/20 13:00 KST'. live-layers.js kstShort 와 같은 꼴.
export function kstLabel(ms) {
  if (!Number.isFinite(ms)) return '';
  const k = new Date(ms + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')} KST`;
}

// 0.1 눈금 한 자리. '−0.0' 은 '0.0' 으로, 음수 부호는 하이픈이 아니라 U+2212(−)다.
export function fmt1(v) {
  if (!Number.isFinite(v)) return '';
  let s = (Math.round(v * 10) / 10).toFixed(1);
  if (s === '-0.0') s = '0.0';
  return s.startsWith('-') ? `−${s.slice(1)}` : s;
}
// 지구 위 숫자에는 단위를 붙이지 않는다 — 단위는 범례가 말하고, '20°C' 꼴은 등온선 라벨의 것이다(둘이 같은 꼴이면 섞인다).
// 아틀라스에는 ° 글리프가 있다: 이 한 줄을 '°' 로 바꾸면 '27.4°' 로 찍힌다.
export const OBS_TEMP_SUFFIX = '';
// 지구 위에 찍는 글자. 관측은 0.1 정밀이 정당하다(관측기기의 눈금 — 모델 격자값에는 이 정밀도를 주지 않는다).
export function formatObs(v, metric = 'temp') {
  const s = fmt1(v);
  return s && metric === 'temp' ? s + OBS_TEMP_SUFFIX : s;
}

// 관측은 그 시각에서 상한 안일 때만 '지금'이라 말할 수 있다. 시각이 없으면 지금이라 말할 수 없다.
export function obsFresh(obsMs, src, nowMs, maxAge = OBS_MAX_AGE_MS) {
  if (!Number.isFinite(obsMs) || !Number.isFinite(nowMs)) return false;
  const age = nowMs - obsMs;
  const lim = maxAge[src];
  return Number.isFinite(lim) && age <= lim && age >= -OBS_FUTURE_SLACK_MS;
}

const D2R = Math.PI / 180;

// 두 문서 → 지점 목록. 합치되 섞지 않는다: 지점마다 어느 기관 것인지(src)와 자기 관측 시각(obsMs)을 든다.
// tier: 0 = 한국 · 자료가 주요 지점이라 말한 곳 · 1 = 한국 · 2 = 나머지.
//   '주요 지점'은 손으로 적은 도시 표가 아니다 — kma-aws.json 의 intel 패킷이 '지금 기온'으로 뽑아 싣는 지점 번호다
//   (2026-09-20 실측: 서울·부산·울산·광주·대전·강릉·제주). GTS 에는 그런 표시가 없다 — 없으면 만들지 않는다.
export function normalizeSurfaceObs({ aws, gts } = {}) {
  const sites = [];
  const dropped = { noPosition: 0, dupKorea: 0, noValue: 0 };
  const docs = { KMA: null, GTS: null };
  const unit = (s) => {
    const la = s.lat * D2R, lo = s.lon * D2R, cl = Math.cos(la);
    s.ux = cl * Math.sin(lo); s.uy = Math.sin(la); s.uz = cl * Math.cos(lo);
    return s;
  };
  const position = (raw) => {
    const lat = obsNumber(raw.lat), lon = obsNumber(raw.lon);
    if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lat, lon };
  };
  const koreaWmo = new Set();

  if (aws && Array.isArray(aws.stations)) {
    const docMs = parseObsTime(aws.observedKst, 'KST');
    docs.KMA = { observedMs: docMs, count: aws.stations.length, sourceKo: aws.source || '기상청 지상관측', sourceEn: aws.sourceEn || 'KMA surface observations' };
    const major = new Set();
    const vals = aws.intel && aws.intel.current && Array.isArray(aws.intel.current.values) ? aws.intel.current.values : [];
    for (const v of vals) if (v && v.stationId != null) major.add(String(v.stationId));
    for (const raw of aws.stations) {
      if (!raw) continue;
      const id = String(raw.id == null ? '' : raw.id);
      if (id) koreaWmo.add(`47${id.padStart(3, '0')}`);
      const p = position(raw);
      if (!p) { dropped.noPosition += 1; continue; }
      const temp = obsValue(raw.temp_c, 'temp', 'KMA');
      const wind = obsValue(raw.wind_ms, 'wind', 'KMA');
      if (temp == null && wind == null) { dropped.noValue += 1; continue; }
      sites.push(unit({
        src: 'KMA', id, name: raw.name || id, ctry: 'KS', lat: p.lat, lon: p.lon, alt: obsNumber(raw.alt),
        temp, wind, windDir: obsWindDirDeg(raw.wind_dir, 'KMA'), pres: obsValue(raw.pres_sea, 'pres', 'KMA'),
        obsMs: docMs, tier: major.has(id) ? 0 : 1,
      }));
    }
  }
  if (gts && Array.isArray(gts.stations)) {
    const docMs = parseObsTime(gts.observedUtc, 'UTC');
    docs.GTS = { observedMs: docMs, count: gts.stations.length, sourceKo: gts.source || 'GTS SYNOP 지상관측', sourceEn: gts.sourceEn || 'GTS SYNOP surface observations' };
    for (const raw of gts.stations) {
      if (!raw) continue;
      const id = String(raw.id == null ? '' : raw.id);
      if (koreaWmo.has(id)) { dropped.dupKorea += 1; continue; }
      const p = position(raw);
      if (!p) { dropped.noPosition += 1; continue; }
      const temp = obsValue(raw.ta, 'temp', 'GTS');
      const wind = obsValue(raw.ws, 'wind', 'GTS');
      if (temp == null && wind == null) { dropped.noValue += 1; continue; }
      const tm = parseObsTime(raw.tm, 'UTC');
      sites.push(unit({
        src: 'GTS', id, name: raw.name || id, ctry: raw.ctry || '', lat: p.lat, lon: p.lon, alt: obsNumber(raw.alt),
        temp, wind, windDir: obsWindDirDeg(raw.wd, 'GTS'), pres: obsValue(raw.ps, 'pres', 'GTS'),
        obsMs: tm != null ? tm : docMs, tier: 2,
      }));
    }
  }
  return { sites, docs, dropped };
}

// 바람이 불어**가는** 쪽의 지표 접선(월드 단위 벡터). 화살촉을 화면에서 돌리는 데 쓴다 — 셰이더가 이 방향을 투영한다.
export function windTangent(lat, lon, dirFromDeg, out) {
  const la = lat * D2R, lo = lon * D2R, b = (dirFromDeg + 180) * D2R;
  const sb = Math.sin(b), cb = Math.cos(b), sl = Math.sin(la), cl = Math.cos(la), so = Math.sin(lo), co = Math.cos(lo);
  // 동(∂p/∂lon) = (cos lo, 0, −sin lo) · 북(∂p/∂lat) = (−sin la·sin lo, cos la, −sin la·cos lo)   [p = (cl·sin lo, sin la, cl·cos lo)]
  out[0] = sb * co + cb * (-sl * so);
  out[1] = cb * cl;
  out[2] = sb * (-so) + cb * (-sl * co);
  return out;
}

/* ── 화면 셈(순수) ──────────────────────────────────────────────────────── */
// 월드 점 → CSS px. e 는 열 우선 4×4(projection × view). 카메라 뒤면 false.
export function projectPx(e, x, y, z, w, h, out) {
  const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
  if (!(cw > 0)) return false;
  out[0] = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * 0.5 + 0.5) * w;
  out[1] = (-(e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * 0.5 + 0.5) * h;
  return true;
}

// 버킷 한 바퀴. order 의 앞에서부터 자리를 준다 — 먼저 온 쪽이 버킷을 갖는다(우선순위는 order 가 정한다).
//   · 버킷 하나에 하나.  · 이웃 버킷의 라벨과 상자(boxW×boxH)가 겹치면 찍지 않는다.
// grid 는 되쓴다(Int32Array) — 다시 솎을 때마다 Map 을 새로 만들지 않는다. 뽑힌 후보 번호를 out 에 적고 개수를 돌려준다.
export function thinPass(n, order, xs, ys, cellW, cellH, boxW, boxH, w, h, grid, out) {
  const cols = Math.max(1, Math.ceil(w / cellW)), rows = Math.max(1, Math.ceil(h / cellH));
  if (grid.cells.length < cols * rows) grid.cells = new Int32Array(cols * rows);
  const cells = grid.cells;
  cells.fill(-1, 0, cols * rows);
  let count = 0;
  for (let k = 0; k < n; k += 1) {
    const i = order[k];
    const c = Math.min(cols - 1, Math.max(0, Math.floor(xs[i] / cellW)));
    const r = Math.min(rows - 1, Math.max(0, Math.floor(ys[i] / cellH)));
    if (cells[r * cols + c] >= 0) continue;
    let clash = false;
    for (let dr = -1; dr <= 1 && !clash; dr += 1) {
      const rr = r + dr;
      if (rr < 0 || rr >= rows) continue;
      for (let dc = -1; dc <= 1; dc += 1) {
        const cc = c + dc;
        if (cc < 0 || cc >= cols) continue;
        const j = cells[rr * cols + cc];
        if (j >= 0 && Math.abs(xs[j] - xs[i]) < boxW && Math.abs(ys[j] - ys[i]) < boxH) { clash = true; break; }
      }
    }
    if (clash) continue;
    cells[r * cols + c] = i;
    if (count < out.length) out[count] = i;
    count += 1;
  }
  return count;
}

// 상한을 넘으면 버킷을 사다리로 키워 다시 돈다 — 앞에서 60개를 자르면 화면 한쪽에 몰리고, 버킷을 키우면 고르게 남는다.
// 돌려주는 것: { count, scale }. 사다리 끝에서도 넘치면(거의 없다) order 앞쪽 max 개만 남긴다.
// startScale: 지난번에 쓴 배율. 그 배율이 아직 맞으면(상한 안 · 상한의 절반 이상) 그대로 쓴다 — 개수가 상한 언저리일 때
//   배율이 2.5 ↔ 3.2 를 오가면 버킷 경계가 통째로 옮겨져 라벨이 한꺼번에 깜빡인다(자동 회전 중). 보통은 이 한 바퀴로 끝난다.
export function thinAdaptive(n, order, xs, ys, w, h, max, grid, out, cell = OBS_CELL_CSS, box = OBS_BOX_CSS, startScale = 0) {
  if (startScale > 0) {
    const c0 = thinPass(n, order, xs, ys, cell.w * startScale, cell.h * startScale, box.w, box.h, w, h, grid, out);
    if (c0 <= max && (c0 >= max * 0.5 || startScale <= OBS_CELL_LADDER[0])) return { count: c0, scale: startScale };
  }
  let scale = 1, count = 0;
  for (let s = 0; s < OBS_CELL_LADDER.length; s += 1) {
    scale = OBS_CELL_LADDER[s];
    count = thinPass(n, order, xs, ys, cell.w * scale, cell.h * scale, box.w, box.h, w, h, grid, out);
    if (count <= max) return { count, scale };
    // 한 번에 건너뛴다: 버킷 수는 scale² 에 반비례한다. 필요한 배율의 0.9배에 못 미치는 칸은 돌려 보지 않는다.
    const need = scale * Math.sqrt(count / max) * 0.9;
    while (s + 1 < OBS_CELL_LADDER.length - 1 && OBS_CELL_LADDER[s + 1] < need) s += 1;
  }
  return { count: Math.min(count, max), scale };
}

// 시험과 콘솔이 쓰는 얇은 포장: [{x, y, key}] → 뽑힌 번호 배열. key 가 작을수록 먼저 자리를 갖는다.
export function thinPoints(points, { w, h, max, cell = OBS_CELL_CSS, box = OBS_BOX_CSS } = {}) {
  const n = points.length;
  const xs = new Float32Array(n), ys = new Float32Array(n);
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i += 1) { xs[i] = points[i].x; ys[i] = points[i].y; order[i] = i; }
  const keyOf = (i) => (Number.isFinite(points[i].key) ? points[i].key : 0);
  order.sort((a, b) => keyOf(a) - keyOf(b) || a - b);
  const out = new Int32Array(n);
  const got = thinAdaptive(n, order, xs, ys, w, h, max, { cells: new Int32Array(0) }, out, cell, box);
  return { picked: Array.from(out.subarray(0, got.count)), scale: got.scale };
}

// 자리 순서의 열쇠: 등급이 먼저, 그다음 '지금 찍혀 있던 것'(붙박이 — 자동 회전 중 깜빡임을 줄인다), 그다음 화면 가운데에 가까운 쪽.
export const obsOrderKey = (tier, sticky, facing) => tier * 4 + (sticky ? 0 : 2) + (1 - Math.max(0, Math.min(1, facing)));

/* ── 글리프 ─────────────────────────────────────────────────────────────── */
// 아틀라스 한 줄. 앞 13칸은 글자, 뒤 3칸은 기호(점 · OBS 꼬리표 · 화살촉). 칸 크기는 전부 같다(CSS px 기준).
export const OBS_CHARS = '0123456789−.°';
export const OBS_CELL_DOT = OBS_CHARS.length;
export const OBS_CELL_TAG = OBS_CHARS.length + 1;
export const OBS_CELL_ARROW = OBS_CHARS.length + 2;
export const OBS_ATLAS_CELLS = OBS_CHARS.length + 3;
const GLYPH_W = 24, GLYPH_H = 20;         // 칸 크기(CSS px). 글자보다 넉넉하다 — 외곽선과 겹선형 보간이 옆 칸으로 번지지 않게.
// 아틀라스 배율 2: main.js 가 렌더 배율을 min(DPR, 2) 로 묶는다 — DPR 2 에서 텍셀:픽셀이 1:1, DPR 1 에서 정확히 2:1(겹선형이 네 텍셀을
// 고르게 섞는다). 그래서 밉맵을 만들지 않는다: 밉맵은 1.5단 아래를 섞어 12px 글자를 뭉갠다. 768×40 px 한 장(약 0.12 MB).
const ATLAS_SCALE = 2;
const FONT_PX = 12.5;
const ADVANCE = { digit: 7.3, minus: 7.3, dot: 3.4, deg: 4.6 };   // 숫자는 같은 폭(표 숫자) — 값이 바뀌어도 라벨 폭이 안 떤다
const TEXT_X0 = 8;                        // 점 중심에서 첫 글자 왼쪽 끝까지
const TAG_DY = -11;                       // OBS 꼬리표는 숫자 아래(화면 아래 = −y)

const advanceOf = (ch) => (ch === '.' ? ADVANCE.dot : ch === '°' ? ADVANCE.deg : ch === '−' ? ADVANCE.minus : ADVANCE.digit);
export const obsTextWidth = (text) => { let w = 0; for (const ch of text) w += advanceOf(ch); return w; };

// 라벨 하나의 글리프 배치를 되쓰는 배열에 적는다: cells[k] = 아틀라스 칸 · offs[2k..] = 점 중심 기준 글리프 중심(CSS px, y 위쪽).
// 돌려주는 값은 글리프 수. 아틀라스에 없는 글자는 건너뛴다(숫자 포맷이 바뀌어도 엉뚱한 칸을 찍지 않는다).
export function layoutLabel(text, withArrow, cells, offs) {
  let k = 0;
  cells[k] = OBS_CELL_DOT; offs[0] = 0; offs[1] = 0; k += 1;
  let x = TEXT_X0;
  for (const ch of text) {
    const c = OBS_CHARS.indexOf(ch);
    const a = advanceOf(ch);
    if (c >= 0 && k < OBS_GLYPHS_PER_LABEL - 2) { cells[k] = c; offs[k * 2] = x + a / 2; offs[k * 2 + 1] = 0; k += 1; }
    x += a;
  }
  const textW = x - TEXT_X0;
  cells[k] = OBS_CELL_TAG; offs[k * 2] = TEXT_X0 + Math.max(textW, 18) / 2; offs[k * 2 + 1] = TAG_DY; k += 1;
  if (withArrow) { cells[k] = OBS_CELL_ARROW; offs[k * 2] = x + 8; offs[k * 2 + 1] = 0; k += 1; }
  return k;
}

// 아틀라스를 그린다(브라우저에서 한 번). 흰 글자 + 어두운 외곽선 — 파랑 띠 위에서도 빨강 띠 위에서도 읽힌다.
function drawAtlas(doc) {
  const S = ATLAS_SCALE;
  const can = doc.createElement('canvas');
  can.width = OBS_ATLAS_CELLS * GLYPH_W * S;
  can.height = GLYPH_H * S;
  const ctx = can.getContext('2d');
  if (!ctx) return null;
  const OUT = 'rgba(6,10,18,0.92)';
  ctx.lineJoin = 'round';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = (i) => (i + 0.5) * GLYPH_W * S;
  const cy = (GLYPH_H * S) / 2;
  ctx.font = `700 ${FONT_PX * S}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif`;
  ctx.lineWidth = 3 * S; ctx.strokeStyle = OUT; ctx.fillStyle = '#ffffff';
  let i = 0;
  for (const ch of OBS_CHARS) { ctx.strokeText(ch, cx(i), cy + 0.5 * S); ctx.fillText(ch, cx(i), cy + 0.5 * S); i += 1; }
  // 점 — 관측소 자리. 흰 점에 어두운 테.
  ctx.beginPath(); ctx.arc(cx(OBS_CELL_DOT), cy, 3.1 * S, 0, Math.PI * 2);
  ctx.lineWidth = 2.2 * S; ctx.stroke(); ctx.fill();
  // OBS 꼬리표 — '이 숫자는 잰 값이다'. 아래 색면이 모델이라 이 세 글자가 없으면 숫자도 모델로 읽힌다.
  ctx.font = `700 ${8 * S}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.lineWidth = 2.4 * S; ctx.fillStyle = '#bfe9ff';
  ctx.strokeText('OBS', cx(OBS_CELL_TAG), cy); ctx.fillText('OBS', cx(OBS_CELL_TAG), cy);
  // 화살촉 — 오른쪽(+x)을 본다. 셰이더가 바람이 가는 쪽으로 돌린다. 크기는 고정이다(값은 숫자가 말한다).
  const ax = cx(OBS_CELL_ARROW);
  ctx.beginPath();
  ctx.moveTo(ax + 5 * S, cy); ctx.lineTo(ax - 4 * S, cy - 4 * S); ctx.lineTo(ax - 1.6 * S, cy); ctx.lineTo(ax - 4 * S, cy + 4 * S);
  ctx.closePath();
  ctx.lineWidth = 2.2 * S; ctx.fillStyle = '#ffffff'; ctx.stroke(); ctx.fill();
  return can;
}

const VERT = /* glsl */`
uniform vec2 uViewport;            // CSS px — 글리프 크기와 간격을 장치픽셀이 아니라 CSS px 로 정한다(DPR 2 폰에서 절반으로 줄지 않게)
attribute vec3 aAnchor;            // 관측소 자리(월드)
attribute vec2 aOffset;            // 점 중심 기준 글리프 중심(CSS px, y 위쪽)
attribute vec4 aUv;                // 아틀라스 칸 (u0, v0, u1, v1)
attribute float aAlpha;            // 지평선 흐림(라벨 단위)
attribute vec3 aDir;               // 화살촉만: 바람이 가는 쪽 접선(월드). 0 이면 돌리지 않는다
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(aAnchor, 1.0);
  vec2 local = position.xy * vec2(${GLYPH_W}.0, ${GLYPH_H}.0);
  if (dot(aDir, aDir) > 0.0) {
    vec4 c2 = projectionMatrix * modelViewMatrix * vec4(aAnchor + aDir * 0.004, 1.0);
    vec2 s = (c2.xy / c2.w - clip.xy / clip.w) * uViewport;
    float len = length(s);
    if (len > 1e-5) { vec2 d = s / len; local = vec2(local.x * d.x - local.y * d.y, local.x * d.y + local.y * d.x); }
  }
  clip.xy += (aOffset + local) * 2.0 / uViewport * clip.w;
  gl_Position = clip;
  vUv = mix(aUv.xy, aUv.zw, position.xy + 0.5);
  vAlpha = aAlpha;
}`;
const FRAG = /* glsl */`
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 t = texture2D(uAtlas, vUv);
  float a = t.a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb, a);
  #include <colorspace_fragment>
}`;

const REASON_KO = Object.freeze({
  'ok': '찍는 중',
  'layer-off': '기온 레이어가 꺼져 있다',
  'not-now': "타임라인이 '지금'이 아니다 — 예보 시각에는 관측 숫자를 얹지 않는다",
  'loading': '관측 문서를 받는 중',
  'error': '관측 문서를 받지 못했다',
  'no-data': '찍을 수 있는 관측 지점이 없다',
  'stale': '관측 문서가 상한보다 늙었다 — 묵은 값을 지금이라 말하지 않는다',
  'none-in-view': '지금 보이는 쪽에 관측 지점이 없다',
  'no-canvas': '글리프 아틀라스를 그릴 캔버스가 없다',
});

/* ── 부품 ───────────────────────────────────────────────────────────────── */
// createObsLabels({ THREE, scene, getData, timeBus, surfR, horizonOpacity, ... })
//   getData()          → Promise<{ aws, gts }>  (둘 중 없는 쪽은 null). 이 파일은 fetch 를 모른다.
//   timeBus            time-bus.js 의 timeBus — on(fn) · isNow()
//   surfR(lat, lon)    그 자리의 지표 반지름(지형 × 과장 + 살짝 띄움). LiveLayers.surfR.
//   horizonOpacity(p, cam)  지평선 흐림. live-layers.js 의 newsChipOpacity 를 **그대로** 넣는다(식을 베끼지 않는다).
//   isPhone()          폰이면 상한 24.   getExagger()  지형 과장(바뀌면 자리를 다시 잡는다).
//   getViewport(out)   out.w · out.h 에 CSS px 를 적는다(기본: window.innerWidth/innerHeight).
//   doc                캔버스를 만들 document.   now()  시계.   isHidden()  탭이 가려졌나(가려졌으면 문서를 다시 묻지 않는다).
export function createObsLabels({
  THREE, scene, getData, timeBus, surfR, horizonOpacity,
  isPhone = () => false,
  getExagger = () => 1,
  getViewport = (out) => { out.w = globalThis.innerWidth > 0 ? globalThis.innerWidth : 0; out.h = globalThis.innerHeight > 0 ? globalThis.innerHeight : 0; },
  doc = globalThis.document,
  now = () => Date.now(),
  isHidden = () => !!(globalThis.document && globalThis.document.hidden),
} = {}) {
  if (!THREE || !scene || typeof getData !== 'function' || !timeBus || typeof surfR !== 'function' || typeof horizonOpacity !== 'function') {
    throw new Error('[obs-labels] THREE · scene · getData · timeBus · surfR · horizonOpacity 가 모두 있어야 한다');
  }
  const CAP = OBS_MAX_DESKTOP;                       // 버퍼는 큰 쪽 상한으로 한 번 잡는다. 폰은 앞의 24개만 쓴다.
  const INST = CAP * OBS_GLYPHS_PER_LABEL;

  let requested = false, isNow = timeBus.isNow(), metric = 'temp', disposed = false;
  let sites = null, docs = { KMA: null, GTS: null }, dropped = null;
  let lastAws, lastGts, loading = false, loadError = null, lastLoadMs = -Infinity;
  let dirty = true, pending = false, culls = 0, loads = 0, alphaWrites = 0;
  let placed = 0, freshCount = 0, cellScale = 1, lastCullMs = -Infinity;
  let mesh = null, geo = null, mat = null, atlas = null, noCanvas = false;
  let lastCamera = null;

  // 후보 버퍼 — 지점 수에 맞춰 한 번 잡고 되쓴다.
  let candIdx = new Uint32Array(0), candX = new Float32Array(0), candY = new Float32Array(0), candKey = new Float64Array(0);
  let order = new Uint32Array(0), outBuf = new Int32Array(0), sticky = new Uint8Array(0);
  const grid = { cells: new Int32Array(0) };
  // 찍힌 라벨(≤ CAP)
  const pSite = new Int32Array(CAP), pFirst = new Int32Array(CAP), pCount = new Int32Array(CAP);
  const pAlpha = new Float32Array(CAP), pTextW = new Float32Array(CAP), pAnchor = new Float32Array(CAP * 3);
  // 인스턴스 속성
  const aAnchor = new Float32Array(INST * 3), aOffset = new Float32Array(INST * 2), aUv = new Float32Array(INST * 4);
  const aAlpha = new Float32Array(INST), aDir = new Float32Array(INST * 3);
  // 되쓰는 임시값 — tick 안에서 객체를 새로 만들지 않는다
  const vp = new Float64Array(16), vpLast = new Float64Array(16), px = new Float64Array(2), view = { w: 0, h: 0 };
  const tmpP = { x: 0, y: 0, z: 0 }, tmpC = { x: 0, y: 0, z: 0 }, tmpDir = new Float64Array(3);
  const gCells = new Int8Array(OBS_GLYPHS_PER_LABEL), gOffs = new Float32Array(OBS_GLYPHS_PER_LABEL * 2);
  const ref = { x: 0, y: 0, z: 1, px: 0, py: 0, alt: 1, w: 0, h: 0, exag: NaN, has: false };
  const byKey = (a, b) => candKey[a] - candKey[b] || a - b;

  const offBus = timeBus.on(() => {
    const v = timeBus.isNow();
    if (v !== isNow) { isNow = v; dirty = true; }
  });

  const ensureGpu = () => {
    if (mesh || noCanvas) return !!mesh;
    const can = doc && typeof doc.createElement === 'function' ? drawAtlas(doc) : null;
    if (!can) { noCanvas = true; return false; }
    atlas = new THREE.CanvasTexture(can);
    atlas.colorSpace = THREE.SRGBColorSpace;
    atlas.generateMipmaps = false;                 // ATLAS_SCALE 주석 — 밉맵은 작은 글자를 뭉갠다
    atlas.minFilter = THREE.LinearFilter;
    atlas.magFilter = THREE.LinearFilter;
    geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const inst = (name, arr, size) => {
      const a = new THREE.InstancedBufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      return a;
    };
    inst('aAnchor', aAnchor, 3); inst('aOffset', aOffset, 2); inst('aUv', aUv, 4); inst('aAlpha', aAlpha, 1); inst('aDir', aDir, 3);
    geo.instanceCount = 0;
    mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas }, uViewport: { value: new THREE.Vector2(1, 1) } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthTest: false, depthWrite: false,   // 지형·색면 위에 늘 뜬다 — 지구 뒤편은 흐림(aAlpha)으로 직접 감춘다
    });
    mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'obs-labels';
    mesh.frustumCulled = false;       // 인스턴스 자리는 셰이더가 정한다 — 지오메트리 경계구로는 시야를 알 수 없다
    mesh.renderOrder = 960;
    mesh.visible = false;
    scene.add(mesh);
    return true;
  };

  const adopt = (got) => {
    const aws = got && got.aws ? got.aws : null;
    const gts = got && got.gts ? got.gts : null;
    lastLoadMs = now();
    if (aws === lastAws && gts === lastGts && sites) return;      // 같은 문서다(저장소가 TTL 안에서 같은 객체를 준다) — 다시 풀지 않는다
    lastAws = aws; lastGts = gts;
    const n = normalizeSurfaceObs({ aws, gts });
    sites = n.sites; docs = n.docs; dropped = n.dropped;
    const len = sites.length;
    candIdx = new Uint32Array(len); candX = new Float32Array(len); candY = new Float32Array(len); candKey = new Float64Array(len);
    order = new Uint32Array(len); outBuf = new Int32Array(len); sticky = new Uint8Array(len);
    placed = 0;
    dirty = true;
  };

  const load = () => {
    if (loading || disposed) return;
    loading = true; loads += 1;
    Promise.resolve().then(() => getData()).then((got) => {
      loading = false; loadError = null;
      if (!disposed) adopt(got);
    }, (e) => {
      loading = false; lastLoadMs = now();
      loadError = String((e && e.message) || e);
    });
  };

  const hide = () => { if (mesh && mesh.visible) mesh.visible = false; };

  // 다시 솎기 — 카메라가 문턱을 넘게 움직였을 때 · 자료/지표/보임이 바뀌었을 때만 온다.
  const recull = (camera, t) => {
    culls += 1; lastCullMs = t; dirty = false; pending = false;
    const w = view.w, h = view.h;
    const cp = camera.position;
    const cl = Math.hypot(cp.x, cp.y, cp.z) || 1;
    const cdx = cp.x / cl, cdy = cp.y / cl, cdz = cp.z / cl;
    tmpC.x = cp.x; tmpC.y = cp.y; tmpC.z = cp.z;
    const horizonCos = 1 / cl;                       // 반지름 1 구의 지평선 — 이보다 뒤는 물을 것도 없다
    const max = Math.min(CAP, isPhone() ? OBS_MAX_PHONE : OBS_MAX_DESKTOP);
    let n = 0; freshCount = 0;
    for (let i = 0; i < sites.length; i += 1) {
      const s = sites[i];
      if (s[metric] == null) continue;
      if (!obsFresh(s.obsMs, s.src, t)) continue;
      freshCount += 1;
      const facing = s.ux * cdx + s.uy * cdy + s.uz * cdz;
      if (facing <= horizonCos) continue;
      tmpP.x = s.ux; tmpP.y = s.uy; tmpP.z = s.uz;
      if (horizonOpacity(tmpP, tmpC) < OBS_MIN_OPACITY) continue;
      if (!projectPx(vp, s.ux, s.uy, s.uz, w, h, px)) continue;
      if (px[0] < 8 || px[0] > w - 8 || px[1] < 8 || px[1] > h - 8) continue;
      candX[n] = px[0]; candY[n] = px[1];
      candIdx[n] = i;
      candKey[n] = obsOrderKey(s.tier, sticky[i] === 1, facing);
      order[n] = n;
      n += 1;
    }
    order.subarray(0, n).sort(byKey);
    const got = thinAdaptive(n, order, candX, candY, w, h, max, grid, outBuf, OBS_CELL_CSS, OBS_BOX_CSS, placed > 0 ? cellScale : 0);
    cellScale = got.scale;
    sticky.fill(0);
    placed = 0;
    let inst = 0;
    const withArrowMetric = metric === 'wind';
    for (let k = 0; k < got.count; k += 1) {
      const si = candIdx[outBuf[k]];
      const s = sites[si];
      const text = formatObs(s[metric], metric);
      if (!text) continue;
      const arrow = withArrowMetric && s.windDir != null && s.wind >= OBS_CALM_MS;
      const gN = layoutLabel(text, arrow, gCells, gOffs);
      const r = surfR(s.lat, s.lon);
      const ax = s.ux * r, ay = s.uy * r, az = s.uz * r;
      pSite[placed] = si; pFirst[placed] = inst; pCount[placed] = gN; pTextW[placed] = obsTextWidth(text) + (arrow ? 14 : 0);
      pAnchor[placed * 3] = ax; pAnchor[placed * 3 + 1] = ay; pAnchor[placed * 3 + 2] = az;
      pAlpha[placed] = -1;                           // 아래 refreshAlpha 가 반드시 한 번 적게
      if (arrow) windTangent(s.lat, s.lon, s.windDir, tmpDir);
      for (let g = 0; g < gN; g += 1) {
        const c = gCells[g];
        aAnchor[inst * 3] = ax; aAnchor[inst * 3 + 1] = ay; aAnchor[inst * 3 + 2] = az;
        aOffset[inst * 2] = gOffs[g * 2]; aOffset[inst * 2 + 1] = gOffs[g * 2 + 1];
        aUv[inst * 4] = c / OBS_ATLAS_CELLS; aUv[inst * 4 + 1] = 0; aUv[inst * 4 + 2] = (c + 1) / OBS_ATLAS_CELLS; aUv[inst * 4 + 3] = 1;
        const rot = c === OBS_CELL_ARROW;
        aDir[inst * 3] = rot ? tmpDir[0] : 0; aDir[inst * 3 + 1] = rot ? tmpDir[1] : 0; aDir[inst * 3 + 2] = rot ? tmpDir[2] : 0;
        inst += 1;
      }
      sticky[si] = 1;
      placed += 1;
    }
    geo.instanceCount = inst;
    geo.attributes.aAnchor.needsUpdate = true;
    geo.attributes.aOffset.needsUpdate = true;
    geo.attributes.aUv.needsUpdate = true;
    geo.attributes.aDir.needsUpdate = true;
    // 다음 '얼마나 움직였나'의 기준점: 지금 카메라 바로 아래 지표점과 그 화면 자리.
    ref.x = cdx; ref.y = cdy; ref.z = cdz; ref.alt = Math.max(cl - 1, 1e-6); ref.w = w; ref.h = h; ref.exag = getExagger();
    ref.has = projectPx(vp, cdx, cdy, cdz, w, h, px);
    ref.px = px[0]; ref.py = px[1];
  };

  // 찍힌 라벨(≤ 60)의 지평선 흐림만 고친다. 값이 안 바뀌었으면 GPU 로 아무것도 올리지 않는다.
  const refreshAlpha = (camera) => {
    const cp = camera.position;
    tmpC.x = cp.x; tmpC.y = cp.y; tmpC.z = cp.z;
    let changed = false;
    for (let k = 0; k < placed; k += 1) {
      tmpP.x = pAnchor[k * 3]; tmpP.y = pAnchor[k * 3 + 1]; tmpP.z = pAnchor[k * 3 + 2];
      const a = horizonOpacity(tmpP, tmpC);
      if (Math.abs(a - pAlpha[k]) < 0.004) continue;
      pAlpha[k] = a;
      for (let g = pFirst[k], e = pFirst[k] + pCount[k]; g < e; g += 1) aAlpha[g] = a;
      changed = true;
    }
    if (changed) { geo.attributes.aAlpha.needsUpdate = true; alphaWrites += 1; }
  };

  const tick = (camera) => {
    if (disposed || !camera) return;
    lastCamera = camera;
    if (!requested || !isNow) { hide(); return; }
    const t = now();
    if (!loading && t - lastLoadMs > (sites && sites.length ? OBS_REFRESH_MS : OBS_RETRY_MS) && (!sites || !isHidden())) load();
    if (!sites || !sites.length) { hide(); return; }
    if (!ensureGpu()) return;
    getViewport(view);
    if (!(view.w > 0 && view.h > 0)) { hide(); return; }
    // projection × view — 되쓰는 배열에 직접 곱한다(Matrix4 를 새로 만들지 않는다)
    const P = camera.projectionMatrix.elements, V = camera.matrixWorldInverse.elements;
    for (let c = 0; c < 4; c += 1) {
      for (let r = 0; r < 4; r += 1) {
        vp[c * 4 + r] = P[r] * V[c * 4] + P[4 + r] * V[c * 4 + 1] + P[8 + r] * V[c * 4 + 2] + P[12 + r] * V[c * 4 + 3];
      }
    }
    // 글리프 크기는 CSS px 이다 — 창 크기가 바뀌면 그 프레임에 바로 맞춘다(솎기를 기다리지 않는다).
    const uv = mat.uniforms.uViewport.value;
    if (uv.x !== view.w || uv.y !== view.h) uv.set(view.w, view.h);
    let same = !dirty && !pending && ref.w === view.w && ref.h === view.h;
    if (same) for (let i = 0; i < 16; i += 1) if (vp[i] !== vpLast[i]) { same = false; break; }
    if (same && t - lastCullMs < OBS_AGE_RECHECK_MS) { mesh.visible = placed > 0; return; }   // 카메라가 가만히 있다 — 할 일이 없다
    vpLast.set(vp);

    let need = dirty || ref.w !== view.w || ref.h !== view.h || t - lastCullMs >= OBS_AGE_RECHECK_MS;
    if (!need) {
      const alt = Math.max(Math.hypot(camera.position.x, camera.position.y, camera.position.z) - 1, 1e-6);
      if (Math.abs(alt / ref.alt - 1) > OBS_RECULL_ZOOM) need = true;
      else if (Math.abs(getExagger() / ref.exag - 1) > 0.02) need = true;
      else if (!ref.has || !projectPx(vp, ref.x, ref.y, ref.z, view.w, view.h, px)) need = true;
      else if (Math.hypot(px[0] - ref.px, px[1] - ref.py) > OBS_RECULL_PX) need = true;
    }
    // 끌고 있는 동안 매 프레임 솎지 않는다 — 문턱을 넘어도 최소 간격은 지킨다(그 사이에는 흐림만 고친다).
    // 미뤄 둔 솎기는 pending 으로 남긴다: 그 사이 카메라가 멈춰도 '가만히 있다'로 빠지지 않고 다음 프레임에 마저 한다.
    if (need) {
      if (dirty || t - lastCullMs >= OBS_RECULL_MIN_MS) recull(camera, t);
      else pending = true;
    }
    refreshAlpha(camera);
    mesh.visible = placed > 0;
  };

  const reason = () => {
    if (!requested) return 'layer-off';
    if (!isNow) return 'not-now';
    if (noCanvas) return 'no-canvas';
    if (!sites) return loading || loads === 0 ? 'loading' : (loadError ? 'error' : 'no-data');
    if (!sites.length) return 'no-data';
    if (culls > 0 && freshCount === 0) return 'stale';
    if (culls > 0 && placed === 0) return 'none-in-view';
    return 'ok';
  };

  const docState = (d, src, t) => (d ? {
    observedMs: d.observedMs, observedKst: kstLabel(d.observedMs), count: d.count,
    ageMin: Number.isFinite(d.observedMs) ? Math.round((t - d.observedMs) / 60000) : null,
    stale: !obsFresh(d.observedMs, src, t), maxAgeMin: OBS_MAX_AGE_MS[src] / 60000,
  } : null);

  // 누른 자리의 라벨 → 지점 카드 자료. { x, y } (화면 CSS px = clientX/clientY) 또는 { lat, lon } (지구 레이캐스트 결과).
  // 지금 찍혀 있는 라벨만 누를 수 있다 — 안 보이는 지점이 눌리면 '왜 이 카드가 떴는지' 설명할 수 없다.
  const pick = (hit) => {
    if (!hit || !mesh || !mesh.visible || !placed || !lastCamera) return null;
    getViewport(view);
    let x = hit.x, y = hit.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      if (!Number.isFinite(hit.lat) || !Number.isFinite(hit.lon)) return null;
      const la = hit.lat * D2R, lo = hit.lon * D2R, c = Math.cos(la);
      if (!projectPx(vp, c * Math.sin(lo), Math.sin(la), c * Math.cos(lo), view.w, view.h, px)) return null;
      x = px[0]; y = px[1];
    }
    let best = -1, bestD = Infinity;
    for (let k = 0; k < placed; k += 1) {
      if (pAlpha[k] < OBS_MIN_OPACITY) continue;
      if (!projectPx(vp, pAnchor[k * 3], pAnchor[k * 3 + 1], pAnchor[k * 3 + 2], view.w, view.h, px)) continue;
      // 라벨 상자(화면 y 는 아래쪽): 점 왼쪽 6 ~ 글자 끝 + 2 · 위 10 ~ 아래 16(OBS 꼬리표)
      const dx = Math.max(px[0] - 6 - x, 0, x - (px[0] + TEXT_X0 + pTextW[k] + 2));
      const dy = Math.max(px[1] - 10 - y, 0, y - (px[1] + 16));
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best < 0 || bestD > OBS_PICK_SLOP_PX) return null;
    const s = sites[pSite[best]];
    const t = now();
    const d = docs[s.src] || {};
    return {
      id: s.id, src: s.src, name: s.name, ctry: s.ctry, lat: s.lat, lon: s.lon, alt: s.alt,
      metric, value: s[metric], text: formatObs(s[metric], metric), unit: OBS_METRICS[metric].unit,
      temp: s.temp, wind: s.wind, windDir: s.windDir, pres: s.pres,
      obsMs: s.obsMs, obsKst: kstLabel(s.obsMs), ageMin: Math.round((t - s.obsMs) / 60000),
      sourceKo: d.sourceKo || '', sourceEn: d.sourceEn || '', badge: OBS_BADGE,
    };
  };

  return {
    setVisible(v) {
      const on = !!v;
      if (on === requested) return;
      requested = on;
      dirty = true;
      if (!on) hide();
    },
    // 'temp' · 'wind'. 모르는 지표면 false — 없는 열을 찍는 척하지 않는다.
    setMetric(m) {
      if (!OBS_METRICS[m]) return false;
      if (m !== metric) { metric = m; dirty = true; if (sticky.length) sticky.fill(0); }
      return true;
    },
    tick,
    pick,
    // 지금 찍혀 있는 지점들(콘솔·시험용 — 부를 때만 배열을 만든다). 흐림이 0 인 것(지평선 너머로 넘어간 것)도 담긴다.
    placed() {
      const out = [];
      for (let k = 0; k < placed; k += 1) {
        const s = sites[pSite[k]];
        out.push({ src: s.src, id: s.id, name: s.name, lat: s.lat, lon: s.lon, tier: s.tier, text: formatObs(s[metric], metric), opacity: pAlpha[k], glyphs: pCount[k] });
      }
      return out;
    },
    state() {
      const t = now();
      const r = reason();
      return {
        reason: r, reasonKo: REASON_KO[r], shown: !!(mesh && mesh.visible), requested, isNow, metric,
        sites: sites ? sites.length : 0, fresh: freshCount, placed, max: isPhone() ? OBS_MAX_PHONE : OBS_MAX_DESKTOP, cellScale,
        docs: { KMA: docState(docs.KMA, 'KMA', t), GTS: docState(docs.GTS, 'GTS', t) },
        dropped, culls, loads, alphaWrites, loadError,
        // 지점 수와 무관하게 일정해야 하는 것 — 시험이 본다
        gpu: { textures: atlas ? 1 : 0, geometries: geo ? 1 : 0, materials: mat ? 1 : 0, drawCalls: mesh ? 1 : 0, instanceCapacity: INST, instances: geo ? geo.instanceCount : 0 },
      };
    },
    dispose() {
      disposed = true;
      offBus();
      if (mesh) { scene.remove(mesh); geo.dispose(); mat.dispose(); atlas.dispose(); }
      mesh = null; geo = null; mat = null; atlas = null; sites = null; placed = 0;
    },
  };
}

/* ── 범례에 붙일 한 줄(순수) ─────────────────────────────────────────────── */
// 상시 범례(field-legend.js)가 '지구 위 숫자가 무엇인지'를 말할 수 있게 한 줄을 만든다. state() 를 그대로 넣는다.
// 찍히고 있을 때만 말한다 — 안 찍히는데 범례가 관측 숫자를 설명하면 없는 것을 약속하는 셈이다.
export function obsLegendLine(st, lang = 'ko') {
  if (!st || !st.shown) return '';
  const ko = lang === 'ko';
  const parts = [];
  const k = st.docs && st.docs.KMA, g = st.docs && st.docs.GTS;
  if (k && !k.stale) parts.push(`${ko ? '기상청' : 'KMA'} ${k.observedKst}`);
  if (g && !g.stale) parts.push(`GTS ${g.observedKst}`);
  return ko
    ? `● 숫자 = 관측소 실측(OBS)${parts.length ? ` · ${parts.join(' · ')}` : ''}`
    : `● numbers = station observations (OBS)${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}

/* ── 지점 카드(순수) ────────────────────────────────────────────────────── */
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtLatLon = (lat, lon) => `${lat >= 0 ? 'N' : 'S'}${Math.abs(lat).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}${Math.abs(lon).toFixed(2)}°`;
const ageText = (min, ko) => {
  if (!Number.isFinite(min) || min < 0) return '';
  const h = Math.floor(min / 60), m = min % 60;
  if (ko) return h ? `${h}시간 ${m}분 전` : `${m}분 전`;
  return h ? `${h} h ${m} min ago` : `${m} min ago`;
};

// 카드 제목과 본문. 배지는 부르는 쪽이 showNote(title, body, p.badge) 로 단다 — 'OFFICIAL_OBSERVATION' 은 engine-bridge 의 어휘다.
// 값 · 관측 시각 · 출처는 전부 문서에서 온 것이다. 여기서 만드는 말은 '이 숫자가 무엇이고 무엇이 아닌가' 한 줄뿐이다.
export function obsCardTitle(p, lang = 'ko') {
  return lang === 'ko' ? `${p.name} · 관측 지점` : `${p.name} · observing station`;
}
export function obsCardHtml(p, { lang = 'ko' } = {}) {
  const ko = lang === 'ko';
  const stat = (k, v) => `<div class="stat"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>`;
  const rows = [];
  const m = OBS_METRICS[p.metric] || OBS_METRICS.temp;
  rows.push(stat(ko ? m.ko : m.en, `${esc(p.text)} ${esc(m.unit)}`));
  if (p.metric !== 'temp' && p.temp != null) rows.push(stat(ko ? '기온' : 'Temperature', `${esc(fmt1(p.temp))} °C`));
  if (p.metric !== 'wind' && p.wind != null) rows.push(stat(ko ? '풍속' : 'Wind speed', `${esc(fmt1(p.wind))} m/s`));
  if (p.pres != null) rows.push(stat(ko ? '해면기압' : 'Sea-level pressure', `${esc(fmt1(p.pres))} hPa`));
  const age = ageText(p.ageMin, ko);
  rows.push(stat(ko ? '관측 시각' : 'Observed', `${esc(p.obsKst)}${age ? ` <span style="opacity:.65">(${esc(age)})</span>` : ''}`));
  const where = `${fmtLatLon(p.lat, p.lon)}${p.alt != null ? (ko ? ` · 해발 ${Math.round(p.alt)} m` : ` · ${Math.round(p.alt)} m a.s.l.`) : ''}`;
  rows.push(stat(ko ? '지점' : 'Station', esc(where)));
  rows.push(stat(ko ? '출처' : 'Source', esc(ko ? (p.sourceKo || p.sourceEn) : (p.sourceEn || p.sourceKo))));
  const note = ko
    ? '관측소 한 점에서 잰 값입니다(예보가 아닙니다). 아래 색면은 모델의 격자 평균이라 이 숫자와 다를 수 있습니다.'
    : 'A measurement at one station — not a forecast. The colour field underneath is a model grid average and may differ from this number.';
  return `<div class="stats">${rows.join('')}</div><p style="margin-top:8px;opacity:.75;font-size:11px">${note}</p>`;
}
