# EARTHUS V2 INTEGRATION-10 HANDOFF

```text
PARENT:  cac73114
DATE:    2026-09-08
```

차단 등급: `P0` 지금 위험 · `P1` 다음 단계 전 · `P2` 구조 정리

---

## A. 남은 블로커 둘 — 둘 다 이 세션 밖의 일이다  ★P0

전용 문서: [integration-10-production-blocker.md](integration-10-production-blocker.md)

| | 무엇 | 필요한 것 | 누가 |
|---|---|---|---|
| A | 공개 금지 객체 95건 삭제 | `s3:DeleteObject` | AWS 관리자 |
| B | SOURCE = DEPLOY | `PopMetricMenu` 커밋 | 다른 세션 |

**이 둘이 풀리면 그날로 `PRODUCTION_PUBLISH_READY = YES` 를 판정할 수 있다.**
나머지 열네 조건은 전부 초록이고, 이번 단계에서 실행으로 다시 확인했다.

---

## B. 95건이 무엇인지 — 표현을 바로잡았다  ★P0

앞 단계들이 "DB 스키마·마이그레이션"이라고만 적어 왔다. 실제로는 **서버 소스**가 섞여 있다.

```text
.ts 15건  Supabase Edge Function 서버 소스 — 전부 익명 200
          checkout · payment-confirm · payment-refund · member-admin · social-admin
          _shared/admin-access · _shared/social-credentials …
```

**자격증명은 없다.** 표본에서 `sk_live_` · `service_role_key` · JWT · `AKIA` 0건이고,
`social-credentials.ts` 는 값이 아니라 vault 추상화를 쓴다. 과장하지 말 것.

정확한 성격: **키 유출이 아니라 설계·공격면 노출**이다 — 결제·환불·관리자 접근 제어
로직, RPC 이름, vault 경로 규칙, 테이블·함수 서명. 그래도 지워야 한다.

다음 사람이 이 항목을 인용할 때 "DB 스키마"라고만 적지 말 것.

---

## C. 버킷 정책에 Deny 가 없다 — 이게 이렇게 된 이유다  ★P1

정책에는 Allow 문만 있다. 공개는 **접두사 단위**로 주어지므로
`app/*` 아래에 쓰이는 순간 세상에 읽힌다. SQL 마이그레이션과 Edge Function 소스가
공개 웹에 있게 된 경로가 정확히 이것이다 — 아무도 그것을 공개하기로 결정하지 않았다.

지금은 두 겹이 앞으로의 배포를 막는다:

```text
aws/build-public.py       거름망 (DENY_RULES · 허용 목록 우선)
aws/_shared/write_policy.py  값 추적 + 허용 목록 (264 지점 · 거부 0)
```

Deny 문을 넣으면 더 튼튼해지지만 **우리 배포 신원까지 함께 막을 수 있다**
(S3 Deny 는 조건을 걸지 않으면 모든 주체에 적용된다). 이번에 손대지 않았다.
넣는다면 `NotPrincipal` 또는 `aws:PrincipalArn` 조건을 반드시 함께 설계할 것.

---

## D. 리포트 불변성은 응용 계층이 지킨다 — 버킷 차원은 확인 못 했다  ★P1

덮어쓰기 거부를 운영에서 실측했다(해시·ETag·Last-Modified 전부 불변).
막는 것은 두 겹이다:

```text
1  버전이 키 안에 있다        reports/published/report/2026-08/v1.json
2  IfNoneMatch="*" 조건부 쓰기  publisher.py:236 · 412 는 오류가 아니라 보존
```

⚠️ 다만 이것은 **응용 계층 + S3 조건부 쓰기**다. 버킷 Object Lock 이 아니다.
이 자격증명은 versioning·object-lock 설정을 읽을 권한이 없어 **버킷 차원의 보존
장치가 있는지 확인하지 못했다.** 있다고도 없다고도 적지 않는다 — 모른다.
관리자 권한이 생기면 `get-bucket-versioning` · `get-object-lock-configuration` 을 확인할 것.

---

## E. `next_version()` 이 옛 승인 기록을 들고 간다  ★P2

새 판을 만들면 v1 의 `approval` 블록이 그대로 복사된다. 지금은 해시가 달라져
`APPROVAL_INVALID` 로 즉시 무효화되므로 **fail-closed 이고 실피해는 없다**(실측 확인).

그래도 깊이 방어로는 아예 지우는 편이 낫다:

```python
# publisher.next_version()
out.pop("approval", None)      # 옛 승인은 새 판의 승인이 아니다
```

해시 검사에만 기대면, 서명 대상이 바뀌는 날 조용히 뚫린다.

---

## F. VIDEO — §14 는 통과다. 다만 한 줄은 다듬을 만하다  ★P2

전용 문서: [integration-9-video-decision.md](integration-9-video-decision.md)

배포 UI 는 영상을 **만들 수 있다고 말하지 않는다**. 릴스 탭이 "1단계 출력은 순번이 붙은
PNG 묶음입니다" 라고 명시하고, 지구 앱(`v2-deploy`·`v2-three`)에는 영상 주장이 0건이며,
`VIDEO_AVAILABLE` 토큰은 저장소에 존재하지 않는다.

> 이번 검사 중 하나가 `social-settings.html:108` 의 "현재 earthus 연결은 영상 게시를
> 지원합니다" 를 §14 위반으로 올렸다. 확인한 뒤 **내렸다** — 그 문장은 TikTok 자격증명
> 설정 안내 안에 있고, 그 API 가 영상 전용이라 연결이 `video.publish` 범위를 받는다는
> 뜻이다. 매체는 운영자가 **가져오고**("사진·영상 가져오기"), 화면들이 "영상만 게시할 수
> 있습니다"라고 명시하며, 사람 업로드 발행 경로는 실제로 있다.

남은 다듬을 거리(P2, 급하지 않음):

1. 채널 선택 줄이 "영상은 직접 올려야 한다"를 따로 말하지 않는다.
2. `youtube` · `tiktok` 어댑터가 `PRIMARY` 에 있는데 형식이 `("SHORT_VIDEO",)` 하나뿐이라
   엔진이 만든 후보는 어떤 것도 통과할 수 없다 — §143 "못 하는 것을 할 수 있는 것처럼
   두지 않는다" 와 어긋난다.
3. dev-spec·MARKETING-STUDIO-SPEC 이 "카드/영상 생성"을 이미 되는 것처럼 적는다.
4. 영상이 V2 범위 밖이라고 못 박은 문장이 어디에도 없다 — 서면으로 원하면 새로 적어야 한다.

---

## G. 리포트 → 시뮬레이션은 이 보고서에 안 나온다 — 정상이다  ★P2

배선은 있다(`report-center.js:165` "조건을 바꿔보기" / "Change the conditions").
버튼은 현상이 `capabilities.simulation === true` 일 때만 붙는데, 그런 현상은
`ocean.wave` · `hazards.tsunami` 둘뿐이다. 2026-08 보고서의 스토리는
`ocean/sstfield` · `weather/tempgrid` · `land/seaice` 라 해당이 없다.

**없는 버튼을 만들지 않는 것이 맞다.** 시뮬레이션 자체는 따로 눌러 돌려 확인했다
(태풍 카테고리 3 · 눈까지 35km · `SCENARIO — 공식 예보 아님`).
파도·쓰나미 스토리가 실린 보고서가 발행되면 그때 이 경로를 다시 확인할 것.

---

## H. 예보 채점표가 실제로는 한 줄도 채점하지 않았다  ★P2

규칙 위반은 아니다. 규칙 시험 17건은 전부 통과한다(건너뜀 0).
다만 실제 산출물의 채점표는 `evaluatedCount: 0` — 모든 줄이 `NOT_EVALUABLE` 이다.
검증 입력(`wind/series/verify-daily.json`)이 없어서, 점수가 실린 줄은 **단위 픽스처로만**
증명된다. 규칙 D(점수는 표본 수와 함께 나간다)가 실제 산출물에서 한 번도 발동한 적이 없다.

---

## I. 앞 단계에서 남은 것

| | 상태 |
|---|---|
| `app/orbital/` 객체 0건 · `--delete` 권한 없어 그 배포는 성공한 적 없음 | 남음 (네 단계째) |
| `distribution/cli.py:243` 자동 승인 | 남음. 발행 문은 닫혀 있고 표시만 문제 |
| `distribution/handler.py` 가 DRAFT 를 공개 `events/` 에 | 남음 (다른 세션) |
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

새 기능을 만들지 않았고 코드도 고치지 않았다. **닫혔다고 적힌 것들이 정말 닫혀 있는지
실행으로 다시 물었다.** 505건 전부 통과.

| | |
|---|---|
| 신선 실사 | 25,498건을 새로 훑어 다섯 갈래로 분류. UNKNOWN 0 · 발행본 2건은 KEEP_PUBLIC |
| 불변성 | 운영 자격증명으로 실제 덮어쓰기를 시도해 거부됨을 확인(해시·ETag·시각 불변) |
| 승인 문 | 열거된 여덟 가지 + 지난 단계에서 막은 구멍 셋을 다시 두들겨 전부 막힘 확인 |
| 쓰기 경로 | 264 지점 · 거부 0 · 아홉 가지 키 모양 회귀 29건 · 읽기 전용 오탐 0 |
| 예보 | 리드 6종 독립 · 17건 통과 · 건너뜀 0 |
| 브라우저 | 4칸 전부에서 발행 보고서를 실제로 열고 현상·인텔리전스·시뮬레이션까지 눌렀다 |
| 표현 교정 | 95건을 "DB 스키마"가 아니라 **서버 소스 포함**으로 바로잡았다 |
| 과장 방지 | 검사 하나가 올린 §14 FAIL 을 직접 확인해 내렸다(근거를 문서에 남김) |
