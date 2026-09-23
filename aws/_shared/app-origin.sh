# 앱 코드 원본 — 2026-09-23 서울 이사 뒤의 정본. app/ 에 쓰는 배포 스크립트는 여기서 버킷·리전을 받는다.
#
# 왜: earthus.net 의 코드가 오하이오(us-east-2) 버킷에 있어서 서울 CloudFront 엣지가 요청마다 오하이오에
#     '바뀌었나'를 되물었다(0.55초 × 모듈 단계 4~5). 코드를 서울(ap-northeast-2) 버킷으로 옮겼다
#     (tools/migrate-app-origin-seoul.sh). 람다·발행기가 계속 쓰는 자리만 오하이오에 남고 CloudFront 가
#     그 경로를 오하이오로 보낸다.
#
# ⚠️ 한 곳에서만 정한다 — 스크립트마다 버킷 이름을 따로 적으면, 하나를 빠뜨린 배포가 '올림·무효화 PASS'를
#    내고도 아무도 읽지 않는 버킷에 쓰게 된다(전환 전 전수 조사에서 9개 스크립트가 그렇게 조용히 성공했다).
#
# 쓰는 법:  . "$ROOT/aws/_shared/app-origin.sh"
#           read -r b r < <(app_target "js/main.js")     # → "earthus-app-seoul ap-northeast-2"
#           app_also_ohio "data/trenches.json" && …        # 람다가 오하이오에서 읽는 시드면 참
#           app_resolve "$DIST" || exit 1               # 먼저 — CloudFront 기본 동작이 지금 보는 원본으로 목적지를 정한다

# ⚠️ 환경변수(EARTHUS_APP_BUCKET)로 목적지를 받지 않는다 — tools/publish-aetherus-snapshot.sh 가 그 이름을 읽고
#    오하이오(app/aetherus/)에 써야 한다. 같은 이름을 서울로 export 하면 발행기까지 서울로 샌다(전수 조사).
# 목적지는 app_resolve 가 CloudFront 에서 읽어 채운다 — 비어 있으면 app_target 이 멈춘다(모르면 쓰지 않는다).
APP_BUCKET=""
APP_REGION=""
APP_SEOUL_BUCKET="earthus-app-seoul"
APP_SEOUL_REGION="ap-northeast-2"
APP_OHIO_BUCKET="earthus-cache-kr"
APP_OHIO_REGION="us-east-2"

# app/ 아래, 오하이오에 남는 자리(CloudFront 동작이 옛 원본 s3-app 을 본다) — migrate 스크립트의 KEEP_OHIO 와 같아야 한다.
APP_KEEP_OHIO=("tourism/" "v2/data/current-earth/" "aetherus/" "v2/aetherus/")
# 람다가 **오하이오에서** 읽는 저장소 시드(air-state · obis-summary · ocean-depth · tourism-flow 카탈로그).
# 서울에만 올리면 화면은 새 값, 람다는 옛 값을 읽으며 조용히 어긋난다(air-state·ocean-depth 는 예외를 삼킨다) — 두 곳에 쓴다.
APP_DUAL_WRITE=("data/")

APP_MIGRATED=""   # app_resolve 가 채운다 — 1 이면 CloudFront 기본 동작이 서울 원본을 본다

# CloudFront 기본 동작이 **지금** 보는 원본으로 APP_BUCKET/APP_REGION 을 정한다.
# 왜: 전환(tools/migrate-app-origin-seoul.sh cloudfront)은 root 가 따로 한다. 그 전후 어느 때 배포해도 맞게 —
#     전환 전이면 오하이오, 뒤면 서울. 이 저장소는 여러 세션이 같이 쓰므로 '전환 뒤를 전제로 한 스크립트'가
#     전환 전에 돌면 아무도 안 읽는 버킷에 쓴다. 읽지 못하면 멈춘다(모르면 쓰지 않는다).
app_resolve() {
  local dist="${1:-E193CZEBLWEB56}" py=python dom
  command -v python3 >/dev/null && py=python3
  # ⚠️ PYTHONUTF8=1 — 배포 설정 Comment 의 '—' 를 aws CLI 가 cp949 콘솔로 찍다 죽는다(실측 2026-09-23).
  dom=$(PYTHONUTF8=1 PYTHONIOENCODING=utf-8 AWS_PROFILE="${AWS_PROFILE:-earthus-deploy}" aws cloudfront get-distribution-config --id "$dist" --output json \
    | "$py" -c '
import json, sys
c = json.load(sys.stdin)["DistributionConfig"]
oid = c["DefaultCacheBehavior"]["TargetOriginId"]
o = next(x for x in c["Origins"]["Items"] if x["Id"] == oid)
assert o.get("OriginPath") == "/app", "default origin path is not /app"
print(o["DomainName"])
') || { printf '⛔ CloudFront 기본 동작의 원본을 읽지 못했다 — 목적지를 모르면 쓰지 않는다.\n' >&2; return 1; }
  # "<bucket>.s3.<region>.amazonaws.com"
  local b="${dom%%.s3.*}" rest="${dom#*.s3.}"; local r="${rest%%.amazonaws.com}"
  [[ -n "$b" && -n "$r" && "$b" != "$dom" ]] || { printf '⛔ 원본 이름을 풀지 못했다: %s\n' "$dom" >&2; return 1; }
  APP_BUCKET="$b"; APP_REGION="$r"
  if [[ "$b" == "$APP_OHIO_BUCKET" ]]; then APP_MIGRATED=""; else APP_MIGRATED=1; fi
  printf 'PASS CloudFront 기본 동작 → s3://%s (%s)%s\n' "$APP_BUCKET" "$APP_REGION" "${APP_MIGRATED:+ · 서울 이사 뒤}"
}

# $1 = app/ 아래 경로 → "버킷 리전"
app_target() {
  local p="${1#/}" k
  [[ -n "$APP_BUCKET" ]] || { printf '⛔ app_target: app_resolve 를 먼저 불러야 한다
' >&2; return 1; }
  for k in "${APP_KEEP_OHIO[@]}"; do
    [[ "$p" == "$k"* ]] && { printf '%s %s\n' "$APP_OHIO_BUCKET" "$APP_OHIO_REGION"; return 0; }
  done
  printf '%s %s\n' "$APP_BUCKET" "$APP_REGION"
}

# $1 = app/ 아래 경로 → 오하이오에도 같이 써야 하면 참(서울이 주 목적지일 때만)
app_also_ohio() {
  local p="${1#/}" k
  [[ -n "$APP_MIGRATED" ]] || return 1          # 전환 전에는 주 목적지가 이미 오하이오다
  for k in "${APP_KEEP_OHIO[@]}"; do [[ "$p" == "$k"* ]] && return 1; done
  for k in "${APP_DUAL_WRITE[@]}"; do [[ "$p" == "$k"* ]] && return 0; done
  return 1
}

# 이사 뒤 목적지를 아직 고치지 않은 스크립트가 부른다 — 조용히 오하이오에 쓰고 PASS 를 내는 대신 멈춘다.
# 전환 전(기본 동작이 아직 오하이오)이면 그대로 지나간다 — 그때는 이 스크립트의 옛 목적지가 맞다.
app_unmigrated_stop() {
  app_resolve >/dev/null || exit 3
  [[ -n "$APP_MIGRATED" ]] || return 0
  printf '⛔ %s — 2026-09-23 앱 원본 서울 이사(aws/_shared/app-origin.sh) 뒤 목적지를 아직 고치지 않았다.\n' "${1:-이 스크립트}" >&2
  printf '   오하이오 app/ 에 올리면 올림·무효화가 PASS 여도 화면은 바뀌지 않는다. tools/deploy-v1.sh 처럼 app_target 을 쓰게 고친 뒤 실행할 것.\n' >&2
  exit 3
}
