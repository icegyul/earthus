# -*- coding: utf-8 -*-
"""Lambda 패키지 구성 규칙 시험 — docs/DISTRIBUTION_DEPLOYMENT_GAP.md

AWS 가 필요 없다. 합성 픽스처로 규칙을 검사하고, 실제 저장소에는 몇 가지 사실만 대조한다.

이 시험이 지키는 것
  ① 목록을 손으로 적지 않는다 — import 를 읽어서 정한다 (그게 kma_hub 하나만 남은 원인이었다)
  ② _shared 는 zip **최상위에 평평하게** 들어간다 (Lambda 에서 /var/_shared 는 없다)
  ③ 하위 파이썬 패키지가 재귀 복사된다 (cp "$DIR"/*.py 는 재귀하지 않았다)
  ④ 배포 게이트는 **우리 잘못**만 막는다 — 리눅스 휠·환경변수는 Lambda 에서 정상이다
"""
import os
import pathlib
import shutil
import sys
import tempfile
import unittest

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

    def test_distribution_needs_four_shared_modules_and_two_packages(self):
        planned = lp.plan(str(AWS / "distribution"), str(SHARED))
        self.assertEqual(["content_contract", "provenance", "report_contract", "report_period"],
                         planned["sharedModules"])
        self.assertEqual(["sns_adapters", "sources"], planned["subPackages"])

    def test_kma_functions_still_need_only_kma_hub(self):
        """기존 13개 함수의 동작이 바뀌면 안 된다 — 옛 스크립트와 같은 결과여야 한다."""
        for name in ("kma-warn", "kma-fcst", "gk2a-clouds", "typhoon-official", "quake-asia"):
            with self.subTest(function=name):
                planned = lp.plan(str(AWS / name), str(SHARED))
                self.assertEqual(["kma_hub"], planned["sharedModules"])
                self.assertEqual([], planned["subPackages"])

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

    def test_distribution_is_still_blocked_by_the_cross_function_load(self):
        """sources/verify_scorecard.py 가 report-engine/adapters 를 경로로 읽는다.

        그 경로는 zip 루트 **밖**(_AWS = /var)이라 패키지 안에서 만족시킬 수 없다.
        이 시험은 그 blocker 가 아직 있음을 고정한다 — 해소되면 이 시험이 실패하고,
        그때 docs/DISTRIBUTION_DEPLOYMENT_GAP.md 의 상태를 함께 고쳐야 한다.
        """
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, "task")
            lp.stage(str(AWS / "distribution"), str(SHARED), dest)
            self.assertEqual([], lp.missing_own_modules(dest, str(AWS / "distribution"), str(SHARED)),
                             "패키징 자체는 더 이상 빠뜨리지 않는다")
            result = lp.import_check(dest)
            self.assertFalse(result["ok"])
            self.assertEqual("PATH_ESCAPES_PACKAGE", result["kind"])
            self.assertIn("kma_verify_adapter.py", result["missing"] or "")

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


if __name__ == "__main__":
    unittest.main()
