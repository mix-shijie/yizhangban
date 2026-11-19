"""本地预览：只监听 127.0.0.1（本机），不对外开放。用法：python tools/serve.py [--vertical] [--port 8765] [--no-browser]"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import argparse
import webbrowser

root = Path(__file__).resolve().parents[1]
ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=8765)
ap.add_argument('--vertical', action='store_true', help='打开 1080×1920 竖屏版')
ap.add_argument('--no-browser', action='store_true', help='不自动打开浏览器')
args = ap.parse_args()


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')  # 改完 config.json 刷新就生效
        super().end_headers()


for port in range(args.port, args.port + 10):
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(root)))
    except OSError:
        continue
    url = f'http://localhost:{port}/' + ('?vertical' if args.vertical else '')
    print('本地预览：', url, '\n保持这个窗口开着；按 Ctrl+C 停止。')
    if not args.no_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
    break
else:
    raise SystemExit(f'端口 {args.port}–{args.port + 9} 都被占用了，换一个 --port。')
