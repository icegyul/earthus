// earthus — Google Play 실시간 개발자 알림(RTDN) 수신 (2026-09-24 · 지시서 §3-3 (나)-1 · §3-5-4 · Phase 2)
//
// 하는 일: Play → Cloud Pub/Sub → (push) 이 함수. 환불·취소·차지백·회수가 오면 **Google 에 다시 물어서** 확인한 뒤
//          권한을 거둔다(revoke_play_purchase). acknowledge 가 빠진 구매는 마저 acknowledge 한다.
// ⚠️⚠️ 알림 본문을 믿고 행동하지 않는다 — 알림은 '이 토큰을 다시 보라'는 신호일 뿐이다(play-billing-core handleRtdn).
//      그래서 누가 이 주소로 가짜 알림을 보내도 할 수 있는 일은 '다시 확인'뿐이다.
//      그래도 문은 잠근다: Pub/Sub push 주소에 붙인 공유 비밀(?token=)이 PLAY_RTDN_TOKEN 과 같아야 한다.
//
// 배포 (PD — 이 세션은 배포하지 않았다)
//   cd prototype
//   supabase functions deploy play-rtdn --no-verify-jwt        (config.toml 에도 verify_jwt=false — Pub/Sub 는 Supabase JWT 를 못 붙인다)
//   supabase secrets set PLAY_RTDN_TOKEN=<긴 무작위 문자열>     (PLAY_PACKAGE_NAME · PLAY_SERVICE_ACCOUNT_JSON 은 play-verify 와 같다)
//   Pub/Sub 구독(push) 엔드포인트: https://<프로젝트>.supabase.co/functions/v1/play-rtdn?token=<같은 문자열>
//   ⚠️ 판매 스위치(SALES_ENABLED)와 **상관없이** 연다 — 판매를 닫은 뒤에도 이미 판 이용권의 환불은 반영돼야 한다.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  createPlayApi, createServiceAccountTokenSource, decodePubSubPush, handleRtdn, safeEqual,
} from '../_shared/play-billing-core.js';

const ok = (body: unknown = { ok: true }, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'METHOD' }, 405);
  const expect = Deno.env.get('PLAY_RTDN_TOKEN') ?? '';
  const got = new URL(req.url).searchParams.get('token') ?? '';
  if (!expect || !safeEqual(got, expect)) return ok({ error: 'FORBIDDEN' }, 403);

  const pkg = Deno.env.get('PLAY_PACKAGE_NAME') ?? '';
  const saJson = Deno.env.get('PLAY_SERVICE_ACCOUNT_JSON') ?? '';
  // ⚠️ 설정이 없으면 500 을 돌려 Pub/Sub 가 다시 보내게 한다(알림을 삼키지 않는다).
  if (!pkg || !saJson) return ok({ error: 'NOT_CONFIGURED' }, 500);

  let body: unknown = null;
  try { body = await req.json(); } catch { return ok({ ignored: 'BAD_JSON' }); }   // 형식이 틀린 것은 재전송해도 같다 — 200
  const note = decodePubSubPush(body);
  if (!note) return ok({ ignored: 'NO_DATA' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const api = createPlayApi({ getToken: createServiceAccountTokenSource({ serviceAccount: saJson }), packageName: pkg });
  const db = {
    getPurchase: async (token: string) => {
      const { data, error } = await admin.from('play_purchases').select('*').eq('purchase_token', token).maybeSingle();
      if (error) throw new Error('DB');
      return data;
    },
    revokeGrant: async ({ token, reason }: { token: string; reason: string }) => {
      const { data, error } = await admin.rpc('revoke_play_purchase', { p_token: token, p_reason: reason });
      if (error) throw new Error('REVOKE_FAILED');
      const r = Array.isArray(data) ? data[0] : data;
      return { tier: r?.tier, ends: r?.ends };
    },
    markAcknowledged: async (token: string) => { await admin.rpc('mark_play_acknowledged', { p_token: token }); },
  };

  try {
    const r = await handleRtdn({ note, api, db, packageName: pkg });
    // ⚠️ 토큰·사용자를 응답·로그에 싣지 않는다. 결과 종류만.
    console.info('[play-rtdn]', r.done, r.reason ?? '');
    return ok({ ok: true, done: r.done });
  } catch (e) {
    console.warn('[play-rtdn] 실패 — Pub/Sub 가 다시 보낸다', String((e as Error)?.message || ''));
    return ok({ error: 'RETRY' }, 500);
  }
});
