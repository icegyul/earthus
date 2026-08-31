# EARTHUS 2.0 v0.7 — BACKEND DATA PLANE PRODUCTION FOUNDATION

## 1. 목적
v0.7은 새로운 화면을 만드는 버전이 아니다. Earthus 1.0에서 이미 운영 중인 Provider별 수집기와 S3/CloudFront/Supabase 자산을 보존하면서, 서로 흩어진 백엔드 공통 규칙을 하나의 재사용 가능한 Foundation으로 만든다.

핵심 원칙:
1. 기존 KTO/서울/KMA/AirKorea parser와 운영 collector는 재작성하지 않는다.
2. 사용자 요청이 외부 Provider를 직접 호출하지 않는다. Collector → Raw Receipt → Normalize → Publish → Internal API를 사용한다.
3. Raw payload는 S3/Object Storage immutable artifact로 보존하고 PostgreSQL/Supabase에는 메타데이터/인덱스/제어 상태를 둔다.
4. Breaking schema drift, identity collision, parser/semantic failure는 quarantine 후 last-good을 보존한다.
5. 관측/공식예보/공식경보/모델/Earthus 파생/시뮬레이션 Truth Contract를 변경하지 않는다.
6. 공식 안전정보는 quota/cost 최적화보다 우선하되 실제 Provider hard limit을 초과한다고 가정하지 않는다.

## 2. 목표 런타임 흐름

```text
Provider Registry
   ↓
Quota / Rate Budget
   ↓
Conditional Fetch (ETag / Last-Modified)
   ↓
Ingestion Run Ledger
   ↓
Raw Artifact Receipt → S3 immutable raw/
   ↓
Schema Contract / Drift
   ├─ BREAKING → Quarantine
   ↓
Existing Provider Parser / Adapter
   ↓
Idempotency + Revision + Watermark
   ↓
Canonical Signal Contract
   ↓
Atomic Publish / Last-Good Pointer
   ↓
Canonical Signal Lake (S3) + metadata index (Supabase/Postgres)
   ↓
Durable Outbox
   ├─ EarthEvent / Pulse
   ├─ Watch / Notification
   ├─ Ground Truth / ModelOps
   └─ Analytics
   ↓
Internal API Envelope
   ↓
/v2 client
```

## 3. News / Public Action backend

```text
Governed Source Registry
 → RSS / Atom / API / approved official HTML
 → Conditional Fetch
 → Raw Receipt
 → bounded metadata normalization
 → News Cluster / PublicAction normalization
 → NEWS-001 geospatial link + ACT trust/location/status
 → Canonical Event Store
 → Event Lineage
 → Earth Pulse
```

기사를 서버에 복제 보관하는 시스템이 아니다. 기본값은 제목/매체/발행시각/짧은 요약/원문 URL/위치/주제/Event ID다. Full text와 이미지는 Source Rights가 명시적으로 허용할 때만 별도 정책을 적용한다.

## 4. 저장소 경계
- S3 HOT: raw artifacts, normalized signals, current/last-good objects, event capsule payloads.
- Supabase/PostgreSQL: ingestion metadata, schema contracts, watermarks, dedupe keys, quarantine, outbox, canonical event metadata, lineage, source fetch state, release config snapshots.
- NAS: 장기 archive. LIVE 요청 경로에 직접 두지 않는다.
- Browser: Internal API/public CDN의 검증된 결과만 소비한다. Secret/Provider key 없음.

## 5. Queue 전략
현재 1.0의 EventBridge→Lambda 직접 구조를 강제로 SQS로 전면 교체하지 않는다. v0.7 Outbox는 durable hand-off contract다.
- Stage A: Postgres/S3 outbox + scheduled drainer 또는 기존 EventBridge consumer.
- Stage B: 처리량/재시도 근거가 생기면 SQS standard/FIFO adapter 추가.
- DLQ는 poison record와 delivery failure를 구분한다.

## 6. Production Gate
백엔드 DONE은 모듈/테스트 파일 존재가 아니다.
- 실제 Provider smoke
- raw receipt 존재
- schema snapshot 존재
- normalized provenance rawHash 일치
- current/last-good atomic promotion 증거
- watermark/backfill 재실행 증거
- duplicate/revision test
- quota/429/5xx test
- quarantine/replay test
- Internal API response + trace id
- CloudWatch/Supabase 로그에서 secret 0건
- 기존 `/` 회귀 0건
이 있어야 Production-active로 승격한다.
