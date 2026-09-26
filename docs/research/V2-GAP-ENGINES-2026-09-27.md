# v2 시뮬레이션 빈칸 엔진·검증자료 조사 (2026-09-27)

범위: 얼음·눈 / 태풍 / 대기 / 지진동 / 산사태 / 검증 목록 + GitHub 밖 경로. (GeoClaw·ANUGA·SFINCS·OpenDrift·Parcels·FLEXPART·WindNinja·Cell2Fire·ForeFire·ElmFire·Landlab·r.avaflow·pvlib·SunCalc·WhiteboxTools·Earth2Studio·Aurora·WeatherNext·NeuralGCM·pySTEPS 는 다른 문서에서 다룸)

판정 규칙(주어진 것): GPL = 서버에서만 / AGPL = 서버도 문제 / 비상업·Commons Clause = 제외.
판정 기호: **ADOPT**(앱·브라우저까지 가능) · **SERVER-ONLY** · **REFERENCE**(식·검증 비교용) · **AVOID**
표기: **[V]** = 라이선스 파일·API 필드를 직접 읽음 · **[U]** = 검색 요약 등 2차 출처, 확인 필요.
조사 방법: api.github.com 미인증(60회/시간 중 약 55회 사용, 한도 안 걸림) · GitLab API(code.usgs.gov, gitlab.com, gitlabext.wsl.ch) · PyPI/npm/4TU API · 원문 라이선스 파일.

## 0. 먼저 알아야 할 것 — 판정을 바꾸는 발견 4건

1. **USGS ShakeMap 자체는 CC0 인데, 계산 핵심이 AGPL 이다.** [V]
   `DOI-USGS/ghsc-esi-shakemap` → `esi-shakelib` 의 PyPI 의존성에 `openquake.engine<=3.24.1` (OpenQuake = AGPL-3.0-or-later, PyPI 확인).
   → ShakeMap 을 우리 서버에 설치해 돌리면 AGPL 을 끌어온다. **엔진은 AVOID, USGS 가 계산해 올린 ShakeMap 결과 피드는 ADOPT.**
   가상 지진(what-if)은 pygmm(MIT)으로 GMPE 를 직접 부른다.
2. **AvaFrame 은 EUPL-1.2 — AGPL 과 같은 부류다.** [V: GitHub API = EUPL-1.2]
   EUPL 제1조의 '배포·전달' 정의에 "필수 기능에 대한 접근 제공"이 들어가 SaaS 도 복제·공개 의무 대상([U]: EUPL 해설).
   → 주어진 규칙상 **REFERENCE + PD 판단 필요**. 알파-베타 도달거리(com2AB)는 공개된 식이라 직접 구현 가능.
3. **Delft3D(FM) 는 Deltares 소유 코드에 AGPL 이 섞여 있다** [V: LICENSE 원문 "GNU Affero General Public License"] → AVOID.
4. **GDACS 이용약관에는 라이선스가 없다.** [V: termofuse.aspx 원문] 면책·"의사결정에 쓰지 말 것" 문구만 있고 상업 이용 허락도 금지도 명시 없음.
   (WebFetch 요약기는 "상업 금지"라고 했지만 원문에 그런 문장은 없다 — 요약기 오답.) → 표시용 참조는 가능, 재판매형 가공은 JRC 에 서면 확인.

**브라우저 가능 여부:** 조사한 엔진 거의 전부가 Fortran/Python/C++ 이다. 바로 쓸 수 있는 JS 는 **jsthermalcomfort(MIT)** 하나.
나머지 '가벼운' 것(Holland 바람장·Okada 지표 변위·해빙 자유표류·도일법 융설·알파-베타)은 **식이 짧아 우리가 JS/WebGPU 로 직접 쓰고, 라이브러리는 교차검증용**으로 두는 것이 맞다.

## 1. 얼음·눈

### 1-1 적설·융설
- **FSM2** — github.com/RichardEssery/FSM2 · MIT [V] · push 2026-04 · Fortran(브라우저 ✕, 포팅 쉬움: 1차원 점 모형·수백 줄)
  계산: 다층 적설 에너지·질량수지(알베도·압밀·융설), 1,728가지 물리 조합. 입력: 기온·습도·바람·단파/장파·강수·기압(시간별 강제).
  검증: ESM-SnowMIP 관측점(Col de Porte 등). 비용: 점 1개 1년 = 1초 미만. → **ADOPT**(JS 포팅 또는 서버 Lambda)
- **openamundsen** — github.com/openamundsen/openamundsen · MIT [V] · push 2026-03 · Python
  계산: 분산형(격자) 적설·융설, 지형 음영·재분배. 입력: DEM + 격자 기상. 비용: 유역 100m 격자 1겨울 = 수 분~수십 분. → **ADOPT(서버)**
- **SNOWPACK / Alpine3D** (SLF) — gitlabext.wsl.ch/snow-models/snowpack , /alpine3d · 둘 다 LGPL-3.0 [V: License.txt] · 활동 2026-09 · C++
  계산: 눈층 미세구조(약층·눈사태 위험 지표), Alpine3D 는 3D 분산. 입력: AWS 급 기상 + 지형. 비용: 점은 가벼움, Alpine3D 는 무거움. → **SERVER-ONLY**(LGPL 이라 앱 동봉도 동적 링크면 가능하나 C++ 빌드 부담)
- **SnowModel**(Liston) — 공식 저장소 없음, jupflug/SnowModel·NCAR/Parallel-SnowModel 포크에 라이선스 표기 없음 [U] → **AVOID**(허락 없는 코드)
- 가장 싼 길: **도일법(degree-day) 융설** — 식 한 줄, WebGPU 격자 가능. 계수는 문헌값 + ESA CCI Snow 로 보정. → **ADOPT(자체 구현)**

### 1-2 해빙(표류·열역학)
- **CICE / Icepack** — github.com/CICE-Consortium/CICE , /Icepack · BSD-3 [V: LICENSE.pdf 본문 "Open-Source under the BSD-3 License"] · push 2026-08 · Fortran
  계산: CICE = 해빙 역학+열역학 전지구 모형(해양·대기 결합 필요, 무거움) / Icepack = 기둥(1D) 열역학. 검증: 자체 회귀시험 세트, SHEBA 기둥 사례.
  비용: CICE 는 HPC급, Icepack 기둥은 초 단위. → **SERVER-ONLY**(Icepack 만 현실적)
- **neXtSIM-DG** — github.com/nextsimhub/nextsimdg · Apache-2.0 [V] · push 2026-09 · C++(★12, 개발 중) → **REFERENCE**(성숙도 낮음)
- **자유표류(free drift)** — 해빙 속도 ≈ 바람의 약 2%, 북반구 우편 약 20~45°(난센 규칙). 입력: 10m 바람 + 해류. → **ADOPT(자체 구현, WebGPU 입자)**
  검증: OSI SAF 해빙 표류 산출물·IABP 부이 [U: 라이선스 미확인], ESA CCI Sea Ice(농도).

### 1-3 눈사태 도달거리
- **AvaFrame** — github.com/OpenNHM/AvaFrame (구 AvaFrame/AvaFrame 에서 이전) · EUPL-1.2 [V] · push 2026-09 · Python/Cython
  계산: com1DFA(깊이적분 흐름, 사면 DEM 위), com2AB(알파-베타 통계 도달거리). 입력: DEM + 발생 구역 다각형 + 두께.
  검증: 저장소 `benchmarks/` 폴더에 표준 시험(avaHelix·avaBowl·avaHockey·avaAlr 등) [V: 목록 확인]. 비용: com1DFA 한 사면 수 분(서버).
  → **REFERENCE — PD 판단**(0-2 참조). 알파-베타 식은 Lied & Bakkehøi(1980) 논문으로 **직접 구현 ADOPT**.
- RAMMS = 상용(주어진 대로 제외).

### 1-4 빙하·빙하호 붕괴(GLOF)
- **OGGM** — github.com/OGGM/oggm · BSD-3-Clause [V] · push 2026-09 · Python(★265)
  계산: 빙하별 질량수지·흐름·미래 부피(기후 시나리오 입력 시). 입력: RGI 윤곽 + DEM + 기후(자체 사전처리 자료 다운로드).
  검증: WGMS 질량수지 관측, 문헌 결과. 비용: 빙하 1개 수 초, 지역 수천 개 = 분~시간. → **SERVER-ONLY**(BSD 라 제약 없음, 무게 때문에 서버)
- **PyGEM** — github.com/PyGEM-Community/PyGEM · MIT [V] · push 2026-05 · Python(OGGM 결합) → **SERVER-ONLY / REFERENCE**
- GLOF 댐붕괴 흐름 = GeoClaw(다른 문서). 빙하호 목록·부피 자료는 별도 조사 필요(미조사).

## 2. 태풍

### 2-1 모수형 바람장 (Holland 1980/2010, Willoughby)
- **자체 구현이 정답.** Holland 식은 중심기압·최대풍속반경(Rmax)·B 로 반경별 경도풍을 주는 식 몇 줄. WebGPU 격자 즉시 가능. → **ADOPT(자체)**
  입력: 진로(위경도·중심기압·최대풍속, 기상청/JTWC/ECMWF 앙상블 진로). Rmax 없으면 경험식.
  검증: IBTrACS 풍속 반경(R34/R50) · 기상청 ASOS/해상 부이 최대순간풍속(2022 힌남노, 2020 마이삭).
- **CLIMADA** — github.com/CLIMADA-project/climada_python · GPL-3.0 [V] · push 2026-09 · Python(★476)
  계산: TropCyclone 위험(Holland 2008/2010·Emanuel 바람장), 합성 진로, 피해 함수. climada_petals(GPL-3.0 [V]) 에 폭풍해일 근사 포함.
  → **SERVER-ONLY**(우리 JS 식의 기준 답안으로 쓰기 좋음)
- **TCRM**(Geoscience Australia) — github.com/GeoscienceAustralia/tcrm · GPL-3 [V: LICENSE.rst "Version 3"; GitHub API 는 NOASSERTION] · push 2026-08 · Python
  계산: 통계적 합성 진로 + 모수 바람장 + 재현기간 풍속. → **SERVER-ONLY / REFERENCE**
- **tropycal** — github.com/tropycal/tropycal · MIT [V] · push 2026-09 · Python — 베스트트랙·예보 진로 읽기·그리기 도구(물리 엔진 아님). → **ADOPT(서버 전처리)**

### 2-2 폭풍해일
- **GeoClaw 해일 모드** — github.com/clawpack/geoclaw · BSD-3 [V] · `examples/storm-surge/ike`, `isaac` 존재 [V]
  입력: 수심·지형 + 태풍 진로(Holland 바람·기압 내장). 비용: 지역 AMR 수 분~수십 분(컨테이너). → **SERVER-ONLY(가장 먼저)**
- **SCHISM** — github.com/schism-dev/schism · Apache-2.0 [V] · push 2026-09 · Fortran — 비정형 격자 해양·해일·파랑 결합.
  NTHMP 벤치마크 보고서(2025-01, weather.gov) 존재 [U]. 비용: 격자 제작 부담 큼. → **SERVER-ONLY(2순위)**
- **ADCIRC** — github.com/adcirc/adcirc · LGPL-3.0 [V: LICENSE.md 원문; API 는 NOASSERTION] · push 2026-08 · Fortran — 미국 해일 예보 표준. → **SERVER-ONLY**(격자 필요)
- **Delft3D FM / D-Flow** — github.com/Deltares/Delft3D · AGPL/GPL/LGPL 혼합 [V] → **AVOID**
- 검증: NOAA CO-OPS 조위(미국 공공), KHOA 조위관측소 실측(이미 사용 중인 KHOA 해일 침수 예상도와 대조), 힌남노·매미 해일고.

### 2-3 합성 진로
- **STORM**(Bloemendaal) — 4TU.ResearchData "STORM IBTrACS present climate" v4 · **CC0** [V: 4TU API] · 1만 년치 합성 진로.
  기후변화판(STORM Climate Change)도 CC0 [U]. → **ADOPT**(재현기간·확률 계산 재료 — '확률을 말할 자격'의 근거가 됨)

## 3. 대기

### 3-1 화산재 확산
- **Ash3d**(USGS) — code.usgs.gov/vsc/ash3d/volcano-ash3d (GitLab) · CC0-1.0 [V: GitLab API + LICENSE.md] · 활동 2026-09 · Fortran
  계산: 3D 오일러 이류·확산·낙하, 강하 두께. 입력: 분출 시각·높이·부피 + GFS/NCEP 바람. 부속: GitHub DOI-USGS/volcano-ash3d-metreader 등(CC0).
  검증: USGS 운영 사례(레다우트 2009, 세인트헬렌스 1980). 비용: 지역 수 분(단일 CPU 가능). → **SERVER-ONLY(ADOPT 급, 라이선스 제약 없음)**
- **FALL3D** — gitlab.com/fall3d-suite/fall3d · GPL-3.0 [V: GitLab API] · 활동 2026-09 · Fortran(MPI·GPU)
  검증: 에이야퍄들라이외퀴들 2010·켈루드 2014 등 GMD 논문 [U]. → **SERVER-ONLY(2순위)**
- HYSPLIT = NOAA 등록형 배포, 오픈 라이선스 아님 [U] → AVOID. 궤적만 필요하면 바람장 위 입자 적분을 자체 구현(v2 입자 렌더러 재사용).
- 검증 자료: 도쿄 VAAC 화산재 주의보(형식 공개, 이용조건 미조사).

### 3-2 더위 스트레스·도시열
- **thermofeel**(ECMWF) — github.com/ecmwf/thermofeel · Apache-2.0 [V] · push 2026-08 · Python — UTCI·WBGT·MRT·체감온도 등. → **ADOPT(서버)**
- **pythermalcomfort** — github.com/pythermalcomfort/pythermalcomfort · MIT [V] · push 2026-09 · Python(★231) — UTCI·PMV·SET·열지수 등. → **ADOPT**
- **jsthermalcomfort** — npm `jsthermalcomfort` 1.4.0 · MIT [V: npm] · github.com/FedericoTartarini/jsthermalcomfort → **ADOPT(브라우저 바로)**
- **SOLWEIG** — github.com/UMEP-dev/solweig · GPL-3.0 [V] (GPU판 nvnsudharsan/SOLWEIG-GPU 도 GPL-3.0 [V]) — 건물·나무 그림자 포함 평균복사온도 지도. 입력: 건물 DSM·수관 DSM + 기상. → **SERVER-ONLY**
- **UMEP**(QGIS 플러그인) GPL-3.0 [V] → SERVER-ONLY / **SUEWS** MPL-2.0 [V](도시 에너지수지, 파일 단위 copyleft — 서버 사용 제약 없음) → SERVER-ONLY
- 검증: 기상청 ASOS 기온·습도로 계산한 WBGT vs 기상청 발표 체감온도, 서울 도시기후 관측망 [U].

## 4. 지진동(흔들림)

- **USGS ShakeMap v4** — github.com/DOI-USGS/ghsc-esi-shakemap · CC0 [V] · push 2025-07 · Python — **하지만 esi-shakelib → openquake.engine(AGPL) 의존 [V]** → 엔진 **AVOID**
  → 실제 지진: **USGS ShakeMap 결과(grid.xml, 등진도선 GeoJSON) 피드를 받아 표시 = ADOPT** (미국 정부 저작물·공공 [U: 피드 개별 약관 미확인]).
- **OpenQuake engine** — github.com/gem/oq-engine · AGPL-3.0 [V] → **AVOID**
- **gmpe-smtk** — github.com/GEMScienceTools/gmpe-smtk · AGPL-3.0 [V] · push 2024-10(정체) → **AVOID**
- **pygmm** — github.com/arkottke/pygmm · MIT [V] · push 2026-08 · Python — NGA-West2 등 GMPE 모음(PGA·PGV·응답스펙트럼). 입력: 규모·거리·Vs30·단층형.
  비용: 격자 10만 점 = 초 단위(numpy). 식이 닫힌 꼴이라 JS 포팅도 가능. → **ADOPT**(가상 지진의 흔들림 지도 1순위)
- **OpenSHA** — github.com/opensha/opensha · BSD-3 [V] · push 2026-09 · Java — GMPE·지진원 모형. → **REFERENCE / SERVER**(Java 부담)
- 지반 증폭: USGS 전지구 Vs30(경사 기반) [U: 공공으로 알려짐] → pygmm 입력.
- **Okada 변위(쓰나미 초기 수면)**
  - clawpack **dtopotools**(geoclaw 안, BSD-3 [V]) — 순수 Python Okada 1985 지표 변위 → **JS 포팅 1순위 ADOPT**(수백 줄)
  - **okada_wrapper** — github.com/cutde-org/okada_wrapper · MIT [V] · push 2024-06 · Fortran DC3D 감쌈(원 DC3D 코드 배포조건은 [U]) → SERVER
  - **cutde** — github.com/cutde-org/cutde · MIT [V] · push 2026-08 · 삼각 전위(GPU OpenCL/CUDA) → **SERVER-ONLY(정밀판)**
  - okada4py — github.com/jolivetr/okada4py · GPL-3.0 [V] → REFERENCE
- 검증: USGS ShakeMap 과거 사례(경주 2016 M5.8·포항 2017 M5.4), 기상청 계기진도 관측, NGA-West2 자료(PEER, 이용조건 [U]).

## 5. 산사태

- **NASA LHASA 2** — github.com/nasa/LHASA · **NOSA 1.3** [V: LICENSE.pdf 원문] · push 2026-03 · Python
  계산: 머신러닝 산사태 발생 확률(30초각 ≈1km, 일별) + 인구·도로 노출 + 산불 후 토석류. 입력: IMERG 강수 + 정적 자료(static.zip).
  NOSA 는 OSI 승인·약한 copyleft(수정 파일 공개), 서버 사용 문제 없음. 비용: 전지구 1회 = 서버 분 단위.
  → **SERVER-ONLY**. NASA 가 올린 실시간 결과(maps.nccs.nasa.gov/download/landslides)를 받는 길도 있음(이용조건 [U]).
- **TRIGRS**(USGS) — github.com/usgs/landslides-trigrs · 공공영역(USGS) [V: LICENSE.md] · push 2024-04(정체) · Fortran
  계산: 강우 침투 + 무한사면 안전율(격자). 입력: DEM·토층 두께·토질 계수·강우 시계열. → **SERVER-ONLY / REFERENCE**
- 강우 임계식: Caine(1980) 강도-지속시간, Guzzetti(2008) 전지구 임계 — 식 한 줄 → **ADOPT(자체)**, 한국 계수는 산림청 예측정보 기준 조사 필요(미조사).
- 검증 자료:
  - **산림청 산사태위험지도** — data.go.kr/data/15074817 · 10m 격자 위험등급 · **이용허락범위 제한 없음** · 수정 2026-09-03 [V] → **ADOPT**
  - 행안부 생활안전지도 산사태위험지도 OpenAPI — data.go.kr/data/15149602 [U]
  - NASA COOLR / Global Landslide Catalog — 공개, CC-BY 인용 요청 [U]
  - 국립재난안전연구원 — **미조사**(공개 산출물·라이선스 확인 못 함)

## 6. 검증 벤치마크 목록

| 대상 | 자료 | 라이선스 | 상태 |
|---|---|---|---|
| 쓰나미 | NTHMP 벤치마크(BP1 경사해변·BP7 모나이 계곡·BP9 오쿠시리) — github.com/rjleveque/nthmp-benchmark-problems (2011, 라이선스 표기 없음) | 미표기 | [V: 저장소 존재] |
| 쓰나미 | GeoClaw examples/tsunami/chile2010 등 | BSD-3 | [V] |
| 해일 | GeoClaw examples/storm-surge/ike, isaac | BSD-3 | [V] |
| 해일 | NOAA CO-OPS 조위 · KHOA 조위관측소 | 미국 공공 / 국내 공공 | [U] |
| 태풍 | IBTrACS v4 (NOAA NCEI) | 미국 정부 저작물, 저작권 없음 | [U: 검색 요약] |
| 태풍 | STORM 합성 진로 1만 년 | CC0 | [V] |
| 태풍 확률 | ECMWF 오픈데이터 ENS 태풍 진로(type=tf, BUFR) — ecmwf-opendata(Apache-2.0 [V]) | CC-BY-4.0 | [U] |
| 눈사태 | AvaFrame benchmarks/ | EUPL-1.2 | [V] |
| 적설·해빙 | ESA CCI Snow / Sea Ice | CCI 데이터 정책: 자유 이용·인용 의무 | [U] |
| 홍수 | GloFAS / EFAS (CEMS-Floods) | CC-BY-4.0 계열 | [U] |
| 산사태 | 산림청 위험지도 / NASA COOLR | 제한 없음 / CC-BY 요청 | [V] / [U] |
| 지진동 | USGS ShakeMap 과거 사례 | 미국 공공 | [U] |

## 7. GitHub 밖에서 들여오는 길

**A. 계산이 끝난 결과를 받는 공개 API (돌리지 않고 가져옴 — 가장 싸다)**
- USGS 지진 피드 + ShakeMap 산출물(grid.xml·GeoJSON) — 실제 지진의 흔들림 지도. [U] 공공
- GDACS(태풍 바람 버퍼·지진·홍수 경보) — 약관에 라이선스 없음 [V], 표시용 참조만. 이미 쓰는 피드의 지연·이름 접미 함정 있음.
- GloFAS/EFAS — 하천 유량 예보·앙상블(확률!), CEMS 데이터 스토어 [U: CC-BY-4.0]
- NASA LHASA 실시간 확률 격자 [U]
- ECMWF 오픈데이터 ENS 태풍 진로 51멤버 → "51개 중 N개" 확률 문장의 근거가 됨 [U: CC-BY-4.0]
- Copernicus EMS Rapid Mapping(피해 지도, 사후) [U: CC-BY 계열]
- 도쿄 VAAC 화산재 주의보 [미조사]

**B. 학술 자료**: STORM(CC0 [V]), RGI 빙하 윤곽(CC-BY-4.0 [U]), NGA-West2 지진동 자료(PEER [U]), ESM-SnowMIP 관측점 [U].

**C. 한국 정부 공개자료**: 산림청 산사태위험지도(제한 없음 [V]), 행안부 생활안전지도 API [U], KHOA 해일 침수 예상도(이미 사용), 기상청 계기진도·태풍 진로(허브 용량 공유 주의), 국립재난안전연구원(미조사).

**D. 유료 대체(최후 수단, 전부 미조사)**: 상용 재해 위험 API(태풍·홍수·지진 시나리오)는 가격·재판매 조건을 개별 확인해야 하므로 이 문서에서는 이름을 적지 않는다.

## 8. 요약표 — 빈칸 → 최선 1~2개 → 라이선스 판정 → 노력

| 빈칸 | 최선 선택 | 라이선스 판정 | 노력 |
|---|---|---|---|
| 적설·융설 | ① 도일법 자체(WebGPU) ② FSM2 포팅/서버 | 자체 / MIT → ADOPT | S / M |
| 분산 적설 | openamundsen | MIT → ADOPT(서버) | M |
| 해빙 표류 | ① 자유표류 자체 구현 ② Icepack(기둥) | 자체 / BSD-3 → ADOPT·SERVER | S / L |
| 눈사태 도달 | ① 알파-베타 자체 구현 ② AvaFrame | 자체 / **EUPL(=AGPL급) → PD 판단** | S / M |
| 빙하 변화 | OGGM (+PyGEM) | BSD-3·MIT → SERVER | M |
| 태풍 바람장 | ① Holland 자체(JS/WebGPU) ② CLIMADA 로 교차검증 | 자체 / GPL-3 → SERVER | S / M |
| 폭풍해일 | ① GeoClaw 해일 모드 ② SCHISM | BSD-3 / Apache-2.0 → SERVER | M / L |
| 태풍 확률 | ① ECMWF ENS 진로 ② STORM 합성 진로 | CC-BY-4.0[U] / CC0 → ADOPT | S / M |
| 화산재 | ① Ash3d ② FALL3D | CC0 / GPL-3 → SERVER | M / L |
| 더위 스트레스 | ① jsthermalcomfort(브라우저) ② thermofeel(서버) | MIT / Apache-2.0 → ADOPT | S |
| 도시열 지도 | SOLWEIG | GPL-3 → SERVER | L(건물 DSM 필요) |
| 지진동(실제) | USGS ShakeMap 결과 피드 | 공공[U] → ADOPT | S |
| 지진동(가상) | ① pygmm + Vs30 ② OpenSHA | MIT / BSD-3 → ADOPT | M |
| 지진→쓰나미 원 | ① dtopotools Okada JS 포팅 ② cutde | BSD-3 / MIT → ADOPT | S / M |
| 산사태 | ① LHASA(서버 또는 결과 받기) ② 강우임계 자체 + 산림청 지도 | NOSA-1.3 / 제한 없음 → SERVER·ADOPT | M / S |
| **피할 것** | ShakeMap 자체 설치·OpenQuake·gmpe-smtk·Delft3D·SnowModel·HYSPLIT | AGPL·미표기·비공개 → AVOID | — |

출처(주요): api.github.com 각 저장소 · raw LICENSE 파일(Delft3D, ADCIRC, tcrm, CICE, LHASA, TRIGRS, ghsc-esi-shakemap) ·
pypi.org/pypi/esi-shakelib · pypi.org/pypi/openquake.engine · registry.npmjs.org/jsthermalcomfort · code.usgs.gov / gitlab.com / gitlabext.wsl.ch API ·
data.4tu.nl API(STORM) · data.go.kr/data/15074817 · gdacs.org/About/termofuse.aspx · eupl.eu/1.2 · ecmwf.int open data · ncei.noaa.gov IBTrACS · climate.esa.int/en/data/policy
