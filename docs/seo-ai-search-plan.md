# SEO·AI 검색 노출 계획 (조사 + 설계, 2026-07-31)

> 코딩 안 함. 계획만. 실행은 [build-order.md](build-order.md) 우선순위에 편입.

---

## 0. 지금 상태 점검

### 이미 되어 있는 것

| 항목 | 상태 | 위치 |
|---|---|---|
| `robots.txt` | ✅ 있음 — 자료 디렉토리(`/wind/` `/events/` 등) 색인 차단, `/`만 허용 | [robots.txt](../prototype/robots.txt) |
| `sitemap.xml` | ✅ 있음 — SPA라 항목 1개(`/`)만, 존재하지 않는 주소 안 채움 | [sitemap.xml](../prototype/sitemap.xml) |
| OG/Twitter 메타 | ✅ 있음 — 절대경로 PNG, 1200×630 비율까지 맞춤 | [index.html:20-38](../prototype/index.html#L20) |
| `canonical` | ✅ 있음 | index.html |
| `manifest.webmanifest` | ✅ 있음 — PWA 설치용 | manifest.webmanifest |

### 빠진 것 — 그리고 왜 중요한가

**🔴 가장 큰 문제: `<body>`가 빈 `<div>`로 시작한다.**

```html
<body>
<div id="cesiumContainer"></div>
<div class="overlay">...</div>  ← 전부 JS가 나중에 채움
```

- Earthus는 Cesium/WebGL 기반 SPA다. 실제 텍스트 콘텐츠(설명, 기능 목록)는 전부 자바스크립트 실행 후에만 나타난다
- **Google은 JS를 실행하지만**, 실행 대기열이 따로 있어 색인이 느리고 실패할 수 있다 (공식 권고도 "가능하면 서버 렌더링/프리렌더링을 하라")
- **AI 검색 크롤러 대부분은 자바스크립트를 아예 실행하지 않는다** — GPTBot(OpenAI)·ClaudeBot(Anthropic)·PerplexityBot·Google-Extended(AI Overviews용) 전부 정적 HTML만 읽는다
  → **지금 이 크롤러들 눈에 earthus는 `<head>`의 메타 설명 두 줄 말고는 아무것도 없는 빈 페이지다**
- 즉 지금 상태로는 ChatGPT/Perplexity 같은 데서 "지구 관측 데이터 서비스 추천해줘" 질문에 **원천적으로 인용될 자료가 없다**

**구조화 데이터(JSON-LD) 없음** — Google 리치결과·AI 답변엔진 둘 다 `schema.org` 마크업이 있으면 신뢰도 있는 사실로 더 잘 인용한다. 지금은 전혀 없음

**AI 크롤러에 대한 명시적 정책 없음** — 지금 `robots.txt`는 `Disallow` 목록에 AI 크롤러를 특정하지 않았으니 **묵시적으로는 허용**이지만, 명시하지 않으면 나중에 실수로 막힐 수 있고 의도가 문서화되지 않는다

---

## 1. 제안 — 우선순위별

### 🔴 A. 정적 텍스트 폴백 블록 (가장 중요)

- `<body>` 최상단(또는 `<noscript>`)에 **자바스크립트 없이도 보이는 텍스트**를 넣는다:
  서비스 설명, 핵심 기능 3~5개, "무엇을 볼 수 있는가"를 문장으로
- ⚠️ 화면에는 안 보이게(0px 높이 등) 처리하되 **숨김 스팸으로 보이지 않게** 주의 —
  구글은 "사용자에게 안 보이고 크롤러에만 보이는 텍스트"를 스팸으로 간주할 수 있다.
  가장 안전한 방법은 `<noscript>` 태그(자바스크립트 꺼진 사용자에게도 실제로 보이므로 스팸 판정 위험이 없음) 또는
  인트로 화면(로딩 중 실제로 사용자에게도 보이는 문구)에 자연스럽게 포함하는 것
- 이건 AI 검색 노출의 **전제조건**이다 — 이게 없으면 아래 항목들이 다 무의미하다

### 🟠 B. JSON-LD 구조화 데이터

- `schema.org` `WebApplication` 또는 `Organization` 타입으로 서비스명·설명·카테고리 명시
- 정적 `<head>`에 넣으면 되므로 A와 별개로 구현 가능 (JS 실행 여부 무관)

### 🟠 C. robots.txt에 AI 크롤러 정책 명시

- GPTBot·ClaudeBot·PerplexityBot·Google-Extended·CCBot 등을 명시적으로 `Allow` (지금의 묵시적 허용을 문서화)
- ⚠️ [disaster-safety-plan.md](disaster-safety-plan.md) 조사 중 발견한 사례 참고 — space.skyrocket.de는 robots.txt로 AI 크롤러를 **명시적으로 차단**하고 있었다. 우리는 반대 방향(허용)을 의도적으로 선택하는 것이므로, 그 의도를 robots.txt 주석에 남긴다

### 🟢 D. llms.txt (선택, 아직 비공식 표준)

- 최근 일부 서비스가 도입 중인 `/llms.txt` — AI가 사이트를 요약해서 읽기 쉽게 만든 텍스트 파일
- 공식 표준은 아니라서 효과가 검증되진 않았지만, 비용이 거의 없다 (마크다운 텍스트 파일 하나)
- 우선순위는 낮음 — A·B·C가 먼저

### 🟢 E. FAQ형 콘텐츠

- AI 답변엔진은 질문-답변 형식을 특히 잘 인용한다 ("earthus는 무엇인가요?", "무료인가요?", "어떤 자료를 보여주나요?")
- A(정적 텍스트 블록)에 자연스럽게 포함 가능 — 별도 항목이 아니라 A의 내용 설계 방식

---

## 2. 실행 순서

```
1순위 A  정적 텍스트 폴백 — 이게 없으면 나머지가 다 무의미. <noscript> 우선 검토
2순위 B  JSON-LD 구조화 데이터 — <head>에 추가, JS 무관
3순위 C  robots.txt AI 크롤러 정책 명시
4순위 E  FAQ형 문구 — A 작성 시 같이 설계
5순위 D  llms.txt — 여유 있을 때
```

**A+B+C는 정적 파일 수정만으로 가능 — 오픈(8/4) 전에 끼워 넣어도 큰 리스크가 없다** (신기능이 아니라 기존 배포 파이프라인의 텍스트/메타 추가일 뿐).
