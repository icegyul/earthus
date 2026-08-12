# AETHERUS PR-11 — Community Safety, Moderation & Dimensional Reputation

> 기준일: 2026-08-12 (Asia/Seoul)
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx` ENG-701/702, Part XVI PR-09

## 0. 결론

Community의 공개 이전 안전 계약을 local fixture로 구현했다. 사용자는 검토 완료된 파생물과
명시적 provenance·rights evidence가 있을 때만 private draft를 만들 수 있다. 사람의 명시적
publish 확인은 곧바로 공개하지 않고 moderation request를 만든다. moderation의 ACCEPTED는
evidence 검토 결과일 뿐 public URL 생성이 아니다.

Reputation은 likes/followers/단일 총점이 아닌 `OBSERVATION_QUALITY`, `CORRECTION`,
`EQUIPMENT_REVIEW`, `SCIENCE_CONTRIBUTION`의 분리 ledger다. moderation과 reputation은
서로의 state를 수정하지 않으며, contribution retraction은 해당 dimension을 재계산한다.

실제 Community table, Supabase RLS, remote media storage, 공개 피드, human moderator role,
Citizen Science campaign은 아직 구현·배포하지 않았다.

## 1. 상태와 책임

```text
private approved derivative + provenance + rights
  └─ createDraft ──> DRAFT (NOT_PUBLISHED)
       └─ explicit human publish ──> SUBMISSION_PENDING + PENDING moderation
            ├─ moderator ACCEPTED ──> reviewed only; still NOT_PUBLISHED
            ├─ moderator REJECTED ──> reviewed rejection; still NOT_PUBLISHED
            └─ owner withdraw consent ──> WITHDRAWN; no public URL

ACCEPTED moderation ──> verified contribution ──> dimensional reputation ledger
                                     └─ retraction ──> recompute that dimension
```

| owner | 책임 | 하지 않는 일 |
|---|---|---|
| Community post | draft, owner/revision/idempotency, rights/provenance, explicit human request, withdrawal | 직접 public URL·feed 쓰기 |
| Moderation | pending evidence의 ACCEPTED/REJECTED verdict | post publish, reputation score 수정 |
| Reputation | 검증 contribution의 dimension ledger와 retraction recompute | 단일 과학 권위 점수, popularity 사용 |
| Personal Universe | 개인 소유·export/delete | Community post의 publish/withdraw |

## 2. 입력·출력 계약

`createDraft` 입력은 다음을 반드시 요구한다.

```json
{
  "approvedDerivative": {
    "assetId": "derivative id",
    "contentDigest": "sha256 hex",
    "reviewState": "APPROVED"
  },
  "provenance": {
    "classification": "observation",
    "sourceRevision": "review revision",
    "freshness": "known status",
    "precision": "known tier"
  },
  "rights": {
    "display": "ALLOWED",
    "communityShare": "ALLOWED",
    "credit": "required",
    "license": "required",
    "sourceUrl": "https://required"
  }
}
```

권리 없는 기관 이미지, unapproved derivative, missing source/precision, anonymous popularity signal은
draft 또는 reputation 입력으로 허용되지 않는다. `publication.status`는 모든 이 PR 상태에서
`NOT_PUBLISHED`다. `explicitHumanPublish=true`은 사람이 “moderation에 보내겠다”고 확인한
의미이며, 외부 플랫폼이나 공개 웹에 게시할 권한이 아니다.

## 3. failure·retry·privacy

- 다른 owner, stale revision, invalid idempotency payload, rights/provenance 실패, confirmation
  없음은 즉시 실패하며 blind retry하지 않는다.
- `withdrawConsent`에는 명시적 확인이 필요하다. pending moderation request도 `WITHDRAWN`으로
  바꾸지만, remote public copy가 있었다고 주장하거나 삭제하지는 않는다.
- local fixture의 owner mismatch denial은 unit-level tenant check다. **실제 Supabase RLS
  tenant denial 증거가 아니다.**
- external fetch, CDN upload, analytics, geolocation, AI scoring, timer/rAF를 추가하지 않는다.

## 4. Reputation 분리

```json
{
  "principalId": "opaque id",
  "dimensions": {
    "OBSERVATION_QUALITY": { "verifiedCount": 1, "retractedCount": 0, "verifiedWeight": 2 }
  },
  "totalScore": null,
  "reason": "DIMENSIONAL_ONLY_NO_GLOBAL_AUTHORITY"
}
```

하나의 global total score는 없다. review가 철회되면 해당 contribution은 `RETRACTED`가 되고
dimension count/weight에서 제외된다. 좋아요·조회·팔로워 수는 schema에도 없으며, scientific
acceptance를 AI 또는 popularity로 결정하지 않는다.

## 5. Release evidence

```text
PASS: APPROVED derivative + full rights/provenance required for DRAFT
PASS: owner mismatch denial, revision/idempotency conflict, rights denial
PASS: explicit human confirmation only creates PENDING moderation, no public URL
PASS: moderation verdict leaves publication NOT_PUBLISHED
PASS: verified contribution is dimensional; retraction recomputes without total score
PASS: explicit consent withdrawal sets post/request withdrawal state
PASS: no fetch, timers, rAF, likes, followers, or global authority score
```

Actual RLS tenant denial, moderator role enforcement, remote post write, public share link, public-copy
purge, appeal SLA, Citizen Science campaign/partner package are **not implemented**. They need a
separate migration and authenticated principal A/B integration evidence before any public Community UI.

## 6. Deployment and rollback

Deploy only `app/js/space/community-safety.js` as JavaScript with `no-cache`; docs/tests remain local.
No current runtime imports it, so this deployment opens no feed, account state, upload or publishing action.
Rollback replaces that sole module with a prior safe blob and invalidates the same CloudFront path.

### 6.1 2026-08-12 deployment evidence

- CloudFront invalidation: `I86S36HTFCM0LQUT10PUTQVEQF`
- Cache-busting production URL returned HTTP 200, `text/javascript; charset=utf-8`, and `Cache-Control: no-cache`.
- Local/production SHA-256: `1c70a11b95c4b8197ec0bd5b76c6a722b676b43cada229797f4918120adf48ba`
- Local browser static-module navigation was blocked by the browser client (`ERR_BLOCKED_BY_CLIENT`), so it is not claimed as a browser PASS. The module has no user-facing runtime import; Node contracts and direct production bytes/MIME are the completed evidence for this PR.
