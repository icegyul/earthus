# kma-fcst — 기상청 동네예보 수집기

한국 지점 예보를 기상청 공식 자료로 받아 `s3://earthus-cache-kr/wind/kma-fcst.json` 에 올린다.
앱은 `js/kma-fcst.js` 로 읽어 **가장 가까운 지점**의 예보를 날씨 시트에 그린다.

- 배포: `./deploy-python.sh kma-fcst` (aws/ 폴더에서)
- 리전: `ap-northeast-2` · 런타임 python3.12 · 의존성 없음
- 검증 완료(2026-08-02): 97지점 전부 성공, 실패 0

---

## ⚠️ 남은 일 — 정기 실행 등록 (대표님)

**배포·실행·검증은 끝났지만 스케줄이 걸려 있지 않다.**
`earthus-deploy` 사용자에게 `events:*` 권한이 없어 에이전트가 걸 수 없었다.
**지금은 수동 실행분 한 번뿐이라, 이 규칙을 걸기 전까지 예보가 갱신되지 않는다.**

동네예보 발표는 02·05·08·11·14·17·20·23시(하루 8회)다.
매시 15분에 돌리면 발표 직후 회차를 늦어도 1시간 안에 받는다. 헛도는 회차는 같은 값을 다시 쓸 뿐이라 해롭지 않다.

### 방법 A — 명령줄 (권한 있는 계정으로)

```bash
REGION=ap-northeast-2
FN=arn:aws:lambda:ap-northeast-2:294951922100:function:kma-fcst
RULE=arn:aws:events:ap-northeast-2:294951922100:rule/earthus-kma-fcst

# ① 규칙 — 매시 15분
aws events put-rule --region $REGION \
  --name earthus-kma-fcst \
  --schedule-expression 'cron(15 * * * ? *)' \
  --description '기상청 동네예보 수집 (매시)'

# ② 이 규칙이 kma-fcst 를 부르게 한다
aws events put-targets --region $REGION \
  --rule earthus-kma-fcst \
  --targets "Id=1,Arn=$FN"

# ③ EventBridge 가 Lambda 를 부를 권한 (이게 없으면 규칙은 돌지만 아무 일도 안 난다)
aws lambda add-permission --region $REGION \
  --function-name kma-fcst \
  --statement-id earthus-kma-fcst-schedule \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com \
  --source-arn $RULE
```

⚠️ ③을 빠뜨리는 실수가 흔하다. 규칙은 만들어졌는데 Lambda 가 안 불리고, 콘솔에도 오류가 안 보인다.

### 방법 B — 콘솔

1. **EventBridge** → 규칙 → **규칙 생성**
2. 이름 `earthus-kma-fcst` · 규칙 유형 **일정**
3. 일정 패턴: **Cron 기반** → `15 * * * ? *`
4. 대상: **AWS 서비스 → Lambda 함수 → `kma-fcst`**
5. 생성 (권한 ③은 콘솔이 알아서 붙여 준다)

### 잘 걸렸는지 확인

```bash
# 다음 시각 15분이 지난 뒤 — generated 시각이 갱신되면 성공
curl -s https://earthus.net/wind/kma-fcst.json | head -c 200
```

```bash
# 지금 당장 한 번 돌려보고 싶으면
aws lambda invoke --region ap-northeast-2 --function-name kma-fcst /tmp/out.json && cat /tmp/out.json
# 기대: {"ok": true, "cells": 97, "points": 97, "failed": 0}
```

---

## 다음에 붙일 것

- **중기예보(5~10일)** — `getMidTa`(기온) + `getMidLandFcst`(하늘·강수확률).
  ⚠️ 이 둘은 격자가 아니라 **지역코드**를 쓴다. 97지점 → 지역코드 대응표를 만들어야 한다.
  ⚠️ 중기기온은 `taMin8Low`/`taMin8High` 로 **예보 불확실성 범위**를 준다 —
     유료로 사려던 앙상블 밴드를 공식 기관이 무료로 주는 셈이다. 반드시 살려 쓸 것.
  이걸 붙이면 한국은 Open-Meteo 를 완전히 떠날 수 있다(지금은 '14일' 탭이 아직 Open-Meteo).
