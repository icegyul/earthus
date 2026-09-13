# NEWS ENGINE — 재사용 지도

작성 2026-09-13 · PHASE 2-4 · `earthus-v2/real-living-earth-render` @ `3c577d15`
선행 [V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md](V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md) ·
[EARTH_EVENT_CANONICAL_MODEL.md](EARTH_EVENT_CANONICAL_MODEL.md)

목표는 "새 코드를 늘리는 것"이 아니라 **하나의 정본 Earth Event Engine** 이다.
판정 어휘: **재사용 / 리팩토링 / 래핑 / 확장 / 대체**

---

## 0. 결론 먼저

### 0.1 새로 써야 하는 것은 파이프라인 9단계 중 **2단계뿐**이다

```
INGEST      → 재사용   aws/gdelt-events · aws/regional-news · aws/news-brief      (3 Lambda, 1,297줄)
NORMALIZE   → 래핑     v11/news/geospatial-news-fusion.js + v07/news/ingestion-cluster.js
DEDUP       → 확장     gdelt-events 합치기 + ingestion-cluster 군집 · 3단계만 신규
GEOLOCATE   → 재사용   gdelt-events build_gazetteer / place_doubt (지명 사전 대조)
EVENT MATCH → 재사용   v11/event/event-fusion.js eventSimilarity / clusterEarthEvents
                       + v06/news/news-event-linker.js linkNewsToEarthEvent
CLAIM       → 재사용   v11/claims/claim-gate.js evaluateClaim / claimLabel
EVIDENCE    → 재사용   v11/evidence/evidence-graph.js EvidenceGraph
VERIFICATION→ 리팩토링  gdelt score() + independence 계수 → TRUTH_STATUS 파생
PUBLISH     → 래핑     기존 S3 쓰기 계보 (events/*.json) + release_state SHADOW
```

**신규 코드가 필요한 곳:**
1. `DEDUP` 3단계 — 번역본·재전재 묶기 (§4)
2. 이 9단계를 **한 배치 안에서 순서대로 부르는 조립기** (`aws/earth-events/handler.py`, 신규)

그 밖은 전부 이미 있다. 합쳐서 **1,400줄 이상이 이미 돌고 있다.**

### 0.2 ZIP `news-engine.ts` · `event-engine.ts` 는 **대체(=미채택)**

감사 §4-B 근거 그대로다. 요약:

| ZIP 코드 | 문제 | 기존 대안 |
|---|---|---|
| `EventEngine.findMatch()` | **`type` 을 보지 않는다.** 제목 jaccard 0.7 + 거리 + 시간만 본다 | `eventSimilarity()` 는 type 불일치를 즉시 거절(`TYPE_MISMATCH`) |
| `NewsEngine.ingest()` 중복제거 | 같은 입력을 두 번 넣을 때만 잡는다. 자체 시험도 그것만 검사 | gdelt 합치기 + `clusterNewsArticles()` |
| 지명 검증 | 없음 | `build_gazetteer()` + `place_doubt()` (최대 8,436km 오배치를 잡은 이력) |
| `NewsArticle.content` | 본문 저장 칸 | 본문을 저장하지 않는다 (저작권) |
| `store.ts` Map | 프로세스 종료 시 소멸 | S3 + Postgres |

### 0.3 ZIP 에서 **가져오는 것은 4가지**

| 가져올 것 | ZIP 위치 | 어디로 |
|---|---|---|
| `TimelineEntry` 8종 + 정렬 | `types.ts` · `event-engine.ts timeline()` | `event_timeline` 표 + 사건 상세 |
| `ContextSnapshot.status` 3종 + 어댑터 실패 시 `{status:'UNKNOWN'}` | `context-engine.ts` | `context_snapshot` |
| 독립성 그룹 계수 규칙 (`groups.size >= 2 → CORROBORATED`, 충돌 시 `REPORTED` 고정) | `evidence-engine.ts classify()` | `TRUTH_STATUS` 파생 함수 |
| `ImpactAssessment` 자료구조 (가정·불확실성 필수) | `types.ts` | `impact_assessment` 스키마 |

**개념만 가져온다. `.ts` 파일을 저장소에 복사하지 않는다.**

---

## 1. INGEST — 재사용

### 1.1 `aws/gdelt-events/handler.py` (589줄) — **재사용, 손대지 않는다**

| 항목 | 값 |
|---|---|
| 입력 | `http://data.gdeltproject.org/gdeltv2/lastupdate.txt` → 최신 export CSV (15분 주기) + GKG 제목 |
| 출력 | `s3://<CACHE_BUCKET>/events/global.json` (`max-age=600`) |
| 감시 | `aws/health/handler.py`: `everyMin 180 · graceMin 120` |
| 소비자 | V1 `prototype/js/layers/events.js` · `aws/news-brief` · `aws/archiver` |
| 진입점 | `handler(event, context)` (`handler.py:360`) |

재사용 이유: 이 파일은 **실측으로 세 가지 결함을 고친 이력**을 갖고 있다(2026-09-07 주석).
같은 일을 다시 만들면 세 결함이 되살아난다.

- ① 합치기가 교차검증 점수를 지어냈다 (90점 → 실제 43점) → `max()` + 재채점
- ② 같은 헤드라인이 지구에 여러 개 (150건 중 63건) → 기사 단위 대표 위치 1개 + `alsoPlaces`
- ③ 마커가 기사와 다른 곳 (최대 8,436km) → 지명 사전 대조 `placeDoubt`
- ④ 사건이 아닌 글(리뷰·칼럼·보도자료) 버리기 → `SOFT` / `SOFT_HOST`

바꿀 것: **없다.** 다음 단계(조립기)가 `events/global.json` 을 **읽는다.**

### 1.2 `aws/regional-news/handler.py` (178줄) — **재사용, 손대지 않는다**

| 항목 | 값 |
|---|---|
| 입력 | 지역 매체 RSS 8종 (allAfrica, Africanews, Al Jazeera, Agência Brasil, MercoPress, Antara, VnExpress, Bangkok Post …) |
| 출력 | `events/regional-news.json` |
| 감시 | `everyMin 30 · graceMin 60` |
| 소비자 | V2 `live-layers.js case 'news'` · `integration-v10/pulse-source.js` |
| 담는 것 | **제목 · 링크 · 시각 · 매체 뿐** |

⚠️ 이 파일의 머리말이 이번 통합의 가장 강한 제약이다:

> **기사 본문을 절대 담지 않는다.** … 요약도 하지 않는다 — 요약은 원문을 재구성하는 것이라 마찬가지다.
> 번역해서 저장하지 않는다 — 미리 번역해 저장하면 "매체가 이렇게 썼다"가 아니라 "우리가 이렇게 옮겼다"가 된다.

→ `news_article` 표에 `content` 칸을 두지 않는 근거. 그리고 DEDUP 3단계에서
**번역 대조를 본문으로 할 수 없는 근거**(§4).

### 1.3 `aws/news-brief/handler.py` (530줄) — **재사용, 손대지 않는다**

| 항목 | 값 |
|---|---|
| 입력 | `events/global.json` 중 `status=="confirmed"` 이고 중요도 높은 상위 N건 |
| 출력 | `events/briefs.json` (병합) |
| 모델 | `claude-opus-5` · effort high · 웹검색 + 구조화 출력 · KO/EN 동시 |
| 소비자 | V1 `prototype/js/brief.js` · `prototype/js/ui-brief.js` |

규칙(코드로 박혀 있음): 원문 문장 그대로 옮기지 않음 · 항목마다 출처 URL 필수(없으면 **버린다**) ·
검색으로 확인 안 된 것 쓰지 않음 · 기사 본문 저장 안 함 · AI 작성 사실을 화면에 표시.

→ 이것이 이미 `claim` + `evidence` 의 원형이다. 브리핑 항목 하나 = `claim` 하나,
그 항목의 출처 URL = `evidence` 하나. 조립기가 그렇게 옮긴다(§7).

### 1.4 그 밖 사건 공급원 (사건 조립에 함께 쓴다)

| Lambda | 출력 | `SOURCE_KIND` | 용도 |
|---|---|---|---|
| `gdacs-tc` | `events/gdacs-tc.json` | OFFICIAL | 태풍 사건 (`tc-<id>`) |
| `typhoon-official` | `events/typhoon-official.json` | OFFICIAL | 기관별 공식 통보문 |
| `kma-warn` / `jma-warn` / `world-alerts` | `events/kma-warn.json` 등 | OFFICIAL | 특보 |
| `quake-asia` + USGS 직접 | `events/quake-asia.json` | OBSERVATION | 지진 (`eq-<id>`) |
| `tsunami-intl` | `events/tsunami-intl.json` | OFFICIAL | PTWC 게시문 |
| `wildfire` | `events/wildfire.json` | SATELLITE | FIRMS 화점 |
| `lab-events` | `analysis/<kind>-reports.json` | 혼합 (`KIND_TRUTH` 9종) | LAB 사건 8종 |
| `cyclone-analog` | `ocean/cyclone-events.json` | MODEL | 사건 패킷 + 상태 |

---

## 2. NORMALIZE — 래핑

### 2.1 `v11/news/geospatial-news-fusion.js` — **래핑**

```js
normalizeNewsArticle(input, placeResolver) → Object.freeze({
  articleId, title, source, url, publishedAt, category,
  placeText, lat, lon,
  locationPrecision: 'EXACT_SOURCE' | (resolver 결과) | 'NONE',
  mappable: bool,
  truthClass: 'NEWS_REPORT'
})
normalizeNewsBatch(rows, resolver)
```

좋은 것: 좌표 정밀도를 값으로 갖는다 · `mappable` 을 명시한다 · 좌표 없으면 `null`(0 대체 없음).

래핑이 필요한 이유 2가지:
1. 반환 필드 이름이 정본 모델과 다르다 (`articleId`/`source`/`url` ↔ `article_id`/`source_id`/`canonical_url`)
2. `truthClass: 'NEWS_REPORT'` 는 3축 어휘가 아니다 → `SOURCE_KIND=NEWS, TRUTH_STATUS=REPORTED` 로 옮긴다
   (`TRUTH_VOCABULARY_CANONICAL.md` §3.3 표에 이미 있다)

**이 파일을 수정하지 않는다.** 어댑터에서 필드명을 옮긴다.

### 2.2 `v07/news/ingestion-cluster.js` `normalizeNewsArticle()` — **래핑 (보조)**

`v11` 쪽과 같은 함수명이지만 다른 필드를 낸다:
`id: ${source.id}:${raw.url}` · `summary`(500자 절단) · `country`/`region`/`city` ·
`topics[]`(20개) · `fullTextStored`.

가져올 것: **`id` 형식 `{source.id}:{url}`** → 정본 `news_article.article_id` 로 채택.
버릴 것: `summary` 자동 생성(저작권), `fullTextStored`(본문을 저장하지 않으므로 불필요).

### 2.3 `v07/news/source-registry.js` — **재사용. 이게 ZIP 에 없는 권리 층이다**

```js
normalizeNewsSource(input) → Object.freeze({
  id, organization, type: 'RSS'|'ATOM'|'API'|'HTML_OFFICIAL',
  baseUrl, enabled, official, fetchIntervalMs (최소 300000),
  rights:  { snippetOnly, fullTextAllowed, imageRedisplay },
  policy:  { robotsRequired, termsReviewed, allowAutomatedFetch }
})
canFetchNewsSource(source) → { allow, reason }
  reason ∈ DISABLED | AUTOMATED_FETCH_NOT_APPROVED | TERMS_NOT_REVIEWED | SOURCE_POLICY_APPROVED
```

기본값이 전부 **거부 쪽**이다 (`termsReviewed !== true`, `allowAutomatedFetch !== true`).
ZIP `Source` 에는 권리·robots·약관 확인 개념이 아예 없다.

→ 정본 `source.rights_json` 을 이 구조 **그대로** 쓴다.
→ 새 뉴스 공급원을 추가할 때 `canFetchNewsSource()` 를 통과해야 수집기가 돈다.

---

## 3. GEOLOCATE — 재사용

`aws/gdelt-events/handler.py`:

```python
build_gazetteer(rows)          # GDELT 자기 데이터로 지명 사전을 만든다
                               # GAZ_STOP 으로 일반명사·짧은 이름 제외 ('Nice' 같은 오탐 방지)
place_doubt(title, lat, lon, pat, gaz) → (bad, far)
                               # 제목이 마커와 다른 곳을 말하면 bad
                               # ⚠️ 반대 방향(제목에 마커 도시가 나오나)은 버렸다 —
                               #    확정 8건 중 5건이 정상인데도 탈락했다(실측)
```

판정: **재사용.** 다른 공급원(RSS)에도 쓸 수 있게 조립기에서 함수를 부른다.
지금은 `handler.py` 안에 있어 import 가 안 된다 → **리팩토링 1건**:
`aws/_shared/geolocate.py` 로 두 함수를 옮기고 `gdelt-events` 는 그걸 import 한다.
동작을 바꾸지 않는다. `aws/gdelt-events` 의 기존 시험이 없으므로 옮길 때 시험을 함께 만든다.

정밀도 매핑:
```
gdelt geoType 4,5 → CITY      3 → CITY/REGION      2 → REGION      1 → COUNTRY      0 → NONE
v11 locationPrecision EXACT_SOURCE → EXACT_SOURCE          NONE → NONE
placeDoubt=true → location_doubt=true (확정 승격 금지)
```

---

## 4. DEDUP — 확장 (3단계만 신규)

[EARTH_EVENT_CANONICAL_MODEL.md](EARTH_EVENT_CANONICAL_MODEL.md) §4 의 3단계 설계를 따른다.

| 단계 | 구현 출처 | 판정 |
|---|---|---|
| 1 — URL 정규화 완전일치 | ZIP `articleFingerprint()` 의 canonicalUrl 분기 | **재사용(개념)** + 추적 파라미터 제거 규칙 추가 |
| 2 — 같은 언어 제목 근사 | `v07/news/ingestion-cluster.js clusterNewsArticles()` (임계 0.62 · 72h · 국가 0.12 · 지역 0.08) | **재사용, 손대지 않는다** |
| 3 — 번역본·재전재 | **없음** | **신규** |

### 3단계를 만드는 방법과 그 한계

본문을 저장하지 않으므로 번역 대조를 할 수 없다. 제목에서만 신호를 뽑는다:

```
signal = (고유명사 집합 교집합)  ∧  (숫자 집합 교집합)  ∧  (24시간 창)
       고유명사: 제목에서 대문자 시작 토큰 + 한글 지명(gazetteer 대조)
       숫자: 규모(M6.2) · 사망자 수 · 좌표가 아닌 정수
```

⚠️ **제약 3개를 코드로 박는다:**
1. 3단계로 묶인 기사는 `dedup_confidence='LOW'` 로 적는다
2. `independence_count` 에 **더하지 않는다** — 표시만 합친다
3. 서로 다른 `kind` 는 3단계로 묶지 않는다 (gdelt 결함 ① 재발 방지)

근거: gdelt-events 가 겪은 결함 ①은 "합치면서 독립 출처를 더한 것"이었다.
추정으로 묶은 것이 `CORROBORATED` 를 만들면 같은 거짓말이 다른 경로로 돌아온다.

---

## 5. EVENT MATCH — 재사용

### 5.1 사건끼리 묶기 — `v11/event/event-fusion.js`

```js
eventSimilarity(a, b, policy) → { score, merge, reasons[] }
clusterEarthEvents(records, policy) → 대표 사건 배열 (union-find)
```

정책 기본값: `maxHours 72` · `maxMeters 250000` · `threshold 0.62`
가중: `0.35 시간 + 0.35 거리 + 0.20 이름 + 0.10 지역`, 단 **type 불일치는 즉시 0**.

판정: **재사용, 손대지 않는다.** `event-room.js` 가 이미 이 함수를 import 해서 쓰고 있다
(저장소에서 v11 모듈이 화면에 배선된 유일한 지점).

확장 필요 1건: 입력 레코드 필드명을 정본 모델로 맞추는 어댑터
(`eventType` ← `kind`, `officialEventId` ← `source_event_id`, `startedAt` ← `occurred_at`).

### 5.2 기사 → 사건 붙이기 — `v06/news/news-event-linker.js`

```js
scoreNewsEventLink(news, event) →
  topic jaccard * 0.48 + country 0.12 + region 0.18 + city 0.22
  + time (≤12h 0.20 · ≤48h 0.12 · ≤168h 0.06 · 그 밖 0)
linkNewsToEarthEvent(news, candidates, { autoLinkThreshold = 0.72 })
  → { best, autoLinked, ranked }
clusterNewsByEvent(items)
```

판정: **재사용.** 잠긴 시험이 이미 있다 —
`tools/earthus2-v06/news-tourism-environment.test.mjs`:
- `news does not auto-link to unrelated Earth Event`
- `news cluster collapses many articles into one Earth Event cluster`

이 두 시험이 지시서 PHASE 4 의 "동일 사건의 여러 기사를 하나의 EarthEvent 에 연결한다 /
별도 사건으로 만들지 않는다" 요구를 **이미 검사하고 있다.**

⚠️ 현재 화면·배치 어디에서도 이 함수를 부르지 않는다(실측: `v06/index.js` 재수출뿐).
조립기가 부르는 첫 소비자가 된다.

`autoLinked=false` 일 때 규칙: 사건에 붙이지 않고 `news_article.event_id = null` 로 둔다.
**억지로 붙이지 않는다.** `ranked` 상위는 `link_score` 와 함께 후보로만 남긴다.

---

## 6. CLAIM / EVIDENCE — 재사용

### 6.1 `v11/claims/claim-gate.js`

```js
RULES = {
  SOURCE_ATTRIBUTION:        ['officialSourceAttribution'],
  TRANSPORT:                 ['vectorProof','transportEvidenceKind'],
  DISCOVERY_RECOMMENDATION:  ['minimumSignals','safetyGate','providerEvidence'],
  FORECAST:                  ['modelReleaseGate','calibrationEvidence','providerEvidence'],
  SAFETY_ACTION:             ['officialWarning'],
}
evaluateClaim(claimType, evidence) → { claimType, allowed, missing[] }
claimLabel(claimType, evidence)   → 라벨 문자열 | null      ← null 이면 표시 금지
```

판정: **재사용 + 확장.**
확장은 사건용 claimType 추가가 필요할 때만 하고, **어휘 정의는 이 파일 한 곳에 둔다.**
`v11` 테스트(`claims-provider-analytics.test.mjs`)가 이 표를 검사한다.

### 6.2 `v11/evidence/evidence-graph.js`

```js
class EvidenceGraph {
  addNode({ id?, evidenceKind, sourceId, externalId, title, observedAt, url, payload })
      → requireEvidenceKind() 필수. sourceId 필수. 없으면 TypeError
  addEdge(from, to, relation, metadata)   relation ∈ 9종, 노드 양쪽 존재 필수
  trace(id, { maxDepth = 6 })             → { nodes, edges }  BFS
  snapshot()                              → { nodes, edges }
}
RELATIONS = OBSERVATION_OF · REPORTED_BY · OFFICIAL_NOTICE_OF · ACTION_RESPONDS_TO
            DERIVED_FROM · SUPPORTS · CONTRADICTS · CALIBRATES · HISTORICAL_ANALOG_OF
```

판정: **재사용 + 래핑.** 지금은 메모리 전용(`#nodes` Map)이다.
→ 래핑: `EvidenceRepository` 가 `addNode`/`addEdge` 를 Postgres
(`earthus_evidence_node` / `earthus_evidence_edge`)로 내려쓴다.
`trace()` 는 재귀 CTE 로 같은 결과를 낸다. **클래스를 수정하지 않는다.**

ZIP 에서 가져올 것 하나: `EvidenceEngine.classify()` 의 독립성 계수 규칙
(그룹 ≥ 2 → CORROBORATED, 충돌 시 REPORTED 고정) → `EvidenceGraph` 에 메서드로 **추가**한다.
반환 어휘는 `TRUTH_STATUS` 다(ZIP `VerificationState` 와 값이 1:1 동일하므로 변환 불필요).

---

## 7. VERIFICATION — 리팩토링

지금 세 곳이 각자 판정한다:

| 위치 | 산출 | 산식 |
|---|---|---|
| `gdelt-events score()` | 0~100 + `confirmed/unconfirmed` | §1.1.1 (5요소, 공개) |
| `evidence-graph` + `claim-gate` | 라벨 유무 | 필수 증거 충족 |
| `intel-feed` `CONF_BADGE` | high/medium/low | 사건 패킷의 `confidence` |

→ **하나의 파생 함수**로 모은다 (`TRUTH_VOCABULARY_CANONICAL.md` §4 단계 A 의 `deriveTruth()`):

```
deriveTruth({ sourceKind, dataState, timeMode, independenceGroups, conflict, gdeltScore })
  → { truthStatus, reasons[] }

규칙 순서
  conflict 있음                                   → REPORTED   (CORROBORATED 금지)
  independenceGroups ≥ 2                          → CORROBORATED
  timeMode = SCENARIO 또는 시뮬 산출물             → SIMULATION
  timeMode = FORECAST                             → FORECAST
  sourceKind ∈ {OFFICIAL, OBSERVATION, SATELLITE}
      AND dataState ≠ UNAVAILABLE AND SLA 안       → FACT
  sourceKind = MODEL AND 산출자 = EARTHUS          → INFERRED
  sourceKind = NEWS                               → REPORTED
  출처 있음, 그 밖                                 → CLAIM
  그 밖                                           → UNKNOWN
```

⚠️ `gdeltScore` 는 `independenceGroups` 를 **대신하지 않는다.**
gdelt `outlets`(서로 다른 매체 수)가 독립 그룹 수의 근사이고, 점수는 그 밖의 요소(언급량·감쇠)를
섞은 값이다. 정본 `independence_count` 는 **`outlets` 로 센다.**
`confirmed`(score ≥ CONFIRM_SCORE) 는 gdelt 내부 판정으로 그대로 보존하고,
`TRUTH_STATUS` 는 위 규칙이 독립적으로 낸다. 두 값을 둘 다 적는다 — 하나로 눌러 담지 않는다.

`placeDoubt=true` 면 `location_doubt=true` 이고, `CORROBORATED`/`FACT` 승격을 막는다
(gdelt handler 가 이미 `confirmed → unconfirmed` 로 내린다. 같은 규칙을 정본에서도 유지).

---

## 8. PUBLISH — 래핑

새 API 를 만들지 않는다. 기존 계보 그대로:

```
조립기(신규 Lambda)  →  S3 events/earth-events.json          사건 색인 (max-age=600)
                     →  S3 events/earth-events/<event_id>.json  사건 상세 + 타임라인
                     →  Postgres  evidence / claim / relation / 색인
                     →  앱이 S3 를 직접 읽는다 (CloudFront 같은 출처, brotli)
```

기본 `release_state='SHADOW'`. 공개는 `ACTIVE`/`CANARY` 만 (`publicReleaseAllowed()`, v11 기존 함수).

⚠️ 새 S3 접두사를 만들지 않는다. `events/` 는 이미 공개 접두사다
(`publication_privacy.BUCKET_PUBLIC_PREFIXES` 실측 확인).
`analysis/` 는 403 이므로 공개 산출물을 그리로 쓰지 않는다.

---

## 9. 판정 종합표

### 9.1 기존 저장소 코드

| 파일 | 줄 | 판정 | 수정 여부 |
|---|---|---|---|
| `aws/gdelt-events/handler.py` | 589 | **재사용** | 없음 (단, `build_gazetteer`/`place_doubt` 를 `_shared` 로 이동 = 리팩토링 1건) |
| `aws/regional-news/handler.py` | 178 | **재사용** | 없음 |
| `aws/news-brief/handler.py` | 530 | **재사용** | 없음 |
| `v11/event/event-fusion.js` | — | **재사용** | 없음 (어댑터로 필드명 변환) |
| `v11/evidence/evidence-graph.js` | — | **재사용 + 래핑** | 없음 (Repository 로 감싸기) + `classify()` 메서드 추가 |
| `v11/claims/claim-gate.js` | — | **재사용 + 확장** | claimType 추가 시에만 |
| `v11/news/geospatial-news-fusion.js` | — | **래핑** | 없음 |
| `v07/news/ingestion-cluster.js` | 9 | **재사용(군집) + 부분 채택(id)** | 없음 |
| `v07/news/source-registry.js` | 6 | **재사용** | 없음 |
| `v06/news/news-event-linker.js` | 34 | **재사용** | 없음 |
| `prototype/js/layers/events.js` | 199 | **재사용 + 확장** | 새 사건 파일도 읽게 확장 (V1 Cesium) |
| `prototype/v2-three/js/intel-feed.js` | 816 | **리팩토링** | 브라우저 조립 → 배치 산출물 읽기로. 사건 id·시각 4분법·비컨은 유지 |
| `prototype/v2-three/js/event-room.js` | 420 | **확장** | 타임라인·증거·미해결 질문 절 추가 |
| `aws/_shared/provenance.py` | — | **재사용 + 확장** | 새 S3 키를 `DATASET_PROVENANCE` 에 추가 |
| `aws/_shared/report_contract.py` | 473 | **재사용** | 없음 (`RELATION_TYPES`·`EVIDENCE_LEVELS`·`FORBIDDEN_CAUSAL`) |
| `aws/_shared/content_contract.py` | 388 | **재사용** | 없음 |
| `aws/distribution/**` | — | **재사용 + 확장** | `sources/` 에 뉴스 어댑터 추가 |

### 9.2 ZIP 코드

| ZIP 파일 | 판정 | 비고 |
|---|---|---|
| `types.ts` `TimelineEntry`·`TimelineKind` | **개념 채택** | 표 스키마로 |
| `types.ts` `ContextSnapshot`·`ContextAdapter` | **개념 채택** | |
| `types.ts` `ImpactAssessment`·`ImpactAdapter` | **개념 채택** | 계산기 없어 값은 UNKNOWN |
| `types.ts` `VerificationState` | **채택 (값 1:1)** | 심볼명은 `TRUTH_STATUS` |
| `types.ts` `SourceType` | **채택 (값 1:1)** | 심볼명은 `SOURCE_KIND` |
| `types.ts` `RelationType` | **부분 채택** | `MODELLED_CASCADE` 만 추가. `CONFIRMED_CAUSAL` 미도입 |
| `types.ts` `EventStatus` | **미채택** | 생애·진리 두 축 혼합 |
| `types.ts` `NewsArticle.content` | **미채택** | 저작권 |
| `evidence-engine.ts classify()` | **규칙만 채택** | `EvidenceGraph` 메서드로 |
| `context-engine.ts` 실패 처리 | **규칙만 채택** | 어댑터 실패 → `{status:'UNKNOWN'}` |
| `event-engine.ts findMatch()` | **미채택** | type 미검사 |
| `news-engine.ts ingest()` | **미채택** | 중복제거 부족 |
| `simulation-orchestrator.ts` · `v3-simulation-adapter.ts` | **미채택(재작성)** | manifest 2칸 부족 → [SIMULATION_PLATFORM_MAPPING.md](SIMULATION_PLATFORM_MAPPING.md) |
| `alert-engine.ts` | **미채택(재작성)** | `aws/push-tick` 기존 경로 |
| `search-engine.ts` | **미채택(재작성)** | 전수 jaccard 스캔. `v11/memory/analog-search.js` 확장 |
| `cascade-engine.ts` | **미채택** | 양방향 2행 저장 문제 · 관계 어휘가 정본과 다름 |
| `store.ts` · `unified-pipeline.ts` | **미채택** | 영속성 없음 · 정적 앱 구조와 안 맞음 |
| `id.ts stableId` | **미채택** | 사건 id 가 잠겨 있다 |
| `text.ts` | **미채택** | 같은 함수가 3곳에 이미 있다 |
| `engines/dist/**` · `reference/*.zip` | **미채택** | 빌드 산출물 · 중복 |

---

## 10. 신규로 만들 것 (PHASE 3 범위)

| # | 파일(예정) | 줄 추정 | 하는 일 |
|---|---|---|---|
| N1 | `aws/earth-events/handler.py` | ~350 | 조립기. 기존 S3 산출물 9종을 읽어 9단계를 순서대로 부르고 `events/earth-events*.json` + Postgres 에 쓴다 |
| N2 | `aws/_shared/geolocate.py` | ~120 | `build_gazetteer` · `place_doubt` 이동 (동작 불변) + 시험 |
| N3 | `aws/_shared/dedup_translation.py` | ~150 | DEDUP 3단계 (§4). `dedup_confidence='LOW'` 고정 |
| N4 | `prototype/js/earthus2/v11/core/truth-status.js` | ~120 | 3축 정의 + 파생표 + `deriveTruth()` |
| N5 | `aws/_shared/truth_vocabulary.py` | ~80 | N4 를 **읽는다** (`phenomenon_registry.py` 선례) |
| N6 | 마이그레이션 SQL 1개 | ~180 | `EARTH_EVENT_CANONICAL_MODEL.md` §7 M1~M4 |
| N7 | 시험 3개 | ~250 | `truth-vocabulary.test.mjs` · `earth-event-model.test.mjs` · `test_earth_events_handler.py` |

합계 **약 1,250줄**. ZIP 을 그대로 복사하면 953줄이 들어오지만 그중 실제로 쓸 수 있는 것은
개념 4개뿐이고, 위 1,250줄은 기존 1,400줄 이상을 **재사용하기 위한 배선**이다.

---

## 11. 지시서 PHASE 4 파이프라인 대조

| 지시서 단계 | 구현 | 상태 |
|---|---|---|
| INGEST | `gdelt-events` · `regional-news` · `news-brief` + 사건 공급원 8종 | **있다** (운영 중) |
| NORMALIZE | `v11/news` + `v07/news` 래핑 | 있다 (배선 필요) |
| DEDUP | 1·2단계 있다 · **3단계 신규** | 부분 |
| GEOLOCATE | `build_gazetteer` + `place_doubt` | 있다 (이동 필요) |
| EVENT MATCH | `event-fusion` + `news-event-linker` | 있다 (배선 필요) |
| CLAIM | `claim-gate` | 있다 (배선 필요) |
| EVIDENCE | `evidence-graph` | 있다 (저장 래핑 필요) |
| VERIFICATION | `deriveTruth()` 신규 (기존 3개 산식 통합) | 신규 |
| PUBLISH | S3 쓰기 + `release_state` | 있다 |

> "동일 사건의 여러 기사를 하나의 EarthEvent 에 연결한다" →
> `clusterNewsArticles()` + `linkNewsToEarthEvent()` + `tools/earthus2-v06` 잠긴 시험 2건이 이미 검사한다.
>
> "동일 기사 / 번역본 / 재전재를 별도의 독립 사건으로 만들지 않는다" →
> 1·2단계로 대부분 잡히고, 3단계가 나머지를 **낮은 확신으로** 묶는다.
> 3단계는 독립 출처를 더하지 않으므로 잘못 묶여도 `CORROBORATED` 를 만들지 못한다.
