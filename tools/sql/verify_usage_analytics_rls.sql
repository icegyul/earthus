-- 운영 Supabase 선택 이용행태 A/B 검증.
-- 기존 auth 사용자 ID는 출력하지 않고 session-local claim으로만 사용한다.
-- 두 번째 auth 사용자가 아직 없으면 DB session에만 존재하는 별도 JWT 주체 UUID를 쓴다.
-- 모든 insert/delete는 마지막 ROLLBACK으로 되돌려 운영 데이터를 남기지 않는다.

begin;

do $$
begin
  if (select count(*) from auth.users) < 1 then
    raise exception 'USAGE_ANALYTICS_REQUIRES_ONE_EXISTING_USER';
  end if;
end;
$$;

select set_config('earthus.test_user_a', (select id::text from auth.users order by id limit 1), true);
select set_config('earthus.test_user_b', coalesce(
  (select id::text from auth.users order by id offset 1 limit 1),
  gen_random_uuid()::text
), true);

-- A: 최신 사용 동의 후 허용 event 한 건을 넣을 수 있다.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('earthus.test_user_a'), 'role', 'authenticated'
)::text, true);
set local role authenticated;

insert into public.consents (
  user_id, tos_agreed, privacy_agreed, over_14, marketing_agreed,
  location_agreed, usage_agreed, tos_version, privacy_version, agreed_at
) values (
  auth.uid(), true, true, true, false, false, true,
  '2026-08-04', '2026-08-21', now()
);

do $$
begin
  if now() < timestamptz '2026-08-20 15:00:00+00' then
    begin
      insert into public.analytics_events (
        event_id, user_id, event_name, occurred_at, session_pseudonym,
        consent_version, privacy_version, catalog_version, retention_version, surface, properties
      ) values (
        gen_random_uuid(), auth.uid(), 'layer.selected', now(), repeat('a', 32),
        'earthus.usage-consent.v1', '2026-08-21', 'earthus.analytics.v1',
        'earthus.analytics-retention.365d.v1', 'earth',
        '{"layerId":"tpw","state":"ON","sourceStatusClass":"HEALTHY"}'::jsonb
      );
      raise exception 'USAGE_ANALYTICS_PRE_EFFECTIVE_INSERT_WAS_ACCEPTED';
    exception when others then
      if sqlerrm = 'USAGE_ANALYTICS_PRE_EFFECTIVE_INSERT_WAS_ACCEPTED' then raise; end if;
    end;
  else
    insert into public.analytics_events (
      event_id, user_id, event_name, occurred_at, session_pseudonym,
      consent_version, privacy_version, catalog_version, retention_version, surface, properties
    ) values (
      gen_random_uuid(), auth.uid(), 'layer.selected', now(), repeat('a', 32),
      'earthus.usage-consent.v1', '2026-08-21', 'earthus.analytics.v1',
      'earthus.analytics-retention.365d.v1', 'earth',
      '{"layerId":"tpw","state":"ON","sourceStatusClass":"HEALTHY"}'::jsonb
    );
  end if;
end;
$$;

reset role;

-- 시행 전에는 RLS가 막으므로, 이후 select/trigger/delete 검증용 한 행만 transaction 안에
-- 관리 세션으로 만든다. JWT claim은 계속 A라 trigger의 principal 검증은 우회하지 않는다.
do $$
begin
  if (select count(*) from public.analytics_events) = 0 then
    insert into public.analytics_events (
      event_id, user_id, event_name, occurred_at, session_pseudonym,
      consent_version, privacy_version, catalog_version, retention_version, surface, properties
    ) values (
      gen_random_uuid(), current_setting('earthus.test_user_a')::uuid,
      'layer.selected', now(), repeat('a', 32), 'earthus.usage-consent.v1', '2026-08-21',
      'earthus.analytics.v1', 'earthus.analytics-retention.365d.v1', 'earth',
      '{"layerId":"tpw","state":"ON","sourceStatusClass":"HEALTHY"}'::jsonb
    );
  end if;
end;
$$;

do $$
begin
  if (select count(*) from public.analytics_events) <> 1 then
    raise exception 'USAGE_ANALYTICS_A_INSERT_FAILED';
  end if;
  begin
    insert into public.analytics_events (
      event_id, user_id, event_name, occurred_at, session_pseudonym,
      consent_version, privacy_version, catalog_version, retention_version, surface, properties
    ) values (
      gen_random_uuid(), auth.uid(), 'layer.selected', now(), repeat('b', 32),
      'earthus.usage-consent.v1', '2026-08-21', 'earthus.analytics.v1',
      'earthus.analytics-retention.365d.v1', 'earth',
      '{"layerId":"tpw","state":"ON","latitude":37.5}'::jsonb
    );
    raise exception 'USAGE_ANALYTICS_FORBIDDEN_FIELD_WAS_ACCEPTED';
  exception
    when others then
      if sqlerrm = 'USAGE_ANALYTICS_FORBIDDEN_FIELD_WAS_ACCEPTED' then raise; end if;
      if position('ANALYTICS_PROPERTY_NOT_ALLOWED' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

-- B: A의 행을 볼 수 없고 A의 user_id로 insert할 수도 없다.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('earthus.test_user_b'), 'role', 'authenticated'
)::text, true);
set local role authenticated;

do $$
begin
  if (select count(*) from public.analytics_events) <> 0 then
    raise exception 'USAGE_ANALYTICS_CROSS_USER_SELECT_LEAK';
  end if;
  begin
    insert into public.analytics_events (
      event_id, user_id, event_name, occurred_at, session_pseudonym,
      consent_version, privacy_version, catalog_version, retention_version, surface, properties
    ) values (
      gen_random_uuid(), current_setting('earthus.test_user_a')::uuid,
      'app.opened', now(), repeat('c', 32), 'earthus.usage-consent.v1', '2026-08-21',
      'earthus.analytics.v1', 'earthus.analytics-retention.365d.v1', 'earth',
      '{"locale":"ko","viewportBucket":"DESKTOP","entryKind":"DIRECT"}'::jsonb
    );
    raise exception 'USAGE_ANALYTICS_CROSS_USER_INSERT_WAS_ACCEPTED';
  exception
    when others then
      if sqlerrm = 'USAGE_ANALYTICS_CROSS_USER_INSERT_WAS_ACCEPTED' then raise; end if;
  end;
end;
$$;

reset role;

-- A: 최신 동의를 false로 바꾼 뒤 철회 RPC가 기존 event를 지운다.
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('earthus.test_user_a'), 'role', 'authenticated'
)::text, true);
set local role authenticated;

insert into public.consents (
  user_id, tos_agreed, privacy_agreed, over_14, marketing_agreed,
  location_agreed, usage_agreed, tos_version, privacy_version, agreed_at
) values (
  auth.uid(), true, true, true, false, false, false,
  '2026-08-04', '2026-08-21', now()
);

select public.earthus_withdraw_usage_consent();

do $$
begin
  if (select count(*) from public.analytics_events) <> 0 then
    raise exception 'USAGE_ANALYTICS_WITHDRAW_DELETE_FAILED';
  end if;
end;
$$;

reset role;
rollback;

select json_build_object(
  'allowedInsert', now() >= timestamptz '2026-08-20 15:00:00+00',
  'preEffectiveBlocked', now() < timestamptz '2026-08-20 15:00:00+00',
  'forbiddenFieldRejected', true,
  'crossUserSelectBlocked', true,
  'crossUserInsertBlocked', true,
  'withdrawDelete', true,
  'productionRowsChanged', false
) as usage_analytics_rls_verification;
