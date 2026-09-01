# CANONICAL REPOSITORY DECISION — AETHERUS V2

> Orbital v1.2.1 `IMPLEMENTATION_ORDER.md`가 의무화한 정본 저장소 결정 문서.
> 결정일: 2026-09-01 · 결정 주체: PD 위임에 따라 Claude Code가 권고안 채택 ("가장 목적에 부합한 걸로 선택 + 모두 착수" 지시, 2026-09-01)

## 1. 선정 결과

**정본 루트: `D:\## APP\EARTHUS v2_APP` (git@github.com:icegyul/earthus.git) — 전제품 모노레포**

- 작업 브랜치: `earthus-v2/real-living-earth-render` (감사 시점 HEAD d932142e)
- AETHERUS 코드 착지 경로: `services/aetherus-orbital/` (기존 브리지 골격), 프론트는 `prototype/v2-three/`

## 2. 선정 이유

1. AETHERUS V2의 목적이 전제품(SPACE/CONTROL/ORBIT 통합 — 하나의 우주, 세 모드)이므로, 이미 EARTHUS 제품·v2-three 실지구(REUSE 대상 E34·E35)·배포 경로가 사는 모노레포가 통합 지점이다.
2. V2 핸드오프(전제품 권위)의 "기존 repo 강제 마이그레이션 금지·최소 변경" 원칙과 정합.
3. 823 저장소는 리모트 없는 로컬 전용이라 정본으로 삼기에 보존성이 약하다.

## 3. 참조 소스 (읽기전용)

| 소스 | 취급 |
| --- | --- |
| 823 `codex/aetherus-v2-v06-integration` @ **7ac0357** | **유일한 이식 기준 트리.** 체크아웃 금지 — `git ls-tree`/`git show`/`git archive`로만 접근. 이식은 모듈 단위 선별 + `docs/audit/imports/<phase>-<source-sha>.md` 기록 후에만 |
| 823 `main` @ 9096ff86 | P0/P1 수준 — 통합 브랜치가 상회하므로 참조만 |
| 823 `backend/*` 라인 | golden fixture·10k corpus 테스트만 회수, 나머지는 packages/aetherus_* 라인이 정본 |
| `prototype/js/space/` 41모듈 | 1.0 큐레이션·계약 스텁 — 과학 소스 아님, UI 참고용만 |
| `AETHERUS_V2/…v0.6.zip`, `v2.5.3/`, `Aetherus 823_Orbital/recovery/` | HISTORICAL 보관 |

## 4. 명시 거부

| 대상 | 사유 |
| --- | --- |
| `services/aetherus-orbital`의 캐시 잔재(.pyc 67개, .mypy/.pytest/.ruff 캐시) | 소스 삭제된 껍데기 — 이식 불가. 정리는 PD 승인 후 |
| macOS 잔재 워크트리 23개(양 저장소 합산, prunable) | 재사용 절대 금지. 대응 브랜치 팁이 전부 로컬에 생존해 유실 커밋 없음 확인 — prune은 PD 승인 후 |
| `recovery/snapn-cross-project-2026-08-24` | 빈 디렉터리 |
| 823의 과거 PASSED 증거 일체 | HISTORICAL — 정본 저장소에서 재현 전까지 현행 증거 아님 (v1.2.1 §0) |

## 5. 페이즈 좌표 결정

**V2 P0~P15 단일 좌표를 정본**으로 한다. Orbital P0~P12 게이트는 모듈 서브게이트로 편입:

| V2 페이즈 | 편입되는 ORB 게이트 |
| --- | --- |
| V2-P1 Foundation | ORB-P0(인프라)·ORB-P1(수집) 재검증 |
| V2-P6 Orbital Core | ORB-P2(궤도전파)·ORB-P3(Explore 3D) |
| V2-P8 Counterfactual Patent Core | ORB-P4(근접분석)·ORB-P5(Benefit)·ORB-P6(PROTECT/OCM) |
| V2-P7 Debris & Observation | ORB-P7~P9 |
| V2-P14 Research/Operations | ORB-P10~P11 |
| V2-P15 Hardening | ORB-P12 |

증거 파일: `artifacts/evidence/p{N}.json` (V2 좌표), 내부 `orbital_phase` 필드 병기. 판정어는 PASS/FAIL/BLOCKED/PARTIAL/HISTORICAL/NOT STARTED 6종만 사용.

## 6. 스펙 정본

`docs/aetherus-v2-canonical/` — claude_handoff_v1.1(전제품 권위) + orbital_codex_v1.2.1(ORBIT 시퀀싱 권위). 무결성·출처: 같은 폴더 PROVENANCE.md.

## 7. 미결(PD 결정 대기)

1. Docker Desktop 설치 vs `supabase/` 클라우드 경로 — ORB-P0 인프라 차단 해제 방법
2. Space-Track 자격증명 주입 시점
3. macOS 잔재 워크트리 prune·`services/aetherus-orbital` 캐시 정리 승인 (파괴적 — 명시 승인 필요)
4. 구독 과금 경계 확정 · production 전환 승인(V2-P15)
