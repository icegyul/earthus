# 03. PR Implementation Plan

## PR-00 — Contract & Measurement Foundation

목표: 현 구현을 바꾸기 전에 요청·CPU·레이어·GPU·유휴 렌더를 수치화한다.

산출물:

- SatelliteFrameContract validator와 fixture
- module specifier 중복 검사
- layer/sibling count 진단
- 네트워크 request key 계측
- 3초 유휴 render count, mask task p95 계측
- NOAA/GK-2A/Himawari 대표 golden fixture

완료 조건:

- 현재 데스크톱/모바일 기준선 보고서가 재현된다.
- query 유무가 다른 동일 module import가 CI에서 실패한다.
- 기능 변화·운영 배포 없음.

Stop gate: 기준선 없이 PR-01로 가지 않는다.

## PR-01 — ImageryLayerGroup Lifecycle

목표: base와 visual sibling을 하나의 취소/교체/제거 단위로 만든다.

산출물:

- `ImageryLayerGroup`
- ACTIVE/REPLACING/DISPOSING 상태 머신
- AbortController와 event/timer cleanup
- 기존 NOAA/GK-2A/Himawari 경로 adapter

완료 조건:

- 각 레이어 30회 교대 후 시작 대비 layer/texture 증가 0.
- 로딩 중 OFF, 카메라 이동, channel switch에서 orphan task 0.
- visual failure가 base observation을 막지 않는다.

## PR-02 — Shared Tile Cache & Worker

목표: base/depth 중복 다운로드와 메인 스레드 canvas 비용을 제거한다.

산출물:

- bounded promise cache/LRU
- ImageBitmap 기반 worker 또는 지원 환경의 OffscreenCanvas
- fallback main-thread path
- 타일 gutter/seam 처리

완료 조건:

- 같은 frame/z/x/y 원본 네트워크 요청 1회.
- mask p95: 데스크톱 8ms 이하, 지원 최저 모바일 20ms 이하를 목표로 측정.
- 50ms 초과 long task 0을 목표로 하며 초과 시 효과 quality가 자동 하향.
- cache 상한과 eviction 테스트 통과.

## PR-03 — Source Calibration & Golden Visuals

목표: 소스/채널별 효과가 지표·팔레트·타일 경계를 오해하지 않도록 고정한다.

대상 조합:

- NOAA 낮/밤/황혼
- GK-2A visible FD/EA/LA, IR FD/EA, nightlow, WV 제외 확인
- Himawari visible/IR, 한국/일본/대만/서태평양, snow/sunglint 가능 장면

완료 조건:

- 관측 본체 threshold·alpha 분포 변화 0.
- seam pixel diff가 합의한 허용치 이내.
- IR 설명에 강수량 표현 0.
- 시각 효과가 꺼져도 source/time/limits가 동일하다.

Decision gate: Himawari 공식 cloud mask 공급자·권리·비용 승인 전까지 보수적 visible 전략 유지.

## PR-04 — Reproducible Sky Asset Pipeline

목표: 천구 원본→파생본→manifest→배포를 재현 가능하게 한다.

산출물:

- 원본 hash 검증과 tone/resize script
- 6K/4K/선택 2K variant
- SkyAssetManifest와 LicenseRegistry
- immutable content-hash 파일명
- context loss와 download/decode 실패 폴백

완료 조건:

- 깨끗한 환경에서 같은 SHA의 파생본 생성.
- 잘못된 크기·비율·license 누락이 build 실패.
- 6K 실패 시 UI 중단 없이 4K/2K로 복구.

## PR-05 — Transparency, Accessibility, User Control

목표: 사용자가 관측과 시각 효과를 구분하고 저사양에서 끌 수 있게 한다.

산출물:

- “구름 입체감 · 시각 효과” 설명
- 자동/낮음/끔 설정
- reduced-motion/save-data/low-quality 연동
- 스크린리더용 출처·시각·제한 설명
- 색만으로 채널 의미를 전달하지 않는 legend

완료 조건:

- 설정을 꺼도 관측 화소·출처·시각은 유지.
- 키보드와 스크린리더로 효과 상태 확인/변경 가능.
- 모바일 좌하단 credit과 데이터 설명이 지구 조작을 막지 않는다.

## PR-06 — Security & Supply Chain

목표: 외부 이미지/스크립트/캔버스 처리와 정적 배포 경계를 강화한다.

산출물:

- provider URL allowlist
- 이미지 dimension/decoded-byte/task-count 상한
- CSP report-only → enforcement 계획
- 외부 script SRI 또는 self-hosted pinned artifact
- `nosniff`, 정확한 MIME, CORS, referrer policy 점검
- license registry CI

완료 조건:

- 허용하지 않은 URL·스키마·과대 이미지가 처리 전에 차단.
- secret/query/정밀 위치가 telemetry에 없음.
- CSP 위반 0인 canary 증거 후 enforcement 결정.

## PR-07 — Device, Thermal & Failure Validation

목표: 브라우저 시뮬레이션을 넘어 실제 지원 기기를 승인한다.

필수 기기:

- 최신 Safari/macOS
- 지원 최저 iPhone + 최신 iPhone
- Android Chrome 저사양 1대
- Retina desktop 2×
- VoiceOver 또는 동등 스크린리더

시나리오:

- 10분 조작/확대/레이어 교대
- 5분 유휴
- background→foreground
- 저전력/열 상승/느린 네트워크/오프라인 복귀
- WebGL context loss, CORS failure, missing tile

완료 조건:

- 무한 렌더 0, crash/context-loss 복구, 조작 가능한 프레임 유지.
- 온도/배터리 결과와 지원/차단 기기 목록을 문서화.

## PR-08 — Canary, Rollback & Close-out

목표: 시각 품질 개선을 안전하게 공개하고 되돌릴 수 있게 한다.

산출물:

- 선택 파일 release manifest
- S3 version ID 또는 rollback copy
- CloudFront invalidation record
- canary URL/flag
- live hash/MIME/header/UI evidence
- 최종 ADR과 운영 runbook

완료 조건:

- canary desktop/mobile/Safari 통과.
- rollback 리허설 후 원래 hash/화면 복원 확인.
- PD 승인 전 자동 전면 공개 없음.

## PR 간 의존성

```text
PR-00 → PR-01 → PR-02 → PR-03
  └────────────→ PR-04
PR-03 + PR-04 → PR-05 → PR-06 → PR-07 → PR-08
```

## 하지 않을 것

- 실제 cloud-top-height 계약 전에 3D 고도 수치 표시
- 서로 다른 관측시각 영상 평균
- 시각 효과를 위험/예약/추천 판단에 투입
- 더 선명해 보인다는 이유로 관측 threshold 변경
- 기기 검수 전에 6K 강제
- 자동 SNS 게시, 자동 결제/판매 전환
