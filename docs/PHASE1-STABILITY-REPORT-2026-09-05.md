# PHASE 1 STABILITY IMPLEMENTATION REPORT (2026-09-05)

대상 https://earthus.net/v2/ · 조사 커밋 58d9db72 → 구현 f21795c2 · 8a6bf28a · 인텔리전스 기능 변경 0.

## A. KMA

- **수정 Lambda 14개**: kma-aws, kma-aws-min, kma-fcst, kma-life, kma-lightning, kma-mountain, kma-normal, kma-ocean, kma-radar, kma-upper, kma-warn, gts-global, quake-asia, typhoon-official. 각각 `import kma_hub` + `@kma_hub.accounted()` + urlopen 한 줄 감싸기. 산출물 계약(키·필드) 변경 없음.
- **403 처리**: `aws/_shared/kma_hub.py` 가 403 → `quota_exhausted` 로 분류하고 실행 플래그를 켠다. 그 뒤 track() 은 네트워크를 부르지 않고 `QuotaExhausted` 를 던진다.
- **호출 중단**: kma-fcst — 첫 403 에서 회차·셀 순회 중단, S3 미기록(이전 산출물 유지 → STALE). 실측 전 270 헛호출/실행 → 1. kma-radar — 403 즉시 종료, 후보 13개 순회 없음. 운영 실측 `[kma-radar] QUOTA_EXHAUSTED at 202609052110 — 중단, S3 미기록` (13회 → 1회). 나머지 12개는 원래 403 즉시 반환.
- **상태 분리**: success / quota_exhausted / timeout / upstream_error / empty / invalid_response — kma-fcst 는 resultCode 03 → empty, 그 외 비정상 → invalid_response, 본문 없음 → empty 로 표시.
- **회계 위치**: `wind/kma-calls/{YYYY-MM-DD}.json`(서비스별 합계 + total + trend.yesterday_calls/today_calls/delta_percent, IfMatch 동시 쓰기 보호) · `wind/kma-calls/{날짜}/{lambda}.json`(Lambda 자기 파일, runs·endpoints·lastError). 용량 한도값은 **적지 않는다**(확인 불가).
- **운영 실측(12:30Z)**: total calls 23 · quota_exhausted 23 · success 0 — 7개 서비스가 각 1~2회로 끝남(예전 같으면 radar 13·fcst 270).
- **테스트**: `aws/_shared/tests/test_kma_hub.py` 12/12 — TEST 1(10회=10) · 2(403→quota, 중단) · 3(timeout≠quota) · 4(5xx) · 5(empty) · 6(malformed) · 7(quota 뒤 추가 호출 0) · 8(kma-fcst S3 미기록) + radar 2건 + 비허브 호스트 미집계 + flush 합산/추세.
- **예상 일일 호출량 변화**: 정상일 ≈6,000~8,000 은 그대로(정상 호출은 줄이지 않았다 — 목적은 증폭 방지). **용량 초과 이후**: 예전 kma-fcst 24×270=6,480 + radar 396×13=5,148 헛호출 → 이제 24+396=420 (≈ −96%). 용량값은 미확인이라 "안전 여유" 는 말하지 않는다.
- **추가(§4)**: typhoon-official 이 403 때 기상청 발표 행을 통째로 떨어뜨리던 것(사건 방 "기관별 행" 소실) → 직전 문서 또는 D-4 아카이브의 발표를 `stale:true, staleReason, staleOrigin` 으로 유지, 문서에 `kmaState`. 사건 방 행: "발표 09-05T06:00 · 직전 발표 유지(허브 조회 실패)". 실행 역할 `earthus-lambda-kma-verify` 에 archive 접두사 ListBucket 만 추가.

## B. GDACS

| | 기존 | 신규 |
|---|---|---|
| 크기 | 1,971,763 B | **4,575 B (−99.8%)**, 7 사건 |
| 경로 | 브라우저 → gdacs.org MAP 직접 | 브라우저 → `events/gdacs-tc.json`(S3) ← `aws/gdacs-tc`(15분, EventBridge `gdacs-tc-schedule`) ← MAP 원본 |
| 원본 보존 | archiver(EVENTS4APP) | + `archive/gdacs-tc-map/dt=…/hh=…/map.json.gz`(archiver 경로 규칙, 삭제 없음) |
| 브라우저 응답 | 15~106초 | 0.22~0.64초(3회) · 서버 curl 0.62초 |
| 서버 원본 수집 | — | 18~36초(Lambda 안에서, 브라우저와 무관) |
| fallback | 없음 | 축약본 → localStorage `earthus.gdacs.last`(마지막 정상 축약본) → 원본 MAP(둘 다 없을 때만, console.warn) |
| 표시 | — | `sources.gdacs.origin` compact/cache/origin, 상태 줄에 "(이전 축약본 HH:MMZ)" / "(원본 직접)" |
- 필드 계약: `ingestTC()` 가 읽는 eventid·episodeid·eventname/name·alertlevel·country·fromdate·todate·Point 좌표 그대로(값 무변경). Polygon/LineString 제외, 사건 상세 `getgeometry` 경로 무변경. 같은 eventid 는 episodeid 최댓값 하나.
- 회귀 테스트: `tools/test_v2_gdacs_compact.mjs` 5/5(TEST 1·2 축약본만·원본 미요청, 3 캐시, 4 원본 폴백, 5~8 카드 필드 동일, 9 깨진 축약본 → 폴백) + `aws/gdacs-tc/tests` 3/3 + 기존 카드·시각·전환 테스트 회귀 없음.
- 실제 브라우저 요청: 운영 피드 상태 줄에 "(원본 직접)" 없음 → 축약본 경로. QA E2 피드 도착 0초(측정 시작 전 도착), E4 4xx/5xx 0.

## C. Deployment Guards

| 스크립트 | 검증 | 결과 |
|---|---|---|
| tools/deploy-llm.sh | 함수 URL AuthType == AWS_IAM, `/api/ask` POST 200 (CloudFront 경유) | 코드 반영(이번에 LLM 은 재배포하지 않아 실행은 미검증) → **PENDING(실행)** / QA A5·C3 PASS |
| tools/upload_information_release.mjs | 운영 `/v2/` == `/v2/index.html` == manifest SHA-256(최대 3분 대기), 아니면 exit 3 | **PASS**(두 번 배포 모두 "배포 가드 PASS") |
| aws/deploy-python.sh · aws/deploy-lite.sh | us-east-2 에 같은 이름이 있으면 exit 1(삭제 안 함) + 리전 고정 + kma_hub 동봉 + (lite) Windows zip 대체 | **PASS**(15회 배포 모두 "가드 PASS") |

## D. Existing us-east-2

- `aws lambda list-functions --region us-east-2` → **0개**. 삭제 대상 없음(이전 세션에서 cyclone-analog·lab-report-index 복사본은 이미 정리).

## E. Regression

- node:test **63/63**(기존 57 + GDACS 5 + 사건 방 stale 1) · Python **170 + 18 = 188/188**(기존 171 + kma_hub 12 + gdacs 3 + retain 2) · Playwright 실소스(사건·사건 방·지진 방·기준선) **PASS** · 기존 테스트 삭제·완화 0.

## F. Production

- URL https://earthus.net/v2/ · 커밋 8a6bf28a · 배포 12:1x~12:3x UTC(21:1x~21:3x KST)
- QA 마스터 **63 PASS / 3 FAIL / 0 SKIP** — FAIL 3건 모두 EXTERNAL_DATA(B1 특보·B4 해양관측 = KMA 허브 일일 용량 초과 지속, B14 = GHCN 6일 지연). 앱 결함 0.
- 실측: 첫 화면 14.9초(헤드리스), 피드 0초, JS 521 KB, 요청 250, 페이지 예외 0, 4xx/5xx 0, KROVANH 사건 방 8줄(기관별 행 "한국 기상청 발표 09-05T06:00 · 직전 발표 유지") 확인.
- §20 확인 목록: 첫 화면·사건 목록(18)·사건 방(8줄)·GDACS 카드(5)·KMA 자료 STALE 표기·지구에 묻기(자료 부족+켜기)·내 장소(부산중부·감시 문구)·가정 실험(기준선)·지진 방·도달시간 행 — 모두 QA 항목으로 PASS.

## G. 변경 파일

| 파일 | 이유 |
|---|---|
| aws/_shared/kma_hub.py (+tests) | 공통 호출 회계·403 중단 |
| aws/{14개}/handler.py | import·데코레이터·track 한 줄 / kma-fcst·kma-radar 는 403 중단 로직 |
| aws/typhoon-official/handler.py (+test) | 403 때 기상청 발표 stale 유지(직전 문서→아카이브) |
| aws/gdacs-tc/{handler.py,requirements.txt,timeout-seconds.txt,tests} · aws/configure-gdacs-tc-schedule.sh | GDACS 축약본 Lambda·15분 스케줄 |
| prototype/v2-three/js/intel-feed.js | 축약본→캐시→원본 경로, origin 표시 |
| prototype/v2-three/js/event-room.js | 기관별 행 stale 문구 |
| aws/deploy-lite.sh · aws/deploy-python.sh · tools/deploy-llm.sh · tools/upload_information_release.mjs | 배포 가드·리전 고정·kma_hub 동봉·Windows zip |
| tools/test_v2_gdacs_compact.mjs · tools/test_v2_event_room_states.mjs · tools/test_v2_feed_cards.mjs(목 URL) · tools/qa_v2_master.mjs(D10 선택) | 테스트 |

## H. 최종 판정

**PASS WITH PENDING**
- PENDING 1: deploy-llm.sh 가드는 코드만 반영(LLM 재배포 없었음). 다음 LLM 배포 때 실행 확인.
- PENDING 2: KMA 허브 일일 용량값 미확인 → 회계는 추세만. 자정 이후 특보·해양관측 회복(B1·B4) 재판정.
- PENDING 3: kma-lightning 실제 규칙(313회/일) 미확인 — 회계 파일로 다음 날 실측.
