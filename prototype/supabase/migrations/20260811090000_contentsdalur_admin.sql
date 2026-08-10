-- 운영자가 지정한 관리자 계정. 이메일은 auth.users에서 서버가 찾아 UID로 고정한다.
create table if not exists public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz default now()
);
alter table public.admins enable row level security;
insert into public.admins(id,note)
select id,'contentsdalur 운영 관리자' from auth.users
 where lower(email)='contentsdalur@gmail.com'
on conflict(id) do update set note=excluded.note;
