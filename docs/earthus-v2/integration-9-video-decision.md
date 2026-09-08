# EARTHUS V2 — VIDEO 판정 (INTEGRATION-9 §11)

```text
판정:   DEFERRED
DATE:   2026-09-08
근거:   product contract 문서 (임의 판단 아님)
```

§11 은 "임의 판단하지 말고 기존 product contract 를 기준으로" 결정하라고 했다.
그래서 저장소의 계약 문서를 훑어 **적혀 있는 것만** 근거로 적는다.

---

## 판정을 가르는 문장

`docs/earthus-v2/integration-8-production-blocker.md`
— 표 제목이 **"이것 말고 막는 것은 없다"**(:184) 이고, 그 표 안에서:

```text
:188  | LIVE_FORBIDDEN = 0           | ❌ 95 |
:189  | REPORT 발행 경로 읽기 가능    | ❌ reports/ 정책 밖 |
:197  | REPORT / MEDIA E2E · APPROVAL | ✅ (VIDEO 는 NOT_AVAILABLE) |
```

**MEDIA E2E 는 VIDEO 가 없는 채로 ✅ 로 채점돼 있다.** 릴리스를 막는 ❌ 두 줄에
VIDEO 는 들어 있지 않다. 같은 구성이 `integration-7-production-blocker.md:141`,
`INTEGRATION-8-RESULT.md:320` 에도 그대로 있다.

---

## A. 릴리스 계약이 VIDEO 를 요구하는가 — 아니다

| 문서 | 무엇을 말하나 |
|---|---|
| `docs/QA-PHASE2-RELEASE-CANDIDATE-2026-09-06.md` | **릴리스 판정을 내리는 문서**. 66개 항목 중 영상·비디오·릴스·숏츠 언급 **0건**. :7 "최종 판정: RELEASE CANDIDATE — PASS WITH PENDING", :10 의 PENDING 세 가지(KMA 허브 용량 · 실기기 · LLM 재배포)에 영상 없음 |
| `docs/QA-V2-MASTER-2026-09-05.md` | 같은 검색어 **0건** |
| `MASTER_SPEC/…MASTER_DEVELOPMENT_DIRECTIVE_v3.2.docx` | 소셜 계약이 **manual publish only**. 영상 관련 6건은 전부 위성 영상(0.5km 영상 등)이지 SNS 영상이 아니다 |
| 2026 출품 3건 (데이터랩·GovTech·Earthshot) | 영상 요구 **없음** |

**릴리스·출품 어느 계약도 영상을 요구하지 않는다.**

## B. 계약이 영상을 뒤로 미루고 있는가 — 그렇다

```text
docs/earthus-v2/SNS_SEO_GEO/MARKETING-STUDIO-SPEC.md:178-180
  **출력**: 우선 **프레임 PNG 묶음** 으로 충분하다.
  `MediaRecorder` 로 WebM 을 만드는 것은 2단계 — 브라우저마다 코덱이 달라
  지금 붙이면 "왜 어떤 기기에선 안 되나"를 쫓게 된다.
```

인수 항목도 프레임까지다(:298 "릴스 프레임이 1080×1920 으로 떨어진다").

세 단계 연속 인계에서 **★P2** 로 들고 왔다:

```text
INTEGRATION-6-HANDOFF.md:64  D. 영상 생성 경로가 없다  ★P2
INTEGRATION-7-HANDOFF.md:67  D. 영상 엔진 없음        ★P2
INTEGRATION-8-HANDOFF.md:102 E. 영상 엔진 없음        ★P2
                             "별도 단계로 잡아야 한다"
```

## C. 지금 무엇이 있고 무엇이 없나 — 실측

```text
있다   CARD              카드(정지 이미지) 사양 · x · instagram 판
       VISUAL            지구 캡처 · verified=true · 되읽기·해시·픽셀 6/6
       REPORT HIGHLIGHT  html · json · md
없다   VIDEO             저장소에 영상 생성 경로가 **존재하지 않는다**
```

배포 엔진은 영상을 **만들지 않는다** — 사양만 낸다:

```text
aws/distribution/visual.py:4   "**여기서 그림을 그리지 않는다.** 사양과 메타데이터만 만든다."
sns_adapters/base.py:71        generate_payload(..., media_asset_id=None)   ← 밖에서 받는다
```

---

## 결론

```text
VIDEO_NOT_AVAILABLE = DEFERRED
```

릴리스 계약이 요구하지 않고, 스펙이 명시적으로 2단계로 미뤘고, 세 단계에 걸쳐
P2 로 관리돼 왔다. **Production Release blocker 가 아니다.**

## 다만 같이 적어 둘 것 — 계약 문서 쪽 정리거리 (P2)

이번 조사에서 나온 것들이다. 지금 릴리스를 막지 않지만, 나중에 누가 읽으면 오해한다.

1. **`youtube` · `tiktok` 어댑터가 켜져 있는데 영상을 못 만든다.**
   `sns_adapters/__init__.py:23-34` 에 둘 다 등록돼 있고 youtube 는 `PRIMARY`(관리
   화면 기본 목록)다. 그런데 둘의 형식은 `("SHORT_VIDEO",)` 하나뿐이고
   `media_required=True` 다 — 어떤 후보를 보내도 `*_VIDEO_REQUIRED` 로만 끝난다.
   `linkedin.py:6-7` 이 인용한 §143 "못 하는 것을 할 수 있는 것처럼 두지 않는다" 에
   어긋난다. 지금 시험은 사유가 남는지만 보고 **채널을 감추는지는 보지 않는다**
   (`tests/test_distribution.py:600-611`).

2. **문서 표류.** `docs/EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md:530` 과
   `docs/MARKETING-STUDIO-SPEC.md:201` 이 승인 흐름을 "초안 확인 → 카드/**영상** 생성 →
   사람이 미리보기 확인" 으로 적고, dev-spec:50 은 "마케팅 스튜디오의 카드·**영상** 보관"
   을 이미 된 것처럼 적는다. 실제로는 카드 PNG 와 릴스 **프레임** PNG 뿐이고,
   "영상 보관" 은 사람이 올린 파일을 두는 것이다(`prototype/studio.html:338`).

3. **`docs/master-plan-2026.md:420-421` 에 "쇼츠 자동화 승격" 이 v2(가을) 줄에 있다.**
   그 줄만 따로 인용하면 영상이 V2 계약인 것처럼 읽힌다. 같은 파일 머리(:10-13)가
   그 절을 `MONETIZATION-PRIORITY-2026-08-05.md` 로 대체됐다고 적고 있고, 그쪽
   우선순위(마케팅 스튜디오 → 예보 검증 → 관측소 입양)에 영상 항목은 없다.
   또 이 문서는 `docs/earthus-v2/` 가 생기기 전인 2026-07-27 v1 시절 문서다.

4. **영상이 V2 범위 밖이라고 못 박은 문장은 어디에도 없다.**
   미룸은 감사 기록(NOT_AVAILABLE)과 스펙의 "2단계" 로만 성립한다.
   서면으로 못 박고 싶다면 지금은 인용할 한 줄이 없다 — 새로 적어야 한다.
