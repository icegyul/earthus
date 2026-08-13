# EARTHUS v2.3 P0 실행 문서

> 기준일: 2026-08-12 KST
> 상태: **P0 완료 · PR-10 shadow · KMA Live/TPW 운영 공개 · 공개 Decision flag off**
> 제품 코드 착수 관문: 2026-08-16 사용량 리셋 확인과 PD 승인

이 디렉터리는 `EARTHUS_Product_Development_Spec_v2.3_FINAL_CODEX_HANDOFF.docx`의
P0 필수 산출물을 저장소 현실에 맞춰 고정한다. AETHERUS에서 진행 중인 코드는 덮어쓰지
않고, 공유 계약은 8월 16일 통합 착수 때 adapter와 feature flag 뒤에서 연결한다.

## 읽는 순서

1. [`../HANDOVER.md`](../HANDOVER.md)
2. [`../EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md`](../EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md)
3. [`CURRENT_STATE.md`](CURRENT_STATE.md)
4. [`DATA_SOURCE_MATRIX.md`](DATA_SOURCE_MATRIX.md)
5. [`CANONICALIZATION.md`](CANONICALIZATION.md)
6. [`SIGNAL_FOUNDATION.md`](SIGNAL_FOUNDATION.md)
7. [`RIGHTS_FRESHNESS.md`](RIGHTS_FRESHNESS.md)
8. [`EARTH_VIEW_STATE.md`](EARTH_VIEW_STATE.md)
9. [`RELEASE-2026-08-12-PR00A-03.md`](RELEASE-2026-08-12-PR00A-03.md)
10. [`READABILITY_FOUNDATION.md`](READABILITY_FOUNDATION.md)
11. [`RELEASE-2026-08-12-PR04.md`](RELEASE-2026-08-12-PR04.md)
12. [`ENVIRONMENT_MATRIX.md`](ENVIRONMENT_MATRIX.md)
13. [`DECISION_CORE.md`](DECISION_CORE.md)
14. [`PERSONALIZATION_UI.md`](PERSONALIZATION_UI.md)
15. [`RELEASE-2026-08-12-PR08.md`](RELEASE-2026-08-12-PR08.md)
16. [`AX_DECISION_RAIL.md`](AX_DECISION_RAIL.md)
17. [`RELEASE-2026-08-14-AX01.md`](RELEASE-2026-08-14-AX01.md)
18. [`RESERVATION_IMPACT.md`](RESERVATION_IMPACT.md)
19. [`RELEASE-2026-08-12-PR09.md`](RELEASE-2026-08-12-PR09.md)
20. [`DECISION_FUSION.md`](DECISION_FUSION.md)
21. [`RELEASE-2026-08-12-PR10.md`](RELEASE-2026-08-12-PR10.md)
22. [`AETHERUS_FINAL_CLOSEOUT_2026-08-12.md`](AETHERUS_FINAL_CLOSEOUT_2026-08-12.md)
23. [`PR11_READINESS_GATE.md`](PR11_READINESS_GATE.md)
24. [`KOREA_STARGAZING_SAFETY.md`](KOREA_STARGAZING_SAFETY.md)
25. [`RELEASE-2026-08-12-KOREA-STARGAZING.md`](RELEASE-2026-08-12-KOREA-STARGAZING.md)
26. [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md)
27. [`TEST_MATRIX.md`](TEST_MATRIX.md)
28. [`TPW_LAYER.md`](TPW_LAYER.md)
29. [`ADMIN_RUNBOOK.md`](ADMIN_RUNBOOK.md)
30. [`ANALYTICS_EVENT_CATALOG.md`](ANALYTICS_EVENT_CATALOG.md)
31. [`RUNBOOK.md`](RUNBOOK.md)
32. [`adr/`](adr/)
33. [`../earthus-next-reset/README.md`](../earthus-next-reset/README.md) — 다음 사용량 리셋 실행 패키지

## 지금 할 수 있는 일

- 저장소·운영 화면·데이터소스·권리·환경 차이를 문서와 fixture 후보로 고정한다.
- `UNKNOWN`, `BLOCKED`, `STALE`, `POLICY_BLOCKED` 상태를 없애지 않고 목록화한다.
- 8월 16일에 실행할 PR의 entry/exit/non-scope를 준비한다.
- PD가 직접 승인한 TPW 단독 slice는 운영 실자료·화면 검수 뒤 `TPW_READY=true`로 공개했다.
- PD가 `다음꺼 진행해`로 승인한 PR-01은 대표 3 source의 비공개 canonical shadow를
  로컬 구현·검증하되 Lambda·schedule·reader 전환은 하지 않는다.
- 두 번째 `다음꺼 진행해`로 승인한 PR-02는 DRAFT Source Registry와 권리·신선도·provider
  health private shadow를 로컬 구현하되 source 승인·Control Plane·운영 전환은 하지 않는다.
- 세 번째 `계속 진행해`로 승인한 PR-03은 첫 Earth/Style/Data/Evidence/Decision URL 상태와
  뒤로가기를 운영 정적 파일에 반영했다. TPW는 화면 계약만 함께 배포했고 flag는 계속 꺼져 있다.

## 지금 하지 않는 일

- EARTHUS/AETHERUS 통합 기능 코딩(TPW와 PR-01/02/03 로컬 예외 외)
- 운영 Lambda·schedule·TPW S3 산출물·Supabase 변경
- `SALES_OPEN=true` 또는 판매·구독 문구 확장
- SNS 자동 게시 또는 외부 계정 작업
- AETHERUS 작업 파일 `tools/verify_celestial_bodies.py` 덮어쓰기

## P0 판정

P0는 완료됐다. 여기서 완료는 운영 전환 가능을 뜻하지 않는다. 아래 항목은 8월 16일
PR-00 승인 전까지 차단 상태다.

- 별도 staging 자원과 callback/secret/버킷/DB 경계
- 서울 리전 런타임에서 공공 API DNS→TLS→응답→파서 실측
- Open-Meteo 상업 endpoint 또는 self-host 전환
- GVP 상업 이용 서면 허가
- Met Office 재표시·캐시·재배포 조건 확인
- 공식 기상특보 새 API의 실제 payload·지역코드 fixture
- shared signal envelope의 AWS 배포·dual-read diff·canary·rollback rehearsal
