#!/usr/bin/env bash
# EARTHUS V3 WONDER — STAGING 배포: build/staging → s3://earthus-cache-kr/app/wonder/next/  (PD 승인 2026-09-13)
#
#   bash scripts/deploy-staging.sh --dry-run     # 올릴 것/바뀔 것 목록만 (AWS 쓰기 0)
#   bash scripts/deploy-staging.sh               # 실제 업로드 (app/wonder/next/** 만)
#
# 규칙(DEPLOYMENT_MAP §2·§5, PD STAGING 지시):
#   · 대상 prefix 는 app/wonder/next/ 하나. 다른 어떤 키도 쓰지 않는다 — 아래 가드가 prefix 를 문자 그대로 검사한다.
#   · 삭제 없음(--delete 금지, rm 금지). AWS DELETE = 0.  CloudFront 설정·무효화 없음(첫 배포 객체는 캐시에 없다).
#   · production(app/wonder/live/, 별칭 3키) · app/v3/ · V1/V2 · legacy 경로 접근 금지.
#   · 캐시: staging 은 시험용이라 html/css/mjs/json no-cache, 그림 max-age=300. production 캐시 정책은 건드리지 않는다.
set -euo pipefail

if [[ -z "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" ]]; then
  if aws configure list-profiles 2>/dev/null | grep -qx 'earthus-deploy'; then export AWS_PROFILE=earthus-deploy; fi
fi
BUCKET="earthus-cache-kr"; REGION="us-east-2"; PREFIX="app/wonder/next"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/build/staging"
DRY=0; [[ "${1:-}" == "--dry-run" ]] && DRY=1

# ── 가드 ─────────────────────────────────────────────────────────────────────
[[ "$PREFIX" == "app/wonder/next" ]] || { echo "✗ prefix 가 app/wonder/next 가 아니다: $PREFIX" >&2; exit 9; }
case "$PREFIX" in *live*|*v3*|*Intelligence*|*v2*) echo "✗ 금지 prefix" >&2; exit 9;; esac
[[ -f "$SRC/BUILD.json" && -f "$SRC/apps/web/index.html" ]] || { echo "✗ build/staging 이 없다 — node scripts/build-staging.mjs 먼저" >&2; exit 2; }
for bad in docs tests scripts benchmarks package.json README.md; do [[ -e "$SRC/$bad" ]] && { echo "✗ 빌드에 $bad 가 있다" >&2; exit 3; }; done
find "$SRC" -name '*.ts' | grep -q . && { echo "✗ 빌드에 .ts 가 있다" >&2; exit 3; }
[[ -e "$SRC/content/pack-1.8/backgrounds" ]] && { echo "✗ 불합격 배경이 빌드에 있다" >&2; exit 3; }
COMMIT="$(python -c "import json;print(json.load(open('$SRC/BUILD.json'))['commit'])")"

echo "▸ 자격증명: $(aws sts get-caller-identity --query Arn --output text)"
echo "▸ 대상: s3://$BUCKET/$PREFIX/   (오직 이 prefix. 삭제 없음. production 없음)"
echo "▸ 빌드 커밋: $COMMIT"
echo "▸ 배포 전 prefix 상태:"
BEFORE_N=$(aws s3 ls "s3://$BUCKET/$PREFIX/" --region "$REGION" --recursive 2>/dev/null | wc -l | tr -d ' ')
echo "  app/wonder/next/ 객체 수 = $BEFORE_N"
echo "▸ production/legacy 키 참조 검사(이 스크립트 자체):"
grep -nE "app/wonder/live|app/v3|--delete|s3 rm|delete-object" "$0" | grep -v '^\s*#' | grep -vE "금지|가드|주석|echo|grep" && { echo "✗ 스크립트에 금지 경로/삭제 명령이 있다" >&2; exit 9; } || echo "  없음"

sync_group () {  # <include-glob> <content-type> <cache-control>
  local inc="$1" ct="$2" cc="$3"
  aws s3 sync "$SRC" "s3://$BUCKET/$PREFIX/" --region "$REGION" \
    --exclude '*' --include "$inc" --exclude '_index-base-next.html' --exclude 'BUILD.json' \
    --content-type "$ct" --cache-control "$cc" --no-progress $( [[ $DRY -eq 1 ]] && echo --dryrun )
}
echo "▸ 변경 목록 (dry-run=$DRY):"
UP=0
for spec in \
  '*.html|text/html; charset=utf-8|no-cache, max-age=0' \
  '*.mjs|text/javascript; charset=utf-8|no-cache, max-age=0' \
  '*.js|text/javascript; charset=utf-8|no-cache, max-age=0' \
  '*.css|text/css; charset=utf-8|no-cache, max-age=0' \
  '*.json|application/json; charset=utf-8|no-cache, max-age=0' \
  '*.svg|image/svg+xml|public, max-age=300' \
  '*.webp|image/webp|public, max-age=300' \
  '*.txt|text/plain; charset=utf-8|public, max-age=300'; do
  IFS='|' read -r inc ct cc <<< "$spec"
  out="$(sync_group "$inc" "$ct" "$cc" 2>&1 | grep -E '^(\(dryrun\) )?upload:' || true)"
  n=$(printf '%s' "$out" | grep -c 'upload:' || true); UP=$((UP + n))
  [[ -n "$out" ]] && printf '%s\n' "$out" | sed 's#^#  #' | head -400
done
# 디렉터리 주소 키: …/apps/web/ (원본 index), …/next/ 와 …/next (base href 사본) — 전부 prefix 안
for key in "$PREFIX/apps/web/" ; do
  if [[ $DRY -eq 1 ]]; then echo "  (dryrun) put: s3://$BUCKET/$key  ← apps/web/index.html"; else
    aws s3api put-object --bucket "$BUCKET" --region "$REGION" --key "$key" --body "$SRC/apps/web/index.html" --content-type 'text/html; charset=utf-8' --cache-control 'no-cache, max-age=0' >/dev/null && echo "  put: s3://$BUCKET/$key"; fi
  UP=$((UP + 1))
done
for key in "$PREFIX/" "$PREFIX" "$PREFIX/index.html"; do
  if [[ $DRY -eq 1 ]]; then echo "  (dryrun) put: s3://$BUCKET/$key  ← _index-base-next.html"; else
    aws s3api put-object --bucket "$BUCKET" --region "$REGION" --key "$key" --body "$SRC/_index-base-next.html" --content-type 'text/html; charset=utf-8' --cache-control 'no-cache, max-age=0' >/dev/null && echo "  put: s3://$BUCKET/$key"; fi
  UP=$((UP + 1))
done
if [[ $DRY -eq 0 ]]; then
  aws s3api put-object --bucket "$BUCKET" --region "$REGION" --key "$PREFIX/BUILD.json" --body "$SRC/BUILD.json" --content-type 'application/json; charset=utf-8' --cache-control 'no-cache, max-age=0' >/dev/null && echo "  put: s3://$BUCKET/$PREFIX/BUILD.json"; UP=$((UP + 1))
fi
AFTER_N=$(aws s3 ls "s3://$BUCKET/$PREFIX/" --region "$REGION" --recursive 2>/dev/null | wc -l | tr -d ' ')
echo "▸ 업로드 $UP 건 (dry-run=$DRY) · 삭제 0 · prefix 객체 수 $BEFORE_N → $AFTER_N"
echo "▸ 확인: production 키 미접촉 — app/wonder 별칭 3키:"
aws s3 ls "s3://$BUCKET/app/wonder" --region "$REGION" | grep -E '^\S+ \S+ +[0-9]+ (wonder|index\.html)?$' | sed 's#^#  #' || true
aws s3 ls "s3://$BUCKET/app/wonder/" --region "$REGION" | grep -vE 'PRE (next|live)/' | sed 's#^#  #' || true
echo
echo "STAGING URL: https://earthus.net/wonder/next/apps/web/"
echo "DEVICE URL : https://earthus.net/wonder/next/apps/web/?qa=1&device=1"
