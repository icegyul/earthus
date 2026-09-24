// earthus — 푸시 알림 본문 글자 (push-tick 전용 · 순수 함수)
//
// 왜 따로 떼었나 (2026-09-24, 앱 지시서 D5 · §0-1 ⑦ · Phase 1 기준 6)
//   알림 본문에 **기관과 발표·관측 시각(HH:MM KST)** 이 빠져 있었다.
//   지진 = `장소 · 깊이` 뿐(기관·시각 없음), 특보 = 기상청은 있으나 발표 시각 없음,
//   관광 = ISO 원문(`2026-08-20T06:35:00.000Z`)을 그대로 찍었다.
//   "모든 값에 출처와 시각"(AGENTS.md 공통 원칙 ②)이 알림에서만 깨져 있었다.
//
// ⚠️ 이 파일은 Deno(Edge Function)와 Node(시험) 둘 다에서 읽힌다.
//    그래서 npm:·jsr:·Deno.* 를 import 하지 않는다. 순수 함수만 둔다.
//    (전례: _shared/forecast-v8-policy.js ↔ tools/test_v8_forecast_server_policy.mjs)
//
// ⚠️ 시각은 **직접 쪼개서** 읽는다. new Date(문자열) 은 런타임마다 다르게 읽는다
//    (push-tick/index.ts 의 ageMin 주석과 같은 이유). 그리고 **서버 시간대(TZ)에 기대지 않는다** —
//    getHours() 같은 지역 시각 함수를 쓰지 않고 UTC 밀리초 + 9시간으로 KST 를 만든다.
//
// ⚠️ v1 원칙: 알림은 **사실(기관 발표·관측)만** 싣는다. 예보·원인·확률 문장을 여기에 넣지 않는다.
// ⚠️ 시각을 못 읽으면 **지어내지 않는다.** 기관은 남기고 "시각 정보 없음"이라고 쓴다.
//    안전 알림을 형식 문제로 통째로 막지 않기 위해서다(보내지 않는 것은 티가 안 난다 — index.ts 머리 주석).

const KST_MS = 9 * 3600_000;

/** 기관 이름표. 데이터에 기관이 실려 오면(quake.srcKo) 그것을 먼저 쓴다. */
export const AGENCY = Object.freeze({
  KMA: Object.freeze({ ko: '기상청', en: 'KMA' }),
  JMA: Object.freeze({ ko: '일본 기상청', en: 'JMA' }),
  KHOA: Object.freeze({ ko: '국립해양조사원', en: 'KHOA' }),
  SEOUL: Object.freeze({ ko: '서울특별시', en: 'Seoul Metropolitan Government' }),
});

const VERB = Object.freeze({
  issued: { ko: '발표', en: 'issued', none: { ko: '발표 시각 정보 없음', en: 'issue time unavailable' } },
  observed: { ko: '관측', en: 'observed', none: { ko: '관측 시각 정보 없음', en: 'observation time unavailable' } },
  occurred: { ko: '발생', en: 'occurred', none: { ko: '발생 시각 정보 없음', en: 'time unavailable' } },
});

/**
 * 자료 파일에 실제로 나오는 시각 형식을 UTC 밀리초로 바꾼다. 못 읽으면 null.
 *   · `202609241502` / `20260924150200` — 기상청 특보 tm_fc(issuedKst). 시간대 표기 없음 = KST
 *   · `2026-08-04 07:55` — 국립해양조사원 이안류 obsrvnDt. 시간대 표기 없음 = KST
 *   · `2026-09-06T19:28:00+09:00` — 지진(기상청·JMA)
 *   · `2026-08-20T06:35:00.000Z` — 서울시 관광 provenance.observedAt
 */
export function parseAgencyTime(value) {
  if (value == null) return null;
  const s = String(value).trim();
  let m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?$/);
  if (m) return fromParts(m[1], m[2], m[3], m[4], m[5], m[6] || '0', null);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) return fromParts(m[1], m[2], m[3], m[4], m[5], m[6] || '0', m[7] || null);
  return null;
}

function fromParts(y, mo, d, h, mi, se, zone) {
  const Y = Number(y), MO = Number(mo), D = Number(d), H = Number(h), MI = Number(mi), SE = Number(se);
  if (MO < 1 || MO > 12 || D < 1 || D > 31 || H > 23 || MI > 59 || SE > 59) return null;
  const naive = Date.UTC(Y, MO - 1, D, H, MI, SE);
  // Date.UTC 는 2월 30일을 3월 2일로 넘긴다 — 넘어갔으면 없는 날짜다.
  const back = new Date(naive);
  if (back.getUTCFullYear() !== Y || back.getUTCMonth() !== MO - 1 || back.getUTCDate() !== D) return null;
  let offsetMs = KST_MS;                                  // 표기가 없으면 KST 로 읽는다(기관 원문 관례)
  if (zone) {
    if (/^z$/i.test(zone)) offsetMs = 0;
    else {
      const z = zone.match(/^([+-])(\d{2}):?(\d{2})$/);
      if (!z) return null;
      offsetMs = (z[1] === '-' ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3])) * 60_000;
    }
  }
  return naive - offsetMs;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** UTC 밀리초 → `HH:MM KST`. 알림을 받는 날(KST)과 날짜가 다르면 `M/D HH:MM KST`.
 *  ⚠️ 어제 15:00 에 발표된 특보를 '15:00 KST 발표'로만 쓰면 오늘 발표로 읽힌다. */
export function formatKst(utcMs, nowMs) {
  if (!Number.isFinite(utcMs)) return null;
  const k = new Date(utcMs + KST_MS);
  const hm = `${pad2(k.getUTCHours())}:${pad2(k.getUTCMinutes())}`;
  if (Number.isFinite(nowMs)) {
    const n = new Date(nowMs + KST_MS);
    const same = n.getUTCFullYear() === k.getUTCFullYear()
      && n.getUTCMonth() === k.getUTCMonth() && n.getUTCDate() === k.getUTCDate();
    if (!same) return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${hm} KST`;
  }
  return `${hm} KST`;
}

/** `기상청 · 15:02 KST 발표` / `KMA · issued 15:02 KST`. 시각을 못 읽으면 기관만 남기고 '정보 없음'. */
export function agencyStamp({ agency, at, verb = 'issued', ko = true, now = Date.now() }) {
  const name = String(agency || '').trim() || (ko ? '기관 정보 없음' : 'agency unavailable');
  const v = VERB[verb] || VERB.issued;
  const when = formatKst(parseAgencyTime(at), now);
  if (!when) return `${name} · ${ko ? v.none.ko : v.none.en}`;
  return ko ? `${name} · ${when} ${v.ko}` : `${name} · ${v.en} ${when}`;
}

/** 지진 기관 — 자료가 실어 준 이름(srcKo)을 먼저 쓴다. 표에 없는 src 는 원문 코드를 남긴다. */
export function quakeAgency(q, ko) {
  const src = String(q?.src ?? '').trim().toUpperCase();
  const known = AGENCY[src];
  if (ko) return String(q?.srcKo ?? '').trim() || (known ? known.ko : src);
  return known ? known.en : src;
}

// ── 본문 네 종류 ───────────────────────────────────────────────
// 순서는 evidence-first: 자리·수치 → 기관·시각 → 행동 안내.

/** 이안류 — 국립해양조사원 obsrvnDt 는 관측 시각이다. */
export function ripBody({ beach, distanceKm, label, ko = true, now = Date.now() }) {
  const stamp = agencyStamp({ agency: ko ? AGENCY.KHOA.ko : AGENCY.KHOA.en, at: beach?.at, verb: 'observed', ko, now });
  const far = Number.isFinite(distanceKm) && distanceKm > 2;
  if (ko) {
    return `${far ? `${label} 에서 ${Math.round(distanceKm)}km · ` : ''}${stamp}. `
      + `국립해양조사원이 매긴 등급입니다. 들어가도 되는지는 현장 안내를 따르세요.`;
  }
  return `${far ? `${Math.round(distanceKm)} km from ${label} · ` : ''}${stamp}. Graded by KHOA. Follow on-site guidance.`;
}

/** 지진 — at 은 발생 시각(기상청 tmEqk · JMA at). */
export function quakeBody({ quake, ko = true, now = Date.now() }) {
  const place = String(quake?.placeEn || quake?.place || '').trim();
  const depth = quake?.depthKm != null && Number.isFinite(Number(quake.depthKm))
    ? `${ko ? '깊이' : 'depth'} ${quake.depthKm}km` : '';
  const stamp = agencyStamp({ agency: quakeAgency(quake, ko), at: quake?.at, verb: 'occurred', ko, now });
  return [place, depth, stamp].filter(Boolean).join(' · ');
}

/** 기상특보 — issuedKst 는 기상청 발표 시각(tm_fc). */
export function warnBody({ warn, label, zoneName, ko = true, now = Date.now() }) {
  const stamp = agencyStamp({ agency: ko ? AGENCY.KMA.ko : AGENCY.KMA.en, at: warn?.issuedKst, verb: 'issued', ko, now });
  return ko
    ? `${label} · 가장 가까운 관측지점 기준 ${zoneName}. ${stamp}. 기상청 공식 발표를 확인하세요.`
    : `${label} · Approximate KMA zone: ${zoneName}. ${stamp}. Check the official KMA bulletin.`;
}

/** 관광 혼잡 — 서울시 실시간 인구데이터의 관측 시각(provenance.observedAt). */
export function tourismBody({ place, ko = true, now = Date.now() }) {
  const stamp = agencyStamp({ agency: ko ? AGENCY.SEOUL.ko : AGENCY.SEOUL.en,
    at: place?.provenance?.observedAt, verb: 'observed', ko, now });
  return ko
    ? `${stamp} · 공식 현재 등급. 운영시간·입장 가능·안전을 뜻하지 않습니다.`
    : `${stamp} · official current level. Not an opening, admission or safety decision.`;
}
