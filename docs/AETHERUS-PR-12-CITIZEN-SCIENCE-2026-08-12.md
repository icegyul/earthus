# AETHERUS PR-12 — Citizen Science Submission Safety

> 기준일: 2026-08-12 (Asia/Seoul)
> 설계 기준: `AETHERUS_Engineering_Specification_v1.0_FINAL_CODEX_HANDOFF.docx` ENG-703

## 결론

실제 공개 campaign이나 partner integration 없이 Citizen Science local contract를 구현했다.
과학 제출은 campaign requirement, observation evidence, explicit consent, rights, location policy,
duplicate check, named human review를 모두 통과해야 `ACCEPTED`가 된다. Community like, AI quality
label, reputation score는 accepted transition을 만들 수 없다.

## State machine

```text
DRAFT campaign → OPEN
  └─ valid observation + consent → PENDING_REVIEW
       ├─ named reviewer ACCEPTED → partner package eligible
       ├─ named reviewer REJECTED → not exportable
       └─ owner explicit retraction → RETRACTED
```

Campaign requirement는 allowed observation type, verified WCS 여부, rights, `NOT_STORED` 또는
`COARSE_REGION` location policy를 가진다. exact latitude/longitude는 거부된다. 같은 campaign의
같은 observation ID는 duplicate result를 내며 새로운 과학 record를 만들지 않는다.

## Boundary

- local memory repository는 test fixture이며 public campaign catalogue가 아니다.
- `partnerPackage`는 ACCEPTED submission만 만들고 owner ID, personal note, RAW bytes, exact location을 제외한다.
- package 생성은 network transmit이 아니다. partner API, DOI, institution license, remote storage, reviewer role/RLS는 미구현이다.
- retraction은 owner confirmation이 있어야 하며 accepted 상태도 철회할 수 있다.

## Verification

```text
PASS: campaign requirement, consent, observation provenance, WCS, rights, location gates
PASS: campaign/observation duplicate block
PASS: partner export denied before named human ACCEPTED review
PASS: accepted package excludes owner ID, raw bytes and exact location
PASS: explicit owner retraction
PASS: no fetch or partner upload; no AI acceptance route
```

## Deployment and rollback

Only `app/js/space/citizen-science.js` is deployed as a static module. It has no runtime consumer,
does not open a public campaign or send data to a partner. Rollback replaces that sole file and
invalidates its CloudFront path.

### 2026-08-12 deployment evidence

- CloudFront invalidation: `I5I81WLN8W1ZIWPPGS0HY7OXST`
- Cache-busting production URL: HTTP 200, `text/javascript; charset=utf-8`, `Cache-Control: no-cache`
- Local/production SHA-256: `9b26e654c158ef9c9d987a0b705f527781c78b9fbbfb07027b48645268607790`
