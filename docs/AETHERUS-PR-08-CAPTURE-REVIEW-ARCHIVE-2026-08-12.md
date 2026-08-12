# Aetherus PR-08 — Capture → Review → Archive

> 기준일: 2026-08-12 (Asia/Seoul)
> 선행 기준: `docs/AETHERUS-PR-07-ASTROMETRY-CORE-2026-08-12.md`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx` ENG-407 / ENG-408 / ENG-501 / ADR-018 / PART XVI PR-07
> 저장소 매핑: 제품 사진 소유권 PR이 삽입되어 Word의 PR-07은 저장소 PR-08에 해당한다.
> 시작 기준: `52c1b67`; 종료 전 동시 작업 기준: `4fd9df0`
> 현재 상태: `LOCAL_CORE_IMPLEMENTED / INDEXEDDB_VERIFIED / DEV_STATIC_ARTIFACT_DEPLOYED / PUBLIC_RUNTIME_NOT_RELEASED / CAMERA_AND_CLOUD_NOT_IMPLEMENTED`

## 0. 결론

이 PR은 카메라 앱이나 cloud archive를 출시하는 PR이 아니다. PR-05가 보존한 local observation
session 뒤에, 사용자가 제공한 바이트를 다음 다섯 가지 증거와 함께 다루는 첫 local-first
vertical slice다.

1. RAW 바이트의 immutable SHA-256과 독립 asset identity
2. 원본을 바꾸지 않는 deterministic recipe derivative
3. 각 part checkpoint를 가진 명시적 multipart resume
4. 실제 payload를 다시 검증할 수 있는 export manifest/package checksum
5. active replica, derivative, cache, backup 상태를 포함한 deletion receipt

```text
file/worker bytes
  → CaptureJob QUEUED → PREPARING → CAPTURING → DRAINING → COMPLETED
  → immutable RawAsset(contentDigest, observedAtUtc, provenance)
  → ReviewSet UNREVIEWED → ASSESSED → SELECTED → PROCESSED → APPROVED
  → separate DerivativeAsset(sourceDigest + recipeDigest + derivativeDigest)
  → ArchiveObject STAGING → HOT
  → explicit multipart upload: UPLOADING ↔ PAUSED → VERIFIED
  → export manifest + payload envelope + SHA-256
  → explicit deletion: replica proof → derivative/raw cascade → signed receipt
```

실제 camera/media device API, FITS/RAW/JPEG/PNG decoder, account sync, production object storage,
provider durability, cloud backup, AI processing, scientific submission은 구현하지 않는다. 해당 입력과
adapter가 없는데 성공처럼 보이는 상태도 만들지 않는다.

## 1. ADR-022 — 불변 원본과 영수증을 local media 경계의 정본으로 채택

### 1.1 결정

| 항목 | 결정 |
|---|---|
| authoritative owner | 현재 기기의 IndexedDB; 테스트는 같은 contract의 memory repository |
| capture input | pre-captured `Uint8Array` file/worker port만 허용 |
| RAW identity | 관측 asset ID와 `sha256:<contentDigest>`를 분리 |
| RAW mutation | 같은 asset ID에 다른 digest/byte length write 금지 |
| review | raw digest를 고정한 non-destructive state machine |
| processing | `LINEAR_LEVELS_U8` deterministic fixture recipe 한 종류 |
| derivative | RAW와 다른 asset ID, `calculated`, source/recipe/output digest 보존 |
| archive | local replica가 먼저 VERIFIED되어야 HOT |
| upload | explicit consent + injected adapter + part checkpoint + final digest |
| retry | 자동 재시도 0; transport interruption 뒤 새 explicit 호출로만 resume |
| export | canonical JSON manifest와 payload envelope를 각각 검증 |
| deletion | remote replica와 backup gate를 먼저 확인한 뒤 local cascade |
| receipt | 완료·차단·불완전 상태 모두 immutable SHA-256 receipt로 기록 |
| event bus/server | 도입하지 않음 |

Word ADR-018은 local raw가 먼저이며 cloud tier는 storage cost와 삭제 계약 뒤에만 추가하도록
고정한다. 현재 저장소는 buildless static ES module과 IndexedDB가 있으므로, 먼저 repository
contract와 local state machine을 만들고 production cloud/vendor를 선택하지 않는다.

### 1.2 채택하지 않은 대안

- 단일 mutable media row: 원본과 파생물을 같은 ID로 덮어써 provenance와 삭제 범위를 증명할 수 없다.
- UI row만 삭제: remote replica, cache, derivative, backup 상태가 남아도 완료처럼 보인다.
- upload 실패 자동 재시도: consent, 비용, 네트워크, storage 오류를 숨길 수 있다.
- server API 선행: 현재 repository에는 account media authority, provider contract, cost proof가 없다.
- 실제 카메라 권한 연결: Sky AR의 카메라 수명주기와 Capture의 원본 보존 계약을 한 PR에서 섞는다.
- AI 자동 보정: raw/derived provenance와 사람 승인, model version, evaluation gate가 없다.
- ZIP 구현: 첫 slice에서는 canonical JSON envelope가 byte/checksum 계약을 더 작게 검증한다.

## 2. Bounded context와 책임

### 2.1 Capture owns

- `CaptureJob` schema, revision, state transition과 command idempotency
- imaging plan/session link와 device capability snapshot
- storage/power/safety input validation
- frame sequence와 immutable `RawAsset`
- raw digest, byte count, 관측 시각, privacy/provenance metadata
- local abort, pause/resume, drain/final integrity verification

책임 밖: 실제 camera control, autofocus/guiding/meridian flip, image decode, astrometric success,
cloud upload, review decision, archive retention.

### 2.2 Review owns

- `ReviewSet`, assessment, user selection, processing recipe와 approval/rejection
- null을 보존하는 quality proxy와 명시적 flag
- raw digest 재검증
- recipe normalization/digest와 deterministic derivative
- raw/derivative identity·provenance 분리
- source deletion 뒤 review record의 `SOURCE_DELETED` 상태

책임 밖: 원본 capture, 실제 calibration decoder, FITS semantics, photometry, AI, public moderation,
scientific submission.

### 2.3 Archive owns

- `ArchiveObject`, retention/legal hold, local/remote replica manifest
- resumable upload checkpoint와 final checksum
- export manifest/package와 checksum verifier
- deletion preflight, cascade, incomplete/blocked/completed receipt
- local raw auto-delete 금지와 replica-aware deletion ordering

책임 밖: image processing, license interpretation, billing, provider selection, 실제 backup 운영,
account authentication.

## 3. 실행 인터페이스

### 3.1 Repository ports

```js
createMemoryObservationMediaRepository()
createIndexedDbObservationMediaRepository({ indexedDb? })

repository.read(collection, id)
repository.list(collection)
repository.applyMutation({
  preconditions,
  immutableWrites,
  writes,
  deletes,
  command?,
  result?
})
```

`applyMutation`은 revision/content digest precondition, immutable write, command record를 하나의
IndexedDB transaction으로 처리한다. memory repository는 같은 contract의 deterministic fixture다.

### 3.2 Capture port

```js
const capture = createCaptureOrchestrator({ repository, now?, idFactory? });

capture.queue({
  jobId?, sessionId, imagingPlan, deviceCapabilities,
  storage, power, safetyGate, idempotencyKey?
})
capture.prepare({ jobId, expectedRevision, idempotencyKey? })
capture.start({ jobId, expectedRevision, idempotencyKey? })
capture.storeFrame({
  jobId, expectedRevision, idempotencyKey?, bytes,
  expectedDigest?, observedAtUtc, mediaType, dimensions?
})
capture.pause(...) / capture.resume(...)
capture.drain(...) / capture.finalize(...)
capture.abort(...)
capture.load(jobId)
```

`deviceCapabilities.physicalControl`은 반드시 `false`다. 이는 실제 camera adapter를 흉내 내는
boolean이 아니라 현재 port가 file/worker bytes까지만 받는다는 실행 경계다.

### 3.3 Review port

```js
const review = createReviewProcessor({ repository, now?, idFactory? });

review.create({ reviewId?, rawAssetIds, idempotencyKey? })
review.assess({ reviewId, expectedRevision, assessments, idempotencyKey? })
review.select({ reviewId, expectedRevision, selectedAssetIds, reason?, idempotencyKey? })
review.process({ reviewId, expectedRevision, recipe, idempotencyKey? })
review.approve({ reviewId, expectedRevision, confirmedByUser, idempotencyKey? })
review.reject({ reviewId, expectedRevision, confirmedByUser, reason?, idempotencyKey? })
review.reproduce(derivativeAssetId)
```

### 3.4 Archive port

```js
const archive = createObservationArchive({ repository, now?, idFactory? });

archive.stage({ archiveId?, rawAssetId, derivativeAssetIds, retention, idempotencyKey? })
archive.commitLocal({ archiveId, expectedRevision, idempotencyKey? })
archive.uploadReplica({ archiveId, adapter, explicitUserConsent, partSize })
archive.exportPackage({ archiveIds, exportId? })
archive.delete({ archiveId, receiptId?, explicitUserConfirmation, adapters })
archive.load(archiveId)

verifyObservationArchiveExport(packageBytes)
verifyObservationDeletionReceipt(receipt)
```

`createMemoryMultipartArchiveAdapter`는 interruption/checksum/delete fixture를 검증하는
`TEST_MEMORY_ONLY` adapter다. `productionApproved=false`이며 운영 vendor adapter가 아니다.

## 4. 데이터 모델

### 4.1 CaptureJob

```json
{
  "schema": "earthus.capture-job.v1",
  "jobId": "capture-main",
  "sessionId": "session-main",
  "planRevision": "plan-mars-20260812-r1",
  "targetId": "mars",
  "state": "CAPTURING",
  "revision": 4,
  "rawAssetIds": ["raw_capture-main_000001_..."],
  "frameCount": 1,
  "byteCount": 12,
  "checkpoint": {
    "lastRawAssetId": "raw_capture-main_000001_...",
    "lastContentDigest": "sha256 hex",
    "frameSequence": 1
  },
  "telemetry": {
    "networkRequestCount": 0,
    "originalUploadCount": 0,
    "physicalDeviceCommandCount": 0
  }
}
```

### 4.2 RawAsset

```json
{
  "schema": "earthus.observation-raw-asset.v1",
  "assetKind": "RAW_OBSERVATION",
  "immutable": true,
  "contentId": "sha256:<digest>",
  "contentDigest": "<digest>",
  "digestAlgorithm": "SHA-256",
  "byteLength": 12,
  "observedAtUtc": "2026-08-12T03:01:00.000Z",
  "capturedAtUtc": "2026-08-12T03:00:03.000Z",
  "provenance": {
    "classification": "observation",
    "origin": "USER_CAPTURED_RAW",
    "evidence": "RAW_BYTES_SHA256"
  },
  "privacy": {
    "originalFilenameStored": false,
    "filePathStored": false,
    "exifLocationStored": false,
    "location": "REDACTED_BY_DEFAULT"
  }
}
```

`capturedAtUtc`와 `observedAtUtc`는 device-recorded metadata이며 독립 천문 검증 시각으로 승격하지
않는다. sample count는 실제 stored frame 수이며 missing quality metric은 `null`로 남긴다.

### 4.3 ProcessingRecipe와 DerivativeAsset

```json
{
  "schema": "earthus.processing-recipe.v1",
  "operation": "LINEAR_LEVELS_U8",
  "parameters": { "blackPoint": 8, "whitePoint": 220 },
  "processor": {
    "kind": "DETERMINISTIC_LOCAL",
    "version": "aetherus-linear-levels-u8-v1"
  },
  "calibrationAssetIds": [],
  "recipeDigest": "<sha256>"
}
```

Derivative는 `sourceRawAssetId`, `sourceRawDigest`, `recipeDigest`, output `contentDigest`를 모두
보존한다. provenance는 `calculated`, `aiGenerated=false`다. 동일 recipe를 다시 실행하면 동일
output digest여야 한다. 현재 연산은 decoder가 없는 U8 byte-plane fixture이므로 천문 보정이나
사진 품질 기능으로 표시하지 않는다.

### 4.4 ArchiveObject

```json
{
  "schema": "earthus.observation-archive-object.v1",
  "state": "HOT",
  "rawAssetId": "raw_...",
  "rawDigest": "<sha256>",
  "derivativeAssetIds": ["derivative_..."],
  "retention": {
    "mode": "KEEP_UNTIL_USER_DELETE",
    "untilUtc": null,
    "legalHold": false
  },
  "replicas": [
    {
      "kind": "LOCAL",
      "state": "VERIFIED",
      "contentDigest": "<sha256>",
      "backup": { "status": "NOT_CONFIGURED", "expiresAtUtc": null }
    }
  ]
}
```

## 5. 상태 머신

### 5.1 Capture

```text
QUEUED
  → PREPARING
  → CAPTURING ↔ PAUSED
  → DRAINING
  → COMPLETED

non-terminal → ABORTED
validation/storage/checksum failure → state/revision unchanged
```

`storeFrame`은 raw immutable record와 job revision을 같은 transaction으로 기록한다. checksum,
size, media type, storage budget, state가 하나라도 실패하면 frame과 revision 모두 추가하지 않는다.

### 5.2 Review

```text
UNREVIEWED
  → ASSESSED
  → SELECTED
  → PROCESSED
  → APPROVED

UNREVIEWED | ASSESSED | SELECTED | PROCESSED → REJECTED
archive deletion cascade → SOURCE_DELETED
```

`APPROVED`는 user review approval일 뿐 scientific submission 승인이나 관측 사실 검증이 아니다.

### 5.3 Archive

```text
STAGING → HOT
HOT → DELETING → DELETED
legal hold → deletion BLOCKED receipt; object remains HOT
missing adapter/backup pending → BLOCKED/PENDING receipt; object preserved
remote delete failure → DELETING + INCOMPLETE receipt; local original preserved
```

WARM/COLD/RESTORING은 schema evolution을 위해 예약하지만 현재 transition command는 없다.
provider와 restore evidence 없이 tier를 바꾸지 않는다.

## 6. RAW 불변성

RAW 보호는 다음 세 층이다.

1. `storeFrame`에서 실제 bytes SHA-256과 optional expected digest를 비교한다.
2. repository immutable write는 같은 asset ID의 digest/byte length 변경을 거부한다.
3. review, finalize, archive, export는 소비 직전에 bytes를 다시 hash한다.

관측 asset ID는 job/sequence/digest 일부를 포함하고, content identity는 전체 SHA-256이다. 동일한
바이트의 서로 다른 노출이 같은 관측 asset으로 합쳐지지 않으면서 storage adapter는 content ID로
dedup 후보를 판단할 수 있다. 현재 repository는 storage dedup 최적화를 구현하지 않는다.

## 7. Recipe determinism과 원본/파생 분리

현재 recipe는 각 U8 byte를 다음 정수 규칙으로 변환한다.

```text
output = clamp(round((input - blackPoint) × 255 / (whitePoint - blackPoint)), 0, 255)
```

- normalized recipe canonical JSON의 SHA-256을 `recipeDigest`로 사용한다.
- raw bytes를 복사해 연산하며 raw store에는 write하지 않는다.
- derivative는 별도 immutable record다.
- reproduce는 stored derivative bytes, raw bytes, recipe output을 각각 hash한다.
- calibration asset이 들어오면 decoder가 없으므로 명시적으로 거부한다.
- AI processor 종류는 허용 목록에 없으므로 명시적으로 거부한다.

## 8. Multipart resume

### 8.1 Checkpoint

```json
{
  "schema": "earthus.archive-upload-checkpoint.v1",
  "uploadId": "upload:archive-main:adapter-id",
  "contentDigest": "<raw sha256>",
  "partSize": 4,
  "partCount": 3,
  "uploadedParts": [0],
  "state": "PAUSED",
  "lastError": "ARCHIVE_TRANSPORT_INTERRUPTED"
}
```

### 8.2 Resume rule

1. explicit upload consent와 injected adapter를 확인한다.
2. raw bytes와 archive digest를 다시 비교한다.
3. 기존 checkpoint의 content digest/part size를 고정한다.
4. 이미 확인한 part는 건너뛴다.
5. 각 part digest/byte length를 adapter 응답과 비교하고 바로 checkpoint한다.
6. interruption은 `PAUSED`, automatic retry count 0으로 반환한다.
7. 새 explicit 호출만 다음 part부터 재개한다.
8. complete 응답의 전체 digest/byte length가 raw와 같아야 remote replica를 추가한다.

adapter가 전체 checksum을 잘못 돌려주면 checkpoint는 `BLOCKED`가 되고 archive에는 verified
replica가 추가되지 않는다.

## 9. Export package

첫 slice export는 deterministic canonical JSON envelope다.

```text
manifestCore
  → canonical JSON
  → manifestDigest SHA-256

raw/derivative exact bytes
  → base64 payload map
  → canonical export envelope bytes
  → packageDigest SHA-256
```

manifest는 archive state, retention, replica count, asset kind/media type/byte length/content digest,
provenance, source raw ID, recipe digest, privacy exclusion을 가진다. verifier는 manifest digest만 보지
않고 모든 embedded payload를 decode하여 byte length와 asset digest를 다시 계산한다.

JSON envelope는 ZIP의 최종 UX가 아니다. 실제 대용량 export 전에 streaming, memory ceiling,
파일 이름 정책, browser save, ZIP64, mobile storage를 별도 spike로 검증한다.

## 10. Deletion receipt

### 10.1 완료 전 gate

- explicit user confirmation
- legal hold false
- 모든 remote replica의 delete adapter 존재
- backup status가 `NOT_CONFIGURED`, `EXPIRED`, 또는 완료시각 이전 expiry
- raw digest 재검증
- derivative와 관련 review record inventory

### 10.2 실행 순서

```text
remote verified replicas delete
  → any failure: INCOMPLETE receipt, local raw preserved
  → all verified: derivative/raw local transaction delete
  → related ReviewSet SOURCE_DELETED
  → ArchiveObject DELETED
  → immutable COMPLETED receipt
```

동일 receipt ID의 재요청은 기존 receipt를 반환한다. incomplete receipt 뒤 재개는 사람이 새
explicit deletion receipt ID로 실행한다. remote deletion이 이미 끝났으면 adapter의
`MISSING_ALREADY`도 성공적인 멱등 증거로 인정한다.

### 10.3 Receipt contents

- raw asset ID/digest/status
- derivative ID/digest/status
- replica ID, adapter, object key, digest, delete result
- cache status
- backup status/expiry
- 관련 review record의 `SOURCE_DELETED`
- requested/completed UTC
- status/reason
- receipt canonical SHA-256

완료 verifier는 raw deletion, 모든 replica result와 backup expiry를 다시 확인한다.

## 11. 실패, 재시도, 복구

| Failure | Result | State/data behavior | Automatic retry |
|---|---|---|---:|
| invalid plan/device/safety | validation error | job 미생성 | 0 |
| frame checksum mismatch | `CAPTURE_FRAME_CHECKSUM_MISMATCH` | job revision/raw 수 불변 | 0 |
| frame too large/storage exhausted | exact capture error | 기존 raw 보존 | 0 |
| IndexedDB quota | `OBSERVATION_MEDIA_STORAGE_PRESSURE` | transaction 전체 미적용 | 0 |
| stale revision | `MEDIA_REVISION_CONFLICT` | last-write-wins 없음 | 0 |
| idempotency key reuse/different digest | `MEDIA_IDEMPOTENCY_CONFLICT` | 기존 command 결과 보존 | 0 |
| raw/derivative bit rot | exact checksum error | processing/archive/export 중단 | 0 |
| missing source | `REVIEW_SOURCE_DELETED` | 성공 derivative 생성 금지 | 0 |
| unsupported calibration/AI recipe | exact recipe error | raw/derivative 불변 | 0 |
| upload interruption | `PAUSED` checkpoint | 확인된 part 유지 | 0 |
| final upload checksum mismatch | `BLOCKED` | remote verified replica 미등록 | 0 |
| export payload tamper | asset checksum error | VERIFIED 금지 | 0 |
| legal hold | blocked receipt | object/raw/derivative 보존 | 0 |
| remote adapter missing | blocked receipt | local delete 시작 금지 | 0 |
| remote delete failure | incomplete receipt | local raw/derivative 보존 | 0 |

storage/permission/validation/license/checksum failure를 transient로 추정하지 않는다. production
adapter가 실제 transport error taxonomy와 bounded retry를 증명하더라도 자동 원본 upload/delete는
허용하지 않는다.

## 12. Offline, cache, sync

- Capture, Review, local Archive, export는 network 없이 동작한다.
- IndexedDB가 authoritative store다.
- 같은 DB를 새 repository instance로 열어 job/raw/review/archive를 복원한다.
- upload는 adapter와 consent가 없으면 시작할 수 없다.
- account sync, cross-device merge, remote pull은 `NOT IMPLEMENTED`다.
- cache inventory는 현재 `NOT_CONFIGURED`만 생성한다.
- archive delete는 cache가 구현되면 실제 clear receipt 없이는 `CLEARED`로 바꾸지 않는 adapter가 필요하다.
- service worker에 RAW/derivative를 자동 precache하지 않는다.
- timer, polling, `requestAnimationFrame`, hidden retry loop가 없다.

## 13. Security와 privacy

- 원본 filename, local path, EXIF location을 저장하지 않는다.
- 관측 위치는 기본 `REDACTED_BY_DEFAULT`다.
- 원본 bytes는 URL, analytics, console, error details에 넣지 않는다.
- Web Crypto SHA-256이 없으면 무결성 기능을 강등하지 않고 중단한다.
- physical device control은 capability validation에서 `false`만 허용한다.
- cloud upload는 explicit user consent와 adapter 둘 다 필요하다.
- delete는 explicit user confirmation과 모든 replica adapter가 필요하다.
- legal hold와 unknown/pending backup은 fail-closed한다.
- memory multipart adapter는 test scope이며 production approval이 false다.
- AI processing과 scientific submission path는 없다.
- 별도 device secret, access token, user email을 저장하지 않는다.

## 14. 검증 증거

### 14.1 자동 fixture

```text
NODE_NO_WARNINGS=1 node tools/test_aetherus_observation_media.mjs
```

검증 범위:

1. Capture 전체 transition, pause/resume/drain/finalize
2. queue/transition/frame duplicate command 결과 재사용
3. expected raw checksum mismatch에서 revision/raw 수 불변
4. storage pressure에서 기존 job/raw 보존
5. raw digest와 observation provenance/privacy
6. quality null preservation과 frame별 sample count
7. raw/derivative 별도 ID와 별도 provenance
8. recipe normalization/digest와 output 재현
9. raw bytes before/after 불변
10. stored derivative bit-rot 검출
11. raw bit-rot archive 차단
12. local archive HOT commit
13. multipart part 1 interruption, explicit resume, exact remote bytes
14. final remote checksum mismatch에서 replica 미등록
15. export manifest/payload 전체 검증
16. valid JSON payload tamper fail-closed
17. remote adapter missing deletion 차단과 원본 보존
18. remote deletion failure에서 DELETING/incomplete receipt와 원본 보존
19. 새 explicit deletion command의 remote/local cascade와 review source deletion
20. duplicate completed deletion receipt
21. legal hold 차단 receipt와 HOT/raw 보존
22. 30-run local abort benchmark
23. source network/timer/animation/camera API 0

최종 자동 fixture 결과:

```text
PASS: immutable RAW, deterministic recipe derivatives, explicit multipart resume,
export checksums, replica-aware deletion receipts, storage/bit-rot/legal-hold failures,
and local abort p95 0.15ms
```

### 14.2 실제 browser

로컬 HTTP에서 static module을 import하고 browser IndexedDB와 Web Crypto로 전체 핵심 경로를
실행했다. 임시 QA HTML은 검증 뒤 삭제했다.

```text
secure context: true
Web Crypto: true
IndexedDB: true
repository: INDEXEDDB_LOCAL_AUTHORITATIVE
capture: COMPLETED
new repository instance persisted capture: COMPLETED
raw immutable: true
raw bytes: 12
raw digest: 6268a3f4f06de04d8866af70fa0d65b1042132eaf937177cf89a6e81cad6a7dd
derivative separate ID: true
derivative provenance: calculated
recipe reproduction: VERIFIED
export verification: VERIFIED
export asset count: 2
final deletion verification: VERIFIED
unlisted linked derivative discovered in receipt: true
raw after deletion: null
derivative after deletion: null
review after deletion: SOURCE_DELETED
network/original upload/physical device command: 0/0/0
console error: 0
```

이는 desktop browser evidence이며 실제 iOS/Android file picker, camera API, 큰 RAW/FITS, storage
pressure, background termination evidence가 아니다.

### 14.3 회귀

```text
node tools/test_aetherus_astrometry.mjs
node tools/test_aetherus_sky_ar.mjs
node tools/test_aetherus_observation_session.mjs
node tools/test_aetherus_observation_planner.mjs
node tools/test_aetherus_astronomy.mjs
node tools/test_aetherus_foundation.mjs
node tools/test_aetherus_photo_ownership.mjs
```

위 7개 선행 suite도 모두 통과했다. module 문법과 `git diff --check`를 별도로 검사한다.

## 15. KPI, 성능, 비용

Word의 local abort `<1초`, preview p95 `<1초`, provider-backed durability 목표는 owner 승인 전
`UNVERIFIED hypothesis`다.

현재 측정 가능한 값:

- final memory fixture 30-run local abort p95: 0.15ms
- raw/derivative checksum verified count
- recipe reproduction pass/fail
- upload verified parts/total parts
- upload automatic retry count: 0
- export asset count/bytes/digest
- deletion completed/blocked/incomplete reason
- local browser network/original upload/physical command: 0/0/0
- console error: 0

현재 외부 비용은 0이다. 실제 비용 항목은 device storage, preview/processing CPU, CDN/object
GB-month, multipart requests, restore, egress, checksum audit, backup expiry tracking이다. provider와
실제 성공 loop당 비용을 측정하기 전까지 가격/SLA를 약속하지 않는다.

## 16. Release gate

| Word PR-07 evidence | Current evidence | Gate |
|---|---|---|
| immutable raw digest | SHA-256 at capture and every consumer, corruption fixtures | PASS for byte port |
| reproducible recipe derivative | normalized recipe/output digest and reproduce verifier | PASS for U8 fixture only |
| interrupted upload resume | part checkpoint, interruption, explicit resume, exact bytes | PASS for test adapter only |
| export checksum | manifest + every payload + package SHA-256 | PASS for JSON envelope |
| deletion receipt | replica/cache/backup/derivative/raw receipt and failure fixtures | PASS for known local/test replicas |
| device persistence | actual desktop browser IndexedDB reopen | PASS desktop browser |
| actual camera/file/RAW/FITS | not implemented | OPEN |
| production cloud/backup/delete | provider/contract/cost absent | OPEN |
| iOS/Android large media/background | not tested | OPEN |

따라서 Word PR-07의 첫 local core evidence는 충족하지만 제품 기능 출시 완료는 아니다. 현재
runtime import graph와 UI에는 연결하지 않는다.

## 17. Deployment와 rollback

운영에 반영하는 경우 다음 static module 하나만 `/app/js/space/`에 올린다.

- `prototype/js/space/observation-media.js`

HTML, CSS, service worker, route, IndexedDB migration trigger는 변경하지 않는다. 일반 사용자는
module을 import하지 않으므로 DB 생성, network request, UI 변경이 없다. rollback은 static module을
이전 부재 상태로 되돌리는 것이며 기존 Observation Session, Astrometry, Sky AR와 Earthus 기능은
영향받지 않는다.

2026-08-12 03:02 UTC에 module 한 개만 운영 static path에 반영했다.

- path: `/js/space/observation-media.js`
- local/live SHA-256: `30d32e4f6b1489e334c188b24dddaea79480d6ef78989c4b407b17b7239fab30`
- local/live bytes: `85,436`
- `Content-Type`: `text/javascript; charset=utf-8`
- `Cache-Control`: `no-cache`
- superseded initial invalidation: `IDWBD6WVJBD3WFU11INJ8JXS0R`
- final CloudFront invalidation: `IAI51VPB70DO381GP0VBSXU7AJ`
- cache-busting response: `200`, `Miss from cloudfront`
- live downloaded module syntax: PASS
- production HTML `observation-media` reference: 0
- invalidation creation: PASS; follow-up `GetInvalidation`: deploy IAM에 조회 권한이 없어 `AccessDenied`

따라서 DEV static artifact는 운영 byte까지 일치하지만 public runtime은 열리지 않았다. HTML,
service worker, UI, route를 바꾸지 않았으므로 일반 사용자의 request와 IndexedDB는 증가하지 않는다.

## 18. 다음 확장 gate

순서는 다음과 같다.

1. 실제 iOS/Android file picker와 큰 fixture의 IndexedDB quota/background termination
2. streaming digest와 OPFS/large Blob adapter 비교
3. FITS 4.0 header/data unit parser와 public fixture; RAW/DNG는 별도 decoder/license spike
4. Astrometry WCS를 derivative가 아닌 별도 immutable solution link로 연결
5. calibration frame type/bias/dark/flat compatibility와 deterministic stack
6. preview worker/GPU 성능과 cancellation
7. account identity, encryption/key recovery, server metadata sync ADR
8. provider contract, multipart API, backup expiry, restore/delete receipt와 per-success cost
9. streaming export ZIP/ZIP64와 export/delete UI
10. real-device crash/power/storage/thermal matrix와 limited release

provider selection, remote adapter, AI processing, automatic upload/delete는 위 gate보다 먼저 열지 않는다.

## 19. Traceability

```yaml
requirement: ENG-407-C / ENG-408-C / ENG-501-C / ADR-018 / PART XVI PR-07
baselineCommit: 52c1b67
closeoutObservedHeadBeforeCommit: 4fd9df0
implementation:
  - prototype/js/space/observation-media.js
tests:
  - tools/test_aetherus_observation_media.mjs
evidence:
  - raw and derivative SHA-256 corruption fixtures
  - deterministic recipe reproduction
  - interrupted multipart explicit resume
  - export manifest/payload/package verification
  - replica-aware blocked/incomplete/completed deletion receipts
  - actual desktop browser IndexedDB reopen and Web Crypto
adr: ADR-022 local immutable observation media and receipt boundary
release: DEV_STATIC_ARTIFACT_DEPLOYED / PUBLIC_RUNTIME_NOT_RELEASED
liveSha256: 30d32e4f6b1489e334c188b24dddaea79480d6ef78989c4b407b17b7239fab30
invalidation: IAI51VPB70DO381GP0VBSXU7AJ
owner: Aetherus
pending:
  - actual iOS/Android and large media evidence
  - FITS/RAW decoder and calibration semantics
  - production cloud provider, encryption, backup, restore and deletion contract
  - account sync and UI journey
```
