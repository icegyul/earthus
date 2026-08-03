# -*- coding: utf-8 -*-
"""활공장 최종 — 세 겹으로 거른다.
 ① 이름 함정   '활공'은 재-활공-학, 생-활공-원 한가운데 들어간다 (38→24건)
 ② 좌표 선택   업체 노드(학원 사무실)가 아니라 **free_flying 로 그려진 땅**을 쓴다
 ③ 고도 검증   ⚠️⚠️ 활공장은 산 위에 있다. 문경 단산에서 139m 동명이산을
               적을 뻔한 것과 같은 검사다. 낮으면 착륙장이거나 사무실이다.
"""
import json, math, urllib.request, urllib.parse

raw  = json.load(open("para_osm.json", encoding="utf-8"))
old  = json.load(open("/Volumes/740GB/웹/World.com/prototype/data/para.json", encoding="utf-8"))
prev = old.get("sites") or old
TRAP = ("재활공", "생활공", "활공학")

def km(a1,o1,a2,o2):
    R=6371.0;p1,p2=math.radians(a1),math.radians(a2)
    dp,dl=p2-p1,math.radians(o2-o1)
    h=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(min(1,math.sqrt(h)))

def keep(o):
    n=(o.get("n") or "")
    if any(t in n for t in TRAP): return False
    if o.get("sport")=="free_flying": return True
    return ("활공장" in n or "패러글라이딩" in n) and not n.endswith(("길","로"))

cand=[o for o in raw if keep(o)]
groups=[]
for o in sorted(cand,key=lambda x:(-x["la"],x["lo"])):
    for g in groups:
        if km(g[0]["la"],g[0]["lo"],o["la"],o["lo"])<=3.0: g.append(o); break
    else: groups.append([o])

sites=[]
for g in groups:
    # ② free_flying 로 그려진 것이 있으면 **그 좌표**를 쓴다. 없으면 평균.
    ff=[x for x in g if x.get("sport")=="free_flying"]
    src = ff or g
    la=sum(x["la"] for x in src)/len(src); lo=sum(x["lo"] for x in src)/len(src)
    if any(km(p["la"],p["lo"],la,lo)<=5.0 for p in prev): continue
    name=next((x["n"] for x in g if x.get("n") and not any(t in x["n"] for t in TRAP)), None)
    sites.append({"n":name,"la":round(la,5),"lo":round(lo,5),
                  "ff":bool(ff),"osm":f"{src[0]['type']}/{src[0]['id']}"})

q=urllib.parse.urlencode({"latitude":",".join(f"{s['la']:.5f}" for s in sites),
                          "longitude":",".join(f"{s['lo']:.5f}" for s in sites)})
with urllib.request.urlopen(f"https://api.open-meteo.com/v1/elevation?{q}",timeout=60) as r:
    for s,e in zip(sites,json.load(r)["elevation"]): s["alt"]=round(e,1)

# ③ 판정 — free_flying 태그가 있거나(＋150m 이상), 이름만이면 300m 이상
def verdict(s):
    if s["ff"] and s["alt"]>=150: return None
    if s["ff"]:  return f"free_flying 인데 {s['alt']:.0f}m — 착륙장이거나 사무실"
    if s["alt"]>=300: return None
    return f"태그 없이 이름만이고 {s['alt']:.0f}m — 모형기 활공장일 수 있음"

ok,no=[],[]
for s in sites:
    r=verdict(s)
    (no if r else ok).append((s,r))
print(f"■ 채택 {len(ok)}곳")
for s,_ in sorted(ok,key=lambda x:-x[0]["la"]):
    print(f"   {s['n'] or '(이름없음)':<24} {s['la']:.4f},{s['lo']:.4f} {s['alt']:>6.0f}m  {s['osm']}")
print(f"\n■ 뺀 것 {len(no)}곳 — 이유를 적어 둔다")
for s,r in no: print(f"   {s['n'] or '(이름없음)':<24} {r}")
json.dump([s for s,_ in ok],open("para_ok.json","w",encoding="utf-8"),ensure_ascii=False,indent=1)
