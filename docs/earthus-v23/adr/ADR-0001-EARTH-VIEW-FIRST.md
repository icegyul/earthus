# ADR-0001 — 아름다운 Earth View를 첫 화면으로 유지

- 상태: 승인 제안
- 결정일: 2026-08-12

## 결정

일반 첫 방문은 아름다운 3D 지구본인 Earth View에서 시작한다. 도시값·등치선·복잡한
판독 패널은 사용자가 `지구 스타일`을 열거나 data share URL로 들어왔을 때만 표시한다.

## 이유

EARTHUS의 첫 가치는 지구를 감상하고 발견하는 경험이며, 수치 판독은 사용자의 명시적
의도 뒤에 와야 한다. 이 분리는 성능·접근성·URL 복원과도 연결된다.

## 결과

- PR-03은 Earth View/Style/Data/Evidence/Decision 상태를 URL과 뒤로가기에 고정한다.
- Data View를 닫으면 원래 지구 장면을 복원한다.
- first-load KPI가 늘어도 Earth View를 자동 분석 대시보드로 바꾸지 않는다.
