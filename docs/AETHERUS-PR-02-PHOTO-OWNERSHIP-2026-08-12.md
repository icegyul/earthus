# AETHERUS PR-02 — Photo Ownership, Gallery & Compatibility Routes

> 기준일: 2026-08-12 (Asia/Seoul)
> 선행 기준: `docs/AETHERUS-PR-01-FOUNDATION-CONTRACTS-2026-08-12.md`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx`

## 0. 결론

HST와 JWST 공식 사진의 제품 소유자는 Aetherus다. Earthus 지구 레이어는 오로라와 일식만 유지하고, HST/JWST 사진을 더 이상 레이어로 등록·로드·토글하지 않는다. 기존 검색어와 기존 `photo=hst|jwst` 주소는 삭제하지 않고 Aetherus의 단일 `우주 사진관`으로 연결한다.

사진 자체가 1차 경험이며 적경·적위 3D 표식은 위치 보조다. 사진관은 공식 미리보기, 크레딧, 공개일, 라이선스, 공식 원본 링크를 함께 보여 주고 `전체/HST/JWST` 필터와 선택 사진을 URL로 복원한다. 카탈로그나 개별 미리보기 실패 시 검증되지 않은 대체 이미지를 표시하지 않는다.

## 1. 결정과 소유권 경계

### 1.1 활성 표면

```text
Aetherus
└─ 우주 사진관 (single owner)
   ├─ 공식 사진·크레딧·공개일·라이선스
   ├─ 전체 / HST / JWST 필터
   ├─ 선택 사진 공유 URL
   └─ 적경·적위 3D 위치 보조

Earthus
└─ 하늘
   ├─ 오로라
   └─ 일식
```

`hst`, `jwst` Earth 레이어 정의와 registry loader는 활성 코드에서 제거한다. `skyphotos.js`는 즉시 롤백이나 남은 외부 import를 위한 legacy adapter로만 남고, 독자 fetch나 Earth 레이어 등록을 하지 않는다.

### 1.2 카탈로그 계약

`space-photos.json` 계약은 다음 소유권을 명시한다.

```json
{
  "owner": "aetherus",
  "surfaces": ["photo-gallery", "sky-position"]
}
```

계약 검증은 owner가 `aetherus`인지, 두 표면이 모두 선언됐는지 확인한다. UI는 `photo-catalog.js`의 한 로더만 사용한다. 병렬 소비자는 같은 Promise를 공유하고, 실패한 Promise는 버려 사용자가 재시도할 수 있게 한다.

## 2. 사용자 흐름과 하위 호환

### 2.1 메뉴와 검색

- Aetherus 메뉴의 `허블 우주망원경`, `제임스 웹` 두 항목을 `우주 사진관` 하나로 합친다.
- 검색어 `허블`, `HST`, `제임스웹`, `JWST`, `우주 사진`은 `Aetherus` 태그 결과를 낸다.
- 검색 결과 선택은 Earth 레이어를 켜지 않고 Aetherus 장면으로 전환한 뒤 해당 망원경 필터를 연다.
- 검색에서 위성의 현재 위치를 찾는 `허블 우주망원경` 결과는 별도 위성 결과로 유지한다. 사진과 궤도 위치의 의미를 섞지 않는다.

### 2.2 URL 문법

```text
?aetherus=1&solar=1&telescope=all
?aetherus=1&solar=1&telescope=hst
?aetherus=1&solar=1&telescope=jwst
?aetherus=1&solar=1&telescope=jwst&photo=southern-ring-jwst
```

`telescope` 허용값은 `all|hst|jwst`다. `photo`와 `telescope`는 함께 사용할 수 있지만 선택 사진이 필터와 충돌하면 사진의 실제 망원경으로 정규화한다. `telescope`는 `target` 또는 `craft`와 함께 사용할 수 없다.

레거시 `photo=hst`와 `photo=jwst`는 각각 HST/JWST 필터로 해석한다. 다른 기능의 query parameter와 hash는 보존하며 사진관을 닫으면 `photo`와 `telescope`만 제거한다.

### 2.3 복원 순서

```text
decode route
  ↓
activate Aetherus base scene
  ↓
await scene activation
  ↓
open gallery through the single catalogue loader
  ↓
resolve filter/photo conflict
  ↓
canonicalize URL
```

Earthus 검색에서 장면을 처음 열 때도 활성화 Promise를 기다린다. 늦게 끝난 기본 3D 이동이 이미 열린 사진관을 닫는 경쟁 조건을 허용하지 않는다.

## 3. 화면 계약

### 데스크톱

- 사진 패널 폭 `min(56vw, 760px)`, 좌우 전역 스크롤 없음
- 큰 `object-fit: contain` 공식 미리보기
- 본문 12.5px 이상, 필터 터치 높이 44px
- 가로 썸네일 목록과 선택 상태
- 3D 표식은 망원경별 색상 분류 대신 동일한 보조색 사용

### 모바일 390×844

- 사진 패널은 좌우 0, 하단 0인 전폭 bottom sheet
- 본문 12px 이상, 필터 44px
- 사진 모드의 중앙 HUD와 Earthus/Aetherus 손잡이는 본문을 가리지 않음
- `← 3D 우주`로 사진관을 닫으면 브랜드 손잡이가 즉시 복구됨
- 지구 전용 로딩 토스트와 첫 방문 코치마크는 우주 장면을 덮지 않음

## 4. 입력·출력·상태 흐름

### 입력

- Aetherus 메뉴 route
- Earthus 검색 결과
- URL의 `telescope`, `photo`
- 필터 및 썸네일 선택
- 카탈로그 JSON과 공식 미리보기 응답

### 출력

- 필터별 50/1/49 사진 목록
- 선택 사진의 이미지·크레딧·공개일·라이선스·공식 링크
- 선택 필터/사진이 반영된 정규 URL
- 카탈로그 또는 미리보기의 명시적 오류 상태

### 상태 전이

```text
3D_SPACE
  └─ open(filter/photo) → PHOTO_LOADING
       ├─ contract valid → PHOTO_READY
       │    ├─ filter → PHOTO_LOADING (shared cached catalogue)
       │    ├─ select → PHOTO_READY + URL replace
       │    └─ preview error → PHOTO_READY_WITH_PREVIEW_ERROR
       └─ fetch/contract error → PHOTO_ERROR
            └─ retry → PHOTO_LOADING (failed Promise discarded)

PHOTO_READY | PHOTO_ERROR
  └─ back / Escape / Earth exit → 3D_SPACE or EARTH
```

## 5. 실패·재시도·캐시·오프라인·보안

| 관심사 | PR-02 결정 |
|---|---|
| 카탈로그 4xx/5xx | 사진·출처를 대신 만들지 않고 오류 상태와 수동 재시도 표시 |
| 계약 위반 | Aetherus catalog validator에서 사용 전 차단 |
| 개별 미리보기 실패 | 이미지 영역에 안내, 공식 원본 링크·크레딧·메타데이터 유지 |
| retry | 사용자 동작으로만 수행; 실패 Promise를 제거하고 한 번 새 요청 |
| cache | 성공 카탈로그는 페이지 생명주기 동안 공유; 필터 전환은 재요청하지 않음 |
| offline | 기존 브라우저/서비스워커 캐시만 사용; 별도 Offline Pack은 후속 범위 |
| URL 입력 | 허용 망원경과 안정 ID만 해석; 문자열을 HTML로 직접 삽입하지 않음 |
| 개인정보 | 위치·계정·장비·관측 데이터 추가 없음 |
| 비용 | 신규 API/DB/스토리지 없음; Earth 선로딩 제거로 불필요한 JSON 요청 감소 |

## 6. 테스트와 합격 기준

### 자동 계약·소유권 테스트

```text
PASS: 5 Aetherus catalogue contracts, 5 failure fixtures, and 13 route-state cases
PASS: Aetherus owns 50 photos; HST=1, JWST=49
PASS: parallel catalogue consumers share one request
PASS: a failed request can be retried
PASS: no active Earth HST/JWST config, menu item or registry loader
PASS: legacy search terms route to Aetherus
```

### 로컬 실제 브라우저

```text
PASS: direct gallery ALL=50, HST=1, JWST=49
PASS: Earth '허블' search → Aetherus HST gallery
PASS: conflicting HST filter + JWST photo → JWST canonical URL
PASS: catalogue 503 → no substitute, error/retry → 50 items restored
PASS: preview 404 → official link and credit remain
PASS: desktop 1280×844, mobile 390×844, no horizontal overflow
PASS: body 12.5px desktop / 12px mobile, filter controls 44px
PASS: hidden status, HUD, coach mark, Earth loading toast and brand tabs do not overlap content
PASS: no browser console errors on normal paths
```

### 기존 정확도 회귀

PR-01의 천체·Kepler·Voyager·사진·태양 운동 검증을 모두 다시 통과해야 한다. Earthus 레이어 전체 catalog validator와 변경 모듈 문법 검사도 release gate에 포함한다.

## 7. 성능·KPI·비용

- Earth 첫 화면에서 사진 카탈로그를 요청하지 않는다.
- 성공 카탈로그는 소비자와 필터 사이에서 한 번만 로드한다.
- 사진관은 새 animation loop, polling, timer를 만들지 않는다.
- KPI: `gallery open success`, `route restore success`, `filter count correctness`, `retry recovery`, `preview provenance retention`, `idle render delta = 0`.
- 50개 메타데이터와 이미 존재하는 썸네일만 사용하므로 신규 저장·변환·외부 API 비용은 없다.

## 8. 변경·배포 경계

### 런타임/데이터

- `prototype/index.html`
- `prototype/css/app.css`
- `prototype/js/config.js`
- `prototype/js/layerbar.js`
- `prototype/js/layers/registry.js`
- `prototype/js/main.js`
- `prototype/js/scene.js`
- `prototype/js/search.js`
- `prototype/js/space/contracts.js`
- `prototype/js/space/cosmic3d.js`
- `prototype/js/space/photo-catalog.js`
- `prototype/js/space/route-state.js`
- `prototype/js/space/skyphotos.js`
- `prototype/data/space-photos.json`

### 검증/문서

- `tools/test_aetherus_foundation.mjs`
- `tools/test_aetherus_photo_ownership.mjs`
- 이 문서

운영에는 런타임/데이터만 정확한 MIME으로 선별 배포한다. 같은 파일에 동시에 진행 중인 TPW 등 사용자 소유 hunk가 있으면 커밋된 PR-02 blob만 업로드한다.

### 8.1 2026-08-12 배포 결과

- 커밋된 런타임/데이터 14개 blob만 `app/` prefix에 선별 배포
- CloudFront invalidation: `IN959Z74SZW8BHGMSUS16C0YM`
- 공개 URL 14개 모두 최종 커밋과 SHA-256 byte-for-byte 일치
- HTML `text/html; charset=utf-8`, CSS `text/css; charset=utf-8`, JSON `application/json; charset=utf-8`, ES module `text/javascript; charset=utf-8`
- 14개 모두 `Cache-Control: no-cache`
- 실서비스 직접 URL: HST 필터와 JWST 사진 충돌을 JWST 49개 및 `southern-ring-jwst`로 정규화
- 실서비스 검색: `허블` 첫 결과가 Aetherus HST 사진관 1개와 `hubble-ultra-deep-field`를 복원
- 실서비스 390×844: 전폭 패널, 본문 12px, 필터 44px, 가로 overflow 0, HUD·코치마크·지구 토스트·브랜드 손잡이 겹침 0
- 실서비스 유휴 렌더 `5 → 5`, 정상 경로 콘솔 오류 0
- 배포 계정에는 `cloudfront:GetInvalidation` 권한이 없어 상태 API는 조회하지 못했지만, 무효화 뒤 query 없는 공개 URL 14개의 본문 hash와 Content-Type을 직접 검증함
- TPW 등 동시에 진행 중인 사용자 소유 dirty hunk와 문서·테스트 도구는 운영에 배포하지 않음

## 9. 롤백과 후속

### 롤백

이 PR의 HTML/CSS/모듈/사진 계약을 함께 이전 커밋으로 되돌리고 동일 경로를 CloudFront에서 무효화한다. Earth HST/JWST 레이어만 일부 복구하거나 새 owner 계약만 남기는 혼합 상태는 허용하지 않는다.

### 다음 PR

PR-03은 Observation vertical slice의 실제 경계를 고정한다. Planner → Session → Capture/Review → Archive 중 첫 사용자 완료 흐름과 provenance를 현재 정적 구조에서 어디까지 구현할지 repository reality와 함께 결정한다.
