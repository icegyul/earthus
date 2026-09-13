# PHASE 3H — 기사 중복 제거와 계보

작성 2026-09-13 · 기준 커밋 `c481453f` 이후 작업 트리
관련 [NEWS_ENGINE_REUSE_MAP.md](NEWS_ENGINE_REUSE_MAP.md) §4 ·
[EARTH_EVENT_CANONICAL_MODEL.md](EARTH_EVENT_CANONICAL_MODEL.md) §4

## 상태: **PARTIAL**

| 항목 | 상태 | 근거 |
|---|---|---|
| 중복 3종 판정 알고리즘 | **PASS** | `aws/_shared/article_dedup.py` · §2 |
| 계보 보존 (관계 4종) | **PASS** | §3 · 원본 삭제 0 |
| ARTICLE DEDUP ≠ EVENT FUSION 분리 | **PASS** | §4 · 시험이 산출물에 사건 id 가 없음을 검사 |
| 교차검증 부풀림 방지 | **PASS** | §5 · 묶음 1 = 독립 출처 1 |
| 지시서 요구 테스트 10종 | **PASS** | §6 · 21개 시험 전부 통과 |
| **파이프라인 배선** | **BLOCKED** | 조립기(3G)가 AWS 자격 차단으로 미착수 → **이 모듈을 부르는 코드가 아직 없다** |
| **실자료 정확도 측정** | **미측정** | 실제 GDELT·RSS 기사를 받을 수 없다(AWS 세션 만료) |

전체를 PASS 로 적지 않는 이유: 모듈과 시험은 끝났지만 **운영 경로에 연결되지 않았다.**
지시서 3P 의 구분으로는 "실제 구현 + 테스트 fixture" 이고 "데이터 연결 완료" 가 아니다.

---

## 1. 어디에 있나

```
aws/_shared/article_dedup.py            판정·계보 (순수 함수, 네트워크·S3·DB 없음)
aws/_shared/tests/test_article_dedup.py 시험 21개
aws/_shared/sql/20260913_earth_event_core.sql
                                        earthus_article_dedup_group · earthus_article_lineage 표
```

`_shared` 에 둔 이유: 조립기(3G)와 기존 Lambda 양쪽이 import 해야 하고,
`provenance.py`·`content_contract.py`·`report_contract.py` 같은 교차 계약이 이미 여기 산다.

## 2. 판정 5단계

순서대로 보고, 먼저 맞는 단계에서 멈춘다.

| # | 단계 | 조건 | 관계 | 확신도 |
|---|---|---|---|---|
| ① | `url-identity` | 정규화 URL 일치 | `REWRITE_OF` | HIGH |
| ② | `content-identity` | 같은 매체 · 같은 언어 · 정규화 제목 완전일치 · ≤72h | `REWRITE_OF` | HIGH |
| ③ | 전재 | **다른 매체** · 같은 언어 · 제목 유사도 ≥0.80 · 숫자 집합 동일 · ≤72h | `SYNDICATION_OF` | MEDIUM |
| ④ | 재작성 | 같은 매체 · 같은 언어 · 유사도 ≥0.60 · ≤72h | `REWRITE_OF` | MEDIUM |
| ⑤ | 번역 | **다른 언어** · 숫자 집합 동일(비어 있지 않음) · (좌표 ≤200km 또는 공통 고유명사) · ≤48h | `TRANSLATION_OF` | **LOW** |

### 2.1 거부 조건 (먼저 본다 — 합치지 않는 쪽으로 기운다)

```
숫자 집합이 둘 다 있는데 겹치지 않는다        → 다른 사건이다. 합치지 않는다
좌표가 둘 다 있는데 300km 초과로 멀다          → 합치지 않고 conflicts 에 적는다
시각을 모른다(null)                            → 시간 조건을 통과시키지 않는다 (0 으로 두지 않는다)
```

### 2.2 URL·제목 정규화

```
URL   추적 파라미터 제거(utm_* fbclid gclid ref cmpid …) · www. 제거 · AMP 접미사 제거
      · 끝 슬래시 제거 · 질의 정렬 · 스킴·호스트 소문자
      ⚠️ 의미 있는 질의(?id=1 vs ?id=2)는 남긴다 — 다른 문서일 수 있다
제목  NFKC · HTML 제거 · 편집 표지 반복 제거([단독][종합] (LEAD) UPDATE: 속보 …)
      · 끝의 매체명 꼬리표 제거 · 문장부호 제거 · 소문자
숫자  원문에서 뽑는다(정규화 전). 6.2 · 2,000 → 2000. 규모 M6.2 → 6.2
```

## 3. 본문을 쓰지 않는다 — 설계 제약이고, 그래서 번역 판정이 약하다

`aws/regional-news/handler.py` 머리말이 금지한다:

> 기사 본문을 절대 담지 않는다. 담는 것은 제목·링크·시각·매체뿐이다.
> 요약도 하지 않는다 — 요약은 원문을 재구성하는 것이라 마찬가지다.
> 번역해서 저장하지 않는다.

그래서 판정 신호는 **URL·제목·매체·시각·언어·좌표** 뿐이다. 결과:

| | 강함 | 약함 |
|---|---|---|
| ①② URL·제목 동일 | 확정적 | — |
| ③ 전재 | 전재본은 제목이 거의 그대로여서 잘 잡힌다 | 구독 매체가 제목을 새로 달면 놓친다 |
| ④ 재작성 | 같은 매체 안이라 문턱을 낮춰도 안전하다 | — |
| ⑤ 번역 | 숫자는 번역돼도 남는다(M6.2 / 규모 6.2, 12 dead / 12명 사망) | 숫자가 없는 제목은 판정 불가. 한국어는 대문자가 없어 고유명사 추출이 근사다 |

⑤ 는 **항상 LOW** 이고, 그것이 §5 의 회계와 맞물려 잘못 합쳐도 교차검증을 부풀리지 못한다.

## 4. ARTICLE DEDUP ≠ EVENT FUSION

| | ARTICLE DEDUP (이 모듈) | EVENT FUSION (기존) |
|---|---|---|
| 묻는 것 | "같은 **기사**인가" | "같은 **사건**인가" |
| 구현 | `aws/_shared/article_dedup.py` | `prototype/js/earthus2/v11/event/event-fusion.js` |
| 관계 어휘 | `ORIGINAL` `TRANSLATION_OF` `SYNDICATION_OF` `REWRITE_OF` | `EVENT_RELATION` 6종 |
| 산출물 | `dedup_group_id` · `root_article_id` · `relation` | `event_id` · 군집 구성원 |

코드로 분리를 지킨다:
- 이 모듈은 사건 id 를 **만들지도 받지도 않는다**. `test_output_carries_no_event_identity` 가
  산출물 전체를 문자열로 훑어 `eventid`·`event_id`·`earthevt` 가 없음을 검사한다.
- `RELATED_TO` 는 여기 **없다** — 그것은 사건끼리의 관계이므로 `EVENT_RELATION` 이 담당한다.
- SQL 의 `earthus_article_dedup_group` · `earthus_article_lineage` 두 표에도 `event_id` 칸이 없다.

조립기(3G)가 쓸 방식: `roots(result)` 가 주는 **뿌리 기사만** 사건 결합에 넘기고,
나머지 구성원은 계보로 달아 둔다. 그래야 같은 기사 다섯 개가 사건 다섯 개를 만들지 않는다.

## 5. 교차검증을 부풀리지 않는다

`gdelt-events/handler.py` 2026-09-07 주석이 기록한 결함 ①:

> "같은 대분류 + 60km" 규칙이 런던에서 무관한 기사 15건을 한 덩어리로 묶었다.
> 합칠 때마다 sources 를 더하고 점수를 +4 씩 올려서 "매체 15곳이 교차검증한 … 90점 확정" 이 나왔다.
> 원본 15행의 NumSources 는 **전부 1** 이었다.

같은 경로를 다른 문으로 되풀이하지 않으려고, **회계 창구를 하나로 둔다**:

```python
independence_units(result) == len(result["groups"])     # 묶음 하나가 1 이다
```

실측 (시험 `test_a_group_counts_as_one_independent_source`):

```
기사 4건 → 묶음 2개
  dg_m-en  뿌리=m-en  확신도=LOW  매체=['reuters','straitstimes','yonhap']  언어=['en','ko']
      m-en    ORIGINAL        HIGH   ['seed']
      m-syn   SYNDICATION_OF  MEDIUM ['titleSim=1.00','different-publisher']
      m-ko    TRANSLATION_OF  LOW    ['numbers=6.2,12','km=0']
  dg_n-other 뿌리=n-other 확신도=HIGH 매체=['apnews']

매체는 3곳 → 그러나 독립 출처는 2 다
```

SQL 에도 못을 박았다:
`independence_units integer not null default 1 check (independence_units = 1)`

## 6. 지시서 요구 테스트 10종 대조

| 지시서 요구 | 시험 | 결과 |
|---|---|---|
| same URL | `test_1_same_url` | 묶음 1 · basis `url-identity` |
| same content / different URL | `test_2_same_content_different_url` | 묶음 1 · `REWRITE_OF` HIGH · basis `content-identity` |
| Korean translation of English article | `test_3_korean_translation_of_english_article` | `TRANSLATION_OF` · **LOW** · 묶음 확신도도 LOW |
| English original + Korean translation | `test_4_root_is_the_earliest_not_the_english_one` | 뿌리 = **이른 쪽**. 영어를 원본으로 가정하지 않음(양방향 검사) |
| same article syndicated by another publisher | `test_5_syndicated_by_another_publisher` | `SYNDICATION_OF` · 전재 매체가 출처 목록에 **남아 있음** 확인 |
| headline-only rewrite | `test_6_headline_only_rewrite` | `REWRITE_OF` |
| updated article with new timestamp | `test_7_updated_article_with_new_timestamp` | 묶음 1 · 뿌리 = 먼저 것 |
| similar headline but different event | `test_8_similar_headline_but_different_event` | M5.1 vs M6.8 → **묶음 2** (숫자 불일치 거부) |
| conflicting locations | `test_9_conflicting_locations_are_recorded_not_merged` | 묶음 2 + `conflicts` 1건 (`km` 기록, `resolved:false`) |
| same event but different articles | `test_10_same_event_different_articles_stay_separate` | 묶음 2 — 이것을 합치는 것은 EVENT FUSION 의 일이다 |

추가 시험 11개: URL·제목 정규화, 숫자 추출(한/영), 창 밖 갱신 분리,
**아무것도 지워지지 않음**(4건 전부 색인에 남음), 계보 추적, 독립 출처 회계,
사건 id 부재, 관계 4종 준수, 빈 입력, 시각 없는 기사.

```
python -m pytest aws/_shared/tests/test_article_dedup.py -q
→ 21 passed
```

## 7. 원본을 지우지 않는다는 것의 의미

- 중복이 발견돼도 기사 행은 **전부 남는다**. 산출물은 `dedup_group_id`·`root_article_id`·
  `relation` 세 칸을 **붙이는** 것뿐이다.
- 번역본·전재본이 발견됐다고 그 **매체를 출처 목록에서 빼지 않는다.**
  `groups[].publishers` 에 3곳이 그대로 남고, 다만 독립 출처 계수에는 1로 들어간다.
- SQL 제약이 이를 강제한다: `earthus_article_lineage.article_id` 는 PK 이자
  `earthus_news_article` 의 FK 이고, 뿌리 관계는
  `(article_id = root_article_id) = (relation = 'ORIGINAL')` 로 고정된다.

## 8. 뿌리를 고르는 규칙과 그 한계

**발행이 가장 이른 기사**가 뿌리다. 시각이 같으면 `article_id` 순(결정적).
시각을 모르는 기사는 뒤로 보낸다 — 모르는 것을 가장 이른 것으로 대접하지 않는다.

⚠️ 언어로 고르지 않는다. "영어가 원본" 이라는 근거가 없고, 그렇게 고르면 우리 편향이
계보에 박힌다. `test_4` 가 양방향(영어 먼저 / 한국어 먼저)을 둘 다 검사한다.

⚠️ 한계: 발행 시각이 원작 시각과 다를 수 있다(전재가 원문보다 빠른 타임스탬프를 갖는 경우).
그때는 계보 방향이 뒤집힌다. 본문·저작 정보 없이 더 잘할 방법이 없어 그대로 둔다.

## 9. 조율해야 할 문턱 (실자료 측정 뒤 재검토)

지금 값은 저장소의 기존 문턱(`event-fusion.js` 0.62, `ingestion-cluster.js` 0.62)과
전재·재작성의 성질을 보고 정했다. **실자료로 측정한 값이 아니다.**

| 상수 | 값 | 재검토 근거가 될 측정 |
|---|---|---|
| `SYNDICATION_TITLE_SIM` | 0.80 | 통신사 기사와 구독 매체 제목의 실제 유사도 분포 |
| `REWRITE_TITLE_SIM` | 0.60 | 같은 매체의 갱신 기사 유사도 분포 |
| `TRANSLATION_KM` | 200 | 연합뉴스/Reuters 좌표 부여 정밀도 |
| `LOCATION_CONFLICT_KM` | 300 | gdelt `geoType` 별 좌표 오차 |
| 시간 창 72/72/48h | — | 전재·번역 지연의 실제 분포 |

## 10. 남은 것

1. **조립기 배선** — `roots()` 를 사건 결합에 넘기고 계보를 Postgres 에 적는다 (3G, BLOCKED)
2. **실자료 정확도 측정** — `events/global.json` · `events/regional-news.json` 으로
   오합치(false merge)·미합치(false split) 비율을 센다 (AWS 자격 필요)
3. **번역 판정 보강 여지** — 숫자가 없는 제목은 지금 판정 불가다. 지명 사전
   (`gdelt-events build_gazetteer`)을 `_shared` 로 옮기면 한·영 지명 대조를 붙일 수 있다.
   그 이동은 이번 범위에 넣지 않았다(동작 불변 보장을 위한 시험을 함께 만들어야 한다).
