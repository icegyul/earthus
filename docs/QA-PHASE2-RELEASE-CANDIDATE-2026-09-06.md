# EARTHUS V2 PHASE 2 RELEASE CANDIDATE QA

기준일 2026-09-05 (작업 12:50~13:50 UTC / 21:50~22:50 KST) · 대상 https://earthus.net/v2/ · 인텔리전스 기능 변경 0 · 테스트 삭제·완화 0

## 1. Executive Summary

- **최종 판정: RELEASE CANDIDATE — PASS WITH PENDING**
- 운영 QA 마스터 66항목 중 63 PASS · 3 FAIL(모두 EXTERNAL_DATA: KMA 허브 일일 용량 초과 지속 2건, GHCN 공표 지연 1건). 장애·복구 QA 15/15 PASS(2차 실행, 수정 배포 후). 모바일 24/24 PASS(+실기기 3 PENDING). 회귀 node 70/70 · Python 190/190 · Playwright 실소스 PASS. 배포 함정 3건 재발 0. 시크릿 노출 0.
- 이번 단계에서 발견해 **최소 수정한 APP 결함 4건**(모두 "실패를 정직하게 보이기" 계약 위반): ① kma-fcst 전 칸 실패 시 빈 문서로 덮어쓰기 ② kma-life 전 지수 실패 시 빈 문서로 덮어쓰기 ③ 지구에 묻기 5xx 빈 본문에 기술 메시지 노출 ④ 내 장소가 3시간 묵은 특보 자료로 "발효 특보 0건" 표시(감시도 계속). + GDACS 폴백 경로 표기가 정상 상태에선 안 보이던 것.
- PENDING: KMA 허브 용량 회복(자정 KST 이후) · 실기기 iPhone/Android · LLM 실제 재배포 경로(가드는 verify-only 로 실행 검증됨).

## 2. Baseline (STEP 01)

| 항목 | 값 |
|---|---|
| 조사·구현·보고 커밋 | 58d9db72 · f21795c2 · 8a6bf28a · a78bfa09 |
| 작업 시작 시 HEAD | a78bfa09 (8a6bf28a 대비 docs 2파일만 차이) |
| 운영 /v2/ = /v2/index.html | SHA-256 `a42793ea48be319c…` 동일 = manifest(index) 동일 · main.js?v=184-hef |
| CloudFront | `X-Cache: RefreshHit from cloudfront` · Via cloudfront |
| Function URL earthus-llm | AuthType **AWS_IAM** · CORS AllowOrigins https://earthus.net |
| us-east-2 Lambda | 0개 |
| Lambda(서울) LastModified | kma-* 14개 12:11~12:15Z(PHASE 1), typhoon-official 12:29Z, gdacs-tc 12:17Z, tsunami-eta 10:40Z, cyclone-analog 10:03Z, earthus-llm 08:18Z |
| 작업트리 | 추적 파일 변경 없음(작업 무관 미커밋 파일 10개는 PHASE 1 이전부터 있던 것, 이번에 건드리지 않음) |

## 3. PENDING Resolution (STEP 02)

| PENDING | 판정 | 근거 |
|---|---|---|
| 1 deploy-llm.sh 가드 실행 | **PASS(가드 경로) / 실제 재배포 PENDING** | `--verify-only` 옵션을 추가해 배포 없이 가드만 실행: `AuthType=AWS_IAM · /api/ask 200` PASS. Windows 에서 `/dev/null` 이 MSYS_NO_PATHCONV 로 깨져 `200000` 이 나오던 가드 자체 버그(TEST_TOOL)를 고쳤다. 운영 LLM 은 재배포하지 않았다(불필요) |
| 2 KMA 허브 용량 회복 | **PENDING (EXTERNAL_DATA)** | 13:35Z 회계: total calls 94 · quota_exhausted 94 · success 0. 특보 10:17Z·해양관측 10:05Z 그대로. 회복 시각은 KST 자정 이후로 예상하나 **확인하지 않았다**(추정 금지). 앱은 STALE·조회 불가로 정직 표기(§5·§10) |
| 3 kma-lightning 실제 호출량 | **PASS(실측)** | 규칙 `kma-lightning-schedule = cron(0/5 * * * ? *)`(5분) → 288/일. 로그 실행 시각 11:55·12:00·…·12:50(정확히 5분 간격). 회계 12:14~13:35Z 사이 17 runs · 17 calls(1회/실행). 앞선 "313/일"은 로그 tail 이 부분 겹친 수치였다 → 폐기 |

## 4. Data Reliability (STEP 03) — 13:35Z 기준

| Source | Schedule(규칙) | Latest Artifact | Freshness | SLA | Status | Failure Behavior | Recovery |
|---|---|---|---|---|---|---|---|
| KMA warning | cron 2,17,32,47 | events/kma-warn.json 10:17Z | 198분 | 60분 | **STALE**(EXTERNAL 403) | 403→not-approved, S3 미기록, 회계 quota_exhausted | 자동(다음 성공 실행) |
| KMA ocean(부이·해양관측) | cron 5,35 | ocean/kma-buoy.json 10:05Z | 210분 | 120분 | **STALE** | 403 즉시 반환 | 자동 |
| KMA AWS | ≈45분(규칙명 확인 불가) | wind/kma-aws.json 10:25Z | 190분 | — | STALE | 403 시 좌표 없이 진행(지점표 캐시) | 자동 |
| KMA AWS minute | cron 2,12,…,52 | wind/kma-aws-min.json 10:22Z | 193분 | — | STALE | 403 즉시 반환 | 자동 |
| KMA forecast | earthus-kma-fcst cron 15 * | wind/kma-fcst.json **11:17Z count 0 / failedCells 97** | 138분 | — | **EMPTY 문서(결함 ①, 이번에 수정)** | 이전: 전 칸 실패도 빈 문서 기록 → 이제 quota/all-failed 는 S3 미기록. 첫 403 뒤 호출: 스레드 8개가 각 1회(8), 회차·셀 순회 0 | 다음 성공 실행이 덮음 |
| KMA radar | cron 0/5 | wind/kma-radar.json 10:25Z | 190분 | — | STALE | 403 즉시 종료(후보 13→1). 회계 19 runs·19 calls | 자동 |
| KMA lightning | cron 0/5 | events/kma-lightning.json 10:25Z | 190분 | 60분 | STALE | 403 즉시 반환 | 자동 |
| KMA mountain | cron 25 2,5,…,23 | wind/kma-mountain.json 08:26Z(153/165) | 309분 | 3시간 | STALE | 403 raise → 미기록 | 자동 |
| KMA life | cron 50 */3 | wind/kma-life.json **12:50Z 지수 0개(결함 ②, 이번에 수정)** | — | 3시간 | EMPTY 문서 → 이제 미기록 | 403/전 지수 실패 → quota_exhausted/all-failed 반환, 호출 1회 | 다음 성공 실행 |
| KMA upper | cron 40 1,13 | wind/kma-upper.json 01:40Z | 12h 주기 안 | 12h | NORMAL | 403 raise, 프로파일러 실패는 POLICY_BLOCKED 로 분리 | — |
| KMA typhoon official | ≈매시(규칙명 확인 불가) | events/typhoon-official.json 13:25Z, kmaState QUOTA_EXHAUSTED | 신선 | 180분 | NORMAL + KMA 행 **stale(직전 발표 유지, 아카이브 출처)** | JMA/NHC 는 정상 수집, KMA 는 stale 표시 | 자동 |
| GTS global | cron 35 * | wind/gts-global.json 09:35Z | 240분 | — | STALE | 403 즉시 반환 | 자동 |
| USGS earthquake | 브라우저 직접(4.5_day) | 0.46초 · 9.4 KB | 실시간 | 60분 | NORMAL | 실패 시 "USGS 조회 불가 · 재시도", 직전 목록 보존 | 재시도 |
| GDACS | gdacs-tc rate 15분 | events/gdacs-tc.json 13:33Z · 4,575 B | 신선 | 180분 | NORMAL | 축약본→localStorage→원본 폴백, 모두 실패 시 "GDACS 조회 불가" | 자동 |
| GHCN temperature | earthus-climatology-korea cron 30 3 | wind/series/korea-daily.json 03:30Z, 마지막 값 08-30 | 6일 | 4일(기준) | **STALE(EXTERNAL 공표 지연)** | 파이프라인 정상 실행 | 출처 공표 대기 |
| tsunami simulation | tsunami-eta rate 15분 | ocean/tsunami-eta.json 13:37Z | 신선 | 40분 | SIMULATION_ONLY | 색인에 없는 지진 → NOT_A_TARGET(404 없이) | — |
| PTWC(tsunami-intl) | earthus-tsunami-intl rate 5분 | events/tsunami-intl.json 13:36Z | 신선 | 60분 | NORMAL | 실패 시 "쓰나미 발표 조회 불가 — 없다고 적지 않습니다" | 자동 |

상태 규칙(§6) 적용 확인: 조회 실패≠없음(K1·K4·T2), 없음≠안전(G4·K2·T1), STALE≠정상(사건 방 "STALE · N분 전 자료", 내 장소 "묵은 자료 기준 … 최신 여부 미확인"), NOT_A_TARGET≠FAILED(T1), SIMULATION_ONLY≠공식(가정 실험·도달시간 문구).

## 5. KMA QA (STEP 04·07)

| 상황 | 기대 | 결과 | 근거 |
|---|---|---|---|
| 403 | quota_exhausted·호출 중단·S3 미기록·이전 artifact·UI STALE | PASS | 단위 12건 + 운영 회계(94 calls 전부 quota_exhausted, 서비스당 1~2회/실행) + 사건 방 "STALE · 188분 전 자료" |
| timeout | timeout 분류·artifact 보존 | PASS | 단위 test_3·radar timeout walk·fcst all-failed(신규) |
| 5xx | upstream_error·보존 | PASS | 단위 test_4 |
| empty | empty·정상 오판 없음 | PASS | 단위 test_5, kma-fcst resultCode 03 → note_empty |
| malformed | invalid_response·보존 | PASS | 단위 test_6, K4(브라우저) |
| kma-fcst 첫 403 뒤 추가 호출 | 0 | PASS(8 스레드 각 1회 동시, 순회 0) | 회계 3 runs·24 calls = 8/run |
| kma-radar 403 뒤 후보 순회 | 없음 | PASS | 회계 19 runs·19 calls |

## 6. GDACS QA (STEP 05)

| 상태 | 결과 | 근거 |
|---|---|---|
| compact 정상 | PASS | 4,575 B · 0.22~0.64초, 카드 5~7 |
| compact 404 | PASS | G1 원본 폴백, 상태 줄 "(원본 직접)" |
| compact 5xx | PASS | G2 + 단위 |
| compact timeout | PASS | G3(25초 지연 → 20초 컷 → 폴백) |
| compact stale(generated 오래됨) | PASS | 단위: 값은 쓰되 sources.gdacs.generated 로 시각 노출 |
| localStorage 정상 | PASS | G5 "이전 축약본 09-05 13:18Z", 원본 미요청 |
| localStorage 없음 | PASS | G1~G3 원본 폴백 |
| 원본 접근 가능 | PASS | 15~28초 후 카드 |
| 원본 접근 불가 | PASS | G4 "GDACS 조회 불가 · 재시도", USGS 유지, 직전 목록 보존(단위) |
| 원본 MAP 아카이브 | PASS | archive/gdacs-tc-map/dt=…/hh=…/map.json.gz(비공개 403 확인) |

수정: 폴백 경로 표기가 partial/stale 상태에서만 보이던 것 → cache/origin 이면 정상 상태에서도 상태 줄에 보인다(테스트 추가).

## 7. Performance (STEP 06) — 헤드리스 Chromium, 소프트웨어 GL, 운영

| 측정 | 데스크톱 cold | 데스크톱 warm | iPhone 13 | Pixel 5 | PHASE 1 기준 |
|---|---|---|---|---|---|
| DNS/TCP/TLS/TTFB (ms) | 4/12/8/530 | 0/0/0/559 | 8/12/7/531 | 1/14/10/528 | — |
| FCP / LCP (ms) | 3,336 / 3,360 | 7,656 / 7,656 | 580 / 592 | 572 / 576 | — |
| DOMContentLoaded | 5,805 | 9,856 | 2,229 | 3,299 | — |
| 첫 지구 셸(#intel-tab) | **16.8초** | 10.7초 | 13.3초 | 14.1초 | 14.9초 |
| 첫 피드 / 목록 안정 | 7 / 9 ms | 5 / 7 | 5 / 7 | 5 / 7 | 0초 |
| 사건 방 / 지진 방 | 2,992 / 314 | 1,618 / 301 | 1,674 / 325 | 1,766 / 826 | — |
| 내 장소 / 가정 실험 / 지구에 묻기 | 7,977 / 8 / 17,964 | 8,534 / 10 / 16,449 | 6,513 / 9 / 9,755 | 7,694 / 9 / 12,245 | — |
| 요청 수 / 전송량 | 1,018 / **64.5 MB** | (누적 측정) | 768 / 51.7 MB | 811 / 53.4 MB | 250 / 4.7 MB(버퍼 250개 한도로 과소) |
| JS / CSS / 이미지 / API | 1,723 KB / 7 / 58,363 KB / 5,864 KB | — | 1,723 / 7 / 45,563 / 5,538 | 1,723 / 7 / 47,347 / 5,538 | JS 521 KB(과소) |
| 4xx / 5xx / 실패 / 예외 | 2(usage_bump·favicon) / 0 / 12(중단된 타일) / 0 | 2/0/24/0 | 2/0/13/0 | 2/0/13/0 | 0/0/—/0 |

- **기준선 정정**: PHASE 1 의 "JS 521 KB · 4.7 MB · 요청 250" 은 브라우저 리소스 버퍼(250개) 한도로 과소 측정된 값이었다(TEST_TOOL). 실제 cold 는 **약 1,000요청 · 64 MB**, 그중 지구 텍스처·구름 타일 58 MB.
- warm 값은 같은 컨텍스트에서 두 번 내비게이션한 누적치라 요청·바이트는 비교 불가(TEST_TOOL 한계), 셸 시간(10.7초)만 유효.
- 병목: 소프트웨어 GL 의 텍스처 업로드·이미지 58 MB. 이번 단계에선 §10 원칙(기능·정확도·폴백 삭제 금지)에 따라 **수정하지 않았다** → Known Limitations.
- p50/p95: 각 조건 1회 측정이라 산출하지 않았다(단일 측정으로 개선 주장 안 함).

## 8. UX (STEP 07) — 운영 텍스트 실측(13:2x Z, KROVANH-26)

| 화면 | 중요한 것 | 최신/오래됨 | 출처 | 공식/EARTHUS/시뮬 구분 | 다음 행동 | 장애 오해 가능성 |
|---|---|---|---|---|---|---|
| 첫 화면 | 지구+"EARTH INTELLIGENCE" 버튼 | 자료 시각은 각 카드 | — | — | 온보딩 4단계 | 낮음 |
| 사건 목록 | 20건, 8필드 카드 | "7시간 전 · 회차 1시간 전" | GDACS·USGS 상태 줄 | 공식 예보/공식 관측 배지 | 카드 클릭 | 낮음(폴백 표기 추가) |
| 사건 방 | 기관 스택 8줄 | "STALE · 188분 전 자료"(특보), "직전 발표 유지(허브 조회 실패)"(KMA) | 줄마다 기관·배지 | OFFICIAL/MODEL/OBSERVED/WARNING | 지구에 켜기·재시도·원문 | 낮음 |
| 지진 방 | USGS·PTWC·도달시간 | 관측 시각 | 줄마다 | 도달시간 SIMULATION_ONLY·"파고·침수 아님" | 원문 | 낮음 |
| 내 장소 | 하늘·구역·특보·대기질·감시 | **수정 전: 3시간 묵은 특보로 "0건"** → 수정 후 "묵은 자료 기준 0건 — 최신 여부 미확인 · STALE · 204분 전" + "감시 중단 — 특보 자료 STALE. 안전하다는 뜻이 아닙니다" | 각 자료 기준 시각 | 관측 | ⟳ | **수정으로 해소** |
| 선택 자료(now) | 켜진 레이어·소스 상태 8/11 | "KMA 기상 특보 끊김 3시간 전, AWS 지연" | 소스별 | — | 레이어 끄기 | 낮음 |
| 자료의 근거(why) | 인과 게이트 문구, 근거 3 | 시각 포함 | 레이어별 | — | 고른 사건 근거 보기 | 낮음 |
| 예보(next) | 기관별 +24h/+48h, "공식 예보와 모델을 합치지 않습니다" | 발표 시각 | JMA·ECMWF | 공식/모델 분리 | 5일 예보 | 낮음 |
| 예정 | (NEXT 안에 병합 표시) | — | — | — | — | — |
| 가정 실험 | 기준선 JMA r033 +24h, "공식 예보 아님 · SIMULATION_ONLY" | 회차 | JMA | 시뮬레이션 배지 | 실험 시작 | 낮음 |
| 지구에 묻기 | "자료 부족 + 켜기 제안", 5xx 시 "답을 받지 못했습니다"(수정) | 스냅샷 기준 | "스냅샷만 보고 쓴 것" | — | 켜기 | 낮음(수정) |

UX 관찰(수정 안 함, 기록): 사건 방 해양관측 줄에 `OBSERVED` 와 `UNAVAILABLE · 3시간 전` 배지가 함께 보여 "값이 있는데 UNAVAILABLE" 로 읽힐 수 있다 — 소스 신선도 배지 라벨은 다음 UX 검토 대상.

## 9. Mobile (STEP 08)

- iPhone 13 세로·가로, Pixel 5(Android) 세로·가로 × 6항목(탭 6개 화면 안·터치 ≥32px, 가로 스크롤 없음, 고정 UI 잘림 없음, 패널 스크롤, 카드 탭→사건 방, 묻기 입력 포커스) = **24/24 PASS**
- QA 마스터 F1~F5(iPhone 13) PASS
- **PENDING**: 실기기 iPhone · 실기기 Android · 가상 키보드가 뜬 상태의 레이아웃(에뮬레이션 불가). 에뮬레이션을 실기기 PASS 로 바꾸지 않는다.

## 10. Failure / Recovery (STEP 09) — 운영 코드 + 네트워크 가로채기, 15항목 · 2차 실행 15/15 PASS

| ID | 시나리오 | 결과 |
|---|---|---|
| G1~G5 | GDACS compact 404/5xx/timeout/모두 불가/캐시 | PASS ×5 |
| K1 | 특보 5xx → 줄 유지 "조회 불가 (HTTP 503)"+재시도, "특보 없음" 없음 | PASS |
| K2 | 내 장소 특보 실패 → "확인 실패 — 판단하지 않음"+"감시 중단 … 안전하다는 뜻이 아닙니다" | PASS |
| K3 | 기관 소스 timeout(20초) → 해당 줄만 조회 불가, GDACS 줄 유지 | PASS(1·2차) |
| K4 | 특보 JSON 깨짐 → "조회 불가 (Unexpected end of JSON input)" | PASS |
| T1 | 도달시간 파일 403 → "계산 대상 아님 — 위험이 없다는 뜻이 아닙니다" | PASS |
| T2 | PTWC 불가 → "쓰나미 발표 조회 불가 — 없다고 적지 않습니다" | PASS |
| B1 | 느린 망(+1.5초/요청) → 45초 뒤 카드 18, 5xx 0 | PASS |
| B2/B3 | 오프라인 재시도 → 직전 목록 유지 / 복구 후 갱신 | PASS |
| A1 | 묻기 API 5xx 빈 본문 → "답을 받지 못했습니다" (수정 전 FAIL: 기술 메시지 노출) | PASS |

"안전합니다 / 위험 없음 / 피해 없음 / 정상입니다" 문구: 모든 시나리오에서 0건.

## 11. Deployment (STEP 10)

| CASE | 검증 | 결과 |
|---|---|---|
| 1 LLM URL NONE | AuthType=AWS_IAM(QA C3) · deploy-llm.sh --verify-only PASS · /api/ask 200(A5) | PASS |
| 2 /v2/ 옛 HTML | /v2/ == index.html == manifest SHA(A1 + 업로더 가드 3회 PASS) | PASS |
| 3 us-east-2 복사본 | 0개(C2) · 15회 배포 모두 가드 PASS | PASS |
| 스케줄 | 8/8 활성(C4) | PASS |
| Lambda 오류 | 최근 6시간 0(C5) | PASS |

## 12. Security (STEP 11)

| 항목 | 결과 |
|---|---|
| 브라우저 번들 시크릿(authKey/AKIA/GEMINI/api_key/sk-) | 8파일 0건 |
| /api/ask 잘못된 서명 | 403 (SigV4 불일치 메시지, 스택 없음) |
| CORS 다른 오리진 preflight | Access-Control-Allow-Origin 없음(200 빈 응답) |
| S3 비공개 접두사 archive/ · 루트 리스팅 | 403 |
| 존재하지 않는 /v2 파일 | 403 S3 AccessDenied XML — 정보 노출 없음(백엔드가 S3 임은 드러남, 낮음) |
| KMA 키 | Lambda 환경변수에만, 보고서·로그에 값 기록 없음 |

## 13. Regression (STEP 12)

| | 기준 | 결과 |
|---|---|---|
| node:test | 63/63 | **70/70** (+GDACS 4 +묻기 5xx 1 +감시 STALE 1 +폴백 표기 1) |
| Python | 188/188 | **190/190** (+fcst/life all-failed 2) |
| Playwright 실소스 | PASS | PASS (카드 18 · 사건 방 8줄 · 지진 방 NOT_TARGET · 기준선) |
| 삭제·완화 | 0 | 0 |

## 14. Production Verification

- QA 마스터(13:0x Z 최종) **63 PASS / 3 FAIL / 0 SKIP** — FAIL: B1·B4(KMA 용량, EXTERNAL_DATA), B14(GHCN, EXTERNAL_DATA)
- 장애·복구 2차 실행(수정 배포 후, 13:4x Z): **15/15 PASS** — `output/qa-v2-failure/result.json`·`run2.log`
- 내 장소 실측(13:40Z): "구역 특보 묵은 자료 기준 0건 — 최신 여부 미확인 STALE · 204분 전 자료 … 감시 중단 — 특보 자료 STALE (204분 전 자료). 안전하다는 뜻이 아닙니다."
- 이번 단계 배포 3회(ask-earth/intel-feed, main/watch, kma-fcst/kma-life Lambda) 모두 가드 PASS

## 15. Known Limitations

1. 첫 화면 13~17초(헤드리스)·cold 64 MB — 지구 텍스처·타일이 원인. 이번 단계 수정 대상 아님(§10)
2. KMA 허브 일일 용량값 미확인 — 회계는 추세만
3. 사건 방 소스 신선도 배지 `UNAVAILABLE` 라벨이 값 있는 STALE 소스에도 붙어 오해 여지
4. GHCN 한국 기온 6일 지연(출처)
5. wind/kma-fcst.json 은 수정 전 기록된 **빈 문서(11:17Z)** 가 다음 성공 실행 전까지 남는다 — 예보 화면은 "자료 없음"으로 보일 수 있음(EXTERNAL+APP 잔존 상태; 다음 성공 실행에 자동 해소)

## 16. Release Blockers

없음. 검사 항목: production 5xx 0 · 배포 SHA 일치 · /v2 일치 · 리전 정상 · 시크릿 0 · KMA 실패를 정상으로 표시 0(내 장소 결함은 수정·배포·실측) · STALE 을 최신으로 표시 0 · 공식/시뮬 혼동 0 · artifact 삭제 0 · 인텔리전스 회귀 0 · 묻기 환각(5xx 시 지어낸 답) 0 · 가정 실험 공식 표시 0 · 모바일 주요 기능 불가 0 · 테스트 삭제·완화 0

## 17. Final Decision

**RELEASE CANDIDATE — PASS WITH PENDING**

PENDING(EXTERNAL/환경): KMA 허브 용량 회복 확인(B1·B4 재판정) · 실기기 iPhone/Android · LLM 실제 재배포 시 가드 실행.

### 수정 목록 (문제 → 원인 → 영향 → 수정 → 검증 → 상태)
1. kma-fcst 빈 문서 덮어쓰기 → 전 칸 실패도 `put_object` → 예보 화면 "없음" → `if not points: return all-failed` → 단위 + 운영 invoke(미기록) → 완료
2. kma-life 빈 문서 덮어쓰기 → 동일 → 생활지수 "없음" → 전 지수 비면 미기록 → 단위 + 운영 invoke → 완료
3. 묻기 5xx 기술 메시지 → `res.json()` 예외 메시지 노출 → 사용자 혼란 → 파싱 실패/!ok 는 errNet → 단위 + 장애 QA A1 → 완료
4. 내 장소 묵은 특보 "0건" → 특보 문서 나이 미검사 → STALE 을 정상처럼 → 60분 SLA 로 STALE 표기 + 감시 SUSPENDED → 단위 + 운영 실측 → 완료
5. GDACS 폴백 표기 미노출 → 상태 줄이 partial/stale 에서만 → 원본 직접 사용 사실 숨김 → cache/origin 이면 표기 → 단위 + 장애 QA G1·G5 → 완료
6. deploy-llm.sh 가드 curl(Windows) → MSYS 경로 변환 → 가드 오판 → env -u 로 호출 → verify-only PASS → 완료(TEST_TOOL)

### 변경 파일
aws/kma-fcst/handler.py · aws/kma-life/handler.py · aws/_shared/tests/test_kma_hub.py · prototype/v2-three/js/ask-earth.js · intel-feed.js · main.js · watch.js · tools/deploy-llm.sh · tools/test_v2_ask_suggest.mjs · test_v2_gdacs_compact.mjs · test_v2_watch.mjs · 신규 tools/perf_v2_measure.mjs · qa_v2_failure.mjs · qa_v2_mobile_extra.mjs
