# PR-09 Weather-aware Reservation / Reservation Impact — Shadow Contract v1.1

> 구현 상태: 예약 window와 Decision/Safety/provider 근거를 교차하는 순수 계약 완료.
> 공개 상태: UI·알림 발송·provider adapter·예약/취소/결제 실행 없음.

## 1. 목적과 절대 경계

이 slice는 예약의 장소·활동·시간창과 검증된 현재 Decision, 승인된 provider snapshot을
교차해 사용자가 다시 확인할 변화만 제안한다. 직접 실행 capability는 없다.

```text
opaque reservation watch
  + previous/current Decision (Safety/Confidence/signal revisions)
  + previous/current authorized provider evidence
                         ↓
        diff + impact level + correction/dedup key
                         ↓
             PENDING_USER_CONFIRMATION
                         ↓
              REVIEWED / DISMISSED only
```

모든 결과는 `notificationSent=false`, `providerAction=null`, `paymentAction=null`이다.
`REVIEWED`도 실행 승인이 아니며 `executionAuthorized=false`다.

## 2. 예약·근거 정규화

Reservation Watch는 다음을 필수로 둔다.

- opaque `watchId`, `reservationRef`, `sub_...` subject reference
- provider/place/activity profile ID
- timezone이 포함된 UTC start/end와 createdAt

Provider Snapshot은 `authorized=true`만으로 충분하지 않다. HTTPS source/policy URL,
sourceRecordId, observedAt, revision, outcome, `sampleCount >= 1`이 모두 있어야 한다.
`AVAILABLE`인데 count 0, `SOLD_OUT/CLOSED`인데 count가 양수인 모순은 `UNKNOWN`으로 둔다.

Current Decision은 다음을 모두 만족해야 한다.

- `earthus.activity-decision.v1`과 decisionId
- 예약과 같은 place/activity profile
- Decision window가 예약 window 전체를 포함
- 현재 시각보다 미래가 아니며 15분 기본 freshness 이내
- Safety/Confidence와 하나 이상의 signal revision

이전 Decision은 비교 이력이므로 현재 freshness로 폐기하지 않지만, 현재 판단보다 뒤 시각이면
out-of-order로 차단한다. 현재 provider snapshot도 미래·5분 초과·순서 역전이면 `WITHHELD`다.

## 3. 영향 등급

| level | 근거 | shadow 동작 |
|---|---|---|
| INFO | 정상 상태에서 경미한 revision/outcome 변화 | 카드 검토 제안, 전송 없음 |
| WATCH | CAUTION, confidence LOW/VERY_LOW 또는 20점 이상 하락 | 재확인 제안, 대안 후보만 계산 |
| ACTION_REQUIRED | WARNING, LIMITED/SOLD_OUT | 우선 검토·정책 링크·CTA 제안만 |
| BLOCKED | DANGER/CLOSED 또는 provider CLOSED | 신규 실행 차단 의미, 취소/재예약 실행 없음 |
| UNKNOWN | Safety/Confidence/provider 상태 불명 | 영향 없음으로 처리하지 않고 확인 요청 |

Safety는 provider 재고와 Activity 점수보다 먼저 적용한다. 재고가 `AVAILABLE`이어도 공식
WARNING/DANGER/CLOSED는 각각 ACTION_REQUIRED/BLOCKED로 남는다.

## 4. 대안 후보

대안은 자동 예약·자연 순위가 아니라 `REVIEW_CANDIDATE_NOT_VERIFIED_AVAILABILITY`다.

- 최대 5개, 중복 없음, 현재 예약과 동일한 장소/시간창 금지
- timezone 포함 window, 검증된 decisionId, evidenceRefs 필수
- provider availability는 항상 `UNKNOWN`
- price/rank/availableCount 입력 금지; 값 생성 금지
- sponsored=false, 광고·안전 알림 혼합 금지

실제 대안 재고·가격·환불·예약 가능 여부는 별도 승인 provider 응답 없이는 절대 만들지 않는다.

## 5. Dedup·정정·확인

- fingerprint: reservationRef + impact level + current decision/signal revisions + provider revision/outcome
- notificationKey: reservationRef + signal revisions + provider revision + impact level
- 같은 fingerprint는 `DUPLICATE_WITHHELD`, `DUPLICATE_NOT_SENT`
- 대치 revision은 새 fingerprint를 만들고 `correctionOfFingerprint`로 이전 impact와 연결
- acknowledgement는 watch 소유 subject만, impact evaluatedAt 이후에만 가능
- `REVIEWED/DISMISSED` 외 선택 금지; 어느 선택도 provider/payment action을 만들지 않음

실제 알림 단계에서는 channel/signal/region/time opt-in, 즉시 철회, quiet hours·일일 상한,
안전/상업 분리, notificationId/ruleVersion/signal revisions/sentAt/delivery/correction 감사가
추가되어야 한다.

## 6. 자동검증

21개 contract/failure/security 검사가 다음을 보장한다.

- Base/INFO/WATCH/ACTION_REQUIRED/BLOCKED/UNKNOWN
- place/profile/window mismatch와 timezone 결측
- provider 승인/source/policy/record/revision/n 및 outcome/count 모순
- 미래·지연·out-of-order Decision/provider
- 과거 Decision 비교 이력과 UNKNOWN confidence null 보존
- 대안의 재고·가격·순위 생성 금지
- notification key revision 변화, fingerprint dedup, correction 연결
- subject ownership/ack 시각과 실행 권한 0
- fetch/WebSocket/XHR/navigator/timer/render/provider/payment 실행 capability 0

이 모듈은 순수 ES module이고 public entry/UI가 import하지 않는다.

## 7. 공개·실행 전 gate

1. provider별 availability/change/cancel/refund/price/cache/history/notification 서면 계약
2. 인증 adapter와 source/time/revision/n, retry/backoff, outage/correction replay
3. Decision source rights/freshness와 공식 closure/Safety coverage
4. consent/delete/retention, RLS tenant A/B, notification delivery idempotency
5. provider sandbox와 최신 policy/price/availability 재확인
6. confirmation capability token, step-up auth, idempotency key, provider receipt 검증
7. 실제 UI/a11y/offline, canary/rollback rehearsal, PD 승인

이 gate 전에는 `MONITORING→제안`까지만 허용한다. `USER_CONFIRMED→EXECUTING→VERIFIED`는
구현하지 않는다.

## 8. Rollback

public consumer가 없으므로 module rollback은 직전 S3 object version을 같은 Content-Type과
`no-cache`로 복원하고 `/js/reservation-impact.js`만 무효화한다. 객체를 삭제하지 않는다.
