# EARTHUS V2 INTEGRATION-5 HANDOFF

```text
PARENT:  2842039a
DATE:    2026-09-08
```

차단 등급: `P0` 지금 위험 · `P1` 다음 단계 전 · `P2` 구조 정리

---

## A. 공개 금지 객체 99건 — 삭제 권한이 필요하다  ★P0

**현재** 익명 HTTP 200 으로 읽힌다. 목록·크기·sha256 은
[integration-5-live-forbidden.json](integration-5-live-forbidden.json) 에 있다.

가장 무거운 것:

```text
app/v2/supabase/schema.sql                                      14,244
app/v2/supabase/migrations/20260827140000_member_rbac.sql       41,611
app/v2/supabase/migrations/20260828103000_social_credentials.sql 16,486
app/v2/supabase/migrations/20260814090000_aetherus_private_data.sql 16,379
… 마이그레이션 21건 · billing/founding/refund/push 8건 · .temp 8건
```

**왜 못 지웠나** `earthus-deploy` 에 `s3:DeleteObject` 가 없다. 존재하지 않는 키로
시험해 확인했다(아무것도 안 지워진다). `app/orbital/` 접두사도 같다.
`PutObject` 로 내용만 비우는 길은 있었으나 **사용자가 대기를 선택했다.**

**할 일** [RESULT 의 LIVE CLEANUP 절](INTEGRATION-5-RESULT.md)에 명령을 그대로 적었다.
요약: 권한 부여 → `--audit-live` 로 목록 재생성 → 키 지정 삭제 → 다시 확인.

⚠️ `deploy-app.sh` 의 `--delete` 는 되살리지 마라. 원본에 `v3/`·`orbital/`·
`aetherus/`·`tourism/` 이 없어서 다른 스크립트와 람다가 올린 것을 지운다.

---

## B. 왜 26건이 아니라 99건이었나 — 다음 사람이 같은 실수를 안 하도록  ★P1

INTEGRATION-4 는 **거름망 계획**을 두드렸다. 계획은 지금 `prototype/` 에 있는 경로만
안다. 옛 배포가 남긴, 지금 트리에 없는 객체는 계획에 없으므로 두드려 볼 생각조차
못 한다. `app/v2/` 는 예전에 `prototype/` 전체가 복사된 자리였고 거기 스키마가 남았다.

**교훈** 공개 경계 확인은 두 방향이 다 필요하다.

```text
계획 → 운영   "우리가 올릴 것 중 막아야 할 것"   aws/build-public.py --check
운영 → 부류   "이미 올라가 있는 것 중 금지 부류"  verify-public-access.py --audit-live
```

두 번째는 자격증명이 있어야 한다(`AWS_PROFILE=earthus-deploy`).
자격증명 없이는 `--audit-denied` 만 되고, 그건 잔존물을 못 본다 — **그 한계를
결과에 적어야 한다.**

---

## C. `deploy-orbital-static.sh` 는 아직 거름망 밖이다  ★P1

`build/orbital` 을 원본으로 `app/orbital/**` 에 올린다.
그 트리는 `services/aetherus-orbital/tools/export_static_site.py` 가 만들고,
어떤 거름망도 지나지 않는다. 지금은 면제 목록에 이유와 함께 들어 있다.

덧붙여 이 스크립트만 `--delete` 를 쓴다(:54). 그런데 그 권한이 없다 —
`set -euo pipefail` 이라 실행하면 거기서 죽는다. **지금은 죽은 코드다.**
리전도 혼자 `ap-northeast-2` 기본값이라 버킷(`us-east-2`)과 다르다.

**할 일** 내보내기 산출물에도 부류 검사를 걸거나, `public_build` 가 그 트리도 보게 한다.
`--delete` 와 리전은 같이 정리한다.

---

## D. `app/v2/index.html` 과 `app/v3/` 를 두 스크립트가 나눠 쓴다  ★P1

```text
app/v2/index.html   aws/deploy-app.sh (build/public-app/v2 — 옛 Cesium 트리)
                    tools/deploy-v2-three.sh (v2-deploy 번들)
app/v3/             aws/deploy-v3-paper.sh (종이 지구 — 지금 운영본)
                    aws/deploy-v3-kids.sh  (키즈)  ← CI 가 자동으로 돈다
```

나중에 돈 쪽이 이긴다. 어느 쪽이 정본인지 코드가 대답하지 못한다.

특히 `.github/workflows/deploy-v3-kids.yml` 은 `main` 과 **현재 브랜치**의 push 로
자동 배포되고, `paths:` 에 `aws/deploy-v3-kids.sh` 가 들어 있다 —
그 스크립트를 고치면 CI 가 v3 를 키즈로 덮을 수 있다.

**실측(2026-09-08)** `app/v3/index.html` 은 `<title>EARTHUS · 종이로 그린 지구</title>`,
LastModified 2026-09-07. INTEGRATION-4 push 로 덮이지 **않았다.**
하지만 그건 운이지 설계가 아니다.

**할 일** `app/v3/` 의 정본을 정하고 한 배포기만 그 키를 쓰게 한다.
그 전까지 `deploy-v3-kids.yml` 의 자동 트리거를 끄는 편이 안전하다.

---

## E. 공개 `app/` 에 직접 쓰는 람다 3종  ★P2

```text
tourism-flow             app/tourism/*              5,458 객체
current-earth-snow-ice   app/v2/data/current-earth/*
character-studio         app/v3/characters/*
```

생성 자료라 정당하다. 다만 거름망 밖이라는 사실이 조용해지면 안 되므로
`test_integration5_boundary.py` 가 이 셋을 목록으로 못박는다.
새 람다가 `app/` 에 쓰기 시작하면 시험이 깨진다.

**할 일** 이 경로들에도 부류 검사를 걸지 결정한다. 지금은 "알고 있다"까지다.

---

## F. `check_public_write` 를 아직 안 부르는 쓰기 자리들  ★P1

INTEGRATION-4 가 `S3PublishAdapter.publish` 한 곳을 연결했다.
`aws/**` 의 나머지 `put_object` 는 대부분 정당한 공개 관측 피드지만,
**승인 개념이 있는 산출물**을 쓰는 자리는 지나야 한다.
특히 `aws/distribution/handler.py` 가 DRAFT 본문을 공개 `events/` 에 쓴다 —
차단 목록이 `BLOCKED`·`LEVEL_3` 만 거른다.

**소유** `aws/distribution/handler.py` 는 다른 세션

---

## G. INTEGRATION-3·4 인계에서 아직 남은 것

| | 상태 |
|---|---|
| A. 배포 CLI 자동 승인 (`distribution/cli.py:243`) | 남음. 발행 문은 닫혀 있고 표시만 문제 |
| B. 리드 합산 계산기 (여진·화산재·대기질·표류) | 남음 |
| C. 절 구성 두 벌 (`sections.py` vs `compose.py`) | 남음 |
| F. `config.local.js` 의 ADMIN_UIDS | 남음 |
| G. 인증 없는 관리 화면 · `aetherus-device-qa.html` 죽은 링크 | 남음 |
| H. 시각자산 값 판정 두 벌 | 남음 |
| I. `character-core.js` 의 프롬프트·단가 | 남음 (다른 세션이 그 파일 작업 중) |

---

## H. 번들이 소스와 다르다  ★P2

`prototype/v2-three` 의 미커밋 `PopMetricMenu` 작업(다른 세션) 때문에
`v2-deploy` 가 뒤처져 있다. 그쪽 작업이 커밋된 뒤
`bash tools/build-v2-bundle.sh` 를 한 번 돌리면 맞는다.
**지금 돌리면 미완성 작업이 번들에 박힌다.**

---

## I. `test_kma_hub.py` 가 일부 조합에서 실패한다  ★P2

`botocore[crt]` 가 없어서다(이 컴퓨터의 `default` 프로파일이 로그인 공급자를 쓴다).
전체 디렉터리로 돌리면 통과하고, 일부 조합에서만 8건이 깨진다.

```bash
pip install "botocore[crt]"        # 또는 정적 키 프로파일을 쓴다
```

---

## 참고 — 이번 단계가 닫은 것

| | |
|---|---|
| 람다 쓰기 경로 | `events/`(공개) → `archive/`(비공개). **운영에 배포하고 실행까지 확인** |
| 감시 | `health` 도 새 키로 배포. state ok |
| 업로더 탐지 | 언어·목적지로 거르지 않는다 — `.mjs` 업로더 하나를 그렇게 놓쳤다 |
| 정보공개 빌더 | `prototype/` → `build/public-app` |
| 청소 목록 | 계획 기준(26)에서 **운영 목록 기준(99)** 으로. 한 명령으로 재현된다 |
| 매니페스트 | 3,598줄 · 파일마다 sha256 과 공개 사유 · 공개 트리 밖에 둔다 |
| 승인 게이트 | 공격 9종 + §12 자동승인 금지를 시험으로 못박았다 |
