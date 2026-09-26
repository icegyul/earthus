# EARTHUS 통합 개발 계획서 — V38.1(Pleos·Intelligence UX·지구 렌더러) + V7(연구·Simulation·유료 가치)

2026-09-27 · 상태: **PD 승인 대기 — 이 문서가 승인되기 전에는 코드를 쓰지 않는다**

입력 문서
- `ui_PLEOS/EARTHUS_V38_1_MASTER_DEVELOPER_COMMAND.md` (이하 **V38.1**) — 감사 수정 + Intelligence UX + Globe Renderer 지시
- `ui_PLEOS/EARTHUS_V2_MASTER_IMPLEMENTATION_SPEC_V7_SINGLE_SOURCE_OF_TRUTH_PAID_VALUE_2026-09-26.docx` (이하 **V7**) — 연구·Simulation·Space Traffic·유료·보안·데스크톱
- 실제 저장소 조사 (2026-09-27, 브랜치 `earthus-v2/real-living-earth-render`)

정본 관계: AGENTS.md > 이 계획서 > V38.1·V7 원문. 원문과 이 계획서가 다르면 이 계획서의 판단(근거 적음)을 따르고, **§3 의 미결 결정은 PD 답을 받기 전까지 해당 트랙을 시작하지 않는다.**

---

## 0. 화면에서 무엇이 바뀌나 (AGENTS.md 일하는 법 1)

| 누가 | 지금 | 이 계획이 끝나면 |
|---|---|---|
| 차 안(Pleos) 주차 중 | 없음 | v1 지구 + 날씨·위성(구름)·바다·대기·재난·지역 7개 메뉴, 장소 카드, Intelligence 문장 전체 — **1차 출시는 이것만** |
| 차 안(Pleos) 운전 중 | 없음 | 1차: 기어가 P 를 벗어나면 OS 가 앱을 닫는다(Pleos 규칙, 주행 선언 안 함). 2차(Pleos 가 주행 선언 자격을 확인해 줄 때만): 지금 날씨 · 기상청 특보 · 길안내 연결을 움직임 없는 네이티브 화면으로 |
| v1 웹·앱 사용자 | 숫자·기호 위주 시트 | 각 메뉴 맨 위에 **사람이 설명하듯 쓴 1~3문장**("지금은 맑지만 습도가 높아 더 덥게 느껴집니다…"), 그 아래 수치, 그 아래 출처·시각. ⓘ 자세히 보기에 근거 전체 |
| v1 지구 | GIBS 611 m/px 바탕 + 구름 imagery + 구름 그림자 | 가까이 갈수록 더 선명한 지표, 조작 중엔 가볍게·멈추면 다시 선명하게, 오래된 구름 사진엔 시각 배지 |
| 연구 사용자(웹, 별도 출시) | 없음 | 한강 홍수 실제 사건 하나를 질문→자료→QA→모델 실행→지구 위 재생→관측 비교→재현까지 (V7 첫 유료 가치) |
| AETHERUS(웹·모바일) | 궤도 500개 상한 | 공식 카탈로그 전체 + 근접 후보 계산 (V7 Space, 연구 트랙 P4 이후) |

---

## 1. 확정된 PD 결정 (2026-09-27)

| # | 결정 | 반영 |
|---|---|---|
| D-1 | **Pleos 는 v1 기반.** Intelligence 는 v1 에도 들어간다 | AGENTS.md 표 정정 |
| D-2 | Intelligence 카드 순서 = **자연어 문장 → 수치 → 출처·시각** (v1·v2 공통) | AGENTS.md 72행 정정 |
| D-3 | 재난 문장: "정부 법이면 따른다" → **법에 있다(원문 확인).** 기상법 제2조 제10호 특보 = "중대한 재해가 발생될 것이 예상될 때 주의를 환기하거나 경고를 하는 예보", 제17조 기상청장 외 불가(기상예보업 예외는 예보만), 제48조 3년/3천만원 (law.go.kr lsiSeq=284327, 2026-09-18 시행본) | 아래 규칙 R-DIS |
| D-4 | Pleos 에는 AI·챗봇·물어보기·Simulation 금지. Simulation 은 브라우저로 따로 출시 | 트랙 PL·RS |

**R-DIS (재난 문장 규칙, D-3 에서 나옴)**
- 허용: 기상청 특보를 **발표 기관·발표 시각과 함께 그대로 전하는 문장** ("기상청이 오후 3시 서울에 호우주의보를 발표했습니다.")
- 허용: 기상청·행정안전부가 공개한 **국민행동요령을 출처와 함께 인용** ("행정안전부 호우 행동요령: 하천 주변 접근 자제")
- 금지: 우리 판단으로 재해 가능성을 말하며 주의를 환기하는 문장 ("비가 계속될 가능성이 있어 저지대 이동은 주의하세요") — V38.1 원문의 예시 문장은 이 이유로 쓰지 않는다
- 금지: 자료 수신 실패를 "특보 없음"·"안전"으로 표시 → "특보 정보를 받지 못했습니다 (시각)" 로 표시

**R-FC (v1 예보 문장 규칙, D-1 과 2026-09-24 결정의 조합)**
- v1 의 앞으로 문장("오후 6시쯤부터 비가 올 가능성이 높아집니다")은 **기상청 동네예보를 전하는 문장**으로 쓴다 — 출처 줄에 "기상청 단기예보 · 발표 시각". v1 날씨 시트는 이미 동네예보가 1순위다(`ui-weather.js`).
- 기상청 예보가 없는 곳(해외)은 모델 값을 "수치모델 예측(모델명·실행 시각) · 기상청 예보 아님" 표기와 함께 쓴다(v2 와 같은 표기, 8836c984).

---

## 2. 두 문서가 겨냥하는 것 — 여섯 트랙으로 나눈다

V38.1 과 V7 은 서로 다른 제품을 말한다. 한 번호 체계로 섞으면 P0 이 두 개가 된다(V7 스스로 PAID-10·11 에서 지적). 트랙별 접두어를 쓴다.

| 트랙 | 무엇 | 대상 코드 | 근거 문서 | 제품 |
|---|---|---|---|---|
| **PL** | Pleos 차량 앱 — 제품 분리·주행 안전 게이트·주행/주차 화면·포장 | v1 `prototype/` + 새 Pleos 진입점 | V38.1 §0~16 | EARTHUS · PLEOS |
| **DT** | 자료 신뢰(신선도 표준)·장소 카드 어댑터·Context 규칙 | v1 `prototype/js/` | V38.1 §5~7·11·12 | EARTHUS 공통 |
| **IN** | Intelligence 문장 UX (도메인 7개) | v1 `prototype/js/` (+ v2 카드 순서) | V38.1 Intelligence UX | EARTHUS · WEB/MOBILE/PLEOS |
| **GR** | 지구 렌더러 품질·성능 | v1 Cesium (`viewer.js`·`imagery.js`·`render-quality.js`) | V38.1 Globe Renderer | EARTHUS |
| **RS** | 연구·Simulation 브라우저 (P0~P12) | **§3 D-5 결정 대기** | V7 V7-00~12 | 별도 브라우저 출시 |
| **SP** | Space Traffic (S0~S13) | AETHERUS (`prototype/js/aetherus/`, `services/aetherus-orbital`) | V7 Space PART | AETHERUS · WEB/MOBILE (Pleos 절대 제외) |

유료·보안(V7 PAID/SEC)은 트랙이 아니라 **RS·SP 의 출시 관문**으로 붙인다(§8).

---

## 3. PD 결정 — D-5~D-8 답 (2026-09-27)

> **⚠️ 코딩 보류 (2026-09-27 PD): "만들지 마. 기획부터 같이 잡고 진행할 건데 당장 안 할 거야." · "만들지 말라는 건 코딩하지 말라는 거야."** 이 계획서의 어떤 트랙도 코드를 쓰지 않는다. 기획(순서 정리·화면·범위)은 PD 와 같이 진행한다.

| # | PD 답 | 계획에 주는 뜻 |
|---|---|---|
| D-5 | **V7 = v2 전용 브라우저 출시 — Windows 용·Mac 용** | 세 번째 지구 코드가 아니다. 아래 표의 (가)·(나) 권고는 폐기. 코드 기반·셸 방식은 기획 때 정한다 |
| D-6 | **V7 화면 구조(좌 Project·우 AI)는 v2 전용 브라우저에** | 웹 v2(earthus.net/v2)의 11메뉴·Inspector 는 그대로. 둘을 한 화면에 어떻게 두는지는 기획 때 |
| D-7 | **미정 — 제품 출시 후 최종 결정** | 요금제 이름을 코드·문서에서 바꾸지 않는다 |
| D-8 | **순서 정리부터 하고 진행** | 순서 정리도 기획에서 PD 와 같이 한다 |

### (참고) 처음 질문과 당시 권고

| # | 질문 | 왜 막히나 | 권고 |
|---|---|---|---|
| **D-5** | V7 의 "V2" 는 어느 코드인가? | V7 은 `prototype/index.html`(Cesium) 을 V2 의 브라우저 셸로 적고 파일 계획도 전부 `prototype/js/` 에 둔다(IFP-00~07). 저장소 정본은 v1 = `prototype/` Cesium, **v2 = `prototype/v2-three/` Three.js**(AGENTS.md). V7 의 기준 커밋 3370220(main)은 지금 브랜치의 조상이 아니고, V7 이 가리키는 `codex/v13-research-simulation-foundation` 브랜치와 `prototype/js/simulation/research-simulation.js` 는 로컬·원격 목록에 없다 | (가) **새 연구 브라우저를 `prototype/research/` 별도 진입점으로 두고 Cesium 을 쓴다.** 이유: V7 의 4D 결과·3D Tiles·terrain 요구가 Cesium 기능이고, PD 가 "Simulation 은 브라우저로 따로"라고 했다. v1·v2 는 건드리지 않고 공용 모듈(`js/earthus2/v02/core/*`, `research.js`)만 재사용. ⚠️ **대가: 세 번째 지구 코드가 생긴다** — 2026-09-14 PD 결정 "지구는 v1·v2 둘만"(WONDER·v3 제거)을 다시 여는 선택이다. (나) 대안: V7 연구·Simulation 을 **v2 의 ⑦ Simulation 작업 공간**(AGENTS.md 7단계 문법에 이미 있는 자리)에 붙인다 — 지구는 둘로 유지, 대신 Cesium 이 아닌 Three.js 위에서 4D 결과·지형을 직접 만들어야 한다. 권고는 (가)지만 PD 가 고른다 |
| **D-6** | V7 화면 구조(좌 Project 사이드바 · 우 AI Aside)를 어디에 적용하나 | v2 정본은 좌 11메뉴 · 우 Inspector · 하단 타임라인(2026-09-20). V7 을 v2 에 씌우면 정면 충돌 | D-5 권고대로면 **연구 브라우저에만** 적용, v2 는 그대로 |
| **D-7** | 요금제 이름 | V7: Free/Explorer/Research/Professional. 정본(09-14): FREE/EXPLORER(Report)/PRO(Simulation) + RESEARCH/ENTERPRISE(계약) | 정본 이름 유지, V7 Research→**PRO**, V7 Professional→**RESEARCH·ENTERPRISE** 로 매핑 |
| **D-8** | 연구 트랙(RS)과 지금 열린 작업의 순서 | AGENTS.md 의 지금 작업 = 계약 §I R0→P0→P1+M1+T→§14→S-A. V7 은 "P0 부터, 한강 홍수가 최우선". 둘 다 동시에는 못 한다 | Pleos(PL)·v1 Intelligence(IN) 먼저 → RS P0·P1 은 R0 완료 후. 2027-01-01 유료 전환에 필요한 것(§8)이 우선 |

---

## 4. 실측 현황 (2026-09-27 저장소 조사)

### 4-1. V38.1 샘플 패키지(`ui_PLEOS/`) — 직접 실행
| 항목 | 결과 |
|---|---|
| V37 테스트 | PASS |
| V35·V36 테스트 | FAIL — Windows 경로 버그(`D:\D:\%23%23…` 로 파일을 찾음) |
| V38 최종 게이트 | FAIL — 패키지 밖 `../../../v37/…` import (ERR_MODULE_NOT_FOUND). 그런데 `V38_FINAL_GATE_REPORT.json` 은 "PASS" |
| V33 안전 게이트 | 목록에 없는 기능 → `ALLOW` (fail-open). 이름 불일치(`local_explore`/`local_discovery`, `satellite_playback`/`time-playback`) |
| Pleos 렌더러 | V38→V36→V35→V28/V29 를 따라가면 `node:fs/promises` — 브라우저에서 빈 화면 |
| 57 POI | 운영 코드 어디서도 import 하지 않음 |
| git | `ui_PLEOS/` 는 미추적. R0 기간이라 **옮기지 않고 복사만** |

→ 샘플 코드는 이식하지 않는다. **규칙(행렬·상태·이름·테스트 목록)만 가져간다.**

### 4-2. 실제 저장소 — 트랙별
| 트랙 | 이미 있음 | 없음 |
|---|---|---|
| PL | Android TWA(`apps/android-twa`, Bubblewrap, startUrl `/?src=twa` = v1), 공개 빌드 필터(`aws/_shared/public_build.py`, deny-list), 파일 목록 매니페스트(`tools/manifests/*.tsv`), `index.html` modulepreload 120개 | Pleos·주행 상태 코드 0건, 빌드 대상 개념 없음(번들러 없음), AETHERUS 제외 빌드 |
| PL (AETHERUS 연결) | v1: `main.js:50` `space/route-state.js` **정적**, `main.js:100` cosmic3d·`:530` spaceops·`ui-sat.js:110,182`·`layerbar.js:1349` 는 동적. `layers/space.js`(위성 궤도) 는 `registry.js:8`·`ui.js:16`·`ui-sat.js:6`·`ui-launchops.js:12` 에서 **정적** | — |
| DT | `place.js`, `korea-admin-reference.js`, `kto-tourism-contract.js`(9 서비스 신선도), `canonical-signal.js:86 deriveFreshnessState`, `safety-engine.js warningFreshness`(UNKNOWN≠SAFE), `ocean/observation-contract.js`, `why-now.js`(규칙 기반) | POI repository 개념, 장소 카드 어댑터, `RAIN_INDOOR`·`SUNSET_OUTDOOR` 등 규칙, 통일된 FRESH/STALE/EXPIRED/UNAVAILABLE/ERROR(현재 6종 어휘 흩어짐), `freshnessSec` |
| DT (예약·쿠폰) | `reservation-impact.js` = shadow 계약("예약 생성·결제는 이 모듈의 기능이 아니다"), `travel-catalog.js` "예약 안내" 라벨 | 실제 예약·쿠폰 실행 기능 → **장소 카드의 예약·쿠폰 = false 고정** |
| IN | `narrative.js`(숫자 없으면 문장 없음, KMA 기준·평년 백분위, head/num/why), `weather-summary.js`(동네예보 재진술), `decision-rail.js`(특보 하드 게이트), `place.js seaState` | 도메인 7개 공통 문장 부품, 문장→수치→출처 카드, 영어 문장, 도메인별 문장 테스트 |
| GR | Cesium 1.143, GIBS Blue Marble L8(≈611 m/px) + VIIRS 야간, 구름 = GMGSI imagery(±72.7°, `cloudTime()`), **구름 그림자 있음**(`cloud-shadow.js`, 태양 벡터·12 km 고정 높이·낮만), `enableLighting`·`dynamicAtmosphereLighting`, `render-quality.js`(프레임 비용 22 ms↑ 내림/8 ms↓ 올림, PressureObserver), `power.js` requestRenderMode·30 fps 상한, `tileCacheSize=300` | 지형(EllipsoidTerrain 만), 바다 반사(`showWaterEffect=false`), 줌 단계별 고해상 지표, 구름이 지표와 분리된 층(지금은 같은 구에 덮임), 조작/정지 품질 분리, 구름 시각 → 신선도 배지 |
| RS | `research.js`(4,257행, 예보 검증·연구팩), `earthus-intelligence.js`(SHADOW_EVIDENCE_ONLY), `aws/tsunami-eta`(SIMULATION_ONLY), research-runtime 모델 2종 | V7 이 말하는 `research-simulation.js`·V13 브랜치(로컬에 없음), 홍수 모델·worker·결과 artifact·Validation Lab·Project |
| SP | `layers/space.js`(CelesTrak, `:428` `satsCapped` 상한 = "500"), `aetherus/core.js`(API + 스냅샷, FRESH/STALE/EMPTY), `services/aetherus-orbital`(FastAPI·테스트·증거), `spaceops/` | 전체 카탈로그 IndexedDB, worker 전파, 근접 screening |
| 유료 | `billing.js` + 서버 `play-verify`(구매 토큰 서버 재확인·창립 멤버 서버 판정), `earthus2/v02/paid/entitlement.js`, 판매 스위치 `SALES_OPEN` | V7 SEC-01~12·PAY-01~10 테스트 스위트 |

### 4-3. Pleos 플랫폼 공식 정책 (2026-09-27 공식 문서 확인 → `docs/pleos/VERIFIED_POLICY.md`)
| 확인됨 (document.pleos.ai · pleos.ai/playground, 공개) | 확인 안 됨 (공개 문서에 없음) |
|---|---|
| 스토어 = Pleos App Market, "누구나 개발·출시" 취지, 2026-09 기준 18종·날씨 앱 없음 | 개인/법인 계정, 등록비, 수수료, 심사 기간 |
| 앱 형태 = **네이티브 AAOS APK**(minSdk 28, 에뮬레이터 API 34, APK < 600 MB) | **WebView·웹앱·TWA 허용 여부**, 차량에 Chrome/WebView 탑재 여부 |
| 주행 판정 = 기어+속도. **주행 선언(DO) 안 한 앱은 P 가 아니면(정차 포함) 종료** | **날씨·정보 앱의 DO 선언 자격** |
| 카테고리 8종, 주행 중 예외는 내비·모빌리티·음악뿐. 날씨 카테고리 없음 | 날씨 앱의 카테고리 배정(Lifestyle 추정) |
| 주행 중: 애니메이션·영상·긴 스크롤·복잡한 입력 금지, 메시지 ≤3줄, 터치 ≥12.5 mm | Car App Library 템플릿 호스트 제공 여부 |
| 심사: **실행 ≤10초·콘텐츠 로드 ≤10초**, 버튼 반응 ≤2초, 호환 모드 금지, 세로·가로 두 레이아웃, 더미 데이터 금지, Vehicle SDK 권한은 사전 합의분만, **위치 서비스는 신고 증빙 요구 가능** | 에뮬레이터 이미지(비공개, partnership@pleos.ai 요청) |

---

## 5. 트랙 PL — Pleos 차량 앱 (v1 기반 · EARTHUS 전용)

### PL0. 공식 정책 확인 → `docs/pleos/VERIFIED_POLICY.md` — **1차 완료(2026-09-27, 공개 문서)**
- 공개 문서로 확인한 것은 §4-3. 남은 빈칸 7개는 `VERIFIED_POLICY.md` §6 의 질문으로 **partnership@pleos.ai 에 PD 가 보낸다**(외부 발송이라 개발이 대신하지 않는다). 특히 ① WebView 허용·탑재 ② 날씨 앱 DO 자격 ③ 에뮬레이터 이미지.
- 답이 오기 전 설계 전제(보수적): **네이티브 셸 + 주차 중 전용 + 웹 화면은 로컬 번들을 WebView 로.** WebView 가 불가로 답이 오면 PL4-(나)로 전환.
- **완료 기준:** 7개 질문의 답이 `VERIFIED_POLICY.md` 에 출처와 함께 기록됨.

### PL1. 기능 이름 목록 + 단일 안전 게이트 (fail-closed)
- 새 파일 `prototype/js/pleos/driving-actions.js` — 얼린 enum: `MAP, CURRENT_WEATHER, DISASTER_ALERT, DIRECTIONS, SATELLITE_PLAYBACK, TIME_PLAYBACK, LOCAL_DISCOVERY, FORECAST, RESERVATION, COUPON, VIDEO_PLAYBACK, KEYBOARD_SEARCH, COMPLEX_FILTER, SETTINGS` + 별칭 표(`time-playback`→`TIME_PLAYBACK`, `local_explore`→`LOCAL_DISCOVERY` 등). 별칭에 없는 이름은 `UNKNOWN_ACTION`.
- 새 파일 `prototype/js/pleos/driving-safety.js` — `decide({drivingState, action, context})`:
  - 상태 `PARKED | DRIVING | RESTRICTED | UNKNOWN`, 기본값 UNKNOWN, **UNKNOWN 은 DRIVING 과 같은 정책**
  - DRIVING/RESTRICTED/UNKNOWN 에서 허용 = `MAP, CURRENT_WEATHER, DISASTER_ALERT, DIRECTIONS` 뿐, 나머지·UNKNOWN_ACTION 은 BLOCK
  - PARKED 에서도 `RESERVATION`·`COUPON` 은 BLOCK(실제 기능 없음, DT 참조)
  - 우선순위 `SAFETY > SYSTEM > CURRENT_ENVIRONMENT > USER_SELECTION > LOCAL_DISCOVERY > COMMERCIAL`: 기상청 특보 중이면 여가·상업 발견 억제
- ⚠️ 1차(주차 전용, §PL3)에서는 앱이 주행 선언을 하지 않으므로 **PARKED 가 아닌 모든 상태 = 전부 BLOCK** 으로 설정한다(`DRIVING_ALLOWLIST_ENABLED=false`). 위 네 가지 허용은 Pleos 가 DO 자격을 확인해 준 2차에서만 켠다. V38.1 §14 의 ALLOW 테스트 4건은 2차 계약으로 유지하고, 1차 설정에서는 같은 4건이 BLOCK 인지도 시험한다.
- **실행 함수에서 재검증:** 버튼 숨김과 별도로, 각 동작 핸들러가 실행 직전에 `decide()` 를 부른다(`guardAction(action, fn)` 래퍼).
- 테스트 `tools/test_pleos_safety.mjs`(node:test, `npm test` 에 추가): V38.1 §14 Safety 14건 그대로 + 별칭 우회 시도 + 특보 override.
- **완료 기준:** 14건+ 전부 실제 실행 PASS, 모르는 이름이 한 건이라도 ALLOW 되면 FAIL.

### PL2. 제품 분리 — Pleos 빌드 대상
v1 코드에 AETHERUS 가 정적으로 물려 있어(§4-2) "Pleos 에서 숨기기"로는 안 된다. 구조:
1. **부팅 핵심 분리:** `main.js` 의 boot 순서(viewer→power→sceneMgr→renderQuality→panels→layerBar→weather→myLocation→registry) 중 제품 공통 부분을 `prototype/js/boot-core.js` 로 뺀다. `main.js` 는 core + AETHERUS/우주/물어보기 lazy 를 그대로 유지(웹·TWA 동작 불변).
2. **Pleos 진입점:** `prototype/pleos/index.html` + `prototype/js/pleos/pleos-main.js` = boot-core + Pleos 전용 패널. `space/route-state.js`·`layers/space.js`·`ui-sat.js`·`ui-aetherus.js`·`spaceops/`·`cosmic3d`·`ask-earth`·`brief.js` 를 import 하지 않는다.
   - `registry.js` 가 `layers/space.js` 를 정적으로 가져오므로 레지스트리를 "레이어 정의 주입형"으로 바꾸거나 Pleos 용 레이어 목록을 따로 준다(둘 중 작은 변경을 PL2 착수 때 코드로 확인해 고른다).
   - Pleos 의 '위성' 메뉴 = 구름(GMGSI)·GK2A·Himawari 관측 영상만 (`imagery.js` 에서 재사용).
3. **빌드:** `tools/build-pleos-bundle.mjs` — Pleos 진입점에서 import 그래프(정적+동적)를 따라가 파일 목록을 만들고 `build/pleos-app/` 에 복사 + `tools/manifests/pleos-files.tsv` 생성. 금지 경로(`js/aetherus/`, `js/space/`, `js/spaceops/`, `ui-aetherus.js`, `ask-earth.js`, 연구·Simulation 모듈)가 그래프에 나오면 **빌드 실패**.
4. **결과물 검사 테스트** `tools/test_pleos_product_separation.mjs`:
   - 행렬: EARTHUS+PLEOS/WEB/MOBILE PASS, AETHERUS+WEB/MOBILE PASS, **AETHERUS+PLEOS REJECT**
   - `build/pleos-app/` 전체에서 `AETHERUS`·`aetherus`·`/aetherus/api`·`spaceops`·`?spaceops`·analytics `aetherus.`·`space.` 이벤트 0건
   - 웹 빌드(`build/public-app`)에는 AETHERUS 가 **있어야** PASS (지우는 방향 회귀 방지)
   - Pleos 번들에 `node:` import 0건, 57 POI fixture 경로 0건
- **완료 기준:** 위 테스트 실제 실행 PASS + Pleos 진입점을 브라우저로 열어 빈 화면 아님(콘솔 오류 0) 캡처.

### PL3. 주차/주행 화면
- 주행 상태 공급자 `prototype/js/pleos/driving-state.js`: 네이티브 셸이 AAOS `CarUxRestrictionsManager`(Pleos 문서가 안내하는 표준 API) 값을 JS 로 넘긴다. 공급자가 없거나 끊기면 **UNKNOWN**(= 주행 정책).
- **1차 — 주차 중 전용:** PARKED 화면 = v1 지구 + 7개 도크(Earth·Weather·Satellite·Ocean·Atmosphere·Disaster·Local) + 장소 카드 + Intelligence 전체. 앱은 DO 를 선언하지 않는다 → P 를 벗어나면 OS 가 앱을 닫는다(Pleos 규칙). 그래도 PL1 게이트는 그대로 둔다(OS 종료 전 짧은 틈·상태 신호 끊김 대비, V38.1 §3 "UI 숨김만으로 끝내지 말 것").
- **2차 — 주행 화면(Pleos 가 날씨 앱 DO 자격을 확인해 줄 때만):** 네이티브(WebView 아님) 정적 화면: 지금 날씨 한 줄 · 기상청 특보(R-DIS) · 길안내 연결 버튼 · Intelligence `short`(≤2문장, Pleos 한도 3줄). 애니메이션·지구 회전·목록·입력·타임라인 없음. 터치 ≥12.5 mm, 대비 ≥4.5:1.
- Pleos 화면 구조: 세로(한 영역)·가로(두 영역) 두 레이아웃 모두 — 호환 모드로 뜨면 불합격.
- **완료 기준:** 브라우저에서 상태 네 가지를 흉내 내 화면 캡처 + 주행 상태에서 금지 동작 직접 호출 시 BLOCK 로그 + 두 레이아웃 캡처.

### PL4. 포장·실기기
- 새 디렉터리 `apps/pleos-aaos/` (Kotlin, minSdk 28, Gradle 8+). 지금의 `apps/android-twa`(폰용 TWA)와 **따로** 둔다 — TWA 는 차량에 Chrome 이 있어야 뜨고, 폰 레이아웃은 호환 모드 불합격 위험.
- (가) WebView 허용 답 → 네이티브 셸 + `build/pleos-app` 로컬 번들을 WebView 로(로컬 우선: 행정구역·정적 POI·바탕 지도 기준은 APK 안). 네트워크는 실시간 날씨·대기·해양·위성·특보만.
- (나) WebView 불가 답 → 주차 화면도 네이티브로 다시 그려야 한다 → 범위가 크게 바뀌므로 **PD 보고 후 재계획**.
- 심사 수치 먼저 잰다: 실행 ≤10초·콘텐츠 로드 ≤10초(v1 지구 첫 화면 시간을 에뮬레이터에서 측정), 위치 서비스 신고 증빙(위치정보법 — 유료 점검 L5 와 같은 건).
- 에뮬레이터 이미지가 오기 전에는 BUILD 까지만, DEVICE 는 NOT VERIFIED.
- 보고서의 검증 등급을 나눠 적는다: SOURCE-LEVEL / BUILD / BROWSER / DEVICE / PLEOS HARDWARE. 실기기가 없으면 DEVICE·HARDWARE 는 **NOT VERIFIED**.

### PL 산출 보고서
작업 끝에 `V38_1_ACTUAL_SOURCE_AUDIT_REPORT.md`(V38.1 §16 형식 12항목)를 `docs/pleos/` 에 쓴다. 이 계획서 §4 가 그 1항(저장소 조사 결과)이 된다.

---

## 6. 트랙 DT — 자료 신뢰 · 장소 카드 · Context 규칙

### DT1. 신선도 표준 어댑터 (기존 코드는 안 바꾼다)
- 새 파일 `prototype/js/data-trust-status.js`: 기존 6종 어휘(`deriveFreshnessState` LIVE/STALE/UNAVAILABLE, `warningFreshness` FRESH/AGING/STALE/FUTURE/UNKNOWN, `OCEAN_QUALITY`, `vessel-lite` EXPIRED, `aetherus` EMPTY, KTO STALE)를 V38.1 §12 의 `FRESH | STALE | EXPIRED | UNAVAILABLE | ERROR` 로 매핑. 필드 `source, observedAt, issuedAt, validFrom, validUntil, receivedAt, processedAt, freshnessSec, status`.
- 규칙: 공급 실패 → `ERROR`/`UNAVAILABLE`, 절대 "특보 없음"·"안전" 아님 / 만료 이벤트 → 활성 아님 / 예약 오류 → "예약 가능" 아님.
- 테스트: 매핑표 전수 + 네 가지 금지 전환 각각.

### DT2. 장소 카드 어댑터
- 새 파일 `prototype/js/place-card-model.js`: 입력 = 기존 v1 지점 시트 자료(`ui.js:491-519`: `place.js lookupPlace`·Open-Meteo·파도) + KTO 관광(`tourism-flow.js`) + 행정구역(`korea-admin-reference.js`). 출력 = V38.1 §6 필드(`id, canonicalId, name, category, coordinates, status, region, source, observedAt, weather, airQuality, marine, sunset, context, safety, actions`).
- 값이 없으면 `null` → 화면은 "알 수 없음". 지어내지 않는다. `actions.reservation/coupon = false`.
- 흐름: POI 선택 → 기존 자료 → 어댑터 → Context·안전 장식(DT3·PL1) → 화면(v1 시트 / Pleos 카드).

### DT3. Context 규칙 (결정적, AI 아님)
- 기존 `prototype/js/earthus2/v11/tourism/why-now.js` 규칙표에 `RAIN_INDOOR, SUNSET_OUTDOOR, GOOD_MARINE, MARINE_SAFETY_OVERRIDE, HIGH_AIR_POLLUTION, EVENT_TODAY` 를 추가. 재난 규칙이 여가·상업보다 항상 먼저.
- 테스트는 기존 `tools/earthus2-v11/tourism.test.mjs` 에 추가.

### DT4. 57 POI fixture 분리
- `ui_PLEOS/06_BUNDLED_DATA_PACKAGE/spatial_v24/POI_MASTER.json` → `tests/fixtures/poi-demo-57.json` **복사**(원본 그대로 둠).
- 테스트: `prototype/` 아래 어떤 파일도 `tests/fixtures` 를 참조하지 않음, 운영 POI 경로(`kto-discovery.json`·`tourism-flow`)는 그대로 존재.

---

## 7. 트랙 IN — Intelligence 문장 UX (v1 · Pleos, 카드 순서는 v2 에도)

### 원칙 (V38.1 + D-2 + R-DIS + R-FC)
- 카드 = **① 자연어 1~3문장 → ② 수치 → ③ 출처·시각** · ⓘ 자세히 보기 = 출처·관측 시각·예보 발표 시각·유효 시간·사용 자료·관측/분석 구분·(있으면) 불확실성.
- 기본 화면에 `NEXT/OBSERVED/DERIVED/CONFIDENCE` 같은 내부 말 금지.
- 문장 재료: 지금 상태 · 왜 · 앞으로 · 알아둘 점 중 **근거가 있는 것만.** 앞으로 문장은 R-FC, 재난은 R-DIS.
- 금지 표현: 단정 예언, '최고·완벽·안전하다'.
- 실패 시: 문장 생성 실패 → 정적 안전 템플릿("자세한 분석을 불러오지 못했습니다") / Intelligence 전체 실패 → 관측 화면은 그대로.

### 구현
- 기존 `narrative.js`(숫자 없으면 문장 없음 규칙)를 **공통 엔진으로 확장**: `prototype/js/intel-sentences/` 아래 도메인별 규칙 모듈 7개(earth·weather·satellite·ocean·atmosphere·disaster·local)가 같은 출력형 `{sentences[], numbers[], provenance, mode:'full'|'short'}` 을 낸다. 새 AI·LLM 호출 없음(규칙·템플릿).
  - weather: `narrative.js` + `weather-summary.js` (체감 원인·강수 변화·평년 백분위)
  - ocean: `place.js lookupWaves/seaState` + 해양 관측
  - atmosphere: 대기질 관측(PM10/PM2.5·바람)
  - satellite: GMGSI/GK2A 프레임의 구름 변화(시각 포함) — AETHERUS 궤도 기능 없음
  - disaster: 기상청 특보 전달 + 공식 행동요령 인용만(R-DIS)
  - local: DT3 Context 규칙 결과를 문장으로("왜 지금 이곳인지")
  - earth: 낮밤·계절 등 가벼운 맥락
- 카드 부품 `prototype/js/intel-card.js` 하나를 v1 시트·Pleos 카드가 같이 쓴다. i18n 한·영.
- v2: `intel-strip.js` 의 WHAT/WHY/NEXT 순서를 D-2 에 맞게 문장→수치→출처로 바꾸는 것만(내용은 v2 규칙 그대로).

### 테스트 (`tools/test_intel_sentences.mjs`) — 결과로 쓴다 (AGENTS.md 일하는 법 2)
V38.1 필수 14건 + 아래 "나와야 통과" 항목:
- 근거 있는 날씨 입력 → **문장이 반드시 나온다**(빈 카드면 FAIL)
- 강수 예보 입력 → 미래형 문장 + 출처 "기상청 단기예보·발표 시각"
- 특보 입력 → "기상청이 … 발표했습니다" 문장, 자체 주의 환기 표현(`가능성이 있어 … 주의`) 0건
- 특보 공급 실패 → "받지 못했습니다" 문장, "없음·안전" 0건
- 예보 자료 없음 → 앞으로 문장 0건 / provenance 없음 → 문장 0건
- short 모드 → 2문장 이하
- 한·영 둘 다 같은 개수의 문장

---

## 8. 트랙 GR — v1 지구 렌더러 (Cesium)

V38.1 렌더러 지시 중 **v1 에 이미 있는 것은 다시 만들지 않는다**: 구름 그림자(`cloud-shadow.js`), 태양 조명·낮밤·대기 조명, 품질 자동 조절(`render-quality.js`), requestRenderMode·30 fps 상한, 페이지 숨김 시 정지.

| 단계 | 할 일 | 파일 | 완료 기준(측정) |
|---|---|---|---|
| GR1 | 지표 선명도: GIBS L8(≈611 m/px) 위에 줌 단계별 고해상 타일(보이는 영역만, `tileCacheSize` 예산 유지). 후보 원천의 상업 이용 조건 먼저 확인(Esri 는 인증·상업 조건 쟁점 — 유료 점검 D 항목) | `imagery.js`, `viewer.js` | 같은 카메라에서 전후 캡처, 초기 로딩 시간 악화 없음 |
| GR2 | 조작/정지 품질 분리: 입력 중 `resolutionScale`·구름 그림자 갱신 낮추고, 멈추면 복원 | `render-quality.js`, `power.js` | 회전 중·정지 후 프레임 비용 기록 |
| GR3 | FPS 기준 표(55/45/30) ↔ 지금의 프레임 비용(22 ms/8 ms) 기준 대응표를 문서화하고, 품질 저하 순서(그림자 갱신 → 구름 해상도 → 대기 → 지표 → 지형) 적용 | `render-quality.js` | 저하·복원 순서 로그 |
| GR4 | 구름 신선도: `cloudTime()` → DT1 상태 → 오래된 구름에 시각 배지("3시간 전 영상"), 현재처럼 보이지 않게 | `imagery.js`, `data-trust-status.js` | 오래된 meta 로 시험 시 배지 표시 |
| GR5 | 바다 반사광: Cesium 은 워터 마스크가 지형 공급자에 묶임 → 지형 없이 가능한 방법(바탕 영상 기반 마스크 + 조명) 검토 후 PD 에 보여주고 결정 | `viewer.js` | 캡처 비교 |
| GR6 | 렌더러 상태 API(구름 덮임·태양 위치·낮밤·보이는 영역)를 IN 이 읽을 수 있게 | `renderer-state.js`(신규, 읽기 전용) | IN satellite/earth 문장이 사용 |
| — | **하지 않는다:** 8K/16K 한 장, 모든 지역 고해상 선다운로드, 매 프레임 CPU 그림자, 무한 애니메이션(AGENTS.md), 지형 교체 | | |
| — | **Pleos:** 주행 중 3D 회전·빠른 줌 잠금(PL3), 품질 프로파일 MEDIUM 기본 | | |

⚠️ "구름이 지표와 분리된 층"은 Cesium 에서 imagery 가 아닌 별도 구체(프리미티브)가 필요해 비용이 크다. GR 에서는 **그림자·신선도·선명도를 먼저** 하고, 분리 층은 GR1~4 측정 뒤 별도 제안한다. v2-three 는 이미 분리 구름 구·그림자가 있다(참고용).

---

## 9. 트랙 RS — 연구·Simulation 브라우저 (V7, D-5·D-6 결정 후 시작)

V7 의 V7-03 Phase 표를 그대로 따르되 번호 앞에 RS 를 붙인다. V7-04 금지선(P4 전 데스크톱·Space 본격 개발 금지, Simulation UI 만 늘려 완성 선언 금지, 브라우저 타이머 Monitoring 금지, localStorage 권한 금지)은 그대로 유지한다.

| Phase | 목표 | 이 저장소에서 쓰는 것 | 저장소 사정으로 더한 조건 |
|---|---|---|---|
| RS-P0 | 기준선 회귀 | v1·v2 기존 테스트(`npm test`), Playwright 스크립트 | R0 완료 뒤 |
| RS-P1 | 공통 계약: Project·Dataset Manifest·Artifact·State·Provenance·Entitlement | `earthus2/v02/core/*`(canonical-signal·trust-ledger), `paid/entitlement.js`, 서버 `play-verify` | 새 계약은 기존 core 를 확장, 중복 금지 |
| RS-P2 | History + Compare (COMP-01~06) | v1 `research.js` 예보 검증, v2 Compare 부품 | |
| RS-P3 | 한강 홍수 자료 수직 절편 | KMA ASOS/AWS(허브 용량 공유 주의 — 메모리 kma-hub), 서울 강우·수위, K-water | ⚠️ **V7 이 제안한 Copernicus GLO-30 은 DSM(건물·나무 포함)** — 2026-09 해수면 침수 시험에서 DSM 은 도심이 3~7 m 높게 나와 '안 잠김'이 됐다. 도시 홍수에는 **맨땅 DTM**(국토지리정보원 수치표고 등, 이용 조건 확인)이 선행 |
| RS-P4 | 홍수 Simulation 실제 실행 | 새 worker(AWS, 기존 Lambda 관례) + 모델 컨테이너 | LISFLOOD-FP 는 GPL 계열 → 호스팅 서비스 배포 조건 법무 확인이 P4 착수 조건 |
| RS-P5 | Validation + Reproduce | 관측소 시계열 | |
| RS-P6 | 유료 여정(PAY-01~10) | `billing.js`·`play-verify`·`SALES_OPEN` | 2027-01-01 유료 일정·창립 멤버 반값 서버 경로와 맞춤 |
| RS-P7 | Monitoring/Alert (MON-01~07) | 기존 알림 지점(`alert_spots`) | ⚠️ 날씨 조건 알림은 R-DIS: 사용자가 정한 **관측값 조건**("수위 X m 넘음")은 가능, 우리 예측으로 재해를 경고하는 알림은 불가(제48조). 위치 저장은 위치정보법 쟁점(유료 점검 L5) |
| RS-P8 | Space Traffic | → 트랙 SP | |
| RS-P9·P10 | Windows·macOS 런타임 | — | P4 통과 전 착수 금지(V7-04) |
| RS-P11·P12 | 고급 Simulation · 상용 출시 | — | PAID-READY 관문 |

Release State 5단계(DESIGNED → IMPLEMENTED → VERIFIED → RESEARCH-READY → PAID-READY)와 SEC-01~12·PAY-01~10 은 RS·SP 모든 기능에 붙인다. **PAID-READY 가 아닌 기능은 유료 상품 페이지에 "사용 가능"으로 올리지 않는다.**

---

## 10. 트랙 SP — Space Traffic (AETHERUS 제품, Pleos 절대 제외)

- V7 은 우주를 "위성·관측 도메인 안"에 넣지만, V38.1 은 궤도·발사·우주쓰레기를 **AETHERUS 제품**으로 분리한다. 이 계획은 V38.1 을 따른다: SP 는 AETHERUS(웹·모바일) 코드(`prototype/js/aetherus/`, `services/aetherus-orbital`)에서 하고, PL2 의 분리 테스트가 Pleos 유입을 막는다.
- "500" 의 실체: `layers/space.js:428` `satsCapped` 렌더 상한 + CelesTrak 비상용 경로. V7 S0(현재 500 감사)이 첫 단계.
- 순서: V7 대로 **RS-P4 통과 뒤 본격 개발**. S0 감사(코드·자료 원인 규명, 샘플 20개 저장)만 먼저 해도 된다.
- 충돌확률(Pc)은 공분산 입력이 없으면 **표시하지 않는다**(V7 P7). 발사 '안전 허가'처럼 보이는 문구 금지.

---

## 11. 전체 순서 정리 — 초안 (D-8, PD 와 같이 확정할 것 · 코딩 없음)

이 계획서의 트랙만이 아니라 **지금 저장소에 걸린 모든 줄**을 한 줄로 세운다. 개발자 1명 기준, 동시 진행 2개 이하(계약 §I · 사다리 L-7).

### 11-1. 날짜가 박힌 것 (움직일 수 없음)
| 날짜 | 무엇 | 출처 |
|---|---|---|
| 2026-09-30 14:00 | 한국관광 데이터랩 경진대회 접수 (`EARTHUS TRAVEL DISCOVERY`) — **아직 내는지 PD 확인** | 메모리 competitions |
| 2026-11 | Phase 2 앱 안 결제 · 비공개 테스트 | 유료 점검 §00-4 |
| 2026-12 | 기상예보업 등록 · Play 상품 등록 · 공개 출시 | 유료 점검 §00-4 |
| **2027-01-01** | **유료 시작** | AGENTS.md · HANDOVER §8 |

### 11-2. 줄 세우기 (초안)
```
[지금 ~ 12월]  2027-01-01 유료에 필요한 것 — 다른 모든 줄보다 앞
  A. 유료 관문   Open-Meteo 대체/계약(10월, 가장 긴 줄) · Phase 2 결제(11월) · 약관·처리방침 ·
                 판매 스위치 조건 · 안드로이드 앱(v1+v2)·크롬 새 탭 출시
  B. v2 기반     계약 §I  R0 → P0 → P1+M1+T → §14 1차   (R0 진행 상태는 같이 확인)
                 └ IN 의 v2 몫(카드 순서 문장→수치→출처, D-2)은 P1 의 intel-strip.js 작업에 합친다

[1월 이후]
  C. v1 Intelligence (IN v1 7도메인) + DT(신선도·장소 카드·Context)   — 무료 v1 품질, Pleos 의 재료
  D. Pleos (PL)   partnership@pleos.ai 답이 온 뒤. 재료는 C 가 만든다
  E. v1 렌더러 (GR)
  F. v2 전용 브라우저 Windows·Mac (V7)   — 기획 먼저. 계약 §I 의 S-A(표류·ScenarioCompare·simulation_link.py)와
                 공통 계약(SimulationRunRecord)을 다시 만들지 않고 이어 쓴다
  G. Space Traffic (SP, AETHERUS)   — V7 대로 F 의 첫 Simulation 이 실제로 돈 뒤
```

### 11-3. 같이 정할 것 (기획 회의 안건)
1. 9/30 데이터랩 대회 — 낸다/안 낸다
2. 10~12월에 A(유료 관문)와 B(계약 §I) 중 무엇에 먼저 사람을 쓰나 — 둘 다 1/1 에 걸린다
3. **v2 의 첫 Simulation 이 무엇인가** — 계약 §I 은 표류(S-A)·쓰나미, V7 은 한강 홍수. 둘 다 할 수는 있지만 순서를 정해야 한다(한강 홍수는 맨땅 DTM·모델 라이선스가 선행)
4. v2 전용 브라우저(F)의 시작 시점 — 1/1 이후로 보는 게 맞는지, 셸 방식(Electron/Tauri 등)은 그때
5. Pleos(D)를 1/1 전에 당길 이유가 있는지 — 없으면 답 도착 후

각 단계는 착수 뒤 **변경 파일 → 구현 → 테스트 실제 실행 → 브라우저 확인 → 배포 → 커밋** 순서(AGENTS.md·메모리 규칙). 실패하면 다음 단계로 가지 않는다.

---

## 12. 공통 검증 규칙

- PASS 는 실제로 실행한 테스트에만 쓴다. 못 한 것은 NOT VERIFIED.
- 검증 등급을 나눠 적는다: SOURCE-LEVEL / BUILD / BROWSER / DEVICE / PLEOS HARDWARE.
- 모든 테스트는 저장소 상대 경로만(`../../` 로 패키지 밖, `C:\`, `D:\`, `/mnt`, `/home` 금지) — `rg` 로 검사하는 테스트를 하나 둔다.
- 배포 스크립트는 확인용으로 실행하지 않는다(메모리 never-run-deploy-to-test). Pleos 빌드는 `build/pleos-app/` 로컬 산출까지만, 운영 업로드 없음.
- 같은 브랜치에 다른 세션의 미커밋 변경이 있다 — 커밋은 내 hunk 만(메모리 partial-stage-trap). 서브에이전트에 파괴적 git 금지.

---

## 13. 위험

| 위험 | 영향 | 대응 |
|---|---|---|
| Pleos 가 WebView 를 허용하지 않거나 차량에 없음 | 주차 화면까지 네이티브 재작성 — 범위 급증 | 질문 ①을 먼저 보내고, 답 전에는 PL1·PL2(웹에서도 쓰이는 부분)만 진행 |
| 날씨 앱에 DO 자격이 없음 | 주행 중 화면 없음(주차 전용) | 1차를 주차 전용으로 설계했으므로 출시에는 지장 없음 |
| 에뮬레이터 이미지를 못 받음 | 기기 검증 불가 | BUILD·BROWSER 까지만 PASS, DEVICE 는 NOT VERIFIED 로 보고 |
| v1 첫 화면이 10초 넘음 | 심사 불합격 | PL4 에서 먼저 측정, 넘으면 로컬 번들·지구 먼저 표시(v2 로딩 원인 분석과 같은 방식) |
| 주행 상태 신호 끊김 | 판단 불가 | UNKNOWN=주행 정책이라 안전은 유지 |
| `boot-core` 분리가 v1 부팅을 깨뜨림 | 운영 v1 회귀 | 분리 전후 v1 캡처·콘솔 오류 0·기존 테스트 전부 PASS 를 PL2 완료 조건에 포함 |
| 한강 홍수에 쓸 DTM·모델 라이선스 | RS-P3/P4 지연 | P3 착수 전 DTM 원천·이용 조건 확정, P4 착수 전 모델 라이선스 확정 |
| 고해상 지표 원천의 상업 조건 | GR1 지연 | 유료 점검 문서 D 항목과 같이 처리 |

---

## 14. 승인 요청

1. 이 계획서 승인 (트랙 PL·DT·IN·GR 착수)
2. §3 D-5 ~ D-8 답 (트랙 RS·SP 착수 조건)
3. PD 가 partnership@pleos.ai 에 `docs/pleos/VERIFIED_POLICY.md` §6 질문 7개 발송 (PL4 착수 조건)

---

## 15. 메뉴 통합 — v1 = v2 같은 메뉴 + 둘 다 자연어 안내 (2026-09-27 PD 요청 · 검증 결과 · 코딩 없음)

**PD 요청:** "v1 과 v2 메뉴를 통합할 거야. 개발지시서대로 메뉴 통합 리스트가 맞는지 검증하고, v1·v2 메뉴 둘 다 똑같이 나오게, 인텔리전스 자연어 안내가 둘 다 나와야 한다."
**지시서의 통합 목록** = `ui_PLEOS/08_UI_ADAPTER_V36/core/EARTHUS_UI_ADAPTER_V36.mjs` `DOCKS` 7 × `PANEL_BY_DOCK` 4 = 28칸 (V38.1 본문의 Earth·Weather·Satellite·Ocean·Atmosphere/Air·Disaster·Local 과 일치).
**검증 방법:** 운영 화면 직접 측정(earthus.net · earthus.net/v2, 2026-09-27 00:3x) + v1·v2 코드 대조(파일:행).

### 15-1. 지금 실제로 보이는 메뉴
| | v1 (earthus.net) | v2 (earthus.net/v2) |
|---|---|---|
| 1차 메뉴 | 하단 바: 전체레이어 · 인공위성 · 경보·재난 · Intelligence · 지구 · 내 위치 · 전지구로 (`index.html:634-736`) | 왼쪽 서랍 묶음 6: 대기 · 바다 · 재해 · 눈·얼음 · 대기질·관측 · 생태·사람·여행 (`phenomenon-registry.js:1077-1145`) + 하단 탭 5: 지금 · 탐색 · 내 지역 · 리포트 · 우주 (`ui-shell.js:1073-1079`) + EARTHUS/AETHERUS 세로 탭 |
| 레이어 | `CATEGORIES_LEAN`(`layerbar.js:553-562`) 바탕·기상·대기질·해양만. 구름 위성 4 · 기상 6 · 대기 7 · 바다 5 | `SCENES`(`ui-shell.js:38-244`) 9 장면 |
| 숨김/뒷문 | 읽고 분석·활동 섹션 hidden, 숨긴 레이어도 **검색으로는 전부 열림**(`search.js:318`), `volcano`·`stations`·`orbits` 는 정의만 있고 입구 없음 | — |
| ⚠️ 문서와 다름 | — | **AGENTS.md 의 '좌측 11메뉴 레일'은 코드에 없다**(DEV-DIRECTIVE 2026-09-20 서술만). 화면은 09-13 §3.2 묶음 6개 |

### 15-2. 28칸 검증표
V=보임 · I=간접(시트 안) · S=검색으로만 · H=숨김 · A=없음 · 문장=지금 자연어 문장이 나오는가

| 도크·칸 | v1 | v2 | 문장 v1/v2 | 판정 |
|---|---|---|---|---|
| earth·world | V 전지구로 | V globe | ✗/✗ | 유지 |
| earth·city | A (검색뿐) | A (검색·인구탑) | ✗/✗ | **정의 필요** — '도시 찾기(검색)'로 할지 |
| earth·time | A (시계 표시만, 태풍 스크러버) | V 타임라인 | ✗/✗ | **칸에서 뺌 → 모든 메뉴 공통 하단 타임라인**(AGENTS.md 규칙). v1 에 타임라인 신설 필요 |
| earth·day-night | 항상 켜짐(토글 없음) | V 실제 태양·타임라인 따름 | ✗/✗ | 유지(토글) |
| weather·current | V 시트+기온·습도·바람 | V 기온 GFS·AWS 실측 | **✓**(narrative·weather-summary)/△(기온 편차 패킷만) | 유지 |
| weather·forecast | I 14일 탭 | V GFS 5일·3시간 | 예보 메모/✗ | 유지 — v1 은 기상청 단기예보 전달(R-FC), v2 는 모델명·실행 시각 |
| weather·hourly | I 24시간 띠 | **A**(수집기 kma-fcst 는 있음) | ✗/✗ | **forecast 안으로 합침** |
| weather·region | A (koreaPanel 간접) | A (내 지역) | ✗/✗ | **local·nearby 와 겹침 → 합침** |
| satellite·clouds | V 위성 4종 | V GMGSI·GK2A | 캡션/✗ | 유지 |
| satellite·radar | I koreaPanel 안 사진+프레임 | 카드 안 사진만 | ✗/✗ | **위성이 아님 → weather·'강수 레이더(한국)'로 옮김.** 지구 위 겹침은 두 앱 다 없음(좌표 맞춘 레이더 자료 필요) |
| satellite·infrared | 부분(밤 자동 IR, 전용 채널 S) | V GK2A IR·수증기·안개 | 캡션/✗ | 유지 |
| satellite·time-playback | A | GFS **모델** 재생만, 관측 위성 되감기 없음 | ✗/✗ | **공통 타임라인에 흡수.** 관측 영상 되감기는 이력 프레임 저장부터(kma-radar 만 이력 있음) |
| ocean·wave | V 파고·너울 | V (Open-Meteo 5°) | 한 단어 해상 등급/△(For-Me) | 유지 — Open-Meteo 상업 조건(유료 점검 D1) |
| ocean·water-temp | V SST·편차 | V OISST·Argo·부이 | 캡션/**✓**(SST 패킷) | 유지 |
| ocean·wind | 기상에 있음 | 기상(대기)에 있음 | — | **중복 → 뺌**(해상풍이 따로 필요하면 나중) |
| ocean·currents | V (Open-Meteo 5°) | V (Open-Meteo 5°, 모델 신호) | 캡션/✗ | 유지 — 모델 배지 필수, '조류'라 부르지 않음 |
| air·pm10 | V | **A**(자료 air.json 있음) | 캡션/✗ | 유지 — v2 에 추가 |
| air·pm2.5 | V + 실측 673소 | V CAMS·에어코리아 | 캡션/✗ | 유지 |
| air·uv | V | V(옛 5° 램프) | 캡션/✗ | 유지 |
| air·pressure | 기상에 있음 | 대기에 있음 | ✗/✗ | **대기질이 아님 → weather 로 옮김** |
| disaster·alerts | V 기상경보·지금 일어난 일 | V KMA·NWS·쓰나미 | 목록만/✗ | 유지 — 문장은 R-DIS(특보 전달·공식 행동요령만) |
| disaster·typhoon | V | V 공식 진로·ENS·유사 태풍 | 고정 설명/**✓** | 유지 |
| disaster·earthquake | V (USGS) | V | USGS 문구 전달/**✓** | 유지 |
| disaster·wildfire | V (FIRMS) | V FIRMS·산림청 | ✗/✗(레지스트리만 true) | 유지 |
| local·nearby | V 내 위치 | V 내 지역 | **✓**/△(For-Me) | 유지 |
| local·korea | I koreaPanel | A | ✗/✗ | **정의 필요** — v1 koreaPanel(기상청 97지점·레이더·특보·생활)을 '한국 상세'로 공용화 |
| local·travel | H | V (KTO) | 근거 문구/✗ | 유지 — v1 숨김 해제 |
| local·content | A (뉴스는 경보 안) | V 뉴스·리포트 | 뉴스 요약/✗ | **정의 필요** — '소식'(뉴스) 로 할지 |

**요약:** 28칸 중 그대로 쓸 수 있는 칸 17 · 옮김/합침/뺌 8(time·time-playback·hourly·region·radar·ocean wind·pressure, day-night 토글화) · 정의 필요 3(city·korea·content).
**자연어 문장이 지금 나오는 칸:** v1 = weather·current, local·nearby (+예보 메모) / v2 = typhoon·earthquake·water-temp·기온 편차 (+For-Me 파도·쓰나미). **나머지 20여 칸은 두 앱 모두 문장이 없다.**
**카드 순서:** v2 는 지금 수치 → 출처 → WHY → NEXT(`point-card.js:195-279`, `ui-shell.js:1378` "문장이 수치보다 앞에 서지 않는다") — D-2 에 따라 **문장 → 수치 → 출처로 뒤집어야 한다.**

### 15-3. 28칸 밖인데 두 앱에 있는 것 — 어디 둘지 정해야 함
| 항목 | v1 | v2 | 초안 |
|---|---|---|---|
| 낙뢰 · 쓰나미 · 화산/각국 재해 · 열돔 | V (경보·재난) | V (재해) | disaster 에 추가 |
| 황사·먼지 · 오존 · 대기질(유럽) | V | 일부 | air 에 추가 |
| 습도 · 수증기 · 토양 수분 | V | 일부 | weather 에 추가 |
| 우주(AETHERUS: 궤도·우주쓰레기·발사·오로라·태양계) | V 인공위성 | V 우주 탭·AETHERUS 서랍 | **7 도크 밖, EARTHUS/AETHERUS 탭으로 분리**(웹·모바일만, Pleos 제외) |
| 눈·얼음 · 해수면 상승·침수 · 지형·수심·해구·심해 | 일부(심해 장면) | V | 정해야 함 — earth 또는 ocean 에 넣을지, 새 도크(8번째)를 둘지 |
| 생태(숲·철새·바다거북) · 인구 · 혼잡 · 밤의 불빛 | 일부 숨김 | V | 정해야 함 — local 에 넣을지 |
| 취미(서핑·낚시·산·패러) · LAB · 항공편 | H | V | 정해야 함 |
| Compare · Simulation · 리포트 | — | V | **v2 만의 깊이**(7단계 ⑤·⑦) — 메뉴 틀은 같게, 이 입구만 v2 에 |

### 15-4. 개발 방법 (코딩은 목록 확정 뒤)
1. **공통 메뉴 정의 하나:** `prototype/js/menu-canon.js`(가칭, 얼린 ES 모듈) — 도크·칸·이름(한·영)·순서·아이콘(아이콘 시스템 v1.2)·연결 레이어 id(v1 id / v2 id)·자료 출처(앱별)·자료 없음 사유. v1 `layerbar.js` 와 v2 `ui-shell.js` 가 **둘 다 이 파일만 읽어** 같은 메뉴를 그린다(v2 는 이미 `/js/` 공용 모듈을 쓰는 규약 — 메모리 v2-ext-scene). 레이어 id 는 개명하지 않는다(메모리 v2-phenomenon-registry).
2. **자연어 카드 공통 부품:** `prototype/js/intel-sentences/`(도메인 7 규칙) + `intel-card.js`(문장 → 수치 → 출처·시각, ⓘ 자세히). v1 `narrative.js` 규칙(숫자 없으면 문장 없음)을 뼈대로, v2 패킷(태풍·지진·SST·기온 편차)은 같은 카드에 싣는다. 규칙 R-DIS·R-FC 적용.
3. **시험(결과로):** 28칸(확정본) 각각 — v1·v2 메뉴 목록이 같은가(자동 비교), 근거가 있는 입력에서 문장이 **나오는가**, 근거 없으면 문장이 없는가, 특보 문장에 자체 주의 표현이 없는가.
4. **배포:** v1 → v2 순서, 운영 화면에서 두 메뉴를 같은 방법(이번 측정 스크립트)으로 다시 재서 같음을 증명.
5. Pleos 는 이 통합 메뉴를 그대로 쓰되 AETHERUS 탭·v2 깊이 입구가 없다.

### 15-5. PD 와 정할 것
1. "똑같이"의 범위 — 권고: **메뉴 틀·이름·순서·자연어 카드는 같게, 깊이(5일 예보 재생·Compare·Simulation·리포트)는 v2 만.**
2. 28칸 판정(옮김 8 · 정의 3) 받을지
3. 15-3 표의 '정해야 함' 항목 위치 (8번째 도크를 둘지 포함)
4. 우주 = EARTHUS/AETHERUS 탭 분리(지금 v2 방식) 로 갈지
5. v1 에 하단 타임라인을 새로 둘지 (earth·time 을 공통 타임라인으로 옮기면 필요)
6. AGENTS.md 의 '좌측 11메뉴'·'v1 과 v2 는 다른 서비스' 문구를 통합 메뉴 결정에 맞게 고칠지

---

## 16. 화면 모양 — 넓은 화면 한 벌 · 폰 세로 한 벌 (2026-09-27 PD)

**PD:** "플레오스 버전은 갤럭시 폴드8, 아이폰 듀오에도 동일하게 진행되는 거야. 스마트폰 세로 디자인은 다르게 들어가고."

| 레이아웃 | 어디에 | 모양 (V36·V37 계약과 같은 구분) |
|---|---|---|
| **WIDE** (Pleos 디자인) | Pleos 차량 화면 · 갤럭시 폴드8 펼친 화면 · 펼치는 아이폰(PD 표현 '아이폰 듀오') · (태블릿·PC 창도 같은 판정이면 여기) | 7 도크 + **떠 있는 패널**(Floating Panel) + 장소 카드. Pleos 규칙대로 한 영역(세로 넓은 화면)·두 영역(가로) 두 모양 |
| **PHONE** (다른 디자인) | 스마트폰 세로 · 폴드 접은 커버 화면(가정 — PD 확인) | 같은 7 도크·같은 자연어 카드를 **아래에서 올라오는 시트**(Bottom Sheet)로 |

- 판정은 **기기 이름이 아니라 화면 모양**으로 한다(너비·가로세로 비율·접힘 자세 CSS `@media`·`viewport-segments`). 기기별 분기 코드를 두지 않는다 → 새 폴더블이 나와도 그대로 맞는다.
- **같은 것:** 메뉴(§15)·자연어 카드·출처 표기는 WIDE·PHONE 모두 같다. 달라지는 것은 배치뿐.
- **Pleos 만 다른 것:** 주행 안전 게이트(PL1)·AETHERUS 없음·AI·Simulation 없음. 폴드·아이폰은 **MOBILE 제품**이라 V38.1 행렬대로 AETHERUS(우주 탭)가 있다 — 디자인은 Pleos 와 같고 내용 행렬만 다르다.
- **전달 경로:** WIDE 레이아웃은 웹(v1·v2)에 한 번 만들고 — 폴드는 안드로이드 앱(TWA)·브라우저, 아이폰은 Safari·홈 화면 웹앱, Pleos 는 네이티브 셸의 WebView(PL4, Pleos 답 대기)로 같은 화면을 띄운다.
- **순서 영향:** WIDE 레이아웃 작업은 Pleos 답을 기다리지 않고 폴드·아이폰에서 먼저 검증할 수 있다(브라우저 크기 흉내 → 실기기). Pleos 는 그 결과를 받아 포장만.
- 시험: WIDE 두 모양(한 영역·두 영역)·PHONE 세로 각각 캡처, 세 모양에서 메뉴 목록·자연어 카드가 같은지 자동 비교, 접기↔펴기 전환 때 상태(열린 패널·선택 장소) 유지(Pleos 심사 "해상도 변경 시 상태 유실 금지"와 같은 요구).
