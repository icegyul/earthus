# SIMULATION CAPABILITY CROSSWALK (§G-2)

**문서 ID**: SIMULATION-CAPABILITY-CROSSWALK-2026-09-14
**성격**: `EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md` §G-2의 대조표. **Simulation Capability Registry의 근거 문서**이지 기능 목록이 아니다.
**대조 대상**: Simulation Vision 19영역 ↔ `prototype/v2-three/js/phenomenon-registry.js` `PHENOMENA` 66현상 ↔ `prototype/v2-three/js/sim-questions.js` `SIM_CAPABILITIES`.
**실측 기준일**: 2026-09-14.

> **분리 원칙** — 이 문서는 **"현재 시스템에 무엇이 실제로 존재하는가"**만 다룬다.
> 무엇을 만들 것인가 = `SIMULATION-VISION-LADDER-2026-09-14.md`(§H) · 검증기 구현 = 계약 §I · 위반 검사 = 계약 §J.
> **운영 중 규율 위반 9건은 이 문서에 넣지 않는다** — 사다리 §2에 있다. 성격이 다른 문제다.

---

## §0. 두 문장 원칙

> **"자료가 있다" ≠ "Simulation이 있다".**
> **"기관 데이터가 있다" ≠ "EARTHUS가 예측한다".**

기관 태풍 예보를 표시할 수 있다는 것은 **유형 A 증거를 쓸 수 있다**는 뜻이지, EARTHUS가 `cyclone forecast engine`을 가진다는 뜻이 아니다. 이 구분을 대조표가 강제한다. 그래야 "19개 시뮬레이션 지원" 같은 문구가 화면·홈페이지에 나오지 않는다(MASTER DECISION 결정 14).

---

## §1. 상태 어휘 — 새로 만들지 않는다

저장소에 이미 있는 것만 쓴다. `AVAILABLE/FOUNDATION/PLANNED/DEPRECATED` 같은 새 상태값을 만들지 않는다.

| 필드 | 값 | 정본 |
|---|---|---|
| `CAPABILITY_STATUS` | `available` · `limited` · `not_available` · `not_evaluable` · `unavailable` | `sim-questions.js` `SIM_STATUS` 5종 (잠긴 시험이 개수를 고정) |
| `availability` (자료 준비도) | `ready` · `partial` · `planned` | `phenomenon-registry.js` — 47 / 15 / 4 |
| `capabilities.simulation` | boolean | 같은 파일. **현재 true는 3건** |
| `EVIDENCE_TYPE` | A · B · C · D | 지시서 부록 B (증거 종류) |
| `STAGE` | NOW · NEXT · RND · FUTURE · NEVER | 사다리 |
| `TIER` | 0~4 | MASTER DECISION §4 |

**`availability`와 `CAPABILITY_STATUS`는 다른 축이다.** 자료가 `ready`여도 능력은 `not_available`일 수 있다 — 그게 정상이고, 대부분이 그렇다.

---

## §2. 실측 — 지금 등록돼 있는 것

`SIM_CAPABILITIES` 항목은 **12개**다. "능력 3개"는 그중 `available`의 수다.

| id | status | engineRef | 실제 계산인가 |
|---|---|---|---|
| `hazards.tsunami` | **available** | `aws/tsunami-eta/handler.py` | **예** — √(g·h) Dijkstra, 단위시험 8/8, 운영 |
| `ocean.wave` | **available** | `prototype/v2-three/js/sim-ocean.js` | **아니오** — 장면 표현. 사다리 V-2 정정 대상 |
| `space.satellite` | **available** | (궤도 전파) | 예 — SGP4 계열 |
| `hazards.typhoon` | limited | `js/intel-feed.js` | **아니오** — 기관 경로선. "우리가 만든 이동 계산 엔진은 없다"가 엔진 설명에 이미 적혀 있다 |
| `weather.precipitation` · `ocean.surface_current` · `ocean.sst` · `ocean.coastal_inundation` · `hazards.wildfire` · `people.population` · `travel.visitor_pressure` · `land.terrain` | not_available ×8 | — | 사유 문장 보유 |

**`capabilities.simulation: true`는 3건**(`hazards.tsunami` · `ocean.wave` · `space.satellite`)이고 `available` 3건과 일치한다.
→ **`ocean.wave` 정정(V-2) 시 `capabilities.simulation`도 함께 false로 내려야 두 파일이 어긋나지 않는다.**

**이미 `not_available` + 사유로 8건이 등록돼 있다.** 비전 도메인 등재는 새 관행이 아니라 이 방식의 확장이다.

---

## §3. 대조표 — 19영역 × PHENOMENA 66

`PH` = 대응 현상 id · `CAP` = 현재 `SIM_CAPABILITIES` 상태(`—` = 항목 없음) · `T` = Evidence Type · `S` = Stage

| # | VISION DOMAIN | PH (PHENOMENA) | avail | CAP | T | S | TIER | ENGINE / SOURCE | VALIDATION |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 빙하 Glacier | **없음** | — | — | A·D | NOW(인용) | 2 | RGI 7.0 · WGMS FoG · C3S 격자 | 불요(인용) |
| 2 | GLOF | `hazards.glacial_lake_flood` | ready | **—** | A·D → C(RND) | NOW(인용) / RND(물길) | 2 | NSIDC HMA_GLI · ICIMOD PDGL · Potsdam GLOF DB | L0→L1 Malpasset→L2 |
| 3 | 적설 Snow | `land.snow_cover` | ready | **—** | A | NEXT(겨울 전 동결) | 2 | `kma-aws` SD_TOT/SD_DAY/SD_HR3(사문 필드 정정) | 파싱 검증 1회 |
| 4 | 하천 홍수·댐 | **없음** | — | — | A | NOW(수집기 뒤) | 2 | HRFCO · K-water · 홍수특보 | 불요(인용) |
| 5 | 돌발·도시 침수·유역 | **없음** | — | — | C | **FUTURE** | 2 | 없음 | L0→L1→L2 IoU |
| 6 | 폭우 Extreme Rain | `weather.precipitation` | partial | **not_available** | A + 기준선 | NOW(A) / NEXT(집계) | 2 | AWS 736지점 실측 · 기상청 예보 | 자기일관성 검사 |
| 7 | 태풍 Typhoon | `hazards.typhoon` | ready | **limited** | A + C(가정) | NOW | 2 | KMA·JMA·NHC 경로 · ECMWF ENS · `cyclone-analog` | 발표 원문 대조 |
| 8 | 폭염 Heatwave | `weather.temperature` · `.temperature_anomaly` · `.daily_extremes` | partial/ready | **—** | A + 기준선 | NOW(A) / NEXT(체감) | 2 | 폭염특보 3단계 · `korea.js feelsLike` | 기상청 지점값 1회 대조 |
| 9 | 가뭄 Drought | **없음** | — | — | A | NOW(수집기 뒤) | 2 | K-water SPI · 댐 저수율 · HRFCO 유량 · 행안부 예·경보 | 불요(인용) |
| 10 | 산사태 Landslide | **없음** | — | — | A → B(RND) | NOW(인용) / RND(I–D) | 2 | 산림청 예측정보 | 발생 시각 이력 필요 |
| 11 | 눈사태 Avalanche | **없음** | — | — | A(해외만) | **FUTURE**(국내 자료 0) | 3 | avalanche.org · SAIS | — |
| 12 | 해양 Ocean | `ocean.surface_current` · `.sst` · `.sst_anomaly` · `.subsurface_profile` · `.sea_observation` · `.wave` | ready | not_available ×3, available ×1 | A + C(표류) | NOW(A) / NEXT(표류) | 2 | CMEMS · OISST · KHOA · OceanParcels | GDP 부이 채점 |
| 13 | 쓰나미 Tsunami | `hazards.tsunami` | ready | **available** | **C(운영)** + A | **운영** | **1** | `aws/tsunami-eta` eta-v1 | PTWC 대조 · 단위시험 8/8 |
| 14 | 폭풍해일 Storm Surge | **없음** | — | — | A + 기준선 | NOW(특보) / FUTURE(동역학) | 2 | 폭풍해일 특보 · KHOA 조위 | 잔차 사후 MAE |
| 15 | 해안 침수 Coastal Flood | `ocean.coastal_inundation` | ready | **not_available** | A + C(노출 셈) | NOW(A) / NEXT(노출) | 2 | KHOA 침수정보 · GLO-30 · AR6 | L1·L2 **미확보** |
| 16 | 해빙 Sea Ice | `ocean.sea_ice` | ready | **—** | A + 기준선 | NOW | 3 | NSIDC G02135 · OSI-SAF | 통계 카드(채점 불요) |
| 17 | 영구동토 Permafrost | **없음** | — | — | A·D | **FUTURE** | 3 | ESA CCI ALT·GT | — |
| 18 | 산불 Wildfire | `hazards.wildfire` | ready | **not_available** | A + 기준선 | NOW(A) / NEXT(실효습도) | 2 | 산림청 위험지수 · FIRMS | 건조특보 이진 채점 |
| 19 | 대기 Atmosphere | `weather.wind` · `.pressure` · `.cloud` · `.upper_moisture` | partial/ready | **—** | A | NOW | 3 | 동네예보 · 고층 공식값 · GFS·ECMWF | 불요(인용) |
| 20 | 대기오염 Air Pollution | `weather.air_quality` | partial | **—** | A | NOW(전환 뒤) | 2 | 에어코리아 · CAMS | 불요(인용) |
| 21 | 해수면 Sea Level | `ocean.sea_level_rise` | ready | **—** | D + C(노출) | NOW(D) / NEXT(노출) | 3 | AR6 · KHOA SSP | #15와 공유 |
| 22 | Earth System Cascade | **없음**(연결표) | — | — | 관계 | **FUTURE** | 4 | `phenomenon-relations` | — |

> 비전 문서의 절 번호 기준 19영역에 대기오염·해수면·Earth System을 분리해 22행으로 폈다. 묶으면 19다.

---

## §4. 판정 — 셋으로 갈린다

### 4-1. 지금 등재 가능 (기존 현상 있음 · `SIM_CAPABILITIES` 항목 없음) — **9건**

PD 승인 없이 지금 `not_available` + `reasonKo`/`reasonEn`으로 넣을 수 있다. 잠긴 시험이 요구하는 것은 "실행 액션 없음 + 사유 있음"뿐이다.

| 현상 id | 사유 문장(초안) |
|---|---|
| `hazards.glacial_lake_flood` | 빙하호 붕괴 물길을 계산하는 검증된 엔진이 없습니다. 기관 인벤토리(NSIDC·ICIMOD)와 과거 사례는 볼 수 있습니다. |
| `hazards.earthquake` | 여진 기대수 계산은 채점 이력을 갖춘 뒤 공개합니다. 지금은 기관 발표와 과거 기록만 있습니다. |
| `land.snow_cover` | 적설 깊이 자료를 아직 받고 있지 않습니다(겨울 실자료 확인 전). |
| `ocean.sea_ice` | 해빙 이동을 계산하는 엔진이 없습니다. 기관 관측 면적과 평년 대비는 볼 수 있습니다. |
| `ocean.sea_level_rise` | 해수면 상승 자체는 기관 전망 인용입니다. 침수 범위 노출 셈은 검증 뒤 공개합니다. |
| `ocean.subsurface_profile` | 깊이별 해류 계산은 하지 않습니다. 기관 분석장을 그대로 보여줍니다. |
| `weather.temperature` | 기온 예보는 기상청 발표를 인용합니다. 우리가 만든 기온 계산은 없습니다. |
| `weather.air_quality` | 대기질 확산 계산은 하지 않습니다. 측정소 관측값과 기관 예보를 보여줍니다. |
| `weather.wind` | 바람장은 기관 수치예보를 그대로 그립니다. 우리가 만든 바람 계산은 없습니다. |

### 4-2. 현상 신설이 필요 (PD 승인 — `PHENOMENA` 66이 바뀐다) — **8건**

빙하 · 하천 홍수·댐 · 돌발/도시 침수·유역 · 가뭄 · 산사태 · 눈사태 · 폭풍해일 · 영구동토.

> 현상을 새로 만들면 잠긴 시험의 `PHENOMENA` 개수 단정(66)이 깨진다. **기존 현상에 붙일 수 있는지 먼저 확인**하고, 없을 때만 신설을 올린다. 신설 시 레이어 id 개명 금지 규칙이 함께 걸린다.

### 4-3. 정정이 필요 (이미 등재됐으나 사실과 다름) — **3건**

**경계 정의는 새로 만들 필요가 없다. 저장소에 이미 있다.** `SIMULATION_PLATFORM_MAPPING.md` §0.1 원문:

> 그 밖 브라우저 내 계산(`sim-ocean.js` Gerstner 파도, **`sat-layer.js` SGP4**)은 **장면 표현**이지 기록 남는 실행이 아니다. `simulation_run` 대상이 아니다.

`ocean.wave`와 `space.satellite`는 **같은 문장에 나란히 묶여** 있고, 둘 다 계산 엔진 5종(research-runtime V1·V2 / tsunami-eta / lab-events / 오염 수송) 밖이다. 따라서 둘은 같은 처리를 받아야 한다.

| 대상 | 문제 | 조치 |
|---|---|---|
| `ocean.wave` | `available` + "파도 물리" — §N 통과 사실 없음. MAPPING §0.1이 **장면 표현**으로 분류 | `limited` + 사유, 배지 `VISUALIZATION_ONLY`, `wave-typhoon` 질문 제거, **`capabilities.simulation` → false** |
| `space.satellite` | `available` — **MAPPING §0.1이 `ocean.wave`와 같은 줄에서 장면 표현으로 분류**. `sat-layer.js`(230줄)에 채점·검증 코드 0건, `validationPlanId`·`limits[]` 없음, §N ③ 미충족 | `limited` + 사유, **`capabilities.simulation` → false** |
| `hazards.typhoon` | `limited`는 맞으나 `temporalMode`에 "ensemble spread" | "ECMWF ENS 51개 퍼짐(PROVIDER_FORECAST)"로 |

**정정 뒤 `available`은 1건**(`hazards.tsunami`)이 된다. 이것이 정직한 수다.

**왜 `not_available`이 아니라 `limited`인가**: 화면 기능은 실재한다(파도 장면·위성 궤도 전파). 없는 것은 "기록 남는 검증된 계산"이다. 이미 `hazards.typhoon`이 같은 방식으로 `limited` + "이동 경로는 기관 공식 예보로 답합니다 — 우리가 만든 이동 계산은 아닙니다"를 쓰고 있다. 같은 문형을 따른다:

- `ocean.wave` → "지금 바다 장면을 그립니다 — 기록 남는 계산이 아니며 예보가 아닙니다."
- `space.satellite` → "카탈로그 궤도 요소로 현재 위치를 전파해 그립니다 — 기록 남는 계산이 아닙니다."

**세 파일을 한 변경 단위로 묶는다**: `sim-questions.js`(status·사유) + `phenomenon-registry.js`(`capabilities.simulation`) + 배지 표기. 한 파일만 고치면 레지스트리 간 논리가 어긋난다.

> `horizons` 문구가 이미 이 사실을 말하고 있었다 — `ocean.wave` "현재 값 기준 실시간 장면 — 시계열 예보 아님", `space.satellite` "현재 순간 전파 — 장래 궤적 일괄 계산은 아직", `hazards.tsunami` "사건별 단회 계산". 앞의 둘은 현재를 그리고, 셋째만 미래를 계산한다.

---

## §5. Capability Registry 레코드 형식

`SIM_CAPABILITIES` 항목에 붙일 주석 규약. 필드를 새로 만들지 않고 기존 구조 안에 적는다.

```js
'hazards.glacial_lake_flood': {
  menu: 'hazards',
  // DOMAIN     GLOF
  // TIER       2
  // TYPE       A(기관 인벤토리 인용) · D(문헌) → C는 S-B 브랜치
  // STAGE      NOW(인용) / RND(물길)
  // SOURCE     NSIDC HMA_GLI · ICIMOD PDGL · Potsdam GLOF DB 3,151건
  // VALIDATION L0 해석해 → L1 Malpasset → L2 문헌 GLOF (미착수)
  status: SIM_STATUS.NOT_AVAILABLE,
  questions: [{
    id: 'glof-path', ko: '이 빙하호가 터지면 물이 어디로 갈까?', en: '…',
    reasonKo: '빙하호 붕괴 물길을 계산하는 검증된 엔진이 없습니다. 기관 인벤토리와 과거 사례는 볼 수 있습니다.',
    reasonEn: '…',
    // action 없음 — 잠긴 시험이 강제
  }],
}
```

`available`로 올릴 때만 `engine` · `engineRef`(실제 파일) · `validationPlanId` · `limits[]`를 채운다(계약 §G-3).

---

## §6. 이 대조표가 막는 것

| 잘못된 메시지 | 대조표가 주는 답 |
|---|---|
| "19개 시뮬레이션 지원" | 실제 계산 능력 `available` = **1건**(정정 후, `hazards.tsunami`). 나머지는 장면 표현·기관 인용·문헌 관계 |
| "위성 궤도 시뮬레이션" | `sat-layer.js` SGP4는 MAPPING §0.1이 **장면 표현**으로 분류. 채점 코드 0건 |
| "태풍 예측 엔진 보유" | `hazards.typhoon` = `limited`, 엔진 설명에 "우리가 만든 이동 계산 엔진은 없다"가 이미 적혀 있다 |
| "홍수 시뮬레이션" | 대응 현상 자체가 없다. 수문 파이프라인 0 |
| "빙하 용융 예측" | 현상 없음 · 파이프라인 없음 · 시장 5개국에 빙하 없음 |
| "6개 엔진군" | 엔진이 있는 군은 Ocean·Hazard 둘. 나머지는 "기관 인용 묶음" |

---

## §7. 다음 단계

1. **4-3 정정 2건** → PD 승인 항목(`ocean.wave`).
2. **4-1 등재 9건** → 사유 문장 확정 후 반영. 잠긴 시험 그대로 통과.
3. **4-2 신설 8건** → PD 결정(`PHENOMENA` 66 변경).
4. 반영 후 계약 §J의 J-8·J-9 검사가 이 표를 지킨다.

미결정(계약 §K)과 법률 3건은 그대로 봉인. 결정 전 구현하지 않는다.
