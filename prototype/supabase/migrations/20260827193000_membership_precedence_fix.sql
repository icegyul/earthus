-- EARTHUS 2.0 membership precedence correction
-- Paid subscription wins over invitation entitlement when both are active.
-- Existing tier remains a legacy fallback only.

create or replace function public.earthus_membership_class(p public.profiles)
returns text language sql stable as $$
  select case
    when p.subscription_ends is not null and p.subscription_ends > now() then 'paid'
    when p.manual_access_until is not null and p.manual_access_until > now() then 'invite'
    when p.tier = 'paid' then 'paid'
    else 'free'
  end;
$$;

create or replace function public.sync_profile_membership_class()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.membership_class := case
    when new.subscription_ends is not null and new.subscription_ends > now() then 'paid'
    when new.manual_access_until is not null and new.manual_access_until > now() then 'invite'
    when new.tier = 'paid' then 'paid'
    else 'free'
  end;
  return new;
end $$;

-- Recalculate existing rows once. The trigger keeps later entitlement writes synchronized.
update public.profiles p
set membership_class = public.earthus_membership_class(p)
where membership_class is distinct from public.earthus_membership_class(p);
