# earthus 작업 안내

## Luna Chat Coder

ChatGPT 같은 채팅 환경에서 이 저장소의 개발 작업을 시작할 때는 기존 프로젝트 지침보다 먼저 `.agents/skills/luna-chat-coder/SKILL.md` 를 읽어 Luna 작업 정책을 활성화하세요. Luna는 기존 earthus 개발 규칙을 대체하지 않으며, 아래의 프로젝트별 지침과 `docs/HANDOVER.md` 가 기술·배포·검증 기준의 우선 출처입니다.

Luna를 읽었다는 이유만으로 GitHub Actions를 사용하지 마세요. 정상적인 편집·빌드·테스트·디버깅은 가능한 경우 채팅의 sandbox work container에서 수행하고, GitHub Actions는 실제 capability/transport/execution gap이 있을 때만 fallback으로 사용합니다. 정확한 GitHub commit/PR 상태를 durable source truth로 취급하고 다른 작업자의 변경을 보존하세요.

**시작 전에 `docs/HANDOVER.md` 를 먼저 읽으세요.** 원칙·배포 방법·이미 밟은 함정이
전부 거기 있습니다. 특히:

- 예보하지 않는다 · 지어내지 않는다 · 모든 값에 출처와 관측 시각 (원칙 §1)
- 배포는 빌드 없이 `aws s3 cp` + CloudFront 무효화 (§3 — Content-Type 필수)
- `clampToGround` 금지, 무한 애니메이션 금지 (발열), 무작위 문구 금지 (§5)
- ⚠️⚠️ 주석은 사고 기록이다 — 지우지 말 것 (§4)
- 비밀값을 채팅·문서·커밋에 넣지 말 것 (§7)

문법 검사: `cp 파일.js /tmp/x.mjs && node --check /tmp/x.mjs`
커밋 제목은 "무엇이 잘못돼 있었나"를 한국어로.

## 정본 우선순위 (2026-09-14 확정)

문서끼리 말이 다르면 위쪽이 이긴다.

1. [`docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md`](docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md) — 요금제 FREE / EXPLORER / PRO (+ RESEARCH·ENTERPRISE 계약)
2. [`docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md`](docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md) — Intelligence P0~P6
3. [`docs/EARTHUS-MASTER-DECISION-2026-09-14.md`](docs/EARTHUS-MASTER-DECISION-2026-09-14.md) — 무엇을 소유하고 무엇을 연결하는가 (PD 확정 14건)
4. [`docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md`](docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md) — **구현 계약. 개발자가 볼 문서는 이것 하나.** 빌드 순서는 §I
5. [`docs/INTELLIGENCE-DEV-DIRECTIVE-2026-09-05.md`](docs/INTELLIGENCE-DEV-DIRECTIVE-2026-09-05.md) — §J 하지 않을 일 · §M 기준선 · §N Physics 5기준
6. 전략 문서(REFERENCE MASTER, Simulation Vision) — 런타임 근거로 쓰지 않는다

보조: [`SIMULATION-VISION-LADDER`](docs/SIMULATION-VISION-LADDER-2026-09-14.md)(무엇을 만들 수 있나) · [`SIMULATION-CAPABILITY-CROSSWALK`](docs/SIMULATION-CAPABILITY-CROSSWALK-2026-09-14.md)(지금 무엇이 있나) · [`PILOT-SCREEN-SPEC-TEMPERATURE-TSUNAMI`](docs/PILOT-SCREEN-SPEC-TEMPERATURE-TSUNAMI-2026-09-18.md)(파일럿 화면 명세).

## 지금 열려 있는 작업

**Intelligence · Simulation — R0(재현 가능 상태) 진행 중 (2026-09-20~)**.
순서는 계약 §I: R0 → P0 → P1+M1+T → §14 1차 → S-A → … ⚠️ 같은 브랜치에서 미추적 파일을
대량 분류·커밋 중이다. 이 기간에 루트·`docs/`·`aws/`·`tools/` 미추적 파일을 옮기거나 지우지 말 것.

**창립 멤버 500 — 반값 결제** (코드 작성 완료 · **적용 대기**, ⚠️ `SALES_OPEN=true` 전 필수).
오늘 작업 경위는 [`docs/WORK-2026-08-06.md`](docs/WORK-2026-08-06.md) 에 있습니다.
사양은 [`docs/FOUNDING-500.md`](docs/FOUNDING-500.md) 에 있습니다.

⚠️⚠️ 사전등록 화면과 이용약관(제8조 제7항)에 **이미 약속이 걸려 있습니다.**
서버에 반값 경로가 없는 상태로 판매를 열면 창립 멤버가 정가를 냅니다 — 약관 위반입니다.
할인은 반드시 **서버(checkout 함수)** 에서 합니다. `billing.js` 값은 화면 표시용입니다.

**우주·심해 탐험 (교육 영역)** — 신규, 사양 확정.
지시서는 [`docs/EXPLORE-DEV-SPEC.md`](docs/EXPLORE-DEV-SPEC.md) 에 있습니다 —
공통 기반(A) → 우주 사진(B1·2) → 심해 수심 기둥(C1·2) 순서. 주차별 완료 조건 명시.
⚠️ 크레딧 없는 사진·"관측 기록" 문구 누락은 기능이 돼도 검수에서 돌려보냅니다.

**AETHERUS 사진관·발사 캡슐 (2026-08-31 PD 결정)** — 지침 확정, 구현 미착수.
정본: [`docs/AETHERUS-PR-14-SKY-FIRST-USER-PHOTO-PLACEMENT-2026-08-31.md`](docs/AETHERUS-PR-14-SKY-FIRST-USER-PHOTO-PLACEMENT-2026-08-31.md),
[`docs/AETHERUS-PR-15-LAUNCH-MOMENT-CAPSULE-2026-08-31.md`](docs/AETHERUS-PR-15-LAUNCH-MOMENT-CAPSULE-2026-08-31.md),
[`docs/AETHERUS-V2-V06-ADDENDUM-01-SKY-MEDIA-ENGINES-2026-08-31.md`](docs/AETHERUS-V2-V06-ADDENDUM-01-SKY-MEDIA-ENGINES-2026-08-31.md) (부록은 PD 채택 대기).
⚠️ 하늘 뷰가 1차 경험 — DEV-SPEC §6의 갤러리 우선 문구는 SUPERSEDED.

**마케팅 스튜디오** — `prototype/studio.html` (미착수).
사양은 [`docs/MARKETING-STUDIO-SPEC.md`](docs/MARKETING-STUDIO-SPEC.md) 에 전부 있습니다.

⚠️⚠️ 그 문서의 첫 규칙: **자동으로 게시하지 않는다.** 초안까지가 기계의 일이고
올리는 손은 사람이 댑니다. 이 규칙을 깨는 변경은 받지 않습니다.
