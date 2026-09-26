# 검수 A — 통합 개발지시서(2026-09-27) 사실 재검증 · 앱별 실현 가능성

대상: `docs/EARTHUS-V1V2-UNIFIED-DEV-DIRECTIVE-2026-09-27.md`(399행) · 방법: 저장소 읽기 전용(grep·파일:행 대조, 편집·git 없음) + 공식 문서 웹 확인.
표기: **VERIFIED** = 이번 세션에 공식 페이지를 직접 읽음 · **repo 경유** = 저장소 문서가 읽었다고 적은 것 · **UNVERIFIED** = 검색 요약·추론.
PD 규칙에 따라 모든 문제에 수정안 하나(권고)를 붙였다. 심각도 순(P4 착수를 막는 것 먼저).

---

## Part 1 — 지시서 주장 재검증

### 1-A. 착수를 막는 것 (P4·유료 관문에 직접 걸림)
| # | 주장(지시서 위치) | 판정 | 근거 | 수정안(권고) |
|---|---|---|---|---|
| A1 | `SimulationRunRecord` 가 `aws/_shared/simulation_link.py` 에 "이미 있다" — 재현 패키지 재료(§13, §7-1 공통, Q8) | **부분** | 파일은 **검증기일 뿐**("쓰지 않고, 실행하지 않는다" :4-6). 정본 스키마는 SIMULATION_PLATFORM_MAPPING §6.2. `RUNTIMES` 등재 2개뿐(research-runtime·tsunami-eta, :39-48). **`eventId` 필수**("사건 없는 실행은 등재 대상이 아니다" :131) → 사용자 가정(what-if)·태양·그림자·가상 지진은 전부 거절. seed·엔진 커밋·컨테이너 digest·결과 체크섬 칸 없음. `approval.by` 는 사람만(:19) | §6.2 스키마 개정을 P4 앞 선행 과제로 명시: `scenarioKind: EVENT|USER_WHATIF|PAST_REPLAY` 추가(USER_WHATIF 는 eventId 선택), `engineCommit·containerDigest·seed·resultSha256` 칸, P4 엔진 5종 RUNTIMES 등재. 즉시형(브라우저)은 같은 스키마를 JS 로 검사하는 쌍둥이 검증기 |
| A2 | P4 완료 기준 "MCP 로 **쓰나미 시나리오 실행**"(§10) · §7-1 "쓰나미 도달시간(운영) 5기준 통과" | **내부 충돌** | Q9 "진행 중 사건의 미래를 우리 엔진으로 전개 = 금지" ↔ 운영 중인 `tsunami-eta` 는 **실제 사건**의 도달 시각을 낸다(`event-room.js:35,266`). 유료 점검 L4(`PAID-APP-LAUNCH-REVIEW:83,255`)는 "실제 사건 쓰나미 도달시간은 확인 전까지 유료 상품에서 뺀다" | P4·MCP 시연은 **가정 진원(사용자 입력) 시나리오만**. 실제 사건 ETA 는 무료 v1 에 SIMULATION_ONLY 로 공식 경보 옆에만 두고, 유료 편입은 L4 해소 뒤. Q9 에 이 예외를 한 줄로 적는다 |
| A3 | §7-1 "지금 5기준 모두 통과: … **여진 기준선**" | **틀림(충돌)** | AGENTS.md:82 "여진 기대수 모형을 (채점에서 빗나가) 내렸다". SIM-MATRIX:69 E4 는 "앞으로 7일 M4+ 기대 N회" = 진행 중 사건의 미래 → Q9 금지선 안쪽 | '통과' 목록에서 빼고 "닫힌 여진 계열 재채점(LAB)만"으로 강등. 다시 올리려면 채점표 통과 + L4 확인 |
| A4 | §8-2 "Esri 는 지구 팩에 넣지 않음" · §7-3 "장소의 입체 카드 — 지형 z10~11 있음" | **부분(빈틈)** | 팩만 막았고, **웹 v2 는 이미 Esri World Imagery 를 실시간으로 받는다**: `local-terrain.js:3,8`(z11), `main.js:1088,1240`(z7~9), 출처 `i18n.js:78`. Esri 약관: 서면 허락 없는 상업적 재생산 금지(UNVERIFIED — 검색 요약) | 유료 전환(2027-01-01) 전 교체: **s2cloudless 2016판(CC BY)** 을 z7~11 위성 바탕으로. 불가하면 ArcGIS Location Platform 유료 계약(API 키 요구 여부 UNVERIFIED). §12 '하지 않는 것'에 "유료 화면에서 Esri 무계약 사용" 추가 |
| A5 | §5-4 목표 PC "판 열린 상태 UI 덮음 ≤20%" + 판 "폭 ≤360·높이 ≤60%" | **산술상 불가** | 1440×900: 도크 56×900=3.9% + 판 360×540=15.0% + 타임라인 480×48=1.8% + 상단 3개·검색 ≈1.2% → **≈21.9%**. 48×48 격자 측정은 칸 단위 올림이라 더 커진다 | 판 높이 상한 **≤50%**(360×450=12.5% → 합 ≈19.4%)로 바꾸거나 목표를 ≤22% 로. P0 측정 스크립트로 실측해 확정 |
| A6 | §5-4 세로폰 "절반 상태에서도 지구 ≥50% 보임" | **자기모순** | 390×844 에서 시트 '절반'(422) + 하단 도크 56 + 검색 44 → 지구 ≈38% | '절반' 단을 **화면 높이 35~38%**(≈300 px)로 정의 → 지구 ≈53%. 이름도 '중간'으로 |
| A7 | §5-4 폴더블 "≤25%" · 판 폭 ≤320 (높이 상한 없음) | **부분(미정의)** | 884×1104 에서 판 320×60%(662)=21.7% + 도크 6.3% → ≈28% | WIDE 판 **≤300×45%**(≈15.3%) + 도크 + 타임라인 ≈23.6% 로 명시 |
| A8 | §5-2 판정 "PC: 너비≥1024·가로" / "WIDE: 600≤너비<1024 **또는** 비율 0.75~1.33" / Pleos=WIDE | **틀림(겹침)** | ① 1100×1000 데스크톱 창은 PC·WIDE 둘 다 참(우선순위 없음). ② Pleos 두 영역 스크린샷 규격 1700×1212(`VERIFIED_POLICY:106`)는 '너비≥1024·가로'라 **PC 로 판정** | 판정 순서 고정: PHONE(<600) → WIDE(600~1023, 또는 `viewport-segments`≥2, 또는 셸이 붙인 `data-form=wide`) → PC. 비율 OR 절 삭제. Pleos·앱 셸은 클래스로 강제 |
| A9 | 단계 번호 P0~P7(§10) | **충돌** | 같은 저장소에 P0가 셋: 계약 §I(R0→P0→P1+M1+T, AGENTS "지금 열려 있는 작업"), Intelligence P0~P6, V7 P0~P12. §8-4 한 문장에 "P5 착수"(지시서)와 "V7 P9·P10" 이 섞여 있다 | 이 지시서 단계에 접두어 **U0~U7**(Unified). 다른 문서 참조는 "계약 §I P1", "V7 P9" 처럼 출처를 붙인다 |
| A10 | §10 P4 "브라우저형 3종(태양·그림자·**가시권**·쓰나미 파면)" ↔ §7-1 "먼저 만들 8개" | **내부 충돌** | 가시권은 8개에 없고, 8개 중 Okada·Holland·ENS 진로 확률·산사태 임계·폭염 체감은 **§10 어느 단계에도 없다** | P4 = 8개 중 브라우저형 5(쓰나미 파면·Okada·Holland 과거 재현·태양·그림자·폭염 체감) + ENS 진로 확률 + 표류(S-A) 연결. 가시권은 P7 로 |
| A11 | §10 P7 "…**산불**…" | **충돌** | Q10 "산불 확산 = 메뉴에 입구+사유만", §7-1 행6 동일 | P7 에서 산불 삭제, "닫힌 과거 산불 재현(연구, 변리사 검토 후)"으로 별도 줄 |
| A12 | §10 P4 "MCP 서버 **읽기 도구** 3~4개" + 완료 기준 "시나리오 **실행**" | **충돌** | `run` 은 읽기가 아니다. Q8 작업형은 실행 전 비용·동의 필수 | P4 도구 = `list_scenarios·setup_scenario·estimate·run(즉시형만)·get_result·open_in_earthus`. 작업형 `run` 은 P7 |

### 1-B. 코드·파일 참조 재확인
| # | 주장 | 판정 | 근거 | 수정안 |
|---|---|---|---|---|
| B1 | 구름 그림자 이미 있음: v1 `cloud-shadow.js`, v2 `main.js` EARTH_FRAG :563-578 | 맞음 | v1 `prototype/js/cloud-shadow.js`(imagery.js·index.html 이 사용) · v2 :563 주석, :564-578 `uCloudShadow` | — |
| B2 | `earthus-intelligence.js` SHADOW_EVIDENCE_ONLY `:8` | 맞음 | :8 `releaseMode: 'SHADOW_EVIDENCE_ONLY'` | — |
| B3 | 우주 500개 상한 `layers/space.js:428` `satsCapped` | 부분 | `satsCapped =` 는 **:427** (:428 은 `this.sats =`). 상한 값은 `renderCap()` 이 기기별로 정함 — '500' 고정 아님 | ":427, renderCap()" 으로 |
| B4 | 브라우저 코드 `node:` 0건 | 맞음 | `prototype/` 매치 2건은 `node:` 객체 키(spatial-graph.js:29-30) — import 아님 | — |
| B5 | 샘플 V28/V29/V35/V36/V38 이 `node:fs/promises` import · V38 은 `../../../v37` 없음 | 맞음 | ui_PLEOS 5개 파일 확인 · `VERIFY_V38_FINAL_RELEASE.mjs:8` | — |
| B6 | `search.js:318` 이 "숨긴 **41종**" 전부 노출 | **틀림** | 41 은 `search.js:10` 의 **낡은 주석**. 실제 `ITEMS` 56종, 메뉴(LEAN 22 + 여행 2 + 재난 8 = 32) 밖 **24종**(gk2a 7채널·himaIR·synop·tmax·tmin·windfc·fog·rain·buoy·landobs·news·aurora·eclipse·phenomena·ukfc·coverage·flight·ship)이 검색으로만 열림 | "ITEMS 56 중 메뉴 밖 24" + P0 메뉴 추출 스크립트로 자동 산출 |
| B7 | 입구 없는 레이어 `volcano`·`stations` | 부분 | 둘 다 `registry.js:60-61` 에만 있고 ITEMS 에 없음(맞음). 통합 계획서 §15-1 은 `orbits` 도 적음 — 지시서가 누락 | 목록에 `orbits` 추가(또는 AETHERUS 탭 입구로 분류) |
| B8 | v2 `menuTime()` 이 타임라인 따르는 기온·바람·기압을 "재생 시간과 별도"로 표기 | 맞음 | `information-contract.js:5,17-23` MOVING = cloud-gfs·tyoff·seoul 뿐, 나머지는 기본문 "재생 시간과 별도". `field-layer.js:633` 은 timeBus 구독 | 수정 시 MOVING 을 하드코딩 말고 layer 가 timeBus 구독 여부를 스스로 신고하게 |
| B9 | v2 = 서랍 묶음 6 + 하단 탭 5 + 세로 탭 | 맞음 | `phenomenon-registry.js:1077~` MENU_GROUPS 7(우주는 AETHERUS 서랍) · `ui-shell.js:1073-1079` NAV_ITEMS 5 | — |
| B10 | v1 = 하단 바 7 + 레이어 4묶음 | 맞음 | `layerbar.js:553-562` CATEGORIES_LEAN 4 · `index.html:634-736` | — |
| B11 | "좌측 11메뉴 레일(코드에 없음)" | 맞음 | v2 코드에 11 레일 없음(묶음 6) | AGENTS.md 개정 시 '11메뉴'를 "7 도크(§4-2)"로 교체(Q6) |
| B12 | 자연어 뼈대 = `narrative.js`(숫자 없으면 문장 없음) | 맞음 | `narrative.js:7-9` | — |
| B13 | `research.js` 연구팩 CSV+스키마+SHA-256 | 맞음 | :25 SCHEMAS · :101 ZIP · :173-175 `crypto.subtle` SHA-256 · :332 `earthus.research-manifest.v1` | 재현 패키지 manifest 를 이 스키마의 v2 로 확장(새로 만들지 말 것) |
| B14 | `cloud-volume.js`·`scenario-compare.js`·`report-center.js` 있음 | 맞음 | `prototype/v2-three/js/` | — |
| B15 | §8-3 "지형 **z3 한 장** + 확대 시 z10~11" | 부분 | z3 한 장은 **폰·태블릿만**, PC 는 z4 256장(`main.js:162-164`), 중간 z5~z9 창, z10 고도 + **Esri z11**(A4) | 표를 "PC z4 256장 / 폰 z3 한 장 / z5~9 창 / z10 지형 + Esri z11"로 |
| B16 | §8-3 "구름 GMGSI 3072" · "밤 GIBS 5120" | 부분 | 구름 PC 3072 / 폰 2048(`main.js:1466-1470`) · 밤 PC 5120 / 폰 2560(:6619, :7372) | 폰 값 병기 |
| B17 | §8-3 "바다 GGX 반사·Fresnel" | 부분 | Fresnel(Schlick) 있음(:588). 'GGX' 표기 코드에 없음 | "Fresnel 반사" 로 |
| B18 | §3 "v1 Cesium, 지형 없음" | 맞음 | `viewer.js:14` EllipsoidTerrainProvider | — |
| B19 | §3 "타임라인 — **v1 에 새로 둔다**" · §2#8 | **부분(과소평가)** | v1 에 이미 5일(+120h) 타임라인 있음: `ui-timeline.js:1-16` — 태풍·등압선·바람 입자 모델 예보·재생(끝에서 멈춤). 숨김 레이어 `windfc·tmax·tmin`(내일 예보)·`kma-fcst.js` 도 있음 | "새로 만든다"→ **`ui-timeline.js` 를 태풍 전용에서 공통 하단 타임라인으로 일반화**(v2 `time-bus.js` 규약에 맞춤) |
| B20 | §2#8 "날씨 시트 14일" | 부분 | `ui-weather.js` 에 '14일' 탭(:269,725)과 '10일 날씨'(:1059) 둘 다 있음. AGENTS.md 는 "Open-Meteo 10일" | 한 값으로 정리(권고: 표시 10일, 11~14일은 '참고'로 흐림 — :105 규칙 유지) |
| B21 | 측정표 §5-1 수치 | **재현 불가** | 측정 스크립트가 저장돼 있지 않음(`tools/measure-ui-coverage.mjs` 없음) | U0 첫 커밋에 스크립트+원자료(JSON) 저장, 표 값은 그 출력으로 교체 |
| B22 | 지시서가 만들 파일 `menu-canon.js`·`intel-card.js`·`intel-sentences/` | 없음(정상 — 계획) | 미생성 확인 | — |
| B23 | §4-3 "v2 `ui-shell.js` 가 공용 파일만 읽는다" | 부분(제약 누락) | v2 는 이미 v1 트리를 절대/상대경로로 import(`main.js:2332 "/js/earth-switch.js"`, `../../js/aetherus/…`, `../../js/earthus2/…`) | 설치형·오프라인 팩은 **v1 `/js/` 트리까지 번들**해야 함을 §8 에 명시 |

### 1-C. 문서 내부 불일치·낡은 문구
| # | 위치 | 문제 | 수정안 |
|---|---|---|---|
| C1 | §3 "(PD 확인 필요 — §11 Q1)", AI 행 "현행 유지 여부 PD" | §11 Q1·Q7 에서 이미 확정 — 낡음 | "확정(Q1)", "설명 전용 유지(Q7)"로 |
| C2 | §3 v1 자연어 "지금·**왜**·앞으로" ↔ Q1 "원인 문장은 v2" ↔ AGENTS "v1 원인 말하지 않는다" | v1 '왜'의 범위 미정 | v1 '왜' = **확립된 기작 인용**(narrative.js ② 층)만, v2 '원인' = 측정 조건+기작 패킷. 카드 칸 이름을 v1 "배경" / v2 "원인"으로 |
| C3 | §6 완료 기준 "v1 과 v2 가 같은 입력에 **같은 문장**" | v2 는 확률·원인 문장이 추가됨 | "공통 문장 집합은 동일, v2 는 추가 문장만(교집합 = v1 전체)" |
| C4 | §4-2 도크 '위성' ↔ §7-1 도크 열 | 7-1 에 '위성' 도크 계산 0 · "지구·지역(여행)", "재난(연구)" 같은 도크 밖 이름 사용 | §7-1 도크 열을 §4-2 7개 이름만 쓰게, 연구·여행은 '항목'으로 |
| C5 | §7 절 번호 | 7-1, 7-2, 7-3, **7-5, 7-4** 순 | 7-4 ↔ 7-5 교체 |
| C6 | §7-1 "요소 7(땅·물·얼음·태풍·대기·지진·화산·우주)" | 이름이 8개 | "요소 7(… · 지진·화산 · 우주)" — MATRIX:72 와 같게 |
| C7 | §7-2 "MCP Apps(명세 2026-07-28)" | MCP Apps 확장 명세는 **2026-01-26**, 2026-07-28 은 코어 명세(확장 체계 편입) — UNVERIFIED(MCP 블로그·ext-apps 저장소 검색 요약, 페이지 직접 읽지 않음) | "MCP Apps(확장 2026-01-26, 코어 2026-07-28 편입)" |
| C8 | §13-4 "P4 부터 재현 패키지·채점표·CSV/GeoJSON·상태 URL" | §10 P4 완료 기준에 없음. Python 클라이언트(§13-1)도 §10 P7 행에 없음 | §10 표에 옮겨 적기(완료 기준은 한 곳에만) |
| C9 | 헤더 "코딩 착수는 PD 시작 신호로" ↔ §2 "결정 확정" | 모순은 아니나 §12 "승인 전 코드" 와 같이 읽힘 | 헤더에 "결정=확정 · 코드=시작 신호 대기" 두 줄로 분리 |
| C10 | §5-4 도크 "폭 56"(PC·WIDE·Pleos 공통) | Pleos 터치 타깃 ≥12.5 mm·간격 ≥4 mm(`VERIFIED_POLICY:89`) — px 는 mm 가 아님 | Pleos·WIDE 는 **dp/mm 기준**(≥64 dp, 차량 DPR 로 12.5 mm 검산) |
| C11 | §9 Pleos "v1 통합 메뉴 그대로" | Pleos 심사 실행 ≤10 s·로드 ≤10 s(`VERIFIED_POLICY:104`) ↔ v1 첫 화면 무게(앱 지시서 §2-2) 미검산 | U6 완료 기준에 "차량 에뮬레이터 콜드 스타트 ≤10 s" 추가 |

---

## Part 2 — 앱(표면)별 실현 가능성

표면: (a) v1 웹 Cesium · (b) v2 웹 Three.js · (c) 안드로이드 TWA `net.earthus.app`(v1+v2) · (d) 아이폰 Safari/홈 화면 웹앱 · (e) 크롬 새 탭 확장 · (f) Win/Mac 설치형(Electron 제안, 미착수) · (g) Pleos(네이티브 AAOS, 주차 전용)
기호: ● 됨 · ◐ 부분 · ✕ 불가/대상 아님

| 기능 | a v1웹 | b v2웹 | c TWA | d 아이폰 | e 새 탭 | f 설치형 | g Pleos |
|---|---|---|---|---|---|---|---|
| 1 통합 7 도크 메뉴 | ● | ● | ●(웹 그대로) | ● | ✕→딥링크 | ● | ◐(WebView 허용 미확인) |
| 2 기기 3형식 레이아웃 | ● | ● | ●(폴드 viewport-segments) | ◐(PHONE·PC 만, 폴더블 아이폰 미출시) | ✕(고정 2D) | ●(PC) | ◐(WIDE 강제 클래스 필요, A8) |
| 3 자연어 카드 | ● | ● | ● | ● | ◐(한 줄 요약 JSON) | ● | ◐(주행 중 불가, 주차 중 3줄 이내) |
| 4 v1 타임라인·예보 재생 | ●(B19 일반화) | ●(이미) | ● | ●(끝에서 멈춤=발열 규칙) | ✕ | ● | ◐(주차 중만, 애니메이션 규칙) |
| 5 3D 지형 즉시형 계산 | ✕(유료 경계 Q1) | ●(WebGL2) / ◐(WebGPU 기기별) | ◐(WebGPU 안드로이드 기기 편차) | ◐(Safari 26 WebGPU 있음, 메모리 한도) | ✕ | ● | ✕(결정 #1) |
| 6 서버 작업형 계산 | ✕ | ●(A1 선행) | ● | ● | ✕ | ● | ✕ |
| 7 사용자 AI·MCP / AI 창 | ✕(물어보기 설명 전용 Q7) | ◐(MCP 는 사용자 AI 쪽, 화면은 딥링크) | ◐(딥링크 수신만) | ◐(딥링크 수신만) | ✕ | ●(AI Aside) | ✕ |
| 8 연구자 API·내보내기 | ◐(research.js CSV 이미) | ● | ◐(파일 저장 UX 제한) | ◐(다운로드·공유 시트) | ✕ | ● | ✕ |
| 9 지구 팩 미리 받기 + LE 급 | ✕(규칙: 방문마다 큰 파일 금지) | ◐(품질만, 팩 ✕) | ◐(OPFS 선택 팩 가능 — APK 에 넣기 ✕) | ◐(홈 화면 앱 quota=브라우저 quota, 2 GB 는 과대) | ✕ | ● | ◐(APK <600 MB, 팩은 설치 후 다운로드) |
| 10 결제·권한 | 웹 토스 ● | 웹 토스(v2 결제 단추 0건 — 앱 지시서 §2-1) ◐ | **Play 결제 필수**(또는 KR 대체결제) ◐ | 웹 결제 ● | 무료 ✕(CWS 결제 없음) | 직접 배포=웹 결제 ● / 스토어 배포=IAP | 미확인 ✕ |

### 표면별 메모 (이유 → 대안)
**(a) v1 웹 · Cesium**
- 지형 없음(EllipsoidTerrainProvider) → 3D 지형 계산은 v2 몫이 맞다. v1 에 '계산 입구'만 두고 v2 로 보내는 유도(유료 문법)로.
- 타임라인: `ui-timeline.js` 가 이미 5일·끝에서 멈춤 → 공통화만(B19). 기온·바람 장 프레임은 v2 `gfs-frames` 파이프라인을 공유.

**(b) v2 웹 · Three.js**
- WebGL2 는 전 표면 기준선. WebGPU 는 '가속 옵션'으로만 — 모든 즉시형 엔진에 WebGL2(또는 CPU Worker) 대체 경로를 필수로(쓰나미 얕은물은 WebGL2 텍스처 핑퐁으로 가능).
- Esri z7~11 교체(A4)가 유료 전환 전 필수.

**(c) 안드로이드 TWA**
- TWA 안 디지털 판매는 Play 결제 필수, 다른 결제로 유도하는 링크·웹뷰 금지 — **VERIFIED**(Play 정책 answer/9858738). 한국 대체결제·outlink 는 repo 경유(answer/11222040).
- Digital Goods API = Chrome 101+ — **VERIFIED 수준 아님(검색 요약, UNVERIFIED)**. 삼성 인터넷 기본 폰에서 실패 사례 → 앱 지시서 §3-1(c) 네이티브 브리지 보조 유지. `twa-manifest.json` 은 이미 `playBilling: enabled`·`fallbackType: customtabs`.
- 지구 팩: APK 자산은 웹 origin 이 못 읽음 → 설치형 팩은 **OPFS/Cache Storage + `navigator.storage.persist()`** 로 '선택 다운로드'(지역 팩 수백 MB 이하 권고). Chrome quota·persist 부여 규칙 UNVERIFIED.
- 안드로이드 WebGPU(Chrome 121+, Android 12+) — UNVERIFIED(이번 세션 미확인) → 즉시형은 WebGL2 기본.

**(d) 아이폰 (Safari · 홈 화면 웹앱)**
- Safari 26 WebGPU 가 macOS·iOS·iPadOS·visionOS 에 출시 — **VERIFIED**(WebKit 블로그, 베타 발표문). iOS 26 미만은 WebGL2 경로 필수.
- 홈 화면 웹앱 저장 quota = 브라우저와 동일(origin 최대 디스크 60%), `persist()` 는 홈 화면 앱이면 허용 경향 — **VERIFIED**(WebKit Storage Policy). 그래도 2 GB 팩은 폰에 과대 → 폰은 지역 팩만.
- 네이티브 앱이 없으므로 App Store 결제 규칙이 적용되지 않음 → 웹 토스 결제 그대로(추론 — 공식 문서 인용 아님). **나중에 네이티브 래핑하면 IAP 규칙 적용**(대안: 계속 웹앱).
- 탭당 WebGL 메모리 한도 UNVERIFIED → 폰 텍스처 4096 규칙(현 코드) 유지.
- "펼치는 아이폰"(§2 #7, §5-2)은 **미출시 기기 가정** → 판정은 화면 모양(A8)으로 두고 기기명 문구는 삭제 권고.

**(e) 크롬 새 탭 확장 (`apps/chrome-newtab`, MV3)**
- MV3: 모든 로직이 패키지 안에 있어야 하고 원격 코드 실행 금지, extension_pages CSP 는 `self`·`wasm-unsafe-eval` 만 — **VERIFIED**(Chrome 문서). 원격 Cesium/Three 번들·지시서 기능 대부분 불가.
- 현재 설계: 2D 캔버스·rAF 0·WebGL 0(앱 지시서 §1-2), 권한 `storage·alarms`, `host_permissions earthus.net` → 가능한 것은 **자료 JSON 으로 만든 한 줄 자연어 요약 + 도크별 딥링크(earthus.net/?dock=…)** 뿐.
- CWS 단일 목적·최소 기능 정책은 repo 경유(앱 지시서 §2-3 #1) — 새 탭에 메뉴·시뮬을 넣지 말 것. 쓰나미 줄 기본 끔(L4).

**(f) Win/Mac 설치형 (Electron 제안)**
- Electron 보안 체크리스트 20개 — **VERIFIED**: 원격 콘텐츠에 nodeIntegration 금지·contextIsolation·sandbox·CSP·IPC sender 검증·`file://` 대신 커스텀 프로토콜. → 앱 구조: 지구·UI 는 로컬 번들(커스텀 프로토콜), 자료는 fetch 만, AI 창은 별도 WebContentsView(노드 없음).
- v2 가 v1 `/js/` 를 import(B23) → 번들러가 두 트리를 함께 묶어야 한다.
- 서명·공증(macOS)·Windows 서명은 V7 PLATFORM-09·10 선행(구체 요건 UNVERIFIED).
- 결제: 직접 배포면 웹 결제 유지 가능, Mac App Store·MS Store 로 가면 스토어 결제 규칙 → **직접 배포 권고**.
- **대안(권고 검토):** 먼저 데스크톱 Chrome/Edge 설치형 PWA + OPFS 지구 팩으로 U5 를 시험(셸 비용 0, 같은 코드). Electron 은 로컬 GPU 계산(V7 P9·P10)이 필요해질 때.
- GPL 엔진(LISFLOOD·FLEXPART·CLIMADA 등)은 설치형에 넣지 않는다(§12 유지).

**(g) Pleos (네이티브 AAOS, 주차 전용)**
- DO 미선언 앱은 P 가 아니면 종료, 날씨 카테고리 주행 중 예외 없음 — repo 경유 VERIFIED(`VERIFIED_POLICY:16,68-71`). → 주차 전용 v1 통합 메뉴 + WIDE 가 현실적(지시서와 일치).
- WebView/TWA 허용 **미확인**(질문 7개 답 대기) → 대안: 답이 '불가'면 Car App Library 날씨 템플릿(MapWithContentTemplate, 커스텀 UI 불가)으로 '지금 날씨+특보' 최소판.
- APK <600 MB → 지구 팩은 설치 후 받기, 기본 팩 2 GB 는 차량 저장공간 확인 전 금지.
- 결제 체계 미확인 → Pleos 판은 무료 v1 만(결정 #1 과 일치).
- 애니메이션: 주행 중 금지(주차 중 허용). 타임라인 자동 재생은 주행 시작 즉시 정지·UI 숨김.

---

## 출처 (이번 세션)
- VERIFIED: WebKit "News from WWDC25 … Safari 26 beta" https://webkit.org/blog/16993/ · WebKit "Updates to Storage Policy" https://webkit.org/blog/14403/updates-to-storage-policy/ · Chrome MV3 보안 https://developer.chrome.com/docs/extensions/develop/migrate/improve-security · Google Play 결제 정책 https://support.google.com/googleplay/android-developer/answer/9858738 · Electron Security https://www.electronjs.org/docs/latest/tutorial/security
- 검색 요약(UNVERIFIED): MCP 2026-07-28 명세 https://blog.modelcontextprotocol.io/posts/2026-07-28/ · MCP Apps 확장 2026-01-26 https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx · TWA Play 결제 https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing · Esri 약관 https://www.esri.com/en-us/legal/terms/web-site-service
- repo 경유: `docs/pleos/VERIFIED_POLICY.md`, `docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md`, `docs/PAID-APP-LAUNCH-REVIEW-2026-09-24.md`
