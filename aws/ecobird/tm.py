# -*- coding: utf-8 -*-
"""횡축 메르카토르(TM) 역변환 — 미터 좌표를 위경도로.

■⚠️⚠️⚠️ **에코뱅크 좌표는 위경도가 아니다.** `POINT(286374.92 595580.69)` 처럼
   미터 단위 투영좌표로 온다. 그대로 lat/lon 으로 읽으면 아프리카 앞바다에 찍힌다.

■⚠️⚠️ 좌표계를 **EPSG:5186** (Korea 2000 중부원점 · GRS80)으로 확정했다.
   후보가 둘이었고 수백 m 가 아니라 **1도(약 100km)나 어긋난다** — 고를 문제가 아니었다.

     자료                     EPSG:5186            EPSG:5174
     백두대간 큰부리까마귀    37.879N 128.514E     38.780N 128.533E
     생태계정밀 찌르레기      36.823N 128.097E     37.723N 128.110E

   ⚠️ 5174 로 풀면 **전부 북한**으로 간다. 남한 조사 자료가 그럴 리 없다.
   ⚠️ 5186 으로 풀면 **백두대간 자료가 오대산 능선(37.88N 128.51E)에 정확히 떨어진다.**
      자료 이름과 떨어지는 자리가 맞는 것 — 이게 결정적 근거다.

■ pyproj 를 쓰지 않는다. Lambda 에 무거운 의존을 넣지 않으려고 직접 푼다.
   (Snyder, Map Projections — A Working Manual 의 역변환 급수)
"""
import math

# EPSG:5186 — Korea 2000 / Central Belt 2010
A = 6378137.0
INV_F = 298.257222101
LAT0 = math.radians(38.0)
LON0 = math.radians(127.0)
K0 = 1.0
FE = 200000.0
FN = 600000.0

_F = 1 / INV_F
_E2 = _F * (2 - _F)
_EP2 = _E2 / (1 - _E2)
_E1 = (1 - math.sqrt(1 - _E2)) / (1 + math.sqrt(1 - _E2))


def _M(phi):
    return A * ((1 - _E2 / 4 - 3 * _E2 ** 2 / 64 - 5 * _E2 ** 3 / 256) * phi
                - (3 * _E2 / 8 + 3 * _E2 ** 2 / 32 + 45 * _E2 ** 3 / 1024) * math.sin(2 * phi)
                + (15 * _E2 ** 2 / 256 + 45 * _E2 ** 3 / 1024) * math.sin(4 * phi)
                - (35 * _E2 ** 3 / 3072) * math.sin(6 * phi))


_M0 = _M(LAT0)


def to_wgs84(x, y):
    """TM(미터) → (위도, 경도). 못 풀면 None."""
    try:
        Mv = _M0 + (y - FN) / K0
        mu = Mv / (A * (1 - _E2 / 4 - 3 * _E2 ** 2 / 64 - 5 * _E2 ** 3 / 256))
        p1 = (mu + (3 * _E1 / 2 - 27 * _E1 ** 3 / 32) * math.sin(2 * mu)
              + (21 * _E1 ** 2 / 16 - 55 * _E1 ** 4 / 32) * math.sin(4 * mu)
              + (151 * _E1 ** 3 / 96) * math.sin(6 * mu))
        C1 = _EP2 * math.cos(p1) ** 2
        T1 = math.tan(p1) ** 2
        N1 = A / math.sqrt(1 - _E2 * math.sin(p1) ** 2)
        R1 = A * (1 - _E2) / (1 - _E2 * math.sin(p1) ** 2) ** 1.5
        D = (x - FE) / (N1 * K0)
        lat = p1 - (N1 * math.tan(p1) / R1) * (
            D ** 2 / 2
            - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * _EP2) * D ** 4 / 24
            + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * _EP2 - 3 * C1 ** 2) * D ** 6 / 720)
        lon = LON0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
                      + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * _EP2 + 24 * T1 ** 2)
                      * D ** 5 / 120) / math.cos(p1)
        return math.degrees(lat), math.degrees(lon)
    except Exception:               # noqa: BLE001
        return None


def parse_point(geom):
    """`POINT(286374.92 595580.69)` → (위도, 경도). 형식이 다르면 None.
    ⚠️ 숫자 두 개가 아니면 **추측하지 않고 버린다.**"""
    if not geom or "POINT" not in geom:
        return None
    try:
        inside = geom[geom.index("(") + 1:geom.rindex(")")]
        parts = inside.replace(",", " ").split()
        if len(parts) < 2:
            return None
        return to_wgs84(float(parts[0]), float(parts[1]))
    except Exception:               # noqa: BLE001
        return None
