// v2 등급 — 서버 판정 (2026-09-24, 지시서 §3-5-1 · Phase 2 완료 기준 6)
//
// ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────────────────────────────────
//   v2 는 등급을 브라우저 localStorage `earthus.tier`(와 window.EARTHUS_TIER)에서 읽었다(report-center currentTier).
//   누구나 개발자 도구로 'intelligence' 라고 적으면 유료 화면이 열린다. 판매 전(FREE_OPEN)에는 어차피 전부 열려 있어
//   드러나지 않았지만, 판매를 여는 순간 결제 우회가 된다.
//
// ── 이제 ───────────────────────────────────────────────────────────────────────────────────────────
//   · FREE_OPEN(지금) — **아무것도 요청하지 않는다.** 등급 값도 예전과 똑같이 돌려준다(화면 변화 0 · 네트워크 0).
//   · PAID(판매 개시 뒤) — 서버 함수 `entitlement`(→ DB earthus_my_entitlement())가 준 등급만 믿는다.
//       서버에 닿지 못하면·로그인이 없으면·응답이 이상하면 **FREE**. localStorage 의 등급은 어디에도 쓰지 않는다.
//   · 접근 토큰은 같은 출처의 Supabase 세션(localStorage `sb-<ref>-auth-token`)에서 꺼내 **서버로 보내기만** 한다.
//     토큰 안의 내용으로 등급을 판정하지 않는다(서명 검증은 서버가 한다).
//   ⚠️ v2 에는 Supabase 클라이언트가 없어 토큰을 새로 고치지 못한다. 토큰이 만료됐으면 FREE 로 보이고,
//      v1 을 한 번 열면(자동 갱신) 다시 맞는다 — 판매 개시 전에 PD 가 볼 위험 목록에 적었다.

import { isFreeOpenMode, normalizeTier } from '../../js/access-mode.js';

/** 순수 판정. legacyTier 는 FREE_OPEN 에서만 쓴다(예전 값 그대로 — 그때는 decideCapabilityAccess 가 어차피 전부 연다). */
export function resolveTier({ mode, legacyTier = 'free', server = null } = {}) {
  if (isFreeOpenMode(mode)) return String(legacyTier || 'free').toLowerCase();
  if (!server || server.ok !== true) return 'free';
  return normalizeTier(server.tier);
}

/** 같은 출처 Supabase 세션에서 접근 토큰만. 없거나 만료면 null. */
export function readSupabaseAccessToken(storage, now = Date.now()) {
  if (!storage) return null;
  let keys = [];
  try {
    for (let i = 0; i < storage.length; i += 1) keys.push(storage.key(i));
  } catch (_) { return null; }
  keys = keys.filter((k) => typeof k === 'string' && /^sb-[a-z0-9]+-auth-token$/i.test(k));
  for (const k of keys) {
    let j = null;
    try { j = JSON.parse(storage.getItem(k)); } catch (_) { j = null; }
    const s = j && (j.access_token ? j : j.currentSession);
    if (!s || typeof s.access_token !== 'string') continue;
    const exp = Number(s.expires_at);
    if (Number.isFinite(exp) && exp * 1000 <= now) continue;
    return s.access_token;
  }
  return null;
}

/** 서버에 묻는다. {ok:true, tier, signedIn} | {ok:false, reason} — 던지지 않는다. */
export async function fetchServerTier({ url, fetchImpl = globalThis.fetch, storage = null, now = Date.now(), timeoutMs = 6000 } = {}) {
  if (!url || typeof fetchImpl !== 'function') return { ok: false, reason: 'NOT_CONFIGURED' };
  const token = readSupabaseAccessToken(storage, now);
  // 로그인이 없으면 FREE 가 **확정**이다(모르는 것이 아니다).
  if (!token) return { ok: true, tier: 'free', signedIn: false };
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal: ctl ? ctl.signal : undefined, cache: 'no-store' });
    if (!r || !r.ok) return { ok: false, reason: `HTTP_${r ? r.status : 0}` };
    const j = await r.json();
    if (!j || typeof j.tier !== 'string') return { ok: false, reason: 'BAD_RESPONSE' };
    return { ok: true, tier: normalizeTier(j.tier), signedIn: j.signedIn !== false, ends: j.ends || null };
  } catch (_) {
    return { ok: false, reason: 'UNREACHABLE' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ── 브라우저 상태 — 문서 하나에 한 벌 ─────────────────────────────────────────────────────────── */
let serverState = null;
const listeners = new Set();

export function serverTierSnapshot() { return serverState; }
export function onEntitlementChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** 판매 개시 뒤에만 서버에 묻는다. FREE_OPEN 이면 즉시 끝(요청 0). config = window.EARTHUS_CONFIG. */
export async function refreshEntitlement({ config = globalThis.EARTHUS_CONFIG, fetchImpl = globalThis.fetch,
  storage = (() => { try { return globalThis.localStorage; } catch (_) { return null; } })() } = {}) {
  const mode = config && config.MONETIZATION_MODE;
  if (isFreeOpenMode(mode)) return null;
  serverState = await fetchServerTier({ url: config && config.ENTITLEMENT_URL, fetchImpl, storage });
  listeners.forEach((fn) => { try { fn(serverState); } catch (_) { /* 다른 구독자를 막지 않는다 */ } });
  return serverState;
}

/** 시험용 — 상태를 비운다. */
export function _resetEntitlementForTest() { serverState = null; listeners.clear(); }
