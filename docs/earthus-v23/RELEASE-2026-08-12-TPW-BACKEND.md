# TPW 수증기 통로 — 잠긴 운영 백엔드 배포 증거

> 배포일: 2026-08-12 KST
> 공개 상태: `TPW_READY=false` 유지
> 제품 범위: NOAA GFS TPW 수집 Lambda·S3 객체·시간당 schedule·임시 실화면 QA

## 1. 결과

서울 `ap-northeast-2`에 `tpw-grid`를 Python 3.12 x86_64, 1,024MB,
timeout 420초, VPC 미연결로 생성했다. 함수는 NOAA/NCEP NOMADS에서 GFS 0.25°
f000의 `pwat` 전체대기층 메시지를 받고 정확히 겹치는 1° 원격자만 추출한다.
보간·평균·결측 채움과 대체 provider fallback은 없다.

EventBridge `tpw-grid-schedule`은 `rate(1 hour)`·`ENABLED`이며 `put-targets` 실패 0,
Lambda resource policy의 `events.amazonaws.com` 호출 권한과 동일 rule ARN을 확인했다.
배포 IAM에는 `ListTargetsByRule` 권한이 없어 target 재조회는 못 했으며, 이를 성공으로
추정하지 않고 `put-targets` 결과와 함수 resource policy를 각각 증거로 남겼다.

## 2. 최소권한과 배포 도구 보강

`aws/deploy-grib-python.sh`의 기존 역할 정책은 버킷 전체 `GetObject/PutObject`였고,
함수 갱신 시 `--environment`로 기존 설정을 통째로 덮을 수 있었다.

- inline policy를 `s3:PutObject` + `arn:aws:s3:::earthus-cache-kr/wind/tpw-ea.json` 한 객체로 축소
- 신규·기존 역할 모두 매 배포 때 최소 경계로 수렴
- 갱신 시 기존 환경변수를 값 출력 없이 읽고 `CACHE_BUCKET/CACHE_REGION`만 합쳐 보존
- 패키지: ecCodes 2.42.0, numpy 2.3.2 등 CPython 3.12 manylinux x86_64 wheel
- 압축 25MB, 해제 104MB

## 3. 실자료

수동 Lambda 실행은 `StatusCode=200`, `FunctionError=null`이었다.

| 항목 | 운영값 |
|---|---|
| schema | `earthus.tpw-grid.v1` |
| signal/data kind | `TOTAL_COLUMN_WATER_VAPOUR` / `MODEL_ANALYSIS` |
| source | NOAA/NCEP GFS via NOMADS |
| run/valid | `2026-08-12T06:00:00Z` / 동일 f000 |
| GRIB | 101,981 bytes, native 50,901 points, `pwat`, `kg m**-2` |
| 출력 | 91×36, 3,276/3,276, failed 0, null 0 |
| 범위 | 20~55°N, 90~180°E, 정확한 1° 원격자 |
| 값 범위 | 4.7~77.4mm |
| JSON | 18,296 bytes |
| S3 | `wind/tpw-ea.json`, AES256, `application/json; charset=utf-8` |
| cache | `public, max-age=1800` |

S3 다운로드와 `https://earthus.net/wind/tpw-ea.json` CloudFront 응답의 SHA-256은
`27b807bcd0f069c94309b6c7182714a89ce93244c65e4c43ff60cf1b0fec3a69`로 같았다.
CloudFront는 서울 `ICN53-P1`, HTTP 200, 올바른 MIME/cache/source time/count를 반환했다.

## 4. 권리와 의미

NOAA/NWS 공식 disclaimer는 별도 표시가 없는 NWS 정보를 public domain으로 두고 lawful
purpose에 무상 사용하도록 하며, 자사 자료인 것처럼 주장하거나 NOAA/NWS의 보증·제휴처럼
표현하거나 변경본을 공식 정부 자료처럼 표시하는 일을 금지한다. 운영 문서는 NOAA/NCEP GFS
출처와 시각을 보존하고 EARTHUS의 1° subsampling임을 명시한다. NCEP GFS inventory도
`gfs.tCCz.pgrb2.0p25.fFFF`, f000 분석장을 확인했다.

이 확인은 직접 화면 표시 범위의 근거다. source governance registry의 paid export,
API resale, AI 등 별도 operation 승인을 대신하지 않는다.

## 5. 실제 화면 QA

운영 파일을 읽되 로컬 응답에서만 메모리상 `TPW_READY=true`를 주입했다. 운영 config와
CloudFront 정적 파일은 수정하지 않았다.

- 1280×720: MODEL ANALYSIS, NOAA/NCEP·NOMADS, 06 UTC, 1°, n=3,276 표시
- 390×844: 문서 scrollWidth/clientWidth 390/390, 가로 overflow 0
- 등치선 10~70mm, 115 paths, 14 labels
- 서울 33.5mm, 부산 41.2mm 등 최근접 실제 원격자값
- “위성 영상이나 강수량이 아님”, 범위 밖은 건조가 아니라 coverage 밖이라는 고지
- 높은 TPW를 비·호우·태풍·Safety로 승격하지 않음
- 브라우저 화면의 오류 표시 0

## 6. 유지한 잠금과 남은 관문

- `TPW_READY=false`, `SALES_OPEN=false`, Decision UI off, SNS 자동 게시 금지 유지
- query 없는 첫 화면은 아름다운 Earth이고 TPW는 준비 중으로 잠김
- 공개 flag 전환은 별도 PD 승인과 flag 배포·CloudFront 무효화·운영 재검증 필요
- Lambda DLQ, X-Ray active tracing, CloudWatch alarm은 계정 공통 운영 관측 작업에 포함해 별도 진행
- source governance의 재배포·유료 export·API resale·AI 권리는 계속 DRAFT/UNKNOWN

## 7. 검증과 롤백

- `python3 -m unittest discover -s aws/tpw-grid -p 'test_*.py' -v`: 2/2
- `bash -n aws/deploy-grib-python.sh`, `git diff --check`: PASS
- `node tools/test_pr11_release_gate.mjs`: PASS

즉시 중지할 때는 `tpw-grid-schedule`을 disable하고 `TPW_READY=false`를 유지한다.
오류 산출물은 새로 publish하지 않으며 마지막 객체의 source/run/valid 시각을 고정해 stale로
취급한다. 함수 삭제나 객체 삭제는 별도 파괴적 작업 승인 없이는 하지 않는다.
