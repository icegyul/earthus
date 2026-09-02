# -*- coding: utf-8 -*-
"""GFS 1.0° 5일 예보 구름 프레임 — NOAA NOMADS → PNG 41장 + 매니페스트 → S3 clouds/gfs-fc/

왜 만들었나: 브라우저가 Open-Meteo 지점 450개(12° 격자, 적도 1,300km)를 질의해
5일치 구름을 그리고 있었다. 시간을 밀면 뭉개져 보였고, 그건 표현이 아니라 자료의 성김이었다.
여기서는 GFS 원자료를 1.0° 로 받아 프레임으로 만든다. 12배 촘촘하고, 브라우저는 PNG 만 읽는다.

어떤 필드를 쓰나 — 실측으로 골랐다(2026-09-03):
  구름 '비율'(TCDC/LCDC/MCDC)은 지구의 절반 이상이 90% 라 화면이 회색 베일이 된다.
  위성처럼 보이려면 '두께'가 필요하다 → CWAT(연직 구름수 총량, kg/m²). 0.05 초과가 29%,
  0.3 초과가 6.5% 라 짙은 구름만 짙게 나온다. 고층 비율(HCDC)은 권운 베일용으로 따로 담는다.

무엇을 담나 (RGBA, 360×181, 행0=북위90, 열0=서경180):
  A = CWAT 를 log 로 눌러 0~255. A/255 = clamp((log10(cwat) − log10(0.005)) / (log10(2) − log10(0.005)), 0, 1)
      즉 0.005 kg/m² 이하 = 0, 2.0 이상 = 255. 표현 곡선의 나머지는 브라우저 셰이더가 맡는다.
  B = HCDC 고층 구름 비율 0~100% → 0~255
  R = 700hPa 동서풍 u, G = 남북풍 v — (m/s + 64) / 128 * 255, 0.5 m/s 양자화(PNG 압축용). ±64 m/s
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
BASE = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl'
UA = 'earthus/2.0 (+https://earthus.net)'
NI, NJ = 360, 181
DEADLINE_S = 270
CWAT_LO, CWAT_HI = 0.005, 2.0        # log 인코딩 범위 (kg/m²)
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
        ('file', 'gfs.t%sz.pgrb2.1p00.f%03d' % (run.strftime('%H'), step)),
        ('dir', '/gfs.%s/%s/atmos' % (run.strftime('%Y%m%d'), run.strftime('%H'))),
        ('var_CWAT', 'on'), ('var_HCDC', 'on'), ('var_UGRD', 'on'), ('var_VGRD', 'on'),
        # NOMADS 필터의 레벨 이름은 인벤토리 문자열 그대로다. 괄호는 역슬래시로 감싼다.
        ('lev_entire_atmosphere_\\(considered_as_a_single_layer\\)', 'on'),
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
    """CWAT(전층) · HCDC(고층 비율, 순간값) · U · V. 하나라도 없으면 예외."""
    cw = hc = u = v = None
    for secs in gl.messages(raw):
        d, g, vals = gl.decode(secs)
        if (g['ni'], g['nj']) != (NI, NJ) or g['lat1'] != 90.0 or g['lon1'] != 0.0 or g['jPositive']:
            raise RuntimeError('GFS_FC_GRID_UNEXPECTED:%r' % (g,))
        cat, num, lt, pdt = d['category'], d['number'], d['levelType'], d['pdt']
        if cat == 6 and lt == 200 and pdt == 0:
            cw = vals                                   # 연직 구름수 총량 kg/m²
        elif cat == 6 and num == 5 and lt == 234 and pdt == 0:
            hc = vals                                   # 고층 구름 비율 % (구간평균 pdt8 은 버린다)
        elif cat == 2 and num == 2 and lt == 100:
            u = vals
        elif cat == 2 and num == 3 and lt == 100:
            v = vals
    if cw is None or hc is None or u is None or v is None:
        raise RuntimeError('GFS_FC_FIELDS_MISSING cw=%s hc=%s u=%s v=%s'
                           % (cw is not None, hc is not None, u is not None, v is not None))
    return cw, hc, u, v


def encode_png_rgba(w, h, rows):
    """순수 파이썬 PNG. rows = 각 행의 RGBA bytes."""
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    raw = b''.join(b'\x00' + r for r in rows)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


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


def frame_png(cw, hc, u, v):
    """열을 서경180 부터 시작하게 돌린다(브라우저 텍스처 uv.x=0 이 -180)."""
    rows = []
    half = NI // 2
    for j in range(NJ):
        base = j * NI
        row = bytearray(NI * 4)
        for i in range(NI):
            src = base + ((i + half) % NI)
            o = i * 4
            row[o] = _wind_byte(u[src])
            row[o + 1] = _wind_byte(v[src])
            h = hc[src]
            row[o + 2] = 0 if h is None else int(max(0.0, min(100.0, h)) * 2.55 + 0.5)
            row[o + 3] = _cwat_byte(cw[src])
        rows.append(bytes(row))
    return encode_png_rgba(NI, NJ, rows)


def build_step(run, step):
    raw = http_get(url_for(run, step))
    if raw[:4] != b'GRIB':
        raise RuntimeError('GFS_FC_NOT_GRIB f%03d' % step)
    cw, hc, u, v = fields_from_grib(raw)
    png = frame_png(cw, hc, u, v)
    n = float(len(cw))
    return {
        'h': step, 'png': png, 'srcBytes': len(raw),
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
        key = '%s/%s/f%03d.png' % (PREFIX, run_tag, s)
        put(key, fr['png'], 'image/png', 'public, max-age=86400, immutable')
        manifest_steps.append({
            'h': s,
            'valid': (run + timedelta(hours=s)).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'file': '%s/f%03d.png' % (run_tag, s),
            'bytes': len(fr['png']),
            'cwatGt005': fr['cwatGt005'],
            'cwatGt03': fr['cwatGt03'],
        })

    manifest = {
        'source': 'NOAA NCEP GFS 1.00° (NOMADS filter_gfs_1p00)',
        'truthClass': 'MODEL_SIGNAL',
        'run': run.strftime('%Y-%m-%dT%H:%M:%SZ'),
        'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'grid': {'ni': NI, 'nj': NJ, 'lon0': -180.0, 'dLon': 1.0, 'lat0': 90.0, 'dLat': -1.0,
                 'note': 'row 0 = 90N, col 0 = 180W; 1.0° ≈ 111km at equator'},
        'encoding': {
            'A': 'CWAT column cloud water kg/m², log: cwat = 10^(A/255*%.4f + %.4f); 0 below %.3f, 255 at %.1f'
                 % (_LOG_SPAN, _LOG_LO, CWAT_LO, CWAT_HI),
            'B': 'HCDC high cloud layer fraction, percent: B/255*100',
            'R': 'UGRD %s hPa, m/s: R/255*128-64 (0.5 m/s quantized)' % WIND_LEVEL,
            'G': 'VGRD %s hPa, m/s: G/255*128-64 (0.5 m/s quantized)' % WIND_LEVEL,
        },
        'stepHours': STEP_H,
        'steps': manifest_steps,
        'missingSteps': [s for s, _ in failed],
        'note': '두께(CWAT)로 그린다. 구름 비율 필드는 지구 절반이 90%라 베일이 된다(실측). '
                '프레임 사이 값은 바람으로 이류한 보간이며 모델 출력이 아니다. 없는 스텝은 만들지 않았다.',
        'decoder': 'grib2lite (pure python, validated against eccodes 2.48)',
        'elapsedS': round(time.time() - t0, 1),
    }
    put(PREFIX + '/manifest.json', json.dumps(manifest, ensure_ascii=False).encode('utf-8'),
        'application/json; charset=utf-8', 'public, max-age=300')
    print('[done]', run_tag, '프레임', len(manifest_steps), '실패', len(failed), '경과', manifest['elapsedS'], 's')
    return {'ok': True, 'run': run_tag, 'frames': len(manifest_steps), 'failed': failed[:10]}
