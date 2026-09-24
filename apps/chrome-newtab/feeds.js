// EARTHUS 새 탭 — 자료 표 · 형식 고정 · 신선도 · 사실 카드 문장 (2026-09-24 · 지시서 §4-2 · §4-5)
//
// 이 파일은 DOM 도 chrome.* 도 모른다(순수 함수). sw.js 가 받은 JSON 을 여기서 **쓰는 키만** 골라 정규화해 저장하고,
// newtab.js 가 저장된 것을 여기서 문장으로 만든다. node --test 가 같은 함수를 그대로 부른다(tests/feeds.test.mjs).
//
// ⚠️ 확장은 스토어 심사를 거쳐야 고쳐진다(며칠~몇 주). 자료 Lambda 가 JSON 형식을 바꾸면 새 탭이 깨진다(지시서 R16).
//   그래서 ① 쓰는 키 목록을 아래 normalize* 에 고정하고 ② 필수 키가 없거나 모양이 다르면 그 줄을 빼고
//   '형식 변경 — 지구 전체 보기에서 확인' 을 띄운다. 모르는 키는 무시한다(더해지는 것은 깨뜨리지 않는다).
//   이 파일이 읽는 키(자료 Lambda 쪽 주석 추가는 PD 확인 뒤 — 지시서 §4-5):
//     clouds/meta.json        time · credit · north · south · variants.webp2048.{key, sha256}
//     events/kma-warn.json    observedKst · source · freshnessPolicy.staleAfterMinutes(선택) · active[].{kind, kindEn, level, region}
//     events/quake-asia.json  generated · sources[].{id, ko, en} · quakes[].{src, srcKo, at, mag, place, placeEn, intensity, early}
//     events/tsunami-intl.json generated · alerts[].{center, category, updated, bulletin}
//     wind/kma-aws.json       observedKst · source · stations[].{id, name, temp_c, wind_ms, wind_dir}
//
// 지어내지 않는다(AGENTS.md 공통 ①): 값이 없으면 그 조각을 빼고, 조각이 다 없으면 그 줄을 뺀다.
//   ⚠️ Number(null) === 0 — 결측이 0℃·무풍으로 찍히는 함정(기억 v1-weather-sheet-apple). 그래서 이 파일에는
//   Number(x) · x || 0 이 없다. num() 하나만 값을 숫자로 바꾼다(prototype/v2-three/js/obs-labels.js obsNumber 와 같은 규율).

export const ORIGIN = 'https://earthus.net';
// sha256 이 meta 와 안 맞을 때만 쓰는 두 번째 길(늘 ACAO *). prototype/v2-three/js/main.js:1445 S3_DIRECT 와 같은 주소.
export const S3_DIRECT = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';

export const ENDPOINTS = Object.freeze({
  cloudMeta: '/clouds/meta.json',
  kmaWarn: '/events/kma-warn.json',
  quakeAsia: '/events/quake-asia.json',
  tsunami: '/events/tsunami-intl.json',
  kmaAws: '/wind/kma-aws.json',
});
export const FEED_KEYS = Object.freeze(Object.keys(ENDPOINTS));

// 신선도 임계(분). 지시서 §4-5 표.
// (2026-09-24 정정 · 지시서와 다르게 둔 것 하나) kmaAws 는 지시서 표의 90분이 아니라 190분이다.
//   사고가 될 뻔한 것: 수집기 cron(25 * * * ?)이 '한 시간 전 정시'를 읽어서(aws/kma-aws/handler.py:314) 서버 파일의
//   관측 시각 나이가 정상일 때도 1시간 25분 ~ 2시간 25분이다(obs-labels.js 머리말 실측). 90분으로 자르면 한 시간 중
//   55분 동안 '기온 자료 지연'이 뜬다 — 정상을 지연이라 말하는 것도 사실과 다르다.
//   190 = 서버 파일 최대 나이 145 + 새 탭 알람 주기 15 + Lambda 지연 여유 30. (v2 obs-labels.js 는 145 + 12 + 30 = 187)
export const FRESH_MIN = Object.freeze({
  cloud: 120,          // meta.time 기준 — '구름 자료 지연'
  kmaWarnDefault: 45,  // 파일의 freshnessPolicy.staleAfterMinutes 가 있으면 그것을 따른다
  quakeFile: 60,       // generated 기준
  tsunamiFile: 60,     // generated 기준
  kmaAws: 190,         // observedKst 기준 — 위 정정
});
export const QUAKE_WINDOW_H = 24;
// (2026-09-24) 쓰나미 줄도 24시간 창을 둔다 — 지시서에는 '있을 때만'뿐이었다. 운영 파일은 2026-09-24 에 일주일 지난
//   'Information' 두 건(09-17 NTWC · 09-18 PTWC)을 싣고 있었다. 창 없이 '쓰나미 · 발표 2건' 이라 쓰면 지금 일인 것처럼 읽힌다.
export const TSUNAMI_WINDOW_H = 24;
export const ALARM_MINUTES = 15;
export const RECENT_OPEN_MS = 2 * 3600 * 1000;   // 새 탭이 2시간 안에 열린 적이 있을 때만 알람이 받는다
export const PAGE_REFRESH_AFTER_MS = ALARM_MINUTES * 60 * 1000;
export const FETCH_TIMEOUT_MS = 25000;
const FUTURE_SLACK_MS = 3600 * 1000;             // 기기 시계가 틀려 '미래'로 읽히는 폭(obs-labels.js OBS_FUTURE_SLACK_MS 와 같은 값)

/* ── 값 읽기 ─────────────────────────────────────────────────────────── */

// 유한한 숫자만 숫자다. null · '' · undefined · NaN · 문자열 결측은 null.
export function num(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const s = v.trim();
    if (!s || !/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// 시각 형식 두 가지(둘 다 KST):  '20260924 14:00'(kma-aws) · '202609241532'(kma-warn) → epoch ms. 못 읽으면 null.
//   출처: prototype/v2-three/js/obs-labels.js parseObsTime (zone 'KST') 를 옮겼다.
export function parseKstDigits(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length !== 12) return null;
  const y = +d.slice(0, 4), mo = +d.slice(4, 6), da = +d.slice(6, 8), h = +d.slice(8, 10), mi = +d.slice(10, 12);
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, da, h, mi);
  return Number.isFinite(ms) ? ms - 9 * 3600 * 1000 : null;
}
// ISO 8601 (시간대 표기가 반드시 있어야 한다 — 없으면 기기 시간대로 읽혀 틀린다).
export function parseIso(v) {
  const s = str(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

// 기상청 풍향은 도(°)가 아니라 36방위 부호(×10°, 0 = 고요)다(기억 kma-wind-dir-36-code).
//   출처: prototype/v2-three/js/obs-labels.js obsWindDirDeg(v, 'KMA'). 1..36 → ×10 (36 → 0 = 북), 그 밖은 null.
export function windDirDegFromKma36(code) {
  const n = num(code);
  if (n == null || n < 1 || n > 36) return null;
  return (n * 10) % 360;
}

/* ── 형식 고정: 쓰는 키만 고른다 ─────────────────────────────────────── */

const bad = (missing) => ({ ok: false, reason: 'format', missing });

export function normalizeCloudMeta(j) {
  if (!j || typeof j !== 'object') return bad(['<root>']);
  const miss = [];
  const timeMs = parseIso(j.time); if (timeMs == null) miss.push('time');
  const credit = str(j.credit); if (!credit) miss.push('credit');
  const north = num(j.north), south = num(j.south);
  if (north == null || north > 90 || north <= 0) miss.push('north');
  if (south == null || south < -90 || south >= 0) miss.push('south');
  // (2026-09-24 정정 · 적대 검수) variants 가 **통째로 없는** meta 는 형식 변경이 아니다.
  //   사고가 될 뻔한 것: aws/gmgsi-clouds/handler.py 는 매시 meta.json 을 두 번 쓴다 — ① put_meta(meta) 는 variants 없이,
  //   ③ 변형을 올린 뒤에만 variants 를 채워 다시 쓴다(변형 인코딩이 죽으면 ③ 은 없다 — "meta 에 variants 가 없으면 앱은 PNG").
  //   ①~③ 사이(인코딩 수 초 + 엣지 캐시 최대 300 s)에 알람이 meta 를 받으면 여기서 'format' 이 되어 지구 아래에
  //   '형식 변경 — 지구 전체 보기에서 확인' 이 15분 동안 떴다 — 바뀐 것이 없는데 바뀌었다고 말하는 것이다.
  //   이제 'no-variant' 로 돌려주고, sw.js 는 이것을 저장하지 않는다(이전 그림·이전 시각 유지, 문구 없음 — 지시서 §4-2 짝 불일치와 같은 대우).
  //   변형이 계속 안 나오면 구름 시각이 늙어 2시간 뒤 '구름 자료 지연' 이 정직하게 뜬다.
  //   variants 는 있는데 webp2048 의 모양이 다르면 그때는 형식 변경이다(아래 그대로).
  if (!miss.length && (j.variants == null || (typeof j.variants === 'object' && j.variants.webp2048 == null))) {
    return { ok: false, reason: 'no-variant', time: j.time };
  }
  const v = j.variants && j.variants.webp2048;
  const key = v && str(v.key);
  if (!key || !/^clouds\/[A-Za-z0-9._-]+\.webp$/.test(key)) miss.push('variants.webp2048.key');
  const sha = v && str(v.sha256);
  if (!sha || !/^[0-9a-f]{64}$/.test(sha)) miss.push('variants.webp2048.sha256');
  if (miss.length) return bad(miss);
  return { ok: true, data: { time: j.time, timeMs, credit, north, south, key, sha256: sha } };
}

export function normalizeKmaWarn(j) {
  if (!j || typeof j !== 'object') return bad(['<root>']);
  const miss = [];
  const observedMs = parseKstDigits(j.observedKst); if (observedMs == null) miss.push('observedKst');
  if (!Array.isArray(j.active)) miss.push('active');
  const active = [];
  if (Array.isArray(j.active)) {
    for (const a of j.active) {
      const kind = a && str(a.kind), level = a && str(a.level);
      if (!kind || !level) { miss.push('active[].kind/level'); break; }
      active.push({ kind, kindEn: str(a.kindEn), level, region: str(a.region) });
    }
  }
  if (miss.length) return bad(miss);
  const pol = j.freshnessPolicy && num(j.freshnessPolicy.staleAfterMinutes);
  return {
    ok: true,
    data: {
      observedMs,
      staleAfterMin: pol != null && pol > 0 ? pol : FRESH_MIN.kmaWarnDefault,
      source: str(j.source) || '기상청 기상특보',
      sourceEn: str(j.sourceEn) || 'KMA weather warnings',
      active,
    },
  };
}

export function normalizeQuakeAsia(j) {
  if (!j || typeof j !== 'object') return bad(['<root>']);
  const miss = [];
  const generatedMs = parseIso(j.generated); if (generatedMs == null) miss.push('generated');
  if (!Array.isArray(j.quakes)) miss.push('quakes');
  const quakes = [];
  if (Array.isArray(j.quakes)) {
    for (const q of j.quakes) {
      const src = q && str(q.src);
      const atMs = q && parseIso(q.at);
      if (!src || atMs == null) { miss.push('quakes[].src/at'); break; }
      quakes.push({
        src, srcKo: str(q.srcKo), at: q.at, atMs, mag: num(q.mag),
        place: str(q.place), placeEn: str(q.placeEn),
        intensity: q.intensity == null ? null : str(String(q.intensity)),
        early: q.early === true,
      });
    }
  }
  if (miss.length) return bad(miss);
  const agencies = {};
  if (Array.isArray(j.sources)) for (const s of j.sources) if (s && str(s.id)) agencies[s.id] = { ko: str(s.ko), en: str(s.en) };
  return { ok: true, data: { generatedMs, agencies, quakes } };
}

export function normalizeTsunami(j) {
  if (!j || typeof j !== 'object') return bad(['<root>']);
  const miss = [];
  const generatedMs = parseIso(j.generated); if (generatedMs == null) miss.push('generated');
  if (!Array.isArray(j.alerts)) miss.push('alerts');
  const alerts = [];
  if (Array.isArray(j.alerts)) {
    for (const a of j.alerts) {
      const center = a && str(a.center), category = a && str(a.category), updatedMs = a && parseIso(a.updated);
      if (!center || !category || updatedMs == null) { miss.push('alerts[].center/category/updated'); break; }
      const b = str(a.bulletin);
      // 원문 링크는 tsunami.gov 의 https 주소만 건다 — 자료 속 임의 주소로 사용자를 보내지 않는다.
      alerts.push({ center, category, updatedMs, bulletin: b && /^https:\/\/(www\.)?tsunami\.gov\//.test(b) ? b : null });
    }
  }
  if (miss.length) return bad(miss);
  return { ok: true, data: { generatedMs, source: str(j.source) || 'NOAA tsunami.gov', alerts } };
}

export function normalizeKmaAws(j) {
  if (!j || typeof j !== 'object') return bad(['<root>']);
  const miss = [];
  const observedMs = parseKstDigits(j.observedKst); if (observedMs == null) miss.push('observedKst');
  if (!Array.isArray(j.stations)) miss.push('stations');
  const stations = [];
  if (Array.isArray(j.stations)) {
    for (const s of j.stations) {
      const id = s && s.id != null ? str(String(s.id)) : null;
      if (!id) { miss.push('stations[].id'); break; }
      if (!('temp_c' in s) && !('wind_ms' in s)) { miss.push('stations[].temp_c/wind_ms'); break; }
      stations.push({ id, name: str(s.name), temp_c: num(s.temp_c), wind_ms: num(s.wind_ms), wind_dir_deg: windDirDegFromKma36(s.wind_dir) });
    }
  }
  if (miss.length) return bad(miss);
  return { ok: true, data: { observedMs, source: str(j.source) || '기상청 지상관측', sourceEn: str(j.sourceEn) || 'KMA surface observations', stations } };
}

export const NORMALIZE = Object.freeze({
  cloudMeta: normalizeCloudMeta,
  kmaWarn: normalizeKmaWarn,
  quakeAsia: normalizeQuakeAsia,
  tsunami: normalizeTsunami,
  kmaAws: normalizeKmaAws,
});

/* ── 신선도 ──────────────────────────────────────────────────────────── */

// 'fresh' | 'stale'. 미래로 한 시간 넘게 튄 시각도 믿지 않는다(stale).
export function freshness(timeMs, nowMs, maxMin) {
  if (timeMs == null) return 'stale';
  if (timeMs - nowMs > FUTURE_SLACK_MS) return 'stale';
  return nowMs - timeMs > maxMin * 60000 ? 'stale' : 'fresh';
}

/* ── 시각 표기 (KST 고정 — 기기 시간대와 무관) ──────────────────────── */

const pad = (n) => String(n).padStart(2, '0');
function kstParts(ms) {
  const d = new Date(ms + 9 * 3600 * 1000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
// 'HH:MM' — 여는 날(KST)과 날짜가 다르면 'MM-DD HH:MM'.
export function fmtKst(ms, nowMs) {
  const p = kstParts(ms);
  const hm = `${pad(p.h)}:${pad(p.mi)}`;
  if (nowMs == null) return hm;
  const n = kstParts(nowMs);
  return (p.y === n.y && p.mo === n.mo && p.d === n.d) ? hm : `${pad(p.mo)}-${pad(p.d)} ${hm}`;
}
export function fmtUtc(ms) {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
const iso = (ms) => new Date(ms).toISOString();

/* ── 받기 규칙(알람 · 구름 · 새 탭의 요청) ───────────────────────────── */

// 알람이 받을 조건: 최근 2시간 안에 새 탭이 열렸다. 한 번도 안 열렸으면 받지 않는다.
export function shouldRefreshOnAlarm(nowMs, lastNewtabOpenAt) {
  const t = num(lastNewtabOpenAt);
  return t != null && nowMs - t <= RECENT_OPEN_MS && nowMs - t >= -FUTURE_SLACK_MS;
}
// 구름 WebP(1.5 MB) 를 받을 조건: meta.time 이 바뀌었다 + 최근 2시간 안에 새 탭이 열렸다.
export function needCloudDownload(meta, heldCloud, nowMs, lastNewtabOpenAt) {
  if (!meta || !meta.time) return false;
  if (heldCloud && heldCloud.time === meta.time) return false;
  return shouldRefreshOnAlarm(nowMs, lastNewtabOpenAt);
}
// 새 탭이 SW 에 '받아 줘' 를 청할 조건: 온라인이고 마지막 받기가 15분 넘었다(또는 한 번도 없다).
export function pageShouldAskRefresh(nowMs, lastFetchAt, online) {
  if (!online) return false;
  const t = num(lastFetchAt);
  return t == null || nowMs - t >= PAGE_REFRESH_AFTER_MS;
}

/* ── 사실 카드 ───────────────────────────────────────────────────────── */
// 한 줄 = { id, status, parts:[{t:'v'|'s', text}], source, time(ISO), href?, hrefText? }
//   parts 의 'v' 는 값, 's' 는 출처·시각. 화면은 둘 다 글자로 보이고, 줄 요소에 data-source · data-time 이 붙는다.
// t(key, subs) = chrome.i18n.getMessage 와 같은 모양(시험은 _locales 를 읽는 가짜를 넘긴다).

const fixed1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

function formatLine(id, t) {
  return { id, status: 'format', parts: [{ t: 'v', text: t('formatChanged') }], source: '', time: '' };
}

export function skyLine(feed, city, lang, nowMs, t) {
  if (!feed || !city) return null;
  if (!feed.ok) return feed.reason === 'format' ? formatLine('sky', t) : null;
  const d = feed.data;
  const st = d.stations.find((s) => s.id === city.stationId);
  if (!st || (st.temp_c == null && st.wind_ms == null)) return null;
  const src = lang === 'ko' ? d.source : d.sourceEn;
  const hm = fmtKst(d.observedMs, nowMs);
  if (freshness(d.observedMs, nowMs, FRESH_MIN.kmaAws) === 'stale') {
    return { id: 'sky', status: 'stale', parts: [{ t: 's', text: t('skyStale', [hm]) }], source: src, time: iso(d.observedMs) };
  }
  const name = lang === 'ko' ? city.ko : city.en;
  const bits = [name];
  if (st.temp_c != null) bits.push(t('skyTemp', [fixed1(st.temp_c)]));
  const v = [bits.join(' ')];
  if (st.wind_ms != null) v.push(t('skyWind', [fixed1(st.wind_ms)]));
  return {
    id: 'sky', status: 'fresh',
    parts: [{ t: 'v', text: v.join(' · ') }, { t: 's', text: t('skySrc', [hm]) }],
    source: src, time: iso(d.observedMs),
    windDirDeg: st.wind_dir_deg,
  };
}

const LEVEL_EN = { 주의보: 'advisory', 경보: 'warning', 중대경보: 'major warning' };
// 파일의 levels 순서(["주의보","경보","중대경보"])와 같은 뜻 — aws/kma-warn/handler.py LEVEL
const LEVEL_RANK = { 주의보: 1, 경보: 2, 중대경보: 3 };

export function warnLine(feed, lang, nowMs, t) {
  if (!feed) return null;
  if (!feed.ok) return feed.reason === 'format' ? formatLine('warn', t) : null;
  const d = feed.data;
  const src = lang === 'ko' ? d.source : d.sourceEn;
  const hm = fmtKst(d.observedMs, nowMs);
  // 늙은 자료로 '없음'이라 말하지 않는다(지시서 §1-2 ①).
  if (freshness(d.observedMs, nowMs, d.staleAfterMin) === 'stale') {
    return { id: 'warn', status: 'stale', parts: [{ t: 's', text: t('warnStale', [hm]) }], source: src, time: iso(d.observedMs) };
  }
  if (!d.active.length) {
    return { id: 'warn', status: 'fresh', parts: [{ t: 'v', text: t('warnNone') }, { t: 's', text: t('warnSrc', [hm]) }], source: src, time: iso(d.observedMs) };
  }
  // 종류(kind+level)별 구역 수. 높은 단계(중대경보 > 경보 > 주의보) 먼저, 같으면 구역 많은 순, 그다음 이름순 —
  //   경보가 주의보 뒤로 밀려 '외 N종' 에 숨으면 안 된다. 순서가 매번 같아야 한다(무작위 금지).
  const groups = new Map();
  for (const a of d.active) {
    const name = lang === 'ko' ? `${a.kind}${a.level}` : `${a.kindEn || a.kind} ${LEVEL_EN[a.level] || a.level}`;
    const g = groups.get(name) || { n: 0, rank: LEVEL_RANK[a.level] || 0 };
    g.n += 1;
    groups.set(name, g);
  }
  const sorted = [...groups.entries()].sort((x, y) => y[1].rank - x[1].rank || y[1].n - x[1].n || (x[0] < y[0] ? -1 : 1));
  const shown = sorted.slice(0, 2).map(([n, g]) => t('warnGroup', [n, String(g.n)]));
  let text = shown.join(' · ');
  if (sorted.length > 2) text += ' ' + t('warnMore', [String(sorted.length - 2)]);
  return {
    id: 'warn', status: 'fresh',
    parts: [{ t: 'v', text: t('warnActive', [text]) }, { t: 's', text: t('warnSrc', [hm]) }],
    source: src, time: iso(d.observedMs),
  };
}

// 규모·진도는 기관이 낸 그대로. 진도는 기관마다 척도가 다르다(JMA 震度 · 기상청 MMI 로마숫자) — 기관 이름과 같이 적는다.
function intensityText(q, lang, t) {
  const x = q.intensity;
  if (!x) return null;
  if (/^\d/.test(x)) return t('quakeIntensity', [x]);
  if (lang !== 'ko') return x.replace(/^최대진도\s*/, 'max intensity ');
  return x;
}

export function quakeLine(feed, lang, nowMs, t) {
  if (!feed) return null;
  if (!feed.ok) return feed.reason === 'format' ? formatLine('quake', t) : null;
  const d = feed.data;
  const gen = fmtKst(d.generatedMs, nowMs);
  const fileSrc = Object.values(d.agencies).map((a) => (lang === 'ko' ? a.ko : a.en)).filter(Boolean).join(' · ') || 'KMA · JMA';
  if (freshness(d.generatedMs, nowMs, FRESH_MIN.quakeFile) === 'stale') {
    return { id: 'quake', status: 'stale', parts: [{ t: 's', text: t('quakeStale', [gen]) }], source: fileSrc, time: iso(d.generatedMs) };
  }
  const from = nowMs - QUAKE_WINDOW_H * 3600 * 1000;
  // 조기경보(early)는 확정 전 값이라 사실 카드에 올리지 않는다. 미래로 튄 시각도 뺀다.
  const inWin = d.quakes.filter((q) => !q.early && q.atMs >= from && q.atMs <= nowMs + FUTURE_SLACK_MS);
  if (!inWin.length) {
    return { id: 'quake', status: 'fresh', parts: [{ t: 'v', text: t('quakeNone') }, { t: 's', text: t('quakeNoneSrc', [gen]) }], source: fileSrc, time: iso(d.generatedMs) };
  }
  const latest = (arr) => arr.reduce((a, b) => (b.atMs > a.atMs ? b : a));
  const kma = inWin.filter((q) => q.src === 'KMA');
  const q = latest(kma.length ? kma : inWin);    // 한국 기상청 항목이 있으면 먼저(지시서 §4-2)
  const ag = d.agencies[q.src] || {};
  const agency = lang === 'ko' ? (q.srcKo || ag.ko || q.src) : (ag.en || q.src);
  // 곳 이름: 한국어 화면은 기관이 쓴 원문(JMA 는 일본어 원문 — 우리가 번역해 지어 쓰지 않는다), 영어 화면은 placeEn 이 있으면 그것.
  const place = lang === 'ko' ? (q.place || q.placeEn) : (q.placeEn || q.place);
  const v = [];
  if (q.mag != null) v.push(`M${fixed1(q.mag)}`);
  if (place) v.push(place);
  if (!v.length) return null;
  const s = [`${fmtKst(q.atMs, nowMs)} KST`, agency];
  const it = intensityText(q, lang, t);
  if (it) s.push(it);
  return {
    id: 'quake', status: 'fresh',
    parts: [{ t: 'v', text: v.join(' · ') }, { t: 's', text: s.join(' · ') }],
    source: agency, time: iso(q.atMs),
  };
}

export function tsunamiLine(feed, lang, nowMs, t) {
  if (!feed || !feed.ok) return feed && !feed.ok && feed.reason === 'format' ? formatLine('tsunami', t) : null;
  const d = feed.data;
  const from = nowMs - TSUNAMI_WINDOW_H * 3600 * 1000;
  const recent = d.alerts.filter((a) => a.updatedMs >= from && a.updatedMs <= nowMs + FUTURE_SLACK_MS);
  if (!recent.length) return null;                       // 있을 때만
  if (freshness(d.generatedMs, nowMs, FRESH_MIN.tsunamiFile) === 'stale') {
    return { id: 'tsunami', status: 'stale', parts: [{ t: 's', text: t('tsunamiStale', [fmtKst(d.generatedMs, nowMs)]) }], source: d.source, time: iso(d.generatedMs) };
  }
  const newest = recent.reduce((a, b) => (b.updatedMs > a.updatedMs ? b : a));
  const centers = [...new Set(recent.map((a) => a.center))].sort().join('·');
  const cats = [...new Set(recent.map((a) => a.category))].sort().join('·');   // 기관 분류 그대로(번역하지 않는다)
  return {
    id: 'tsunami', status: 'fresh',
    parts: [{ t: 'v', text: t('tsunamiLine', [centers, String(recent.length), cats]) }, { t: 's', text: `${fmtKst(newest.updatedMs, nowMs)} KST` }],
    source: d.source, time: iso(newest.updatedMs),
    href: newest.bulletin, hrefText: newest.bulletin ? t('tsunamiLink') : null,
  };
}

export const DEFAULT_LINES = Object.freeze({ sky: true, warn: true, quake: true, tsunami: true });

/**
 * 사실 카드 전체. feeds = 저장된 정규화 결과 { kmaAws, kmaWarn, quakeAsia, tsunami } (각 {ok,data}|{ok:false,reason}).
 * 특보·지진 줄(형식 변경 줄 제외)이 하나라도 있으면 마지막에 안전 문구를 붙인다.
 */
export function buildFacts(feeds, opts) {
  const { city, lang, nowMs, t } = opts;
  const on = Object.assign({}, DEFAULT_LINES, opts.lines || {});
  const f = feeds || {};
  const lines = [];
  if (on.sky) { const l = skyLine(f.kmaAws, city, lang, nowMs, t); if (l) lines.push(l); }
  if (on.warn) { const l = warnLine(f.kmaWarn, lang, nowMs, t); if (l) lines.push(l); }
  if (on.quake) { const l = quakeLine(f.quakeAsia, lang, nowMs, t); if (l) lines.push(l); }
  if (on.tsunami) { const l = tsunamiLine(f.tsunami, lang, nowMs, t); if (l) lines.push(l); }
  if (lines.some((l) => (l.id === 'warn' || l.id === 'quake' || l.id === 'tsunami') && l.status !== 'format')) {
    lines.push({ id: 'safety', status: 'note', parts: [{ t: 's', text: t('safety') }], source: '', time: '' });
  }
  return lines;
}

// 지구 아래 상태 한 줄(조건마다 문구 하나로 고정 — 무작위 금지). 없으면 null.
//   우선순위: 오프라인 > 구름 형식 변경 > 구름 없음(받는 중) > 구름 지연.
export function cloudStatus(opts) {
  const { online, shownCloud, metaFeed, nowMs, t } = opts;
  if (!online) {
    return shownCloud ? t('offline', [fmtKst(shownCloud.timeMs, nowMs)]) : t('offlineNoCloud');
  }
  if (metaFeed && !metaFeed.ok && metaFeed.reason === 'format') return t('formatChanged');
  if (!shownCloud) return t('cloudLoading');
  if (freshness(shownCloud.timeMs, nowMs, FRESH_MIN.cloud) === 'stale') {
    const hours = Math.max(2, Math.floor((nowMs - shownCloud.timeMs) / 3600000));
    return t('cloudStale', [String(hours), fmtKst(shownCloud.timeMs, nowMs)]);
  }
  return null;
}

// chrome.i18n.getMessage 와 같은 방식의 치환($1..$9). 시험과 옵션 페이지가 같이 쓴다.
export function makeTranslator(messages) {
  return (key, subs) => {
    const m = messages[key];
    if (!m) return '';
    const arr = subs == null ? [] : Array.isArray(subs) ? subs : [subs];
    return m.message.replace(/\$(\d)/g, (_, i) => (arr[+i - 1] != null ? String(arr[+i - 1]) : ''));
  };
}
