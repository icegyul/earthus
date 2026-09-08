# EARTHUS V2 — INTEGRATION-1 파일 소유와 정본 (§2 · §36)

| 항목 | 값 |
|---|---|
| 기준 HEAD | `21519870` |
| 작성 | 2026-09-08 |
| 규칙 | 같은 뜻을 두 파일에서 정의하지 않는다. 두 개가 있으면 하나를 **정본**, 나머지를 **어댑터/보류**로 표시한다 |

> ⚠️ 이 저장소는 **여러 세션이 동시에 편집**한다. 아래 OWNER 열은 "누가 만들었나"이지
> 잠금이 아니다. 남의 미커밋 파일을 고치기 전에는 반드시 백업하고, 고쳤으면 여기 적는다.

---

## 1. 정본 표 (§2)

| 개념 | **정본** | 물러난 것 | 등급 |
|---|---|---|---|
| 현상 · 레이어 | `prototype/v2-three/js/phenomenon-registry.js` | `aws/_shared/phenomenon_registry.py` 는 **읽기만** 한다 | READER |
| 기간 산술 | `aws/_shared/report_period.py` | `report_bridge._period_label`, `report_contract._period_case` | 어댑터(미정리) |
| 리포트 봉투 · 검증 계약 | `aws/_shared/report_contract.py` | — | — |
| 콘텐츠 봉투 | `aws/_shared/content_contract.py` | — | — |
| 출처 사슬 | `aws/_shared/provenance.py` | — | — |
| 리포트 조립 | `aws/report-engine/generator.py` | — | — |
| **리포트 절 구성** | `aws/report-engine/compose.py` | `sections.py`, `generator._retrospective_sections` | 보류(DEPRECATED 후보) |
| **리포트 파이프라인** | `aws/report-engine/pipeline.py` | — | — |
| **리포트 CLI** | `aws/report-engine/cli.py` (`full` 하위명령) | `pipeline.py __main__` | 별칭 |
| 예보 검증 산출 | `aws/report-engine/adapters/kma_verify_adapter.py` | `verify_scorecard.py` 가 **이 파일을 불러 쓴다** | 소비자 |
| 리포트 내보내기 | `aws/report-engine/export.py` | — | — |
| 리포트 보관 색인 | `generator.build_report_archive_index` | `distribution/archive.py` (콘텐츠용, 별개) | 분리 유지 |
| **시각 사양 · 카메라** | `aws/distribution/visual.py` | — | — |
| **시각 실행 · 캡처 매니페스트** | `aws/report-engine/capture.py` + `tools/earthus_capture.mjs` | — | 신규 |
| 콘텐츠 조립 | `aws/distribution/generator.py` | — | — |
| 발행(리포트) | `aws/report-engine/publisher.py` | — | — |
| 발행(콘텐츠) | `aws/distribution/publish_queue.py` + `sns_adapters/` | — | — |

---

## 2. 공유 파일 — 누가 만들었고 이번에 무엇을 했나

| 파일 | OWNER | 역할 | 이번에 고침 | 안전도 |
|---|---|---|---|---|
| `aws/_shared/report_contract.py` | 리포트 세션 | 리포트·검증 계약 | 아니오 | SAFE |
| `aws/_shared/content_contract.py` | 배포 세션 | 콘텐츠 계약 | 아니오 | **LOCKED** (미커밋) |
| `aws/_shared/provenance.py` | 배포 세션 | 출처 사슬 | 아니오 | **LOCKED** (미커밋) |
| `aws/_shared/report_period.py` | 리포트 세션 | 기간 정본 | 아니오 | SAFE |
| `aws/_shared/phenomenon_registry.py` | INTEGRATION-1 | 레지스트리 **리더** | 신규 | SAFE |
| `aws/report-engine/cli.py` | 리포트 세션 | 정본 CLI | **예** — `full` 하위명령 추가 | SAFE (커밋됨·git 복구 가능) |
| `aws/report-engine/pipeline.py` | 리포트 세션(내) | 전체 파이프라인 | 예 — 성적표 첨부·내보내기 배선 | SAFE |
| `aws/report-engine/compose.py` | 리포트 세션(내) | 정본 절 구성 | 예 — `hydrate_sections` | SAFE |
| `aws/report-engine/generator.py` | 리포트 세션 | 조립·검증·발행 | 아니오 | SAFE |
| `aws/report-engine/sections.py` | **배포 세션** | 두 번째 절 구성 | 아니오 | **LOCKED** (미커밋) |
| `aws/report-engine/export.py` | **배포 세션** | HTML/MD/JSON | **예** — 표지 캡처·스토리 렌더·reportId | 백업 후 수정 |
| `aws/report-engine/adapters/lab_report_adapter.py` | 배포 세션 | 사건→팩트 | 아니오 | **LOCKED** (미커밋·미배선) |
| `aws/distribution/validation.py` | **배포 세션** | 사실 검증 | **예** — bool 이 숫자 풀에 새던 구멍 | 백업 후 수정 |
| `aws/distribution/handler.py` | **배포 세션** | 후보 생성·저장 | **예** — 차단·민감 후보 공개 보류 | 백업 후 수정 |
| `aws/distribution/visual.py` | 배포 세션 | 시각 사양 | 아니오 | SAFE(참조만) |
| `aws/distribution/sources/report_bridge.py` | 배포 세션 | 리포트→콘텐츠 | 아니오 | SAFE(참조만) |
| `prototype/v2-three/js/main.js` | 리포트 세션 | 런타임 | **예** — `captureImage({dataUrl})` 반환 모드 | SAFE (커밋됨) |
| `prototype/v2-three/js/report-center.js` | 리포트 세션(내) | 리포트 화면 | 예 — 정본 성적표 소비 | SAFE |

**백업 위치**: 남의 미커밋 파일 54개를 손대기 전에 스크래치패드에 통째로 복사해 두었다.

---

## 3. 한 파일에 두 정본이 남은 곳

### `sections.py` vs `compose.py`

정본은 `compose.py` 로 정했다(근거는 감사 §3.1). 그런데 **`sections.py` 를 지우지도
어댑터로 바꾸지도 않았다.** 이유:

- 다른 세션의 **미커밋** 파일이다. 고치면 그쪽 작업이 조용히 사라진다.
  이 세션에서 이미 한 번 그런 사고를 냈다(`publisher.py` 를 Write 로 덮어썼다).
- 지금은 아무도 `sections.build()` 를 부르지 않으므로 **동작 충돌은 없다.**
  `export.py` 가 `table_of_contents` 만 쓰고, 그건 절 모양에 무관하다.

→ 그래서 §43 의 "DUPLICATE CANONICAL PIPELINE: 0" 은 **충족하지 못했다.**
코드가 아니라 소유권 때문이다. 다음 조치는 그 세션과 합의한 뒤:
`sections.py` 의 `NOT_AVAILABLE_REASONS` 어휘를 `compose.py` 가 흡수하고,
`sections.build` 를 `compose.build_sections` 로 위임하는 얇은 어댑터로 만든다.

---

## 4. 손대지 않기로 한 것과 이유

| 대상 | 왜 |
|---|---|
| `aws/cyclone-analog/handler.py` 의 리드 평균 | 운영 Lambda 의 **공개 순위 산출**을 바꾸는 일. 제품 결정이 필요하다 |
| `events/social-drafts.json` 공개 경로 | 옮기면 인증 없는 관리 화면(`studio.js`)이 깨진다. 인증 면이 먼저다 |
| 파이썬 시험 210건을 `npm test` 에 연결 | CI 구성 변경 — §0 이 얼린 범위 |
| `aws/social-draft` 의 facebook 글자수 2000 | 배포 세션 소유. 값 불일치는 감사에 기록만 |
