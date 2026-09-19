# EARTHUS DISTRIBUTION & REPORTING ENGINE — 아키텍처 지도

| 항목 | 값 |
|---|---|
| 상태 | PHASE 0 실측 완료 → PHASE 1~20 구현 |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `2be59446` |
| 지시서 | EARTHUS V2 DISTRIBUTION + REPORTING SYSTEM FULL IMPLEMENTATION DIRECTIVE |
| 규칙 | **실제로 파일을 열어 확인한 것만 EXISTING 이다.** 확인 못 한 것은 NOT AVAILABLE 이다 |

라벨: **EXISTING** 이미 있고 돈다 · **MODIFIED** 있던 것을 고쳤다 · **NEW** 새로 만들었다 · **NOT AVAILABLE** 없다(그리고 왜 없는지)

---

## 0. 이 문서가 처음에 뒤집은 가정

지시서는 "SNS 시스템을 만들어라"라고 했지만, 저장소를 열어 보니 **두 엔진 다 이미 절반이 있었다.**
가정하고 새로 만들었으면 세 번째 계보가 생겼을 것이다. 실제로 발견한 것:

| 지시서가 만들라고 한 것 | 저장소의 실제 상태 |
|---|---|
| SNS 플랫폼 어댑터 | **이미 7종이 LIVE 로 돈다** — `prototype/supabase/functions/social-admin/index.ts` (45KB). X·Threads·Instagram·Facebook·TikTok·LinkedIn·YouTube |
| 자격증명 보관 | **이미 있다** — AES-GCM 볼트 + 비공개 Storage 버킷 `earthus-social-private` |
| 멱등키·중복 방지 | **이미 있다** — `publish-locks/<sha256>.json` 조건부 쓰기 |
| SNS 초안 생성 | **이미 있다(단, 태풍 전용)** — `aws/social-draft/handler.py` |
| 리포트 계약·기간·생성기 | **이미 있다** — `aws/_shared/report_contract.py`, `report_period.py`, `aws/report-engine/` |
| 자료 가용성 계약 | **이미 있다** — `docs/earthus-v2/data-availability-matrix.md` |
| 리포트 UI 진입면 | **이미 있다** — `ui-shell.js:552~633` `reportPanelHtml()` |

그래서 이 작업은 **새 시스템 구축이 아니라 두 반쪽을 잇는 일**이다.
없던 것은 그 사이의 배선 — 콘텐츠 객체, 자격 판정, 마스터→플랫폼 파생, 발행 큐, 검증, 아카이브, 내보내기, 관리 화면이다.

---

## 1. 현재 아키텍처 (EXISTING)

```
정적 HTML + CSS + ES 모듈 (빌드 도구 없음)
  prototype/                     EARTHUS 1.0 / v1 (공유 모듈 js/ — v2 가 절대경로로 재사용)
  prototype/v2-three/            V2 소스 (Three.js 지구)
  prototype/v2-deploy/           V2 배포 거울 — vendor 경로만 다시 쓴 사본
  prototype/v3-kids/, v3-paper/  V3
데이터 평면
  AWS Lambda 130+ 수집기 (aws/<이름>/handler.py) → S3 earthus-cache-kr (us-east-2)
  브라우저가 S3 를 직접 읽는다: events/ · ocean/ · clouds/ · wind/ · celestrak/
  CloudFront earthus.net 이 앱과 /ocean/* 공개 자료를 서빙한다
회원·권한
  Supabase (Postgres + Edge Functions + Storage)
```

프레임워크가 없다. React·Vite·번들러가 없다. **이 작업도 도입하지 않았다.**

## 2. 관련된 기존 모듈 (EXISTING)

| 파일 | 역할 |
|---|---|
| `prototype/v2-three/js/phenomenon-registry.js` | 현상 66종 · 레이어 109종 정본. `capabilities.report` 플래그를 이미 들고 있다 |
| `prototype/v2-three/js/intel-feed.js` | Earth Event 피드 — GDACS TC + USGS EQ, 시각 4분법 |
| `prototype/v2-three/js/event-room.js` | 기관 스택 · 진리등급 · 현재→다음→행동 |
| `prototype/v2-three/js/ui-shell.js` | 메뉴 셸. `reportPanelHtml()` 이 리포트 진입면 |
| `prototype/js/lab-reports.js` | 리포트 종류 9종 계약 + 읽기 어댑터 |
| `aws/lab-report-index/handler.py` | 현상별 계산기 결과를 `ocean/lab-reports.json` 하나로 합침 |
| `aws/social-draft/handler.py` | 태풍 SNS 초안. 글자 한도 · 경고문 보존 · 카드 사양 |
| `prototype/supabase/functions/social-admin/index.ts` | SNS 7종 LIVE 발행 · 자격증명 볼트 · 미디어 · 멱등 잠금 |
| `prototype/js/studio-social.js` | SNS 관리자 UI |
| `aws/_shared/report_contract.py` | 리포트/검증/스냅샷/팩트 봉투 |
| `aws/_shared/report_period.py` | 기간 정본 (월·분기·연) |
| `aws/report-engine/generator.py` | 회고·전망·검증·스코어카드·아카이브 색인·발행 게이트 |
| `aws/report-engine/adapters/kma_verify_adapter.py` | 기온·바람 어댑터 (유일한 완전 루프) |

## 2-1. ⚠️ 작업 중 확인한 동시 편집 (2026-09-08)

작업 도중 **다른 세션이 같은 브랜치의 `aws/report-engine/` 을 동시에 고치고 있었다.**

| 사실 | 확인 방법 |
|---|---|
| 이 작업 중 커밋 `5811415a` 가 올라왔다 (PHASE 7) | `git log` |
| 그 세션이 `quality.py`·`narrative.py`·`significance.py`·`crossdomain.py`·`adapters/climate_series_adapter.py` 를 썼다 | 파일 mtime 이 초 단위로 갱신 |
| 그 과정에서 이 작업이 `cli.py` 에 넣은 배선이 덮어써졌다 | 재확인 시 사라짐 |
| 그 세션이 `publisher.py` 를 자기 PHASE 8 판으로 대체했다 | 파일 내용 교체 |

**사용자 결정: 배포 엔진만 계속하고 리포트 엔진에서는 손을 뗀다.**
그래서 `aws/report-engine/cli.py`·`generator.py` 에 넣었던 변경을 역패치로 정확히 되돌렸고,
`_shared/report_contract.py` 에 넣었던 상수는 `_shared/content_contract.py` 로 옮겼다.
남긴 3개 파일(`sections.py`·`export.py`·`adapters/lab_report_adapter.py`)은
**아직 그쪽 파이프라인에 배선되지 않은 독립 모듈**이다.

## 3. 기존 Event 구현 (EXISTING)

두 갈래가 있고 **둘은 다른 것이다.**

1. **실시간 사건 피드** — `intel-feed.js`. id 는 `tc-<gdacsId>` / `eq-<usgsId>`.
   시각 4분법(`occurredAt`·`issuedAt`·`updatedAt`·`retrievedAt`), 없는 시각은 `null` 이고 `Date.now()` 로 채우지 않는다.
   상태 `ACTIVE`·`WATCH`·`RESOLVED`·`VERIFYING`·`PRELIMINARY_REPORT`·`FINAL_REPORT`, 신뢰도 `high`/`medium`/`low`.
2. **사건 분석 보고서** — `ocean/lab-reports.json`, 실측 **218건** / 9종.
   id 는 `<kind>:<sourceId>`. `detail.facts[] = {label, value}`, `scores[]`, `method{}`.

`EVENT_KIND_PHENOMENON` 이 피드 kind 와 현상 id 를 잇는다.

## 4. 기존 Phenomenon 구현 (EXISTING)

`PHENOMENA` 66종. 키는 `domain.snake`. 도메인 7개(land·weather·ocean·people·travel·hazards·space).
각 현상은 `capabilities{current, history, intelligence, forecast, simulation, evidence, report}`,
`availability`(ready·partial·planned), `evidenceProfile`, `temporalMode`, `scope`, `dataProducts[]` 를 갖는다.
`REPORT_KIND_PHENOMENON` 이 리포트 종류 9종과 현상을 잇고, **2종은 대응 현상이 없다고 정직하게 null 로 둔다.**

## 5. 기존 출처/증거 구현 (EXISTING)

- `LAYER_TRUTH` 진리등급 — `OFFICIAL_OBSERVATION` · `OFFICIAL_FORECAST` · `OFFICIAL_WARNING` · `EARTHUS_ANALYSIS` · `HISTORY` · `NONE`
- `source-context.js` / `provenance.html` / `providers.html` — 출처 표시면
- `aws/_shared/report_contract.py` 의 `make_data_snapshot()` — `observedAt`(원자료 시각)과 `retrievedAt`(우리가 받은 시각)을 나눠 든다
- 상태 어휘 `ACTIVE`·`DEGRADED`·`STALE`·`UNAVAILABLE` (provider_health)

## 6. 기존 신뢰도 구현 (EXISTING, 두 갈래)

| 어디 | 값 |
|---|---|
| 사건 피드 | `high` / `medium` / `low` (문자열) |
| 리포트 계약 | 팩트별 `confidence` 자유 필드 + `sampleCount` |
| 검증 | 점수 대신 `NOT_VERIFIABLE` + 사유 5종 |

지시서가 요구한 `HIGH/MEDIUM/LOW/UNKNOWN` 은 **피드 어휘를 대문자로 승격**해 쓴다. 새 척도를 만들지 않는다.

## 7. 기존 데이터베이스 테이블 (EXISTING)

`profiles` · `consents` · `waitlist` · `feature_requests` · `reports` · `service_interest` · `admins` ·
`admin_audit_log` · `analytics_events` · `usage_counters` · `member_invites` · `staff_roles` ·
`provider_registry` · `provider_health` · `provider_credential_meta` · `earthus_forecast_revisions` ·
`earthus_forecast_release_audit` · `aetherus_*` 8종

> ⚠️ **`public.reports` 는 지구 리포트가 아니다.** 신고(abuse report) 테이블이다
> (`target_type`·`target_id`·`reason`). 같은 이름을 쓰면 두 뜻이 생긴다 — 이 작업은 그 테이블을 건드리지 않는다.

### 이 작업이 DB 테이블을 추가하지 않은 이유

지시서 §109 는 `distribution_content` 등 13개 테이블을 제안한다. 저장소의 실제 관행은 다르다:

- 리포트 계보 전체가 **파일 기반**이다 (`ocean/lab-reports.json`, `analysis/*-reports.json`)
- SNS 발행 기록도 **파일 기반**이다 (`publish-log/<uuid>.json`, Storage)
- 감사 기록은 **이미 테이블이 있다** (`admin_audit_log` — `object_kind`·`object_id`·`detail` jsonb)

여기에 13개 테이블을 새로 만들면 **같은 사실이 두 곳에 살게 된다.** 지시서 §109 의 진짜 요구는
"기존 canonical entity 를 복제하지 마라"이고, 그것은 파일 저장으로도 지킨다.
그래서 콘텐츠·리포트는 S3 JSON 으로, 감사 기록은 기존 `admin_audit_log` 로 간다.
**DB 마이그레이션 0건.** 이 판단은 §110(모든 DB 변경에는 마이그레이션이 있어야 한다)을 어기지 않는다 — 변경이 없다.

## 8. 기존 API / 자료 공급자 (EXISTING)

`wind/series/verify-daily.json`(기온·바람 채점) · `ocean/lab-reports.json`(사건 보고서 218건) ·
`events/typhoon-official.json`(KMA·JMA·NHC) · `events/gdacs-tc.json` · `ocean/cyclone-events.json` ·
`events/social-drafts.json` · USGS 지진 피드 · 그 외 130+ 수집기

## 9. 기존 렌더링/내보내기 (EXISTING / NOT AVAILABLE)

- **EXISTING** `prototype/studio.html` + `studio.js` — 브라우저에서 SNS 카드를 그린다(Lambda 에 한글 폰트가 없어 내린 결정)
- **EXISTING** `prototype/lab-reports.html` — 사건 보고서 목록/상세
- **NOT AVAILABLE** 리포트 HTML/PDF 내보내기 — 없었다
- **NOT AVAILABLE** 지구 캡처 파이프라인(사건 → 카메라 → 이미지) — 없었다

## 10. 기존 관리자 기능 (EXISTING)

`prototype/admin.html` · `prototype/studio.html` · `prototype/social-settings.html` ·
Edge Function `member-admin` · `provider-admin` · `social-admin`. 관리자 판정은 `public.admins` 조회.

## 11. 새로 추가한 모듈 (NEW)

```
aws/_shared/
  content_contract.py          콘텐츠 봉투 · 10종 유형 · 우선순위 · 자격 · 신뢰도 · 안전등급 · 차단사유
                               + 한국어 '-ㄹ 것' 예측 구문 탐지(목록으로는 못 잡는다)
  provenance.py                출처 해석기 — 콘텐츠/리포트 → 현상 → 자료 → 공급자
aws/distribution/
  generator.py                 마스터 콘텐츠 생성 (실제 EARTHUS 자료에서만)
  caption.py                   구조화 캡션 (관측/분석/해석 3분법, KO·EN)
  hashtags.py                  통제된 해시태그
  eligibility.py               발행 자격 판정 + 우선순위 산식
  validation.py                사실 검증 게이트 (숫자·날짜·인과·예측·고아참조·출처사슬)
  publish_queue.py             발행 큐 · 재시도 · 멱등 · 상태기계 (표준 queue 를 가리지 않게 개명)
  archive.py                   아카이브 · 성과 지표 · 노후 감지 · 판 관리 · 감사 기록
  visual.py                    카드 사양 + 카메라 자동 결정 + 자산 메타데이터
  handler.py                   후보 생성 Lambda (게시 경로 없음)
  cli.py                       §134~§138 명령
  sns_adapters/base.py         SNS_ADAPTER 인터페이스 + MOCK/PREVIEW/LIVE
  sns_adapters/{instagram,x,facebook,linkedin,youtube,threads,tiktok}.py
  sources/lab_report.py        사건 분석 보고서 218건 → 후보
  sources/verify_scorecard.py  예보 채점 → DATA_STORY 후보
  sources/report_bridge.py     리포트 → SNS 후보
  tests/test_distribution.py   71건 (§117 거짓 입력 거부 시험 포함)
aws/report-engine/             ⚠️ 다른 세션과 동시 편집 — 3절 참고
  sections.py        (NEW)     §39·§54·§57 전체 절 명세 + NOT_AVAILABLE 사유
  export.py          (NEW)     HTML(정본) · Markdown · JSON, §157 안정 파일명
  adapters/lab_report_adapter.py (NEW)  사건 보고서 → 기간 팩트 · 지역/영역 집계 · 순위 근거
prototype/
  distribution.html  (NEW)     배포 관리 화면 (5개 보기)
  css/distribution.css (NEW)
  js/distribution-admin.js (NEW)
tools/
  test_distribution_reporting.mjs (NEW)  9건 — 파이썬↔프런트 계약 대조
docs/earthus-v2/
  DISTRIBUTION_ENGINE_OPERATIONS.md (NEW)  운영 문서
```

## 12. 통합 지점 (MODIFIED)

| 파일 | 무엇을 고쳤나 |
|---|---|
| `prototype/admin.html` | 관리자 메뉴에 '배포 관리' 한 줄 |
| `prototype/studio.html` | 상단에 '배포 관리' 링크 한 줄 |
| `.gitignore` | 로컬 미리보기 산출물 `prototype/events/distribution-content*` 제외 |

**그 밖의 기존 파일은 고치지 않았다.** 특히:
- `aws/report-engine/cli.py`·`generator.py`·`_shared/report_contract.py` 는 **건드리지 않았다**
  (한 번 고쳤다가 3절의 동시 편집을 확인하고 정확히 되돌렸다)
- `social-admin` Edge Function · `social-draft` Lambda · `studio.js` 는 그대로다
- **데이터베이스 마이그레이션 0건** (7절의 근거)

## 13. 위험과 한계

1. **자료가 없다는 것이 가장 큰 한계다.** 정기 리포트를 실제로 채울 수 있는 현상은 **기온·바람 둘뿐**이다
   (`data-availability-matrix.md`). 나머지는 `DATA_NOT_AVAILABLE` 로 남는다 — 지어내지 않는다.
2. **LIVE SNS 발행은 자격증명에 달렸다.** 볼트가 비어 있으면 어댑터는 `NOT_CONFIGURED` 를 돌려준다.
   지시서 §144 대로 나머지는 전부 완성하고 LIVE 만 미구성으로 남긴다.
3. **자동 게시 경로를 만들지 않았다.** 기존 `social-admin` 의 설계 결정을 유지한다 —
   "화면의 오류는 고치면 되지만 게시물은 이미 퍼진다". 큐는 사람이 승인한 것만 처리한다.
4. **`v2-three` 와 `v2-deploy` 는 손으로 맞춘 거울이다.** 한쪽만 고치면 배포가 어긋난다.
5. **`ocean/lab-reports.json` 이 1.1MB 다.** 관리 화면이 통째로 읽으면 느리다 — 요약만 읽는다.

## 14. 구현 상태

배포 엔진 — **전부 실자료로 통과했다.**

| 구성요소 | 상태 | 근거 |
|---|---|---|
| A 콘텐츠 객체 | 완료 | 고아·스냅샷 없음·출처 없는 관측을 계약이 거부한다 |
| B 콘텐츠 생성기 | 완료 | 실자료 3종 출처. 후보 132건 중 8건 생성 확인 |
| C 콘텐츠 검증기 | 완료 | 12종 거부 사유. §117 거짓 입력 시험 15건 |
| D 비주얼 | 사양·메타데이터 완료 | 그림은 브라우저가 그린다(기존 결정 유지) |
| E 캡션 | 완료 | 신뢰도·출처는 어느 플랫폼에서도 안 잘린다 |
| F 해시태그 | 완료 | 통제 목록·플랫폼별 상한·순서 고정 |
| G SNS 어댑터 | 완료 (7종) | 기존 LIVE 경로(social-admin) 재사용 |
| H 발행 큐 | 완료 | 승인된 것만 · 영구/일시 실패 구분 · 멱등 |
| I 리뷰 워크플로 | 완료 | 전이표 밖 이동 거부 · 전이 전부 기록 |
| J 스케줄러 | 설정층 완료 | cron 배선은 운영자 몫 |
| K SNS 아카이브 | 완료 | 불변 · 지표 NOT_AVAILABLE · 사건까지 되짚기 |
| T 출처 해석기 | 완료 | 끊긴 사슬을 자리까지 말한다 |
| V 생성 메타데이터 | 완료 | 스냅샷 · 생성기 판 · 숫자 풀 크기 |
| W 품질/신뢰도 | 완료 | 신뢰도에 언제나 이유 |
| 관리 화면 | 완료 | 5개 보기 · 게시 버튼 없음(설계) |

리포트 엔진 — **2-1절의 동시 편집으로 배선까지 가지 못했다.**

| 구성요소 | 상태 |
|---|---|
| L~S 리포트 절·내보내기·사건 어댑터 | 모듈 완료 · **파이프라인 미배선** |
| X 내보내기 | 완료 (HTML 정본 · MD · JSON, PDF 는 인쇄) — 실자료 2026-08 월간 보고서로 확인 |
| 리포트 발행·개정·아카이브 | **다른 세션의 PHASE 8 이 담당** |

### 실자료 검증 결과 (2026-09-08)

| 확인 | 결과 |
|---|---|
| 후보 생성 | lab-reports 218건 → 후보 132건 → 콘텐츠 8건 |
| 자격 판정 | 자격 있음 4 · 검토 필요 3 · 차단 1(신뢰도 낮음) |
| 검증 | 전부 PASSED (초기 3회 실패는 전부 실제 결함이었고 고쳤다) |
| MOCK 발행 | 큐 PUBLISHED → 아카이브 `PUB:CNT-2026-000002:x` |
| LIVE 시도 | `NOT_CONFIGURED` — 조용히 성공한 척하지 않는다 |
| 월간 리포트 | 팩트 43 · 사건 8 · 절 17(자료없음 4) · 검증 PASSED |
| 시험 | 배포 71 · 계약 9 · 기존 v2 41 · npm 45 · 리포트 48 = **214건 전부 통과** |
