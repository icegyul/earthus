# PHASE 3G 정책 결정 — 정본

작성 2026-09-13 · 상태 **DESIGN ONLY** · 코드 0줄 · SQL 적용 0건 · AWS 쓰기 0건

3G(Earth Event Assembler)는 `events/global.json` 을 읽어 canonical EarthEvent 을 만든다.
**구현은 아직 시작하지 않았다.** 이 문서는 구현 전에 확정된 정책만 적는다.

결정 5건(① ② ③ ④ ⑦)과 B6 는 **사용자가 확정했다.** 재해석하지 않는다.
결정과 저장소가 어긋나는 자리는 「고쳐야 할 것」에 파일:줄로 적었다 — 그 자리에서는 결정이 이긴다.

⚠️ **이 문서가 정하지 않은 값은 비워 두었다.** §6 미결정 목록이 그것이다.
설계 초안 과정에서 값을 채워 넣은 것이 여러 건 있었고(해시 문자열 형식·격자 폭·정밀도 판정 규칙 등),
전부 제거했다. 정해지지 않은 것을 문서에 적으면 그것이 결정으로 굳는다.

---

## 0. 지금 상태 — 실측

| 항목 | 측정 | 근거 |
|---|---|---|
| 3G 구현 | **없다** — 함수 디렉터리 없음 · `events/earth-events.json` 부재(운영 head-object) | — |
| 입력 | `events/global.json` — GDELT 2.0 Events · 창 3시간 · 사건 150건 · 99,366 B | 익명 HTTPS 읽기 |
| 생산자 | 유일 | `aws/gdelt-events/handler.py:582-586` |
| 생산 주기 | `earthus-gdelt-30min` = `cron(5,35 * * * ? *)` ENABLED | 운영 `events describe-rule` |
| 마이그레이션 | 표·도메인 초안 있음 · **DB 적용 0건** | `aws/_shared/sql/20260913_earth_event_core.sql:3-9` |
| `article_dedup.py` | 3G 를 위해 작성됐고 **운영 호출자 0건** | `docs/PHASE3H_DEDUP_IMPLEMENTATION.md` |

---

## 1. 결정 ① INDEPENDENCE_COUNT

`independence_count` 는 기사 수가 아니라 **독립 원천 단위(independence unit)** 의 개수다.

- 동일 원문 계열(원문 · 번역본 · 재전재 · 요약 재작성) = **같은 unit 1개**
- 서로 독립적인 것(공식기관 · 위성관측 · 독립 언론 · 현지 관측) = **각각 별도 unit**
- 판정 우선순위 ① lineage root ② source publisher/family ③ source type
  ④ **unknown 은 보수적으로 독립성을 인정하지 않는다**
- `CORROBORATED` 판정은 이 unit 을 쓴다. **기사 개수를 쓰지 않는다**
- 구현은 `article_dedup.py` 의 `TRANSLATION_OF` / `SYNDICATION_OF` / `lineage` /
  `independence_units` 를 **우선 재사용**한다

계산 규칙은 → `docs/3G_TRUTH_RULES.md` §B5

### 고쳐야 할 것
⚠️ `docs/TRUTH_VOCABULARY_CANONICAL.md:250`
```
| gdelt status | confirmed | NEWS | CORROBORATED (교차검증 점수가 곧 독립 출처 수다) |
```
괄호 안이 **틀렸다.** 같은 문서 `:125` 는 `CORROBORATED` 를 "독립 출처 2개 이상 ·
`independenceGroup` 고유 수 ≥ 2" 로 정의한다. GDELT 의 `score` 는 매체 수·언급량·매체가중·
좌표정밀도·시간감쇠를 섞은 값이므로 독립 출처 수가 아니다. 결정 ① 이 `:125` 를 택한다.
`:250` 은 "`confirmed` 단독으로는 `REPORTED`, `independence_units ≥ 2` 일 때만 `CORROBORATED`"
로 고쳐야 한다.

---

## 2. 결정 ② PUBLIC / PRIVATE

- canonical EarthEvent 은 반드시 **PRIVATE / SHADOW** 로 저장한다
- canonical 저장 위치 = **`archive/earth-events/…`** — `events/` 는 정본 저장소가 **아니다**
- `events/` 에는 **public eligibility 를 통과한 sanitized public projection 만** 허용
- `SHADOW` · `REVIEW_REQUIRED` · `BLOCKED` · `UNKNOWN` 인 Event 는 `events/` 에 **절대 쓰지 않는다**
- `check_public_write` 는 canonical EarthEvent 를 직접 공개시키는 용도가 아니다 —
  필요하면 **public projection 전용 게이트를 별도로** 만든다
- **자동 게시 없음**

→ B1(SHADOW vs PUBLIC 접두사 모순) 해소. 경계 설계는 → `docs/3G_PUBLIC_PRIVATE_BOUNDARY.md`

### 고쳐야 할 것 (전부 실측 확인)
⚠️ `aws/_shared/sql/20260913_earth_event_core.sql:11-13` — "EarthEvent 의 **정본은 S3** 다:
`events/earth-events.json` + `events/earth-events/<event_id>.json`". 결정 ② 와 정면 충돌.
⚠️ `docs/EARTHUS_STORAGE_ARCHITECTURE.md` 가 **스스로 모순한다**:
```
:43      원본은 S3 events/earth-events.json + events/earth-events/<event_id>.json
:126-127 사건 조립기가 만드는 earth_event 도 archive/earth-events/ 에 쌓는다.
         공개 events/earth-events.json 은 그 파생 스냅샷이다
:246     earth_event | S3 events/earth-events.json (색인) + events/earth-events/<id>.json
:247     불변 원자료 | S3 archive/earth-events/dt=…/hh=…/part.jsonl.gz
```
결정 ② 는 **`:126-127` 쪽을 고른다.** `:43` · `:96` · `:164-165` · `:246` 을 그에 맞춰 고친다.

⚠️ **주소 충돌 주의.** `:247` 이 `archive/earth-events/dt=…/hh=…/part.jsonl.gz` 를 이미
"불변 원자료"(archiver 의 jsonl 형식)로 쓰고 있다. 결정 ② 의 canonical 저장소가 같은 접두사
아래 오므로 **두 계보를 구별하는 키 배치가 필요하다.** 그 배치는 §6 미결정 1 이다.

---

## 3. 결정 ③ GDELT TIME

- `ageMin` 을 정확한 timestamp 로 취급하지 않는다. 원본을 **`source_age_min`** 으로 보존
- 필요시 `estimated_event_time = ingest_time − ageMin` 을 계산할 수 있으나
  반드시 **ESTIMATED/RELATIVE 상태로 표시**한다
- 정확한 `observed_at` / `published_at` 이 없으면 **임의의 정확한 timestamp 를 생성하지 않는다**
- 시간 정밀도 메타데이터 유지: **EXACT · ESTIMATED · RELATIVE · UNKNOWN**
- Event timeline 과 provenance 에서 이를 구분한다

상세는 → `docs/3G_TIME_PROVENANCE.md`

기존 계약과 어긋나지 않는다: `docs/EARTH_EVENT_CANONICAL_MODEL.md` §8 의 잠긴 계약
"시간 4분법 — `occurred/issued/updated/retrieved` 4칸 유지. `null` 을 `now()` 로 채우지 않는다"
와 같은 방향이다. 결정 ③ 은 그 위에 **정밀도를 잃었다는 사실 자체를 저장하게** 더한다.

---

## 4. 결정 ④ EVENT_ID

- GDELT `GlobalEventID` 를 canonical `event_id` 로 **쓰지 않는다** — source-local identifier 로 보존
- canonical event_id 는 **deterministic fingerprint** 기반
- 최소 입력: `event_type` · `canonical_place` · `time_bucket` · `primary_entities` · `event_key_version`
- **`event_key_version` 을 반드시 저장**한다
- 동일 입력 → 동일 EarthEvent ID. GDELT 회차별 source ID 변경 → 같은 EarthEvent 에 연결 가능
- merge/split 시 source IDs 와 aliases 를 보존
- **collision test 필수**

상세는 → `docs/3G_EVENT_ID_SPEC.md`

### 실측으로 확인한 두 가지
**⑴ 이 결정은 npm 143 기준선을 깨지 않는다.**
`docs/EARTH_EVENT_CANONICAL_MODEL.md:633` §8 표가 `{kind}-{sourceId}` 를
`test_v2_ui_information_architecture.mjs` 2건이 고정한다고 적었다. 그 2건을 읽어 보니
형식을 검사하지 않는다 — `:120` `feed.selectById(ds.eventId, orbit)` ·
`:156-157` `updateMarkers(camera, altKm, (eventId, kind) =>` — **호출 모양만** 본다.
그리고 id 를 파싱(`split`/`match`)하는 소비자가 저장소에 **0건**이다.
고쳐야 할 것은 문서 서술과 SQL 주석뿐이다:
`EARTH_EVENT_CANONICAL_MODEL.md:40` · `:198` · `:242` · `:633` ·
`20260913_earth_event_core.sql:145`(`event_id` 주석 "{kind}-{sourceId} ← 잠긴 정본 주소").

**⑵ v11 `stableId` 를 그대로 이식하면 collision test 를 통과할 수 없다.**
`prototype/js/earthus2/v11/core/contracts.js:13-17` 은 FNV-1a **32비트** → `ei_`+8hex 다.
하루 유입 상한 150건 × 48회 = 7,200 사건/일 기준 생일 한계(계산):

| 형식 | 공간 | 50% 충돌 | 1/1e6 유지 한계 | 7,200/일 |
|---|---|---|---|---|
| v11 `ei_`+8hex | 2^32 | 77,162 | **92** | 즉시 초과 |
| `CNT-`+12hex(distribution) | 2^48 | 19,753,662 | 23,726 | 3.3일 |
| 16hex | 2^64 | 5.06e9 | 6,074,000 | 844일 |
| 20hex | 2^80 | 1.29e12 | 1.55e9 | 실질 무한 |

→ 알고리즘(입력 조립 방식)은 재사용하고 **해시 함수는 재사용하지 않는다.**
폭은 §6 미결정 2 다 — 보존 정책(⑧)이 정해지지 않아 상한을 확정할 수 없다.

---

## 5. 결정 ⑦ INPUT SCOPE · B6 PROVENANCE

**⑦** 이번 3G 의 실제 입력은 **`events/global.json` 하나로 제한**한다.
내부 API/schema 는 **source-agnostic** 하게 만든다.
향후 adapter: GDACS · USGS · KMA · 기타 기관 · satellite/event feeds — **이번엔 live ingest 없음.**
상세는 → `docs/3G_SOURCE_SCOPE.md`

**B6** `events/global.json` 을 provenance registry 에 등록한다. 미등록 dataset 은
truthType UNKNOWN 으로 남고 public promotion 이 막히는 현재 정책을 유지한다.
등록은 **실제 source metadata 를 근거로** 한다 — 임의의 truthType 을 만들지 않는다.
실측: `resolve_dataset('events/global.json')` → `resolved=False` · `truthType=UNKNOWN`
(대조: `ocean/lab-reports.json` · `wind/series/verify-daily.json` 은 `resolved=True`).
등록 항목의 채움과 **truthType 미결정**은 → `docs/3G_TIME_PROVENANCE.md` §B6

---

## 6. B4 구현안 — Postgres migration / apply 경로

### 6.1 마이그레이션 파일
`aws/_shared/sql/20260913_earth_event_core.sql` 하나. 새 파일을 만들지 않는다.
`SCHEMA_CONFLICT` 가드가 `begin;` 직후에 있다 — `create table if not exists` 의 조용한 no-op 을
막기 위한 것이다. 롤백 블록이 주석으로 들어 있다.

### 6.2 적용 주체 — 자동화할 수 없다
파일 머리말(`:3-9`)이 **사람이 Supabase SQL Editor 에 붙여 실행**하는 방식임을 적고 있다.
`docs/PHASE3_IMPLEMENTATION_REPORT.md` §5.2 의 실측이 근거다:
`supabase --version` → command not found · `env | grep -iE "supabase|postgres|database_url"` → 없음 ·
`supabase/.temp/linked-project.json` 에 링크 정보만 있음.
→ **CI 자동 적용 경로가 없다.** 이 저장소의 마이그레이션 관행이 그렇다.

### 6.3 적용 순서
```
1. 도메인 4종 (truth_status · source_kind · data_state · release_state)
2. earthus_source        — 다른 표가 참조한다
3. earthus_earth_event   — source 를 참조한다
4. 관계·증거·타임라인·trace 표
5. 색인
```
파일이 이 순서로 쓰여 있으므로 **파일을 그대로 한 번 실행하는 것이 순서다.** 쪼개지 않는다.

### 6.4 롤백
파일 안의 주석 롤백 블록을 쓴다. 원칙: **S3 가 진실이므로 Postgres 를 지우는 것은 데이터
손실이 아니다**(`:11-16` "불일치가 생기면 S3 를 옳다고 보고 색인을 다시 만든다").
단 `SimulationRun` 은 research-runtime SQLite 가 원장이고 Postgres 에 복제하지 않는다(`:17`) —
롤백이 그 원장을 건드리지 않는다.

### 6.5 S3 canonical ↔ Postgres index 일관성
`aws/_shared/index_consistency.py:55` `check(canonical, index, mode, references=None)` ·
`:158` `require_live(result)`. `mode` 는 필수 인자이고 `FIXTURE` 결과를 LIVE 근거로 쓰면
`ConsistencyError` 를 던진다. 3G 는 쓰기 뒤 이 검사를 돌린다.
불일치 시 **S3 를 옳다고 보고 색인을 다시 만든다** — canonical 을 색인에 맞추지 않는다.

### 6.6 이번 단계에서 하지 않는 것
DB 적용 0건. 스키마 변경 0건. 이 절은 **적용안**이고 적용이 아니다.

---

## 7. 문서 색인

| 문서 | 담는 것 |
|---|---|
| `docs/3G_POLICY_DECISIONS.md` | 이 문서 — 결정 5건 · B6 · **B4 구현안** · 미결정 목록 |
| `docs/3G_TRUTH_RULES.md` | **B3**(TRUTH_STATUS 승격 규칙) · **B5**(independence_count 계산 규칙) |
| `docs/3G_PUBLIC_PRIVATE_BOUNDARY.md` | **B2**(경계 설계) · 결정 ② 상세 |
| `docs/3G_EVENT_ID_SPEC.md` | 결정 ④ 상세 · 충돌 시험 |
| `docs/3G_TIME_PROVENANCE.md` | 결정 ③ 상세 · **B6** 등록 항목 |
| `docs/3G_SOURCE_SCOPE.md` | 결정 ⑦ 상세 · source-agnostic 레코드 계약 |

---

## 8. 미결정 — 구현 전에 정해야 한다

결정 ①②③④⑦ 이 정하지 않은 것. **여기 있는 값을 문서 어디에도 채워 넣지 않았다.**

1. **canonical 키 배치** — `archive/earth-events/` 아래에서 canonical 과
   기존 "불변 원자료"(`dt=…/hh=…/part.jsonl.gz`, STORAGE_ARCHITECTURE:247)를 구별하는 배치
2. **event_id 해시 폭** — 16hex / 20hex / 그 이상. 보존 정책(⑧)에 달려 있다
3. **canonical id 문자열 형식** — 접두사를 둘 것인가, 무엇으로 할 것인가
4. **`event_key_version` 초기값과 증가 규칙**
5. **`time_bucket` 폭** — 결정 ④ 의 지문 입력이지만 폭이 정해지지 않았다
6. **`canonical_place` 정규화 규칙** — 좌표 격자인가 지명인가, 격자면 폭은 얼마인가
7. **`primary_entities` 추출 규칙** — GDELT 에 엔티티 목록이 없다
8. **`independence_group` 을 GDELT 입력에서 채우는 방법** —
   `CORROBORATED` 문턱 자체는 **정해져 있다**(`TRUTH_VOCABULARY_CANONICAL.md:125`
   `independenceGroup` 고유 수 ≥ 2). 미결정은 그 그룹을 GDELT 에서 어떻게 얻는가다.
   `domain` 을 그대로 쓰면 같은 언론 그룹의 여러 도메인이 별도 unit 이 되어 부풀려진다.
   그룹 매핑 자료가 저장소에 없다 → `3G_TRUTH_RULES.md` §2.5
9. **public projection 게이트의 이름·위치·허용목록**
10. **projection 스키마 버전 문자열**
11. **`source_age_min` 과 정밀도 열거를 담을 SQL 칸** — 현재 스키마에 없다
12. **provenance `truthType`** — 기존 어휘 4종에 제3자 뉴스 집계가 없다
13. **3G 실행 주기와 health 감시 행** — `SCHEDULE = NOT_CREATED` 유지
14. **`global.json` 에서 이탈한 사건의 생애**(150건 상한·3시간 창으로 매 회차 빠진다)
15. **dedup 임계값 미측정 상태로 출하할지**
    (`docs/PHASE3H_DEDUP_IMPLEMENTATION.md:181` 가 추론값임을 적었다)

## 9. 이 문서가 결정하지 않은 것
구현 착수 · 코드 작성 · SQL 적용 · 스케줄 등록 · AWS 쓰기. 전부 별도 승인 대상이다.
