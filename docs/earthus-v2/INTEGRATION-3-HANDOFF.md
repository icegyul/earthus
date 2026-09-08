# EARTHUS V2 INTEGRATION-3 HANDOFF

```text
PARENT:  a73ceeee
DATE:    2026-09-08
```

이 세션이 **고치지 않은 것**과, 그것이 왜 남았는지. 각 항목은
현재 동작 / 위험 / 해야 할 일 / 소유 / 차단 등급 순이다.

차단 등급:
`P0` 운영 위험이 지금 있다 · `P1` 다음 단계 전에 필요하다 · `P2` 구조 정리

---

## A. 배포 CLI 가 사람 승인을 자동으로 찍는다

**현재 동작**
`aws/distribution/cli.py:243`

```python
for step in ("FACT_CHECK", "REVIEW", "APPROVED"):
    c = cc.transition(c, step, actor=args.actor, at=at, note="CLI")
```

한 줄로 초안을 승인 상태까지 끌고 간다. 사람은 아무것도 보지 않았다.
`:266` 이 이어서 `PUBLISHED` 로 보낸다.

**위험**
승인란이 아무 정보도 담지 않게 된다. "누가 승인했나"에 CLI 를 돌린 계정 이름이
적히지만 그 계정은 내용을 읽지 않았다. 사고가 났을 때 되짚을 것이 없다.

**해야 할 일**
`FACT_CHECK → REVIEW` 까지만 CLI 가 걸고, `APPROVED` 는
`aws/_shared/governance.approve(doc, approved_by=…, approved_at=…, approval_method=…)`
를 거치게 한다. 시스템 계정은 그 함수가 이미 막는다.

**완화된 부분**
이번 단계에서 **발행 쪽 문은 이미 닫았다.** `social_publish.approval_state()` 는
상태 문자열만 `APPROVED` 이고 사람 승인 기록이 없으면 `STATUS_ONLY` 를 돌려주고,
`publish_platform()` 이 거기서 멈춘다. 즉 cli.py 가 상태를 찍어도 **발행되지 않는다.**
남은 문제는 화면·기록에 "승인됨"으로 보인다는 것이다.

**소유** 다른 세션 (`aws/distribution/cli.py`)
**차단 등급** `P1`

---

## B. 리드를 합친 평균이 아직 남아 있는 계산기들

**현재 동작**
INTEGRATION-2 가 태풍 위치·방향(`aws/cyclone-analog/handler.py`)과 오로라
(`aws/lab-events/handler.py`)에서 교차리드 순위를 없앴다. 오로라는 표기를
`리드 합산`으로 고치고 우열 선언을 지웠다(`handler.py:480-488`).

아직 손대지 않은 것: `lab-events` 의 나머지 계산기 — 여진 · 화산재 · 대기질 · 표류.
이들도 여러 예보 시각을 한 평균으로 묶는다.

**위험**
공개 제품에서 금지한 것과 같은 종류다. 리드마다 승자가 다를 수 있는데
뭉친 숫자가 그 사실을 지운다.

**해야 할 일**
각 계산기의 검증 표에 `byLead` 를 싣고, 순위를 세울 때는 같은 리드끼리만 비교한다.
`cyclone-analog/handler.py` 의 `lead_separated_ranking()` 이 본보기다.

**소유** 이 세션 파일이지만 이번 범위 밖 (INTEGRATION-3 은 거버넌스가 주제였다)
**차단 등급** `P1`

---

## C. 리포트 절 구성이 두 벌이다

**현재 동작**

| 파일 | 절 어휘 | 쓰는 곳 |
|---|---|---|
| `aws/report-engine/sections.py` | 16절 (`executive_summary`, `earth_in_numbers`, `atmosphere`, `cryosphere` …) | `export.py:24` |
| `aws/report-engine/compose.py` | 월간 15 · 분기 11 · 연간 12 (`cover`, `this_month`, `top_stories`, `weather` …) | `pipeline.py` · `integration_e2e.py` · Report Center |

두 어휘가 **겹치지 않는다.** 화면(`prototype/v2-three/js/report-center.js`)의
`FREE_SECTIONS` 는 compose 쪽 id 를 쓴다. sections.py 의 id 로 만든 보고서는
무료 구간 판정이 통째로 어긋난다.

**위험**
같은 개념에 정본이 둘이면 한쪽만 고쳐도 다른 쪽으로 샌다 — INTEGRATION-1 에서
이미 겪은 실패 방식이다. 지금은 두 경로가 서로 다른 산출물을 내고 있어
"보고서 절 id" 가 무엇인지 코드가 대답하지 못한다.

**해야 할 일**
하나를 정본으로 고르고 다른 쪽을 그 위의 얇은 층으로 바꾼다.
화면과 발행 URL 이 이미 compose 어휘에 묶여 있으므로 compose 가 정본이 되는 편이
깨는 것이 적다. 정하기 전에는 `export.py` 가 어느 쪽을 받는지 호출부에서 확인할 것.

**소유** 다른 세션 (`sections.py` · `export.py`)
**차단 등급** `P2`

---

## D. 이미 공개된 객체는 거름망이 지우지 못한다  ★P0

**현재 동작 (2026-09-08 실측)**
이번 단계가 만든 공개 빌드 거름망은 **앞으로 올라갈 것**을 막는다.
`earthus-deploy` 에 `s3:DeleteObject` 가 없어 `aws s3 sync --delete` 를 못 쓰므로,
예전 배포가 이미 올려 둔 객체는 그대로 남는다.

`aws/verify-public-access.py` 로 확인한 결과 — 거름망이 막는 경로 338건 중
**17건이 지금 공개 주소에서 200 으로 읽힌다**:

```text
app/README.md
app/legal/README.md
app/v2/README.md
app/js/earthus2/greenfield/README.md
app/space/planets/README.md
app/space/skybox/earthus-milky-way/README.md
app/img/ocean-dive-assets.md
app/v2-three/NEXT_STEPS.md
app/supabase/schema.sql
app/js/earthus2/v07/postgres/20260826_v07_backend_metadata_contract.sql
app/js/earthus2/v10/postgres/20260826_v10_backend_closed_loop.sql
app/js/earthus2/v11/postgres/20260826_v11_advanced_intelligence.sql
app/v2-deploy/engine-v11/postgres/20260826_v11_advanced_intelligence.sql
app/canary/aetherus-device-rc-rollback-probe.json
app/canary/ocean-aetherus-v3/index.html
app/canary/ocean-aetherus-v3/canary.js
app/canary/ocean-aetherus-v3/canary.css
```

가장 무거운 것은 **DB 스키마 5건**이다 — 테이블·RLS 정책·RPC 이름이 그대로 읽힌다.
`legal/README.md` 는 INTEGRATION-2 가 `--exclude` 한 파일인데도 공개다.
제외는 이미 올라간 것을 내리지 않는다는 증거다.

**서명 없는 쓰기는 막혀 있다** — `PUT _integration3-bypass-probe/...` → 403.
직접 우회로 무언가를 심을 수는 없다. 문제는 **읽기**다.

**해야 할 일**
1. `earthus-deploy` 에 `s3:DeleteObject`(`app/*` 한정) 를 붙인다.
2. 위 17건을 지운다.
3. `aws/deploy-app.sh` 의 `--delete` 를 되살린다.
4. `python3 aws/verify-public-access.py` 가 전부 기대대로 나오는지 확인한다.

**소유** 버킷 정책 = 운영자. 스크립트는 이 세션 파일.
**차단 등급** `P0`

---

## E. SNS 초안이 공개 주소에서 읽힌다  ★P0

**현재 동작**
`https://earthus-cache-kr.s3.us-east-2.amazonaws.com/events/social-drafts.json` → **200**.

이 파일은 배포가 올리는 것이 아니다. `aws/social-draft/handler.py:37` 이
`s3://<CACHE_BUCKET>/events/social-drafts.json` 으로 **직접 쓴다.**
따라서 공개 빌드 거름망으로는 닫히지 않는다(거름망에는 규칙을 넣어 두었지만,
그 규칙은 배포 경로만 덮는다).

읽는 쪽은 `prototype/js/studio.js:392` 하나뿐이고, 그 화면은 자격증명 없이 이 파일을 받는다.

**위험**
사람이 승인하기 전의 문구가 공개돼 있다. 그 문구는 아직 검수되지 않은 주장이다.

**해야 할 일**
키를 `archive/social-drafts.json`(비공개 접두사)으로 옮기고,
`studio.js` 가 인증된 관리 API 를 거쳐 읽게 한다.
`aws/health/handler.py:115` 가 이 키의 신선도를 보고 있으므로 같이 바꿔야 한다.

**소유** `aws/social-draft/handler.py` · `aws/health/handler.py` · `prototype/js/studio.js`
**차단 등급** `P0` (INTEGRATION-2 인계 E 가 그대로 남았다)

---

## F. `config.local.js` 에 운영자 UUID 가 실려 나간다

**현재 동작**
`prototype/js/config.local.js` 는 `.gitignore` 가 "절대 커밋 금지"로 표시한 파일인데
공개 빌드에는 들어간다. 앱이 로그인·결제에 쓰기 때문이다(그래서
`public_build.PUBLIC_BY_DECISION` 에 **이유를 적어** 통과시킨다).

같은 파일에 `ADMIN_UIDS: ['1c73ceec-…']` 가 들어 있다.

**위험**
Supabase anon 키는 공개 전제이고 RLS 가 막는다 — 그건 문제가 아니다.
운영자 UUID 노출은 다르다. 공격 표면을 좁히는 정보다.

**해야 할 일**
관리자 판정을 클라이언트 목록에서 DB(`admins` 테이블 + RLS)로 옮기고
`ADMIN_UIDS` 를 파일에서 뺀다. `prototype/admin.html:238-265` 에 이미 그 테이블이 있다.

**소유** 다른 세션 (`prototype/admin.html` 은 이번에 다른 세션이 손대고 있다)
**차단 등급** `P1`

---

## G. 인증 없는 관리 화면이 공개 주소에 있다

**현재 동작**
`app/` 아래에 `admin.html` · `studio.html` · `distribution.html` ·
`social-settings.html` · `members.html` 이 있다. 화면 자체는 Supabase 로그인 게이트를
두지만, `robots.txt:117-118` 이 스스로 적어 둔 대로 *"이 규칙 자체는 인증 수단이 아니다"*.

이번 단계에서 **막은 것**: 그 화면들이 자격증명 없이 읽던 자료 파일
(`events/distribution-content*`, `events/social-drafts.json`)을 공개 빌드에서 뺐다.
**막지 않은 것**: 화면 파일 자체. 빼면 운영자의 작업 흐름이 끊긴다.

`v3-kids/character-studio.*` 는 인증이 아예 없는 저작 도구라 **뺐다.**

**해야 할 일**
관리 화면을 별도 origin 이나 인증 뒤로 옮긴다. 지금처럼 두려면 최소한
`robots.txt` 의 Disallow 목록에 `distribution.html` · `social-settings.html` ·
`verify.html` · `station.html` · `canary/` 를 더한다(현재 빠져 있다).

**소유** 배포 구조 = 운영자
**차단 등급** `P2`

---

## H. 시각자산 검사가 세 곳에 흩어져 있다

**현재 동작**
같은 사실을 세 곳이 각자 검사한다:

| 검사 | 위치 |
|---|---|
| 레이어 일치 | `governance.visual_asset_check` · `capture.verify_capture` · `tools/earthus_capture.mjs` |
| 픽셀 검사 | 같은 셋 |
| 파일 되읽기 | 같은 셋 |

**이미 한 번 갈라졌다.** 이번 단계에서 `governance` 쪽이 `readBack.ok` · 맨헥스
`fileHash` 를 보도록 잘못 썼는데, 실제 산출물은 `readBack.hashMatches` ·
`sha256:<hex>` 였다. 그대로 뒀으면 **확인된 자산이 전부 막혔을 것이다.**
지금은 고쳤고, 디스크의 진짜 산출물을 보는 시험
(`test_integration2.py::test_진짜_캡처_산출물도_문을_통과한다`)을 넣어 재발을 막았다.
조건 이름 목록은 `governance.CAPTURE_VERIFY_CONDITIONS` 로 정본을 하나로 모았다.

**해야 할 일**
값 판정도 한 곳으로 모은다. `capture.verify_capture` 가 조건을 판정하고
`governance` 는 그 결과만 읽는 구조가 맞다.

**소유** 이 세션
**차단 등급** `P2`

---

## 참고 — 이번 단계가 닫은 것

| | |
|---|---|
| 공개 빌드 원본 분리 | 작업 트리 대신 `build/public-app/` 만 올린다 |
| 누출 시험 | 거름망을 빠져나간 비공개가 있으면 **빌드가 멈춘다** |
| 사람 승인 | 시스템 계정 차단 · 네 항목 기록 · 방법 어휘 제한 |
| 승인 판본 잠금 | 승인 뒤 내용이 바뀌면 `APPROVAL_INVALID` |
| 발행 상태 기계 | 상태 8종 · 허용 15길 · 금지 49길 전부 사유가 붙는다 |
| 시각자산 공개 조건 | 여덟 가지 · 하나라도 어긋나면 `PUBLIC_CONTENT_INVALID` |
| 탭 경쟁 | `setTimeout` 재선택 제거 · 마지막 사용자 의도가 이긴다 |
| 직접 우회 | 서명 없는 쓰기 403 **실측** |
