# EARTHUS V2 — PRODUCTION BLOCKER (INTEGRATION-7)

```text
STATUS:  BLOCKED_NO_DELETE_PERMISSION
DATE:    2026-09-08
PARENT:  86816cdb
```

**운영 발행을 막는 것은 하나뿐이다: 공개 버킷에 지워야 할 객체 95건이 남아 있고,
이 자격증명에는 지울 권한이 없다.**

---

## 권한 확인 (§4)

존재하지 않는 키로 시험했다 — **운영 파일을 먼저 지워서 권한을 확인하지 않았다.**

```text
identity: arn:aws:iam::294951922100:user/earthus-deploy

aws s3api delete-object --bucket earthus-cache-kr \
  --key "_integration7-permission-probe/does-not-exist.txt"

→ AccessDenied: User ... is not authorized to perform: s3:DeleteObject
  ... because no identity-based policy allows the s3:DeleteObject action
```

`app/orbital/` 접두사로도 같은 결과다. 접두사별 예외가 아니라 정책에 아예 없다.

`PutObject` 는 된다. 그래서 내용만 빈 파일로 덮는 길은 기술적으로 있다.
**쓰지 않는다** — §0 이 그 우회를 금지하고, 덮어도 객체는 남아 200 을 돌려주므로
§16 의 `LIVE_FORBIDDEN = 0` 을 만족시키지도 못한다.

---

## 무엇이 남아 있나 (§1 · §2 · §3)

`aws/live-audit.py` 를 **새로 돌려** 만든 목록이다. 기존 95건 목록을 재사용하지 않았다.

```text
버킷 전체        25,322
KEEP_PUBLIC      14,429
KEEP_PRIVATE     10,794
LEGACY_PUBLIC_FORBIDDEN  95   ← 지울 대상
EXEMPT_PRODUCT_PATH       4   ← 운영 제품 경로. 일괄 삭제 금지
UNKNOWN                   0
```

부류별:

| | |
|---|---:|
| DB 스키마·마이그레이션 | 34 |
| supabase 트리(.temp·Edge Function 정책) | 29 |
| 저장소 안쪽 문서 | 9 |
| QA 하네스 | 5 |
| 해시 없는 옛 파노라마 | 4 |
| 카나리 점검 산출물 | 2 |
| 내부 자산 노트 | 2 |
| 개발자 설정 서식 | 2 |
| 제작 원본 | 2 |
| 그 밖(명세·로드맵·계약·감사·초안·개발 스크립트) | 6 |

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

전체(키·크기·sha256·근거·안전판정):
[integration-7-delete-candidates.json](integration-7-delete-candidates.json)

---

## 지우면 안 되는 것 — EXEMPT_PRODUCT_PATH 4건 (§2)

부류로는 걸리지만 **운영 제품 경로**다. 삭제 명령에 넣지 않았다.

```text
app/v3/data/audit-trench-bathymetry.py
app/v3/data/prepare-bathymetry.py
app/v3/data/prepare-ocean-trenches.py
app/v3/data/trench-bathymetry-audit.json
```

거름망은 앞으로의 배포에서 이미 막는다. 지금 올라가 있는 것만 남아 있고,
지울지 여부는 v3 담당이 정한다.

---

## 어떻게 푸나

명령은 [integration-7-cleanup-command.txt](integration-7-cleanup-command.txt) 에
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
  --out docs/earthus-v2/integration-7-live-audit.json \
  --candidates docs/earthus-v2/integration-7-delete-candidates.json \
  --cleanup docs/earthus-v2/integration-7-cleanup-command.txt

# 3) 명령 파일의 delete-object 줄을 실행 (95줄)

# 4) 되읽기 — 목록이 비어야 한다
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py
python3 aws/verify-public-access.py
```

⚠️ `deploy-app.sh` 의 `--delete` 는 되살리지 마라. 그 원본(`build/public-app`)에는
`v3/` · `orbital/` · `aetherus/` · `tourism/` 이 없어서, 켜면 다른 제품이 올린 것을 지운다.

---

## 이것 말고 막는 것은 없다 (§16 기준)

| 조건 | 상태 |
|---|---|
| LIVE_FORBIDDEN = 0 | ❌ **95** |
| PUBLIC_LEAK = 0 (앞으로 올라갈 것) | ✅ |
| PRIVATE_DIRECT_ACCESS = 0 | ✅ `archive/` 403 · 서명 없는 PUT 403 |
| AUTO_APPROVAL = 0 | ✅ |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| CROSS_LEAD_RANKING = 0 | ✅ |
| NO_DATA_SCORE = 0 | ✅ |
| UNKNOWN_PUBLIC_WRITE = 0 | ✅ UNKNOWN 접두사는 거부한다 |
| SOURCE = DEPLOY | ❌ 다른 세션 미커밋 (BUNDLE_BLOCKED_OTHER_SESSION) |
| REPORT E2E / MEDIA E2E / APPROVAL | ✅ (MEDIA 의 VIDEO 는 NOT_AVAILABLE) |
| BROWSER 4/4 · CONSOLE 0 · OVERFLOW 0 | ✅ |
| UNRELATED = 0 | ✅ |

```text
PRODUCTION_PUBLISH_READY:  NO
```
