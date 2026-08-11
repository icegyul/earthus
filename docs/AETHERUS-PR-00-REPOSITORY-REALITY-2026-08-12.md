# AETHERUS PR-00 — Repository Reality & Gap Analysis

> 기준일: 2026-08-12 (Asia/Seoul)
> 감사 기준 커밋: `53c25579f3a4a2e293c21062e24642d78d2d8e`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx`
> 저장소 운영 기준: `docs/HANDOVER.md` → `docs/EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md` → 실제 코드·데이터·검증 결과

## 0. 결론

Aetherus는 새 독립 서비스가 아니라 **EARTHUS 안에서 지구 밖으로 관찰 범위를 확장하는 우주 관측 경험**으로 이미 일부 동작한다. 현재 운영 실체는 정적 ES 모듈과 Three.js 기반 `cosmic3d`이며, 50개의 HST/JWST 사진, 태양을 포함한 9개 천체, 4개 우주선, 은하수 구조와 태양 운동 데이터를 실제로 소비한다.

그러나 최종 Engineering Specification의 Observation OS 전체가 구현된 것은 아니다. 현재 상태는 다음과 같다.

- 강한 기반: 실제 출처 데이터, 정적 배포, 태양계·은하·사진·우주선 탐색, 발열 방지 원칙, 데이터 검증기
- 부분 기반: 시간·좌표·근사 궤도, provenance 표시, URL 진입점, 권리 메타데이터
- 미구현: 관측 계획, 세션 상태 머신, Sky AR, plate solving, 장비 호환성, 원격 관측소, 개인 우주, 시민과학, AI orchestrator, semantic search, SDK/marketplace
- 즉시 해결할 현실 불일치: 태양을 추가한 뒤 검증기가 8개 천체만 기대함, Earth 레이어와 Aetherus의 HST/JWST 중복, 불완전한 deep link, 활성·레거시 파일 혼재

PR-00은 제품 동작을 바꾸지 않고 첫 번째 불일치인 천체 검증 계약을 수정한다. 이후 제품 구현은 `docs/HANDOVER.md`의 **2026-08-16 사용량 초기화 확인 전 착수 금지**를 따른다. 이 문서는 그 전까지 허용되는 문서·검증 기준선이다.

## 1. 제품 헌법

### 1.1 제품 정의

> Aetherus is an AI-powered Observation Operating System that connects the digital universe to the real sky.

EARTHUS가 현재 지구를 근거와 관측 시각으로 읽게 한다면, Aetherus는 같은 신뢰 원칙을 유지한 채 사용자를 디지털 우주에서 실제 하늘의 관측·촬영·기록으로 연결한다.

### 1.2 절대 유지 원칙

1. 예보·추정·재구성·시뮬레이션을 실제 관측처럼 표현하지 않는다.
2. 표시 값과 미디어에는 출처, 관측/취득/공개 시각의 의미, 라이선스 상태를 붙인다.
3. 현재 EARTHUS의 지구·심해·해저 기능과 메뉴 구조를 깨지 않는다.
4. Three.js와 Cesium의 상시 렌더링을 만들지 않는다. 비활성 레이어의 예약 작업은 반드시 취소한다.
5. 서버·DB·이벤트 버스·신규 공급자를 설계서에 있다는 이유만으로 먼저 도입하지 않는다.
6. 결제·판매·SNS 게시·물리 장비 제어는 별도 승인과 안전 게이트 없이 실행하지 않는다.
7. 로컬 변경과 `⚠️⚠️` 사고 기록을 보존하며, 작업 파일만 선택적으로 커밋한다.

## 2. 감사 스냅샷과 dirty-state 원장

| 항목 | 감사 결과 |
|---|---|
| Git branch | `main` |
| 기준 HEAD | `53c25579f3a4a2e293c21062e24642d78d2d2d8e` |
| 사용자 변경 | `docs/EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md` 수정 상태 |
| 사용자 변경 처리 | 본 PR에서 수정·스테이지·커밋하지 않음 |
| 로컬/운영 비교 | 핵심 Aetherus JS·JSON은 `https://earthus.net`과 byte-for-byte 동일 |
| 운영 배포 | PR-00에서 수행하지 않음 |
| 검증기 수정 | `tools/verify_celestial_bodies.py`만 제품 비동작 변경 |

`docs/EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md`에는 경쟁 지도와 v2.3 종료 계약을 확장한 미커밋 변경이 존재한다. 이것은 사용자 소유 변경으로 간주하여 그대로 보존한다.

## 3. 저장소 실사

### 3.1 수량 기준선

| 영역 | 실제 수량 | 비고 |
|---|---:|---|
| AWS Lambda `handler.py` | 63 | 기존 인계 문서의 54개 표기는 오래된 수치 |
| `prototype/js/**/*.js` | 142 | 빌드 없는 브라우저 ES 모듈 |
| `prototype/js/space/*.js` | 7 | 활성과 레거시가 혼재 |
| `prototype/data/*.json` | 19 | 정적 운영 데이터 계약 |
| Supabase Edge Function | 6 | 실제 경로는 `prototype/supabase/functions/*/index.ts` |
| `prototype/*.html` | 11 | 정적 진입 화면 |
| `tools/*.py` | 20 | 데이터·정확도·운영 검증 |

### 3.2 활성 Aetherus 런타임

| 구성요소 | 상태 | 실제 역할 |
|---|---|---|
| `prototype/js/main.js` | 활성 | 초기 URL 상태 해석, EARTHUS/Aetherus 모드 진입 |
| `prototype/js/space/cosmic3d.js` | 활성 | 태양계·은하·사진·우주선 Three.js 탐색 경험 |
| `prototype/js/space/kepler.js` | 활성 | 행성 근사 위치 계산 |
| `prototype/js/space/skyframe.js` | 활성 | 우주 장면 좌표·표현 보조 |
| `prototype/js/space/skyphotos.js` | 활성 | Earth 레이어의 HST/JWST 사진 |
| `prototype/js/layers/registry.js` | 활성 | HST/JWST 레이어 등록과 데이터 소비 |
| `prototype/js/scene.js` | 활성 | Cesium 장면과 렌더 생명주기 |
| `prototype/js/power.js` | 활성 | 예약 렌더 소유권·취소·유한 애니메이션 |
| `prototype/js/store.js` | 활성 | 브라우저 상태. 장면 복원은 의도적으로 영속화하지 않음 |

### 3.3 레거시 또는 비활성 표면

| 구성요소 | 판정 | 근거/조치 후보 |
|---|---|---|
| `prototype/js/space/cosmiczoom.js` | 비활성 | 현재 엔트리포인트에서 import되지 않음 |
| `prototype/js/space/solarscene.js` | 비활성 | 현재 엔트리포인트에서 import되지 않음 |
| `prototype/js/space/galaxycards.js` | 비활성 | 현재 엔트리포인트에서 import되지 않음 |
| `prototype/data/probes.json` | 레거시 계약 | 비활성 `solarscene.js`와 로컬 검증기만 소비, 운영 URL은 HTTP 403 |
| `solarExperience`, `galaxyCards` DOM | 잔존 | `prototype/index.html`에 남았으나 현재 `cosmic3d` 경로와 분리됨 |

삭제는 PR-00 범위가 아니다. PR-01에서 실제 소비 그래프와 운영 URL을 다시 확인한 뒤 `deprecated` 표기, 마이그레이션, 제거 중 하나를 ADR로 결정한다.

## 4. 현재 C4

### 4.1 Level 1 — System Context

```text
[사용자/관리자]
      |
      v
[EARTHUS 정적 웹 애플리케이션]
  - Earth: Cesium
  - Aetherus: Three.js cosmic3d
      |                    \
      | 정적 JSON/미디어     \ 인증·관리·결제 보조
      v                       v
[S3 + CloudFront]       [Supabase Edge Functions]
      ^
      | 수집·정규화 결과
[63 AWS Lambda 수집기] <---- [NASA/ESA/NOAA 등 외부 제공자]
```

신뢰 경계는 브라우저, 정적 배포 원본, 서버 측 수집/관리 함수, 외부 제공자 사이에 있다. 브라우저가 직접 가져온 외부 값도 반드시 표시 출처와 시각 의미를 보존해야 한다.

### 4.2 Level 2 — Containers

```text
Browser
├─ Static HTML/CSS/ES modules
├─ Cesium Earth scene
├─ Three.js Aetherus scene
├─ localStorage/session state
└─ Service worker: shell 중심, Aetherus offline pack 아님

Static origin
├─ prototype/data/*.json
├─ prototype/space/**/* media
└─ application assets

Server-side
├─ aws/*/handler.py collectors
└─ prototype/supabase/functions/*/index.ts
```

현재 별도 Aetherus API 서버, 이벤트 버스, 지식 그래프 DB, 벡터 DB, 원격 관측소 gateway는 없다.

### 4.3 Level 3 — Aetherus Components

```text
main.js / menu action / limited URL state
                  |
                  v
              cosmic3d.js
       ┌──────────┼───────────┬───────────┐
       v          v           v           v
 celestial   space-photos  spacecraft  milky-way /
 bodies JSON    JSON          JSON      solar-motion
       |
       v
  kepler.js + texture assets

Earth scene registry ──> skyphotos.js ──> same HST/JWST photo domain
```

사진 도메인이 Earth sky layer와 Aetherus atlas에 동시에 노출되어 있다. 확정 방향은 Aetherus가 주 소유자가 되는 것이므로, 기능 삭제가 아니라 링크·상태 보존과 회귀 검증을 포함한 소유권 이동이 필요하다.

### 4.4 Deployment

```text
local source
   | no build
   v
aws s3 cp --content-type <exact MIME>
   v
S3 static origin
   v
CloudFront invalidation
   v
earthus.net live hash/content-type/smoke validation
```

PR-00은 이 경로를 실행하지 않는다.

## 5. 데이터 계약 현실

| 데이터 | 현재 소비 | 계약 상태 | 주요 공백 |
|---|---|---|---|
| `space-photos.json` | 활성 | 50건, credit/license/dateKind 보유 | 명시적 최상위 schemaVersion 없음 |
| `celestial-bodies.json` | 활성 | version 1, 태양 포함 9건 | 권리·frame·unit·time 메타가 항목별 실행 계약으로 정규화되지 않음 |
| `cosmic-spacecraft.json` | 활성 | 4건, source/credit/method 보유 | schemaVersion 없음 |
| `milky-way-structure.json` | 활성 | schema 보유 | 표현 정확도 tier와 단위 계약을 중앙 타입으로 공유하지 않음 |
| `solar-motion.json` | 활성 | schema 보유 | provenance 타입이 다른 카탈로그와 통일되지 않음 |
| `probes.json` | 비활성 | 로컬 2건 | 운영 403, 활성 계약으로 간주하면 안 됨 |

현재 라이선스 근거는 다음 수준이다.

- Three.js: `prototype/vendor/three-r184-LICENSE.txt`에 MIT 라이선스 보존
- 행성 텍스처: `prototype/space/planets/README.md`에 Solar System Scope CC BY 4.0 및 NASA/JPL/USGS 출처 기록
- HST/JWST 사진: 항목별 credit/license/dateKind 존재, 검증기가 확인
- 천체 카탈로그: `source`와 `sourceUrl`은 있으나 텍스처 권리 정보가 항목별 machine-readable 필드로 연결되지 않음

따라서 “문서에 출처가 있음”과 “각 자산이 배포 전에 자동 차단 가능한 실행 계약을 가짐”을 구분해야 한다.

## 6. 최종 설계서 대비 구현 분류

### 6.1 구현됨

- EARTHUS 안의 Aetherus 진입과 Three.js 우주 탐색
- 태양계 천체·은하수 구조·태양 운동·우주선·HST/JWST 사진의 정적 데이터 소비
- 실제 관측/공개 데이터의 출처와 제한 고지 일부
- Kepler 기반 행성 위치와 기준 데이터 교차검증 도구
- 발열 방지를 위한 render ownership/cancellation 원칙
- S3/CloudFront 무빌드 배포와 운영 hash/content-type 확인 방식

### 6.2 부분 구현

| 설계 영역 | 현재 기반 | 부족한 계약 |
|---|---|---|
| Identity/Consent/Entitlement | Supabase와 기존 결제/관리 흐름 | Aetherus 기능별 consent/entitlement 정책 |
| Universe Catalog | 여러 JSON 카탈로그 | 중앙 schema version, type guard, migration, stable ID 정책 |
| Provenance/Rights | 출처·credit·license 일부 | 공통 provenance enum, rights gate, 날짜 의미 정규화 |
| Time/Coordinate | Kepler와 장면 좌표 | UTC/TT/TDB, frame/unit 명시, precision tier와 error budget |
| Ephemeris | 행성 근사 계산·검증 | 공식 reference fixture, body/time별 허용 오차, 고정밀 경로 |
| Route/Share | `space`, `solar`, `ocean`, `dive` 일부 | target/photo/craft/카메라 상태 codec과 복원 |
| Offline | shell 중심 service worker | 관측 pack, 데이터 freshness, sync/conflict 정책 |
| Search/AI | 규칙 기반 ask router와 키워드 검색 | semantic retrieval, Aetherus context/memory/orchestration/eval |

### 6.3 미구현

- Observation planner와 관측 가능성/날씨/지평선 결합
- Observation session 상태 머신과 capture/review/archive/cloud
- Sky AR, 센서 calibration, gyro drift 관리, 안전 UX
- Astrometry/plate solving과 품질/실패 진단
- Local horizon, light pollution, local sky model
- Pixel scale, mosaic, meridian flip 등 천체사진 계산 엔진
- Equipment compatibility graph와 장비 프로필
- Mission replay와 설명 가능한 simulation
- Personal Universe, community, reputation, citizen science, scientific moderation
- AI intent/context/memory/orchestrator/agent/model routing/action guardrail/golden eval
- Semantic Universe Search
- Plugin SDK, marketplace, public API platform
- Remote observatory protocol과 `READ → PLAN → PROPOSE → EXECUTE → AUTOMATE` 권한 단계
- Aetherus 전용 SLA/SLO, FinOps, hot/warm/cold 데이터 생명주기

## 7. 발견된 충돌과 결정 필요 사항

| ID | 충돌/공백 | 영향 | PR-00 판정 |
|---|---|---|---|
| GAP-001 | 천체 카탈로그는 태양 포함 9개, 검증기는 8개 기대 | 기준 검증 실패 | 검증기가 오래됨. 태양과 텍스처 검사를 포함하도록 수정 |
| GAP-002 | 문서상 Lambda 54개, 실제 63개 | C4/운영 범위 오판 | 실제 수량을 기준으로 문서 정정 |
| GAP-003 | 문서상 Supabase 경로와 실제 경로 차이 | 잘못된 구현 위치 | `prototype/supabase/functions`가 현재 진실 |
| GAP-004 | HST/JWST가 Earth layer와 Aetherus atlas에 중복 | 정보 구조·상태·성능 중복 | Aetherus 소유권 이동 ADR 필요 |
| GAP-005 | URL은 일부 모드만 복원 | 공유·뒤로가기·세션 복구 불완전 | PR-01 route-state 계약 후보 |
| GAP-006 | `probes.json`은 로컬에만 있고 운영 403 | 죽은 계약을 활성으로 오인 | 레거시 분류, 삭제는 별도 ADR |
| GAP-007 | schemaVersion/provenance/rights 형식이 카탈로그마다 다름 | migration·자동 권리 차단 불가 | PR-01 중앙 계약 후보 |
| GAP-008 | 설계서의 서비스/이벤트가 실제 서버처럼 읽힐 수 있음 | 과잉 아키텍처 위험 | 현재는 로컬 모듈·함수 호출·정적 JSON 우선 |
| GAP-009 | service worker가 관측 offline pack이 아님 | 오프라인 신뢰·freshness 부족 | Observation vertical slice 이후 설계 |
| GAP-010 | HST/JWST의 현재 날짜는 주로 release date | 관측 시각 오해 가능 | dateKind를 화면과 공통 계약에서 강제 |

## 8. 검증 증거

PR-00 최초 실행에서 6개 검증기 중 5개가 통과했고 `verify_celestial_bodies.py`만 실패했다.

```text
PASS validate_catalogs.py:
  space-photos=50, sea-life=41, trenches=10, ocean-comparisons=2,
  sat-aliases=8, obis-cells=13, probes=2

PASS verify_kepler.py:
  8 planets × 4 dates
  worst planetary separation=0.1436° (Saturn, 2000-01-01)
  Voyager 1 error=0.000643 AU, Voyager 2 error=0.000623 AU

FAIL verify_celestial_bodies.py before PR-00 correction:
  AssertionError: 천체 목록 불일치: {'sun'}

PASS verify_cosmic_photos.py:
  HST=1, JWST=49

PASS verify_cosmic_spacecraft.py
PASS verify_solar_motion.py
```

실패 원인 증거:

1. `celestial-bodies.json`에 태양이 존재한다.
2. `cosmic3d.js`의 `BODY_ORDER`, raycast/select 흐름, texture 로더가 태양을 실제로 소비한다.
3. 커밋 `a01b122fa5d4fe409f10296201f82d222c2499c7`에서 태양 카탈로그·선택 UI·텍스처를 의도적으로 추가했다.
4. 검증기는 그 이전 커밋의 8개 목록을 유지했다.

따라서 태양을 제거하지 않고 검증기를 9개 계약으로 올리는 것이 정답이다. 수정 후 태양의 카탈로그 항목, 표면 출처, small/detail 텍스처 존재까지 검사한다.

수정 후 6개 검증기를 같은 조건으로 다시 실행했으며 모두 통과했다. 활성 Aetherus ES 모듈 10개도 저장소 규칙에 따라 `.mjs`로 복사한 뒤 `node --check`를 통과했다. 제품 JS와 운영 데이터는 변경하지 않았다.

## 9. Provider·라이선스·외부 의존성 미확정 목록

1. 행성 텍스처 권리가 README 수준을 넘어 항목별 배포 gate로 연결되지 않았다.
2. JPL Horizons 실시간 교차검증은 네트워크 가용성에 좌우된다. CI에는 출처·취득 시각·허용 오차를 포함한 기록 fixture가 필요하다.
3. HST/JWST는 관측 시각과 공개 시각이 다를 수 있다. 현재 `dateKind`를 모든 UI와 export 계약에서 강제하지 않는다.
4. Sky AR 센서, light-pollution 지도, plate-solving catalog, 장비 제조사 API는 아직 선정·약관·비용·rate limit 검토가 끝나지 않았다.
5. Remote Observatory는 장비별 안전 protocol, 사람 승인, 비상 중지, 감사 로그가 없으므로 제어 호출을 만들면 안 된다.
6. AI model/provider는 routing, retention, 개인정보, 비용 상한, 평가 gate가 확정되기 전 단일 공급자에 결합하지 않는다.

## 10. ADR 후보

| ADR | 결정 주제 | 권고 기본값 |
|---|---|---|
| ADR-016 | 활성 `cosmic3d`와 레거시 우주 모듈의 경계 | 소비 그래프에 없는 모듈은 deprecated로 표시하고 즉시 삭제하지 않음 |
| ADR-017 | 실행 가능한 미디어 권리 계약 | 자산별 license/credit/source/dateKind 누락 시 publication 차단 |
| ADR-018 | Aetherus route-state codec | 기존 query key를 보존하며 versioned decode/encode 도입 |
| ADR-019 | 카탈로그 schema versioning | 활성 JSON부터 점진 도입, 한 번에 DB로 이동하지 않음 |
| ADR-020 | HST/JWST 정보 구조 소유권 | Aetherus가 canonical owner, Earth layer는 호환 deep link 후 단계적 제거 |
| ADR-021 | 로컬 이벤트와 도메인 이벤트 | 현재는 typed local event, 서버 이벤트 버스는 실제 소비자가 생길 때 도입 |
| ADR-022 | Precision tier | Explorer/Observation/Astrophotography/Scientific별 오차·출처·실패 기준 고정 |
| ADR-023 | Offline/Sync | 관측 세션을 local-first로 저장하고 서버 동기화는 명시적 충돌 정책 뒤 도입 |

## 11. 첫 수직 슬라이스와 PR 계획

### PR-00 — Repository Reality & Verification Baseline (현재)

- 이 문서 추가
- 오래된 천체 검증 계약을 태양 포함 9개로 수정
- 제품 코드·데이터·운영 배포 없음
- 모든 기존 검증기와 활성 JS 문법 검사

### PR-01 — Foundation Contracts (2026-08-16 gate 확인 후)

목표는 UI 변경이 아니라 **현재 활성 모듈이 함께 소비하는 작고 버전된 계약**이다.

1. 활성 5개 카탈로그의 schemaVersion, stable ID, provenance, rights, time semantics 최소 계약 정의
2. 기존 JSON을 읽는 runtime type guard와 실패 메시지 추가
3. `space/solar/target/photo/craft`를 보존하는 versioned route encode/decode 추가
4. 현재 동작을 고정하는 fixture·unit test 추가
5. 서버·DB·이벤트 버스·신규 endpoint 없음
6. 기존 EARTHUS와 Aetherus 화면의 visual/behavior drift 없음

PR-01 종료 조건:

- 기존 카탈로그 100%가 guard를 통과한다.
- 누락된 source/license/dateKind/schema는 명시적으로 실패하거나 허용된 legacy 상태로 분류된다.
- 기존 URL은 그대로 열리고 새 route는 round-trip 된다.
- Aetherus 비활성 시 렌더·timer·network activity가 증가하지 않는다.
- 배포 전 로컬 검증과 실제 브라우저 회귀가 모두 통과한다.

### PR-02 — Astronomy Vertical Slice

한 위치·한 시각·한 대상을 끝까지 연결한다.

```text
target + observer location + UTC
  → coordinate/time normalization
  → ephemeris with precision tier
  → visibility result + error budget + provenance
  → existing explorer presentation
  → recorded official/JPL comparison fixture
```

첫 대상은 현재 `kepler.js`가 지원하는 행성 중 하나로 제한한다. JPL/공식 기준과 허용 오차를 명시하고, 결과가 precision tier를 넘으면 숫자를 숨기거나 낮은 정밀도로 표시한다.

### 후속 순서

1. PR-03 Observation Planner
2. PR-04 Local Observation Session + Offline/Sync 계약
3. PR-05 Sky AR calibration vertical slice
4. PR-06 Astrometry/Plate Solving
5. PR-07 Equipment Compatibility
6. PR-08 Personal Universe/Community
7. PR-09 AI Orchestrator/Evals
8. PR-10 SDK/API/Remote Observatory — 안전·권리·비용 gate 뒤

## 12. 검증·배포·롤백 계약

### 모든 PR 공통

1. 변경 전 `git status`와 HEAD 기록
2. 사용자 변경 파일 제외, 작업 hunk만 선택
3. 관련 Python 검증기 실행
4. 변경된 JS를 `/tmp/*.mjs`로 복사하여 `node --check`
5. 실제 브라우저에서 zoom/layer/region/조합과 idle/released-layer 렌더 확인
6. 배포가 필요한 PR만 정확한 Content-Type으로 S3 업로드
7. CloudFront 무효화 후 live hash/content-type/signed-in flow 확인
8. 회귀 시 이전 객체로 복구하고 재무효화

### PR-00 특례

- 문서와 검증기만 변경하므로 브라우저·배포 단계는 해당 없음
- `docs/EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md`의 사용자 변경은 건드리지 않음
- 테스트가 모두 통과해도 제품 구현 허가로 해석하지 않음

## 13. Codex 작업 규칙

1. 매 작업 시작 시 `docs/HANDOVER.md`를 가장 먼저 읽는다.
2. 최종 Word 설계서는 방향과 계약의 목표이며, 현재 구현 사실은 저장소와 검증 결과로 확정한다.
3. 불일치가 있으면 조용히 한쪽을 선택하지 않고 이 원장이나 ADR에 남긴다.
4. 기능 이름만 만들지 않는다. 각 엔진은 responsibilities, inputs/outputs, interface, data model, event flow, failure/retry/cache/offline, security, test, KPI, cost, future extension을 종료 조건에 포함한다.
5. 실측하지 않은 정확도·SLA·비용·라이선스 적합성을 완료로 표시하지 않는다.
6. 실제 관측, 계산, 재구성, 시뮬레이션, AI 생성, 사용자 콘텐츠를 UI와 export에서 구분한다.
7. 물리 장비 제어는 `READ → PLAN → PROPOSE → EXECUTE → AUTOMATE`보다 앞서가지 않는다.
8. 판매·결제·SNS 게시·운영 배포는 해당 작업의 명시적 범위와 검증 gate가 있을 때만 실행한다.

## 14. PR-00 종료 판정

다음 증거가 모두 확보되면 PR-00을 완료로 본다.

- [x] 저장소 수량·활성 모듈·배포 구조 실사
- [x] 현재 C4 System/Container/Component/Deployment 기록
- [x] dirty-state 원장과 사용자 변경 보존
- [x] 6개 검증기 최초 결과 기록
- [x] 유일한 실패의 원인과 canonical 방향 증명
- [x] provider/license unknown과 ADR 후보 기록
- [x] 첫 수직 슬라이스와 단계별 PR 순서 정의
- [x] 수정 후 6개 검증기 전체 재실행
- [x] 활성 Aetherus JS 문법 검사
- [x] 작업 파일만 선택 커밋
