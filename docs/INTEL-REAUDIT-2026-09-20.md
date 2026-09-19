# Intelligence 능력 66현상 재감사 — 2026-09-20 (P0)

INTELLIGENCE-LAYER-PLAN §3 P0 완료 기준: "`phenomenon-registry`의 `intelligence:true` 66건 재감사(패킷 만들 자료가 있는 것만 true) · 감사표(true→false 내려간 현상 목록)".

## 규칙 (기계적으로 적용했다 — 판단으로 고르지 않았다)

> `intelligence:true` ⇔ 그 현상의 `dataProducts` 중 **하나라도** `engine-bridge.js LAYER_TRUTH`에 등급이 있고, 그 등급이 `VISUALIZATION_ONLY`가 아니다.

이유: 인텔 패킷 v1의 모든 값은 `kind`(EVIDENCE_KIND)를 달아야 한다(`aws/_shared/intel_contract.py` J-1). `LAYER_TRUTH` 등급이 없는 자료는 `kind`를 정할 근거가 없고, `VISUALIZATION_ONLY`는 표현일 뿐 사실 주장이 아니다. 둘 중 하나뿐인 현상은 패킷을 만들면 검사기가 거절한다.

이 규칙은 `tools/earthus-v53/intel-questions.test.mjs`가 매번 다시 계산한다. 레지스트리를 고쳐 규칙을 어기면 시험이 깨진다.

## 결과

| | 개수 |
|---|---|
| 재감사 전 `intelligence:true` | 44 |
| **true → false** | **11** |
| 재감사 후 `intelligence:true` | 33 |
| false 인데 재료가 있는 현상(올리지 않음) | 15 |

### true → false (11)

| 현상 | 자료 | 내려간 이유 |
|---|---|---|
| `land.bird_migration` | hobby/migbird | LAYER_TRUTH 항목 없음 |
| `land.bird_survey` | hobby/ecobird | LAYER_TRUTH 항목 없음 |
| `land.terrain` | land/terrain, land/satdetail | 둘 다 VISUALIZATION_ONLY |
| `ocean.deep_sea` | hobby/dive | LAYER_TRUTH 항목 없음 |
| `ocean.fishing_conditions` | hobby/fishing | LAYER_TRUTH 항목 없음 |
| `ocean.seabird` | hobby/seabird | LAYER_TRUTH 항목 없음 |
| `ocean.surf_conditions` | hobby/surf | LAYER_TRUTH 항목 없음 |
| `weather.climate_series` | lab/charts | LAYER_TRUTH 항목 없음 |
| `weather.daily_extremes` | lab/today | LAYER_TRUTH 항목 없음 |
| `weather.mountain_summit` | hobby/mountain | LAYER_TRUTH 항목 없음 |
| `weather.paragliding` | hobby/para | LAYER_TRUTH 항목 없음 |

취미(hobby/)·LAB 메뉴 대부분이 여기 걸린다. 화면 카드에는 자기 출처를 적고 있지만, 레이어 단위 진리 등급이 없어 패킷의 `kind`를 기계적으로 정할 수 없다. **올리는 길**: 그 레이어를 `LAYER_TRUTH`에 등재하면(등급·SLA) 이 시험이 자동으로 다시 true를 허용한다.

화면 영향: 선택 문맥 한 줄(`information-caps`)에서 '해석' 글자가 빠진다. 탭은 바뀌지 않는다(`CAP_TAB`에 intelligence 칸이 없다).

### false 인데 재료가 있는 현상 (15) — 이번엔 올리지 않았다

`hazards.lightning` · `land.snow_cover` · `land.surface_temperature` · `ocean.bathymetry` · `ocean.coastal_inundation` · `ocean.coastal_spots` · `ocean.sst` · `ocean.surface_current` · `ocean.trench` · `people.night_lights` · `weather.fog` · `weather.precipitation` · `weather.pressure` · `weather.upper_moisture` · `weather.uv`

P0는 "재료 없는 true를 내리는" 감사다. 올리는 것은 **패킷 생산자가 생길 때** 한다 — `ocean.sst`는 P3, 나머지는 P6 순서표. 재료가 있다는 것과 띠가 있다는 것은 다르다.

### P3 뒤 갱신 (2026-09-20)

| 현상 | 전 | 후 | 패킷 생산자 |
|---|---|---|---|
| `ocean.sst` | false | **true** | `aws/marine-grid/intel_sst.py` → `ocean/sst-global.json` 의 `intel` 칸 |

`intelligence:true` 33 → **34**. 위 "false 인데 재료가 있는 현상"은 14개가 남는다(`ocean.sst` 제외).
`hazards.earthquake` 는 원래 true 였고, P3 에서 생산자가 생겼다 — `aws/lab-events/intel_quake.py` → `ocean/earthquake-intel.json`
(`packets[<USGS 사건 id>]`, 본진 30일 안·lab-events 추적 사건만).

## 같은 변경 단위에서 함께 고친 것 (계약 §G-2)

| 대상 | 전 | 후 | 근거 |
|---|---|---|---|
| `ocean.wave` | simulation:true · `available` · 배지 SIMULATION | simulation:false · `limited` + 한계 문장 · 배지 VISUALIZATION_ONLY · '태풍이 오면' 질문 삭제 | MAPPING §0.1 — Gerstner는 장면 표현 |
| `space.satellite` | simulation:true · `available` | simulation:false · `limited` + 한계 문장 | MAPPING §0.1 — SGP4는 장면 표현 |
| `hazards.typhoon` | temporalMode "ensemble spread" | "ECMWF ENS 51-member spread (PROVIDER_FORECAST)" | CROSSWALK §4-3 |
| `weather.warning` scope | "일본판은 2026-05-28 이후 멈춰" | "원본이 살아 있을 때만 목록 — 05-28~09-20 은 JMA r8 경로 이전을 못 따라갔다" | e44696d5 |
| SIM_CAPABILITIES | 12항목 · available 3 | 21항목 · available 1(쓰나미) · 등재 9건 `not_available` | CROSSWALK §4-1 |

정정 뒤 `simulation:true`는 **`hazards.tsunami` 하나**다. 파도·위성의 장면 버튼은 그대로 눌리고(limited+액션은 누를 수 있게 규칙을 바꿨다), 태풍 해상 가정 장면은 '능력'이 아니라 '미리보기(Preview)'로 따로 적어 시나리오 탭이 계속 열린다(§K-2 — Preview는 SIMULATION 배지 없음).
