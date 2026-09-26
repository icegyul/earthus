# EARTHUS v2 "만약 ~라면" 계산 매트릭스 (3D 지형 지구 · 2026-09-27 초안)

입력: `docs/research/V2-GAP-ENGINES-2026-09-27.md` · `V2-COMPETITORS-GITHUB-2026-09-27.md` §B·C · `COMMERCIAL-DATA-SOURCES-2026-09-27.md` §A~G · 통합 지시서 §7-1·요소별 빈칸표 · `INTELLIGENCE-DEV-DIRECTIVE-2026-09-05.md` §N·§F · `SIMULATION-CAPABILITY-CROSSWALK` · `SIMULATION-VISION-LADDER`(§6 노브·§8 NEVER) · 기존 엔진(`aws/tsunami-eta` eta-v1, `aws/cyclone-analog`, ADR-001 Parcels, KHOA SSP 노출 셈).

**표기**
- 판정 ①~⑤ = §N 5기준: ① 물리가 교과서 수준으로 확정 ② 입력을 이미 갖고 있음 ③ 독립 관측·공식값으로 채점 가능 ④ CPU 몇 초 ⑤ 대피·피해 판단으로 승격하지 않음. ○ 충족 · △ 조건부 · ✕ 미충족(→ 괄호 안에 대안).
- 검증 사례: **VERIFIED** = 이번 조사나 입력 문서에서 원문·저장소·공식 페이지로 확인 / **UNVERIFIED** = 널리 알려진 사건이지만 자료 위치·이용조건은 확인하지 못함.
- 비용: 전부 **ESTIMATE**. 근거 단가는 Lambda x86 약 $0.0000167/GB·초, Fargate 서울 4vCPU/8GB 약 $0.22/시간, GPU g5.xlarge급 약 $1.0~1.3/시간. 실측 앵커는 운영 중인 `tsunami-eta`(Lambda, 제한 300초) 하나다.
- 단계: **즉시**(자료·코드 재료가 있음) / **자료 후**(자료 확보가 선행) / **연구**(검증원·방법 미확정).
- 도크 = 통합 지시서 §4-2의 7 도크(지구·날씨·위성·바다·대기·재난·지역). 우주는 AETHERUS 탭.
- 7단계 = ①극적으로 보인다 ②값 ③출처 ④시간축 ⑤모델 비교 ⑥Intelligence ⑦Simulation. 모든 행의 주 칸은 ⑦이다. 표에는 함께 채우는 칸만 적는다.
- 🔶 = 우리가 만든 예보처럼 보일 위험이 있는 행이다. 같은 칸에 규정에 맞는 대안을 적었다.

---

## 0. 두 가지 선행 규칙 — PD 승인 대상

### 0-1. §N ④ 개정 제안: '즉시형 / 작업형' 두 등급
지금 §N ④는 "CPU 몇 초"다. 이 기준이면 GeoClaw·SCHISM·Ash3d·FALL3D·OGGM·openamundsen은 모두 떨어진다. 그런데 이 엔진들이 v2 차별화(§7-1)의 핵심이다. 떨어뜨리지 말고 두 등급으로 나누자고 제안한다.
- **즉시형**: 브라우저(JS/WebGPU)나 Lambda에서 수 초 안에 끝난다. 슬라이더를 움직이면 다시 계산한다. 결과를 저장할 때만 `SimulationRunRecord`를 남긴다.
- **작업형**: 서버(Fargate·Batch 컨테이너)에서 분~시간 걸린다.
  - 실행 전에 **예상 시간·비용을 표시하고 사용자가 동의**해야 돌린다. MCP `estimate()`와 같은 값이며, MCP 명세의 "도구 호출 전 동의"와도 맞는다.
  - `SimulationRunRecord`(baselineEventId·revisionId·modelVersion·seed)를 필수로 남긴다.
  - 결과는 캐시해 두고 같은 입력이면 재사용한다.
- 두 등급 모두 '시뮬레이션'이라 부른다. 배지로만 구분한다(`SIMULATION_ONLY · 즉시형` / `SIMULATION_ONLY · 작업형 · 계산 N분`).
- 아래 표에서 작업형 엔진은 ④에 "✕(작업형)"으로 적었다. 개정이 승인되면 이 표시는 △로 바뀐다.

### 0-2. 예보처럼 보이는 계산 — 가를 선(사다리 §6·§8을 모든 행에 적용)
- **허용**: 닫힌 과거 사건이나 FT=0 분석장 위에서 매개변수를 바꾼 가정(what-if), 사용자가 입력값을 직접 넣은 가정. 모두 `SIMULATION_ONLY`로 표시한다.
- **금지**: 지금 진행 중인 사건의 미래를 우리 엔진으로 내다보는 것. 금지 대상은 자체 진로·강도·바람장·파고·해일고·산불 화선 예보다.
  - 기관 예보 위에서 전개하는 것도 금지다. 사다리 §6의 "기관 예보시각 위 전개 금지"가 근거다.
- **확률**: 기관이 발표한 확률을 인용하거나, **ECMWF ENS 섭동 50 + 컨트롤(`oper`) 1**에서 센 비율만 쓴다("51개 중 N"이 아니라 "섭동 50+컨트롤 중 N").
  - AI 날씨모델(Earth2Studio 등)은 ⑤ Compare에서만 쓴다. '모델 출력 · 모델명·실행 시각'으로 표기하고 우리 예보로 내세우지 않는다.
- **⑤ 안전 판단**: 모든 결과에 `SIMULATION_ONLY`를 붙인다. "대피·피해·위험 등급·영향권" 단어는 쓰지 않는다. 노출 셈은 "범위 안 거주 인구 약 N명(격자 출처·연도)"까지만 쓴다.

---

## 1. 매트릭스 (29행)

| 요소 | 계산(화면에서 보이는 것) | 엔진(권고 → 대안) | 입력 자료(권고 → 대안) + 상업 조건 | 검증 사례(독립 채점 대상) | 실행 위치·시간·비용(ESTIMATE) | §N ①②③④⑤ | 7단계·도크 | 단계 |
|---|---|---|---|---|---|---|---|---|
| 땅 | **L1 산사태 강우 임계**: 누적 강수 곡선이 I–D 임계선을 넘는 시군구·격자를 지형 위에 칠한다. 문장은 "임계선 대비 누적 ○mm"까지만 | Caine(1980)·Guzzetti(2008) 식 자체 구현(JS) → NASA LHASA 2(NOSA-1.3, 서버, 또는 결과 받기) | KMA AWS 736지점 누적 강수(공공누리 유형은 자료별 확인) + **산림청 산사태위험지도 10m**(data.go.kr 15074817, 이용 제한 없음 [V]) → GPM IMERG(NASA, CC0급) | **산림청 과거산사태 정보 API**(www.data.go.kr/data/15074816/openapi.do — 연도·좌표·면적, VERIFIED 존재) · NASA COOLR(CC-BY 요청, UNVERIFIED) | 브라우저 <1초 / LHASA 전지구 1회 서버 수 분 ≈ $0.01 | ○ ○ ○ ○ △(자체 위험지수·퍼지 판정은 NEVER·특허 KR101588232B1 → 등급 없이 "임계선 대비 mm"와 산림청 예측정보 원문 병기) | ②③④⑥ · 재난·지구 | 즉시(한국 계수는 조사 필요) |
| 땅 | **L2 산사태·토석류 흐름 경로(가정)**: 사면 한 곳을 찍으면 흘러내리는 경로와 도달 범위가 3D 지형 위에 그려진다 | 최급경사 D8 + 알파-베타형 도달각 자체 구현(WebGPU) → Landlab(MIT, 서버) → r.avaflow(라이선스 확인 전 보류) | **GEDTM30 맨땅 30m**(CC BY 4.0) → Copernicus DEM GLO-30(DSM, 상업 가능·면책 문구 의무) · 국내 정밀은 NGII 5m 보안심사 | 산림청 과거산사태 정보(좌표) + 2011 우면산·2023-07 경북 예천 사례의 실제 퇴적 범위(항공사진, UNVERIFIED) | 브라우저 1~3초 / Landlab 사면 1개 서버 수 분 | △(토석류 유변은 경험식) ✕(DTM 미보유 → GEDTM30 받기) △ ○ ○ | ⑦ · 재난·지구 | 자료 후 |
| 땅 | **L3 지형 바람**: 사용자가 정한 풍향·풍속("서풍 10 m/s 가정")에서 산·계곡을 따라 휘는 국지 바람이 흐르는 입자로 보인다 | WindNinja(퍼블릭 도메인, 서버, 질량보존 모드) → 브라우저 포텐셜류 근사(연구) | GEDTM30/GLO-30 DEM(30~100m 영역) + 사용자 입력 바람 → GFS 0.25° **분석장(FT=0)** | Askervein Hill 1983 현장 관측 · Big Southern Butte 2010(WindNinja 논문 Wagenbrenner 2016) — 둘 다 UNVERIFIED · 국내는 KMA 산악 AWS | 서버 영역 1개 수 초~1분 ≈ $0.001 | ○ △(DEM만 있음) △(해외 캠페인만) △ ○ | 🔶 GFS **예보** 입력으로 돌리면 자체 바람장 예보(NEVER) → 사용자 가정값이나 FT=0만 허용 · ②⑦ · 날씨·지구 | 자료 후 |
| 땅 | **L4 태양·그림자·일사**: 날짜·시각 슬라이더를 끌면 지형·건물 그림자와 맑은 날 일사량(kWh/m²)이 바뀐다 | SunCalc(BSD-2, 브라우저) + DEM 광선추적(WebGPU 자체 구현) → pvlib(BSD-3, 서버 정밀) | 3D 지형 z10~11(보유) · 건물은 OSM(Protomaps, ODbL) | KASI 천문연 일출·일몰 시각 · KMA ASOS 일사 관측(맑은 날) — UNVERIFIED(API 이용조건 미확인) | 브라우저 즉시(<100ms/프레임), 비용 0 | ○ ○ ○ ○ ○ | ②④⑦ · 지구·지역 | **즉시** |
| 땅 | **L5 가시권·조망**: 봉우리·전망대를 찍으면 보이는 범위와 일출 방향선이 그려진다 | GPU 가시권(자체, 브라우저) → WhiteboxTools(MIT, 서버) | 3D 지형(보유), 지구 곡률·대기 굴절 계수 k=0.13 | 독립 채점이 약하다 → 알려진 원거리 조망 사례(부산에서 쓰시마 약 50km, UNVERIFIED) + WhiteboxTools 교차(독립 아님) | 브라우저 1초 이하 | ○ ○ △(교차 비교 위주 → 조망 사진 좌표 모으기) ○ ○ | ⑦ · 지역(여행)·지구 | **즉시** |
| 물 | **W1 쓰나미 도달시간 등시선(운영 중)**: 진원 → 30분 간격 등시선 + 연안 38곳 도달 분 | `aws/tsunami-eta` eta-v1(√(g·h) Dijkstra, 운영) → ETA v2 유한 진원(Okada, E3 연결) | GEBCO 0.2° 격자(보유) · USGS 지진 피드 | PTWC·JMA 게시문 ETA와 지점별 차이(분) — 운영 중 · NTHMP 벤치마크(github.com/rjleveque/nthmp-benchmark-problems, VERIFIED 저장소) | Lambda 수십 초(제한 300초) ≈ 사건당 $0.005 | ○ ○ ○ ○ ○ | ②③④⑥⑦ · 재난 | **즉시(운영)** |
| 물 | **W2 쓰나미 파면 + 최대 파고(가정)**: 진원·규모를 고르면 파면이 3D 수심 위로 퍼지고 먼바다 최대 파고 색이 칠해진다 | WebGL2/WebGPU 선형 얕은물(tsunami-lab 방식, MIT, 브라우저) → GeoClaw(BSD-3, 서버 정밀·상륙) | GEBCO 0.2°(보유) → 한반도 주변 1분 격자 + E3 Okada 초기 수면 | **DART 21418**(ndbc.noaa.gov/station_page.php?station=21418, 38.84N 148.75E, 2011 도호쿠 기록 — 관측소 VERIFIED / 2011 시계열 위치 UNVERIFIED) · GeoClaw `examples/tsunami/chile2010`(BSD, VERIFIED) · NTHMP BP1·BP9 | 브라우저 5~20초 / GeoClaw 사건 1개 10~60분, Fargate 4vCPU ≈ $0.04~0.22 | ○ ○ ○ ○(브라우저) · ✕(작업형: GeoClaw) ○ | 파고는 먼바다 한정 · "침수·피해 아님" · ⑦ · 재난 | 즉시(브라우저) / 자료 후(GeoClaw 상륙 격자) |
| 물 | **W3 해수면 상승 노출 셈**: SSP 4종 × 연도를 고르면 잠기는 격자와 "범위 안 거주 인구 약 N명"이 나온다 | 욕조 + 바다 연결성(자체, 브라우저·Lambda) → 얕은물 동적 범람(W4) | KHOA SSP(보유) + **GEDTM30 맨땅 DTM**(필수 — Copernicus DSM이면 도쿄·송도가 "안 잠김", 66%가 닫힌 분지로 칠해지는 문제) · WorldPop(CC BY) | 미래라서 채점 불가 → **방법 채점 대안**: 과거 해일 침수 실적(2003 매미 마산, 2016 차바 해운대 마린시티)을 같은 방법으로 재현해 IoU를 잰다(UNVERIFIED) | 브라우저 1~3초 | ○ ✕(맨땅 DTM → GEDTM30) ✕(미래 → 과거 침수로 방법 채점) ○ ○(노출 셈만) | ②④⑤⑦ · 바다·재난 | 자료 후 |
| 물 | **W4 해안 범람 +X m(가정)**: 해일고나 해수면 +X m를 넣으면 물이 지형 위로 **시간에 따라** 번진다(정적 욕조가 아니다) | WebGPU 얕은물(lisyarus·deluge 참고, MIT) → ANUGA(Apache-2.0, 서버) | GEDTM30 + 조위 기준면(KHOA) | W3과 같은 과거 침수 실적 + ANUGA 표준 시험(댐붕괴 해석해) | 브라우저 10~30초(도시 1곳) / ANUGA 서버 10~60분 ≈ $0.2 | ○ ✕(DTM → GEDTM30) △ △/✕(작업형) ○ | ⑦ · 바다·재난 | 자료 후 |
| 물 | **W5 표류(가정 방출)**: 바다 한 점을 찍으면 24·48·72시간·5일 입자 구름과 해안 도착 비율(입자 수 중 N개)이 보인다 | OceanParcels 3.1.4(MIT, ADR-001 채택, 서버) → 결과 궤적을 브라우저에서 재생 · OpenDrift(GPL-2)는 서버 대안 | HYCOM 0m(ADR 고정 자료) → **CMEMS GLO PHY SMOC**(파랑·조석 표류 포함, 상업 파생 가능, 2028-06-30까지 무료) · NOAA RTOFS · 바람 3% 항은 GFS 0.25° | **KMA 표류부이 13기**(`kma-buoy.json kind=표류부이`, 저장소 보유 VERIFIED) · **NOAA GDP 시간별 부이**(https://registry.opendata.aws/noaa-oar-hourly-gdp/ 존재 VERIFIED / DOI 10.25921/x46c-3620·인용조건 UNVERIFIED(검색 요약)) — 분리 거리 km/일 | Lambda·Fargate 1만 입자 5일 1~5분 ≈ $0.01 | ○ △(CMEMS 가입 필요) ○ ✕(작업형) ○(수색·유류 용도 표기 금지) | ⑥⑦ · 바다 | 즉시(S-A) |
| 물 | **W6 폭풍해일(과거 사건 재현·가정)**: 과거 태풍 진로(±이동)를 넣으면 해안 해일고 시계열과 최대 수위 지도가 나온다 | GeoClaw 해일 모드(BSD-3, Holland 바람 내장) → SCHISM(Apache-2.0) · ADCIRC(LGPL, 격자 부담) · Delft3D는 AGPL이라 제외 | IBTrACS 진로 + GEBCO/KHOA 수심 + GEDTM30 | GeoClaw `examples/storm-surge/ike`(VERIFIED) + NOAA CO-OPS 갤버스턴 8771450(2008 Ike, UNVERIFIED) · **KHOA 조위관측소 2022 힌남노·2003 매미 관측 해일고**(UNVERIFIED) | 서버 10~60분 ≈ $0.04~0.22 | ○ △ ○ ✕(작업형) ○ | 🔶 진행 중 태풍의 해일고 예보는 NEVER → 닫힌 과거 사건 + §F 개입만 허용 · 기관 폭풍해일 특보를 나란히 · ⑦ · 재난·바다 | 자료 후 |
| 물 | **W7 하천 홍수(연구)**: 한강 실제 사건 재현 → 관측 수위와 비교 → 재현 패키지 | GloFAS 유량 앙상블 **결과 받기**(확률 근거) → 얕은물 2D(ANUGA 서버) · SFINCS는 GPL-3(서버 전용) | 서울 강우·수위(PD: 2차 가공 진행) + K-water + HRFCO + GEDTM30 · GloFAS(CC BY 4.0, UNVERIFIED) | 2020-08·2022-08 한강 홍수 HRFCO 수위 시계열(UNVERIFIED) | 서버 30분~수 시간 ≈ $0.1~1 | △ ✕(DTM·하도 단면 → GEDTM30+NGII 5m 심사) ○ ✕(작업형) ○ | 🔶 자체 홍수 예보는 NEVER → 과거 재현 + GloFAS 앙상블 "N개 중 M개" 인용 · ⑦ · 재난(연구) | 연구 |
| 얼음 | **I1 적설·융설(가정 기온)**: "기온 +2°C라면" 슬라이더를 움직이면 눈 덮인 면적과 적설 수당량이 줄어드는 모습 | 도일법 자체 구현(WebGPU) → FSM2(MIT, 점 모형 JS 포팅) · openamundsen(MIT, 분산형 서버) | GFS 0.25° 기온·강수(분석장) + KMA AWS 적설(SD_TOT, 사문 필드 정정 필요) → ESA CCI Snow로 계수 보정 | **ESA CCI Snow** 적설 면적(자유 이용·인용, UNVERIFIED) · KMA AWS 적설 깊이 · ESM-SnowMIP Col de Porte(FSM2 검증, UNVERIFIED) | 브라우저 <1초 / openamundsen 유역 1겨울 서버 수~수십 분 | ○ △(적설 필드 정정 필요) ○ ○/✕(작업형) ○ | 특허 KR101802165B1(적설 환산)은 방법이 겹치지 않는지 확인 · ⑦ · 위성·지구 | 자료 후(겨울 전) |
| 얼음 | **I2 해빙 자유표류**: 해빙 한 점을 찍으면 바람의 약 2%, 우편 20~45°로 흘러가는 궤적 | 자유표류식 자체 구현(WebGPU 입자) → Icepack(BSD-3, 기둥 열역학 서버) | GFS 0.25° 10m 바람 + CMEMS 해류 · NSIDC/OSI-SAF 해빙 농도 | OSI SAF 해빙 표류 산출물 · IABP 부이 궤적(둘 다 이용조건 UNVERIFIED) | 브라우저 1초 이하 | ○ △ ○ ○ ○ | ⑦ · 바다·위성 | 자료 후 |
| 얼음 | **I3 눈사태 도달거리(해외 사면)**: 발생 구역을 그리면 알파각 도달선이 지형 위에 그려진다 | 알파-베타(Lied & Bakkehøi 1980) 자체 구현 → AvaFrame(EUPL-1.2 — 온라인 제공 시 소스 공개 의무, **PD 판단**) · RAMMS는 상용이라 제외 | GEDTM30 / GLO-30 | AvaFrame `benchmarks/`(avaAlr 등, VERIFIED 목록) · **SLF 눈사태 사고 DB**(EnviDat doi 10.16904/envidat.411·412, 존재 VERIFIED, 라이선스 UNVERIFIED) | 브라우저 <1초 / AvaFrame com1DFA 서버 수 분 | ○(경험식) ○ △(국내 자료 0 → 알프스·SAIS 해외만) ○ △ | 🔶 "눈사태 발생 조건 판정"은 NEVER → 도달거리 기하만, 발생 여부는 말하지 않음 · ⑦ · 지구 | 연구 |
| 얼음 | **I4 빙하 변화·빙하호 붕괴 물길**: 빙하를 고르면 기후 시나리오별 부피 곡선, 빙하호를 고르면 붕괴 물길 | OGGM(BSD-3)+PyGEM(MIT) 서버 → GLOF 물길은 Walder–Costa→Froehlich→GeoClaw 사슬(연구) | RGI 7.0 윤곽(CC BY 4.0, UNVERIFIED) + GEDTM30 + ERA5/ CMIP 기후 | **WGMS FoG**(wgms.ch, doi 10.5904/wgms-fog-2026-02-10 — 존재 VERIFIED / CC BY 4.0 UNVERIFIED(검색 요약)) · Potsdam GLOF DB 3,151건 · Malpasset 댐붕괴(L1) | 빙하 1개 수 초, 지역 수천 개 분~시간 | ○ ✕(RGI·기후 자료 → 받기) ○(질량수지) △/✕(작업형) ○ | 시장 5개국에 빙하 없음 → 교육·연구용 · ⑤⑦ · 지구 | 연구 |
| 태풍 | **T1 Holland 바람장 과거 재현(FT=0)**: 과거 태풍을 고르면 반경별 바람장 색과 등풍속선이 그려지고 관측 최대풍과 나란히 놓인다 | Holland 1980/2010 자체 구현(JS/WebGPU) → CLIMADA(GPL-3, 서버 교차검증) | **IBTrACS v4**(중심기압·Rmax·R34/R50, 미국 정부 저작물) | **2022 힌남노 IBTrACS SID 2022240N26149**(ncics.org/ibtracs/index.php?name=v04r00-2022240N26149, VERIFIED) R34/R50 + KMA ASOS·해상부이 최대순간풍속(UNVERIFIED) · 2020 마이삭 | 브라우저 <1초 | ○ ○ ○ ○ ○ | 🔶 진행 중 태풍에 기관 예보 시각을 넘겨 전개하면 NEVER → FT=0·과거만 · ②③⑦ · 재난 | **즉시** |
| 태풍 | **T2 태풍 가정 실험(§F)**: 기준 = 기상청 +24h 발표. 최대풍 ±10 m/s, 진로 횡방향 ±200km 슬라이더 → 기준 대비 바람장 차이 | `INTELLIGENCE-DEV-DIRECTIVE-2026-09-05.md` §F 틀 + T1 Holland(⚠️ `sim-ocean@6` 파도는 연출이라 물리 엔진이 아님) | 기관 발표 회차(KMA→JMA) · `baselineEventId·revisionId·seed` 기록 | 개입값은 채점할 수 없다 → **기준선(FT=0 재현, T1)만 채점**하고 개입은 '가정'으로 표시 | 브라우저 즉시 | ○ ○ △(기준만) ○ ○(연안 침수·피해·대피 단어 금지 시험) | 강도·해일·강수를 등급으로 올리는 노브는 NEVER · ⑦ · 재난 | 즉시(T1 뒤) |
| 태풍 | **T3 진로 확률 %**: "이 지점 300km 안 통과 — 섭동 50+컨트롤 중 N개"를 %로 보이고, 근거를 바로 아래 둔다 | ECMWF ENS 진로 **세기**(계산 아님) → STORM 1만 년 합성 진로(CC0)로 기후학적 재현기간 · ⚠️ `cyclone-analog` 가중 결합선은 V-1 정정 대상(건수만 남긴다) | ECMWF 오픈데이터 ENS 진로(`tf` BUFR, CC BY 4.0) + 컨트롤은 `oper` 따로 | 사후 채점: 실제 진로(IBTrACS·KMA 확정 진로) 대비 Brier 점수를 LAB에 누적 · 빗나가는 모형은 내림 | Lambda 수 초 | ○(센 값) ○ ○ ○ ○ | 확률은 센 값이라 자체 예보가 아니다. AI 앙상블은 ⑤에서만 · ⑤⑥ · 재난 | **즉시** |
| 대기 | **A1 궤적(황사·연기·가정 방출)**: 한 점에서 24~72시간 전방/후방 3D 궤적 화살(고도 포함) | RK4 궤적 자체 구현(GFS u·v·w) → FLEXPART(GPL-3, 서버 확산) · HYSPLIT은 재배포 금지라 제외 | **GFS 0.25° 기압면 바람**(NOAA 자유) → ECMWF IFS 0.25°(CC BY 4.0) · ⚠️ 지금 쓰는 Open-Meteo 850hPa는 비상업(V-7) | 에어코리아 PM10 도착 시각(황사) · 다음 날 FIRMS·GMGSI 연기 위치(§N 5번) | Lambda 수 초(100궤적) / FLEXPART 서버 수~수십 분 | ○ △(GFS 0.25° 전환 필요) ○ ○/✕(작업형) ○ | 🔶 예보장 위 전방 궤적은 '모델 입력 궤적'으로 표기하고 과거·후방 우선. 도달 시각은 사후검증 전 비공개(사다리) · ⑥⑦ · 대기 | 자료 후 |
| 대기 | **A2 화산재 확산(가정 분출)**: 화산·분출 높이·부피를 고르면 재 구름이 흐르고 강하 두께 등치선이 그려진다 | **Ash3d**(USGS, CC0) 서버 → FALL3D(GPL-3, 서버) | GFS 0.25° 바람(과거 분석장) + 분출원 매개변수(Mastin 2009 표) | 2009 Redoubt(USGS 운영 사례, UNVERIFIED) · **2022 훙가 통가**: Ash3d 강하 두께가 통가타푸 실측보다 높은 쪽이었다는 보고(Bull. Volcanol. 등, UNVERIFIED) · 도쿄 VAAC 주의보 | 서버 지역 1건 5~20분 ≈ $0.02~0.08 | ○ △ ○ ✕(작업형) ○ | 🔶 실제 분출의 재 예보는 VAAC 몫 → 과거·가정 분출만 · ⑦ · 재난(화산)·대기 | 자료 후 |
| 대기 | **A3 폭염 체감(UTCI·WBGT) 가정**: "기온 +2°C라면" 격자 UTCI·WBGT 색이 바뀐다 | jsthermalcomfort(MIT, 브라우저 그대로) → thermofeel(Apache-2.0, 서버) · 도시 복사열 지도는 SOLWEIG(GPL-3, 서버, 건물 DSM 필요) | GFS/ECMWF 0.25° 기온·습도·바람·복사 + KMA ASOS | KMA ASOS 지점값으로 계산한 WBGT vs 기상청 발표 체감온도(UNVERIFIED) | 브라우저 <1초 | ○ △ ○ ○ △ | 자체 폭염 **등급**은 NEVER·특허 KR101809629B1 → 지수 수치만 쓰고 특보는 기상청 원문 · ②⑦ · 날씨·지역 | **즉시** |
| 대기 | **A4 산불 확산(과거 사건 재현)**: 과거 발화점 + 그날 바람·경사 → 시간별 화선과 실제 위성 열점을 나란히 | Rothermel 셀 모델 clean-room 자체 구현 → Cell2Fire·ForeFire(GPL-3, 서버) · **ElmFire 금지**(Commons Clause) | GEDTM30 경사 + 산림청 임상도(라이선스 확인) + GFS 분석 바람 | **2022-03 울진·삼척 / 2025-03 의성 산불 FIRMS 열점 진행**(FIRMS 공개, 사건 자료 UNVERIFIED) | 브라우저 5~20초 / Cell2Fire 서버 수 분 | △ ✕(연료 지도 → 산림청 임상도) ○ ○ △ | 🔶 사다리 §8 NEVER + 특허 KR101090266B1·KR20130096891A → **닫힌 과거 사건만**, 현재 산불에는 입구만 두고 사유 표시(PD 결정 §4-2) · ⑦ · 재난 | 연구 |
| 대기 | **A5 AI 모델 비교**: 같은 초기시각에서 IFS·AIFS·GFS(+AI 모델 출력)를 좌우로 비교 | 결과 받기(ECMWF AIFS 오픈데이터) → Earth2Studio(Apache)+GenCast/WeatherNext 2 GPU 추론 | ECMWF 오픈데이터 IFS·AIFS(CC BY 4.0) · 가중치 약관 재확인(NeuralGCM SA) | 모델별 실황 대비 오차(ERA5·ASOS)를 채점표로 누적 | 결과 받기 Lambda 수 초 / GPU 추론 1회 5~20분 ≈ $0.1~0.4 | ○ ○ ○ ✕(GPU 작업형) ○ | 🔶 우리가 돌린 AI 모델을 'EARTHUS 예보'로 표기하면 자체 예보 → "모델 출력 · 모델명·실행 시각 · 기상청 예보 아님"으로 ⑤ Compare에만 · ⑤ · 날씨 | 자료 후(결과 받기) / 연구(자체 추론) |
| 지진·화산 | **E1 실제 지진 흔들림**: USGS ShakeMap 등진도선과 계기진도 관측을 3D 지형 위에 | USGS ShakeMap **결과 피드**(grid.xml·GeoJSON) — 엔진 자체 설치는 금지(esi-shakelib가 AGPL OpenQuake에 의존) | USGS 피드(미국 공공, 개별 약관 UNVERIFIED) + 기상청 계기진도 | 우리 계산이 아니다(유형 A) → 표시 검증만: 2016 경주 **us10006p1f**·2017 포항 **us2000bmcg** 이벤트 페이지(VERIFIED) | 받기만 함, 비용 0 | — (인용, 시뮬레이션 아님) | ②③④ · 재난 | **즉시** |
| 지진·화산 | **E2 가상 지진 흔들림**: 진원·규모·단층형을 찍으면 PGA·PGV 등치선 지도 | pygmm(MIT) GMPE + Vs30 → JS 포팅(닫힌 식) · OpenSHA(BSD-3, Java) · OpenQuake·gmpe-smtk는 AGPL이라 제외 | USGS 전지구 Vs30(경사 기반, 공공 UNVERIFIED) · 한국 지반 자료(미조사) | **경주 us10006p1f·포항 us2000bmcg를 실제 M·위치로 재현** → USGS ShakeMap 관측점·KMA 계기진도와 잔차 비교(이벤트 VERIFIED, 관측점 파일 UNVERIFIED) | 서버 10만 점 수 초 / JS 포팅 후 브라우저 1초 | ○ ✕(Vs30 → USGS 격자 받기) ○ ○ △(건물 피해 함수 붙이지 않음) | ⑦ · 재난 | 자료 후 |
| 지진·화산 | **E3 단층 변위 → 쓰나미 초기 수면**: 단층면을 그리면 해저 융기·침강 색과 W2 초기 조건이 만들어진다 | Okada 1985 JS 포팅(clawpack `dtopotools`, BSD-3) → cutde(MIT, 삼각 전위 GPU 서버) | USGS 유한 단층 모델(과거 사건) · 사용자 가정 단층 | GEONET 2011 도호쿠 지각변위(UNVERIFIED) + dtopotools 출력과 비트 수준 교차(독립 아님) → W2로 DART 21418 채점 | 브라우저 <1초 | ○ ○ △(단독 채점 약함 → W2 사슬로 채점) ○ ○ | 계산 연쇄 지진→쓰나미(유일하게 허용된 캐스케이드) · ⑦ · 재난 | **즉시** |
| 지진·화산 | **E4 여진 기대수 기준선**: "앞으로 7일 M4+ 기대 N회 · 기준선 대비" | Reasenberg-Jones(일반 매개변수) → 한·일 지역 보정 ETAS(연구) | USGS·quake-asia 카탈로그(수집 중, 25년 18만 건) | 창별 실제 여진 수(LAB에서 이미 채점, 빗나간 모형은 내린 이력 있음) | Lambda 수 초 | ○ ○ ○ ○ ○ | `EARTHUS 기준선` 표기(§M) · 기준선이 §J '새 엔진'인지 미결(PD) · ⑥ · 재난 | 즉시(재공개는 채점 통과 뒤) |
| 우주 | **S1 위성 재진입 잔여 수명 폭**: 재진입 카드에 "조용한 태양 / 활발한 태양" 두 폭. **낙하 지점은 절대 계산하지 않는다** | SGP4 + F10.7/Kp 조건별 항력 시나리오(자체) — 지금 `sat-layer.js`는 장면 표현(crosswalk 정정 대상) | CelesTrak 카탈로그 + SWPC 지수(둘 다 수집 중) | CelesTrak **SATCAT 실제 붕괴일**(§N 2번, 자료 존재는 알려짐·이용조건 UNVERIFIED) | 브라우저·Lambda 수 초 | ○ ○ ○ ○ ○ | AETHERUS 탭 · ⑥⑦ | 즉시 |

행 수: 땅 5 · 물 7 · 얼음 4 · 태풍 3 · 대기 5 · 지진·화산 4 · 우주 1 = **29행**. 이 중 E1(인용)·E4(기준선)는 시뮬레이션이 아니라 비교 기준으로 넣었다.

**§N 다섯 기준을 지금 모두 충족하는 행**: W1(운영) · L4 · T1 · T3 · E4 · S1. 입력만 보강하면 충족하는 행: L1 · L5 · A3 · E3.

---

## 2. 먼저 만들 8개 (가치 × 적은 노력 × 기준 통과 수)

1. **W2 쓰나미 파면+먼바다 파고(브라우저)**
   - 운영 중인 eta-v1과 GEBCO 격자를 그대로 쓴다. tsunami-lab(MIT)이 Three.js+WebGL2로 같은 구조를 이미 보여 줬다.
   - v2 "①극적으로 보인다"의 대표 장면이고, DART 21418로 채점할 수 있다.
2. **E3 Okada JS 포팅**
   - dtopotools 수백 줄을 옮기는 일이다.
   - W2의 초기 조건이 되어 "지진→쓰나미" 사슬을 완성한다. 허용된 유일한 캐스케이드다.
3. **T1 Holland 바람장 과거 재현**
   - 식 몇 줄에 입력은 IBTrACS다.
   - 힌남노 2022240N26149의 R34/R50으로 바로 채점할 수 있고, T2·W6의 공통 부품이 된다.
4. **T3 ENS 진로 확률(섭동 50+컨트롤)**
   - 계산이 아니라 세는 일이라 예보 문제가 없다.
   - AGENTS.md가 말한 "확률을 %로, 근거를 바로 아래에"를 직접 채우고, 사후 Brier 채점도 된다.
5. **L4 태양·그림자·일사**
   - 브라우저만으로 즉시 된다. 5기준을 모두 충족하고 비용이 0이다.
   - Google Earth가 유료 등급의 근거로 쓰는 기능이다.
6. **W5 표류(Parcels, S-A)**
   - ADR-001이 이미 채택했고, 정답 자료(KMA 표류부이 13기·GDP 시간별)를 갖고 있다.
   - CMEMS로 강제력만 바꾸면 된다.
7. **L1 산사태 강우 임계 + 산림청 위험지도**
   - 식 한 줄에 국내 자료는 이용 제한이 없다.
   - 과거산사태 API(좌표 포함)로 채점할 수 있고, 한국 사용자에게 가치가 크다.
8. **A3 폭염 체감 가정(jsthermalcomfort)**
   - 유일하게 '그대로 쓰는' 브라우저 라이브러리(MIT)라 노력이 가장 적다.
   - 등급 없이 수치만 내면 NEVER에 걸리지 않는다.

그다음 순서: GFS 0.25° 전환 → A1 궤적 → E2 가상 지진 → GEDTM30 확보 → W3·W4·L2 → 작업형(W6 GeoClaw 해일·A2 Ash3d).

---

## 3. 필요한 자료 확보

| 자료 | 원천 | 라이선스·상업 조건 | 쓰는 행 | 노력 |
|---|---|---|---|---|
| GFS 0.25° 기압면·지상(기존 0.5° 파이프라인 상향) | NOAA NODD S3 `noaa-gfs-bdp-pds` | 자유 이용, 출처 표시 요청(VERIFIED) — Open-Meteo 비상업(V-7) 대체 | L3·I1·I2·A1·A2·A3·A4 | 하(저장량 약 4배) |
| ECMWF ENS 진로 + 컨트롤(`oper` 별도) · IFS/AIFS 0.25° | data.ecmwf.int · `ecmwf-opendata`(Apache-2.0) | CC BY 4.0, 상업·재배포 가능(VERIFIED) · 최근 12회만 보관하므로 **우리가 쌓아야 사후 채점이 된다** | T3·A5·A1 | 중 |
| CMEMS GLO PHY(SMOC)·GLO WAV | `copernicusmarine` 툴박스(가입·SLA, 자격증명은 Lambda에만) | 상업 파생 가능, 2028-06-30까지 무료(VERIFIED) | W5·I2 | 중 |
| **GEDTM30 맨땅 DTM 30m** | Codeberg / Zenodo | CC BY 4.0(VERIFIED) — 상업·무료·맨땅을 모두 채우는 유일한 자료 | W3·W4·W6·W7·L2·I3·A4 | 중(한반도 먼저 잘라 타일화) |
| NGII DEM 5m(국내 정밀) | 국토정보플랫폼 보안심사('공간정보 안심구역') | 심사 후 제공, 배포 범위는 심사 조건(UNVERIFIED) | W4·W7(서울) | 상(행정 절차) |
| IBTrACS v4 서태평양(월간 갱신) | NOAA NCEI | 미국 정부 저작물(UNVERIFIED 요약) — `cyclone-analog`가 이미 받는 중 | T1·T2·W6·T3 채점 | 하 |
| STORM 합성 진로 1만 년 | 4TU.ResearchData | CC0(VERIFIED) | T3(재현기간) | 중 |
| USGS 전지구 Vs30 | USGS | 공공으로 알려짐(UNVERIFIED) | E2 | 하 |
| NOAA GDP 시간별 부이 | AWS `noaa-oar-hourly-gdp` · AOML ERDDAP | NOAA 공개(존재 VERIFIED), 인용 Elipot 2022·조건 UNVERIFIED | W5 채점 | 하 |
| 산림청 과거산사태 정보 API · 위험지도 | data.go.kr 15074816 · 15074817 | 위험지도는 제한 없음(VERIFIED), 과거 이력은 유형 확인 필요 | L1·L2 채점 | 하 |
| CAMS 조성 예보(대기질·UV) | ADS `cdsapi` | CC BY(VERIFIED) | A1 검증 보조 | 중 |
| WGMS FoG · RGI 7.0 | wgms.ch · GLIMS | CC BY 4.0(둘 다 UNVERIFIED — 검색 요약) | I4 | 하 |
| Ash3d 코드 + metreader | code.usgs.gov | CC0(VERIFIED, 입력 문서) | A2 | 중(컨테이너화) |
| 과거 해일 침수 실적(매미 2003 마산·차바 2016) | 행안부·KHOA·국립재난안전연구원 | 미조사 → 서면 요청이나 논문 부록 | W3·W4·W6 방법 채점 | 중 |
| 산림청 임상도(연료) | 산림공간정보 | 미조사 | A4 | 중 |

---

## 4. PD가 정할 것 (5건, 권고안 포함)

1. **§N ④ 개정: 즉시형 / 작업형** (§0-1)
   - **권고: 승인.** 작업형은 실행 전 예상 시간·비용 표시, 사용자 동의, `SimulationRunRecord` 필수를 조건으로 한다.
   - 승인하지 않으면 GeoClaw·Ash3d·OGGM·SCHISM 계열이 모두 빠지고, v2 차별화의 절반이 사라진다.
2. **산불 확산(A4)** — 사다리 §8 NEVER와 특허 KR101090266B1·KR20130096891A가 지시서 §7-1 #6과 충돌한다.
   - **권고:** 지금은 '입구 + 사유'만 둔다. 닫힌 과거 사건 재현만 연구 트랙에 둔다.
   - 착수 전에 변리사 회피 설계 검토를 받는다(Rothermel clean-room). 현재 진행 중인 산불에는 적용하지 않는다.
3. **예보 경계 규칙을 한 줄로 확정** — "닫힌 과거 사건·FT=0·사용자 가정값 위의 what-if = 허용 / 진행 중 사건의 미래 전개 = 금지"를 모든 태풍·해일·바람·산불 행에 공통 규칙으로 둔다.
   - **권고: 승인.** 사다리 §6의 "Holland FT=0 과거 재현"을 일반 원칙으로 올리는 것이다.
   - 함께 정정할 것: `cyclone-analog`의 가중 결합선을 V-1대로 건수만 남도록 고친다.
4. **AvaFrame(EUPL-1.2)** — 온라인 제공 때 소스 공개 의무가 AGPL과 같은 부류로 해석된다.
   - **권고: 쓰지 않는다.** 알파-베타 자체 구현만 쓰고, AvaFrame 벤치마크 결과는 문헌 비교용으로만 인용한다.
   - 국내 눈사태 자료가 0건이므로 I3는 연구로 둔다.
5. **"EARTHUS 기준선"이 §J의 '새 엔진'인가**(사다리 미결 #4) — E4 여진·T1 Holland·L1 임계·A3 체감이 모두 여기에 걸린다.
   - **권고:** '새 엔진'으로 보지 않는다. 조건은 셋이다: 채점표 동봉, `일반 매개변수` 표기, 빗나가면 내리는 규율 유지.
   - 이렇게 정해야 2절의 8개 중 5개가 바로 출발할 수 있다.

---

### 이번에 확인한 검증 출처
- NDBC DART 21418: https://www.ndbc.noaa.gov/station_page.php?station=21418 (관측소 VERIFIED, 2011 기록은 과거자료 링크만 확인)
- IBTrACS 힌남노: https://ncics.org/ibtracs/index.php?name=v04r00-2022240N26149
- USGS 경주: https://earthquake.usgs.gov/earthquakes/eventpage/us10006p1f · 포항: https://earthquake.usgs.gov/earthquakes/eventpage/us2000bmcg
- SLF 사고 DB: https://www.envidat.ch/dataset/avalanche-accidents-in-switzerland-since-1970-71 (doi 10.16904/envidat.411)
- 산림청 과거산사태: https://www.data.go.kr/data/15074816/openapi.do
- GDP 시간별: https://registry.opendata.aws/noaa-oar-hourly-gdp/ · WGMS FoG 인용·라이선스: https://www.wgms.ch/downloads/WGMS_DOI_2021-05.txt, https://wgms.ch/data_databaseversions/
- 훙가 통가 Ash3d 비교(요약만): https://www.researchgate.net/publication/382288398
- 확인하지 못한 것: CO-OPS 8771450 Ike 기록 · KHOA 힌남노·매미 해일고 · Askervein · 매미 마산 침수 범위 · SATCAT 이용조건 · Vs30 약관.
