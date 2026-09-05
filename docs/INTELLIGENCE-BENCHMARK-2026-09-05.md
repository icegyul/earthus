# EARTHUS v2 인텔리전스 — 목적 부합 점검과 벤치마크

2026-09-05 · 운영 `earthus.net/v2` 직접 조작 + 소스(`prototype/v2-three/js`) + 설계 문서 대조

## 0. 한 줄 판정

**원칙은 지켜지고 있고, 본체는 아직 없다.** 개념도가 금지한 것(LLM이 원인·수치를 지어내기, 관측과 모델을 섞기, 상관을 원인으로 승격하기)은 코드가 실제로 막고 있다. 그러나 개념도가 "Intelligence"라고 정의한 본체 — **Event Revision·Confidence/Uncertainty·중요도 이유·Counterfactual/Attribution** — 는 화면에도 데이터에도 아직 없다. 지금의 인텔리전스 패널은 "정직한 사건 목록 + 켜진 자료의 출처 표"이지, "무엇이 중요하고 왜 변했고 다른 조건이면 어떻게 달라지는가"를 답하는 시스템은 아니다.

개념도 13절 완료 판정 기준 10개 중 **충족 3 · 부분 3 · 미충족 4**. 이 문서는 그 근거를 하나씩 적는다.

## 1. 원천 아이디어 — 무엇이 인텔리전스로 발전했나

정본은 `Earthus v2_DOC/인텔리전스 개념도 INTELLIGENCE_CONCEPT_MASTER_v1.0_KO.docx`(2026-08-30)와 `docs/greenfield/canonical/…MASTER_v5.3_KO.md` §4·§17B·§17C·§28~§31이다.

| 원천 | 가져온 아이디어 | 개념도 표현 |
|---|---|---|
| KAIST 메타어스 연구센터 [M1] | 지구를 "보는 대상"에서 **계산 가능한 Digital State**로. 모델·위성·현장·문헌 멀티모달 + 물리-AI 하이브리드 | 2.1 / 2.6 |
| 김형준 교수 인터뷰 [M2] | **복수의 가상 지구**를 만들어 조건 하나씩 바꿔 비교(Counterfactual), 차이를 원인 기여로 해석(Attribution), 예언이 아니라 선택지 비교(Decision) | 2.2~2.5 |
| KIPRIS 선행기술 [P1~P4] | 데이터 자체의 품질지수, 예측-관측 잔차 이력이 자산, 미래 예측은 단일 숫자보다 불확실성·단계별 검증, 경보→영향 변환은 흔한 기술이므로 차별점은 **근거·시간·신뢰도·Revision** | 3장 |
| v5.3 지시서 | Feed(§28)·Event Room 9탭(§29)·인과 등급(§30)·Postmortem(§31.3)·LLM 3D 계약(§17C) | — |

**찾지 못한 것:** 요청에 언급된 "인도네시아 기업 논문 60종"은 저장소(`docs/`, `reference/`)와 `Earthus v2_DOC` 전체(docx 7종 본문 포함)에서 파일명·본문 어느 쪽으로도 나오지 않는다. 개념도 부록이 인용한 원천은 위 [M1][M2][P0~P4] 6건뿐이다. 그 60종이 별도 폴더(NAS·메일)에 있다면 알려 주면 대조를 추가한다. 이 보고서는 **문서에 남아 있는 원천**만 기준으로 삼는다.

## 2. 현재 구현 지도 — 메뉴 → 코드 → 자료

운영 v2 우측 패널 `EARTH INTELLIGENCE` (2026-09-05 12:40 KST 실측). 운영 빌드의 탭 이름은 `FEED / MY / NOW / WHY / NEXT / WHAT IF` — 어제 만든 정보 접근성 개편(사건·내 장소·선택 자료·자료의 근거·예보·예정·가정 실험)은 **v2 운영에 아직 배포되지 않았다**(v1만 배포됨).

| 탭 | 코드 | 실제로 하는 일 (실측) | 개념도·§29 기준 역할 |
|---|---|---|---|
| FEED | `intel-feed.js` | GDACS 열대저기압 7 + USGS M4.5+ 지진 13 = **20건**. 제목·장소·경과시간·진리등급 배지. 클릭 → 사건 방 | Earth Event 재방문 표면 (§28) |
| 사건 방 | `event-room.js` | 기관 스택(GDACS·KMA/JMA/NHC·ECMWF·해양관측·연안침수) 5줄, 줄마다 "지구에 켜기", 현재→다음→행동, EVIDENCE, PAST(USGS 30일 / 공식 발표 타임라인), WHY(게이트 문구) | NOW·EVIDENCE·PAST 일부 |
| MY | `main.js getMyHtml` | GPS/수동 위치 → 내 하늘 구름·특보·대기질·바람 관측 | FOR ME (private projection) |
| NOW | `main.js getNowHtml` | 태양·지형·구름 상태, **데이터 소스 11/11 정상**, 엔진·fps | NOW (장면 상태) |
| WHY | `ui-shell.js whyHtml` | 인과 주장 게이트 문구 + 켜진 자료의 출처·진리등급 3건 + "근거 그래프는 아직" | WHY (evidence graph / cause class) |
| NEXT | `ui-shell.js nextHtml` | 켜진 자료 중 예보·특보만 골라 나열 (실측 0건) + 5일 재생 버튼 | NEXT (official/model/analysis 구분) |
| WHAT IF | `main.js getScenario` | 대한해협 고정점 태풍 해상 물리 시뮬레이션 데모(SIMULATION_ONLY) | WHAT IF (isolated counterfactual) |
| 지구에 묻기 | `ask-earth.js` + Lambda `earthus-llm` | 켜진 레이어 스냅샷만 근거로 Gemini가 답, 승인 도구 4종(showLayer/hideLayer/flyTo/openCard)만 실행, 버린 제안 표시, 되돌리기 | §17C LLM→3D 계약 |
| (LAB) 분석 보고서 | `lab-reports.html` + `cyclone-analog`·`lab-events` | 태풍·지진·오로라 등 9종 사건의 회차 보존 → 종료 뒤 오차 채점 (오늘 구축) | §31.3 Postmortem · Revision 일부 |

## 3. 목적 부합 점검 — 개념도 13절 완료 판정 기준

| # | 기준 | 현재 | 판정 |
|---|---|---|---|
| 1 | 모든 결과에 provenance(출처·시각) | 레이어·사건·사건 방 줄마다 출처·시각·진리등급 배지. 소스 상태 11/11 표시 | **충족** |
| 2 | OBSERVED/DERIVED/MODEL/AI/OFFICIAL/SIMULATION/COUNTERFACTUAL/ATTRIBUTION 혼동 없음 | 배지 어휘 정본(`EVIDENCE_KIND`) 사용. 단, 어제 확인된 오표기 2건(Open-Meteo Marine을 OBSERVED, 침수 예상도를 OFFICIAL_OBSERVATION) 미수정 | **부분** |
| 3 | Event가 시간에 따라 Revision되고 변경 원인 추적 | 사건은 매 로드마다 GDACS/USGS를 새로 받을 뿐 **revision 개념 없음**. "무엇이 바뀌었나"가 화면에 없음. 태풍은 LAB 세션에 회차가 쌓이지만 Feed와 연결 안 됨 | **미충족** |
| 4 | Confidence와 Uncertainty가 UI/3D에서 숨겨지지 않음 | 두 값 모두 **존재하지 않음**. 진리등급이 confidence 대용, ECMWF 앙상블 폭이 uncertainty 대용이지만 사건 카드엔 없음 | **미충족** |
| 5 | (Aetherus) screening과 정밀 위험 구분 | 범위 밖 — 별도 점검 | — |
| 6 | LLM 없이 핵심 파이프라인 동작 | Feed·사건 방·NOW/WHY/NEXT 전부 LLM 없이 동작. LLM은 설명 계층에만 | **충족** |
| 7 | AI/GPU 장애가 Engine·provenance를 무너뜨리지 않음 | LLM Lambda 실패 시 "값을 만들지 않고 비워 둔다"로 처리 | **충족** |
| 8 | Counterfactual이 baseline과 재현 가능하게 비교 | WHAT IF는 **고정점 데모**. baseline(실제 태풍 트랙)이 없고 비교·Attribution 없음 | **미충족** |
| 9 | 특허 경계 DO NOT IMPLEMENT 위반 없음 | 3D 표시·TLE/SGP4·단순 변화탐지만 있고 "새 TLE 생성·Pc 계산" 없음 | **충족** |
| 10 | 사용자가 "무엇이/왜 중요/얼마나 확실/무엇이 바뀜/다른 조건이면" 이해 | 무엇이(○) · 왜 중요(×: importanceReason 없음) · 얼마나 확실(×) · 무엇이 바뀜(×) · 다른 조건(△ 데모) | **부분** |

## 4. v5.3 계약 대비 갭

### 4.1 Feed 카드 최소 구조 (§28.2) — 12개 중 5개

| 필드 | 있음 | 비고 |
|---|---|---|
| EVENT TITLE / WHERE / WHEN / STATUS | ○ | STATUS는 항상 `ACTIVE` 고정 — WATCH/RESOLVED 없음 |
| WHAT CHANGED | × | revision이 없으니 계산 불가 |
| WHY IT MATTERS | × | `why` 필드는 "태풍 진로·강도 분석"이라는 고정 문구 |
| TRUTH CLASS | ○ | |
| CONFIDENCE / UNCERTAINTY | × | |
| PRIMARY SOURCE | ○ | |
| LAST REVISION | × | 경과시간만 |
| OPEN EVENT ROOM | ○ | |
| FOLLOW | × | Watch/Follow 없음 → 재방문 루프(§4 DETECT→FOLLOW→REVISION)가 끊김 |

`importanceReason[]`(왜 노출되는지) 없음. 사건 선정도 §28.3의 파이프라인(후보→식별·중복제거→근거 가용성→영향 게이트)이 아니라 "GDACS 전부 + USGS 상위 14건".

### 4.2 Event Room 9탭 (§29.1)

| 탭 | 상태 |
|---|---|
| NOW | ○ 사건 방 상단 + 기관 스택 |
| WHY | △ 게이트 문구만. cause class(§30.1) 8단계 어휘가 코드에 없음 |
| NEXT | △ 켜진 예보 레이어 나열. 사건별 "공식 예보 스텝"은 사건 방 '다음' 칸에 있으나 official/model/analysis 구분 없음 |
| PAST | △ USGS 30일·공식 발표 타임라인. Earth Diff 없음 |
| COMPARE | × — **자료는 이미 있다**(cyclone 세션의 회차별 KMA·JMA·ECMWF·EARTHUS 트랙). 화면만 없음 |
| WHAT IF | △ 고정점 데모 |
| FOR ME | △ MY EARTH(관측 3종). 여행·일정 투영 없음 |
| EVIDENCE | △ 1차 출처·갱신·좌표 출처 한 줄. 해상도·권리·품질 없음 |
| REPORT | △ LAB 분석 보고서(오늘 구축)가 사건 종료 뒤 검증을 담당. 사건 방에서 링크 없음 |

## 5. 실측 벤치마크 — 운영에서 본 것

| 항목 | 실측 (2026-09-05 12:40 KST) | 평가 |
|---|---|---|
| 사건 수 | 20 (TC 7 · EQ 13) | 개념도 "Don't show every object, show what matters"와 반대 — 중요도 정렬이 경보색·규모뿐 |
| SAUDEL-26 | GDACS `ACTIVE` · "3일 전" · 기상청·JMA 발표에서 "찾지 못함" (이미 소멸) | GDACS 지연을 그대로 노출. 상태를 `RESOLVED/WATCH`로 내리는 판정 부재 |
| 사건 방 기관 스택 | 2곳·5줄, 한반도 밖 사건이라 특보 범위 아님을 명시 | 정직함은 좋으나 "없다"가 5줄 중 3줄 — 사용자 관점의 정보량 낮음 |
| WHY | "근거 부족·EXPLORER PRO 제공 예정" | 유료 벽이 아니라 미완성으로 읽힘 (어제 보고서 F11과 동일 지적) |
| NEXT | 0건 | 기본 상태에서 비어 있음 — 사건을 열면 그 사건의 공식 예보가 NEXT에 자동으로 실려야 함 |
| 지구에 묻기 | "한반도 근처 태풍 있어?" → "지금 화면의 자료로는 알 수 없습니다. 태풍 레이어가 있어야…" · 근거로 쓴 레이어 1 · gemini-3.5-flash-lite · 응답 ~8초 | §17C 준수(지어내지 않음)는 정확. 그러나 **승인 도구 `showLayer`로 태풍 레이어를 켜자고 제안할 수 있었는데 거절만 했다** — 계약이 허용한 "Scene Tool 제안"을 안 쓴다 |
| 데이터 소스 상태 | 11/11 정상, 갱신 2분~11시간 전 | provenance 파이프라인은 실제로 살아 있음 |
| LAB 검증 | 태풍 종료 보고서 6건 오차표(ETAU: JMA 35 km · KMA 65 km · EARTHUS 152 km), 활동 중 잠정 채점 | 개념도 11장 "예측 당시 무엇을 알았고 실제로 어떻게 됐나"를 유일하게 구현한 곳 |

## 6. 외부 벤치마크 — 같은 질문을 남들은 어떻게 답하나

비교 축은 개념도가 정한 다섯 질문이다. ○ 있음 · △ 부분 · × 없음. (공개 화면 기준의 일반적 평가이며 각 제품의 유료 기능 전수 조사는 아니다.)

| 제품 | 무엇이 일어났나 | 왜 중요한가 | 얼마나 확실한가 | 무엇이 바뀌었나 | 다른 조건이면 | 비고 |
|---|---|---|---|---|---|---|
| **GDACS** (JRC/UN) | ○ 사건·경보색 | ○ 인구 노출·영향 점수 | △ 경보 등급 | ○ 에피소드 이력 | × | 영향 점수와 노출 인구를 카드에 적는다 — EARTHUS Feed에 없는 것 |
| **Windy** | ○ 모델 필드 | × | ○ 모델 비교(ECMWF/GFS/ICON) | △ 시간 재생 | × | "모델을 나란히"가 신뢰도 UI의 사실상 표준 |
| **Zoom Earth** | ○ 위성·태풍 | △ | △ 기관별 트랙 | ○ 시간 재생 | × | 소비자용 사건 뷰어의 완성도 기준 |
| **NASA Worldview/FIRMS** | ○ 관측 | × | ○ 해상도·시각 명시 | ○ 날짜 비교 | × | EVIDENCE(해상도·권리)의 표준 |
| **Google Earth Engine** | ○ | × | ○ | ○ | △ 사용자가 직접 계산 | 소비자 제품 아님 |
| **EARTHUS v2 (현재)** | ○ | × | × | × | △ 데모 | 진리등급·인과 게이트·LLM 경계·**사후 검증(LAB)** 은 위 제품 어디에도 없는 차별점 |

읽는 법: 남들이 다 하는 것(사건 표시·시간 재생·모델 비교)에서 EARTHUS는 아직 뒤에 있고, 남들이 안 하는 것(진리등급·검증·Counterfactual)에서 앞설 수 있는데 그 앞서는 부분이 **아직 화면에 없다.** 개념도 3장의 결론 — "3D 표시·변화탐지는 흔한 기술, 우리 핵심은 근거·시간·신뢰도·Revision·Counterfactual" — 을 현재 제품이 뒤집어 놓은 셈이다.

## 7. 권고 — 자료가 이미 있는 것부터

| 순위 | 할 일 | 왜 지금 | 근거 자료 |
|---|---|---|---|
| **P0** | **Event Revision**: 사건 id를 고정하고 회차마다 `changes[]`(위치·강도·등급 변화) 저장, Feed 카드에 WHAT CHANGED·LAST REVISION | 개념도 기준 3·10, §28.2. 재방문 이유의 본체 | `archive/cyclone-sessions.json`·`lab-events-sessions.json`에 회차가 이미 쌓임 — Feed가 안 읽을 뿐 |
| **P0** | **importanceReason + 상태 판정**: 경보색·노출 인구(GDACS 제공)·변화율·자료 깊이로 정렬하고, 갱신 3일 넘은 GDACS 사건은 `WATCH/RESOLVED` | "Show what matters". SAUDEL-26 같은 유령 사건 제거 | GDACS API의 population/severity 필드 |
| **P0** | **Confidence / Uncertainty 필드**: 사건 카드에 `confidence`(출처 수·신선도·기관 일치)와 `uncertainty`(ECMWF 앙상블 폭·기관 간 트랙 편차 km) | 개념도 기준 4. 지금은 어느 화면에도 없음 | `typhoon-ecmwf.json` 스프레드, 세션의 기관 트랙 편차 |
| **P1** | **COMPARE 탭**: 같은 태풍의 회차 A/B 트랙과 기관별 트랙을 지구 위에 겹치기 | §29 탭 중 자료가 다 있는데 화면만 없는 유일한 탭 | cyclone 세션 |
| **P1** | **WHY를 cause class로**: 공식 발표문(특보 원문·PTWC·USGS 요약)에서 `CONSISTENT_WITH / CONTRIBUTING_FACTOR / UNKNOWN` 등급으로 "근거가 지지하는 요인"만 적기 | §30. "근거 부족" 한 줄보다 낫고 규율을 안 깬다 | 사건 방이 이미 모으는 기관 스택 |
| **P1** | **지구에 묻기 → 도구 제안**: "알 수 없다"로 끝내지 말고 `showLayer('tyoff')` 제안을 답에 실어 한 번에 켜게 | §17C.1 3항이 허용한 역할을 안 쓰고 있음 | `ask-earth.js`·Lambda 프롬프트 |
| **P1** | **NEXT 자동 채움**: 사건을 열면 그 사건의 공식 예보 스텝을 NEXT에 official/model 구분으로 | 기본 상태 0건 해소 | 사건 방 '다음' 칸 |
| **P2** | **WHAT IF를 실제 baseline에**: 선택한 태풍의 공식 트랙을 baseline으로, 강도·경로 오프셋 시나리오 → 파고·연안 노출 비교(SIMULATION_ONLY, baselineEventId 보존) | 메타어스 핵심(2.2~2.4)의 첫 구현 | 기존 해상 시뮬레이터 + 공식 트랙 |
| **P2** | **LAB 보고서를 사건 방 REPORT 탭으로** 연결 | 검증이 제품의 차별점인데 별도 페이지에 숨어 있음 | 오늘 구축한 `lab-reports.html` |
| **P2** | 어제 개편(정보 접근성 v2 빌드) 운영 배포 · 배지 오표기 2건 수정 | 기준 2 부분 충족 → 충족 | `tools/build_information_release.mjs` |

## 8. 결론

인텔리전스 패널은 **"틀린 말을 하지 않는다"는 첫 관문을 통과했다.** 진리등급, 인과 게이트, LLM이 지어내지 않기, 소스 상태 공개, 사후 검증 — 이것은 벤치마크한 어떤 제품에도 없다. 그러나 메타어스에서 가져온 본체(계산 가능한 상태 → 사건의 변화 이력 → 신뢰도·불확실성 → 가상 지구 비교)는 **데이터 층에는 일부 쌓이기 시작했지만 제품에는 아직 없다.** 다음 단계는 새 엔진이 아니라, 이미 쌓이는 회차 자료를 Feed와 사건 방에 연결해 "무엇이 바뀌었고 얼마나 확실한가"를 카드에 적는 일이다.

---
부록 A. 실측 원문: 운영 v2 탭별 텍스트·사건 방(SAUDEL-26)·지구에 묻기 응답은 이 세션 기록에 있으며 요약은 5절과 같다.
부록 B. 코드 근거: `intel-feed.js`(사건 수집·정렬·PAST), `event-room.js`(기관 스택·HAZ-011 결합), `ask-earth.js`·`aws/earthus-llm/handler.py`(§17C 강제), `ui-shell.js`(WHY/NEXT), `main.js`(MY/NOW/WHAT IF), `aws/cyclone-analog`·`aws/lab-events`(회차·검증).
