#!/usr/bin/env bash
# 국립해양조사원 연안 침수 범위 — Lambda khoa-coast 를 10곳씩 나눠 불러 S3 에 채운다.
#
# 왜 나누나: 폴리곤 응답이 크다(해운대 199면 ≈ 6MB). 70곳을 한 번에 받으면 Lambda 시간을 넘긴다.
# 왜 여기서 하나: 키는 Lambda 환경변수에만 있다. 이 기계에는 키가 없고, 두지 않는다.
#
# 전제: 공공데이터포털에서 데이터셋 15142492(연안 침수 정보 조회)에 활용신청이 승인돼 있어야 한다.
#      미승인이면 Lambda 로그에 "HTTP Error 403: Forbidden" 이 찍히고 districts 0 으로 끝난다(실측 2026-09-02).
#
# 사용: bash tools/collect-khoa-flood.sh
set -euo pipefail
export AWS_PROFILE="${EARTHUS_AWS_PROFILE:-earthus-deploy}" PYTHONUTF8=1 MSYS_NO_PATHCONV=1
REGION=ap-northeast-2
FN=khoa-coast
# ⚠️ aws CLI 는 윈도우 네이티브라 git-bash 경로(/d/... , /tmp/...)를 못 읽는다.
#    셸은 유닉스 경로로 읽고, CLI 에는 cygpath 로 바꾼 윈도우 경로를 준다.
OUTDIR_U="$(cd "$(dirname "$0")/.." && pwd)/.tmp"
mkdir -p "$OUTDIR_U"
OUT="$OUTDIR_U/khoa-flood-batch.json"
OUT_WIN="$(cygpath -w "$OUT" 2>/dev/null || echo "$OUT")"

# KHOA 미리보기 화면(SV_AP_01_010)이 서비스하는 연안 시군구 70곳 — 핸들러의 FLOOD_SGG 와 같은 목록
CODES=(26110 26140 26170 26200 26230 26290 26350 26380 26440 26500 26710
       28110 28140 28185 28200 28260 28710 28720
       31110 31140 31170 31200 31710
       41220 41273 41390 41570 41590
       44180 44200 44210 44270 44770 44800 44825
       46110 46130 46150 46230 46770 46780 46800 46810 46820 46830 46840 46860 46870 46890 46900 46910
       47130
       48121 48123 48125 48127 48129 48220 48240 48310 48820 48840 48850
       50110 50130
       52130 52210 52790 52800)

total=${#CODES[@]}
for ((i = 0; i < total; i += 10)); do
  batch=("${CODES[@]:i:10}")
  list=$(printf '"%s",' "${batch[@]}"); list="[${list%,}]"
  echo "▸ 배치 $((i / 10 + 1)): ${batch[*]}"
  aws lambda invoke --region "$REGION" --function-name "$FN" \
    --cli-binary-format raw-in-base64-out --cli-read-timeout 900 \
    --payload "{\"khoaFlood\":true,\"codes\":${list}}" "$OUT_WIN" \
    --query "[StatusCode,FunctionError]" --output text
  cat "$OUT" 2>/dev/null || echo "(결과 파일 없음)"; echo
done

echo "▸ 공개 확인"
curl -s -o /dev/null -w "flood-index.json → %{http_code} %{size_download}\n" \
  "https://earthus-cache-kr.s3.us-east-2.amazonaws.com/ocean/khoa/flood-index.json"
