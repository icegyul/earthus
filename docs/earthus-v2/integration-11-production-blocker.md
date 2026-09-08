# EARTHUS V2 — PRODUCTION BLOCKER (INTEGRATION-11)

```text
STATUS:  BLOCKED_NO_DELETE_PERMISSION  +  BUNDLE_BLOCKED_OTHER_SESSION
DATE:    2026-09-08
PARENT:  c9d14bc8
```

블로커는 둘이고 **둘 다 이 세션이 풀 수 없다.**
나머지 열다섯 조건은 전부 초록이고, 이번 단계에서 실행으로 다시 확인했다.

| | 무엇 | 필요한 것 | 누가 |
|---|---|---|---|
| A | 공개 금지 객체 95건 삭제 | `s3:DeleteObject` | AWS 관리자 |
| B | SOURCE = DEPLOY | `PopMetricMenu` 커밋 | 다른 세션 |

---

## A. 공개 금지 객체 95건

### 권한 확인

존재하지 않는 키로 시험했다 — **운영 파일을 먼저 지워서 확인하지 않았다.**

```text
identity: arn:aws:iam::294951922100:user/earthus-deploy

aws s3api delete-object --bucket earthus-cache-kr \
  --key "_integration11-permission-probe/does-not-exist.txt"

→ AccessDenied: User ... is not authorized to perform: s3:DeleteObject
  ... because no identity-based policy allows the s3:DeleteObject action
```

접두사별 예외가 아니라 정책에 아예 없다.
`PutObject` 는 되지만 빈 파일로 덮는 우회는 **쓰지 않는다** — 금지된 방식이고,
덮어도 객체는 남아 200 을 돌려주므로 `LIVE_FORBIDDEN = 0` 을 만족시키지도 못한다.

### 무엇이 남아 있나 — 신선 실사

```text
버킷 전체        25,522
KEEP_PUBLIC      14,592
KEEP_PRIVATE     10,831
DELETE_CANDIDATE     95   ← 지울 대상
EXEMPT_PRODUCT_PATH   4   ← 운영 제품 경로. 일괄 삭제 금지
UNKNOWN               0
```

구성:

```text
.sql  34   스키마·마이그레이션 (RBAC · 결제 · 환불 · 초대 · 개인정보 버전 · 소셜 자격증명)
.ts   15   Supabase Edge Function **서버 소스**
.md   13   저장소 안쪽 문서
.js   12   QA 하네스 · 개발 설정 서식 · 정책 모듈
그 밖  21   supabase/.temp · config.toml · 옛 파노라마 · 카나리 산출물 · devserver.py
```

`.ts` 15건 — 결제·환불·체크아웃·관리자 접근 제어의 서버 로직이다:

```text
app/v2/supabase/functions/checkout/index.ts
app/v2/supabase/functions/payment-confirm/index.ts
app/v2/supabase/functions/payment-refund/index.ts
app/v2/supabase/functions/member-admin/index.ts
app/v2/supabase/functions/social-admin/index.ts
app/v2/supabase/functions/_shared/admin-access.ts
app/v2/supabase/functions/_shared/social-credentials.ts
… 그 밖 8건
```

**자격증명은 없다.** 표본에서 `sk_live_` · `service_role_key` · JWT · `AKIA` 0건이고,
`social-credentials.ts` 는 값이 아니라 vault 추상화를 쓴다.
`app/supabase/schema.sql` 은 이미 46바이트 비석이다.
**키 유출이 아니라 설계·공격면 노출**이다. 그래도 지워야 한다.

전체(키·크기·sha256·근거·안전판정):
[integration-11-delete-candidates.json](integration-11-delete-candidates.json)

### 지우면 안 되는 것

**EXEMPT_PRODUCT_PATH 4건** — 부류로는 걸리지만 운영 제품 경로다:

```text
app/v3/data/audit-trench-bathymetry.py
app/v3/data/prepare-bathymetry.py
app/v3/data/prepare-ocean-trenches.py
app/v3/data/trench-bathymetry-audit.json
```

**발행본 2건** — KEEP_PUBLIC 이고 삭제 후보에 없다. 지우면 제품이 깨진다:

```text
reports/published/index.json
reports/published/report/2026-08/v1.json
```

### 어떻게 푸나

명령은 [integration-11-cleanup-command.txt](integration-11-cleanup-command.txt) 에
**키를 하나씩 지정해** 적어 두었다.

금지: 접두사 전체 삭제 · 버킷 전체 삭제 · `deploy-app.sh --delete` · 와일드카드 ·
`app/v3` · `app/aetherus` · `app/tourism` · `current-earth` · `character-studio` 전체 삭제.

```bash
# 1) 권한 — app/* 와 옛 초안 키에 한정
aws iam put-user-policy --user-name earthus-deploy --policy-name cleanup-delete \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Action":"s3:DeleteObject","Resource":[
      "arn:aws:s3:::earthus-cache-kr/app/*",
      "arn:aws:s3:::earthus-cache-kr/events/social-drafts.json"]}]}'

# 2) 목록을 **다시 만든다** (손으로 적은 목록을 쓰지 않는다)
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py \
  --out docs/earthus-v2/integration-11-live-audit.json \
  --candidates docs/earthus-v2/integration-11-delete-candidates.json \
  --cleanup docs/earthus-v2/integration-11-cleanup-command.txt

# 3) 명령 파일의 delete-object 줄을 실행 (95줄, 키 지정)

# 4) 각 키를 익명으로 되읽는다 — 403/404 여야 한다. 200 이면 FAIL
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py     # forbidden = 0 이어야 한다
python3 aws/verify-public-access.py

# 5) 제품 경로가 살아 있는지 확인 (특히 발행본)
for k in app/index.html app/v3/index.html app/aetherus/manifest.json \
         app/tourism/seoul-flow.json app/v2/data/current-earth/snow-ice.meta.json \
         app/v3/characters/catalog.json reports/published/report/2026-08/v1.json; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' \
    https://earthus-cache-kr.s3.us-east-2.amazonaws.com/$k)  $k"
done
```

⚠️ `deploy-app.sh` 의 `--delete` 는 되살리지 마라. 그 원본(`build/public-app`)에는
`v3/` · `orbital/` · `aetherus/` · `tourism/` 이 없어서, 켜면 다른 제품이 올린 것을 지운다.

---

## B. SOURCE ≠ DEPLOY

```text
 M prototype/v2-three/index.html · js/main.js · js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

이 세션은 그 파일들에 손대지 않았고 번들도 재생성하지 않았다.
미완성 변경을 섞어 맞추지 않았다.

### 이것이 지금 실제로 막고 있는 것

발행본은 올라갔고 누구나 받을 수 있다(200). 그런데 **배포된 앱에는 리포트 화면이 없다.**

```text
app/v2/js/report-center.js   403   (없다)
app/v2/js/ui-shell.js        52,426 bytes  ·  로컬 소스 86,546 bytes
                             reportBase · report-center 문자열 0건
```

### 그쪽이 커밋한 뒤 — 한 번에

```bash
git status                       # 미커밋이 없는지 확인
bash tools/build-v2-bundle.sh
python3 aws/build-public.py --manifest
python3 aws/write-path-audit.py  # 배포기가 늘었는지 확인
# 배포 뒤 확인
curl -s -o /dev/null -w '%{http_code}\n' \
  https://earthus-cache-kr.s3.us-east-2.amazonaws.com/app/v2/js/report-center.js   # 200 이어야
```

---

## 참고 — OBJECT LOCK 은 확인하지 못했다

```text
NOT_VERIFIED
```

```text
aws s3api get-object-lock-configuration → AccessDenied (s3:GetBucketObjectLockConfiguration)
aws s3api get-bucket-versioning         → AccessDenied (s3:GetBucketVersioning)
```

리포트 불변성은 **응용 계층**에서 증명했다(키 안의 버전 + `IfNoneMatch="*"`,
덮어쓰기 시도 후 sha256·ETag·Last-Modified 전부 불변). 버킷 차원 보존은 별개 개념이고,
읽을 권한이 없어 **있다고도 없다고도 적지 않는다.**
관리자 권한이 생기면 위 두 명령을 먼저 확인할 것.

---

## 이것 말고 막는 것은 없다

| 조건 | 상태 |
|---|---|
| LIVE_FORBIDDEN = 0 | ❌ **95** |
| SOURCE = DEPLOY | ❌ 다른 세션 미커밋 |
| UNKNOWN = 0 · UNKNOWN_PUBLIC_WRITE = 0 | ✅ |
| PRIVATE_DIRECT_ACCESS = 0 | ✅ 서명 없는 PUT 403 |
| REPORT_PUBLIC_READ · REPORT_READBACK | ✅ 200 · 5항목 |
| IMMUTABILITY (응용 계층) | ✅ 해시·ETag·시각 불변 |
| APPROVAL · AUTO_APPROVAL = 0 | ✅ |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| CROSS_LEAD_RANKING = 0 · NO_DATA_SCORE = 0 | ✅ |
| REPORT_E2E · MEDIA_E2E | ✅ (VIDEO 는 DEFERRED) |
| BROWSER 4/4 · CONSOLE 0 · OVERFLOW 0 | ✅ |
| UNRELATED = 0 | ✅ |

```text
PRODUCTION_PUBLISH_READY:  NO
PRODUCTION_BOUNDARY_LOCK:  NOT_CREATED
OBJECT_LOCK:               NOT_VERIFIED
```
