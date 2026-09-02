# 지표 계보 하드닝 — MAX_PC 근거 · 채널 대칭성 · CDM 규격 현실성

> 작업일: 2026-09-02 · 방식: 적대 검증(10개 선택지 × 3관점 독립 심사 + 병합) 후 전 주장 file:line 재현
> 선례: [P5 Benefit 위장 적발](P5_BENEFIT_AUDIT_VERDICT.md), [엔진 적대 감사](ENGINE_ADVERSARIAL_AUDIT_2026-09-01.md)

## 배경 — 로드맵 질문이 결함 조사로 바뀐 경위

"공개 데이터만으로 Pc 대안을 어떻게 마련할 것인가"를 검토하던 중, 유력 후보였던
**CelesTrak SOCRATES MAX_PROB 수집이 잠복 결함의 방아쇠**임이 드러났다. 즉
권고안 자체가 결함을 발화시키는 순서였다. 착수 순서를 바꾸고 결함을 먼저 고쳤다.

## 결함 1 — MAX_PC 상태를 값의 존재로부터 추론 (계보 위조)

`backend/conjunction/service.py:589` (수정 전):

```python
"status": "COMPUTED" if row["max_pc"] is not None else "NOT_COMPUTED"
```

바로 네 줄 위 PC 채널은 저장된 `pc_status`를 그대로 통과시킨다(`service.py:580-585`).
MAX_PC 만 추론했고, 그 추론은 언제나 **우리에게 유리한 방향**이었다.

원인은 스키마다. `migrations/001_initial_schema.sql:144-145` 가 `max_pc`, `max_pc_method`
는 주었으나 `max_pc_status` 는 주지 않았다. 없는 컬럼을 코드가 메웠다.

**발화 조건**: 외부 스크리닝 지표가 컬럼에 들어오는 순간. 제3자가 계산해 공표한 값이
"Aetherus가 계산함"으로 모든 API 클라이언트에 보고된다. 절대규칙 *계보 보존* 위반.

**당시 실측**: `max_pc IS NOT NULL` **0건**, `pc_status='COMPUTED'` **0건**
(NOT_COMPUTED 44,858 / NULL 30). 잠복이었고 아직 발화하지 않았다.

### 조치

`migrations/016_max_pc_basis.sql`:

| 컬럼 | 뜻 |
| --- | --- |
| `max_pc_basis` | `COMPUTED_INTERNAL` / `OBSERVED_EXTERNAL` / `ASSUMED_FAMILY` |
| `max_pc_status` | `COMPUTED` / `OBSERVED` / `ASSUMED` / `NOT_COMPUTED` / `BASIS_UNRECORDED` |
| `max_pc_artifact_id` | 값을 실어온 원본 아티팩트 (궤도해 아티팩트와 별개일 수 있음) |

DB 제약 4건이 최종 방어선이다. 값이 있으면 근거가 있어야 하고(`needs_basis`),
외부 관측값은 아티팩트가 있어야 한다(`needs_artifact`).

코드(`_max_pc_channel`)는 저장 상태를 통과시키되, **근거와 모순되는 저장 상태는
따르지 않는다** — `COMPUTED` 는 `COMPUTED_INTERNAL` 일 때만 허용된다.

### 부수 발견 — append-only 트리거가 옳았다

기존 행을 `max_pc_status='NOT_COMPUTED'` 로 백필하려 했으나 트리거가 거부했다:

```
conjunction_snapshot is append-only; refreshes must INSERT a new snapshot
```

**트리거를 우회하지 않았다.** 과학 기록을 사후에 고쳐 쓰는 것은 이 프로젝트가
막으려는 바로 그 행위다. 백필은 불필요하기도 했다 — 기존 행의 `max_pc` 가 전부
NULL 이므로 소급 판정할 값 자체가 없다.

## 결함 2 — 부재 채널이 0.0 으로 취급되어 이득이 날조됨 (특허 청구항 직하)

`backend/benefit/models.py:183` (수정 전)의 `object_risk` 는 맨 `sum()` 이라
해당 채널 간선이 하나도 없으면 **0.0** 을 반환했다. `backend/benefit/graph.py:335-337`
은 그 값을 조건 없이 뺐다.

두 그래프가 같은 경로로 만들어지는 동안은 안전하다. 그러나 실제로는 다르다 —
`backend/benefit/physical.py:327-331` 은 물리 재계산 반사실 행마다 `pc`/`max_pc` 를
None 으로 고정한다(그 자체는 정직하며 `COVARIANCE_MISSING_PUBLIC_GP` 사유까지 남긴다).

따라서 기준선에 실제 PC 간선이 하나라도 생기면:

```
benefit = 실제값 − 0.0 = 실제값 전량
```

이 값이 **"이 파편을 제거하면 충돌확률이 이만큼 사라진다"** 로 공표된다.
개입이 만들지 않은 변화를 개입에 귀속하는 것이며, 절대규칙 *없는 데이터는
UNAVAILABLE, 결코 0 아님* 위반이다. 위치가 특허 청구항 바로 아래다.

### 조치

#### 첫 시도는 틀렸다 — 판별 기준을 정정했다

처음에는 `object_risk` 가 채널 부재 시 `None` 을 반환하게 하고, 두 그래프 중
한쪽에만 있는 채널은 빼지 않도록 했다. **이것이 정당한 이득까지 막았다.**

`test_ben001_direct_benefit_and_provenance` 가 `KeyError: 'PC'` 로 실패하며 드러났다.
그 시나리오에서 반사실에 PC 간선이 없는 이유는 **개입이 그것을 지웠기 때문**이다.
제거된 물체가 유일한 PC 간선을 들고 있었다면, 제거는 실제로 그 위험을 없앤 것이고
전액 이득이 **정답**이다. 테스트가 옳았고 내 판별자가 두 경우를 뭉갰다:

| | 반사실에 채널이 없는 이유 | 올바른 처리 |
| --- | --- | --- |
| **(a)** | 재계산 경로가 그 채널을 **애초에 만들 수 없음** | 비교 불가 → INSUFFICIENT_DATA |
| **(b)** | **개입이 그 간선들을 지움** | 전액 이득 (정답) |

관측이 아니라 **능력**으로 판별해야 한다. 간선 삭제(IDEALIZED)는 Gs 를 G0 에서
파생시키므로 모든 부재가 개입의 결과다. 물리 재계산은 공분산 없는 공개 GP 를
전파하므로 **구조적으로 PC·MAX_PC 를 만들 수 없다** — 여기서만 결함이다.

#### 최종 조치

- `RiskGraph.has_channel()` / `channels()` 신설
- `object_risk` 는 그대로 `float` — 간선을 잃은 객체의 0.0 은 **측정된 결과**다
- `PHYSICAL_RECOMPUTE_CHANNELS = frozenset({"CONJUNCTION_EXPOSURE"})` — 물리 경로가
  무엇을 만들 수 있는지 코드에 선언
- `attribute_direct_beneficiaries(..., counterfactual_channels=None)` —
  `None` 이면 간선 삭제 의미(기준선 채널과 동일), 물리 경로는 위 집합을 넘긴다
- `channel_parity_warnings(..., counterfactual_channels)` 가 거부 사유를 기록 →
  실행의 `warnings_json` 에 적재
- `backend/benefit/protect.py` 의 뺄셈 3곳은 `comparable_metrics()` 로 필터하고,
  `excluded_metrics` 를 결과에 **빈 리스트일 때도 실어** 조용한 누락과 구분한다

판별을 `object_risk` 에서 귀속 계층으로 옮긴 것이 핵심이다. 0.0 이 의미 있는지는
반사실이 **어떻게 만들어졌는지** 알아야 답할 수 있고, 그 정보는 두 그래프가 만나는
지점에만 있다.

## 결함 3 — Pc 엔진 검증이 자기순환

`tests/fixtures/cdm/tracss_spec_example_cdm_valid.json` 은 자신의 note 에
*"6x6 공분산 행렬은 이 픽스처를 위해 구성한 합성 검증값"* 이라고 적어두었다.
정직하게 밝힌 것은 잘한 일이다. 문제는 **그것이 무엇을 증명하는가**이다.

이 픽스처는 JSON · 6x6 중첩 · TEME · km2 — **우리 파서와 Pc 게이트가 요구하는
바로 그 규약**이다. Pc 엔진이 통과시킨 유일한 공분산은 엔진에 맞춰 만든 것이었다.

### 실측 — 규격 형태 문서는 5개 관문에서 죽는다

`tests/fixtures/cdm/ccsds_508_kvn_shaped.txt` (CCSDS 508.0-B-1 **구조**로 구성,
수치는 무의미)를 실제로 통과시켜 기록했다:

| # | 관문 | 우리 요구 | 실제 CDM | 근거 |
| --- | --- | --- | --- | --- |
| 1 | 인코딩 | JSON | **KVN 또는 XML** | `cdm.py:61` |
| 2 | 공분산 형태 | 6×6 중첩 리스트 | 21원소 하삼각 | `cdm.py:25` |
| 3 | 프레임 | `TEME` | **RTN** | `pc.py:72` |
| 4 | 단위 | `KM2` | **m\*\*2** | `pc.py:22` |
| 5 | HBR 의미 | `COMBINED_HBR` | 규격 외 전달 | `pc.py:154` |

관문 3·4 는 `covariance_check` 를 직접 호출해 거부를 확인했다(관문 1이 파서 진입을
막으므로). **필요한 정보는 문서에 다 있다** — 읽지 못하는 것이 우리 문제다.

### 조치

- 기존 픽스처에 `shape_class: ENGINE_SHAPED` 명시 — 후속 독자가 규격 증거로 오인하지 않도록
- `tests/unit/test_cdm_spec_shape_reality.py` 9건: **현재 동작을 그대로 기록**한다.
  희망사항이 아니라 격차의 지도다. 격차가 메워지면 이 테스트들이 실패하며, 그것이 신호다.
- 자기순환 부재 불변식 명문화: 외부 문서에서 온(`source_uri` + `content_sha256`)
  Pc 골든 픽스처가 **하나도 없다**. 이 부재가 관문 3·4 를 오래 가린 이유다.

## 판정에 미치는 영향

| 항목 | 이전 | 이후 |
| --- | --- | --- |
| 운영 Pc | "TraCSS CDM 없이는 불가" | **파트너 이전에 내부 관문 5개가 먼저 막고 있음** |
| 파트너 영업 | 다음 단계로 검토 | **보류** — 우리가 만들지 않은 문서로 `compute_pc` 가 COMPUTED 를 낼 때까지 |
| SOCRATES 수집 | 2순위 권고 | 결함 1·2 완료 후로 이동 (완료됨) |

엔터프라이즈 티어의 전제조건은 **전부 파트너와 무관한 내부 작업**이었다.
이것이 "공개/엔터프라이즈 제품 분리"보다 "각 체크에 `blocker_class` 부여"가
옳은 처방인 이유다.

## 검증

- 신설 정직성 테스트: MAX_PC 근거 9건 + 채널 대칭성 8건 + CDM 규격 현실성 9건 = **26건**
- 각 결함이 재발하면 실패한다. 결함 1·2 의 테스트는 **수정 전 코드에서 먼저 실패시켜**
  가드레일이 실재함을 확인한 뒤 고쳤다.

## 미조치

1. **CCSDS KVN/XML 파서와 RTN→TEME 회전**: 관문 1~4 를 여는 실제 작업. 데이터 출처와
   무관하게 영구적으로 유효하다.
2. **외부 출처 Pc 골든 픽스처**: TraCSS 공개 검증 데이터셋(CC0, Google Drive 접근 필요,
   20.7GB)이 후보. 자기순환을 끊는 유일한 방법이다.
3. `pc_status` NULL 30건의 출처 미확인 — 나머지 44,858건은 NOT_COMPUTED.

## 결함 4 — 2차 비용이 테스트와 API 양쪽을 멈추게 하고 있었다

우주쓰레기 2,851개를 넣으면서 근접 스크리닝 쌍이 약 200만으로 늘었다. 쌍 수는
모집단의 **제곱**으로 증가하는데, 호출부 어디에도 모집단을 한정할 방법이 없었다.

### 실측 (2026-09-02)

| 모집단 | 쌍 | 소요 | 이벤트 |
| --- | --- | --- | --- |
| 6객체 (범위 지정) | 6 | **0.01s** | — |
| 150객체 | 10,878 | **11.5s** | 12 |
| 400객체 | 79,003 | 100.4s | 98 |
| 800객체 | — | 400s 초과 | — |
| 전 카탈로그 | 약 2,000,000 | 약 40분 | — |

2.7배 모집단이 8.7배 시간(2.7²=7.2에 근접) — 2차 증가가 그대로 확인된다.

### 파급 1 — 테스트

P5/P6 테스트는 6객체 합성 코퍼스를 심어놓고 **전 카탈로그를 스크리닝한 뒤 결과에서
자기 코퍼스만 골라냈다**(`test_p5_physical_counterfactual.py:137-138`). 전체를 계산할
이유가 없었다.

`test_conjunctions_api.py` 의 `_screened_once` 는 **함수 스코프**여서 10개 테스트마다
전 카탈로그를 다시 돌렸다.

### 파급 2 — 운영 API (이쪽이 더 중요하다)

`backend/main.py` 의 `POST /v1/conjunctions/screen-runs` docstring 은 이렇게 적고 있었다:

> *"실제 저장 카탈로그는 설정으로 제한되므로 이 라우트는 동기 실행한다"*

**우주쓰레기 수집이 이 전제를 깼다.** 202를 반환하면서 실제로는 수십 분간 워커를
점유한다. 테스트 지연이 아니라 운영 결함이었고, 테스트가 그것을 드러냈다.

### 조치

- `load_screenable_solutions(max_objects, catalog_ids=None)` — 모집단을 명시 집합으로 한정
- `run_screening(..., catalog_ids=None, max_objects=None)` — 집합 지정과 개수 상한을 분리
  (호출자가 어떤 객체인지는 몰라도 얼마나 감당할 수 있는지는 아는 경우가 있다)
- 응답의 `coverage` 블록이 `FULL_CATALOGUE` / `CATALOG_SUBSET` 을 기록한다 —
  **부분 스크리닝 결과가 전 카탈로그 커버리지로 오독되면 안 된다**
- `screen-runs` 엔드포인트에 `max_objects` 질의 파라미터 추가 (기본값 불변, 하위 호환)
- Benefit 반사실 재계산 3곳에 `catalog_scope` 배선

**건전성 조건을 코드에 명시했다**: REMOVE 는 물체를 지울 뿐이라 간선을 만들 수 없으므로
기준선 모집단을 덮는 범위면 충분하다. 그러나 **SUBSTITUTE·OCM 은 물체를 새 궤도로 옮겨
범위 밖 객체와 새 간선을 만들 수 있다** — 그런 실행에 범위를 좁히면 기동이 새로 만든
위험을 PROTECT 가 과소보고한다. 보장할 수 없는 호출자는 None 을 넘겨 전 카탈로그를 쓴다.

### 부수 효과 — 테스트 격리

기존 P5/P6 는 **개발 DB 에 무엇이 들어있느냐에 따라 결과가 달라졌다**. 통과해도 의미가
약했다는 뜻이다. 범위 지정으로 자기 코퍼스만 보게 되어 격리가 확보됐다.

`test_conjunctions_api.py` 는 모듈 스코프 + 150객체로 바꾸되, 픽스처가 **이벤트가 실제로
생성됐는지 단언**한다. 여러 테스트가 이벤트를 순회하는데 이벤트가 0이면 루프가 공회전하며
조용히 통과하기 때문이다.

### 결과

| 대상 | 이전 | 이후 |
| --- | --- | --- |
| P5+P6 (6건) | 40분 초과 타임아웃 | **12s** |
| 근접 API 계약 (10건) | 40분 초과 타임아웃 | **16s** |

## 미조치 (추가)

4. **`screen-runs` 는 여전히 동기 실행이다.** `max_objects` 는 경계일 뿐 해결이 아니다.
   202 를 반환하는 라우트는 작업 큐 위로 옮겨야 한다.
5. **`tests/integration/test_browser_e2e_external_mode.py` 실패는 기존 결함**이다.
   이번 변경 전 코드(백엔드 stash 상태)에서도 동일하게 `ImportError: cannot import name
   'run_browser_e2e' from 'scripts'` 로 실패함을 확인했다. 원인은 `scripts` 패키지 해석이며
   이번 작업 범위 밖이다.

## 결함 5 — 통합 테스트가 공유 개발 DB 를 오염시킨다 (성능 수정이 드러낸 기존 결함)

`tests/integration/test_science_bridge.py::test_catalog_returns_real_debris_not_validation_fixtures`
가 실패한다. 원인은 이번 작업의 코드 변경이 아니라 **공유 개발 DB 의 누적 오염**이다.

### 실측

`backend/explore/repository.py:catalog_rows` 는 `ORDER BY os.epoch DESC` 로 정렬한다.
통합 테스트가 만드는 픽스처 객체는 **생성 시각을 에폭으로 삼기 때문에** 실제
CelesTrak/Space-Track GP 데이터보다 항상 앞선다. 그리고 실행마다 새로 만들어진다:

| 이름 | 중복 수 |
| --- | --- |
| PROV DEB E/F/G | 각 15 |
| PROV DEB A~D | 각 14 |
| LEGACY O | 11 |
| (합계 PROV/LEGACY/PHYS/TEST DEB/ESTABLISHED) | **231** |

전부 2026-09-01 생성 — 이번 세션의 반복 테스트 실행으로 쌓였다. 그 결과 최신 200건이
픽스처로 채워져, 카탈로그의 93%(2,643/2,851)가 알려진 파편인데도 한 건도 나오지 않는다.

### 왜 지금 드러났나

이전에는 P5/P6 테스트가 **완주하지 못하고 타임아웃**됐다(결함 4). 시드가 끝까지
돌지 않으니 오염도 덜 쌓였다. 스크리닝을 빠르게 만들자 테스트가 실제로 완주하면서
기존 위생 결함이 표면화됐다. **성능 수정이 만든 결함이 아니라 가린 것을 걷어낸 것이다.**

### 판정

- 이 실패는 지표 계보 작업(결함 1~3)과 **무관**하다.
- 근본 원인은 통합 테스트가 `space_object` 를 생성하고 정리하지 않는 설계다.
  실행할수록 "실 카탈로그를 서빙하는가"를 검사하는 모든 테스트가 약해진다.
- 개발 DB 정리는 파괴적 작업이므로 수행하지 않았다. PD 승인 후 픽스처 231건을
  제거하면 테스트는 즉시 복구된다. 그러나 그것은 증상 처리이며, 정본 해결은
  통합 테스트에 정리 책임을 부여하거나 테스트 전용 스키마를 쓰는 것이다.

`test_debris_group_ingestion::test_group_cohort_shares_one_immutable_artifact` 도
같은 원인이다 — **격리 실행에서는 통과**하고 전체 실행에서만 실패한다.

## 후속 — 게이트 판정 세분화 (`blocker_class`)

기획자 문서의 진단("단일 PARTIAL 이 '안 만들었다'와 '파트너 없이는 불가'를 뭉갠다")은
옳았다. 처방은 제품 분리가 아니라 **각 체크에 원인을 붙이는 것**이다.

`tools/blocker_class.py` 가 어휘를 정의한다. 원인 기준이며 난이도 기준이 아니다:

| 값 | 뜻 |
| --- | --- |
| `NONE` | 충족됨 |
| `BUILDABLE_NOW` | 저장소·이 기계에 필요한 것이 다 있다. 자격증명도 계약도 아닌 **일** |
| `EXTERNAL_DATA_GATED` | 우리가 단독으로 얻을 수 있는 데이터 대기 (무료 계정·공개 다운로드·속도제한 피드) |
| `EXTERNAL_PARTNER_GATED` | 어떤 공학적 노력으로도 불가. 타 조직의 허가·서명·운용이 필요 |
| `DECISION_PENDING` | 능력이 아니라 제품 판단 대기 |

미충족 체크가 분류를 선언하지 않으면 `classify()` 가 **예외를 던진다**. 편한 쪽으로
기본값을 주면 이 모듈이 없애려는 모호함이 그대로 돌아오기 때문이다.
(실제로 이 가드가 p3/p4 두 게이트 지점에 같은 선언을 넣은 실수를 즉시 잡았다.)

### 결과

| 페이즈 | 게이트 | 미충족 | 우리 일 | 남의 일 | 결정 대기 |
| --- | --- | --- | --- | --- | --- |
| P0·P1·P2 | PASS | 0 | — | — | — |
| P3 | PARTIAL | 2 | 1 | 0 | 1 |
| P4 | PARTIAL | 1 | 0 | 1 | 0 |
| P6 | PARTIAL | 1 | 1 | 0 | 0 |
| P7 | PARTIAL | 1 | 1 | 0 | 0 |
| **P8** | PARTIAL | 2 | **2** | **0** | 0 |
| P9 | PARTIAL | 2 | 1 | 1 | 0 |

**P8 의 남은 차단 요인은 전부 우리 일이다.** 이전 주석은 운영 Pc 를
"TraCSS/Space-Track 없이는 불가"로 적어 파트너 차단처럼 보이게 했으나, 규격 형태 CDM
실측이 반증했다 — 파트너 데이터가 도착하기 전에 우리 관문 5개가 먼저 거부한다.
그리고 P4~P6 테스트 4건은 성능 수정으로 **이제 통과한다**(이전에는 타임아웃).

전 페이즈에서 진짜 파트너 차단은 **P4 의 발사체 내부 텔레메트리 1건뿐**이다.
그 체크에도 한계를 명시했다: 기체 내부 상태에만 해당하며, 궤적·비행 이벤트·투입 후
초기 궤도는 공개 소스로 지금 구축 가능하다. 하나로 묶어두면 구축 가능한 부분까지
파트너 대기로 오독된다 — 체크를 쪼개는 것이 후속 과제다.

## 미조치 (최종)

1. **CCSDS KVN/XML 파서와 RTN→TEME 회전** — 관문 1~4 를 여는 실제 작업. 데이터 출처와 무관하게 영구히 유효하다. **P8 을 여는 유일한 경로.**
2. **외부 출처 Pc 골든 픽스처** — TraCSS 공개 검증 데이터셋(CC0, Google Drive 계정 필요, 20.7GB). 자기순환을 끊는 유일한 방법.
3. **SOCRATES 라이브 수집** — 수집기와 테스트는 완성(`backend/providers_live/socrates.py`, 정직성 10건). 실제 CSV 다운로드는 외부 네트워크 작업이라 PD 승인 대기.
4. **`screen-runs` 동기 실행** — `max_objects` 는 경계일 뿐이다. 202 를 반환하는 라우트는 작업 큐로 옮겨야 한다.
5. **개발 DB 픽스처 231건** — 통합 테스트가 정리 없이 만든다. 제거하면 science_bridge 는 즉시 복구되나 증상 처리이며, 정본 해결은 테스트에 정리 책임을 주거나 테스트 전용 스키마를 쓰는 것이다.
6. **P4 텔레메트리 체크 분할** — 기체 내부 상태(파트너 차단)와 궤적·이벤트·초기 궤도(지금 구축 가능)를 분리.
7. `pc_status` NULL 30건의 출처 미확인 — 나머지 44,858건은 NOT_COMPUTED.

## 후속 2 — CCSDS KVN 파서 (관문 3개 개방)

결함 3에서 실측한 5개 관문 중 **3개를 열었다**. `backend/conjunction/cdm_kvn.py`.

| # | 관문 | 이전 | 현재 |
| --- | --- | --- | --- |
| 1 | 인코딩 | JSON 전용 → `json.loads` 에서 사망 | **KVN 파싱** (`parse_any_cdm` 이 내용으로 판별) |
| 2 | 공분산 형태 | 6×6 중첩 요구 | **21원소 하삼각 → 대칭 6×6** |
| 3 | 프레임 | TEME 강제 | **여전히 닫힘 (의도적)** |
| 4 | 단위 | KM2 강제 | **m\*\*2 → km2 정확 변환** |
| 5 | HBR 의미 | COMBINED_HBR 요구 | 여전히 닫힘 (규격 외 항목) |

### 프레임 회전을 하지 않은 이유

CDM 공분산은 RTN 이고, TEME 로 회전하려면 **물체 상태벡터와 정확한 축 규약**이 필요하다.
여기서의 오류는 **조용하다** — 실패로 드러나지 않고 그럴듯한 Pc 값을 만든다.
E43(하드코딩 84%)·E10(날조된 밀도 기본값)과 같은 실패 유형이다.

그래서 프레임을 **공표된 그대로 RTN 으로 보고**하고 Pc 게이트가 계속 거부하게 뒀다.
`covariance_summary()` 가 남은 차단 요인을 열거한다. 회전은 검토를 거쳐 별도로 다룰
작업이며, 밤중에 무감독으로 넣을 물리가 아니다.

### 단위 변환에서 주의한 것

CDM 하삼각은 위치(m\*\*2)·위치×속도(m\*\*2/s)·속도(m\*\*2/s\*\*2)를 **섞어** 싣는다.
행렬 전체에 1e-6 을 곱하면 속도 블록이 망가진다. **3×3 위치 블록만 변환**하고
나머지는 공표 단위 그대로 통과시키며, 그 사실을 경고로 남긴다.

불완전한 하삼각(21개 미만)은 **0으로 채우지 않고 부재로 처리**한다. 0 으로 채우면
Pc 엔진에 "완벽히 확실한 상태벡터"를 넘기게 된다.

### 새로 드러난 사실 — 파서에 운영 호출부가 없다

`parse_cdm` / `parse_any_cdm` 을 호출하는 라우트·서비스·수집 작업이 **하나도 없다**.
CDM 을 읽을 수 있다는 것과 수집한다는 것은 별개의 주장이며, 여기서는 첫 번째만 성립한다.
`test_cdm_spec_shape_reality.py::TestNoIngestionPathExists` 가 이 사실을 검사하고,
호출부가 생기면 실패하며 그때 은퇴시켜야 한다.

### 검증

- KVN 파서 25건 + 갱신된 현실성 11건 = **36건**
- 현실성 테스트는 여전히 **현재 동작을 기록**한다. 프레임 관문이 열리면 실패하며,
  그 실패가 의도된 신호다.

## P8 판정 갱신

`operational_pc_from_cdm_covariance` 는 여전히 미충족이나 사유가 좁아졌다:

- ~~인코딩~~ · ~~공분산 형태~~ · ~~단위~~ → 해소
- **남은 것: RTN→TEME 회전, COMBINED_HBR 규약, 그리고 수집 경로 연결**

분류는 `BUILDABLE_NOW` 그대로다 — 셋 다 파트너·자격증명 없이 가능하다.

## 후속 3 — SOCRATES 실측 수집: 가드레일 전부가 실데이터로 검증됨

체인 `fetch → parse → raw_artifact → event/snapshot → API` 를 실제 피드 1회로 관통했다.

### 실측 회계 (2026-09-02 07:32 KST)

| 항목 | 값 |
| --- | --- |
| 피드 행 | **145,213** (파싱 실패 **0**) |
| 피드의 고유 객체 | 23,740 |
| 우리 카탈로그와 일치 | 1,979 |
| **양끝 모두 일치한 쌍** | **4** → 이벤트 4 · 스냅샷 4 |
| 원본 아티팩트 | sha256 `47d04138…` (16.5MB, 내용주소 보존) |

4건이 적은 이유는 결함이 아니라 **구조**다: SOCRATES 는 운용 위성 대 전체를
스크리닝하고 우리 카탈로그는 대부분 파편이라, 쌍의 한쪽 끝(위성)이 거의 항상
카탈로그 밖이다. `rows_outside_catalog: 145,209` 가 이를 명시적으로 기록한다.
실제로 매칭된 4건은 전부 **LANDSAT 8 × (COSMOS 2251 / IRIDIUM 33 / FENGYUN 1C) DEB** —
카탈로그에 위성이 하나 있었기에 성립한 쌍들이다.

### API 검증 (실제 HTTP)

```
GET /api/v1/conjunctions?source_grade=PUBLIC_SOCRATES
→ 4건 모두: MAX_PC status=OBSERVED · basis=OBSERVED_EXTERNAL
  · source_id=celestrak_socrates · content_sha256=아티팩트 해시 일치
  · PC 채널 value=None (비오염)
```

**결함 1에서 세운 계약이 실데이터에서 처음 작동했다**: 남이 계산한 값이
COMPUTED 로 위장되지 않고, 출처 아티팩트가 붙어 나오며, Pc 채널은 건드리지 않는다.

### 수집 중 만난 관문 두 개 (설계가 의도대로 작동)

1. **출처 레지스트리 FK 거부** — `raw_artifact.source_id → data_source` FK 가
   미등록 출처의 첫 저장을 거부했다. 우회 대신 `017_register_socrates_source` 로
   정식 등록했다(이용정책·36000초 폴링 한도 명시). E27 교정과 같은 원칙:
   신뢰는 사전 구성 레지스트리에서만 나온다.
2. **HTTP 406** — 공용 클라이언트가 `Accept: application/json` 을 고정 전송했고
   CelesTrak 이 CSV 자원에 406 을 반환했다. 정책대로 재시도 없이 즉시 중단됐고,
   `fetch_raw(accept=...)` 파라미터로 교정 후 의도적 1회 재요청으로 성공했다.
   픽스처로는 절대 못 잡는 종류의 결함이다.

### 위생 규칙 (결함 5 의 교훈 적용)

- 통합 테스트는 `EVIDENCE_PROBE` 등급으로만 기록한다 — append-only 라 테스트 행은
  영구적이며, 실피드 등급(`PUBLIC_SOCRATES`)을 입은 합성 행은 관측 데이터와
  구분 불가이기 때문이다. `source_grade` 파라미터가 이를 구조적으로 가능케 한다.
- 테스트는 카탈로그 내용을 가정하지 않는다 — 실존 객체 2개를 DB 에서 읽어 쓰고,
  없으면 정직하게 skip 한다.

### 남은 것

- **수집 자동화는 하지 않았다.** FILE_MTIME(jsonDir, 시간당 1회 한도) 확인과 갱신당
  1회 정책을 지키는 스케줄러가 선행돼야 한다. 그때까지 수동 도구
  (`tools/run_socrates_ingestion.py`)가 곧 속도 제한이다.
- 동일 바이트 재수집 시 스냅샷이 중복 append 된다(이벤트는 재사용). 최신 스냅샷만
  읽는 조회 경로에는 무해하나, 무정보 쓰기다 — (event, input_hash) 존재 검사로
  막을 수 있다.

## 후속 4 — SOCRATES 체인 적대 검증: 내가 만든 결함을 같은 방법이 잡았다

수집 체인을 정직성·정확성·운영 3렌즈로 독립 심사하고 지적마다 확정 검증을 붙였다
(에이전트 23, 지적 20건 확정 — 반박 0건은 검증자 동조 가능성이 있어 전부 직접 재확인).
중복 통합 후 실질 14건. **가장 무거운 것은 내 것이었다.**

### 결함 6 — MISS_DISTANCE 를 우리 계산으로 서빙 (CRITICAL, 자초)

`service.py:641` (수정 전):

```python
"status": "COMPUTED" if row["miss_distance_m"] is not None else "NOT_COMPUTED"
```

**결함 1 과 같은 추론이 같은 행의 옆 채널에 그대로 남아 있었다.** 결함 1 을 고칠 때
"거리는 항상 우리 정밀화가 만든다"고 판단하고 넘어갔는데, 그 뒤 내가 SOCRATES 수집을
만들어 CelesTrak 의 `TCA_RANGE` 를 `miss_distance_m` 에 쓰기 시작했다 — 전제를 스스로
깨고 되돌아보지 않은 것이다. 실측 수집된 4행이 **당일 하루 종일** 남의 거리값을
"우리가 계산함"으로 서빙했다. `conjunction_signals.py:294` 도 같은 추론을 반복했고,
그 파일의 계약 문구("정밀화된 TCA 에서 나온다")는 SOCRATES 행에서 거짓이 되어 있었다.

**조치** — `migrations/018_geometry_basis.sql`: `geometry_basis`
(`COMPUTED_INTERNAL` / `OBSERVED_EXTERNAL`). 스크리닝 경로는 INTERNAL, SOCRATES 는
EXTERNAL 을 쓴다. 페이로드 `_miss_distance_channel` 은 저장된 근거를 읽는다.

**018 이전 행의 처리** — append-only 라 백필 불가. 근거 컬럼이 NULL 인 행은
**기록된 생산자 신원(`model_version`)** 을 내부 모델 허용목록과 대조한다. 값의 존재가
아니라 기록된 계보를 읽는 것이므로 추론이 아니라 조회다. 실측 결과:

| 행 | 이전 | 현재 |
| --- | --- | --- |
| 내부 스크리닝 44k 행 (`p4-conservative-v1+sgp4`) | COMPUTED | **COMPUTED** (허용목록 조회) |
| 실측 SOCRATES 4행 (`CELESTRAK_SOCRATES`, 018 이전) | **COMPUTED (거짓)** | **BASIS_UNRECORDED** (사실) |
| 018 이후 SOCRATES 행 | — | OBSERVED / OBSERVED_EXTERNAL |

4행은 다음 피드 갱신 때 새 바이트로 재수집되면 근거를 갖게 된다. 같은 바이트 재수집은
중복 방어로 건너뛰고, 폴링 창 안의 재요청은 정책 방어가 거부하므로 **지금 손으로
고칠 방법이 없고, 그것이 옳다.**

### 나머지 확정 지적과 조치

| # | 지적 | 조치 |
| --- | --- | --- |
| 2 | `float()` 이 NaN·Infinity·범위 밖 MAX_PROB 를 통과시켜 OBSERVED 로 저장 후 provenance JSON 에서 중간 중단 | 유한성 검사 + MAX_PROB ∈ [0,1] 강제, 위반 행은 계수된 skip. `json.dumps(allow_nan=False)` 를 후방 방어로 |
| 3 | 통합 테스트가 합성 바이트에 "CelesTrak 데이터" 귀속을 붙여 영구 테이블에 기록 | `artifact_attribution` 파라미터. 테스트는 `recorded://` URI 와 "합성, CelesTrak 아님" 문구를 쓴다 |
| 4 | 기본 조회가 EVIDENCE_PROBE 행을 관측 데이터처럼 서빙 | `list_conjunctions` 기본에서 시뮬레이션 등급 제외. 명시 요청 시에만 노출 |
| 5 | 잘못된 DILUTION 이 None 으로 조용히 강제되어 부재와 구분 불가 | 빈 셀만 부재. 잘못된 셀은 행 skip + 계수 |
| 7·11·14 | 실제 비200 이 공용 오류 분류(재시도 대기·기록 없음)로 빠져 정책 중단이 발화하지 않음 | `fetch_socrates` 가 모든 비200 을 `SocratesUsagePolicyError` 로 재발생. 429 의 재시도 힌트도 정책 중단으로 |
| 20 | `follow_redirects=True` 가 3xx 를 조용히 추종 — "모든 비200 에서 중단"과 모순 | `fetch_raw(follow_redirects=)` 추가, SOCRATES 는 False |
| 9·16 | 동일 바이트 재수집이 스냅샷을 영구 중복 append | (event, input_hash) 존재 검사 → 건너뛰고 계수. 인덱스 018 |
| 10 | 쌍 순서를 정규화하지 않아 이벤트 정체성이 피드 열 순서에 종속 | 객체 id 기준 정규화 (`_canonical_pair`) |
| 15 | 갱신당 1회 정책이 코드로 강제되지 않아 매 실행 16.5MB 재다운로드 | 레지스트리 `max_poll_seconds` 로 창 강제 (`enforce_poll_interval`) — 017 이 등록한 값이 곧 정책 |
| 18 | `ingestion_run` 행이 없어 DB 기반 모니터링에 보이지 않음 | 실행마다 RUNNING→SUCCEEDED/PARTIAL/FAILED 기록, 아티팩트에 연결 |
| 8·17 | 행별 커밋이라 중간 실패 시 부분 상태 | **미해결(문서화)** — TCA 를 쓰기 전에 전부 검증해 알려진 중단 원인을 제거했고, 중복 방어로 재실행이 곧 복구가 된다. 단일 트랜잭션은 저장소 메서드 서명 변경이 필요해 별도 작업 |
| 6 | `tca_boundary_flag=false` 가 실행되지 않은 판정처럼 읽힘 | provenance 에 부적용 명시(기존). NOT NULL 이라 컬럼 자체는 유지 |
| 12 | 분 경계 넘는 TCA 정밀화가 옛 이벤트를 OPEN 으로 남김 | **미해결(문서화된 한계)** |
| 13 | 테스트 조회 limit 50 이 누적 시 자멸 | limit 500 + 시각 하한 |
| 19 | `tca_parse_failures` 무제한 직렬화 | 20건 캡 + 총계 |

### 검증

- 프로바이더 22건(신규 12) · 수집 통합 7건 · MAX_PC/기하 근거 14건(신규 5, **수정 전 실패 확인**)
- 실제 API: 내부 행 COMPUTED 유지, SOCRATES 4행 BASIS_UNRECORDED, 기본 조회에 프로브 행 없음

### 교훈

같은 실수를 두 번 했다는 것이 이 절의 요점이다. 결함 1 을 고친 손이 결함 6 을 만들었고,
그것을 잡은 것은 내 주의력이 아니라 **적대 검증이라는 절차**였다. 이 프로젝트에서
정직성은 태도가 아니라 절차여야 한다는 것을 다시 확인했다.
