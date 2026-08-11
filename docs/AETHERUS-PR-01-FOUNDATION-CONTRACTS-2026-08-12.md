# AETHERUS PR-01 — Foundation Contracts & Restorable Routes

> 기준일: 2026-08-12 (Asia/Seoul)
> 선행 기준: `docs/AETHERUS-PR-00-REPOSITORY-REALITY-2026-08-12.md`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx`
> 착수 조건: 제품 책임자가 2026-08-12 사용량 초기화 완료를 확인하고 구현 시작을 승인함

## 0. 결론

PR-01은 Aetherus의 첫 실행 기반을 **새 서버나 DB 없이 현재 정적 웹 구조 안에** 추가한다. 활성 우주 카탈로그 5개에 버전·출처 유형·시간 의미·권리 계약을 부여하고, 브라우저에서 계약 위반 데이터를 사용하기 전에 차단한다. 또한 태양계 천체, 우주선, HST/JWST 사진과 은하 장면을 URL로 복원할 수 있게 하되 기존 `?solar=1`, `?space=milkyway|galaxies` 링크를 계속 받아들인다.

화면 디자인과 탐색 동작은 유지한다. 구현 중 발견한 비동기 장면 진입 경쟁 조건을 제거해, 주소가 화성을 지시해도 뒤늦게 실행된 기본 태양계 이동이 상세 화면을 닫는 문제를 함께 해결했다.

## 1. 범위와 비범위

### 구현 범위

- 활성 카탈로그 5개의 공통 `schema`와 `contract`
- provenance, time semantics, rights/license의 실행 시점 검증
- 중복 ID, 필수 필드, 단위·좌표·출처 URL·양수 범위 검증
- 기존 링크 호환을 포함한 버전 1 Aetherus route codec
- 천체·우주선·사진 상세 화면의 직접 진입과 복원
- URL 상태와 실제 화면 상태의 양방향 동기화
- 정상·오류·충돌·round-trip 계약 테스트
- 실제 브라우저 상세 복원, 지구 귀환, 유휴 렌더 회귀검사

### 이번 PR의 비범위

- 서버 API, DB, 이벤트 버스, 사용자 계정, 클라우드 동기화
- Observation Planner/Session, Sky AR, plate solving, 장비 호환성
- 권리 메타데이터 관리 UI나 법률 판단 자동화
- 우주 사진의 Earth 레이어 제거 또는 정보 구조 변경
- 카메라 위치·줌·애니메이션 진행률의 URL 직렬화

## 2. 데이터 계약

### 2.1 공통 봉투

```text
CatalogDocument
├─ schema: stable schema identifier ending in .v1
├─ schemaVersion: integer migration boundary
├─ contract
│  ├─ provenance | provenanceByType
│  ├─ timeSemantics
│  └─ rights | assetRights | item-level rights
└─ domain payload
```

활성 계약은 다음과 같다.

| 카탈로그 | schema | provenance | 시간 의미 | 권리 위치 |
|---|---|---|---|---|
| 우주 사진 | `earthus.space-photos.v1` | `observation` | 항목별 `dateKind` | 항목별 credit/license/source |
| 천체 | `earthus.celestial-bodies.v1` | `reconstruction` | 대표 표면, 위치 계산은 별도 Kepler 엔진 | `assetRights` |
| 우주선 | `earthus.cosmic-spacecraft.v1` | type별 `reconstruction`/`calculated` | 기준 epoch + 런타임 UTC | 계약 및 항목 source/credit |
| 은하수 구조 | `earthus.milky-way-structure.v1` | `reconstruction` | source-list, 실시간 관측 아님 | 최상위 source 목록 |
| 태양 운동 | `earthus.solar-motion.v1` | `simulation` | 모델 기준과 런타임 시간 | 최상위 source |

`observation`, `calculated`, `reconstruction`, `simulation`을 서로 바꿔 표시할 수 없다. 특히 HST/JWST의 `release` 날짜는 관측 시각이 아니며 화면에서도 그 의미를 유지해야 한다.

### 2.2 런타임 경계

```text
fetch JSON
   ↓
parse
   ↓
assertAetherusCatalog(catalogName, document)
   ├─ valid   → renderer/scene에 전달
   └─ invalid → typed error + 기존 오류 UI, 렌더 금지
```

검증 오류는 `AetherusCatalogContractError`로 통일하며 `code`, `catalog`, `path`를 가진다. 현재 오류는 사용자에게 기존 로드 실패 UI로 안전하게 축약되고, 개발 콘솔에는 실패 지점이 남는다. 자동 재시도는 하지 않는다. 정적 계약 위반은 같은 응답을 다시 받아도 회복되지 않으며 무한 요청과 렌더를 만들 수 있기 때문이다.

### 2.3 권리 근거와 한계

- Solar System Scope 텍스처는 배포 원본의 README와 공급자 페이지가 명시한 CC BY 4.0을 항목별 `assetRights`로 연결한다.
- NASA/JPL 자산은 각 공식 사용 정책과 원본 credit을 함께 연결한다.
- machine-readable 필드는 법률 판단을 대신하지 않는다. 출처가 제3자 권리를 별도로 표시하면 그 제한이 우선이며, 로고·인물·보증으로 오인될 표현은 별도 검토 대상이다.

## 3. URL 계약

### 3.1 정규형

```text
?aetherus=1&solar=1
?aetherus=1&solar=1&target=mars
?aetherus=1&solar=1&craft=voyager-1
?aetherus=1&solar=1&photo=southern-ring-jwst
?aetherus=1&space=milkyway
?aetherus=1&space=galaxies
```

`target`, `craft`, `photo`는 서로 배타적이다. 둘 이상이 들어오면 상세 선택을 폐기하고 안전한 상위 장면만 연다. 지원하지 않는 버전도 상세 선택을 적용하지 않는다.

### 3.2 하위 호환

기존 `?solar=1`, `?space=milkyway`, `?space=galaxies`는 계속 해석한다. 장면이 정상적으로 열린 뒤 `history.replaceState`로 `aetherus=1`을 추가해 정규화하며, 다른 기능의 query parameter와 hash는 보존한다. 지구로 돌아오면 Aetherus가 소유한 parameter만 제거한다.

### 3.3 복원 순서

```text
decode URL
  ↓
open base scene
  ↓
await async scene activation
  ↓
restore target/photo/craft
  ↓
canonicalize URL
```

상세 복원은 장면 활성화 완료를 반드시 기다린다. 이 순서가 없으면 기본 장면 이동의 완료 콜백이 복원된 상세 화면을 다시 닫을 수 있다.

## 4. 실패·캐시·오프라인·보안

| 관심사 | PR-01 결정 |
|---|---|
| 잘못된 JSON | 사용 전에 차단하고 기존 로드 실패 UI 표시 |
| 중복/없는 ID | 전체 카탈로그 계약 실패; 모호한 대상을 렌더하지 않음 |
| 충돌 URL | 상세 선택을 폐기하고 상위 장면으로 축소 |
| 없는 상세 ID | 상위 장면은 유지하고 URL에서 잘못된 상세 상태 제거 |
| retry | 계약 위반 자동 재시도 없음; 네트워크 캐시는 브라우저/CloudFront 정책 유지 |
| cache | schema identifier를 캐시 무효화와 migration 판단의 기준으로 사용 |
| offline | 기존 정적 캐시 범위만 지원; Observation Offline Pack은 후속 범위 |
| input security | 허용된 route key와 정규화된 stable ID만 사용; URL 문자열을 HTML로 삽입하지 않음 |
| privacy | 개인·위치·장비 데이터 추가 없음 |
| cost | 신규 서버·저장소·외부 호출 없음; 초기 JSON 검증의 선형 CPU 비용만 추가 |

## 5. 테스트와 합격 기준

### 5.1 자동 계약 테스트

`node tools/test_aetherus_foundation.mjs`

검증 항목:

- 실제 카탈로그 5개 모두 통과
- 사진 license 누락 차단
- 태양 asset rights 누락 차단
- 잘못된 schema 차단
- 잘못된 schemaVersion 차단
- 레거시 URL 해석
- target 정규형과 encode/decode round-trip
- 상세 키 충돌과 미지원 버전의 안전한 축소
- 다른 query/hash 보존
- Aetherus 상태 제거

### 5.2 기존 데이터·정확도 회귀

```text
PASS: populated catalogs
PASS: 8 planets × 4 dates, worst angular error 0.1436°
PASS: Voyager reconstruction fixtures
PASS: 9 celestial bodies including Sun
PASS: 50 space photos
PASS: 4 spacecraft
PASS: solar-motion model
PASS: changed browser module syntax
```

### 5.3 로컬 실제 브라우저 회귀

```text
PASS: Mars direct URL → 화성 상세 복원
PASS: Voyager 1 direct URL → 보이저 1 상세 복원
PASS: JWST photo direct URL → southern-ring-jwst 상세 복원
PASS: legacy ?solar=1 → canonical versioned URL
PASS: Earth return → Aetherus parameters removed
PASS: idle render count 6 → 6
PASS: no page errors or console errors
```

### 5.4 실서비스 브라우저 회귀

CloudFront 반영 후 `https://earthus.net`에서 새 브라우저 프로필로 다시 검사했다. 첫 방문 코치마크를 사용자가 누르는 것과 같은 방식으로 정상 종료한 뒤 다음 결과를 얻었다.

```text
PASS LIVE: Mars, Voyager 1, JWST photo, legacy URL, Earth exit
PASS LIVE: idle render count 5 → 5
PASS LIVE: no page errors or console errors
```

## 6. 성능·관측성·KPI

- 계약 검증은 문서당 1회, 항목 수에 선형이며 현재 최대 50건이다.
- 새 animation loop, timer, polling, 서버 로그, 원격 telemetry는 추가하지 않는다.
- 핵심 KPI는 `catalog contract pass rate`, `route restore success`, `invalid route safe fallback`, `idle render delta = 0`이다.
- 운영 오류 분석은 현재 브라우저 오류와 배포 hash/content-type 검증을 사용한다. 원격 관측성 도입은 개인정보·비용·보존 기간을 함께 결정하는 후속 ADR이 필요하다.

## 7. 변경 파일과 배포 경계

### 런타임/데이터

- `prototype/js/space/contracts.js`
- `prototype/js/space/route-state.js`
- `prototype/js/space/cosmic3d.js`
- `prototype/js/space/skyphotos.js`
- `prototype/js/layers/registry.js`
- `prototype/js/main.js`
- `prototype/index.html`
- `prototype/data/space-photos.json`
- `prototype/data/celestial-bodies.json`
- `prototype/data/cosmic-spacecraft.json`
- `prototype/data/milky-way-structure.json`
- `prototype/data/solar-motion.json`

### 검증/문서

- `tools/test_aetherus_foundation.mjs`
- 이 문서

배포는 런타임/데이터 파일만 `app/` prefix에 정확한 MIME으로 올리고, 변경 경로만 CloudFront 무효화한다. 문서와 로컬 테스트 도구는 운영 정적 원본에 배포하지 않는다.

### 7.1 2026-08-12 배포 결과

- 런타임/데이터 12개 파일만 선별 배포
- CloudFront invalidations: `I42VJ8PYK0NS0X8LB0D1Q8O5QH`, `IA5HRA5HWMARMP5FZ3O6WLFNCZ`, `IENLMKKWH7O7I5RBTCK7B0LRO5`
- 공개 URL 12개 모두 로컬 파일과 byte-for-byte 일치
- HTML `text/html; charset=utf-8`
- ES module 6개 `text/javascript; charset=utf-8`
- JSON 5개 `application/json; charset=utf-8`
- 최종 schemaVersion 보강 후 실서비스 계약 로드와 화성·보이저 1·JWST·은하수 구주소 복원 재통과, idle render `9 → 9`
- 동시에 진행된 TPW 작업의 `main.js` hunk는 커밋에서 제외하고, 운영 파일을 이 PR 커밋 blob과 동일한 hash로 재확인
- 커밋과 일치시킨 운영본의 최종 브라우저 재검사도 화성·지구 귀환·보이저 1·JWST·은하수 복원과 idle render `5 → 5` 통과
- 문서, 테스트 도구, 사용자 소유 dirty 파일은 배포하지 않음

## 8. 롤백과 후속

### 롤백

이 PR의 런타임과 5개 JSON을 직전 커밋 버전으로 함께 되돌린다. `cosmic3d.js`만 되돌리고 계약이 추가된 JSON을 남기거나 그 반대로 처리하지 않는다. 파일 복구 후 같은 경로를 무효화하고 live hash/content-type/legacy URL을 다시 확인한다.

### 다음 PR

PR-02는 Observation vertical slice에 들어가기 전에 HST/JWST 도메인 소유권과 Earth 레이어 중복을 ADR로 확정한다. 제품 표면을 먼저 삭제하지 않고, Aetherus 사진 URL을 단일 공유 주소로 삼아 기존 Earth 레이어 진입을 연결할지 유지할지 실제 사용 흐름으로 결정한다.
