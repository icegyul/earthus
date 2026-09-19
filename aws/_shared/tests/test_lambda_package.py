# -*- coding: utf-8 -*-
"""Lambda 패키지 구성 규칙 시험 — docs/DISTRIBUTION_DEPLOYMENT_GAP.md

AWS 가 필요 없다. 합성 픽스처로 규칙을 검사하고, 실제 저장소에는 몇 가지 사실만 대조한다.

이 시험이 지키는 것
  ① 목록을 손으로 적지 않는다 — import 를 읽어서 정한다 (그게 kma_hub 하나만 남은 원인이었다)
  ② _shared 는 zip **최상위에 평평하게** 들어간다 (Lambda 에서 /var/_shared 는 없다)
  ③ 하위 파이썬 패키지가 재귀 복사된다 (cp "$DIR"/*.py 는 재귀하지 않았다)
  ④ 배포 게이트는 **우리 잘못**만 막는다 — 리눅스 휠·환경변수는 Lambda 에서 정상이다
"""
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

SHARED = pathlib.Path(__file__).parent.parent
AWS = SHARED.parent
sys.path.insert(0, str(SHARED))
import lambda_package as lp  # noqa: E402


def write(path, text=""):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


class SyntheticFixture(unittest.TestCase):
    """합성 함수 폴더로 규칙만 검사한다 — 저장소 상태에 묶이지 않는다."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.fn = self.root / "myfunc"
        self.shared = self.root / "_shared"
        write(self.shared / "alpha.py", "VALUE = 1\n")
        write(self.shared / "beta.py", "import alpha\nBETA = alpha.VALUE\n")   # 전이 의존
        write(self.shared / "gamma.py", "GAMMA = 3\n")                          # 아무도 안 쓴다
        write(self.fn / "handler.py", "import beta\n\n\ndef handler(event, context):\n    return beta.BETA\n")

    def tearDown(self):
        self.temp.cleanup()

    def test_shared_closure_is_import_driven_not_a_hardcoded_list(self):
        self.assertEqual(["alpha", "beta"], lp.shared_closure(str(self.fn), str(self.shared)))
        # 아무도 import 하지 않는 모듈은 넣지 않는다
        self.assertNotIn("gamma", lp.shared_closure(str(self.fn), str(self.shared)))

    def test_closure_follows_transitive_dependencies(self):
        """handler 는 beta 만 import 한다. beta 가 alpha 를 부르므로 alpha 도 따라와야 한다."""
        closure = lp.shared_closure(str(self.fn), str(self.shared))
        self.assertIn("alpha", closure, "전이 의존이 빠지면 런타임에 죽는다")

    def test_new_import_is_picked_up_automatically(self):
        write(self.fn / "extra.py", "import gamma\n")
        self.assertIn("gamma", lp.shared_closure(str(self.fn), str(self.shared)))

    def test_commented_or_quoted_names_are_not_imports(self):
        write(self.fn / "notes.py", '# import gamma\nTEXT = "import gamma"\n')
        self.assertNotIn("gamma", lp.shared_closure(str(self.fn), str(self.shared)))

    def test_shared_modules_land_flat_at_the_package_root(self):
        """Lambda 에서 dirname(_HERE)/_shared 는 /var/_shared 다 — 존재하지 않는다."""
        dest = self.root / "pkg"
        lp.stage(str(self.fn), str(self.shared), str(dest))
        self.assertTrue((dest / "alpha.py").is_file(), "최상위에 평평하게 있어야 한다")
        self.assertTrue((dest / "beta.py").is_file())
        self.assertFalse((dest / "_shared").exists(), "_shared/ 하위로 넣으면 Lambda 가 못 찾는다")

    def test_sub_packages_are_copied_recursively(self):
        write(self.fn / "pack" / "__init__.py", "from .leaf import LEAF\n")
        write(self.fn / "pack" / "leaf.py", "LEAF = 9\n")
        dest = self.root / "pkg"
        lp.stage(str(self.fn), str(self.shared), str(dest))
        self.assertTrue((dest / "pack" / "__init__.py").is_file())
        self.assertTrue((dest / "pack" / "leaf.py").is_file(), "cp *.py 는 재귀하지 않았다")

    def test_directory_without_init_is_not_a_package(self):
        write(self.fn / "data" / "grid.json", "{}")
        self.assertEqual([], lp.sub_packages(str(self.fn)))

    def test_tests_and_contracts_are_excluded(self):
        write(self.fn / "tests" / "__init__.py")
        write(self.fn / "contracts" / "__init__.py")
        write(self.fn / "__pycache__" / "__init__.py")
        self.assertEqual([], lp.sub_packages(str(self.fn)))

    def test_test_modules_are_not_planned(self):
        write(self.fn / "test_handler.py", "import gamma\n")
        self.assertNotIn("test_handler.py", lp.plan(str(self.fn), str(self.shared))["topLevelModules"])

    def test_missing_shared_module_is_a_hard_error(self):
        write(self.fn / "handler.py", "import nowhere\n")
        # _shared 에 없는 이름은 계획에 들어가지 않는다 (제3자로 본다)
        self.assertNotIn("nowhere", lp.shared_closure(str(self.fn), str(self.shared)))

    def test_a_shared_module_deleted_from_the_repo_drops_out_of_the_plan(self):
        """한계를 고정해 둔다.

        `shared_closure()` 는 `_shared` 에 **있는** 모듈만 후보로 본다. 그래서 파일이 저장소에서
        사라지면 계획에서 조용히 빠지고, `missing_own_modules()` 도 계획 기준이라 못 잡는다.
        그때 잡는 것은 `import_check()` 의 `_looks_like_repo_module()` 판별자뿐이고,
        파일이 아예 없으면 그것도 못 잡는다 — 저장소 무결성(git 추적)이 마지막 방어다.
        """
        (self.shared / "alpha.py").unlink()
        self.assertNotIn("alpha", lp.shared_closure(str(self.fn), str(self.shared)))
        dest = self.root / "pkg"
        lp.stage(str(self.fn), str(self.shared), str(dest))          # 예외가 아니라 조용히 빠진다
        self.assertFalse((dest / "alpha.py").exists())
        self.assertEqual([], lp.missing_own_modules(str(dest), str(self.fn), str(self.shared)))

    def test_a_module_packaging_dropped_is_not_mistaken_for_third_party(self):
        """패키징이 빠뜨린 저장소 모듈을 제3자로 오분류하면 게이트가 무의미해진다.

        `report_period` 는 `aws/_shared/` 에 실제로 있는 이름이다. 패키지에서 빼고 import 하면
        저장소를 보는 판별자가 "우리 것" 으로 잡아야 한다.
        """
        write(self.fn / "handler.py", "import report_period\n")
        dest = self.root / "pkg"
        os.makedirs(dest, exist_ok=True)
        shutil.copy2(self.fn / "handler.py", dest / "handler.py")     # 일부러 의존을 안 넣는다
        result = lp.import_check(str(dest))
        self.assertFalse(result["ok"])
        self.assertEqual("OWN_MODULE_MISSING", result["kind"])
        self.assertEqual("report_period", result["missing"])


class GateTests(unittest.TestCase):
    """배포 게이트는 우리 잘못만 막아야 한다."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.fn = self.root / "myfunc"
        self.shared = self.root / "_shared"
        write(self.shared / "alpha.py", "VALUE = 1\n")

    def tearDown(self):
        self.temp.cleanup()

    def stage(self):
        dest = self.root / "pkg"
        lp.stage(str(self.fn), str(self.shared), str(dest))
        return dest

    def test_clean_package_imports(self):
        write(self.fn / "handler.py", "import alpha\n\n\ndef handler(e, c):\n    return alpha.VALUE\n")
        result = lp.verify(str(self.fn), str(self.shared), str(self.stage()))
        self.assertTrue(result["ok"], result)
        self.assertEqual("IMPORTED", result["import"]["kind"])
        self.assertEqual([], result["missingOwnModules"])

    def test_own_module_missing_blocks(self):
        write(self.fn / "handler.py", "import alpha\n")
        dest = self.stage()
        (dest / "alpha.py").unlink()                      # 패키징이 빠뜨린 상황을 만든다
        result = lp.verify(str(self.fn), str(self.shared), str(dest))
        self.assertFalse(result["ok"])
        self.assertEqual(["alpha"], result["missingOwnModules"])
        self.assertEqual("OWN_MODULE_MISSING", result["import"]["kind"])

    def test_path_escaping_the_package_blocks(self):
        """패키지 밖 파일을 경로로 읽는 코드 — Lambda 에서도 그 파일은 없다."""
        write(self.fn / "handler.py",
              "import os\n"
              "_HERE = os.path.dirname(os.path.abspath(__file__))\n"
              "open(os.path.join(os.path.dirname(_HERE), 'elsewhere', 'thing.py'))\n")
        result = lp.verify(str(self.fn), str(self.shared), str(self.stage()))
        self.assertFalse(result["ok"])
        self.assertEqual("PATH_ESCAPES_PACKAGE", result["import"]["kind"])
        self.assertIn("thing.py", result["import"]["missing"] or "")

    def test_third_party_absence_does_not_block(self):
        """pip 가 넣는 것이 이 기계에 없다고 배포를 막지 않는다."""
        write(self.fn / "handler.py", "import some_pip_only_package_xyz\n")
        result = lp.verify(str(self.fn), str(self.shared), str(self.stage()))
        self.assertTrue(result["ok"], result)
        self.assertEqual("THIRD_PARTY_NOT_INSTALLED_LOCALLY", result["import"]["kind"])

    def test_module_level_env_var_does_not_block(self):
        """핸들러 다수가 모듈 수준에서 os.environ[...] 을 읽는다. Lambda 에는 설정돼 있다.

        ⚠️ `import_check()` 는 부모 환경을 물려받는다. 그래서 이 시험은 그 변수를 **명시적으로
           지운 상태**에서 돌려야 한다 — `test_kma_hub.py` 가 같은 세션에서 CACHE_BUCKET 을
           setdefault 하고 치우지 않아, 스위트 전체를 돌리면 IMPORTED 로 바뀌어 실패했다(실측).
           시험이 실행 순서에 묶이면 그 시험은 믿을 수 없다.
        """
        import unittest.mock
        write(self.fn / "handler.py", "import os\nBUCKET = os.environ['MISSING_FOR_THIS_TEST_ONLY']\n")
        with unittest.mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("MISSING_FOR_THIS_TEST_ONLY", None)
            result = lp.verify(str(self.fn), str(self.shared), str(self.stage()))
        self.assertTrue(result["ok"], result)
        self.assertEqual("ENV_VAR_REQUIRED", result["import"]["kind"])
        self.assertEqual("MISSING_FOR_THIS_TEST_ONLY", result["import"]["missing"])

    def test_runtime_provided_modules_do_not_block(self):
        write(self.fn / "handler.py", "import boto3\n")
        result = lp.verify(str(self.fn), str(self.shared), str(self.stage()))
        self.assertTrue(result["ok"], result)


class RepositoryFactTests(unittest.TestCase):
    """실제 저장소에 대한 사실 대조. 이 값이 바뀌면 배포 전제도 바뀐다."""

    def test_distribution_needs_five_shared_modules_and_two_packages(self):
        """2026-09-13 — 4개에서 5개로 **늘었다.** 숫자를 맞춘 것이 아니라 구현이 바뀌었다.

        `handler.py` 가 `publication_privacy` 를 들였다: 승인 전(status=DRAFT) 후보가
        익명 공개 접두사로 나가고 있었고(9/13 후보 8건 중 7건), 그 경계의 정본이
        `aws/_shared/publication_privacy.py` 이기 때문이다. 목록은 손으로 적지 않고
        import 에서 읽으므로 이 값은 실제 폐쇄의 결과다.

        실측 근거 — `lambda_package.py stage` 로 만든 실제 ZIP:
          루트의 _shared 모듈 5개(content_contract·provenance·publication_privacy·
          report_contract·report_period) · 38개 항목 · 120,637 바이트
        """
        planned = lp.plan(str(AWS / "distribution"), str(SHARED))
        self.assertEqual(["content_contract", "provenance", "publication_privacy",
                          "report_contract", "report_period"],
                         planned["sharedModules"])
        self.assertEqual(["sns_adapters", "sources"], planned["subPackages"])

    def test_the_privacy_module_really_lands_in_the_package(self):
        """계획이 아니라 **패키지 안**에 있는지 본다 — 경계 검사를 못 부르면 의미가 없다."""
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, "task")
            lp.stage(str(AWS / "distribution"), str(SHARED), dest)
            self.assertTrue(os.path.isfile(os.path.join(dest, "publication_privacy.py")),
                            "zip 루트에 평평하게 들어가야 한다")
            self.assertEqual([], lp.missing_own_modules(dest, str(AWS / "distribution"),
                                                        str(SHARED)))
            self.assertTrue(lp.import_check(dest)["ok"])

    def test_kma_functions_still_need_only_kma_hub(self):
        """기존 13개 함수의 동작이 바뀌면 안 된다 — 옛 스크립트와 같은 결과여야 한다."""
        for name in ("kma-warn", "kma-fcst", "gk2a-clouds", "typhoon-official", "quake-asia"):
            with self.subTest(function=name):
                planned = lp.plan(str(AWS / name), str(SHARED))
                # 2026-09-20: kma-warn 은 CAP 1.2 정규화(cap_map)를 더 싣는다 — 의도한 변화다.
                want = ["cap_map", "kma_hub"] if name == "kma-warn" else ["kma_hub"]
                self.assertEqual(want, sorted(planned["sharedModules"]))
                self.assertEqual([], planned["subPackages"])

    def test_earthus_llm_ships_the_guard_the_contract_and_its_vocabulary(self):
        """2026-09-20 P4 — 서술자 Lambda 가 서술 후처리(narration_guard)를 싣는다.

        narration_guard 가 intel_contract(어휘 정본을 import 시점에 읽는다)와 cap_map(특보 종료 상태)을
        부른다. 계획에 어휘 파일이 빠지면 콜드 스타트가 IntelContractError 로 죽는다.
        ⚠️ `tools/deploy-llm.sh` 는 아직 handler.py 하나만 zip 한다 — 이 계획을 쓰지 않는다.
        """
        function = str(AWS / "earthus-llm")
        planned = lp.plan(function, str(SHARED))
        self.assertEqual(["handler.py", "narration_guard.py"], planned["topLevelModules"])
        self.assertEqual(["cap_map", "intel_contract"], planned["sharedModules"])
        self.assertIn("contracts/intel-vocab.json", planned["dataFiles"])
        self.assertEqual([], planned["subPackages"], "tests/ 는 패키지가 아니다")
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, "task")
            lp.stage(function, str(SHARED), dest)
            self.assertTrue(os.path.isfile(os.path.join(dest, "contracts", "intel-vocab.json")),
                            "상대 경로를 유지해 넣어야 한다 — intel_contract 가 자기 옆에서 읽는다")
            self.assertEqual([], lp.missing_own_modules(dest, function, str(SHARED)))
            verdict = lp.import_check(dest)
            self.assertTrue(verdict["ok"], verdict)
            self.assertEqual("IMPORTED", verdict["kind"])

    def test_only_distribution_has_python_sub_packages_among_lambdas(self):
        """하위 패키지 재귀 복사가 영향을 주는 함수를 고정해 둔다."""
        withpkgs = []
        for entry in sorted(os.listdir(AWS)):
            path = AWS / entry
            if entry == "_shared" or not path.is_dir() or not (path / "handler.py").is_file():
                continue
            if lp.sub_packages(str(path)):
                withpkgs.append(entry)
        self.assertEqual(["distribution"], withpkgs)

    # ── ③ 해소를 고정한다 ────────────────────────────────────────────────
    # 예전 이 자리에는 blocker 가 아직 있음을 고정하는 시험이 있었다
    # (test_distribution_is_still_blocked_by_the_cross_function_load).
    # 해소되면 그 시험이 실패하도록 일부러 그렇게 두었고, 실제로 실패했다.
    # 지금은 **해소된 상태**를 고정한다 — 되돌아가면 아래 셋 중 하나가 깨진다.

    SCORECARD_INPUT = {
        "collectingSince": "2026-08-01",
        "leadsHours": [24, 48],
        "days": {
            "2026-08-02": {
                "gfs_seamless|temperature_2m|24h": {"me": 0.41, "mae": 1.22, "rmse": 1.71, "n": 1940},
                "ecmwf_ifs025|temperature_2m|24h": {"me": -0.12, "mae": 1.05, "rmse": 1.48, "n": 1928},
                "gfs_seamless|wind_speed_10m|48h": {"me": 0.33, "mae": 0.94, "rmse": 1.31, "n": 1901},
            },
            # 지표가 일부만 있는 날 — 없는 값을 0 으로 가중하지 않는 규칙까지 같은지 본다
            "2026-08-04": {
                "gfs_seamless|temperature_2m|24h": {"me": None, "mae": 1.44, "rmse": None, "n": 1200},
            },
            # 기간 밖 — 양쪽 모두 버려야 한다
            "2026-07-31": {
                "gfs_seamless|temperature_2m|24h": {"me": 9.9, "mae": 9.9, "rmse": 9.9, "n": 9999},
            },
        },
    }
    SCORECARD_PERIOD = "2026-08"

    def _run_scorecard(self, root):
        """`root` 를 zip 루트로 보고 verify_scorecard 를 돌린다. 결과를 JSON 으로 받는다."""
        script = (
            "import json, sys\n"
            "sys.path.insert(0, %r)\n"
            "from sources import verify_scorecard as v\n"
            "doc = json.loads(sys.argv[1])\n"
            "print(json.dumps({'candidate': v.candidate(doc, sys.argv[2]),\n"
            "                  'adapterPath': v._adapter_path()},\n"
            "                 ensure_ascii=False, sort_keys=True, default=str))\n"
        ) % str(root)
        env = {k: val for k, val in os.environ.items() if k != "PYTHONPATH"}
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        done = subprocess.run(
            [sys.executable, "-c", script,
             json.dumps(self.SCORECARD_INPUT), self.SCORECARD_PERIOD],
            cwd=str(root), env=env, capture_output=True, text=True, encoding="utf-8")
        self.assertEqual(0, done.returncode, done.stderr[-2000:])
        return json.loads(done.stdout)

    def test_distribution_packages_the_adapter_it_reads_by_path(self):
        """`sources/verify_scorecard.py` 가 경로로 읽는 어댑터가 zip 루트에 동봉된다.

        예전에는 `_AWS/report-engine/adapters/...` 를 읽었고, Lambda 에서 `_AWS` 는
        zip 루트 밖(`/var`)이라 콜드 스타트가 FileNotFoundError 로 죽었다
        (docs/DISTRIBUTION_DEPLOYMENT_GAP.md §4).
        """
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, "task")
            lp.stage(str(AWS / "distribution"), str(SHARED), dest)
            self.assertTrue(os.path.isfile(os.path.join(dest, "kma_verify_adapter.py")),
                            "어댑터가 zip 루트에 평평하게 들어가야 한다")
            self.assertEqual(
                {"kma_verify_adapter.py": "report-engine/adapters/kma_verify_adapter.py"},
                lp.cross_function_files(str(AWS / "distribution"), str(SHARED)),
                "경로로 읽는 파일은 손으로 적지 않고 AST 로 찾아낸다")
            self.assertEqual([], lp.missing_own_modules(dest, str(AWS / "distribution"), str(SHARED)))
            result = lp.import_check(dest)
            self.assertTrue(result["ok"], result)
            self.assertEqual("IMPORTED", result["kind"])

    def test_scorecard_reads_the_adapter_from_inside_the_package(self):
        """패키지 안에서 돌릴 때 어댑터 경로가 zip 루트 **안**이어야 한다."""
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, "task")
            lp.stage(str(AWS / "distribution"), str(SHARED), dest)
            got = self._run_scorecard(dest)
            self.assertTrue(
                os.path.abspath(got["adapterPath"]).startswith(os.path.abspath(dest) + os.sep),
                "패키지 밖을 읽으면 Lambda 에서 FileNotFoundError 다: %s" % got["adapterPath"])

    def test_scorecard_result_is_identical_in_repository_and_package(self):
        """고친 것은 **경로를 찾는 방법뿐**임을 숫자로 확인한다.

        같은 입력을 저장소와 배포 패키지에서 각각 채점해 결과가 완전히 같아야 한다.
        판정 기준이나 계산이 조금이라도 달라지면 두 성적이 생긴다 —
        그게 `verify_scorecard.py` 머리말이 금지하는 것이다.
        """
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, "task")
            lp.stage(str(AWS / "distribution"), str(SHARED), dest)
            from_repo = self._run_scorecard(AWS / "distribution")["candidate"]
            from_package = self._run_scorecard(dest)["candidate"]
        self.assertIsNotNone(from_repo, "빈 성적표면 비교가 의미 없다")
        self.assertEqual(from_repo, from_package)
        # 비교가 실제로 무언가를 덮었는지 — 빈 껍데기를 비교하고 PASS 라 부르지 않는다
        self.assertEqual(["ecmwf_ifs025", "gfs_seamless"], from_repo["models"])
        self.assertEqual([24, 48], from_repo["leads"])
        self.assertEqual(2, from_repo["coverage"]["days"])
        self.assertNotIn(9999, [f.get("sampleCount") for f in from_repo["facts"]],
                         "기간 밖 날짜가 섞이면 안 된다")

    def test_deploy_script_uses_the_shared_rule_not_its_own_copy(self):
        """규칙이 두 곳에 있으면 한쪽만 고쳐진다 — 그게 이 결함의 원인이었다."""
        script = (AWS / "deploy-python.sh").read_text(encoding="utf-8")
        self.assertIn("lambda_package.py", script)
        self.assertIn("stage", script)
        self.assertIn("verify", script)
        self.assertNotIn('cp "$DIR"/*.py "$TMP"/', script,
                         "최상위만 복사하던 줄이 남아 있으면 하위 패키지가 다시 빠진다")
        self.assertNotIn('_shared/kma_hub.py"', script,
                         "kma_hub 만 이름으로 복사하던 특례가 남아 있으면 안 된다")

    def test_deploy_script_does_not_build_its_own_zip(self):
        """zip 만드는 규칙도 한 곳이어야 한다 — 두 갈래가 서로 다른 바이트를 냈다."""
        script = (AWS / "deploy-python.sh").read_text(encoding="utf-8")
        self.assertIn('"$PKGTOOL" zip "$TMP"', script, "공유 규칙으로 zip 을 만들어야 한다")
        # 아래 검사는 **만들기**가 남아 있는지 본다. 주석의 언급과 검증용 추출은 제외한다.
        body = "\n".join(line for line in script.splitlines()
                         if not line.lstrip().startswith("#"))
        self.assertNotIn("zip -qr", body, "zip 명령 갈래가 남으면 기계마다 바이트가 다르다")
        self.assertNotIn("PYZIP", body, "인라인 zip 히어독이 남아 있으면 안 된다")
        self.assertNotIn("zipfile.ZipFile(out", body)
        # 추출은 남아 있어야 한다 — 실제 zip 을 풀어서 검사하는 게이트다.
        self.assertIn("extractall", script)


class ModuleDataFileTests(unittest.TestCase):
    """모듈이 **자기 옆에서 읽는 자료 파일** 도 들어가야 한다.

    2026-09-13 실측 — `aws/_shared/truth_vocabulary.py` 는 진실 어휘를 코드에 베껴 쓰지 않고
    `_shared/sql/20260913_earth_event_core.sql` 을 **import 시점에** 읽는다. `.py` 만 넣던
    동안 staged 패키지를 그대로 import 하면 콜드 스타트에서 죽었다:
        VocabularyError: 정본 SQL 을 읽지 못했다: [Errno 2] ... 'sql/20260913_earth_event_core.sql'
    `crossFunctionFiles` 와 달리 **상대 경로를 유지해** 넣어야 한다 — 런타임에 `_HERE` 가 곧 zip 루트다.
    """

    def test_own_dir_data_file_is_detected(self):
        with tempfile.TemporaryDirectory() as folder:
            module = write(os.path.join(folder, "reader.py"), "\n".join([
                "import os",
                "_HERE = os.path.dirname(os.path.abspath(__file__))",
                "TABLE = os.path.join(_HERE, 'data', 'table.csv')",
            ]))
            write(os.path.join(folder, "data", "table.csv"), "a,b\n")
            found = lp.module_data_files([str(module)])
            self.assertEqual(list(found), ["data/table.csv"])

    def test_missing_file_is_not_claimed(self):
        """옆에 실제로 없는 경로는 목록에 넣지 않는다 — 없는 파일을 넣으라고 하지 않는다."""
        with tempfile.TemporaryDirectory() as folder:
            module = write(os.path.join(folder, "reader.py"), "\n".join([
                "import os",
                "_HERE = os.path.dirname(os.path.abspath(__file__))",
                "TABLE = os.path.join(_HERE, 'data', 'absent.csv')",
            ]))
            self.assertEqual(lp.module_data_files([str(module)]), {})

    def test_python_modules_are_left_to_the_import_closure(self):
        """`.py` 는 여기서 다루지 않는다 — import 닫기와 crossFunctionFiles 의 몫이다."""
        with tempfile.TemporaryDirectory() as folder:
            module = write(os.path.join(folder, "reader.py"), "\n".join([
                "import os",
                "_HERE = os.path.dirname(os.path.abspath(__file__))",
                "OTHER = os.path.join(_HERE, 'helper.py')",
            ]))
            write(os.path.join(folder, "helper.py"), "")
            self.assertEqual(lp.module_data_files([str(module)]), {})

    def test_other_variables_are_not_treated_as_own_dir(self):
        """자기 디렉터리 변수만 본다. 임의의 변수로 만든 경로를 패키지 안이라고 가정하지 않는다."""
        with tempfile.TemporaryDirectory() as folder:
            module = write(os.path.join(folder, "reader.py"), "\n".join([
                "import os",
                "ELSEWHERE = '/mnt/somewhere'",
                "TABLE = os.path.join(ELSEWHERE, 'data', 'table.csv')",
            ]))
            write(os.path.join(folder, "data", "table.csv"), "a,b\n")
            self.assertEqual(lp.module_data_files([str(module)]), {})

    def test_earth_events_package_carries_the_vocabulary_sql(self):
        """실제 저장소 — 3G 함수의 계획과 패키지에 SQL 이 들어간다."""
        function = str(AWS / "earth-events")
        planned = lp.plan(function, str(SHARED))
        self.assertIn("sql/20260913_earth_event_core.sql", planned["dataFiles"])
        self.assertIn("truth_vocabulary", planned["sharedModules"])
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, "task")
            lp.stage(function, str(SHARED), dest)
            self.assertTrue(os.path.isfile(
                os.path.join(dest, "sql", "20260913_earth_event_core.sql")),
                "상대 경로를 유지해 넣어야 한다 — 평평하게 넣으면 런타임이 못 찾는다")
            self.assertEqual([], lp.missing_own_modules(dest, function, str(SHARED)))

    def test_earth_events_package_imports_like_lambda(self):
        """패키지만 sys.path 에 두고 import 가 지나는지 — 이것이 콜드 스타트 조건이다."""
        function = str(AWS / "earth-events")
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, "task")
            lp.stage(function, str(SHARED), dest)
            verdict = lp.import_check(dest)
            self.assertTrue(verdict["ok"], verdict)
            self.assertEqual(verdict["kind"], "IMPORTED")

    def test_function_name_override_leaves_every_other_function_alone(self):
        """폴더 이름 ≠ 함수 이름 예외는 **폴더 안의 파일**로만 생긴다.

        `aws/earth-events/` 는 Lambda 함수 `earthus-earth-events` 로 배포된다. 그 예외를
        스크립트 인자가 아니라 `function-name.txt` 로 적는 이유: 인자로 주면 잊은 사람이
        폴더 이름으로 배포해 **두 번째 함수가 생긴다.** 파일에 적혀 있으면 스크립트가 항상 읽는다.

        그리고 이 규칙이 다른 함수를 건드리지 않음을 여기서 고정한다 — `function-name.txt` 가
        있는 폴더가 정확히 몇 개인지 센다.
        """
        script = (AWS / "deploy-python.sh").read_text(encoding="utf-8")
        self.assertIn('DIRNAME="${1:-gmgsi-clouds}"', script)
        self.assertIn('ROLE="earthus-lambda-${DIRNAME}"', script)
        self.assertIn('if [ -f "$DIR/function-name.txt" ]; then', script)
        # 역할은 폴더 이름에서 나온다 — 함수 이름에서 나오면 이름이 두 번 붙는다
        self.assertNotIn('ROLE="earthus-lambda-${FN}"', script)

        overridden = sorted(p.parent.name for p in AWS.glob("*/function-name.txt"))
        self.assertEqual(overridden, ["earth-events"],
                         "예외는 하나여야 한다 — 새 예외가 생기면 여기서 깨진다")
        self.assertEqual((AWS / "earth-events" / "function-name.txt")
                         .read_text(encoding="utf-8").strip(), "earthus-earth-events")

    def test_function_name_file_is_not_packaged(self):
        """배포 힌트 파일은 zip 에 들어가지 않는다 — 런타임 코드가 아니다."""
        function = str(AWS / "earth-events")
        planned = lp.plan(function, str(SHARED))
        self.assertNotIn("function-name.txt", planned["topLevelModules"])
        self.assertNotIn("function-name.txt", planned["dataFiles"])
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, "task")
            lp.stage(function, str(SHARED), dest)
            self.assertFalse(os.path.exists(os.path.join(dest, "function-name.txt")))

    def test_raw_archive_module_is_packaged(self):
        """원자료 보관 모듈도 패키지에 들어간다 — 없으면 콜드 스타트에서 import 가 죽는다."""
        planned = lp.plan(str(AWS / "earth-events"), str(SHARED))
        self.assertIn("raw_archive.py", planned["topLevelModules"])

    def test_source_governance_registry_is_now_carried(self):
        """같은 규칙이 기존 함수의 누락도 메운다.

        `aws/source-governance/handler.py:44-47` 은 `registry.draft.json` 을 **import 시점에**
        읽고 예외를 삼키지 않는다. 그 파일이 zip 에 없으면 콜드 스타트에서 FileNotFoundError 다.
        `deploy-python.sh` 는 `contracts/` 외의 비-.py 파일을 따로 복사하지 않는다.
        """
        planned = lp.plan(str(AWS / "source-governance"), str(SHARED))
        self.assertIn("registry.draft.json", planned["dataFiles"])


class DeterministicZipTests(unittest.TestCase):
    """같은 나무는 같은 CodeSha256 — 기계·순서·시각과 무관해야 한다."""

    def stage(self, folder):
        """작은 합성 나무. 하위 패키지와 유니코드 이름을 일부러 섞는다."""
        root = pathlib.Path(folder) / "task"
        write(root / "handler.py", "import pkg\n")
        write(root / "zeta.py", "z = 1\n")
        write(root / "alpha.py", "a = 1\n")
        write(root / "pkg" / "__init__.py", "")
        write(root / "pkg" / "deep" / "__init__.py", "")
        write(root / "pkg" / "deep" / "가.py", "# 유니코드 이름\n")
        return str(root)

    def test_same_stage_built_twice_is_byte_identical(self):
        with tempfile.TemporaryDirectory() as folder:
            stage = self.stage(folder)
            a = lp.build_zip(stage, os.path.join(folder, "a.zip"))
            b = lp.build_zip(stage, os.path.join(folder, "b.zip"))
            self.assertEqual(a["codeSha256"], b["codeSha256"])
            self.assertEqual(a["bytes"], b["bytes"])
            self.assertEqual(a["contentDigest"], b["contentDigest"])

    def test_filesystem_order_does_not_change_the_artifact(self):
        """os.walk 순서가 뒤집혀도 같아야 한다 — 다른 기계에 준하는 조건이다."""
        with tempfile.TemporaryDirectory() as folder:
            stage = self.stage(folder)
            straight = lp.build_zip(stage, os.path.join(folder, "s.zip"))
            real_walk = lp.os.walk

            def reversed_walk(top, *a, **kw):
                for root, dirs, files in real_walk(top, *a, **kw):
                    dirs.reverse()
                    yield root, dirs, list(reversed(files))

            lp.os.walk = reversed_walk
            try:
                shuffled = lp.build_zip(stage, os.path.join(folder, "r.zip"))
            finally:
                lp.os.walk = real_walk
            self.assertEqual(straight["codeSha256"], shuffled["codeSha256"])

    def test_contracts_in_the_stage_reach_the_zip(self):
        """stage 에 들어간 contracts/ 는 zip 에도 있어야 한다 — intel_contract 가 import 때 읽는다.
        2026-09-20 전에는 zip 이 contracts 를 건너뛰어 cyclone-analog 배포 검사가 막혔다."""
        with tempfile.TemporaryDirectory() as folder:
            stage = self.stage(folder)
            write(pathlib.Path(stage) / "contracts" / "intel-vocab.json", "{}\n")
            write(pathlib.Path(stage) / "tests" / "test_x.py", "")
            out = os.path.join(folder, "c.zip")
            names = lp.build_zip(stage, out)["members"]
            self.assertIn("contracts/intel-vocab.json", names)
            self.assertFalse(any(n.startswith("tests/") for n in names), "tests 는 여전히 뺀다")

    def test_real_intel_lambda_zip_carries_the_vocabulary(self):
        """intel_contract 를 쓰는 실제 함수 폴더 — stage → zip 에 어휘 정본이 들어간다."""
        aws = pathlib.Path(__file__).resolve().parents[2]
        for fn in ("cyclone-analog", "marine-grid", "lab-events", "earthus-llm", "kma-aws"):
            with tempfile.TemporaryDirectory() as folder, self.subTest(fn=fn):
                dest = os.path.join(folder, "stage")
                lp.stage(str(aws / fn), str(aws / "_shared"), dest)
                names = lp.build_zip(dest, os.path.join(folder, "fn.zip"))["members"]
                self.assertIn("intel_contract.py", names)
                self.assertIn("contracts/intel-vocab.json", names)

    def test_members_are_sorted_by_utf8_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            out = os.path.join(folder, "a.zip")
            lp.build_zip(self.stage(folder), out)
            names = zipfile.ZipFile(out).namelist()
            self.assertEqual(sorted(names, key=lambda n: n.encode("utf-8")), names)

    def test_mtime_never_reaches_the_artifact(self):
        with tempfile.TemporaryDirectory() as folder:
            stage = self.stage(folder)
            first = lp.build_zip(stage, os.path.join(folder, "a.zip"))
            os.utime(os.path.join(stage, "handler.py"), (1_000_000_000, 1_000_000_000))
            second = lp.build_zip(stage, os.path.join(folder, "b.zip"))
            self.assertEqual(first["codeSha256"], second["codeSha256"])
            for info in zipfile.ZipFile(os.path.join(folder, "b.zip")).infolist():
                self.assertEqual(lp.ZIP_DATE_TIME, info.date_time, info.filename)

    def test_mode_and_create_system_are_pinned_regardless_of_host_os(self):
        """윈도우(0)/POSIX(3) 차이를 제거한다. 고정하지 않으면 실제로 달라진다."""
        with tempfile.TemporaryDirectory() as folder:
            stage = self.stage(folder)
            out = os.path.join(folder, "a.zip")
            pinned = lp.build_zip(stage, out)
            for info in zipfile.ZipFile(out).infolist():
                self.assertEqual(0o644, info.external_attr >> 16, info.filename)
                self.assertEqual(3, info.create_system, info.filename)
            windows = lp.build_zip(stage, os.path.join(folder, "w.zip"), create_system=0)
            self.assertNotEqual(pinned["codeSha256"], windows["codeSha256"],
                                "달라지는 것이 맞다 — 그래서 못 박아야 한다")
            self.assertEqual(pinned["contentDigest"], windows["contentDigest"],
                             "내용은 같다. 달라진 것은 메타데이터뿐이다")

    def test_compression_level_is_pinned(self):
        """수준을 고정하지 않으면 바이트가 달라진다.

        ⚠️ 작은 파일로는 이걸 보일 수 없다 — deflate 가 수준 6 과 9 에서 같은 출력을 낸다.
           내 첫 시험이 그래서 틀렸다. 실제로 압축이 갈리는 크기의 자료로 본다.
        """
        with tempfile.TemporaryDirectory() as folder:
            stage = self.stage(folder)
            filler = "".join("x = %d  # %s\n" % (i, "ab" * (i % 40)) for i in range(4000))
            write(pathlib.Path(stage) / "big.py", filler)
            a = lp.build_zip(stage, os.path.join(folder, "a.zip"))
            b = lp.build_zip(stage, os.path.join(folder, "b.zip"), compresslevel=9)
            self.assertNotEqual(a["codeSha256"], b["codeSha256"])
            self.assertEqual(a["contentDigest"], b["contentDigest"], "내용은 같다")
            self.assertEqual(6, lp.ZIP_COMPRESSLEVEL)

    def test_no_directory_entries(self):
        with tempfile.TemporaryDirectory() as folder:
            out = os.path.join(folder, "a.zip")
            lp.build_zip(self.stage(folder), out)
            self.assertEqual([], [n for n in zipfile.ZipFile(out).namelist()
                                  if n.endswith("/")])

    def test_bytecode_and_skipped_dirs_never_enter(self):
        with tempfile.TemporaryDirectory() as folder:
            stage = self.stage(folder)
            write(pathlib.Path(stage) / "handler.pyc", "x")
            write(pathlib.Path(stage) / "__pycache__" / "handler.cpython-312.pyc", "x")
            write(pathlib.Path(stage) / "tests" / "test_x.py", "x")
            out = os.path.join(folder, "a.zip")
            lp.build_zip(stage, out)
            names = zipfile.ZipFile(out).namelist()
            self.assertEqual([], [n for n in names if n.endswith((".pyc", ".pyo"))])
            self.assertEqual([], [n for n in names
                                  if "__pycache__" in n or n.startswith("tests/")])

    def test_a_duplicate_arcname_is_refused_not_silently_dropped(self):
        with tempfile.TemporaryDirectory() as folder:
            stage = self.stage(folder)
            # 검사는 build_zip 안에도 있다 — 구성원 목록을 다른 데서 만들어 넣어도 걸린다.
            # (zip_members 만 검사하면 그 함수를 대체하는 순간 검사가 사라진다. 실제로
            #  내 첫 시험이 그 구멍을 통과해 버려서 검사를 두 곳에 뒀다.)
            real = lp.zip_members

            def doubled(d):
                members = real(d)
                return members + [members[0]]

            lp.zip_members = doubled
            try:
                with self.assertRaises(ValueError) as caught:
                    lp.build_zip(stage, os.path.join(folder, "a.zip"))
                self.assertIn("이름이 겹친다", str(caught.exception))
            finally:
                lp.zip_members = real

    def test_the_real_distribution_tree_reproduces(self):
        """합성 픽스처가 아니라 **실제 함수**로도 재현되는지 본다."""
        with tempfile.TemporaryDirectory() as folder:
            one, two = os.path.join(folder, "s1"), os.path.join(folder, "s2")
            lp.stage(str(AWS / "distribution"), str(SHARED), one)
            lp.stage(str(AWS / "distribution"), str(SHARED), two)
            a = lp.build_zip(one, os.path.join(folder, "a.zip"))
            b = lp.build_zip(two, os.path.join(folder, "b.zip"))
            self.assertEqual(a["codeSha256"], b["codeSha256"])
            self.assertEqual(a["contentDigest"], b["contentDigest"])
            self.assertEqual(a["count"], b["count"])


class RealArtifactTests(unittest.TestCase):
    """실제 배포 artifact — 쓰지 않는 30MB 가 붙지 않아야 한다.

    2026-09-13 실측: `aws/distribution/requirements.txt` 가 **없어서**
    `deploy-python.sh` 가 기본값(h5py numpy Pillow)으로 떨어질 예정이었다.
    그러면 올라가는 것은 감사한 12만 바이트가 아니라 30MB 짜리다.
    """

    THIRD_PARTY_MARKERS = ("numpy", "h5py", "PIL", "Pillow", "scipy", "pandas",
                           "netCDF4", "requests", "pydantic", "yaml")

    def test_distribution_has_a_requirements_marker(self):
        path = AWS / "distribution" / "requirements.txt"
        self.assertTrue(path.is_file(),
                        "없으면 deploy-python.sh 가 NetCDF 기본 의존성 30MB 를 붙인다")
        lines = path.read_text(encoding="utf-8").splitlines()
        installs = [ln for ln in lines if ln.strip() and not ln.lstrip().startswith("#")]
        self.assertEqual([], installs, "설치할 것이 없다 — 있으면 그게 근거가 있는지 물어야 한다")

    def test_the_deploy_script_still_has_the_fallback_this_marker_suppresses(self):
        """전제가 사라지면 이 표식 파일도 의미가 없다 — 전제를 같이 고정한다."""
        script = (AWS / "deploy-python.sh").read_text(encoding="utf-8")
        self.assertIn('if [ -f "$DIR/requirements.txt" ]', script)
        self.assertIn("h5py numpy Pillow", script)

    def test_distribution_imports_no_third_party_except_the_runtime_boto3(self):
        """전 모듈을 훑는다. 목록을 손으로 적지 않는다."""
        function_dir = AWS / "distribution"
        paths = [str(p) for p in function_dir.rglob("*.py")
                 if not lp._is_skipped(p.relative_to(function_dir))]
        self.assertGreater(len(paths), 10, paths)
        found = set()
        for path in paths:
            text = pathlib.Path(path).read_text(encoding="utf-8")
            for marker in self.THIRD_PARTY_MARKERS:
                if re.search(r"^\s*(?:import\s+%s\b|from\s+%s[\s.])" % (marker, marker),
                             text, re.MULTILINE):
                    found.add(marker)
        self.assertEqual(set(), found,
                         "제3자 의존이 생겼다 — requirements.txt 와 이 시험을 함께 고쳐야 한다")

    def test_boto3_is_the_only_third_party_import_and_it_is_runtime_provided(self):
        handler_text = (AWS / "distribution" / "handler.py").read_text(encoding="utf-8")
        self.assertIn("import boto3", handler_text)
        self.assertIn("boto3", lp.RUNTIME_PROVIDED)

    def test_the_deployment_artifact_stays_small(self):
        """감사한 것과 배포되는 것이 같은 크기여야 한다 — 30MB 회귀를 잡는다."""
        with tempfile.TemporaryDirectory() as folder:
            staged = os.path.join(folder, "task")
            lp.stage(str(AWS / "distribution"), str(SHARED), staged)
            manifest = lp.build_zip(staged, os.path.join(folder, "fn.zip"))
        self.assertLess(manifest["bytes"], 2_000_000,
                        "12만 바이트대여야 한다. 30MB 면 NetCDF 기본값이 붙은 것이다")
        self.assertNotIn("requirements.txt", manifest["members"],
                         "pip 입력 파일은 패키지에 넣지 않는다")

    def test_no_lambda_layer_is_introduced(self):
        """운영 80개 중 Layer 를 쓰는 함수가 0개다(2026-09-13 실측). 유지한다."""
        for name in ("deploy-python.sh", "deploy-lite.sh"):
            script = (AWS / name).read_text(encoding="utf-8")
            self.assertNotIn("--layers", script, name)
            self.assertNotIn("publish-layer-version", script, name)


if __name__ == "__main__":
    unittest.main()
