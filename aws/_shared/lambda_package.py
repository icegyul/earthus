# -*- coding: utf-8 -*-
"""Lambda 패키지 구성 — 무엇을 zip 에 넣어야 하는가.

왜 이 파일이 생겼나 (docs/DISTRIBUTION_DEPLOYMENT_GAP.md)
  `deploy-python.sh` 는 `cp "$DIR"/*.py` 로 함수 폴더의 **최상위 .py 만** 넣고,
  `_shared` 에서는 `kma_hub.py` **하나만** 후보로 두고 `import kma_hub` 가 있을 때만 복사했다.
  그래서 `aws/distribution` 은 필요한 `_shared` 4개(content_contract · provenance ·
  report_contract · report_period)와 하위 패키지 2개(sns_adapters · sources)가 통째로 빠진 채
  zip 이 만들어졌고, 콜드 스타트에서 이렇게 죽었다:

      Runtime.ImportModuleError: Unable to import module 'handler':
      No module named 'content_contract'

왜 bash 가 아니라 여기인가
  같은 규칙을 셸과 시험에 두 번 쓰면 한쪽만 고쳐진다. 그게 처음에 목록을 손으로 적어
  `kma_hub` 만 남은 이유다. 규칙은 여기 한 곳에 두고, `deploy-python.sh` 와
  `aws/_shared/tests/test_lambda_package.py` 가 **같은 함수를 부른다.**

zip 루트가 sys.path 다 — 평평하게 넣어야 한다
  Lambda 는 zip 을 `/var/task` 로 풀고 그것을 `sys.path` 에 넣는다. 그리고 핸들러들은
  `sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))` 로 `_shared` 를 찾는데,
  `_HERE` 가 `/var/task` 이므로 그 경로는 **`/var/_shared`** 가 되고 존재하지 않는다.
  따라서 `_shared` 모듈은 **zip 최상위에 평평하게** 넣어야 한다.
  (`kma_hub.py` 를 그렇게 넣어 왔다 — 그 관례를 그대로 일반화한다.)

목록을 손으로 적지 않는다
  함수가 실제로 `import` 하는 것만 넣는다. 새 import 가 생기면 자동으로 따라온다.
  전이 의존(`_shared` 모듈이 다른 `_shared` 모듈을 부르는 경우)까지 닫는다.
"""
import argparse
import ast
import json
import os
import re
import shutil
import base64
import hashlib
import subprocess
import sys
import zipfile

SCHEMA = "earthus.lambda-package/1"

# 패키지에 넣지 않는 디렉터리. tests 는 용량이고, contracts 는 셸이 따로 복사한다.
SKIP_DIRS = ("tests", "test", "__pycache__", "contracts", ".pytest_cache")
# ⚠️ zip 은 contracts 를 **빼지 않는다.** 위 목록은 '소스를 훑고 복사할 때' 규칙이다 — 셸(deploy-python.sh)이
#    함수의 contracts/ 를, stage 가 dataFiles(예: contracts/intel-vocab.json)를 이미 stage 에 넣어 둔다.
#    2026-09-20 까지는 zip 이 같은 목록을 써서 stage 에 있던 contracts/ 를 **zip 에서 떨어뜨렸다** —
#    intel_contract 는 import 때 어휘표를 읽으므로 cyclone-analog·earthus-llm 배포 검사가 막혔고,
#    관광 수집기의 Swagger 계약도 09-13 이후 배포본에서는 빠졌을 것이다.
ZIP_SKIP_DIRS = tuple(name for name in SKIP_DIRS if name != "contracts")

# Lambda 런타임이 이미 갖고 있어 zip 에 넣지 않는 것. 없다고 실패로 보지 않는다.
RUNTIME_PROVIDED = ("boto3", "botocore", "urllib3", "s3transfer", "jmespath", "dateutil", "six")

# ── 결정적 ZIP — 같은 나무는 같은 CodeSha256 ─────────────────────────────────
# 왜 필요한가 (2026-09-13 실측): 같은 stage 에서 세 가지 해시가 나왔다. 전부 114,592 바이트,
# 파일별 내용까지 동일한데 **바이트가 달랐다.**
#     B2xXACptGf7rtcUYZ6Or3l0yYXAp7kISMrdnTwNopug=   os.walk 순서 그대로
#     y5J67pVZM8o8TOtizP9Al/ZoxqJgpdbZ8UgX1HxZxHk=   디렉터리별로만 정렬
#     3IzxRWaKNUUwRAIMEhEfUYiZS6hOplE7fsWSXOsbWnQ=   전역 정렬 + create_system 고정
# 해시가 재현되지 않으면 "지금 운영에 올라간 것이 내가 만든 그것인가"를 물을 수 없다.
#
# 비결정 요인과 처리
#   구성원 순서    os.walk 는 파일시스템 순서다 → **arcname 바이트로 전역 정렬**
#   mtime          ZipInfo(name) 의 기본이 (1980,1,1,0,0,0) 으로 이미 고정이지만 명시한다
#   파일 모드      윈도우는 권한 개념이 없어 zipfile 기본이 0 이고, 그대로 풀면 000 이 되어
#                  Lambda 가 .so 를 못 읽는다 → 0o644 강제 (deploy-python.sh 가 기록한 사고)
#   create_system  **윈도우 0 / POSIX 3.** 고정하지 않으면 같은 나무가 OS 마다 다른 해시가 된다
#                  (실측: 0 → J1UprNja5WTZIWB0/+abb6D7oHMy23DIYf4+wqiPbuo=)
#   압축 수준      zlib 기본값은 구현에 따라 달라질 수 있어 숫자로 못 박는다
#   디렉터리 항목  넣지 않는다 — 있으면 바이트가 늘고 Lambda 에 필요도 없다
#   바이트코드     .pyc/.pyo 는 넣지 않는다 (같은 소스에서도 내용이 달라진다)
ZIP_DATE_TIME = (1980, 1, 1, 0, 0, 0)
ZIP_FILE_MODE = 0o644
ZIP_CREATE_SYSTEM = 3          # 3 = POSIX. Lambda 가 도는 곳이다.
ZIP_COMPRESSLEVEL = 6
ZIP_SKIP_SUFFIXES = (".pyc", ".pyo")


def zip_members(stage_dir):
    """zip 에 들어갈 (arcname, 실제경로) 목록. **arcname 바이트 순으로 정렬한다.**

    정렬 기준을 str 이 아니라 utf-8 바이트로 두는 이유: 로케일에 따라 str 비교 순서가
    달라질 수 있고, zip 안에 남는 것은 바이트다. 비교도 바이트로 한다.
    """
    members = []
    for root, dirs, files in os.walk(stage_dir):
        dirs[:] = [d for d in dirs if d not in ZIP_SKIP_DIRS]
        for name in files:
            if name.endswith(ZIP_SKIP_SUFFIXES):
                continue
            full = os.path.join(root, name)
            arcname = os.path.relpath(full, stage_dir).replace(os.sep, "/")
            members.append((arcname, full))
    members.sort(key=lambda pair: pair[0].encode("utf-8"))
    seen = {}
    for arcname, full in members:
        if arcname in seen:
            raise ValueError("zip 안에서 이름이 겹친다: %s (%s · %s)"
                             % (arcname, seen[arcname], full))
        seen[arcname] = full
    return members


def content_digest(members):
    """**내용만**의 지문. 압축·순서·메타데이터와 무관하다.

    CodeSha256 은 zip 바이트의 해시이므로 압축 구현이 바뀌면 값이 바뀐다.
    "같은 코드인가"를 물을 때는 이쪽이 답한다.
    """
    h = hashlib.sha256()
    for arcname, full in members:
        h.update(arcname.encode("utf-8"))
        h.update(b"\0")
        with open(full, "rb") as fh:
            h.update(hashlib.sha256(fh.read()).hexdigest().encode("ascii"))
        h.update(b"\n")
    return h.hexdigest()


def build_zip(stage_dir, out_path, *, date_time=ZIP_DATE_TIME, mode=ZIP_FILE_MODE,
              create_system=ZIP_CREATE_SYSTEM, compresslevel=ZIP_COMPRESSLEVEL):
    """staged 나무를 **결정적** zip 으로 만든다. 돌려주는 것: 매니페스트.

    `deploy-python.sh` 와 시험이 이 함수를 부른다 — 규칙이 두 곳에 있으면 한쪽만 고쳐진다.
    인자를 노출하는 것은 시험이 "고정하지 않으면 달라진다"를 보일 수 있게 하기 위해서다.
    """
    members = zip_members(stage_dir)
    # ⚠️ 이름 겹침은 **여기서도** 본다. zip_members 안에만 두면 구성원 목록을 다른 데서
    #    만들어 넣는 순간 검사가 사라진다. zipfile 은 겹친 이름을 경고만 하고 둘 다 쓴다 —
    #    그러면 Lambda 가 어느 쪽을 import 할지 알 수 없다.
    names = [arcname for arcname, _ in members]
    if len(names) != len(set(names)):
        duplicated = sorted({n for n in names if names.count(n) > 1})
        raise ValueError("zip 안에서 이름이 겹친다: %s" % ", ".join(duplicated))
    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED,
                         compresslevel=compresslevel) as zf:
        for arcname, full in members:
            info = zipfile.ZipInfo(arcname, date_time=date_time)
            info.external_attr = (mode & 0o7777) << 16
            info.create_system = create_system
            info.compress_type = zipfile.ZIP_DEFLATED
            # ⚠️ **ZipInfo 에 직접 박아야 한다.** `ZipFile(..., compresslevel=N)` 은
            #    arcname 문자열을 넘길 때만 쓰이고, 이렇게 ZipInfo 를 만들어 넘기면
            #    `zinfo._compresslevel`(기본 None) 이 이겨서 zlib 기본값으로 압축된다.
            #    실측 2026-09-13 — 고치기 전에는 level 0·1·3·6·9 가 **전부 같은 바이트**였다.
            #    즉 수준이 고정된 게 아니라 아예 전달되지 않았다. zlib 구현이 기본값을
            #    바꾸면 해시가 조용히 달라진다.
            info._compresslevel = compresslevel
            with open(full, "rb") as fh:
                zf.writestr(info, fh.read())
    blob_hash = hashlib.sha256()
    size = 0
    with open(out_path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            blob_hash.update(chunk)
            size += len(chunk)
    return {
        "schema": SCHEMA,
        "path": out_path,
        "bytes": size,
        "count": len(members),
        "codeSha256": base64.b64encode(blob_hash.digest()).decode("ascii"),
        "contentDigest": content_digest(members),
        "members": [arcname for arcname, _ in members],
    }


def _is_skipped(path):
    parts = str(path).replace("\\", "/").split("/")
    return any(part in SKIP_DIRS for part in parts)


def source_files(function_dir):
    """함수가 가진 .py 전부 (하위 패키지 포함, tests·__pycache__ 제외)."""
    found = []
    for root, dirs, names in os.walk(function_dir):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in sorted(names):
            if name.endswith(".py"):
                found.append(os.path.join(root, name))
    return found


def _imports(paths, module):
    """`import M` 또는 `from M import` 가 있는가. 주석·문자열 안의 이름은 잡지 않는다."""
    pattern = re.compile(
        r"^[ \t]*(?:import[ \t]+%s(?:[ \t]|,|$)|from[ \t]+%s[ \t]+import)" % (re.escape(module), re.escape(module)),
        re.M)
    for path in paths:
        try:
            with open(path, encoding="utf-8", errors="ignore") as handle:
                if pattern.search(handle.read()):
                    return True
        except OSError:
            continue
    return False


def cross_function_files(function_dir, shared_dir):
    """`os.path.join(_AWS, "<함수>", …, "<파일>.py")` 로 **경로로 직접 읽는** 다른 함수의 파일.

    왜 이런 관용구가 있나: `sys.path` 에 다른 함수 폴더를 넣으면 같은 이름의 패키지가 서로를
    가린다. `aws/distribution/sources/verify_scorecard.py` 의 `_load` 주석이 그 사고를 적고 있다
    (`ImportError: cannot import name 'lab_report_adapter'`). 그래서 경로로 읽는다.

    문제는 Lambda 다. zip 이 `/var/task` 로 풀리므로 `_AWS` 는 `/var` 가 되고
    그 경로는 패키지 **밖**이다 — 안에서 만족시킬 수 없다
    (docs/DISTRIBUTION_DEPLOYMENT_GAP.md §4).

    그래서 그 파일을 **zip 루트에 평평하게** 넣어 준다. 읽는 쪽은 패키지 안을 먼저 보고
    없으면 저장소 경로로 떨어진다.

    ⚠️ 목록을 손으로 적지 않는다. `ast` 로 그 관용구를 찾는다 — 문자열 검색이 아니라 구문 해석이라
       주석·문자열 안의 같은 글자에 걸리지 않는다. 새로 같은 관용구가 생기면 자동으로 따라온다.
    """
    aws_root = os.path.dirname(os.path.abspath(shared_dir))
    found = {}
    for path in source_files(function_dir):
        try:
            with open(path, encoding="utf-8", errors="ignore") as handle:
                tree = ast.parse(handle.read(), filename=path)
        except (OSError, SyntaxError):
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or len(node.args) < 2:
                continue
            if not _is_os_path_join(node.func):
                continue
            first, rest = node.args[0], node.args[1:]
            if not (isinstance(first, ast.Name) and first.id == "_AWS"):
                continue
            if not all(isinstance(a, ast.Constant) and isinstance(a.value, str) for a in rest):
                continue
            parts = [a.value for a in rest]
            if not parts[-1].endswith(".py"):
                continue                     # `_shared` 같은 디렉터리 경로는 대상이 아니다
            relative = "/".join(parts)
            source = os.path.join(aws_root, *parts)
            if os.path.isfile(source):
                found[parts[-1]] = relative
    return dict(sorted(found.items()))


def _own_dir_names(tree):
    """이 파일에서 **자기 디렉터리**를 담은 최상위 변수 이름들.

    `_HERE = os.path.dirname(os.path.abspath(__file__))` 같은 관용구를 구문으로 찾는다.
    이름을 고정 목록(`_HERE`·`HERE`·…)으로 적지 않는 이유는 파일마다 다르게 부르기 때문이다.
    """
    names = set()
    for node in tree.body:
        if not isinstance(node, ast.Assign) or len(node.targets) != 1:
            continue
        target = node.targets[0]
        if not isinstance(target, ast.Name):
            continue
        text = ast.dump(node.value)
        if "'dirname'" in text and "'__file__'" in text:
            names.add(target.id)
    return names


def module_data_files(paths):
    """`os.path.join(<자기디렉터리>, "…", "<파일>.<확장자>")` 로 읽는 **자료 파일**.

    왜 이 규칙이 필요한가: `aws/_shared/truth_vocabulary.py` 는 진실 어휘를 코드에 베껴 쓰지 않고
    `_shared/sql/20260913_earth_event_core.sql` 의 `create domain` 정의를 **import 시점에 읽는다.**
    패키저가 `.py` 만 넣던 동안 그 파일이 빠졌고, staged 패키지를 그대로 import 하면
    콜드 스타트에서 이렇게 죽는다 (2026-09-13 실측):

        VocabularyError: 정본 SQL 을 읽지 못했다: [Errno 2] ... 'sql/20260913_earth_event_core.sql'

    `cross_function_files()` 와 다른 점: 그쪽은 **다른 함수 폴더**의 `.py` 를 zip 루트에
    평평하게 넣는다. 여기는 모듈 **자기 옆**의 자료 파일이고, `_HERE` 가 런타임에 zip 루트가
    되므로 **상대 경로를 그대로 유지해** 넣어야 한다(`sql/…` 는 `sql/…` 로).

    돌려주는 것: {zip 안 상대경로: 원본 절대경로}
    """
    found = {}
    for path in paths:
        try:
            with open(path, encoding="utf-8", errors="ignore") as handle:
                tree = ast.parse(handle.read(), filename=path)
        except (OSError, SyntaxError):
            continue
        own = _own_dir_names(tree)
        if not own:
            continue
        base = os.path.dirname(os.path.abspath(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or len(node.args) < 2:
                continue
            if not _is_os_path_join(node.func):
                continue
            first, rest = node.args[0], node.args[1:]
            if not (isinstance(first, ast.Name) and first.id in own):
                continue
            if not all(isinstance(a, ast.Constant) and isinstance(a.value, str)
                       for a in rest):
                continue
            parts = [a.value for a in rest]
            # `.py` 는 모듈이다 — import 닫기와 cross_function_files 가 이미 다룬다.
            if parts[-1].endswith(".py") or "." not in parts[-1]:
                continue
            source = os.path.join(base, *parts)
            if os.path.isfile(source):
                found["/".join(parts)] = source
    return dict(sorted(found.items()))


def _is_os_path_join(func):
    """`os.path.join` 호출인지 — `join` / `path.join` / `os.path.join` 을 모두 받는다."""
    names = []
    node = func
    while isinstance(node, ast.Attribute):
        names.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        names.append(node.id)
    names.reverse()
    return names[-1:] == ["join"] and (len(names) == 1 or names[-2:] == ["path", "join"])


def shared_closure(function_dir, shared_dir):
    """이 함수가 실제로 필요한 `_shared` 모듈 이름 — 전이 의존까지 닫는다.

    ⚠️ 고정 목록이 아니다. import 를 읽어서 정한다 — 목록을 손으로 적으면
       새 import 가 추가될 때 조용히 빠진다(그것이 이 결함의 원인이었다).
    """
    available = sorted(
        name[:-3] for name in os.listdir(shared_dir)
        if name.endswith(".py") and name != "__init__.py")
    aws_root = os.path.dirname(os.path.abspath(shared_dir))
    # 경로로 읽는 다른 함수 파일도 훑는다 — 그 파일의 _shared import 가 빠지면 런타임에 죽는다.
    scan = list(source_files(function_dir)) + [
        os.path.join(aws_root, *relative.split("/"))
        for relative in cross_function_files(function_dir, shared_dir).values()]
    needed = []
    while True:
        added = False
        for module in available:
            if module in needed:
                continue
            if _imports(scan, module):
                needed.append(module)
                scan.append(os.path.join(shared_dir, module + ".py"))
                added = True
        if not added:
            return sorted(needed)


def sub_packages(function_dir):
    """재귀 복사해야 하는 파이썬 하위 패키지 (`__init__.py` 를 가진 디렉터리)."""
    found = []
    for name in sorted(os.listdir(function_dir)):
        path = os.path.join(function_dir, name)
        if not os.path.isdir(path) or name in SKIP_DIRS:
            continue
        if os.path.isfile(os.path.join(path, "__init__.py")):
            found.append(name)
    return found


def plan(function_dir, shared_dir):
    """넣을 것의 목록. 복사하지 않는다 — 시험과 배포가 같은 계획을 본다."""
    top = sorted(name for name in os.listdir(function_dir)
                 if name.endswith(".py") and not name.startswith("test_"))
    shared = shared_closure(function_dir, shared_dir)
    # 넣는 모듈들이 자기 옆에서 읽는 자료 파일 — 상대 경로를 유지해 넣는다.
    scanned = [os.path.join(function_dir, name) for name in top] + \
        [os.path.join(shared_dir, module + ".py") for module in shared]
    return {
        "schema": SCHEMA,
        "function": os.path.basename(os.path.normpath(function_dir)),
        "topLevelModules": top,
        "sharedModules": shared,
        "subPackages": sub_packages(function_dir),
        # 경로로 읽는 다른 함수 파일 → zip 루트에 평평하게 (파일이름: 저장소 상대경로)
        "crossFunctionFiles": cross_function_files(function_dir, shared_dir),
        # 모듈 옆의 자료 파일 → 같은 상대 경로로 (zip 안 경로: 원본 경로)
        "dataFiles": {relative: os.path.abspath(source)
                      for relative, source in module_data_files(scanned).items()},
    }


def stage(function_dir, shared_dir, dest):
    """계획대로 `dest` 에 복사한다. `dest` 가 zip 루트가 되고, 그것이 곧 sys.path 다."""
    os.makedirs(dest, exist_ok=True)
    staged = plan(function_dir, shared_dir)
    for name in staged["topLevelModules"]:
        shutil.copy2(os.path.join(function_dir, name), os.path.join(dest, name))
    for module in staged["sharedModules"]:
        source = os.path.join(shared_dir, module + ".py")
        if not os.path.isfile(source):
            raise FileNotFoundError(f"_shared/{module}.py 가 없다: {source}")
        # 평평하게. _shared/ 하위로 넣으면 Lambda 의 경로 계산이 여전히 못 찾는다.
        shutil.copy2(source, os.path.join(dest, module + ".py"))
    aws_root = os.path.dirname(os.path.abspath(shared_dir))
    for name, relative in staged["crossFunctionFiles"].items():
        source = os.path.join(aws_root, *relative.split("/"))
        if not os.path.isfile(source):
            raise FileNotFoundError(f"경로로 읽는 파일이 없다: {source}")
        # 평평하게. 읽는 쪽이 패키지 루트를 먼저 본다.
        shutil.copy2(source, os.path.join(dest, name))
    for relative, source in staged["dataFiles"].items():
        if not os.path.isfile(source):
            raise FileNotFoundError(f"모듈이 읽는 자료 파일이 없다: {source}")
        # 상대 경로 유지. `_HERE` 가 런타임에 zip 루트이므로 `sql/…` 는 `sql/…` 여야 한다.
        target = os.path.join(dest, *relative.split("/"))
        os.makedirs(os.path.dirname(target), exist_ok=True)
        shutil.copy2(source, target)
    for package in staged["subPackages"]:
        target = os.path.join(dest, package)
        if os.path.isdir(target):
            shutil.rmtree(target)
        shutil.copytree(os.path.join(function_dir, package), target,
                        ignore=shutil.ignore_patterns(*SKIP_DIRS, "*.pyc"))
    return staged


def missing_own_modules(dest, function_dir, shared_dir):
    """`plan()` 이 넣으라고 한 것 중 `dest` 에 없는 것.

    ⚠️ "저장소의 모든 모듈이 있는가" 를 묻지 않는다. 그렇게 물으면 이 함수가 필요로 하지도 않는
       `_shared` 모듈까지 누락으로 보고한다(첫 구현이 그랬다).
       기준은 **이 함수의 계획**이다.

    제3자 패키지(numpy 등)는 여기서 보지 않는다 — pip 가 넣으므로 패키징 규칙의 관심사가 아니다.
    """
    planned = plan(function_dir, shared_dir)
    missing = []
    for name in planned["topLevelModules"]:
        if not os.path.isfile(os.path.join(dest, name)):
            missing.append(name[:-3])
    for module in planned["sharedModules"]:
        if not os.path.isfile(os.path.join(dest, module + ".py")):
            missing.append(module)
    for package in planned["subPackages"]:
        if not os.path.isdir(os.path.join(dest, package)):
            missing.append(package)
    for name in planned["crossFunctionFiles"]:
        if not os.path.isfile(os.path.join(dest, name)):
            missing.append(name[:-3])
    for relative in planned["dataFiles"]:
        if not os.path.isfile(os.path.join(dest, *relative.split("/"))):
            missing.append(relative)
    return sorted(set(missing))


def import_check(dest, module="handler", own_modules=None):
    """`dest` 를 zip 루트로 보고 모듈을 실제로 import 해 본다.

    Lambda 와 같은 조건을 만든다: `dest` 만 sys.path 에 두고, 저장소의 `_shared` 가
    상대경로로 잡히지 않도록 **저장소 밖에서** 돌린다(`dest` 는 임시 폴더다).
    PYTHONPATH 를 지워 개발 기계의 경로가 새어 들어오지 않게 한다.

    ⚠️ 환경변수는 그대로 물려받는다 (PATH·SYSTEMROOT 가 없으면 파이썬이 못 뜬다).
       그래서 `CACHE_BUCKET` 같은 값이 이미 설정된 세션에서는 `ENV_VAR_REQUIRED` 가
       `IMPORTED` 로 바뀔 수 있다. 둘 다 통과 갈래이므로 **배포 판정은 달라지지 않는다.**
       차단 갈래(OWN_MODULE_MISSING · PATH_ESCAPES_PACKAGE)는 환경변수와 무관하다.

    판정을 네 갈래로 나눈다 — 개발 기계에서 판단할 수 없는 것을 실패로 부르지 않기 위해서다:

      IMPORTED                         통과
      OWN_MODULE_MISSING               우리 모듈이 없다                → **실패** (패키징 결함)
      PATH_ESCAPES_PACKAGE             우리 코드가 패키지 밖 경로를 읽는다 → **실패** (FileNotFoundError)
      THIRD_PARTY_NOT_INSTALLED_LOCALLY  pip 가 넣는 것이 없다           → 통과
      UNVERIFIABLE_LOCALLY             그 밖 (리눅스 휠을 윈도우에서 로드 등) → 통과 + 경고

    ⚠️ 마지막 갈래가 중요하다. `deploy-python.sh` 는 manylinux 휠을 받아 넣으므로
       개발 기계(Windows/macOS)에서 그 `.so` 를 import 하면 당연히 실패한다.
       그것을 실패로 부르면 **지금 잘 되는 Lambda 13개의 배포가 막힌다.**
    """
    environment = {k: v for k, v in os.environ.items() if k != "PYTHONPATH"}
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    completed = subprocess.run(
        [sys.executable, "-c", f"import {module}"],
        cwd=dest, env=environment, capture_output=True, text=True)
    if completed.returncode == 0:
        return {"ok": True, "module": module, "missing": None, "kind": "IMPORTED"}
    stderr = (completed.stderr or "")[-4000:]
    ours = set(own_modules or ()) | _repo_module_names(dest)

    match = re.search(r"No module named ['\"]([^'\"]+)['\"]", stderr)
    if match:
        name = match.group(1).split(".")[0]
        # `ours` 만 보면 구멍이 남는다: 패키징이 빠뜨린 모듈은 dest 에 없으므로
        # `_repo_module_names(dest)` 에도 없고, 제3자로 오분류돼 통과한다.
        # 그래서 저장소에 그 이름의 파일이 실제로 있는지도 본다.
        if name not in RUNTIME_PROVIDED and (name in ours or _looks_like_repo_module(name, dest)):
            return {"ok": False, "module": module, "missing": name,
                    "kind": "OWN_MODULE_MISSING", "stderr": stderr}
        return {"ok": True, "module": module, "missing": name,
                "kind": "THIRD_PARTY_NOT_INSTALLED_LOCALLY", "stderr": stderr}

    # 모듈 수준에서 필수 환경변수를 읽는 핸들러가 많다(`os.environ["CACHE_BUCKET"]`).
    # Lambda 에서는 설정돼 있으므로 패키징 결함이 아니다 — 다만 무엇이 필요한지는 적어 준다.
    env_key = re.search(r"KeyError: ['\"]([A-Z0-9_]+)['\"]", stderr)
    if env_key and "os.environ" in stderr:
        return {"ok": True, "module": module, "missing": env_key.group(1),
                "kind": "ENV_VAR_REQUIRED", "stderr": stderr}

    if "FileNotFoundError" in stderr:
        # 우리 코드가 패키지 밖의 파일을 읽는다. Lambda 에서도 그 파일은 없다.
        path = None
        found = re.search(r"No such file or directory: ['\"]([^'\"]+)['\"]", stderr)
        if found:
            path = found.group(1)
        return {"ok": False, "module": module, "missing": path,
                "kind": "PATH_ESCAPES_PACKAGE", "stderr": stderr}

    return {"ok": True, "module": module, "missing": None,
            "kind": "UNVERIFIABLE_LOCALLY", "stderr": stderr}


def verify(function_dir, shared_dir, dest, module="handler"):
    """배포 게이트. 두 검사를 합친다.

    ① `missing_own_modules()` — 파일시스템만 본다. 플랫폼과 무관하므로 항상 신뢰할 수 있다
    ② `import_check()` — 실제로 import 해 본다. 판단 불가한 갈래는 통과시킨다
    """
    missing = missing_own_modules(dest, function_dir, shared_dir)
    checked = import_check(dest, module, own_modules=missing)
    return {
        "schema": SCHEMA,
        "function": os.path.basename(os.path.normpath(function_dir)),
        "missingOwnModules": missing,
        "import": checked,
        "ok": not missing and checked["ok"],
    }


def _repo_module_names(dest):
    """`dest` 에 들어 있는 우리 모듈 이름. 제3자와 구별하는 데 쓴다."""
    names = {name[:-3] for name in os.listdir(dest) if name.endswith(".py")}
    names |= {name for name in os.listdir(dest) if os.path.isdir(os.path.join(dest, name))}
    return names


def _looks_like_repo_module(name, dest):
    """이 이름의 `.py` 가 `aws/` 어딘가에 실제로 있는가 — 있으면 제3자가 아니라 우리 것이다.

    이 파일은 `aws/_shared/` 에 있으므로 `aws/` 는 부모의 부모다. `dest`(임시 폴더)와 무관하게
    저장소를 본다 — 패키징이 빠뜨린 모듈을 제3자로 오분류하지 않으려는 판별자다.

    ⚠️ 한계: 그 파일이 저장소에서 **아예 삭제**되면 여기서도 못 찾는다. 그것은 패키징 문제가
       아니라 저장소 무결성 문제이고, `_shared` 모듈이 git 에 추적되는 것으로 막는다
       (docs/UNTRACKED_BASELINE_AUDIT.md 가 추적되지 않아 생긴 사고를 적고 있다).
    """
    aws_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if os.path.isfile(os.path.join(aws_root, "_shared", name + ".py")):
        return True
    try:
        entries = os.listdir(aws_root)
    except OSError:
        return False
    for entry in entries:
        folder = os.path.join(aws_root, entry)
        if os.path.isdir(folder) and os.path.isfile(os.path.join(folder, name + ".py")):
            return True
    return False


def main(argv=None):
    # ⚠️ 윈도우 콘솔 기본 코드페이지는 cp949 다. 한글·기호를 찍다가 UnicodeEncodeError 로 죽으면
    #    배포 스크립트가 그 rc 를 엉뚱하게 읽는다 — deploy-python.sh 머리말이 같은 사고를 기록한다
    #    (air-ea 의 수정이 그래서 운영에 못 올라가 있었다). 여기서 출력 인코딩을 먼저 고정한다.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, OSError, ValueError):
            pass
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("plan", "stage", "verify"):
        sub = commands.add_parser(name)
        sub.add_argument("function_dir")
        sub.add_argument("shared_dir")
        if name != "plan":
            sub.add_argument("dest")
        if name == "verify":
            sub.add_argument("--module", default="handler")
    # zip 은 함수 폴더를 보지 않는다 — 이미 staged 된 나무만 본다.
    zip_cmd = commands.add_parser("zip")
    zip_cmd.add_argument("stage_dir")
    zip_cmd.add_argument("out_path")
    zip_cmd.add_argument("--manifest", help="매니페스트를 JSON 으로 쓸 곳")
    args = parser.parse_args(argv)

    if args.command == "plan":
        print(json.dumps(plan(args.function_dir, args.shared_dir), ensure_ascii=False, indent=2))
        return 0
    if args.command == "stage":
        staged = stage(args.function_dir, args.shared_dir, args.dest)
        for module in staged["sharedModules"]:
            print(f"  · _shared/{module}.py 동봉")
        for package in staged["subPackages"]:
            print(f"  · {package}/ 패키지 동봉")
        for name, relative in staged["crossFunctionFiles"].items():
            print(f"  · {relative} → {name} 동봉 (경로로 읽는 파일)")
        return 0

    if args.command == "zip":
        manifest = build_zip(args.stage_dir, args.out_path)
        print("  · 구성원 %d개 · %s바이트 · CodeSha256 %s"
              % (manifest["count"], format(manifest["bytes"], ","), manifest["codeSha256"]))
        if args.manifest:
            with open(args.manifest, "w", encoding="utf-8") as fh:
                json.dump(manifest, fh, ensure_ascii=False, indent=1)
        return 0

    result = verify(args.function_dir, args.shared_dir, args.dest, args.module)
    checked = result["import"]
    if result["missingOwnModules"]:
        print(f"❌ 패키지에 우리 모듈이 없다: {', '.join(result['missingOwnModules'])}", file=sys.stderr)
    if checked["kind"] == "OWN_MODULE_MISSING":
        print(f"❌ import 중 우리 모듈 없음: {checked['missing']}", file=sys.stderr)
    elif checked["kind"] == "PATH_ESCAPES_PACKAGE":
        print(f"❌ 패키지 밖 경로를 읽는다: {checked['missing']}", file=sys.stderr)
        print("   Lambda 에서도 그 파일은 없다. 코드가 패키지 안 경로만 읽게 고쳐야 한다.", file=sys.stderr)
    elif checked["kind"] == "THIRD_PARTY_NOT_INSTALLED_LOCALLY":
        print(f"  · {checked['missing']} 는 제3자 의존이다 (pip 가 넣는다) — 패키징은 정상")
    elif checked["kind"] == "ENV_VAR_REQUIRED":
        print(f"  · 모듈 수준에서 환경변수 {checked['missing']} 를 요구한다 "
              "(Lambda 에는 설정돼 있다) — 패키징은 정상")
    elif checked["kind"] == "UNVERIFIABLE_LOCALLY":
        print("  ⚠️ 이 기계에서는 import 를 끝까지 확인할 수 없다 "
              "(리눅스 휠을 여기서 로드하는 등). 우리 모듈 누락은 없다.")
    else:
        print(f"  · {args.module} import 통과")
    if not result["ok"]:
        print(json.dumps(result, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
