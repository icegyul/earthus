# ANALYTICS EVENT CATALOG — EARTHUS v2.3

> 상태: **IMPLEMENTED · CONSENT-GATED** (2026-08-14)
> 동의하지 않은 방문자와 비로그인 방문자는 network event가 0이다. 운영 DB migration,
> FORCE RLS·익명 거절·rollback 주체 A/B를 먼저 통과했고 그 뒤 정적 앱을 공개한다.
> 방침은 2026-08-14 공고·2026-08-21 시행이며, 시행 전에는 브라우저와 DB가 수집을 막는다.

## 1. 수집 선행조건

- 이용 행태 동의가 명시적으로 켜져 있음
- catalogVersion·consentVersion·retentionVersion 고정
- delete/export 경로와 철회 후 수집 중단 시험
- 정밀 위치·자유문구·건강/민감 상태 금지
- 브라우저 allowlist와 DB trigger가 동일 event/property/value 형식만 허용
- production DB migration·RLS 적용 후에만 emitter가 동작

## 2. 공통 schema

```json
{
  "eventId": "uuid",
  "eventName": "earth_style.opened",
  "eventVersion": 1,
  "occurredAt": "2026-08-12T00:00:00Z",
  "sessionPseudonym": "rotating-id",
  "userId": "authenticated auth.uid()",
  "consentVersion": "...",
  "catalogVersion": "earthus.analytics.v1",
  "surface": "earth",
  "properties": {}
}
```

## 3. v1 운영 event

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

## 5. 보존·철회

- 원 event: 365일. DB가 `expires_at`을 강제하고 매일 KST 00:37 물리 삭제한다.
- 철회: 최신 서버 동의가 `usage_agreed=false`임을 RPC가 확인하고 본인 event를 즉시 삭제한다.
- 내보내기: 계정 화면의 기존 `내 데이터 내려받기` JSON에 본인 event를 포함한다.
- 동의 전·로그아웃·동의 버전 불일치: emitter OFF, 메모리 queue 즉시 폐기.
- 좌표·자유문구·연락처·토큰·provider 원문: 브라우저와 DB에서 모두 거절.
- pseudonymous aggregate와 실험 assignment 저장소는 만들지 않았다.

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
5. 본인 event delete/export 결과 확인

## 8. 구현 정본

- 브라우저 계약: `prototype/js/analytics-contract.js`
- consent gate·emitter: `prototype/js/analytics.js`
- 동의 저장·철회·내보내기: `prototype/js/auth.js`, `prototype/js/ui-account.js`
- DB/RLS/trigger/retention: `prototype/supabase/migrations/20260814193000_earthus_usage_analytics.sql`
- 값 수준 방어·방침 전환: `20260814194500_earthus_usage_analytics_value_guard.sql`,
  `20260814200000_earthus_privacy_version_20260814.sql`,
  `20260814201500_earthus_privacy_effective_20260821.sql`
- 정적 계약 시험: `tools/test_usage_analytics.mjs`

운영 프로젝트의 auth 사용자가 현재 1명이어서 두 번째 OAuth 사용자 UI A/B는 외부 계정
게이트다. 대신 기존 사용자 A와 DB session 전용 별도 JWT 주체 B로 허용 insert·교차 select/
insert 차단·금지 필드·철회 삭제를 한 transaction 안에서 검증하고 rollback해 운영 행은
변경하지 않았다. 실제 OAuth 2계정 UI A/B 전에는 분석 결과를 제품 의사결정 근거로 사용하지 않는다.
