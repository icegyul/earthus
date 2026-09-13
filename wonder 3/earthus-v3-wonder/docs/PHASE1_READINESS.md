# PHASE 1 시작 조건 — 상태판 (2026-09-13)

전부 PASS 여야 PHASE 1(Paper Earth)을 시작한다. FAIL/BLOCKED 가 하나라도 있으면 시작하지 않는다.

| # | 조건 | 상태 | 근거 |
|---|---|---|---|
| 1 | Master Directive repo 편입 | **PASS** (13:5x) | `docs/MASTER_DEVELOPMENT_DIRECTIVE.md` — 원본과 SHA-256 `e41a6652…ca95` · 18,656 B · diff 없음 3항목 일치. 수정·요약 없음 |
| 2 | architecture lock | PASS | `docs/ARCHITECTURE_LOCK.md` v1 |
| 3 | deployment collision 없음 | PASS (설계·실측) | `docs/DEPLOYMENT_MAP.md` §2.1 — `app/wonder/next/`·`live/` 미존재 실측, legacy 키 집합과 교집합 없음 |
| 4 | legacy AWS 보호 확인 | PASS | AWS 쓰기 0건. `app/v3/`·별칭 3키·CloudFront·CI·sw.js 무변경. 프로파일에 DeleteObject 없음(실측) |
| 5 | character benchmark 완료 | 실행 완료 → **기준안 승인 대기** | `docs/CHARACTER_WEBP_BENCHMARK.md` — 3종 × 45변형 측정, 기준안 캐릭터 1024 q85 / 장면 1024 q85. PD 승인이 있어야 124 일괄 |
| 6 | background replacement manifest 완료 | PASS (문서) | `content/backgrounds/replacement-manifest.json` 24항목 + `docs/BACKGROUND_ASSET_SPEC_v1.md`. 제작/납품은 별도 |
| 7 | 기존 17/17 테스트 PASS | PASS (17 유지 + 배경 교체 매니페스트 3 = **20/20**) | 아래 실행 기록 |

## 판정

~~PHASE 1 시작 불가 — 조건 1 BLOCKED, 조건 5 승인 대기.~~ (13:44 이전)
**2026-09-13 13:5x: 조건 1 PASS. PHASE 1 시작 불가 사유는 조건 5(벤치마크 기준안 승인) 하나만 남았다.** 6/7 PASS.
지시서 §32 의 PHASE 1 범위(Globe·camera·rotation·zoom·touch·earth return)와 PD 지시(+region entry·responsive)는 `PHASE1_PAPER_EARTH_PLAN.md` 에 반영했다. 코드는 아직 없다.

## 실행 기록

- 2026-09-13 13:2x `node --test "tests/*.test.mjs"` → **tests 20 · pass 20 · fail 0** (interaction-runtime 10 · registry/review/resolver 7 · background-replacement 3)
- 2026-09-13 13:2x `node scripts/build-registry.mjs` → assets 36 (배경 24 중 사용 가능 0, fx 5, 캐릭터 그림 1/124), manifest 124 오류 0
- 2026-09-13 13:2x `python scripts/benchmark-character-webp.py --slugs haetae triceratops red-panda` → 45 변형, `benchmarks/character-webp/results.json`
- AWS 읽기 전용 조회(earthus-deploy): `app/wonder/` 아래 키 3개뿐, `next/`·`live/` 없음. CloudFront E193CZEBLWEB56 기본 오리진 경로 `/app`
- 브라우저: 이번 단계는 UI 변경 없음 → PHASE 0 의 Browser Verified 기록이 그대로 유효(재검증 안 함)
- 2026-09-13 13:44 Master Directive 편입 시도 — `wonder 3/CLAUDE_CODE_EARTHUS_V3_WONDER_WONDER3_MASTER_DIRECTIVE_v1.md` 없음(ls·PowerShell Test-Path 모두 False, Downloads·Desktop·Documents·OneDrive·D:\## APP 최근 120분 검색 0건). 복사 0건, 조건 1 BLOCKED 유지
- 2026-09-13 13:5x Master Directive 편입 **PASS** — ① Test-Path True (LastWriteTime 13:55:17) ② 18,656 B ③ SHA-256 `e41a6652f3d86af0b4a274eaf39e32a7f976d5e07d4d6bf23efb4cb8e9cbca95` ④ 전문 1,310줄 읽음(§0~§37) ⑤ `cp --preserve=timestamps` ⑥ 대상 SHA-256·크기 동일 ⑦ `cmp` 동일·`diff` 없음
