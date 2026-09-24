// Google Play 결제(앱 안 기간 이용권) — 서버 판정의 순수 부분 (2026-09-24, 지시서 docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md §3-3 · §3-5 · Phase 2)
//
// ── 왜 이 파일이 따로 있나 ─────────────────────────────────────────────────────────────────────────
//   play-verify · play-rtdn Edge Function(Deno)과 node 시험(tools/earthus-v53/play-billing-core.test.mjs)이
//   **같은 판정**을 쓰게 하려고 DOM·Deno·Supabase 없이 쓴다(forecast-v8-policy.js 와 같은 자리·같은 방식).
//   Google API 는 fetch 를 주입받아 부른다 — 시험은 가짜 fetch 로 Google 응답 모양을 흉내 낸다.
//
// ── 상품 모양 (PD 결정 2026-09-24: 무료 앱 + Play 선불형 기간 이용권, 자동 갱신 없음 — 약관 제8조 제2항 그대로) ──
//   · Play 상품 = **구독 상품 8개, 각 상품에 선불형(prepaid) 기본 요금제 하나, 오퍼 없음.**
//     ⚠️ 왜 상품 하나에 요금제 하나인가: 안드로이드 앱의 결제 라이브러리(androidbrowserhelper billing)가
//        결제 시트를 열 때 그 상품의 **첫 번째 오퍼**를 고른다(PlayBillingWrapper: offerDetails.get(0), 2026-09-24 원문 확인).
//        한 상품에 월·연·창립을 같이 넣으면 무엇이 팔릴지 우리가 정하지 못한다.
//   · 상품 id = 서버 plans 표의 id(billing.js:45-56 규칙) — 창립 멤버 반값 상품은 뒤에 `.founding`.
//       earthus.pro.monthly / earthus.pro.yearly / earthus.intelligence.monthly / earthus.intelligence.yearly
//       + 각각의 `.founding` → 8개. 대응표의 정본은 DB `play_products` 표다(마이그레이션이 8줄을 심는다).
//   · ⚠️ 가격은 여기에도 DB 에도 없다. Play 는 **Console 에 등록한 값**을 청구한다(지시서 §3-3 '가격 정본').
//     서버가 할 수 있는 일은 상품 id·창립 자격·상태를 검증하는 것뿐이다. 정가를 바꾸는 날 plans 와 Play 두 상품을
//     같은 날 2:1 로 맞추는 것은 PD 몫이다.
//   · ⚠️ 자동 갱신 요금제(autoRenewingPlan)는 **받지 않는다**(acknowledge 하지 않음 → Play 가 3일 뒤 자동 환불).
//     약관 제8조 제2항 "자동으로 갱신되지 않으므로 해지 절차가 없습니다"와 다른 상품이 Console 에 잘못 올라가도
//     그대로 팔리지 않게 하는 문이다. 약관을 가-2(자동 갱신)로 바꾸면 allowAutoRenew 를 켠다.
//
// ── 거절하면 acknowledge 하지 않는다 ─────────────────────────────────────────────────────────────
//   Play 는 3일 안에 acknowledge 되지 않은 구매를 자동 환불하고 권한을 거둔다(integrate 문서).
//   자격 없는 창립 상품·남의 토큰·자동 갱신 상품은 **우리가 돈을 돌려주는 절차 없이** Play 가 돌려준다.
//   ⚠️ 그래서 순서가 중요하다: DB 에 권한을 **먼저** 적고, 그 다음에 acknowledge 한다.
//      적기 전에 acknowledge 하면 기록 실패 때 돈만 받고 권한은 없는 구매가 남는다.

export const PLAY_BILLING_METHOD = 'https://play.google.com/billing';
export const PLAY_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
export const PLAY_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
export const FOUNDING_SUFFIX = '.founding';
export const ACK_WINDOW_MS = 3 * 24 * 3600 * 1000;
export const VOIDED_MAX_LOOKBACK_MS = 29 * 24 * 3600 * 1000;   // 공식 한도 30일 — 시계 차이 여유 하루

/* Play 상품 id 규칙: 소문자·숫자로 시작, 소문자·숫자·밑줄·마침표. 토큰은 Google 이 준 불투명 문자열. */
const PRODUCT_ID_RE = /^[a-z0-9][a-z0-9._]{0,139}$/;
const TOKEN_RE = /^[A-Za-z0-9._\-:]{8,4096}$/;

/** 상품 id → { planId, founding }. 규칙 밖이면 null. ⚠️ 정본 대응은 DB play_products 다 — 이건 입력 모양 검사다. */
export function parsePlayProductId(productId) {
  if (typeof productId !== 'string' || !PRODUCT_ID_RE.test(productId)) return null;
  const founding = productId.endsWith(FOUNDING_SUFFIX);
  const planId = founding ? productId.slice(0, -FOUNDING_SUFFIX.length) : productId;
  if (!planId) return null;
  return { planId, founding };
}

export function isPlausiblePurchaseToken(token) {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

/* 등급 서열 — ⚠️ prototype/js/access-mode.js TIER_RANK · migrations/20260908120000 tier_rank() 와 같은 정수다. */
const TIER_RANK = Object.freeze({ free: 0, paid: 1, explorer: 1, intelligence: 2, business: 3 });
export function tierRank(t) {
  const r = TIER_RANK[String(t || '').toLowerCase()];
  return Number.isInteger(r) ? r : 0;
}

const ms = (iso) => {
  if (iso == null) return NaN;
  const v = typeof iso === 'number' ? iso : Date.parse(iso);
  return Number.isFinite(v) ? v : NaN;
};

/** subscriptionsv2 응답에서 이 상품의 줄을 찾는다. */
export function lineItemFor(sub, productId) {
  const items = sub && Array.isArray(sub.lineItems) ? sub.lineItems : [];
  return items.find((li) => li && li.productId === productId) || null;
}

/**
 * 구매 하나를 받을지 정한다 — 부수효과 없음.
 * @param {object} a
 * @param {object} a.sub        purchases.subscriptionsv2.get 응답
 * @param {string} a.productId  클라이언트가 산 상품 id(응답의 lineItems 와 대조한다 — 클라이언트 말을 믿지 않는다)
 * @param {object|null} a.product  DB play_products 행 {product_id, plan_id, founding, active}
 * @param {object|null} a.plan     DB plans 행 {id, tier, months, active}
 * @param {object|null} a.profile  DB profiles 행 {founding_member, tier, subscription_ends}
 * @param {object|null} a.existing DB play_purchases 행(같은 토큰) — status 'granted' 만 소유를 뜻한다
 * @param {string|null} a.linkedOwner  linkedPurchaseToken 을 가진 사용자(있으면)
 * @param {string} a.userId
 * @param {number} a.now  ms
 * @param {boolean} [a.allowAutoRenew=false]
 * @returns {{action:'grant'|'already'|'pending'|'reject', reason:string, ack:boolean, grant?:object, flags:string[]}}
 */
export function decidePlayGrant({ sub, productId, product, plan, profile, existing, linkedOwner = null,
  userId, now = Date.now(), allowAutoRenew = false } = {}) {
  const flags = [];
  const reject = (reason) => ({ action: 'reject', reason, ack: false, flags });
  const ackPending = !!sub && sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING';

  if (existing && existing.status === 'granted') {
    // ⚠️ 한 토큰은 한 계정 것이다 — 먼저 검증한 계정이 주인이다. 남의 토큰을 보내 권한을 얻는 길을 닫는다.
    if (existing.user_id !== userId) return reject('TOKEN_BOUND_TO_OTHER_ACCOUNT');
    // 같은 사람이 다시 보냈다(새로고침·앱 재실행 복원) — 기간을 두 번 더하지 않는다. ack 가 아직이면 마저 한다.
    return { action: 'already', reason: 'ALREADY_GRANTED', ack: ackPending, flags };
  }
  if (!sub || typeof sub !== 'object') return reject('NO_PURCHASE');
  if (!product || product.active === false) return reject('UNKNOWN_PRODUCT');
  if (!plan || plan.active === false) return reject('UNKNOWN_PLAN');
  if (product.plan_id !== plan.id) return reject('PRODUCT_PLAN_MISMATCH');
  const li = lineItemFor(sub, productId);
  if (!li || product.product_id !== productId) return reject('PRODUCT_MISMATCH');

  const state = sub.subscriptionState;
  if (state === 'SUBSCRIPTION_STATE_PENDING') return { action: 'pending', reason: 'PAYMENT_PENDING', ack: false, flags };
  if (state !== 'SUBSCRIPTION_STATE_ACTIVE') return reject('NOT_ACTIVE');
  if (!li.prepaidPlan && !allowAutoRenew) return reject('NOT_PREPAID');
  if (linkedOwner && linkedOwner !== userId) return reject('LINKED_TOKEN_OTHER_ACCOUNT');

  const founding = product.founding === true;
  const isFounder = !!(profile && profile.founding_member);
  // ⚠️ 약관 제8조 제7항 — 반값은 창립 멤버만. 비자격자의 반값 토큰은 acknowledge 하지 않는다(Play 가 환불).
  if (founding && !isFounder) return reject('FOUNDING_NOT_ELIGIBLE');
  // 창립 멤버가 정가 상품을 샀다 — 받는다(거절하면 사람이 환불해야 한다). 대신 PD 가 볼 수 있게 표를 남긴다.
  if (!founding && isFounder) flags.push('FOUNDING_MEMBER_PAID_LIST_PRICE');

  // ⚠️ 더 높은 등급 이용권이 남아 있는데 낮은 등급을 사면, 이어 붙이는 순간 남은 높은 등급을 잃는다
  //    (profiles.tier 가 하나라서). 그래서 받지 않는다 — acknowledge 하지 않아 Play 가 돌려준다. 화면은 이 조합을 내놓지 않는다.
  const ends = ms(profile && profile.subscription_ends);
  if (profile && Number.isFinite(ends) && ends > now && tierRank(profile.tier) > tierRank(plan.tier)) {
    return reject('TIER_DOWNGRADE_WHILE_ACTIVE');
  }

  const start = ms(sub.startTime);
  if (ackPending && Number.isFinite(start) && now - start > ACK_WINDOW_MS) flags.push('ACK_DEADLINE_PASSED');
  if (sub.testPurchase) flags.push('TEST_PURCHASE');

  return {
    action: 'grant', reason: 'OK', ack: ackPending, flags,
    grant: {
      productId, planId: plan.id, tier: plan.tier, months: plan.months, founding,
      googleOrderId: li.latestSuccessfulOrderId || null,
      googleExpiry: li.expiryTime || null,
      googleState: state,
      linkedPurchaseToken: sub.linkedPurchaseToken || null,
      testPurchase: !!sub.testPurchase,
    },
  };
}

/* ── 기간 계산 — ⚠️ SQL 의 earthus_paid_chain_end() 와 같은 규칙이다(마이그레이션 20260924120000). ──
   규칙(약관 제8조 제3항): 남은 기간이 있으면 그 뒤에 이어 붙인다 = end_i = max(paid_i, end_{i-1}) + months_i.
   Postgres 의 `+ interval 'N months'` 는 말일을 넘기지 않는다(1/31 + 1달 = 2/28·29). JS Date 는 3/3 으로 넘친다 —
   그래서 여기서 말일 고정을 직접 한다. 두 곳이 다르면 시험과 운영이 다른 날짜를 낸다. */
export function addMonthsUtc(msValue, months) {
  const d = new Date(msValue);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth() + months;
  const ty = y + Math.floor(m / 12); const tm = ((m % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), last);
  return Date.UTC(ty, tm, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

/** items: [{ref, paidAt(ms), months}] — 결제 순서대로 이어 붙인 마지막 끝(ms). 비면 null. */
export function chainEnd(items, { exclude = null } = {}) {
  const list = (items || []).filter((x) => x && x.ref !== exclude && Number.isFinite(x.paidAt) && x.months > 0)
    .sort((a, b) => (a.paidAt - b.paidAt) || String(a.ref).localeCompare(String(b.ref)));
  let end = null;
  for (const x of list) end = addMonthsUtc(Math.max(x.paidAt, end == null ? x.paidAt : end), x.months);
  return end;
}

/**
 * 권한 회수(환불·취소·차지백) — 이 구매가 기간 사슬을 **얼마나 늘렸는지만큼** 줄인다.
 * ⚠️ 그냥 'N달 빼기'가 아니다: 이미 써 버린 앞 구매를 돌려받았을 때 뒤 구매의 기간까지 깎으면 안 된다.
 *    사슬을 이 구매 있이/없이 두 번 세고 그 차이만큼만 줄인다. 원장(orders·play_purchases)에 없는 시간
 *    (관리자가 준 기간 등)은 건드리지 않는다.
 */
export function revocationPlan({ items, revokeRef, currentEnds, currentTier, manualAccessUntil = null, now = Date.now() }) {
  const target = (items || []).find((x) => x.ref === revokeRef);
  if (!target) return { newEnds: currentEnds ?? null, newTier: currentTier || 'free', delta: 0 };
  const withEnd = chainEnd(items);
  const withoutEnd = chainEnd(items, { exclude: revokeRef });
  const delta = Math.max(0, withEnd - (withoutEnd == null ? target.paidAt : withoutEnd));
  const cur = ms(currentEnds);
  const newEnds = Number.isFinite(cur) ? cur - delta : null;
  // if (newEnds == null || newEnds <= now) return { newEnds: null, newTier: 'free', delta };
  // (2026-09-24 정정, 적대 검토) 위 줄은 관리자 초대(manual_access_until)가 살아 있어도 free 로 떨어뜨렸다. 웹 환불
  //   (20260811081000_refund_preserves_invite.sql)과 SQL revoke_play_purchase 처럼 초대는 'paid'(explorer 동급)로 남긴다.
  if (newEnds == null || newEnds <= now) {
    const inviteAlive = Number.isFinite(ms(manualAccessUntil)) && ms(manualAccessUntil) > now;
    return { newEnds: null, newTier: inviteAlive ? 'paid' : 'free', delta };
  }
  // 남은 원장 중 아직 끝나지 않은 구매의 가장 높은 등급. 없으면(원장 밖 시간) 지금 등급을 둔다.
  const alive = (items || []).filter((x) => x.ref !== revokeRef && Number.isFinite(ms(x.grantsUntil)) && ms(x.grantsUntil) > now);
  const best = alive.reduce((t, x) => (tierRank(x.tier) > tierRank(t) ? x.tier : t), 'free');
  return { newEnds, newTier: tierRank(best) > 0 ? best : (currentTier || 'free'), delta };
}

/* ── RTDN(실시간 개발자 알림) — Pub/Sub push 본문 해석 ──────────────────────────────────────────
   ⚠️⚠️ 알림 본문을 **믿고 행동하지 않는다.** 알림은 '이 토큰을 다시 보라'는 신호일 뿐이다.
      회수는 Google API(subscriptionsv2.get · voidedpurchases.list)로 다시 확인한 결과로만 한다.
      그래서 위조된 알림이 들어와도 할 수 있는 일은 '다시 확인'뿐이다. */
const SUB_TYPES = Object.freeze({
  1: 'RECOVERED', 2: 'RENEWED', 3: 'CANCELED', 4: 'PURCHASED', 5: 'ON_HOLD', 6: 'IN_GRACE_PERIOD',
  7: 'RESTARTED', 8: 'PRICE_CHANGE_CONFIRMED', 9: 'DEFERRED', 10: 'PAUSED', 11: 'PAUSE_SCHEDULE_CHANGED',
  12: 'REVOKED', 13: 'EXPIRED', 17: 'ITEMS_CHANGED', 18: 'CANCELLATION_SCHEDULED', 19: 'PRICE_CHANGE_UPDATED',
  20: 'PENDING_PURCHASE_CANCELED', 22: 'PRICE_STEP_UP_CONSENT_UPDATED',
});

export function decodePubSubPush(body, { atob: dec = globalThis.atob } = {}) {
  const data = body && body.message && body.message.data;
  if (typeof data !== 'string' || !data) return null;
  try {
    const bin = dec(data);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_) { return null; }
}

/** 알림 → 할 일. {kind:'test'|'ignore'|'revoke-check'|'reverify', token, productId, type} */
export function rtdnAction(note, { packageName } = {}) {
  if (!note || typeof note !== 'object') return { kind: 'ignore', reason: 'MALFORMED' };
  if (packageName && note.packageName && note.packageName !== packageName) return { kind: 'ignore', reason: 'OTHER_PACKAGE' };
  if (note.testNotification) return { kind: 'test' };
  const v = note.voidedPurchaseNotification;
  if (v && isPlausiblePurchaseToken(v.purchaseToken)) {
    return { kind: 'revoke-check', token: v.purchaseToken, type: 'VOIDED', orderId: v.orderId || null };
  }
  const s = note.subscriptionNotification;
  if (s && isPlausiblePurchaseToken(s.purchaseToken)) {
    const type = SUB_TYPES[s.notificationType] || `TYPE_${s.notificationType}`;
    if (type === 'REVOKED') return { kind: 'revoke-check', token: s.purchaseToken, productId: s.subscriptionId || null, type };
    if (type === 'PURCHASED' || type === 'RECOVERED' || type === 'RESTARTED' || type === 'EXPIRED' || type === 'RENEWED') {
      return { kind: 'reverify', token: s.purchaseToken, productId: s.subscriptionId || null, type };
    }
    return { kind: 'ignore', reason: type, token: s.purchaseToken };
  }
  if (note.oneTimeProductNotification) return { kind: 'ignore', reason: 'ONE_TIME_PRODUCT_NOT_SOLD' };
  return { kind: 'ignore', reason: 'UNKNOWN' };
}

/**
 * 회수할까 — Google 에서 다시 읽은 사실로만 정한다.
 * voided: voidedpurchases.list 에 이 토큰이 있었나 · sub: subscriptionsv2 재조회 · existing: 우리가 준 권한 행
 * ⚠️ 선불형은 기간이 끝나면 **자연히** EXPIRED 가 된다 — 그것은 회수가 아니다(우리 기간도 같이 끝난다).
 *    회수 = 무효 목록에 있거나, Google 의 만료 시각이 우리가 권한을 줄 때 본 만료 시각보다 1시간 넘게 당겨졌을 때.
 */
export function decideRevocation({ voided = false, sub = null, existing = null } = {}) {
  if (!existing || existing.status !== 'granted') return { revoke: false, reason: 'NOT_GRANTED' };
  if (voided) return { revoke: true, reason: 'VOIDED' };
  const li = sub && lineItemFor(sub, existing.product_id);
  const now = li ? ms(li.expiryTime) : NaN;
  const was = ms(existing.google_expiry);
  if (sub && sub.subscriptionState === 'SUBSCRIPTION_STATE_EXPIRED' && Number.isFinite(now) && Number.isFinite(was)
      && was - now > 3600 * 1000) {
    return { revoke: true, reason: 'REVOKED_EARLY_EXPIRY' };
  }
  return { revoke: false, reason: 'STILL_VALID' };
}

/* ── Google 인증 — 서비스 계정 JWT → OAuth 접근 토큰 (WebCrypto RS256, Deno·Node 20 공통) ──────────
   ⚠️ 서비스 계정 JSON 은 Supabase secrets(PLAY_SERVICE_ACCOUNT_JSON)에만 있다. 저장소·로그·응답에 절대 내보내지 않는다. */
const b64url = (bytes) => {
  let s = '';
  const u = bytes instanceof Uint8Array ? bytes : new TextEncoder().encode(String(bytes));
  for (let i = 0; i < u.length; i += 1) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
function pemToDer(pem) {
  const body = String(pem || '').replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  const bin = atob(body);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function parseServiceAccount(json) {
  let sa = json;
  if (typeof json === 'string') { try { sa = JSON.parse(json); } catch (_) { return null; } }
  if (!sa || typeof sa.client_email !== 'string' || typeof sa.private_key !== 'string') return null;
  return { client_email: sa.client_email, private_key: sa.private_key,
    token_uri: sa.token_uri || 'https://oauth2.googleapis.com/token' };
}

export function createServiceAccountTokenSource({ serviceAccount, fetchImpl = globalThis.fetch,
  subtle = globalThis.crypto && globalThis.crypto.subtle, now = () => Date.now() }) {
  const sa = parseServiceAccount(serviceAccount);
  if (!sa) throw new Error('PLAY_SERVICE_ACCOUNT_INVALID');
  let cached = null;
  let keyP = null;
  return async function getToken() {
    const t = now();
    if (cached && cached.exp - 60_000 > t) return cached.token;
    keyP = keyP || subtle.importKey('pkcs8', pemToDer(sa.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const key = await keyP;
    const iat = Math.floor(t / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: PLAY_SCOPE, aud: sa.token_uri, iat, exp: iat + 3600 }));
    const sig = new Uint8Array(await subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claims}`)));
    const assertion = `${head}.${claims}.${b64url(sig)}`;
    const r = await fetchImpl(sa.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(assertion)}`,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error(`PLAY_AUTH_FAILED ${r.status}`);
    cached = { token: j.access_token, exp: t + (Number(j.expires_in) || 3600) * 1000 };
    return cached.token;
  };
}

export class PlayApiError extends Error {
  constructor(status, body) { super(`PLAY_API ${status}`); this.status = status; this.body = body; }
}

/** Google Play Developer API v3 — 쓰는 것만. 경로는 2026-09-24 공식 참조와 대조했다:
 *   GET  applications/{pkg}/purchases/subscriptionsv2/tokens/{token}
 *   POST applications/{pkg}/purchases/subscriptions/{subscriptionId}/tokens/{token}:acknowledge   (v2 에는 acknowledge 가 없다)
 *   GET  applications/{pkg}/purchases/voidedpurchases?startTime=…&type=1 */
export function createPlayApi({ fetchImpl = globalThis.fetch, getToken, packageName, base = PLAY_API_BASE }) {
  if (!packageName) throw new Error('PLAY_PACKAGE_NAME_MISSING');
  const app = `${base}/applications/${encodeURIComponent(packageName)}`;
  const call = async (url, init = {}) => {
    const token = await getToken();
    const r = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
    const text = await r.text();
    let j = {};
    try { j = text ? JSON.parse(text) : {}; } catch (_) { j = {}; }
    if (!r.ok) throw new PlayApiError(r.status, j);
    return j;
  };
  return {
    getSubscriptionV2: (token) => call(`${app}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`),
    acknowledgeSubscription: (productId, token) => call(
      `${app}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    // ⚠️ startTime 은 **30일보다 오래될 수 없다**(voidedpurchases.list 공식 참조, 2026-09-24 확인). 넘기면 400 이 나고
    //    아래 호출부가 그것을 '무효 아님'으로 삼켜 환불 회수가 조용히 빠진다 — 그래서 29일로 자른다.
    async isVoided(token, { sinceMs, nowMs = Date.now() }) {
      const floor = nowMs - VOIDED_MAX_LOOKBACK_MS;
      const start = Math.max(Math.floor(sinceMs), floor);
      let pageToken = '';
      for (let page = 0; page < 20; page += 1) {
        const q = new URLSearchParams({ startTime: String(start), type: '1', maxResults: '1000' });
        if (pageToken) q.set('token', pageToken);
        const j = await call(`${app}/purchases/voidedpurchases?${q}`);
        if ((j.voidedPurchases || []).some((v) => v.purchaseToken === token)) return true;
        pageToken = j.tokenPagination && j.tokenPagination.nextPageToken;
        if (!pageToken) return false;
      }
      return false;
    },
  };
}

/**
 * play-verify 의 전체 흐름 — DB 와 Google 을 주입받는다(시험 가능).
 * db: getProduct(id) · getPlan(id) · getProfile(uid) · getPurchase(token) · getGrantOwner(token)
 *     applyGrant({userId, token, decision}) → {tier, ends} · recordRejection({userId, token, productId, reason, flags}) · markAcknowledged(token)
 */
export async function verifyPlayPurchase({ userId, productId, purchaseToken, api, db, now = Date.now(), allowAutoRenew = false }) {
  if (!userId) return { ok: false, status: 401, error: 'NO_AUTH' };
  if (!parsePlayProductId(productId)) return { ok: false, status: 400, error: 'BAD_PRODUCT_ID' };
  if (!isPlausiblePurchaseToken(purchaseToken)) return { ok: false, status: 400, error: 'BAD_TOKEN' };

  const [product, existing] = await Promise.all([db.getProduct(productId), db.getPurchase(purchaseToken)]);
  let sub;
  try {
    sub = await api.getSubscriptionV2(purchaseToken);
  } catch (e) {
    // ⚠️ 확인하지 못하면 **주지 않는다.** 권한을 먼저 주고 나중에 확인하는 길은 만들지 않는다.
    return { ok: false, status: e && e.status === 404 ? 404 : 502, error: e && e.status === 404 ? 'PURCHASE_NOT_FOUND' : 'PLAY_UNREACHABLE' };
  }
  const plan = product ? await db.getPlan(product.plan_id) : null;
  const profile = await db.getProfile(userId);
  const linkedOwner = sub && sub.linkedPurchaseToken ? await db.getGrantOwner(sub.linkedPurchaseToken) : null;
  const d = decidePlayGrant({ sub, productId, product, plan, profile, existing, linkedOwner, userId, now, allowAutoRenew });

  if (d.action === 'reject') {
    await db.recordRejection({ userId, token: purchaseToken, productId, reason: d.reason, flags: d.flags }).catch(() => {});
    return { ok: false, status: d.reason === 'TOKEN_BOUND_TO_OTHER_ACCOUNT' || d.reason === 'LINKED_TOKEN_OTHER_ACCOUNT' ? 409 : 403, error: d.reason };
  }
  if (d.action === 'pending') return { ok: false, status: 202, error: 'PAYMENT_PENDING' };

  let result = null;
  if (d.action === 'grant') {
    result = await db.applyGrant({ userId, token: purchaseToken, decision: d });   // ⚠️ 먼저 적는다
  } else {
    result = await db.currentEntitlement(userId);
  }
  let acknowledged = !d.ack;
  if (d.ack) {
    try {
      await api.acknowledgeSubscription(productId, purchaseToken);
      await db.markAcknowledged(purchaseToken).catch(() => {});
      acknowledged = true;
    } catch (_) {
      // 권한은 이미 적혔다. 다음 호출(앱 재실행 복원·RTDN)이 다시 acknowledge 한다 — 3일 안.
      acknowledged = false;
    }
  }
  return { ok: true, status: 200, tier: result && result.tier, ends: result && result.ends,
    already: d.action === 'already', acknowledged, flags: d.flags };
}

/** play-rtdn 의 흐름 — 알림 하나를 받아 다시 확인하고 필요하면 회수한다. */
export async function handleRtdn({ note, api, db, packageName, now = Date.now() }) {
  const act = rtdnAction(note, { packageName });
  if (act.kind === 'test' || act.kind === 'ignore') return { done: act.kind, reason: act.reason || null };
  const existing = await db.getPurchase(act.token);
  if (!existing || existing.status !== 'granted') {
    // 우리 계정에 붙은 적 없는 토큰 — 누구 것인지 모르므로 권한을 주지도 거두지도 않는다.
    // (앱이 다음 실행 때 listPurchases 로 play-verify 를 다시 부른다 — 클라이언트 복원 길)
    return { done: 'unbound', reason: act.type || null };
  }
  let sub = null;
  try { sub = await api.getSubscriptionV2(act.token); } catch (_) { sub = null; }
  let voided = false;
  if (act.kind === 'revoke-check') {
    // (2026-09-24 정정) 처음엔 60일 전부터 물었다 — 공식 한도(30일)를 넘어 400 이 나고 아래 catch 가 '무효 아님'으로 삼켰을 것이다.
    try { voided = await api.isVoided(act.token, { sinceMs: now - VOIDED_MAX_LOOKBACK_MS, nowMs: now }); } catch (_) { voided = false; }
  }
  const r = decideRevocation({ voided, sub, existing });
  if (r.revoke) {
    const out = await db.revokeGrant({ token: act.token, reason: r.reason });
    return { done: 'revoked', reason: r.reason, tier: out && out.tier, ends: out && out.ends };
  }
  // 받은 적은 있는데 acknowledge 가 아직이면(앞선 시도 실패) 여기서 마저 한다.
  if (sub && sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && sub.subscriptionState === 'SUBSCRIPTION_STATE_ACTIVE') {
    try { await api.acknowledgeSubscription(existing.product_id, act.token); await db.markAcknowledged(act.token); } catch (_) { /* 다음 알림 */ }
  }
  return { done: 'checked', reason: r.reason };
}

/** 문자열 두 개를 같은 시간에 비교한다(RTDN 공유 비밀 대조 — 길이·내용으로 시간이 새지 않게). */
export function safeEqual(a, b) {
  const x = String(a || ''); const y = String(b || '');
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0 && x.length > 0;
}
