# EARTHUS Maritime Intelligence — Product Specification v0.1

작성 2026-09-06 · 상태 **DRAFT (PD 확정 결정 ①~⑥ 반영)** · 정본 우선순위: v5.3 §1.4 > 이 문서 > 화면

> 한 문장: **FREE는 지구를 보여주고, EXPLORER는 나를 이해하고, INTELLIGENCE는 내가 조사하며,
> BUSINESS는 내 자산을 감시하고, ENTERPRISE는 내 조건으로 지구를 계산한다.**

---

## 0. 확정 결정 (2026-09-06)

| # | 결정 | 근거·제약 |
|---|---|---|
| ① | 소비자 요금제는 v5.3 §1.4 그대로 **FREE / EXPLORER / INTELLIGENCE** | `prototype/js/access-mode.js` 사다리, `prototype/supabase/billing.sql` plans.tier check |
| ② | **BUSINESS / ENTERPRISE 는 B2B Maritime 별도 트랙**. 소비자 사다리의 상위 단계가 아님 | v5.3: "Research Lab/Business 는 Team·Institution add-on" |
| ③ | 첫 개발 = **소비자 FOR ME(내 위치 1곳)** → 질문 데이터 → Asset Registry(자산 N곳). 엔진은 하나 (2026-09-06 3차 개정) | 현재 엔진은 "현상이 났는가"만 계산. "내 위치/자산에 영향인가"가 없음. 항만 고객 0명이라 개인용으로 먼저 검증 |
| ④ | 가격: 소비자는 billing.sql 정본, **B2B 는 Pilot Hypothesis** 표기 | 고객 인터뷰 0건 |
| ⑤ | DATA 는 판매 상품이 아니라 인프라. **원자료 재판매 없음** | KMA 허브 키·KTO 저작권 재배포 불가, ECMWF 만 CC-BY |
| ⑥ | 첫 B2B 제품 = **항만** → 양식 → 해운 | |

포지션: **관측+모델+역사+이벤트 → 통합 → 판단 → 내 위치/내 자산 → 행동.**
정확도 경쟁(해상도·앙상블 수)은 하지 않는다. "우리는 심판이지 선수가 아니다" (`aws/ecmwf-ingest/README.md`).

---

## 1. 핵심 모델 전환

```
지금:   EVENT → PHENOMENON → (화면)
목표:   EVENT → PHENOMENON → ASSET → THRESHOLD → IMPACT → ALERT
```

| 단계 | 정의 | 있는 것 | 없는 것 |
|---|---|---|---|
| EVENT | 기관이 발표한 사건(태풍·지진·특보) | `events/typhoon-official.json`, `events/tsunami-intl.json`, `events/quake-asia.json`, kma-warn/jma-warn | — |
| PHENOMENON | 시공간 위의 물리량(파고·풍속·수위·ETA·멤버 분포) | `ocean/marine.json`(파고·너울·SST·해류), `ocean/kma-buoy.json`(실측), `ocean/khoa/sealevel-kr.json`(조위 45곳), `ocean/tsunami-eta.json`, `events/tropical-guidance-v2.json`(ENS 멤버 120~240h), cyclone-analog 참고선 | — |
| ASSET | 고객이 등록한 위치·시설·선박 | 없음 | **Asset Registry** |
| THRESHOLD | 자산별 위험 기준 | 없음 | **Threshold Engine** |
| IMPACT | 기준 대비 판정 + 근거 + 신뢰 | 없음 | **Impact Result Model** |
| ALERT | 사람에게 도달 | `push-tick` Lambda + Supabase Edge(웹푸시) | 자산별 라우팅 |

---

## 2. Asset Registry (P2 — FOR ME 안정 뒤)

### 2.1 자산 유형 (1차 = 항만만 활성)

| type | 1차 범위 | 후순위 |
|---|---|---|
| `port` | 항만·부두·접안시설 | — |
| `farm` | 양식장(가두리·해상) | 2차 |
| `vessel` | 선박(정적 위치 또는 AIS 연동) | 3차 |
| `coast` | 해수욕장·연안 시설 | khoa-coast 이안류 지수 연동 |

### 2.2 스키마 (Supabase, RLS = org 단위)

```sql
create table public.orgs (
  id uuid primary key, name text not null,
  plan_tier text not null check (plan_tier in ('business','enterprise')),
  created_at timestamptz default now());

create table public.assets (
  id uuid primary key, org_id uuid references public.orgs(id),
  type text not null check (type in ('port','farm','vessel','coast')),
  name text not null, lat double precision not null, lon double precision not null,
  -- 항만은 점이 아니라 면일 수 있다. 1차는 점 + 반경(km)으로 근사한다.
  radius_km numeric not null default 5,
  meta jsonb not null default '{}',          -- 수심·접안 방향·운영시간 등, 계산에 쓰지 않는 것
  active boolean not null default true, created_at timestamptz default now());

create table public.thresholds (
  id uuid primary key, asset_id uuid references public.assets(id),
  variable text not null,                    -- §3.1 목록만 허용
  op text not null check (op in ('>=','<=')),
  value numeric not null, unit text not null,
  horizon_h integer not null default 72,     -- 이 시간 안에 넘으면 위험
  severity text not null check (severity in ('watch','warning','critical')),
  active boolean not null default true);
```

원칙: **클라이언트는 자기 org 의 plan_tier 를 바꿀 수 없다** (billing.sql 과 같은 규율). 자산 수 상한은 plan 표에서 읽는다.

### 2.3 초기 자산 시드 (고객 없이 검증용)

- 한국 무역항(해수부 지정) 좌표는 공공데이터 항만 기본정보에서 가져온다. **저장소에 항만 목록이 없다.** 신규 데이터 파일 `prototype/data/ports-kr.json` 필요.
- 쓰나미 ETA 연안 10지점, KHOA 조위관측소 45곳, KMA 부이 위치를 `coast` 형으로 재사용해 파이프라인을 먼저 검증한다.

---

## 3. Threshold Engine (P0 — FOR ME 가 같은 엔진을 먼저 쓴다)

### 3.1 변수 목록 (1차)

| variable | 단위 | 원천 (예측) | 원천 (실측, 검증용) | 배지 |
|---|---|---|---|---|
| `wave_height` | m | `ocean/marine.json` (모델 격자) | `ocean/kma-buoy.json` | MODEL |
| `swell_height` | m | `ocean/marine.json` | 부이 | MODEL |
| `wind_speed` | m/s | `wind-grid`, kma-fcst | 부이·등표 | MODEL |
| `sea_level` | cm | KHOA 조위 예측(있으면) | `ocean/khoa/sealevel-kr.json` | OBS |
| `tc_distance` | km | `events/typhoon-official.json` 공식 진로 (0~120h) | — | OFFICIAL |
| `tc_member_within` | 개/64 | `events/tropical-guidance-v2.json` ENS 멤버 (120~240h) | — | MODEL_GUIDANCE |
| `tsunami_eta` | min | `ocean/tsunami-eta.json` | PTWC 게시문 대조 | SIMULATION_ONLY |
| `rip_current_index` | 지수 | — | `ocean/khoa/flood-index.json` | OBS |

규율:
- **멤버 비율을 확률로 바꾸지 않는다.** "64 중 51"은 원시 개수로만 쓴다 (`tropical-intelligence` 원칙 계승).
- 0~120h 태풍은 공식 발표만, 120~240h 는 MODEL_GUIDANCE 라벨 필수. 두 구간을 이어 그리지 않는다.
- 자료 없는 변수는 `null`. 예시로 채우지 않는다.

### 3.2 판정 절차

```
for asset in org.assets:
  for th in asset.thresholds:
    series = sample(variable, asset.lat, asset.lon, asset.radius_km, horizon=th.horizon_h)
    first_hit = 첫 시각 where op(series[t], th.value)
    if first_hit: IMPACT(asset, th, first_hit, peak, sources, confidence)
```

- 샘플링은 반경 안 격자점의 **최대값**(보수적). 항만은 외해 격자가 만 안쪽보다 높게 나오므로 1차엔 과다 경보 쪽으로 둔다. 실측 부이가 반경 안에 있으면 함께 표기해 모델·실측 차이를 그대로 보여준다.
- 주기: 해양 격자 갱신 주기와 같게(현행 marine-grid 스케줄). 태풍 활성 시에만 tc_* 계산.
- 출력 키(안): `intel/maritime/<org_id>/impacts.json` (비공개, 서명 URL). 공개 요약 없음.

---

## 4. Impact Result Model — 상품 카드 (P0)

FOR ME 도 이 카드를 그대로 쓴다. `assetId` 대신 `placeId`(사용자 동네), 임계값은 기본값.

숫자 하나가 아니라 **판정 + 근거 + 신뢰 + 출처**. 이것이 "AI가 말했다"와 업무용 인텔리전스의 차이.

```json
{
  "assetId": "…", "assetName": "부산 ○○항",
  "severity": "warning",
  "headline": "36시간 후 파고 3.4 m — 임계값 3.0 m 초과 예상",
  "firstExceedAt": "2026-09-08T03:00Z", "peakAt": "…", "peakValue": 3.4,
  "threshold": {"variable": "wave_height", "op": ">=", "value": 3.0, "horizon_h": 72},
  "reasons": ["강풍(20 m/s 이상 24h)", "너울 2.1 m 동시 유입"],
  "confidence": {"grade": "B", "why": "모델 격자만, 반경 안 실측 부이 없음"},
  "ensemble": {"membersWithin100km": 51, "membersTotal": 64, "label": "MODEL_GUIDANCE"},
  "analogs": ["2019 TAPAH", "2020 MAYSAK", "2022 HINNAMNOR"],
  "sources": [{"name": "Open-Meteo Marine", "issued": "…"}, {"name": "KMA 부이 22101", "obs": "…"}],
  "badges": ["MODEL", "SIMULATION_ONLY"],
  "eventId": "…", "computedAt": "…"
}
```

Confidence 등급은 cyclone-analog 의 신뢰 게이트(800 km 안 신선한 관측·ASCAT·부이 수온)를 재사용한다. 새 확률 모델을 만들지 않는다.

---

## 5. 티어 게이팅 (코드 대조)

### 5.1 소비자 (변경 없음)

| 기능 | v5.3 | `entitlement.js` RANK |
|---|---|---|
| NOW(현재 지구·공식 안전) | FREE | FREE 0 |
| WHY / NEXT / FOR ME | EXPLORER | PLUS 1 |
| COMPARE / SCENARIO / EVIDENCE | INTELLIGENCE | CONTROL 2 |
| 공식 경보·대피·안전정보 | **항상 무료** | `OFFICIAL_SAFETY_ALWAYS_FREE` |

소비자 "FOR ME"는 **관심 지점 1~N개**의 개인 위험 보기다. 자산 등록부와 같은 엔진을 쓰되 org 없이 user 단위, 임계값은 기본값 고정(사용자 편집 불가). 이 선이 EXPLORER 와 BUSINESS 를 가른다.

### 5.2 B2B Maritime (신설)

| 능력 | BUSINESS | ENTERPRISE |
|---|---|---|
| 자산 등록 (type=port) | 상한 N개 (plan 표) | 무제한/협의 |
| 임계값 편집 | 변수당 1개 | 다중·시간대별 |
| 자동 판정·알림 (웹푸시·이메일) | ○ | ○ + 웹훅 |
| 대시보드 (org 전체 자산 보드) | ○ | ○ |
| 이력 보관 | 90일 | 협의 |
| API (impacts 읽기) | 읽기 전용, 쿼터 | 읽기+쓰기(자산 동기화) |
| **Custom Run** (지역+자산+시간+임계값+모델+관측+과거사례+사용자 조건) | × | ○ (P2) |
| 모델 선택 (IFS/AIFS/GFS 비교) | × | ○ |
| SLA·전담 지원 | × | ○ |

구현: `access-mode.js` 사다리에 값 추가 없이 **org.plan_tier 를 별도 축**으로 판정한다. `TIER_RANK.business=3`은 레거시로 두고 쓰지 않는다.

---

## 6. 가격

### 6.1 소비자 — **정본 확정** (billing.sql 2026-09-02)

| 플랜 | 월 | 연 (10개월치) |
|---|---|---|
| EXPLORER | ₩9,900 | ₩99,000 |
| INTELLIGENCE | ₩29,000 | ₩290,000 |

### 6.2 B2B — **Initial Hypothesis / Pilot Pricing** (고객 인터뷰 전)

가격표보다 **계산식**을 먼저 둔다.

```
BUSINESS 월요금 = Base
               + Asset(등록 자산 수 구간)
               + Alert(월 알림 채널·건수 구간)
               + Analysis(판정 주기·변수 수)
               + History(보관 일수)
               + API(월 호출 쿼터)
```

파일럿 가설 한 점: **항만 50자산·기본 알림·90일 = 월 ₩490,000.** ENTERPRISE 는 연 계약 + Custom Run 건당, 협의.
기준점: Google Maps Weather API $0.038/1천 콜(원가 바닥), Windy Premium 연 ₩3만대(소비자 상단), Meteomatics·Solcast 기업 월 수천 달러(B2B 상단). **콜당 과금은 하지 않는다.** 파는 것은 콜이 아니라 판단이다.

---

## 7. 개발 우선순위 (2026-09-06 개정: 개인 → 기업)

**엔진은 하나다.** 개인 1개 위치 = 기업 다수 자산. 소비자 FOR ME 를 먼저 만들고, 사용 패턴을 쌓은 뒤 자산 수를 늘려 BUSINESS 로 간다.

| P | 항목 | 산출물 | 의존 |
|---|---|---|---|
| P0 | **소비자 FOR ME** (내 위치 1곳, 기본 임계값 고정, 로그인 없이 동네 고르기→브라우저 저장, 결제 시 계정 이전) | `aws/for-me/handler.py` 또는 클라이언트 샘플러, 변수 8종 | marine-grid, kma-buoy, khoa, typhoon-official, tropical-intelligence, tsunami-eta |
| P0 | Impact Result Model | §4 JSON 계약 + 실측 부이 대조 테스트 | FOR ME |
| P0 | 질문 계측 | `usage_counters` 에 `forme.<question>` 5종 | — |
| P1 | 모든 메뉴에 FOR ME 입구 | `docs/V1-V2-UPSELL-MAP-2026-09-06.md` 매핑표대로 | FOR ME |
| P1 | Billing / Entitlement | FREE_OPEN → PAID 전환, 잠금 판정 `access-mode.js` | billing.sql |
| P2 | Asset Registry (org·자산·임계값 편집) | §2 마이그레이션, `ports-kr.json` 시드 | FOR ME 안정 + 질문 데이터 2주 이상 |
| P2 | 자산별 Alert · Business Dashboard | push-tick 라우팅, org 보드 | Asset Registry |
| P3 | Custom Run · Enterprise API | 재계산 잡, 인증 API | 위 전부 |
| 선행 | **KMA 허브 키 분리** | 무료 트래픽이 유료 계산을 묵음시키지 않게 | — |

항만 고객에게 갈 때 들고 가는 것: "일반 사용자가 실제로 가장 많이 누른 질문이 이것이고, 이를 항만 50개에 적용했다."

## 8. 불가침 규칙

1. 예보를 만들지 않는다. 기관 발표는 옮기고, 우리 계산은 "추정"이라 부르며 검증 수치와 같이 낸다.
2. 공식 경보·대피·안전정보와 표시된 과학적 근거는 어떤 티어에서도 잠그지 않는다.
3. 배지(OFFICIAL / MODEL / MODEL_GUIDANCE / SIMULATION_ONLY / OBS)를 상품 카드에서 떼지 않는다.
4. 원자료를 재판매하지 않는다. 파는 것은 EARTHUS 산출물·판단·지표·리포트·알림이다.
5. 자료가 없으면 null. 데모용 가짜 자산·가짜 위험을 만들지 않는다.

---

## 9. 열린 질문

- 항만 좌표·범위 원천: 해수부 항만 기본정보 vs 직접 폴리곤. 1차는 점+반경으로 시작.
- 파고 임계값 기본값: 항만 등급별 접안 한계(관행 2.0~3.0 m). 항만 운영자 인터뷰 필요.
- 알림 채널: 웹푸시만으로 항만 운영실에 닿는가. 이메일·SMS 추가 시 비용.
- WeatherNext 3 를 파고·바람 예측 원천 후보로 넣을지. 경쟁제품 약관 검토 선행.
