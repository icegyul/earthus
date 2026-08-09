-- ═══════════════════════════════════════════════════════════
-- earthus — 창립 멤버 반값 자가 검증
--
-- 쓰는 법:  founding.sql 을 먼저 적용한 뒤, 이 파일을 통째로
--           Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
--           결과는 아래 Messages 탭에 PASS / FAIL 로 찍힌다.
--
-- ⚠️⚠️ **아무것도 남기지 않는다.** 전체가 하나의 거래이고 끝에서 rollback 한다.
--    시험용 사용자·사전등록 행을 만들었다가 전부 되돌린다.
--    중간에 오류가 나도 거래가 통째로 취소되므로 실서버 자료는 그대로다.
--
-- ⚠️ 이 검증을 만든 이유 — 만든 사람(Claude) 쪽에 Postgres 가 없어
--    SQL 을 실제로 돌려보지 못했다. 눈으로만 본 SQL 은 믿지 않는다.
-- ═══════════════════════════════════════════════════════════

begin;

do $$
declare
  uid    uuid := '00000000-0000-4000-8000-0000000000ff';
  mail   text := 'verify-founding-test@earthus.invalid';
  planid text;
  listp  integer;
  got    integer;
  kind   text;
  okv    boolean;
  fm     boolean;
  pass   int := 0;
  fail   int := 0;
begin
  -- ── 준비: 시험용 계정 ────────────────────────────────────
  -- ⚠️ auth.users 는 Supabase 버전마다 필수 칸이 달라 삽입이 실패할 수 있다.
  --    실패하면 검증이 통째로 안 도니까, 그때는 기존 계정을 하나 빌린다.
  --    전체가 rollback 되므로 빌려도 그 사람 자료는 그대로 남는다.
  begin
    insert into auth.users (id, email, aud, role, instance_id)
      values (uid, mail, 'authenticated', 'authenticated',
              '00000000-0000-0000-0000-000000000000');
  exception when others then
    select u.id, u.email into uid, mail from auth.users u where u.email is not null limit 1;
    if uid is null then
      raise exception '시험할 계정이 없다 — 아무 계정으로든 한 번 로그인한 뒤 다시 돌려 주세요';
    end if;
    raise notice '⚠️ 새 계정을 못 만들어 기존 계정을 빌렸다 (rollback 되므로 안전)';
  end;

  insert into public.profiles (id, email, tier, founding_member)
    values (uid, mail, 'free', false)
    on conflict (id) do update set founding_member = false;
  -- ⚠️ 빌린 계정이 이미 사전등록돼 있으면 3번이 의미 없어진다 — 먼저 비운다.
  delete from public.waitlist where email = lower(trim(mail));

  select id, krw into planid, listp
    from public.plans where active = true order by sort, id limit 1;
  if planid is null then
    raise exception '요금제가 하나도 없다 — plans 표를 먼저 넣어야 한다';
  end if;
  raise notice '기준 요금제: % (정가 %원)', planid, listp;

  -- ── 1. 창립 멤버가 아니면 정가 ───────────────────────────
  select amount, discount_kind into got, kind
    from public.price_for(uid, planid);
  if got = listp and kind is null then
    pass := pass + 1; raise notice 'PASS 1 · 일반 회원은 정가 %원', got;
  else
    fail := fail + 1; raise warning 'FAIL 1 · 일반 회원인데 %원 (%). 정가는 %원이어야 한다', got, kind, listp;
  end if;

  -- ── 2. 사전등록 안 한 이메일은 자격 없음 ─────────────────
  if public.is_founding_email('nobody-here@earthus.invalid') then
    fail := fail + 1; raise warning 'FAIL 2 · 등록도 안 한 이메일이 창립 멤버로 나온다';
  else
    pass := pass + 1; raise notice 'PASS 2 · 미등록 이메일은 자격 없음';
  end if;

  -- ── 3. 사전등록하면 자격이 생긴다 ────────────────────────
  -- ⚠️ 실제 등록 경로는 소문자로 넣는다 (auth.js). 검증도 같은 조건이어야 한다.
  insert into public.waitlist (email, marketing_agreed)
    values (lower(trim(mail)), false) on conflict (email) do nothing;

  if public.is_founding_email(mail) then
    pass := pass + 1; raise notice 'PASS 3 · 사전등록한 이메일은 자격 있음';
  else
    fail := fail + 1; raise warning 'FAIL 3 · 사전등록했는데 자격이 없다 (정원 초과? 대소문자?)';
  end if;

  -- ── 4. 대문자·공백이 섞여도 같은 사람으로 본다 ───────────
  if public.is_founding_email('  ' || upper(mail) || '  ') then
    pass := pass + 1; raise notice 'PASS 4 · 대소문자·공백 정규화됨';
  else
    fail := fail + 1; raise warning 'FAIL 4 · 대문자로 쓰면 자격을 못 찾는다';
  end if;

  -- ── 5. ⚠️ 방어벽: 본인이 직접 켤 수 없어야 한다 ──────────
  --    이게 뚫리면 누구나 평생 반값을 자기에게 준다.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  update public.profiles set founding_member = true where id = uid;

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select founding_member into fm from public.profiles where id = uid;
  if fm then
    fail := fail + 1; raise warning 'FAIL 5 ⚠️⚠️ 사용자가 직접 창립 멤버를 켰다 — 방어벽이 뚫렸다';
  else
    pass := pass + 1; raise notice 'PASS 5 · 직접 켜기는 막힘';
  end if;

  -- ── 6. claim_founding 은 본인 세션에서 통과해야 한다 ─────
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);

  okv := public.claim_founding();

  reset role;
  perform set_config('request.jwt.claims', '', true);

  select founding_member into fm from public.profiles where id = uid;
  if okv and fm then
    pass := pass + 1; raise notice 'PASS 6 · claim_founding 이 자격을 굳혔다';
  else
    fail := fail + 1;
    raise warning 'FAIL 6 ⚠️ claim_founding 반환=% 저장=% — 트리거가 되돌리고 있다', okv, fm;
  end if;

  -- ── 7. 그러면 값이 반값이어야 한다 ───────────────────────
  select amount, discount_kind into got, kind
    from public.price_for(uid, planid);
  if got = floor(listp * 0.5)::int and kind = 'founding' then
    pass := pass + 1; raise notice 'PASS 7 · 창립 멤버는 %원 (정가 %원의 반값)', got, listp;
  else
    fail := fail + 1;
    raise warning 'FAIL 7 · 창립 멤버인데 %원 (%). %원이어야 한다', got, kind, floor(listp*0.5)::int;
  end if;

  -- ── 8. ⚠️ 금액 고정이 아니라 비율 고정인가 ───────────────
  --    정가를 올렸을 때 반값이 따라 올라야 한다.
  --    안 따라오면 "평생 그 금액"으로 잘못 만든 것이고, 약속보다 더 깎아 주게 된다.
  update public.plans set krw = listp * 2 where id = planid;
  select amount into got from public.price_for(uid, planid);
  if got = floor(listp * 2 * 0.5)::int then
    pass := pass + 1; raise notice 'PASS 8 · 정가가 오르니 반값도 따라 올랐다 (%원)', got;
  else
    fail := fail + 1;
    raise warning 'FAIL 8 ⚠️ 정가를 올렸는데 값이 %원 — 비율 고정이 아니라 금액 고정으로 만들어졌다', got;
  end if;

  -- ── 9. 이미 창립 멤버면 다시 판정하지 않는다 ─────────────
  --    사전등록 행을 지워도 자격이 유지되어야 한다 (약관: 내려가지 않는다).
  delete from public.waitlist where email = lower(trim(mail));
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  okv := public.claim_founding();
  reset role;
  perform set_config('request.jwt.claims', '', true);

  select founding_member into fm from public.profiles where id = uid;
  if okv and fm then
    pass := pass + 1; raise notice 'PASS 9 · 한 번 얻은 자격은 내려가지 않는다';
  else
    fail := fail + 1; raise warning 'FAIL 9 · 자격이 사라졌다 (반환=% 저장=%)', okv, fm;
  end if;

  raise notice '───────────────────────────────';
  raise notice '   합격 %건 · 불합격 %건', pass, fail;
  -- ⚠️ Supabase Management API 는 NOTICE 를 응답에 싣지 않는다.
  --    경고만 찍으면 자동 검증에서 불합격이어도 종료코드 0으로 보이므로,
  --    정확히 9/9가 아니면 실행 자체를 실패시킨다.
  if pass <> 9 or fail <> 0 then
    raise exception '창립 멤버 검증 실패: PASS %, FAIL % (9 PASS 필요)', pass, fail;
  end if;
  if fail > 0 then
    raise notice '   ⚠️ 불합격이 있으면 SALES_OPEN 을 열지 않는다.';
  else
    raise notice '   ✓ 결제를 열어도 되는 상태 (다른 조건은 별개)';
  end if;
  raise notice '───────────────────────────────';
end $$;

-- ⚠️⚠️ 반드시 rollback. 시험용 계정·사전등록·요금제 변경을 전부 되돌린다.
rollback;
