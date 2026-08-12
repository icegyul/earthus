# ENVIRONMENT MATRIX — EARTHUS v2.3

> 상태: 현재 확인값과 목표 계약을 분리한다. 비밀값은 기록하지 않는다.

## 1. 현재 확인값

| 자원 | local/dev | staging | production | 현재 gap |
|---|---|---|---|---|
| 정적 앱 | `prototype/` 직접 실행 | 별도 자원 확인 안 됨 | S3 `earthus-cache-kr/app/` + CloudFront | staging 없음 |
| Lambda | 로컬 handler/fixture | 별도 계정·함수 확인 안 됨 | 배포 스크립트 기준 `ap-northeast-2` | 실제 함수·VPC·version 전수 미확인 |
| 데이터 버킷 | fixture/로컬 파일 | 별도 버킷 확인 안 됨 | `earthus-cache-kr`, `us-east-2` | Lambda↔bucket cross-region 비용 |
| Supabase | 로컬 SQL | 별도 project 확인 안 됨 | HANDOVER 기준 `ap-northeast-1` | 코드 위치가 `prototype/supabase/` |
| 설정 | `config.local.js` gitignore | 미정 | 같은 파일의 운영값 | 환경별 생성/검증 manifest 없음 |
| 비밀 | 로컬 사용자 보관 | 미정 | AWS env/SSM, Supabase secrets | secretRef inventory 없음 |
| callback | localhost 후보 | 미정 | earthus.net | OAuth/결제 환경 분리 미확인 |
| analytics | 수집 없음 | 수집 없음 | 수집 없음 | consent UI와 event pipeline 분리 |

## 2. 목표 환경 계약

| 항목 | dev | staging | prod |
|---|---|---|---|
| account/project | 개발 전용 | 검증 전용 | 운영 전용 |
| bucket/prefix | fixture 또는 dev prefix | staging bucket/prefix | 운영 bucket/prefix |
| DB | seed/RLS test | 운영 schema rehearsal | 운영 데이터 |
| secretRef | dummy/dev key | staging key | prod key |
| callback/origin | localhost | staging domain | earthus.net |
| writer/reader | 새 schema 가능 | dual-read/shadow | 승인된 authoritative path |
| feature flag | developer only | cohort/canary | PD 승인 cohort |
| data | 고정 fixture 우선 | redacted sample | 실제 provider |
| 외부 action | 금지/mock | sandbox/명시 승인 | 사용자 확인+감사 |

## 3. 판매·외부 실행 기본 flag

```text
SALES_OPEN=false
OPEN_METEO_COMMERCIAL_READY=false
GVP_COMMERCIAL_READY=false
SHOW_SUBSCRIBE=false 또는 승인된 안내 범위만
SNS_AUTO_POST=false (구현하지 않음)
```

flag는 브라우저 표시만 막는 장치가 아니다. checkout/Edge Function과 source policy가
같이 차단해야 한다.

## 4. 서울 리전 공공 API 네트워크 체크리스트

AWS 공식 문서에 따르면 VPC에 연결한 Lambda는 private subnet→NAT/egress→internet 경로가
필요하고 public subnet에 연결하는 것만으로 인터넷이 생기지 않는다.

각 provider를 실제 함수와 같은 account/subnet/security group/NAT에서 확인한다.

1. DNS A/AAAA resolution
2. TCP connect와 TLS chain/SNI/expiry
3. IPv4/IPv6/dual-stack/NAT64 필요성
4. service key encoding과 redacted log
5. HTTP 200 안의 provider error body
6. JSON/XML/charset/gzip/large body/parser
7. 429/Retry-After, 5xx, timeout, exponential backoff
8. daily quota와 concurrent fan-out
9. NAT bytes, request count, latency, 예상 월비용
10. last-good cache와 UI `STALE/UNKNOWN` 표현

근거: <https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html>

현재 P0에서는 운영 Lambda를 새로 배포하거나 호출하지 않았으므로 이 체크는 `PENDING`이다.

## 5. Cutover 순서

```text
fixture → adapter compatibility → dual-read → shadow diff
→ internal canary → 1% → 10% → 50% → 100%
→ rollback window 뒤 구 경로 제거 PR
```

중지 기준:

- Safety/UNKNOWN/region mapping 차이가 1건이라도 설명되지 않음
- action 중복 또는 누락 1건
- parser rejection·provider stale·권리 BLOCKED가 UI에서 성공으로 보임
- 정지 렌더·해제 timer/network가 0이 아님
- p95·NAT/API/storage/LLM 비용 guardrail 초과

## 6. Rollback 증거

- 구 reader/writer와 cache namespace 보존
- feature flag off 명령과 담당자
- schema backward compatibility와 migration reversal
- action idempotency/보상 절차
- rollback rehearsal 시각·RTO·데이터 손실 0 증거
- 운영 파일 hash와 이전 revision

문서 승인만으로 cutover를 승인하지 않는다.
