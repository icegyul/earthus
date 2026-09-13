# EARTHUS FINAL EXECUTION — 실행 보고

2026-09-13 · 브랜치 `earthus-v2/real-living-earth-render` · 계정 294951922100 · 리전 `ap-northeast-2`
모든 AWS 호출은 `AWS_PROFILE=earthus-deploy` 로 실행했다. 자격증명 값은 어디에도 적지 않았다.

    한 줄 요약
    GDELT → global.json → 원자료 보관 → 사건 조립 → PRIVATE/SHADOW 정본 → 색인/추적 →
    30분 스케줄 자동 운전까지 **실제로 돌고 있다.** 공개 노출 0건, 기존 데이터 삭제·덮어쓰기 0건.
    운영 Postgres 적용만 **사람이 해야 한다**(자격·클라이언트·파이프라인이 셋 다 없다 — §3).

---

---

## FINAL FREEZE (2026-09-13 15:00 UTC 기준)

```
PRODUCTION_RUNNING          = YES
POSTGRES_OPERATIONAL_APPLY  = PENDING_USER
PUBLIC_PROJECTION           = 0  BY DESIGN
POST_LAUNCH_BACKLOG         = DOCUMENTED   (§15)
```

이 시점부터 **새 기능 개발을 중단한다.** 운영에 필요하지 않은 변경은 하지 않는다.
아래 §15 의 항목은 전부 동결이고, 운영 자원은 §16 의 목록대로 손대지 않는다.

남은 운영 작업은 **하나뿐**이다 — 사람이 Supabase SQL Editor 에서
`aws/_shared/sql/20260913_earth_event_core.sql` 을 **1회** 적용하는 것.
SQL 은 더 고치지 않는다(이 보고서 §3 이 그 파일이 실제 PostgreSQL 17 에서 도는 것을 이미 증명했다).
적용 뒤 확인할 것: schema · tables · indexes · constraints · trace · `mode=LIVE` consistency.
SimulationRun 은 지금처럼 **research-runtime SQLite 원장**을 유지한다 — Postgres 에 복제하지 않는다.

---

## 0. 완료 / 미완료 한눈에

| 항목 | 상태 | 근거 |
|---|---|---|
| A. 3G Productionization | **DONE** | §1 |
| B. Raw archive | **DONE** (운영에 실물 2개) | §2 |
| C. Postgres migration | **PARTIAL — 적용은 사람 몫** | §3 |
| D. 3G Lambda | **DONE** `earthus-earth-events` | §4 |
| E. Live 3G execution | **DONE** (수동 1회 + 스케줄 자동 1회) | §5 |
| F. trace / consistency | **DONE** (`mode=LIVE` PASS) | §6 |
| G. production schedule | **DONE** (스스로 발화 확인) | §7 |
| H. distribution schedule 정책 | **DONE** (근거 5개로 하루 1회 확정) | §8 |
| I. V1 아이콘 실제 교체 | **DONE** (7종 × 4크기 = 28장) | §9 |
| J. 아이콘 UI 회귀검증 | **DONE** (브라우저 실측 + 시험 10건) | §10 |
| source-governance artifact | **DONE — 배포 불필요** | §11 |

---

## 1. 3G — 구현과 실제 파일

새 함수 `aws/earth-events/` (16단계 파이프라인, 전부 기존 구현 재사용):

| 파일 | 줄 | 하는 일 |
|---|---|---|
| `handler.py` | 217 | 진입점 · 입력 판독 · 쓰기 모드 이중 문 · FAIL-CLOSED |
| `normalize.py` | 253 | GDELT → 출처 비의존 정규 레코드 |
| `assembler.py` | 892 | 16단계와 문(gate) |
| `raw_archive.py` | 248 | 결정적 gzip 원자료 |
| `requirements.txt` | 11 | 주석만 (없으면 NetCDF 30MB 가 붙는다) |
| `function-name.txt` | 1 | 폴더≠함수 이름 예외 선언 |
| `tests/` 5개 | 1,040 | 74건 (25+13+14+22) |

공용 부품(신규, 전부 기존 규칙 이식): `truth_vocabulary.py`(SQL `create domain` 파싱) ·
`event_fusion.py`(v11 이식) · `claim_gate.py`(v11 이식) · `geolocate.py`(gdelt-events 이식) ·
`earth_event_id.py`. 기존 파일 보강: `article_dedup.independence_units_for()` ·
`provenance['events/global.json']` · `lambda_package.module_data_files()` · `write_policy` 등록.

단계 순서 (원자료가 정본보다 **앞**):
`INPUT → FRESHNESS → NORMALIZE → SOURCE_RELATION → ARTICLE_DEDUP → EVENT_FUSION →
CLAIM_EVIDENCE → INDEPENDENCE → TRUTH_STATUS → EARTH_EVENT → EVENT_ID → **RAW_ARCHIVE** →
CANONICAL_OUTPUT → CANONICAL_WRITE → INDEX_CONSISTENCY → HEALTH`

---

## 2. Raw archive

`archive/earth-events/raw/dt=YYYY-MM-DD/hh=HH/part-<원본 sha256 앞 12hex>.jsonl.gz`

* **결정성**: gzip `mtime=0` · `compresslevel=6` 고정 · 레코드는 상류 id 의 utf-8 바이트 순 정렬 ·
  JSON 키 정렬 · `allow_nan=False`. 시각·로케일·타임존·해시시드가 바이트에 섞이지 않는다.
* **바이트 재현 실증**: Lambda(linux/x86_64)가 쓴 객체와 이 Windows 기계가 같은 입력으로 다시 만든
  바이트가 **완전히 같다** — 26,496 B, `sha256 b7fa8ec0b61365492876744d686b4bded227a09c191f9d7f95c0de14aaddb54f`.
* ⚠️ **정정 — 그 재현성은 "같은 압축기"까지다.** 적대적 검증이 반례를 만들었다:
  CPython 3.12(zlib 1.3.1)와 3.14(zlib-ng)가 **같은 입력에서 다른 압축 바이트**를 냈다.
  deflate 비트스트림은 파이썬에서 고정할 수 없다. 처음에 "어느 기계에서도 같다"고 적은 것은 **틀렸다.**
  (같은 검증이 또 하나를 잡았다: OS 바이트를 0xFF 로 덮는 코드는 CPython 에서 **no-op** 이다 —
   CPython 이 이미 0xFF 를 쓴다. "리눅스와 윈도우가 OS 바이트에서 갈린다"던 주석도 틀렸다.)
  고친 방식 셋:
    ① 풀어낸 **텍스트**의 해시(`textSha256`)를 따로 준다 — 이쪽은 압축기와 무관하게 같다
    ② 압축기 신원(파이썬·zlib 판)을 산출물에 적는다 (보관 바이트에는 넣지 않는다 —
       넣으면 텍스트마저 실행 환경에 따라 달라진다)
    ③ **같은 키가 이미 있으면 덮어쓰지 않는다.** 압축기가 바뀌어도 보관물과 정본의 `rawSha256`
       계보가 끊기지 않는다. 존재 여부를 **모르면 쓰지 않는다**(모르는 채 덮어쓰는 것이 가장 나쁘다).
* **키도 내용에서 나온다**: 같은 입력 → 같은 키(재실행이 같은 객체를 덮어써도 손실이 없다),
  다른 입력 → 다른 키(서로 덮지 않는다).
  키의 해시 조각은 48비트(12 hex)뿐이지만 **파티션(`dt=`/`hh=`)이 키에 함께 들어 있어서**
  다른 시간대끼리는 애초에 충돌할 수 없다. 한 시간 파티션에는 생산자 주기상 최대 2개가 들어오므로
  그 안의 쌍은 1개 — 충돌 확률 3.55e-15, 10년 누적 3.11e-10 이다.
* **되읽기**: 상류 레코드 150건이 그대로 복원된다. manifest 한 줄에 원본 키·해시·바이트·
  `cappedByLimit`·상류 counts·provenance 가 들어 있다.
* **실패는 빈 결과가 아니다**: 못 읽은 입력·깨진 봉투·창보다 오래된 입력 → 원자료 0 · 정본 0.
  원자료 쓰기가 실패하면 **정본을 쓰지 않는다**(재료 없는 정본을 만들지 않는다).

운영 실물 2개:

```
archive/earth-events/raw/dt=2026-09-13/hh=13/part-41f9eb83a98e.jsonl.gz  26,496 B  13:36:46Z (수동)
archive/earth-events/raw/dt=2026-09-13/hh=14/part-c2d1a25d6d20.jsonl.gz  26,593 B  14:15:24Z (스케줄)
```

---

## 3. Postgres — **적용하지 못했다. 사람이 해야 한다**

세 가지가 각각 단독으로 막는다(전부 실측):

1. **자격 없음** — DB 비밀번호가 저장소 어디에도 없다. 유일한 특권 키
   `SUPABASE_SERVICE_ROLE_KEY` 는 Supabase 런타임이 Edge Function 에 주입하는 값이라 이 기계에 없고,
   있더라도 PostgREST 에 닿을 뿐 DDL 세션이 아니다.
2. **클라이언트 없음** — `supabase` · `psql` · `pg_dump` 가 PATH 에 없다.
3. **파이프라인 없음 — 의도된 설계다.** `docs/3G_POLICY_DECISIONS.md:167` 의 제목이
   "적용 주체 — 자동화할 수 없다" 이고, 기존 마이그레이션 헤더가 전부 "SQL Editor 에 붙여 실행" 이다.

그래서 **할 수 있는 최대치**를 했다 — 마이그레이션이 실제 PostgreSQL 에서 도는지 증명했다.
`postgres:17-alpine` **일회용 컨테이너**를 새로 띄워(기존 컨테이너는 건드리지 않았다) 적용했다:

```
APPLY #1   COMMIT · exit 0 · PostgreSQL 17.11
READ-BACK  domains 4 · tables 15 · indexes 50 (unique 21) · FK 21 · CHECK 167
           earthus_truth_status  = FACT CORROBORATED REPORTED CLAIM INFERRED FORECAST SIMULATION UNKNOWN
           earthus_source_kind   = OFFICIAL OBSERVATION SATELLITE NEWS OSINT MODEL
           earthus_data_state    = LIVE DEGRADED STALE UNAVAILABLE
           earthus_release_state = SHADOW CANARY ACTIVE
APPLY #2   멱등 — 다시 돌려도 exit 0, 표 15개 그대로, 행 0
가드 시험  earthus_event_cluster 가 미리 있는 DB 에서 SCHEMA_CONFLICT 로 **중단**하고
           아무것도 만들지 않았다 (조용한 no-op 이 아니다)
파괴 구문  DROP · DELETE · TRUNCATE · ALTER 실행 구문 0건 (롤백은 주석으로만 존재)
```

검사 뒤 컨테이너는 제거했다. 다른 컨테이너(`damc-db-1` 등)는 **건드리지 않았다.**

> ⚠️ 운영 Supabase 에는 **아직 적용되지 않았다.** 절차는 `docs/DB_MIGRATION_PLAN.md:179-192`.
> 지금 S3 정본만으로 서비스가 성립하고(§6), Postgres 는 색인·추적 층이다.

---

## 4. 3G Lambda

| 항목 | 값 |
|---|---|
| 함수 | `earthus-earth-events` |
| 리전 | `ap-northeast-2` |
| 런타임 / 핸들러 / 아키텍처 | `python3.12` / `handler.handler` / `x86_64` |
| Layer | **0** |
| Function URL | **없음** (`ResourceNotFoundException` 으로 확인) |
| Timeout / Memory | 300s / 2048MB (실측 최대 사용 100MB — 최적화는 POST-LAUNCH) |
| artifact SHA256 | `uW0rqTIpGUycES29+pyo6/VJReLvzC/zFZTKEMG1mDs=` · 77,812 B · 구성원 14개 |
| | (최초 `kzZRCm/gE/iJo986r47Y7EHP5Dcht2qCb2Vs8EpPj1s=` → 적대적 검증 수정 2회 반영) |
| 역할 | `earthus-lambda-earth-events` |

**artifact 대조 (배포본 ↔ 커밋된 트리)** — 같은 기계에서 다시 만들어 비교했다:

```
구성원        14 / 14  이름 집합 동일 · **14개 전부 바이트 동일**
content digest d108d282edf294cec3f6131828065175ceedad847105abf6015e592ee67d6ba3  (양쪽 동일)
zip 컨테이너   배포본 77,812 B ≠ 재생성 76,500 B
```

> ⚠️ **컨테이너 바이트가 다른 이유가 바로 §12.5 에서 반증된 그 결함이다.**
> `deploy-python.sh:132` 은 `command -v python3` 를 먼저 고르는데 이 기계에서
> `python3` = **3.14.7 / zlib-ng**, `python` = **3.12.10 / zlib 1.3.1** 이다.
> 내용이 같아도 압축 결과가 다르다. 그래서 artifact 동일성은 **컨테이너 SHA 가 아니라
> 구성원 내용 해시로 판정해야 한다** — `lambda_package.content_digest()` 가 그것이다.
> (원자료 쪽에 넣은 `textSha256` 과 같은 원리다.)

**IAM 범위 — 인라인 2개뿐, 관리형 정책 없음:**

```
earth-events-minimal        s3:PutObject  arn:…:earthus-cache-kr/archive/earth-events/raw/*
                            s3:PutObject  arn:…:earthus-cache-kr/archive/earth-events/canonical/v1/*
                            logs:CreateLogGroup / CreateLogStream / PutLogEvents
                                          (오직 /aws/lambda/earthus-earth-events 로그그룹)
earth-events-read-minimal   s3:GetObject  arn:…:earthus-cache-kr/events/global.json      ← 키 하나
                            s3:GetObject  arn:…:earthus-cache-kr/archive/earth-events/*
```

없는 것: `AdministratorAccess` · `s3:*` · `iam:*` · `kms:*` · `s3:DeleteObject` ·
버킷 전체 `s3:ListBucket` · `GetBucketVersioning` · 리소스 와일드카드 `"*"`.
**`events/` 에 대한 쓰기 권한이 아예 없다** — 코드의 문이 뚫려도 IAM 이 막는다.

> ⚠️ `deploy-python.sh` 는 역할이 없으면 **버킷 전체에 `s3:GetObject`+`s3:PutObject`** 를 주는
> 역할을 자동으로 만든다. 그래서 배포 **전에** 최소권한 역할을 먼저 만들었고, 스크립트는
> "역할 있음"으로 지나갔다.
> ⚠️ `iam:GetRolePolicy` 가 이 사용자에게 **없다**(그 자체가 최소권한이다). 그래서 정책 본문을
> 되읽어 확인하지 못했다 — 위 내용은 put 에 성공한 로컬 JSON 원본이 근거다.

**폴더 이름 ≠ 함수 이름**: 저장소 규칙은 폴더=함수이고 94개가 그렇다. 지시받은 이름이
`earthus-earth-events` 이므로 예외를 `aws/earth-events/function-name.txt` 에 적었다
(`timeout-seconds.txt` 와 같은 방식). 다른 함수의 배포 동작은 한 글자도 바뀌지 않는다.

---

## 5. LIVE 실행

### 5.1 dryRun (쓰기 0)

```
StatusCode 200 · FunctionError 없음 · Init 141ms · Duration 1.5s · Max Memory 100MB
입력 events/global.json  generated 13:05:00Z  sha256 98451ece…  ageMin 29.0
사건 132 · rawWritten false · canonicalWritten 0 · publicWrites 0
확인: archive/earth-events/ 객체 수 0 그대로
```

### 5.2 실제 LIVE 쓰기 (수동 1회)

```
StatusCode 200 · FunctionError 없음 · Duration 47.6s
입력 generated 13:35:00Z · 100,186 B · sha256 41f9eb83a98ead5f5e24a6ebf2482faaa8007c2f300d91386ae6899fed831f9b
     ageMin 1.7 · cappedByLimit true
레코드 150 → 사건 125 · truthStatus {REPORTED: 125} · status SUCCESS
raw     archive/earth-events/raw/dt=2026-09-13/hh=13/part-41f9eb83a98e.jsonl.gz (written)
canonical 125/125 written · publicWrites 0
```

**쓰기 전/후 차이 (실측):**

| | before | after |
|---|---|---|
| `archive/earth-events/` | **0** | 126 (raw 1 + canonical 125) · 그 밖의 접두사 0 |
| `events/` (공개) | 294 | 294 — **추가 0 · 삭제 0** |

`events/` 에서 ETag 가 바뀐 4건(`world-alerts` `push-tick` `lightning` `tsunami-intl`)은
각자 자기 스케줄로 도는 **다른 수집기**다. 3G 역할에는 `events/` 쓰기 권한이 없으므로 3G 일 수 없다.

**검증:**

* event_id 고유 125/125 · **충돌 0** · 형식 위반 0
* 익명 접근: 정본 `403` · 원자료 `403` — 같은 시각 대조군 `events/global.json` 은 `200`
  (403 이 "URL 이 틀려서"가 아님을 보이는 대조군이다)
* **LIVE ↔ 로컬 동치**: 같은 입력으로 이 기계에서 다시 돌린 결과가 event_id 집합까지 동일
  (125/125, keyset `sha256 9694cbe0803693bcef0cf30e070ea0018653bd43a152478818f16b71019a1633`),
  원자료 바이트도 동일
* 정본 1건 되읽기: `SHADOW`/`PRIVATE` · `REPORTED` · `occurred_at=null` · `issued_at=null` ·
  `time_bucket=2026-09-13T12:00:00Z` · `precision=RELATIVE` · `source_age_min=95` ·
  `severity=null` · `phenomenon_id=null` · 계보(rawObject·rawSha256·sourceSha256) 완비 ·
  `truncatedNote` 기재 · 허용된 주장 0 / 거부 2 · limits 3줄

### 5.3 스케줄 자동 실행 (내가 부르지 않았다)

```
14:15:24Z  raw dt=2026-09-13/hh=14/part-c2d1a25d6d20.jsonl.gz (26,593 B)
           canonical 128건 기록 (94 + 34)
최종 상태  143 객체 = raw 2 + canonical 141 · event_id 고유 141/141 · 충돌 0 · 형식 위반 0
```

125 → 141 은 새 사건 16건이 늘고 나머지는 **같은 event_id 를 갱신**한 것이다 —
같은 유형·장소·3시간 버킷이면 같은 사건이라는 결정 ④ 그대로다. 원자료는 회차마다 따로 남는다.

---

## 6. trace / consistency

S3 정본 125건을 실제 Postgres 스키마에 투영하고 대조했다.
**S3 쪽은 운영 실물, Postgres 쪽은 일회용 컨테이너다** — 그래서 라벨은 `LIVE-S3 / PROBE-DB` 이고
"운영 PASS" 라고 부르지 않는다.

```
index_consistency.check(..., mode=LIVE)
  status PASS · findings 0 · blocking 0 · canonical 125 · indexRows 125
  checks: indexPointsToCanonical · eventIdMatches · noOrphanIndex ·
          noDuplicateCanonicalEvent · schemaCompatible · checksumConsistent ·
          referenceConsistent  → 전부 true
  require_live() PASSED        ← FIXTURE 증거를 거부하는 문을 실제로 통과했다
```

적재된 행(제약 167개를 전부 통과했다): `earthus_source` 102 · `earthus_earth_event` 125 ·
`earthus_news_article` 134 · `earthus_evidence_node` 134 · 독립성 그룹 102 · 기사 연결 사건 115.

**전체 추적이 한 질의로 이어진다:**

```
sourceSha256 41f9eb83… → raw part-41f9eb83a98e.jsonl.gz → gdelt:rri.ro (independence_group rri.ro)
  → article gdelt:1322831634#0 → evidence ev:gdelt:1322831634#0 (REPORTED)
  → evt_01a285000ac009b2b751 (REPORTED / SHADOW)
  → archive/earth-events/canonical/v1/event_id=evt_01a285000ac009b2b751.json → Postgres 행
```

불변식 (SQL 집계로 확인): 승격 0 · 비-SHADOW 0 · `occurred_at` 있는 행 0 ·
위치 의심이면서 승격된 행 0.

발견: 상류가 제목을 못 찾은 기사 **7건은 `earthus_news_article` 에 넣지 못했다**
(`title not null` 인데 제목을 지어낼 수 없다). 그래서 사건 125건 중 115건만 기사와 이어진다.
스키마와 자료의 실제 간극이고, 제목을 만들어 메우지 않았다.

---

## 7. Schedule

| rule | cadence | target | 상태 | 권한 |
|---|---|---|---|---|
| `earthus-gdelt-30min` | `cron(5,35 * * * ? *)` | `gdelt-events` | ENABLED (기존, **손대지 않음**) | 기존 |
| `earthus-earth-events-30min` | `cron(15,45 * * * ? *)` | `earthus-earth-events` | ENABLED (신규) | 문 1개 |
| `earthus-distribution-daily` | `cron(0 0 * * ? *)` | `distribution` | ENABLED (신규) | 문 1개 |

**3G 주기를 생산자와 1:1 로 맞춘 이유**: 상류가 같은 키를 30분마다 덮어쓰므로 한 회차를
건너뛰면 그 회차의 원자료가 **영원히 사라진다**. 10분 뒤에 도는 근거는 생산자 실측 소요
7~8초(CloudWatch REPORT 8건)다. 3G 실측 소요는 47.6초 — 30분 간격과 겹칠 여지가 없다.

**중복 트리거 점검 (실측):**

* 세 함수 각각의 `lambda get-policy` 에 문이 **정확히 1개**, 각자 자기 rule ARN 으로 한정
* `gdelt-events-schedule` · `earth-events-schedule` · `distribution-schedule` ·
  `earthus-earth-events-schedule` → 전부 **존재하지 않음**
* `schedules.sh` 의 JOBS 루프는 규칙 이름을 `${FN}-schedule` 로 **만들어 낸다.** 그 목록에
  넣으면 기존 규칙을 둔 채 두 번째 규칙이 생겨 호출이 조용히 두 배가 된다. 경고 목록을
  셋 → 다섯으로 늘리고(gdelt·earth-events 추가), 두 신규 규칙은 이름을 전용 스크립트에 못 박았다.

**실패 동작**: 상류가 죽거나 입력이 늙으면 조립기가 예외로 끝난다 → 그 회차는 아무것도 쓰지 않고
기존 정본이 그대로 남는다. EventBridge 는 다음 회차에 다시 부른다.

> ⚠️ `events:ListRules` · `ListTargetsByRule` · `scheduler:ListSchedules` 가 이 사용자에게
> **없다**. target 연결은 `put-targets` 의 `FailedEntryCount=0` 으로 확인했고(스크립트가 단언한다),
> 규칙 자체는 `describe-rule` 로 되읽었다. 계정 전체 규칙 목록은 확인하지 못했다.

---

## 8. Distribution

| | |
|---|---|
| artifact SHA | `g3gJl1vHU74N4RY9sZSoZHeTyEx82hJjMAQ6cybzezc=` · 125,637 B · **변경 없음** |
| 안전 patch | 이미 배포·검증 완료(이전 라운드). 이번에 코드 변경 0 |
| 덮어쓰기 정책 | 색인은 읽어서 병합 · contentId 로 교체 · FAILURE ≠ EMPTY |
| archive 항목 | 9건 (변화 없음) · 익명 접근 `403` |
| publicItems | **0** |
| 이번 변경 | **스케줄 등록 1건뿐** |

**하루 1회를 고른 근거 다섯** (임의로 고르지 않았다):

1. `MAX_DAILY = 8` 이 제품 규칙이고 회귀 시험이 값을 고정한다 — 이름 그대로 **하루** 몫이다.
2. 이 엔진은 사람 검토용 DRAFT 만 만들고 자동 게시가 없다. 병목은 계산이 아니라 검토다.
3. `docs/DISTRIBUTION_DEPLOYMENT_GAP.md:858-872` 실측 — 10분 주기는 같은 8건을 하루 144번
   다시 만든다. 문서는 숫자만 주고 주기 결정을 제품에 남겼다.
4. 상류 비교: 후보의 재료(lab 보고서·점수표)는 하루보다 빠르게 바뀌지 않는다.
   뉴스 생산자의 30분 주기는 **이 엔진의 입력이 아니다.**
5. `contentId` 가 내용 주소라 반복 실행이 색인을 부풀리지 않는다.

00:00 UTC = 09:00 KST — 검토하는 사람이 아침에 새 후보를 본다.

---

## 9. V1 아이콘 교체

**교체 전 실측 — 넷은 자기 그림이 없어 남의 것을 빌려 쓰고 있었다:**

| 메뉴 | 이전 slug | 그 slug 를 함께 쓰던 곳 |
|---|---|---|
| 기상경보 | `typhoon` | 태풍 · 낙뢰 · V2 `weather.warning`/`hazards.typhoon`/`hazards.lightning` |
| 낙뢰 | `typhoon` | 위와 같음 |
| 각국 기관 재해 | `storm-surge` | V2 `ocean.coastal_inundation` (뜻이 다르다) |
| 열돔 | `temperature` | 기온 · 내일최고 · 내일최저 · V2 5곳 |
| 실시간 | (없음) | '지금 일어난 일' 버튼은 글자뿐이었다 |
| 쓰나미 | `tsunami` | 자기 것 (풍경화라 작은 크기에서 뭉갬) |
| 산불 | `wildfire` | 자기 것 (같은 문제) |

그래서 메뉴에서 **태풍·기상경보·낙뢰 세 줄이 같은 소용돌이**였다. 낙뢰가 회오리로,
기상경보가 토네이도로 보이던 원인이 이것이다.

**교체 후 — 새 slug 5 + 같은 slug 재작화 2 = 7종 × 4크기 = 28장:**

| 새 자산 | 형태 | 파일 |
|---|---|---|
| `live-alert` | 맥박 고리 + 중심 점 | `prototype/assets/earthus-icons/earthus-icon-live-alert-{24,32,64,128}.png` |
| `tsunami` | 말려 부서지는 큰 물마루 + 바다 선 | 〃 `-tsunami-*` (같은 이름, 새 그림) |
| `wildfire` | 큰 불꽃 + 연기 뭉치 | 〃 `-wildfire-*` |
| `weather-alert` | 구름 + 느낌표 | 〃 `-weather-alert-*` |
| `lightning-strike` | 굵은 번개 하나 | 〃 `-lightning-strike-*` |
| `agency-hazard` | 지구 + 경고 고리 | 〃 `-agency-hazard-*` |
| `heat-dome` | 돔 + 갇힌 해 + 열 띠 | 〃 `-heat-dome-*` |

* **형식/크기**: PNG RGBA 투명. 24·32·64 는 원이 캔버스를 꽉 채우고, **`-128` 파일만 110×110 에
  지름 100** 이다(실측 — 파일 이름의 128 은 거짓이지만 레지스트리가 그 이름을 정본으로 적고 있어
  바꾸지 않았다). 화면이 실제로 쓰는 것은 64(1x)·128(2x)다.
* **재질**: v1.2 여덟(uv·aqi·swell…)과 같은 유리구슬 — 왼쪽 위 광원 · 위쪽 광택 ·
  왼쪽 위 테두리 빛 · 오른쪽 아래 반사광 · 안쪽 그림자. 7종이 같은 코드로 그려져 어긋날 수 없다.
* **생성기**: `tools/make-hazard-icons.py` (370줄). 손으로 그리지 않은 이유와 버린 시안 셋
  (손으로 찍은 꼭짓점 → 갈고리 · 대칭 sin 언덕 → 산봉우리 · 해+빛살 → 기존 `uv` 와 형태 충돌)을
  주석에 남겼다.
* **old/new manifest**: 교체 전 16개 파일의 sha256·바이트·치수를 받아 두고 백업했다.
  덮어쓴 것은 `tsunami`·`wildfire` 8장뿐이고, 나머지 20장은 **새 파일**이다.
  기존 44종 중 어느 것도 덮어쓰지 않았다.

**코드 참조 교체 (파일만 만들고 끝내지 않았다):**

| 파일 | 변경 |
|---|---|
| `prototype/js/earthus-icons.js` | `SHIPPED` 44→49 · `ICON_LABELS` 5줄 · `V1_LAYER_ICON` 4줄 · `V2_PHENOMENON_ICON` 2줄 |
| `prototype/js/layerbar.js` | '지금 일어난 일' 버튼에 아이콘 + 실패 시 자기 제거 · 메뉴 아이콘 실패 시 옛 썸네일로 복귀 |
| `prototype/css/app.css` | `.ly-open--hazard` 3열 + `.ly-open-icon` (두 곳 — 아래 함정 참고) |
| `registry.json` ×2 | v1.3 · primary_icons 49 · layer55_mapping 4줄 재지정 |
| `docs/icon-system/icon-manifest.json` | v1.3 · icon_count 49 · changelog |

V1·V2 가 같은 라벨에 같은 아이콘을 쓴다는 §13 합격조건을 지키려고 V2 쪽
`weather.warning`·`hazards.lightning` 도 함께 옮겼다. `typhoon`·`temperature`·`storm-surge` 는
원래 임자에게 돌아갔다.

> ⚠️ **CSS 함정**: 아이콘을 넣었더니 화살표가 둘째 줄로 내려갔다. 파일 뒤쪽의 훨씬 구체적인
> 선택자 `body.menu-bar #menuSub.layers-right #layerStrip .ly-open` 이 2열로 되돌리고 있었다.
> 같은 자리에 같은 무게로 `--hazard` 규칙을 한 번 더 적어 고쳤다.
> ⚠️ `prototype/v2-deploy/assets/earthus-icons/` 는 **저장소가 추적하지 않는 빌드 산출물**이다
> (tracked 0건). 그 거울에도 새 그림을 써 두었지만 커밋하지 않았다 —
> `tools/build-v2-bundle.sh` 가 만드는 것이기 때문이다.

---

## 10. 아이콘 회귀검증

**브라우저 실측** (로컬 정적 서버 · `prototype/` 루트):

| 뷰포트 | broken image | 가로 넘침 | 화면 밖 아이콘 | 버튼 한 줄 |
|---|---|---|---|---|
| 375×812 (mobile) | 0 | 0 | 0 | 예 |
| 390×844 | 0 | 0 | 0 | 예 |
| 768×1024 (tablet) | 0 | 0 | 0 | 예 |
| desktop (에뮬레이션 해제) | 0 | 0 | 0 | 예 |

* 재난 8줄이 **서로 다른 파일 8개**를 읽는다(2x 화면이라 `-128` 변형 — srcset 동작 확인).
* 버튼은 `<button>` 이고 포커스가 간다. `alt=""` 유지(이름은 옆에 글자로 있다).
* 아이콘 실패 대비: 버튼 아이콘은 스스로 빠지고, 메뉴 아이콘은 옛 절차적 썸네일로 돌아간다.
* ⚠️ 첫 측정에서 8개가 `0×0` 으로 보였는데 `loading="lazy"` 때문이었다 —
  **기존 typhoon·earthquake 도 똑같이 그랬다.** 강제 로드하니 전부 64×64 로 정상.

**회귀 시험 10건 추가** (`tools/test_hazard_icons.mjs`, npm 143 → 153):
7종이 정한 그림을 읽는가 · 재난 8줄이 전부 다른 그림인가 · 빌린 그림을 원래 임자에게 돌려줬는가 ·
표가 가리키는 그림이 전부 디스크에 있는가(끊긴 참조 0) · 네 크기와 기하가 맞는가 ·
V2 거울이 있으면 바이트까지 같은가 · 레지스트리와 코드가 같은 말을 하는가 ·
세 곳의 숫자가 맞는가 · 이름표가 남아 있는가 · CSS 자리가 다른 버튼을 밀지 않는가.

---

## 11. source-governance artifact

* 배포된 artifact 를 내려받아 확인: `handler.py` · `policy.py` · `registry.draft.json` —
  **세 구성원 모두 새로 만든 staging artifact 와 바이트 동일**.
* 즉 운영은 **정상**이었다. 지난 보고서의 "NOT_VERIFIED" 를 여기서 해소한다.
* 새 패키징 규칙으로 staging artifact 생성 → zip → 압축 해제 → **콜드 스타트 동등 import PASS**
  (`EVALUATOR_VERSION` 계산이 `registry.draft.json` 을 실제로 읽는다) → packaging gate exit 0.
* **함수가 이미 있으므로 자동 생성하지 않았고, 재배포도 하지 않았다** (AWS 쓰기 0).
  다음 재배포 때 파일이 빠질 예정이던 것을 새 규칙이 막는다.

---

## 12. 테스트

| 묶음 | 결과 |
|---|---|
| `aws/earth-events/tests` | **82 passed** |
| `aws/_shared/tests` | **214 passed** + 45 subtests |
| `aws/distribution/tests` | **392 passed · 6 skipped**(기존) + 21 subtests |
| `aws/report-engine/tests` | **320 passed** |
| `npm test` | **153 pass / 0 fail / 0 skipped** |
| v11 `node --test` | **65 pass / 0 fail** |
| `services/research-runtime` | **80 passed** + 8 subtests |
| **합계** | **1,306 · failed 0** |

**삭제한 테스트 0 · 추가한 skip 0.** distribution 의 skip 6건은 이 세션 이전부터 있던 것이다.

> ⚠️ **이 숫자는 "이 작업 트리" 의 숫자다.** 저장소에는 앞선 승인 라운드가 일부러 추적하지 않기로 한
> 시험 파일이 11개 있다(예: `aws/distribution/tests/test_distribution.py`,
> `tools/earthus-v53/*.test.mjs` 4개). 갓 클론한 트리에는 그것들이 없으므로 같은 명령이
> 더 작은 수를 낸다. 내가 만든 것이 아니고 건드리지도 않았다 — 다만 "153" 을 조건 없이 적으면
> 새로 클론한 사람이 재현하지 못하므로 밝힌다.
> ⚠️ `research-runtime` 80 은 **`PYTHONPATH=".;.deps"` 로 돌렸을 때**의 수다. 그것 없이 돌리면
> 6건이 실패한다(의존 경로 문제이지 코드 결함이 아니다). 적대적 검증이 그것 없이 돌려 6 fail 을 보고했고,
> 두 방식을 모두 재현해 확인했다.

> ⚠️ 묶음은 **디렉터리별로** 돌린다. 함수마다 최상위 `handler.py` 가 있어 합쳐 돌리면
> `sys.modules['handler']` 를 서로 가려 26건이 깨진다(기존 성질). 3G 묶음은 그 수를 늘리지
> 않는다 — `tests/fixtures.py:load_handler()` 가 경로로 고유 이름으로 불러온다.

---

## 12.5 적대적 검증 — 네 주장을 무너뜨리려고 해 봤다

보고서를 쓰기 전에 위험이 큰 주장 넷을 따로 세워 **반증을 목표로 하는** 검증을 붙였다
(읽기 전용 · 쓰기 금지). 결과:

| 주장 | 판정 |
|---|---|
| 3G 는 공개 접두사에 쓸 수 없고 산출물은 공개로 안 읽힌다 | **살아남음** |
| 스케줄 셋은 이중 호출을 못 한다 | 부분 반증 (증거의 한계 — 아래) |
| 원자료는 어느 기계에서도 바이트가 같다 | **반증됨 → 고쳤다** |
| 이 세션에서 삭제·skip 한 테스트가 없다 | 부분 반증 (숫자의 전제 — §12 주석) |

**고친 것 (전부 시험으로 잠갔다 — 3G 74 → 82건):**

| 발견 | 무게 | 고친 내용 |
|---|---|---|
| 압축 바이트가 zlib 구현에 따라 달라진다 (3.12 vs 3.14 반례) | 높음 | `textSha256` + 압축기 신원 + **덮어쓰기 금지** (§2) |
| OS 바이트 패치가 no-op 이고 주석이 사실과 다르다 | 중간 | 주석 정정. 코드는 다른 구현체 대비로 남김 |
| `NaN`·`Infinity` 가 그대로 보관돼 엄격한 JSON 파서가 파일을 거부한다 | 중간 | `allow_nan=False` → 실패로 올린다 (값을 바꾸지 않는다) |
| 홀로 떨어진 서로게이트가 `UnicodeEncodeError` 로 새어 나간다 | 중간 | `RawArchiveError` 로 감싼다 (선언한 오류 종류를 지킨다) |
| `publicWrites: 0` 이 **상수**라 위반을 영영 못 잡는다 | 중간 | 문을 지난 키를 세는 원장(`WriteLedger`)으로 교체 |
| `handler.py` 머리말이 "아직 배포 안 됨 · AWS WRITE = 0" 이라 실제와 반대로 안전해 보인다 | 정보 | 운영 상태로 정정 |
| 원자료를 건너뛴 회차가 `PARTIAL` 로 보고돼 건강한 실행이 경보로 보인다 | (자체 발견) | 건너뜀은 `SUCCESS` 로 판정 |

**살아남은 주장의 근거 (검증자가 직접 확인한 것):**
버킷 정책의 익명 읽기 허용 접두사는 정확히 8개이고 `archive/` 는 어디에도 없다 ·
143개 산출물 전부를 무자격 요청으로 네 경로(가상호스트·경로형·레거시·CloudFront)에서 시도해 **200 이 0건** ·
`publication_privacy` 의 공개 목록이 실제 버킷 정책과 정확히 일치 · 3G 패키지 안의 S3 쓰기는
`handler.py` 한 곳뿐이고 두 겹의 문을 지난다 · 경로 traversal·동형문자·대소문자 변형 모두 거부됨.

**반증되지 않았지만 남는 한계 (숨기지 않는다):**
* `events:ListTargetsByRule` · `lambda:GetFunctionEventInvokeConfig` · `iam:GetRolePolicy` 가 이 사용자에게
  없어서 **타깃 재시도 정책과 IAM 정책 본문을 되읽지 못했다.** EventBridge→Lambda 전달은 원래
  at-least-once 이므로 "이중 호출이 절대 없다"는 증명 불가다. 다만 중복 호출이 와도 원자료는
  덮어쓰지 않고 정본은 같은 키를 같은 내용으로 갱신한다.
* `earthus-distribution-daily` 는 **아직 한 번도 발화하지 않았다**(첫 틱이 00:00 UTC). 규칙·타깃·권한은
  확인했지만 끝에서 끝까지의 증거는 내일 생긴다.
* 검증자가 "역할이 버킷 전체 쓰기를 갖는다"고 적었는데, 그것은 `deploy-python.sh` 의 **기본 경로**를
  읽은 추론이다. 실제 배포 로그는 `▸ 역할 있음: earthus-lambda-earth-events` 를 찍었다 — 그 분기는
  실행되지 않았다. 다만 `iam:GetRolePolicy` 가 없어 **정책 본문으로 반박하지는 못한다.**
* 검증자가 "`aws/_shared` 214 중 2건 실패" 라고 적었는데 **재현되지 않았다.** 저장소 루트와
  `aws/_shared` 두 곳에서 각각 돌려 214 passed / 0 failed 를 확인했다.

---

## 13. Git

| commit | 내용 | 규모 |
|---|---|---|
| `207cee15` | 3G core + raw archive + 문서 정정 3건 | 30 files · +5,422 / −14 |
| `3a42c929` | 패키징 자료파일 규칙 + 배포 이름 예외 | 5 files · +241 / −4 |
| `6538af89` | 스케줄 스크립트 2개 + schedules.sh 경고 | 3 files · +113 / −4 |
| `a6b23de1` | V1 아이콘 교체 | 111 files · +4,501 / −36 |

### ⚠️ `a6b23de1` 에 내 것이 아닌 파일 75개가 섞였다 — 밝힌다

같은 브랜치에 **다른 세션이 동시에** 작업 중이었다. 나는 경로를 하나하나 지정해 `add` 했고
(`git add -A` 를 쓰지 않았다) 스테이징 직후 `git diff --cached --name-only` 로 36개만 올라간 것을
확인했다. 그런데 확인과 `git commit` 사이에 다른 세션이 자기 파일을 인덱스에 올렸고,
경로를 한정하지 않은 내 `commit` 이 **인덱스 전체**를 가져갔다.

* 내 파일 36 / 남의 파일 75 (`wonder 3/earthus-v3-wonder/` 지구 자산 v2)
* **작업은 하나도 잃지 않았다.** 다른 세션이 `0cfc36bb` 로 "어디로 갔는지"를 기록했다.
* 히스토리를 다시 쓰지 않았다 — 다른 세션이 같은 브랜치에서 계속 커밋 중이라 되감기가 더 위험하다.
* 재발 방지: 동시 세션이 있는 트리에서는 `git commit -- <경로>` 로 **커밋 자체에 경로를 한정**해야 한다.
  스테이징 시점 확인만으로는 막을 수 없다. (이후 커밋 3건은 전부 그 방식이다.)

### 읽기 전용 추적 결과 — **손실 0 · 보정 커밋 불필요**

히스토리를 다시 쓰지 않고(reset·rebase·force push·revert-all 전부 금지) 사실만 추적했다.

| 확인 | 결과 |
|---|---|
| `a6b23de1` 안의 삭제(D) | **0건** |
| 이름변경·복사(R/C) | **0건** |
| 섞인 75개의 변경 종류 | 추가(A) 69 · 수정(M) 6 |
| 75개가 HEAD 에 살아 있는가 | **75 / 75 present · missing 0** |
| a6b23de1 이후 상태 | 70개 그대로 · 5개는 **그쪽 후속 커밋 `043f088d` 가 정상 갱신** |
| 그 세션의 자체 시험 (`wonder 3/earthus-v3-wonder`) | **111 passed / 0 fail** |

수정(M) 6개 중 2개(`earth-main.mjs` · `ARCHITECTURE_LOCK.md`)는 그쪽이 뒤이어 다시 손봤고,
나머지 4개는 그대로다. 반쯤 된 상태가 굳은 흔적도, 막힌 작업도 없다.

**판정: 내용상 보정이 필요 없다.** 남은 것은 커밋 메시지의 귀속뿐이고,
그 세션이 `0cfc36bb` 로 "어디로 갔는지"를 이미 기록했다. 두 기록이 서로를 가리키므로
되감기보다 안전하다.

> 굳이 보정하고 싶다면(**실행하지 않았다 · 계획만**): 히스토리를 건드리지 않는 방법은
> `git notes add -m "…" a6b23de1` 로 그 커밋에 메모를 붙이는 것뿐이다. 파일은 바뀌지 않고
> 이력도 그대로다. 다만 `git notes` 는 기본으로 push 되지 않아 협업자가 못 보므로,
> 지금처럼 **커밋 두 개(0cfc36bb · 이 보고서)로 남기는 편이 더 잘 보인다.**

**커밋하지 않은 것**: `prototype/v2-deploy/assets/earthus-icons/`(추적하지 않는 빌드 산출물) ·
다른 세션과 무관한 세션의 기존 수정분(`aws/ocean-solar` · `aws/tourism-flow` ·
`docs/V3-CHARACTER-PROMPT-SPEC.md` · `prototype/v2-three` 등) · 승인받지 않은 기능 ·
scratchpad 의 검증 스크립트.

---

## 14. AWS 쓰기 회계

| # | 작업 | 대상 |
|---|---|---|
| 1 | `iam create-role` | `earthus-lambda-earth-events` |
| 2–3 | `iam put-role-policy` ×2 | `earth-events-minimal` · `earth-events-read-minimal` |
| 4 | `lambda create-function` | `earthus-earth-events` |
| 5 | `lambda update-function-configuration` | 환경변수 3개(기존 2개 보존 + live 문 1개) |
| 6 | `lambda invoke` (dryRun) | 쓰기 0 |
| 7 | `lambda invoke` (LIVE) | S3 PUT 126 (raw 1 + canonical 125) |
| 8–10 | `events put-rule` · `put-targets` · `lambda add-permission` | 3G 스케줄 |
| 11–13 | `events put-rule` · `put-targets` · `lambda add-permission` | distribution 스케줄 |

| 14 · 16 | `lambda update-function-code` ×2 | 적대적 검증 수정 반영 (환경변수 보존 확인) |
| 15 · 17 | `lambda invoke` (LIVE) ×2 | 덮어쓰기 금지 실증 — 원자료 **쓰지 않음**, 정본만 갱신 |

이후 `14:15:24Z`·`14:45:24Z` 스케줄 자동 실행 2회. **삭제 0 · 원자료 덮어쓰기 0 ·
기존 함수 코드 변경 0 · 공개 접두사 쓰기 0 · Postgres 쓰기 0.**

롤백 경로: `lambda delete-function` · `iam delete-role-policy`+`delete-role` ·
`events remove-targets`+`delete-rule` · `lambda remove-permission` ·
`archive/earth-events/` 객체 삭제(전부 이번에 새로 만든 것이고, 이전에는 **0개**였다).

---

## 15. POST-LAUNCH BACKLOG — **전부 동결(FROZEN)**

아래는 전부 운영에 필요하지 않은 항목이다. FINAL FREEZE 에 따라 **착수하지 않는다.**
여기 적어 두는 이유는 잊지 않기 위해서이지 다음에 할 일이라서가 아니다.

1. **운영 Postgres 적용** — 사람이 Supabase SQL Editor 에서. 절차는 `docs/DB_MIGRATION_PLAN.md:179-192`.
   적용 후 `mode=LIVE` 색인 대조를 운영 DB 로 다시 돌린다.
2. **메모리 2048MB → 축소** — 실측 최대 사용 100MB. 48회/일 × 47.6초의 비용이 그대로 걸려 있다.
3. **정본 쓰기 병렬화** — 47.6초의 대부분이 순차 PutObject 125회다.
4. **`earthus_news_article` 제목 없는 기사 7건** — 스키마가 `title not null` 인데 상류가 제목을
   못 준다. 제목을 지어내지 않는 한 넣을 수 없다. 스키마 쪽 결정이 필요하다.
5. **`kind` 어휘** — SQL 주석은 TC/EQ/FLOOD 를 말하지만 우리 분류기는 GDELT root 만 준다.
   `kind_vocabulary: "gdelt-root"` 로 적어 두었다.
6. **`phenomenon_id` 매핑 규칙** · **시간 정밀도 칸** — 둘 다 미결정.
7. **`geolocate` 두 사본 통합** — `gdelt-events` 가 운영 함수라 손대지 않았다. 상수 대조 시험이 어긋남을 막는다.
8. **`report-engine` 의 CWD 의존 시험 1건** — 저장소 루트에서는 통과하고 하위 폴더에서는 실패한다.
   기존 결함이고 이번에 고치지 않았다.
9. **V2 번들 재빌드** — `tools/build-v2-bundle.sh` 로 아이콘 거울을 정식 반영.
9b. **패키징의 "결정적 ZIP" 문구 손질** — 구성원 내용은 결정적이지만 컨테이너 압축 바이트는
    파이썬·zlib 판에 묶인다(이 기계에서 실증). `content_digest()` 로 판정하도록 문서와
    게이트 문구를 맞추는 것이 남았다. 이번에는 사실만 확인하고 문구는 건드리지 않았다.
10. **공개 투영(public projection)** — 지금은 대상이 0건인 것이 정상이다. eligibility 경로가
    생기기 전까지 3G 는 공개 승격을 하지 않는다.

---

## 16. DO NOT TOUCH — 운영 자원

아래는 **변경하지 않는다.** 읽기만 한다.

| 자원 | 현재 상태 |
|---|---|
| `earthus-gdelt-30min` | `cron(5,35 * * * ? *)` ENABLED |
| `earthus-earth-events-30min` | `cron(15,45 * * * ? *)` ENABLED |
| `earthus-distribution-daily` | `cron(0 0 * * ? *)` ENABLED |
| Lambda `earthus-earth-events` | Active · `uW0rqTIpGUycES29+pyo6/VJReLvzC/zFZTKEMG1mDs=` |
| Lambda `distribution` | Active · `g3gJl1vHU74N4RY9sZSoZHeTyEx82hJjMAQ6cybzezc=` |
| `archive/earth-events/canonical/v1/` | 164 객체 |
| `archive/earth-events/raw/` | 3 파트 (배치마다 하나 · 덮어쓴 적 없음) |
| 그 밖의 기존 AWS 자원 · 현재 production artifact | 그대로 |
| `services/research-runtime` | SimulationRun 원장. Postgres 로 복제하지 않는다 |

## 17. 최종 확인 (2026-09-13 15:00 UTC)

```
PRODUCTION_RUNNING     = YES
POSTGRES_APPLY         = PENDING_USER
SCHEDULES              = VERIFIED   (3/3 ENABLED · 중복 트리거 0)
LAMBDA                 = VERIFIED   (2/2 Active · Layer 0 · Function URL 없음)
RAW_ARCHIVE            = VERIFIED   (3 파트 · 덮어쓰기 0)
CANONICAL_EVENTS       = VERIFIED   (164 · event_id 충돌 0 · 형식 위반 0)
TRACE                  = VERIFIED   (global.json → raw → source → article → evidence
                                     → EarthEvent → canonical S3 → Postgres 행)
CONSISTENCY            = LIVE PASS  (require_live() 통과 · findings 0)
PUBLIC                 = 0          (익명 403 · 공개 접두사에 earth-event 객체 0)
TESTS                  = 1,306 / 0 FAIL
AWS_UNEXPECTED_WRITE   = 0          (승인 17건 + 스케줄 자동 2회 외 없음)
DATA_DELETE            = 0
```

여기서 개발을 멈춘다. 새 설계·새 엔진을 더하지 않는다.
