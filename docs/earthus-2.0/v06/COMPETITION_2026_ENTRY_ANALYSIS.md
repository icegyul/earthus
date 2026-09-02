# EARTHUS 2026 — 출품 대회 3건 분석과 제작 방향

작성일 2026-09-02. 이 문서는 `COMPETITION_SERVICE_INTEGRATION.md`의 세 출품 모듈(TRAVEL DISCOVERY / POLLUTION LENS / PLANET INTELLIGENCE)을 실제 대회 공고와 현재 코드베이스 상태에 대조한 결과다. 공고 원문 PDF 텍스트는 세션 스크래치패드(`gongmo_layout.txt`)에 보관했고, 아래 수치는 모두 공고·기사·라이브 JSON에서 그대로 옮겼다.

---

## 0. 한눈에 보기

| 대회 | 마감 | 남은 기간(9/2 기준) | 출품 모듈 | 본질 | 판단 |
|---|---|---|---|---|---|
| 2026 한국관광 데이터랩 활용 경진대회 | **9/30(수) 14:00** | 28일 | EARTHUS TRAVEL DISCOVERY | 데이터 활용 **성과 사례** 공모 (아이디어 공모 아님) | **주력**. 4주 안에 "서비스 개발 + 초기 이용 성과"를 만들어야 함 |
| 2026 GovTech 창업경진대회 | **9/21(월)** | 19일 | EARTHUS PLANET INTELLIGENCE | AI·디지털 기반 공공서비스 혁신 창업 아이디어/제품 | 사업계획서 재활용으로 제출 가능. 모집요강 세부는 사이트 로그인 뒤에만 보임 |
| Earthshot Prize 2027 | 노미네이터별 ~**11/17** | 76일 | EARTHUS POLLUTION LENS | 자가 지원 불가, Official Nominator 경유. 현장 검증된 임팩트 필요 | 2027은 증거 부족. 2028 사이클 목표로 올해는 증거 축적 |

---

## 1. 2026 한국관광 데이터랩 활용 경진대회

### 1.1 공고 사실 (공모요강 PDF 12쪽 기준)

- 주최 문화체육관광부 / 주관 한국관광공사. 운영사무국 gongmo@w-planet.co.kr, 070-5057-2343 (평일 09~18시). 개인정보 위탁 운영대행 ㈜상상메이커.
- 접수 2026.8.4(화)~**9.30(수) 14:00** 한국시간, 기한 엄수. 온라인 신청 폼 https://forms.gle/gHtptTMGw13rTETE8
- 참가: 데이터랩 이용자 누구나. 구분은 개인 / 팀(최대 4인) / 기관 중 1개.
- 주제: **'한국관광 데이터랩' 데이터를 활용한 성과 창출 사례**. 관광 외 분야 데이터 융복합 사례 포함.
- 일정: 서면심사 10/1~10/8 → 발표대상자 통보(10/8 또는 10/12) → PT 자료 제출 10/12~10/20 → **발표심사 + 시상식 10/23(금) 서울 오프라인**. PT 15분(발표 8 + 질의 7), 신청 대표자가 직접 발표, 불참 시 선정 취소.
- 시상 19점, 총 2,000만원: 대상 1(장관상, 500만) / 최우수 2(각 200만) / 우수 6(각 100만) / 장려 10(각 50만). 서면 상위 1~9위만 발표심사, 10~19위는 추가 심사 없이 장려상.

### 1.2 심사 배점 (이게 설계 기준이다)

| 항목 | 서면 | 발표 | 심사 내용 |
|---|---|---|---|
| 창의성·혁신성 | 20 | 10 | 접근방식의 독창성과 혁신성 |
| **데이터 활용도** | **30** | **30** | **한국관광 데이터랩 활용도(필수)**, 데이터 활용/분석 과정의 구체성·적합성 |
| **효과성·성과 창출도** | **30** | 25 | 데이터 활용 결과의 효과성, 실질적·구체적 성과 창출 정도 |
| 사회적·경제적 파급력 | 20 | 20 | 사회문제 해결 기여 또는 경제효과, 가치 창출·기대효과, 타 사례 확산 가능성 |
| 발표 전달력 | – | 15 | 핵심 전달력, 질의에 대한 구체적·신뢰성 있는 답변 |

- 필수 서류 누락 시 평가 대상 제외.
- 60점이 "데이터랩을 얼마나 썼는가"와 "무슨 성과가 났는가"다. 3D 지구의 시각적 완성도는 창의성 20점에서만 작동한다.

### 1.3 제출 서류와 서식4 구조

| 서류 | 필수 | 비고 |
|---|---|---|
| 서식 1-1 참가신청서(개인·팀) / 1-2(기관) | 필수 | 전원 서명 후 PDF |
| 서식 2 개인정보 수집·이용 동의서 | 필수 | 전원 서명 |
| 서식 3 참가자 유의사항 확인서 | 필수 | 전원 서명 |
| **서식 4 활용사례 작성양식** | 필수 | 서명 불요. **개조식 2~3장, 함초롱바탕 11pt, 줄간격 160** |
| 참고자료(사진, 실적·성과보고서 등) | 선택 | Zip으로 압축 첨부 |

서식4 필수 항목:
1. 응모작 제목 — 예시가 "방문자 데이터로 개발한 세대별 맞춤 콘텐츠, 방문객 수 200% 신장 이끌다"처럼 **제목에 성과 수치**를 넣는 형식.
2. 활용 데이터 — 데이터랩(필수) / 타분야 데이터(선택) 구분해 기입.
3. 성과분야 1개 체크 — 관광지 안전문제 해결 / 마케팅·홍보 활성화 / 매출·수익 등 경제적 성과 / 전략수립·기획 / 상품·서비스 개발·개선 / **앱·웹 등 서비스 개발**.
4. 핵심성과 1~2줄 요약, 계량성과(예: 방문객 50% 증가, 체류시간 2시간 증가, 페이지 조회수 3배).
5. 본문 4단: 1) 문제점·현안 2) 데이터 활용 방안 3) 사업 개선·적용 사례 4) 추진성과·기대효과(정량 위주).

공고가 제시한 사례 유형 6가지와 각각의 데이터랩 메뉴: 지역 관광정책 수립(성/연령별 방문·소비, 축제현황, 의료관광) / 관광객 경험·편의 개선(**중심-연관 관광지 지도, 유입·유출**) / **신규 관광 서비스 개발(내비 검색건수, 인기관광지, 소셜 키워드 → 웹·앱 개발)** / **공공 안전·지속가능 관광(야간관광, 관광지 집중률, 혼잡도 매뉴얼)** / 지역경제(카드·지역화폐 소비) / 마케팅 최적화(숙박·체류시간).

### 1.4 유의사항 중 우리에게 걸리는 것

- **타 공모전에서 이미 채택된 사례이거나 기본 구상이 매우 유사한 경우 제외**, 다중지원 금지. → GovTech 출품물(PLANET INTELLIGENCE)과 데이터랩 출품물(TRAVEL DISCOVERY)은 제목·구상·성과를 명확히 분리해야 한다.
- 저작권은 응모자에게 있으나 출품과 동시에 공사에 저작물 이용 허락을 한 것으로 간주. 수상작은 공익 홍보에 활용되며 수정 가능한 원본 파일 제출을 요구할 수 있다.
- 수상 후 실적 증빙자료를 요청할 수 있다. → 분석 로그·이용 지표를 재현 가능한 형태로 보관해야 한다.
- 참가서류 zip(편집용 서식)은 이 세션에서 내려받지 않았다. PDF 7~12쪽에 서식 전문이 있으나 편집본은 공고 첨부2를 직접 받아야 한다.

### 1.5 지난 수상작이 말해주는 것 (2025)

- 대상: 강진군 '반값여행' — 방문 시기·성별연령·소비 패턴 분석으로 타깃·시기·프로그램 설계. 2024년 방문객 282만 명(+18%, +43만), 참여자 소비 69억.
- 최우수: 의료웰니스 관광객 유치 마케팅 / 외국인 개별관광객(FIT) 대상 상품 개발.
- 우수: 관광객 안전 확보 정책, 전통시장·로컬 상권 상품 개발.
- 결론: **정량 성과가 있는 지자체·기관이 상위권**. 개인·팀의 서비스 개발 출품은 "앱·웹 서비스 개발" 분야에서 이용 지표와 확산 가능성으로 승부해야 한다.

---

## 2. 현재 코드베이스에 이미 만들어진 것

### 2.1 승인받은 공공데이터 10건 대 코드 매핑

| 승인 데이터 | 코드 서비스 id | 계약 | 라이브 상태 (earthus.net/tourism/kto/summary.json, 2026-09-01 19:37Z) |
|---|---|---|---|
| 웰니스관광정보 | `wellness` | 9 op | **AVAILABLE** 202건 (8/20 수집) |
| 영문 관광정보서비스_GW | `english` | 12 op | **AVAILABLE** 25,398건 (8/20) |
| 무장애 여행 정보 | `barrierFree` | 11 op | **AVAILABLE** 11,644건 (8/20) |
| 빅데이터_지역별 방문자수_GW | `visitors` | 2 op | **UNAVAILABLE, 0건** (9/1 일일 수집이 빈 결과) |
| 관광지 집중률 방문자 추이 예측 | `concentration` | 1 op | UNAVAILABLE 0건 |
| 관광지별 연관 관광지 | `related` | 2 op | UNAVAILABLE 0건 |
| 기초지자체 중심 관광지 | `localHub` | 1 op | UNAVAILABLE 0건 |
| 지역별 관광 다양성 | `diversity` | 3 op | 계약만 있고 **한 번도 수집 안 됨** |
| 지역별 관광 수요 강도 | `demandStrength` | 2 op | 계약만 있고 **한 번도 수집 안 됨** |
| 국민체육진흥공단_전국체육시설 | 없음 | 없음 | **코드에 전혀 없음** |

- 수집기: `aws/tourism-flow/kto_provider.py`(9서비스 allowlist, 계약·스키마 드리프트 검사), `kto_collector.py`(S3 lease, raw→normalized→summary), `kto_pipeline.py`(의미 분리 정규화). 키는 Lambda 환경변수 `DATA_GO_KR_SERVICE_KEY`만 사용하고 브라우저에는 노출되지 않는다.
- 스케줄: `aws/configure-tourism-flow-operations.sh`는 서울 실시간 인구 5분 rule과 KTO visitors 일일 rule(cron 19:37Z)만 만든다. 나머지 7개 서비스는 수동 1회 수집(8/20) 이후 방치.
- 계약 `requiredParameters`를 보면 0건의 원인이 보인다. `related`/`localHub`는 `areaCd`+`signguCd`+`baseYm`, `concentration`은 `areaCd`+`signguCd`, `diversity`/`demandStrength`는 `areaCd`+`baseYm`이 필수인데, 8/20 수집은 지역 루프 없이 한 번 호출한 것으로 보인다. `visitors`는 `kto_collector.py:342-372`가 "어제부터 7일"만 요청하는데 데이터랩 방문자수는 집계 지연이 있어 최근 7일이 비어 있을 가능성이 크다(8/24 수집엔 값이 있었음).

### 2.2 사용자에게 보이는 메뉴

- 1.0 앱(`prototype/`) 상단 메뉴 활동 → **여행 / Travel — "관광 밀도 · 명소"** (`prototype/index.html:541-545`). 레이어 두 개뿐: `tourism`(서울 121곳 실시간 인구 3D 밀도, 서울시 API)과 `poi`(OSM Overpass 박물관·천문대·아쿠아리움 등).
- 여행 시트 `prototype/js/ui-tourism.js`: 서울 장소 카드 + 대안 장소 + **"KTO DATASETS" 카드는 9개 서비스의 수집 상태·건수만 표시**하고 실제 관광 콘텐츠(무장애 시설, 웰니스 장소, 연관 관광지 등)는 하나도 그리지 않는다. 접근성 카드는 "콘텐츠 ID로 연결되기 전엔 판정하지 않는다"고 명시.
- v2-three 지구(`prototype/v2-three/js/ui-shell.js:96`): 여행·관광 POI 레이어는 `LOCKED`. KTO 연결 없음. 다만 `prototype/v2-three/data/kr-places.json`에 **시군구 228개 중심점**이 있어 지역 지수 시각화의 뼈대는 있다.
- 발견 엔진은 코드가 다 있으나 어떤 메뉴에서도 못 연다: `earthus2/v06/tourism/discovery.js`(7개 신호 가중합, 하드게이트), `v11/tourism/why-now.js`(한국어 이유 문구), `best-window.js`, `related-place-graph.js`, `v09/provider/kto-discovery-adapter.js`. 모두 SHADOW 게이트(`advanced-intelligence-capabilities.v1.json` TRAVEL_DISCOVERY: "KTO feature materialization 필요").
- 분석 이벤트 계약 `prototype/js/analytics-contract.js`에 `tourism.place_viewed / forecast_selected / watch_changed`가 이미 있다. 성과 집계에 바로 쓸 수 있다.
- 융복합 재료는 이미 라이브: KMA 실황·예보·특보, AirKorea 673측정소, 산불(산림청), 해안(KHOA), 지진·태풍(GDACS/USGS), 서울 실시간 인구. 이것이 다른 출품자에겐 없는 EARTHUS의 차별점이다.

한 줄 요약: **인프라와 계약은 9/10 완성, 사용자에게 닿는 관광 기능은 0.** 지금 상태로 출품하면 "데이터랩 활용도"에서 점수를 못 받는다.

---

## 3. 데이터랩 대회 출품물 제작 방향 — EARTHUS TRAVEL DISCOVERY

### 3.1 포지셔닝

제목 초안: **"관광 수요·집중률 × 실시간 기상·대기·재난을 한 지구 위에서 — 오늘 갈 곳을 데이터로 고르는 EARTHUS 여행 발견"**

- 성과분야 체크: **앱·웹 등 서비스 개발**. 보조 서사로 "공공 안전·지속가능 관광"(공고 예시 4번)을 깐다.
- 심사 문장에 맞춘 세 축:
  1. 데이터랩 활용도 30 — 승인 9개 KTO 데이터셋 **전부**를 화면에 근거로 노출하고, 각 카드에 출처·수집시각·데이터 종류(예측/통계/공식정보)를 표기한다(이미 `sourceType`/`semanticType`으로 분리돼 있음).
  2. 효과성·성과 30 — 9/16 공개 배포 후 2주 이용 지표를 계량성과로 쓴다.
  3. 파급력 20 — 시군구 228개 전국 자동 커버, 지자체가 자기 지역 화면을 그대로 쓸 수 있음, 영문 데이터로 외국인 FIT 동시 지원.
- 금기: KTO 지수를 "공식 추천"으로 쓰지 않는다(VS-06: 라벨은 EARTHUS DISCOVERY). 이동통신 방문자수 ≠ 관광객, 집중률은 상대 지수라는 `DATA_SOURCE_EXPANSION_REGISTER.md` 주의를 화면 문구에 그대로 반영한다. 심사위원은 데이터랩 담당자다.

### 3.2 화면 (1.0 앱 여행 메뉴 확장, 새 렌더러 없이)

여행 시트에 탭 4개를 붙인다. 흐름은 VS-06 그대로: DISCOVER → WHY NOW → BEST WINDOW → ONE MORE PLACE → SEE ON EARTH.

1. **오늘 발견(DISCOVER)** — 시군구 단위 후보 랭킹. 입력: 수요 강도(체류·소비), 다양성 지수, 최근 방문자 추이(visitors), 집중률 예측(붐빔 회피), KMA 예보 적합도, AirKorea 등급, 재난 특보(하드게이트). 카드마다 `why-now.js` 문구 + 근거 데이터셋 배지.
2. **장소 상세** — 중심 관광지(localHub) → 연관 관광지(related) 그래프, 30일 집중률 예측 미니차트, 무장애 항목(주차·화장실·경사로 등 `detailWithTour2`), 웰니스 태그, 영문 소개(외국인 모드).
3. **목적별 발견** — 필터: 무장애 / 웰니스 / 스포츠·레저(**전국체육시설 신규 연동**) / 외국인(영문 데이터) / 붐비지 않는 곳.
4. **지구에서 보기(SEE ON EARTH)** — 시군구 중심점(kr-places.json)에 지수 비콘. 기존 tower/point 렌더러 재사용, 관광 레이어 켜질 때만 Esri 다크 지도(`tourism-map-style.js`) 유지.

### 3.3 데이터 작업 (서버, 1주)

| 순서 | 작업 | 파일 | 비고 |
|---|---|---|---|
| 1 | visitors 요청 창을 "D-30 ~ D-3"로 넓히고 빈 결과면 마지막 유효 스냅샷 유지 | `aws/tourism-flow/kto_collector.py:342-372` | 집계 지연 대응. 8/24엔 값이 있었음 |
| 2 | related / localHub / concentration을 `areaCd`+`signguCd` 루프로 수집 | `kto_collector.py` 새 task `KTO_REGION_SWEEP` | 시군구 228 × 3 서비스 ≈ 684콜/일. 개발계정 일 1,000건 한도 안이지만 여유가 없으니 2일 분할 또는 운영계정 전환 신청 |
| 3 | diversity / demandStrength를 `areaCd`(17 시도) + `baseYm` 월 1회 수집, 스케줄 등록 | `configure-tourism-flow-operations.sh` | 서면심사 근거로 "전 지역 지수" 확보 |
| 4 | 시군구 코드 ↔ `kr-places.json` ↔ `korea-admin-reference.js` 매핑표 | `prototype/data/tourism/` | KTO `areaCd/signguCd`는 법정동 코드 체계라 변환표 필요 |
| 5 | 전국체육시설(국민체육진흥공단) 수집기 신규 — KTO 수집기 패턴 복제, 계약 캡처 | `aws/tourism-flow/` 또는 별도 Lambda, `tools/capture_kto_contracts.py` 재사용 | 승인은 받았으나 엔드포인트·필수 파라미터 미확인 |
| 6 | 발견 피처 materialize: 시군구별 7개 신호를 `/tourism/discovery/features.json`으로 산출 | v11 `discovery-feature-builder.js` 서버 실행 또는 Lambda | SHADOW → ACTIVE 게이트는 "실데이터 + 안전 게이트 + 파일럿" 조건. 이 대회가 파일럿이다 |

### 3.4 4주 일정

| 주 | 기간 | 산출물 |
|---|---|---|
| 1 | 9/2~9/8 | 5개 서비스 실데이터 확보, 체육시설 계약 캡처, 피처 파일 생성 |
| 2 | 9/9~9/15 | 여행 시트 4탭, 지구 비콘, 분석 이벤트(`tourism.discovery_viewed`, `discovery_to_detail`) 추가, 모바일 확인 |
| 3 | 9/16~9/22 | **공개 배포(earthus.net)**, 홍보 시작, 이용 지표 수집. 9/21 GovTech 제출 병행 |
| 4 | 9/23~9/30 | 지표 집계, 서식4 작성(2~3장), 스크린샷·데이터셋 목록·분석 로그 zip, **9/30 오전 제출** |

### 3.5 계량성과 후보 (서식4 "계량성과"란)

- 연동 데이터셋 10종(데이터랩 9 + 체육시설 1), 전국 시군구 228 커버리지, 무장애 11,644 / 영문 25,398 / 웰니스 202 콘텐츠 노출.
- 배포 2주간 이용자 수, 발견 카드 조회수, 발견→상세 전환율, 목적별 필터 사용 비율, 외국인(영문) 세션 비율, 재난·대기 하드게이트로 제외된 후보 수(안전 서사).
- 정직하게: 4주짜리 성과는 "서비스 출시 + 초기 이용"이다. 방문객 증가 같은 지자체형 성과는 주장하지 않는다. 대신 "기대효과"란에 지자체 위젯 배포·영문 FIT 확산을 쓴다.

---

## 4. 2026 GovTech 창업경진대회 — EARTHUS PLANET INTELLIGENCE

### 4.1 확인된 사실

- 주최 과학기술정보통신부(2025년 주관 정보통신산업진흥원). 3회째. 사무국 02-726-1096, k-govtech@wips.co.kr, 카카오 @2026govtech. 접수 사이트 k-govtech.kr.
- 접수 **2026.8.20~9.21**. 트랙: 아이디어 기획(사업자 없는 예비창업자) / **제품·서비스 개발(예비창업자 + 초기창업기업)**. 세부분야: 대국민 공공서비스 / 지역·사회문제 해결 / 공공인프라 혁신, 자유주제.
- 심사: 1차 서면(9월) 42팀 내외(트랙당 21) → 1차 합격자 멘토링 → 2차 발표(11월) 최종 14팀 → 시상 12월. 총 7천만원 + 차년도 'GovTech 창업기업 AI 실증·사업화 지원사업' 우대(2026년 그 사업은 3/24~4/23 모집이었음).
- **미확인**: 초기창업기업 업력 기준, 배점표, 사업계획서 양식·분량. k-govtech.kr의 모집요강 페이지(`/common/intro/00`, `/01`)는 비로그인 상태에서 본문이 비어 있고 공지·FAQ도 "게시물 없음"이다. 회원가입 후 확인하거나 사무국에 전화해야 한다.

### 4.2 제작 방향

- 트랙: 제품·서비스 개발. 세부분야: **지역·사회문제 해결** (재난·대기·해양·관광 데이터가 지역 단위로 이미 라이브) 또는 대국민 공공서비스.
- 핵심 메시지: "기관별로 흩어진 공공데이터(기상청·환경공단·산림청·해수부·관광공사·서울시)를 시민이 찾아다니지 않고, 하나의 살아있는 지구에서 현재→원인→다음 상황→행동으로 연결". `COMPETITION_SERVICE_INTEGRATION.md`의 시연 A/B/C 그대로.
- 재료: `EARTHUS_모두의창업_사업계획서_v1.0.pptx`와 `docs/proposals/nia_form.py`(NIA 사업계획서 생성기)가 있으니 GovTech 양식만 확인하면 2~3일 안에 변환 가능. 단 NIA 제안서의 공공데이터 표에 관광공사가 빠져 있으니 이번에 추가한다.
- 데이터랩 대회와의 분리: GovTech는 "플랫폼·다기관 통합"이 주어, 데이터랩은 "관광 발견 서비스와 그 성과"가 주어. 제목·성과·스크린샷을 겹치지 않게 만든다.

---

## 5. Earthshot Prize 2027 — EARTHUS POLLUTION LENS

### 5.1 확인된 사실

- 자가 지원 창구가 없다. 363개 Official Nominator가 후보를 추천하고, 후보는 Earthshot 포털에서 신청서를 작성한다. 노미네이터마다 자체 접수(예: PCAI는 Google Form, 마감 **2026-11-17**).
- 요건: "아이디어 단계를 넘어 현장 또는 대상 집단에서 검증됐고, 5년 안에 확산 임계점에 있는 솔루션", "입증된 프로토타입과 성공의 징후".
- 절차: Expert Advisory Panel → Top 150 → 15 Finalists → Prize Council이 5 Winners(각 £1M). 15 파이널리스트 전원 1년 Fellowship.
- Clean Our Air 목표 문장: 2030년까지 모두가 WHO 기준 이상의 깨끗한 공기를 마시게 한다. 찾는 솔루션은 오염 제거·청정 에너지·녹색 교통 등 **실제 배출·오염을 줄이는 것**이 중심이다.
- 한국 관련: 노미네이터 목록(earthshotprize.org/people-partners/nominators)에서 region 필터 "Eastern Asia"와 "Open Calls 수락 노미네이터만 보기" 체크박스로 공개 제안을 받는 곳을 찾을 수 있다. 한국 스타트업 Simple Planet이 노미네이션된 전례가 있다.

### 5.2 현실 판단

- POLLUTION LENS는 "환경 정보를 이해하게 하는 시민 인텔리전스"라 Earthshot이 우선하는 "오염을 물리적으로 줄인 증거"와 결이 다르고, 현장 검증(파일럿)이 아직 없다. **2027 사이클은 노미네이터 확보 자체가 어렵다.**
- 권고: 올해는 (1) Classroom Earth 파일럿(전후 이해도·행동의향 측정, `COMPETITION_SERVICE_INTEGRATION.md`에 이미 계획됨) (2) NGO·시민과학 활동 연결(EARTH PULSE ACTIONS 탭) 실사용 (3) 한국 대기질·산불 연막 사례로 "행동 전환" 지표를 만든 뒤, 2027년 노미네이션(2028 Prize)을 노린다. 11/17 전까지 Open Call 노미네이터 1~2곳에 소개 메일을 보내 관계를 시작하는 정도가 올해 현실적인 행동이다.

---

## 6. 즉시 결정이 필요한 것

1. 데이터랩 대회 참가 구분(개인 / 팀 최대 4인 / 기관). 팀이면 공동 참가자 서명 전원 필요.
2. 데이터랩 대회 "타 공모전 유사 구상 제외" 조항 때문에 GovTech 제출물의 제목·구상을 먼저 확정하고 데이터랩 출품물을 그 아래 하위 서비스로 잡을지, 완전히 다른 서사로 갈지.
3. data.go.kr 개발계정(일 1,000건) 그대로 갈지, 운영계정 전환(트래픽 증가)을 지금 신청할지. 시군구 스윕이 매일 돌면 한도에 닿는다.
4. GovTech 업력 요건 확인(사무국 전화). 해당 안 되면 아이디어 기획 트랙으로 내릴지.
5. 10/23(금) 서울 오프라인 발표 참석 가능 여부(대표자 직접 발표, 불참 시 취소).

## 7. 출처

- 공고: https://datalab.visitkorea.or.kr/site/portal/ex/bbs/View.do?cbIdx=1135&bcIdx=311064&pageIndex=1 (첨부1 공모요강 PDF 12쪽)
- 기사: 헤럴드경제 2026-08-03 https://biz.heraldcorp.com/article/10830594 , 한국일보 2026-08-04 https://www.hankookilbo.com/news/article/A2026080417090005750
- 2025 수상작: 국제뉴스 https://www.gukjenews.com/news/articleView.html?idxno=3382664 , 한국NGO신문 https://www.ngonews.kr/news/articleView.html?idxno=217006
- GovTech: 뉴스서울 https://newsseoul.co.kr/news/view/1065586810061235 , k-govtech.kr , 2025 공고 https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId=PBLN_000000000112147 , NIPA 2026 실증사업 https://www.nipa.kr/home/2-2/16596
- Earthshot: https://earthshotprize.org/the-prize/how-the-earthshot-prize-works/ , https://earthshotprize.org/people-partners/nominators/ , https://earthshotprize.org/the-prize/air/ , PCAI 2027 접수 https://www.pcai.gr/earthshot-2027-prize-pcai-accepts-entries
- 라이브 상태: https://earthus.net/tourism/kto/summary.json , https://earthus.net/tourism/health.json (2026-09-01)
- 내부: `docs/earthus-v2/AUDIT/EARTHUS_1.0_CURRENT_SYSTEM_AUDIT.md` KTO 장, `docs/earthus-v2-implementation/VS-06_TRAVEL_DISCOVERY.md`, `docs/earthus-2.0/v06/DATA_SOURCE_EXPANSION_REGISTER.md`
