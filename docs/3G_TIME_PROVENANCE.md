# 3G 시간과 출처 — 결정 ③ · B6 등록안

작성 2026-09-13 · DESIGN ONLY · 코드 0줄 · AWS 쓰기 0건
정책 정본 → `docs/3G_POLICY_DECISIONS.md` §3 · §5

---

## 1. 결정 ③ (확정)

- `ageMin` 을 정확한 timestamp 로 취급하지 않는다. 원본을 **`source_age_min`** 으로 보존
- 필요시 `estimated_event_time = ingest_time − ageMin` 을 계산할 수 있으나
  반드시 **ESTIMATED/RELATIVE 상태로 표시**한다
- 정확한 `observed_at` / `published_at` 이 없으면 **임의의 정확한 timestamp 를 생성하지 않는다**
- 시간 정밀도 메타데이터 유지: **EXACT · ESTIMATED · RELATIVE · UNKNOWN**
- Event timeline 과 provenance 에서 이를 구분한다

---

## 2. 입력에 시각이 없다 — 실측

`events/global.json` 의 사건 하나에는 **절대 시각이 없다.** 있는 것은 `ageMin`(상대 분) 하나다.
파일 봉투에는 `generated`(파일 생성 시각)와 `sourceFile`(GDELT 내보내기 파일 이름,
예 `20260913104500`), `windowHours = 3` 이 있다.

수집은 `earthus-gdelt-30min` = `cron(5,35 * * * ? *)` 로 30분마다 돌고, 창이 3시간이다.
따라서 `ageMin` 의 정밀도는 **분 단위가 아니다** — 배치 주기와 창에 묶여 있다.

⚠️ `ageMin` 이 0 인 경우의 뜻("진짜 방금"인가 "모른다"인가)은 **미결정**이다.
이 문서가 판정 규칙을 만들지 않는다.

---

## 3. 기존 시간 계약과 맞춘다 — 새 시간 모델을 만들지 않는다

SQL 에 이미 잠긴 계약이 있다(`aws/_shared/sql/20260913_earth_event_core.sql:157-162`):
```sql
-- 시각 4분법 (intel-feed.js F01 기록). null 을 now() 로 채우지 않는다 — 그래서 전부 nullable 이고
-- retrieved_at 만 not null 이다(우리가 받은 시각은 항상 안다).
occurred_at   timestamptz,
issued_at     timestamptz,
updated_at    timestamptz,
retrieved_at  timestamptz not null,
```
`docs/EARTH_EVENT_CANONICAL_MODEL.md` §8 도 같은 것을 잠긴 계약으로 적었다 —
"`occurred/issued/updated/retrieved` 4칸 유지. `null` 을 `now()` 로 채우지 않는다".

결정 ③ 은 이 계약과 **같은 방향**이고, 그 위에 하나를 더한다:
**정밀도를 잃었다는 사실 자체를 저장한다.**

### 3.1 GDELT 경로에서 네 칸이 어떻게 채워지는가
| 칸 | GDELT 에서 | 근거 |
|---|---|---|
| `retrieved_at` | **채운다** — 우리가 파일을 읽은 시각 | `not null`. "받은 시각은 항상 안다" |
| `occurred_at` | **미결정** — `ageMin` 으로 추정할지, `null` 로 둘지 | 추정하면 반드시 정밀도 표시가 따라야 한다 |
| `issued_at` | `null` | GDELT 는 발표 통보문이 아니다 |
| `updated_at` | `null` 또는 파일 `generated` | **미결정** |

⚠️ `occurred_at` 을 추정값으로 채울지 `null` 로 둘지는 이 문서가 정하지 않는다.
결정 ③ 은 "계산할 수 있으나 반드시 ESTIMATED/RELATIVE 로 표시한다"까지만 정했고,
`occurred_at` 이라는 **정확 시각 칸**에 추정값을 넣는 것이 그 표시로 충분한지는 별개 판단이다.
`null` 을 `now()` 로 채우지 않는다는 계약과의 관계도 함께 봐야 한다.

### 3.2 정밀도를 담을 칸이 지금 없다
현재 스키마에 `source_age_min` 도, 정밀도 열거(EXACT/ESTIMATED/RELATIVE/UNKNOWN)도 없다.
있는 것은 **위치** 정밀도다 — `location_precision`(`:155`,
`EXACT_SOURCE`/`CITY`/`REGION`/`COUNTRY`/`NONE`) 와 `location_doubt`(`:156`).
시간 쪽에는 대응물이 없다.

→ **최소 추가가 필요하다**(칸 이름·개수는 미결정). 위치 쪽이 선례이므로
같은 모양(정밀도 열거 + 의심 불리언)을 따르는 것이 자연스럽다는 것까지만 적는다.

---

## 4. 무엇을 보존하는가

| 보존할 것 | 원천 | 왜 |
|---|---|---|
| `source_age_min` | 사건의 `ageMin` | 결정 ③ 이 명시. 원본을 잃지 않는다 |
| 파일 `generated` | 봉투 | `ageMin` 의 기준점. 이것 없이는 복원이 불가능하다 |
| `sourceFile` | 봉투 | GDELT 내보내기 파일 식별자. 재현의 근거 |
| `windowHours` | 봉투 | 정밀도의 상한을 설명한다 |
| `rules.cappedByLimit` · `counts` | 봉투 | 입력이 잘렸는지. → `3G_SOURCE_SCOPE.md` |

⚠️ `estimated_event_time` 의 오차 범위를 이 문서는 숫자로 적지 않는다.
초안 과정에서 두 값이 나왔고 서로 달랐다. 오차는 ⑴ 반올림 ⑵ 배치 주기 ⑶ 창 길이
⑷ GDELT 자체의 `DATEADDED` 정밀도가 겹친 것이므로, 근거를 실측으로 확정한 뒤 적는다.

---

## 5. B6 — provenance 등록안

### 5.1 지금 상태 (실측)
```
resolve_dataset('events/global.json')       → resolved=False · truthType=UNKNOWN
resolve_dataset('ocean/lab-reports.json')   → resolved=True  · truthType=EARTHUS_ANALYSIS
resolve_dataset('wind/series/verify-daily.json') → resolved=True · EARTHUS_ANALYSIS
```
미등록이면 `truthType` 이 UNKNOWN 이고 그것이 발행 차단이다(`aws/_shared/provenance.py` §73 주석).
⚠️ **새 레지스트리를 만들지 않는다** — `provenance.py` 머리말이 금지한다.
`DATASET_PROVENANCE` 에 항목 하나를 더하는 것이 전부다.

### 5.2 항목 모양 (기존 항목에서 그대로 가져온 8칸)
`provider` · `providerEn` · `dataset` · `collector` · `license` · `truthType` · `coverage` · `cadence`

### 5.3 실제 source metadata 로 채운 값
결정 B6 이 "실제 source metadata 를 근거로" 한다고 정했다. 근거가 있는 칸만 채운다.

| 칸 | 값 | 근거 |
|---|---|---|
| `provider` | GDELT 2.0 Events | 봉투 `source` = "GDELT 2.0 Events" |
| `providerEn` | GDELT 2.0 Events | 같음 |
| `dataset` | 전지구 사건 뉴스 | `aws/catalog/build_catalog.py:656` 이 이미 이 표기를 쓴다 |
| `collector` | `aws/gdelt-events/handler.py` | 유일한 생산자 |
| `license` | GDELT 오픈 데이터 — 학술·상업·공공 무제한 이용·재배포, **GDELT 인용·링크 필수** | `build_catalog.py:101-103` 의 `GDELT-OPEN-ATTRIBUTION` 문구. 봉투의 `license`·`termsUrl`·`sourceUrl` 과 같은 요구 |
| `coverage` | 전지구 · 창 3시간 · 사건 150건 상한 | `WINDOW_HOURS=3` · `MAX_EVENTS=150` |
| `cadence` | 30분(`cron(5,35 * * * ? *)`) | 운영 `describe-rule` 실측 |
| `truthType` | **미결정** — §5.4 | — |

### 5.4 `truthType` 은 정할 수 없다 — 선택지와 대가

기존 어휘 4종: `OFFICIAL_OBSERVATION` · `OFFICIAL_WARNING` · `OFFICIAL_FORECAST` ·
`EARTHUS_ANALYSIS`. **제3자 뉴스 집계는 이 넷 중 어디에도 없다.**

| 선택지 | 대가 |
|---|---|
| 가. 기존 넷 중 하나를 억지로 붙인다 | 뜻이 틀린다. `OFFICIAL_*` 은 기관 발표이고 GDELT 는 아니다. `EARTHUS_ANALYSIS` 는 우리 계산이고 GDELT 는 아니다 |
| 나. 새 값을 하나 더한다 | 어휘가 늘어난다. 같은 문제를 겪는 자료(`events/regional-news.json`)가 이미 있어 한 번만 늘리면 된다는 점은 유리하다 |
| 다. 등록하되 `truthType` 을 UNKNOWN 으로 남긴다 | 현재 정책대로 public promotion 이 막힌다. 결정 ② 가 이번엔 공개를 하지 않으므로 **당장의 차단은 없다** |

⚠️ 이 문서는 **고르지 않는다.** 결정 B6 이 "임의의 truthType 을 생성하지 않는다"고 했고,
셋 중 무엇을 고르든 그것은 어휘 정책 결정이다.
다만 사실 하나는 적어 둔다 — **다** 를 고르면 이번 3G 는 막히지 않는다(결정 ② 때문).

### 5.5 `TRUTH_STATUS` 와 혼동하지 않는다
`provenance.truthType` 은 **자료 계보** 어휘이고, `TRUTH_STATUS` 는 **사건 판정** 어휘다.
`events/global.json` 의 `SOURCE_KIND = NEWS` 는 이미 정본이 정했다
(`docs/TRUTH_VOCABULARY_CANONICAL.md:148`). 그것과 `truthType` 은 다른 축이다.
→ 판정 규칙은 `docs/3G_TRUTH_RULES.md`.

---

## 6. 미결정
1. `occurred_at` 에 추정값을 넣을지, `null` 로 둘지
2. `updated_at` 을 파일 `generated` 로 채울지
3. `source_age_min` 과 정밀도 열거를 담을 SQL 칸 (이름·개수)
4. 타임라인 항목의 정밀도 표시 방법
5. `ageMin == 0` 의 뜻
6. `estimated_event_time` 의 오차 범위 (실측 필요)
7. `provenance.truthType` (§5.4)

## 7. 이 문서가 금지하는 것
- 정확 시각이 없을 때 시각을 지어내는 것
- `null` 을 `now()` 로 채우는 것
- 정밀도 표시 없이 추정값을 정확 시각 칸에 넣는 것
- 새 provenance 레지스트리를 만드는 것
- `truthType` 을 근거 없이 고르는 것
