# EARTHUS V2 — INTELLIGENCE UI 통합 개발지시서 (초안 · 승인 대기)

```text
STATUS:   승인 대기 — 아직 코드를 고치지 않았다
BASELINE: ffc0725e  (PRODUCTION_BOUNDARY_LOCK = CREATED · PUBLISH_READY = YES)
DATE:     2026-09-09
범위:     Intelligence 진입점 통합만. 계산·자료·엔진·정책은 건드리지 않는다
```

---

## 0. 먼저 — 지시서와 실측이 어긋나는 곳이 하나 있다

지시서는 **"좌하단 별도 Intelligence 진입점"** 을 지우라고 한다.
그런데 실측하면 Intelligence 진입점은 **좌하단에 없다.**

```text
1440 폭   #intel  fixed  right:14px bottom:14px  → 화면 오른쪽 아래
           안의 #intel-tab "지구 인텔리전스"  rect=[1300, 852, 126, 34]

375 폭    #intel  rect=[24, 715, 343, 31]
           안의 #intel-tab             rect=[245, 715, 122, 31]  → 아래쪽 오른편
```

좌하단에 있는 것은 Intelligence 가 아니라 **고도·출처 상자(`#hud`)** 다.
왼쪽 **가장자리**에는 세로 브랜드 탭 두 개가 있다(`#brand-tab-e` EARTHUS,
`#brand-tab-a` AETHERUS · `left:0`).

→ **§13 에서 어느 것을 말씀하신 것인지 골라 주셔야 한다.** 셋 중 하나일 것이다.

### 다만 — 지적의 실체는 실제로 있다 (실측 결함)

375 폭에서 **출처 상자가 Intelligence 런처를 덮는다.**

```text
#hud    rect x 14–269 · y 667–746   z-index 7
#intel  rect x 24–367 · y 715–746   z-index 4
겹침    x 24–269 · y 715–746        → hud 가 위에 그려진다
```

화면에서 "지구 인텔리전스" 글자의 왼쪽 절반이 출처 문단에 가린다.
좌하단을 지목하신 이유가 이것이라면, 문제는 **위치가 아니라 겹침**이다.

---

## 1. 지금 구조 — 실측

### Intelligence 패널(7항목)로 들어가는 길이 **네 개**다

| # | 진입점 | 코드 | 여는 방식 |
|---|---|---|---|
| 1 | 떠 있는 런처 `#intel-tab` | `ui-shell.js:1121` | 직접 토글 |
| 2 | 하단바 **지금**(feed) | `ui-shell.js:946` | `showTab('feed')` + `#intel-tab.click()` |
| 3 | 하단바 **내 지역**(myplace) | `ui-shell.js:945` | `showTab('my')` + `#intel-tab.click()` |
| 4 | 리포트 → 현상/분석 | `ui-shell.js:824·829` | `#intel-tab.click()` |

**2·3 은 1과 같은 패널의 특정 탭을 열 뿐이다 — §4 가 말하는 중복 진입점이다.**

### 하단바(주 메뉴로 보이는 것)

```js
// ui-shell.js:912
const NAV_ITEMS = [
  { id: 'feed',    ko: '지금',   en: 'Now' },      // → Intelligence 패널 '사건' 탭
  { id: 'explore', ko: '탐색',   en: 'Explore' },  // → 자료 서랍(openPanel 'earthus')
  { id: 'myplace', ko: '내 지역', en: 'My place' }, // → Intelligence 패널 '내 지역' 탭
  { id: 'report',  ko: '리포트', en: 'Reports' },  // → 리포트 센터
  { id: 'space',   ko: '우주',   en: 'Space' },    // → AETHERUS 장면
];
```

### 상단 좌측 `#es-switch` 는 메뉴가 아니라 **제품 전환기**다

```text
EARTHUS      → /            (v1)
Intelligence → /v2-three/   (지금 이 앱 자신)
WONDER       → /v3-kids/    (v3)
```

데스크톱에만 있고 375 폭에는 아예 없다. 이름이 같아 헷갈리지만
7항목 메뉴와 무관하다. **이건 건드리면 안 된다** — 제품 간 이동이 끊긴다.

### 패널을 여는 방식이 `click()` 합성이다

네 자리 중 세 곳이 `intel.querySelector('#intel-tab').click()` 로 연다.
런처 DOM 을 지우면 **그 세 곳이 조용히 죽는다**(리포트→현상/분석 포함).
그래서 지우기 전에 여는 함수를 하나 만들어 네 자리가 그것을 부르게 해야 한다.

---

## 2. 무엇을 만들 것인가 — 안 세 가지

셋 다 "새 기능 없음 · 계산/자료/엔진/정책 불변 · 기존 라우트 유지"를 지킨다.

### 안 A — 하단바에 Intelligence 한 칸 (지시서 문면에 가장 가깝다)

```text
지금  탐색  내 지역  리포트  우주        →   Intelligence  탐색  리포트  우주
```

- 떠 있는 런처 `#intel-tab` **제거**
- 하단바 `지금`·`내 지역` 두 칸을 **Intelligence 한 칸**으로 합침 (5칸 → 4칸)
- 누르면 패널이 열리고 기본 탭은 `사건`. 나머지 6은 패널 안 탭으로 접근
- `openIntel(tab)` 함수를 만들어 네 진입점이 전부 그것을 부르게 정리

| 좋은 점 | 나쁜 점 |
|---|---|
| 진입점이 하나가 된다. 지시서 구조와 정확히 같다 | `지금`·`내 지역` 한 번 누르기가 두 번 누르기가 된다 |
| 화면에서 떠 있는 UI 하나가 사라진다 | 하단바 칸이 5→4로 줄어 익숙한 위치가 바뀐다 |
| 375 겹침이 사라진다(런처가 없어지므로) | |

### 안 B — 런처만 없애고 하단바는 그대로

```text
지금  탐색  내 지역  리포트  우주        (그대로)
```

- 떠 있는 런처 `#intel-tab` **제거**
- 하단바 `지금`·`내 지역` 이 계속 패널의 해당 탭을 연다
- 나머지 5개 탭(선택 자료·자료의 근거·예보·예정·이력·시뮬)은 패널 안에서만

| 좋은 점 | 나쁜 점 |
|---|---|
| 손이 가장 적게 간다. 익숙한 동선이 안 바뀐다 | 진입점이 여전히 둘(지금·내 지역)이라 §4 "PRIMARY = MAIN MENU ONLY" 를 완전히는 못 지킨다 |
| 375 겹침이 사라진다 | 7항목이 "하나의 메뉴 아래"라는 구조가 화면에 안 드러난다 |

### 안 C — 겹침만 고친다 (최소)

- 런처를 남기고 `#hud` 와 겹치지 않게 자리만 정리
- 중복 진입점은 그대로

| 좋은 점 | 나쁜 점 |
|---|---|
| 위험이 가장 작다 | §2·§4 의 요구(중복 제거)를 안 지킨다 |

**제 추천은 A 입니다.** 지시서 §1·§3·§4 가 요구하는 구조와 정확히 맞고,
375 겹침도 부수적으로 사라지며, 없어지는 동선(`지금`·`내 지역` 직행)은
패널이 열린 뒤 탭 한 번으로 대체됩니다. 다만 하단바 칸 수가 바뀌는 것은
눈에 띄는 변화라 승인이 필요합니다.

---

## 3. 안 A 를 고른다면 — 정확히 무엇을 고치나

### 고칠 파일 (넷)

```text
prototype/v2-three/js/ui-shell.js     진입점 정리 · openIntel() 도입 · NAV_ITEMS
prototype/v2-three/index.html         #intel-tab 관련 CSS 정리(죽는 규칙 제거)
prototype/v2-deploy/…                 번들 재생성 결과 (직접 고치지 않는다)
```

### 코드 수준 변경

1. **`openIntel(tab)` 신설** — 패널을 여는 유일한 함수.
   지금 `click()` 을 합성하는 네 자리(824 · 829 · 945 · 946)와 토글(1121)이
   전부 이것을 부른다. **여는 경로를 하나로 모으는 것이 이 작업의 핵심**이고,
   런처 DOM 제거는 그다음에야 안전하다.
2. **`#intel-tab` 버튼 DOM 제거** (`ui-shell.js:866` 의 템플릿 문자열)
   그리고 `index.html` 의 `#intel-tab` 전용 CSS 규칙 제거 — CSS 로 숨기지 않는다(§2).
3. **`NAV_ITEMS` 조정**
   ```js
   { id: 'intel',   ko: 'Intelligence', en: 'Intelligence' },  // feed·myplace 를 대체
   { id: 'explore', … }, { id: 'report', … }, { id: 'space', … }
   ```
   `case 'intel': openIntel('feed'); break;`
   아이콘은 기존 `NAV_ICON` 에서 `feed` 것을 재사용한다(새 자산 안 만든다).
4. **패널 닫기**(`#intel-close`)와 `intelOpen` 상태는 그대로 둔다.

### 손대지 않는 것

```text
#es-switch (제품 전환기)      · 7개 탭의 내용·계산·자료
report-center.js 전체         · report → 현상/분석 배선 (openIntel 로 바뀔 뿐 동작 동일)
phenomenon-registry           · simulation · forecast · report-engine · 정책 · S3
```

### 깨지면 안 되는 것 (구현 후 반드시 확인)

```text
리포트 → 현상    live=sstfield · 출처 패널
리포트 → 분석    live=+tempgrid · WHY 패널
7개 탭 전부      사건 · 내 지역 · 선택 자료 · 자료의 근거 · 예보·예정 · 이력 · 시뮬레이션
하단바           탐색 · 리포트 · 우주
딥링크           #v=1&at=…&live=… 유지 (이 작업은 해시 문법을 건드리지 않는다)
```

---

## 4. 절차 (§10 그대로)

```text
SOURCE(prototype/v2-three) 수정
  → tools/build-v2-bundle.sh          번들 재생성 (손 복사 없음)
  → aws/build-public.py --manifest    공개 빌드
  → tools/deploy-v2-three.sh          배포 + CloudFront 무효화
  → 라이브 검증
```

## 5. 검증 계획 (§6·§7·§11·§12)

```text
1440 KO · 1440 EN · 375 KO · 375 EN   라이브에서 네 칸
  떠 있는 Intelligence 런처 없음 · 하단바에서 Intelligence 접근 · 7항목 표시
  지구 가림 없음 · 겹침 없음 · 가로 overflow 0 · 우리 origin 콘솔 0
리포트 → Intelligence 연결            PASS
발행 보고서 표시                       PASS (회귀 확인)
시험 505/505                          삭제·skip·완화 없이
SOURCE = DEPLOY                       번들 빌드 멱등성 sha256 대조
지운 95건 되살아남 0                   배포 후 전수 확인
PRODUCTION_BOUNDARY_LOCK              MAINTAINED
```

---

## 6. 승인이 필요한 것 — 두 가지

1. **어느 것을 "좌하단 Intelligence" 로 보시는지**
   ⓐ 떠 있는 런처 `#intel-tab`(실제로는 오른쪽 아래) — 제거 대상으로 보임
   ⓑ 왼쪽 가장자리 세로 탭 `EARTHUS`/`AETHERUS`
   ⓒ 좌하단 고도·출처 상자 `#hud` (Intelligence 아님)

2. **안 A · B · C 중 무엇으로 갈지** (추천: A)

이 둘이 정해지면 바로 구현하겠습니다. 그전에는 코드를 고치지 않습니다.
