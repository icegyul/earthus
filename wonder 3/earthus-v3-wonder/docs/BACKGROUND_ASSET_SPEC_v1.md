# EARTHUS V3 WONDER — BACKGROUND ASSET SPEC v1 (2026-09-13)

DECISION LOCK 6 의 구체화. 팩 1.8 의 배경 24장은 production asset 이 아니다(눈 검수 `content/pack-1.8/background-review.json`, 24/24 invalid).
같은 24개 **id 와 분류를 유지**하고 이미지 내용만 새 production asset 으로 교체한다. 교체 대상·장면 지시는 `content/backgrounds/replacement-manifest.json`.

## 1. 구성 (24)

| 분류 | 수 | id |
|---|---:|---|
| world | 1 | `sky_island_01` — 지구 전체 무대의 기본 배경(특정 지역이 아님). ※ 팩 id 중 지리가 아닌 유일한 것이라 world 로 배정. PD 확인 항목 |
| country · Korea | 4 | `korea_seoul_01` `korea_busan_01` `korea_gyeongju_01` `korea_jeju_01` |
| atmosphere | 3 | `aurora_01` `night_01` `sunset_01` |
| region | 16 | `australia_01` `cave_01` `coast_01` `desert_01` `forest_01` `grassland_01` `ice_01` `island_01` `jungle_01` `ocean_01` `sahara_01` `savanna_01` `tajmahal_01` `tibet_01` `underwater_01` `volcano_01` |

## 2. 절대 금지 (하나라도 있으면 불합격)

text · watermark · UI 요소(프레임·버튼·라벨·둥근 카드 테두리) · 다른 장소 thumbnail · character(사람·동물·상상 생물·새 등 살아 있는 것 전부) · hero card(로고·간판·타이틀 아트) · 슬라이드 조각 · 사진 실사.

## 3. 기술 규격

| 항목 | 값 |
|---|---|
| 비율·해상도 | **16:9 · 2048×1152** (팩 조각에 적혀 있던 원래 스펙과 같다) |
| 형식 | **WebP**, sRGB, 알파 없음, 품질 85 (method 6). 목표 ≤ 350 KB, 상한 500 KB |
| 화풍 | **paper-cut / 2.5D** — 겹친 종이 층, 찢은 종이 외곽, 부드러운 드롭 섀도, 무광 종이 질감. 매끈한 벡터·사진·3D 렌더 금지 |
| 파일 이름 | 기존 id 그대로 `<id>.webp` (예 `korea_seoul_01.webp`) |
| 출처 기록 | 생성 프롬프트/seed 또는 납품자·날짜를 `replacement-manifest.json` 의 `provenance` 에 적는다 |

## 4. 구도 규칙 (mobile crop 안전영역 · foreground 공간)

무대는 `object-fit: cover` 로 배경을 채운다. 폰 세로(375×812 ≈ 9:19.5)에서는 2048 폭 중 **가운데 약 532px(26%)** 만 보인다. 그래서:

```
 ┌──────────────────────────────── 2048 ────────────────────────────────┐
 │ ← 30% 여백 →│◄──── 안전영역 A: 가운데 40% (819px) ────►│← 30% 여백 → │  상단 12% : 헤더가 덮을 수 있음 — 중요 요소 금지
 │             │  지형을 알아보게 하는 요소(산·건물·나무)는 │             │
 │             │  전부 이 안에. 좌우 30% 는 잘려도 되는 확장 │             │  수평선 : 높이 55~65%
 │             │                                          │             │
 │ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ 발 디딜 곳 (foreground zone) ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ │  하단 28% : 캐릭터가 설 자리
 │             │  낮은 대비 · 키 큰 요소 없음 · 땅/물 질감만  │             │  (나중에 캐릭터 겹이 여기 얹힌다)
 └──────────────────────────────────────────────────────────────────────┘
```

- **안전영역 A**(가운데 40%): 장소를 식별하는 요소 전부. 폰 세로에서도 26% 가 보이므로 핵심 하나는 **가운데 26%** 안에.
- **foreground zone**(하단 28%): 캐릭터가 서는 바닥. 나무·건물·바위 같은 키 큰 요소 금지, 밝기·채도 낮게, 캐릭터 그림자가 자연스러운 평평한 면(땅·눈·모래·물결).
- **수평선** 55~65%: 캐릭터 발(무대 하단 20%)이 땅에 붙어 보이는 범위.
- **상단 12%**: 헤더·상태가 덮을 수 있다. 하늘·구름만.
- 밝기: 캐릭터(밝은 종이색이 많다)가 묻히지 않게 foreground zone 은 중간 톤. 흰 눈·흰 모래는 살짝 회색/파랑으로.

## 5. 분류별 톤

| 분류 | 시간·분위기 | 팔레트 힌트 |
|---|---|---|
| world | 낮, 구름 위 | 연하늘·크림·연녹 |
| Korea 4 | 낮(서울·부산·경주), 제주는 늦은 오후 | 종이 한지 느낌 — 먹빛 실루엣 + 단청 색 소량 |
| atmosphere 3 | aurora 밤 · night 밤 · sunset 저녁 | 남색·보라·초록 / 남색·노랑 달 / 주황·분홍·자주 |
| region 16 | 대부분 낮. cave·underwater 는 빛줄기 | 지역 고유색(붉은 사막·설산·산호 등) |

위험 요소 규칙(기존 결정 "위험기상은 웃지 않는다") — `volcano_01` 은 풍경으로서의 화산이며 분화·용암 드라마·얼굴 없음.

## 6. 인수 검사 (24장 각각)

자동(도구 예정 `scripts/check-backgrounds.mjs`): 2048×1152 · WebP · 알파 없음 · ≤ 500 KB · 파일명 = id.
눈(접촉 시트 `tools` 로 생성): §2 금지 항목 0 · §4 구도 4항목 · 화풍 일치 · id 의 장소가 맞는가. 판정은 `content/pack-1.8/background-review.json` 의 verdict 를 `ok` 로 바꾸는 것으로 기록하고, 레지스트리를 다시 만든다(`load` 가 `region-lazy` 로 돌아온다).

## 7. 제작 경로

- (a) **로컬 ComfyUI Z-Image Turbo 로 후보 생성 — 2026-09-13 PHASE 1-D 에서 실행.** `scripts/gen-backgrounds.py` (2048×1152, 8 steps, cfg 1, RTX 3070 약 25초/장, WebP q85 ≈ 200KB).
  - ⚠️ 프롬프트 함정: `diorama`·`torn-paper edges` 는 그림 둘레에 찢은 종이 **창(프레임)** 을 만들고 사진처럼 흐른다(프로브 1·2). 되는 문법: "flat layered papercraft landscape illustration, every mountain/hill/cloud/tree/ground band is a cut colored-paper shape stacked in depth …, the landscape fills the whole picture from edge to edge, empty flat ground band across the lower third, horizon around the middle, no vignette, no frame, no border, no paper window, no text, no people, no animals"(프로브 3 통과).
  - 후보는 `benchmarks/background-candidates/`(content/ 밖)에 두고 `candidates.json` 에 status `candidate`, `production_approved: false` 로 적는다. **자동 승인 없음** — 접촉 시트 눈 검수 → PD 승인 → 그때 `content/pack-1.8/backgrounds/` 교체 + `background-review.json` verdict ok + 레지스트리 재생성.
- (b) 외부 납품 — 이 문서 §2~§6 을 그대로 납품 조건으로.
어느 쪽이든 `replacement-manifest.json` 의 `brief_ko` 가 장면 지시다(생성 프롬프트는 그 영어 번역).
