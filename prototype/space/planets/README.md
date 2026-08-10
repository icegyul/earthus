# 행성 표면 텍스처 출처

이 폴더의 WebP는 Earthus 3D 구면 **시각화 전용**으로 원본 지도를 리사이즈한
파일입니다. 표면 색과 무늬는 관측 시기, 파장, 합성 방법에 따라 실제 육안 색과
다를 수 있으며 과학 분석용 래스터가 아닙니다. 특히 기체 행성 지도는 여러 관측을
합성하거나 대표 형태를 그린 전개도입니다.

## 런타임 규격

- `small/`: 512×256, 품질 76. 태양계에 들어온 뒤 비동기로 한 번만 로드합니다.
- `detail/`: 1024×512, 품질 82. 선택한 천체 한 장만 로드하고 화면을 닫을 때 GPU에서 해제합니다.
- 모두 2:1 등거리 원통도법(equirectangular) WebP입니다.

## 원본과 크레딧

| 파일 | 원본·설명 | 크레딧 |
| --- | --- | --- |
| `mercury.webp` | [USGS MESSENGER MDIS Enhanced Color Global Mosaic](https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_enhanced_color_global_mosaic_665m) | NASA/Johns Hopkins University Applied Physics Laboratory/Carnegie Institution of Washington, USGS Astrogeology |
| `venus.webp` | [JPL Solar System Simulator Venus map](https://space.jpl.nasa.gov/tmaps/venus.html) | NASA/JPL, Magellan radar imagery |
| `earth.webp` | [NASA SVS Blue Marble](https://svs.gsfc.nasa.gov/2915) | NASA/GSFC Scientific Visualization Studio, Reto Stöckli/NASA Earth Observatory |
| `moon.webp` | [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) | NASA/GSFC Scientific Visualization Studio, Lunar Reconnaissance Orbiter |
| `mars.webp` | [NASA 3D Resources Mars](https://science.nasa.gov/3d-resources/mars/) | NASA/JPL-Caltech/USGS |
| `jupiter.webp` | [NASA Full Jupiter Map](https://science.nasa.gov/resource/full-jupiter-map/) | NASA/JPL-Caltech/SSI |
| `saturn.webp` | [JPL Solar System Simulator Saturn map](https://space.jpl.nasa.gov/tmaps/saturn.html) | NASA/JPL |
| `uranus.webp` | [JPL Solar System Simulator Uranus map](https://space.jpl.nasa.gov/tmaps/uranus.html) | NASA/JPL |
| `neptune.webp` | [JPL Solar System Simulator Neptune map](https://space.jpl.nasa.gov/tmaps/neptune.html) | NASA/JPL |

NASA 3D Resources의 공개 자산 안내와 JPL Solar System Simulator의 지도별 출처·제한을
함께 따릅니다. 원본 파일은 저장하지 않고 런타임에 필요한 리사이즈 결과만 배포합니다.
