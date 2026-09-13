# PHASE 3G — Earth Event Assembler 구현 보고

작성 2026-09-13 · 브랜치 `earthus-v2/real-living-earth-render`
범위: **구현 + 로컬/픽스처/staging 검증까지.** AWS·S3·Postgres 적용은 다음 승인으로 분리한다.

    AWS_WRITE = 0        이번 라운드에 AWS CLI 호출을 하지 않았다 (읽기도 없다)
    PUBLIC_WRITE = 0     공개 접두사 쓰기 0 — 코드 문으로 막고 테스트로 고정했다
    POSTGRES_WRITE = 0   SQL 은 여전히 미적용 초안이다
    CANONICAL_WRITE      STAGING_ONLY (기본 dryRun · writer 미주입 시 쓰기 0)
    SKIP_ADDED = 0       테스트를 지우거나 skip 을 추가하지 않았다

---

## 1. 무엇을 만들었나

### 1.1 새 함수 `aws/earth-events/` (미배포)

| 파일 | 줄 | 하는 일 |
|---|---|---|
| `handler.py` | 212 | 진입점 · 입력 판독 · 쓰기 모드 문 · FAIL-CLOSED 목록 |
| `normalize.py` | 253 | GDELT 사건 → **출처 비의존 정규 레코드** |
| `assembler.py` | 813 | 16 단계 파이프라인과 문(gate) |
| `requirements.txt` | 11 | 주석만. 없으면 NetCDF 기본 의존성 30MB 가 붙는다 |
| `tests/fixtures.py` | 95 | 상류 필드 모양을 흉내 낸 최소 입력 조립기 |
| `tests/test_fail_closed.py` | 166 | FAILURE ≠ EMPTY |
| `tests/test_boundary_and_write.py` | 153 | 공개 경계 · 쓰기 모드 |
| `tests/test_assembly.py` | 310 | 사건 식별 · 독립 출처 · 진실 등급 · 시각 |

### 1.2 새 공용 부품 `aws/_shared/` — 전부 **기존 규칙의 이식**

| 파일 | 줄 | 원본 | 새로 만든 것 |
|---|---|---|---|
| `truth_vocabulary.py` | 175 | `sql/20260913_earth_event_core.sql` 의 `create domain` 4종을 **파싱**해 읽는다 | 없음 (어휘를 베껴 쓰지 않는다) |
| `event_fusion.py` | 167 | v11 `eventSimilarity` | `group()` — 묶기만 한다. v11 `stableId`·`clusterEarthEvents` 는 **이식하지 않았다** |
| `claim_gate.py` | 101 | v11 `RULES`/`evaluateClaim`/`claimLabel` | `is_known()`·`gate_all()` (모르는 주장 종류를 막는 문) |
| `geolocate.py` | 180 | `aws/gdelt-events/handler.py` 의 `place_doubt`·`build_gazetteer`·`km_between` | `canonical_place()` — 결정 ⑥ 우선순위 |
| `earth_event_id.py` | 156 | — | `evt_<sha256 앞 20 hex>` (결정 ②③④⑤) |

### 1.3 기존 파일에 더한 것

| 파일 | 더한 것 |
|---|---|
| `aws/_shared/article_dedup.py` | `independence_units_for()` — 결정 ① 의 4단 우선순위. 기존 21건 통과 유지 |
| `aws/_shared/provenance.py` | `events/global.json` 항목 (`truthType: "UNKNOWN"` — 결정 ⑫) |
| `aws/_shared/lambda_package.py` | `module_data_files()` — §5.5 의 패키징 차단 해소 |
| `aws/_shared/write_policy.py` | 새 쓰기 자리 1건 등록 (§5.6) |
| `aws/_shared/tests/test_lambda_package.py` | 패키징 규칙 시험 7건 |

---

## 2. 16 단계 (`assembler.STAGES`)

```
 1 INPUT              입력 본문·sha256
 2 FRESHNESS          봉투 검사 · 신선도 · 잘림 신호          ← fail-closed
 3 NORMALIZE          normalize.py
 4 SOURCE_RELATION    기사 ↔ earthus_source 관계
 5 ARTICLE_DEDUP      article_dedup.deduplicate() + 계보
 6 EVENT_FUSION       event_fusion.group() + reconcile_identity()
 7 CLAIM_EVIDENCE     claim_gate.gate_all() + 증거 노드
 8 INDEPENDENCE       independence_units_for()                ← 결정 ①
 9 TRUTH_STATUS       truth_vocabulary.judge()
10 EARTH_EVENT        earthus_earth_event 모양 조립
11 EVENT_ID           earth_event_id.event_id()               ← 결정 ②③④
12 CANONICAL_OUTPUT   PRIVATE / SHADOW 문서
13 CANONICAL_WRITE    STAGING_ONLY
14 RAW_ARCHIVE        원자료 보관 **참조** (적재기는 아직 없다)
15 INDEX_CONSISTENCY  index_consistency.check(mode=FIXTURE)
16 HEALTH             결과 요약
```

`HEALTH.stagesRun` 이 16 단계 전부를 스스로 보고한다 — 테스트가 그것을 고정한다.

### 2.1 재사용 우선순위를 지켰다

중복 구현을 만들지 않았다. 조립기가 부르는 기존 구현:
`gdelt-events`(위치 의심 알고리즘) → `v11 event-fusion`(결합 점수) → `article_dedup`(중복·계보·독립 회계)
→ `provenance`(출처) → `publication_privacy`(공개 경계) → `index_consistency`(색인 대조)
→ `truth_vocabulary`(SQL domain 파싱) → `claim_gate`(v11 주장 규칙).

패키저가 읽어 낸 실제 의존 폐쇄 — 손으로 적은 목록이 아니다:

```
$ python aws/_shared/lambda_package.py plan earth-events _shared
topLevelModules  assembler.py · handler.py · normalize.py
sharedModules    article_dedup · claim_gate · earth_event_id · event_fusion ·
                 geolocate · index_consistency · provenance · publication_privacy ·
                 truth_vocabulary
dataFiles        sql/20260913_earth_event_core.sql
subPackages      (없음)
```

---

## 3. 실입력 1회 실행 (픽스처 · AWS 쓰기 0)

입력은 운영에서 내려온 실제 `events/global.json` 사본이다.
`sha256 5b69740d35fcdf85627a081fb6fdd8785d0d93f367ad1e789f0db1d2b08adde1` · 102,579 B ·
`generated 2026-09-13T10:35:00Z` · `windowHours 3` · `cappedByLimit true` · `maxEvents 150`.
기준 시각은 `nowEpoch`(=10:35Z + 25분)을 **명시해서** 넣었다 — 재현 가능하게 하기 위한 것이고
결과에 `nowEpochKind: "GIVEN"` 으로 적힌다.

| 단계 | 실측 |
|---|---|
| NORMALIZE | 레코드 150 · 제목 있음 144 · `PLACE_ID` 143 · `placeDoubt` 7 · 시간정밀도 `RELATIVE` 150 |
| SOURCE_RELATION | 출처 행 115 · 출처가 붙은 기사 198 |
| ARTICLE_DEDUP | 기사 198 → 묶음 141 (중복 57 · 충돌 1) · 관계 `ORIGINAL 141 / SYNDICATION_OF 35 / REWRITE_OF 22` |
| EVENT_FUSION | 결합 묶음 129 · **`identityReconciled 0`** · 최대 묶음 4 · 2건 이상 묶인 사건 15 |
| CLAIM_EVIDENCE | 증거 노드 157 · 허용된 주장 **0** · 거부된 주장 258 · `official_safety` 0 |
| INDEPENDENCE | 독립 출처 분포 `1→110 · 2→12 · 3→5 · 4→2` · `corroborated` 16 · 미해소 기사 0 |
| TRUTH_STATUS | `REPORTED 129` (FACT·CORROBORATED 0) |
| EARTH_EVENT | 사건 129 · 제목출처 `ARTICLE 125 / LABEL 4` · `location_doubt` 7 · 좌표 있음 129 · `SHADOW 129` |
| EVENT_ID | 고유 129 / 129 (충돌 0) · `evt_` · 20 hex · `event_key_version 1` · 버킷 3시간 |
| CANONICAL_OUTPUT | 문서 129 · `earthus.earth-event.v1` · `PRIVATE 129` · `publicReleaseAllowed 0` |
| CANONICAL_WRITE | 계획 129 · **written 0** · `wroteNothing true` · mode `STAGING` |
| RAW_ARCHIVE | `archive/earth-events/raw/dt=2026-09-13/hh=10/` · `part-*.jsonl.gz` · **object null** |
| INDEX_CONSISTENCY | **PASS (FIXTURE)** |
| HEALTH | `publicWrites 0` · `awsWrites 0` · 16/16 단계 |

정본 키 첫 건 (형태 확인용):
`archive/earth-events/canonical/v1/event_id=evt_135f791cdc6f299f36d3.json` · 3,974 B.

`corroborated 16` 은 독립 2 이상인 19건 중 위치 의심으로 3건을 뺀 값이다 —
위치를 못 믿는 사건에 교차검증을 붙이지 않는다.

> ⚠️ **FIXTURE PASS 는 운영 PASS 가 아니다.** `index_consistency.require_live()` 가 FIXTURE 결과를
> 예외로 거부하고, 테스트가 그 거부를 고정한다. 운영 판정은 실제 S3·Postgres 판독기로
> `mode=LIVE` 로 다시 돌려야 한다 — 이번 라운드에 하지 않았다.

---

## 4. 테스트

| 묶음 | 결과 | 비고 |
|---|---|---|
| `aws/earth-events/tests` | **52 passed** | 신규 |
| `aws/_shared/tests` | **211 passed** + 45 subtests | 신규 `test_geolocate.py`(16) · `test_3g_vocabulary.py`(28) · 패키징 7 |
| 패키징 게이트 `test_lambda_package.py` | **50 passed** + 5 subtests | 43 → 50 |
| `aws/distribution/tests` | **392 passed · 6 skipped** | 기준선 유지. skip 은 기존 것이고 늘리지 않았다 |
| `aws/report-engine/tests` | **320 passed** | 기준선 유지 (§5.7 주의) |
| `npm test` | **143 pass / 0 fail** | |
| v11 `node --test tools/earthus2-v11/*.test.mjs` | **65 pass / 0 fail** | |
| `services/research-runtime` (`PYTHONPATH=".;.deps"`) | **80 passed** + 8 subtests | |

`SKIP_ADDED = 0` · 삭제한 테스트 0.

> ⚠️ **묶음은 디렉터리별로 돌린다.** 저장소의 함수마다 최상위 `handler.py` 가 있어서(Lambda 가 그
> 이름을 요구한다) 여러 묶음을 한 번에 돌리면 `sys.modules['handler']` 를 서로 가린다.
> 실측 — `_shared + distribution + report-engine` 을 한 번에 돌리면 **26건이 깨진다**(기존 성질이다).
> 3G 묶음은 그 수를 **늘리지 않는다**: `tests/fixtures.py:load_handler()` 가 핸들러를 경로로
> `earth_events_handler` 라는 고유 이름으로 불러온다. 네 묶음을 함께 돌린 결과도 같은 26건이다
> (처음에는 73건이었고, 그 47건이 내 몫이어서 고쳤다).

3G 테스트 52건이 덮는 것 (대표):

- **FAIL-CLOSED 10건** — 파일 없음 · S3 오류 · JSON 아님 · 다른 출처 파일 · `generated` 없음 ·
  미래 시각 · 창보다 오래됨 · `events` 가 목록 아님 · 사건 하나 깨짐 → **전체 중단** · 객체 아닌 사건
- **정상 empty 4건** — 사건 0건은 예외가 아니다 · 빈 배치도 출처·원자료 참조를 적는다 ·
  잘린 입력은 실패가 아니지만 "전부"라고 말하지 않는다
- **공개 경계 13건** — 정본 키 형태 · 남의 id 거부 · `events/`·`app/`·`reports/published/` 거부 ·
  모르는 접두사 거부 · LIVE 모드 거부 · 모르는 모드 거부 · writer 없으면 쓰기 0 ·
  핸들러 LIVE 문은 payload + 환경변수 둘 다 요구 · staging 도 디렉터리를 지어내지 않음 ·
  staging 산출물이 `events/` 아래에 생기지 않음 · 항상 SHADOW/PRIVATE · SHADOW 아닌 문서 거부
- **사건 식별 6건** — `evt_<20hex>` · 결정성 · **상류 id 가 바뀌어도 같은 사건** ·
  유형·장소가 다르면 다른 id · 같은 신원 묶음 합치기 · 정본 중복은 색인 검사에서 차단
- **독립·진실 8건** — 전재 20건도 1 · 독립 2 이상에서만 교차검증 · 위치 의심은 교차검증 차단 ·
  NEWS 는 FACT 가 되지 않음 · 증거 없으면 주장에 이름 없음 · 등급·현상 id 를 지어내지 않음 ·
  DATA_STATE 는 입력 나이에서 나옴
- **시각 4건** — `occurred_at` 항상 null · 3시간 UTC 버킷 · 제목 없으면 라벨(헤드라인 금지) ·
  대표는 점수가 아니라 고정 규칙으로 고름
- **위치 3건** · **투영 4건** (FIXTURE 전용 · 검사기가 아는 스키마 · 색인 행이 해시를 들고 있음 · 16단계)

---

## 5. 이 라운드에 **찾아서 고친 것**과 **찾았지만 못 고친 것**

### 5.1 `geolocate.FAR_KM` 을 300 으로 잘못 옮겼다 — 고쳤다

운영 사본은 `gdelt-events/handler.py:174 FAR_KM = 600` 이다. 옮길 때 300 으로 적었고,
값이 작으면 위치 의심이 과도하게 늘어 확정 승격이 막힌다.
`aws/_shared/tests/test_geolocate.py` 가 운영 파일의 상수를 **AST 로 읽어** 대조하다가 잡았다.
→ 600.0 으로 고치고, 두 사본의 차이가 **판정을 바꾸지 않는 방어 코드 2건뿐**임을 파일 머리말에 적었다.

### 5.2 정규화 실패가 `AssemblyError` 가 아니었다 — 고쳤다

`NormalizeError` 가 그대로 올라가서, `AssemblyError` 만 잡는 호출자는 놓친다.
놓치면 실패가 조용히 빈 결과가 된다. → 조립기가 감싸서 다시 던진다.

### 5.3 `HEALTH.stagesRun` 이 자기 자신을 빼고 15 를 보고했다 — 고쳤다

### 5.4 결합과 신원이 서로 다른 것을 보고 있었다 — `reconcile_identity()` 를 더했다

결합은 좌표 거리로 보고(v11 규칙), 신원은 `place_key` 로 본다(결정 ⑥).
그래서 **같은 `featureId` 인데 좌표가 멀게 찍힌 두 레코드**는 결합에서 갈라지고,
갈라진 둘이 같은 `event_id` 를 만들어 **한 정본 키를 다툰다.**
v11 결합 규칙은 v11 테스트가 고정하고 있으므로 손대지 않고, 결합 뒤에 **신원이 같은 묶음을 합치는**
단계를 더했다(결정 ④ 가 "신원이 같으면 같은 EarthEvent" 라고 정했으므로 새 규칙이 아니다).
실입력에서는 `identityReconciled = 0` — **동작을 바꾸지 않고 안전만 더한다**는 실측 근거다.
id 충돌 검사는 구조적 단정으로 남겨 뒀다.

### 5.5 패키징 차단 — `truth_vocabulary` 가 zip 에서 죽었다. 고쳤다

`truth_vocabulary.py` 는 어휘를 코드에 베껴 쓰지 않고 `_shared/sql/20260913_earth_event_core.sql` 을
**import 시점에** 읽는다. 패키저는 `.py` 만 넣었다. staged 패키지를 Lambda 조건(패키지만 `sys.path`)으로
import 하면 이렇게 죽었다 — 실측:

```
IMPORT FAIL: VocabularyError 정본 SQL 을 읽지 못했다:
  [Errno 2] No such file or directory: '…/stage3g/sql/20260913_earth_event_core.sql'
```

→ `lambda_package.module_data_files()` 를 더했다. `os.path.join(<자기디렉터리>, "…", "<파일>.<확장자>")`
관용구를 **AST 로** 찾아(`_HERE = os.path.dirname(os.path.abspath(__file__))` 같은 최상위 대입을
구문으로 식별한다 — 이름을 고정 목록으로 적지 않는다) **상대 경로를 유지해** 넣는다.
`crossFunctionFiles` 와 다른 점이 이것이다: 그쪽은 zip 루트에 평평하게, 이쪽은 `sql/…` 를 `sql/…` 로 —
런타임에 `_HERE` 가 곧 zip 루트이기 때문이다.

고친 뒤 실측:

```
staged 파일 13개 … sql/20260913_earth_event_core.sql 포함
IMPORT OK   earthus.earth-event.v1 · TRUTH_STATUS 8 · SOURCE_KIND 6
verify      handler import 통과 (exit 0)
```

staged 패키지와 저장소 사본이 **같은 결과**를 낸다 — 같은 입력에 사건 129건, 정본 키 집합 sha256
`aad143f2d7c7cca2fac863bf58931641da7535f7ead7335064d8957eb6bd488c` 가 양쪽 동일.

### 5.6 새 쓰기 자리를 정책표에 등록했다

`aws/report-engine` 의 쓰기 경로 감사가 새 함수의 쓰기 2곳을 `DENY_UNPROVEN_DESTINATION` 으로
잡았다 — 검사기가 제 일을 한 것이다. 목적지가 변수여서 값으로 증명되지 않는다.
→ `write_policy.REVIEWED_UNPROVEN` 에 1건을 등록했다(근거 줄 포함). 등록 뒤 감사 결과:

```
denied []
counts  ALLOW_APP 61 · ALLOW_FEED 138 · ALLOW_PRIVATE 41 · SKIP_WRAPPER_DEF 26 · ALLOW_OTHER_STORE 1
```

### 5.7 못 고친 것 — 보고만 한다

| # | 사실 | 판정 |
|---|---|---|
| ① | `aws/source-governance/handler.py:44-47` 이 `registry.draft.json` 을 **import 시점에** 읽고 예외를 삼키지 않는다. `deploy-python.sh` 는 `contracts/` 외의 비-.py 파일을 복사하지 않는다 → 그 파일이 zip 에 없으면 콜드 스타트에서 `FileNotFoundError`. §5.5 의 새 규칙이 이것도 자동으로 메운다(패키징 계획에 `registry.draft.json` 이 들어온다). | **운영 상태 NOT_VERIFIED** — 확인하려면 배포된 zip 을 읽어야 하고 이번 라운드는 AWS 호출 0 이다. ⚠️ 내 변경이 그 함수의 **다음 배포 artifact 를 바꾼다**(파일 1개 추가). 배포는 이번 범위가 아니다 |
| ② | `aws/report-engine/tests/test_integration8_write_path.py::test_배포기가_자료_피드에_쓰면_막는다` 가 **실행 디렉터리에 따라** 결과가 달라진다. `verdicts()` 가 상대 경로를 `os.path.relpath(..., REPO)` 로 넘겨서, `aws/report-engine` 에서 돌리면 가짜 경로가 `aws/report-engine/tools/…` 로 해석되어 `ALLOW_FEED` 가 된다. 저장소 루트에서는 320건 전부 통과한다 | **기존 결함 · 내 변경과 무관** (고치지 않았다 — 범위 밖) |
| ③ | SQL `earthus_earth_event.kind` 주석은 어휘를 `TC EQ FLOOD WILDFIRE …(CAMEO 코드가 아니다)` 라고 적는다. 우리가 가진 유일한 분류기는 GDELT root(`DIS` 또는 CAMEO 대분류 7종)를 준다. 옮기는 검증된 분류기가 없다 | **미결정** — 지어내지 않았다. 산출물에 `kind_vocabulary: "gdelt-root"` 를 적어 오해를 막는다 |
| ④ | `phenomenon_id` (66종 레지스트리)를 맞추는 규칙이 없다 | **미결정** — null 로 비웠다 |
| ⑤ | 상류가 기사를 이미 병합한다(`merged`, 실측 150건 중 74건). 우리가 보는 기사는 head url + `alt[]`(최대 4) 뿐이므로 **독립 출처 수는 하한**이다 | 보수적 방향이라 허용. 정본 문서 `limits[]` 에 적는다 |
| ⑥ | 시간 정밀도(`EXACT/ESTIMATED/RELATIVE/UNKNOWN`)를 담을 칸이 SQL 에 없다 | **미결정 11** — 산출물에만 있다 |
| ⑦ | `occurred_at` 이 항상 null 이라 색인 `earthus_earth_event_kind_time_idx(kind, occurred_at desc)` 는 전부 null 로 정렬된다 | 시각을 지어내지 않는 대가. 결정 ③ 의 결과 |
| ⑧ | `geolocate.py` 와 `gdelt-events/handler.py` 에 `place_doubt`·`build_gazetteer` **사본이 둘** 있다 | 의도. 운영 함수를 이번 라운드에 손대지 않았다. 합치는 것은 별도 승인. 상수 대조 테스트가 어긋남을 막는다 |
| ⑨ | 원자료 적재기(`archive/earth-events/raw/…`)가 없다 | 3G 는 **참조 경로만** 계산하고 `object: null` 로 적는다. 이름을 지어내지 않았다 |

---

## 6. 문서 정정

### 6.1 승인받은 3건

| 위치 | 무엇이 틀렸나 | 어떻게 고쳤나 |
|---|---|---|
| `docs/TRUTH_VOCABULARY_CANONICAL.md` gdelt `status` 행 | `confirmed → CORROBORATED`, "교차검증 점수가 곧 독립 출처 수다" — **같은 문서 §2.1 과 어긋난다.** §2.1 은 `independenceGroup` 고유 수 ≥ 2 를 요구하는데, gdelt `status` 는 `score(...) ≥ CONFIRM_SCORE(60)` 하나로 정해지는 **점수 문턱**이다. 한 통신사 기사를 스무 곳이 전재해도 점수는 오른다 | `confirmed → REPORTED` 로 바꾸고, 왜 그런지와 회계 창구(`independence_units_for()` · `CORROBORATION_MIN = 2`)를 적은 정정 블록을 붙였다 |
| `docs/EARTHUS_STORAGE_ARCHITECTURE.md` §0.3 · §1.2 · 캐시 표 · §3 도메인 표 | 정본을 `events/earth-events.json` + `events/earth-events/<id>.json`(공개), 색인을 `earthus_event_cluster` 로 적었다. §1.2 는 "조립기는 `events/` 에 쓰는 람다다"라고 적었다 — 그대로 구현하면 검토 전 사건이 익명 공개된다. `earthus_event_cluster` 는 SQL 이 존재 자체를 거부한다(SCHEMA_CONFLICT) | 네 자리 모두 `archive/earth-events/canonical/v1/event_id=<id>.json`(PRIVATE) · `earthus_earth_event` · `archive/earth-events/raw/dt=…/hh=…/part-*.jsonl.gz` 로 고치고, 캐시 표는 `no-store` 로 바꾸고 **"공개 사건 파일은 아직 없다"** 를 명시했다 |
| `aws/_shared/sql/20260913_earth_event_core.sql` 머리말 | 정본 경로를 `events/…` 로 적었다 | `archive/earth-events/canonical/v1/…` + `raw/…` 로 고치고 이유(익명 공개 접두사·SHADOW·결정 ⑨)를 적었다. `canonical_s3_key` 칸 주석도 같이 맞췄다 |

### 6.2 ⚠️ 승인 범위를 넘어 같은 파일에서 고친 2곳 — 밝힌다

같은 SQL 파일 안에 **직접 모순되는 주석**이 두 곳 더 있었다. 고친 파일에 알려진 거짓을 남기지 않으려고
함께 고쳤다. 되돌리려면 주석 2곳이다.

1. `event_id` 칸 주석: `{kind}-{sourceId} ← 잠긴 정본 주소` / `tools/test_v2_ui_information_architecture.mjs
   2건이 검사한다`. **둘 다 틀렸다** — 그 npm 테스트 2건은 호출 모양만 고정하고 id 문자열을 파싱하지 않으며
   (앞서 실측으로 확인했다), `{kind}-{sourceId}` 는 상류 id 가 회차마다 바뀌면 같은 사건이 다른 주소를 갖게 되어
   결정 ④ 의 안정성 요구를 깬다. → `evt_<sha256 앞 20 hex>` 와 생성기 위치로 고쳤다.
2. 롤백 주석의 "색인은 `events/earth-events.json` 에서 다시 만들 수 있다" → `archive/earth-events/canonical/v1/`.

---

## 7. 다음 승인이 필요한 것 (이번에 하지 않았다)

1. **원자료 적재기** — `archive/earth-events/raw/…` 에 실제로 쓰는 경로. 지금은 참조만 계산한다.
2. **SQL 적용** — Supabase SQL Editor 수동 적용. 여전히 미적용 초안이다.
3. **Lambda 생성·배포** — `earthus-earth-events` 함수, IAM 역할(최소권한), `requirements.txt` 동봉 확인.
4. **`mode=LIVE` 색인 대조** — 실제 S3·Postgres 판독기로 `require_live()` 를 지나는 검사.
5. **`source-governance` 배포 artifact 확인** (§5.7 ①) — 읽기 전용 확인 1건.
6. **두 사본 합치기** (§5.7 ⑧) — `gdelt-events` 가 `geolocate.py` 를 import 하도록. 운영 함수 변경.
7. **미결정 4건** (§5.7 ③④⑥⑦) — `kind` 어휘 · `phenomenon_id` 매핑 · 시간 정밀도 칸 · 시각 색인.
8. **스케줄 등록** — 여전히 HOLD.
