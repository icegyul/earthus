# EARTHUS V2 INTEGRATION-8 HANDOFF

```text
PARENT:  cd52baae
DATE:    2026-09-08
```

차단 등급: `P0` 지금 위험 · `P1` 다음 단계 전 · `P2` 구조 정리

---

## A. 권한 둘이면 운영 발행이 열린다  ★P0

전용 문서: [integration-8-production-blocker.md](integration-8-production-blocker.md)

| | 무엇 | 필요한 권한 |
|---|---|---|
| A | 공개 금지 객체 95건 삭제 | `s3:DeleteObject` |
| B | `reports/` 를 공개 읽기 정책에 추가 | `s3:PutBucketPolicy` |

B 가 이번에 새로 드러난 것이다. **리포트를 발행해도 앱이 못 읽는다.**
버킷 정책의 두 Allow 문 어디에도 `reports/*` 가 없고, 앱은 CloudFront 를 거치지 않고
S3 REST 주소로 직접 받는다. 실행 중인 앱에서 403 을 확인했다.

이 둘 말고 운영 발행을 막는 것은 없다. 앞으로 올라갈 것에 대해서는 경계가 닫혀 있고,
남은 95건은 전부 과거 잔존물이다.

---

## B. 번들 — 다른 세션이 커밋해야 한다  ★P1

```text
 M prototype/v2-three/index.html
 M prototype/v2-three/js/main.js
 M prototype/v2-three/js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

그쪽 `PopMetricMenu` 작업이 커밋된 뒤 **한 번에** 재생성한다:

```bash
git status                       # 미커밋이 없는지 확인
bash tools/build-v2-bundle.sh
python3 aws/build-public.py --manifest
python3 aws/write-path-audit.py  # 배포기가 늘었는지 확인
```

지금 돌리면 미완성 코드가 번들에 박힌다. (INTEGRATION-7 에서도 같은 이유로 막혔다.)

---

## C. 새 검사기를 쓸 때 — 다섯 번 같은 방식으로 뚫렸다  ★P1

같은 실수가 층만 바꿔 다섯 번 반복됐다. 전부 **"적힌 모양"** 을 찾다가 뚫렸다.

| 단계 | 뚫린 지점 | 고친 방식 |
|---|---|---|
| INTEGRATION-4 | `.sh` 만 훑었다 → `.mjs` 업로더를 놓쳤다 | 확장자로 거르지 않는다 |
| INTEGRATION-5 | 목적지 **문자열**로 걸렀다 → 변수 업로더를 놓쳤다 | 올리는 **동작**으로 센다 |
| INTEGRATION-7 | 호출 자리 **리터럴**만 봤다 → 상수로 뺀 키를 놓쳤다(0건) | 대입까지 따라간다 |
| INTEGRATION-7 | 넓히기만 했다 | app/ 를 **읽는** 람다 넷이 잡혔다(오탐) |
| INTEGRATION-8 | 값 추적조차 **범위를 안 나눴다** | 남의 함수 `args` 사전을 끌어 썼다 |

이제 값을 따라간다: [`aws/_shared/write_path.py`](../../aws/_shared/write_path.py).
파이썬은 `ast`, 자바스크립트·셸은 상수 전파. 판정은
[`aws/_shared/write_policy.py`](../../aws/_shared/write_policy.py) 가 한다.

**다음 사람이 지켜야 할 두 가지**

1. 검사기를 고쳤으면 `test_integration8_write_path.py` 의 CASE A/B/C 가 **여전히
   잡히는지** 확인할 것. "거부 0" 은 그 시험이 살아 있을 때만 의미가 있다.
2. 넓힌 다음에는 **반드시 오탐을 볼 것**. 읽기 전용 람다 넷(`air-state` ·
   `health` · `obis-summary` · `space-archive`)이 이름째로 시험에 박혀 있다.

### 값 추적이 닿지 않는 5곳

`write_policy.REVIEWED_UNPROVEN` 에 근거 줄과 함께 있다. 새 미증명 쓰기가 생기면
`test_사람확인_건수가_실제와_같다` 가 깨진다 — 조용히 늘어나지 못한다.
더 자동으로 풀고 싶다면 다음 순서로 손대면 된다:

```text
1) 함수 인자 전파 (호출 자리 인자 → 매개변수)   character-studio job_key 가 풀린다
2) 사전 리스트 순회 (for spec in SPECS)         signal-foundation · source-governance
3) 튜플 언팩 (key, body = item)                 gk2a-clouds
```

---

## D. 리포트 화면이 "못 읽음"과 "없음"을 구분하지 못한다  ★P1

```js
// prototype/*/js/ui-shell.js:596
.then((r) => (r.ok ? r.json() : null))
```

403 도 404 도 "아직 발행된 보고서가 없습니다" 로 나온다. 권한 없이도 고칠 수 있다.
위 A-B 를 풀기 전이라도 이건 먼저 고쳐 두는 편이 낫다 — 안 그러면 정책을 고친 뒤에도
무엇이 잘못됐는지 화면이 말해 주지 않는다.

---

## E. 영상 엔진 없음  ★P2

MEDIA E2E 의 CARD · VISUAL · REPORT HIGHLIGHT 는 있고 **VIDEO 는 없다.**
이 저장소에 영상 생성 경로가 존재하지 않는다. 별도 단계로 잡아야 한다.

---

## F. 쓰나미 시뮬은 대상 사건이 있어야 눌린다  ★P2

이번 브라우저 점검에서 태풍(파도) 시뮬은 실제로 눌러 돌렸다. 쓰나미 시뮬은
화면에 입구가 없었다 — `events/tsunami*.json` 이 없고 도달시간 엔진은 대상이 없으면
404 다. **없는 것을 눌렀다고 적지 않았다.** 대상 사건이 있을 때 다시 확인할 것.

---

## G. `build/orbital` 이 거름망 밖이다 — 지금은 실피해 없음  ★P2

`aws/deploy-orbital-static.sh` 는 `services/aetherus-orbital/frontend` 를
`__pycache__` 말고는 아무것도 거르지 않고 복사한 트리를 올린다.
그 스크립트만 `--delete` 를 쓰는데 권한이 없어 `set -euo pipefail` 에서 죽는다 —
`app/orbital/` 객체는 여전히 0건이다. **한 번도 성공한 적이 없다.**

되살리기 전에 부류 검사를 붙이고 `--delete` 와 리전(혼자 `ap-northeast-2`)을 정리할 것.
`write_policy.APP_WRITERS` 에 그 사유가 적혀 있다.

---

## H. `app/js/earthus2/v07/` — 앱이 부르지 않는데 공개된다  ★P2

20개 JS 모듈(93 KB)이 공개 빌드에 들어가지만 앱 어디서도 import 하지 않는다.
죽은 코드는 아니다 — `.claude/worktrees/.../tools/earthus2-v07/*.test.mjs` 가 쓴다.
아직 쓰이지 않는 백엔드 설계 묶음이다. 비밀은 없다(INTEGRATION-3 에서 이미 확인).
그 안의 `postgres/*.sql` 은 이미 거름망이 막고 삭제 후보에도 있다.

거를지 말지는 제품 판단이라 **이번에 바꾸지 않았다.**

---

## I. 앞 단계에서 남은 것

| | 상태 |
|---|---|
| `distribution/cli.py:243` 자동 승인 | 남음. 발행 문은 닫혀 있고 표시만 문제 |
| `distribution/handler.py` 가 DRAFT 를 공개 `events/` 에 | 남음 (다른 세션) |
| 리드 합산 계산기 (여진·화산재·대기질·표류) | 남음 — 태풍 사건 방까지만 고쳤다 |
| 절 구성 두 벌 (`sections.py` vs `compose.py`) | 남음 |
| `config.local.js` 의 ADMIN_UIDS | 남음 |
| 인증 없는 관리 화면 · `aetherus-device-qa.html` 죽은 링크 | 남음 |
| 시각자산 값 판정 두 벌 | 남음 |
| `app/v3/` · `app/v2/index.html` 을 두 배포기가 나눠 씀 | 남음 |
| `test_kma_hub.py` 조합별 실패 (`botocore[crt]`) | 남음 — 환경 문제 |
| `report-engine` + `distribution` 동시 실행 시 모듈 충돌 | 남음 — 따로 돌린다 |

---

## 참고 — 이번 단계가 닫은 것

| | |
|---|---|
| 쓰기 경로 | 264 지점을 **값으로** 추적. 셸 배포기 19개·44 지점을 처음으로 셌다 |
| 검사기 구멍 5종 | 범위 미분리 · JS 정규식 `+` · JS `Key:` 중괄호 절단 · 셸 이어붙인 줄 · 모듈 상수 |
| 공허하지 않음 증명 | CASE A/B/C 7종 + 읽기 전용 오탐 0 을 영구 시험으로 고정(29건) |
| 접두사 표 | `character-studio/` 를 실측으로 비공개에 넣었다 |
| 발행 경로 결함 | `reports/` 가 공개 읽기 정책 밖임을 찾아냈다 — 발행 전에 막아야 한다 |
| 시각자산 | 옛 산출물을 재사용하지 않고 **새로 찍어** E2E 를 통과시켰다 |
