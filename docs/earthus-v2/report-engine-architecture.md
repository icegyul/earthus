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
