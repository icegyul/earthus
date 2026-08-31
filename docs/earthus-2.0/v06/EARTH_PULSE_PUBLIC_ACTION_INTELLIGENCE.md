# EARTHUS 2.0 — EARTH PULSE + PUBLIC ACTION INTELLIGENCE

## 1. 목적
EARTH PULSE는 뉴스 목록을 하나 더 만드는 기능이 아니다. 현재 지구에서 발생하는 `EVENT`, 이를 설명하는 `NEWS`, 공식 관측/발표인 `DATA`, 시민사회·NGO의 `ACTION`, 그리고 EARTHUS 분석을 동일한 장소·시간·사건 ID로 연결하는 상위 Orchestrator다.

## 2. 사용자 메뉴
기존 상위 메뉴는 유지한다.

`EARTH / WEATHER / OCEAN / HAZARD / HUMAN / SPACE / PULSE`

PULSE 내부 탭:
- NOW: 지금 중요한 Earth Event
- NEWS: 환경·관광·재난·과학·정책 뉴스
- ACTIONS: NGO·시민과학·정화·복원·교육·조사·캠페인
- EVENTS: 사건 기준 통합 보기

## 3. Earth Event detail
한 Event 안에서 다음을 분리한다.
- OBSERVATION: 센서·위성·공식 관측
- OFFICIAL: 정부/기관 경보·공식 발표
- NEWS: 언론 보도
- ACTION: NGO/시민사회 공개 활동
- EARTHUS: 분석·모델·시뮬레이션

절대 규칙: NEWS나 ACTION 텍스트가 OBSERVATION으로 승격되지 않는다.

## 4. NGO/Public Action 수집
소스 우선순위:
1. 공식 API
2. 공식 RSS/Atom
3. 공식 Campaign/Event/Action 페이지
4. 공식 행사 플랫폼(Mobilize 등 공개 API가 있는 경우)
5. 공식 SNS
6. 뉴스 보도(보조 확인)

원문 전체를 재배포하지 않는다. 활동명, 조직, 카테고리, 날짜, 공개 위치 수준, 짧은 요약, 원문 링크, 출처·검증시각만 정규화한다.

## 5. 위치 공개 정책
- EXACT_PUBLIC: 주최 측이 주소/좌표를 명시적으로 공개
- CITY: 도시까지만 공개
- REGION: 지역까지만 공개
- COUNTRY: 국가까지만 공개
- MAP_DISABLED: 공개 위치 근거 없음

비공개 직접행동 장소를 기사/SNS 조각으로 추정하여 지도에 찍지 않는다.

## 6. 시각화
전지구에서는 최대 12개(Desktop), 7개(Mobile) 정도의 중요 Beacon만 기본 노출한다. 공식 안전 이벤트는 항상 우선한다. 나머지는 Panel list에서 탐색한다.

## 7. 재사용
새 Renderer를 만들지 않는다.
- 사건: VIS-007 DATA PULSE
- 위치/활동: VIS-009 DATA BEACON
- 이동: VIS-004 DATA FLOW 또는 VIS-008 DATA TRACK (실제 Vector/Trajectory proof 필요)
- 사건 결합: HAZ-011 Cross-Agency Event Fusion
- 이야기 재생: INT-008 Event Story Orchestrator
- Truth: FND-003
- Spatial identity: DAT-009
