# EARTHUS V2 INTEGRATION-1 RESULT

```text
STATUS:     PARTIAL
BASELINE:   21519870
HEAD:       (이 문서를 담은 커밋)
```

---

## 요약

지시서는 "엔진을 더 만들지 말고 이미 만든 것을 하나로 묶으라"고 했다. 감사 결과
**요구 항목의 상당수가 이미 구현돼 있었다** — 통합 콘텐츠 객체, 리포트→콘텐츠 다리,
SNS 채널 규격, 카메라 결정, 시각 자산 메타, 수동 승인 게이트가 전부 있었다.

진짜로 비어 있던 것은 **하나**였다: 시각 사양을 실제 그림으로 바꾸는 실행기.
그래서 이번 작업의 대부분은 새 엔진이 아니라 **연결선**이다.

---

## CANONICAL ARCHITECTURE

```text
                    phenomenon-registry.js   ← 현상·레이어 정본 (JS)
                              │  (파이썬은 phenomenon_registry.py 로 **읽기만**)
        DATA ──► ADAPTERS ──► FACTS ──► SIGNIFICANCE ──► STORIES
                                 │                          │
                                 │                     CROSS-DOMAIN
                                 ▼                          │
                            compose.py  ◄───────────────────┘   (절 구성 정본)
                                 │
                    ┌────────────┼─────────────┐
                    ▼            ▼             ▼
              capture.py     narrative.py   generator.py
            + earthus_capture   (문장)       (봉투·검증·성적표)
              (실제 런타임 캡처)                 │
                    │                            ▼
              VISUAL MANIFEST ──────────► REPORT ARTIFACT
                                              │
                          ┌───────────────────┼──────────────────┐
                          ▼                   ▼                  ▼
                     export.py          report_bridge.py    publisher.py
                  (HTML/MD/JSON)      → content_contract    (불변 발행)
                                        → distribution/generator
                                            → visual.py (사양)
                                            → sns_adapters (페이로드)
                                            → 사람 승인 → 큐
```

**입구는 하나**: `python aws/report-engine/cli.py full --period 2026-08`

---

## 항목별

| 항목 | 결과 |
|---|---|
| REPORT ENGINE | 정본 1개 — `pipeline.py`(계산) + `generator.py`(봉투) + `compose.py`(절) |
| DUPLICATE MODULES | **1건 남음** — `sections.py`. 아무도 부르지 않아 충돌은 없으나 파일은 존재 |
| DUPLICATE CLI | **해소** — `cli.py full` 하나. `pipeline.py __main__` 은 별칭이며 그렇게 안내한다 |
| FORECAST | `kma_verify_adapter` 단일 산출. 배포 쪽은 그 파일을 불러 쓴다(재계산 없음) |
| VERIFICATION | `ForecastVerification` 하나. 정본 성적표를 리포트에 실어 화면이 그대로 읽는다 |
| VISUAL ENGINE | 사양=`distribution/visual.py`, 실행·매니페스트=`capture.py`+`earthus_capture.mjs` |
| EARTHUS CAPTURE | **실물 1건** — 1280×720, 레이어 확인, 카메라 확인, 빈 프레임 아님 |
| REPORT | 실제 운영 자료 기반 `report:2026-08` — 팩트 57 · 스토리 20 · 교차도메인 5 |
| CONTENT OBJECT | `content_contract.make_content` (이미 있던 것) |
| DISTRIBUTION | `report_bridge` → `generator.build` → `with_platforms` (이미 있던 것, 이번에 배선) |
| SNS | 페이로드 2종(x · instagram) 생성. **게시 안 함** |
| ARCHIVE | 리포트=`build_report_archive_index`, 콘텐츠=`distribution/archive.py` (분리 유지) |
| PROVENANCE | `aws/_shared/provenance.py` 단일 |
| PUBLICATION SECURITY | **미해결** — 아래 별도 절 |
| UI | 리포트 센터가 정본 산출물만 읽는다. 성적표 재계산 제거 |
| BROWSER | 1440×900 KO/EN · 375×812 EN 통과. 가로 스크롤 0 · 콘솔 오류 0 |
| TESTS | 231 통과 (report-engine 123 · _shared 37 · distribution 71) + npm 45 + v2 4종 |
| BUNDLE | 소스 = 배포 |
| UNRELATED | 0 |

---

## 종단 시험 (§30~§33)

```text
python aws/report-engine/integration_e2e.py --period 2026-08 --capture-meta …

  [OK] DATA         받은 자료 6종
  [OK] REPORT       report:2026-08 · 팩트 57 · 스토리 20 · 라벨 DATA_PARTIAL
  [OK] VISUAL       실제 런타임 캡처 · 레이어·카메라 확인됨
  [OK] EXPORT       html, json, md — 셋이 같은 reportId·스냅샷·엔진판
  [OK] CONTENT      CNT-2026-000001 · MONTHLY_EARTH · 자격 REVIEW_REQUIRED
  [OK] SINGLE_FACT  리포트 팩트 숫자 106 · 콘텐츠 숫자 106  (하나도 새지 않음)
  [OK] SNS_PAYLOAD  instagram, x
  [OK] APPROVAL     DRAFT — 사람이 승인해야 큐로 간다. 자동 게시 경로 없음
  [OK] PUBLISH      PAYLOAD_READY · NOT_PUBLISHED
```

§33 의 자동 대조는 숫자·기간·현상·리포트참조·출처 다섯 가지를 본다.
콘텐츠가 리포트에 없는 값을 하나라도 쓰면 실패한다.

---

## EARTHUS CAPTURE — 어떻게 "임의의 지구 사진"이 아님을 보장하나

1. 팩트의 현상 → **레지스트리에서** 대표 레이어를 찾는다(손으로 적지 않는다).
2. `visual.camera_for` 가 기하에서 카메라를 정한다(모르면 전지구로 물러난다).
3. `dist = 1 + altKm/6371` 로 v2-three 링크를 만든다(런타임 공식의 역함수).
4. 헤드리스로 **실제 v2-three** 를 열고 `applyLink` 가 복원하게 둔다.
5. 찍은 뒤 **되읽어 확인한다** — 레이어가 켜졌나, 카메라가 그 자리인가.
6. 픽셀 분산을 재서 빈 프레임이면 실패시킨다.
7. 확인 실패한 캡처도 버리지 않고 `verified:false` 로 남긴다. 보고서는 **그리지 않는다.**

실제 결과: `sstfield` 켜짐 · 20.0/130.0/4.7671 일치 · 분산 40.7 · 1280×720.

> ⚠️ 링크 문법에 **시각 필드가 없다.** 캡처는 "그 기간의 지구"가 아니라
> "실행 시점 자료로 그린 그 지역"이다. 메타데이터에 그대로 적는다.

---

## PUBLICATION SECURITY — 미해결 (가장 중요한 남은 문제)

**`events/social-drafts.json` 이 지금 공개로 열려 있다** (200, 미게시 초안 2건 포함).
`aws/distribution/handler.py` 는 첫 실행 시 `events/distribution-content/` 에
후보 본문을 써서 두 번째 노출을 만든다.

간단히 못 옮기는 이유: 관리 화면 두 개가 **자격증명 없이** 그 공개 경로를 직접 읽는다
(`studio.js:392`, `distribution-admin.js:26`). 핸들러의 버그가 아니라 **정적 관리 화면에
인증 면이 없다**는 구조의 결과다.

이번에 한 것 — 부분 완화:
차단(BLOCKED)·사람 전용(LEVEL_3) 후보는 본문을 공개 경로에 올리지 않는다(목록에는 남는다).

다음에 해야 할 것: 인증된 관리 API. 그 전에는 이 노출이 남는다.

---

## 리드타임 평균 — 표준 위반 (고치지 않음)

`aws/cyclone-analog/handler.py:1243 · :1709` 이 6시간~120시간 예보 오차를 한 숫자로 평균하고
**`:1711` 에서 그 숫자로 기관 순위를 매긴다.** 저장소의 "리드타임을 합치지 않는다" 규칙 위반이다.
`byLead` 분해는 옆에 남아 있으므로 자료는 살아 있다.

고치지 않은 이유: 운영 Lambda 의 **공개 순위 산출**을 바꾸는 일이라 제품 결정이 필요하다.

---

## 이번에 고친 결함

1. **레이어 키를 손으로 적어 캡처가 빈 지구를 찍던 것** — `ocean/sst`(없음) vs `ocean/sstfield`(실제).
   이제 파이썬이 JS 레지스트리를 읽는다. 시험이 109/66 일치를 확인한다.
2. **화면이 성적표를 다시 만들며 '평가 불가' 행을 통째로 떨어뜨리던 것** —
   엔진이 일부러 남기는 행이 UI 필터에서 사라졌다. 이제 정본 성적표를 그대로 그린다.
3. **참값이 숫자 풀에 새던 것** — 파이썬에서 `bool` 은 `int` 라 `False` 가 `0.0` 으로 들어갔다.
   캡션이 근거 없이 "0"·"1" 을 말해도 통과할 수 있었다.
4. **두 입구가 같은 reportId 를 찍어 불변 발행 키가 부딪히던 것** — 입구를 하나로 합쳤다.
5. 세 형식(HTML/MD/JSON)이 `reportId` 를 안 싣던 것.

---

## FILES CHANGED (커밋에 포함)

```text
새로 만든 것
  aws/_shared/phenomenon_registry.py      JS 레지스트리 리더 (베끼지 않는다)
  aws/report-engine/capture.py            캡처 요청·검증·매니페스트
  aws/report-engine/integration_e2e.py    종단 시험
  aws/report-engine/tests/test_integration1.py   21건
  tools/earthus_capture.mjs               실제 런타임 헤드리스 캡처
  docs/earthus-v2/INTEGRATION-1-{AUDIT,OWNERSHIP,RESULT}.md

고친 것
  aws/report-engine/cli.py                full 하위명령 = 정본 입구
  aws/report-engine/pipeline.py           정본 성적표 첨부 · 내보내기 배선 · 입구 안내
  aws/report-engine/compose.py            hydrate_sections
  aws/report-engine/adapters/*.py         레이어 키를 레지스트리에서
  prototype/v2-three/js/main.js           captureImage({dataUrl}) 반환 모드
  prototype/v2-three/js/report-center.js  정본 성적표 소비
  prototype/v2-three/index.html           .rc-na
  prototype/v2-deploy/**                  번들 재생성
```

## 커밋에 **포함하지 않은** 수정 — 다른 세션 소유

§1 이 "다른 세션의 미커밋 변경을 본 작업과 혼합하지 않는다"고 했으므로, 아래 세 파일의
수정은 **작업 트리에 살아 있으나 커밋하지 않았다.** 그 세션이 커밋할 때 함께 가야 한다.

| 파일 | 무엇을 고쳤나 |
|---|---|
| `aws/distribution/validation.py` | bool 이 숫자 풀에 새던 구멍 |
| `aws/distribution/handler.py` | 차단·민감 후보의 공개 보류 |
| `aws/report-engine/export.py` | 표지 지구 캡처 · 스토리 렌더 · reportId |

---

## KNOWN LIMITATIONS

- `sections.py` 가 남아 있다 → §43 "중복 정본 0" **미충족**. 소유권 문제이지 코드 문제가 아니다.
- 공개 초안 노출이 남아 있다 → §43 "PUBLIC DRAFT LEAK 0" **미충족**.
- 파이썬 시험 231건이 `npm test` 에 연결돼 있지 않다(수동 실행). CI 변경은 §0 이 얼린 범위.
- 데이터 차트·지도 이미지(§10)는 만들지 않았다. 지구 캡처만 있다.
- 375×812 KO 는 이번 회차에서 EN 만 확인했다(KO 는 PHASE 8 에서 확인).
- `report_bridge._period_label` 이 기간 표기를 자체 계산한다(분기가 연도로 보일 수 있음). 미수정.
- FREE/PRO 는 여전히 **표시 구분**이지 보안 경계가 아니다.

---

## NEXT

INTEGRATION 수용 이후에만 기능 개발을 재개한다. 남은 통합 과제 순서:

1. 인증된 관리 API → 초안을 비공개로 (가장 위험한 것부터)
2. `sections.py` 를 `compose.py` 로 위임하는 어댑터로 (그 세션과 합의 후)
3. `cyclone-analog` 의 리드 평균·순위 (제품 결정 필요)
4. 파이썬 시험을 CI 러너에 연결
5. 데이터 차트/지도 시각자료
