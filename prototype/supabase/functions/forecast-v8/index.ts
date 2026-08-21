// EARTHUS v8 — Earthus 자체 예보 전용 응답 경계.
//
// 공식 관측·공식 예보·공식 경보는 이 함수의 대상이 아니다. 기존 공개 경로에 남긴다.
// 이 함수는 Earthus가 융합·보정·판단해 만든 결과만 다루며, 로그인 + 유효한 서버 이용권을
// 모두 통과한 사용자에게만 private/no-store 응답으로 보낸다.
//
// ⚠️ 브라우저의 tier, FREE_OPEN, SALES_OPEN 값을 믿지 않는다.
// ⚠️ RELEASED와 5개 release gate를 통과하지 않은 출력은 한 바이트도 보내지 않는다.
// ⚠️ 배포 전 migration 적용과 shadow 검증이 끝나지 않았으면 503이 정상이다.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleForecastV8Request } from '../_shared/forecast-v8-policy.js';

const origin = Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net';

Deno.serve(async (request) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const admin = () => {
    if (!url || !serviceKey) throw new Error('FORECAST_SERVER_NOT_CONFIGURED');
    return createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  };

  return handleForecastV8Request(request, {
    origin,
    now: () => new Date().toISOString(),

    async authenticate(token: string) {
      if (!url || !anonKey) throw new Error('FORECAST_SERVER_NOT_CONFIGURED');
      const anon = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: { user }, error } = await anon.auth.getUser(token);
      return error || !user ? null : { id: user.id };
    },

    async loadProfile(subjectId: string) {
      const { data, error } = await admin().from('profiles')
        .select('tier,subscription_ends,manual_access_until')
        .eq('id', subjectId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async loadReleasedForecast(now: string, scope: string) {
      const { data, error } = await admin().from('earthus_forecast_revisions')
        .select('id,scope_key,schema_version,data_class,access_class,release_state,sample_gate,skill_gate,freshness_gate,rights_gate,rollback_gate,issued_at,valid_from,valid_until,published_at,source_refs,outputs')
        .eq('scope_key', scope)
        .eq('release_state', 'RELEASED')
        .eq('sample_gate', true)
        .eq('skill_gate', true)
        .eq('freshness_gate', true)
        .eq('rights_gate', true)
        .eq('rollback_gate', true)
        .lte('valid_from', now)
        .gt('valid_until', now)
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    onError(error: unknown) {
      // 토큰·원본 데이터·예보 payload는 로그에 남기지 않는다.
      console.error('[forecast-v8]', error instanceof Error ? error.message : 'UNKNOWN');
    },
  });
});
