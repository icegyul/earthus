# EARTHUS STORAGE ARCHITECTURE — S3 · Postgres 역할 분담

작성 2026-09-13 · PHASE 2-3 · `earthus-v2/real-living-earth-render` @ `3c577d15`
선행 [V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md](V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md) ·
[EARTH_EVENT_CANONICAL_MODEL.md](EARTH_EVENT_CANONICAL_MODEL.md)

---

## 0. 결론 먼저

### 0.1 기존 계보를 보존한다 — REST 서버를 만들지 않는다

```
Lambda 배치(83종)  →  S3 JSON  →  CloudFront  →  브라우저가 직접 읽는다
```

이 구조는 선택이 아니라 **제약의 결과**다 (`prototype/js/config.js:78` 실측 기록):

> ⚠️ 현재 이 계정은 Lambda Function URL 의 공개 접근이 막혀 있다.
> 배포·정책은 정상인데 호출하면 403 AccessDeniedException 이 온다
> (기존 celestrak-proxy URL 도 같은 증상 — **계정 차원의 차단**이다).

`aws/news-brief/handler.py` 머리말도 같은 것을 적는다:

> 이 계정은 Lambda Function URL 익명 호출이 403 이다(조직 정책 추정).
> 구름·바람·산불처럼 "미리 만들어 S3 에 두고 앱이 파일을 읽는" 구조면 그 제약을 안 받는다.
> 부수 효과로 비용이 예측 가능해진다 — 사용자 수와 무관하게 회당 N건이다.

→ **사건·증거·문맥을 "API 로 노출"할 자리가 없다.** 배치가 계산해 S3 에 쓰고 앱이 읽는다.
쓰기가 필요한 것(승인·결제·회원)만 Supabase Edge Function 을 지난다.

### 0.2 역할 분담 (한 줄 요약)

| 저장소 | 역할 | 한 문장 |
|---|---|---|
| **S3 `archive/`** | 원자료 불변 보관 | 오늘 안 쌓으면 오늘의 지구는 영원히 없다 |
| **S3 공개 접두사** | 배치 산출물 = 제품 | 앱이 읽는 것. 캐시·brotli·엣지 |
| **Postgres (Supabase)** | 색인·관계·권한 | 그래프 순회와 조인이 필요한 것만 |
| **research-runtime SQLite** | 시뮬레이션 실행 원장 | 원장을 둘로 만들지 않는다 |

### 0.3 EarthEvent 원본 결정 (지시서 질문 A)

**원본은 S3 이고 Postgres 는 색인이다.**

> ⚠️ **2026-09-13 정정 — 경로와 색인 표 이름이 바뀌었다 (PHASE 3G 결정 ①).**
> 이 절은 전에 정본을 `events/earth-events.json` + `events/earth-events/<event_id>.json`,
> 색인을 `earthus_event_cluster` 로 적었다. 둘 다 더 이상 맞지 않는다.
>
> | | 옛 기술 | **현재 정본** |
> |---|---|---|
> | 사건 정본 | `events/earth-events/<event_id>.json` (공개) | `archive/earth-events/canonical/v1/event_id=<event_id>.json` (**PRIVATE**) |
> | 불변 원자료 | `archive/earth-events/dt=…/hh=…/part.jsonl.gz` | `archive/earth-events/raw/dt=YYYY-MM-DD/hh=HH/part-*.jsonl.gz` |
> | 색인 표 | `earthus_event_cluster` | `earthus_earth_event` |
>
> 바꾼 이유 셋:
> · `events/` 는 **익명 공개** 접두사다(`aws/_shared/publication_privacy.py` `BUCKET_PUBLIC_PREFIXES`).
>   조립 직후의 사건은 검토 전 초안이고, 거기 쓰면 검토 전에 공개된다.
>   배포 엔진에서 같은 구멍이 실제로 있었다 — 2026-09-13 실측, 후보 8건 중 7건이 익명 공개 대상.
> · 그래서 3G 산출물은 항상 `release_state='SHADOW'` 이고 `archive/`(PRIVATE) 아래에만 쓴다.
>   공개 승격은 3G 의 일이 아니다(결정 ⑨).
> · `earthus_event_cluster` 는 `aws/_shared/sql/20260913_earth_event_core.sql` 이 **존재 자체를
>   거부한다**(SCHEMA_CONFLICT) — 같은 것을 가리키는 두 설계를 함께 두면 사건 정본이 둘이 된다.

| 후보 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **S3 원본** | 기존 계보 그대로 · 앱이 바로 읽음 · CloudFront brotli·엣지 캐시 · CORS preflight 없음 · Function URL 403 제약 무관 · 비용 예측 가능 | 조인·그래프 순회 불가 · 부분 갱신 불가(파일 단위) | **채택** |
| Postgres 원본 | 조인·인덱스·RLS | 브라우저가 직접 읽으려면 anon 키 노출 + RLS 설계 · 읽기마다 비용 · 기존 앱 계보와 다름 · 정적 앱에 새 의존성 | 색인으로만 |

근거 보강: 사건은 **공개 자료**다. 개인정보가 없으므로 RLS 가 필요 없고,
그러면 Postgres 를 쓸 이유(권한 제어)의 절반이 사라진다.
남는 이유는 그래프 순회 — 그것만 Postgres 로 보낸다.

---

## 1. S3 — 실측 지형

### 1.1 버킷과 접두사 정책 (`aws/_shared/publication_privacy.py`, 2026-09-08 실측)

버킷 `earthus-cache-kr` (리전 `us-east-2`), CDN `earthus.net` (CloudFront).

```
의도된 공개 접두사 (PUBLIC_PREFIXES)
    events/  wind/  ocean/  reports/published/  clouds/  app/  solar/  celestrak/

버킷 정책의 현실 (BUCKET_PUBLIC_PREFIXES · aws s3api get-bucket-policy, Sid=PublicReadData)
    app/  celestrak/  clouds/  wind/  events/  ocean/  solar/  reports/published/

차이 (PUBLIC_PREFIX_GAP)  — 지금은 없음. INTEGRATION-9 에서 맞췄다

비공개 접두사 (PRIVATE_PREFIXES)
    archive/  analysis/  character-studio/
```

⚠️ 실측으로 배운 함정 3건 (기존 기록):
- `air/air.json` → **403**. 그래서 대기질이 `wind/` 아래에 산다.
- `gk2a/` → **403**. 그래서 천리안 타일이 `clouds/gk2a/` 아래에 산다.
- `reports/` → **403**. `reports/published/` 만 정책이 열린다.
- `analysis/aurora-reports.json` → **403**. LAB 보고서 원본은 비공개, 색인만 `ocean/` 에.

→ **새 접두사를 만들지 않는다.** 사건 산출물은 `events/` 아래에 둔다(이미 공개).

### 1.2 쓰기 경로 거버넌스 (`aws/_shared/write_policy.py`)

```
값 추적(write_path.py) → 목적지 접두사 → 허용 목록 대조(write_policy.py) → ALLOW / DENY
```

- **기본값은 거부다.** 모르는 목적지는 `DENY_UNKNOWN_PREFIX`.
  (INTEGRATION-6 에서 `check_public_write` 가 모르는 접두사에 열려 있었다 — 그 기본값을 뒤집었다.)
- `app/` (저장소 파일이 올라가는 곳) 은 파일별 허용 목록 `APP_WRITERS` 로 관리.
  목록 밖이면 `DENY_APP`.
- 자료 피드 접두사에 배포 스크립트가 쓰면 `DENY_FEED`.

→ 사건 조립기(`aws/earth-events/handler.py`)는 **`events/` 에 쓰지 않는다.**
정본 목적지는 `archive/earth-events/canonical/v1/` 이고(§0.3 정정), `archive/` 는 PRIVATE 이다.
조립기 안에 `assembler.assert_not_public(key)` 문이 있어 공개 접두사·모르는 접두사를 전부 거부한다
(`aws/earth-events/tests/test_boundary_and_write.py` 가 고정한다).
다만 `write-path-audit.py` 검사기가 새 쓰기 지점을 보고하므로 그 보고를 확인한다.

> ⚠️ **2026-09-13 정정.** 이 자리에는 전에 "조립기는 `events/` 에 쓰는 람다다 →
> `GENERATED`·`ALLOW_FEED` 로 통과한다"고 적혀 있었다. 그 문장을 그대로 구현하면
> 검토 전 사건이 익명 공개된다 — 그래서 결정 ①⑨ 이 목적지를 `archive/` 로 옮겼다.

### 1.3 불변 원자료 — `archive/` (`aws/archiver/handler.py`)

```
s3://earthus-cache-kr/archive/<dataset>/dt=YYYY-MM-DD/hh=HH/part.jsonl.gz
s3://earthus-cache-kr/archive/_manifest/dt=YYYY-MM-DD.json      그날 요약
s3://earthus-cache-kr/archive/_gaps/dt=YYYY-MM-DD.json          결측 기록
SCHEMA_VERSION = 1   (각 레코드에 `_v` 로 박힌다)
```

세 종류를 **섞지 않고** 쌓는다 — 이 구분이 이번 설계의 뼈대다:

| 종류 | 성질 | 저장 방식 |
|---|---|---|
| `event` | 한 번 일어나면 변하지 않는다 | id 로 중복 제거 |
| `observation` | 같은 대상의 값이 시간에 따라 변한다 | 매 시각 다 남긴다 |
| `forecast` | 아직 오지 않은 시각에 대한 값 | **관측과 절대 섞지 않는다** |

> 섞이면 예측값을 관측값으로 착각해 학습하게 된다 — 되돌릴 수 없는 오염이다.
> 그리고 이건 소급이 불가능한 유일한 종류다: 관측은 기관이 영구 보존하지만,
> **지나간 예보를 돌려주는 API 는 없다.**

설계 원칙(주석):
1. 원자료를 그대로 남긴다. 우리가 만든 라벨(신뢰도 점수 등)은 **별도 필드**로 붙이고 원본을 덮지 않는다
2. 스키마 버전을 박는다
3. Hive 파티션 → 나중에 Athena/Glue 가 코드 수정 없이 읽는다

→ 사건 조립기가 만드는 `earth_event` 도 **`archive/earth-events/` 에 같은 방식으로 쌓는다.**
공개 `events/earth-events.json` 은 그 파생 스냅샷이다.
판정 기준(`TRUTH_STATUS` 파생 규칙)이 바뀌면 `archive/` 에서 다시 계산한다.

### 1.4 공개 산출물 — 감시되는 58키

`aws/health/handler.py` 가 키마다 `everyMin`(기대 갱신 주기) · `graceMin`(유예)을 갖고 감시한다.
`health.json` 의 `late` 가 유일한 침묵 신호다 (KMA 허브 용량 초과 시 특보·AWS·부이가 한꺼번에 묵는다).

접두사별 분포 (실측 58키):
```
events/   17키   global.json · regional-news.json · kma-warn.json · typhoon-official.json
                 tsunami-intl.json · quake-asia.json · wildfire.json · world-alerts.json
                 crustal.json · lightning.json · volcanic-ash-vaac.json · push-tick.json …
wind/     24키   global.json · gts-global.json · air.json · kma-aws.json · ecmwf-fcst.json
                 kma-fcst.json · korea-air-obs.json · series/* · status/* …
ocean/     6키   buoys.json · kma-buoy.json · lab-reports.json · marine.json
                 cyclone-analog.json · obis-summary.json
clouds/    2키 · solar/ 1키 · celestrak/ 1키 · app/ 1키
archive/   3키   air-evidence/latest.json · social-drafts.json · vaac-validation/latest.json
```

⚠️ `events/global.json` 은 `everyMin 180 · graceMin 120`.
`events/regional-news.json` 은 `everyMin 30 · graceMin 60`.
사건 산출물의 SLA 는 이 둘보다 느릴 수 없다 (입력이 그 둘이므로).

### 1.5 캐시 정책 (실측 분포)

```
max-age=1800  18곳     max-age=600  10곳     max-age=300  9곳
max-age=900    8곳     max-age=3600  8곳     max-age=21600 5곳
max-age=180    4곳     max-age=86400 3곳     max-age=120   3곳
no-cache      13곳     private,no-store 10곳  no-store      3곳
```

사건 산출물 권고:
| 파일 | CacheControl | 이유 |
|---|---|---|
| `archive/earth-events/canonical/v1/event_id=<id>.json` (정본) | `no-store` | **PRIVATE**. 공개 캐시에 얹을 대상이 아니다 — 엣지가 초안을 들고 있으면 안 된다 |
| `archive/earth-events/raw/dt=…/hh=…/part-*.jsonl.gz` (원자료) | `no-store` | PRIVATE · 불변. 재계산용이고 앱이 읽지 않는다 |
| `events/context/<id>/<at>.json` | `public, max-age=86400` | 시각이 키에 있어 **불변**이다 |

> ⚠️ **2026-09-13 정정.** 이 표는 전에 `events/earth-events.json`(600초) ·
> `events/earth-events/<id>.json`(1800초) 를 권고했다. 두 키 모두 §0.3 정정으로 없어졌다.
> **공개 사건 파일은 아직 없다** — 공개 승격 경로가 정해지면 그때 이 표에 한 줄이 더해진다.
> 그전에 공개 캐시 권고를 적어 두면 없는 파일을 있는 것처럼 읽게 된다.

⚠️ 정적 `data/` 는 `max-age=86400` 으로 서빙된다.
그래서 셸이 렌더링하는 레지스트리는 전부 `js/` 의 얼린 ES 모듈이다
(`phenomenon-registry.js` 머리말). **사건 레지스트리를 `data/` 에 두지 않는다.**

---

## 2. Postgres (Supabase) — 실측 지형

### 2.1 적용된 마이그레이션 17개 · 테이블·뷰 19개

```
prototype/supabase/migrations/  15개
    20260811080000_member_invites          20260811080500_member_invite_trusted_write
    20260811081000_refund_preserves_invite 20260811090000_contentsdalur_admin
    20260814090000_aetherus_private_data   20260814193000_earthus_usage_analytics
    20260814194500_..._value_guard         20260814200000_..._privacy_version
    20260814201500_..._privacy_effective   20260820090000_tourism_flow_watch
    20260821120000_earthus_v8_forecast_private
    20260827090000_earthus_v2_membership_rbac  20260827193000_membership_precedence_fix
    20260827194500_provider_registry       20260908120000_tier_vocabulary_unification
supabase/migrations/  2개
    20260903_earthus_usage_counters        20260906_forme_funnel_events

테이블·뷰 19개
    admins · staff_roles · admin_audit_log · member_invites · member_access_audit
    analytics_events · usage_counters · usage_daily · forme_funnel_daily
    provider_registry · provider_credential_meta · provider_health
    earthus_forecast_revisions · earthus_forecast_release_audit
    aetherus_personal_universes · aetherus_personal_records · aetherus_observation_archives
    aetherus_privacy_events · aetherus_data_subject_requests · aetherus_deletion_receipts
```

**사건·기사·증거·주장·문맥·영향·시뮬레이션 테이블은 0개다.**

적용 방법: Supabase SQL Editor 에 파일을 그대로 붙여 실행 (`20260906` 머리말).
**자동 적용 파이프라인이 없다.** `supabase/.temp/linked-project.json` 만 있다.

### 2.2 개인정보 규칙 (기존, 이번 설계가 따른다)

`20260903_earthus_usage_counters.sql` 머리말이 정한 것:
- `user_id` 없음 · session 없음 · IP 없음 · properties 없음
- 저장하는 것은 (날짜, 허용된 이벤트명, 횟수) 뿐
- 익명 클라이언트는 표에 직접 못 쓴다. **허용 목록을 검사하는 RPC 만** 실행
- 한계를 함께 적는다: "이용자 수"가 아니라 "행동 횟수"다

→ 사건 표에는 개인정보가 없다(공개 자료). RLS 가 필요한 사건 표는 없다.
사용자별 관심 사건(FOR ME)을 저장한다면 그때는 `earthus_user_context_v2` 방식
(`auth.uid() = user_id` 정책)을 따른다 — v11 DDL 초안에 이미 있다.

### 2.3 미적용 DDL 초안 3개

| 파일 | 테이블 |
|---|---|
| `prototype/js/earthus2/v07/postgres/20260826_v07_backend_metadata_contract.sql` | 메타데이터 계약 |
| `prototype/js/earthus2/v10/postgres/20260826_v10_backend_closed_loop.sql` | 닫힌 고리 |
| `prototype/js/earthus2/v11/postgres/20260826_v11_advanced_intelligence.sql` | **19테이블** (아래) |

v11 19테이블 중 이번에 쓰는 것은 **4개**:
```
✓ earthus_evidence_node          ✓ earthus_evidence_edge
✓ earthus_event_cluster          ✓ earthus_event_cluster_member
— earthus_intelligence_feature_value · earthus_travel_discovery_result
— earthus_travel_best_window · earthus_pollution_event · earthus_pollution_transport_run
— earthus_public_action_event · earthus_memory_signature · earthus_memory_match
— earthus_intelligence_model · earthus_forecast_ground_truth · earthus_calibration_metric
— earthus_intelligence_release · earthus_user_context_v2
— earthus_intelligence_pilot_measurement · earthus_intelligence_release_audit
```

나머지 15개는 이번 범위 밖이다. **필요해질 때 떼어 온다.**
전부 한꺼번에 적용하면 쓰이지 않는 표 15개가 생기고, 그 표들이 "구현됐다"로 읽힌다.

---

## 3. 도메인별 배치 결정

| 도메인 | 원본 | 색인/보조 | 근거 |
|---|---|---|---|
| `earth_event` | **S3** `archive/earth-events/canonical/v1/event_id=<id>.json` (PRIVATE · 상세+타임라인) | Postgres `earthus_earth_event` | §0.3 (2026-09-13 정정) |
| 불변 원자료 | **S3** `archive/earth-events/raw/dt=YYYY-MM-DD/hh=HH/part-*.jsonl.gz` | — | §1.3. 판정 기준이 바뀌면 여기서 재계산 |
| `news_article` | **S3** `events/global.json` · `events/regional-news.json` · `events/briefs.json` (기존 파일 그대로) | Postgres `earthus_news_article` (기사↔사건 조인용, 본문 칸 없음) | 기존 수집기 3종을 고치지 않는다 |
| `source` | **코드 + DB** `provenance.DATASET_PROVENANCE`(S3키→provider·license·collector) + `provider_registry`·`provider_health` | — | `provenance.py` §68: **새 출처 레지스트리 금지** |
| `evidence` / `evidence_edge` | **Postgres** `earthus_evidence_node` / `earthus_evidence_edge` | — | `trace()` 그래프 순회(BFS, maxDepth 6)가 필요. JSON 파일로는 못 한다 |
| `claim` | **Postgres** | — | 게이트 판정(`allowed`/`missing[]`) 이력을 남겨야 한다 |
| `event_relation` | **Postgres** | — | 그래프 조회 · `unique(from,to,type)` 제약 필요 |
| `event_timeline` | **S3** (사건 상세 파일 안 배열) | Postgres 색인(선택) | 사건 상세를 한 번에 읽는 것이 앱에 유리. 줄 수가 적다 |
| `context_snapshot` | **S3** `events/context/<event_id>/<captured_at>.json` (불변) | Postgres 포인터 행 | 자료량이 크다. 시각이 키에 있어 불변 → `max-age=86400` |
| `impact_assessment` | **Postgres** | — | 행이 적고 조인 필요. **계산기 생길 때까지 표 생성 보류** |
| `simulation_run` | **research-runtime SQLite** (실행 원본) · **S3** (tsunami-eta·lab-events 산출물) | Postgres `earthus_simulation_run_link` (사건↔실행 조인) | 원장을 둘로 만들지 않는다 |
| 발행 후보 | **S3** `events/distribution-content.json` + `events/distribution-content/<id>.json` (기존) | — | `distribution/handler.py`: "새 저장 계보를 만들지 않는다" |
| 비공개 세션 원문 | **S3** `archive/` | — | LAB 세션·SNS 초안 |

### 3.1 왜 증거만 Postgres 인가

`EvidenceGraph.trace(id, {maxDepth:6})` 는 노드에서 6단계까지 양방향 BFS 를 한다.
JSON 파일로 하려면 전체 그래프를 매번 내려받아야 한다.
증거 노드는 사건마다 수십~수백 개이고 누적되므로 파일이 계속 커진다.
→ 재귀 CTE 로 같은 결과를 내는 것이 옳다.

반대로 **사건 색인은 파일이 맞다.** 앱이 지구를 그릴 때 "지금 활성 사건 전부"를
한 번에 받아야 하고, 그것은 조인이 아니라 스냅샷이다.

---

## 4. 데이터 흐름 (전체)

```
① 수집 (기존 Lambda 83종, 손대지 않는다)
   GDELT CSV · 지역 RSS · GDACS · USGS · KMA/JMA · FIRMS · Argo · SWPC · …
                  │
                  ├──→ S3 공개 접두사   events/ wind/ ocean/ clouds/ solar/ celestrak/
                  └──→ S3 archive/      원자료 불변 (event/observation/forecast 분리)

② 조립 (신규 Lambda 1개: aws/earth-events/handler.py)
   읽기:  events/global.json · events/regional-news.json · events/briefs.json
          events/gdacs-tc.json · events/quake-asia.json · events/kma-warn.json
          events/tsunami-intl.json · events/wildfire.json · ocean/lab-reports.json
          ocean/tsunami-eta.json (시뮬 연결)
   9단계: INGEST → NORMALIZE → DEDUP → GEOLOCATE → EVENT MATCH
          → CLAIM → EVIDENCE → VERIFICATION → PUBLISH
   쓰기:  S3  events/earth-events.json           max-age=600
          S3  events/earth-events/<id>.json      max-age=1800
          S3  archive/earth-events/dt=…/hh=…     불변
          PG  evidence_node/edge · claim · event_relation · 색인

③ 문맥 (사건이 생긴 뒤, 같은 배치 또는 별도)
   읽기:  event-room.js SRC 6종 + live-layers.js 자료표
   쓰기:  S3  events/context/<id>/<at>.json      max-age=86400 (불변)
          PG  context_snapshot 포인터

④ 읽기 (앱)
   V1 Cesium   layers/events.js · eventfocus.js · brief.js
   V2 Three    intel-feed.js · event-room.js · report-center.js
   V3 종이      (사건 계보 없음 — 이번 범위 밖)
   전부 S3 를 직접 읽는다. earthus.net 에서 열면 같은 출처 → CORS preflight 없음 + brotli

⑤ 발행 (기존, 자동 아님)
   aws/distribution/sources/ 에 뉴스 어댑터 추가 → eligibility → validation
   → publish_queue → 사람 승인(social-admin) → executor → verify_live → archive
```

---

## 5. 조정 제안 — 기존 구조가 더 적합한 3건

지시서의 기본안과 실측이 다른 곳이다. 근거와 함께 제안한다.

### 5.1 "raw ingestion 은 S3" → **이미 있다. 새로 만들지 않는다**

지시서: S3 가 raw ingestion 을 맡는다.
실측: `aws/archiver/handler.py` 가 이미 그 일을 하고 있고, **event/observation/forecast 를
섞지 않는 규칙**까지 갖고 있다. Hive 파티션이라 Athena/Glue 가 바로 읽는다.
→ 새 raw 계층을 만들지 않고 `archive/earth-events/` 를 그 안에 추가한다.

### 5.2 "article metadata 는 Postgres" → **원본은 S3, Postgres 는 조인표만**

지시서: 기사 메타데이터를 Postgres 에.
실측: 기사는 이미 `events/global.json`(GDELT) · `events/regional-news.json`(RSS) 두 파일에 있고,
V1·V2 화면이 그 파일을 직접 읽는다. 수집기를 Postgres 쓰기로 바꾸면:
- Lambda 3종에 DB 자격증명이 필요해진다 (지금은 S3 권한만)
- 앱이 기사를 읽으려면 anon 키 + RLS 가 필요해진다
- `events/regional-news.json` 을 읽는 화면 3곳이 깨진다

→ **원본은 파일로 남긴다.** Postgres 에는 `article_id ↔ event_id ↔ dedup_group_id` 조인만 둔다.
그 조인이 없으면 "이 사건에 붙은 기사 목록"을 파일 전수 스캔으로 구해야 한다.

### 5.3 "simulation run metadata 는 Postgres" → **원장은 research-runtime, Postgres 는 링크만**

지시서: 시뮬레이션 실행 메타데이터를 Postgres 에.
실측: `research-runtime/store.py` 가 SQLite 원장(`objects`, `submissions`)을 갖고 있고,
거기에 idempotency key · 취소 · 재시작 후 중단 표시가 묶여 있다.
Postgres 에 같은 것을 두면 **진실이 둘이 된다** — 어느 쪽이 실행됐는지 두 곳을 봐야 한다.

→ Postgres `earthus_simulation_run_link` 는 `(event_id, runtime, runId, modelId, modelVersion,
status, outputRef)` 만 둔다. 실행 상세는 원장에서 읽는다.

---

## 6. 확장 한계 — 지금 알아야 하는 것

| # | 한계 | 지금 수 | 걸리면 생기는 일 | 대응 |
|---|---|---|---|---|
| 1 | 사건 색인 파일 크기 | `events/global.json` 최대 150사건 (`MAX_EVENTS`) | 사건이 수천이면 파일이 MB 급 | 활성 사건만 색인, 종료 사건은 `archive/` + 월별 파일 |
| 2 | `events/` 파일 수 | 사건별 파일이 사건 수만큼 | S3 는 문제없음. CloudFront 무효화 비용 | 무효화 대신 `max-age` 로 관리 (기존 방식) |
| 3 | KMA 허브 일일 용량 | 키 하나를 Lambda 15개가 공유 | 초과 403 → 특보·AWS·부이 동시 침묵 | **새 수집 Lambda 를 만들지 않는다.** 기존 S3 산출물만 읽는다 |
| 4 | S3 403 (색인 없는 키) | `ocean/tsunami-eta/*` 전례 | 파일을 찔러 보면 403 | 색인을 먼저 읽고 있는 것만 받는다 (`etaIndexHas()` 패턴) |
| 5 | Postgres 무료 한도 | Supabase 프로젝트 1개 | 증거 노드가 누적되면 용량 | `archive/` 에 원본이 있으므로 오래된 증거는 지우고 재계산 가능 |
| 6 | `s3:DeleteObject` 권한 없음 | `events/social-drafts.json` 구멍이 아직 남아 있다 (`publication_privacy.py` 기록) | 잘못 쓴 객체를 지울 수 없다 | **쓰기 전에 접두사를 확인한다.** 되돌릴 수 없다 |
| 7 | Versioning OFF · Object Lock 없음 | (기존 기록) | 덮어쓰면 이전 판이 사라진다 | 불변이어야 하는 것은 **키에 시각을 넣는다** (`archive/` · `events/context/<id>/<at>.json`) |

---

## 7. 필요한 변경 목록 (PHASE 3)

| # | 대상 | 종류 | 내용 |
|---|---|---|---|
| S1 | `events/earth-events.json` · `events/earth-events/<id>.json` | 신규 S3 키 | 기존 공개 접두사 안. 버킷 정책 변경 불필요 |
| S2 | `archive/earth-events/dt=…/hh=…/part.jsonl.gz` | 신규 S3 키 | `archiver` 규약 그대로 (`_v` 스키마 버전 포함) |
| S3 | `events/context/<event_id>/<captured_at>.json` | 신규 S3 키 | 불변 · `max-age=86400` |
| S4 | `aws/_shared/provenance.py DATASET_PROVENANCE` | 확장 | 새 키 3종을 추가 (provider·license·collector·truthType·coverage·cadence) |
| S5 | `aws/health/handler.py` 감시 목록 | 확장 | `events/earth-events.json` 을 `everyMin 180 · graceMin 120` 로 추가 |
| P1 | 마이그레이션 SQL 1개 | 신규 | `EARTH_EVENT_CANONICAL_MODEL.md` §7 M1~M4. `release_state default 'SHADOW'` |
| P2 | `earthus_impact_assessment` | **보류** | 계산기 생길 때까지 만들지 않는다 |

검사기:
- `aws/_shared/tests/` 에 새 S3 키가 `PUBLIC_PREFIXES` 안인지 검사하는 시험 추가
- `write-path-audit.py` 보고에 새 쓰기 지점이 `ALLOW_FEED` 로 나오는지 확인
- `tools/test_n1_watch_coverage.py` 감시 목록에 새 키 반영

---

## 8. 금지 규칙

| # | 금지 | 이유 |
|---|---|---|
| 1 | 새 S3 접두사 생성 | 버킷 정책이 안 열려 있으면 익명 GET 403. 실측 전례 4건 |
| 2 | `analysis/` 에 공개 산출물 쓰기 | 403 (비공개 접두사) |
| 3 | 기사 본문을 어디든 저장 | 저작권 (`regional-news` 머리말) |
| 4 | 예보와 관측을 같은 파일·표에 섞기 | 되돌릴 수 없는 학습 오염 (`archiver` 머리말) |
| 5 | 원자료에 우리 라벨을 덮어쓰기 | 판정 기준이 바뀌면 재계산 불가 (`archiver` 설계 원칙 ①) |
| 6 | 사건 레지스트리를 `data/` 에 두기 | `max-age=86400` + git 추적 2경로뿐 (`phenomenon-registry.js` 머리말) |
| 7 | 새 수집 Lambda 로 KMA 허브 호출 | 일일 용량 공유 → 동시 침묵 |
| 8 | Postgres 를 브라우저가 직접 읽게 하기 | anon 키 + RLS 설계가 필요. 사건은 공개 자료라 파일이 맞다 |
| 9 | 시뮬레이션 원장을 Postgres 에 복제 | 진실이 둘이 된다 |
| 10 | 불변이어야 하는 것을 같은 키에 덮어쓰기 | Versioning OFF · Object Lock 없음 → 이전 판 소멸 |
