# -*- coding: utf-8 -*-
"""GFS 0.5° 5일 예보 구름 프레임 — NOAA NOMADS → PNG 41장 + 매니페스트 → S3 clouds/gfs-fc/

왜 만들었나: 브라우저가 Open-Meteo 지점 450개(12° 격자, 적도 1,300km)를 질의해
5일치 구름을 그리고 있었다. 시간을 밀면 뭉개져 보였고, 그건 표현이 아니라 자료의 성김이었다.
여기서는 GFS 원자료를 0.5°(적도 55km) 로 받아 프레임으로 만든다. 브라우저는 PNG 만 읽는다.

어떤 필드를 쓰나 — 실측으로 골랐다(2026-09-03):
  구름 '비율'(TCDC/LCDC/MCDC)은 지구의 절반 이상이 90% 라 화면이 회색 베일이 된다.
  위성처럼 보이려면 '두께'가 필요하다 → CWAT(연직 구름수 총량, kg/m²). 0.05 초과가 29%,
  0.3 초과가 6.5% 라 짙은 구름만 짙게 나온다. 고층 비율(HCDC)은 권운 베일용으로 따로 담는다.

왜 두 장으로 나누나: 바람은 매끄러운 장이라 1° 가 필요 없다. 실측으로 한 장에 다 담으면
195KB 인데 그중 바람이 108KB(55%)다. 바람만 4° 로 빼면 8KB — 사용자당 전송이 43% 준다.
CDN 전송은 사용자 수에 비례하는 유일한 비용이므로 여기서 아끼는 것이 맞다.

무엇을 담나 — 구름 c{step}.png (RGBA, 360×181, 행0=북위90, 열0=서경180):
  A = CWAT 를 log 로 눌러 0~255. A/255 = clamp((log10(cwat) − log10(0.005)) / (log10(2) − log10(0.005)), 0, 1)
      즉 0.005 kg/m² 이하 = 0, 2.0 이상 = 255. 표현 곡선의 나머지는 브라우저 셰이더가 맡는다.
  B = 운정 높이 / 16000m → 0~255 (DERIVED — 저/중/고층 비율에서 '가장 높은 층'을 골라 환산)
  R, G = 0 (사용 안 함)
강수 p{step}.png (RGB, 구름과 같은 격자) — 구름 밑 지표에 비/눈/뇌우를 그리기 위한 자료:
  ⚠️ 여기에 'RGBA, 360×181 = 1°' 라고 적혀 있었다. 해상도를 0.5° 로 올릴 때 이 줄만 안 고쳤다 —
     코드는 처음부터 구름과 같은 NI×NJ 로 굽고(precip_png), 운영 p000.png 의 IHDR 도 720×361 · 색 유형 2(RGB)다
     (2026-09-20 실측). 지시서 W0 표의 '지금 1° → 0.5°' 는 이 낡은 주석을 읽은 것이다 — 이미 0.5° 다.
  R = 강수 강도 mm/h 를 log 로 눌러 0~255 (0.05 이하 = 0, 30 이상 = 255)
  G = 강수 종류 — 0 비 · 128 어는비/진눈깨비 · 255 눈 (GFS CRAIN/CFRZR/CICEP/CSNOW 그대로)
  B = 뇌우 가능성 (DERIVED — 대류강수 비율 × CAPE. GFS 출력 필드가 아니다)
  희소한 장이라 52KB 다(실측). 강수 종류는 관측이 아니라 예보 모델의 판정이다.

바람 w{step}.png (RGBA, 90×46 = 4°):
  R = 700hPa 동서풍 u, G = 남북풍 v — (m/s + 64) / 128 * 255, 0.5 m/s 양자화. ±64 m/s
  4° 로 내릴 때는 평균을 낸다 — 이류에 쓰는 값이라 대표값이어야 한다.
바람을 같이 담는 이유: 3시간 프레임 사이를 그냥 섞으면 구름이 '이동'하지 않고 '녹았다 생긴다'.
실제 바람으로 이류(advection)해 사이를 채우면 구름이 실제 방향으로 움직인다.
사이 값은 우리가 보간한 것이므로 브라우저는 그것을 MODEL·보간으로 표기해야 한다.

필드 프레임 — 2026-09-20 W0 (지시서 docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20 §3 W0):
  왜: 기온·바람·기압 격자가 전부 Open-Meteo 5°(한 칸 555km) '지금' 한 시각이었다. 렌더러를 아무리
  잘 만들어도 그림이 안 나오고, 타임라인을 밀어도 값이 없다. 같은 NOMADS 요청에서 같이 받는다.
  전부 구름과 같은 격자(NI×NJ, 행0=북위90, 열0=서경180) · 같은 돌리기((i + NI/2) % NI).
    t{step}.png  회색 1채널   TMP 2 m above ground     °C  = byte × 0.5 − 80      (−80 ~ +47.5, 밖은 끝값)
    u{step}.png  RGB(B=0)     UGRD·VGRD 10 m above ground  m/s = byte / 255 × 128 − 64 — 700hPa 바람(w 프레임)과
                              같은 디코드 식. 다만 4° 평균이 아니라 격자 그대로이고(지표 바람은 입자·색면이 직접
                              읽는다), 0.5 m/s 선양자화를 하지 않는다(오차 0.5 → 0.25 m/s, _wind10_byte 주석)
    m{step}.png  회색 1채널   PRMSL mean sea level     hPa = byte × 1 + 870       (870 ~ 1125, 밖은 끝값)
    a{step}.png  회색 1채널   APCP surface 누적강수    mm  = byte 0 이면 0, 아니면 10^(byte/255 × span + log10(0.1))
  왜 8bit 1채널 선형인가: 브라우저는 16bit PNG 를 8bit 로 내려 읽는다. 채널 하나에 값 하나를 선형으로 두면
  하드웨어 LinearFilter 보간이 곧 '값' 보간이 된다 — 두 채널에 나눠 담으면 바이트 경계에서 보간이 깨진다.
  눈금(기온 0.5 · 기압 1)은 구간 경계(기온 5°C·2°C, 등압선 4hPa)가 전부 눈금 위에 오도록 고른 값이다.
  누적강수만 log 다: 구간 경계(0.1·0.5·1·2·5·10·20·50 mm)가 0.5mm 선형 눈금에 못 올라가고,
  태풍의 6시간 누적은 127mm 를 넘는다. 같은 파일의 강수 강도(_rate_byte)와 같은 문법이다.

  ⚠️ APCP 의 구간 — 추측이 아니라 인벤토리(.idx)와 실제 GRIB 의 템플릿 4.8 로 확인했다(2026091918):
     한 스텝에 APCP 가 두 장 온다. f003 '0-3' · f006 '0-6' · f009 '6-9' + '0-9' · f012 '6-12' + '0-12' ·
     f117 '114-117' + '0-117' · f120 '114-120' + '0-5 day'. 즉 하나는 **6시간마다 0 으로 되돌아가는 버킷**,
     하나는 런 시작부터의 총량이다. f000(분석장)에는 APCP 가 없다 → a000.png 는 만들지 않는다.
     우리는 **버킷**(구간이 짧은 쪽)을 받은 그대로 굽고, 구간을 GRIB 에서 읽어 스텝마다 매니페스트에 적는다
     (apcpWindow.fromH/toH). 3의 배수 스텝은 3시간, 6의 배수 스텝은 6시간 누적이다 — 두 프레임이 같은 길이가
     아니다. 3시간 값이 필요하면 브라우저가 a[h] − a[h−3] (h 가 6의 배수일 때)로 구한다. 값을 지어내지 않으려고
     Lambda 에서 빼지 않았다(스텝을 가로지르는 상태도 생긴다).

  ⚠️ 새 프레임은 '없으면 그 프레임만 생략'이다. 구름·강수·700hPa 바람의 필수 목록(fields_from_grib 의
     missing)에 넣지 않는다 — 넣으면 기온 한 장이 빠진 날 구름까지 같이 죽는다. v2 의 5일 예보 구름이 이 함수에 달려 있다.
  ⚠️ NOMADS 는 변수 × 레벨을 **교차곱**으로 준다. 10 m 를 켜면 TMP 가 surface·2 m·700 mb 에 다 딸려 온다
     (실측 f009: 22메시지 3.23MB → 30메시지 4.87MB). 그래서 describe 로 먼저 보고 필요한 메시지만 해독한다 —
     예전에는 22장을 전부 해독하고 10장(구간 평균 pdt 8 아홉 장 + 읽는 곳이 없던 CRAIN)을 버렸다.
     지금은 30장 중 17장만 해독한다(필수 12 + 기온 · 10 m u · v · 기압 · 누적강수 버킷).
  레벨 문자열은 필터 페이지에서 확인했다(2026-09-20): lev_2_m_above_ground · lev_10_m_above_ground ·
     lev_mean_sea_level · var_TMP · var_PRMSL · var_APCP. 틀리면 0바이트/500 이다(CWAT 때 밟은 함정).

옛 프레임 3종의 디코드 상수 — 2026-09-20 C1 (매니페스트 fields.cloud · fields.wind700 · fields.precip):
  왜: v2 의 공용 프레임 저장소(prototype/v2-three/js/gfs-frames.js)는 디코드 상수를 매니페스트 fields{} 에서만 읽는다.
  W0 은 새 넷(temp · wind10 · mslp · apcp)만 실었고 옛 셋은 위의 글(encoding{})뿐이라, 저장소가 풀지 못하고 바이트만
  돌려줬다(decoded:false). W4(강수 mm/h 구간색 · 클릭 값)가 p 프레임의 R 을 **값**으로 읽어야 한다.
  무엇을 싣나 — 저장소가 아는 식(linear · log10)으로 풀리는 '양'만 channels{} 에 싣는다:
    precip.R  = PRATE mm/h log (_PLOG_LO · _PLOG_SPAN)   cloud.A = CWAT kg/m² log (_LOG_LO · _LOG_SPAN)
    wind700.R · G = 700hPa u · v (10 m 바람과 같은 식)
  무엇을 안 싣나 — precip.G(종류 부호) · precip.B(뇌우, DERIVED) · cloud 회색(운정고도, DERIVED):
    ① 저장소는 channels{} 의 채널을 전부 풀 수 있어야 그 필드를 푼다(하나라도 모르는 식이면 필드 전체가 decoded:false).
    ② 실으면 저장소가 그 채널을 칸 사이·프레임 사이로 **섞는다**. 부호 0(비)과 255(눈)의 가운데 128 은 '어는 비'라는
       다른 부호다 — 없던 판정이 생긴다. 유도값도 '잰 양'처럼 섞여 나간다. 저장소에 범주·유도 채널을 뜻하는 표현이 없다.
    ③ 구름 회색은 브라우저가 캔버스로 되읽을 때 알파 선곱으로 깎인다(알파 0 인 칸은 0 이 된다 — gfs-frames.js 머리 주석).
    그래서 channels{} 가 아니라 저장소가 읽지 않는 설명 칸 notDecoded{} 에 '어느 encoding 글을 보라'만 적는다. 숫자를 다시 적지 않는다.
  ⚠️ 상수는 인코더가 쓰는 그 이름에서 만든다(field_specs). 인코더의 범위를 바꾸면 매니페스트가 따라 바뀐다 — 시험이
     인코더 → 바이트 → (매니페스트 상수로) 디코드 왕복으로 잠근다.
  ⚠️ 구름 알파는 CWAT_Q 의 배수로 **내림**된 바이트다. 255 는 나오지 않는다 — 끝값은 252(≈1.86 kg/m², CWAT_HI 가 아니다).
     풀면 참값보다 늘 낮거나 같다(최대 CWAT_Q − 0.5 눈금). 식은 encoding.A 의 글과 같게 뒀다(가운데로 옮기지 않았다 —
     한 매니페스트 안에서 글과 숫자가 다른 값을 말하면 안 된다). 눈금 폭은 channels.A.byteStep 이 말한다.
  ⚠️ 700hPa 바람은 4° **묶음 평균**이다(wind_png). 저장소는 fields{} 에 실린 격자를 '점 격자'로 읽는다(묶음을 뜻하는 칸이 없다).
     그래서 격자의 원점을 묶음의 첫 점(−180 · 90)이 아니라 **묶음의 가운데**로 적는다 — 그래야 저장소의 bilinear 와
     uvTransform 이 값을 제자리에 놓는다(첫 점으로 적으면 1.75° 어긋난다). 옛 키 windGrid 는 그대로다.
  ⚠️ 끄개(GFS_FC_FIELDS=0)여도 이 셋은 싣는다. 끄개는 NOMADS 에 **새 변수·레벨을 청하지 않는** 스위치다. c · w · p 는
     모든 스텝의 필수 프레임이라 상수가 늘 참이고, 기온 요청이 탈 난 날 끄개를 내렸다고 강수 판독까지 죽으면 안 된다.
     매니페스트 세대(schema)는 2 그대로다 — 키를 더했을 뿐이고, 읽는 쪽은 fields.precip 이 있는지로 안다.

정직 규칙: 받지 못한 스텝은 매니페스트에 넣지 않는다. 빈 프레임을 만들지 않는다.
GRIB 해독은 grib2lite (순수 파이썬, eccodes 2.48 과 일치 검증 — f000/f024/f120, 전 필드).
"""
import concurrent.futures
import json
import math
import os
import struct
import time
import urllib.parse
import urllib.request
import zlib
from datetime import datetime, timedelta, timezone

import boto3

import grib2lite as gl

BUCKET = os.environ.get('CACHE_BUCKET', 'earthus-cache-kr')
REGION = os.environ.get('CACHE_REGION', 'us-east-2')
PREFIX = os.environ.get('GFS_FC_PREFIX', 'clouds/gfs-fc')
STEP_H = int(os.environ.get('GFS_FC_STEP_H', '3'))
MAX_H = int(os.environ.get('GFS_FC_MAX_H', '120'))
WIND_LEVEL = os.environ.get('GFS_FC_WIND_MB', '700')
# 해상도. 1.0°(적도 111km)로는 구름이 뭉개져 보인다는 지적이 있어 0.5°(55km)로 올렸다.
# 0.25°는 못 간다 — GRIB 이 스텝당 10.8MB(11.5배)이고 순수 파이썬 디코드가 41스텝에
# 약 2,800초로 Lambda 한도를 넘는다. 프레임 전송량도 스텝당 1.45MB 가 되어 과하다(실측).
RES = os.environ.get('GFS_FC_RES', '0p50')            # '1p00' | '0p50'
RES_DEG = {'1p00': 1.0, '0p50': 0.5}[RES]
BASE = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_%s.pl' % RES
UA = 'earthus/2.0 (+https://earthus.net)'
NI, NJ = int(round(360 / RES_DEG)), int(round(180 / RES_DEG)) + 1
# 프레임의 첫 칸(행0 · 열0)이 놓인 곳 — 서경 180 · 북위 90. 매니페스트 grid 에 숫자로 적혀 있던 값이다.
# fields.wind700 의 격자 원점(묶음 가운데)을 같은 수에서 셈하려고 이름을 붙였다. 매니페스트에 나가는 값은 그대로다.
GRID_LON0, GRID_LAT0 = -180.0, 90.0
# 바람은 부드러워 4°면 충분하다 — 해상도를 올려도 바람 파일은 그대로 90×46 으로 둔다.
WIND_DIV = int(round(4.0 / RES_DEG))  # 바람 다운샘플 배수 → 90×46 (4° 격자)
WNI, WNJ = NI // WIND_DIV, (NJ + WIND_DIV - 1) // WIND_DIV
DEADLINE_S = int(os.environ.get('GFS_FC_DEADLINE_S', '840'))
CWAT_LO, CWAT_HI = 0.005, 2.0        # log 인코딩 범위 (kg/m²)
TOP_Q = 4                            # 운정고도 양자화 눈금 (4/255*16000 ≈ 252 m)
CWAT_Q = 4                           # 구름수 양자화 눈금 (256/4 = 64 단계)
_LOG_LO = math.log10(CWAT_LO)
_LOG_SPAN = math.log10(CWAT_HI) - _LOG_LO
# 필드 프레임(t·u·m·a) 끄개. 기본은 켬. NOMADS 가 새 변수·레벨에서 탈이 나면 코드를 되돌리지 않고
# 환경변수 하나(GFS_FC_FIELDS=0)로 예전 요청(구름·강수·700hPa 바람만)으로 돌아간다 — 구름을 먼저 살린다.
FIELDS_ON = os.environ.get('GFS_FC_FIELDS', '1') != '0'
# 선형 인코딩의 범위. 눈금은 구간 경계가 정확히 눈금 위에 오는 값으로 골랐다(머리 주석).
TEMP_LO_C, TEMP_STEP_C = -80.0, 0.5          # byte = round((°C + 80) / 0.5)  → −80 ~ +47.5 °C
# 기압은 처음에 940 ~ 1067.5 hPa(0.5 눈금)였다. 운영 첫 실행(2026-09-20 런 2026092000)에서 **354칸이 940 바닥에 눌렸다** —
# 태풍 중심이 평평한 940 고원이 된다. 태풍을 보려고 만든 제품에서 그것은 틀린 기본값이라, 이 프레임을 읽는 브라우저 코드가
# 아직 없을 때 넓혔다. 8bit 에 0.5 눈금으로는 127.5hPa 밖에 못 담는다 — 기록상 최저(870, 태풍 Tip)부터 최고(1084, 시베리아)까지
# 담으려면 1hPa 눈금이어야 한다. 4hPa 등압선은 여전히 눈금 위다. 브라우저는 상수를 매니페스트 fields.mslp 에서 읽는다(박지 말 것).
MSLP_LO_HPA, MSLP_STEP_HPA = 870.0, 1.0      # byte = round(hPa − 870) → 870 ~ 1125 hPa
APCP_LO, APCP_HI = 0.1, 250.0                # mm — log 인코딩 범위. 0.1 = 가장 낮은 구간 경계, 250 = 6시간 누적의 천장
_ALOG_LO = math.log10(APCP_LO)
_ALOG_SPAN = math.log10(APCP_HI) - _ALOG_LO
RUNS_KEEP = 4                                # 매니페스트 runs[] 에 남기는 런 수 — GFS 하루 4런 = 최근 24시간
# 매니페스트 세대. 2 = 필드 프레임(t·u·m·a) · fields · runs[] 가 들어간 판. 옛 키는 그대로다.
# C1(옛 셋을 fields{} 에 더함)에서는 올리지 않았다 — 있던 키는 그대로이고 fields{} 에 항목이 늘었을 뿐이다.
MANIFEST_SCHEMA = 2

s3 = boto3.client('s3', region_name=REGION)


# ---------- 런 선택 ----------
def candidate_runs(now=None):
    """최근 GFS 사이클(00/06/12/18z). 발표 후 약 4시간이면 f120 까지 나온다(실측)."""
    now = now or datetime.now(timezone.utc)
    out = []
    for back_h in range(3, 30, 6):
        t = (now - timedelta(hours=back_h)).replace(minute=0, second=0, microsecond=0)
        t = t.replace(hour=(t.hour // 6) * 6)
        if t not in out:
            out.append(t)
    return out


def url_for(run, step):
    q = [
        # 0.5° 는 파일 이름이 pgrb2full 이다(1.0°/0.25° 는 pgrb2). 이걸 틀리면 NOMADS 가 500 을 준다.
        ('file', 'gfs.t%sz.%s.%s.f%03d'
                 % (run.strftime('%H'), 'pgrb2full' if RES == '0p50' else 'pgrb2', RES, step)),
        ('dir', '/gfs.%s/%s/atmos' % (run.strftime('%Y%m%d'), run.strftime('%H'))),
        ('var_CWAT', 'on'), ('var_LCDC', 'on'), ('var_MCDC', 'on'), ('var_HCDC', 'on'),
        ('var_UGRD', 'on'), ('var_VGRD', 'on'),
        ('var_PRATE', 'on'), ('var_CPRAT', 'on'), ('var_CAPE', 'on'),
        ('var_CRAIN', 'on'), ('var_CSNOW', 'on'), ('var_CFRZR', 'on'), ('var_CICEP', 'on'),
        ('lev_surface', 'on'),
        # NOMADS 필터의 레벨 이름은 인벤토리 문자열 그대로다. 괄호는 역슬래시로 감싼다.
        ('lev_entire_atmosphere_\\(considered_as_a_single_layer\\)', 'on'),
        ('lev_low_cloud_layer', 'on'),
        ('lev_middle_cloud_layer', 'on'),
        ('lev_high_cloud_layer', 'on'),
        ('lev_%s_mb' % WIND_LEVEL, 'on'),
    ]
    if FIELDS_ON:
        # 필드 프레임용. 문자열은 필터 페이지의 체크박스 name 그대로다(2026-09-20 확인) —
        # 같은 목록에 lev_10_m_above_mean_sea_level 도 있으니 헷갈리지 말 것(그건 다른 레벨이다).
        # ⚠️ 변수 × 레벨 교차곱이다: 아래를 켜면 TMP surface · TMP 700 mb 가 같이 딸려 온다.
        #    필요 없는 메시지는 wanted_key 가 걸러 해독하지 않는다.
        q += [
            ('var_TMP', 'on'), ('var_PRMSL', 'on'), ('var_APCP', 'on'),
            ('lev_2_m_above_ground', 'on'),
            ('lev_10_m_above_ground', 'on'),
            ('lev_mean_sea_level', 'on'),
        ]
    return BASE + '?' + urllib.parse.urlencode(q)


def http_get(url, timeout=60, tries=2):
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.0)
    raise last


def pick_run():
    """f120 이 실제로 있는 가장 최근 런. 없으면 이전 사이클로 물러난다."""
    for run in candidate_runs():
        try:
            raw = http_get(url_for(run, MAX_H), timeout=40, tries=1)
            if len(raw) > 10_000 and raw[:4] == b'GRIB':
                return run
        except Exception as e:  # noqa: BLE001
            print('[run]', run.isoformat(), 'f%03d 없음' % MAX_H, repr(e)[:80])
    raise RuntimeError('GFS_FC_NO_COMPLETE_RUN')


# ---------- 해독 → 프레임 ----------
# 레벨 타입(코드표 4.5): 1 지표 · 100 등압면(Pa) · 101 평균해면 · 103 지상고도(m) · 200 대기 전체 한 층.
LT_SURFACE, LT_ISOBARIC, LT_MSL, LT_ABOVE_GROUND, LT_COLUMN = 1, 100, 101, 103, 200
WIND_PA = int(WIND_LEVEL) * 100                  # 700 mb → 70000 Pa. 환경변수라 박아 두지 않는다
# 지표 수분 계열: 7=PRATE 37=CPRAT 192=CRAIN 193=CFRZR 194=CICEP 195=CSNOW
# CRAIN(192)은 해독하지 않는다 — precip_png 는 눈·어는비·얼음싸라기가 아니면 '비(0)'로 두므로 읽는 곳이 없었다.
# 예전에는 받아서 해독만 하고 버렸다(스텝당 26만 칸 해독 한 번).
_WET_NUMS = (7, 37, 193, 194, 195)
# 구름(전부 카테고리 6): (번호, 레벨타입) — 6=CWAT(연직 구름수 총량 kg/m², 대기 전체 한 층 200) ·
# 층별 구름 비율 3=LCDC 4=MCDC 5=HCDC. 저 214 · 중 224 · 고 234.
# 예전 분기는 번호를 안 보고 레벨타입만 봤다. 번호까지 보는 이유: 같은 층에 다른 변수(TCDC 등)를 켜는 날 덮이지 않게.
_CLOUD_KEYS = {(6, LT_COLUMN): 'cwat', (3, 214): 'lcdc', (4, 224): 'mcdc', (5, 234): 'hcdc'}
# 없으면 그 프레임만 생략하는 필드. 필수 목록(fields_from_grib 의 missing)에 절대 넣지 않는다.
OPTIONAL_FIELDS = ('t2m', 'u10', 'v10', 'prmsl', 'apcp')


def _level(d):
    """첫 고정면의 값(척도 적용). 700 mb = 70000(Pa), 10 m above ground = 10, 2 m = 2."""
    lv, sc = d.get('levelValue'), d.get('levelScale') or 0
    if lv is None:
        return None
    return lv if sc == 0 else lv / (10.0 ** sc)


def wanted_key(d):
    """describe 결과 → 우리가 쓰는 필드 이름. 필요 없는 메시지면 None(= 해독하지 않는다).

    ⚠️ 레벨 '타입'만 보고 '값'을 안 보던 곳이다. 예전 분기는 'cat 2 · lt 100' 이면 무조건 구름 이류용
       700hPa 바람으로 받았다 — 등압면을 하나라도 더 켜면(850·500hPa, 지시서 W0 2단계) 나중에 온 레벨이
       조용히 덮어써서 구름이 엉뚱한 바람으로 흘러간다. 예외도 로그도 없다. 그래서 타입과 값을 **둘 다** 본다.
       실자료(2026091918 f009)의 기술값: 700hPa = lt 100 · 70000 / 10 m = lt 103 · 10 / 2 m = lt 103 · 2 /
       PRMSL = cat 3 · num 1 · lt 101. 같이 딸려 오는 TMP surface(lt 1) · TMP 700 mb(lt 100)는 여기서 버려진다.
    pdt 0 만 쓴다(pdt 8 은 구간 평균·누적) — 누적강수 APCP 만 pdt 8 이다.
    """
    cat, num, lt, pdt = d['category'], d['number'], d['levelType'], d['pdt']
    if pdt == 0:
        if cat == 6:
            return _CLOUD_KEYS.get((num, lt))
        if cat == 2 and num in (2, 3):
            if lt == LT_ISOBARIC and _level(d) == WIND_PA:
                return 'u' if num == 2 else 'v'                 # 구름 이류용 — 이 레벨 하나만
            if FIELDS_ON and lt == LT_ABOVE_GROUND and _level(d) == 10:
                return 'u10' if num == 2 else 'v10'
            return None
        if cat == 1 and lt == LT_SURFACE and num in _WET_NUMS:
            return ('wet', num)
        if cat == 7 and num == 6 and lt == LT_SURFACE:
            return 'cape'
        if FIELDS_ON and cat == 0 and num == 0 and lt == LT_ABOVE_GROUND and _level(d) == 2:
            return 't2m'
        if FIELDS_ON and cat == 3 and num == 1 and lt == LT_MSL:
            return 'prmsl'
        return None
    if (FIELDS_ON and pdt == 8 and cat == 1 and num == 8 and lt == LT_SURFACE
            and d.get('statProcess') == 1 and d.get('rangeHours')
            and d.get('forecastHours') is not None):
        return 'apcp'                                           # 누적(statProcess 1)만. 평균은 아니다
    return None


def scan_messages(raw):
    """describe 만으로 필요한 메시지를 고른다 → ({이름: (섹션들, 기술값)}, 온 메시지 수). 해독은 아직 안 한다.

    먼저 describe 로 전부 훑고(섹션 4 의 몇 바이트만 읽는다) **필요한 메시지만** 해독한다.
    예전에는 온 메시지를 전부 해독한 뒤 버렸다 — 22장 중 9장(구간 평균)이 헛해독이었고, 이 함수의
    실행 시간은 거의 전부 순수 파이썬 해독이다(기준 41스텝 270.4초 / 한도 900초).
    """
    picked = {}
    seen = 0
    for secs in gl.messages(raw):
        seen += 1
        d = gl.describe(secs)
        key = wanted_key(d)
        if key is None:
            continue
        if key == 'apcp' and 'apcp' in picked and picked['apcp'][1]['rangeHours'] <= d['rangeHours']:
            continue        # 두 장 중 구간이 짧은 쪽 = 6시간 버킷. 긴 쪽은 런 총량이다(머리 주석)
        picked[key] = (secs, d)
    return picked, seen


def _decode_checked(picked, key):
    _, g, vals = gl.decode(picked[key][0])
    if (g['ni'], g['nj']) != (NI, NJ) or g['lat1'] != 90.0 or g['lon1'] != 0.0 or g['jPositive']:
        raise RuntimeError('GFS_FC_GRID_UNEXPECTED:%r' % (g,))
    return vals


def required_fields(picked):
    """필수(구름·강수·700hPa 바람) — 예전과 같다: 하나라도 없으면 예외 → 그 스텝을 버린다."""
    got = {k: _decode_checked(picked, k) for k in picked if k not in OPTIONAL_FIELDS}
    wet = {k[1]: v for k, v in got.items() if isinstance(k, tuple)}
    cw, lc, mc, hc = got.get('cwat'), got.get('lcdc'), got.get('mcdc'), got.get('hcdc')
    u, v, cape = got.get('u'), got.get('v'), got.get('cape')
    missing = [n for n, x in (('CWAT', cw), ('LCDC', lc), ('MCDC', mc), ('HCDC', hc),
                              ('UGRD', u), ('VGRD', v),
                              ('PRATE', wet.get(7)), ('CSNOW', wet.get(195)),
                              ('CAPE', cape)) if x is None]
    if missing:
        raise RuntimeError('GFS_FC_FIELDS_MISSING:%s' % ','.join(missing))
    return cw, lc, mc, hc, u, v, wet, cape


def optional_fields(picked):
    """선택(OPTIONAL_FIELDS) — 없거나 해독이 안 되면 **그 필드만** 빠지고 이유를 남긴다. → (값 dict, 이유 dict)"""
    opt, why = {}, {}
    for key in OPTIONAL_FIELDS if FIELDS_ON else ():
        if key not in picked:
            why[key] = 'NOT_IN_GRIB'
            continue
        try:
            opt[key] = _decode_checked(picked, key)
        except Exception as e:  # noqa: BLE001 — 새 필드 하나의 탈이 구름을 죽이면 안 된다
            why[key] = repr(e)[:120]
    if 'apcp' in opt:
        d = picked['apcp'][1]
        opt['apcpWindow'] = (d['forecastHours'], d['forecastHours'] + d['rangeHours'])
    return opt, why


def read_fields(raw):
    """GRIB 버퍼 → (필수 8종 튜플, 선택 필드 dict, 선택 필드가 빠진 이유 dict, 통계 dict).

    세 단계(scan_messages → required_fields → optional_fields)를 한 번에 돈다. build_step 은 셋을 따로 부른다 —
    구름 프레임을 다 만들고 필수 목록을 놓은 **뒤에** 선택 필드를 풀어야 메모리 봉우리가 예전보다 높아지지 않는다
    (26만 칸 목록 하나가 약 8MB · 4스레드).
    """
    picked, seen = scan_messages(raw)
    req = required_fields(picked)
    opt, why = optional_fields(picked)
    decoded = sum(1 for k in picked if k not in OPTIONAL_FIELDS) + sum(1 for k in OPTIONAL_FIELDS if k in opt)
    return req, opt, why, {'messages': seen, 'decoded': decoded}


def fields_from_grib(raw):
    """CWAT · L/M/H 층별 구름 비율 · U/V 바람 · 강수(PRATE/CPRAT/종류/CAPE). 하나라도 없으면 예외.

    층별 구름 비율의 레벨타입: 저 214 · 중 224 · 고 234. pdt 0 만 쓴다(pdt 8 은 구간 평균).
    2026-09-20: 분기는 wanted_key, 해독은 read_fields 로 옮겼다(레벨 값 분기 · describe 먼저).
    이 함수는 예전 모양(필수 8종 튜플) 그대로 남긴다.
    """
    return read_fields(raw)[0]


# 층별 구름의 대표 운정 고도(m). GFS 층 정의(저 <2km · 중 2~6km · 고 >6km)의 운정 쪽 값이다.
TOP_L, TOP_M, TOP_H = 2200.0, 6200.0, 11000.0


def _top_height_m(l, m, h):
    """가장 높은 층부터 덮어 내려온다. 평균이 아니라 '맨 위'를 고른다 —
    평균을 내면 고층 권운이 있는 곳이 중층으로 내려앉아 3D 가 뭉개진다."""
    fh = 0.0 if h is None else max(0.0, min(1.0, h / 100.0))
    fm = 0.0 if m is None else max(0.0, min(1.0, m / 100.0))
    fl = 0.0 if l is None else max(0.0, min(1.0, l / 100.0))
    rest = 1.0 - fh
    return TOP_H * fh + TOP_M * fm * rest + TOP_L * fl * rest * (1.0 - fm)


# PNG 색 유형: 2=RGB(3바이트) · 4=그레이+알파(2바이트) · 6=RGBA(4바이트)
# 안 쓰는 채널을 굽지 않는다. 구름은 두 값(운정고도·구름수), 강수는 세 값만 쓴다.
# 브라우저는 그레이+알파를 R=G=B=회색, A=알파로 펼치므로 셰이더의 .b/.a 가 그대로 맞는다.
_SWAR = {}


def _sub_filter(row, bpp):
    """PNG 필터 1(Sub): 각 바이트에서 bpp 바이트 앞의 값을 뺀다(mod 256).

    행 전체를 큰 정수 하나로 보고 한 번에 뺀다(SWAR). 바이트마다 파이썬 루프를 돌면 프레임당
    0.2~0.7초가 들어(실측) 41스텝에서 실행 시간을 먹는다 — 이렇게 하면 거의 공짜다.
    x 를 bpp 바이트만큼 오른쪽으로 밀면(빅엔디언) 각 자리에 '앞 픽셀'이 오고 맨 앞 bpp 바이트는 0 이 된다.
    바이트별 뺄셈: 윗비트를 세워 빌림이 옆 바이트로 번지지 않게 빼고, 윗비트는 XOR 로 따로 맞춘다.
    """
    n = len(row)
    if n not in _SWAR:
        _SWAR[n] = (int.from_bytes(b'\x80' * n, 'big'), int.from_bytes(b'\x7f' * n, 'big'))
    hi, lo = _SWAR[n]
    x = int.from_bytes(row, 'big')
    y = x >> (8 * bpp)
    return ((((x | hi) - (y & lo)) ^ ((x ^ ~y) & hi))).to_bytes(n, 'big')


FIELD_ZLIB = 7        # 필드 프레임의 zlib 단계. 기존 c·p·w 는 9 그대로다(바이트가 바뀌지 않게)


def encode_png(w, h, rows, color_type=6, sub_bpp=0, level=9):
    """순수 파이썬 PNG. rows = 각 행의 픽셀 bytes(색 유형에 맞는 길이).

    sub_bpp > 0 이면 행마다 Sub 필터(픽셀당 sub_bpp 바이트)를 건다. 매끄러운 장(기온·기압·바람)은
    이웃 칸의 차가 0~1 이라 훨씬 잘 눌린다 — 실측(2026091918 f009) 기온 98→80KB · 기압 82→59KB ·
    10 m 바람 304→214KB. 해독된 픽셀은 같다(필터는 PNG 안쪽 일이다).
    듬성듬성한 장(누적강수)은 오히려 커져서(61→70KB) 걸지 않는다. 기존 c·p·w 프레임은 건드리지 않았다.

    level: 새 프레임 넷을 9 로 누르면 스텝당 1.09초가 zlib 에서만 든다(실측, 10 m 바람 한 장이 0.59초).
    7 이면 0.18초이고 크기는 3% 는다(기온 79.6→82.0KB · 바람 219→226KB). 41스텝에서 실행 시간이 먼저다.
    """
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    if sub_bpp:
        raw = b''.join(b'\x01' + _sub_filter(r, sub_bpp) for r in rows)
    else:
        raw = b''.join(b'\x00' + r for r in rows)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, color_type, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw, level)) + chunk(b'IEND', b''))


def encode_png_rgba(w, h, rows):
    return encode_png(w, h, rows, 6)


# 700hPa 바람의 선(先)양자화 눈금(m/s). _wind_byte 안에 'round(ms * 2.0) / 2.0' 으로 박혀 있던 수다 —
# 매니페스트 fields.wind700 이 같은 수를 읽도록 이름을 붙였다(인코더를 바꾸면 매니페스트가 따라 바뀐다).
# 0.5 는 2 의 거듭제곱이라 'x / 0.5' 는 'x × 2.0' 과, '정수 × 0.5' 는 '정수 / 2.0' 과 비트까지 같다 —
# 프레임 바이트는 그대로다(시험 LegacyFrameConstants 가 옛 식과 촘촘히 대조한다).
WIND_PREQ_MS = 0.5


def _wind_byte(ms):
    if ms is None:
        return 128
    q = round(ms / WIND_PREQ_MS) * WIND_PREQ_MS        # 0.5 m/s 양자화 — 값의 가짓수를 줄여 PNG 를 작게
    return int(max(0.0, min(255.0, (q + 64.0) / 128.0 * 255.0)) + 0.5)


def _cwat_byte(kg):
    if kg is None or kg <= 0.0:
        return 0
    t = (math.log10(kg) - _LOG_LO) / _LOG_SPAN
    return int(max(0.0, min(1.0, t)) * 255.0 + 0.5)


def cloud_png(cw, lc, mc, hc):
    """열을 서경180 부터 시작하게 돌린다(브라우저 텍스처 uv.x=0 이 -180)."""
    rows = []
    half = NI // 2
    for j in range(NJ):
        base = j * NI
        # 그레이+알파 2채널: 회색=운정고도, 알파=구름수. R/G 는 늘 0 이라 굽지 않는다.
        row = bytearray(NI * 2)
        for i in range(NI):
            src = base + ((i + half) % NI)
            o = i * 2
            top = _top_height_m(lc[src], mc[src], hc[src])
            # 양자화. 0.5° 로 올리면서 프레임이 커져(330KB) 눈금을 굵게 잡았다.
            # 운정고도는 음영에만 쓰므로 252m 눈금이면 충분하고, 구름수는 셰이더가
            # smoothstep(0.28,0.80) 으로 읽어 64단계면 화면에서 구분되지 않는다.
            # 이것만으로 330KB -> 229KB (실측). 값을 지어내지 않고 눈금만 굵게 한 것이다.
            g = int(max(0.0, min(1.0, top / 16000.0)) * 255.0 + 0.5)
            row[o] = (g // TOP_Q) * TOP_Q
            row[o + 1] = (_cwat_byte(cw[src]) // CWAT_Q) * CWAT_Q
        rows.append(bytes(row))
    return encode_png(NI, NJ, rows, 4)


PRATE_LO, PRATE_HI = 0.05, 30.0        # mm/h — log 인코딩 범위
_PLOG_LO = math.log10(PRATE_LO)
_PLOG_SPAN = math.log10(PRATE_HI) - _PLOG_LO


def _rate_byte(mmh):
    if mmh is None or mmh <= PRATE_LO:
        return 0
    t = (math.log10(mmh) - _PLOG_LO) / _PLOG_SPAN
    return int(max(0.0, min(1.0, t)) * 255.0 + 0.5)


def precip_png(wet, cape):
    """R=강도 · G=종류 · B=뇌우(DERIVED). 강수 없는 곳은 전부 0 이라 잘 압축된다."""
    pr = wet.get(7)
    cp = wet.get(37)
    snow = wet.get(195)
    frz = wet.get(193)
    ice = wet.get(194)
    rows = []
    half = NI // 2
    for j in range(NJ):
        base = j * NI
        row = bytearray(NI * 3)          # RGB 3채널 — 알파가 늘 255 라 굽지 않는다
        for i in range(NI):
            src = base + ((i + half) % NI)
            o = i * 3
            rate = (pr[src] or 0.0) * 3600.0
            row[o] = _rate_byte(rate)
            if row[o]:
                is_snow = bool(snow and snow[src] and snow[src] > 0.5)
                is_mix = bool((frz and frz[src] and frz[src] > 0.5)
                              or (ice and ice[src] and ice[src] > 0.5))
                row[o + 1] = 255 if is_snow else (128 if is_mix else 0)
                # 뇌우: 대류강수의 **세기** × CAPE.
                # 비율(conv/total)을 쓰면 열대의 약한 소나기도 1이 되어 지구의 5.5%가
                # 뇌우로 찍혔다(실측). 세기를 쓰면 정말 센 셀만 남는다.
                cr = (cp[src] or 0.0) * 3600.0 if cp else 0.0
                cv = (cape[src] or 0.0) if cape else 0.0
                a1 = max(0.0, min(1.0, (cr - 0.15) / 1.85))
                a2 = max(0.0, min(1.0, (cv - 500.0) / 1500.0))
                row[o + 2] = int(a1 * a2 * 255.0 + 0.5)
        rows.append(bytes(row))
    return encode_png(NI, NJ, rows, 2)


def wind_png(u, v):
    """바람을 4° 로 평균 다운샘플. 이류에 쓰는 값이라 대표값이어야 한다."""
    rows = []
    half = NI // 2
    for jj in range(WNJ):
        row = bytearray(WNI * 4)
        for ii in range(WNI):
            su = sv = 0.0
            n = 0
            for dj in range(WIND_DIV):
                j = jj * WIND_DIV + dj
                if j >= NJ:
                    continue
                for di in range(WIND_DIV):
                    i = ii * WIND_DIV + di
                    if i >= NI:
                        continue
                    src = j * NI + ((i + half) % NI)
                    if u[src] is not None and v[src] is not None:
                        su += u[src]
                        sv += v[src]
                        n += 1
            o = ii * 4
            row[o] = _wind_byte(su / n if n else 0.0)
            row[o + 1] = _wind_byte(sv / n if n else 0.0)
            row[o + 3] = 255
        rows.append(bytes(row))
    return encode_png_rgba(WNI, WNJ, rows)


# ---------- 필드 프레임 (t · u · m · a) — 2026-09-20 W0 ----------
# 구름·강수 쪽은 칸마다 파이썬 루프를 돈다. 여기는 프레임이 넷 더 생기므로 격자 전체를 bytes 한 덩이로
# 만든 뒤 행을 잘라 돌린다(슬라이스는 C 속도다). 결과는 cloud_png 의 (i + half) % NI 와 같은 방향이다.
def _rot_rows(grid_bytes, bpp):
    """격자 전체(북→남, 열0=경도 0°) → 행 목록(열0=서경180). 브라우저 텍스처 uv.x=0 이 −180 이다."""
    stride = NI * bpp
    cut = (NI // 2) * bpp
    return [grid_bytes[o + cut:o + stride] + grid_bytes[o:o + cut]
            for o in range(0, NJ * stride, stride)]


def _linear_bytes(vals, x0, per_unit):
    """8bit 선형: byte = floor((x − x0) × per_unit + 0.5), 0~255 로 누른다. → (bytes, 끝값으로 눌린 칸 수)

    반올림은 이 파일의 다른 곳과 같은 '반 올림'(+0.5 뒤 버림)이다. 눌린 칸 수를 같이 돌려주는 이유:
    범위 밖은 끝값이 된다 — 기온이 −80°C 아래로 내려가면 −80 으로 찍힌다(기압도 같다). 그게 몇 칸인지
    매니페스트에 적어 두면 범위가 모자란 날을 화면이 아니라 숫자로 안다.
    값에 None 이 있으면(비트맵 결측) TypeError — 기온·기압에는 '자료 없음'을 뜻할 바이트가 없으므로
    지어내지 않고 그 프레임을 생략한다(build_step 이 잡는다).
    """
    q = [(x - x0) * per_unit + 0.5 for x in vals]
    clipped = 0
    if min(q) < 0.0 or max(q) >= 256.0:
        clipped = sum(1 for t in q if t < 0.0 or t >= 256.0)
        q = [0.0 if t < 0.0 else (255.0 if t >= 256.0 else t) for t in q]
    return bytes(map(int, q)), clipped


def _temp_bytes(kelvin):
    """TMP 는 켈빈으로 온다. °C = K − 273.15 → byte = round((°C + 80) / 0.5)."""
    return _linear_bytes(kelvin, 273.15 + TEMP_LO_C, 1.0 / TEMP_STEP_C)


def _mslp_bytes(pascal):
    """PRMSL 은 파스칼로 온다. hPa = Pa / 100 → byte = round((hPa − MSLP_LO_HPA) / MSLP_STEP_HPA)."""
    return _linear_bytes(pascal, MSLP_LO_HPA * 100.0, 1.0 / (MSLP_STEP_HPA * 100.0))


def _wind10_byte(ms):
    """10 m 바람 → byte. 디코드 식은 700hPa 바람(_wind_byte)과 **같다**: m/s = byte / 255 × 128 − 64.

    다만 _wind_byte 의 0.5 m/s 선(先)양자화는 하지 않는다. 그것은 값을 0.5 격자로 한 번, 바이트 격자
    (128/255 = 0.502 m/s)로 또 한 번 잘라 오차가 두 배가 된다 — 실측(2026091918 f009, 10 m u):
      선양자화 있음  최대 0.498 · 평균 0.232 m/s · PNG 214KB   /   없음  최대 0.251 · 평균 0.125 m/s · PNG 219KB
    700hPa 는 4° 평균을 구름 이류에만 쓰니 상관없지만, 지표 바람은 값을 읽고 색을 나눈다(1·5·10 m/s 경계).
    크기 2% 를 주고 오차를 절반으로 샀다. 브라우저가 쓰는 디코드 식은 그대로라 두 프레임이 한 식으로 풀린다.
    """
    if ms is None:
        return 128
    return int(max(0.0, min(255.0, (ms + 64.0) / 128.0 * 255.0)) + 0.5)


def _wind_bytes(vals):
    """_wind10_byte 를 격자 전체에. 식을 한 글자도 다르게 쓰지 않는다(시험이 둘이 같은지 본다)."""
    return bytes([128 if x is None else int(max(0.0, min(255.0, (x + 64.0) / 128.0 * 255.0)) + 0.5)
                  for x in vals])


def _apcp_byte(mm):
    """누적강수 mm → log 로 눌러 0~255. 0.1 mm 이하 = 0 (강수 강도 _rate_byte 와 같은 문법)."""
    if mm is None or mm <= APCP_LO:
        return 0
    t = (math.log10(mm) - _ALOG_LO) / _ALOG_SPAN
    return int(max(0.0, min(1.0, t)) * 255.0 + 0.5)


def temp_png(t2m):
    """→ (PNG, 끝값으로 눌린 칸 수). 회색 1채널(색 유형 0) — 브라우저는 R=G=B=값 으로 펼친다."""
    b, clipped = _temp_bytes(t2m)
    return encode_png(NI, NJ, _rot_rows(b, 1), 0, sub_bpp=1, level=FIELD_ZLIB), clipped


def mslp_png(prmsl):
    b, clipped = _mslp_bytes(prmsl)
    return encode_png(NI, NJ, _rot_rows(b, 1), 0, sub_bpp=1, level=FIELD_ZLIB), clipped


def wind10_png(u10, v10):
    """R=u · G=v · B=0. 4° 평균을 내지 않는다 — 지표 바람은 입자와 색면이 격자 그대로 읽는다.

    왜 회색+알파(2채널)가 아니라 RGB 인가: 알파에 값을 실으면 브라우저가 캔버스로 읽을 때
    알파 선곱(premultiply)으로 회색 값이 깎인다. B 는 늘 0 이라 압축에서 사라진다.
    """
    rgb = bytearray(NI * NJ * 3)
    rgb[0::3] = _wind_bytes(u10)
    rgb[1::3] = _wind_bytes(v10)
    return encode_png(NI, NJ, _rot_rows(bytes(rgb), 3), 2, sub_bpp=3, level=FIELD_ZLIB)


def apcp_png(apcp):
    """6시간 버킷 누적강수. 구간(fromH~toH)은 프레임이 아니라 매니페스트가 말한다."""
    b = bytes([0 if (x is None or x <= APCP_LO) else _apcp_byte(x) for x in apcp])
    return encode_png(NI, NJ, _rot_rows(b, 1), 0, level=FIELD_ZLIB)


def build_step(run, step):
    raw = http_get(url_for(run, step))
    if raw[:4] != b'GRIB':
        raise RuntimeError('GFS_FC_NOT_GRIB f%03d' % step)
    picked, seen = scan_messages(raw)
    cw, lc, mc, hc, u, v, wet, cape = required_fields(picked)
    png = cloud_png(cw, lc, mc, hc)
    wpng = wind_png(u, v)
    ppng = precip_png(wet, cape)
    n = float(len(cw))
    pr = wet.get(7)
    out = {
        'h': step, 'png': png, 'wind': wpng, 'precip': ppng, 'srcBytes': len(raw),
        'wetGt01': round(sum(1 for x in pr if x and x * 3600 > 0.1) / n, 4),
        'cwatGt005': round(sum(1 for x in cw if x is not None and x > 0.05) / n, 4),
        'cwatGt03': round(sum(1 for x in cw if x is not None and x > 0.3) / n, 4),
        'messages': seen,
    }
    # 여기까지가 예전 스텝이다. 구름이 다 만들어졌으니 필수 목록(26만 칸 × 12)을 놓고 나서 새 필드를 푼다.
    del cw, lc, mc, hc, u, v, wet, cape, pr
    try:
        opt, why = optional_fields(picked)
        out['decoded'] = (sum(1 for k in picked if k not in OPTIONAL_FIELDS)
                          + sum(1 for k in OPTIONAL_FIELDS if k in opt))
        out.update(field_frames(step, opt, why))
    except Exception as e:  # noqa: BLE001 — 안쪽에서 이미 필드마다 잡는다. 그래도 새는 것이 구름을 죽이면 안 된다
        print('[field] f%03d 필드 프레임 전체 생략' % step, repr(e)[:160])
        out.update({'fields': {}, 'skipped': {name: 'UNEXPECTED:' + repr(e)[:100] for name in FIELD_FILES}})
    return out


def field_frames(step, opt, why):
    """선택 필드 → 프레임. 구름 프레임이 다 만들어진 **뒤에** 부른다.

    프레임마다 따로 try 한다: 하나가 탈이 나도 나머지와 구름은 산다. 빠진 것은 이유와 함께
    'skipped' 에 남아 매니페스트 fieldMissing 으로 간다 — 조용히 빠지지 않는다.
    """
    frames, skipped = {}, {}

    def attempt(name, needs, build):
        absent = [k for k in needs if k not in opt]
        if absent:
            skipped[name] = '; '.join('%s:%s' % (k, why.get(k, 'NOT_IN_GRIB')) for k in absent)
            return
        try:
            frames[name] = build()
        except Exception as e:  # noqa: BLE001 — 새 필드 하나의 탈이 구름을 죽이면 안 된다
            skipped[name] = repr(e)[:120]
            print('[field] f%03d %s 생략' % (step, name), repr(e)[:160])

    if not FIELDS_ON:
        return {'fields': {}, 'skipped': {}}
    attempt('temp', ('t2m',), lambda: temp_png(opt['t2m']))
    attempt('wind10', ('u10', 'v10'), lambda: (wind10_png(opt['u10'], opt['v10']), 0))
    attempt('mslp', ('prmsl',), lambda: mslp_png(opt['prmsl']))

    def build_apcp():
        from_h, to_h = opt['apcpWindow']
        if to_h != step or from_h < 0 or to_h - from_h > 6:
            # 구간의 끝이 이 스텝이 아니거나 6시간보다 길면 우리가 아는 버킷 규칙이 아니다 — 굽지 않는다.
            raise RuntimeError('GFS_FC_APCP_WINDOW_UNEXPECTED:%s-%s@f%03d' % (from_h, to_h, step))
        return apcp_png(opt['apcp']), 0

    attempt('apcp', ('apcp',), build_apcp)
    if step == 0 and skipped.get('apcp') == 'apcp:NOT_IN_GRIB':
        # 분석장(f000)에는 누적이 없다 — 빠진 것이 아니라 원래 없는 것이다. 결함 목록에 올리지 않는다.
        del skipped['apcp']
    res = {'fields': {}, 'skipped': skipped}
    for name, (png, clipped) in frames.items():
        res['fields'][name] = {'png': png, 'clipped': clipped}
    if 'apcp' in frames:
        res['apcpWindow'] = {'fromH': opt['apcpWindow'][0], 'toH': opt['apcpWindow'][1]}
    return res


# 프레임 이름(= 매니페스트 스텝 키) → 파일 머리글자. 'wind' 는 700hPa 4° 가 이미 쓰고 있어 10 m 는 'wind10' 이다.
FIELD_FILES = {'temp': 't', 'wind10': 'u', 'mslp': 'm', 'apcp': 'a'}
# 옛 프레임 3종이 매니페스트 fields{} 에서 쓰는 id — v2 공용 프레임 저장소(gfs-frames.js FRAME_STEP_KEY)의 이름 그대로다.
# 스텝 키는 개명하지 않는다: cloud → steps[].file · wind700 → steps[].wind · precip → steps[].precip.
# 이 셋은 모든 스텝의 필수 프레임이라 끄개(FIELDS_ON)와 무관하게 늘 싣는다(머리 주석 C1).
LEGACY_FIELD_IDS = ('cloud', 'wind700', 'precip')

# 사람이 읽는 풀이 — 기존 encoding 칸의 문체를 따른다. 기계가 읽는 상수는 field_specs() 다.
FIELD_ENCODING_TEXT = {
    'temp': 'TMP 2 m above ground, grayscale 8bit linear: degC = byte*%.1f%+.0f (%.1f..%.1f, clamped)'
            % (TEMP_STEP_C, TEMP_LO_C, TEMP_LO_C, TEMP_LO_C + 255 * TEMP_STEP_C),
    'wind10.R': 'UGRD 10 m above ground, m/s: R/255*128-64 (same decode as wind.R; full grid, no 4° mean, '
                'no 0.5 m/s pre-quantization)',
    'wind10.G': 'VGRD 10 m above ground, m/s: G/255*128-64 (same decode as wind.G; full grid, no 4° mean, '
                'no 0.5 m/s pre-quantization)',
    'mslp': 'PRMSL mean sea level, grayscale 8bit linear: hPa = byte*%.1f+%.0f (%.1f..%.1f, clamped)'
            % (MSLP_STEP_HPA, MSLP_LO_HPA, MSLP_LO_HPA, MSLP_LO_HPA + 255 * MSLP_STEP_HPA),
    'apcp': 'APCP surface accumulated precipitation mm, log: 0 if byte==0 else 10^(byte/255*%.4f%+.4f); '
            '0 at or below %.1f, 255 at %.0f. Window per step = steps[].apcpWindow (GFS 6-hour bucket: '
            '3 h at h%%6==3, 6 h at h%%6==0; none at h=0)' % (_ALOG_SPAN, _ALOG_LO, APCP_LO, APCP_HI),
}


def field_specs():
    """필드별 디코드 상수 — 렌더러가 글을 해석하지 않고 숫자를 그대로 읽게 한다.

    linear: value = byte × scale + offset.  log10: byte 0 = 0, 아니면 value = 10^(byte/255 × logSpan + logLo).
    채널 하나에 값 하나라 LinearFilter 보간이 값 보간이 된다(머리 주석).

    2026-09-20 C1: 옛 프레임 3종(LEGACY_FIELD_IDS)을 뒤에 **더했다**. 앞의 넷은 글자 하나 바꾸지 않았다.
    channels{} 에는 저장소가 풀 수 있는 '양'만 싣는다. 종류 부호·유도값은 notDecoded{}(저장소가 읽지 않는 설명 칸)에
    'encoding 의 어느 글을 보라'만 적는다 — 이유는 머리 주석 C1. 숫자는 전부 인코더가 쓰는 이름에서 온다.
    """
    grid = {'ni': NI, 'nj': NJ, 'sameAs': 'grid'}
    wind = {'transfer': 'linear', 'scale': 128.0 / 255.0, 'offset': -64.0, 'min': -64.0, 'max': 64.0,
            'clamped': True}
    # ---- 옛 셋의 재료 (C1)
    # 700hPa 바람: wind_png 은 점 WIND_DIV × WIND_DIV 개를 평균한다. 묶음 (ii, jj) 의 점은 열 ii·DIV … ii·DIV + DIV−1 이라
    # 그 가운데는 첫 점에서 (DIV − 1)/2 칸이다. 저장소는 이 격자를 점 격자로 읽으므로 원점을 가운데로 적는다(머리 주석 C1).
    block_off = (WIND_DIV - 1) / 2.0 * RES_DEG
    wind_grid = {'ni': WNI, 'nj': WNJ, 'lon0': GRID_LON0 + block_off, 'lat0': GRID_LAT0 - block_off,
                 'dLon': WIND_DIV * RES_DEG, 'dLat': WIND_DIV * RES_DEG,
                 'sameAs': 'windGrid, stated as the centres of its cells'}
    wind700 = dict(wind, preQuantized=WIND_PREQ_MS)
    wind_max_err = WIND_PREQ_MS / 2.0 + wind['scale'] / 2.0
    # 구름 알파·회색은 눈금의 배수로 내림된다(cloud_png) — 255 는 나오지 않는다. 닿을 수 있는 가장 큰 바이트에서 끝값을 셈한다.
    cwat_top_byte = (255 // CWAT_Q) * CWAT_Q
    legacy = {
        'cloud': {'file': 'c{h:03d}.png', 'stepKey': 'file', 'png': 'gray+alpha8', 'grid': grid,
                  'variable': 'CWAT', 'level': 'entire atmosphere (considered as a single layer)',
                  'unit': 'kg/m^2',
                  'channels': {'A': {'transfer': 'log10', 'logLo': _LOG_LO, 'logSpan': _LOG_SPAN,
                                     'zeroByte': 0, 'min': CWAT_LO,
                                     'max': 10 ** (cwat_top_byte / 255.0 * _LOG_SPAN + _LOG_LO),
                                     'maxByte': cwat_top_byte, 'byteStep': CWAT_Q, 'rounding': 'floor'}},
                  'notDecoded': {'gray': {
                      'kind': 'derived', 'encodingKeys': ['B', 'quantization'],
                      'browserChannels': 'R=G=B', 'byteStep': TOP_Q, 'rounding': 'floor',
                      'why': 'DERIVED cloud-top height, not a GFS output: a store that decodes it would '
                             'publish and time-blend it like a measured quantity. It is also unreliable '
                             'on the CPU side: reading the PNG back through a canvas premultiplies by '
                             'alpha, so gray is damaged where alpha is small and lost where alpha is 0'}},
                  'note': 'same formula as encoding.A. Alpha bytes are floored to multiples of %d, so a '
                          'decoded value is never above the true one by more than half a byte tick and '
                          'can be below it by up to %.1f byte ticks; byte 255 never occurs (top byte %d). '
                          'Byte 0 = no cloud water, or less than the first step above %.3f kg/m^2'
                          % (CWAT_Q, CWAT_Q - 0.5, cwat_top_byte, CWAT_LO)},
        'wind700': {'file': 'w{h:03d}.png', 'stepKey': 'wind', 'png': 'rgba8 (B unused = 0, A = 255)',
                    'grid': wind_grid,
                    'variable': 'UGRD,VGRD', 'level': '%s mb' % WIND_LEVEL, 'unit': 'm/s',
                    'channels': {'R': dict(wind700, component='u (eastward)'),
                                 'G': dict(wind700, component='v (northward)')},
                    'cellMean': {'of': 'grid', 'ni': WIND_DIV, 'nj': WIND_DIV,
                                 'note': 'each value is the mean of the %d x %d grid points whose first '
                                         'point is column ii*%d, row jj*%d of grid; grid.lon0/lat0 here '
                                         'are the centres of those blocks (first point + %.2f deg), not '
                                         'the first point' % (WIND_DIV, WIND_DIV, WIND_DIV, WIND_DIV,
                                                              block_off)},
                    'note': 'same decode formula as wind10; values are pre-quantized to %.1f m/s before '
                            'the byte, so the round-trip error is up to %.3f m/s. Byte 128 (calm, or no '
                            'data in the block) decodes to %+.3f m/s because 0 m/s falls between two '
                            'bytes. The last row averages only the %d grid row(s) that exist, so its '
                            'true centre is nearer the pole than grid.lat0 says and values poleward of '
                            'the last full block are a blend with it. Used to advect cloud between '
                            'frames, not a surface wind'
                            % (WIND_PREQ_MS, wind_max_err, 128 * wind['scale'] + wind['offset'],
                               NJ - (WNJ - 1) * WIND_DIV)},
        'precip': {'file': 'p{h:03d}.png', 'stepKey': 'precip', 'png': 'rgb8', 'grid': grid,
                   'variable': 'PRATE', 'level': 'surface', 'unit': 'mm/h',
                   'channels': {'R': {'transfer': 'log10', 'logLo': _PLOG_LO, 'logSpan': _PLOG_SPAN,
                                      'zeroByte': 0, 'min': PRATE_LO, 'max': PRATE_HI}},
                   'notDecoded': {
                       'G': {'kind': 'category', 'encodingKeys': ['precip.G'],
                             'why': 'a type code, not a quantity: blending two codes in space or time '
                                    'yields a third code that the model never issued. Read the nearest '
                                    'cell of one frame; written only where R > 0'},
                       'B': {'kind': 'derived', 'encodingKeys': ['precip.B'],
                             'why': 'DERIVED likelihood made here, not a GFS output and without a unit: '
                                    'a store that decodes it would publish and time-blend it like a '
                                    'measured quantity. Written only where R > 0'}},
                   'note': 'instantaneous model precipitation rate at the valid time (PRATE x 3600), '
                           'not an accumulation - for amounts use apcp. Byte 0 = no precipitation '
                           '(at or below %.2f mm/h); rates above %.0f mm/h are clamped to byte 255'
                           % (PRATE_LO, PRATE_HI)},
    }
    # 새 넷이 앞, 옛 셋이 뒤다 — 이미 나가던 JSON 의 앞부분이 그대로 남는다.
    return dict(_new_field_specs(grid, wind), **legacy)


def _new_field_specs(grid, wind):
    """W0 의 새 넷(temp · wind10 · mslp · apcp). field_specs 의 본문이던 것을 그대로 옮겼다 — 값도 순서도 같다."""
    return {
        'temp': {'file': 't{h:03d}.png', 'stepKey': 'temp', 'png': 'gray8', 'grid': grid,
                 'variable': 'TMP', 'level': '2 m above ground', 'unit': 'degC',
                 'channels': {'R': {'transfer': 'linear', 'scale': TEMP_STEP_C, 'offset': TEMP_LO_C,
                                    'min': TEMP_LO_C, 'max': TEMP_LO_C + 255 * TEMP_STEP_C,
                                    'clamped': True}},
                 'note': 'model 2 m temperature on a %.2f° cell (~%.0f km), not a station value'
                         % (RES_DEG, RES_DEG * 111.0)},
        'wind10': {'file': 'u{h:03d}.png', 'stepKey': 'wind10', 'png': 'rgb8 (B unused = 0)', 'grid': grid,
                   'variable': 'UGRD,VGRD', 'level': '10 m above ground', 'unit': 'm/s',
                   'channels': {'R': dict(wind, component='u (eastward)'),
                                'G': dict(wind, component='v (northward)')},
                   'note': 'same decode formula as the 700 hPa wind frame (wind.R/G) but on the full grid '
                           'and without the 0.5 m/s pre-quantization (max error 0.251 m/s instead of 0.5)'},
        'mslp': {'file': 'm{h:03d}.png', 'stepKey': 'mslp', 'png': 'gray8', 'grid': grid,
                 'variable': 'PRMSL', 'level': 'mean sea level', 'unit': 'hPa',
                 'channels': {'R': {'transfer': 'linear', 'scale': MSLP_STEP_HPA, 'offset': MSLP_LO_HPA,
                                    'min': MSLP_LO_HPA, 'max': MSLP_LO_HPA + 255 * MSLP_STEP_HPA,
                                    'clamped': True}},
                 'note': 'values outside the range are clamped to the end value; '
                         'steps[].mslpClipped counts such cells'},
        'apcp': {'file': 'a{h:03d}.png', 'stepKey': 'apcp', 'png': 'gray8', 'grid': grid,
                 'variable': 'APCP', 'level': 'surface', 'unit': 'mm',
                 'channels': {'R': {'transfer': 'log10', 'logLo': _ALOG_LO, 'logSpan': _ALOG_SPAN,
                                    'zeroByte': 0, 'min': APCP_LO, 'max': APCP_HI}},
                 'window': 'steps[].apcpWindow {fromH,toH} hours from run, read from GRIB PDT 4.8',
                 'note': 'GFS 6-hour bucket as delivered (resets every 6 h): 3 h at h%6==3, 6 h at h%6==0; '
                         'no frame at h=0 (analysis has no accumulation). 3-hour amount at h%6==0 is '
                         'a[h] - a[h-3]. The run-total APCP record is not published.'},
    }


def read_previous_manifest():
    """지난번 매니페스트 → (문서 또는 None, 상태 글). runs[] 를 잇기 위해서만 읽는다.

    어떤 실패도 예외로 올리지 않는다 — 못 읽으면 runs[] 가 이번 런 하나로 다시 시작할 뿐이고 구름은 산다.
    상태 글은 매니페스트에 적힌다(previousManifest): 권한이 없어 계속 못 읽으면 runs[] 가 늘 1건인 이유가 보인다.
    """
    try:
        raw = s3.get_object(Bucket=BUCKET, Key=PREFIX + '/manifest.json')['Body'].read()
        doc = json.loads(raw.decode('utf-8'))
        return (doc, 'ok') if isinstance(doc, dict) else (None, 'not-an-object')
    except Exception as e:  # noqa: BLE001
        name = type(e).__name__
        code = ''
        try:
            code = e.response['Error']['Code']                   # botocore ClientError
        except Exception:  # noqa: BLE001
            pass
        if code in ('NoSuchKey', '404'):
            return None, 'absent'
        print('[runs] 지난 매니페스트를 못 읽음', repr(e)[:160])
        return None, 'error:%s%s' % (name, (':' + code) if code else '')


def merge_runs(prev, current):
    """최근 RUNS_KEEP 런의 (tag · run · manifest 경로) — '런 ↔ 런' 비교의 재료. 새 런이 앞이다.

    지난 매니페스트의 runs[] 만 잇는다. runs[] 가 없는 옛 매니페스트(W0 이전)의 런은 넣지 않는다 —
    그 런 폴더에는 manifest.json 사본이 없어서, 넣으면 없는 파일을 가리키게 된다.
    같은 런을 다시 만들면(3시간마다 돈다 · GFS 는 하루 4런) 그 칸을 새 것으로 바꾼다.
    """
    seen = {current['tag']: current}
    for r in (prev or {}).get('runs') or []:
        if (isinstance(r, dict) and isinstance(r.get('tag'), str) and isinstance(r.get('manifest'), str)
                and r['tag'] not in seen):
            seen[r['tag']] = r
    # tag = YYYYMMDDHH 라 글자 순서가 곧 시간 순서다.
    return [seen[t] for t in sorted(seen, reverse=True)][:RUNS_KEEP]


def put(key, body, ctype, cache):
    s3.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType=ctype, CacheControl=cache)


def handler(event, context):
    t0 = time.time()
    run = pick_run()
    steps = list(range(0, MAX_H + 1, STEP_H))
    print('[run] 선택', run.isoformat(), '스텝', len(steps))
    done = {}
    failed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(build_step, run, s): s for s in steps}
        for fut in concurrent.futures.as_completed(futs):
            s = futs[fut]
            if time.time() - t0 > DEADLINE_S:
                failed.append((s, 'deadline'))
                continue
            try:
                done[s] = fut.result()
            except Exception as e:  # noqa: BLE001
                failed.append((s, repr(e)[:120]))
                print('[step] f%03d 실패' % s, repr(e)[:160])

    if not done:
        raise RuntimeError('GFS_FC_NO_FRAMES')

    run_tag = run.strftime('%Y%m%d%H')
    manifest_steps = []
    field_missing = {name: [] for name in FIELD_FILES} if FIELDS_ON else {}
    for s in sorted(done):
        fr = done[s]
        put('%s/%s/c%03d.png' % (PREFIX, run_tag, s), fr['png'],
            'image/png', 'public, max-age=86400, immutable')
        put('%s/%s/w%03d.png' % (PREFIX, run_tag, s), fr['wind'],
            'image/png', 'public, max-age=86400, immutable')
        put('%s/%s/p%03d.png' % (PREFIX, run_tag, s), fr['precip'],
            'image/png', 'public, max-age=86400, immutable')
        entry = {
            'h': s,
            'valid': (run + timedelta(hours=s)).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'file': '%s/c%03d.png' % (run_tag, s),
            'wind': '%s/w%03d.png' % (run_tag, s),
            'precip': '%s/p%03d.png' % (run_tag, s),
            'bytes': len(fr['png']),
            'windBytes': len(fr['wind']),
            'precipBytes': len(fr['precip']),
            'wetGt01': fr['wetGt01'],
            'cwatGt005': fr['cwatGt005'],
            'cwatGt03': fr['cwatGt03'],
        }
        # 필드 프레임 — 올라간 것만 적는다. 없는 프레임의 키는 아예 없다(빈 경로를 적지 않는다).
        skipped = dict(fr.get('skipped') or {})
        for name, letter in FIELD_FILES.items():
            got = (fr.get('fields') or {}).get(name)
            if not got:
                continue
            rel = '%s/%s%03d.png' % (run_tag, letter, s)
            try:
                put('%s/%s' % (PREFIX, rel), got['png'], 'image/png', 'public, max-age=86400, immutable')
            except Exception as e:  # noqa: BLE001 — 새 프레임의 업로드 실패가 구름 매니페스트를 막으면 안 된다
                skipped[name] = 'PUT_FAILED:' + repr(e)[:100]
                continue
            entry[name] = rel
            entry[name + 'Bytes'] = len(got['png'])
            if name in ('temp', 'mslp'):
                entry[name + 'Clipped'] = got['clipped']     # 범위 밖이라 끝값으로 눌린 칸 수
            if name == 'apcp':
                entry['apcpWindow'] = fr['apcpWindow']       # GRIB 이 말한 누적 구간(시간). 3h 또는 6h 다
        for name, reason in skipped.items():
            field_missing.setdefault(name, []).append({'h': s, 'why': reason})
        manifest_steps.append(entry)

    generated_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    prev, prev_status = read_previous_manifest()
    runs = merge_runs(prev, {
        'tag': run_tag, 'run': run.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'manifest': '%s/manifest.json' % run_tag,
        'generatedAt': generated_at, 'frames': len(manifest_steps),
    })

    manifest = {
        'source': 'NOAA NCEP GFS %.2f° (NOMADS filter_gfs_%s)' % (RES_DEG, RES),
        'truthClass': 'MODEL_SIGNAL',
        'run': run.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'generatedAt': generated_at,
        'grid': {'ni': NI, 'nj': NJ, 'lon0': GRID_LON0, 'dLon': RES_DEG, 'lat0': GRID_LAT0, 'dLat': -RES_DEG,
                 'note': 'row 0 = 90N, col 0 = 180W; %.2f° ≈ %.0fkm at equator'
                         % (RES_DEG, RES_DEG * 111.0)},
        # ⚠️ dLon/dLat 에 WIND_DIV(다운샘플 '배수')를 그대로 적고 있었다 — 0.5° 로 올린 뒤로 운영 매니페스트가
        #    4° 격자를 8.0 이라고 말했다(2026-09-20 실측: ni 90 · dLon 8.0 → 720°). 배수 × 해상도가 도(°)다.
        #    브라우저는 이 칸을 읽지 않아(windGrid 검색 0건) 화면은 멀쩡했다. 값만 바로잡고 키는 그대로다.
        'windGrid': {'ni': WNI, 'nj': WNJ, 'dLon': WIND_DIV * RES_DEG, 'dLat': WIND_DIV * RES_DEG,
                     'note': 'separate low-res file; wind is smooth so 4° suffices '
                             '(cuts per-user transfer by 43%)'},
        'encoding': {
            'A': 'CWAT column cloud water kg/m², log: cwat = 10^(A/255*%.4f + %.4f); 0 below %.3f, 255 at %.1f'
                 % (_LOG_SPAN, _LOG_LO, CWAT_LO, CWAT_HI),
            'quantization': 'cloud PNG is grayscale+alpha; top height in %d steps (~%.0f m), '
                            'cloud water in %d levels — values are not invented, only the '
                            'grid of representable values is coarser (cuts frame size 330->229KB)'
                            % (256 // TOP_Q, TOP_Q / 255.0 * 16000.0, 256 // CWAT_Q),
            'B': 'DERIVED cloud top height, metres: B/255*16000 '
                 '(topmost of LCDC/MCDC/HCDC at %.0f/%.0f/%.0f m; not a GFS output field)'
                 % (TOP_L, TOP_M, TOP_H),
            'precip.R': 'PRATE mm/h, log: 0 below %.2f, 255 at %.0f' % (PRATE_LO, PRATE_HI),
            'precip.G': 'type: 0 rain, 128 freezing/sleet, 255 snow (GFS CRAIN/CFRZR/CICEP/CSNOW)',
            'precip.B': 'DERIVED thunder likelihood = ramp(CPRAT mm/h, 0.15..2.0) × '
                        'ramp(CAPE, 500..2000); not a GFS output field',
            'wind.R': 'UGRD %s hPa, m/s: R/255*128-64 (0.5 m/s quantized, 4° mean)' % WIND_LEVEL,
            'wind.G': 'VGRD %s hPa, m/s: G/255*128-64 (0.5 m/s quantized, 4° mean)' % WIND_LEVEL,
        },
        'stepHours': STEP_H,
        'steps': manifest_steps,
        'missingSteps': [s for s, _ in failed],
        'note': '불투명도는 두께(CWAT), 높이는 층별 비율에서 유도(B=DERIVED). '
                '구름 비율로 불투명도를 만들면 지구 절반이 90%라 베일이 된다(실측). '
                '프레임 사이 값은 바람으로 이류한 보간이며 모델 출력이 아니다. 없는 스텝은 만들지 않았다.',
        'decoder': 'grib2lite (pure python, validated against eccodes 2.48)',
        'elapsedS': round(time.time() - t0, 1),
    }
    # ---- 여기부터 2026-09-20 W0 에서 **더한** 키. 위의 옛 키는 지우지도 개명하지도 않았다(브라우저가 읽는다).
    manifest['schema'] = MANIFEST_SCHEMA
    manifest['model'] = 'GFS'
    manifest['resolutionDeg'] = RES_DEG
    manifest['runTag'] = run_tag
    specs = field_specs()
    if FIELDS_ON:
        manifest['encoding'].update(FIELD_ENCODING_TEXT)
        manifest['fields'] = specs
        manifest['fieldMissing'] = field_missing
    else:
        # 끄개를 내려도 옛 셋(c · w · p)의 상수는 싣는다 — 그 프레임은 늘 있고, 상수는 인코더의 성질이지 요청의 성질이 아니다.
        # 새 넷은 프레임이 없으니 싣지 않는다(없는 프레임의 풀이를 적지 않는다). 이유는 머리 주석 C1.
        manifest['fields'] = {name: specs[name] for name in LEGACY_FIELD_IDS}
    manifest['decodeStats'] = {
        'messagesPerStep': max(fr.get('messages', 0) for fr in done.values()),
        'decodedPerStep': max(fr.get('decoded', 0) for fr in done.values()),
        'note': 'describe first, decode only what is used (NOMADS returns var × level cross product)',
    }
    manifest['runs'] = runs
    manifest['runsNote'] = ('newest first, up to %d runs; manifest paths are relative to this file '
                            '(like steps[].file). Runs made before schema 2 have no per-run copy '
                            'and are not listed.' % RUNS_KEEP)
    manifest['previousManifest'] = prev_status
    manifest['elapsedS'] = round(time.time() - t0, 1)
    body = json.dumps(manifest, ensure_ascii=False).encode('utf-8')
    # 런 폴더 안의 사본 — runs[] 가 가리키는 곳이다. 같은 런은 3시간 뒤 다시 만들어 덮어쓰므로 짧게 캐시한다.
    # 맨 위 manifest.json 이 마지막이다: 사본이 먼저 있어야 runs[] 의 경로가 빈 곳을 가리키지 않는다.
    try:
        put('%s/%s/manifest.json' % (PREFIX, run_tag), body,
            'application/json; charset=utf-8', 'public, max-age=300')
    except Exception as e:  # noqa: BLE001 — 사본 실패가 본 매니페스트(구름)를 막으면 안 된다
        print('[runs] 런 사본 실패', repr(e)[:160])
        manifest['runs'] = [r for r in runs if r.get('tag') != run_tag]
        body = json.dumps(manifest, ensure_ascii=False).encode('utf-8')
    put(PREFIX + '/manifest.json', body, 'application/json; charset=utf-8', 'public, max-age=300')
    print('[done]', run_tag, '프레임', len(manifest_steps), '실패', len(failed), '경과', manifest['elapsedS'], 's',
          '필드 빠짐', {k: len(v) for k, v in field_missing.items() if v})
    return {'ok': True, 'run': run_tag, 'frames': len(manifest_steps), 'failed': failed[:10],
            'fieldMissing': {k: len(v) for k, v in field_missing.items() if v}}
