#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""제안서용 화면캡처 — 실제 서비스에서 찍는다.

⚠️ 왜 장치가 필요한가 (세 가지가 다 걸린다)

 ① store.js 는 **새 탭으로 들어오면 레이어를 전부 끈다** (loadLayerState).
    sessionStorage['earthus.session'] 이 없으면 fresh 로 보기 때문이다.
    → 같은 출처의 준비 페이지에서 저장소를 먼저 심고 index.html 로 넘어간다.

 ② 코치마크(첫 실행 안내)가 화면 한가운데를 가린다.
    → localStorage['earthus.coachDone'] = '1'

 ③ 그냥 열면 카메라가 전지구라 지구가 화면에서 작고, 시계·기온이 위에 덮인다.
    ⚠️ config.js 의 T.CHROME = 9,000,000 **미만**으로 내려가야
       store 가 mode 를 'explore' 로 바꾸고 시계가 걷힌다 (ui.js:1893).
       9,000,000 을 그대로 쓰면 '이하'가 아니라 '미만'이라 안 걷힌다 — 실제로 겪었다.
    → iframe 으로 띄운 뒤 같은 출처에서 viewer.flyTo 를 부른다.

⚠️ 헤드리스 크롬은 WebGL 이 없어서 Cesium 이 아예 안 뜬다.
   --use-angle=swiftshader --enable-unsafe-swiftshader 가 반드시 있어야 한다.

쓰는 법:  python3 docs/proposals/shots.py
"""
import io, json, os, subprocess, time

HERE   = os.path.dirname(os.path.abspath(__file__))
PROTO  = os.path.abspath(os.path.join(HERE, '..', '..', 'prototype'))
OUT    = os.path.join(HERE, 'img')
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PORT   = 8877

DEFAULTS_VER = '13'      # store.js 와 같아야 한다. 다르면 레이어가 초기화된다.
EXPLORE_H    = 8_600_000  # T.CHROME(9,000,000) 미만 — 시계가 걷히는 높이

# 이름, 켤 레이어, 카메라(경도·위도·높이m), 가로, 세로
GLOBE = [
    ('globe-cyclone', ['gk2aIR', 'cyclone', 'buoy'], (138, 22,   EXPLORE_H), 1280, 860),
    ('globe-gk2a',    ['gk2aIR'],                    (128, 26,   EXPLORE_H), 1280, 860),
    ('globe-wind',    ['wind'],                      (132, 24,   EXPLORE_H), 1280, 860),
    ('globe-temp',    ['temp'],                      (127.5, 35.0, 5_400_000), 1280, 860),
    ('globe-hazard',  ['quake', 'wildfire', 'tsunami'], (124, 34, EXPLORE_H), 1280, 860),
    ('globe-wave',    ['wave', 'buoy'],              (133, 31, 6_200_000), 1280, 860),
]
# 이름, 주소, 가로, 세로
PAGES = [
    ('page-verify',   'verify.html',   1280, 1560),
    ('page-research', 'research.html', 1280, 1560),
    ('page-station',  'station.html',  1280, 1440),
]


def seed(layers, target):
    st = {k: True for k in layers}
    return f'''<!doctype html><meta charset="utf-8"><script>
localStorage.setItem('earthus.coachDone','1');
localStorage.setItem('earthus.layerDefaultsVer','{DEFAULTS_VER}');
localStorage.setItem('earthus.layers', {json.dumps(json.dumps(st))});
sessionStorage.setItem('earthus.session','1');   // 없으면 위 설정이 지워진다
location.replace({json.dumps(target)});
</script>'''


def frame(seed_url, cam, w, h):
    """iframe 으로 띄우고, 뜨고 나서 같은 출처에서 카메라를 옮긴다.

    ⚠️ flyTo 를 쓰면 안 된다. 두 가지가 겹쳐서 절반이 실패했다 —
       ① 비행 애니메이션이 끝나기 전에 캡처가 끝난다
       ② requestRenderMode 라 비행이 끝나도 다시 그리지 않는다
       → setView 로 **즉시** 옮기고, power.animate 로 몇 초간 그리게 만든다.
       파고·기온 격자는 이걸 안 하면 카메라가 아예 안 움직인 그림이 나온다 (실제로 겪음).
    """
    lon, lat, height = cam
    return f'''<!doctype html><meta charset="utf-8">
<style>html,body{{margin:0;background:#000;overflow:hidden}}
iframe{{border:0;width:{w}px;height:{h}px;display:block}}</style>
<iframe id="f" src="{seed_url}"></iframe>
<script>
setTimeout(async () => {{
  const w = document.getElementById('f').contentWindow;
  try {{
    const V = await w.eval('import("/js/viewer.js")');
    const P = await w.eval('import("/js/power.js")');
    V.viewer.camera.setView({{
      destination: w.Cesium.Cartesian3.fromDegrees({lon}, {lat}, {height})
    }});
    P.power.animate(9000);          // 격자·입자가 실제로 그려질 시간
    document.title = 'OK';
  }} catch (e) {{ document.title = 'ERR ' + e.message; }}
}}, 14000);
</script>'''


def shoot(url, png, w, h, budget):
    subprocess.run([
        CHROME, '--headless=new',
        '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
        '--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist',
        '--disable-gpu-sandbox', '--hide-scrollbars',
        f'--window-size={w},{h}', f'--virtual-time-budget={budget}',
        f'--screenshot={png}', url,
    ], capture_output=True)
    return os.path.getsize(png) / 1024 if os.path.exists(png) else 0


def main():
    os.makedirs(OUT, exist_ok=True)
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT)],
                           cwd=PROTO, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    tmp = []
    try:
        for name, layers, cam, w, h in GLOBE:
            s, fr = f'_s_{name}.html', f'_f_{name}.html'
            io.open(os.path.join(PROTO, s), 'w', encoding='utf-8').write(seed(layers, '/index.html'))
            io.open(os.path.join(PROTO, fr), 'w', encoding='utf-8').write(frame('/' + s, cam, w, h))
            tmp += [s, fr]
            kb = shoot(f'http://localhost:{PORT}/{fr}', os.path.join(OUT, name + '.png'), w, h, 34000)
            print(f'  {name:16s} {kb:7.0f} KB  {"✓" if kb > 100 else "❌ 비었을 수 있음"}')

        for name, target, w, h in PAGES:
            s = f'_s_{name}.html'
            io.open(os.path.join(PROTO, s), 'w', encoding='utf-8').write(seed([], '/' + target))
            tmp.append(s)
            kb = shoot(f'http://localhost:{PORT}/{s}', os.path.join(OUT, name + '.png'), w, h, 22000)
            print(f'  {name:16s} {kb:7.0f} KB  {"✓" if kb > 40 else "❌ 비었을 수 있음"}')
    finally:
        for f in tmp:
            p = os.path.join(PROTO, f)
            if os.path.exists(p):
                os.remove(p)
        srv.terminate()


if __name__ == '__main__':
    main()
