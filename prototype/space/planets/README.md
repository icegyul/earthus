# 행성 표면 텍스처 출처

이 폴더의 WebP는 Earthus 3D 구면 **시각화 전용**으로 원본 지도를 리사이즈한
파일입니다. 표면 색과 무늬는 관측 시기, 파장, 합성 방법에 따라 실제 육안 색과
다를 수 있으며 과학 분석용 래스터가 아닙니다. 특히 기체 행성 지도는 여러 관측을
합성하거나 대표 형태를 그린 전개도입니다.

## 런타임 규격

- `small/`: 512×256, 품질 76~78. 행성 8개와 달을 한 번만 내려받아 상세 화면의 즉시 미리보기에도 씁니다.
- `detail/`: 1024×512, 품질 82~84. 선택한 천체 한 장만 로드하고 화면을 닫을 때 GPU에서 해제합니다.
- `saturn-ring.webp`: 1024×63 RGBA. 태양계와 토성 상세 화면이 같은 고리 질감을 공유합니다.
- 모두 2:1 등거리 원통도법(equirectangular) WebP입니다.

## 원본과 크레딧

| 파일 | 원본·설명 | 크레딧 |
| --- | --- | --- |
| `mercury.webp` | [USGS MESSENGER MDIS Enhanced Color Global Mosaic](https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_enhanced_color_global_mosaic_665m) | NASA/Johns Hopkins University Applied Physics Laboratory/Carnegie Institution of Washington, USGS Astrogeology |
| `venus.webp` | [JPL Solar System Simulator Venus map](https://space.jpl.nasa.gov/tmaps/venus.html) | NASA/JPL, Magellan radar imagery |
| `earth.webp` | [NASA SVS Blue Marble](https://svs.gsfc.nasa.gov/2915) | NASA/GSFC Scientific Visualization Studio, Reto Stöckli/NASA Earth Observatory |
| `moon.webp` | [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) | NASA/GSFC Scientific Visualization Studio, Lunar Reconnaissance Orbiter |
| `mars.webp` | [NASA 3D Resources Mars](https://science.nasa.gov/3d-resources/mars/) | NASA/JPL-Caltech/USGS |
| `jupiter.webp` | [Cassini's Best Maps of Jupiter (PIA07782)](https://science.nasa.gov/photojournal/cassinis-best-maps-of-jupiter-cylindrical-map) | NASA/JPL/Space Science Institute |
| `saturn.webp` | [Solar System Scope Saturn texture](https://www.solarsystemscope.com/textures/) | Solar System Scope/INOVE, CC BY 4.0; NASA 관측 기반 시각 조정본 |
| `saturn-ring.webp` | [Solar System Scope Saturn ring texture](https://www.solarsystemscope.com/textures/) | Solar System Scope/INOVE, CC BY 4.0 |
| `uranus.webp` | [Solar System Scope Uranus texture](https://www.solarsystemscope.com/textures/) | Solar System Scope/INOVE, CC BY 4.0; 실제 관측색보다 대비·채도 조정 |
| `neptune.webp` | [JPL Solar System Simulator Neptune map](https://space.jpl.nasa.gov/tmaps/neptune.html) | NASA/JPL |

NASA 3D Resources의 공개 자산 안내, JPL Solar System Simulator의 지도별 출처·제한,
[Solar System Scope의 CC BY 4.0 조건](https://creativecommons.org/licenses/by/4.0/)을 함께 따릅니다.
Solar System Scope 지도는 실제 관측보다 채도가 높고 미관을 위해 조정됐으며, 미관측 영역을
유사 지형으로 채운 천체가 있으므로 과학 분석에 사용하지 않습니다. 원본 파일은 저장하지 않고
런타임에 필요한 리사이즈 결과만 배포합니다.
