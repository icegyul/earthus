# EARTHUS V2 — PHASE 0 저장소·아키텍처 감사

| 항목 | 값 |
|---|---|
| 상태 | PHASE 0 완료 (감사만, 제품 코드 변경 없음) |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `1e03eac8` (브랜치 `earthus-v2/real-living-earth-render`) |
| 대상 | `prototype/v2-three/` + 이를 떠받치는 `aws/`, `tools/` |
| 방법 | 10개 하위 시스템을 각각 읽고, 각 주장에 대해 별도 검증자가 인용된 file:line 을 다시 열어 반박 |

> **이 문서는 봉인 패키지의 일부가 아니다.** `docs/earthus-v2/` 는 2026-08-27 에 만들어진 인계 패키지이고 `SHA256SUMS` 가 그 66개 파일을 덮는다. 이 문서와 PHASE 1 산출물은 그 뒤에 추가된 **살아있는 설계 문서**이며 `SHA256SUMS` 의 대상이 아니다. 기존 66개 파일의 해시는 건드리지 않았다.

---

## 0. 한 줄 결론

지침서는 **리포트 엔진·불변 예보 스냅샷·팩트 세트·중앙 구독 게이트가 이미 있다고 전제하지만, 넷 다 없다.** 있는 것은 그 자리에 놓을 수 있는 **정상 동작하는 부품들**이고, 그 부품들은 대부분 v2-three 에서 **연결되지 않은 채** 놓여 있다.

그래서 PHASE 5~9 는 백지 개발이 아니라 **이미 있는 계약을 승격시키는 작업**으로 잡아야 한다. 백지로 잡으면 두 번째 리포트 계보가 생긴다.

---

## 1. 기준선이 지침서와 다르다

| | 지침서 | 실제 |
|---|---|---|
| 기준 커밋 | `2d94c379` | `1e03eac8` — 3 커밋 앞서 있다 |
| 렌더러 | "Cesium-based rendering 유지" | `prototype/v2-three/` 는 **Three.js** 다. Cesium 지구는 `prototype/v2/` 에 따로 있고, v2-three 는 그것을 "Cesium v2 지구 열기" 로 링크한다 (`prototype/v2-three/index.html:1183`) |
| 탭 21개 | 21 | 어떤 정의도 21을 만들지 않는다. 실제는 7그룹 약 34개 버튼 |
| 질문 없는 레이어 "약 16개" | 16 | **정확히 14개** 가 항목 자체가 없고(lab 5 + hobby 9), 나머지 2개(`hobby/surf`, `hobby/vessel`)는 ocean 항목에 **충돌해서** 남의 질문을 표시한다 → 화면상 잘못된 행은 16개 |
| 상위 진입점 18개 | 18 | 열거로 확인. 단 소스에 18이라고 적힌 곳은 없고, 외부 주입 `.es-switch` 가 같은 좌표에 19번째 무리를 더한다 |

지침서 §2 의 수치는 **재구성된 값**이지 선언된 값이 아니다. 숫자를 근거로 무엇을 자르기 전에 다시 세어야 한다.

직접 파싱으로 확인한 수치: 씬 9, 레이어 109, **고유 id 107** — `surf`, `vessel` 이 각각 두 번 선언된다.

---

## 2. 지금 있는 것

| 하위 시스템 | 상태 |
|---|---|
| 메뉴 레지스트리 | `ui-shell.js:18-212` 의 손으로 쓴 JS 리터럴 `SCENES`. 레이어 필드는 7종(`id`,`name`,`state`,`src`,`act`,`plan`,`longterm`)뿐이고 `act` 는 105행에 붙어 있으나 **읽는 코드가 없다**. `tier` 필드는 없다 |
| 라우팅 | 메뉴 탭은 bare id 를 넘기지 않는다. 버튼이 `data-fscene`/`data-flayer` 를 들고, `onLayerAction` 이 첫 줄에서 `sid + "/" + layer.id` 복합키를 만든다 (`main.js:3927`). **복합키 규약은 이미 존재한다** |
| 씬 개념 | 런타임에 없다. `setActiveScene` 은 빈 스텁(`ui-shell.js:440`), 레이어는 9개 씬에 걸쳐 **가산적**으로 켜진다 |
| 우측 패널 | `index.html` 에 마크업이 없다. `initShell()` 이 JS로 만든다(`ui-shell.js:443-463`). 탭 6개 중 5개가 전역 내비게이션 |
| 질의응답 | `#ask-drawer` 는 좌상단 `#panel` 안에 있고 `/api/ask` 로 POST 한다. **우측 패널을 전혀 건드리지 않는다.** 페이로드에 현상·사건이 없고 카메라 좌표와 켜진 레이어 id 뿐이다 |
| 출처/증거 | 데이터 모델이 없다. 레이어의 출처 = `SCENES` 위의 손으로 쓴 문자열 두 개(`state`, `src`). 두 번째 진실 표 `LAYER_TRUTH`(`engine-bridge.js:111`)가 따로 있고 **둘이 17개 레이어에서 어긋난다** |
| LAB 리포트 | 문서가 아니라 **살아있는 세션의 가변 투영**이다. 3시간마다 본문까지 통째로 다시 쓴다(`aws/lab-events/handler.py:1073`). `FINAL_REPORT` 도 종결이 아니다 |
| 예보 | 20종 이상 생산·소비. 불변 보존은 `aws/typhoon-official`(`IfNoneMatch='*'`) **하나뿐**. 나머지는 매 실행 단일 키 덮어쓰기 |
| 구독 게이트 | `prototype/js/access-mode.js` 라는 진짜 이음매가 있으나 **살아있는 호출자가 없다**. v1 전용이고 `FREE_OPEN` 이 모든 판정을 단락시킨다 |
| 시뮬레이션 | 진짜는 **둘뿐** — `sim-ocean.js`(Gerstner 14성분 파면)와 `aws/tsunami-eta`(√(g·h) + Dijkstra) |

---

## 3. 없는 것 — 지침서가 전제하지만 저장소에 없는 것

| 없는 것 | 막히는 지침서 절 |
|---|---|
| v2 의 리포트 엔진 자체 (생성기·렌더러·라우트·인덱스 읽기 전부) | §15, §21 |
| 불변 리포트/예보 스냅샷. 모든 LAB 리포트 본문이 3시간마다 통째로 덮어쓰인다 | §15, §16, §21 |
| `snapshotId`. `prototype/` 전체에서 유일한 등장은 **쓰는 곳 없는 읽기 전용** 코드다 | §16, §22 |
| 구조화된 팩트 레코드. `detail.facts` 는 단위·타입·출처 id·유효시각·신뢰도가 없는 `{label, value}` 표시 문자열이다 | §12, §22 |
| 살아있는 중앙 티어 게이트, v2 레이어의 `tier` 필드, 메뉴→티어 매핑 | §36 |
| 동작하는 결제 쓰기 경로. `profiles.tier` 는 `('free','paid')` 로 제약되는데 `apply_paid_order` 는 `explorer`/`intelligence` 를 쓴다 | §36 |
| 현상 레지스트리. `prototype/v2-three` 아래 `phenomena*` 파일이 없고, 씬 범위 질문 맵이 어디에도 없다 | §44 |
| 레이어 id 유일성 제약. `surf`/`vessel` 이 두 번 선언된 것을 **아무것도 감지하지 않는다** | §2, §44 |
| Event 엔티티. 사건은 종류별로 필드가 다른 인라인 객체 리터럴 두 개다 | §30, §3.4 |
| LLM 답변의 신뢰도·불확실성·주장별 인용, 생성 산문의 팩트 검증 | §32 |
| 강수 관측 이력 → **강수 예보를 검증할 방법이 현재 없다** | §16 |
| S3 버킷 버저닝·수명주기·Object Lock, 아카이브 실행 색인 | §16 |
| 예보 전반의 공통 `issuedAt`/`validFrom`/`validTo`/`horizon` 스키마. **8가지 명명이 혼용**된다 | §16, §22 |
| 현재 선택된 메뉴 항목을 읽는 getter. `selectedMenu` 는 클로저 사적 변수이고 `setSelection` 만 있고 읽는 함수가 없다 | §3.4 |

---

## 4. 마이그레이션 위험 — 순위

### BLOCKER 1 — 유일한 v2 게이트가 이미 빨간불이고, id 를 바꾸면 실패가 아니라 **눈이 먼다**

`node tools/check-v2-consistency.mjs` 는 **오늘 exit 1** 이고 `[핸들러 없음]` 16건을 낸다. 16건은 전부 거짓 양성이다 — lab/hobby 핸들러는 `main.js:3939` 의 `sid === 'lab' || sid === 'hobby'` 형태여서 검사기의 정규식이 보지 못한다.

더 심각한 것은 `tools/check-v2-consistency.mjs:59` 가 복합키를 **스스로 조립**한다는 점이다. `SCENES` 의 id 를 도메인 한정자로 바꾸는 순간 이 줄은 `ocean/ocean/typhoonsim` 을 만들고 **109개 레이어 전부가 고장났다고 보고**한다. 정규식도 소문자 전용 id, 슬래시 단독 구분자, `id`→`name`→`state` 필드 순서를 하드코딩한다.

→ **id 를 건드리기 전에 검사기를 독립된 단계로 먼저 고친다.** 빨간 기준선에서 시작한 리팩터는 인수 시험이 아예 없는 것과 같다.

### BLOCKER 2 — bare id 표 6개와 리터럴 약 40개가 이름 변경 시 **조용히** 실패한다

던지지도, 비지도 않는다. 그냥 틀린 글자가 나온다. `menu-guide.js`(93키)는 `|| l.name` 으로, `i18n.js:51` 은 `L_EN[id] || koName` 로 폴백한다. 절반만 옮기면 **멀쩡해 보이는데 거짓말하는 메뉴**가 된다.

→ 여섯 표를 **한 커밋에서** 옮기고, 같은 커밋에서 검사기에 1:1 커버리지 단언을 넣는다.

### BLOCKER 3 — `/` 구분자는 장식이 아니라 **구조**다

다섯 곳에서 다시 쪼개진다: `main.js:4159`, `:4232`, `:4328`(정확히 2조각 구조분해), `:4539`, 그리고 `ext-scene.js`.

→ `/` 를 유지하고 bare 조회만 바꾼다. 점(`.`) 표기로 바꾸면 `setBaseStyle` 에 문자열 전체가 통째로 넘어가고 `travel.setMode` 에 `undefined` 가 넘어간다 — **둘 다 예외를 던지지 않는다.**

### HIGH 4 — `LAYER_TRUTH` 에 이미 중복 키 4개가 있고, 그중 둘은 사용자가 보는 진실 등급을 뒤집는다

직접 파싱으로 확인: 선언 93줄 → 런타임 89키.

| 키 | 앞선 선언 | 나중 선언(이김) |
|---|---|---|
| `hazards/eqdepth` | `HISTORY` | **`OFFICIAL_OBSERVATION`** |
| `hazards/plates` | `HISTORY` | **`OFFICIAL_OBSERVATION`** |
| `ocean/khoaflood` | `PROVIDER_FORECAST` | `PROVIDER_FORECAST` |
| `hazards/tyens` | `PROVIDER_FORECAST` | `PROVIDER_FORECAST` |

앞의 둘은 **자료형 오표기**다. 사료(史料)를 "공식 관측" 으로 배지하고 있다. 레지스트리를 이 표에서 생성하면 그대로 굳는다.

→ 레지스트리보다 먼저 중복을 제거하고 어느 쪽이 정본인지 결정한다.

### HIGH 5 — 모든 파일이 두 벌 있고 두 트리가 이미 어긋났다

`prototype/v2-deploy/` 는 `tools/build-v2-bundle.sh` 가 `rm -rf` 후 재생성하는 거울이고, `deploy-v2-three.sh` 는 **그 번들만** 배포한다. `diff -rq` 가 약 20개 파일 차이를 보고한다.

→ 번들 재생성은 마지막 단계가 아니라 **매 단계의 완료 정의**에 포함된다. 그러지 않으면 모든 중간 검증이 배포되지 않는 코드를 대상으로 한 것이 된다.

### HIGH 6 — 공개 URL 계약이 id 네임스페이스 3개를 얼린다

`main.js:5628` 이 `live=`(LiveLayers bare id), `:5626` 이 `base=`, `:5627` 이 `cloud=`(콜론 포함 문자열)를 쓴다. 이미 공유된 링크에 박혀 있다.

→ LiveLayers 네임스페이스는 **동결**로 취급하고, `LIVE_LAYER_KEYS` 를 복합키→bare 다리로 남긴다. 값을 개명하지 않는다.

### MEDIUM 7 — 기존 테스트가 바꾸려는 바로 그 소스 문자열에 고정되어 있다

`tools/test_v2_badge_parity.mjs:7,12` 는 `ui-shell.js` 의 `evidenceRow` 줄을 문자열 일치로 검사하고, `tools/test_v2_information_flow.mjs:53` 은 지침서 §5.3 이 없애라고 한 보일러플레이트 문구를 **그대로 단언**한다.

→ 같은 커밋에서 갱신한다. CI가 깨지는 것은 정상이며, 발견이 아니라 **의도**여야 한다.

---

## 5. 지침서 §5.3 의 전제는 사실과 다르다

"모든 카드에 반복되는 문자열" 은 소스에 **각각 한 번만** 존재한다. `menuCoverage`/`menuTime` 의 폴백 반환값이다. 109행 중 77·79회 재방출되는 이유는 **그만큼의 레이어에 커버리지/시각 사실 자체가 없기 때문**이다(56행은 둘 다 출력).

→ 고칠 것은 문자열 중복 제거가 아니라 **빠진 사실을 채우는 것**이다. 레지스트리가 커버리지·시간 의미를 들고 오면 이 문구는 저절로 사라진다.

---

## 6. 실행 순서 정정

지침서 §50 의 STEP A→P 는 대체로 안전하지만 네 곳을 재배치해야 한다.

1. **검사기 수리를 STEP B 앞에 독립 단계로 넣는다.** (BLOCKER 1)
2. **`LAYER_TRUTH` 중복 제거와 surf/vessel 분리 결정을 레지스트리 앞에 넣는다.** 레지스트리의 키 집합이 여기서 결정된다.
3. **Event id 를 우측 패널 문맥화보다 먼저 만든다.** 지금 사건 방은 **매번 재정렬되는 목록의 배열 인덱스**로 주소를 잡는다(`intel-feed.js:428`). 주소가 흔들리는 위에 문맥 패널을 지으면 패널이 흔들린다. → STEP E 앞에 STEP N 의 Event 부분을 당긴다.
4. **티어 DB 수정을 제품 티어 작업보다 먼저 한다.** `CHECK` 제약만 넓히고 트리거를 두면 유료 가입자가 전부 `membership_class='free'` 로 찍힌다.

그리고 §37 의 "PHASE 5 리포트 엔진" 은 **백지 개발로 잡으면 안 된다.** `docs/LAB-REPORT-CONTRACT.md` 가 수명주기·id 형태·공개 접두사를 이미 고정했고, `aws/signal-foundation/canonical.py` 가 팩트 봉투(`earth.signal.v1`)를 이미 정의했으며, `aws/typhoon-official` 이 불변성 패턴을 이미 보여준다. 먼저 **대조 단계**를 넣는다.

---

## 7. 레지스트리 형식 결정 (§44 "기존 규약을 추측하지 말 것")

**결정: `prototype/v2-three/js/phenomenon-registry.js` — 얼린 ES 모듈, `scene/layer` 복합키.**

`prototype/v2-three/data/` 아래 JSON 이 아니다. 근거 넷:

1. **형식** — `prototype/v2-three/data/` 에 `.js` 파일이 0개인 반면, 셸이 렌더링하는 레지스트리는 **전부** `prototype/v2-three/js/` 의 얼린 ES 모듈이다: `LAYER_TRUTH`(`engine-bridge.js:111`), `MENU_QUESTIONS`(`menu-guide.js:2`), `TRAVEL_CATALOGS`(`travel-catalog.js:2`), `SOURCE_STATE`(`event-room.js:29`). 메뉴를 향하는 조회 표 중 `.json` 은 **하나도 없다.**
2. **동기성** — `ui-shell.js` 는 임포트된 `SCENES` 로 메뉴를 **동기 렌더**한다. fetch 하는 레지스트리는 첫 로드에서 불완전한 메뉴를 그린다.
3. **캐시** — `tools/deploy-v2-three.sh:92` 가 `data/*` 를 `max-age=86400, stale-while-revalidate=604800` 으로, `js/*` 를 `max-age=60` 으로 서빙한다. 레지스트리가 `data/` 에 있으면 편집 후 최대 하루(최장 7일) 동안 배포된 JS 와 어긋난다.
4. **버전관리** — `git ls-files prototype/v2-three/data` 는 **2개 경로만** 반환한다. 그 아래 JSON 10개 중 9개는 추적되지 않는 작업 사본이라, 거기 둔 레지스트리는 새로 클론하면 사라진다.

**키 형태**: 복합키 `scene/layer`. 이미 7곳의 규약이고, bare id 레지스트리는 첫날부터 surf/vessel 충돌을 상속한다.

**이름**: `phenomena` 라는 단어 단독 사용은 피한다 — v1 에 이미 `phenomena` 레이어 id(대양 환류)가 있고 호출부가 26곳이다.

**검증**: `tools/validate_catalogs.py`(prototype/data JSON 7개만 검사)가 아니라 `tools/check-v2-consistency.mjs` 를 확장한다. 레지스트리는 데이터 카탈로그가 아니라 **코드**다.

---

## 8. 다음 단계

PHASE 1 — 정본 현상 레지스트리와 109행 마이그레이션 맵. 시각적 변경 없음.
