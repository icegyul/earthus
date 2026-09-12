# EARTHUS ICON SYSTEM — CLAUDE CODE DEVELOPMENT DIRECTIVE v1.1

## STATUS

This is the binding icon implementation addendum for EARTHUS V1 and V2.

It supersedes any older icon-specific UI instructions when there is a conflict.
It does NOT change data contracts, engine calculations, provider contracts, or the 3-stage EARTHUS product architecture.

The approved icon style is the circular glossy / semi-3D / gradient / glass-glow visual family shown in the reference boards.

## 1. NON-NEGOTIABLE PRODUCT RULE

EARTHUS navigation remains:

`1차 DATA → 현재/변화/이상징후/비교 → 2차 INTELLIGENCE → REPORT → 3차 SIMULATION → USER AI`

- Intelligence is NOT a standalone primary left/top navigation item.
- Simulation is NOT a standalone primary left/top navigation item.
- A matching data icon always represents the underlying observable phenomenon.
- Intelligence and Simulation are workflow actions inside the selected data context.

## 2. V1 APPLICATION

V1 keeps its familiar direct menu behavior.

For every existing V1 menu label that matches a registry entry:
- replace the old icon with the registry asset;
- keep the existing menu label and semantic meaning;
- keep the icon visually ahead of the label;
- do not redesign the V1 information architecture as part of this icon task;
- keep the icon family identical to V2.

Recommended runtime sizes:
- desktop: 32–48px
- compact: 24–32px
- hover/active: same asset with CSS state treatment

## 3. V2 APPLICATION

The V2 left navigation uses the same registry.

For every first-order data menu:
- 28–32px icon beside the label on desktop;
- 24–28px on compact/mobile drawer;
- selected item uses active ring/glow;
- text remains visible on mobile;
- never replace the whole menu with unlabeled icon-only navigation.

The left navigation should show first-order data/phenomena, not the analysis workflow.

## 4. ICON FILE RULE

Registry root:

`assets/icons/`

Standard filenames:

`earthus-icon-[slug]-128.png`
`earthus-icon-[slug]-64.png`
`earthus-icon-[slug]-32.png`
`earthus-icon-[slug]-24.png`

Use the same slug in V1 and V2.

If the source repository uses a different static asset root, COPY the registry into that root without changing the icon IDs.

## 5. PRIMARY MENU ICON MAPPING

| ID | Korean | English | Asset |
|---|---|---|---|
| `temperature` | 기온 | Temperature | `earthus-icon-temperature-64.png` |
| `precipitation` | 강수 | Precipitation | `earthus-icon-precipitation-64.png` |
| `wind` | 바람 | Wind | `earthus-icon-wind-64.png` |
| `pressure` | 기압 | Pressure | `earthus-icon-pressure-64.png` |
| `sea-level` | 해수면 | Sea Level | `earthus-icon-sea-level-64.png` |
| `ocean-current` | 해류 | Ocean Current | `earthus-icon-ocean-current-64.png` |
| `sea-temperature` | 수온 | Sea Temperature | `earthus-icon-sea-temperature-64.png` |
| `typhoon` | 태풍 | Typhoon | `earthus-icon-typhoon-64.png` |
| `glacier` | 빙하 | Glacier | `earthus-icon-glacier-64.png` |
| `snow-ice` | 적설·빙설 | Snow & Ice | `earthus-icon-snow-ice-64.png` |
| `flood-hydrology` | 홍수·수문 | Flood & Hydrology | `earthus-icon-flood-hydrology-64.png` |
| `drought` | 가뭄 | Drought | `earthus-icon-drought-64.png` |
| `wildfire` | 산불 | Wildfire | `earthus-icon-wildfire-64.png` |
| `landslide` | 산사태 | Landslide | `earthus-icon-landslide-64.png` |
| `earthquake` | 지진 | Earthquake | `earthus-icon-earthquake-64.png` |
| `tsunami` | 지진해일 | Tsunami | `earthus-icon-tsunami-64.png` |
| `storm-surge` | 해안재해 | Storm Surge | `earthus-icon-storm-surge-64.png` |
| `sea-ice` | 해빙 | Sea Ice | `earthus-icon-sea-ice-64.png` |
| `permafrost` | 영구동토 | Permafrost | `earthus-icon-permafrost-64.png` |
| `air-quality` | 대기질 | Air Quality | `earthus-icon-air-quality-64.png` |
| `satellite-observation` | 위성·관측 | Satellite & Observation | `earthus-icon-satellite-observation-64.png` |
| `ecosystem` | 생태계 | Ecosystem | `earthus-icon-ecosystem-64.png` |
| `agriculture` | 농업 | Agriculture | `earthus-icon-agriculture-64.png` |
| `population-society` | 인구·사회 | Population & Society | `earthus-icon-population-society-64.png` |
| `forecast-scenario` | 미래예측 | Forecast & Scenario | `earthus-icon-forecast-scenario-64.png` |
| `tourism-culture` | 관광·문화 | Tourism & Culture | `earthus-icon-tourism-culture-64.png` |
| `urban-infrastructure` | 도시·인프라 | Urban & Infrastructure | `earthus-icon-urban-infrastructure-64.png` |
| `energy` | 에너지 | Energy | `earthus-icon-energy-64.png` |
| `water-resources` | 수자원 | Water Resources | `earthus-icon-water-resources-64.png` |
| `food-vegetation` | 식량·식생 | Food & Vegetation | `earthus-icon-food-vegetation-64.png` |
| `health` | 건강 | Health | `earthus-icon-health-64.png` |
| `economy` | 경제 | Economy | `earthus-icon-economy-64.png` |
| `education` | 교육 | Education | `earthus-icon-education-64.png` |
| `policy-regulation` | 정책·규제 | Policy & Regulation | `earthus-icon-policy-regulation-64.png` |
| `ai-research` | AI 연구 | AI Research | `earthus-icon-ai-research-64.png` |
| `settings` | 설정 | Settings | `earthus-icon-settings-64.png` |

## 6. 55-LAYER ICON MAPPING

The 55-layer blueprint remains the product/data reference. The primary icon system is intentionally smaller and reusable.

Sub-layers inherit the parent/nearest semantic icon so that the left menu does not become visually noisy.

| No. | Layer | Icon ID | Rule |
|---:|---|---|---|
| 1 | 천리안2A 자동 | `satellite-observation` | parent observation icon |
| 2 | 천리안2A 적외 | `satellite-observation` | parent observation icon |
| 3 | 천리안2A 야간 하층운 | `satellite-observation` | parent observation icon |
| 4 | 천리안2A 한반도 가시광 | `satellite-observation` | parent observation icon |
| 5 | 천리안2A 전면 가시광 | `satellite-observation` | parent observation icon |
| 6 | 천리안2A 동아시아 적외 | `satellite-observation` | parent observation icon |
| 7 | 천리안2A 동아시아 가시광 | `satellite-observation` | parent observation icon |
| 8 | 천리안2A 수증기 | `satellite-observation` | parent observation icon |
| 9 | 히마와리9 자동 | `satellite-observation` | parent observation icon |
| 10 | 히마와리 구름 꼭대기 온도 | `satellite-observation` | parent observation icon |
| 11 | 전지구 합성 구름 | `satellite-observation` | parent observation icon |
| 12 | 수오미 NPP 실사 | `satellite-observation` | parent observation icon |
| 13 | 기온 | `temperature` | exact primary icon |
| 14 | 바람 | `wind` | exact primary icon |
| 15 | 습도 | `precipitation` | inherit nearest moisture/weather icon until dedicated humidity primary icon exists |
| 16 | 수증기 통로 | `precipitation` | inherit nearest moisture/weather icon until dedicated vapor primary icon exists |
| 17 | 내일 최고기온 | `temperature` | inherit temperature icon |
| 18 | 내일 최저기온 | `temperature` | inherit temperature icon |
| 19 | 내일 바람 | `wind` | inherit wind icon |
| 20 | 오로라 | `satellite-observation` | observation/space parent icon |
| 21 | 검증 이벤트 | `satellite-observation` | generic observation/event parent icon |
| 22 | 태풍 | `typhoon` | exact primary icon |
| 23 | 지진 | `earthquake` | exact primary icon |
| 24 | 쓰나미 | `tsunami` | exact primary icon |
| 25 | 기상경보 | `typhoon` | hazard/weather family icon; no standalone primary icon |
| 26 | 각국 기관 재해 | `storm-surge` | hazard family icon; event surface inherits hazard family |
| 27 | 낙뢰 | `typhoon` | hazard/weather family icon |
| 28 | 산불 | `wildfire` | exact primary icon |
| 29 | 초미세먼지 PM2.5 | `air-quality` | exact primary icon |
| 30 | 미세먼지 PM10 | `air-quality` | inherit air-quality icon |
| 31 | 먼지·황사 | `air-quality` | inherit air-quality icon |
| 32 | 대기질 AQI | `air-quality` | inherit air-quality icon |
| 33 | 자외선 | `air-quality` | inherit atmosphere/air icon |
| 34 | 오존 | `air-quality` | inherit atmosphere/air icon |
| 35 | 해수면 온도 | `sea-temperature` | exact primary icon |
| 36 | 수온 편차 | `sea-temperature` | inherit sea-temperature icon |
| 37 | 파고 | `sea-level` | nearest sea-surface icon; use only where wave-specific icon is unavailable |
| 38 | 너울 | `sea-level` | nearest sea-surface icon |
| 39 | 해류 | `ocean-current` | exact primary icon |
| 40 | 안개 | `precipitation` | nearest weather/moisture icon |
| 41 | 토양 수분 | `water-resources` | nearest water resource icon |
| 42 | 기압 배치 | `pressure` | exact primary icon |
| 43 | 비구름·강수 | `precipitation` | exact primary icon |
| 44 | 지상 관측소 | `satellite-observation` | observation parent icon |
| 45 | 영국 예보 | `forecast-scenario` | exact forecast icon |
| 46 | 관측 공백 | `satellite-observation` | observation parent icon |
| 47 | 해양 부이 | `ocean-current` | ocean observation parent icon |
| 48 | 대기오염 실측 | `air-quality` | exact primary icon |
| 49 | 일식 | `satellite-observation` | space observation parent icon |
| 50 | 열돔 | `temperature` | temperature/heat family icon |
| 51 | 해양 환류 | `ocean-current` | ocean-current family icon |
| 52 | 관광 밀도 | `tourism-culture` | exact primary icon |
| 53 | 명소 | `tourism-culture` | exact primary icon |
| 54 | 항공기 | `urban-infrastructure` | nearest infrastructure/transport icon |
| 55 | 선박 | `ocean-current` | nearest marine movement icon |

## 7. STATES

Default:
- normal brightness
- clean circular silhouette
- restrained glow

Hover:
- slight lift
- slightly stronger glow
- no large size jump

Active:
- thin luminous ring
- focused glow
- keep label and icon alignment unchanged

Disabled:
- desaturated
- lower glow
- remain recognizable

## 8. MOBILE

Do not shrink the full desktop icon wall into the mobile viewport.

Use:
- compact icon + label;
- drawer / grouped primary menu;
- consistent 24–28px asset;
- one active primary subject;
- close the navigation drawer after a primary selection when appropriate;
- secondary actions appear in the selected subject context.

## 9. CONTEXT RULE FOR INTELLIGENCE

When the user selects a primary item such as:

`기온`

the subject context becomes:

`기온 → 현재 → 변화 → 이상징후 → Intelligence`

For:

`해수면`

the subject context becomes:

`해수면 → 현재 → 변화 → 이상징후 → Intelligence`

Do not move Intelligence back to the main navigation.

## 10. CONTEXT RULE FOR SIMULATION

After Intelligence/report:

`Intelligence Report → Simulation (Pro+)`

Simulation uses the approved User AI + Simulation Engine architecture.
The AI is the scenario interaction layer; the actual calculation remains in the Simulation Engine.

## 11. FORBIDDEN ICON PRACTICES

Do not use:
- emoji as primary menu icons;
- mixed icon libraries;
- Font Awesome/Lucide/Material symbols for the main EARTHUS data menu;
- unique icon styles made ad hoc by a single developer;
- text glyphs as substitutes for missing artwork;
- new colors or silhouettes for individual menus without versioning the icon system.

## 12. FUTURE MENU RULE

Every new first-order EARTHUS menu must:
1. receive a new registry ID;
2. use the same circular EARTHUS visual language;
3. receive 128/64/32/24px variants;
4. be added to the registry;
5. be mapped in V1/V2 placement;
6. inherit the same active/hover/disabled state behavior;
7. attach Intelligence as a second-stage contextual action;
8. attach Simulation as the third-stage Pro+ action when a validated solver exists.

Use `EARTHUS_ICON_GENERATION_MASTER_PROMPT_v1.0.md` for new icon generation.

## 13. ACCEPTANCE TEST

Claude Code must verify:

- V1 and V2 use the same icon ID for the same label.
- No primary menu uses a legacy mixed icon family.
- No standalone Intelligence primary icon exists.
- No standalone Simulation primary icon exists.
- All visible primary data menus have a registry asset.
- Mobile icons remain recognizable at 24–28px.
- Active/hover states are consistent.
- No icon/text clipping at 375/390/430px.
- No desktop menu overflow caused by icon replacement.
- Existing data/engine behavior is unchanged.

## 14. SOURCE-OF-TRUTH FILES IN THIS PACKAGE

- `EARTHUS_ICON_GENERATION_MASTER_PROMPT_v1.0.md`
- `EARTHUS_ICON_MENU_REGISTRY_v1.1.json`
- `EARTHUS_V1_V2_ICON_APPLICATION_DIRECTIVE_v1.0.md`
- `EARTHUS_ICON_SYSTEM_DEV_DIRECTIVE_v1.1.docx`
- `reference/*`

