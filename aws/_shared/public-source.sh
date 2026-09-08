#!/usr/bin/env bash
# earthus — 공개 배포 원본은 한 곳뿐이다 (INTEGRATION-4 §4)
#
#   source "<repo>/aws/_shared/public-source.sh"
#   PUBLIC_ROOT="$(public_source_root)"     # build/public-app (없으면 만든다)
#   f="$(public_file js/main.js)"           # 절대경로. 거름망이 막은 파일이면 실패한다
#   d="$(public_dir v3-paper)"              # 디렉터리도 마찬가지
#
# ⚠️⚠️ 왜 이 파일이 있나
#   배포 스크립트가 열세 개였고 **저마다 다른 공개 경계**를 갖고 있었다.
#   실제로 그래서 샜다: `aws/deploy-v3-paper.sh` 는 tools/·handoff/·원본 PNG 를
#   조심스럽게 제외하는데, 같은 트리를 다른 스크립트가 통째로 올려 그 제외를
#   무의미하게 만들었다. 제외 목록으로 안전을 보장하는 방식은 이렇게 깨진다.
#
#   그래서 규칙을 하나로 만든다:
#
#       작업 트리 → aws/build-public.py(거름망) → build/public-app/ → S3
#
#   배포 스크립트는 **build/public-app 밖의 파일을 공개 원본으로 쓰지 않는다.**
#   --exclude 는 보조 방어선일 뿐 1차 경계가 아니다.
#
# ⚠️ 거름망이 막은 파일을 올리려 하면 여기서 **멈춘다.** 조용히 건너뛰지 않는다 —
#    건너뛰면 "올렸는데 왜 없지" 가 되고, 그건 다음 사람이 제외를 지우게 만든다.

_EARTHUS_PUBLIC_ROOT=""

_earthus_repo_root() {
  # 이 파일은 항상 <repo>/aws/_shared/ 에 있다.
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  (cd "$here/../.." && pwd)
}

public_source_root() {
  if [ -n "$_EARTHUS_PUBLIC_ROOT" ]; then
    printf '%s\n' "$_EARTHUS_PUBLIC_ROOT"
    return 0
  fi
  local repo py out
  repo="$(_earthus_repo_root)"
  py="${PYTHON:-python3}"
  command -v "$py" >/dev/null 2>&1 || py=python
  command -v "$py" >/dev/null 2>&1 || {
    echo "❌ python 이 없다 — 공개 빌드를 만들 수 없다" >&2
    return 1
  }
  # 거름망을 돌린다. 누출이 하나라도 있으면 0 이 아닌 코드로 끝나고 배포도 멈춘다.
  if ! out="$("$py" "$repo/aws/build-public.py" --quiet 2>&1)"; then
    echo "❌ 공개 빌드 실패 — 배포를 멈춘다" >&2
    printf '%s\n' "$out" >&2
    return 1
  fi
  _EARTHUS_PUBLIC_ROOT="$repo/build/public-app"
  [ -f "$_EARTHUS_PUBLIC_ROOT/index.html" ] || {
    echo "❌ 공개 빌드 결과가 비어 있다: $_EARTHUS_PUBLIC_ROOT" >&2
    return 1
  }
  printf '%s\n' "$_EARTHUS_PUBLIC_ROOT"
}

# public_file <prototype 기준 상대경로>
public_file() {
  local root rel
  root="$(public_source_root)" || return 1
  rel="${1#prototype/}"          # 옛 호출부가 'prototype/...' 를 넘겨도 받아 준다
  rel="${rel#./}"
  if [ ! -f "$root/$rel" ]; then
    echo "❌ 공개 원본에 없다: $rel" >&2
    echo "   공개 빌드 거름망(aws/_shared/public_build.py)이 막았거나 파일이 없다." >&2
    echo "   공개해야 하는 파일이면 DENY_RULES 를 고치고, 아니면 이 배포에서 뺀다." >&2
    return 1
  fi
  printf '%s\n' "$root/$rel"
}

# public_dir <prototype 기준 상대경로>
public_dir() {
  local root rel
  root="$(public_source_root)" || return 1
  rel="${1#prototype/}"
  rel="${rel#./}"
  if [ ! -d "$root/$rel" ]; then
    echo "❌ 공개 원본에 없다(디렉터리): $rel" >&2
    return 1
  fi
  printf '%s\n' "$root/$rel"
}
