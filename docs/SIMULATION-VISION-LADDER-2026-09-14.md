# EARTHUS SIMULATION VISION LADDER

**문서 ID**: SIMULATION-VISION-LADDER-2026-09-14
**성격**: PD의 Simulation 비전(19영역·세부 150+)을 §N/§J 규율과 실제 자료·오픈모델·라이선스·특허로 대조한 결과. `EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md` §H의 Tier 2~4를 채우고, §G-2 대조표의 재료가 된다.
**근거**: 2026-09-14 조사 — 15영역 병렬 조사 + 15영역 적대적 반박 + 종합 + 완결성 비평(에이전트 32개). 원자료는 세션 저널(`wf_940cec82-3a6/journal.jsonl`)에 보존.
**읽는 법**: §0 축 정의 → §2 긴급 정정 → §3 사다리 → §10 한계. §10을 읽지 않고 §3만 인용하지 않는다.

---

## §0. 세 개의 축 — 글자를 섞지 않는다

비전 문서와 이 사다리에 **A/B/C/D**가 서로 다른 뜻으로 등장해 충돌한다. 아래로 고정한다.

| 축 | 값 | 무엇을 결정하나 | 정본 |
|---|---|---|---|
| **유형** (증거) | **A** 기관 예보·발표 인용 / **B** 검증된 통계모델 / **C** 물리 시뮬 / **D** 문헌 관계 | **배지와 요금제** | 지시서 부록 B — 건드리지 않는다 |
| **단계** (착수) | NOW · NEXT · RND · FUTURE · NEVER | **언제 손대나** | 이 문서 |
| **Tier** (성숙) | 0 Foundation · 1 검증완료 · 2 구현대상 · 3 고급 · 4 Earth System | **제품 단계** | MASTER DECISION §4 |

- **유형 A/B/C/D는 난이도가 아니라 증거의 종류다.** A는 `OFFICIAL_*` 배지 + FREE, B는 `EARTHUS_FORECAST`(현재 0레이어) + 조건부, C는 `SIMULATION` + `runRef` + PRO, D는 `reference`(진리등급 아님) + 무료.
- 성숙도를 말하고 싶을 때는 **단계**(NOW/NEXT/RND/FUTURE)와 **Tier**를 쓴다. 글자 A~D를 성숙도 의미로 재사용하면 배지·요금제 배선이 어긋난다.
- 한 도메인이 여러 유형을 동시에 가진다(예: 태풍 = A 인용 + C 가정 실험 + D 문헌). 도메인당 letter 하나가 아니다.

---

## §1. 한 줄 판정

> 비전의 지구시스템 연쇄 시뮬레이션은 지금 저장소에서 **지진 → 쓰나미 ETA 한 사슬만 계산으로 존재**하고, 나머지는 기관 발표 인용(A)·기준선(`EARTHUS_ANALYSIS`)·문헌 카드(D)로 **병렬 표시**할 수 있을 뿐이다. 수문·빙하·해일·산불확산 결합 모델은 §11.4 Future다. **"6엔진군·시나리오 노브·2100년 시간축"을 지금 약속하면 §J 허위 status가 된다.**
> 정직한 다음 걸음은 ① 운영 중 규율 위반을 걷어내고 ② 이미 S3에 있는 기관값을 진리등급 배지로 배선하는 것이다.

---

## §2. 긴급 — 운영 중 규율 위반 (비전보다 먼저)

조사가 사다리를 만들다가 **지금 운영 중인 화면·산출물의 위반**을 잡았다. 새 기능보다 먼저다.

| # | 위치 | 무엇이 잘못돼 있나 | 조치 |
|---|---|---|---|
| V-1 | `aws/cyclone-analog` | "자료 종합 참고선 v2" **가중 결합선** — 자체 진로 예보에 해당. `(67%)` 표기 | 결합선 제거 또는 `VISUALIZATION_ONLY`(미래 시각 연장 금지), 퍼센트 삭제, confidence 4단계화 |
| V-2 | `sim-questions.js` `ocean.wave` | 엔진 설명이 **"파도 물리"**인데 `AVAILABLE` — §N 통과 사실 없음. `wave-typhoon` 질문 | "연출용 파도 표현" `VISUALIZATION_ONLY`로 재라벨, 질문 제거 |
| V-3 | `lab-events` smoke | **"24시간 뒤 화점 N개 추정"** — 자체 예보 | 철회, 또는 `EARTHUS_FORECAST` 배지 + 모델id + 매개변수 출처 + 독립 채점 동봉(그러면 0레이어의 첫 사례) |
| V-4 | `ui-shell.js:204` · menu-inventory #119 | GLOF **"DEM+파열모델"** — 그런 모델이 없다 | "기관 인벤토리(NSIDC·ICIMOD) + GLOF 역사 DB, S-B 브랜치" |
| V-5 | `NEXT_STEPS.md` | `MODEL`·`ILLUSTRATIVE` 라벨 — `EVIDENCE_KIND` 10종에 없는 어휘 | `SIMULATION` 또는 `VISUALIZATION_ONLY` |
| V-6 | `ENGINE_CATALOG` HYD-003/004/005 | Flood/Inundation Scenario가 **`IMPLEMENTED_FOUNDATION`** — 허위 status | `FOUNDATION_UNWIRED` 등으로 강등 |
| V-7 | 20+ Lambda | **Open-Meteo 무료 API 비상업 조항** — `wind-grid`·`tpw-grid`·`pressure-grid`·`marine-grid`·`kma-fcst`·`gts-global`·`air-grid`·`air-ea`·`atmos-transport-spike`·`lab-events`·`cyclone-analog` 등이 상업 서비스에서 사용 중 | **PD 결정 필요**: 유료 구독 vs GFS/ECMWF/CAMS ADS 직접 전환 |
| V-8 | `aws/jma-warn/handler.py:8` | **2026-05-28 이후 갱신 없음** — 일본 특보 피드 정지 | 일본 특보 의존 카드 전부 `not_available` 표기 |
| V-9 | 기타 | GDACS 해일값 `purely indicative`인데 배지 없음 / `hazards.typhoon` `temporalMode: 'ensemble spread'` / `report-center.js:151` "능력 정확히 2개" 주석 / `kma-aws` `SD` 사문 필드 / `kma-upper` 대류 문구 | 개별 정정 |

**V-7이 가장 큽니다.** 앱 전체의 기상 격자 상당수가 비상업 조항 자료에 의존합니다. 유료화 전에 정리되어야 합니다.

---

## §3. 사다리 — 33단을 7묶음으로

전체 33단의 세부(자료·라이선스·검증·공수·막힘)는 저널 원자료에 있다. 여기는 묶음과 순서다.
**공수는 §10의 과장 보정을 적용한 뒤 읽는다.**

### 묶음 1 — 정정 (유형 없음, 코드 최소)
§2의 V-1~V-9. **PD 승인이 필요한 것**: `ocean.wave` 재라벨, `cyclone-analog` 결합선 처리.

### 묶음 2 — NOW · 유형 A (기관 인용, 대부분 자료가 이미 S3에 있음)

| 영역 | 나가는 것 | 배지 | 티어 |
|---|---|---|---|
| 폭우·대기 | `kma-aws-min` rn15/rn60/rnday 510지점 · 호우특보 · 동네예보 81h · 고층 CAPE/CIN/KI/LI/TPW **공식값**(재계산 금지) | `OFFICIAL_OBSERVATION`·`OFFICIAL_WARNING`·`OFFICIAL_FORECAST` | FREE |
| 산불·대기오염 | 산림청 위험지수(등급만, 원값 비공개) · FIRMS 열점 + 오탐 문구 · 에어코리아 673 측정소 원값 · CAMS 0.4° "도시값 아님" · 건조특보 | 위 + `PROVIDER_FORECAST` | FREE |
| 폭염 | 2026 3단계(주의보33/경보35/중대경보 체감38·기온39) + 열대야주의보(25/26/27) · 날씨누리 지속일수 | `OFFICIAL_WARNING`·`OFFICIAL_FORECAST` | FREE |
| 태풍 | KMA·JMA·NHC **각각** + ECMWF ENS 51개 퍼짐 + 유사사례 **건수**("12개 중 8개 북동 전향") | `OFFICIAL_FORECAST`·`PROVIDER_FORECAST`·`HISTORY` | FREE |
| 폭풍해일 | 폭풍해일 특보 · KHOA 45곳 조위 관측−예측 | `OFFICIAL_WARNING`·`OFFICIAL_OBSERVATION` | FREE |
| 쓰나미 | 기상청 지진해일통보문 원문 · JMA 津波情報 · 과거 관측 수치(1993·2024) | `OFFICIAL_WARNING`·`HISTORY` | FREE |
| 해양 | CMEMS PHY/WAV/SEALEVEL · NOAA OISST·CRW·GDP · KHOA 조석·조류 | `OFFICIAL_FORECAST`·`OFFICIAL_OBSERVATION` | FREE |
| 가뭄 | K-water SPI · 댐 61개소 저수율 · 농어촌 저수지 · HRFCO 유량 · 행안부 예·경보 · 기상청 월간 가뭄정보 | `OFFICIAL_*` | FREE |
| 하천·댐 | HRFCO 수위·유량·홍수특보 · K-water 방류 | `OFFICIAL_WARNING`·`OFFICIAL_OBSERVATION` | FREE |
| 산사태 | 산림청 예측정보 시군구 예보코드 + 면책 | `OFFICIAL_FORECAST` | FREE |
| 해빙 | NSIDC G02135 extent + 1981–2010 대비 + 48년 중 순위 | `EARTHUS_ANALYSIS`·`HISTORY` | FREE |
| 빙하·GLOF | RGI 7.0 · WGMS FoG · HMA_GLI 빙하호 · Potsdam GLOF 3,151건 · ICIMOD PDGL **원문 인용**(EARTHUS 판정 아님) | `OFFICIAL_OBSERVATION`·`HISTORY`·`reference` | FREE |
| 적설 | `kma-aws` `SD`(사문) → `SD_TOT`/`SD_DAY`/`SD_HR3`, `kma-fcst`에 `SNO` 추가 | `OFFICIAL_*` | FREE |

**"기관 발표는 전부 무료" 원칙상 이 묶음 전체가 FREE다.** 가뭄·홍수 리포트를 EXPLORER 뒤에 두면 위반.

### 묶음 3 — NEXT · 기준선(`EARTHUS_ANALYSIS`, EXPLORER)

체감온도(`korea.js feelsLike`, 기상청 지점값 대조) · 폭염일수·열대야 계수기 · 폭우 3/6/12/24h 이동합(mm만) · 산불 실효습도(건조특보 이진 채점)·FWI 계열(clean-room) · 조위 잔차 vs 역기압 기대치 · 태풍 이동속도·상륙 시각 · 해수면 추세 OLS(95% CI 표기 금지) · 조석 조화(UTide MIT).

> **주의**: "기준선(EARTHUS_ANALYSIS)이 §J의 '새 엔진'인가"가 **미결**이다(PD 결정 #4). 이 묶음 전체가 그 결정에 걸린다.

### 묶음 4 — NEXT/RND · 유형 C (물리 시뮬, PRO)

| 순위 | 영역 | 상태 |
|---|---|---|
| 1 | 쓰나미 ETA `eta-v1` | **운영 중**(38연안, 단위시험 8/8) |
| 2 | 표류 forcing 확장 | CMEMS + Stokes + windage α 스윕 → GDP 부이 채점 |
| 3 | 여진 RJ→ETAS · 재진입 SGP4 | 본 조사 범위 밖, 제품 순서 유지 |
| 4 | 황사·연기 850hPa | `atmos-transport-spike` Track B 등재, 도달 시각은 사후검증 전 비공개 |
| 5 | **해수면 노출 셈** | 부산 해운대 스파이크: GLO-30 + KHOA 기준면 + AR6 p10/p50/p90 → bathtub+연결성 → "침수 범위 안 거주 인구 약 N명, 시설 M곳" |
| 6 | 저수지 수지 시나리오 | `dS/dt=I−O` p50 단일, 이력 2~4주 관찰 후 |
| 7 | 쓰나미 ETA v2 유한 진원 | KHOA 1분 조위 시계열 보존(R0)이 선행 |
| 8 | 태풍 Holland 바람장 | FT=0 과거 재현만, 기관 예보시각 위 전개 금지 |

### 묶음 5 — RND (Track B 브랜치)
산사태 강우 I–D 임계선 · 해빙 자유표류 · GLOF C1~C5(Walder–Costa → Froehlich → Muskingum–Cunge → HAND → GeoClaw) · 해양 열파 MHW.

### 묶음 6 — FUTURE (게이트 뒤)
수문 전체(HAND·SCS-CN·2D SWE·Muskingum) · 쓰나미 해저변위·전파·파고·침수범위 · 폭풍해일 동역학 · 심층 해류·열수송 · 빙하 용융·적설 SWE·동토 ALT.
**해제 조건**: V-gate 1(지형)·2(해구) 실기기 → §14 1차 통과 → Track B 경로 신설 → L1/L2 채점원 확보.

### 묶음 7 — NEVER (§8)

---

## §4. §G-2 대조표 재료

계약 §G-2가 요구하는 "19영역 ↔ `PHENOMENA` 66현상" 대조표의 뼈대. **각 영역은 `status`를 분리해 기록한다.**

```
VISION      = Flood
PHENOMENON  = hazards.flood (기존) | 신규 필요 시 PD 승인
TYPE        = A(기관 인용) 가능 / C(자체 물리) FUTURE
STAGE       = NOW(A) / FUTURE(C)
TIER        = 2
STATUS      = planned
ENGINE      = not_implemented
VALIDATION  = not_available
EVIDENCE    = HRFCO·K-water·홍수특보 (A형 자료 보유)
```

**등재 규칙(계약 §G-1 실측)**: 기존 현상에 `not_available` + `reasonKo`/`reasonEn`으로 등재하는 것은 **지금 가능**하다. 새 *현상* 추가만 `PHENOMENA` 66을 깨므로 PD 승인 사항이다.

> 앞선 조사 문서의 **"잠긴 시험 = 능력 정확히 3개"는 오기**다. 그런 단정은 시험에 없다. 이 사다리 원자료에도 그 오기가 전파돼 있으니 인용할 때 주의한다.

---

## §5. Cascade — 지금 성립하는 것과 아닌 것

**계산된 사슬(MODELLED)은 하나뿐이다.**

| 사슬 | 성격 | 상태 |
|---|---|---|
| 지진(USGS FDSN) → 쓰나미 도달시간(`eta-v1` runRef) | **MODELLED_CASCADE** | 유일한 계산 연쇄. 단 `simulation_run` 표가 없어 지금은 runRef 문자열 + `SIMULATION` 배지로만 |
| 본진 → 여진 RJ(`lab-events`) | MODELLED(LAB 추정) | `ESTIMATED_DISTRIBUTION`, 확률 없이 건수 범위만 |
| 태풍 경로 ∥ 해일·강풍·풍랑 특보 ∥ 조위 잔차 ∥ 부이 파고 | **병렬 표시(계산 없음)** | 같은 화면·같은 시각. 문장은 "역기압 1 cm/hPa는 교과서 관계"까지 |
| 호우특보 → 홍수특보·수위 → 댐 방류 → 연안 침수 정보 | POSSIBLE_CASCADE 라벨 | 기관 발표 4개 병렬. **"폭우로 범람" 인과 문장 금지** |
| 기후변화 → 기온 → 빙하 질량 → 해수면 | **PHYSICAL_RELATION(D형)** | IPCC AR6 §9.5.1·SPM B.5.3 **원문 인용 카드**. EARTHUS 계산 없음 |

**미래 연쇄**는 전부 결합 모델이 필요하다 — 태풍→해일→침수, 강우→유출→홍수→산사태, 지진→해저변위→전파→침수. 모두 묶음 6.

> 관계 어휘 `POSSIBLE_CASCADE`·`MODELLED_CASCADE`·`PHYSICAL_RELATION`은 SQL enum에는 있으나 `TRUTH_VOCABULARY_CANONICAL.md`에 **없다**. 화면·리포트 문구로 쓰기 전 정본 등재가 선행한다(새 어휘 금지 검사기).

---

## §6. 시나리오 노브 — 현재의 정직한 답

| 노브 | 오늘 | 다음 | 판정 |
|---|---|---|---|
| **Sea Level +1m** | — | 정적 노출 셈 `SIMULATION` + runRef + limits (부산 스파이크) | **NEXT** — +0.5m는 GLO-30 수직오차 이내라 UNKNOWN, +2m 가능 |
| **Temperature +2°C** | IPCC AR6 승온수준별 **원문 인용 카드**(D형) | — | **NOW(D형)** — 시뮬 아님 |
| **Typhoon Category +1** | `§F baselineEventId` 가정 실험 틀 안에서 기관 발표 반경 기하 | Holland FT=0 과거 재현 "B 최소/중간/최대 3장" | 강도·해일·강수를 등급으로 올리는 계산은 **NEVER** |
| **Rainfall +20%** | — | — | **만들지 않음** — 수문 파이프라인 없음. 오늘 가능한 건 관측 누적 mm + 발표기준 병기 |
| **Glacier Melt +30%** | WGMS 질량수지·RGI 면적·AR6 전망 인용 | — | **노브 자체를 만들지 않음** |
| **T+0h…T+72h** | 기관 예보 프레임 재생만 | — | EARTHUS 미래값은 ETA 등시선·표류 궤적(runRef)뿐 |
| **2026→2100** | AR6·KHOA SSP 인용값 전환(khoasl126/245/370/585 배선됨) | — | EARTHUS가 연도별 값을 **생성하지 않음** |
| **Before/After · A/B/C** | 같은 기관의 **발표 회차 비교** + 관측 vs 예보 차이 | C형 능력의 runRef 두 개 나란히 | "어느 기관이 맞다" 판정 금지 |

---

## §7. 문구 교정 (비전 → 규율)

| 비전 문구 | 대신 |
|---|---|
| 발생 가능성 · 붕괴 확률 N% | "○○기관 발표: 주의보/경보(발표 시각)" 또는 기관 원문 확률 인용(D5). **EARTHUS 문장엔 퍼센트 없음** |
| 피해 가능지역 · 예상 피해 인원 · 예상 영향권 · 대피 | "침수 범위 안 거주 인구 약 N명(격자 출처·연도 기준), 시설 M곳" — **범위가 없으면 문장 자체를 만들지 않음** |
| 정밀 예측 · 앙상블 경로군 · 다중 시나리오 | 기관 예보 인용 + 기준선 대비 차이 |
| Earth-System cascade simulation | "현상 관계 표시: 기관 발표 병렬 + 문헌 관계 카드 + 계산된 사슬은 지진→쓰나미 하나" |
| **6 engine groups** | 실체는 Ocean(표류·ETA)·Hazard(여진·ETA) **둘뿐**. Hydrology·Cryosphere·Atmosphere·Earth System은 "기관 인용 묶음"으로 명명하고 **"엔진" 단어를 쓰지 않는다** |
| 3D globe as Simulation Spatial Grid | V-gate 1·2 통과 전까지 3D 지형은 **화면용**. 계산 격자는 서버측 GEBCO 0.2°·GLO-30 |
| Simulation Report의 uncertainty / affected area / model·version | p10/p50/p90(C형 전용) 또는 `limits[]` / "노출 범위(취약성 계산 없음)" / `engineRef`·`modelVersion`·`validationPlanId` **실제 파일** — 없으면 절을 사유와 함께 비움 |
| 특보 기준 대비 N% · 위험 | "누적 ○mm / 기상청 발표기준 ○mm(예보 기준, 관측 누적과 직접 비교 대상 아님)" — 색·경고 아이콘 없음. **기관 발표기준을 "기준선"이라 부르지 않는다**(그 어휘는 `EARTHUS_ANALYSIS` 전용) |
| 해안 파고 · 도달 예상 | "기관 예상 높이/관측 높이" / "첫 파가 닿을 수 있는 시각(시나리오, 파고·침수·피해 아님)" |
| 인과("빙하가 녹아", "폭우로 범람", "도시화 때문에") | `FORBIDDEN_CAUSAL`. IPCC·JMA 원문 인용 또는 "확인된 증거/부족한 증거" 병기 |
| p10/p50/p90 | **C형 전용**. 분포 카드·태풍 B 스윕·회귀 CI에 쓰지 않는다 |

---

## §8. NEVER — 해제 조건 없음

자체 NWP·기상 예보 · 자체 태풍 진로/강도/발생/앙상블 경로군 · 60분 강수 나우캐스트 외삽 · 자체 바람장/기압/온도/습도/구름 격자 · 파도 물리 · 폭풍해일고 예보 · 도시 배수·하수 역류(SWMM) · 산불 확산 · 자체 위험 지수(폭염 등급·가뭄 단계 합성·산사태 퍼지/ML) · 눈사태 발생 조건 판정 · 발생 확률 · 피해 인원 · 대피 권고 · 영향권.

**근거**: §J · §N ⑤ · §11.2 · 기상법 17조 · 気象業務法 17/23조 · KR102543203B1(하수관망) · KR101090266B1(산불 확산) · KR101809629B1·KR101718294B1(합성 지수) · KR101588232B1(퍼지 산사태).

**추가 회피 대상**(조사가 새로 잡음): US 12024842·US 11645900(GLOF 조기경보) · KR20130096891A(산불 연료 확산속도) · KR101802165B1(적설 환산) · KR20120132849A(융설 제어).

**라이선스상 채택 불가**: 에어코리아·KHOA 3유형 자료의 재가공 표시 · WAQI · MERIT Hydro · FABDEM · CoastalDEM · TPXO(비상업) · Global Flood Database · GeoSure.

---

## §9. PD 결정 (16건)

| # | 결정 |
|---|---|
| L-1 | **Open-Meteo 비상업 조항** — 20+ Lambda 앱 전체. 유료 구독 vs GFS/ECMWF/CAMS ADS 직접 전환, 그 순서 |
| L-2 | `ocean.wave` `VISUALIZATION_ONLY` 재라벨 · `wave-typhoon` 질문 제거 |
| L-3 | `cyclone-analog` 참고선 v2 — 완전 제거 vs `VISUALIZATION_ONLY` 잔류 |
| L-4 | **기준선(`EARTHUS_ANALYSIS`)이 §J의 "새 엔진"인가** — 묶음 3 전체가 여기 걸림 |
| L-5 | Track B 경로 신설(registry 새 modelId · `contracts/<model>.schema.json` · `simulation_link.py` · `simulation_run` 표) |
| L-6 | 비전 도메인을 `SIM_CAPABILITIES`에 `not_available` + 사유로 등재(기존 현상 한정 — 신규 현상은 66 변경) |
| L-7 | RND 예산 배정 — 개발자 1명이므로 **동시 2개 이하**. 후보: 노출 셈 스파이크 / 표류 CMEMS·Stokes / 850hPa 증거 / ETA v2 / Holland / 해빙 자유표류 |
| L-8 | V-gate 1·2 실기기 일정과 §14 1차 통과 기준 확정 |
| L-9 | 인구 노출 격자 — `popgrid` WorldPop 1km(보유) vs GHS-POP 100m 신규 적재. **문구 정본을 하나로** |
| L-10 | 라이선스 서면 확인 6곳 — HRFCO · KHOA 항목별 공공누리 · 산림청 · KMA NMSC · Farinotti ETH · avalanche.org |
| L-11 | 쓰나미 ETA 파라미터 — MIN_MAG 6.5→6.0, STATIONS에 묵호·후포·임원·울릉도 추가, GEBCO 15″ 재적재 |
| L-12 | 기관 계산 지수(K-water·기상청 SPI, 산림청 등급, 環境省 WBGT)를 `EVIDENCE_KIND` 10종 중 어디에 둘지 |
| L-13 | `lab-events` smoke "24h 뒤 화점 N개" — 철회 vs `EARTHUS_FORECAST` 첫 사례 |
| L-14 | `kma-aws-min` 이력 저장 시작(분단위 510지점 = 일 73만 행) + KMA 허브 일일 용량 회계 |
| L-15 | 국내 자료 0건 레이어(빙하·GLOF·눈사태·동토)를 "해외 사건 맥락"으로 둘지, 자료 없는 칸 금지대로 뺄지 |
| L-16 | D5 예외 운용 규칙 — 기관 원문 확률(NHC P-Surge·JMA 予報円 70%·GloFAS 재현기간)을 어떻게 인용하고 재계산을 어디서 막을지 |

---

## §10. 이 사다리의 한계 (비평이 잡은 것)

**공수는 체계적으로 낙관적이다.** 완결성 비평이 12개 rung의 과장을 지적했다. 대표적인 것:

- **"코드 0줄"인 NOW는 없다.** 자료가 S3에 있어도 카드 배선(배지·출처 점·근거 패널)은 코드다.
- **산불·대기오염 "감사만 2~3일"은 틀렸다.** `air-grid`·`air-ea`·`atmos-transport-spike`가 CAMS 직접이 아니라 **Open-Meteo 파생**이라 지금이 위반 상태다. 전환 후에야 NOW.
- **일본 NOW는 전부 `not_available`이다** — `jma-warn` 피드가 2026-05-28부터 정지.
- **입력이 없는 계산이 두 건 섞였다** — 조위 잔차의 역기압 항(GFS `PRMSL` 수집 **0건**)과 결빙일수 두께(`TMP 2m` 미수집). 수집기 추가가 선행.
- **해수면 노출 셈은 `validationPlanId`를 만들 수 없는 상태**다 — L1(NOAA SLR Viewer, 미국 타일)·L2(2003 매미 침수흔적 디지털) 모두 미확보.
- **레지스트리 변경은 전부 잠긴 시험 변경**이다 — 복합키 신설·`LAYER_TRUTH` 등재·`slaMin` 조정 포함. 한 항목만 PD 표시가 돼 있었다.

**빠진 축이 둘 있다.**
1. **시장** — 사다리는 한국 축뿐이다. 미국(NWS Red Flag·NWPS·USDM·SNOTEL·NOAA SLR Viewer) · 영국(EA flood API·OGL) · 대만(MOENV) A형 커버리지 표가 없다.
2. **비용** — `effort_days`만 있고 비용 칸이 없다. 신규 Lambda 8개 운영비, `archiver` 확장 저장비, KMA 허브 할당량 누적 회계(키 1개를 Lambda 15개가 공유 중인데 5개 rung이 호출을 더한다).

**따라서 이 문서는 "무엇을 만들 수 있는가"의 지도이지 일정표가 아니다.** 일정은 §9의 결정과 §10의 보정을 거친 뒤에 나온다.
