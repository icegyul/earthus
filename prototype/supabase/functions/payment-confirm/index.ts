// earthus — 결제 승인 (돈이 실제로 빠져나가는 단계)
//
// ⚠️⚠️⚠️ **이 파일이 결제에서 가장 위험한 곳이다.** 아래 세 가지를 절대 빼지 말 것.
//
//   ① 금액은 **DB 에서** 읽는다. 쿼리스트링(amount)을 믿지 않는다.
//      토스는 successUrl 에 amount 를 붙여 보내는데, 사용자가 주소창에서 고칠 수 있다.
//      "39원 결제 → 39원 승인 요청"이 통과하면 끝이다.
//
//   ② **멱등**해야 한다. 사용자가 새로고침하면 이 함수가 두 번 불린다.
//      apply_paid_order() 가 이미 'paid' 인 주문을 그냥 통과시킨다.
//
//   ③ 시크릿 키는 **서버에만** 둔다. 이 함수 밖으로 절대 나가면 안 된다.
//      Basic 인증 헤더는 base64(secretKey + ':') 이다 — 콜론을 빠뜨리면 401 이 난다.
//
// 배포
//   supabase functions deploy payment-confirm
//   supabase secrets set TOSS_SECRET_KEY=live_sk_... APP_ORIGIN=https://earthus.net
//
// ⚠️ 테스트 키(test_sk_)로 먼저 끝까지 돌려보고 라이브 키로 바꾼다.
//    테스트 키는 실제 돈이 움직이지 않는다.

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'NOT_CONFIGURED' }, 503);

  const authz = req.headers.get('Authorization') ?? '';
  if (!authz.startsWith('Bearer ')) return json({ error: 'NO_AUTH' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authz } },
  });
  const { data: { user } } = await anon.auth.getUser();
  if (!user) return json({ error: 'NO_AUTH' }, 401);

  let paymentKey = '', orderId = '';
  try {
    ({ paymentKey, orderId } = await req.json());
  } catch { /* 아래에서 걸린다 */ }
  if (!paymentKey || !orderId) return json({ error: 'MISSING' }, 400);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // ── ① 주문을 DB 에서 읽는다 ─────────────────────────────
  const { data: order } = await admin
    .from('orders').select('*').eq('id', orderId).maybeSingle();
  if (!order) return json({ error: 'ORDER_NOT_FOUND' }, 404);

  // ⚠️ **남의 주문을 승인시키지 못하게** 소유자를 확인한다.
  if (order.user_id !== user.id) return json({ error: 'NOT_YOURS' }, 403);

  // ⚠️⚠️ 이 함수는 **토스 전용**이다. 다른 수단으로 만든 주문이 여기로 오면
  //    엉뚱한 곳에 승인을 요청하게 된다. 통화까지 함께 막는다 —
  //    토스는 원화만 받으므로 USD 주문이 여기 오는 건 그 자체가 사고다.
  if (order.provider !== 'toss' || order.currency !== 'KRW') {
    return json({ error: 'WRONG_PROVIDER',
                  provider: order.provider, currency: order.currency }, 400);
  }

  // ── ② 이미 끝난 주문이면 다시 승인하지 않는다 (멱등) ─────
  if (order.status === 'paid') {
    const { data: prof } = await admin
      .from('profiles').select('tier, subscription_ends').eq('id', user.id).maybeSingle();
    return json({ ok: true, already: true, tier: prof?.tier, ends: prof?.subscription_ends });
  }

  // ── ③ 토스에 승인 요청 — 금액은 **DB 값** ────────────────
  const basic = btoa(`${secret}:`);   // ⚠️ 콜론 필수
  let tossBody: Record<string, unknown> = {};
  let tossOk = false;
  try {
    const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/json',
        // ⚠️ 같은 키로 두 번 보내도 토스가 한 번만 처리한다. 네트워크 재시도 보호.
        'Idempotency-Key': orderId,
      },
      body: JSON.stringify({ paymentKey, orderId, amount: order.amount }),
    });
    tossBody = await r.json();
    tossOk = r.ok;
  } catch (e) {
    return json({ error: 'PG_UNREACHABLE', detail: String(e).slice(0, 200) }, 502);
  }

  if (!tossOk) {
    await admin.from('orders').update({
      status: 'failed',
      fail_reason: String(tossBody?.code ?? tossBody?.message ?? 'UNKNOWN').slice(0, 200),
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);
    return json({ error: 'PG_DECLINED', code: tossBody?.code, message: tossBody?.message }, 402);
  }

  // ⚠️ 토스가 승인했다고 해도 **금액이 우리 주문과 같은지 한 번 더** 본다.
  //    여기서 어긋나면 사람이 봐야 하는 사고다 — 조용히 넘기지 않는다.
  if (Number(tossBody?.totalAmount) !== Number(order.amount)) {
    await admin.from('orders').update({
      status: 'failed',
      fail_reason: `AMOUNT_MISMATCH pg=${tossBody?.totalAmount} db=${order.amount} ${order.currency}`,
      updated_at: new Date().toISOString(),
    }).eq('id', orderId);
    return json({ error: 'AMOUNT_MISMATCH' }, 409);
  }

  // ── ④ 이용권 부여 (멱등 함수) ────────────────────────────
  const { data: applied, error: aerr } = await admin
    .rpc('apply_paid_order', { p_order_id: orderId, p_payment_key: paymentKey });
  if (aerr) {
    // ⚠️⚠️ 돈은 빠져나갔는데 권한이 안 붙은 상태다. **가장 나쁜 실패**다.
    //    주문은 'paid' 로 못 바꾸고 로그를 남겨 사람이 처리하게 한다.
    console.error('[pay] 승인됐으나 반영 실패', orderId, aerr.message);
    return json({ error: 'APPLY_FAILED', orderId, ko:
      '결제는 됐지만 이용권 적용에 실패했습니다. 고객센터에 주문번호를 알려주세요.' }, 500);
  }

  const row = Array.isArray(applied) ? applied[0] : applied;
  return json({ ok: true, tier: row?.tier ?? 'paid', ends: row?.ends, orderId });
});
