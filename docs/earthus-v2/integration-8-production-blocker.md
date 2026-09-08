# EARTHUS V2 — PRODUCTION BLOCKER (INTEGRATION-8)

```text
STATUS:  BLOCKED
DATE:    2026-09-08
PARENT:  cd52baae
```

운영 발행을 막는 것은 **둘**이다. 둘 다 IAM 권한 하나씩이면 풀린다.

| | 무엇 | 필요한 것 |
|---|---|---|
| A | 공개 버킷에 지워야 할 객체 95건 | `s3:DeleteObject` |
| B | 리포트 발행 경로 `reports/` 를 아무도 못 읽는다 | `s3:PutBucketPolicy` (한 줄 추가) |

---

## A. 공개 금지 객체 95건 — 지울 권한이 없다

### 권한 확인

존재하지 않는 키로 시험했다 — **운영 파일을 먼저 지워서 권한을 확인하지 않았다.**

```text
identity: arn:aws:iam::294951922100:user/earthus-deploy

aws s3api delete-object --bucket earthus-cache-kr \
  --key "_integration8-permission-probe/does-not-exist.txt"

→ AccessDenied: User ... is not authorized to perform: s3:DeleteObject
  ... because no identity-based policy allows the s3:DeleteObject action
```

접두사별 예외가 아니라 정책에 아예 없다.

`PutObject` 는 된다. 그래서 내용만 빈 파일로 덮는 길은 기술적으로 있다.
**쓰지 않는다** — 금지된 우회이고, 덮어도 객체는 남아 200 을 돌려주므로
`LIVE_FORBIDDEN = 0` 을 만족시키지도 못한다.

### 무엇이 남아 있나

`aws/live-audit.py` 를 **새로 돌려** 만든 목록이다. 기존 목록을 재사용하지 않았다.

```text
버킷 전체                25,337
KEEP_PUBLIC              14,435
KEEP_PRIVATE             10,803
LEGACY_PUBLIC_FORBIDDEN      95   ← 지울 대상
EXEMPT_PRODUCT_PATH           4   ← 운영 제품 경로. 일괄 삭제 금지
UNKNOWN                       0
```

가장 무거운 것:

```text
app/v2/supabase/migrations/20260827140000_member_rbac.sql        41,611
app/v2/supabase/migrations/20260828100000_social_workflow.sql    27,587
app/v2/supabase/migrations/20260828110000_social_comments.sql    21,825
app/v2/supabase/migrations/20260828090000_provider_control.sql   17,846
app/v2/supabase/migrations/20260828103000_social_credentials.sql 16,486
app/v2/supabase/schema.sql                                       14,244
events/social-drafts.json                                         5,112
```

`.sql` 34건 · 전체(키·크기·sha256·근거·안전판정):
[integration-8-delete-candidates.json](integration-8-delete-candidates.json)

### 지우면 안 되는 것 — EXEMPT_PRODUCT_PATH 4건

부류로는 걸리지만 **운영 제품 경로**다. 삭제 명령에 넣지 않았다.

```text
app/v3/data/audit-trench-bathymetry.py
app/v3/data/prepare-bathymetry.py
app/v3/data/prepare-ocean-trenches.py
app/v3/data/trench-bathymetry-audit.json
```

거름망은 앞으로의 배포에서 이미 막는다. 지울지는 v3 담당이 정한다.

### 어떻게 푸나

명령은 [integration-8-cleanup-command.txt](integration-8-cleanup-command.txt) 에
**키를 하나씩 지정해** 적어 두었다(접두사 일괄 삭제 없음).

```bash
# 1) 권한 — app/* 와 옛 초안 키에 한정
aws iam put-user-policy --user-name earthus-deploy --policy-name cleanup-delete \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Action":"s3:DeleteObject","Resource":[
      "arn:aws:s3:::earthus-cache-kr/app/*",
      "arn:aws:s3:::earthus-cache-kr/events/social-drafts.json"]}]}'

# 2) 목록을 **다시 만든다** (손으로 적은 목록을 쓰지 않는다)
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py \
  --out docs/earthus-v2/integration-8-live-audit.json \
  --candidates docs/earthus-v2/integration-8-delete-candidates.json \
  --cleanup docs/earthus-v2/integration-8-cleanup-command.txt

# 3) 명령 파일의 delete-object 줄을 실행 (95줄)

# 4) 되읽기 — 목록이 비어야 한다
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py
python3 aws/verify-public-access.py
```

⚠️ `deploy-app.sh` 의 `--delete` 는 되살리지 마라. 그 원본(`build/public-app`)에는
`v3/` · `orbital/` · `aetherus/` · `tourism/` 이 없어서, 켜면 다른 제품이 올린 것을 지운다.

---

## B. `reports/` 를 아무도 못 읽는다 — 발행이 무의미해진다  ★신규

### 무엇이 문제인가

리포트 엔진은 `reports/<id>/v<n>.json` 에 발행하고, 앱은 그 접두사에서 받아 읽는다.

```text
aws/report-engine/publisher.py:35   report_key() → "reports/%s/v%d.json"
prototype/v2-deploy/js/ui-shell.js:596
    fetch(reportBase() + '/reports/index.json')
    reportBase() = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com'
```

그런데 버킷 정책의 **두 Allow 문 어디에도 `reports/*` 가 없다**
(`aws s3api get-bucket-policy`, 2026-09-08 실측):

```text
Sid PublicReadData        Principal *
  app/* celestrak/* clouds/* wind/* events/* ocean/* solar/*

Sid AllowCloudFrontRead   Principal cloudfront.amazonaws.com
  app/* wind/* events/* ocean/* solar/* clouds/* celestrak/*
```

앱은 CloudFront 를 거치지 않고 S3 REST 주소로 직접 받는다 → `PublicReadData` 만 걸린다.
S3 는 기본 거부이므로 **`reports/` 아래 무엇을 올려도 익명 GET 은 403** 이다.
실행 중인 앱 안에서 확인했다:

```text
await fetch('https://earthus-cache-kr.s3.us-east-2.amazonaws.com/reports/index.json')
→ { status: 403, ok: false }
```

### 왜 지금까지 안 보였나

`loadReportIndex` 가 실패를 빈 목록으로 바꾼다:

```js
.then((r) => (r.ok ? r.json() : null))
.then((j) => { REPORT_INDEX = j && typeof j === 'object' ? j : {}; ... });
```

화면에는 **"아직 발행된 보고서가 없습니다"** 가 뜬다.
지금은 `reports/` 객체가 0건이라 그 문장이 참이다. 발행하는 순간부터는 거짓이 된다 —
읽지 못하는 것과 없는 것을 구분하지 못한다.

### 어떻게 푸나

```bash
# 현재 정책을 받아서 두 Statement 의 Resource 에 reports/* 를 더한 뒤 되쓴다.
aws s3api get-bucket-policy --bucket earthus-cache-kr --output text > /tmp/policy.json
# … "arn:aws:s3:::earthus-cache-kr/reports/*" 를 PublicReadData 와
#    AllowCloudFrontRead 양쪽 Resource 배열에 추가 …
aws s3api put-bucket-policy --bucket earthus-cache-kr --policy file:///tmp/policy.json
```

`earthus-deploy` 에는 `s3:PutBucketPolicy` 가 없다. 권한을 우회하지 않는다.

되읽기 — 발행 뒤 다음이 200 이어야 한다:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  https://earthus-cache-kr.s3.us-east-2.amazonaws.com/reports/index.json
```

### 같이 고칠 것 (권한 없이도 가능, 다음 단계)

`loadReportIndex` 가 **읽기 실패**와 **발행 없음**을 구분해서 표시하게 할 것.
지금은 둘 다 같은 문장으로 나온다.

---

## 이것 말고 막는 것은 없다

| 조건 | 상태 |
|---|---|
| LIVE_FORBIDDEN = 0 | ❌ **95** |
| REPORT 발행 경로 읽기 가능 | ❌ **`reports/` 정책 밖** |
| PUBLIC_WRITE_PATH (264 지점 값 추적) DENY 0 | ✅ |
| UNKNOWN_DESTINATION = 0 | ✅ 5건은 사람 확인 · 근거 기록 |
| PRIVATE_DIRECT_ACCESS = 0 | ✅ `archive/` 403 · 서명 없는 PUT 403 |
| AUTO_APPROVAL = 0 | ✅ |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| UNKNOWN_PUBLIC_WRITE = 0 | ✅ |
| SOURCE = DEPLOY | ❌ 다른 세션 미커밋 |
| REPORT / MEDIA E2E · APPROVAL | ✅ (VIDEO 는 NOT_AVAILABLE) |
| BROWSER 4/4 · OVERFLOW 0 | ✅ |

```text
PRODUCTION_PUBLISH_READY:  NO
```
