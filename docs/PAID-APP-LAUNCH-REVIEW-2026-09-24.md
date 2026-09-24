# EARTHUS 유료 앱 출시 점검 (2026-09-24) — 문제 없는가

- 질문(PD): "유료 어플로 출시하는데 문제 없는지 조사해줘"
- 범위
  - (A) 설치할 때 돈을 받는 유료 앱
  - (B) 무료 앱 + v2 기간 이용권·구독
  - (C) 크롬 새 탭 확장을 유료로 팔 때
- 근거
  - 하위 조사 보고서 5건(`docs/paid-app-review-2026-09-24/` 의 `r-play.md` · `r-law.md` · `r-data-weather.md` · `r-data-maps.md` · `r-tax.md`)과 저장소 문서.
  - 반박 검증 2건(`verify-legal.md` · `verify-data.md`)의 정정을 모두 반영한 **최종본**이다. 무엇을 고쳤는지는 맨 끝 '검증 기록'에 있다.
  - 법령은 국가법령정보센터 현행 본문을, 정책·약관은 각 기관 공식 페이지를 **2026-09-24**에 읽었다.
- ⚠️ **법률·세무 자문이 아니다.** 공개 문서를 읽고 정리한 것이다.
  - **⚪ 확인 필요**라고 적은 것은 공식 출처로 확정하지 못한 것이다. 사실로 읽지 말 것.
  - "조문이 그렇게 적혀 있다"는 확인했어도, **우리 기능이 그 조문에 해당하는지(포섭)**는 대부분 변호사·기상청이 판단한다. 그런 곳은 "포섭 ⚪"로 적었다.
  - §5 의 질문은 변호사·세무사·기상청이 답해야 한다.
- 조사만 했다. 코드·설정·스토어·배포·계정은 하나도 바꾸지 않았다. (2026-09-24 정정) 이 파일은 `build/paid-app-review/` 에서 `docs/` 로 옮겼고, 근거 보고서는 `docs/paid-app-review-2026-09-24/` 에 있다.

---

## 00. PD 계획에 맞춘 판정과 일정 (2026-09-24 메인 세션 편집)

> PD 결정(2026-09-24): "기상사업자 등록은 올해 12월 되야 가능하니깐 그동안 무료로 제공하고 테스트를 하자. 1월 1일부터 유료 서비스 진행하자."
> 아래는 이 계획을 보고서 판정에 대 본 것이다. 본문(§0~§6)은 계획을 알기 전에 쓴 조사 결과 그대로다.

### 00-1. 계획과 맞는 것
- **방식:** 무료 앱으로 먼저 내고 1월 1일부터 앱 안 Play 결제 선불형 기간 이용권을 판다 — 본문 추천 (B)와 같다. 무료로 낸 `net.earthus.app` 은 나중에 설치 유료(A)로 못 바꾸므로(P2) 이 순서가 맞다.
- **수수료:** 1월 1일 판매는 처음부터 한국 새 Play 체계(10% + 청구 수수료, 요율 미발표)다(P5).
- **시험 기간:** 개인 계정이면 필요한 비공개 테스트(12명 × 14일)를 무료 기간에 치른다.
- **기상예보업 등록(L1):** 12월 등록이면 1월 1일 유료의 관문이 열린다. 요건은 상근 기상예보사 1명 이상(개인사업자 본인 자격 포함, 별표 1)이다.

### 00-2. 무료 기간이라도 남는 것 — 기상법 §17 (메인 세션이 원문 재확인)
- 기상법[법률 제21463호, 2026-09-18 시행] 제17조: "기상청장 외의 자는 예보 및 특보를 할 수 없다." 예외는 국방과 기상예보업 등록자의 예보뿐이다. **유·무료 구분이 없다.**
- 제2조 제9호: 예보 = "수치예측 결과 … 등을 기초로 한 예상을 발표하는 것". 제51조 제1항 제1호: 예보 위반 과태료 100만원 이하. 제48조: 특보 위반 3년 이하 징역·3천만원 이하 벌금.
- 지금 운영 중인 화면: v2 의 GFS 5일 예보 재생·앙상블 확률, **v1 날씨 시트의 Open-Meteo 10일 예보·강수확률**(v1 은 '예보하지 않는다'가 원칙인데 코드가 다르다 — 본문 1-5).
- 외국 수치모델 출력을 이름·실행 시각과 함께 보여 주는 것이 '예보를 하는 것'인지는 **포섭 ⚪ — 기상청·변호사 판단**이다. 이 문서는 판단하지 않는다.
- 등록 전 선택지(PD 결정):
  - (가) 지금대로 두고 12월 등록까지 간다 — 과태료 위험을 안는다.
  - (나) 등록 전까지 예보 화면마다 "외국 수치모델 원자료(GFS · 실행 시각) — 기상청 예보가 아님"을 분명히 하고, 기상청에 서면 질의(§5-3)를 이번 주에 보낸다 — 위험을 없애지는 못하지만 판단을 빨리 받는다.
  - (다) 등록 전까지 v2 예보 재생과 v1 10일 예보를 끈다 — 가장 안전하지만 시험 기간에 v2 의 핵심(예보)을 시험할 수 없다.
- 어느 쪽이든 **자체 판단의 경고·특보형 문구·푸시는 만들지 않는다**(특보는 등록해도 불가, 제48조).

### 00-3. 판매와 무관하게 지금 손볼 것 (무료 기간에도 걸림)
| # | 무엇 | 왜 | 길 |
|---|---|---|---|
| L5 | "＋ 지금 내 위치" 좌표를 서버(`alert_spots`)에 저장 | 위치기반서비스사업 신고 대상 가능성 높음(소상공인은 개시 후 1개월 안 신고 — 이미 넘었을 수 있음) | 신고 + 위치 약관·동의·확인자료 기록 / 또는 기능을 '지도 중심 저장'으로 바꿈 — PD 결정 · 변호사 |
| D12 | 지역 뉴스 RSS 중 RNZ | 공식: "These feeds are for personal use only." | RNZ·RNZ Pacific 을 뺀다(나머지 9곳은 약관 확인) |
| L4 | 새 탭 확장의 쓰나미 줄(PTWC, 기본 켜짐)·지진 줄 JMA 폴백 | 지진관측법 §16 — 기상청장 외 관측 결과·특보 발표 제한, 승인 경로(②) 있음 | 스토어 제출 전에 쓰나미 줄 기본 끔, 지진 줄은 기상청 항목만 — 제출 전이라 비용 작음 |
| P3 | Play 등록정보에 '정부를 대표하지 않음' 문장과 출처 URL | Play 정부 정보 정책 | 스토어 문안 초안 §1-6 고침 |
| L3 | 기상청 자료 화면의 출처 표기 | 기상법 제12조의3 제5항 — 미표기 과태료 50만원 이하 | 빠진 화면만 점검 |

### 00-3b. PD 결정 (2026-09-24 저녁)
| 항목 | 결정 | 반영 |
|---|---|---|
| 00-2 v2 예보·확률 화면 | **(나) 표기 강화 + 기상청 서면 질의** | 모든 예보·확률 화면에 "수치모델 예측 · {모델} {실행 시각} — 기상청 예보 아님" · 질의서 초안 `docs/KMA-INQUIRY-DRAFT-2026-09-24.md`(PD 가 보낸다) |
| v1 날씨 시트 10일 예보 | **그대로 두고 원칙을 고친다** | AGENTS.md·HANDOVER §1 에 정정 줄(v1 '예보하지 않는다' = 우리가 예보 문장을 만들지 않는다). 기상법 §17 쟁점은 같은 질의에 포함 |
| L5 '＋ 지금 내 위치' 저장 | **지도 중심 저장으로 바꾼다** | 기기 좌표를 서버로 보내지 않는다(v1 코드 변경) |
| D12 뉴스 RSS | **빼지 않는다 — 뉴스를 더 늘린다** | RNZ 'personal use only' 쟁점은 남는다. 새 매체를 넣을 때마다 RSS 이용 조건을 확인한다 |
| L4 새 탭 | **추천대로** | 쓰나미 줄 기본 끔 · 지진 줄은 기상청 항목만 |
| P3 Play 정부 고지 | **추천대로** | 스토어 문안 초안에 '정부나 정치 단체를 대표하지 않음' + 출처 URL |

### 00-4. 1월 1일 유료까지 거꾸로 잡은 일정 (기간은 추정)
| 시기 | PD 몫 | 개발 몫 |
|---|---|---|
| **9월 말~10월 초** | 기상청 서면 질의 발송(§5-3: 모델 출력의 예보 해당 여부 · API허브 자료 유료 사용 · 지진관측법 §16② 승인) · 변호사 상담 예약(§5-1) · 00-2 선택지 결정 · 00-3 L5 길 결정 · Play/CWS 계정, D-U-N-S 신청 · 업로드 키 | 00-3 의 D12·L4·P3·L3 반영 · 앱 내부 테스트 빌드 |
| **10월** | Open-Meteo 견적 문의 또는 대체 결정(D1) · Esri ArcGIS Location Platform 가입(D2) · 세무사 상담(T1~T4, 결제 프로필 사업자번호) | Overpass → S3 정적 파일(D3) · Esri 키 전환 · Open-Meteo 대체 수집 착수(GFS·ECMWF Open Data) · Gemini 18세 조항 경로 결정 반영(D4) |
| **11월** | 비공개 테스트 12명 × 14일 운영(개인 계정이면) · 약관 제8·9조 개정안(선불형·시험 사용·미성년자 취소권) 법무 확정 · 처리방침 개정 확정 | **Phase 2 결제**(Play 선불형 8상품 · 서버 영수증 검증 · 3일 안 확인 · 서버 등급 판정 · v2 잠금→구독→복귀) · 판매 스위치에 조건 추가(`billing.js:387-393` — 기상예보업 · 기상청 회신 · Esri · Gemini · 에코뱅크 · 뉴스 RSS) |
| **12월** | **기상예보업 등록**(기상예보사 1명) · 기상청 회신 반영 · Play 상품 등록·가격(창립 멤버 50% 포함)·결제 프로필 세금 정보 · 공개 출시 | 등록 범위에 맞춰 유료 화면 문구 정리 · 판매 전 점검(본문 §4) 전부 통과 확인 |
| **2027-01-01** | `SALES_OPEN` — 판매 시작 | 운영 감시(결제·환불·권한 회수) |

- **1월 1일을 막을 수 있는 것(가장 긴 줄):** 기상예보업 등록(인력), Open-Meteo 대체 또는 계약(해양 파고는 대체가 가장 늦다), 기상청 서면 회신, Phase 2 결제.
- 크롬 새 탭 확장은 **무료로 계속** 둔다(유료화 경로 없음 — P6).

---

## 0. 결론 먼저

1. **지금 그대로 유료로 열면 막힌다. 가장 큰 벽은 기상산업진흥법의 '기상예보업' 등록이다.**
   - v2 의 5일 모델 예보와 확률을 사업으로 제공하면 등록 대상일 가능성이 높다. 미등록 사업은 2년 이하 징역·2천만원 이하 벌금이다.
   - 등록 인력은 **상근 기상예보사 1명 이상**이다(별표 1, 2026-01-02 개정). **PD 본인이 자격이 있으면 본인으로 채울 수 있다.**
   - PD 계획("12월 등록 → 2027-01-01 유료", HANDOVER §8)은 이 1명을 둘 수 있을 때만 성립한다.
2. **등록해도 풀리지 않는 것이 있다.**
   - 자체 '특보·경고'는 등록해도 할 수 없다(기상법 §17).
   - 지진·지진해일 정보에는 기상사업자 예외가 없다. 다만 **기상청장 승인 경로(지진관측법 §16②)는 있다.** 실제 사건의 쓰나미 도달시간, JMA 지진·PTWC 쓰나미 재전달(새 탭 포함)은 확인 전까지 유료 상품에서 뺀다.
3. **무료라서 괜찮다고 볼 수 없는 것이 있다.** v1 날씨 시트도 Open-Meteo 10일 예보·강수확률을 보여 준다(코드 확인). "v1 은 예보하지 않는다"는 원칙과 코드가 다르다. 기상법 §17 에는 유·무료 구분이 없다 → 변호사 확인.
4. **자료·외부 서비스 일곱 곳은 돈을 받기 전에 계약·교체·허락이 필요하다.** Open-Meteo 무료 API · Esri 타일 · OSM Overpass 공용 서버 · Gemini(18세 조항) · 스미소니언 GVP · 지역 뉴스 RSS(RNZ 등) · 국립생태원 에코뱅크. 기상청 자료의 유료 사용 조건도 서면으로 받아야 한다.
5. **판매와 관계없이 지금 걸려 있는 것:** "＋ 지금 내 위치" 서버 저장은 위치기반서비스사업 신고 대상일 가능성이 높다(이미 운영 중). Play 등록정보에 '정부를 대표하지 않음' 문장과 출처가 빠져 있다.
6. **방식은 (B) '무료 앱 + 앱 안 Play 결제 선불형 v2 기간 이용권'이 맞다.** 먼저 무료로 낸 앱(`net.earthus.app`)은 **영영 (A) 유료 앱이 될 수 없다.** 크롬 확장은 무료로 둔다. 자기 사이트를 담은 TWA 를 막는 Play 조항은 찾지 못했고, 세금은 출시를 막지 않는다(한국 구매자분 부가세는 PD 가 신고·납부).

---

## 1. 판정표

범례: 🟢 문제 없음 · 🟡 조건부(할 일 있음) · 🔴 이대로는 막힘 · ⚪ 확인 필요
대상: **v1**(무료 웹) · **v2**(유료 예정) · **앱**(안드로이드 TWA, v1+v2 를 모두 담음) · **새 탭**(크롬 확장)
근거의 읽은 날은 모두 **2026-09-24**다. 법령 URL 형식은 `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=<번호>&efYd=<시행일>` 이고, 표에서는 "법령(lsiSeq)"로 줄여 쓴다.

### 1-1. 법·제도

| # | 이슈 | 대상 | 판정 | 근거 | 해야 할 일 | 담당 |
|---|---|---|---|---|---|---|
| L1 | **기상산업진흥법 — 기상예보업 등록** | v2 · 앱 (v1 예보 화면도 ⚪) | 🔴 | 제2조 제2호("미래의 기상상태를 예상하여 제공"), 제4호(일반·특정 수요자 대상 기상예보 **사업**), 제6조 제1항(등록), 제26조 제2항 제1호(미등록 2년 이하 징역·2천만원 이하 벌금). 시행령 제5조 제1항 제1호: 인터넷으로 불특정 다수에게 주는 예보도 포함 — 법령(270217, 시행 2026-03-26) · 시행령(284593). 별표 1 <개정 2026. 1. 2.>: 상근 기상예보사 1명 이상, 비고 2의2 "개인사업자를 해당 업종의 인력 산정에 포함" — https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=162468921&bylClsCd=110201 · 기상청 등록 안내 https://www.kma.go.kr/kma/biz/biz_regist01.jsp | ① 기상예보사 1명(PD 본인 자격 또는 상근 고용)을 확보해 등록한다(PD 계획: 12월). ② 등록 전에는 유료 영역에서 예보·확률을 뺀다. ③ 등록 범위가 Intelligence 확률·Simulation 까지 덮는지 확인한다. **기준은 '유료'가 아니라 '사업'이다** — 무료라도 사업이면 대상일 수 있다(포섭 ⚪) | PD · 전문가 |
| L2 | **기상법 §17 — 예보·특보 제한** | **v1(날씨 시트)** · v2 · 앱 | 🟡 (특보형 자체 경고는 🔴) | 기상법 [시행 2026-09-18, 법률 제21463호] — 법령(284327). 제2조 제9호: 예보 = 수치예측 결과 등을 기초로 한 예상 발표. 제17조 본문 "기상청장 외의 자는 예보 및 특보를 할 수 없다." 예외는 국방과 등록 기상예보업자의 **예보**뿐(항공·§14조의3① 우주영향 예보 제외). 특보는 예외가 없다. 제48조: 특보 위반 3년·3천만원. 제51조 제1항 제1호: 예보 위반 100만원 이하 과태료 | 자체 판단의 경고·특보형 문구·푸시를 만들지 않는다(이안류 푸시는 기관 등급을 그대로 옮기는 원칙 유지). **§17 에는 유·무료 구분이 없다.** 지금 무료로 공개된 v2 예보와 **v1 날씨 시트의 Open-Meteo 10일 예보·강수확률**(`prototype/js/weather-contract-v7.js:46,51`, `ui-weather.js:367,623-646`)도 같은 쟁점이다(포섭 ⚪, 변호사). 기상청 동네예보 재전달은 성격이 다르다(⚪). 오로라 예보가 §14조의3①에 드는지 ⚪ | 개발 · 전문가 · PD |
| L3 | **기상법 출처 표시 의무** | v1 · v2 · 앱 · 새 탭 | 🟡 | 제12조의3 제5항([본조신설 2026. 3. 17.]), 제36조의2 제3항. 출처를 밝히지 않으면 제51조 제2항, 50만원 이하 과태료 — 법령(284327) | 모든 기상청 자료 화면에 출처를 표기한다(원칙은 이미 있음). 출처가 빠진 화면만 점검한다. 확장의 출처 줄도 이 의무를 채운다 | 개발 |
| L4 | **지진관측법 §16** | v1 · v2 · 앱 · **새 탭(지진 줄·쓰나미 줄)** | 🔴 (실제 사건 쓰나미 도달시간·유료) / ⚪ (기상청·JMA·PTWC 재전달) | 지진·지진해일·화산의 관측 및 경보에 관한 법률 [시행 2026-02-01] — 법령(268815). 제16조 제1항: 기상청장 외의 자는 관측 결과·특보를 "발표할 수 없다". 예외: 시행령 제8조(인공지진·학문연구) — 법령(281745). **그리고 제16조 제2항: 그 밖의 자가 발표하려면 기상청장의 승인을 받아야 한다(승인 경로가 있다).** 기상사업자 예외는 없다. 제28조 제1항: 3년·3천만원 | 실제 사건의 쓰나미 도달시간은 표시·푸시하지 않는다. 가정 시나리오로만 보여 주고, 실제 사건에는 "기상청 발표를 따르라"만 둔다. 새 탭 확장은 쓰나미 줄(`apps/chrome-newtab/feeds.js:28,414`, NOAA PTWC 재전달)이 기본으로 켜져 있고, 지진 줄은 기상청 항목이 없으면 JMA 로 대신한다(`feeds.js:375`). 기상청에 §16② 승인의 절차·서식·기준을 서면 질의한다(시행령에 절차 규정 없음 ⚪). 확인 전까지 JMA·PTWC 재전달은 유료 핵심 기능으로 쓰지 않는다 | 개발 · 전문가 · PD |
| L5 | **위치정보법 — 위치기반서비스사업 신고** | v1 · v2 · 앱 (새 탭 해당 없음) | 🔴 (이미 운영 중 · 신고 대상 가능성 높음 — 변호사 확인) | 제9조 제1항: 신고 의무. 제9조의2: 소상공인은 **면제가 아니라 개시 후 1개월 안 신고**. 제40조: 미신고·무동의 수집 3년·3천만원. 제18·19조: 약관 명시 후 동의. 제16조 제2항: 확인자료 자동 기록. 제25조: 14세 미만 법정대리인 동의 — 법령(277359). 위치정보지원센터: 사업자 시스템으로 전송하지 않으면 신고 대상에서 제외 — https://www.lbsc.kr/front/content/contentViewer.do?contentId=CONTENT_0000081 | 저장소 사실: `ui-alerts.js:406-415`("지금 내 위치" 버튼) → `push.js:176-179`가 기기 측위 좌표를 `alert_spots`에 저장한다. 앱은 `twa-manifest.json` `locationDelegation.enabled: true`로 안드로이드 위치 권한을 웹에 넘긴다. 두 길 중 하나: A) 신고하고 위치 약관·동의·확인자료 기록을 갖춘다. B) "지금 내 위치" 저장을 없애고 지도 중심 저장만 남긴다. `prototype/legal/README.md:24`의 "2021년 개정 면제"와 같은 절의 "위치를 저장하지 않고 실시간 처리만"은 둘 다 틀렸다(개정 대상). 늦은 신고 처리는 변호사에게 묻는다 | PD · 전문가 |
| L6 | **전자상거래법 — 표시 의무** | v1 · v2 · 앱 | 🟡 | 제10조 제1항, 제13조 제1항 제3호(신고번호·신고 기관). 제45조 제4항 제2호: 1천만원 이하 과태료 — 법령(282793, 시행 2026-07-21) · Play 한국 개발자 정보(유료 앱·인앱 구매 앱에 요구, 한국 사용자에게 설명 하단 표시) https://support.google.com/googleplay/android-developer/answer/3255733?hl=ko | 약관·처리방침의 자리표시자 3곳(주소·전화·신고번호)을 채운다. Play Console 계정 정보에 사업자번호·통신판매 신고번호·신고 기관을 넣는다 | PD |
| L7 | **전자상거래법 — 청약철회(7일)·시험 사용** | v2 · 앱 | 🟡 | 제17조 제1항(7일), 제2항 제5호(디지털콘텐츠는 제공 개시 뒤 제한, 가분적이면 개시되지 않은 부분은 제외). 제6항 단서: 제한하려면 **표시 + 시험 사용 제공**이 모두 필요. 시행령 제21조의2(일부 이용·한시 이용·체험판·정보 제공) — 시행령(288143). 제13조 제3항: 미성년자 취소권 고지 | 약관 제9조에 시험 사용 방법이 없다. v2 FREE 등급을 '체험용 디지털콘텐츠'로 약관과 결제 화면에 명시한다(충족 여부는 포섭 ⚪). 미성년자 취소권 고지를 넣는다. (A) 방식은 체험 수단이 없어 불리하다 | 개발 · 전문가 |
| L8 | **환불 — Play 48시간 vs 법정 7일** | 앱 | 🟡 | Play 는 48시간이 지나면 개발자에게 문의하라고 안내 — https://support.google.com/googleplay/answer/15574908 · 환불은 개발자 정책대로, 전액·부분 환불 가능 — https://support.google.com/googleplay/android-developer/answer/2741495 | 3~7일째 철회 요청은 PD 가 Console 에서 직접 환불한다. 약관 제9조의 일할 환불을 Console 부분 환불로 처리하는 운영 절차를 만든다. 환불 시 서버 권한 회수를 연결한다 | PD · 개발 |
| L9 | **전자상거래법 — 정기결제 30일 전 동의** | v2 · 앱 (자동 갱신을 택할 때만) | 🟢 (선불형 기간 이용권 유지 시) / 🟡 (자동 갱신 시) | 제13조 제6항 · 시행령 제20조의2: 증액·무료→유료 전환 30일 전 동의. 위반 시 제45조 제4항 제5호의2, 1천만원 이하 과태료. Play: 선불형은 자동 갱신하지 않는다, 가격 인상은 기본이 옵트인(일부 국가·조건은 옵트아웃 가능), 한국은 체험·소개가→정가 전환 때 동의 — https://developer.android.com/google/play/billing/lifecycle/subscriptions · https://developer.android.com/google/play/billing/price-changes | 현 약관(자동 갱신 없는 기간 이용권)을 유지하고 Play **선불형(prepaid)**으로 판다. 자동 갱신으로 바꾸면 약관 제8조를 전면 개정한다. 창립 멤버 "언제나 정가 50%" 조항과 가격 인상 규칙이 충돌하는지 법무가 확인한다 | PD · 전문가 |
| L10 | **전자상거래법 — 다크패턴 금지** | v2 · 앱 · (v1→v2 유도) | 🟡 | 제21조의2 제1항 [본조신설 2024. 2. 13.]: 총액 일부만 표시·사전 체크·선택지 시각 차별·해지를 복잡하게/다른 방법으로만·반복 요구 금지. 반복 요구는 일정 기간 요구받지 않도록 고를 수 있게 하면 제외(제5호 단서). 제45조 제4항 제7호: 1천만원 이하 과태료 — 법령(282793). 시행일(부칙)은 읽지 않았다 ⚪ | 결제 UI 를 점검한다(연 총액 표시, 기본 체크 없음, 버튼 크기 차별 없음). 앱에서 가입했으면 앱에서 해지할 수 있게 한다. v1→v2 유도 문구가 반복 노출되지 않게 하거나 "당분간 보지 않기"를 둔다 | 개발 |
| L11 | **개인정보 국외이전** | v1 · v2 · 앱 | 🟡 | 개인정보 보호법 [시행 2026-09-11] 제28조의8 제1항: 별도 동의(1호), 계약 이행에 필요한 위탁·보관을 처리방침에 공개(3호 가목)하거나 개별 고지(나목), 인증(4호), 적정성 인정(5호). 제64조의2 제1항 제7호: 매출 3% 이하 과징금(2026-03-10 개정으로 가중 조항 신설) — 법령(283839) | 처리방침 개정: Gemini(현재 0건) · AWS 오하이오 · Supabase 리전 · 알림 지점 좌표 · MyMemory · Play 결제를 넣는다. 지금의 "국외 이전 없음" 문구는 Play 결제가 붙으면 거짓이 된다. Gemini 이전 근거(동의 vs 위탁)는 법무 판단. 초안은 `privacy.ko.revised-draft-2026-09-24.md`. Anthropic API(news-brief)는 개인정보가 실리는지로 판단(지금 코드는 사건 정보만 보낸다) | 개발 · 전문가 |
| L12 | **부가통신사업 신고** | 전체 | ⚪ (신고 간주 가능성 높음) | 전기통신사업법 제22조 제5항: 소규모는 "신고한 것으로 본다" — 법령(286079). 시행령 제30조 제1항: 인터넷 부가통신, 자본금 1억원 이하 — 법령(285721) | 개인사업자의 '자본금'을 어떻게 보는지 과기정통부·중앙전파관리소에 문의한다 | PD |

### 1-2. 스토어·플랫폼

| # | 이슈 | 대상 | 판정 | 근거 | 해야 할 일 | 담당 |
|---|---|---|---|---|---|---|
| P1 | **Play 정책 — 자기 사이트 TWA 판매** | 앱 | 🟢 ((A)는 🟡 비권장) | 웹뷰 스팸 조항은 "without permission from the website owner"인 경우다 — https://support.google.com/googleplay/android-developer/answer/9899034 (다른 조항이 없다는 것과 최소 기능 심사 통과는 ⚪) · 다운로드 요금은 Play 결제만 — https://support.google.com/googleplay/android-developer/answer/9858738 · Google: "We do not recommend the paid app option for PWAs" — https://developers.google.com/chromeos/app-development/publish/pwa-in-play | (B)를 택한다. assetlinks 로 소유를 증명한다. **앱 안의 토스 결제창:** 한국 대체결제 프로그램에 **가입하지 않으면** 위반이다. 가입하면 Play 결제와 **나란히** 둘 수 있다(수수료 4%p 감액 — answer/112622). 선택지 ① 앱 안에서 토스를 막는다 ② 프로그램에 가입하고 나란히 둔다. 프로그램 약관은 읽지 않았다 ⚪. 어느 쪽이든 `SALES_OPEN` 을 열기 전에 정한다 | 개발 · PD |
| P2 | **유료→무료 전환 규칙** | 앱 | 🟡 (결정 시점) | "Once your app has been offered for free, the app can't be changed to paid." 반대(유료→무료)는 된다 — https://support.google.com/googleplay/android-developer/answer/6334373 | (A)를 조금이라도 고려하면 **Console 에서 앱을 만들기 전에** 결정한다. 언제 잠기는지(앱 생성 시 vs 첫 트랙 게시)는 ⚪. 패키지명은 영구다 | PD |
| P3 | **Play 정부 정보 고지** | 앱 · (새 탭은 CWS 일반 사칭 조항) | 🟡 (지금 빠져 있음) | 정부 정보 앱은 설명에 출처를 넣고 "the app doesn't represent a government or political entity"임을 밝힌다 — https://support.google.com/googleplay/android-developer/answer/9514050 · 정부 제휴 거짓 주장 금지 — https://support.google.com/googleplay/android-developer/answer/9888077 · CWS 사칭 조항 — https://developer.chrome.com/docs/webstore/program-policies/policies | `docs/APP-STORE-LISTING-DRAFT-2026-09-24.md` §1-6 의 "정부 앱 — 해당 없음"을 고친다. 설명 끝에 **"정부나 정치 단체를 대표하지 않는다"** 는 문장과 기상청·JMA·NOAA URL 을 넣는다(ko·en 문안은 `r-play.md` §5-2, 표현은 정책 원문에 맞춘다). 앱 안 출처 화면과 CWS 설명에도 같은 줄을 넣는다 | PD · 개발 |
| P4 | **Play 구독·이용권 정책** | 앱 | 🟡 | 조건·가격·갱신 여부 공개, 앱 안에서 쉬운 온라인 해지 수단 — https://support.google.com/googleplay/android-developer/answer/9900533 · 구매 확인은 3일 안, 아니면 자동 환불 — https://developer.android.com/google/play/billing/integrate | 결제 전 확인 화면에 조건을 표시한다. 구매 확인(acknowledge)은 서버에서 3일 안에 한다. 지금 `twa-manifest.json` 의 `_todo_phase2_playBilling` — Play 결제는 **아직 미탑재**다. Bubblewrap `playBilling` 현행 설정법은 ⚪(TWA 결제 문서는 2021) | 개발 |
| P5 | **Play 수수료·지급** | 앱 | 🟢 | 지금 첫 US$1M 15%, 구독 15% — https://support.google.com/googleplay/android-developer/answer/112622 · 2026-12-31부터 한국 새 체계(신규 설치 기준) "10% + billing fee, if applicable" — https://support.google.com/googleplay/android-developer/answer/16954621 | 방식 선택에 영향 없다. 한국 청구 수수료율은 **아직 발표되지 않았다**(추후 공지). 대체결제 감액이 새 체계에서도 유지되는지 ⚪. 지급 통화(KRW/USD)는 결제 프로필에서 확인 ⚪ | PD |
| P6 | **크롬 웹 스토어 유료화** | 새 탭 | 🟡 (무료 권장) | CWS 결제는 2021-02-01 종료(공식 사이트 URL 은 404, GitHub 원본으로 확인) — https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/webstore/cws-payments-deprecation/index.md · "You must clearly identify that you, not Google, are the seller" — https://developer.chrome.com/docs/webstore/program-policies/policies | 무료로 둔다. 유료로 하려면 토스 결제와 라이선스 서버를 새로 만들어야 하고, 거래자 공개 정보도 필요하다 | PD |

### 1-3. 세금

| # | 이슈 | 대상 | 판정 | 근거 | 해야 할 일 | 담당 |
|---|---|---|---|---|---|---|
| T1 | **부가세 — Play 한국 판매** | 앱 | 🟡 (막지 않음) | 한국 개발자는 한국 구매자분 VAT 를 "determining, charging, and remitting" 한다 — https://support.google.com/googleplay/android-developer/answer/138000 · 개발자 배포 계약 §3.4: Google 이 등록 판매자(대리인)가 되는 것은 **목록에 오른 국가뿐**이고, 목록(answer/7645364)에 **한국은 없다** → 한국 구매자에게는 **개발자가 직접 등록 판매자** — https://play.google/developer-distribution-agreement.html · https://support.google.com/googleplay/android-developer/answer/7645364 | PD 가 신고한다. 과세표준(결제액 × 100/110, 수수료 차감 전)과 공급시기는 세무사가 확인한다. 장부를 Play 한국 / Play 해외 / 웹 토스로 나눈다 | PD · 세무사 |
| T2 | **Google 수수료 부가세** | 앱 | 🟡 (첫 판매 전) | 사업자번호를 넣지 않으면 서비스 수수료에 VAT 10%가 붙는다(answer/138000 한국 항목). 부가가치세법 제53조의2 제1항: 국외사업자의 전자적 용역 중 등록사업자 과세사업 공급분은 제외 — 법령(276117, 시행 2026-01-02) | 결제 프로필 '대한민국 세금 정보'에 **첫 판매 전** 사업자등록번호를 넣는다. 늦게 넣으면 돌려받을 수 있는지 ⚪ | PD |
| T3 | **해외 판매 영세율** | 앱 | ⚪ | 제22조(국외공급)와 제24조+시행령 제33조(외화획득) 중 무엇이 적용되는지 확인하지 못했다. 시행령 제33조와 예규 원문은 읽지 못했다 | 처음에는 **한국만 판매**하면 이 절차가 생기지 않는다. 해외 판매는 세무사와 서류를 정한 뒤 연다 | PD · 세무사 |
| T4 | **과세유형·업종코드·현금영수증** | 전체 | 🟡 (기준 확인됨) / ⚪ (업종코드·현금영수증) | 간이과세 기준 1억 400만원(법 제61조 → 시행령 제109조 제1항 — 법령 283641), 간이 납부면제 4,800만원 미만(법 제69조) 확인. 업종코드 722000/724000 은 제3자 자료 ⚪. 현금영수증 의무 여부 ⚪ — https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2470&cntntsId=7795 | 사업자등록증의 과세유형과 업종을 확인하고, 필요하면 정정신고한다. W-8BEN 을 낸다 — https://support.google.com/googleplay/android-developer/answer/7161649 | PD · 세무사 |

### 1-4. 자료·영상·API (문제 있는 것만. 🟢 은 D18 한 줄로 묶음)

| # | 원천 | 대상 | 판정 | 근거 | 해야 할 일 | 담당 |
|---|---|---|---|---|---|---|
| D1 | **Open-Meteo 무료 API** | v2(Lambda 격자 12개 + **브라우저 직접 호출**: `v2-three/js/route.js:336`, `engine-bridge.js`, `field-layer.js`, `main.js`, `point-readout.js`, `ext-scene.js`) · v1(브라우저 직접 호출 파일 12개, 날씨 시트 10일 예보 포함) · 앱 | 🔴 | 무료 API 는 비상업 전용. 상업 예시: "Operating websites or apps that have subscriptions or display advertisements." — https://open-meteo.com/en/terms · https://open-meteo.com/en/pricing | 유료 키로 바꾸거나, 대량 격자를 NOAA GFS·ECMWF Open Data(상업 OK, 수집기 있음)로 옮긴다. R0 감사(`docs/R0-OPEN-METEO-AUDIT-2026-09-20.md:61`)는 월 약 860만 호출이면 **Enterprise 등급**이라고 적었다. Lambda 12개: air-ea·air-grid·air-state·atmos-transport-spike·cyclone-analog·fx-grid·kma-verify·lab-events·marine-ea·marine-grid·pressure-grid·wind-grid. 같은 도메인의 무료 v1 도 해당하는지는 Open-Meteo 에 서면 문의 ⚪ | PD · 개발 |
| D2 | **Esri World Imagery · Dark Gray · Boundaries** | v2(확대 위성·지역 지형) · v1(관광 지도·국경 지명) · 앱 | 🔴 | E300(2025-11-13판) 각주 89: 수익 창출 부가가치 앱은 "required to use Authentication" — https://www.esri.com/content/dam/esrisites/en-us/media/legal/product-specific-terms-of-use/e300.pdf · "Powered by Esri"와 자료 제공자 표기 둘 다 필요 — https://developers.arcgis.com/documentation/mapping-and-location-services/faq/ | 우리 코드는 옛 주소를 **키 없이** 부른다(`v2-three/js/main.js:1075,1227`, `local-terrain.js:8`, `js/layers/tourism-map-style.js:10`, `js/readability.js:21,577`). ArcGIS Location Platform 키로 전환하거나, v1 참조지도를 Natural Earth 로 바꾼다. E300 이 옛 주소(`server/services.arcgisonline.com`)에도 그대로 적용되는지, 옛 주소 무인증 사용을 직접 금지하는 조문이 있는지는 ⚪. 표기 "Maxar"→"Vantor" 갱신(World Imagery 항목 `accessInformation`) | PD · 개발 |
| D3 | **OSM Overpass 공용 서버** | v1(여행 '명소') · 앱 | 🔴 (실무상 차단 위험) | OSM 위키(커뮤니티 운영 권고): "Commercial use should use self-hosted or paid Overpass servers." — https://wiki.openstreetmap.org/wiki/Overpass_API · 운영자 문서(사용량 규칙 — 상업 금지 문장은 없고, 앱 이용자 요청을 합산하며 정기 사용은 소량을 권한다) — https://dev.overpass-api.de/overpass-doc/en/preface/commons.html | 하루 1회 Lambda 로 뽑아 S3 정적 파일로 바꾼다(`js/layers/travel.js:58`). "© OpenStreetMap contributors" 표기 유지 | 개발 |
| D4 | **Gemini API — 18세 조항** | v1 · v2 "물어보기" · 앱 | 🔴 (포섭은 변호사) | 약관: API 를 18세 미만에게 "directed towards or is likely to be accessed by" 서비스에 쓰지 않는다. 우리 가입 기준은 만 14세 이상 — https://ai.google.dev/gemini-api/terms | 셋 중 하나: 성인 확인 계정에만 열기 / 약관이 다른 LLM 경로(예: Vertex AI — 적용 여부 ⚪) / 가입 연령 상향. 변호사 확인 | PD · 전문가 |
| D5 | **Gemini API — 유료 등급** | 같음 | 🟡 | 무료 등급은 입력·출력을 제품 개선에 쓰고 사람이 검토할 수 있다. EEA·스위스·영국은 **무료로 써도 유료 서비스의 데이터 조항이 적용된다**(유료만 허용이 아니다) — 같은 URL | 키가 묶인 Google Cloud 프로젝트에 결제가 켜져 있는지 콘솔에서 확인한다(비밀값은 채팅에 붙이지 않는다) | PD |
| D6 | **스미소니언 GVP(화산)** | v1 · v2 재해 — **GVP 주간 보고 RSS 제목·링크**(`aws/regional-hazards/handler.py:211`, `prototype/js/official.js:88,93`) · 앱 | 🔴 (저장소 기록) / ⚪ (공식 재확인) | 저장소 기록(`data-license.ko.md:97,130-135`, `billing.js:387-393`): 상업 이용에 사전 서면 허가 필요. 공식 페이지 https://volcano.si.edu/gvp_termsofuse.cfm 은 오늘 403. `aws/catalog/build_catalog.py:315` 의 GVP WFS 는 카탈로그 정의일 뿐 수집 코드가 아니다 | 가장 싼 길은 **주간 보고를 유료 앱에서 빼기**. 또는 허가 요청, 또는 원천 교체(예: GeoNet — 라이선스 ⚪) | PD |
| D7 | **YouTube 임베드** | v1(실시간 영상) · 앱 | (A) 🟡 · (B) 🟡 | 금지 III.F.3: "must not charge users to watch content in an embedded YouTube player" · 허용 III.G.2: "Selling an API Client" — https://developers.google.com/youtube/terms/developer-policies | 앱 판매 자체는 허용이다. 설치비를 '시청료'로 볼지는 ⚪(변호사). 안전한 선택: (A)라면 외부 링크로 바꾼다. (B)라면 결제 뒤에 두지 않는다 | 개발 |
| D8 | **기상청 API허브 자료 · EARTHUS 공개 날씨 API** | v1 · v2 · 앱 · 새 탭(특보·관측·지진 줄) · **제3자(공개 API)** | ⚪ | API허브 이용안내: 공공누리 유형별 조건을 따른다고만 적고 유형 번호가 없다 — https://apihub.kma.go.kr/apiInfo.do · 약관 제13조: 승인 없는 지식재산 이용 금지, 이용권 "양도, 판매, 담보제공 등의 처분행위" 금지. 제11조: 허용량을 늘리려 여러 아이디로 호출 금지 — https://apihub.kma.go.kr/policy.do · 기상자료개방포털: 수익이 있으면 "협의를 하거나 허락을 득하여야" — https://data.kma.go.kr/cmmn/static/staticPage.do?page=copyright · 기상청 누리집 저작권 정책(공공누리 제1유형)은 기상청이 저작권 전부를 가진 **누리집 저작물**에 관한 것이고, API 자료에 그대로 적용되는지 ⚪ — https://www.kma.go.kr/kma/guide/copyright.jsp | 기상청에 **서면으로** "유료 구독 서비스 화면에 출처와 함께 표시해도 되는가"를 묻는다. 회신 전에는 판매를 열지 않는다. **공개 날씨 API**(`aws/public-weather-api/handler.py:1-25`, `prototype/developers.html:36,69`)는 기상청 관측·동네예보 캐시를 키로 제3자에게 내준다 — §13·포털 조건과 부딪칠 수 있고(추론 ⚪), 동네예보를 넘기는 것의 기상법상 성격도 ⚪. 같이 묻는다. API허브 제11조와 앱별 키 분리 계획을 대조한다 | PD |
| D9 | **에어코리아** | v2 대기질 · v1 · 앱 | 🟡 | "공공저작물 : 출처표시, 변경금지"(제3유형) — https://www.data.go.kr/data/15073861/openapi.do | 측정소 값을 그대로 보여 주는 것은 괜찮아 보인다. 보간·지수 환산 화면이 '변경'인지 ⚪. `data-license.ko.md` §5 에 에어코리아를 추가한다 | 개발 |
| D10 | **GDACS** | v2 태풍·재해 · 앱 | ⚪ | 공식 이용조건 PDF 에 CC BY 4.0 문장이 없다. 같은 PDF 제4항: "not meant to substitute nor to override any official information" — https://www.gdacs.org/Documents/2025/GDACS_Terms_of_use_Oct_25.pdf | `data-license.ko.md` §5 의 CC BY 4.0 표기를 근거 없이 유지하지 않는다. JRC 에 문의한다. 화면 면책 문구는 PDF 제4항을 근거로 둔다 | PD |
| D11 | **CelesTrak · MyMemory** | v1 위성 궤도 · 커뮤니티 번역 · 앱 | ⚪ | CelesTrak 이용 정책은 다운로드 주기만 다루고 상업·재배포 언급이 없다 — https://celestrak.org/usage-policy.php · MyMemory 는 서비스를 "그대로 재판매"하는 것을 금지하고 제출 문장을 저장한다(초안 기준, 이번 재확인 안 함) — https://mymemory.translated.net/terms-and-conditions | 서면 확인하거나 교체한다. CelesTrak 브라우저 폴백(`config.js:92`)은 끈다. MyMemory 는 처리방침 국외이전에 넣는다 | PD · 개발 |
| D12 | **지역 뉴스 RSS 11개 매체** (새로 찾음) | v1(`newsbubble.js`·`ui-events.js`·`ui-cyclone.js`) · v2(`live-layers.js:713`) · 앱 — 유료와 무관하게 운영 중(`aws/health/handler.py:208`) | RNZ 🔴 · ABC ⚪ · 나머지 ⚪ | 수집: `aws/regional-news/handler.py:46-60`(제목·링크·시각). RNZ 공식: "These feeds are for personal use only." — https://www.rnz.co.nz/rss (같은 페이지는 허락 없는 웹 게시도 막는다. 제목 게시가 여기에 드는지 ⚪). ABC(호주) 약관 페이지 403 — https://help.abc.net.au/hc/en-us/articles/360001548096-ABC-Terms-of-Use. 나머지(allAfrica·Africanews·Al Jazeera·Agência Brasil·MercoPress·Antara·VnExpress·Bangkok Post, RNZ Pacific 은 RNZ 와 같음) 약관은 읽지 않았다. Agência Brasil "CC BY 3.0 BR" 은 저장소 주장뿐 | 유료 앱 전에 RNZ 를 빼거나 허락을 받는다. 나머지는 매체별 약관을 확인한다. 가장 쉬운 길은 공식 기관 원천만 남기는 것(PD 결정) | PD · 개발 |
| D13 | **국립생태원 에코뱅크** (새로 찾음) | v1(`js/ui-ecobird.js:20-26`) · v2(`v2-three/js/ext/hobby-ecobird.js:15`) · 앱 | 🔴 (저장소 기록) / ⚪ (공식 미확인) | 저장소 기록 `docs/MONETIZATION-PRIORITY-2026-08-05.md:16,97-110`, `billing.js:164-166` 주석: 제1유형이지만 제3자 권리 포함, 서면 확인 전 유료·내보내기 보류. 공식 조건 https://www.nie-ecobank.kr/cmmn/intro/copyrightPolicy.do 는 오늘 읽지 않았다 | 서면 확인을 받거나 유료 앱에서 뺀다. `billing.js` 판매 스위치에 추가한다 | PD |
| D14 | **Anthropic API(news-brief)** (새로 찾음) | v1(`js/brief.js`·`ui-brief.js`) · 앱 | ⚪ | `aws/news-brief/handler.py` 가 웹 검색 뒤 뉴스 브리핑을 **새 문장으로 써서** `events/briefs.json` 에 둔다. `aws/health`·`aws/schedules.sh` 에 없어 **운영 중인지 ⚪**. 기사 사실을 AI 가 다시 쓰는 저작권 회색 지대(handler 주석이 스스로 인정), Anthropic 상업 약관·이용 정책의 요구 사항은 읽지 않았다 ⚪ | 운영 여부부터 확인한다. 유료 앱에 넣을 거면 상업 약관을 확인한다 | 개발 · PD |
| D15 | **JMA(태풍 예보 진로·경보·AMeDAS·낙뢰·도쿄 VAAC·지진)** 와 **일본 기상업무법** | v1 · v2 · 앱 · 새 탭(지진 폴백) · (일본 판매 시) | 관측 🟢 / 예보·경보 재전달 ⚪ / 일본 판매 ⚪ | JMA 이용규약은 공공데이터 이용규약 1.0 + 출처 표기이나, 같은 페이지가 개별 법령 제약이 있을 수 있다며 기상업무법 제17조(예보 허가)·제23조(경보)를 가리킨다 — https://www.jma.go.jp/jma/kishou/info/coment.html · 예보업무 허가는 "所在が国内か国外かに関わらず、許可が必要です"(2026-05-29 개정 안내) — https://www.jma.go.jp/jma/kishou/minkan/kyoka.html. 저장소: `aws/typhoon-official/handler.py:94`, `aws/jma-warn`, `aws/jma-amedas/handler.py:38`, `aws/lightning/handler.py:41`, `aws/tokyo-vaac`, `aws/quake-asia/handler.py:138` | 처음에는 일본에 팔지 않거나 일본 지역 예보를 가린다. JMA 예보·경보 재전달은 한국 기상법 쟁점(L2)과 함께 변호사에게 묻는다 | PD |
| D16 | **출처 표기 보강** | v2 · 앱 | 🟡 | AWS Terrain Tiles 원천 목록 — https://github.com/tilezen/joerd/blob/master/docs/attribution.md · ECMWF(CC BY) · Copernicus 문구 · NASA GIBS · SIMBAD · GEBCO(항해용 금지) · ESO 은하수 파노라마(CC BY 4.0, 코드가 이미 표시) | '정보·라이선스' 화면에 권장 문구를 그대로 싣는다(`r-data-maps.md` §4, `r-data-weather.md` 표 1) | 개발 |
| D17 | **기타 확인 필요 원천** (판정 없음 ≠ 문제 없음) | 각각 | ⚪ | 아래 '1-4-부록' 표. 초안 목록: Himawari(NASA GIBS 경유, JMA 조건 적용 여부) · KHOA 이안류 등 · 산림청 산불위험예보 · OBIS · Argo · Met Office · EUMETSAT ASCAT · EMSC·BMKG·INMET · SSEC RealEarth 폴백 · GEBCO 해저지명 호스팅 · BigDataCloud(원문 429) · adsb.lol 향후 키 · `r-data-maps.md` §2-26 의 미판정 호스트 | 판매 전에 목록을 하나씩 닫는다. **data.go.kr 이용허락은 데이터셋 단위**다(에어코리아가 제3유형이었다) → 18개 서비스의 유형 번호를 하나씩 기록하고, 제3·4유형이면 가공 화면을 점검한다 | 개발 · PD |
| D18 | 🟢 **문제 없음(출처 표기 조건)** | — | 🟢 | ECMWF Open Data(오늘 재확인: "redistributed and used commercially, subject to appropriate attribution" — https://www.ecmwf.int/en/forecasts/datasets/open-data). 아래는 **초안 판정 그대로, 오늘 재확인하지 않음**: NOAA NWS·NHC·PTWC·GFS·GMGSI(https://www.weather.gov/disclaimer) · USGS · Copernicus 원천 · GEBCO 격자 · 서울 열린데이터 · KTO 15101972 · NASA(GIBS·사진, 보증 암시·로고 금지) · ESA/Webb·Hubble(크레딧 원문 그대로) · Natural Earth · Solar System Scope · Wikimedia(파일별) · Launch Library 2 · adsb.lol(ODbL) · CesiumJS·three.js·satellite.js(오픈소스 고지) · Supabase(Pro 이상 권장). 새로 더한 🟢 후보: NOAA PSL OISST·NCEI·NDBC·OSMC·NWPS · USGS 수문 · NASA FIRMS·SDO·JPL·GSFC 일식 · ESO eso0932a. **JMA 는 이 묶음에서 뺐다(D15)** | 표기만 지킨다. NASA 사진을 스토어 스크린샷·광고 소재로 쓰는 것은 ⚪. PTWC 는 자료 저작권은 🟢 이나 한국 지진관측법 쟁점(L4)이 따로 있다 | 개발 |

#### 1-4-부록. 저장소에서 새로 찾은 원천 (verify-data §C, 요약)

범례: "정의만" = 카탈로그·링크·설정에만 있고 운영 수집·표시 코드는 찾지 못함.

| 원천 | 저장소 위치 | 대상 | 판정 | 읽을 공식 조건 |
|---|---|---|---|---|
| NOAA tsunami.gov PTWC·NTWC | `aws/tsunami-intl/handler.py:41-43` | v1·v2·앱·**새 탭** | 자료 🟢 · 한국법 ⚪(L4) | https://www.weather.gov/disclaimer |
| BMKG · GeoNet · EMSC · INMET | `aws/regional-hazards/handler.py:78,100,118,143,185` | v1·v2·앱 | ⚪ (GeoNet CC BY 3.0 NZ 로 알려짐 ⚪) | 각 기관 조건 · https://www.geonet.org.nz/policy |
| NOAA PSL OISST · NCEI · NDBC · OSMC · NWPS · mapservices.weather.noaa.gov | `aws/marine-grid:50`, `aws/climatology/*`, `aws/gts-global:56`, `aws/ocean-solar:30-45`, `js/ui.js:1377-1469`, `aws/glacial-lake-us:38-41`, `aws/current-earth-snow-ice/index.mjs` | v1·v2·앱 | 🟢 후보(미국 정부 저작물) | NWS disclaimer · USGS 정책 |
| USGS 수문 | `aws/glacial-lake-us:38` | v2 | 🟢 후보 | https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits |
| NASA FIRMS · SDO · JPL SSD/Horizons · GSFC 일식 | `aws/wildfire:71`, `aws/ocean-solar:49`, `js/space/astronomy.js:8-10`, `aws/eclipse-path:47`, `js/sky.js:9-10` | v1·v2·앱 | 🟢 (일식: 출처 표기 조건 재사용 허가) | https://eclipse.gsfc.nasa.gov/SEpubs/5MCSE.html |
| ESO eso0932a | `js/sky-panorama.js:72` | v1·앱 | 🟢 (CC BY 4.0, 크레딧 표시 중) | https://www.eso.org/public/copyright/ |
| Met Office DataHub | `aws/metoffice-uk/handler.py` | v2 | ⚪ (무료 등급 상업 조건) | https://datahub.metoffice.gov.uk/pricing/site-specific |
| CWA(대만) | `aws/cwa-observations/handler.py` | v2 | ⚪ (연결 오류) | https://data.gov.tw/license |
| geodesy.unr.edu | `aws/crustal/handler.py:11-12` | v2 | ⚪ | 기관 조건 |
| World Bank API | `v2-three/js/live-layers.js:717,1302` | v2 | ⚪ (CC BY 4.0 으로 알려짐, 읽지 않음) | World Bank 이용약관 |
| OBIS · Argo(Ifremer) | `aws/obis-summary:28`, `aws/argo-floats:37` | v1·v2 | ⚪ (OBIS 는 데이터셋별) | 각 기관 조건 |
| NIBR · MAFRA 철새 | `aws/lab-events:851`(링크), `aws/migbird:43-45` | v2 | ⚪ | data.go.kr 데이터셋별 |
| 국내 공공데이터 18개 서비스 | B551011 관광공사 9개(EngService2 · KorWithService2 · WellnessTursmService · AreaTarDivService · TarRlteTarService1 · DataLabService · AreaTarDemDsService · TatsCnctrRateService · LocgoHubTarService1) · 1192136 국립해양조사원 4개(ripCurrent · dtRecent · waterlogged · changeClimateRising) · 1192000 MarEcosysRschSiteInfoService · MarEcosysRschSeaBirdInfoService · B553482 SeaTurtleRouteService · 1400377 forestPointV2 · B552584 ArpltnInforInqireSvc · MsrstnInfoInqireSvc | v1·v2 | 데이터셋별 ⚪ | data.go.kr 각 페이지 |
| GDELT 뉴스 | `js/ui-source.js:129`, `aws/gdelt-events` | v1·v2 | 자료 🟢(저장소 기록) · 기사 제목 원저작권 ⚪ | https://www.gdeltproject.org/about.html |
| SSEC RealEarth | `js/config.js:39` | v1 | ⚪ | SSEC 조건 |
| ERA5(GCS ARCO) · GPM IMERG · GHCN | `aws/catalog/build_catalog.py:353,376,396` | — | 정의만 | Copernicus 라이선스 · NASA |
| Movebank · OCEARCH | `js/config.js:118-119` | — | 정의만(호출 없음). 켜기 전 확인 | 각 조건 |
| NHK World · Skyscanner · Kiwi · safekorea · bousai · PHIVOLCS · INGV · MAGMA · 아이슬란드 기상청 | `ui-cyclone.js:213`, `flight.js:291,299`, `safety-actions.js:11-12`, `official.js:45-59` | v1 | 외부 링크만 = 자료 이용 아님. 항공권 링크에 제휴 파라미터가 붙으면 광고 표시 ⚪ | — |

### 1-5. 저장소 문서·코드가 사실과 다른 곳 (개정 대상 — 이번에 고치지 않았다)

| 파일 | 문제 | 할 일 |
|---|---|---|
| **AGENTS.md "v1 은 예보하지 않는다" ↔ v1 코드** | v1 날씨 시트가 Open-Meteo 10일 예보·강수확률(`weather-contract-v7.js:46,51`), "Open-Meteo 전지구 수치예보"(`ui-weather.js:367`), 시간별·내일 예보(`:623-646`)를 보여 주고, `index.html:188` 이 이 모듈을 미리 읽는다. 그 밖 `js/layers/phenomena.js:166,249`(7일 열돔), `js/fishing.js:43`(5일 조위), `js/narrative.js:229`, `js/beaches.js:221`(2일) | **PD 결정**: 원칙대로 v1 에서 모델 예보를 빼거나, 원칙을 고친다. 어느 쪽이든 L2 쟁점은 변호사에게 묻는다 |
| `prototype/legal/data-license.ko.md` §6 | "earthus 는 예보 기관이 아닙니다" — v2 제품 의도("v2 는 예보한다")와 v1 코드 모두와 모순 | v1·v2 로 나눠 개정한다 |
| `prototype/legal/data-license.ko.md` §5 · `:88` | GDACS "CC BY 4.0", 기상청 "공공누리 제1유형"을 오늘 공식 문서로 확인하지 못함. 에어코리아 누락 | 확인 뒤 고친다 |
| `prototype/js/weather-contract-v7.js:290` · `prototype/developers.html:69` | 기상청 자료에 `'공공누리 제1유형 (출처표시)'` 을 코드로 박아 둠 — 자료별 유형 미확정 ⚪ | 기상청 회신 뒤 data-license 와 한꺼번에 고친다 |
| `prototype/legal/README.md:24` 와 같은 절 | 위치정보 "2021년 개정 면제" → 실제는 개시 후 1개월 안 신고 유예(§9조의2 는 2018 신설). "위치를 저장하지 않고 실시간 처리만"도 틀림(`alert_spots` 저장) | 고친다 |
| `prototype/js/billing.js:387-393` | 판매 스위치가 Open-Meteo·GVP 둘만 본다 | 기상청 서면 확인 · 기상예보업 등록 · Esri 인증 · Gemini 연령/유료 등급 · 에코뱅크 · 지역 뉴스 RSS 스위치를 더한다 |
| `prototype/js/billing.js:169-175` | COMMERCIAL_PLAN 이 "상업적 재배포·재가공 허용 범위 협의"와 'API 접근'(= 공개 날씨 API 전제)을 판다. 제3자 원자료는 재허락 권한이 없다 | EARTHUS 가 계산한 자료로 한정한다(법무 확인). D8 과 묶는다 |
| `docs/APP-STORE-LISTING-DRAFT-2026-09-24.md` §1-6 | 정부 정보 고지 누락 | P3 대로 고친다 |
| `docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md:527` 등 | 새 탭을 "구름 사진 + 기상청 관측·특보 + 최근 지진"으로 요약하지만, 구름은 NOAA GMGSI, 지진은 기상청·JMA, **쓰나미 줄(PTWC)이 기본 켜짐** | 설명을 사실대로 고치고 L4 판단을 반영한다 |
| 처리방침 "국외 이전 없음" | Gemini 0건, Play 결제 붙으면 거짓 | L11 대로 고친다 |
| 약관 제9조 | 시험 사용 방법 없음 | L7 대로 고친다 |

---

## 2. 두 방식 비교 — (A) 설치 유료 앱 vs (B) 무료 앱 + v2 기간 이용권

| 기준 | (A) 설치할 때 결제 | (B) 무료 앱 + Play 결제 v2 이용권 |
|---|---|---|
| Play 정책 | 가능. 다만 Google 공식 문서가 PWA 에는 **권하지 않는다**("We do not recommend the paid app option for PWAs") | 가능. Google 이 PWA/TWA 에 권하는 방향 |
| PD 일정과의 관계 | "2027-01-01 까지 무료로 시험" 계획대로 먼저 무료로 내면 **`net.earthus.app` 은 (A)가 될 수 없다.** 새 패키지로 새 앱을 만들어야 한다 | 무료로 먼저 내고 나중에 결제를 붙이면 된다. 일정과 맞는다 |
| v1 무료 원칙 | 앱 하나에 v1+v2 를 담으므로 **v1 까지 돈을 받게 된다** — v1 이 무료 서비스라는 정의와 부딪친다 | v1 은 무료로 남는다. **다만 v1 날씨 시트의 모델 예보 쟁점(L2)은 무료여도 남는다** |
| 같은 내용이 웹에 무료 | 설치 뒤 브라우저에서 같은 화면을 무료로 보게 된다 → 환불·낮은 별점 위험(추정, 공식 통계 없음) | 해당 없음 |
| 유료 기능 보호 | 앱 설치 여부로만 갈린다. 웹은 열려 있으므로 결국 서버 등급 판정이 필요 → (B)와 같은 일을 하게 된다 | 서버 등급 판정(지시서 §3-5) |
| 청약철회 | 체험 수단이 없어 시행령 제21조의2 의 '정보 제공' 방식에만 기대야 한다 — 불리 | v2 FREE 를 '체험용'으로 명시하면 체험판 방식 충족 가능성(포섭 ⚪) |
| 정기결제 30일 동의 | 해당 없음 | 기간 이용권(선불형)이면 대체로 해당 없음. 자동 갱신이면 해당 |
| 앱 안 다른 결제(토스) | 해당 없음(설치비는 Play 결제만) | 한국 대체결제 프로그램에 가입하지 않으면 앱 안 토스 금지. 가입하면 Play 결제와 나란히 가능(P1) |
| 자료 라이선스 | v1 자료까지 모두 상업 이용. YouTube 임베드 🟡(시청료로 볼지 ⚪) | v2 자료가 직접 걸린다. Open-Meteo·Esri 는 "앱 단위"라 v1 도 걸릴 수 있다 ⚪ |
| 기상예보업 | 앱 전체가 유료 → v2 예보가 유료 상품의 일부 → 등록 대상 가능성 높음 | v2 유료 영역에 예보가 있으면 등록 대상 가능성 높음. 등록 전에는 유료 영역을 해석·관측·도구로 한정할 수 있다. 기준은 '사업'이라 무료 예보도 ⚪ |
| 수수료·부가세 | 차이 거의 없음 | 차이 거의 없음 |

**추천: (B) 무료 앱 + 앱 안 Play 결제 '선불형 기간 이용권'.** 이유는 다섯 가지다.
1. PD 가 이미 정한 일정(무료로 시험 → 2027-01-01 유료)은 (A)를 막는다. 무료로 한 번 낸 앱은 유료로 바꿀 수 없다.
2. v1 은 무료 서비스로 정의돼 있다. (A)는 v1 에도 값을 매긴다.
3. 현재 약관은 '자동 갱신 없는 기간 이용권'이다. Play 선불형이 그 모양 그대로이고("Prepaid plans don't auto-renew"), 가격 인상·전환 동의 문제가 대부분 사라진다.
4. 청약철회 제한에 필요한 '시험 사용'을 FREE 등급으로 채울 수 있다(포섭 ⚪).
5. Google 자신이 PWA 에 유료 앱 방식을 권하지 않는다.

크롬 새 탭 확장은 **무료**로 둔다. CWS 는 결제를 대신 받지 않는다. 예보 필드가 없으므로 기상예보업과도 무관하다. **다만 남는 조건이 셋이다.** 기상청 자료 조건(D8), 출처 표기(L3), 그리고 **지진 줄(JMA 폴백)·쓰나미 줄(PTWC)의 지진관측법 §16 쟁점(L4, ⚪)**.

---

## 3. 🔴 항목별 상세와 해결 경로

비용·기간 수치는 대부분 공식 출처로 확정하지 못했다. ⚪ 가 붙은 값은 견적이나 문의로 확인할 것.

### 3-1. L1 기상예보업 등록 (v2 유료의 관문)

- **무엇이 걸리나:** v2 의 GFS·ECMWF 5일 예보, Intelligence 확률(예: "51개 중 38개"). "미래의 기상상태를 예상하여 제공"에 해당할 가능성이 높다(포섭 ⚪).
  - 등록 기준은 **'사업'**이다(제2조 제4호). 유료면 사업으로 보기가 쉬워질 뿐, 무료라서 빠진다는 보장은 없다.
  - Intelligence '원인'(과거·현재 해석)은 예보가 아니다. 기상감정업은 "특정 수요자를 대상으로" 하는 사업이라 대중 앱은 그 '업'이 아닐 가능성 → 상대적으로 낮은 위험 ⚪.
  - Simulation(가정 시나리오)은 불명확하다 ⚪.
- **등록 요건**(별표 1 <개정 2026. 1. 2.> 원문 확인, 기상청 안내 https://www.kma.go.kr/kma/biz/biz_regist01.jsp)
  - 인력: **상근 기상예보사 1명 이상.** ("2명"이라는 요약은 틀렸다.)
  - **개인사업자 본인이 자격을 갖추면 인력에 포함된다**(비고 2의2).
  - 시설: 사무실, 컴퓨터 1대 이상.
  - 등록 뒤 등록면허세를 낸다.
  - 처리기간: 기상청 안내 "처리기한 5일"은 확인. 정부24 의 "5개월"은 이번에 열지 않았다 ⚪.
  - 기상예보사 면허(법 제18조 제1항): 기상 분야 기술사, 또는 기사 + 2년 이상 경력, 또는 기사 + 지정 교육과정.
- **길 셋(PD 결정)**
  - (가) 기상예보사(PD 본인 또는 상근 고용)로 등록하고 v2 를 유료로 판다. 등록해도 특보·항공기상예보·우주영향 예보(§14조의3①)는 여전히 할 수 없다.
  - (나) 등록 전까지 유료 영역을 해석·관측·데이터 도구·시뮬레이션(가정임을 명시)으로 한정한다. 예보·확률은 빼거나 무료로 둔다(무료 예보에도 과태료 위험이 남는다, L2).
  - (다) 등록된 국내 기상사업자와 제휴해 그 사업자의 예보를 출처와 함께 제공한다. 구조가 적법한지 ⚪.
- **비용·기간:** 사람을 새로 쓰면 상근 인건비가 주 비용이다(금액 ⚪). PD 본인이 자격자면 이 비용이 없다. PD 일정(12월 등록)은 이 1명을 전제로 한다.

### 3-2. L4 지진관측법 §16 (기상사업자 등록으로 풀리지 않음)

- 법 구조: 기상청장 외에는 발표할 수 없다(①). 시행령 제8조가 인공지진·학문연구를 뺀다. **그 밖의 자는 기상청장 승인을 받아야 한다(②) — 승인 경로는 있다.** 기상사업자 예외는 없다.
- 기상청 지진을 출처·시각과 함께 옮기는 것은 위험이 낮아 보이나 ⚪.
- **JMA 지진 재전달**(v1·v2 와 새 탭의 폴백, `feeds.js:375`)과 **PTWC 쓰나미 경보 재전달**(새 탭 쓰나미 줄 기본 켜짐, `feeds.js:28,414`, `aws/tsunami-intl`)은 불명확하다. 외국 기관의 관측 결과·경보를 한국 공중에 '발표'하는 것으로 볼 여지가 있다 ⚪.
- 쓰나미 도달시간 엔진(`aws/tsunami-eta`, SIMULATION_ONLY)을 **실제 사건에 대해** 보여 주거나 푸시하면 '지진해일 경보'와 구별이 어렵다 → 높은 위험.
- 유료 상업 상품은 '학문연구' 예외로 보기 어렵다. 유료화가 위험을 키운다.
- **해결 경로**
  - 실제 사건 도달시간은 표시·푸시하지 않는다. 가정 시나리오 화면에서만 보여 준다.
  - 기상청에 §16② 승인의 절차·서식·기준(시행령에 규정 없음 ⚪)과, 외국 기관 지진·**지진해일 경보** 재전달이 해당하는지 서면 질의한다.
  - 확인 전까지 새 탭 확장은 지진 줄을 기상청 항목만 두고 쓰나미 줄을 기본 끔으로 바꾸는 것을 검토한다(PD 결정).

### 3-3. L5 위치기반서비스사업 신고 (이미 운영 중인 기능)

- "＋ 지금 내 위치"(`ui-alerts.js:406-415`) = 기기 측위 좌표 + 계정을 Supabase `alert_spots` 에 저장한다(`push.js:176-179`) → 개인위치정보를 우리 시스템으로 전송한다. 위치정보지원센터 안내는 "시스템으로 전송하지 않는 경우"를 신고 제외로 둔다. 앱은 `locationDelegation` 으로 안드로이드 위치 권한을 웹에 넘긴다.
- **길 A — 신고**
  - PD 가 소상공인·1인 창조기업이면 제9조의2 신고(개시 후 1개월 안)를 한다.
  - 함께 할 일: 위치기반서비스 이용약관(제19조 항목), 위치 동의 흐름(지금 '위치(선택)' 동의는 실제로 아무것도 막지 않는다), 확인자료 자동 기록(제16조 제2항), 14세 미만 처리(제25조).
  - 이미 개시된 기능이라 1개월 기한을 넘겼을 수 있다 → 변호사에게 처리 방법을 묻는다.
  - 비용·기간 ⚪(방미통위 위치정보지원센터 안내 확인).
- **길 B — 기능 제거**
  - "지금 내 위치" 저장을 없애고 지도 중심 저장만 남긴다. 서버 저장 경로가 사라진다.
  - 앱을 열 때 브라우저가 BigDataCloud·Open-Meteo 로 좌표를 직접 보내는 흐름은 따로 판단이 필요하다 ⚪.

### 3-4. D1 Open-Meteo

- **대체 자료**
  - 대량 격자(기온·바람·강수·구름·기압)는 NOAA NOMADS GFS·ECMWF Open Data 로 옮긴다. 둘 다 상업 이용 OK(출처 표기)이고 수집기가 이미 있다.
  - 대기질 CAMS 를 직접 받으려면 ADS 계정과 라이선스 수락이 필요하다(PD 본인).
  - 파고는 GFS-Wave 0.25°가 JPEG2000 문제로 막혀 있다(작업 메모 기준 ⚪) → 해양은 대체가 가장 늦다.
  - **브라우저 직접 호출(v1 12개 파일 + v2 6개 파일)**도 모두 옮기거나 유료 키 경유로 바꿔야 한다.
- **유료 키**
  - R0 감사는 현재 호출량(월 약 860만, air-ea 축소 뒤 약 330만)을 **Enterprise 등급**으로 봤다. 금액 ⚪. Open-Meteo 블로그(2023)의 Standard·Professional 금액은 3년 전 글이라 참고만.
  - 다중 지점 요청을 몇 회로 세는지 ⚪ → 견적 문의.
- **자체 운영:** 오픈소스 서버를 직접 운영하는 길도 있다(비용 ⚪).
- 결정은 R0 의 D-OM1~5(PD 결정 대기)와 같다.

### 3-5. D2 Esri 타일

- **길 1:** ArcGIS Location Platform 에 가입해 API 키로 전환하고 "Powered by Esri"와 자료 제공자(Vantor 등)를 표기한다. 코드 변경이 가장 적다.
  - 가격: "월 200만 타일 무료, 이후 1,000장당 $0.15"는 검색 요약에서만 봤다 ⚪.
  - 가입은 PD 가 직접 한다.
- **길 2:** v1 국경·지명은 Natural Earth(공개 도메인)로 그린다. 확대 위성은 NASA GIBS 고해상 층으로 바꾼다(해상도가 낮다, 층별 확인 ⚪).
- 어느 쪽이든 Esri 타일을 받아 구워 S3 에 올리지 않는다.

### 3-6. D3 Overpass 공용 서버

- '명소' POI 를 하루 1회 Lambda 로 뽑아 S3 정적 파일로 둔다. 해변·낚시·등산로를 이미 이 방식으로 만들었다.
- OSM 자료 자체(ODbL)의 "© OpenStreetMap contributors" 표기는 유지한다.
- 비용은 Lambda·S3 소액이다. 기간은 개발 작업 하나.

### 3-7. D4 Gemini 18세 조항

- 조항은 개발자 나이가 아니라 **앱 이용자층**에 관한 것이다. 누구나 여는 지구 앱은 18세 미만이 접근할 가능성이 크다(포섭 ⚪).
- **길**
  - '물어보기'를 성인 확인 계정에만 연다.
  - 약관이 다른 LLM 경로로 옮긴다(Vertex AI 등 — 조항이 다른지 ⚪).
  - 가입 연령을 18세로 올린다.
- 어느 길이든 유료 등급 확인(D5)은 따로 필요하다. 변호사 확인이 필요하다.

### 3-8. D6 스미소니언 GVP

- 운영에서 쓰는 것은 **주간 화산 보고 RSS 제목·링크**뿐이다. 가장 싼 길은 유료 앱에서 이것을 빼는 것이다.
- 또는 서면 허가를 요청하거나(비용·기간 ⚪), 각국 기관 원자료로 바꾼다(예: GeoNet — 라이선스 ⚪).

### 3-9. D12 지역 뉴스 RSS (새로 찾음)

- RNZ 는 공식 페이지가 RSS 를 개인 용도로만 허락한다. 유료 여부와 관계없이 지금도 제목을 지구 위에 게시하고 있다.
- 길: RNZ(·RNZ Pacific)를 빼거나 허락을 받는다. 나머지 9곳은 매체별 약관을 읽고 정한다. 가장 쉬운 길은 공식 기관 원천만 남기는 것(PD 결정).

### 3-10. D13 국립생태원 에코뱅크 (새로 찾음)

- 저장소가 이미 "서면 확인 전 유료·내보내기 보류"로 정해 둔 원천이다. 판매 스위치에 넣지 않았을 뿐이다.
- 길: 국립생태원에 서면 확인을 받거나, 유료 앱에서 에코뱅크 화면을 뺀다.

---

## 4. 🟡 항목별 체크리스트

**지금 바로(판매와 무관, 이미 운영 중인 것)**
- [ ] "＋ 지금 내 위치" 서버 저장: 신고할지(길 A) 기능을 뺄지(길 B) 결정 (L5)
- [ ] RNZ 등 지역 뉴스 RSS 게시 조건 정리 (D12)
- [ ] v1 날씨 시트의 모델 예보: 원칙(무예보)과 코드 중 무엇을 고칠지 결정 (L2 · 1-5)
- [ ] 새 탭 쓰나미 줄 기본값·JMA 지진 폴백 재검토 (L4)

**앱 출시(무료, `SALES_OPEN=false` 유지) 전**
- [ ] Play 등록정보·앱 안 출처 화면·CWS 설명에 "정부나 정치 단체를 대표하지 않는다" 문장과 기상청·JMA·NOAA URL (P3)
- [ ] 약관·처리방침 자리표시자 3곳(주소·전화·신고번호) 채우기 (L6)
- [ ] Play 계정 정보에 사업자번호·통신판매 신고번호·신고 기관 (L6)
- [ ] 처리방침 국외이전 개정: Gemini·AWS 오하이오·Supabase 리전·알림 지점 좌표·MyMemory (L11)
- [ ] 기상청 자료 출처가 빠진 화면 점검 (L3)
- [ ] 자체 판단 경고·특보형 문구·푸시가 없는지 점검. 이안류는 기관 등급 그대로 (L2)
- [ ] 앱 안 토스 결제: 막을지, 한국 대체결제 프로그램에 가입해 Play 결제와 나란히 둘지 결정 (P1)
- [ ] **Console 에서 앱을 만들기 전에 (A)/(B) 최종 결정** (P2)
- [ ] Play 대상 연령 설정을 가입 기준(만 14세)·Gemini 조항과 맞추기 (D4)
- [ ] 출처 표기 보강: Terrarium 원천 목록, "Powered by Esri", Esri "Vantor", GEBCO·NASA GIBS·SIMBAD·Copernicus 문구 (D16)

**판매 개시(`SALES_OPEN=true`) 전**
- [ ] 기상예보업 등록(상근 기상예보사 1명 — PD 본인 자격 또는 고용) 또는 유료 영역에서 예보·확률 제외 (L1)
- [ ] 기상청 서면 회신: API허브 자료 유료 화면 표시, 공개 날씨 API 재제공 (D8)
- [ ] Open-Meteo·Esri·Overpass·Gemini(연령)·GVP·에코뱅크 해결 (§3)
- [ ] 결제 프로필 '대한민국 세금 정보'에 사업자등록번호 — **첫 판매 전** (T2)
- [ ] W-8BEN 제출, 과세유형·업종코드 확인, 세무사 상담 (T4)
- [ ] 판매 국가는 처음엔 한국만 (T3 · D15)
- [ ] 상품 형태를 Play **선불형 기간 이용권**으로(약관 유지). 자동 갱신이면 약관 제8조 전면 개정 + 30일 동의 절차 (L9)
- [ ] 약관 제9조에 시험 사용(FREE = 체험용) 명시, 미성년자 취소권 고지 (L7)
- [ ] 3~7일째 철회는 Console 환불로 처리하는 운영 절차, 환불 시 서버 권한 회수 (L8)
- [ ] 결제 UI 다크패턴 점검(총액 표시·기본 체크 없음·버튼 차별 없음·앱 안 해지·반복 요구 없음 또는 "당분간 보지 않기") (L10)
- [ ] Play 결제 탑재(`_todo_phase2_playBilling`), 구매 확인(acknowledge)을 서버에서 3일 안에. Bubblewrap Play 결제 현행 설정 재확인 (P4)
- [ ] Gemini 유료 등급 확인 (D5)
- [ ] 에어코리아 값을 가공하는 화면 점검 (D9)
- [ ] `billing.js` 판매 스위치 추가(기상청·예보업 등록·Esri·Gemini·에코뱅크·뉴스 RSS), COMMERCIAL_PLAN 문구 한정 (§1-5)
- [ ] ⚪ 원천(D8·D10·D11·D14·D15·D17, 1-4-부록) 하나씩 닫기. data.go.kr 18개 서비스 유형 번호 기록

---

## 5. 전문가 확인이 필요한 질문 (그대로 보낼 수 있는 문장)

### 5-1. 변호사 (기상·IT·소비자)
1. 외국 수치모델(GFS·ECMWF) 결과를 모델 이름·실행 시각과 함께 그대로 보여 주는 것이 기상법 제2조 제9호의 "예보"에 해당합니까? 유료로 제공하면 기상산업진흥법 제26조 제2항 제1호가 적용됩니까? **무료로 공개하는 지금의 v2 예보, 그리고 무료 v1 날씨 시트의 Open-Meteo 10일 예보·강수확률**에도 기상법 제17조·제51조가 적용됩니까? 기상예보업의 '사업' 여부는 유·무료와 어떤 관계입니까?
2. 앙상블 멤버 비율로 계산한 확률("51개 중 38개")을 보여 주는 것, 과거·현재 원인 해설, 가정 시나리오(Simulation)는 각각 예보·기상감정·기상컨설팅 중 무엇입니까? 기상예보업 등록이 이 셋을 모두 덮습니까?
3. JMA·NHC 태풍 공식 진로 인용, JMA 경보 재전달, NOAA SWPC 오로라 예보 재전달(기상법 제14조의3 제1항), 국립해양조사원 이안류 등급 재전달, 기상청 동네예보 재전달은 각각 어떤 성격입니까?
4. 기상청·JMA 지진 정보, NOAA PTWC 지진해일 경보를 출처와 함께 재전달하는 것(크롬 새 탭 포함), 쓰나미 도달시간을 가정 시나리오로 보여 주는 것은 지진관측법 제16조 제1항의 '발표'에 해당합니까? 해당한다면 제16조 제2항 승인으로 풀 수 있습니까?
5. 기기 측위 좌표를 계정과 함께 서버에 저장하는 알림 지점 기능은 위치기반서비스사업 신고 대상입니까? 이미 운영한 기간은 어떻게 처리합니까? 앱이 브라우저에서 제3자(BigDataCloud·Open-Meteo)로 좌표를 직접 보내는 것은 어떻습니까?
6. 약관 제9조를 "FREE 등급 = 체험용 디지털콘텐츠"로 고치면 전자상거래법 제17조 제6항 단서를 충족합니까? 기간 이용권은 가분적 디지털콘텐츠입니까? Play 48시간 환불과 법정 7일은 어떻게 맞춥니까?
7. 창립 멤버 "언제나 정가의 50%"(약관 제8조 제7항)는 Play 가격 인상 규칙(옵트인·기존 가격 유지), 자동 갱신 시 제13조 제6항과 충돌합니까?
8. Play 거래에서 PD 가 한국 구매자에게 직접 등록 판매자(개발자 배포 계약 §3.4, 한국은 Google 대리 판매 국가 목록에 없음)인 구조에서, Play 영수증 메일로 계약서면 교부 요건이 충족됩니까?
9. Gemini 로의 질문 문장 이전은 개인정보 보호법 제28조의8 제1항 제1호(동의)와 제3호(위탁·처리방침 공개) 중 무엇으로 해야 합니까?
10. Gemini 약관의 "18세 미만이 접근할 가능성이 큰 서비스" 조항이 만 14세 이상 가입 앱에 적용됩니까? 유료 등급·Vertex AI 에서도 같습니까?
11. Esri 옛 주소(server/services.arcgisonline.com)를 인증 없이 쓰는 것이 수익 앱에서 허용됩니까? MyMemory "그대로 재판매" 금지가 앱 안 기능에 해당합니까? NASA 사진을 스토어 스크린샷·광고에 써도 됩니까? 유료 앱에서 YouTube 임베드가 '시청료 부과'로 보일 수 있습니까?
12. `billing.js` COMMERCIAL_PLAN 의 "상업적 재배포·재가공 허용 범위 협의"·'API 접근' 문구는 제3자 원자료에 대해 문제가 됩니까?
13. 뉴스 매체 RSS 의 제목·링크를 지도 위에 게시하는 것(RNZ "personal use only" 등), AI 가 기사 사실을 새 문장으로 요약하는 뉴스 브리핑은 유료 앱에서 허용됩니까?
14. 일본 사용자에게 판매할 때 2026-05-29 개정 기상업무법의 영향은 무엇입니까? 해외 판매 시 EU 거래자(DSA) 신고가 필요합니까?
15. 한국 대체결제 프로그램에 가입해 앱 안에서 토스 결제를 Play 결제와 나란히 둘 때, 전자상거래법·약관상 추가로 필요한 표시가 있습니까?

### 5-2. 세무사
1. Play 한국 판매의 과세표준은 결제액 × 100/110(수수료 차감 전)이 맞습니까? 근거 예규는 무엇입니까?
2. Play 매출의 공급시기는 결제일·정산일·입금일 중 무엇입니까? 기간 이용권 선수금을 기간에 나눠 인식해야 합니까?
3. 해외 판매 영세율 근거는 부가가치세법 제22조와 제24조 + 시행령 제33조 중 무엇입니까? (DDA §3.4 상 일부 국가에서는 Google 이 등록 판매자, 그 밖에서는 개발자가 등록 판매자인 구조 전제) 첨부서류로 외화입금증명서가 필요합니까?
4. 사업자번호를 늦게 넣어 Google 이 수수료에 붙인 10%는 돌려받을 수 있습니까? Google 수수료의 필요경비 증빙은 해외 인보이스로 충분합니까?
5. 간이과세와 일반과세 중 어느 쪽이 유리합니까? 간이 배제 기준(시행령 제109조 제2항 제9호)에 걸립니까?
6. 업종코드는 722000 과 724000 중 무엇으로 합니까? 현금영수증 가맹 의무(별표 3의2)가 있습니까?
7. 외화 수입의 원화 환산 기준일은 언제입니까? 창업중소기업·중소기업 특별세액감면에 해당합니까?
8. 약관 제8조 제4항("부가세 포함 표시")을 해외 영세율 판매에도 그대로 둬도 됩니까?

### 5-3. 기상청 서면 질의 (기상산업정책 담당 · API허브 운영 · 지진화산 담당 · 예보정책과 02-2181-0496 — 법령 머리 표기)
1. API허브 자료를 유료 구독 서비스 화면에 출처와 함께 표시해도 됩니까? 기상자료개방포털의 "협의를 하거나 허락을 득하여야" 문구, API허브 약관 제13조와의 관계를 알려 주십시오. 자료별 공공누리 유형 번호도 알려 주십시오. **캐시한 관측·동네예보를 키 발급형 공개 API 로 제3자에게 다시 제공해도 됩니까?**
2. 개인사업자 대표 본인이 기상예보사인 경우 기상예보업 등록 절차와 처리기간을 알려 주십시오(별표 1 비고 2의2 적용).
3. 외국 수치모델 결과를 모델 이름과 함께 보여 주는 것이 등록 대상 '기상예보'입니까? 무료로 제공해도 등록 대상 '사업'입니까?
4. 지진관측법 제16조 제2항 승인의 절차·서식·기준을 알려 주십시오. 외국 기관(JMA) 지진 정보와 NOAA PTWC **지진해일 경보**를 출처와 함께 재전달하는 것이 승인 대상입니까?

### 5-4. 기타 기관 문의
- **방미통위 위치정보지원센터:** 알림 지점 저장의 신고 대상 여부와 늦은 신고 절차
- **과기정통부·중앙전파관리소:** 개인사업자의 부가통신 '자본금 1억원 이하' 판정 방식
- **Open-Meteo:** 다중 지점 요청 과금 단위, 같은 도메인 무료 서비스(v1)의 상업 플랜 필요 여부, 현재 호출량(월 약 330만~860만) 견적
- **Esri:** 옛 주소 무인증 사용의 상업 조건, Location Platform 가격
- **스미소니언 GVP:** 유료 앱 안 **주간 화산 보고 RSS** 제목·링크 표시 허가
- **EC JRC(GDACS):** 이벤트 API 라이선스 근거 문서
- **CelesTrak · MyMemory:** 유료 앱 안 사용의 서면 확인
- **국립생태원(에코뱅크):** 유료 앱 안 조류 조사 기록 표시 허가(제3자 권리 범위)
- **RNZ · ABC 및 뉴스 매체 9곳:** RSS 제목·링크를 유료 앱 지도 위에 게시하는 것의 허락

### 5-5. PD 가 직접 확인할 것
- **PD 본인이 기상예보사 자격(기술사, 기사+2년 경력, 기사+지정 교육과정)을 갖췄거나 12월까지 갖출 수 있는가.** 아니라면 상근 1명을 고용할 수 있는가 — 유료 2027-01-01 일정이 여기에 달려 있다
- v1 에서 모델 예보를 뺄지, 원칙을 고칠지
- Play Console 에서 앱을 만들기 전에 (A)/(B) 결정
- 한국 대체결제 프로그램 가입 여부(앱 안 토스)
- 결제 프로필의 지급 통화(KRW/USD)·지급 법인, 계정 유형(개인/조직)
- 사업자등록증의 과세유형·업종코드·개업일
- Gemini 키가 묶인 프로젝트의 결제 활성 여부
- `news-brief`(Anthropic) 가 운영 중인지
- 해외·일본 판매를 첫날부터 열지
- 2026-12-31 전에 Google 의 한국 새 수수료 체계(청구 수수료율 — 아직 미발표·대체결제 감액) 공지 재확인

---

## 6. 출처 목록 (모두 2026-09-24 읽음)

**법령 — 국가법령정보센터 현행** (각 lsiSeq·시행일은 `law.go.kr/법령/<법령명>` 으로 현행임을 재확인)
- 기상법 [시행 2026-09-18] https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=284327&efYd=20260918 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=289709&efYd=20260918
  - `r-data-weather.md` 가 쓴 2025-09-26 PDF 판은 이 현행판으로 대체한다.
- 기상산업진흥법 [시행 2026-03-26] https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=270217&efYd=20260326 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=284593&efYd=20260326 · **시행령 별표 1 <개정 2026. 1. 2.>** https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=162468921&bylClsCd=110201
- 지진·지진해일·화산의 관측 및 경보에 관한 법률 [시행 2026-02-01] https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=268815&efYd=20260201 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=281745&efYd=20260102
- 위치정보법 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=277359&efYd=20251001 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=283269&efYd=20260210
- 전자상거래법 [시행 2026-07-21] https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=282793&efYd=20260721 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=288143&efYd=20260721
- 콘텐츠산업 진흥법 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=268753&efYd=20260201
- 개인정보 보호법 [시행 2026-09-11] https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=283839&efYd=20260911
- 전기통신사업법 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=286079&efYd=20260519 · 시행령 https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=285721&efYd=20260428
- 부가가치세법 [시행 2026-01-02] (lsiSeq 276117) · 시행령 [시행 2026-04-01] (lsiSeq 283641) · 소득세법 시행령 — https://www.law.go.kr/법령/부가가치세법 · https://www.law.go.kr/법령/부가가치세법시행령 · https://www.law.go.kr/법령/소득세법시행령

**정부 기관 안내**
- 기상청 기상사업자 제도 https://www.kma.go.kr/kma/biz/biz_intro01.jsp · 등록 안내 https://www.kma.go.kr/kma/biz/biz_regist01.jsp · 저작권 정책 https://www.kma.go.kr/kma/guide/copyright.jsp
- 정책브리핑 기상사업 등록기준 정비(2025-12-16) https://www.korea.kr/multi/visualNewsView.do?newsId=148956552 — 별표 1 개정본(2026-01-02)으로 반영 확인
- 정부24 기상사업 등록 https://www.gov.kr/mw/AA020InfoCappView.do?HighCtgCD=A02004&CappBizCD=13600000003&tp_seq=01 (최종 검증에서 다시 열지 않음)
- 공공누리 https://www.kogl.or.kr/info/license.do
- 위치정보지원센터 https://www.lbsc.kr/front/content/contentViewer.do?contentId=CONTENT_0000081
- 국세청 현금영수증 https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2470&cntntsId=7795
- 기상청 API허브 https://apihub.kma.go.kr/apiInfo.do · 약관 https://apihub.kma.go.kr/policy.do · 기상자료개방포털 저작권 https://data.kma.go.kr/cmmn/static/staticPage.do?page=copyright
- 공공데이터포털 이용정책 https://www.data.go.kr/ugs/selectPortalPolicyView.do · 에어코리아 https://www.data.go.kr/data/15073861/openapi.do · KHOA https://www.data.go.kr/data/15155516/openapi.do · KTO https://www.data.go.kr/data/15101972/openapi.do · 서울 https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do
- 국립생태원 에코뱅크 저작권 정책 https://www.nie-ecobank.kr/cmmn/intro/copyrightPolicy.do (읽지 않음 — 문의용)

**Google Play · Chrome**
- 가격(무료↔유료) https://support.google.com/googleplay/android-developer/answer/6334373
- 판매자 등록 국가 https://support.google.com/googleplay/android-developer/answer/9306917 · Google 대리 판매 국가 목록 https://support.google.com/googleplay/android-developer/answer/7645364 · 지급 https://support.google.com/googleplay/android-developer/answer/137997
- 한국 개발자 추가 정보 https://support.google.com/googleplay/android-developer/answer/3255733?hl=ko
- 세율·부가세 https://support.google.com/googleplay/android-developer/answer/138000 (ko·en) · 세금 의무 https://support.google.com/googleplay/android-developer/answer/16408159 · W-8BEN https://support.google.com/googleplay/android-developer/answer/7161649 · 원천징수 https://support.google.com/googleplay/android-developer/answer/9384608?hl=ko · https://support.google.com/paymentscenter/answer/10349995
- 수수료 https://support.google.com/googleplay/android-developer/answer/112622 · 새 체계 https://support.google.com/googleplay/android-developer/answer/16954621
- 환불(사용자) https://support.google.com/googleplay/answer/15574908 · 주문 관리(개발자) https://support.google.com/googleplay/android-developer/answer/2741495
- 개발자 배포 계약 https://play.google/developer-distribution-agreement.html · Play 서비스 약관(한국) https://play.google.com/intl/ALL_kr/about/play-terms/
- 스팸·최소 기능 https://support.google.com/googleplay/android-developer/answer/9899034 · 기만 행위 https://support.google.com/googleplay/android-developer/answer/9888077 · 정부 정보 앱 https://support.google.com/googleplay/android-developer/answer/9514050
- 결제 정책 https://support.google.com/googleplay/android-developer/answer/9858738 · 해설 https://support.google.com/googleplay/android-developer/answer/10281818 · 앱 안 상품 https://support.google.com/googleplay/android-developer/answer/1153481 · 구독 정책 https://support.google.com/googleplay/android-developer/answer/9900533
- Play Billing 통합(구매 확인 3일) https://developer.android.com/google/play/billing/integrate · 가격 변경 https://developer.android.com/google/play/billing/price-changes · 구독 수명주기 https://developer.android.com/google/play/billing/lifecycle/subscriptions
- PWA in Play https://developers.google.com/chromeos/app-development/publish/pwa-in-play · TWA Play 결제 https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing (문서 2021)
- CWS 결제 종료 https://github.com/GoogleChrome/developer.chrome.com/blob/main/site/en/docs/webstore/cws-payments-deprecation/index.md · CWS 정책 https://developer.chrome.com/docs/webstore/program-policies/policies

**자료·서비스 약관**
- Open-Meteo https://open-meteo.com/en/terms · https://open-meteo.com/en/pricing · 블로그(2023, 금액 참고만) https://openmeteo.substack.com/p/api-subscriptions-for-commercial
- NWS https://www.weather.gov/disclaimer · USGS https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits · NASA Earthdata https://earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance · NASA 미디어 https://www.nasa.gov/nasa-brand-center/images-and-media/ · GIBS https://nasa-gibs.github.io/gibs-api-docs/ · GSFC 일식 https://eclipse.gsfc.nasa.gov/SEpubs/5MCSE.html
- ECMWF https://www.ecmwf.int/en/forecasts/datasets/open-data · Copernicus https://apps.ecmwf.int/datasets/licences/copernicus/
- JMA https://www.jma.go.jp/jma/kishou/info/coment.html · 予報業務許可 https://www.jma.go.jp/jma/kishou/minkan/kyoka.html
- GDACS https://www.gdacs.org/Documents/2025/GDACS_Terms_of_use_Oct_25.pdf · GEBCO https://www.gebco.net/data-products/gridded-bathymetry-data · 해저지명 https://www.gebco.net/data-products/undersea-feature-names
- Esri E300 https://www.esri.com/content/dam/esrisites/en-us/media/legal/product-specific-terms-of-use/e300.pdf · 개발자 FAQ https://developers.arcgis.com/documentation/mapping-and-location-services/faq/ · World Imagery 항목 https://www.arcgis.com/sharing/rest/content/items/10df2279f9684e4a9f6a7f08febac2a9?f=json
- Overpass https://wiki.openstreetmap.org/wiki/Overpass_API · https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
- AWS Terrain Tiles https://registry.opendata.aws/terrain-tiles/ · joerd https://github.com/tilezen/joerd/blob/master/docs/attribution.md
- Natural Earth https://www.naturalearthdata.com/about/terms-of-use/ · Solar System Scope https://www.solarsystemscope.com/textures/ · ESA/Webb https://esawebb.org/copyright/ · ESA/Hubble https://esahubble.org/copyright/ · ESO https://www.eso.org/public/copyright/ · SIMBAD https://simbad.cds.unistra.fr/simbad/
- Launch Library 2 https://thespacedevs.com/llapi · CelesTrak https://celestrak.org/usage-policy.php · adsb.lol https://www.adsb.lol/docs/open-data/api/
- YouTube 개발자 정책 https://developers.google.com/youtube/terms/developer-policies · Gemini API 약관 https://ai.google.dev/gemini-api/terms · MyMemory https://mymemory.translated.net/terms-and-conditions · Supabase https://supabase.com/pricing
- RNZ RSS https://www.rnz.co.nz/rss · ABC 이용약관(403) https://help.abc.net.au/hc/en-us/articles/360001548096-ABC-Terms-of-Use · GDELT https://www.gdeltproject.org/about.html
- GeoNet https://www.geonet.org.nz/policy · 대만 https://data.gov.tw/license · Met Office https://datahub.metoffice.gov.uk/pricing/site-specific

**비공식(방향 참고만, 사실 근거로 쓰지 않음)**
- 이데일리 2026-07-01(기상청 허위 기상정보 단속 보도) https://edaily.co.kr/News/Read?mediaCodeNo=257&newsId=02663366645510256 — "해외 모델 재전달 단속"은 기사 원문에 없음, 미확인
- 정부 정보 고지 반려 사례(개인 블로그 2021) https://vtsen.hashnode.dev/how-to-resolve-missing-clear-source-of-information-disclaimer-app-rejection
- 세무 칼럼 https://www.taxwatch.co.kr/article/tax/2022/05/16/0002 · https://www.findsemusa.com/service/consult/consultView.do?qidx=24135 · 업종코드 https://upjong.co.kr/business-code/upjong-722000/

**열지 못한 곳 (⚪ 항목의 원인)**
- volcano.si.edu(403) · help.abc.net.au(403) · eumetsat.int(403) · Esri 블로그 2편(403)·가격 페이지(빈 본문) · tsunami.gov 고지(오류) · opendata.cwa.gov.tw(연결 오류) · emsc-csem.org(404) · BigDataCloud(429)
- 읽지 않음: 에코뱅크 저작권 정책 · 뉴스 매체 9곳 약관 · Anthropic 상업 약관 · World Bank·OBIS·UNR·BMKG·INMET 조건 · Play 한국 대체결제 프로그램 약관 · Bubblewrap 문서 · 정부24 등록 페이지
- 기상법 시행령 별표 5, 부가가치세법 시행령 제33조·제101조 첨부 표
- 국세법령정보시스템 예규 원문 · 기상청 2026-06~07 단속 보도자료 원문 · API허브 출처표기 안내 PDF · 지진관측법 시행규칙·고시(§16② 절차) · 전자상거래법 제21조의2 부칙(시행일)

**저장소 근거**
- AGENTS.md · docs/HANDOVER.md §8(유료 시작 2027-01-01, 기상사업자 등록 12월)
- docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md §3-3~3-6·:527 · docs/APP-DATA-COLLECTION-INVENTORY-2026-09-24.md · docs/APP-PD-CHECKLIST-2026-09-24.md · docs/APP-STORE-LISTING-DRAFT-2026-09-24.md
- docs/R0-OPEN-METEO-AUDIT-2026-09-20.md · docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md · docs/FOUNDING-500.md · docs/MONETIZATION-PRIORITY-2026-08-05.md
- prototype/legal/terms.ko.md 제8·9조 · prototype/legal/data-license.ko.md · prototype/legal/README.md · prototype/developers.html
- prototype/js/billing.js · ui-alerts.js · push.js · weather-contract-v7.js · ui-weather.js · ui-ecobird.js · brief.js · supabase/functions/push-tick/index.ts · v2-three/js/main.js · v2-three/js/live-layers.js · apps/chrome-newtab/feeds.js · apps/android-twa/twa-manifest.json
- aws/regional-news · aws/tsunami-intl · aws/quake-asia · aws/public-weather-api · aws/news-brief · aws/regional-hazards · aws/typhoon-official · aws/jma-warn
- 하위 보고서: build/paid-app-review/r-play.md · r-law.md · r-data-weather.md · r-data-maps.md · r-tax.md · 검증: verify-legal.md · verify-data.md

---

## 검증 기록

- 번호 안내: 최종본은 새 원천을 넣어 자료 행 번호가 바뀌었다(초안 D12 기타 → D17, 초안 D13 표기 → D16, 초안 D14 일본 → D15, 초안 D15 🟢 → D18, 새 행 D12 뉴스 RSS · D13 에코뱅크 · D14 Anthropic).

두 반박 검증(`verify-legal.md` — 법·정책, `verify-data.md` — 자료 라이선스·제품 사실)의 판정을 최종 편집에서 모두 반영했다. 두 검증이 서로 다르게 말한 곳은 편집자가 공식 원문을 다시 열어 정했다(아래 '충돌 해소').

### 확인됨 (초안 그대로 유지 — 공식 원문과 일치)
- 법령 현행성: 기상법 284327(2026-09-18) · 기상산업진흥법 270217 · 시행령 284593 · 지진관측법 268815 · 시행령 281745 · 위치정보법 277359 · 전자상거래법 282793 · 시행령 288143 · 개인정보 보호법 283839 · 전기통신사업법 286079 · 시행령 285721 · 부가가치세법 276117 · 시행령 283641.
- 기상산업진흥법 제2조 제2·4·5호, 제6조 제1항, 제18조 제1항, 제26조 제2항 제1호, 시행령 제5조 제1항 제1호. 기상청 안내 "상근의 기상예보사 1명 이상"·"처리기한 5일".
- 기상법 제2조 제9호, 제17조(특보 예외 없음, 등록자도 항공·§14조의3① 예보 불가), 제48조, 제51조 제1항 제1호·제2항, 제12조의3 제5항, 제36조의2 제3항.
- 지진관측법 제16조 제1항, 시행령 제8조, 제28조 제1항, 기상사업자 예외 없음.
- 위치정보법 제9조 제1항, 제9조의2(1개월 안 신고), 제16조 제2항, 제18·19조, 제25조, 제40조. `legal/README.md:24` 정정 필요.
- 전자상거래법 제10조 제1항, 제13조 제1·3·6항, 제17조 제1·2·6항, 제21조의2 제1항, 제45조. 시행령 제20조의2, 제21조의2.
- 개인정보 보호법 제28조의8, 제64조의2(3%). 전기통신사업법 제22조 제5항, 시행령 제30조. 부가가치세법 제53조의2, 제61조(1억 400만원), 제69조(4,800만원).
- Play: 웹뷰 스팸 조항, 다운로드 요금 Play 결제, PWA 유료 앱 비권장, 무료→유료 불가, 정부 정보 고지, 거짓 제휴 금지, 구독 해지 수단, 구매 확인 3일, 선불형 자동 갱신 없음, 가격 인상 옵트인(기본), 한국 전환 동의, 수수료 15%·새 체계 10%+청구 수수료, 48시간 환불, 개발자 환불 정책·부분 환불, 한국 개발자 정보 표시, 한국 VAT 개발자 부담, 사업자번호 미입력 시 수수료 VAT 10%.
- CWS 결제 종료(GitHub 원본), 판매자 표시 의무, 일반 사칭 조항.
- 자료: Open-Meteo 상업 예시, Esri E300 각주 89·"Powered by Esri", Overpass 위키 문구, Gemini 18세 조항·무료 등급 데이터 이용, YouTube III.F.3, API허브 약관 제11·13조, 에어코리아 제3유형, GDACS PDF 에 CC 문구 없음, CelesTrak 상업 언급 없음, ECMWF Open Data 상업 가능, JMA 예보업무 허가(국외 사업자 포함).

### 고침 (WRONG · OUTDATED · 과장 → 바른 내용)
1. **별표 1 인력(L1·§3-1):** "1명/2명 ⚪, 개인사업자 가능 여부 ⚪" → 별표 1 <개정 2026. 1. 2.> 원문 확인: **상근 기상예보사 1명 이상**, 비고 2의2 **개인사업자 본인 자격 포함**. "2명"은 틀림.
2. **지진관측법 §16(L4·§3-2·§5-3):** "예외는 인공지진·학문연구뿐" → 시행령 예외 둘과 별개로 **법 §16② 기상청장 승인 경로가 있다.** 질문을 "승인 절차·서식·기준"으로 바꿈.
3. **T1 근거:** "DDA §3.4 — Google 은 대리인, 개발자가 판매자" → §3.4 의 Google 대리 판매는 목록 국가(answer/7645364)에만 적용되고 **한국은 목록에 없다** → 한국 구매자에게는 개발자가 직접 등록 판매자. 결론(PD 가 VAT 신고)은 answer/138000 으로 유지.
4. **D5 Gemini EEA:** "EEA·영국은 유료 등급만 허용" → **틀림.** EEA·스위스·영국은 무료로 써도 유료 서비스의 데이터 조항이 적용된다.
5. **L1 표현:** "유료로 보여 주면 기상예보업이 된다" → 기준은 **'사업'**. 유료는 사업 판단을 쉽게 할 뿐. 포섭 ⚪ 로 낮춤.
6. **D8 기상자료개방포털:** "수익 시 사전 협의" → 원문은 "협의를 하거나 **허락을 득하여야**".
7. **P3 문안:** "정부 기관과 무관" → 정책 원문 표현 "**정부나 정치 단체를 대표하지 않음**"을 따른다.
8. **P1 앱 안 토스:** "`SALES_OPEN` 을 여는 순간 위반" → **한국 대체결제 프로그램 미가입 시에만** 위반. 가입하면 Play 결제와 나란히 가능(수수료 4%p 감액). 프로그램 약관 ⚪.
9. **L10 날짜:** 제21조의2 는 [본조신설 2024. 2. 13.]. 반복 요구 금지에는 "보지 않기 선택" 단서가 있음(보충).
10. **L9·L11 보충:** 정기결제 동의 위반 과태료(제45조 제4항 제5호의2), 가격 인상 옵트아웃 예외, 국외이전의 다른 적법 경로(개별 고지·인증·적정성), 과징금 가중 조항(2026-03-10 개정).
11. **P5:** "한국 청구 수수료율 ⚪" → Google 이 **아직 발표하지 않았다**(추후 공지)로 확정.
12. **제품 사실 — v1 예보:** "v1 = 사실만, 예보 없음" → **v1 날씨 시트가 Open-Meteo 10일 예보·강수확률·기상청 동네예보를 보여 준다**(코드 확인). §0·L2·§2·§5-1·1-5 에 반영. 법적 판정은 내리지 않고 변호사 질문으로 넘김.
13. **제품 사실 — 새 탭:** "구름 + 기상청 관측·특보 + 최근 지진" → 구름은 NOAA GMGSI, 지진은 기상청·**JMA 폴백**, **쓰나미 줄(PTWC) 기본 켜짐**. L4·§2·§3-2·§5-3 에 반영.
14. **누락 원천 추가:** 지역 뉴스 RSS 11곳(RNZ 🔴 "personal use only"), 국립생태원 에코뱅크(🔴 저장소 기록), EARTHUS 공개 날씨 API(⚪, D8 에 묶음), Anthropic API news-brief(⚪), 1-4-부록 원천 표. §0 "다섯 곳" → "일곱 곳 + 기상청".
15. **D7 YouTube (A):** 🔴 → 🟡. III.G.2 "Selling an API Client" 허용 조항을 함께 적음.
16. **JMA:** 초안 D15 🟢 묶음(최종본 D18)에서 빼고 최종본 D15 로 옮겨 일본 기상업무법과 묶음(관측 🟢 · 예보·경보 재전달 ⚪).
17. **D6 GVP 범위:** "화산 목록" → 운영 사용처는 **주간 보고 RSS 제목·링크**뿐. 가장 싼 해결 = 빼기.
18. **D1 Open-Meteo:** v2 도 브라우저에서 직접 호출(6개 파일). 요금 등급은 "Professional 을 넘을 수 있다" → R0 감사 기준 **Enterprise**.
19. **D3 Overpass:** 위키(권고)와 운영자 문서(사용량 규칙)의 강도를 구분.
20. **줄 번호:** `ui-alerts.js:404-410` → "지금 내 위치" 버튼 **406-415**. `billing.js:385`/`389-393` → **387-393**. README 의 "저장하지 않고 실시간 처리만"도 틀림으로 추가. `twa-manifest.json` 의 `locationDelegation: true`(L5)와 `_todo_phase2_playBilling`(P4) 추가.
21. **D10 GDACS:** 면책 문구 근거를 이용조건 PDF 제4항으로 명시.
22. **공공데이터:** data.go.kr 이용허락은 데이터셋 단위 → 18개 서비스 목록을 D17·부록에 넣음.
23. **1-5 추가:** `weather-contract-v7.js:290`·`developers.html:69` 의 '공공누리 제1유형' 하드코딩, 지시서의 새 탭 설명, AGENTS.md 원칙 ↔ v1 코드.

### 충돌 해소
- **Gemini EEA 조항:** `verify-legal` 은 WRONG("무료도 유료 데이터 조항 적용"), `verify-data` 표 B 는 초안 문장("유료만")을 유지로 적었다. 편집자가 https://ai.google.dev/gemini-api/terms 를 2026-09-24 다시 열어 **`verify-legal` 이 맞음**을 확인했다(원문 취지: 유료 서비스의 데이터 이용 조항이 무료 할당량에도 적용). `verify-data` 의 그 줄은 초안 오류를 되풀이한 것이다. 최종 수정일은 두 검증과 편집자 조회가 서로 다르게 읽어 적지 않았다.

### 아직 ⚪ (공식 원문으로 확정하지 못함 — 사실로 읽지 말 것)
- 포섭 전부: GFS·Open-Meteo 결과 재표시가 '예보'인가(v1·v2), 무료 제공이 '사업'인가, 앙상블 확률·원인 해설·Simulation 의 성격, 오로라 예보의 §14조의3① 해당, JMA·PTWC·기상청 지진·쓰나미 재전달이 '발표'인가, 알림 지점 저장의 신고 대상 여부, FREE 등급의 체험판 충족, Gemini 18세 조항 적용, YouTube 설치비 = 시청료 여부.
- 정부24 기상사업 등록 처리기간 "5개월".
- 지진관측법 §16② 승인의 절차·서식·기준(시행령에 없음, 시행규칙·고시 미열람).
- 전자상거래법 제21조의2 시행일(부칙).
- Play: 무료 잠금 시점(앱 생성 vs 첫 게시), 최소 기능 심사, 한국 대체결제 프로그램 약관·새 체계에서 감액 유지, 지급 통화, Bubblewrap `playBilling` 현행 설정, 사업자번호 늦은 입력 시 환급.
- 세무: 영세율 근거(제22조 vs 제24조+시행령 제33조), 과세표준·공급시기, 업종코드, 현금영수증 의무.
- 부가통신: 개인사업자 '자본금' 판정.
- 자료: 기상청 API 자료별 공공누리 유형·유료 사용 조건·공개 API 재제공, 스미소니언 GVP(403), GDACS 라이선스, CelesTrak·MyMemory(이번 재확인 안 함), 에코뱅크·뉴스 매체 9곳·ABC(403)·Anthropic 약관(미열람), news-brief 운영 여부, Esri 옛 주소에 E300 적용·가격, Open-Meteo 요금·v1 해당·과금 단위, 에어코리아 가공 = 변경 여부, 1-4-부록의 ⚪ 원천 전부, NASA 사진 광고 사용, D18 🟢 묶음 중 ECMWF 외 항목(이번 최종 검증에서 재확인 안 함).
- 비용: 기상예보사 인건비, Open-Meteo·Esri·GVP 허가·위치정보 신고 비용.
