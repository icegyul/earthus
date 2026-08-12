# ANALYTICS EVENT CATALOG — EARTHUS v2.3

> 상태: **DESIGN ONLY · COLLECTION DISABLED**
> 현재 `cUsage` 동의 UI는 있지만 event emitter/수집 backend는 확인되지 않았다.

## 1. 수집 선행조건

- 이용 행태 동의가 명시적으로 켜져 있음
- catalogVersion·consentVersion·retentionVersion 승인
- delete/export 경로와 철회 후 수집 중단 시험
- 정밀 위치·자유문구·건강/민감 상태 금지
- staging synthetic event로 schema 검증
- PD 승인 전 production endpoint 없음

## 2. 공통 schema

```json
{
  "eventId": "uuid",
  "eventName": "earth_style.opened",
  "eventVersion": 1,
  "occurredAt": "2026-08-12T00:00:00Z",
  "sessionPseudonym": "rotating-id",
  "userPseudonym": null,
  "consentVersion": "...",
  "catalogVersion": "earthus.analytics.v1",
  "surface": "earth",
  "properties": {}
}
```

## 3. v1 후보 event

| event | 허용 properties | 금지 |
|---|---|---|
| `app.opened` | locale, viewport bucket, entry kind | IP 원문, 정밀 위치 |
| `earth_style.opened` | entry kind | 현재 좌표 |
| `layer.selected` | layerId, state, source status class | 원 데이터 값 |
| `evidence.opened` | signalType, evidenceClass | source payload |
| `decision.viewed` | activityProfile, safetyClass, confidenceBand | 건강·개인 자유문구 |
| `activity.profile_selected` | profileId | 사용자 설명 원문 |
| `reservation.impact_viewed` | impactClass, providerResultClass | 예약번호·가격 원문 |
| `aetherus.opened` | entry kind | 사진 다운로드 식별자와 계정 결합 |
| `aetherus.scene_selected` | sceneId | 카메라 정밀 행렬 |
| `error.shown` | reasonCode, surface, recoverable | stack/secret/request payload |
| `offline.entered` | cacheVersion, staleBand | 저장된 장소 |
| `action.proposed` | actionType, confirmationRequired | action payload |

## 4. 금지 필드

```text
latitude, longitude, address, searchText, questionText, healthState,
reservationId, paymentKey, email, phone, accessToken, serviceKey,
rawProviderPayload, preciseCameraState, sensitiveSpeciesCoordinate
```

필요한 분석은 bucket/enum으로 설계하고 원문을 수집하지 않는다.

## 5. 보존 제안

아래 값은 현재 운영 정책이 아니라 승인 대기 제안이다.

- raw consented event: 30일
- pseudonymous aggregate: 최대 13개월
- experiment assignment: 실험 종료+30일
- delete request: active store와 aggregate 재식별 가능 키 제거
- 최소 집계 인원 미만 segment: 보고하지 않음

## 6. 실험 금지 surface

다음은 variant 간 의미가 같아야 하며 A/B 대상이 아니다.

- Safety Gate와 공식 경보
- source/time/unit/freshness/missing
- 가격·할인·결제 confirmation
- 동의·철회·삭제/export
- source rights와 redistribution gate
- accessibility label과 keyboard path

허용 후보는 비안전 UI 순서, 설명 길이, 범례 배치다. 성공 판정은 체류시간 하나가 아니라
판독 성공·UNKNOWN 이해·오탭·성능·비용을 함께 본다.

## 7. 철회 시험

1. 동의 전 network event 0
2. 동의 후 catalog event만 전송
3. 철회 즉시 emitter off와 queue 폐기
4. 다른 기기/세션의 consent version 불일치 시 수집 중단
5. delete/export 결과와 audit receipt 제공
