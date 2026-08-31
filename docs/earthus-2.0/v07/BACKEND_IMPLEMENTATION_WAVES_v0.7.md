# BACKEND IMPLEMENTATION WAVES v0.7

## BACKEND-0 — 먼저 실제 저장소에 붙일 공통 Primitive
BCK-014 Trace Correlation → BCK-015 Secret Vault Adapter → BCK-001 Ingestion Run Ledger → BCK-002 Raw Artifact Receipt → BCK-003 Schema Drift → BCK-005 Idempotency → BCK-004 Watermark/Revision → BCK-009 Quarantine.

완료 예시: 기존 KTO collector 한 개에 Adapter로 붙여 raw receipt / run ledger / schema / watermark가 실제 증거로 남는다. 기존 parser를 다시 쓰지 않는다.

## BACKEND-1 — 안전한 Publish와 Event/Pulse 파이프
BCK-006 Provider Budget → BCK-007 Conditional Fetch → BCK-017 Atomic Publish → BCK-008 Outbox → BCK-011 Canonical Event Store → BCK-012 Event Lineage → NEWS-002/003.

완료 예시: 공식 뉴스/RSS 한 Source와 기존 Public Action Source 한 개를 수집해 중복 기사 cluster, Event link, Earth Pulse payload까지 생성한다.

## BACKEND-2 — Internal API / Release / Ops
BCK-013 API Envelope → BCK-016 Release Config Snapshot → BCK-010 Backfill/Replay + existing OPS/Archive integration.

## 절대 금지
- 200개 기존 v0.6 engine을 다시 구현하지 않는다.
- Provider parser를 공통화한다는 이유로 검증된 KMA/KTO/Seoul/AirKorea parser를 전면 재작성하지 않는다.
- SQS/Kafka/Redis를 '있으면 좋아 보인다'는 이유만으로 먼저 도입하지 않는다.
- PostgreSQL에 대용량 위성/GRIB/raw JSON 본문을 쌓지 않는다.
- schema drift를 빈 배열/0/default 값으로 숨기지 않는다.
