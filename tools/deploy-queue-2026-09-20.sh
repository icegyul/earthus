#!/usr/bin/env bash
# 2026-09-20 야간 작업 중 **PD 만 할 수 있는** 배포 — 나머지는 밤사이 이미 배포·확인했다.
#
#   bash tools/deploy-queue-2026-09-20.sh --list          # 단계 목록
#   bash tools/deploy-queue-2026-09-20.sh glacial-lake-us # 한 단계씩 (전부 한 번에 돌리는 모드는 일부러 없다)
#
# 이미 배포된 것(2026-09-20 새벽, 공개 주소에서 확인):
#   jma-warn · health(시각 파싱 수정 372fa3fa 포함) · cyclone-analog(인텔 v1) · distribution · kma-warn · world-alerts(CAP)
#   marine-grid(수온 인텔) · lab-events(지진 인텔) · v2 화면
#
# 여기 남은 것과 PD 인 이유
#   public-api      — 키 원장을 app/ → archive/ 로 **옮기는** 일은 사람이 한다(아래 순서). 옮긴 뒤에만 배포한다 —
#                     먼저 배포하면 새 코드가 archive/ 에서 키를 못 찾아 모든 키가 거절된다. 노출됐던 키는 폐기·재발급.
#   glacial-lake-us — **새 Lambda**. deploy-python.sh 가 IAM 역할을 새로 만든다.
#   intel-rollup    — **새 Lambda**(P2a 변화 창고). 같은 이유.
#   earthus-llm     — 서술 가드(P4). 지구와 대화 답이 더 자주 '자료 부족' 으로 바뀔 수 있어 PD 판단 뒤에 올린다.
set -euo pipefail
export PYTHONUTF8=1
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUCKET="earthus-cache-kr"
BUCKET_REGION="us-east-2"
FN_REGION="ap-northeast-2"
SITE="https://earthus.net"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

STEPS=(public-api glacial-lake-us intel-rollup earthus-llm)
if [ "${1:-}" = "--list" ] || [ -z "${1:-}" ]; then printf '%s\n' "${STEPS[@]}"; exit 0; fi
STEP="$1"

aws sts get-caller-identity --query Arn --output text >/dev/null 2>&1 \
  || { echo "❌ AWS 세션이 없다 — 먼저 'aws login'"; exit 1; }

invoke() {  # 스케줄을 기다리지 않고 한 번 돌린다
  # ⚠️ 예전에는 `invoke … >/dev/null && head …; echo` 였다. 마지막 echo 가 0 을 돌려줘서 **실행 실패가 성공으로 보였다.**
  #    그리고 뒤따르는 확인용 curl 이 죽으면 PD 는 엉뚱한 곳(무효화·권한)을 보게 된다. 실패는 실패라고 말한다.
  local payload="${2:-}"; [ -n "$payload" ] || payload='{}'
  if aws lambda invoke --function-name "$1" --region "$FN_REGION" --cli-read-timeout 600 --cli-binary-format raw-in-base64-out \
       --payload "$payload" "$TMP/$1.out.json" >/dev/null; then
    head -c 400 "$TMP/$1.out.json"; echo
    # Lambda 는 함수가 죽어도 StatusCode 200 을 준다 — 본문에 errorMessage 가 있으면 실패다.
    if grep -q '"errorMessage"' "$TMP/$1.out.json" 2>/dev/null; then
      echo "   ❌ $1 실행이 오류로 끝났다(위 본문) — 다음 확인은 건너뛴다"; return 1
    fi
  else
    echo "   ❌ $1 을 실행하지 못했다(권한·함수 없음·시간 초과)"; return 1
  fi
}
# 확인용 읽기 — 못 받아도 **스크립트를 죽이지 않는다**. 배포는 이미 끝났는데 확인 줄에서 죽으면
# PD 에게는 '배포 실패'로 읽힌다(실측: glof-alaska.json 은 산출물이 생기기 전까지 403 이다).
public_json() {
  curl -fsS --compressed -m 30 "$SITE$1" && return 0
  echo "   ⚠️ $SITE$1 을 아직 못 읽는다(HTTP 오류) — 산출물이 생기기 전이거나 CloudFront 가 옛 오류를 물고 있다."
  echo "      배포 자체가 실패한 것은 아니다. 몇 분 뒤 다시: curl -s -o /dev/null -w '%{http_code}\\n' $SITE$1"
  return 1
}
jqpy() { python -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

case "$STEP" in
  public-api)
    echo "════ 공개 날씨 API 키 원장 → 비공개(archive/) — 69e714da ════"
    # 옮기기는 이 스크립트가 하지 않는다(쓰기 경로 감사가 app/ 쓰기를 막는다 — 맞는 판정이다).
    # 사람이 할 3가지(옮기기·옛 객체 확인·무효화)는 docs/PD-DEPLOY-2026-09-20.md 에 명령까지 적어 두었다.
    if ! aws s3api head-object --bucket "$BUCKET" --key archive/public-api/keys.json --region "$BUCKET_REGION" >/dev/null 2>&1; then
      echo "❌ archive/public-api/keys.json 이 없다 — 키 원장을 먼저 옮긴다. 배포하지 않는다."
      echo "   어떻게: docs/PD-DEPLOY-2026-09-20.md §1 (옮기기 → 이 단계 다시 → 키 폐기·재발급)"; exit 1
    fi
    bash aws/deploy-python.sh public-weather-api
    echo "   확인: 아래가 403 또는 404 여야 한다(CloudFront 무효화 뒤)"
    curl -s -o /dev/null -w "   keys.json → %{http_code}\n" "$SITE/public-api/keys.json" || true
    echo "   ⚠️ 노출됐던 키는 폐기하고 새로 발급할 것 — python aws/public-weather-api/add_key.py (사람 일)"
    ;;
  glacial-lake-us)
    echo "════ 알래스카 주노 빙하호(신규 Lambda·IAM 역할 생성) — 545456f2 ════"
    bash aws/deploy-python.sh glacial-lake-us
    bash aws/configure-glacial-lake-us-schedule.sh
    # 확인이 실패해도 배포는 이미 끝났다 — 여기서 스크립트가 죽으면 '배포 실패'로 잘못 읽힌다.
    invoke glacial-lake-us || true
    public_json /events/glof-alaska.json | jqpy "('live', d.get('live'), 'observed', d.get('observed'), 'errors', d.get('errors'))" || true
    ;;
  intel-rollup)
    echo "════ 변화 창고(신규 Lambda·IAM 역할 생성) — P2a ════"
    bash aws/deploy-python.sh intel-rollup
    bash aws/configure-intel-rollup-schedule.sh
    invoke intel-rollup '{"dryRun":true}' || true
    echo "   확인: 다음 매시 :20 실행 뒤 archive/intel-change/index.json 의 층별 status (비공개 — CloudWatch 로그로 본다)"
    ;;
  earthus-llm)
    echo "════ 지구와 대화 서술 가드 — P4 ════"
    bash tools/deploy-llm.sh --package-only
    bash tools/deploy-llm.sh
    ;;
  *) echo "모르는 단계: $STEP"; printf '  %s\n' "${STEPS[@]}"; exit 1 ;;
esac
