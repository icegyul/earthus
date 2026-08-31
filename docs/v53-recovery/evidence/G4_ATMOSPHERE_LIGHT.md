# G4 Atmosphere / Light Evidence

검증 대상: preserved dirty working tree의 G4 명시적 대기·태양광 runtime

```text
EXPLICIT RAYLEIGH/MIE CONTRACT: PASS
FIXED-FRAME SUN DIRECTION: PASS
DAY / TERMINATOR / NIGHT BROWSER DIFFERENTIAL: PASS
TERRAIN + OCEAN SOLAR RESPONSE: PASS
RESTRAINED VIIRS NIGHT CONTEXT: PASS
OBSERVED-ONLY CLOUD SHADOW GATE: PASS_CONDITIONAL
G2 / G3 FULL REGRESSION: PASS
G4 ATMOSPHERE / LIGHT: LOCAL_PASS
```

배포·origin push·main merge는 수행하지 않았다. 이 판정은 G4 Atmosphere / Light Gate에만 적용하며 G5 Cloud, G6 Region Streaming을 대신하지 않는다.

## 기존 상태와 교정

| state | evidence | result |
|---|---|---|
| 기존 runtime | Cesium ground/sky atmosphere와 sun을 ON | `INCOMPLETE`; default ON만으로 G4 DONE 불가 |
| 첫 G4 browser assertion | production Cesium의 축약 생성자 이름 `dgt` | 검증 결함; `instanceof Cesium.SunLight`로 교정 |
| 첫 G4 visual | perturbed normal의 좁은 sun glint가 low-LOD surface tessellation을 강조 | visual reject; base ellipsoid normal의 smooth solar response로 교정 |
| 첫 VIIRS grade | night alpha `0.38`, brightness `0.92` | visual reject; `0.26 / 0.82`로 제한 |
| 최종 G4 | explicit atmosphere + captured UTC sun + bounded city light + truth-gated shadow | local acceptance PASS |

## PhysicalAtmosphereLightRuntime

- 부팅 시 현재 UTC를 한 번 캡처하고 Cesium clock을 정지한다.
- `Simon1994PlanetaryPositions` + ICRF/TEME→fixed 변환으로 지구 고정 좌표계 태양 방향을 계산한다.
- 사용자에게 예보 시각이나 합성 태양 방향을 만들지 않는다.
- 테스트는 재현 가능한 낮·terminator·밤 세 UTC 표본을 명시적으로 주입했다.
- one Viewer / one canvas를 유지한다.
- requestRenderMode와 clock 정지로 무한 애니메이션을 만들지 않는다.

## Explicit Earth atmosphere profile

| parameter | value |
|---|---:|
| Rayleigh coefficient | `[5.2e-6, 12.1e-6, 27.5e-6]` |
| Rayleigh scale height | `8,000m` |
| Mie coefficient | `[20e-6, 20e-6, 20e-6]` |
| Mie scale height | `1,200m` |
| Mie anisotropy | `0.82` |
| per-fragment atmosphere | `true` |
| SunLight intensity | `1.9` |
| terrain lighting fade | `9,000km → 20,000km` |

`dynamicAtmosphereLighting=true`, `dynamicAtmosphereLightingFromSun=true`, terrain lighting과 SunLight를 함께 검증했다. G3 ocean shader는 같은 `czm_sunDirectionEC`를 사용하되 base ellipsoid normal로 부드러운 광량 응답만 적용한다.

## Day / terminator / night evidence

Asia anchor: `112°E, 18°N`

| phase | UTC | fixed-frame sun direction | incidence cosine | frame SHA-256 |
|---|---|---|---:|---|
| DAY | `2026-08-31T04:00:00.000Z` | `[-0.495993369, 0.855212926, 0.150337717]` | `0.977296` | `a8ff0882a54cf745308e47b1d36e29dcd8f094cd9caeb06276d01752499d3363` |
| TERMINATOR | `2026-08-31T10:40:00.000Z` | `[0.928722994, 0.339688998, 0.148610179]` | `0.014584` | `121f4f59b6b5e94aabc7fe8c6ff282b573cb6c2af06e072f08df450b499f680c` |
| NIGHT | `2026-08-31T16:00:00.000Z` | `[0.495642113, -0.855957661, 0.147225605]` | `-0.885875` | `9bff5a8663e44cbd1a3ae6619c8013f4bedb4302a53c9c33df0260476995087c` |

세 UI-OFF 프레임을 직접 점검했다. 낮에는 지형·해양의 태양 방향 응답, terminator에서는 연속적인 주야 경계, 밤에는 대기 림과 제한된 도시광이 확인됐다. 낮 바다의 tessellation 강조와 과한 야간광은 최종 프레임에서 제거됐다.

## City light truth boundary

- source: `NASA GIBS VIIRS_CityLights_2012`
- truth class: `STATIC_NASA_VIIRS_2012_NIGHT_CONTEXT`
- day alpha: `0`
- night alpha: `0.26`
- brightness: `0.82`
- contrast: `1.05`
- saturation: `0.58`
- Trench/Underwater: hidden
- 현재 도시·인구·전력 상태로 해석하지 않는다.

## Cloud shadow truth boundary

G4는 관측 cloud shadow의 허용 조건만 고정한다. `NOAA_NESDIS_GMGSI` + `OBSERVED_2D_SHELL` + 유효 observation UTC + Earth surface mode가 모두 있을 때만 `VALID_OBSERVED_ONLY`다. 이번 default G4 캡처는 cloud fidelity가 `OFF`이므로 상태는 정확히 다음과 같다.

```text
status: UNAVAILABLE_NO_VALID_OBSERVATION
enabled: false
source: null
validAt: null
```

관측이 없는 shadow를 만들어 화면에 넣지 않았다. 실제 3D cloud output은 G5 범위다.

## G4 acceptance matrix

| gate | status | evidence |
|---|---|---|
| sun direction | `PASS` | normalized fixed-frame vectors, magnitude `1` |
| day/night | `PASS` | anchor cosine `0.977 → -0.886`, distinct frames |
| terminator | `PASS` | anchor cosine `0.014584`, UI-OFF half-lit Earth |
| Rayleigh/Mie | `PASS` | explicit non-default completion contract + runtime properties |
| terrain lighting | `PASS` | Terrain3D lighting, actual SunLight instance, intensity `1.9` |
| ocean lighting | `PASS` | fixed-sun specular model, no narrow tessellation glint |
| cloud shadow where valid | `PASS_CONDITIONAL` | observed-only policy; default capture correctly unavailable |
| restrained city light | `PASS` | NASA VIIRS 2012 static context, night-only alpha `0.26` |
| idle thermal policy | `PASS` | clock stopped, requestRenderMode true, idle frames / 1s `0` |

## Regression

- Node contract suite after G4: PASS
- default G2 browser: PASS, isolated global relief load `937ms`
- G3 ocean browser: PASS
- canonical imagery owner: Viewer 1, canvas 1, ArcGIS imagery owner 1
- Global→Asia→Korea→Seorak→Sokcho: `BROWSER_VERIFIED`
- sampled Mariana Trench mesh: PASS, atmosphere/city/ocean surface hidden
- sub-kilometer Underwater detail: PASS, atmosphere/city/ocean surface hidden
- syntax and `git diff --check`: PASS

## Screenshots

- `G4_DAY.png` — SHA-256 `a8ff0882a54cf745308e47b1d36e29dcd8f094cd9caeb06276d01752499d3363`
- `G4_TERMINATOR.png` — SHA-256 `121f4f59b6b5e94aabc7fe8c6ff282b573cb6c2af06e072f08df450b499f680c`
- `G4_NIGHT.png` — SHA-256 `9bff5a8663e44cbd1a3ae6619c8013f4bedb4302a53c9c33df0260476995087c`

## Final

```text
R0 RECONCILIATION: PASS
G2 GLOBAL REAL 3D: LOCAL_PASS
G3 REAL OCEAN: LOCAL_PASS
G4 ATMOSPHERE / LIGHT: LOCAL_PASS
G5 REAL 3D CLOUD: NOT STARTED
READY FOR PRODUCTION: NO
```
