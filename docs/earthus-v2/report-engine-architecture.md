# EARTHUS V2 — 리포트 엔진 아키텍처

| 항목 | 값 |
|---|---|
| 상태 | 설계 (PHASE 5 대상). 구현 없음 |
| 작성일 | 2026-09-08 |
| 기준 커밋 | `1e03eac8` |
| 전제 문서 | [phase-0-audit.md](phase-0-audit.md) |

> 봉인 인계 패키지(2026-08-27)의 일부가 아니다. `SHA256SUMS` 대상이 아니다.

---

## 0. 가장 중요한 판단 — 백지에서 짓지 않는다

지침서 §15·§21 은 리포트 엔진이 이미 있다고 전제한다. **v2 에는 없다.** `prototype/v2-three` 에 리포트 생성기·렌더러·라우트·색인 읽기가 전부 없고, `ext/lab-reports.js:23` 은 v1 패널을 빌려 `/lab-reports.html` 로 링크만 한다.

그러나 **서버에는 절반이 이미 있다.** 그래서 이 문서의 결론은 하나다.

> 새 리포트 계보를 만들지 않는다. 이미 있는 계약을 승격시킨다.

이미 있는 것:

| 이미 있는 것 | 무엇을 이미 고정했나 |
|---|---|
| `docs/LAB-REPORT-CONTRACT.md` | 리포트 수명주기 · id 형태 · 공개 접두사 |
| `aws/signal-foundation/canonical.py` | 팩트 봉투 `earth.signal.v1` — value·unit·sourceValue·conversion |
| `aws/typhoon-official` | 불변 쓰기 패턴 (`IfNoneMatch='*'` + `immutable`) |
| `aws/archiver` | Hive 파티션 + gzip JSONL + 행별 출처 스탬프 |
| `aws/cyclone-analog` · `aws/lab-events` | 실제로 도는 리포트 생성기 2종 |

지침서 §37 PHASE 5 를 "설계부터" 로 잡으면 **두 번째 리포트 계보**가 생긴다. 먼저 대조 단계를 넣는다.

---

## 1. 오늘의 LAB 리포트가 리포트가 아닌 이유

| 지침서가 요구하는 것 | 오늘 실제 |
|---|---|
| 불변 발행본 (§21) | 3시간마다 **본문까지 통째로 다시 쓴다** (`aws/lab-events/handler.py:1073`) |
| 발행 시각 · 알고리즘 버전 | 공개 투영본에 **없다**. `algorithmVersion` 은 비공개 스냅샷 안에만 있다 |
| 확정 상태 | `FINAL_REPORT` 가 **종결이 아니다.** cyclone-analog 는 확정본을 일부러 재채점한다 |
| 구조화된 팩트 (§12) | `detail.facts` 는 `{label, value}` **표시 문자열**이다. 단위·타입·출처 id·유효시각·신뢰도가 없다 |
| 산문이 팩트의 하류 (§11) | 헤드라인은 인라인 f-string 이다 |

즉 오늘의 "리포트" 는 **살아있는 세션의 가변 투영**이다. 어제 읽은 문장이 오늘 다르게 바뀌어 있을 수 있고, 그것을 감지할 방법이 없다.

---

## 2. 가장 작은 승격 경로

### 단계 A — 공개 투영본에 신원을 붙인다 (작다)

`aws/lab-report-index/handler.py:67-83` 이 9개 출처를 합쳐 `ocean/lab-reports.json` 을 만든다. 여기에 리포트별로 세 필드를 더한다.

```
generatedAt        이 본문이 만들어진 시각
algorithmVersion   이미 비공개 스냅샷에 있는 값을 공개로 올린다
revision           같은 리포트가 다시 쓰일 때 증가
```

이것만으로 "어제 읽은 것과 같은 문서인가" 에 답할 수 있게 된다. **리포트를 불변으로 만들지 않고도** 변경을 감지할 수 있다.

### 단계 B — 팩트를 표시 문자열에서 분리한다

`{label, value}` 를 `earth.signal.v1` 봉투로 옮긴다. **새 스키마를 발명하지 않는다** — `aws/signal-foundation/canonical.py` 가 이미 정의했다.

주의: 그 id 형태는 `{provider}:{dataset}:{hash}:{hash}` 이고 메뉴의 `scene/layer` 와 **다른 네임스페이스**다. 둘을 명시적으로 잇는 표가 필요하다. 섞으면 안 된다.

### 단계 C — 발행본을 불변으로 고정한다

패턴은 이미 있다. `aws/typhoon-official` 이 쓰는 조건부 쓰기를 그대로 쓴다.

```python
put_object(..., IfNoneMatch="*", CacheControl="public, max-age=31536000, immutable")
# 412 PreconditionFailed = 이미 보존됨 (오류가 아니다)
```

**전면 아카이빙 계층을 만들지 않는다.** 인용해야 하는 산출물에만 이 패턴을 적용한다.

> 정직하게 적어 둔다: 지금 저장소에 S3 버킷 버저닝·수명주기·Object Lock 이 **없다.** 따라서 현재의 "불변" 은 "어떤 핸들러도 지우지 않는다" 는 뜻이다. 그 이상을 주장하면 안 된다.

---

## 3. 파이프라인 (지침서 §11)

지침서의 16단계를 그대로 만들지 않는다. 이미 도는 것에 빠진 칸만 채운다.

```
원자료 → 수집 어댑터 → 정규화 → 품질검사        ← 이미 있다 (aws/*)
    ↓
시간 정렬 → 공간 집계 → 평년 대비 → 이상 탐지    ← 부분적으로 있다 (lab-events)
    ↓
사건 탐지 → 중요도 점수 → 교차영역 연결          ← 있으나 리포트와 안 이어짐
    ↓
【리포트 팩트 세트】                              ← ★ 없다. 단계 B
    ↓
서술 생성 → 팩트 검증 → 발행 스냅샷              ← ★ 검증 없음. 단계 C
```

**산문은 반드시 팩트 세트의 하류다.** 오늘은 아니다.

---

## 4. 발행 게이트 (지침서 §24)

`PUBLISHED` 로 가기 전 통과해야 하는 것 중, **오늘 기술적으로 불가능한 것**을 표시한다.

| 게이트 | 오늘 가능한가 |
|---|---|
| 필요한 자료 스냅샷이 존재 | ✗ `snapshotId` 자체가 없다 (쓰는 곳 없는 읽기 코드만 있다) |
| 출처 신선도 검사 통과 | ○ 부분 (`health.json`) |
| 팩트 세트 스키마 검증 | ✗ 팩트 세트가 없다 |
| 예보 검증 통과 또는 `NOT_VERIFIABLE` 명시 | ○ 일부 (§ forecast-verification 문서) |
| 모든 서술 주장이 팩트로 환원 | ✗ |
| 인과 표현에 근거 게이트 | ✗ |
| 버전 동결 | ✗ |

→ 게이트를 먼저 선언하고, 통과 못 하는 항목은 **`BLOCKED` 로 남긴다.** 조용히 발행하지 않는다(지침서 §23).

---

## 5. 지켜야 할 저장소 규약

감사에서 확인한 것들이다. 새 규약을 만들지 말고 이것을 따른다.

- `archive/` 는 **공개 접두사가 아니다.** 공개 목록은 `app · celestrak · clouds · wind · events · ocean · solar · tourism` 뿐이다. 리포트 발행본을 `archive/` 에 두면 사용자가 못 읽는다.
- 누적 자료는 `archive/<dataset>/dt=YYYY-MM-DD/hh=HH/part.jsonl.gz`. Parquet 은 **일부러** 안 쓴다.
- 모든 아카이브 행은 출처 스탬프를 단다: `_v · _ds · _kind · _src · _lic · _obs · _fetched`.
- 키는 **원자료의 실행 시각**에서 찍는다. 벽시계에서 찍지 않는다.
- 좋은 산출물을 빈 산출물로 덮지 않는다. 실패하면 이전 것을 남겨 UI 가 `STALE` 을 읽게 한다.
- 리드타임은 **평균 내지 않는** 1급 차원이다.

---

## 6. 순서

1. `docs/LAB-REPORT-CONTRACT.md` · `canonical.py` · `typhoon-official` 대조 (설계 아님, 읽기)
2. 단계 A — 공개 투영본에 `generatedAt`/`algorithmVersion`/`revision`
3. 단계 B — 팩트 세트를 `earth.signal.v1` 위에
4. 단계 C — 인용 대상만 조건부 불변 쓰기
5. 발행 게이트 선언 + `BLOCKED` 상태 도입
6. 월간 템플릿 (지침서 §17.1) — 이때 비로소 서술을 쓴다

---

# 부록 A — PHASE 2 STEP 2.3 기존 리포트 계약 대조 (2026-09-08)

신규 schema 를 만들기 전에 기존 계약을 전부 찾아 대조했다. **새 설계 문서를 또 만들지 않았다** — 그 자체가 두 번째 계보이기 때문이다.

## A.1 리포트 계보가 이미 셋이다

| 계보 | 정체 | 상태 |
|---|---|---|
| ① 살아 있는 정본 | `docs/LAB-REPORT-CONTRACT.md` + `aws/cyclone-analog` + `aws/lab-events` + `aws/lab-report-index` + v1 `lab-reports.html` | **실제로 돌고 사용자가 본다** |
| ② 그림자 팩트 봉투 | `aws/signal-foundation/canonical.py` 의 `earth.signal.v1` | DRAFT · `archive/canonical/v1/` 비공개 · 배포 안 됨 |
| ③ 죽은 계보 | `prototype/js/earthus2/v05/paid/report-api-engine.js` 의 `earthus.report.v1` | 호출부 0 · 배럴 재수출만 |

**결론: ①을 승격시킨다.** ③의 이름 `earthus.report.v1` 을 재사용하면 안 된다 — 필드 모양이 살아 있는 계약과 전혀 달라 같은 이름에 두 뜻이 생긴다. 지우지도 않는다.

## A.2 항목별 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| `aws/lab-report-index` 공개 투영본 | **MIGRATE** | `public_report()` 에 `generatedAt`·`algorithmVersion`·`revision` 세 줄만 더한다. `algorithmVersion=2` 는 이미 비공개 스냅샷에 있다 — 공개로 올리기만 하면 된다 |
| `aws/typhoon-official` 불변 쓰기 | **CAN KEEP (패턴 재사용)** | `IfNoneMatch="*"` + `immutable` + 412=이미보존. 새 아카이빙 계층을 만들지 않고 이 패턴을 인용 대상에만 복사한다 |
| `aws/signal-foundation/canonical.py` | **CAN KEEP (승격 대상, 이번엔 아님)** | 29필드 봉투와 검증기가 이미 있다. 팩트 봉투를 새로 발명하지 않는다 |
| `aws/cyclone-analog` 리포트 레코드 | **CAN KEEP + 호환 계층** | 태풍만 `kind`·`access`·`title`·`summary`·`sourcePath` 가 없고 id 가 bare 다. 색인과 v1 이 **각각 두 벌로** 메우고 있다 |
| 리포트 종류 목록 | **CONFLICT** | 3곳에 손으로 유지된다 — 색인 `SOURCES`(9종) · `prototype/js/lab-reports.js`(9종) · `LAB-REPORT-CONTRACT.md`(**8종, 지진 누락**). 코드가 맞다 |
| `detail` 필드 | **CONFLICT** | 한 필드 뒤에 서로 호환되지 않는 두 스키마가 있다(lab-events 계열 vs cyclone 계열) |
| 오차 키 이름 | **CONFLICT** | `meanAbsError`(lab-events) vs `meanErrorKm`(cyclone). **이름을 통일하지 말고** `{metric, value, unit}` 덧붙임으로 표현한다 |
| `access: 'pro'` | **MIGRATE (작게)** | 티어 사다리 `free/explorer/intelligence` 에 없는 네 번째 토큰이고 아무도 읽지 않는다. 값 도메인을 사다리로 정렬하거나 "아직 강제되지 않는다"를 계약에 명시 |
| `aws/health` 감시 | **MIGRATE** | `generated_of()` 가 리터럴 `"generated"` 만 찾아 `generatedAt` 을 못 읽는다. 지금 LastModified 로 조용히 폴백 중이다 |
| `earthus.report.v1` | **REPLACE LATER** | 지우지 않는다. 이름을 재사용하지 않는다 |
| v2 `ext/lab-reports.js` | **CAN KEEP** | v2 전용 렌더러를 만들지 않는다. 링크 목적지는 `/lab-reports.html` 유지 |

## A.3 id 네임스페이스가 5종이다

```text
메뉴      scene/layer                              ocean/surf
현상      domain.snake                             hazards.typhoon
리포트    {kind}:{sourceId}                        cyclone:1001318
신호      {provider}:{dataset}:{h20}:{h12}         (':' 4토막)
불변객체  events/typhoon-official/archive/{STORM}/{AGENCY}-{stamp}.json
```

**리포트 id 와 신호 id 가 둘 다 `:` 를 구분자로 쓴다.** 신규 schema 는 둘을 서로 다른 필드명(`reportId` / `signalId`)으로 분리해 담는다. 한 필드에 섞으면 토막 수로만 구분해야 한다.

## A.4 리포트 종류 ↔ 현상 대응 — 이번 단계에서 만든 것

표가 저장소 어디에도 없었다. `prototype/v2-three/js/phenomenon-registry.js` 의 `REPORT_KIND_PHENOMENON` 이 그 자리다.

| 리포트 종류 | 현상 |
|---|---|
| `cyclone` | `hazards.typhoon` |
| `earthquake` | `hazards.earthquake` |
| `aurora` | `space.aurora` |
| `air-pollution` | `weather.air_quality` |
| `bird-migration` | `land.bird_migration` |
| `space-reentry` | `space.orbital_debris` |
| `smoke-ash` | `hazards.wildfire` — 화산재(VAAC) 절반은 대응 현상 없음 |
| `ocean-drift` | **없음** — Argo 표류 추정은 66현상 어디에도 속하지 않는다 |
| `marine-bloom` | **없음** — 해파리·적조 현상이 레지스트리에 없다 |

억지로 잇지 않았다. 리포트는 도는데 그것을 자기 것이라 주장하는 현상이 없다는 것이 지금의 사실이다.

**이 표가 PHASE 1 의 `capabilities.report` 를 실측으로 교차검증한다.** `report:true` 인 현상 7개가 정확히 7개 종류와 1:1로 맞고, 종류가 있는데 `report:false` 인 현상은 0개다. `tools/check-v2-consistency.mjs` 가 이 대칭을 강제한다.

## A.5 이번 단계에서 하지 않은 것

- 기존 리포트 데이터 삭제 · 대규모 마이그레이션 — 하지 않았다.
- `detail`/`scores` 의 좌표·리드타임별 오차 노출(계약 §4 위반) — **고치지 않았다.** 지우면 `lab-report-detail.js` 의 렌더러가 함께 깨진다. 별도 단계가 필요하다.
- 리포트 종류 정본 일원화 — 판정만 했다(코드 9종이 맞다).
