# AWS PRODUCTION INVENTORY — EARTHUS v2.3

> 실측 시각: 2026-08-12 22:34~22:36 KST
>
> 범위: AWS `ap-northeast-2` Lambda/EventBridge와 `us-east-2` 자료 객체
>
> 원칙: 비밀값·역할 ARN·Function URL 원문·로그 본문은 수집하거나 기록하지 않는다.

## 1. 결론

- 로컬 실행 단위는 **68개**다. Python `handler.py` 66개와 Node `index.mjs` 2개다.
- 서울 리전에는 **67개**가 배포돼 있다. 로컬 전용은 `news-brief` 하나이고 운영에만 있는
  함수는 없다. `news-brief`는 AI key·자료 근거·권리·비용·출력 검수 전에는 배포하지 않는다.
- 67개 모두 `Active`이며 마지막 코드/설정 갱신 상태는 `Successful`이다.
- Lambda resource policy가 가리키는 EventBridge 규칙은 **57개**이고, 직접 `DescribeRule`로
  57개 모두 `ENABLED`임을 확인했다.
- `aws/schedules.sh`에는 있었지만 운영 규칙이 없던 `cwa-observations`와
  `ascat-observations` 규칙을 복구했다. 규칙 생성·target 등록·Lambda invoke permission은
  성공했다.
- 이것만으로 “운영이 모두 정상”이라고 판정하지 않는다. 현재 감사 자격에는 rule target
  조회, CloudWatch 지표·경보, log retention, event source mapping, concurrency, IAM role policy
  읽기 권한이 없다.

## 2. Lambda 실제 구성

| 항목 | 실측값 | 판정 |
|---|---:|---|
| 로컬 실행 단위 | 68 | Python 66 + Node 2 |
| 서울 배포 함수 | 67 | `news-brief`만 local-only |
| runtime | Python 3.12 65, Node 20 1, Node 22 1 | 현재 구성값 |
| architecture | x86_64 67 | arm64 없음 |
| 상태 | Active/Successful 67 | 구성 조회 시점 정상 |
| VPC 연결 | 0 | 공공 API egress는 Lambda 기본 네트워크 경로 |
| DLQ 설정 | 0 | 실패 격리 공백 |
| X-Ray Active | 0 | trace 공백 |
| log group 이름 설정 | 67 | 실제 log group 존재·보존기간과는 다른 값 |
| Function URL | 3 | 아래 공개 surface 별도 검토 |
| layer | 0 | 모두 Zip package |
| ephemeral storage | 기본 512MB 66, `gk2a-clouds` 2,048MB 1 | 현재 구성값 |

timeout은 30~900초, memory는 256~2,048MB에 분포한다. 전체 분포와 함수별 비밀이 아닌
구성은 아래 읽기 전용 명령으로 다시 만들 수 있다.

```bash
python3 tools/audit_aws_runtime.py > /tmp/earthus-aws-runtime.json
jq '.summary, .permissionProbes, .unknown' /tmp/earthus-aws-runtime.json
```

감사 도구는 environment의 **이름만** 기록하고 값은 출력하지 않는다.

## 3. 공개 Function URL

| 함수 | AuthType | CORS method/origin | 현재 의미 |
|---|---|---|---|
| `celestrak-proxy` | `NONE` | GET / `*` | 공개 읽기 proxy |
| `flight-track` | `NONE` | GET / `*` | 공개 읽기 endpoint |
| `spot-air` | `NONE` | GET / `*` | 공개 읽기 endpoint |

세 URL은 공개 surface다. URL 문자열·계정 ARN은 본 문서와 감사 산출물에 기록하지 않았다.
향후 PR-11에서 origin abuse, quota, response header, cache, 입력 상한과 비용을 별도로 시험한다.

## 4. EventBridge와 발견된 누락

resource policy에서 확인한 결과는 다음과 같다.

- EventBridge를 참조하는 함수: 56개
- Lambda policy의 rule reference: 57개
- unique rule: 57개
- `DescribeRule` 결과: `ENABLED` 57개

한 함수가 둘 이상의 rule을 가질 수 있으므로 함수 수와 규칙 수는 같지 않다. 또한 현재
권한으로 `ListRules`와 `ListTargetsByRule`을 호출할 수 없어, Lambda policy가 참조하지 않는
orphan rule과 target 상세·전달 실패를 전수 확인했다는 뜻은 아니다.

### 4-1. 복구한 두 규칙

| 함수 | 운영 규칙 | 주기 | 복구 직후 결과 |
|---|---|---|---|
| `cwa-observations` | `cwa-observations-schedule` | 10분 | 876개 지상 관측, 부이 0, failure 0 |
| `ascat-observations` | `ascat-observations-schedule` | 4시간 | 최신 파일 4개 확인, 활성 태풍 주변 usable cell 0 |

두 rule은 모두 `ENABLED`이고 각 Lambda policy에 정확한 rule source ARN의 invoke permission이
있다. `PutTargets` 응답의 `FailedEntryCount=0`도 확인했다.

CWA S3 원본은 첫 수동 실행 뒤 `2026-08-12T13:30:12Z`로 갱신됐다. 검수 시 CloudFront에는
이전 `2026-08-10T12:54:24Z` 객체가 max-age 600으로 남아 있어 무효화
`I2XAPU5EVYGCKZ05ELX56CQ6W4`를 요청했다. `GetInvalidation` 권한은 없었지만 고유 query로
CloudFront에서 새 시각·S3와 같은 ETag를 확인했다. 이후 heartbeat 검증 실행에서는 CWA가
`2026-08-12T13:45:37Z`, 876개·failure 0으로 다시 갱신됐고, 새 10분 규칙이 이어서
`2026-08-12T13:50:02Z` heartbeat를 남겨 자동 전달도 확인했다.

ASCAT 실행은 Lambda 자체 오류 없이 끝났지만 결과가
`no-cells-near-live-cyclones`였다. 따라서 last-good인
`wind/ascat-observations.json`은 `2026-08-10T13:30:33Z` 그대로다. 이를 새 관측 성공이나
0 m/s로 해석하지 않는다. 위성 궤도 coverage가 없었다는 결측이다.

## 5. 네트워크 실측 범위

67개 함수 모두 VPC에 연결되지 않았다. 따라서 현재 운영 공공 API 호출은 private subnet/NAT
경로가 아니라 Lambda 기본 인터넷 경로를 쓴다. 이 사실은 “provider 응답 정상”을 뜻하지
않는다.

이번 slice에서 직접 호출해 확인한 것은 다음뿐이다.

- CWA Open Data: 인증 parameter를 사용한 지상 관측 876개, failure 0, 부이 0
- NOAA CoastWatch ASCAT: 후보 파일 4개 접근, 활성 태풍 주변 usable cell 0
- 앞선 PR-00A/01/02 증거: NOAA GFS TPW, KMA 특보·AWS source

JMA·Open-Meteo를 포함한 나머지 provider의 DNS/TLS/429/5xx/timeout/quota/비용 전수 검증은
완료로 표시하지 않는다.

## 6. 권한 때문에 남은 UNKNOWN

다음 읽기 호출은 `AccessDenied`였다.

- EventBridge `ListRules`, `ListTargetsByRule`
- CloudWatch Logs `DescribeLogGroups`
- CloudWatch `DescribeAlarms`, `GetMetricStatistics`
- Lambda `ListEventSourceMappings`, `GetFunctionConcurrency`
- IAM role policy read/list

따라서 다음은 아직 `UNKNOWN`이다.

- 모든 rule의 target 존재·전달 성공률과 orphan rule
- 함수별 최근 성공/실패/timeout/throttle, p50/p95 duration
- log group 실제 존재·retention·민감값 redaction
- reserved/provisioned concurrency와 event source mapping
- role별 최소권한, DLQ/alarms, 월 Lambda/NAT/S3/CloudWatch 비용

다음 운영 감사 권한은 위 **읽기 action만** 별도 역할로 허용하고, 쓰기·로그 본문·secret
읽기는 넣지 않는다. 권한이 생기기 전에는 추정 숫자로 채우지 않는다.

## 7. 중지선과 다음 조치

1. CWA/ASCAT collector가 매 실행 상태를 last-good 자료와 분리한 heartbeat에 남기도록
   구현·배포했다.
2. `health`가 heartbeat의 실패·부분실패·실행 지연과 ASCAT 비통과를 구분하도록
   구현·배포했다.
3. 최소 read-only audit 권한으로 target, metric, alarm, retention을 전수 대조한다.
4. DLQ/경보/비용 상한은 PD 승인 후 별도 변경으로 적용한다.
5. `news-brief`, PR-01/02 schedule, TPW 공개 flag, 판매, SNS 자동 게시를 이 조사로 열지 않는다.

### 7-1. heartbeat 운영 증거

| 객체 | 실행 상태 | 표본/결측 | 검증 |
|---|---|---|---|
| `wind/status/cwa-observations.json` | `SUCCEEDED` | 876개, failure 0 | public `no-cache`, AES256 |
| `wind/status/ascat-observations.json` | `NO_COVERAGE` | 활성 태풍 1, 파일 4, cell 0, failure 0 | public `no-cache`, AES256 |
| `wind/health.json` | `ok` | 42/42 제때 실행 | 두 collector state/reason 보존 |

`NO_COVERAGE`는 성공 자료나 안전 판정이 아니다. 최신 위성 궤도 4개에서 활성 태풍 반경의
사용 가능한 셀이 없었다는 결측 사유다. last-good 자료는 덮어쓰지 않았다. 배포한 세 Lambda
source SHA-256은 로컬과 운영 zip 내부가 3/3 일치했고 모두 Active/Successful이다.

## 8. 완료 기준 판정

| 기준 | 결과 |
|---|---|
| 로컬↔운영 함수 목록 대조 | 통과 |
| runtime/region/VPC/timeout/memory 전수 | 통과 |
| Lambda policy가 참조한 rule 존재·enabled | 통과 |
| CWA/ASCAT 누락 rule 복구 | 통과 |
| collector heartbeat·health 구분·운영 source hash | 통과 |
| target 전수·최근 성공·metrics·alarm·retention | 권한 부족 `UNKNOWN` |
| provider 전수 응답·quota·비용 | 미완료 |
| PR-00 AWS inventory 전체 승인 | **부분 완료** |
