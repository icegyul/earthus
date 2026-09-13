# S3 정본 ↔ Postgres 색인 일관성 검사

작성 2026-09-13 · PHASE 3 STEP 4
대상 `aws/_shared/index_consistency.py`
관련 [EARTHUS_STORAGE_ARCHITECTURE.md](EARTHUS_STORAGE_ARCHITECTURE.md) ·
[DB_MIGRATION_PLAN.md](DB_MIGRATION_PLAN.md)

## 상태: **PARTIAL**

| 항목 | 상태 | 근거 |
|---|---|---|
| validator 구현 | **PASS** | 검사 6종 + 발견 9종 · 판독기 주입식(자격 불필요) |
| FIXTURE 모드 검증 | **PASS** | `test_index_consistency.py` 22개 통과 |
| mock/live 분리 강제 | **PASS** | `require_live()` 가 FIXTURE 결과를 예외로 거부 · 시험이 확인 |
| 되만들기 계획 분리 | **PASS** | BLOCKING / REBUILDABLE 2등급 |
| **LIVE 모드 실행** | **BLOCKED** | AWS 세션 만료 · Postgres 미적용 |
| **운영 일관성 판정** | **없음** | LIVE 로 한 번도 돌리지 않았다 |

**FIXTURE PASS 는 운영 PASS 가 아니다.** 이 문서에서 그 둘을 한 줄도 섞지 않았고,
코드가 그것을 예외로 막는다(§4).

---

## 1. 왜 필요한가

`EarthEvent` 의 정본은 **S3** 이고 Postgres 는 색인이다
(`EARTHUS_STORAGE_ARCHITECTURE.md` §0.3). 두 곳에 같은 사실이 있으면 언젠가 어긋난다:

```
배치가 S3 를 쓰고 Postgres 쓰기에서 죽는다        → 색인 누락
배치가 Postgres 를 쓰고 S3 쓰기에서 죽는다        → 색인이 없는 객체를 가리킨다 (거짓말)
사건을 다시 계산해 S3 를 덮어썼다                  → 색인의 해시가 낡는다
사건 id 를 손으로 고쳤다                           → 색인과 정본이 다른 사건이라고 말한다
```

이 파일은 그 어긋남을 **찾기만** 한다. 고치지 않고, 지우지 않고, 쓰지 않는다.
불일치가 나오면 **S3 를 옳다고 보고 색인을 다시 만든다** — 그것이 정본을 S3 에 둔 이유다.

## 2. 검사 6종 (지시서 요구 그대로)

| 지시서 요구 | 구현 | 발견 종류 |
|---|---|---|
| Event ID exists in canonical S3 | 색인 행의 `canonicalS3Key` 가 S3 판독 결과에 있는가 | `ORPHAN_INDEX` |
| Postgres event index points to canonical S3 record | 정본 객체의 `eventId` 가 색인 행의 `eventId` 와 같은가 | `EVENT_ID_MISMATCH` |
| no orphan index | 위와 같음 + 역방향(정본에 있고 색인에 없음) | `ORPHAN_INDEX` / `MISSING_INDEX` |
| no duplicate canonical event | 한 `eventId` 가 정본 객체 둘을 갖는가 / 색인 행 둘을 갖는가 | `DUPLICATE_CANONICAL` / `DUPLICATE_INDEX` |
| schema/version compatibility | `canonicalSchema` 가 `SUPPORTED_SCHEMAS` 안인가 · 양쪽이 같은 판을 말하는가 | `UNSUPPORTED_SCHEMA` |
| checksum/reference consistency | 색인의 `canonicalSha256` = 정본의 `sha256` · 타임라인 참조가 해소되는가 | `CHECKSUM_MISMATCH` / `MISSING_CHECKSUM` / `DANGLING_REFERENCE` |

## 3. 발견의 무게 — 다시 만들면 되는 것과 사람이 봐야 하는 것

```
BLOCKING     색인이 거짓말을 하고 있다. 그대로 서비스하면 안 된다        → status FAIL
REBUILDABLE  S3 가 옳고 색인만 뒤처졌다. 다시 만들면 된다                → status PARTIAL
```

| 발견 | 무게 | 왜 |
|---|---|---|
| `ORPHAN_INDEX` | BLOCKING | 없는 객체를 가리킨다 — 화면이 404 를 본다 |
| `CHECKSUM_MISMATCH` | BLOCKING | 같은 키인데 내용이 다르다 — 어느 쪽이 옳은지 기계가 못 정한다 |
| `EVENT_ID_MISMATCH` | BLOCKING | 색인과 정본이 서로 다른 사건이라고 말한다 |
| `DUPLICATE_CANONICAL` | BLOCKING | 한 사건이 정본 둘을 갖는다 — 어느 것이 진실인지 모른다 |
| `DUPLICATE_INDEX` | BLOCKING | 목록에 같은 사건이 두 번 뜬다 |
| `UNSUPPORTED_SCHEMA` | BLOCKING | 우리가 못 읽는 판이다. 읽은 척하면 안 된다 |
| `DANGLING_REFERENCE` | BLOCKING | 타임라인이 없는 실행·기사를 가리킨다 |
| `MISSING_INDEX` | REBUILDABLE | 정본이 있으므로 색인을 다시 만들면 된다 |
| `MISSING_CHECKSUM` | REBUILDABLE | 기준값이 비어 있을 뿐, 정본은 온전하다 |

`rebuild_plan(result)` 가 둘을 갈라 준다:

```python
{"reindex": [다시 색인할 S3 키], "needsHuman": [BLOCKING 발견 전부]}
```

## 4. mock PASS 를 production PASS 로 쓰지 못하게 한 방법

지시서 요구: "실제 AWS 호출이 필요한 test는 fixture/mock과 별도 구분한다.
mock PASS를 production PASS로 표시하지 않는다."

코드로 세 겹을 두었다:

```python
# ① mode 는 필수 인자다. 기본값이 없다 — 잊으면 TypeError
def check(canonical, index, mode, references=None): ...

# ② 결과에 박힌다. 지워지지 않는다
{"mode": "FIXTURE" | "LIVE", "status": "PASS" | "PARTIAL" | "FAIL", ...}

# ③ 운영 근거로 쓰려면 이 문을 지나야 하고, FIXTURE 는 거부된다
def require_live(result):
    if result["mode"] != LIVE:  raise ConsistencyError("… 운영 근거가 될 수 없다 …")
    if result["status"] != PASS: raise ConsistencyError(…)
```

그리고 DB 쪽에도 기록한다 — `earthus_index_consistency_audit.mode`
`check (mode in ('FIXTURE','LIVE'))` (`DB_MIGRATION_PLAN.md` §2).
감사 이력만 봐도 그 PASS 가 어느 모드였는지 알 수 있다.

시험이 이 분리를 직접 검사한다:

| 시험 | 검사 |
|---|---|
| `test_mode_is_required` | `mode` 없이 부르면 `TypeError` |
| `test_unknown_mode_is_rejected` | `mode="MOCK"` → `ValueError` |
| `test_fixture_pass_cannot_be_used_as_production_pass` | FIXTURE PASS → `require_live()` 가 `ConsistencyError` |
| `test_live_failure_is_also_refused` | LIVE PARTIAL → 거부 |
| `test_live_pass_is_accepted` | LIVE PASS → 통과 |

## 5. 참조 검사는 "건너뛴 것"으로 기록한다

참조 집합(`references`)을 주지 않으면 타임라인 참조를 검사할 수 없다.
그때 **통과했다고 적지 않는다**:

```python
"checks": { …, "referenceConsistent": False }   # 검사 안 함 = False
```

`test_reference_check_is_recorded_as_skipped_when_no_set_is_given` 가 이를 검사한다.
`status` 는 PASS 일 수 있지만 `checks.referenceConsistent` 가 `False` 이므로
"참조까지 확인했다"고 읽을 수 없다.

## 6. 판독기 주입 — 자격 없이 검증되는 이유

validator 는 S3·Postgres 를 모른다. 두 판독 **결과**를 받는다:

```python
canonical = {                                    # S3 쪽 (지금은 딕셔너리, 나중엔 boto3 어댑터)
  "events/earth-events/eq-us7000aaa.json": {"eventId": "eq-us7000aaa",
                                            "sha256": "…", "schema": "earthus.earth-event.v1"},
}
index = [                                        # Postgres 쪽 (지금은 리스트, 나중엔 psycopg 어댑터)
  {"eventId": "eq-us7000aaa", "canonicalS3Key": "…",
   "canonicalSha256": "…", "canonicalSchema": "…", "timelineRefs": [...]},
]
result = check(canonical, index, mode=FIXTURE)
```

그래서 판정 로직 전체를 자격 없이 시험할 수 있고, 자격이 풀리면 어댑터 둘만 붙이면 된다.
**어댑터는 아직 없다** — 이것이 이 문서가 PARTIAL 인 이유다.

## 7. 검증 결과 (FIXTURE)

```
python -m pytest aws/_shared/tests/test_index_consistency.py -q
→ 22 passed
```

| 묶음 | 시험 | 결과 |
|---|---|---|
| 정상 | 일치하는 양쪽 → PASS · 양쪽 비었음 → PASS | 2 |
| BLOCKING | 고아 색인 · 해시 불일치 · 정본 중복 · 색인 중복 · 사건 id 교차 · 정본에 id 없음 · 미지원 스키마 · 양쪽 스키마 불일치 | 8 |
| REBUILDABLE | 색인 누락 → PARTIAL + `reindex` 목록 · 해시 비었음 → PARTIAL · 둘이 섞이면 FAIL + 두 목록 분리 | 3 |
| 참조 | 집합 없으면 `referenceConsistent=False` · 해소되면 PASS · 끊기면 FAIL | 3 |
| 모드 문 | §4 의 5개 + 결과에 mode 기록 | 6 |

## 8. LIVE 로 돌리려면 (자격 풀린 뒤)

```
1. aws login → aws sts get-caller-identity 확인
2. S3 판독 어댑터를 만든다 (신규):
     events/earth-events.json 을 읽어 사건 id 목록을 얻고,
     events/earth-events/<event_id>.json 각각의 ETag/sha256·schema 를 모은다
     ⚠️ ETag 는 멀티파트 업로드에서 sha256 이 아니다. 객체 메타데이터에
        우리가 쓴 sha256 을 함께 넣어 두고 그것을 읽는다(조립기 설계에 포함)
3. Postgres 판독 어댑터를 만든다 (신규):
     select event_id, canonical_s3_key, canonical_sha256, canonical_schema from earthus_earth_event
     + 타임라인 참조: select event_id, kind, simulation_run_ref, article_id from earthus_event_timeline
4. check(canonical, index, mode=LIVE, references=…) 를 돌린다
5. require_live(result) 를 지나면 운영 판정이다. 그 결과를
   earthus_index_consistency_audit 에 mode='LIVE' 로 적는다
6. 이 문서 §7 아래에 LIVE 결과 절을 추가하고 상태를 갱신한다
```

⚠️ 2·3번 어댑터는 **아직 없다.** 만들려면 AWS·Postgres 접근이 필요하고,
접근 없이 만들면 한 번도 실행해 보지 못한 코드가 남는다. 그래서 만들지 않았다.

## 9. 남은 것

| # | 남은 일 | 막는 것 |
|---|---|---|
| 1 | S3 판독 어댑터 | AWS 자격 |
| 2 | Postgres 판독 어댑터 | 마이그레이션 미적용 + DB 자격 |
| 3 | LIVE 1회 실행 + 감사 기록 | 위 둘 |
| 4 | 스케줄 실행 (조립기 뒤에 붙여 매 배치마다 검사) | 위 셋 |
| 5 | 객체 메타데이터에 sha256 을 쓰는 규약 | 조립기(3G) 설계에 포함할 것 |

## 10. 이 문서에서 주장하지 않는 것

- 운영 S3 와 운영 Postgres 가 지금 일관되다고 **주장하지 않는다.** 한 번도 대조하지 않았다.
- 마이그레이션이 적용됐다고 **주장하지 않는다.** 표가 아직 없다.
- FIXTURE 22개 통과를 운영 검증으로 **쓰지 않는다.** `require_live()` 가 코드로 막는다.
