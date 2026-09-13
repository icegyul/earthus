# EARTH EVENT — 정본 도메인 모델

작성 2026-09-13 · PHASE 2-2 · `earthus-v2/real-living-earth-render` @ `3c577d15`
선행 [V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md](V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md) ·
어휘 [TRUTH_VOCABULARY_CANONICAL.md](TRUTH_VOCABULARY_CANONICAL.md)

설계 문서다. 코드는 아직 고치지 않았다.

---

## 0. 결론 먼저

### 0.1 사건 표현이 지금 **네 군데**에 따로 있다

| # | 구현 | 위치 | 사건 id | 어디까지 쓰이나 |
|---|---|---|---|---|
| 1 | GDELT 뉴스 사건 | `aws/gdelt-events/handler.py` → `events/global.json` | GDELT `GlobalEventID` | V1 Cesium `layers/events.js` · `news-brief` |
| 2 | 기관 사건 (태풍·지진) | `prototype/v2-three/js/intel-feed.js` (브라우저 조립) | `tc-<gdacsId>` / `eq-<usgsId>` | V2 비컨 · 사건 방 · FOR ME |
| 3 | LAB 사건 (8현상) | `aws/lab-events/handler.py` → `analysis/<kind>-reports.json` → `ocean/lab-reports.json` | `<kind>:<sourceId>` | 리포트 센터 · SNS 원천 |
| 4 | 사건 군집 계약 | `prototype/js/earthus2/v11/event/event-fusion.js` + `v11/postgres/*.sql` | `stableId()` = `ei_<fnv1a32>` | **어디에도 안 쓰인다** (화면 배선 없음) |

② 만 브라우저 안에서 조립되고 **어디에도 저장되지 않는다.** 새로고침하면 사라진다.
④ 는 코드와 DDL 이 다 있는데 적용도 배선도 안 됐다.

### 0.2 정본 사건 id 는 이미 정해져 있다 — 바꾸지 않는다

`aws/_shared/content_contract.py:18` 머리말이 id 네임스페이스 6종을 못박았다:

```
메뉴 scene/layer · 현상 domain.snake · 리포트 {kind}:{period}
신호 {provider}:{dataset}:{h}:{h} · 사건 {kind}-{sourceId} · 콘텐츠 CNT-{YYYY}-{순번}
```

그리고 두 개의 잠긴 시험이 이것을 지킨다
(`tools/test_v2_ui_information_architecture.mjs`):

- "사건 주소는 여전히 정본 id 다 (UI 개편으로 안 깨진다)"
- "지도 비컨도 배열 인덱스가 아니라 사건 id 로 주소를 잡는다"

→ **정본 `earth_event.event_id` = `{kind}-{sourceId}`** 다.
`ei_<fnv1a32>`(v11) 와 `earthevt_<sha256>`(ZIP) 은 둘 다 **쓰지 않는다.**
v11 `stableId()` 는 증거·서명처럼 외부 id 가 없는 것에만 계속 쓴다.

### 0.3 ZIP `EventStatus` 는 채택하지 않는다 — 두 축이 섞여 있다

ZIP `EventStatus` = `DETECTED REPORTED CORROBORATED ACTIVE DEVELOPING STABILIZING RESOLVED`
여기서 `REPORTED` · `CORROBORATED` 는 **생애 상태가 아니라 진리 상태**다
(`TRUTH_STATUS` 에 같은 이름으로 들어 있다). 한 필드에 섞으면
"확정 여부"와 "진행 여부"를 구별할 수 없다.

→ 생애 축은 **이미 쓰이고 있는 7종**을 정본으로 승격한다 (실측 사용 횟수):

```
DETECTED(6) → ACTIVE(20) → VERIFYING(10) → PRELIMINARY_REPORT(7) → FINAL_REPORT(16)
WATCH(2)                                                            RESOLVED(2)
```

출처: `aws/cyclone-analog` · `aws/lab-events` · `intel-feed.js STATUS_KO` ·
`lab_report.py STATUS_WEIGHT`. **정의 상수가 없다** — 관행으로만 존재한다.
그래서 새로 만드는 것이 아니라 **한 곳에 적는다**.

---

## 1. 기존 3구현 실측 비교

### 1.1 `aws/gdelt-events/handler.py` — 사건 레코드 (events/global.json)

봉투:
```
generated, sourceFile, windowHours, source, sourceUrl, license, termsUrl,
rules{ confirmScore, minScore, dedupKm, effectiveMinScore, cappedByLimit, maxEvents },
counts{ raw, candidates, afterDedup, shown, confirmed, softDropped, multiPlace, placeDoubt },
events[]
```

사건 한 건 (`handler.py:417-437` + 후처리):
```
id                GDELT GlobalEventID
lat, lon          소수 3자리
place, country    ActionGeo_FullName / CountryCode
root, cameoRoot   대분류 (DIS 는 재난 덮어쓰기) / 원본 CAMEO
eventCode         합치기 판정 키 (대분류보다 좁다)
featureId         ActionGeo_FeatureID — 같은 지점 판정
geoType           1 국가 … 4 도시 (좌표 정밀도)
disaster          bool
kindKo, kindEn    사람이 읽는 분류명
sources, mentions NumSources / NumMentions
tone              AvgTone
url, domain       원문 링크 / 도메인
score             0~100 (산식 공개, §1.1.1)
ageMin
merged            합쳐진 원본 행 수
outlets           서로 다른 매체 수
alsoPlaces[]      같은 기사의 다른 위치 최대 4개
title             GKG 에서 얻은 제목 (없을 수 있다)
status            confirmed | unconfirmed
placeDoubt        bool — 제목이 다른 곳을 말한다
placeElsewhere    그 다른 곳
```

#### 1.1.1 `score()` 산식 (`handler.py:226`) — 이 저장소의 유일한 공개 교차검증 산식

```
s_cross = min(45, n_src * 9)                       ① 독립 매체 수 (가장 큰 비중)
s_vol   = min(20, 7 * log10(n_men+1) * 2)          ② 언급량 (로그로 눌러 과대평가 방지)
s_wire  = 15 if 통신사 else 0                       ③ 소스 가중치
s_geo   = {1:2, 2:6, 3:9, 4:12, 5:12}[geoType]     ④ 좌표 정밀도
decay   = max(0, 1 - age_min / 1440)               ⑤ 24시간 선형 감쇠
score   = clamp(0,100, round((①+②+③+④) * (0.55 + 0.45*decay)))
```

⚠️ 2026-09-07 주석: 예전에는 합칠 때마다 점수를 `+4` 했다 — **근거 없는 가산**이었다.
지금은 합친 뒤 `max()` 로만 갱신하고 **다시 채점**한다.

중복 제거 규칙 (`handler.py:440`):
```
같은 root  AND  같은 eventCode
   AND ( featureId 둘 다 있으면 featureId 일치 · 없으면 거리 ≤ DEDUP_KM )
→ 합치되 sources/mentions 는 max(), 더하지 않는다
```

### 1.2 `v11/event/event-fusion.js` — 군집 계약

```js
eventSimilarity(a, b, policy) →
  1) type gate        eventType 대문자 불일치 → score 0, reasons ['TYPE_MISMATCH']   ← 즉시 거절
  2) 공식 id 일치      officialEventId 같으면 score 1, merge true, ['OFFICIAL_ID_MATCH']
  3) 가중합           0.35*time + 0.35*geo + 0.20*name + 0.10*region
                      time = max(0, 1 - hours/policy.maxHours(72))
                      geo  = max(0, 1 - meters/policy.maxMeters(250000))   좌표 없으면 region 있으면 0.7 없으면 0.2
                      name = jaccard(title)
     threshold        policy.threshold ?? 0.62
clusterEarthEvents(records, policy) → union-find 로 묶고 대표 1건 산출
  결과 필드: eventId(officialEventId 우선, 없으면 stableId), eventType, title,
            startedAt, lat, lon, region, members[], sourceCount
```

입력 레코드가 기대하는 필드: `eventType, officialEventId, startedAt|observedAt, lat, lon, title, region, sourceId`

### 1.3 `intel-feed.js` — 브라우저 사건 객체

```
id            tc-<gdacsId> | eq-<usgsId>              ← 정본 주소
kind          TC | EQ
sourceSystem  gdacs | usgs                             기계용 출처 신원
sourceEventId 원본 id 문자열
revision      GDACS episodeid / USGS updated           개정 회차
alert         Red | Orange | Green
title, where
time          { occurredAt, issuedAt, updatedAt, retrievedAt }   ← 시각 4분법
whenT         정렬용 epoch (NaN 이면 '시각 미확인')
status        ACTIVE
truth         'OFFICIAL_FORECAST'(TC) | 'OBSERVED'(EQ)
source        사람이 읽는 출처 표기
lat, lon
facts[]       [라벨, 값] 배열
why
+ TC: stormName(시즌 꼬리표 제거), eventid, episodeid
+ EQ: mag, depthKm, official(USGS 상세 URL)
```

⚠️ **한 필드 안에 두 어휘가 섞여 있다**: `truth` 가 TC 에서는 v02 어휘(`OFFICIAL_FORECAST`),
EQ 에서는 v11 어휘(`OBSERVED`)다. `TRUTH_VOCABULARY_CANONICAL.md` §3 파생표가
이 두 값을 같은 3축으로 옮긴다.

### 1.4 `v11/postgres/20260826_v11_advanced_intelligence.sql` — DDL 초안 19테이블

머리말: `-- ADDITIVE CONTRACT ONLY. Review against live Supabase migrations before applying.`
**미적용.** 적용된 마이그레이션 17개(테이블 19개)에 이 중 어느 것도 없다.

사건·증거 관련 5테이블:
```sql
earthus_evidence_node(evidence_id PK, evidence_kind, source_id, external_id, title,
                      observed_at, source_url, payload jsonb, created_at)
earthus_evidence_edge(from_evidence_id FK, to_evidence_id FK, relation, metadata,
                      unique(from,to,relation))
earthus_event_cluster(event_id PK, event_type, title, started_at, updated_at,
                      country, region, latitude, longitude, status default 'UNKNOWN',
                      official_safety bool, confidence 0..1, release_state default 'SHADOW',
                      payload jsonb)
earthus_event_cluster_member(event_id FK, member_id, member_kind, source_id,
                            evidence_id FK, payload, PK(event_id,member_id))
earthus_intelligence_feature_value(... subject_id, feature_key, value_json, unit,
                      source_id, evidence_kind, observed_at, valid_at, confidence,
                      data_state, release_state, metadata)
```

`EvidenceGraph` 관계 어휘 9종 (`v11/evidence/evidence-graph.js`):
```
OBSERVATION_OF · REPORTED_BY · OFFICIAL_NOTICE_OF · ACTION_RESPONDS_TO
DERIVED_FROM · SUPPORTS · CONTRADICTS · CALIBRATES · HISTORICAL_ANALOG_OF
```

### 1.5 셋을 나란히 놓으면

| 개념 | gdelt-events | event-fusion | intel-feed | v11 DDL | ZIP |
|---|---|---|---|---|---|
| 사건 id | GDELT 정수 | officialEventId ?? `ei_*` | **`{kind}-{sourceId}`** | `event_id text` | `earthevt_<sha>` |
| 종류 | `root`/`eventCode`(CAMEO) | `eventType` 자유문자 | `kind` (TC/EQ) | `event_type text` | `type` 자유문자 |
| 생애 상태 | 없음 | 없음 | `status` | `status` default UNKNOWN | `EventStatus` 7종(혼합) |
| 진리 상태 | `status` confirmed/unconfirmed | 없음 | `truth` (2어휘 혼용) | `evidence_kind` (노드에) | `verification` 8종 |
| 시각 | `ageMin` 만 | `startedAt`/`observedAt` | **4분법** | `started_at`/`updated_at` | `startTime`/`lastUpdated` |
| 위치 정밀도 | `geoType` 1~4 + `placeDoubt` | 없음 | 없음 | `location_precision`(action 표에만) | 없음 |
| 합치기 근거 | `merged`/`outlets`/`alsoPlaces` | `reasons[]` | 없음 | `member` 표 | 없음 |
| 독립 출처 수 | `outlets` | `sourceCount` | 없음 | — | `independenceGroup` |
| 타임라인 | 없음 | 없음 | `facts[]` (정적) | 없음 | **`TimelineEntry[]`** |

빈칸이 말하는 것:
- **타임라인**은 ZIP 만 갖고 있다 → 채택 (감사 §4 등급 A).
- **위치 정밀도·합치기 근거**는 gdelt-events 만 갖고 있다 → 정본으로 올린다.
- **시각 4분법**은 intel-feed 만 갖고 있다 → 정본으로 올린다.
- **독립성 그룹**은 ZIP 이 제일 명확하다 → 개념 채택.

---

## 2. 정본 도메인 — 10개 (지시서 최소 집합)

표기: `PK` 기본키 · `FK` 외래키 · `NN` not null · `→` 참조

### 2.1 `source` — 출처 (자료·기관·매체)

```
source_id            PK   text     {system}:{identifier}  예 usgs:comcat · gdacs:tc · kma:warn · gdelt:reuters.com
publisher            NN   text     사람이 읽는 표기 ("기상청", "Reuters")
source_kind          NN   text     SOURCE_KIND 6종
independence_group   NN   text     교차검증 단위. 같은 그룹은 1로 센다 (통신사 전재는 같은 그룹)
provider_ref              text     → Supabase provider_registry.id (있으면)
dataset_ref               text     → provenance.DATASET_PROVENANCE 키 (S3 키) 또는 외부 URL
language                  text
region                    text
rights_json          NN   jsonb    v07/news/source-registry.js 의 rights/policy 구조 그대로
                                   { snippetOnly, fullTextAllowed, imageRedisplay,
                                     robotsRequired, termsReviewed, allowAutomatedFetch }
```

**새 출처 레지스트리를 만들지 않는다.** `provenance.py` 머리말(§68)이 명시적으로 금지한다.
`source` 는 그 둘을 가리키는 **얇은 조인 표**다.

### 2.2 `earth_event` — 사건

```
event_id        PK   text   {kind}-{sourceId}          ← 잠긴 정본 주소
kind            NN   text   TC EQ FLOOD WILDFIRE VOLCANO DROUGHT HEATWAVE …
                            (gdelt CAMEO root 는 kind 가 아니다 — §2.1.1 참고)
phenomenon_id        text   → phenomenon-registry PHENOMENA 의 domain.snake (66종). 없으면 null
title           NN   text
where_text           text
lat, lon             double
bbox                 jsonb  { west, south, east, north }
location_precision NN text  EXACT_SOURCE | CITY | REGION | COUNTRY | NONE
                            (v11/news 의 EXACT_SOURCE/NONE + gdelt geoType 1~4 를 합친 것)
location_doubt  NN   bool   gdelt placeDoubt 계보. true 면 확정 승격 금지
occurred_at          timestamptz   일어난 때
issued_at            timestamptz   기관이 발표한 때
updated_at           timestamptz   갱신된 때
retrieved_at    NN   timestamptz   우리가 받은 때        ← 시각 4분법 (intel-feed 규약)
lifecycle       NN   text   DETECTED WATCH ACTIVE VERIFYING
                            PRELIMINARY_REPORT FINAL_REPORT RESOLVED   (§0.3)
truth_status    NN   text   TRUTH_STATUS 8종. 기본 UNKNOWN            ← 파생. 직접 쓰지 않는다
severity             text   기관이 준 등급만 (GDACS alert Red/Orange/Green, KMA 특보 단계).
                            우리가 만든 등급은 여기 넣지 않는다
source_system   NN   text   gdacs | usgs | gdelt | kma | lab | …
source_event_id NN   text   원본 id 문자열
revision        NN   int    GDACS episodeid / USGS updated 등 개정 회차
independence_count NN int   independence_group 고유 수  ← CORROBORATED 판정 입력
official_safety NN   bool   공식 특보가 걸린 사건인가 (v11 DDL 계보). 무료 공개 대상
release_state   NN   text   SHADOW | CANARY | ACTIVE   기본 SHADOW (v11 DDL 계보)
payload              jsonb  종류별 잔여 필드 (mag, depthKm, stormName, alert, facts[] …)
```

#### 2.1.1 `kind` 와 CAMEO 를 섞지 않는다

gdelt `root`/`eventCode` 는 **CAMEO 갈등 분류**다(14 시위, 19 교전 …). 자연현상 종류가 아니다.
`DIS`(재난)만 handler 가 덮어쓴다. 그래서:

```
gdelt root = 'DIS'  →  kind 는 제목·URL 로 추론 (news-engine 의 inferEventType 역할)
gdelt root ≠ 'DIS'  →  kind = 'SOCIAL'  (지구현상이 아니다. 현상 id 는 null)
```

⚠️ 사회 사건을 자연현상 kind 로 승격하지 않는다. 지금 V1 뉴스 레이어가 정확히 그 구분을
색으로 하고 있다(`layers/events.js KIND_COLOR`).

### 2.3 `event_relation` — 사건 관계

**DECISION 2 (2026-09-13 승인)** — 사건↔사건 관계 어휘 `EVENT_RELATION` 6종을 확정한다.

```
TEMPORAL · SPATIAL · CORRELATED · POSSIBLE_CASCADE · MODELLED_CASCADE · UNKNOWN
```

물리적·시간적 연속성만으로 인과 관계를 확정하지 않는다.
`CONFIRMED_CAUSAL` 은 **이번 범위에서 도입하지 않는다** — 기존 `FORBIDDEN_CAUSAL` 9개 문구가
인과 단정을 이미 금지하고, 이 값을 만들면 그 금지를 우회하는 문이 생긴다.

#### 두 축을 구별한다 — 개명하지 않는다

저장소에는 이미 `aws/_shared/report_contract.py:320 RELATION_TYPES`(5종)가 있다.
**그것과 `EVENT_RELATION` 은 다른 축이다.** 둘 다 남기고 매핑표로 잇는다.

| 축 | 심볼 | 무엇을 잇나 | 쓰는 곳 |
|---|---|---|---|
| 사건 ↔ 사건 | **`EVENT_RELATION`** (6종, 신규) | 사건 두 개 | `event_relation` 표 · 3D 지구 · 사건 상세 |
| 리포트 서술 | `RELATION_TYPES` (5종, 기존) | 사건 ↔ 지표, 지표 ↔ 지표 | `report-engine` 문장 생성 |

매핑 (양방향 조회용):

| `EVENT_RELATION` | 뜻 | `RELATION_TYPES` 대응 |
|---|---|---|
| `TEMPORAL` | 같은 기간에 함께 있었다 | `TEMPORAL_ASSOCIATION` |
| `SPATIAL` | 같은 자리에서 함께 있었다 | `SPATIAL_ASSOCIATION` |
| `CORRELATED` | 통계적으로 함께 움직였다 | `STATISTICAL_ASSOCIATION` |
| `POSSIBLE_CASCADE` | 연쇄 가능성이 있다 (근거는 있으나 계산은 없다) | `POSSIBLE_INFLUENCE` |
| `MODELLED_CASCADE` | **시뮬레이션이 연쇄를 계산했다.** `simulation_run_id` 필수 | (대응 없음 — 신규) |
| `UNKNOWN` | 관계는 있으나 종류를 판정하지 못했다 | (대응 없음) |
| — | 교과서 물리로 알려진 관계 (이 기간의 인과 주장이 아니다) | `PHYSICAL_RELATION` (리포트 전용, 사건 관계 아님) |

⚠️ `UNKNOWN` 사용 규칙: 관계의 **존재는 확인됐으나 종류를 모를 때만** 쓴다.
"관계가 있는지도 모르는" 경우는 행을 만들지 않는다 — 그러면 그래프가 오염된다.
`UNKNOWN` 행에도 `basis_json` 은 비워 둘 수 없다 (무엇을 보고 관계가 있다고 판단했는지 적는다).

```
relation_id      PK   text
from_event_id    NN   FK → earth_event
to_event_id      NN   FK → earth_event
relation_type    NN   text  EVENT_RELATION 6종 CHECK 제약
evidence_level        text  EVIDENCE_LEVELS 5종 (report_contract.py:329) — 표현 강도
simulation_run_id     FK → simulation_run   relation_type='MODELLED_CASCADE' 면 NN
basis_json       NN   jsonb  판정 근거 (거리·시간차·상관계수·모델 id). 비워 둘 수 없다
created_at       NN   timestamptz
unique(from_event_id, to_event_id, relation_type)
CHECK (relation_type <> 'MODELLED_CASCADE' OR simulation_run_id IS NOT NULL)
CHECK (relation_type <> 'CONFIRMED_CAUSAL')   -- 도입 금지를 스키마로 막는다
```

방향성: `from → to`. `event-fusion` 과 ZIP `cascade-engine` 은 양방향으로 두 번 넣는다.
→ **한 방향만 저장하고 조회에서 양방향으로 읽는다.** 두 줄이면 한쪽만 지워지는 사고가 난다.

### 2.4 `news_article` — 기사

```
article_id       PK   text   {source_id}:{canonical_url}  (v07/news 계보: `${source.id}:${raw.url}`)
source_id        NN   FK → source
title            NN   text
summary               text   ⚠️ 우리가 쓴 문장만. 원문 요약 금지
canonical_url    NN   text
published_at          timestamptz
updated_at            timestamptz
language              text
lat, lon              double
location_precision NN text   EXACT_SOURCE | CITY | REGION | COUNTRY | NONE
mappable         NN   bool   좌표가 실제로 있는가 (v11/news 계보)
event_id              FK → earth_event      null 이면 아직 사건에 안 붙었다
link_score            double  news-event-linker 의 0~1 점수
dedup_group_id        text    같은 기사·번역본·재전재를 묶는 키 (§4)
truth_status     NN   text    보통 REPORTED
retrieved_at     NN   timestamptz
```

**`content` 칸을 두지 않는다.** `aws/regional-news/handler.py` 머리말:

> ⚠️⚠️ **기사 본문을 절대 담지 않는다.** 담는 것은 **제목 · 링크 · 시각 · 매체**뿐이다.
> 요약도 하지 않는다 — 요약은 원문을 재구성하는 것이라 마찬가지다.

ZIP `NewsArticle.content?: string` 은 **채택하지 않는다.**
`full_text_stored` 플래그도 두지 않는다 — 저장하지 않으므로 플래그가 필요 없다.
(`v07/news/ingestion-cluster.js` 의 `fullTextStored` 는 권리가 허용하는 출처를 위한
설계였지만, 실제 수집기 3종 전부 본문을 안 받는다. 쓰이지 않는 칸은 만들지 않는다.)

### 2.5 `claim` — 주장

```
claim_id         PK   text
event_id         NN   FK → earth_event
claim_type       NN   text   v11/claims/claim-gate.js RULES 5종
                             SOURCE_ATTRIBUTION TRANSPORT DISCOVERY_RECOMMENDATION
                             FORECAST SAFETY_ACTION
                             (+ 사건용으로 필요하면 확장. 어휘 정의는 claim-gate.js 한 곳)
text             NN   text   우리가 쓴 문장
truth_status     NN   text   TRUTH_STATUS. 기본 UNKNOWN
gate_result      NN   jsonb  evaluateClaim() 결과 { allowed, missing[] }
label                 text   claimLabel() 결과. gate 미통과면 null  ← 라벨 없음이 곧 표시 금지
conflict              jsonb  충돌 시 양쪽 보존 (TRUTH_VOCABULARY §2.4)
created_at       NN   timestamptz
```

`claim-gate.js` 의 규칙은 **그대로 쓴다.** 필수 증거가 없으면 `claimLabel()` 이 `null` 을
돌려주고, 화면은 라벨이 없으면 그 주장을 표시하지 않는다. ZIP `Claim.state` 는 쓰지 않는다.

### 2.6 `evidence` — 증거

`v11/evidence/evidence-graph.js` + `v11 DDL earthus_evidence_node/edge` 를 그대로 승격한다.

```
evidence_id      PK   text   v11 stableId([sourceId, externalId, observedAt, title])
evidence_kind    NN   text   v11 EVIDENCE_KINDS 8종 (requireEvidenceKind 그대로)
source_id        NN   FK → source
external_id           text
title                 text
observed_at           timestamptz
source_url            text
payload          NN   jsonb
-- 파생 (TRUTH_VOCABULARY §3.2)
source_kind      NN   text   SOURCE_KIND 6종
truth_status     NN   text   TRUTH_STATUS 8종
created_at       NN   timestamptz
```

```
evidence_edge(from_evidence_id FK, to_evidence_id FK, relation, metadata,
              unique(from,to,relation))
relation ∈ EvidenceGraph RELATIONS 9종  ← 기존 그대로. event_relation 과 다른 축이다
```

증거 ↔ 사건 ↔ 주장 연결은 별도 표로 둔다 (다대다):
```
event_evidence(event_id FK, evidence_id FK, PK(event_id, evidence_id))
claim_evidence(claim_id FK, evidence_id FK, PK(claim_id, evidence_id))
```

### 2.7 `event_timeline` — 타임라인 (ZIP 에서 채택)

```
entry_id         PK   text
event_id         NN   FK → earth_event
at               NN   timestamptz
kind             NN   text   ARTICLE EVIDENCE OBSERVATION WARNING
                             FORECAST IMPACT SIMULATION SYSTEM      (ZIP TimelineKind 8종)
title            NN   text
source_ids            jsonb  text[]
article_id            FK → news_article
evidence_ids          jsonb  text[]
simulation_run_id     FK → simulation_run
metadata              jsonb
unique(event_id, kind, at, title)
```

`kind` 8종이 그대로 PHASE 9 의 3D 지구 구분(EVENT / OBSERVATION / WARNING / IMPACT / SIMULATION)과
Event Detail 8절에 대응한다. 이 축을 `TRUTH_STATUS` 로 대신하려 하면 안 된다 —
"무엇이 일어났는가(줄 종류)"와 "그것이 참인가"는 다른 질문이다.

### 2.8 `context_snapshot` — 지구 문맥

```
snapshot_id      PK   text
event_id         NN   FK → earth_event
captured_at      NN   timestamptz
window_start     NN   timestamptz
window_end       NN   timestamptz
status           NN   text   COMPLETE | PARTIAL | UNKNOWN     (ZIP ContextSnapshot 계보)
domains_ref      NN   text   S3 키 — 실제 도메인 자료는 S3 에 둔다 (§3, 저장소 문서)
provenance       NN   jsonb  읽은 S3 키 목록 + 각 키의 generated 시각
adapter_states   NN   jsonb  어댑터별 SOURCE_STATE 5종 (event-room.js 어휘)
                             OK | EMPTY | FAILED | STALE | OUT_OF_SCOPE
```

⚠️ 두 층을 섞지 않는다: 어댑터 하나하나는 `SOURCE_STATE` 5종,
스냅샷 전체는 `COMPLETE/PARTIAL/UNKNOWN` 3종. `event-room.js` 가 이미 5종을 쓰고 있고
"조회 실패가 '없음'으로 보이던 것이 F02" 라는 실측 기록이 있다.

### 2.9 `impact_assessment` — 영향

```
assessment_id    PK   text
event_id         NN   FK → earth_event
snapshot_id      NN   FK → context_snapshot
hazard_family    NN   text
status           NN   text   OBSERVED | MODELLED | UNKNOWN
severity              text   기관 등급만
exposed_population    bigint
exposed_assets        bigint
geometry_ref          text   S3 키
assumptions      NN   jsonb  text[]  ← 비울 수 없다
uncertainty      NN   jsonb  text[]  ← 비울 수 없다
source_ids       NN   jsonb  text[]
simulation_run_id     FK → simulation_run
truth_status     NN   text   보통 INFERRED 또는 SIMULATION. **FACT 금지**
created_at       NN   timestamptz
```

⚠️ **오늘 이 표에 들어갈 수 있는 값은 사실상 없다.** 감사 §2 대로 노출 인구·자산 계산기가 없다.
그래서 PHASE 3 에서는 스키마만 두고, 행은 `status='UNKNOWN'` ·
`assumptions=['no physical model bound']` 으로만 쓴다.
`exposed_population` 에 숫자를 넣으려면 인구 격자 자료와 계산기가 먼저 있어야 한다.

호출 가능한 것 (감사 §12-E):
- `aws/tsunami-eta` → 도달시간 (`status='MODELLED'`, `truth_status='SIMULATION'`)
- `v11/environment/transport-simulator.js` → 오염 수송 (`MODELLED`)

### 2.10 `simulation_run` — 시뮬레이션 실행

[SIMULATION_PLATFORM_MAPPING.md](SIMULATION_PLATFORM_MAPPING.md) 가 정본이다. 여기서는 조인 칸만 둔다.

```
run_ref          PK   text   {runtime}:{runId}   예 research-runtime:run_01H…
event_id         NN   FK → earth_event
runtime          NN   text   research-runtime | tsunami-eta | lab-events | transport-simulator
model_id         NN   text   예 surface-passive-advection.v2.windage
model_version    NN   text
spec_sha256           text   research-runtime provenance.specSha256
dataset_versions NN   jsonb  [{datasetId, version, sha256}]           ← 입력 manifest
forcing_ref           jsonb  { windDataset, windage } 등 강제자료
validation_plan_id    text
validation_ref        text   결과 경로 또는 verdict 해시
status           NN   text   QUEUED RUNNING SUCCEEDED FAILED CANCELLED
truth_status     NN   text   항상 SIMULATION
created_at       NN   timestamptz
```

⚠️ ZIP `inputManifest: string` / `forcingManifest: string` **2칸으로 눌러 담지 않는다.**
research-runtime 은 `datasetVersions[]` 배열 + 자료별 SHA-256 + `validationPlanId` 사전등록을
요구한다. 문자열 2개로는 사전등록과 권리조건이 사라진다(감사 §5-B).

---

## 3. 관계도

```
source ──┬─< news_article >─┐
         │                  │
         ├─< evidence >──┐  │
         │      │        │  │
         │      └< evidence_edge >(9종)
         │               │  │
         │        event_evidence
         │               │  │
         │               ▼  ▼
         └──────────> earth_event <──── event_relation (5+1종, from→to 한 방향)
                       │  │  │  │
                       │  │  │  └─< event_timeline (8종 kind)
                       │  │  └───< claim >── claim_evidence >── evidence
                       │  └──────< context_snapshot
                       │                │
                       │                ▼
                       └──────────< impact_assessment
                                        │
                                        ▼
                                   simulation_run ──→ (research-runtime 원장)
```

---

## 4. 중복 제거 — 동일 기사·번역본·재전재 (PHASE 4 요구)

지금 세 계보가 각자 다르게 한다:

| 구현 | 규칙 | 잡히는 것 | 못 잡는 것 |
|---|---|---|---|
| `gdelt-events` | 같은 root+eventCode+FeatureID(또는 ≤DEDUP_KM) → 합치고 재채점. 기사 단위 대표 위치 1개, 나머지 `alsoPlaces` | 같은 사건이 여러 행으로 쪼개진 것, 한 기사가 여러 지역에 찍힌 것 | 다른 매체의 같은 기사 |
| `v07/news/ingestion-cluster.js` | 제목 jaccard + 국가 0.12 + 지역 0.08, 임계 0.62, 72시간 창 | 같은 주제의 다른 기사 | 번역본 (언어가 다르면 토큰이 안 겹친다) |
| ZIP `news-engine.ts` | canonicalUrl 또는 (출처 + 정규화 제목 + 시각 1시간) | **같은 입력을 두 번 넣은 것** | 다른 매체, 번역본, 재전재 |

→ 정본 `dedup_group_id` 를 3단계로 만든다. 있는 것을 먼저 쓰고, 없는 단계만 새로 만든다:

```
1단계  canonical_url 정규화 후 완전일치           (있음: ZIP articleFingerprint · 채택)
       - 추적 파라미터(utm_*, fbclid …) 제거, 호스트 소문자, 끝 슬래시 제거, AMP 접미사 제거
2단계  같은 언어 내 제목 근사일치                  (있음: ingestion-cluster.js · 재사용)
       - 임계 0.62 · 72시간 창 · 국가/지역 가산 그대로
3단계  번역본·재전재                              (없음: 새로 만들어야 하는 유일한 부분)
       - 기사 본문을 저장하지 않으므로 번역 대조를 할 수 없다
       - 쓸 수 있는 신호: 같은 고유명사 집합(사람·장소·기관명) + 같은 숫자 집합
         + 24시간 창. 제목에서 뽑는다
       - ⚠️ 이것은 추정이다. 3단계로 묶인 것은 dedup_confidence='LOW' 로 적고
         독립 출처 계수(independence_count)에 **더하지 않는다**
```

⚠️ 3단계의 가장 큰 위험: 다른 사건을 같은 것으로 묶으면 `independence_count` 가 부풀고
`CORROBORATED` 가 거짓이 된다. gdelt-events 가 실측으로 겪은 결함 ①과 같은 모양이다.
그래서 **3단계는 절대 독립 출처를 더하지 않는다.** 표시만 합친다.

---

## 5. 저장 위치 결정 (지시서 질문 A)

**원본(진실의 출처)은 S3 이고, Postgres 는 색인이다.**

| 도메인 | 원본 | 색인 | 근거 |
|---|---|---|---|
| `earth_event` | **S3** `events/earth-events.json` (신규) | `earthus_event_cluster` | 기존 계보 보존. 브라우저가 S3 를 직접 읽고, Lambda Function URL 익명 호출이 403 이다 |
| `news_article` | **S3** `events/global.json` · `events/regional-news.json` (기존 그대로) | `earthus_news_article` (신규) | 기존 파일을 계속 쓴다 |
| `source` | **코드+DB 혼합** `provenance.DATASET_PROVENANCE` + `provider_registry` | — | 새 레지스트리 금지(§68) |
| `evidence` | **Postgres** `earthus_evidence_node/edge` | — | 그래프 순회(`trace()`)가 필요하다. JSON 파일로는 못 한다 |
| `claim` | **Postgres** | — | 게이트 판정 이력을 남겨야 한다 |
| `event_relation` | **Postgres** | — | 그래프 조회 |
| `event_timeline` | **S3** (사건 파일 안에 배열) + Postgres 색인 | | 사건 상세를 한 번에 읽는 것이 앱에 유리 |
| `context_snapshot` | **S3** `events/context/<event_id>/<captured_at>.json` | `earthus_context_snapshot` | 자료량이 크다 |
| `impact_assessment` | **Postgres** | — | 행이 적고 조인이 필요 |
| `simulation_run` | **research-runtime SQLite 가 원본** · Postgres 는 조인표만 | | 원장을 둘로 만들지 않는다 |

자세한 근거는 [EARTHUS_STORAGE_ARCHITECTURE.md](EARTHUS_STORAGE_ARCHITECTURE.md).

---

## 6. 인과 주장 방지 (PHASE 8)

기존 장치를 그대로 쓴다. 새로 만드는 것 없음.

| 장치 | 위치 | 하는 일 |
|---|---|---|
| `RELATION_TYPES` 5종 | `report_contract.py:320` | `PHYSICAL_RELATION` 에 "이 기간의 인과 주장이 아니다" 주석이 박혀 있다 |
| `EVIDENCE_LEVELS` 5종 + `EVIDENCE_PHRASE` | `report_contract.py:329` | 표현 강도를 문장 생성기가 못 올린다 |
| `FORBIDDEN_CAUSAL` 9개 | `report_contract.py:338` | 때문에·탓에·원인이다·초래·야기·causes·caused by 금지 |
| `CONFIRMED_CAUSAL` 미도입 | 이 문서 §2.3 | 우회로를 만들지 않는다 |
| `MODELLED_CASCADE` 제약 | 이 문서 §2.3 | `simulation_run_id` 없으면 삽입 거부 |

---

## 7. 필요한 migration (PHASE 3 에서 적용)

기존 방식대로 Supabase SQL Editor 에 붙여 실행한다. 자동 적용 파이프라인은 없다.

| # | 파일(예정) | 내용 | 근거 |
|---|---|---|---|
| M1 | `prototype/supabase/migrations/2026_____earth_event_core.sql` | `earthus_evidence_node` · `earthus_evidence_edge` · `earthus_event_cluster` · `earthus_event_cluster_member` | `v11/postgres/*.sql` 에서 **해당 4개만** 떼어 온다. 나머지 15테이블은 이번 범위 아님 |
| M2 | 같은 파일 | `earthus_news_article` (본문 칸 없음) · `earthus_event_evidence` · `earthus_claim` · `earthus_claim_evidence` | 신규 |
| M3 | 같은 파일 | `earthus_event_relation` (`relation_type` CHECK 제약 6종, `MODELLED_CASCADE` 는 `simulation_run_id` NN) | 신규 |
| M4 | 같은 파일 | `earthus_context_snapshot` (포인터만) · `earthus_simulation_run_link` | 신규 |
| M5 | 보류 | `earthus_impact_assessment` | **계산기가 생길 때까지 미룬다.** 빈 표를 만들지 않는다 |

공통 규칙:
- `release_state text not null default 'SHADOW'` — 기본 비공개 (v11 DDL 계보)
- `create table if not exists` — 재실행 안전
- 기존 19테이블과 이름 충돌 없음 (실측 확인)
- 개인정보 없음. RLS 가 필요한 표는 이번 범위에 없다 (사건은 공개 자료다)

---

## 8. 잠긴 계약 — 깨뜨리면 안 되는 것

| 계약 | 위치 | 이 설계가 지키는 방법 |
|---|---|---|
| 사건 id `{kind}-{sourceId}` | `test_v2_ui_information_architecture.mjs` 2건 | `event_id` 를 그 형식으로 고정. 새 id 생성기 미도입 |
| 현상 66종 · 레이어 109종 | `simulation-questions.test.mjs` · `test_v2_ui…mjs:49` | `phenomenon_id` 는 참조만. 표를 수정하지 않는다 |
| `LAYER_TRUTH` 89 | `engine-bridge.js` | 파생만 추가 (TRUTH_VOCABULARY §4) |
| 시간 4분법 | `intel-feed.js` F01 기록 | `occurred/issued/updated/retrieved` 4칸 유지. `null` 을 `now()` 로 채우지 않는다 |
| 기사 본문 미저장 | `regional-news/handler.py` 머리말 | `content` 칸 미도입 |
| 자동 게시 없음 | `distribution/handler.py` 머리말 | 사건은 `release_state='SHADOW'` 로 생성 |
| 인과 단정 금지 | `report_contract.FORBIDDEN_CAUSAL` | `CONFIRMED_CAUSAL` 미도입 |
| v11 `EVIDENCE_KINDS` 8종 | v11 테스트 65건 | `requireEvidenceKind()` 그대로 |
