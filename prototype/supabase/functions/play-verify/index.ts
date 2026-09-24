// earthus — Google Play 구매 검증 (앱 안 선불형 기간 이용권, 2026-09-24 · 지시서 §3-3 · §3-5-3 · Phase 2)
//
// 하는 일: 앱(TWA)이 Play 결제 시트에서 받은 purchaseToken 을 Google Play Developer API 로 **다시 확인**하고,
//          상품 id · 창립 자격(profiles.founding_member) · 상태를 검사한 뒤 권한을 적고(apply_play_purchase),
//          그 다음에 acknowledge 한다(3일 안 — 안 하면 Play 가 자동 환불한다).
// 하지 않는 일: 금액을 정하지 않는다(Play 가 Console 가격을 청구한다). 클라이언트가 보낸 등급·기간을 믿지 않는다.
//
// 판정의 본체는 ../_shared/play-billing-core.js 다(node 시험: tools/earthus-v53/play-billing-core.test.mjs).
// 이 파일은 Supabase·Deno 배선만 한다.
//
// 배포 (PD — 이 세션은 배포하지 않았다)
//   cd prototype
//   supabase functions deploy play-verify
//   supabase secrets set PLAY_PACKAGE_NAME=net.earthus.app
//   supabase secrets set PLAY_SERVICE_ACCOUNT_JSON="$(cat <저장소 밖의 서비스 계정 키>.json)"
//   ⚠️ 서비스 계정 JSON 을 저장소·채팅·문서에 넣지 않는다(HANDOVER §7). secrets 에만.
//   ⚠️ SALES_ENABLED 는 checkout 과 같은 스위치다 — 'true' 가 아니면 이 함수도 닫힌다.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  createPlayApi, createServiceAccountTokenSource, verifyPlayPurchase,
} from '../_shared/play-billing-core.js';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);

  // ⚠️ 화면의 SALES_OPEN 과 별개인 서버 문 — checkout 과 같은 값(정확히 소문자 true)일 때만 연다.
  if (Deno.env.get('SALES_ENABLED') !== 'true') {
    return json({ error: 'SALES_CLOSED', ko: '유료 판매는 아직 시작하지 않았습니다.' }, 503);
  }
  const pkg = Deno.env.get('PLAY_PACKAGE_NAME') ?? '';
  const saJson = Deno.env.get('PLAY_SERVICE_ACCOUNT_JSON') ?? '';
  if (!pkg || !saJson) return json({ error: 'NOT_CONFIGURED', ko: 'Play 결제 검증이 아직 연결되지 않았습니다.' }, 503);

  const authz = req.headers.get('Authorization') ?? '';
  if (!authz.startsWith('Bearer ')) return json({ error: 'NO_AUTH' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authz } } });
  const { data: { user }, error: uerr } = await asUser.auth.getUser();
  if (uerr || !user) return json({ error: 'NO_AUTH' }, 401);

  let productId = '', purchaseToken = '';
  try { ({ productId, purchaseToken } = await req.json()); } catch { /* 아래 검사에서 걸린다 */ }

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let getToken;
  try {
    getToken = createServiceAccountTokenSource({ serviceAccount: saJson });
  } catch {
    return json({ error: 'NOT_CONFIGURED' }, 503);
  }
  const api = createPlayApi({ getToken, packageName: pkg });

  const one = async (q: PromiseLike<{ data: unknown; error: unknown }>) => {
    const { data, error } = await q;
    if (error) throw new Error('DB');
    return data;
  };
  const db = {
    getProduct: (id: string) => one(admin.from('play_products').select('*').eq('product_id', id).maybeSingle()),
    getPlan: (id: string) => one(admin.from('plans').select('id,tier,months,active').eq('id', id).maybeSingle()),
    getProfile: (uid: string) => one(admin.from('profiles')
      .select('id,tier,founding_member,subscription_ends').eq('id', uid).maybeSingle()),
    getPurchase: (token: string) => one(admin.from('play_purchases').select('*').eq('purchase_token', token).maybeSingle()),
    getGrantOwner: async (token: string) => {
      const row = await one(admin.from('play_purchases').select('user_id,status').eq('purchase_token', token).maybeSingle()) as
        { user_id: string; status: string } | null;
      return row && row.status === 'granted' ? row.user_id : null;
    },
    applyGrant: async ({ userId, token, decision }: { userId: string; token: string; decision: any }) => {
      const g = decision.grant;
      const { data, error } = await admin.rpc('apply_play_purchase', {
        p_user: userId, p_token: token, p_product: g.productId,
        p_google_order: g.googleOrderId, p_google_state: g.googleState, p_google_expiry: g.googleExpiry,
        p_linked: g.linkedPurchaseToken, p_test: g.testPurchase, p_flags: decision.flags,
      });
      if (error) throw Object.assign(new Error(error.message), { code: 'APPLY_FAILED' });
      const r = Array.isArray(data) ? data[0] : data;
      return { tier: r?.tier, ends: r?.ends };
    },
    currentEntitlement: async (uid: string) => {
      const p = await one(admin.from('profiles').select('tier,subscription_ends').eq('id', uid).maybeSingle()) as
        { tier: string; subscription_ends: string } | null;
      return { tier: p?.tier, ends: p?.subscription_ends };
    },
    recordRejection: async ({ userId, token, productId: pid, reason, flags }:
      { userId: string; token: string; productId: string; reason: string; flags: string[] }) => {
      await admin.from('play_rejections').insert({
        user_id: userId, purchase_token_hash: await sha256Hex(token), product_id: pid, reason, flags,
      });
    },
    markAcknowledged: async (token: string) => { await admin.rpc('mark_play_acknowledged', { p_token: token }); },
  };

  try {
    const r = await verifyPlayPurchase({ userId: user.id, productId, purchaseToken, api, db });
    if (!r.ok) return json({ error: r.error }, r.status);
    return json({ ok: true, tier: r.tier ?? null, ends: r.ends ?? null, already: r.already, acknowledged: r.acknowledged });
  } catch (e) {
    // ⚠️ 권한을 적지 못했으면 acknowledge 하지 않았다 — Play 가 3일 뒤 환불한다. 앱은 다음 실행에 다시 부른다.
    const msg = String((e as Error)?.message || '');
    const known = ['TOKEN_BOUND_TO_OTHER_ACCOUNT', 'FOUNDING_NOT_ELIGIBLE', 'TIER_DOWNGRADE_WHILE_ACTIVE', 'UNKNOWN_PRODUCT', 'UNKNOWN_PLAN']
      .find((k) => msg.includes(k));
    return json({ error: known ?? 'VERIFY_FAILED' }, known ? 409 : 500);
  }
});
