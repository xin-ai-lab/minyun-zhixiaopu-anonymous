"""Double-click entry point with startup diagnostics and an explicit browser fallback."""
from pathlib import Path
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent
APP = ROOT if (ROOT / 'server.py').is_file() else ROOT / '01_源代码'

def open_browser(url):
    # The embedded Python runtime can fail to discover the Windows default browser.
    # Prefer an installed browser executable so double-click reliably opens a visible window.
    if os.name == 'nt':
        candidates = [
            Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')) / 'Google/Chrome/Application/chrome.exe',
            Path(os.environ.get('PROGRAMFILES(X86)', 'C:/Program Files (x86)')) / 'Microsoft/Edge/Application/msedge.exe',
            Path(os.environ.get('PROGRAMFILES', 'C:/Program Files')) / 'Microsoft/Edge/Application/msedge.exe',
        ]
        for browser in candidates:
            if browser.is_file():
                try:
                    subprocess.Popen([str(browser), '--new-window', url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    return True
                except OSError:
                    continue
        try:
            os.startfile(url)
            return True
        except OSError:
            pass
    try:
        return webbrowser.open(url)
    except webbrowser.Error:
        return False

def main():
    if not (APP / 'server.py').is_file():
        print('未找到完整作品。请先解压整个源码运行包，再双击“启动作品.cmd”。', flush=True)
        return 1
    log_dir = APP / 'var'
    try:
        log_dir.mkdir(parents=True, exist_ok=True)
        log_path = log_dir / ('startup-' + str(os.getpid()) + '.log')
        log = log_path.open('w', encoding='utf8')
    except OSError:
        print('当前目录不可写。请将完整文件夹解压到桌面等可写位置后重新启动。', flush=True)
        return 1
    print('正在启动闽韵智小铺，请稍候……', flush=True)
    try:
        child = subprocess.Popen([sys.executable, '-X', 'utf8', str(APP / 'server.py'), '--no-browser'],
                                 cwd=APP, stdout=log, stderr=log)
    except OSError as exc:
        log.close()
        print('无法启动本地服务：' + str(exc), flush=True)
        return 1
    url = None
    try:
        deadline = time.monotonic() + 18
        while time.monotonic() < deadline and child.poll() is None:
            text = log_path.read_text(encoding='utf8', errors='replace')
            match = re.search(r'MINYUN READY (http://127\.0\.0\.1:\d+)', text)
            if match:
                candidate = match.group(1)
                try:
                    with urllib.request.urlopen(candidate + '/api/health', timeout=1) as response:
                        if json.load(response).get('ok'):
                            url = candidate
                            break
                except (OSError, ValueError):
                    pass
            time.sleep(.12)
        if not url:
            print('启动未完成。错误信息如下：', flush=True)
            print(log_path.read_text(encoding='utf8', errors='replace')[-4000:], flush=True)
            print('请确认文件已完整解压，并且当前目录允许写入。', flush=True)
            return 1
        print('\n作品已就绪：' + url, flush=True)
        if not open_browser(url):
            print('浏览器未能自动打开，请复制上面的地址到 Chrome 或 Edge。', flush=True)
        print('演示期间保持此窗口运行；按 Ctrl+C 结束。\n', flush=True)
        try:
            return child.wait()
        except KeyboardInterrupt:
            return 0
    finally:
        if child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
        log.close()

if __name__ == '__main__':
    raise SystemExit(main())
