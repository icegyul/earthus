# EARTHUS V1 FINAL DEVELOPMENT HANDOFF — V38

이 폴더 전체가 최종 개발 전달본이다.

## 전달 원칙
- 이 폴더의 전체 내용을 개발 프로젝트에 전달한다.
- `09_SCREEN_RENDERER_V37`만 단독 전달하면 안 된다. V37 화면 Renderer는 이전 단계의 V29~V36 엔진/데이터/안전 계층을 참조한다.
- `10_FINAL_RELEASE_CANDIDATE_V38`은 V38 최종 제품 분리/릴리스 게이트 계층이다.

## 제품 타깃
- Web: EARTHUS + AETHERUS
- Mobile: EARTHUS + AETHERUS
- Pleos: EARTHUS ONLY
- Pleos에는 AETHERUS UI/route/bundle/analytics/space 기능이 포함되지 않는다.

## 구현 우선순위
1. 06_BUNDLED_DATA_PACKAGE
2. 07_APP_INTEGRATION_V35
3. 08_UI_ADAPTER_V36
4. 09_SCREEN_RENDERER_V37
5. 10_FINAL_RELEASE_CANDIDATE_V38

기존 실제 EARTHUS 소스에 위 계층을 통합한 뒤, 실제 Web/Mobile/Pleos 빌드와 실기기 QA를 수행한다.
