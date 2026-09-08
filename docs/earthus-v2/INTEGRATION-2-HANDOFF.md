# EARTHUS V2 — INTEGRATION-2 인계 노트 (§16)

| 항목 | 값 |
|---|---|
| 기준 | `234bd606` |
| 작성 | 2026-09-08 |
| 규칙 | 다른 세션이 소유한 **미커밋** 파일은 고치지 않는다. 필요한 변경은 여기 적는다 |

> 소유 구분은 [INTEGRATION-1-OWNERSHIP.md](INTEGRATION-1-OWNERSHIP.md) 를 따른다.
> "다른 세션 소유" = 그 세션이 만들었고 아직 커밋되지 않은 파일.

---

## A. 리드타임 순위 — **이번에 고쳤다** (인계 아님)

| | |
|---|---|
| 파일 | `aws/cyclone-analog/handler.py` |
| 소유 | **커밋된 저장소 파일** — 다른 세션의 미커밋 작업이 아니다 |
| 근거 | INTEGRATION-2 §3 이 "본 세션 파일이면 수정 가능"이라고 명시했고, 같은 절이 교차리드 순위를 **공개 제품에서 금지**로 못박았다 |

무엇이 문제였나:

```text
handler.py:1243   meanErrorKm = 6시간~120시간 오차를 한 숫자로 평균
handler.py:1709   회차를 가로질러 같은 평균을 다시 낸다
handler.py:1711   sorted(out, key=meanErrorKm)   ← 그 숫자로 기관 순위를 매겼다
```

고친 내용:

- `:1711` 의 **정렬을 순위에서 이름순으로** 바꿨다. 결정적이되 우열이 아니다.
- 교차리드 평균에 `crossLead: true` · `rankingBasis: false` 표식을 달았다.
  값은 그대로 남겨 화면(`lab-report-detail.js`)이 깨지지 않는다.
- `lead_separated_ranking(aggregated, lead_h)` 를 더했다 — **같은 리드끼리만** 비교한다.

왜 이게 중요한지 실제 값으로:

| | 24시간 | 120시간 | 교차리드 평균 |
|---|---:|---:|---:|
| JMA | **40 km** | 400 km | 100 |
| KMA | 60 km | **300 km** | **90** |

교차리드 평균만 보면 KMA 가 낫다. 그런데 24시간은 JMA 가, 120시간은 KMA 가 낫다.
**두 리드의 승자가 다르다.** 하나로 뭉친 숫자는 그 사실을 지운다.

> 남은 것: `prototype/js/lab-report-detail.js:98` 이 화면에서 다시 교차리드 가중평균을
> 만들어 "위치 오차" 열로 보여 준다. 순위 근거로 쓰지는 않는다(정렬은 `headErr`).
> 리드별 표로 바꾸는 것은 UI 작업이며 이번 범위 밖이다.

---

## B. `sections.py` 중복 정본 — 인계

| | |
|---|---|
| 파일 | `aws/report-engine/sections.py` (+ `export.py`, `adapters/lab_report_adapter.py`) |
| 소유 | **다른 세션 · 미커밋** |
| 상태 | 정본은 `compose.py` 로 정했다(INTEGRATION-1 §3.1). `sections.py` 는 그대로 둔다 |

지금 충돌은 없다 — `sections.build()` 를 부르는 곳이 없고, `export.py` 는
`table_of_contents` 만 쓴다(절 모양과 무관).

**요청**: 그 세션이 커밋할 때 다음 중 하나를 골라 달라.

1. `sections.build` 를 `compose.build_sections` 로 위임하는 얇은 어댑터로 만든다.
   `sections.NOT_AVAILABLE_REASONS` 어휘는 `compose` 가 흡수한다(그쪽이 더 낫다).
2. 또는 `compose` 를 버리고 `sections` 를 정본으로 삼는다 — 다만 그 경우
   **분야 어휘를 현상 레지스트리에 맞춰야 한다.** 지금 `ATMOSPHERE`·`CRYOSPHERE` 는
   레지스트리에 없는 이름이고, 화면이 읽는 `dataLabel` 도 `compose` 만 만든다.

---

## C. 배포 CLI 가 승인을 스스로 걸어 준다 — 인계 (심각)

| | |
|---|---|
| 파일 | `aws/distribution/cli.py:243-244` |
| 소유 | **다른 세션 · 미커밋** |

```python
# 리뷰 워크플로를 실제로 통과시킨다. 건너뛰는 경로를 만들지 않는다.
for step in ("FACT_CHECK", "REVIEW", "APPROVED"):
    c = cc.transition(c, step, actor=args.actor, at=at, note="CLI")
```

주석의 의도(건너뛰지 않는다)는 옳지만, **자동으로 걸어 주는 것은 건너뛰는 것과 같다.**
사람이 아무것도 보지 않았는데 상태만 `APPROVED` 가 된다. 그러면 승인 상태가
아무 정보도 담지 않는다 — 그 뒤의 모든 게이트가 무의미해진다.

**요청**: 세 전이를 자동으로 걸지 말고, `--approved-by` 같은 명시 인자를 받거나
승인은 관리 화면에서만 일어나게 한다. LIVE 발행은 이미 `--confirm` 을 요구하므로
그 규율을 상태에도 적용하면 된다.

> 참고: 이번에 만든 `aws/report-engine/social_publish.py` 는 승인 상태를 **읽기만** 하고
> 스스로 올리지 않는다. `APPROVED` 가 아니면 `PAYLOAD_READY` 로 끝난다.

---

## D. `--media` 가 확인되지 않은 문자열을 페이로드에 넣는다 — 인계

| | |
|---|---|
| 파일 | `aws/distribution/cli.py` (`--media` → `generate_payload(media_asset_id=…)`) |
| 소유 | **다른 세션 · 미커밋** |

임의 문자열이 `mediaId` 로 들어가고, 그것만으로 `media_required` 검사가 통과한다.
즉 **확인되지 않은(또는 존재하지 않는) 그림으로도 페이로드가 완성된다.**

**요청**: `media_asset_id` 를 시각 자산 매니페스트와 대조해서
`verified == true` 인 자산만 받게 한다. 판정 함수는 이미 있다 —
`aws/report-engine/social_publish.readiness(content, visual_assets=…)` 가
`visual_verified` 검사를 한다.

---

## E. 공개 경로의 SNS 초안 — 인계 (구조)

| | |
|---|---|
| 파일 | `aws/social-draft/handler.py` (`DST = events/social-drafts.json`) · `prototype/js/studio.js:392` |
| 소유 | 커밋된 파일이지만 **구조 변경**이라 단독 수정 대상이 아니다 |

`events/**` 는 공개다(실측 200). 초안이 매시간 그 경로에 올라간다.
옮기면 자격증명 없는 관리 화면이 깨진다 — 핸들러 버그가 아니라
**정적 관리 화면에 인증 면이 없다**는 구조의 결과다.

**요청**: 인증된 관리 읽기 경로(예: `prototype/supabase/functions/social-admin` 에
목록/본문 조회 추가) 를 만든 뒤 초안 접두사를 `archive/` 로 옮긴다.

그 전까지 이번에 한 것:
- `aws/_shared/publication_privacy.py` 가 이 구멍을 **알려진 구멍으로 기록**하고,
  `check_public_write()` 는 여전히 `allowed=False` 를 돌려준다(허용으로 바꾸지 않는다).
- 시험이 공개 번들을 훑어 비공개 상태가 실렸는지 확인한다.

---

## F. `write_local()` 와 `deploy-app.sh` — 인계

| | |
|---|---|
| 파일 | `aws/distribution/handler.py write_local()` · `aws/deploy-app.sh` |
| 소유 | handler.py 는 **다른 세션 · 미커밋** |

`write_local()` 은 개발용으로 후보를 로컬 디렉터리에 같은 경로 모양으로 쓴다.
그 자리가 `prototype/` 아래이고 배포 스크립트가 `prototype/` 을 통째로 올리면
후보가 공개된다. 지금 실제로 그렇게 돌고 있지는 않다.

**요청**: `write_local()` 에도 S3 경로와 같은 보류 규칙(`_withhold_from_public`)을 적용하고,
기본 출력 위치를 `prototype/` 밖(`build/`)으로 둔다.

---

## G. INTEGRATION-1 에서 그쪽 파일에 넣은 수정 — 아직 미커밋

§1 을 지켜 **커밋하지 않았다.** 작업 트리에 살아 있으니 그 세션이 커밋할 때 함께 가야 한다.

| 파일 | 무엇을 고쳤나 | 왜 |
|---|---|---|
| `aws/distribution/validation.py` | `_numeric()` — bool 을 숫자 풀에서 제외 | 파이썬에서 `bool` 은 `int` 라 `False` 가 `0.0` 으로 새어 캡션이 근거 없이 "0"·"1" 을 말할 수 있었다 |
| `aws/distribution/handler.py` | `_withhold_from_public()` — 차단·사람전용 후보 본문을 공개 경로에 올리지 않음 | 부분 완화(E 의 근본 해결 전까지) |
| `aws/report-engine/export.py` | 표지 지구 캡처 · 스토리 렌더 · `reportId` 표기 | 확인된 캡처만 그린다(§10) |

이 셋을 되돌리면 위 세 가지 보호가 함께 사라진다.

---

## 소유가 분명한, 이번에 내가 고친 것

| 파일 | 무엇 |
|---|---|
| `aws/cyclone-analog/handler.py` | 교차리드 순위 제거 · 리드분리 비교 추가 (A) |
| `aws/report-engine/capture.py` | 여섯 확인 조건 · §1 자산 기록 전체 |
| `aws/report-engine/publisher.py` | 리포트 승인 게이트(§6) |
| `aws/report-engine/social_publish.py` | 준비·승인·발행·되읽기 게이트 (신규) |
| `aws/_shared/publication_privacy.py` | 공개/비공개 경계 (신규) |
| `tools/earthus_capture.mjs` | 파일 되읽기 · 해시 · 픽셀검사 · 카메라 전체 |
| `prototype/v2-three/js/report-center.js` | 숫자 아닌 값을 숫자로 그리지 않음(§4) |
