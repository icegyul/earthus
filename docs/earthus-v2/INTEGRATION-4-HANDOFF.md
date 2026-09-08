# EARTHUS V2 INTEGRATION-4 HANDOFF

```text
PARENT:  0d3dab8c
DATE:    2026-09-08
```

INTEGRATION-3 인계에서 **닫힌 것**과 **남은 것**, 그리고 이번에 새로 찾은 것.

차단 등급: `P0` 지금 위험 · `P1` 다음 단계 전 · `P2` 구조 정리

---

## INTEGRATION-3 인계의 처리 결과

| 항목 | 상태 |
|---|---|
| A. 배포 CLI 자동 승인 | **남음** — 아래 A 로 이어간다 |
| B. 리드 합산 계산기 | **남음** — 아래 B |
| C. 절 구성 두 벌 | **남음** — 아래 C |
| D. 이미 공개된 객체 | **부분** — 목록이 이제 재현된다(17 → 실측 26). 삭제는 여전히 막힘 → 아래 D |
| E. SNS 초안 공개 | **코드 닫힘** — 쓰는 자리·읽는 자리 둘 다. 옛 객체와 람다 재배포가 남음 → 아래 D |
| F. `config.local.js` 의 ADMIN_UIDS | **남음** — 아래 F |
| G. 인증 없는 관리 화면 | **부분** — 자료는 닫혔고 화면은 남음 → 아래 G |
| H. 시각자산 검사 세 곳 | **남음** — 아래 H |

---

## D. 이미 공개된 객체 26건 + 람다 재배포  ★P0

**현재**
`aws/verify-public-access.py --audit-denied` 가 거름망이 막는 358 경로를 두드려
**26건이 공개(200)** 임을 확인했다. 확인 못 한 항목 0.

```text
DB 스키마·DDL 5 · 내부 문서 7 · QA 하네스 5 · 내부 구성 명세 2
스카이박스 원본 3 · 개발자 서식 1 · 카나리 산출물 1 · SNS 초안(옛 자리) 1
```

**막힌 이유 두 가지**
1. 이 컴퓨터의 AWS 세션 만료 — `aws sts get-caller-identity` → *session has expired*
2. `earthus-deploy` 에 `s3:DeleteObject` 없음
   (`aws/deploy.sh:52` · `deploy-python.sh:71` · `deploy-lite.sh:58` 전부 Get·Put 만)

**할 일** — [RESULT 의 S3 CLEANUP 절](INTEGRATION-4-RESULT.md)에 명령까지 적어 두었다.
요약: 권한 부여 → `--audit-denied` 로 목록 재생성 → 키 지정 삭제 →
`./aws/deploy-python.sh social-draft` → 다시 확인.

⚠️ `deploy-app.sh` 의 `--delete` 는 되살리지 마라. 그 원본(`build/public-app`)에는
`v3/` · `orbital/` · `aetherus/` 가 없어서, 켜면 다른 스크립트가 올린 것을 지운다.

**소유** 버킷 정책·자격증명 = 운영자
**등급** `P0`

---

## A. 배포 CLI 가 사람 승인을 자동으로 찍는다

**현재** `aws/distribution/cli.py:243`

```python
for step in ("FACT_CHECK", "REVIEW", "APPROVED"):
    c = cc.transition(c, step, actor=args.actor, at=at, note="CLI")
```

**이번 단계에서 확인된 것**: `cli.py` 는 `governance` 를 **import 조차 하지 않는다.**
자기 상태 기계를 따로 돌린다.

**완화** 발행 쪽 문은 닫혀 있다 — `social_publish.approval_state()` 가 `STATUS_ONLY`
를 돌려주고 `publish_platform()` 이 멈춘다. 상태를 찍어도 **나가지 않는다.**
남은 문제는 화면·기록에 "승인됨"으로 보인다는 것.

**할 일** `FACT_CHECK → REVIEW` 까지만 CLI 가 걸고, `APPROVED` 는
`governance.approve(...)` 를 거치게 한다.

**소유** 다른 세션 (`aws/distribution/cli.py`) · **등급** `P1`

---

## B. 리드를 합친 평균이 남아 있는 계산기

`lab-events` 의 여진 · 화산재 · 대기질 · 표류. 본보기는
`cyclone-analog/handler.py` 의 `lead_separated_ranking()`.

**소유** 이 세션 파일이지만 이번 범위 밖 · **등급** `P1`

---

## C. 리포트 절 구성이 두 벌이다

`aws/report-engine/sections.py`(16절) 와 `compose.py`(월간 15·분기 11·연간 12)가
서로 겹치지 않는 절 id 를 쓴다. 화면의 `FREE_SECTIONS` 는 compose 쪽이다.

**소유** 다른 세션 (`sections.py` · `export.py`) · **등급** `P2`

---

## E. `check_public_write` 를 부르지 않는 60여 개 쓰기 자리

**현재** 감사 결과: `publication_privacy.check_public_write()` 는 INTEGRATION-2 가
"§5 의 핵심 검사"라고 적어 두고도 **부르는 곳이 시험뿐**이었다.
이번에 `S3PublishAdapter.publish()` 한 곳을 연결했다(리포트 발행 경로).

남은 것: `aws/**` 의 나머지 `put_object` 자리들. 대부분은 정당하게 공개인 관측 피드라
전부를 통과시킬 필요는 없지만, **승인 개념이 있는 산출물**을 쓰는 자리는 지나야 한다.
특히 `aws/distribution/handler.py` 가 DRAFT 본문을 공개 `events/` 에 쓴다 —
차단 목록이 `BLOCKED`·`LEVEL_3` 만 거른다.

**소유** `aws/distribution/handler.py` 는 다른 세션 · **등급** `P1`

---

## F. `config.local.js` 의 운영자 UUID

`ADMIN_UIDS: ['1c73ceec-…']` 가 공개 번들에 실려 나간다.
파일 자체는 로그인·결제에 필요해서 `PUBLIC_BY_DECISION` 에 이유와 함께 두었다.

**할 일** 관리자 판정을 DB(`admins` 테이블 + RLS)로 옮기고 목록을 파일에서 뺀다.
`prototype/admin.html:238-265` 에 그 테이블이 이미 있다.

**소유** 다른 세션(`prototype/admin.html`) · **등급** `P1`

---

## G. 공개 주소에 남아 있는 내부 화면 셋

이번에 **자료**는 닫았지만 **화면 파일**은 남겼다. 각각 이유가 다르다.

| 화면 | 왜 남겼나 | 할 일 |
|---|---|---|
| `studio.html` · `admin.html` · `distribution.html` · `social-settings.html` · `members.html` | 운영자의 작업 흐름이 끊긴다. Supabase 로그인 게이트가 있고, 읽던 자료는 이제 비공개다 | 별도 origin 이나 인증 뒤로. 최소한 `robots.txt` Disallow 에 `distribution.html` · `social-settings.html` · `verify.html` · `station.html` · `canary/` 를 더한다(현재 빠져 있다) |
| `aetherus-device-qa.html` (+js·css) | `aetherus-lab.html:19` 가 링크한다. 막으면 **죽은 링크**가 남는다 | 링크를 지우고 같이 막는다 |
| `data/aetherus/*.json` (DRAFT 계약 3건) | `aetherus-lab.html` 이 읽는다. 막으면 화면이 깨진다. 테이블·열 이름과 역할-권한 표가 들어 있다 | 화면에 필요한 만큼만 줄여서 내보낸다 |

**등급** `P2`

---

## H. 시각자산 검사가 세 곳에 흩어져 있다

조건 **이름**은 `governance.CAPTURE_VERIFY_CONDITIONS` 로 정본을 모았고,
이번에 키 집합 대조까지 넣었다. 값 판정은 아직
`governance.visual_asset_check` 와 `capture.verify_capture` 두 벌이다.

**할 일** `capture.verify_capture` 가 판정하고 `governance` 는 결과만 읽는 구조로.

**소유** 이 세션 · **등급** `P2`

---

## I. 캐릭터 모듈에 프롬프트·모델명·단가가 섞여 있다  (새로 찾음)

`prototype/v3-kids/character-core.js:23,24,106-110` 에 `PRICE`(장당 0.165~0.211 달러) ·
`MODEL = 'gpt-image-2'` · 이미지 생성 프롬프트 전문이 있다.
`v3-paper/src/characters/character-core.js` 에 **바이트 동일한 사본**이 하나 더 있다.

런타임이 그 모듈을 실제로 쓰므로 파일을 통째로 막을 수 없다.
저작 전용 부분(`promptFor`·`PRICE`·`MODEL`)을 갈라 내고 그 조각만 막아야 한다.

⚠️ `character-core.js` 는 지금 **다른 세션이 고치고 있다.** 손대지 않았다.

**소유** 다른 세션 · **등급** `P2`

---

## J. CI 가 공개 빌드에 의존하는데 경로 필터가 그걸 모른다  (새로 찾음)

`.github/workflows/deploy-v3-kids.yml` 은 push 로 자동 배포하고, 그 스크립트는 이제
`aws/build-public.py` · `aws/_shared/public_build.py` · `aws/_shared/public-source.sh`
를 거친다. 그런데 `paths:` 필터에는 `prototype/v3-kids/**` 와
`aws/deploy-v3-kids.sh` 만 있다.

결과: 거름망 규칙을 조여도 v3-kids 공개본은 다음 v3-kids 변경 때까지 옛 상태로 남는다.
안전 문제는 아니고 **반영이 늦는** 문제다.

**할 일** `paths:` 에 위 세 경로를 더한다.

**소유** 배포 구조 = 운영자 · **등급** `P2`

---

## K. 같은 키에 두 스크립트가 서로 다른 것을 올린다  (새로 찾음)

`app/v2/index.html` 에 두 곳이 쓴다:

```text
aws/deploy-app.sh        build/public-app/v2/index.html   (옛 Cesium 트리)
tools/deploy-v2-three.sh build/public-app/v2-deploy/…     → app/v2/
```

나중에 돈 쪽이 이긴다. 어느 쪽이 정본인지 코드가 대답하지 못한다.
(메모리의 "v2 디렉터리 키 함정"과 같은 뿌리다)

**할 일** `app/v2/` 의 정본을 정하고 한 스크립트만 그 키를 쓰게 한다.

**등급** `P1`

---

## 참고 — 이번 단계가 닫은 것

| | |
|---|---|
| 초안 저장 위치 | `events/`(공개) → `archive/`(비공개) · 공개 접두사 쓰기는 예외를 던진다 |
| 초안 읽는 화면 | 공개 주소를 놓았다. 인증 경로가 생기면 그때 연결 |
| 배포 경계 | 공개 업로더 15개 중 12개를 `build/public-app` 으로. 면제 3개는 생성물이고 이유를 적었다 |
| 금지 부류 | 규칙 11줄 추가(11부류) — 전부 "앱이 읽지 않는다"를 확인하고 넣었다 |
| 청소 목록 | 손으로 적던 것을 **거름망에서 재현**한다(`--audit-denied`) |
| 승인 게이트 | `system1` 같은 이름으로 뚫리던 것 · lifecycle 뒤집기 · 상태 자기신고 — 셋 다 막음 |
| 부르지 않던 검사 | `check_public_write` 를 리포트 발행 경로에 연결 |
| 실측 | 서명 없는 쓰기 403 · 새 초안 키 403 · 걸러진 빌드로 4개 화면 전부 확인 |
