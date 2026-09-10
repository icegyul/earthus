# SNS FACTORY — 도입 결정 (상용 관점, 2026-09-10)

## 1. 점수 (100점: 기술20·플랫폼15·신뢰15·스케줄10·미디어10·승인10·API5·UX5·보안5·라이선스5)

| 후보 | 기술 | 플랫폼 | 신뢰 | 스케줄 | 미디어 | 승인 | API | UX | 보안 | 라이선스 | 총점 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| BrightBean | 17 | 14 | 13 | 9 | 9 | 9 | 5 | 4 | 4 | 0 | 84 |
| Postiz | 18 | 15 | 14 | 9 | 9 | 4 | 5 | 4 | 4 | 0 | 82 |
| TryPost | 14 | 12 | 11 | 8 | 7 | 0 | 3 | 4 | 3 | 0 | 62 |
| Mixpost | 14 | 5 | 11 | 8 | 8 | 0 | 1 | 4 | 3 | 5 | 59 |
| sm-scheduler | 8 | 6 | 7 | 7 | 4 | 0 | 2 | 2 | 3 | 5 | 44 |
| Post4U | 9 | 4 | 7 | 7 | 4 | 0 | 3 | 2 | 2 | 5 | 43 |
| threads.js | 5 | 2 | 3 | 0 | 2 | 0 | 2 | 1 | 2 | 5 | 22 |
| threads-publisher | 3 | 2 | 2 | 0 | 3 | 0 | 0 | 1 | 2 | 5 | 18 |
| threads-cli | 5 | 2 | 3 | 0 | 2 | 0 | 1 | 2 | 2 | 1 | 18 |
| threads_api | 3 | 2 | 1 | 0 | 2 | 0 | 1 | 1 | 1 | 2 | 13 |

- BEST TECHNICAL BASE: BrightBean (84. Python 동족 + 18/18 + 팀승인 + MCP. 단 AGPL이므로 REFERENCE로만 사용)
- BEST COMMERCIAL BASE: Mixpost (59. MIT 최고점. 단 Threads/Carousel/Approval 부재 — 상용 도입 시 Threads·승인 모듈 신설이 조건)
- BEST FEATURE REFERENCE: Postiz (82. 36 통합 + Temporal 패턴 + 분석캐시. AGPL이므로 읽기만)

## 2. 최종 도입 전략: ADOPT SELECTIVE MODULES (MIT만·재구현 중심)

- AGPL 3종(BrightBean·Postiz·TryPost): REFERENCE ONLY. 복붙·번역이식·의존추가 금지.
- MIT에서 패턴만 취해 EARTHUS 코드로 재구현: Threads 컨테이너폴(TJS/TCL), 토큰 파일권한·재시도(SMS), 실패플랫폼만 재시도(P4U), rate-limit 특성(MP).
- EARTHUS 강점 유지: DATA·REPORT·INTELLIGENCE·PROVENANCE·APPROVAL·REPORT→SNS. 자동게시 만들지 않음(마케팅 스튜디오 규칙).

## 3. 타깃 아키텍처

```text
EARTHUS CORE (유지)
Globe / Data / Intelligence / Simulation / Reports
  ↓ (report_bridge·lab_report·verify_scorecard — 유지)
API / SERVICE LAYER (Edge social-admin — 유지, 읽기 전용 분석 액션만 추가)
  ↓ confirmed=true + 멱등키 (유지)
EARTHUS SNS FACTORY (신설은 3 모듈만)
Content·Composer·Drafts(유지) / Media(보강: 컨테이너폴+썸네일) / Social Accounts·Providers(유지)
Scheduler(신설: 승인후 예약실행기, 자동게시 아님) / Queue(유지+플랫폼상한) / Approval(유지)
Publisher(유지 분리) / History(유지) / Analytics(신설: 자동수집기)
```

## 4. 변경 계획 (이번 단계는 제안만. 수정 없음)

- FILES TO ADD: `aws/distribution/rate_limit.py`(신규·표준lib만), `aws/distribution/analytics_fetch.py`(신규·`record_metrics`로 적재), `aws/distribution/scheduled_release.py`(신규·승인후 예약실행, 자동게시 경로 없음).
- FILES TO MODIFY: `aws/distribution/sns_adapters/base.py`(상한훅), `aws/distribution/archive.py`(수집시각), `prototype/js/distribution-admin.js`(성과 렌더 보강), `aws/distribution/publish_queue.py`(생성주기/게시시각 분리 명시).
- FILES TO DELETE: 없음.
- DATABASE CHANGES: 없음(기존 Storage 볼트·publish-log 사용).
- API CHANGES: `social-admin`에 지표읽기 액션만 추가 제안. 공개 REST·MCP 신설 없음.
- DEPENDENCIES: 신규 없음. ENVIRONMENT VARIABLES: 신규 없음. MIGRATIONS: 없음.
- 삭제 필요 없으므로 OLD→NEW→MIGRATION→TEST 해당 없음.

## 5. 리스크

- AGPL 오염(복붙 유혹) — 본 문서가 금지. 리뷰 시 LICENSE_AUDIT 대조.
- 자동게시 오해 — 예약실행기는 승인건만, 실행도 사람이 켠다.
- 운영 연결상태 UNKNOWN — 볼트·키 실측 전까지 LIVE 단정 금지.
- Ddalkkak NOT_FOUND — 존재 가정 결정 금지.

## 6. EDIT GATE: PASS

- Repository identity=PASS / Current audit=PASS / Core source audit=PASS(3종 각 6파일+) / Additional=7(>=5) / Matrix=100%(>=95%) / License=PASS / Architecture=PASS / 3 BEST 식별 / Target 정의 / Change plan 정의 / Destructive=NO / Ambiguity=0 / Critical license ambiguity=0.

## 7. IMPLEMENTED (2026-09-10, baseline 392a86f6)

- IMPLEMENTED: rate_limit.py / scheduled_release.py / analytics_fetch.py (3 신규) + base.py·archive.py·publish_queue.py·distribution-admin.js 최소 확장(추가만).
- REFERENCE PROJECT: BrightBean·Postiz·TryPost(AGPL, 읽기만) / Mixpost(MIT, 구조참고) / threads.js·threads-cli·sm-scheduler·Post4U(MIT 패턴).
- INDEPENDENT IMPLEMENTATION: AGPL 소스 복붙 0. EARTHUS 계약·어휘·주석 규격으로 재작성.
- LICENSE: 신규 파일 라이선스 고지 불필요(자체 작성). MIT 발췌 0 (패턴만 참고).
- FILES: ADD 7 (모듈 3 + 시험 4) / MODIFY 4 / DELETE 0.
- DATABASE: NONE. API: NONE(공개 REST·MCP 신설 없음). DEPENDENCIES: NONE(표준lib만).
- TESTS: python distribution 71→100 pass + subtests 14 pass (신규 29). report-engine 320 pass. _shared 37 pass. 각 suite 단독 실행 기준.
- KNOWN NON-REGRESSIONS (내 변경 아님, 손대지 않음):
  1. npm 1 fail — `test_v2_ui_information_architecture.mjs` 위성 시뮬능력 불변식. 세션 중 09:55 외부 동시편집(`phenomenon-registry.js` simulation:false→true)이 원인. 내 호출은 해당 파일에 닿지 않음.
  2. pytest 결합실행 실패 — `aws/distribution`·`aws/report-engine` 동명모듈(`generator.py` 등)+`sys.path.insert` 충돌로 기존부터 suite 단독 실행이 정본. 기존 파일 미변경.
- BROWSER: 1440/1024/390/375 PASS (로드·5탭·overflow 0·콘솔에러 0, 실데이터 렌더 확인).
- SECURITY: Secrets exposed 0 / Unauthorized publish paths 0 / APPROVAL BYPASS 0 / DUPLICATE PUBLISH 0 (멱등키).
- ANALYTICS: NOT_CONFIGURED→구조 PASS (실제 provider 미연결이므로 실측 표기 금지).
- RATE LIMIT: PASS (미설정=미강제).
