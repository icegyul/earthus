# Supabase production inventory — read-only public audit

> 최초 검증: 2026-08-12 KST · analytics 재검증: 2026-08-14 KST
> 범위: 비밀값 출력 없는 공개 publishable-key 경계와 analytics 한정 DB read/rollback 검증
> 상태: 운영 relation/핵심 컬럼·Edge Function·Auth·판매 잠금 확인 / analytics migration·
> FORCE RLS·policy·trigger·cron·주체 A/B 확인 / 기존 전체 policy·function version·private storage는 `UNKNOWN`

## 1. 목적과 금지 경계

PR-00의 “실제 Supabase migration/function/RLS inventory”를 코드 목록이 아니라 운영
endpoint와 대조했다. 2026-08-14에는 연결된 Supabase CLI로 analytics 범위의 migration과
DB 정의를 추가 확인했다. 기존 전체 surface와 외부 계정이 필요한 범위는 분리한다.

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
| SQL이 선언한 public table | 21 (AETHERUS 보류 6개 포함) |
| `enable row level security`를 선언한 table | 21 |
| RLS 선언이 없는 로컬 table | 0 |
| timestamp migration file | 9 |
| Edge Function directory | 6 |

이는 로컬 SQL 선언을 세었다는 뜻이지 운영 RLS policy가 전부 같다는 뜻이 아니다.

운영 migration 이력은 기존 4개와 EARTHUS analytics 4개, 총 8개가 일치한다.
AETHERUS private-data migration은 자체 카나리·실기기 gate 전이라 적용하지 않았다.

1. `20260811080000_member_invites.sql`
2. `20260811080500_member_invite_trusted_write.sql`
3. `20260811081000_refund_preserves_invite.sql`
4. `20260811090000_contentsdalur_admin.sql`
5. `20260814193000_earthus_usage_analytics.sql`
6. `20260814194500_earthus_usage_analytics_value_guard.sql`
7. `20260814200000_earthus_privacy_version_20260814.sql`
8. `20260814201500_earthus_privacy_effective_20260821.sql`

보류: `20260814090000_aetherus_private_data.sql`

`schema.sql`, `billing.sql`, `push.sql`, `founding.sql`, `refund.sql`은 timestamp migration 폴더 밖의
수동 SQL이다. 운영 column과 RPC 존재는 확인할 수 있지만, 어떤 순서·checksum으로
적용됐는지는 management/DB 접근 전에 확정하지 않는다.

## 3. 운영 relation·column evidence

기존 14개 relation은 후속 column을 포함한 `select=<columns>&limit=0`에서 HTTP 200/206,
`analytics_events`는 익명 table privilege를 회수해 HTTP 401을 반환했다.

- base: `profiles`, `consents`, `waitlist`, `feature_requests`, `reports`, `service_interest`
- billing/refund/founding: `plans`, `orders`
- push: `push_subscriptions`, `alert_spots`, `alert_sent`
- 2026-08-11 migrations: `admins`, `member_invites`, `member_access_audit`
- 2026-08-14 analytics: `consents.usage_agreed`, `analytics_events`(익명 401)
- `profiles.manual_access_*`, `orders.refund_*`, `orders.discount_*`도 column probe 통과

익명 visibility는 `plans` 2행, 기존 private relation 13개는 0행, `analytics_events`는
권한 자체를 거절했다. 0행은 “운영 데이터가
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

로컬 SQL은 21개 table 모두 RLS enable을 선언한다. 특히:

- `profiles/consents/orders/push_subscriptions/alert_spots/alert_sent`: 본인 행 경계
- `waitlist/reports/service_interest`: insert만 열고 목록 select는 열지 않음
- `member_invites/member_access_audit/admins`: 일반 브라우저 policy 없음
- `plans`: active 상품 select만 공개
- 서버 RPC는 `service_role`과 authenticated 호출을 분리

기존 table 전체 선언을 실제 policy/function ACL과 전수 대조하는 것은 아직 `UNKNOWN`이다.
다만 analytics는 `relforcerowsecurity=true`, policy 3개, 검증 trigger 1개, 익명 table privilege
0, retention cron 1개, 새 insert의 개인정보처리방침 `2026-08-21`과 시행시각
`2026-08-21 00:00 KST` 이전 차단을 운영 DB에서 확인했다. 과거 `2026-08-04`·전환 중
`2026-08-14` event는 보존기간 동안 읽기·삭제할 수 있으나 새 insert에는 쓸 수 없다.
운영 사용자는 1명뿐이어서 기존 사용자 A와
session 전용 다른 JWT 주체 B로 허용 insert·교차 select/insert 차단·금지 필드 거절·철회
삭제를 검증하고 transaction을 rollback했다.

로컬에 수치로 정의된 자동 보존·삭제는 `alert_sent` 24시간 prune과 analytics 365일 cron이다.
analytics는 동의 철회 때 본인 event 즉시 삭제와 계정 export도 운영 검증했다. 계정 삭제는
`auth.users` cascade로 profiles·consents·orders·push·alert를 지우도록 선언되어 있지만,
`feature_requests/reports/service_interest`의 user ID는 `set null`이고 본문·이메일 보존기간은
정해져 있지 않다. `consents`는 “지우지 않는다” 주석과 account deletion cascade가 충돌하므로
법적 보존기간·계정삭제 예외·비식별화 방식을 PD·법무와 승인해야 한다.

`member_access_audit`는 append-oriented이지만 retention 기간이 없다. 이는 PR-08/09의
preference·consent·reservation data를 추가해도 된다는 근거가 아니다. 그 데이터는 아직 저장하지 않는다.

## 6. 남은 운영 gate

analytics에 필요한 DB query는 Supabase CLI의 연결된 관리 세션으로 완료했다. 아래는 기존
전체 surface 또는 외부 실제 계정이 필요한 별도 운영 gate다.

1. 기존 14개 relation의 migration checksum·policy·routine ACL 전수 대조
2. AETHERUS private migration의 카나리·실기기 승인 후 적용
5. Edge Function list/version/verify_jwt·secret **이름만** inventory
6. Storage private bucket/policy·object retention·social vault encryption 설정
7. 실제 OAuth 사용자 A·B의 UI select/insert/delete 허용·차단 E2E
8. `alert_sent_prune`·`expire_subscriptions`의 실제 cron last success

test user 생성은 하지 않았다. analytics 검증 write는 한 transaction 안에서 rollback해 운영 행을 남기지 않았다.
