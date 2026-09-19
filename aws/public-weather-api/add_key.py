"""API 키 발급 도구 (관리자 전용, 로컬에서 AWS 자격증명으로 실행)

셀프서비스 가입은 아직 없다 — 신청 오면 이 스크립트로 손으로 키를 만든다.

사용법
  python add_key.py "회사/이름" [--limit 1000]

동작
  1. 32바이트 랜덤 키를 만든다 (secrets.token_urlsafe)
  2. s3://<CACHE_BUCKET>/archive/public-api/keys.json 을 받아 항목을 추가하고 되돌려 올린다
  3. 발급한 키를 화면에 한 번만 찍는다 — 저장은 신청자 몫이다
"""

import argparse
import json
import secrets
from datetime import datetime, timezone

import boto3

BUCKET = "earthus-cache-kr"
REGION = "us-east-2"
KEYS_KEY = "archive/public-api/keys.json"   # ⚠️ app/ 는 공개로 서빙된다 — handler.py 주석 참고


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("owner")
    ap.add_argument("--limit", type=int, default=1000)
    args = ap.parse_args()

    s3 = boto3.client("s3", region_name=REGION)
    try:
        doc = json.loads(s3.get_object(Bucket=BUCKET, Key=KEYS_KEY)["Body"].read())
    except s3.exceptions.NoSuchKey:
        doc = {"keys": {}}

    new_key = "eus_" + secrets.token_urlsafe(24)
    doc.setdefault("keys", {})[new_key] = {
        "owner": args.owner,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "dailyLimit": args.limit,
        "active": True,
    }
    s3.put_object(
        Bucket=BUCKET, Key=KEYS_KEY,
        Body=json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json",
    )
    print(f"발급 완료 — owner={args.owner} dailyLimit={args.limit}")
    print(f"API 키 (이번 한 번만 표시됨): {new_key}")


if __name__ == "__main__":
    main()
