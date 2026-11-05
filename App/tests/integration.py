import json,os,subprocess,time,hashlib,struct,zlib
from pathlib import Path
from uuid import uuid4
from datetime import datetime,timezone
import httpx,jwt
from dotenv import dotenv_values
ROOT=Path(__file__).resolve().parents[1]
PROJECT=os.environ.get('BACKEND_TEST_PROJECT','backend-v3-verify')
BASE=['docker','compose','--env-file','ms-users/.env','-p',PROJECT,'-f','docker-compose.yml','-f',os.environ.get('BACKEND_TEST_OVERRIDE','compose.test.yml')]
def compose(*args,check=True):
 r=subprocess.run(BASE+list(args),cwd=ROOT,capture_output=True,text=True,encoding='utf-8',errors='replace')
 if check and r.returncode:raise RuntimeError('Falló operación Compose: '+args[0])
 return r.stdout

def service_port(service,target):
 # Compose port falla con publicaciones aleatorias en algunas versiones; usar inspect.
 cid=compose('ps','-q',service).strip()
 info=json.loads(subprocess.check_output(['docker','inspect',cid],text=True))[0]
 return int(info['NetworkSettings']['Ports'][f'{target}/tcp'][0]['HostPort'])

def sql_count():
 return int(compose('exec','-T','stego','python','-c',"import sqlite3; print(sqlite3.connect('/data/stego.sqlite3').execute('SELECT COUNT(*) FROM analyses').fetchone()[0])").strip())

def run():
 env=dotenv_values(ROOT/'ms-users/.env');samples=ROOT/'docs/pruebas/muestras';evidence=[]
 auth=f'https://127.0.0.1:{service_port("auth",3443)}';stego=f'http://127.0.0.1:{service_port("stego",8000)}'
 client=httpx.Client(timeout=25,trust_env=False);ac=httpx.Client(base_url=auth,verify=str(ROOT/'ms-users/secrets/ca.crt'),timeout=10,trust_env=False)
 def record(label,fn):
  fn();evidence.append({'test':label,'result':'passed'});print(label+' OK',flush=True)
 def login(name):
  r=ac.post('/api/v1/auth/login',json={'identifier':name,'password':env['SEED_PASSWORD']});assert r.status_code==200,(name,r.status_code);return r.json()
 admin,analyst,user=login('jperez'),login('amendoza'),login('mgomez')
 a=admin['accessToken'];n=analyst['accessToken'];u=user['accessToken']
 def upload(token,file='original_control.png',data=None,filename=None,content_type='image/png',headers=None):
  h={'Authorization':'Bearer '+token,**(headers or {})} if token else (headers or {})
  return client.post(stego+'/api/v1/steganography/analyze',headers=h,files={'file':(filename or file,data if data is not None else (samples/file).read_bytes(),content_type)})
 def assert_status(r,code):assert r.status_code==code,(r.status_code,r.text[:120]);return r
 result_ids={}
 def autonomous():
  assert client.get(stego+'/health').status_code==200
  assert ac.get('/api/v1/health').status_code==200
  compose('stop','stego');assert ac.get('/api/v1/health').status_code==200
  compose('start','stego','--wait','--wait-timeout','45');assert client.get(stego+'/health').status_code==200
 record('T01 APIs y procesos autónomos',autonomous)
 def isolation():
  code="import os,socket,errno,json; from pathlib import Path; from app.worker import isolate; assert os.getuid()!=0; assert not any(k.startswith('DB_') for k in os.environ); assert not Path('/app/secrets/jwt-private.pem').exists(); assert not Path('/run/auth/jwt-private.pem').exists(); assert isolate(512,5,True); denied=False;\ntry: socket.socket()\nexcept OSError as error: denied=error.errno==errno.EPERM\nassert denied; print('nonroot_no_auth_db_no_private_key_network_denied')"
  assert 'network_denied' in compose('exec','-T','stego','python','-c',code)
 record('Aislamiento: no root, sin BD AUTH ni clave privada y socket denegado',isolation)
 record('T02 contraseña inválida denegada',lambda:assert_status(ac.post('/api/v1/auth/login',json={'identifier':'jperez','password':'incorrecta'}),401))
 def invalid_tokens():
  before=sql_count()
  for token in [None,'invalido',n[:-10]+'AAAAAAAAAA']:
   assert_status(upload(token),401)
  payload=jwt.decode(n,options={'verify_signature':False});payload['iat']=int(time.time())-1000;payload['exp']=int(time.time())-100
  expired=jwt.encode(payload,(ROOT/'ms-users/secrets/jwt-private.pem').read_bytes(),algorithm='RS256')
  assert_status(upload(expired),401)
  assert sql_count()==before
 record('T03 JWT ausente manipulado y vencido sin análisis',invalid_tokens)
 record('T04 USER denegado aun con cabecera de rol falsa',lambda:assert_status(upload(u,headers={'X-Roles':'ADMIN','X-User-Id':admin['user']['id']}),403))
 def nm():
  headers={'Authorization':'Bearer '+a}
  roles=ac.get('/api/v1/roles',headers=headers).json()['data'];rid=next(x['id'] for x in roles if x['rol']=='ANALYST')
  # cvega ya tiene USER+ANALYST y ANALYST se comparte con amendoza.
  users=ac.get('/api/v1/users',headers=headers).json()['data'];cv=next(x for x in users if x['username']=='cvega')
  pairs=ac.get('/api/v1/user-roles/user/'+cv['id'],headers=headers).json();assert len(pairs)==2
  assert_status(ac.post('/api/v1/user-roles',headers=headers,json={'userId':cv['id'],'roleId':rid}),409)
 record('T05 T06 N:M persistida y duplicado rechazado',nm)
 def analyze_pair():
  original=assert_status(upload(n),200).json();hidden=assert_status(upload(n,'oculta_lsb.png'),200).json()
  assert original['status']=='sin_indicios' and hidden['status']=='sospechoso',(original,hidden)
  assert hidden['action']=='cuarentena' and hidden['indicators']['sandbox_linux'] is True
  assert original['sha256']==hashlib.sha256((samples/'original_control.png').read_bytes()).hexdigest()
  assert original['user_id']==analyst['user']['id'];result_ids.update(original=original['analysis_id'],hidden=hidden['analysis_id'])
  extra={name:assert_status(upload(n,name),200).json() for name in ['oculta_baja_carga.png','ruido_sin_mensaje.png','pequena.png']}
  assert extra['oculta_baja_carga.png']['status']=='sin_indicios' and extra['ruido_sin_mensaje.png']['status']=='sospechoso' and extra['pequena.png']['status']=='no_concluyente'
  (ROOT/'docs/pruebas/resultados/stego-analisis-muestras.json').write_text(json.dumps({'original':original,'lsb':hidden,**extra},ensure_ascii=False,indent=2),encoding='utf-8')
 record('T09 análisis real de control y carga LSB con sandbox',analyze_pair)
 def bad_files():
  assert_status(upload(n,data=b'not-png'),415)
  assert_status(upload(n,filename='fake.jpg'),415)
  assert_status(upload(n,content_type='image/jpeg'),415)
  assert_status(upload(n,data=(samples/'original_control.png').read_bytes()[:40]),400)
  assert_status(upload(n,data=b'x'*(5242880+1)),413)
  header=bytearray((samples/'original_control.png').read_bytes());header[16:24]=struct.pack('>II',10000,10000);assert_status(upload(n,data=bytes(header)),413)
 record('T10 firma tipo extensión corrupción tamaño y dimensiones',bad_files)
 def ownership():
  identifier=result_ids['hidden']
  assert_status(client.get(stego+'/api/v1/steganography/results/'+identifier,headers={'Authorization':'Bearer '+n}),200)
  cv=login('cvega')['accessToken']
  assert_status(client.get(stego+'/api/v1/steganography/results/'+identifier,headers={'Authorization':'Bearer '+cv}),403)
  assert_status(client.get(stego+'/api/v1/steganography/results/'+identifier,headers={'Authorization':'Bearer '+a}),200)
 record('T11 propiedad de resultados aplicada',ownership)
 def revocation():
  h={'Authorization':'Bearer '+a};uid=analyst['user']['id']
  pair=ac.get('/api/v1/user-roles/user/'+uid,headers=h).json()[0]
  assert_status(ac.delete('/api/v1/user-roles/'+pair['id'],headers=h),204)
  before=sql_count();assert_status(upload(n),403);assert sql_count()==before
  assert_status(ac.post('/api/v1/user-roles',headers=h,json={'userId':uid,'roleId':pair['roleId']}),201)
 record('T07 revocación inmediata con mismo JWT',revocation)
 def auth_down():
  before=sql_count();compose('stop','auth')
  try:
   assert client.get(stego+'/health').status_code==200
   assert_status(upload(n),503);assert sql_count()==before
  finally:compose('start','auth','--wait','--wait-timeout','60')
 record('T08 AUTH caído no ejecuta análisis',auth_down)
 def logout():
  assert_status(ac.post('/api/v1/auth/logout',headers={'Authorization':'Bearer '+n}),204)
  before=sql_count();assert_status(upload(n),401);assert sql_count()==before
 record('Logout entre microservicios invalida mismo JWT',logout)
 def audit():
  raw=compose('exec','-T','stego','python','-c',"import sqlite3,json; d=sqlite3.connect('/data/stego.sqlite3'); d.row_factory=sqlite3.Row; print(json.dumps([dict(x) for x in d.execute('SELECT * FROM audit_events ORDER BY id')]))")
  rows=json.loads(raw);assert any(x['status_code']==503 for x in rows) and any(x['analysis_id'] for x in rows)
  for secret in [a,n,u,env['SEED_PASSWORD'],env['STEGO_SERVICE_TOKEN']]:assert secret not in raw
  (ROOT/'docs/pruebas/resultados/stego-auditoria.json').write_text(json.dumps(rows,indent=2),encoding='utf-8')
 record('T12 auditoría depurada de accesos y análisis',audit)
 # Reiniciar STEGO conserva SQLite, resultados y archivos en el volumen.
 def persistence():
  compose('restart','stego');
  for _ in range(30):
   try:
    if client.get(stego+'/health').status_code==200:break
   except httpx.HTTPError:pass
   time.sleep(1)
  assert_status(client.get(stego+'/api/v1/steganography/results/'+result_ids['hidden'],headers={'Authorization':'Bearer '+a}),200)
 record('Persistencia tras reiniciar STEGO',persistence)
 manifest={'executed_at':datetime.now(timezone.utc).isoformat(),'tests':evidence,'passed':len(evidence),'failed':0,'environment':'Dos imágenes y procesos reales, PostgreSQL 18 y SQLite separados; puertos y volúmenes temporales','real_stego':True}
 (ROOT/'docs/pruebas/resultados/integracion-auth-stego.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
 client.close();ac.close()
if __name__=='__main__':run()
