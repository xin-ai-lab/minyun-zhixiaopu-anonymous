"""Regression for a second launch when a local port is already occupied."""
from pathlib import Path
import json, os, socket, subprocess, sys, tempfile, time, unittest, urllib.request

ROOT=Path(__file__).resolve().parents[1]

class StartupTests(unittest.TestCase):
    def test_occupied_port_moves_to_next_listener(self):
        with tempfile.TemporaryDirectory(prefix='minyun-startup-') as tmp:
            logpath=Path(tmp)/'startup.txt'
            with socket.socket() as occupied:
                occupied.bind(('127.0.0.1',0));occupied.listen()
                base_port=occupied.getsockname()[1]
                env=dict(os.environ,MINYUN_DB=str(Path(tmp)/'test.sqlite3'))
                with logpath.open('w',encoding='utf8') as log:
                    proc=subprocess.Popen([sys.executable,'-X','utf8',str(ROOT/'server.py'),
                                           '--port',str(base_port),'--no-browser'],
                                          env=env,stdout=log,stderr=log)
                    try:
                        url=None
                        for _ in range(100):
                            text=logpath.read_text(encoding='utf8')
                            lines=[line for line in text.splitlines() if line.startswith('MINYUN READY ')]
                            if lines:url=lines[0].split()[-1];break
                            if proc.poll() is not None:break
                            time.sleep(.1)
                        self.assertIsNotNone(url,text)
                        self.assertNotEqual(int(url.rsplit(':',1)[1]),base_port)
                        with urllib.request.urlopen(url+'/api/health',timeout=3) as r:
                            self.assertTrue(json.load(r)['ok'])
                    finally:
                        proc.terminate();proc.wait(timeout=5)

if __name__=='__main__':unittest.main(verbosity=2)
