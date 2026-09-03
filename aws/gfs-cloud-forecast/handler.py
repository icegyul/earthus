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
강수 p{step}.png (RGBA, 360×181 = 1°) — 구름 밑 지표에 비/눈/뇌우를 그리기 위한 자료:
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
# 바람은 부드러워 4°면 충분하다 — 해상도를 올려도 바람 파일은 그대로 90×46 으로 둔다.
WIND_DIV = int(round(4.0 / RES_DEG))  # 바람 다운샘플 배수 → 90×46 (4° 격자)
WNI, WNJ = NI // WIND_DIV, (NJ + WIND_DIV - 1) // WIND_DIV
DEADLINE_S = int(os.environ.get('GFS_FC_DEADLINE_S', '840'))
CWAT_LO, CWAT_HI = 0.005, 2.0        # log 인코딩 범위 (kg/m²)
TOP_Q = 4                            # 운정고도 양자화 눈금 (4/255*16000 ≈ 252 m)
CWAT_Q = 4                           # 구름수 양자화 눈금 (256/4 = 64 단계)
_LOG_LO = math.log10(CWAT_LO)
_LOG_SPAN = math.log10(CWAT_HI) - _LOG_LO

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
def fields_from_grib(raw):
    """CWAT · L/M/H 층별 구름 비율 · U/V 바람 · 강수(PRATE/CPRAT/종류/CAPE). 하나라도 없으면 예외.

    층별 구름 비율의 레벨타입: 저 214 · 중 224 · 고 234. pdt 0 만 쓴다(pdt 8 은 구간 평균).
    """
    cw = lc = mc = hc = u = v = cape = None
    wet = {}
    for secs in gl.messages(raw):
        d, g, vals = gl.decode(secs)
        if (g['ni'], g['nj']) != (NI, NJ) or g['lat1'] != 90.0 or g['lon1'] != 0.0 or g['jPositive']:
            raise RuntimeError('GFS_FC_GRID_UNEXPECTED:%r' % (g,))
        cat, num, lt, pdt = d['category'], d['number'], d['levelType'], d['pdt']
        if cat == 6 and lt == 200 and pdt == 0:
            cw = vals                                   # 연직 구름수 총량 kg/m²
        elif cat == 6 and pdt == 0 and lt == 214:
            lc = vals
        elif cat == 6 and pdt == 0 and lt == 224:
            mc = vals
        elif cat == 6 and pdt == 0 and lt == 234:
            hc = vals
        elif cat == 2 and num == 2 and lt == 100:
            u = vals
        elif cat == 2 and num == 3 and lt == 100:
            v = vals
        elif cat == 1 and lt == 1 and pdt == 0:
            # 지표 수분 계열: 7=PRATE 37=CPRAT 192=CRAIN 193=CFRZR 194=CICEP 195=CSNOW
            wet[num] = vals
        elif cat == 7 and num == 6 and lt == 1 and pdt == 0:
            cape = vals
    missing = [n for n, x in (('CWAT', cw), ('LCDC', lc), ('MCDC', mc), ('HCDC', hc),
                              ('UGRD', u), ('VGRD', v),
                              ('PRATE', wet.get(7)), ('CSNOW', wet.get(195)),
                              ('CAPE', cape)) if x is None]
    if missing:
        raise RuntimeError('GFS_FC_FIELDS_MISSING:%s' % ','.join(missing))
    return cw, lc, mc, hc, u, v, wet, cape


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
def encode_png(w, h, rows, color_type=6):
    """순수 파이썬 PNG. rows = 각 행의 픽셀 bytes(색 유형에 맞는 길이)."""
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''.join(b'\x00' + r for r in rows)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, color_type, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def encode_png_rgba(w, h, rows):
    return encode_png(w, h, rows, 6)


def _wind_byte(ms):
    if ms is None:
        return 128
    q = round(ms * 2.0) / 2.0                          # 0.5 m/s 양자화 — 값의 가짓수를 줄여 PNG 를 작게
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


def build_step(run, step):
    raw = http_get(url_for(run, step))
    if raw[:4] != b'GRIB':
        raise RuntimeError('GFS_FC_NOT_GRIB f%03d' % step)
    cw, lc, mc, hc, u, v, wet, cape = fields_from_grib(raw)
    png = cloud_png(cw, lc, mc, hc)
    wpng = wind_png(u, v)
    ppng = precip_png(wet, cape)
    n = float(len(cw))
    pr = wet.get(7)
    return {
        'h': step, 'png': png, 'wind': wpng, 'precip': ppng, 'srcBytes': len(raw),
        'wetGt01': round(sum(1 for x in pr if x and x * 3600 > 0.1) / n, 4),
        'cwatGt005': round(sum(1 for x in cw if x is not None and x > 0.05) / n, 4),
        'cwatGt03': round(sum(1 for x in cw if x is not None and x > 0.3) / n, 4),
    }


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
    for s in sorted(done):
        fr = done[s]
        put('%s/%s/c%03d.png' % (PREFIX, run_tag, s), fr['png'],
            'image/png', 'public, max-age=86400, immutable')
        put('%s/%s/w%03d.png' % (PREFIX, run_tag, s), fr['wind'],
            'image/png', 'public, max-age=86400, immutable')
        put('%s/%s/p%03d.png' % (PREFIX, run_tag, s), fr['precip'],
            'image/png', 'public, max-age=86400, immutable')
        manifest_steps.append({
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
        })

    manifest = {
        'source': 'NOAA NCEP GFS %.2f° (NOMADS filter_gfs_%s)' % (RES_DEG, RES),
        'truthClass': 'MODEL_SIGNAL',
        'run': run.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'grid': {'ni': NI, 'nj': NJ, 'lon0': -180.0, 'dLon': RES_DEG, 'lat0': 90.0, 'dLat': -RES_DEG,
                 'note': 'row 0 = 90N, col 0 = 180W; %.2f° ≈ %.0fkm at equator'
                         % (RES_DEG, RES_DEG * 111.0)},
        'windGrid': {'ni': WNI, 'nj': WNJ, 'dLon': float(WIND_DIV), 'dLat': float(WIND_DIV),
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
    put(PREFIX + '/manifest.json', json.dumps(manifest, ensure_ascii=False).encode('utf-8'),
        'application/json; charset=utf-8', 'public, max-age=300')
    print('[done]', run_tag, '프레임', len(manifest_steps), '실패', len(failed), '경과', manifest['elapsedS'], 's')
    return {'ok': True, 'run': run_tag, 'frames': len(manifest_steps), 'failed': failed[:10]}
