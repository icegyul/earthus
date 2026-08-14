-- 개인정보처리방침 사전 공고 기간을 지키는 최종 전환.
-- 2026-08-14 공고, 2026-08-21 00:00 KST 시행 전에는 DB도 새 event를 거절한다.

alter table public.analytics_events
  drop constraint if exists analytics_events_privacy_version_supported;
alter table public.analytics_events
  add constraint analytics_events_privacy_version_supported
  check (privacy_version in ('2026-08-04', '2026-08-14', '2026-08-21'));

drop policy if exists analytics_events_insert_consented on public.analytics_events;
create policy analytics_events_insert_consented on public.analytics_events
  for insert to authenticated with check (
    auth.uid() = user_id
    and now() >= timestamptz '2026-08-20 15:00:00+00'
    and privacy_version = '2026-08-21'
    and exists (
      select 1
        from public.consents c
       where c.user_id = auth.uid()
         and c.usage_agreed = true
         and c.privacy_agreed = true
         and c.over_14 = true
         and c.privacy_version = '2026-08-21'
         and c.privacy_version = analytics_events.privacy_version
         and c.id = (
           select max(c2.id) from public.consents c2 where c2.user_id = auth.uid()
         )
    )
  );
