# V38.1 실제 소스 조사 기록 (수정 전)

> 2026-09-25. V38.1 지시서 §1 "조사 결과를 먼저 문서화한 뒤 수정하라"에 따른 기록.
> 기준 커밋: `origin/main` `3370220` (ui_PLEOS 업로드) 위의 작업 브랜치 `claude/youthful-keller-3qh7sa`.
> 경로는 `prototype/js/` 기준이다 (따로 적은 곳 제외).

## 0. 저장소 성격

- **빌드 없는 정적 웹앱**이다. `package.json`·번들러·Android/Capacitor/TWA 프로젝트가 없다.
  배포는 `aws s3 cp` + CloudFront 무효화 (HANDOVER §3).
- 모든 브라우저 JS는 ES module이다. Cesium은 classic script 전역 (`index.html:1216`).
- 테스트는 `tools/test_*.mjs` 개별 node 스크립트다 (`node:assert/strict`). 한꺼번에 돌리는 러너와 CI는 없다.
  - `.js`가 CommonJS로 해석될 수 있어 기존 테스트는 소스를 data: URL로 import한다.
  - 브라우저 테스트 38개는 Mac 전용 playwright 경로를 하드코딩했다.
- 운영 계보는 `main` (HANDOVER-2026-08-22 §0).
  `origin/app/web-readiness-2026-09-24`에 main에 없는 커밋이 973개 있지만 인수인계 문서에는 언급이 없다.
  **이번 작업은 main 기준이며, 그 분기와의 병합은 범위 밖이다** (미확인 사항으로 보고서에 남긴다).

## 1. 진입점

| HTML | 모듈 진입 | 비고 |
|---|---|---|
| `index.html:1224` | `js/main.js` | EARTHUS+AETHERUS 본 앱 |
| `aetherus-lab.html:69` · `aetherus-device-qa.html:199` | `aetherus-lab.js` · `aetherus-device-qa.js` | AETHERUS 전용 |
| `lab-reports` · `research` · `social-settings` · `station` · `studio` · `verify` | 각 `*.js` | 보조 페이지 |

- 라우터 라이브러리는 없다. 장면은 `sceneMgr.to('earth'|'space'|'ocean')`로 바뀐다 (`scene.js:10`).
- 라우트는 query 키다. 진입 우선순위는 `?dive=` → EARTHUS `earth*` 키 → `decodeAetherusRoute` (`main.js:175-220`).

## 2. EARTHUS / AETHERUS 경계 (Pleos 분리의 근거)

- **두 제품이 한 번들이다.**
  - `main.js:59-61`이 `space/skyframe.js`·`space/cosmic3d.js`·`space/route-state.js`를 정적 import한다.
  - `ui-sky.js:17`이 `space/korea-stargazing-preflight.js`를 import한다.
  - main.js 정적 그래프 149개 중 AETHERUS 모듈은 11개, 동적 import까지 182개다.
  - `main.js:157-159`는 `cosmic3d.init()`을 항상 부른다.
  - → **Pleos는 `main.js`를 재사용할 수 없다.** 별도 진입점이 필요하다.
- AETHERUS 전용 코드:
  - 모듈: `js/space/*` (41개), `js/aetherus-lab.js`, `js/aetherus-device-qa.js`
  - CSS: `css/aetherus-*.css`
  - 데이터·에셋: `data/aetherus/*` (13개), `prototype/space/*`
  - 기타: `vendor/three-r184…`는 cosmic3d 전용
- `js/layers/space.js`는 이름과 달리 **EARTHUS**다 (Cesium 위 로켓 발사·궤도 레이어).
- 회색 영역: `viewer.js:3` → `sky-panorama.js` → `prototype/space/skybox/.../sky-asset-manifest.js` (지구본 배경 하늘).
  Pleos 진입점은 Cesium viewer를 쓰지 않으므로 이 경로도 들어가지 않는다.
- AETHERUS URL 키: `aetherus, space, solar, target, photo, telescope, craft, observer, at, precision, plan` (`space/route-state.js:7-14`).
  - `at`은 EARTHUS 시각 문맥에도 쓰이는 이름이라 Pleos 거절 목록에서 뺐다.
- 분석 이벤트: `aetherus.opened`, `aetherus.scene_selected` (`analytics-contract.js:17-18`). `space.*` 이벤트는 없다.
- 검색: `search.js:116-122,296-305`에 AETHERUS 사진 결과가 있다. `sw.js:41-42,126-131`에 AETHERUS 캐시 로직이 있다.
- 플랫폼 개념: `access-mode.js`는 유료 모드만 다룬다. `push.js:148`은 push용 `ios|android|web`만 구분한다.
  `CarUxRestrictions`·`DrivingState`는 저장소 어디에도 없다.

## 3. 장소(POI)·관광·행정 데이터 — 유지 대상

| 모듈 | 하는 일 | 모양·출처 |
|---|---|---|
| `place.js` | 역지오코딩 + 지점 파도 조회. **POI 목록이 아니다.** | `lookupPlace(lat,lon,{deviceCurrent})`: 기본은 오프라인 `countryAt`→`koreaAdminAt`. `lookupWaves`·`lookupWaveModel`은 Open-Meteo Marine |
| `korea-admin-reference.js` | 시군구 경계 point-in-polygon | `data/korea-admin-reference.json` (geoBoundaries KOR ADM2, 228개, `boundaryYear:2020`). `koreaAdminAt(lat,lon)` → `{nameKo,nameEn,regionKo,regionEn,boundaryYear,source}` |
| `kto-tourism-contract.js` | 한국관광공사 수집 요약 검증 | `${API.TOURISM}/kto/summary.json`. `validateKtoSummary`, `ktoSummaryRows` (상태 AVAILABLE…NOT_COLLECTED, 서비스별 STALE 기준) |
| `tourism-flow-contract.js` | 서울 관광지 실시간 인구 | `${API.TOURISM}/seoul-flow.json`. 장소마다 `id, nameKo, category, position, state(LIVE/DEGRADED/STALE/UNAVAILABLE), provenance{sourceName, sourceUrl, observedAt, receivedAt, license}`. `validateTourismSnapshot` |
| `beaches.js` · `fishing.js` · `para.js` · `trails.js` | 정적 지점 목록 | 항목별 id·source·observedAt 없음 (파일 단위 자료) |

- 클릭→카드 경로: `main.js:813 onPick`에서 해변·낚시·패러·관광·일반 지점으로 나뉜다.
  관광 장소는 `tourismSheet.open(place)` (`ui-tourism.js:83`), 일반 지점은 `sheet.open` (`ui.js:471`).
- 장소 환경 정보: `weather-data-v7.js loadWeatherInputsV7` + `weather-contract-v7.js buildWeatherCardModel`.
  - 값마다 `{value, unit, dataState, sourceRef, observedAt, issuedAt, validAt}`, 출처마다 `{label, observedAt, issuedAt, receivedAt, dataState, license}`
  - **DOM·Cesium 의존 없음.**
  - 반면 `ui.js`의 일반 지점 시트는 출처·시각 없이 값만 그린다 (`ui.js:491-523`).
- **Node 전용 import (`node:fs` 등)는 `prototype/`에 하나도 없다.** `node:fs` 문제는 `ui_PLEOS` 킷 안에만 있었다.
- Cesium 없이 쓸 수 있는 모듈: `place.js` 계열, `korea-admin-reference`, `tourism-flow-contract`, `weather-*-v7`, `kma-fcst`, `korea`, `safety-engine`, `beaches` 등.
  - `ui-tourism.js`·`warn.js`·`decision-rail.js`는 `ui.js`(앱 전체)나 `viewer.js`를 끌고 와서 재사용할 수 없다.

## 4. 안전·결정 로직 — 유지 대상

- **`safety-engine.js`가 실제 Hard Gate다.** 순수 모듈이다.
  - `evaluateWarningSafety`는 자료 없음 → `PROVIDER_UNAVAILABLE`, 구역 불명 → `REGION_UNMAPPED`, 지연 → `PROVIDER_DELAY`, 일치 없음 → `NO_MATCH_NOT_SAFE`(status UNKNOWN)를 돌려준다.
  - `safeClaimAllowed`는 항상 false다. **실패를 "안전"으로 바꾸는 경로가 없다.**
- `activity-decision-core.js`는 결정적이지만 `CALIBRATION_SHADOW` 상태다. `decision-ui.js`는 `DECISION_CORE_READY=false`로 잠겨 있다.
- **RAIN_INDOOR·SUNSET_OUTDOOR 같은 장소 문맥 규칙 ID는 저장소에 없다.** 지시서 §11의 "기존 결정적 rule engine"은 이 이름으로는 존재하지 않는다.
- 운전 상태 게이트는 없다 (Pleos 전용 신규).

## 5. 예약·쿠폰

- 실제 실행이 없다. `reservation-impact.js`는 계약만 있고 `executionAuthorized:false`를 하드코딩했으며, 테스트만 import한다.
- 쿠폰·바우처·프로모션 코드는 저장소 어디에도 없다.
- 판매는 `SALES_OPEN=false`, Decision·예약은 `SHADOW/BLOCKED` (HANDOVER-2026-08-22 §0).
- → Pleos에서 RESERVATION·COUPON은 capability 없음으로 항상 막는다.

## 6. 자료 상태 어휘 (공통 도우미 없음)

- `safety-engine warningFreshness`: FRESH(≤30분) / AGING(≤45분) / STALE / FUTURE / UNKNOWN
- `weather-contract-v7 DATA_STATE`: AVAILABLE / MISSING / STALE / ESTIMATED / INVALID / NOT_SUPPORTED / CONFLICTING
- `tourism-flow-contract`: LIVE / DEGRADED / STALE / UNAVAILABLE
- `layers/registry.js status`: ok / error / loading / blocked, 그리고 `lastOk`·`lastErr`
- 지시서 §12의 FRESH/STALE/EXPIRED/UNAVAILABLE/ERROR는 Pleos 표시층에서 위 원천 상태를 **바꾸지 않고 옮겨 적는** 방식으로 맞춘다.

## 7. 조사 중 발견한 기존 결함 (지시서 §12 "절대 금지"에 해당)

1. `layers/alerts.js`는 기상청·INMET·NWS 요청을 각각 try/catch로 삼킨다 (`:115, :141, :170`).
   - 셋 다 실패해도 `registry.run`은 `ok`로 기록하고, 안전 레이어 실패 문구(`ui-source.js:680-693`)가 뜨지 않는다.
   - → **provider failure가 "빈 지도 = 특보 없음"으로 보인다.**
2. `aws/world-alerts/handler.py:133-135`는 NWS가 빈 목록을 주면 파일을 쓰지 않고 돌아간다. 그래서 이전 파일이 남는다.
   - `alerts.js`는 `expires`를 확인하지 않는다.
   - → **해제 시각이 지난 경보가 활성 경보로 보일 수 있다.**

## 8. ui_PLEOS 참고 킷의 위치

- 저장소 루트에 있고 `prototype/`·`tools/`가 참조하지 않는다.
- 게이트가 목록에 없는 기능을 허용하고(fail-open), 기능 이름이 서로 어긋난다.
- `node:fs` 때문에 브라우저 데모가 빈 화면이고, V38 게이트는 패키지 밖 경로를 참조한다 (2026-09-25 직접 실행 확인).
- **정본으로 쓰지 않는다.** 57개 POI는 `tools/fixtures/pleos/poi-demo-57.json`에 시험 전용으로 복사한다.
