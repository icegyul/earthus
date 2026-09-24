# CloudFront Function — www.earthus.net → https://earthus.net (301)

> 2026-09-24 · 앱 지시서 D18(`docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md` §3-2 host 행, §6 D18).
> **코드만 여기 있다. 운영에 올리고 배포(E193CZEBLWEB56)에 붙이는 것은 PD 가 한다.** 이 저장소의 누구도 아래 명령을 대신 실행하지 않는다
> (AGENTS.md · 기억 `never-run-deploy-to-test`).

## 무엇이 바뀌나 (화면)

- 지금: `https://www.earthus.net/v2/` 를 열면 주소창에 **www 가 남은 채** 같은 화면이 뜬다(200). 로그인·설정(localStorage)은 apex 와 따로 논다.
- 적용 뒤: 주소창이 곧바로 `https://earthus.net/v2/` 로 바뀐다(301). 쿼리(`?tab=my&event=…`, `?tc=`, `?station=`)와 경로는 그대로 따라간다.
- 안드로이드 앱(TWA)의 App Link 는 host `earthus.net` 하나만 주장한다. 이 리다이렉트가 있어야 www 로 공유된 링크도 결국 앱이 받는 주소가 된다.

## 파일

| 파일 | 무엇 |
|---|---|
| `www-to-apex.js` | 함수 본문(viewer-request, `cloudfront-js-2.0`). 모듈이 아니라 스크립트 — `export` 없음 |
| `test-event-www.json` | `test-function` 에 넣는 시험 이벤트(www · `/v2/` · 쿼리 3개, 그중 하나는 중복 키) |
| `test_www_to_apex.mjs` | 로컬 시험: `node --test tools/cloudfront/test_www_to_apex.mjs` (7건) |

## PD 실행 순서 (정확히 이것만)

전제: Git Bash, 저장소 루트에서 실행. `aws` 는 CloudFront 쓰기 권한이 있는 로그인(기억 `aws-login-session-quirks` — root login 은 첫 호출이 실패하고 재시도하면 된다). 아래 `--profile` 은 PD 환경에 맞게 붙인다.

### 0) 지금 상태 확인 (읽기만)

```bash
curl -sI "https://www.earthus.net/v2/?tab=my" | head -5          # 기대: HTTP/2 200 (아직 리다이렉트 없음)
aws cloudfront get-distribution-config --id E193CZEBLWEB56 \
  --query 'DistributionConfig.DefaultCacheBehavior.FunctionAssociations' --output json
# 기대: {"Quantity": 0}  ← 0 이 아니면 멈추고 개발에 알린다(이미 붙은 함수를 덮어쓰면 안 된다)
```

### 1) 함수 만들기 (DEVELOPMENT 단계 — 아직 어느 배포에도 안 붙는다)

```bash
aws cloudfront create-function \
  --name earthus-www-to-apex \
  --function-config '{"Comment":"www.earthus.net -> https://earthus.net 301 (D18)","Runtime":"cloudfront-js-2.0"}' \
  --function-code fileb://tools/cloudfront/www-to-apex.js
ETAG=$(aws cloudfront describe-function --name earthus-www-to-apex --stage DEVELOPMENT --query ETag --output text)
echo "$ETAG"
```

### 2) 운영 전 시험 (AWS 안에서, 배포에 영향 없음)

```bash
aws cloudfront test-function --name earthus-www-to-apex --if-match "$ETAG" --stage DEVELOPMENT \
  --event-object fileb://tools/cloudfront/test-event-www.json \
  --query 'TestResult.[FunctionErrorMessage,FunctionOutput]' --output text
```

기대: 오류 칸 비어 있음, 출력에 `"statusCode":301` 과
`"location":{"value":"https://earthus.net/v2/?tab=my&q=a%26b&layer=clouds&layer=wind"}`.

### 3) 퍼센트 인코딩 확인 (UNVERIFIED 한 가지) — 4) 를 마친 뒤 5) 와 함께 실행

AWS 문서(functions-event-structure, 2026-09-24 읽음)는 이벤트의 쿼리 값이 **인코딩된 원문인지 풀린 값인지** 적지 않는다.
함수는 받은 값을 다시 인코딩하지 않고 그대로 붙인다. 4) 뒤 실제 요청으로 확인한다:

```bash
curl -sI "https://www.earthus.net/?q=a%26b&x=%ED%95%9C" | grep -i '^location'
# 기대: location: https://earthus.net/?q=a%26b&x=%ED%95%9C
# 만약 q=a&b 처럼 풀려서 나오면 → 아래 「되돌리기」 후 개발에 알린다(쿼리 값을 encodeURIComponent 로 감싸야 한다는 뜻)
```

### 4) 게시(LIVE) → 배포 기본 동작에 연결

```bash
aws cloudfront publish-function --name earthus-www-to-apex --if-match "$ETAG"
ARN=$(aws cloudfront describe-function --name earthus-www-to-apex --stage LIVE \
  --query 'FunctionSummary.FunctionMetadata.FunctionARN' --output text)
echo "$ARN"

mkdir -p build/cloudfront
aws cloudfront get-distribution-config --id E193CZEBLWEB56 > build/cloudfront/earthus-dist.json
DETAG=$(node -e "console.log(JSON.parse(require('fs').readFileSync('build/cloudfront/earthus-dist.json','utf8')).ETag)")
node -e "
const fs=require('fs'); const j=JSON.parse(require('fs').readFileSync('build/cloudfront/earthus-dist.json','utf8')); const c=j.DistributionConfig;
const fa=c.DefaultCacheBehavior.FunctionAssociations;
if (fa && fa.Quantity) { console.error('이미 함수가 붙어 있다 — 멈춘다', JSON.stringify(fa)); process.exit(1); }
c.DefaultCacheBehavior.FunctionAssociations={Quantity:1,Items:[{FunctionARN:process.argv[1],EventType:'viewer-request'}]};
fs.writeFileSync('build/cloudfront/earthus-dist-config.json', JSON.stringify(c));
console.log('ok');" "$ARN"
aws cloudfront update-distribution --id E193CZEBLWEB56 --if-match "$DETAG" \
  --distribution-config file://build/cloudfront/earthus-dist-config.json --query 'Distribution.Status' --output text
# 기대: InProgress  → 몇 분 뒤 Deployed
```

⚠️ 기본 동작(DefaultCacheBehavior)에만 붙인다. `/events/*`·`/clouds/*` 같은 자료 경로의 www 요청은 계속 200 이다 —
사람이 여는 화면(HTML)은 전부 기본 동작이라 목적은 이것으로 충분하다. 자료 경로까지 막을지는 따로 정한다.

### 5) 확인 (관찰 가능한 결과)

```bash
aws cloudfront get-distribution --id E193CZEBLWEB56 --query 'Distribution.Status' --output text   # Deployed
curl -sI "https://www.earthus.net/v2/?tab=my" | grep -iE '^(HTTP|location)'
# 기대: HTTP/2 301 · location: https://earthus.net/v2/?tab=my
curl -sI "https://earthus.net/v2/?tab=my" | head -1          # 기대: HTTP/2 200 (apex 는 그대로)
curl -sI "https://earthus.net/.well-known/assetlinks.json" | head -1   # apex 는 리다이렉트 없음(앱 검증 조건)
```

브라우저로 `www.earthus.net` 을 열면 주소창이 `earthus.net` 으로 바뀌면 성공이다.

### 되돌리기

```bash
mkdir -p build/cloudfront
aws cloudfront get-distribution-config --id E193CZEBLWEB56 > build/cloudfront/earthus-dist.json
DETAG=$(node -e "console.log(JSON.parse(require('fs').readFileSync('build/cloudfront/earthus-dist.json','utf8')).ETag)")
node -e "const fs=require('fs');const c=JSON.parse(require('fs').readFileSync('build/cloudfront/earthus-dist.json','utf8')).DistributionConfig;
c.DefaultCacheBehavior.FunctionAssociations={Quantity:0};fs.writeFileSync('build/cloudfront/earthus-dist-config.json',JSON.stringify(c))"
aws cloudfront update-distribution --id E193CZEBLWEB56 --if-match "$DETAG" --distribution-config file://build/cloudfront/earthus-dist-config.json
```

301 은 브라우저가 기억한다. 함수는 `cache-control: max-age=86400`(하루)을 붙여, 되돌린 뒤 하루 안에 브라우저 기억도 풀리게 했다.

## 알고 있어야 할 대가

- www 로 쓰던 사람은 한 번 로그인이 풀린 것처럼 보인다(localStorage·세션이 apex 쪽에 없다). 의도한 결과다 — 출처를 하나로 모으는 것이 목적이다.
- Supabase Auth 의 Redirect URL 허용 목록에는 `https://earthus.net/**` 가 있어야 한다. www 항목은 적용 1주 뒤 지워도 된다(그 전에는 남겨 둔다 — 이미 www 에서 시작된 로그인 왕복이 끊기지 않게).
- www 의 `/.well-known/assetlinks.json` 도 301 이 된다. 앱은 host `earthus.net` 하나만 주장하므로 영향이 없다.
