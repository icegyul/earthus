# MIGRATION CHAIN DECISION — 단일 체인 확정

> 결정일: 2026-09-01 · 근거: 823 브랜치 11개 SQL 전수 대조 분석 (읽기전용, git show)

## 결정

**페이즈형 `migrations/001~008` 8파일이 유일한 실행 정본 체인이다. `db/migrations/0001~0003`(계약형)은 실행하지 않는다.**

## 근거

1. **008 ⊃ 계약형 전체**: `008_v06_product_schema.sql`은 `CREATE SCHEMA aetherus_product` 후 계약형 3개 파일을 바이트 단위 그대로 내장한다(diff 확인). 계약형을 따로 적용할 이유가 없다.
2. **러너·CI·런타임이 전부 이 체인 전제**: `backend/migrations/migrate.py`(기본 `migrations/`), CI, Makefile, staging의 `PostgresProductRepository`(→ `aetherus_product.*` 한정 이름 쿼리 = 008이 만든 테이블).
3. **계약형 직접 실행은 유해**: 동명 이형 테이블 4종(data_source·ingestion_run·raw_artifact·identity_conflict) 때문에 public에 직접 실행하면 페이즈형 테이블이 오염된다(0001의 IF NOT EXISTS 무음 스킵 + 0002의 ALTER/트리거 오염).
4. 충돌 해소는 이미 008의 스키마 네임스페이스 분리로 완결 — "적용된 마이그레이션 수정 금지, 신규 추가만" 원칙과 부합.

## 규칙 (이후 마이그레이션)

- 신규 변경은 **009+ 신규 파일로만**. 파일명 개명 금지(러너가 stem으로 이력 대조).
- **009+ 첫 줄에 `SET search_path TO public;`**(또는 대상 스키마) 명시 — 008의 search_path가 세션에 잔류하므로.
- v0.6 계약 변경도 0001~0003·008 수정이 아니라 aetherus_product 대상 009+로.
- 동명 이형 4종은 코드·쿼리에서 항상 스키마 한정. 정본 이력은 `public.schema_migrations`.
- append-only 트리거 다수(P4·P5·제품 스키마) — 정정은 INSERT-only, UPDATE/DELETE는 DB가 거부.
- `db/migrations/`·`db/schema.sql`(0003 누락 스냅샷)은 계약 참고 문서로만 보존.

## 적용 결과 (2026-09-01, 라이브 검증)

- 대상: `aetherus-postgres` (postgis/postgis:15-3.4) — 신규 빈 DB
- `python -m backend.migrations.migrate` 실행: **8/8 적용, schema_migrations 이력 8행**
- 테이블: public 31 + aetherus_product 69 (계 100) · 사용자 트리거 39 · PostGIS 3.4 · data_source 시드 2건(celestrak/spacetrack)
- 증거: `artifacts/evidence/p1.json`
