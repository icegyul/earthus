# EARTHUS V2 — INTEGRATION-5 RESULT

```text
STATUS:    PARTIAL / BLOCKED
BASELINE:  2842039a  (INTEGRATION-4)
PARENT:    2842039a
COMMIT:    이 문서와 같은 커밋
DATE:      2026-09-08
```

> §18 의 `integration-5-production-boundary-lock.md` 는 **만들지 않았다.**
> 모든 조건이 PASS 일 때만 만든다고 적혀 있고, 지금은 아니다.

---

## 이번 단계에서 바뀐 가장 큰 사실

**INTEGRATION-4 의 "AWS 세션 만료" 결론이 틀렸다.**
`default` 프로파일만 만료였고 `earthus-deploy` 프로파일은 살아 있었다.
그래서 이번에는 버킷을 **목록으로** 읽을 수 있었고, 그 순간 숫자가 바뀌었다.

```text
INTEGRATION-4  거름망 계획을 두드려서 찾은 금지 객체   26
INTEGRATION-5  버킷을 목록으로 훑어 부류로 찾은 것    99
```

73건 차이는 전부 **옛 배포 잔존물**이다. 거름망 계획은 *지금* `prototype/` 에 있는
경로만 안다 — 지금 트리에 없는 옛 객체는 계획에 없으므로 두드려 볼 생각조차 못 한다.

그 73건 안에 이것이 있었다:

```text
app/v2/supabase/schema.sql                                    14,244   전체 스키마
app/v2/supabase/migrations/20260827140000_member_rbac.sql     41,611   권한 행렬
app/v2/supabase/migrations/20260828103000_social_credentials.sql 16,486
app/v2/supabase/migrations/20260814090000_aetherus_private_data.sql 16,379
… 마이그레이션 21건 + billing/founding/refund/push 등 8건
app/v2/supabase/.temp/pooler-url                                  97   접속 문자열
app/v2/devserver.py                                            5,055
```

익명 HTTP 200 으로 **실제 내용이 그대로 읽힌다.** RLS 정책, 테이블·열 이름,
역할-권한 행렬이 전부 들어 있다.

### 앞선 두 단계의 보고를 정정한다

INTEGRATION-3·4 는 `app/supabase/schema.sql` 이 200 이라는 이유로
"DB 스키마가 공개돼 있다"고 적었다. 그 파일을 열어 보니 **46바이트**였다:

```text
삭제 예정 파일입니다. 내용 없음.
```

누군가 이미 내용을 비워 둔 것이다(`app/legal/README.md` 도 같다).
그러니까 그 두 건에 대한 앞선 보고는 **과장이었다.**
그런데 정작 진짜 스키마는 옆 경로에 그대로 있었다 —
상태 코드만 보고 내용을 안 열어 본 대가다.

`app/v2/supabase/.temp/pooler-url` 은 비밀번호가 없는 형태였다.
자격증명 유출은 아니다 — 프로젝트 식별자·리전 노출이다. 그것도 그대로 적는다.

---

## PUBLIC SOURCE / DEPLOY SOURCE

```text
PUBLIC SOURCE   prototype/  →  aws/build-public.py (거름망 45줄)
DEPLOY SOURCE   build/public-app/   (올리는 파일 3,598 · 막는 경로 356)
MANIFEST        build/public-manifest.json  ← 공개 트리 **밖**. 아무도 올리지 않는다
MANIFEST HASH   c5ecef71870a05b7b6b5c37fcf7156b2
```

### PUBLIC UPLOADERS — 16개

```text
FILTERED (12)  build/public-app 을 원본으로 쓴다
  aws/deploy-v2-preview.sh · aws/deploy-v3-kids.sh · aws/deploy-v3-paper.sh
  tools/deploy-v1.sh · tools/deploy-v2-three.sh · tools/deploy-real-living-earth-v2.sh
  tools/deploy-station-model.sh · tools/deploy_ocean_public.sh
  tools/deploy_tourism_density.sh · tools/deploy_aetherus_public_safe.sh
  tools/deploy_free_open_policy.sh · tools/deploy_ocean_aetherus_v3_canary.sh

EXEMPT (4)  이유를 코드에 적었다
  aws/deploy-app.sh                    build/public-app 을 직접 쓴다
  aws/deploy-orbital-static.sh         build/orbital — 내보내기 산출물 (인계 C)
  tools/publish-aetherus-snapshot.sh   API 호출 결과
  tools/upload_information_release.mjs 빌더가 만든 payload 만 올린다
```

### FORBIDDEN UPLOADERS — 이번에 닫은 것

`tools/build_information_release.mjs` 가 `prototype/` 에서 **바로** 떠서
`app/` 키로 올리고 있었다. 거름망을 통째로 비켜 갔다.

> ⚠️ INTEGRATION-4 의 §4 시험이 이걸 놓쳤다. 탐지기가 `aws/*.sh` 와 `tools/*.sh` 만
> 훑었고 이 업로더는 `.mjs` 였다. **확장자 하나가 검사 구멍이었다.**
> 이제 언어로 거르지 않고, 목적지가 변수여도 잡는다 — 그 업로더는 버킷도 키도
> 변수라서 어떤 목적지 패턴에도 안 걸렸다.

같이 정리한 것: `tools/deploy_ocean_public.sh` 에 남아 있던 `"prototype/data/$file"`.

### 공개 `app/` 에 직접 쓰는 람다 3종 (거름망 밖 — 생성 자료라 정당하다)

```text
tourism-flow             app/tourism/*            혼잡도 생성 자료 (5,458 객체)
current-earth-snow-ice   app/v2/data/current-earth/*
character-studio         app/v3/characters/*
```

시험이 이 셋을 목록으로 못박는다. 새 람다가 `app/` 에 쓰기 시작하면 시험이 깨진다.

---

## LIVE CLEANUP

```text
BEFORE     99   (docs/earthus-v2/integration-5-live-forbidden.json — 키·크기·sha256)
DELETED     0
REMAINING  99
```

**지우지 않았다.** 두 가지 이유가 있고 둘 다 실측이다.

1. `s3:DeleteObject` 권한이 없다. 존재하지 않는 키로 시험해 확인했다(아무것도 안 지워진다):

```text
User: arn:aws:iam::294951922100:user/earthus-deploy is not authorized to
perform: s3:DeleteObject ... because no identity-based policy allows the
s3:DeleteObject action
```

`app/orbital/` 접두사로도 같은 결과다 — 접두사별 예외가 아니라 아예 없다.

2. `PutObject` 는 되므로 **내용만 비우는** 방법은 있었다(저장소에 이미 그 선례가 있다).
   사용자가 *"일단 대기하고 보고서에 작성"* 을 선택했다. 그래서 손대지 않았다.

### 사람이 할 일

```bash
# 1) 권한 (app/* 와 옛 초안 키에 한정)
aws iam put-user-policy --user-name earthus-deploy --policy-name cleanup-delete \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Action":"s3:DeleteObject","Resource":[
      "arn:aws:s3:::earthus-cache-kr/app/*",
      "arn:aws:s3:::earthus-cache-kr/events/social-drafts.json"]}]}'

# 2) 목록을 **다시 만든다** (손으로 적은 목록을 쓰지 않는다)
AWS_PROFILE=earthus-deploy python3 aws/verify-public-access.py --audit-live

# 3) 각 줄을 지운다
aws s3 rm s3://earthus-cache-kr/<위 경로> --region us-east-2

# 4) 비었는지 확인
AWS_PROFILE=earthus-deploy python3 aws/verify-public-access.py --audit-live
python3 aws/verify-public-access.py            # 익명 확인
```

> ⚠️ `deploy-app.sh` 의 `--delete` 는 되살리지 마라. 그 원본(`build/public-app`)에는
> `v3/` · `orbital/` · `aetherus/` · `tourism/` 이 없어서, 켜면 다른 스크립트와
> 람다가 올린 것을 지운다. 청소는 위처럼 **키를 지정해서** 한다.

---

## LIVE READ-BACK

```text
forbidden objects   99
403                  0
404                  0
200                 99      ← §0-11 에 따라 전부 FAIL
other                0
확인 못 함            0      ← UNKNOWN 은 실패로 센다. 하나도 없다
```

부류별:

| | |
|---|---:|
| DB 스키마·마이그레이션 | 34 |
| supabase 트리(.temp·Edge Function 정책 코드 포함) | 29 |
| 저장소 안쪽 문서 | 9 |
| QA 하네스 | 5 |
| 해시 없는 옛 파노라마 | 4 |
| 개발 스크립트 | 4 |
| 그 밖(카나리·자산 노트·설정 서식·제작 원본·명세·로드맵·계약·감사·초안) | 14 |

**정상 동작 확인**(같은 실측에서):

```text
app/index.html                 200  열려야 한다        PASS
archive/social-drafts.json     403  닫혀야 한다        PASS
archive/                       403                    PASS
events/distribution-content.json 403                  PASS
서명 없는 PUT                   403  직접 우회 불가     PASS
app/v3/index.html              200  종이 지구 그대로   PASS (CI 가 덮지 않았다)
```

---

## LAMBDA

```text
write path           events/social-drafts.json  →  archive/social-drafts.json
production version   BEFORE CodeSha256 zpmjaerUuMzy…  LastModified 2026-08-05
                     AFTER  CodeSha256 BOzRGd/k7/US…  LastModified 2026-09-08T08:05
배포 방법            ./aws/deploy-python.sh social-draft   (ap-northeast-2)
같이 배포            health  (감시 키를 새 자리로) 2026-09-08T08:22
```

**LIVE verification** — 배포한 코드를 다시 내려받아 확인하고, 실제로 실행했다:

```text
내려받은 zip 의 handler.py   DST = "archive/social-drafts.json" · _assert_private 있음
invoke 결과                  {"ok": true, "count": 2}
archive/social-drafts.json   생성됨 08:06:50 · 5,218바이트 · 익명 403
events/social-drafts.json    07:28:24 그대로 — **더 이상 쓰지 않는다**
새 문서 내용                 status=DRAFT · visibility=PRIVATE · 초안 2건 모두 DRAFT
health 감시 항목             archive/social-drafts.json · state ok · 19분 전
```

> ⚠️ 옛 코드는 **오늘 07:28 까지도 공개 키에 쓰고 있었다.** 그게 마지막 쓰기다.
> "코드를 고쳤다"와 "운영이 고쳐졌다"가 다르다는 것이 이 타임스탬프에 그대로 있다.

---

## APPROVAL

```text
DRAFT         공개 접근 금지   PASS   check_public_write 거부
FACT_CHECK    공개 접근 금지   PASS
REVIEW        공개 접근 금지   PASS
APPROVED      발행 전 금지     PASS   APPROVED→PUBLISHED 는 금지 전이
PUBLISHED     공개 허용        PASS
BYPASS TEST   9종 전부 막힘    PASS
```

아홉 가지 공격과 결과:

| | 공격 | 막은 곳 |
|---|---|---|
| 1 | DRAFT 를 공개 URL 로 | `publication_privacy.check_public_write` |
| 2 | BLOCKED 를 공개 URL 로 | 자격·안전등급·차단사유 세 갈래 전부 |
| 3 | APPROVED → DRAFT 로 되돌려 재사용 | 판본 지문 불일치 → `APPROVAL_INVALID` |
| 4 | PUBLISHED → DRAFT | `FORBIDDEN_TRANSITION` |
| 5 | 서명 밖 항목에 내용 숨기기 | `lifecycle`·`publication` 을 서명에 넣었다(INTEGRATION-4) |
| 6 | 사람처럼 보이는 서비스 계정 | 낱말 44개 대조 |
| 7 | autobot / system / lambda | 〃 |
| 8 | 숫자 우회 `system1`·`ci42`·`runner-7`·`deployer99` 등 30종 | 꼬리 숫자·복수형을 떼고 대조 |
| 9 | 승인 뒤 lifecycle 변경 | `APPROVAL_INVALID` |

**§12 승인 ≠ 자동 발행**도 시험이 못박는다: 상태 문자열만 `APPROVED` 면 `STATUS_ONLY`,
승인 방법이 `AUTO`·`PIPELINE`·`cron` 이면 예외, 검증 안 지난 문서는 승인이 있어도
`FORBIDDEN_TRANSITION`.

---

## READ-BACK

```text
PASS (로컬 어댑터 기준)
```

- MOCK 발행 → PUBLISHED 아님
- PREVIEW_ONLY → PUBLISHED 아님
- 되읽은 글 id 가 다르면 → PUBLISHED 아님
- `S3PublishAdapter.publish` 가 `check_public_write` 를 실제로 부른다(시험이 확인)

**운영 발행은 하지 않았다.** 승인된 리포트가 하나도 없고,
§14 가 새 콘텐츠 생성을 금지한다. 없는 승인을 만들어 발행하지 않았다.

---

## MANIFEST

```text
HASH   c5ecef71870a05b7b6b5c37fcf7156b2
파일   3,598줄 — 경로 · sha256 · 크기 · 원본 · 공개 사유 · 생성물 여부
위치   build/public-manifest.json   ← build/public-app **밖**
사유 분포   공개 결정 2,035 · 거름망 밖 제품 파일 1,557 · 허용 규칙 6
```

매니페스트 자체에도 공개 정책을 적용했다 — 무엇이 어디 있는지 통째로 알려 주는
지도이므로 공개 트리 밖에 둔다. 어떤 업로더도 집어 가지 않는다.

---

## TESTS

```text
TOTAL   417
PASS    417
FAIL    0

  report-engine + _shared   269   (+23 INTEGRATION-5)
  distribution               71
  cyclone-analog             26
  lab-events                  6
  npm (mjs)                  45
  N1 watch coverage        통과
  공개 빌드 누출 시험       통과 (거름망 밖 비공개 0)
```

---

## BROWSER

**걸러진 실제 빌드**(`build/public-app`)를 띄워서 확인했다.

```text
1440 KO    PASS   지구 렌더 · 리포트 패널 · 가로 스크롤 0 · 요소 넘침 0
1440 EN    PASS
375  EN    PASS
375  KO    PASS
CONSOLE                1  reports/index.json 403 — 발행된 보고서가 없다는 사실.
                          화면이 그대로 말한다. 동일 출처 오류 0.
HORIZONTAL OVERFLOW    0
```

거름망이 앱을 깨뜨리지 않았다는 확인(같은 서버에서):

```text
/v2-three/js/main.js                       200
/js/earthus2/v02/core/constants.js         200
/legal/terms.ko.md                         200
/space/…/panorama-2048.<hash>.webp         200
/README.md                                 404
/supabase/schema.sql                       404
/js/earthus2/v03/qa/fault-injection.js     404
/js/config.local.example.js                404
```

---

## BUNDLE

```text
SOURCE = DEPLOY   ✗  아니다
```

`prototype/v2-three` 와 `prototype/v2-deploy` 가 다르다. 원인을 확인했다:

```text
prototype/v2-three/js/pop-metric-menu.js   ?? 미추적 — 다른 세션의 새 파일
prototype/v2-three/js/main.js               M  PopMetricMenu 를 부르는 미커밋 변경
prototype/v2-three/index.html               M
prototype/v2-three/js/pop-sculpture.js      M
```

**다른 세션이 진행 중인 기능** 때문이다. 번들을 다시 만들면 그 미완성 작업이
`v2-deploy` 에 박히고 내 커밋에 섞인다 — §0-1 위반이라 **다시 만들지 않았다.**

내 INTEGRATION-4 변경(탭 의도 기계)은 소스와 번들 **양쪽에 다 있다**(`tabIntent` 3회,
`noted ? 'follow' : 'intent'` 1회). 어긋난 것은 저쪽 작업뿐이다.

---

## REGRESSION

```text
NEW REGRESSION      0
EXISTING FAILURE    0
UNRELATED FAILURE   8  (조건부)
```

`aws/_shared/tests/test_kma_hub.py` 8건이 **일부 pytest 호출 조합에서만** 실패한다.

```text
botocore.exceptions.MissingDependencyException:
  Using the login credential provider requires an additional dependency.
  You will need to pip install "botocore[crt]" before proceeding.
```

우리 코드가 아니라 이 컴퓨터의 AWS 설정이다 — `default` 프로파일이 로그인 공급자를
쓰는데 `botocore[crt]` 가 없다. 확인:

```text
python -m pytest aws/report-engine/tests aws/_shared        → 269 passed
python -m pytest .../test_integration4_boundary.py aws/_shared → 8 failed
AWS_PROFILE=earthus-deploy 로 같은 조합                      → 57 passed
```

고치는 법은 둘 중 하나: `pip install "botocore[crt]"`, 또는 정적 키 프로파일 사용.
`test_kma_hub.py` 는 다른 세션 파일이라 손대지 않았다.

---

## UNRELATED CHANGES

```text
COUNT            35 (추적 파일, 미커밋)
SNAPSHOT METHOD  git status --porcelain 을 작업 시작 시각에 저장 →
                 scratchpad/int5_baseline_status.txt. 커밋 뒤 교집합이 0인지 확인.
FILES (작업 중 다른 세션이 새로 건드린 것)
  prototype/index.html · prototype/css/readability.css
  prototype/js/readability.js · prototype/js/coastline-reference.js
  prototype/v2-three/index.html · js/main.js · js/pop-sculpture.js
  prototype/v2-three/js/pop-metric-menu.js (미추적)
```

전부 손대지 않았다. 커밋에 하나도 들어가지 않았다.

---

## FINAL

```text
PARTIAL / BLOCKED
```

## BLOCKERS

1. **공개 금지 객체 99건이 그대로 있다** (HTTP 200). §0-11 에 따라 FAIL.
   — `s3:DeleteObject` 권한 없음 (실측 확인)
   — 사용자 결정: 일단 대기
2. 그중 **34건이 DB 스키마·마이그레이션**이고 내용이 그대로 읽힌다.
3. `deploy-orbital-static.sh` 가 아직 거름망을 안 지난다 (인계 C).
   덧붙여 그 스크립트의 `--delete` 는 권한이 없어 실패한다 — 지금은 죽은 코드다.
4. 번들이 소스와 다르다 — 다른 세션 작업이 끝나야 다시 만들 수 있다.

## NEXT SAFE PHASE

권한을 붙이고 99건을 지운 뒤 `--audit-live` 가 0을 낼 때
`integration-5-production-boundary-lock.md` 를 만든다.
그 전까지는 UI·REPORT·MEDIA 개발을 **막지는 않는다** —
공개 경계는 앞으로 올라갈 것에 대해서는 닫혀 있다. 남은 것은 과거 잔존물이다.
