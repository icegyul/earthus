# EARTHUS V2 — PHASE 1 조사 결과: KMA API 호출 구조 · GDACS 경로 · 배포 함정 (2026-09-05)

지시서 §23 "코딩 전 조사" 의 첫 보고. 수치는 **로그·코드에서 직접 센 것**이고, 추정은 "추정" 이라고 적었다. KMA 허브의 일일 용량 정책값은 확인하지 못했다 → **확인 불가**.

## 1. KMA API 허브 키를 쓰는 Lambda (실제 17 → 호출 주체 14)

grep 으로 잡힌 17개 중 `gk2a-clouds`(authKey 0건, NMSC 타일), `lightning`(kma-lightning 산출물 S3 재사용), `signal-foundation`(S3 만 읽음) 은 **허브를 부르지 않는다**. 실제 호출 주체는 14개. 키는 모두 같은 값(`KMA_HUB_KEY` 또는 `KMA_KEY`) — **키 1개 공유**.

| SERVICE | LAMBDA | ENDPOINT | SCHEDULE(근거) | 24h 실행(로그) | 호출/실행(코드) | EXPECTED_CALLS/DAY | RETRY | CACHE(마지막 정상값) | QUOTA_RISK |
|---|---|---|---|---|---|---|---|---|---|
| 단기예보 격자 | kma-fcst | typ02 VilageFcst | cron(15 * * * ? *) 매시 | 24 | ASOS 97지점→격자 셀(≈90) × 회차 1~3 | **≈2,200 정상 / 최대 6,500** | `except Exception: continue` — 403 도 회차 3개 모두 시도(증폭) | S3 이전 산출물 유지 | **최고** |
| 산악기상 | kma-mountain | typ08 getMountainWeather | 8회/일 | 8 | 165지점 + 2일×8회차 폴백 | ≈1,450 | 403 은 raise → 즉시 중단 | 유지 | 높음 |
| 해양관측·부이 | kma-ocean | sea_obs, kma_buoy ×2 | ≈30분 | 51 | 3 | ≈150 | 403 즉시 반환 | 유지 | 낮음 |
| 레이더 | kma-radar | typ03 rdr_cmp1_img(이미지) | cron 5분 | 396 | 1 (미달 시 최대 13 후보) | ≥396 / 최대 ≈5,000 | 후보 시각 최대 13개 재시도 | 이전 프레임 병합 | **높음(이미지가 용량에 드는지 미확인)** |
| 낙뢰 | kma-lightning | lgt_pnt | rate 10분(규칙명 미확인·로그 313회=약 4.6분) | 313 | 1 | ≈313 | 403 즉시 반환 | 유지 | 중 |
| AWS 분 자료 | kma-aws-min | nph-aws2_min, stn_inf | ≈10분 | 145 | 1~3 (3·6·12분 전 폴백) + 지점표 | ≈150~450 | 빈 응답 시 폴백 3회, 403 즉시 반환 | 유지 | 중 |
| 특보 | kma-warn | wrn_now_data (+wrn_reg_aws2·계층 24h 캐시) | cron 2,17,32,47 | 97 | 1 (+캐시 만료 시 2) | ≈100 | 403 즉시 반환(`not-approved`) | 유지(이번 장애 때 STALE 로 보임) | 낮음 |
| 지진 | quake-asia | eqk_now | rate 10분 | 144 | 1 | 144 | 없음 | 유지 | 낮음 |
| 태풍 공식 | typhoon-official | typ_data | 미확인(로그 25회≈매시) | 25 | 태풍당 이분탐색 ≤6 × KMA 번호 2~4 | ≈300~600 | 이분탐색 자체가 재시도(빈 응답=범위 축소) | 유지 + 아카이브 | 중 |
| 지상관측 ASOS | kma-aws | kma_sfctm2 (+지점표 24h 캐시) | ≈45분 | 32 | 1~2 | ≈50 | 403 은 좌표 없이 계속 | 유지 | 낮음 |
| 생활지수 | kma-life | typ02 UV·확산·꽃가루×2 | 3시간 | 8 | 4지수 × 17시도 = 68 | ≈550 | 없음 | 유지 | 중 |
| 고층 | kma-upper | upp_idx + 프로파일러 7시각×2모드 | 12시간 | 2 | 15 | 30 | 403 raise | 유지 | 낮음 |
| GTS 전지구 | gts-global | gts_syn | 매시 | 24 | 1 | 24 | 403 즉시 반환 | 유지 | 낮음 |
| 평년값 | kma-normal | sfc_norm1 | 수동 | 0 | 지점 수만큼(0.15초 간격) | 0 | 403 즉시 반환 | — | 수동 시 주의 |

**합계(추정)**: 정상 하루 ≈ **6,000~8,000 호출**, 회차 미도착·이미지 미달·용량 초과가 겹치면 **1만 이상**. 19:32 KST 에 막힌 것은 이 규모가 하루 용량에 닿았다는 뜻이다. 용량값 자체는 **확인 불가**(허브 관리 화면 필요).

**호출 회계가 없다**: 어느 Lambda 도 호출 수를 기록하지 않는다. CloudWatch 메트릭 조회 권한(`cloudwatch:GetMetricStatistics`)도 earthus-deploy 에 없다 → 로그 REPORT 줄을 세어 실행 수만 얻었다.

**중복 호출**: `kma-aws`·`kma-aws-min`·`gts-global` 이 지상관측을 세 경로로 받는다(목적은 다름: ASOS 45분·분 자료·GTS 전지구). `kma-fcst` 는 kma-aws 산출물의 97지점을 격자로 묶어 쓴다(중복 아님).

## 2. 장애 시 동작 (코드 확인)

- 403 → 대부분 `{"ok":false,"reason":"not-approved"}` 로 **즉시 종료, S3 를 덮어쓰지 않음** → 이전 산출물이 남고 `generated` 가 묵어 화면은 STALE. ✅ 지시서 §4 부합.
- 예외: **kma-fcst** 는 403 을 일반 예외로 삼켜 회차 3개를 모두 시도(셀 ≈90 × 3 = 270 헛호출/실행), **kma-radar** 는 이미지 미달 시 후보 13개를 순회. 이 둘이 용량 초과 상태에서 호출을 더 태운다.
- 상태 분리: 403/timeout/5xx/empty/malformed 가 서로 다른 이유 문자열로 남는 곳은 kma-upper(`POLICY_BLOCKED`/`HTTP_n`/`FAILED_type`) 뿐. 나머지는 403 만 구분하고 그 외는 raise(=Lambda 오류) 또는 continue.
- 화면 금지 문구: 특보 0건 문구는 `warn.state==='OK'` 일 때만 나온다(QA D11 PASS). 용량 초과 → STALE 배지 + "조회 시각" 표기 확인(QA B1 실측).

## 3. GDACS 경로

- **브라우저가 직접** `gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtype=TC` 를 받는다. 실측 **1,971,763 bytes · 18.2초**(서버에서), 브라우저 실측 15~106초.
- 내용: features **424개**(Point·LineString·Polygon), geometry 가 **1.40 MB**, properties 중 `url` 127 KB · `severitydata` 51 KB · `htmldescription` 39 KB · 아이콘 링크 75 KB.
- 브라우저가 실제로 쓰는 것(`ingestTC`): `eventid, episodeid, eventname/name, alertlevel, country, fromdate, todate`, geometry **Point 좌표만**. 사건을 열 때만 `getgeometry?eventid&episodeid` 로 트랙을 따로 받는다. → 필요한 바이트는 **약 20~40 KB**(추정, 축약본 만들며 실측).
- 서버 쪽엔 이미 `aws/archiver` 가 `EVENTS4APP` 엔드포인트를 받아 보관하고(원본 보존), `cyclone-analog` 가 사건 세션을 만든다. **MAP 엔드포인트의 서버 축약본은 없다.**
- 지시서 §7 순서에 맞춘 안: `aws/gdacs-tc` Lambda(15분) → 원본 `events/gdacs-tc-raw/{ts}.json` 보존 + 축약본 `events/gdacs-tc.json`(Point 만, 위 7필드 + `datemodified`·`iscurrent`) → 브라우저는 축약본을 먼저, 실패 시 원본 직접(현 경로) 폴백. 데이터 계약: `ingestTC` 가 읽는 필드명을 그대로 유지(GeoJSON FeatureCollection 형태 유지).

## 4. 배포 함정 3건 — 현재 자동 방지 여부

| CASE | 현재 | 자동 차단 | 부족한 것 |
|---|---|---|---|
| 1 LLM 함수 URL NONE | `tools/deploy-llm.sh` 가 `--auth-type AWS_IAM` 으로 고정 | 부분 — 스크립트는 고쳤으나 **배포 뒤 검증이 없다** | 배포 말미에 `get-function-url-config` 로 AWS_IAM 확인, 아니면 exit 1 |
| 2 `/v2/` 디렉터리 키 | `upload_information_release.mjs` 가 `*/index.html` 을 디렉터리 키에 거울 업로드 + `/v2/` 무효화 | 부분 — 업로드는 하지만 **운영 응답 비교가 없다** | 무효화 뒤 `/v2/` 와 `/v2/index.html` 의 `main.js?v=` 일치 확인, 다르면 exit 1 |
| 3 us-east-2 복사본 | `deploy-python.sh` 가 `AWS_DEFAULT_REGION` 고정 | 부분 — 새 복사본은 안 생기지만 **기존 복사본 검사가 없다**. `deploy-lite.sh` 는 `--auth-type NONE` 을 아직 쓴다(브라우저 직접 호출 함수용 — 별개 용도) | 배포 말미에 us-east-2 에 같은 이름이 있으면 exit 1 |

`tools/qa_v2_master.mjs` A1·A5·C2·C3 이 사후 검사로 잡고 있으나, 지시서 §13 이 요구하는 "배포 스크립트 자체가 실패" 는 아직 없다.

## 5. 최소 변경 계획 (승인 뒤 착수)

1. **kma-fcst**: 403 을 `QUOTA_EXHAUSTED` 로 분리해 **첫 403 에서 전체 실행을 중단**(셀·회차 순회 안 함), timeout/5xx/empty/malformed 를 다른 이유로 기록. 이전 산출물 유지(지금과 같음).
2. **kma-radar**: 403 이면 후보 순회 중단.
3. **호출 회계**: 14개 Lambda 의 `get()` 에 공통 카운터 한 줄 — 실행 끝에 `wind/kma-calls/{날짜}.json` 에 `{lambda, calls, status(ok/quota/timeout/…)}` 를 **append**(S3 put, 서비스별 키). 용량 정책값은 넣지 않는다(확인 불가). 임계치는 "어제 총합 대비 %" 로만 표시.
4. **GDACS 축약본**: §3 안대로. 브라우저는 축약본 → 실패 시 원본 폴백. `test_v2_feed_cards`·`test_v2_intel_time_contract` 에 축약본 입력 케이스 추가.
5. **배포 가드**: deploy-llm.sh / upload_information_release.mjs / deploy-python.sh 말미에 §4 의 사후 검증을 넣어 실패 시 exit 1.
6. 이 밖의 코드는 건드리지 않는다(인텔리전스 기능 변경 없음).

미확인으로 남는 것: KMA 허브 일일 용량 값, 이미지(typ03) 호출이 용량에 포함되는지, kma-lightning 의 실제 규칙(313회/일 = 약 4.6분 간격).
