# AETHERUS PR-09 — Mission Media & Replay Contract

> 기준일: 2026-08-12 (Asia/Seoul)
> 선행 기준: `docs/AETHERUS-PR-08-CAPTURE-REVIEW-ARCHIVE-2026-08-12.md`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx` Part XVI, ENG-503/504/601/602

## 0. 결론과 공개 범위

이 PR은 JWST의 공식 공개 이미지, 미션 상태 assertion, 사건 타임라인, 교육용
milestone replay를 하나의 versioned static artifact로 묶는다. **새 Aetherus 화면이나
실시간 궤도 화면은 아직 공개하지 않는다.** 따라서 현재 Earthus UI의 동작·렌더 루프·API
요청에는 변화가 없다. 이후 UI는 이 계약을 소비할 수 있지만, 계약에 없는 상태·이미지·보간
위치를 그릴 수 없다.

```text
official photo catalogue ── source / credit / license parity ─┐
official mission sources ── status assertion / event time ────┼─ static artifact
                                                               │
                                                         validator
                                                               │
                              rights gate ──> media display / replay deep link
                                                               │
                                           milestone only, no orbit interpolation
```

## 1. 책임과 인터페이스

| 구성 | 책임 | 하지 않는 일 |
|---|---|---|
| `mission-media-replay-v1.json` | source assertion, event, asset rights, band/display declaration, replay cue | provider API polling, 사용자 업로드, 실시간 mission 운영 판단 |
| `contracts.js` | schema·UTC·권리·instrument relation·WCS 상태 누락 차단 | 원본 기관의 라이선스 추정 |
| `mission-replay.js` | source parity, 권리 gate, 상태 우선순위, 결정론적 seek/tick, URL 복원 | timer/rAF, fetch, 궤도 계산, gap 보간 |
| existing `space-photos.json` | 공개 사진 원본 URL·credit·license의 단일 사실원 | 미션 타임라인 소유 |

공개 함수는 다음과 같다.

```js
const catalog = createMissionMediaReplayCatalog(artifact, { spacePhotoCatalog });
evaluateMissionAssetRights(catalog, assetId, 'MISSION_REPLAY_DISPLAY');
resolveMissionStatus(catalog, atUtc);

let state = createMissionReplaySession(catalog, { atUtc, selectedAssetId });
state = reduceMissionReplay(catalog, state, { type: 'LOADED' });
state = reduceMissionReplay(catalog, state, { type: 'SEEK', atUtc });

const link = encodeMissionReplayLink(catalog, { atUtc, assetId }, location.href);
const restored = restoreMissionReplayLink(catalog, link);
```

`reduceMissionReplay`은 호출자가 제공한 `elapsedMs`만 사용한다. 백그라운드 timer, animation
loop, 네트워크 재시도는 소유하지 않아 숨은 탭·저사양 기기에서 추가 발열을 만들지 않는다.

## 2. 진실성·provenance·권리

### 2.1 매체

각 media asset은 `catalogAssetRef`, `source`, `sourceUrl`, `credit`, `license`, `display`와
`provenance`를 모두 가진다. `assertMissionMediaReferences`는 ref가 실제 사진 카탈로그에
있고 source URL·credit·license가 byte-for-byte 같은지 검사한다. 하나라도 다르면 artifact를
차단한다.

`display=DENIED`, 존재하지 않는 asset, revision 불일치 URL은 fallback 이미지나 임의의 다음
asset을 선택하지 않고 `BLOCKED`가 된다. 기관명만으로 재사용 가능하다고 추론하지 않는다.

### 2.2 다중 파장

`webb-pillars-nircam-miri-composite`은 공개된 NIRCam·MIRI composite임을 선언한다.
`PUBLISHED_FALSE_COLOR_COMPOSITE`은 사람이 보는 자연색이 아니라 공개 처리 결과라는 뜻이다.
두 asset 모두 `pixelAlignment=NOT_VERIFIED`, layer set도 `registrationStatus=NOT_VERIFIED`다.
따라서 이 PR의 소비자는 pixel blend, WCS overlay, seam-free mosaic를 주장하거나 렌더하면 안
된다. WCS residual과 tile seam 검증이 들어온 뒤에만 `METADATA_ALIGNED` 이상의 새 revision을
발행한다.

### 2.3 미션 지식

`statusAssertions`는 source와 `validFromUtc`가 있는 immutable assertion이다. 과거 assertion을
문장으로 덮어쓰지 않고 correction은 새 ID와 `supersedesAssertionId`로 추가한다. 같은 시각에는
`OFFICIAL > CURATED`, 이후 valid time, assertion time, stable ID 순서로 결정한다. source가 없는
시각은 `UNKNOWN`이다. NIRCam/MIRI가 JWST에 속한다는 관계도 `instrumentRelations`의 출처·유효
시각과 함께 보존한다.

## 3. Replay 상태와 failure 경계

```text
LOADING ── LOADED ──> PAUSED ── PLAY ──> PLAYING
   │                       │                 │
   │                       └── SEEK ──> SEEKING
   │                                         │
   └─ invalid link / rights ──> BLOCKED (URL restore result)

PLAYING ── source milestone 사이 ──> DEGRADED
DEGRADED ── 다음 입력 tick / 정확한 milestone ──> PLAYING or COMPLETED
```

이 PR은 `MILESTONE_ONLY`와 `interpolation=NONE`이다. cue와 cue 사이에는 `scene=null`,
`DATA_GAP`, `MILESTONE_ONLY_NO_INTERPOLATION`을 반환한다. 가장 최근의 사건은 맥락으로만
보존하며, spacecraft의 위치·카메라 path·과학적 상태로 확대 해석하지 않는다.

| 실패 | 결과 | retry/cache/offline |
|---|---|---|
| schema, UTC, source, rights 누락 | load 전 contract error | 자동 보정·추측 없음 |
| 사진 catalog parity 불일치 | `SOURCE_URL_MISMATCH` 또는 `RIGHTS_METADATA_MISMATCH` | 새 artifact revision을 사람이 검토해 발행 |
| display 권리 거부 | `DISPLAY_NOT_LICENSED`, URL `BLOCKED` | 다른 asset 자동 대체 없음 |
| 링크 revision/mission 불일치 | `REVISION_NOT_AVAILABLE` / `MISSION_NOT_IN_ARTIFACT` | 기존 route는 보존, replay를 열지 않음 |
| milestone 사이 | `DEGRADED`, data gap | timer retry 없음; 명시적 seek만 허용 |
| 정적 파일 offline | 브라우저가 이미 보관한 immutable cache만 사용 가능 | 별도 offline pack·provider fetch는 후속 PR |

## 4. 데이터·이벤트 계약

정적 artifact의 핵심은 다음과 같다.

```json
{
  "schema": "earthus.mission-media-replay.v1",
  "artifact": { "id": "jwst-mission-media-replay", "revision": 1 },
  "mission": {
    "statusAssertions": [{ "authority": "OFFICIAL", "validFromUtc": "UTC", "sourceUrl": "https://…" }],
    "instrumentRelations": [{ "instrumentId": "nircam", "relation": "OPERATED_BY_MISSION" }]
  },
  "mediaAssets": [{ "rights": { "display": "ALLOWED" }, "pixelAlignment": "NOT_VERIFIED" }],
  "replayManifest": { "mode": "MILESTONE_ONLY", "provenance": "reconstruction", "interpolation": "NONE" }
}
```

이 artifact는 versioned static JSON이다. provider adapter, ETag/Last-Modified ingestion,
quarantine, immutable binary storage는 provider 실연동을 시작할 때 별도 bounded context로
구현한다. 그 시점에도 provider schema change·checksum mismatch·license absent는
`QUARANTINED`로 가야 하며, 현재 정적 fixture를 실시간 데이터처럼 바꾸지 않는다.

## 5. 보안·개인정보·비용·관측성

- 외부 fetch, token, upload, device command, 사용자 위치/계정 저장이 없다.
- URL은 `aetherusMission`, `mission`, `missionRevision`, `replayAt`, `replayAsset`만 읽고 stable ID와 UTC를 검사한다. 기존 Earthus query/hash는 encode 시 보존한다.
- static JSON 1개와 ES module 1개만 추가한다. CDN cache 외 신규 API·DB·AI·스토리지 비용은 0이다.
- 후속 UI는 `artifact validation failure`, `rights gate blocked`, `route restore result`, `gap shown`, `asset attribution visible`을 비식별 집계해 KPI로 삼는다. 이 PR은 telemetry 전송을 만들지 않는다.

## 6. 테스트 및 release gate

```text
PASS: 6 catalog contracts / existing 5 negative fixtures / 13 route cases
PASS: source URL·credit·license parity and missing catalog reference rejection
PASS: OFFICIAL precedence over conflicting CURATED assertion
PASS: immutable timeline order, UNKNOWN-before-assertion, instrument relation
PASS: deterministic LOADING→PAUSED→PLAYING→DEGRADED/SEEKING flow
PASS: data gap has no scene and no interpolation
PASS: rights-denied asset and unavailable revision links are BLOCKED
PASS: module has no fetch, interval, timeout, or rAF owner
PASS: local browser serves module and artifact with NONE interpolation / NOT_VERIFIED alignment
```

UI가 아직 없으므로 데스크톱·390×844 visual gate는 이 PR에 적용할 surface가 없다. 이후 UI
PR은 source/observation-or-reconstruction badge, credit/license, gap copy, rights-denied state,
desktop·390×844·reduced-motion·low-end GPU를 모두 실제 브라우저에서 통과해야 한다.

## 7. 배포·롤백

운영에는 정적 runtime/data 세 파일만 정확한 MIME과 `no-cache`로 올린다.

```text
app/js/space/contracts.js                         text/javascript; charset=utf-8
app/js/space/mission-replay.js                    text/javascript; charset=utf-8
app/data/missions/jwst-mission-media-replay-v1.json application/json; charset=utf-8
```

문서와 test tool은 배포하지 않는다. 롤백은 이 세 파일을 함께 이전 안전 blob으로 되돌리고
같은 CloudFront path를 무효화한다. UI가 아직 import하지 않으므로 module만 남기거나 JSON만
되돌리는 부분 롤백은 공개 surface를 바꾸지 않지만, 이후 consumer를 배포할 때는 artifact와
validator revision을 원자적으로 배포한다.

### 7.1 2026-08-12 배포 증거

- CloudFront invalidation: `I9NQVNFXYQ7835OO32ZCU1R7BY`
- query cache-busting 공개 URL이 세 파일 모두 HTTP 200, `Cache-Control: no-cache`, 정확한
  JavaScript/JSON MIME을 반환했다.
- local/live SHA-256은 각각 일치했다.
  - `contracts.js`: `0fa317abda311048eaa02aab082b93a5ed0aae51c3d869a2838fcd4a2933c9ff`
  - `mission-replay.js`: `50107f8b2f9edffcff6b922eb22b42a04c7f529d9adb40f70ee5575db3230b16`
  - `jwst-mission-media-replay-v1.json`: `91da274fb31b32705daf92e774958323ee3f53674b080ce2a6afa0f61b3e0cfd`
- 신규 사용자 UI나 로그인·계정·외부 provider 요청은 배포하지 않았다.

## 8. 후속 PR

PR-10은 Personal Universe / Community 또는 Mission UI 중 먼저 사용자에게 드러낼 vertical
slice를 결정한다. Mission UI를 택한다면 이 계약을 그대로 소비하고, 위치·궤도·WCS·새 권리
해석을 화면에서 추가하지 않는다.
