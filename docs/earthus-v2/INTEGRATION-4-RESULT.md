# EARTHUS V2 — INTEGRATION-4 RESULT

```text
STATUS:  PARTIAL
COMMIT:  (아래 "변경 파일" 참고 — 이 문서와 같은 커밋)
PARENT:  0d3dab8c
DATE:    2026-09-08
```

---

## 왜 PARTIAL 인가 — 한 문장

**코드는 전부 닫았고, 이미 올라가 있는 26개 객체는 못 지웠다.**
이 컴퓨터의 AWS 세션이 만료돼 있고(`aws sts get-caller-identity` → *session has expired*),
설령 살아 있어도 `earthus-deploy` 에 `s3:DeleteObject` 가 없다.
지우기 전에는 "승인되지 않은 것은 공개되지 않는다"가 **아직 사실이 아니다.**

---

## P0 BLOCKERS

### 1. `events/social-drafts.json` — 승인 전 SNS 초안

| | |
|---|---|
| 쓰는 곳 | `aws/social-draft/handler.py` — 람다가 S3 에 **직접** 쓴다. 공개 빌드 거름망 밖이다 |
| 바꾼 것 | `DST` 를 `archive/social-drafts.json` 으로 옮기고, 공개 접두사면 **예외를 던지는** `_assert_private()` 를 넣었다 |
| 같이 바꾼 것 | `aws/health/handler.py` 감시 키(S3 API 로 읽으므로 비공개여도 확인된다) · `prototype/js/studio.js` 는 공개 주소를 **놓았다** |
| 상태 어휘 | 문서와 각 초안에 `status: DRAFT` · `visibility: PRIVATE` 를 적는다(§0.5·§0.6) |
| CODE SAFETY | **PASS** — 새 자리 `archive/social-drafts.json` 은 실측 **403** |
| LIVE | **BLOCKED** — 옛 자리 `events/social-drafts.json` 은 실측 **200**. 람다 재배포도 못 했다 |

> ⚠️ 재배포 전까지는 **운영 람다가 여전히 옛 공개 키에 쓴다.** 코드를 고친 것과
> 운영이 고쳐진 것은 다르다. `aws/deploy-python.sh social-draft` (리전 ap-northeast-2)
> 를 자격증명이 있는 곳에서 돌려야 끝난다.

### 2. `app/supabase/schema.sql`

| | |
|---|---|
| 원본 | `prototype/supabase/schema.sql` (그 밖 22건 포함) |
| 거름망 | `("supabase/", …)` 와 `("*.sql", …)` 두 규칙이 **각각** 막는다 |
| `build/public-app/` | `.sql` **0건** |
| `deploy-app.sh` | `build/public-app` 만 올린다 — 복원 경로 없음 |
| CODE SAFETY | **PASS** |
| LIVE | **BLOCKED** — 실측 **200** (옛 배포 잔존물) |

### 3. DDL 4건

| 경로 | 생성 주체 | 빌드 | 배포 | HTTP | 공개 필요 |
|---|---|---|---|---|---|
| `js/earthus2/v07/postgres/20260826_v07_backend_metadata_contract.sql` | 엔진 v07 설계 | 막힘 | 안 올림 | **200** (잔존) | 없음 |
| `js/earthus2/v10/postgres/20260826_v10_backend_closed_loop.sql` | 엔진 v10 | 막힘 | 안 올림 | **200** | 없음 |
| `js/earthus2/v11/postgres/20260826_v11_advanced_intelligence.sql` | 엔진 v11 | 막힘 | 안 올림 | **200** | 없음 |
| `v2-deploy/engine-v11/postgres/…v11_advanced_intelligence.sql` | 번들 빌드 사본 | 막힘 | 안 올림 | **200** | 없음 |

`prototype/` 안의 `.sql` 은 모두 **27건**이고 27건 전부 막힌다.
앱 코드가 `.sql` 을 참조하는 곳은 **0건**(시험이 확인한다).

> **이 셋이 계속 새던 진짜 이유**는 배포 스크립트가 여러 개였기 때문이다.
> `aws/deploy-v2-preview.sh` 가 `prototype/js/earthus2` 를 통째로 `app/js/earthus2/` 로
> 동기화했고, `tools/deploy-v2-three.sh` 가 `v2-deploy/` 를 `app/v2/` 로 올렸다.
> `deploy-app.sh` 만 고쳐서는 닫히지 않는 구멍이었다 — §4 에서 같이 닫았다.

---

## PUBLIC BOUNDARY

```text
BUILD SOURCE   prototype/  →  aws/build-public.py (거름망)
DEPLOY SOURCE  build/public-app/   ← 공개에 올리는 모든 스크립트의 유일한 원본
ALLOWLIST      KEEP_RULES 2줄 · PUBLIC_BY_DECISION 12항목 (전부 이유가 적혀 있다)
FORBIDDEN      규칙 45줄 → 막는 경로 356 · 올리는 파일 3,597
MANIFEST HASH  29c7c30f39609606835bcccd4b662f4a0651b2c96377f8c9de02199b36102af1
```

### 배포 경계 통일 (§4)

공개 접두사에 올리는 스크립트 **15개**를 찾아, 12개를 `build/public-app` 으로 돌렸다.

```text
공통 도구  aws/_shared/public-source.sh
             public_source_root   거름망을 돌리고 build/public-app 을 준다
             public_file <경로>   막힌 파일이면 **멈춘다**. 조용히 건너뛰지 않는다
             public_dir  <경로>
```

| 스크립트 | 예전 원본 | 지금 |
|---|---|---|
| `aws/deploy-app.sh` | — | 이미 `build/public-app` (INTEGRATION-3) |
| `aws/deploy-v2-preview.sh` | `prototype/v2` · `prototype/js/earthus2` | `public_dir` |
| `aws/deploy-v3-kids.sh` | `prototype/v3-kids` | `public_dir` |
| `aws/deploy-v3-paper.sh` | `prototype/v3-paper` | `public_dir` (webp 변환 **뒤에** 거름망) |
| `tools/deploy-v1.sh` | `prototype/$f` | `public_file` (대입으로 받아 실패를 붙잡는다) |
| `tools/deploy-v2-three.sh` | `prototype/v2-deploy` | `public_dir` |
| `tools/deploy-real-living-earth-v2.sh` | `prototype/v2` | `public_dir` |
| `tools/deploy_ocean_public.sh` | `$REPO_ROOT/prototype/…` | `public_file` · `$PUBLIC_ROOT` |
| `tools/deploy_tourism_density.sh` | 〃 | `public_file` |
| `tools/deploy-station-model.sh` | 〃 | `public_file` (문법 검사도 걸러진 파일로) |
| `tools/deploy_aetherus_public_safe.sh` | 매니페스트 TSV | `public_file` |
| `tools/deploy_free_open_policy.sh` | 〃 | `public_file` |
| `tools/deploy_ocean_aetherus_v3_canary.sh` | 〃 | `public_file` |

면제 3개 — **생성물**을 올리므로 작업 트리와 무관하다. 이유를 코드에 적었다.

```text
aws/deploy-orbital-static.sh        build/orbital (내보내기 산출물)
tools/publish-aetherus-snapshot.sh  API 호출 결과
aws/deploy-app.sh                   build/public-app 을 직접 쓴다
```

> ⚠️ 통일이 **실제로 무언가를 막았다.** 매니페스트 두 개가
> `prototype/canary/ocean-aetherus-v3/*` 를 올리는데 내 `canary/` 규칙이 그걸 막고 있었다.
> 시험이 잡아 줘서 KEEP_RULES 로 되돌렸다 — 그 카나리는 점검 부스러기가 아니라
> **실제로 배포되는 화면**이다. 거름망을 넓게 치면 이런 것이 조용히 깨진다.

### 금지 부류 훑기 (§5) — 규칙과 독립으로 찾은 것

부류별로 훑어 **11가지 규칙을 새로 넣었다.** 전부 "앱이 읽지 않는다"를 실제로 확인했다.

```text
v3-paper/data/*.py                      자료 준비 스크립트(numpy·PIL) 3건
v3-paper/data/trench-bathymetry-audit.json  감사 산출물
v3-paper/data/weather-source-*.json     2026-09-04 에 받아 둔 피드 사본 4건 (런타임은 S3 직독)
v3-kids/characters/*/*_master_sheet.png 캐릭터 제작 원본 1.05MB
v3-kids/character-config.js             저작 도구의 네 번째 파일 (셋만 막고 있었다)
js/earthus2/config/                     내부 통합 명세 — 커밋 SHA·경로 상태
js/earthus2/*/qa/*                      QA 하네스(결함 주입 등) 5건
js/config.local.example.js              개발자 설정 서식
space/skybox/*/source-*.webp            제작 원본 파노라마
space/skybox/*/panorama.webp            해시 없는 옛 파노라마 2건
```

**넣지 않은 것과 이유:**

- `aetherus-device-qa.html` — `aetherus-lab.html:19` 가 링크한다. 막으면 죽은 링크가 남는다.
  링크까지 같이 정리해야 한다(인계).
- `character-core.js` 안의 프롬프트·모델명·장당 단가 — 런타임이 그 모듈을 쓴다.
  쪼개야 하는데 그 파일은 지금 다른 세션이 고치고 있다(인계).
- `data/aetherus/*.json` DRAFT 계약 — `aetherus-lab.html` 이 읽는다. 막으면 화면이 깨진다.
  내용을 줄이는 쪽이 맞다(인계).

---

## LIVE PRODUCTION PROBE

`python3 aws/verify-public-access.py` — 자격증명 없이 실제 공개 주소를 두드린 결과.

| 항목 | 결과 |
|---|---|
| `app/index.html` | **PASS** 200 (열려야 한다) |
| `events/social-drafts.json` | **FAIL** 200 — 옛 자리 잔존물 |
| `archive/social-drafts.json` | **PASS** 403 — 새 자리는 닫혀 있다 |
| `events/distribution-content.json` | **PASS** 403 |
| `archive/` | **PASS** 403 |
| `app/supabase/schema.sql` | **FAIL** 200 |
| `app/README.md` (내부 문서) | **FAIL** 200 |
| `app/v3-paper/README.md` | **PASS** 403 |
| `app/v2-deploy/…/v11_advanced_intelligence.sql` | **FAIL** 200 |
| **서명 없는 PUT** | **PASS** 403 — 직접 우회 불가 |

`--audit-denied` 로 거름망이 막는 **358 경로를 전부** 두드렸다:

```text
이미 공개(지워야 함)  26
확인 못 함             0     ← UNKNOWN 은 실패로 센다. 하나도 없다
```

| 부류 | 건수 |
|---|---:|
| DB 스키마·DDL | 5 |
| 내부 문서(README·NEXT_STEPS·자산 노트) | 7 |
| QA 하네스 | 5 |
| 내부 구성 명세 | 2 |
| 스카이박스 원본·옛 파일 | 3 |
| 개발자 설정 서식 | 1 |
| 카나리 점검 산출물 | 1 |
| SNS 초안(옛 자리) | 1 |
| 문자 그대로 **전부** | **26** |

> ⚠️ INTEGRATION-3 인계 D 에 적었던 "17건"은 **손으로 적은 목록이었고 재현되지 않았다.**
> 이제 목록은 거름망에서 나온다 — `aws/verify-public-access.py --audit-denied`.
> 26건은 그 결과이고, 규칙을 더하면 자동으로 늘어난다.

### 감사가 틀렸던 것 하나 — 실측으로 바로잡음

다중 에이전트 감사가 `app/supabase/.temp/` 8건(포스트그레스 풀러 접속 문자열 포함)이
공개라고 P0 로 보고했다. **직접 두드려 보니 403 이다.**
`pooler-url` · `project-ref` · `linked-project.json` 전부 403 — 올라간 적이 없다.
접두사가 열려 있다고 그 아래가 다 열린 것은 아니다. 보고를 그대로 받아 적지 않았다.

---

## APPROVAL GOVERNANCE

`aws/_shared/governance.py` — INTEGRATION-3 의 규칙을 유지하고, 감사가 **실제로 뚫은**
세 구멍을 막았다.

```text
STATUS             PASS
APPROVED_BY        요구 · 시스템 계정 차단 (낱말 44개, 꼬리 숫자·복수형까지)
APPROVED_AT        요구
APPROVAL_METHOD    UI_CLICK · CLI_CONFIRM · SIGNED_TOKEN 만
APPROVAL_REVISION  sha256 · lifecycle 과 publication 도 이제 **서명에 들어간다**
```

### 뚫려 있던 세 가지

| 구멍 | 어떻게 뚫렸나 | 막은 방법 |
|---|---|---|
| 시스템 계정 | `^(system\|auto\|bot…)\b` 의 `\b` 는 글자와 숫자 사이에 경계를 두지 않는다 → **`system1` 이 사람으로 통과**했다. `systemd` · `autobot9` · `lambda2` · `Systems` 도 전부 | 이름을 토막으로 끊고 꼬리 숫자·복수형을 떼어 낸 뒤 낱말 44개와 대조 |
| lifecycle 서명 누락 | 검증을 안 지난 초안을 승인한 뒤 `lifecycle` 만 `PUBLISHED` 로 바꾸면 승인이 살아 있었다. 발행 어댑터는 `lifecycle` 하나만 본다 | `lifecycle` · `publication` 을 서명에 넣었다. 게다가 승인이 있어도 `lifecycle` 이 DRAFT/GENERATING 이면 APPROVED 로 치지 않는다 |
| 상태 자기신고 | `gate()` 가 문서가 적어 둔 `governanceState` 를 그대로 믿었다 | 항상 다시 계산하고, 적어 둔 값이 다르면 `STATE_MISMATCH` |

실측:

```text
system1 · systemd · autobot9 · lambda2 · Systems · deployer · svcacct
· earthus-automation-1 · nightly-job · runner-7      →  전부 차단
dalur · kim.minji · 이수진 · j.doe@earthus.net · PD  →  전부 통과
승인 뒤 lifecycle 뒤집기                              →  APPROVAL_INVALID
초안을 승인하고 발행 시도                              →  FORBIDDEN_TRANSITION
governanceState 자기신고                              →  STATE_MISMATCH
```

### 부르지 않던 검사를 부르게 했다

`publication_privacy.check_public_write()` 는 INTEGRATION-2 가 "§5 의 핵심 검사"라고
적어 놓고도 **부르는 곳이 시험뿐이었다.** 이제 `S3PublishAdapter.publish()` 가
공개 키에 쓰기 직전에 부른다. 부르지 않는 검사는 검사가 아니다.

---

## TESTS

```text
TOTAL   394
PASS    394
FAIL    0

  report-engine + _shared   246   (+20 INTEGRATION-4 경계 시험)
  distribution               71
  cyclone-analog             26
  lab-events                  6
  npm (mjs)                  45
  N1 watch coverage        통과   (예정 산출물 57 · 감시 58)
  공개 빌드 누출 시험       통과   (거름망 밖 비공개 0)
```

새 시험 `aws/report-engine/tests/test_integration4_boundary.py` 20건:
초안 비공개 7 · 스키마/DDL 3 · 배포 경계 5 · 금지 부류 2 · 실제 산출물 3.

---

## MOBILE / DESKTOP

**걸러진 실제 빌드**(`build/public-app`)를 그대로 띄워서 확인했다 — 작업 트리가 아니다.
거름망이 앱을 깨뜨렸는지 보려면 그래야 한다.

| | 화면 | 가로 스크롤 | 요소 넘침 | 리포트 패널 |
|---|---|---|---|---|
| 1440 KO | 지구 렌더 OK | 0 | 0 | 열림 |
| 1440 EN | OK | 0 | 0 | 열림 |
| 375 EN | OK | 0 | 0 | 열림 |
| 375 KO | OK | 0 | 0 | 열림 |

```text
동일 출처 요청     전부 200 (모듈 60여 개 · 지도·아이스시트·로고 포함)
CONSOLE ERRORS    1 — reports/index.json 403 (아직 발행된 보고서가 없다)
                      화면이 그 사실을 그대로 말한다. 같은 출처 오류 0.
막힌 자산 확인     README.md 404 · supabase/schema.sql 404 · source-panorama.webp 404
                  legal/terms.ko.md 200 · panorama-2048.<hash>.webp 200
```

---

## S3 CLEANUP

```text
CODE SAFETY   PASS     새 배포는 26건 중 어느 것도 올리지 않는다
LIVE CLEANUP  BLOCKED  둘 다 막혀 있다:
                       ① 이 컴퓨터의 AWS 세션 만료 (aws sts → session has expired)
                       ② earthus-deploy 에 s3:DeleteObject 없음
                          (aws/deploy.sh:52 · deploy-python.sh:71 · deploy-lite.sh:58
                           전부 GetObject·PutObject 만 준다)
```

권한을 우회하지 않았고 임의 삭제도 시도하지 않았다.

### 사람이 할 일 (자격증명 있는 곳에서)

```bash
# 1) 권한 (app/* 와 옛 초안 키에 한정)
aws iam put-user-policy --user-name earthus-deploy --policy-name cleanup-delete \
  --policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow",
    "Action":"s3:DeleteObject","Resource":[
      "arn:aws:s3:::earthus-cache-kr/app/*",
      "arn:aws:s3:::earthus-cache-kr/events/social-drafts.json"]}]}'

# 2) 지울 목록을 다시 만든다 (손으로 적지 않는다)
python3 aws/verify-public-access.py --audit-denied

# 3) 위 목록의 각 줄을
aws s3 rm s3://earthus-cache-kr/<경로> --region us-east-2

# 4) 람다를 새 코드로 올린다 (초안이 archive/ 로 가게)
./aws/deploy-python.sh social-draft      # ap-northeast-2

# 5) 다시 확인 — 목록이 비고 probe 가 전부 통과해야 한다
python3 aws/verify-public-access.py --audit-denied
python3 aws/verify-public-access.py
```

> ⚠️ `deploy-app.sh` 의 `--delete` 는 **되살리지 않는다.** 그 스크립트의 원본은
> `build/public-app` 이고 거기에는 `v3/` · `orbital/` · `aetherus/` 가 없다.
> `--delete` 를 켜면 다른 스크립트가 올린 그 세 갈래를 지운다.
> 청소는 위 3번처럼 **키를 지정해서** 한다.

---

## FINAL DECISION

```text
PARTIAL / BLOCKED
```

| 조건 | 결과 |
|---|---|
| `events/social-drafts.json` 공개 노출 = 0 | ❌ 코드 PASS · 라이브 200 |
| `app/supabase/schema.sql` 공개 노출 = 0 | ❌ 코드 PASS · 라이브 200 |
| DDL 4건 공개 노출 = 0 | ❌ 코드 PASS · 라이브 200 |
| 기존 P0 잔존물 cleanup 완료 | ❌ 26건 남음 |
| S3 delete 권한 문제 해결 | ❌ 세션 만료 + 권한 없음 |
| 배포 스크립트 공개 경계 통일 | ✅ 12개 전환 · 3개 면제(이유 기록) |
| `build/public-app` 이 유일한 공개 원본 | ✅ 시험이 강제한다 |
| 공개 빌드 negative audit | ✅ 부류 훑기 통과 · 규칙 11줄 추가 |
| actual artifact audit | ✅ 빌드된 트리 = 계획 · 지문 고정 |
| approval governance | ✅ 구멍 3개 막음 |
| hash verification | ✅ `lifecycle`·`publication` 서명 포함 |
| production HTTP probe | ❌ 4건 FAIL (위 잔존물) |
| 1440 KO / EN | ✅ |
| 375 EN / KO | ✅ |
| console errors = 0 | ⚠️ 1 (reports/index.json 403 — 발행본 없음, 화면이 그대로 말한다) |
| regression tests | ✅ 394/394 |
| unrelated files = 0 변경 | ✅ |
| git ancestry 정상 | ✅ parent 0d3dab8c |
| final commit / report | ✅ |

**하나라도 FAIL 이면 PARTIAL** — 규칙대로 PARTIAL 이다.
남은 것은 전부 "지울 권한"과 "람다 재배포" 하나로 풀린다.

---

## 변경 파일과 이유

| 파일 | 왜 |
|---|---|
| `aws/social-draft/handler.py` | §0 초안 저장 위치를 `archive/` 로. 공개 접두사 쓰기 차단 · 상태 어휘 기록 · S3 클라이언트 지연 생성(시험이 읽을 수 있게) |
| `aws/health/handler.py` | §0 감시 키를 새 위치로 |
| `prototype/js/studio.js` | §0 공개 주소로 초안을 받지 않는다. 인증 경로가 생기면 `window.EARTHUS_ADMIN_DRAFTS_URL` 로 연결 |
| `tools/test_n1_watch_coverage.py` | §0 감시 목록 동기화 |
| `aws/_shared/publication_privacy.py` | §0 알려진 구멍 설명을 실제 상태로 (코드는 닫혔고 옛 객체가 남았다) |
| `aws/_shared/public_build.py` | §5 금지 부류 규칙 11줄 · 카나리 화면 KEEP · 규칙 45줄 |
| `aws/_shared/public-source.sh` **(새 파일)** | §4 공개 원본을 한 곳으로. 막힌 파일이면 배포를 멈춘다 |
| `aws/deploy-v2-preview.sh` | §4 `prototype/js/earthus2` 통째 업로드 중단 (DDL 유출 경로) |
| `aws/deploy-v3-kids.sh` | §4 원본 전환 |
| `aws/deploy-v3-paper.sh` | §4 원본 전환 · webp 변환 뒤에 거름망을 돌리도록 순서 고정 |
| `tools/deploy-v2-three.sh` | §4 `v2-deploy` DDL 유출 경로 차단 |
| `tools/deploy-v1.sh` | §4 원본 전환 · 실패를 대입으로 붙잡기(빈 인자로 계속 가던 것) |
| `tools/deploy-real-living-earth-v2.sh` | §4 원본 전환 |
| `tools/deploy_ocean_public.sh` | §4 원본 전환 (재귀 업로드 3곳 포함) |
| `tools/deploy_tourism_density.sh` | §4 원본 전환 |
| `tools/deploy-station-model.sh` | §4 원본 전환 · 문법 검사도 걸러진 파일로 |
| `tools/deploy_aetherus_public_safe.sh` | §4 매니페스트 항목을 거름망에 묻는다 |
| `tools/deploy_free_open_policy.sh` | §4 〃 |
| `tools/deploy_ocean_aetherus_v3_canary.sh` | §4 〃 |
| `aws/_shared/governance.py` | §7 시스템 계정 판정 · lifecycle/publication 서명 · 상태 자기신고 차단 |
| `aws/report-engine/publisher.py` | §7 공개 키 쓰기 직전에 `check_public_write` 를 부른다 |
| `aws/verify-public-access.py` | §3·§8 새 초안 키 probe · 403/404 구분 · `--audit-denied` 로 청소 목록 재현 |
| `aws/report-engine/tests/test_integration4_boundary.py` **(새 파일)** | §0·§1·§2·§4·§5·§6 시험 20건 |
| `docs/earthus-v2/INTEGRATION-4-RESULT.md` **(새 파일)** | 이 문서 |
| `docs/earthus-v2/INTEGRATION-4-HANDOFF.md` **(새 파일)** | 남은 것 |

**UNRELATED 0** — 다른 세션의 추적 파일에 손대지 않았다. 작업 중 다른 세션이
`prototype/index.html` · `css/readability.css` · `js/readability.js` ·
`js/coastline-reference.js` 를 고쳤고, 그 넷은 건드리지 않았다.
