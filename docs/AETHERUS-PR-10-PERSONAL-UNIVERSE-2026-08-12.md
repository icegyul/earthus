# AETHERUS PR-10 — Personal Universe Ownership, Export & Deletion

> 기준일: 2026-08-12 (Asia/Seoul)
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx` ENG-603, ADR-009, Part XVI PR-09

## 0. 결론

Personal Universe의 가장 작은 local-first vertical slice를 구현했다. 사용자는 자신의 발견,
관측 참조, 미션 북마크, 장비 성취, 학습 메모를 **PRIVATE** 상태로만 기록하고, revision과
idempotency key가 맞을 때만 수정할 수 있다. export는 SHA-256으로 검증되고, 삭제는 검증된
현재 export와 명시적 사용자 확인 뒤에만 실행되며 범위별 영수증을 남긴다.

이 PR은 Community 게시물, AI Memory, 원본 RAW archive, Supabase Personal Universe table/RLS
정책을 만들거나 연결하지 않는다. 이들은 별도 owner/context이므로 local receipt에
`OUT_OF_SCOPE`로 정확히 남는다. 없는 remote RLS를 local identity 비교만으로 “검증됨”이라
표현하지 않는다.

## 1. 책임과 데이터 경계

```text
Personal Universe (this PR)
  ├─ private user-owned record metadata
  ├─ portable export / checksum
  └─ local deletion receipt

AI Memory                 ── separate consent/expiry schema, untouched
Observation Archive RAW   ── Archive owner, untouched
Community Post            ── Community owner, no automatic publish
Supabase/RLS              ── NOT IMPLEMENTED: schema and policy evidence required
```

`personal-universe.js`는 다음 ES module interface만 공개한다.

```js
const repository = createMemoryPersonalUniverseRepository(); // deterministic fixture only
const personal = createPersonalUniverseService({ repository, now?, idFactory? });

await personal.create({ universeId?, ownerId, privacy, idempotencyKey });
await personal.addRecord({ universeId, ownerId, expectedRevision, record, idempotencyKey });
await personal.load({ universeId, ownerId });
const exported = await personal.exportPackage({ universeId, ownerId, exportId? });
await personal.delete({ universeId, ownerId, expectedRevision, exportPackageBytes,
  explicitUserConfirmation: true, receiptId?, idempotencyKey });
```

`ownerId`는 local adapter의 caller boundary다. 서로 다른 owner ID는 `NOT_AUTHORIZED`를
받는다. 이는 unit-level tenant denial이며 **Supabase RLS 증거가 아니다**. remote adapter는
동일한 contract test와 실제 두 세션의 cross-tenant deny를 통과할 때만 추가한다.

## 2. 데이터 모델·privacy·provenance

Universe는 `earthus.personal-universe.v1`, record는
`earthus.personal-universe-record.v1`이다. record type은 `DISCOVERY`, `OBSERVATION_REFERENCE`,
`MISSION_BOOKMARK`, `EQUIPMENT_ACHIEVEMENT`, `LEARNING_NOTE`만 허용한다.

```json
{
  "recordId": "record-webb-first-images",
  "type": "MISSION_BOOKMARK",
  "subjectId": "jwst-first-images",
  "sourceContext": {
    "provenance": "observation",
    "sourceRevision": "jwst-mission-media-replay-r1",
    "freshness": "STATIC_ARTIFACT_2026-08-12",
    "precision": "MILESTONE_ONLY"
  },
  "privacy": {
    "visibility": "PRIVATE",
    "locationPolicy": "NOT_STORED"
  }
}
```

모든 기록은 `sourceRevision`, `freshness`, `precision`, `provenance`를 가진다. `null`이나
unknown을 성공 데이터로 채우지 않는다. `privacy.visibility`는 반드시 `PRIVATE`이고 precise
latitude/longitude/preciseLocation 필드는 거부한다. `COARSE_REGION`은 짧은 region label만
허용한다. raw photo/RAW byte는 저장하지 않고 Archive의 opaque ID를 `linkedObservationId`로
참조할 수 있을 뿐이다.

## 3. 상태·실패·재시도

```text
create → PRIVATE(revision 1)
  └─ addRecord(expectedRevision + idempotency key) → PRIVATE(revision + 1)
       ├─ export → verified portable package (read-only)
       └─ delete(export digest + explicit confirmation) → deleted local state + receipt
```

- 같은 idempotency key와 같은 payload는 `DUPLICATE`로 같은 결과를 반환한다. 다른 payload면
  `IDEMPOTENCY_CONFLICT`다.
- stale revision, 다른 owner, duplicate record, invalid provenance/privacy는 즉시 실패하며
  retry하지 않는다.
- failed export/import digest, export가 현재 revision과 다른 경우, confirmation 없음은 삭제를
  수행하지 않는다.
- no network, polling, timer, animation loop를 만들지 않는다. 브라우저 local storage/IndexedDB
  adapter는 후속 구현이며 memory repository는 test fixture다.

## 4. Export·deletion receipt

Export package는 canonical JSON snapshot을 base64 envelope로 감싸고 snapshot/package SHA-256을
제공한다. `verifyPersonalUniverseExport`는 schema, manifest, digest, universe ID, revision,
record count를 모두 다시 확인한다. 삭제는 **현재 revision의 검증된 export**를 받아야 한다.

Deletion receipt는 성공한 local 범위와 별도 owner 범위를 혼동하지 않는다.

| 대상 | receipt 상태 | 의미 |
|---|---|---|
| Personal Universe record | `COMPLETED_LOCAL` | 이 adapter가 소유한 local metadata 삭제 |
| local cache | `COMPLETED_LOCAL` | 같은 fixture/local owner 범위 정리 |
| remote replica | `NOT_CONFIGURED` | remote adapter 자체가 없음 |
| AI Memory | `OUT_OF_SCOPE_SEPARATE_SCHEMA` | ADR-009에 따라 consent/expiry가 별도 |
| Observation RAW | `OUT_OF_SCOPE_ARCHIVE_OWNER` | PR-08 Archive delete로만 처리 |
| Community Post | `OUT_OF_SCOPE_COMMUNITY_OWNER` | 게시/withdrawal context에서 처리 |

따라서 이 receipt는 account deletion, cloud backup purge, Community withdrawal, RAW deletion을
완료했다는 주장이 아니다. 그 scope는 해당 authoritative owner의 remote receipt가 필요하다.

## 5. 보안·비용·확장 gate

- 새 서버, API token, user location, account email, external fetch, AI memory write를 추가하지 않는다.
- 이 static module은 현재 UI가 import하지 않아 공개 화면·로그인·render loop에 영향을 주지 않는다.
- 비용은 local compute와 export byte 수뿐이며 서버 request/egress/SLA를 약속하지 않는다.
- IndexedDB/offline checkpoint는 memory repository와 동일 contract test를 통과한 뒤 추가한다.
- Supabase migration은 `personal_universes`/records/export/delete scope와 `auth.uid()` RLS를
  설계하고, old fixture read, dual-write comparison, authenticated principal A/B tenant denial,
  export/rollback evidence를 모아 별도 PR로 진행한다.

## 6. Release evidence

```text
PASS: PRIVATE 시작, owner mismatch tenant denial, expectedRevision CAS
PASS: exact location field rejection and provenance/revision/freshness/precision required
PASS: idempotent create/add/delete and conflicting key protection
PASS: export checksum verification, tamper rejection, current revision export required for delete
PASS: explicit confirmation and signed scope-separated deletion receipt
PASS: previous Capture/Archive and Mission Replay contracts regressions
PASS: actual local browser serves module; no fetch/rAF and AI Memory boundary is present
```

UI를 변경하지 않았으므로 desktop/390×844 visual acceptance surface는 없다. remote RLS, human
publish action, moderation/reputation separation, consent withdrawal은 **미구현**이며 이후
Community/remote-adapter PR의 release gate다.

## 7. 배포·롤백

운영에는 `app/js/space/personal-universe.js`만 `text/javascript; charset=utf-8`와
`Cache-Control: no-cache`로 선별 배포한다. 문서와 test tool은 배포하지 않는다. 현재 runtime
consumer가 없으므로 rollback은 이 module을 이전 안전 blob으로 되돌리고 CloudFront path만
무효화하면 된다. consumer UI를 붙이는 PR부터는 module·UI·migrations를 atomic release 단위로
다룬다.

### 7.1 2026-08-12 배포 증거

- CloudFront invalidation: `IBHNGY1V1FIQ22YJGN5LAZ2CRR`
- cache-busting 공개 URL: HTTP 200, `text/javascript; charset=utf-8`, `Cache-Control: no-cache`
- local/live SHA-256: `0c80a816f1a74f9f99333150e321a06d06ab71ff18cd77409832c91502f90865`
- 이 파일은 아직 화면에서 import하지 않으므로, 신규 사용자 계정·개인 기록·공개 게시·서버
  요청은 운영에 열리지 않았다.
