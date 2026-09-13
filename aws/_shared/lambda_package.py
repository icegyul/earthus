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
import json
import os
import re
import shutil
import subprocess
import sys

SCHEMA = "earthus.lambda-package/1"

# 패키지에 넣지 않는 디렉터리. tests 는 용량이고, contracts 는 셸이 따로 복사한다.
SKIP_DIRS = ("tests", "test", "__pycache__", "contracts", ".pytest_cache")

# Lambda 런타임이 이미 갖고 있어 zip 에 넣지 않는 것. 없다고 실패로 보지 않는다.
RUNTIME_PROVIDED = ("boto3", "botocore", "urllib3", "s3transfer", "jmespath", "dateutil", "six")


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


def shared_closure(function_dir, shared_dir):
    """이 함수가 실제로 필요한 `_shared` 모듈 이름 — 전이 의존까지 닫는다.

    ⚠️ 고정 목록이 아니다. import 를 읽어서 정한다 — 목록을 손으로 적으면
       새 import 가 추가될 때 조용히 빠진다(그것이 이 결함의 원인이었다).
    """
    available = sorted(
        name[:-3] for name in os.listdir(shared_dir)
        if name.endswith(".py") and name != "__init__.py")
    needed, scan = [], list(source_files(function_dir))
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
    return {
        "schema": SCHEMA,
        "function": os.path.basename(os.path.normpath(function_dir)),
        "topLevelModules": top,
        "sharedModules": shared_closure(function_dir, shared_dir),
        "subPackages": sub_packages(function_dir),
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
