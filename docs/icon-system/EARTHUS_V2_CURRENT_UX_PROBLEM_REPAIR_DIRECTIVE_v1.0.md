# EARTHUS V2 — CURRENT UX PROBLEM & REPAIR DIRECTIVE v1.0

기준: 2026-09-12
대상: earthus.net/v2
적용: V2 우선, V1 공통 원칙으로 일부 환류
실행자: Claude Code

## 0. 목적

현재 EARTHUS V2의 기능을 삭제하는 것이 목적이 아니다.
현재 구현된 기능과 엔진을 보존하면서, 사용자가 느끼는 "답답함", "메뉴가 너무 많음", "모바일에서 메뉴가 가림", "왼쪽 메뉴가 V1보다 직관적이지 않음", "창이 너무 많음" 문제를 정보구조(IA), 메뉴 계층, 패널 상태, 레이어 전환 규칙을 다시 정리하여 해결한다.

이 문서는 아이콘 시스템과 함께 적용한다.

---

## 1. 현재 문제 진단

### 1.1 왼쪽 메뉴 문제

현재 V2는 서로 성격이 다른 기능이 같은 수준에 놓여 있어 첫 진입 사용자가 무엇부터 눌러야 하는지 직관적으로 이해하기 어렵다.

문제 유형:
- 1차 데이터/현상과 분석 기능이 같은 레벨처럼 보임
- 메뉴가 기능 나열형으로 보임
- V1의 직접적인 탐색감보다 복잡함
- 모바일에서 메뉴/라벨이 동시에 노출되면서 시야와 조작 공간을 압박
- 일부 기능은 세부 기능인데도 1차 메뉴처럼 보임

### 1.2 창/패널 문제

현재 여러 정보 패널을 동시에 열 수 있는 구조는 3D 지구를 보는 공간을 줄이고 상태를 이해하기 어렵게 만든다.

문제 유형:
- 선택 데이터
- 현재 지역/For Me
- 분석/판독
- 활동
- 이벤트
- 설정
등이 서로 겹칠 가능성

### 1.3 모바일 문제

375 / 390 / 430px에서 데스크톱 정보를 축소하는 방식으로 해결하면 안 된다.

문제 유형:
- 메뉴 가림/overflow
- 메뉴가 길어짐
- 패널이 지구를 과도하게 차지함
- 하위 기능이 한 화면에 모두 펼쳐짐
- 닫기/뒤로가기/현재 상태가 모호해짐

---

## 2. 절대 기준: EARTHUS 정보구조

EARTHUS는 다음 깊이로 이동한다.

`1차 DATA → 현재/변화/이상징후/비교 → 2차 INTELLIGENCE → REPORT → 3차 SIMULATION → USER AI`

### 2.1 1차 DATA

왼쪽/상단의 주 메뉴는 사용자가 "무엇을 볼지" 고르는 메뉴다.

예:
- 기온
- 강수
- 바람
- 기압
- 습도
- 해수면
- 수온
- 해류
- 파고
- 태풍
- 빙하
- 홍수·수문
- 가뭄
- 산불
- 지진
- 쓰나미
- 대기질
- 위성·관측
- 생태계
- 농업
- 관광·문화
- 항공/선박 등

### 2.2 Intelligence는 독립 1차 메뉴가 아니다

절대 금지:
- 왼쪽 1차 메뉴에 "Intelligence"를 독립적인 데이터 메뉴처럼 배치
- 빈 AI 채팅창을 먼저 보여주는 방식

정확한 흐름:

`기온 → 현재/변화/이상징후/비교 → Intelligence`

`해수면 → 현재/변화/이상징후/비교 → Intelligence`

`태풍 → 현재/경로/강도/영향 → Intelligence`

### 2.3 Simulation도 독립 1차 메뉴가 아니다

정확한 흐름:

`Data → Intelligence → Report → Simulation`

Simulation은 Pro+ entitlement 이후 노출한다.

---

## 3. V2 왼쪽 메뉴 재설계

### 3.1 기본 원칙

왼쪽 메뉴는 첫 화면에서 "EARTHUS가 무엇을 보여주는가"를 즉시 전달해야 한다.

권장:
- 아이콘 + 한국어 라벨
- 필요 시 작은 English subtitle
- 동일 icon registry 사용
- 선택 상태 명확
- 그룹 간 간격으로 의미적 범주 구분

금지:
- 아이콘만 남기기
- 같은 의미의 기능을 여러 위치에 중복 노출
- Intelligence/Simulation을 같은 레벨의 데이터 메뉴처럼 배치
- 개발/관리 기능을 일반 탐색 메뉴에 노출

### 3.2 권장 1차 메뉴 구성

실제 현재 코드의 메뉴 수를 삭제하지 않고, 시각적/정보구조상 다음 순서를 기준으로 재배치한다.

`기온`
`강수`
`바람`
`기압`
`습도`

`해수면`
`해류`
`수온`
`파고`
`너울`

`태풍`
`홍수·수문`
`산불`
`산사태`
`지진`
`지진해일`
`해안재해`

`빙하`
`적설·빙설`
`해빙`
`영구동토`

`대기질`
`위성·관측`

`생태계`
`농업`
`관광·문화`
`도시·인프라`
`에너지`
`수자원`
`식량·식생`
`인구·사회`

이것은 "55개 레이어를 삭제"하라는 뜻이 아니다.
세부 레이어는 각 1차 subject 안으로 정리한다.

---

## 4. 1차 → 2차 → 3차 UI

### 예시: 기온

왼쪽:

`기온`

선택 후 context panel:

`현재`
`변화`
`이상징후`
`비교`
`Intelligence`

Intelligence:

`질문`
`분석`
`근거`
`Earth Report`

Explorer:

`Earth Report`

Pro+:

`Simulation`

### 예시: 해수면

`해수면 → 현재 → 변화 → 이상징후 → 비교 → Intelligence → Report → Simulation`

### 예시: 태풍

`태풍 → 현재 위치 → 경로 → 강도 → 영향 → Intelligence → Report → Simulation`

---

## 5. 메뉴 ON/OFF 규칙

### 5.1 기본

기본은:
- Primary subject 1개
- 관련 Secondary overlay만 허용

기존 Blueprint의 "주 메뉴 1개, 의미가 연결된 보조 레이어만 자동 조합" 원칙을 유지한다.

### 5.2 함께 켤 수 있는 예

기온 + 바람 + 강수
태풍 + 바람 + 강수 + 파고
해류 + 수온
홍수·수문 + 강수 + 하천
관광 + 날씨 + 교통
위성 + 태풍

### 5.3 기본적으로 교체되는 Primary

기온 → 수온
해수면 → 대기질
기온 → 기압

처럼 서로 주인공 역할을 경쟁하는 데이터는 Primary 하나를 유지한다.

### 5.4 비교 모드 예외

관측 vs 예측,
현재 vs 과거 등은 명시적인 Compare Mode에서만 동시에 보여준다.

---

## 6. 패널 상태 머신

동시에 다음을 중복해서 띄우지 않는다.

- Navigation Drawer: 최대 1
- Primary Context Panel: 최대 1
- Intelligence/Report Panel: 최대 1
- Modal: 최대 1

권장 상태:

`BASE`
→ `NAV_OPEN`
→ `SUBJECT_ACTIVE`
→ `ANALYSIS_ACTIVE`
→ `REPORT_ACTIVE`
→ `SIMULATION_ACTIVE`

새 패널이 열릴 때 동일 역할의 이전 패널은 닫는다.

3D 지구를 가리는 대형 다중 패널 stacking은 금지한다.

---

## 7. 모바일 재설계

### 7.1 375 / 390 / 430px 기준

모바일은 데스크톱 축소판으로 만들지 않는다.

기본:

- 상단: EARTHUS + 검색/현재 위치
- Navigation: drawer
- 지도/지구: 최대 영역
- Context: bottom sheet 또는 compact side sheet
- Intelligence/Report: full-width bottom sheet/page
- Simulation: dedicated full-screen workflow

### 7.2 선택 후 동작

사용자가 1차 메뉴를 선택하면:
1. Navigation drawer를 닫는다.
2. 선택된 subject를 active 상태로 만든다.
3. 필요한 context controls만 보여준다.
4. 지구가 다시 최대 영역을 확보한다.

### 7.3 모바일에서 숨기지 말아야 하는 것

- 현재 선택된 subject
- 현재 모드
- 닫기/뒤로가기
- 데이터 신뢰 상태
- 공식 경보
- 중요한 값

### 7.4 모바일에서 숨길 수 있는 것

- 상세 설정
- 고급 LOD
- developer controls
- 긴 설명
- 드문 사용 옵션

---

## 8. V1 관계

V1은 V2의 모든 IA를 그대로 강제 적용하지 않는다.

V1에서 지켜야 할 공통 원칙:
- 동일 아이콘 registry
- 동일 semantic icon ID
- 명확한 active state
- Intelligence/Simulation의 역할은 subject context에 종속
- 기존 V1 사용성/직관성 유지

V1은 V2보다 간단한 직접 접근 메뉴를 유지한다.

---

## 9. 기존 엔진 보존

이 UX 수리는 다음을 함부로 재작성하지 않는다.

- Cesium globe
- data collectors
- provider adapters
- intelligence/data engines
- simulation engines
- auth/subscription contracts
- existing backend routes

UI/IA 계층에서 adapter/state layer로 연결한다.

---

## 10. Acceptance Tests

Claude Code는 다음을 반드시 검증한다.

### Desktop
- 1280×800
- 1440×900
- 1920×1080

### Mobile
- 375×812
- 390×844
- 430×932

### UX checks
- 1차 데이터 메뉴가 첫눈에 이해된다.
- Intelligence가 독립적인 1차 메뉴로 나타나지 않는다.
- Simulation이 독립적인 1차 메뉴로 나타나지 않는다.
- 기온/해수면/태풍 등 각 subject에서 Intelligence가 자연스럽게 진입된다.
- 동일 역할의 패널이 중복해서 열리지 않는다.
- 모바일에서 메뉴가 지구를 가리지 않도록 한다.
- 모바일에서 overflow/clip/hidden-label이 없어야 한다.
- Primary 1개 + 의미 있는 secondary overlay만 활성화된다.
- 기존 데이터와 엔진 동작이 깨지지 않는다.
- V1/V2 아이콘 registry가 동일하다.

---

## 11. Implementation Order

1. 현재 V2 메뉴 registry audit
2. 현재 패널/state audit
3. 1차 데이터 메뉴 IA 재배치
4. icon registry 적용
5. context panel 통합
6. Intelligence contextual action 연결
7. Report surface 연결
8. Simulation Pro+ transition 연결
9. 모바일 drawer/bottom-sheet 재설계
10. desktop/mobile acceptance test
11. 기존 기능 회귀 테스트
12. only then polish animation/visual effects

---

## 12. 완료 기준

"메뉴를 예쁘게 만들었다"는 PASS가 아니다.

PASS는:

`사용자가 1차 데이터를 즉시 찾음`
→ `데이터 상태를 이해함`
→ `이상징후/변화를 확인함`
→ `그 subject 안에서 Intelligence를 발견함`
→ `Explorer는 Report까지 감`
→ `Pro+는 Simulation으로 자연스럽게 올라감`

그리고 모바일에서도 같은 논리가 유지되어야 한다.

