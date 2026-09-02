# -*- coding: utf-8 -*-
"""GRIB2 최소 해독기 — GFS pgrb2 의 복합 패킹(템플릿 5.2/5.3)과 단순 패킹(5.0)만 읽는다.

왜 직접 쓰는가: eccodes 는 C 라이브러리(eccodeslib+eckitlib manylinux 휠)를 끌고 와야 하고,
그 패키징이 이 계정에서 검증된 적이 없다(gfs-cloud-global-low 가 한 번도 배포되지 않았다).
GFS 1.0° 파일의 TCDC/UGRD/VGRD 는 전부 템플릿 5.3 이라 이것만 읽으면 된다.

무엇을 안 하는가: JPEG2000(5.40)·PNG(5.41)·격자 템플릿 3.0 외는 거부한다.
읽을 수 없으면 값을 만들지 않고 예외를 낸다.

검증: 로컬 eccodes 2.48 과 같은 파일을 해독해 배열이 일치하는지 tests 로 확인한다.
"""
import struct


class Grib2Error(Exception):
    pass


def _u(b, o, n):
    return int.from_bytes(b[o:o + n], 'big', signed=False)


def _s(b, o, n):
    """GRIB2 부호: 최상위 비트가 부호, 나머지가 크기 (2의 보수가 아니다)."""
    v = _u(b, o, n)
    sign = 1 << (8 * n - 1)
    return -(v & (sign - 1)) if v & sign else v


class _Bits:
    __slots__ = ('b', 'pos')

    def __init__(self, b, start_byte=0):
        self.b = b
        self.pos = start_byte * 8

    def read(self, nbits):
        if nbits == 0:
            return 0
        byte = self.pos >> 3
        end_bit = self.pos + nbits
        nbytes = ((end_bit + 7) >> 3) - byte
        chunk = int.from_bytes(self.b[byte:byte + nbytes], 'big')
        shift = nbytes * 8 - (self.pos & 7) - nbits
        self.pos = end_bit
        return (chunk >> shift) & ((1 << nbits) - 1)

    def read_many(self, nbits, count):
        out = [0] * count
        if nbits == 0:
            self.pos += 0
            return out
        b = self.b
        pos = self.pos
        mask = (1 << nbits) - 1
        for i in range(count):
            byte = pos >> 3
            end_bit = pos + nbits
            nbytes = ((end_bit + 7) >> 3) - byte
            chunk = int.from_bytes(b[byte:byte + nbytes], 'big')
            out[i] = (chunk >> (nbytes * 8 - (pos & 7) - nbits)) & mask
            pos = end_bit
        self.pos = pos
        return out


def messages(buf):
    """버퍼 안의 GRIB2 메시지를 (section dict) 로 하나씩 낸다."""
    i = 0
    while True:
        j = buf.find(b'GRIB', i)
        if j < 0:
            return
        if buf[j + 7] != 2:
            raise Grib2Error('GRIB edition %d not supported' % buf[j + 7])
        total = _u(buf, j + 8, 8)
        msg = buf[j:j + total]
        if len(msg) != total:
            raise Grib2Error('truncated message')
        secs = {}
        k = 16
        while k < len(msg) - 4:
            ln = _u(msg, k, 4)
            num = msg[k + 4]
            secs[num] = msg[k:k + ln]
            k += ln
            if num == 7:
                break
        yield secs
        i = j + total


def describe(secs):
    """무슨 필드인지 — 카테고리/번호/레벨/예보시간. GFS 표만 아는 것으로 족하다."""
    s1 = secs[1]
    s4 = secs[4]
    tmpl4 = _u(s4, 7, 2)
    d = {
        'pdt': tmpl4,
        'category': s4[9],
        'number': s4[10],
        'levelType': s4[22],
        'levelValue': _u(s4, 24, 4) if len(s4) > 27 else None,
        'levelScale': _s(s4, 23, 1) if len(s4) > 23 else 0,
        'refTime': (_u(s1, 12, 2), s1[14], s1[15], s1[16], s1[17], s1[18]),
    }
    if tmpl4 in (0, 8):
        unit = s4[17]
        fh = _u(s4, 18, 4)
        d['forecastHours'] = fh if unit == 1 else (fh * 24 if unit == 2 else None)
    return d


def _grid(secs):
    s3 = secs[3]
    tmpl3 = _u(s3, 12, 2)
    if tmpl3 != 0:
        raise Grib2Error('grid template %d not supported' % tmpl3)
    ni = _u(s3, 30, 4)
    nj = _u(s3, 34, 4)
    lat1 = _s(s3, 46, 4) / 1e6
    lon1 = _s(s3, 50, 4) / 1e6
    lat2 = _s(s3, 55, 4) / 1e6
    lon2 = _s(s3, 59, 4) / 1e6
    di = _u(s3, 63, 4) / 1e6
    dj = _u(s3, 67, 4) / 1e6
    scan = s3[71]
    return {'ni': ni, 'nj': nj, 'lat1': lat1, 'lon1': lon1, 'lat2': lat2, 'lon2': lon2,
            'di': di, 'dj': dj, 'scan': scan,
            'jPositive': bool(scan & 0x40), 'iNegative': bool(scan & 0x80)}


def _bitmap(secs, npts):
    s6 = secs.get(6)
    if s6 is None:
        return None
    ind = s6[5]
    if ind == 255:
        return None
    if ind != 0:
        raise Grib2Error('predefined bitmap %d not supported' % ind)
    bits = _Bits(s6, 6)
    return bits.read_many(1, npts)


def values(secs):
    """섹션 7 을 float 리스트로. 없는 값(비트맵 0)은 None."""
    s5 = secs[5]
    s7 = secs[7]
    npts = _u(s5, 5, 4)
    tmpl5 = _u(s5, 9, 2)
    ref = struct.unpack('>f', s5[11:15])[0]
    bin_scale = _s(s5, 15, 2)
    dec_scale = _s(s5, 17, 2)
    nbits = s5[19]
    scale = (2.0 ** bin_scale) / (10.0 ** dec_scale)
    ref_d = ref / (10.0 ** dec_scale)
    bitmap = _bitmap(secs, npts)
    ndata = npts if bitmap is None else sum(bitmap)

    if tmpl5 == 0:
        bits = _Bits(s7, 5)
        raw = bits.read_many(nbits, ndata)
        vals = [ref_d + x * scale for x in raw]
    elif tmpl5 in (2, 3):
        vals = _complex(s5, s7, ndata, tmpl5, ref_d, scale, nbits)
    else:
        raise Grib2Error('packing template %d not supported' % tmpl5)

    if bitmap is None:
        return vals
    out = [None] * npts
    k = 0
    for i, m in enumerate(bitmap):
        if m:
            out[i] = vals[k]
            k += 1
    return out


def _complex(s5, s7, ndata, tmpl5, ref_d, scale, nbits):
    """템플릿 5.2/5.3 — 그룹 분할 복합 패킹 (+ 공간 차분)."""
    group_split = s5[21]
    missing_mgmt = s5[22]
    if missing_mgmt not in (0, 1, 2):
        raise Grib2Error('missing management %d' % missing_mgmt)
    prim_missing = _u(s5, 23, 4)
    sec_missing = _u(s5, 27, 4)
    ng = _u(s5, 31, 4)
    ref_group_width = s5[35]
    nbits_group_width = s5[36]
    ref_group_len = _u(s5, 37, 4)
    len_inc = s5[41]
    last_group_len = _u(s5, 42, 4)
    nbits_group_len = s5[46]
    if group_split != 1:
        raise Grib2Error('group splitting method %d not supported' % group_split)

    order = 0
    nbytes_sd = 0
    if tmpl5 == 3:
        order = s5[47]
        nbytes_sd = s5[48]
        if order not in (1, 2):
            raise Grib2Error('spatial differencing order %d' % order)

    bits = _Bits(s7, 5)
    # 공간 차분 헤더: 첫 값(들)과 최소값
    sd_first = []
    sd_min = 0
    if tmpl5 == 3 and nbytes_sd:
        for _ in range(order):
            sd_first.append(bits.read(nbytes_sd * 8))
        raw_min = bits.read(nbytes_sd * 8)
        sign = 1 << (nbytes_sd * 8 - 1)
        sd_min = -(raw_min & (sign - 1)) if raw_min & sign else raw_min
        # 부호 처리: 첫 값들도 부호 있는 정수
        fixed = []
        for v in sd_first:
            fixed.append(-(v & (sign - 1)) if v & sign else v)
        sd_first = fixed

    # 그룹 참조값
    group_refs = bits.read_many(nbits, ng)
    bits.pos = (bits.pos + 7) & ~7
    # 그룹 폭
    group_widths = [ref_group_width + w for w in bits.read_many(nbits_group_width, ng)]
    bits.pos = (bits.pos + 7) & ~7
    # 그룹 길이
    group_lens = [ref_group_len + len_inc * l for l in bits.read_many(nbits_group_len, ng)]
    if ng:
        group_lens[-1] = last_group_len
    bits.pos = (bits.pos + 7) & ~7

    total = sum(group_lens)
    if total != ndata:
        raise Grib2Error('group lengths %d != data points %d' % (total, ndata))

    # 패킹된 정수값
    ints = [0] * ndata
    k = 0
    if missing_mgmt == 0:
        for g in range(ng):
            w = group_widths[g]
            r = group_refs[g]
            n = group_lens[g]
            if w == 0:
                for i in range(n):
                    ints[k + i] = r
            else:
                vals = bits.read_many(w, n)
                for i in range(n):
                    ints[k + i] = r + vals[i]
            k += n
        missing = None
    else:
        # 결측 관리: 그룹 폭 전부 1 인 패턴 등 — GFS 구름/바람에는 안 나온다. 보수적으로 처리.
        missing = [False] * ndata
        for g in range(ng):
            w = group_widths[g]
            r = group_refs[g]
            n = group_lens[g]
            all_missing_mark = (1 << nbits) - 1
            if w == 0:
                if r == all_missing_mark:
                    for i in range(n):
                        missing[k + i] = True
                else:
                    for i in range(n):
                        ints[k + i] = r
            else:
                mark = (1 << w) - 1
                vals = bits.read_many(w, n)
                for i in range(n):
                    if vals[i] == mark:
                        missing[k + i] = True
                    else:
                        ints[k + i] = r + vals[i]
            k += n

    # 공간 차분 복원
    if tmpl5 == 3 and nbytes_sd:
        if order == 1:
            ints[0] = sd_first[0]
            for i in range(1, ndata):
                ints[i] = ints[i] + sd_min + ints[i - 1]
        else:
            ints[0] = sd_first[0]
            ints[1] = sd_first[1]
            for i in range(2, ndata):
                ints[i] = ints[i] + sd_min + 2 * ints[i - 1] - ints[i - 2]

    out = [ref_d + x * scale for x in ints]
    if missing is not None:
        out = [None if m else v for v, m in zip(out, missing)]
    return out


def decode(secs):
    """(설명, 격자, 값 리스트[nj*ni, 북→남·서→동 순서]) 를 돌려준다."""
    d = describe(secs)
    g = _grid(secs)
    v = values(secs)
    if len(v) != g['ni'] * g['nj']:
        raise Grib2Error('value count %d != grid %dx%d' % (len(v), g['ni'], g['nj']))
    return d, g, v
