#!/usr/bin/env python3
"""개발용 정적 서버 — 캐시를 끈다.

ES 모듈은 브라우저가 공격적으로 캐시해서, 파일을 고쳐도 이전 코드가 계속 도는 일이 잦다.
(증상: 새 레이어를 추가했는데 안 보임, 고친 버그가 그대로 재현됨)
운영용이 아니라 개발 편의용이다.

    python3 devserver.py [포트]          PC 에서만 (127.0.0.1)
    python3 devserver.py [포트] --lan    같은 Wi-Fi 의 폰에서도 접속
    python3 devserver.py [포트] --tls    HTTPS. 폰에서 위치정보를 쓰려면 필요하다

⚠️ 위치정보(navigator.geolocation)는 "보안 컨텍스트"에서만 동작한다.
   localhost 는 예외로 허용되지만, http://192.168.x.x 는 아니다.
   그래서 폰에서 HTTP 로 열면 지구가 내 위치로 안 움직인다 (에러는 안 나고 조용히 null).
   위치정보까지 확인하려면 --tls 로 띄우고 인증서 경고를 한 번 승인해야 한다.
"""
import ipaddress
import socket
import ssl
import subprocess
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.md': 'text/markdown; charset=utf-8',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_header(self, keyword, value):
        # SimpleHTTPRequestHandler 가 붙이는 Last-Modified 를 없앤다 (304 방지)
        if keyword.lower() == 'last-modified':
            return
        super().send_header(keyword, value)

    def log_message(self, fmt, *args):
        if '304' in (args[1] if len(args) > 1 else ''):
            return
        super().log_message(fmt, *args)


def lan_ip():
    """이 맥의 LAN 주소. 밖으로 패킷을 보내지 않고 라우팅 테이블만 본다."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(('192.0.2.1', 1))     # TEST-NET-1, 실제로 안 나감
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


def ensure_cert(ip):
    """자체 서명 인증서. 없으면 만든다.

    SAN 에 IP 를 넣어야 한다 — 요즘 브라우저는 CN 을 안 본다.
    IP 가 바뀌면(다른 Wi-Fi) 인증서를 지우고 다시 만들어야 한다."""
    cert, key = Path('.devcert.pem'), Path('.devkey.pem')
    if cert.exists() and key.exists():
        out = subprocess.run(['openssl', 'x509', '-in', str(cert), '-noout', '-text'],
                             capture_output=True, text=True).stdout
        if not ip or f'IP Address:{ip}' in out:
            return cert, key
        print(f'▸ 인증서의 IP 가 바뀌었다 ({ip}). 다시 만든다.')

    san = 'DNS:localhost,IP:127.0.0.1' + (f',IP:{ip}' if ip else '')
    subprocess.run([
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', str(key), '-out', str(cert), '-days', '365',
        '-subj', '/CN=earthus-dev', '-addext', f'subjectAltName={san}',
    ], check=True, capture_output=True)
    print(f'▸ 자체 서명 인증서 생성 ({san})')
    return cert, key


def main():
    args = sys.argv[1:]
    tls = '--tls' in args
    lan = '--lan' in args or tls          # TLS 는 폰에서 쓰려는 것이므로 LAN 을 함께 연다
    ports = [a for a in args if a.isdigit()]
    port = int(ports[0]) if ports else 8787

    ip = lan_ip() if lan else None
    host = '0.0.0.0' if lan else '127.0.0.1'
    scheme = 'https' if tls else 'http'

    handler = partial(NoCacheHandler, directory='.')
    with ThreadingHTTPServer((host, port), handler) as httpd:
        if tls:
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            cert, key = ensure_cert(ip)
            ctx.load_cert_chain(cert, key)
            httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)

        print(f'earthus prototype  (캐시 없음)')
        print(f'  이 맥   → {scheme}://localhost:{port}')
        if lan and ip:
            print(f'  폰      → {scheme}://{ip}:{port}   (같은 Wi-Fi)')
            if not tls:
                print( '           ⚠️ HTTP 라 위치정보는 안 된다. 쓰려면 --tls')
            else:
                print( '           ⚠️ 인증서 경고가 뜬다. "자세히 → 이 웹사이트 방문"으로 통과')
        elif lan:
            print( '  ⚠️ LAN 주소를 못 찾았다 (Wi-Fi 연결 확인)')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\n종료')


if __name__ == '__main__':
    main()
