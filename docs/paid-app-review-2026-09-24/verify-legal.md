# verify-legal — REVIEW-draft 법·정책 주장 반박 검증 (2026-09-24)

- 대상: `build/paid-app-review/REVIEW-draft.md` 의 🔴·🟡 행과 법·정책 주장 전부.
- 방법: 초안·하위 보고서를 믿지 않고 **공식 원문을 다시 열었다.**
  - 법령은 국가법령정보센터 본문(`lsInfoR.do`)을 직접 받아 조문을 대조했다.
  - 각 법령이 '현행'인지는 `law.go.kr/법령/<법령명>` 주소로 한 번 더 확인했다. 초안이 쓴 lsiSeq·시행일과 모두 같았다.
    - 기상법 284327(2026-09-18) · 기상산업진흥법 270217(2026-03-26) · 같은 법 시행령 284593(2026-03-26)
    - 지진관측법 268815(2026-02-01) · 같은 법 시행령 281745(2026-01-02)
    - 위치정보법 277359(2025-10-01) · 전자상거래법 282793(2026-07-21) · 같은 법 시행령 288143(2026-07-21)
    - 개인정보 보호법 283839(2026-09-11) · 전기통신사업법 286079(2026-05-19) · 같은 법 시행령 285721(2026-04-28)
    - 부가가치세법 276117(2026-01-02) · 같은 법 시행령 283641(2026-04-01)
  - 법령 URL 형식: `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=<번호>&efYd=<시행일>`. 아래 표에서는 "법령(lsiSeq)"로 줄여 쓴다.
  - 모든 출처의 **읽은 날은 2026-09-24**이다.
- 판정: **CONFIRMED**(원문과 같음) · **WRONG**(틀림, 바른 내용 병기) · **OUTDATED**(옛 내용) · **UNVERIFIABLE**(공식 원문으로 확인 못 함 — 기본값).
  - "CONFIRMED" 는 **조문·정책 문구가 그렇게 적혀 있다**는 뜻이다. 우리 서비스가 그 조문에 **해당하는지**(포섭)는 대부분 변호사·기상청 판단이다. 그런 행은 "포섭: 확인 필요"로 따로 적었다.
- ⚠️ **법률·세무 자문이 아니다.**
- 인용 규칙: 법령 조문은 저작권법 제7조의 보호받지 못하는 저작물이라 조문 단위로 인용했다. 제3자 약관·정책 문구는 출처당 15단어 이하로 잘랐고, 나머지는 요약했다.
- 이 파일만 새로 썼다. 코드·설정·배포·git·계정은 건드리지 않았다. `REVIEW-draft.md` 도 고치지 않았다.

---

## A. 초안을 고쳐야 하는 곳 (먼저 읽을 것)

| # | 초안 위치 | 문제 | 바른 내용 | 근거 |
|---|---|---|---|---|
| A1 | L1 · §3-1 "별표 1 원문 못 엶, 1명/2명 ⚪, 개인사업자 가능 여부 ⚪" | **이제 확인됨 → ⚪ 해제** | 별표 1 <개정 2026. 1. 2.>: 기상예보업 인력 = **상근 기상예보사 1명 이상**. "2명"은 틀림. 비고 2의2: **개인사업자 본인이 자격을 갖추면 인력에 포함**된다. 시설은 사무실과 컴퓨터 1대 이상 | law.go.kr 별표 1 PDF `https://www.law.go.kr/LSW/flDownload.do?gubun=&flSeq=162468921&bylClsCd=110201` — "개인사업자를 해당 업종의 인력 산정에 포함한다" |
| A2 | L4 "예외는 인공지진과 학문연구뿐이다" · §3-2·§5-3 "제16조 제2항 승인 절차가 있는지" | **부분 WRONG** | 법 제16조 **제2항이 기상청장 승인 경로를 명시**한다. 경로는 **있다.** 시행령 제8조의 예외(인공지진·학문연구)와 별개다. 확인할 것은 "승인 절차·서식·기준"이다(시행령에 절차 규정 없음 → UNVERIFIABLE). "기상사업자 예외 없음"은 CONFIRMED | 법령(268815) §16② "기상청장 외의 자가 … 발표를 하려는 때에는 기상청장의 승인을 받아야 한다" |
| A3 | T1 근거 "계약상 Google 은 대리인, 개발자가 판매자 (§3.4)" | **근거 오적용 (결론은 맞음)** | DDA §3.4 의 "Google = 등록 판매자(대리인)"는 **목록에 있는 국가**에만 적용된다. 목록(answer/7645364)은 유럽 위주이고 **한국은 없다.** 한국 구매자에게는 **개발자가 직접 등록 판매자**다. "PD 가 한국분 VAT 를 신고·납부" 결론은 answer/138000 으로 CONFIRMED | DDA §3.4 "You are the registered seller for products you sell … to all other users" · answer/7645364 (한국 미등재) |
| A4 | D5 "EEA·영국은 유료 등급만 허용" | **WRONG** | 현행 약관은 "EEA·스위스·영국에서는 **무료 사용에도 유료 서비스의 데이터 조항이 적용**된다"고 쓴다. '유료만 허용'이 아니다. 우리(한국) 판단에는 영향이 거의 없다 | ai.google.dev/gemini-api/terms (EEA·스위스·영국 조항 — 요약, 인용은 D4 행에) |
| A5 | L1 "유료로 보여 주면 기상예보업이 된다" | **표현 과함 → PLAUSIBLE** | 기상산업진흥법은 '유료'가 아니라 **'사업'**을 기준으로 한다(제2조 4호 "기상예보를 하는 사업", 제6조 "하려는 자"). 무료라도 사업이면 등록 대상일 수 있다. 유료면 '사업' 판단이 더 쉬워질 뿐이다. §5-1 질문 1이 이미 이 질문을 담고 있다 | 법령(270217) §2 4호 "일반ㆍ특정 수요자를 대상으로 기상예보를 하는 사업" |
| A6 | 3-1 "처리기간: 기상청 5일, 정부24 5개월" | 절반만 확인 | 기상청 안내 "처리기한 5일"은 CONFIRMED. 정부24 "5개월"은 이번에 열지 않았다 → UNVERIFIABLE | kma.go.kr/kma/biz/biz_regist01.jsp |
| A7 | D8 "기상자료개방포털은 수익이 있으면 사전 협의" | **CONFIRMED, 더 강함** | 원문은 "사전에 별도의 **협의를 하거나 허락을 득하여야**"다. '협의'만이 아니라 '허락'까지 적혀 있다 | data.kma.go.kr 저작권 페이지 — "기상청과 사전에 별도의 협의를 하거나 허락을 득하여야" |
| A8 | L10 제목·과업 문구 "2025 다크패턴 조항" | 날짜 표기 | 제21조의2 는 **[본조신설 2024. 2. 13.]**. 시행일 원문은 이번에 읽지 않았다 | 법령(282793) §21조의2 |
| A10 | P1 · §4 "앱 안에서 토스 결제창이 뜨면 `SALES_OPEN` 을 여는 순간 위반" | **조건부 — 절대 금지가 아님** | Play 한국 **대체결제 프로그램에 가입하면** 앱 안에서 Play 결제와 **함께** 다른 결제(토스 등)를 제공할 수 있다. 이 경우 수수료는 Play 결제보다 4%p 낮다. 가입하지 않았다면 초안 말대로 위반이다. 따라서 선택지는 둘이다: ① 앱 안 토스 차단 ② 프로그램 가입 후 Play 결제와 나란히 제공. 프로그램 자체 약관은 열지 않았다 → UNVERIFIABLE | answer/9858738 (요약: 해당 국가에서 프로그램에 가입하면 앱 안 대체결제 가능) · answer/112622 (요약: Play 결제에 '더해' 대체결제를 제공할 때 수수료 4%p 감액) |
| A9 | P3 "정부 기관과 무관 문장 + 출처 URL" | CONFIRMED, 보충 | 정책 원문은 '정부 기관과 무관' 대신 "**정부·정치 단체를 대표하지 않음**을 분명히"라고 쓴다. 문안은 이 표현을 따르는 것이 안전하다 | answer/9514050 — "Make it clear that the app doesn't represent a government or political entity." |

---

## B. 한국 법령

| 주장 (초안) | 판정 | 출처 · ≤15단어 인용 |
|---|---|---|
| **L1** 기상산업진흥법 제2조 제2호 '기상예보' 정의 | CONFIRMED | 법령(270217) §2 2호 — "미래의 기상상태를 예상하여 제공하는 것을 말한다" |
| L1 제2조 제4호 '기상예보업' = 일반·특정 수요자 대상 사업 | CONFIRMED (A5 참고) | 같은 곳 §2 4호 — "일반ㆍ특정 수요자를 대상으로 기상예보를 하는 사업" |
| L1 제6조 제1항 등록 의무 | CONFIRMED | 같은 곳 §6① — "대통령령으로 정하는 인력과 시설을 갖추어 기상청장에게 등록하여야 한다" |
| L1 제26조 제2항 제1호 미등록 2년 이하 징역·2천만원 이하 벌금 | CONFIRMED | 같은 곳 §26② — "2년 이하의 징역 또는 2천만원 이하의 벌금에 처한다" (1호: 등록 없이 기상사업) |
| L1 시행령 제5조 제1항 제1호: 인터넷 불특정 다수 대상 예보 포함 | CONFIRMED | 법령(284593) §5①1 — "불특정 다수인을 대상으로 … 인터넷 홈페이지 등을 통하여 제공하는 기상예보" |
| L1 등록 인력 "상근 기상예보사 1명 이상" (기상청 안내) | CONFIRMED | kma.go.kr/kma/biz/biz_regist01.jsp — "상근의 기상예보사 1명 이상" · 별표 1 동일(A1) |
| §3-1 별표 1 "2명"설 · 개인사업자 가능 여부 ⚪ | **WRONG / 해소** (A1) | 별표 1 <개정 2026. 1. 2.> — "상근 … 기상예보사 1명 이상" · 비고 2의2 개인사업자 포함 |
| §3-1 기상예보사 면허 요건(기술사 / 기사+2년 / 기사+교육과정) | CONFIRMED | 법령(270217) §18① — "기상 분야 기사 자격을 취득한 후 2년 이상" |
| §3-1 기상감정업 = 특정 수요자 대상 | CONFIRMED (포섭: 확인 필요) | 같은 곳 §2 5호 — "특정 수요자를 대상으로 기상감정을 제공하는 사업" |
| §3-1 등록 처리기간 5일 (기상청) / 5개월 (정부24) | 5일 CONFIRMED · 5개월 UNVERIFIABLE | biz_regist01.jsp — "처리기한 5일" · 정부24 미열람 |
| §3-1 정책브리핑(2025-12-16) 별표 개정의 현행 반영 여부 ⚪ | 해소 — 별표 1 이 2026-01-02 개정본이고 개인사업자 비고가 들어 있다 | 별표 1 PDF 머리 "<개정 2026. 1. 2.>" |
| **L2** 기상법 [시행 2026-09-18, 법률 제21463호] 현행 | CONFIRMED | 법령(284327) 머리 — "[시행 2026. 9. 18.] [법률 제21463호, 2026. 3. 17., 일부개정]" |
| L2 제2조 제9호 '예보' = 수치예측 결과 등을 기초로 한 예상 발표 | CONFIRMED | 같은 곳 §2 9호 — "수치예측 결과, 기후정보 등을 기초로 한 예상을 발표하는 것" |
| L2 제17조 본문 "기상청장 외의 자는 예보 및 특보를 할 수 없다" | CONFIRMED | 같은 곳 §17 — "기상청장 외의 자는 예보 및 특보를 할 수 없다." |
| L2 예외는 국방과 등록 기상예보업자뿐, **특보는 예외 아님** | CONFIRMED | 같은 곳 §17 2호 — "기상예보업의 등록을 한 자가 예보를 제공하는 경우" (특보 없음) |
| §0-2 "등록해도 특보·항공·우주영향 예보는 못 한다" | CONFIRMED | 같은 곳 §17 2호 단서 — "항공기상예보 및 제14조의3 제1항에 따른 예보는 제외한다" |
| L2 오로라 예보가 §14조의3①(우주영향 예보)에 드는지 ⚪ | 조문 CONFIRMED · 포섭 UNVERIFIABLE | 같은 곳 §14조의3① — "우주공간에서의 물리적 현상이 기상현상, 기후 및 기상위성에 미치는 영향" |
| L2 제48조 특보 위반 3년·3천만원 | CONFIRMED | 같은 곳 §48 — "특보를 한 자는 3년 이하의 징역 또는 3천만원 이하의 벌금" |
| L2 제51조 제1항 제1호 예보 위반 100만원 이하 과태료 | CONFIRMED | 같은 곳 §51①1 — "제17조 각 호 외의 부분 본문을 위반하여 예보를 한 자" (100만원 이하) |
| L2 "지금 무료로 공개된 v2 예보에도 과태료 위험(유·무료 불문)" | 조문 CONFIRMED (§17 에 유·무료 구분 없음) · 포섭(GFS 재표시 = '예보'?) UNVERIFIABLE | 같은 곳 §17 본문 |
| **L3** 제12조의3 제5항 출처 표시 의무 | CONFIRMED | 같은 곳 §12조의3⑤ — "공표 또는 제공 시 그 출처를 밝혀야 한다" ([본조신설 2026. 3. 17.]) |
| L3 제36조의2 제3항 출처 표시 | CONFIRMED | 같은 곳 §36조의2③ — "제3자에게 제공하는 경우에는 그 출처를 밝혀야 한다" |
| L3 제51조 제2항 출처 누락 50만원 이하 과태료 | CONFIRMED | 같은 곳 §51② — "50만원 이하의 과태료를 부과한다" (1호 §12조의3⑤, 2호 §36조의2③) |
| **L4** 지진관측법 [시행 2026-02-01] 현행 | CONFIRMED | 법령(268815) 머리 — "[시행 2026. 2. 1.] [법률 제20727호 …]" |
| L4 제16조 제1항: 기상청장 외의 자는 관측 결과·특보 "발표할 수 없다" | CONFIRMED | 같은 곳 §16① — "관측 결과 및 특보를 발표할 수 없다" |
| L4 예외는 인공지진·학문연구뿐 (시행령 제8조) | **부분 WRONG** (A2) | 시행령 §8 은 CONFIRMED("인공지진", "학문연구를 위하여"). 그러나 법 §16② — "기상청장의 승인을 받아야 한다" (승인 경로 존재) |
| §0-2 · L4 "지진·쓰나미 발표에 기상사업자 예외 없음" | CONFIRMED | 법 §16 · 시행령 §8 어디에도 기상사업자 예외가 없다 |
| L4 제28조 제1항 3년·3천만원 | CONFIRMED | 같은 곳 §28① — "3년 이하의 징역 또는 3천만원 이하의 벌금에 처한다" |
| L4 JMA 지진 재전달·실제 사건 쓰나미 도달시간이 '발표'인가 | UNVERIFIABLE (포섭 — 변호사·기상청) | — |
| **L5** 위치정보법 제9조 제1항 신고 의무(개인위치정보 대상 LBS) | CONFIRMED | 법령(277359) §9① — "위치기반서비스사업 … 을 하려는 자는 … 방송미디어통신위원회에 신고하여야 한다" |
| L5 제9조의2: 소상공인은 면제가 아니라 개시 후 1개월 안 신고 | CONFIRMED | 같은 곳 §9조의2① — "사업을 개시한 날부터 1개월 이내에 … 신고하여야 한다" |
| §1-5 `legal/README.md:24` "2021년 개정 면제"는 부정확 | CONFIRMED (초안 지적이 맞음) | §9조의2 는 [본조신설 2018. 4. 17.]이고 내용은 '1개월 유예 후 신고' |
| L5 제40조 미신고·무동의 수집 3년·3천만원 | CONFIRMED | 같은 곳 §40 — "3년 이하의 징역 또는 3천만원 이하의 벌금" (2호 미신고, 4호 무동의) |
| L5 제18·19조 약관 명시 후 동의 | CONFIRMED | 같은 곳 §19① — "미리 다음 각호의 내용을 이용약관에 명시한 후 … 동의를 얻어야 한다" |
| L5 제25조 14세 미만 법정대리인 동의 | CONFIRMED | 같은 곳 §25① — "14세 미만의 아동으로부터 … 법정대리인의 동의를 얻어야" |
| §3-3 제16조 제2항 확인자료 자동 기록 | CONFIRMED | 같은 곳 §16② — "확인자료를 위치정보시스템에 자동으로 기록되고 보존되도록" |
| L5 "기기 좌표를 서버에 저장 = 신고 대상일 가능성 높음" | PLAUSIBLE (공식 안내가 방향을 뒷받침) · 최종 포섭 UNVERIFIABLE | lbsc.kr CONTENT_0000081 — "사업자의 위치정보시스템으로 전송하지 않는 경우에는 신고 대상에서 제외" |
| **L6** 전자상거래법 제10조 제1항 사이버몰 표시(사업자등록번호 등) | CONFIRMED | 법령(282793) §10① — "사업자의 신원 등을 쉽게 알 수 있도록 … 표시하여야 한다" |
| L6 제13조 제1항 신고번호·신고 기관 표시 | CONFIRMED | 같은 곳 §13①3 — "신고의 신고번호와 그 신고를 받은 기관의 이름" |
| L6 위반 1천만원 이하 과태료(제45조) | CONFIRMED | 같은 곳 §45④2 — "사업자의 신원정보를 표시하지 아니한 자" (1천만원 이하) |
| **L7** 제17조 제1항 7일 | CONFIRMED | 같은 곳 §17①1 — "계약내용에 관한 서면을 받은 날부터 7일" |
| L7 제17조 제2항 제5호 디지털콘텐츠 제공 개시 후 제한(가분적이면 미개시분 제외) | CONFIRMED | 같은 곳 §17②5 — "가분적 디지털콘텐츠로 구성된 계약의 경우에는 제공이 개시되지 아니한 부분" |
| L7 제6항 단서: 표시 + 시험 사용 둘 다 필요 | CONFIRMED | 같은 곳 §17⑥ 단서 — "불가능하다는 사실의 표시와 함께 … 시험 사용 상품을 제공" |
| L7 시행령 제21조의2 네 방법(일부·한시·체험판·정보 제공) | CONFIRMED | 법령(288143) §21조의2 — "체험용 디지털콘텐츠 제공: 일부 제한된 기능만을 사용할 수 있는" |
| L7 제13조 제3항 미성년자 취소권 고지 | CONFIRMED | 법령(282793) §13③ — "그 계약을 취소할 수 있다는 내용을 미성년자에게 고지하여야 한다" |
| L7 "FREE 등급 = 체험용이면 ③ 충족" | UNVERIFIABLE (포섭 — 변호사, §5-1 질문 6) | — |
| **L9** 제13조 제6항 증액·무료→유료 전환 동의 | CONFIRMED | 같은 곳 §13⑥ — "무상으로 공급된 후 유료 정기결제로 전환되는 경우" |
| L9 시행령 제20조의2: 30일 전 | CONFIRMED | 법령(288143) §20조의2 — "전환되기 전 30일을 말한다" |
| L9 위반 과태료 | CONFIRMED (초안에 없음, 보충) | 법령(282793) §45④5의2 — "제13조 제6항을 위반하여 소비자의 동의를 받지 아니하거나" (1천만원 이하) |
| **L10** 제21조의2 제1항 금지행위 5종(총액 일부 표시·사전 체크·시각 차별·해지 방해·반복 팝업) | CONFIRMED (A8: 신설 2024-02-13) | 같은 곳 §21조의2①4가 — "그 취소, 탈퇴, 해지 등의 절차를 복잡하게 설계하는 방법" |
| L10 "앱에서 가입했으면 앱에서 해지" | CONFIRMED | 같은 곳 §21조의2①4나 — "다른 방법으로만 그 취소, 탈퇴, 해지 등을 할 수 있도록 제한" 금지 |
| L10 1천만원 이하 과태료 | CONFIRMED | 같은 곳 §45④7 — "제21조의2 제1항 각 호의 금지행위 중 어느 하나" |
| L10 반복 팝업 금지 | CONFIRMED + 단서 | §21조의2①5 단서: 일정 기간 요구를 받지 않도록 **선택할 수 있게 하면 제외** |
| **L11** 개인정보 보호법 [시행 2026-09-11] 제28조의8: 별도 동의 또는 계약 이행 위탁·보관을 처리방침에 공개 | CONFIRMED (보충: 다른 경로도 있음) | 법령(283839) §28조의8①3가 — "제2항 각 호의 사항을 제30조에 따른 개인정보 처리방침에 공개한 경우". 나목(전자우편 등 개별 고지), 4호 인증, 5호 적정성 인정도 있다 |
| L11 국외이전 위반 매출 3% 이하 과징금 | CONFIRMED (보충) | 같은 곳 §64조의2①7 — "전체 매출액의 100분의 3을 초과하지 아니하는 범위". 2026-03-10 개정으로 가중 시 10%(②) 조항 신설 |
| **L12** 전기통신사업법 제22조 제5항 제1호 소규모 신고 간주 | CONFIRMED | 법령(286079) §22⑤ — "부가통신사업을 신고한 것으로 본다" |
| L12 시행령 제30조 자본금 1억원 이하 | CONFIRMED · 개인사업자 '자본금' 판정은 UNVERIFIABLE | 법령(285721) §30① — "인터넷을 이용하여 부가통신역무를 제공하는 자본금 1억원 이하" |
| **T2** 부가가치세법 제53조의2: 국외사업자 전자적 용역, 등록사업자 과세사업 공급은 제외 | CONFIRMED (T2 방향과 일치) | 법령(276117) §53조의2① — "등록사업자의 과세사업 또는 면세사업에 대하여 용역을 공급하는 경우는 제외" |
| **T3** 영세율 근거 제22조 vs 제24조+시행령 제33조 | 조문 존재 CONFIRMED · 어느 것이 적용되는지 UNVERIFIABLE (세무사) | 같은 곳 §22 — "국외에서 공급하는 용역에 대하여는 … 영세율을 적용한다" · 시행령 §33 은 이번에 열지 않음 |
| **T4** 간이과세 기준 1억 400만원 | CONFIRMED | 법 §61①→시행령(283641) §109① — "대통령령으로 정하는 금액”이란 1억4백만원을 말한다" |
| T4 간이 납부면제 4,800만원 | CONFIRMED | 법 §69① — "공급대가의 합계액이 4천800만원 미만이면 … 납부의무를 면제한다" |
| T4 업종코드 722000/724000 · 현금영수증 의무 | UNVERIFIABLE (제3자 자료, 국세청 원문 미열람) | — |

---

## C. Google Play · Chrome

| 주장 (초안) | 판정 | 출처 · ≤15단어 인용 |
|---|---|---|
| **P1** 웹뷰 스팸 조항은 '소유자 허락 없이' 감싼 경우 | CONFIRMED | answer/9899034 — "provide a webview of a website without permission from the website owner" |
| P1 "최소 기능 심사 통과는 추정" | UNVERIFIABLE (해당 페이지 fetch 에 최소 기능 문구가 잡히지 않음) | — |
| P1 다운로드 요금은 Play 결제만 | CONFIRMED | answer/9858738 — "Developers charging for app downloads from Google Play must use Google Play's billing system" |
| P1 · §2 Google 은 PWA 에 유료 앱 방식을 권하지 않음 | CONFIRMED | developers.google.com/chromeos/app-development/publish/pwa-in-play — "We do not recommend the paid app option for PWAs published on Google Play." |
| P1 한국 대체결제(토스를 앱 안에서) | CONFIRMED (조건부 가능) · 초안의 "앱 안 토스 = 위반"은 **프로그램 미가입 시**에만 맞다 | answer/9858738 (요약: 해당 국가에서 프로그램에 가입하면 앱 안 대체결제 가능) · answer/112622 (요약: 한국 대체결제 수수료는 Play 결제보다 4%p 낮음) |
| **P2** · §0-5 무료로 낸 앱은 유료로 못 바꾼다 | CONFIRMED | answer/6334373 — "Once your app has been offered for free, the app can't be changed to paid." |
| P2 유료→무료는 가능 | CONFIRMED | answer/6334373 (요약: 유료→무료 변경은 가능) |
| P2 언제 잠기는지(앱 생성 vs 첫 게시) ⚪ | UNVERIFIABLE (페이지에 시점 없음) | — |
| **P3** 정부 정보 앱: 설명에 출처 + 정부를 대표하지 않음 명시 | CONFIRMED (A9) | answer/9514050 (요약: 설명·등록정보에 눈에 띄는 출처를 넣을 것. 인용은 A9) |
| P3 거짓 제휴 금지 | CONFIRMED | answer/9888077 — "Apps that falsely claim affiliation with a government entity" |
| **P4** 구독 조건 공개 + 앱 안 해지 수단 | CONFIRMED | answer/9900533 — "include in your app access to an easy-to-use, online method to cancel" |
| P4 구매 확인(acknowledge) 3일, 안 하면 자동 환불 | CONFIRMED | developer.android.com/google/play/billing/integrate — "within three days so that the purchase isn't automatically refunded" |
| P4 Bubblewrap `playBilling` 현행 설정법 ⚪ | UNVERIFIABLE (미열람) | — |
| L9 · §2 Play 선불형(prepaid) = 자동 갱신 없음 | CONFIRMED | developer.android.com/google/play/billing/lifecycle/subscriptions — "Prepaid plans don't auto-renew" |
| L9 Play 가격 인상은 옵트인 | CONFIRMED (기본값). 일부 국가·조건에서는 옵트아웃 인상도 가능 | developer.android.com/google/play/billing/price-changes — "By default, price increases are opt-in changes for existing subscribers." |
| L9 한국은 체험→유료 전환 시 동의 | CONFIRMED | 같은 페이지 (요약: 한국은 무료 체험→유료·소개가→정가 전환 때 Play 가 동의를 받고, 동의 기간은 최대 30일) |
| **P5** 지금 첫 US$1M 15% · 구독 15% | CONFIRMED | answer/112622 — "15% for the first $1M (USD) revenue earned by the developer each year" |
| P5 2026-12-31 부터 한국 새 체계 10% + 청구 수수료 | CONFIRMED (신규 설치 기준) | answer/16954621 — 한국 적용일 2026-12-31, "10% + billing fee, if applicable" |
| P5 한국 청구 수수료율 ⚪ | CONFIRMED 미정 | answer/16954621 (요약: 미국·영국·EEA 외 지역 청구 수수료는 추후 공지) |
| **L8** Play 48시간 뒤에는 개발자에게 | CONFIRMED | support.google.com/googleplay/answer/15574908 — 48시간 뒤 "Contact the developer to troubleshoot and find out if you can get a refund." |
| L8 환불 정책은 개발자 몫 · Console 부분 환불 가능 | CONFIRMED | answer/2741495 — "You must issue refunds in accordance with your policy." · "full or partial refunds" |
| **L6** Play 한국 개발자 정보(사업자번호·통신판매 신고번호·신고 기관), 설명 하단 표시 | CONFIRMED (유료 앱·인앱 구매가 있는 앱에 요구) | answer/3255733 (ko) — "대한민국 사용자에게만 애플리케이션 설명 하단에 표시됩니다" |
| **T1** 한국 개발자가 한국 구매자분 VAT 산정·청구·납부 | CONFIRMED | answer/138000 — "you're responsible for determining, charging, and remitting Value Added Tax (VAT)" |
| T1 "계약상 Google 은 대리인, 개발자가 판매자 (DDA §3.4)" | **근거 오적용** (A3) | A3 참조 (DDA §3.4 · answer/7645364) |
| **T2** 사업자번호 미입력 시 서비스 수수료에 VAT 10% | CONFIRMED | answer/138000 한국 항목 (요약: 사업자등록번호를 주지 않으면 Google 이 수수료에 VAT 10% 부과) |
| T2 늦게 넣으면 환급 가능? | UNVERIFIABLE | — |
| **P6** CWS 결제 2021-02-01 종료 | CONFIRMED (공식 사이트 해당 URL 은 404, GitHub 원본 소스로 확인) | github.com/GoogleChrome/developer.chrome.com …/cws-payments-deprecation/index.md — "can no longer charge money with Chrome Web Store payments" (2021-02-01) |
| P6 유료 확장은 개발자가 판매자임을 밝혀야 함 | CONFIRMED | developer.chrome.com/docs/webstore/program-policies/policies — "You must clearly identify that you, not Google, are the seller" |
| P3(새 탭) CWS 사칭 조항 | CONFIRMED (정부 명시 조항은 없음, 일반 사칭 금지) | 같은 페이지 (요약: 다른 회사·기관이 승인·보증한 것처럼 표시 금지) |

---

## D. 자료·외부 서비스 약관 (🔴·🟡 행)

| 주장 (초안) | 판정 | 출처 · ≤15단어 인용 |
|---|---|---|
| **D1** Open-Meteo 무료 API = 비상업 전용, 구독 앱은 상업 | CONFIRMED | open-meteo.com/en/terms — "Operating websites or apps that have subscriptions or display advertisements" (상업 예시. 무료 API 는 비상업 전용이라는 문장도 있음) |
| D1 같은 도메인 무료 v1 도 해당하는지 ⚪ · 요금(블로그 2023) ⚪ | UNVERIFIABLE | — |
| **D2** Esri: 수익 앱은 인증 필수 (E300 각주 89) | CONFIRMED | Esri E300 (2025-11-13판) 각주 89 — "revenue-generating Value-Added Applications … are required to use Authentication" |
| D2 "Powered by Esri" 표기 필수 | CONFIRMED | developers.arcgis.com …/faq/ — "There are two types of attribution … 1. Powered by Esri." |
| D2 옛 주소 무인증 사용을 직접 금지하는 조문 ⚪ | UNVERIFIABLE (FAQ 에 해당 문장 없음) | FAQ (요약: 위치 서비스 사용에는 액세스 토큰이 필요하다고 안내 — 새 서비스 기준) |
| **D3** OSM Overpass: 상업 이용은 자체·유료 서버 | CONFIRMED (OSM 위키 — 운영 정책 페이지, 법적 약관 아님) | wiki.openstreetmap.org/wiki/Overpass_API — "Commercial use should use self-hosted or paid Overpass servers." |
| **D4** Gemini: 18세 미만이 접근할 가능성 큰 서비스 금지 | CONFIRMED (포섭: 변호사) | ai.google.dev/gemini-api/terms — "likely to be accessed by individuals under the age of 18" |
| **D5** 무료 등급 입력은 제품 개선에 쓰이고 사람이 검토 가능 | CONFIRMED | 같은 곳 (Unpaid Services 조항 — 요약: 입력·출력을 제품 개선에 쓰고 사람이 검토할 수 있다) |
| D5 "EEA·영국은 유료 등급만 허용" | **WRONG** (A4) | 같은 곳 (요약) — EEA·스위스·영국은 무료 사용에도 Paid Services 데이터 조항 적용 |
| **D6** 스미소니언 GVP 상업 이용 서면 허가 | UNVERIFIABLE (volcano.si.edu 403, 저장소 기록만 있음) | — |
| **D7** YouTube: 임베드 플레이어 시청 과금 금지 | CONFIRMED | developers.google.com/youtube/terms/developer-policies — "must not charge users to watch content in an embedded YouTube player" |
| **D8** 기상청 API허브 약관 제13조 (승인 없는 지식재산 이용·이용권 판매 금지) | CONFIRMED | apihub.kma.go.kr/policy.do — "운영기관의 승인 없이 … 지식재산을 이용하거나 제3자로 하여금 이용하게 해서는 안됩니다" |
| D8 API허브 약관 제11조 여러 아이디 호출 금지 | CONFIRMED | 같은 곳 제11조 (요약: 허용량을 늘리려고 같은 앱·목적에서 여러 아이디로 호출하는 행위 금지) |
| D8 기상자료개방포털: 수익 시 사전 협의 | CONFIRMED, 더 강함 (A7) | data.kma.go.kr 저작권 — "사전에 별도의 협의를 하거나 허락을 득하여야" |
| D8 기상청 누리집 저작권 정책 공공누리 제1유형 | CONFIRMED (단, **기상청이 저작권 전부를 가진 누리집 저작물**에 한함. API 자료에 그대로 적용되는지는 UNVERIFIABLE) | kma.go.kr/kma/guide/copyright.jsp (요약 fetch — 원문 문장 인용 확보 못 함) |
| **D9** 에어코리아 "출처표시, 변경금지 (제3유형)" | CONFIRMED | data.go.kr/data/15073861 — "공공저작물 : 출처표시, 변경금지" |
| D9 보간·지수 환산이 '변경'인지 | UNVERIFIABLE (포섭) | — |
| **D10** GDACS CC BY 4.0 표기 근거 없음 | UNVERIFIABLE (이번에 열지 않음 — 초안의 '근거 없음' 판단을 뒤집을 자료도 없음) | — |
| **D11** CelesTrak · MyMemory | UNVERIFIABLE (이번에 열지 않음) | — |
| **D14** 일본: 외국 사업자도 허가 필요, 국내 대표자 지정 | CONFIRMED | jma.go.jp/jma/kishou/minkan/kyoka.html — "所在が国内か国外かに関わらず、許可が必要です" · 개정 "2026年05月29日" |
| **D12 · D13 · D15** (확인 필요 원천 목록·출처 표기 보강·🟢 목록) | 이번 검증 범위 밖 — 미검증 | — |

---

## E. §0 결론 문장별 판정 (PD 가 이것을 보고 움직인다)

| §0 문장 | 판정 | 비고 |
|---|---|---|
| 1. v2 예보·확률을 돈 받고 보여 주면 기상예보업, 미등록 2년·2천만원 | 조문 CONFIRMED · 포섭 PLAUSIBLE | A5: 기준은 '유료'가 아니라 '사업' |
| 1. 등록에는 상근 기상예보사 1명 이상 | CONFIRMED | A1: 개인사업자 본인이 자격자면 본인으로 충족 |
| 2. 자체 특보·경고는 등록해도 못 함 | CONFIRMED | 기상법 §17 2호는 '예보'만 예외 |
| 2. 지진·쓰나미에는 기상사업자 예외 없음 | CONFIRMED | 단 §16② 기상청장 승인 경로는 있음(A2) |
| 3. Open-Meteo·Esri·Overpass·Gemini 18세 | CONFIRMED (약관 문구) | Gemini 포섭은 변호사 |
| 3. 스미소니언 GVP | UNVERIFIABLE | 공식 페이지 403 |
| 4. "지금 내 위치" 서버 저장 = 위치기반서비스사업 신고 대상 가능성 높음 | PLAUSIBLE | 조문·위치정보지원센터 안내가 방향을 뒷받침. 최종은 변호사·방미통위 |
| 4. Play 등록정보에 정부 무관 문장·출처 URL 필요 | CONFIRMED | A9 표현 참고 |
| 5. 무료로 먼저 내면 그 앱은 영영 유료 앱이 될 수 없다 | CONFIRMED | 잠기는 시점만 UNVERIFIABLE |
| 5. 크롬 확장은 무료로(CWS 결제 없음) | CONFIRMED | — |
| 6. 자기 사이트 TWA 를 막는 Play 조항 없음 | PLAUSIBLE (스팸 조항 원문 기준 — 다른 조항이 없다는 것까지 확인한 것은 아님) | 최소 기능 심사는 UNVERIFIABLE |
| 6. 한국 구매자분 부가세는 Google 이 아니라 PD | CONFIRMED | A3: 근거는 answer/138000 과 DDA "all other users" 문장 |

---

## F. 검증하지 못한 것 (이유)

- 정부24 기상사업 등록 처리기간 "5개월" — 페이지를 열지 않았다.
- 부가가치세법 시행령 제33조(외화 획득 영세율) — 열지 않았다. T3 는 세무사 몫.
- 지진관측법 제16조 제2항 승인의 절차·서식 — 시행령에 규정이 없다. 시행규칙·고시는 열지 않았다.
- 전자상거래법 제21조의2 의 시행일(부칙) — 읽지 않았다.
- volcano.si.edu(403) · GDACS · CelesTrak · MyMemory · Bubblewrap 문서 · Play 최소 기능 조항 원문.
- 기상청 누리집 저작권 페이지는 요약만 받았다. 공공누리 제1유형의 원문 문장을 확보하지 못했다.
- 모든 '포섭' 질문(우리 기능이 그 조문에 해당하는가)은 초안 §5 의 변호사·기상청·세무사 질문으로 남긴다. 이 검증은 그 답을 대신하지 않는다.
