#!/usr/bin/env bash
# earthus.net/api/* → earthus-llm Lambda 배선 (CloudFront OAC).
# 멱등하다 — 이미 되어 있으면 건드리지 않는다.
#
# 왜 공개 함수 URL 을 안 쓰는가:
#   함수 URL 을 공개로 열면 인터넷 누구나 우리 제미니 할당량으로 질문할 수 있다.
#   그래서 URL 은 AWS_IAM 으로 잠그고, CloudFront 만 SigV4 로 서명해 부르게 한다.
#   브라우저는 같은 오리진(earthus.net)을 부르므로 CORS 도 사라진다.
#
# ⚠️ 브라우저가 지켜야 하는 것 (2026-09-03 실측으로 확인):
#   POST 본문이 있으면 **보내는 바이트 그대로**의 SHA-256 을
#   x-amz-content-sha256 헤더에 담아야 한다. Lambda 는 unsigned payload 를 받지 않는다.
#   해시가 실제 전송 바이트와 1비트라도 다르면 403 InvalidSignatureException 이다.
#   (AWS 문서: private-content-restricting-access-to-lambda)
#
# ⚠️ 권한은 **두 개** 다 필요하다. InvokeFunctionUrl 하나만 주면
#   서명은 통과하는데 AccessDeniedException 이 난다. 하루를 여기서 잃기 쉽다.
set -euo pipefail
export MSYS_NO_PATHCONV=1 PYTHONUTF8=1 PYTHONIOENCODING=utf-8

FN="earthus-llm"
REGION="ap-northeast-2"
DIST="E193CZEBLWEB56"
ACCOUNT="294951922100"
DIST_ARN="arn:aws:cloudfront::${ACCOUNT}:distribution/${DIST}"
OAC_NAME="earthus-llm-oac"
ORIGIN_ID="lambda-llm"
PATTERN="/api/*"
export AWS_PROFILE="${AWS_PROFILE:-earthus-deploy}"

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
w() { cygpath -w "$1" 2>/dev/null || echo "$1"; }

echo "== 1/4 함수 URL 을 AWS_IAM 으로 =="
aws lambda update-function-url-config --function-name "$FN" --region "$REGION" \
  --auth-type AWS_IAM --query 'AuthType' --output text
aws lambda remove-permission --function-name "$FN" --region "$REGION" \
  --statement-id public-url >/dev/null 2>&1 && echo "   공개 호출 권한 제거" || true

echo "== 2/4 CloudFront 에 호출 권한 (둘 다 필요) =="
for pair in "cloudfront-oac:lambda:InvokeFunctionUrl" "cloudfront-oac-invoke:lambda:InvokeFunction"; do
  sid="${pair%%:*}"; action="${pair#*:}"
  if aws lambda add-permission --function-name "$FN" --region "$REGION" \
      --statement-id "$sid" --action "$action" \
      --principal cloudfront.amazonaws.com --source-arn "$DIST_ARN" \
      >/dev/null 2>&1; then
    echo "   추가: $action"
  else
    echo "   이미 있음: $action"
  fi
done

echo "== 3/4 OAC =="
OAC_ID="$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='${OAC_NAME}'].Id | [0]" --output text)"
if [[ -z "$OAC_ID" || "$OAC_ID" == "None" ]]; then
  cat > "$TMP/oac.json" <<EOF
{"Name":"${OAC_NAME}","Description":"EARTHUS LLM proxy - Lambda function URL signed by CloudFront","SigningProtocol":"sigv4","SigningBehavior":"always","OriginAccessControlOriginType":"lambda"}
EOF
  OAC_ID="$(aws cloudfront create-origin-access-control \
    --origin-access-control-config "file://$(w "$TMP/oac.json")" \
    --query 'OriginAccessControl.Id' --output text)"
  echo "   생성: $OAC_ID"
else
  echo "   이미 있음: $OAC_ID"
fi

echo "== 4/4 배포판에 오리진 + ${PATTERN} 동작 =="
LAMBDA_HOST="$(aws lambda get-function-url-config --function-name "$FN" --region "$REGION" \
  --query 'FunctionUrl' --output text | sed -e 's#^https://##' -e 's#/$##')"
aws cloudfront get-distribution-config --id "$DIST" --output json > "$TMP/cur.json"

python - "$(w "$TMP/cur.json")" "$(w "$TMP/new.json")" "$LAMBDA_HOST" "$OAC_ID" "$ORIGIN_ID" "$PATTERN" <<'PY'
import json, io, sys
cur_p, out_p, host, oac, oid, pattern = sys.argv[1:7]
d = json.load(io.open(cur_p, encoding='utf-8'))
c = d['DistributionConfig']
changed = False
if not any(o['Id'] == oid for o in c['Origins']['Items']):
    c['Origins']['Items'].append({
        'Id': oid, 'DomainName': host, 'OriginPath': '',
        'CustomHeaders': {'Quantity': 0},
        'CustomOriginConfig': {
            'HTTPPort': 80, 'HTTPSPort': 443, 'OriginProtocolPolicy': 'https-only',
            'OriginSslProtocols': {'Quantity': 1, 'Items': ['TLSv1.2']},
            'OriginReadTimeout': 60, 'OriginKeepaliveTimeout': 5},
        'ConnectionAttempts': 3, 'ConnectionTimeout': 10,
        'OriginShield': {'Enabled': False}, 'OriginAccessControlId': oac})
    c['Origins']['Quantity'] = len(c['Origins']['Items'])
    changed = True
cb = c.setdefault('CacheBehaviors', {'Quantity': 0, 'Items': []})
cb.setdefault('Items', [])
if not any(b['PathPattern'] == pattern for b in cb['Items']):
    cb['Items'].append({
        'PathPattern': pattern, 'TargetOriginId': oid,
        'ViewerProtocolPolicy': 'redirect-to-https',
        'AllowedMethods': {'Quantity': 7,
            'Items': ['GET','HEAD','POST','PUT','PATCH','OPTIONS','DELETE'],
            'CachedMethods': {'Quantity': 2, 'Items': ['GET','HEAD']}},
        'Compress': True,
        # CachingDisabled / AllViewerExceptHostHeader (AWS 관리형).
        # Host 를 넘기면 서명이 깨지므로 반드시 ExceptHost 쪽이어야 한다.
        'CachePolicyId': '4135ea2d-6df8-44a3-9df3-4b5a84be39ad',
        'OriginRequestPolicyId': 'b689b0a8-53d0-40ab-baf2-68738e2966ac',
        'SmoothStreaming': False, 'FieldLevelEncryptionId': '',
        'LambdaFunctionAssociations': {'Quantity': 0},
        'FunctionAssociations': {'Quantity': 0},
        'TrustedSigners': {'Enabled': False, 'Quantity': 0},
        'TrustedKeyGroups': {'Enabled': False, 'Quantity': 0}})
    cb['Quantity'] = len(cb['Items'])
    changed = True
# CLI 가 cp949 로 읽다 죽는다 — 순수 ASCII 로 쓴다 (값은 \uXXXX 로 보존)
json.dump(c, io.open(out_p, 'w', encoding='utf-8'), ensure_ascii=True)
io.open(out_p + '.etag', 'w', encoding='utf-8').write(d['ETag'])
io.open(out_p + '.changed', 'w', encoding='utf-8').write('1' if changed else '0')
print('   변경 필요' if changed else '   이미 배선됨')
PY

if [[ "$(cat "$TMP/new.json.changed")" == "1" ]]; then
  aws cloudfront update-distribution --id "$DIST" \
    --distribution-config "file://$(w "$TMP/new.json")" \
    --if-match "$(cat "$TMP/new.json.etag")" \
    --query 'Distribution.Status' --output text
  echo "   전파에 5~10분 (aws cloudfront get-distribution --id $DIST 로 Deployed 확인)"
fi

echo
echo "완료 — https://earthus.net/api/ask"
echo "  호출 시 x-amz-content-sha256 헤더에 본문 SHA-256 을 반드시 담을 것"
