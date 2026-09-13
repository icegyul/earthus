# EARTHUS V3 WONDER — PHASE 0 DECISION LOCK (2026-09-13)

PD 가 PHASE 0 READ-ONLY AUDIT 결과를 확인하고 아래 6개를 **LOCK** 했다. 이 문서는 그 결정의 기록이며,
후속 문서(`ARCHITECTURE_LOCK.md`, `DEPLOYMENT_MAP.md`, `BACKGROUND_ASSET_SPEC_v1.md`, `CHARACTER_WEBP_BENCHMARK.md`)가 이를 따른다.
결정을 바꾸려면 이 문서에 날짜와 이유를 덧붙인다(지우지 않는다).

## 1. MASTER DIRECTIVE

- `CLAUDE_CODE_EARTHUS_V3_WONDER_WONDER3_MASTER_DIRECTIVE_v1.md` 를 repo 안 `docs/MASTER_DEVELOPMENT_DIRECTIVE.md` 로 복사한다.
- 이 문서를 wonder 3 의 개발 기준 문서로 사용한다. 원본 내용 임의 축약 금지.
- ~~상태: BLOCKED (13:10·13:44 두 차례 파일 없음)~~
- **상태: PASS (2026-09-13 13:5x)** — 원본 `wonder 3/CLAUDE_CODE_EARTHUS_V3_WONDER_WONDER3_MASTER_DIRECTIVE_v1.md`(LastWriteTime 13:55:17) 를 `cp --preserve=timestamps` 로 복사.
  - SHA-256 원본 = 대상 = `e41a6652f3d86af0b4a274eaf39e32a7f976d5e07d4d6bf23efb4cb8e9cbca95`
  - 크기 원본 = 대상 = **18,656 B** (1,310줄, UTF-8, BOM 없음)
  - `cmp` 바이트 동일 · `diff` 출력 없음 → **3항목 모두 일치 = PASS**
  - 내용 수정·요약 없음. 지시서 §31·§32 와 현재 골격의 차이는 `MASTER_DIRECTIVE_RECONCILIATION.md` 에 정리(코드 변경 없음).

## 2. STACK

- 현재 ESM 구조 유지. React/Next 등 대형 프레임워크로 전환하지 않는다.
- 필요하면 모듈 경계를 `packages/` 수준으로 분리한다. 현재 골격을 먼저 완성한다.
- **상태: LOCKED** → `ARCHITECTURE_LOCK.md`

## 3. DEPLOYMENT

- 기존 S3 `app/v3/` 절대 사용하지 않는다.
- v3-paper / v3-kids 와 충돌하지 않는 WONDER 전용 prefix 를 설계한다. 실제 AWS 변경은 아직 실행하지 않는다. deploy-map 문서만 작성한다.
- **상태: 설계 완료(문서만)** → `DEPLOYMENT_MAP.md`. AWS 쓰기 0건.

## 4. 124 CHARACTER WEBP

- 원본 PNG 삭제 금지. 124개를 무조건 변환/덮어쓰지 않는다.
- 품질/해상도/파일크기 기준을 먼저 정하고 대표 3종(folklore 1 · prehistoric 1 · animal 1)으로 benchmark 한다. 결과 승인 후 124개 일괄.
- **상태: benchmark 실행** → `CHARACTER_WEBP_BENCHMARK.md` (승인 대기). PHASE 0 에서 만든 `content/characters/webp/yeti*.webp` 는 벤치마크 전 표본이라 기준 확정 뒤 재생성 대상이다.

## 5. LEGACY CLEANUP

- CLEANUP STEP 2~7 보류. AWS 삭제 금지. 기존 V3 유지. 기존 CI/sw.js 변경 금지.
- 새 WONDER production deployment 준비 + traffic cutover 계획 확정 뒤 다시 검토.
- **상태: LOCKED(보류)** — `DEPLOYMENT_MAP.md` §5 에 cutover 전 필수 선행 조건을 적었다.

## 6. BACKGROUND

- 팩 1.8 배경 24장은 production asset 으로 인정하지 않는다. 슬라이드/글자/타 장소 썸네일/캐릭터/히어로아트가 섞인 이미지는 사용하지 않는다.
- 24개를 새로 제작하거나 재납품한다. 요구: text 없음 · watermark 없음 · UI 없음 · 다른 장소 thumbnail 없음 · character 없음 · hero card 없음 · standalone environment · paper-cut / 2.5D · 16:9 · WebP · mobile crop 안전영역 · 캐릭터가 나중에 들어갈 foreground 공간 확보.
- 구성: world 1 · country Korea 4 · atmosphere 3 · region 16. 기존 24개 이름/분류 유지, 이미지 내용만 교체.
- **상태: 스펙·교체 매니페스트 작성** → `BACKGROUND_ASSET_SPEC_v1.md`, `content/backgrounds/replacement-manifest.json`. 제작/재납품은 미착수.

## PHASE 0 이후 즉시 할 작업 (A~F)

| | 작업 | 상태 | 산출물 |
|---|---|---|---|
| A | MASTER DIRECTIVE repo 편입 | **PASS** (13:5x, sha256 e41a6652…ca95, 18,656 B, diff 없음) | `docs/MASTER_DEVELOPMENT_DIRECTIVE.md`, 대조표 `docs/MASTER_DIRECTIVE_RECONCILIATION.md` |
| B | ARCHITECTURE LOCK 문서 | 작성 | `docs/ARCHITECTURE_LOCK.md` |
| C | DEPLOYMENT MAP (legacy · new wonder · S3 · CloudFront · CI · service worker) | 작성 (AWS 읽기 전용 실측 포함) | `docs/DEPLOYMENT_MAP.md` |
| D | CHARACTER WEBP 3종 benchmark | 실행 완료 · **기준안 승인 대기** (캐릭터 1024 q85 / 장면 1024 q85) | `docs/CHARACTER_WEBP_BENCHMARK.md`, `benchmarks/character-webp/` |
| E | BACKGROUND ASSET SPEC + replacement manifest | 작성 | `docs/BACKGROUND_ASSET_SPEC_v1.md`, `content/backgrounds/replacement-manifest.json` |
| F | 17/17 테스트 유지하며 PHASE 1 Paper Earth 준비 | 작성 | `docs/PHASE1_PAPER_EARTH_PLAN.md`, `docs/PHASE1_READINESS.md` |

## PHASE 1 시작 조건

`docs/PHASE1_READINESS.md` 가 7항목의 PASS/FAIL 을 관리한다. A 는 PASS 로 바뀌었다. **남은 것은 조건 5(벤치마크 기준안 승인) 하나다. 그 승인 전에는 PHASE 1 코드를 쓰지 않는다.**

## PD DECISION LOCK 2차 (2026-09-13 14:0x, 8건)

1. ROOT DEPTH → **OPTION A 유지**, canonical root `wonder 3\earthus-v3-wonder\` (상위 구조 불변)
2. NAME → **`earthus-v3-wonder`** (코드·폴더·package·문서), 표시명 EARTHUS V3 WONDER
3. DIRECTORY → **`scripts/`** 로 통일, `tools/` 금지 (이동 완료, 삭제 없음, 이동 뒤 검증 20/20→28/28)
4. WEBP BASELINE → **APPROVED** 캐릭터 1024 q85 · 장면 1024 q85. 원본 PNG 삭제 금지, source/runtime 분리, q85 는 절대값 아님(자산별 예외 `runtime-overrides.json`)
5. PHASE 1 START → 착수 전 6항목 점검(`PHASE1_PRESTART_CHECK.md`) 뒤 착수. 기준선 커밋 `b3796259`
6. AWS → LIVE 변경 금지. staging `app/wonder/next/` · production `app/wonder/live/` · `app/v3/` 수정 금지 · cleanup HOLD
7. IMPLEMENTATION RULE → 기존 V3 patch 금지, NEW BUILD, 보호 범위 준수
8. REPORT → 변경/신규/삭제 파일 · 테스트 · browser · asset loading · memory · commit SHA · blockers. "완료"는 구현+검증 항목에만

결과: `PHASE1_PAPER_EARTH_REPORT_2026-09-13.md` (코드 커밋 `71e1b3c4`).

9. **ROTATION RULE LOCK (2026-09-13 저녁, 스테이징 배포 뒤)** → 모바일 실기기에서 "드래그하면 남극으로 내려가고 이후 회전이 잠기는" 문제. 새 회전 규칙을 설계하지 않고 **EARTHUS V2 `OrbitCam` 의 회전 UX 를 V3 `globe-engine` 에 이식**한다(단순 위도 clamp 로 숨기지 않는다). V2 코드는 읽기만 하고 수정 금지. 줌(휠·버튼·핀치)은 V3 3단 유지, 핀치와 한 손가락 회전은 충돌하지 않게. 회귀 `node --test` + 1440/1024/390/375 + 스테이징 실기기 Android/iOS 재수행. 근거 `ARCHITECTURE_LOCK.md §4-A`, 보고 `ROTATION_RULE_PORT_2026-09-13.md`.

## 보고 형식

매 단계 IMPLEMENTED / TESTED / BROWSER VERIFIED / DEVICE VERIFIED / NOT DONE / BLOCKERS 를 분리한다.
"완료"는 Browser Verified 까지 통과한 경우에만 쓴다.
