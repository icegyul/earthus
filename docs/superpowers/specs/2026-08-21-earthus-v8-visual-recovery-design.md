# EARTHUS v8 Visual Recovery Design

상태: `DESIGN_FOR_USER_REVIEW / PRODUCT_CHANGE_NOT_STARTED`

기준일: 2026-08-21 (Asia/Seoul)

## 1. 목적

EARTHUS v7의 Forecast, Hazard, Trust, Best Window, Personal Agent, Story,
Memory, Simulation 기반은 보존한다. 현재 v8에서 계약과 모듈만 구현되고 공개 화면에
충분히 반영되지 않은 Visual Earth 경험을 처음 승인한 기획에 맞춰 복구한다.

mapped.earth는 데이터 표현과 상호작용 참고만 사용한다. 고유 UI, 색, 레이아웃,
브랜드 정체성은 복제하지 않는다.

## 2. 구현 전략

현재 공개 화면을 계속 부분 패치하지 않는다. 운영 브랜치와 현재 로컬 작업을 모두 보존한 뒤
별도 v8 preview에서 화면과 E2E를 완성하고, 승인된 정적 파일을 마지막에 한 번에 교체한다.

진행 순서:

1. 현재 dirty `main`과 `origin/main` 계보 보존 및 안전 통합
2. 공통 Visual Earth shell 복구
3. Tourism Relief 재구현
4. Unified Time, Travel, Inline Attribution 연결
5. Ocean/Flow/Follow/Cinema의 실제 가용 상태 연결
6. 무료 공식 예보와 유료 Earthus 예보 서버 경계 E2E
7. 데스크톱·모바일·캐시 경로 검수 후 일괄 배포

## 3. 공통 Visual Earth 화면

### HUD

- 공개 지구 화면에서 HUD handle과 핵심 상태를 숨기지 않는다.
- 조용한 첫 화면을 유지하되 시각·위치·현재 상태는 사용자가 다시 찾을 수 있어야 한다.
- 개발/LAB 정보는 기본 HUD에 섞지 않는다.

### 메뉴

- 왼쪽에 얇은 1차 rail과 선택된 영역의 drawer를 둔다.
- Earth에는 날씨, 대기, 바다, 사람·도시, 관측망, 생태·이동, 재난·사건,
  하늘·궤도를 둔다.
- Travel은 지금 갈 곳, 관광 밀도, 혼잡·쾌적, 날씨·안전, Best Window,
  저장 여행을 조합하는 목적별 허브다.
- 사람·도시와 관측망을 Travel로 이동하지 않는다.

### Unified Time

- 모든 레이어가 `PAST / NOW / FORECAST / SIMULATION` 상위 모드를 공유한다.
- 레이어별 시간 해상도와 가용 범위는 같은 rail 안에서 표시한다.
- NOW는 시스템 시각이 아니라 가장 최근 유효 자료일 수 있으므로 자료시각을 함께 표시한다.
- 공식 예보와 Earthus Forecast는 서로 다른 channel로 유지한다.

### Inline Attribution

- 출처는 기존 지도 저작권 안내처럼 화면 왼쪽 아래 가장자리에 직접 표시한다.
- 기본 상태에 카드, 박스, pill, 둥근 테두리, 그림자 패널을 사용하지 않는다.
- 기본 한 줄은 `출처: 기관명 · 자료시각` 형식으로 표시한다.
- 동시에 여러 레이어가 보이면 현재 활성 레이어의 핵심 출처 2개까지만 적고 `외 N`으로 줄인다.
- 관광 화면에 구름 출처처럼 다른 레이어의 출처를 보여주지 않는다.
- 글자는 지도를 가리지 않는 작은 크기로 두되 text shadow로 최소 가독성만 확보한다.
- 사용자가 `출처` 글자를 선택했을 때만 상세 source inspector를 연다.
- 전체 기술 필드와 권리 상태는 기본 화면이 아니라 LAB/Admin Inspector에 둔다.

## 4. Tourism Relief 확정 설계

### 4.1 데이터 진실

- 공식 관측 장소 수와 값은 늘리거나 복제하지 않는다.
- 하나의 장소 관측값을 여러 시각 셀로 나눌 때 셀 가중치 합은 반드시 `1.0`이다.
- 각 셀은 실제 관측소나 건물별 관광객 수가 아니라 `REGIONAL_VISUAL_ALLOCATION`이다.
- 실제 OD 자료가 없으면 이동 방향, 유입, 유출, 경로 화살표를 생성하지 않는다.
- OD가 없는 공개 레이어명은 `관광 흐름`이 아니라 `관광 밀도`로 표시한다.
- 실제 OD가 연결된 뒤에만 별도 `관광 이동` 모드를 활성화한다.

### 4.2 점박이 제거

현재의 큰 box 1개를 그대로 유지하지 않는다. 각 공식 장소를 줌과 주변 밀도에 따라
작은 셀 군집으로 분할한다.

| 화면 단계 | 표현 |
|-----------|------|
| 수도권·서울 전체 | 행정구역/tile 단위의 낮은 연속 면 |
| 구 단위 | 장소별 3×3~5×5 micro-cell 군집 |
| 동·관광권역 | 70~110m 폭의 block/hex 또는 도로 블록 마스크 |
| 선택 상태 | 원 장소, 지역 집계 범위, 값, 시각, 출처 표시 |

- 기본 군집은 9~25개 셀이다.
- 중심 셀 가중치가 높고 주변으로 점차 낮아지는 finite kernel을 사용한다.
- 가까운 장소 군집이 겹치면 값을 중복하지 않고 동일 grid에서 합산한다.
- 셀 사이 간격은 지도를 읽을 수 있을 정도만 남기며 고립된 점처럼 보이지 않게 한다.
- 건물 footprint를 사용해도 `지역 집계 시각화`라고 표시하며 건물별 값으로 라벨하지 않는다.
- 화면 밖 셀은 만들지 않고 viewport/zoom별 인스턴싱으로 관리한다. 기본 예산은 desktop 2,500,
  mobile 900 visible cells이며 초과 시 더 큰 tile로 집계한다.

### 4.3 높이와 색

높이와 색은 같은 정규화 혼잡 점수 `s`를 사용한다.

```text
s = clamp(normalizedCrowdingScore, 0, 1)
height = 12m + 168m × s^0.70
```

- 공식 혼잡 등급이 있으면 등급 순서를 `s`로 정규화한다.
- 공식 등급이 없고 공식 집계값만 있으면 같은 시각·같은 비교 지역의 percentile을 사용하고
  `시각화 정규화 점수`라고 표시한다.
- 높이는 12~180m 시각 범위로 제한한다.
- `s`가 증가하면 높이가 반드시 증가한다.
- 색도 같은 `s`에 대해 단조 증가한다.
- 빨강은 가장 높은 혼잡 구간이고 다른 색보다 낮게 보이면 실패다.
- 원 관광객 추정값과 기관 혼잡 등급은 선택 상세에서 각각 표시한다.

| 점수 | 색 | 의미 | 높이 범위 |
|------|----|------|-----------|
| 0.00~0.34 | 연한 노랑 | 여유 | 12~91m |
| 0.35~0.59 | 노랑·금색 | 보통 | 93~128m |
| 0.60~0.79 | 주황 | 혼잡 | 130~154m |
| 0.80~1.00 | 빨강 | 매우 혼잡 | 156~180m |

높이 범위는 위 공식을 구간 경계에 대입한 값을 반올림한 표시 범위다. 따라서 빨강 구간의
최저 높이는 주황 구간의 최고 높이보다 항상 높다.

### 4.4 지역명

- 서울 전체: 구 이름을 우선 표시한다.
- 구 단위: 주요 동 또는 관광권역 이름을 표시한다.
- 가까운 화면: 공식 관광지명을 표시한다.
- 기본 화면에는 충돌 검사를 통과한 8~12개 라벨만 보인다.
- 선택 라벨은 `지역명 · 관광지명 · 혼잡 단계 · 기준시각` 순서다.
- 행정구역 이름은 polygon containment 결과를 우선하며 단순 최근접 도시명으로 대체하지 않는다.

### 4.5 범례

기본 범례는 다음 한 줄 의미를 전달한다.

```text
높이·색 = 관광 혼잡도    여유 ─ 보통 ─ 혼잡 ─ 매우 혼잡
```

상세에는 공식 값, 집계 범위, 관측/전망 구분, 기준시각, 출처를 표시한다.

## 5. 관측망 공백 표현

- 관측 공백을 불투명한 붉은 면으로 덮지 않는다.
- 위험 레이어의 빨강과 관측 공백 색을 공유하지 않는다.
- 관측 공백은 얇은 윤곽, 점선, 낮은 알파의 hatch 중 하나로 표현한다.
- 기본 alpha는 0.12 이하, 선택/강조 시에도 0.24 이하를 목표로 한다.
- 지구 표면과 구름을 읽을 수 있어야 하며 붉은 픽셀이 화면을 지배하면 실패다.

## 6. 구현 상태 인벤토리

### 6.1 아직 구현되지 않음

1. Tourism 9~25개 micro-cell 분할과 질량 보존 분배
2. 줌별 tile → block/hex → 선택 원점 LOD 전환
3. 높이와 색의 동일 혼잡 점수 단조 매핑
4. 구·동·관광지 단계별 충돌 회피 라벨
5. Visual Earth 공통 화면에서 완성된 왼쪽 rail/drawer 경험
6. 모든 레이어를 실제로 묶는 Unified Time UI
7. 실제 Ocean vector/depth provider 연결
8. 실제 vector를 사용하는 Follow Current
9. 실제 scene manifest를 사용하는 Cinema Mode
10. 실제 관광 OD에 기반한 유입·유출·방향 표현
11. Earthus Forecast ingest/fusion/verification의 운영 결과
12. 유료 계정 200, 무료 계정 403, 만료 계정 차단 production E2E
13. SKT·KT·LG 유동인구 데이터 계약·권리·개인정보 기준과 ingest
14. 실제 모바일 GPU·발열·프레임 예산
15. 전 기능 keyboard, reduced-motion, screen-reader E2E

### 6.2 부분 구현 또는 현재 고장

1. Tourism box renderer: cylinder는 제거됐지만 희소한 기둥/점박이 표현
2. HUD: 요소는 있으나 공개 화면에서 hidden/display none 회귀
3. 관측망: 레이어는 있으나 alpha 0.95의 붉은 멍 표현
4. Provenance UI: 현재 큰 둥근 카드이며 활성 레이어와 다른 출처가 노출될 수 있음
5. Travel 메뉴: 정보구조 코드는 있으나 clean browser에서 loading overlay가 클릭 차단
6. v8 runtime: 단위계약은 통과하나 clean browser 준비 타임아웃
7. 관광 브라우저: data source가 null인 상태에서 entities 접근 실패
8. Unified Time: core 단위검사는 통과하나 공개 화면은 기존 레이어별 시간축이 우세
9. Forecast entitlement: 서버 경계는 있으나 실제 출력과 유료 E2E가 없음
10. Ocean Engine: 계약/UI core는 있으나 실제 vector 권리·provider가 없음

### 6.3 외부 데이터·권리 때문에 차단

1. 통신 3사 정밀 유동인구
2. 실제 관광 OD와 방향성 이동 데이터
3. Ocean 수심별 vector의 표시·가공·유료 제공 권리
4. KTO 일부 데이터셋의 실제 운영 수집 상태
5. Earthus Forecast 모델 산출물의 충분한 검증 표본과 release gate 증거

### 6.4 보존됐지만 v8 전체 여정 미검증

1. Hazard와 공식 경보 우선권
2. Trust, Source, Rights, Kill Switch, Cost Governor
3. Best Window와 Personal Agent
4. Story, Memory, Replay
5. Simulation
6. Forecast history와 confidence 설명

이 항목들은 삭제 또는 재개발 대상이 아니다. Visual Earth, Unified Time, Entitlement와 연결된
공개·유료 전체 여정만 다시 검증한다.

## 7. 수용 기준

### 관광

- 서울 전체 화면이 고립된 121개 box가 아니라 연속된 밀도 구조로 읽힌다.
- 셀을 늘려도 각 공식 장소의 총량은 보존된다.
- 빨강 셀은 노랑·주황 셀보다 낮지 않다.
- 기본 화면에 구/동/관광지 라벨이 LOD에 맞게 표시된다.
- OD가 없을 때 흐름 방향을 표시하지 않는다.

### 공통 화면

- HUD 회귀검사가 mobile/desktop에서 통과한다.
- 관측망 overlay alpha와 붉은 화면 비율 검사가 통과한다.
- Travel 메뉴가 loading에 가로막히지 않는다.
- 왼쪽 아래 출처가 박스 없이 표시되고 현재 활성 레이어와 일치한다.
- PAST/NOW/FORECAST/SIMULATION이 같은 rail에서 동작한다.

### 출시

- clean checkout에서 모든 브라우저 E2E가 재현된다.
- 기존 사용자 작업과 레거시 자료가 보존된다.
- 공식 관측·예보·경보의 무료 경로가 유지된다.
- premium payload가 무료 브라우저/CDN/service-worker에 존재하지 않는다.
- 실제 운영 URL, cache, mobile/desktop 캡처까지 통과한 뒤에만 v8 완료로 표시한다.

## 8. 비범위

- mapped.earth UI·색·브랜드 복제
- 가짜 관광 관측점과 가짜 OD 생성
- 실제 권리 없는 통신사·Ocean 데이터 사용
- AETHERUS 업데이트
- 판매 오픈

## 9. 구현 전 안전 조건

현재 로컬 `main`과 운영 `origin/main`은 갈라져 있고 수정·미추적 파일이 존재한다.
따라서 현재 작업을 백업하지 않은 pull, reset, checkout, 강제 push, 즉시 배포를 금지한다.
구현계획은 별도 격리 작업공간, 파일별 변경 범위, 테스트, rollback, 일괄 배포 절차를 포함해야 한다.
