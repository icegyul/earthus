# PHASE 3 구현 보고 — 진행 중

작성 2026-09-13 · `earthus-v2/real-living-earth-render` @ `3c577d15` 기준 작업 트리
선행 [RESEARCH_RUNTIME_BASELINE.md](RESEARCH_RUNTIME_BASELINE.md) ·
[EARTH_EVENT_CANONICAL_MODEL.md](EARTH_EVENT_CANONICAL_MODEL.md) ·
[TRUTH_VOCABULARY_CANONICAL.md](TRUTH_VOCABULARY_CANONICAL.md)

> **이 문서의 상태: PARTIAL.**
> 승인된 A·B·C, PHASE 3F, 그리고 STEP 1~6(커밋·중복제거·마이그레이션 SQL·일관성 validator·
> 해시 문서화·전체 재시험)까지 끝났고 실행으로 검증됐다.
> **PHASE 3G·3I(적용)·3J~3O 는 착수하지 않았다.** §5 에 그 이유(외부 자격 차단 2건)를 실측으로 적었다.

---

## 0. 단계별 상태

| 단계 | 상태 | 근거 |
|---|---|---|
| 3A baseline | **PASS** | [RESEARCH_RUNTIME_BASELINE.md](RESEARCH_RUNTIME_BASELINE.md) §0.1 |
| A — DEFECT-1 수정 | **PASS** | §1 · 시험 2개 추가 · teeth 확인 |
| B — README PYTHONPATH | **PASS** | §2 · 적은 그대로 실행 확인 |
| C — R2 합성 바람 구멍 | **PASS** | §3 · 시험 1개 추가 |
| 3F — Simulation event_id | **PASS** | §4 · 시험 15개 추가 |
| STEP 1 — 안정 커밋 | **PASS** | `c481453f` · 16파일 · 내 경로 clean |
| STEP 2 — 3H 중복제거 | **PARTIAL** | [PHASE3H_DEDUP_IMPLEMENTATION.md](PHASE3H_DEDUP_IMPLEMENTATION.md) — 구현·시험 PASS, **배선 BLOCKED** |
| STEP 3 — 마이그레이션 SQL | **PARTIAL** | [DB_MIGRATION_PLAN.md](DB_MIGRATION_PLAN.md) — 작성·구조검증 PASS, **적용 BLOCKED** |
| STEP 4 — 일관성 validator | **PARTIAL** | [S3_POSTGRES_CONSISTENCY.md](S3_POSTGRES_CONSISTENCY.md) — FIXTURE PASS, **LIVE 미실행** |
| STEP 5 — 해시 문서화 | **PASS** | [RESEARCH_RUNTIME_BASELINE.md](RESEARCH_RUNTIME_BASELINE.md) §11 |
| STEP 6 — 전체 재시험 | **PASS** | §7 · 기준선 5종 유지 + 신규 92개 |
| 3G — Earth Event Assembler | **BLOCKED** | §5 — S3 읽기·쓰기 불가 (자격 만료) |
| 3I — 적용·LIVE 검사 | **BLOCKED** | §5 — Postgres 적용·조회 불가 |
| 3J — Context | **미착수** | 입력이 S3 실자료다 |
| 3K — Impact | **부분** | 스키마·제약은 STEP 3 에 들어갔다. 계산기는 여전히 없다 |
| 3L — Intelligence | **미착수** | 3G 이후 |
| 3M — SNS eligibility | **미착수** | 3G 이후 |
| 3N — Cesium/UI | **미착수** | "실제 데이터가 연결된 후" 라는 지시 자체가 3G 를 전제한다 |
| 3O — Full E2E | **BLOCKED** | S3·Postgres 양쪽이 필요하다 |
| 3P — Final audit | 이 문서 + 위 세 문서 |

---

## 1. A — DEFECT-1 수정

**실제 구현.** `research_runtime/server.py` 한 파일.

```
+ DRAIN_LIMIT(64 MiB) / DRAIN_CHUNK(64 KiB) / DRAIN_TIMEOUT_SECONDS(5)
+ Handler._body_bytes_read · _request_drained    클래스 기본값
+ Handler._drain_request()                       4xx·5xx 전에 읽히지 않은 본문을 버린다
~ Handler.respond()                              status >= 400 이면 배수 호출
~ Handler.body()                                 읽은 바이트 수 기록
~ Handler._dispatch()                            요청마다 상태 초기화
```

`server.py` 는 v1·v2 **어느 `SNAPSHOT_FILES` 에도 없다**(실측) → `modelSourceSha256` 불변.

측정 결과 (전 → 후, 같은 스크립트):

| 시나리오 | 전 | 후 |
|---|---|---|
| 정상 동일출처 POST, `MAX_BODY` 초과 | `ConnectionAbortedError` 5/5 | **`422 BODY_SIZE_LIMIT` 5/5** |
| 정확히 `MAX_BODY` | 422 | 422 (불변) |
| 200 B POST (대조군) | 201 | 201 (불변) |
| 세그먼트 분할 × `Origin`/`Host` 위조 × 지연 0.05·0.20s | ABORT 20/20 각 | **403 20/20 각** |
| 세그먼트 분할 2 MB 본문 | ABORT 47~75% | **403 10/10** |

신규 시험 2개 (`tests/test_service.py`), **teeth 확인**: 런타임에서 `_drain_request` 를 무력화하면
같은 시나리오가 `ConnectionAbortedError` 3/3 → 시험이 실패한다.

## 2. B — README PYTHONPATH

**실제 구현.** `## 검증` 절만 수정. PowerShell·Git Bash 두 형태 + 경로 순서 이유.
문서에 적은 그대로 실행 확인: `$env:PYTHONPATH = ".;.deps"` → `OK`.

## 3. C — R2 합성 바람 구멍

**실제 구현.** `research_runtime/models_v2.py`.

```
~ preflight()       고정 문장 "Wind is NCEP-DOE R2 T62 …" 제거 → wind manifest 에서 문장 생성
                    + report["windEvidenceKind"]
                    + 바람이 SYNTHETIC_TEST 면 경고 맨 앞에 표시
                    + 실자료 해류 + 합성 바람이면 "MIXED INPUTS: … not a real-forcing result."
~ run_experiment()  provenance + windEvidenceKind · syntheticInputs
```

전 → 후 (REANALYSIS 해류 + SYNTHETIC_TEST 바람):

| | 전 | 후 |
|---|---|---|
| `windEvidenceKind` | 키 없음 | `SYNTHETIC_TEST` |
| `syntheticInputs` | 키 없음 | `["wind"]` |
| `warnings[0]` | `"Wind is NCEP-DOE R2 …"` (거짓) | `"MIXED INPUTS: …"` |

**대가(기록):** `models_v2.py` 는 v2 `SNAPSHOT_FILES` 에 있어 `modelSourceSha256` 이 바뀐다.

```
전 306a597613f625e09d0788405b7b7e3b3a944627d4217b8da77e66a74859dee3
후 486e9a58532a9d144faaaedaa8bae10fbf296fff3b7d081b6702be1271393c67
v1 42e5886b640b616256dafc036bd4bbceff8a17affab1330947f0a9cb8612e444  ← 불변 확인
```

`.local-data/v2-bundles/` 의 번들 4개는 이제 replay 시
`replay model source differs from the recorded v2 source; restore the bundled snapshot before replay`
(`cli_v2.py:96-97`)로 **설계된 거부**를 한다. 각 번들이 소스 7개 + lock 을 동봉하고 있어
그 안내는 실행 가능하다(확인함). `MODEL_VERSION` 은 `0.1.0` 으로 두었다 — 물리·수치 불변, `resultArraySha256` 불변.

---

## 4. PHASE 3F — Simulation event_id

**실제 구현 + 데이터 연결 완료 (로컬 원장 기준).**

### 4.1 설계 — 별도 링크 표

```sql
CREATE TABLE IF NOT EXISTS run_event_link (
    run_id TEXT NOT NULL, event_id TEXT NOT NULL, linked_at TEXT NOT NULL,
    PRIMARY KEY (run_id, event_id)
);
CREATE INDEX IF NOT EXISTS run_event_link_event_idx ON run_event_link(event_id);
```

`objects` 에 컬럼을 더하지 않은 이유 (전부 실측 근거):

| 이유 | 근거 |
|---|---|
| `objects` INSERT 3곳이 **위치 기반**(`VALUES (?,?,?,?)`)이다. 컬럼을 더하면 값이 엉뚱한 열로 가거나 즉시 깨진다 | `store.py` create/submit ×2 |
| 행이 없는 것이 NULL 컬럼보다 나은 "사건 없음"이다 — legacy 실행은 backfill 이 필요 없고 **이전과 똑같이 읽힌다** | §4.3 시험 |
| `event_id` 는 **연결**이지 모델 입력이 아니다 → `models.py` provenance 에 넣지 않는다 (그 파일은 SHA 고정이고 수정 금지) | 승인 제약 |
| 역방향 조회에 실제 인덱스가 붙는다 (JSON 전수 스캔 아님) | `run_event_link_event_idx` |

**금지 항목 준수:** 물리·forcing·manifest·validation semantics 변경 0건.
Postgres 복제 0건. SQLite 원장 이전 0건. 고친 파일은 `store.py`·`service.py`·`server.py` 셋이고
**전부 v1·v2 SNAPSHOT_FILES 밖**이다 → `modelSourceSha256` 불변.

### 4.2 `event_id` 단일 값이 아니라 목록인 이유 (지시서와 다른 점 1건)

지시서는 "`SimulationRun` 에 `event_id` nullable 추가" 였다. 구현은 **목록**이다:

- 시뮬레이션 하나가 여러 사건에 정당하게 답할 수 있다 (쓰나미 도달시간 하나가 인접 사건 둘에 걸린다)
- 단일 컬럼은 그중 하나를 고르고 나머지를 **조용히 버리게** 만든다
- "사건 없음" 은 **빈 목록**으로 표현한다 — nullable 의 의미를 그대로 담는다

읽기 모양: `run['eventIds']` (목록). `get_run()` 이 링크 표에서 **읽어서** 붙인다 —
두 곳에 저장하지 않으므로 run 행과 링크가 어긋날 수 없다.

### 4.3 API

```
POST /api/research/runs        body 에 eventId(하나) 또는 eventIds(여럿) 선택 추가
                              → run + 링크가 같은 트랜잭션에서 생성된다
GET  /api/research/runs/{id}   → run.eventIds  (legacy 실행은 [])
GET  /api/research/events/{event_id}/runs   → { eventId, runIds }   ← 역추적
```

id 형식은 길이·제어문자만 검사한다. 정본 `{kind}-{sourceId}`(intel-feed)와
`{kind}:{sourceId}`(LAB reports) **양쪽을 받는다** — 이 층에서 좁히지 않는다.
`eventId` 는 제출 본문에 있으므로 **idempotency digest 에 이미 포함된다** →
같은 키로 다른 사건을 재제출하면 조용한 relink 가 아니라 `IDEMPOTENCY_CONFLICT` 다.

### 4.4 마이그레이션과 되돌리기

| 방향 | 문장 | 성질 |
|---|---|---|
| 적용 | `CREATE TABLE IF NOT EXISTS run_event_link …` (Store 초기화에서 자동) | 기존 관용구와 동일. 재실행 안전 |
| 되돌리기 | `DROP TABLE run_event_link` | 링크만 사라진다. run·result·해시는 **한 바이트도** 바뀌지 않는다 |

되돌리기를 시험으로 증명했다 — `test_rollback_loses_only_links` 가
DROP 전후의 run 본문이 **동일 객체**임을 검사한다.

### 4.5 필수 테스트 대조 (지시서 6개)

| 지시서 요구 | 시험 | 결과 |
|---|---|---|
| existing simulation records read | `test_pre_phase3f_ledger_still_reads_after_the_table_is_added` (표를 DROP 한 뒤 재개방) | OK |
| new SimulationRun with event_id | `test_run_with_event_records_the_link` | OK |
| event_id absent legacy record | `test_run_without_event_reads_and_reports_no_event` | OK |
| event lookup | `test_event_runs_endpoint` (HTTP) · `test_lookup_by_event_and_back` | OK |
| simulation lookup by event_id | `test_lookup_by_event_and_back` · `test_one_run_can_serve_several_events` | OK |
| migration rollback/recovery 검증 가능성 | `test_rollback_loses_only_links` · `test_forward_migration_is_rerunnable_and_additive` | OK |

추가로 넣은 시험: idempotency 충돌, 같은 제출 재생 시 링크 1개 유지, 불량 id 거부(쓰기 0건 확인),
두 id 형식 수용, 링크의 원자성, 중복 링크 무해, **run 이 사라진 고아 링크가 유령 run id 를 노출하지 않음**
(외래키가 꺼져 있으므로 조인으로 막았다).

### 4.6 테스트 수

```
3A baseline                      62
+ A·C 회귀                        3   (oversize 422 · 세그먼트 분할 · 합성 바람)
+ 3F                             15
──────────────────────────────────
                                 80   ·  3회 연속 OK (15.674 / 15.590 / 15.651s)
```

**하나도 지우거나 skip 하지 않았다.**

---

## 5. 3G 이후가 막힌 이유 — 외부 자격 2건 (실측)

### 5.1 AWS 세션 만료 → S3 쓰기·읽기 불가

```
$ aws sts get-caller-identity
aws: [ERROR]: Your session has expired. Please reauthenticate using 'aws login'.
$ aws s3 ls s3://earthus-cache-kr/events/
aws: [ERROR]: Your session has expired. Please reauthenticate using 'aws login'.
```

3G 는 `events/global.json` 등 실제 산출물을 **읽어서** `events/earth-events*.json` 을 **쓴다**.
읽기도 쓰기도 지금 안 된다. 픽스처만으로 조립기를 쓰면 나오는 것은
"adapter 만 구현 · 테스트 fixture" 이고 **"데이터 연결 완료" 가 아니다.**

### 5.2 Supabase 접근 수단 없음 → Postgres 색인·일관성 검사 불가

```
$ supabase --version      → command not found
$ env | grep -iE "supabase|postgres|database_url"   → 없음
supabase/.temp/linked-project.json → ref: ltpupicvdijxkrxxsfky  (링크 정보만 있다)
```

그리고 이 저장소의 마이그레이션은 **사람이 Supabase SQL Editor 에 붙여 실행**하는 방식이다
(`20260906_forme_funnel_events.sql` 머리말). 자동 적용 파이프라인이 없다.

→ 3I 의 "S3 canonical Event ↔ Postgres index 불일치 탐지" 는 **양쪽 다 접근이 없어** 지금 검증할 수 없다.

### 5.3 그래서 FINAL ACCEPTANCE 가 지금은 성립할 수 없다

지시서의 최종 수락 조건은 다음 사슬을 양방향으로 요구한다:

```
News article → canonical article → EarthEvent → claim → evidence → truth status
→ S3 canonical record → Postgres trace → context snapshot → impact → simulation run → timeline
```

`S3 canonical record` 와 `Postgres trace` 두 칸이 자격 차단 대상이다.
따라서 3G~3O 를 지금 전부 짜더라도 **최종 수락은 판정할 수 없고**,
검증되지 않은 코드가 "구현 완료"로 문서에 남는다 — 그것이 이 작업에서 가장 피해야 하는 상태다.

### 5.4 자격 없이도 진행할 수 있는 것 / 없는 것

| 단계 | 자격 없이 가능 | 불가 |
|---|---|---|
| 3H 중복제거 3단계 | 알고리즘 + 순수 단위시험 (기사 픽스처로) | 실제 GDELT·RSS 기사로 정확도 측정 |
| 3G 조립기 | 9단계 조립 로직 + 픽스처 E2E | S3 읽기·쓰기, 운영 자료 규모 검증 |
| 3I 마이그레이션 SQL | SQL 작성 + SQLite 로 스키마 시험 | Supabase 적용, 일관성 검사 실행 |
| 3J Context | 어댑터 인터페이스 + 픽스처 | 실제 레이어 자료 |
| 3K Impact | 스키마 + `UNKNOWN` 경로 | (계산기 자체가 없으므로 자격과 무관하게 UNKNOWN) |
| 3L Intelligence | 기존 모듈 배선 | 실사건 |
| 3M SNS eligibility | 기존 `eligibility.py` 호출 어댑터 | 실제 발행 (애초에 사람 승인 필수) |
| 3N UI | — | "실제 데이터가 연결된 후" 라는 지시 전제 미충족 |
| 3O E2E | 픽스처 E2E | 실제 E2E |

---

## 6. 이번 세션에 바뀐 파일 (전수)

### 6.1 코드 (263 insertions · 5 deletions)

```
M services/research-runtime/README.md                       +14   (B)
M services/research-runtime/research_runtime/models_v2.py    +26   (C)
M services/research-runtime/research_runtime/server.py       +62   (A, 3F 경로)
M services/research-runtime/research_runtime/service.py      +51   (3F)
M services/research-runtime/research_runtime/store.py        +45   (3F)
M services/research-runtime/tests/test_service.py            +44   (A 회귀 2)
M services/research-runtime/tests/test_v2_windage.py         +26   (C 회귀 1)
A services/research-runtime/tests/test_event_link.py        신규   (3F 15개)
```

**수정하지 않은 것 (승인 제약):**
`research_runtime/models.py` · `datasets.py` · `cli.py` · `__init__.py`
→ `test_08_v1_immutable` 의 고정 SHA 4파일. v1 `model_source_sha256` = `42e5886b…` **불변 확인**.

### 6.1a STEP 2~6 에서 추가한 코드 (커밋 `c481453f` 이후)

```
A aws/_shared/article_dedup.py                    중복제거·계보 (순수 함수)
A aws/_shared/index_consistency.py                S3↔Postgres 일관성 validator (판독기 주입식)
A aws/_shared/sql/20260913_earth_event_core.sql   마이그레이션 SQL (표 15 · 도메인 4) — 미적용
A aws/_shared/tests/test_article_dedup.py         21개
A aws/_shared/tests/test_index_consistency.py     22개
A aws/_shared/tests/test_migration_sql.py         31개
```

기존 `aws/` 코드는 한 줄도 고치지 않았다 — `gdelt-events` · `regional-news` · `news-brief` ·
`distribution/**` 무변경. 중복제거는 그 앞단에 **더해지는** 모듈이다.

### 6.2 문서 (신규 8)

```
docs/V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md    PHASE 0·1
docs/TRUTH_VOCABULARY_CANONICAL.md             PHASE 2-1 (DECISION 1 확정 반영)
docs/EARTH_EVENT_CANONICAL_MODEL.md            PHASE 2-2 (DECISION 2 확정 반영)
docs/EARTHUS_STORAGE_ARCHITECTURE.md           PHASE 2-3
docs/NEWS_ENGINE_REUSE_MAP.md                  PHASE 2-4
docs/SIMULATION_PLATFORM_MAPPING.md            PHASE 2-5
docs/RESEARCH_RUNTIME_BASELINE.md              PHASE 3A (+ §10 A·B·C 결과)
docs/PHASE3_IMPLEMENTATION_REPORT.md           이 문서
```

---

## 7. 테스트 결과 (전수, STEP 6 기준)

| 스위트 | 명령 | 세션 초 | 지금 | 차이 |
|---|---|---|---|---|
| 저장소 기본 | `npm test` | 143 | **143 pass** | 0 |
| SNS Factory | `python -m pytest aws/distribution/tests -q` | 325 +6skip | **325 pass +6skip** | 0 |
| v11 Intelligence | `node --test tools/earthus2-v11/*.test.mjs` | 65 | **65 pass** | 0 |
| research-runtime | `python -m unittest discover -s tests` (PYTHONPATH 필요) | 62 | **80 pass** | **+18** |
| `aws/_shared` | `python -m pytest aws/_shared/tests -q` | 37 | **111 pass +40 subtests** | **+74** |

신규 92개 내역:

```
research-runtime +18   A 회귀 2 · C 회귀 1 · 3F 사건연결 15
aws/_shared      +74   중복제거 21 · 일관성 validator 22 · 마이그레이션 SQL 검증 31
```

**기준선을 하나도 줄이지 않았다. 삭제·skip 으로 PASS 를 만든 것 0건.**

⚠️ `npm test` 가 세션 초 139 → 143 으로 늘었다. **내 변경이 아니다** — 같은 작업 트리에
다른 세션이 붙어 있고(`tools/test_v2_ui_information_architecture.mjs` 가 세션 시작 시 이미 M 상태),
그쪽이 4개를 더한 것으로 보인다. 회귀는 없다(fail 0).

미실행:
- 브라우저·E2E 검증 (playwright 는 환경 문제로 항상 실패한다는 기존 기록)
- 3O 의 실제 E2E (S3·Postgres 자격 필요)
- 마이그레이션 SQL 의 **문법** 검증 (Postgres 가 필요하다. 지금은 구조 검증만)

## 8. 다음에 할 일 — 자격이 풀리면

1. `aws login` → `aws sts get-caller-identity` 확인
2. `events/global.json` · `events/regional-news.json` 실제 스냅샷 확보 (읽기)
3. 3H 중복제거 3단계 → 실제 기사로 정확도 측정
4. 3G 조립기 → `events/earth-events*.json` 쓰기 (신규 접두사 없음, `events/` 안)
5. 마이그레이션 SQL 작성 → 사람이 Supabase SQL Editor 에 적용
6. 3I 일관성 검사 → S3 ↔ Postgres 대조
7. 3J~3N → 3O E2E → FINAL ACCEPTANCE 양방향 trace 판정

자격 없이 먼저 해도 되는 것: **3H 중복제거 알고리즘**과 **마이그레이션 SQL 작성**.
둘 다 순수 로직·스키마여서 픽스처로 검증이 성립하고, 나중에 실자료로 다시 측정하면 된다.
