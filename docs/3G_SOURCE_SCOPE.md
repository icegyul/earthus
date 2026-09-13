# 3G 입력 범위 — 결정 ⑦

작성 2026-09-13 · DESIGN ONLY · 코드 0줄 · AWS 쓰기 0건
정책 정본 → `docs/3G_POLICY_DECISIONS.md` §5

---

## 1. 결정 ⑦ (확정)

- 이번 3G 의 실제 입력은 **`events/global.json` 하나로 제한**한다
- 내부 API/schema 는 **source-agnostic** 하게 만든다
- 향후 adapter 대상: GDACS · USGS · KMA · 기타 기관 · satellite/event feeds
- **이번 3G 에서는 그것들을 live ingest 하지 않는다**
- 향후 단계에서 Multi-source Earth Event Federation 으로 확장한다

이유(사용자가 적은 것): 현재 실제 producer 가 `earthus-gdelt-30min` 하나이고,
`global.json` 의 유일 producer 가 확인됐고, 기존 validated pipeline 을 우선 활용하며,
여러 source 를 동시에 넣으면 Truth/independence 정책이 불필요하게 복잡해진다.

---

## 2. 입력의 실측 성질

| 항목 | 값 | 근거 |
|---|---|---|
| 생산자 | `aws/gdelt-events/handler.py:582-586` — **유일** | 저장소 전수 확인 |
| 주기 | `earthus-gdelt-30min` = `cron(5,35 * * * ? *)` ENABLED | 운영 `describe-rule` |
| 창 | `WINDOW_HOURS = 3` | `handler.py:150` |
| 사건 상한 | `MAX_EVENTS = 150` | `handler.py:152` |
| 잘림 표시 | `capped = len(merged) > MAX_EVENTS` | `handler.py:504-505` |
| 크기 | 99,366 B · events 150건 | 익명 HTTPS 읽기 |
| health 감시 | `everyMin 180 · graceMin 120` | `aws/health/handler.py:63-64` |

### 2.1 상한과 창이 3G 에 지우는 의무

**⑴ 잘림을 읽고 나서 쓴다.** 봉투의 `rules.cappedByLimit` 와 `counts` 는 입력이 150건에서
잘렸는지를 말하는 유일한 신호다. 잘린 입력을 "그날의 전부"로 취급하면 산출물이 거짓이 된다.
3G 는 이 값을 **읽어 산출물에 기록**한다.

**⑵ 사건이 매 회차 정당하게 빠진다.** 창 3시간 + 상한 150 이므로 어제 있던 사건이
오늘 파일에 없는 것이 정상이다. 따라서 색인을 **전체 교체하면 살아 있는 사건이 사라진다** —
읽어서 더하는 규율이 필수인 이유다(→ `3G_PUBLIC_PRIVATE_BOUNDARY.md` §5).

**⑶ 파일이 있다는 것이 신선하다는 뜻이 아니다.** health 감시가 주기(30분)보다 6배 느슨하므로
여러 회차를 건너뛰어도 감시를 통과한다. 3G 는 봉투의 `generated` 를 **직접 읽어** 신선도를 본다.

### 2.2 GDELT 는 이미 병합했다
사건에 `merged` · `outlets` · `sources` 가 있다. 즉 3G 가 보는 것은 **GDELT 병합 뒤의
대표 레코드**이고 원본 기사 전부가 아니다. `url` 1개와 `alt[]` 만 남는다.
독립 출처 계산에 미치는 영향은 → `3G_TRUTH_RULES.md` §2.4.

---

## 3. source-agnostic 이 뜻하는 것

내부 단계가 소비하는 **정규 레코드**를 정하고, GDELT 는 그 레코드로 옮기는 어댑터 하나를 갖는다.
향후 GDACS·USGS·KMA 는 같은 레코드를 만드는 어댑터를 추가하는 것으로 끝난다.

```
events/global.json ──[GDELT 어댑터]──┐
(향후) GDACS       ──[어댑터]────────┤
(향후) USGS        ──[어댑터]────────┼──→ 정규 레코드 ──→ dedup ──→ 결합 ──→ 판정 ──→ EarthEvent
(향후) KMA         ──[어댑터]────────┤
(향후) 위성 피드   ──[어댑터]────────┘
```

### 3.1 정규 레코드가 담아야 하는 축
값이 아니라 **축**을 정한다. 각 축의 필드 이름과 형식은 미결정이다(§6).

| 축 | 무엇 | GDELT 원천 | 향후 기관 출처에서 |
|---|---|---|---|
| 출처 식별 | 이 레코드가 어디서 왔는가 | `domain` · 파일 키 | 기관 id |
| 기사/문서 식별 | dedup 의 단위 | `url` · `alt[]` | 통보문 id |
| 사건 유형 | 무엇이 일어났는가 | `root`·`cameoRoot`·`eventCode` | 기관 분류 |
| 위치 | 어디서 | `lat`·`lon`·`place`·`country`·`geoType`·`featureId` | 기관 좌표·구역 |
| 위치 정밀도·의심 | 얼마나 확실한가 | `geoType` · `placeDoubt` | 기관 정밀도 |
| 시간과 정밀도 | 언제, 얼마나 정확히 | `ageMin` + 봉투 `generated` | 관측·발표 시각(EXACT) |
| 원천 등급 | `SOURCE_KIND` | NEWS (정본이 이미 분류) | OFFICIAL / OBSERVATION / SATELLITE |
| 교차검증 보조 | 진실 판정에 쓰지 **않는** 지표 | `score`·`mentions`·`outlets`·`sources`·`merged`·`status` | 기관 신뢰도 표기 |
| 원문 식별자 보존 | source-local id | `id`(GlobalEventID) | 기관 사건 id |
| 잘림·완전성 | 입력이 전부인가 | `rules.cappedByLimit`·`counts` | 페이지네이션 상태 |

⚠️ **필드 이름과 형식을 이 문서가 정하지 않는다.** 초안 과정에서 어휘를 만들어 넣은 것이
여러 건 있었고 전부 제거했다. 어댑터가 구현할 계약이므로 이름은 한 번 정하면 바뀌기 어렵다 —
구현 착수 승인과 함께 정하는 것이 맞다.

### 3.2 기사 본문은 담지 않는다
잠긴 계약이다 — `docs/EARTH_EVENT_CANONICAL_MODEL.md` §8 "기사 본문 미저장 · `content` 칸 미도입"
(`aws/regional-news/handler.py` 머리말이 근거). 정규 레코드에도 `content` 축이 없다.

---

## 4. 향후 adapter 후보 — 지금 무엇이 있고 무엇이 없는가

이번 범위가 아니므로 **설계하지 않는다.** 있는 것만 적는다.

| 후보 | 저장소 현황 | 어댑터가 메워야 할 것 |
|---|---|---|
| `events/regional-news.json` | `aws/regional-news/handler.py` 생산 | 좌표 유무를 확인해야 한다(미확인). `SOURCE_KIND=NEWS` 는 정본이 이미 분류 |
| GDACS | `aws/gdacs-tc/handler.py` — 태풍 피드. `events/gdacs-tc.json` | 사건 유형이 태풍에 한정. 이름 끝 `-26` 함정이 기록돼 있다 |
| USGS | `aws/quake-asia/handler.py` 계열 | 지진. 기관 사건 id 가 있어 `officialEventId` 경로가 열린다 |
| KMA | `aws/kma-warn` · `typhoon-official` 등 | `SOURCE_KIND=OFFICIAL`. `FACT` 도달 경로가 여기서 열린다 |
| 위성 | `events/wildfire.json`(FIRMS) 등 | `SOURCE_KIND=SATELLITE` |

⚠️ 위 표의 파일 경로는 저장소 목록에서 확인한 것이고, **각 산출물의 필드 모양은 확인하지 않았다.**
어댑터를 실제로 쓸 단계에서 하나씩 읽어야 한다.

---

## 5. 다중 출처가 independence 를 어떻게 바꾸는가

결정 ① 의 판정 우선순위 3순위가 `source type` 이다. 지금은 입력이 GDELT 하나이므로
모든 레코드의 `SOURCE_KIND` 가 `NEWS` 이고 **3순위가 사실상 작동하지 않는다.**

기관·관측·위성이 들어오면 달라진다:
- `SOURCE_KIND` 가 갈리므로 3순위가 실제로 unit 을 나눈다
- `FACT` 도달 경로가 열린다(`{OFFICIAL, OBSERVATION, SATELLITE}`)
- 같은 사건에 대한 기관 통보문과 뉴스 보도가 **서로 독립**으로 세어진다
- 기관 사건 id 가 있으면 결합이 id 일치로 확정된다(v11 `eventSimilarity` 의
  `OFFICIAL_ID_MATCH` 경로)

**이것이 결정 ⑦ 이 범위를 하나로 좁힌 이유다.** 위 네 가지가 동시에 들어오면
Truth 규칙과 independence 규칙을 한꺼번에 검증해야 하고, 어느 쪽이 틀렸는지 가리기 어렵다.

---

## 6. 미결정
1. 정규 레코드의 필드 이름과 형식(§3.1 의 10개 축 전부)
2. 봉투의 잘림·완전성 정보를 산출물에 어떤 이름으로 기록할지
3. `events/regional-news.json` 에 좌표가 있는지 (확인 필요)
4. 신선도 문턱 — 봉투 `generated` 가 얼마나 오래되면 거부할지
5. 3G 실행 주기와 health 감시 행 (`SCHEDULE = NOT_CREATED` 유지)
6. `global.json` 에서 이탈한 사건의 생애 — 창·상한으로 빠진 사건을 언제까지 색인에 남길지

## 7. 이 문서가 금지하는 것
- 이번 3G 에서 `global.json` 외의 출처를 live ingest 하는 것
- `global.json` 의 두 번째 생산자를 만드는 것
- 새 수집기(collector)를 만드는 것
- 잘린 입력을 잘렸다는 표시 없이 산출물로 내보내는 것
- 정규 레코드에 기사 본문 축을 더하는 것
