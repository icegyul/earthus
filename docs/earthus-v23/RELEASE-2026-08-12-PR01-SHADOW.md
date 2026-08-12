# PR-01 Signal Foundation — private canonical shadow 배포 증거

> 배포일: 2026-08-12 KST
> 공개 영향: 없음
> 상태: 수동 shadow 검증 완료 · schedule/authoritative reader 미승인

## 1. 배포 경계

`signal-foundation`을 서울 `ap-northeast-2`에 Python 3.12, x86_64, 1,024MB,
timeout 120초, VPC 미연결로 배포했다. 함수 URL, EventBridge schedule, Lambda invoke
resource policy는 만들지 않았다. 앱 `prototype/`에는 `archive/canonical/v1` 또는
`signal-foundation` 참조가 0건이므로 공개 화면·Safety·Activity·예약 판단은 기존 reader다.

전용 `aws/deploy-signal-foundation.sh`가 허용하는 S3 범위는 다음뿐이다.

- read: `events/kma-warn.json`, `wind/kma-aws-min.json`, `wind/tpw-ea.json`
- read/write: `archive/canonical/v1/*`
- list: `archive/canonical/v1`과 그 하위 prefix 조건만

공용 `deploy-python.sh`의 버킷 전체 권한은 사용하지 않았다. 재배포 시 기존 환경변수를
값 출력 없이 보존하고 `CACHE_BUCKET/CACHE_REGION`만 수렴시킨다.

## 2. 실자료 결과

수동 invoke는 최종 `StatusCode=200`, `FunctionError=null`, `ok=true`였다.

| adapter | source | canonical | rejected | shadow bytes |
|---|---:|---:|---:|---:|
| KMA warning | 39 | 39 | 0 | 63,279 |
| KMA AWS temperature | 736 | 736 | 0 | 1,069,557 |
| NOAA GFS TPW | 3,276 | 3,276 | 0 | 5,015,668 |

총 4,051개 signal을 로컬 `validate_envelope()`로 전수 검사해 오류 0을 확인했다.

- 특보 39건: 공식 polygon/hierarchy가 없으므로 value null,
  `REGION_UNMAPPED`, quality `UNKNOWN`, n=0
- 기온 736건: 실제 값 722, 원 결측 14를 `null/NOT_REPORTED/UNKNOWN`으로 보존
- TPW 3,276건: `MODEL_ANALYSIS`, observedAt null, issued/valid 06 UTC,
  `kg/m²→mm` 1:1 변환과 1° 원격자 metadata 보존

## 3. 격리·정정 계보

세 shadow 객체는 `application/json; charset=utf-8`, `private, no-store`, AES256이다.
S3 직접 URL과 CloudFront `/archive/canonical/v1/*` 모두 익명 HTTP 403을 반환했다.

동일 입력으로 두 번 실행한 결과 각 adapter의 signalId 집합 SHA-256이 실행 전후 동일했다.
revision 집합도 같고 두 번째 batch의 `supersedes` non-null은 0이다. 같은 입력을 새 정정으로
오인하지 않는다. processor version은 `sha256:b2d0ed6fde4bf4651cfb`로 고정됐다.

공개 KMA AWS 원본은 검수 중 원 writer의 다음 주기 갱신으로 hash가 바뀌었다. 이는
signal-foundation이 원본을 수정한 증거가 아니며, 함수 역할은 세 공개 객체에 GetObject만
허용한다. 최종 canonical `input.sha256`과 같은 시점의 공개 원본 hash가 모두 일치했다.

## 4. 성능

성공 실행의 CloudWatch REPORT:

- 첫 성공: 5,919.62ms, max memory 121MB, cold init 482.77ms
- 두 번째 동일 입력: 13,455.21ms, max memory 133MB

1,024MB/120초 한도 내지만 자동 schedule 비용과 주기는 아직 승인하지 않았다. KMA 입력은
수분 단위, TPW는 6시간 모델 주기라 하나의 무근거 주기로 묶지 않는다.

## 5. 실패 증거

첫 invoke는 세 adapter 모두 previous shadow `GetObject`에서 `AccessDenied`가 났다.
첫 객체가 없을 때 S3가 `NoSuchKey`를 반환하려면 ListBucket 판별 권한이 필요했기 때문이다.
공개 원본·정적 앱·기존 reader 변경과 canonical 부분 생성은 없었다.

버킷 전체 목록 권한 대신 `archive/canonical/v1/*` prefix 조건부 `s3:ListBucket`만 추가해
재배포했고 다음 invoke가 전부 성공했다. 권한·리전 오류를 NoSuchKey처럼 삼키지 않는 기존
fail-closed 규칙은 유지했다.

## 6. 남은 관문

- 자동 schedule 주기, retention, 비용 상한, DLQ/CloudWatch alarm 승인
- PR-02 source rights/freshness의 실제 private shadow와 승인 registry
- 기존 reader와 canonical dual-read diff, canary, rollback rehearsal
- PD가 authoritative reader 전환을 별도 승인하기 전 UI/Safety/Activity 사용 금지

## 7. 검증

- Signal Foundation unit/golden/isolation: 12/12
- canonical envelope: 4,051/4,051 valid
- 익명 접근: S3 403, CloudFront 403, 3/3
- PR-11 release gate: sales/TPW/Decision/SNS 잠금 PASS
- shell syntax·diff whitespace PASS

롤백은 schedule이 없으므로 reader 변경 없이 Lambda를 호출하지 않는 것으로 즉시 완화된다.
함수나 private shadow 삭제는 파괴적 작업이므로 별도 승인 없이 수행하지 않는다.
