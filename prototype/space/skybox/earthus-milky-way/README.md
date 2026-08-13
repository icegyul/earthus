# EARTHUS Milky Way sky panorama

EARTHUS 첫 지구 화면용 정적 천구 배경이다. 달이나 행성은 포함하지 않는다.

- 교체일: 2026-08-13
- 원본: ESO/S. Brunier, `eso0932a`, 실제 360° 전천 사진 (6000×3000)
- 공식 원본·설명: https://www.eso.org/public/images/eso0932a/
- 라이선스: CC BY 4.0. 화면 좌하단과 설정에 `ESO/S. Brunier` 크레딧과 원본 링크를 항상 표시한다.
- 데스크톱 런타임: manifest의 content-hash 6000×3000 WebP
- 일반 런타임: manifest의 content-hash 4096×2048 WebP
- 모바일·저사양 런타임: manifest의 content-hash 2048×1024 WebP
- 의도: 생성 이미지의 반복 별점이 아니라 실제 전천 사진의 은하수 먼지 띠와 자연스러운 별 밀도 차이를 표현
- 성능: 애니메이션이나 별도 렌더 루프를 추가하지 않으며 Cesium의 기존 장면 렌더에만 포함
- 선택: 실제 WebGL `MAX_TEXTURE_SIZE`와 화면·메모리·데이터 절약 신호를 함께 보고 6K/4K/2K를 고른다.

## 재현

정본 원본은 ESO 공식 `large/eso0932a.jpg` 6000×3000이며 SHA-256은
`60400c92c54b7c1bd12299c69e83b16e5b6256e7dabacc478c021758ecd28179`다.
`tools/build_sky_assets.mjs`가 원본 hash·크기·2:1 비율을 검사하고 고정 tone/resize/WebP
설정으로 세 파생본과 manifest를 만든다. `source-panorama.webp`는 2026-08-12 이전
1774×887 생성 자산을 추적하기 위한 legacy 파일이며 빌드 입력이나 런타임 파일이 아니다.

이전 파일은 1774×887 생성 원본을 4096×2048로 확대한 뒤 121KB로 강하게 압축해
레티나·4K 화면에서 별과 먼지 띠가 깨졌다. 새 파일은 픽셀 수만 늘린 업스케일이 아니다.
ESO 6000×3000 원본의 실제 디테일을 유지하며, HUD와 지구가 주인공으로 남도록
원본 전체에 고정된 감마·밝기 조정만 적용했다. 별이나 은하 구조는 생성·삭제하지 않았다.
