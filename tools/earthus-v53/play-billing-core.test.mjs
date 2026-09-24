// Play 결제 서버 판정 (2026-09-24, 지시서 §3-3 · §3-5 · Phase 2 완료 기준 1·3·4)
//
// 결과로 본다(AGENTS.md '일하는 법' 2 — 금지만 시험하지 않는다):
//   · 창립 멤버가 산 반값 상품은 권한이 **열려야** 하고, 서버 기록 뒤에 acknowledge 가 **불려야** 한다(기준 1·4).
//   · 일반 계정의 반값 토큰은 권한이 **안 열리고** acknowledge 도 **안 불려야** 한다 — Play 가 3일 뒤 자동 환불(기준 4).
//   · 같은 토큰을 두 번 보내도 기간은 **한 번만** 붙어야 한다(멱등). 남의 토큰은 거절.
//   · 환불·회수 알림 뒤에는 Google 재확인을 거쳐 권한이 **닫혀야** 한다(기준 3). 위조 알림만으로는 닫히지 않는다.
//   · 이어 붙이기(약관 제8조 제3항) · 말일 규칙은 SQL(Postgres interval)과 같아야 한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';

const core = await import('../../prototype/supabase/functions/_shared/play-billing-core.js');

const NOW = Date.parse('2027-01-10T00:00:00Z');
const USER = 'u-founder';
const OTHER = 'u-other';
const TOKEN = 'tok.abcdefghijklmnop-1234567890';

const PRODUCTS = {
  'earthus.pro.monthly': { product_id: 'earthus.pro.monthly', plan_id: 'earthus.pro.monthly', founding: false, active: true },
  'earthus.pro.monthly.founding': { product_id: 'earthus.pro.monthly.founding', plan_id: 'earthus.pro.monthly', founding: true, active: true },
  'earthus.intelligence.yearly': { product_id: 'earthus.intelligence.yearly', plan_id: 'earthus.intelligence.yearly', founding: false, active: true },
};
const PLANS = {
  'earthus.pro.monthly': { id: 'earthus.pro.monthly', tier: 'explorer', months: 1, active: true },
  'earthus.intelligence.yearly': { id: 'earthus.intelligence.yearly', tier: 'intelligence', months: 12, active: true },
};
const sub = (productId, over = {}) => ({
  kind: 'androidpublisher#subscriptionPurchaseV2',
  startTime: '2027-01-09T23:00:00Z',
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  lineItems: [{ productId, expiryTime: '2027-02-09T23:00:00Z', latestSuccessfulOrderId: 'GPA.1234-5678',
    prepaidPlan: { allowExtendAfterTime: '2027-02-02T23:00:00Z' }, offerDetails: { basePlanId: 'prepaid' } }],
  ...over,
});

function fakeDb({ profiles = {}, purchases = {} } = {}) {
  const calls = { apply: [], reject: [], ack: [], revoke: [] };
  const db = {
    calls, profiles, purchases,
    getProduct: async (id) => PRODUCTS[id] || null,
    getPlan: async (id) => PLANS[id] || null,
    getProfile: async (uid) => profiles[uid] || null,
    getPurchase: async (t) => purchases[t] || null,
    getGrantOwner: async (t) => (purchases[t] && purchases[t].status === 'granted' ? purchases[t].user_id : null),
    applyGrant: async ({ userId, token, decision }) => {
      calls.apply.push({ userId, token, decision });
      purchases[token] = { purchase_token: token, user_id: userId, status: 'granted', product_id: decision.grant.productId,
        google_expiry: decision.grant.googleExpiry };
      return { tier: decision.grant.tier, ends: '2027-02-10T00:00:00Z' };
    },
    currentEntitlement: async () => ({ tier: 'explorer', ends: '2027-02-10T00:00:00Z' }),
    recordRejection: async (r) => { calls.reject.push(r); },
    markAcknowledged: async (t) => { calls.ack.push(t); },
    revokeGrant: async ({ token, reason }) => { calls.revoke.push({ token, reason }); purchases[token].status = 'revoked'; return { tier: 'free', ends: null }; },
  };
  return db;
}
function fakeApi(subs, { voided = [] } = {}) {
  const calls = { get: [], ack: [] };
  return {
    calls,
    getSubscriptionV2: async (t) => { calls.get.push(t); if (!subs[t]) { const e = new Error('404'); e.status = 404; throw e; } return subs[t]; },
    acknowledgeSubscription: async (p, t) => { calls.ack.push([p, t]); return {}; },
    isVoided: async (t) => voided.includes(t),
  };
}

test('상품 id 규칙 — 8개 = plans id 4개 × (정가·.founding)', () => {
  assert.deepEqual(core.parsePlayProductId('earthus.pro.monthly'), { planId: 'earthus.pro.monthly', founding: false });
  assert.deepEqual(core.parsePlayProductId('earthus.intelligence.yearly.founding'), { planId: 'earthus.intelligence.yearly', founding: true });
  assert.equal(core.parsePlayProductId('Earthus.PRO'), null, '대문자는 Play 상품 id 가 아니다');
  assert.equal(core.parsePlayProductId('.founding'), null);
  assert.equal(core.parsePlayProductId(''), null);
});

test('기준 1·4 — 창립 멤버의 반값 상품: 권한을 먼저 적고, 그 다음에 acknowledge 한다', async () => {
  const db = fakeDb({ profiles: { [USER]: { founding_member: true, tier: 'free', subscription_ends: null } } });
  const order = [];
  const api = fakeApi({ [TOKEN]: sub('earthus.pro.monthly.founding') });
  const applyGrant = db.applyGrant; db.applyGrant = async (a) => { order.push('apply'); return applyGrant(a); };
  const ack = api.acknowledgeSubscription; api.acknowledgeSubscription = async (p, t) => { order.push('ack'); return ack(p, t); };
  const r = await core.verifyPlayPurchase({ userId: USER, productId: 'earthus.pro.monthly.founding', purchaseToken: TOKEN, api, db, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.tier, 'explorer');
  assert.equal(r.acknowledged, true);
  assert.deepEqual(order, ['apply', 'ack'], '기록 전에 acknowledge 하면 기록 실패 때 돈만 받은 구매가 남는다');
  assert.equal(db.calls.apply[0].decision.grant.founding, true);
  assert.deepEqual(db.calls.ack, [TOKEN], 'acknowledge 시각이 서버 기록에 남아야 한다(기준 1)');
});

test('기준 4 — 일반 계정이 반값 토큰을 보내면 거부하고 acknowledge 하지 않는다', async () => {
  const db = fakeDb({ profiles: { [OTHER]: { founding_member: false, tier: 'free' } } });
  const api = fakeApi({ [TOKEN]: sub('earthus.pro.monthly.founding') });
  const r = await core.verifyPlayPurchase({ userId: OTHER, productId: 'earthus.pro.monthly.founding', purchaseToken: TOKEN, api, db, now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'FOUNDING_NOT_ELIGIBLE');
  assert.equal(db.calls.apply.length, 0, '권한을 열면 안 된다');
  assert.equal(api.calls.ack.length, 0, 'acknowledge 하면 Play 의 자동 환불이 막힌다');
  assert.equal(db.calls.reject[0].reason, 'FOUNDING_NOT_ELIGIBLE');
});

test('창립 멤버가 정가 상품을 사면 받되(환불 분쟁 방지) PD 가 볼 표를 남긴다', async () => {
  const db = fakeDb({ profiles: { [USER]: { founding_member: true, tier: 'free' } } });
  const api = fakeApi({ [TOKEN]: sub('earthus.pro.monthly') });
  const r = await core.verifyPlayPurchase({ userId: USER, productId: 'earthus.pro.monthly', purchaseToken: TOKEN, api, db, now: NOW });
  assert.equal(r.ok, true);
  assert.ok(r.flags.includes('FOUNDING_MEMBER_PAID_LIST_PRICE'));
});

test('멱등 — 같은 사람이 같은 토큰을 다시 보내도 기간은 한 번만 붙는다. 남의 토큰은 409', async () => {
  const db = fakeDb({ profiles: { [USER]: { founding_member: false }, [OTHER]: { founding_member: false } } });
  const api = fakeApi({ [TOKEN]: sub('earthus.pro.monthly') });
  const a = await core.verifyPlayPurchase({ userId: USER, productId: 'earthus.pro.monthly', purchaseToken: TOKEN, api, db, now: NOW });
  api.calls.ack.length = 0;
  const b = await core.verifyPlayPurchase({ userId: USER, productId: 'earthus.pro.monthly', purchaseToken: TOKEN, api,
    db, now: NOW });
  assert.equal(a.ok && b.ok, true);
  assert.equal(b.already, true);
  assert.equal(db.calls.apply.length, 1, '두 번째 호출이 기간을 또 더했다');
  const c = await core.verifyPlayPurchase({ userId: OTHER, productId: 'earthus.pro.monthly', purchaseToken: TOKEN, api, db, now: NOW });
  assert.equal(c.ok, false);
  assert.equal(c.status, 409);
  assert.equal(c.error, 'TOKEN_BOUND_TO_OTHER_ACCOUNT');
});

test('자동 갱신 요금제·대기 중 결제·상품 불일치·Google 불통은 주지 않는다', async () => {
  const profiles = { [USER]: { founding_member: false } };
  const auto = sub('earthus.pro.monthly');
  delete auto.lineItems[0].prepaidPlan; auto.lineItems[0].autoRenewingPlan = { autoRenewEnabled: true };
  let r = await core.verifyPlayPurchase({ userId: USER, productId: 'earthus.pro.monthly', purchaseToken: TOKEN,
    api: fakeApi({ [TOKEN]: auto }), db: fakeDb({ profiles }), now: NOW });
  assert.equal(r.error, 'NOT_PREPAID', '약관 제8조 제2항(자동 갱신 없음)과 다른 상품이 팔렸다');

  r = await core.verifyPlayPurchase({ userId: USER, productId: 'earthus.pro.monthly', purchaseToken: TOKEN,
    api: fakeApi({ [TOKEN]: sub('earthus.pro.monthly', { subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }) }), db: fakeDb({ profiles }), now: NOW });
  assert.equal(r.error, 'PAYMENT_PENDING');
  assert.equal(r.status, 202);

  r = await core.verifyPlayPurchase({ userId: USER, productId: 'earthus.intelligence.yearly', purchaseToken: TOKEN,
    api: fakeApi({ [TOKEN]: sub('earthus.pro.monthly') }), db: fakeDb({ profiles }), now: NOW });
  assert.equal(r.error, 'PRODUCT_MISMATCH', '클라이언트가 말한 상품이 아니라 Google 이 말한 상품을 믿는다');

  const down = { ...fakeApi({}), getSubscriptionV2: async () => { const e = new Error('x'); e.status = 503; throw e; } };
  const db = fakeDb({ profiles });
  r = await core.verifyPlayPurchase({ userId: USER, productId: 'earthus.pro.monthly', purchaseToken: TOKEN, api: down, db, now: NOW });
  assert.equal(r.error, 'PLAY_UNREACHABLE');
  assert.equal(db.calls.apply.length, 0);
});

test('PRO 이용권이 남아 있을 때 EXPLORER 를 사면 받지 않는다(남은 PRO 를 잃지 않게)', () => {
  const d = core.decidePlayGrant({ sub: sub('earthus.pro.monthly'), productId: 'earthus.pro.monthly',
    product: PRODUCTS['earthus.pro.monthly'], plan: PLANS['earthus.pro.monthly'],
    profile: { tier: 'intelligence', subscription_ends: '2027-03-01T00:00:00Z' }, existing: null, userId: USER, now: NOW });
  assert.equal(d.action, 'reject');
  assert.equal(d.reason, 'TIER_DOWNGRADE_WHILE_ACTIVE');
  assert.equal(d.ack, false);
  // 올리는 것(EXPLORER → PRO)은 받는다
  const up = core.decidePlayGrant({ sub: sub('earthus.intelligence.yearly'), productId: 'earthus.intelligence.yearly',
    product: PRODUCTS['earthus.intelligence.yearly'], plan: PLANS['earthus.intelligence.yearly'],
    profile: { tier: 'explorer', subscription_ends: '2027-03-01T00:00:00Z' }, existing: null, userId: USER, now: NOW });
  assert.equal(up.action, 'grant');
});

test('이어 붙이기 — 남은 기간 뒤에 붙고, 말일은 Postgres 처럼 넘기지 않는다', () => {
  const jan31 = Date.parse('2027-01-31T00:00:00Z');
  assert.equal(new Date(core.addMonthsUtc(jan31, 1)).toISOString(), '2027-02-28T00:00:00.000Z');
  assert.equal(new Date(core.addMonthsUtc(Date.parse('2028-01-31T00:00:00Z'), 1)).toISOString(), '2028-02-29T00:00:00.000Z');
  assert.equal(new Date(core.addMonthsUtc(Date.parse('2027-11-15T00:00:00Z'), 3)).toISOString(), '2028-02-15T00:00:00.000Z');
  const items = [
    { ref: 'a', paidAt: Date.parse('2027-01-01T00:00:00Z'), months: 1 },
    { ref: 'b', paidAt: Date.parse('2027-01-20T00:00:00Z'), months: 1 },
  ];
  assert.equal(new Date(core.chainEnd(items)).toISOString(), '2027-03-01T00:00:00.000Z', '남은 기간(2/1까지) 뒤에 한 달');
});

test('기준 3 — 회수는 그 구매가 늘린 만큼만 줄인다(써 버린 앞 구매 환불이 뒤 구매를 깎지 않는다)', () => {
  const items = [
    { ref: 'play:a', paidAt: Date.parse('2027-01-01T00:00:00Z'), months: 1, tier: 'explorer', grantsUntil: '2027-02-01T00:00:00Z' },
    { ref: 'play:b', paidAt: Date.parse('2027-01-20T00:00:00Z'), months: 1, tier: 'explorer', grantsUntil: '2027-03-01T00:00:00Z' },
  ];
  const now = Date.parse('2027-01-25T00:00:00Z');
  const r = core.revocationPlan({ items, revokeRef: 'play:a', currentEnds: '2027-03-01T00:00:00Z', currentTier: 'explorer', now });
  assert.equal(new Date(r.newEnds).toISOString(), '2027-02-20T00:00:00.000Z', 'b 는 자기 결제일부터 한 달을 그대로 가진다');
  assert.equal(r.newTier, 'explorer');
  // 하나뿐인 구매를 회수하면 FREE
  const only = core.revocationPlan({ items: [items[0]], revokeRef: 'play:a', currentEnds: '2027-02-01T00:00:00Z', currentTier: 'explorer', now });
  assert.equal(only.newTier, 'free');
  assert.equal(only.newEnds, null);
  // (2026-09-24 정정, 적대 검토) 관리자 초대가 살아 있으면 회수해도 초대 등급('paid')이 남아야 한다 — 웹 환불과 같은 규칙.
  const invited = core.revocationPlan({ items: [items[0]], revokeRef: 'play:a', currentEnds: '2027-02-01T00:00:00Z',
    currentTier: 'explorer', manualAccessUntil: '2027-06-30T00:00:00Z', now });
  assert.equal(invited.newTier, 'paid', 'Play 환불이 관리자 초대까지 거뒀다');
  assert.equal(invited.newEnds, null);
  const inviteOver = core.revocationPlan({ items: [items[0]], revokeRef: 'play:a', currentEnds: '2027-02-01T00:00:00Z',
    currentTier: 'explorer', manualAccessUntil: '2027-01-10T00:00:00Z', now });
  assert.equal(inviteOver.newTier, 'free', '끝난 초대는 남기지 않는다');
});

test('RTDN — 위조 알림만으로는 닫히지 않고, Google 이 무효라고 하면 닫힌다', async () => {
  const granted = { purchase_token: TOKEN, user_id: USER, status: 'granted', product_id: 'earthus.pro.monthly', google_expiry: '2027-02-09T23:00:00Z' };
  const note = { packageName: 'net.earthus.app', subscriptionNotification: { notificationType: 12, purchaseToken: TOKEN, subscriptionId: 'earthus.pro.monthly' } };
  // Google: 여전히 유효 · 무효 목록에 없음 → 닫지 않는다
  let db = fakeDb({ purchases: { [TOKEN]: { ...granted } } });
  let r = await core.handleRtdn({ note, api: fakeApi({ [TOKEN]: sub('earthus.pro.monthly', { acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }) }), db, packageName: 'net.earthus.app', now: NOW });
  assert.equal(r.done, 'checked');
  assert.equal(db.calls.revoke.length, 0, '알림 본문만 믿고 권한을 닫았다');
  // Google: 무효 목록에 있음 → 닫는다
  db = fakeDb({ purchases: { [TOKEN]: { ...granted } } });
  r = await core.handleRtdn({ note: { packageName: 'net.earthus.app', voidedPurchaseNotification: { purchaseToken: TOKEN, orderId: 'GPA.1', productType: 1, refundType: 1 } },
    api: fakeApi({ [TOKEN]: sub('earthus.pro.monthly') }, { voided: [TOKEN] }), db, packageName: 'net.earthus.app', now: NOW });
  assert.equal(r.done, 'revoked');
  assert.equal(db.calls.revoke[0].reason, 'VOIDED');
  // Google: 만료 시각이 당겨짐(회수) → 닫는다
  db = fakeDb({ purchases: { [TOKEN]: { ...granted } } });
  const early = sub('earthus.pro.monthly', { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' });
  early.lineItems[0].expiryTime = '2027-01-15T00:00:00Z';
  r = await core.handleRtdn({ note, api: fakeApi({ [TOKEN]: early }), db, packageName: 'net.earthus.app', now: NOW });
  assert.equal(r.done, 'revoked');
  // 자연 만료(같은 시각)는 회수가 아니다
  assert.equal(core.decideRevocation({ sub: sub('earthus.pro.monthly', { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }), existing: granted }).revoke, false);
  // 다른 패키지 알림은 무시
  assert.equal(core.rtdnAction({ ...note, packageName: 'com.evil' }, { packageName: 'net.earthus.app' }).kind, 'ignore');
});

test('Pub/Sub push 본문 해석 · 공유 비밀 대조', () => {
  const payload = { packageName: 'net.earthus.app', testNotification: { version: '1.0' } };
  const body = { message: { data: Buffer.from(JSON.stringify(payload)).toString('base64') } };
  assert.deepEqual(core.decodePubSubPush(body), payload);
  assert.equal(core.rtdnAction(core.decodePubSubPush(body)).kind, 'test');
  assert.equal(core.decodePubSubPush({ message: {} }), null);
  assert.equal(core.safeEqual('abc', 'abc'), true);
  assert.equal(core.safeEqual('abc', 'abd'), false);
  assert.equal(core.safeEqual('', ''), false, '비밀이 비어 있으면 열리면 안 된다');
});

test('서비스 계정 JWT — RS256 서명이 공개키로 검증되고, 토큰은 캐시된다', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: init.body });
    return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.test', expires_in: 3600 }) };
  };
  const getToken = core.createServiceAccountTokenSource({
    serviceAccount: JSON.stringify({ client_email: 'play@earthus.iam.gserviceaccount.com', private_key: pem }),
    fetchImpl, now: () => NOW,
  });
  assert.equal(await getToken(), 'ya29.test');
  assert.equal(await getToken(), 'ya29.test');
  assert.equal(seen.length, 1, '만료 전에는 다시 받지 않는다');
  assert.equal(seen[0].url, 'https://oauth2.googleapis.com/token');
  const assertion = decodeURIComponent(new URLSearchParams(seen[0].body).get('assertion'));
  const [h, c, s] = assertion.split('.');
  const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
  assert.equal(claims.scope, core.PLAY_SCOPE);
  assert.equal(claims.iss, 'play@earthus.iam.gserviceaccount.com');
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${c}`);
  assert.equal(v.verify(publicKey, Buffer.from(s, 'base64url')), true);
});

test('Play API 경로 — subscriptionsv2 조회 · v1 acknowledge (2026-09-24 공식 참조와 같은 모양)', async () => {
  const seen = [];
  const api = core.createPlayApi({
    packageName: 'net.earthus.app', getToken: async () => 'T',
    fetchImpl: async (url, init = {}) => { seen.push({ url, method: init.method || 'GET', auth: init.headers.Authorization }); return { ok: true, status: 200, text: async () => '{}' }; },
  });
  await api.getSubscriptionV2('abc');
  await api.acknowledgeSubscription('earthus.pro.monthly', 'abc');
  assert.equal(seen[0].url, 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/net.earthus.app/purchases/subscriptionsv2/tokens/abc');
  assert.equal(seen[1].url, 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/net.earthus.app/purchases/subscriptions/earthus.pro.monthly/tokens/abc:acknowledge');
  assert.equal(seen[1].method, 'POST');
  assert.equal(seen[0].auth, 'Bearer T');
});

test('무효 목록 조회는 공식 한도(30일)보다 오래 묻지 않는다 — 넘기면 400 이 나고 환불 회수가 조용히 빠진다', async () => {
  const urls = [];
  const api = core.createPlayApi({ packageName: 'net.earthus.app', getToken: async () => 'T',
    fetchImpl: async (url) => { urls.push(url); return { ok: true, status: 200, text: async () => JSON.stringify({ voidedPurchases: [{ purchaseToken: 'x' }] }) }; } });
  assert.equal(await api.isVoided('x', { sinceMs: NOW - 90 * 86400e3, nowMs: NOW }), true);
  const start = Number(new URL(urls[0]).searchParams.get('startTime'));
  assert.ok(NOW - start <= 30 * 86400e3, `startTime 이 ${(NOW - start) / 86400e3}일 전이다`);
  assert.equal(new URL(urls[0]).searchParams.get('type'), '1', '구독도 포함');
});
