# -*- coding: utf-8 -*-
"""천리안2A 적외 11.2㎛ → 밝기온도 → 등경위도 PNG (numpy 만으로)"""
import netCDF4, numpy as np
from PIL import Image

d = netCDF4.Dataset("gk2a_la.nc")
raw = np.ma.filled(d.variables["image_pixel_values"][:], 0).astype(np.uint16)
# ⚠️⚠️ 16비트 중 **유효 13비트**다. 위 2비트는 품질 플래그다 —
#    안 떼면 불량 화소가 6만 대 값으로 튀어 화면에 흰 점으로 박힌다.
dn = (raw & 0x1FFF).astype(np.float64)
ny, nx = dn.shape

g, off = float(d.DN_to_Radiance_Gain), float(d.DN_to_Radiance_Offset)
lam = float(d.channel_center_wavelength)          # 11.2 ㎛
rad = g * dn + off                                # ⚠️ 기울기가 **음수**다 = 값이 클수록 차갑다
# ⚠️⚠️ 복사휘도가 **파수(cm⁻¹) 기준**이다 — 파장(㎛) 식을 쓰면 131~437°C 가 나온다.
#    (실제로 한 번 그렇게 나왔다. 물리적으로 불가능한 값이라 바로 걸렸다.)
#    검산: 바다 화소 L=100 → 15.5°C, 한낮 육지 L=132 → 34.6°C, 높은 구름 L=29 → -46.6°C
nu = 1e4 / lam                                    # 11.2㎛ → 892.86 cm⁻¹
c1, c2 = 1.191042e-5, 1.4387752                   # mW/(m²·sr·cm⁻⁴), cm·K
bt = (c2 * nu) / np.log1p(c1 * nu**3 / np.maximum(rad, 1e-6))
print(f"복사휘도 {rad.min():.1f}~{rad.max():.1f} → 밝기온도 {bt.min()-273.15:.1f}~{bt.max()-273.15:.1f}°C")

sub = float(d.sub_longitude)
ulx, uly = float(d.image_upperleft_x), float(d.image_upperleft_y)
lrx, lry = float(d.image_lowerright_x), float(d.image_lowerright_y)
dx, dy = (lrx-ulx)/nx, (lry-uly)/ny

LAT0, LAT1, LON0, LON1 = 31.5, 43.5, 120.5, 132.0
W, H = 1100, 1150
lon = np.linspace(LON0, LON1, W)[None,:]; lat = np.linspace(LAT1, LAT0, H)[:,None]
REQ, RPOL, ALT = 6378.137, 6356.7523, 42164.0
la, lo = np.radians(lat), np.radians(lon)
cl = np.arctan(0.993243*np.tan(la))
rl = RPOL/np.sqrt(1-0.00669438444*np.cos(cl)**2)
dl = lo-sub
r1 = ALT-rl*np.cos(cl)*np.cos(dl); r2 = -rl*np.cos(cl)*np.sin(dl); r3 = rl*np.sin(cl)
rn = np.sqrt(r1**2+r2**2+r3**2)
vis = (ALT*(ALT-r1)-r2**2-(r3*REQ/RPOL)**2) > 0
col = ((np.arctan(-r2/r1)-ulx)/dx-0.5); row = ((np.arcsin(r3/rn)-uly)/dy-0.5)
ok = vis & (col>=0)&(col<nx-1)&(row>=0)&(row<ny-1)
T = bt[np.clip(np.round(row),0,ny-1).astype(int), np.clip(np.round(col),0,nx-1).astype(int)] - 273.15

# ⚠️ 차가울수록 높은 구름 = 하얗게. 기준을 고정한다 —
#    사진마다 자동으로 늘리면 **날마다 밝기가 달라져 비교가 안 된다.**
HOT, COLD = 35.0, -75.0        # °C
gy = np.clip((HOT - T)/(HOT - COLD), 0, 1)
rgba = np.zeros((H,W,4), np.uint8)
rgba[...,:3] = (gy*255).astype(np.uint8)[...,None]
# ⚠️ 투명도는 **밝기가 아니라 온도**로 정한다. 25°C 부터 비치기 시작해
#    -20°C 면 완전히 덮는다 — 지표(30°C 안팎)는 비고 구름만 남는다.
#    ⚠️⚠️ 적외 하나로는 **낮은 구름과 따뜻한 바다를 깨끗이 못 가른다.**
#       둘 다 20°C 근처다. 이건 자료의 한계지 설정 문제가 아니다.
a = np.clip((25.0 - T)/45.0, 0, 1)
rgba[...,3] = (a*255).astype(np.uint8); rgba[~ok] = 0
Image.fromarray(rgba).save("gk2a_korea.png")
print(f"→ gk2a_korea.png  {W}×{H}")
bgim = Image.new("RGBA",(W,H),(14,26,42,255)); bgim.alpha_composite(Image.open("gk2a_korea.png"))
bgim.convert("RGB").save("gk2a_view.png")
