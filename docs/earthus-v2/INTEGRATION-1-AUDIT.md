# EARTHUS V2 — INTEGRATION-1 감사 (§1)

| 항목 | 값 |
|---|---|
| 기준 HEAD | `21519870` |
| 감사 시각 | 2026-09-08 |
| 방법 | 8개 영역 병렬 정독 → 주장마다 반대심문(24건) → 종합. **모든 주장은 file:line 근거를 요구했다** |
| 반대심문 결과 | 24건 중 **5건 기각**, 19건 유지 |
| 다른 세션 | 같은 작업 트리에 배포 엔진 작업이 있었다(12:15~12:38 작성, 이후 유휴). 미커밋 파일은 손대기 전에 전부 백업했다 |

> 이 문서는 **무엇이 있는지**를 적는다. 무엇을 정본으로 삼을지는
> [INTEGRATION-1-OWNERSHIP.md](INTEGRATION-1-OWNERSHIP.md) 가, 결과는
> [INTEGRATION-1-RESULT.md](INTEGRATION-1-RESULT.md) 가 적는다.

---

## 0. 시작 상태

```text
HEAD                21519870
미커밋 추적 파일     36  (전부 다른 작업 — 이번 작업과 무관)
미추적                151
테스트 기준선        report-engine 102 · _shared 37 · distribution 71 · npm 45 · v2 비브라우저 16
                    = 271 통과 / 1 실패(test_public_ui_contract.mjs — v1 CSS, 커밋된 상태에서 이미 실패)
```

---

## 1. 이미 만들어져 있던 것 — 다시 만들지 않았다

감사의 가장 큰 소득은 **없다고 생각한 것이 이미 있었다**는 사실이다.

| 지시서가 요구한 것 | 이미 있는 곳 | 상태 |
|---|---|---|
| §5 통합 콘텐츠 객체 | `aws/_shared/content_contract.py` `make_content` | **완성** — phenomenon/event/report 참조, claims, visualSpec, visualAssetIds, 상태 전이표까지 |
| §6 REPORT → CONTENT | `aws/distribution/sources/report_bridge.py` | **완성** — 리포트 팩트만 옮기고 숫자를 새로 만들지 않는다 |
| §13 SNS 채널 크기 | `aws/distribution/visual.py` `CANVAS` | **완성** — 7개 플랫폼 규격 |
| §8 카메라 결정 | `aws/distribution/visual.py` `camera_for` | **완성** — 기하에서 자동, 모르면 전지구로 물러남 |
| §11 시각 자산 메타 | `aws/distribution/visual.py` `make_asset_metadata` | **완성** — 다만 **쓰는 사람이 0명이었다** |
| §19 수동 승인 | `content_contract.STATUS_TRANSITIONS` | **완성** — DRAFT→PUBLISHED 직행 경로가 코드에 없다 |
| §26 예보 검증 단일화 | `verify_scorecard.py` 가 `kma_verify_adapter.py` 를 **파일 경로로 불러 쓴다** | **완성** |

그래서 이번 작업은 "엔진을 더 만드는 것"이 아니라 **비어 있는 연결선을 잇는 것**이 되었다.

---

## 2. 실제로 비어 있던 것 하나

`visual.py` 는 사양(카메라·레이어·캔버스)과 자산 메타데이터를 만들지만
**그 사양을 실제 그림으로 바꾸는 실행기가 없었다.** `visualAssetIds` 는 언제나 `[]` 였다.

그 파일의 결정은 이랬고, 옳다:

> "지구 장면은 Three.js 씬 안에서만 실제로 존재한다. 서버에서 지구를 다시 그리면
> 화면과 다른 지구가 두 개 생긴다."

지시서 §8 이 요구한 것도 같다 — 서버 렌더링이 아니라 **실제 런타임 캡처**.
그래서 만든 것은 실행기 하나뿐이다(§7 참조).

---

## 3. 중복 — 확인된 것과 기각된 것

### 3.1 절 구성 두 벌 (확인)

| | `sections.py` (다른 세션) | `compose.py` (PHASE 8) |
|---|---|---|
| 월간 절 | 17개 | 15개 |
| 분야 어휘 | ATMOSPHERE · CRYOSPHERE … | weather · ocean · land · hazards · people · space |
| 레지스트리와 일치 | **아니오** (지어낸 어휘) | **예** |
| 빈 절 표기 | `notAvailable` + `reasonKey` | `dataLabel` (계약 어휘) |
| 부르는 곳 | **없음** — `export.py` 가 `table_of_contents` 만 씀 | `pipeline.py` |
| 화면이 읽는 것 | — | `dataLabel` (ui-shell.js) |

→ **정본은 `compose.py`.** 분야 어휘가 현상 레지스트리와 맞고, 실제로 배선돼 있고,
화면이 그 필드를 읽는다. `sections.py` 의 `reasonKey` 어휘는 더 좋으므로 흡수 대상이다.

### 3.2 리포트 입구 두 벌 (확인 — 그리고 위험)

`cli.py report` 와 `pipeline.py main()` 이 **같은 `report:{기간}` id 를 찍는다.**
발행 키는 `reports/report/2026-08/v1.json` 이고 조건부 쓰기(불변)라서,
둘 중 먼저 올린 쪽이 이기고 나중 것은 조용히 `alreadyPreserved` 가 된다.
좁은 경로(기온·바람만)로 만든 리포트가 먼저 올라가면 전체 리포트가 영원히 못 올라간다.

→ 이번에 **입구를 하나로 합쳤다**(`cli.py full`).

### 3.3 `generator.py` 가 두 개 (확인)

`aws/report-engine/generator.py` 와 `aws/distribution/generator.py`.
`sys.path` 에 둘 다 올리면 먼저 캐시된 쪽이 이긴다 — 조용히 **엉뚱한 엔진**을 부른다.
종단 시험은 배포 쪽을 파일 경로로 불러 이 함정을 피한다.

### 3.4 기각된 주장 5건

반대심문에서 무너진 것들이다. 적어 두는 이유는 **감사도 틀릴 수 있기 때문**이다.

- "report_bridge 가 지어낸 팩트 개수 때문에 리포트발 콘텐츠가 **전부 BLOCKED** 된다"
  → 실제 파이프라인으로 돌려 보니 `REVIEW_REQUIRED`, 차단 사유 없음. 팩트 57개·56개 둘 다 재현 안 됨.
  숫자 검사가 자격 판정을 막지 않는다. **잠재 위험은 맞지만 현재 차단은 사실이 아니다.**
- 나머지 4건은 표현이 과했거나(계층 관계를 중복이라 부름) 두 개념을 같은 이름으로 묶은 경우다.

---

## 4. 공개 초안 노출 — 확인, 그리고 구조적

**`events/social-drafts.json` 은 지금 공개로 열려 있다.**

```text
GET https://earthus-cache-kr.s3.us-east-2.amazonaws.com/events/social-drafts.json
→ 200 · generated 2026-09-08T04:28:00Z · 미게시 초안 2건 (전문 포함)
```

접두사 정책을 실측했다:

| 접두사 | 공개 여부 |
|---|---|
| `events/**` | **공개** (200) |
| `wind/**` · `ocean/**` | 공개 (200) |
| `archive/**` | 비공개 (403) |
| `reports/**` | 403 (아직 발행된 것 없음) |

그리고 `aws/distribution/handler.py` 는 후보 본문을 `events/distribution-content/` 에 쓴다 —
**첫 실행 순간 두 번째 공개 노출이 생긴다.**

### 왜 간단히 못 고치나

옮기면 관리 화면이 깨진다. 두 화면 모두 **자격증명 없이** 공개 경로를 직접 읽는다:

- `prototype/js/studio.js:392` → `/events/social-drafts.json`
- `prototype/js/distribution-admin.js:26-27` → `/events/distribution-content.json`

즉 이건 핸들러 하나의 버그가 아니라 **정적 관리 화면에 인증 면이 없다**는 구조의 결과다.
근본 해결은 인증된 관리 API 이고, 그건 §0 이 얼린 새 기능이다.

→ 이번에 한 것: **가장 위험한 것만 공개하지 않는다.** 차단(BLOCKED)됐거나
사람 전용 등급(LEVEL_3)인 후보는 본문을 공개 경로에 올리지 않는다(목록에는 남는다).
완전한 해결이 아니라는 사실을 코드 주석과 이 문서에 적었다.

---

## 5. 리드타임 평균 — 표준을 어기는 자리 (확인)

저장소의 불변 규칙은 "리드타임을 절대 합치지 않는다"이고
`kma_verify_adapter` · `report_contract.make_verification` 는 그 규칙을 지킨다.

**태풍 쪽은 지키지 않는다.**

```text
aws/cyclone-analog/handler.py:1243
    "meanErrorKm": round(sum(x["errorKm"] for x in rows) / len(rows))
        rows 는 6시간 예보부터 120시간 예보까지 전부 — 한 숫자로 뭉갠다
aws/cyclone-analog/handler.py:1709   회차를 가로질러 같은 평균을 다시 낸다
aws/cyclone-analog/handler.py:1711   **그 숫자로 기관 순위를 매긴다**
```

`byLead` 분해가 옆에 남아 있으므로 자료는 살아 있다. 문제는 **대표 숫자와 순위**다.
6시간 오차가 작은 기관이 120시간을 못 맞혀도 상위로 올라갈 수 있다.

→ 고치지 않았다. 운영 중인 Lambda 의 **공개 순위 산출을 바꾸는 일**이라
제품 결정이 필요하다. 근거만 남긴다.

---

## 6. 화면이 계약을 우회하던 곳 (확인 — 고침)

`report-center.js` 가 **팩트에서 성적표를 다시 만들고 있었다**(`metric === 'mae'` 필터).
엔진의 `build_forecast_scorecard` 는 평가하지 못한 분야도 일부러 행으로 남기는데
(그 docstring: "빼고 평균 내지 않는다 — 그러면 못 한 것이 잘한 것처럼 사라진다"),
mae 팩트가 없는 분야는 UI 필터에서 **구조적으로 사라졌다.**

→ 고쳤다. 파이프라인이 정본 성적표를 리포트에 싣고, 화면은 그걸 그대로 그린다.
지금 화면에 강수(`NO_OBSERVATION_ARCHIVE`)·파고(`FORECAST_NOT_OURS`) 두 행이 사유와 함께 보인다.

---

## 7. 레이어 키를 손으로 적어 생긴 사고 (확인 — 고침)

PHASE 8 의 `climate_series_adapter` 가 레이어 키를 손으로 적었다: `ocean/sst`.
**실제 레이어는 `ocean/sstfield` 다.** 그 팩트로 지구를 캡처하니 요청한 레이어가 켜지지 않았고,
캡처 검증이 그걸 잡았다.

→ `aws/_shared/phenomenon_registry.py` 를 만들어 **JS 레지스트리를 읽는다**(베끼지 않는다).
읽은 수가 정본과 같은지 시험이 확인한다: 109 레이어 · 66 현상.

---

## 8. 테스트

| 묶음 | 개수 | 실행 방법 | 문제 |
|---|---:|---|---|
| report-engine | 102 → **123** | `python -m unittest discover` | `npm test` 가 안 부른다 |
| _shared | 37 | 〃 | 〃 |
| distribution | 71 | 〃 | 〃 |
| npm (`npm test`) | 45 | `tools/earthus-v5*` 만 | 파이썬 묶음이 빠져 있다 |
| v2 비브라우저 mjs | 16 | 개별 실행 | 2개는 60초 이상 걸려 짧은 타임아웃에서 실패로 보인다 |

**파이썬 시험 210건이 어떤 러너에도 연결돼 있지 않다** — 감사가 찾은 사실이고 확인했다.
고치지 않았다(§0 이 얼린 범위 밖의 CI 변경). 결과 문서에 남긴다.

취약한 단정(개수·객체 전체 모양·문구 전문)은 감사가 8곳 이상 찾았다. 이번에 새로 만든
시험은 전부 불변식 기준이며, PHASE 8 이 박아 둔 문구 고정 하나는 이미 불변식으로 바꿨다.

---

## 9. 감사 산출물

- 영역별 원본 보고 9건 · 반대심문 24건 · 종합 1건
- 전체 결과: 워크플로 저널(`subagents/workflows/wf_d21974b7-3d4/journal.jsonl`)
- HIGH 등급 발견 30건 (그중 이번에 고친 것 4건, 근거만 남긴 것 나머지)
