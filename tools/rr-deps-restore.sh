#!/usr/bin/env bash
# tools/rr-deps-restore.sh — services/research-runtime/.deps 를 새 클론에서 다시 만든다.
#
# 왜: .deps(약 301MB, services/research-runtime/.gitignore 2행에서 무시)는 저장소에 없다.
#     없으면 OceanParcels 가 잡히지 않아 research-runtime 시험 12건이
#     "OceanParcels 3.1.4 unavailable (ModuleNotFoundError)" 로 깨진다.
#
# 정본: services/research-runtime/dependencies.lock.txt (40개 고정, parcels==3.1.4 포함)
#       requirements.txt 는 parcels 한 줄뿐이라 재현용이 아니다.
#
# 파이썬: 3.12 만 허용한다. 로컬 .deps 는 cp312 바이너리(numpy·scipy·netCDF4·siphash24 …)다.
#         3.14 로 .deps 를 읽으면 "No module named 'numpy._core._multiarray_umath'" 로 죽는다(2026-09-20 실측).
#
# 주의: 잠금 파일 머리말은 "Python 3.12.14, Windows AMD64" 에서 뜬 것이다. 리눅스/맥에서 돌리면
#       같은 버전의 해당 플랫폼 휠이 깔린다 — 기능은 같지만 로컬 .deps 와 바이트 단위로 같지는 않다.
#
# 쓰기: 저장소 루트에서
#   bash tools/rr-deps-restore.sh            # .deps 가 비어 있거나 없을 때만
#   bash tools/rr-deps-restore.sh --force    # 기존 .deps 를 .deps.bak-<시각> 으로 밀어두고 새로 만든다
#   PYTHON=/path/to/python3.12 bash tools/rr-deps-restore.sh
#
# Windows 에서는 tools/rr-deps-restore.ps1 을 쓴다. Git Bash + 윈도 파이썬 조합은 PYTHONPATH 의
# /d/... 경로를 파이썬이 못 읽을 수 있다(미검증 — 추측).
# .deps.new / .deps.bak-* 는 현재 .gitignore(".deps/")에 걸리지 않는다 — ".deps*/" 로 넓힐 것을 권한다.
set -euo pipefail

die() { echo "rr-deps-restore: 실패 — $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVC="$ROOT/services/research-runtime"
LOCK="$SVC/dependencies.lock.txt"
DEPS="$SVC/.deps"
FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

[ -f "$LOCK" ] || die "잠금 파일이 없다: $LOCK"
grep -qE '^parcels==3\.1\.4$' "$LOCK" || die "잠금 파일에 parcels==3.1.4 고정이 없다 — 정본이 바뀌었는지 먼저 확인할 것"

# ── 파이썬 3.12 찾기 ───────────────────────────────────────────────
pick_python() {
  if [ -n "${PYTHON:-}" ]; then echo "$PYTHON"; return; fi
  for c in python3.12 "py -3.12" python3 python; do
    if $c -c 'import sys; sys.exit(0 if sys.version_info[:2]==(3,12) else 1)' >/dev/null 2>&1; then
      echo "$c"; return
    fi
  done
  echo ""
}
PY="$(pick_python)"
[ -n "$PY" ] || die "Python 3.12 을 찾지 못했다. .deps 는 cp312 전용이다(3.14 불가). PYTHON=<3.12 경로> 로 지정할 것"
VER="$($PY -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
echo "rr-deps-restore: python = $PY ($VER)"

# ── 기존 .deps 처리 ───────────────────────────────────────────────
if [ -d "$DEPS" ] && [ -n "$(ls -A "$DEPS" 2>/dev/null)" ]; then
  if [ "$FORCE" -ne 1 ]; then
    die ".deps 가 이미 있다($DEPS). 덮어쓰려면 --force (기존 것은 .deps.bak-<시각> 으로 옮긴다)"
  fi
fi

TMP="$SVC/.deps.new"
rm -rf "$TMP"
echo "rr-deps-restore: $LOCK → $TMP 설치 (휠 우선 — asciitree 0.3.3 처럼 sdist 뿐인 패키지가 있을 수 있다)"
if ! $PY -m pip install --disable-pip-version-check --no-input \
      --prefer-binary --target "$TMP" -r "$LOCK"; then
  rm -rf "$TMP"
  die "pip 설치 실패. 흔한 원인: (1) 3.12 가 아님 (2) 이 플랫폼용 휠이 없는 버전 (3) 네트워크 차단. 기존 .deps 는 건드리지 않았다"
fi

# ── 검증: parcels 3.1.4 가 실제로 import 되는가 ─────────────────────
SEP="$($PY -c 'import os; print(os.pathsep)')"   # 리눅스 ':' / 윈도 파이썬 ';'
GOT="$(cd "$SVC" && PYTHONPATH="$SVC${SEP}$TMP" $PY -s -c 'import parcels, numpy; print(parcels.__version__)' 2>&1)" \
  || { rm -rf "$TMP"; die "설치는 됐지만 parcels import 가 실패했다: $GOT"; }
case "$GOT" in
  3.1.4*) : ;;
  *) rm -rf "$TMP"; die "parcels 버전이 3.1.4 가 아니다: $GOT" ;;
esac

# ── 교체 ─────────────────────────────────────────────────────────
if [ -d "$DEPS" ]; then
  BAK="$SVC/.deps.bak-$(date +%Y%m%d-%H%M%S)"
  mv "$DEPS" "$BAK"
  echo "rr-deps-restore: 기존 .deps → $BAK (확인 뒤 직접 지울 것)"
fi
mv "$TMP" "$DEPS"
echo "rr-deps-restore: 완료 — parcels $GOT, $(ls -d "$DEPS"/*.dist-info | wc -l) 패키지"
echo "시험: cd services/research-runtime && PYTHONPATH=\".${SEP}.deps\" $PY -m unittest discover -s tests"
