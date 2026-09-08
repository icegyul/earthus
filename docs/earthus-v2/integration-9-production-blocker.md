# EARTHUS V2 — PRODUCTION BLOCKER (INTEGRATION-9)

```text
STATUS:  BLOCKED_NO_DELETE_PERMISSION  +  BUNDLE_BLOCKED_OTHER_SESSION
DATE:    2026-09-08
PARENT:  0f4f8718
```

INTEGRATION-8 의 블로커 둘 중 **하나는 닫혔다.**

| | 무엇 | 상태 |
|---|---|---|
| ~~B~~ | ~~`reports/` 가 공개 읽기 정책 밖~~ | ✅ **닫힘** — `reports/published/*` 를 정책에 넣고 실측 200 |
| A | 공개 금지 객체 95건 | ❌ `s3:DeleteObject` 없음 |
| C | SOURCE ≠ DEPLOY | ❌ 다른 세션 미커밋 |

---

## A. 공개 금지 객체 95건 — 지울 권한이 없다

### 권한 확인

존재하지 않는 키로 시험했다 — **운영 파일을 먼저 지워서 확인하지 않았다.**

```text
identity: arn:aws:iam::294951922100:user/earthus-deploy

aws s3api delete-object --bucket earthus-cache-kr \
  --key "_integration9-permission-probe/does-not-exist.txt"

→ AccessDenied: User ... is not authorized to perform: s3:DeleteObject
  ... because no identity-based policy allows the s3:DeleteObject action
```

접두사별 예외가 아니라 정책에 아예 없다.
`PutObject` 는 되지만 빈 파일로 덮는 우회는 **쓰지 않는다** — 금지된 방식이고,
덮어도 객체는 남아 200 을 돌려주므로 `LIVE_FORBIDDEN = 0` 을 만족시키지도 못한다.

### 무엇이 남아 있나

`aws/live-audit.py` 를 **새로 돌려** 만든 목록이다. 기존 목록을 재사용하지 않았다.

```text
버킷 전체                25,360
KEEP_PUBLIC              14,446
KEEP_PRIVATE             10,815
LEGACY_PUBLIC_FORBIDDEN      95   ← 지울 대상
EXEMPT_PRODUCT_PATH           4   ← 운영 제품 경로. 일괄 삭제 금지
UNKNOWN                       0
```

`.sql` 34건 · supabase 트리 · 저장소 안쪽 문서 · QA 하네스 등.
전체(키·크기·sha256·근거·안전판정):
[integration-9-delete-candidates.json](integration-9-delete-candidates.json)

### 지우면 안 되는 것 — EXEMPT_PRODUCT_PATH 4건

```text
app/v3/data/audit-trench-bathymetry.py
app/v3/data/prepare-bathymetry.py
app/v3/data/prepare-ocean-trenches.py
app/v3/data/trench-bathymetry-audit.json
```

거름망은 앞으로의 배포에서 이미 막는다. 지울지는 v3 담당이 정한다.

### 어떻게 푸나

명령은 [integration-9-cleanup-command.txt](integration-9-cleanup-command.txt) 에
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
  --out docs/earthus-v2/integration-9-live-audit.json \
  --candidates docs/earthus-v2/integration-9-delete-candidates.json \
  --cleanup docs/earthus-v2/integration-9-cleanup-command.txt

# 3) 명령 파일의 delete-object 줄을 실행 (95줄)

# 4) 되읽기 — 목록이 비어야 한다
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py
python3 aws/verify-public-access.py
```

⚠️ `deploy-app.sh` 의 `--delete` 는 되살리지 마라. 그 원본(`build/public-app`)에는
`v3/` · `orbital/` · `aetherus/` · `tourism/` 이 없어서, 켜면 다른 제품이 올린 것을 지운다.

---

## B. ~~`reports/` 를 아무도 못 읽는다~~ — 닫혔다 ✅

### 무엇을 했나

`reports/*` 를 통째로 열지 않았다. **발행본만 사는 자리를 따로 두고 그것만 열었다.**

```text
reports/published/…    ← 발행본·색인. 정책이 여는 유일한 reports 자리
reports/…  그 밖       ← 부여 없음(403) · 표에도 없어 쓰기 자체가 거부
```

버킷 정책은 지금 것을 읽어 **항목 하나씩만 더했다.** 더한 것 말고 아무것도 달라지지
않았음을 구조로 대조한 뒤 적용하고 되읽어 확인했다.

```text
PublicReadData        7 → 8   + arn:aws:s3:::earthus-cache-kr/reports/published/*
AllowCloudFrontRead   7 → 8   + 같은 항목
되읽기 대조            일치
```

### 실측 (익명 · 자격증명 없음)

```text
200  reports/published/index.json
200  reports/published/report/2026-08/v1.json
403  reports/index.json · reports/report/2026-08/v1.json
403  reports/draft/x.json · reports/review/x.json
403  reports/published-ish/x.json        ← 접두사 흉내도 막힌다
```

정책 원본·적용본: [integration-9-bucket-policy.json](integration-9-bucket-policy.json)

### 되돌리려면

```bash
# 이 파일의 Resource 배열에서 reports/published/* 두 줄만 빼고 되쓴다
aws s3api put-bucket-policy --bucket earthus-cache-kr \
  --policy file://docs/earthus-v2/integration-9-bucket-policy.json
```

---

## C. SOURCE ≠ DEPLOY — 그래서 라이브 앱이 아직 못 보여 준다

발행본은 올라갔고 누구나 받을 수 있다(200). 그런데 **지금 배포돼 있는 앱은 리포트
화면 자체가 없는 옛 판**이다:

```text
app/v2/js/report-center.js   403   (없다)
app/v2/js/ui-shell.js        52,426 bytes  ·  로컬 소스 86,546 bytes
                             reportBase · report-center 문자열 0건
```

저장소 경계는 닫혔다. 화면에 나오려면 배포가 필요하고, 배포는 다른 세션의
`PopMetricMenu` 미커밋 때문에 막혀 있다.

```text
 M prototype/v2-three/index.html · js/main.js · js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

그쪽이 커밋한 뒤 **한 번에**:

```bash
git status                       # 미커밋이 없는지 확인
bash tools/build-v2-bundle.sh
python3 aws/build-public.py --manifest
python3 aws/write-path-audit.py  # 배포기가 늘었는지 확인
# 배포 뒤: app/v2/js/report-center.js 가 200 이어야 한다
```

---

## 이것 말고 막는 것은 없다

| 조건 | 상태 |
|---|---|
| LIVE_FORBIDDEN = 0 | ❌ **95** |
| SOURCE = DEPLOY | ❌ 다른 세션 미커밋 |
| REPORT_PUBLIC_READ | ✅ 200 실측 |
| PRIVATE_REPORT_ACCESS | ✅ 403 실측 |
| REPORT_READBACK | ✅ 5항목 |
| PUBLIC_WRITE_PATH (264 지점) DENY 0 | ✅ |
| AUTO_APPROVAL = 0 | ✅ (구멍 셋 막은 뒤) |
| PRIVATE_DIRECT_ACCESS = 0 | ✅ |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| REPORT / MEDIA E2E · APPROVAL | ✅ (VIDEO 는 DEFERRED) |
| BROWSER 4/4 · CONSOLE 0 · OVERFLOW 0 | ✅ |

```text
PRODUCTION_PUBLISH_READY:  NO
PRODUCTION_BOUNDARY_LOCK:  NOT CREATED
```
