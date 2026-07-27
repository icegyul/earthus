# AWS 구성 — earthus

## 지금 돌아가는 것

| 자원 | 위치 | 역할 |
|---|---|---|
| Lambda `celestrak-proxy` | ap-northeast-2 | CelesTrak GP + SATCAT 을 조인해 카탈로그 생성 |
| S3 `earthus-cache-kr` | **us-east-2** | 카탈로그 캐시. 앱은 여기서 직접 읽는다 |
| EventBridge `earthus-celestrak-daily` | ap-northeast-2 | 매일 UTC 18:00 (한국 새벽 3시) Lambda 호출 |

공개 URL — `https://earthus-cache-kr.s3.us-east-2.amazonaws.com/celestrak/catalog.json.gz`
(1.68MB, gzip. 브라우저가 `Content-Encoding: gzip` 을 보고 알아서 푼다)

앱은 Lambda 를 요청 경로에 두지 않는다. S3 에서 바로 읽으므로 응답이 ~50ms 다.
Lambda 는 하루 한 번 EventBridge 가 깨울 때만 돈다.

---

## ⚠️ 남은 수동 작업 — S3 CORS

**이걸 안 하면 앱이 카탈로그를 못 받는다.** 브라우저가 다른 오리진(S3)에서 받아오려면
S3 가 `Access-Control-Allow-Origin` 헤더를 줘야 하는데, 기본값은 헤더를 안 준다.

`earthus-deploy` 사용자에게 `s3:PutBucketCORS` 권한이 없어서 CLI 로는 못 한다
(정책을 처음 쓸 때 빠뜨린 항목이다). 콘솔에서 한 번만 넣으면 된다.

### 콘솔 경로

S3 → 버킷 `earthus-cache-kr` → **권한** 탭 → 맨 아래 **CORS(교차 오리진 리소스 공유)** → 편집

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Encoding", "Last-Modified", "ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

`AllowedOrigins: ["*"]` 는 이 버킷의 `celestrak/*` 가 어차피 공개 데이터라서 괜찮다.
**대신 이 버킷의 `celestrak/` 아래에는 비공개 데이터를 절대 두지 말 것.**

### 확인

```bash
curl -s -I -H 'Origin: http://localhost:8799' 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com/celestrak/catalog.json.gz' | grep -i access-control
```

`access-control-allow-origin: *` 가 나오면 된 것이다.

### CORS 전까지의 동작

앱은 죽지 않는다. `space.js` 의 `refresh()` 가 CelesTrak 직접 호출로 폴백한다
(`orbits.source` 가 `'celestrak'` 이면 폴백 중이라는 뜻).
다만 폴백 경로에는 **SATCAT 조인이 없어서** 소유국·발사일·발사장·크기·운용상태가 전부 빠지고,
CelesTrak rate limit 때문에 **스타링크(10,776)·전체(16,123)는 아예 안 받아진다.**

---

## deploy 사용자 정책에 추가하면 좋을 항목

다음에 정책을 손볼 때 같이 넣어두면 CORS 도 CLI 로 관리된다.

```json
{
  "Effect": "Allow",
  "Action": ["s3:GetBucketCORS", "s3:PutBucketCORS"],
  "Resource": "arn:aws:s3:::earthus-cache-kr"
}
```

`events:ListTargetsByRule` 도 빠져 있다 (규칙 생성·연결은 되는데 확인만 안 된다).

---

## 앱 호스팅 — 아직 안 올라감

지금 AWS 에 있는 건 **데이터뿐**이다. 앱(HTML/JS/CSS)은 맥의 로컬 서버에서만 돈다.

`aws/deploy-app.sh` 가 `prototype/` 를 `s3://earthus-cache-kr/app/` 로 올린다.
`s3:PutObject` 권한은 이미 있어서 업로드 자체는 된다. **다만 공개가 안 돼 있다** —
버킷 정책이 `celestrak/*` 만 열어놔서 `app/` 은 403 이다 (확인함).

### 콘솔에서 정책에 한 문장 추가

S3 → `earthus-cache-kr` → **권한** → **버킷 정책** → 편집.
**기존 `celestrak/*` 문장은 지우지 말고** `Statement` 배열에 아래를 추가한다.

```json
{
  "Sid": "PublicReadApp",
  "Effect": "Allow",
  "Principal": "*",
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::earthus-cache-kr/app/*"
}
```

그다음:

```bash
./deploy-app.sh
```

접속 주소 — `https://earthus-cache-kr.s3.us-east-2.amazonaws.com/app/index.html`

REST 엔드포인트라 **HTTPS 다.** 그래서 폰에서 위치정보가 동작하고, 인증서 경고도 없다.
(S3 "정적 웹사이트 호스팅" 엔드포인트는 HTTP 전용이라 쓰지 않는다. `/` → `index.html`
자동 연결이 안 되는 대신 HTTPS 를 얻는 쪽이 지금은 낫다.)

### 올리기 전에 알아둘 것

- **인터넷에 공개된다.** 링크를 아는 사람은 누구나 본다. 검색엔진이 바로 긁진 않지만
  어딘가에 링크가 걸리면 색인될 수 있다. `prototype/legal/` 의 약관·개인정보처리방침은
  아직 **변호사 검토 전 초안**이고, `earthus` 이름은 상표 충돌이 미해결이다.
  나만 보려는 거라면 로컬 `devserver.py --tls` 로 충분하다.
- `config.local.js` 도 함께 올라간다. 지금은 값이 전부 비어 있어 문제없다.
  나중에 채우면 Supabase anon 키와 사업자 정보가 공개되는데, **둘 다 원래 공개 전제다**
  (anon 키는 RLS 로 보호, 사업자 정보는 전자상거래법상 표시 의무).
  단 `service_role` 키는 어떤 경우에도 여기 넣으면 안 된다.
- 커스텀 도메인·CDN 이 필요해지면 CloudFront 를 앞에 두면 된다. 도메인부터 정해야 한다.

---

## 미해결

**Lambda 함수 URL 이 403 을 준다.** `AuthType: NONE`, 리소스 정책(`Principal: *`,
`lambda:InvokeFunctionUrl`, `Condition: FunctionUrlAuthType=NONE`) 모두 정상인데도
모든 경로·메서드가 `AccessDeniedException` 이다. 제거 후 재생성해도 같다.
Organizations SCP 가 의심되지만 조회 권한이 없어 확인 못 했다.

→ **우회함.** 앱이 S3 에서 직접 읽으므로 함수 URL 이 필요 없다.
   오히려 이쪽이 더 빠르고(2s → ~50ms) 요청 경로에 Lambda 가 없어 낫다.
   다른 프록시(NDBC·GDELT 등)를 붙일 때 같은 패턴(Lambda → S3 → 앱)을 쓰면 된다.
