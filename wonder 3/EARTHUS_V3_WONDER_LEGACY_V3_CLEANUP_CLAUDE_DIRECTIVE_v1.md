# EARTHUS V3 WONDER — LEGACY V3 CLEANUP / AWS DECOMMISSION DIRECTIVE v1.0

## 목적

기존 EARTHUS V3를 수정하거나 개조하지 않는다.

새 프로젝트 `EARTHUS V3 WONDER`를 NEW BUILD로 시작하기 위해 기존 V3 runtime/deploy를 정리한다.

### 절대 보존 대상

다음은 삭제하지 않는다.

- EARTHUS V1
- EARTHUS V2
- EARTHUS Simulation V3
- DAMC
- AETHERUS
- 공통 AWS infrastructure
- 공유 database
- 공유 S3 data
- KMA / AirKorea / KTO 등 공용 원천 데이터
- 인증/결제/회원 공통 시스템
- 승인된 기존 캐릭터/스토리 원본 asset
- Library/archive에 보관된 원본 패키지

삭제 대상은 **오직 기존 EARTHUS Kids/V3 runtime 및 그 전용 배포 산출물**이다.

---

# 1. 가장 먼저: READ-ONLY AUDIT

삭제 명령을 실행하기 전에 반드시 현재 상태를 조사한다.

## Local

확인:

- repository root
- git branch
- HEAD
- working tree
- untracked files
- V3 관련 directory
- V3 deploy scripts
- CI/CD workflows
- S3 paths
- CloudFront distribution
- Route53/domain mapping
- environment variables
- build outputs
- service worker
- legacy asset packs

검색 키워드:

```text
v3-paper
v3-kids
app/v3/
v3/
kids
wonder
deploy
cloudfront
s3
aws
```

## AWS

AWS CLI가 연결되어 있는지 확인한다.

```bash
aws sts get-caller-identity
aws configure list
```

그 후 다음을 조사한다.

```bash
aws s3 ls
aws cloudfront list-distributions
aws route53 list-hosted-zones
```

단, 전체 목록을 삭제 대상으로 간주하지 않는다.

정확한 V3 전용 bucket/prefix/distribution/origin을 repo, deploy script, environment, CloudFront 설정을 교차검증하여 확정한다.

---

# 2. 현재 알려진 V3 배포 충돌

기존 감사에서 다음 문제가 확인되었다.

`v3-kids`와 `v3-paper` 배포 스크립트가 동일한 S3 prefix:

```text
app/v3/
```

를 사용해 서로 덮어쓸 위험이 있었다.

기존 live는:

```text
https://earthus.net/v3
```

이며 당시 live 본체는 `v3-paper`로 확인되었다.

이 기존 live를 삭제할 때는 해당 domain mapping / CloudFront origin이 실제로 무엇을 가리키는지 먼저 증거를 남긴다.

---

# 3. 삭제 전 필수 백업

삭제 전 다음을 archive로 만든다.

## Local archive

```text
legacy-v3-archive/
```

포함:

- 기존 V3 source
- config
- deploy scripts
- CI workflow
- package-lock
- manifest
- legacy data contracts
- build metadata

단, giant generated assets는 중복 복사하지 말고 이미 존재하는 canonical archive를 참조한다.

## AWS

삭제 대상이 확정되면 삭제 직전 inventory를 JSON/text로 저장한다.

예:

```text
artifacts/legacy-v3-cleanup/
  aws-account.txt
  s3-inventory.json
  cloudfront-inventory.json
  route53-inventory.json
  v3-deploy-map.json
  cleanup-plan.md
  sha256sums.txt
```

삭제 직전 상태를 기록한다.

---

# 4. 삭제 대상 판정 규칙

아래 4개 조건을 모두 만족해야 삭제 대상으로 판정한다.

1. 기존 V3 전용 리소스임
2. V1/V2/shared infrastructure가 아님
3. 새 V3 WONDER가 아직 사용하지 않음
4. repo/deploy/runtime 증거가 일치함

판정이 불명확하면 삭제하지 않는다.

절대 다음 식의 broad delete를 하지 않는다.

```bash
aws s3 rb s3://<unknown>
aws s3 rm s3://<unknown> --recursive
aws cloudfront delete-distribution ...
```

확정된 리소스 ID/path가 없으면 먼저 inventory를 작성한다.

---

# 5. Local legacy V3 삭제

새 프로젝트가 별도 root로 만들어질 것이므로 기존 V3 source를 바로 `rm -rf`하지 않는다.

먼저 archive 후 다음 순서:

1. legacy V3 build stop
2. legacy V3 dev server stop
3. legacy V3 service worker/reference 제거
4. old V3 CI trigger 제거
5. old deploy target 제거
6. 마지막으로 local legacy source 제거

새 project는:

```text
earthus-v3-wonder/
```

로 완전히 분리한다.

---

# 6. AWS Legacy V3 정리

### 6.1 S3

정확한 기존 V3 bucket과 prefix를 확인한다.

기존 감사에서 발견된 위험 prefix 예:

```text
app/v3/
```

그러나 현재 실제 bucket/path를 repo와 AWS에서 다시 확인한다.

삭제 순서:

1. object inventory 저장
2. V3-only prefix 확인
3. 해당 prefix 삭제
4. versioned bucket이면 old versions/delete markers도 확인
5. lifecycle rules 확인
6. 완료 후 prefix가 비어 있음을 재검증

공유 bucket이면 bucket 자체를 삭제하지 않는다.

공유 bucket 안의 **V3-only prefix만 삭제**한다.

---

# 7. CloudFront

CloudFront distribution이 V3 전용인지 확인한다.

검증:

- distribution ID
- aliases
- origins
- origin path
- behaviors
- cache policy
- target bucket
- attached certificate

V3 전용일 때만 decommission.

공유 CloudFront이면 삭제하지 않고 legacy behavior/origin만 제거할 수 있는지 검토한다.

삭제/변경 후:

```bash
aws cloudfront get-distribution --id <CONFIRMED_DISTRIBUTION_ID>
```

로 상태를 확인한다.

---

# 8. Route53 / Domain

`earthus.net/v3`가 CloudFront 전체 distribution을 공유한다면 DNS zone 자체를 건드리지 않는다.

기존 `/v3` path routing 또는 origin mapping이 어디에서 이루어지는지 확인한다.

새 V3 WONDER가 최종 배포되기 전까지 domain이 빈 화면/404가 되지 않도록 한다.

가능하면 다음 순서로 전환:

```text
legacy V3
   ↓
maintenance/placeholder or controlled deployment
   ↓
new V3 WONDER
```

단, 사용자가 명시적으로 legacy public V3를 즉시 내리기로 했으므로 downtime 여부를 cleanup report에 명확히 기록한다.

---

# 9. CI/CD

삭제 또는 비활성화:

- legacy V3 deploy workflow
- v3-kids deploy workflow
- old S3 sync target
- old invalidation target
- old build artifact path

특히 `v3-kids`가 기존 `app/v3/`를 덮는 workflow가 남아 있으면 반드시 제거/비활성화한다.

새 workflow는 새 project만 대상으로 한다.

---

# 10. Service Worker / Cache

기존 V3 service worker가 남아 있으면 새 V3 WONDER의 resource를 계속 가로챌 수 있다.

확인:

```text
service-worker
sw.js
workbox
cache storage
```

legacy V3 cache namespace는 새 V3 WONDER와 완전히 분리한다.

새 version은 새로운 cache namespace를 사용한다.

---

# 11. DB / Supabase

기존 V3 전용 table이 있는지 조사한다.

하지만 shared DB schema를 broad delete하지 않는다.

다음만 조사:

- V3-specific tables
- V3-specific storage buckets
- V3-specific policies
- V3-specific scheduled jobs

공유 인증/회원/결제/플랫폼 데이터는 절대 삭제하지 않는다.

삭제가 필요하면 별도 migration으로 분리하고 evidence를 남긴다.

---

# 12. Legacy data / asset handling

기존 124 character assets, story scene assets, approved master sheets는 삭제하지 않는다.

이 자산들은 새 V3 WONDER의 content source로 재사용할 수 있다.

단, legacy runtime bundle/duplicate packs는 새 Asset Registry에 등록하지 않는다.

기존 감사에서 character assets 전체가 약 201.9MB 수준이었으므로 중복 pack을 여러 벌 남기지 않는다.

---

# 13. Cleanup 후 반드시 검증

## Local

```bash
git status
```

clean/expected 상태인지 확인.

검색:

```bash
git grep -n "v3-kids"
git grep -n "v3-paper"
git grep -n "app/v3/"
```

남아 있는 references가 있으면 이유를 기록한다.

## AWS

확정된 V3 legacy prefix가 더 이상 존재하지 않는지 확인.

CloudFront legacy distribution이 실제로 제거/비활성화됐는지 확인.

CI에서 legacy V3 deploy가 더 이상 실행되지 않는지 확인.

---

# 14. NEW BUILD 보호 규칙

cleanup이 끝난 다음 새 프로젝트는 기존 V3 경로를 재사용하지 않는다.

새 구조:

```text
EARTHUS V3 WONDER
│
├─ apps/web
├─ packages
├─ content
├─ docs
└─ tests
```

배포 경로도 기존 legacy path와 충돌하지 않게 설계한다.

새 project가 안정화된 뒤 최종적으로:

```text
https://earthus.net/v3
```

를 새 WONDER entry로 연결한다.

---

# 15. DO NOT

절대 하지 않는다.

- V1 삭제
- V2 삭제
- Simulation V3 삭제
- DAMC 삭제
- AETHERUS 삭제
- 공용 S3 bucket 삭제
- 공용 DB 삭제
- 공용 CloudFront 삭제
- 전체 Route53 zone 삭제
- AWS account-level resource 정리
- unknown resource 강제 삭제
- git history rewrite
- 기존 원본 asset 영구 삭제
- `rm -rf` broad wildcard
- `aws s3 rm --recursive` on unknown bucket
- deletion without inventory

---

# 16. 최종 결과 보고 형식

cleanup이 끝나면 다음을 보고한다.

```text
EARTHUS V3 LEGACY CLEANUP

LOCAL
- legacy source: DELETED / ARCHIVED
- deploy scripts: REMOVED / DISABLED
- CI: DISABLED
- service worker: CLEANED

AWS
- S3 legacy V3 prefix: DELETED / RETAINED
- CloudFront legacy distribution: DELETED / RETAINED
- Route mapping: REMOVED / RETAINED
- legacy jobs: DISABLED / RETAINED

PROTECTED
- V1: SAFE
- V2: SAFE
- Simulation V3: SAFE
- DAMC: SAFE
- AETHERUS: SAFE
- shared data: SAFE

NEW BUILD
- new V3 WONDER repository: READY
- legacy path collision: NONE
```

모든 항목에는 실제 resource ID/path와 검증 명령 결과를 함께 기록한다.

---

# 17. 실행 명령

Claude Code는 이 문서를 읽은 후:

**STEP 1 — READ-ONLY AUDIT**

부터 실행한다.

Audit 결과에서 실제 V3 legacy 리소스를 확정한 뒤,

**STEP 2 — ARCHIVE**

**STEP 3 — LOCAL CLEANUP**

**STEP 4 — AWS LEGACY CLEANUP**

**STEP 5 — CI/CD CLEANUP**

**STEP 6 — CACHE/SERVICE WORKER CLEANUP**

**STEP 7 — VERIFICATION**

순서로 진행한다.

삭제가 끝난 후에야 **EARTHUS V3 WONDER NEW BUILD**를 시작한다.

절대 기존 V3를 새 프로젝트의 기반 코드로 복구/통합하지 않는다.
