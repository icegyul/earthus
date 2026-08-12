# 01. Update Retrospective — 아쉬웠던 것과 드러난 공백

## 1. 천구 배경

### 해결한 문제

- 기존 파일은 1774×887 생성 이미지를 4096×2048로 확대하고 약 121KB로 압축해 고해상도
  화면에서 먼지 띠와 별이 깨졌다.
- 실제 6000×3000 전천 사진을 6K/4K 두 품질로 만들고 데스크톱 조건부 선택을 추가했다.
- ESO/S. Brunier 크레딧을 좌하단과 설정에 항상 노출했다.

### 아쉬운 점

- 파일 이름은 고정이고 query revision으로만 캐시를 분리한다. immutable 객체 이름과 manifest가 없다.
- `maximumTextureSize`, 화면 폭, 정밀 포인터, `deviceMemory`만으로 품질을 고른다. 실제 GPU 예산,
  DPR, WebGL context loss 이력, 저전력 모드, 열 상태는 반영하지 못한다.
- WebP 단일 포맷이다. KTX2/Basis 또는 GPU 압축 텍스처의 메모리·업로드 시간 비교가 없다.
- 6K/4K 파일을 수동으로 만들었다. 원본 hash, tone transform, 파생본 hash를 재현하는 빌드가 없다.
- 배경 회전은 고정 미학 값이다. 실제 천구 좌표·시간을 표현하는 과학 장면과 첫 Earth의 장식 배경이
  시스템적으로 분리돼 있지 않다.
- 라이선스 표시는 구현됐지만 전체 미디어 자산을 한곳에서 감사하는 registry가 없다.

### 다음에 더 하고 싶은 것

- `sky-asset-manifest.v1.json`과 재현 가능한 파생본 생성기
- 장식 천구와 AETHERUS 과학 천구의 명시적 모드 분리
- GPU capability/메모리/열 기반 quality profile
- context loss 시 즉시 4K 또는 정적 저해상도 폴백
- 모바일에서 천구 대비를 낮추는 접근성·배터리 옵션

## 2. NOAA GMGSI 구름 그림자

### 해결한 문제

- 서버가 제공한 구름 알파를 다시 탐지하지 않고 그대로 사용했다.
- 관측 시각 태양 방향으로 낮 면에만 그림자를 투영했다.
- 1/4 해상도 마스크, 관측 갱신 때 한 번만 생성, 별도 렌더 루프 없음으로 제한했다.

### 아쉬운 점

- `VISUAL_CLOUD_HEIGHT_M=12km`는 시각 오프셋을 위한 고정 대표값이며 실제 높이 관측이 아니다.
- 위도·태양고도에 따라 최대 shift를 자르므로 일출/일몰 부근의 모양이 물리 모델과 다르다.
- 그림자 품질·강도는 사용자 화면 기준으로 정했으며 과학적 검증값이 아니다.
- 캔버스 마스크 생성 시간이 실기기별로 계측되지 않았다.
- GMGSI 포맷 변경 감지 계약은 있으나 시각 효과 schema/version은 없다.

### 다음에 더 하고 싶은 것

- UI에 “구름 입체감: 시각 효과” 접근 가능한 설명과 끄기 옵션
- 실제 cloud-top-height 공급자가 승인될 때만 높이 기반 모델을 별도 experimental mode로 추가
- NOAA 입력 크기·format·alpha 분포 이상을 자동 차단하는 ingest contract test

## 3. 천리안2A

### 해결한 문제

- 실제 산출물이 `gray+alpha`임을 확인하고 기존 알파만 깊이 마스크로 재사용했다.
- 가시광은 채널 관측시각의 태양 방향, 적외/야간 하층운은 약한 명암 분리로 구분했다.
- 수증기 채널은 구름층과 다르므로 효과 대상에서 제외했다.
- 전면/동아시아 상세/한반도 상세와 sibling layer 제거를 연결했다.

### 아쉬운 점

- 전면 1600px와 XYZ 상세가 같은 시각·tone·alpha 계약을 항상 만족하는지 자동 검사하지 않는다.
- 전면과 상세 관측시각 차이에서 시각 깊이 층도 경계가 달라질 수 있다.
- 가시광 채널이 야간에 `ok=true, signal=0`일 수 있다. readiness와 usable-at-location이 분리돼야 한다.
- 확대/축소를 반복할 때 detail sibling이 남지 않는지 30~100회 soak test가 없다.
- KMA/NMSC → NOAA 공개 경로의 권리·갱신·중단 조건을 운영 계약으로 승인하지 않았다.

### 다음에 더 하고 싶은 것

- `SatelliteFrameContract`로 `observedAt`, `channel`, `area`, `signal`, `alphaMeaning`,
  `usableDayNight`, `license`, `processingVersion`을 강제
- 전면/상세 시각 차이가 허용치를 넘으면 상세를 겹치지 않고 이유를 표시
- 한반도/일본/대만 대표 장면의 채널별 golden image

## 4. 히마와리9

### 해결한 문제

- 가시광과 적외 각각 실제 신호가 있는 최신 시각을 따로 선택했다.
- 낮 가시광과 밤 적외를 같은 빠른 레이어 안에서 전환했다.
- 적외의 의미를 강수량이 아닌 구름 꼭대기 온도로 유지했다.
- 가시광은 보수적인 밝고 무채색 화소만 시각 깊이 마스크에 사용했다.

### 아쉬운 점

- GIBS 가시광은 지표도 포함하므로 클라우드 마스크가 아니다. 현재 분류는 의도적으로 보수적이지만
  눈·밝은 사막·강한 sunglint를 구름처럼 시각 처리할 가능성이 있다.
- 적외 타일의 색 팔레트와 threshold 변경이 감지되지 않으면 마스크가 달라질 수 있다.
- 동일 provider를 본체와 깊이 층이 각각 요청한다. 브라우저 캐시가 있어도 요청 promise dedupe가 없다.
- 타일 안에서 offset을 적용해 경계에서 미세 seam이 생길 수 있다.
- CORS canvas 실패 시 투명 폴백하지만 사용자·관측 로그에는 원인이 남지 않는다.

### 다음에 더 하고 싶은 것

- 공식 또는 승인된 cloud mask가 있을 때 가시광 shadow source로 교체
- shared tile promise cache와 bounded LRU
- 인접 타일 gutter를 포함하는 Web Worker/OffscreenCanvas 처리
- CORS/tainted canvas/decoding failure telemetry

## 5. 공통 성능·운영

### 이번에 보인 구조적 문제

- 같은 ES module을 query가 있는 URL과 없는 URL로 import하면 singleton이 둘로 갈라질 수 있다.
  모든 import specifier를 한 revision으로 통일해야 한다.
- 시각 sibling layer는 원본 레이어와 별개 Cesium 객체다. 생명주기를 그룹으로 다루지 않으면 누수된다.
- 수동 S3 배포는 정확하지만 파일 누락·MIME·invalidation path 실수 가능성이 있다.
- 로컬 브라우저 검수는 통과했으나 Safari·구형 iPhone·실제 열/배터리는 확인하지 못했다.
- 효과가 켜졌는지, 생성이 실패해 폴백했는지 운영자가 보는 계측판이 없다.

## 6. 보완 우선순위

P0:

- module specifier 단일화 자동 검사
- sibling layer lifecycle/누수 테스트
- 중복 tile request 측정 및 dedupe
- 이미지 크기·CORS·URL allowlist·CSP 보안
- 실기기 Safari/iPhone 검수

P1:

- Web Worker/OffscreenCanvas 처리
- source별 golden screenshot과 seam 기준
- quality profile과 context-loss 폴백
- 배포 manifest/rollback 자동화

P2:

- GPU 압축 천구 자산 실험
- 승인된 cloud mask/cloud-top-height 연동
- 사용자 시각 효과 강도/끄기 접근성 옵션
