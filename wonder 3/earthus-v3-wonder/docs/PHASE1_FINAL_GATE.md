# PHASE 1 FINAL GATE — 상태판 (PD "PHASE 1-D ACCEPTANCE / FINAL DEVICE GATE", 2026-09-13)

PD 판정(2026-09-13): IMPLEMENTATION PASS · BACKGROUND AUTOMATED QA PASS · BACKGROUND VISUAL QA PASS(candidate 24/24) · SCENE LABEL PASS · ELECTRIC EEL PASS · REGRESSION 46/46 · CONSOLE 0 · AWS 0.
**남은 FINAL BLOCKER 2: ① Background production approval ② Real device gate.** 이 표는 그 둘을 포함한 7조건의 현재 상태다. 갱신할 때 날짜와 근거를 적는다.

| # | 조건 | 상태 | 근거 / 누가 |
|---|---|---|---|
| 1 | Background production approval | **PENDING — PD 결정** | 팩 1.8 24장 승인 안 함(1024×655·시각 24 FAIL). ComfyUI 후보 24장(2048×1152, 자동 24/24·시각 24/24) `benchmarks/background-candidates/candidates.json` **production_approved 0**. 승인 시 절차: 후보 → `content/pack-1.8/backgrounds/` 교체 → `background-review.json` verdict ok → `scripts/check-backgrounds.py` → `build-registry.mjs` → `candidates.json` production_approved true(또는 동등한 canonical 상태) |
| 2 | Android device PASS (14단계 터치 E2E) | **PENDING — 실기기 0건** | `docs/DEVICE_GATE_CHECKLIST.md`. 주소 `https://earthus.net/wonder/next/apps/web/?qa=1&device=1`(스테이징, 2026-09-13 배포) 또는 LAN. 결과는 폰 오버레이 [저장](LAN) 또는 [복사](스테이징) → `docs/device-gate/device/android-*.json`. `tests/device-gate.test.mjs` 가 파일을 읽어 14/14 여부를 출력 |
| 3 | iOS device PASS (동일 항목) | **PENDING — 실기기 0건** | 같은 절차, Safari → `docs/device-gate/device/ios-*.json` |
| 4 | Regression PASS | **PASS** | `node --test` 48/48 (46 + device-gate 결과 구조·판정 2). Device QA 결과가 추가되면 재실행한다 |
| 5 | Console 0 errors | **PASS(인앱 Chromium)** | 1-B~1-D 검증 전부 콘솔 오류 0 (의도한 404 실패 시험 제외). 실기기 콘솔은 미확인 |
| 6 | Existing V3/Hobby unchanged | **PASS** | wonder 3 커밋 10개(`b3796259`~`b37de487`)가 건드린 경로는 전부 `wonder 3/` — `git log --name-only` 로 확인. `prototype/v3-kids`·`v3-paper`·`aws/deploy-v3-*`·`sw.js`·CI 의 작업 트리 변경은 다른 세션/기존 것(세션 시작 전 mtime) |
| 7 | AWS change = 0 before staging | **PASS → 스테이징 배포됨(2026-09-13 16:36)** | 배포 전까지 쓰기 0(별칭 3키뿐, `next/`·`live/` 없음). PD 지시로 `app/wonder/next/**` 에 296 put·삭제 0·커밋 `91bf2330`. production(`live/`·별칭 3키)·`app/v3/`·V1·V2 변경 0. `docs/STAGING_DEPLOY_REPORT_2026-09-13.md` |

## 실기기 결과 기록 규칙

- 오버레이는 주소에 `&device=1` 이 있을 때만 `device.source=device` 로 저장한다(UA·터치 포인트는 DevTools 에뮬레이션도 흉내 내므로 근거가 못 된다 — 참고 힌트로만 기록). 그 밖은 `emulated`. **에뮬레이션 결과는 게이트 근거가 아니다.**
- 14단계 전부 ✅ 인 실기기 결과가 Android 1건 이상 + iOS 1건 이상 있어야 조건 2·3 PASS.
- 성능은 같은 JSON 의 `perf`(initialTransferKB·sinceRegionTransferKB·contentRequests·characterFiles·fps·frameGapsOver100ms·heapMB)에 남는다. iOS 는 heap n/a.
- "페이지가 열림" 만으로는 어떤 단계도 체크되지 않는다(각 단계는 상태 변화 조건).

## PHASE 1 FINAL ACCEPTANCE

7조건 전부 PASS 일 때. 2026-09-13 현재 **4/7 PASS, 3 PENDING(배경 승인·Android·iOS)**. push 는 그 뒤 PD 결정.
