# EARTHUS V2 — PRODUCTION BLOCKER

```text
STATUS:  BLOCKED_NO_DELETE_PERMISSION
DATE:    2026-09-08
PARENT:  3214739c
```

**운영 발행을 막고 있는 것은 하나다: 공개 버킷에 지워야 할 객체 95건이 남아 있고,
지울 권한이 없다.**

---

## 무엇이 막고 있나

`aws/live-audit.py` 가 버킷 25,310개를 목록으로 읽어 분류한 결과:

| 분류 | 건수 |
|---|---:|
| KEEP_PUBLIC | 14,429 |
| KEEP_PRIVATE | 10,782 |
| **LEGACY_PUBLIC_FORBIDDEN** | **95** |
| EXEMPT_PRODUCT_PATH | 4 |

95건(9.8 MB)이 익명 HTTP **200** 으로 읽힌다.

```text
DB 스키마·마이그레이션      34
supabase 트리(.temp 포함)   29
저장소 안쪽 문서             9
QA 하네스                   5
해시 없는 옛 파노라마        4
카나리 점검 산출물           2
내부 자산 노트               2
개발자 설정 서식             2
제작 원본                   2
그 밖(명세·로드맵·계약·감사·초안·개발 스크립트)  6
```

가장 무거운 것:

```text
app/v2/supabase/schema.sql                                      14,244
app/v2/supabase/migrations/20260827140000_member_rbac.sql       41,611
app/v2/supabase/migrations/20260828103000_social_credentials.sql 16,486
app/v2/supabase/migrations/20260814090000_aetherus_private_data.sql 16,379
events/social-drafts.json                                        5,112
```

전체 목록(키·크기·sha256): [integration-6-delete-candidates.json](integration-6-delete-candidates.json)

---

## 왜 못 지웠나

`earthus-deploy` 에 `s3:DeleteObject` 가 없다. **존재하지 않는 키로 시험해 확인했다**
(그래서 아무것도 지워지지 않는다):

```text
User: arn:aws:iam::294951922100:user/earthus-deploy is not authorized to
perform: s3:DeleteObject on resource:
"arn:aws:s3:::earthus-cache-kr/_integration6-permission-probe/does-not-exist.txt"
because no identity-based policy allows the s3:DeleteObject action
```

`app/orbital/` 접두사로도 같은 결과다 — 접두사별 예외가 아니라 정책에 아예 없다.

`PutObject` 는 된다. 그래서 **내용만 빈 파일로 덮는** 길은 기술적으로 있다.
쓰지 않는다 — §0 이 그 우회를 금지하고, 사용자도 대기를 선택했다.
덮어써도 객체는 남아 200 을 돌려주므로 §19 의 `LIVE_FORBIDDEN_OBJECTS = 0` 을
만족시키지도 못한다.

---

## 어떻게 푸나

명령은 [integration-6-cleanup-command.txt](integration-6-cleanup-command.txt) 에
키를 하나씩 지정해 적어 두었다(접두사 일괄 삭제 없음). 요약:

```bash
# 1) 권한 — app/* 와 옛 초안 키에 한정
aws iam put-user-policy --user-name earthus-deploy --policy-name cleanup-delete \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Action":"s3:DeleteObject","Resource":[
      "arn:aws:s3:::earthus-cache-kr/app/*",
      "arn:aws:s3:::earthus-cache-kr/events/social-drafts.json"]}]}'

# 2) 목록을 다시 만든다 (손으로 적은 목록을 쓰지 않는다)
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py

# 3) 명령 파일의 delete-object 줄을 실행

# 4) 되읽기 — 목록이 비어야 한다
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py
python3 aws/verify-public-access.py
```

⚠️ `deploy-app.sh` 의 `--delete` 는 되살리지 마라. 그 원본(`build/public-app`)에는
`v3/` · `orbital/` · `aetherus/` · `tourism/` 이 없어서, 켜면 다른 제품이 올린 것을
지운다. 청소는 키를 지정해서만 한다.

---

## 지우면 안 되는 것 — EXEMPT_PRODUCT_PATH 4건

부류로는 걸리지만 **운영 제품 경로**다. 일괄 삭제 대상이 아니고,
v3 담당이 개별로 판단해야 한다.

```text
app/v3/data/audit-trench-bathymetry.py
app/v3/data/prepare-bathymetry.py
app/v3/data/prepare-ocean-trenches.py
app/v3/data/trench-bathymetry-audit.json
```

거름망은 이 파일들을 **앞으로의 배포에서는** 막는다
(`v3-paper/data/*.py`, `v3-paper/data/trench-bathymetry-audit.json`).
지금 올라가 있는 것만 남아 있다.

---

## 이것 말고 운영 발행을 막는 것은 없다

| 조건 | 상태 |
|---|---|
| PUBLIC_LEAK (앞으로 올라갈 것) | 0 — 거름망이 막고, 업로더 16개가 전부 그 문을 지난다 |
| AUTO_APPROVAL | 0 — 사람 방법 어휘 밖 승인은 예외를 던진다 |
| UNVERIFIED_VISUAL_PUBLIC | 0 — 여덟 조건을 못 넘으면 `PUBLIC_CONTENT_INVALID` |
| DIRECT_PRIVATE_ACCESS | 0 — 서명 없는 PUT 403 · `archive/` 403 |
| CROSS_LEAD_PUBLIC_RANKING | 0 — 마지막 화면(사건 방)까지 이번에 고쳤다 |
| NO_DATA_SCORE | 0 — null 을 0 으로 가중하던 두 곳을 고쳤다 |
| REPORT_E2E | PASS |
| BROWSER 4칸 | PASS |

즉 **새로 올라가는 것은 안전하다.** 남은 것은 과거 잔존물뿐이고,
그것 하나 때문에 `PRODUCTION_PUBLISH_READY` 를 선언하지 않는다.

```text
PRODUCTION_PUBLISH_READY:  NO
```
