#!/usr/bin/env bash
# EARTHUS v3 — 종이 지구(prototype/v3-paper)를 earthus.net/v3 로 올린다. 예전 v3-kids 페이지를 대체한다.
#
#   ./aws/deploy-v3-paper.sh
#
# 범위: app/v3 만. app/vendor(three.js·satellite.js)와 app/v2-three/quakes(지진 25년)는 이 페이지가
# 상대경로로 읽으므로 먼저 올라가 있어야 한다. 124종 캐릭터 이미지(pack124/, 194MB)는 git 에 없고
# 파일시스템에서 그대로 sync 된다 — 처음 한 번은 오래 걸린다.
set -euo pipefail

if [[ -z "${AWS_PROFILE:-}" && -z "${AWS_ACCESS_KEY_ID:-}" && -z "${AWS_ROLE_ARN:-}" ]]; then
  if aws configure list-profiles 2>/dev/null | grep -qx 'earthus-deploy'; then export AWS_PROFILE=earthus-deploy; fi
fi

BUCKET="${EARTHUS_BUCKET:-earthus-cache-kr}"
REGION="${EARTHUS_REGION:-us-east-2}"
PREFIX="${EARTHUS_APP_PREFIX:-app}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/prototype/v3-paper"

[[ -f "$SRC/index.html" ]] || { echo "missing $SRC/index.html" >&2; exit 2; }
[[ -d "$SRC/pack124/characters" ]] || { echo "missing $SRC/pack124/characters — 124종 이미지가 없다" >&2; exit 2; }

echo "▸ 자격증명: $(aws sts get-caller-identity --query Arn --output text)"
echo "▸ 전제 확인: 이 페이지가 상대경로로 읽는 자산"
missing=0
for key in "${PREFIX}/vendor/satellite-6.0.2.min.js" "${PREFIX}/v2-three/quakes/quakes.bin" "${PREFIX}/v2-three/quakes/quakes.json" "${PREFIX}/v2-three/quakes/plates.json"; do
  if aws s3 ls "s3://${BUCKET}/${key}" --region "$REGION" >/dev/null 2>&1; then echo "  있음  ${key}"; else echo "  없음  ${key}  ← 지진·위성이 켜지지 않는다" >&2; missing=1; fi
done
[[ $missing -eq 0 ]] || { echo "▸ 먼저 ./aws/deploy-app.sh 와 tools/deploy-v2-three.sh 로 올린 뒤 다시 실행할 것." >&2; exit 3; }

echo "▸ 올리는 범위: ${PREFIX}/v3 (검토 도구·인계 문서·원본 ZIP 은 제외)"
# earthus-deploy 에는 s3:DeleteObject 가 없다 — --delete 를 쓰면 여기서 죽는다(실측 2026-09-05). 옛 v3-kids 파일은 남는다.
# 2026-09-07: assets 의 PNG 는 제작 원본이다 — 배포는 tools/v3-webp.py 가 만든 .webp 만 올린다(첫 접속 34MB→4MB).
python "$ROOT/tools/v3-webp.py" || { echo 'webp 변환 실패' >&2; exit 4; }
aws s3 sync "$SRC" "s3://${BUCKET}/${PREFIX}/v3/" --region "$REGION" \
  --exclude '.DS_Store' --exclude '__pycache__/*' --exclude 'tools/*' --exclude 'handoff/*' --exclude 'verify-*.mjs' \
  --exclude 'build-package.py' --exclude 'preview-server.mjs' --exclude 'README.md' --exclude '*.zip' \
  --exclude 'assets/*.png' --exclude 'assets/*/*.png' \
  --cache-control 'public, max-age=60'

echo "▸ Content-Type 교정"
while IFS= read -r f; do
  rel="${f#$SRC/}"
  case "$rel" in tools/*|handoff/*|verify-*.mjs|build-package.py|preview-server.mjs|README.md) continue ;; esac
  case "$rel" in
    *.html) ct='text/html; charset=utf-8' ;;
    *.js|*.mjs) ct='text/javascript; charset=utf-8' ;;
    *.json) ct='application/json; charset=utf-8' ;;
    *.css)  ct='text/css; charset=utf-8' ;;
    *)      continue ;;
  esac
  aws s3 cp "s3://${BUCKET}/${PREFIX}/v3/${rel}" "s3://${BUCKET}/${PREFIX}/v3/${rel}" --region "$REGION" \
    --metadata-directive REPLACE --content-type "$ct" --cache-control 'public, max-age=60' >/dev/null
done < <(find "$SRC" -type f \( -name '*.html' -o -name '*.js' -o -name '*.mjs' -o -name '*.json' -o -name '*.css' \) | sort)

echo "▸ 대용량 JSON·수심 바이너리 gzip 업로드 (CloudFront 는 10MB 초과·binary 를 압축하지 않는다 — 2026-09-07 실측)"
# 같은 키에 Content-Encoding: gzip 으로 다시 올린다. 브라우저 fetch 가 알아서 푼다.
# sync 가 다음 배포에 원본을 다시 올려도 이 단계가 또 덮으므로 순서만 지키면 된다.
TMPGZ="$(mktemp -d)"
while IFS= read -r f; do
  rel="${f#$SRC/}"
  case "$rel" in *.json) ct='application/json; charset=utf-8' ;; *.i16) ct='application/octet-stream' ;; *) continue ;; esac
  gzip -9 -c "$f" > "$TMPGZ/blob"
  aws s3 cp "$TMPGZ/blob" "s3://${BUCKET}/${PREFIX}/v3/${rel}" --region "$REGION" \
    --content-encoding gzip --content-type "$ct" --cache-control 'public, max-age=60' --only-show-errors
  printf '  gzip  %s  %s → %s KB\n' "$rel" "$(( $(stat -c %s "$f") / 1024 ))" "$(( $(stat -c %s "$TMPGZ/blob") / 1024 ))"
done < <(find "$SRC/data" -type f \( -name '*.json' -size +900k -o -name '*.i16' \) | sort)
rm -rf "$TMPGZ"

echo "▸ 디렉터리 주소용 사본  app/v3  ·  app/v3/"
for key in "${PREFIX}/v3" "${PREFIX}/v3/"; do
  aws s3api put-object --bucket "$BUCKET" --region "$REGION" --key "$key" --body "$SRC/index.html" \
    --content-type 'text/html; charset=utf-8' --cache-control 'public, max-age=60' >/dev/null
  echo "  올림  ${key}"
done

# /wonder 별칭 — earth-switch.js 메뉴가 거는 주소. <base href="/v3/"> 한 줄만 얹은 사본.
echo "▸ /wonder 별칭"
WONDER_TMP="$ROOT/.wonder-alias.tmp.html"
sed '/^<head>$/a\
<base href="/v3/">' "$SRC/index.html" > "$WONDER_TMP"
grep -qF '<base href="/v3/">' "$WONDER_TMP" || { echo "wonder alias injection failed" >&2; exit 4; }
for key in "${PREFIX}/wonder" "${PREFIX}/wonder/" "${PREFIX}/wonder/index.html"; do
  aws s3api put-object --bucket "$BUCKET" --region "$REGION" --key "$key" --body "$WONDER_TMP" \
    --content-type 'text/html; charset=utf-8' --cache-control 'public, max-age=60' >/dev/null
  echo "  올림  ${key}"
done
rm -f "$WONDER_TMP"

CF_ID="${EARTHUS_CLOUDFRONT_DISTRIBUTION_ID:-}"
if [[ -z "$CF_ID" ]]; then
  CF_ID="$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Aliases.Items, 'earthus.net')].Id | [0]" --output text 2>/dev/null || true)"
  [[ "$CF_ID" == "None" ]] && CF_ID=""
fi
if [[ -n "$CF_ID" ]]; then
  # MSYS 경로 변환 방어 — deploy-v3-kids.sh 와 같은 실측 이유.
  INV="$(MSYS_NO_PATHCONV=1 aws cloudfront create-invalidation --distribution-id "$CF_ID" --paths '/v3/*' '/v3' '/wonder' '/wonder/' '/wonder/index.html' --query 'Invalidation.Id' --output text)"
  echo "▸ CloudFront 무효화 요청함  배포 $CF_ID  무효화 $INV"
else
  echo "▸ earthus.net 별칭을 가진 CloudFront 배포를 못 찾아 무효화하지 않았다." >&2
fi
echo; echo "주소:  https://earthus.net/v3/  (메뉴 별칭: https://earthus.net/wonder/)"
