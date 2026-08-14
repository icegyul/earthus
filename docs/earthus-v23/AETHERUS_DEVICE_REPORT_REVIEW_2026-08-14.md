# AETHERUS iPhone 실기기 보고서 검토

## 판정

```text
Report: AETHERUS_DEVICE_QA_2026-08-13T23-56-07-405Z.json
Device: iPhone · iOS 18.7 · Mobile Safari
Viewport: 402×754 · DPR 3
Release decision: BLOCKED
```

정확한 위치 좌표는 보고서에 없고 비밀값도 포함되지 않았다. 환경, 위치, Sky AR,
로컬 촬영 원본, 동의, 5분 계측은 보고서상 PASS다. Astrometry·AI·원격 관측소는
로컬 안전 경로만 통과했고 운영 외부 관문은 의도대로 BLOCKED다.

## 확인된 실기기 증거

| 항목 | 결과 | 증거 |
|---|---|---|
| HTTPS·WebCrypto·IndexedDB | PASS | secure context, SHA-256, IndexedDB 지원 |
| 위치 | PASS | 권한 승인, 정확도 12m, 정확한 좌표 보고서 미보존 |
| Sky AR | PASS | 수락 2,371표본, 지터 0.728°, Safari absolute compass, clean stop |
| 카메라 종료 | PASS | 종료 후 live track 0, listener 0, upload 0 |
| 로컬 원본 | PASS | 720×1280, SHA-256, IndexedDB 재개방, EXIF 위치 미보존 |
| 5분 실행 | 부분 증거 | 300초·발열 NORMAL이나 배터리 값은 미입력 |
| 수동 검수 | FAIL | 세로·가로 회전 FAIL, 나머지 5항목 UNKNOWN, 재현 설명 없음 |

## 발견한 검사기 결함

빈 number input에 `Number('')`를 적용해 배터리 미입력을 `0% → 0%`로 해석하고
내구성 검사를 PASS로 만들고 있었다. RC r2에서는 시작·종료 값이 모두 실제로 입력되어야
배터리 증거를 인정하며, Battery Status API가 없는 iPhone은 시작값 입력 전 검사를 시작하지 않는다.

수동 FAIL인데 재현 설명이 비어도 보고서가 생성되던 공백도 있었다. RC r2에서는 FAIL을
선택하면 재현 설명이 필요하다는 상태와 reason code를 보고서에 남긴다.

회전 FAIL의 원인을 보고서에서 구분할 화면 상태도 없었다. RC r2는 초기·resize·orientation
change 시점의 viewport, orientation type, angle을 최대 12개까지만 기록한다.

## 남은 관문

1. 수정된 RC r2에서 배터리 시작·종료 값을 입력해 5분 검사를 다시 실행한다.
2. 회전 FAIL 재현 순서와 실제 현상을 적는다. 설명 없이는 CSS·Safari·화면 회전 잠금 중
   어느 원인인지 판정하지 않는다.
3. VoiceOver, 200% 확대, 터치·포커스, 저전력, 잠금·복귀를 PASS/FAIL로 완료한다.
4. 구형 iPhone/Safari 보고서를 별도로 받는다.
5. Supabase 사용자 A/B RLS, 운영 AI 승인, 물리 관측소 HIL은 계속 BLOCKED다.

격리 canary·장애 주입·rollback 리허설은 이미 PASS했으므로 다시 미완료로 세지 않는다.
