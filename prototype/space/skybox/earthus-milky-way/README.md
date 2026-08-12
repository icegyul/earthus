# EARTHUS Milky Way skybox

EARTHUS 첫 지구 화면용 정적 천구 배경이다. 달이나 행성은 포함하지 않는다.

- 생성일: 2026-08-12
- 제작: OpenAI 이미지 생성 도구로 만든 EARTHUS 전용 원본
- 원본: `source-panorama.webp` (2:1 equirectangular panorama)
- 런타임: Cesium `EquirectangularPanorama`용 `panorama.webp` (4096×2048)
- 의도: 작은 별점이 균일하게 반복되던 배경 대신, 어두운 은하수 먼지 띠와 자연스러운 별 밀도 차이를 표현
- 성능: 애니메이션이나 별도 렌더 루프를 추가하지 않으며 Cesium의 기존 장면 렌더에만 포함
- 별: 관측 자료가 아닌 시각 배경이다. `20260812` 고정 시드로 생성해 실행 때마다 달라지지 않는다.

생성 프롬프트의 핵심 제약은 `Earth·Moon·planet·label·text·UI·logo·watermark 없음`,
어두운 360도 천구, 이음매 없는 좌우 경계, HUD를 방해하지 않는 제한된 밝기였다.
