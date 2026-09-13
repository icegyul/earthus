# EARTHUS V3 WONDER — NEW BUILD 지시서 초안 v0 — **SUPERSEDED (2026-09-13 13:5x)**

> Master Directive 가 도착해 `docs/MASTER_DEVELOPMENT_DIRECTIVE.md` 로 편입됐다. 개발 순서는 그 문서 §32(PHASE 0~15)를 따른다.
> 이 초안은 기록용으로만 남긴다. 초안 PHASE 1~6 과 지시서의 차이는 `MASTER_DIRECTIVE_RECONCILIATION.md`.

2026-09-13. **`CLAUDE_CODE_EARTHUS_V3_WONDER_WONDER3_MASTER_DIRECTIVE_v1.md` 가 없어서 쓴 초안이다.**
그 파일이 `wonder 3/` 에 오면 이 초안은 폐기하고 그 순서를 따른다. 이 초안의 PHASE 0 만 실행했다(보고서 별도).

## 불변 규칙 (CLEANUP 지시서·팩 1.8·기존 결정에서 옴)

- 기존 V3(`v3-kids`, `v3-paper`) 코드 복사 금지 · 수정 금지. AWS 삭제 없음.
- 콘텐츠 원천: 124종 PNG(`prototype/v3-paper/pack124`, 승인 원본 `v3_CHARACTERS/`), 팩 1.8, `Earthus v2_DOC/v3` 문서. 레거시 런타임 번들·PNG 원본은 새 레지스트리에 등록하지 않는다.
- 전신 스프라이트 폴백이 정상 경로. 관절 애니메이션 완료를 주장하지 않는다.
- 아이 앱 규칙(기존 결정): 과장은 크기까지, 위치·존재는 사실 / 자료 없으면 안 그림 / 위험기상은 웃지 않는다 / GPS 안 씀 / 로고는 v5 만.
- 배포는 `app/v3/`·`app/wonder` 재사용 금지. v1 `sw.js` 통과 목록 함정(감사 §5-1) 을 배포 경로 결정에 반영.
- 매 단계 Implemented / Tested / Browser Verified / Device Verified 구분 보고.

## 단계 (제안)

| PHASE | 내용 | 산출물 | 게이트 |
|---|---|---|---|
| **0 기반** ✅ | 골격, 팩 반입, Asset Registry, 인터랙션 런타임, 무대 셸, 검수 | 이 저장소 | I ✅ T ✅ B ✅ D ❌ |
| **1 콘텐츠** | ① 124 PNG→WebP 일괄(품질 85, 1024² 유지 여부 결정) ② 실제 배경 24장 재납품 받아 검수 ok 로 ③ `regions.json` 확정 ④ i18n 문구 자료(ko 원본·en) ⑤ 장면 이미지 | registry 124/124 ready, 배경 usable 24 | T: registry 검사 / B: 124종 순회 캡처 |
| **2 무대 엔진** | 5겹 완성(ambient 1 + secondary ≤2 + discovery hit areas), 지역 전환, 알파 경계 접지·키 정규화, lite 모드(폰), FX 색 규칙 | `packages/stage-engine` | B: 폰 프리셋·reduced motion |
| **3 캐릭터 렌더러** | 전신 변형 10동작 확정, 리그별 기본 동작, 관절 파츠(semantic parts) 계약 슬롯만, 재생 큐 | `packages/character-renderer` | B: 124종 special 재생 |
| **4 지구·내비게이션** | 새 지구 엔진(Three r184 vendor 복사, v3-paper 미복사), 좌표 규약 1개, 124종 배치·겹침 분산, 카테고리 탭(오늘/설화/공룡/동물), 줌 → 무대 전환 | `packages/globe` | B: 회전·줌·탭 |
| **5 이야기·발견** | 카드 확장(장면·place_basis·note 3~4문장), 발견 영역, 학습 규칙(교육과정 매핑) | `content/stories` | B: 카드 흐름 |
| **6 배포** | 새 S3 접두사·거름망·CI(별도 workflow, v3-kids 경로 불변)·캐시 네임스페이스·`/wonder` 전환 계획(v1 sw.js 한 줄 승인 포함) | `aws/deploy-wonder.sh`(새) | 라이브 curl·CloudFront 무효화 |

## PHASE 1 에 앞서 사용자 결정이 필요한 것

1. Master Directive 파일 위치(또는 이 초안 승인)
2. 스택 유지(ESM) vs TS+번들러
3. 124 WebP: 품질·해상도(1024² 그대로 ≈ 40KB×124 ≈ 5MB, 장면 255KB×124 ≈ 32MB → 장면은 768px 축소 검토)
4. 배경 24장 재납품 경로(생성 파이프라인 ComfyUI? 외부 납품?)
5. 배포 접두사 · `/wonder` 전환 시점
