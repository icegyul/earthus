# EARTHUS V2 INTEGRATION-11 HANDOFF

```text
PARENT:  c9d14bc8
DATE:    2026-09-08
```

차단 등급: `P0` 지금 위험 · `P1` 다음 단계 전 · `P2` 구조 정리

---

## A. 블로커 둘 — 그리고 그 둘뿐이다  ★P0

전용 문서: [integration-11-production-blocker.md](integration-11-production-blocker.md)

| | 무엇 | 필요한 것 | 누가 |
|---|---|---|---|
| A | 공개 금지 객체 95건 삭제 | `s3:DeleteObject` | AWS 관리자 |
| B | SOURCE = DEPLOY | `PopMetricMenu` 커밋 | 다른 세션 |

§14 의 열일곱 조건 중 **열다섯이 초록**이고 이번 단계에서 실행으로 다시 확인했다.
이 둘이 풀리는 날 곧바로 `PRODUCTION_BOUNDARY_LOCK` 을 만들 수 있다.

### 그날 할 일 (순서대로)

```bash
# 1. 삭제 권한이 붙으면
AWS_PROFILE=earthus-deploy python3 aws/live-audit.py \
  --out docs/earthus-v2/integration-12-live-audit.json \
  --candidates docs/earthus-v2/integration-12-delete-candidates.json \
  --cleanup docs/earthus-v2/integration-12-cleanup-command.txt
#    → 목록을 **새로** 만들고, 그 파일의 키 지정 명령만 실행한다
#    → 각 키 익명 되읽기 403/404, 그다음 live-audit 재실행해 forbidden = 0 확인
#    → 제품 경로 200 재확인 (특히 reports/published/report/2026-08/v1.json)

# 2. 다른 세션이 커밋하면
git status && bash tools/build-v2-bundle.sh && python3 aws/build-public.py --manifest
python3 aws/write-path-audit.py
#    → 배포 후 app/v2/js/report-center.js 가 200 이어야 한다

# 3. 둘 다 끝나면 §14 조건표를 다시 채우고 잠금 문서를 만든다
```

---

## B. OBJECT LOCK 은 아직 모른다 — 추측하지 말 것  ★P1

```text
NOT_VERIFIED
```

```text
get-object-lock-configuration → AccessDenied (s3:GetBucketObjectLockConfiguration)
get-bucket-versioning         → AccessDenied (s3:GetBucketVersioning)
```

증명한 것은 **응용 계층 불변성**이다:

```text
1  버전이 키 안에 있다          reports/published/report/2026-08/v1.json
2  IfNoneMatch="*" 조건부 쓰기   publisher.py:236 · 412 는 오류가 아니라 보존
실측  덮어쓰기 시도 → alreadyPreserved · sha256·ETag·Last-Modified·크기 전부 불변
```

버킷 차원 보존(Object Lock · versioning)은 **별개 개념**이다.
관리자 권한이 생기면 위 두 명령부터 확인할 것. 그전까지 어느 쪽으로도 적지 말 것.

---

## C. 95건을 인용할 때 — "DB 스키마"라고만 쓰지 말 것  ★P1

INTEGRATION-10 에서 바로잡은 것이 이번에도 그대로다.

```text
.ts 15건이 Supabase Edge Function **서버 소스**다 —
   checkout · payment-confirm · payment-refund · member-admin · social-admin
   _shared/admin-access · _shared/social-credentials …
```

동시에 **과장도 하지 말 것**: 표본에서 `sk_live_` · `service_role_key` · JWT · `AKIA`
0건이고 `social-credentials.ts` 는 vault 추상화를 쓴다.
정확한 성격은 **키 유출이 아니라 설계·공격면 노출**이다.

---

## D. 버킷 정책에 Deny 가 없다  ★P1

정책에는 Allow 문만 있다. 공개가 **접두사 단위**라 `app/*` 아래에 쓰이는 순간
세상이 읽는다. SQL 마이그레이션과 Edge Function 소스가 공개 웹에 있게 된 경로가 이것이다.

지금은 두 겹이 앞으로의 배포를 막는다:

```text
aws/build-public.py           거름망 (DENY_RULES · 허용 목록 우선)
aws/_shared/write_policy.py   값 추적 + 허용 목록 (264 지점 · 거부 0)
```

Deny 를 넣으면 더 튼튼하지만 **우리 배포 신원까지 막을 수 있다**
(S3 Deny 는 조건 없이는 모든 주체에 적용된다).
넣는다면 `NotPrincipal` 또는 `aws:PrincipalArn` 조건을 반드시 함께 설계할 것.

---

## E. `next_version()` 이 옛 승인 기록을 들고 간다  ★P2

새 판을 만들면 v1 의 `approval` 블록이 복사된다. 지금은 해시가 달라져
`APPROVAL_INVALID` 로 즉시 무효화되므로 fail-closed 이고 실피해는 없다(재확인함).

그래도 깊이 방어로는 아예 지우는 편이 낫다:

```python
# publisher.next_version()
out.pop("approval", None)      # 옛 승인은 새 판의 승인이 아니다
```

해시 검사에만 기대면 서명 대상이 바뀌는 날 조용히 뚫린다.

---

## F. 리포트 → 시뮬레이션이 이 보고서에 없는 것은 정상이다  ★P2

배선은 있다(`report-center.js:165` "조건을 바꿔보기" / "Change the conditions").
버튼은 현상이 `capabilities.simulation === true` 일 때만 붙고, 그런 현상은
`ocean.wave` · `hazards.tsunami` 둘뿐이다. 2026-08 보고서의 스토리는
`ocean/sstfield` · `weather/tempgrid` · `land/seaice` 라 해당이 없다.

**없는 버튼을 만들지 않는 것이 맞다.** 시뮬레이션 자체는 인텔 패널에서 따로 확인했다.
파도·쓰나미 스토리가 실린 보고서가 나오면 그때 이 경로를 다시 볼 것.

---

## G. 예보 채점표가 실제로는 한 줄도 채점하지 않았다  ★P2

규칙 시험 17건은 전부 통과한다(건너뜀 0). 다만 실제 산출물의 채점표는
`evaluatedCount: 0` — 모든 줄이 `NOT_EVALUABLE` 이다. 검증 입력
(`wind/series/verify-daily.json`)이 저장소에 없어 점수가 실린 줄은 **단위 픽스처로만**
증명된다. 규칙 D(점수는 표본 수와 함께 나간다)가 실제 산출물에서 발동한 적이 없다.

---

## G-2. VIDEO 상태가 **시스템 안에 없다** — 이 저장소 교리와 어긋난다  ★P2

`sections.py:5` 가 이 저장소의 규칙을 이렇게 적어 놓았다:

```text
자료가 없다고 절을 지우지 않는다 — 지우면 독자는 그런 주제가 아예 없다고 읽는다.
대신 `NOT_AVAILABLE` 과 사유를 적는다(§119).
```

리포트 절은 그 규칙을 지킨다(채점표가 `NOT_EVALUABLE` 과 사유를 남긴다).
**미디어 쪽만 지키지 않는다** — 어느 산출물에도 VIDEO 가 `NOT_AVAILABLE` 로 적혀 있지
않다(실측 0건). 파이프라인은 영상에 대해 그냥 침묵한다.

거짓말은 아니다(구현했다고 주장하는 곳이 없다). 그러나 **"VIDEO = DEFERRED" 가 지금
문서에만 있고 시스템 안에는 없다.** 이 문서들을 안 읽은 사람은 영상이라는 주제가
아예 없다고 읽는다 — §119 가 막으려던 바로 그것이다.

고칠 때는 미디어 매니페스트에 한 줄을 더하는 정도면 된다:

```text
{"kind": "VIDEO", "state": "NOT_AVAILABLE", "reason": "영상 생성 경로가 저장소에 없다"}
```

INTEGRATION-11 은 새 개발을 금지하고 §11 의 요구("구현했다고 주장하지 않는다")는
이미 충족하므로 이번에 고치지 않았다.

---

## G-3. 표본 수가 산출물까지 가지 않는다  ★P2

`nByMetric` 은 어댑터(`kma_verify_adapter.py:98`)와 시험에만 있다.
**어느 산출물에도 실려 있지 않다**(실측 0건) — 채점표의 `evaluatedCount` 가 0 이라
점수가 실린 줄이 한 번도 만들어진 적이 없기 때문이다.

§10 의 "sample size: visible" 은 **어댑터 계약 수준에서** 지켜지고 있고 시험이 못 박는다.
다만 제품 산출물에서 확인된 적은 없다. 위 G 항목(채점표가 한 줄도 채점 안 함)과 같은 뿌리다.

---

## H. VIDEO — DEFERRED 유지  ★P2

배포 UI 는 영상을 만들 수 있다고 말하지 않는다(릴스 탭: "1단계 출력은 순번이 붙은
PNG 묶음입니다"). `VIDEO_AVAILABLE` 토큰은 저장소에 없다.
판정 근거와 남은 정리거리 넷은
[integration-9-video-decision.md](integration-9-video-decision.md) 에 있다.

---

## I. 앞 단계에서 남은 것

| | 상태 |
|---|---|
| `app/orbital/` 객체 0건 · `--delete` 권한 없어 그 배포는 성공한 적 없음 | 남음 (다섯 단계째) |
| `distribution/cli.py:243` 자동 승인 | 남음. 발행 문은 닫혀 있고 표시만 문제 |
| `distribution/handler.py` 가 DRAFT 를 공개 `events/` 에 | 남음 (다른 세션) |
| `youtube`·`tiktok` 어댑터가 PRIMARY 인데 영상 후보를 만들 수 없다 | 남음 (P2) |
| 리드 합산 계산기 (여진·화산재·대기질·표류) | 남음 |
| 절 구성 두 벌 (`sections.py` vs `compose.py`) | 남음 |
| `config.local.js` 의 ADMIN_UIDS | 남음 |
| 인증 없는 관리 화면 · `aetherus-device-qa.html` 죽은 링크 | 남음 |
| 시각자산 값 판정 두 벌 | 남음 |
| `app/js/earthus2/v07/` 앱이 안 부르는데 공개 | 남음 (P2) |
| `test_kma_hub.py` 조합별 실패 (`botocore[crt]`) | 남음 — 환경 문제 |
| `report-engine` + `distribution` 동시 실행 시 모듈 충돌 | 남음 — 따로 돌린다 |

---

## 참고 — 이번 단계가 한 것

새 기능도 코드 변경도 없다. **닫혔다고 적힌 것을 실행으로 다시 물었다.**

| | |
|---|---|
| 신선 실사 | 25,522건을 새로 훑어 다섯 갈래로. UNKNOWN 0 · 발행본 2건은 KEEP_PUBLIC |
| 삭제 | 권한 없음을 존재하지 않는 키로 확인. **0건 삭제 · 우회 없음** |
| 불변성 | 운영에서 실제 덮어쓰기 시도 → 거부 · 해시·ETag·시각·크기 전부 불변 |
| 새 판 경로 | v2 는 DRAFT → 검증 → 사람 승인 → 발행. 옛 승인은 넘어오지 않는다 |
| 승인 문 | 열거된 여덟 가지 + 지난 단계에서 막은 구멍 셋 재확인 |
| 쓰기 경로 | 264 지점 · 거부 0 · 아홉 가지 키 모양 · 읽기 전용 오탐 0 |
| 예보 | 리드 6종 독립 · 17건 · 건너뜀 0 |
| 브라우저 | 4칸 전부에서 지구·인텔 7탭·리포트센터·발행본·현상·인텔리전스·공유 확인 |
| Object Lock | **확인 불가**를 확인 불가로 적었다(추측 없음) |
| 교차 검증 | 별도 검사 다섯 갈래를 병렬로 돌려 대조. PASS 3 · PARTIAL 2 |
| 표현 정밀화 | PARTIAL 둘이 짚은 것(§119 침묵 · 표본 수 미노출)과 `character-studio/` 403 이 **공허한 통과**임을 보고서에 반영 |
