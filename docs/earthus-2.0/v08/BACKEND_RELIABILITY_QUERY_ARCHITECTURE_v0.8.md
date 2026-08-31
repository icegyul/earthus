# EARTHUS 2.0 v0.8 — BACKEND RELIABILITY / QUERY / RECOVERY

총 231 Engine/Component, 172 Algorithm/Contract.

## 핵심
- Provider Registry를 단일 컴파일 결과로 관리한다.
- schema version/hash를 immutable하게 관리한다.
- 중복 Lambda 실행은 lease + fencing token으로 막는다.
- 서로 다른 시각의 신호를 같은 NOW처럼 합치지 않는다.
- PULSE/환경/관광은 Geo-Temporal Query Plane을 사용한다.
- 동일 요청 폭주는 SingleFlight로 합친다.
- Safety/Weather/Tourism/News별 Cache TTL 의미를 분리한다.
- 실제 route Synthetic Probe가 없으면 운영 완료로 판정하지 않는다.
- DB Migration과 Restore Drill은 증거 기반 Gate를 통과해야 한다.
