# ADR-0002 — EARTHUS와 AETHERUS 작업을 통합 gate 전까지 분리

- 상태: 사용자 승인
- 결정일: 2026-08-12

## 결정

AETHERUS 개발은 별도 파일·변경으로 계속한다. EARTHUS는 P0 문서와 8월 16일 이후 PR
순서를 따른다. shared state/render/source contract만 adapter로 연결한다.

## 이유

두 서비스는 같은 앱에 있지만 제품 목적·UI·데이터 권리·검증기가 다르다. 한쪽의 일괄
수정이 다른 쪽의 진행 중 변경과 검증 기준을 덮으면 회귀 원인을 분리할 수 없다.

## 결과

- AETHERUS 작업 파일은 EARTHUS PR에서 자동 수정하지 않는다.
- 통합은 대표 장면·URL·render ownership critical slice를 통과한 뒤 한다.
- 공유 계약 변경은 양쪽 영향과 rollback을 PR에 적는다.
