# EARTHUS V2 — PRODUCTION BLOCKER (INTEGRATION-10)

```text
STATUS:  BLOCKED_NO_DELETE_PERMISSION  +  BUNDLE_BLOCKED_OTHER_SESSION
DATE:    2026-09-08
PARENT:  cac73114
```

블로커는 둘이고 **둘 다 이 세션이 풀 수 없다.** 하나는 IAM 권한, 하나는 다른 사람의 커밋이다.

| | 무엇 | 필요한 것 | 누가 |
|---|---|---|---|
| A | 공개 금지 객체 95건 삭제 | `s3:DeleteObject` | AWS 관리자 |
| B | SOURCE = DEPLOY | `PopMetricMenu` 커밋 | 다른 세션 |

---

## A. 공개 금지 객체 95건

### ⚠️ 먼저 — 이게 무엇인지 지금까지 너무 약하게 적혀 있었다

앞 단계들은 "DB 스키마·마이그레이션"이라고만 적었다. 실제 구성은 이렇다.

```text
.sql  34   스키마·마이그레이션 (RBAC · 결제 · 환불 · 초대 · 개인정보 버전 · 소셜 자격증명)
.ts   15   Supabase Edge Function **서버 소스**
.md   13   저장소 안쪽 문서
.js   12   QA 하네스 · 개발 설정 서식 · 정책 모듈
그 밖  21   supabase/.temp · config.toml · 옛 파노라마 · 카나리 산출물 · devserver.py
```

`.ts` 15건 — 전부 익명 200 으로 실측 확인:

```text
app/v2/supabase/functions/checkout/index.ts
app/v2/supabase/functions/payment-confirm/index.ts
app/v2/supabase/functions/payment-refund/index.ts
app/v2/supabase/functions/member-admin/index.ts
app/v2/supabase/functions/social-admin/index.ts
app/v2/supabase/functions/push-tick/index.ts
app/v2/supabase/functions/forecast-v8/index.ts
app/v2/supabase/functions/research-report-detail/index.ts
app/v2/supabase/functions/research-report-jobs/index.ts
app/v2/supabase/functions/_shared/admin-access.ts
app/v2/supabase/functions/_shared/member-admin-handler.ts
app/v2/supabase/functions/_shared/social-credentials.ts
app/v2/supabase/functions/_shared/social-comments.ts
app/v2/supabase/functions/_shared/social-platform-status.ts
app/v2/supabase/functions/_shared/social-workflow.ts
```

### 자격증명은 없다 — 과장하지 않는다

표본을 받아 `sk_live_` · `service_role_key` · JWT(`eyJ…`) · `AKIA…` 를 훑었고 **0건**이다.
`social-credentials.ts` 는 값이 아니라 vault 추상화(readVault/writeVault)를 쓴다.
`app/supabase/schema.sql` 은 이미 46바이트 비석("삭제 예정 파일입니다. 내용 없음.")이다.

**키 유출이 아니라 설계·공격면 노출이다** — 결제·환불·관리자 접근 제어의 서버 로직,
RPC 이름, vault 경로 규칙, 테이블·함수 서명, RLS 정책 구조.
그래도 공개돼 있을 이유가 없고, 지워야 한다.

### 권한 확인

존재하지 않는 키로 시험했다 — **운영 파일을 먼저 지워서 확인하지 않았다.**

```text
identity: arn:aws:iam::294951922100:user/earthus-deploy

aws s3api delete-object --bucket earthus-cache-kr \
  --key "_integration10-permission-probe/does-not-exist.txt"

→ AccessDenied: User ... is not authorized to perform: s3:DeleteObject
  ... because no identity-based policy allows the s3:DeleteObject action
```

접두사별 예외가 아니라 정책에 아예 없다.
`PutObject` 는 되지만 빈 파일로 덮는 우회는 **쓰지 않는다** — 금지된 방식이고,
덮어도 객체는 남아 200 을 돌려주므로 `LIVE_FORBIDDEN = 0` 을 만족시키지도 못한다.

### 지우면 안 되는 것 — EXEMPT_PRODUCT_PATH 4건

```text
app/v3/data/audit-trench-bathymetry.py
app/v3/data/prepare-bathymetry.py
app/v3/data/prepare-ocean-trenches.py
app/v3/data/trench-bathymetry-audit.json
```

부류로는 걸리지만 운영 제품 경로다. 삭제 명령에 넣지 않았다.

### 어떻게 푸나

명령은 [integration-10-cleanup-command.txt](integration-10-cleanup-command.txt) 에
**키를 하나씩 지정해** 적어 두었다(접두사 일괄 삭제 없음 · 와일드카드 없음).

```bash
# 1) 권한 — app/* 와 옛 초안 키에 한정
aws iam put-user-policy --user-name earthus-deploy --policy-name cleanup-delete \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Action":"s3:DeleteObject","Resource":[
      "arn:aws:s3:::earthus-cache-kr/app/*",
      "arn:aws:s3:::earthus-cache-kr/events/social-drafts.json"]}]}'

# 2) 목록을 **다시 만든다** (손으로 적은 목록을 쓰지 않는다)
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py \
  --out docs/earthus-v2/integration-10-live-audit.json \
  --candidates docs/earthus-v2/integration-10-delete-candidates.json \
  --cleanup docs/earthus-v2/integration-10-cleanup-command.txt

# 3) 명령 파일의 delete-object 줄을 실행 (95줄)

# 4) 각 키를 익명으로 되읽어 403/404 확인. 200 이면 FAIL
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py
python3 aws/verify-public-access.py

# 5) 제품 경로가 살아 있는지 확인 (특히 발행본)
curl -s -o /dev/null -w '%{http_code}\n' \
  https://earthus-cache-kr.s3.us-east-2.amazonaws.com/reports/published/report/2026-08/v1.json
```

⚠️ `deploy-app.sh` 의 `--delete` 는 되살리지 마라. 그 원본(`build/public-app`)에는
`v3/` · `orbital/` · `aetherus/` · `tourism/` 이 없어서, 켜면 다른 제품이 올린 것을 지운다.

⚠️ 발행본 두 개(`reports/published/index.json` · `…/report/2026-08/v1.json`)는
KEEP_PUBLIC 이고 삭제 후보에 **없다.** 지우면 안 된다.

---

## B. SOURCE ≠ DEPLOY

```text
 M prototype/v2-three/index.html · js/main.js · js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

이 세션은 그 파일들에 손대지 않았고 번들도 재생성하지 않았다.

### 이것이 지금 실제로 막고 있는 것

발행본은 올라갔고 누구나 받을 수 있다(200). 그런데 **지금 배포된 앱에는 리포트 화면이 없다.**

```text
app/v2/js/report-center.js   403   (없다)
app/v2/js/ui-shell.js        52,426 bytes  ·  로컬 소스 86,546 bytes
                             reportBase · report-center 문자열 0건
```

저장소 경계는 닫혔다. 화면에 나오려면 배포가 필요하다.

### 그쪽이 커밋한 뒤 — 한 번에

```bash
git status                       # 미커밋이 없는지 확인
bash tools/build-v2-bundle.sh
python3 aws/build-public.py --manifest
python3 aws/write-path-audit.py  # 배포기가 늘었는지 확인
# 배포
# 배포 뒤 확인: app/v2/js/report-center.js 가 200 이어야 한다
curl -s -o /dev/null -w '%{http_code}\n' \
  https://earthus-cache-kr.s3.us-east-2.amazonaws.com/app/v2/js/report-center.js
```

---

## 이것 말고 막는 것은 없다

| 조건 | 상태 |
|---|---|
| LIVE_FORBIDDEN = 0 | ❌ **95** |
| SOURCE = DEPLOY | ❌ 다른 세션 미커밋 |
| UNKNOWN = 0 | ✅ |
| REPORT_PUBLIC_READ | ✅ 200 실측 |
| PRIVATE_REPORT_ACCESS | ✅ 403 실측 |
| REPORT_READBACK · IMMUTABILITY | ✅ 덮어쓰기 거부 · 해시 불변 실측 |
| PUBLIC_WRITE_PATH (264 지점) DENY 0 | ✅ |
| AUTO_APPROVAL = 0 | ✅ |
| PRIVATE_DIRECT_ACCESS = 0 | ✅ 서명 없는 PUT 403 |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| CROSS_LEAD_RANKING = 0 · NO_DATA_SCORE = 0 | ✅ |
| REPORT / MEDIA E2E · APPROVAL | ✅ (VIDEO 는 DEFERRED) |
| BROWSER 4/4 · CONSOLE 0 · OVERFLOW 0 | ✅ |
| UNRELATED = 0 | ✅ |

```text
PRODUCTION_PUBLISH_READY:  NO
PRODUCTION_BOUNDARY_LOCK:  NOT CREATED
```
