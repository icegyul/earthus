# EARTHUS V2 — 메뉴 마이그레이션 맵 (109행)

| 항목 | 값 |
|---|---|
| 상태 | PHASE 1 — 매핑만. 아직 아무 화면도 안 바뀜 |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `1e03eac8` |
| 행 | 109 (SCENES 109개와 1:1. 누락 0 · 초과 0 · 중복 0) |

지침서 §28: "기존 109개를 원본 목록으로 쓴다. 마이그레이션 중에 버리지 않는다." 버린 것은 없다.

## 상태 값

| 값 | 뜻 |
|---|---|
| `keep` | 그대로 하나의 현상이 된다 |
| `merge` | 다른 레이어와 함께 한 현상의 자료가 된다 |
| `rename` | 현상은 같고 이름만 짧아진다 |
| `reclassify` | lab·hobby 에서 실제 도메인으로 옮긴다 |
| `demote` | 현상이 아니다 — 배경·조작·진입점 |

| `merge` | `rename` | `reclassify` | `demote` | `keep` |
|---|---|---|---|---|
| 41 | 36 | 18 | 13 | 1 |

---

## 지형 `land` — 13행

| 이전 키 | 이전 이름 | 이전 상태 | → 현상 | 도메인 | 새 이름 | 역할 | 처리 | 이전 질문 | 새 질문 |
|---|---|---|---|---|---|---|---|---|---|
| `land/base-bluemarble` | 베이스 · 블루마블 (지형·수심) | OBSERVED | — | NONE | 블루마블 | basemap | demote | 지형과 수심의 전체 구조는 | 지형과 수심의 전체 구조는 |
| `land/base-ne2` | 베이스 · 자연 지형 | LIVE | — | NONE | 자연 지형 | basemap | demote | 지형을 깔끔하게 보고 싶다 | 지형을 깔끔하게 보고 싶다 |
| `land/base-night` | 베이스 · 밤의 불빛 | OBSERVED | `people.night_lights` | people | 밤의 불빛 | basemap | demote | 밤에 밝은 도시는 어디인가 | 밤에 밝은 도시는 어디인가 |
| `land/base-truecolor` | 베이스 · 오늘의 지구 (실촬영) | OBSERVED | — | NONE | 오늘의 지구 | basemap | demote | 가장 최근에 촬영된 지구는 | 가장 최근에 촬영된 지구는 |
| `land/forest` | 산림 피복 릴리프 (나무가 덮은 비율) | OBSERVED | `land.forest` | land | 숲 | primary | rename | 이 지역에서 나무가 덮은 비율은 | 이 땅에 숲이 얼마나 있고, 언제 사라졌나 |
| `land/forestloss` | 산림 감소 2001~2023 (한국) | OBSERVED | `land.forest` | land | 산림 감소 이력 | data_product | merge | 어느 기간에 숲이 줄었나 | 어느 해에 이 숲이 사라졌나 |
| `land/globe` | 전지구 보기 | LIVE | — | NONE | 전지구 보기 | control | demote | 현재 장소에서 전체 지구로 돌아가려면 | 현재 장소에서 전체 지구로 돌아가려면 |
| `land/locate` | 내 위치로 이동 | LIVE | — | NONE | 내 위치로 이동 | entrypoint | demote | 내 주변 정보를 보고 싶다 | 내 주변 정보를 보고 싶다 |
| `land/lst` | 지표온도 (위성 관측) | OBSERVED | `land.surface_temperature` | land | 지표온도 | primary | rename | 땅 표면이 얼마나 뜨거운가 | 땅 표면이 얼마나 뜨거운가 |
| `land/satdetail` | 위성 표면 (줌인) | LIVE | `land.terrain` | land | 위성 표면 | data_product | merge | 이 장소의 지표를 자세히 보고 싶다 | 이 장소의 지표는 실제로 어떻게 생겼나 |
| `land/seaice` | 해빙 농도 (극지) | OBSERVED | `ocean.sea_ice` | ocean | 해빙 | primary | reclassify | 극지의 얼음 면적이 얼마나 변했나 | 극지의 얼음 면적이 얼마나 변했나 |
| `land/snow` | 눈·얼음 덮임 | OBSERVED | `land.snow_cover` | land | 눈 덮임 | primary | rename | 오늘 어디에 눈이 덮여 있나 | 오늘 어디에 눈이 덮여 있나 |
| `land/terrain` | 실지형 3D | LIVE | `land.terrain` | land | 지형 | primary | rename | 땅의 높낮이가 실제로 얼마나 다른가 | 땅의 높낮이가 실제로 얼마나 다른가 |

## 날씨 `weather` — 22행

| 이전 키 | 이전 이름 | 이전 상태 | → 현상 | 도메인 | 새 이름 | 역할 | 처리 | 이전 질문 | 새 질문 |
|---|---|---|---|---|---|---|---|---|---|
| `weather/airq` | 대기질 (에어코리아) | OBSERVED | `weather.air_quality` | weather | 대기질 | primary | merge | 근처 측정소의 대기질은 | 공기가 얼마나 탁한가 |
| `weather/cloud-ea` | 구름 천리안 · 동아시아 2km | OBSERVED | `weather.cloud` | weather | 천리안 동아시아 구름 | data_product | merge | 동아시아 구름을 자세히 보면 | 동아시아 구름을 자세히 보면 |
| `weather/cloud-fog` | 밤 낮은구름·안개 (밤 전용) | OBSERVED | `weather.fog` | weather | 안개·낮은구름 | primary | rename | 밤에 낮은 구름이 있는가 | 밤에 낮은 구름이 있는가 |
| `weather/cloud-gfs` | 비·눈·태풍 5일 예보 ▶ | MODEL_SIGNAL | `weather.precipitation` | weather | 5일 예보 | data_product | merge | 앞으로 비와 구름이 어떻게 움직이나 | 앞으로 비와 구름이 어떻게 움직이나 |
| `weather/cloud-gk2a` | 구름 천리안 (10분) | OBSERVED | `weather.cloud` | weather | 천리안 구름 | data_product | merge | 천리안이 본 최신 구름은 | 천리안이 본 최신 구름은 |
| `weather/cloud-obs` | 구름 실황 (전지구) | OBSERVED | `weather.cloud` | weather | 구름 | primary | merge | 전 세계 실제 구름 분포는 | 전 세계 실제 구름 분포는 |
| `weather/cloud-off` | 구름 끄기 | LIVE | `weather.cloud` | weather | 구름 끄기 | control | demote | 구름에 가린 지형을 보고 싶다 | 구름에 가린 지형을 보고 싶다 |
| `weather/cloud-vol` | 구름 3D 볼륨 (동아시아) | MODEL_SIGNAL | `weather.cloud` | weather | 구름 3D 볼륨 | data_product | merge | 구름 높이와 두께는 | 구름 높이와 두께는 |
| `weather/cloud-wv` | 상층 수증기 — 제트기류의 흐름 | OBSERVED | `weather.upper_moisture` | weather | 상층 수증기 | primary | rename | 상층 대기의 흐름은 | 상층 대기의 흐름은 |
| `weather/mysky` | 내 하늘 — 지금 구름 있나? | OBSERVED | `weather.cloud` | weather | 내 하늘 | data_product | merge | 내 머리 위 구름은 | 내 머리 위 구름은 |
| `weather/pm25grid` | 전지구 초미세먼지 | MODEL | `weather.air_quality` | weather | 전지구 초미세먼지 | data_product | merge | 공기가 얼마나 탁한가 | 공기가 얼마나 탁한가 |
| `weather/presgrid` | 전지구 기압 | MODEL | `weather.pressure` | weather | 기압 | primary | rename | 고기압과 저기압은 어디인가 | 고기압과 저기압은 어디인가 |
| `weather/radar` | 레이더 강수 (지금 내리는 비) | OBSERVED | `weather.precipitation` | weather | 강수 | primary | merge | 지금 내 주변에 비가 오나 | 지금 내 주변에 비가 오나 |
| `weather/raingrid` | 전지구 강수 | MODEL | `weather.precipitation` | weather | 전지구 강수 | data_product | merge | 다른 지역의 강수량은 | 다른 지역의 강수량은 |
| `weather/synop` | 일기도 기입 모형 (표준 기호) | OBSERVED | `weather.station_obs` | weather | 지상 관측 | primary | rename | 이 기호가 무엇을 뜻하나 | 지금 각 관측소는 무엇을 재고 있나 |
| `weather/tempanom` | 지금 평년보다 몇 도 (전국) | DERIVED | `weather.temperature_anomaly` | weather | 평년 대비 기온 | primary | rename | 평년보다 얼마나 덥거나 추운가 | 평년보다 얼마나 덥거나 추운가 |
| `weather/tempgrid` | 전지구 기온 | MODEL | `weather.temperature` | weather | 기온 | primary | rename | 선택한 곳은 몇 도인가 | 선택한 곳은 몇 도인가 |
| `weather/uvgrid` | 전지구 자외선 | MODEL | `weather.uv` | weather | 자외선 | primary | rename | 자외선 수준은 어느 정도인가 | 자외선 수준은 어느 정도인가 |
| `weather/warn` | 기상 특보 (실황) | OFFICIAL_FORECAST | `weather.warning` | weather | 기상 특보 | primary | merge | 내 지역의 공식 특보는 | 내 지역의 공식 특보는 |
| `weather/warnworld` | 미국 기상 특보 | OFFICIAL_FORECAST | `weather.warning` | weather | 미국 기상 특보 | data_product | merge | 미국에서 유효한 기상 경보는 | 미국에서 유효한 기상 경보는 |
| `weather/wind` | 바람 관측 (지상 3천 개소) | OBSERVED | `weather.wind` | weather | 바람 | primary | merge | 실제로 측정된 바람은 | 어느 방향으로 얼마나 세게 부나 |
| `weather/windgrid` | 전지구 풍속 | MODEL | `weather.wind` | weather | 전지구 풍속 | data_product | merge | 어느 방향으로 얼마나 세게 부나 | 어느 방향으로 얼마나 세게 부나 |

## 해양 `ocean` — 20행

| 이전 키 | 이전 이름 | 이전 상태 | → 현상 | 도메인 | 새 이름 | 역할 | 처리 | 이전 질문 | 새 질문 |
|---|---|---|---|---|---|---|---|---|---|
| `ocean/argo` | Argo 플로트 — 잠수 기록 | OBSERVED | `ocean.subsurface_profile` | ocean | 수심별 수온 | primary | rename | 깊이에 따라 수온이 어떻게 변하나 | 깊이에 따라 수온이 어떻게 변하나 |
| `ocean/buoys` | 해양 부이 관측 (수온) | OBSERVED | `ocean.sea_observation` | ocean | 바다 실측 | primary | merge | 부이가 측정한 수온과 파고는 | 바다에서 실제로 잰 값은 |
| `ocean/current` | 표층 해류 | MODEL_SIGNAL | `ocean.surface_current` | ocean | 표층 해류 | primary | keep | 표층 물은 어디로 흐르나 | 표층 물은 어디로 흐르나 |
| `ocean/isobath` | 해저 등심선 (등고선) | OBSERVED | `ocean.bathymetry` | ocean | 바다 깊이 | primary | merge | 이 바다의 깊이는 | 이 바다의 깊이는 |
| `ocean/khoaflood` | 연안 침수 범위 — 시군구별 침수 예상도 | MODEL_SIGNAL | `ocean.coastal_inundation` | ocean | 연안 침수 범위 | primary | rename | 어떤 가정에서 연안이 잠길 수 있나 | 어떤 가정에서 연안이 잠길 수 있나 |
| `ocean/khoasl126` | 우리 바다 해수면 전망 · SSP1-2.6 저배출 | MODEL_SIGNAL | `ocean.sea_level_rise` | ocean | 해수면 상승 전망 | data_product | merge | 저배출이면 우리 바다는 | 2100년에 해수면이 얼마나 오를 수 있나 |
| `ocean/khoasl245` | 우리 바다 해수면 전망 · SSP2-4.5 중간 | MODEL_SIGNAL | `ocean.sea_level_rise` | ocean | 해수면 상승 전망 | data_product | merge | 중간 배출이면 우리 바다는 | 2100년에 해수면이 얼마나 오를 수 있나 |
| `ocean/khoasl370` | 우리 바다 해수면 전망 · SSP3-7.0 고배출 | MODEL_SIGNAL | `ocean.sea_level_rise` | ocean | 해수면 상승 전망 | data_product | merge | 고배출이면 우리 바다는 | 2100년에 해수면이 얼마나 오를 수 있나 |
| `ocean/khoasl585` | 우리 바다 해수면 전망 · SSP5-8.5 최고 | MODEL_SIGNAL | `ocean.sea_level_rise` | ocean | 해수면 상승 전망 | data_product | merge | 매우 높은 배출이면 우리 바다는 | 2100년에 해수면이 얼마나 오를 수 있나 |
| `ocean/kmasea` | 해상 관측망 (파고·수온 193지점) | OBSERVED | `ocean.sea_observation` | ocean | 바다 실측 | data_product | merge | 한국 바다 실측은 | 바다에서 실제로 잰 값은 |
| `ocean/marine` | 해양 모델 · 파고와 바람 | MODEL_SIGNAL | `ocean.wave` | ocean | 파고와 너울 | entrypoint | merge | 선택 해역의 파고와 바람은 | 선택 해역의 파고와 바람은 |
| `ocean/oceanfocus` | 해양 포커스 | DERIVED | — | NONE | 해양 포커스 | control | demote | 한 해역의 핵심 상황은 | — |
| `ocean/slr` | 해수면 상승 전망 2100 (전 세계) | MODEL_SIGNAL | `ocean.sea_level_rise` | ocean | 해수면 상승 전망 | primary | merge | 2100년에 해수면이 얼마나 오를 수 있나 | 2100년에 해수면이 얼마나 오를 수 있나 |
| `ocean/sstanom` | 수온 아노말리 (평년 대비) | OBSERVED | `ocean.sst_anomaly` | ocean | 평년 대비 수온 | primary | rename | 평년보다 바다가 얼마나 따뜻한가 | 평년보다 바다가 얼마나 따뜻한가 |
| `ocean/sstfield` | 해수면 온도 (전지구) | OBSERVED | `ocean.sst` | ocean | 해수면 온도 | primary | rename | 바다 표면 온도는 | 바다 표면 온도는 |
| `ocean/surf` | 해변 271곳·낚시 946곳 | OBSERVED | `ocean.coastal_spots` | ocean | 해변과 낚시터 | primary | rename | 갈 해변이나 낚시 장소는 | 갈 해변이나 낚시 장소는 |
| `ocean/trenches` | 해구 위치 28곳 | OBSERVED | `ocean.bathymetry` | ocean | 바다 깊이 | data_product | merge | 가장 깊은 해구는 어디인가 | 이 바다의 깊이는 |
| `ocean/typhoonsim` | 태풍 해상 시뮬레이션 | SIMULATION_ONLY | `ocean.wave` | ocean | 파고와 너울 | tool | merge | 조건을 바꾸면 파도가 어떻게 달라지나 | 선택 해역의 파고와 바람은 |
| `ocean/vessel` | 선박 | LOCKED | `ocean.vessel_traffic` | ocean | 선박 | entrypoint | demote | 선박이나 여객선 정보를 보려면 | 선박이나 여객선 정보를 보려면 |
| `ocean/wavefield` | 유의파고 (전지구) | MODEL_SIGNAL | `ocean.wave` | ocean | 파고와 너울 | primary | merge | 큰 파도 평균 높이는 | 선택 해역의 파고와 바람은 |

## 사람 `people` — 8행

| 이전 키 | 이전 이름 | 이전 상태 | → 현상 | 도메인 | 새 이름 | 역할 | 처리 | 이전 질문 | 새 질문 |
|---|---|---|---|---|---|---|---|---|---|
| `people/flight` | 항공편 추적 | LOCKED | `travel.flight` | travel | 항공편 | primary | reclassify | 비행기가 실제 어디에 있나 | 비행기가 실제 어디에 있나 |
| `people/livemix` | 지금 사람 × 거주 인구 (서울) | DERIVED | `people.crowding` | people | 지금 사람 × 거주 인구 | data_product | merge | 방문 인구와 거주 인구가 어떻게 다른가 | 방문 인구와 거주 인구가 어떻게 다른가 |
| `people/news` | 지역 뉴스 (지금) | LIVE | `people.news` | people | 지역 뉴스 | primary | rename | 이 지역에 무슨 일이 생겼나 | 이 지역에 무슨 일이 생겼나 |
| `people/pop` | 국가 인구 (전 세계 총계) | OBSERVED | `people.population` | people | 국가 인구 | data_product | merge | 국가별 인구는 얼마인가 | 국가별 인구는 얼마인가 |
| `people/poptower` | 도시 인구 타워 — 서울·도쿄·타이베이·런던 (거주) | MODEL_SIGNAL | `people.population` | people | 도시 인구 타워 | data_product | merge | 어디에 사람이 거주하나 | 어디에 사람이 거주하나 |
| `people/sculpt` | 인구 데이터 조각 — 국가를 누르세요 | MODEL_SIGNAL | `people.population` | people | 인구 | primary | rename | 국가의 인구 분포는 | 어디에 사람이 거주하나 |
| `people/seoul` | 서울 실시간 인구 121곳 | OBSERVED | `people.crowding` | people | 실시간 혼잡 | primary | rename | 서울 어느 곳이 지금 붐비나 | 서울 어느 곳이 지금 붐비나 |
| `people/travel` | 여행·관광 POI | LOCKED | `travel.poi` | travel | 여행지 | primary | reclassify | 여행지 정보를 찾으려면 | 여행지 정보를 찾으려면 |

## 여행 `travel` — 6행

| 이전 키 | 이전 이름 | 이전 상태 | → 현상 | 도메인 | 새 이름 | 역할 | 처리 | 이전 질문 | 새 질문 |
|---|---|---|---|---|---|---|---|---|---|
| `travel/bf` | 무장애 여행지 목록 | OFFICIAL_INFORMATION | `travel.place_catalog` | travel | 무장애 여행지 | data_product | merge | 휠체어로 갈 수 있는 장소는 | 휠체어로 갈 수 있는 장소는 |
| `travel/discover` | 오늘 발견 — 시군구 228곳 | DERIVED | `travel.today_pick` | travel | 오늘 갈 곳 | primary | rename | 오늘 어디를 가면 좋을까 | 오늘 어디를 가면 좋을까 |
| `travel/en` | 외국인 · 영문 관광정보 | OFFICIAL_INFORMATION | `travel.place_catalog` | travel | 영문 관광정보 | data_product | merge | 외국인이 읽을 수 있는 관광 정보는 | 외국인이 읽을 수 있는 관광 정보는 |
| `travel/related` | 하나 더 — 연관 관광지 그래프 | HISTORY | `travel.place_sequence` | travel | 연관 관광지 | primary | rename | 이곳 다음에 어디를 가나 | 이곳 다음에 어디를 가나 |
| `travel/visitors` | 방문자 스냅샷 (이동통신 · 관광객 아님) | HISTORY | `travel.visitor_pressure` | travel | 지역 방문자 | primary | rename | 어느 기간에 방문이 많았나 | 어느 기간에 방문이 많았나 |
| `travel/wl` | 웰니스 관광지 목록 | OFFICIAL_INFORMATION | `travel.place_catalog` | travel | 웰니스 관광지 | data_product | merge | 웰니스 관광지에서 무엇을 할 수 있나 | 웰니스 관광지에서 무엇을 할 수 있나 |

## LAB `lab` — 5행

| 이전 키 | 이전 이름 | 이전 상태 | → 현상 | 도메인 | 새 이름 | 역할 | 처리 | 이전 질문 | 새 질문 |
|---|---|---|---|---|---|---|---|---|---|
| `lab/charts` | 자료 그래프 — 해수온·해빙·기온 시계열 | OBSERVED | `weather.climate_series` | weather | 기후 시계열 | tool | reclassify | — | 올해가 예년과 얼마나 다른가 |
| `lab/crust` | 땅의 움직임 — 한국·일본 GNSS 속도 | OBSERVED | `hazards.crustal_motion` | hazards | 지각 이동 속도 | tool | reclassify | — | 땅이 어느 방향으로 움직이나 |
| `lab/reports` | 분석 보고서 — 태풍·현상 계산기 결과 | DERIVED | — | none | 분석 보고서 | entrypoint | demote | — | 끝난 사건의 계산 보고서와 검증 결과를 어디서 보나 |
| `lab/requests` | 개발 요청 — 제안하고 투표 | LIVE | — | none | 개발 요청 | entrypoint | demote | — | 불편한 점을 남기고 다른 사람 요청에 공감하려면 |
| `lab/today` | 오늘의 지구 — 지금 가장 눈에 띄는 9곳 | OBSERVED | `weather.daily_extremes` | weather | 오늘의 극값 | tool | reclassify | — | 오늘 지구에서 가장 덥고 춥고 파도가 높은 곳은 어디인가 |

## 취미 `hobby` — 11행

| 이전 키 | 이전 이름 | 이전 상태 | → 현상 | 도메인 | 새 이름 | 역할 | 처리 | 이전 질문 | 새 질문 |
|---|---|---|---|---|---|---|---|---|---|
| `hobby/dive` | Dive · 심해 — GEBCO 수심 기둥과 심해 생물 | DERIVED | `ocean.deep_sea` | ocean | 심해 | primary | reclassify | — | 이 바다는 얼마나 깊고, 그 아래에 무엇이 사나 |
| `hobby/ecobird` | 전국 조류 조사 — 어느 5km 칸에 기록이 있나 | HISTORY | `land.bird_survey` | land | 조류 조사 기록 | primary | reclassify | — | 어느 5km 칸에 기록이 있나 |
| `hobby/fishing` | 낚시 — 물때와 안전 · 방파제 · 섬 | MODEL | `ocean.fishing_conditions` | ocean | 낚시 | primary | reclassify | — | 물이 얼마나 움직이고, 지금 나가면 위험한가 |
| `hobby/migbird` | 철새 — 봄에 우리 동네 새가 어디로 갔나 | HISTORY | `land.bird_migration` | land | 철새 | primary | reclassify | — | 봄에 우리 동네 새가 어디로 갔나 |
| `hobby/mountain` | 산 — 정상은 여기보다 얼마나 추운가 | OFFICIAL_FORECAST | `weather.mountain_summit` | weather | 산 정상 날씨 | primary | reclassify | — | 정상은 여기보다 얼마나 추운가 |
| `hobby/para` | 패러글라이딩 — 바람 세기와 구름 밑면 | MODEL | `weather.paragliding` | weather | 패러글라이딩 | primary | reclassify | — | 이 활공장의 바람과 구름 밑면은 |
| `hobby/seabird` | 바닷새 — 조사한 해에 어디서 몇 마리를 셌나 | HISTORY | `ocean.seabird` | ocean | 바닷새 | primary | reclassify | — | 조사한 해에 어디서 몇 마리를 셌나 |
| `hobby/surf` | 서핑 — 이 해변에 너울이 들어오는가 | MODEL | `ocean.surf_conditions` | ocean | 서핑 | primary | reclassify | 갈 해변이나 낚시 장소는 | 이 해변에 너울이 들어오는가 |
| `hobby/trench` | 해구 — 지구의 가장 깊은 바다 | OBSERVED | `ocean.trench` | ocean | 해구 | data_product | reclassify | — | 가장 깊은 해구는 어디인가 |
| `hobby/turtle` | 바다거북 — 방류된 거북이 지나간 길 | HISTORY | `ocean.sea_turtle` | ocean | 바다거북 | primary | reclassify | — | 방류된 바다거북은 어디로 갔나 |
| `hobby/vessel` | 선박 — 공식 실시간 위치 · 여객선 운항 | OFFICIAL_INFORMATION | `ocean.vessel_traffic` | ocean | 선박 위치 | entrypoint | demote | 선박이나 여객선 정보를 보려면 | 선박이나 여객선 정보를 보려면 |

## 재해 `hazards` — 15행

| 이전 키 | 이전 이름 | 이전 상태 | → 현상 | 도메인 | 새 이름 | 역할 | 처리 | 이전 질문 | 새 질문 |
|---|---|---|---|---|---|---|---|---|---|
| `hazards/crustal` | 지각 이동 속도 (GNSS 실측) | OBSERVED | `land.crustal_motion` | land | 지각 이동 | primary | reclassify | 땅이 어느 방향으로 움직이나 | 땅이 어느 방향으로 움직이나 |
| `hazards/eq` | 지진 실황 (M4.5+) | OBSERVED | `hazards.earthquake` | hazards | 지진 | primary | rename | 최근 지진은 어디서 났나 | 최근 지진은 어디서 났나 |
| `hazards/eqdepth` | 지진 깊이 — 지구 속 섭입대 | OBSERVED | `hazards.earthquake` | hazards | 지진 깊이 | data_product | merge | 지진은 땅속 얼마나 깊이 나는가 | 지진은 땅속 얼마나 깊이 나는가 |
| `hazards/eqhistory` | 지진 25년 — 판 경계가 드러난다 | OBSERVED | `hazards.earthquake` | hazards | 지진 25년 기록 | data_product | merge | 과거 지진 분포는 | 과거 지진 분포는 |
| `hazards/feed` | 지구 사건 피드 | LIVE | — | hazards | 사건 | entrypoint | demote | 지금 중요한 사건은 | 지금 중요한 사건은 |
| `hazards/fireglobal` | 전지구 산불 화점 (24시간) | OBSERVED | `hazards.wildfire` | hazards | 산불 화점 | primary | rename | 최근 위성에서 탐지한 열점은 | 최근 위성에서 탐지한 열점은 |
| `hazards/glof` | 빙하호 홍수 (GLOF) | LOCKED | `hazards.glacial_lake_flood` | hazards | 빙하호 홍수 | primary | rename | 빙하호 붕괴 시 영향은 | 빙하호 붕괴 시 영향은 |
| `hazards/lightning` | 낙뢰 (최근 60분) | OBSERVED | `hazards.lightning` | hazards | 낙뢰 | primary | rename | 최근 주변에 낙뢰가 있었나 | 최근 주변에 낙뢰가 있었나 |
| `hazards/plates` | 판 경계선 겹쳐보기 | OBSERVED | `land.crustal_motion` | land | 판 경계선 | data_product | reclassify | 판 경계와 지진이 어떻게 겹치나 | 판 경계와 지진이 어떻게 겹치나 |
| `hazards/tc` | 태풍 사건 (GDACS) | LIVE | `hazards.typhoon` | hazards | 활성 태풍 | data_product | merge | 활성 태풍 사건은 | 활성 태풍 사건은 |
| `hazards/tsunami` | 쓰나미 발표 기록 | OFFICIAL_WARNING | `hazards.tsunami` | hazards | 쓰나미 | primary | rename | 현재 유효한 쓰나미 정보는 | 현재 유효한 쓰나미 정보는 |
| `hazards/tyanalog` | 태풍 과거 유사 경로 (예보 아님) | DERIVED | `hazards.typhoon` | hazards | 과거 유사 경로 | data_product | merge | 과거에 비슷한 태풍은 | 과거에 비슷한 태풍은 |
| `hazards/tyens` | 태풍 앙상블 — 예보가 갈리는 폭 | MODEL_SIGNAL | `hazards.typhoon` | hazards | 태풍 앙상블 | data_product | merge | 예보가 얼마나 갈리는가 | 예보가 얼마나 갈리는가 |
| `hazards/tyoff` | 태풍 공식 트랙 | OFFICIAL_FORECAST | `hazards.typhoon` | hazards | 태풍 | primary | rename | 공식 태풍 경로는 | 공식 태풍 경로는 |
| `hazards/wildfire` | 산불 위험지수 (전국) | OFFICIAL_FORECAST | `hazards.wildfire` | hazards | 산불 위험지수 | data_product | merge | 산불이 발생하기 쉬운 조건인가 | 산불이 발생하기 쉬운 조건인가 |

## 우주 `space` — 9행

| 이전 키 | 이전 이름 | 이전 상태 | → 현상 | 도메인 | 새 이름 | 역할 | 처리 | 이전 질문 | 새 질문 |
|---|---|---|---|---|---|---|---|---|---|
| `space/aeth-orbit` | 궤도 인텔리전스 (우주쓰레기·정본 카탈로그·근접사건) | LIVE | `space.orbital_debris` | space | 우주 쓰레기 | primary | rename | 관심 물체와 근접 사건은 | 관심 물체와 근접 사건은 |
| `space/aurora` | 오로라 예보 (지금 보이는 곳) | OFFICIAL_FORECAST | `space.aurora` | space | 오로라 | primary | rename | 어디에서 오로라를 볼 가능성이 있나 | 어디에서 오로라를 볼 가능성이 있나 |
| `space/galaxy` | 우리은하 — 우리는 어디 있나 | DERIVED | `space.galaxy` | space | 우리은하 | primary | rename | 우리 태양계는 은하 어디에 있나 | 우리 태양계는 은하 어디에 있나 |
| `space/launch` | 발사 일정 (세계 로켓) | OFFICIAL_FORECAST | `space.rocket_launch` | space | 로켓 발사 | primary | rename | 다음 로켓 발사는 언제인가 | 다음 로켓 발사는 언제인가 |
| `space/photos` | 우주 사진관 59점 (하늘 위치) | OBSERVED | `space.photo` | space | 우주 사진 | primary | rename | 이 우주 사진은 무엇을 보여주나 | 이 우주 사진은 무엇을 보여주나 |
| `space/sats` | 위성 추적 (정거장·기상·과학·항법) | LIVE | `space.satellite` | space | 위성 | primary | rename | 위성은 지금 어디에 있는가 | 위성은 지금 어디에 있는가 |
| `space/solar` | 오늘의 태양계 | DERIVED | `space.solar_system` | space | 태양계 | primary | rename | 행성은 지금 어디에 있나 | 행성은 지금 어디에 있나 |
| `space/solaract` | 오늘의 태양 (실황 관측) | OBSERVED | `space.solar_activity` | space | 태양 활동 | primary | rename | 태양 활동의 최신 상태는 | 태양 활동의 최신 상태는 |
| `space/starlink` | 스타링크 | LIVE | `space.satellite` | space | 스타링크 | data_product | merge | 스타링크 위성군 구조는 | 스타링크 위성군 구조는 |

---

## 질문이 없던 레이어

`MENU_QUESTIONS` 에 항목이 아예 없던 레이어가 **14개**다 (lab 5 + hobby 9). 전부 질문을 받았다.

| 키 | 새 질문 |
|---|---|
| `hobby/dive` | 이 바다는 얼마나 깊고, 그 아래에 무엇이 사나 |
| `hobby/ecobird` | 어느 5km 칸에 기록이 있나 |
| `hobby/fishing` | 물이 얼마나 움직이고, 지금 나가면 위험한가 |
| `hobby/migbird` | 봄에 우리 동네 새가 어디로 갔나 |
| `hobby/mountain` | 정상은 여기보다 얼마나 추운가 |
| `hobby/para` | 이 활공장의 바람과 구름 밑면은 |
| `hobby/seabird` | 조사한 해에 어디서 몇 마리를 셌나 |
| `hobby/trench` | 가장 깊은 해구는 어디인가 |
| `hobby/turtle` | 방류된 바다거북은 어디로 갔나 |
| `lab/charts` | 올해가 예년과 얼마나 다른가 |
| `lab/crust` | 땅이 어느 방향으로 움직이나 |
| `lab/reports` | 끝난 사건의 계산 보고서와 검증 결과를 어디서 보나 |
| `lab/requests` | 불편한 점을 남기고 다른 사람 요청에 공감하려면 |
| `lab/today` | 오늘 지구에서 가장 덥고 춥고 파도가 높은 곳은 어디인가 |

여기에 더해 `hobby/surf` 와 `hobby/vessel` 은 항목은 있었지만 **ocean 쪽 질문을 충돌로 가져다 쓰고 있었다.** 화면상 잘못된 행은 그래서 16개다.
