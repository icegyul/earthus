# 운영 인프라 실측 — 안드로이드 앱(TWA) · 크롬 확장(새 탭) 준비도

측정: 2026-09-24 06:03~06:20 UTC(KST 15:03~15:20), 이 PC(한국)에서 curl(읽기 전용 GET/HEAD) + `aws cloudfront get-distribution-config`(읽기 전용, 프로필 earthus-deploy) + 브라우저 창 iframe 시험 1회.
아무것도 올리거나 바꾸지 않았다. 원본 출력은 `docs/app-plan-2026-09-24/survey-infra-raw/`(cors1.txt · sizes-v1.tsv · sizes-v2.tsv · v1graph.txt · v2graph.txt).

## 0. 한눈에 — 지시서가 물을 네 가지

| 질문 | 답 | 근거 |
|---|---|---|
| 확장 새 탭에서 earthus.net 을 iframe 으로 띄울 수 있나 | **된다.** 응답 헤더에 X-Frame-Options·CSP(frame-ancestors)·HSTS 가 **하나도 없고**, HTML 에 meta CSP 없음, 운영 JS 213개에 frame-busting 코드(`window.top`·`top.location`·`frameElement`·`ancestorOrigins`·`window.parent`) 0건. 다른 출처(example.com) 페이지에 iframe 으로 넣어 **v1 지구(Cesium·구름·서울 23°C)와 v2 지구(Three.js, 온보딩 모달 포함)가 둘 다 그려지는 것을 화면으로 확인** | §1, §1-1 |
| 안드로이드 TWA 준비됐나 | **아니다 — S3 키 하나가 없다.** `/.well-known/assetlinks.json` = 403(S3 AccessDenied = 키 없음). CloudFront 쪽 차단 요소는 **없다**(함수·Lambda@Edge 0, 커스텀 오류 응답 0, 기본 동작이 그대로 서울 버킷 `/app` 으로 간다). PD 가 파일 하나 올리고 무효화 한 번이면 끝 | §2 |
| 확장 페이지에서 자료를 직접 받아 WebGL 에 그리면(iframe 없이) CORS 되나 | **S3 직접 주소는 항상 된다(ACAO `*`). earthus.net 경유는 복불복이다** — 엣지 캐시가 Origin 을 키로 안 써서, 캐시 Miss 면 ACAO 가 붙고 Hit/RefreshHit 이면 빠진다(실측 11건 중 6건 빠짐). 고치는 법은 CloudFront 응답 헤더 정책(PD 실행) | §4 |
| 새 탭 한 번 열 때 드는 양 | 코드만: **v2 첫 방문 1.13 MB(93파일) / v1 2.45 MB(123파일, 그중 1.68 MB 는 jsdelivr Cesium — 1년 immutable 캐시)**. 재방문은 거의 조건부 재확인(304). 여기에 "지금 지구" 구름 그림이 **데스크톱 3.04 MB / 폰 1.51 MB, 5분마다 새로** 붙는다 | §5 |

---

## 1. 페이지 응답 헤더 (`/`, `/v2/`, `/Intelligence/`)

명령:
```bash
curl -s -o /dev/null -D - https://earthus.net/            # 전체 헤더
curl -s -o /dev/null -D - https://earthus.net/v2/
curl -s -o /dev/null -D - --compressed https://earthus.net/Intelligence/
```

| URL | 상태 | Content-Type | Cache-Control | X-Frame-Options | CSP | HSTS | 원문 크기 / br 전송 |
|---|---|---|---|---|---|---|---|
| `/` | 200 | text/html; charset=utf-8 | no-cache | **없음** | **없음** | **없음** | 93,264 / 26,024 B |
| `/v2/` | 200 | text/html; charset=utf-8 | no-cache, no-store, must-revalidate | **없음** | **없음** | **없음** | 162,092 / 44,036 B |
| `/Intelligence/` | 200 | text/html; charset=utf-8 | no-cache, no-store, must-revalidate | **없음** | **없음** | **없음** | — / 44,311 B |

`/` 전체 헤더(그대로):
```
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 93264
Server: AmazonS3
Last-Modified: Wed, 23 Sep 2026 14:35:47 GMT
ETag: "4b2ae74bc8352db126b36f26b152d00e"
Cache-Control: no-cache
x-amz-server-side-encryption: AES256
X-Cache: Miss from cloudfront
Via: 1.1 ….cloudfront.net (CloudFront)
X-Amz-Cf-Pop: ICN53-P1
Alt-Svc: h3=":443"; ma=86400
```
`/v2/` 도 보안 헤더가 없다는 점은 같다(ETag `82dd6796…`, X-Cache RefreshHit). CloudFront 설정 실측과 일치: **모든 동작의 ResponseHeadersPolicyId = None**(§2-1 표).

- `/v2/` 와 `/Intelligence/` 는 **서로 다른 S3 객체**다(ETag `82dd6796…` vs `f9c9d6d6…`, Last-Modified 22:20:49 vs 22:20:51). 앱은 canonical 인 `/v2/`(HTML `<link rel="canonical" href="https://earthus.net/v2/">`)를 쓰는 것이 맞다.
- `http://` → `301` → `https://` (CloudFront `redirect-to-https`). `www.earthus.net` 은 **리다이렉트 없이 같은 내용 200**(같은 배포의 별칭).

### 1-1. iframe 실화면 시험 (결과)
- 방법: 브라우저 창에서 `https://example.com/` 을 열고 그 페이지 DOM 에 `<iframe src="https://earthus.net/">`·`<iframe src="https://earthus.net/v2/">` 를 넣음(교차 출처 부모 = 확장 새 탭과 같은 조건: 부모 출처 ≠ earthus.net). 사이트는 건드리지 않음.
- 결과: **v1** — 지구·구름·"오후 3:12 · 9월 24일 · 인천 · 23°C · 최고 23 / 최저 16" 과 출처 줄(NOAA GMGSI · 기상청…)까지 그려짐. **v2** — Three.js 지구 + "EARTHUS / Intelligence" 전환 단추 + 첫 방문 온보딩 모달("지구 보러 가기")이 그려짐.
- 주의(미검증 — 확장 시제품에서 확인할 것): 크롬은 iframe 안 저장소(localStorage·쿠키)를 최상위 사이트별로 나눈다. 확장 새 탭 속 earthus.net 은 **일반 탭과 로그인·온보딩 완료 상태를 공유하지 않을 수 있다**(→ 새 탭에서 로그인이 풀려 보이거나 온보딩이 다시 뜸). 확장이 earthus.net 에 host_permissions 를 가지면 분할이 풀린다는 크롬 문서 서술이 있으나 이번에 실측하지 않았다.

## 2. Digital Asset Links (`/.well-known/assetlinks.json`)

```bash
curl -s -D - https://earthus.net/.well-known/assetlinks.json
curl -s -D - https://earthus.net/nonexistent-probe-xyz.json      # 대조군: 없는 키
```
```
HTTP/1.1 403 Forbidden
Content-Type: application/xml
Server: AmazonS3
X-Cache: Error from cloudfront

<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>
```
대조군(없는 일반 경로)도 **똑같이 403 AccessDenied**. → 403 은 "점(.)으로 시작하는 경로를 막아서"가 아니라 **그 키가 없어서**다(OAC 로 읽는 S3 는 ListBucket 권한이 없으면 없는 키에 404 대신 403 을 준다).

### 2-1. CloudFront 설정 실측 (배포 E193CZEBLWEB56, 읽기 전용 조회)
```
DEFAULT            origin=s3-app-seoul  cachePol=658327ea-… origReqPol=None respHdrPol=None fn=[] lambda=[]
/tourism/* /v2/data/current-earth/* /aetherus/* /v2/aetherus/*   origin=s3-app (오하이오 /app)  같은 정책, fn=[] lambda=[]
/wind/* /events/* /ocean/* /solar/* /clouds/* /celestrak/*       origin=s3-data (오하이오 루트)  같은 정책, fn=[] lambda=[]
/api/*             origin=lambda-llm    cachePol=4135ea2d-… origReqPol=b689b0a8-…
ORIGIN s3-app-seoul  earthus-app-seoul.s3.ap-northeast-2.amazonaws.com  OriginPath=/app  (OAC)
ORIGIN s3-data       earthus-cache-kr.s3.us-east-2.amazonaws.com        OriginPath=""    (OAC)
CustomErrorResponses: Quantity 0 · DefaultRootObject: index.html · Aliases: www.earthus.net, earthus.net · HttpVersion: http2and3
```
- CloudFront Function·Lambda@Edge **0개**, 커스텀 오류 응답 **0개** → `/.well-known/…` 은 기본 동작(서울 버킷 `/app`)으로 그대로 간다. **막는 것은 없다.**
- `658327ea-f89d-4fab-a63d-7e88639e58f6` 는 AWS 관리형 **CachingOptimized** 정책의 공개 ID 와 같다(이름 조회 `get-cache-policy` 는 earthus-deploy 에 권한 없음 → AccessDenied, 그래서 ID 로만 확인). 이 정책은 헤더·쿠키·**쿼리 문자열**을 캐시 키에 넣지 않는다(§4 의 CORS 흔들림 원인, 그리고 `?v=`·`?t=` 가 엣지 캐시를 나누지 못한다는 뜻 — 참고).

### 2-2. PD 가 실행할 변경 (정확히 이것만)
1. S3 객체 하나: `s3://earthus-app-seoul/app/.well-known/assetlinks.json` (리전 ap-northeast-2)
   - `--content-type "application/json"` · `--cache-control "no-cache"`(또는 짧은 max-age)
   - 내용: `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"<앱 패키지명>","sha256_cert_fingerprints":["<Play 앱 서명 인증서 SHA-256>"]}}]`
   - ⚠️ 지문은 **Play Console 의 "앱 서명 키"** 것(업로드 키 아님 — 흔한 함정. 둘 다 넣어도 된다).
2. 무효화: `/.well-known/assetlinks.json` (지금 403 이 엣지에 잠깐 캐시될 수 있음).
3. 확인 결과 기준: `curl -sI https://earthus.net/.well-known/assetlinks.json` → `200` · `Content-Type: application/json` · 리다이렉트 없음. 그리고 `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://earthus.net&relation=delegate_permission/common.handle_all_urls` 가 앱을 돌려줌.
- 같은 배포에 www 별칭이 있으므로 **같은 객체가 `www.earthus.net/.well-known/…` 에서도 나간다**(별도 작업 불필요). 앱 intent-filter host 는 `earthus.net` 하나로 둔다.
- 운영 CloudFront/S3 변경은 PD 실행 사항(AGENTS·메모리). 이 조사에서는 올리지 않았다.

## 3. 매니페스트·서비스워커·아이콘

```bash
for u in manifest.webmanifest sw.js icon-192.png icon-512.png v2/manifest.webmanifest; do curl -s -o /dev/null -D - --compressed https://earthus.net/$u; done
```
| URL | 상태 | Content-Type | 크기 | Cache-Control |
|---|---|---|---|---|
| `/manifest.webmanifest` | 200 | application/manifest+json | 940 B | no-cache |
| `/sw.js` | 200 | text/javascript; charset=utf-8 | 원문 12,578 B / br 4,994 B | no-cache |
| `/icon-192.png` | 200 | image/png | 3,075 B | (없음) |
| `/icon-512.png` | 200 | image/png | 9,105 B | (없음) |
| `/v2/manifest.webmanifest` | **200 (예상과 다름)** | application/manifest+json | 940 B | no-cache |

- v1 매니페스트: `name "earthus — 지금 지구"`, `start_url "./index.html"`, `scope "./"`, `display "standalone"`, `theme_color #02060c`, `background_color #000000`, 아이콘 192·512(any) + 512(maskable, **같은 파일 재사용**) + svg.
- `/v2/manifest.webmanifest` 는 **v1 매니페스트의 바이트 동일 사본**이다(ETag `ed35cedc2a4397e7e5c96678ef8fcc0c` 같음, 이름도 "earthus — 지금 지구"). 그런데 **v2 HTML 은 매니페스트를 링크하지 않고 서비스워커도 등록하지 않는다**(`/v2/` HTML 에서 `manifest`·`serviceWorker` 0건). 즉 v2 는 지금 설치형 PWA 가 아니다.
- 서비스워커: v1 `index.html:1400` `navigator.serviceWorker.register('sw.js', { scope: './' })` → 범위는 사이트 루트. 그러나 fetch 핸들러가 **`/v2`·`/Intelligence`·`/v3`… 요청은 손대지 않고 통과**시킨다(sw.js 92행). 같은 출처 html·js·css 는 `fetch(req, { cache: 'no-cache' })` — 조건부 재확인(304)이고 매번 전체 재다운로드는 아니다(파일 머리 주석의 "cache:'reload'" 는 옛 설명, 실제 코드는 no-cache).
- **"앱 하나에 v1+v2" 결정에 대한 뜻**: TWA 검증은 출처(earthus.net) 단위라, 시작 URL `/` 하나로 열어도 `/v2/` 로 넘어갈 때 전체화면(주소창 없음)이 유지된다. 매니페스트 `scope "./"`(=`/`)도 `/v2/` 를 덮는다. v2 전용 매니페스트는 앱에 필요 없다.

## 4. 자료 CORS — 확장 새 탭 기준

명령(각 URL을 earthus.net 경유와 S3 직접 두 갈래로):
```bash
O='chrome-extension://abcdefghijklmnopabcdefghijklmnop'
curl -s -o /dev/null -D - -H "Origin: $O" -H 'Accept-Encoding: br, gzip' "https://earthus.net$p"
curl -s -o /dev/null -D - -H "Origin: $O" -H 'Accept-Encoding: br, gzip' "https://earthus-cache-kr.s3.us-east-2.amazonaws.com$p"
```
URL 은 v2 코드에서 골랐다(`prototype/v2-three/js/main.js:1448-1449` `S3_DIRECT`/`DATA_BASE`, `loadGmgsi` 1624행, `/events/kma-warn.json` 3791행, GFS 예보 manifest 의 `steps[].temp/file`, v1 `js/layers/regional.js:59` quake-asia).

| 경로 | earthus.net: ACAO | X-Cache | 전송 바이트(br) | Cache-Control | Last-Modified | S3 직접: ACAO / 바이트 |
|---|---|---|---|---|---|---|
| /clouds/meta.json | `*` | Miss | 902 | public, max-age=300 | 05:45:25 | `*` / 902 |
| /clouds/global-2048.webp | `*` | Miss | 1,505,406 | public, max-age=300 | 05:45:25 | `*` / 1,505,406 |
| /clouds/gfs-fc/manifest.json | **없음** | RefreshHit | 6,026 | public, max-age=300 | 04:12:19 | `*` / 31,489 |
| /clouds/gfs-fc/2026092400/t000.png (기온) | `*` | Miss | 81,468 | public, max-age=86400, immutable | 04:10:35 | `*` / 81,468 |
| /clouds/gfs-fc/2026092400/c000.png (구름) | `*` | Miss | 214,671 | public, max-age=86400, immutable | 04:10:33 | `*` / 214,671 |
| /events/kma-warn.json | **없음** | Hit, Age 47 | 852 | public, max-age=300 | 06:02:22 | `*` / 1,319 |
| /events/typhoon-official.json | `*` | Miss | 1,918 | no-cache | 05:25:51 | `*` / 8,594 |
| /events/quake-asia.json | **없음** | Hit, Age 47 | 2,773 | public, max-age=60 | 05:57:03 | `*` / 22,674 |
| /wind/kma-aws.json | **없음** | Hit, Age 37 | 8,033 | public, max-age=600 | 05:25:40 | `*` / 46,041 |
| /ocean/earthquake-intel.json | **없음** | RefreshHit | 5,211 | public, max-age=900 | 03:41:41 | `*` / 98,247 |
| /celestrak/catalog.json.gz | **없음** | Hit, Age 2595 | 1,629,306 (gzip 객체) | public, max-age=3600 | 09-23 18:01:22 | `*` / 1,629,306 |

(시각은 모두 2026-09-24 GMT, 따로 적은 것 제외.) S3 직접 응답은 전부 `Access-Control-Allow-Origin: *` · `Access-Control-Allow-Methods: GET, HEAD` · `Vary: Origin, …` · `Access-Control-Max-Age: 86400`.

**해석**
- earthus.net 경유: **Miss 5건은 ACAO 있음, Hit/RefreshHit 6건은 ACAO 없음.** 엣지 캐시 키에 Origin 이 없어서, 그 객체를 처음 엣지에 채운 요청이 Origin 을 보냈는지에 따라 헤더가 붙었다 빠졌다 한다. 운영 웹은 같은 출처라 Origin 없이 받으므로 대개 "ACAO 없는 사본"이 캐시돼 있다. 이 함정은 이미 코드 주석에 있다(`main.js:1443` "CloudFront 는 Origin 을 캐시 키에 넣지 않아 CORS 헤더가 붙었다 안 붙었다 한다").
- S3 직접: 항상 ACAO `*` 이지만 **br 압축 없음·한국 엣지 캐시 없음·오하이오 TLS 새로 맺음**(예: gfs manifest 6,026 B → 31,489 B, earthquake-intel 5,211 B → 98,247 B, 응답 0.6~1.0초 vs 엣지 Hit 0.04초).
- 설계 갈래별 결론
  - **iframe 새 탭**(earthus.net 을 통째로 넣기): iframe 문서의 출처가 earthus.net 이라 자료 요청은 같은 출처 → **CORS 무관, 지금 그대로 동작**(§1-1 에서 확인).
  - **확장 자체 페이지**(자료만 받아 확장 안에서 그리기): 코드의 `location.hostname.endsWith('earthus.net')` 가 거짓이 되어 `DATA_BASE` 가 자동으로 S3 직접이 된다 → CORS 는 항상 통과, 대신 위의 압축·지연 손해. MV3 에서 `host_permissions` 가 있으면 확장 출처의 `fetch()` 는 CORS 와 무관하게 읽힌다 — WebGL 텍스처는 `fetch → blob → createImageBitmap` 로 올리면 캔버스 오염 없이 쓸 수 있다. `<img crossOrigin>` 로 earthus.net 이미지를 직접 올리면 ACAO 가 빠진 캐시본에서 **로드 자체가 실패**한다.
  - MV3 는 원격 코드 실행을 금지한다 — 확장 자체 페이지 갈래라면 three.js·앱 모듈을 **확장 패키지에 넣어야** 한다(earthus.net/v2/js/*.js 를 `<script src>` 로 못 씀). iframe 갈래는 해당 없음.
- **earthus.net 경유 CORS 를 확정적으로 만들려면(PD 실행, 선택)**: 데이터 동작 6개(`/wind/* /events/* /ocean/* /solar/* /clouds/* /celestrak/*`)에 **CORS 응답 헤더 정책**을 붙인다(관리형 `SimpleCORS` 또는 `CORS-With-Preflight`) → 엣지가 캐시 상태와 무관하게 ACAO 를 찍는다.
  ⚠️ **`…-and-SecurityHeadersPolicy` 붙은 관리형 정책은 고르지 말 것** — `X-Frame-Options: SAMEORIGIN` 이 붙어 iframe 새 탭이 깨진다(데이터 동작에만 붙이면 페이지엔 영향 없지만, 같은 정책을 기본 동작에 재사용하는 순간 깨진다).
- 제3자 출처(v1 이 직접 부름, Origin 헤더 붙여 확인): USGS `all_day.geojson` ACAO `*`(max-age=60) · jsdelivr Cesium.js ACAO `*`(1년 immutable) · NASA GIBS WMTS ACAO `*`(max-age=1800). 확장 자체 페이지 갈래라면 이 셋도 host_permissions 에 넣는다.

## 5. 새 탭 한 번 열 때의 양 (첫 화면 코드)

방법: 운영 HTML 에서 `<script>`·stylesheet·modulepreload 를 뽑고, 진입 모듈부터 **정적 import 그래프**를 운영 서버에서 따라가 전부 모음(`scratchpad/crawl.mjs`, 동적 `import()` 는 제외). 각 파일을 `Accept-Encoding: br, gzip` 로 받아 전송 바이트, 압축 없이 받아 원문 바이트를 셈.

| | 파일 수 | 전송(br/gzip) | 원문 | 비고 |
|---|---|---|---|---|
| **v2** (`/v2/` + earth-switch.js + 정적 import 91개) | 93 | **1,134,210 B (1.13 MB)** | 3,533,949 B | 전부 earthus.net |
| **v1** (`/` + CSS 9 + Cesium.js·satellite.js·widgets.css + earth-switch·app-bar + 정적 import 108개) | 123 | **2,452,482 B (2.45 MB)** | 8,170,157 B | 그중 jsdelivr 3개 1,683,493 B / earthus.net 120개 768,989 B |

큰 파일(전송 바이트):
- v2: `v2/js/main.js?v=206-flood` 133,668(원문 433,733) · `v2/vendor/three.core.min.js` 93,966 · `v2/vendor/three-r184.module.min.js` 81,497 · `live-layers.js` 65,585 · `ui-shell.js` 46,484 · `flood-overlay.js` 46,392 · `/v2/` HTML 44,036
- v1: jsdelivr `Cesium.js` 1,665,699(원문 5,909,848) · `css/app.css` 54,547 · `js/ui.js` 41,144 · `js/layers/imagery.js` 32,118 · `/` HTML 26,024 · `js/main.js` 20,956

재방문(두 번째 새 탭부터) 캐시 정책 실측:
- v2: `main.js?v=…` `public, max-age=60` · `vendor/three*.js` `public, max-age=86400, stale-while-revalidate=604800` · 일부 모듈 `no-cache, max-age=0, must-revalidate` · HTML `no-cache, no-store, must-revalidate`(매번 전체 44 KB).
  → 60초 넘으면 모듈 약 90개가 조건부 재확인(304) — 바이트는 작지만 요청 수는 그대로.
- v1: earthus.net html·js·css 전부 `no-cache` + 서비스워커가 `cache:'no-cache'` 로 매번 조건부 재확인(304). Cesium·satellite.js 는 jsdelivr `max-age=31536000, immutable` 이라 두 번째부터 0 B.

"지금 지구" 첫 화면에 붙는 자료(코드와 별도):
- 관측 구름 `clouds/global.webp` 3,038,104 B(데스크톱, `CLOUD_STYLE='split'` — 이 값은 `clouds/meta.json` variants 기재값, 직접 받아 재지는 않음) 또는 `global-2048.webp` 1,505,406 B(폰) — `max-age=300`, 매시 갱신이라 **새 탭을 자주 열면 5분마다 다시 받는다**. meta.json 902 B.
- GFS 예보 한 시각: 구름 c 214,671 + 기온 t 81,468 + 기압 m 44,764 + 10m 바람 u 227,517 B(`immutable`, 한 번 받으면 끝).
- 위성 카탈로그 `celestrak/catalog.json.gz` 1,629,306 B(`max-age=3600`) — 첫 화면에 필요한지 지시서에서 정할 것.
- 참고: 기존 폰 LTE 실측(과제 전달값) v2 첫 로딩 2.2 초 / 전체 8 MB, v1 3.1 초 / 6.1 MB. 새 탭을 열 때마다 이 전체가 도는 구조면 **발열·데이터 규칙(HANDOVER §5, 무한 애니메이션 금지)** 과 부딪힌다 — 새 탭은 한 장 그림 + 멈춘 지구로 시작하는 가벼운 모드가 필요하다는 근거.

## 6. 요약 — PD 결정·실행이 필요한 것

1. (TWA 필수) `s3://earthus-app-seoul/app/.well-known/assetlinks.json` 올리기 + 무효화 — §2-2. CloudFront 설정 변경은 필요 없음.
2. (선택, 확장 자체 페이지 갈래일 때) 데이터 동작 6개에 CORS 응답 헤더 정책 — §4. SecurityHeaders 계열 금지.
3. (결정) 새 탭 = iframe(오늘 바로 됨, 탭마다 1.1~2.5 MB 코드 + 구름 1.5~3 MB) vs 확장 자체 페이지(코드 패키지 동봉, 자료만 받음, S3 직접 또는 2번 뒤 earthus.net).
4. (확인 필요) 확장 iframe 안 로그인·온보딩 저장소 분할 — 시제품에서 실측.
