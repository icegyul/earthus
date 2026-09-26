# EARTHUS v2 — 경쟁 제품 · 오픈소스 시뮬레이션 엔진 조사 (2026-09-27)

- 조사일(date seen): 모든 항목 **2026-09-27**.
- 표기: **VERIFIED** = 공식 페이지·공식 저장소·GitHub API 에서 직접 읽음 / **UNVERIFIED** = 검색 결과 요약·제3자 글에서만 봄(가격은 거의 다 이쪽).
- GitHub 라이선스·별 개수·마지막 push 는 `api.github.com/repos/...` 로 직접 조회(VERIFIED). 중간에 API 호출 한도에 걸려 일부 저장소는 조회 못 함(표에 적음).

## 0. 먼저 결론 (세 줄)

1. **"지구본 + AI" 는 빈자리가 아니다.** Felt(Claude·ChatGPT·Gemini 용 MCP), Cesium(공식 MCP 서버), Esri·Mapbox·CARTO·Planet 이 이미 공식 MCP 서버를 냈고, Google Earth 는 Gemini GIS 기능을 비싼 등급에 묶어 판다.
2. 비어 있는 자리는 더 좁다: **사용자의 AI 가 MCP 도구로 3D 지형 위 '계산(시뮬레이션)'을 설정·실행·비교하는 것.** 공개 지리 MCP 목록(sparkgeo, 2026-09-24 갱신)에 시뮬레이션용 MCP 서버는 없다 — 전부 조회·지오코딩·지도 그리기·SQL 이다.
3. 포지셔닝 한 줄: **벤더에 묶인 AI(Google Earth Gemini·Felt AI) 대 사용자가 가져오는 AI(BYO-AI).** Windy 의 3D 지구본은 Premium·데스크톱 전용이고, Google Earth 는 "Gemini 최대 접근"을 최상위 등급에 둔다.

---

## A. 경쟁·참고 제품

### A1. Windy.com
- 강점: ① 모델 비교(Compare Forecast, Premium 에서 10일) ② ECMWF 를 하루 4회 갱신·1시간 간격(Premium) ③ 위성 1년 아카이브·레이더/위성 12시간 루프 ④ 경로 계획(VFR/IFR·보트), **3D 지구본(Premium, 데스크톱 전용)**. ECMWF AIFS 15일 예보도 Premium.
- 가격: 연 구독형. $18.99/년 · $29.99(갱신 없는 1회) — UNVERIFIED (community.windy.com/topic/37419, /33588).
- 출처: https://community.windy.com/topic/23730/be-one-step-ahead-with-the-advanced-features-of-windy-premium-en — VERIFIED(공식 커뮤니티 공지) / AIFS: https://community.windy.com/topic/34378 — UNVERIFIED
- 배울 점: 유료 가치 = "더 자주·더 잘게·더 길게·비교" 로 아주 명확하게 쪼갬. 모델 이름을 전면에 둔다(EARTHUS v2 '모델 이름·실행 시각' 원칙과 같음).
- 다른 점: Windy 는 보여주기까지. **"만약 ~라면" 계산·원인·확률 해석이 없다.** 저가($19/년)라 같은 축(예보 지도)으로 가격 경쟁하면 진다.

### A2. Ventusky
- 강점: 층 14종(기온·체감·강수·레이더·위성·바람·돌풍·구름·기압·CAPE·적설·습도·해양·대기질), 모델 4종(ECMWF·GFS·ICON·GEM). 부드러운 입자 애니메이션.
- 가격: Premium(기기 4대)/Premium+(25대) — 층 무제한·7일 넘는 예보 지도·알림·위젯. 금액은 페이지에 표시 안 됨.
- 출처: https://www.ventusky.com/ , https://my.ventusky.com/premium/ — VERIFIED(기능), 가격 미확인
- 배울 점: "층 개수 제한"을 무료/유료 경계로 씀 — 단순하고 이해 쉬움.
- 다른 점: 평면 지도 중심, 지형 3D·계산 없음.

### A3. Zoom Earth
- 강점: GOES·Himawari·Meteosat·NASA 위성 실시간, 열대저기압 추적(발생~5등급), 산불. 가볍고 빠름.
- 가격: Zoom Earth Pro = 광고 제거 + 열대 경보 알림. 금액 미확인 — UNVERIFIED
- 출처: https://zoom.earth/ , https://apps.apple.com/us/app/zoom-earth-weather-forecast/id1531561063 — UNVERIFIED(검색 요약)
- 배울 점: "태풍 하나를 처음부터 끝까지 따라가기" 가 단독 상품이 된다.
- 다른 점: 태풍 유사 사례(analog)·진로 앙상블 확률은 없음 → EARTHUS 의 Intelligence 칸.

### A4. earth.nullschool.net
- 강점: 입자 흐름 시각 언어의 원조(2013), 해류·파도·오염·CAPE·수온 편차. 무광고·무료.
- 가격: 무료. 옛 공개 코드(github.com/cambecc/earth)는 **MIT** — VERIFIED. 현재 사이트 코드는 비공개(이슈 #144 에서 공개 요청).
- 출처: https://earth.nullschool.net/about , https://github.com/cambecc/earth/blob/master/LICENSE.md — VERIFIED(라이선스)
- 배울 점: 층을 적게, 흐름은 아름답게. 투영 전환·주소창에 상태가 들어가는 URL 공유.
- 다른 점: 시간축이 짧고 해석이 없음. 지형 3D 없음.

### A5. MyRadar
- 강점: 레이더 중심, 허리케인 층(확률 원뿔·NHC 요약), Pro 레이더 팩(관측소·앙각·반사도/속도 선택), 항공 층(AIRMET/SIGMET).
- 가격: Pro $5.99 1회 + 항공 차트 $24.99/년 — UNVERIFIED
- 출처: https://apps.apple.com/us/app/myradar-weather-radar-pro/id325683306 — UNVERIFIED
- 배울 점: **전문가용 '부품'을 별도 애드온으로** 판다(항공). EARTHUS 도 Simulation 을 '팩' 단위로 팔 수 있다.
- 다른 점: 미국 중심, 계산 없음.

### A6. Google Earth (웹·Projects·Timelapse·Earth AI)
- 강점: ① "Ask Google Earth" — 위성·스트리트뷰를 자연어로 검색 ② 전 지구 20m/40m 등고선(2026-03) ③ KML/KMZ/GeoJSON 가져오기·Projects 로 이야기 만들기 ④ 등급별 데이터 층(침수 이력·경사·향·필지 용도·태양광 설계).
- 가격: Standard / Professional / Professional Advanced — 사용자당 월 과금, 금액은 페이지에 안 보임. **"Gemini 최대 접근"은 최상위 등급.**
- 출처: https://mapsplatform.google.com/resources/blog/from-the-product-lead-whats-coming-to-google-earth-in-2026/ (2026-03-11) · https://mapsplatform.google.com/maps-products/earth/plans/ — VERIFIED
- 배울 점: 전문가 등급은 "층 + 설계 면적 + 저장 용량 + AI 한도" 네 축으로 나눈다. 태양광 설계처럼 **지형 위 계산 하나**가 등급을 정당화한다.
- 다른 점: AI 는 Gemini 고정. 날씨 예보·재해 시뮬레이션(쓰나미·홍수 전파)은 없음. EARTHUS = 사용자 자신의 AI + 물리 계산.

### A7. NASA Worldview / Eyes on the Earth
- Worldview 강점: 위성 층 1000개 이상, 관측 3시간 안 반영, 약 30년 이력, 시간 슬라이더·애니메이션·비교 모드. **오픈소스(NASA-1.3 라이선스)**, OpenLayers + GIBS.
  - 출처: https://github.com/nasa-gibs/worldview — VERIFIED
- Eyes on the Earth 강점: 3D 로 위성 함대 실시간 + '지구 생체 신호' 8종(CO₂·해수면·토양수분 등), 20년 재생, 사건 스냅샷.
  - 출처: https://science.nasa.gov/eyes/ , https://www.jpl.nasa.gov/news/nasas-eyes-on-the-earth-puts-the-world-at-your-fingertips/ — UNVERIFIED(검색 요약)
- 가격: 무료(공공).
- 배울 점: GIBS WMTS 는 EARTHUS 가 그대로 쓸 수 있는 무료 관측 타일. 비교 모드(좌우 스와이프)는 Compare 칸 참고.
- 다른 점: 관측 열람까지. 예보·계산·해석 없음.

### A8. NVIDIA Earth-2 (+ Earth2Studio · NIM)
- 강점: ① Earth2Studio(**Apache-2.0**, v0.14) — 한 API 로 FourCastNet3·GraphCast·AIFS·SamudrACE(대기-해양 결합)·StormScope 등 AI 모델을 돌림, 모델별 채점표(RMSE·MAE·CRPS) ② CorrDiff NIM — 다운스케일링(미국 HRRR 영역) ③ cBottle — km 급 기후 생성 모델.
- 가격: 오픈소스 + NIM 컨테이너(엔터프라이즈 라이선스 계열). GPU 필요.
- 출처: https://github.com/NVIDIA/earth2studio — VERIFIED / https://docs.nvidia.com/nim/earth-2/corrdiff/latest/overview.html — UNVERIFIED(검색 요약)
- 배울 점: **모델별 채점표를 문서에 붙인다** = EARTHUS 의 '사후 채점' 규율과 같은 결.
- 다른 점: 개발자용 도구·GPU 필수. 소비자 화면 없음 → EARTHUS 는 이걸 '뒤에서' 쓰고 앞에서는 해석을 판다.

### A9. EU Destination Earth (DestinE)
- 강점: Climate DT(2050 까지 다중 10년 전망 + 2017~2025 극한 사건 '스토리라인' 재현 = what-if), Extremes DT(맞춤 극한 시뮬레이션). 플랫폼에 FloodCast·DTE Hydrology Next 등 서비스.
- 가격·접근: **무료 가입**으로 일반 서비스, **디지털 트윈 자료 고급 접근은 '유럽 주체'만** — VERIFIED(https://platform.destine.eu/). 2026-07 부터 3단계(24개월).
  - 출처: https://www.ecmwf.int/en/about/media-centre/news/2026/third-phase-destination-earth-confirmed — UNVERIFIED(검색 요약)
- 배울 점: '스토리라인 시뮬레이션'(지난 폭염을 온난화 없는/있는 기후로 다시 돌림)은 원인 문장의 근거로 딱 맞는 형식.
- 다른 점: 한국 사용자는 고급 접근 불가. EARTHUS 가 동아시아판 what-if 를 가볍게 제공할 여지.

### A10. Microsoft Aurora
- 강점: 기초 모델 하나를 날씨(0.25°)·HRES·대기오염(CAMS)·파랑으로 미세조정. 약 500MB 소형 체크포인트.
- 라이선스: GitHub **MIT**, Hugging Face 가중치 태그도 MIT — VERIFIED. 단 README 는 "상업 용도면 이메일 문의" — 둘 다 적어 둔다.
- 출처: https://github.com/microsoft/aurora , https://huggingface.co/microsoft/aurora — VERIFIED
- 배울 점: **파랑·대기오염까지 한 모델** → 해양·대기질 메뉴의 5일 예보를 한 엔진으로.
- 다른 점: 서버 GPU 추론 필요. EARTHUS 가 직접 돌리면 '모델 비교(⑤)'의 두 번째 모델이 된다.

### A11. Google WeatherNext 2 / NeuralGCM
- WeatherNext 2: 15일까지 수백 개 확률 시나리오, TPU 1개로 1분 미만(블로그). Earth Engine·BigQuery 자료, Vertex AI 조기 접근 — UNVERIFIED(https://blog.google/innovation-and-ai/models-and-research/google-deepmind/weathernext-2/).
  - **저장소 README 기준**: 코드 Apache-2.0, "그 밖의 자료"는 **CC BY 4.0**, 가중치는 GCS 버킷(dm_graphcast). GraphCast/GenCast 도 이제 `google-deepmind/weathernext` 안에 있음 — VERIFIED(https://github.com/google-deepmind/weathernext). ⚠️ 예전 GraphCast 가중치는 CC BY-NC-SA 였다 → **버킷 안 별도 LICENSE 를 반드시 다시 확인.**
- NeuralGCM: 물리+ML 하이브리드 대기 모델. 코드 Apache-2.0, 가중치 **CC BY-SA 4.0** — VERIFIED(https://github.com/neuralgcm/neuralgcm). SA 는 가중치를 고치거나 재배포할 때만 걸림, 출력물은 무관.
- 배울 점: **앙상블 수백 개 = 확률의 근거.** "51개 중 38개" 표기를 AI 앙상블로도 만들 수 있다.
- 다른 점: 둘 다 서버 가속기 필요.

### A12. Climate Engine
- 강점: Earth Engine 위에서 기후·위성 자료를 앱·API·보고서로. 가뭄·식생 지수 시계열.
- 가격: 조직 대상(미공개). 바탕인 Earth Engine 상업 요금: Basic $500/월, Professional $2000/월 — UNVERIFIED(https://cloud.google.com/earth-engine/pricing 검색 요약)
- 출처: https://climateengine.org/ — UNVERIFIED
- 배울 점: "보고서"가 판매 단위(EARTHUS EXPLORER=Report 와 같은 발상).
- 다른 점: 3D·예보·재해 계산 없음.

### A13. Felt
- 강점: 웹 GIS 협업, GeoTIFF·Shapefile 업로드, H3 집계·시간 슬라이더 대시보드, **Felt AI + MCP(Claude·ChatGPT·Gemini)** 로 자연어 지도 제작·공간 SQL.
- 가격: Personal 무료(비상업·업로드 불가) / Professional(연간, 10석, 금액 비공개) / Enterprise(맞춤, **AI·MCP·REST API 는 Enterprise**).
- 출처: https://felt.com/pricing — VERIFIED
- 배울 점: **MCP 를 최상위 등급의 판매 포인트로** 쓴다. 가져온 AI 가 지도를 '만든다'.
- 다른 점: 2D 지도·자기 데이터 중심. 날씨·물리 계산·3D 지형 없음. → EARTHUS 는 PRO 에서 "AI 가 계산을 돌린다".

### A14. Kepler.gl
- 강점: deck.gl + MapLibre 로 수백만 점 시각화, 임베드 가능한 React 컴포넌트, 즉석 집계.
- 라이선스: **MIT**, 무료 — VERIFIED(https://github.com/keplergl/kepler.gl)
- 배울 점: 대량 점·궤적 렌더링 방식(입자 표류 결과 표시 등).
- 다른 점: 지구본 3D 미언급(README), 시뮬레이션 없음.

### A15. First Street (Risk Factor / FloodFactor)
- 강점: 미국 모든 부동산 주소별 30년 위험(홍수·산불·바람·폭염·대기질), 공개 방법론.
- 가격: 기본 점수 무료, 상세 보고서·공유는 유료 구독, 기관은 API/데이터 — UNVERIFIED
- 출처: https://firststreet.org/methodology , https://firststreet.org/pricing/home-buyers — UNVERIFIED
- 배울 점: **"내 주소" 한 점으로 모든 위험을 모아 보여주기**가 소비자에게 가장 잘 팔린다. 방법론 공개가 신뢰.
- 다른 점: 미국 한정·정적 점수. EARTHUS 는 한·일·대 주소 + '지금 이 사건(태풍·쓰나미)'의 동적 계산.

### A16. One Concern
- 강점: 자산·인프라 단위 기후 영향(Domino, SaaS)·데이터(DNA). 미국·일본 출시.
- 가격: 기업 영업(비공개) — UNVERIFIED(https://oneconcern.com/en/products/)
- 배울 점: 일본 시장에 '재해 디지털 트윈'이 이미 팔린다 → 한·일 B2B 수요 신호.
- 다른 점: 기업 전용·비공개 모델. EARTHUS 는 개인·소규모 전문가 가격대.

### A17. 기존 명세 목록에 한 줄씩 추가 (새로 확인한 것만)
- Google Earth Engine: 상업 월 $500/$2000 플랫폼 요금 — UNVERIFIED. WeatherNext 2 자료가 EE·BigQuery 에 있음.
- Cesium: **공식 MCP 서버·에이전트 스킬** `CesiumGS/cesium-ai-integrations` (카메라·엔티티·애니메이션) — UNVERIFIED(sparkgeo 목록 경유).
- ArcGIS: Location Services MCP(베타) 공식 — UNVERIFIED(https://developers.arcgis.com/ai-tools/mcp-arcgis-location-services/).
- OpenDrift: GPL-2.0 확인 — VERIFIED. (아래 B 참고)
- 참고 목록: https://github.com/sparkgeo/geo-mcp-servers (2026-09-24 건강검사) — VERIFIED. Mapbox·CARTO·Planet·Felt 공식 MCP, 날씨는 Open-Meteo·NOAA 조회형뿐.

---

## B. 시뮬레이션을 받칠 오픈소스 (라이선스 · 실행 위치)

실행: **B**=브라우저(JS/WebGL/WebGPU/WASM) 가능 · **S**=서버(Lambda/컨테이너/GPU) · 별·push 는 GitHub API 2026-09-27.

| 이름 | 무엇 | 라이선스 | 실행 | 주의 | 저장소 | 상태 |
|---|---|---|---|---|---|---|
| GeoClaw (Clawpack) | 쓰나미·폭풍해일·범람, 적응격자 | BSD-3 | S (Fortran) | 무거움, 사건당 분~시간 | github.com/clawpack/geoclaw (push 09-24) | VERIFIED |
| Tsunami-HySEA | GPU 쓰나미(조기경보용) | GPL-2.0 | S (CUDA/SYCL) | 공개판은 중첩격자·다중GPU 없음 | github.com/edanya-uma/Tsunami-HySEA | UNVERIFIED |
| ANUGA | 유한체적 범람·댐붕괴·쓰나미 상륙 | Apache-2.0 | S (Python/C) | 비정형 격자 | github.com/anuga-community/anuga_core (09-26) | VERIFIED |
| SFINCS (Deltares) | 복합 홍수(해일+하천+강우), 빠름 | GPL-3.0 | S (Fortran) | 서버 전용이면 OK, 앱 번들 금지 | github.com/Deltares/SFINCS (09-25) | VERIFIED |
| pySTEPS | 레이더 초단기 강수 예측(앙상블) | BSD-3 | S (Python) | **격자 반사도 필요** | github.com/pySTEPS/pysteps (★587) | VERIFIED |
| FLEXPART | 라그랑주 확산(방사능·화산재) | GPL-3.0 | S (Fortran) | GitHub 거울은 2021 정지, 본거지 GitLab | github.com/flexpart/flexpart | VERIFIED(라이선스) |
| HYSPLIT | 궤적·확산(NOAA) | 이용 계약, **재배포 금지·결과 공개는 허락 필요** | S | 유료 SaaS 에 부적합 | ready.noaa.gov/HYSPLIT_agreement.php | UNVERIFIED |
| OpenDrift | 기름·표류물·수색구조 표류 | GPL-2.0 | S (Python) | 서버 전용 | github.com/OpenDrift/opendrift (★327) | VERIFIED |
| Parcels | 해양 입자 추적(라그랑주) | **MIT** | S (Python) | 표류 엔진 1순위(허용적) | github.com/Parcels-code/Parcels (이전됨, 09-24) | VERIFIED |
| WAVEWATCH III | 파랑 모델 | LGPL-3 계열 + 상표 | S (Fortran) | 무거움 | github.com/NOAA-EMC/WW3 | VERIFIED |
| Earth2Studio | AI 날씨 모델 통합 실행기 | Apache-2.0 (모델별 별도) | S (GPU) | 모델마다 가중치 라이선스 확인 | github.com/NVIDIA/earth2studio (★1147) | VERIFIED |
| Aurora | AI 기초 모델(날씨·대기질·파랑) | MIT(코드·HF 가중치) | S (GPU) | README: 상업은 문의 | github.com/microsoft/aurora (★1020) | VERIFIED |
| WeatherNext 2 / GraphCast / GenCast | AI 중기·앙상블·태풍 | Apache-2.0 + CC BY 4.0 (README) | S (JAX, TPU/GPU) | 버킷 가중치 약관 재확인 | github.com/google-deepmind/weathernext (★7692) | VERIFIED(README) |
| NeuralGCM | 물리+ML 대기 모델 | Apache-2.0 / 가중치 CC BY-SA 4.0 | S (JAX) | SA 는 가중치 재배포 시 | github.com/neuralgcm/neuralgcm | VERIFIED |
| Anemoi / earthkit (ECMWF) | AIFS 학습·추론 틀 / 자료 처리 | Apache-2.0 | S (Python) | AIFS 가중치 별도 약관 | github.com/ecmwf/anemoi-core , ecmwf/earthkit | VERIFIED |
| WindNinja | 지형 반영 국지 바람 | **퍼블릭 도메인**(미 연방 저작물) | S (C++) | 30~100m DEM 영역 단위 | github.com/firelab/windninja (09-25) | VERIFIED |
| ElmFire | 산불 확산 | **Commons Clause**(판매 금지) | S | **유료 제품 사용 불가** | github.com/lautenberger/elmfire | VERIFIED |
| Cell2Fire | 산불 확산(셀) | GPL-3.0 | S | 서버 전용 | github.com/cell2fire/Cell2Fire (05-15) | VERIFIED |
| ForeFire | 산불 전선 모델 | GPL-3.0 | S | 서버 전용 | github.com/forefireAPI/forefire | VERIFIED |
| FARSITE/FlamMap | 산불(미 산림청) | 확인 못 함 | S (Windows) | GitHub 저장소 못 찾음 | — | UNVERIFIED |
| r.avaflow | 산사태·토석류·눈사태(2상) | 오픈소스, GPL 계열로 추정 | S (GRASS) | 라이선스 문구 직접 확인 필요 | landslidemodels.org/r.avaflow | UNVERIFIED |
| Landlab | 지형 진화·유출·산사태 확률 성분 | MIT | S (Python) | 교육·연구용 성분 다수 | github.com/landlab/landlab | VERIFIED |
| pysheds | 유역·흐름방향·집수 | GPL-3.0 | S | 서버 전용 | github.com/pysheds/pysheds | VERIFIED |
| WhiteboxTools | 수문·지형 분석 400+ 도구(가시권 포함) | MIT | S (Rust, WASM 가능성) | — | github.com/jblindsay/whitebox-tools | VERIFIED |
| pvlib | 태양 위치·일사·PV 출력 | BSD-3 | S (Python) | — | github.com/pvlib/pvlib-python (★1672) | VERIFIED |
| SunCalc | 태양·달 위치 | BSD-2 | **B** | 지형 그림자는 자체 DEM 광선추적 | github.com/mourner/suncalc | VERIFIED |
| Turf.js | 브라우저 공간 연산 | MIT | **B** | — | github.com/Turfjs/turf | VERIFIED |
| deck.gl | GPU 대량 레이어(GlobeView) | MIT | **B** | Three.js 와 한 캔버스 합치기 어려움 | github.com/visgl/deck.gl | VERIFIED |
| three-globe / three-geo | Three.js 지구본 / DEM→3D 지형 | MIT / MIT | **B** | three-geo 마지막 push 2025-02(정체) | vasturiano/three-globe , w3reality/three-geo | VERIFIED |
| CesiumJS | 3D 지구·지형·3D Tiles | Apache-2.0 | **B** | v1 이 이미 사용 | github.com/CesiumGS/cesium | VERIFIED |
| zarrita.js | 브라우저 Zarr 읽기 | MIT | **B** | 청크 단위 부분 읽기 | github.com/manzt/zarrita.js | VERIFIED |
| geotiff.js / gdal3.js | 브라우저 GeoTIFF / GDAL WASM | MIT / **LGPL-2.1** | **B** | gdal3.js 번들은 LGPL 재링크 의무 모호 | geotiffjs/geotiff.js , bugra9/gdal3.js | VERIFIED |
| lisyarus/webgpu-shallow-water | WebGPU 얕은물(가상 파이프) | MIT | **B** | 예제 수준 | github.com/lisyarus/webgpu-shallow-water (★103) | VERIFIED |
| deluge-flood-sim | WebGPU 얕은물, 실제 USGS 지형 | MIT | **B** | 별 0, 2026-09 신생 | github.com/rkottomt/deluge-flood-sim | VERIFIED |
| WebFlood | WebGL 도시 홍수(반라그랑주) | MIT | **B** | 2018 정지 | github.com/aeplay/WebFlood | VERIFIED |
| **tsunami-lab** | **Three.js 지구본 + WebGL2 비선형 얕은물 + Okada 단층 + GeoClaw 백엔드 선택** | MIT | **B**+S | 별 0, 2026-09 신생. **EARTHUS 쓰나미 엔진과 가장 닮은 구조** | github.com/Dongwu259/tsunami-lab | VERIFIED |
| Open-Meteo | 날씨 API | 코드 **AGPL-3.0** / 자료 CC BY 4.0 / 무료 API 비상업, 상업은 구독 | S (자가호스팅 가능) | AGPL 은 네트워크 제공도 배포로 봄 | github.com/open-meteo/open-meteo | VERIFIED |
| MCP 명세 | AI↔도구 표준 | 최신 **2026-07-28** (그 전 2025-11-25) | — | 도구·자원·프롬프트 / 샘플링·elicitation / Streamable HTTP | modelcontextprotocol.io/specification | VERIFIED |
| MCP SDK | TS·Python·C#·Go·Rust(1등급), Java·Ruby(2), Swift·PHP·Kotlin(3) | MIT→Apache-2.0 전환 중 | — | — | github.com/modelcontextprotocol/typescript-sdk | VERIFIED |
| **MCP Apps** (ext-apps) | 도구 결과를 **호스트 안 iframe UI(ui://)** 로 렌더 | MIT→Apache-2.0 | B | Claude 웹·데스크톱 지원(커스텀 커넥터는 유료 플랜) | github.com/modelcontextprotocol/ext-apps (★2870) | VERIFIED |

- MCP Apps 가 중요하다: EARTHUS 가 MCP 서버로 `run_tsunami_eta` 같은 도구를 내놓고 결과를 **작은 지구본 UI 로 Claude 대화창 안에 그릴 수 있다**(도구에 `_meta.ui.resourceUri`). 출처: https://modelcontextprotocol.io/extensions/apps/build.md — VERIFIED.
- 약관 원칙 한 줄: MCP 명세는 "도구 호출 전 사용자 명시 동의"를 호스트에 요구 — 계산 비용이 드는 도구는 비용·시간을 설명문에 적어야 한다.

---

## C. "3D 지형 지구본 + 시뮬레이션" — 해볼 만하고 차별되는 10가지

라이선스 원칙(배포 방식으로 갈림):
- **서버에서만 실행**(Lambda/컨테이너, 결과만 보냄) → GPL-2/3 는 '배포'가 아니라 소스 공개 의무 없음. **예외: AGPL**(네트워크 제공도 배포).
- **브라우저·Windows/Mac 앱에 WASM·JS 로 번들** → 그 자체가 배포. GPL 코드를 넣으면 앱 전체가 GPL. LGPL(gdal3.js·WW3)은 WASM 에서 재링크 의무가 모호.
- **ElmFire(Commons Clause)** = 판매 금지 → 유료 제품에서 제외.
- 허용적 엔진 우선: 표류=Parcels(MIT) > OpenDrift(GPL-2) · 범람=GeoClaw(BSD)/ANUGA(Apache) > SFINCS(GPL-3) · 궤적=자체 RK4 > HYSPLIT.

| # | 기능 (화면에서 무엇이 바뀌나) | 받칠 프로그램 | 실행 | 라이선스 주의 | 7단계 칸 · 메뉴 |
|---|---|---|---|---|---|
| 1 | **쓰나미: 진원 찍기 → 파면 전파 애니메이션 + 해안 도달시각 + 최대 파고** (지금 √(g·h) 도달시간에 파고를 더함) | 브라우저: tsunami-lab 방식 WebGL2/WebGPU 선형 얕은물 / 정밀: GeoClaw | B + S | MIT·BSD — 안전 | ⑦ · 재해 |
| 2 | **해안 범람: 해일고·해수면 +Xm 을 넣으면 z10~11 지형 위로 물이 번짐** (정적 욕조 모델 아님) | 브라우저 WebGPU 얕은물(lisyarus·deluge 참고) / 서버 ANUGA | B + S | MIT·Apache — 안전. ⚠️ DSM 이 도시를 3~7m 로 올려 "안 잠김" 문제(메모리: 맨땅 DEM 선행) | ⑦ · 해양·재해 |
| 3 | **표류: 바다 한 점(사고·실종·기름)을 찍으면 GFS/해류 5일 입자 구름 + 해안 도착 확률** | Parcels(MIT) 서버, 결과 입자 궤적을 브라우저 재생 | S → B | MIT 우선, OpenDrift 는 서버 전용 | ⑥⑦ · 해양 |
| 4 | **대기 궤적·확산: 산불 연기·황사·방사능 가정 방출 → 3D 궤적(고도 포함)** | 자체 RK4 궤적(GFS u·v·w), 확산은 FLEXPART 서버 | S | FLEXPART GPL-3 서버 전용, HYSPLIT 은 피함 | ⑦ · 대기질 |
| 5 | **지형 바람: 산·계곡에서 바람이 휘는 국지 바람장 → 흐르는 입자** | WindNinja(퍼블릭 도메인) 서버, 영역 요청 단위 | S | 제약 없음 | ②⑦ · 바람·지형 |
| 6 | **산불 확산 가정: 발화점 + 바람·경사 → 시간별 화선** | 단순 Rothermel/셀 모델 자체 구현(브라우저) 또는 Cell2Fire/ForeFire 서버 | B / S | Cell2Fire·ForeFire GPL-3 서버 전용, **ElmFire 금지** | ⑦ · 재해 |
| 7 | **태양·그림자: 날짜·시각을 끌면 3D 지형·건물 그림자 + 일사량·PV 추정** | SunCalc(BSD-2) + 자체 DEM 광선추적(브라우저), 정밀 pvlib 서버 | B | 안전. Google Earth 가 태양광 설계를 유료 등급 근거로 씀 | ②④⑦ · Life·지형 |
| 8 | **가시권·경관: 봉우리·전망대에서 보이는 범위, 일출 방향** | WhiteboxTools(MIT) 서버 또는 브라우저 GPU 가시권 | B / S | 안전 | ⑦ · Travel·지형 |
| 9 | **AI 앙상블 확률: "5일 뒤 서울 강수 >10mm 확률 %" + 근거 "N개 중 M개"** | Earth2Studio(Apache) 로 WeatherNext 2/GenCast/Aurora 앙상블, 또는 ECMWF ENS | S (GPU) | WeatherNext 2 버킷 약관 재확인, NeuralGCM SA | ⑤⑥ · 기온·강수 |
| 10 | **산사태·토석류 가정: 호우 누적 + 경사 → 흘러내릴 경로·도달 범위** | Landlab(MIT) 성분 / r.avaflow(라이선스 확인) 서버 | S | r.avaflow GPL 추정 → 서버 전용 | ⑦ · 재해·지형 |

(범위 밖이지만 후보) 초단기 강수 nowcast = pySTEPS(BSD-3) — **격자 반사도 자료가 있어야 한다**(메모리: 기상청 레이더 PNG 는 불가 확정). 태풍 진로 앙상블 = WeatherNext Cyclones / ECMWF ENS.

공통으로 만들 것 (위 10개를 "사용자 AI 가 부르는 계산"으로 만드는 부품):
- **EARTHUS MCP 서버**(Streamable HTTP, TS SDK): `list_scenarios` · `setup_scenario(type, 위치, 매개변수)` · `run(scenario_id)` · `get_result(요약 수치 + 출처 + 모델 이름·실행 시각)` · `compare(a, b)`. 결과에 근거 패킷(입력 자료·가정·한계)을 같이 실어 AGENTS.md '근거 있으면 말한다'에 맞춘다.
- **MCP Apps UI**: 결과를 대화창 안 작은 지구본으로(ui:// 리소스). 전체 작업은 EARTHUS 앱으로 딥링크.
- 시나리오를 URL/JSON 한 개로 저장·공유(nullschool·Windy 식 상태 URL).

자료 해상도 경고(메모리 기준): 기온·바람 필드가 5° Open-Meteo 인 동안에는 #3·#4·#5 의 입력 바람이 거칠다 → GFS 0.25°/0.5° 필드(이미 gfs-fc 파이프라인 있음)를 계산 입력으로 먼저 돌려야 한다. Open-Meteo 무료 API 는 비상업 조건 — VERIFIED(위 B 표).

---

## D. 한눈 요약: 무엇을 배우고 어디서 다른가

| 누가 | 돈을 받는 곳 | EARTHUS 가 배울 것 | EARTHUS 가 다를 곳 |
|---|---|---|---|
| Windy / Ventusky / MyRadar / Zoom Earth | 더 자주·더 잘게·더 길게·비교·알림 (연 $6~30) | 모델 이름 전면, 층 수로 등급 구분, 애드온 팩 | 예보 지도 가격 경쟁은 피함. 계산·확률·원인 |
| Google Earth Pro 등급 | 사용자당 월 과금, 층·면적·저장·Gemini 한도 | 지형 위 계산 하나가 등급 근거(태양광) | Gemini 고정 vs 사용자 AI, 재해 물리 계산 |
| Felt / Cesium / Esri / CARTO | 기업 등급에서 MCP·API | MCP 가 최상위 판매 포인트 | 조회형 MCP vs **계산형 MCP** |
| NVIDIA Earth-2 / DestinE | GPU·기관·유럽 한정 | 모델 채점표, 스토리라인 what-if | 개인·전문가 가격대, 동아시아, 소비자 화면 |
| First Street / One Concern | 주소별 위험 점수·기업 SaaS | "내 주소" 한 점 요약, 방법론 공개 | 정적 점수 vs 지금 사건의 동적 계산 |
| nullschool / NASA Worldview·Eyes | 무료 | 흐름 미학, 비교 모드, GIBS 무료 타일 | 해석·계산 없음 |
