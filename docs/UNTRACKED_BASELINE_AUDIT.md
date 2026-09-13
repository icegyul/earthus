# 미추적 baseline 감사 — `aws/distribution` · `aws/_shared`

작성 2026-09-13 · 기준 커밋 `b1dd00a9`
관련 [V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md](V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md) §3.2 ·
[PHASE3_IMPLEMENTATION_REPORT.md](PHASE3_IMPLEMENTATION_REPORT.md)

> **이 조사에서 아무 파일도 commit · delete · reset 하지 않았다.** 읽기와 실행만 했다.
> 재현 실험은 전부 스크래치패드의 `git archive` 사본에서 했고 작업 트리를 건드리지 않았다.

## 0. 결론 — 세 문장

1. **이 24개 파일은 이 저장소의 실제 baseline 이다.** 추적된 운영 코드 4개가 그중 하나를
   import 하고, 추적된 테스트 12개 중 7개가 그것 없이는 **수집조차 되지 않는다**(실측).
2. **HEAD 에 없는 이유는 `.gitignore` 가 아니다.** 전 이력에 커밋이 0건이다 — 한 번도 `git add` 되지 않았다.
3. **소유권을 확정할 수 없다.** 파일 시각은 2026-09-08 11:56~13:55 한 시간대이고 git 기록이 없다.
   그래서 이번 작업에서 **전부 DO NOT TOUCH** 로 두고, 커밋 여부는 사용자 결정으로 남긴다.

### 0.1 가장 중요한 사실 — 325 PASS 는 이 기계에서만 재현된다

깨끗한 HEAD 사본(`git archive HEAD aws`)에서 추적된 SNS Factory 테스트를 돌린 결과:

```
$ python -m pytest aws/distribution/tests -q
E   ModuleNotFoundError: No module named 'content_contract'
ERROR aws/distribution/tests/test_bridge_client.py
ERROR aws/distribution/tests/test_bridge_expansion.py
ERROR aws/distribution/tests/test_executor.py
ERROR aws/distribution/tests/test_live_evidence.py
ERROR aws/distribution/tests/test_live_phase01.py
ERROR aws/distribution/tests/test_sns_factory_regression.py
ERROR aws/distribution/tests/test_verify_live.py
!!! Interrupted: 7 errors during collection !!!
```

작업 트리에서는 `325 passed, 6 skipped`. 새 클론에서는 **12개 테스트 파일 중 7개가 실행 불가**다.

### 0.2 내가 앞서 한 판단 하나를 정정한다

`git check-ignore -v "aws/distribution/sources/"` 가 `.gitignore:87:` 을 가리켜
"의도적으로 무시된다"고 보고했다. **틀렸다.**

```
$ sed -n '87p' .gitignore | od -c
0000000  \n            ← 빈 줄이다

$ git check-ignore -v "aws/distribution/sources/" | od -c
.gitignore:87:\taws/distribution/sources/     ← 패턴 칸이 비어 있다

$ for f in aws/distribution/sources/*.py; do git check-ignore -q "$f" && echo IGNORED || echo not; done
not / not / not / not
```

끝 슬래시가 붙은 **디렉터리 경로**를 넘겼을 때 나오는 Git 출력 artifact 였다.
개별 파일은 하나도 무시되지 않는다. `.gitignore` 에 `distribution` 항목은 119·120행의
`prototype/events/distribution-content*` 둘뿐이고 이 24개와 무관하다.

---

## 1. A. 최초 관측 시각

git 기록이 없으므로 **파일시스템 수정시각뿐**이다. 이것은 생성 시각이 아닐 수 있다(복사·편집으로 갱신된다).

| 시각대 | 파일 수 |
|---|---|
| 2026-09-08 11:56 ~ 12:02 | 13 (`__init__` 2 · `eligibility` · `hashtags` · `visual` · `sns_adapters` 8) |
| 2026-09-08 12:06 ~ 12:37 | 8 (`report_bridge` · `caption` · `lab_report` · `verify_scorecard` · `cli` · `generator` · `test_distribution` · `content_contract`/`provenance` 12:26) |
| 2026-09-08 13:53 ~ 13:55 | 2 (`validation` 13:53 · `handler` 13:55) |

**전부 2026-09-08 하루, 약 2시간 안이다.** 오늘(2026-09-13)이 아니다.

## 2. C. HEAD 에 대응 파일이 없는 이유

```
$ git log --all --oneline -- <각 경로>
→ 전부 0건
```

전 브랜치·전 이력에 **커밋이 한 건도 없다.** 삭제된 것이 아니라 **한 번도 추가되지 않았다.**
`.gitignore` 때문도 아니다(§0.2).

## 3. E. 다른 세션의 230여 개 변경과의 관계

작업 트리 전체 변경을 수정일로 묶으면:

```
?? 2026-09-07  70건      ?? 2026-09-08  34건     M 2026-09-08  32건
?? 2026-09-05  32건      ?? 2026-09-01  31건     ?? 2026-08-25  22건
M  2026-09-13  13건      ?? 2026-09-10  13건     ?? 2026-09-13   8건
… 2026-08-22 까지 이어짐
```

→ 이 작업 트리의 미커밋 상태는 **한 세션의 산물이 아니라 2026-08-22 부터 3주간 누적된 것**이다.
오늘(09-13) 것은 21건(아이콘·UI 작업)뿐이고, 문제의 24개는 **09-08 로 그와 별개**다.

즉 이 24개는 "지금 돌고 있는 다른 세션의 작업물"이 아니다. 더 오래된 미커밋 층이다.

## 4. D. ZIP 과의 관계 — 이것이 Phase 0 차이의 원인이다

`EARTHUS_V3_UNIFIED_ENGINE_SUITE_v3.zip` 안의 `reference/SNS_FACTORY_3c577d15.zip` 을 대조했다:

| 확인한 파일 13종 | ZIP 에 있나 |
|---|---|
| `content_contract.py` · `provenance.py` · `eligibility.py` · `handler.py` · `generator.py` · `validation.py` · `visual.py` · `caption.py` · `hashtags.py` · `cli.py` · `x.py` · `lab_report.py` · `test_distribution.py` | **전부 없음** |

ZIP 이 담은 것은 정확히 **추적된 집합**이다
(`analytics_fetch` · `archive` · `bridge_client` · `executor` · `provider_health` · `publish_queue` ·
`rate_limit` · `response_archive` · `scheduled_release` · `verify_live` · `sns_adapters/base` + 테스트 12).

→ Phase 0 에서 내가 "ZIP 쪽에 이 파일들이 빠져 있다 — 저장소가 상위집합"이라고 적은 것의
**진짜 이유가 이것이다.** ZIP 은 커밋 `3c577d15` 에서 만들어졌고, 그 커밋에 이 24개가 없었다.
ZIP 패키저가 파일을 빠뜨린 것이 아니다.

## 5. B·G·H. 참조 관계 — 정밀 집계

모듈 이름을 loose grep 하면 `handler`·`generator`·`cli` 같은 흔한 이름이 대량 오탐을 낸다.
아래는 **실제 import 문**(`^\s*import X\b` 또는 `^\s*from X import`)만 센 것이고,
동명의 추적 파일이 있는지도 확인했다.

| 미추적 모듈 | 추적 importer | 미추적 importer | 판정 |
|---|---|---|---|
| **`content_contract`** | **4** — `distribution/archive.py` · `distribution/publish_queue.py` · `distribution/sns_adapters/base.py` · `report-engine/integration_e2e.py` | 11 | **진짜 의존.** 동명 추적 파일 없음 |
| **`visual`** | **1** — `report-engine/capture.py` | 2 | **진짜 의존.** 동명 추적 파일 없음. `capture.py:36` 이 `sys.path` 에 `aws/distribution` 를 넣고 `:39` 에서 `import visual as vis` |
| `generator` | 5 (report-engine) | 3 | **오탐.** `aws/report-engine/generator.py` 가 추적돼 있고 같은 디렉터리가 먼저 해석된다 |
| `handler` | 1 (`gk2a-clouds/combined_handler.py`) | 0 | **오탐.** `gk2a-clouds/handler.py` 가 추적돼 있다 |
| `provenance` | 0 | 4 (`cli` · `generator` · `validation` · `test_distribution` — 전부 미추적) | 추적 코드는 직접 import 하지 않는다 |
| `eligibility` | 0 | 5 | 미추적 군집 안에서만 쓰인다 |
| `hashtags` · `caption` · `validation` | 0 | 2 각 | 같음 |
| `lab_report` · `report_bridge` · `verify_scorecard` · `cli` · `sns_adapters/*` 7종 | 0 | 0~1 | 같음 |

### 5.1 H. 없어지면 깨지는가 — 실측

| 실험 | 결과 |
|---|---|
| `git archive HEAD aws` 사본에서 `pytest aws/distribution/tests` | **7개 파일 수집 실패** (`ModuleNotFoundError: content_contract`) |
| 같은 사본에서 내가 만든 `aws/_shared/tests` | 108/111 통과 — 실패 3개는 `prototype/` 경로가 사본에 없어서 |
| `aws` + `prototype/supabase/migrations` + `prototype/js/earthus2/v11` + `prototype/v2-three/js` 사본 | **74/74 통과** → 내 코드는 미추적 파일에 의존하지 않는다 |

## 6. F. 운영 경로에 쓰이는가

| 확인 | 결과 |
|---|---|
| `distribution` Lambda 전용 배포 스크립트 | **없다.** `grep -rln distribution aws/*.sh` 히트 4건은 전부 앱 배포(`orbital-static`·`v2-preview`·`v3-kids`·`v3-paper`)이고 Lambda 가 아니다 |
| `deploy-python.sh` 가 파일을 싣는 방식 | `cp "$DIR"/*.py "$TMP"/` — **git 이 아니라 파일시스템에서 복사한다** |
| `_shared` 동봉 범위 | `_shared/kma_hub.py` **하나뿐**(`deploy-python.sh:104`). `content_contract.py`·`provenance.py` 는 동봉되지 않는다 |

→ 두 가지 결론:

1. **지금 배포 경로에 있지 않다.** distribution Lambda 를 올리는 스크립트가 없다.
2. **올리려 해도 지금은 못 올린다.** 추적된 `publish_queue.py` 가 `content_contract` 를 import 하는데
   `deploy-python.sh` 는 그 파일을 싣지 않는다 → 런타임 `ModuleNotFoundError` 가 된다.
   이것은 이 감사가 부수로 찾은 **배포 공백**이다.

⚠️ 다만 배포가 파일시스템에서 복사하므로, **이 기계에서 수동으로 올렸다면** 올라갔을 수 있다.
그 여부는 AWS 접근이 없어 확인하지 못했다(세션 만료).

## 7. I·J. 정식 소스인가 / 이번에 생겼나

| 질문 | 답 | 근거 |
|---|---|---|
| I. 저장소의 정식 소스인가 | **거의 확실히 그렇다** | 추적된 운영 코드 4개가 import한다 · 추적된 테스트 7개가 그것 없이 수집 실패 · 325개 테스트가 이 위에서 통과 · 저자 주석 문체가 저장소의 다른 파일과 같다(§10 인용) |
| J. 이번 작업에서 생성됐나 | **아니다** | 시각이 2026-09-08(5일 전). 내가 만든 파일은 2026-09-13 이고 전부 커밋됐다(`c481453f`·`b1dd00a9`) |

## 8. 파일별 기록 (24개)

`STATUS` 는 전부 `UNTRACKED (0 commits in all history)` · `FIRST OBSERVED` 는 전부 `2026-09-08` ·
`ZIP RELATION` 은 전부 `ZIP(3c577d15)에 없음 — 커밋에 없었기 때문` ·
`LIKELY OWNER` 는 전부 `미확정 (2026-09-08 SNS Factory 작업 세션 추정, git 기록 없음)` ·
`ACTION` 은 전부 **`DO NOT TOUCH`** 다. 아래는 나머지 칸이다.

| PATH | 바이트 | REFERENCED BY (추적 코드) | PRODUCTION PATH | TEST PATH | 권고 |
|---|---|---|---|---|---|
| `aws/_shared/content_contract.py` | 19,232 | **`distribution/archive.py` · `distribution/publish_queue.py` · `distribution/sns_adapters/base.py` · `report-engine/integration_e2e.py`** | 배포 스크립트가 싣지 않음(공백) | **추적 테스트 7개가 이 파일 없이 수집 실패** | **COMMIT-LATER (최우선)** |
| `aws/_shared/provenance.py` | 10,091 | 없음 (미추적 4개가 import) | 같음 | 미추적 테스트만 | **COMMIT-LATER (최우선)** |
| `aws/distribution/handler.py` | 12,623 | 없음 | Lambda 진입점이지만 배포 스크립트 없음 | 미추적 테스트 | COMMIT-LATER |
| `aws/distribution/eligibility.py` | 9,783 | 없음 | 같음 | 미추적 5개 | COMMIT-LATER |
| `aws/distribution/generator.py` | 11,984 | 없음 (report-engine 히트는 오탐) | 같음 | 미추적 | COMMIT-LATER |
| `aws/distribution/validation.py` | 20,573 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `aws/distribution/visual.py` | 10,162 | **`report-engine/capture.py`** | 같음 | 미추적 | **COMMIT-LATER (우선)** |
| `aws/distribution/caption.py` | 9,585 | 없음 | 같음 | 미추적 2개 | COMMIT-LATER |
| `aws/distribution/hashtags.py` | 3,978 | 없음 | 같음 | 미추적 2개 | COMMIT-LATER |
| `aws/distribution/cli.py` | 17,431 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `aws/distribution/__init__.py` | 0 | — | 같음 | — | COMMIT-LATER |
| `aws/distribution/sns_adapters/__init__.py` | 2,227 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `…/sns_adapters/facebook.py` | 927 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `…/sns_adapters/instagram.py` | 1,595 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `…/sns_adapters/linkedin.py` | 1,170 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `…/sns_adapters/threads.py` | 320 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `…/sns_adapters/tiktok.py` | 1,100 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `…/sns_adapters/x.py` | 1,532 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `…/sns_adapters/youtube.py` | 1,465 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `aws/distribution/sources/__init__.py` | 0 | — | 같음 | — | COMMIT-LATER |
| `aws/distribution/sources/lab_report.py` | 13,976 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `aws/distribution/sources/report_bridge.py` | 4,397 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `aws/distribution/sources/verify_scorecard.py` | 7,003 | 없음 | 같음 | 미추적 | COMMIT-LATER |
| `aws/distribution/tests/test_distribution.py` | 30,515 | 없음 | — | **자신이 테스트** (추적 테스트 12개 옆에 홀로 미추적) | COMMIT-LATER |

⚠️ `git status --porcelain` 은 21개 항목으로 보고한다 — `aws/distribution/sources/` 를
디렉터리 하나로 묶기 때문이다. 실제 `.py` 파일은 **24개**다.

## 9. ACTION 을 전부 `DO NOT TOUCH` 로 둔 이유

지시서: "파일 소유권이나 생성 경위를 확정할 수 없으면 건드리지 않는다."

확정하지 못한 것:
- 누가 만들었는지 (git 기록 0, 시각뿐)
- 일부러 커밋하지 않은 것인지, 잊은 것인지
- 다른 작업 트리·다른 기계에 더 최신 판이 있는지
- 커밋하면 다른 세션의 진행 중 작업과 충돌하는지

확정한 것: **없으면 추적된 테스트가 깨진다.** 그래서 **지우거나 되돌리는 것은 분명히 위험하다.**
커밋은 이롭겠지만 그 판단은 사용자의 것이다.

## 10. 이 파일들이 정식 소스로 보이는 근거 (문체)

`aws/distribution/eligibility.py` 머리말:

> **현상이 있다고 자동으로 콘텐츠가 되지 않는다.** 이 파일이 그 문지기다.
> 산식을 문서 밖에 두지 않는다 — 아래 SIGNALS 가 그대로 산식이다.
> 자료가 없는 기준은 0점이 아니라 `UNKNOWN` 이고, 판정에서 **분모에서도 빠진다.**

`aws/_shared/provenance.py` 머리말:

> 새 출처 레지스트리를 만들지 않는다(§68) · 공급자 정본은 이미 두 곳에 있다 …
> 모르면 **UNKNOWN 을 돌려준다.** 그럴듯한 이름을 지어내지 않는다.

지시서 절 번호(§68·§10·§27·§124·§125)를 인용하고, 실측 근거와 함정을 본문에 적는 이 문체는
저장소의 추적된 파일들과 같다. 외부에서 들어온 코드로 보이지 않는다.

## 11. 커밋하기로 결정한다면 — 확인할 것

이 문서는 커밋을 **하지 않았다**. 하기로 한다면 순서를 제안한다.

```
1. 다른 기계·다른 worktree 에 더 최신 판이 없는지 확인한다
   (git worktree list 에 prunable 항목이 17개 있다 — 대부분 /Volumes 경로로 지금 접근 불가)
2. 최우선 2개만 먼저 커밋한다: aws/_shared/content_contract.py · aws/_shared/provenance.py
   → 이것만으로 추적된 테스트 7개의 수집 실패가 해소된다
3. 깨끗한 클론에서 pytest aws/distribution/tests 가 통과하는지 확인한다
4. 통과하면 나머지 22개를 한 커밋으로 올린다
5. deploy-python.sh 의 _shared 동봉 범위를 고친다(§6-2 의 배포 공백)
   — 지금은 kma_hub.py 만 싣는다
```

⚠️ 5번은 별개 결함이다. 커밋과 무관하게 남는다.
