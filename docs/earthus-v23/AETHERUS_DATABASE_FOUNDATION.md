# Aetherus Database Foundation — Sheets 219–232

## 상태

`LOCAL_SCHEMA_CONTRACT_COMPLETE / SQL_MIGRATION_EXTERNAL`. 24개 table registry, Geo·RA/Dec index,
owner RLS, rights link, append-only history, soft delete와 retention 판정을 합성 schema로 검증했다.

## 보호 계약

- Observation, OrbitSnapshot, AuditLog는 append-only다.
- 사용자 관측·Mission Control·follow·alert·notification은 owner RLS와 soft delete를 요구한다.
- MediaAsset, CultureReference, ProviderSource는 RightsRecord 연결 없이는 유효하지 않다.
- SearchDocument에는 private field를 넣지 않는다.
- Geo와 RA·Dec index는 명시적 table/column 계약으로 검증한다.
- retention 기간이 지나도 자동 삭제하지 않고 backup·인간 승인이 필요한 후보로만 표시한다.
- secret/token/private key column은 schema registry에서 거절한다.

## 닫힌 gate

현재 contract는 `DRAFT + productionEnabled=false`다. 실제 SQL migration, FK/unique/check constraint,
RLS policy, index build/EXPLAIN, backup·restore, 운영 retention job과 migration evidence는 미연결이다.
