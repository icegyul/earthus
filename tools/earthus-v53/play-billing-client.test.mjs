// 앱 안 Play 결제 — 브라우저 쪽 (2026-09-24, 지시서 §3-3 · §3-4 · §3-5 · Phase 2 완료 기준 1·4·6)
//
// 결과로 본다(AGENTS.md '일하는 법' 2):
//   · 상품 id 는 8개가 **나와야** 하고(EXPLORER·PRO × 월·연 × 정가·창립), 가격은 어디에도 없다.
//   · 결제 전 확인 화면에 기간·자동 갱신 없음·이어 붙임·아직 없는 기능과 '제공 시기 미확정'이 **나와야** 한다(약관 제8조 제3·6항).
//   · Play 시트가 준 토큰은 서버 검증 **뒤에** 시트를 닫는다. 사용자가 닫으면 '취소'다.
//   · v2 잠금 → v1 구독 → v2 복귀: 판매가 열리면 링크가 **나와야** 하고 back 에 v2 화면(해시까지)이 **실려야** 한다.
//     판매가 닫혀 있으면 링크가 **없어야** 하고 예전 문구가 그대로여야 한다(지금 운영 화면 변화 0).
//   · v2 등급: FREE_OPEN 에서는 요청 0·예전 값 그대로, PAID 에서는 localStorage 를 무시하고 서버 값·실패 시 free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const pb = await import('../../prototype/js/play-billing.js');
const sr = await import('../../prototype/js/subscribe-route.js');
const ent = await import('../../prototype/v2-three/js/entitlement-client.js?v=1');   // report-center 와 같은 지정자 — 한 벌
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

// billing.js DEFAULT_PLANS 와 같은 모양(가격 칸은 이 시험이 쓰지 않는다)
const PLANS = {
  monthly: { id: 'earthus.pro.monthly', tier: 'explorer', period: 'month' },
  yearly: { id: 'earthus.pro.yearly', tier: 'explorer', period: 'year' },
  intelMonthly: { id: 'earthus.intelligence.monthly', tier: 'intelligence', period: 'month' },
  intelYearly: { id: 'earthus.intelligence.yearly', tier: 'intelligence', period: 'year' },
};

test('Play 상품 8개 — plans id 그대로, 창립은 .founding. 서버 마이그레이션 대응표와 같다', () => {
  const cat = pb.playCatalog(PLANS);
  const ids = cat.map((c) => c.productId).sort();
  assert.equal(ids.length, 8);
  assert.deepEqual(ids, [
    'earthus.intelligence.monthly', 'earthus.intelligence.monthly.founding',
    'earthus.intelligence.yearly', 'earthus.intelligence.yearly.founding',
    'earthus.pro.monthly', 'earthus.pro.monthly.founding',
    'earthus.pro.yearly', 'earthus.pro.yearly.founding',
  ]);
  const sql = read('prototype/supabase/migrations/20260924121000_play_billing_entitlements.sql');
  for (const id of ids) assert.ok(sql.includes(`'${id}'`), `서버 play_products 에 ${id} 가 없다`);
  // Console 에 다른 id 로 올렸을 때만 덮어쓴다
  assert.equal(pb.playProductIdFor(PLANS.monthly, { founding: true, overrides: { 'earthus.pro.monthly.founding': 'x.half' } }), 'x.half');
  // 금액을 박아 두지 않는다 — 가격 정본은 Play Console(앱)·plans 표(웹)
  //   (Payment Request 의 total 은 자리값 '0' 이다 — Play 가 실제 금액을 정한다)
  const code = read('prototype/js/play-billing.js').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
  assert.ok(!/₩\s*\d|\bkrw\s*:|value:\s*'[1-9]/i.test(code), 'play-billing.js 에 금액이 박혀 있다');
  assert.ok(!/\b(krw|usd)\b\s*[:=]\s*\d/i.test(read('prototype/supabase/migrations/20260924121000_play_billing_entitlements.sql')));
});

test('결제 전 확인 화면 — 약관 제8조 제3항·제6항이 나와야 한다', () => {
  const feats = [{ ko: '지켜볼 곳 20군데', en: '20 places' }, { ko: '이벤트 리플레이', en: 'Replay', soon: true }];
  const m = pb.purchaseConfirmation({ plan: PLANS.yearly, tierName: 'EXPLORER', features: feats, ko: true });
  const all = m.lines.join('\n');
  assert.match(all, /1년/);
  assert.match(all, /자동으로 갱신되지 않습니다/);
  assert.match(all, /그 기간 뒤에 이어 붙습니다/, '제3항');
  assert.match(all, /다음 Google Play 결제 화면에 표시/, 'Play 가격을 못 받으면 지어내지 않고 이렇게 말한다');
  assert.match(m.notProvidedHead, /제공 시기를 확정할 수 없습니다/, '제6항');
  assert.deepEqual(m.notProvided, ['이벤트 리플레이']);
  const f = pb.purchaseConfirmation({ plan: PLANS.monthly, tierName: 'EXPLORER', features: feats, founding: true, playPrice: '₩4,950', ko: true });
  assert.match(f.lines.join('\n'), /정가의 50%/);
  assert.match(f.lines.join('\n'), /₩4,950/);
  assert.equal(pb.formatPlayPrice({ price: { currency: 'KRW', value: '4950' } }), '₩4,950');
  assert.equal(pb.formatPlayPrice({}), null);
});

test('Play 시트 — Digital Goods + Payment Request, 토큰을 돌려주고 시트는 부른 쪽이 검증 뒤에 닫는다', async () => {
  const seen = {};
  const response = { details: { purchaseToken: 'tok-123456789' }, complete: async (s) => { seen.complete = s; } };
  const win = {
    getDigitalGoodsService: async (m) => { seen.method = m; return { getDetails: async () => [] }; },
    PaymentRequest: class { constructor(methods, details) { seen.methods = methods; seen.details = details; } async show() { return response; } },
  };
  const r = await pb.purchaseViaDigitalGoods(win, 'earthus.pro.monthly');
  assert.equal(seen.method, 'https://play.google.com/billing');
  assert.deepEqual(seen.methods, [{ supportedMethods: 'https://play.google.com/billing', data: { sku: 'earthus.pro.monthly' } }]);
  assert.equal(r.purchaseToken, 'tok-123456789');
  assert.equal(seen.complete, undefined, '서버 검증 전에 시트를 success 로 닫으면 안 된다');
  // 사용자가 시트를 닫았다
  const abort = { ...win, PaymentRequest: class { async show() { const e = new Error('x'); e.name = 'AbortError'; throw e; } } };
  await assert.rejects(pb.purchaseViaDigitalGoods(abort, 'earthus.pro.monthly'), /CANCELLED/);
  // Digital Goods 가 없으면 시트를 열지 않는다
  await assert.rejects(pb.purchaseViaDigitalGoods({ PaymentRequest: class {} }, 'x'), /NOT_AVAILABLE/);
});

test('앱 재실행 복원 — Play 에 남은 구매를 서버로 다시 보낸다(우리 상품만)', async () => {
  const win = { getDigitalGoodsService: async () => ({ listPurchases: async () => [
    { itemId: 'earthus.pro.monthly', purchaseToken: 't1' }, { itemId: 'other.app.item', purchaseToken: 't2' }] }) };
  const sent = [];
  const r = await pb.restorePlayPurchases(win, async (p) => { sent.push(p); return { ok: true }; }, { knownProductIds: ['earthus.pro.monthly'] });
  assert.equal(r.checked, 1);
  assert.deepEqual(sent, [{ productId: 'earthus.pro.monthly', purchaseToken: 't1' }]);
});

test('네이티브 브리지 계약 — JSON 문자열 반환 또는 이벤트로 토큰을 받는다. 없으면 NOT_AVAILABLE', async () => {
  const direct = { AndroidBilling: { purchase: () => JSON.stringify({ purchaseToken: 'nat-1' }) }, addEventListener() {}, removeEventListener() {} };
  assert.equal((await pb.purchaseViaNativeBridge(direct, 'earthus.pro.monthly')).purchaseToken, 'nat-1');
  await assert.rejects(pb.purchaseViaNativeBridge({}, 'x'), /NOT_AVAILABLE/);
});

const OPEN = { MONETIZATION_MODE: 'PAID', SALES_OPEN: true, SHOW_SUBSCRIBE: true };
const CLOSED = { MONETIZATION_MODE: 'FREE_OPEN', SALES_OPEN: false, SHOW_SUBSCRIBE: false };

test('복귀 주소 — 같은 출처 경로만, v2 화면 상태(쿼리·해시)는 그대로', () => {
  assert.equal(sr.safeBackPath('/v2/#v=1&at=2027-01-10T00:00Z'), '/v2/#v=1&at=2027-01-10T00:00Z');
  assert.equal(sr.safeBackPath('/v2/?tab=my&event=kma-1#v=1'), '/v2/?tab=my&event=kma-1#v=1');
  // (2026-09-24 정정, 적대 검토) '/..//evil.com'·'/.//evil.com' 은 정규화 뒤 '//evil.com' 이 되어 통과하고 있었다.
  for (const bad of ['//evil.com/x', 'https://evil.com', '/\\evil.com', 'javascript:alert(1)', '', null, '/v2/\n',
    '/..//evil.com', '/.//evil.com', '/v2/..//evil.com/x', '/%2e%2e//evil.com']) {
    assert.equal(sr.safeBackPath(bad), null, `${bad} 를 받으면 열린 리디렉트다`);
  }
  assert.deepEqual(sr.parseSubscribeRequest('?subscribe=pro&back=%2Fv2%2F%23v%3D1'), { planKey: 'intelYearly', target: 'pro', back: '/v2/#v=1' });
  assert.equal(sr.parseSubscribeRequest('?subscribe=gold'), null);
  assert.equal(sr.stripSubscribeParams('?subscribe=pro&back=%2Fv2%2F&tc=WP1'), '?tc=WP1');
});

test('판매 열림 — v2 잠금 카드에 링크가 나오고, 결제 뒤 돌아올 v2 화면이 그대로 실린다', () => {
  const loc = { pathname: '/v2/', search: '?tab=my', hash: '#v=1&at=2027-01-10' };
  const href = sr.subscribeHref({ config: OPEN, tier: 'explorer', back: `${loc.pathname}${loc.search}${loc.hash}` });
  assert.equal(href, `/?subscribe=explorer&back=${encodeURIComponent('/v2/?tab=my#v=1&at=2027-01-10')}`);
  // v1 쪽이 같은 주소를 읽으면 같은 화면으로 돌아간다
  const req = sr.parseSubscribeRequest(href.slice(1));
  assert.equal(req.back, '/v2/?tab=my#v=1&at=2027-01-10');
  assert.equal(req.planKey, 'yearly');
  const html = sr.upgradeLineHtml({ config: OPEN, tier: 'pro', loc, ko: true, upgradeText: '사전등록' });
  assert.match(html, /data-testid="subscribe-link"/);
  assert.match(html, /PRO 구독 화면으로/);
  assert.match(html, /subscribe=pro/);
});

test('판매 닫힘(지금) — 링크가 없고 예전 문구 그대로다', () => {
  assert.equal(sr.subscribeHref({ config: CLOSED, tier: 'explorer', back: '/v2/' }), null);
  assert.equal(sr.subscribeHref({ config: { ...OPEN, SHOW_SUBSCRIBE: false }, back: '/v2/' }), null, '구독 화면 문이 닫혀 있으면 링크도 없다');
  assert.equal(sr.subscribeHref({ config: undefined }), null, 'v2 에는 설정이 없다 — 없으면 닫힘');
  assert.equal(sr.upgradeLineHtml({ config: CLOSED, loc: { pathname: '/v2/' }, upgradeText: '지금은 사전등록으로 소식을 받으실 수 있습니다' }),
    '<span class="paysub">지금은 사전등록으로 소식을 받으실 수 있습니다</span>');
});

test('v2 Intelligence 잠금 카드(intel-strip) — 판매 열림/닫힘 두 상태', async () => {
  const s = await import('../../prototype/v2-three/js/intel-strip.js?v=4-pb0924');
  const V1 = JSON.parse(readFileSync(new URL('./fixtures/intel-v1-typhoon-1001322.json', import.meta.url), 'utf8'));
  const ko = { ko: true };
  const had = { cfg: globalThis.EARTHUS_CONFIG, loc: globalThis.location };
  try {
    globalThis.location = { pathname: '/v2/', search: '', hash: '#v=1&at=x' };
    globalThis.EARTHUS_CONFIG = undefined;   // 지금 운영 v2 — 설정 없음
    const closed = s.intelSectionHtml({ packet: V1, section: 'WHY', i18n: ko, mode: 'PAID', tier: 'free' });
    assert.ok(!/subscribe-link/.test(closed));
    assert.match(closed, /사전등록/);
    globalThis.EARTHUS_CONFIG = OPEN;
    const open = s.intelSectionHtml({ packet: V1, section: 'WHY', i18n: ko, mode: 'PAID', tier: 'free' });
    assert.match(open, /data-testid="subscribe-link"/);
    assert.ok(open.includes(`back=${encodeURIComponent('/v2/#v=1&at=x')}`), '돌아올 v2 화면(해시까지)이 실려야 한다');
  } finally {
    globalThis.EARTHUS_CONFIG = had.cfg; globalThis.location = had.loc;
  }
});

test('v2 등급 — FREE_OPEN 은 요청 0·예전 값, PAID 는 서버 값만(localStorage 무시)·실패는 free', async () => {
  ent._resetEntitlementForTest();
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ tier: 'intelligence', signedIn: true }) }; };
  const storage = mkStorage({ 'sb-abc-auth-token': JSON.stringify({ access_token: 'jwt', expires_at: 4102444800 }) });
  assert.equal(await ent.refreshEntitlement({ config: { MONETIZATION_MODE: 'FREE_OPEN' }, fetchImpl, storage }), null);
  assert.equal(calls, 0, '판매 전에는 서버에 묻지 않는다(네트워크 0)');
  assert.equal(ent.resolveTier({ mode: 'FREE_OPEN', legacyTier: 'explorer' }), 'explorer', '지금 화면은 그대로');

  // 기준 6 — localStorage 를 'intelligence' 로 바꿔도 서버가 free 라면 free
  assert.equal(ent.resolveTier({ mode: 'PAID', legacyTier: 'intelligence', server: { ok: true, tier: 'free' } }), 'free');
  assert.equal(ent.resolveTier({ mode: 'PAID', legacyTier: 'intelligence', server: null }), 'free', '서버 답 전에는 free');
  assert.equal(ent.resolveTier({ mode: 'PAID', legacyTier: 'free', server: { ok: false } }), 'free', '서버 불통은 free');

  const r = await ent.refreshEntitlement({ config: { MONETIZATION_MODE: 'PAID', ENTITLEMENT_URL: 'https://x/functions/v1/entitlement' }, fetchImpl, storage });
  assert.equal(calls, 1);
  assert.equal(r.tier, 'intelligence');
  assert.equal(ent.resolveTier({ mode: 'PAID', legacyTier: 'free', server: ent.serverTierSnapshot() }), 'intelligence', '돈 낸 사람은 열려야 한다');

  // 로그인 없음 → free 확정, 요청하지 않는다
  const none = await ent.fetchServerTier({ url: 'https://x', fetchImpl, storage: mkStorage({}) });
  assert.deepEqual(none, { ok: true, tier: 'free', signedIn: false });
  // 만료된 세션 토큰은 보내지 않는다
  assert.equal(ent.readSupabaseAccessToken(mkStorage({ 'sb-abc-auth-token': JSON.stringify({ access_token: 'old', expires_at: 1 }) })), null);
  // 서버가 이상한 등급을 주면 free
  const odd = await ent.fetchServerTier({ url: 'https://x', storage, fetchImpl: async () => ({ ok: true, json: async () => ({ tier: 'gold' }) }) });
  assert.equal(odd.tier, 'free');
  const down = await ent.fetchServerTier({ url: 'https://x', storage, fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(down.ok, false);
  ent._resetEntitlementForTest();
});

test('v2 report-center.currentTier — PAID 에서 localStorage 를 믿지 않는다', async () => {
  const rc = await import('../../prototype/v2-three/js/report-center.js?v=4');
  const had = { w: globalThis.window, ls: globalThis.localStorage };
  try {
    globalThis.window = { EARTHUS_CONFIG: { MONETIZATION_MODE: 'PAID' } };
    globalThis.localStorage = mkStorage({ 'earthus.tier': 'intelligence' });
    ent._resetEntitlementForTest();
    assert.equal(rc.currentTier(), 'free', 'localStorage 만으로 유료가 열리면 결제 우회다');
    globalThis.window = { EARTHUS_CONFIG: { MONETIZATION_MODE: 'FREE_OPEN' } };
    assert.equal(rc.currentTier(), 'intelligence', '판매 전 화면은 예전과 같다');
    // 서버 등급 id 'intelligence'(화면 PRO)를 산 사람에게 리포트 상세가 **열려야** 한다 — 예전 'pro' 글자 비교로는 영영 잠겼다.
    const report = { reportId: 'r1', sections: [{ id: 'regional_detail', titleKo: '지역별', storyRefs: ['s1'] }],
      stories: [{ storyId: 's1', storyType: 'RECORD', factIds: [] }] };
    // (2026-09-24 정정, 적대 검토) 판매 전(FREE_OPEN)에는 옛 규칙(`tier !== 'pro'`)과 **같은 결과**여야 한다 —
    //   처음 판에서는 localStorage 등급이 'intelligence' 인 브라우저에서 판매 전인데도 리포트 상세가 열렸다.
    const oldGated = (t) => t !== 'pro';
    for (const t of ['free', 'explorer', 'paid', 'intelligence', 'business', 'pro']) {
      assert.equal(/pro-gate/.test(rc.reportDocHtml(report, { tier: t })), oldGated(t), `FREE_OPEN 에서 '${t}' 판정이 예전과 달라졌다`);
    }
    // 판매 개시(PAID) 뒤 — 서버 등급 id 'intelligence'(화면 PRO)를 산 사람에게 리포트 상세가 **열려야** 한다.
    globalThis.window = { EARTHUS_CONFIG: { MONETIZATION_MODE: 'PAID' } };
    assert.ok(/pro-gate/.test(rc.reportDocHtml(report, { tier: 'free' })), 'FREE 는 잠긴다');
    assert.ok(/pro-gate/.test(rc.reportDocHtml(report, { tier: 'explorer' })), 'EXPLORER 는 (지금 문구대로) 잠긴다 — PD 확인 대상');
    assert.ok(!/pro-gate/.test(rc.reportDocHtml(report, { tier: 'intelligence' })), 'PRO 구독자가 잠겼다');
    assert.ok(!/pro-gate/.test(rc.reportDocHtml(report, { tier: 'pro' })), "옛 별칭 'pro' 도 연다");
  } finally {
    globalThis.window = had.w; globalThis.localStorage = had.ls;
  }
});

test('배선 — 확인 화면 없이 Play 시트로 가는 길이 없고, 앱 안에서 토스를 부르지 않는다', () => {
  const ui = read('prototype/js/ui-subscribe.js');
  assert.match(ui, /providerKey === 'play' \|\| providerKey === 'google'\) && !this\._confirm\?\.accepted/, '확인 화면을 거치지 않는다');
  assert.match(ui, /renderConfirm\(body, ko\)/);
  assert.match(ui, /const autoRenew = provs\.some\(p => p\.key === 'apple'\);/, 'Play 선불형을 자동 갱신이라고 쓰면 안 된다');
  const billing = read('prototype/js/billing.js');
  assert.match(billing, /if \(!CONFIG\.PLAY_VERIFY_URL\) throw new Error\('NOT_CONFIGURED'\);\s*\n\s*if \(!\(await auth\.accessToken/, '시트를 열기 전에 검증 주소·로그인을 본다');
  assert.match(billing, /available: \(\) => !!CONFIG\.CHECKOUT_URL && !isInApp\(\)/, '앱 안 토스 차단 유지');
  const v1main = read('prototype/js/main.js');
  assert.match(v1main, /if \(subReq && subscribeLinkAllowed\(CONFIG\)\)/, '판매가 닫혀 있으면 ?subscribe= 를 못 본 척한다');
  assert.match(v1main, /if \(back && !subReq && /, '구독 길의 back 은 로그인만으로 튕기지 않는다');
});

function mkStorage(obj) {
  const m = new Map(Object.entries(obj));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
