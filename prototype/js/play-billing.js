// 앱 안 Google Play 결제 — 브라우저 쪽 순수 부품 (2026-09-24, 지시서 docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md §3-3 · §3-4 · Phase 2)
//
// ── 무엇을 하나 ────────────────────────────────────────────────────────────────────────────────────
//   ① 상품 id 정하기 — 서버 plans id(billing.js DEFAULT_PLANS) 그대로, 창립 멤버면 뒤에 `.founding`(8개).
//      CONFIG.PLAY_PRODUCTS 로 덮어쓸 수 있다({'earthus.pro.monthly': 'earthus.pro.monthly', ...} 형태 — 창립은 '<id>.founding' 키).
//   ② 결제 전 확인 화면의 **내용**(약관 제8조 제3항·제6항) — 이용 기간 · 아직 제공되지 않는 기능 · 남은 기간 뒤 이어 붙임.
//      Play 결제 시트에는 우리 문구를 넣을 수 없어서 시트 **바로 앞**에 이 화면을 둔다(지시서 §3-3 '약관 제8조의 다른 항').
//   ③ Digital Goods API + Payment Request('https://play.google.com/billing') 로 Play 시트를 연다(Chrome TWA).
//   ④ 네이티브 브리지(window.AndroidBilling) 길 — 계약만 정해 둔다(아래 ⚠️).
//   ⑤ 앱을 다시 열었을 때 검증되지 않은 구매를 서버로 다시 보낸다(listPurchases → play-verify, 서버가 멱등).
//
// ── 하지 않는 것 ──────────────────────────────────────────────────────────────────────────────────
//   가격을 정하지 않는다(Play 가 Console 가격을 청구한다 — 화면은 Play 가 알려준 가격만 옮긴다, 없으면 '다음 화면에 표시').
//   권한을 스스로 열지 않는다 — 서버(play-verify)가 확인해 profiles 에 적은 값을 auth.refresh() 로 다시 읽는다.
//   config.local.js 를 읽지 않는다(시험할 수 있게 값은 모두 인자로 받는다).
//
// ⚠️ 네이티브 브리지: TWA 는 Chrome·삼성 인터넷 안에서 웹을 띄우므로 앱이 웹에 JS 객체를 심을 수 없다.
//    그래서 window.AndroidBilling 은 지금 어디에서도 생기지 않는다 → 삼성 인터넷 기본 폰에서는 '앱에서는 결제할 수 없습니다'
//    (app-context paymentRoute 'blocked')가 뜬다. 이 파일은 브리지가 생길 경우의 **계약**만 받는다:
//      AndroidBilling.purchase(productId) 가 {purchaseToken} 또는 그 JSON 문자열(또는 그것을 주는 Promise)을 돌려주거나,
//      window 에 'earthus-play-purchase' 이벤트(detail {productId, purchaseToken} 또는 {error})를 쏜다.

export const PLAY_BILLING_METHOD = 'https://play.google.com/billing';
export const FOUNDING_SUFFIX = '.founding';

/** 상품 하나의 Play id. overrides 가 있으면 그것이 이긴다(Console 에 다른 id 로 올렸을 때). */
export function playProductIdFor(plan, { founding = false, overrides = null } = {}) {
  if (!plan || typeof plan.id !== 'string' || !plan.id) return null;
  const key = founding ? `${plan.id}${FOUNDING_SUFFIX}` : plan.id;
  const o = overrides && typeof overrides === 'object' ? overrides[key] : null;
  return typeof o === 'string' && o ? o : key;
}

/** plans(billing.js PLANS) → Play 상품 목록. 가격이 없는(soon) 상품은 빼지 않는다 — 판매 여부는 화면이 따로 정한다. */
export function playCatalog(plans, { overrides = null } = {}) {
  const out = [];
  for (const [planKey, plan] of Object.entries(plans || {})) {
    if (!plan || !plan.id || !plan.tier) continue;
    for (const founding of [false, true]) {
      out.push({ planKey, planId: plan.id, tier: plan.tier, period: plan.period, founding,
        productId: playProductIdFor(plan, { founding, overrides }) });
    }
  }
  return out;
}

const PERIOD = {
  month: { ko: '1개월', en: '1 month' },
  year: { ko: '1년', en: '1 year' },
};

/**
 * 결제 전 확인 화면에 쓸 **사실**. 문장은 약관 제8조 문구를 옮긴다 — 새 약속을 만들지 않는다.
 * @param {object} a
 * @param {object} a.plan        billing.js PLANS 의 한 행 {id, tier, period}
 * @param {string} a.tierName    화면 등급 이름(EXPLORER · PRO)
 * @param {Array}  a.features    이 등급에서 파는 기능 목록({ko,en,soon}) — PRO 면 EXPLORER 것까지 합쳐서 넘긴다
 * @param {boolean} a.founding   창립 멤버 반값 상품인가
 * @param {string|null} a.playPrice  Play 가 알려준 가격 문자열(없으면 null — 지어내지 않는다)
 * @param {boolean} a.ko
 */
export function purchaseConfirmation({ plan, tierName = '', features = [], founding = false, playPrice = null, ko = true } = {}) {
  const per = PERIOD[plan && plan.period] || null;
  const notProvided = (features || []).filter((f) => f && f.soon).map((f) => (ko ? f.ko : f.en));
  const lines = [];
  lines.push(ko
    ? `이용 기간: ${per ? per.ko : '상품에 정한 기간'} · 기간형 이용권 · 자동으로 갱신되지 않습니다 · 기간이 끝나면 무료 이용으로 돌아갑니다`
    : `Term: ${per ? per.en : 'the product term'} · fixed-term pass · does not renew automatically · returns to free when it ends`);
  lines.push(ko
    ? '남은 기간이 있는 상태에서 다시 결제하면 그 기간 뒤에 이어 붙습니다. (Google Play 가 연장 구매를 받는 시점은 Google Play 가 정합니다)'
    : 'If you still have time left, the new term is added after it. (Google Play decides when an extension can be bought.)');
  if (founding) {
    lines.push(ko ? '창립 멤버 할인 — 정가의 50% 상품입니다(약관 제8조 제7항).' : 'Founding member price — 50% of the list price (Terms art. 8(7)).');
  }
  lines.push(playPrice
    ? (ko ? `Google Play 표시 가격: ${playPrice} · 최종 금액은 다음 Google Play 결제 화면에 표시된 금액입니다`
          : `Price shown by Google Play: ${playPrice} · the final amount is the one on the next Google Play screen`)
    : (ko ? '금액은 다음 Google Play 결제 화면에 표시됩니다' : 'The amount is shown on the next Google Play screen'));
  lines.push(ko
    ? '결제·환불은 Google Play 가 처리합니다. 환불되면 해당 이용 기간도 함께 회수됩니다.'
    : 'Google Play processes payment and refunds. A refund also removes that term.');
  return {
    title: ko ? `${tierName} 결제 전 확인` : `Before you pay — ${tierName}`,
    lines,
    // 약관 제8조 제6항 — 아직 제공되지 않는 기능과 '제공 시기를 확정할 수 없다'는 점을 결제 화면에 적는다.
    notProvidedHead: notProvided.length
      ? (ko ? '아직 제공되지 않는 기능 — 제공 시기를 확정할 수 없습니다' : 'Not provided yet — we cannot confirm when')
      : null,
    notProvided,
    confirm: ko ? '확인했습니다 · Google Play 로 결제' : 'I understand · pay with Google Play',
    cancel: ko ? '돌아가기' : 'Back',
  };
}

/** Play 가 준 ItemDetails.price({currency, value}) → 화면 문자열. 없거나 이상하면 null. */
export function formatPlayPrice(details, locale = 'ko-KR') {
  const p = details && details.price;
  if (!p || typeof p.currency !== 'string' || p.value == null || !Number.isFinite(Number(p.value))) return null;
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: p.currency }).format(Number(p.value)); }
  catch (_) { return `${p.value} ${p.currency}`; }
}

/** Digital Goods 서비스를 얻는다. 없으면 null. */
export async function digitalGoodsService(win) {
  if (!win || typeof win.getDigitalGoodsService !== 'function') return null;
  try { return await win.getDigitalGoodsService(PLAY_BILLING_METHOD); } catch (_) { return null; }
}

/** 상품 정보(Play 가격). 못 받으면 null — 결제를 막지는 않는다(확인 화면이 '다음 화면에 표시'로 적는다). */
export async function playItemDetails(win, productId) {
  const svc = await digitalGoodsService(win);
  if (!svc || typeof svc.getDetails !== 'function') return null;
  try { const list = await svc.getDetails([productId]); return (list || []).find((d) => d && d.itemId === productId) || null; }
  catch (_) { return null; }
}

/**
 * Play 결제 시트를 연다 — 성공하면 {purchaseToken, response}. response.complete() 는 **서버 검증 뒤에** 부른다.
 * ⚠️ Payment Request 의 total 금액은 자리값이다 — 실제 금액은 Play 가 정한다(Chrome TWA 문서의 사용법 그대로).
 */
export async function purchaseViaDigitalGoods(win, productId) {
  if (!win || typeof win.PaymentRequest !== 'function') throw new Error('NOT_AVAILABLE');
  const svc = await digitalGoodsService(win);
  if (!svc) throw new Error('NOT_AVAILABLE');
  const request = new win.PaymentRequest(
    [{ supportedMethods: PLAY_BILLING_METHOD, data: { sku: productId } }],
    { total: { label: 'Total', amount: { currency: 'KRW', value: '0' } } },
  );
  let response;
  try {
    response = await request.show();
  } catch (e) {
    // 사용자가 시트를 닫았다 — 실패가 아니라 취소다.
    if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) throw new Error('CANCELLED');
    throw e;
  }
  const token = response && response.details && response.details.purchaseToken;
  if (!token) {
    try { await response.complete('fail'); } catch (_) { /* 이미 닫힘 */ }
    throw new Error('NO_PURCHASE_TOKEN');
  }
  return { purchaseToken: token, productId, response };
}

/** 네이티브 브리지 길(계약만 — 머리 주석 ⚠️). 토큰을 못 받으면 NOT_AVAILABLE. */
export async function purchaseViaNativeBridge(win, productId, { timeoutMs = 10 * 60 * 1000 } = {}) {
  const br = win && win.AndroidBilling;
  if (!br || typeof br.purchase !== 'function') throw new Error('NOT_AVAILABLE');
  const pick = (v) => {
    let o = v;
    if (typeof o === 'string') { try { o = JSON.parse(o); } catch (_) { o = null; } }
    return o && typeof o.purchaseToken === 'string' && o.purchaseToken ? o.purchaseToken : null;
  };
  // 이벤트를 먼저 듣고(브리지가 purchase() 안에서 곧바로 쏠 수 있다), 직접 반환으로 토큰이 오면 듣기·타이머를 바로 거둔다.
  // ⚠️ 거두지 않으면 10분 타이머가 남아 페이지(시험에서는 프로세스)를 붙잡는다 — 실제로 시험이 멈췄다.
  let cleanup = () => {};
  const viaEvent = new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error('TIMEOUT')); }, timeoutMs);
    const on = (ev) => {
      const d = ev && ev.detail;
      if (!d || (d.productId && d.productId !== productId)) return;
      cleanup();
      if (d.error) reject(new Error(d.error === 'CANCELLED' ? 'CANCELLED' : 'NATIVE_BILLING_FAILED'));
      else if (pick(d)) resolve(pick(d));
      else reject(new Error('NO_PURCHASE_TOKEN'));
    };
    cleanup = () => { clearTimeout(t); win.removeEventListener?.('earthus-play-purchase', on); };
    win.addEventListener?.('earthus-play-purchase', on);
  });
  let direct;
  try { direct = await Promise.resolve(br.purchase(productId)); } catch (e) { cleanup(); throw e; }
  const now = pick(direct);
  if (now) { cleanup(); viaEvent.catch(() => {}); return { purchaseToken: now, productId, response: null }; }
  return { purchaseToken: await viaEvent, productId, response: null };
}

/**
 * 앱을 다시 열었을 때 — Play 에 남아 있는 구매를 서버로 다시 보낸다(서버가 멱등: 이미 준 것은 'already').
 * acknowledge 가 실패했던 구매도 이 길로 3일 안에 마저 acknowledge 된다.
 * @param {(p:{productId:string,purchaseToken:string})=>Promise<any>} verify
 */
export async function restorePlayPurchases(win, verify, { knownProductIds = null } = {}) {
  const svc = await digitalGoodsService(win);
  if (!svc || typeof svc.listPurchases !== 'function') return { checked: 0, results: [] };
  let list = [];
  try { list = await svc.listPurchases(); } catch (_) { return { checked: 0, results: [] }; }
  const results = [];
  for (const p of list || []) {
    if (!p || !p.itemId || !p.purchaseToken) continue;
    if (knownProductIds && !knownProductIds.includes(p.itemId)) continue;
    try { results.push({ productId: p.itemId, ok: true, r: await verify({ productId: p.itemId, purchaseToken: p.purchaseToken }) }); }
    catch (e) { results.push({ productId: p.itemId, ok: false, error: String(e && e.message || e) }); }
  }
  return { checked: results.length, results };
}
