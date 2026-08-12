# tpw-grid

NOAA/NCEP GFS의 `PWAT:entire atmosphere` 0.25° 분석장을 NOMADS에서 동아시아·서태평양
범위만 한 번 받아 1° 원격자 JSON으로 공개한다.

```bash
bash aws/deploy-grib-python.sh tpw-grid
aws lambda invoke --function-name tpw-grid --region ap-northeast-2 \
  --cli-read-timeout 420 /tmp/tpw-grid.out
```

- 산출물: `s3://earthus-cache-kr/wind/tpw-ea.json`
- 스케줄: 1시간
- 런타임: Python 3.12, x86_64, ecCodes, 1024MB, timeout 420초
- 운영 노출: 산출물·출처·화면 검증 뒤 `CONFIG.TPW_READY=true`

일반 `deploy-python.sh`를 쓰지 않는다. GRIB2 해독용 native Linux wheel이 필요하다.
