# ADR-0003 — 확장형 EarthSignalEnvelope를 정본으로 사용

- 상태: 로컬 shadow 구현 승인 · 운영 정본 전환 미승인
- 결정일: 2026-08-12

## 결정

고정 9개 weather field 대신 versioned signal envelope를 사용한다. 시간·CRS·수직 기준·
단위·결측·revision·source policy를 모든 signal의 공통 계약으로 둔다.

## 이유

현재 source handler 64개는 필드명과 시각 의미가 다르다. Activity/Safety/Live/Intelligence가
원 payload를 직접 읽으면 hard gate·cache·설명·재현이 서로 달라진다.

## 결과

- 기존 adapter는 한 번에 교체하지 않고 대표 3개 shadow를 먼저 만든 뒤 dual-read를 별도 승인한다.
- canonical metadata가 없으면 계산은 `UNKNOWN`이다.
- 원 응답과 processor version을 보존한다.
- 2026-08-12 대표 3개 compatibility adapter를 별도 `signal-foundation` shadow로 구현했다.
  기존 reader와 UI는 아직 canonical을 읽지 않으며 AWS 배포·schedule도 하지 않았다.
