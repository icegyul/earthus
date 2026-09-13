# EARTHUS V3 WONDER — NEW BUILD

기존 EARTHUS V3(`prototype/v3-kids`, `prototype/v3-paper`)의 코드를 **한 줄도 가져오지 않는** 새 프로젝트.
콘텐츠·자료·서드파티만 재사용하고, 엔진은 여기서 새로 만든다. 구조는 LEGACY CLEANUP 지시서 §14 를 따른다.

```
earthus-v3-wonder/
├─ apps/web/            무대 셸 (index.html · styles.css · src/{main,stage,gestures}.mjs)  — 서비스워커 없음
├─ packages/
│   ├─ interaction-runtime/   팩 1.8 계약(contract/*.ts 원본) + 실행체(src/index.mjs)
│   └─ stage-engine/          배경 선택기 (좌표 → 지역 배경)
├─ content/
│   ├─ pack-1.8/        팩 원본 그대로 (배경 24 · FX 5 · 카탈로그 · 124 인터랙션) + background-review.json(눈 검수)
│   ├─ backgrounds/     regions.json — 배경 지역 배정(잠정)
│   ├─ characters/      manifest-124.json(생성) · webp/ (레거시 PNG 의 변환본만, PHASE 0 은 yeti 1종)
│   └─ registry/        asset-registry.json(생성) — 모든 자산의 sha256·출처·로드 정책
├─ scripts/             build-registry.mjs · convert-characters-webp.py · dev-server.mjs · build-staging.mjs · deploy-staging.sh
├─ tests/               node --test
└─ docs/                팩 문서 사본 · PHASE 보고서 · 빌드 지시서 초안
```

## 실행

```bash
npm run registry      # content/ 를 재서 registry·manifest 생성 (팩 카탈로그 해시 대조, 검수 없는 배경은 오류)
npm test              # 28 tests
npm run dev           # http://127.0.0.1:8790/apps/web/   (Claude 데스크톱: launch.json "earthus-v3-wonder")
python scripts/convert-characters-webp.py                 # 레거시 pack124 PNG → runtime WebP (원본은 읽기만, 기준 1024 q85)
```

## 규칙

- 기존 V3 코드 복사 금지. 참고는 가능(좌표 규약·규칙), 복사는 불가.
- 배포 경로는 `app/v3/`·`app/wonder` 를 재사용하지 않는다(미정). 서비스워커는 두지 않거나 새 범위로.
- "124종 관절 애니메이션 완료"라고 말하지 않는다 — 전신 스프라이트 폴백이 정상 경로다(`docs/INTERACTION_ASSET_STATUS.md`).
- 검수 ok 가 아닌 배경은 그리지 않는다(`content/pack-1.8/background-review.json`). 2026-09-13 기준 사용 가능 0장.
- 모든 단계 보고는 Implemented / Tested / Browser Verified / Device Verified 를 구분한다.

## 상태

- 감사: `../docs/WONDER3_READONLY_AUDIT_2026-09-13.md`
- PHASE 0 기반: `docs/PHASE0_FOUNDATION_REPORT_2026-09-13.md`
- **PHASE 0 DECISION LOCK (2026-09-13)**: `docs/DECISION_LOCK_2026-09-13.md` → `ARCHITECTURE_LOCK.md` · `DEPLOYMENT_MAP.md` · `BACKGROUND_ASSET_SPEC_v1.md` · `CHARACTER_WEBP_BENCHMARK.md`
- **개발 기준 문서: `docs/MASTER_DEVELOPMENT_DIRECTIVE.md`** (2026-09-13 편입, 원본과 SHA-256 `e41a6652…ca95` 동일, 18,656 B). 현재 골격과의 차이는 `docs/MASTER_DIRECTIVE_RECONCILIATION.md`
- PHASE 1 시작 조건 `docs/PHASE1_READINESS.md` 7/7 PASS → 착수 전 점검 `docs/PHASE1_PRESTART_CHECK.md` 6/6 → **PHASE 1 Paper Earth 보고서 `docs/PHASE1_PAPER_EARTH_REPORT_2026-09-13.md`** (커밋 `71e1b3c4`, Device Verified 0)
- 화면: `apps/web/` = 종이 지구(PHASE 1) · `apps/web/stage/` = 캐릭터 무대(PHASE 0). 엔진 `packages/globe-engine/`, three.js `packages/shared/vendor/three/`
- **Background Pack v1 편입 2026-09-13** `assets/background/` 24장(1920×1080 WebP, 원본 바이트 그대로) + `assets/background_manifest.json` + `assets/background_quality_report.json`. 검수: 내용 위반 0, 그러나 24장 전부 카탈로그 시트 여백/잔재 + 유효 해상도 ≈480p → **REVIEW 24 · production 승인 0**(safe-crop 후보로만 런타임 사용). 선택기 `packages/wonder-environment/src/background-select.mjs`, 환경 화면 `.env-bg` 레이어 + 모션 레이어(MAIN 1 + SECONDARY ≤ 2). 지역·바다 진입도 종이 펼침으로. 보고 `docs/BACKGROUND_PACK_V1_REPORT_2026-09-13.md`
- **상시 테스트 URL 2026-09-13** `https://earthus.net/wonder-test/` (S3 `app/wonder-test/`, 커밋 `1018db1a`; 실기기 `…/?qa=1&device=1`) — `node scripts/build-staging.mjs --target wonder-test` → `TARGET=wonder-test bash scripts/deploy-staging.sh`. 한국을 누르면 한국으로(지역 포커스 = 누른 자리) 수정 포함. 보고 `docs/WONDER_TEST_URL_2026-09-13.md`
- **ROTATION RULE LOCK 2026-09-13** — 지구 회전 규칙은 EARTHUS V2 `OrbitCam` 이식(`ARCHITECTURE_LOCK.md §4-A`, 보고 `docs/ROTATION_RULE_PORT_2026-09-13.md`). 상한·관성 없음, 손가락 1:1, 위도 ±87.135°, 두 손가락 = 줌만, QA 오버레이 v2 = 15단계(극 시험)
- **STAGING 배포 2026-09-13** `https://earthus.net/wonder/next/apps/web/` (S3 `app/wonder/next/`, 커밋 `91bf2330`, 296 put · 삭제 0 · production/app/v3 변경 0) — `docs/STAGING_DEPLOY_REPORT_2026-09-13.md`. 빌드 `node scripts/build-staging.mjs` → 배포 `bash scripts/deploy-staging.sh [--dry-run]`. 실기기 주소 `…/?qa=1&device=1`
- **PHASE 1 FINAL GATE 상태판 `docs/PHASE1_FINAL_GATE.md`** — 7조건 중 4 PASS · 3 PENDING(배경 승인 · Android · iOS). 실기기 결과는 폰 오버레이(`?qa=1&device=1`) [저장] → `docs/device-gate/device/`, 에뮬레이션은 `emulated/`(게이트 근거 아님). `tests/device-gate.test.mjs` 가 판정을 출력
- **PHASE 1-D Visual Polish + Device Gate 보고서 `docs/PHASE1D_VISUAL_DEVICE_GATE_REPORT_2026-09-13.md`** — 배경 24 검사(팩 불합격, 후보 24장 제작·승인 대기), 카드 REGION/CHARACTER/STORY, 실기기 QA 하네스(`?qa=1`, `--lan`, `docs/DEVICE_GATE_CHECKLIST.md`), 전기뱀장어 검증. **Device 0, 배경 승인 0.**
- **PHASE 1-C Interaction · Story Card · Earth Return 보고서 `docs/PHASE1C_INTERACTION_STORY_REPORT_2026-09-13.md`** (커밋 `e1a0e1ff`, 44 tests, 3지역 e2e: 탭·꾹·special·뿡 자격·스토리 카드·복귀, 재방문 네트워크 0, Device 0). 스토리 `content/stories/stories.json`
- **PHASE 1-B Region Entry · Unfold · Wonder Environment 보고서 `docs/PHASE1B_WONDER_ENVIRONMENT_REPORT_2026-09-13.md`** (커밋 `77498fd9`, 41 tests, 3지역 end-to-end 브라우저 검증, Device 0). 패키지 `wonder-environment`(흐름 상태기·카탈로그) · `asset-runtime`(해시 로더·재시도·LRU 30MB·stale). 콘텐츠 `content/environments/`, `content/landmarks/`, `content/characters/thumb/`
- `docs/BUILD_DIRECTIVE_DRAFT_v0.md` 는 **SUPERSEDED** (Master Directive 도착 전 초안, 기록용)
