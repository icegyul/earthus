// earthus — 내 등급 (v2 서버 판정, 2026-09-24 · 지시서 §3-5-1 · Phase 2 완료 기준 6)
//
// 하는 일: 로그인한 사용자의 JWT 로 earthus_my_entitlement() 를 불러 {tier, ends, signedIn} 을 돌려준다.
// 왜 함수인가: v2(Intelligence) 에는 Supabase anon 키·클라이언트가 없다(계정은 v1 에만 있다 — v2 main.js '계정은 EARTHUS(v1)에만').
//   v2 는 같은 출처 localStorage 의 Supabase 세션에서 접근 토큰만 꺼내 이 주소로 보낸다. 등급은 **서버가** 정한다.
// ⚠️ 판매 스위치와 상관없이 연다 — 읽기 전용이고, 본인 것만 돌려준다.
//
// 배포 (PD):  cd prototype && supabase functions deploy entitlement
//   (config.toml verify_jwt=true — 게이트웨이가 JWT 서명을 먼저 본다)

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const authz = req.headers.get('Authorization') ?? '';
  if (!authz.startsWith('Bearer ')) return json({ tier: 'free', signedIn: false });
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authz } },
  });
  const { data, error } = await asUser.rpc('earthus_my_entitlement');
  // ⚠️ 판정하지 못하면 FREE 다 — 모르면서 유료라고 하지 않는다. 화면은 이 응답이 없을 때도 FREE 로 떨어진다.
  if (error || !data || typeof data !== 'object') return json({ tier: 'free', error: 'ENTITLEMENT_UNAVAILABLE' }, 503);
  return json(data);
});
