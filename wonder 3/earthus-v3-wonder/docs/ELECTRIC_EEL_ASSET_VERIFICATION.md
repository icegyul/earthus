# 전기뱀장어(electric-eel) 자산 검증 (PHASE 1-D §5) — 2026-09-13

결론: **정식 production 자산이다.** placeholder 아님, raw fallback 없음. fallback 은 **애니메이션 방식**(전신 스프라이트 + FX) 하나뿐이며 그것은 124종 공통 상태다(지시서 §12).

## 사슬 (전부 실측 sha256)

| 단계 | 파일 | 근거 |
|---|---|---|
| 승인 확정 목록 | `Earthus v2_DOC/v3/122/EARTHUS_V3_CHARACTER_LIST_124_STAGE2.md` **123번** electric-eel 전기뱀장어 · −3.10, −60.02 · SERPENT_PAPER · coil,wiggle,spin,nod · 대표 서식지: 아마존강, 마나우스 | 목록 행 |
| 원본 패키지 | `v3_CHARACTERS/EARTHUS_V3_CHARACTERS_124/characters/electric-eel.png` 619,574 B · `scenes/electric-eel_scene.png` 999,061 B | sha256 `8445e71b…5761` / `d4ba7d5d…e7d2` |
| 원본 manifest | `EARTHUS_V3_RUNTIME_MANIFEST_124.json` index 123, **`raw_fallback: null`** (크로마 키 보정 없이 통과한 항목) | 원본 패키지 docs |
| 레거시 런타임 사본 | `prototype/v3-paper/pack124/characters/electric-eel.png` | sha256 **원본과 동일** `8445e71b…5761` (장면도 동일 `d4ba7d5d…e7d2`) |
| 새 프로젝트 원본 기록 | `content/characters/source/source-manifest.json` `electric-eel:character` sha256 `8445e71b…5761`, `electric-eel:scene` `d4ba7d5d…e7d2` | 변환기가 읽은 파일의 해시 = 원본 |
| 런타임 WebP | `content/characters/runtime/electric-eel.webp` 1024×1024 RGBA 74,570 B (sha12 07da3217dec5) · `_scene.webp` 1024×683 RGB 140,514 B (4b02c6e19d4c) · `thumb/electric-eel.webp` 256² 11,518 B (396e9c939f92) | 레지스트리 kind character / character-scene / character-thumb, source `legacy-pack124→runtime-webp` |
| manifest-124 | `art { thumb, character, scene, status: 'ready' }`, `interaction { tap: greet→wiggle→special, longPress: focus→point→special, special: wiggle, fart: false, fallback: 'sprite-reaction' }` = 팩 1.8 JSON 과 동일 | |
| 브라우저 | 아마존 환경에서 LOD1→LOD2 교체, 탭 `greet → wiggle`, 카드 장면 표시 (PHASE 1-C 보고서) | |

## fallback 여부 (명확히)

| 항목 | 상태 |
|---|---|
| 그림(캐릭터·장면) | **정식** — 승인 팩 원본 그대로 변환. placeholder/자리표 아님 |
| raw fallback(크로마 키 보정본) | **없음**(null) |
| 관절(semantic limb) 애니메이션 | **없음** — 전신 스프라이트 + FX 폴백(`fallback: 'sprite-reaction'`). 124종 공통. 완료 주장 안 함 |
| 장면 그림의 제작 라벨판("EARTHUS v3 ELECTRIC EEL Amazon Basin near Manaus, Brazil") | 원본 팩에 그려진 것. 자산 결함이 아니라 콘텐츠 검토 항목 |

## 판정

blocker 에서 **제거**. 남는 것은 (a) 아마존 환경의 자료 캐릭터가 1종뿐이라는 콘텐츠 한계, (b) 장면 라벨판 검토 — 둘 다 자산 결함이 아니다.
