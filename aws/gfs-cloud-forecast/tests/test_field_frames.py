# -*- coding: utf-8 -*-
"""GFS 필드 프레임(t·u·m·a) 시험 — 지시서 PAID-UX-REDESIGN-2026-09-20 §3 W0.

AWS 도 NOMADS 도 필요 없다. GRIB2 메시지를 여기서 **합성**한다(단순 패킹 5.0 · 격자 3.0 · 산출물 4.0/4.8).
메시지의 기술값(카테고리·번호·레벨·구간)은 지어낸 것이 아니라 NOMADS 실자료에서 읽은 것이다
(2026091918 f009, filter_gfs_0p50, 30메시지 — REAL_F009 표).

이 시험이 지키는 것
  ① 레벨 분기 — 구름 이류용 700hPa u/v 가 10 m 에도, 나중에 켤 850hPa 에도 덮이지 않는다
  ② 새 필드가 없거나 깨져도 구름·강수·700hPa 바람 프레임은 살아남는다 (필수가 빠지면 예전처럼 스텝을 버린다)
  ③ 인코딩 왕복 — 값 → byte → 값 오차가 눈금의 절반 이하. 구간 경계는 눈금 위에 있다
  ④ 매니페스트 — 새 키가 있고, 옛 키는 하나도 빠지지 않았고, 브라우저(loadGfs)가 읽는 모양 그대로다
  ⑤ describe 먼저 — 쓰지 않는 메시지는 해독하지 않는다 (30장 중 17장)
  ⑥ 방향 — 행0=북위90 · 열0=서경180. 기존 구름 프레임과 같은 돌리기
  ⑦ 누적강수 — 두 장 중 6시간 버킷을 고르고 구간을 GRIB 에서 읽어 적는다. f000 에는 없다
  ⑧ runs[] — 최근 4런, 새 런이 앞, 가리키는 사본이 실제로 있다
  ⑨ 패키징 — 배포 스크립트가 zip 하는 파일 목록이 실제 import 폐쇄와 같다
"""
import importlib.util
import io
import json
import math
import os
import pathlib
import re
import struct
import sys
import unittest
import unittest.mock
import zlib
from datetime import datetime, timezone

HERE = pathlib.Path(__file__).parent
FUNC = HERE.parent
AWS = FUNC.parent
REPO = AWS.parent
sys.path.insert(0, str(FUNC))
sys.path.insert(0, str(AWS / '_shared'))
os.environ.setdefault('AWS_ACCESS_KEY_ID', 'testing')
os.environ.setdefault('AWS_SECRET_ACCESS_KEY', 'testing')
os.environ.setdefault('AWS_DEFAULT_REGION', 'us-east-2')

import grib2lite as gl  # noqa: E402
import lambda_package as lp  # noqa: E402

# 다른 함수의 handler 와 이름이 부딪치지 않게 고유 이름으로 싣는다(저장소 시험의 관례).
SPEC = importlib.util.spec_from_file_location('gfs_cloud_forecast_handler', FUNC / 'handler.py')
H = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(H)


# ---------------------------------------------------------------- GRIB2 합성기
def _sm(value, nbytes):
    """GRIB2 부호-크기 정수."""
    return (abs(value) | ((1 << (8 * nbytes - 1)) if value < 0 else 0)).to_bytes(nbytes, 'big')


def grib(cat, num, lt, lv, vals, ni, nj, pdt=0, fh=0, decimals=2, stat=None, range_len=None,
         range_unit=1, bitmap=None, drt=0, lat1=90.0, scan=0x00):
    """메시지 한 장. 값은 단순 패킹 16bit — 10^-decimals 눈금으로 정확히 실린다."""
    npts = ni * nj
    assert len(vals) == npts
    s1 = struct.pack('>IBHHBBBHBBBBBBB', 21, 1, 7, 0, 2, 1, 1, 2026, 9, 19, 18, 0, 0, 0, 1)
    s3 = (struct.pack('>IBBIBBH', 72, 3, 0, npts, 0, 0, 0)
          + bytes([6, 0]) + bytes(4) + bytes([0]) + bytes(4) + bytes([0]) + bytes(4)
          + struct.pack('>II', ni, nj) + struct.pack('>II', 0, 0xffffffff)
          + _sm(int(lat1 * 1e6), 4) + _sm(0, 4) + bytes([48])
          + _sm(int(-lat1 * 1e6), 4) + _sm(int((360.0 - 360.0 / ni) * 1e6), 4)
          + struct.pack('>II', int(360.0 / ni * 1e6), int(180.0 / (nj - 1) * 1e6)) + bytes([scan]))
    assert len(s3) == 72
    body4 = (bytes([cat, num, 2, 0, 96]) + struct.pack('>HB', 0, 0) + bytes([1]) + struct.pack('>I', fh)
             + bytes([lt, 0]) + struct.pack('>I', lv) + bytes([255, 0]) + struct.pack('>I', 0))
    if pdt == 8:
        body4 += (struct.pack('>HBBBBB', 2026, 9, 20, 3, 0, 0) + bytes([1]) + struct.pack('>I', 0)
                  + bytes([stat, 2, range_unit]) + struct.pack('>I', range_len)
                  + bytes([255]) + struct.pack('>I', 0))
    s4 = struct.pack('>IBHH', 9 + len(body4), 4, 0, pdt) + body4
    assert len(s4) == (58 if pdt == 8 else 34)
    present = [v for v, m in zip(vals, bitmap) if m] if bitmap else list(vals)
    scale = 10 ** decimals
    ints = [int(round(v * scale)) for v in present]
    ref = min(ints) if ints else 0
    packed = [x - ref for x in ints]
    assert max(packed, default=0) < 65536, '16bit 에 안 들어간다 — decimals 를 줄여라'
    s5 = struct.pack('>IBIH', 21, 5, len(present), drt) + struct.pack('>f', float(ref)) \
        + _sm(0, 2) + _sm(decimals, 2) + bytes([16, 0])
    if bitmap:
        bits = int(''.join('1' if m else '0' for m in bitmap).ljust((npts + 7) // 8 * 8, '0'), 2)
        bm = bits.to_bytes((npts + 7) // 8, 'big')
        s6 = struct.pack('>IBB', 6 + len(bm), 6, 0) + bm
    else:
        s6 = struct.pack('>IBB', 6, 6, 255)
    data = struct.pack('>%dH' % len(packed), *packed)
    s7 = struct.pack('>IB', 5 + len(data), 7) + data
    rest = s1 + s3 + s4 + s5 + s6 + s7 + b'7777'
    return b'GRIB' + bytes([0, 0, 0, 2]) + struct.pack('>Q', 16 + len(rest)) + rest


def png_pixels(png):
    """PNG → (너비, 높이, 색 유형, 행 목록). 필터 0(None)·1(Sub)만 — 이 함수가 쓰는 둘이다."""
    assert png[:8] == b'\x89PNG\r\n\x1a\n'
    w, h, depth, ctype = struct.unpack('>IIBB', png[16:26])
    assert depth == 8
    bpp = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    idat, k = b'', 8
    while k < len(png):
        ln, tag = struct.unpack('>I4s', png[k:k + 8])
        if tag == b'IDAT':
            idat += png[k + 8:k + 8 + ln]
        k += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * bpp
    rows = []
    for j in range(h):
        f = raw[j * (stride + 1)]
        line = bytearray(raw[j * (stride + 1) + 1:(j + 1) * (stride + 1)])
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        else:
            assert f == 0, '모르는 필터 %d' % f
        rows.append(bytes(line))
    return w, h, ctype, rows


class TinyGrid(unittest.TestCase):
    """격자를 16×9 로 줄여 돈다. 분기·방향·매니페스트 논리는 격자 크기와 무관하다."""
    NI, NJ, DIV = 16, 9, 8

    def setUp(self):
        self._patch = unittest.mock.patch.multiple(
            H, NI=self.NI, NJ=self.NJ, WIND_DIV=self.DIV,
            WNI=self.NI // self.DIV, WNJ=(self.NJ + self.DIV - 1) // self.DIV)
        self._patch.start()
        self.addCleanup(self._patch.stop)
        self.n = self.NI * self.NJ

    def flat(self, value):
        return [value] * self.n

    def msg(self, cat, num, lt, lv, vals, **kw):
        return grib(cat, num, lt, lv, vals, self.NI, self.NJ, **kw)

    def required(self, fh=9, u700=11.0, v700=-7.0):
        """구름·강수·700hPa 바람 — 예전부터 필수인 12장(+ 읽는 곳 없는 CRAIN)."""
        m = self.msg
        return [
            m(2, 2, 100, 70000, self.flat(u700), fh=fh), m(2, 3, 100, 70000, self.flat(v700), fh=fh),
            m(1, 37, 1, 0, self.flat(0.0002), fh=fh, decimals=5), m(1, 7, 1, 0, self.flat(0.0005), fh=fh, decimals=5),
            m(1, 195, 1, 0, self.flat(0.0), fh=fh), m(1, 194, 1, 0, self.flat(0.0), fh=fh),
            m(1, 193, 1, 0, self.flat(0.0), fh=fh), m(1, 192, 1, 0, self.flat(1.0), fh=fh),
            m(7, 6, 1, 0, self.flat(800.0), fh=fh, decimals=0),
            m(6, 6, 200, 0, self.flat(0.4), fh=fh), m(6, 3, 214, 0, self.flat(30.0), fh=fh),
            m(6, 4, 224, 0, self.flat(20.0), fh=fh), m(6, 5, 234, 0, self.flat(10.0), fh=fh),
        ]

    def fields(self, fh=9, t2m=288.15, u10=3.0, v10=-2.0, prmsl=101300.0, bucket=4.0, total=12.0):
        m = self.msg
        out = [
            m(3, 1, 101, 0, self.flat(prmsl), fh=fh, decimals=0),
            m(0, 0, 103, 2, self.flat(t2m), fh=fh),
            m(2, 2, 103, 10, self.flat(u10), fh=fh), m(2, 3, 103, 10, self.flat(v10), fh=fh),
        ]
        if fh > 0:
            start = 6 * ((fh - 1) // 6)
            out.append(m(1, 8, 1, 0, self.flat(bucket), pdt=8, fh=start, stat=1, range_len=fh - start))
            out.append(m(1, 8, 1, 0, self.flat(total), pdt=8, fh=0, stat=1, range_len=fh))
        return out


# ---------------------------------------------------------------- ① 레벨 분기
class LevelBranching(TinyGrid):
    def test_700hpa_wind_survives_10m_and_any_other_isobaric_level(self):
        """10 m 는 700 앞에도 뒤에도 오고, 850hPa(2단계에 켤 레벨)는 맨 뒤에 온다 — 그래도 700 이 남는다."""
        m = self.msg
        stream = ([m(2, 2, 103, 10, self.flat(3.0), fh=9), m(2, 3, 103, 10, self.flat(-2.0), fh=9)]
                  + self.required(u700=11.0, v700=-7.0)
                  + self.fields(u10=3.0, v10=-2.0)
                  + [m(2, 2, 100, 85000, self.flat(40.0), fh=9), m(2, 3, 100, 85000, self.flat(40.0), fh=9),
                     m(2, 2, 100, 50000, self.flat(-55.0), fh=9), m(2, 3, 100, 50000, self.flat(-55.0), fh=9)])
        (cw, lc, mc, hc, u, v, wet, cape), opt, why, _ = H.read_fields(b''.join(stream))
        self.assertEqual({11.0}, set(u), '구름 이류용 u 는 700hPa 값이어야 한다')
        self.assertEqual({-7.0}, set(v))
        self.assertEqual({3.0}, set(opt['u10']))
        self.assertEqual({-2.0}, set(opt['v10']))
        self.assertEqual({}, why)

    def test_the_old_branch_would_have_been_overwritten(self):
        """사고를 고정한다: 'cat 2 · lt 100' 만 보던 옛 분기는 마지막 등압면으로 덮였다."""
        m = self.msg
        stream = self.required(u700=11.0) + [m(2, 2, 100, 85000, self.flat(40.0), fh=9)]
        old_u = None
        for secs in gl.messages(b''.join(stream)):
            d, _, vals = gl.decode(secs)
            if d['category'] == 2 and d['number'] == 2 and d['levelType'] == 100:   # 옛 조건 그대로
                old_u = vals
        self.assertEqual({40.0}, set(old_u), '옛 분기는 850hPa 로 덮인다 — 이 시험의 전제')
        self.assertEqual({11.0}, set(H.read_fields(b''.join(stream))[0][4]), '새 분기는 700hPa 를 지킨다')

    def test_wanted_key_matches_the_real_inventory_and_nothing_else(self):
        """실자료의 기술값 → 이름. 교차곱으로 딸려 온 것(TMP surface·700 mb 등)은 None = 해독 안 함."""
        def d(cat, num, lt, lv, pdt=0, **kw):
            base = {'category': cat, 'number': num, 'levelType': lt, 'levelValue': lv,
                    'levelScale': 0, 'pdt': pdt, 'forecastHours': 9}
            base.update(kw)
            return base
        self.assertEqual('u', H.wanted_key(d(2, 2, 100, 70000)))
        self.assertEqual('v', H.wanted_key(d(2, 3, 100, 70000)))
        self.assertEqual('u10', H.wanted_key(d(2, 2, 103, 10)))
        self.assertEqual('v10', H.wanted_key(d(2, 3, 103, 10)))
        self.assertEqual('t2m', H.wanted_key(d(0, 0, 103, 2)))
        self.assertEqual('prmsl', H.wanted_key(d(3, 1, 101, 0)))
        self.assertEqual('cwat', H.wanted_key(d(6, 6, 200, 0)))
        self.assertEqual(('wet', 7), H.wanted_key(d(1, 7, 1, 0)))
        self.assertEqual('apcp', H.wanted_key(d(1, 8, 1, 0, pdt=8, statProcess=1, rangeHours=3, forecastHours=6)))
        for junk in (d(0, 0, 1, 0), d(0, 0, 100, 70000), d(2, 2, 100, 85000), d(2, 2, 103, 80),
                     d(0, 0, 103, 80), d(3, 192, 101, 0),                      # MSLET 은 PRMSL 이 아니다
                     d(1, 7, 1, 0, pdt=8, statProcess=0, rangeHours=3),        # PRATE 구간 평균
                     d(1, 8, 1, 0, pdt=8, statProcess=0, rangeHours=3),        # 누적이 아닌 APCP
                     d(6, 3, 214, 0, pdt=8, statProcess=0, rangeHours=3)):     # LCDC 구간 평균
            self.assertIsNone(H.wanted_key(junk), junk)

    def test_wind_level_follows_the_environment_variable_not_a_literal(self):
        self.assertEqual(int(H.WIND_LEVEL) * 100, H.WIND_PA)
        with unittest.mock.patch.object(H, 'WIND_PA', 85000):
            self.assertEqual('u', H.wanted_key({'category': 2, 'number': 2, 'levelType': 100,
                                                'levelValue': 85000, 'levelScale': 0, 'pdt': 0}))

    def test_scaled_level_values_are_compared_by_value(self):
        """척도가 걸린 레벨(20 을 '200 × 10^-1' 로 적는 식)도 값으로 비교한다."""
        self.assertEqual('t2m', H.wanted_key({'category': 0, 'number': 0, 'levelType': 103,
                                              'levelValue': 20, 'levelScale': 1, 'pdt': 0}))


# ---------------------------------------------------------------- ⑤ describe 먼저
# NOMADS 2026091918 f009 의 30메시지 — (pdt, cat, num, lt, lv, 구간시작, 구간길이, 통계). inspect 로 읽은 그대로다.
REAL_F009 = [
    (0, 3, 1, 101, 0), (0, 0, 0, 100, 70000), (0, 2, 2, 100, 70000), (0, 2, 3, 100, 70000),
    (0, 0, 0, 1, 0), (0, 0, 0, 103, 2), (0, 2, 2, 103, 10), (0, 2, 3, 103, 10),
    (0, 1, 37, 1, 0), (0, 1, 7, 1, 0), (8, 1, 196, 1, 0, 6, 3, 0), (8, 1, 7, 1, 0, 6, 3, 0),
    (8, 1, 8, 1, 0, 6, 3, 1), (8, 1, 8, 1, 0, 0, 9, 1),
    (0, 1, 195, 1, 0), (0, 1, 194, 1, 0), (0, 1, 193, 1, 0), (0, 1, 192, 1, 0),
    (8, 1, 195, 1, 0, 6, 3, 0), (8, 1, 194, 1, 0, 6, 3, 0), (8, 1, 193, 1, 0, 6, 3, 0), (8, 1, 192, 1, 0, 6, 3, 0),
    (0, 7, 6, 1, 0), (0, 6, 6, 200, 0), (0, 6, 3, 214, 0), (8, 6, 3, 214, 0, 6, 3, 0),
    (0, 6, 4, 224, 0), (8, 6, 4, 224, 0, 6, 3, 0), (0, 6, 5, 234, 0), (8, 6, 5, 234, 0, 6, 3, 0),
]


class DescribeFirst(TinyGrid):
    def real_stream(self):
        out = []
        for row in REAL_F009:
            pdt, cat, num, lt, lv = row[:5]
            if pdt == 8:
                out.append(self.msg(cat, num, lt, lv, self.flat(1.0), pdt=8, fh=row[5], range_len=row[6], stat=row[7]))
            else:
                out.append(self.msg(cat, num, lt, lv, self.flat(1.0), fh=9))
        return b''.join(out)

    def test_only_used_messages_are_decoded(self):
        raw = self.real_stream()
        with unittest.mock.patch.object(gl, 'decode', wraps=gl.decode) as spy:
            _, opt, why, stats = H.read_fields(raw)
        self.assertEqual(30, stats['messages'])
        self.assertEqual(17, spy.call_count, '필수 12 + 기온·u10·v10·기압·누적 = 17. 나머지 13장은 헛해독이다')
        self.assertEqual(17, stats['decoded'])
        self.assertEqual({}, why)
        self.assertEqual((6, 9), opt['apcpWindow'])

    def test_with_fields_off_the_request_and_the_decode_are_the_old_ones(self):
        with unittest.mock.patch.object(H, 'FIELDS_ON', False):
            with unittest.mock.patch.object(gl, 'decode', wraps=gl.decode) as spy:
                _, opt, why, _ = H.read_fields(self.real_stream())
            self.assertEqual(12, spy.call_count)
            self.assertEqual(({}, {}), (opt, why))
            url = H.url_for(datetime(2026, 9, 19, 18, tzinfo=timezone.utc), 9)
            self.assertNotIn('var_TMP', url)
            self.assertNotIn('above_ground', url)


# ---------------------------------------------------------------- ② 없으면 그 프레임만
class CloudSurvives(TinyGrid):
    def build(self, stream, step=9):
        with unittest.mock.patch.object(H, 'http_get', return_value=b''.join(stream)):
            return H.build_step(datetime(2026, 9, 19, 18, tzinfo=timezone.utc), step)

    def test_all_fields_present(self):
        fr = self.build(self.required() + self.fields())
        self.assertEqual({'temp', 'wind10', 'mslp', 'apcp'}, set(fr['fields']))
        self.assertEqual({}, fr['skipped'])
        self.assertEqual({'fromH': 6, 'toH': 9}, fr['apcpWindow'])

    def test_missing_temperature_drops_only_the_temperature_frame(self):
        stream = self.required() + [m for i, m in enumerate(self.fields()) if i != 1]   # TMP 2 m 을 뺀다
        fr = self.build(stream)
        for key in ('png', 'wind', 'precip'):
            self.assertEqual(b'\x89PNG', fr[key][:4], '구름·바람·강수 프레임은 살아 있어야 한다')
        self.assertNotIn('temp', fr['fields'])
        self.assertEqual({'wind10', 'mslp', 'apcp'}, set(fr['fields']))
        self.assertEqual({'temp': 't2m:NOT_IN_GRIB'}, fr['skipped'])

    def test_no_new_field_at_all_is_still_a_full_cloud_step(self):
        fr = self.build(self.required())
        self.assertEqual({}, fr['fields'])
        self.assertEqual({'temp', 'wind10', 'mslp', 'apcp'}, set(fr['skipped']))
        self.assertEqual(b'\x89PNG', fr['png'][:4])

    def test_cloud_frames_are_byte_identical_with_or_without_the_new_fields(self):
        with_fields = self.build(self.required() + self.fields())
        without = self.build(self.required())
        for key in ('png', 'wind', 'precip', 'wetGt01', 'cwatGt005', 'cwatGt03'):
            self.assertEqual(without[key], with_fields[key], key)

    def test_one_half_of_the_wind_pair_is_not_a_wind_frame(self):
        stream = self.required() + [m for i, m in enumerate(self.fields()) if i != 3]   # VGRD 10 m 을 뺀다
        fr = self.build(stream)
        self.assertNotIn('wind10', fr['fields'])
        self.assertEqual('v10:NOT_IN_GRIB', fr['skipped']['wind10'])

    def test_a_field_that_cannot_be_decoded_is_skipped_with_its_reason(self):
        """JPEG2000(5.40) 같은 못 읽는 패킹이 새 필드에 오면 — 그 필드만 빠진다."""
        bad = self.msg(0, 0, 103, 2, self.flat(288.15), fh=9, drt=40)
        stream = self.required() + [bad] + self.fields()[2:] + [self.fields()[0]]
        fr = self.build(stream)
        self.assertNotIn('temp', fr['fields'])
        self.assertIn('packing template 40', fr['skipped']['temp'])
        self.assertIn('mslp', fr['fields'])
        self.assertEqual(b'\x89PNG', fr['png'][:4])

    def test_gaps_in_a_linear_field_omit_the_frame_instead_of_inventing_a_value(self):
        """기온에는 '자료 없음'을 뜻할 바이트가 없다. 결측(None)이 있으면 굽지 않는다."""
        gappy = self.flat(288.15)
        gappy[5] = None
        res = H.field_frames(9, {'t2m': gappy, 'prmsl': self.flat(101300.0)}, {})
        self.assertNotIn('temp', res['fields'])
        self.assertIn('TypeError', res['skipped']['temp'])
        self.assertIn('mslp', res['fields'])

    def test_a_bitmapped_message_on_a_new_field_costs_only_that_field(self):
        """비트맵이 달린 메시지(규격대로: 섹션 5 의 개수 = 실린 값의 수).

        grib2lite 는 그 개수를 격자 전체로 읽어 'value count != grid' 로 거부한다 — GFS 의 이 필드들에는
        비트맵이 없어 운영에서 만난 적이 없는 길이다. 여기서 지키는 것은 '거부돼도 구름은 산다' 뿐이다.
        """
        holes = [1] * self.n
        holes[5] = 0
        gappy = self.msg(0, 0, 103, 2, self.flat(288.15), fh=9, bitmap=holes)
        stream = self.required() + [gappy] + [m for i, m in enumerate(self.fields()) if i != 1]
        fr = self.build(stream)
        self.assertNotIn('temp', fr['fields'])
        self.assertIn('t2m:', fr['skipped']['temp'])
        self.assertEqual({'wind10', 'mslp', 'apcp'}, set(fr['fields']))
        self.assertEqual(b'\x89PNG', fr['png'][:4])

    def test_even_an_unforeseen_crash_in_the_field_path_leaves_the_cloud_step_whole(self):
        with unittest.mock.patch.object(H, 'field_frames', side_effect=ZeroDivisionError('boom')):
            fr = self.build(self.required() + self.fields())
        self.assertEqual(b'\x89PNG', fr['png'][:4])
        self.assertEqual({}, fr['fields'])
        self.assertEqual({'temp', 'wind10', 'mslp', 'apcp'}, set(fr['skipped']))
        self.assertIn('ZeroDivisionError', fr['skipped']['temp'])

    def test_new_fields_are_decoded_only_after_the_cloud_frames_are_built(self):
        """순서가 계약이다: 구름 → (필수 목록을 놓고) → 새 필드. 메모리 봉우리와 '구름 먼저'를 같이 지킨다."""
        order = []
        real_cloud, real_optional = H.cloud_png, H.optional_fields
        with unittest.mock.patch.multiple(
                H,
                cloud_png=lambda *a: order.append('cloud') or real_cloud(*a),
                optional_fields=lambda picked: order.append('optional') or real_optional(picked)):
            self.build(self.required() + self.fields())
        self.assertEqual(['cloud', 'optional'], order)

    def test_a_missing_required_field_still_fails_the_step_as_before(self):
        stream = [m for i, m in enumerate(self.required()) if i != 9] + self.fields()      # CWAT 을 뺀다
        with self.assertRaisesRegex(RuntimeError, 'GFS_FC_FIELDS_MISSING:CWAT'):
            self.build(stream)

    def test_new_fields_are_not_in_the_required_list(self):
        """필수 목록에 새 필드를 넣는 순간 '기온 한 장이 빠진 날 구름까지 죽는다'."""
        with self.assertRaises(RuntimeError) as ctx:
            H.read_fields(b''.join(self.fields()))
        for name in ('TMP', 'PRMSL', 'APCP', 't2m', 'u10', 'prmsl', 'apcp'):
            self.assertNotIn(name, str(ctx.exception))

    def test_unexpected_grid_on_a_new_field_does_not_kill_the_step(self):
        south_first = self.msg(0, 0, 103, 2, self.flat(288.15), fh=9, lat1=-90.0, scan=0x40)
        stream = self.required() + [south_first] + [m for i, m in enumerate(self.fields()) if i != 1]
        fr = self.build(stream)
        self.assertIn('GFS_FC_GRID_UNEXPECTED', fr['skipped']['temp'])
        self.assertEqual(b'\x89PNG', fr['png'][:4])


# ---------------------------------------------------------------- ⑦ 누적강수
class Accumulation(TinyGrid):
    def test_describe_reads_the_pdt48_interval(self):
        bucket = self.msg(1, 8, 1, 0, self.flat(4.0), pdt=8, fh=6, stat=1, range_len=3)
        d = gl.describe(next(gl.messages(bucket)))
        self.assertEqual((8, 1, 6, 3), (d['pdt'], d['statProcess'], d['forecastHours'], d['rangeHours']))
        days = self.msg(1, 8, 1, 0, self.flat(4.0), pdt=8, fh=0, stat=1, range_len=5, range_unit=2)
        self.assertEqual(120, gl.describe(next(gl.messages(days)))['rangeHours'], "'0-5 day acc' = 120시간")
        odd = self.msg(1, 8, 1, 0, self.flat(4.0), pdt=8, fh=0, stat=1, range_len=5, range_unit=3)   # 월
        self.assertIsNone(gl.describe(next(gl.messages(odd)))['rangeHours'], '모르는 단위는 짐작하지 않는다')
        plain = self.msg(0, 0, 103, 2, self.flat(288.0), fh=9)
        self.assertNotIn('rangeHours', gl.describe(next(gl.messages(plain))))

    def test_the_six_hour_bucket_is_chosen_whichever_comes_first(self):
        bucket = self.msg(1, 8, 1, 0, self.flat(4.0), pdt=8, fh=6, stat=1, range_len=3)
        total = self.msg(1, 8, 1, 0, self.flat(12.0), pdt=8, fh=0, stat=1, range_len=9)
        for order in ([bucket, total], [total, bucket]):
            _, opt, _, _ = H.read_fields(b''.join(self.required() + order))
            self.assertEqual({4.0}, set(opt['apcp']))
            self.assertEqual((6, 9), opt['apcpWindow'])

    def test_windows_follow_the_gfs_bucket_rule(self):
        """f003 0-3 · f006 0-6 · f009 6-9 · f012 6-12 · f117 114-117 · f120 114-120 (인벤토리 그대로)."""
        want = {3: (0, 3), 6: (0, 6), 9: (6, 9), 12: (6, 12), 117: (114, 117), 120: (114, 120)}
        for step, window in want.items():
            _, opt, _, _ = H.read_fields(b''.join(self.required(fh=step) + self.fields(fh=step)))
            self.assertEqual(window, opt['apcpWindow'], step)
            res = H.field_frames(step, opt, {})
            self.assertEqual({'fromH': window[0], 'toH': window[1]}, res['apcpWindow'])

    def test_analysis_step_has_no_accumulation_and_that_is_not_a_defect(self):
        _, opt, why, _ = H.read_fields(b''.join(self.required(fh=0) + self.fields(fh=0)))
        res = H.field_frames(0, opt, why)
        self.assertNotIn('apcp', res['fields'])
        self.assertNotIn('apcp', res['skipped'], 'f000 에는 원래 없다 — 결함 목록에 올리지 않는다')
        self.assertNotIn('apcpWindow', res)
        later = H.field_frames(3, opt, why)
        self.assertEqual('apcp:NOT_IN_GRIB', later['skipped']['apcp'], '다른 스텝에서 없으면 결함이다')

    def test_a_run_total_alone_is_not_published_as_a_bucket(self):
        """버킷이 안 오고 런 총량(0-9)만 왔다 — 6시간보다 긴 구간은 굽지 않는다."""
        total = self.msg(1, 8, 1, 0, self.flat(12.0), pdt=8, fh=0, stat=1, range_len=9)
        _, opt, why, _ = H.read_fields(b''.join(self.required() + [total]))
        res = H.field_frames(9, opt, why)
        self.assertNotIn('apcp', res['fields'])
        self.assertIn('GFS_FC_APCP_WINDOW_UNEXPECTED', res['skipped']['apcp'])

    def test_a_window_that_does_not_end_at_this_step_is_refused(self):
        stale = self.msg(1, 8, 1, 0, self.flat(4.0), pdt=8, fh=0, stat=1, range_len=6)
        _, opt, why, _ = H.read_fields(b''.join(self.required() + [stale]))
        self.assertIn('GFS_FC_APCP_WINDOW_UNEXPECTED', H.field_frames(9, opt, why)['skipped']['apcp'])


# ---------------------------------------------------------------- ③ 인코딩 왕복
class EncodingRoundTrip(unittest.TestCase):
    def test_temperature(self):
        spec = H.field_specs()['temp']['channels']['R']
        celsius = [-80.0 + k * 0.0371 for k in range(int(127.5 / 0.0371))]
        b, clipped = H._temp_bytes([c + 273.15 for c in celsius])
        self.assertEqual(0, clipped)
        worst = max(abs(byte * spec['scale'] + spec['offset'] - c) for byte, c in zip(b, celsius))
        self.assertLessEqual(worst, 0.25 + 1e-9, '오차는 눈금(0.5°C)의 절반 이하')
        self.assertEqual((0.5, -80.0, -80.0, 47.5), (spec['scale'], spec['offset'], spec['min'], spec['max']))

    def test_temperature_band_edges_sit_exactly_on_ticks(self):
        """구간 경계(5°C·2°C)가 눈금 위에 있어야 색 경계 = 등치선 값이 된다."""
        edges = [-10, -5, 0, 5, 10, 15, 20, 25, 30, 35] + list(range(-40, 41, 2))
        b, _ = H._temp_bytes([c + 273.15 for c in edges])
        self.assertEqual([float(c) for c in edges], [byte * 0.5 - 80.0 for byte in b])

    def test_temperature_outside_the_range_is_clamped_and_counted(self):
        b, clipped = H._temp_bytes([-95.0 + 273.15, -80.0 + 273.15, 47.5 + 273.15, 60.0 + 273.15, 20.0 + 273.15])
        self.assertEqual([0, 0, 255, 255, 200], list(b))
        self.assertEqual(2, clipped, '끝값으로 눌린 칸만 센다 — 끝값 자체는 눌린 것이 아니다')

    def test_pressure(self):
        spec = H.field_specs()['mslp']['channels']['R']
        hpa = [940.0 + k * 0.0413 for k in range(int(127.5 / 0.0413))]
        b, clipped = H._mslp_bytes([p * 100.0 for p in hpa])
        self.assertEqual(0, clipped)
        worst = max(abs(byte * spec['scale'] + spec['offset'] - p) for byte, p in zip(b, hpa))
        self.assertLessEqual(worst, 0.25 + 1e-9)
        isobars, _ = H._mslp_bytes([p * 100.0 for p in range(940, 1068, 4)])
        self.assertEqual(list(range(940, 1068, 4)), [byte * 0.5 + 940.0 for byte in isobars], '4hPa 등압선은 눈금 위')
        deep, clipped = H._mslp_bytes([90500.0, 108500.0])
        self.assertEqual(([0, 255], 2), (list(deep), clipped), '940 아래 태풍 중심·1067.5 위 고기압은 끝값')

    def test_wind10_uses_the_same_decode_as_the_700hpa_frame_with_half_the_error(self):
        spec = H.field_specs()['wind10']['channels']['R']
        self.assertAlmostEqual(128.0 / 255.0, spec['scale'])
        self.assertEqual(-64.0, spec['offset'])
        ms = [-64.0 + k * 0.0173 for k in range(int(128 / 0.0173))]
        b = H._wind_bytes(ms)
        self.assertEqual([H._wind10_byte(x) for x in ms], list(b), '격자 경로와 한 칸 경로가 같은 식이어야 한다')
        worst_new = max(abs(byte / 255.0 * 128.0 - 64.0 - x) for byte, x in zip(b, ms))
        worst_old = max(abs(H._wind_byte(x) / 255.0 * 128.0 - 64.0 - x) for x in ms)
        self.assertLessEqual(worst_new, 128.0 / 255.0 / 2 + 1e-9)
        self.assertGreater(worst_old, 0.45, '700hPa 식의 선양자화는 오차가 두 배다 — 새 프레임이 그걸 안 하는 이유')
        self.assertEqual([0, 255, 128], list(H._wind_bytes([-90.0, 90.0, None])))

    def test_accumulated_precipitation_log(self):
        spec = H.field_specs()['apcp']['channels']['R']
        self.assertEqual('log10', spec['transfer'])

        def decode(byte):
            return 0.0 if byte == spec['zeroByte'] else 10 ** (byte / 255.0 * spec['logSpan'] + spec['logLo'])
        half_tick = spec['logSpan'] / 255.0 / 2
        for mm in [0.11, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 72.3, 139.1, 249.0]:
            got = decode(H._apcp_byte(mm))
            self.assertLessEqual(abs(math.log10(got) - math.log10(mm)), half_tick + 1e-9, mm)
        self.assertEqual([0, 0, 0, 0], [H._apcp_byte(x) for x in (None, 0.0, 0.05, 0.1)])
        self.assertEqual(255, H._apcp_byte(400.0))
        ladder = [H._apcp_byte(x) for x in (0.1, 0.5, 1, 2, 5, 10, 20, 50)]
        self.assertEqual(sorted(set(ladder)), ladder, '구간 경계 8개가 서로 다른 바이트로 갈려야 한다')

    def test_the_text_encoding_says_what_the_numbers_say(self):
        text = H.FIELD_ENCODING_TEXT
        self.assertIn('degC = byte*0.5-80', text['temp'])
        self.assertIn('hPa = byte*0.5+940', text['mslp'])
        self.assertIn('R/255*128-64', text['wind10.R'])
        self.assertIn('10^(byte/255*%.4f%+.4f)' % (H._ALOG_SPAN, H._ALOG_LO), text['apcp'])


# ---------------------------------------------------------------- PNG
class PngFilter(unittest.TestCase):
    def test_sub_filter_matches_the_byte_loop(self):
        import random
        rnd = random.Random(20260920)
        for bpp in (1, 3):
            for n in (3, 16, 720 * bpp):
                row = bytes(rnd.randrange(256) for _ in range(n))
                naive = bytes([(row[i] - (row[i - bpp] if i >= bpp else 0)) & 255 for i in range(n)])
                self.assertEqual(naive, H._sub_filter(row, bpp), (bpp, n))
        edge = bytes([0, 255, 0, 128, 127, 128, 255, 255, 0, 0, 1])
        self.assertEqual(bytes([(edge[i] - (edge[i - 1] if i else 0)) & 255 for i in range(len(edge))]),
                         H._sub_filter(edge, 1))

    def test_filtered_png_decodes_to_the_same_pixels(self):
        rows = [bytes((7 * j + 3 * i) & 255 for i in range(12)) for j in range(5)]
        for ctype, bpp in ((0, 1), (2, 3)):
            width = 12 // bpp
            plain = png_pixels(H.encode_png(width, 5, rows, ctype))
            sub = png_pixels(H.encode_png(width, 5, rows, ctype, sub_bpp=bpp))
            self.assertEqual(plain, sub)
            self.assertEqual(rows, sub[3])

    def test_an_independent_decoder_agrees(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest('Pillow 없음 — 위의 자체 해독 시험으로 족하다')
        rows = [bytes((5 * j + i) & 255 for i in range(9)) for j in range(4)]
        gray = Image.open(io.BytesIO(H.encode_png(9, 4, rows, 0, sub_bpp=1)))
        self.assertEqual(('L', (9, 4)), (gray.mode, gray.size))
        self.assertEqual(b''.join(rows), gray.tobytes())
        rgb = Image.open(io.BytesIO(H.encode_png(3, 4, rows, 2, sub_bpp=3)))
        self.assertEqual(('RGB', b''.join(rows)), (rgb.mode, rgb.tobytes()))


# ---------------------------------------------------------------- ⑥ 방향
class Orientation(TinyGrid):
    def test_row0_is_north_and_col0_is_180w(self):
        """원격자는 열0=경도 0°, 북→남. 값에 열·행 번호를 실어 보내 어디로 갔는지 본다."""
        by_col = [(i * 0.5 - 80.0) + 273.15 for _ in range(self.NJ) for i in range(self.NI)]
        _, _, ctype, rows = png_pixels(H.temp_png(by_col)[0])
        self.assertEqual(0, ctype, '회색 1채널')
        half = self.NI // 2
        self.assertEqual([(i + half) % self.NI for i in range(self.NI)], list(rows[0]),
                         '출력 열0 = 원격자 열 NI/2 = 경도 180° = 서경 180°')
        by_row = [(j * 0.5 - 80.0) + 273.15 for j in range(self.NJ) for _ in range(self.NI)]
        _, _, _, rows = png_pixels(H.temp_png(by_row)[0])
        self.assertEqual([j for j in range(self.NJ)], [r[0] for r in rows], '행0 = GRIB 첫 행 = 북위 90')

    def test_every_new_frame_turns_the_same_way_as_the_cloud_frame(self):
        """한 칸만 튀는 장을 구름과 새 프레임에 똑같이 넣는다 — 같은 픽셀에서 튀어야 한다."""
        j0, i0 = 2, 3
        spot = j0 * self.NI + i0

        def field(base, peak):
            out = [base] * self.n
            out[spot] = peak
            return out
        _, _, _, cloud = png_pixels(H.cloud_png(field(0.0, 1.9), self.flat(0.0), self.flat(0.0), self.flat(0.0)))
        where = [(j, i) for j, r in enumerate(cloud) for i in range(self.NI) if r[i * 2 + 1]]
        self.assertEqual([(j0, (i0 + self.NI // 2) % self.NI)], where)
        (cj, ci), = where
        t = png_pixels(H.temp_png(field(273.15, 303.15))[0])[3]
        m = png_pixels(H.mslp_png(field(100000.0, 96000.0))[0])[3]
        a = png_pixels(H.apcp_png(field(0.0, 40.0)))[3]
        u = png_pixels(H.wind10_png(field(0.0, 30.0), field(0.0, -30.0)))[3]
        self.assertEqual(220, t[cj][ci])
        self.assertEqual(40, m[cj][ci])
        self.assertGreater(a[cj][ci], 0)
        self.assertEqual((H._wind10_byte(30.0), H._wind10_byte(-30.0), 0), tuple(u[cj][ci * 3:ci * 3 + 3]))
        for rows, bpp, rest in ((t, 1, 160), (m, 1, 120), (a, 1, 0)):
            others = {r[i] for j, r in enumerate(rows) for i in range(self.NI) if (j, i) != (cj, ci)}
            self.assertEqual({rest}, others)


class FullGridSeoul(unittest.TestCase):
    """운영 격자(0.5° · 720×361)에서 본 세션이 서울 칸을 찾는 식이 맞는지 — verifyOnScreen 의 근거."""

    def test_seoul_cell(self):
        self.assertEqual((720, 361), (H.NI, H.NJ), '이 시험은 기본 해상도(0p50)를 전제한다')
        row = round((90 - 37.5) / 0.5)            # 105
        col = round((127.0 + 180) / 0.5)          # 614
        src = [283.15] * (720 * 361)
        src[row * 720 + int(127.0 / 0.5)] = 300.65      # 원격자: 열 = 동경 / 0.5
        png, clipped = H.temp_png(src)
        w, h, ctype, rows = png_pixels(png)
        self.assertEqual((720, 361, 0, 0), (w, h, ctype, clipped))
        self.assertEqual(27.5, rows[row][col] * 0.5 - 80.0)
        self.assertEqual(10.0, rows[row][col - 1] * 0.5 - 80.0)
        self.assertEqual((105, 614), (row, col))


# ---------------------------------------------------------------- ④ 매니페스트 · ⑧ runs[]
class FakeS3:
    def __init__(self, deny_get=False, fail_put=None):
        self.objects, self.meta, self.deny_get, self.fail_put = {}, {}, deny_get, fail_put

    def put_object(self, Bucket, Key, Body, ContentType, CacheControl):
        if self.fail_put and re.search(self.fail_put, Key):
            raise RuntimeError('put refused: ' + Key)
        self.objects[Key] = Body
        self.meta[Key] = (ContentType, CacheControl)

    def get_object(self, Bucket, Key):
        if self.deny_get:
            err = RuntimeError('AccessDenied')
            err.response = {'Error': {'Code': 'AccessDenied'}}
            raise err
        if Key not in self.objects:
            err = RuntimeError('NoSuchKey')
            err.response = {'Error': {'Code': 'NoSuchKey'}}
            raise err
        return {'Body': io.BytesIO(self.objects[Key])}


OLD_TOP_KEYS = ('source', 'truthClass', 'run', 'generatedAt', 'grid', 'windGrid', 'encoding', 'stepHours',
                'steps', 'missingSteps', 'note', 'decoder', 'elapsedS')
OLD_STEP_KEYS = ('h', 'valid', 'file', 'wind', 'precip', 'bytes', 'windBytes', 'precipBytes',
                 'wetGt01', 'cwatGt005', 'cwatGt03')
OLD_ENCODING_KEYS = ('A', 'quantization', 'B', 'precip.R', 'precip.G', 'precip.B', 'wind.R', 'wind.G')


class Manifest(TinyGrid):
    def run_handler(self, s3, run=datetime(2026, 9, 19, 18, tzinfo=timezone.utc), drop=None):
        def fake_get(url, timeout=60, tries=2):
            step = int(re.search(r'\.f(\d{3})', url).group(1))
            extra = [m for i, m in enumerate(self.fields(fh=step)) if not (drop and drop(step, i))]
            return b''.join(self.required(fh=step) + extra)
        with unittest.mock.patch.multiple(H, s3=s3, MAX_H=9, http_get=fake_get, pick_run=lambda: run):
            result = H.handler({}, None)
        return result, json.loads(s3.objects['clouds/gfs-fc/manifest.json'].decode('utf-8'))

    def test_old_keys_are_all_still_there_and_new_ones_are_added(self):
        s3 = FakeS3()
        result, mf = self.run_handler(s3)
        for key in OLD_TOP_KEYS:
            self.assertIn(key, mf, '옛 키가 사라졌다: ' + key)
        for key in OLD_ENCODING_KEYS:
            self.assertIn(key, mf['encoding'])
        self.assertEqual([0, 3, 6, 9], [s['h'] for s in mf['steps']])
        for step in mf['steps']:
            for key in OLD_STEP_KEYS:
                self.assertIn(key, step)
            self.assertEqual('2026091918/c%03d.png' % step['h'], step['file'], '기존 파일 이름은 그대로')
            self.assertEqual('2026091918/w%03d.png' % step['h'], step['wind'])
            self.assertEqual('2026091918/p%03d.png' % step['h'], step['precip'])
        self.assertEqual('2026-09-19T18:00:00Z', mf['run'])
        self.assertEqual('2026-09-20T03:00:00Z', mf['steps'][3]['valid'])
        self.assertEqual([], mf['missingSteps'])
        # 새 키
        self.assertEqual(2, mf['schema'])
        self.assertEqual(('GFS', '2026091918'), (mf['model'], mf['runTag']))
        self.assertEqual({'temp', 'wind10', 'mslp', 'apcp'}, set(mf['fields']))
        for name in ('temp', 'wind10.R', 'wind10.G', 'mslp', 'apcp'):
            self.assertIn(name, mf['encoding'])
        self.assertEqual({'temp': [], 'wind10': [], 'mslp': [], 'apcp': []}, mf['fieldMissing'])
        self.assertEqual({'messagesPerStep': 19, 'decodedPerStep': 17}, {k: mf['decodeStats'][k]
                         for k in ('messagesPerStep', 'decodedPerStep')})
        self.assertTrue(result['ok'])
        self.assertEqual({}, result['fieldMissing'])

    def test_field_frames_are_listed_per_step_and_really_uploaded(self):
        s3 = FakeS3()
        _, mf = self.run_handler(s3)
        letters = {'temp': 't', 'wind10': 'u', 'mslp': 'm', 'apcp': 'a'}
        for step in mf['steps']:
            for name, letter in letters.items():
                if name == 'apcp' and step['h'] == 0:
                    self.assertNotIn('apcp', step, 'f000 에는 누적이 없다 — 키 자체가 없어야 한다')
                    self.assertNotIn('apcpWindow', step)
                    self.assertNotIn('clouds/gfs-fc/2026091918/a000.png', s3.objects)
                    continue
                rel = '2026091918/%s%03d.png' % (letter, step['h'])
                self.assertEqual(rel, step[name])
                body = s3.objects['clouds/gfs-fc/' + rel]
                self.assertEqual(len(body), step[name + 'Bytes'])
                self.assertEqual(('image/png', 'public, max-age=86400, immutable'), s3.meta['clouds/gfs-fc/' + rel])
                w, h, _, _ = png_pixels(body)
                self.assertEqual((mf['grid']['ni'], mf['grid']['nj']), (w, h), '구름과 같은 격자')
        self.assertEqual([None, {'fromH': 0, 'toH': 3}, {'fromH': 0, 'toH': 6}, {'fromH': 6, 'toH': 9}],
                         [s.get('apcpWindow') for s in mf['steps']])
        self.assertEqual([0, 0, 0, 0], [s['tempClipped'] for s in mf['steps']])

    def test_published_values_decode_back_with_the_manifest_constants(self):
        """렌더러가 할 일을 그대로 한다: 매니페스트의 상수만으로 프레임에서 값을 꺼낸다."""
        s3 = FakeS3()
        _, mf = self.run_handler(s3)
        step = mf['steps'][3]

        def first_pixel(name):
            return png_pixels(s3.objects['clouds/gfs-fc/' + step[name]])[3][0]

        def linear(name, byte, channel='R'):
            c = mf['fields'][name]['channels'][channel]
            return byte * c['scale'] + c['offset']
        self.assertEqual(15.0, linear('temp', first_pixel('temp')[0]))              # 288.15 K
        self.assertEqual(1013.0, linear('mslp', first_pixel('mslp')[0]))            # 101300 Pa
        u = first_pixel('wind10')
        self.assertAlmostEqual(3.0, linear('wind10', u[0], 'R'), delta=0.251)
        self.assertAlmostEqual(-2.0, linear('wind10', u[1], 'G'), delta=0.251)
        self.assertEqual(0, u[2])
        c = mf['fields']['apcp']['channels']['R']
        mm = 10 ** (first_pixel('apcp')[0] / 255.0 * c['logSpan'] + c['logLo'])
        self.assertAlmostEqual(4.0, mm, delta=4.0 * 0.04)                            # 6-9h 버킷 4 mm (총량 12 가 아니다)

    def test_the_browser_loader_still_gets_what_it_reads(self):
        """prototype/v2-three/js/main.js loadGfs 가 읽는 것: steps[].h·valid·file·wind·precip, grid.ni·nj·dLon,
        generatedAt, run, stepHours. 프레임은 valid 가 날짜로 풀리고 wind 가 있어야 남는다."""
        _, mf = self.run_handler(FakeS3())
        self.assertTrue(isinstance(mf['steps'], list) and len(mf['steps']) >= 2)
        kept = [s for s in mf['steps']
                if s.get('wind') and datetime.strptime(s['valid'], '%Y-%m-%dT%H:%M:%SZ')]
        self.assertEqual(len(mf['steps']), len(kept))
        self.assertEqual((self.NI, self.NJ), (mf['grid']['ni'], mf['grid']['nj']))
        self.assertIsInstance(mf['grid']['dLon'], float)
        self.assertEqual(3, mf['stepHours'])
        src = (REPO / 'prototype' / 'v2-three' / 'js' / 'main.js').read_text(encoding='utf-8')
        for token in ('clouds/gfs-fc/manifest.json', 'mf.steps', 'st.file', 'st.wind', 'st.precip', 'st.valid',
                      'mf.grid.ni', 'mf.generatedAt', 'mf.stepHours'):
            self.assertIn(token, src, '브라우저가 읽는 키가 바뀌었다 — 이 시험의 목록도 같이 고쳐라: ' + token)

    def test_wind_grid_spacing_is_in_degrees(self):
        """dLon 에 다운샘플 '배수'(8)를 적고 있었다 — 4° 격자가 8.0 이라고 나갔다(운영 매니페스트 실측)."""
        _, mf = self.run_handler(FakeS3())
        self.assertEqual(H.WIND_DIV * H.RES_DEG, mf['windGrid']['dLon'])
        self.assertEqual(4.0, 8 * 0.5, '운영값: 0.5° × 8배 = 4°')
        self.assertEqual(('ni', 'nj', 'dLon', 'dLat', 'note'), tuple(mf['windGrid']))

    def test_a_missing_field_is_reported_not_silently_dropped(self):
        s3 = FakeS3()
        result, mf = self.run_handler(s3, drop=lambda step, i: step == 6 and i == 1)        # f006 의 TMP 2 m
        self.assertEqual([0, 3, 6, 9], [s['h'] for s in mf['steps']], '구름 스텝은 넷 다 살아 있다')
        self.assertNotIn('temp', mf['steps'][2])
        self.assertIn('mslp', mf['steps'][2])
        self.assertEqual([{'h': 6, 'why': 't2m:NOT_IN_GRIB'}], mf['fieldMissing']['temp'])
        self.assertEqual({'temp': 1}, result['fieldMissing'])
        self.assertNotIn('clouds/gfs-fc/2026091918/t006.png', s3.objects)

    def test_a_failed_field_upload_does_not_block_the_cloud_manifest(self):
        s3 = FakeS3(fail_put=r'/m003\.png$')
        _, mf = self.run_handler(s3)
        self.assertNotIn('mslp', mf['steps'][1])
        self.assertIn('PUT_FAILED', mf['fieldMissing']['mslp'][0]['why'])
        self.assertIn('file', mf['steps'][1])

    def test_fields_off_gives_the_old_manifest_plus_runs(self):
        with unittest.mock.patch.object(H, 'FIELDS_ON', False):
            s3 = FakeS3()
            _, mf = self.run_handler(s3)
        for key in OLD_TOP_KEYS:
            self.assertIn(key, mf)
        self.assertNotIn('fields', mf)
        self.assertNotIn('temp', mf['encoding'])
        self.assertFalse([k for k in s3.objects if re.search(r'/[tuma]\d{3}\.png$', k)])
        self.assertEqual(12, mf['decodeStats']['decodedPerStep'])

    # ---- runs[]
    def test_runs_lists_this_run_and_its_copy_exists(self):
        s3 = FakeS3()
        _, mf = self.run_handler(s3)
        self.assertEqual('absent', mf['previousManifest'])
        self.assertEqual([{'tag': '2026091918', 'run': '2026-09-19T18:00:00Z',
                           'manifest': '2026091918/manifest.json',
                           'generatedAt': mf['generatedAt'], 'frames': 4}], mf['runs'])
        copy = json.loads(s3.objects['clouds/gfs-fc/2026091918/manifest.json'].decode('utf-8'))
        self.assertEqual(mf, copy, '런 사본은 본 매니페스트와 같은 문서다')
        self.assertEqual('public, max-age=300', s3.meta['clouds/gfs-fc/2026091918/manifest.json'][1])

    def test_runs_keeps_the_latest_four_newest_first(self):
        s3 = FakeS3()
        runs = [datetime(2026, 9, 19, 18, tzinfo=timezone.utc), datetime(2026, 9, 20, 0, tzinfo=timezone.utc),
                datetime(2026, 9, 20, 6, tzinfo=timezone.utc), datetime(2026, 9, 20, 6, tzinfo=timezone.utc),
                datetime(2026, 9, 20, 12, tzinfo=timezone.utc), datetime(2026, 9, 20, 18, tzinfo=timezone.utc)]
        for run in runs:
            _, mf = self.run_handler(s3, run=run)
        self.assertEqual('ok', mf['previousManifest'])
        self.assertEqual(['2026092018', '2026092012', '2026092006', '2026092000'], [r['tag'] for r in mf['runs']],
                         '같은 런을 다시 만들면 한 칸이고, 다섯째부터는 밀려난다')
        for r in mf['runs']:
            self.assertIn('clouds/gfs-fc/' + r['manifest'], s3.objects, 'runs[] 는 있는 파일만 가리킨다')
            self.assertEqual(r['run'], json.loads(s3.objects['clouds/gfs-fc/' + r['manifest']])['run'])

    def test_a_pre_w0_manifest_is_not_seeded_into_runs(self):
        """옛 매니페스트에는 runs[] 도 런 사본도 없다 — 그 런을 넣으면 없는 파일을 가리킨다."""
        s3 = FakeS3()
        s3.objects['clouds/gfs-fc/manifest.json'] = json.dumps(
            {'run': '2026-09-19T12:00:00Z', 'steps': [], 'generatedAt': '2026-09-19T22:10:00Z'}).encode('utf-8')
        _, mf = self.run_handler(s3)
        self.assertEqual(['2026091918'], [r['tag'] for r in mf['runs']])

    def test_unreadable_previous_manifest_never_stops_the_run(self):
        """읽기 권한이 없거나 문서가 깨졌어도 구름은 나간다. 이유는 매니페스트에 적힌다."""
        denied = FakeS3(deny_get=True)
        _, mf = self.run_handler(denied)
        self.assertEqual((4, 1), (len(mf['steps']), len(mf['runs'])))
        self.assertEqual('error:RuntimeError:AccessDenied', mf['previousManifest'])
        broken = FakeS3()
        broken.objects['clouds/gfs-fc/manifest.json'] = b'{not json'
        _, mf = self.run_handler(broken)
        self.assertEqual((4, 1), (len(mf['steps']), len(mf['runs'])))
        self.assertTrue(mf['previousManifest'].startswith('error:'), mf['previousManifest'])

    def test_a_failed_run_copy_is_not_listed_in_runs(self):
        """사본을 못 올렸으면 runs[] 에 그 경로를 적지 않는다 — 본 매니페스트는 그래도 나간다."""
        s3 = FakeS3(fail_put=r'/2026091918/manifest\.json$')
        _, mf = self.run_handler(s3)
        self.assertEqual([], mf['runs'])
        self.assertEqual(4, len(mf['steps']))

    def test_garbage_in_previous_runs_is_ignored(self):
        cur = {'tag': '2026092000', 'run': 'x', 'manifest': '2026092000/manifest.json'}
        prev = {'runs': ['2026091918', {'tag': 2026091912}, {'tag': '2026091906'},
                         {'tag': '2026091900', 'manifest': '2026091900/manifest.json'}, None]}
        self.assertEqual(['2026092000', '2026091900'], [r['tag'] for r in H.merge_runs(prev, cur)])
        self.assertEqual([cur], H.merge_runs(None, cur))
        self.assertEqual([cur], H.merge_runs({}, cur))


# ---------------------------------------------------------------- 요청 URL
class RequestUrl(unittest.TestCase):
    def test_level_and_variable_strings_are_the_ones_nomads_lists(self):
        """필터 페이지의 체크박스 name 그대로(2026-09-20 확인). 틀리면 0바이트/500 이다."""
        url = H.url_for(datetime(2026, 9, 19, 18, tzinfo=timezone.utc), 9)
        q = dict(p.split('=') for p in url.split('?', 1)[1].split('&'))
        for key in ('var_TMP', 'var_PRMSL', 'var_APCP', 'lev_2_m_above_ground', 'lev_10_m_above_ground',
                    'lev_mean_sea_level'):
            self.assertEqual('on', q.get(key), key)
        self.assertNotIn('lev_10_m_above_mean_sea_level', q, '이름이 비슷한 다른 레벨이다')
        for key in ('var_CWAT', 'var_LCDC', 'var_MCDC', 'var_HCDC', 'var_UGRD', 'var_VGRD', 'var_PRATE',
                    'var_CPRAT', 'var_CAPE', 'var_CRAIN', 'var_CSNOW', 'var_CFRZR', 'var_CICEP', 'lev_surface',
                    'lev_low_cloud_layer', 'lev_middle_cloud_layer', 'lev_high_cloud_layer', 'lev_700_mb',
                    'lev_entire_atmosphere_%5C%28considered_as_a_single_layer%5C%29'):
            self.assertEqual('on', q.get(key), '예전 요청이 빠졌다: ' + key)
        self.assertEqual('gfs.t18z.pgrb2full.0p50.f009', q['file'])


# ---------------------------------------------------------------- ⑨ 패키징
class Packaging(unittest.TestCase):
    def test_no_shared_modules_and_the_package_imports(self):
        planned = lp.plan(str(FUNC), str(AWS / '_shared'))
        self.assertEqual([], planned['sharedModules'])
        self.assertEqual([], planned['subPackages'])
        self.assertEqual(['grib2lite.py', 'handler.py'], planned['topLevelModules'])
        import tempfile
        with tempfile.TemporaryDirectory() as folder:
            dest = os.path.join(folder, 'task')
            lp.stage(str(FUNC), str(AWS / '_shared'), dest)
            self.assertEqual([], lp.missing_own_modules(dest, str(FUNC), str(AWS / '_shared')))
            self.assertTrue(lp.import_check(dest)['ok'])

    def test_the_deploy_script_zips_every_module_the_function_has(self):
        """tools/deploy-gfs-forecast.sh 는 파일을 **이름으로** zip 한다 — 모듈을 하나 더 만들면 조용히 안 실린다."""
        script = (REPO / 'tools' / 'deploy-gfs-forecast.sh').read_text(encoding='utf-8')
        listed = re.search(r"for name in \(([^)]*)\)", script).group(1)
        zipped = sorted(re.findall(r"'([^']+\.py)'", listed))
        self.assertEqual(lp.plan(str(FUNC), str(AWS / '_shared'))['topLevelModules'], zipped)


if __name__ == '__main__':
    unittest.main()
