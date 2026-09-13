# DEFECT — distribution Lambda 패키징 공백

작성 2026-09-13 · 갱신 2026-09-13 (공백 ③ 해소 후 — §10 이 실증)
발견 경로 [UNTRACKED_BASELINE_AUDIT.md](UNTRACKED_BASELINE_AUDIT.md) §6 의 부수 발견

## STATUS: **READY_FOR_LIVE_DEPLOYMENT (패키징 한정)**

공백 3개 **전부 해소**. 실제 ZIP 을 만들어 풀고 그 안에서 실행해 확인했다(§10).

| # | 공백 | 상태 |
|---|---|---|
| 1 | `_shared` 모듈이 zip 에 하나도 안 들어갔다 | **해소** — §3 |
| 2 | 하위 파이썬 패키지(`sns_adapters`·`sources`)가 안 들어갔다 | **해소** — §3 |
| 3 | `sources/verify_scorecard.py` 가 **zip 루트 밖** 파일을 경로로 읽는다 | **해소** — §4 · §10 |

⚠️ 이 STATUS 가 말하는 것은 **패키징뿐이다.** 아직 하지 않은 것:

- **운영 함수 확인** — `earthus-distribution` 계열이 운영에 있는지·죽어 있는지 (AWS 자격 필요, §6)
- **실제 배포** — 한 번도 올리지 않았다
- **미추적 파일 처리** — `aws/distribution/` 의 파일들은 아직 커밋되지 않았다.
  이 기계의 파일시스템에서 배포하므로 **여기서는** 올라가지만,
  다른 기계·CI 에는 파일이 없다(§7 3항 · [UNTRACKED_BASELINE_AUDIT.md](UNTRACKED_BASELINE_AUDIT.md)).

2026-09-13 추가 — LIVE 전 안전수정 5건을 §11 에 기록했다(공개 노출·id 충돌·
날짜 입력·결정적 ZIP·실제 배포 artifact). 그 과정에서 §10 의 12만 바이트짜리가
**배포물이 아니었다**는 것이 드러났다(§11.1). AWS 쓰기는 여전히 0건이다.

→ 즉 **"패키징이 더 이상 배포를 막지 않는다"**가 이 문서의 판정이다.
"배포됐다"거나 "운영에서 동작한다"는 뜻이 아니다.

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

## 4. 공백 ③ — 패키지 밖 경로를 읽었다 (**해소됨** · 고친 내용과 실증은 §10)

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

### 4.3 재현 — 공백 ③만 남았음을 분리해 확인했다 (수정 **전** 진단)

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

→ **가** 를 권고했고, 사용자 승인을 받아 **가** 를 적용했다(§10.2).
나·다는 쓰지 않았다 — 나는 효과가 없고, 다는 동작을 바꾼다.

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
[끝] 1. ③ 해결 방식을 정한다 (§5 가 채택 · 사용자 승인 2026-09-13)
[끝] 2. verify 가 통과할 때까지 — 83 함수 전부 PASS, 실제 ZIP 추출 검사까지 (§10.6)
[남음] 3. 미추적 파일 처리 결정 — 파일이 없으면 다른 기계·CI 에서는 올라가지 않는다
[남음] 4. aws login → 운영에 earthus-distribution 계열 함수가 있는지·죽어 있는지 확인
[남음] 5. 그 다음에 배포한다. deploy-python.sh 가 zip 을 풀어 스스로 검사하고, 실패하면 올리지 않는다

3·4·5 는 사용자의 다음 승인을 기다린다. 2 가 끝났으므로 **패키징은 더 이상 막지 않는다.**
```

## 8. 시험

```
python -m pytest aws/_shared/tests/test_lambda_package.py -q
→ 25 passed, 5 subtests
```

고정한 것: import 기반 폐쇄(전이 포함) · 주석·문자열 속 이름은 import 아님 ·
`_shared` 평평 배치 · 하위 패키지 재귀 · `__init__.py` 없는 디렉터리는 패키지 아님 ·
`tests`·`contracts` 제외 · 5갈래 분류 각각 · 빠뜨린 모듈의 제3자 오분류 방지 ·
`distribution` 이 4+2 를 필요로 함 · kma 함수 5개가 여전히 `kma_hub` 만 필요 ·
하위 패키지를 가진 Lambda 가 `distribution` 하나 ·
배포 스크립트가 옛 복사 줄을 더 이상 갖고 있지 않음 ·
**경로로 읽는 파일을 AST 로 찾아 zip 루트에 넣음** ·
**패키지 안에서 어댑터 경로가 루트 안임** ·
**저장소와 패키지의 채점 결과가 동일함**.

옛 잠금 시험(`test_distribution_is_still_blocked_by_the_cross_function_load`)은
③이 해소되면 실패하도록 일부러 둔 것이고 실제로 실패했다.
지금은 **해소된 상태를 고정하는 3개**로 바꿨다(§10.7).

## 9. 이 문서에서 하지 않은 것

- `aws/distribution/sources/verify_scorecard.py` 는 **사용자 승인을 받아 경로 해석만 고쳤다**(§10.1·§10.2).
  채점 계산·판정 기준은 바꾸지 않았고, 같은 입력의 결과가 동일함을 sha256 으로 확인했다(§10.5)
- 그 파일 **한 개를 제외한** 미추적 목록은 건드리지 않았다
- 범위 밖 미추적 6개(report-engine 3 · tourism-flow 2 · khoa-coast.zip)를 건드리지 않았다
- 운영 Lambda 상태를 확인하지 못했다 (AWS 세션 만료) — **사용자의 다음 승인 대상**
- 실제로 배포하지 않았다 — 이 문서는 "올릴 수 있다"까지만 말한다
- 실측 자료로 채점해 보지 않았다 — §10.5 의 입력은 합성이다
- `deploy-lite.sh` 는 고치지 않았다 — `kma_hub` 만 쓰는 함수용이고 이 결함에 해당하지 않는다

## 10. 실증 — 실제 ZIP 을 만들어 풀고 그 안에서 돌렸다

주장으로 끝내지 않는다. 아래는 전부 실행 결과다.

### 10.1 변경한 파일

| 파일 | 추적 | 무엇을 바꿨나 |
|---|---|---|
| `aws/distribution/sources/verify_scorecard.py` | **미추적** | `_adapter_path()` 추가. **경로를 찾는 방법만.** |
| `aws/_shared/lambda_package.py` | 추적 | `cross_function_files()`·`_is_os_path_join()` 추가 후 `plan`·`stage`·`shared_closure`·`missing_own_modules` 에 연결 |
| `aws/_shared/tests/test_lambda_package.py` | 추적 | 잠금 시험 1개 → 해소 고정 시험 3개 |

`verify_scorecard.py` 는 [UNTRACKED_BASELINE_AUDIT.md](UNTRACKED_BASELINE_AUDIT.md) 의
`DO NOT TOUCH` 목록에 있는 파일이다. **사용자가 ③ 수정을 명시적으로 승인**해 손댔고,
바꾼 것이 기능이 아님을 §10.5 에서 숫자로 확인했다. 나머지 목록은 건드리지 않았다.

### 10.2 경로 해석 — 바뀐 것

```
전:  os.path.join(_AWS, "report-engine", "adapters", "kma_verify_adapter.py")
     _AWS = dirname(dirname(_HERE))
       로컬  D:\...\aws\report-engine\adapters\kma_verify_adapter.py   → 있다
       Lambda /var/report-engine/adapters/kma_verify_adapter.py        → 없다 (zip 루트 밖)

후:  _adapter_path() 가 두 곳을 순서대로 본다
     ① dirname(_HERE)/kma_verify_adapter.py   = 배포 패키지 루트(= /var/task)
     ② _AWS/report-engine/adapters/...        = 저장소
     둘 다 없으면 FileNotFoundError 를 던진다 — 조용히 넘기지 않는다
```

`_load()`·채점 계산·판정 기준·단위 계약은 **한 줄도 바뀌지 않았다.**

### 10.3 실제 ZIP 내부 경로

`aws/_shared/lambda_package.py stage` → `deploy-python.sh` 와 같은 zipfile 로직(`external_attr = 0o644 << 16`).

```
distribution.zip   114,592 바이트 · 37 개 항목

루트 (24개 .py):  handler.py  cli.py  eligibility.py  generator.py  caption.py
                  hashtags.py  validation.py  visual.py  archive.py  executor.py
                  bridge_client.py  publish_queue.py  rate_limit.py  provider_health.py
                  response_archive.py  scheduled_release.py  analytics_fetch.py
                  verify_live.py  __init__.py
                  ├ _shared 에서 평평하게:  content_contract.py  provenance.py
                  │                        report_contract.py   report_period.py
                  └ 경로로 읽는 파일:       kma_verify_adapter.py      ← ③ 의 해소
하위 패키지:      sns_adapters/ (9)   sources/ (4)
```

`kma_verify_adapter.py` 는 손으로 적은 목록이 아니라
`os.path.join(...)` 호출을 **AST 로 읽어** 찾아낸 것이다:

```
cross_function_files(aws/distribution) =
  {'kma_verify_adapter.py': 'report-engine/adapters/kma_verify_adapter.py'}
cross_function_files(aws/kma-warn) = {}          ← 다른 함수는 그대로다
```

### 10.4 ZIP 루트 밖에 의존하지 않는다

ZIP 을 **저장소 밖 임시 디렉터리**에 풀었다. 그 부모에는 `report-engine/` 이 없다 —
즉 옛 경로로 되돌아갈 길이 물리적으로 없다. `sys.addaudithook` 으로 **실제로 연 파일 전부**를 기록했다.

```
연 파일 20개 = zip 루트 14 + 표준 라이브러리 6 + 계측 스크립트 1 + 그 밖 0
어댑터 실제 경로 = <추출 루트>/kma_verify_adapter.py          (루트 안)
aws/ 아래 파일을 연 횟수 = 0
```

`verify_scorecard.py` 의 기존 `sys.path.insert` 두 줄은 **그대로 두었다**(고칠 범위가 아니다).
추출 환경에서 그 두 경로는 존재하지 않는 디렉터리이고, Python 은 없는 경로를 건너뛴다 —
그래서 `content_contract`·`report_contract`·`report_period`·`eligibility` 가
모두 **zip 루트에서** 해결된다. 무해함을 추측이 아니라 실측으로 확인했다.

```
sys.path[0] = <scratchpad>\_shared              → 존재하지 않음
sys.path[1] = <scratchpad>\proof\_shared        → 존재하지 않음
```

### 10.5 기존 환경과 새 환경의 성적이 같다

픽스처를 패키지에 복사하지도, symlink 를 걸지도 않았다. 같은 합성 입력을
`aws/distribution`(기존)과 추출한 ZIP(새)에서 각각 채점해 결과를 비교했다.
입력 모양은 어댑터가 문서화한 그대로다 —
`days["YYYY-MM-DD"]["{model}|{var}|{lead}h"] = {me, mae, rmse, n}`.

```
저장소 sha256 = 1d091d3685bae1198bf651e9df62894c7c4b5b489c165be8ca71c08ec93e91b1
ZIP    sha256 = 1d091d3685bae1198bf651e9df62894c7c4b5b489c165be8ca71c08ec93e91b1
→ 완전히 같다
```

⚠️ 이 입력은 **합성이다. 실측이 아니다.** 두 환경의 계산이 같은지만 보기 위한 동일 입력이다.
저장소에 `verify_scorecard` 를 거치는 기존 픽스처가 없어서
(`test_distribution.py` 는 이 모듈을 시험하지 않는다) 새로 만들었다.

비교가 빈 껍데기가 아님을 함께 고정했다:

```
모델 ['ecmwf_ifs025', 'gfs_seamless'] · 리드 [24, 48] · coverage.days 2
기간 밖 날짜(2026-07-31, n=9999)는 양쪽 모두 버렸다
지표가 일부만 있는 날(me·rmse 없음)도 양쪽이 같게 처리했다 — 없는 값을 0 으로 가중하지 않는다
```

### 10.6 packaging gate 전체 재실행

`handler.py` 를 가진 함수 **83개 전부**에 대해
stage → 실제 zip(0o644) → 별도 디렉터리 추출 → `verify` 를 돌렸다.
**추출한 것을 검사한다** — staging 폴더가 아니다.

```
83 PASS / 0 FAIL

ENV_VAR_REQUIRED                   64     ← 통과 갈래 (Lambda 에서는 환경변수가 있다)
IMPORTED                           10
UNVERIFIABLE_LOCALLY                8     ← 통과 갈래 (manylinux 휠을 윈도우에서 로드)
THIRD_PARTY_NOT_INSTALLED_LOCALLY   1     ← 통과 갈래 (pip 가 넣는다)

distribution : ok=True · kind=IMPORTED · missingOwnModules=[] · 114,592 바이트
```

차단 갈래(`OWN_MODULE_MISSING`·`PATH_ESCAPES_PACKAGE`)는 **0건**이다.
③ 수정 전 `distribution` 은 `PATH_ESCAPES_PACKAGE` 였다.

### 10.7 전체 시험 결과

| 대상 | 기준선 | 지금 | |
|---|---|---|---|
| npm (`npm test`) | 143 PASS | **143 PASS** / 0 fail | 같음 |
| distribution | 325 PASS · 6 skip | **325 PASS · 6 skip** | 같음 |
| v11 (`tools/earthus2-v11`) | 65 PASS | **65 PASS** / 0 fail | 같음 |
| research-runtime | 80 PASS | **80 PASS** | 같음 |
| `_shared` | 140 PASS | **142 PASS** | +2 (줄지 않았다) |

삭제 0 · skip 추가 0.

`_shared` 가 +2 인 이유: 내가 지난 턴에 **일부러 잠가 둔** 시험
`test_distribution_is_still_blocked_by_the_cross_function_load` 는
③이 해소되면 실패하도록 만든 것이고, 실제로 실패했다.
그 1개를 **해소된 상태를 고정하는 3개**로 바꿨다 — 순증 +2다.
저장소에 원래 있던 시험을 지운 것은 없다.

```
test_distribution_packages_the_adapter_it_reads_by_path
    어댑터가 zip 루트에 있고 · AST 탐지 결과가 그 한 개이고 · import_check 가 IMPORTED
test_scorecard_reads_the_adapter_from_inside_the_package
    패키지 안에서 돌릴 때 어댑터 경로가 zip 루트 안
test_scorecard_result_is_identical_in_repository_and_package
    같은 입력 → 저장소와 패키지의 결과가 완전히 같다 (판정 기준이 안 바뀌었다)
```

⚠️ research-runtime 을 처음 돌렸을 때 6건이 실패했다. 회귀가 아니라
`.deps` 를 `PYTHONPATH` 에 넣지 않은 **내 실행 명령 오류**였다
(`OceanParcels 3.1.4 unavailable`). README §실행 이 요구하는 대로
`PYTHONPATH=".;.deps"` 로 다시 돌려 80 PASS 를 얻었다. 기록해 둔다 — 다음에 또 틀리지 않기 위해.

## 11. PRE-DEPLOY 안전수정 (2026-09-13 · AWS 쓰기 0건)

LIVE 배포 **전에** 닫아야 할 것들. 이 절의 모든 수치는 실행 결과다.
AWS 쓰기는 한 건도 하지 않았다 — 로컬 실행은 `handler.py` 의 `dryRun` 가드가
S3 클라이언트를 만들기 전에 반환한다.

### 11.1 두 artifact 를 헷갈리지 않는다

이 문서가 앞에서 말한 12만 바이트짜리는 **배포물이 아니었다.** 이름을 나눈다.

| 이름 | 무엇 | 어떻게 만드나 | 무엇을 증명하나 |
|---|---|---|---|
| **검증 artifact**<br>(packaging verification artifact) | `lambda_package.py stage` → `build_zip` 만 거친 zip | `python aws/_shared/lambda_package.py stage …` + `zip …` | 우리 모듈·하위 패키지·경로로 읽는 파일이 다 들어갔는지, 풀어서 `handler` 를 import 할 수 있는지 |
| **배포 artifact**<br>(Lambda deployment artifact) | 실제로 `aws lambda create/update-function-code` 에 올라가는 zip | `aws/deploy-python.sh <함수>` | 운영에서 콜드 스타트가 사는지 |

둘이 갈리는 지점은 **pip 단계** 하나다(`deploy-python.sh` 86~100행).
함수 폴더에 `requirements.txt` 가 없으면 NetCDF 기본값(h5py·numpy·Pillow, 약 30MB)으로
떨어진다. `aws/distribution` 에는 그 파일이 없었다 —
즉 §10 이 감사한 zip 은 배포될 zip 이 아니었다. §11.5 에서 닫았다.

### 11.2 공개 노출 — `events/` 는 익명 200 이다

실측(익명 curl, 자격증명 없이):

```
events/crustal.json                      200   공개
events/definitely-not-a-real-key….json   403   ← 없는 키도 403 이다 (ListBucket 이 없다)
archive/_gaps/dt=2026-07-26.json         403   비공개
```

버킷 정책 Sid `PublicReadData` 가 익명 `s3:GetObject` 를 허용하는 접두사 8개:
`app/ celestrak/ clouds/ wind/ events/ ocean/ solar/ reports/published/`.

배포 artifact 안에서 `dryRun` 으로 돌린 결과 — 고치기 **전**:

```
2026-09-13  후보 8건 중 7건이 익명 공개 대상
  CNT-2026-000007  대기질 일일 감시 · 2026-09-13   DRAFT  LEVEL_2_REVIEW  REVIEW_REQUIRED
```

`REVIEW_REQUIRED`(사람 검토 필요)가 공개로 나갔다. 보류 기준이
`WITHHELD_ELIGIBILITY = ("BLOCKED",)` 하나뿐인 **차단 목록**이었기 때문이다.

#### 고친 것

1. 출력 접두사를 비공개로 옮겼다 — `events/` → `archive/`.
   social-draft 가 `events/social-drafts.json` → `archive/social-drafts.json` 으로
   옮긴 것과 같은 해결이다(INTEGRATION-4 §0). 새 계보를 만들지 않았다.
2. 로컬 미리보기 경로는 **그대로 두었다**(`LOCAL_INDEX_KEY`·`LOCAL_BODY_PREFIX`).
   운영 키를 따라 옮기면 `cli.py --out prototype/` 산출물이 `prototype/archive/…` 에
   떨어지고, `public_build.denial_for('archive/distribution-content.json')` 는
   **None**(막지 않음)이라 다음 `deploy-app.sh` 가 공개 `app/` 으로 실어 올린다.
   `events/` 쪽은 이미 `DENY_RULES` 에 등재돼 있다.
3. 차단 목록을 **허용 목록**으로 뒤집었다: `PUBLIC_ELIGIBILITY = ("ELIGIBLE",)`.
   자격이 없거나 모르는 값이면 막는다. 경계 판정의 정본은
   `aws/_shared/publication_privacy.py` 이고 `handler.public_eligibility()` 가 그 위에
   허용 목록만 더한다.
4. 색인이 판정을 **적는다**: 항목마다 `publicEligible`·`publicWithheldReason`,
   최상위에 `publicItems`. 소비자는 목록을 훑어 스스로 판단하지 않는다.
5. `_assert_write_allowed()` 가 매 `put_object` 앞에서 `check_public_write()` 를 부른다.
   비공개 산출물이 공개 접두사로 가면 **던진다.** 표에 없는 접두사도 거부된다.

고친 **후**, 같은 실행:

```
2026-09-13  후보 8건 · publicItems 없음
  CNT-…  eligible=False  자격 판정이 REVIEW_REQUIRED — 허용 목록에 없다
  CNT-…  eligible=False  상태가 DRAFT — 사람 승인 전이다
경계 위반 시도 → RuntimeError: 공개 경계 위반 — 쓰지 않는다
```

⚠️ `publicItems` 가 비어 있는 것은 고장이 아니다. 이 엔진의 산출물은 전부
`status=DRAFT` 이고 `publication_privacy` 의 계약은 DRAFT 를 "사람 승인 전 = 비공개"로
규정한다. 승인 절차가 생겨 상태가 올라가면 그때 통과한다.

### 11.3 "없어서 통과"를 없앴다

`aws/verify-public-access.py` 의 판정은 `ok = (state == want) or (want == "CLOSED" and
state == "ABSENT")` 였다 — **부재가 곧 통과**였다.

⚠️ 앞서 이 문서가 "지금 통과하는 이유는 키가 ABSENT 라서"라고 적었는데 **틀렸다.**
실측하면 그 키는 `CLOSED 403` 이다. 익명에게 `s3:ListBucket` 이 없으면 S3 는 없는 키에도
403 을 준다. 그래서 `ABSENT` 분기는 지금 **어느 줄도 타지 않는 죽은 코드**였다.
진짜 문제는 다른 것이다: **403 은 "보호된다"와 "아예 없다"를 구별하지 못한다.**
익명 HTTP 로는 구별할 수 없다.

고친 것:

- 기대값에 `DENIED` 를 더했다 — 403 만 통과, 부재는 통과 아님. 람다가 실제로 쓰는
  두 키(`archive/distribution-content.json`, `…/CNT-….json`)에 붙였다.
- `CLOSED` 의 뜻은 **그대로 두었다** — `events/social-drafts.json` 처럼 부재가 목표인
  잔존물 줄이 있고, 그 줄들은 지금 의미가 맞다.
- 옛 공개 자리 두 줄을 계속 감시한다(생기면 `OPEN` 으로 잡힌다).
- 각 줄이 **무엇을 증명했는지** 적는다(`proves`). 403 은 "익명으로 읽히지 않는다"까지다.
- 종료코드를 `failed = [r for r in rows if not r["ok"]]` 로 낸다.
  예전에는 세 갈래의 합집합이었고, 기대값 어휘가 늘면 어느 갈래에도 안 들어가는 실패가
  생겨 **화면에는 `!!` 가 찍히는데 exit 0** 이 나갈 수 있었다.

### 11.4 같은 키에 다른 사건을 쓰던 것

실측한 결함:

```
CNT-2026-000001   9/13 → "M6.8 The 2026 Kumamoto Region, Japan Earthquake"
CNT-2026-000001   10/1 → "EARTHUS 예보 성적표 · 2026-09"
```

`handler.py` 가 `generate_all(cands, at=at)` 로 불러 `seq_start` 기본값 0 이 쓰였고,
id 가 매 실행 `CNT-<year>-000001` 부터 다시 시작했다. 핸들러는 기존 색인을 읽지 않는다.

고친 것: id 를 후보의 **정체**에서 만든다.

```
generator.candidate_identity(cand)  →  event=earthquake:us6000tgb9
                                       kind=verify-scorecard|period=2026-09-01..2026-09-30
generator.content_id_for(cand)      →  CNT-<정체 sha256 앞 12자>
```

실측 결과:

```
9/13   CNT-438be48bc9a6  M6.8 구마모토      10/1  CNT-5266a9b27359  예보 성적표 · 2026-09
9/13 ∩ 10/1 = 없음                          10/1 == 10/2 (같은 성적표 = 같은 id)
같은 날 재실행 = 같은 id (멱등)
```

시각을 넣지 않은 이유: 넣으면 같은 대상이 날마다 새 id 를 받는다. 지난달 성적표는
1~3일에 세 번 만들어지므로 하루만 섞여도 셋으로 늘어난다.
`lab-report` 의 `observationPeriod` 는 날마다 움직이는 창이라 식별에 쓰지 않는다.
식별할 수 없는 후보에는 **id 를 지어 주지 않는다** — 실패로 남긴다.
`next_content_id` 는 `cli.py --seq` 의 계약이므로 그대로 두었다.

### 11.5 배포 artifact — Layer 를 쓰지 않는다

`aws/distribution` 은 제3자 의존이 **없다.** 전 모듈(최상위·`sources/`·`sns_adapters/`)을
훑어 나온 유일한 제3자 import 는 `handler.py:61` 의 `import boto3` 뿐이고 런타임이 제공한다.
패키징 게이트가 이 함수를 `IMPORTED` 로 통과시킨 것이 독립 증거다.

| 안 | 판정 |
|---|---|
| A. ZIP 에 의존 포함 | **불필요** — 넣을 의존이 없다 |
| B. Lambda Layer | **쓰지 않는다** — 운영 80개 중 Layer 사용 0개(실측). 필요도 없다 |
| C. 저장소 기존 규약 | **채택** — 주석만 있는 `requirements.txt` 로 pip 기본값을 막는다 |

C 는 이 저장소의 지배적 관행이다: `requirements.txt` 를 가진 함수 31개 중
**26개가 설치 항목 0개인 주석 전용 파일**이다(`social-draft` 등).
`aws/distribution/requirements.txt` 를 같은 모양으로 만들었다 — 의존성을 하나도 더하지 않았다.

### 11.6 결정적 ZIP

같은 stage 에서 세 가지 해시가 나왔다(전부 114,592 바이트, 파일별 내용 동일):

```
B2xXACptGf7rtcUYZ6Or3l0yYXAp7kISMrdnTwNopug=   os.walk 순서 그대로 (당시 스크립트)
y5J67pVZM8o8TOtizP9Al/ZoxqJgpdbZ8UgX1HxZxHk=   디렉터리별로만 정렬
3IzxRWaKNUUwRAIMEhEfUYiZS6hOplE7fsWSXOsbWnQ=   전역 정렬 + create_system 고정
```

`lambda_package.py` 에 `zip_members` · `content_digest` · `build_zip` · `zip` 서브커맨드를
두고, `deploy-python.sh` 의 인라인 zip 두 갈래(`zip -qr` / 히어독 python)를 **지웠다.**
규칙은 한 곳이다.

| 비결정 요인 | 처리 |
|---|---|
| 구성원 순서 | arcname 을 **utf-8 바이트로 전역 정렬** (로케일에 좌우되지 않게) |
| mtime | `date_time=(1980,1,1,0,0,0)` 명시 |
| 파일 모드 | `0o644` 강제 (윈도우 기본 0 → 추출 시 000 → `.so` 를 못 읽는다) |
| `create_system` | **3(POSIX) 고정.** 윈도우는 0 이라 같은 나무가 OS 마다 달랐다 |
| 압축 수준 | `6` 고정 |
| 디렉터리 항목 | 넣지 않는다 |
| `.pyc`/`.pyo` | 넣지 않는다 |
| 이름 겹침 | `zip_members` 와 `build_zip` **양쪽에서** 거부 |

⚠️ 이 작업 중 실제 결함을 하나 찾았다. `ZipFile(..., compresslevel=N)` 은 arcname
문자열을 넘길 때만 쓰이고, `ZipInfo` 를 만들어 넘기면 `zinfo._compresslevel`(기본 None)이
이겨서 **zlib 기본값**으로 압축된다. 그래서 고치기 전에는 level 0·1·3·6·9 가 전부 같은
바이트였다 — 수준이 고정된 게 아니라 아예 전달되지 않았다. `info._compresslevel` 에
직접 박아서 닫았다(고친 뒤 실측: 0 → 211,131 / 1 → 18,014 / 6 → 13,107 / 9 → 12,904 바이트).

`contentDigest` 를 따로 둔다: `CodeSha256` 은 zip 바이트의 해시라 압축 구현이 바뀌면
값이 바뀐다. "같은 코드인가"는 이쪽이 답한다.

### 11.7 날짜·깃발 입력

제품 규칙 `if d.day <= 3` 은 **바꾸지 않았다.** 고친 것은 그 규칙의 입력이다.

```
datetime.strptime("2026-10-1", "%Y-%m-%d")  →  2026-10-01 (day=1)   ← 통과한다
"2026-09-13" >= "2026-10-1"                 →  False                ← 신선도는 문자열 비교다
```

0 하나를 빼먹으면 게이트는 열리는데 후보는 사라진다. 둘 다 조용하다.
`canonical_date()` 가 모양을 먼저 보고 **고쳐 주지 않고 거부한다.**
`{"date": None}` 도 거부한다 — 조용히 오늘로 바꿔 주면 어느 날의 결과인지 알 수 없다.

`dryRun` 은 `.get("dryRun")` 이라 대소문자를 가렸다. `{"dryrun": True}` 는 가드를 지나쳐
**실제 S3 쓰기**로 갔다. `event_flag()` 가 키 이름의 대소문자를 무시한다.

경계 실측(배포 artifact 안, 쓰기 0건): `10-01·02·03` → 성적표 1건, `09-13·10-04·10-30` → 0건.

### 11.8 분리된 것 — 아직 승인 대기

다음 세 건은 이번 수정에 **넣지 않았다**(사용자가 분리를 지시했다). 별도 조사 보고서 대상이다.

- 부분 실패 시 남는 고아 본문 (본문 루프에 try/except 가 없고 색인 쓰기가 마지막이다)
- 과거 날짜 주입으로 생기는 재생 문제
- 성적표가 1~3일에 세 번 만들어지는 문제 — 지금은 id 가 같아서 중복되지 않지만,
  "세 번 만드는 것 자체가 맞는가"는 별개 질문이다

## 12. Distribution 안전성 수정 (2026-09-13 · AWS 쓰기 0건)

최초 LIVE 결과(archive/ 9개 객체)를 그대로 두고, **재실행·상류 장애로 그것이 오염되는
경로만** 막았다. 코드와 로컬 시험만 했다 — Lambda invoke·S3 PUT·IAM·설정 변경 0건.

### 12.1 FAILURE 와 EMPTY 를 구별한다

고치기 전 (`handler.py`):
```
try:  lab_doc = _get(LAB_REPORTS)
except Exception as e:  problems.append(f"lab-reports 를 받지 못했다: {e}")
…  그리고 그대로 진행 → build_index(후보 0건) → put_object(색인)
```
상류가 죽은 날 "오늘은 사건이 없다"는 산출물이 만들어지고, 그것이 이미 올라가 있던
색인을 덮어썼다. 이 저장소의 정직 규칙과 어긋난다 —
`aws/gfs-cloud-forecast/handler.py:35` "받지 못한 스텝은 매니페스트에 넣지 않는다.
**빈 프레임을 만들지 않는다.**"

고친 뒤:

| 갈래 | 판정 | 쓰기 |
|---|---|---|
| `_get` 예외 (연결·timeout·HTTP) | `UpstreamError` | **0** |
| JSON parse 실패 | `UpstreamError` | **0** |
| 모양 오류 (객체 아님 / 키 없음 / 자료형 다름 / **원소가 객체 아님**) | `UpstreamError` | **0** |
| 기존 색인 읽기 실패 | `UpstreamError` | **0** |
| 상류 정상 + 결과 0건 | **정상 empty** | 색인 1건 (병합) |

`_require_shape` 는 자료형만 보지 않고 **원소도 본다.** `{"reports": ["문자열"]}` 은
list 검사를 통과하고 `lab_report.candidates` 안쪽에서 `AttributeError` 로 죽었다 —
쓰기 전에 죽으니 오염은 없었지만 "상류 모양이 틀렸다"가 아니라 내부 버그처럼 보였다.
이 갈래는 §12.6 의 회귀 시험이 짚어냈다.

⚠️ **반환값이 아니라 예외로 올린다.** `ok:False` 로 돌려주면 Lambda 는 그 호출을
Success 로 기록해 상류 장애가 조용히 지나간다. 예외면 오류로 남아 사람이 알아챈다.

### 12.2 색인 갱신 정책 — 새로 만들지 않고 읽어서 더한다

제품 요구를 확인하지 않은 채 create-only 로 정하지 않았다. **이 저장소가 같은 문제를
이미 풀어 둔 곳을 찾아 그 규약을 따랐다.**

`aws/report-engine/publisher.py:110-115` `merge_index` 의 주석:
> ⚠️ 색인을 **새로 만들지 않는다.** 한 건만 들고 새로 만들면 먼저 발행된
> 보고서들이 목록에서 조용히 사라진다. 있는 것을 읽어서 더한다.

같은 파일 `current_index()` (203-210): 없는 것(NoSuchKey/404)과 **못 읽는 것**을
구별한다 — "못 읽으면 모른다고 말한다". 후자를 빈 색인으로 읽으면 읽기 장애 한 번이
기존 목록을 전부 지운다.

같은 파일 `publish_index()` (246): "색인은 **가변**이다. 새 보고서가 늘어야 하므로
**조건부 쓰기를 쓰지 않는다.**"

그래서 후보 다섯 중 선택은 이미 정해져 있었다:

| 후보 | 판정 | 근거 |
|---|---|---|
| conditional write | **채택 안 함** | `publish_index` 가 같은 이유로 이미 배제했다 — 색인은 늘어야 한다 |
| content/version identity | **부분 채택** | 병합 시 같은 `contentId` 를 갈아치우는 기준으로 쓴다 (publisher 는 `(reportId, version)`) |
| generation ID | **채택** | 색인에 `generation` 을 적어 이번 실행이 만진 것과 이어받은 것을 구별한다 |
| immutable output + pointer/index | **이미 그 구조다** | 본문은 지우지 않는다. 색인이 가변 포인터다. `publisher.rollback()` 이 같은 원리다 |
| explicit overwrite policy | **채택** | 아래 표가 그 정책이다 |

구현: `handler.read_index(s3)` + `handler.merge_index(existing, fresh)`.

#### 여섯 갈래의 정의

| | 상황 | 색인 | 본문 | 기존 산출물 |
|---|---|---|---|---|
| **A** | 최초 생성 (색인 없음) | 이번 실행분으로 생성 | 이번 실행분 기록 | 없음 |
| **B** | 동일 날짜 재실행 | 같은 `contentId` 를 갈아치움. **건수 불변** | 같은 키를 다시 씀 | 보존 (같은 것을 갱신) |
| **C** | 다른 날짜 실행 | 이번 실행분 + **이어받은 나머지** | 이번 실행분만 | **보존** |
| **D** | 상류 실패 | **쓰지 않음** | 쓰지 않음 | 바이트 단위로 불변 |
| **E** | 정상 empty | 이어받은 것만 (없으면 count 0) | 없음 | **보존** |
| **F** | 동일 input 재처리 | B 와 같음. 새 키가 쌓이지 않음 | 같은 키 | 보존 |

B·F 의 본문 바이트는 `generatedAt`·`snapshot` 때문에 달라진다(후속 이슈). 키는 같다.

### 12.3 과거 날짜 replay

실측(로컬, AWS 미접촉): `2026-07-01` ~ `2026-09-13` **모든 날짜가 동일한 상위 8건**을
고른다. 풀은 139 → 243 으로 커지지만 relevance `0.900` 지진 5건 + `0.800` 3건이 전체를
지배한다. `MAX_DAILY=8` 은 제품 규칙이다(`handler.py:59`).

→ **날짜를 바꿔 부른다고 새 콘텐츠가 생기지 않는다.** 이 가정을 코드·문서 어디에도 두지
않는다. replay 가 기존 색인을 덮어쓰는지는 §12.6 의 시험 7·10 이 지킨다 —
병합 후에는 과거 날짜 replay 가 기존 여덟을 **색인에 그대로 남긴다.**

### 12.4 고아 본문 — 조사만 (자동 삭제 코드 없음)

**생성 조건.** 본문 쓰기 루프(`handler.py`)에 `try/except` 가 없고 색인 쓰기가 마지막이다.
본문 A·B 를 쓴 뒤 C 에서 예외가 나면 A·B 는 S3 에 남고 색인은 쓰이지 않는다.

**고아 판단 기준.** `archive/distribution-content/` 아래 객체 중 그 `contentId` 가
`archive/distribution-content.json` 의 `items[]` 에 없는 것.

**색인과 본문의 관계.** 본문은 불변 산출물, 색인은 가변 포인터다(§12.2). 본문을 지우는
코드는 없다 — `publisher.rollback()` 과 같은 원리로, 목록에서 내려도 객체는 남긴다.

**재처리 시 영향.** id 가 정체 기반이므로 같은 사건을 다시 만들면 **같은 키**를 다시 쓰고
색인에도 들어간다 → 그 고아는 스스로 해소된다. 다른 날짜만 계속 돌면 해소되지 않는다.

**병합이 줄인 범위.** 고치기 전에는 *정상적인* 다른 날짜 실행만으로도 기존 여덟이
색인에서 사라져 고아가 됐다. 이제 그 경로는 없다 — 고아는 **부분 실패** 때만 생긴다.

**cleanup 이 필요한가.** 지금은 아니다. ⑴ 접두사가 비공개라 노출이 아니다(익명 403 실측),
⑵ 객체 수가 적다, ⑶ 자동 삭제는 되돌릴 수 없고 버킷 버전 관리가 OFF 로 기록돼 있다.
필요한 것은 **목록화**(고아를 세어 보고)이고 삭제가 아니다. PROPOSAL_7 로 유지한다.

### 12.5 저장 경로 — 생산자와 소비자가 어긋나 있다

| | 경로 |
|---|---|
| 생산자 canonical (`handler.py:45-46`) | `archive/distribution-content.json` · `archive/distribution-content/<id>.json` |
| 소비자 (`prototype/js/distribution-admin.js:26-27`) | `events/distribution-content.json` · `events/distribution-content/<id>.json` |
| 로컬 미리보기 (`write_local`, `LOCAL_*`) | `events/…` (의도적 — `public_build` 가 그 경로만 막는다) |

**불일치 지점.** 관리 화면은 **옛 공개 경로**를 익명 fetch 한다. 새 위치를 읽지 않는다.
`archive/distribution-content` 를 읽는 소비자는 저장소 전체에 **0건**이다.

즉 지금 관리 화면은 운영 산출물을 못 본다. 이것은 이번 이전 작업의 **의도된 대가**다 —
승인 전 초안을 익명 공개에서 내리는 것이 먼저였다(§11.2).

**어느 소비자가 전환되어야 하나.** `prototype/js/distribution-admin.js` 하나다.
다만 `archive/` 는 비공개이므로 **경로만 바꿔서는 안 된다** — 403 이 된다. 필요한 것은
인증된 읽기 경로이고, `handler.py:75-76` 과 INTEGRATION-1 §17 이 "근본 해결은 인증된
관리 화면"이라고 이미 적어 두었다. 그 화면에는 Supabase 세션 게이트가 있다
(`distribution-admin.js:67-98`) — 페이지는 보호되지만 **자료는 S3 URL 로 직접** 가져온다.
그래서 필요한 것은 자격증명으로 S3 를 읽는 경로(서명 URL 또는 Edge Function 중계)다.
이번 작업에서 UI 를 임의로 고치지 않았다.

**3G 와의 관계.** 없다. 3G(Earth Event Assembler)는 `events/global.json` 을 읽어
`events/earth-events*.json` 을 쓴다 — distribution 의 `archive/` 계보와 별개 경로다.
distribution 의 소비자 문제는 3G 를 기다릴 이유가 없다.

### 12.6 회귀 시험

`aws/distribution/tests/test_upstream_and_index_safety.py` — 20건, 요구 1~10 대응.

```
1  상류 GET 실패        → UpstreamError · put 0
2  JSON parse 실패      → UpstreamError · put 0
3  모양 오류 3갈래      → UpstreamError · put 0   (원소 검사 포함)
3b verify 모양 오류     → UpstreamError · put 0
3c 색인 읽기 AccessDenied → UpstreamError · put 0 (기존 목록 보존)
4  정상 empty (빈 버킷) → 색인만 1건, count 0
4b 정상 empty (색인 있음) → 기존 8건 그대로, 이번 실행 0건
5  최초 생성            → 본문 2 + 색인 1, 전부 archive/
6  동일 input 재실행    → 같은 키만, 색인 건수 불변
7  다른 날짜            → 기존 8 + 새것 1 = 9, 유실 0
8  MAX_DAILY            → 20건 입력 → 8건, 쓰기 9건
9  이어받은 항목        → publicEligible 승격 없음, publicItems 0
9b 고아 본문           → 비공개 접두사, 공개 키 쓰기 시도는 거부
9c 모든 쓰기 키        → PRIVATE
10 2026-09-13 LIVE 보호 → 정상empty·새사건·과거replay 3갈래 전부 8건 생존
                          상류 실패 갈래는 색인 바이트 불변
+ merge_index 단위 4건 (없을 때·갈아치우기·generation 기록·정렬)
```

### 12.7 남은 것 — 별도 승인 필요

⚠️ **이 수정은 실행 역할에 권한 2개를 더 요구한다.** `read_index` 가 `get_object` 를 쓴다.
현재 인라인 정책은 `s3:PutObject` 만 준다. 그래서 지금 LIVE 로 돌리면
`AccessDenied` → `UpstreamError` → **아무것도 쓰지 않고 멈춘다.** 고장이 아니라
fail-closed 다(기존 색인을 덮어쓰는 쪽보다 낫다). 그러나 돌려면 아래가 필요하다:

```
s3:GetObject   arn:aws:s3:::earthus-cache-kr/archive/distribution-content.json
s3:ListBucket  arn:aws:s3:::earthus-cache-kr
               Condition StringLike s3:prefix = archive/distribution-content*
```

`ListBucket` 이 왜 필요한가 — 없으면 S3 는 **없는 키에도 AccessDenied** 를 준다
(2026-09-13 실측: 익명 요청에서 `events/` 의 없는 키가 404 가 아니라 403 이었다).
그러면 "첫 실행(색인 없음)"과 "권한 없음"을 구별할 수 없고, 구별할 수 없으면 쓰지 않는다.
`ListBucket` 이 붙으면 없는 키가 `NoSuchKey` 로 와서 첫 실행 갈래가 정상 동작한다.

IAM 변경은 이번 범위 밖이므로 적용하지 않았다.
