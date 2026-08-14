-- EARTHUS 개인정보처리방침 2026-08-14 전환.
-- 과거 2026-08-04 동의 아래 적법하게 남은 event는 보존기간 동안 유지하되,
-- 새 insert는 최신 방침과 그 방침에 대한 최신 선택 동의만 허용한다.

alter table public.analytics_events
  drop constraint if exists analytics_events_privacy_version_current;
alter table public.analytics_events
  add constraint analytics_events_privacy_version_supported
  check (privacy_version in ('2026-08-04', '2026-08-14'));

drop policy if exists analytics_events_insert_consented on public.analytics_events;
create policy analytics_events_insert_consented on public.analytics_events
  for insert to authenticated with check (
    auth.uid() = user_id
    and privacy_version = '2026-08-14'
    and exists (
      select 1
        from public.consents c
       where c.user_id = auth.uid()
         and c.usage_agreed = true
         and c.privacy_agreed = true
         and c.over_14 = true
         and c.privacy_version = '2026-08-14'
         and c.privacy_version = analytics_events.privacy_version
         and c.id = (
           select max(c2.id) from public.consents c2 where c2.user_id = auth.uid()
         )
    )
  );
