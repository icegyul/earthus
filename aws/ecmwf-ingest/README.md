# ecmwf-ingest — AI 모델 vs 물리 모델

ECMWF 가 **같은 시각·같은 초기장**으로 돌린 두 모델의 예보를 우리 97지점에서 받아 쌓는다.

- **IFS** — 슈퍼컴퓨터 물리 모델
- **AIFS single** — 같은 초기장으로 돌린 **AI 모델**

나중에 기상청 관측과 맞춰 채점하면 이렇게 말할 수 있다:
> "구글·엔비디아 AI가 슈퍼컴퓨터를 이겼다는데, **한국 날씨에서도 그런가**"

⚠️ 우리는 예보를 만들지 않는다. **심판이지 선수가 아니다.**

- 배포: `./deploy-ecmwf.sh` (aws/ 폴더에서)
- 리전 `ap-northeast-2` · python3.12 · 타임아웃 600s · 메모리 1024MB
- 라이선스: **CC-BY-4.0** (상업 이용·재배포 허용, 출처 표기 조건)

---

## 첫 실행에서 나온 것 (2026-08-01 12z)

97지점 성공, 누락 0. 2m 기온 예보(°C):

| 지점 | 선행 | IFS(물리) | AIFS(AI) | 차이 |
|---|---|---|---|---|
| 서울 | 24h | 28.86 | 28.72 | −0.14 |
| 서울 | 120h | 32.24 | 31.05 | **−1.19** |
| 제주 | 24h | 26.80 | 29.50 | **+2.70** |
| 제주 | 120h | 27.36 | 29.99 | **+2.63** |

두 모델이 **계통적으로 다르다.** 서울은 AI 가 갈수록 낮게, 제주는 AI 가 내내 2°C 높게 본다.
어느 쪽이 맞는지는 관측과 대봐야 안다 — 그게 이 수집기를 만든 이유다.

---

## ⚠️ 남은 일 ① — 정기 실행 등록 (대표님)

`earthus-deploy` 에 `events:*` 권한이 없어 에이전트가 스케줄을 못 건다.
**지금은 수동 실행분 한 회차뿐이다.**

ECMWF 오픈데이터는 **2~3일치만 보관**한다. 우리가 매 회차 받아 쌓지 않으면
1년 뒤 "그때 AI 가 얼마나 맞았나"를 **영영 말할 수 없다.** 지나간 회차는 되돌릴 수 없다.

발표는 00·06·12·18 UTC 4회이고 오픈데이터에 올라오기까지 몇 시간 걸린다.
6시간마다 돌리면 충분하다.

```bash
REGION=ap-northeast-2
FN=arn:aws:lambda:ap-northeast-2:294951922100:function:ecmwf-ingest
RULE=arn:aws:events:ap-northeast-2:294951922100:rule/earthus-ecmwf-ingest

aws events put-rule --region $REGION \
  --name earthus-ecmwf-ingest \
  --schedule-expression 'cron(40 2,8,14,20 * * ? *)' \
  --description 'ECMWF AIFS/IFS 수집 (6시간마다)'

aws events put-targets --region $REGION \
  --rule earthus-ecmwf-ingest --targets "Id=1,Arn=$FN"

# ⚠️ 이 권한을 빠뜨리면 규칙은 돌지만 Lambda 가 안 불린다 (오류도 안 보인다)
aws lambda add-permission --region $REGION \
  --function-name ecmwf-ingest \
  --statement-id earthus-ecmwf-schedule \
  --action lambda:InvokeFunction \
  --principal events.amazonaws.com --source-arn $RULE
```

콘솔로 하려면: EventBridge → 규칙 생성 → 이름 `earthus-ecmwf-ingest` →
Cron `40 2,8,14,20 * * ? *` → 대상 Lambda `ecmwf-ingest`.

---

## ⚠️ 남은 일 ② — 채점 (아직 안 만듦)

지금은 **모으기만 한다.** 점수를 내려면 하나가 더 필요하다:

- 예보 시각이 지난 뒤, `archive/ecmwf/<run>.json` 의 값과 그 시각 기상청 관측을 맞춘다
- 선행시간별(24/48/72/96/120h)로 나눠 오차를 낸다 — **섞으면 의미가 없다**
- `kma-verify` 가 이미 같은 일을 Open-Meteo 로 하고 있다. 그 뼈대를 재사용할 것

⚠️ 데이터가 며칠 쌓이기 전에는 채점해도 표본이 없다. 먼저 스케줄부터.

---

## 설계 메모 (다음 사람을 위해)

**파일을 통째로 받지 않는다.** 한 회차가 IFS 126MB · AIFS 84MB 다.
ECMWF 는 `.index` 를 함께 주는데 메시지(변수×스텝)별 byte offset 이 들어 있다.
Range 요청으로 필요한 것만 집으면 변수당 ~650KB 다.

**격자 인덱스를 직접 계산하지 않는다.** 주사 방향·경도 원점을 다시 구현하면
조용히 틀린 자리를 읽는다. `codes_grib_find_nearest` 가 GRIB 헤더를 읽어 처리한다.

**2t 만 받는다.** 기상청 ASOS 가 같은 것을 재고 있어 **사과 대 사과** 비교가 되는
유일한 값이다. 강수는 누적 방식·관측 방식이 달라 따로 설계해야 한다 —
지금 섞으면 엉터리 점수가 나온다.

**켈빈을 그대로 저장하지 않는다.** 2t 는 K 로 오는데 그대로 두면 언젠가 누가 헷갈린다.
