# 안전디딤돌 기능 이식 계획 (조사 + 설계, 2026-07-31)

> 코딩 안 함. 계획만. 실행은 [build-order.md](build-order.md) 우선순위에 편입한 뒤 진행.

---

## 0. 안전디딤돌이 뭘 하는 앱인가 (조사 결과)

행정안전부(정부) 공식 재난안전 앱. 5개 기능군:

| # | 기능 | 내용 |
|---|---|---|
| 1 | **재난문자 수신** | 재난발생정보·기상특보. 수신지역을 전국/시도/시군구로 설정 |
| 2 | **국민행동요령** | 지진·태풍·홍수·호우·대설·한파·폭염 등 유형별 대처법 + 심폐소생술. **통신 두절 시에도 오프라인으로 열람 가능** |
| 3 | **대피소 정보 조회** | 민방위대피소·임시주거시설·지진옥외대피소·응급의료센터·약국·소방서·경찰서. GIS 기반 위치조회 |
| 4 | **재난신고** | 119(소방)·112(경찰) Direct Call |
| 5 | **부가 정보** | 교통·기상·물놀이·방사선·산사태·소방 정보 |

Sources:
- [안전디딤돌 - Google Play 앱](https://play.google.com/store/apps/details?id=kr.go.nema.disasteralert_new&hl=en_US)
- [안전디딤돌 앱 - App Store](https://apps.apple.com/kr/app/%EC%95%88%EC%A0%84%EB%94%94%EB%94%A4%EB%8F%8C/id475638064)
- [여름철 재난 대비 '안전디딤돌' 앱 설치 - 정책브리핑](https://www.korea.kr/news/policyNewsView.do?newsId=148947702)
- [모바일 재난 안전정보 포털 앱 안전디딤돌 - 정부24](https://www.gov.kr/portal/service/serviceInfo/PTR000052059)

---

## 1. 지금 Earthus에 이미 있는 것 (겹치는 부분)

| 안전디딤돌 기능 | Earthus 대응물 | 상태 |
|---|---|---|
| 기상특보 재난문자 | [warn.js](../prototype/js/warn.js) — 내 위치 기준 특보 매칭·토스트 알림 | ✅ 있음 (관측지점 보로노이 매칭 방식) |
| 특보 지도 표시 | [layers/alerts.js](../prototype/js/layers/alerts.js) — 한국·미국·브라질 경보 PointLayer | ✅ 있음 (기상 특보만) |

**중요한 차이**: 안전디딤돌의 "재난문자"는 기상특보뿐 아니라 **화재·화학사고·실종경보·지진 등 전체 재난유형**을 다룬다. 우리 `kma-warn`은 **기상청 특보만** 다룬다. 이게 1번 확장 지점이다.

---

## 2. 이식 대상 — 우선순위별

### 🔴 A. 국민행동요령 (가장 효율 높음 — 데이터 API 불필요)

- **내용**: 지진·태풍·호우·대설·한파·폭염 등 유형별 "이럴 때 이렇게 하라" 텍스트 + 심폐소생술
- **왜 1순위인가**: API 연동이 필요 없다. 행정안전부 공개 콘텐츠(공공누리 라이선스 확인 필요, 짐작건대 KOGL 유형1 재사용 가능성 높음 — 확인 전 사용 보류 원칙 유지)를 정적 텍스트로 번들
- **연결 지점**: 이미 있는 [warn.js](../prototype/js/warn.js) 토스트·배너에 "행동요령 보기" 링크 하나만 추가하면 됨. 지금 뜨는 특보(폭염경보 등)에 즉시 연결되는 구조라 **기존 인프라를 거의 그대로 재사용**
- **오프라인 열람**: 안전디딤돌의 핵심 가치가 "통신 두절 시에도 열람 가능"이다 — 우리도 Service Worker 캐싱으로 텍스트만이라도 오프라인 대응 검토
- **규모**: 콘텐츠 정리 0.5일 + UI 연결 0.5일 = 1일

### 🟠 B. 재난문자 전체 이력 (데이터 소스 확장)

- **내용**: 기상특보뿐 아니라 화재·화학사고·실종경보 등 **행정안전부가 실제 발송한 전체 재난문자**를 지도/타임라인으로
- **데이터원**: 공공데이터포털 "재난문자방송 발송내역" API (행정안전부) — 조사 필요 (라이선스·갱신주기 확인 전 사용 보류)
- **왜 가치 있는가**: 지금 `kma-warn`은 기상만 다루는데, 재난문자 전체를 받으면 "이번 주 국내 재난 발생 현황" 같은 새로운 분석 카드가 가능 — [build-order.md](build-order.md) P3 #18(기관 대조 리그)과 같은 패턴으로 확장 가능
- **⚠️ 한계를 분명히 할 것**: 우리는 실시간 CBS(Cell Broadcast) SMS 푸시를 대체할 수 없다. 통신사 기지국 레벨 발송 권한이 없다 — 이건 정부만 할 수 있다. 우리는 **발송된 내역을 지도로 보여주는 것**까지만
- **규모**: 조사 0.5일 + 수집기 1일 + 지도/배너 연결 1일 = 2.5일

### 🟠 C. 대피소 정보 (GIS 레이어)

- **내용**: 민방위대피소·지진옥외대피소·응급의료센터 위치
- **데이터원**: 공공데이터포털 "전국 대피소 정보" (행정안전부/국립재난안전연구원) — 라이선스 확인 필요
- **구현 방식**: 기존 [alerts.js](../prototype/js/layers/alerts.js)와 동일한 `PointLayer` 패턴 재사용 — 새 레이어 코드가 아니라 **기존 골격에 데이터만 얹는 작업**
- **연결 지점**: "내 주변 대피소" — 위치확인된 곳 근처 시트에 카드로 노출하면 "내 관측소"([build-order.md](build-order.md) P1 #7)와 동일한 UX 패턴 재사용 가능
- **규모**: 조사 0.5일 + 레이어 1일 = 1.5일

### 🟢 D. 119/112 Direct Call (가장 쉬움)

- **내용**: 버튼 하나로 전화 연결
- **구현**: `tel:119` / `tel:112` 링크 — API도 조사도 필요 없음. 법적 문제도 없음(전화 연결일 뿐)
- **규모**: 0.5일 미만

### ⚪ E. 산사태정보 — 향후 검토

- 이미 계획된 [build-order.md](build-order.md) P3 #24 "폭염·한파·가뭄 분석"과 같은 5단계 골격으로 확장 가능한 후보. 지금은 조사만 해둔다 (산림청 산사태정보시스템 API 존재 확인 필요)

### ⛔ F. 하지 않는 것

| 항목 | 이유 |
|---|---|
| CBS 실시간 SMS 푸시 대체 | 통신사 기지국 발송 권한은 정부 전용. 우리는 흉내 낼 수 없다 |
| 물놀이정보·방사선정보 | 니치 대비 개발비용 과함. 사용자 수요 근거 없음 |
| "공식 재난 앱"이라는 표현 | 우리는 정부기관이 아니다. 안전디딤돌 설치를 대체하라고 말하면 안 됨 — **오히려 "실시간 푸시가 필요하면 안전디딤돌도 함께 쓰라"고 안내하는 게 정직하다** |

---

## 3. 실행 순서 제안

```
1순위 A (행동요령)     — 기존 warn.js에 링크만 추가, 하루면 눈에 보이는 효과
2순위 D (119/112)      — 반나절, 부담 없음
3순위 C (대피소)       — 기존 alerts.js 패턴 재사용, 라이선스 확인 후
4순위 B (재난문자 전체) — 가장 크지만 가장 차별화됨. 데이터원 조사부터
5순위 E (산사태)        — 나중에, 폭염/한파 분석과 같은 파이프라인 재사용
```

**A+D는 오픈(8/4) 전에도 끼워 넣을 만큼 가볍다** — 다만 [build-order.md](build-order.md) 규칙 ④("오픈 전 항목에 신기능을 끼워 넣지 않는다")를 지키려면 오픈 후 P1으로.

---

## 4. 출처 표기 원칙 (기존 규율 그대로 적용)

- 모든 행동요령·대피소·재난문자 데이터에 `출처: 행정안전부(URL)` 명시
- "우리가 검증한 정보"가 아니라 "정부 발표를 그대로 전달"이라는 점을 분명히 (기존 [methodology-sources.md](methodology-sources.md) 원칙과 동일 — 가공 없이 인용)

---

## 5. 해외 확장 — 조사 결과 (2026-07-31)

### 핵심 발견: 나라마다 따로 만들 필요가 없다

재난경보에는 이미 **국제표준이 있다 — CAP (Common Alerting Protocol)**.
OASIS가 만들고 ITU·WMO·UN이 채택한 포맷으로, **전 세계 인구의 91%가 CAP를 쓰는 나라에 산다.**
131개국·199개 피드가 이미 이 포맷으로 발행 중이다.

→ **결론: 국가별 API를 하나씩 붙이는 게 아니라, "CAP 파서 하나"를 만들면 대부분의 나라가 한 번에 열린다.**
이건 [alerts.js](../prototype/js/layers/alerts.js)가 이미 한국·미국·브라질을 한 레이어에서 종류별 색으로 구분하는 것과 같은 설계 원칙 — 나라마다 레이어를 새로 만들지 않는다.

Sources:
- [The Common Alerting Protocol - UNDRR](https://www.undrr.org/early-warnings-for-all/common-alerting-protocol)
- [Common Alerting Protocol - Wikipedia](https://en.wikipedia.org/wiki/Common_Alerting_Protocol)
- [Common Alerting Protocol (CAP) - WMO](https://wmo.int/activities/common-alerting-protocol-cap)

### 국제 집계 서비스 — Alert Hub (IFRC/WMO)

적십자국제연맹(IFRC)이 운영하는 **무료 CAP 집계 서비스**. 이미 수백 개의 공개 피드를 모아
알림 캐시로 관리하고 있고, 커뮤니티/도시/국가/글로벌 단위로 **무료 구독(Filtered Alert Hub)**을 제공한다.

- **왜 중요한가**: 우리가 130여 개국 재난기관 사이트를 일일이 조사하는 대신, **Alert Hub 하나에 등록**하면
  대부분의 나라 경보를 한 번에 받을 길이 열린다. 조사 단계에서 **가장 먼저 확인할 대상**
- ⚠️ 아직 **공식 API 문서·요금 정책을 직접 열어 확인하지 않았다** — 다음 조사에서 API 접근 방식(등록 필요 여부, 요청 한도)부터 확인

Sources:
- [Alert-Hub.Org](https://www.alert-hub.org/)
- [The IFRC Alert Hub Initiative - PrepareCenter](https://preparecenter.org/initiative/the-ifrc-alert-hub/)
- [Alert Hub: Contributing Source CAP Feeds](https://alert-hub.s3.amazonaws.com/cap-sources.html)
- [GitHub - IFRC-Alert-Hub/Alert-Hub-CAP-Aggregator](https://github.com/IFRC-Alert-Hub/Alert-Hub-CAP-Aggregator)

### 국가별 직접 확인 결과 (Alert Hub로 안 잡힐 경우의 보완용)

| 국가 | 표준/시스템 | 공개 API 상태 | 비고 |
|---|---|---|---|
| 🇺🇸 미국 | IPAWS All-Hazards Feed | ✅ **무료, 공식.** IPAWS User Portal 가입만 하면 HTTP로 CAP 수신. EAS·WEA·NWR까지 세분화 가능 | 지금 쓰는 `world-alerts`(NWS)보다 **범위가 넓다** — 지진 외 전체 재난 |
| 🇦🇺 호주 | CAP-AU (BOM 관리) | ✅ 공식 표준, RSS/CAP 피드 존재. 州별 경보 코드(산불·홍수·사이클론 등) | 민간 집계 서비스(emergencyapi.com)도 있으나 유료 가능성 — 확인 필요 |
| 🇳🇿 뉴질랜드 | GeoNet | ✅ **완전 공개.** 지진·화산·지각변동, CAP 포맷 지원, AWS Open Data로도 배포 | 지진/화산 특화. 우리 P3 #18(지진 기관대조 리그)과 직결 |
| 🇨🇦 캐나다 | CAP-CP (Alert Ready) | 🟡 RSS 공개, 실시간 피드는 Pelmorex(민간 위탁 운영)가 관리 — 상업적 재배포 조건 확인 필요 | |
| 🇩🇪 독일 | NINA/BBK | 🟡 **비공식.** 시민 개발자 커뮤니티(bundesAPI)가 역공학으로 문서화. CAP 1.2 JSON. 정부 공식 API는 아님 | 재배포 조건 불명 — 사용 전 BBK에 직접 문의 필요 |
| 🇯🇵 일본 | JMA / J-Alert | ✅ JMA 데이터는 **이미 라이선스 확보됨**([methodology-sources.md](methodology-sources.md) 참고). J-Alert 자체(정부 내부 전파망)는 공개 API 아님 | 기존 JMA 계약 범위 안에서 지진·쓰나미 경보 확장 가능 |

### 안 만드는 것 (해외 확장)

- 국가별 API를 하나씩 손으로 통합 — Alert Hub로 대체 가능한 것을 중복 개발하지 않는다
- 공식 문서화되지 않은 국가(독일 NINA 등)는 재배포 조건 확인 전 **화면에 올리지 않는다** (기존 원칙 유지)

---

## 6. 추가된 실행 순서

```
1순위(조사) Alert Hub API 접근 방식·요금·한도 확인    — 이게 열리면 대부분의 나라가 한 번에 풀림
2순위        CAP 공통 파서 1개 작성                    — alerts.js 데이터 포맷에 맞춰 country-agnostic
3순위        미국 IPAWS 등록 (무료·공식) — 기존 NWS 피드보다 넓은 범위로 교체
4순위        뉴질랜드 GeoNet 연결        — 완전 공개, 지진 리그(#18)와 시너지
5순위        호주 CAP-AU, 캐나다 CAP-CP  — 상업적 재배포 조건 확인 후
6순위        독일 등 비공식 문서 국가    — 공식 확인 전 보류
```

---

## 7. 우리 시스템에 정확히 어떻게 꽂히는가 (아키텍처)

지금 있는 두 개의 재난경보 파이프라인을 코드 레벨로 확인했다 — **새 구조를 만들지 않고 그대로 복제한다.**

### 백엔드 — 기존 Lambda 패턴 그대로

| 기존 | 출력 |
|---|---|
| [aws/kma-warn/handler.py](../aws/kma-warn/handler.py) | `events/kma-warn.json` (한국, 관측지점 평균좌표) |
| [aws/world-alerts/handler.py](../aws/world-alerts/handler.py) | `events/world-alerts.json` (미국 NWS, 구역 중심좌표 캐싱) |

**신설**: `aws/cap-alerts/handler.py` → `events/cap-alerts.json`

- CAP는 표준 포맷이라 **파서 하나로 여러 나라를 처리** — `world-alerts.py`처럼 나라마다 새 핸들러를 만들 필요가 없다. 이게 CAP를 쓰는 이유의 전부다
- 출력 항목의 필드 이름을 `world-alerts.json`과 **동일하게** 맞춘다:
  `country, countryKo, kind, kindEn, icon, color, severity, rank, lat, lon, area, headline, effective, expires, area_wide, _src, _lic`
  → 필드만 맞추면 프론트엔드는 국가 구분 없이 하나의 파이프로 흐른다
- 좌표: CAP의 `<area><polygon>`/`<geocode>`에서 중심점 계산 — `world-alerts.py`의 `centroid()` 함수와 같은 로직을 그대로 재사용 가능 (좌표 없으면 지어내지 않고 `unplaced`로 세어 남기는 원칙도 동일)
- `_src`/`_lic`는 나라별 사전 하나로 관리 (기존 파일이 `"미국 정부 저작물 — 퍼블릭 도메인"`을 박아 넣듯, CAP는 나라마다 라이선스가 다르므로 국가코드→라이선스 문구 매핑표를 둔다)
- `events/` 공개 프리픽스 그대로 사용 — 정책 변경 불요

### 프론트엔드 — alerts.js에 블록 하나만 추가

지금 [alerts.js](../prototype/js/layers/alerts.js)는 한국(`kma-warn.json`)·브라질(`regional.json`)·미국(`world-alerts.json`) 세 개의 `try/catch fetch` 블록이 순서대로 돌며 하나의 `items[]` 배열에 합쳐진다.

CAP도 **네 번째 블록**으로 똑같이 추가 — 새 레이어·새 UI 컴포넌트 없음:
- `events/cap-alerts.json` fetch → 같은 `items.push({...})` 패턴
- `this.meta.coverage` 문구를 CAP로 받은 나라 목록까지 자동으로 갱신 (기존 "지금 받는 곳: 한국·미국·브라질" 문구 뒤에 이어붙임 — 조용한 거짓말 방지 원칙 유지)

### warn.js(내 위치 토스트 알림) — 바로 확장 안 함, 2단계

- **1단계**: CAP 데이터는 **지도 레이어에만** 노출한다. 지금 미국·브라질처럼 "보이지만 능동 알림은 안 뜬다" 상태로 시작
- **2단계 (검증 후 판단)**: [warn.js](../prototype/js/warn.js)의 "내 위치 알림" 로직은 기상청 관측지점-특보구역 대응표에 강하게 결합돼 있어 다른 나라로 그대로 못 늘린다.
  CAP는 나라마다 `<geocode>` 체계가 다르므로, **나라 하나(뉴질랜드)로 검증한 뒤에 일반화 여부를 결정**한다 — 지금 확장한다고 약속하지 않는다

### 국민행동요령(A) 다국어 문제

- 해외로 넘어가면 **번역하지 않고 공식 원문 링크만 건다.** 안전 지침 오역은 책임 문제가 크다 — 기존 "가공 없이 인용" 원칙과 같은 이유

### 검증 순서 (구체화)

```
1. Alert Hub API 문서 확인 (등록 필요 여부·요청 한도)
2. 뉴질랜드 GeoNet 하나로 cap-alerts 핸들러 프로토타입
   — 완전 공개라 계정 신청 없이 바로 검증 가능한 유일한 후보
3. alerts.js에 4번째 fetch 블록 연결 — 뉴질랜드 데이터가 지도에 뜨는지만 먼저 확인
4. 검증되면 Alert Hub 구독 등록 → 여러 나라로 확장
5. 미국 IPAWS는 별도 계정 등록이 필요하다 — 대표님 액션 아이템
```

⚠️ **IPAWS·Alert Hub 등록은 계정 승인이 필요할 수 있어 대표님 대기 항목으로 분류.**
