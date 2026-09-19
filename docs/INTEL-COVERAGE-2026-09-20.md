# 현상별 인텔리전스 5칸 표 (P6 완료 기준) — 2026-09-20

> 생성: `node tools/earthus-v53/intel-coverage-table.mjs` — 손으로 고치지 않는다. 판정은 화면과 같은 `sectionStatus`.
> ✅ = 그 절의 재료가 패킷에 있다(띠에 질문이 뜬다) · — = 재료 없음(이유) · 생산자 없음 = 띠가 그려지지 않는다.

intelligence:true **34** 현상 중 패킷 생산자가 있는 것 **4** (운영 확인).

| 현상 | 이름 | 생산자 | WHAT | WHY | NEXT | IMPACT | EVIDENCE |
|---|---|---|---|---|---|---|---|
| `hazards.earthquake` | 지진 | `lab-events` → `ocean/earthquake-intel.json` | ✅ | — 지진과 같은 때·같은 자리에 잰 조건(응력·지각 변위) 관측이 이 계산기에 없다 — 기관 발표와 쓰나미 게시 | — 기관 여진 예보를 받는 수집기가 없다. EARTHUS 여진 기대수(RJ 일반형)는 '검증된 통계 모델'(유형 | — 쓰나미 도달시간 계산 대상이 아니다(M6.5 이상·진원 100 km 이하·바다·최근 10일) — 연결표에 있 | ✅ |
| `hazards.typhoon` | 태풍 | `cyclone-analog` → `ocean/cyclone-events/{id}.json` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ocean.sst` | 해수면 온도 | `marine-grid` → `ocean/sst-global.json` | ✅ | — 해수면 온도와 같은 때·같은 자리에 잰 조건(바람·일사·혼합층)을 이 자료가 담지 않는다 | — 해수면 온도 기관 예보를 받는 수집기가 없다 — 우리 예보는 만들지 않는다 | ✅ | ✅ |
| `weather.temperature_anomaly` | 평년 대비 기온 | `kma-aws` → `wind/kma-aws.json` | ✅ | — 같은 때·같은 자리의 조건(구름·바람·일사)을 이 패킷에 묶는 규칙이 아직 없다 | — 기상청 단기예보(kma-fcst)의 최고·최저 기온을 이 패킷에 옮기는 연결은 다음 단계다 — 우리 예보는  | — 기온과 이어진 현상을 계산한 연결이 없다 — 교과서 관계도 아직 등재하지 않았다 | ✅ |
| `hazards.crustal_motion` | 지각 이동 속도 | 생산자 없음 |  |  |  |  |  |
| `hazards.tsunami` | 쓰나미 | 생산자 없음 |  |  |  |  |  |
| `hazards.wildfire` | 산불 | 생산자 없음 |  |  |  |  |  |
| `land.crustal_motion` | 지각 이동 | 생산자 없음 |  |  |  |  |  |
| `land.forest` | 숲 | 생산자 없음 |  |  |  |  |  |
| `ocean.sea_ice` | 해빙 | 생산자 없음 |  |  |  |  |  |
| `ocean.sea_level_rise` | 해수면 상승 전망 | 생산자 없음 |  |  |  |  |  |
| `ocean.sea_observation` | 바다 실측 | 생산자 없음 |  |  |  |  |  |
| `ocean.sst_anomaly` | 평년 대비 수온 | 생산자 없음 |  |  |  |  |  |
| `ocean.subsurface_profile` | 수심별 수온 | 생산자 없음 |  |  |  |  |  |
| `ocean.wave` | 파고와 너울 | 생산자 없음 |  |  |  |  |  |
| `people.crowding` | 실시간 혼잡 | 생산자 없음 |  |  |  |  |  |
| `people.population` | 인구 | 생산자 없음 |  |  |  |  |  |
| `space.aurora` | 오로라 | 생산자 없음 |  |  |  |  |  |
| `space.orbital_debris` | 우주 쓰레기 | 생산자 없음 |  |  |  |  |  |
| `space.photo` | 우주 사진 | 생산자 없음 |  |  |  |  |  |
| `space.rocket_launch` | 로켓 발사 | 생산자 없음 |  |  |  |  |  |
| `space.satellite` | 위성 | 생산자 없음 |  |  |  |  |  |
| `space.solar_activity` | 태양 활동 | 생산자 없음 |  |  |  |  |  |
| `space.solar_system` | 태양계 | 생산자 없음 |  |  |  |  |  |
| `travel.place_catalog` | 목적별 관광지 | 생산자 없음 |  |  |  |  |  |
| `travel.place_sequence` | 연관 관광지 | 생산자 없음 |  |  |  |  |  |
| `travel.today_pick` | 오늘 갈 곳 | 생산자 없음 |  |  |  |  |  |
| `travel.visitor_pressure` | 지역 방문자 | 생산자 없음 |  |  |  |  |  |
| `weather.air_quality` | 대기질 | 생산자 없음 |  |  |  |  |  |
| `weather.cloud` | 구름 | 생산자 없음 |  |  |  |  |  |
| `weather.station_obs` | 지상 관측 | 생산자 없음 |  |  |  |  |  |
| `weather.temperature` | 기온 | 생산자 없음 |  |  |  |  |  |
| `weather.warning` | 기상 특보 | 생산자 없음 |  |  |  |  |  |
| `weather.wind` | 바람 | 생산자 없음 |  |  |  |  |  |

- `weather.temperature_anomaly`: 픽스처는 빠진 3시간을 채운 하루 — 운영은 어제 이력이 24회·8회를 못 채우면 평년차가 빈다

## 다음 생산자 후보 (PD 우선순위 결정용)

- `space.solar_activity`·`ocean.sea_observation`(부이) — 둘 다 `aws/ocean-solar` 가 쓰는 문서에 싣는 것이 자연스럽다. **그 파일에 다른 세션의 미커밋 수정(09-08, X선 0 채움 결측 수정)이 있어** 오늘 밤 손대지 않았다. 그 수정을 먼저 정리해야 한다.
- 공기질·파고 등 Open-Meteo 파생 현상 — 비상업 조항 결정(`docs/R0-OPEN-METEO-AUDIT-2026-09-20.md`) 전에는 공개 패킷을 늘리지 않는다.
- 나머지 — P0 감사표(`docs/INTEL-REAUDIT-2026-09-20.md`) 순서. 생산자가 생기기 전에는 띠가 없다(빈 띠 금지, 계약 §C-0).
