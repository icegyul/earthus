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
├─ scripts/             build-registry.mjs · convert-characters-webp.py · dev-server.mjs
├─ tests/               node --test
└─ docs/                팩 문서 사본 · PHASE 보고서 · 빌드 지시서 초안
```

## 실행

```bash
npm run registry      # content/ 를 재서 registry·manifest 생성 (팩 카탈로그 해시 대조, 검수 없는 배경은 오류)
npm test              # 17 tests
npm run dev           # http://127.0.0.1:8790/apps/web/   (Claude 데스크톱: launch.json "wonder3-static")
python scripts/convert-characters-webp.py --only yeti     # 레거시 pack124 PNG → WebP (원본은 읽기만)
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
- PHASE 1 시작 조건 상태판: `docs/PHASE1_READINESS.md` (6/7 PASS, 남은 것은 WebP 기준안 승인) · 계획 `docs/PHASE1_PAPER_EARTH_PLAN.md`
- `docs/BUILD_DIRECTIVE_DRAFT_v0.md` 는 **SUPERSEDED** (Master Directive 도착 전 초안, 기록용)
