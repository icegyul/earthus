# EARTHUS V2 — UI 정보구조 (PHASE 3 STEP 3.2)

| 항목 | 값 |
|---|---|
| 상태 | STEP 3.2 — 매핑만. UI 변경 없음 |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `f44f3416` |
| 전제 | [phase-3-ui-audit.md](phase-3-ui-audit.md) · [phenomenon-registry.md](phenomenon-registry.md) |

> 봉인 인계 패키지의 일부가 아니다.

---

## 1. 새 계층

```text
LEVEL 1  도메인 7
   ↓
LEVEL 2  현상 66
   ↓
LEVEL 3  능력 (그 현상이 실제로 가진 것만)
```

사용자는 처음에 **도메인 7개**를 본다. 109개도, 100개도, 66개도 처음엔 안 본다.

| 도메인 | 현상 | 흡수하는 레이어 |
|---|---:|---:|
| 땅 `land` | 7 | 10 |
| 날씨 `weather` | 16 | 26 |
| 바다 `ocean` | 18 | 27 |
| 사람 `people` | 4 | 7 |
| 여행 `travel` | 6 | 8 |
| 재해 `hazards` | 7 | 13 |
| 우주 `space` | 8 | 9 |
| **합계** | **66** | **100** |

나머지 9개는 현상이 아니다(배경·조작·진입점). LEVEL 2 에 올리지 않는다.

---

## 2. OLD → NEW 매핑 (109행)

열: 옛 메뉴 → 도메인 → 현상 → 능력 → 새 진입 → 처리

### 땅 `land`

| 옛 메뉴 (scene/layer) | 옛 이름 | → 현상 | 능력 | 처리 |
|---|---|---|---|---|
| `hobby/migbird` | 철새 — 봄에 우리 동네 새가 어디로 갔나 | **`land.bird_migration`** 철새 | 해석 · 근거 · 리포트 | reclassify |
| `hobby/ecobird` | 전국 조류 조사 — 어느 5km 칸에 기록이 있나 | **`land.bird_survey`** 조류 조사 기록 | 해석 · 근거 | reclassify |
| `hazards/plates` | 판 경계선 겹쳐보기 | **`land.crustal_motion`** 지각 이동 | 현재 · 사료 · 해석 · 근거 | reclassify |
| `hazards/crustal` | 지각 이동 속도 (GNSS 실측) | ↑ 같은 현상 |  | reclassify |
| `land/forest` | 산림 피복 릴리프 (나무가 덮은 비율) | **`land.forest`** 숲 | 현재 · 해석 · 근거 | rename |
| `land/forestloss` | 산림 감소 2001~2023 (한국) | ↑ 같은 현상 |  | merge |
| `land/snow` | 눈·얼음 덮임 | **`land.snow_cover`** 눈 덮임 | 현재 · 근거 | rename |
| `land/lst` | 지표온도 (위성 관측) | **`land.surface_temperature`** 지표온도 | 현재 · 근거 | rename |
| `land/terrain` | 실지형 3D | **`land.terrain`** 지형 | 현재 · 해석 · 근거 | rename |
| `land/satdetail` | 위성 표면 (줌인) | ↑ 같은 현상 |  | merge |

### 날씨 `weather`

| 옛 메뉴 (scene/layer) | 옛 이름 | → 현상 | 능력 | 처리 |
|---|---|---|---|---|
| `weather/pm25grid` | 전지구 초미세먼지 | **`weather.air_quality`** 대기질 | 현재 · 해석 · 예보 · 근거 · 리포트 | merge |
| `weather/airq` | 대기질 (에어코리아) | ↑ 같은 현상 |  | merge |
| `lab/charts` | 자료 그래프 — 해수온·해빙·기온 시계열 | **`weather.climate_series`** 기후 시계열 | 현재 · 해석 · 근거 | reclassify |
| `weather/cloud-off` | 구름 끄기 | **`weather.cloud`** 구름 | 현재 · 해석 · 예보 · 근거 | demote |
| `weather/cloud-obs` | 구름 실황 (전지구) | ↑ 같은 현상 |  | merge |
| `weather/cloud-gk2a` | 구름 천리안 (10분) | ↑ 같은 현상 |  | merge |
| `weather/cloud-ea` | 구름 천리안 · 동아시아 2km | ↑ 같은 현상 |  | merge |
| `weather/mysky` | 내 하늘 — 지금 구름 있나? | ↑ 같은 현상 |  | merge |
| `weather/cloud-vol` | 구름 3D 볼륨 (동아시아) | ↑ 같은 현상 |  | merge |
| `lab/today` | 오늘의 지구 — 지금 가장 눈에 띄는 9곳 | **`weather.daily_extremes`** 오늘의 극값 | 현재 · 해석 · 근거 | reclassify |
| `weather/cloud-fog` | 밤 낮은구름·안개 (밤 전용) | **`weather.fog`** 안개·낮은구름 | 현재 · 근거 | rename |
| `hobby/mountain` | 산 — 정상은 여기보다 얼마나 추운가 | **`weather.mountain_summit`** 산 정상 날씨 | 현재 · 해석 · 예보 · 근거 | reclassify |
| `hobby/para` | 패러글라이딩 — 바람 세기와 구름 밑면 | **`weather.paragliding`** 패러글라이딩 | 현재 · 해석 · 근거 | reclassify |
| `weather/radar` | 레이더 강수 (지금 내리는 비) | **`weather.precipitation`** 강수 | 현재 · 예보 · 근거 | merge |
| `weather/raingrid` | 전지구 강수 | ↑ 같은 현상 |  | merge |
| `weather/cloud-gfs` | 비·눈·태풍 5일 예보 ▶ | ↑ 같은 현상 |  | merge |
| `weather/presgrid` | 전지구 기압 | **`weather.pressure`** 기압 | 현재 · 근거 | rename |
| `weather/synop` | 일기도 기입 모형 (표준 기호) | **`weather.station_obs`** 지상 관측 | 현재 · 해석 · 근거 | rename |
| `weather/tempgrid` | 전지구 기온 | **`weather.temperature`** 기온 | 현재 · 해석 · 예보 · 근거 | rename |
| `weather/tempanom` | 지금 평년보다 몇 도 (전국) | **`weather.temperature_anomaly`** 평년 대비 기온 | 현재 · 해석 · 근거 | rename |
| `weather/cloud-wv` | 상층 수증기 — 제트기류의 흐름 | **`weather.upper_moisture`** 상층 수증기 | 현재 · 근거 | rename |
| `weather/uvgrid` | 전지구 자외선 | **`weather.uv`** 자외선 | 현재 · 근거 | rename |
| `weather/warnworld` | 미국 기상 특보 | **`weather.warning`** 기상 특보 | 현재 · 해석 · 근거 | merge |
| `weather/warn` | 기상 특보 (실황) | ↑ 같은 현상 |  | merge |
| `weather/windgrid` | 전지구 풍속 | **`weather.wind`** 바람 | 현재 · 해석 · 예보 · 근거 | merge |
| `weather/wind` | 바람 관측 (지상 3천 개소) | ↑ 같은 현상 |  | merge |

### 바다 `ocean`

| 옛 메뉴 (scene/layer) | 옛 이름 | → 현상 | 능력 | 처리 |
|---|---|---|---|---|
| `ocean/isobath` | 해저 등심선 (등고선) | **`ocean.bathymetry`** 바다 깊이 | 현재 · 근거 | merge |
| `ocean/trenches` | 해구 위치 28곳 | ↑ 같은 현상 |  | merge |
| `ocean/khoaflood` | 연안 침수 범위 — 시군구별 침수 예상도 | **`ocean.coastal_inundation`** 연안 침수 범위 | 근거 | rename |
| `ocean/surf` | 해변 271곳·낚시 946곳 | **`ocean.coastal_spots`** 해변과 낚시터 | 사료 · 근거 | rename |
| `hobby/dive` | Dive · 심해 — GEBCO 수심 기둥과 심해 생물 | **`ocean.deep_sea`** 심해 | 해석 · 근거 | reclassify |
| `hobby/fishing` | 낚시 — 물때와 안전 · 방파제 · 섬 | **`ocean.fishing_conditions`** 낚시 | 현재 · 해석 · 근거 | reclassify |
| `land/seaice` | 해빙 농도 (극지) | **`ocean.sea_ice`** 해빙 | 현재 · 해석 · 근거 | reclassify |
| `ocean/slr` | 해수면 상승 전망 2100 (전 세계) | **`ocean.sea_level_rise`** 해수면 상승 전망 | 해석 · 근거 | merge |
| `ocean/khoasl126` | 우리 바다 해수면 전망 · SSP1-2.6 저배출 | ↑ 같은 현상 |  | merge |
| `ocean/khoasl245` | 우리 바다 해수면 전망 · SSP2-4.5 중간 | ↑ 같은 현상 |  | merge |
| `ocean/khoasl370` | 우리 바다 해수면 전망 · SSP3-7.0 고배출 | ↑ 같은 현상 |  | merge |
| `ocean/khoasl585` | 우리 바다 해수면 전망 · SSP5-8.5 최고 | ↑ 같은 현상 |  | merge |
| `ocean/buoys` | 해양 부이 관측 (수온) | **`ocean.sea_observation`** 바다 실측 | 현재 · 해석 · 근거 | merge |
| `ocean/kmasea` | 해상 관측망 (파고·수온 193지점) | ↑ 같은 현상 |  | merge |
| `hobby/turtle` | 바다거북 — 방류된 거북이 지나간 길 | **`ocean.sea_turtle`** 바다거북 | 근거 | reclassify |
| `hobby/seabird` | 바닷새 — 조사한 해에 어디서 몇 마리를 셌나 | **`ocean.seabird`** 바닷새 | 해석 · 근거 | reclassify |
| `ocean/sstfield` | 해수면 온도 (전지구) | **`ocean.sst`** 해수면 온도 | 현재 · 근거 | rename |
| `ocean/sstanom` | 수온 아노말리 (평년 대비) | **`ocean.sst_anomaly`** 평년 대비 수온 | 현재 · 해석 · 근거 | rename |
| `ocean/argo` | Argo 플로트 — 잠수 기록 | **`ocean.subsurface_profile`** 수심별 수온 | 현재 · 해석 · 근거 | rename |
| `hobby/surf` | 서핑 — 이 해변에 너울이 들어오는가 | **`ocean.surf_conditions`** 서핑 | 현재 · 해석 · 근거 | reclassify |
| `ocean/current` | 표층 해류 | **`ocean.surface_current`** 표층 해류 | 현재 · 근거 | keep |
| `hobby/trench` | 해구 — 지구의 가장 깊은 바다 | **`ocean.trench`** 해구 | 근거 | reclassify |
| `ocean/vessel` | 선박 | **`ocean.vessel_traffic`** 선박 |  | demote |
| `hobby/vessel` | 선박 — 공식 실시간 위치 · 여객선 운항 | ↑ 같은 현상 |  | demote |
| `ocean/marine` | 해양 모델 · 파고와 바람 | **`ocean.wave`** 파고와 너울 | 현재 · 해석 · 시뮬 · 근거 | merge |
| `ocean/typhoonsim` | 태풍 해상 시뮬레이션 | ↑ 같은 현상 |  | merge |
| `ocean/wavefield` | 유의파고 (전지구) | ↑ 같은 현상 |  | merge |

### 사람 `people`

| 옛 메뉴 (scene/layer) | 옛 이름 | → 현상 | 능력 | 처리 |
|---|---|---|---|---|
| `people/seoul` | 서울 실시간 인구 121곳 | **`people.crowding`** 실시간 혼잡 | 현재 · 해석 · 예보 · 근거 | rename |
| `people/livemix` | 지금 사람 × 거주 인구 (서울) | ↑ 같은 현상 |  | merge |
| `people/news` | 지역 뉴스 (지금) | **`people.news`** 지역 뉴스 | 현재 · 근거 | rename |
| `land/base-night` | 베이스 · 밤의 불빛 | **`people.night_lights`** 밤의 불빛 | 현재 · 근거 | demote |
| `people/poptower` | 도시 인구 타워 — 서울·도쿄·타이베이·런던 (거주) | **`people.population`** 인구 | 현재 · 해석 · 근거 | merge |
| `people/sculpt` | 인구 데이터 조각 — 국가를 누르세요 | ↑ 같은 현상 |  | rename |
| `people/pop` | 국가 인구 (전 세계 총계) | ↑ 같은 현상 |  | merge |

### 여행 `travel`

| 옛 메뉴 (scene/layer) | 옛 이름 | → 현상 | 능력 | 처리 |
|---|---|---|---|---|
| `people/flight` | 항공편 추적 | **`travel.flight`** 항공편 |  | reclassify |
| `travel/bf` | 무장애 여행지 목록 | **`travel.place_catalog`** 목적별 관광지 | 현재 · 해석 · 근거 | merge |
| `travel/wl` | 웰니스 관광지 목록 | ↑ 같은 현상 |  | merge |
| `travel/en` | 외국인 · 영문 관광정보 | ↑ 같은 현상 |  | merge |
| `travel/related` | 하나 더 — 연관 관광지 그래프 | **`travel.place_sequence`** 연관 관광지 | 사료 · 해석 · 근거 | rename |
| `people/travel` | 여행·관광 POI | **`travel.poi`** 여행지 |  | reclassify |
| `travel/discover` | 오늘 발견 — 시군구 228곳 | **`travel.today_pick`** 오늘 갈 곳 | 현재 · 해석 · 근거 | rename |
| `travel/visitors` | 방문자 스냅샷 (이동통신 · 관광객 아님) | **`travel.visitor_pressure`** 지역 방문자 | 사료 · 해석 · 근거 | rename |

### 재해 `hazards`

| 옛 메뉴 (scene/layer) | 옛 이름 | → 현상 | 능력 | 처리 |
|---|---|---|---|---|
| `lab/crust` | 땅의 움직임 — 한국·일본 GNSS 속도 | **`hazards.crustal_motion`** 지각 이동 속도 | 현재 · 해석 · 근거 | reclassify |
| `hazards/eq` | 지진 실황 (M4.5+) | **`hazards.earthquake`** 지진 | 현재 · 사료 · 해석 · 예보 · 근거 · 리포트 | rename |
| `hazards/eqhistory` | 지진 25년 — 판 경계가 드러난다 | ↑ 같은 현상 |  | merge |
| `hazards/eqdepth` | 지진 깊이 — 지구 속 섭입대 | ↑ 같은 현상 |  | merge |
| `hazards/glof` | 빙하호 홍수 (GLOF) | **`hazards.glacial_lake_flood`** 빙하호 홍수 |  | rename |
| `hazards/lightning` | 낙뢰 (최근 60분) | **`hazards.lightning`** 낙뢰 | 현재 · 근거 | rename |
| `hazards/tsunami` | 쓰나미 발표 기록 | **`hazards.tsunami`** 쓰나미 | 현재 · 해석 · 시뮬 · 근거 | rename |
| `hazards/tc` | 태풍 사건 (GDACS) | **`hazards.typhoon`** 태풍 | 현재 · 해석 · 예보 · 근거 · 리포트 | merge |
| `hazards/tyoff` | 태풍 공식 트랙 | ↑ 같은 현상 |  | rename |
| `hazards/tyens` | 태풍 앙상블 — 예보가 갈리는 폭 | ↑ 같은 현상 |  | merge |
| `hazards/tyanalog` | 태풍 과거 유사 경로 (예보 아님) | ↑ 같은 현상 |  | merge |
| `hazards/fireglobal` | 전지구 산불 화점 (24시간) | **`hazards.wildfire`** 산불 | 현재 · 해석 · 예보 · 근거 · 리포트 | rename |
| `hazards/wildfire` | 산불 위험지수 (전국) | ↑ 같은 현상 |  | merge |

### 우주 `space`

| 옛 메뉴 (scene/layer) | 옛 이름 | → 현상 | 능력 | 처리 |
|---|---|---|---|---|
| `space/aurora` | 오로라 예보 (지금 보이는 곳) | **`space.aurora`** 오로라 | 해석 · 예보 · 근거 · 리포트 | rename |
| `space/galaxy` | 우리은하 — 우리는 어디 있나 | **`space.galaxy`** 우리은하 | 근거 | rename |
| `space/aeth-orbit` | 궤도 인텔리전스 (우주쓰레기·정본 카탈로그·근접사건) | **`space.orbital_debris`** 우주 쓰레기 | 현재 · 해석 · 예보 · 근거 · 리포트 | rename |
| `space/photos` | 우주 사진관 59점 (하늘 위치) | **`space.photo`** 우주 사진 | 사료 · 해석 · 근거 | rename |
| `space/launch` | 발사 일정 (세계 로켓) | **`space.rocket_launch`** 로켓 발사 | 해석 · 예보 · 근거 | rename |
| `space/sats` | 위성 추적 (정거장·기상·과학·항법) | **`space.satellite`** 위성 | 현재 · 해석 · 근거 | rename |
| `space/starlink` | 스타링크 | ↑ 같은 현상 |  | merge |
| `space/solaract` | 오늘의 태양 (실황 관측) | **`space.solar_activity`** 태양 활동 | 현재 · 해석 · 근거 | rename |
| `space/solar` | 오늘의 태양계 | **`space.solar_system`** 태양계 | 현재 · 해석 · 근거 | rename |

### 현상이 아닌 것 (9) — LEVEL 2 에 올리지 않는다

| 옛 메뉴 | 옛 이름 | 역할 | 새 자리 |
|---|---|---|---|
| `land/locate` | 내 위치로 이동 | entrypoint | 전용 진입점 |
| `land/globe` | 전지구 보기 | control | 지도 조작(크롬) |
| `land/base-ne2` | 베이스 · 자연 지형 | basemap | 지구 표현(설정 또는 지구 위 직접 조작) |
| `land/base-bluemarble` | 베이스 · 블루마블 (지형·수심) | basemap | 지구 표현(설정 또는 지구 위 직접 조작) |
| `land/base-truecolor` | 베이스 · 오늘의 지구 (실촬영) | basemap | 지구 표현(설정 또는 지구 위 직접 조작) |
| `ocean/oceanfocus` | 해양 포커스 | control | 지도 조작(크롬) |
| `lab/reports` | 분석 보고서 — 태풍·현상 계산기 결과 | entrypoint | 전용 진입점 |
| `lab/requests` | 개발 요청 — 제안하고 투표 | entrypoint | 전용 진입점 |
| `hazards/feed` | 지구 사건 피드 | entrypoint | 전용 진입점 |

