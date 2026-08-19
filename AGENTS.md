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

## 지금 열려 있는 작업

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

**마케팅 스튜디오** — `prototype/studio.html` (미착수).
사양은 [`docs/MARKETING-STUDIO-SPEC.md`](docs/MARKETING-STUDIO-SPEC.md) 에 전부 있습니다.

⚠️⚠️ 그 문서의 첫 규칙: **자동으로 게시하지 않는다.** 초안까지가 기계의 일이고
올리는 손은 사람이 댑니다. 이 규칙을 깨는 변경은 받지 않습니다.
