# 3G TRUTH 규칙 — B3(TRUTH_STATUS 승격) · B5(independence_count 계산)

작성 2026-09-13 · DESIGN ONLY · 코드 0줄
정책 정본 → `docs/3G_POLICY_DECISIONS.md`

**새 어휘를 만들지 않는다.** 승격 규칙은 이미 `docs/TRUTH_VOCABULARY_CANONICAL.md` §2.1 에
코드로 검사 가능한 형태로 있다. 이 문서가 하는 일은 ⑴ 그 표를 3G 의 입력에 붙이고
⑵ 정본 안의 틀린 한 줄을 고치고 ⑶ 결정 ① 의 계산 규칙을 정하는 것이다.

---

## 1. B3 — TRUTH_STATUS 승격 규칙

### 1.1 정본 표 (그대로 쓴다 · `TRUTH_VOCABULARY_CANONICAL.md:120-131`)

| 값 | 붙일 수 있는 조건 (정본 그대로) |
|---|---|
| `FACT` | `SOURCE_KIND ∈ {OFFICIAL, OBSERVATION, SATELLITE}` **그리고** `DATA_STATE ≠ UNAVAILABLE` **그리고** 관측시각이 SLA 안 |
| `CORROBORATED` | `independenceGroup` 고유 수 **≥ 2** |
| `REPORTED` | `SOURCE_KIND = NEWS` 단독 |
| `CLAIM` | 출처가 있으나 위 어디에도 안 들어감 |
| `INFERRED` | `SOURCE_KIND = MODEL` **그리고** 산출자가 EARTHUS |
| `FORECAST` | `TIME_MODE = FORECAST` |
| `SIMULATION` | `TIME_MODE = SCENARIO` 또는 시뮬레이션 실행 산출물 |
| `UNKNOWN` | 그 밖 전부 — **기본값** |

정본이 함께 못 박은 규칙 4개(`:133-139`)를 3G 도 지킨다:
- **기본값은 `UNKNOWN`.** 승격은 근거가 있을 때만.
- `FORECAST` · `SIMULATION` 은 `FACT` 로 **승격될 수 없다**(단방향).
- `CORROBORATED` 는 `FACT` 와 **다른 축**이다. 둘 다면 둘 다 표시한다. 하나로 눌러 담지 않는다.
- **퍼센트를 만들지 않는다.** `CONFIDENCE` 4단계만 쓴다.

SQL 도메인이 같은 8종을 못 박고 있다(`20260913_earth_event_core.sql:99-102`).
`earthus_earth_event.truth_status` 는 `not null default 'UNKNOWN'` 이고 주석이
"파생값. 직접 쓰지 않는다"(`:166`)다 — 3G 는 이 칸을 **계산해서** 채운다.

### 1.2 GDELT 단독 입력에 이 표를 붙이면

`events/global.json` 은 정본이 `SOURCE_KIND = NEWS` 로 이미 분류했다
(`TRUTH_VOCABULARY_CANONICAL.md:148` — "`NEWS` | 매체 보도 | `events/global.json`(GDELT)").

| TRUTH_STATUS | GDELT 단독으로 도달 가능한가 | 근거 |
|---|---|---|
| `FACT` | **불가** | `NEWS` 는 `{OFFICIAL, OBSERVATION, SATELLITE}` 에 없다 |
| `CORROBORATED` | **조건부 가능** | `independence_units ≥ 2` 일 때만. §2 가 그 계산을 정한다 |
| `REPORTED` | **가능 — 기본 도달점** | `SOURCE_KIND = NEWS` 단독 |
| `CLAIM` | 가능 | 출처는 있으나 위에 안 들어갈 때 |
| `INFERRED` | 불가 | `MODEL` 이 아니다 |
| `FORECAST` · `SIMULATION` | 불가 | GDELT 는 과거 보도다 |
| `UNKNOWN` | 가능 | 판정 근거가 없을 때 |

즉 **GDELT 만으로 이 파이프라인이 낼 수 있는 것은 `REPORTED` · `CORROBORATED` · `CLAIM` ·
`UNKNOWN` 넷이다.** `FACT` 를 내려면 기관·관측·위성 출처가 들어와야 하고 그것은 결정 ⑦ 이
이번 범위에서 뺐다.

### 1.3 승격시키지 **않는** 것 — GDELT 자체 판정은 진실이 아니다

⚠️ `status = 'confirmed'` 는 GDELT 의 어휘이고 우리 `TRUTH_STATUS` 가 아니다.
그 값은 `score() ≥ CONFIRM_SCORE` 로 정해진다(`aws/gdelt-events/handler.py`).
`score()` 는 매체 수 · 언급량 · 매체가중 · 좌표정밀도 · 시간감쇠를 **섞은** 0~100 값이다.
따라서 통신사 기사 한 건이 여러 곳에 전재되기만 해도 `confirmed` 가 될 수 있다 —
독립으로 확인한 것이 아니다.

⚠️ `score` · `mentions` · `outlets` · `sources` · `merged` 는 **교차검증 보조 지표로 보존**하고
TRUTH_STATUS 의 입력으로 쓰지 않는다. `placeDoubt` 도 같다 — 그것은 위치 의심 표시이며
진실 등급이 아니다.

### 1.4 고쳐야 할 정본 한 줄
`docs/TRUTH_VOCABULARY_CANONICAL.md:250`
```
| gdelt status | confirmed | NEWS | CORROBORATED (교차검증 점수가 곧 독립 출처 수다) |
```
괄호 안이 틀렸고 같은 문서 `:125` 와 충돌한다. 고칠 문장:
```
| gdelt status | confirmed   | NEWS | REPORTED (점수는 독립 출처 수가 아니다.
|              |             |      |  independence_units ≥ 2 일 때만 CORROBORATED)
| gdelt status | unconfirmed | NEWS | REPORTED
```
`:251`(unconfirmed → REPORTED)은 그대로 맞다.

### 1.5 미결정
- `FACT` 조건의 "관측시각이 SLA 안" — SLA 값이 정본에 없다. GDELT 경로는 `FACT` 에
  도달하지 않으므로 이번 구현에는 걸리지 않지만, 기관 출처가 들어오는 단계에서 정해야 한다.
- `DATA_STATE` 를 3G 가 어떻게 정하는가 — 입력 파일의 `generated` 신선도로 파생할 수 있으나
  그 문턱이 정해지지 않았다.

---

## 2. B5 — independence_count 계산 규칙

### 2.1 현재 살아 있는 세 정의 (전부 실측)

| # | 위치 | 정의 |
|---|---|---|
| 1 | `docs/TRUTH_VOCABULARY_CANONICAL.md:125` | `independenceGroup` **고유 수** ≥ 2 → CORROBORATED |
| 2 | `aws/_shared/sql/…core.sql:129` | `earthus_source.independence_group not null` — "교차검증 단위. 같은 그룹은 1로 센다" |
| 3 | `aws/_shared/article_dedup.py:363` | `independence_units(result)` = **묶음 수**(`len(result['groups'])`) |

세 정의는 **층이 다르다.** 1 과 2 는 *출처 레지스트리*의 그룹을 센다. 3 은 *기사 계보*의
묶음을 센다. 결정 ① 의 우선순위가 바로 이 층을 순서로 세운 것이다.

### 2.2 결정 ① 을 계산 규칙으로

결정 ① 의 우선순위를 그대로 계층으로 쓴다. 위에서 정해지면 아래는 보지 않는다.

```
한 EarthEvent 의 independence unit 집합을 구한다.
  그 사건에 붙은 기사 각각에 대해 unit 키를 하나 정한다:

  1순위  lineage root
         article_dedup 의 계보에서 그 기사의 뿌리 기사 id.
         원문·번역본(TRANSLATION_OF)·재전재(SYNDICATION_OF)·요약 재작성(REWRITE_OF)은
         같은 뿌리를 가리키므로 같은 키가 된다.
  2순위  source publisher/family
         뿌리를 정할 수 없을 때. earthus_source.independence_group 이 그 칸이다.
  3순위  source type
         위 둘이 없을 때. SOURCE_KIND (OFFICIAL/OBSERVATION/SATELLITE/NEWS/OSINT/MODEL).
  4순위  unknown → 독립으로 세지 않는다
         키를 정할 수 없는 기사는 집합에 넣지 않는다. 보수적으로 0 기여다.

independence_count = 그 키 집합의 고유 개수
```

⚠️ 4순위가 핵심이다. "모르면 독립으로 본다"가 `CORROBORATED` 를 부풀리는 경로이고,
결정 ① 이 명시적으로 반대 방향을 택했다.

### 2.3 기존 코드와 잇는 방법 — 회계 창구는 하나로 둔다

`article_dedup.independence_units(result)` 는 **배치 전역**이다 — 그 실행에 넘긴 기사
전체의 묶음 수를 센다(`len(result['groups'])`). EarthEvent 하나는 그중 **부분집합**에 대한
수를 필요로 한다. 이 간격을 메우는 두 방법:

| 안 | 내용 | 대가 |
|---|---|---|
| **가 (권고)** | `article_dedup` 에 부분집합용 함수를 하나 더 둔다. 기존 `deduplicate()` 결과와 기사 id 목록을 받아 그 부분집합의 고유 뿌리 수를 돌려준다 | `article_dedup` 을 건드린다(시험 21건 통과 중) |
| 나 | 사건별로 `deduplicate()` 를 다시 부른다 | 회계 창구가 둘이 된다. 같은 기사 쌍이 배치 전역과 사건 단위에서 다른 판정을 받을 수 있다 |

**가** 를 권고한다. 이유는 결정 ① 이 "기존 `article_dedup` 을 우선 재사용한다"고 했고,
`independence_units` 의 주석이 회계 창구가 하나여야 하는 이유를 이미 적고 있기 때문이다.

⚠️ `aws/_shared/tests/test_article_dedup.py:239-244` 가 dedup 산출물에 사건 신원
(`eventid` · `event_id` · `earthevt` · `dedup_event`)이 섞이지 않음을 고정한다.
부분집합 함수는 **기사 id 목록을 인자로 받아야** 하며, 사건 id 를 dedup 안으로 들여보내지 않는다.

### 2.4 GDELT 입력에서 실제로 얻을 수 있는 것

`events/global.json` 의 한 사건은 `url` 1개 + `alt[]` 대체 URL 을 들고 있고,
`outlets` · `sources` 는 이미 집계된 **수**다(원본 URL 목록이 아니다).
따라서 dedup 에 넣을 기사 행은 **head url + alt[] 항목**으로만 만들 수 있다.
`domain` 이 publisher 에 대응한다.

⚠️ 이것은 **GDELT 가 이미 병합한 뒤의 잔재**다. `merged` 필드가 그 증거다.
즉 3G 가 보는 기사 목록은 GDELT 가 본 것보다 적다. `independence_count` 는
그 적은 목록 위에서 계산되므로 **실제 독립 출처 수보다 작게 나올 수 있다.**
작게 나오는 쪽이 결정 ① 의 보수적 방향과 같으므로 허용하되, 그 사실을 산출물에 적는다.

### 2.5 미결정
- `independence_group` 을 GDELT 입력에서 어떻게 채우는가. `domain` 을 그대로 쓰면
  같은 언론 그룹의 여러 도메인이 별도 unit 이 된다(부풀림). 그룹 매핑 자료가 저장소에 없다.
  → 이것이 정해지기 전에는 2순위가 사실상 작동하지 않는다.
- dedup 임계값(`SYNDICATION_TITLE_SIM 0.80` 등 5개)을 실측 없이 쓸지.
  `docs/PHASE3H_DEDUP_IMPLEMENTATION.md:181` 이 추론값임을 적었다.
- 부분집합 함수의 이름과 정확한 시그니처.

### 2.6 시험으로 고정할 것
- 원문 + 번역본 + 재전재 3건 → `independence_count = 1`
- 서로 다른 도메인의 독립 보도 2건 → `= 2`
- 키를 정할 수 없는 기사가 섞여도 그 기사는 **더해지지 않는다**
- `CORROBORATED` 는 `= 1` 에서 붙지 않고 `≥ 2` 에서만 붙는다
- GDELT `status='confirmed'` 단독으로는 `REPORTED` 에 머문다
