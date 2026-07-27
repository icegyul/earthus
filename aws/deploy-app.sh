#!/usr/bin/env bash
# earthus — 프로토타입을 S3 에 올린다
#
#   ./deploy-app.sh
#
# 데이터(celestrak/)와 같은 버킷의 app/ 아래에 넣는다.
# 버킷이 us-east-2 라 REST 엔드포인트가 HTTPS 를 지원한다 → 폰에서 위치정보가 된다.
# (S3 "정적 웹사이트 호스팅" 엔드포인트는 HTTP 전용이라 쓰지 않는다)
set -euo pipefail

BUCKET="earthus-cache-kr"
REGION="us-east-2"
PREFIX="app"
SRC="$(cd "$(dirname "$0")/../prototype" && pwd)"
URL="https://${BUCKET}.s3.${REGION}.amazonaws.com/${PREFIX}/index.html"

echo "▸ 원본: ${SRC}"

# ⚠️ 올리면 안 되는 것
#    - .devcert/.devkey : 개발용 자체 서명 인증서와 개인키
#    - devserver.py     : 개발 서버, 배포본에 필요 없음
#    - supabase/schema.sql : DB 스키마. 비밀은 아니지만 테이블·RLS 정책·RPC 이름이
#                            그대로 드러난다. 배포본에 있을 이유가 없다.
#    - legal/README.md  : 미해결 법적 요건을 적어둔 내부 체크리스트.
#                         "위치기반서비스사업 신고 안 됨" 같은 내용이라 공개 금지.
#                         (legal/*.md 초안 본문은 앱이 화면에 띄우므로 올린다)
#    - config.local.js  : 지금은 비어 있지만 나중에 값이 들어간다.
#                         Supabase anon 키는 공개 전제라 괜찮고(RLS 로 보호),
#                         사업자 정보도 법적으로 공개 대상이다.
#                         그래도 "무엇이 공개되는지" 모르고 올라가는 일이 없도록
#                         아래 목록을 배포 때마다 눈으로 확인할 것.
# ⚠️ --delete 는 s3:DeleteObject 권한이 필요한데 earthus-deploy 에 없다.
#    권한이 생기기 전까지는 끈다. set -e 때문에 실패하면 스크립트가 통째로 멈춰
#    뒤의 Content-Type 교정까지 안 돌기 때문이다.
#    → 로컬에서 지운 파일이 S3 에 남는다. 권한 추가되면 --delete 를 되살릴 것.
aws s3 sync "$SRC" "s3://${BUCKET}/${PREFIX}/" \
  --region "$REGION" \
  --exclude '.devcert.pem' --exclude '.devkey.pem' \
  --exclude 'devserver.py' \
  --exclude '.DS_Store' --exclude '__pycache__/*' \
  --exclude 'supabase/*' \
  --exclude 'legal/README.md' \
  --cache-control 'public, max-age=60'

# sync 가 추측한 Content-Type 이 틀리면 모듈 로딩이 깨진다.
# 브라우저는 text/javascript 가 아닌 스크립트를 ES 모듈로 실행하지 않는다.
echo "▸ Content-Type 교정"
for f in $(cd "$SRC" && find . -name '*.js' | sed 's|^\./||'); do
  aws s3 cp "s3://${BUCKET}/${PREFIX}/${f}" "s3://${BUCKET}/${PREFIX}/${f}" \
    --region "$REGION" --metadata-directive REPLACE \
    --content-type 'text/javascript; charset=utf-8' \
    --cache-control 'public, max-age=60' >/dev/null
done

echo ""
echo "✅ 업로드 완료"
echo "   ${URL}"
echo ""
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$URL")
if [ "$CODE" = "200" ]; then
  echo "   공개 확인: HTTP 200 — 폰에서 위 주소로 접속하면 된다"
else
  echo "   ⚠️ HTTP ${CODE} — 아직 공개되지 않았다."
  echo "      버킷 정책에 app/* 를 추가해야 한다. aws/README.md 참고."
fi
