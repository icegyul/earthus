#!/usr/bin/env bash
# EARTHUS 크롬 새 탭 확장 — zip 묶기 + 검사 (2026-09-24 · 지시서 §4-3 · Phase 3 완료 기준 11)
#
# ⚠️ 배포 스크립트가 아니다. 어디에도 올리지 않는다 — Chrome Web Store 업로드는 PD 손이다(지시서 §1-2 ⑥).
#    하는 일: apps/chrome-newtab/ 에서 tests/ 를 뺀 파일을 build/chrome-newtab-<version>.zip 으로 묶고, 묶인 파일만 검사한다.
#
# 검사(하나라도 어긋나면 zip 을 지우고 1 로 끝난다)
#   remote       원격 코드 0 — <script src="http…">, import … from 'http…', import('http…'), importScripts(
#   eval         eval( · new Function( 0 (MV3 기본 CSP 가 막지만 코드에 있으면 심사에서 걸린다)
#   permissions  permissions + host_permissions 합이 정확히 3 (storage · alarms · https://earthus.net/*), optional_permissions 없음
#   그 밖        manifest.json 이 zip 맨 위에 있다(폴더째 묶으면 스토어가 거절한다) · CRLF 없음
# 출력 마지막 줄 예: remote=0 eval=0 permissions=3
#
# 실행: bash tools/build-chrome-ext.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${EARTHUS_EXT_SRC:-$ROOT/apps/chrome-newtab}"   # 검사기 자체를 시험할 때만 다른 폴더를 준다
OUT_DIR="$ROOT/build"
[ -f "$SRC/manifest.json" ] || { echo "manifest.json 없음: $SRC" >&2; exit 1; }
mkdir -p "$OUT_DIR"

PY="$(command -v python3 || command -v python || true)"
[ -n "$PY" ] || { echo "python 이 필요하다(zip 이 없는 Windows Git Bash 대비)" >&2; exit 1; }

[ -n "${EARTHUS_EXT_SRC:-}" ] && OUT_DIR="$OUT_DIR/app-build/ext-check"   # 검사기 시험은 진짜 zip 을 덮지 않는다
mkdir -p "$OUT_DIR"
PYTHONIOENCODING=utf-8 "$PY" - "$SRC" "$OUT_DIR" <<'PYEOF'
import json, os, re, sys, zipfile

src, out_dir = sys.argv[1], sys.argv[2]
man = json.load(open(os.path.join(src, 'manifest.json'), encoding='utf-8'))
version = man.get('version', '0')
zpath = os.path.join(out_dir, f'chrome-newtab-{version}.zip')

files = []
for base, dirs, names in os.walk(src):
    rel_base = os.path.relpath(base, src).replace('\\', '/')
    if rel_base == 'tests' or rel_base.startswith('tests/'):
        continue
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    for n in names:
        if n.startswith('.') or n.startswith('._'):
            continue
        rel = n if rel_base == '.' else f'{rel_base}/{n}'
        files.append(rel)
files.sort()

problems = []
remote = evals = crlf = 0
re_remote = [
    re.compile(r'<script\b[^>]*\bsrc\s*=\s*["\']?\s*(https?:)?//', re.I),
    re.compile(r'\bimport\s+[^;]*?\bfrom\s*["\']https?:', re.I),
    re.compile(r'\bimport\s*\(\s*["\']https?:', re.I),
    re.compile(r'\bimportScripts\s*\('),
    re.compile(r'<link\b[^>]*\bhref\s*=\s*["\']https?:[^"\']*["\'][^>]*rel\s*=\s*["\']?(stylesheet|modulepreload)', re.I),
    re.compile(r'<link\b[^>]*rel\s*=\s*["\']?(stylesheet|modulepreload)[^>]*\bhref\s*=\s*["\']https?:', re.I),
]
re_eval = [re.compile(r'\beval\s*\('), re.compile(r'\bnew\s+Function\s*\(')]
for rel in files:
    p = os.path.join(src, rel)
    if rel.endswith(('.js', '.html', '.css', '.json')):
        raw = open(p, 'rb').read()
        if b'\r\n' in raw:
            crlf += 1; problems.append(f'CRLF: {rel}')
        text = raw.decode('utf-8')
        code = re.sub(r'^\s*//.*$', '', text, flags=re.M) if rel.endswith('.js') else text
        for r in re_remote:
            for m in r.finditer(code):
                remote += 1; problems.append(f'remote: {rel}: {m.group(0)[:80]}')
        if rel.endswith(('.js', '.html')):
            for r in re_eval:
                for m in r.finditer(code):
                    evals += 1; problems.append(f'eval: {rel}: {m.group(0)}')
        if rel.endswith('.html') and re.search(r'<script\b(?![^>]*\bsrc=)[^>]*>\s*\S', text):
            remote += 1; problems.append(f'inline script: {rel}')

perms = list(man.get('permissions', [])) + list(man.get('host_permissions', []))
if man.get('optional_permissions') or man.get('optional_host_permissions'):
    problems.append('optional_permissions 가 있다')
if sorted(perms) != sorted(['storage', 'alarms', 'https://earthus.net/*']):
    problems.append(f'권한 목록이 다르다: {perms}')
if 'content_security_policy' in man:
    problems.append('content_security_policy 를 바꾸지 않는다')

if os.path.exists(zpath):
    os.remove(zpath)
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for rel in files:
        z.write(os.path.join(src, rel), arcname=rel)
with zipfile.ZipFile(zpath) as z:
    names = z.namelist()
if 'manifest.json' not in names:
    problems.append('manifest.json 이 zip 맨 위에 없다')
if any(n.startswith('tests/') for n in names):
    problems.append('tests/ 가 묶였다')

size = os.path.getsize(zpath)
print(f'zip: {zpath}')
print(f'files={len(names)} bytes={size}')
for pr in problems:
    print('  x', pr)
print(f'remote={remote} eval={evals} permissions={len(perms)}')
if problems or remote or evals or len(perms) != 3:
    os.remove(zpath)
    sys.exit(1)
PYEOF
