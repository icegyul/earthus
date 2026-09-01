# AETHERUS V2 — 저장소 기준선 (V2-P0 인테이크 감사 요약)

- 감사일: 2026-09-01 · 모드: 읽기전용(파괴적 명령 0건) · 세부는 동봉 산출물 5종 참조
- 판정: **V2-P0 감사 산출물 완비.** PRODUCT BASELINE: NOT ACCEPTED (Orbital v1.2.1 §0) 전제 유지 — 아래 모든 기존 증거는 정본 저장소에서 재현 전까지 HISTORICAL.

## 저장소 지형

| 저장소 | 위치 | 상태 |
| --- | --- | --- |
| **정본(채택)** | `D:\## APP\EARTHUS v2_APP` (origin: github.com/icegyul/earthus) | 브랜치 `earthus-v2/real-living-earth-render` @ d932142e. 수정 3건·미추적 40건. 워크트리 19개 중 17개 macOS 잔재(prunable, 유실 커밋 없음 확인) |
| **이식 소스(읽기전용)** | `Aetherus 823_Orbital\aetherus-orbital-environment` (로컬 전용, 리모트 없음) | `codex/aetherus-v2-v06-integration` @ 7ac0357 (54커밋)이 이식 기준 트리. main은 P0/P1 수준. 워크트리 7개 중 6개 macOS 잔재 |
| 거부 | `services/aetherus-orbital` | 소스 0개, 캐시(.pyc 67개)만 남은 껍데기 — REJECT. 단 src·tests·migrations 브리지 골격 디렉터리는 P6 이식 착지 지점으로 유지 |

## 구현 자산 분류 (ENGINE_IMPLEMENTATION_MATRIX.csv, 64항목)

- **MIGRATE 58** — 전부 823 통합 브랜치에 존재 (packages/aetherus_* v0.6 제품 라인을 정본으로, backend/* P1~P5 라인은 golden fixture·10k corpus 테스트만 회수)
- **REUSE 2** — E34·E35 시각 계층 = `prototype/v2-three` (⚠️ 현재 git 미추적 — 커밋이 선행 조건)
- **BLOCKED 4** — E22(Space-Track CDM 접근), L01(LLM API 자격증명), S01(프로덕션 IdP), S12(프로덕션 인프라)
- **NEW 0 / RETIRE 0**

## 차단 요인 (MISSING_INPUTS.md)

1. **Docker 미설치** — ORB-P0 인프라(PostGIS·Redis·MinIO) 기동 불가 → 해당 구간 전부 BLOCKED. 해제: PD의 Docker Desktop 설치 결정 (대안: 최상위 `supabase/` 디렉터리 존재 — 클라우드 경로 가능성, PD 결정 필요)
2. **Python 3.14.7 vs 823 pin(>=3.11, numpy 1.26/scipy 1.12는 3.12까지 휠)** — 3.11/3.12 venv 필요
3. **Space-Track 자격증명 부재** (변수명도 브랜치·패키지 간 불일치: SPACETRACK_IDENTITY vs SPACE_TRACK_USERNAME). CelesTrak은 무자격 공개 → P1 착수는 가능
4. 라이선스 의무(SatNOGS CC BY-SA, TraCSS 표기, CelesTrak 캐시 정책) 관련 acceptance 전부 NOT_RUN
5. 세부 불일치: MAX_CATALOG_ID_DIGITS 9(브랜치) vs 10(워킹트리)

## 기계가독 계약

13종 전수 존재 확인 (패키지 4종 + 823 브랜치 9종). 스펙 무결성: 핸드오프 35/35 SHA 일치, Orbital v1.2.1 MANIFEST 해시 일치. 정본 고정: `docs/aetherus-v2-canonical/` (PROVENANCE.md 참조).

## 즉시 착수 가능 트랙 (PHASE_READINESS.md)

- **지금 가능**: V2-P0(본 감사, 완료) · V2-P2 SPACE Core(v2-three 라이브, 차단 없음) · P1/P4의 fixtures 기반 부분 작업 · P8 특허 청구항↔E31-E33 매핑 문서화
- **Docker 설치 후**: V2-P6·P7·P14·P15 및 P8 코드 구간 (823 MIGRATE 계열은 +3.12 venv)
- **자격증명 후**: E22 운영 Pc, L01 LLM 게이트웨이

## 동봉 산출물

GIT_STATE.json · ENGINE_IMPLEMENTATION_MATRIX.csv · LEGACY_REUSE_MAP.md · MISSING_INPUTS.md · PHASE_READINESS.md · (결정) ../../docs/audit/CANONICAL_REPOSITORY_DECISION.md
