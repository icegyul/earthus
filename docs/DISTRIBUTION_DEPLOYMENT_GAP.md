# DEFECT — `deploy-python.sh` 가 distribution Lambda 를 온전히 싸지 못한다

작성 2026-09-13 · 기준 커밋 `043f1c03`
발견 경로 [UNTRACKED_BASELINE_AUDIT.md](UNTRACKED_BASELINE_AUDIT.md) §6 의 부수 발견
관련 [PHASE3_IMPLEMENTATION_REPORT.md](PHASE3_IMPLEMENTATION_REPORT.md)

## STATUS: **BLOCKED_FOR_LIVE_DEPLOYMENT**

`aws/distribution` 을 `deploy-python.sh` 로 올리면 **콜드 스타트에서 즉시 죽는다.**
`ModuleNotFoundError` 가 init 단계에서 나므로 한 번도 실행되지 않는다.

이 문서는 **진단과 권고**다. 배포 스크립트를 **수정하지 않았다**(이번 범위 밖).
실제 AWS 배포 전에 반드시 해결해야 한다.

---

## 1. 현재 packaging behavior

`aws/deploy-python.sh <함수이름>` → `DIR = aws/<함수이름>` (`:36`)

패키지에 들어가는 것 (`:103`~`:118`):

```bash
cp "$DIR"/*.py "$TMP"/                      # ① 그 폴더의 최상위 .py 만. 하위 디렉터리는 안 들어간다
SHARED=".../_shared/kma_hub.py"             # ② _shared 에서 kma_hub.py 하나만 후보다
if grep -q "import kma_hub" "$DIR"/*.py; then
  cp "$SHARED" "$TMP"/                      #    그것도 import kma_hub 가 있을 때만
fi
if [ -d "$DIR/contracts" ]; then
  cp -R "$DIR/contracts" "$TMP"/            # ③ contracts 디렉터리만 특례로 재귀 복사
fi
find "$TMP" -type d \( -name tests -o -name test -o -name __pycache__ \) -prune -exec rm -rf {} +
find "$TMP" -maxdepth 1 -name "test_*.py" -delete
```

세 가지 성질이 이 결함의 원인이다:

| # | 성질 | 결과 |
|---|---|---|
| ① | `cp "$DIR"/*.py` 는 **재귀하지 않는다** | `sns_adapters/` · `sources/` 패키지가 빠진다 |
| ② | `_shared` 에서 **`kma_hub.py` 하나만** 후보이고, `import kma_hub` 가 있어야 복사된다 | `aws/distribution/*.py` 에 `import kma_hub` 가 **없다**(실측) → `_shared` 가 **한 파일도** 들어가지 않는다 |
| ③ | 재귀 복사 특례는 `contracts/` 이름에만 걸려 있다 | `sns_adapters` · `sources` 는 해당되지 않는다 |

## 2. 실제 dependency

### 2.1 `_shared` — 정확히 4개 (전부 leaf, 서로 import 하지 않는다)

`aws/distribution/**` 가 실제로 `import` 하는 `_shared` 모듈 전수:

| 모듈 | git | 왜 필요한가 |
|---|---|---|
| `content_contract.py` | **추적됨** (`043f1c03` 에서 추가) | `generator` · `publish_queue` · `archive` · `sns_adapters/base` · `sources/lab_report` |
| `provenance.py` | **추적됨** (`043f1c03` 에서 추가) | `generator` · `cli` · `validation` |
| `report_contract.py` | 이전부터 추적됨 | `generator` · `sources/lab_report` · `sources/verify_scorecard` |
| `report_period.py` | 이전부터 추적됨 | `sources/*` |

⚠️ 넷 다 `_shared` 안에서 서로를 import 하지 않는다(실측). 그래서 **이 4개만 넣으면 닫힌다** —
`governance` · `publication_privacy` · `write_path` · `write_policy` · `phenomenon_registry` · `kma_hub` 는 필요 없다.

### 2.2 하위 패키지 — 2개

| 경로 | 파일 | git |
|---|---|---|
| `aws/distribution/sns_adapters/` | `__init__.py` + `base.py` + 제공자 7종(`x` · `instagram` · `facebook` · `linkedin` · `threads` · `tiktok` · `youtube`) | `base.py` 만 추적됨. 나머지 8개 **미추적** |
| `aws/distribution/sources/` | `__init__.py` · `lab_report.py` · `report_bridge.py` · `verify_scorecard.py` | 4개 전부 **미추적** |

### 2.3 경로 계산이 Lambda 에서 성립하지 않는다

`handler.py:25-26` · `generator.py:17-18` · `publish_queue.py:15` 가 모두 같은 방식을 쓴다:

```python
_HERE = os.path.dirname(os.path.abspath(__file__))        # 로컬: aws/distribution
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))   # 로컬: aws/_shared
```

Lambda 에서는 zip 내용이 `/var/task` 로 풀린다 → `_HERE = /var/task` →
`dirname(_HERE)/_shared` = **`/var/_shared`** 다. 그런 디렉터리는 없다.

즉 `_shared` 파일을 zip 에 넣더라도 **`/var/task/` 최상위에 평평하게** 넣어야 한다
(`kma_hub.py` 를 그렇게 넣고 있다 — `cp "$SHARED" "$TMP"/`).
`_shared/` 하위 디렉터리로 넣으면 위 경로 계산이 여전히 못 찾는다.

## 3. 예상 runtime failure mode

콜드 스타트 import 사슬을 따라가면 첫 실패 지점이 정해진다:

```
Lambda init → handler.py
  :28  import generator as gen
        → generator.py
          :20  import content_contract as cc      ← 여기서 죽는다
```

```
Runtime.ImportModuleError
  Unable to import module 'handler': No module named 'content_contract'
```

**init 단계 실패이므로 함수 본문이 한 번도 실행되지 않는다.** 로그에 남는 것은 이 한 줄뿐이고,
`events/distribution-content.json` 은 만들어지지 않는다. 스케줄이 걸려 있다면 매 회차가 같은 줄만 남긴다.

`content_contract` 를 넣어도 다음 순서로 계속 실패한다:

| 순서 | 실패 모듈 | 원인 |
|---|---|---|
| 1 | `content_contract` | `_shared` 미동봉 |
| 2 | `report_contract` | 같음 |
| 3 | `provenance` | 같음 |
| 4 | `report_period` | 같음 (`sources/*` 가 부른다) |
| 5 | `sns_adapters` | 하위 디렉터리 미동봉 |
| 6 | `sources` | 하위 디렉터리 미동봉 |

## 4. Reproduction

### 4.1 패키징 내용만 재현 (AWS 불필요)

```bash
cd "<저장소>/aws"
TMP=$(mktemp -d)
cp distribution/*.py "$TMP"/                      # deploy-python.sh:103 과 동일
grep -q "import kma_hub" distribution/*.py && echo "kma_hub 동봉" || echo "kma_hub 조건 불충족 → _shared 0개"
[ -d distribution/contracts ] && echo "contracts 동봉" || echo "contracts 없음"
ls -1 "$TMP" | grep -E "sns_adapters|sources|content_contract|provenance|report_contract|report_period" \
  || echo "→ 필요한 것이 하나도 안 들어갔다"
```

실측(2026-09-13): `kma_hub 조건 불충족 → _shared 0개` · `contracts 없음` ·
`→ 필요한 것이 하나도 안 들어갔다`.

### 4.2 import 실패 재현 (AWS 불필요)

```bash
TMP=$(mktemp -d) && cp aws/distribution/*.py "$TMP"/ && cd "$TMP" && python -c "import handler"
```

기대: `ModuleNotFoundError: No module named 'content_contract'`
(로컬에서는 `_shared` 가 상대경로로 잡히므로, 반드시 `$TMP` 처럼 **저장소 밖**에서 돌려야 재현된다)

### 4.3 관련 실측 — 추적 테스트 쪽 증거

같은 누락이 테스트에서도 드러났다 ([UNTRACKED_BASELINE_AUDIT.md](UNTRACKED_BASELINE_AUDIT.md) §0.1):

```
git archive HEAD aws → 사본에서 pytest aws/distribution/tests
  043f1c03 이전 : 수집 오류 7건 (ModuleNotFoundError: content_contract)
  043f1c03 이후 : 129 failed / 125 passed / 6 skipped
```

## 5. 지금 배포돼 있는가

| 확인 | 결과 |
|---|---|
| `distribution` 전용 배포 스크립트 | **없다.** `grep -rln distribution aws/*.sh` 히트 4건은 전부 앱 배포이고 Lambda 가 아니다 |
| 스케줄 등록 | **없다.** `aws/schedules.sh` · `aws/configure-*.sh` 에 `distribution` 히트 0건 |
| 운영 함수 존재 여부 | **확인 못 했다** — AWS 세션 만료(`aws sts get-caller-identity` → session expired) |

→ 저장소 안의 어떤 스크립트도 이 Lambda 를 올리지 않는다. 다만 배포가 **파일시스템에서 복사**하므로
누군가 수동으로 `./deploy-python.sh distribution` 을 돌렸을 가능성은 배제할 수 없다.
그랬다면 위 실패 모드로 죽고 있을 것이다. **자격이 풀리면 가장 먼저 확인할 항목이다.**

## 6. Recommended fix

### 6.1 최소 수정 — `deploy-python.sh` 에 두 가지를 더한다

```bash
# ① _shared 동봉을 import 기반으로 일반화한다 (kma_hub 특례를 없애지 않고 확장)
for mod in kma_hub content_contract provenance report_contract report_period \
           governance publication_privacy phenomenon_registry write_path write_policy; do
  if grep -qE "^\s*import ${mod}\b|^\s*from ${mod}\b" "$DIR"/*.py "$DIR"/*/*.py 2>/dev/null; then
    SRC="$(dirname "$0")/_shared/${mod}.py"
    [ -f "$SRC" ] || { echo "❌ ${mod}.py 없음: $SRC"; exit 1; }
    cp "$SRC" "$TMP"/          # ⚠️ 반드시 최상위에 평평하게 — §2.3
    echo "  · ${mod}.py 동봉"
  fi
done

# ② 하위 패키지를 재귀 복사한다 (contracts 특례와 같은 방식)
for pkg in "$DIR"/*/; do
  name="$(basename "$pkg")"
  case "$name" in tests|test|__pycache__|contracts) continue;; esac
  [ -f "$pkg/__init__.py" ] || continue          # 파이썬 패키지만
  cp -R "$pkg" "$TMP"/
  echo "  · ${name}/ 패키지 동봉"
done
```

⚠️ ①의 `exit 1` 이 중요하다. 지금은 필요한 모듈이 없어도 조용히 지나가고 런타임에 죽는다.
`kma_hub` 분기(`:107`)는 이미 그렇게 하고 있다 — 같은 태도를 나머지에 적용한다.

### 6.2 배포 후 검증을 스크립트에 넣는다

패키징만 맞아도 import 가 성립하는지는 별개다. zip 을 만든 직후 로컬에서 확인할 수 있다:

```bash
(cd "$TMP" && python -c "import handler" >/dev/null) \
  || { echo "❌ 패키지 안에서 handler import 실패 — 배포하지 않는다"; exit 1; }
```

이 한 줄이 §3 의 실패 모드 전체를 배포 **전에** 잡는다.

### 6.3 미추적 22개 문제와의 관계

패키징을 고쳐도 **파일이 없으면 올라가지 않는다.** `sns_adapters` 제공자 7종과 `sources/` 4개가
여전히 git 미추적이다([UNTRACKED_BASELINE_AUDIT.md](UNTRACKED_BASELINE_AUDIT.md) ACTION = DO NOT TOUCH).

배포는 파일시스템에서 복사하므로 **이 기계에서는** 올라간다. 다른 기계·CI 에서는 안 된다.
둘은 별개 결함이고 **둘 다** 고쳐야 LIVE 배포가 성립한다.

## 7. 해결 순서 (실제 AWS 배포 전)

```
1. 자격 확보 후 운영에 earthus-distribution 계열 함수가 있는지 확인한다
   (있고 죽어 있다면 로그에 Runtime.ImportModuleError 가 반복돼 있을 것이다)
2. 미추적 22개의 커밋 여부를 정한다 (사용자 결정)
3. deploy-python.sh 에 §6.1 두 블록 + §6.2 검증 한 줄을 넣는다
4. 로컬에서 §4.1·§4.2 재현이 통과하는지 본다
5. 그 다음에 배포한다
```

⚠️ 3번 전에 배포하면 죽는다. 그래서 이 문서의 상태가 **`BLOCKED_FOR_LIVE_DEPLOYMENT`** 다.

## 8. 이 문서에서 하지 않은 것

- `aws/deploy-python.sh` 를 **수정하지 않았다** (이번 범위 밖 — 사용자 지시)
- 미추적 22개를 **건드리지 않았다** (ACTION = DO NOT TOUCH 유지)
- 운영 Lambda 상태를 **확인하지 못했다** (AWS 세션 만료)
- §6.1 의 코드를 **실행해 보지 않았다** — 제안이고, 넣을 때 §4 재현으로 검증해야 한다
