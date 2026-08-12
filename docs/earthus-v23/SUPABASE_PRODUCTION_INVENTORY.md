# Supabase production inventory — read-only public audit

> 검증일: 2026-08-12 KST
> 범위: 비밀값 출력 없는 공개 publishable-key 경계
> 상태: relation/핵심 컬럼·Edge Function endpoint·Auth·판매 잠금 확인 /
> remote migration checksum·`pg_policies`·function version·private storage는 `UNKNOWN`

## 1. 목적과 금지 경계

PR-00의 “실제 Supabase migration/function/RLS inventory”를 코드 목록이 아니라 운영
endpoint와 대조했다. 다만 현재 환경에는 Supabase Management API access token과 DB
자격증명이 없다. 그러므로 공개 자격으로 확정할 수 있는 범위와 할 수 없는
범위를 분리했다.

`tools/audit_supabase_public.mjs`는 다음만 한다.

- gitignore 운영 config의 project URL·publishable key를 메모리로만 읽기
- 알려진 relation의 핵심 컬럼을 `GET ...?limit=0`로 대조
- Auth settings·익명 Storage bucket visibility·Edge Function OPTIONS 확인
- 빈 POST로 인증·판매 잠금에서 멈추는지 확인

테이블 행, 이메일, token, URL key, service role, secret 이름·값을 출력하지 않는다.
회원 생성·로그인·DB write·migration·결제·환불·push·SNS 게시를 수행하지 않는다.

```bash
node tools/audit_supabase_public.mjs > /tmp/earthus-supabase-public-audit.json
```

`config.local.js`가 없는 CI에서는 실패하는 것이 정상이다. 공개 key를 저장소에 복사하지 않는다.

## 2. 로컬 선언 inventory

| 항목 | 확인 |
|---|---:|
| SQL이 선언한 public table | 14 |
| `enable row level security`를 선언한 table | 14 |
| RLS 선언이 없는 로컬 table | 0 |
| timestamp migration file | 4 |
| Edge Function directory | 6 |

이는 로컬 SQL 선언을 세었다는 뜻이지 운영 RLS policy가 같다는 뜻이 아니다.

로컬 timestamp migration은 다음 4개다.

1. `20260811080000_member_invites.sql`
2. `20260811080500_member_invite_trusted_write.sql`
3. `20260811081000_refund_preserves_invite.sql`
4. `20260811090000_contentsdalur_admin.sql`

`schema.sql`, `billing.sql`, `push.sql`, `founding.sql`, `refund.sql`은 timestamp migration 폴더 밖의
수동 SQL이다. 운영 column과 RPC 존재는 확인할 수 있지만, 어떤 순서·checksum으로
적용됐는지는 management/DB 접근 전에 확정하지 않는다.

## 3. 운영 relation·column evidence

알려진 14개 relation에 대해 후속 column을 포함한 `select=<columns>&limit=0`이 모두
HTTP 200/206을 반환했다.

- base: `profiles`, `consents`, `waitlist`, `feature_requests`, `reports`, `service_interest`
- billing/refund/founding: `plans`, `orders`
- push: `push_subscriptions`, `alert_spots`, `alert_sent`
- 2026-08-11 migrations: `admins`, `member_invites`, `member_access_audit`
- `profiles.manual_access_*`, `orders.refund_*`, `orders.discount_*`도 column probe 통과

익명 visibility는 `plans` 2행, 나머지 13 relation 0행이었다. 0행은 “운영 데이터가
없다”가 아니라 “이 publishable key로 보이는 행이 0”이다. RLS로 숨긴 행 수를
추론하지 않는다.

PostgREST root OpenAPI는 publishable key에 `401 Secret API key required`를 반환했다.
따라서 공개 key로 스키마 전체를 enumerate했다고 기록하지 않는다.

## 4. Edge Function·Auth fail-closed evidence

| function | no credential | publishable key only | 판정 |
|---|---:|---:|---|
| checkout | 401 | 503 `SALES_CLOSED` | 서버 판매 잠금 유지 |
| payment-confirm | 401 | 401 `NO_AUTH` | 회원 인증 전 승인 불가 |
| payment-refund | 401 | 403 `FORBIDDEN` | publishable key로 환불 불가 |
| push-tick | 403 | 403 `forbidden` | tick token 없이 실행 불가 |
| social-admin | 401 | 401 `NO_AUTH` | 인증 전 자격증명·게시 불가 |
| member-admin | 401 | 401 `NO_AUTH` | 인증 전 회원 정보·자격 변경 불가 |

`checkout` 503은 결제 provider를 시도하지 않고 함수 첫 server gate에서 멈춘 결과다.
`SALES_OPEN=false`의 화면 잠금과 별개로 `SALES_ENABLED` 서버 잠금이 실제로 닫혀 있다.

Auth settings은 운영 endpoint 200, signup enabled, mail/phone auto-confirm off, Google external
provider enabled로 응답했다. 이는 provider endpoint setting이지 실제 Google 로그인 E2E
성공 증거는 아니다.

익명 Storage bucket list는 200·0개였다. private bucket의 존재·policy를 없다고 판단하지 않는다.

## 5. 로컬 RLS·retention 계약

로컬 SQL은 14개 table 모두 RLS enable을 선언한다. 특히:

- `profiles/consents/orders/push_subscriptions/alert_spots/alert_sent`: 본인 행 경계
- `waitlist/reports/service_interest`: insert만 열고 목록 select는 열지 않음
- `member_invites/member_access_audit/admins`: 일반 브라우저 policy 없음
- `plans`: active 상품 select만 공개
- 서버 RPC는 `service_role`과 authenticated 호출을 분리

이 선언을 실제 `pg_policies`, table `relrowsecurity/relforcerowsecurity`, function ACL로
전수 대조하는 것은 아직 `UNKNOWN`이다. 익명 0행만으로 RLS 정의가 일치한다고
주장하지 않는다.

로컬에 수치로 정의된 자동 보존·삭제는 `alert_sent` 24시간 prune 하나다. 계정 삭제는
`auth.users` cascade로 profiles·consents·orders·push·alert를 지우도록 선언되어 있지만,
`feature_requests/reports/service_interest`의 user ID는 `set null`이고 본문·이메일 보존기간은
정해져 있지 않다. `consents`는 “지우지 않는다” 주석과 account deletion cascade가 충돌하므로
법적 보존기간·계정삭제 예외·비식별화 방식을 PD·법무와 승인해야 한다.

`member_access_audit`는 append-oriented이지만 retention 기간이 없다. 이는 PR-08/09의
preference·consent·reservation data를 추가해도 된다는 근거가 아니다. 그 데이터는 아직 저장하지 않는다.

## 6. 남은 운영 gate

Management API token 또는 읽기 전용 DB 접근으로 다음 query를 실행하기 전에는
PR-00 Supabase inventory를 **부분 완료**로 둔다.
연결 브라우저로 project dashboard를 열었지만 sign-in으로 redirect되어 기존 관리
세션도 없었다. 로그인·비밀번호·SSO를 시도하지 않았다.

1. `supabase_migrations.schema_migrations`: version·checksum·local diff
2. `pg_tables`/`pg_class`: `rowsecurity`·`relforcerowsecurity`
3. `pg_policies`: role·command·using·with_check 정확 대조
4. `information_schema.routine_privileges`: security definer RPC ACL 전수 대조
5. Edge Function list/version/verify_jwt·secret **이름만** inventory
6. Storage private bucket/policy·object retention·social vault encryption 설정
7. 익명 A·인증 tenant A·tenant B의 select/insert/update/delete 허용·차단 E2E
8. `alert_sent_prune`·`expire_subscriptions`의 실제 cron/schedule·last success

운영 데이터를 바꾸는 migration·policy 보정·test user 생성은 이 read-only audit의 범위가 아니다.
