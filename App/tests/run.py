"""Suite con proyecto y volúmenes temporales: nunca usa los de ejecución normal."""
import json,os,socket,subprocess,sys,tempfile
from pathlib import Path
from uuid import uuid4
ROOT=Path(__file__).resolve().parents[1]
project='backend-test-'+uuid4().hex[:10]
handles=[]
for _ in range(3):
    handle=socket.socket();handle.bind(('127.0.0.1',0));handles.append(handle)
ports=[handle.getsockname()[1] for handle in handles]
with tempfile.TemporaryDirectory(prefix='stego-test-') as directory:
    override=Path(directory)/'compose.yml'
    override.write_text('services:\n  auth:\n    ports: !override ["127.0.0.1:%d:3001", "127.0.0.1:%d:3443"]\n  stego:\n    ports: !override ["127.0.0.1:%d:8000"]\n'%tuple(ports),encoding='utf-8')
    base=['docker','compose','--env-file','ms-users/.env','-p',project,'-f','docker-compose.yml','-f',str(override)]
    for handle in handles:handle.close()
    def compose(*args):subprocess.run(base+list(args),cwd=ROOT,check=True)
    try:
        compose('up','-d','--build','--wait','--wait-timeout','120')
        compose('exec','-T','auth','node','dist/database/seed.js')
        env={**os.environ,'BACKEND_TEST_PROJECT':project,'BACKEND_TEST_OVERRIDE':str(override)}
        subprocess.run([sys.executable,str(ROOT/'tests/integration.py')],cwd=ROOT,env=env,check=True)
    finally:
        # El nombre aleatorio creado arriba es el único objetivo de limpieza.
        compose('down','--volumes','--remove-orphans')
