# 창립 멤버 500 — 만들어야 할 것

작성 2026-08-06 · 판단·검수 Claude / 제작 Codex

---

## 0. 지금 상태 한 줄

**코드까지 만들었다. 다만 아직 DB 에 적용되지 않았다.** (2026-08-06 갱신)

- 화면: 사전등록에 "창립 멤버 500명 — 언제나 정가의 반값" 표시 중 (라이브)
- 약관: 제2조 제6항 · 제8조 제7항에 명시 (2026-08-06 개정, 라이브)
- 코드: `supabase/founding.sql` · `functions/checkout/index.ts` · `js/auth.js` — **작성 완료**
- 적용: ⬜ `founding.sql` 미적용 · ☑ `checkout` 배포 (`SALES_ENABLED=false`, 2026-08-09 운영 응답 확인)

⚠️ `SALES_OPEN=true` 전에 적용과 검증이 끝나야 한다.
안 되어 있으면 결제창에서 창립 멤버가 **정가를 낸다.** 그건 약관 위반이다.
⚠️ 만든 쪽에 Postgres·Deno 가 없어 **실행 검증은 못 했다.**
`supabase/founding-verify.sql` 을 붙여넣으면 9가지를 스스로 PASS/FAIL 로 찍는다.
작업 경위는 [`WORK-2026-08-06.md`](WORK-2026-08-06.md).

---

## 1. 약속의 정확한 내용

받은 결정 (2026-08-06, PD):
> "평생 가격 고정 + 50% 할인, 선착순 500명"

약관에 적힌 대로 다시 쓰면:

| 항목 | 값 |
|---|---|
| 대상 | 사전등록 **선착순 500명** |
| 순번 기준 | `waitlist.created_at` 오름차순 |
| 할인 | **그 시점 정가의 50%** |
| 값이 오르면 | **오른 정가의 50%** (금액 고정이 아니라 **비율 고정**) |
| 횟수·기간 | 제한 없음. 결제할 때마다 적용 |
| 유효 기간 | 서비스가 운영되는 동안 |
| 불리한 변경 | 이미 창립 멤버가 된 사람에게는 적용하지 않는다 (약관 제8조 제7항) |

⚠️ **금액 고정이 아니라 비율 고정이다.** 이걸 헷갈리면
정가가 오른 뒤 창립 멤버가 옛 금액을 내게 되고, 그건 약속보다 **더 많이** 깎아 주는 것이다.

---

## 2. 만들 것

### 2-1. 창립 멤버 판정 (서버)

지금 `profiles.founding_member` 칸은 있는데 **아무도 채우지 않는다.**

```sql
-- ⚠️ 클라이언트가 정하면 안 된다. 브라우저에서 true 로 바꿔 보내면 끝이다.
create or replace function public.is_founding_email(p_email text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from (
      select email, row_number() over (order by created_at, id) as rn
      from public.waitlist
    ) t
    where t.email = lower(trim(p_email)) and t.rn <= 500   -- ⚠️ 500 은 약관에 적힌 수다
  );
$$;
```

⚠️ `row_number()` 를 쓰는 이유 — `created_at` 이 같은 행이 있을 수 있다.
그때 순번이 흔들리면 501번째가 들어오거나 500번째가 빠진다. `id` 로 마지막을 끊는다.

로그인할 때 이메일이 맞으면 `profiles.founding_member = true` 로 굳힌다.
**한 번 true 가 된 사람은 다시 false 로 내리지 않는다** — 약관에 그렇게 적었다.

### 2-2. 결제 금액에 반영 (서버)

⚠️⚠️ **`billing.js` 에서 깎으면 안 된다.** 거기 값은 화면 표시용이고,
금액의 정본은 `plans` 표다. `checkout` 함수가 planId 만 받고 금액은 DB 에서 찾는다.
할인도 **같은 자리**에서 해야 한다.

```
checkout 함수 안:
  1. 토큰에서 uid 를 꺼낸다 (요청 본문의 uid 를 믿지 않는다)
  2. profiles.founding_member 를 읽는다
  3. true 면 plans 의 금액에 0.5 를 곱한다 (원 단위 절사)
  4. orders 에 discount_kind='founding', discount_rate=0.5 를 남긴다
```

⚠️ `orders` 에 할인 근거를 남기지 않으면 나중에 왜 반값이었는지 아무도 모른다.
환불 계산할 때도 필요하다.

### 2-3. 정원 마감 처리

- 501번째부터는 사전등록은 **되지만** 창립 멤버가 아니다
- 화면은 이미 그렇게 말한다 — `wl.seatsFull`:
  "창립 멤버 자리가 모두 찼습니다. 등록해 두시면 열리는 날 함께 연락드립니다."
- ⚠️ 등록 자체를 막지 않는다. 사전등록은 계속 받아야 한다

### 2-4. 계정 화면

`accBadge`(✦ 창립 멤버)는 이미 있고 `auth.isFounding()` 이 그린다.
`profiles.founding_member` 만 채워지면 자동으로 붙는다. **추가 작업 없음.**

---

## 3. 이미 되어 있는 것 (다시 만들지 말 것)

| | 어디 | 상태 |
|---|---|---|
| 남은 자리 세기 | `waitlist_count()` RPC + `auth.js waitlist.progress()` | ✅ 2026-08-06 고침 |
| 남은 자리 표시 | `index.html #wlSeats` + `ui-account.js waitlistUI.init()` | ✅ |
| 못 세면 안 보이기 | `progress()` 가 null → 줄 자체를 감춤 | ✅ |
| 배지 표시 | `accBadge` + `auth.isFounding()` | ✅ |
| 약관 조항 | `legal/terms.ko.md` 제2조 제6항 · 제8조 제7항 | ✅ |
| 정원 값 | `CONFIG.FOUNDING_SEATS = 500` | ✅ |

⚠️ **`waitlist` 를 `select` 로 세지 말 것.** RLS 가 읽기를 막아서
오류도 없이 **항상 0** 이 나온다. 실제로 1명 있는데 0 이 나오고 있었다 (2026-08-06 발견).
반드시 `waitlist_count()` RPC 를 쓴다.

---

## 4. 막고 있는 것 (PD)

- [ ] **`waitlist` 테스트 행 1건 삭제** — 지금 이 행이 창립 멤버 1번 자리를 차지하고 있다.
      화면에 "499자리 남음"으로 나온다. `docs/build-order.md` 에도 적혀 있던 항목이다.
- [ ] 정가 확정 — 반값의 기준이다. 지금 `billing.js` 는 월 ₩5,900 / 연 ₩49,000 이지만
      Windy Premium 이 연 $24.99(약 35,000원)라 재검토 중이었다.
      ⚠️ 화면에는 일부러 숫자를 안 적었다. "정가의 반값"이라 정가가 바뀌어도 문구가 안 틀린다.
- [ ] 통신판매업 신고 · Open-Meteo 상업 이용조건 (기존 항목)

---

## 5. 검수할 때 볼 것

- [ ] 창립 멤버로 로그인해 결제창을 열면 **정가의 절반**이 뜨는가
- [ ] 브라우저에서 `founding_member` 를 true 로 조작해 보내면 **서버가 무시**하는가
- [ ] `plans` 의 정가를 올린 뒤 창립 멤버 금액이 **오른 값의 절반**으로 따라오는가
      (금액이 그대로면 비율 고정이 아니라 금액 고정으로 잘못 만든 것이다)
- [ ] 501번째 등록자가 창립 멤버가 **아닌가**
- [ ] `orders` 에 할인 근거가 남는가
- [ ] `waitlist_count()` 가 막히면 남은 자리 줄이 **사라지는가** (0 이나 500 이 뜨면 안 된다)
