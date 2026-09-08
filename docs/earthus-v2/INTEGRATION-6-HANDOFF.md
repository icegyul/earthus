# EARTHUS V2 INTEGRATION-6 HANDOFF

```text
PARENT:  3214739c
DATE:    2026-09-08
```

차단 등급: `P0` 지금 위험 · `P1` 다음 단계 전 · `P2` 구조 정리

---

## A. 공개 금지 객체 95건 — 삭제 권한  ★P0

전용 문서로 뺐다: [integration-6-production-blocker.md](integration-6-production-blocker.md)
명령: [integration-6-cleanup-command.txt](integration-6-cleanup-command.txt)
목록: [integration-6-delete-candidates.json](integration-6-delete-candidates.json)

한 줄 요약: `earthus-deploy` 에 `s3:DeleteObject` 가 없다. 권한을 붙이고
명령 파일을 돌린 뒤 `python3 aws/live-audit.py` 가 0을 내면 끝난다.

---

## B. `build/orbital` 이 거름망을 지나지 않는다  ★P1

`aws/deploy-orbital-static.sh` 가 `app/orbital/**` 에 올리는 트리는
`services/aetherus-orbital/tools/export_static_site.py` 가 만든다.
그 스크립트의 `copy_frontend()` 는 `services/aetherus-orbital/frontend/` 를
`__pycache__` 말고는 **아무것도 거르지 않고** 통째로 복사한다.

지금 그 디렉터리에는 제품 파일 13개뿐이라 누출이 없다.
**그건 우연이지 구조가 아니다** — 거기 파일 하나만 놓이면 그대로 공개된다.

덧붙여 이 스크립트만 `--delete` 를 쓰는데(:54) 그 권한이 없다.
`set -euo pipefail` 이라 실행하면 거기서 죽는다 — **지금은 죽은 코드다.**
리전 기본값도 혼자 `ap-northeast-2` 로 버킷(`us-east-2`)과 다르다.

**할 일** `public_build.forbidden_class()` 를 `build/orbital` 에도 걸거나,
export 쪽에 같은 부류 검사를 넣는다. `--delete` 와 리전은 같이 정리한다.

---

## C. 번들이 소스와 다르다 — 다른 세션 작업이 끝나야 한다  ★P1

```text
prototype/v2-three/js/pop-metric-menu.js   ?? 미추적 (새 파일)
prototype/v2-three/js/main.js               M
prototype/v2-three/index.html               M
prototype/v2-three/js/pop-sculpture.js      M
```

그쪽 `PopMetricMenu` 작업이 커밋된 뒤 **한 번에** 다시 만든다:

```bash
git status                       # 미커밋이 없는지 확인
bash tools/build-v2-bundle.sh
python3 aws/build-public.py --manifest
# source == deploy 확인
```

지금 돌리면 미완성 작업이 번들에 박힌다.

---

## D. 영상 생성 경로가 없다  ★P2

MEDIA E2E 의 CARD·VISUAL·REPORT HIGHLIGHT 는 있고 **VIDEO 는 없다.**
이 저장소에 영상 생성 경로가 존재하지 않는다. INTEGRATION-6 은 새 기능을 금지하므로
만들지 않았다. 필요하면 별도 단계로 잡아야 한다.

---

## E. `aws/distribution/handler.py` 가 DRAFT 를 공개 `events/` 에 쓴다  ★P1

감사가 다시 확인했다: 그 모듈은 `publication_privacy` 를 **import 하지 않는다.**
차단 목록이 `BLOCKED` 자격과 `LEVEL_3_HUMAN_ONLY` 만 거르고, 그 밖의 DRAFT 본문은
공개 접두사로 나간다. 공개 색인은 한술 더 떠서, 본문을 보류한 후보의
`eligibility` · `safetyLevel` · `blockReasons` 를 그대로 싣는다.

**소유** 다른 세션 · **할 일** 쓰기 직전에 `check_public_write` 를 부르고,
색인에서 보류 사유를 뺀다.

---

## F. `check_public_write` 를 아직 안 부르는 쓰기 자리들  ★P1

INTEGRATION-4 가 `S3PublishAdapter.publish` 한 곳을 연결했다.
이번에 그 함수의 기본값을 **거부**로 바꿨으므로(모르는 접두사는 안 쓴다),
연결하는 순간 효과가 커진다. 남은 곳은 `aws/**` 의 `put_object` 들이다.

대부분은 정당한 공개 관측 피드다. 승인 개념이 있는 산출물을 쓰는 자리만
지나면 된다 — 우선순위는 E 의 `distribution/handler.py`.

---

## G. `app/v3/` · `app/v2/index.html` 을 두 배포기가 나눠 쓴다  ★P1

```text
app/v3/            aws/deploy-v3-paper.sh (종이 지구 — 지금 운영본)
                   aws/deploy-v3-kids.sh  (키즈)  ← CI 가 push 로 자동 실행
app/v2/index.html  aws/deploy-app.sh (build/public-app/v2 — 옛 Cesium 트리)
                   tools/deploy-v2-three.sh (v2-deploy 번들)
```

나중에 돈 쪽이 이긴다. `.github/workflows/deploy-v3-kids.yml` 의 `paths:` 에
`aws/deploy-v3-kids.sh` 가 있어서, 그 스크립트를 고치면 CI 가 v3 를 키즈로 덮을 수 있다.

**실측(2026-09-08)** `app/v3/index.html` 은 여전히 `종이로 그린 지구`,
LastModified 2026-09-07 — 덮이지 않았다. 그건 운이지 설계가 아니다.

**할 일** 정본을 정하고 한 배포기만 그 키를 쓰게 한다. 그 전까지
`deploy-v3-kids.yml` 의 자동 트리거를 끄는 편이 안전하다.

---

## H. `app/v3/data/*` 4건 — v3 담당 판단 필요  ★P2

부류로는 금지지만 운영 제품 경로라 `EXEMPT_PRODUCT_PATH` 로 분류했다.

```text
app/v3/data/audit-trench-bathymetry.py
app/v3/data/prepare-bathymetry.py
app/v3/data/prepare-ocean-trenches.py
app/v3/data/trench-bathymetry-audit.json
```

거름망은 앞으로의 배포에서 이미 막는다. 지금 올라가 있는 것만 남아 있다.
지울지 여부는 v3 담당이 정한다 — 일괄 삭제 목록에 넣지 않았다.

---

## I. 앞 단계에서 남은 것

| | 상태 |
|---|---|
| 배포 CLI 자동 승인 (`distribution/cli.py:243`) | 남음. 발행 문은 닫혀 있고 표시만 문제 |
| 리드 합산 계산기 (여진·화산재·대기질·표류) | 남음 — 이번엔 태풍 사건 방까지만 고쳤다 |
| 절 구성 두 벌 (`sections.py` vs `compose.py`) | 남음 |
| `config.local.js` 의 ADMIN_UIDS | 남음 |
| 인증 없는 관리 화면 · `aetherus-device-qa.html` 죽은 링크 | 남음 |
| 시각자산 값 판정 두 벌 | 남음 |
| `character-core.js` 의 프롬프트·단가 | 남음 (다른 세션 작업 중) |
| `test_kma_hub.py` 조합별 실패 (`botocore[crt]`) | 남음 — 환경 문제 |

---

## 참고 — 이번 단계가 닫은 것

| | |
|---|---|
| 운영 실사 | `aws/live-audit.py` — 버킷 25,310개를 목록으로 읽어 다섯 갈래로 분류 |
| 삭제 준비 | 후보 95건에 sha256·근거·안전판정. 명령은 키 지정 115줄 |
| 모르는 접두사 | UNKNOWN 이 곧 허가였다 → **거부**로 뒤집었다 |
| 접두사 표 | `solar/`·`celestrak/` 공개, `analysis/` 비공개 — 실측으로 채웠다 |
| 교차리드 순위 | 마지막 화면(v2 사건 방)까지 제거. 설명도 사실과 맞췄다 |
| null → 0 | 화면 두 곳과 검증 어댑터에서 제거. 지표별 표본을 따로 센다 |
| 업로더 | 16개 전수 · 12 필터 통과 · 4 예외(이유 기재) |
| REPORT E2E | 11단계 · ID 사슬 양방향 연결 · 화면 클릭까지 확인 |
