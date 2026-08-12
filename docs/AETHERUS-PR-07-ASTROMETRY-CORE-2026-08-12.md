# Aetherus PR-07 — Astrometry & Plate Solving Core

> 기준일: 2026-08-12 (Asia/Seoul)
> 선행 기준: `docs/AETHERUS-PR-06-SKY-AR-CORE-2026-08-12.md`
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx` ENG-405 / ENG-406 / TST-003 / ADR-007 / PART XVI PR-06
> 저장소 매핑: 제품 사진 소유권 PR이 삽입되어 Word의 PR-06은 저장소 PR-07에 해당한다.
> 현재 상태: `DEV_STATIC_ARTIFACT_DEPLOYED / PUBLIC_RUNTIME_NOT_RELEASED / DEVICE_GATE_OPEN / CLOUD_NOT_IMPLEMENTED`

## 1. 결정

Astrometry는 Sky AR, 촬영 검토, archive WCS, science submission이 공유할 독립 bounded
context다. 그러나 현재 저장소에 solver가 없고 실제 원본 이미지 extraction, production catalog
license, 모바일 성능, cloud 비용이 검증되지 않았다. 따라서 첫 구현은 다음 경계로 제한한다.

```text
pre-extracted feature list
  → signed index manifest verification
  → artifact SHA-256 and schema/revision verification
  → seeded pair hypotheses
  → unique source matching
  → affine TAN WCS fit
  → held-out VALIDATION source residual
  → VERIFIED | FAILED | CANCELLED
```

브라우저/worker에서 실행 가능한 ES module이며 `fetch`, timer, animation loop, 원본 업로드가 없다.
별도 service, DB, queue, Lambda, HTTP endpoint를 만들지 않는다. 원본 이미지에서 source를 뽑는
단계와 blind solve는 성공처럼 숨기지 않고 명시적 미구현 상태다.

## 2. Baseline과 ownership

### 2.1 Baseline

PR 시작 HEAD는 `d4d1d72`다. 시작 당시 별도 safety/warn 작업의 다음 변경이 있었으며 이 PR은
그 파일과 hunk를 읽거나 stage하지 않는다.

- `prototype/index.html`
- `prototype/js/ui-korea.js`
- `prototype/js/ui-warn.js`
- `prototype/js/warn.js`
- `prototype/css/safety.css`
- `prototype/js/safety-engine.js`
- `prototype/js/safety-gate-ui.js`
- `work/`

기존 `astronomy.js`는 target RA/Dec 계산, `sky-ar.js`는 device pose/projection을 소유하지만
image-to-sky WCS와 index 검증은 소유하지 않았다.

### 2.2 Astrometry owns

- SolveRequest/SolveResult/WcsSolution의 의미와 write validation
- signed manifest와 immutable shard의 compatibility/checksum 검증
- feature list와 catalog source의 seeded hypothesis 생성
- unique correspondence, affine fit, residual statistics
- hypothesis에 사용하지 않은 validation source 검증
- false match/ambiguity/failure reason과 zero-network diagnostics
- optional cloud escalation의 consent gate

### 2.3 Does not own

- 원본 image/RAW/FITS source extraction
- hot-pixel/cloud/background 제거와 미학 처리
- production Gaia/other catalog ingestion·license 승인
- 카메라 제어와 capture lifecycle
- catalog index build farm, range resume, delta update, device LRU
- cloud solver endpoint, 원본 upload, 과금, queue
- Sky AR calibration profile 자동 승격

## 3. 실행 계약

### 3.1 Public functions

| Function | Responsibility | Network |
|---|---|---:|
| `verifyIndexManifest` | schema, solver compatibility, artifact bytes/SHA-256, pinned Ed25519 signature | 0 |
| `openVerifiedIndexArtifact` | verified artifact만 parse하고 revision/catalog/provenance를 고정 | 0 |
| `runAstrometrySolveJob` | seeded local solve와 독립 validation | 0 |
| `worldToTangent` / `tangentToWorld` | ICRS ↔ local TAN plane | 0 |
| `pixelToWorld` | WCS pixel → ICRS coordinate | 0 |
| `planOptionalCloudEscalation` | 동의·network·adapter 조건을 평가하되 실행하지 않음 | 0 |

### 3.2 Input

```json
{
  "schema": "earthus.astrometry-solve-request.v1",
  "image": {
    "width": 558,
    "height": 262,
    "digest": null,
    "originalUploadConsent": false
  },
  "seed": {
    "centerRaDeg": 147.927100003,
    "centerDecDeg": 69.9079999924,
    "arcsecPerPixel": 0.8138,
    "scaleToleranceFraction": 0.22
  },
  "featureList": [
    { "id": "m82-f01", "x": 422, "y": 236, "flux": 58599 }
  ]
}
```

Pixel 좌표는 FITS 1-based다. `featureList`가 없으면 이번 slice는
`FEATURE_EXTRACTION_NOT_IMPLEMENTED`를 반환한다. 빈 배열이나 null을 성공 입력으로 보지 않는다.

### 3.3 Verified result

```json
{
  "schema": "earthus.astrometry-solve-result.v1",
  "status": "VERIFIED",
  "inputDigest": "sha256",
  "cacheKey": "input:solver:index",
  "wcs": {
    "schema": "earthus.astrometry-wcs.v1",
    "ctype": ["RA---TAN", "DEC--TAN"],
    "cunit": ["deg", "deg"],
    "radesys": "ICRS",
    "equinox": 2000,
    "pixelConvention": "FITS_1_BASED",
    "crval": [0, 0],
    "crpix": [0, 0],
    "cd": [[0, 0], [0, 0]],
    "mirrored": false,
    "distortion": null
  },
  "residuals": {
    "index": {},
    "independentValidation": {}
  }
}
```

`distortion:null`은 왜곡이 0이라는 뜻이 아니라 SIP/TPV fit을 하지 않았다는 뜻이다. limitation은
`pre-extracted-feature-list-only`, `linear-tan-no-sip-distortion-fit`,
`seed-center-and-scale-required`로 결과에 고정한다.

## 4. Solver algorithm과 독립 검증

### 4.1 Hypothesis

1. Seed center를 기준으로 catalog ICRS를 TAN plane에 투영한다.
2. 밝은 feature 최대 12개와 INDEX source 최대 18개의 pair distance를 만든다.
3. seed scale tolerance 안의 pair에서 rotation, correspondence swap, optional mirror 가설을 만든다.
4. projected feature와 INDEX catalog를 residual 오름차순으로 unique greedy match한다.
5. 최소 6개 match를 통과한 가설만 affine least-squares fit한다.
6. fit 뒤 correspondence를 다시 만들고 residual을 재계산한다.

### 4.2 Independent source gate

INDEX role source는 hypothesis와 fit에만 쓴다. VALIDATION role source는 가설 생성과 fit에서 제외하고,
fit에 쓰지 않은 feature만 이용해 별도로 match한다. 기본 gate는 다음과 같다.

- INDEX match ≥6
- VALIDATION match ≥3
- VALIDATION p95 residual ≤2.5 arcsec
- materially different한 후보가 같은 match/residual을 가지면 `AMBIGUOUS_MATCH`

이 gate를 통과하기 전에는 `wcs:null`이다. 마지막 성공 WCS나 최고 점수 후보를 재사용하지 않는다.

### 4.3 State

```text
QUEUED
  ├─ cancel → CANCELLED
  └─ validate → EXTRACTING
EXTRACTING
  ├─ invalid/unsupported → FAILED
  └─ feature list ready → MATCHING
MATCHING
  ├─ no/timeout/cancel → FAILED|CANCELLED
  └─ candidate → FITTING
FITTING
  ├─ independent residual fail → FAILED
  ├─ competing verified fields → FAILED(AMBIGUOUS_MATCH)
  └─ unique independent verification → VERIFIED
```

`Solve.Submitted`, `Solve.Extracting`, `Solve.Matching`, `Solve.Fitting`, `Solve.Verified`는
result trace/analytics vocabulary다. 현재 없는 event bus를 뜻하지 않는다.

## 5. Index distribution contract

### 5.1 Manifest

Manifest는 schema/version, solver compatibility, artifact path/revision/byte length/SHA-256,
provenance, distribution state, Ed25519 detached signature를 가진다. 서명 payload는 `signature`를
제외한 recursive key-sorted canonical JSON이다.

검증 순서는 다음과 같다.

1. relative path와 `..`/absolute path 차단
2. manifest schema/version/solver compatibility
3. artifact 존재와 exact byte length
4. artifact SHA-256
5. pinned `keyId`와 SPKI Ed25519 public key
6. detached signature
7. shard schema/revision/catalog roles/provenance

checksum 또는 signature 실패 시 이전 값이나 unsigned artifact로 강등하지 않고 BLOCKED error다.

### 5.2 Current signer scope

현재 key는 `aetherus-astrometry-dev-fixture-20260812`, scope는 `DEV_FIXTURE_ONLY`다. 실행 중
private key를 파일로 남기지 않고 one-shot memory key로 signing했으며 public key만 module에
pin했다. 이는 validator와 CDN artifact 계약을 검증하기 위한 key다. production catalog signer,
rotation, revocation, HSM/offline ceremony가 승인된 것이 아니다.

### 5.3 Current shard

`m82-nasa-wcs-seeded-v1.json`은 production sky index가 아니다. 공개 NASA WCS sample의
24개 숫자 fixture로만 구성된다. INDEX 16개, VALIDATION 8개다.

## 6. Public corpus provenance

### 6.1 Source

- Host: NASA FITS Support Office
- File: `m82opt.fits`
- URL: `https://fits.gsfc.nasa.gov/nrao_data/samples/wcs/m82opt.fits`
- Source SHA-256: `a1b771dcc0c3eae7e3e7365c67b54d0465091b30838e52c823e303e115603cf1`
- Last-Modified: `2007-01-04T22:30:16Z`
- Header: 558×262, BITPIX 16, `RA---ARC/DEC--ARC`, CRVAL 147.927100003° / 69.9079999924°,
  CRPIX 301.5 / 95.5, CROTA2 24.26000023°

### 6.2 Derivative

원본 FITS는 별도 license 문구를 확정하지 못했으므로 저장소와 앱에 복제하지 않는다. 테스트에는
다음 deterministic numeric derivative만 둔다.

- 3×3 local maximum
- 9×9 median sharpness
- 10px non-maximum suppression
- extended M82 core를 피하기 위해 FITS row 66..204 제외
- raw sharpness ≥4500
- sample count n=24
- source WCS로 catalog coordinate 계산

이는 photometry도 production catalog도 아니다. `magnitudeProxy`는 calibrated magnitude가 아니라
추출 sharpness 순서다. production 사용권은 `PENDING`이다.

## 7. Failure, retry, cache, offline

| Failure | Result | Automatic retry |
|---|---|---:|
| image only | `FEATURE_EXTRACTION_NOT_IMPLEMENTED` | 0 |
| source <6 / invalid input | `INSUFFICIENT_SOURCES` / validation code | 0 |
| unsigned/untrusted manifest | signature error | 0 |
| wrong bytes/hash/schema/revision | exact index error | 0 |
| no candidate | `NO_MATCH` | 0 |
| held-out residual fail | `INDEPENDENT_VERIFICATION_FAILED` | 0 |
| equivalent fields | `AMBIGUOUS_MATCH` | 0 |
| affine cannot model distortion | `NO_MATCH` or independent failure | 0 |
| local budget | `LOCAL_BUDGET_EXCEEDED` | 0 |
| abort | `SOLVE_CANCELLED` | 0 |

Verified cache key는 input digest + solver version + index revision이다. 같은 key의 결과는 장기
cache 후보지만 이 PR은 persistence를 만들지 않는다. negative result TTL도 아직 저장하지 않는다.
offline에서는 이미 검증된 static shard와 feature list로 동작한다. range resume, delta, regional
pack inventory, disk LRU는 ENG-406 후속 범위다.

## 8. Cloud escalation

Cloud는 자동 fallback이 아니다. local failure가 eligible이어도 다음 네 gate를 모두 통과해야 한다.

1. explicit solve escalation consent
2. separate original upload consent
3. network available
4. configured cloud adapter

현재 4번이 없으므로 최종 상태는 `PROPOSED_NOT_EXECUTED / CLOUD_ADAPTER_NOT_IMPLEMENTED`,
request count 0이다. endpoint를 문서나 코드에서 추측하지 않는다. 위치 EXIF 제거, object lifecycle,
비용 ceiling, cancel/delete receipt 전에는 adapter를 추가하지 않는다.

## 9. Security and privacy

- original pixels/FITS/RAW를 module이 읽거나 저장·전송하지 않는다.
- image digest가 없더라도 feature list와 index revision으로 deterministic input digest를 만든다.
- artifact path traversal, length mismatch, checksum, signer, signature, schema, revision을 fail-closed한다.
- public key는 DEV fixture scope이며 production trust로 표현하지 않는다.
- observation location은 request에 없고 WCS는 sky coordinate만 반환한다.
- cloud planning은 consent가 없으면 network adapter에 도달하지 않는다.
- diagnostics에 email, EXIF, 원본 path, pixel value를 넣지 않는다.

## 10. Test corpus

`node tools/test_aetherus_astrometry.mjs`

1. static Ed25519 manifest와 M82 artifact SHA-256
2. public M82 16 INDEX + 8 held-out VALIDATION solve
3. WCS CRPIX와 source coordinate residual
4. synthetic 121° rotation
5. mirrored field
6. centroid noise
7. strong radial distortion rejection
8. index-only apparent match + unrelated validation stars: VERIFIED 0
9. two independently valid symmetric fields: `AMBIGUOUS_MATCH`
10. image-only explicit failure
11. pre-cancel and deterministic local budget failure
12. same-length artifact tamper checksum failure
13. manifest metadata tamper signature failure
14. untrusted signer failure
15. cloud consent/upload/adapter gates, request 0
16. 30-run seeded desktop p95 benchmark
17. module source network/timer/animation loop 0

Critical false-positive set의 허용 VERIFIED 수는 0이다. 실패를 flaky로 숨기지 않는다.

## 11. Performance, KPI, cost

Word의 seeded p95 <3초 device는 UNVERIFIED target이다. 현재 최종 수치는 desktop Node 20.18.1의
30-run M82 feature-list p95 56.65 ms일 뿐 실제 iOS/Android, cold cache, Web Worker, low-end
thermal, offline/reconnect evidence가 아니다.

현재 측정 가능한 KPI:

- independent validation match count/residual
- verified candidate count
- evaluated hypothesis count
- elapsed ms
- retry/network/original-upload count = 0
- false-positive critical corpus = 0

로컬 실제 desktop browser에서 temporary QA page로 static module을 로드해 다음을 확인한 뒤
QA page는 삭제했다. 이는 mobile device evidence가 아니다.

```text
secure context: true
Web Crypto: available
manifest/signature: VERIFIED / DEV_FIXTURE_ONLY
solve: VERIFIED
held-out validation: 8, p95 0.000031 arcsec
single-run elapsed: 32.9 ms
solver network/upload: 0/0
console error: 0
```

현재 배포 비용은 static JS/JSON storage와 CDN egress뿐이다. catalog build compute, large index
egress, device storage, cloud CPU/GPU, temporary image object는 모두 0 또는 NOT IMPLEMENTED다.

## 12. Release gate

| Word PR-06 evidence | Current evidence | Gate |
|---|---|---|
| public/synthetic WCS corpus | NASA M82 numeric derivative + deterministic synthetic rotation/mirror/noise | PASS for first slice |
| false-match adversarial | independent failure + ambiguous duplicate field, VERIFIED 0 | PASS |
| signed index checksum | pinned DEV Ed25519 + exact bytes/SHA-256 | PASS for DEV fixture only |
| device benchmark | desktop Node 30-run only | OPEN |
| explicit optional cloud escalation | four consent/config gates, request 0 | PASS contract / adapter NOT IMPLEMENTED |
| production catalog license/signer | pending | OPEN |

따라서 local core와 DEV static artifact는 구현 완료지만 Astrometry 제품 release와 Word 단계 완료를
주장하지 않는다. 실제 mobile/worker benchmark와 production catalog license/signer가 남아 있다.

## 13. Deployment and rollback

UI와 현재 runtime import graph는 변경하지 않는다. 배포하는 경우에도 다음 세 static artifact만
올리고 일반 route가 추가 request를 만들지 않는지 확인한다.

- `prototype/js/space/astrometry.js`
- `prototype/data/astrometry/index-manifest-v1.json`
- `prototype/data/astrometry/m82-nasa-wcs-seeded-v1.json`

rollback은 위 세 artifact를 이전 부재 상태로 되돌리는 것이며 Astronomy, Sky AR, Observation
Session, service worker, IndexedDB, route, Earthus safety/warn 파일은 변경하지 않는다.

2026-08-12 02:35 UTC에 위 세 DEV static artifact만 운영에 반영했다. 일반 앱 import graph와
HTML/service worker는 변경하지 않아 공개 runtime은 열리지 않았다.

- `/js/space/astrometry.js` — SHA-256 `58b94cda8509f282bb849b3ca35d5354295fc0d8d9a6e7a70b274f669f770f87`
- `/data/astrometry/index-manifest-v1.json` — SHA-256 `05764a05f52de59ea830c98a35ae968ea65317aeab87d7089b4b3e90385fae8b`
- `/data/astrometry/m82-nasa-wcs-seeded-v1.json` — SHA-256 `7429183bf4aef3d32b47c28f9ba3cac3c263b84517c110505369f12eed276cb5`

CloudFront invalidation은 `I1W656O5RLP7CVJPG4JRGDQTZR`다. Cache-busting live URL의 세
SHA-256은 로컬과 일치했다. 응답은 JS `text/javascript; charset=utf-8`, JSON
`application/json; charset=utf-8`, 모두 `no-cache`, `RefreshHit from cloudfront`였다. 운영
HTML에는 Astrometry module/manifest/shard reference가 0이다.

## 14. Future extensions

순서는 다음과 같다.

1. 실제 mobile Web Worker benchmark와 Ed25519 compatibility matrix
2. production catalog license와 offline signer/rotation/revocation ADR
3. deterministic image source extraction + hot pixel/cloud fixtures
4. SIP distortion fit와 public multi-projection corpus
5. regional shard coverage, range resume, delta, pinned-session LRU
6. user-approved cloud adapter with cancel/delete receipt and per-success cost
7. Sky AR plate-solved calibration profile as a new revision
8. archive WCS and science submission consumers under the same contract fixture

video incremental solve, moving-object tracklets, distributed user index는 위 gate 뒤의 future다.

## 15. Official references

- NASA FITS WCS: `https://fits.gsfc.nasa.gov/fits_wcs.html`
- NASA FITS sample files: `https://fits.gsfc.nasa.gov/fits_samples.html`
- NASA/NRAO sample WCS directory: `https://fits.gsfc.nasa.gov/nrao_data/samples/wcs/`
- W3C Web Cryptography Level 2, Ed25519: `https://www.w3.org/TR/WebCryptoAPI/`

## 16. Traceability

```yaml
requirement: ENG-405-C / ENG-406-C / TST-003 / ADR-007
baselineCommit: d4d1d72
implementation:
  - prototype/js/space/astrometry.js
  - prototype/data/astrometry/index-manifest-v1.json
  - prototype/data/astrometry/m82-nasa-wcs-seeded-v1.json
tests:
  - tools/test_aetherus_astrometry.mjs
  - tools/fixtures/astrometry/m82opt-nasa-wcs-features-v1.json
evidence:
  - signed manifest and exact artifact SHA-256
  - public M82 and deterministic synthetic/adversarial corpus
  - desktop seeded p95 benchmark
adr: ADR-007 repository-constrained implementation
release: DEV_STATIC_ARTIFACT_DEPLOYED / PUBLIC_RUNTIME_NOT_RELEASED
invalidation: I1W656O5RLP7CVJPG4JRGDQTZR
owner: Aetherus
pending:
  - actual iOS/Android Web Worker benchmark
  - production catalog license and signer
  - raw image source extraction
  - cloud adapter
```
