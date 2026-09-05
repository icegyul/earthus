# EARTHUS v2-three — 다음 단계

## 0. 1.0 메뉴 → v2 이식 매핑 (2026-09-01, 사용자 지시: 메뉴별 판단 이식)

1.0(prototype/) 전체 인벤토리 기준. "그대로 복제"가 아니라 v2 화면 문법에 맞는 표현으로:

| 1.0 메뉴 | v2 표현 판단 | 데이터 | 상태 |
|---|---|---|---|
| 지구 스타일 46레이어 | 씬별 레이어로 분산 (전부 동시 노출 금지 §65.1) | GIBS/RealEarth/S3 캐시 | GIBS 직결분(눈 NDSI·해빙·지표온도)부터 — URL 검증 완료 |
| Alert 8종 (태풍/지진/쓰나미…) | 재해 씬 = 지구 위 실데이터 마커·트랙 | GDACS(CORS 검증), USGS, NWS | **최우선 이식 후보** |
| 인공위성 SGP4 | 우주/이동 레이어, 1.0 코드 재사용 | CelesTrak S3 | 코드 이식 가능 |
| News(GDELT)/물어보기/LAB | EARTH INTELLIGENCE 탭(NOW·WHY)에 흡수 | GDELT S3 | 탭 콘텐츠로 재설계 |
| 여행·관광 (서울 실시간 인구) | 사람 씬의 첫 실데이터 | S3 /tourism | 사람 씬 해금 후보 |
| 취미 19종 (서핑/낚시/산/조류) | 해양 씬 확장 — marine API 이미 연결됨 | open-meteo, 정적 JSON들 | 서핑/낚시부터 |
| 항공편 | 이동 레이어 | adsb.lol (프록시 403 상태) | 프록시 복구 필요 |
| 선박 | 1.0과 동일하게 정책상 스텁 유지 | — | 표시만 |
| AETHERUS 우주 4메뉴 | 별도 우주 씬 (cosmic3d 재사용) | 정적 큐레이션 | 후순위 |
| 검색/내위치/설정/요금제 | 셸 크롬으로 (검색은 이미 v2에 있음) | — | 부분 완료 |

## 0-b. 위성 구름 소스 현황 (2026-09-01 검증)

- **GK2A(천리안) ✓ 연결됨**: 1.0의 S3 캐시가 살아있고 CORS `*`, 이미 등장방형 재투영.
  `https://earthus-cache-kr.s3.us-east-2.amazonaws.com/clouds/gk2a/meta.json` → `ir112.png?t={at}` (1600², 70E–190E/±60, 10분 주기). 타일 채널(vi006 z8 한국 0.5km 등)은 디테일 윈도우에 연결 가능 — 미사용 상태.
- **GMGSI 전지구 IR 합성 ✓ 연결됨**: `/clouds/meta.json` + `global.png` (3072px, ±72.7°, LA-PNG 알파=구름량). '관측' 버튼 1차 소스, GIBS 3중합성은 폴백.
- **히마와리-9 네이티브 ✗**: NICT는 자기 오리진만 허용, SLIDER는 ACAO 없음 → 정적 서버에 `/proxy/hw9/` 패스스루 추가 또는 gk2a-clouds Lambda 확장(`/clouds/hw9/fd.png`)이 경로. GEOS→등장방형 역투영 수식은 조사 보고서에 정리됨(λ0=140.7E).
- **CTH(구름고도, P5 3D 승격의 핵심) ✗ 브라우저 단독 불가**: KMA API허브 CTPS NetCDF(키 필요·CORS 없음). **정답: gk2a-clouds Lambda 확장** → CTH를 높이 인코딩 PNG로 `/clouds/gk2a/cth.png` 발행. 임시안: IR 휘도온도 유사고도(ESTIMATED 라벨).

## 1. ABYSSAL 통합 (클론 완료: reference/abyssal, MIT)
- `window.__app.weather.set()` API 확인 — 파라미터 주입 설계 완료
- **빌드 실패 미해결**: vite 8/rolldown 에러 (allow-scripts 정책 연관 추정) — 전체 에러 로그 확보 필요
- 빌드 성공 시: dist를 v2-three/abyssal/로 서빙, same-origin iframe으로 우리 관측/시나리오 파라미터 주입

## 2. 빙하·눈·폭풍 추적 (조사 완료 — 검증된 URL은 조사 보고서 참조)
- GIBS `MODIS_Terra_NDSI_Snow_Cover` (TMS `500m`) + VIIRS 2018~ → 연도 비교 스크럽
- open-meteo `elevation=5500&hourly=freezing_level_height` → 네팔 고산 NOW 카드 (검증됨)
- ERA5 아카이브 API → 만년설 융해 트렌드 차트
- GDACS TC GeoJSON → 지구 위 태풍 트랙 레이어
- GLOF SCENARIO: 지역 3D 지형(이미 구현) 위 파열 수문곡선 + 천수 라우팅 — MODEL·ILLUSTRATIVE 라벨 필수. 주의: 2026-08-26 랑탕리룽 붕괴는 고전적 GLOF가 아니라 빙벽·암석 사태 유발 — 프리셋 2종(빙퇴석호 붕괴 / 사태 유발 서지)

# (이전) 2026-09-01 밤샘 빌드 이후

기준: `EARTHUS_2.0_FINAL_MASTER_DEVELOPMENT_DIRECTIVE_v3.2` (docs/earthus-v2/MASTER_SPEC/).
이번 빌드에서 구현된 것은 모닝 리포트 참조. 아래는 **의도적으로 남긴 것**과 그 이유.

## 1. 오늘 밤 하지 않은 것 (지시서상 필요하지만 전제 조건 미충족)

| 항목 | 지시서 | 전제 조건 |
|---|---|---|
| 실데이터 제공자 연결 (KMA, AirKorea, 서울 인구) | §46–54 | API 키 + CORS 프록시 서버 필요. 브라우저 단독 불가 |
| Weather Detail W0–W9 화면 | §80 | KMA 캐노니컬 모델 연결 후 |
| 결제/서버 엔타이틀먼트 | §109 | 서버 검증 필수. 현재는 UI 셸만 (가격은 §107.1 미승인 — 표시 금지 유지) |
| NAS Cold Archive / 3D Cloud State 파이프라인 | PART R/S | 위성 피드 + 서버. 유럽은 Meteosat 계약 전 차단(§113) |
| earthus.net/v2 배포 | §97 | 지시서상 BLOCKED (72-커밋 디싱크, 스테이징 없음) |
| 서울 데이터 타워 P0 | §19.9 | 실제 121개소 데이터 연결 후 (가짜 값 생성 금지 원칙) |
| 고해상도 GFS 구름 | — | GRIB→텍스처 서버 파이프라인 필요. 현재 12° 격자는 브라우저 API 한도(open-meteo 분당 600위치) 때문 |

## 2. 기존 v02 모듈 연결 매핑 (다음 세션에서 임포트 검토)

이번 빌드는 안정성을 위해 v02 모듈을 직접 임포트하지 않고 동일 개념을 셸에 재구현했다.
다음 단계에서 아래 모듈로 교체/위임 가능:

| v2-three 구현 | 대응 v02 모듈 (prototype/js/earthus2/v02/) | 카탈로그 ID |
|---|---|---|
| ui-shell.js SCENES 레지스트리 | core/scene-orchestrator.js, visual/visual-manifest.js | FND-xxx |
| CountryFocus (main.js) | geo/country-focus.js — {camera, dimming, clipping} 반환 계약 | ALG-GEO-002 / FND-014 |
| dataBadge 상태 계약 | core/confidence.js, core/canonical-signal.js | — |
| 미오픈 국가 카드 | ops/readiness-compiler.js, paid/country-unlock.js | — |
| WHY/NEXT 유료 셸 | paid/entitlement.js, paid/intelligence-orchestrator.js | — |
| (미구현) 품질 스텝다운 | core/resource-governor.js, core/truth-budget.js (§20 NORMAL/ECO/SAFE) | — |

주의: v02 모듈이 CommonJS면 수정하지 말고 래핑할 것. 테스트는 tools/earthus2-v02/.

## 3. 알려진 프로토타입 한계

- **관측 구름(GIBS)**: 진색 영상에서 밝기·채도로 구름 추출 → 빙설 지역(그린란드/남극) 오검출. MODIS 스와스 갭(궤도 간 빈 띠)은 위성 특성. 정식 버전은 Cloud Fraction 전용 산출물 사용 권장
- **최고 고도(근사)**: 전역 z4(≈10km/px) 샘플이라 실제 피크보다 낮게 나옴 (한국 958m vs 실제 1,947m). 디테일 윈도 활용 or 서버 사전 계산으로 개선
- **라벨**: 국가명만. 도시 라벨은 데이터 소스(§ airports.json/catalog.json 검토) 연결 후
- **대륙 포커스**(§19.4 Continent Focus): 미구현 — 국가 bbox 유니온으로 다음 단계
- **지도 모드**: OSM 래스터 타일 (어트리뷰션 필수 유지). 정식 버전은 자체 스타일/벡터 타일 검토
- **극지(±85° 이상)**: 메르카토르 데이터 없음 → 고정 빙상색 페이드 처리

## 4. 실행 방법

```
node tools/dev_static_server.mjs 8777
→ http://localhost:8777/v2-three/index.html
```

## 2026-09-01 웨이브 2 완료 (배포됨)
- 구름 3D 승격: CTH 실측(gk2a/cth) 릴리프 + IR 근사(DERIVED) — §42A 위성 셸 FAIL 해소
- live-layers.js: 부이(수온색)·낙뢰·산불위험·KMA특보·쓰나미·서울121타워·태풍 공식트랙(KMA/JMA/NHC)
- 태풍 플래그십 1단계: 트랙 카드 → '이 조건으로 바다 시뮬' (풍속→SSHS 초기 카테고리)
- sat-layer.js: AETHERUS 위성추적 — S3 카탈로그 + SGP4 250ms (261기 + 스타링크 1500/11037 상한명시)
- CORS 규칙: /events·/ocean = S3 직접, /tourism·/clouds·/celestrak = earthus.net 경유
- 남은 것: P3 해수면/해저 분리(현 해저릴리프 미관 훼손 위험 — PD 확인 필요), P6 대기 산란,
  Event Room 확장(PAST·Causal Gate), MY EARTH, GLOF, 바람장/대기질(1.0 /wind), ISS 라벨·위성 클릭
- /wind 생존 확인(09-01): korea-air-obs 264KB·stations(METAR) 625KB·gts-global 1.3MB·kma-aws 39KB·jp-amedas 266KB 전부 200 (S3 직접, 리스팅만 403) → 다음 웨이브: 바람·대기질·지상관측

## 2026-09-01 P4 UNDERWATER (R-10) 구현
- trench-view.js: 마리아나 해구 잠수 뷰 — Terrarium z9 실측심(수직 1×, 데이터 최심 10,864m vs 문헌 10,935m),
  수심 게이지(sqrt 눈금·수층 5구분), 수온(문헌 프로파일)·압력(정수압)·해저까지, 수심대별 관측 생물(문헌),
  자동 파일럿 하강/상승/속도, 헤드라이트+광 감쇠(연출·지형 불변), 마린 스노, 가상 수심 명시
- 지구 쪽: 지오메트리가 이미 0m 수면(max(h,0)) + 바다 스펙큘러 → P3 GLOBAL 요구 기충족 확인

## 2026-09-01 오후 — 메뉴·MY EARTH·Event Room 웨이브 (배포됨)
- 메뉴: 1.0 문법 이식 (좌측 세로 브랜드 손잡이 EARTHUS/AETHERUS + 286px 슬라이드 패널, 도메인 섹션)
- 대기질(에어코리아 673개소)·바람 관측(AWS+GTS 2,940개소) 잠금 해제
- MY EARTH 탭: 내 하늘+특보+대기질+바람 통합 (위치는 localStorage만)
- 구름 근접 각짐 해소: CLOUD_VERT 5탭 평균 + 고도 900~3200km 릴리프 감쇠
- Event Room 확장: PAST(EQ=USGS 아카이브 30일/300km 실조회, TC=KMA 공식 타임라인),
  WHY 인과 주장 게이트(근거 없이 원인 말하지 않음), sceneProjection 배지
- ⚠ 해구(trench-view.js)는 별도 챗 담당 — 이 세션은 수정 금지

## 2026-09-01 밤 — AETHERUS 확장 (배포됨)
- 발사 일정 (LL2): 발사대 마커 + 다음 6건 카드. ⚠ 비인증 15회/시간 — 세션 1회 로드 유지할 것
- 오늘의 태양계: kepler.js 이식(JPL Table 1) + solar-view.js (8행성 실위치·날짜 스크럽 ±365일)
- 배포 번들에 assets/planets 복사 단계 추가됨 (deploy 명령 갱신 필요 시 확인)
- 남은 AETHERUS: 우주 사진관(59점 중 프리뷰 9점뿐 — 자산 보강 선행), 우리은하·우주의 크기

## 2026-09-01 저녁 — 해양 완성 + 사람 씬 (배포됨)
- 해양: 해수면온도(NOAA OISST 39,974셀)·유의파고·표층해류(Open-Meteo)·해변271/낚시946 → 선박(AIS 정책)만 잠금
- 사람: 국가 인구(World Bank SP.POP.TOTL 167개국, 세제곱근 높이)·지역 뉴스(RSS 116건, 지역 대표점)
- 여행 POI = Overpass 공용서버 504 불안정, 항공편 = adsb.lol CORS 헤더 없음(API 자체는 200) → 둘 다 프록시 필요
- ⚠ 배포 번들에 engine/ (js/earthus2/v02 61파일) 포함 + 경로 재작성 필수 — 누락 시 프로덕션 403·부팅 실패

## 2026-09-03 공모전 화면 — 사건 방 · 여행 씬 (v2-three)

스토리보드(문제→답→효과, 대회별 한 장면)는 `docs/earthus-2.0/v06/COMPETITION_2026_ENTRY_ANALYSIS.md`와 세션 아티팩트 "EARTHUS 출품 3막"에 있다.

### 만들어진 것
- **사건 방** (`js/event-room.js`, GovTech 시연 2단계): 피드에서 사건을 누르면 기관 스택 + 진리등급 + 현재→다음→행동.
  사건 결합은 정본 `earthus2/v11/event/event-fusion.js`(HAZ-011) `eventSimilarity` 그대로. 줄마다 "지구에 켜기"(`room-layer` 액션 → 메뉴와 같은 경로).
  태풍: GDACS + 공식 트랙(KMA·JMA·NHC) + ECMWF 앙상블 + 해상관측 193 + 연안 침수 예상도 + 기상청 특보. 지진: USGS + PTWC 쓰나미 + 해상관측 + 지각 맥락.
  행동 칸은 공식 텍스트(특보 종류·등급, PTWC 게시문 링크)만 옮긴다 — 캐시의 `command`는 '발표/변경'이라 지시문이 아니다.
- **여행 씬** (`js/travel.js`, 데이터랩 출품 모듈 v1): 시군구 228곳 비콘, 오늘 점수 = 목적 밀도 0.6 + 덜 붐빔 0.4, 특보·에어코리아 나쁨(등급 3+)은 게이트로 제외하고 카드에 "후보 제외"라고 적는다.
  데이터: `data/tourism/kto-discovery.json`(138KB) ← `tools/build_kto_discovery.py`가 KTO 공개 산출물 5종(무장애 11,644 · 영문 25,398 · 웰니스 202 · 연관 1,409 · 방문자 857)을 최근접 시군구로 집계. 원본은 12/28MB라 브라우저에 못 싣는다.
  라벨은 EARTHUS DISCOVERY. 방문자수 ≠ 관광객 문구를 카드와 파일 note에 그대로 둔다.

### 남은 것
- KTO 4종(집중률·다양성·수요 강도·중심 관광지)은 아직 UNAVAILABLE(0건) — 서버 스윕 후 `build_kto_discovery.py`에 성분 추가.
- 방문자 스냅샷이 단일 기준일(2026-08-03 월요일)이다. 일자 범위가 쌓이면 "덜 붐빔"을 요일별로.
- 지역코드 12xxx(71건)는 kr-places 매칭 실패로 제외. 코드 체계 확인 필요.
- 9/16 공개 배포 → 이용 지표(`analytics-contract.js` tourism.* 이벤트) 수집이 서식4 계량성과.
