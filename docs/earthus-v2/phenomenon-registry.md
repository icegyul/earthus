# EARTHUS V2 — 현상 레지스트리 (PHASE 1)

| 항목 | 값 |
|---|---|
| 상태 | PHASE 1 완료 — 추가만 함. 화면 변경 없음 |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `1e03eac8` |
| 기계가 읽는 정본 | `prototype/v2-three/js/phenomenon-registry.js` |
| 현상 | 66개 |
| 매핑된 레이어 | 109개 (109개 전부, 누락 0) |
| 아직 배선 안 됨 | 어떤 화면도 이 파일을 읽지 않는다 |

> 이 문서는 2026-08-27 봉인 인계 패키지의 일부가 아니다. `SHA256SUMS` 대상이 아니다.

---

## 1. 능력은 오늘 되는 것만 참이다

66개 현상을 씬별로 매핑한 뒤, 각 매핑을 별도 검증자가 **반박하도록** 했다. 판정 188건 중 174건이 유지, **14건이 과장으로 잡혔고 11건이 실제로 false 로 내려갔다.**

| 능력 | 참인 현상 수 | 무엇을 뜻하나 |
|---|---:|---|
| 현재 `current` | 47 | 지금 상태를 그린다 |
| 사료 `history` | 6 | 사료·아카이브다. 지금이 아니다 (지침서 §4 능력 집합에 없던 칸 — 우리가 추가했다) |
| 해석 `intelligence` | 44 | 이 현상에 고유한 질문에 오늘 있는 자료로 답할 수 있다 |
| 예보 `forecast` | 13 | 실제로 생산되는 예보 산출물이 뒤에 있다 |
| 시뮬 `simulation` | 2 | 진짜 과학 시뮬레이션이 있다 |
| 근거 `evidence` | 62 | 출처와 진실 등급을 댈 수 있다 |
| 리포트 `report` | 7 | 실제 리포트 생성기가 있다 |

**시뮬레이션이 정확히 2개인 것이 이 표의 정직성 시험이다.** `ocean.wave`(Gerstner 파면)와 `hazards.tsunami`(√(g·h) Dijkstra) 둘뿐이다. 태풍에는 없다 — 5행짜리 상수표에 거리 계수를 곱한 것이라 시뮬레이션이 아니다.

### 반박으로 내려간 11건

| 현상 | 능력 | 왜 거짓인가 |
|---|---|---|
| `ocean.wave` | forecast | 지도에 그리는 `ocean/marine.json` 은 `current=` 만 받는다. 예보 시간축이 아예 없다. 유일한 예보는 FOR ME 카드 한 점을 위한 클라이언트측 Open-Meteo 호출이고, `aws/` 가 만들지 않으며 어디에도 보관되지 않는다 |
| `hazards.tsunami` | forecast | 앞을 보는 답은 `simulation` 이 이미 갖고 있다. 도달시각 표는 우리 시뮬레이션 안에서 기회주의적으로 긁는 값이라 대개 없다 |
| `travel.visitor_pressure` | forecast | 인용된 KTO 산출물은 다른 현상(지점 상대 집중률)이고 소비되지도 않는다 |
| `ocean.fishing_conditions` | forecast | 예보 산출물이 아니라 관측을 읽는다 |
| `ocean.subsurface_profile` | report | lab-events 에 해당 종류가 없다 |
| `ocean.coastal_inundation` | intelligence | 오늘 답할 수 있는 현상 고유 질문이 없다 |
| `ocean.bathymetry` | intelligence | 같음 |
| `weather.precipitation` | intelligence | 같음 |
| `ocean.vessel_traffic` | evidence | AIS 재배포 정책상 값을 내지 않고 공식 사이트로 보낸다 |
| `space.aurora` | current | 현재 상태를 그리지 않는다 |
| `space.rocket_launch` | current | 지금이 아니라 일정이다 |

---

## 2. 지침서 §45 의 시제품 3종 — 예상과 실제가 다르다

지침서는 이 셋으로 "능력 조합이 서로 다른 것"을 증명하라고 했다. 실제 능력은 예상과 **두 곳에서** 어긋난다. 자료를 지침서에 맞추지 않고 그대로 보고한다.

| 현상 | 지침서 예상 | 실제 (근거 확인) | 차이 |
|---|---|---|---|
| 태풍 `hazards.typhoon` | 현재+해석+예보+시뮬 | 현재 · 해석 · 예보 · 근거 · 리포트 | 시뮬레이션 **없음**, 대신 리포트 **있음**(`aws/cyclone-analog`) |
| 낙뢰 `hazards.lightning` | 현재+해석 | 현재 · 근거 | **해석 없음** — 자기 질문은 "주변에"인데 전국 합계만 답한다 |
| 파고 `ocean.wave` | 현재+해석+예보(+시뮬) | 현재 · 해석 · 시뮬 · 근거 | **예보 없음**, 시뮬레이션은 있음 |

**낙뢰의 해석 없음이 가장 값싼 수리다.** 낙뢰 기록은 이미 위경도를 들고 있고(`live-layers.js` metaLightning 은 전국 합계만 낸다), 근접 판정은 이미 있는 자료로 계산된다. `event-room.js` 에 낙뢰 행이 없고 `for-me-signal.js` 에 낙뢰 카드가 없을 뿐이다.

**파고에 예보가 없다는 사실은 지침서 §16(예보 검증)에 직접 영향을 준다.** 보관되지 않는 남의 예보는 검증 대상이 될 수 없다.

---

## 3. 도메인별 현상

첫 화면은 도메인 7개다. 현상은 도메인을 고른 뒤에 나온다(점진적 공개).

### 땅 `land` — 7개

| 현상 | 이름 | 질문 | 능력 | 상태 | 자료 |
|---|---|---|---|---|---|
| `land.bird_migration` | 철새 | 봄에 우리 동네 새가 어디로 갔나 | 해석 · 근거 · 리포트 | ready | 1 |
| `land.bird_survey` | 조류 조사 기록 | 어느 5km 칸에 기록이 있나 | 해석 · 근거 | ready | 1 |
| `land.crustal_motion` | 지각 이동 | 땅이 어느 방향으로 움직이나 | 현재 · 사료 · 해석 · 근거 | ready | 2 |
| `land.forest` | 숲 | 이 땅에 숲이 얼마나 있고, 언제 사라졌나 | 현재 · 해석 · 근거 | ready | 2 |
| `land.snow_cover` | 눈 덮임 | 오늘 어디에 눈이 덮여 있나 | 현재 · 근거 | ready | 1 |
| `land.terrain` | 지형 | 땅의 높낮이가 실제로 얼마나 다른가 | 현재 · 해석 · 근거 | ready | 2 |
| `land.surface_temperature` | 지표온도 | 땅 표면이 얼마나 뜨거운가 | 현재 · 근거 | partial | 1 |

### 날씨 `weather` — 16개

| 현상 | 이름 | 질문 | 능력 | 상태 | 자료 |
|---|---|---|---|---|---|
| `weather.climate_series` | 기후 시계열 | 올해가 예년과 얼마나 다른가 | 현재 · 해석 · 근거 | ready | 1 |
| `weather.cloud` | 구름 | 전 세계 실제 구름 분포는 | 현재 · 해석 · 예보 · 근거 | ready | 7 |
| `weather.daily_extremes` | 오늘의 극값 | 오늘 지구에서 가장 덥고 춥고 파도가 높은 곳은 어디인가 | 현재 · 해석 · 근거 | ready | 1 |
| `weather.mountain_summit` | 산 정상 날씨 | 정상은 여기보다 얼마나 추운가 | 현재 · 해석 · 예보 · 근거 | ready | 1 |
| `weather.temperature_anomaly` | 평년 대비 기온 | 평년보다 얼마나 덥거나 추운가 | 현재 · 해석 · 근거 | ready | 1 |
| `weather.upper_moisture` | 상층 수증기 | 상층 대기의 흐름은 | 현재 · 근거 | ready | 1 |
| `weather.uv` | 자외선 | 자외선 수준은 어느 정도인가 | 현재 · 근거 | ready | 1 |
| `weather.air_quality` | 대기질 | 공기가 얼마나 탁한가 | 현재 · 해석 · 예보 · 근거 · 리포트 | partial | 2 |
| `weather.fog` | 안개·낮은구름 | 밤에 낮은 구름이 있는가 | 현재 · 근거 | partial | 1 |
| `weather.paragliding` | 패러글라이딩 | 이 활공장의 바람과 구름 밑면은 | 현재 · 해석 · 근거 | partial | 1 |
| `weather.precipitation` | 강수 | 지금 내 주변에 비가 오나 | 현재 · 예보 · 근거 | partial | 3 |
| `weather.pressure` | 기압 | 고기압과 저기압은 어디인가 | 현재 · 근거 | partial | 1 |
| `weather.station_obs` | 지상 관측 | 지금 각 관측소는 무엇을 재고 있나 | 현재 · 해석 · 근거 | partial | 1 |
| `weather.temperature` | 기온 | 선택한 곳은 몇 도인가 | 현재 · 해석 · 예보 · 근거 | partial | 1 |
| `weather.warning` | 기상 특보 | 내 지역의 공식 특보는 | 현재 · 해석 · 근거 | partial | 2 |
| `weather.wind` | 바람 | 어느 방향으로 얼마나 세게 부나 | 현재 · 해석 · 예보 · 근거 | partial | 2 |

### 바다 `ocean` — 18개

| 현상 | 이름 | 질문 | 능력 | 상태 | 자료 |
|---|---|---|---|---|---|
| `ocean.bathymetry` | 바다 깊이 | 이 바다의 깊이는 | 현재 · 근거 | ready | 2 |
| `ocean.coastal_inundation` | 연안 침수 범위 | 어떤 가정에서 연안이 잠길 수 있나 | 근거 | ready | 1 |
| `ocean.coastal_spots` | 해변과 낚시터 | 갈 해변이나 낚시 장소는 | 사료 · 근거 | ready | 1 |
| `ocean.deep_sea` | 심해 | 이 바다는 얼마나 깊고, 그 아래에 무엇이 사나 | 해석 · 근거 | ready | 1 |
| `ocean.fishing_conditions` | 낚시 | 물이 얼마나 움직이고, 지금 나가면 위험한가 | 현재 · 해석 · 근거 | ready | 1 |
| `ocean.sea_level_rise` | 해수면 상승 전망 | 2100년에 해수면이 얼마나 오를 수 있나 | 해석 · 근거 | ready | 5 |
| `ocean.sea_observation` | 바다 실측 | 바다에서 실제로 잰 값은 | 현재 · 해석 · 근거 | ready | 2 |
| `ocean.sea_turtle` | 바다거북 | 방류된 바다거북은 어디로 갔나 | 근거 | ready | 1 |
| `ocean.seabird` | 바닷새 | 조사한 해에 어디서 몇 마리를 셌나 | 해석 · 근거 | ready | 1 |
| `ocean.sst` | 해수면 온도 | 바다 표면 온도는 | 현재 · 근거 | ready | 1 |
| `ocean.sst_anomaly` | 평년 대비 수온 | 평년보다 바다가 얼마나 따뜻한가 | 현재 · 해석 · 근거 | ready | 1 |
| `ocean.subsurface_profile` | 수심별 수온 | 깊이에 따라 수온이 어떻게 변하나 | 현재 · 해석 · 근거 | ready | 1 |
| `ocean.surf_conditions` | 서핑 | 이 해변에 너울이 들어오는가 | 현재 · 해석 · 근거 | ready | 1 |
| `ocean.surface_current` | 표층 해류 | 표층 물은 어디로 흐르나 | 현재 · 근거 | ready | 1 |
| `ocean.trench` | 해구 | 가장 깊은 해구는 어디인가 | 근거 | ready | 2 |
| `ocean.wave` | 파고와 너울 | 선택 해역의 파고와 바람은 | 현재 · 해석 · 시뮬 · 근거 | ready | 3 |
| `ocean.sea_ice` | 해빙 | 극지의 얼음 면적이 얼마나 변했나 | 현재 · 해석 · 근거 | partial | 1 |
| `ocean.vessel_traffic` | 선박 | 선박이나 여객선 정보를 보려면 | — | planned | 2 |

### 사람 `people` — 4개

| 현상 | 이름 | 질문 | 능력 | 상태 | 자료 |
|---|---|---|---|---|---|
| `people.crowding` | 실시간 혼잡 | 서울 어느 곳이 지금 붐비나 | 현재 · 해석 · 예보 · 근거 | ready | 2 |
| `people.news` | 지역 뉴스 | 이 지역에 무슨 일이 생겼나 | 현재 · 근거 | ready | 1 |
| `people.night_lights` | 밤의 불빛 | 밤에 밝은 도시는 어디인가 | 현재 · 근거 | ready | 1 |
| `people.population` | 인구 | 어디에 사람이 거주하나 | 현재 · 해석 · 근거 | ready | 3 |

### 여행 `travel` — 6개

| 현상 | 이름 | 질문 | 능력 | 상태 | 자료 |
|---|---|---|---|---|---|
| `travel.place_catalog` | 목적별 관광지 | 내 조건에 맞는 관광지는 어디에 있나 | 현재 · 해석 · 근거 | ready | 3 |
| `travel.place_sequence` | 연관 관광지 | 이곳 다음에 어디를 가나 | 사료 · 해석 · 근거 | ready | 1 |
| `travel.today_pick` | 오늘 갈 곳 | 오늘 어디를 가면 좋을까 | 현재 · 해석 · 근거 | ready | 1 |
| `travel.flight` | 항공편 | 비행기가 실제 어디에 있나 | — | planned | 1 |
| `travel.poi` | 여행지 | 여행지 정보를 찾으려면 | — | planned | 1 |
| `travel.visitor_pressure` | 지역 방문자 | 어느 기간에 방문이 많았나 | 사료 · 해석 · 근거 | partial | 1 |

### 재해 `hazards` — 7개

| 현상 | 이름 | 질문 | 능력 | 상태 | 자료 |
|---|---|---|---|---|---|
| `hazards.crustal_motion` | 지각 이동 속도 | 땅이 어느 방향으로 움직이나 | 현재 · 해석 · 근거 | ready | 2 |
| `hazards.earthquake` | 지진 | 최근 지진은 어디서 났나 | 현재 · 사료 · 해석 · 예보 · 근거 · 리포트 | ready | 3 |
| `hazards.tsunami` | 쓰나미 | 현재 유효한 쓰나미 정보는 | 현재 · 해석 · 시뮬 · 근거 | ready | 1 |
| `hazards.typhoon` | 태풍 | 공식 태풍 경로는 | 현재 · 해석 · 예보 · 근거 · 리포트 | ready | 4 |
| `hazards.wildfire` | 산불 | 지금 어디가 불타고 있나 | 현재 · 해석 · 예보 · 근거 · 리포트 | ready | 2 |
| `hazards.glacial_lake_flood` | 빙하호 홍수 | 빙하호 붕괴 시 영향은 | — | planned | 1 |
| `hazards.lightning` | 낙뢰 | 최근 주변에 낙뢰가 있었나 | 현재 · 근거 | partial | 1 |

### 우주 `space` — 8개

| 현상 | 이름 | 질문 | 능력 | 상태 | 자료 |
|---|---|---|---|---|---|
| `space.aurora` | 오로라 | 어디에서 오로라를 볼 가능성이 있나 | 해석 · 예보 · 근거 · 리포트 | ready | 1 |
| `space.galaxy` | 우리은하 | 우리 태양계는 은하 어디에 있나 | 근거 | ready | 1 |
| `space.photo` | 우주 사진 | 이 우주 사진은 무엇을 보여주나 | 사료 · 해석 · 근거 | ready | 1 |
| `space.satellite` | 위성 | 위성은 지금 어디에 있는가 | 현재 · 해석 · 근거 | ready | 2 |
| `space.solar_activity` | 태양 활동 | 태양 활동의 최신 상태는 | 현재 · 해석 · 근거 | ready | 1 |
| `space.solar_system` | 태양계 | 행성은 지금 어디에 있나 | 현재 · 해석 · 근거 | ready | 1 |
| `space.orbital_debris` | 우주 쓰레기 | 관심 물체와 근접 사건은 | 현재 · 해석 · 예보 · 근거 · 리포트 | partial | 1 |
| `space.rocket_launch` | 로켓 발사 | 다음 로켓 발사는 언제인가 | 해석 · 예보 · 근거 | partial | 1 |

---

## 4. 충돌 해소 — 지침서 §4 필수 식별자 규칙

`MENU_QUESTIONS[l.id]` 는 bare id 라서 같은 id 가 두 씬에 있으면 한쪽이 다른 쪽 답을 가져간다. 레지스트리는 복합키를 쓰므로 성립하지 않는다.

```js
questionForLayer('ocean', 'surf')  // → '갈 해변이나 낚시 장소는'
questionForLayer('hobby', 'surf')  // → '이 해변에 너울이 들어오는가'   ← 오늘은 위 문장이 나온다
```

| 충돌 | 판정 | 근거 |
|---|---|---|
| `surf` | **분리 유지** — `ocean.coastal_spots` vs `ocean.surf_conditions` | 서로 다른 산출물이다. ocean 은 OSM 해변·낚시터 **장소 목록**(271+946곳), hobby 는 Open-Meteo **너울 상태**다 |
| `vessel` | **병합** — `ocean.vessel_traffic` 하나 | 같은 출처(KOMSA MTIS)의 같은 현상이다. `ocean/vessel` 은 `LOCKED` 죽은 항목이고(AIS 재배포 안 함 정책) `hobby/vessel` 이 살아있는 쪽이다 |

> 병합 판정은 처음 지시("surf 도 vessel 도 병합 금지")를 **자료가 뒤집은 것**이다. vessel 은 실제로 하나의 현상이었다.

---

## 5. LAB · 취미는 삭제하지 않고 재분류했다 (지침서 §29)

`lab`·`hobby` 도메인은 없앴다. 16개 레이어 전부 실제 현상이 속한 도메인으로 옮겼고 능력은 하나도 버리지 않았다.

| 이전 | 이후 현상 | 역할 |
|---|---|---|
| `hobby/dive` | `ocean.deep_sea` | primary |
| `hobby/ecobird` | `land.bird_survey` | primary |
| `hobby/fishing` | `ocean.fishing_conditions` | primary |
| `hobby/migbird` | `land.bird_migration` | primary |
| `hobby/mountain` | `weather.mountain_summit` | primary |
| `hobby/para` | `weather.paragliding` | primary |
| `hobby/seabird` | `ocean.seabird` | primary |
| `hobby/surf` | `ocean.surf_conditions` | primary |
| `hobby/trench` | `ocean.trench` | data_product |
| `hobby/turtle` | `ocean.sea_turtle` | primary |
| `hobby/vessel` | `ocean.vessel_traffic` | entrypoint |
| `lab/charts` | `weather.climate_series` | tool |
| `lab/crust` | `hazards.crustal_motion` | tool |
| `lab/reports` | `NONE` | entrypoint |
| `lab/requests` | `NONE` | entrypoint |
| `lab/today` | `weather.daily_extremes` | tool |

LAB 5개는 `role: tool` 이다 — 1차 탐색 경로가 아니라 고급/연구 문맥 뒤에 둔다.
