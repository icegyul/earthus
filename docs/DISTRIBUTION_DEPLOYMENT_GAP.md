# DEFECT — distribution Lambda 패키징 공백

작성 2026-09-13 · 갱신 2026-09-13 (패키징 수정 후)
발견 경로 [UNTRACKED_BASELINE_AUDIT.md](UNTRACKED_BASELINE_AUDIT.md) §6 의 부수 발견

## STATUS: **BLOCKED_FOR_LIVE_DEPLOYMENT — 아직 해소되지 않았다**

공백 3개 중 **2개는 고쳤고 1개가 남았다.** 남은 1개가 콜드 스타트를 여전히 막는다.

| # | 공백 | 상태 |
|---|---|---|
| 1 | `_shared` 모듈이 zip 에 하나도 안 들어갔다 | **해소** — §3 |
| 2 | 하위 파이썬 패키지(`sns_adapters`·`sources`)가 안 들어갔다 | **해소** — §3 |
| 3 | `sources/verify_scorecard.py` 가 **zip 루트 밖** 파일을 경로로 읽는다 | **남음** — §4 |

→ **AWS LIVE 작업을 시작할 수 없다.** ③을 먼저 해결해야 한다.
그리고 ③은 `aws/distribution/sources/verify_scorecard.py` 를 고쳐야 하는데,
그 파일은 [UNTRACKED_BASELINE_AUDIT.md](UNTRACKED_BASELINE_AUDIT.md) 의
`ACTION = DO NOT TOUCH` 14개 중 하나다 — **사용자 결정이 필요하다**(§6).

---

## 1. Lambda 패키징 구조 (실제 파일 기준)

| 질문 | 답 |
|---|---|
| Lambda handler 위치 | `aws/<함수>/handler.py`. Lambda 설정은 `--handler handler.handler` (배포 스크립트 11개 전부 동일) → **zip 최상위**에 `handler.py` 가 있어야 한다 |
| `_shared` 실제 위치 | `aws/_shared/` (14개 `.py` + `sql/` + `tests/`) |
| 현재 package/build script | `aws/deploy-python.sh` (인자 = 함수 이름, `DIR=aws/<함수>`). `_shared` 를 다루는 것은 이 파일과 `deploy-lite.sh` 둘뿐이고, 둘 다 **`kma_hub.py` 하나만** 다뤘다 |
| zip root 구조 | `$TMP` 의 내용이 그대로 zip 루트가 된다. pip 가 설치한 패키지 + 함수 `.py` + (조건부) `kma_hub.py` + (조건부) `contracts/` |
| Lambda runtime sys.path | zip 이 `/var/task` 로 풀리고 그것이 `sys.path` 에 들어간다. **layer 는 쓰지 않는다** (`--layers`·`publish-layer-version` 참조 0건) |
| handler ↔ `_shared` 상대경로 | 핸들러들이 `sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))` 를 쓴다. 로컬에서는 `aws/_shared` 로 맞지만 Lambda 에서는 `_HERE=/var/task` → **`/var/_shared`** 이고 존재하지 않는다 |
| layer 사용 여부 | **없음** |
| 현재 배포 artifact | `/tmp/<함수>.zip` (직접 업로드, 한도 50MB) |

### 1.1 영향 범위 — `distribution` 하나

`_shared` 모듈을 import 하는 것을 전수 조사했다:

```
kma_hub 만 쓰는 함수 13개   gk2a-clouds · gts-global · kma-aws · kma-aws-min · kma-fcst ·
                            kma-life · kma-lightning · kma-mountain · kma-normal · kma-ocean ·
                            kma-radar · kma-upper · kma-warn · quake-asia · typhoon-official
                            → 기존 스크립트가 옳게 처리한다
distribution                content_contract · provenance · report_contract · report_period  ← 문제
report-engine               content_contract · governance · phenomenon_registry ·
                            publication_privacy · report_contract · report_period
                            → **Lambda 가 아니다** (handler.py 없음 · 배포 스크립트 참조 0건). 영향 없음
```

파이썬 하위 패키지를 가진 Lambda 도 `distribution` 하나다(`sns_adapters` · `sources`).

## 2. 원인 — 세 성질의 겹침 (수정 전)

```bash
cp "$DIR"/*.py "$TMP"/                      # ① 재귀하지 않는다 → 하위 패키지 누락
SHARED=".../_shared/kma_hub.py"             # ② _shared 에서 이 한 파일만 후보
if grep -q "import kma_hub" "$DIR"/*.py; then cp "$SHARED" "$TMP"/; fi
                                            #    distribution 에 그 import 가 없다 → _shared 0개
if [ -d "$DIR/contracts" ]; then cp -R ... ; fi   # ③ 재귀 특례는 contracts 이름에만
```

## 3. 수정 — 공백 ①② 해소

### 3.1 규칙을 한 곳에 두었다

`aws/_shared/lambda_package.py` (신규). `deploy-python.sh` 와
`aws/_shared/tests/test_lambda_package.py` 가 **같은 함수를 부른다** —
bash 와 Python 에 규칙을 두 번 쓰면 한쪽만 고쳐진다(그게 `kma_hub` 하나만 남은 이유다).

```
plan(function_dir, shared_dir)     넣을 것의 목록 (복사하지 않는다)
stage(...)                         계획대로 복사. _shared 는 **최상위에 평평하게**
missing_own_modules(...)           계획 대비 누락 (파일시스템만 본다 — 플랫폼 무관)
import_check(...)                  실제 import. 5갈래로 분류
verify(...)                        배포 게이트 = ① + ②
```

**목록을 손으로 적지 않는다.** `import` 문을 읽어 정하고 전이 의존까지 닫는다.
새 `import` 가 생기면 자동으로 따라온다.

**`_shared` 는 zip 최상위에 평평하게** 넣는다 — `/var/_shared` 가 없으므로
zip 루트(`/var/task`)에서 해소되게 한다. `kma_hub.py` 를 그렇게 넣어 온 관례를 일반화한 것이다.

### 3.2 `deploy-python.sh` 변경

```
- cp "$DIR"/*.py "$TMP"/                    (+ kma_hub 이름 특례 블록)
+ "$PYBIN" "$PKGTOOL" stage "$DIR" "$SHARED_DIR" "$TMP"

  zip 생성 후:
+ zip 을 실제로 풀어 "$PKGTOOL" verify — 실패하면 배포하지 않는다
```

⚠️ `$TMP` 를 보지 않고 **실제 zip 을 풀어서** 검사한다. zip 만들기에서 빠진 것은 `$TMP` 에는 있다.

### 3.3 기존 함수 82개에 영향이 없음을 실증했다

옛 로직과 새 로직으로 각각 staging 한 뒤 (동일 prune 적용) 파일 집합을 비교했다:

```
Lambda 디렉터리 83개 중
  동일   82개
  차이    1개 — distribution: content_contract·provenance·report_contract·report_period +
                sns_adapters/(9) + sources/(4)  ← 정확히 빠져 있던 것
```

배포 게이트도 전 함수에 돌렸다:

```
통과 82개 / 막힘 1개 (distribution)
```

### 3.4 게이트는 우리 잘못만 막는다

개발 기계에서 판단할 수 없는 것을 실패로 부르면 **지금 잘 되는 13개의 배포가 막힌다.**
그래서 5갈래로 나눈다:

| 분류 | 배포 | 뜻 |
|---|---|---|
| `IMPORTED` | 통과 | 끝까지 import 됐다 |
| `OWN_MODULE_MISSING` | **차단** | 우리 모듈이 패키지에 없다 |
| `PATH_ESCAPES_PACKAGE` | **차단** | 우리 코드가 패키지 밖 파일을 읽는다 (`FileNotFoundError`) |
| `THIRD_PARTY_NOT_INSTALLED_LOCALLY` | 통과 | pip 가 넣는 것이 이 기계에 없다 |
| `ENV_VAR_REQUIRED` | 통과 | 모듈 수준에서 `os.environ[...]` 을 읽는다. Lambda 에는 설정돼 있다 |
| `UNVERIFIABLE_LOCALLY` | 통과 + 경고 | 그 밖 (manylinux `.so` 를 윈도우에서 로드 등) |

실측: `kma-warn`·`gk2a-clouds`·`news-brief` → `ENV_VAR_REQUIRED: CACHE_BUCKET` (통과).
`tourism-flow` → `UNVERIFIABLE_LOCALLY` (통과). `distribution` → `PATH_ESCAPES_PACKAGE` (차단).

⚠️ 오분류 구멍 하나를 검사 중에 발견해 함께 막았다: 패키징이 빠뜨린 모듈은 `dest` 에 없으므로
"제3자"로 오분류돼 통과할 수 있었다. `_looks_like_repo_module()` 이 `aws/` 에 그 이름의
`.py` 가 실제로 있는지 보고 우리 것으로 판정한다. 시험
`test_a_module_packaging_dropped_is_not_mistaken_for_third_party` 가 이를 고정한다.

## 4. 남은 공백 ③ — 패키지 밖 경로를 읽는다

### 4.1 무엇이

`aws/distribution/sources/verify_scorecard.py` 가 **모듈 수준에서**:

```python
_HERE = os.path.dirname(os.path.abspath(__file__))
_AWS = os.path.dirname(os.path.dirname(_HERE))
...
kma = _load("earthus_kma_verify_adapter",
            os.path.join(_AWS, "report-engine", "adapters", "kma_verify_adapter.py"))
SOURCE_REF = kma.SOURCE_REF
```

Lambda 에서 경로가 어디가 되는지 계산했다:

```
__file__ = /var/task/sources/verify_scorecard.py
_HERE    = /var/task/sources
_AWS     = /var                      ← zip 루트(/var/task)보다 한 단계 위
찾는 파일 = /var/report-engine/adapters/kma_verify_adapter.py       ← 존재하지 않는다
```

**zip 안에서 만족시킬 수 없다.** 경로가 task 루트 밖을 가리킨다.

### 4.2 왜 경로로 읽는가 (파일의 설명)

```
⚠️ 파일 경로로 직접 읽는다. sys.path 에 report-engine/adapters 를 넣으면
   그 `adapters` 패키지가 배포 엔진의 `adapters` 패키지를 가린다 —
   실제로 가렸다(ImportError: cannot import name 'lab_report_adapter').
   두 디렉터리에 같은 이름의 패키지가 있으므로 경로를 섞지 않는다.
```

즉 `sys.path` 로 해결할 수 없는 이유가 이미 문서화돼 있다. 단순히 `sys.path` 에 넣는 것은
그 사고를 되풀이한다.

### 4.3 재현 — 공백 ③만 남았음을 분리해 확인했다

```bash
BASE=$(mktemp -d); T="$BASE/task"
python aws/_shared/lambda_package.py stage aws/distribution aws/_shared "$T"
# ③을 인위적으로 해소: 어댑터를 _AWS 위치에 둔다
mkdir -p "$BASE/report-engine/adapters"
cp aws/report-engine/adapters/kma_verify_adapter.py "$BASE/report-engine/adapters/"
python aws/_shared/lambda_package.py verify aws/distribution aws/_shared "$T"
```

결과: `{"ok": true, "kind": "IMPORTED"}` · exit 0
→ **①②는 확실히 닫혔고, 남은 것은 ③ 하나뿐이다.**

③을 해소하지 않으면:

```
python aws/_shared/lambda_package.py verify aws/distribution aws/_shared "$T"
❌ 패키지 밖 경로를 읽는다: .../report-engine/adapters/kma_verify_adapter.py
exit 1
```

## 5. 권고 — ③을 고치는 방법 세 가지

| 안 | 내용 | 장점 | 단점 |
|---|---|---|---|
| **가** | `verify_scorecard.py` 가 **패키지 안 경로**를 먼저 보고, 없으면 로컬 경로로 떨어진다 (`_load` 의 path 후보를 둘로) | 코드 한 곳 · Lambda·로컬 둘 다 동작 · §4.2 의 `sys.path` 오염을 피한다 | `verify_scorecard.py` 를 고쳐야 한다 — **DO NOT TOUCH 14개 중 하나** |
| 나 | 패키징이 `report-engine/adapters/kma_verify_adapter.py` 를 zip 안 `report-engine/adapters/` 에 복사 | 코드 변경 0 | `_AWS` 가 task 루트 **밖**이라 여전히 못 찾는다 → **효과 없음** |
| 다 | `sources/verify_scorecard.py` 를 `handler.py` 가 조건부로 import (없으면 그 기능만 끈다) | 나머지 기능은 배포된다 | 동작이 바뀐다 · 역시 코드 수정 |

→ **가** 를 권고한다. 다만 그 파일이 DO NOT TOUCH 이므로 **사용자 승인이 필요하다.**

`kma_verify_adapter.py` 는 **추적됨**이므로 패키징에 넣는 것 자체는 문제가 없다.
문제는 그것을 찾는 **경로 계산**이다.

## 6. 지금 배포돼 있는가

| 확인 | 결과 |
|---|---|
| `distribution` 전용 배포 스크립트 | **없다** |
| 스케줄 등록 | **없다** (`schedules.sh`·`configure-*.sh` 히트 0건) |
| 운영 함수 존재 여부 | **확인 못 했다** — AWS 세션 만료 |

배포가 파일시스템에서 복사하므로 누군가 수동으로 올렸을 가능성은 배제할 수 없다.
그랬다면 `Runtime.ImportModuleError` 로 죽고 있을 것이다. **자격이 풀리면 가장 먼저 볼 항목이다.**

## 7. 해결 순서 (LIVE 전)

```
1. ③ 해결 방식을 정한다 (§5 가/다 — verify_scorecard.py 수정 승인 필요)
2. python aws/_shared/lambda_package.py verify aws/distribution aws/_shared <staged> 가 통과할 때까지
3. 미추적 14개 처리 결정 — 파일이 없으면 다른 기계·CI 에서는 올라가지 않는다
4. aws login → 운영에 earthus-distribution 계열 함수가 있는지·죽어 있는지 확인
5. 그 다음에 배포한다. deploy-python.sh 가 zip 을 풀어 스스로 검사하고, 실패하면 올리지 않는다
```

## 8. 시험

```
python -m pytest aws/_shared/tests/test_lambda_package.py -q
→ 23 passed, 5 subtests
```

고정한 것: import 기반 폐쇄(전이 포함) · 주석·문자열 속 이름은 import 아님 ·
`_shared` 평평 배치 · 하위 패키지 재귀 · `__init__.py` 없는 디렉터리는 패키지 아님 ·
`tests`·`contracts` 제외 · 5갈래 분류 각각 · 빠뜨린 모듈의 제3자 오분류 방지 ·
`distribution` 이 4+2 를 필요로 함 · kma 함수 5개가 여전히 `kma_hub` 만 필요 ·
하위 패키지를 가진 Lambda 가 `distribution` 하나 · **③ blocker 가 아직 있음** ·
배포 스크립트가 옛 복사 줄을 더 이상 갖고 있지 않음.

⚠️ 마지막에서 두 번째 시험(`test_distribution_is_still_blocked_by_the_cross_function_load`)은
③이 해소되면 **실패한다.** 그때 이 문서의 STATUS 를 함께 고쳐야 한다 — 의도된 잠금이다.

## 9. 이 문서에서 하지 않은 것

- `aws/distribution/sources/verify_scorecard.py` 를 **고치지 않았다** (DO NOT TOUCH)
- 미추적 14개를 건드리지 않았다
- 범위 밖 미추적 6개(report-engine 3 · tourism-flow 2 · khoa-coast.zip)를 건드리지 않았다
- 운영 Lambda 상태를 확인하지 못했다 (AWS 세션 만료)
- `deploy-lite.sh` 는 고치지 않았다 — `kma_hub` 만 쓰는 함수용이고 이 결함에 해당하지 않는다
