# AETHERUS PR-04 — Observation Planner Vertical Slice

> 기준일: 2026-08-12 (Asia/Seoul)
> 선행 기준: `docs/AETHERUS-PR-03-ASTRONOMY-VERTICAL-SLICE-2026-08-12.md`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx` ENG-303 / PART XVI PR-03

## 0. 결론

PR-04는 “화성을 볼 수 있다”거나 “오늘 관측하기 좋다”는 예측 기능이 아니다. PR-03에서
검증한 화성 Explorer 좌표에 태양의 기하 고도와 USNO의 천문박명 정의를 결합해, 지정한
24시간 안에서 **두 계산 조건이 겹치는 15분 격자 후보 구간**만 만든다.

```text
Mars + observer + start UTC
  → 24 h / 15 min inclusive grid (97 points)
  → Mars geometric altitude ≥ 0°
  → Sun geometric center altitude ≤ -18°
  → GEOMETRY_CANDIDATE | NO_FEASIBLE
  → immutable deterministic revision
  → share route v3 + plan-data-only JSON manifest
```

날씨·빛공해·현지 지평선·달·장비 적합성은 `UNAVAILABLE`로 남긴다. 이 값이 없는데도
성공률, 안전, 이동 추천, 실제 관측 가능, 망원경 조준으로 승격하는 것은 금지한다.

## 1. ADR-020 — 제한적 기하 계획을 첫 Planner 경계로 채택

### 1.1 결정

| 항목 | 결정 |
|---|---|
| 첫 target | Mars 하나 |
| availability | 시작 UTC부터 24시간 |
| 계산 격자 | 양 끝 포함 15분 간격, 총 97개 |
| 적용 constraint | 화성 기하 고도 ≥ 0°, 태양 기하 고도 ≤ -18° |
| 결과 | `GEOMETRY_CANDIDATE` 또는 `NO_FEASIBLE` |
| 실행 가능성 | 항상 `activationAllowed=false` |
| 엔진 위치 | 브라우저 pure ES module, 네트워크 호출 없음 |
| plan identity | 정규 입력 + engine revision의 결정론적 FNV-1a 식별자 |
| immutable export | plan-data-only JSON manifest |
| 외부 API | 도입하지 않음. `POST /v1/plans`는 아직 후보도 아님 |

JPL Table 1은 저정밀 공식이 관측 일정에 쓰일 수 있음을 설명하지만, 같은 페이지가 고정밀
요구에는 Horizons를 사용하라고 명시한다. USNO는 태양 중심의 기하 천정거리가 108°일 때를
천문박명의 경계로 정의한다. 여기서는 그 의미를 `Sun altitude ≤ -18°`로 사용하되, 굴절과
현지 지평선이 없는 계산 격자임을 결과와 같은 패널에 표시한다.

### 1.2 채택하지 않은 대안

- 날씨 API를 먼저 연결: 공급자·라이선스·freshness·비용과 실패 정책이 확정되지 않았다.
- “관측 가능/불가” 이진 판정: 현재 입력만으로 증명할 수 없다.
- Moon 근사식을 새로 추가: 별도 공식 fixture와 정밀도 예산 없이 PR 범위를 넓힌다.
- 서버 스케줄러·DB·event bus: 현재 단일 target 로컬 계산에서 필요성이 측정되지 않았다.
- service worker 완전 오프라인 팩: 다음 Local Session & Sync 경계의 소유권이다.

## 2. 책임·입력·출력·인터페이스

### 2.1 `observation-planner.js` 책임

- 관측자·시작 UTC·criteria를 정규화하고 privacy-safe input을 만든다.
- 동일 입력에 동일 `inputRevision`과 `planRevision`을 만든다.
- 화성·태양 기하 고도를 15분 격자로 계산한다.
- 적용/누락 constraint ledger와 실패 reason을 함께 반환한다.
- 입력 변경을 `CURRENT | STALE`로 비교한다.
- immutable plan-data-only 오프라인 매니페스트를 만든다.

책임 밖: 날씨 생성, local horizon 추정, 광공해 추정, Moon 품질 판정, 장비 검증, 여행 안전,
촬영 실행, 서버 저장, 사용자 원본 보관, service worker cache.

### 2.2 호출 계약

```js
createMarsGeometryPlan({
  observer: { lat, lon, source, accuracyM? },
  startAt: ISO_8601_UTC,
  criteria?: {
    durationHours: 24,
    stepMinutes: 15,
    marsAltitudeMinDeg: 0,
    sunAltitudeMaxDeg: -18
  }
}) -> ObservationPlanV1
```

```js
assessObservationPlan(plan, { observer, startAt, criteria? })
  -> { status: 'CURRENT' | 'STALE', reason }

createOfflinePlanManifest(plan)
  -> OfflineObservationPackManifestV1
```

### 2.3 핵심 데이터 모델

```json
{
  "schema": "earthus.observation-plan.v1",
  "engineRevision": "geometry-mars-24h-explorer-v1",
  "revision": "plan_ab0f388b",
  "inputRevision": "input_...",
  "lifecycle": {
    "state": "READY",
    "transitionsEvaluated": ["DRAFT", "VALIDATING", "READY"],
    "activationAllowed": false
  },
  "result": "GEOMETRY_CANDIDATE",
  "reason": "LIMITED_GEOMETRY_ONLY",
  "input": {
    "target": "mars",
    "observer": {
      "lat": 37.4563,
      "lon": 126.7052,
      "privacyMode": "default-location"
    },
    "availability": {
      "startUtc": "2026-08-12T00:00:00.000Z",
      "endUtc": "2026-08-13T00:00:00.000Z"
    },
    "precision": "explorer"
  },
  "windows": [],
  "constraints": [],
  "evidence": {
    "calculationSampleCount": 97,
    "observationSampleCount": null,
    "calculationGrid": "15min-inclusive"
  }
}
```

`accuracyM`, 관측자 이름과 원본 기기 좌표는 plan identity와 export에 들어가지 않는다. 기본
위치는 `default-location`, 버튼으로 허용한 위치와 공유 링크는 `rounded-shared-location`으로
정규화한다. 같은 반올림 좌표의 device→shared round trip은 같은 plan revision을 만든다.

## 3. constraint ledger와 결과 의미

| Constraint | 상태 | fallback/행동 |
|---|---|---|
| Mars geometric altitude | `APPLIED` | 임계값 0° |
| Sun astronomical darkness | `APPLIED` | 임계값 -18°, USNO 정의 링크 |
| Local horizon | `UNAVAILABLE` | 지형 대신 기하 지평선 0°를 명시 |
| Weather | `UNAVAILABLE` | 대체값 없음 |
| Sky brightness/light pollution | `UNAVAILABLE` | 대체값 없음 |
| Moon separation/illumination | `UNAVAILABLE` | 대체값 없음 |
| Equipment compatibility | `UNAVAILABLE` | 대체값 없음 |

`GEOMETRY_CANDIDATE`는 적용한 두 조건의 계산 격자 교집합일 뿐이다. `NO_FEASIBLE`도
“이 24시간 격자에 교집합이 없음”이라는 설명이며, 대상이 관측 불가능하다는 결론이 아니다.
격자 window의 시작·끝은 rise/set event 시각이 아니고 15분 표본의 첫/마지막 통과점이다.

## 4. 상태·이벤트 흐름

```text
MARS_ASTRONOMY_READY
  └─ Build 24 h plan
       DRAFT → VALIDATING
         ├─ intersection exists → READY / GEOMETRY_CANDIDATE
         ├─ no intersection     → DRAFT / NO_FEASIBLE
         └─ invalid input       → ERROR

READY | NO_FEASIBLE
  ├─ same input rebuild → same revision
  ├─ UTC/location changes → STALE + route plan removed + export disabled
  ├─ rebuild changed input → new revision + CURRENT
  ├─ save JSON → immutable PLAN_DATA_ONLY manifest
  └─ close Mars/Earth exit → memory and route cleared
```

`Plan.Drafted` 같은 외부 domain event를 발행하지 않는다. 현재 이벤트는 기존
`aetherus:state` 한 개로 URL을 동기화하는 브라우저 내부 신호다. 서버 event bus나 analytics
수집을 구현한 것처럼 문서화하지 않는다.

## 5. URL v3와 복원

```text
?aetherus=3&solar=1&target=mars
  &observer=37.46,126.71
  &at=2026-08-12T00:00:00.000Z
  &precision=explorer
  &plan=geometry24h
```

- v1·v2를 계속 읽고 새 주소만 v3로 쓴다.
- `plan=geometry24h`는 target=mars + observer + at + precision이 모두 있어야 한다.
- v1/v2에 plan을 얹으면 `PLAN_REQUIRES_V3`, 입력 누락은 `INCOMPLETE_PLAN_INPUT`이다.
- deep link는 천문 입력을 먼저 복원한 뒤 같은 순수 함수로 plan을 다시 만든다.
- CURRENT plan만 URL에 남긴다. 입력이 바뀐 STALE plan은 메모리에 증거로 남되 URL에서 제거한다.

## 6. 실패·retry·cache·offline·보안

| 관심사 | 결정 |
|---|---|
| 잘못된 UTC/좌표/criteria | 오류 코드로 실패, 기본 성공값 금지 |
| 계산 범위 밖 | PR-03의 `UTC_OUTSIDE_JPL_TABLE_1` 전파 |
| no feasible | 적용한 constraint와 24시간 범위를 설명, 관측 불가로 표현 금지 |
| stale input | 이전 revision 보존, CURRENT export·URL 비활성, 사용자 재계산 필요 |
| retry | transport retry 없음. 사용자 rebuild만 허용 |
| cache | 결과 영구 저장 없음. 동일 revision은 순수 계산으로 재현 |
| offline calculation | 이미 로드된 정적 모듈만 사용하며 네트워크 호출 0 |
| offline manifest | plan 데이터·revision·출처·제외 목록만 포함 |
| full offline pack | `NOT IMPLEMENTED`; app shell/service worker/checksum 없음 |
| input security | UTC/range/criteria/route allowlist 검증, DOM은 `textContent` 사용 |
| privacy | 원본 기기 정확도·이름·계정·IP·로컬 저장·서버 전송 없음 |

JSON 매니페스트는 `appShellIncluded=false`, `cryptographicChecksumsIncluded=false`를 명시한다.
FNV-1a는 동일 계획의 짧은 식별자이며 파일 무결성이나 보안 서명으로 표현하지 않는다.

## 7. UI·접근성

- Mars 천문 패널 안에서만 계획 버튼과 결과를 연다.
- 결과 badge는 `GEOMETRY | NO FEASIBLE | STALE | ERROR`를 구분한다.
- UTC 범위, 두 임계값, 계산 격자 수, 관측 `n 해당 없음`, revision을 함께 표시한다.
- 누락 constraint와 “성공률·안전·이동·조준 판정 아님”을 같은 결과 카드에 둔다.
- 결과는 `aria-live`인 기존 상세 aside 안에 있으며 링크·버튼은 최소 44px이다.
- 390×844는 전폭 스크롤 bottom sheet와 1열 action을 사용한다.
- 계산은 버튼/딥링크 당 97×2 순수 계산만 수행하고 timer·polling·rAF를 추가하지 않는다.

## 8. 테스트·release gate

### 8.1 자동 증거

```text
node tools/test_aetherus_observation_planner.mjs
node tools/test_aetherus_astronomy.mjs
node tools/test_aetherus_foundation.mjs
node tools/test_aetherus_photo_ownership.mjs
```

고정 시나리오:

1. 같은 입력의 plan 전체 deep equality와 revision 일치
2. 기본 fixture의 `GEOMETRY_CANDIDATE`, 97개 계산 격자, 관측 n=null
3. 89° constraint와 기본 constraint의 2026-01-01 자연 발생 `NO_FEASIBLE`
4. stricter constraint가 candidate sample을 늘리지 않는 monotonicity
5. UTC +15분의 `STALE / INPUT_CHANGED`
6. device accuracy·label이 shared plan identity/export에 미포함
7. manifest 결정론, app shell/checksum 미포함 고지
8. v3 round trip, v2 plan 거부, orphan/incomplete plan 실패
9. 기존 JPL Mars·catalogue·photo ownership 회귀 통과

### 8.2 실제 UI 증거

```text
desktop: Mars → 24 h plan → candidate/no-feasible wording → JSON download
390×844: full-width scroll sheet, no horizontal overflow, 44 px controls
plan deep link: reload → same revision and route v3 retained
recalculate now: STALE visible, plan removed from URL, download disabled
rebuild: CURRENT + new revision + plan restored to URL
close: observer/UTC/plan removed
normal path console error = 0
idle render delta = 0
```

## 9. KPI·성능·비용

- `plan p95 < 2s`는 원본 사양의 **UNVERIFIED hypothesis**다. desktop Node와 실제 브라우저
  시간을 기록하되 low-end 기기·cold cache·offline/reconnect 증거 전에는 SLA로 쓰지 않는다.
- 2026-08-12 Node 20.18.1 warm 30회 고정 fixture의 로컬 p95는 6.25ms였다. 이 수치는
  현재 개발기 sanity evidence이며 390×844 viewport나 저사양 실기 성능을 대신하지 않는다.
- 분석 이벤트는 추가하지 않는다. conversion이나 invalidation notification 수치는 아직 없다.
- 외부 API·서버 compute·DB·AI·스토리지 비용은 0이다.
- 한계비용은 정적 JS 전송과 기기 CPU 194회 좌표 계산뿐이다.
- 요청 단위 서버 호출로 옮기는 것은 실제 multi-target/multi-night 측정이 필요할 때만 검토한다.

## 10. 다음 확장 gate

다음 PR은 Local Session & Sync다. 다음 항목은 별도 증거 없이 PR-04에 합치지 않는다.

1. IndexedDB session checkpoint와 명시적 schema migration
2. offline app shell/resource checksum과 cache freshness
3. reconnect 시 upload/pull 분리 및 사용자 원본 conflict 정책
4. weather/local horizon/light pollution/Moon adapter fixture
5. equipment rig와 실제 실행 가능성 검증
6. multi-night campaign, ranking, remote `POST /v1/plans`

## 11. 공식 근거

- NASA/JPL Solar System Dynamics, Approximate Positions of the Planets:
  <https://ssd.jpl.nasa.gov/planets/approx_pos.html>
- U.S. Naval Observatory, Rise, Set, and Twilight Definitions:
  <https://aa.usno.navy.mil/faq/RST_defs>
- NASA/JPL Horizons API documentation:
  <https://ssd-api.jpl.nasa.gov/doc/horizons.html>
