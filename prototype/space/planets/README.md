# 행성 표면 텍스처 출처

이 폴더의 WebP는 Earthus 3D 구면 **시각화 전용**으로 원본 지도를 리사이즈한
파일입니다. 표면 색과 무늬는 관측 시기, 파장, 합성 방법에 따라 실제 육안 색과
다를 수 있으며 과학 분석용 래스터가 아닙니다. 특히 기체 행성 지도는 여러 관측을
합성하거나 대표 형태를 그린 전개도입니다.

## 런타임 규격

- `small/`: 512×256, 품질 76~80. 태양·행성 8개·달을 한 번만 내려받아 태양계와 상세 화면의 즉시 미리보기에 씁니다.
- `detail/`: 태양·수성·금성·달·화성·토성 4096×2048, 목성 3600×1800입니다. 공개 전구 원본이
  1K급인 천왕성·해왕성은 1024×512를 유지합니다. 선택한 천체 한 장만 로드하고 화면을
  닫거나 다른 천체를 고르면 GPU에서 즉시 해제합니다.
- `ultra/`: 수성·금성·화성 8192×4096. 화면 폭 900px 이상, GPU 최대 텍스처 8192 이상,
  브라우저가 메모리 8GB 이상으로 보고하거나 메모리 값을 제공하지 않는 데스크톱에서
  행성에 가까이 확대했을 때만 한 장을 올립니다.
  휴대폰에는 이 파일을 요청하지 않습니다.
- `saturn-ring.webp`: 4096×250 RGBA. 태양계와 토성 상세 화면이 같은 고리 질감을 공유합니다.
- 모두 2:1 등거리 원통도법(equirectangular) WebP입니다.

## 원본과 크레딧

| 파일 | 원본·설명 | 크레딧 |
| --- | --- | --- |
| `sun.webp` | [Solar System Scope Sun 표면 시각화](https://www.solarsystemscope.com/textures/); 태양의 실제 광구는 계속 변하므로 현재 관측으로 쓰지 않음 | Solar System Scope/INOVE, CC BY 4.0; 사실 설명 [NASA Sun Facts](https://science.nasa.gov/sun/facts/) |
| `mercury.webp` | [Solar System Scope 8K Mercury 시각화](https://www.solarsystemscope.com/textures/); 비교 기준은 [USGS MESSENGER 전구 모자이크](https://astrogeology.usgs.gov/search/map/mercury_messenger_mdis_basemap_enhanced_color_global_mosaic_665m) | Solar System Scope/INOVE, CC BY 4.0; 비교 자료 NASA/JHUAPL/Carnegie/USGS |
| `venus.webp` | Magellan 레이더 자료를 바탕으로 한 [Solar System Scope 8K 표면 시각화](https://www.solarsystemscope.com/textures/) | NASA/JPL, Solar System Scope/INOVE, CC BY 4.0 |
| `earth.webp` | [NASA SVS Blue Marble](https://svs.gsfc.nasa.gov/2915) | NASA/GSFC Scientific Visualization Studio, Reto Stöckli/NASA Earth Observatory |
| `moon.webp` | [NASA SVS CGI Moon Kit 2025 4K color map](https://svs.gsfc.nasa.gov/4720) | NASA/GSFC Scientific Visualization Studio, Lunar Reconnaissance Orbiter |
| `mars.webp` | [Solar System Scope 8K Mars 시각화](https://www.solarsystemscope.com/textures/); 비교 기준은 [USGS Viking 전구 색상 모자이크](https://astrogeology.usgs.gov/search/map/mars_viking_global_color_mosaic_925m) | Solar System Scope/INOVE, CC BY 4.0; 비교 자료 NASA/JPL/USGS |
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
