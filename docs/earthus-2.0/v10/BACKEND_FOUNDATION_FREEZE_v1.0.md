# EARTHUS 2.0 BACKEND FOUNDATION FREEZE v1.0

## Current foundation
- **255 Engine / Component**
- **198 Algorithm / Contract**

## Freeze rule
v1.0 이후에는 백엔드 엔진 숫자를 계속 늘리는 것이 목표가 아니다. 다음 작업은 실제 Earthus 저장소에서 기존 Engine ID를 재사용하여 Provider Vertical Slice를 Production Evidence까지 닫는 것이다.

신규 엔진은 다음 4개를 모두 증명해야 한다.
1. Engine Catalog 검색 결과 동일 책임이 없음.
2. Adapter/Harden으로 해결할 수 없음.
3. 실제 구현 중 관측된 Gap Evidence가 있음.
4. 신규 Test + Runtime Consumer가 함께 추가됨.

## Production integration order
1. Seoul Population — 가장 좁은 실시간 Vertical Slice
2. KMA — observation/forecast/warning truth preservation
3. AirKorea — measurement + official alert gap
4. KTO — Travel Discovery materialization
5. News + Public Action — PULSE
6. Pollution AIR/FIRE
7. Korea Marine Water Quality / Ocean Colour
8. Oil slick / EPA / EEA / EMIT
9. Watch + APNs/FCM delivery evidence
10. Release canary / SLO / restore drill

## DONE
`actual provider → raw receipt → schema → existing parser → canonical envelope → watermark/dedup → last-good publish → Internal API → browser/runtime evidence → regression`가 끊김 없이 증명될 때만 DONE이다.
