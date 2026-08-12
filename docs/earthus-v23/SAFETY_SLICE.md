# SAFETY SLICE — EARTHUS v2.3 PR-05

> 상태: 공식 기상특보 수집기 + 공개 UI vertical slice 구현·자동/실자료/실화면 검증 완료.
> 정본 원칙: 공식 특보는 점수보다 먼저 적용하고, `0/결측/지연/미매핑`은 SAFE가 아니다.

## 1. 사용자 결과

- 한국 기상특보 화면 맨 앞에 Safety Engine 결과가 보인다.
- 같은 공식 `regionId`의 발효 특보가 확인되면 `WARNING/DANGER`와 `추천 제한`을 표시한다.
- 이후 PR-07 Activity Score가 붙어도 `blocksPositiveRecommendation=true`가 먼저 적용된다.
- 특보 0건, 위치 없음, 60km 내 구역표 지점 없음, 45분 초과 지연, 시각 오류는 모두
  `UNKNOWN`이며 “특보 없음” 또는 “안전”으로 표현하지 않는다.
- 출처, 기준시각, 전국 발효 건수 `n`, 매핑 방식과 한계, 기상청 공식 확인 CTA를 함께 표시한다.
- 안전 정보와 공식 CTA는 로그인·결제 없이 계속 무료다.

## 2. Scope / non-scope

### 포함

- 기존 `events/kma-warn.json` 공식 수집기의 발표/대치/해제 command 분류
- 최근접 공식 관측지점→특보구역 코드 근사 매핑
- 같은 source `regionId` exact match만 사용하는 Hard Gate
- fresh 30분, aging 30~45분, stale 45분 초과 계약
- 발표→대치→해제, 중복, 역순, 미래 발효 replay
- 공식 행동요령과 기상청 특보 CTA

### 제외

- 공식 특보구역 polygon과 행정구역 hierarchy reader
- 장소 운영기관의 폐쇄 여부
- 활동별 Base Score/개인화/예약 영향
- 한국 밖 현지 공식 경보 provider
- PR-01/02 private shadow의 authoritative reader 전환

## 3. Safety 결과 계약

```json
{
  "engineVersion": "earthus.safety.warning.v1",
  "status": "WARNING",
  "gate": "OFFICIAL_WARNING_ACTIVE",
  "reason": "OFFICIAL_WARNING_ACTIVE",
  "applies": true,
  "activityAllowed": false,
  "blocksPositiveRecommendation": true,
  "safeClaimAllowed": false,
  "warnings": [],
  "freshness": { "status": "FRESH", "ageMinutes": 10 },
  "zone": {
    "id": "L1010700",
    "method": "NEAREST_KMA_STATION_ZONE",
    "approximate": true,
    "stationCount": 710
  },
  "evidence": {
    "source": "기상청 기상특보 (API허브 wrn_now_data)",
    "license": "공공누리 제1유형 (출처표시)",
    "observedKst": "202608121110",
    "n": 21
  }
}
```

`status`는 `WARNING/DANGER/UNKNOWN`만 만든다. `SAFE`는 이 근사 매핑으로 만들지 않으며,
`CLOSED`는 운영기관의 공식 폐쇄 근거가 없으므로 만들지 않는다.

## 4. Region mapping gate

현재 공개 `kma-warn-stations.json`은 기상청 `wrn_reg_aws2`의 관측지점↔특보구역 표다.
위치에서 가장 가까운 공식 관측지점을 60km 안에서 고르며 다음 metadata를 보존한다.

- `method=NEAREST_KMA_STATION_ZONE`
- station name, 거리 km, source zone id/name
- 구역표 생성시각과 전체 관측지점 `stationCount`
- `approximate=true`, `officialBoundaryPolygon=false`

공식 polygon이나 hierarchy가 아니므로 대표점 반경, 코드 접두어, `parentId` 역방향 일치로
확장하지 않는다. 같은 공식 `regionId`가 현재 발효 목록에 있을 때만 Hard Gate를 켠다.
정확히 일치하지 않으면 `NO_MATCH_NOT_SAFE/UNKNOWN`이다.

## 5. Freshness와 provider 실패

| source age | 결과 | 긍정 추천 |
|---|---|---|
| 0~30분 | `FRESH` | 공식 exact warning 있으면 차단 |
| 30~45분 | `AGING` | 지연 가능성을 남기고 exact warning 우선 |
| 45분 초과 | `STALE/UNKNOWN` | 현재 특보라고 단정하지 않고 차단 |
| 시각 없음/5분 초과 미래 | `UNKNOWN` | 차단 |
| fetch 실패·위치 없음·region unmapped | `UNKNOWN` | 차단 |
| 한국 밖 | `KMA_OUT_OF_COVERAGE`, `applies=false` | 현지 provider 판단을 가로막지 않음 |

앱의 10분 refresh owner는 기존 `warn.js` 하나만 사용한다. Safety Engine에는 timer,
`requestAnimationFrame`, 위치 추적 또는 백그라운드 작업이 없다.

## 6. Revision 계약

기상청 command를 다음과 같이 보존한다.

| 공식 code/문구 | state |
|---|---|
| `1` / 발표 | `PUBLISHED` |
| `2` / 대치 | `REPLACED` |
| `3` / 해제 | `RELEASED` |
| `4` / 해제예보 연장 | `RELEASE_FORECAST_EXTENDED` |
| 그 외 | `UNKNOWN` |

과거의 `"해제" in command` 검사는 코드 4의 “해제예보 연장”까지 종료로 오인할 수 있었다.
이제 정확한 코드/문구만 해제로 분류하고, 공개 active/upcoming record에 `command`,
`commandState`, `revision`을 보존한다. snapshot은
`schemaVersion=earthus.kma-warning.snapshot.v2`와 freshness/mapping policy를 포함한다.

## 7. UI 계약

- 첫 Earth View에는 Safety 카드가 자동으로 나타나지 않는다.
- 한국 → 특보 화면 첫 카드에서 제한/UNKNOWN을 확인한다.
- active exact match: `공식 특보 우선 · 추천 제한`
- no match: `안전 판정 아님 · 특보가 없거나 안전하다는 뜻이 아닙니다`
- stale/down: 마지막 source 시각과 상태 확인 불가를 함께 표시
- 최소 44px 공식 CTA, 한국 119/112 및 행정안전부 행동요령 유지
- 전국 발효 목록은 근거 탐색용으로 유지하되 내 지역 안전 판정과 섞지 않는다.

## 8. 검증과 중단 기준

- pure JS contract/replay/UI 23개
- Python command/replay 5개
- 현재 운영 KMA snapshot과 station-zone exact match 실대조
- 기존 Earth route/readability/TPW와 AETHERUS 6개 묶음 회귀
- 1280×720, 390×844 실제 화면과 44px CTA, 가로 overflow 0
- query 없는 첫 지구에서 Safety/판독 패널 자동 노출 0

다음 중 하나면 Hard Gate를 열지 않는다.

- official source/time/license/n 없음
- snapshot 45분 초과 또는 5분 초과 미래
- 60km 안에 공식 station-zone record 없음
- source `regionId` exact match 없음
- 공식 command/revision을 해석할 수 없음

## 9. Rollback

정적 rollback은 `index.html`의 `main.js?v=20260812-safety1`과 `safety.css` link를 직전
revision으로 되돌리고 Safety 관련 JS/CSS 경로를 무효화한다. 수집기 rollback은 Lambda code
revision을 직전 version으로 되돌린 뒤 `events/kma-warn.json`의 source/time/activeCount와
기존 reader를 확인한다. rollback 중에도 UI는 SAFE를 만들지 않고 `UNKNOWN`이어야 한다.

## 10. 남은 UNKNOWN / 다음 PR

- 공식 polygon/hierarchy는 확보·fixture 검증 전까지 계속 `REGION_UNMAPPED/UNKNOWN` 영역이다.
- 한국 밖 Safety provider는 별도 source gate가 필요하다.
- PR-06에서 단계색·등치선·값을 연속 레이어별로 구현한다.
- PR-07은 이 `blocksPositiveRecommendation`을 먼저 평가한 뒤 공유 가능한 Base Activity Score를
  계산하며, 개인 선호는 별도 delta로만 더한다.
