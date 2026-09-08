#!/usr/bin/env bash
# earthus — 걸러진 공개 빌드를 S3 에 올린다
#
#   ./deploy-app.sh
#
# 데이터(celestrak/)와 같은 버킷의 app/ 아래에 넣는다.
# 버킷이 us-east-2 라 REST 엔드포인트가 HTTPS 를 지원한다 → 폰에서 위치정보가 된다.
# (S3 "정적 웹사이트 호스팅" 엔드포인트는 HTTP 전용이라 쓰지 않는다)
#
# ⚠️⚠️ INTEGRATION-3 §0 — **작업 트리를 직접 올리지 않는다.**
#    예전에는 prototype/ 을 통째로 sync 하면서 --exclude 를 몇 줄 붙여 막았다.
#    그건 *아는* 구멍만 막는 방식이라 실제로 계속 샜다: supabase/ 는 제외했지만
#    prototype/v2-deploy/engine-v11/postgres/*.sql 은 그대로 올라갔고,
#    저장소 안쪽 README.md 들도 마찬가지였다.
#    이제 순서가 이렇다:
#
#        작업 트리 → aws/build-public.py(명시적 거름망) → build/public-app/ → S3
#
#    거름망을 빠져나간 비공개 파일이 하나라도 있으면 빌드가 **멈추고** 배포도 멈춘다.
#    규칙표는 aws/_shared/public_build.py 의 DENY_RULES 한 곳에 있다.
set -euo pipefail

BUCKET="earthus-cache-kr"
REGION="us-east-2"
PREFIX="app"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${REPO}/build/public-app"
URL="https://${BUCKET}.s3.${REGION}.amazonaws.com/${PREFIX}/index.html"

PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY=python

echo "▸ 공개 빌드"
"$PY" "${REPO}/aws/build-public.py"

echo "▸ 원본: ${SRC}"
[ -f "${SRC}/index.html" ] || { echo "❌ 빌드 결과가 없다 — ${SRC}/index.html"; exit 1; }

# ⚠️ --delete 는 s3:DeleteObject 권한이 필요한데 earthus-deploy 에 없다.
#    권한이 생기기 전까지는 끈다. set -e 때문에 실패하면 스크립트가 통째로 멈춰
#    뒤의 Content-Type 교정까지 안 돌기 때문이다.
#    → 로컬에서 지운 파일이 S3 에 남는다. 권한 추가되면 --delete 를 되살릴 것.
#    ⚠️⚠️ 그래서 **예전에 이미 올라간 파일은 이 변경으로 사라지지 않는다.**
#       거름망은 앞으로 올라갈 것을 막을 뿐이다. 이미 공개된 객체는 따로 지워야 한다
#       (docs/earthus-v2/INTEGRATION-3-HANDOFF.md 인계 D).
#
# --exclude 는 일부러 하나도 쓰지 않는다. 걸러내기는 빌드가 이미 끝냈고,
# 여기에 예외를 다시 적기 시작하면 규칙이 두 곳으로 갈라진다.
aws s3 sync "$SRC" "s3://${BUCKET}/${PREFIX}/" \
  --region "$REGION" \
  --cache-control 'public, max-age=60'

# sync 가 추측한 Content-Type 이 틀리면 모듈 로딩이 깨진다.
# 브라우저는 text/javascript 가 아닌 스크립트를 ES 모듈로 실행하지 않는다.
# ⚠️ 걸러진 트리를 훑기 때문에 목록을 따로 맞출 필요가 없다 — 여기 있는 것은 전부 올라갔다.
#    (예전에는 이 목록과 위 --exclude 가 어긋나면 s3 cp 가 404 로 죽고, set -e 때문에
#     뒤의 sw.js no-cache 교정이 실행되지 않아 서비스워커가 캐시된 채로 나갔다.)
echo "▸ Content-Type 교정"
for f in $(cd "$SRC" && find . -name '*.js' | sed 's|^\./||'); do
  aws s3 cp "s3://${BUCKET}/${PREFIX}/${f}" "s3://${BUCKET}/${PREFIX}/${f}" \
    --region "$REGION" --metadata-directive REPLACE \
    --content-type 'text/javascript; charset=utf-8' \
    --cache-control 'public, max-age=60' >/dev/null
done

# ⚠️⚠️ **sw.js 는 예외다.** 위 루프가 모든 .js 에 max-age=60 을 걸어 버리는데,
#    서비스워커가 캐시되면 **고친 앱이 사용자에게 안 간다** — 옛 sw 가 옛 파일을
#    계속 내어 준다. 감사에서 운영 sw.js 가 max-age=300 으로 나가는 것이 확인됐다.
#    반드시 마지막에 no-cache 로 덮어쓴다.
aws s3 cp "s3://${BUCKET}/${PREFIX}/sw.js" "s3://${BUCKET}/${PREFIX}/sw.js" \
  --region "$REGION" --metadata-directive REPLACE \
  --content-type 'text/javascript; charset=utf-8' \
  --cache-control 'no-cache' >/dev/null && echo "▸ sw.js — no-cache 로 교정"

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
