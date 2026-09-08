# EARTHUS V2 INTEGRATION-7 HANDOFF

```text
PARENT:  86816cdb
DATE:    2026-09-08
```

차단 등급: `P0` 지금 위험 · `P1` 다음 단계 전 · `P2` 구조 정리

---

## A. 공개 금지 객체 95건 — 삭제 권한 하나면 끝난다  ★P0

전용 문서: [integration-7-production-blocker.md](integration-7-production-blocker.md)
명령: [integration-7-cleanup-command.txt](integration-7-cleanup-command.txt)
목록: [integration-7-delete-candidates.json](integration-7-delete-candidates.json)

권한을 붙이고 명령을 돌린 뒤 `aws/live-audit.py` 가 0을 내면
`PRODUCTION_PUBLISH_READY` 를 다시 판정할 수 있다.

**이 하나 말고는 운영 발행을 막는 것이 없다.** 앞으로 올라갈 것에 대해서는
경계가 닫혀 있고(§16 표 참고), 남은 것은 전부 과거 잔존물이다.

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
# source == deploy 확인
```

지금 돌리면 미완성 코드가 번들에 박힌다.

---

## C. 검사기를 쓸 때의 교훈 — 세 번 같은 방식으로 뚫렸다  ★P1

같은 실수가 층만 바꿔 세 번 반복됐다. 다음 검사기를 쓸 때 이 순서로 의심할 것.

| 단계 | 뚫린 지점 | 고친 방식 |
|---|---|---|
| INTEGRATION-4 | 탐지기가 `.sh` 만 훑었다 → `.mjs` 업로더를 놓쳤다 | 확장자로 거르지 않는다 |
| INTEGRATION-5 | 목적지 문자열로 걸렀다 → 버킷·키가 **변수**인 업로더를 놓쳤다 | 올리는 **동작**으로 센다 |
| INTEGRATION-7 | 호출 자리 리터럴만 봤다 → 키를 **상수로 빼 둔** 람다를 놓쳤다(0건 탐지) | 대입까지 따라간다 |

공통 교훈: **탐지기가 0건을 잡으면 그 시험은 아무것도 지키지 않는다.**
새 검사기에는 "탐지기가 공허하지 않다"는 시험을 같이 넣을 것
(`test_람다_탐지기가_공허하지_않다` 가 그 예다).

그리고 넓힌 다음에는 **반드시 오탐을 확인할 것** — 이번에도 넓히자마자
app/ 를 *읽는* 람다 넷이 잡혔다. 잘못 잡는 검사기는 곧 무시당한다.

---

## D. 영상 엔진 없음  ★P2

MEDIA E2E 의 CARD·VISUAL·REPORT HIGHLIGHT 는 있고 **VIDEO 는 없다.**
이 저장소에 영상 생성 경로가 존재하지 않는다. 별도 단계로 잡아야 한다.

---

## E. `build/orbital` 이 거름망 밖이다 — 지금은 실피해 없음  ★P2

`aws/deploy-orbital-static.sh` 는 `services/aetherus-orbital/frontend` 를
`__pycache__` 말고는 아무것도 거르지 않고 복사한 트리를 올린다.

**이번에 확인된 사실**: `app/orbital/` 에는 객체가 **0건**이다.
그 스크립트만 `--delete` 를 쓰는데 권한이 없어 `set -euo pipefail` 에서 죽는다 —
**한 번도 성공한 적이 없다.** 그래서 지금 실피해는 없다.

되살리기 전에 부류 검사를 붙이고 `--delete` 와 리전(혼자 `ap-northeast-2`)을 정리할 것.

---

## F. `app/v3/data/*` 4건 — v3 담당 판단  ★P2

```text
app/v3/data/audit-trench-bathymetry.py
app/v3/data/prepare-bathymetry.py
app/v3/data/prepare-ocean-trenches.py
app/v3/data/trench-bathymetry-audit.json
```

부류로는 금지지만 운영 제품 경로라 `EXEMPT_PRODUCT_PATH` 로 두고 삭제 목록에 넣지 않았다.
거름망은 앞으로의 배포에서 이미 막는다.

---

## G. 앞 단계에서 남은 것

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

---

## 참고 — 이번 단계가 닫은 것

| | |
|---|---|
| 신선 실사 | 25,322개를 새로 훑어 다섯 갈래로 분류. UNKNOWN 0 |
| §17 산출물 | 감사·후보·명령·블로커 넷 모두 도구가 만든다 |
| 탐지기 구멍 3종 | 람다 0건 탐지 · SDK 미인식 · `prototype/` 헛돌기 |
| 예보 규칙 A~H | 영구 회귀 시험 17건(건너뜀 0)으로 고정 |
| 제품 경로 무사 | 청소 과정에서 아무것도 건드리지 않았음을 실측으로 증명 |
