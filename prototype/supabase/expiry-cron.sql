-- earthus — 유료 이용권 만료 스케줄
--
-- billing.sql 의 expire_subscriptions() 는 함수만 만들고 자동으로 부르지 않는다.
-- 이 파일을 적용하지 않으면 기간이 지나도 profiles.tier='paid'가 계속 남는다.
--
-- 적용: prototype/ 에서
--   supabase db query --linked --file supabase/expiry-cron.sql

create extension if not exists pg_cron with schema pg_catalog;

-- ⚠️ 여러 번 적용해도 작업이 하나만 남아야 한다. 이름으로 기존 작업을 지운 뒤
-- 같은 이름으로 다시 건다. cron 시간은 UTC, 15:17 UTC = KST 00:17 이다.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'earthus-expire-subscriptions';

select cron.schedule(
  'earthus-expire-subscriptions',
  '17 15 * * *',
  $cron$select public.expire_subscriptions();$cron$
);

-- 선택 이용행태 원 event는 보존정책(365일)을 넘기지 않는다.
-- migration에도 같은 idempotent 등록문이 있어 신규·기존 프로젝트가 동일해진다.
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'earthus-purge-expired-analytics';

select cron.schedule(
  'earthus-purge-expired-analytics',
  '37 15 * * *',
  $cron$delete from public.analytics_events where expires_at <= now();$cron$
);
