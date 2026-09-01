# IMPORT RECORD — ORB-P0 인프라·마이그레이션 체인 이식

> 이식일: 2026-09-01 · 소스: 823 `codex/aetherus-v2-v06-integration` @ 7ac0357 (git archive, 체크아웃 없음)

## 이식 대상 (14파일)

| 클러스터 | 경로 | 무결성 |
| --- | --- | --- |
| 마이그레이션 체인 8종 | `services/aetherus-orbital/migrations/001~008*.sql` | 블롭 해시 소스 일치 |
| P0 백본 5종 | `services/aetherus-orbital/backend/{__init__,config,database}.py`, `backend/migrations/{__init__,migrate}.py` | 블롭 해시 소스 일치 (13/13) |
| compose (신규 작성) | `services/aetherus-orbital/docker-compose.yml` | 823 원본 기반, api 서비스 제외(코드 이식 전) — 원본 그대로 아님을 명기 |

## 이식 심사 (규칙 ①~⑦)

1. **주장 단계**: ORB-P0 (인프라·마이그레이션·이력)
2. **mock 검사**: migrate.py는 실 DB 실행 러너(자체 SQL 렉서, schema_migrations 이력) — mock/상수반환 없음. config.py 기본값은 로컬 개발 자격증명(프로덕션 미사용 명기)
3. **계약 검증**: 적용 결과가 schema.sql 계열 계약과 정합한지는 다음 단계(스키마 대조 테스트)에서 — 한계로 기재
4. **선별**: 러너 의존 최소 집합만 (ingestion·과학 코드는 이후 단계에서 별도 심사)
5. **테스트**: 라이브 적용 8/8 성공 + 스키마 검증 쿼리 (자동 테스트 이식은 후속)
6. **증거**: `artifacts/evidence/p1.json` — 라이브 DB 질의 결과로 생성 (수기 금지 규칙 준수)
7. **기록**: 본 문서 + `docs/audit/MIGRATION_CHAIN_DECISION.md`

## 한계

- 823의 pytest 스위트(마이그레이션 테스트 포함) 미이식 — 코드 이식 단계에서 함께
- CI 워크플로·헬스 엔드포인트·evidence 생성기 미이식 → **ORB-P0 게이트는 아직 PARTIAL** (인프라·마이그레이션 구간만 실행 재현됨)
- compose는 MinIO 미포함 — raw 저장은 당분간 파일시스템 + S3 호환 어댑터 계약 경로(1.2.1 허용 조건) 유지, 필요 시 MinIO 서비스 추가
