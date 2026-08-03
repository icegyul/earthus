#!/usr/bin/env bash
# earthus — ecmwf-ingest 전용 배포 (GRIB2 해독 라이브러리 포함)
#
#   ./deploy-ecmwf.sh
#
# 왜 deploy-python.sh 로 안 되나
#   ECMWF GRIB2 는 **CCSDS/AEC 압축**(데이터표현 템플릿 5.42)이다 — 실측으로 확인했다.
#   순수 파이썬으로는 못 풀고 eccodes(C 라이브러리)가 필요하다.
#   그런데 로컬 pip 이 파이썬 3.9 라, 3.12 전용 최신 휠을 Requires-Python 으로 거부한다.
#   그래서 여기서는 **필요한 휠을 URL 로 직접 받아 푼다.**
#
# ⚠️ 플랫폼 태그를 정확히 고를 것 — 두 번 틀렸던 자리다.
#   ① `manylinux2014`(=manylinux_2_17)로 찾으면 eccodes 바이너리 휠을 **못 본다.**
#      eccodes 는 `manylinux_2_28` 로만 낸다. 그걸 놓치면 파이썬 바인딩만 깔려서
#      "Cannot find the ecCodes library" → 그 다음엔 "No module named 'eccodes._eccodes'"
#      로 죽는다. (둘 다 실제로 겪었다)
#   ② 파일명에 `manylinux_2_28` 이 들어간 **aarch64** 휠이 섞여 있다.
#      Lambda 는 x86_64 다. 이름에 x86_64 가 있는지 반드시 확인할 것.
#
# ⚠️ ecmwflibs 를 쓰지 말 것.
#   같은 바이너리를 얻으려고 ecmwflibs 휠을 쓰면 해제 303MB 라 한도(250MB)를 넘고,
#   지도작도용(libproj 84MB·harfbuzz 45MB·Magics 70MB)을 손으로 걷어내야 한다.
#   eccodes 바이너리 휠은 처음부터 필요한 것만 들어 있다. 실측 해제 104MB.
set -euo pipefail

FN="ecmwf-ingest"
REGION="$(aws configure get region)"
BUCKET="earthus-cache-kr"
BUCKET_REGION="us-east-2"
PYVER="3.12"
ROLE="earthus-lambda-${FN}"
DIR="$(cd "$(dirname "$0")" && pwd)/${FN}"

[ -d "$DIR" ] || { echo "❌ ${DIR} 없음"; exit 1; }
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${ROLE}"
echo "▸ 함수: ${FN}   리전: ${REGION}"

# ── 1. 실행 역할 ─────────────────────────────────────────────
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  echo "▸ 역할 있음: ${ROLE}"
else
  echo "▸ 역할 생성: ${ROLE}"
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  aws iam put-role-policy --role-name "$ROLE" --policy-name cache-bucket \
    --policy-document "{
      \"Version\":\"2012-10-17\",
      \"Statement\":[{
        \"Effect\":\"Allow\",
        \"Action\":[\"s3:GetObject\",\"s3:PutObject\"],
        \"Resource\":\"arn:aws:s3:::${BUCKET}/*\"
      }]
    }"
  echo "▸ 역할 전파 대기 (10초)"
  sleep 10
fi

# ── 2. 패키징 ────────────────────────────────────────────────
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "▸ 리눅스 x86_64 휠 내려받는 중"
python3 - "$TMP" <<'PY'
import io, json, sys, urllib.request, zipfile
tmp = sys.argv[1]

def grab(pkg, ver, must):
    d = json.load(urllib.request.urlopen(
        f'https://pypi.org/pypi/{pkg}/{ver}/json', timeout=60))
    # ⚠️ aarch64/arm64 를 반드시 걸러낸다. 파일명에 manylinux_2_28 이 있어도
    #    아키텍처가 다르면 Lambda(x86_64)에서 import 가 통째로 실패한다.
    urls = [f['url'] for f in d['urls']
            if all(p in f['filename'] for p in must)
            and 'aarch64' not in f['filename'] and 'arm64' not in f['filename']]
    if not urls:
        raise SystemExit(f'❌ {pkg} {ver}: 조건에 맞는 휠 없음 ({must})')
    print('  ·', urls[0].split('/')[-1])
    zipfile.ZipFile(io.BytesIO(
        urllib.request.urlopen(urls[0], timeout=300).read())).extractall(tmp)

# eccodes 바이너리 휠 — _eccodes 확장모듈과 eccodes.libs/ 가 함께 들어 있다
grab('eccodes',   '2.42.0', ['cp312', 'manylinux_2_28', 'x86_64'])
grab('numpy',     '2.3.2',  ['cp312', 'manylinux', 'x86_64'])
grab('cffi',      '1.17.1', ['cp312', 'manylinux', 'x86_64'])
grab('attrs',     '25.3.0', ['py3-none'])
grab('pycparser', '2.22',   ['py3-none'])
grab('findlibs',  '0.1.2',  ['py3-none'])
PY

cp "$DIR"/handler.py "$TMP"/
(cd "$TMP" && zip -qr /tmp/${FN}.zip .)
echo "▸ 패키지: 해제 $(du -sh "$TMP" | cut -f1) / 압축 $(du -h /tmp/${FN}.zip | cut -f1)   (한도 250MB / 50MB)"

# ── 3. 함수 생성 또는 갱신 ───────────────────────────────────
if aws lambda get-function --function-name "$FN" >/dev/null 2>&1; then
  echo "▸ 코드 갱신"
  aws lambda update-function-code --function-name "$FN" \
    --zip-file "fileb:///tmp/${FN}.zip" --query 'LastModified' --output text
  aws lambda wait function-updated --function-name "$FN" 2>/dev/null || sleep 8
else
  echo "▸ 함수 생성"
  aws lambda create-function --function-name "$FN" \
    --runtime "python${PYVER}" --role "$ROLE_ARN" --handler handler.handler \
    --zip-file "fileb:///tmp/${FN}.zip" \
    --timeout 600 --memory-size 1024 \
    --environment "Variables={CACHE_BUCKET=${BUCKET},CACHE_REGION=${BUCKET_REGION}}" \
    --query 'FunctionArn' --output text
fi
rm -f /tmp/${FN}.zip

echo ""
echo "✅ 배포 완료 — 실행해보기:"
echo "   aws lambda invoke --function-name ${FN} --cli-read-timeout 600 /tmp/out.json && cat /tmp/out.json"
