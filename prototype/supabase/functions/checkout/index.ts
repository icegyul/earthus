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
//   supabase secrets set TOSS_CLIENT_KEY=... APP_ORIGIN=https://earthus.net
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

  // ── 4. 주문 기록 ─────────────────────────────────────────
  const id = orderId();
  const { error: oerr } = await admin.from('orders').insert({
    id, user_id: user.id, plan_id: planId, krw: plan.krw, provider: 'toss',
  });
  if (oerr) return json({ error: 'ORDER_FAILED', detail: oerr.message }, 500);

  const origin = Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net';
  return json({
    orderId: id,
    // ⚠️ 금액을 함께 돌려주지만, 승인 때 **다시 DB 와 대조**한다.
    //    여기 값을 신뢰해서 승인하면 중간에 바꿔치기할 수 있다.
    amount: plan.krw,
    orderName: plan.name_ko,
    clientKey,                                   // ⚠️ 공개 키다. 시크릿 키가 아니다.
    customerEmail: user.email ?? undefined,
    successUrl: `${origin}/pay-return.html?r=ok`,
    failUrl: `${origin}/pay-return.html?r=fail`,
  });
});
