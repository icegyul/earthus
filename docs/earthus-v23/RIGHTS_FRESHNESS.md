# Rights & Freshness — PR-02 실행 계약

> 기준일: 2026-08-12 KST
> 상태: **로컬 엔진·DRAFT registry·replay 완료 / source 승인·AWS 배포·reader 전환 미승인**

## 1. 목적

자료가 화면에 이미 보인다는 사실은 재배포·유료 내보내기·API 재판매·AI 사용 권리를 만들지
않는다. 반대로 자료가 오래됐다는 사실은 라이선스 만료와 같은 문제가 아니다. PR-02는 아래
세 상태를 분리해 기록한다.

```text
Source Registry ─ 권리·승인·재검토 기한 ┐
Canonical Batch ─ 자료 시각·행 수·거절률 ├→ source-governance private shadow
Evaluator Time ─ 현재 시각              ┘
```

- `policy`: `DRAFT / APPROVED / BLOCKED / EXPIRED`
- `freshness`: `FRESH / AGING / STALE / FUTURE / UNKNOWN`
- `providerHealth`: `HEALTHY / DEGRADED / DOWN`

`UNKNOWN`, `BLOCKED`, `EXPIRED`, `STALE`을 0·안전·정상·허용으로 바꾸지 않는다.

## 2. 구현 위치

- 평가 코드: `aws/source-governance/policy.py`
- private shadow handler: `aws/source-governance/handler.py`
- 승인 전 registry: `aws/source-governance/registry.draft.json`
- registry schema: `schema/source-registry-v1.schema.json`
- 평가 schema: `schema/source-governance-v1.schema.json`
- replay fixture/test: `aws/source-governance/fixtures/`, `test_source_governance.py`

PR-01 canonical batch에도 batch 단위 `sourceId`와 source metadata를 추가했다. 활성 특보가 0건인
경우에도 이용조건·출처·snapshot 시각을 잃지 않기 위해서다. 기존 공개 source와 UI는 바꾸지 않았다.

## 3. 권리 계약

각 source는 다음 사용 범위를 따로 판정한다.

```text
display, cache, history, derivative, redistribution, paidExport, APIResale, AI
```

각 값은 `ALLOW`, `ALLOW_WITH_ATTRIBUTION`, `BLOCK`, `UNKNOWN` 중 하나다. 그러나 개별 값이
`ALLOW`여도 entry가 `DRAFT/BLOCKED/EXPIRED`거나 재검토 기한이 지났으면 실제 operation은
`BLOCK`이다.

번들 registry의 3개 entry는 모두 제안안 `DRAFT`다. 코드 작성은 PD의 source 승인을 대신하지
않는다. `APPROVED`가 되려면 다음 append-only 근거가 모두 필요하다.

```text
actorId, reason, approvedAt, effectiveAt, rollbackVersion, evidenceRefs
```

입력의 `sourceId`, license status, source URL, terms URL, attribution이 승인 registry와 달라지면
`SOURCE_*_DRIFT`로 차단한다. 출처 문자열이 남아 있다는 이유로 조용히 통과시키지 않는다.

## 4. Freshness 계약

자료군마다 같은 10분을 다르게 해석한다.

| source | 기준 시각 우선순위 | FRESH | STALE |
|---|---|---:|---:|
| KMA 공식 특보 | provider snapshot → S3 lastModified | 30분 이하 | 45분 초과 |
| KMA AWS 기온 | observedAt → provider snapshot → S3 lastModified | 5분 이하 | 10분 초과 |
| NOAA GFS TPW | validFrom → issuedAt → provider snapshot → S3 lastModified | 6시간 이하 | 9시간 초과 |

FRESH와 STALE 사이는 `AGING`이다. timezone 없는 시각·시각 없음은 `UNKNOWN`, 허용 skew보다
미래인 시각은 `FUTURE`다. `receivedAt`으로 원 시각을 만들어 메우지 않는다.

- `STALE` display는 권리가 허용될 때만 `STALE_LABEL` 조건으로 last-good를 보여줄 수 있다.
- stale 기반 derivative·redistribution·paid export·API resale·AI는 차단한다.
- 시각이 없거나 미래면 display는 차단하고 cache/history만 `QUARANTINE_ONLY`로 둘 수 있다.
- 상태만 보이고 데이터가 안 보이는 경우에도 `safetyMeaning=NO_INFERENCE`를 유지한다.

## 5. Provider Health 계약

공급자 건강상태는 license나 signal 품질과 분리한다.

- 원 행 수, canonical 행 수, parser 거절 수·비율을 기록한다.
- 특보 0건은 정상일 수 있어 `emptyIsValid=true`다. 0건을 공급자 장애나 안전으로 단정하지 않는다.
- AWS 기온은 최소 100행, TPW는 최소 3,200칸보다 적으면 `DOWN`이다.
- 특보 region 미매핑으로 signal 품질이 `UNKNOWN`이어도 provider parser가 정상이라면
  providerHealth는 `HEALTHY`일 수 있다. 두 문제를 섞지 않는다.
- adapter 하나가 실패해도 나머지 private shadow는 만들되 호출 전체는 `ok=false`다.

## 6. 표준 오류

오류는 `code/category/severity/retryable/sourceId/message.ko/en/details`를 공통으로 쓴다.
주요 코드는 다음과 같다.

```text
SOURCE_POLICY_DRAFT, SOURCE_POLICY_BLOCKED, SOURCE_POLICY_EXPIRED,
SOURCE_REVIEW_DUE, SOURCE_APPROVAL_MISSING,
SOURCE_ID_MISMATCH, SOURCE_LICENSE_DRIFT, SOURCE_TERMS_DRIFT,
SOURCE_URL_DRIFT, SOURCE_ATTRIBUTION_DRIFT,
RIGHT_NOT_GRANTED, RIGHT_UNKNOWN, ATTRIBUTION_MISSING,
SOURCE_TIME_MISSING, SOURCE_TIME_INVALID, SOURCE_TIME_IN_FUTURE,
SOURCE_AGING, SOURCE_STALE,
PROVIDER_TOO_FEW_RECORDS, PROVIDER_REJECTION_RATE
```

## 7. 2026-08-12 검증 증거

- PR-02 자동 replay 20개 통과: DRAFT/APPROVED/BLOCKED/EXPIRED, review due, 승인근거 누락,
  FRESH/AGING/STALE/FUTURE/UNKNOWN, license drift, attribution 조건, 행 수 부족, 거절률,
  빈 특보 정상, registry revision·시각·threshold, TPW 3,276칸 summary,
  private shadow와 부분 실패.
- PR-01 회귀검사 12개도 함께 통과했다.
- 실제 공개 KMA 입력을 PR-01→PR-02로 read-only 연속 검증했다.
  - 특보: 26→26, parser 거절 0, freshness `FRESH`, provider `HEALTHY`
  - AWS: 두 차례 736→736, parser 거절 0, 실시간 결측 13→18은 모두 null,
    freshness `AGING`, provider `HEALTHY`
- 두 source 모두 registry가 `DRAFT`이므로 presentation은 `POLICY_BLOCKED`, display는 `BLOCK`이었다.
  실제 데이터가 정상이라는 이유로 권리 승인을 만들어내지 않았다.

위 행 수·AGING은 실시간 입력의 검증 시점 값이며 고정 상품 수치가 아니다.

## 8. 운영 전환 gate

다음을 모두 통과하고 PD가 승인하기 전에는 Lambda·schedule·Control Plane·reader를 열지 않는다.

1. source별 공식 terms와 8개 operation 권리를 evidenceRefs로 재검토
2. PD 승인 기록의 actor/reason/time/effective/rollback append-only 저장소 확정
3. registry revision 서명·diff·이전 version rollback과 권한 분리
4. Python 3.12 서울 리전에서 canonical GET과 governance PUT 최소 IAM
5. `archive/governance/v1/` Content-Type, `private, no-store`, 익명 GET 403
6. 실제 주기별 FRESH→AGING→STALE replay와 provider 장애 경보
7. 기존 공개 JSON·UI·Safety·Activity·AETHERUS network/표시 불변
8. retention·S3 비용·schedule 주기·경보 채널 승인

공용 `deploy-python.sh`는 registry JSON을 패키징하지 않고 IAM도 넓으므로 이 함수에 사용하지 않는다.
운영 승인 뒤에도 PR-03/05 전까지 governance 결과는 private shadow다.
