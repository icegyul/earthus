# DECISION CORE — EARTHUS v2.3 PR-07

> 상태: Base Activity/Forecast Confidence 순수 엔진과 합성 replay 구현 완료.
> 공개 상태: `CALIBRATION_SHADOW`, `DECISION_CORE_READY=false`, 추천 UI·live provider 미연결.

## 1. 이번 결과

PR-07은 장소·시간·활동에 공통인 Base Activity Score와 Forecast Confidence를 재현 가능한
결정 계약으로 만들었다. 개인 선호, 예약 재고, 행사 취소, 시설 폐쇄는 점수에 넣지 않는다.
Safety Hard Gate가 점수보다 먼저 적용되며, 근거가 없으면 `SAFE/AVAILABLE`을 만들지 않는다.

구현 모듈은 브라우저 timer, network, 위치 추적, Cesium render를 만들지 않는 순수 함수다.
현재 운영 앱은 이 모듈을 import하지 않으므로 예쁜 첫 Earth와 기존 레이어 동작은 변하지 않는다.

## 2. Scope / non-scope

### 포함

- 6차원 Forecast Confidence와 `HIGH/MEDIUM/LOW/VERY_LOW/UNKNOWN`
- 야구 관람·캠핑·야외 풋살·등산·별보기 5개 Base Activity Profile
- factor별 raw value/unit/normalization/weight/points/signal id/reason/basis ledger
- Safety→Base→Confidence 순서와 5축 결과 계약
- revision 기반 public shared Base cache key와 deterministic decision id
- 결측·중복·단위 오류·범위 오류·timezone 없음 fail-closed
- 5개 합성 golden fixture, replay, 10,000회 benchmark

### 제외

- 사용자 선호와 bounded personal delta(PR-08)
- 공개 5축 UI, 비교 화면, 설명 카드(PR-08)
- 예약 재고·취소·변경·대안·알림(PR-09)
- live weather/AQ/행사/시설/예약 provider adapter
- 한국 밖 현지 공식 Safety provider
- profile 임계·가중치 도메인 승인과 공개 추천 전환

## 3. Forecast Confidence는 확률이 아니다

`Forecast Confidence`는 예보가 맞을 확률이 아니라, 이 판단에 들어온 자료의 품질 표시다.
모든 결과의 `calibratedProbability`는 `null`이다.

| 차원 | weight | 결측 처리 |
|---|---:|---|
| Freshness | 0.20 | UNKNOWN |
| Availability | 0.20 | UNKNOWN |
| Model agreement | 0.20 | 단일 source면 반드시 UNKNOWN |
| Spatial support | 0.15 | UNKNOWN |
| Temporal horizon | 0.15 | UNKNOWN |
| Provider health | 0.10 | UNKNOWN |

한 차원이라도 근거가 없으면 알려진 차원만 재가중하지 않고 전체 confidence를 `UNKNOWN`으로
둔다. 두 개 이상 독립 model source가 없으면 agreement 점수가 입력돼도 사용하지 않는다.

```json
{
  "schemaVersion": "earthus.forecast-confidence.v1",
  "engineVersion": "earthus.forecast-confidence.v1.0.0",
  "confidenceLevel": "UNKNOWN",
  "score": null,
  "calibratedProbability": null,
  "dimensions": [],
  "reasonCodes": ["MODEL_AGREEMENT_SINGLE_SOURCE"],
  "modelSourceIds": ["source-a"],
  "inputSignalIds": ["source-a:r1"]
}
```

## 4. Base Activity Profile 5개

모든 factor weight 합은 프로필별 1이다. factor 곡선은 `활동 적합도 제품 보정안`이며
안전 임계값이 아니다. 곡선의 원값·단위·구간·weight·aggregation·basis는
`activity-profile-policy.js` 한 파일에서 version 관리한다.

| profile | factor(weight) | 별도 필수 Hard Gate |
|---|---|---|
| 야구 관람 | 시간 강수 0.30, 강수확률 0.15, 체감온도 0.25, 풍속 0.15, 습도 0.15 | 낙뢰, 공식 취소, 태풍/호우 특보 |
| 캠핑 | 누적 강수 0.30, 돌풍 0.20, 체감온도 0.20, 적설 0.15, 습도 0.15 | 태풍, 산불 통제, 캠핑장 폐쇄 |
| 야외 풋살 | 시간 강수 0.25, 강수확률 0.15, 체감온도 0.25, 대기질 0.20, 풍속 0.15 | 낙뢰, 시설 폐쇄, 극한 폭염 |
| 등산 | 누적 강수 0.20, 적설 0.15, 돌풍 0.20, 하산 여유 0.25, 대기질 0.20 | 탐방로 폐쇄, 산불 통제, 낙뢰, 하산 여유 부족 |
| 별보기 | 운량 0.30, 가시거리 0.20, 습도 0.15, 강수확률 0.10, 달 밝기 0.10, 일몰 후 경과 0.15 | 시설/도로 폐쇄, 폭풍, 낙뢰 |

도메인 검토가 끝나지 않았으므로 policy는 다음 상태를 고정한다.

- `releaseMode=CALIBRATION_SHADOW`
- `approvalStatus=IMPLEMENTATION_APPROVED_DOMAIN_REVIEW_PENDING`
- `effectiveAt=null`
- `objectiveBonuses=[]`
- `DECISION_CORE_READY=false`

즉 합성 fixture에서 점수가 높아도 추천은 `WITHHELD/PROFILE_CALIBRATION_SHADOW`다.

## 5. Base와 Personalization의 물리적 분리

Base engine 입력에 `userId`, preference, personalization, personalizedScore,
personalAdjustment, boundedDelta가 어느 깊이든 들어오면 예외로 거절한다. Base cache는
`PUBLIC_SHARED_BASE`, `userSpecific=false`다. PR-08은 Base 결과를 변경하지 않고 별도 private
delta와 설명을 서빙 시점에 계산해야 한다.

```text
공식 Safety/폐쇄 근거 ───────────┐
관측·모델 signal → Base Activity ├→ 5축 Decision → 공개 제한 정책
6차원 품질 근거 → Confidence ────┤
Crowd/Availability 공식 응답 ────┘

사용자 선호 → PR-08 private delta (Base cache 밖)
```

## 6. 5축 결과와 금지된 추론

| axis | 알려짐 조건 | 없을 때 |
|---|---|---|
| Activity Fit | 모든 필수 factor의 id/revision/value/unit이 유효 | UNKNOWN, score=null |
| Safety | 적용 지역 공식 provider와 최신 근거 | UNKNOWN, 긍정 추천 차단 |
| Forecast Confidence | 6개 차원과 2개 이상 model source | UNKNOWN |
| Crowd | provider source/observedAt/revision/value | UNKNOWN |
| Availability | provider source/observedAt/revision/value | UNKNOWN |

Crowd와 Availability는 단순 입력 문자열을 믿지 않는다. source, timezone이 붙은 observedAt,
revision, value가 모두 있어야 `OBSERVED`로 보존한다. 이벤트 취소·시설 폐쇄·예약 가능 여부는
별도 공식 provider 응답 없이는 절대 생성하지 않는다.

Safety가 막으면 Base score는 유지하되 `scoreVisibility=DEEMPHASIZED`,
`positiveRecommendationAllowed=false`다. Safety가 KMA 적용 범위 밖이면 이를 안전으로
간주하지 않고 `LOCAL_SAFETY_PROVIDER_MISSING`으로 보류한다.

## 7. Contribution ledger와 결측

각 factor는 다음을 보존한다.

```json
{
  "factor": "WIND_SPEED",
  "rawValue": 3,
  "unit": "m/s",
  "aggregation": "MAX_IN_WINDOW",
  "normalized": 0.96,
  "weight": 0.15,
  "points": 14.4,
  "signalIds": ["gs06-wind"],
  "reasonCode": "FIT_CURVE:BASEBALL_SPECTATOR:WIND_SPEED",
  "basis": "EARTHUS_v2.3_section_13_15_product_calibration"
}
```

- 필수 factor 결측은 0점이 아니라 전체 Base `UNKNOWN`이다.
- 같은 factor 두 개는 최신값을 추측 선택하지 않고 `DUPLICATE_FACTOR`다.
- unit mismatch는 자동 환산하지 않고 `UNIT_MISMATCH`다.
- 계약 range 밖 값은 곡선 끝점으로 clamp하지 않고 `FACTOR_OUT_OF_RANGE`다.
- timezone 없는 시각은 로컬 시각으로 추측하지 않는다.

## 8. Cache와 deterministic replay

cache key는 delimiter 충돌을 피하는 canonical JSON이며 다음을 포함한다.

- placeId와 timezone 포함 UTC time window
- activity profile id/version
- Safety rule set version
- Forecast Confidence engine version
- 정렬·중복 제거한 factor/Safety/Confidence/Crowd/Availability signal revision

입력 순서만 바꾸면 같은 key/id이고 하나의 revision이라도 바뀌면 key/id가 달라진다.
`evaluatedAt`은 재현 입력이므로 자동으로 현재 시각을 넣지 않는다.

## 9. Golden fixture와 검증

`tools/fixtures/activity-decision-v1.json`의 GS-06~10은 모두 합성 자료다. 관측·예보·특보·
폐쇄·재고로 화면에 표시하면 안 된다는 warning을 fixture 자체에 넣었다.

- policy/curve/5 profile/weight 검사
- confidence 6차원·band·단일 source·결측 검사
- hand-made HIGH와 `calibratedProbability` 주입 차단
- GS-06~10 점수와 contribution ledger replay
- Safety 100점 override, Safety 없음, KMA 범위 밖
- factor 결측·중복·unit/range·timezone 오류
- 개인화 deep-field 거절
- Crowd/Availability 근거 계약과 revision cache invalidation
- 10,000회 replay 2초 이내, 동일 decision id
- fetch/timer/requestAnimationFrame 없음

총 자동검사 수는 31개다.

## 10. Source/rights/network/cost/privacy

PR-07은 live provider를 호출하지 않는다. 따라서 신규 AWS, 공공 API, Open-Meteo 호출,
S3 객체, schedule, credential, 사용자 위치 저장, 개인정보, 외부 비용이 없다. 기존
`OPEN_METEO_COMMERCIAL_READY=false`를 우회하지 않는다. 라이브 adapter는 PR-08 전 별도 source
rights·freshness·provider health 승인과 서울 리전 네트워크 검증을 통과해야 한다.

## 11. Release gate / rollback

다음이 모두 끝나기 전에는 `DECISION_CORE_READY=true` 또는 공개 추천 UI를 금지한다.

1. 프로필 곡선·weight·하산 여유의 도메인 검토와 approval/effectiveAt/rollbackVersion 확정
2. 활동별 공식 Safety/운영/취소 provider와 한국 밖 coverage 확보
3. live weather/AQ source의 권리·재배포·리전·freshness 승인
4. PR-08 private personalization 분리와 5축 UI의 실제 화면·접근성 검수
5. stale/down/partial/multiple-model replay와 canary/rollback rehearsal

정적 rollback은 세 순수 JS 모듈을 직전 S3 revision으로 되돌리고 해당 CloudFront path를
무효화한다. 현재 앱 entry가 import하지 않으므로 rollback 중에도 공개 Earth 화면은 변하지 않는다.
