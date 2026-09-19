# EARTHUS Production rollback snapshot — 2026-09-13

Read-only capture taken before any Production WRITE. AWS WRITE COUNT during
capture: 0. No s3 cp/sync, no lambda update, no cloudfront invalidation, no delete.

## Identity
account : 294951922100   (matches EXPECTED_ACCOUNT)
arn     : arn:aws:iam::294951922100:root   <-- root credentials, see WARNING below
regions : ap-northeast-2 (Lambda) · us-east-2 (S3 bucket, confirmed by
          get-bucket-location LocationConstraint=us-east-2)

## Rollback anchor — Lambda `distribution`
FunctionName  distribution
Runtime       python3.12          Handler  handler.handler
Version       $LATEST             Aliases  (none)
CodeSize      125637              Timeout  300      Memory 2048
CodeSha256    g3gJl1vHU74N4RY9sZSoZHeTyEx82hJjMAQ6cybzezc=
LastModified  2026-09-13T10:09:01.000+0000
Role          arn:aws:iam::294951922100:role/earthus-lambda-distribution
Layers        []                  (Layer 0 confirmed)
EnvVarNames   CACHE_BUCKET, CACHE_REGION   (values deliberately not recorded)
State         Active / LastUpdateStatus Successful

PRESERVED ARTIFACT
  distribution-DEPLOYED-20260913T100901Z.zip
  size        125637 bytes
  sha256      837809975bc753be0de1163db194a8647793c84c7cda126330043a7326f37b37
  CodeSha256  g3gJl1vHU74N4RY9sZSoZHeTyEx82hJjMAQ6cybzezc=  (== deployed, verified)

  This file IS the currently running code, byte for byte. Rolling back means
  re-uploading it. Without it there was no rollback path at all: the function has
  no published versions and no alias, so nothing on AWS points at a previous build.

## CloudFront
Id            E193CZEBLWEB56
Status        Deployed / Enabled true
Domain        d3458uw9ftptt9.cloudfront.net
Aliases       www.earthus.net, earthus.net
LastModified  2026-09-02T16:11:16.863000+00:00
ConfigETag    E3UN6WX5RRO2AG      <-- required IfMatch token for any future change
Origins       s3-app     earthus-cache-kr.s3.us-east-2.amazonaws.com  (default target)
              s3-data    earthus-cache-kr.s3.us-east-2.amazonaws.com
              lambda-llm yslimqbrblc6hylbawb4bffqcy0etels.lambda-url.ap-northeast-2.on.aws
Default       ViewerProtocol redirect-to-https · Compress true
Behaviors     /wind/* /events/* /ocean/* /solar/* /clouds/* /celestrak/*  -> s3
              /api/*  -> lambda-llm, CachePolicy 4135ea2d (Managed-CachingDisabled)
NOTE          /app/* and /reports/published/* have NO explicit behavior; they fall
              through to DefaultCacheBehavior. Plan invalidation accordingly.

## S3 object census — s3://earthus-cache-kr
PUBLIC (bucket policy Sid=PublicReadData)
  events/                 291 objects        7,479,390 B
  app/                 12,326 objects    3,325,859,921 B
  reports/published/        2 objects          117,199 B
  wind/                   259 objects       53,780,447 B
  ocean/                  524 objects      353,545,605 B
  clouds/               6,139 objects      671,592,708 B
  solar/                    2 objects          143,330 B
  celestrak/               10 objects       14,740,222 B
  -- public total      19,553 objects    4,427,258,822 B

PRIVATE (absent from the bucket policy)
  archive/             12,328 objects    1,631,492,754 B
  analysis/                 9 objects          589,121 B
  character-studio/         0 objects                0 B
  -- private total     12,337 objects    1,632,081,875 B

INDEX STATE recorded separately (key, size, ETag, LastModified):
  events-toplevel.json     291 entries
  reports-published.json     2 entries

## Policy allowlist — code vs live bucket policy
publication_privacy.PUBLIC_PREFIXES  vs  Sid=PublicReadData
  app/ celestrak/ clouds/ wind/ events/ ocean/ solar/ reports/published/
  -> 8 of 8, EXACT MATCH in both directions.
publication_privacy.PRIVATE_PREFIXES  archive/ analysis/ character-studio/
  -> none appear in the bucket policy. Consistent.

## KNOWN_PUBLIC_LEAKS entry is now STALE
events/social-drafts.json   HeadObject -> 404 Not Found
archive/social-drafts.json  exists, 2,873 B, 2026-09-13T10:28:24+00:00

Proven absent, not merely invisible: the same list-objects-v2 call that returns
"archive/social-drafts.json" for prefix "archive/social" returns no keys for
prefix "events/social". ListBucket succeeded in both cases, so this is a 404, not
a 403. The module's own rule ("지우고 나면 이 항목을 뺀다") is now satisfied and the
entry should be removed — leaving it makes check_public_write report a leak that
does not exist. NOT changed in this pass; awaiting approval.

## WARNING — root credentials
get-caller-identity returned arn:aws:iam::294951922100:root. Deploying with the
account root identity means no least-privilege boundary and no per-deployer audit
trail, and the account guard cannot distinguish a deployer from anything else.
Recommend a dedicated IAM role for deployment before the first Production WRITE.

## What this snapshot still does NOT cover
- Per-object ETags for app/ archive/ clouds/ ocean/ wind/ (31,890 objects total).
  Only counts and total sizes were recorded for those.
- S3 bucket versioning: get-bucket-versioning Status = None.
  With versioning unset, an object overwritten by a deploy CANNOT be restored from
  a previous version — the only recovery for S3 content is to re-publish it. This
  is the single largest gap in rollback capability and it is a property of the
  bucket, not of the deploy script.
- Per-object ETags for app/ archive/ clouds/ ocean/ wind/ were not captured
  (31,890 objects); only counts and total sizes.
