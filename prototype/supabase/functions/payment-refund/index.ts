// earthus — 토스 전액 환불
//
// 고객 요청을 확인한 운영자가 호출한다. 자동 환불·브라우저 호출 경로가 아니다.
// ⚠️ 실제 취소액은 현재 요금표가 아니라 결제 시 저장한 orders.amount 다.
// ⚠️ 최신 유료 주문만 처리한다. 과거 주문을 중간에서 빼면 뒤 기간 재계산이 필요하다.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authz = req.headers.get('Authorization') ?? '';
  // ⚠️ 사용자 JWT 로는 환불할 수 없다. 서비스 역할을 가진 운영 경로만 허용한다.
  if (!serviceKey || authz !== `Bearer ${serviceKey}`) {
    return json({ error: 'FORBIDDEN' }, 403);
  }

  const secret = Deno.env.get('TOSS_SECRET_KEY');
  if (!secret) return json({ error: 'NOT_CONFIGURED' }, 503);

  let orderId = '', reason = '';
  try {
    ({ orderId, reason } = await req.json());
  } catch { /* 아래에서 걸린다 */ }
  reason = String(reason ?? '').trim().slice(0, 200);
  if (!orderId || !reason) return json({ error: 'MISSING' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, serviceKey);
  const { data: order } = await admin.from('orders')
    .select('id,user_id,status,provider,currency,payment_key,amount')
    .eq('id', orderId).maybeSingle();
  if (!order) return json({ error: 'ORDER_NOT_FOUND' }, 404);
  if (order.status === 'refunded') {
    return json({ ok: true, already: true, orderId, amount: order.amount });
  }
  if (order.status !== 'paid') return json({ error: 'ORDER_NOT_PAID' }, 409);
  if (order.provider !== 'toss' || order.currency !== 'KRW' || !order.payment_key) {
    return json({ error: 'WRONG_PROVIDER' }, 400);
  }

  const { data: profile } = await admin.from('profiles')
    .select('subscription_id').eq('id', order.user_id).maybeSingle();
  if (profile?.subscription_id !== order.id) {
    return json({ error: 'NOT_LATEST_ORDER' }, 409);
  }

  const basic = btoa(`${secret}:`);
  let tossBody: Record<string, unknown> = {};
  let tossOk = false;
  try {
    const r = await fetch(
      `https://api.tosspayments.com/v1/payments/${encodeURIComponent(order.payment_key)}/cancel`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/json',
          // 같은 주문을 재시도해도 토스 취소는 한 번만 실행된다.
          'Idempotency-Key': `earthus-refund-${order.id}`,
        },
        // ⚠️ 전액을 뜻하더라도 생략하지 않는다. 할인된 실제 청구액을 명시한다.
        body: JSON.stringify({ cancelReason: reason, cancelAmount: order.amount }),
      },
    );
    tossBody = await r.json();
    tossOk = r.ok;
  } catch (e) {
    return json({ error: 'PG_UNREACHABLE', detail: String(e).slice(0, 200) }, 502);
  }

  if (!tossOk) {
    return json({ error: 'PG_REFUND_FAILED', code: tossBody?.code, message: tossBody?.message }, 502);
  }

  const cancels = Array.isArray(tossBody?.cancels) ? tossBody.cancels : [];
  const canceled = cancels.reduce((sum: number, item: Record<string, unknown>) =>
    sum + Number(item?.cancelAmount ?? 0), 0);
  if (canceled < Number(order.amount)) {
    console.error('[refund] PG 응답 취소액 부족', order.id, canceled, order.amount);
    return json({ error: 'REFUND_AMOUNT_MISMATCH', orderId }, 409);
  }
  const transactionKey = String(cancels.at(-1)?.transactionKey ?? '').slice(0, 200);

  const { data: applied, error: aerr } = await admin.rpc('refund_paid_order', {
    p_order_id: order.id,
    p_refund_amount: order.amount,
    p_reason: reason,
    p_transaction_key: transactionKey || null,
  });
  if (aerr) {
    // PG 취소는 끝났지만 DB 반영이 실패했다. 같은 요청을 다시 보내면 토스는
    // 멱등키로 중복 취소하지 않고, DB 반영만 다시 시도할 수 있다.
    console.error('[refund] 취소됐으나 DB 반영 실패', order.id, aerr.message);
    return json({ error: 'APPLY_FAILED', orderId, ko:
      '환불은 처리됐지만 이용권 반영에 실패했습니다. 같은 주문으로 다시 시도해 주세요.' }, 500);
  }

  const row = Array.isArray(applied) ? applied[0] : applied;
  return json({ ok: true, orderId, amount: order.amount,
    tier: row?.tier, ends: row?.ends, already: row?.already ?? false });
});
