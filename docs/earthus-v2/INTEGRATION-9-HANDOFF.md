# EARTHUS V2 INTEGRATION-9 HANDOFF

```text
PARENT:  0f4f8718
DATE:    2026-09-08
```

차단 등급: `P0` 지금 위험 · `P1` 다음 단계 전 · `P2` 구조 정리

---

## A. 남은 블로커 둘  ★P0

전용 문서: [integration-9-production-blocker.md](integration-9-production-blocker.md)

| | 무엇 | 필요한 것 |
|---|---|---|
| A | 공개 금지 객체 95건 삭제 | `s3:DeleteObject` |
| C | SOURCE = DEPLOY | 다른 세션의 `PopMetricMenu` 커밋 |

INTEGRATION-8 의 P0 였던 `reports/` 읽기 정책은 **이번에 닫았다.**

⚠️ **C 는 겉보기보다 중요하다.** 보고서는 발행됐고 누구나 받을 수 있는데,
지금 배포된 앱에는 리포트 화면이 아예 없다(`app/v2/js/report-center.js` → 403).
저장소 쪽은 끝났고 화면에 나오려면 배포뿐이다.

---

## B. 발행은 이제 **실제로 된다** — 그전에는 되지 않았다  ★P1

이 단계에서 가장 값나가는 발견이다. 앞 여덟 단계 내내 발행 경로가 죽어 있었다.

```text
generator.run_publication_pipeline()  이 업로드 **전에** publishedAt·immutableRef 를 찍음
  → governance 가 그 도장을 보고 상태를 PUBLISHED 로 읽음
  → PUBLISHED → PUBLISHING 은 금지 전이
  → adapter.publish() 에 **도달조차 못 함**
```

그러면서 올린 적 없는 문서가 "발행됨" 도장을 달고 남았다. 검사기가 아니라
**발행 자체가 죽어 있었고, 그 사실이 문서에는 발행됨으로 적혀 있었다.**

고친 규칙 한 줄로 기억할 것:

> **발행 증거는 올린 쪽만 찍는다.** generator 는 `validatedAt` 까지.
> `publishedAt`·`immutableRef` 는 publisher 가 승인 문을 지난 뒤 put 직전에.

회귀 시험: `test_integration9_report_delivery.py::검증은_발행이_아니다`.

---

## C. 승인 문에 구멍이 셋 있었다 — 지정된 아홉 가지 **밖**에서 나왔다  ★P1

§8 이 열거한 아홉 가지는 전부 막혀 있었다. 한 발 더 밀어 보니 셋이 뚫렸다.
다음 사람이 이 문을 볼 때 **열거된 목록만 두들기지 말 것.**

| | 무엇 | 교훈 |
|---|---|---|
| 1 | 거부 목록으로 걸러서 `BLOCKED`·빈 값·오타가 전부 통과 | **거부 목록은 새 값 앞에서 무력하다.** 허용 목록으로 쓸 것 |
| 2 | 상태를 정하는 칸(`status`)이 서명 밖 | **판정에 쓰는 값은 서명 안에 있어야 한다** |
| 3 | 시스템 계정 목록이 영문 전용 — `스크립트` 로 승인 통과 | **한국어 저장소에서 영문 단어 목록은 절반짜리다** |

`_derive_state` 바로 위에 "승인 도장이 있어도 검증 안 지난 문서는 APPROVED 가
아니다" 라고 적혀 있었는데 **코드가 정반대였다.** 주석과 코드가 어긋나면
주석 쪽이 의도다 — 코드를 고칠 것.

---

## D. 발행 흐름을 다음에 손댈 때  ★P1

이번에 붙인 것들:

```text
publisher.stamp_published(report, at)   발행 도장 (UNSIGNED_FIELDS 라 승인 해시 무사)
publisher.merge_index(index, report)    색인을 **읽어서 더한다** — 새로 만들지 않는다
publisher.index_leaks(index)            초안이 섞인 색인은 올리지 않는다
publisher.report_year(report)           period 가 dict 일 때도 str 일 때도 있다
S3PublishAdapter.read_index()           있는 색인을 먼저 읽는다
governance.base_state(doc)              승인을 빼고 계산한 상태
```

⚠️ 색인을 `build_report_archive_index([한 건])` 으로 새로 만들지 말 것.
먼저 발행된 보고서가 목록에서 조용히 사라진다. `merge_index` 를 쓸 것.

⚠️ `period` 는 두 모양으로 쓰인다(`{"from": …}` 와 `"2026-08"`).
한쪽만 가정하면 `AttributeError` 로 발행이 통째로 죽는다. `report_year` 를 쓸 것.

---

## E. 이미 발행된 2026-08 은 다시 게이트를 못 지난다 — 정상이다  ★P2

그 문서의 승인 기록에는 `approvedFrom` 이 없다(이번 단계에서 추가한 칸보다 먼저
승인됐다). 다시 `gate(want="PUBLISHING")` 를 부르면 `APPROVAL_STATE_MOVED` 로 막힌다.
이미 발행된 것을 다시 올리는 것은 어차피 금지 전이이므로 **실피해 없음**이고,
동작으로도 옳다.

---

## F. VIDEO 는 DEFERRED — 계약 문서 근거  ★P2

전용 문서: [integration-9-video-decision.md](integration-9-video-decision.md)

릴리스 판정 문서(QA-PHASE2-RELEASE-CANDIDATE)에 영상 언급 0건,
MASTER SPEC 의 소셜 계약은 manual publish only, MARKETING-STUDIO-SPEC 이
WebM 을 "2단계" 로 명시. **Production Release blocker 가 아니다.**

같이 정리할 것(그 문서 §"다만"):

1. `youtube`·`tiktok` 어댑터가 켜져 있는데 영상을 못 만든다 — 어떤 후보를 보내도
   `*_VIDEO_REQUIRED` 로만 끝난다. §143 "못 하는 것을 할 수 있는 것처럼 두지 않는다"
2. dev-spec·MARKETING-STUDIO-SPEC 이 "카드/영상 생성" 을 이미 되는 것처럼 적는다
3. `master-plan-2026.md:420` 의 "쇼츠 자동화 승격" 은 대체된 v1 시절 문서다
4. **영상이 V2 범위 밖이라고 못 박은 문장이 어디에도 없다** — 서면으로 원하면 새로 적어야 한다

---

## G. 예보 채점표가 실제로는 한 줄도 채점하지 않았다  ★P2

규칙 위반은 아니지만 읽는 사람이 오해한다.

```text
build/e2e/report-2026-08.json   scorecard: evaluatedCount 0 · 모든 줄 NOT_EVALUABLE
```

검증 입력(`wind/series/verify-daily.json`)이 저장소에 없어서, 점수가 실린 줄은
**단위 픽스처로만** 증명된다. 규칙 D(점수는 표본 수와 함께 나간다)가 실제 산출물에서
한 번도 발동한 적이 없다.

---

## H. `build/orbital` · `app/orbital/`  ★P2

세 단계째 같다. `app/orbital/` 객체 **0건**. 그 스크립트만 `--delete` 를 쓰는데
권한이 없어 `set -euo pipefail` 에서 죽는다 — 한 번도 성공한 적이 없다.
되살리기 전에 부류 검사를 붙이고 `--delete` 와 리전(혼자 `ap-northeast-2`)을 정리할 것.

---

## I. 앞 단계에서 남은 것

| | 상태 |
|---|---|
| `distribution/cli.py:243` 자동 승인 | 남음. 발행 문은 닫혀 있고 표시만 문제 |
| `distribution/handler.py` 가 DRAFT 를 공개 `events/` 에 | 남음 (다른 세션) |
| 리드 합산 계산기 (여진·화산재·대기질·표류) | 남음 |
| 절 구성 두 벌 (`sections.py` vs `compose.py`) | 남음 |
| `config.local.js` 의 ADMIN_UIDS | 남음 |
| 인증 없는 관리 화면 · `aetherus-device-qa.html` 죽은 링크 | 남음 |
| 시각자산 값 판정 두 벌 | 남음 |
| `app/js/earthus2/v07/` 앱이 안 부르는데 공개 | 남음 (P2 · 시험은 있다) |
| `test_kma_hub.py` 조합별 실패 (`botocore[crt]`) | 남음 — 환경 문제 |
| `report-engine` + `distribution` 동시 실행 시 모듈 충돌 | 남음 — 따로 돌린다 |

---

## 참고 — 이번 단계가 닫은 것

| | |
|---|---|
| 발행 경로 | `reports/published/*` 만 열었다. 그 밖의 `reports/` 는 읽기도 쓰기도 막힘 |
| 발행 자체 | 금지 전이로 죽어 있던 사슬을 고쳐 **실제 보고서 한 건을 사람 승인으로 발행** |
| 되받기 | 익명 GET 으로 5항목 대조. 실패하면 색인을 건드리지 않는다 |
| 승인 문 | 열거 밖에서 구멍 셋을 찾아 막고 회귀 시험으로 고정 |
| 색인 | 초안 누출 차단 · 읽어서 더하기(먼저 것이 사라지지 않는다) |
| VIDEO | 계약 문서 인용으로 DEFERRED 판정 |
