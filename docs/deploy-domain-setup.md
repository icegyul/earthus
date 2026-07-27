# 도메인 · HTTPS 구축 — 대표님이 하실 것 / 제가 할 것

> 2026-07-28 새벽 확인. 8/4 오픈의 **크리티컬 패스**입니다.
> HTTPS 없이는 위치 권한이 아예 안 떠서 내 위치·특보 알림·한국탭이 전부 죽습니다.

---

## 왜 지금 막혀 있나

배포용 계정(`earthus-deploy`)에 필요한 권한이 **하나도 없습니다.** 오늘 새벽 직접 확인했습니다:

```
cloudfront:ListDistributions   없음
acm:ListCertificates           없음
route53:ListHostedZones        없음
```

그래서 제가 CloudFront 를 만들 수가 없습니다. **권한만 열어 주시면 나머지는 제가 다 합니다.**

---

## 1. 대표님이 하실 것 ① — IAM 권한 추가 (5분)

AWS 콘솔 → IAM → 사용자 → `earthus-deploy` → **권한 추가** → **인라인 정책 생성** → JSON 탭에
아래를 붙여 넣고 이름을 `earthus-domain-setup` 으로 저장.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudFront",
      "Effect": "Allow",
      "Action": [
        "cloudfront:ListDistributions",
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
        "cloudfront:CreateDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:CreateInvalidation",
        "cloudfront:ListCachePolicies",
        "cloudfront:CreateOriginAccessControl",
        "cloudfront:ListOriginAccessControls",
        "cloudfront:TagResource"
      ],
      "Resource": "*"
    },
    {
      "Sid": "CertificateDnsValidated",
      "Effect": "Allow",
      "Action": [
        "acm:ListCertificates",
        "acm:DescribeCertificate",
        "acm:RequestCertificate"
      ],
      "Resource": "*"
    },
    {
      "Sid": "Dns",
      "Effect": "Allow",
      "Action": [
        "route53:ListHostedZones",
        "route53:GetHostedZone",
        "route53:CreateHostedZone",
        "route53:ChangeResourceRecordSets",
        "route53:ListResourceRecordSets",
        "route53:GetChange"
      ],
      "Resource": "*"
    },
    {
      "Sid": "BucketPolicyForCloudFront",
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketPolicy",
        "s3:PutBucketPolicy"
      ],
      "Resource": "arn:aws:s3:::earthus-cache-kr"
    }
  ]
}
```

⚠️ **일부러 좁게 잡았습니다.** 삭제 권한(`DeleteDistribution`·`DeleteHostedZone`)은 넣지 않았습니다 —
제가 실수로 지울 수 있는 여지를 만들지 않으려는 것입니다. 나중에 정말 필요하면 그때 여세요.

⚠️ `s3:PutBucketPolicy` 가 들어간 이유: CloudFront 가 S3 를 읽으려면 버킷 정책에 CloudFront 를
허용하는 줄을 넣어야 합니다. **기존 공개 프리픽스(`app/*`, `wind/*` 등) 규칙은 건드리지 않고
줄만 추가**하겠습니다.

---

## 2. 대표님이 하실 것 ② — 도메인 등록 (10분)

`earthus.net` 을 카페24(또는 호스팅케이알)에서 등록.

- 등록업체는 **DNS 창구일 뿐**이고 트래픽은 그쪽을 지나지 않습니다. 가격이 같다면 어디든 무방합니다.
- ⚠️ 등록 직후 **네임서버를 Route 53 로 바꿔야** 합니다. 제가 Route 53 호스팅존을 만들고
  네임서버 4개를 알려드리면, 카페24 관리 화면에서 그것으로 교체하시면 됩니다.
  (apex 도메인 `earthus.net` 을 CloudFront 에 붙이려면 ALIAS 레코드가 필요한데,
   Route 53 는 표준 지원하고 등록업체 DNS 는 지원이 제각각입니다.)
- 여유가 되면 `earthus.com` · `earthus.kr` 도 방어 등록 권장 (연 1~2만원대 · 상표 리스크 대비).

---

## 3. 그다음은 제가 합니다

권한과 도메인이 준비되면 제가 순서대로 처리합니다:

```
① Route 53 호스팅존 생성 → 네임서버 4개를 알려드림  (대표님이 카페24에 입력)
② ACM 인증서 발급 (us-east-1, DNS 검증 — 검증 레코드도 제가 넣음)
③ CloudFront 배포 생성 (원본 S3 /app · 압축 켬 · 기본루트 index.html)
④ Route 53 A(ALIAS) → CloudFront, www → apex
⑤ https://earthus.net 에서 위치 권한·특보 알림 실제 동작 확인
⑥ OG 태그·robots.txt·sitemap 점검
```

전파 대기를 빼면 **반나절**이면 끝납니다.

---

## 덤으로 따라오는 것 — CloudFront 는 성능 대책이기도 하다

지금 S3 정적 서빙에는 **압축이 없습니다.** 736지점·6,840지점 JSON 이 원문 그대로 나갑니다.
CloudFront 를 붙이면 자동으로 gzip/brotli 압축이 걸립니다 (JSON 은 통상 70~90% 축소).
한국 엣지 캐시도 붙습니다.

즉 이 작업은 **도메인 + HTTPS + 속도 + 발열 대책 + 전송비 절감**을 한 번에 해결합니다.
오픈 전 작업 중 가성비가 가장 좋습니다.
