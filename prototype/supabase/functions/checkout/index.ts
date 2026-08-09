// earthus — 주문 생성 (결제창을 열기 **직전** 단계)
//
// 하는 일: 로그인한 사용자의 주문을 DB 에 만들고, 결제창에 필요한 값만 돌려준다.
// 하지 않는 일: 카드 정보를 받지 않는다. 승인하지 않는다. 금액을 클라이언트에서 받지 않는다.
//
// ⚠️⚠️ **금액을 클라이언트가 보내게 하면 안 된다.**
//    브라우저에서 3900 을 39 로 바꿔 보낼 수 있다. planId 만 받고 금액은 DB(plans)에서 찾는다.
//    이건 "혹시 몰라서"가 아니라 **가장 흔한 결제 취약점**이다.
//
// ⚠️ 서비스 롤 키를 쓴다 → 이 함수는 **반드시 사용자 JWT 를 검증**해야 한다.
//    검증을 빼면 아무나 남의 user_id 로 주문을 만들 수 있다.
//
// 배포
//   supabase functions deploy checkout
//   supabase secrets set SALES_ENABLED=false TOSS_CLIENT_KEY=... APP_ORIGIN=https://earthus.net
//   ⚠️ SALES_ENABLED=true 는 founding.sql 검증·법적 선행조건·결제 테스트가
//      모두 끝난 뒤에만 설정한다. 값이 없거나 철자가 다르면 판매는 닫힌다.
//   ⚠️ TOSS_SECRET_KEY 는 여기 필요 없다 — 승인 함수에만 둔다 (노출면을 좁힌다).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

/** 주문번호. ⚠️ 토스는 6~64자, 영문·숫자·하이픈·언더바만 받는다.
 *  ⚠️ 추측 가능한 연번을 쓰지 않는다 — 남의 주문번호를 넣어보는 시도를 막는다. */
function orderId(): string {
  const t = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const r = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  return `earthus-${t}-${r}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  // ⚠️⚠️ 브라우저의 SALES_OPEN 은 화면용일 뿐이다. 사용자는 Edge Function 을
  //    직접 호출할 수 있으므로 서버에도 독립된 문이 있어야 한다.
  //    정확히 소문자 true 일 때만 연다 — 미설정·오타·"1"은 모두 닫힘이다.
  if (Deno.env.get('SALES_ENABLED') !== 'true') {
    return json({ error: 'SALES_CLOSED', ko: '유료 판매는 아직 시작하지 않았습니다.' }, 503);
  }

  const clientKey = Deno.env.get('TOSS_CLIENT_KEY');
  if (!clientKey) {
    // ⚠️ 없는 걸 있는 척하지 않는다. 화면이 "결제 준비 중"으로 정확히 안내한다.
    return json({ error: 'NOT_CONFIGURED', ko: '결제 수단이 아직 연결되지 않았습니다.' }, 503);
  }

  // ── 1. 사용자 확인 ────────────────────────────────────────
  const authz = req.headers.get('Authorization') ?? '';
  if (!authz.startsWith('Bearer ')) return json({ error: 'NO_AUTH' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authz } },
  });
  const { data: { user }, error: uerr } = await anon.auth.getUser();
  if (uerr || !user) return json({ error: 'NO_AUTH' }, 401);

  // ── 2. 요청 ──────────────────────────────────────────────
  let planId = '';
  try {
    ({ planId } = await req.json());
  } catch { /* 아래에서 걸린다 */ }
  if (!planId) return json({ error: 'NO_PLAN' }, 400);

  // ── 3. 금액은 **서버가** 정한다 ───────────────────────────
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: plan } = await admin
    .from('plans').select('*').eq('id', planId).eq('active', true).maybeSingle();
  if (!plan) return json({ error: 'UNKNOWN_PLAN' }, 400);

  // ⚠️ 선착순 상품은 **여기서** 막는다. 결제부터 받고 나중에 거절하면 환불 분쟁이 된다.
  if (plan.max_seats != null) {
    const { data: left } = await admin.rpc('plan_seats_left', { p_plan_id: planId });
    if (typeof left === 'number' && left <= 0) {
      return json({ error: 'SOLD_OUT', ko: '창립회원 모집이 마감되었습니다.' }, 409);
    }
  }

  // ── 3-2. 창립 멤버 반값 ──────────────────────────────────
  // ⚠️⚠️ **여기서 산술을 하지 않는다.** price_for() 하나가 값을 정한다.
  //    plans 표가 DB 에 있는데 계산을 여기서 또 하면 두 값이 반드시 갈라진다.
  //    할인율(0.5)과 정원(500)은 이용약관 제8조 제7항에 적힌 수이고,
  //    그 수는 founding_rate()/founding_seats() 한 군데에만 있다.
  //
  // ⚠️ 자격은 profiles.founding_member 로만 본다. 요청 본문의 어떤 값도 안 믿는다.
  //    그 칸은 claim_founding() 만 채우고, claim_founding() 은
  //    auth.uid() 로 본인을 찾아 auth.users 의 이메일로 판정한다.
  const { data: priced, error: perr } = await admin
    .rpc('price_for', { p_user: user.id, p_plan: planId });
  const px = Array.isArray(priced) ? priced[0] : priced;
  if (perr || !px) {
    // ⚠️ 값을 못 정하면 **정가로 진행하지 않는다.** 창립 멤버에게 정가를 받는 것은
    //    약관 위반이다. 결제를 여는 것보다 멈추는 편이 낫다.
    return json({ error: 'PRICE_FAILED', ko: '금액을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }, 503);
  }

  // ── 4. 주문 기록 ─────────────────────────────────────────
  const id = orderId();
  // ⚠️⚠️ **토스는 원화 전용이다.** 해외 카드 결제는 이 함수로 처리하지 않는다 —
  //    한국 사업자는 Stripe 계정을 못 열어서(2026 기준) MoR(Paddle 등)이나
  //    앱스토어 IAP 를 따로 붙여야 한다. 그쪽은 별도 함수가 된다.
  //    여기서 통화를 KRW 로 못 박는 이유가 그것이다. 조용히 원화로 긁히면 안 된다.
  const { error: oerr } = await admin.from('orders').insert({
    id, user_id: user.id, plan_id: planId,
    // ⚠️ 최소 단위로 저장한다. KRW 는 소수점이 없어 원 그대로다.
    amount: px.amount, currency: px.currency ?? 'KRW', provider: 'toss',
    // ⚠️ 왜 이 금액이었는지 남긴다. 정가는 나중에 바뀌므로 결제 시점 값을 박아 둔다.
    list_amount: px.list_amount, discount_kind: px.discount_kind, discount_rate: px.discount_rate,
  });
  if (oerr) return json({ error: 'ORDER_FAILED', detail: oerr.message }, 500);

  const origin = Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net';
  return json({
    orderId: id,
    // ⚠️ 금액을 함께 돌려주지만, 승인 때 **다시 DB 와 대조**한다.
    //    여기 값을 신뢰해서 승인하면 중간에 바꿔치기할 수 있다.
    amount: px.amount,
    currency: px.currency ?? 'KRW',
    // 화면이 "정가 ₩5,900 → 창립 멤버 ₩2,950" 로 보여줄 수 있게 함께 준다.
    listAmount: px.list_amount,
    discountKind: px.discount_kind ?? null,
    // ⚠️ 결제창과 카드 명세서에 찍히는 이름이다. 반값이면 반값이라고 적혀야
    //    나중에 "왜 이 금액이지" 하는 문의와 취소가 안 생긴다.
    orderName: px.discount_kind === 'founding'
      ? `${plan.name_ko} (창립 멤버 반값)`
      : plan.name_ko,
    clientKey,                                   // ⚠️ 공개 키다. 시크릿 키가 아니다.
    customerEmail: user.email ?? undefined,
    successUrl: `${origin}/pay-return.html?r=ok`,
    failUrl: `${origin}/pay-return.html?r=fail`,
  });
});
