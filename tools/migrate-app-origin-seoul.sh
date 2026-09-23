#!/usr/bin/env bash
# earthus.net 앱 코드 원본을 오하이오(us-east-2) → 서울(ap-northeast-2)로 옮긴다.
#
# ── 왜 (2026-09-23 PD "서울로 옮겨봐") ─────────────────────────────────────────────────────────────
#   v1 첫 화면이 폰 LTE 에서 8~15초 걸렸다. 로딩 화면은 JS 모듈 108개를 4~5단계로 받는 동안 떠 있는데,
#   파일이 전부 no-cache 라 서울 CloudFront 엣지가 요청마다 오하이오 S3 에 '바뀌었나'를 되물었다
#   (X-Cache: RefreshHit, 첫 바이트 0.52~0.59초 · 엣지에 있을 때 0.03초). 단계마다 0.55초 × 4~5.
#   버킷 이름은 earthus-cache-kr 인데 실제 자리는 오하이오다.
#
# ── 무엇을 옮기고 무엇을 남기나 ──────────────────────────────────────────────────────────────────────
#   옮김: s3://earthus-cache-kr/app/ 의 **저장소 코드·자산**(v1 · v2 · 아이콘 · 벤더 …) → s3://earthus-app-seoul/app/
#   남김: 람다가 계속 쓰는 자리(aws/_shared/write_policy.py APP_WRITERS 의 GENERATED)
#         app/tourism/ (3.77 GB · tourism-flow) · app/v2/data/current-earth/ (snow-ice) · app/aetherus/ (space 스냅샷)
#         → CloudFront 가 이 경로만 옛 원본(s3-app, 오하이오)을 보게 동작을 더한다.
#   자료 동작(/wind /events /ocean /solar /clouds /celestrak → s3-data)은 건드리지 않는다.
#   ⚠️ 오하이오 app/ 는 지우지 않는다 — 되돌리기 자리이고, 람다 몇 개(air-state 등)가 app/data 를 거기서 읽는다.
#
# ── 단계 (하나씩 부른다) ────────────────────────────────────────────────────────────────────────────
#   plan        — 무엇을 할지 출력만(쓰기 0건)
#   bucket      — 서울 버킷 생성 · 공개 차단 · CloudFront(OAC)만 읽는 정책
#   copy        — app/ 복사(남길 자리 제외) + 디렉터리 키 6개 따로 + Content-Type 표본 대조
#   cloudfront  — 배포 설정 백업 → 서울 원본 추가 · 남길 경로 동작 추가 · 기본 동작을 서울로 → 무효화
#   verify      — 공개 주소에서 원본·헤더·첫 바이트 시간 확인
#   rollback    — 백업해 둔 배포 설정으로 되돌린다(기본 동작이 다시 오하이오)
#
# 권한: 버킷 생성·정책·배포 설정 변경은 배포 전용 키(earthus-deploy)로 안 될 수 있다 — 그때는 root 세션으로
#       (`aws login` 뒤 EARTHUS_AWS_PROFILE=default). 비밀값을 이 파일·채팅에 넣지 않는다.
set -euo pipefail
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8
export AWS_PROFILE="${EARTHUS_AWS_PROFILE:-default}"

SRC_BUCKET="earthus-cache-kr"; SRC_REGION="us-east-2"
DST_BUCKET="${EARTHUS_APP_BUCKET_SEOUL:-earthus-app-seoul}"; DST_REGION="ap-northeast-2"
DIST="${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-E193CZEBLWEB56}"
ACCOUNT="294951922100"
OAC_ID="E29M1Z74Z4SYMF"          # 지금 s3-app · s3-data 가 쓰는 OAC — S3 원본끼리 같이 쓸 수 있다
OLD_ORIGIN="s3-app"; NEW_ORIGIN="s3-app-seoul"
KEEP_OHIO=("tourism/" "v2/data/current-earth/" "aetherus/" "v2/aetherus/")   # app/ 아래, 람다·발행기가 계속 쓰는 자리
# ⚠️ v2/aetherus/ — tools/publish-aetherus-snapshot.sh 가 app/aetherus/ 와 함께 호환 사본을 쓴다. 빼면 서울 사본이 굳는다(전수 조사).
NEVER_COPY=("public-api/")   # ⚠️ API 키 원장이 공개 자리에 남아 있던 잔존물(2026-09-16~). 옮기지 않는다 — 지우는 것은 PD 몫.
DEPLOY_USER="arn:aws:iam::294951922100:user/earthus-deploy"
DIR_KEYS=("app/v2" "app/v2/" "app/Intelligence" "app/Intelligence/" "app/v2-three" "app/v2-three/")
STATE_DIR="${EARTHUS_MIGRATION_DIR:-build/migrate-app-seoul}"
mkdir -p "$STATE_DIR"
STEP="${1:-plan}"

say() { printf '%s\n' "$*"; }
need() { command -v "$1" >/dev/null || { say "$1 required" >&2; exit 2; }; }
need aws; need python; need curl

step_plan() {
  say "== plan =="
  say "원본: s3://$SRC_BUCKET/app/ ($SRC_REGION) → 사본: s3://$DST_BUCKET/app/ ($DST_REGION)"
  say "남길 자리(오하이오 · CloudFront 동작 추가): ${KEEP_OHIO[*]}"
  say "디렉터리 키(따로 복사): ${DIR_KEYS[*]}"
  say "CloudFront $DIST: 원본 $NEW_ORIGIN 추가 → 기본 동작 $OLD_ORIGIN → $NEW_ORIGIN, 남길 경로 동작 → $OLD_ORIGIN"
  say "쓰는 계정: $(aws sts get-caller-identity --query Arn --output text 2>&1 | tail -1)"
}

step_bucket() {
  say "== bucket =="
  if aws s3api head-bucket --bucket "$DST_BUCKET" --region "$DST_REGION" 2>/dev/null; then
    say "SKIP 이미 있다: $DST_BUCKET"
  else
    aws s3api create-bucket --bucket "$DST_BUCKET" --region "$DST_REGION" \
      --create-bucket-configuration LocationConstraint="$DST_REGION" >/dev/null
    say "PASS 생성: $DST_BUCKET ($DST_REGION)"
  fi
  # 공개 접근은 전부 막는다 — 읽는 것은 CloudFront(OAC) 하나뿐이다.
  aws s3api put-public-access-block --bucket "$DST_BUCKET" --region "$DST_REGION" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  local pol="$STATE_DIR/bucket-policy.json"
  cat > "$pol" <<JSON
{"Version":"2012-10-17","Statement":[{"Sid":"AllowCloudFrontRead","Effect":"Allow",
 "Principal":{"Service":"cloudfront.amazonaws.com"},"Action":"s3:GetObject",
 "Resource":"arn:aws:s3:::$DST_BUCKET/app/*",
 "Condition":{"StringEquals":{"AWS:SourceArn":"arn:aws:cloudfront::$ACCOUNT:distribution/$DIST"}}},
 {"Sid":"DeployUserAppObjects","Effect":"Allow","Principal":{"AWS":"$DEPLOY_USER"},
  "Action":["s3:PutObject","s3:GetObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::$DST_BUCKET/app/*"},
 {"Sid":"DeployUserList","Effect":"Allow","Principal":{"AWS":"$DEPLOY_USER"},
  "Action":"s3:ListBucket","Resource":"arn:aws:s3:::$DST_BUCKET","Condition":{"StringLike":{"s3:prefix":["app/*","app"]}}}]}
JSON
  aws s3api put-bucket-policy --bucket "$DST_BUCKET" --region "$DST_REGION" --policy "file://$pol"
  say "PASS 공개 차단 + CloudFront($DIST)만 읽기 + 배포 계정(earthus-deploy) app/ 쓰기·읽기·목록"
  # ⚠️ 배포 계정 권한이 없으면 전환 뒤 모든 배포가 AccessDenied 로 멈춘다(전수 조사 — 그 계정의 IAM 은 earthus-cache-kr 만 연다).
}

step_copy() {
  say "== copy =="
  local ex=()
  for p in "${KEEP_OHIO[@]}" "${NEVER_COPY[@]}"; do ex+=(--exclude "${p}*"); done
  # --copy-props metadata-directive: Content-Type · Cache-Control 을 그대로 옮긴다(태그는 안 옮긴다 — 권한이 따로 든다).
  # ⚠️ Content-Type 이 빠지면 ES 모듈이 통째로 안 뜬다(HANDOVER §3). 아래에서 표본을 대조한다.
  aws s3 sync "s3://$SRC_BUCKET/app/" "s3://$DST_BUCKET/app/" "${ex[@]}" \
    --source-region "$SRC_REGION" --region "$DST_REGION" --copy-props metadata-directive --only-show-errors
  say "PASS sync"
  # 디렉터리 키(/v2/ 같은 주소가 가리키는 객체) — sync 가 '/' 로 끝나는 키를 건너뛸 수 있어 하나씩 옮긴다(v2 디렉터리 키 함정).
  for k in "${DIR_KEYS[@]}"; do
    if aws s3api head-object --bucket "$SRC_BUCKET" --key "$k" --region "$SRC_REGION" >/dev/null 2>&1; then
      aws s3api copy-object --copy-source "$SRC_BUCKET/$k" --bucket "$DST_BUCKET" --key "$k" \
        --metadata-directive COPY --region "$DST_REGION" >/dev/null
      say "PASS dir-key $k"
    fi
  done
  # 표본 대조 — 개수와 Content-Type · Cache-Control · 크기
  python - "$SRC_BUCKET" "$SRC_REGION" "$DST_BUCKET" "$DST_REGION" "${KEEP_OHIO[@]}" "${NEVER_COPY[@]}" <<'PY'
import json, subprocess, sys
src, sreg, dst, dreg, *keep = sys.argv[1:]
def keys(b, r):
    out = subprocess.run(['aws','s3api','list-objects-v2','--bucket',b,'--prefix','app/','--region',r,'--query','Contents[].[Key,Size]','--output','json'],capture_output=True,text=True,check=True).stdout
    return {k: s for k, s in (json.loads(out) or [])}
S = {k: s for k, s in keys(src, sreg).items() if not any(k.startswith('app/'+p) for p in keep)}
D = keys(dst, dreg)
miss = [k for k in S if k not in D]
diff = [k for k in S if k in D and D[k] != S[k]]
print(f'원본(옮길 몫) {len(S)}개 · 사본 {len(D)}개 · 빠짐 {len(miss)} · 크기 다름 {len(diff)}')
for k in (miss[:10] + diff[:10]): print('  !', k)
samples = [k for k in S if k.endswith(('.js','.css','.html','.json','.svg','.webp'))][:: max(1, len(S)//40)][:40] + [k for k in ('app/index.html','app/v2/','app/v2/index.html','app/js/main.js') if k in S]
bad = 0
for k in samples:
    h = lambda b, r: json.loads(subprocess.run(['aws','s3api','head-object','--bucket',b,'--key',k,'--region',r],capture_output=True,text=True,check=True).stdout)
    a, c = h(src, sreg), h(dst, dreg)
    if (a.get('ContentType'), a.get('CacheControl')) != (c.get('ContentType'), c.get('CacheControl')):
        bad += 1; print('  ! 머리 다름', k, a.get('ContentType'), c.get('ContentType'), a.get('CacheControl'), c.get('CacheControl'))
print(f'머리 표본 {len(samples)}개 중 다름 {bad}')
sys.exit(1 if (miss or diff or bad) else 0)
PY
  say "PASS copy 대조"
}

step_cloudfront() {
  say "== cloudfront =="
  local cfg="$STATE_DIR/dist-config.before.json" new="$STATE_DIR/dist-config.after.json"
  aws cloudfront get-distribution-config --id "$DIST" --output json > "$cfg"
  say "백업: $cfg (되돌리기 때 쓴다)"
  python - "$cfg" "$new" "$DST_BUCKET" "$DST_REGION" "$OAC_ID" "$OLD_ORIGIN" "$NEW_ORIGIN" "${KEEP_OHIO[@]}" <<'PY'
import copy, json, sys
cfg_path, new_path, bucket, region, oac, old, new, *keep = sys.argv[1:]
doc = json.load(open(cfg_path, encoding='utf-8'))
c = doc['DistributionConfig']
origins = c['Origins']['Items']
if not any(o['Id'] == new for o in origins):
    base = next(o for o in origins if o['Id'] == old)
    o = copy.deepcopy(base)
    o['Id'] = new
    o['DomainName'] = f'{bucket}.s3.{region}.amazonaws.com'
    o['OriginPath'] = '/app'
    o['OriginAccessControlId'] = oac
    o.setdefault('S3OriginConfig', {})['OriginAccessIdentity'] = ''
    origins.append(o)
    c['Origins']['Quantity'] = len(origins)
db = c['DefaultCacheBehavior']
beh = c.setdefault('CacheBehaviors', {'Quantity': 0, 'Items': []})
items = beh.get('Items') or []
have = {b['PathPattern'] for b in items}
add = []
for p in keep:
    pat = '/' + p + '*'
    if pat in have: continue
    b = copy.deepcopy(db)          # 기본 동작과 같은 캐시 정책·압축·메서드 — 가리키는 원본만 옛 자리
    b['PathPattern'] = pat
    b['TargetOriginId'] = old
    for k in ('SmoothStreaming',):
        b.setdefault(k, False)
    add.append(b)
beh['Items'] = add + items          # 좁은 경로가 먼저 걸리게 앞에
beh['Quantity'] = len(beh['Items'])
db['TargetOriginId'] = new
json.dump(c, open(new_path, 'w', encoding='utf-8'), ensure_ascii=True, indent=1)
print('기본 동작 →', new, '· 더한 동작', [b['PathPattern'] for b in add], '· 원본', [o['Id'] for o in origins])
PY
  local etag; etag=$(python -c "import json,sys; print(json.load(open(sys.argv[1],encoding='utf-8'))['ETag'])" "$cfg")
  aws cloudfront update-distribution --id "$DIST" --if-match "$etag" --distribution-config "file://$new" --query 'Distribution.Status' --output text
  MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" --query 'Invalidation.Id' --output text
  say "배포 전파를 기다린다(보통 수 분)…"
  aws cloudfront wait distribution-deployed --id "$DIST"
  say "PASS cloudfront 전환"
}

step_verify() {
  say "== verify =="
  for u in "https://earthus.net/" "https://earthus.net/js/main.js" "https://earthus.net/v2/" "https://earthus.net/v2/js/main.js" \
           "https://earthus.net/v2" "https://earthus.net/Intelligence" "https://earthus.net/Intelligence/"            "https://earthus.net/tourism/seoul-flow.json" "https://earthus.net/v2/data/current-earth/snow-ice.meta.json"            "https://earthus.net/aetherus/manifest.json" "https://earthus.net/v2/aetherus/manifest.json"; do
    for i in 1 2; do
      read -r code ttfb ctype < <(curl -s -o /dev/null -w '%{http_code} %{time_starttransfer} %{content_type}\n' "$u")
      xc=$(curl -sI "$u" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-cache"{print $2}')
      say "$code ${ttfb}s  ${ctype:-?}  [$xc]  $u"
    done
  done
}

step_rollback() {
  say "== rollback (최소) =="
  # ⚠️ 백업본 전체로 덮지 않는다 — 그 사이 setup-llm-cloudfront.sh 등이 바꾼 설정까지 지워진다.
  #    기본 동작이 가리키는 원본만 오하이오(s3-app)로 되돌린다. 더한 남길 경로 동작은 어차피 s3-app 이라 둔다.
  # ⚠️ 전환 뒤 서울에만 배포한 것이 있으면, 되돌리기 전에 서울 → 오하이오로 다시 복사해야 옛 코드가 안 나간다.
  local cur="$STATE_DIR/rollback.current.json" out="$STATE_DIR/rollback.json"
  aws cloudfront get-distribution-config --id "$DIST" --output json > "$cur"
  python - "$cur" "$out" "$OLD_ORIGIN" <<'PY'
import json, sys
doc = json.load(open(sys.argv[1], encoding='utf-8'))
c = doc['DistributionConfig']; c['DefaultCacheBehavior']['TargetOriginId'] = sys.argv[3]
json.dump(c, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=True)
print('기본 동작 →', sys.argv[3])
PY
  local etag; etag=$(python -c "import json,sys; print(json.load(open(sys.argv[1],encoding='utf-8'))['ETag'])" "$cur")
  aws cloudfront update-distribution --id "$DIST" --if-match "$etag" --distribution-config "file://$out" --query 'Distribution.Status' --output text
  MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" --query 'Invalidation.Id' --output text
  say "PASS 되돌림(기본 동작이 다시 오하이오). 배포 스크립트 기본값 변경도 되돌릴 것. 서울 버킷은 지우지 않았다."
}

case "$STEP" in
  plan) step_plan ;; bucket) step_bucket ;; copy) step_copy ;; cloudfront) step_cloudfront ;;
  verify) step_verify ;; rollback) step_rollback ;;
  *) say "usage: $0 plan|bucket|copy|cloudfront|verify|rollback" >&2; exit 2 ;;
esac
