# earthus 작업 안내

## Luna Chat Coder

ChatGPT 같은 채팅 환경에서 이 저장소의 개발 작업을 시작할 때는 기존 프로젝트 지침보다 먼저 `.agents/skills/luna-chat-coder/SKILL.md` 를 읽어 Luna 작업 정책을 활성화하세요. Luna는 기존 earthus 개발 규칙을 대체하지 않으며, 아래의 프로젝트별 지침과 `docs/HANDOVER.md` 가 기술·배포·검증 기준의 우선 출처입니다.

Luna를 읽었다는 이유만으로 GitHub Actions를 사용하지 마세요. 정상적인 편집·빌드·테스트·디버깅은 가능한 경우 채팅의 sandbox work container에서 수행하고, GitHub Actions는 실제 capability/transport/execution gap이 있을 때만 fallback으로 사용합니다. 정확한 GitHub commit/PR 상태를 durable source truth로 취급하고 다른 작업자의 변경을 보존하세요.

## ⚠️ 이 저장소에는 서로 다른 서비스가 둘 있다 (2026-09-20 PD: "v1 과 v2 는 다른 서비스라고")

**v1 과 v2 는 같은 제품의 두 화면이 아니다. 다른 서비스다. 원칙도 따로다.**
한쪽의 원칙을 다른 쪽에 씌우지 말 것 — 이 저장소에서 가장 많이 반복된 실수다.

| | **v1 — EARTHUS** | **v2 — EARTHUS Intelligence** |
|---|---|---|
| 주소 | `earthus.net/` | `earthus.net/v2/` (= `/Intelligence/`) |
| 무엇인가 | 지금의 지구를 **사실 그대로** 보여주는 무료 서비스 | **예보하고, 원인과 확률로 해석하는** 유료 분석 작업 공간 |
| 예보 | 하지 않는다 | **한다 — 5일치.** 모델 예보를 모델 이름·실행 시각과 함께 |
| 원인·확률 | 말하지 않는다 | **말한다 — 그러려고 만든 시스템이다.** 근거(측정된 조건·앙상블·검증 모형)와 함께 |
| 시각 언어 | 관측 기호·원값 | **구간형 색 + 등치선 + 지구 위 숫자 라벨 · 흐르는 입자.** 막대기 기호·그라데이션 단독 금지 |
| 원칙의 출처 | `docs/HANDOVER.md` §1 | 아래 '제품 의도' + `docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20/` |
| 코드 | `prototype/` (`js/`, `index.html`) · Cesium | `prototype/v2-three/` · Three.js (`v2-deploy/` 는 생성물) |
| 배포 | `tools/deploy-v1.sh` | `tools/build-v2-bundle.sh` → `tools/deploy-v2-three.sh` |
| 돈 | 무료 | FREE / EXPLORER / PRO |

둘이 **같이 쓰는 것은 셋뿐**이다: ① 지어내지 않는다(= 근거 없이 말하지 않는다. **말하지 말라는 뜻이 아니다**) ② 모든 값에 출처와 시각 ③ AWS 자료 파이프라인.

**시작 전에 `docs/HANDOVER.md` 를 먼저 읽으세요.** 배포 방법·이미 밟은 함정이 거기 있습니다.
⚠️ 그 문서의 **원칙 §1("예보하지 않는다")은 v1 의 원칙이다.** v2 작업에는 적용하지 않는다.

- (v1) 예보하지 않는다 · (공통) 지어내지 않는다 · (공통) 모든 값에 출처와 관측 시각
- 배포는 빌드 없이 `aws s3 cp` + CloudFront 무효화 (§3 — Content-Type 필수)
- `clampToGround` 금지, 무한 애니메이션 금지 (발열), 무작위 문구 금지 (§5)
- ⚠️⚠️ 주석은 사고 기록이다 — 지우지 말 것 (§4)
- 비밀값을 채팅·문서·커밋에 넣지 말 것 (§7)

문법 검사: `cp 파일.js /tmp/x.mjs && node --check /tmp/x.mjs`
커밋 제목은 "무엇이 잘못돼 있었나"를 한국어로.

## v2 제품 의도 — 무엇을 만들고 있나 (2026-09-20 PD 확정 · v2 작업에서는 이 절이 아래 모든 문서보다 위다)

> 두 달 동안 의논해 정한 것이 세션마다 사라졌다. 세션은 대화를 기억하지 못하고 **이 파일만 읽는다.**
> 그래서 뜻을 여기 적는다. 아래 어떤 문서의 어떤 규칙이든 이 절의 목적을 막으면 **그 규칙이 틀린 것이다 — 조용히 따르지 말고 PD 에게 말하라.**
> v2 를 v1 의 확장판·고급판으로 읽지 말 것. **다른 서비스다.**

**v2 의 상품은 "3D 지구 지도"가 아니다. "지구를 이해하고 미래를 시험해보는 시스템"이다.** (2026-09-20 PD)
좌측 메뉴는 **11개**다 — 현상 9개(기온·바람·강수·구름·해양·재해·대기질·우주·지형) + **Life · Travel**(2026-09-20 PD 추가 결정: "라이프 트래블은 메뉴에 넣어줘").
메뉴 **각각을 눌렀을 때 반드시 같은 7단계**가 성립해야 한다 — 이것이 Premium UX 문법이다:

> **① 극적으로 보인다 → ② 정확한 값을 읽는다 → ③ 출처를 확인한다 → ④ 시간축을 움직인다 → ⑤ 모델을 비교한다 → ⑥ Intelligence 를 본다 → ⑦ Simulation 으로 들어간다**

- 7단계는 **7개의 공용 부품**이다(렌더러·Inspector 값 카드·출처 카드·Global Timeline·Compare·Intelligence Inspector·Simulation 작업 공간). 메뉴마다 새로 만들지 않는다 — 메뉴는 설정(descriptor)만 공급한다.
- **문법은 같고 가용성은 정직하다.** 어떤 메뉴에 ⑤·⑦ 의 재료가 아직 없으면, 입구는 같은 자리에 두고 없는 이유를 말한다. 빈 단계를 지어내 채우지 않는다.
- 새 기능·새 메뉴를 만들 때 첫 질문: **"이게 7단계 중 어느 칸을 채우나."** 어느 칸도 아니면 v2 의 일이 아니다.
- 9×7 매트릭스의 현재 상태와 목표: `docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20/DEV-DIRECTIVE.md` §1.

**v2 는 예보한다 — 5일치를 보여준다.** 하단 Global Timeline 이 지금 ↔ 과거/예보(5일)를 오간다(`5일 예보 재생` ▶).
- 예보는 **모델 예보를 모델 이름·실행 시각과 함께** 보여주는 것이다(GFS·ECMWF 등). 관측과는 배지로 구분하되 **숨기거나 줄이지 않는다.**
- **모든 현상이 그 타임라인 하나를 따라 움직여야 한다**(PD 정본 규칙 2). 2026-09-20 실측: 지금 타임라인에 물린 것은
  GFS 예보 구름·강수, 태풍 공식 경로, 서울 혼잡 **셋뿐**이다. 기온·바람·기압·파고·수온은 '지금' 한 장에 멈춰 있다 — 이것은 결함이다.

**v2 Intelligence = 해석. 원인과 확률을 말하기 위해 만든 시스템이다.**
- "왜 이런가"(원인)와 "앞으로 어떻게 될 것 같은가"(확률)를 **말하는 것이 이 제품의 존재 이유**다. 돈은 여기서 받는다.
- 금지되는 것은 원인·확률 **자체가 아니라 근거 없는 원인·확률**이다. 계약 76·122행의 뜻도 그것이다:
  "LLM 은 packet 외의 확률을 생성할 수 없다" = **패킷이 계산해서 실어 주면 말한다.**
- 원인을 말할 자격 = ① 측정된 조건(예: 500hPa 능선 N일 지속, 분석장에서 계산) + ② 확립된 기작(문헌) 이 **패킷에 함께 실릴 때.**
- 확률을 말할 자격 = 기관이 발표한 확률 인용 · **앙상블에서 센 비율**(ECMWF ENS 51멤버 등) · 채점으로 검증된 통계 모형 중 하나.
- 확률은 **시안처럼 %로 보여준다**(2026-09-20 PD: "시안처럼 해"). 근거(51개 중 38개)는 바로 아래에 둔다.
- 말한 확률은 **사후에 채점**한다. 채점에서 빗나가는 모형은 내린다(여진 기대수 모형을 그렇게 내렸다 — 이 규율은 유지).
- 배치는 evidence-first: **수치 → 출처·시각 → 원인·전망 문장.** 문장이 수치보다 앞에 오지 않는다.

**v2 화면이 어떻게 보여야 하는가의 정본**은 [`docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20/`](docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20/) 다
(PD 보고서 + 콘셉트 이미지 14장). 구간형 색 + 등치선 + 지구 위 숫자 라벨. **연속 그라데이션 단독 금지 · 막대기 기호 금지.**
좌측 현상 9개 · 우측 Inspector 하나 · 하단 타임라인 하나 · 렌더 튜닝은 View 로 분리 · Compare / Intelligence / Simulation 은 작업 공간.

**일하는 법 — 이 저장소에서 반복된 실패를 막는 세 줄**
1. 작업을 받으면 **"이게 화면에서 무엇을 바꾸나"** 를 먼저 말한다. 배관(계약·패킷·배포)만 하고 끝내지 않는다.
   2026-09-20 새벽, 계약 15단계를 밤새 밟았는데 PD 가 시킨 이유는 "막대기가 싫어서"였다. 화면은 그대로였다.
2. 완료 기준은 **금지가 아니라 결과**로 쓴다. "이 단어가 없어야 한다"만 시험하면 아무 말도 안 하는 제품이 통과한다.
   "근거 있는 원인 문장이 **나와야** 통과"를 같이 시험한다.
3. 애매하면 **덜 말하는 쪽을 고르지 말고 묻는다.** 덜 말하는 것은 안전한 선택이 아니라 제품을 지우는 선택이다.

## 정본 우선순위 (2026-09-14 확정 · 2026-09-20 0번 추가)

문서끼리 말이 다르면 위쪽이 이긴다.

0. **위 '제품 의도' 절** + [`docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20/`](docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20/) — v2 가 무엇이고 어떻게 보여야 하는가

1. [`docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md`](docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md) — 요금제 FREE / EXPLORER / PRO (+ RESEARCH·ENTERPRISE 계약)
2. [`docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md`](docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md) — Intelligence P0~P6
3. [`docs/EARTHUS-MASTER-DECISION-2026-09-14.md`](docs/EARTHUS-MASTER-DECISION-2026-09-14.md) — 무엇을 소유하고 무엇을 연결하는가 (PD 확정 14건)
4. [`docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md`](docs/EARTHUS-CORE-ARCHITECTURE-AND-EXECUTION-CONTRACT-2026-09-14.md) — **구현 계약. 개발자가 볼 문서는 이것 하나.** 빌드 순서는 §I
   ⚠️ **§C-2 표는 개정 대상이다(2026-09-20).** "`%`·확률 어휘는 `quotedOfficial` 과 정확히 일치할 때만"과 인과 어휘 일괄 차단은
   위 '제품 의도'와 어긋난다 — **패킷에 근거(귀속 항목 · 앙상블 비율 · 검증된 모형)가 실려 있으면 통과, 없으면 차단**으로 바꾼다.
   `aws/earthus-llm/narration_guard.py` 는 옛 표대로 만들어져 **운영에 올리지 않았다**(올리면 Intelligence 가 자기 목적을 검열한다).
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
