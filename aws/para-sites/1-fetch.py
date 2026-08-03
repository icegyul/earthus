# 활공장 — OSM 에서 **직접 태그된 것**만 받는다.
# ⚠️⚠️ 산 이름을 짐작해 좌표를 붙이지 않는다. 문경 단산에서 동명이산에 걸려
#    139m 짜리 엉뚱한 봉우리를 활공장이라고 적을 뻔했다.
import json, urllib.request, urllib.parse, time

Q = """
[out:json][timeout:120];
area["ISO3166-1"="KR"][admin_level=2]->.kr;
(
  nwr(area.kr)["sport"="free_flying"];
  nwr(area.kr)["name"~"활공"];
  nwr(area.kr)["name"~"패러글라이딩"];
  nwr(area.kr)["paragliding"];
);
out center tags;
"""
url = "https://overpass-api.de/api/interpreter"
for attempt in range(4):
    try:
        req = urllib.request.Request(url, data=urllib.parse.urlencode({"data": Q}).encode(),
                                     headers={"User-Agent": "earthus/1.0 (dalur@kakao.com)"})
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.load(r)
        break
    except Exception as e:
        print("재시도", attempt+1, str(e)[:80]); time.sleep(10 * (attempt+1))
else:
    raise SystemExit("Overpass 실패")

out = []
for el in d.get("elements", []):
    t = el.get("tags", {})
    lat = el.get("lat") or (el.get("center") or {}).get("lat")
    lon = el.get("lon") or (el.get("center") or {}).get("lon")
    if lat is None: continue
    out.append({"n": t.get("name") or t.get("name:ko"), "la": round(lat,5), "lo": round(lon,5),
                "sport": t.get("sport"), "type": el["type"], "id": el["id"],
                "ele": t.get("ele")})
print(len(out), "건")
for o in sorted(out, key=lambda x: -(x["la"] or 0)):
    print(f"  {str(o['n']):<24} {o['la']:.4f},{o['lo']:.4f}  {o['sport'] or ''} {o['type']}/{o['id']}")
json.dump(out, open("para_osm.json","w",encoding="utf-8"), ensure_ascii=False, indent=1)
