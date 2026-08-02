# -*- coding: utf-8 -*-
"""같은 해변이 이름만 달리 두 번 들어온 것을 하나로 합친다.

⚠️ 거리만으로 합치면 안 된다. 27m 떨어진 '게우지코지'와 '생이돌'은 **다른 곳**이다.
   → 가깝고 **이름이 서로 이어질 때만** 합친다:
       · 다듬은 이름이 같거나  · 한쪽이 다른 쪽을 포함하거나
       · 한쪽만 로마자(같은 곳의 영문 표기)
⚠️ 남길 쪽은 **한글 우선 → 방위 있는 것 우선 → 일관성 높은 것 우선**.
   화면에 나오려면 방위가 있어야 하므로 그게 이름보다 앞설 때도 있다.
"""
import io, json, math, re, sys

SRC = 'prototype/data/beaches.json'
NEAR_M = 250

# 다듬은 이름이 **똑같을 때만** 여기까지 넓힌다.
# ⚠️ 받은 지시: "해변, 해수욕장은 빼고 이름만 가자" — 그러면 화면에는 짧은 이름만
#    남는데, 250m 기준으로는 "망상 해수욕장"(37.594)과 "망상해수욕장"(37.598)이
#    600m 떨어져 둘 다 살아남는다. 지도에 **같은 이름이 두 번** 뜬다.
#    실측으로 걸린 것: 망상 600m · 송정 600m · 맹방 300m · 무창포 250m.
# ⚠️ 이름이 같아도 1.5km 를 넘으면 합치지 않는다. 실제로 다른 곳이 있다 —
#    송도(부산 35.08 / 포항 36.04) · 옥계(남해 34.98 / 동해 37.63) ·
#    망양(울진 36.84 / 36.97, 12km). 이것들은 이름만 같은 남남이다.
SAME_NAME_M = 1500
HAN = re.compile(r'[가-힣]')
TAIL = re.compile(r'\s*(해수욕장|해변|해안|해수욕|비치|야영장|캠핑장)+\s*$')
PAREN = re.compile(r'\s*\([^)]*\)\s*')

def short(n):
    t = PAREN.sub('', str(n or '')).strip()
    t = TAIL.sub('', TAIL.sub('', t)).strip()
    return (t or str(n or '')).replace(' ', '')

def km(a1, o1, a2, o2):
    R = 6371.0; r = math.pi / 180
    dl = (o2 - o1) * r; dp = (a2 - a1) * r
    h = math.sin(dp/2)**2 + math.cos(a1*r)*math.cos(a2*r)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(h))

def linked(a, b):
    sa, sb = short(a['n']), short(b['n'])
    if sa == sb: return True
    if sa and sb and (sa in sb or sb in sa): return True
    # 한쪽만 로마자 = 같은 곳의 영문 표기로 본다
    if bool(HAN.search(a['n'])) != bool(HAN.search(b['n'])): return True
    return False

def better(a, b):
    """남길 쪽을 고른다 (True 면 a)"""
    ha, hb = bool(HAN.search(a['n'])), bool(HAN.search(b['n']))
    if ha != hb: return ha
    fa, fb = a.get('f') is not None, b.get('f') is not None
    if fa != fb: return fa
    ca, cb = a.get('c') or 0, b.get('c') or 0
    if ca != cb: return ca > cb
    return len(a['n']) <= len(b['n'])          # 짧고 깔끔한 쪽

j = json.load(io.open(SRC, encoding='utf-8'))
B = j['beaches']
drop = set()
merged = []
for i, a in enumerate(B):
    if i in drop: continue
    for k in range(i + 1, len(B)):
        if k in drop: continue
        b = B[k]
        d = km(a['la'], a['lo'], b['la'], b['lo']) * 1000
        same = short(a['n']) == short(b['n'])
        if d > (SAME_NAME_M if same else NEAR_M): continue
        if not linked(a, b): continue
        keep, gone = (a, b) if better(a, b) else (b, a)
        # ⚠️ 버리는 쪽에만 방위가 있으면 그 값을 살린다 — 화면에 나오는 게 그 값이다
        if keep.get('f') is None and gone.get('f') is not None:
            for kk in ('f', 'c', 'sp'):
                if kk in gone: keep[kk] = gone[kk]
            keep.pop('why', None)
        if not HAN.search(keep['n']) and HAN.search(gone['n']):
            keep['n'] = gone['n']
        merged.append((gone['n'], keep['n']))
        drop.add(k if keep is a else i)
        if keep is b:
            a = b
out = [b for i, b in enumerate(B) if i not in drop]
j['beaches'] = out
j['count'] = len(out)
j['withFacing'] = sum(1 for b in out if b.get('f') is not None)
j['dedup'] = {
    'nearM': NEAR_M, 'sameNameM': SAME_NAME_M, 'removed': len(drop),
    'ko': '같은 해변이 이름만 달리 두 번 들어온 것을 합쳤습니다. '
          '가깝기만 하면 합치지 않고 **이름이 서로 이어질 때만** 합칩니다 — '
          '27m 떨어진 다른 해변을 하나로 만들지 않기 위해서입니다.',
}
io.open(SRC, 'w', encoding='utf-8').write(
    json.dumps(j, ensure_ascii=False, separators=(",", ":")))
print(f"  합친 것 {len(drop)}곳 → 남은 {len(out)}곳 (방위 {j['withFacing']}곳)")
for g, kp in merged: print(f"    {g:28s} → {kp}")
