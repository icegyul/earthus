# AETHERUS PR-05 — Local Session & Sync

> 기준일: 2026-08-12 (Asia/Seoul)
> 선행 기준: `docs/AETHERUS-PR-04-OBSERVATION-PLANNER-2026-08-12.md`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx` ENG-401 / ADR-006 / PART XVI PR-04

## 0. 결론

PR-05는 서버 동기화나 실제 관측 실행 기능이 아니다. PR-04의 제한적 화성 기하 계획을
**이 기기의 authoritative session checkpoint**로 전환하고, 앱 중단·저장 공간 부족·중복
명령·다른 탭/기기 충돌에서 사용자 원본과 완료 전이를 덮어쓰지 않는 첫 local vertical
slice다.

```text
CURRENT ObservationPlan + PLAN_DATA_ONLY manifest
  → START_SESSION(expectedRevision=0, idempotencyKey)
  → IndexedDB append-only event + checkpoint (one transaction)
  → PREPARING → ALIGNING → OBSERVING → COMPLETED
                    ↘ PAUSED → resumeState
  → reload/crash: event replay → checkpoint repair
  → stale tab/device conflict: reject + keep both; no last-write-wins
```

서버 upload/pull, vector-clock merge, 계정 공유, 관측 성공/안전 판정, 실제 장비 명령은 모두
`NOT IMPLEMENTED`다. UI와 JSON export에도 이 경계를 같은 수준으로 표시한다.

## 1. ADR-021 — 기기 authoritative append log를 첫 Session 경계로 채택

### 1.1 결정

| 항목 | 결정 |
|---|---|
| authoritative owner | 현재 브라우저 기기 local IndexedDB |
| aggregate | `ObservationSessionCheckpointV1` |
| journal | `ObservationSessionEventV1` append-only log |
| write | event와 checkpoint를 같은 IndexedDB readwrite transaction에 기록 |
| concurrency | `expectedRevision` compare-and-swap |
| duplicate | `idempotencyKey` unique index + command digest |
| recovery | event revision/previous checkpoint chain을 replay하고 snapshot을 복구 |
| conflict | `REJECT_AND_KEEP_BOTH`; 자동 병합·last-write-wins 금지 |
| offline checkpoint | 세션 시작 시 loaded same-origin app code + exact Mars catalog/detail texture를 SHA-256과 함께 warm cache |
| server | adapter 없음; upload와 pull 모두 별도 `NOT_IMPLEMENTED` |
| event bus | 도입하지 않음; IndexedDB log와 제한적 BroadcastChannel 알림만 사용 |

원문 ADR-006은 “IndexedDB session reducer와 crash replay가 server sync보다 먼저”라고
고정한다. 따라서 존재하지 않는 계정·API·DB·event bus를 먼저 만들지 않고, 현재 static
ES module과 service worker 경계에 작은 adapter seam을 둔다.

### 1.2 채택하지 않은 대안

- `localStorage` 단일 JSON: append chain, atomic compare-and-swap, quota 실패와 crash replay를
  증명하기 어렵다.
- 서버 session API 선행: 현재 repository에는 authoritative remote session 계약이 없다.
- CRDT/vector clock 자동 병합: 관측 시각·사용자 원본·완료 단계에는 의미 없는 병합이 될 수
  있다. 원문도 single session owner lease를 우선한다.
- last-write-wins: stale tab이나 다른 기기가 완료/중단 원본을 지울 수 있어 금지한다.
- 전체 사이트 precache: 임의 데이터 JSON·대형 사진·타일의 license/freshness/storage 예산이 없다.

## 2. 책임·입력·출력·인터페이스

### 2.1 `observation-session.js` 책임

- versioned command/event/checkpoint schema를 검증한다.
- command를 event로 만들고 pure reducer로 다음 checkpoint를 계산한다.
- `expectedRevision`, `idempotencyKey`, causal `checkpointId`를 강제한다.
- event log replay로 snapshot 누락/뒤처짐을 복구한다.
- checkpoint에는 최근 16개 transition 요약만 두고 전체 causal history는 event log가 소유한다.
- IndexedDB event+checkpoint atomic write와 storage pressure 오류를 구분한다.
- 같은 plan revision의 최근 local session을 새로고침 뒤 복원한다.
- 다른 기기 export 분기를 비교하되 자동 병합하지 않고 둘 다 보존하도록 판정한다.
- same-origin loaded shell resource와 Mars 복원에 필요한 exact catalog/detail texture만 service worker에 warm 요청한다.

책임 밖: 관측 가능성/안전/성공률, capture 원본 생성, sensor·mount 제어, 계정 인증, 서버
동기화, conflict UI에서 한 분기를 삭제하는 결정, 일반 백업, 전체 offline pack.

### 2.2 command port

```js
service.start({
  planManifest: OfflineObservationPackManifestV1,
  sessionId?: string,
  idempotencyKey?: string
}) -> { status: 'APPLIED' | 'DUPLICATE', checkpoint, event }
```

```js
service.dispatch({
  sessionId,
  type: 'MARK_PREPARED' | 'MARK_ALIGNED' | 'PAUSE_SESSION'
      | 'RESUME_SESSION' | 'COMPLETE_SESSION' | 'ABORT_SESSION',
  expectedRevision,
  idempotencyKey?
}) -> { status, checkpoint, event }
```

```js
service.load(sessionId)
  -> { checkpoint, events, recovered }

service.findByPlanRevision(planRevision)
  -> { checkpoint, events, recovered }

evaluateObservationSessionConflict(localExport, incomingExport)
  -> SAME | FAST_FORWARD_CANDIDATE | REVISION_CONFLICT | OWNER_CONFLICT
```

`FAST_FORWARD_CANDIDATE`도 자동 적용하지 않는다. future remote adapter가 생겨도 사용자 원본과
owner lease를 다시 확인해야 한다.

## 3. 데이터 모델

### 3.1 checkpoint

```json
{
  "schema": "earthus.observation-session-checkpoint.v1",
  "schemaVersion": 1,
  "sessionId": "session_...",
  "revision": 3,
  "checkpointId": "checkpoint_...",
  "ownerId": "device_...",
  "planRevision": "plan_...",
  "state": "OBSERVING",
  "resumeState": null,
  "executionMode": "LOCAL_CHECKPOINT_ONLY",
  "executionCapability": "NONE",
  "planManifest": {},
  "observationRecords": [],
  "observationSampleCount": null,
  "sync": {
    "status": "LOCAL_ONLY",
    "remoteAdapter": "NOT_CONFIGURED",
    "upload": "NOT_IMPLEMENTED",
    "pull": "NOT_IMPLEMENTED",
    "conflictPolicy": "REJECT_AND_KEEP_BOTH"
  }
}
```

device `ownerId`는 IndexedDB meta store에만 있고 URL·plan manifest·analytics에 넣지 않는다.
기기 action 시각은 사용자가 버튼을 누른 UTC 기록이며 실제 천체 관측 sample이 아니므로
`observationSampleCount=null`을 유지한다.

### 3.2 event

```json
{
  "schema": "earthus.observation-session-event.v1",
  "eventKey": "session-id:00000003",
  "eventId": "event_...",
  "sessionId": "session-id",
  "revision": 3,
  "expectedRevision": 2,
  "previousCheckpointId": "checkpoint_...",
  "checkpointId": "checkpoint_...",
  "type": "Session.Aligned",
  "occurredAtUtc": "2026-08-12T00:00:02.000Z",
  "ownerId": "device_...",
  "idempotencyKey": "mark_aligned:session-id:2",
  "commandDigest": "command_..."
}
```

FNV-1a 식별자는 causal corruption/duplicate 검출을 위한 deterministic short ID일 뿐 암호학적
서명이나 원본 무결성 checksum으로 표현하지 않는다.

## 4. 상태·전이

| Command | Allowed from | To | Guard |
|---|---|---|---|
| `START_SESSION` | no session | `PREPARING` | CURRENT plan + valid manifest + revision 0 |
| `MARK_PREPARED` | `PREPARING` | `ALIGNING` | plan context CURRENT |
| `MARK_ALIGNED` | `ALIGNING` | `OBSERVING` | plan context CURRENT |
| `PAUSE_SESSION` | `PREPARING/ALIGNING/OBSERVING` | `PAUSED` | checkpoint persisted first |
| `RESUME_SESSION` | `PAUSED` | saved `resumeState` | plan context CURRENT |
| `COMPLETE_SESSION` | `OBSERVING` | `COMPLETED` | explicit user action |
| `ABORT_SESSION` | non-terminal | `ABORTED` | explicit user action |

원문 전체 vocabulary의 `CAPTURING/REVIEWING/Session.Captured`는 PR-08
Capture→Review→Archive 소유다. 여기서는 사진 원본이나 capture 성공을 만들지 않는다.

## 5. crash·duplicate·conflict·storage pressure

### 5.1 crash replay

```text
read checkpoint + ordered events
  → validate schema/revision/previousCheckpointId/eventId/checkpointId
  → reduce from PLANNED
  → snapshot missing or behind: rewrite snapshot from log
  → snapshot ahead of log: reject SESSION_CHECKPOINT_AHEAD_OF_LOG
```

event가 없는데 checkpoint만 있는 상태를 정상으로 추정하지 않는다. 실패를 기본 성공값으로
바꾸지 않고 causal log 손실로 중단한다.

### 5.2 duplicate

- 같은 `idempotencyKey` + 같은 command digest: 기존 checkpoint를 `DUPLICATE`로 반환, event 0개 추가.
- 같은 key + 다른 command digest/session: `SESSION_IDEMPOTENCY_CONFLICT`, 쓰기 0.
- idempotency index는 모든 local session에서 unique다.

### 5.3 stale tab / two-device

- transaction 안의 실제 revision이 `expectedRevision`과 다르면 전체 쓰기를 abort한다.
- BroadcastChannel은 다른 탭의 refresh hint일 뿐 authoritative transport가 아니다.
- 다른 owner export는 `OWNER_CONFLICT / USER_CHOICE_REQUIRED_KEEP_BOTH`다.
- 이 PR에는 remote import/apply/delete가 없으므로 사용자 원본을 지울 경로도 없다.

### 5.4 storage pressure

`QuotaExceededError`는 `SESSION_STORAGE_PRESSURE`로 분리한다. event와 checkpoint가 같은
transaction이므로 둘 다 기록되거나 둘 다 기록되지 않는다. 자동 삭제·eviction·재실행은 하지
않고 기존 revision과 원본을 유지한다.

## 6. offline·cache migration

- IndexedDB database: `earthus-aetherus-observation-session`, version 1.
- stores: `events`, `checkpoints`, `meta`.
- version 0→1 migration에서만 stores/index를 생성한다. 없는 legacy 값을 성공값으로 채우지 않는다.
- 세션 시작 뒤 `performance`에 이미 로드된 same-origin `.js/.css/.html/.webmanifest`와 명시한
  `/data/celestial-bodies.json`, Mars detail texture만 service worker에 전달한다.
- service worker cache를 `earthus-shell-2026-08-12-session1`로 올리고 기존 known shell cache의
  같은 resource type만 복사한 뒤 legacy cache를 지운다.
- 일반 data JSON, API, NASA/CDN, 다른 이미지/texture/tile은 warm 대상에서 제외한다.
- cache에 넣기 전 각 response body의 SHA-256을 계산해 response header에 고정한다. 이 값은
  exact cached bytes의 무결성 표식이며 upstream source 서명으로 표현하지 않는다.
- offline cache 실패는 session append 성공을 rollback하지 않는다. 화면에는 `WARMED | PARTIAL |
  UNAVAILABLE`로 별도 표시한다.

따라서 기존에 warm된 앱 코드와 checkpoint가 있을 때 새로고침 복구를 지원하지만, 이는 완전한
offline pack, 최신 data 보장 또는 장기 archive가 아니다.

## 7. UI·접근성·privacy

- PR-04 계획 카드 안에서만 device session을 시작한다.
- `LOCAL READY/PREPARING/ALIGNING/OBSERVING/PAUSED/COMPLETED/ABORTED`를 badge로 표시한다.
- 최근 4개 전이에 from→to, revision, action UTC, checkpoint ID를 표시한다.
- `LOCAL ONLY`, upload/pull 미구현, 자동 병합 없음, 관측 n 아님, 장비 명령 없음을 같은 카드에 둔다.
- 버튼은 44px 이상이고 모바일은 1열이다.
- session ID/owner ID는 공유 URL에 넣지 않는다. route v3는 public plan context만 유지한다.
- 정확한 device 위치와 accuracy/name은 plan manifest에서 이미 제거되어 session에도 들어오지 않는다.
- timer, polling, rAF를 추가하지 않는다. BroadcastChannel은 event notification일 때만 동작한다.

## 8. 테스트·release gate

### 8.1 자동 fixture

```text
node tools/test_aetherus_observation_session.mjs
node tools/test_aetherus_observation_planner.mjs
node tools/test_aetherus_astronomy.mjs
node tools/test_aetherus_foundation.mjs
node tools/test_aetherus_photo_ownership.mjs
```

PR 고유 증거:

1. 전체 local transition과 매 전이 revision/checkpoint 증가
2. snapshot 제거 후 append log crash replay와 동일 checkpoint 복구
3. duplicate command 0 event 추가, key reuse with different command 거부
4. quota fixture에서 revision·원본 불변
5. stale-tab CAS에서 두 번째 write 거부
6. two-device owner conflict에서 local/incoming branch 둘 다 보존
7. export full replay와 `LOCAL_ONLY/NOT_CONFIGURED`
8. offline allowlist에서 exact Mars 2개 dependency만 허용하고 임의 data/media/foreign origin 제외
9. 잘못된 old schema event를 성공값으로 migration하지 않고 거부

### 8.2 실제 UI 증거

```text
desktop + 390×844:
  Mars deep link → plan → local session start → reload → same checkpoint
  PREPARING → ALIGNING → OBSERVING → PAUSED → resume
  no horizontal overflow + 44px controls

two tabs:
  same session revision에서 두 명령 → one applied, one visible conflict/reload

offline:
  session shell warm → DevTools offline reload → plan/session checkpoint visible

normal path console error = 0
idle/released render delta = 0
```

## 9. KPI·성능·비용

- 원문의 crash recovery `<10초`, sync convergence `<30초`, resume success `>99%`는 모두
  **UNVERIFIED hypothesis**다. 이 PR의 개발기/browser fixture는 SLA가 아니다.
- 기록당 local IndexedDB event 1개 + checkpoint 1개이며 외부 API·DB·AI 비용은 0이다.
- service worker warm은 세션 시작 한 번의 loaded shell 확인만 수행한다. timer/polling은 0이다.
- remote sync 비용, multi-device convergence, media storage는 adapter와 real-device evidence가
  생기기 전까지 0으로 추정하거나 제품 약속으로 쓰지 않는다.

## 10. rollback·다음 gate

문제가 생기면 session UI와 `observation-session.js` import/message handler만 되돌린다. 기존
PR-04 plan route와 plan JSON은 그대로 작동한다. IndexedDB는 사용자가 만든 local 원본이므로
rollback 중 자동 삭제하지 않는다.

다음 PR은 Sky AR Core다. 다음은 별도 증거 없이 이 PR에 합치지 않는다.

1. 실제 iOS/Android orientation permission과 calibration
2. 저신뢰 센서 UI와 southern hemisphere projection
3. real-device 30분 thermal
4. remote session API/upload/pull 또는 account sync
5. capture/review/archive와 사용자 사진 원본
6. equipment/weather/local horizon safety interlock
